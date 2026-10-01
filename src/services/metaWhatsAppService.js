const { getSetting } = require("../config/database");
const config = require("../config/env");

const META_GRAPH_VERSION = config.META_GRAPH_VERSION || "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/**
 * Retrieves current active WhatsApp credentials from DB or environment
 */
function getActiveCredentials() {
  const token = getSetting("WHATSAPP_API_TOKEN") || config.WHATSAPP_API_TOKEN;
  const phoneNumberId = getSetting("WHATSAPP_PHONE_NUMBER_ID") || config.WHATSAPP_PHONE_NUMBER_ID;

  if (!token) {
    throw new Error("Meta WhatsApp API Token is missing. Configure it in Settings.");
  }
  if (!phoneNumberId) {
    throw new Error("Meta WhatsApp Phone Number ID is missing. Configure it in Settings.");
  }

  return { token: token.trim(), phoneNumberId: phoneNumberId.trim() };
}

/**
 * Standardizes Meta Cloud API error responses into actionable messages
 */
function parseMetaError(errorData, fallbackStatus = 500) {
  const metaErr = errorData?.error || {};
  const message = metaErr.message || "Unknown Meta Cloud API error";
  const code = metaErr.code;
  const subcode = metaErr.error_subcode;

  let hint = "";
  if (code === 190) {
    hint = "Access Token expired or invalid. Please refresh the token in Settings.";
  } else if (code === 131030) {
    hint = "Recipient not in allowed test list. For development numbers, add recipient in Meta App Dashboard.";
  } else if (code === 131047) {
    hint = "24-Hour Window Closed. A pre-approved Template message must be used to message this recipient.";
  } else if (code === 132000) {
    hint = "Template does not exist or has not been approved by Meta yet.";
  } else if (code === 132001) {
    hint = "Template parameters mismatch. The number of parameters provided does not match the template.";
  } else if (code === 100) {
    hint = "Invalid parameter supplied to Meta Graph API.";
  } else if (code === 80007) {
    hint = "Rate limit reached. Try increasing the delay between broadcasts.";
  }

  const err = new Error(hint ? `${message} (${hint})` : message);
  err.statusCode = fallbackStatus;
  err.metaCode = code;
  err.metaSubcode = subcode;
  err.hint = hint;
  return err;
}

/**
 * Normalizes phone numbers for WhatsApp Cloud API (e.g. 919876543210)
 */
function cleanPhone(phone, defaultCountryCode = "91") {
  if (!phone) return "";
  let digits = String(phone).replace(/\D/g, "");

  // If phone begins with 0, remove it
  if (digits.startsWith("0")) {
    digits = digits.substring(1);
  }

  // If 10-digit number (common Indian mobile length), prepend country code
  if (digits.length === 10 && defaultCountryCode) {
    digits = `${defaultCountryCode}${digits}`;
  }

  return digits;
}

/**
 * Test Meta Cloud API connection and get phone details
 */
async function testConnection(customCredentials = null) {
  const creds = customCredentials || getActiveCredentials();
  const fields = "id,display_phone_number,verified_name,quality_rating,code_verification_status,status";
  const url = `${META_BASE_URL}/${creds.phoneNumberId}?fields=${fields}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${creds.token}`,
      "Content-Type": "application/json"
    }
  });

  const data = await res.json();
  if (!res.ok) {
    throw parseMetaError(data, res.status);
  }

  return {
    success: true,
    phoneNumberId: creds.phoneNumberId,
    displayPhoneNumber: data.display_phone_number,
    verifiedName: data.verified_name,
    qualityRating: data.quality_rating,
    codeVerificationStatus: data.code_verification_status,
    status: data.status,
    raw: data
  };
}

const templateCache = new Map();

/**
 * Extracts and formats variables, text, header and buttons from Meta template components
 */
