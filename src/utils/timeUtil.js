const { getSetting } = require("../config/database");
const config = require("../config/env");

/**
 * Universal System Date & Time Utility
 * Works identically in local development (Windows/macOS/Linux)
 * and in cloud deployments (Docker, AWS, Render, Railway, GCP, Heroku, etc.)
 */
class TimeUtil {
  /**
   * Retrieves the configured application timezone (default: Asia/Kolkata)
   */
  getTimezone() {
    try {
      const dbTz = getSetting("APP_TIMEZONE");
      if (dbTz && dbTz.trim()) return dbTz.trim();
    } catch (e) {
      // Database not ready yet
    }
    return config.APP_TIMEZONE || process.env.APP_TIMEZONE || "Asia/Kolkata";
  }

  /**
   * Get detailed current system time snapshot in configured timezone
   */
  getSystemTime(overrideTz = null) {
    const tz = overrideTz || this.getTimezone();
    const now = new Date();

    // Formatter for YYYY-MM-DD
    const datePartsFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "long"
    });

    const parts = datePartsFormatter.formatToParts(now);
    const lookup = {};
    for (const p of parts) {
      lookup[p.type] = p.value;
    }

    const year = lookup.year;
    const month = lookup.month;
    const day = lookup.day;
    const hours = parseInt(lookup.hour, 10);
    const minutes = parseInt(lookup.minute, 10);
    const seconds = parseInt(lookup.second, 10);
    const weekday = lookup.weekday;

    const dateStr = `${year}-${month}-${day}`;
    const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    // 12-hour formatted version
    const humanFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: tz,
      dateStyle: "medium",
      timeStyle: "short"
    });

    const fullHumanFormatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    });

    // Detect server host timezone vs application timezone
    const hostTzOffsetMinutes = now.getTimezoneOffset();
    const isHostUtc = hostTzOffsetMinutes === 0;

    return {
      iso: now.toISOString(),
      timestamp: now.getTime(),
      timezone: tz,
      date: dateStr,
      time: timeStr,
      year: parseInt(year, 10),
      month: parseInt(month, 10),
      day: parseInt(day, 10),
      hours,
      minutes,
      seconds,
      dayOfWeek: weekday,
      formatted: fullHumanFormatter.format(now),
      shortFormatted: humanFormatter.format(now),
      isHostUtc,
      hostOffsetMinutes: -hostTzOffsetMinutes,
      utcOffset: this.getUtcOffsetString(tz, now)
    };
  }

  /**
   * Returns current date string as YYYY-MM-DD in configured timezone
   */
  getTodayDateString(overrideTz = null) {
    const tz = overrideTz || this.getTimezone();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(new Date());
  }

  /**
   * Returns date string YYYY-MM-DD offset by specified number of days
   * (e.g. +1 for tomorrow, -1 for yesterday) in configured timezone
   */
  getOffsetDateString(offsetDays = 1, overrideTz = null) {
    const tz = overrideTz || this.getTimezone();
    // Use target timezone day calculation to avoid edge-of-day boundary shifts
    const today = this.getTodayDateString(tz);
    const [y, m, d] = today.split("-").map(Number);
    // Create reference date at noon to prevent DST hour jitter
    const target = new Date(Date.UTC(y, m - 1, d + Number(offsetDays), 12, 0, 0));

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(target);
  }

  /**
   * Formats any given date/timestamp into YYYY-MM-DD in configured timezone
   */
  formatToDateString(dateVal, overrideTz = null) {
    if (!dateVal) return null;
    const tz = overrideTz || this.getTimezone();
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (isNaN(d.getTime())) return null;

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(d);
  }

  /**
   * Formats any date into a human readable string in configured timezone
   */
  formatDateTime(dateVal, overrideTz = null) {
    if (!dateVal) return "";
    const tz = overrideTz || this.getTimezone();
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);

    const formatter = new Intl.DateTimeFormat("en-IN", {
      timeZone: tz,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
    return formatter.format(d);
  }

  /**
   * Helper to format UTC offset string (e.g. "+05:30")
   */
  getUtcOffsetString(timeZone, date = new Date()) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "shortOffset"
      }).formatToParts(date);
      const tzPart = parts.find(p => p.type === "timeZoneName");
      if (tzPart && tzPart.value) {
        return tzPart.value.replace("GMT", "");
      }
    } catch (e) {
      // Fallback
    }
    return "+05:30";
  }
}

const timeUtil = new TimeUtil();
module.exports = timeUtil;
