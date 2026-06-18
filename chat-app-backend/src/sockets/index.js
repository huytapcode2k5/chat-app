const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { getPool } = require('../config/db');

function initSocket(server) {
    const io = new Server(server, { cors: { origin: '*' } });

    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Auth error'));
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.data.userId = decoded.userId;

            const pool = getPool();

            // Lấy username/fullName để dùng cho typing indicator và các emit khác
            const userResult = await pool.request()
                .input('userId', decoded.userId)
                .query(`SELECT Username, FullName FROM Users WHERE UserID = @userId`);
            socket.data.username = userResult.recordset[0]?.FullName || userResult.recordset[0]?.Username || 'User';

            await pool.request()
                .input('userId', decoded.userId)
                .query(`UPDATE Users SET IsOnline = 1, LastSeen = GETDATE() WHERE UserID = @userId`);
            next();
        } catch {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', async (socket) => {
        const userId = socket.data.userId;
        const username = socket.data.username;

        socket.join(`user_${userId}`);

        // Tự động join tất cả các room socket của các cuộc trò chuyện mà user là thành viên
        try {
            const pool = getPool();
            const userConvs = await pool.request()
                .input('userId', userId)
                .query(`SELECT ConversationID FROM ConversationMembers WHERE UserID = @userId`);
            for (const c of userConvs.recordset) {
                socket.join(`conv_${c.ConversationID}`);
            }
        } catch (err) {
            console.error('Error auto-joining sockets on connect:', err.message);
        }

        broadcastOnlineStatus(io, userId, true);

        socket.on('edit_message', async (messageID, newContent) => {
            try {
                const pool = getPool();
                const check = await pool.request()
                    .input('msgId', messageID).input('userId', userId)
                    .query(`SELECT ConversationID FROM Messages WHERE MessageID=@msgId AND SenderID=@userId AND IsDeleted=0`);
                if (!check.recordset.length) return;
                const { ConversationID } = check.recordset[0];
                await pool.request().input('msgId', messageID).input('content', newContent)
                    .query(`UPDATE Messages SET Content=@content, IsEdited=1 WHERE MessageID=@msgId`);
                io.to(`conv_${ConversationID}`).emit('MessageEdited', { messageID, newContent });
            } catch (err) {
                console.error('edit_message error:', err.message);
            }
        });

        socket.on('delete_message', async (messageID) => {
            try {
                const pool = getPool();
                const check = await pool.request()
                    .input('msgId', messageID).input('userId', userId)
                    .query(`SELECT ConversationID FROM Messages WHERE MessageID=@msgId AND SenderID=@userId`);
                if (!check.recordset.length) return;
                const { ConversationID } = check.recordset[0];
                await pool.request().input('msgId', messageID)
                    .query(`UPDATE Messages SET IsDeleted=1, Content=NULL WHERE MessageID=@msgId`);
                io.to(`conv_${ConversationID}`).emit('MessageDeleted', { messageID });
            } catch (err) {
                console.error('delete_message error:', err.message);
            }
        });

        socket.on('mark_seen', async (conversationID, lastMessageID) => {
            try {
                const pool = getPool();
                await pool.request()
                    .input('convId', conversationID).input('userId', userId).input('lastMsgId', lastMessageID)
                    .query(`UPDATE MessageStatus SET IsSeen=1, SeenAt=GETDATE()
                    WHERE UserID=@userId AND MessageID <= @lastMsgId
                    AND MessageID IN (SELECT MessageID FROM Messages WHERE ConversationID=@convId)`);
                io.to(`conv_${conversationID}`).emit('MessageSeen', {
                    messageID: lastMessageID, seenByUserID: userId, seenAt: new Date()
                });
            } catch (err) {
                console.error('mark_seen error:', err.message);
            }
        });

        socket.on('join_conversation', (convId) => {
            socket.join(`conv_${convId}`);
        });

        socket.on('leave_conversation', (convId) => {
            socket.leave(`conv_${convId}`);
        });

        socket.on('send_message', async (data) => {
            try {
                const conversationId = data.conversationId || data.conversationID;
                const {
                    content,
                    messageType = 'Text',
                    replyToMessageID = null,
                    attachmentUrls = [],
                    fileName = null,
                    fileSize = 0,
                    fileType = 'file',
                } = data;

                const pool = getPool();

                // ── Kiểm tra block (chỉ áp dụng phòng Direct 1-1) ──────────────
                const convCheck = await pool.request()
                    .input('convId', conversationId)
                    .query(`SELECT ConversationType FROM Conversations WHERE ConversationID=@convId`);

                if (convCheck.recordset[0]?.ConversationType === 'Direct') {
                    const members = await pool.request()
                        .input('convId', conversationId)
                        .query(`SELECT UserID FROM ConversationMembers WHERE ConversationID=@convId`);
                    const otherId = members.recordset.find(m => m.UserID !== userId)?.UserID;

                    if (otherId) {
                        const blocked = await pool.request()
                            .input('a', userId).input('b', otherId)
                            .query(`SELECT 1 FROM BlockedUsers
                                    WHERE (BlockerID=@a AND BlockedID=@b) OR (BlockerID=@b AND BlockedID=@a)`);

                        if (blocked.recordset.length > 0) {
                            socket.emit('error', { message: 'Không thể gửi tin nhắn — đã bị chặn' });
                            return;
                        }
                    }
                }

                const msgResult = await pool.request()
                    .input('convId', conversationId)
                    .input('senderId', userId)
                    .input('content', content)
                    .input('msgType', messageType)
                    .input('replyId', replyToMessageID)
                    .query(`
                INSERT INTO Messages (ConversationID, SenderID, Content, MessageType, ReplyToMessageID)
                OUTPUT INSERTED.MessageID
                VALUES (@convId, @senderId, @content, @msgType, @replyId)
            `);
                const messageId = msgResult.recordset[0].MessageID;

                const senderResult = await pool.request()
                    .input('uid', userId)
                    .query(`SELECT Username, FullName, AvatarUrl FROM Users WHERE UserID = @uid`);
                const senderInfo = senderResult.recordset[0];

                const savedAttachments = [];
                if (attachmentUrls.length > 0) {
                    for (const url of attachmentUrls) {
                        if (!url) continue;
                        const resolvedName = fileName || url.split('/').pop();
                        const resolvedType = fileType !== 'file'
                            ? fileType
                            : /\.(jpg|jpeg|png|gif|webp)$/i.test(url) ? 'image' : 'file';
                        await pool.request()
                            .input('msgId', messageId)
                            .input('fname', resolvedName)
                            .input('furl', url)
                            .input('fsize', fileSize)
                            .input('ftype', resolvedType)
                            .query(`INSERT INTO Attachments (MessageID, FileName, FileUrl, FileSize, FileType)
                            VALUES (@msgId, @fname, @furl, @fsize, @ftype)`);
                        savedAttachments.push({
                            fileName: resolvedName,
                            fileUrl: url,
                            fileSize,
                            fileType: resolvedType,
                        });
                    }
                }

                const members = await pool.request()
                    .input('convId', conversationId)
                    .query(`SELECT UserID FROM ConversationMembers WHERE ConversationID = @convId`);
                for (const m of members.recordset) {
                    await pool.request()
                        .input('msgId', messageId)
                        .input('uid', m.UserID)
                        .query(`INSERT INTO MessageStatus (MessageID, UserID) VALUES (@msgId, @uid)`);
                }

                const newMessage = {
                    messageID: messageId,
                    conversationID: conversationId,
                    sender: {
                        userID: userId,
                        username: senderInfo.Username,
                        fullName: senderInfo.FullName,
                        avatarUrl: senderInfo.AvatarUrl,
                    },
                    content,
                    messageType,
                    createdAt: new Date(),
                    isEdited: false,
                    isDeleted: false,
                    replyToMessageID,
                    attachments: savedAttachments,
                    reactions: [],
                };

                io.to(`conv_${conversationId}`).emit('NewMessage', { message: newMessage });

            } catch (err) {
                console.error('send_message error:', err.message);
            }
        });

        socket.on('typing', (conversationId, isTyping) => {
            socket.to(`conv_${conversationId}`).emit('Typing', {
                conversationID: conversationId,
                userID: userId,
                username,
                isTyping
            });
        });

        socket.on('react_to_message', async (messageID, emoji) => {
            try {
                const pool = getPool();
                const existing = await pool.request()
                    .input('msgId', messageID).input('uid', userId).input('emoji', emoji)
                    .query(`SELECT 1 FROM MessageReactions WHERE MessageID=@msgId AND UserID=@uid AND Emoji=@emoji`);

                if (existing.recordset.length > 0) {
                    await pool.request()
                        .input('msgId', messageID).input('uid', userId).input('emoji', emoji)
                        .query(`DELETE FROM MessageReactions WHERE MessageID=@msgId AND UserID=@uid AND Emoji=@emoji`);
                } else {
                    await pool.request()
                        .input('msgId', messageID).input('uid', userId).input('emoji', emoji)
                        .query(`INSERT INTO MessageReactions (MessageID, UserID, Emoji) VALUES (@msgId, @uid, @emoji)`);
                }

                const countResult = await pool.request()
                    .input('msgId', messageID).input('emoji', emoji)
                    .query(`SELECT COUNT(*) as cnt FROM MessageReactions WHERE MessageID=@msgId AND Emoji=@emoji`);

                const count = countResult.recordset[0].cnt;
                const convResult = await pool.request()
                    .input('msgId', messageID)
                    .query(`SELECT ConversationID FROM Messages WHERE MessageID=@msgId`);
                const { ConversationID } = convResult.recordset[0];

                io.to(`conv_${ConversationID}`).emit('Reaction', { messageID, emoji, userID: userId, count });
            } catch (err) {
                console.error('react_to_message error:', err.message);
            }
        });

        socket.on('disconnect', async () => {
            try {
                const pool = getPool();
                await pool.request()
                    .input('userId', userId)
                    .query(`UPDATE Users SET IsOnline = 0, LastSeen = GETDATE() WHERE UserID = @userId`);
                broadcastOnlineStatus(io, userId, false);
            } catch (err) {
                console.error('disconnect error:', err.message);
            }
        });
    });

    return io;
}

async function broadcastOnlineStatus(io, userId, isOnline) {
    try {
        const pool = getPool();
        const friends = await pool.request()
            .input('userId', userId)
            .query(`
          SELECT User2ID AS FriendID FROM Friends WHERE User1ID = @userId
          UNION
          SELECT User1ID FROM Friends WHERE User2ID = @userId
        `);
        for (const f of friends.recordset) {
            io.to(`user_${f.FriendID}`).emit('UserOnline', { userID: userId, isOnline, lastSeen: new Date() });
        }
    } catch (err) {
        console.error('broadcastOnlineStatus error:', err.message);
    }
}

module.exports = { initSocket };