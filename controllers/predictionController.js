const Fixture = require('../models/Fixture');
const Prediction = require('../models/Prediction');
const User = require('../models/User');
const Team = require('../models/Team');
const Group = require('../models/Group');

// @desc    Get all fixtures (optionally with logged in user's predictions)
// @route   GET /api/fixtures
// @access  Private
const getFixtures = async (req, res) => {
  try {
    let adminId = null;
    if (req.user.role === 'admin') {
      adminId = req.user._id;
    } else if (req.user.role === 'player') {
      adminId = req.user.createdBy;
    }

    const filter = adminId ? { createdBy: adminId } : { createdBy: { $exists: false } };
    const fixtures = await Fixture.find(filter).sort({ matchNumber: 1 });
    const predictions = await Prediction.find({ userId: req.user._id });

    // Map predictions by matchId for quick lookup
    const predictionMap = {};
    predictions.forEach(p => {
      predictionMap[p.matchId.toString()] = p;
    });

    const now = new Date();
    const LOCK_BUFFER_MS = 60 * 60 * 1000; // 60 minutes in milliseconds

    const enrichedFixtures = fixtures.map(fixture => {
      const matchDate = new Date(fixture.matchTime);
      const msUntilMatch = matchDate.getTime() - now.getTime();
      const isLocked = msUntilMatch <= LOCK_BUFFER_MS || fixture.status !== 'Upcoming';

      return {
        _id: fixture._id,
        matchNumber: fixture.matchNumber,
        teamA: fixture.teamA,
        teamB: fixture.teamB,
        matchTime: fixture.matchTime,
        venue: fixture.venue || '',
        status: fixture.status,
        scoreA: fixture.scoreA,
        scoreB: fixture.scoreB,
        winner: fixture.winner,
        isLocked,
        myPrediction: predictionMap[fixture._id.toString()] || null
      };
    });

    res.json(enrichedFixtures);
  } catch (error) {
    console.error('Error fetching fixtures:', error);
    res.status(500).json({ message: 'Server error fetching fixtures', error: error.message });
  }
};

// @desc    Submit or update a prediction
// @route   POST /api/predictions
// @access  Private
const submitPrediction = async (req, res) => {
  try {
    const { matchId, predScoreA, predScoreB } = req.body;

    if (matchId === undefined || predScoreA === undefined || predScoreB === undefined) {
      return res.status(400).json({ message: 'Please provide matchId, predScoreA and predScoreB' });
    }

    const fixture = await Fixture.findById(matchId);
    if (!fixture) {
      return res.status(404).json({ message: 'Fixture not found' });
    }

    // Verify player is authorized to predict this fixture (belong to the same admin workspace)
    const playerAdminId = req.user.createdBy ? req.user.createdBy.toString() : null;
    const fixtureAdminId = fixture.createdBy ? fixture.createdBy.toString() : null;
    if (playerAdminId !== fixtureAdminId) {
      return res.status(403).json({ message: 'Access denied: this fixture belongs to another admin league' });
    }

    // Check locking threshold: exactly 60 minutes before kickoff
    const now = new Date();
    const matchTime = new Date(fixture.matchTime);
    const msUntilMatch = matchTime.getTime() - now.getTime();
    const LOCK_BUFFER_MS = 60 * 60 * 1000; // 60 minutes

    if (msUntilMatch < LOCK_BUFFER_MS) {
      return res.status(400).json({ 
        message: 'Predictions lock exactly 60 minutes prior to kickoff' 
      });
    }

    if (fixture.status !== 'Upcoming') {
      return res.status(400).json({
        message: 'Match is already live or completed. Predictions locked.'
      });
    }

    // Upsert prediction
    const prediction = await Prediction.findOneAndUpdate(
      { userId: req.user._id, matchId },
      { 
        predScoreA: Number(predScoreA), 
        predScoreB: Number(predScoreB),
        timestamp: now
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: 'Prediction submitted successfully',
      prediction
    });
  } catch (error) {
    console.error('Error submitting prediction:', error);
    res.status(500).json({ message: 'Server error submitting prediction', error: error.message });
  }
};

// @desc    Get global leaderboard
// @route   GET /api/leaderboard
// @access  Private
const getLeaderboard = async (req, res) => {
  try {
    let filter = { role: 'player' };

    // Multi-tenant: group players under the admin who created them
    if (req.user.role === 'admin') {
      filter.createdBy = req.user._id;
    } else if (req.user.role === 'player') {
      if (req.user.createdBy) {
        filter.createdBy = req.user.createdBy;
      } else {
        filter.createdBy = { $exists: false }; // Seeded default players
      }
    }

    const leaderboard = await User.find(filter)
      .sort({ totalPoints: -1, username: 1 })
      .select('username totalPoints role');

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ message: 'Server error fetching leaderboard', error: error.message });
  }
};

// @desc    Get all teams sorted by group and name
// @route   GET /api/teams
// @access  Private
const getTeams = async (req, res) => {
  try {
    let adminId = null;
    if (req.user.role === 'admin') {
      adminId = req.user._id;
    } else if (req.user.role === 'player') {
      adminId = req.user.createdBy;
    }

    const filter = adminId ? { createdBy: adminId } : { createdBy: { $exists: false } };
    const teams = await Team.find(filter).populate('group').sort({ name: 1 });
    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ message: 'Server error fetching teams' });
  }
};

const getGroups = async (req, res) => {
  try {
    let adminId = null;
    if (req.user.role === 'admin') {
      adminId = req.user._id;
    } else if (req.user.role === 'player') {
      adminId = req.user.createdBy;
    }

    const filter = adminId ? { createdBy: adminId } : { createdBy: { $exists: false } };
    const groups = await Group.find(filter).sort({ name: 1 });
    res.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ message: 'Server error fetching groups' });
  }
};

module.exports = {
  getFixtures,
  submitPrediction,
  getLeaderboard,
  getTeams,
  getGroups
};
