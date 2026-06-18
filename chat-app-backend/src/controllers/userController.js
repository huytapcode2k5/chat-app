// src/controllers/userController.js
const { getPool } = require('../config/db');

async function updateProfile(req, res) {
    const userId = req.userId;
    const { fullName, avatarUrl } = req.body;
    const pool = getPool();
    try {
        const setClauses = [];
        const request = pool.request().input('userId', userId);

        if (fullName !== undefined) {
            setClauses.push('FullName = @fullName');
            request.input('fullName', fullName);
        }
        if (avatarUrl !== undefined) {
            setClauses.push('AvatarUrl = @avatarUrl');
            request.input('avatarUrl', avatarUrl);
        }
        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        await request.query(`UPDATE Users SET ${setClauses.join(', ')} WHERE UserID = @userId`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Update failed' });
    }
}

async function getMe(req, res) {
    const pool = getPool();
    const result = await pool.request()
        .input('userId', req.userId)
        .query('SELECT UserID, Username, Email, FullName, AvatarUrl, IsAdmin FROM Users WHERE UserID = @userId');
    if (result.recordset.length === 0) return res.status(404).json({ error: 'User not found' });
    const u = result.recordset[0];
    res.json({
        userID: u.UserID,
        username: u.Username,
        email: u.Email,
        fullName: u.FullName,
        avatarUrl: u.AvatarUrl,
        isAdmin: u.IsAdmin
    });
}

module.exports = { updateProfile, getMe };