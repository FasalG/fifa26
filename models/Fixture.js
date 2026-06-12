const mongoose = require('mongoose');

const FixtureSchema = new mongoose.Schema({
  matchNumber: {
    type: Number,
    required: true
  },
  teamA: {
    type: String,
    required: true,
    trim: true
  },
  teamB: {
    type: String,
    required: true,
    trim: true
  },
  matchTime: {
    type: Date,
    required: true
  },
  venue: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['Upcoming', 'Live', 'Completed'],
    default: 'Upcoming'
  },
  scoreA: {
    type: Number,
    default: null
  },
  scoreB: {
    type: Number,
    default: null
  },
  winner: {
    type: String,
    enum: ['A', 'B', 'Tie', null],
    default: null
  }
}, {
  timestamps: true
});

FixtureSchema.index({ matchNumber: 1 }, { unique: true });

module.exports = mongoose.model('Fixture', FixtureSchema);
