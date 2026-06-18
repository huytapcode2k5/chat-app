const express = require('express');
const { createAIConversation, getAIConversations, sendAIMessage, getAIMessages } = require('../controllers/aiController');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.post('/conversations', authenticate, createAIConversation);
router.get('/conversations', authenticate, getAIConversations);
router.post('/send', authenticate, sendAIMessage);
router.get('/messages/:aiConversationId', authenticate, getAIMessages);

module.exports = router;