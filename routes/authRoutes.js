const express = require('express');
const router = express.Router();
const { registerUser, registerPlayerUnderAdmin, loginUser, getUserProfile } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/register-player', registerPlayerUnderAdmin);
router.post('/login', loginUser);
router.get('/me', protect, getUserProfile);

module.exports = router;
