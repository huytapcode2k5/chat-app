const express = require('express');
const { getPool } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/notifications
router.get('/', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('userId', req.userId)
            .query(`SELECT TOP 50
    NotificationID  AS notificationID,
    Title           AS title,
    Content         AS content,
    IsRead          AS isRead,
    CreatedAt       AS createdAt
    FROM Notifications
    WHERE UserID = @userId
    ORDER BY CreatedAt DESC`);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/notifications/read-all
router.put('/read-all', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        await pool.request()
            .input('userId', req.userId)
            .query(`UPDATE Notifications SET IsRead=1
                    WHERE UserID=@userId AND IsRead=0`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        await pool.request()
            .input('id', req.params.id).input('userId', req.userId)
            .query(`UPDATE Notifications SET IsRead=1
                    WHERE NotificationID=@id AND UserID=@userId`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;