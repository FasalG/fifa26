const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let client = null;
let isReady = false;

const initWhatsApp = () => {
  console.log('Initializing WhatsApp Client...');
  try {
    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage'
        ]
      }
    });

    client.on('qr', (qr) => {
      console.log('\n======================================================');
      console.log('📢 FIFA 2026: SCAN THIS QR CODE TO CONNECT WHATSAPP 📢');
      console.log('======================================================\n');
      qrcode.generate(qr, { small: true });
      console.log('\n======================================================\n');
    });

    client.on('ready', () => {
      console.log('✅ WhatsApp Client is READY and listening!');
      isReady = true;
    });

    client.on('auth_failure', (msg) => {
      console.error('❌ WhatsApp Authentication failure:', msg);
    });

    client.on('disconnected', (reason) => {
      console.log('⚠️ WhatsApp Client was disconnected:', reason);
      isReady = false;
    });

    client.initialize().catch(err => {
      console.error('❌ Failed to initialize WhatsApp client (headless browser issue):', err.message);
      console.log('ℹ️ The server will continue running. WhatsApp alerts will be printed to console.');
    });
  } catch (error) {
    console.error('❌ Error initializing WhatsApp Client:', error.message);
  }
};

const sendWhatsAppGroupAlert = async (messageText) => {
  const groupId = process.env.WHATSAPP_GROUP_ID || '120363205934574921@g.us';
  console.log(`[WHATSAPP ALERT BROADCAST] Sending to Group: ${groupId}`);
  console.log('----------------- MESSAGE CONTENT -----------------');
  console.log(messageText);
  console.log('---------------------------------------------------');

  if (!client || !isReady) {
    console.warn('⚠️ WhatsApp client is not connected. Alert logged to terminal only.');
    return false;
  }
  try {
    await client.sendMessage(groupId, messageText);
    console.log(`✅ WhatsApp alert sent successfully to ${groupId}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error.message);
    return false;
  }
};

module.exports = {
  initWhatsApp,
  sendWhatsAppGroupAlert,
  isReady: () => isReady
};
