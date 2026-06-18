const express = require('express');
const { getPool } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/users/me
router.get('/me', authenticate, async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('userId', req.userId)
            .query('SELECT UserID, Username, Email, FullName, AvatarUrl, IsAdmin, CreatedAt FROM Users WHERE UserID = @userId');
        if (result.recordset.length === 0)
            return res.status(404).json({ error: 'User not found' });
        const u = result.recordset[0];
        res.json({
            userID: u.UserID,
            username: u.Username,
            email: u.Email,
            fullName: u.FullName,
            avatarUrl: u.AvatarUrl,
            isAdmin: u.IsAdmin,
            createdAt: u.CreatedAt
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/users/profile  ← FIX: route này bị thiếu hoàn toàn
router.put('/profile', authenticate, async (req, res) => {
    try {
        const { fullName, avatarUrl } = req.body;
        if (!fullName && !avatarUrl)
            return res.status(400).json({ error: 'Không có dữ liệu để cập nhật' });

        const pool = getPool();
        // FIX: dùng parameterized query, không string concat
        await pool.request()
            .input('userId', req.userId)
            .input('fullName', fullName ?? null)
            .input('avatarUrl', avatarUrl ?? null)
            .query(`UPDATE Users SET
                FullName  = COALESCE(@fullName,  FullName),
                AvatarUrl = COALESCE(@avatarUrl, AvatarUrl)
                WHERE UserID = @userId`);

        // Trả về user mới nhất để frontend cập nhật state
        const updated = await pool.request()
            .input('userId', req.userId)
            .query('SELECT UserID, Username, Email, FullName, AvatarUrl, IsAdmin, CreatedAt FROM Users WHERE UserID = @userId');

        const u = updated.recordset[0];
        res.json({
            success: true,
            user: {
                userID: u.UserID,
                username: u.Username,
                email: u.Email,
                fullName: u.FullName,
                avatarUrl: u.AvatarUrl,
                isAdmin: u.IsAdmin,
                createdAt: u.CreatedAt
            }
        });
    } catch (err) {
        console.error('[PUT /users/profile]', err);
        res.status(500).json({ error: 'Cập nhật thất bại' });
    }
});

// GET /api/users/search?q=...
router.get('/search', authenticate, async (req, res) => {
    try {
        const q = req.query.q || '';
        if (q.length < 2) return res.json([]);
        const pool = getPool();
        const result = await pool.request()
            .input('q', `%${q}%`)
            .input('userId', req.userId)
            .query(`SELECT TOP 20 UserID, Username, FullName, AvatarUrl, IsOnline
                    FROM Users
                    WHERE (Username LIKE @q OR FullName LIKE @q)
                    AND UserID != @userId`);
        res.json(result.recordset.map(u => ({
            userID: u.UserID,
            username: u.Username,
            fullName: u.FullName,
            avatarUrl: u.AvatarUrl,
            isOnline: u.IsOnline
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const { hashPassword, comparePassword } = require('../utils/hash');

// PUT /api/users/change-password
router.put('/change-password', authenticate, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Thiếu thông tin' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Mật khẩu mới ít nhất 6 ký tự' });
    try {
        const pool = getPool();
        const result = await pool.request()
            .input('userId', req.userId)
            .query(`SELECT PasswordHash FROM Users WHERE UserID = @userId`);
        if (!result.recordset.length) return res.status(404).json({ error: 'User not found' });

        const ok = comparePassword(oldPassword, result.recordset[0].PasswordHash);
        if (!ok) return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });

        const newHash = hashPassword(newPassword);
        await pool.request()
            .input('userId', req.userId)
            .input('hash', newHash)
            .query(`UPDATE Users SET PasswordHash = @hash WHERE UserID = @userId`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;