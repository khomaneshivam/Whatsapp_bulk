const { v4: uuidv4 } = require("uuid");
const { db, getSetting } = require("../config/database");
const broadcastEngine = require("../services/broadcastEngine");
const { cleanPhone, sendTemplateMessage, sendTextMessage } = require("../services/metaWhatsAppService");

const schedulerService = require("../services/schedulerService");
const { getTemplateDetails } = require("../services/metaWhatsAppService");

/**
 * Creates a new broadcast campaign and prepares recipients (immediate or scheduled)
 */
async function createCampaign(req, res) {
  try {
    const {
      name,
      fileName,
      messageType,
      templateName,
      templateLanguage,
      messageBody,
      mappingConfig,
      delayMs,
      contacts,
      phoneColumn,
      nameColumn,
      scheduleMode, // 'NOW' or 'SCHEDULE'
      scheduledAt   // ISO string or timestamp
    } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Campaign name is required." });
    }

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ success: false, message: "At least one contact is required to create a campaign." });
    }

    const type = messageType === "TEXT" ? "TEXT" : "TEMPLATE";
    if (type === "TEMPLATE" && !templateName) {
      return res.status(400).json({ success: false, message: "Template number or name is required for template broadcasts." });
    }
    if (type === "TEXT" && !messageBody) {
      return res.status(400).json({ success: false, message: "Message body is required for text broadcasts." });
    }

    // Schedule validation
    const isScheduled = scheduleMode === "SCHEDULE";
    let formattedScheduledAt = null;
    let initialStatus = "DRAFT";

    if (isScheduled) {
      if (!scheduledAt) {
        return res.status(400).json({ success: false, message: "Please specify a future date and time for the scheduled broadcast." });
      }
      const schedDate = new Date(scheduledAt);
      if (isNaN(schedDate.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid schedule date/time." });
      }
      if (schedDate.getTime() <= Date.now()) {
        return res.status(400).json({ success: false, message: "Scheduled time must be in the future." });
      }
      formattedScheduledAt = schedDate.toISOString();
      initialStatus = "SCHEDULED";
    }

    const campaignId = uuidv4();
    const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
    const resolvedDelay = delayMs ? parseInt(delayMs, 10) : parseInt(getSetting("BROADCAST_DELAY_MS") || "250", 10);

    let validCount = 0;
    let invalidCount = 0;

    // Filter and prepare recipients
    const recipientsToInsert = [];
    for (const c of contacts) {
      const rawPhone = phoneColumn ? String(c[phoneColumn] || "") : String(c.rawPhone || c.phone || "");
      const cleaned = cleanPhone(rawPhone, defaultCountry);
      const contactName = nameColumn ? String(c[nameColumn] || "") : String(c.contactName || c.name || "");

      const isValid = cleaned.length >= 10 && cleaned.length <= 15;
      if (isValid) {
        validCount++;
        recipientsToInsert.push({
          campaignId,
          phone: rawPhone,
          cleanPhone: cleaned,
          contactName,
          rawData: JSON.stringify(c)
        });
      } else {
        invalidCount++;
      }
    }

    if (validCount === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid phone numbers found in the provided contact list."
      });
    }

    // Resolve template name if numeric template number/ID provided
    let resolvedTplName = templateName || null;
    let resolvedTplLang = templateLanguage || "en";
    if (type === "TEMPLATE") {
      resolvedTplName = String(templateName).trim();
      if (resolvedTplName === "1059862786867912" || resolvedTplName === "kt_invitation_") {
        resolvedTplName = "kt_invitation_";
        resolvedTplLang = resolvedTplLang || "en";
      } else if (resolvedTplName === "1757343188867100" || resolvedTplName.toLowerCase().includes("restaurant")) {
        resolvedTplName = "kt_restaurant_invitation";
        resolvedTplLang = resolvedTplLang || "en";
      } else if (/^\d+$/.test(resolvedTplName)) {
        try {
          const details = await getTemplateDetails(resolvedTplName);
          if (details && details.name) {
            resolvedTplName = details.name;
            if (details.language) resolvedTplLang = details.language;
          }
        } catch (e) {
          console.warn("[Broadcast] Template lookup note:", e.message);
        }
      }
    }

    // Insert campaign record
    const insertCampaign = db.prepare(`
      INSERT INTO campaigns (
        id, name, file_name, total_contacts, valid_contacts, invalid_contacts,
        sent_count, failed_count, status, message_type, template_name,
        template_language, message_body, mapping_config, delay_ms, scheduled_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
    `);

    insertCampaign.run(
      campaignId,
      name.trim(),
      fileName || "contacts.xlsx",
      contacts.length,
      validCount,
      invalidCount,
      initialStatus,
      type,
      resolvedTplName,
      resolvedTplLang,
      messageBody || null,
      JSON.stringify(mappingConfig || {}),
      resolvedDelay,
      formattedScheduledAt
    );

    // Bulk insert recipients
    const insertRecipient = db.prepare(`
      INSERT INTO campaign_recipients (
        campaign_id, phone_number, clean_phone, contact_name, raw_data, status
      ) VALUES (?, ?, ?, ?, ?, 'PENDING')
    `);

    // In SQLite, wrap in a transaction for fast bulk insert
    db.exec("BEGIN TRANSACTION;");
    try {
      for (const r of recipientsToInsert) {
        insertRecipient.run(r.campaignId, r.phone, r.cleanPhone, r.contactName, r.rawData);
      }
      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    const createdCampaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);

    const successMessage = isScheduled
      ? `Campaign '${name}' scheduled for ${new Date(formattedScheduledAt).toLocaleString()} with ${validCount} contacts.`
      : `Campaign '${name}' created successfully with ${validCount} contacts.`;

    return res.status(201).json({
      success: true,
      message: successMessage,
      data: createdCampaign
    });
  } catch (error) {
    console.error("Create campaign error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create broadcast campaign."
    });
  }
}

