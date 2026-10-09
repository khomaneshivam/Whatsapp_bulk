const tunnelService = require("./src/services/tunnelService");
const config = require("./src/config/env");

console.log("[tunnel.js] Starting standalone HTTPS tunnel...");
tunnelService.initTunnel(config.PORT || 5000);
