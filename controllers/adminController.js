const Fixture = require('../models/Fixture');
const Prediction = require('../models/Prediction');
const User = require('../models/User');
const Team = require('../models/Team');
const Group = require('../models/Group');
const { sendWhatsAppGroupAlert } = require('../services/whatsappService');

// Helper to recalculate points and goals for all teams under an admin
const recalculateTeamStandings = async (adminId) => {
  try {
    const teams = await Team.find({ createdBy: adminId });
    const teamStats = {};
    for (const team of teams) {
      teamStats[team.name] = { points: 0, goalsScored: 0, played: 0, won: 0, lost: 0, draw: 0 };
    }

    const completedFixtures = await Fixture.find({ status: 'Completed', createdBy: adminId });
    for (const match of completedFixtures) {
      const sA = Number(match.scoreA || 0);
      const sB = Number(match.scoreB || 0);

      // Both teams played
      if (teamStats[match.teamA] !== undefined) teamStats[match.teamA].played += 1;
      if (teamStats[match.teamB] !== undefined) teamStats[match.teamB].played += 1;

      // Cumulative goals
      if (teamStats[match.teamA] !== undefined) teamStats[match.teamA].goalsScored += sA;
      if (teamStats[match.teamB] !== undefined) teamStats[match.teamB].goalsScored += sB;

      if (sA > sB) {
        if (teamStats[match.teamA] !== undefined) {
          teamStats[match.teamA].points += 2;
          teamStats[match.teamA].won += 1;
        }
        if (teamStats[match.teamB] !== undefined) {
          teamStats[match.teamB].lost += 1;
        }
      } else if (sB > sA) {
        if (teamStats[match.teamB] !== undefined) {
          teamStats[match.teamB].points += 2;
          teamStats[match.teamB].won += 1;
        }
        if (teamStats[match.teamA] !== undefined) {
          teamStats[match.teamA].lost += 1;
        }
      } else {
        // Draw
        if (teamStats[match.teamA] !== undefined) {
          teamStats[match.teamA].points += 1;
          teamStats[match.teamA].draw += 1;
        }
        if (teamStats[match.teamB] !== undefined) {
          teamStats[match.teamB].points += 1;
          teamStats[match.teamB].draw += 1;
        }
      }
    }

    for (const team of teams) {
      const stats = teamStats[team.name];
      if (stats) {
        team.points = stats.points;
        team.goalsScored = stats.goalsScored;
        team.played = stats.played;
        team.won = stats.won;
        team.lost = stats.lost;
        team.draw = stats.draw;
        await team.save();
      }
    }
  } catch (error) {
    console.error('Error recalculating team standings:', error);
  }
};

