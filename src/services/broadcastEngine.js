const EventEmitter = require("events");
const fs = require("fs");
const path = require("path");
const { db } = require("../config/database");
const { sendTemplateMessage, sendTextMessage, uploadMedia } = require("./metaWhatsAppService");

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
  buildTemplateComponents(mappingConfig = {}, rowData = {}, templateName = "") {
    const cleanTplName = String(templateName || "").trim().toLowerCase();
    const components = [];

    // 1. Fetch template details from SQLite to inspect components (header, body, buttons)
    let tplRow = null;
    try {
      tplRow = db.prepare("SELECT * FROM templates WHERE name = ? OR meta_id = ? OR id = ? LIMIT 1").get(templateName, templateName, templateName);
    } catch (e) {}

    let tplComponents = [];
    if (tplRow && tplRow.components) {
      try {
        tplComponents = JSON.parse(tplRow.components);
      } catch (e) {}
    }

    // 2. Process HEADER component if required by template or provided by user
    const headerComp = tplComponents.find(c => String(c.type || "").toUpperCase() === "HEADER");
    let headerMediaUrl = (mappingConfig?.headerMediaUrl || "").trim();
    let headerMediaId = (mappingConfig?.headerMediaId || "").trim();
    let headerFormat = "IMAGE";

    if (headerComp) {
      headerFormat = (headerComp.format || "IMAGE").toUpperCase();
      if (!headerMediaUrl && !headerMediaId) {
        headerMediaUrl = headerComp.example?.header_handle?.[0] || "";
      }
    }

    // If headerMediaUrl is actually a numeric Meta Media ID, treat as ID
    if (!headerMediaId && /^\d{10,}$/.test(headerMediaUrl)) {
      headerMediaId = headerMediaUrl;
      headerMediaUrl = "";
    }

    // Auto-detect and resolve Google Drive share links
    if (headerMediaUrl && headerMediaUrl.includes("drive.google.com/file/d/")) {
      const match = headerMediaUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        headerMediaUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
      }
    }

    if ((headerMediaId || headerMediaUrl) && (headerComp || mappingConfig?.headerMediaUrl || mappingConfig?.headerMediaId)) {
      const mediaType = headerFormat.toLowerCase(); // "image", "document", "video"
      if (["image", "document", "video"].includes(mediaType)) {
        const paramItem = { type: mediaType };
        if (headerMediaId) {
          paramItem[mediaType] = { id: headerMediaId };
        } else {
          paramItem[mediaType] = { link: headerMediaUrl };
        }
        components.push({
          type: "header",
          parameters: [paramItem]
        });
      }
    }

    // 3. Process BODY parameters
    const bodyParams = mappingConfig?.bodyParams;

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

    // Generic dynamic parameter builder for ANY template
    if (Array.isArray(bodyParams) && bodyParams.length > 0) {
      const isNamed = mappingConfig.parameterFormat === "NAMED";
      const paramKeys = mappingConfig.paramKeys || [];

      const parameters = bodyParams.map((param, index) => {
        let col = typeof param === "object" ? param.col : param;
        let key = typeof param === "object" ? param.key : (paramKeys[index] || String(index + 1));
        let val = "";

        if (col && rowData[col] !== undefined) {
          val = String(rowData[col]).trim();
        } else if (col) {
          const foundKey = Object.keys(rowData).find(k => k.trim().toLowerCase() === String(col).trim().toLowerCase());
          if (foundKey && rowData[foundKey] !== undefined) {
            val = String(rowData[foundKey]).trim();
          }
        }

        // Smart fallback if variable column was unmapped or empty
        if (!val) {
          const cleanKey = String(key).toLowerCase();
          if (cleanKey === "1" || /name|guest|customer/i.test(cleanKey)) {
            val = rowData.Name || rowData.name || rowData["Full Name"] || rowData.guest || "";
          } else if (cleanKey === "2" || /restaurant|property|resort/i.test(cleanKey)) {
            val = rowData.Restaurant || rowData.restaurant || rowData.Property || rowData.property || "";
          }
        }

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
    } else if (tplRow && tplRow.variables) {
      // Auto-fallback: if template has variables in DB, auto-populate them from rowData
      try {
        const vars = JSON.parse(tplRow.variables);
        if (Array.isArray(vars) && vars.length > 0) {
          const parameters = vars.map((v, idx) => {
            const varKey = String(v.key || idx + 1);
            let val = "";
            if (varKey === "1" || /name/i.test(v.name || "")) {
              val = rowData.Name || rowData.name || rowData["Full Name"] || "";
            } else if (varKey === "2" || /property|resort|restaurant/i.test(v.name || "")) {
              val = rowData.Property || rowData.property || rowData.Restaurant || rowData.restaurant || "";
            } else if (varKey === "3" || /link|url/i.test(v.name || "")) {
              val = rowData.Link || rowData.link || rowData.URL || "";
            }
            if (!val && v.example) val = String(v.example);
            if (!val) val = "—";

            const pObj = { type: "text", text: val };
            if (!/^\d+$/.test(varKey)) pObj.parameter_name = varKey;
            return pObj;
          });

          components.push({
            type: "body",
            parameters: parameters
          });
        }
      } catch (e) {}
    }

    return components;
  }

  /**
   * Starts or resumes a broadcast campaign
   */
  async startCampaign(campaignId, overrideDelayMs = null) {
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign '${campaignId}' not found.`);
    }

    if (this.activeJobs.has(campaignId) && this.activeJobs.get(campaignId).running) {
      throw new Error(`Campaign '${campaign.name}' is already currently running.`);
    }

    if (overrideDelayMs !== null && overrideDelayMs !== undefined) {
      const parsedDelay = parseInt(overrideDelayMs, 10);
      if (!isNaN(parsedDelay) && parsedDelay >= 0) {
        db.prepare("UPDATE campaigns SET delay_ms = ? WHERE id = ?").run(parsedDelay, campaignId);
        campaign.delay_ms = parsedDelay;
      }
    }

    const resolvedDelay = (campaign.delay_ms !== undefined && campaign.delay_ms !== null) ? campaign.delay_ms : 250;

    // Check pending vs failed recipients for retry support
    const pendingCount = db.prepare("SELECT COUNT(*) as c FROM campaign_recipients WHERE campaign_id = ? AND status = 'PENDING'").get(campaignId).c;
    if (pendingCount === 0) {
      const failedCount = db.prepare("SELECT COUNT(*) as c FROM campaign_recipients WHERE campaign_id = ? AND status = 'FAILED'").get(campaignId).c;
      if (failedCount > 0) {
        db.prepare("UPDATE campaign_recipients SET status = 'PENDING', error_message = NULL WHERE campaign_id = ? AND status = 'FAILED'").run(campaignId);
        db.prepare("UPDATE campaigns SET failed_count = 0 WHERE id = ?").run(campaignId);
      }
    }

    const jobState = {
      paused: false,
      cancelled: false,
      running: true,
      delayMs: resolvedDelay
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
      delayMs: resolvedDelay,
      message: `Campaign '${campaign.name}' started with ${resolvedDelay}ms dispatch throttle delay.`
    });

    // Run queue in background (async worker)
    this.runQueue(campaign, jobState).catch(err => {
      console.error(`Error in broadcast queue for campaign ${campaignId}:`, err);
    });

    return { success: true, message: `Campaign '${campaign.name}' is now running.`, delayMs: resolvedDelay };
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

    // Pre-resolve and upload header media to Meta CDN once for the campaign
    // This avoids Meta webhook failures ("Media upload error") when using external URLs or sample handles
    if (campaign.message_type === "TEMPLATE" && !mappingConfig.headerMediaId) {
      try {
        const tplName = (campaign.template_name || "").trim();
        let tplRow = db.prepare("SELECT * FROM templates WHERE name = ? OR meta_id = ? OR id = ? LIMIT 1").get(tplName, tplName, tplName);
        let tplComponents = [];
        if (tplRow && tplRow.components) {
          try { tplComponents = JSON.parse(tplRow.components); } catch (e) {}
        }
        const headerComp = tplComponents.find(c => String(c.type || "").toUpperCase() === "HEADER");
        if (headerComp) {
          let mediaUrl = (mappingConfig.headerMediaUrl || "").trim() || headerComp.example?.header_handle?.[0] || "";
          if (/^\d{10,}$/.test(mediaUrl)) {
            mappingConfig.headerMediaId = mediaUrl;
          } else if (mediaUrl) {
            let fileBuffer = null;
            let mimeType = headerComp.format?.toLowerCase() === "document" ? "application/pdf" : "image/jpeg";
            let fileName = "header_media.jpg";

            // 1. Check if it points to a local file in public/uploads/
            if (mediaUrl.includes("/uploads/")) {
              const filename = mediaUrl.split("/uploads/")[1]?.split("?")[0];
              if (filename) {
                const localPath = path.join(__dirname, "..", "..", "public", "uploads", filename);
                if (fs.existsSync(localPath)) {
                  fileBuffer = fs.readFileSync(localPath);
                  fileName = filename;
                }
              }
            }

            // 2. Otherwise fetch from remote URL
            if (!fileBuffer) {
              if (mediaUrl.includes("drive.google.com/file/d/")) {
                const match = mediaUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
                if (match && match[1]) {
                  mediaUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
                }
              }
              const fetchRes = await fetch(mediaUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
              if (fetchRes.ok) {
                fileBuffer = Buffer.from(await fetchRes.arrayBuffer());
                const ct = fetchRes.headers.get("content-type");
                if (ct && !ct.includes("text/html")) mimeType = ct;
              }
            }

            if (fileBuffer) {
              const uploadRes = await uploadMedia({ fileBuffer, fileName, mimeType });
              if (uploadRes && uploadRes.mediaId) {
                mappingConfig.headerMediaId = uploadRes.mediaId;
                db.prepare("UPDATE campaigns SET mapping_config = ? WHERE id = ?").run(
                  JSON.stringify(mappingConfig),
                  campaignId
                );
                console.log(`[Broadcast] Pre-uploaded header media to Meta CDN. Media ID: ${uploadRes.mediaId} for campaign ${campaignId}`);
              }
            }
          }
        }
      } catch (mediaErr) {
        console.warn(`[Broadcast] Note: Header media pre-upload failed:`, mediaErr.message);
      }
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
      SET status = 'FAILED', error_message = ?, error_code = ?, rendered_message = ?, failed_at = CURRENT_TIMESTAMP, sent_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);

    const incrementSent = db.prepare(`
      UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = ?
    `);

    const incrementFailed = db.prepare(`
      UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = ?
    `);

    const fetchPendingBatch = db.prepare(`
      SELECT * FROM campaign_recipients 
      WHERE campaign_id = ? AND status = 'PENDING' 
      ORDER BY id ASC LIMIT 50
    `);

    try {
      while (jobState.running) {
        if (jobState.cancelled) {
          db.prepare("UPDATE campaigns SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
          this.emit("campaign:status", { campaignId, status: "CANCELLED", message: "Campaign was stopped by user." });
          break;
        }

        while (jobState.paused && jobState.running && !jobState.cancelled) {
          await this.sleep(500);
        }

        if (jobState.cancelled || !jobState.running) break;

        // Fetch bounded batch of 50 pending recipients (O(1) memory, 98% reduced DB lock overhead)
        const batch = fetchPendingBatch.all(campaignId);

        if (!batch || batch.length === 0) {
          // All recipients processed!
          db.prepare("UPDATE campaigns SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(campaignId);
          const finalCamp = db.prepare("SELECT sent_count, failed_count, valid_contacts FROM campaigns WHERE id = ?").get(campaignId);
          this.emit("campaign:status", {
            campaignId,
            status: "COMPLETED",
            sent: finalCamp?.sent_count || 0,
            failed: finalCamp?.failed_count || 0,
            total: finalCamp?.valid_contacts || campaign.valid_contacts,
            message: `Campaign '${campaign.name}' finished broadcasting.`
          });
          break;
        }

        for (const recipient of batch) {
          if (jobState.cancelled || !jobState.running) break;
          while (jobState.paused && jobState.running && !jobState.cancelled) {
            await this.sleep(500);
          }
          if (jobState.cancelled || !jobState.running) break;

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

            const curStats = db.prepare("SELECT sent_count, failed_count, valid_contacts FROM campaigns WHERE id = ?").get(campaignId);
            this.emit("broadcast:progress", {
              campaignId,
              recipientId: recipient.id,
              phone: recipient.clean_phone,
              name: recipient.contact_name,
              status: "SENT",
              messageId: sendResult.messageId,
              sent: curStats?.sent_count || 1,
              failed: curStats?.failed_count || 0,
              total: curStats?.valid_contacts || campaign.valid_contacts,
              lastRecipient: recipient.contact_name || recipient.clean_phone,
              metaMessageId: sendResult.messageId
            });
          } catch (err) {
            const errCode = String(err.code || err.subcode || err.status || "");
            console.warn(`[Broadcast] Message failed to ${recipient.clean_phone} (${errCode}):`, err.message);
            updateRecipientFail.run(err.message || "Failed to send", errCode || null, "", recipient.id);
            incrementFailed.run(campaignId);

            const curStats = db.prepare("SELECT sent_count, failed_count, valid_contacts FROM campaigns WHERE id = ?").get(campaignId);
            this.emit("broadcast:progress", {
              campaignId,
              recipientId: recipient.id,
              phone: recipient.clean_phone,
              name: recipient.contact_name,
              status: "FAILED",
              error: err.message,
              errorCode: errCode,
              sent: curStats?.sent_count || 0,
              failed: curStats?.failed_count || 1,
              total: curStats?.valid_contacts || campaign.valid_contacts,
              lastRecipient: recipient.contact_name || recipient.clean_phone
            });
          }

          // Throttle pacing to respect Meta Cloud API rate limits
          const currentDelay = (jobState && jobState.delayMs !== undefined) ? jobState.delayMs : (campaign.delay_ms || 250);
          if (currentDelay > 0) {
            await this.sleep(currentDelay);
          }
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
   * Updates dispatch throttle delay dynamically for a campaign
   */
  setCampaignDelay(campaignId, delayMs) {
    const parsed = parseInt(delayMs, 10);
    if (isNaN(parsed) || parsed < 0) {
      throw new Error("Invalid throttle delay in milliseconds. Must be a non-negative integer.");
    }

    db.prepare("UPDATE campaigns SET delay_ms = ? WHERE id = ?").run(parsed, campaignId);
    const job = this.activeJobs.get(campaignId);
    if (job) {
      job.delayMs = parsed;
    }

    this.emit("campaign:throttle", {
      campaignId,
      delayMs: parsed,
      message: `Dispatch throttle delay updated to ${parsed}ms.`
    });

    return { success: true, delayMs: parsed };
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
  resumeCampaign(campaignId, overrideDelayMs = null) {
    if (overrideDelayMs !== null && overrideDelayMs !== undefined) {
      this.setCampaignDelay(campaignId, overrideDelayMs);
    }
    const job = this.activeJobs.get(campaignId);
    if (job && job.running) {
      job.paused = false;
      db.prepare("UPDATE campaigns SET status = 'RUNNING' WHERE id = ?").run(campaignId);
      this.emit("campaign:status", {
        campaignId,
        status: "RUNNING",
        delayMs: job.delayMs,
        message: `Campaign resumed with ${job.delayMs}ms dispatch throttle delay.`
      });
      return { success: true, message: "Campaign resumed successfully.", delayMs: job.delayMs };
    }
    // If not in memory active job, start it afresh
    return this.startCampaign(campaignId, overrideDelayMs);
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
