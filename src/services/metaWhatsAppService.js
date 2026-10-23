const fs = require("fs");
const path = require("path");
const { getSetting, db } = require("../config/database");
const config = require("../config/env");

const META_GRAPH_VERSION = config.META_GRAPH_VERSION || "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/**
 * Retrieves current active WhatsApp credentials from DB or environment
 */
function getActiveCredentials() {
  const token = getSetting("WHATSAPP_API_TOKEN") || config.WHATSAPP_API_TOKEN;
  let phoneNumberId = getSetting("WHATSAPP_PHONE_NUMBER_ID") || config.WHATSAPP_PHONE_NUMBER_ID;

  if (!phoneNumberId) {
    try {
      const defaultPhone = db.prepare("SELECT phone_number_id FROM waba_phone_numbers WHERE is_default = 1").get();
      if (defaultPhone?.phone_number_id) {
        phoneNumberId = defaultPhone.phone_number_id;
      } else {
        const anyPhone = db.prepare("SELECT phone_number_id FROM waba_phone_numbers ORDER BY id ASC LIMIT 1").get();
        if (anyPhone?.phone_number_id) {
          phoneNumberId = anyPhone.phone_number_id;
        }
      }
    } catch (e) {
      // Table might not exist or be empty
    }
  }

  if (!token) {
    throw new Error("Meta WhatsApp API Token is missing. Configure it in Settings.");
  }
  if (!phoneNumberId) {
    throw new Error("Meta WhatsApp Phone Number ID is missing. Please add a WhatsApp Phone Number in Settings or Topbar.");
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
  err.isTransient = fallbackStatus === 429 || fallbackStatus === 503 || code === 80007 || code === 1 || code === 2;
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

  // Look in local SQLite templates table
  try {
    if (db) {
      const row = db.prepare(`SELECT * FROM templates WHERE name = ? OR meta_id = ? OR id = ? LIMIT 1`).get(key, key, key);
      if (row) {
        const details = {
          id: row.meta_id || row.id,
          name: row.name,
          language: row.language || "en",
          status: row.status || "APPROVED",
          category: row.category || "MARKETING",
          parameter_format: row.parameter_format || "POSITIONAL",
          bodyText: row.body_text || "",
          variables: row.variables ? JSON.parse(row.variables) : [],
          components: row.components ? JSON.parse(row.components) : [],
          buttons: row.buttons ? JSON.parse(row.buttons) : []
        };
        templateCache.set(key, details);
        templateCache.set(row.name, details);
        if (row.meta_id) templateCache.set(String(row.meta_id), details);
        return details;
      }
    }
  } catch (dbErr) {
    // Non-blocking fallback
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
 * Resolves active WhatsApp Business Account ID (WABA ID) from settings or phone records
 */
function resolveWabaId(customWabaId = null) {
  if (customWabaId && String(customWabaId).trim()) {
    return String(customWabaId).trim();
  }

  // 1. Check settings table
  const settingWaba = getSetting("WHATSAPP_BUSINESS_ACCOUNT_ID") || getSetting("WHATSAPP_WABA_ID");
  if (settingWaba && String(settingWaba).trim()) {
    return String(settingWaba).trim();
  }

  // 2. Check default or registered phone in waba_phone_numbers
  try {
    if (db) {
      const defaultPhone = db.prepare("SELECT waba_id FROM waba_phone_numbers WHERE is_default = 1 AND waba_id IS NOT NULL AND waba_id != ''").get();
      if (defaultPhone?.waba_id) {
        return String(defaultPhone.waba_id).trim();
      }

      const anyPhone = db.prepare("SELECT waba_id FROM waba_phone_numbers WHERE waba_id IS NOT NULL AND waba_id != '' ORDER BY id ASC LIMIT 1").get();
      if (anyPhone?.waba_id) {
        return String(anyPhone.waba_id).trim();
      }
    }
  } catch (e) {
    // Ignore DB error
  }

  // 3. Fallback to env
  if (config.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    return String(config.WHATSAPP_BUSINESS_ACCOUNT_ID).trim();
  }

  return null;
}

/**
 * Clears the in-memory template cache
 */
function clearTemplateCache() {
  templateCache.clear();
}

/**
 * Fetch and parse all message templates from Meta Graph API by WABA ID, optionally filtered by category
 * Supported categories: 'MARKETING', 'UTILITY', 'AUTHENTICATION' (or null / 'ALL' for all categories)
 */
async function fetchWabaTemplates({ category = null, status = null, limit = 100, customCredentials = null, wabaId = null } = {}) {
  const creds = customCredentials || getActiveCredentials();
  const resolvedWabaId = resolveWabaId(wabaId);

  if (!resolvedWabaId) {
    const err = new Error("WhatsApp Business Account ID (WABA ID) is not configured. Please specify your WABA ID in Settings or WhatsApp Sender Line to sync templates directly from Meta.");
    err.statusCode = 400;
    err.code = "MISSING_WABA_ID";
    throw err;
  }

  const fields = "id,name,status,category,language,components,parameter_format,quality_score";
  const url = new URL(`${META_BASE_URL}/${resolvedWabaId}/message_templates`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", String(Math.min(limit || 100, 250)));

  if (category && String(category).trim().toUpperCase() !== "ALL") {
    url.searchParams.set("category", String(category).trim().toUpperCase());
  }
  if (status && String(status).trim().toUpperCase() !== "ALL") {
    url.searchParams.set("status", String(status).trim().toUpperCase());
  }

  const res = await fetch(url.toString(), {
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

  const rawList = Array.isArray(data.data) ? data.data : [];
  const parsedTemplates = rawList.map(tpl => {
    const parsed = parseTemplateVariables(tpl.components, tpl.parameter_format);
    return {
      id: tpl.id,
      name: tpl.name,
      meta_id: tpl.id,
      language: tpl.language || "en",
      category: tpl.category || "MARKETING",
      status: tpl.status || "APPROVED",
      parameter_format: tpl.parameter_format || "POSITIONAL",
      bodyText: parsed.bodyText,
      variables: parsed.variables,
      components: tpl.components || [],
      buttons: parsed.buttons || [],
      quality_score: tpl.quality_score || null
    };
  });

  return {
    success: true,
    wabaId: resolvedWabaId,
    category: category ? category.toUpperCase() : "ALL",
    count: parsedTemplates.length,
    templates: parsedTemplates,
    paging: data.paging || null
  };
}

/**
 * Send a pre-approved template message via Meta Cloud API
 */
async function sendTemplateMessage({ to, templateName, languageCode, components = [], customCredentials = null, flowActionData = null, campaignId = null, userId = "system" }) {
  const creds = customCredentials || getActiveCredentials();
  const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
  const cleanTo = cleanPhone(to, defaultCountry);

  if (!cleanTo || cleanTo.length < 10) {
    throw new Error(`Invalid recipient phone number: '${to}'`);
  }

  let rawName = String(templateName || "").trim();
  let resolvedName = rawName;
  let resolvedLang = languageCode;
  let resolvedComponents = Array.isArray(components) ? [...components] : [];

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

  // 3. Inspect if the template has a FLOW button that requires flow_token
  let flowTokenGenerated = null;
  try {
    const details = await getTemplateDetails(resolvedName, creds);
    if (details) {
      let buttons = Array.isArray(details.buttons) ? details.buttons : [];
      if (buttons.length === 0 && Array.isArray(details.components)) {
        const btnComp = details.components.find(c => String(c.type || "").toUpperCase() === "BUTTONS");
        if (btnComp && Array.isArray(btnComp.buttons)) {
          buttons = btnComp.buttons;
        }
      }

      buttons.forEach((btn, idx) => {
        if (String(btn.type || "").toUpperCase() === "FLOW") {
          const hasExisting = resolvedComponents.some(c => c.type === "button" && c.sub_type === "flow" && String(c.index) === String(idx));
          if (!hasExisting) {
            try {
              const flowService = require("./flowService");
              flowTokenGenerated = flowService.createFlowToken({
                flowId: btn.flow_id || details.id,
                metaFlowId: btn.flow_id || null,
                recipientPhone: cleanTo,
                campaignId: campaignId || null,
                userId: userId || "system"
              });

              const actionObj = { flow_token: flowTokenGenerated };
              if (flowActionData && typeof flowActionData === "object" && Object.keys(flowActionData).length > 0) {
                actionObj.flow_action_data = flowActionData;
              }

              resolvedComponents.push({
                type: "button",
                sub_type: "flow",
                index: String(idx),
                parameters: [
                  {
                    type: "action",
                    action: actionObj
                  }
                ]
              });
            } catch (tokenErr) {
              console.warn("[sendTemplateMessage] Auto flow token generation note:", tokenErr.message);
            }
          }
        }
      });
    }
  } catch (lookupErr) {
    // Non-blocking template button inspection fallback
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

  let res, data;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${creds.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    data = await res.json();
  } catch (netErr) {
    if (netErr.name === "TimeoutError" || netErr.name === "AbortError" || netErr.code === "ECONNRESET" || netErr.code === "ETIMEDOUT" || netErr.message?.includes("fetch failed")) {
      const ambErr = new Error(`Ambiguous outcome: Meta request timed out or network dropped (${netErr.message})`);
      ambErr.isAmbiguous = true;
      ambErr.code = "NETWORK_AMBIGUOUS";
      throw ambErr;
    }
    throw netErr;
  }

  if (!res.ok) {
    throw parseMetaError(data, res.status);
  }

  const messageId = data.messages?.[0]?.id;
  if (messageId) {
    // Link meta_message_id to flow_token record if a flow was sent
    const flowBtnComp = resolvedComponents.find(c => c.type === "button" && c.sub_type === "flow");
    const activeToken = flowTokenGenerated || flowBtnComp?.parameters?.[0]?.action?.flow_token;
    if (activeToken) {
      try {
        db.prepare("UPDATE flow_tokens SET meta_message_id = ? WHERE token = ?").run(messageId, activeToken);
      } catch (dbErr) {
        // Non-blocking DB update
      }
    }
  }

  return {
    success: true,
    messageId,
    recipient: cleanTo,
    templateName: resolvedName,
    flowToken: flowTokenGenerated,
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

  let res, data;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${creds.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    data = await res.json();
  } catch (netErr) {
    if (netErr.name === "TimeoutError" || netErr.name === "AbortError" || netErr.code === "ECONNRESET" || netErr.code === "ETIMEDOUT" || netErr.message?.includes("fetch failed")) {
      const ambErr = new Error(`Ambiguous outcome: Meta request timed out or network dropped (${netErr.message})`);
      ambErr.isAmbiguous = true;
      ambErr.code = "NETWORK_AMBIGUOUS";
      throw ambErr;
    }
    throw netErr;
  }

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

/**
 * Uploads a media file directly to Meta Cloud API to obtain a permanent Meta Media ID
 */
async function uploadMedia({ fileBuffer, fileName, mimeType, customCredentials = null }) {
  const creds = customCredentials || getActiveCredentials();
  const url = `${META_BASE_URL}/${creds.phoneNumberId}/media`;

  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("type", mimeType || "image/jpeg");
  formData.append("file", new Blob([fileBuffer], { type: mimeType || "image/jpeg" }), fileName || "media.jpg");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${creds.token}`
    },
    body: formData
  });

  const data = await res.json();
  if (!res.ok) {
    throw parseMetaError(data, res.status);
  }

  return {
    success: true,
    mediaId: data.id,
    data
  };
}

/**
 * Send an image, video, or document directly to a customer via Meta Cloud API
 */
async function sendMediaMessage({ to, type = "image", mediaId, mediaUrl, caption = "", filename, customCredentials = null }) {
  const creds = customCredentials || getActiveCredentials();
  const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
  const cleanTo = cleanPhone(to, defaultCountry);

  if (!cleanTo || cleanTo.length < 10) {
    throw new Error(`Invalid recipient phone number: '${to}'`);
  }

  const mediaType = (type || "image").toLowerCase(); // "image" | "video" | "document" | "audio"
  const mediaObject = {};
  if (mediaId) {
    mediaObject.id = mediaId;
  } else if (mediaUrl) {
    mediaObject.link = mediaUrl;
  } else {
    throw new Error("Either mediaId or mediaUrl is required to send media.");
  }

  if (caption && String(caption).trim() && (mediaType === "image" || mediaType === "video" || mediaType === "document")) {
    mediaObject.caption = String(caption).trim();
  }
  if (filename && mediaType === "document") {
    mediaObject.filename = filename;
  }

  const url = `${META_BASE_URL}/${creds.phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: mediaType,
    [mediaType]: mediaObject
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
    type: mediaType,
    data
  };
}

/**
 * Retrieves media metadata and temporary download URL from Meta Graph API
 */
async function getMediaDetails(mediaId, customCredentials = null) {
  if (!mediaId) {
    throw new Error("Media ID is required to fetch media details from Meta.");
  }
  const creds = customCredentials || getActiveCredentials();
  const url = `${META_BASE_URL}/${mediaId}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${creds.token}`
    }
  });

  const data = await res.json();
  if (!res.ok) {
    throw parseMetaError(data, res.status);
  }

  return {
    id: data.id,
    url: data.url,
    mimeType: data.mime_type,
    sha256: data.sha256,
    fileSize: data.file_size
  };
}

/**
 * Downloads binary media buffer from Meta lookaside download URL
 */
async function downloadMediaBuffer(downloadUrl, customCredentials = null) {
  if (!downloadUrl) {
    throw new Error("Download URL is required to download media.");
  }
  const creds = customCredentials || getActiveCredentials();

  const res = await fetch(downloadUrl, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${creds.token}`,
      "User-Agent": "curl/7.64.1"
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to download media content from Meta (HTTP ${res.status}): ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = res.headers.get("content-type") || "application/octet-stream";

  return {
    buffer,
    contentType,
    contentLength: buffer.length
  };
}

/**
 * Downloads and stores inbound media locally in public/uploads/inbound/
 * Returns { success, relativeUrl, localPath, mimeType, fileSize }
 */
async function downloadAndSaveInboundMedia(mediaId, customCredentials = null) {
  if (!mediaId) {
    throw new Error("mediaId is required for downloadAndSaveInboundMedia");
  }

  const inboundDir = path.resolve(__dirname, "../../public/uploads/inbound");
  if (!fs.existsSync(inboundDir)) {
    fs.mkdirSync(inboundDir, { recursive: true });
  }

  // 1. Check if already downloaded on disk (matching mediaId.*)
  try {
    const existingFiles = fs.readdirSync(inboundDir).filter(f => f.startsWith(`${mediaId}.`));
    if (existingFiles.length > 0) {
      const filename = existingFiles[0];
      const localPath = path.join(inboundDir, filename);
      const stats = fs.statSync(localPath);
      if (stats.size > 0) {
        return {
          success: true,
          cached: true,
          relativeUrl: `/uploads/inbound/${filename}`,
          localPath,
          fileSize: stats.size
        };
      }
    }
  } catch (e) {
    // Continue if readdir fails
  }

  // 2. Fetch metadata from Meta
  const mediaInfo = await getMediaDetails(mediaId, customCredentials);
  if (!mediaInfo.url) {
    throw new Error(`Meta did not return a valid download URL for media ${mediaId}`);
  }

  // 3. Download binary buffer
  const downloaded = await downloadMediaBuffer(mediaInfo.url, customCredentials);

  // 4. Resolve extension from mimeType
  const mimeType = (mediaInfo.mimeType || downloaded.contentType || "image/jpeg").toLowerCase();
  let ext = ".jpg";
  if (mimeType.includes("png")) ext = ".png";
  else if (mimeType.includes("webp")) ext = ".webp";
  else if (mimeType.includes("gif")) ext = ".gif";
  else if (mimeType.includes("mp4")) ext = ".mp4";
  else if (mimeType.includes("3gpp") || mimeType.includes("3gp")) ext = ".3gp";
  else if (mimeType.includes("quicktime") || mimeType.includes("mov")) ext = ".mov";
  else if (mimeType.includes("webm")) ext = ".webm";
  else if (mimeType.includes("ogg") || mimeType.includes("opus")) ext = ".ogg";
  else if (mimeType.includes("mpeg") || mimeType.includes("mp3")) ext = ".mp3";
  else if (mimeType.includes("aac")) ext = ".aac";
  else if (mimeType.includes("pdf")) ext = ".pdf";
  else if (mimeType.includes("plain")) ext = ".txt";

  const filename = `${mediaId}${ext}`;
  const localPath = path.join(inboundDir, filename);

  fs.writeFileSync(localPath, downloaded.buffer);

  return {
    success: true,
    cached: false,
    relativeUrl: `/uploads/inbound/${filename}`,
    localPath,
    mimeType,
    fileSize: downloaded.contentLength
  };
}

/**
 * Sends an Interactive WhatsApp Flow Message
 */
async function sendFlowMessage({
  to,
  flowId,
  metaFlowId,
  flowToken,
  headerText = "",
  bodyText,
  footerText = "",
  ctaText = "Open Form",
  screen = null,
  screenId = null,
  screenData = {},
  customCredentials = null
}) {
  const creds = customCredentials || getActiveCredentials();
  const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
  const effectiveFlowId = flowId || metaFlowId;
  const effectiveScreen = screen || screenId;

  if (!to || String(to).trim().length === 0) {
    return { success: false, error: "Valid recipient phone number is required" };
  }
  const cleanTo = cleanPhone(to, defaultCountry);
  if (!cleanTo || cleanTo.length < 10) {
    return { success: false, error: "Valid recipient phone number is required" };
  }
  if (!effectiveFlowId || !String(effectiveFlowId).trim()) {
    return { success: false, error: "Meta flowId is required to send a Flow message." };
  }
  if (!flowToken || !String(flowToken).trim()) {
    return { success: false, error: "Server-generated flowToken is required to send a Flow message." };
  }
  if (!bodyText || !String(bodyText).trim()) {
    return { success: false, error: "Message bodyText is required for Flow messages." };
  }

  const url = `${META_BASE_URL}/${creds.phoneNumberId}/messages`;

  const flowActionPayload = {
    screen: effectiveScreen || undefined,
    data: screenData && Object.keys(screenData).length > 0 ? screenData : undefined
  };

  const interactive = {
    type: "flow",
    body: {
      text: String(bodyText).trim()
    },
    action: {
      name: "flow",
      parameters: {
        flow_message_version: "3",
        flow_token: flowToken,
        flow_id: String(effectiveFlowId).trim(),
        flow_cta: String(ctaText || "Open Form").trim().substring(0, 20),
        flow_action: "navigate",
        flow_action_payload: flowActionPayload
      }
    }
  };

  if (headerText && String(headerText).trim()) {
    interactive.header = {
      type: "text",
      text: String(headerText).trim().substring(0, 60)
    };
  }

  if (footerText && String(footerText).trim()) {
    interactive.footer = {
      type: "text",
      text: String(footerText).trim().substring(0, 60)
    };
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: "interactive",
    interactive
  };

  let res, data;
  try {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${creds.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
      });
      data = await res.json();
    } catch (netErr) {
      if (netErr.name === "TimeoutError" || netErr.name === "AbortError" || netErr.code === "ECONNRESET" || netErr.code === "ETIMEDOUT" || netErr.message?.includes("fetch failed")) {
        const ambErr = new Error(`Ambiguous outcome: Meta request timed out or network dropped (${netErr.message})`);
        ambErr.isAmbiguous = true;
        ambErr.code = "NETWORK_AMBIGUOUS";
        throw ambErr;
      }
      throw netErr;
    }

    if (!res.ok) {
      throw parseMetaError(data, res.status);
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
      recipient: cleanTo,
      flowToken,
      data
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      isAmbiguous: Boolean(err.isAmbiguous),
      code: err.code
    };
  }
}

module.exports = {
  getActiveCredentials,
  testConnection,
  cleanPhone,
  getTemplateDetails,
  resolveWabaId,
  fetchWabaTemplates,
  clearTemplateCache,
  sendTemplateMessage,
  sendTextMessage,
  sendMediaMessage,
  sendFlowMessage,
  uploadMedia,
  getMediaDetails,
  downloadMediaBuffer,
  downloadAndSaveInboundMedia
};


