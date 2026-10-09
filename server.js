const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./src/config/env");
require("./src/config/database"); // Initializes local SQLite DB
const schedulerService = require("./src/services/schedulerService");
const tunnelService = require("./src/services/tunnelService");
const apiRoutes = require("./src/routes/apiRoutes");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Static files (Web Dashboard)
app.use(express.static(path.join(__dirname, "public")));

const webhookController = require("./src/controllers/webhookController");

// Direct Root-level Webhook endpoints for Meta (https://domain/webhook)
app.get("/webhook", webhookController.handleVerification);
app.post("/webhook", webhookController.handleIncomingEvent);

// API routes
app.use("/api", apiRoutes);

// Fallback for SPA
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api") && !req.path.startsWith("/webhook")) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  } else {
    res.status(404).json({ success: false, message: "API endpoint not found" });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal server error"
  });
});

const PORT = config.PORT || 5000;
const server = app.listen(PORT, () => {
  // Start background campaign scheduler
  schedulerService.initScheduler();

  // Automatically start secure HTTPS tunnel for Meta Webhooks in a single shot
  tunnelService.initTunnel(PORT).catch(err => {
    console.warn("[Server] Note: Auto-tunnel initialization error:", err.message);
  });

  console.log(`
========================================================================
🚀 WhatsApp Bulk Broadcast System (Isolated Project)
📡 Server running on: http://localhost:${PORT}
💾 Database: ${path.join(config.DATA_DIR, "whatsapp_bulk.db")}
📱 Meta Phone ID: ${config.WHATSAPP_PHONE_NUMBER_ID || "Not Configured"}
⏰ Scheduler: Active (Auto-Dispatches Scheduled Campaigns)
========================================================================
  `);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down WhatsApp Bulk Messenger gracefully...");
  schedulerService.stopScheduler();
  server.close(() => {
    console.log("Server stopped.");
    process.exit(0);
  });
});
