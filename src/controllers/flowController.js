const crypto = require("crypto");
const { db, getSetting, setSetting } = require("../config/database");
const config = require("../config/env");
const flowService = require("../services/flowService");
const flowCryptoService = require("../services/flowCryptoService");
const metaWhatsAppService = require("../services/metaWhatsAppService");
const { STARTER_TEMPLATES } = require("../services/flowStarterTemplates");

/**
 * Helper to check if WhatsApp Flows is enabled on the platform
 */
function isFlowsEnabled() {
  const settingVal = getSetting("WHATSAPP_FLOWS_ENABLED");
  if (settingVal !== null) {
    return settingVal === "true";
  }
  return Boolean(config.WHATSAPP_FLOWS_ENABLED);
}

/**
 * Record an action to audit_logs
 */
function logAudit(userId, action, targetId, details, req) {
  try {
    const ip = req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "";
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, target_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, action, targetId || null, details || null, ip);
  } catch (e) {
    // Audit log shouldn't fail the request
  }
}

/**
 * GET /api/flows - List all WhatsApp Flows
 */
async function listFlows(req, res) {
  try {
    const enabled = isFlowsEnabled();
    if (!enabled) {
      return res.status(403).json({
        success: false,
        message: "WhatsApp Flows feature is currently disabled."
      });
    }

    const { search, category, status } = req.query || {};
    const userId = req.user?.id;
    const isAdmin = req.user?.role === "ADMIN";

    let sql = `
      SELECT f.id, f.user_id, f.name, f.description, f.meta_flow_id, f.status, 
             f.categories, f.json_version, f.data_api_version, f.endpoint_uri, 
             f.preview_url, f.validation_errors, f.sync_status, f.last_sync_at,
             f.created_at, f.updated_at,
             (SELECT COUNT(*) FROM flow_responses r WHERE r.flow_id = f.id OR (f.meta_flow_id IS NOT NULL AND r.flow_id = f.meta_flow_id)) as response_count,
             u.name as creator_name
      FROM whatsapp_flows f
      LEFT JOIN users u ON f.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Access control: Admin sees all, non-admin sees flows they created or published flows
    if (!isAdmin) {
      sql += " AND (f.user_id = ? OR f.status = 'PUBLISHED')";
      params.push(userId);
    }

    if (search && String(search).trim()) {
      sql += " AND (f.name LIKE ? OR f.description LIKE ? OR f.meta_flow_id LIKE ?)";
      const term = `%${String(search).trim()}%`;
      params.push(term, term, term);
    }

    if (category && String(category).trim().toUpperCase() !== "ALL") {
      sql += " AND f.categories LIKE ?";
      params.push(`%${String(category).trim()}%`);
    }

    if (status && String(status).trim().toUpperCase() !== "ALL") {
      sql += " AND f.status = ?";
      params.push(String(status).trim().toUpperCase());
    }

    sql += " ORDER BY f.updated_at DESC";

    const rows = db.prepare(sql).all(...params);
    const parsedRows = rows.map(r => ({
      ...r,
      categories: (() => { try { return JSON.parse(r.categories || "[]"); } catch (e) { return []; } })(),
      validation_errors: (() => { try { return JSON.parse(r.validation_errors || "[]"); } catch (e) { return []; } })()
    }));

    return res.status(200).json({
      success: true,
      isFeatureEnabled: enabled,
      data: parsedRows,
      count: parsedRows.length
    });
  } catch (error) {
    console.error("[FlowController] listFlows error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/flows/starter-templates - List starter Flow templates
 */
async function getStarterTemplates(req, res) {
  try {
    return res.status(200).json({
      success: true,
      data: STARTER_TEMPLATES
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/flows/:flowId - Get details of a single Flow
 */
async function getFlow(req, res) {
  try {
    const { flowId } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === "ADMIN";

    const flow = db.prepare(`
      SELECT f.*, u.name as creator_name
      FROM whatsapp_flows f
      LEFT JOIN users u ON f.user_id = u.id
      WHERE f.id = ? OR f.meta_flow_id = ?
    `).get(flowId, flowId);

    if (!flow) {
      return res.status(404).json({ success: false, message: "Flow not found." });
    }

    if (!isAdmin && flow.user_id !== userId && flow.status !== "PUBLISHED") {
      return res.status(403).json({ success: false, message: "Access denied to this flow." });
    }

    const recentResponses = db.prepare(`
      SELECT id, flow_token, wa_message_id, from_phone, customer_name,
             parsed_data, created_at
      FROM flow_responses
      WHERE flow_id = ? OR flow_id = ?
      ORDER BY id DESC
      LIMIT 10
    `).all(flow.id, flow.meta_flow_id || flow.id);

    return res.status(200).json({
      success: true,
      data: {
        ...flow,
        categories: (() => { try { return JSON.parse(flow.categories || "[]"); } catch (e) { return []; } })(),
        validation_errors: (() => { try { return JSON.parse(flow.validation_errors || "[]"); } catch (e) { return []; } })(),
        flow_json: (() => { try { return JSON.parse(flow.flow_json || "{}"); } catch (e) { return flow.flow_json; } })(),
        recentResponses: recentResponses.map(r => ({
          ...r,
          parsed_data: (() => { try { return JSON.parse(r.parsed_data || "{}"); } catch (e) { return {}; } })()
        }))
      }
    });
  } catch (error) {
    console.error("[FlowController] getFlow error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/flows - Create a new local Flow
 */
async function createFlow(req, res) {
  try {
    const { name, description, categories, flow_json, endpoint_uri, template_key } = req.body || {};
    const userId = req.user.id;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: "Flow name is required." });
    }

    let finalFlowJson = flow_json;
    let finalCategories = Array.isArray(categories) && categories.length > 0 ? categories : ["OTHER"];

    // If instantiated from starter template
    if (template_key) {
      const tpl = STARTER_TEMPLATES.find(t => t.key === template_key);
      if (tpl) {
        finalFlowJson = finalFlowJson || tpl.flow_json;
        finalCategories = tpl.categories || finalCategories;
      }
    }

    if (!finalFlowJson) {
      return res.status(400).json({ success: false, message: "Flow JSON definition is required." });
    }

    // Validate Flow JSON syntax
    const validation = flowService.validateFlowJson(finalFlowJson);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Invalid Flow JSON definition.",
        errors: validation.errors
      });
    }

    const flowId = crypto.randomUUID();
    const jsonStr = JSON.stringify(validation.parsedJson, null, 2);
    const jsonVersion = validation.parsedJson.version || "3.1";
    const dataApiVersion = validation.parsedJson.data_api_version || "3.0";

    db.prepare(`
      INSERT INTO whatsapp_flows (
        id, user_id, name, description, meta_flow_id, status, categories,
        flow_json, json_version, data_api_version, endpoint_uri, preview_url,
        validation_errors, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, 'DRAFT', ?, ?, ?, ?, ?, NULL, '[]', 'LOCAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      flowId,
      userId,
      String(name).trim(),
      description ? String(description).trim() : null,
      JSON.stringify(finalCategories),
      jsonStr,
      jsonVersion,
      dataApiVersion,
      endpoint_uri ? String(endpoint_uri).trim() : null
    );

    logAudit(userId, "CREATE_FLOW", flowId, `Created flow draft: ${name}`, req);

    return res.status(201).json({
      success: true,
      message: "Flow created successfully as local draft.",
      data: {
        id: flowId,
        name: String(name).trim(),
        status: "DRAFT",
        sync_status: "LOCAL"
      }
    });
  } catch (error) {
    console.error("[FlowController] createFlow error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * PUT /api/flows/:flowId - Update Flow draft definition
 */
async function updateFlow(req, res) {
  try {
    const { flowId } = req.params;
    const { name, description, categories, flow_json, endpoint_uri } = req.body || {};
    const userId = req.user.id;
    const isAdmin = req.user.role === "ADMIN";

    const flow = db.prepare("SELECT * FROM whatsapp_flows WHERE id = ?").get(flowId);
    if (!flow) {
      return res.status(404).json({ success: false, message: "Flow not found." });
    }

    if (!isAdmin && flow.user_id !== userId) {
      return res.status(403).json({ success: false, message: "Access denied. Only the owner or an administrator can edit this flow." });
    }

    let jsonStr = flow.flow_json;
    let jsonVersion = flow.json_version;
    let dataApiVersion = flow.data_api_version;

    if (flow_json) {
      const validation = flowService.validateFlowJson(flow_json);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Invalid Flow JSON definition.",
          errors: validation.errors
        });
      }
      jsonStr = JSON.stringify(validation.parsedJson, null, 2);
      jsonVersion = validation.parsedJson.version || jsonVersion;
      dataApiVersion = validation.parsedJson.data_api_version || dataApiVersion;
    }

    const finalName = name ? String(name).trim() : flow.name;
    const finalDesc = description !== undefined ? (description ? String(description).trim() : null) : flow.description;
    const finalCategories = categories ? JSON.stringify(Array.isArray(categories) ? categories : [categories]) : flow.categories;
    const finalEndpoint = endpoint_uri !== undefined ? (endpoint_uri ? String(endpoint_uri).trim() : null) : flow.endpoint_uri;

    db.prepare(`
      UPDATE whatsapp_flows
      SET name = ?,
          description = ?,
          categories = ?,
          flow_json = ?,
          json_version = ?,
          data_api_version = ?,
          endpoint_uri = ?,
          sync_status = CASE WHEN meta_flow_id IS NOT NULL THEN 'OUT_OF_SYNC' ELSE sync_status END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(finalName, finalDesc, finalCategories, jsonStr, jsonVersion, dataApiVersion, finalEndpoint, flowId);

    logAudit(userId, "UPDATE_FLOW", flowId, `Updated flow definition: ${finalName}`, req);

    return res.status(200).json({
      success: true,
      message: "Flow draft updated successfully.",
      data: { id: flowId, name: finalName }
    });
  } catch (error) {
    console.error("[FlowController] updateFlow error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/flows/:flowId/push - Push Flow definition to Meta Cloud API
 */
async function pushFlowToMeta(req, res) {
  try {
    const { flowId } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === "ADMIN";

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Only administrators can push Flows to Meta." });
    }

    const flow = db.prepare("SELECT * FROM whatsapp_flows WHERE id = ?").get(flowId);
    if (!flow) {
      return res.status(404).json({ success: false, message: "Flow not found." });
    }

    let metaFlowId = flow.meta_flow_id;
    const categories = (() => { try { return JSON.parse(flow.categories || "[]"); } catch (e) { return ["OTHER"]; } })();

    // 1. If not yet created in Meta, create Flow entity
    if (!metaFlowId) {
      const createRes = await flowService.createMetaFlow({
        name: flow.name,
        categories,
        endpoint_uri: flow.endpoint_uri
      });
      metaFlowId = createRes.metaFlowId;
      db.prepare("UPDATE whatsapp_flows SET meta_flow_id = ? WHERE id = ?").run(metaFlowId, flowId);
    }

    // 2. Upload Flow JSON assets
    const uploadRes = await flowService.uploadFlowJsonAsset({
      metaFlowId,
      flowJson: flow.flow_json
    });

    // 3. Inspect updated status on Meta
    let metaDetails = null;
    try {
      metaDetails = await flowService.getMetaFlowDetails(metaFlowId);
    } catch (e) {}

    const newStatus = metaDetails?.status || flow.status || "DRAFT";
    const validationErrors = JSON.stringify(uploadRes.validationErrors || metaDetails?.validation_errors || []);
    const previewUrl = metaDetails?.preview?.preview_url || flow.preview_url;

    db.prepare(`
      UPDATE whatsapp_flows
      SET meta_flow_id = ?,
          status = ?,
          validation_errors = ?,
          preview_url = ?,
          sync_status = 'SYNCED',
          last_sync_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(metaFlowId, newStatus, validationErrors, previewUrl, flowId);

    logAudit(userId, "PUSH_FLOW_META", flowId, `Pushed flow to Meta with ID ${metaFlowId}`, req);

    return res.status(200).json({
      success: true,
      message: "Flow successfully pushed to Meta.",
      data: {
        id: flowId,
        metaFlowId,
        status: newStatus,
        previewUrl,
        validationErrors: uploadRes.validationErrors || []
      }
    });
  } catch (error) {
    console.error("[FlowController] pushFlowToMeta error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to push Flow to Meta.",
      details: error.metaError || null,
      validationErrors: error.validationErrors || []
    });
  }
}

