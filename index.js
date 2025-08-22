const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const P = require('pino');

// ─── Start Bot Function ───
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state
    });

    // Save creds jab bhi update ho
    sock.ev.on('creds.update', saveCreds);

    // Connection updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect =
                lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting...', shouldReconnect);

            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot connected successfully!');
            sock.sendMessage(sock.user.id, { text: '✅ Bot Connected Successfully!' });
        }
    });

    // Incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const body =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '';

        // Commands
        if (body === '.ping') {
            await sock.sendMessage(from, { text: '🏓 Pong! Bot is alive.' }, { quoted: msg });
        }

        if (body === '.owner') {
            await sock.sendMessage(from, {
                text: `👑 Owner: NEXTY\n📞 Number: wa.me/923192084504`
            });
        }

        if (body === '.jid') {
            await sock.sendMessage(from, {
                text: `🔑 Chat JID: ${from}`
            });
        }

        if (body.startsWith('.forward ')) {
            const jid = body.split(' ')[1];
            if (jid && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                const quoted = msg.message.extendedTextMessage.contextInfo;
                await sock.sendMessage(jid, quoted.quotedMessage, {});
            } else {
                await sock.sendMessage(from, { text: '⚠️ Reply to a message with `.forward jid`' });
            }
        }

        if (body === '.menu') {
            await sock.sendMessage(from, {
                text: `✨ Stylish Menu ✨

📌 .ping → Check bot status
📌 .owner → Show owner info
📌 .jid → Show current chat JID
📌 .forward <jid> → Forward replied msg

Enjoy 🚀`
            });

            // Voice note with menu
            await sock.sendMessage(from, {
                audio: { url: 'https://files.catbox.moe/9j4qg6.mp3' },
                mimetype: 'audio/mpeg',
                ptt: true
            });
        }
    });
}

// ─── Run Bot ───
startBot();
