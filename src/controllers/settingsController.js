const { getAllSettings, setSetting, getSetting } = require("../config/database");
const { testConnection, getTemplateDetails } = require("../services/metaWhatsAppService");

/**
 * Masks sensitive secret strings for secure API presentation
 */
function maskSecret(val) {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  if (trimmed.length <= 8) return "••••••••";
  return trimmed.substring(0, 4) + "••••••••" + trimmed.substring(trimmed.length - 4);
}

const SENSITIVE_KEYS = new Set([
  "WHATSAPP_API_TOKEN",
  "META_APP_SECRET",
  "WEBHOOK_VERIFY_TOKEN",
  "JWT_SECRET"
]);

/**
 * Get current settings with sensitive credentials redacted
 */
async function getSettings(req, res) {
  try {
    const raw = getAllSettings();
    const safeSettings = { ...raw };

    // Redact all sensitive secrets
    for (const key of SENSITIVE_KEYS) {
      if (safeSettings[key]) {
        safeSettings[key] = maskSecret(safeSettings[key]);
      }
    }

    return res.status(200).json({
      success: true,
      data: safeSettings,
      settings: safeSettings
    });
  } catch (error) {
    console.error("Get settings error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Update settings (Restricted to Administrator for credentials)
 */
async function updateSettings(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const {
      WHATSAPP_API_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_BUSINESS_ACCOUNT_ID,
      WHATSAPP_WABA_ID,
      META_APP_SECRET,
      DEFAULT_COUNTRY_CODE,
      BROADCAST_DELAY_MS,
      WHATSAPP_TEMPLATE_ID,
      DEFAULT_TEMPLATE_NAME,
      DEFAULT_TEMPLATE_LANG,
      APP_TIMEZONE,
      META_MARKETING_RATE_INR,
      META_UTILITY_RATE_INR
    } = req.body || {};

    const credentialKeysProvided = [
      WHATSAPP_API_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_BUSINESS_ACCOUNT_ID,
      WHATSAPP_WABA_ID,
      META_APP_SECRET
    ].some(v => v !== undefined);

    // Only administrators are permitted to alter platform-wide credentials
    if (credentialKeysProvided && user.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Forbidden. Platform credentials can only be modified by Master Administrators."
      });
    }

    if (WHATSAPP_API_TOKEN !== undefined && !WHATSAPP_API_TOKEN.includes("••••")) {
      setSetting("WHATSAPP_API_TOKEN", WHATSAPP_API_TOKEN.trim());
    }
    if (META_APP_SECRET !== undefined && !META_APP_SECRET.includes("••••")) {
      setSetting("META_APP_SECRET", META_APP_SECRET.trim());
    }
    if (WHATSAPP_PHONE_NUMBER_ID !== undefined) {
      setSetting("WHATSAPP_PHONE_NUMBER_ID", WHATSAPP_PHONE_NUMBER_ID.trim());
    }
    if (WHATSAPP_BUSINESS_ACCOUNT_ID !== undefined) {
      setSetting("WHATSAPP_BUSINESS_ACCOUNT_ID", WHATSAPP_BUSINESS_ACCOUNT_ID.trim());
    }
    if (WHATSAPP_WABA_ID !== undefined) {
      setSetting("WHATSAPP_WABA_ID", WHATSAPP_WABA_ID.trim());
    }
    if (DEFAULT_COUNTRY_CODE !== undefined) {
      setSetting("DEFAULT_COUNTRY_CODE", DEFAULT_COUNTRY_CODE.trim());
    }
    if (BROADCAST_DELAY_MS !== undefined) {
      const parsed = Math.min(Math.max(parseInt(BROADCAST_DELAY_MS, 10) || 250, 50), 10000);
      setSetting("BROADCAST_DELAY_MS", String(parsed));
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
    if (APP_TIMEZONE !== undefined && APP_TIMEZONE.trim()) {
      setSetting("APP_TIMEZONE", APP_TIMEZONE.trim());
    }
    if (META_MARKETING_RATE_INR !== undefined) {
      setSetting("META_MARKETING_RATE_INR", String(parseFloat(META_MARKETING_RATE_INR) || 0.80));
    }
    if (META_UTILITY_RATE_INR !== undefined) {
      setSetting("META_UTILITY_RATE_INR", String(parseFloat(META_UTILITY_RATE_INR) || 0.12));
    }

    const updated = getAllSettings();
    const safeUpdated = { ...updated };
    for (const key of SENSITIVE_KEYS) {
      if (safeUpdated[key]) {
        safeUpdated[key] = maskSecret(safeUpdated[key]);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Settings updated successfully.",
      data: safeUpdated
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
    if (token && phoneNumberId && !token.includes("••••")) {
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
