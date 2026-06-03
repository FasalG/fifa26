const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'super_secret_fifa_2026_key_for_jwt_auth_12345!', {
    expiresIn: '30d'
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Check if user exists
    const userExists = await User.findOne({ 
      $or: [{ email: email.toLowerCase() }, { username }] 
    });

    if (userExists) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }

    // Create user. Only admin registration is permitted publicly.
    const user = await User.create({
      username,
      email: email.toLowerCase(),
      password,
      role: 'admin'
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        totalPoints: user.totalPoints,
        token: generateToken(user._id)
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration', error: error.message });
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { loginCredential, password } = req.body; // Can be username or email

    if (!loginCredential || !password) {
      return res.status(400).json({ message: 'Please provide credentials and password' });
    }

    // Find by email or username
    const user = await User.findOne({
      $or: [
        { email: loginCredential.toLowerCase() },
        { username: loginCredential }
      ]
    });

    if (user && (await user.comparePassword(password))) {
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        totalPoints: user.totalPoints,
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ message: 'Invalid email/username or password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching profile', error: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile
};
