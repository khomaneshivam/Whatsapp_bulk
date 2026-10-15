const bookingAutomationService = require("../services/bookingAutomationService");

/**
 * Get current automation configuration & sync status
 */
async function getConfig(req, res) {
  try {
    const config = bookingAutomationService.getConfig();
    return res.status(200).json({
      success: true,
      config,
      data: config
    });
  } catch (error) {
    console.error("Automation getConfig error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Update automation configuration
 */
async function updateConfig(req, res) {
  try {
    const updated = bookingAutomationService.updateConfig(req.body || {});
    return res.status(200).json({
      success: true,
      message: "Booking automation settings updated successfully.",
      config: updated,
      data: updated
    });
  } catch (error) {
    console.error("Automation updateConfig error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Preview Google Sheet data and upcoming triggers
 */
async function previewSheet(req, res) {
  try {
    const { sheetUrl, sheetTabName, stages, preCheckinTemplate, checkoutTemplate, forceSync } = req.body || req.query || {};
    const overrides = {};
    if (stages && typeof stages === "object") overrides.stages = stages;
    if (sheetTabName) overrides.sheetTabName = sheetTabName;
    if (preCheckinTemplate) overrides.preCheckinTemplate = preCheckinTemplate;
    if (checkoutTemplate) overrides.checkoutTemplate = checkoutTemplate;

    const preview = await bookingAutomationService.previewTriggers(sheetUrl, overrides, Boolean(forceSync));
    if (!preview.success && preview.configured === false) {
      return res.status(400).json({
        success: false,
        message: preview.message || "Google Sheet not configured.",
        rows: [],
        headers: []
      });
    }

    return res.status(200).json({
      success: true,
      data: preview,
      rows: preview.bookings || [],
      headers: preview.headers || [],
      config: bookingAutomationService.getConfig()
    });
  } catch (error) {
    console.warn(`[Automation] Sheet preview notice: ${error.message}`);
    return res.status(400).json({
      success: false,
      message: error.message,
      rows: [],
      headers: []
    });
  }
}

/**
 * Manually trigger automation run right now
 */
async function runNow(req, res) {
  try {
    const result = await bookingAutomationService.runTriggers();
    return res.status(200).json(result);
  } catch (error) {
    console.error("Automation runNow error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get automated message dispatch history
 */
async function getHistory(req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const history = bookingAutomationService.getDispatchHistory(limit);
    return res.status(200).json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error("Automation getHistory error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Save uploaded contacts permanently to the database
 */
async function saveContacts(req, res) {
  try {
    const { contacts, defaultCountry = "91" } = req.body || {};
    const scopedUserId = req.user?.id || null;
    const result = bookingAutomationService.saveUploadedContacts(contacts, defaultCountry, scopedUserId);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Automation saveContacts error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get permanently saved uploaded contacts
 */
async function getContacts(req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 500;
    const contacts = bookingAutomationService.getUploadedContacts(limit);
    return res.status(200).json({
      success: true,
      data: contacts,
      count: contacts.length
    });
  } catch (error) {
    console.error("Automation getContacts error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Clear all permanently saved uploaded contacts
 */
async function clearContacts(req, res) {
  try {
    const result = bookingAutomationService.clearUploadedContacts();
    return res.status(200).json({
      success: true,
      message: "Uploaded contacts cleared successfully.",
      ...result
    });
  } catch (error) {
    console.error("Automation clearContacts error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get comprehensive live status of Evergreen Campaign and Auto-Sync
 */
async function getStatus(req, res) {
  try {
    const config = bookingAutomationService.getConfig();
    const preview = await bookingAutomationService.previewTriggers();
    bookingAutomationService.syncEvergreenCampaign(preview.bookings?.length || 0);

    return res.status(200).json({
      success: true,
      data: {
        enabled: config.enabled,
        googleSheetConfigured: Boolean(config.googleSheetUrl),
        googleSheetUrl: config.googleSheetUrl,
        sheetTabName: config.sheetTabName,
        totalActiveRecords: preview.totalRows || 0,
        validBookingsCount: preview.validBookingsCount || 0,
        totalDueNow: preview.totalDueCount || 0,
        dueBeforeCheckin: preview.dueBeforeCheckinCount || 0,
        dueOnCheckin: preview.dueOnCheckinCount || 0,
        dueOnCheckout: preview.dueOnCheckoutCount || 0,
        dueAfterCheckout: preview.dueAfterCheckoutCount || 0,
        scheduledToday: preview.scheduledTodayCount || 0,
        lastSheetSyncAt: preview.lastSheetSyncAt || new Date().toISOString(),
        systemTime: preview.systemTime,
        todayDate: preview.todayDate,
        timezone: preview.timezone
      }
    });
  } catch (error) {
    console.error("Automation getStatus error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  getConfig,
  updateConfig,
  previewSheet,
  runNow,
  getHistory,
  saveContacts,
  getContacts,
  clearContacts,
  getStatus
};
