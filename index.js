const {
  makeWASocket,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");
const config = require("./config");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: !config.sessionId
  });

  sock.ev.on("creds.update", saveCreds);

  // ✅ Connection Update Listener
  sock.ev.on("connection.update", async (update) => {
    const { connection } = update;

    if (connection === "open") {
      console.log(`✅ Bot Connected as: ${sock.user.id}`);

      // Owner ko message ab safe hai
      await sock.sendMessage(config.owner + "@s.whatsapp.net", {
        text: `✅ *${config.botName} Connected Successfully!*\n\n📌 *Session:* ${config.sessionId}`
      });
    }

    if (connection === "close") {
      console.log("❌ Connection closed, reconnecting...");
      startBot();
    }
  });

  // 📌 Message Listener
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || !msg.key.remoteJid) return;

    const from = msg.key.remoteJid;
    const type = Object.keys(msg.message)[0];
    const body =
      msg.message.conversation ||
      msg.message[type]?.text ||
      msg.message[type]?.caption ||
      "";

    if (!body.startsWith(config.prefix)) return;
    const cmd = body.slice(config.prefix.length).trim().split(" ")[0].toLowerCase();
    const args = body.split(" ").slice(1);

    // 🔹 Stylish Menu + Voice Note
    if (cmd === "menu") {
      const menuText = `🌟 *${config.botName} MENU* 🌟

╭───❏ Commands ❏
│ ✦ .owner → Owner info
│ ✦ .jid   → Get current chat JID
│ ✦ .forward [jid] (reply) → Forward msg
╰───────────────`;

      // Pehle menu text bhejo
      await sock.sendMessage(from, { text: menuText });

      // Ab voice note bhejo
      await sock.sendMessage(from, {
        audio: { url: "https://files.catbox.moe/9j4qg6.mp3" },
        mimetype: "audio/mp4",
        ptt: true
      });
    }

    // 🔹 Owner
    if (cmd === "owner") {
      await sock.sendMessage(from, {
        text: `👑 *Owner Info*\n\nName: NEXTY\nNumber: wa.me/${config.owner}`
      });
    }

    // 🔹 JID
    if (cmd === "jid") {
      await sock.sendMessage(from, {
        text: `📌 *Current JID:*\n\`${from}\``
      });
    }

    // 🔹 Forward (reply to msg)
    if (cmd === "forward") {
      if (!args[0]) return await sock.sendMessage(from, { text: "❌ Please provide a JID" });
      if (!msg.message.extendedTextMessage?.contextInfo?.stanzaId) {
        return await sock.sendMessage(from, { text: "❌ Please reply to a message to forward" });
      }

      const targetJid = args[0];
      const quotedMsg = await sock.loadMessage(from, msg.message.extendedTextMessage.contextInfo.stanzaId);

      if (quotedMsg) {
        await sock.sendMessage(targetJid, { forward: quotedMsg }, { quoted: null });
        await sock.sendMessage(from, { text: `✅ Message forwarded to ${targetJid}` });
      }
    }
  });
}

startBot();
