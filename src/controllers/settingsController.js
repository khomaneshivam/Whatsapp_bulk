const { getAllSettings, setSetting } = require("../config/database");
const { testConnection, getTemplateDetails } = require("../services/metaWhatsAppService");

/**
 * Get current settings
 */
async function getSettings(req, res) {
  try {
    const settings = getAllSettings();
    return res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error("Get settings error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Update settings
 */
async function updateSettings(req, res) {
  try {
    const {
      WHATSAPP_API_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID,
      DEFAULT_COUNTRY_CODE,
      BROADCAST_DELAY_MS,
      WHATSAPP_TEMPLATE_ID,
      DEFAULT_TEMPLATE_NAME,
      DEFAULT_TEMPLATE_LANG
    } = req.body || {};

    if (WHATSAPP_API_TOKEN !== undefined) {
      setSetting("WHATSAPP_API_TOKEN", WHATSAPP_API_TOKEN.trim());
    }
    if (WHATSAPP_PHONE_NUMBER_ID !== undefined) {
      setSetting("WHATSAPP_PHONE_NUMBER_ID", WHATSAPP_PHONE_NUMBER_ID.trim());
    }
    if (DEFAULT_COUNTRY_CODE !== undefined) {
      setSetting("DEFAULT_COUNTRY_CODE", DEFAULT_COUNTRY_CODE.trim());
    }
    if (BROADCAST_DELAY_MS !== undefined) {
      setSetting("BROADCAST_DELAY_MS", String(BROADCAST_DELAY_MS));
    }
    if (WHATSAPP_TEMPLATE_ID !== undefined) {
      setSetting("WHATSAPP_TEMPLATE_ID", WHATSAPP_TEMPLATE_ID.trim());
    }
    if (DEFAULT_TEMPLATE_NAME !== undefined) {
      setSetting("DEFAULT_TEMPLATE_NAME", DEFAULT_TEMPLATE_NAME.trim());
    }
    if (DEFAULT_TEMPLATE_LANG !== undefined) {
      setSetting("DEFAULT_TEMPLATE_LANG", DEFAULT_TEMPLATE_LANG.trim());
    }

    const updated = getAllSettings();
    return res.status(200).json({
      success: true,
      message: "Settings updated successfully.",
      data: updated
    });
  } catch (error) {
    console.error("Update settings error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Test connection to Meta Graph API
 */
async function handleTestConnection(req, res) {
  try {
    const { token, phoneNumberId } = req.body || {};
    let customCreds = null;
    if (token && phoneNumberId) {
      customCreds = { token, phoneNumberId };
    }

    const result = await testConnection(customCreds);
    return res.status(200).json({
      success: true,
      message: "Successfully connected to WhatsApp Meta Cloud API!",
      data: result
    });
  } catch (error) {
    console.error("Test connection error:", error);
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to connect to Meta Cloud API.",
      metaCode: error.metaCode,
      hint: error.hint
    });
  }
}

/**
 * Inspect template details by ID or Name
 */
async function getTemplateInfo(req, res) {
  try {
    const { templateId } = req.params;
    const details = await getTemplateDetails(templateId);
    if (!details) {
      return res.status(404).json({ success: false, message: `Template '${templateId}' not found.` });
    }
    return res.status(200).json({ success: true, data: details });
  } catch (error) {
    console.error("Get template info error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  getSettings,
  updateSettings,
  handleTestConnection,
  getTemplateInfo
};
