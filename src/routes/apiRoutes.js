const express = require("express");
const multer = require("multer");
const router = express.Router();

const uploadController = require("../controllers/uploadController");
const broadcastController = require("../controllers/broadcastController");
const campaignController = require("../controllers/campaignController");
const settingsController = require("../controllers/settingsController");
const broadcastEngine = require("../services/broadcastEngine");

// Configure Multer for in-memory file uploads (supports .xlsx, .xls, .csv up to 25MB)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv"
    ];
    if (
      allowed.includes(file.mimetype) ||
      file.originalname.match(/\.(xlsx|xls|csv)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed."));
    }
  }
});

// Upload & Parsing
router.post("/upload", upload.single("file"), uploadController.handleFileUpload);

// Campaigns
router.post("/campaigns", broadcastController.createCampaign);
router.get("/campaigns", campaignController.listCampaigns);
router.get("/campaigns/:campaignId", campaignController.getCampaignDetails);
router.delete("/campaigns/:campaignId", campaignController.deleteCampaign);
router.get("/campaigns/:campaignId/export", campaignController.exportCampaignReport);

// Broadcast & Schedule Controls
router.post("/campaigns/:campaignId/start", broadcastController.startCampaign);
router.post("/campaigns/:campaignId/pause", broadcastController.pauseCampaign);
router.post("/campaigns/:campaignId/resume", broadcastController.resumeCampaign);
router.post("/campaigns/:campaignId/cancel", broadcastController.cancelCampaign);
router.post("/campaigns/:campaignId/reschedule", broadcastController.rescheduleCampaign);
router.post("/campaigns/:campaignId/run-now", broadcastController.runScheduledNow);
router.post("/broadcast/test-send", broadcastController.sendTestMessage);

// Settings & Connection
router.get("/settings", settingsController.getSettings);
router.post("/settings", settingsController.updateSettings);
router.post("/settings/test-connection", settingsController.handleTestConnection);

// System Templates Management
const templateController = require("../controllers/templateController");
router.get("/templates", templateController.listTemplates);
router.post("/templates", templateController.addTemplate);
router.get("/templates/:templateId", templateController.getTemplate);
router.delete("/templates/:templateId", templateController.deleteTemplate);

// Meta Webhooks & Customer Replies Management
const webhookController = require("../controllers/webhookController");
router.get("/webhook", webhookController.handleVerification);
router.post("/webhook", webhookController.handleIncomingEvent);
router.get("/webhook/config", webhookController.getConfig);
router.post("/webhook/generate-token", webhookController.generateNewToken);
router.post("/webhook/token", webhookController.saveToken);
router.post("/webhook/test-simulate", webhookController.simulateTestReply);

router.get("/replies", webhookController.listReplies);
router.post("/replies/:id/mark-read", webhookController.markAsRead);
router.post("/replies/mark-all-read", webhookController.markAllAsRead);
router.delete("/replies/:id", webhookController.deleteReply);

// Server-Sent Events (SSE) for Real-Time Broadcast Progress & Live Logs
router.get("/broadcast/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable buffering for Nginx/proxies
  res.flushHeaders();

  // Send initial connected heartbeat
  res.write(`data: ${JSON.stringify({ type: "init", message: "SSE connected" })}\n\n`);

  const onProgress = (data) => {
    res.write(`data: ${JSON.stringify({ type: "progress", ...data })}\n\n`);
  };

  const onStatus = (data) => {
    res.write(`data: ${JSON.stringify({ type: "status", ...data })}\n\n`);
  };

  const onReply = (data) => {
    res.write(`data: ${JSON.stringify({ type: "reply", data })}\n\n`);
  };

  const onWebhookStatus = (data) => {
    res.write(`data: ${JSON.stringify({ type: "webhook_status", data })}\n\n`);
  };

  broadcastEngine.on("broadcast:progress", onProgress);
  broadcastEngine.on("campaign:status", onStatus);
  broadcastEngine.on("webhook:reply", onReply);
  broadcastEngine.on("webhook:status", onWebhookStatus);

  // Keep connection alive with ping every 25s
  const keepAliveTimer = setInterval(() => {
    res.write(": ping\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAliveTimer);
    broadcastEngine.removeListener("broadcast:progress", onProgress);
    broadcastEngine.removeListener("campaign:status", onStatus);
    broadcastEngine.removeListener("webhook:reply", onReply);
    broadcastEngine.removeListener("webhook:status", onWebhookStatus);
  });
});

module.exports = router;
