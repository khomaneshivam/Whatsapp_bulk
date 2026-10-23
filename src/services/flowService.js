const crypto = require("crypto");
const { db, getSetting } = require("../config/database");
const config = require("../config/env");
const { getActiveCredentials, resolveWabaId, cleanPhone } = require("./metaWhatsAppService");

const META_GRAPH_VERSION = config.META_GRAPH_VERSION || "v21.0";
const META_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

class FlowService {
  /**
   * Validates Flow JSON structure according to Meta Flow specifications
   * @param {Object|string} rawJson
   * @returns {{ valid: boolean, errors: string[], parsedJson: Object|null }}
   */
  validateFlowJson(rawJson) {
    const errors = [];
    let parsed = null;

    if (typeof rawJson === "string") {
      try {
        parsed = JSON.parse(rawJson);
      } catch (e) {
        return { valid: false, errors: ["Invalid JSON syntax: " + e.message], error: "Invalid JSON syntax: " + e.message, parsedJson: null, parsed: null };
      }
    } else if (rawJson && typeof rawJson === "object") {
      parsed = rawJson;
    } else {
      return { valid: false, errors: ["Flow definition must be a valid JSON object or string."], error: "Flow definition must be a valid JSON object or string.", parsedJson: null, parsed: null };
    }

    if (!parsed.version) {
      errors.push("Missing required top-level property: 'version' (e.g., '3.1' or '6.0').");
    }

    if (!Array.isArray(parsed.screens) || parsed.screens.length === 0) {
      errors.push("Flow JSON must contain a 'screens' array with at least one screen definition.");
    } else {
      const screenIds = new Set();
      parsed.screens.forEach((scr, idx) => {
        if (!scr.id) {
          errors.push(`Screen at index ${idx} is missing an 'id'.`);
        } else if (screenIds.has(scr.id)) {
          errors.push(`Duplicate screen id '${scr.id}' detected.`);
        } else {
          screenIds.add(scr.id);
        }

        if (!scr.title && scr.title !== "") {
          errors.push(`Screen '${scr.id || idx}' is missing a 'title'.`);
        }

        if (!scr.layout || typeof scr.layout !== "object") {
          errors.push(`Screen '${scr.id || idx}' is missing a valid 'layout' object.`);
        } else if (!Array.isArray(scr.layout.children) || scr.layout.children.length === 0) {
          errors.push(`Screen '${scr.id || idx}' layout must contain at least one child component in 'children'.`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      error: errors.length > 0 ? errors.join("; ") : null,
      parsedJson: parsed,
      parsed
    };
  }

  /**
   * Creates a Flow on Meta WhatsApp Business Platform
   */
  async createMetaFlow({ name, categories = ["OTHER"], endpoint_uri = null, customCredentials = null, wabaId = null }) {
    const creds = customCredentials || getActiveCredentials();
    const resolvedWaba = resolveWabaId(wabaId);

    if (!resolvedWaba) {
      const err = new Error("WhatsApp Business Account ID (WABA ID) is required to manage Meta Flows. Configure it in Line & API Settings.");
      err.statusCode = 400;
      err.code = "MISSING_WABA_ID";
      throw err;
    }

    const cats = Array.isArray(categories) && categories.length > 0 ? categories : ["OTHER"];
    const payload = {
      name: String(name).trim(),
      categories: cats
    };

    if (endpoint_uri && String(endpoint_uri).trim()) {
      payload.endpoint_uri = String(endpoint_uri).trim();
    }

    const res = await fetch(`${META_BASE_URL}/${resolvedWaba}/flows`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${creds.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      const errorMsg = data?.error?.message || "Failed to create Flow in Meta Cloud API.";
      const err = new Error(errorMsg);
      err.statusCode = res.status;
      err.metaError = data?.error;
      throw err;
    }

    return {
      metaFlowId: data.id,
      name: payload.name,
      categories: cats
    };
  }

  /**
   * Uploads or updates Flow JSON assets in Meta
   */
  async uploadFlowJsonAsset({ metaFlowId, flowJson, customCredentials = null }) {
    if (!metaFlowId) {
      throw new Error("Meta Flow ID is required to upload flow assets.");
    }

    const creds = customCredentials || getActiveCredentials();
    const jsonString = typeof flowJson === "string" ? flowJson : JSON.stringify(flowJson, null, 2);

    // Meta Flow Asset Upload requires multipart/form-data with file "flow.json"
    const boundary = "----WebKitFormBoundary" + crypto.randomBytes(16).toString("hex");
    const crlf = "\r\n";

    let body = "";
    body += `--${boundary}${crlf}`;
    body += `Content-Disposition: form-data; name="name"${crlf}${crlf}`;
    body += `flow.json${crlf}`;

    body += `--${boundary}${crlf}`;
    body += `Content-Disposition: form-data; name="asset_type"${crlf}${crlf}`;
    body += `FLOW_JSON${crlf}`;

    body += `--${boundary}${crlf}`;
    body += `Content-Disposition: form-data; name="file"; filename="flow.json"${crlf}`;
    body += `Content-Type: application/json${crlf}${crlf}`;
    body += jsonString + crlf;
    body += `--${boundary}--${crlf}`;

    const res = await fetch(`${META_BASE_URL}/${metaFlowId}/assets`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${creds.token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: Buffer.from(body, "utf-8")
    });

    const data = await res.json();
    if (!res.ok) {
      const errorMsg = data?.error?.message || "Failed to upload Flow JSON asset to Meta.";
      const err = new Error(errorMsg);
      err.statusCode = res.status;
      err.metaError = data?.error;
      err.validationErrors = data?.error?.error_data?.details || [];
      throw err;
    }

    return {
      success: data.success !== false,
      validationErrors: data.validation_errors || []
    };
  }

  /**
   * Retrieves single Flow details and status from Meta
   */
  async getMetaFlowDetails(metaFlowId, customCredentials = null) {
    if (!metaFlowId) throw new Error("Meta Flow ID is required.");
    const creds = customCredentials || getActiveCredentials();

    const fields = "id,name,status,categories,validation_errors,json_version,data_api_version,endpoint_uri,preview";
    const res = await fetch(`${META_BASE_URL}/${metaFlowId}?fields=${fields}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${creds.token}`,
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error?.message || "Failed to retrieve Flow details from Meta.");
      err.statusCode = res.status;
      err.metaError = data?.error;
      throw err;
    }

    return data;
  }

  /**
   * Publishes a validated Flow on Meta
   */
  async publishMetaFlow(metaFlowId, customCredentials = null) {
    if (!metaFlowId) throw new Error("Meta Flow ID is required to publish.");
    const creds = customCredentials || getActiveCredentials();

    const res = await fetch(`${META_BASE_URL}/${metaFlowId}/publish`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${creds.token}`,
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error?.message || "Failed to publish Flow in Meta.");
      err.statusCode = res.status;
      err.metaError = data?.error;
      throw err;
    }

    return { success: data.success !== false };
  }

  /**
   * Deprecates an active Flow on Meta
   */
  async deprecateMetaFlow(metaFlowId, customCredentials = null) {
    if (!metaFlowId) throw new Error("Meta Flow ID is required to deprecate.");
    const creds = customCredentials || getActiveCredentials();

    const res = await fetch(`${META_BASE_URL}/${metaFlowId}/deprecate`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${creds.token}`,
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error?.message || "Failed to deprecate Flow in Meta.");
      err.statusCode = res.status;
      err.metaError = data?.error;
      throw err;
    }

    return { success: data.success !== false };
  }

  /**
   * Deletes a draft Flow on Meta (only permitted for DRAFT status)
   */
  async deleteMetaFlow(metaFlowId, customCredentials = null) {
    if (!metaFlowId) throw new Error("Meta Flow ID is required to delete.");
    const creds = customCredentials || getActiveCredentials();

    const res = await fetch(`${META_BASE_URL}/${metaFlowId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${creds.token}`,
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error?.message || "Failed to delete Flow on Meta.");
      err.statusCode = res.status;
      err.metaError = data?.error;
      throw err;
    }

    return { success: data.success !== false };
  }

  /**
   * Lists all Flows registered under the configured WABA from Meta
   */
  async listMetaFlows({ limit = 100, customCredentials = null, wabaId = null } = {}) {
    const creds = customCredentials || getActiveCredentials();
    const resolvedWaba = resolveWabaId(wabaId);

    if (!resolvedWaba) {
      const err = new Error("WhatsApp Business Account ID (WABA ID) is not configured.");
      err.statusCode = 400;
      err.code = "MISSING_WABA_ID";
      throw err;
    }

    const fields = "id,name,status,categories,validation_errors,json_version,data_api_version,endpoint_uri,preview";
    const res = await fetch(`${META_BASE_URL}/${resolvedWaba}/flows?fields=${fields}&limit=${Math.min(limit, 200)}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${creds.token}`,
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error?.message || "Failed to list Flows from Meta.");
      err.statusCode = res.status;
      err.metaError = data?.error;
      throw err;
    }

    return Array.isArray(data.data) ? data.data : [];
  }

  /**
   * Reconciles and synchronizes Meta Flows with local SQLite database
   */
  async syncFlowsWithMeta({ userId, wabaId = null, customCredentials = null } = {}) {
    const metaList = await this.listMetaFlows({ limit: 100, customCredentials, wabaId });

    let syncedCount = 0;
    let createdCount = 0;

    const findExisting = db.prepare("SELECT * FROM whatsapp_flows WHERE meta_flow_id = ?");
    const updateFlow = db.prepare(`
      UPDATE whatsapp_flows 
      SET status = ?, 
          name = ?, 
          categories = ?, 
          validation_errors = ?, 
          endpoint_uri = ?, 
          preview_url = ?, 
          sync_status = 'SYNCED', 
          last_sync_at = CURRENT_TIMESTAMP, 
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const insertFlow = db.prepare(`
      INSERT INTO whatsapp_flows (
        id, user_id, name, description, meta_flow_id, status, categories,
        flow_json, json_version, data_api_version, endpoint_uri, preview_url,
        validation_errors, sync_status, last_sync_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    for (const item of metaList) {
      const existing = findExisting.get(item.id);
      const categoriesJson = JSON.stringify(item.categories || []);
      const validationErrorsJson = JSON.stringify(item.validation_errors || []);
      const previewUrl = item.preview?.preview_url || null;

      if (existing) {
        updateFlow.run(
          item.status || existing.status,
          item.name || existing.name,
          categoriesJson,
          validationErrorsJson,
          item.endpoint_uri || existing.endpoint_uri,
          previewUrl || existing.preview_url,
          existing.id
        );
        syncedCount++;
      } else {
        const newLocalId = crypto.randomUUID();
        const placeholderJson = JSON.stringify({
          version: item.json_version || "3.1",
          data_api_version: item.data_api_version || "3.0",
          screens: [
            {
              id: "SCREEN_0",
              title: item.name || "Flow Screen",
              terminal: true,
              layout: {
                type: "SingleColumnLayout",
                children: [
                  {
                    type: "TextHeading",
                    text: item.name || "Welcome"
                  }
                ]
              }
            }
          ]
        }, null, 2);

        insertFlow.run(
          newLocalId,
          userId || "system",
          item.name || `Flow ${item.id}`,
          "Synchronized from Meta WhatsApp Business Account",
          item.id,
          item.status || "DRAFT",
          categoriesJson,
          placeholderJson,
          item.json_version || "3.1",
          item.data_api_version || "3.0",
          item.endpoint_uri || null,
          previewUrl,
          validationErrorsJson
        );
        createdCount++;
      }
    }

    return {
      totalMetaFlows: metaList.length,
      syncedCount,
      createdCount
    };
  }

  /**
   * Creates a local flow draft in whatsapp_flows
   */
  createLocalFlow({ id = null, name, category = "OTHER", categories = null, description = "", flowJson, userId = "system" }) {
    if (!name || !flowJson) {
      throw new Error("name and flowJson are required to create a local flow.");
    }
    const flowId = id || crypto.randomUUID();
    const finalCategories = categories ? (Array.isArray(categories) ? categories : [categories]) : (category ? [category] : ["OTHER"]);
    const jsonStr = typeof flowJson === "string" ? flowJson : JSON.stringify(flowJson, null, 2);
    let parsed = {};
    try {
      parsed = typeof flowJson === "string" ? JSON.parse(flowJson) : (flowJson || {});
    } catch (e) {
      parsed = {};
    }

    db.prepare(`
      INSERT INTO whatsapp_flows (
        id, user_id, name, description, status, categories,
        flow_json, json_version, data_api_version, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, 'LOCAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      flowId,
      userId,
      String(name).trim(),
      description || null,
      JSON.stringify(finalCategories),
      jsonStr,
      parsed.version || "3.1",
      parsed.data_api_version || "3.0"
    );

    return this.getLocalFlow(flowId);
  }

  /**
   * Retrieves a local Flow by ID or Meta Flow ID
   */
  getLocalFlow(flowId) {
    if (!flowId) return null;
    const row = db.prepare("SELECT * FROM whatsapp_flows WHERE id = ? OR meta_flow_id = ?").get(flowId, flowId);
    if (!row) return null;
    let cats = [];
    try {
      cats = JSON.parse(row.categories || "[]");
    } catch (e) {
      cats = [];
    }
    return {
      ...row,
      category: cats[0] || "OTHER",
      categories: cats
    };
  }

  /**
   * Updates an existing local Flow
   */
  updateLocalFlow(flowId, updates = {}) {
    const existing = this.getLocalFlow(flowId);
    if (!existing) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    const name = updates.name !== undefined ? updates.name : existing.name;
    const description = updates.description !== undefined ? updates.description : existing.description;
    const status = updates.status !== undefined ? updates.status : (updates.meta_status !== undefined ? updates.meta_status : existing.status);
    const flowJson = updates.flowJson !== undefined ? (typeof updates.flowJson === "string" ? updates.flowJson : JSON.stringify(updates.flowJson, null, 2)) : existing.flow_json;

    let categoriesJson = existing.categories ? JSON.stringify(existing.categories) : '["OTHER"]';
    if (updates.category || updates.categories) {
      const cats = updates.categories || (updates.category ? [updates.category] : ["OTHER"]);
      categoriesJson = JSON.stringify(cats);
    }

    db.prepare(`
      UPDATE whatsapp_flows
      SET name = ?, description = ?, status = ?, categories = ?, flow_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, description, status, categoriesJson, flowJson, existing.id);

    return this.getLocalFlow(existing.id);
  }

  /**
   * Creates a cryptographically secure, opaque Flow Token for outbound Flow messaging
   */
  createFlowToken({ flowId, metaFlowId = null, recipientPhone, contextMessageId = null, campaignId = null, userId = "system", validityHours = 48 }) {
    if (!flowId || !recipientPhone) {
      throw new Error("flowId and recipientPhone are required to generate a Flow token.");
    }

    const clean = cleanPhone(recipientPhone, getSetting("DEFAULT_COUNTRY_CODE") || "91");
    const rawRandom = crypto.randomBytes(16).toString("hex");
    const token = `flwtk_${Date.now()}_${rawRandom}`;
    const expiresAt = new Date(Date.now() + validityHours * 3600 * 1000).toISOString();

    db.prepare(`
      INSERT INTO flow_tokens (
        token, flow_id, meta_flow_id, recipient_phone, clean_phone,
        meta_message_id, context_message_id, campaign_id, user_id, status, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, CURRENT_TIMESTAMP)
    `).run(
      token,
      flowId,
      metaFlowId || null,
      String(recipientPhone).trim(),
      clean || String(recipientPhone).trim(),
      contextMessageId || null,
      contextMessageId || null,
      campaignId || null,
      userId || "system",
      expiresAt
    );

    return token;
  }

  /**
   * Resolves a Flow Token record from DB
   */
  resolveFlowToken(token) {
    if (!token) return null;
    const row = db.prepare("SELECT * FROM flow_tokens WHERE token = ?").get(token);
    if (!row) return null;
    return {
      ...row,
      context_message_id: row.context_message_id || row.meta_message_id
    };
  }

  /**
   * Alias for createFlowToken
   */
  generateFlowToken(params) {
    return this.createFlowToken(params);
  }
}

module.exports = new FlowService();
