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

let dbError = null;

// Root route for status check
app.get('/api/status', (req, res) => {
  const maskedUri = MONGO_URI
    ? MONGO_URI.replace(/:([^@]+)@/, ':******@')
    : null;
  res.json({
    status: 'online',
    timestamp: new Date(),
    message: 'FIFA 2026 Office Prediction Game API',
    database: {
      state: mongoose.connection.readyState,
      stateName: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
      uri: maskedUri,
      error: dbError
    }
  });
});

// Database Connection
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fifa2026';

// mongoose
//   .connect(MONGO_URI)
//   .then(async () => {
//     console.log('🔌 Connected to MongoDB Database.');
    
//     // Start Server
//     app.listen(PORT, () => {
//       console.log(`🚀 Express server running on port ${PORT}`);
//       // Initialize WhatsApp client
//       initWhatsApp();
//     });
//   })
//   .catch((err) => {
//     console.error('❌ Database connection failure:', err.message);
//     process.exit(1);
//   });


  // Start Server independently so Render stays happy
app.listen(PORT, () => {
  console.log(`🚀 Express server running on port ${PORT}`);
  
  // Initialize WhatsApp client
  try {
    // initWhatsApp();
  } catch (wsError) {
    console.error('❌ WhatsApp Init Failed:', wsError.message);
  }
});

// Connect to Database asynchronously in the background
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('🔌 Connected to MongoDB Database.');
    dbError = null;
  })
  .catch((err) => {
    console.error('❌ Database connection failure:', err.message);
    dbError = err.message;
    // Removed process.exit(1) so the web process stays alive for Render
  });