// @desc    Settle a match score and calculate user points
// @route   POST /api/admin/settle-match
// @access  Private/Admin
const settleMatch = async (req, res) => {
  try {
    const { matchId, scoreA, scoreB } = req.body;

    if (matchId === undefined || scoreA === undefined || scoreB === undefined) {
      return res.status(400).json({ message: 'Please provide matchId, scoreA and scoreB' });
    }

    const fixture = await Fixture.findOne({ _id: matchId, createdBy: req.user._id });
    if (!fixture) {
      return res.status(404).json({ message: 'Fixture not found or not managed by you' });
    }

    const actualScoreA = Number(scoreA);
    const actualScoreB = Number(scoreB);

    // Determine actual winner
    let actualWinner = 'Tie';
    if (actualScoreA > actualScoreB) {
      actualWinner = 'A';
    } else if (actualScoreB > actualScoreA) {
      actualWinner = 'B';
    }

    // Update match details
    fixture.scoreA = actualScoreA;
    fixture.scoreB = actualScoreB;
    fixture.winner = actualWinner;
    fixture.status = 'Completed';
    await fixture.save();

    // Fetch all predictions for this match
    const predictions = await Prediction.find({ matchId });

    let exactCount = 0;
    let outcomeCount = 0;
    let incorrectCount = 0;

    // Process predictions and assign points
    for (const prediction of predictions) {
      const predA = prediction.predScoreA;
      const predB = prediction.predScoreB;

      // Determine predicted winner
      let predWinner = 'Tie';
      if (predA > predB) {
        predWinner = 'A';
      } else if (predB > predA) {
        predWinner = 'B';
      }

      let pointsEarned = 0;

      // Rule: +30 for exact scoreline, +10 for correct outcome, 0 otherwise
      if (predA === actualScoreA && predB === actualScoreB) {
        pointsEarned = 30;
        exactCount++;
      } else if (predWinner === actualWinner) {
        pointsEarned = 10;
        outcomeCount++;
      } else {
        pointsEarned = 0;
        incorrectCount++;
      }

      prediction.pointsEarned = pointsEarned;
      await prediction.save();
    }

    // Update all users' total points from scratch (highly robust/failsafe approach, scoped to admin's players)
    const players = await User.find({ role: 'player', createdBy: req.user._id });
    for (const player of players) {
      const userPredictions = await Prediction.find({ userId: player._id });
      const newTotalPoints = userPredictions.reduce((sum, p) => sum + (p.pointsEarned || 0), 0);
      player.totalPoints = newTotalPoints;
      await player.save();
    }

    // Recalculate team points and goalsScored stats
    await recalculateTeamStandings(req.user._id);

    // Fetch the updated Top 3 Leaderboard (scoped to admin's players)
    const leaderboard = await User.find({ role: 'player', createdBy: req.user._id })
      .sort({ totalPoints: -1, username: 1 })
      .limit(3)
      .select('username totalPoints');

    // Build the WhatsApp alert text block
    let winnerDisplay = 'Tie 🤝';
    if (actualWinner === 'A') winnerDisplay = `${fixture.teamA} Win 🔴`;
    if (actualWinner === 'B') winnerDisplay = `${fixture.teamB} Win 🔵`;

    let leaderboardText = '';
    const medals = ['🥇', '🥈', '🥉'];
    leaderboard.forEach((user, index) => {
      leaderboardText += `${medals[index]} ${user.username}: ${user.totalPoints} pts\n`;
    });
    if (leaderboard.length === 0) {
      leaderboardText = 'No players registered yet.\n';
    }

    const messageText = `⚽️ *FIFA 2026 WORLD CUP PREDICTION GAME* ⚽️
---------------------------------------------
🏆 *Match Settled!*
*Fixture:* ${fixture.teamA} vs ${fixture.teamB} (Match #${fixture.matchNumber})
*Full Time Score:* ${fixture.teamA} ${actualScoreA} - ${actualScoreB} ${fixture.teamB}
*Outcome:* ${winnerDisplay}

📊 *Match Predictions Stats:*
- Exact Scorelines (+30 pts): ${exactCount}
- Correct Outcomes (+10 pts): ${outcomeCount}
- Incorrect (+0 pts): ${incorrectCount}

🏅 *CURRENT TOP 3 LEADERBOARD:*
${leaderboardText}
Keep predicting and climb the charts! 🏆🔥`;

    // Send WhatsApp notification
    await sendWhatsAppGroupAlert(messageText);

    res.json({
      message: 'Match settled successfully. Points recalculated and WhatsApp alert dispatched.',
      fixture,
      stats: {
        exactCount,
        outcomeCount,
        incorrectCount
      },
      leaderboard
    });
  } catch (error) {
    console.error('Error settling match:', error);
    res.status(500).json({ message: 'Server error during match settlement', error: error.message });
  }
};

// @desc    Create a new fixture
// @route   POST /api/admin/fixtures
// @access  Private/Admin
const createFixture = async (req, res) => {
  try {
    const { matchNumber, teamA, teamB, matchTime, venue } = req.body;
    if (!matchNumber || !teamA || !teamB || !matchTime) {
      return res.status(400).json({ message: 'Missing fixture parameters' });
    }

    // Verify both teams belong to this admin's workspace
    const teamAExists = await Team.findOne({ name: teamA, createdBy: req.user._id });
    const teamBExists = await Team.findOne({ name: teamB, createdBy: req.user._id });
    if (!teamAExists || !teamBExists) {
      return res.status(400).json({ message: 'Both teams must be registered under your admin profile' });
    }

    const fixture = await Fixture.create({
      matchNumber,
      teamA,
      teamB,
      matchTime: new Date(matchTime),
      venue: venue || '',
      status: 'Upcoming',
      createdBy: req.user._id
    });

    res.status(201).json(fixture);
  } catch (error) {
    res.status(500).json({ message: 'Error creating fixture', error: error.message });
  }
};

