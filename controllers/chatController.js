const Message = require('../models/Message');
const User = require('../models/User');

// Helper to get adminId scope
const getAdminScope = (user) => {
  return user.role === 'admin' ? user._id : user.createdBy;
};

// @desc    Get all players and admin in the same league
// @route   GET /api/chat/players
// @access  Private
const getChatPlayers = async (req, res) => {
  try {
    const adminId = getAdminScope(req.user);
    if (!adminId) {
      return res.status(400).json({ message: 'User is not part of any league/workspace' });
    }

    // Fetch the admin and all players in the league
    const players = await User.find({
      $or: [
        { _id: adminId },
        { createdBy: adminId, role: 'player' }
      ],
      _id: { $ne: req.user._id } // exclude current user
    }).select('username role totalPoints');

    res.json(players);
  } catch (error) {
    console.error('Error fetching chat players:', error);
    res.status(500).json({ message: 'Server error fetching chat players', error: error.message });
  }
};

// @desc    Get group chat messages
// @route   GET /api/chat/group
// @access  Private
const getGroupMessages = async (req, res) => {
  try {
    const adminId = getAdminScope(req.user);
    if (!adminId) {
      return res.status(400).json({ message: 'User is not part of any league/workspace' });
    }

    const messages = await Message.find({
      recipient: null,
      adminId
    })
      .sort({ createdAt: 1 })
      .populate('sender', 'username role')
      .limit(100); // Limit to last 100 messages for speed

    res.json(messages);
  } catch (error) {
    console.error('Error fetching group messages:', error);
    res.status(500).json({ message: 'Server error fetching group messages', error: error.message });
  }
};

// @desc    Send group chat message
// @route   POST /api/chat/group
// @access  Private
const sendGroupMessage = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text cannot be empty' });
    }

    const adminId = getAdminScope(req.user);
    if (!adminId) {
      return res.status(400).json({ message: 'User is not part of any league/workspace' });
    }

    const newMessage = await Message.create({
      sender: req.user._id,
      recipient: null,
      adminId,
      text: text.trim()
    });

    const populatedMessage = await Message.findById(newMessage._id).populate('sender', 'username role');

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error('Error sending group message:', error);
    res.status(500).json({ message: 'Server error sending group message', error: error.message });
  }
};

// @desc    Get private messages with another user
// @route   GET /api/chat/private/:userId
// @access  Private
const getPrivateMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = getAdminScope(req.user);
    if (!adminId) {
      return res.status(400).json({ message: 'User is not part of any league/workspace' });
    }

    const messages = await Message.find({
      adminId,
      $or: [
        { sender: req.user._id, recipient: userId },
        { sender: userId, recipient: req.user._id }
      ]
    })
      .sort({ createdAt: 1 })
      .populate('sender', 'username role')
      .limit(100);

    res.json(messages);
  } catch (error) {
    console.error('Error fetching private messages:', error);
    res.status(500).json({ message: 'Server error fetching private messages', error: error.message });
  }
};

// @desc    Send private message to another user
// @route   POST /api/chat/private/:userId
// @access  Private
const sendPrivateMessage = async (req, res) => {
  try {
    const { userId } = req.params;
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text cannot be empty' });
    }

    const adminId = getAdminScope(req.user);
    if (!adminId) {
      return res.status(400).json({ message: 'User is not part of any league/workspace' });
    }

    // Verify recipient belongs to the same adminId league
    const recipientUser = await User.findOne({
      _id: userId,
      $or: [
        { _id: adminId },
        { createdBy: adminId }
      ]
    });

    if (!recipientUser) {
      return res.status(404).json({ message: 'Recipient not found in your league' });
    }

    const newMessage = await Message.create({
      sender: req.user._id,
      recipient: userId,
      adminId,
      text: text.trim()
    });

    const populatedMessage = await Message.findById(newMessage._id).populate('sender', 'username role');

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error('Error sending private message:', error);
    res.status(500).json({ message: 'Server error sending private message', error: error.message });
  }
};

module.exports = {
  getChatPlayers,
  getGroupMessages,
  sendGroupMessage,
  getPrivateMessages,
  sendPrivateMessage
};
