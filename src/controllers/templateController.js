const { db } = require("../config/database");
const { getTemplateDetails } = require("../services/metaWhatsAppService");

/**
 * Parses JSON string fields on template row safely
 */
function formatTemplateRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    meta_id: row.meta_id || row.id,
    language: row.language || "en",
    category: row.category || "MARKETING",
    status: row.status || "APPROVED",
    parameter_format: row.parameter_format || "POSITIONAL",
    bodyText: row.body_text || "",
    variables: row.variables ? JSON.parse(row.variables) : [],
    components: row.components ? JSON.parse(row.components) : [],
    buttons: row.buttons ? JSON.parse(row.buttons) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * List all saved system templates
 */
async function listTemplates(req, res) {
  try {
    const rows = db.prepare(`
      SELECT * FROM templates 
      ORDER BY 
        CASE WHEN name = 'kt_invitation_' THEN 1 
             WHEN name = 'kt_restaurant_invitation' THEN 2 
             ELSE 3 END,
        created_at ASC
    `).all();

    const templates = rows.map(formatTemplateRow);
    return res.status(200).json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error("List templates error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Add or Save a template to the system by Meta Template ID or Name
 */
async function addTemplate(req, res) {
  try {
    const {
      templateIdOrName,
      language,
      name,
      category,
      parameter_format,
      bodyText,
      variables,
      buttons
    } = req.body || {};

    const cleanInput = String(templateIdOrName || name || "").trim();
    if (!cleanInput) {
      return res.status(400).json({
        success: false,
        message: "Template Number, ID, or Name is required."
      });
    }

    let tplDetails = null;

    // 1. Attempt authoritative fetch and inspection directly from Meta Graph API
    try {
      tplDetails = await getTemplateDetails(cleanInput);
    } catch (metaErr) {
      console.warn(`[Template] Meta fetch note for '${cleanInput}':`, metaErr.message);
    }

    // Determine final values: prioritize Meta verified info, fallback to user inputs
    const finalId = tplDetails?.id || cleanInput;
    const finalName = tplDetails?.name || name || cleanInput;
    const finalMetaId = tplDetails?.id || (cleanInput.match(/^\d+$/) ? cleanInput : finalId);
    const finalLang = tplDetails?.language || language || "en";
    const finalCategory = tplDetails?.category || category || "MARKETING";
    const finalStatus = tplDetails?.status || "APPROVED";
    const finalFormat = tplDetails?.parameter_format || parameter_format || "POSITIONAL";
    const finalBodyText = tplDetails?.bodyText || bodyText || "";
    const finalVariables = tplDetails?.variables || variables || [];
    const finalComponents = tplDetails?.components || [];
    const finalButtons = tplDetails?.buttons || buttons || [];

    // Save into SQLite templates table (Upsert)
    const upsertStmt = db.prepare(`
      INSERT INTO templates (
        id, name, meta_id, language, category, status, parameter_format,
        body_text, variables, components, buttons, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        meta_id = excluded.meta_id,
        language = excluded.language,
        category = excluded.category,
        status = excluded.status,
        parameter_format = excluded.parameter_format,
        body_text = excluded.body_text,
        variables = excluded.variables,
        components = excluded.components,
        buttons = excluded.buttons,
        updated_at = CURRENT_TIMESTAMP
    `);

    upsertStmt.run(
      finalId,
      finalName,
      finalMetaId,
      finalLang,
      finalCategory,
      finalStatus,
      finalFormat,
      finalBodyText,
      JSON.stringify(finalVariables),
      JSON.stringify(finalComponents),
      JSON.stringify(finalButtons)
    );

    const savedRow = db.prepare("SELECT * FROM templates WHERE id = ?").get(finalId);
    const formatted = formatTemplateRow(savedRow);

    return res.status(201).json({
      success: true,
      message: `Template '${finalName}' added to system successfully!`,
      data: formatted
    });
  } catch (error) {
    console.error("Add template error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get single template by ID or Name (checks database first, then Meta API)
 */
async function getTemplate(req, res) {
  try {
    const { templateId } = req.params;
    const clean = String(templateId).trim();

    // 1. Check local DB first
    const row = db.prepare(`
      SELECT * FROM templates 
      WHERE id = ? OR meta_id = ? OR name = ? COLLATE NOCASE
      LIMIT 1
    `).get(clean, clean, clean);

    if (row) {
      return res.status(200).json({
        success: true,
        data: formatTemplateRow(row)
      });
    }

    // 2. Fallback to Meta API directly
    const details = await getTemplateDetails(clean);
    if (!details) {
      return res.status(404).json({
        success: false,
        message: `Template '${clean}' not found on Meta or in system.`
      });
    }

    // Cache into database for future quick use
    try {
      db.prepare(`
        INSERT OR IGNORE INTO templates (
          id, name, meta_id, language, category, status, parameter_format,
          body_text, variables, components, buttons
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        details.id || clean,
        details.name || clean,
        details.id || clean,
        details.language || "en",
        details.category || "MARKETING",
        details.status || "APPROVED",
        details.parameter_format || "POSITIONAL",
        details.bodyText || "",
        JSON.stringify(details.variables || []),
        JSON.stringify(details.components || []),
        JSON.stringify(details.buttons || [])
      );
    } catch (e) {
      // Ignore cache failure
    }

    return res.status(200).json({
      success: true,
      data: details
    });
  } catch (error) {
    console.error("Get template error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Delete a template from system
 */
async function deleteTemplate(req, res) {
  try {
    const { templateId } = req.params;
    const clean = String(templateId).trim();

    const info = db.prepare(`
      DELETE FROM templates 
      WHERE id = ? OR meta_id = ? OR name = ?
    `).run(clean, clean, clean);

    if (info.changes === 0) {
      return res.status(404).json({
        success: false,
        message: `Template '${clean}' not found in system.`
      });
    }

    return res.status(200).json({
      success: true,
      message: "Template removed from system successfully."
    });
  } catch (error) {
    console.error("Delete template error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  listTemplates,
  addTemplate,
  getTemplate,
  deleteTemplate
};