// @desc    Create a new team
// @route   POST /api/admin/teams
// @access  Private/Admin
const createTeam = async (req, res) => {
  try {
    const { name, group, logo } = req.body;
    if (!name || !group) {
      return res.status(400).json({ message: 'Missing team name or group' });
    }

    const team = await Team.create({
      name,
      group: group.toUpperCase(),
      logo: logo || '',
      createdBy: req.user._id
    });

    res.status(201).json(team);
  } catch (error) {
    res.status(500).json({ message: 'Error creating team. Name must be unique within your group.', error: error.message });
  }
};

// @desc    Update a team
// @route   PUT /api/admin/teams/:id
// @access  Private/Admin
const updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, group, logo } = req.body;
    const team = await Team.findOne({ _id: id, createdBy: req.user._id });
    if (!team) return res.status(404).json({ message: 'Team not found or not managed by you' });
    if (name) team.name = name;
    if (group) team.group = group.toUpperCase();
    if (logo !== undefined) team.logo = logo;
    await team.save();
    res.json(team);
  } catch (error) {
    res.status(500).json({ message: 'Error updating team', error: error.message });
  }
};

// @desc    Delete a team
// @route   DELETE /api/admin/teams/:id
// @access  Private/Admin
const deleteTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const team = await Team.findOneAndDelete({ _id: id, createdBy: req.user._id });
    if (!team) return res.status(404).json({ message: 'Team not found or not managed by you' });
    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting team', error: error.message });
  }
};

// @desc    Update a fixture
// @route   PUT /api/admin/fixtures/:id
// @access  Private/Admin
const updateFixture = async (req, res) => {
  try {
    const { id } = req.params;
    const { matchNumber, teamA, teamB, matchTime, venue, status } = req.body;
    const fixture = await Fixture.findOne({ _id: id, createdBy: req.user._id });
    if (!fixture) return res.status(404).json({ message: 'Fixture not found or not managed by you' });
    if (matchNumber !== undefined) fixture.matchNumber = matchNumber;
    if (teamA) fixture.teamA = teamA;
    if (teamB) fixture.teamB = teamB;
    if (matchTime) fixture.matchTime = new Date(matchTime);
    if (venue !== undefined) fixture.venue = venue;
    if (status) fixture.status = status;
    await fixture.save();
    await recalculateTeamStandings(req.user._id);
    res.json(fixture);
  } catch (error) {
    res.status(500).json({ message: 'Error updating fixture', error: error.message });
  }
};

// @desc    Delete a fixture
// @route   DELETE /api/admin/fixtures/:id
// @access  Private/Admin
const deleteFixture = async (req, res) => {
  try {
    const { id } = req.params;
    const fixture = await Fixture.findOneAndDelete({ _id: id, createdBy: req.user._id });
    if (!fixture) return res.status(404).json({ message: 'Fixture not found or not managed by you' });
    await Prediction.deleteMany({ matchId: id });
    await recalculateTeamStandings(req.user._id);
    res.json({ message: 'Fixture deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting fixture', error: error.message });
  }
};

// @desc    Create a player under this admin
// @route   POST /api/admin/players
// @access  Private/Admin
const createPlayer = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Missing username, email or password' });
    }
    const existing = await User.findOne({ $or: [{ username }, { email: email.toLowerCase() }] });
    if (existing) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }
    const player = await User.create({
      username,
      email: email.toLowerCase(),
      password,
      role: 'player',
      createdBy: req.user._id
    });
    res.status(201).json({
      _id: player._id,
      username: player.username,
      email: player.email,
      role: player.role,
      totalPoints: player.totalPoints,
      createdBy: player.createdBy
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating player', error: error.message });
  }
};

