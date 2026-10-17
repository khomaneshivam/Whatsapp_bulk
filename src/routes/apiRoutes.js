const express = require("express");
const multer = require("multer");
const router = express.Router();

const uploadController = require("../controllers/uploadController");
const broadcastController = require("../controllers/broadcastController");
const campaignController = require("../controllers/campaignController");
const settingsController = require("../controllers/settingsController");
const authController = require("../controllers/authController");
const adminController = require("../controllers/adminController");
const reportsController = require("../controllers/reportsController");
const { authenticateToken, requireAdmin, optionalAuth } = require("../middleware/authMiddleware");
const broadcastEngine = require("../services/broadcastEngine");

// =========================================================================
// 1. AUTHENTICATION & PROFILE
// =========================================================================
router.post("/auth/register", authController.register);
router.post("/auth/login", authController.login);
router.get("/auth/me", authenticateToken, authController.getMe);
router.post("/auth/profile", authenticateToken, authController.updateProfile);

// =========================================================================
// 2. MASTER ADMIN & USER/PHONE MANAGEMENT
// =========================================================================
router.get("/admin/users", authenticateToken, requireAdmin, adminController.listUsers);
router.get("/admin/users/:userId", authenticateToken, requireAdmin, adminController.getUserDetails);
router.post("/admin/users/:userId/status", authenticateToken, requireAdmin, adminController.updateUserStatus);
router.post("/admin/users/:userId/role", authenticateToken, requireAdmin, adminController.updateUserRole);
router.post("/admin/users/:userId/assign-phone", authenticateToken, requireAdmin, adminController.assignPhoneNumber);
router.post("/admin/impersonate/:userId", authenticateToken, requireAdmin, adminController.impersonateUser);
router.get("/admin/overview", authenticateToken, requireAdmin, adminController.getSystemOverview);

// WhatsApp Phone Number Registry
router.get("/admin/phone-numbers", optionalAuth, adminController.listPhoneNumbers);
router.post("/admin/phone-numbers", authenticateToken, adminController.registerPhoneNumber);
router.delete("/admin/phone-numbers/:id", authenticateToken, requireAdmin, adminController.deletePhoneNumber);
router.post("/admin/phone-numbers/:id/default", authenticateToken, requireAdmin, adminController.setDefaultPhoneNumber);

// Top-level aliases for phone numbers
router.get("/phone-numbers", optionalAuth, adminController.listPhoneNumbers);
router.post("/phone-numbers", authenticateToken, adminController.registerPhoneNumber);
router.delete("/phone-numbers/:id", authenticateToken, requireAdmin, adminController.deletePhoneNumber);
router.post("/phone-numbers/:id/default", authenticateToken, requireAdmin, adminController.setDefaultPhoneNumber);

// =========================================================================
// 3. REPORTS & ANALYTICS
// =========================================================================
router.get("/reports/campaigns", optionalAuth, reportsController.getCampaignReports);
router.get("/reports/campaigns/export", optionalAuth, reportsController.exportCampaignReport);
router.get("/reports/automation", optionalAuth, reportsController.getAutomationReports);
router.get("/reports/overview", optionalAuth, reportsController.getOverviewAnalytics);

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
router.post("/upload", optionalAuth, upload.single("file"), uploadController.handleFileUpload);

// Dedicated Header Media Uploader (Images, Documents, Videos)
const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "..", "..", "public", "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    cb(null, `media_${Date.now()}_${base}${ext}`);
  }
});

const mediaUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf" || file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (JPG, PNG, WEBP), PDF documents, or MP4 videos are allowed."));
    }
  }
});

const { uploadMedia } = require("../services/metaWhatsAppService");

