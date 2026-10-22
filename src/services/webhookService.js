const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { db, getSetting, setSetting } = require("../config/database");
const config = require("../config/env");
const broadcastEngine = require("./broadcastEngine");
const { sendTextMessage, downloadAndSaveInboundMedia } = require("./metaWhatsAppService");

class WebhookService {
  constructor() {
    this.inFlightAutoReplies = new Set();
  }

  /**
   * Generates phone number variations to match across all formats (+91, 91, 10-digit national)
   */
  getPhoneVariations(phone) {
    const raw = String(phone || "").trim();
    const digits = raw.replace(/\D/g, "");
    if (!digits) return raw ? [raw] : [];

    const set = new Set([raw, digits, `+${digits}`]);
    if (digits.startsWith("91") && digits.length === 12) {
      const national = digits.substring(2);
      set.add(national);
      set.add(`+${national}`);
      set.add(`0${national}`);
    } else if (digits.length === 10) {
      set.add(`91${digits}`);
      set.add(`+91${digits}`);
      set.add(`0${digits}`);
    }
    return Array.from(set);
  }

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

    // Extract media metadata if incoming message is image, video, document, audio, or sticker
    let incomingMediaId = null;
    let incomingMediaUrl = null;
    let incomingMediaType = null;
    let incomingMediaCaption = null;

    if (msgType === "image") {
      incomingMediaType = "image";
      incomingMediaId = msg.image?.id || null;
      incomingMediaCaption = msg.image?.caption || null;
    } else if (msgType === "video") {
      incomingMediaType = "video";
      incomingMediaId = msg.video?.id || null;
      incomingMediaCaption = msg.video?.caption || null;
    } else if (msgType === "document") {
      incomingMediaType = "document";
      incomingMediaId = msg.document?.id || null;
      incomingMediaCaption = msg.document?.filename || msg.document?.caption || null;
    } else if (msgType === "audio") {
      incomingMediaType = "audio";
      incomingMediaId = msg.audio?.id || null;
      incomingMediaCaption = msg.audio?.voice ? "Voice Note" : null;
    } else if (msgType === "sticker") {
      incomingMediaType = "image";
      incomingMediaId = msg.sticker?.id || null;
    }

    if (incomingMediaId) {
      // Check if file was already downloaded to disk previously
      try {
        const inboundDir = path.resolve(__dirname, "../../public/uploads/inbound");
        if (fs.existsSync(inboundDir)) {
          const matched = fs.readdirSync(inboundDir).find(f => f.startsWith(`${incomingMediaId}.`));
          if (matched) {
            incomingMediaUrl = `/uploads/inbound/${matched}`;
          }
        }
      } catch (e) {}

      // Fallback to proxy route so it can be streamed or downloaded on demand
      if (!incomingMediaUrl) {
        incomingMediaUrl = `/api/media/inbound/${incomingMediaId}`;
      }
    }

    // Resolve owning user_id for multi-tenant isolation
    let replyUserId = null;
    if (matchedCampaignId) {
      const camp = db.prepare("SELECT user_id FROM campaigns WHERE id = ?").get(matchedCampaignId);
      if (camp?.user_id) replyUserId = camp.user_id;
    }
    if (!replyUserId && cleanPhone) {
      const pastCamp = db.prepare(`
        SELECT c.user_id 
        FROM campaign_recipients cr 
        JOIN campaigns c ON cr.campaign_id = c.id 
        WHERE cr.clean_phone = ? 
        ORDER BY cr.id DESC LIMIT 1
      `).get(cleanPhone);
      if (pastCamp?.user_id) replyUserId = pastCamp.user_id;
    }

    // Auto-opt-out detection (Suppression handling)
    const normalizedBody = String(messageBody || "").trim().toUpperCase();
    if (["STOP", "UNSUBSCRIBE", "OPT OUT", "OPTOUT", "CANCEL"].includes(normalizedBody)) {
      try {
        db.prepare(`
          INSERT OR REPLACE INTO contact_suppressions (clean_phone, reason, user_id, created_at)
          VALUES (?, 'USER_OPT_OUT', ?, CURRENT_TIMESTAMP)
        `).run(cleanPhone, replyUserId);
        const maskedPhone = cleanPhone.length > 4 ? `***${cleanPhone.slice(-4)}` : "***";
        console.log(`[Opt-Out] Contact ${maskedPhone} opted out via STOP keyword.`);
      } catch (optErr) {
        console.warn("[Opt-Out] Suppression insert notice:", optErr.message);
      }
    }

