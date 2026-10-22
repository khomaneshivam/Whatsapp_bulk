// Enforce Indian Standard Time (IST) globally across all Node.js operations
process.env.TZ = "Asia/Kolkata";

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const config = require("./src/config/env");
require("./src/config/database"); // Initializes local SQLite DB
const schedulerService = require("./src/services/schedulerService");
const tunnelService = require("./src/services/tunnelService");
const apiRoutes = require("./src/routes/apiRoutes");
const webhookController = require("./src/controllers/webhookController");

const app = express();

// 1. CORS Configuration: In production, enforce trusted origin policy
const corsOptions = {
  origin: (origin, callback) => {
    // Non-browser or server-to-server requests
    if (!origin) return callback(null, true);
    if (config.NODE_ENV !== "production") {
      return callback(null, true);
    }
    const allowed = (config.CORS_ORIGIN || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    if (allowed.length === 0 || allowed.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS policy violation: origin not allowed"));
  },
  credentials: true
};
app.use(cors(corsOptions));

// 2. Request Parsers with Raw Body Preservation for Meta Webhook HMAC Verification
app.use(
  express.json({
    limit: "50mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const distPath = path.join(__dirname, "frontend", "dist");
const publicPath = path.join(__dirname, "public");

// Static files (Modern React SPA build or fallback)
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}
app.use(express.static(publicPath));

const uploadsPath = path.join(__dirname, "public", "uploads");
const inboundUploadsPath = path.join(uploadsPath, "inbound");
if (!fs.existsSync(inboundUploadsPath)) {
  fs.mkdirSync(inboundUploadsPath, { recursive: true });
}

// 3. Uploads Path Traversal Guard
app.use("/uploads", (req, res, next) => {
  let decodedUrl = "";
  try {
    decodedUrl = decodeURIComponent(req.url || "");
  } catch (e) {
    return res.status(400).json({ success: false, message: "Malformed URI." });
  }
  if (req.url.includes("..") || decodedUrl.includes("..") || decodedUrl.includes("\\")) {
    return res.status(403).json({ success: false, message: "Forbidden: Path traversal detected." });
  }
  next();
});

// 4. Inbound Media On-Demand with Path Traversal Protection
app.get("/uploads/inbound/:filename", async (req, res, next) => {
  const safeFilename = path.basename(req.params.filename);
  const resolvedBase = path.resolve(inboundUploadsPath);
  const resolvedTarget = path.resolve(inboundUploadsPath, safeFilename);

  // Path traversal check
  if (!resolvedTarget.startsWith(resolvedBase)) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  if (fs.existsSync(resolvedTarget)) {
    return next();
  }

  try {
    const rawId = safeFilename.replace(/\.[a-zA-Z0-9]+$/, "");
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

  return res.status(404).json({ success: false, message: "Inbound media file not found." });
});

app.use("/uploads", express.static(uploadsPath));

// 4. Direct Root-level Webhook endpoints for Meta (https://domain/webhook)
app.get("/webhook", webhookController.handleVerification);
app.post("/webhook", webhookController.handleIncomingEvent);

// 5. API routes
app.use("/api", apiRoutes);

// 6. SPA fallback
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

// 7. Sanitized Error Handling (No stack traces in production)
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err.message);
  const isProd = config.NODE_ENV === "production";
  return res.status(err.statusCode || 500).json({
    success: false,
    message: isProd ? "Internal server error" : (err.message || "Internal server error")
  });
});

let server = null;

if (require.main === module) {
  const PORT = config.PORT || 5000;
  server = app.listen(PORT, "0.0.0.0", () => {
    // Start background campaign scheduler
    schedulerService.initScheduler();

    // In non-production, start HTTPS tunnel for Meta Webhook testing
    if (config.NODE_ENV !== "production") {
      tunnelService.initTunnel(PORT).catch(err => {
        console.warn("[Server] Note: Auto-tunnel initialization notice:", err.message);
      });
    }

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
    if (server) {
      server.close(() => {
        console.log("Server stopped.");
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
}

module.exports = { app };