/**
 * POST /api/flows/:flowId/publish - Publish Flow on Meta
 */
async function publishFlow(req, res) {
  try {
    const flowId = req.params?.flowId || req.params?.id;
    const userId = req.user?.id;
    const isAdmin = req.user?.role === "ADMIN";

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Access restricted: Only an Administrator can publish Flows." });
    }

    const flow = db.prepare("SELECT * FROM whatsapp_flows WHERE id = ?").get(flowId);
    if (!flow) {
      return res.status(404).json({ success: false, message: "Flow not found." });
    }

    if (!flow.meta_flow_id) {
      return res.status(400).json({ success: false, message: "Flow must be pushed to Meta before it can be published." });
    }

    await flowService.publishMetaFlow(flow.meta_flow_id);

    db.prepare(`
      UPDATE whatsapp_flows
      SET status = 'PUBLISHED',
          sync_status = 'SYNCED',
          last_sync_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(flowId);

    logAudit(userId, "PUBLISH_FLOW", flowId, `Published flow ${flow.name} (${flow.meta_flow_id})`, req);

    return res.status(200).json({
      success: true,
      message: "Flow successfully published! Customers can now receive and complete this Flow.",
      data: { id: flowId, status: "PUBLISHED" }
    });
  } catch (error) {
    console.error("[FlowController] publishFlow error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to publish Flow.",
      details: error.metaError || null
    });
  }
}

/**
 * POST /api/flows/:flowId/deprecate - Deprecate Flow on Meta
 */
async function deprecateFlow(req, res) {
  try {
    const { flowId } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === "ADMIN";

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Only administrators can deprecate Flows." });
    }

    const flow = db.prepare("SELECT * FROM whatsapp_flows WHERE id = ?").get(flowId);
    if (!flow) {
      return res.status(404).json({ success: false, message: "Flow not found." });
    }

    if (flow.meta_flow_id) {
      await flowService.deprecateMetaFlow(flow.meta_flow_id);
    }

    db.prepare(`
      UPDATE whatsapp_flows
      SET status = 'DEPRECATED',
          sync_status = 'SYNCED',
          last_sync_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(flowId);

    logAudit(userId, "DEPRECATE_FLOW", flowId, `Deprecated flow ${flow.name}`, req);

    return res.status(200).json({
      success: true,
      message: "Flow deprecated.",
      data: { id: flowId, status: "DEPRECATED" }
    });
  } catch (error) {
    console.error("[FlowController] deprecateFlow error:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

/**
 * DELETE /api/flows/:flowId - Delete Flow
 */
async function deleteFlow(req, res) {
  try {
    const flowId = req.params?.flowId || req.params?.id;
    const userId = req.user?.id;
    const isAdmin = req.user?.role === "ADMIN";

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Access denied: Only an Administrator can delete this Flow." });
    }

    const flow = db.prepare("SELECT * FROM whatsapp_flows WHERE id = ?").get(flowId);
    if (!flow) {
      return res.status(404).json({ success: false, message: "Flow not found." });
    }

    // If registered on Meta and in DRAFT, attempt to delete on Meta
    if (flow.meta_flow_id && flow.status === "DRAFT" && isAdmin) {
      try {
        await flowService.deleteMetaFlow(flow.meta_flow_id);
      } catch (metaErr) {
        console.warn("[FlowController] Meta delete warning:", metaErr.message);
      }
    }

    db.prepare("DELETE FROM whatsapp_flows WHERE id = ?").run(flowId);
    logAudit(userId, "DELETE_FLOW", flowId, `Deleted flow ${flow.name}`, req);

    return res.status(200).json({
      success: true,
      message: "Flow deleted successfully."
    });
  } catch (error) {
    console.error("[FlowController] deleteFlow error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/flows/sync - Sync with Meta WhatsApp Business Account
 */
async function syncMeta(req, res) {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === "ADMIN";

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Only administrators can synchronize with Meta." });
    }

    const result = await flowService.syncFlowsWithMeta({ userId });
    logAudit(userId, "SYNC_FLOWS_META", null, `Synced ${result.totalMetaFlows} flows from Meta`, req);

    return res.status(200).json({
      success: true,
      message: `Synchronized ${result.totalMetaFlows} Flows from Meta WhatsApp Business Account.`,
      data: result
    });
  } catch (error) {
    console.error("[FlowController] syncMeta error:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/flows/:flowId/send-test - Send an interactive Flow to a test recipient
 */
async function sendTestFlow(req, res) {
  try {
    const { flowId } = req.params;
    const { to, headerText, bodyText, footerText, ctaText } = req.body || {};
    const userId = req.user.id;

    if (!to || !String(to).trim()) {
      return res.status(400).json({ success: false, message: "Recipient phone number is required." });
    }

    const flow = db.prepare("SELECT * FROM whatsapp_flows WHERE id = ?").get(flowId);
    if (!flow) {
      return res.status(404).json({ success: false, message: "Flow not found." });
    }

    if (!flow.meta_flow_id) {
      return res.status(400).json({
        success: false,
        message: "This Flow has not been pushed to Meta yet. Please push to Meta before sending."
      });
    }

    // In Meta, interactive flows can be sent to test numbers if draft, or any number if published
    const flowToken = flowService.generateFlowToken({
      flowId: flow.id,
      metaFlowId: flow.meta_flow_id,
      recipientPhone: to,
      userId
    });

    const sendRes = await metaWhatsAppService.sendFlowMessage({
      to,
      metaFlowId: flow.meta_flow_id,
      flowToken,
      headerText: headerText || flow.name,
      bodyText: bodyText || `Please complete the ${flow.name} form below:`,
      footerText: footerText || "KonkanTrip Concierge",
      ctaText: ctaText || "Open Form"
    });

    logAudit(userId, "SEND_TEST_FLOW", flowId, `Sent test flow to ${sendRes.recipient}`, req);

    return res.status(200).json({
      success: true,
      message: `Flow message dispatched successfully to ${sendRes.recipient}.`,
      messageId: sendRes.messageId,
      flowToken
    });
  } catch (error) {
    console.error("[FlowController] sendTestFlow error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to send Flow message."
    });
  }
}

/**
 * GET /api/flows/responses - List Flow submissions
 */
async function listResponses(req, res) {
  try {
    const { flowId, search, limit = 50, offset = 0 } = req.query;
    const userId = req.user.id;
    const isAdmin = req.user.role === "ADMIN";

    let sql = `
      SELECT r.id, r.flow_id, r.flow_token, r.wa_message_id, r.from_phone,
             r.clean_phone, r.customer_name, r.parsed_data, r.created_at,
             f.name as flow_name, f.meta_flow_id
      FROM flow_responses r
      LEFT JOIN whatsapp_flows f ON (r.flow_id = f.id OR r.flow_id = f.meta_flow_id)
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin) {
      sql += " AND (r.user_id = ? OR f.user_id = ?)";
      params.push(userId, userId);
    }

    if (flowId && String(flowId).trim()) {
      sql += " AND (r.flow_id = ? OR f.id = ? OR f.meta_flow_id = ?)";
      params.push(flowId, flowId, flowId);
    }

    if (search && String(search).trim()) {
      sql += " AND (r.customer_name LIKE ? OR r.from_phone LIKE ? OR r.parsed_data LIKE ?)";
      const term = `%${String(search).trim()}%`;
      params.push(term, term, term);
    }

    sql += " ORDER BY r.id DESC LIMIT ? OFFSET ?";
    params.push(Math.min(parseInt(limit, 10) || 50, 100), parseInt(offset, 10) || 0);

    const rows = db.prepare(sql).all(...params);
    const parsed = rows.map(r => ({
      ...r,
      parsed_data: (() => { try { return JSON.parse(r.parsed_data || "{}"); } catch (e) { return {}; } })()
    }));

    return res.status(200).json({
      success: true,
      data: parsed,
      count: parsed.length
    });
  } catch (error) {
    console.error("[FlowController] listResponses error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/flows/crypto/config - View public key and dynamic endpoint status
 */
async function getCryptoConfig(req, res) {
  try {
    const isEnabled = isFlowsEnabled();
    const hasPrivateKey = Boolean(flowCryptoService.getPrivateKey());
    const publicKey = flowCryptoService.getPublicKey();

    const host = req.get("host");
    const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const endpointUrl = `${protocol}://${host}/api/flows/exchange`;

    return res.status(200).json({
      success: true,
      isEnabled,
      hasPrivateKey,
      publicKey,
      endpointUrl
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/flows/crypto/generate-keypair - Generate a new RSA Keypair (Admin Only)
 */
async function generateKeyPair(req, res) {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === "ADMIN";

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Access restricted: Only an Administrator can generate encryption keys." });
    }

    const { publicKey, privateKey } = flowCryptoService.generateRsaKeyPair();

    setSetting("FLOWS_PRIVATE_KEY", privateKey);
    setSetting("FLOWS_PUBLIC_KEY", publicKey);

    logAudit(userId, "GENERATE_FLOW_KEYPAIR", null, "Generated new RSA 2048-bit Flows keypair", req);

    return res.status(200).json({
      success: true,
      message: "New RSA 2048-bit keypair generated and saved.",
      publicKey
    });
  } catch (error) {
    console.error("[FlowController] generateKeyPair error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/flows/exchange or /flows/exchange
 * Meta Flow Dynamic Data Exchange Endpoint (Called directly by Meta servers)
 */
async function handleDataExchange(req, res) {
  try {
    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = req.body || {};

    if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
      return res.status(400).type("text/plain").send("Bad Request: Missing encryption parameters.");
    }

    // 1. Decrypt request using RSA private key & AES-128-GCM
    const { decryptedPayload, aesKey, initialVector } = flowCryptoService.decryptFlowPayload({
      encrypted_flow_data,
      encrypted_aes_key,
      initial_vector
    });

    // 2. Process business logic (action: ping, INIT, data_exchange)
    const responsePayload = flowCryptoService.processFlowAction(decryptedPayload);

    // 3. Encrypt response using AES-128-GCM with inverted IV
    const encryptedResponse = flowCryptoService.encryptFlowResponse({
      responsePayload,
      aesKey,
      initialVector
    });

    // 4. Return Base64 encrypted string with 200 OK
    return res.status(200).type("text/plain").send(encryptedResponse);
  } catch (error) {
    console.error("[FlowController] handleDataExchange error:", error.message);
    const status = error.statusCode || 500;
    return res.status(status).type("text/plain").send(error.message || "Internal Server Error");
  }
}

module.exports = {
  isFlowsEnabled,
  listFlows,
  getStarterTemplates,
  getFlow,
  createFlow,
  updateFlow,
  pushFlowToMeta,
  publishFlow,
  deprecateFlow,
  deleteFlow,
  syncMeta,
  sendTestFlow,
  listResponses,
  getCryptoConfig,
  generateKeyPair,
  handleDataExchange
};
