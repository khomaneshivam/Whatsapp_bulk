const { db } = require("../config/database");
const { generateCampaignReportExcel } = require("../services/excelService");

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
  if (user.role === "ADMIN" || campaign.user_id === user.id) {
    return { allowed: true };
  }
  if (campaign.user_id !== user.id) {
    return { allowed: false, status: 403, message: "Forbidden: You do not have access to this campaign." };
  }
  return { allowed: true };
}

/**
 * List all campaigns (returns all historical campaigns by default)
 */
async function listCampaigns(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    let sql = `
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND (status = 'DELIVERED' OR status = 'READ')) as current_delivered,
        (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'READ') as current_read,
        (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'SENT') as current_sent,
        (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'FAILED') as current_failed,
        (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'PENDING') as current_pending,
        (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'UNKNOWN') as current_unknown
      FROM campaigns c
    `;

    const params = [];

    // Non-admin users strictly see only their own campaigns
    if (user.role !== "ADMIN") {
      sql += " WHERE c.user_id = ?";
      params.push(user.id);
    } else {
      // Admins see all historical campaigns by default; can optionally filter by target userId if requested
      const targetUserId = req.query?.userId;
      if (targetUserId && String(targetUserId).trim() && String(targetUserId).trim() !== "ALL") {
        sql += " WHERE c.user_id = ?";
        params.push(String(targetUserId).trim());
      }
    }

    sql += " ORDER BY c.created_at DESC";

    const campaigns = db.prepare(sql).all(...params);

    return res.status(200).json({
      success: true,
      data: campaigns
    });
  } catch (error) {
    console.error("List campaigns error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get detailed campaign info and list of recipients (verifying ownership)
 */
async function getCampaignDetails(req, res) {
  try {
    const { campaignId } = req.params;
    const { page, limit, status, search } = req.query;

    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    const access = checkCampaignAccess(campaign, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    // High performance indexed status breakdown
    const statusCounts = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status IN ('DELIVERED', 'READ') THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'READ' THEN 1 ELSE 0 END) as read,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'UNKNOWN' THEN 1 ELSE 0 END) as unknown
      FROM campaign_recipients 
      WHERE campaign_id = ?
    `).get(campaignId);

    const conditions = ["campaign_id = ?"];
    const params = [campaignId];

    if (status && status !== "ALL") {
      conditions.push("status = ?");
      params.push(status);
    }
    if (search && search.trim()) {
      conditions.push("(contact_name LIKE ? OR phone_number LIKE ? OR clean_phone LIKE ?)");
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    let recipients;
    let pagination = null;

    if (page || limit) {
      const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
      const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
      const offset = (parsedPage - 1) * parsedLimit;

      const totalFiltered = db.prepare(`SELECT COUNT(*) as c FROM campaign_recipients ${whereClause}`).get(...params).c;

      recipients = db.prepare(`
        SELECT id, campaign_id, phone_number, clean_phone, contact_name, status, meta_message_id, error_code, error_message, sent_at, delivered_at, read_at, failed_at
        FROM campaign_recipients
        ${whereClause}
        ORDER BY id ASC
        LIMIT ? OFFSET ?
      `).all(...params, parsedLimit, offset);

      pagination = {
        total: totalFiltered,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(totalFiltered / parsedLimit)
      };
    } else {
      recipients = db.prepare(`
        SELECT id, campaign_id, phone_number, clean_phone, contact_name, status, meta_message_id, error_code, error_message, sent_at, delivered_at, read_at, failed_at
        FROM campaign_recipients
        ${whereClause}
        ORDER BY id ASC
      `).all(...params);
    }

    return res.status(200).json({
      success: true,
      data: {
        campaign,
        metrics: {
          total: statusCounts?.total || campaign.total_contacts || 0,
          sent: statusCounts?.sent || campaign.sent_count || 0,
          delivered: statusCounts?.delivered || 0,
          read: statusCounts?.read || 0,
          failed: statusCounts?.failed || campaign.failed_count || 0,
          pending: statusCounts?.pending || 0,
          unknown: statusCounts?.unknown || 0
        },
        recipients,
        pagination
      }
    });
  } catch (error) {
    console.error("Get campaign details error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Deletes a campaign and cascades recipients (verifying ownership)
 */
async function deleteCampaign(req, res) {
  try {
    const { campaignId } = req.params;

    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    const access = checkCampaignAccess(campaign, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    if (campaignId === "campaign_booking_lifecycle") {
      db.prepare("DELETE FROM campaign_recipients WHERE campaign_id = ?").run(campaignId);
      db.prepare("UPDATE campaigns SET sent_count = 0, failed_count = 0, status = 'PAUSED' WHERE id = ?").run(campaignId);
      return res.status(200).json({
        success: true,
        message: "Booking Automation campaign metrics reset and status set to PAUSED."
      });
    }

    db.prepare("DELETE FROM campaign_recipients WHERE campaign_id = ?").run(campaignId);
    db.prepare("DELETE FROM campaigns WHERE id = ?").run(campaignId);

    return res.status(200).json({
      success: true,
      message: "Campaign and its recipient logs deleted successfully."
    });
  } catch (error) {
    console.error("Delete campaign error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Exports campaign delivery results as an Excel workbook (verifying ownership)
 */
async function exportCampaignReport(req, res) {
  try {
    const { campaignId } = req.params;
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    const access = checkCampaignAccess(campaign, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const recipients = db.prepare(`
      SELECT phone_number, clean_phone, contact_name, status, meta_message_id, error_code, error_message, sent_at
      FROM campaign_recipients
      WHERE campaign_id = ?
      ORDER BY id ASC
    `).all(campaignId);

    const excelBuffer = generateCampaignReportExcel(campaign, recipients);
    const sanitizedName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `Broadcast_Report_${sanitizedName}_${Date.now()}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(excelBuffer);
  } catch (error) {
    console.error("Export campaign report error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  listCampaigns,
  getCampaignDetails,
  deleteCampaign,
  exportCampaignReport
};
