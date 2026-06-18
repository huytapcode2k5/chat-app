const { getPool } = require('../config/db');

// Lấy danh sách tất cả users (không có mật khẩu)
async function getAllUsers(req, res) {
    const pool = getPool();
    const result = await pool.request().query(`
    SELECT UserID, Username, Email, FullName, IsOnline, LastSeen, IsAdmin, CreatedAt
    FROM Users
  `);
    res.json(result.recordset);
}

// Xóa một user (cascade xóa bạn bè, tin nhắn,... nhưng DB có ràng buộc, cần xóa thủ công hoặc ON DELETE CASCADE)
async function deleteUser(req, res) {
    const { userId } = req.params;
    const pool = getPool();
    // Xóa các bảng liên quan (đơn giản hóa, có thể xóa tin nhắn, bạn bè trước)
    await pool.request().input('uid', userId).query(`DELETE FROM MessageStatus WHERE UserID = @uid`);
    await pool.request().input('uid', userId).query(`DELETE FROM ConversationMembers WHERE UserID = @uid`);
    await pool.request().input('uid', userId).query(`DELETE FROM FriendRequests WHERE SenderID = @uid OR ReceiverID = @uid`);
    await pool.request().input('uid', userId).query(`DELETE FROM Friends WHERE User1ID = @uid OR User2ID = @uid`);
    await pool.request().input('uid', userId).query(`DELETE FROM Notifications WHERE UserID = @uid`);
    await pool.request().input('uid', userId).query(`DELETE FROM AIConversations WHERE UserID = @uid`); // cascade xóa AIMessages
    await pool.request().input('uid', userId).query(`DELETE FROM Users WHERE UserID = @uid`);
    res.json({ success: true });
}

// Lấy tất cả tin nhắn (có phân trang, tìm kiếm)
async function getAllMessages(req, res) {
    const { search, page = 1, limit = 50 } = req.query;
    const pool = getPool();
    let query = `
    SELECT m.MessageID, m.Content, m.CreatedAt, u.Username as SenderName, c.Name as ConversationName
    FROM Messages m
    LEFT JOIN Users u ON m.SenderID = u.UserID
    LEFT JOIN Conversations c ON m.ConversationID = c.ConversationID
    WHERE m.IsDeleted = 0
  `;
    if (search) {
        query += ` AND (m.Content LIKE '%${search}%' OR u.Username LIKE '%${search}%')`;
    }
    query += ` ORDER BY m.CreatedAt DESC OFFSET ${(page - 1) * limit} ROWS FETCH NEXT ${limit} ROWS ONLY`;
    const result = await pool.request().query(query);
    res.json(result.recordset);
}

// Thống kê đơn giản
async function getStats(req, res) {
    const pool = getPool();
    const totalUsers = await pool.request().query(`SELECT COUNT(*) AS total FROM Users`);
    const totalMessages = await pool.request().query(`SELECT COUNT(*) AS total FROM Messages WHERE IsDeleted=0`);
    const onlineNow = await pool.request().query(`SELECT COUNT(*) AS online FROM Users WHERE IsOnline=1`);
    res.json({
        totalUsers: totalUsers.recordset[0].total,
        totalMessages: totalMessages.recordset[0].total,
        onlineNow: onlineNow.recordset[0].online
    });
}

module.exports = { getAllUsers, deleteUser, getAllMessages, getStats };