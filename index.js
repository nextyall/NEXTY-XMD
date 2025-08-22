const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const zlib = require('zlib');

const SESSION_ID = process.env.SESSION_ID; // 👈 Heroku Config Vars me apna session id daalna

async function useSessionString(sessionString) {
    let [prefix, base64Data] = sessionString.split(";;;");
    if (!base64Data) throw new Error("❌ Invalid session format!");

    let compressed = Buffer.from(base64Data, "base64");
    let jsonData = zlib.gunzipSync(compressed).toString();
    return JSON.parse(jsonData);
}

async function startBot() {
    if (!SESSION_ID) {
        console.error("❌ SESSION_ID not found! Heroku Config Vars me set karo.");
        return;
    }

    let creds;
    try {
        creds = await useSessionString(SESSION_ID);
    } catch (err) {
        console.error("❌ Invalid Session ID:", err);
        return;
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    Object.assign(state.creds, creds); // 👈 Apna session set kar diya

    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, console.log)
        },
        printQRInTerminal: false // Heroku pe QR ki zarurat nahi
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            console.log("🔴 Disconnected, reconnecting...");
            startBot();
        } else if (connection === 'open') {
            console.log("🟢 Bot Connected Successfully!");
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (text.toLowerCase() === "ping") {
            await sock.sendMessage(from, { text: "pong ✅" });
        }
    });
}

startBot();
