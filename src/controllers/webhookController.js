const webhookService = require("../services/webhookService");
const tunnelService = require("../services/tunnelService");
const { getSetting } = require("../config/database");
const config = require("../config/env");

/**
 * Handles Meta Webhook Verification Handshake (GET /webhook or GET /api/webhook)
 */
function handleVerification(req, res) {
  try {
    const { verified, challenge } = webhookService.verifyHandshake(req.query);

    if (verified) {
      console.log(`[Webhook Handshake] Meta verification SUCCEEDED for challenge: ${challenge}`);
      // Must respond with the plain challenge string and HTTP 200
      return res.status(200).send(challenge);
    } else {
      console.warn(`[Webhook Handshake] Meta verification FAILED for query:`, req.query);
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
  console.log("[Webhook] Received incoming Meta notification:", JSON.stringify(payload));

  webhookService
    .processIncomingPayload(payload)
    .then(result => {
      if (result.processed > 0) {
        console.log(`[WebhookController] Processed ${result.messages} customer reply(ies), ${result.statuses} delivery status update(s).`);
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
    const tunnelStatus = tunnelService.getStatus();
    const publicTunnelUrl = tunnelStatus.url || getSetting("PUBLIC_WEBHOOK_URL");
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
 * Restarts the background tunnel
 */
async function restartTunnel(req, res) {
  try {
    console.log("[WebhookController] Manual tunnel restart requested from UI...");
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
    const { enabled, message } = req.body || {};
    const updated = webhookService.saveAutoReplySettings({ enabled, message });
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
  getConfig,
  generateNewToken,
  saveToken,
  listReplies,
  markAsRead,
  markAllAsRead,
  deleteReply,
  simulateTestReply,
  testHandshake,
  restartTunnel,
  sendManualReply,
  getAutoReplySettings,
  updateAutoReplySettings
};
