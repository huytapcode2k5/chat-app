const express = require('express');
const { getConversations, createConversation } = require('../controllers/conversationController');
const { authenticate } = require('../middleware/auth');
const { getPool } = require('../config/db');
const router = express.Router();

router.get('/', authenticate, getConversations);
router.post('/', authenticate, createConversation);

// POST /api/conversations/:id/clear — xoá tin nhắn ở PHÍA MÌNH (không xoá thật, chỉ ẩn)
router.post('/:id/clear', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        const convId = req.params.id;
        // Lưu thời điểm "xoá" — các tin nhắn trước thời điểm này sẽ bị ẩn với user này
        await pool.request()
            .input('convId', convId)
            .input('userId', req.userId)
            .query(`
                IF EXISTS (SELECT 1 FROM ConversationMembers WHERE ConversationID=@convId AND UserID=@userId)
                UPDATE ConversationMembers
                SET ClearedAt = GETDATE()
                WHERE ConversationID=@convId AND UserID=@userId
            `);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/conversations/:id/leave — rời nhóm
router.post('/:id/leave', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        const io = req.app.get('io');
        const convId = req.params.id;
        const userId = req.userId;

        const userInfo = await pool.request()
            .input('userId', userId)
            .query(`SELECT Username, FullName FROM Users WHERE UserID = @userId`);
        const leaverName = userInfo.recordset[0]?.FullName || userInfo.recordset[0]?.Username || 'Người dùng';

        // ✅ Emit TRƯỚC khi xoá — để chính người rời vẫn còn trong socket room và nhận được event
        if (io) {
            io.to(`conv_${convId}`).emit('MemberLeft', {
                conversationID: Number(convId),
                userID: Number(userId),
                userName: leaverName,
                action: 'left',
            });
            try {
                const sockets = await io.in(`user_${userId}`).fetchSockets();
                for (const s of sockets) {
                    s.leave(`conv_${convId}`);
                }
            } catch (err) {
                console.error('Socket leave room error on leave:', err.message);
            }
        }

        // Xoá sau emit
        await pool.request()
            .input('convId', convId)
            .input('userId', userId)
            .query('DELETE FROM ConversationMembers WHERE ConversationID=@convId AND UserID=@userId');

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/conversations/:id/members — thêm thành viên vào nhóm
router.post('/:id/members', authenticate, async (req, res) => {
    try {
        const { memberIDs } = req.body;
        const pool = getPool();
        const io = req.app.get('io');
        const convId = req.params.id;

        for (const uid of memberIDs) {
            await pool.request()
                .input('convId', convId)
                .input('userId', uid)
                .query(`IF NOT EXISTS (SELECT 1 FROM ConversationMembers WHERE ConversationID=@convId AND UserID=@userId)
                        INSERT INTO ConversationMembers (ConversationID, UserID, RoleName) VALUES (@convId, @userId, 'Member')`);
        }

        const membersResult = await pool.request()
            .input('convId', convId)
            .query(`SELECT u.UserID, u.Username, u.FullName, u.AvatarUrl, u.IsOnline, cm.RoleName
                    FROM ConversationMembers cm
                    JOIN Users u ON u.UserID = cm.UserID
                    WHERE cm.ConversationID = @convId`);

        const members = membersResult.recordset.map(m => ({
            userID: m.UserID, username: m.Username,
            fullName: m.FullName, avatarUrl: m.AvatarUrl,
            isOnline: m.IsOnline, role: m.RoleName || 'Member',
        }));

        // ✅ Emit MembersAdded cho tất cả thành viên đang trong room
        if (io) {
            io.to(`conv_${convId}`).emit('MembersAdded', {
                conversationID: Number(convId),
                members,
            });
            // Thông báo cho thành viên mới — để họ hiển thị nhóm trong sidebar
            const convInfo = await pool.request()
                .input('convId', convId)
                .query(`SELECT ConversationType, Name, AvatarUrl FROM Conversations WHERE ConversationID=@convId`);
            const conv = convInfo.recordset[0];
            for (const uid of memberIDs) {
                io.to(`user_${uid}`).emit('NewConversation', {
                    conversationID: Number(convId),
                    conversationType: conv?.ConversationType,
                    name: conv?.Name,
                    avatarUrl: conv?.AvatarUrl,
                    members,
                    lastMessage: null,
                });
            }
        }

        res.json({ members });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.delete('/:id/members/:userId', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        const io = req.app.get('io');
        const convId = req.params.id;
        const targetUserId = parseInt(req.params.userId);
        const requesterId = req.userId;

        if (targetUserId === requesterId) {
            return res.status(400).json({ error: 'Dùng chức năng "Rời nhóm" để tự rời, không thể tự kick mình' });
        }

        const roleCheck = await pool.request()
            .input('convId', convId)
            .input('userId', requesterId)
            .query(`SELECT RoleName FROM ConversationMembers WHERE ConversationID=@convId AND UserID=@userId`);

        if (!roleCheck.recordset.length) {
            return res.status(403).json({ error: 'Bạn không phải thành viên của nhóm này' });
        }
        if (roleCheck.recordset[0].RoleName !== 'Admin') {
            return res.status(403).json({ error: 'Chỉ trưởng nhóm mới có quyền xoá thành viên' });
        }

        const targetInfo = await pool.request()
            .input('userId', targetUserId)
            .query(`SELECT Username, FullName FROM Users WHERE UserID = @userId`);
        const kickedName = targetInfo.recordset[0]?.FullName || targetInfo.recordset[0]?.Username || 'Người dùng';

        // ✅ Emit TRƯỚC khi xoá DB — người bị kick còn trong socket room và nhận được event ngay
        if (io) {
            io.to(`conv_${convId}`).emit('MemberLeft', {
                conversationID: Number(convId),
                userID: Number(targetUserId),
                userName: kickedName,
                action: 'kicked',
            });
            io.to(`user_${targetUserId}`).emit('RemovedFromGroup', { conversationID: Number(convId) });
            try {
                const sockets = await io.in(`user_${targetUserId}`).fetchSockets();
                for (const s of sockets) {
                    s.leave(`conv_${convId}`);
                }
            } catch (err) {
                console.error('Socket leave room error on kick:', err.message);
            }
        }

        await pool.request()
            .input('convId', convId)
            .input('userId', targetUserId)
            .query('DELETE FROM ConversationMembers WHERE ConversationID=@convId AND UserID=@userId');

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;