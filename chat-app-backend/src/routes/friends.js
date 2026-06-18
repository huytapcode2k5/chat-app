const express = require('express');
const { getPool } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/friends  — danh sách bạn bè
router.get('/', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('userId', req.userId)
            .query(`SELECT
                u.UserID    AS userID,
                u.Username  AS username,
                u.FullName  AS fullName,
                u.AvatarUrl AS avatarUrl,
                u.IsOnline  AS isOnline,
                u.LastSeen  AS lastSeen
            FROM Friends f
            JOIN Users u ON u.UserID = CASE WHEN f.User1ID=@userId THEN f.User2ID ELSE f.User1ID END
            WHERE (f.User1ID=@userId OR f.User2ID=@userId)`);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/friends/requests  — lời mời đang chờ
router.get('/requests', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('userId', req.userId)
            .query(`SELECT fr.RequestID, fr.SenderID, fr.CreatedAt,
                           u.Username, u.FullName, u.AvatarUrl
                    FROM FriendRequests fr
                    JOIN Users u ON u.UserID = fr.SenderID
                    WHERE fr.ReceiverID = @userId AND fr.Status = 'Pending'`);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/friends/request/:targetId  — gửi lời mời
router.post('/request/:targetId', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        // Check đã là bạn chưa
        const exists = await pool.request()
            .input('u1', req.userId).input('u2', req.params.targetId)
            .query(`SELECT 1 FROM FriendRequests
                    WHERE ((SenderID=@u1 AND ReceiverID=@u2) OR (SenderID=@u2 AND ReceiverID=@u1))
                    AND Status='Pending'`);
        if (exists.recordset.length > 0)
            return res.status(400).json({ error: 'Đã gửi lời mời rồi' });

        const reqResult = await pool.request()
            .input('sender', req.userId)
            .input('receiver', req.params.targetId)
            .query(`INSERT INTO FriendRequests (SenderID, ReceiverID, Status)
            OUTPUT INSERTED.RequestID
            VALUES (@sender, @receiver, 'Pending')`);

        // Lấy tên người gửi
        const senderInfo = await pool.request()
            .input('userId', req.userId)
            .query('SELECT FullName, Username FROM Users WHERE UserID = @userId');
        const senderName = senderInfo.recordset[0]?.FullName || senderInfo.recordset[0]?.Username;

        // Tạo notification trong DB
        await pool.request()
            .input('userId', req.params.targetId)
            .input('title', `${senderName} gửi lời mời kết bạn`)
            .input('content', `${senderName} muốn kết bạn với bạn`)
            .query(`INSERT INTO Notifications (UserID, Title, Content, IsRead)
            VALUES (@userId, @title, @content, 0)`);

        // Emit socket real-time đến người nhận
        const io = req.app.get('io');
        if (io) {
            io.to(`user_${req.params.targetId}`).emit('Notification', {
                title: `${senderName} gửi lời mời kết bạn`,
                content: `${senderName} muốn kết bạn với bạn`,
                isRead: false,
                createdAt: new Date(),
            });
            io.to(`user_${req.params.targetId}`).emit('FriendRequest', {
                requestID: reqResult.recordset[0].RequestID,
                senderID: req.userId,
            });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/friends/accept/:requestId
router.put('/accept/:requestId', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        const reqRow = await pool.request()
            .input('id', req.params.requestId).input('receiver', req.userId)
            .query(`SELECT * FROM FriendRequests WHERE RequestID=@id AND ReceiverID=@receiver AND Status='Pending'`);
        if (reqRow.recordset.length === 0)
            return res.status(404).json({ error: 'Không tìm thấy lời mời' });

        const { SenderID } = reqRow.recordset[0];
        const t = pool.transaction();
        await t.begin();
        await t.request()
            .input('id', req.params.requestId)
            .query(`UPDATE FriendRequests SET Status='Accepted' WHERE RequestID=@id`);
        await t.request()
            .input('u1', Math.min(SenderID, req.userId))
            .input('u2', Math.max(SenderID, req.userId))
            .query(`IF NOT EXISTS (SELECT 1 FROM Friends WHERE User1ID=@u1 AND User2ID=@u2)
                    INSERT INTO Friends (User1ID, User2ID) VALUES (@u1, @u2)`);
        await t.commit();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/friends/reject/:requestId
router.delete('/reject/:requestId', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        await pool.request()
            .input('id', req.params.requestId).input('receiver', req.userId)
            .query(`UPDATE FriendRequests SET Status='Rejected'
                    WHERE RequestID=@id AND ReceiverID=@receiver`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;