function parseTemplateVariables(components = [], parameterFormat = "POSITIONAL") {
  const result = {
    header: null,
    bodyText: "",
    variables: [],
    buttons: []
  };

  if (!Array.isArray(components)) return result;

  for (const comp of components) {
    if (comp.type === "BODY") {
      result.bodyText = comp.text || "";
      // Check positional {{1}}, {{2}}, etc.
      const posMatches = [...result.bodyText.matchAll(/\{\{(\d+)\}\}/g)];
      if (posMatches.length > 0) {
        const indices = [...new Set(posMatches.map(m => parseInt(m[1], 10)))].sort((a, b) => a - b);
        indices.forEach(idx => {
          let exampleVal = "";
          if (comp.example?.body_text?.[0]?.[idx - 1]) {
            exampleVal = String(comp.example.body_text[0][idx - 1]);
          }
          result.variables.push({
            type: "positional",
            index: idx,
            key: String(idx),
            label: `{{${idx}}}`,
            name: String(idx),
            example: exampleVal
          });
        });
      } else {
        // Check named {{name}}, {{restaurant}}, {{link}}, etc.
        const namedMatches = [...result.bodyText.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)];
        if (namedMatches.length > 0) {
          const names = [...new Set(namedMatches.map(m => m[1]))];
          names.forEach((name, i) => {
            let exampleVal = "";
            if (comp.example?.body_text?.[0]?.[i]) {
              exampleVal = String(comp.example.body_text[0][i]);
            }
            result.variables.push({
              type: "named",
              index: i + 1,
              key: name,
              label: `{{${name}}}`,
              name: name,
              example: exampleVal
            });
          });
        }
      }
    } else if (comp.type === "HEADER") {
      result.header = {
        format: comp.format,
        text: comp.text || ""
      };
    } else if (comp.type === "BUTTONS") {
      result.buttons = comp.buttons || [];
    }
  }

  return result;
}

/**
 * Resolves template ID or name to approved Meta template details and parses variables
 */
