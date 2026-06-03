const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// A group name must be unique within an admin's league
GroupSchema.index({ name: 1, createdBy: 1 }, { unique: true });

module.exports = mongoose.model('Group', GroupSchema);
