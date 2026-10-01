const EventEmitter = require("events");
const { db } = require("../config/database");
const { sendTemplateMessage, sendTextMessage } = require("./metaWhatsAppService");

class BroadcastEngine extends EventEmitter {
  constructor() {
    super();
    // Maps campaignId to state: { paused: boolean, cancelled: boolean, running: boolean }
    this.activeJobs = new Map();
  }

  /**
   * Helper to sleep between message dispatches
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Renders direct text with {Variable} or {{Variable}} placeholders
   */
  interpolateText(templateText, rowData) {
    if (!templateText) return "";
    return templateText.replace(/\{\{?([^{}]+)\}?\}/g, (match, key) => {
      const trimmedKey = key.trim();
      return rowData[trimmedKey] !== undefined ? String(rowData[trimmedKey]) : match;
    });
  }

  /**
   * Builds template components array from mapping configuration
   */
  buildTemplateComponents(mappingConfig, rowData, templateName = "") {
    const cleanTplName = String(templateName || "").trim().toLowerCase();
    const components = [];

    // If no mappingConfig or empty bodyParams, return empty array (0 parameters)
    const bodyParams = mappingConfig?.bodyParams;
    if (!bodyParams || (Array.isArray(bodyParams) && bodyParams.length === 0)) {
      return [];
    }

    // Specific smart handling for kt_invitation_ (1059862786867912)
    if (cleanTplName === "kt_invitation_" || cleanTplName === "1059862786867912" || cleanTplName.includes("invitation")) {
      const getParamCol = (idx) => {
        if (Array.isArray(bodyParams) && bodyParams[idx]) {
          const p = bodyParams[idx];
          return typeof p === "object" ? p.col : p;
        }
        return null;
      };

      const col1 = getParamCol(0);
      const col2 = getParamCol(1);
      const col3 = getParamCol(2);

      let p1 = col1 ? rowData[col1] : (rowData.Name || rowData.name || rowData["Full Name"]);
      let p2 = col2 ? rowData[col2] : (rowData.Restaurant || rowData.restaurant || rowData["Business Name"]);
      let p3 = col3 ? rowData[col3] : (rowData.Link || rowData.link || rowData.URL || rowData.Website);

      if (!p1 || !String(p1).trim()) p1 = "Valued Partner";
      if (!p2 || !String(p2).trim()) p2 = "your restaurant";
      if (!p3 || !String(p3).trim()) p3 = "https://konkantrip.com";

      // If kt_restaurant_invitation (NAMED format: name, restaurant, link)
      if (cleanTplName === "kt_restaurant_invitation" || cleanTplName === "1757343188867100") {
        components.push({
          type: "body",
          parameters: [
            { type: "text", parameter_name: "name", text: String(p1).trim() },
            { type: "text", parameter_name: "restaurant", text: String(p2).trim() },
            { type: "text", parameter_name: "link", text: String(p3).trim() }
          ]
        });
        return components;
      }

      // Default positional for kt_invitation_
      components.push({
        type: "body",
        parameters: [
          { type: "text", text: String(p1).trim() },
          { type: "text", text: String(p2).trim() },
          { type: "text", text: String(p3).trim() }
        ]
      });
      return components;
    }

    // Generic dynamic parameter builder for ANY template number or name
    if (Array.isArray(bodyParams) && bodyParams.length > 0) {
      const isNamed = mappingConfig.parameterFormat === "NAMED";
      const paramKeys = mappingConfig.paramKeys || [];

      const parameters = bodyParams.map((param, index) => {
        let col = typeof param === "object" ? param.col : param;
        let key = typeof param === "object" ? param.key : (paramKeys[index] || String(index + 1));
        let val = (col && rowData[col] !== undefined) ? String(rowData[col]).trim() : "";

        if (!val) {
          val = "—";
        }

        const paramObj = {
          type: "text",
          text: val
        };

        // If template requires NAMED parameters, attach parameter_name
        if (isNamed || (key && !/^\d+$/.test(key))) {
          paramObj.parameter_name = String(key);
        }

        return paramObj;
      });

      components.push({
        type: "body",
        parameters: parameters
      });

      // Special button support for OTP/auth templates if required
      if (cleanTplName === "konkantrip_auth" && parameters.length > 0) {
        components.push({
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [
            { type: "text", text: parameters[0].text }
          ]
        });
      }
    }

    return components;
  }

