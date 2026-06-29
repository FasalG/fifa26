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
    const fixtures = await Fixture.find({}).sort({ matchNumber: 1 });
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
      const oneHourInMs = 60 * 60 * 1000;
      const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
      const isLocked = fixture.status !== 'Upcoming' || msUntilMatch < oneHourInMs || msUntilMatch > twentyFourHoursInMs;

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
        penaltyScoreA: fixture.penaltyScoreA,
        penaltyScoreB: fixture.penaltyScoreB,
        isKnockout: fixture.isKnockout || false,
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
    const { matchId, predScoreA, predScoreB, predPenaltyScoreA, predPenaltyScoreB } = req.body;

    if (matchId === undefined || predScoreA === undefined || predScoreB === undefined) {
      return res.status(400).json({ message: 'Please provide matchId, predScoreA and predScoreB' });
    }

    const fixture = await Fixture.findById(matchId);
    if (!fixture) {
      return res.status(404).json({ message: 'Fixture not found' });
    }

    // Check locking threshold: between 24 hours and 1 hour before kickoff
    const now = new Date();
    const matchTime = new Date(fixture.matchTime);
    const msUntilMatch = matchTime.getTime() - now.getTime();
    const oneHourInMs = 60 * 60 * 1000;
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000;

    if (msUntilMatch < oneHourInMs) {
      return res.status(400).json({ 
        message: 'Predictions locked (kickoff is within 1 hour)' 
      });
    }

    if (msUntilMatch > twentyFourHoursInMs) {
      return res.status(400).json({
        message: 'Predictions not open yet (kickoff is more than 24 hours away)'
      });
    }

    if (fixture.status !== 'Upcoming') {
      return res.status(400).json({
        message: 'Match is already live or completed. Predictions locked.'
      });
    }

    const updateData = {
      predScoreA: Number(predScoreA), 
      predScoreB: Number(predScoreB),
      timestamp: now
    };

    // If it's a knockout and predicted scores are equal, require and save penalty predictions
    if (fixture.isKnockout && Number(predScoreA) === Number(predScoreB)) {
      if (predPenaltyScoreA === undefined || predPenaltyScoreB === undefined || predPenaltyScoreA === null || predPenaltyScoreB === null) {
        return res.status(400).json({ message: 'Please predict penalty shootout scores for a draw match' });
      }
      updateData.predPenaltyScoreA = Number(predPenaltyScoreA);
      updateData.predPenaltyScoreB = Number(predPenaltyScoreB);
    } else {
      updateData.predPenaltyScoreA = null;
      updateData.predPenaltyScoreB = null;
    }

    // Upsert prediction
    const prediction = await Prediction.findOneAndUpdate(
      { userId: req.user._id, matchId },
      updateData,
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
    const teams = await Team.find({}).populate('group').sort({ name: 1 });
    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ message: 'Server error fetching teams' });
  }
};

const getGroups = async (req, res) => {
  try {
    const groups = await Group.find({}).sort({ name: 1 });
    res.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ message: 'Server error fetching groups' });
  }
};

