const express = require('express');
const { register, login, getMe } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { getPool } = require('../config/db'); // THÊM DÒNG NÀY
const router = express.Router();

router.get('/me', authenticate, getMe);
router.post('/register', register);
router.post('/login', login);
// router.post('/logout', (req, res) => res.json({ message: 'Đăng xuất thành công' }));

router.put('/profile', authenticate, async (req, res) => {
    const { fullName, avatarUrl } = req.body;
    try {
        const pool = getPool();
        await pool.request()
            .input('userId', req.userId)
            .input('fullName', fullName || null)
            .input('avatarUrl', avatarUrl || null)
            .query(`UPDATE Users SET
                FullName  = COALESCE(@fullName, FullName),
                AvatarUrl = COALESCE(@avatarUrl, AvatarUrl)
                WHERE UserID = @userId`);
        res.json({ message: 'Cập nhật thành công' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Cập nhật thất bại' });
    }
});

module.exports = router;