  /**
   * Starts or resumes a broadcast campaign
   */
  async startCampaign(campaignId) {
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign '${campaignId}' not found.`);
    }

    if (this.activeJobs.has(campaignId) && this.activeJobs.get(campaignId).running) {
      throw new Error(`Campaign '${campaign.name}' is already currently running.`);
    }

    const jobState = {
      paused: false,
      cancelled: false,
      running: true
    };
    this.activeJobs.set(campaignId, jobState);

    // Update campaign status to RUNNING in database
    db.prepare(`
      UPDATE campaigns 
      SET status = 'RUNNING', started_at = COALESCE(started_at, CURRENT_TIMESTAMP) 
      WHERE id = ?
    `).run(campaignId);

    this.emit("campaign:status", {
      campaignId,
      status: "RUNNING",
      message: `Campaign '${campaign.name}' started.`
    });

    // Run queue in background (async worker)
    this.runQueue(campaign, jobState).catch(err => {
      console.error(`Error in broadcast queue for campaign ${campaignId}:`, err);
    });

    return { success: true, message: `Campaign '${campaign.name}' is now running.` };
  }

  /**
   * Internal queue runner
   */
  async runQueue(campaign, jobState) {
    const campaignId = campaign.id;
    let mappingConfig = {};
    try {
      mappingConfig = campaign.mapping_config ? JSON.parse(campaign.mapping_config) : {};
    } catch {
      mappingConfig = {};
    }

    const delayMs = campaign.delay_ms || 250;

    // Prepared statements for updates
    const updateRecipientSuccess = db.prepare(`
      UPDATE campaign_recipients 
      SET status = 'SENT', meta_message_id = ?, rendered_message = ?, sent_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);