    const insertStmt = db.prepare(`
      INSERT INTO customer_replies (
        wa_message_id, from_phone, customer_name, message_type,
        message_body, raw_payload, context_message_id, campaign_id,
        media_url, media_type, media_caption,
        is_read, user_id, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
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
      incomingMediaUrl,
      incomingMediaType,
      incomingMediaCaption,
      replyUserId,
      receivedAt
    );

    const maskedSender = cleanPhone.length > 4 ? `***${cleanPhone.slice(-4)}` : "***";
    console.log(`[Webhook] Saved customer reply #${runResult.lastInsertRowid} from ${maskedSender} (type: ${msgType})`);

    // If inbound media needs background downloading from Meta
    if (incomingMediaId && (!incomingMediaUrl || incomingMediaUrl.startsWith("/api/media/inbound/"))) {
      this.downloadMediaInBackground(runResult.lastInsertRowid, incomingMediaId, incomingMediaType);
    }

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
   * Downloads incoming media asynchronously from Meta and updates customer_replies record
   */
  async downloadMediaInBackground(replyId, mediaId, mediaType) {
    if (!mediaId || !replyId) return;
    try {
      const res = await downloadAndSaveInboundMedia(mediaId);
      if (res && res.relativeUrl) {
        db.prepare("UPDATE customer_replies SET media_url = ?, media_type = ? WHERE id = ?")
          .run(res.relativeUrl, mediaType || "image", replyId);

        const updated = db.prepare(`
          SELECT r.*, c.name as campaign_name 
          FROM customer_replies r 
          LEFT JOIN campaigns c ON r.campaign_id = c.id 
          WHERE r.id = ?
        `).get(replyId);

        if (updated) {
          broadcastEngine.emit("webhook:reply_updated", updated);
        }
      }
    } catch (err) {
      console.warn(`[WebhookService] Background media download for reply #${replyId} (${mediaId}):`, err.message);
    }
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

    // Resolve event timestamp from Meta payload (UNIX epoch seconds)
    let eventTime = new Date().toISOString().replace("T", " ").substring(0, 19);
    if (statusObj.timestamp) {
      const tsSec = parseInt(statusObj.timestamp, 10);
      if (!isNaN(tsSec) && tsSec > 0) {
        eventTime = new Date(tsSec * 1000).toISOString().replace("T", " ").substring(0, 19);
      }
    }

    // Check existing recipient record (indexed by meta_message_id for O(1) lookup)
    const recipient = db.prepare(`
      SELECT id, status, campaign_id, delivered_at, read_at 
      FROM campaign_recipients 
      WHERE meta_message_id = ?
    `).get(metaMessageId);

    if (!recipient) {
      return false;
    }

    // Idempotency: Do not downgrade READ -> DELIVERED
    if (recipient.status === "READ" && newStatus === "DELIVERED") {
      return false;
    }

    let errorMsg = null;
    let errorCode = null;
    if (newStatus === "FAILED" && Array.isArray(statusObj.errors) && statusObj.errors.length > 0) {
      const err = statusObj.errors[0];
      errorCode = String(err.code || "");
      errorMsg = err.message || err.title || `Meta delivery error (${errorCode})`;
      if (err.error_data?.details) {
        errorMsg += ` - ${err.error_data.details}`;
      }
    }

    // Update recipient with stage-specific delivery timestamps
    if (newStatus === "DELIVERED") {
      db.prepare(`
        UPDATE campaign_recipients 
        SET status = 'DELIVERED', delivered_at = COALESCE(delivered_at, ?) 
        WHERE id = ?
      `).run(eventTime, recipient.id);

      if (recipient.campaign_id && recipient.status !== "DELIVERED" && recipient.status !== "READ") {
        try {
          db.prepare("UPDATE campaigns SET delivered_count = delivered_count + 1 WHERE id = ?").run(recipient.campaign_id);
        } catch (e) {}
      }
    } else if (newStatus === "READ") {
      db.prepare(`
        UPDATE campaign_recipients 
        SET status = 'READ', read_at = COALESCE(read_at, ?), delivered_at = COALESCE(delivered_at, ?) 
        WHERE id = ?
      `).run(eventTime, eventTime, recipient.id);

      if (recipient.campaign_id && recipient.status !== "READ") {
        try {
          const isFirstDelivery = recipient.status !== "DELIVERED";
          db.prepare(`
            UPDATE campaigns 
            SET read_count = read_count + 1
            ${isFirstDelivery ? ", delivered_count = delivered_count + 1" : ""}
            WHERE id = ?
          `).run(recipient.campaign_id);
        } catch (e) {}
      }
    } else if (newStatus === "FAILED") {
      db.prepare(`
        UPDATE campaign_recipients 
        SET status = 'FAILED', error_message = ?, error_code = ?, failed_at = COALESCE(failed_at, ?) 
        WHERE id = ?
      `).run(errorMsg, errorCode, eventTime, recipient.id);

      if (newStatus === "FAILED" && recipient.status !== "FAILED" && recipient.campaign_id) {
        try {
          db.prepare(`
            UPDATE campaigns 
            SET sent_count = MAX(0, sent_count - 1), failed_count = failed_count + 1 
            WHERE id = ?
          `).run(recipient.campaign_id);
        } catch (err) {}
      }
    }

    return true;
  }

  /**
   * Retrieves customer replies and outbound broadcast messages with filtering, searching, and pagination
   */
  getReplies({ limit = 50, offset = 0, search = "", campaignId = "", unreadOnly = false, userId = null }) {
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 2000);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const conditions = [];
    const params = [];

    // Tenant scoping (match assigned user, campaign owner, or unassigned/legacy messages)
    if (userId) {
      conditions.push("(m.user_id = ? OR m.campaign_user_id = ? OR m.user_id IS NULL OR m.user_id = 'admin_root' OR m.campaign_user_id = 'admin_root')");
      params.push(userId, userId);
    }

    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      conditions.push("(m.from_phone LIKE ? OR m.customer_name LIKE ? OR m.message_body LIKE ?)");
      params.push(q, q, q);
    }

