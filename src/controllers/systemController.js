const timeUtil = require("../utils/timeUtil");
const { setSetting } = require("../config/database");

/**
 * Get current system date and time
 * Consistently formatted for both local dev and cloud deployments
 */
async function getSystemTime(req, res) {
  try {
    const tz = req.query.tz || null;
    const timeData = timeUtil.getSystemTime(tz);

    return res.status(200).json({
      success: true,
      data: {
        ...timeData,
        today: timeUtil.getTodayDateString(tz),
        tomorrow: timeUtil.getOffsetDateString(1, tz),
        yesterday: timeUtil.getOffsetDateString(-1, tz)
      }
    });
  } catch (error) {
    console.error("getSystemTime error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Update system timezone configuration
 */
async function updateTimezone(req, res) {
  try {
    const { timezone } = req.body || {};
    if (!timezone || typeof timezone !== "string") {
      return res.status(400).json({ success: false, message: "Valid timezone identifier is required (e.g. 'Asia/Kolkata')." });
    }

    const trimmed = timezone.trim();
    // Validate timezone string with Intl
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    } catch (tzErr) {
      return res.status(400).json({ success: false, message: `Invalid timezone identifier: '${trimmed}'` });
    }

    setSetting("APP_TIMEZONE", trimmed);

    const updatedTime = timeUtil.getSystemTime(trimmed);
    return res.status(200).json({
      success: true,
      message: `System timezone updated to ${trimmed}`,
      data: updatedTime
    });
  } catch (error) {
    console.error("updateTimezone error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  getSystemTime,
  updateTimezone
};