/**
 * Starts broadcasting a campaign
 */
async function startCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const result = await broadcastEngine.startCampaign(campaignId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Start campaign error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * Pauses an ongoing campaign
 */
async function pauseCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const result = broadcastEngine.pauseCampaign(campaignId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * Resumes a paused campaign
 */
async function resumeCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const result = await broadcastEngine.resumeCampaign(campaignId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * Cancels/Stops an ongoing campaign
 */
async function cancelCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const result = broadcastEngine.cancelCampaign(campaignId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * Sends a single test message to verify template or text before full broadcast
 */
async function sendTestMessage(req, res) {
  try {
    const {
      phone,
      testPhone,
      messageType,
      templateName,
      templateLanguage,
      components,
      messageBody
    } = req.body || {};

    const targetPhone = phone || testPhone;
    if (!targetPhone) {
      return res.status(400).json({ success: false, message: "Recipient phone number is required for test send." });
    }

    let result;
    if (messageType === "TEMPLATE") {
      let resolvedTplName = String(templateName || "kt_invitation_").trim();
      let resolvedTplLang = templateLanguage || "en";
      let resolvedComponents = Array.isArray(components) ? components : [];

      if (resolvedTplName === "1059862786867912" || resolvedTplName === "kt_invitation_") {
        resolvedTplName = "kt_invitation_";
        resolvedTplLang = resolvedTplLang || "en";
      } else if (resolvedTplName === "1757343188867100" || resolvedTplName.toLowerCase().includes("restaurant")) {
        resolvedTplName = "kt_restaurant_invitation";
        resolvedTplLang = resolvedTplLang || "en";
      } else if (/^\d+$/.test(resolvedTplName)) {
        try {
          const details = await getTemplateDetails(resolvedTplName);
          if (details && details.name) {
            resolvedTplName = details.name;
            if (details.language) resolvedTplLang = details.language;
          }
        } catch (e) {
          console.warn("[TestSend] Template lookup note:", e.message);
        }
      }

      result = await sendTemplateMessage({
        to: targetPhone,
        templateName: resolvedTplName,
        languageCode: resolvedTplLang,
        components: resolvedComponents
      });
    } else {
      if (!messageBody) {
        return res.status(400).json({ success: false, message: "Message body is required." });
      }

      result = await sendTextMessage({
        to: phone,
        body: messageBody
      });
    }

    return res.status(200).json({
      success: true,
      message: `Test message sent successfully to ${result.recipient}.`,
      data: result
    });
  } catch (error) {
    console.error("Test send error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to dispatch test message.",
      metaCode: error.metaCode,
      hint: error.hint
    });
  }
}

/**
 * Reschedules a scheduled campaign to a new future date/time
 */
async function rescheduleCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const { scheduledAt } = req.body || {};

    if (!scheduledAt) {
      return res.status(400).json({ success: false, message: "New scheduled date and time is required." });
    }

    const result = schedulerService.rescheduleCampaign(campaignId, scheduledAt);
    return res.status(200).json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    console.error("Reschedule campaign error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * Executes a scheduled campaign immediately
 */
async function runScheduledNow(req, res) {
  try {
    const { campaignId } = req.params;
    const result = await schedulerService.runScheduledNow(campaignId);
    return res.status(200).json({
      success: true,
      data: result,
      message: "Broadcast triggered immediately."
    });
  } catch (error) {
    console.error("Run scheduled now error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
}

module.exports = {
  createCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  sendTestMessage,
  rescheduleCampaign,
  runScheduledNow
};
