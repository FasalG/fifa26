const express = require('express');
const router = express.Router();
const { getFixtures, submitPrediction, getLeaderboard, getTeams, getGroups, getChatbotResponse } = require('../controllers/predictionController');
const { protect } = require('../middleware/authMiddleware');

router.get('/fixtures', protect, getFixtures);
router.post('/predictions', protect, submitPrediction);
router.get('/leaderboard', protect, getLeaderboard);
router.get('/teams', protect, getTeams);
router.get('/groups', protect, getGroups);
router.post('/chat', protect, getChatbotResponse);

module.exports = router;