// @desc    Get all players created by this admin
// @route   GET /api/admin/players
// @access  Private/Admin
const getPlayers = async (req, res) => {
  try {
    const players = await User.find({ createdBy: req.user._id, role: 'player' }).select('-password');
    res.json(players);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching players', error: error.message });
  }
};

// @desc    Update player details
// @route   PUT /api/admin/players/:id
// @access  Private/Admin
const updatePlayer = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, password, totalPoints } = req.body;
    const player = await User.findOne({ _id: id, createdBy: req.user._id, role: 'player' });
    if (!player) {
      return res.status(404).json({ message: 'Player not found or not managed by you' });
    }
    if (username) player.username = username;
    if (email) player.email = email.toLowerCase();
    if (password) player.password = password;
    if (totalPoints !== undefined) player.totalPoints = totalPoints;
    await player.save();
    res.json({
      _id: player._id,
      username: player.username,
      email: player.email,
      role: player.role,
      totalPoints: player.totalPoints,
      createdBy: player.createdBy
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating player', error: error.message });
  }
};

// @desc    Delete a player under this admin
// @route   DELETE /api/admin/players/:id
// @access  Private/Admin
const deletePlayer = async (req, res) => {
  try {
    const { id } = req.params;
    const player = await User.findOneAndDelete({ _id: id, createdBy: req.user._id, role: 'player' });
    if (!player) {
      return res.status(404).json({ message: 'Player not found or not managed by you' });
    }
    await Prediction.deleteMany({ userId: id });
    res.json({ message: 'Player deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting player', error: error.message });
  }
};

// @desc    Create a new group
// @route   POST /api/admin/groups
// @access  Private/Admin
const createGroup = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Missing group name' });
    }

    const group = await Group.create({
      name,
      createdBy: req.user._id
    });

    res.status(201).json(group);
  } catch (error) {
    res.status(500).json({ message: 'Error creating group. Name must be unique within your profile.', error: error.message });
  }
};

// @desc    Get all groups managed by this admin
// @route   GET /api/admin/groups
// @access  Private/Admin
const getGroups = async (req, res) => {
  try {
    const groups = await Group.find({ createdBy: req.user._id }).sort({ name: 1 });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching groups', error: error.message });
  }
};

// @desc    Update a group
// @route   PUT /api/admin/groups/:id
// @access  Private/Admin
const updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const group = await Group.findOne({ _id: id, createdBy: req.user._id });
    if (!group) return res.status(404).json({ message: 'Group not found or not managed by you' });
    if (name) group.name = name;
    await group.save();
    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Error updating group', error: error.message });
  }
};

// @desc    Delete a group (cascades to delete teams, fixtures, and predictions!)
// @route   DELETE /api/admin/groups/:id
// @access  Private/Admin
const deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const group = await Group.findOneAndDelete({ _id: id, createdBy: req.user._id });
    if (!group) return res.status(404).json({ message: 'Group not found or not managed by you' });

    // Find all teams under this group
    const teams = await Team.find({ group: id, createdBy: req.user._id });
    const teamNames = teams.map(t => t.name);

    // Delete those teams
    await Team.deleteMany({ group: id, createdBy: req.user._id });

    // Find and delete fixtures involving these teams
    const fixtures = await Fixture.find({
      createdBy: req.user._id,
      $or: [
        { teamA: { $in: teamNames } },
        { teamB: { $in: teamNames } }
      ]
    });
    const fixtureIds = fixtures.map(f => f._id);
    await Fixture.deleteMany({ _id: { $in: fixtureIds } });

    // Delete predictions for those fixtures
    await Prediction.deleteMany({ matchId: { $in: fixtureIds } });

    res.json({ message: 'Group and all associated teams, fixtures, and predictions deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting group', error: error.message });
  }
};

module.exports = {
  settleMatch,
  createFixture,
  createTeam,
  updateTeam,
  deleteTeam,
  updateFixture,
  deleteFixture,
  createPlayer,
  getPlayers,
  updatePlayer,
  deletePlayer,
  createGroup,
  getGroups,
  updateGroup,
  deleteGroup
};