    const updateRecipientFail = db.prepare(`
      UPDATE campaign_recipients 
      SET status = 'FAILED', error_message = ?, rendered_message = ?, sent_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);

    const incrementSent = db.prepare(`
      UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = ?
    `);

    const incrementFailed = db.prepare(`
      UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = ?
    `);

    try {
      while (jobState.running) {
        if (jobState.cancelled) {
          db.prepare("UPDATE campaigns SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
          this.emit("campaign:status", { campaignId, status: "CANCELLED", message: "Campaign was stopped by user." });
          break;
        }

        if (jobState.paused) {
          await this.sleep(500);
          continue;
        }

        // Fetch next pending recipient
        const recipient = db.prepare(`
          SELECT * FROM campaign_recipients 
          WHERE campaign_id = ? AND status = 'PENDING' 
          ORDER BY id ASC LIMIT 1
        `).get(campaignId);

        if (!recipient) {
          // All recipients processed!
          db.prepare("UPDATE campaigns SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
          this.emit("campaign:status", {
            campaignId,
            status: "COMPLETED",
            message: `Campaign '${campaign.name}' finished broadcasting.`
          });
          break;
        }

        let rowData = {};
        try {
          rowData = recipient.raw_data ? JSON.parse(recipient.raw_data) : {};
        } catch {
          rowData = {};
        }

        // Dispatch via Meta Cloud API
        try {
          let sendResult;
          let renderedContent = "";

          if (campaign.message_type === "TEMPLATE") {
            let tplName = (campaign.template_name || "kt_restaurant_invitation").trim();
            let tplLang = campaign.template_language;

            if (tplName === "1757343188867100" || tplName.toLowerCase().includes("restaurant")) {
              tplName = "kt_restaurant_invitation";
              tplLang = "en";
            }

            const components = this.buildTemplateComponents(mappingConfig, rowData, tplName);
            renderedContent = JSON.stringify(components);

            sendResult = await sendTemplateMessage({
              to: recipient.clean_phone,
              templateName: tplName,
              languageCode: tplLang || "en",
              components: components
            });
          } else {
            // Direct Text Message
            renderedContent = this.interpolateText(campaign.message_body, rowData);

            sendResult = await sendTextMessage({
              to: recipient.clean_phone,
              body: renderedContent
            });
          }

          // Mark recipient as SENT
          updateRecipientSuccess.run(sendResult.messageId || null, renderedContent, recipient.id);
          incrementSent.run(campaignId);

          this.emit("broadcast:progress", {
            campaignId,
            recipientId: recipient.id,
            phone: recipient.clean_phone,
            name: recipient.contact_name,
            status: "SENT",
            messageId: sendResult.messageId
          });
        } catch (err) {
          console.warn(`[Broadcast] Message failed to ${recipient.clean_phone}:`, err.message);
          updateRecipientFail.run(err.message || "Failed to send", "", recipient.id);
          incrementFailed.run(campaignId);

          this.emit("broadcast:progress", {
            campaignId,
            recipientId: recipient.id,
            phone: recipient.clean_phone,
            name: recipient.contact_name,
            status: "FAILED",
            error: err.message
          });
        }

        // Throttle to respect Meta Cloud API rate limits
        if (delayMs > 0) {
          await this.sleep(delayMs);
        }
      }
    } catch (err) {
      console.error(`Fatal queue error for campaign ${campaignId}:`, err);
      db.prepare("UPDATE campaigns SET status = 'FAILED' WHERE id = ?").run(campaignId);
      this.emit("campaign:status", { campaignId, status: "FAILED", message: err.message });
    } finally {
      jobState.running = false;
      this.activeJobs.delete(campaignId);
    }
  }

  /**
   * Pauses an ongoing campaign
   */
  pauseCampaign(campaignId) {
    const job = this.activeJobs.get(campaignId);
    if (!job || !job.running) {
      throw new Error(`Campaign '${campaignId}' is not currently running.`);
    }
    job.paused = true;
    db.prepare("UPDATE campaigns SET status = 'PAUSED' WHERE id = ?").run(campaignId);
    this.emit("campaign:status", { campaignId, status: "PAUSED", message: "Campaign paused." });
    return { success: true, message: "Campaign paused successfully." };
  }

  /**
   * Resumes a paused campaign
   */
  resumeCampaign(campaignId) {
    const job = this.activeJobs.get(campaignId);
    if (job && job.running) {
      job.paused = false;
      db.prepare("UPDATE campaigns SET status = 'RUNNING' WHERE id = ?").run(campaignId);
      this.emit("campaign:status", { campaignId, status: "RUNNING", message: "Campaign resumed." });
      return { success: true, message: "Campaign resumed successfully." };
    }
    // If not in memory active job, start it afresh
    return this.startCampaign(campaignId);
  }

  /**
   * Cancels/Stops a campaign
   */
  cancelCampaign(campaignId) {
    const job = this.activeJobs.get(campaignId);
    if (job) {
      job.cancelled = true;
      job.running = false;
    }
    db.prepare("UPDATE campaigns SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
    this.emit("campaign:status", { campaignId, status: "CANCELLED", message: "Campaign cancelled." });
    return { success: true, message: "Campaign cancelled successfully." };
  }

  /**
   * Checks if a campaign is actively running
   */
  isCampaignRunning(campaignId) {
    const job = this.activeJobs.get(campaignId);
    return Boolean(job && job.running && !job.paused);
  }
}

// Export singleton instance
const broadcastEngine = new BroadcastEngine();
module.exports = broadcastEngine;