    if (campaignId && String(campaignId).trim()) {
      conditions.push("m.campaign_id = ?");
      params.push(String(campaignId).trim());
    }

    if (unreadOnly === true || unreadOnly === "true" || unreadOnly === 1 || unreadOnly === "1") {
      conditions.push("m.is_read = 0");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const cteSql = `
      WITH combined_messages AS (
        SELECT 
          r.id as id,
          r.wa_message_id as wa_message_id,
          r.from_phone as from_phone,
          r.customer_name as customer_name,
          r.message_type as message_type,
          r.message_body as message_body,
          r.raw_payload as raw_payload,
          r.context_message_id as context_message_id,
          r.campaign_id as campaign_id,
          r.is_read as is_read,
          r.received_at as received_at,
          r.reply_text as reply_text,
          r.reply_sent_at as reply_sent_at,
          r.reply_status as reply_status,
          r.media_url as media_url,
          r.media_type as media_type,
          r.media_caption as media_caption,
          r.user_id as user_id,
          c.name as campaign_name,
          c.user_id as campaign_user_id
        FROM customer_replies r
        LEFT JOIN campaigns c ON r.campaign_id = c.id

        UNION ALL

        SELECT 
          ('cr_' || cr.id) as id,
          cr.meta_message_id as wa_message_id,
          cr.clean_phone as from_phone,
          cr.contact_name as customer_name,
          'outbound' as message_type,
          cr.rendered_message as message_body,
          cr.raw_data as raw_payload,
          NULL as context_message_id,
          cr.campaign_id as campaign_id,
          1 as is_read,
          cr.sent_at as received_at,
          NULL as reply_text,
          NULL as reply_sent_at,
          cr.status as reply_status,
          NULL as media_url,
          NULL as media_type,
          NULL as media_caption,
          c.user_id as user_id,
          c.name as campaign_name,
          c.user_id as campaign_user_id
        FROM campaign_recipients cr
        LEFT JOIN campaigns c ON cr.campaign_id = c.id
        WHERE cr.status IN ('SENT', 'DELIVERED', 'READ') AND cr.sent_at IS NOT NULL
      )
    `;

    // Total count
    const countSql = `${cteSql} SELECT COUNT(*) as total FROM combined_messages m ${whereClause}`;
    const totalCount = db.prepare(countSql).get(...params).total;

    // Unread count
    const unreadConditions = ["m.is_read = 0"];
    const unreadParams = [];
    if (userId) {
      unreadConditions.push("(m.user_id = ? OR m.campaign_user_id = ? OR m.user_id IS NULL OR m.user_id = 'admin_root' OR m.campaign_user_id = 'admin_root')");
      unreadParams.push(userId, userId);
    }
    const unreadSql = `${cteSql} SELECT COUNT(*) as unread FROM combined_messages m WHERE ${unreadConditions.join(" AND ")}`;
    const unreadCount = db.prepare(unreadSql).get(...unreadParams).unread;

    // Distinct customer contacts count
    const distinctConditions = [];
    const distinctParams = [];
    if (userId) {
      distinctConditions.push("(m.user_id = ? OR m.campaign_user_id = ? OR m.user_id IS NULL OR m.user_id = 'admin_root' OR m.campaign_user_id = 'admin_root')");
      distinctParams.push(userId, userId);
    }
    const distinctWhere = distinctConditions.length > 0 ? `WHERE ${distinctConditions.join(" AND ")}` : "";
    const distinctSql = `${cteSql} SELECT COUNT(DISTINCT m.from_phone) as count FROM combined_messages m ${distinctWhere}`;
    const distinctContacts = db.prepare(distinctSql).get(...distinctParams).count;

    // Query replies
    const dataSql = `
      ${cteSql}
      SELECT * FROM combined_messages m
      ${whereClause}
      ORDER BY m.received_at DESC, m.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, parsedLimit, parsedOffset];
    const rawReplies = db.prepare(dataSql).all(...dataParams);

    // Format outbound broadcast messages and heal missing media URLs
    const replies = rawReplies.map(r => {
      // Clean display text for outbound broadcast recipients
      if (r.message_type === "outbound" && (!r.message_body || !r.message_body.trim() || r.message_body.startsWith("[") || r.message_body.startsWith("{"))) {
        const trimmed = (r.message_body || "").trim();
        let formatted = null;
        if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              const bodyComp = parsed.find(comp => comp.type === "body");
              if (bodyComp && Array.isArray(bodyComp.parameters)) {
                const texts = bodyComp.parameters.map(p => p.text).filter(Boolean);
                if (texts.length > 0) {
                  formatted = `📢 ${r.campaign_name || "Broadcast"}: ${texts.join(" • ")}`;
                }
              }
            }
          } catch (e) {}
        }
        r.message_body = formatted || (r.campaign_name ? `📢 Broadcast: ${r.campaign_name}` : "WhatsApp Broadcast Message");
      }

      // Self-healing: if any media message was stored without media_url, extract media ID from raw_payload
      if (!r.media_url && r.raw_payload) {
        try {
          const raw = JSON.parse(r.raw_payload);
          const mediaObj = raw.image || raw.video || raw.document || raw.audio || raw.sticker;
          if (mediaObj?.id) {
            r.media_url = `/api/media/inbound/${mediaObj.id}`;
            r.media_type = r.message_type || (raw.image ? "image" : (raw.video ? "video" : (raw.document ? "document" : "image")));
            r.media_caption = r.media_caption || mediaObj.caption || mediaObj.filename || null;
            if (typeof r.id === "number") {
              db.prepare("UPDATE customer_replies SET media_url = ?, media_type = ? WHERE id = ?")
                .run(r.media_url, r.media_type, r.id);
            }
          }
        } catch (e) {}
      }
      return r;
    });

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
   * Deletes an entire chat conversation by customer phone number
   */
  deleteConversation(phone) {
    if (!phone) return { deleted: 0 };
    const rawPhone = String(phone).trim();
    const cleanDigits = rawPhone.replace(/\D/g, "");
    const withPlus = cleanDigits ? `+${cleanDigits}` : "";

    const result = db.prepare(`
      DELETE FROM customer_replies 
      WHERE from_phone = ? OR from_phone = ? OR from_phone = ?
    `).run(rawPhone, cleanDigits, withPlus);

    return { deleted: result.changes };
  }

  /**
   * Simulates an incoming customer reply for testing without requiring a public webhook URL
   */
  simulateTestReply({ 
    fromPhone = "919876543210", 
    customerName = "Test Customer", 
    messageBody = "Yes, I am interested! Please send more details.", 
    campaignId = null,
    messageType = "text",
    mediaUrl = null,
    mediaId = null
  }) {
    const fakeWaId = `wamid.SIMULATED_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const cleanPhone = String(fromPhone).replace(/\D/g, "");
    const msgType = (messageType || (mediaUrl ? "image" : "text")).toLowerCase();
    const isImage = msgType === "image";

    const fakeMsg = {
      from: cleanPhone,
      id: fakeWaId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: msgType
    };

    if (isImage) {
      fakeMsg.image = {
        caption: messageBody || "Simulated photo",
        mime_type: "image/jpeg",
        id: mediaId || `sim_img_${Date.now()}`
      };
    } else {
      fakeMsg.text = { body: messageBody };
    }

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
                messages: [fakeMsg]
              },
              field: "messages"
            }
          ]
        }
      ]
    };

    const res = this.processIncomingPayload(fakePayload);
    if (mediaUrl) {
      try {
        db.prepare("UPDATE customer_replies SET media_url = ?, media_type = 'image' WHERE wa_message_id = ?")
          .run(mediaUrl, fakeWaId);
      } catch (e) {}
    }
    return res;
  }

  /**
   * Automatically sends an automated WhatsApp reply to incoming customer message
   * Ensures automated message is sent ONLY ONCE per contact (not on every subsequent message).
   */
  async triggerAutoReply(replyRecord) {
    if (!replyRecord || !replyRecord.from_phone) return null;

    const enabled = getSetting("AUTO_REPLY_ENABLED");
    if (enabled !== "true" && enabled !== true) {
      return null;
    }

    const rawPhone = String(replyRecord.from_phone).trim();
    const cleanPhone = rawPhone.replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 10) return null;

    // Concurrency Lock: Prevent rapid burst incoming messages from the same phone from racing
    if (this.inFlightAutoReplies.has(cleanPhone)) {
      console.log(`[Webhook AutoReply] Concurrency: Auto-reply already in-flight for ${cleanPhone}. Skipping duplicate webhook.`);
      return null;
    }

    this.inFlightAutoReplies.add(cleanPhone);

    try {
      const mode = getSetting("AUTO_REPLY_MODE") || "ONCE_PER_CONTACT";
      const phoneVars = this.getPhoneVariations(rawPhone);
      const placeholders = phoneVars.map(() => "?").join(",");

      // Check whether this contact already received an auto-reply or had an outbound reply/conversation
      if (mode === "ONCE_PER_24_HOURS") {
        const priorRecent = db.prepare(`
          SELECT id, reply_status, message_type, reply_sent_at 
          FROM customer_replies 
          WHERE (from_phone IN (${placeholders}) OR REPLACE(REPLACE(REPLACE(from_phone, '+', ''), ' ', ''), '-', '') = ?)
            AND (reply_status = 'AUTO_REPLIED' OR message_type = 'outbound' OR reply_status = 'SENT')
            AND reply_sent_at > datetime('now', '-24 hours')
          LIMIT 1
        `).get(...phoneVars, cleanPhone);

        if (priorRecent) {
          console.log(`[Webhook AutoReply] Throttled: Already replied to ${cleanPhone} in the last 24 hours (Reply #${priorRecent.id}, sent: ${priorRecent.reply_sent_at}).`);
          return null;
        }
      } else {
        // Default mode: ONCE_PER_CONTACT (Send only once ever per contact)
        const priorReply = db.prepare(`
          SELECT id, reply_status, message_type, reply_sent_at 
          FROM customer_replies 
          WHERE (from_phone IN (${placeholders}) OR REPLACE(REPLACE(REPLACE(from_phone, '+', ''), ' ', ''), '-', '') = ?)
            AND (reply_status = 'AUTO_REPLIED' OR message_type = 'outbound' OR reply_status = 'SENT')
          LIMIT 1
        `).get(...phoneVars, cleanPhone);

        if (priorReply) {
          console.log(`[Webhook AutoReply] Suppressed: Contact ${cleanPhone} has already received automated reply or active conversation exists (Reply #${priorReply.id}, status: ${priorReply.reply_status}). Mode: ONCE_PER_CONTACT.`);
          return null;
        }
      }

      // Format auto-reply template message
      let templateMsg = getSetting("AUTO_REPLY_MESSAGE") || 
        "Hi {{name}}, thank you for reaching out to KonkanTrip! We have received your message. Our team will get back to you shortly.";
      
      const customerName = replyRecord.customer_name ? replyRecord.customer_name.trim() : "there";
      const finalMsg = templateMsg.replace(/\{\{name\}\}/gi, customerName);

      console.log(`[Webhook AutoReply] Sending auto-reply (Mode: ${mode}) to ${cleanPhone} (${customerName}): "${finalMsg}"`);

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
    } finally {
      this.inFlightAutoReplies.delete(cleanPhone);
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
      mode: getSetting("AUTO_REPLY_MODE") || "ONCE_PER_CONTACT",
      message: getSetting("AUTO_REPLY_MESSAGE") || "Hi {{name}}, thank you for reaching out to KonkanTrip! We have received your message and our team will get back to you shortly."
    };
  }

  /**
   * Updates auto-reply settings
   */
  saveAutoReplySettings({ enabled, mode, message }) {
    if (enabled !== undefined) {
      const isEnabled = enabled === true || enabled === "true";
      setSetting("AUTO_REPLY_ENABLED", isEnabled ? "true" : "false");
    }
    if (mode && (mode === "ONCE_PER_CONTACT" || mode === "ONCE_PER_24_HOURS")) {
      setSetting("AUTO_REPLY_MODE", mode);
    }
    if (message && String(message).trim()) {
      setSetting("AUTO_REPLY_MESSAGE", String(message).trim());
    }
    return this.getAutoReplySettings();
  }
}

module.exports = new WebhookService();
