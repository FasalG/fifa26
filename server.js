require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { initWhatsApp } = require('./services/whatsappService');

// Import routes
const authRoutes = require('./routes/authRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Import models for seeding
const Fixture = require('./models/Fixture');
const User = require('./models/User');
const Team = require('./models/Team');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes middleware
app.use('/api/auth', authRoutes);
app.use('/api', predictionRoutes);
app.use('/api/admin', adminRoutes);

// Root route for status check
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date(),
    message: 'FIFA 2026 Office Prediction Game API'
  });
});

// Database Connection
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fifa2026';

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('🔌 Connected to MongoDB Database.');
    
    // Start Server
    app.listen(PORT, () => {
      console.log(`🚀 Express server running on port ${PORT}`);
      // Initialize WhatsApp client
      initWhatsApp();
    });
  })
  .catch((err) => {
    console.error('❌ Database connection failure:', err.message);
    process.exit(1);
  });
