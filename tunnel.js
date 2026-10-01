const { spawn } = require("child_process");
const { getSetting, setSetting } = require("./src/config/database");

console.log("Starting instant secure HTTPS tunnel for WhatsApp Meta Webhook...");

function startTunnel() {
  const token = getSetting("WEBHOOK_VERIFY_TOKEN") || "wb_verify_88a038248b9103e49c2b172f7b17ec2f";

  const ssh = spawn("ssh", [
    "-R", "80:localhost:5000",
    "-o", "StrictHostKeyChecking=no",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=3",
    "nokey@localhost.run"
  ]);

  let publicUrl = null;

  ssh.stdout.on("data", (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9.-]+\.lhr\.life/);
    if (match && !publicUrl) {
      publicUrl = match[0];
      setSetting("PUBLIC_WEBHOOK_URL", publicUrl);
      console.log(`
========================================================================
🎉 LIVE PUBLIC HTTPS TUNNEL ESTABLISHED!
========================================================================
Copy and paste these EXACT values into Meta Developer Portal:

👉 Callback URL:
   ${publicUrl}/webhook

👉 Verify token:
   ${token}
========================================================================
Keep this tunnel running while using WhatsApp Webhooks.
`);
    }
  });

  ssh.stderr.on("data", (data) => {
    const text = data.toString();
    if (text.includes("Permission denied")) {
      console.error("[Tunnel Error] SSH permission issue:", text);
    }
  });

  ssh.on("close", (code) => {
    console.log(`[Tunnel] Connection closed (code ${code}). Reconnecting in 3s...`);
    setTimeout(startTunnel, 3000);
  });
}

startTunnel();
