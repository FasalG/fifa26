const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null indicates it is a Group Chat message
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true // Scopes messages to the specific admin's league/workspace
  },
  text: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

// Create index for fast retrieval of group and private chats
MessageSchema.index({ adminId: 1, recipient: 1, createdAt: 1 });
MessageSchema.index({ sender: 1, recipient: 1, createdAt: 1 });

module.exports = mongoose.model('Message', MessageSchema);
