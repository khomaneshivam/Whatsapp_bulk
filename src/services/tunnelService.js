const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { getSetting, setSetting } = require("../config/database");
const config = require("../config/env");

class TunnelService {
  constructor() {
    this.activeTunnel = null;
    this.activeUrl = null;
    this.tunnelType = "localhost.run";
    this.isStarting = false;
    this.port = config.PORT || 5000;
    this.retryTimer = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Checks if cloudflared binary is available in PATH or project directory
   */
  findCloudflared() {
    const localBinName = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
    const localBinPath = path.resolve(__dirname, "../../", localBinName);
    if (fs.existsSync(localBinPath)) {
      return localBinPath;
    }

    try {
      const checkCmd = process.platform === "win32" ? "where cloudflared" : "which cloudflared";
      const out = execSync(checkCmd, { stdio: ["pipe", "pipe", "ignore"] }).toString().trim();
      if (out) {
        return out.split(/\r?\n/)[0].trim();
      }
    } catch (e) {
      // not found in PATH
    }
    return null;
  }

  /**
   * Initializes and starts the background tunnel automatically
   */
  async initTunnel(port = 5000) {
    this.port = port;
    if (this.isStarting || this.activeUrl) {
      return { success: true, url: this.activeUrl, type: this.tunnelType };
    }

    this.isStarting = true;
    console.log(`[TunnelService] Initializing automatic secure HTTPS tunnel for port ${this.port}...`);

    // Prioritize Cloudflare Tunnel if installed
    const cfBin = this.findCloudflared();
    if (cfBin) {
      const cfStarted = this.startCloudflareTunnel(cfBin);
      if (cfStarted) {
        return { success: true, url: this.activeUrl, type: "cloudflared" };
      }
    }

    // Fallback to SSH localhost.run
    this.startSshTunnel();
    return { success: true, url: this.activeUrl, type: this.tunnelType };
  }

  /**
   * Starts Cloudflare Tunnel (trycloudflare.com) - Highly stable, no drops
   */
  startCloudflareTunnel(binPath) {
    if (this.activeTunnel) {
      try { this.activeTunnel.kill(); } catch (e) {}
      this.activeTunnel = null;
    }

    try {
      console.log(`[TunnelService] Starting Cloudflare Tunnel using ${binPath}...`);
      const cf = spawn(binPath, [
        "tunnel",
        "--url", `http://localhost:${this.port}`,
        "--no-autoupdate"
      ]);

      this.activeTunnel = cf;
      this.tunnelType = "cloudflared";

      const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

      const handleData = (data) => {
        const text = data.toString();
        const match = text.match(urlRegex);
        if (match && (!this.activeUrl || this.activeUrl !== match[0])) {
          this.activeUrl = match[0];
          this.isStarting = false;
          this.reconnectAttempts = 0;
          setSetting("PUBLIC_WEBHOOK_URL", this.activeUrl);
          this.logTunnelSuccess(this.activeUrl, "Cloudflare Tunnel (trycloudflare.com)");
        }
      };

      cf.stdout.on("data", handleData);
      cf.stderr.on("data", handleData);

      cf.on("close", (code) => {
        console.warn(`[TunnelService] Cloudflare tunnel closed (code ${code}). Reconnecting in 5s...`);
        this.activeUrl = null;
        this.activeTunnel = null;
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.initTunnel(this.port), 5000);
      });

      cf.on("error", (err) => {
        console.error("[TunnelService] Cloudflare tunnel spawn error:", err.message);
        this.startSshTunnel();
      });

      return true;
    } catch (err) {
      console.warn("[TunnelService] Failed to start Cloudflare tunnel, falling back to SSH:", err.message);
      return false;
    }
  }

  /**
   * Fallback SSH tunnel using localhost.run with keepalive
   */
  startSshTunnel() {
    if (this.activeTunnel) {
      try { this.activeTunnel.kill(); } catch (e) {}
      this.activeTunnel = null;
    }

    try {
      const ssh = spawn("ssh", [
        "-R", `80:localhost:${this.port}`,
        "-o", "StrictHostKeyChecking=no",
        "-o", "ServerAliveInterval=15",
        "-o", "ServerAliveCountMax=6",
        "-o", "TCPKeepAlive=yes",
        "nokey@localhost.run"
      ]);

      this.activeTunnel = ssh;
      this.tunnelType = "localhost.run";

      ssh.stdout.on("data", (data) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9.-]+\.lhr\.life/);
        if (match && (!this.activeUrl || this.activeUrl !== match[0])) {
          this.activeUrl = match[0];
          this.isStarting = false;
          this.reconnectAttempts = 0;
          setSetting("PUBLIC_WEBHOOK_URL", this.activeUrl);
          this.logTunnelSuccess(this.activeUrl, "localhost.run (SSH)");
        }
      });

      ssh.stderr.on("data", (data) => {
        const text = data.toString();
        if (text.includes("Permission denied")) {
          console.error("[TunnelService] SSH Permission issue:", text.trim());
        }
      });

      ssh.on("close", (code) => {
        this.activeUrl = null;
        this.activeTunnel = null;
        this.reconnectAttempts++;
        const delay = Math.min(3000 * this.reconnectAttempts, 15000);
        console.warn(`[TunnelService] Tunnel disconnected (code ${code}). Reconnecting in ${delay / 1000}s...`);
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.startSshTunnel(), delay);
      });

      ssh.on("error", (err) => {
        console.error("[TunnelService] Spawn error:", err.message);
      });
    } catch (err) {
      console.error("[TunnelService] Failed to start SSH tunnel:", err.message);
      this.isStarting = false;
    }
  }

  /**
   * Logs a clear, high-visibility summary of the live tunnel configuration
   */
  logTunnelSuccess(url, provider = "localhost.run") {
    const token = getSetting("WEBHOOK_VERIFY_TOKEN") || config.WEBHOOK_VERIFY_TOKEN;
    console.log(`
========================================================================
🎉 LIVE META WHATSAPP WEBHOOK TUNNEL ESTABLISHED! (${provider})
========================================================================
👉 Callback URL:  ${url}/webhook
👉 Verify Token:  ${token}
------------------------------------------------------------------------
⚡ Runs automatically on startup. No separate terminal required.
✅ Meta Developer Portal > WhatsApp > Configuration:
   1. Paste the Callback URL and Verify Token above.
   2. Click "Verify and Save".
   3. Under "Webhook fields", click "Manage" and check "messages".
========================================================================
`);
  }

  /**
   * Returns current tunnel status and URL
   */
  getStatus() {
    const storedUrl = getSetting("PUBLIC_WEBHOOK_URL");
    const activeUrl = this.activeUrl || storedUrl;
    return {
      connected: Boolean(activeUrl),
      url: activeUrl,
      webhookUrl: activeUrl ? `${activeUrl}/webhook` : null,
      type: this.tunnelType
    };
  }

  /**
   * Manually restart the tunnel
   */
  async restart() {
    this.activeUrl = null;
    clearTimeout(this.retryTimer);
    const cfBin = this.findCloudflared();
    if (cfBin) {
      this.startCloudflareTunnel(cfBin);
    } else {
      this.startSshTunnel();
    }

    return new Promise((resolve) => {
      let waited = 0;
      const interval = setInterval(() => {
        waited += 500;
        if (this.activeUrl || waited >= 6000) {
          clearInterval(interval);
          resolve(this.getStatus());
        }
      }, 500);
    });
  }
}

module.exports = new TunnelService();