const getChatbotResponse = async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    let adminId = null;
    if (req.user.role === 'admin') {
      adminId = req.user._id;
    } else if (req.user.role === 'player') {
      adminId = req.user.createdBy;
    }

    const fixtures = await Fixture.find({}).sort({ matchNumber: 1 }).lean();
    
    let userFilter = { role: 'player' };
    if (adminId) {
      userFilter.createdBy = adminId;
    } else {
      userFilter.createdBy = { $exists: false };
    }
    const leaderboard = await User.find(userFilter)
      .sort({ totalPoints: -1, username: 1 })
      .select('username totalPoints')
      .lean();

    const userPredictions = await Prediction.find({ userId: req.user._id }).lean();

    const predictionList = userPredictions.map(p => {
      const f = fixtures.find(fix => fix._id.toString() === p.matchId.toString());
      return {
        matchNumber: f ? f.matchNumber : 'Unknown',
        matchup: f ? `${f.teamA} vs ${f.teamB}` : 'Unknown',
        predScoreA: p.predScoreA,
        predScoreB: p.predScoreB,
        pointsEarned: p.pointsEarned
      };
    });

    const leaderboardText = leaderboard.map((u, i) => `${i + 1}. ${u.username}: ${u.totalPoints} pts`).join('\n');
    
    const fixturesText = fixtures.map(f => {
      const scoreStr = f.status === 'Completed' || f.status === 'Live' ? ` (${f.scoreA}-${f.scoreB})` : '';
      return `Match #${f.matchNumber}: ${f.teamA} vs ${f.teamB} | Status: ${f.status}${scoreStr} | Time: ${f.matchTime}`;
    }).join('\n');

    const myPredText = predictionList.map(p => 
      `Match #${p.matchNumber} (${p.matchup}): Predicted ${p.predScoreA}-${p.predScoreB} | Points: ${p.pointsEarned ?? 'Not settled'}`
    ).join('\n');

    const systemPrompt = `You are "Predictor Bot", an AI assistant built inside the FIFA 2026 Prediction Game platform.
You help players analyze predictions, standings, matches, and rules.

Here is the current real-time game database state:

LEADERBOARD RANKINGS:
${leaderboardText || 'No players registered yet.'}

TOURNAMENT SCHEDULE & RESULTS:
${fixturesText || 'No fixtures scheduled.'}

CURRENT LOGGED-IN USER:
Username: ${req.user.username}
Role: ${req.user.role}
Total Points: ${req.user.totalPoints}
Their Predictions:
${myPredText || 'No predictions submitted yet.'}

GAME RULES:
- Exact Scoreline: +30 Points (e.g., predicted 2-1 and match finished 2-1).
- Correct Outcome: +10 Points (e.g., predicted 1-0 and match finished 3-0, or draw outcome match).
- Incorrect prediction: +0 Points.
- Predictions lock exactly 60 minutes (1 hour) before kickoff.
- Players can predict/update predictions anytime before lock.

Tone Guidelines:
- Be extremely friendly, energetic, and professional.
- Use soccer/football emojis (⚽, 🏆, 🥅, 👟, 🎯, 📊, ⚡).
- Keep responses relatively brief (max 2-3 short paragraphs) to fit inside a mobile chat bubble.
- Help players calculate what score they need to predict, their chances of climbing, and details of upcoming matches. Do not reveal private predictions of other players to preserve fairness.`;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('Missing GEMINI_API_KEY in environment variables');
      return res.status(500).json({ message: 'AI service configuration error' });
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const formattedHistory = (history || []).map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }]
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          ...formattedHistory,
          {
            role: 'user',
            parts: [{ text: message }]
          }
        ],
        tools: [
          {
            google_search: {}
          }
        ],
        generationConfig: {
          maxOutputTokens: 800,
          temperature: 0.7
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API Error:', errText);
      return res.status(502).json({ message: 'Error communicating with AI service' });
    }

    const data = await response.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't formulate a response right now.";
    
    res.json({ reply: replyText });

  } catch (error) {
    console.error('Chatbot Controller Error:', error);
    res.status(500).json({ message: 'Server error processing chat message', error: error.message });
  }
};

// @desc    Get prediction history for a specific player (visible to others once locked)
// @route   GET /api/leaderboard/:userId/predictions
// @access  Private
const getUserPredictionsHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    const targetUser = await User.findById(userId);
    if (!targetUser || targetUser.role !== 'player') {
      return res.status(404).json({ message: 'Player not found' });
    }

    // Tenant check: ensure current user and target user share the same admin
    let currentAdminId = null;
    if (req.user.role === 'admin') {
      currentAdminId = req.user._id;
    } else if (req.user.role === 'player') {
      currentAdminId = req.user.createdBy;
    }

    const targetAdminId = targetUser.createdBy;
    const currentAdminStr = currentAdminId ? currentAdminId.toString() : '';
    const targetAdminStr = targetAdminId ? targetAdminId.toString() : '';
    if (currentAdminStr !== targetAdminStr) {
      return res.status(403).json({ message: 'Access denied to this player standings' });
    }

    // Fetch predictions populated with matchDetails
    const predictions = await Prediction.find({ userId }).populate('matchId');

    const now = new Date();
    const LOCK_BUFFER_MS = 60 * 60 * 1000; // 60 minutes

    // Filter predictions to only those that are locked/completed
    const filteredPredictions = predictions.filter(p => {
      const fixture = p.matchId;
      if (!fixture) return false;
      const matchDate = new Date(fixture.matchTime);
      const msUntilMatch = matchDate.getTime() - now.getTime();
      const isLocked = msUntilMatch <= LOCK_BUFFER_MS || fixture.status !== 'Upcoming';
      return isLocked;
    });

    const history = filteredPredictions.map(p => {
      const fixture = p.matchId;
      return {
        _id: p._id,
        matchNumber: fixture.matchNumber,
        teamA: fixture.teamA,
        teamB: fixture.teamB,
        matchTime: fixture.matchTime,
        status: fixture.status,
        actualScoreA: fixture.scoreA,
        actualScoreB: fixture.scoreB,
        penaltyScoreA: fixture.penaltyScoreA,
        penaltyScoreB: fixture.penaltyScoreB,
        predScoreA: p.predScoreA,
        predScoreB: p.predScoreB,
        predPenaltyScoreA: p.predPenaltyScoreA,
        predPenaltyScoreB: p.predPenaltyScoreB,
        isKnockout: fixture.isKnockout || false,
        pointsEarned: p.pointsEarned,
        timestamp: p.timestamp
      };
    }).sort((a, b) => a.matchNumber - b.matchNumber);

    res.json(history);
  } catch (error) {
    console.error('Error fetching user prediction history:', error);
    res.status(500).json({ message: 'Server error fetching prediction history', error: error.message });
  }
};

module.exports = {
  getFixtures,
  submitPrediction,
  getLeaderboard,
  getTeams,
  getGroups,
  getChatbotResponse,
  getUserPredictionsHistory
};
