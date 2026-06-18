const { getPool } = require('../config/db');
const { hashPassword, comparePassword } = require('../utils/hash');
const jwt = require('jsonwebtoken');

async function register(req, res) {
    const { username, email, password, fullName } = req.body;
    const pool = getPool();
    try {
        const hashed = hashPassword(password);
        await pool.request()
            .input('username', username)
            .input('email', email)
            .input('password', hashed)
            .input('fullName', fullName)
            .query(`INSERT INTO Users (Username, Email, PasswordHash, FullName) VALUES (@username, @email, @password, @fullName)`);
        res.status(201).json({ message: 'Đăng ký thành công' });
    } catch (err) {
        if (err.number === 2627) return res.status(400).json({ error: 'Tên đăng nhập hoặc email đã tồn tại' });
        res.status(500).json({ error: err.message });
    }
}

async function login(req, res) {
    const { username, email, password } = req.body;
    const loginId = email || username;
    const pool = getPool();
    const result = await pool.request()
        .input('loginId', loginId)
        .query(`SELECT UserID, Username, Email, PasswordHash, FullName, AvatarUrl, IsAdmin
            FROM Users WHERE Username=@loginId OR Email=@loginId`);

    if (result.recordset.length === 0)
        return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });

    const u = result.recordset[0];  // ← THÊM DÒNG NÀY

    if (!comparePassword(password, u.PasswordHash))
        return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });

    const token = jwt.sign(
        { userId: u.UserID, isAdmin: u.IsAdmin },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );

    res.json({
        token,
        accessToken: token,
        user: {
            userID: u.UserID,
            username: u.Username,
            email: u.Email,
            fullName: u.FullName,
            avatarUrl: u.AvatarUrl,
            isAdmin: u.IsAdmin
        }
    });
}
async function getMe(req, res) {
    const pool = getPool();
    const result = await pool.request()
        .input('userId', req.userId)
        .query(`SELECT UserID, Username, Email, FullName, AvatarUrl, IsAdmin, CreatedAt 
                FROM Users WHERE UserID = @userId`);
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
}
module.exports = { register, login, getMe };