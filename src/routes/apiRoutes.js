const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const uploadController = require("../controllers/uploadController");
const broadcastController = require("../controllers/broadcastController");
const campaignController = require("../controllers/campaignController");
const settingsController = require("../controllers/settingsController");
const authController = require("../controllers/authController");
const adminController = require("../controllers/adminController");
const reportsController = require("../controllers/reportsController");
const { authenticateToken, requireAdmin, authenticateStreamToken, optionalAuth } = require("../middleware/authMiddleware");
const { authLimiter, broadcastLimiter, uploadLimiter } = require("../middleware/rateLimiter");
const broadcastEngine = require("../services/broadcastEngine");
const metaWhatsAppService = require("../services/metaWhatsAppService");

// =========================================================================
// 1. AUTHENTICATION & PROFILE
// =========================================================================
router.post("/auth/register", authLimiter, authController.register);
router.post("/auth/login", authLimiter, authController.login);
router.post("/auth/forgot-password", authLimiter, authController.forgotPassword);
router.post("/auth/verify-reset-token", authLimiter, authController.verifyResetToken);
router.post("/auth/reset-password", authLimiter, authController.resetPassword);
router.post("/auth/change-password", authenticateToken, authController.changePassword);
router.get("/auth/me", authenticateToken, authController.getMe);
router.post("/auth/profile", authenticateToken, authController.updateProfile);

// =========================================================================
// 2. MASTER ADMIN & USER/PHONE MANAGEMENT
// =========================================================================
router.get("/admin/users", authenticateToken, requireAdmin, adminController.listUsers);
router.get("/admin/users/:userId", authenticateToken, requireAdmin, adminController.getUserDetails);
router.post("/admin/users/:userId/status", authenticateToken, requireAdmin, adminController.updateUserStatus);
router.post("/admin/users/:userId/role", authenticateToken, requireAdmin, adminController.updateUserRole);
router.post("/admin/users/:userId/reset-password", authenticateToken, requireAdmin, adminController.resetUserPassword);
router.post("/admin/users/:userId/assign-phone", authenticateToken, requireAdmin, adminController.assignPhoneNumber);
router.post("/admin/users/:userId/claim-history", authenticateToken, requireAdmin, adminController.claimLegacyHistory);
router.get("/admin/unassigned-summary", authenticateToken, requireAdmin, adminController.getUnassignedSummary);
router.post("/admin/impersonate/:userId", authenticateToken, requireAdmin, adminController.impersonateUser);
router.get("/admin/overview", authenticateToken, requireAdmin, adminController.getSystemOverview);

// WhatsApp Phone Number Registry (Protected & Admin Only for mutations)
router.get("/admin/phone-numbers", authenticateToken, adminController.listPhoneNumbers);
router.post("/admin/phone-numbers", authenticateToken, requireAdmin, adminController.registerPhoneNumber);
router.delete("/admin/phone-numbers/:id", authenticateToken, requireAdmin, adminController.deletePhoneNumber);
router.post("/admin/phone-numbers/:id/default", authenticateToken, requireAdmin, adminController.setDefaultPhoneNumber);

// Top-level aliases for phone numbers
router.get("/phone-numbers", authenticateToken, adminController.listPhoneNumbers);
router.post("/phone-numbers", authenticateToken, requireAdmin, adminController.registerPhoneNumber);
router.delete("/phone-numbers/:id", authenticateToken, requireAdmin, adminController.deletePhoneNumber);
router.post("/phone-numbers/:id/default", authenticateToken, requireAdmin, adminController.setDefaultPhoneNumber);

// =========================================================================
// 3. REPORTS & ANALYTICS (Protected & Scoped)
// =========================================================================
router.get("/reports/campaigns", authenticateToken, reportsController.getCampaignReports);
router.get("/reports/campaigns/export", authenticateToken, reportsController.exportCampaignReport);
router.get("/reports/automation", authenticateToken, reportsController.getAutomationReports);
router.get("/reports/overview", authenticateToken, reportsController.getOverviewAnalytics);

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

// Upload & Parsing (Protected)
router.post("/upload", authenticateToken, uploadLimiter, upload.single("file"), uploadController.handleFileUpload);

// Dedicated Header Media Uploader with Safe Filename Handling (Images, Documents, Videos up to 30MB)
const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "..", "..", "public", "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "").toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    cb(null, `media_${Date.now()}_${base}${safeExt}`);
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