router.post("/upload/media", optionalAuth, mediaUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No media file provided." });
    }

    const relativeUrl = `/uploads/${req.file.filename}`;
    const host = req.get("host");
    const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const fullUrl = `${protocol}://${host}${relativeUrl}`;

    let mediaId = null;
    let metaUploadError = null;

    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const metaRes = await uploadMedia({
        fileBuffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype
      });
      if (metaRes && metaRes.mediaId) {
        mediaId = metaRes.mediaId;
      }
    } catch (err) {
      metaUploadError = err.message;
      console.warn("[UploadMedia] Meta direct upload note:", err.message);
    }

    return res.status(200).json({
      success: true,
      message: "Media uploaded successfully.",
      url: fullUrl,
      relativeUrl,
      mediaId,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      metaUploadError
    });
  } catch (error) {
    console.error("Media upload error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Campaigns
router.post("/campaigns", optionalAuth, broadcastController.createCampaign);
router.get("/campaigns", optionalAuth, campaignController.listCampaigns);
router.get("/campaigns/:campaignId", optionalAuth, campaignController.getCampaignDetails);
router.delete("/campaigns/:campaignId", optionalAuth, campaignController.deleteCampaign);
router.get("/campaigns/:campaignId/export", optionalAuth, campaignController.exportCampaignReport);

// Direct single-endpoint Broadcast launch helper
const { parseExcelBuffer } = require("../services/excelService");
const { getSetting, db } = require("../config/database");
const { cleanPhone } = require("../services/metaWhatsAppService");

router.post("/broadcast/send", optionalAuth, upload.single("file"), async (req, res) => {
  try {
    const { campaignName, templateName, templateLang, phoneColumn, nameColumn, variableMappings, headerMediaUrl, headerMediaId, scheduledTime, phoneId, delayMs, throttleDelay } = req.body || {};
    let contacts = [];
    let detectedPhone = phoneColumn;
    let fileName = "contacts.csv";

    if (req.file) {
      fileName = req.file.originalname;
      const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
      const parsed = parseExcelBuffer(req.file.buffer, req.file.originalname, defaultCountry);
      detectedPhone = phoneColumn || parsed.detectedPhoneCol;
      contacts = parsed.allRows.map(r => r.data);
    } else if (req.body.contacts) {
      contacts = typeof req.body.contacts === "string" ? JSON.parse(req.body.contacts) : req.body.contacts;
    }

    if (!contacts || contacts.length === 0) {
      return res.status(400).json({ success: false, message: "No contacts found in file or payload." });
    }

    let parsedMappings = {};
    if (variableMappings) {
      parsedMappings = typeof variableMappings === "string" ? JSON.parse(variableMappings) : variableMappings;
    }

    const bodyParams = Object.keys(parsedMappings).map(k => ({ key: k, col: parsedMappings[k] }));

    const rawDelay = delayMs !== undefined ? delayMs : throttleDelay;
    const parsedDelay = (rawDelay !== undefined && rawDelay !== null && String(rawDelay).trim() !== "")
      ? parseInt(rawDelay, 10)
      : undefined;

    req.body = {
      name: campaignName || `Broadcast_${Date.now()}`,
      fileName,
      messageType: "TEMPLATE",
      templateName: templateName || "kt_restaurant_invitation",
      templateLanguage: templateLang || "en",
      phoneColumn: detectedPhone,
      nameColumn: nameColumn || null,
      phoneId: phoneId || null,
      mappingConfig: { bodyParams, headerMediaUrl, headerMediaId },
      scheduleMode: scheduledTime ? "SCHEDULE" : "NOW",
      scheduledAt: scheduledTime || null,
      delayMs: parsedDelay,
      contacts
    };

    await broadcastController.createCampaign(req, {
      statusCode: 201,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        if (!data.success) {
          return res.status(this.statusCode || 400).json(data);
        }
        const campaign = data.data;
        if (!scheduledTime) {
          broadcastEngine.startCampaign(campaign.id, parsedDelay).catch(err => {
            console.error("Auto-start campaign error:", err);
          });
        }
        return res.status(200).json({
          success: true,
          message: data.message,
          campaignId: campaign.id,
          totalRecipients: campaign.valid_contacts,
          campaign
        });
      }
    });
  } catch (error) {
    console.error("Direct broadcast send error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Broadcast & Schedule Controls
router.post("/campaigns/:campaignId/start", optionalAuth, broadcastController.startCampaign);
router.post("/campaigns/:campaignId/pause", optionalAuth, broadcastController.pauseCampaign);
router.post("/campaigns/:campaignId/resume", optionalAuth, broadcastController.resumeCampaign);
router.post("/campaigns/:campaignId/cancel", optionalAuth, broadcastController.cancelCampaign);
router.post("/campaigns/:campaignId/throttle", optionalAuth, broadcastController.updateThrottleDelay);
router.patch("/campaigns/:campaignId/throttle", optionalAuth, broadcastController.updateThrottleDelay);
router.post("/campaigns/:campaignId/reschedule", optionalAuth, broadcastController.rescheduleCampaign);
router.post("/campaigns/:campaignId/run-now", optionalAuth, broadcastController.runScheduledNow);
router.post("/broadcast/test-send", optionalAuth, broadcastController.sendTestMessage);

// Settings & Connection
router.get("/settings", optionalAuth, settingsController.getSettings);
router.post("/settings", optionalAuth, settingsController.updateSettings);
router.post("/settings/test-connection", optionalAuth, settingsController.handleTestConnection);
router.get("/settings/verify-meta", optionalAuth, settingsController.handleTestConnection);
router.post("/settings/verify-meta", optionalAuth, settingsController.handleTestConnection);

// System Time & Timezone (Deployments + Local)
const systemController = require("../controllers/systemController");
router.get("/system/time", optionalAuth, systemController.getSystemTime);
router.post("/system/time", authenticateToken, requireAdmin, systemController.updateTimezone);

// System Templates Management
const templateController = require("../controllers/templateController");
router.get("/templates", optionalAuth, templateController.listTemplates);
router.get("/broadcast/templates", optionalAuth, templateController.listTemplates);
router.post("/templates", optionalAuth, templateController.addTemplate);
router.get("/templates/:templateId", optionalAuth, templateController.getTemplate);
router.delete("/templates/:templateId", authenticateToken, requireAdmin, templateController.deleteTemplate);

// Meta Webhooks & Customer Replies Management
const webhookController = require("../controllers/webhookController");
router.get("/webhook", webhookController.handleVerification);
router.post("/webhook", webhookController.handleIncomingEvent);
router.get("/webhook/config", optionalAuth, webhookController.getConfig);
router.post("/webhook/generate-token", optionalAuth, webhookController.generateNewToken);
router.post("/webhook/token", optionalAuth, webhookController.saveToken);
router.post("/webhook/test-simulate", optionalAuth, webhookController.simulateTestReply);
router.get("/webhook/test-handshake", optionalAuth, webhookController.testHandshake);
router.post("/webhook/tunnel/restart", optionalAuth, webhookController.restartTunnel);

router.get("/replies", optionalAuth, webhookController.listReplies);
router.get("/inbox/replies", optionalAuth, webhookController.listReplies);
router.get("/replies/auto-reply-settings", optionalAuth, webhookController.getAutoReplySettings);
router.post("/replies/auto-reply-settings", optionalAuth, webhookController.updateAutoReplySettings);
router.post("/replies/:id/reply", optionalAuth, webhookController.sendManualReply);
router.post("/replies/:id/mark-read", optionalAuth, webhookController.markAsRead);
router.post("/replies/mark-all-read", optionalAuth, webhookController.markAllAsRead);
router.delete("/replies/:id", optionalAuth, webhookController.deleteReply);
router.delete("/inbox/conversation/:phone", optionalAuth, webhookController.deleteConversation);
router.delete("/inbox/conversation", optionalAuth, webhookController.deleteConversation);
router.delete("/replies/conversation/:phone", optionalAuth, webhookController.deleteConversation);

// Direct inbox reply by phone/contact (Supports formatted multi-line text, images, and videos)
const { sendTextMessage, sendMediaMessage } = require("../services/metaWhatsAppService");

router.post("/inbox/reply", optionalAuth, mediaUpload.single("file"), async (req, res) => {
  try {
    const { to, message, replyId, mediaUrl, mediaId, mediaType: clientMediaType } = req.body || {};
    const text = message !== undefined ? String(message) : (req.body?.replyText !== undefined ? String(req.body.replyText) : "");

    const targetPhone = cleanPhone(to || "", getSetting("DEFAULT_COUNTRY_CODE") || "91");
    if (!targetPhone) {
      return res.status(400).json({ success: false, message: "Recipient phone number is required." });
    }

    if (!req.file && !mediaUrl && !mediaId && !text.trim()) {
      return res.status(400).json({ success: false, message: "Reply message or media attachment is required." });
    }

    let sendRes;
    let finalMediaUrl = mediaUrl || null;
    let finalMediaType = clientMediaType || null;
    let metaMessageId = null;

    // Case 1: File attachment uploaded (Image or Video)
    if (req.file) {
      const isVideo = req.file.mimetype.startsWith("video/");
      const isImage = req.file.mimetype.startsWith("image/");
      finalMediaType = isVideo ? "video" : (isImage ? "image" : (clientMediaType || "document"));
      finalMediaUrl = `/uploads/${req.file.filename}`;

      const host = req.get("host");
      const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
      const fullUrl = `${protocol}://${host}${finalMediaUrl}`;

      let metaMediaId = null;
      try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const metaUp = await uploadMedia({
          fileBuffer,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype
        });
        if (metaUp?.mediaId) {
          metaMediaId = metaUp.mediaId;
        }
      } catch (uErr) {
        console.warn("[Inbox Reply] Direct Meta upload note:", uErr.message);
      }

      sendRes = await sendMediaMessage({
        to: targetPhone,
        type: finalMediaType,
        mediaId: metaMediaId || null,
        mediaUrl: !metaMediaId ? fullUrl : null,
        caption: text.trim() ? text : ""
      });
      metaMessageId = sendRes.messageId;
    } 
    // Case 2: Media URL or Media ID provided without direct file upload
    else if (finalMediaUrl || mediaId) {
      const isVideo = (finalMediaUrl && finalMediaUrl.match(/\.(mp4|3gp|mov|webm)(\?.*)?$/i)) || clientMediaType === "video";
      finalMediaType = isVideo ? "video" : (clientMediaType || "image");

      sendRes = await sendMediaMessage({
        to: targetPhone,
        type: finalMediaType,
        mediaId: mediaId || null,
        mediaUrl: finalMediaUrl || null,
        caption: text.trim() ? text : ""
      });
      metaMessageId = sendRes.messageId;
    } 
    // Case 3: Pure text message (formatted with spacing / line breaks)
    else {
      sendRes = await sendTextMessage({ to: targetPhone, body: text });
      metaMessageId = sendRes.messageId;
    }

    const assignedId = metaMessageId || `out_${Date.now()}`;
    const displayText = text || (finalMediaType ? `[${finalMediaType.toUpperCase()}]` : "");

    db.prepare(`
      INSERT INTO customer_replies (
        wa_message_id, from_phone, customer_name, message_type,
        message_body, reply_text, media_url, media_type, media_caption,
        reply_sent_at, reply_status, is_read, received_at
      ) VALUES (?, ?, 'Customer', 'outbound', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'SENT', 1, CURRENT_TIMESTAMP)
    `).run(
      assignedId,
      targetPhone,
      displayText,
      displayText,
      finalMediaUrl,
      finalMediaType,
      text || null
    );

    // Notify connected SSE telemetry / browser tabs of outgoing reply
    try {
      broadcastEngine.emit("webhook:reply_updated", {
        wa_message_id: assignedId,
        from_phone: targetPhone,
        message_type: 'outbound',
        message_body: displayText,
        reply_text: displayText,
        media_url: finalMediaUrl,
        media_type: finalMediaType,
        reply_status: 'SENT'
      });
    } catch (e) {}

    return res.status(200).json({
      success: true,
      message: "Reply dispatched successfully via WhatsApp.",
      messageId: assignedId,
      mediaUrl: finalMediaUrl,
      mediaType: finalMediaType
    });
  } catch (error) {
    console.error("Direct inbox reply error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Google Sheets Booking Automation
const automationController = require("../controllers/automationController");
router.get("/automation/config", optionalAuth, automationController.getConfig);
router.post("/automation/config", optionalAuth, automationController.updateConfig);
router.get("/automation/preview", optionalAuth, automationController.previewSheet);
router.post("/automation/preview", optionalAuth, automationController.previewSheet);
router.post("/automation/run-now", optionalAuth, automationController.runNow);
router.post("/automation/evaluate", optionalAuth, automationController.runNow);
router.get("/automation/history", optionalAuth, automationController.getHistory);
router.get("/automation/status", optionalAuth, automationController.getStatus);
router.post("/automation/contacts", optionalAuth, automationController.saveContacts);
router.get("/automation/contacts", optionalAuth, automationController.getContacts);
router.delete("/automation/contacts", optionalAuth, automationController.clearContacts);

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
    res.write(`data: ${JSON.stringify({ type: "progress", TYPE: "PROGRESS", ...data })}\n\n`);
  };

  const onStatus = (data) => {
    res.write(`data: ${JSON.stringify({ type: "status", TYPE: "STATUS", ...data })}\n\n`);
  };

  const onReply = (data) => {
    res.write(`data: ${JSON.stringify({ type: "reply", TYPE: "REPLY", data })}\n\n`);
  };

  const onWebhookStatus = (data) => {
    res.write(`data: ${JSON.stringify({ type: "webhook_status", TYPE: "WEBHOOK_STATUS", data })}\n\n`);
  };

  const onReplyUpdated = (data) => {
    res.write(`data: ${JSON.stringify({ type: "reply_updated", TYPE: "REPLY_UPDATED", data })}\n\n`);
  };

  const onThrottle = (data) => {
    res.write(`data: ${JSON.stringify({ type: "throttle", TYPE: "THROTTLE", ...data })}\n\n`);
  };

  broadcastEngine.on("broadcast:progress", onProgress);
  broadcastEngine.on("campaign:status", onStatus);
  broadcastEngine.on("campaign:throttle", onThrottle);
  broadcastEngine.on("webhook:reply", onReply);
  broadcastEngine.on("webhook:reply_updated", onReplyUpdated);
  broadcastEngine.on("webhook:status", onWebhookStatus);

  // Keep connection alive with ping every 25s
  const keepAliveTimer = setInterval(() => {
    res.write(": ping\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAliveTimer);
    broadcastEngine.removeListener("broadcast:progress", onProgress);
    broadcastEngine.removeListener("campaign:status", onStatus);
    broadcastEngine.removeListener("campaign:throttle", onThrottle);
    broadcastEngine.removeListener("webhook:reply", onReply);
    broadcastEngine.removeListener("webhook:reply_updated", onReplyUpdated);
    broadcastEngine.removeListener("webhook:status", onWebhookStatus);
  });
});

module.exports = router;
