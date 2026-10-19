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
   * Smart universal date parser that properly resolves Indian Standard Time (IST)
   * and SQLite UTC representations without timezone drift.
   */
  parseDateSmart(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === "number") {
      // 10 digits = seconds epoch (e.g. from Meta webhook), 13 digits = ms epoch
      return new Date(val < 1e11 ? val * 1000 : val);
    }
    const str = String(val).trim();
    if (!str) return null;

    if (/^\d{10}$/.test(str)) {
      return new Date(parseInt(str, 10) * 1000);
    }
    if (/^\d{13}$/.test(str)) {
      return new Date(parseInt(str, 10));
    }
    // SQLite format YYYY-MM-DD HH:mm:ss without timezone -> stored in UTC
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(str)) {
      return new Date(str.replace(" ", "T") + "Z");
    }
    // Datetime-local format YYYY-MM-DDTHH:mm without timezone -> user entered Indian time
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(str)) {
      return new Date(str + "+05:30");
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Formats any date into a standardized Indian Standard Time (IST) string:
   * e.g. "19 Oct 2026, 02:30 PM"
   */
  formatIndianDateTime(dateVal, includeSeconds = false) {
    const d = this.parseDateSmart(dateVal);
    if (!d) return "";

    const options = {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    };
    if (includeSeconds) {
      options.second = "2-digit";
    }

    return new Intl.DateTimeFormat("en-IN", options).format(d);
  }

  /**
   * Formats time only in Indian Standard Time (e.g. "02:30 PM")
   */
  formatIndianTime(dateVal, includeSeconds = false) {
    const d = this.parseDateSmart(dateVal);
    if (!d) return "";

    const options = {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    };
    if (includeSeconds) {
      options.second = "2-digit";
    }

    return new Intl.DateTimeFormat("en-IN", options).format(d);
  }

  /**
   * Formats date only in Indian Standard Time (e.g. "19 Oct 2026")
   */
  formatIndianDate(dateVal) {
    const d = this.parseDateSmart(dateVal);
    if (!d) return "";

    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(d);
  }

  /**
   * Returns current Indian timestamp formatted as "YYYY-MM-DD HH:mm:ss"
   */
  getIndianTimestampString(dateVal = new Date()) {
    const d = this.parseDateSmart(dateVal) || new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    return formatter.format(d).replace(",", "");
  }

  /**
   * Formats date for HTML datetime-local inputs in Indian Standard Time (YYYY-MM-DDTHH:mm)
   */
  getIndianCurrentInputString(dateVal = new Date()) {
    const d = this.parseDateSmart(dateVal) || new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(d);

    const lookup = {};
    parts.forEach(p => { lookup[p.type] = p.value; });
    return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}`;
  }

  /**
   * Formats any date into a human readable string in configured timezone
   */
  formatDateTime(dateVal, overrideTz = null) {
    return this.formatIndianDateTime(dateVal);
  }

  /**
   * Helper to format UTC offset string (e.g. "+05:30")
   */
  getUtcOffsetString(timeZone, date = new Date()) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
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
