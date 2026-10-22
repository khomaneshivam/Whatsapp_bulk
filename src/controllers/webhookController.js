const crypto = require("crypto");
const webhookService = require("../services/webhookService");
const tunnelService = require("../services/tunnelService");
const { getSetting, db } = require("../config/database");
const config = require("../config/env");

/**
 * Validates incoming Meta X-Hub-Signature-256 against raw request payload
 */
function verifyMetaSignature(req) {
  const signature = req.headers["x-hub-signature-256"];
  const appSecret = config.META_APP_SECRET || getSetting("META_APP_SECRET") || process.env.META_APP_SECRET;

  if (config.NODE_ENV === "production") {
    if (!appSecret) {
      console.error("[Webhook Security] META_APP_SECRET is not configured in production. Rejecting request.");
      return false;
    }
    if (!signature) {
      console.warn("[Webhook Security] Missing X-Hub-Signature-256 header in production request.");
      return false;
    }
  }

  // If no app secret configured in non-production, log warning and allow
  if (!appSecret) {
    return true;
  }

  if (!signature || !signature.startsWith("sha256=")) {
    return false;
  }

  const clientHash = signature.substring(7);
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expectedHash = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  try {
    const clientBuf = Buffer.from(clientHash, "hex");
    const expectedBuf = Buffer.from(expectedHash, "hex");
    if (clientBuf.length !== expectedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(clientBuf, expectedBuf);
  } catch (err) {
    return false;
  }
}

/**
 * Handles Meta Webhook Verification Handshake (GET /webhook or GET /api/webhook)
 */
function handleVerification(req, res) {
  try {
    const { verified, challenge } = webhookService.verifyHandshake(req.query);

    if (verified) {
      console.log(`[Webhook Handshake] Meta verification challenge accepted.`);
      return res.status(200).send(challenge);
    } else {
      console.warn(`[Webhook Handshake] Meta verification FAILED for provided token.`);
      return res.status(403).send("Forbidden: Invalid verification token or hub.mode");
    }
  } catch (error) {
    console.error("[WebhookController] Handshake error:", error);
    return res.status(500).send("Internal Server Error");
  }
}

/**
 * Handles Meta Webhook Event Notification (POST /webhook or POST /api/webhook)
 */
function handleIncomingEvent(req, res) {
  // 1. Verify Meta signature before accepting or processing
  const isValidSig = verifyMetaSignature(req);
  if (!isValidSig) {
    console.warn("[Webhook Security] Rejected incoming webhook with invalid or missing X-Hub-Signature-256.");
    return res.status(403).json({ success: false, message: "Forbidden: Invalid webhook signature." });
  }

  // 2. Acknowledge immediately to Meta with 200 OK
  res.status(200).send("EVENT_RECEIVED");

  // 3. Durably log & asynchronously process payload without exposing PII in console
  const payload = req.body;
  const entriesCount = Array.isArray(payload?.entry) ? payload.entry.length : 0;
  console.log(`[Webhook] Processing incoming Meta notification (entries: ${entriesCount})`);

  // Durable event recording for auditing and recovery
  try {
    const eventId = payload?.entry?.[0]?.id || `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    db.prepare(`
      INSERT OR IGNORE INTO incoming_webhook_events (event_id, event_type, status, created_at)
      VALUES (?, 'META_NOTIFICATION', 'PROCESSING', CURRENT_TIMESTAMP)
    `).run(eventId);
  } catch (e) {}

  webhookService
    .processIncomingPayload(payload)
    .then(result => {
      if (result.processed > 0) {
        console.log(`[WebhookController] Processed ${result.messages} customer reply(ies), ${result.statuses} delivery status update(s).`);
      }
    })
    .catch(err => {
      console.error("[WebhookController] Error processing payload:", err.message);
    });
}

/**
 * Gets Webhook configuration and status for the UI
 */
function getConfig(req, res) {
  try {
    const user = req.user;
    let verifyToken = webhookService.getVerifyToken();
    
    // Mask verify token for non-administrators
    if (user && user.role !== "ADMIN" && verifyToken) {
      verifyToken = verifyToken.substring(0, 4) + "••••••••" + verifyToken.substring(verifyToken.length - 4);
    }

    const tunnelStatus = tunnelService.getStatus();
    const publicTunnelUrl = tunnelStatus.url || getSetting("PUBLIC_WEBHOOK_URL");
    const host = req.get("host") || `localhost:${config.PORT}`;
    const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";

    const webhookUrl = publicTunnelUrl ? `${publicTunnelUrl}/webhook` : `${protocol}://${host}/webhook`;
    const altWebhookUrl = publicTunnelUrl ? `${publicTunnelUrl}/api/webhook` : `${protocol}://${host}/api/webhook`;

    const scopedUserId = user && user.role !== "ADMIN" ? user.id : null;
    const repliesStats = webhookService.getReplies({ limit: 1, userId: scopedUserId });

    return res.status(200).json({
      success: true,
      data: {
        verifyToken,
        webhookUrl,
        altWebhookUrl,
        publicTunnelUrl: publicTunnelUrl || null,
        tunnelConnected: Boolean(publicTunnelUrl),
        tunnelType: tunnelStatus.type,
        totalReplies: repliesStats.totalCount,
        unreadReplies: repliesStats.unreadCount,
        distinctContacts: repliesStats.distinctContacts,
        isConfigured: Boolean(verifyToken && verifyToken.length > 5)
      }
    });
  } catch (error) {
    console.error("[WebhookController] getConfig error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Tests the live webhook handshake from the server to verify Meta connectivity
 */
async function testHandshake(req, res) {
  try {
    const verifyToken = webhookService.getVerifyToken();
    const tunnelStatus = tunnelService.getStatus();
    const publicUrl = tunnelStatus.url || getSetting("PUBLIC_WEBHOOK_URL") || `http://localhost:${config.PORT}`;
    const testUrl = `${publicUrl}/webhook?hub.mode=subscribe&hub.challenge=test_meta_challenge_123&hub.verify_token=${encodeURIComponent(verifyToken)}`;

    const response = await fetch(testUrl, { method: "GET" });
    const text = await response.text();

    if (response.status === 200 && text === "test_meta_challenge_123") {
      return res.status(200).json({
        success: true,
        message: "Handshake verified successfully! Meta will be able to verify your webhook.",
        data: {
          status: response.status,
          challengeResponse: text,
          testedUrl: testUrl
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `Handshake verification failed (HTTP ${response.status}): ${text}`,
        data: {
          status: response.status,
          responseBody: text,
          testedUrl: testUrl
        }
      });
    }
  } catch (error) {
    console.error("[WebhookController] testHandshake error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Restarts the background tunnel (Admin Only)
 */
async function restartTunnel(req, res) {
  try {
    console.log("[WebhookController] Manual tunnel restart requested...");
    const result = await tunnelService.restart();
    return res.status(200).json({
      success: true,
      message: "Tunnel restarted successfully.",
      data: tunnelService.getStatus()
    });
  } catch (error) {
    console.error("[WebhookController] restartTunnel error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Generates a new secure random verify token (Admin Only)
 */
function generateNewToken(req, res) {
  try {
    const newToken = webhookService.generateVerifyToken();
    return res.status(200).json({
      success: true,
      message: "New webhook verify token generated successfully.",
      data: {
        verifyToken: newToken
      }
    });
  } catch (error) {
    console.error("[WebhookController] generateNewToken error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Saves a custom verify token (Admin Only)
 */
function saveToken(req, res) {
  try {
    const { verifyToken } = req.body || {};
    if (!verifyToken || !String(verifyToken).trim()) {
      return res.status(400).json({ success: false, message: "Verify token cannot be empty." });
    }

    const saved = webhookService.saveVerifyToken(verifyToken);
    return res.status(200).json({
      success: true,
      message: "Webhook verify token updated successfully.",
      data: {
        verifyToken: saved
      }
    });
  } catch (error) {
    console.error("[WebhookController] saveToken error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Lists customer replies with tenant scoping
 */
function listReplies(req, res) {
  try {
    const { limit, offset, search, campaignId, unreadOnly } = req.query;
    const scopedUserId = req.user?.role === "ADMIN" ? null : req.user?.id;

    const result = webhookService.getReplies({
      limit,
      offset,
      search,
      campaignId,
      unreadOnly,
      userId: scopedUserId
    });

    return res.status(200).json({
      success: true,
      data: result.replies,
      replies: result.replies,
      pagination: {
        total: result.totalCount,
        limit: result.limit,
        offset: result.offset,
        unreadCount: result.unreadCount,
        distinctContacts: result.distinctContacts
      }
    });
  } catch (error) {
    console.error("[WebhookController] listReplies error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Marks a specific reply as read
 */
function markAsRead(req, res) {
  try {
    const { id } = req.params;
    webhookService.markAsRead(id);
    return res.status(200).json({ success: true, message: "Reply marked as read." });
  } catch (error) {
    console.error("[WebhookController] markAsRead error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Marks all unread replies as read
 */
function markAllAsRead(req, res) {
  try {
    webhookService.markAllAsRead();
    return res.status(200).json({ success: true, message: "All replies marked as read." });
  } catch (error) {
    console.error("[WebhookController] markAllAsRead error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Deletes a specific customer reply
 */
function deleteReply(req, res) {
  try {
    const { id } = req.params;
    webhookService.deleteReply(id);
    return res.status(200).json({ success: true, message: "Reply deleted." });
  } catch (error) {
    console.error("[WebhookController] deleteReply error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Deletes all messages in a conversation for a specific phone number
 */
function deleteConversation(req, res) {
  try {
    const phone = req.params.phone || req.body?.phone || req.query?.phone;
    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required to delete chat." });
    }
    const result = webhookService.deleteConversation(phone);
    return res.status(200).json({
      success: true,
      message: "Chat conversation deleted successfully.",
      deletedCount: result.deleted
    });
  } catch (error) {
    console.error("[WebhookController] deleteConversation error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Simulates an incoming customer reply (Restricted to authenticated testing)
 */
function simulateTestReply(req, res) {
  try {
    const { fromPhone, customerName, messageBody, campaignId, messageType, mediaUrl, mediaId } = req.body || {};

    const cleanBody = messageBody || (messageType === "image" ? "Here is the payment screenshot" : "Hello, I am interested! Please share the details.");
    const cleanPhone = fromPhone || "919876543210";
    const cleanName = customerName || "Demo Customer";

    const result = webhookService.simulateTestReply({
      fromPhone: cleanPhone,
      customerName: cleanName,
      messageBody: cleanBody,
      campaignId: campaignId || null,
      messageType: messageType || (mediaUrl ? "image" : "text"),
      mediaUrl: mediaUrl || null,
      mediaId: mediaId || null
    });

    return res.status(200).json({
      success: true,
      message: "Simulated customer reply processed successfully.",
      data: result
    });
  } catch (error) {
    console.error("[WebhookController] simulateTestReply error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Sends a manual WhatsApp reply to a customer from the dashboard
 */
async function sendManualReply(req, res) {
  try {
    const { id } = req.params;
    const { replyText } = req.body || {};

    if (!replyText || !String(replyText).trim()) {
      return res.status(400).json({ success: false, message: "Reply message cannot be empty." });
    }

    const updated = await webhookService.sendManualReply({
      replyId: id,
      replyText: String(replyText).trim()
    });

    return res.status(200).json({
      success: true,
      message: "Reply sent successfully via WhatsApp.",
      data: updated
    });
  } catch (error) {
    console.error("[WebhookController] sendManualReply error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Gets Auto-Reply settings
 */
function getAutoReplySettings(req, res) {
  try {
    const settings = webhookService.getAutoReplySettings();
    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error("[WebhookController] getAutoReplySettings error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Updates Auto-Reply settings
 */
function updateAutoReplySettings(req, res) {
  try {
    const { enabled, mode, message } = req.body || {};
    const updated = webhookService.saveAutoReplySettings({ enabled, mode, message });
    return res.status(200).json({
      success: true,
      message: "Auto-reply settings updated successfully.",
      data: updated
    });
  } catch (error) {
    console.error("[WebhookController] updateAutoReplySettings error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  handleVerification,
  handleIncomingEvent,
  verifyMetaSignature,
  getConfig,
  generateNewToken,
  saveToken,
  listReplies,
  markAsRead,
  markAllAsRead,
  deleteReply,
  deleteConversation,
  simulateTestReply,
  testHandshake,
  restartTunnel,
  sendManualReply,
  getAutoReplySettings,
  updateAutoReplySettings
};
