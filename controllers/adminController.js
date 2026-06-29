const Fixture = require('../models/Fixture');
const Prediction = require('../models/Prediction');
const User = require('../models/User');
const Team = require('../models/Team');
const Group = require('../models/Group');
const { sendWhatsAppGroupAlert } = require('../services/whatsappService');

// Helper to recalculate points and goals for all teams under an admin
const recalculateTeamStandings = async () => {
  try {
    const teams = await Team.find({});
    const teamStats = {};
    for (const team of teams) {
      teamStats[team.name] = { points: 0, goalsScored: 0, goalsConceded: 0, played: 0, won: 0, lost: 0, draw: 0 };
    }

    const completedFixtures = await Fixture.find({ status: 'Completed' });
    for (const match of completedFixtures) {
      const sA = Number(match.scoreA || 0);
      const sB = Number(match.scoreB || 0);

      // Both teams played
      if (teamStats[match.teamA] !== undefined) teamStats[match.teamA].played += 1;
      if (teamStats[match.teamB] !== undefined) teamStats[match.teamB].played += 1;

      // Cumulative goals
      if (teamStats[match.teamA] !== undefined) {
        teamStats[match.teamA].goalsScored += sA;
        teamStats[match.teamA].goalsConceded += sB;
      }
      if (teamStats[match.teamB] !== undefined) {
        teamStats[match.teamB].goalsScored += sB;
        teamStats[match.teamB].goalsConceded += sA;
      }

      if (sA > sB) {
        if (teamStats[match.teamA] !== undefined) {
          teamStats[match.teamA].points += 3;
          teamStats[match.teamA].won += 1;
        }
        if (teamStats[match.teamB] !== undefined) {
          teamStats[match.teamB].lost += 1;
        }
      } else if (sB > sA) {
        if (teamStats[match.teamB] !== undefined) {
          teamStats[match.teamB].points += 3;
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
        team.goalsConceded = stats.goalsConceded;
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

const advanceFixtureWinner = async (fixture, winnerTeam, loserTeam) => {
  const matchNum = fixture.matchNumber;
  let targetMatchNum = null;
  let isTeamA = true;
  let loserTargetMatchNum = null;
  let isLoserTeamA = true;

  // Round of 32 (73-88) -> Round of 16 (89-96)
  if (matchNum === 73) { targetMatchNum = 89; isTeamA = true; }
  else if (matchNum === 75) { targetMatchNum = 89; isTeamA = false; }
  else if (matchNum === 74) { targetMatchNum = 90; isTeamA = true; }
  else if (matchNum === 77) { targetMatchNum = 90; isTeamA = false; }
  else if (matchNum === 76) { targetMatchNum = 91; isTeamA = true; }
  else if (matchNum === 79) { targetMatchNum = 91; isTeamA = false; }
  else if (matchNum === 78) { targetMatchNum = 92; isTeamA = true; }
  else if (matchNum === 80) { targetMatchNum = 92; isTeamA = false; }
  else if (matchNum === 81) { targetMatchNum = 93; isTeamA = true; }
  else if (matchNum === 83) { targetMatchNum = 93; isTeamA = false; }
  else if (matchNum === 82) { targetMatchNum = 94; isTeamA = true; }
  else if (matchNum === 84) { targetMatchNum = 94; isTeamA = false; }
  else if (matchNum === 85) { targetMatchNum = 95; isTeamA = true; }
  else if (matchNum === 87) { targetMatchNum = 95; isTeamA = false; }
  else if (matchNum === 86) { targetMatchNum = 96; isTeamA = true; }
  else if (matchNum === 88) { targetMatchNum = 96; isTeamA = false; }

  // Round of 16 (89-96) -> Quarter-finals (97-100)
  else if (matchNum === 89) { targetMatchNum = 97; isTeamA = true; }
  else if (matchNum === 90) { targetMatchNum = 97; isTeamA = false; }
  else if (matchNum === 93) { targetMatchNum = 98; isTeamA = true; }
  else if (matchNum === 94) { targetMatchNum = 98; isTeamA = false; }
  else if (matchNum === 91) { targetMatchNum = 99; isTeamA = true; }
  else if (matchNum === 92) { targetMatchNum = 99; isTeamA = false; }
  else if (matchNum === 95) { targetMatchNum = 100; isTeamA = true; }
  else if (matchNum === 96) { targetMatchNum = 100; isTeamA = false; }

  // Quarter-finals (97-100) -> Semi-finals (101-102)
  else if (matchNum === 97) { targetMatchNum = 101; isTeamA = true; }
  else if (matchNum === 98) { targetMatchNum = 101; isTeamA = false; }
  else if (matchNum === 99) { targetMatchNum = 102; isTeamA = true; }
  else if (matchNum === 100) { targetMatchNum = 102; isTeamA = false; }

  // Semi-finals (101-102) -> Final (104) and Third-place (103)
  else if (matchNum === 101) {
    targetMatchNum = 104; isTeamA = true;
    loserTargetMatchNum = 103; isLoserTeamA = true;
  }
  else if (matchNum === 102) {
    targetMatchNum = 104; isTeamA = false;
    loserTargetMatchNum = 103; isLoserTeamA = false;
  }

  if (targetMatchNum) {
    const targetFixture = await Fixture.findOne({ matchNumber: targetMatchNum });
    if (targetFixture) {
      if (isTeamA) {
        targetFixture.teamA = winnerTeam;
      } else {
        targetFixture.teamB = winnerTeam;
      }
      await targetFixture.save();
    }
  }

  if (loserTargetMatchNum && loserTeam) {
    const loserTargetFixture = await Fixture.findOne({ matchNumber: loserTargetMatchNum });
    if (loserTargetFixture) {
      if (isLoserTeamA) {
        loserTargetFixture.teamA = loserTeam;
      } else {
        loserTargetFixture.teamB = loserTeam;
      }
      await loserTargetFixture.save();
    }
  }
};

// @desc    Settle a match score and calculate user points
// @route   POST /api/admin/settle-match
// @access  Private/Admin
const settleMatch = async (req, res) => {
  try {
    const { matchId, scoreA, scoreB, penaltyScoreA, penaltyScoreB } = req.body;

    if (matchId === undefined || scoreA === undefined || scoreB === undefined) {
      return res.status(400).json({ message: 'Please provide matchId, scoreA and scoreB' });
    }

    const fixture = await Fixture.findOne({ _id: matchId });
    if (!fixture) {
      return res.status(404).json({ message: 'Fixture not found' });
    }

    const actualScoreA = Number(scoreA);
    const actualScoreB = Number(scoreB);
    const actPenaltyA = penaltyScoreA !== undefined && penaltyScoreA !== null ? Number(penaltyScoreA) : null;
    const actPenaltyB = penaltyScoreB !== undefined && penaltyScoreB !== null ? Number(penaltyScoreB) : null;

    // Determine actual winner
    let actualWinner = 'Tie';
    let advancingWinner = null;
    let advancingLoser = null;

    if (actualScoreA > actualScoreB) {
      actualWinner = 'A';
      advancingWinner = fixture.teamA;
      advancingLoser = fixture.teamB;
    } else if (actualScoreB > actualScoreA) {
      actualWinner = 'B';
      advancingWinner = fixture.teamB;
      advancingLoser = fixture.teamA;
    } else {
      // It's a draw at full time
      actualWinner = 'Tie';
      if (fixture.isKnockout && actPenaltyA !== null && actPenaltyB !== null) {
        if (actPenaltyA > actPenaltyB) {
          advancingWinner = fixture.teamA;
          advancingLoser = fixture.teamB;
        } else if (actPenaltyB > actPenaltyA) {
          advancingWinner = fixture.teamB;
          advancingLoser = fixture.teamA;
        }
      }
    }

    // Update match details
    fixture.scoreA = actualScoreA;
    fixture.scoreB = actualScoreB;
    fixture.penaltyScoreA = actPenaltyA;
    fixture.penaltyScoreB = actPenaltyB;
    fixture.winner = actualWinner;
    fixture.status = 'Completed';
    await fixture.save();

    // Fetch all predictions for this match
    const predictions = await Prediction.find({ matchId });

    let exactCount = 0;
    let outcomeCount = 0;
    let incorrectCount = 0;
    let exactPenaltyCount = 0;

    // Process predictions and assign points
    for (const prediction of predictions) {
      const predA = prediction.predScoreA;
      const predB = prediction.predScoreB;
      const predPenA = prediction.predPenaltyScoreA;
      const predPenB = prediction.predPenaltyScoreB;

      // Determine predicted winner
      let predWinner = 'Tie';
      if (predA > predB) {
        predWinner = 'A';
      } else if (predB > predA) {
        predWinner = 'B';
      }

      let pointsEarned = 0;

      // Scoring Rules:
      // 1. Exact full-time scoreline:
      //    a. If knockout match, ended in tie, and predicted exact penalties: +60 points
      //    b. Else (exact full-time score, or incorrect penalties): +30 points
      // 2. Correct outcome (win/loss/draw of full-time): +10 points
      // 3. Otherwise: 0 points
      if (predA === actualScoreA && predB === actualScoreB) {
        if (fixture.isKnockout && actualScoreA === actualScoreB && actPenaltyA !== null && actPenaltyB !== null) {
          if (predPenA === actPenaltyA && predPenB === actPenaltyB) {
            pointsEarned = 60;
            exactPenaltyCount++;
          } else {
            pointsEarned = 30;
          }
        } else {
          pointsEarned = 30;
        }
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

    // Update all users' total points from scratch globally because match is global
    const players = await User.find({ role: 'player' });
    for (const player of players) {
      const userPredictions = await Prediction.find({ userId: player._id });
      const newTotalPoints = userPredictions.reduce((sum, p) => sum + (p.pointsEarned || 0), 0);
      player.totalPoints = newTotalPoints;
      await player.save();
    }

    // Recalculate team points and goalsScored stats globally
    await recalculateTeamStandings();

    // Advance team to next knockout stage if applicable
    if (fixture.isKnockout && advancingWinner) {
      await advanceFixtureWinner(fixture, advancingWinner, advancingLoser);
    }

    // Fetch the updated Top 3 Leaderboard (scoped to admin's players)
    const leaderboard = await User.find({ role: 'player', createdBy: req.user._id })
      .sort({ totalPoints: -1, username: 1 })
      .limit(3)
      .select('username totalPoints');

    // Build the WhatsApp alert text block
    let winnerDisplay = 'Tie 🤝';
    if (actualWinner === 'A') winnerDisplay = `${fixture.teamA} Win 🔴`;
    if (actualWinner === 'B') winnerDisplay = `${fixture.teamB} Win 🔵`;
    if (actualWinner === 'Tie' && fixture.isKnockout && actPenaltyA !== null && actPenaltyB !== null) {
      const penWin = actPenaltyA > actPenaltyB ? fixture.teamA : fixture.teamB;
      winnerDisplay = `Draw (${fixture.teamA} ${actualScoreA}-${actualScoreB} ${fixture.teamB}), ${penWin} wins on penalties (${actPenaltyA}-${actPenaltyB}) 🏆`;
    }

    let leaderboardText = '';
    const medals = ['🥇', '🥈', '🥉'];
    let currentRank = 0;
    let lastPoints = -1;
    leaderboard.forEach((user, index) => {
      if (index === 0 || user.totalPoints !== lastPoints) {
        currentRank++;
      }
      lastPoints = user.totalPoints;
      const medal = medals[currentRank - 1] || '•';
      leaderboardText += `${medal} ${user.username}: ${user.totalPoints} pts\n`;
    });
    if (leaderboard.length === 0) {
      leaderboardText = 'No players registered yet.\n';
    }

    const messageText = `⚽️ *FIFA 2026 WORLD CUP PREDICTION GAME* ⚽️
---------------------------------------------
🏆 *Match Settled!*
*Fixture:* ${fixture.teamA} vs ${fixture.teamB} (Match #${fixture.matchNumber})
*Full Time Score:* ${fixture.teamA} ${actualScoreA} - ${actualScoreB} ${fixture.teamB}${fixture.isKnockout && actualScoreA === actualScoreB && actPenaltyA !== null ? ` (Pens: ${actPenaltyA}-${actPenaltyB})` : ''}
*Outcome:* ${winnerDisplay}

📊 *Match Predictions Stats:*
- Exact Penalty Score (+60 pts): ${exactPenaltyCount}
- Exact Scorelines (+30 pts): ${exactCount - exactPenaltyCount}
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
        exactPenaltyCount,
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

    // Verify both teams exist
    const teamAExists = await Team.findOne({ name: teamA });
    const teamBExists = await Team.findOne({ name: teamB });
    if (!teamAExists || !teamBExists) {
      return res.status(400).json({ message: 'Both teams must be registered' });
    }

    const fixture = await Fixture.create({
      matchNumber,
      teamA,
      teamB,
      matchTime: new Date(matchTime),
      venue: venue || '',
      status: 'Upcoming'
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
      logo: logo || ''
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
    const team = await Team.findOne({ _id: id });
    if (!team) return res.status(404).json({ message: 'Team not found' });
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
    const team = await Team.findOneAndDelete({ _id: id });
    if (!team) return res.status(404).json({ message: 'Team not found' });
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
    const fixture = await Fixture.findOne({ _id: id });
    if (!fixture) return res.status(404).json({ message: 'Fixture not found' });
    if (matchNumber !== undefined) fixture.matchNumber = matchNumber;
    if (teamA) fixture.teamA = teamA;
    if (teamB) fixture.teamB = teamB;
    if (matchTime) fixture.matchTime = new Date(matchTime);
    if (venue !== undefined) fixture.venue = venue;
    if (status) fixture.status = status;
    await fixture.save();
    await recalculateTeamStandings();
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
    const fixture = await Fixture.findOneAndDelete({ _id: id });
    if (!fixture) return res.status(404).json({ message: 'Fixture not found' });
    await Prediction.deleteMany({ matchId: id });
    await recalculateTeamStandings();
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
      name
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
    const groups = await Group.find({}).sort({ name: 1 });
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
    const group = await Group.findOne({ _id: id });
    if (!group) return res.status(404).json({ message: 'Group not found' });
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
    const group = await Group.findOneAndDelete({ _id: id });
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Find all teams under this group
    const teams = await Team.find({ group: id });
    const teamNames = teams.map(t => t.name);

    // Delete those teams
    await Team.deleteMany({ group: id });

    // Find and delete fixtures involving these teams
    const fixtures = await Fixture.find({
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

const getFixturePredictions = async (req, res) => {
  try {
    const { id } = req.params;
    const predictions = await Prediction.find({ matchId: id }).populate('userId', 'username');
    res.json(predictions);
  } catch (error) {
    console.error('Error fetching fixture predictions:', error);
    res.status(500).json({ message: 'Server error fetching predictions', error: error.message });
  }
};

// @desc    Generate/sync knockout fixtures automatically from Gemini API with search grounding
// @route   POST /api/admin/generate-knockout
// @access  Private/Admin
const generateKnockoutFixtures = async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'AI service configuration error: missing API key' });
    }

    const systemPrompt = `You are an expert sports data analyst. Use Google Search to find the exact match schedule for the FIFA World Cup 2026 knockout stage (matches 73 to 104).
You must return a JSON array of objects representing the matches.
Each object must have:
- matchNumber: number (73 to 104)
- teamA: string (e.g. "South Africa" or "Winner Group A")
- teamB: string (e.g. "Canada" or "Runner-up Group B")
- matchTime: string (ISO 8601 format, e.g. "2026-06-28T22:00:00Z")
- venue: string (e.g. "Los Angeles Stadium")

Ensure you cover matches 73 to 104. For Round of 32 (73-88), use the actual teams if they are already determined (e.g. South Africa vs Canada, Germany vs Paraguay, Netherlands vs Morocco, Brazil vs Japan, France vs Sweden, Ivory Coast vs Norway, Mexico vs Ecuador, England vs DR Congo, USA vs Bosnia and Herzegovina, Belgium vs Senegal, Portugal vs Croatia, Spain vs Austria, Switzerland vs Algeria, Argentina vs Cape Verde, Colombia vs Ghana, Australia vs Egypt). For subsequent rounds (89-104), use the correct tournament bracket placeholders (e.g., "Winner Match 73" or "Winner Match 74").
Return only the raw JSON. Do not include markdown code block syntax. Just the JSON text.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: "Fetch and return the FIFA World Cup 2026 knockout stage matches 73 to 104 schedule as JSON." }]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        tools: [
          {
            google_search: {}
          }
        ],
        generationConfig: {
          temperature: 0.1
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error during knockout generation:', errText);
      return res.status(502).json({ message: 'Error communicating with AI service to fetch matches' });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(502).json({ message: 'Empty response received from AI service' });
    }

    const startIdx = text.indexOf('[');
    const endIdx = text.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) {
      console.error('Could not find JSON array in response text:', text);
      return res.status(502).json({ message: 'Invalid response format from AI service' });
    }

    const jsonStr = text.substring(startIdx, endIdx + 1);
    const matches = JSON.parse(jsonStr);

    const correctTimes = {
      73: { time: "2026-06-28T19:00:00.000Z", venue: "Los Angeles Stadium" },
      74: { time: "2026-06-29T20:30:00.000Z", venue: "Boston Stadium" },
      75: { time: "2026-06-30T01:00:00.000Z", venue: "Estadio Monterrey" },
      76: { time: "2026-06-29T17:00:00.000Z", venue: "Houston Stadium" },
      77: { time: "2026-06-30T18:00:00.000Z", venue: "New York New Jersey Stadium" },
      78: { time: "2026-06-30T15:00:00.000Z", venue: "Dallas Stadium" },
      79: { time: "2026-06-30T23:00:00.000Z", venue: "Mexico City Stadium" },
      80: { time: "2026-07-01T16:00:00.000Z", venue: "Atlanta Stadium" },
      81: { time: "2026-07-02T00:00:00.000Z", venue: "San Francisco Bay Area Stadium" },
      82: { time: "2026-07-01T20:00:00.000Z", venue: "Seattle Stadium" },
      83: { time: "2026-07-02T23:00:00.000Z", venue: "Toronto Stadium" },
      84: { time: "2026-07-02T19:00:00.000Z", venue: "Los Angeles Stadium" },
      85: { time: "2026-07-03T03:00:00.000Z", venue: "Vancouver Stadium" },
      86: { time: "2026-07-03T22:00:00.000Z", venue: "Miami Stadium" },
      87: { time: "2026-07-04T01:30:00.000Z", venue: "Houston Stadium" },
      88: { time: "2026-07-03T18:00:00.000Z", venue: "Philadelphia Stadium" },
      89: { time: "2026-07-05T01:00:00.000Z", venue: "Philadelphia Stadium" },
      90: { time: "2026-07-04T21:00:00.000Z", venue: "Houston Stadium" },
      91: { time: "2026-07-06T00:00:00.000Z", venue: "New York New Jersey Stadium" },
      92: { time: "2026-07-06T04:00:00.000Z", venue: "Mexico City Stadium" },
      93: { time: "2026-07-06T23:00:00.000Z", venue: "Dallas Stadium" },
      94: { time: "2026-07-07T04:00:00.000Z", venue: "Seattle Stadium" },
      95: { time: "2026-07-07T20:00:00.000Z", venue: "Atlanta Stadium" },
      96: { time: "2026-07-09T00:00:00.000Z", venue: "Vancouver Stadium" },
      97: { time: "2026-07-09T20:00:00.000Z", venue: "Gillette Stadium" },
      98: { time: "2026-07-10T19:00:00.000Z", venue: "SoFi Stadium" },
      99: { time: "2026-07-11T21:00:00.000Z", venue: "Hard Rock Stadium" },
      100: { time: "2026-07-12T01:00:00.000Z", venue: "Arrowhead Stadium" },
      101: { time: "2026-07-14T23:00:00.000Z", venue: "Dallas Stadium" },
      102: { time: "2026-07-15T23:00:00.000Z", venue: "Atlanta Stadium" },
      103: { time: "2026-07-18T21:00:00.000Z", venue: "Miami Stadium" },
      104: { time: "2026-07-19T19:00:00.000Z", venue: "New York New Jersey Stadium" }
    };

    let createdCount = 0;
    let updatedCount = 0;

    for (const match of matches) {
      if (!match.matchNumber || !match.teamA || !match.teamB) {
        continue;
      }

      const staticData = correctTimes[match.matchNumber];
      const matchTime = staticData ? new Date(staticData.time) : new Date(match.matchTime);
      const venue = staticData ? staticData.venue : (match.venue || '');

      const existing = await Fixture.findOne({ matchNumber: match.matchNumber });
      if (!existing) {
        await Fixture.create({
          matchNumber: match.matchNumber,
          teamA: match.teamA,
          teamB: match.teamB,
          matchTime,
          venue,
          isKnockout: true,
          status: 'Upcoming'
        });
        createdCount++;
      } else {
        if (existing.status === 'Upcoming') {
          existing.teamA = match.teamA;
          existing.teamB = match.teamB;
          existing.matchTime = matchTime;
          existing.venue = venue;
          existing.isKnockout = true;
          await existing.save();
          updatedCount++;
        }
      }
    }

    res.json({
      message: 'Knockout fixtures generated and synced successfully',
      createdCount,
      updatedCount
    });

  } catch (error) {
    console.error('Error generating knockout fixtures:', error);
    res.status(500).json({ message: 'Server error generating knockout fixtures', error: error.message });
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
  deleteGroup,
  getFixturePredictions,
  generateKnockoutFixtures
};
