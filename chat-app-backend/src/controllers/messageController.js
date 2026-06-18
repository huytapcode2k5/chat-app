const { getPool } = require('../config/db');

async function getMessages(req, res) {
    const { conversationId } = req.params;
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const pool = getPool();

    // ── Kiểm tra thành viên + lấy ClearedAt (thời điểm user này đã "xoá đoạn chat") ──
    const memberCheck = await pool.request()
        .input('convId', conversationId)
        .input('userId', userId)
        .query(`SELECT ClearedAt FROM ConversationMembers WHERE ConversationID = @convId AND UserID = @userId`);
    if (memberCheck.recordset.length === 0)
        return res.status(403).json({ error: 'Bạn không phải thành viên' });

    const clearedAt = memberCheck.recordset[0].ClearedAt;

    // ── Đếm tổng để tính totalPages — áp dụng filter ClearedAt ──
    const countResult = await pool.request()
        .input('convId', conversationId)
        .input('clearedAt', clearedAt)
        .query(`SELECT COUNT(*) as total FROM Messages
                WHERE ConversationID = @convId AND IsDeleted = 0
                AND (@clearedAt IS NULL OR CreatedAt > @clearedAt)`);
    const total = countResult.recordset[0].total;

    const result = await pool.request()
        .input('convId', conversationId)
        .input('clearedAt', clearedAt)
        .input('limit', limit)
        .input('offset', offset)
        .query(`
            SELECT 
                m.MessageID, m.SenderID,
                u.Username AS SenderName,
                u.FullName AS SenderFullName,
                u.AvatarUrl AS SenderAvatar,
                m.Content, m.MessageType, m.IsEdited, m.IsDeleted,
                FORMAT(m.CreatedAt AT TIME ZONE 'UTC', 'yyyy-MM-ddTHH:mm:ss') + 'Z' AS CreatedAt,
                m.ReplyToMessageID,
                rm.Content AS ReplyContent,
                ru.Username AS ReplySenderName
            FROM Messages m
            LEFT JOIN Users u ON m.SenderID = u.UserID
            LEFT JOIN Messages rm ON m.ReplyToMessageID = rm.MessageID
            LEFT JOIN Users ru ON rm.SenderID = ru.UserID
            WHERE m.ConversationID = @convId AND m.IsDeleted = 0
            AND (@clearedAt IS NULL OR m.CreatedAt > @clearedAt)
            ORDER BY m.CreatedAt ASC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

    const msgIds = result.recordset.map(m => m.MessageID);
    let attachMap = {};
    if (msgIds.length > 0) {
        const attachResult = await pool.request()
            .query(`SELECT MessageID, AttachmentID, FileName, FileUrl, FileSize, FileType
                    FROM Attachments WHERE MessageID IN (${msgIds.join(',')})`);
        for (const a of attachResult.recordset) {
            if (!attachMap[a.MessageID]) attachMap[a.MessageID] = [];
            attachMap[a.MessageID].push({
                attachmentID: a.AttachmentID,
                fileName: a.FileName,
                fileUrl: a.FileUrl,
                fileSize: a.FileSize,
                fileType: a.FileType,
            });
        }
    }

    res.json({
        items: result.recordset.map(m => ({
            messageID: m.MessageID,
            conversationID: Number(conversationId),
            sender: m.SenderID ? {
                userID: m.SenderID,
                username: m.SenderName,
                fullName: m.SenderFullName,
                avatarUrl: m.SenderAvatar,
            } : null,
            content: m.Content,
            messageType: m.MessageType,
            isEdited: m.IsEdited,
            isDeleted: m.IsDeleted,
            createdAt: m.CreatedAt,
            replyTo: m.ReplyToMessageID ? {
                messageID: m.ReplyToMessageID,
                content: m.ReplyContent,
                sender: { username: m.ReplySenderName }
            } : null,
            attachments: attachMap[m.MessageID] || [],
            reactions: []
        })),
        page,
        totalPages: Math.ceil(total / limit),
        total
    });
}

async function sendMessage(req, res) {
    const { conversationId, content, messageType = 'Text' } = req.body;
    const senderId = req.userId;
    const pool = getPool();
    const transaction = pool.transaction();
    await transaction.begin();
    try {
        const msgResult = await transaction.request()
            .input('convId', conversationId)
            .input('senderId', senderId)
            .input('content', content)
            .input('msgType', messageType)
            .query(`INSERT INTO Messages (ConversationID, SenderID, Content, MessageType) OUTPUT INSERTED.MessageID VALUES (@convId, @senderId, @content, @msgType)`);
        const messageId = msgResult.recordset[0].MessageID;
        const members = await transaction.request()
            .input('convId', conversationId)
            .query(`SELECT UserID FROM ConversationMembers WHERE ConversationID = @convId`);
        for (const member of members.recordset) {
            await transaction.request()
                .input('msgId', messageId)
                .input('userId', member.UserID)
                .query(`INSERT INTO MessageStatus (MessageID, UserID) VALUES (@msgId, @userId)`);
        }
        await transaction.commit();
        const newMsg = { MessageID: messageId, SenderID: senderId, Content: content, CreatedAt: new Date(), MessageType: messageType };
        res.status(201).json(newMsg);
    } catch (err) {
        await transaction.rollback();
        res.status(500).json({ error: 'Gửi tin nhắn thất bại' });
    }
}

async function markAsSeen(req, res) {
    const { messageId } = req.params;
    const userId = req.userId;
    const pool = getPool();
    await pool.request()
        .input('msgId', messageId)
        .input('userId', userId)
        .query(`UPDATE MessageStatus SET IsSeen = 1, SeenAt = GETDATE() WHERE MessageID = @msgId AND UserID = @userId`);
    res.json({ success: true });
}

module.exports = { getMessages, sendMessage, markAsSeen };