const XLSX = require("xlsx");
const { db } = require("../config/database");
const { getScopedUserId } = require("../middleware/authMiddleware");

/**
 * Get detailed campaign delivery reports with pagination and filtering
 */
async function getCampaignReports(req, res) {
  try {
    const { campaignId, status, search, limit = 50, page = 1 } = req.query;
    const scopedUserId = getScopedUserId(req);

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    const conditions = [];

    // User scope
    if (scopedUserId) {
      conditions.push("c.user_id = ?");
      params.push(scopedUserId);
    }

    if (campaignId) {
      conditions.push("r.campaign_id = ?");
      params.push(campaignId);
    }

    if (status && status !== "ALL") {
      conditions.push("r.status = ?");
      params.push(status);
    }

    if (search) {
      conditions.push("(r.contact_name LIKE ? OR r.phone_number LIKE ? OR r.clean_phone LIKE ?)");
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countQuery = `
      SELECT COUNT(*) as count 
      FROM campaign_recipients r
      LEFT JOIN campaigns c ON r.campaign_id = c.id
      ${whereClause}
    `;
    const totalCount = db.prepare(countQuery).get(...params).count;

    const dataQuery = `
      SELECT 
        r.id, r.campaign_id, c.name as campaign_name, r.contact_name,
        r.phone_number, r.clean_phone, r.status, r.meta_message_id,
        r.error_message, r.sent_at, c.template_name
      FROM campaign_recipients r
      LEFT JOIN campaigns c ON r.campaign_id = c.id
      ${whereClause}
      ORDER BY r.sent_at DESC, r.id DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(dataQuery).all(...params, parseInt(limit, 10), offset);

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: totalCount,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(totalCount / parseInt(limit, 10))
      }
    });
  } catch (error) {
    console.error("Reports getCampaignReports error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Export campaign delivery logs as Excel or CSV file
 */
async function exportCampaignReport(req, res) {
  try {
    const { campaignId, format = "xlsx" } = req.query;
    const scopedUserId = getScopedUserId(req);

    const conditions = [];
    const params = [];

    if (campaignId) {
      conditions.push("r.campaign_id = ?");
      params.push(campaignId);
    }

    if (scopedUserId) {
      conditions.push("c.user_id = ?");
      params.push(scopedUserId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = db.prepare(`
      SELECT 
        r.id as "ID",
        c.name as "Campaign Name",
        c.template_name as "Template",
        r.contact_name as "Recipient Name",
        r.clean_phone as "Phone Number",
        r.status as "Delivery Status",
        r.meta_message_id as "Meta Message ID",
        r.error_message as "Error Reason",
        r.sent_at as "Dispatched At"
      FROM campaign_recipients r
      LEFT JOIN campaigns c ON r.campaign_id = c.id
      ${whereClause}
      ORDER BY r.sent_at DESC
    `).all(...params);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "No recipient records found to export." });
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Delivery Report");

    const filename = `whatsapp_broadcast_report_${campaignId || "all"}_${Date.now()}.${format === "csv" ? "csv" : "xlsx"}`;

    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "text/csv");
      return res.send(csv);
    }

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    console.error("Export report error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get 4-Stage Booking Lifecycle Automation reports
 */
async function getAutomationReports(req, res) {
  try {
    const { triggerType, status, limit = 50, page = 1 } = req.query;
    const scopedUserId = getScopedUserId(req);

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const conditions = [];
    const params = [];

    if (scopedUserId) {
      conditions.push("user_id = ?");
      params.push(scopedUserId);
    }

    if (triggerType && triggerType !== "ALL") {
      conditions.push("trigger_type = ?");
      params.push(triggerType);
    }

    if (status && status !== "ALL") {
      conditions.push("status = ?");
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(*) as count FROM automated_booking_dispatches ${whereClause}`;
    const totalCount = db.prepare(countQuery).get(...params).count;

    const dataQuery = `
      SELECT 
        id, guest_name, phone_number, clean_phone, property_name,
        checkin_date, checkout_date, trigger_type, template_name,
        meta_message_id, status, error_message, dispatched_at
      FROM automated_booking_dispatches
      ${whereClause}
      ORDER BY dispatched_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(dataQuery).all(...params, parseInt(limit, 10), offset);

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: totalCount,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(totalCount / parseInt(limit, 10))
      }
    });
  } catch (error) {
    console.error("Automation reports error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Overview analytics metrics for reports dashboard
 */
async function getOverviewAnalytics(req, res) {
  try {
    const scopedUserId = getScopedUserId(req);
    const userClause = scopedUserId ? "WHERE user_id = ?" : "";
    const userParams = scopedUserId ? [scopedUserId] : [];

    // Campaigns summary
    const campStats = db.prepare(`
      SELECT 
        COUNT(*) as total_campaigns,
        COALESCE(SUM(total_contacts), 0) as total_contacts,
        COALESCE(SUM(sent_count), 0) as total_sent,
        COALESCE(SUM(failed_count), 0) as total_failed
      FROM campaigns
      ${userClause}
    `).get(...userParams);

    // Automation dispatches breakdown by stage
    const autoStats = db.prepare(`
      SELECT 
        COUNT(*) as total_dispatches,
        SUM(CASE WHEN trigger_type IN ('BEFORE_CHECKIN', 'PRE_CHECKIN') THEN 1 ELSE 0 END) as before_checkin_count,
        SUM(CASE WHEN trigger_type = 'ON_CHECKIN' THEN 1 ELSE 0 END) as on_checkin_count,
        SUM(CASE WHEN trigger_type IN ('ON_CHECKOUT', 'CHECKOUT') THEN 1 ELSE 0 END) as on_checkout_count,
        SUM(CASE WHEN trigger_type = 'AFTER_CHECKOUT' THEN 1 ELSE 0 END) as after_checkout_count,
        SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) as sent_success,
        SUM(CASE WHEN status != 'SENT' THEN 1 ELSE 0 END) as sent_failed
      FROM automated_booking_dispatches
      ${userClause}
    `).get(...userParams);

    // Active scheduled count
    const scheduledStats = db.prepare(`
      SELECT COUNT(*) as count FROM campaigns 
      ${userClause ? userClause + " AND status = 'SCHEDULED'" : "WHERE status = 'SCHEDULED'"}
    `).get(...userParams);

    // Recipient delivery status breakdown (Delivered vs Read vs Failed)
    const recipientStats = db.prepare(`
      SELECT 
        SUM(CASE WHEN r.status = 'DELIVERED' THEN 1 ELSE 0 END) as count_delivered,
        SUM(CASE WHEN r.status = 'READ' THEN 1 ELSE 0 END) as count_read,
        SUM(CASE WHEN r.status = 'FAILED' THEN 1 ELSE 0 END) as count_failed,
        SUM(CASE WHEN r.status = 'SENT' THEN 1 ELSE 0 END) as count_sent
      FROM campaign_recipients r
      LEFT JOIN campaigns c ON r.campaign_id = c.id
      ${userClause ? "WHERE c.user_id = ?" : ""}
    `).get(...userParams);

    const totalSent = campStats.total_sent + (autoStats.sent_success || 0);
    const totalFailed = (campStats.total_failed || 0) + (autoStats.sent_failed || 0) + (recipientStats.count_failed || 0);
    const totalAttempted = totalSent + totalFailed;
    const deliveryRate = totalAttempted > 0 ? ((totalSent / totalAttempted) * 100).toFixed(1) : "100.0";

    const totalDelivered = recipientStats.count_delivered || totalSent;
    const totalRead = recipientStats.count_read || 0;

    return res.status(200).json({
      success: true,
      data: {
        // Top-level convenience properties for UI consumption
        totalBroadcasts: campStats.total_campaigns || 0,
        totalRecipients: campStats.total_contacts || 0,
        totalDelivered: totalDelivered,
        totalRead: totalRead,
        totalFailed: totalFailed,
        totalSent: totalSent,
        deliveryRate: `${deliveryRate}%`,
        activeScheduled: scheduledStats.count || 0,
        totalDispatches: autoStats.total_dispatches || 0,

        // Deep structured telemetry
        campaigns: campStats,
        automation: autoStats,
        overall: {
          totalSent,
          totalFailed,
          deliveryRate: parseFloat(deliveryRate)
        }
      }
    });
  } catch (error) {
    console.error("Overview analytics error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  getCampaignReports,
  exportCampaignReport,
  getAutomationReports,
  getOverviewAnalytics
};
