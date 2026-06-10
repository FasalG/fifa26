const express = require('express');
const router = express.Router();
const {
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
  getFixturePredictions
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.post('/settle-match', protect, adminOnly, settleMatch);

router.post('/fixtures', protect, adminOnly, createFixture);
router.put('/fixtures/:id', protect, adminOnly, updateFixture);
router.delete('/fixtures/:id', protect, adminOnly, deleteFixture);
router.get('/fixtures/:id/predictions', protect, adminOnly, getFixturePredictions);

router.post('/teams', protect, adminOnly, createTeam);
router.put('/teams/:id', protect, adminOnly, updateTeam);
router.delete('/teams/:id', protect, adminOnly, deleteTeam);

router.post('/players', protect, adminOnly, createPlayer);
router.get('/players', protect, adminOnly, getPlayers);
router.put('/players/:id', protect, adminOnly, updatePlayer);
router.delete('/players/:id', protect, adminOnly, deletePlayer);

router.post('/groups', protect, adminOnly, createGroup);
router.get('/groups', protect, adminOnly, getGroups);
router.put('/groups/:id', protect, adminOnly, updateGroup);
router.delete('/groups/:id', protect, adminOnly, deleteGroup);

module.exports = router;
