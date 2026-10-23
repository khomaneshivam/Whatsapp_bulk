const { db } = require("../config/database");
const { 
  getTemplateDetails, 
  fetchWabaTemplates, 
  resolveWabaId, 
  clearTemplateCache 
} = require("../services/metaWhatsAppService");

/**
 * Parses JSON string fields on template row safely
 */
function formatTemplateRow(row) {
  if (!row) return null;
  const components = row.components ? JSON.parse(row.components) : [];
  const bodyText = row.body_text || "";
  if (components.length === 0 && bodyText) {
    components.push({
      type: "BODY",
      text: bodyText
    });
  }

  let variables = row.variables ? JSON.parse(row.variables) : [];
  if (variables.length === 0 && bodyText) {
    const matches = [...bodyText.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)];
    const uniqueKeys = [...new Set(matches.map(m => m[1]))];
    variables = uniqueKeys.map((key, i) => ({
      type: /^\d+$/.test(key) ? "positional" : "named",
      index: i + 1,
      key,
      label: `{{${key}}}`,
      name: key,
      example: ""
    }));
  }

  const rawCat = (row.category || "MARKETING").toUpperCase();
  const validCat = ["MARKETING", "UTILITY", "AUTHENTICATION"].includes(rawCat) ? rawCat : "MARKETING";

  const buttons = row.buttons ? JSON.parse(row.buttons) : [];
  let flowButton = null;
  if (Array.isArray(buttons)) {
    flowButton = buttons.find(b => String(b.type || "").toUpperCase() === "FLOW") || null;
  }
  if (!flowButton && Array.isArray(components)) {
    const btnComp = components.find(c => String(c.type || "").toUpperCase() === "BUTTONS");
    if (btnComp && Array.isArray(btnComp.buttons)) {
      flowButton = btnComp.buttons.find(b => String(b.type || "").toUpperCase() === "FLOW") || null;
    }
  }

  return {
    id: row.id,
    name: row.name,
    meta_id: row.meta_id || row.id,
    language: row.language || "en",
    category: validCat,
    status: row.status || "APPROVED",
    parameter_format: row.parameter_format || "POSITIONAL",
    bodyText: bodyText,
    variables: variables,
    components: components,
    buttons: buttons,
    hasFlowButton: Boolean(flowButton),
    flowButton: flowButton,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * List saved system templates with optional category, search, and status filtering
 */
async function listTemplates(req, res) {
  try {
    const categoryParam = String(req.query.category || "ALL").trim().toUpperCase();
    const searchParam = String(req.query.search || req.query.q || "").trim();
    const statusParam = String(req.query.status || "").trim().toUpperCase();

    let sql = `SELECT * FROM templates WHERE 1=1`;
    const params = [];

    if (categoryParam && categoryParam !== "ALL") {
      sql += ` AND UPPER(COALESCE(category, 'MARKETING')) = ?`;
      params.push(categoryParam);
    }

    if (statusParam && statusParam !== "ALL") {
      sql += ` AND UPPER(COALESCE(status, 'APPROVED')) = ?`;
      params.push(statusParam);
    }

    if (searchParam) {
      sql += ` AND (name LIKE ? OR meta_id LIKE ? OR body_text LIKE ? OR category LIKE ?)`;
      const pattern = `%${searchParam}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    sql += ` ORDER BY 
      CASE WHEN name = 'kt_invitation_' THEN 1 
           WHEN name = 'kt_restaurant_invitation' THEN 2 
           ELSE 3 END,
      created_at ASC`;

    const rows = db.prepare(sql).all(...params);
    const templates = rows.map(formatTemplateRow);

    return res.status(200).json({
      success: true,
      category: categoryParam,
      total: templates.length,
      data: templates,
      templates: templates
    });
  } catch (error) {
    console.error("List templates error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get category breakdown counts and metadata across system templates
 */
async function getCategoriesSummary(req, res) {
  try {
    const rows = db.prepare(`
      SELECT UPPER(COALESCE(category, 'MARKETING')) as category, COUNT(*) as count 
      FROM templates 
      GROUP BY UPPER(COALESCE(category, 'MARKETING'))
    `).all();

    const countsMap = {
      MARKETING: 0,
      UTILITY: 0,
      AUTHENTICATION: 0
    };

    let total = 0;
    for (const r of rows) {
      const cat = r.category || "MARKETING";
      if (countsMap[cat] !== undefined) {
        countsMap[cat] = Number(r.count) || 0;
      }
      total += Number(r.count) || 0;
    }

    const categories = [
      {
        id: "ALL",
        key: "ALL",
        label: "All Templates",
        icon: "Layers",
        count: total,
        color: "#0F172A",
        badgeBg: "#F1F5F9",
        badgeBorder: "#E2E8F0",
        description: "All approved WhatsApp templates in your workspace"
      },
      {
        id: "MARKETING",
        key: "MARKETING",
        label: "Marketing",
        icon: "📢",
        count: countsMap.MARKETING,
        color: "#7C3AED",
        badgeBg: "#F3E8FF",
        badgeBorder: "#E9D5FF",
        description: "Promotions, announcements, discounts, invitations & partner outreach"
      },
      {
        id: "UTILITY",
        key: "UTILITY",
        label: "Utility",
        icon: "⚡",
        count: countsMap.UTILITY,
        color: "#16A34A",
        badgeBg: "#DCFCE7",
        badgeBorder: "#BBF7D0",
        description: "Booking reminders, arrival guides, receipts & account notifications"
      },
      {
        id: "AUTHENTICATION",
        key: "AUTHENTICATION",
        label: "Authentication",
        icon: "🔐",
        count: countsMap.AUTHENTICATION,
        color: "#D97706",
        badgeBg: "#FEF3C7",
        badgeBorder: "#FDE68A",
        description: "One-time passcodes (OTP), verification numbers & login alerts"
      }
    ];

    return res.status(200).json({
      success: true,
      total,
      breakdown: countsMap,
      categories
    });
  } catch (error) {
    console.error("Get categories summary error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Synchronize all or category-specific templates directly from Meta Graph API
 */
async function syncTemplatesFromMeta(req, res) {
  try {
    const category = req.body?.category || req.query?.category || null;
    const wabaId = req.body?.wabaId || req.query?.wabaId || null;

    // Check if WABA ID is available before attempting sync
    const activeWaba = resolveWabaId(wabaId);
    if (!activeWaba) {
      return res.status(400).json({
        success: false,
        code: "MISSING_WABA_ID",
        message: "WhatsApp Business Account ID (WABA ID) is not configured. Please enter your WABA ID in Settings or specify it here to sync all templates directly from Meta."
      });
    }

    const metaResult = await fetchWabaTemplates({
      category: category && String(category).toUpperCase() !== "ALL" ? category : null,
      wabaId: activeWaba
    });

    const metaTemplates = metaResult.templates || [];
    let syncedCount = 0;
    const breakdown = {
      MARKETING: 0,
      UTILITY: 0,
      AUTHENTICATION: 0
    };

    if (metaTemplates.length > 0) {
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

      for (const tpl of metaTemplates) {
        const cat = (tpl.category || "MARKETING").toUpperCase();
        if (breakdown[cat] !== undefined) {
          breakdown[cat]++;
        } else {
          breakdown.MARKETING++;
        }

        upsertStmt.run(
          tpl.id,
          tpl.name,
          tpl.meta_id || tpl.id,
          tpl.language || "en",
          cat,
          tpl.status || "APPROVED",
          tpl.parameter_format || "POSITIONAL",
          tpl.bodyText || "",
          JSON.stringify(tpl.variables || []),
          JSON.stringify(tpl.components || []),
          JSON.stringify(tpl.buttons || [])
        );
        syncedCount++;
      }

      // Flush memory cache so subsequent calls reflect new templates immediately
      clearTemplateCache();
    }

    // Fetch updated complete list from SQLite
    const updatedRows = db.prepare(`
      SELECT * FROM templates 
      ORDER BY 
        CASE WHEN name = 'kt_invitation_' THEN 1 
             WHEN name = 'kt_restaurant_invitation' THEN 2 
             ELSE 3 END,
        created_at ASC
    `).all();
    const updatedTemplates = updatedRows.map(formatTemplateRow);

    return res.status(200).json({
      success: true,
      message: `Successfully synchronized ${syncedCount} templates from Meta WABA (${breakdown.MARKETING} Marketing, ${breakdown.UTILITY} Utility, ${breakdown.AUTHENTICATION} Authentication).`,
      wabaId: activeWaba,
      category: category ? String(category).toUpperCase() : "ALL",
      syncedCount,
      breakdown,
      templates: updatedTemplates,
      data: updatedTemplates
    });
  } catch (error) {
    console.error("Sync templates from Meta error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "META_SYNC_ERROR",
      message: error.message || "Failed to synchronize templates from Meta Cloud API.",
      hint: error.hint
    });
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

    clearTemplateCache();

    return res.status(201).json({
      success: true,
      message: `Template '${finalName}' added to system successfully!`,
      data: formatted,
      template: formatted
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
      const formatted = formatTemplateRow(row);
      return res.status(200).json({
        success: true,
        data: formatted,
        template: formatted
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
      data: details,
      template: details
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

    clearTemplateCache();

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
  getCategoriesSummary,
  syncTemplatesFromMeta,
  addTemplate,
  getTemplate,
  deleteTemplate
};
