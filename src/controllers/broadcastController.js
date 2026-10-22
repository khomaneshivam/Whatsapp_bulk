const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { db, getSetting } = require("../config/database");
const config = require("../config/env");
const broadcastEngine = require("../services/broadcastEngine");
const { cleanPhone, sendTemplateMessage, sendTextMessage, getTemplateDetails } = require("../services/metaWhatsAppService");
const timeUtil = require("../utils/timeUtil");
const schedulerService = require("../services/schedulerService");

/**
 * Helper to check campaign ownership
 */
function checkCampaignAccess(campaign, user) {
  if (!campaign) {
    return { allowed: false, status: 404, message: "Campaign not found." };
  }
  if (!user) {
    return { allowed: false, status: 401, message: "Authentication required." };
  }
  if (user.role === "ADMIN") {
    return { allowed: true };
  }
  if (campaign.user_id && campaign.user_id !== user.id) {
    return { allowed: false, status: 403, message: "Forbidden: You do not own this campaign." };
  }
  return { allowed: true };
}

/**
 * Calculates estimated campaign cost based on configurable rates
 */
function calculateCostEstimate(recipientCount, messageType = "TEMPLATE") {
  const marketingRate = parseFloat(getSetting("META_MARKETING_RATE_INR") || "0.80");
  const utilityRate = parseFloat(getSetting("META_UTILITY_RATE_INR") || "0.12");
  const rate = messageType === "TEXT" ? 0.0 : marketingRate;
  const estimatedTotal = parseFloat((recipientCount * rate).toFixed(2));
  return {
    perMessageRate: rate,
    currency: "INR",
    recipientCount,
    estimatedTotal,
    disclaimer: "Estimated cost based on current configurable Meta rate inputs; actual final invoice is determined by Meta."
  };
}

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
      phoneId,
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
      const schedDate = timeUtil.parseDateSmart(scheduledAt);
      if (!schedDate || isNaN(schedDate.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid schedule date/time." });
      }
      if (schedDate.getTime() <= Date.now()) {
        return res.status(400).json({ success: false, message: "Scheduled time must be in the future (Indian Standard Time)." });
      }
      formattedScheduledAt = schedDate.toISOString();
      initialStatus = "SCHEDULED";
    }

    const campaignId = uuidv4();
    const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
    
    // Server-side bounded dispatch delay (50ms - 10000ms safety envelope)
    const rawDelay = delayMs ? parseInt(delayMs, 10) : parseInt(getSetting("BROADCAST_DELAY_MS") || "250", 10);
    const resolvedDelay = Math.min(Math.max(isNaN(rawDelay) ? 250 : rawDelay, 50), 10000);

    // Multi-tenant user assignment
    const userId = req.user?.id || null;

    // Enforce phone ownership / assignment
    let assignedPhoneId = null;
    if (req.user?.role === "ADMIN" && phoneId) {
      assignedPhoneId = phoneId;
    } else if (req.user?.assigned_phone_id) {
      assignedPhoneId = req.user.assigned_phone_id;
    } else {
      const defaultPhone = db.prepare("SELECT phone_number_id FROM waba_phone_numbers WHERE is_default = 1 LIMIT 1").get();
      assignedPhoneId = defaultPhone ? defaultPhone.phone_number_id : (config.WHATSAPP_PHONE_NUMBER_ID || null);
    }

    // Fetch suppression list (opted-out numbers)
    const suppressions = db.prepare("SELECT clean_phone FROM contact_suppressions").all();
    const suppressedPhones = new Set(suppressions.map(s => s.clean_phone));

    let validCount = 0;
    let invalidCount = 0;
    let duplicateCount = 0;
    let suppressedCount = 0;

    const seenPhonesInBatch = new Set();
    const recipientsToInsert = [];

    for (const c of contacts) {
      const rawPhone = phoneColumn ? String(c[phoneColumn] || "") : String(c.rawPhone || c.phone || "");
      const cleaned = cleanPhone(rawPhone, defaultCountry);
      const contactName = nameColumn ? String(c[nameColumn] || "") : String(c.contactName || c.name || "");

      const isValid = cleaned.length >= 10 && cleaned.length <= 15;
      if (!isValid) {
        invalidCount++;
        continue;
      }

      // Campaign-level duplicate-send guard
      if (seenPhonesInBatch.has(cleaned)) {
        duplicateCount++;
        continue;
      }
      seenPhonesInBatch.add(cleaned);

      // Suppression list / opt-out guard
      if (suppressedPhones.has(cleaned)) {
        suppressedCount++;
        continue;
      }

      validCount++;
      recipientsToInsert.push({
        campaignId,
        phone: rawPhone,
        cleanPhone: cleaned,
        contactName,
        rawData: JSON.stringify(c)
      });
    }

    if (validCount === 0) {
      return res.status(400).json({
        success: false,
        message: "No deliverable phone numbers found in the provided contact list (all contacts were invalid, duplicates, or opted out)."
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

    const costPreview = calculateCostEstimate(validCount, type);

    // Insert campaign record with user_id, phone_number_id, and estimated_cost
    const insertCampaign = db.prepare(`
      INSERT INTO campaigns (
        id, name, file_name, total_contacts, valid_contacts, invalid_contacts,
        sent_count, failed_count, status, message_type, template_name,
        template_language, message_body, mapping_config, delay_ms, scheduled_at,
        user_id, phone_number_id, estimated_cost, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
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
      formattedScheduledAt,
      userId,
      assignedPhoneId,
      costPreview.estimatedTotal
    );

    // Bulk insert recipients inside an immediate transaction
    const insertRecipient = db.prepare(`
      INSERT INTO campaign_recipients (
        campaign_id, phone_number, clean_phone, contact_name, raw_data, status
      ) VALUES (?, ?, ?, ?, ?, 'PENDING')
    `);

    db.exec("BEGIN IMMEDIATE TRANSACTION;");
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
      ? `Campaign '${name}' scheduled for ${timeUtil.formatIndianDateTime(formattedScheduledAt)} (IST) with ${validCount} contacts.`
      : `Campaign '${name}' created successfully with ${validCount} contacts.`;

    return res.status(201).json({
      success: true,
      message: successMessage,
      data: createdCampaign,
      stats: {
        total: contacts.length,
        valid: validCount,
        invalid: invalidCount,
        duplicatesFiltered: duplicateCount,
        suppressedOptOuts: suppressedCount
      },
      costEstimate: costPreview
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
 * Starts broadcasting a campaign (verifying ownership)
 */
async function startCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const { delayMs, throttleDelay } = req.body || {};
    
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    const access = checkCampaignAccess(campaign, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const rawDelay = delayMs !== undefined ? delayMs : throttleDelay;
    const parsedDelay = rawDelay !== undefined ? Math.min(Math.max(parseInt(rawDelay, 10) || 250, 50), 10000) : undefined;

    const result = await broadcastEngine.startCampaign(campaignId, parsedDelay);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Start campaign error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * Updates the dispatch throttle delay for a campaign (verifying ownership)
 */
async function updateThrottleDelay(req, res) {
  try {
    const { campaignId } = req.params;
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    const access = checkCampaignAccess(campaign, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const { delayMs, throttleDelay } = req.body || {};
    const rawDelay = delayMs !== undefined ? delayMs : throttleDelay;
    if (rawDelay === undefined || rawDelay === null) {
      return res.status(400).json({ success: false, message: "Throttle delay (delayMs) is required." });
    }
    const safeDelay = Math.min(Math.max(parseInt(rawDelay, 10) || 250, 50), 10000);
    const result = broadcastEngine.setCampaignDelay(campaignId, safeDelay);
    return res.status(200).json({
      success: true,
      message: `Dispatch throttle delay updated to ${result.delayMs}ms.`,
      delayMs: result.delayMs
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * Pauses an ongoing campaign (verifying ownership)
 */
async function pauseCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    const access = checkCampaignAccess(campaign, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const result = broadcastEngine.pauseCampaign(campaignId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * Resumes a paused campaign (verifying ownership)
 */
async function resumeCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    const access = checkCampaignAccess(campaign, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const { delayMs, throttleDelay } = req.body || {};
    const rawDelay = delayMs !== undefined ? delayMs : throttleDelay;
    const safeDelay = rawDelay !== undefined ? Math.min(Math.max(parseInt(rawDelay, 10) || 250, 50), 10000) : undefined;
    const result = await broadcastEngine.resumeCampaign(campaignId, safeDelay);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * Cancels/Stops an ongoing campaign (verifying ownership)
 */
async function cancelCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    const access = checkCampaignAccess(campaign, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

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
        to: targetPhone,
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
 * Reschedules a scheduled campaign to a new future date/time (verifying ownership)
 */
async function rescheduleCampaign(req, res) {
  try {
    const { campaignId } = req.params;
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    const access = checkCampaignAccess(campaign, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

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
 * Executes a scheduled campaign immediately (verifying ownership)
 */
async function runScheduledNow(req, res) {
  try {
    const { campaignId } = req.params;
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    const access = checkCampaignAccess(campaign, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

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

/**
 * Issues short-lived, single-purpose SSE stream token (valid for 60 seconds)
 */
function getStreamToken(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const streamToken = jwt.sign(
      {
        userId: req.user.id,
        role: req.user.role,
        purpose: "sse_stream"
      },
      config.JWT_SECRET,
      { expiresIn: "60s" }
    );

    return res.status(200).json({
      success: true,
      streamToken,
      expiresIn: 60
    });
  } catch (error) {
    console.error("getStreamToken error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  createCampaign,
  startCampaign,
  updateThrottleDelay,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  sendTestMessage,
  rescheduleCampaign,
  runScheduledNow,
  getStreamToken
};
