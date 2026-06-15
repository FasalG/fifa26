require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const { initWhatsApp } = require('./services/whatsappService');

// Import routes
const authRoutes = require('./routes/authRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const chatRoutes = require('./routes/chatRoutes');

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
app.use('/api/chat', chatRoutes);

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
const PORT = process.env.PORT || 5002;
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


// Start HTTP Server
app.listen(PORT, () => {
  console.log(`🚀 Express server running on port ${PORT}`);
  
  // Initialize WhatsApp client
  try {
    // initWhatsApp();
  } catch (wsError) {
    console.error('❌ WhatsApp Init Failed:', wsError.message);
  }
});

// Start HTTPS Server if certs exist
const HTTPS_PORT = process.env.HTTPS_PORT || 443;
try {
  if (fs.existsSync(__dirname + '/ssl/server.key') && fs.existsSync(__dirname + '/ssl/server.cert')) {
    const options = {
      key: fs.readFileSync(__dirname + '/ssl/server.key'),
      cert: fs.readFileSync(__dirname + '/ssl/server.cert')
    };
    https.createServer(options, app).listen(HTTPS_PORT, () => {
      console.log(`🔒 Express HTTPS server running on port ${HTTPS_PORT}`);
    });
  }
} catch (e) {
  console.log('HTTPS server not started: ' + e.message);
}

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

