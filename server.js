// Enforce Indian Standard Time (IST) globally across all Node.js operations
process.env.TZ = "Asia/Kolkata";

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

const fs = require("fs");
const distPath = path.join(__dirname, "frontend", "dist");
const publicPath = path.join(__dirname, "public");

// Static files (Modern React SPA build or fallback)
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}
app.use(express.static(publicPath));

const uploadsPath = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// Inbound media on-demand fallback if file has not finished downloading yet
app.get("/uploads/inbound/:filename", async (req, res, next) => {
  const filePath = path.join(uploadsPath, "inbound", req.params.filename);
  if (fs.existsSync(filePath)) {
    return next();
  }
  try {
    const rawId = req.params.filename.replace(/\.[a-zA-Z0-9]+$/, "");
    if (/^[a-zA-Z0-9_.-]+$/.test(rawId)) {
      const { downloadAndSaveInboundMedia } = require("./src/services/metaWhatsAppService");
      const downloadRes = await downloadAndSaveInboundMedia(rawId);
      if (downloadRes?.localPath && fs.existsSync(downloadRes.localPath)) {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
        return res.sendFile(downloadRes.localPath);
      }
    }
  } catch (e) {
    console.warn("[Uploads Inbound On-Demand] Error:", e.message);
  }
  return res.status(404).json({ success: false, message: "Inbound media file not found" });
});

app.use("/uploads", express.static(uploadsPath));

const webhookController = require("./src/controllers/webhookController");

// Direct Root-level Webhook endpoints for Meta (https://domain/webhook)
app.get("/webhook", webhookController.handleVerification);
app.post("/webhook", webhookController.handleIncomingEvent);

// API routes
app.use("/api", apiRoutes);

// Fallback for SPA
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api") && !req.path.startsWith("/webhook") && !req.path.startsWith("/uploads")) {
    if (fs.existsSync(path.join(distPath, "index.html"))) {
      res.sendFile(path.join(distPath, "index.html"));
    } else {
      res.sendFile(path.join(publicPath, "index.html"));
    }
  } else {
    res.status(404).json({ success: false, message: "Resource not found" });
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
const server = app.listen(PORT, "0.0.0.0", () => {
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
