const express = require('express');
const router = express.Router();
const {
  getChatPlayers,
  getGroupMessages,
  sendGroupMessage,
  getPrivateMessages,
  sendPrivateMessage
} = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

router.get('/players', protect, getChatPlayers);
router.get('/group', protect, getGroupMessages);
router.post('/group', protect, sendGroupMessage);
router.get('/private/:userId', protect, getPrivateMessages);
router.post('/private/:userId', protect, sendPrivateMessage);

module.exports = router;
