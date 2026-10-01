const { db } = require("../config/database");
const { generateCampaignReportExcel } = require("../services/excelService");

/**
 * List all campaigns with status and summary metrics
 */
async function listCampaigns(req, res) {
  try {
    const campaigns = db.prepare(`
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'SENT') as current_sent,
        (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'FAILED') as current_failed,
        (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'PENDING') as current_pending
      FROM campaigns c
      ORDER BY c.created_at DESC
    `).all();

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
 * Get detailed campaign info and list of recipients
 */
async function getCampaignDetails(req, res) {
  try {
    const { campaignId } = req.params;
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);

    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found." });
    }

    const recipients = db.prepare(`
      SELECT id, campaign_id, phone_number, clean_phone, contact_name, status, meta_message_id, error_message, sent_at
      FROM campaign_recipients
      WHERE campaign_id = ?
      ORDER BY id ASC
    `).all(campaignId);

    return res.status(200).json({
      success: true,
      data: {
        campaign,
        recipients
      }
    });
  } catch (error) {
    console.error("Get campaign details error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Deletes a campaign and cascades recipients
 */
async function deleteCampaign(req, res) {
  try {
    const { campaignId } = req.params;
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
 * Exports campaign delivery results as an Excel workbook
 */
async function exportCampaignReport(req, res) {
  try {
    const { campaignId } = req.params;
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);

    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found." });
    }

    const recipients = db.prepare(`
      SELECT phone_number, clean_phone, contact_name, status, meta_message_id, error_message, sent_at
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
