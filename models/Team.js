const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  logo: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  points: {
    type: Number,
    default: 0
  },
  goalsScored: {
    type: Number,
    default: 0
  },
  goalsConceded: {
    type: Number,
    default: 0
  },
  played: {
    type: Number,
    default: 0
  },
  won: {
    type: Number,
    default: 0
  },
  lost: {
    type: Number,
    default: 0
  },
  draw: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

TeamSchema.index({ name: 1, createdBy: 1 }, { unique: true });

module.exports = mongoose.model('Team', TeamSchema);
