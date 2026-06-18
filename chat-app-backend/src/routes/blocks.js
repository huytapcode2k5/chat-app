const express = require('express');
const { getPool } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/blocks — danh sách userID mình đã chặn
router.get('/', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('userId', req.userId)
            .query(`
                SELECT BlockedID, 'byMe' AS Direction FROM BlockedUsers WHERE BlockerID = @userId
                UNION ALL
                SELECT BlockerID, 'ofMe' AS Direction FROM BlockedUsers WHERE BlockedID = @userId
            `);

        const blockedByMe = result.recordset.filter(r => r.Direction === 'byMe').map(r => r.BlockedID);
        const blockedMe = result.recordset.filter(r => r.Direction === 'ofMe').map(r => r.BlockedID);

        res.json({ blockedByMe, blockedMe });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/blocks/:targetId — chặn
router.post('/:targetId', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        const targetId = parseInt(req.params.targetId);
        await pool.request()
            .input('blocker', req.userId)
            .input('blocked', targetId)
            .query(`IF NOT EXISTS (SELECT 1 FROM BlockedUsers WHERE BlockerID=@blocker AND BlockedID=@blocked)
                    INSERT INTO BlockedUsers (BlockerID, BlockedID) VALUES (@blocker, @blocked)`);

        const io = req.app.get('io');
        if (io) io.to(`user_${targetId}`).emit('GotBlocked', { byUserID: req.userId });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:targetId', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        const targetId = parseInt(req.params.targetId);
        await pool.request()
            .input('blocker', req.userId)
            .input('blocked', targetId)
            .query('DELETE FROM BlockedUsers WHERE BlockerID=@blocker AND BlockedID=@blocked');

        const io = req.app.get('io');
        if (io) io.to(`user_${targetId}`).emit('GotUnblocked', { byUserID: req.userId });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;