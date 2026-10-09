const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { db, getSetting, setSetting } = require("../config/database");
const config = require("../config/env");
const broadcastEngine = require("./broadcastEngine");
const { sendTextMessage } = require("./metaWhatsAppService");

class WebhookService {
  /**
   * Retrieves active webhook verify token from database or env
   */
  getVerifyToken() {
    return getSetting("WEBHOOK_VERIFY_TOKEN") || config.WEBHOOK_VERIFY_TOKEN || "wb_verify_konkantrip_7f3a9e2c4b810d56";
  }

  /**
   * Generates a new secure random verify token, updates DB and .env
   */
  generateVerifyToken() {
    const randomHex = crypto.randomBytes(16).toString("hex");
    const newToken = `wb_verify_${randomHex}`;
    this.saveVerifyToken(newToken);
    return newToken;
  }

  /**
   * Saves verify token to DB settings and attempts to update .env
   */
  saveVerifyToken(token) {
    if (!token || !String(token).trim()) {
      throw new Error("Verify token cannot be empty");
    }
    const cleanToken = String(token).trim();
    setSetting("WEBHOOK_VERIFY_TOKEN", cleanToken);

    // Update .env file if accessible
    try {
      const envPath = path.resolve(__dirname, "../../.env");
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, "utf8");
        if (/^WEBHOOK_VERIFY_TOKEN=/m.test(envContent)) {
          envContent = envContent.replace(/^WEBHOOK_VERIFY_TOKEN=.*$/m, `WEBHOOK_VERIFY_TOKEN=${cleanToken}`);
        } else {
          envContent += `\nWEBHOOK_VERIFY_TOKEN=${cleanToken}\n`;
        }
        fs.writeFileSync(envPath, envContent, "utf8");
      }
    } catch (err) {
      console.warn("[WebhookService] Warning: Could not update .env file:", err.message);
    }

    return cleanToken;
  }

  /**
   * Verifies the Meta Webhook handshake request (hub.mode, hub.verify_token, hub.challenge)
   */
  verifyHandshake(query) {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    const expectedToken = this.getVerifyToken();

    if (mode === "subscribe" && token === expectedToken) {
      console.log("[Webhook] Meta handshake verification SUCCEEDED for token:", token);
      return { verified: true, challenge };
    }

    console.warn(`[Webhook] Verification FAILED. Expected: ${expectedToken}, Received: ${token}`);
    return { verified: false, challenge: null };
  }

  /**
   * Parses and processes incoming Webhook notification payload from Meta
   */
  async processIncomingPayload(payload) {
    if (!payload || !Array.isArray(payload.entry)) {
      return { processed: 0, messages: 0, statuses: 0 };
    }

    let processedMessages = 0;
    let processedStatuses = 0;

    for (const entry of payload.entry) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const val = change.value || {};

        // 1. Process Incoming Customer Messages / Replies
        if (Array.isArray(val.messages) && val.messages.length > 0) {
          const contacts = Array.isArray(val.contacts) ? val.contacts : [];

          for (const msg of val.messages) {
            try {
              const result = this.saveCustomerReply(msg, contacts, val);
              if (result && result.saved) {
                processedMessages++;
                // Emit real-time event for SSE clients
                broadcastEngine.emit("webhook:reply", result.reply);

                // Auto-reply trigger (asynchronous)
                this.triggerAutoReply(result.reply).catch(arErr => {
                  console.error("[Webhook AutoReply] Error:", arErr.message);
                });
              }
            } catch (err) {
              console.error("[Webhook] Error saving customer reply:", err);
            }
          }
        }

        // 2. Process Delivery Status Updates (SENT, DELIVERED, READ, FAILED)
        if (Array.isArray(val.statuses) && val.statuses.length > 0) {
          for (const st of val.statuses) {
            try {
              const updated = this.updateRecipientDeliveryStatus(st);
              if (updated) {
                processedStatuses++;
                broadcastEngine.emit("webhook:status", st);
              }
            } catch (err) {
              console.error("[Webhook] Error processing delivery status:", err);
            }
          }
        }
      }
    }

    return {
      processed: processedMessages + processedStatuses,
      messages: processedMessages,
      statuses: processedStatuses
    };
  }

  /**
   * Saves incoming customer message to customer_replies table
   */
  saveCustomerReply(msg, contacts = [], rawValue = {}) {
    const waMessageId = msg.id;
    if (!waMessageId) return null;

    // Check if message already exists (idempotency)
    const existing = db.prepare("SELECT id FROM customer_replies WHERE wa_message_id = ?").get(waMessageId);
    if (existing) {
      console.log(`[Webhook] Duplicate message ID skipped: ${waMessageId}`);
      return { saved: false, id: existing.id };
    }

    const fromPhone = String(msg.from || "").trim();
    const cleanPhone = fromPhone.replace(/\D/g, "");

    // Extract profile name from Meta contacts list
    const contactObj = contacts.find(c => c.wa_id === fromPhone || c.wa_id === cleanPhone);
    let customerName = contactObj?.profile?.name || "";

    // Parse message body by type
    const msgType = msg.type || "text";
    let messageBody = "";

    switch (msgType) {
      case "text":
        messageBody = msg.text?.body || "";
        break;
      case "button":
        messageBody = msg.button?.text || msg.button?.payload || "[Button Clicked]";
        break;
      case "interactive":
        messageBody =
          msg.interactive?.button_reply?.title ||
          msg.interactive?.list_reply?.title ||
          msg.interactive?.button_reply?.id ||
          "[Interactive Reply]";
        break;
      case "reaction":
        messageBody = msg.reaction?.emoji ? `[Reaction: ${msg.reaction.emoji}]` : "[Reaction]";
        break;
      case "image":
        messageBody = msg.image?.caption ? `[Image] ${msg.image.caption}` : "[Image received]";
        break;
      case "document":
        messageBody = msg.document?.filename ? `[Document] ${msg.document.filename}` : "[Document received]";
        break;
      case "audio":
        messageBody = msg.audio?.voice ? "[Voice Note]" : "[Audio received]";
        break;
      case "video":
        messageBody = msg.video?.caption ? `[Video] ${msg.video.caption}` : "[Video received]";
        break;
      case "location":
        messageBody = msg.location?.name
          ? `[Location: ${msg.location.name}]`
          : `[Location: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
        break;
      default:
        messageBody = `[${msgType} message]`;
    }

    const contextMsgId = msg.context?.id || null;
    let matchedCampaignId = null;

    // 1. Try to match campaign via context.id (reply to a sent broadcast template)
    if (contextMsgId) {
      const matchByContext = db.prepare(`
        SELECT campaign_id, contact_name 
        FROM campaign_recipients 
        WHERE meta_message_id = ? 
        LIMIT 1
      `).get(contextMsgId);

      if (matchByContext) {
        matchedCampaignId = matchByContext.campaign_id;
        if (!customerName && matchByContext.contact_name) {
          customerName = matchByContext.contact_name;
        }
      }
    }

    // 2. If no context match, match most recent campaign for this recipient phone
    if (!matchedCampaignId && cleanPhone) {
      const matchByPhone = db.prepare(`
        SELECT campaign_id, contact_name 
        FROM campaign_recipients 
        WHERE clean_phone = ? OR phone_number = ? 
        ORDER BY id DESC 
        LIMIT 1
      `).get(cleanPhone, fromPhone);

      if (matchByPhone) {
        matchedCampaignId = matchByPhone.campaign_id;
        if (!customerName && matchByPhone.contact_name) {
          customerName = matchByPhone.contact_name;
        }
      }
    }

    // Convert UNIX timestamp to ISO string
    let receivedAt = new Date().toISOString().replace("T", " ").substring(0, 19);
    if (msg.timestamp) {
      const tsMs = parseInt(msg.timestamp, 10) * 1000;
      if (!isNaN(tsMs)) {
        receivedAt = new Date(tsMs).toISOString().replace("T", " ").substring(0, 19);
      }
    }

    const insertStmt = db.prepare(`
      INSERT INTO customer_replies (
        wa_message_id, from_phone, customer_name, message_type,
        message_body, raw_payload, context_message_id, campaign_id,
        is_read, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `);

    const runResult = insertStmt.run(
      waMessageId,
      fromPhone,
      customerName,
      msgType,
      messageBody,
      JSON.stringify(msg),
      contextMsgId,
      matchedCampaignId,
      receivedAt
    );

    console.log(`[Webhook] Saved customer reply #${runResult.lastInsertRowid} from ${fromPhone} (${customerName || "Unknown"}): "${messageBody}"`);

    // Fetch saved record with joined campaign name
    const savedRecord = db.prepare(`
      SELECT r.*, c.name as campaign_name 
      FROM customer_replies r 
      LEFT JOIN campaigns c ON r.campaign_id = c.id 
      WHERE r.id = ?
    `).get(runResult.lastInsertRowid);

    return { saved: true, reply: savedRecord };
  }

  /**
   * Updates campaign_recipients delivery status (DELIVERED, READ, FAILED)
   */
  updateRecipientDeliveryStatus(statusObj) {
    const metaMessageId = statusObj.id;
    if (!metaMessageId) return false;

    const rawStatus = String(statusObj.status || "").toUpperCase();
    let newStatus = rawStatus;

    if (rawStatus === "DELIVERED") {
      newStatus = "DELIVERED";
    } else if (rawStatus === "READ") {
      newStatus = "READ";
    } else if (rawStatus === "FAILED") {
      newStatus = "FAILED";
    } else {
      return false; // ignore other states like 'sent'
    }

    // Check existing status to avoid downgrading READ -> DELIVERED
    const recipient = db.prepare(`
      SELECT id, status, campaign_id FROM campaign_recipients WHERE meta_message_id = ?
    `).get(metaMessageId);

    if (!recipient) {
      return false;
    }

    if (recipient.status === "READ" && newStatus === "DELIVERED") {
      return false; // Do not overwrite READ with DELIVERED
    }

    let errorMsg = null;
    if (newStatus === "FAILED" && Array.isArray(statusObj.errors) && statusObj.errors.length > 0) {
      errorMsg = statusObj.errors[0]?.message || statusObj.errors[0]?.title || "Delivery failed";
    }

    if (errorMsg) {
      db.prepare(`
        UPDATE campaign_recipients 
        SET status = ?, error_message = ? 
        WHERE id = ?
      `).run(newStatus, errorMsg, recipient.id);
    } else {
      db.prepare(`
        UPDATE campaign_recipients 
        SET status = ? 
        WHERE id = ?
      `).run(newStatus, recipient.id);
    }

    return true;
  }

  /**
   * Retrieves customer replies with filtering, searching, and pagination
   */
  getReplies({ limit = 50, offset = 0, search = "", campaignId = "", unreadOnly = false }) {
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const conditions = [];
    const params = [];

    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      conditions.push("(r.from_phone LIKE ? OR r.customer_name LIKE ? OR r.message_body LIKE ?)");
      params.push(q, q, q);
    }

    if (campaignId && String(campaignId).trim()) {
      conditions.push("r.campaign_id = ?");
      params.push(String(campaignId).trim());
    }

    if (unreadOnly === true || unreadOnly === "true" || unreadOnly === 1 || unreadOnly === "1") {
      conditions.push("r.is_read = 0");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Total count
    const countSql = `SELECT COUNT(*) as total FROM customer_replies r ${whereClause}`;
    const totalCount = db.prepare(countSql).get(...params).total;

    // Unread count (overall)
    const unreadCount = db.prepare("SELECT COUNT(*) as unread FROM customer_replies WHERE is_read = 0").get().unread;

    // Distinct customer contacts count
    const distinctContacts = db.prepare("SELECT COUNT(DISTINCT from_phone) as count FROM customer_replies").get().count;

    // Query replies
    const dataSql = `
      SELECT 
        r.id,
        r.wa_message_id,
        r.from_phone,
        r.customer_name,
        r.message_type,
        r.message_body,
        r.raw_payload,
        r.context_message_id,
        r.campaign_id,
        r.is_read,
        r.received_at,
        r.reply_text,
        r.reply_sent_at,
        r.reply_status,
        c.name as campaign_name
      FROM customer_replies r
      LEFT JOIN campaigns c ON r.campaign_id = c.id
      ${whereClause}
      ORDER BY r.received_at DESC, r.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, parsedLimit, parsedOffset];
    const replies = db.prepare(dataSql).all(...dataParams);

    return {
      replies,
      totalCount,
      unreadCount,
      distinctContacts,
      limit: parsedLimit,
      offset: parsedOffset
    };
  }

  /**
   * Marks a specific reply as read
   */
  markAsRead(id) {
    return db.prepare("UPDATE customer_replies SET is_read = 1 WHERE id = ?").run(id);
  }

  /**
   * Marks all replies as read
   */
  markAllAsRead() {
    return db.prepare("UPDATE customer_replies SET is_read = 1 WHERE is_read = 0").run();
  }

  /**
   * Deletes a specific reply
   */
  deleteReply(id) {
    return db.prepare("DELETE FROM customer_replies WHERE id = ?").run(id);
  }

  /**
   * Simulates an incoming customer reply for testing without requiring a public webhook URL
   */
  simulateTestReply({ fromPhone = "919876543210", customerName = "Test Customer", messageBody = "Yes, I am interested! Please send more details.", campaignId = null }) {
    const fakeWaId = `wamid.SIMULATED_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const cleanPhone = String(fromPhone).replace(/\D/g, "");

    const fakePayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "SIMULATED_ACCOUNT",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                contacts: [
                  {
                    profile: { name: customerName },
                    wa_id: cleanPhone
                  }
                ],
                messages: [
                  {
                    from: cleanPhone,
                    id: fakeWaId,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: messageBody }
                  }
                ]
              },
              field: "messages"
            }
          ]
        }
      ]
    };

    return this.processIncomingPayload(fakePayload);
  }

  /**
   * Automatically sends an automated WhatsApp reply to incoming customer message
   */
  async triggerAutoReply(replyRecord) {
    if (!replyRecord || !replyRecord.from_phone) return null;

    const enabled = getSetting("AUTO_REPLY_ENABLED");
    if (enabled !== "true" && enabled !== true) {
      return null;
    }

    const cleanPhone = String(replyRecord.from_phone).replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 10) return null;

    // Debounce / Anti-Loop check: Don't auto-reply if we already auto-replied to this contact within last 15 minutes
    try {
      const recentAutoReply = db.prepare(`
        SELECT id FROM customer_replies 
        WHERE from_phone = ? AND reply_status = 'AUTO_REPLIED' 
        AND reply_sent_at > datetime('now', '-15 minutes')
        LIMIT 1
      `).get(replyRecord.from_phone);

      if (recentAutoReply) {
        console.log(`[Webhook AutoReply] Throttled: Already auto-replied to ${cleanPhone} in the last 15 minutes.`);
        return null;
      }
    } catch (checkErr) {
      console.warn("[Webhook AutoReply] Throttling check warning:", checkErr.message);
    }

    // Format auto-reply template message
    let templateMsg = getSetting("AUTO_REPLY_MESSAGE") || 
      "Hi {{name}}, thank you for reaching out to KonkanTrip! We have received your message. Our team will get back to you shortly.";
    
    const customerName = replyRecord.customer_name ? replyRecord.customer_name.trim() : "there";
    const finalMsg = templateMsg.replace(/\{\{name\}\}/gi, customerName);

    console.log(`[Webhook AutoReply] Sending auto-reply to ${cleanPhone} (${customerName}): "${finalMsg}"`);

    try {
      const sendResult = await sendTextMessage({
        to: cleanPhone,
        body: finalMsg
      });

      const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
      db.prepare(`
        UPDATE customer_replies 
        SET reply_text = ?, reply_sent_at = ?, reply_status = 'AUTO_REPLIED' 
        WHERE id = ?
      `).run(finalMsg, nowIso, replyRecord.id);

      const updatedRecord = {
        ...replyRecord,
        reply_text: finalMsg,
        reply_sent_at: nowIso,
        reply_status: 'AUTO_REPLIED'
      };

      broadcastEngine.emit("webhook:reply_updated", updatedRecord);
      console.log(`[Webhook AutoReply] ✓ Auto-reply delivered to ${cleanPhone}. Message ID: ${sendResult.messageId || 'OK'}`);

      return {
        success: true,
        messageId: sendResult.messageId,
        replyText: finalMsg
      };
    } catch (err) {
      console.error(`[Webhook AutoReply] ✗ Failed to send auto-reply to ${cleanPhone}:`, err.message);
      try {
        db.prepare(`UPDATE customer_replies SET reply_status = 'FAILED' WHERE id = ?`).run(replyRecord.id);
      } catch (e) {}
      return { success: false, error: err.message };
    }
  }

  /**
   * Manually sends a custom reply from the dashboard to a customer
   */
  async sendManualReply({ replyId, replyText }) {
    if (!replyId) throw new Error("Reply ID is required.");
    if (!replyText || !String(replyText).trim()) throw new Error("Reply message cannot be empty.");

    const cleanText = String(replyText).trim();
    const record = db.prepare("SELECT * FROM customer_replies WHERE id = ?").get(replyId);
    if (!record) {
      throw new Error(`Customer reply #${replyId} not found.`);
    }

    const cleanPhone = String(record.from_phone).replace(/\D/g, "");
    console.log(`[Webhook Reply] Sending manual reply to ${cleanPhone}: "${cleanText}"`);

    const sendResult = await sendTextMessage({
      to: cleanPhone,
      body: cleanText
    });

    const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
    db.prepare(`
      UPDATE customer_replies 
      SET reply_text = ?, reply_sent_at = ?, reply_status = 'SENT', is_read = 1 
      WHERE id = ?
    `).run(cleanText, nowIso, replyId);

    const updatedRecord = {
      ...record,
      reply_text: cleanText,
      reply_sent_at: nowIso,
      reply_status: 'SENT',
      is_read: 1
    };

    broadcastEngine.emit("webhook:reply_updated", updatedRecord);
    console.log(`[Webhook Reply] ✓ Manual reply delivered to ${cleanPhone}. Message ID: ${sendResult.messageId || 'OK'}`);

    return updatedRecord;
  }

  /**
   * Gets current auto-reply settings
   */
  getAutoReplySettings() {
    return {
      enabled: getSetting("AUTO_REPLY_ENABLED") === "true",
      message: getSetting("AUTO_REPLY_MESSAGE") || "Hi {{name}}, thank you for reaching out to KonkanTrip! We have received your message and our team will get back to you shortly."
    };
  }

  /**
   * Updates auto-reply settings
   */
  saveAutoReplySettings({ enabled, message }) {
    const isEnabled = enabled === true || enabled === "true";
    setSetting("AUTO_REPLY_ENABLED", isEnabled ? "true" : "false");
    if (message && String(message).trim()) {
      setSetting("AUTO_REPLY_MESSAGE", String(message).trim());
    }
    return this.getAutoReplySettings();
  }
}

module.exports = new WebhookService();
