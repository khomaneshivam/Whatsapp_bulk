const webhookService = require("../services/webhookService");
const { getSetting } = require("../config/database");
const config = require("../config/env");

/**
 * Handles Meta Webhook Verification Handshake (GET /webhook or GET /api/webhook)
 */
function handleVerification(req, res) {
  try {
    const { verified, challenge } = webhookService.verifyHandshake(req.query);

    if (verified) {
      // Must respond with the plain challenge string and HTTP 200
      return res.status(200).send(challenge);
    } else {
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
  // Acknowledge immediately to Meta with 200 OK to avoid timeouts
  res.status(200).send("EVENT_RECEIVED");

  // Asynchronously process the payload
  const payload = req.body;
  webhookService
    .processIncomingPayload(payload)
    .then(result => {
      if (result.processed > 0) {
        console.log(`[WebhookController] Processed ${result.messages} message(s), ${result.statuses} status update(s).`);
      }
    })
    .catch(err => {
      console.error("[WebhookController] Error processing payload:", err);
    });
}

/**
 * Gets Webhook configuration and status for the UI
 */
function getConfig(req, res) {
  try {
    const verifyToken = webhookService.getVerifyToken();
    const publicTunnelUrl = getSetting("PUBLIC_WEBHOOK_URL");
    const host = req.get("host") || `localhost:${config.PORT}`;
    const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";

    const webhookUrl = publicTunnelUrl ? `${publicTunnelUrl}/webhook` : `${protocol}://${host}/webhook`;
    const altWebhookUrl = publicTunnelUrl ? `${publicTunnelUrl}/api/webhook` : `${protocol}://${host}/api/webhook`;

    const repliesStats = webhookService.getReplies({ limit: 1 });

    return res.status(200).json({
      success: true,
      data: {
        verifyToken,
        webhookUrl,
        altWebhookUrl,
        publicTunnelUrl: publicTunnelUrl || null,
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
 * Generates a new secure random verify token
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
 * Saves a custom verify token
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
 * Lists customer replies with search, filter, and pagination
 */
function listReplies(req, res) {
  try {
    const { limit, offset, search, campaignId, unreadOnly } = req.query;

    const result = webhookService.getReplies({
      limit,
      offset,
      search,
      campaignId,
      unreadOnly
    });

    return res.status(200).json({
      success: true,
      data: result.replies,
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
 * Simulates an incoming customer reply for local testing without external tunnel
 */
function simulateTestReply(req, res) {
  try {
    const { fromPhone, customerName, messageBody, campaignId } = req.body || {};

    const cleanBody = messageBody || "Hello, I am interested! Please share the details.";
    const cleanPhone = fromPhone || "919876543210";
    const cleanName = customerName || "Demo Customer";

    const result = webhookService.simulateTestReply({
      fromPhone: cleanPhone,
      customerName: cleanName,
      messageBody: cleanBody,
      campaignId: campaignId || null
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

module.exports = {
  handleVerification,
  handleIncomingEvent,
  getConfig,
  generateNewToken,
  saveToken,
  listReplies,
  markAsRead,
  markAllAsRead,
  deleteReply,
  simulateTestReply
};
