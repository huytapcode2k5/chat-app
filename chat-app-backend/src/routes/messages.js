const express = require('express');
const { getMessages, sendMessage, markAsSeen } = require('../controllers/messageController');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/:conversationId', authenticate, getMessages);
router.post('/', authenticate, sendMessage);
router.put('/:messageId/seen', authenticate, markAsSeen);

module.exports = router;