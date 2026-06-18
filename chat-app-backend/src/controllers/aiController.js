const { getPool } = require('../config/db');

// Tạo cuộc trò chuyện với AI
async function createAIConversation(req, res) {
    const userId = req.userId;
    const { title } = req.body;
    const pool = getPool();
    const result = await pool.request()
        .input('userId', userId)
        .input('title', title || 'Chat với AI')
        .query(`INSERT INTO AIConversations (UserID, Title) OUTPUT INSERTED.AIConversationID VALUES (@userId, @title)`);
    res.status(201).json({ aiConversationId: result.recordset[0].AIConversationID });
}

// Lấy danh sách các cuộc trò chuyện AI của user
async function getAIConversations(req, res) {
    const userId = req.userId;
    const pool = getPool();
    const result = await pool.request()
        .input('userId', userId)
        .query(`SELECT * FROM AIConversations WHERE UserID = @userId ORDER BY CreatedAt DESC`);
    res.json(result.recordset);
}

// Gửi tin nhắn cho AI và nhận phản hồi (bot tự động)
async function sendAIMessage(req, res) {
    const { aiConversationId, message } = req.body;
    const userId = req.userId;
    const pool = getPool();

    // Kiểm tra quyền sở hữu cuộc hội thoại
    const check = await pool.request()
        .input('aiConvId', aiConversationId)
        .input('userId', userId)
        .query(`SELECT 1 FROM AIConversations WHERE AIConversationID = @aiConvId AND UserID = @userId`);
    if (check.recordset.length === 0) return res.status(403).json({ error: 'Không có quyền' });

    // Lưu tin nhắn của user
    await pool.request()
        .input('aiConvId', aiConversationId)
        .input('role', 'user')
        .input('content', message)
        .query(`INSERT INTO AIMessages (AIConversationID, RoleName, Content) VALUES (@aiConvId, @role, @content)`);

    // Tạo phản hồi AI đơn giản (có thể nâng cấp dùng OpenAI)
    const reply = `🤖 Bot: Cảm ơn bạn đã nhắn "${message}". Tôi là AI trợ lý. Hiện tại tôi chỉ trả lời mẫu, bạn có thể tích hợp OpenAI để thông minh hơn.`;

    // Lưu phản hồi của AI
    await pool.request()
        .input('aiConvId', aiConversationId)
        .input('role', 'assistant')
        .input('content', reply)
        .query(`INSERT INTO AIMessages (AIConversationID, RoleName, Content) VALUES (@aiConvId, @role, @content)`);

    res.json({ reply });
}

// Lấy lịch sử tin nhắn AI
async function getAIMessages(req, res) {
    const { aiConversationId } = req.params;
    const userId = req.userId;
    const pool = getPool();
    const check = await pool.request()
        .input('aiConvId', aiConversationId)
        .input('userId', userId)
        .query(`SELECT 1 FROM AIConversations WHERE AIConversationID = @aiConvId AND UserID = @userId`);
    if (check.recordset.length === 0) return res.status(403).json({ error: 'Không có quyền' });
    const result = await pool.request()
        .input('aiConvId', aiConversationId)
        .query(`SELECT * FROM AIMessages WHERE AIConversationID = @aiConvId ORDER BY CreatedAt ASC`);
    res.json(result.recordset);
}

module.exports = { createAIConversation, getAIConversations, sendAIMessage, getAIMessages };