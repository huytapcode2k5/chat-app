const express = require('express');
const { getAllUsers, deleteUser, getAllMessages, getStats } = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Middleware kiểm tra quyền admin riêng
function adminOnly(req, res, next) {
    if (!req.isAdmin) return res.status(403).json({ error: 'Require admin' });
    next();
}

router.get('/users', authenticate, adminOnly, getAllUsers);
router.delete('/users/:userId', authenticate, adminOnly, deleteUser);
router.get('/messages', authenticate, adminOnly, getAllMessages);
router.get('/stats', authenticate, adminOnly, getStats);

module.exports = router;