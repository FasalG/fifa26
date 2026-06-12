const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

GroupSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Group', GroupSchema);
