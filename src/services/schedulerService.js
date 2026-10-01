const { db } = require("../config/database");
const broadcastEngine = require("./broadcastEngine");

class SchedulerService {
  constructor() {
    this.intervalTimer = null;
    this.checkIntervalMs = 5000; // Check every 5 seconds
    this.isChecking = false;
  }

  /**
   * Initializes background scheduler timer
   */
  initScheduler() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }

    console.log("[Scheduler] Background campaign scheduler started (polling every 5s)");

    // Run immediate check for any overdue scheduled campaigns on startup
    this.checkScheduledCampaigns().catch(err => {
      console.error("[Scheduler] Initial check error:", err);
    });

    this.intervalTimer = setInterval(() => {
      this.checkScheduledCampaigns().catch(err => {
        console.error("[Scheduler] Polling check error:", err);
      });
    }, this.checkIntervalMs);

    if (this.intervalTimer.unref) {
      this.intervalTimer.unref();
    }
  }

  /**
   * Scans database for scheduled campaigns whose scheduled_at time has arrived
   */
  async checkScheduledCampaigns() {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const now = new Date();
      // Fetch all campaigns currently in SCHEDULED state
      const scheduledCampaigns = db.prepare(`
        SELECT id, name, scheduled_at, status, valid_contacts 
        FROM campaigns 
        WHERE status = 'SCHEDULED' AND scheduled_at IS NOT NULL
      `).all();

      for (const campaign of scheduledCampaigns) {
        const schedDate = new Date(campaign.scheduled_at);
        if (isNaN(schedDate.getTime())) {
          console.warn(`[Scheduler] Invalid scheduled_at for campaign ${campaign.id}:`, campaign.scheduled_at);
          continue;
        }

        // If scheduled time has arrived or passed (within current time)
        if (schedDate <= now) {
          console.log(`[Scheduler] 🚀 Triggering scheduled broadcast: '${campaign.name}' (${campaign.id}) scheduled for ${schedDate.toISOString()}`);
          
          try {
            await broadcastEngine.startCampaign(campaign.id);
            broadcastEngine.emit("campaign:status", {
              campaignId: campaign.id,
              status: "RUNNING",
              message: `Scheduled broadcast '${campaign.name}' has automatically launched.`
            });
          } catch (launchErr) {
            console.error(`[Scheduler] Failed to auto-launch campaign ${campaign.id}:`, launchErr.message);
            db.prepare("UPDATE campaigns SET status = 'FAILED' WHERE id = ?").run(campaign.id);
            broadcastEngine.emit("campaign:status", {
              campaignId: campaign.id,
              status: "FAILED",
              message: `Scheduled launch failed: ${launchErr.message}`
            });
          }
        }
      }
    } catch (err) {
      console.error("[Scheduler] Error in checkScheduledCampaigns:", err);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Reschedules an existing scheduled campaign
   */
  rescheduleCampaign(campaignId, newScheduledAt) {
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign '${campaignId}' not found.`);
    }

    if (campaign.status === "RUNNING") {
      throw new Error("Cannot reschedule a campaign that is currently running.");
    }

    const newDate = new Date(newScheduledAt);
    if (isNaN(newDate.getTime())) {
      throw new Error("Invalid date/time provided for scheduling.");
    }

    if (newDate <= new Date()) {
      throw new Error("Scheduled time must be in the future.");
    }

    const isoTime = newDate.toISOString();
    db.prepare(`
      UPDATE campaigns 
      SET status = 'SCHEDULED', scheduled_at = ? 
      WHERE id = ?
    `).run(isoTime, campaignId);

    broadcastEngine.emit("campaign:status", {
      campaignId,
      status: "SCHEDULED",
      scheduledAt: isoTime,
      message: `Campaign '${campaign.name}' rescheduled for ${newDate.toLocaleString()}.`
    });

    return {
      success: true,
      message: `Campaign rescheduled for ${newDate.toLocaleString()}.`,
      scheduledAt: isoTime
    };
  }

  /**
   * Cancels a scheduled campaign before it runs
   */
  cancelSchedule(campaignId) {
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign '${campaignId}' not found.`);
    }

    if (campaign.status !== "SCHEDULED") {
      throw new Error(`Campaign is in status '${campaign.status}', cannot cancel schedule.`);
    }

    db.prepare("UPDATE campaigns SET status = 'CANCELLED' WHERE id = ?").run(campaignId);

    broadcastEngine.emit("campaign:status", {
      campaignId,
      status: "CANCELLED",
      message: `Scheduled broadcast for '${campaign.name}' was cancelled.`
    });

    return {
      success: true,
      message: `Scheduled campaign '${campaign.name}' cancelled successfully.`
    };
  }

  /**
   * Runs a scheduled campaign immediately without waiting
   */
  async runScheduledNow(campaignId) {
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign '${campaignId}' not found.`);
    }

    if (campaign.status === "RUNNING") {
      throw new Error("Campaign is already running.");
    }

    return broadcastEngine.startCampaign(campaignId);
  }

  /**
   * Stop background scheduler
   */
  stopScheduler() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}

const schedulerService = new SchedulerService();
module.exports = schedulerService;
