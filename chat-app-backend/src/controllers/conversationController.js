const { getPool } = require('../config/db');


async function createConversation(req, res) {
    const {
        type, memberIDs, groupName,
        userIds, name, conversationType
    } = req.body;

    // Normalize — dùng các biến này xuyên suốt
    const convType = type || conversationType || 'Direct';
    const convName = groupName || name || null;
    const members = memberIDs || userIds || [];
    const creatorId = req.userId;
    const pool = getPool();
    const transaction = pool.transaction();

    await transaction.begin();
    try {
        const convResult = await transaction.request()
            .input('type', convType)   // ← dùng convType
            .input('name', convName)   // ← dùng convName
            .input('createdBy', creatorId)
            .query(`INSERT INTO Conversations (ConversationType, Name, CreatedBy)
                    OUTPUT INSERTED.ConversationID
                    VALUES (@type, @name, @createdBy)`);

        const convId = convResult.recordset[0].ConversationID;

        await transaction.request()
            .input('convId', convId)
            .input('userId', creatorId)
            .query(`INSERT INTO ConversationMembers (ConversationID, UserID, RoleName)
                    VALUES (@convId, @userId, 'Admin')`);

        for (const uid of members) {        // ← dùng members
            if (uid !== creatorId) {
                await transaction.request()
                    .input('convId', convId)
                    .input('userId', uid)
                    .query(`INSERT INTO ConversationMembers (ConversationID, UserID)
                            VALUES (@convId, @userId)`);
            }
        }

        await transaction.commit();

        // Trả về đầy đủ để frontend dùng ngay không cần fetch lại
        const newConv = await pool.request()
            .input('convId', convId)
            .input('userId', creatorId)
            .query(`SELECT c.ConversationID, c.ConversationType, c.Name, c.AvatarUrl,
                           u.UserID AS MemberUserID, u.Username, u.FullName,
                           u.AvatarUrl AS MemberAvatar, u.IsOnline, cm.RoleName
                    FROM Conversations c
                    JOIN ConversationMembers cm ON cm.ConversationID = c.ConversationID
                    JOIN Users u ON u.UserID = cm.UserID
                    WHERE c.ConversationID = @convId`);

        const rows = newConv.recordset;
        const conv = {
            conversationID: rows[0].ConversationID,
            conversationType: rows[0].ConversationType,
            name: rows[0].Name,
            avatarUrl: rows[0].AvatarUrl,
            lastMessage: null,
            members: rows.map(r => ({
                userID: r.MemberUserID,
                username: r.Username,
                fullName: r.FullName,
                avatarUrl: r.MemberAvatar,
                isOnline: r.IsOnline,
                role: r.RoleName || 'Member',
            })),
        };

        // Emit cho tất cả thành viên trong nhóm (trừ người tạo đã có rồi)
        const io = req.app.get('io');
        if (io) {
            for (const member of conv.members) {
                if (member.userID !== creatorId) {
                    io.to(`user_${member.userID}`).emit('NewConversation', conv);
                }
            }
        }

        res.status(201).json(conv);
    } catch (err) {
        await transaction.rollback();
        console.error('createConversation error:', err.message);
        res.status(500).json({ error: 'Không thể tạo cuộc trò chuyện' });
    }
}
async function getConversations(req, res) {
    const userId = req.userId;
    const pool = getPool();
    try {
        const result = await pool.request()
            .input('userId', userId)
            .query(`
                SELECT c.ConversationID, c.ConversationType, c.Name, c.AvatarUrl,
                    lm.MessageID AS LM_ID, lm.Content AS LM_Content,
                    lm.CreatedAt AS LM_CreatedAt, lm.IsDeleted AS LM_IsDeleted
                FROM Conversations c
                JOIN ConversationMembers cm ON c.ConversationID=cm.ConversationID
                OUTER APPLY (
                    SELECT TOP 1 MessageID, Content, CreatedAt, IsDeleted
                    FROM Messages WHERE ConversationID=c.ConversationID
                    ORDER BY CreatedAt DESC
                ) lm
                WHERE cm.UserID=@userId
                ORDER BY COALESCE(lm.CreatedAt, c.CreatedAt) DESC
            `);

        const convIds = result.recordset.map(r => r.ConversationID);
        if (!convIds.length) return res.json([]);

        // ✅ Query members riêng
        const membersResult = await pool.request()
            .query(`SELECT cm.ConversationID, u.UserID, u.Username, u.FullName, u.AvatarUrl, u.IsOnline,
                           cm.RoleName
                    FROM ConversationMembers cm
                    JOIN Users u ON u.UserID=cm.UserID
                    WHERE cm.ConversationID IN (${convIds.join(',')})`);

        const membersByConv = {};
        for (const m of membersResult.recordset) {
            if (!membersByConv[m.ConversationID]) membersByConv[m.ConversationID] = [];
            membersByConv[m.ConversationID].push({
                userID: m.UserID, username: m.Username,
                fullName: m.FullName, avatarUrl: m.AvatarUrl,
                isOnline: m.IsOnline, role: m.RoleName || 'Member'
            });
        }

        res.json(result.recordset.map(c => ({
            conversationID: c.ConversationID,
            conversationType: c.ConversationType,
            name: c.Name,
            avatarUrl: c.AvatarUrl,
            members: membersByConv[c.ConversationID] || [],
            lastMessage: c.LM_ID ? {
                messageID: c.LM_ID, content: c.LM_Content,
                createdAt: c.LM_CreatedAt, isDeleted: c.LM_IsDeleted
            } : null
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}
module.exports = { getConversations, createConversation };