async function getTemplateDetails(templateIdOrName, customCredentials = null) {
  if (!templateIdOrName) return null;
  const key = String(templateIdOrName).trim();

  if (templateCache.has(key)) {
    return templateCache.get(key);
  }

  // Pre-seed known template 1059862786867912 / kt_invitation_
  if (key === "1059862786867912" || key === "kt_invitation_") {
    const known = {
      id: "1059862786867912",
      name: "kt_invitation_",
      language: "en",
      status: "APPROVED",
      category: "MARKETING",
      parameter_format: "POSITIONAL",
      bodyText: "Hi *{{1}}*,\n\nKonkanTrip is inviting *{{2}}* to join our restaurant partner network.\n\nCreate your partner profile and start receiving customer opportunities through KonkanTrip.\n\nComplete your registration here: *{{3}}*\n\nRegards,\nKonkanTrip Partner Team",
      variables: [
        { type: "positional", index: 1, key: "1", label: "{{1}}", name: "Name", example: "Shivam Khomane" },
        { type: "positional", index: 2, key: "2", label: "{{2}}", name: "Restaurant", example: "Beach Resort" },
        { type: "positional", index: 3, key: "3", label: "{{3}}", name: "Link", example: "https://konkantrip.com/partner" }
      ]
    };
    templateCache.set(key, known);
    templateCache.set("1059862786867912", known);
    templateCache.set("kt_invitation_", known);
    return known;
  }

  // Pre-seed known template 1757343188867100 / kt_restaurant_invitation
  if (key === "1757343188867100" || key === "kt_restaurant_invitation") {
    const known = {
      id: "1757343188867100",
      name: "kt_restaurant_invitation",
      language: "en",
      status: "APPROVED",
      category: "MARKETING",
      parameter_format: "NAMED",
      bodyText: "Hi {{name}},\n\nKonkanTrip is inviting {{restaurant}} to join our restaurant partner network.\n\nCreate your partner profile and start receiving customer opportunities through KonkanTrip.\n\nComplete your registration here: {{link}}\n\nRegards,\nKonkanTrip Partner Team",
      variables: [
        { type: "named", index: 1, key: "name", label: "{{name}}", name: "name", example: "Shivam" },
        { type: "named", index: 2, key: "restaurant", label: "{{restaurant}}", name: "restaurant", example: "Konkan Resort" },
        { type: "named", index: 3, key: "link", label: "{{link}}", name: "link", example: "https://konkantrip.com" }
      ]
    };
    templateCache.set(key, known);
    templateCache.set("1757343188867100", known);
    templateCache.set("kt_restaurant_invitation", known);
    return known;
  }

  // Pre-seed known template konkantrip_auth
  if (key === "konkantrip_auth") {
    const known = {
      id: "konkantrip_auth",
      name: "konkantrip_auth",
      language: "en_US",
      status: "APPROVED",
      category: "AUTHENTICATION",
      parameter_format: "POSITIONAL",
      bodyText: "Your KonkanTrip verification code is {{1}}. Do not share this code with anyone.",
      variables: [
        { type: "positional", index: 1, key: "1", label: "{{1}}", name: "OTP Code", example: "492018" }
      ]
    };
    templateCache.set(key, known);
    return known;
  }

  // If numeric ID, query Meta Graph API
  if (/^\d+$/.test(key)) {
    try {
      const creds = customCredentials || getActiveCredentials();
      const url = `${META_BASE_URL}/${key}?fields=id,name,components,language,status,category,parameter_format`;
      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${creds.token}`,
          "Content-Type": "application/json"
        }
      });
      const data = await res.json();
      if (res.ok && data.name) {
        const parsed = parseTemplateVariables(data.components, data.parameter_format);
        const fullDetails = {
          ...data,
          bodyText: parsed.bodyText,
          variables: parsed.variables,
          header: parsed.header,
          buttons: parsed.buttons
        };
        templateCache.set(key, fullDetails);
        templateCache.set(data.name, fullDetails);
        return fullDetails;
      }
    } catch (e) {
      console.warn(`[Meta] Could not fetch template details for ${key}:`, e.message);
    }
  }

  return templateCache.get(key) || {
    id: key,
    name: key,
    language: (key === "kt_invitation_" || key === "kt_restaurant_invitation") ? "en" : "en_US",
    status: "UNKNOWN",
    variables: []
  };
}

/**
 * Send a pre-approved template message via Meta Cloud API
 */
async function sendTemplateMessage({ to, templateName, languageCode, components = [], customCredentials = null }) {
  const creds = customCredentials || getActiveCredentials();
  const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
  const cleanTo = cleanPhone(to, defaultCountry);

  if (!cleanTo || cleanTo.length < 10) {
    throw new Error(`Invalid recipient phone number: '${to}'`);
  }

  let rawName = String(templateName || "").trim();
  let resolvedName = rawName;
  let resolvedLang = languageCode;
  let resolvedComponents = Array.isArray(components) ? components : [];

  // 1. Resolve numeric Template ID or specific template names
  if (rawName === "1059862786867912" || rawName === "kt_invitation_") {
    resolvedName = "kt_invitation_";
    resolvedLang = resolvedLang || "en";
  } else if (rawName === "1757343188867100" || rawName === "kt_restaurant_invitation") {
    resolvedName = "kt_restaurant_invitation";
    resolvedLang = resolvedLang || "en";
  } else if (/^\d+$/.test(rawName)) {
    // Other numeric ID: lookup in cache or Meta API
    const details = await getTemplateDetails(rawName, creds);
    if (details && details.name) {
      resolvedName = details.name;
      if (!resolvedLang && details.language) {
        resolvedLang = details.language;
      }
    }
  }

  // 2. Default language resolution
  if (!resolvedLang) {
    resolvedLang = (resolvedName === "kt_invitation_" || resolvedName === "kt_restaurant_invitation") ? "en" : "en_US";
  }

  const url = `${META_BASE_URL}/${creds.phoneNumberId}/messages`;
  const templatePayload = {
    name: resolvedName,
    language: {
      code: resolvedLang
    }
  };

  // Only include components if non-empty
  if (resolvedComponents.length > 0) {
    templatePayload.components = resolvedComponents;
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: "template",
    template: templatePayload
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${creds.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw parseMetaError(data, res.status);
  }

  return {
    success: true,
    messageId: data.messages?.[0]?.id,
    recipient: cleanTo,
    templateName: resolvedName,
    data
  };
}

/**
 * Send a direct text message via Meta Cloud API (requires active 24-hr customer service window)
 */
async function sendTextMessage({ to, body, previewUrl = false, customCredentials = null }) {
  const creds = customCredentials || getActiveCredentials();
  const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
  const cleanTo = cleanPhone(to, defaultCountry);

  if (!cleanTo || cleanTo.length < 10) {
    throw new Error(`Invalid recipient phone number: '${to}'`);
  }

  const url = `${META_BASE_URL}/${creds.phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: "text",
    text: {
      preview_url: Boolean(previewUrl),
      body: body
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${creds.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw parseMetaError(data, res.status);
  }

  return {
    success: true,
    messageId: data.messages?.[0]?.id,
    recipient: cleanTo,
    data
  };
}

module.exports = {
  getActiveCredentials,
  testConnection,
  cleanPhone,
  getTemplateDetails,
  sendTemplateMessage,
  sendTextMessage
};