router.post("/upload/media", authenticateToken, uploadLimiter, mediaUpload.single("file"), async (req, res) => {
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

// =========================================================================
// 4. CAMPAIGNS & BROADCAST (Protected & Scoped)
// =========================================================================
router.post("/campaigns", authenticateToken, broadcastLimiter, broadcastController.createCampaign);
router.get("/campaigns", authenticateToken, campaignController.listCampaigns);
router.get("/campaigns/:campaignId", authenticateToken, campaignController.getCampaignDetails);
router.delete("/campaigns/:campaignId", authenticateToken, campaignController.deleteCampaign);
router.get("/campaigns/:campaignId/export", authenticateToken, campaignController.exportCampaignReport);

// Direct single-endpoint Broadcast launch helper
const { parseExcelBuffer } = require("../services/excelService");
const { getSetting, db } = require("../config/database");
const { cleanPhone } = require("../services/metaWhatsAppService");

router.post("/broadcast/send", authenticateToken, broadcastLimiter, upload.single("file"), async (req, res) => {
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
      ? Math.min(Math.max(parseInt(rawDelay, 10), 50), 10000)
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
          campaign,
          costEstimate: data.costEstimate
        });
      }
    });
  } catch (error) {
    console.error("Direct broadcast send error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Broadcast & Schedule Controls (Protected & Ownership-Checked)
router.post("/campaigns/:campaignId/start", authenticateToken, broadcastController.startCampaign);
router.post("/campaigns/:campaignId/pause", authenticateToken, broadcastController.pauseCampaign);
router.post("/campaigns/:campaignId/resume", authenticateToken, broadcastController.resumeCampaign);
router.post("/campaigns/:campaignId/cancel", authenticateToken, broadcastController.cancelCampaign);
router.post("/campaigns/:campaignId/throttle", authenticateToken, broadcastController.updateThrottleDelay);
router.patch("/campaigns/:campaignId/throttle", authenticateToken, broadcastController.updateThrottleDelay);
router.post("/campaigns/:campaignId/reschedule", authenticateToken, broadcastController.rescheduleCampaign);
router.post("/campaigns/:campaignId/run-now", authenticateToken, broadcastController.runScheduledNow);
router.post("/broadcast/start", authenticateToken, (req, res) => {
  req.params.campaignId = req.body?.campaignId || req.query?.campaignId;
  return broadcastController.startCampaign(req, res);
});
router.post("/broadcast/test-send", authenticateToken, broadcastController.sendTestMessage);

// Short-Lived Stream Token Issuer for SSE
router.post("/broadcast/stream-token", authenticateToken, broadcastController.getStreamToken);

// =========================================================================
// 5. SETTINGS & CONNECTION (Protected & Admin Only for mutations)
// =========================================================================
router.get("/settings", authenticateToken, settingsController.getSettings);
router.post("/settings", authenticateToken, requireAdmin, settingsController.updateSettings);
router.post("/settings/test-connection", authenticateToken, settingsController.handleTestConnection);
router.get("/settings/verify-meta", authenticateToken, settingsController.handleTestConnection);
router.post("/settings/verify-meta", authenticateToken, settingsController.handleTestConnection);

// System Time & Timezone (Deployments + Local)
const systemController = require("../controllers/systemController");
router.get("/system/time", systemController.getSystemTime);
router.post("/system/time", authenticateToken, requireAdmin, systemController.updateTimezone);

// =========================================================================
// 6. SYSTEM TEMPLATES MANAGEMENT (Protected)
// =========================================================================
const templateController = require("../controllers/templateController");
router.get("/templates", authenticateToken, templateController.listTemplates);
router.get("/templates/categories", authenticateToken, templateController.getCategoriesSummary);
router.post("/templates/sync", authenticateToken, templateController.syncTemplatesFromMeta);
router.get("/broadcast/templates", authenticateToken, templateController.listTemplates);
router.get("/broadcast/templates/categories", authenticateToken, templateController.getCategoriesSummary);
router.post("/broadcast/templates/sync", authenticateToken, templateController.syncTemplatesFromMeta);
router.post("/templates", authenticateToken, templateController.addTemplate);
router.get("/templates/:templateId", authenticateToken, templateController.getTemplate);
router.delete("/templates/:templateId", authenticateToken, requireAdmin, templateController.deleteTemplate);

// =========================================================================
// 7. META WEBHOOKS & CUSTOMER REPLIES MANAGEMENT
// =========================================================================
const webhookController = require("../controllers/webhookController");

// Public Meta Webhook endpoints (Handshake GET + HMAC-verified POST)
router.get("/webhook", webhookController.handleVerification);
router.post("/webhook", webhookController.handleIncomingEvent);

// Protected Webhook configuration & controls
router.get("/webhook/config", authenticateToken, webhookController.getConfig);
router.post("/webhook/generate-token", authenticateToken, requireAdmin, webhookController.generateNewToken);
router.post("/webhook/token", authenticateToken, requireAdmin, webhookController.saveToken);
router.post("/webhook/test-simulate", authenticateToken, webhookController.simulateTestReply);
router.get("/webhook/test-handshake", authenticateToken, webhookController.testHandshake);
router.post("/webhook/tunnel/restart", authenticateToken, requireAdmin, webhookController.restartTunnel);

// Customer Replies & Inbox (Protected & Scoped)
router.get("/replies", authenticateToken, webhookController.listReplies);
router.get("/inbox/replies", authenticateToken, webhookController.listReplies);
router.get("/replies/auto-reply-settings", authenticateToken, webhookController.getAutoReplySettings);
router.post("/replies/auto-reply-settings", authenticateToken, webhookController.updateAutoReplySettings);
router.post("/replies/:id/reply", authenticateToken, webhookController.sendManualReply);
router.post("/replies/:id/mark-read", authenticateToken, webhookController.markAsRead);
router.post("/replies/mark-all-read", authenticateToken, webhookController.markAllAsRead);
router.delete("/replies/:id", authenticateToken, webhookController.deleteReply);
router.delete("/inbox/conversation/:phone", authenticateToken, webhookController.deleteConversation);
router.delete("/inbox/conversation", authenticateToken, webhookController.deleteConversation);
router.delete("/replies/conversation/:phone", authenticateToken, webhookController.deleteConversation);

// Inbound Customer Media Streaming & Download Proxy with Path Traversal Protection
router.get("/media/inbound/:mediaId", authenticateToken, async (req, res) => {
  try {
    const { mediaId } = req.params;
    if (!mediaId || !/^[a-zA-Z0-9_.-]+$/.test(mediaId)) {
      return res.status(400).json({ success: false, message: "Invalid media ID." });
    }

    const cleanMediaId = path.basename(mediaId).replace(/\.[a-zA-Z0-9]+$/, "");
    const inboundDir = path.resolve(__dirname, "../../public/uploads/inbound");
    if (!fs.existsSync(inboundDir)) {
      fs.mkdirSync(inboundDir, { recursive: true });
    }

    // 1. Check if already cached on disk
    try {
      const files = fs.readdirSync(inboundDir).filter(f => f.startsWith(`${cleanMediaId}.`) || f === mediaId);
      if (files.length > 0) {
        const filePath = path.resolve(inboundDir, files[0]);
        if (filePath.startsWith(inboundDir) && fs.existsSync(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=604800, immutable");
          return res.sendFile(filePath);
        }
      }
    } catch (e) {}

    // 2. Download from Meta Cloud API on the fly
    const { downloadAndSaveInboundMedia } = require("../services/metaWhatsAppService");
    const downloadRes = await downloadAndSaveInboundMedia(cleanMediaId);
    if (downloadRes?.localPath) {
      const resolvedPath = path.resolve(downloadRes.localPath);
      if (resolvedPath.startsWith(inboundDir) && fs.existsSync(resolvedPath)) {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
        return res.sendFile(resolvedPath);
      }
    }

    return res.status(404).json({ success: false, message: "Inbound media not found or could not be downloaded." });
  } catch (err) {
    console.error("[Inbound Media Proxy] Error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to download media: " + err.message });
  }
});

// Direct inbox reply by phone/contact (Protected)
router.post("/inbox/reply", authenticateToken, mediaUpload.single("file"), async (req, res) => {
  try {
    const { to, message, replyId, mediaUrl, mediaId, mediaType: clientMediaType } = req.body || {};
    const text = message !== undefined ? String(message) : (req.body?.replyText !== undefined ? String(req.body.replyText) : "");

    const targetPhone = metaWhatsAppService.cleanPhone(to || "", getSetting("DEFAULT_COUNTRY_CODE") || "91");
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
        const metaUp = await metaWhatsAppService.uploadMedia({
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

      sendRes = await metaWhatsAppService.sendMediaMessage({
        to: targetPhone,
        type: finalMediaType,
        mediaId: metaMediaId || null,
        mediaUrl: !metaMediaId ? fullUrl : null,
        caption: text.trim() ? text : ""
      });
      metaMessageId = sendRes.messageId;
    } else if (finalMediaUrl || mediaId) {
      const isVideo = (finalMediaUrl && finalMediaUrl.match(/\.(mp4|3gp|mov|webm)(\?.*)?$/i)) || clientMediaType === "video";
      finalMediaType = isVideo ? "video" : (clientMediaType || "image");

      sendRes = await metaWhatsAppService.sendMediaMessage({
        to: targetPhone,
        type: finalMediaType,
        mediaId: mediaId || null,
        mediaUrl: finalMediaUrl || null,
        caption: text.trim() ? text : ""
      });
      metaMessageId = sendRes.messageId;
    } else {
      sendRes = await metaWhatsAppService.sendTextMessage({ to: targetPhone, body: text });
      metaMessageId = sendRes.messageId;
    }

    const assignedId = metaMessageId || `out_${Date.now()}`;
    const displayText = text || (finalMediaType ? `[${finalMediaType.toUpperCase()}]` : "");
    const replyUserId = req.user?.id || null;
    let existingGuestName = "Customer";
    try {
      const prior = db.prepare("SELECT customer_name FROM customer_replies WHERE from_phone = ? AND customer_name NOT IN ('Customer', 'Demo Customer') AND customer_name IS NOT NULL ORDER BY id DESC LIMIT 1").get(targetPhone);
      if (prior?.customer_name) {
        existingGuestName = prior.customer_name;
      } else {
        const recip = db.prepare("SELECT contact_name FROM campaign_recipients WHERE clean_phone = ? AND contact_name IS NOT NULL LIMIT 1").get(targetPhone);
        if (recip?.contact_name) {
          existingGuestName = recip.contact_name;
        }
      }
    } catch (e) {}

    db.prepare(`
      INSERT INTO customer_replies (
        wa_message_id, from_phone, customer_name, message_type,
        message_body, reply_text, media_url, media_type, media_caption,
        reply_sent_at, reply_status, is_read, user_id, received_at
      ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'SENT', 1, ?, CURRENT_TIMESTAMP)
    `).run(
      assignedId,
      targetPhone,
      existingGuestName,
      displayText,
      displayText,
      finalMediaUrl,
      finalMediaType,
      text || null,
      replyUserId
    );

    try {
      broadcastEngine.emit("webhook:reply_updated", {
        wa_message_id: assignedId,
        from_phone: targetPhone,
        message_type: "outbound",
        message_body: displayText,
        reply_text: displayText,
        media_url: finalMediaUrl,
        media_type: finalMediaType,
        reply_status: "SENT"
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

// =========================================================================
// 8. GOOGLE SHEETS & BOOKING AUTOMATION (Protected & Scoped)
// =========================================================================
const automationController = require("../controllers/automationController");
router.get("/automation/config", authenticateToken, automationController.getConfig);
router.post("/automation/config", authenticateToken, automationController.updateConfig);
router.get("/automation/preview", authenticateToken, automationController.previewSheet);
router.post("/automation/preview", authenticateToken, automationController.previewSheet);
router.post("/automation/run-now", authenticateToken, automationController.runNow);
router.post("/automation/evaluate", authenticateToken, automationController.runNow);
router.get("/automation/history", authenticateToken, automationController.getHistory);
router.get("/automation/status", authenticateToken, automationController.getStatus);
router.post("/automation/contacts", authenticateToken, automationController.saveContacts);
router.get("/automation/contacts", authenticateToken, automationController.getContacts);
router.delete("/automation/contacts", authenticateToken, automationController.clearContacts);

// =========================================================================
// 9. SERVER-SENT EVENTS (SSE) STREAM (Dedicated Stream Token Auth)
// =========================================================================
router.get("/broadcast/stream", authenticateStreamToken, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Initial connection heartbeat
  res.write(`data: ${JSON.stringify({ type: "init", message: "SSE stream connected", userId: req.user.id })}\n\n`);

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
