const { db, getSetting, setSetting } = require("../config/database");
const googleSheetService = require("./googleSheetService");
const { sendTemplateMessage, cleanPhone } = require("./metaWhatsAppService");
const timeUtil = require("../utils/timeUtil");

/**
 * Helper to calculate target calendar date with day offsets
 * e.g. baseDate = "2026-10-15", offsetDays = -1 -> "2026-10-14"
 */
function calculateTargetDate(baseDateStr, offsetDays = 0) {
  if (!baseDateStr) return null;
  const parts = String(baseDateStr).trim().split("-").map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return null;
  }
  const [y, m, d] = parts;
  const target = new Date(Date.UTC(y, m - 1, d + Number(offsetDays), 12, 0, 0));
  const year = target.getUTCFullYear();
  const month = String(target.getUTCMonth() + 1).padStart(2, "0");
  const day = String(target.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parses time string (HH:MM or H:MM) into minutes of the day (0 - 1439)
 */
function parseTimeToMinutes(tStr) {
  if (!tStr) return 0;
  const parts = String(tStr).trim().split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

/**
 * Normalizes time string to standard 2-digit HH:MM
 */
function formatNormalizedTime(tStr) {
  if (!tStr) return "10:00";
  const parts = String(tStr).trim().split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

class BookingAutomationService {
  constructor() {
    this.isEvaluating = false;
  }

  /**
   * Returns current date formatted as YYYY-MM-DD in application timezone
   */
  getTodayDateString() {
    return timeUtil.getTodayDateString();
  }

  /**
   * Returns current system time HH:MM in application timezone
   */
  getCurrentTimeMinutes() {
    const t = timeUtil.getSystemTime();
    return `${String(t.hours).padStart(2, "0")}:${String(t.minutes).padStart(2, "0")}`;
  }

  /**
   * Retrieves automation configuration for all 4 lifecycle stages
   */
  getConfig() {
    let stages = null;
    try {
      const rawStages = getSetting("BOOKING_AUTOMATION_STAGES");
      if (rawStages) stages = JSON.parse(rawStages);
    } catch (e) {
      // Ignore JSON error
    }

    const defaultStages = {
      beforeCheckin: {
        id: "beforeCheckin",
        title: "Before Check-in (Route & Directions)",
        triggerType: "BEFORE_CHECKIN",
        enabled: getSetting("STAGE_BEFORE_CHECKIN_ENABLED") !== "false",
        offsetDays: Number(getSetting("PRE_CHECKIN_OFFSET_DAYS") || 1),
        dispatchTime: getSetting("STAGE_BEFORE_CHECKIN_TIME") || "10:00",
        templateName: getSetting("PRE_CHECKIN_TEMPLATE") || "kt_best_route_to_property",
        variableMappings: {},
        badgeLabel: "🚗 Pre-Arrival",
        color: "#25d366"
      },
      onCheckin: {
        id: "onCheckin",
        title: "On Check-in Day (Welcome & Wi-Fi)",
        triggerType: "ON_CHECKIN",
        enabled: getSetting("STAGE_ON_CHECKIN_ENABLED") === "true",
        offsetDays: 0,
        dispatchTime: getSetting("STAGE_ON_CHECKIN_TIME") || "12:00",
        templateName: getSetting("ON_CHECKIN_TEMPLATE") || "kt_invitation_",
        variableMappings: {},
        badgeLabel: "🏨 Welcome",
        color: "#a78bfa"
      },
      onCheckout: {
        id: "onCheckout",
        title: "On Check-out Day (Departure & Luggage)",
        triggerType: "ON_CHECKOUT",
        enabled: getSetting("STAGE_ON_CHECKOUT_ENABLED") !== "false",
        offsetDays: 0,
        dispatchTime: getSetting("STAGE_ON_CHECKOUT_TIME") || "09:00",
        templateName: getSetting("CHECKOUT_TEMPLATE") || "kt_checkout_belongings_reminder",
        variableMappings: {},
        badgeLabel: "🧳 Departure",
        color: "#60a5fa"
      },
      afterCheckout: {
        id: "afterCheckout",
        title: "After Check-out (Review & Thank You)",
        triggerType: "AFTER_CHECKOUT",
        enabled: getSetting("STAGE_AFTER_CHECKOUT_ENABLED") === "true",
        offsetDays: Number(getSetting("POST_CHECKOUT_OFFSET_DAYS") || 1),
        dispatchTime: getSetting("STAGE_AFTER_CHECKOUT_TIME") || "18:00",
        templateName: getSetting("AFTER_CHECKOUT_TEMPLATE") || "kt_restaurant_invitation",
        variableMappings: {},
        badgeLabel: "⭐ Feedback",
        color: "#f59e0b"
      }
    };

    const mergedStages = { ...defaultStages };
    if (stages && typeof stages === "object") {
      for (const k of Object.keys(defaultStages)) {
        if (stages[k]) {
          mergedStages[k] = { ...defaultStages[k], ...stages[k] };
        }
      }
    }

    const stagesCamel = {
      ...mergedStages,
      beforeCheckIn: { ...mergedStages.beforeCheckin, time: mergedStages.beforeCheckin.dispatchTime, daysOffset: mergedStages.beforeCheckin.offsetDays, variableMappings: mergedStages.beforeCheckin.variableMappings || {} },
      onCheckIn: { ...mergedStages.onCheckin, time: mergedStages.onCheckin.dispatchTime, variableMappings: mergedStages.onCheckin.variableMappings || {} },
      onCheckOut: { ...mergedStages.onCheckout, time: mergedStages.onCheckout.dispatchTime, variableMappings: mergedStages.onCheckout.variableMappings || {} },
      afterCheckOut: { ...mergedStages.afterCheckout, time: mergedStages.afterCheckout.dispatchTime, daysOffset: mergedStages.afterCheckout.offsetDays, variableMappings: mergedStages.afterCheckout.variableMappings || {} }
    };

    return {
      googleSheetUrl: getSetting("GOOGLE_SHEET_URL") || "",
      sheetUrl: getSetting("GOOGLE_SHEET_URL") || "",
      sheetTabName: getSetting("GOOGLE_SHEET_TAB_NAME") || "Sheet1",
      enabled: getSetting("BOOKING_AUTOMATION_ENABLED") === "true",
      defaultPropertyName: getSetting("DEFAULT_PROPERTY_NAME") || "",
      lastSyncAt: getSetting("LAST_SHEET_SYNC_AT") || null,
      autoSyncIntervalHours: Number(getSetting("BOOKING_AUTO_SYNC_INTERVAL_HOURS") || 3),
      stages: stagesCamel,
      // Legacy compatibility accessors
      preCheckinOffsetDays: mergedStages.beforeCheckin.offsetDays,
      preCheckinTemplate: mergedStages.beforeCheckin.templateName,
      checkoutTemplate: mergedStages.onCheckout.templateName
    };
  }

  /**
   * Updates automation configuration
   */
  updateConfig(newConfig = {}) {
    const sheetUrl = newConfig.googleSheetUrl !== undefined ? newConfig.googleSheetUrl : newConfig.sheetUrl;
    if (sheetUrl !== undefined) {
      setSetting("GOOGLE_SHEET_URL", String(sheetUrl).trim());
    }
    if (newConfig.sheetTabName !== undefined) {
      setSetting("GOOGLE_SHEET_TAB_NAME", String(newConfig.sheetTabName).trim());
    }
    if (newConfig.enabled !== undefined) {
      setSetting("BOOKING_AUTOMATION_ENABLED", String(Boolean(newConfig.enabled)));
    }
    if (newConfig.defaultPropertyName !== undefined) {
      setSetting("DEFAULT_PROPERTY_NAME", String(newConfig.defaultPropertyName).trim());
    }
    if (newConfig.autoSyncIntervalHours !== undefined) {
      setSetting("BOOKING_AUTO_SYNC_INTERVAL_HOURS", String(Number(newConfig.autoSyncIntervalHours) || 3));
    }

    const currentConfig = this.getConfig();
    const stages = {
      beforeCheckin: { ...currentConfig.stages.beforeCheckin },
      onCheckin: { ...currentConfig.stages.onCheckin },
      onCheckout: { ...currentConfig.stages.onCheckout },
      afterCheckout: { ...currentConfig.stages.afterCheckout }
    };

    // Support updating either whole stages object or individual properties
    if (newConfig.stages && typeof newConfig.stages === "object") {
      const mapping = {
        beforeCheckin: { ...(newConfig.stages.beforeCheckin || {}), ...(newConfig.stages.beforeCheckIn || {}) },
        onCheckin: { ...(newConfig.stages.onCheckin || {}), ...(newConfig.stages.onCheckIn || {}) },
        onCheckout: { ...(newConfig.stages.onCheckout || {}), ...(newConfig.stages.onCheckOut || {}) },
        afterCheckout: { ...(newConfig.stages.afterCheckout || {}), ...(newConfig.stages.afterCheckOut || {}) }
      };

      for (const k of ["beforeCheckin", "onCheckin", "onCheckout", "afterCheckout"]) {
        const incoming = mapping[k];
        if (incoming && Object.keys(incoming).length > 0) {
          stages[k] = {
            ...stages[k],
            ...incoming,
            templateName: incoming.templateName !== undefined ? String(incoming.templateName).trim() : stages[k].templateName,
            variableMappings: incoming.variableMappings !== undefined ? incoming.variableMappings : (stages[k].variableMappings || {}),
            dispatchTime: incoming.dispatchTime || incoming.time || stages[k].dispatchTime,
            offsetDays: incoming.offsetDays !== undefined ? Number(incoming.offsetDays) : (incoming.daysOffset !== undefined ? Number(incoming.daysOffset) : stages[k].offsetDays)
          };
          stages[k].time = stages[k].dispatchTime;
          stages[k].daysOffset = stages[k].offsetDays;
          if (stages[k].offsetDays !== undefined) stages[k].offsetDays = Number(stages[k].offsetDays) || 0;
          if (stages[k].enabled !== undefined) stages[k].enabled = Boolean(stages[k].enabled);
        }
      }
    }

    // Support legacy field updates
    if (newConfig.preCheckinOffsetDays !== undefined) {
      stages.beforeCheckin.offsetDays = Number(newConfig.preCheckinOffsetDays) || 1;
    }
    if (newConfig.preCheckinTemplate !== undefined) {
      stages.beforeCheckin.templateName = String(newConfig.preCheckinTemplate).trim();
    }
    if (newConfig.checkoutTemplate !== undefined) {
      stages.onCheckout.templateName = String(newConfig.checkoutTemplate).trim();
    }

    setSetting("BOOKING_AUTOMATION_STAGES", JSON.stringify(stages));

    // Keep legacy settings synced
    setSetting("PRE_CHECKIN_OFFSET_DAYS", String(stages.beforeCheckin.offsetDays || 1));
    setSetting("PRE_CHECKIN_TEMPLATE", String(stages.beforeCheckin.templateName || "kt_best_route_to_property"));
    setSetting("CHECKOUT_TEMPLATE", String(stages.onCheckout.templateName || "kt_checkout_belongings_reminder"));
    setSetting("STAGE_BEFORE_CHECKIN_ENABLED", String(Boolean(stages.beforeCheckin.enabled)));
    setSetting("STAGE_BEFORE_CHECKIN_TIME", String(stages.beforeCheckin.dispatchTime || "10:00"));
    setSetting("STAGE_ON_CHECKIN_ENABLED", String(Boolean(stages.onCheckin.enabled)));
    setSetting("STAGE_ON_CHECKIN_TIME", String(stages.onCheckin.dispatchTime || "12:00"));
    setSetting("ON_CHECKIN_TEMPLATE", String(stages.onCheckin.templateName || "kt_invitation_"));
    setSetting("STAGE_ON_CHECKOUT_ENABLED", String(Boolean(stages.onCheckout.enabled)));
    setSetting("STAGE_ON_CHECKOUT_TIME", String(stages.onCheckout.dispatchTime || "09:00"));
    setSetting("STAGE_AFTER_CHECKOUT_ENABLED", String(Boolean(stages.afterCheckout.enabled)));
    setSetting("POST_CHECKOUT_OFFSET_DAYS", String(stages.afterCheckout.offsetDays || 1));
    setSetting("STAGE_AFTER_CHECKOUT_TIME", String(stages.afterCheckout.dispatchTime || "18:00"));
    setSetting("AFTER_CHECKOUT_TEMPLATE", String(stages.afterCheckout.templateName || "kt_restaurant_invitation"));

    // Sync evergreen campaign in campaigns table
    this.syncEvergreenCampaign();

    return this.getConfig();
  }

  /**
   * Previews upcoming triggers and current sheet status with 4-stage time evaluations
   */
  async previewTriggers(overrideSheetUrl = null, overrideConfig = null, forceSync = false) {
    const baseConfig = this.getConfig();
    const config = {
      ...baseConfig,
      ...(overrideConfig || {})
    };

    if (overrideConfig && overrideConfig.stages) {
      config.stages = { ...baseConfig.stages, ...overrideConfig.stages };
    }

    const sheetUrl = (overrideSheetUrl || config.googleSheetUrl || "").trim();
    let sheetData = null;

    if (sheetUrl) {
      const tabName = (overrideConfig && overrideConfig.sheetTabName) || config.sheetTabName || null;
      const autoSyncIntervalHours = Number(config.autoSyncIntervalHours || 3);
      const syncIntervalMs = autoSyncIntervalHours * 60 * 60 * 1000;
      const lastSyncStr = getSetting("LAST_SHEET_SYNC_AT");
      const cachedRaw = getSetting("CACHED_SHEET_DATA");
      const isCacheFresh = cachedRaw && lastSyncStr && (Date.now() - new Date(lastSyncStr).getTime() < syncIntervalMs);

      // Fetch fresh from Google Sheets if forced, manual override, or 3-hour cache expired
      if (overrideSheetUrl || forceSync || !isCacheFresh) {
        try {
          sheetData = await googleSheetService.parseLiveSheet(sheetUrl, tabName);
          setSetting("CACHED_SHEET_DATA", JSON.stringify(sheetData));
          setSetting("LAST_SHEET_SYNC_AT", new Date().toISOString());
        } catch (sheetErr) {
          if (cachedRaw) {
            try {
              sheetData = JSON.parse(cachedRaw);
              console.warn("[BookingAutomation] Live fetch failed, using cached sheet data:", sheetErr.message);
            } catch (e) {}
          }
          if (!sheetData) {
            const savedCount = db.prepare("SELECT COUNT(*) as count FROM automated_booking_contacts").get()?.count || 0;
            if (savedCount === 0) {
              throw sheetErr;
            }
            console.warn("[BookingAutomation] Google Sheet fetch notice:", sheetErr.message);
          }
        }
      } else {
        // Use cached sheet data within the 3-hour auto-sync window
        try {
          sheetData = JSON.parse(cachedRaw);
        } catch (e) {
          sheetData = await googleSheetService.parseLiveSheet(sheetUrl, tabName);
          setSetting("CACHED_SHEET_DATA", JSON.stringify(sheetData));
          setSetting("LAST_SHEET_SYNC_AT", new Date().toISOString());
        }
      }
    }

    // Retrieve any permanently saved booking contacts from database
    const savedContacts = db.prepare(`
      SELECT id, booking_id, guest_name, phone_number, clean_phone, property_name,
             checkin_date, checkout_date, raw_data, source
      FROM automated_booking_contacts
      ORDER BY id ASC
    `).all();

    if (!sheetData && savedContacts.length === 0) {
      return {
        configured: false,
        message: "No Google Sheet URL or saved booking list configured. Please configure a Google Sheet URL or upload a file.",
        config
      };
    }

    // If no Google Sheet was used, structure sheetData from saved database contacts
    if (!sheetData && savedContacts.length > 0) {
      const headers = ["Guest Name", "Phone", "Checkin Date", "Checkout Date", "Property Name", "Booking ID"];
      const bookings = savedContacts.map((c, idx) => {
        let rawObj = {};
        try {
          rawObj = c.raw_data ? JSON.parse(c.raw_data) : {};
        } catch (e) {}

        const isValidPhone = Boolean(c.clean_phone && c.clean_phone.length >= 10);
        const hasDates = Boolean(c.checkin_date || c.checkout_date);

        return {
          rowIndex: idx + 1,
          bookingId: c.booking_id || `BK-UP-${idx + 1}`,
          guestName: c.guest_name || "Guest",
          rawPhone: c.phone_number || c.clean_phone,
          cleanPhone: c.clean_phone,
          checkinDate: c.checkin_date,
          checkoutDate: c.checkout_date,
          propertyName: c.property_name || "",
          isValidPhone,
          hasDates,
          rawData: Object.keys(rawObj).length > 0 ? rawObj : {
            "Guest Name": c.guest_name,
            "Phone": c.clean_phone,
            "Checkin Date": c.checkin_date,
            "Checkout Date": c.checkout_date,
            "Property Name": c.property_name
          }
        };
      });

      sheetData = {
        success: true,
        spreadsheetId: "saved_contacts_db",
        gid: "0",
        totalRows: bookings.length,
        validBookingsCount: bookings.filter(b => b.isValidPhone && b.hasDates).length,
        missingPhoneCount: bookings.filter(b => !b.isValidPhone).length,
        missingDateCount: bookings.filter(b => !b.hasDates).length,
        headers,
        detectedColumns: {
          nameCol: "Guest Name",
          phoneCol: "Phone",
          checkinCol: "Checkin Date",
          checkoutCol: "Checkout Date",
          propertyCol: "Property Name",
          bookingIdCol: "Booking ID"
        },
        bookings
      };
    } else if (sheetData && savedContacts.length > 0) {
      // If both Google Sheet AND saved database contacts exist, merge distinct contacts
      const existingKeys = new Set(sheetData.bookings.map(b => `${b.cleanPhone}_${b.checkinDate}`));
      savedContacts.forEach((c, idx) => {
        const key = `${c.clean_phone}_${c.checkin_date}`;
        if (!existingKeys.has(key)) {
          let rawObj = {};
          try {
            rawObj = c.raw_data ? JSON.parse(c.raw_data) : {};
          } catch (e) {}

          const isValidPhone = Boolean(c.clean_phone && c.clean_phone.length >= 10);
          const hasDates = Boolean(c.checkin_date || c.checkout_date);

          sheetData.bookings.push({
            rowIndex: sheetData.bookings.length + 1,
            bookingId: c.booking_id || `BK-UP-${idx + 1}`,
            guestName: c.guest_name || "Guest",
            rawPhone: c.phone_number || c.clean_phone,
            cleanPhone: c.clean_phone,
            checkinDate: c.checkin_date,
            checkoutDate: c.checkout_date,
            propertyName: c.property_name || "",
            isValidPhone,
            hasDates,
            rawData: Object.keys(rawObj).length > 0 ? rawObj : {
              "Guest Name": c.guest_name,
              "Phone": c.clean_phone,
              "Checkin Date": c.checkin_date,
              "Checkout Date": c.checkout_date,
              "Property Name": c.property_name
            }
          });
          sheetData.totalRows++;
          if (isValidPhone && hasDates) sheetData.validBookingsCount++;
        }
      });
    }

    const timeSnapshot = timeUtil.getSystemTime();
    const todayStr = timeSnapshot.date;
    const currentTimeStr = `${String(timeSnapshot.hours).padStart(2, "0")}:${String(timeSnapshot.minutes).padStart(2, "0")}`;

    // Fetch existing sent dispatches from database to cross-reference
    const pastDispatches = db.prepare(`
      SELECT clean_phone, trigger_type, checkin_date, checkout_date, status, dispatched_at, meta_message_id
      FROM automated_booking_dispatches
    `).all();

    const dispatchMap = new Map();
    pastDispatches.forEach(d => {
      let tType = d.trigger_type;
      if (tType === "PRE_CHECKIN") tType = "BEFORE_CHECKIN";
      if (tType === "CHECKOUT") tType = "ON_CHECKOUT";

      // For check-out related stages, the reference anchor date is checkout_date
      const isCheckoutStage = tType === "ON_CHECKOUT" || tType === "AFTER_CHECKOUT";
      const relevantDate = isCheckoutStage ? (d.checkout_date || d.checkin_date) : (d.checkin_date || d.checkout_date);

      const phoneDateKey = `${d.clean_phone}_${tType}_${relevantDate}`;
      dispatchMap.set(phoneDateKey, d);

      if (d.booking_id) {
        dispatchMap.set(`${d.booking_id}_${tType}`, d);
        dispatchMap.set(`${d.booking_id}_${tType}_${relevantDate}`, d);
      }
    });

    const evaluateStage = (stageConfig, baseDate, isNegativeOffset = false) => {
      if (!stageConfig || !stageConfig.enabled) {
        return { status: "DISABLED", isDueNow: false, templateName: stageConfig?.templateName || "—" };
      }
      if (!baseDate) {
        return { status: "MISSING_DATE", isDueNow: false, templateName: stageConfig.templateName };
      }

      const offset = isNegativeOffset ? -(Number(stageConfig.offsetDays) || 0) : (Number(stageConfig.offsetDays) || 0);
      const targetDate = calculateTargetDate(baseDate, offset);
      if (!targetDate) {
        return { status: "INVALID_DATE", isDueNow: false, templateName: stageConfig.templateName };
      }

      const dedupeKey = stageConfig.dedupeKey;
      const bookingKey = stageConfig.bookingId ? `${stageConfig.bookingId}_${stageConfig.triggerType}` : null;
      const alreadySent = dispatchMap.get(dedupeKey) || (bookingKey ? dispatchMap.get(bookingKey) : null);
      if (alreadySent) {
        return {
          status: alreadySent.status === "SENT" ? "ALREADY_SENT" : "FAILED_PREVIOUSLY",
          isDueNow: false,
          targetDate,
          dispatchTime: formatNormalizedTime(stageConfig.dispatchTime),
          templateName: stageConfig.templateName,
          dispatchedAt: alreadySent.dispatched_at,
          metaMessageId: alreadySent.meta_message_id
        };
      }

      if (todayStr < targetDate) {
        return {
          status: "FUTURE_UPCOMING",
          isDueNow: false,
          targetDate,
          dispatchTime: formatNormalizedTime(stageConfig.dispatchTime),
          templateName: stageConfig.templateName
        };
      }

      if (todayStr > targetDate) {
        return {
          status: "PAST",
          isDueNow: false,
          targetDate,
          dispatchTime: formatNormalizedTime(stageConfig.dispatchTime),
          templateName: stageConfig.templateName
        };
      }

      // Today is the target date! Compare scheduled minutes of the day (immune to 9:00 vs 09:00 string errors)
      const targetMinutes = parseTimeToMinutes(stageConfig.dispatchTime || "10:00");
      const currentMinutes = timeSnapshot.hours * 60 + timeSnapshot.minutes;
      const normalizedTargetTime = formatNormalizedTime(stageConfig.dispatchTime || "10:00");

      if (currentMinutes < targetMinutes) {
        return {
          status: "SCHEDULED_FOR_TODAY",
          isDueNow: false,
          targetDate,
          dispatchTime: normalizedTargetTime,
          templateName: stageConfig.templateName
        };
      } else {
        return {
          status: "DUE_FOR_SEND",
          isDueNow: true,
          targetDate,
          dispatchTime: normalizedTargetTime,
          templateName: stageConfig.templateName
        };
      }
    };

    let dueBeforeCheckinCount = 0;
    let dueOnCheckinCount = 0;
    let dueOnCheckoutCount = 0;
    let dueAfterCheckoutCount = 0;
    let scheduledTodayCount = 0;

    const evaluated = sheetData.bookings.map(b => {
      // 1. Stage: Before Check-in
      const beforeCheckinEval = evaluateStage(
        { ...(config.stages.beforeCheckin || config.stages.beforeCheckIn), triggerType: "BEFORE_CHECKIN", bookingId: b.bookingId, dedupeKey: `${b.cleanPhone}_BEFORE_CHECKIN_${b.checkinDate}` },
        b.checkinDate,
        true
      );
      if (beforeCheckinEval.isDueNow) dueBeforeCheckinCount++;
      if (beforeCheckinEval.status === "SCHEDULED_FOR_TODAY") scheduledTodayCount++;

      // 2. Stage: On Check-in Day
      const onCheckinEval = evaluateStage(
        { ...(config.stages.onCheckin || config.stages.onCheckIn), triggerType: "ON_CHECKIN", bookingId: b.bookingId, dedupeKey: `${b.cleanPhone}_ON_CHECKIN_${b.checkinDate}` },
        b.checkinDate,
        false
      );
      if (onCheckinEval.isDueNow) dueOnCheckinCount++;
      if (onCheckinEval.status === "SCHEDULED_FOR_TODAY") scheduledTodayCount++;

      // 3. Stage: On Check-out Day
      const onCheckoutEval = evaluateStage(
        { ...(config.stages.onCheckout || config.stages.onCheckOut), triggerType: "ON_CHECKOUT", bookingId: b.bookingId, dedupeKey: `${b.cleanPhone}_ON_CHECKOUT_${b.checkoutDate}` },
        b.checkoutDate,
        false
      );
      if (onCheckoutEval.isDueNow) dueOnCheckoutCount++;
      if (onCheckoutEval.status === "SCHEDULED_FOR_TODAY") scheduledTodayCount++;

      // 4. Stage: After Check-out Day
      const afterCheckoutEval = evaluateStage(
        { ...(config.stages.afterCheckout || config.stages.afterCheckOut), triggerType: "AFTER_CHECKOUT", bookingId: b.bookingId, dedupeKey: `${b.cleanPhone}_AFTER_CHECKOUT_${b.checkoutDate}` },
        b.checkoutDate,
        false
      );
      if (afterCheckoutEval.isDueNow) dueAfterCheckoutCount++;
      if (afterCheckoutEval.status === "SCHEDULED_FOR_TODAY") scheduledTodayCount++;

      const isDueNow = beforeCheckinEval.isDueNow || onCheckinEval.isDueNow || onCheckoutEval.isDueNow || afterCheckoutEval.isDueNow;

      return {
        ...b,
        stages: {
          beforeCheckin: beforeCheckinEval,
          onCheckin: onCheckinEval,
          onCheckout: onCheckoutEval,
          afterCheckout: afterCheckoutEval
        },
        // Backward-compatible properties
        preCheckinStatus: beforeCheckinEval.status,
        checkoutStatus: onCheckoutEval.status,
        preCheckinTemplate: beforeCheckinEval.templateName,
        checkoutTemplate: onCheckoutEval.templateName,
        isDueNow
      };
    });

    const totalDueCount = dueBeforeCheckinCount + dueOnCheckinCount + dueOnCheckoutCount + dueAfterCheckoutCount;

    return {
      configured: true,
      success: true,
      todayDate: todayStr,
      currentTime: currentTimeStr,
      systemTime: currentTimeStr,
      timezone: timeSnapshot.timezone,
      totalRows: sheetData.totalRows,
      validBookingsCount: sheetData.validBookingsCount,
      detectedColumns: sheetData.detectedColumns,
      headers: sheetData.headers,
      totalDueCount,
      dueBeforeCheckinCount,
      dueOnCheckinCount,
      dueOnCheckoutCount,
      dueAfterCheckoutCount,
      scheduledTodayCount,
      // Backward-compatible counts
      duePreCheckinCount: dueBeforeCheckinCount,
      dueCheckoutCount: dueOnCheckoutCount,
      bookings: evaluated,
      config
    };
  }

  /**
   * Executes the automated trigger evaluations and sends due WhatsApp messages
   */
  async runTriggers() {
    if (this.isEvaluating) {
      return { success: false, message: "Automation check is already executing in background." };
    }

    this.isEvaluating = true;

    try {
      const config = this.getConfig();
      if (!config.enabled) {
        return { success: false, message: "Booking automation is currently disabled in settings." };
      }

      const savedCount = db.prepare("SELECT COUNT(*) as count FROM automated_booking_contacts").get()?.count || 0;
      if (!config.googleSheetUrl && savedCount === 0) {
        return { success: false, message: "No Google Sheet URL or saved contacts configured." };
      }

      const preview = await this.previewTriggers();
      const todayStr = this.getTodayDateString();

      const results = {
        executedAt: new Date().toISOString(),
        todayDate: todayStr,
        currentTime: preview.currentTime,
        beforeCheckinSent: 0,
        beforeCheckinFailed: 0,
        onCheckinSent: 0,
        onCheckinFailed: 0,
        onCheckoutSent: 0,
        onCheckoutFailed: 0,
        afterCheckoutSent: 0,
        afterCheckoutFailed: 0,
        totalSent: 0,
        totalFailed: 0,
        logs: []
      };

      const recordStmt = db.prepare(`
        INSERT OR REPLACE INTO automated_booking_dispatches (
          booking_id, guest_name, phone_number, clean_phone, property_name,
          checkin_date, checkout_date, trigger_type, template_name,
          meta_message_id, status, error_message, dispatched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      const stageList = [
        { key: "beforeCheckin", camelKey: "beforeCheckIn", type: "BEFORE_CHECKIN", label: "🚗 Pre-Checkin", dateKey: "checkinDate", countKey: "beforeCheckinSent", failKey: "beforeCheckinFailed" },
        { key: "onCheckin", camelKey: "onCheckIn", type: "ON_CHECKIN", label: "🏨 Check-in Day", dateKey: "checkinDate", countKey: "onCheckinSent", failKey: "onCheckinFailed" },
        { key: "onCheckout", camelKey: "onCheckOut", type: "ON_CHECKOUT", label: "🧳 Check-out Day", dateKey: "checkoutDate", countKey: "onCheckoutSent", failKey: "onCheckoutFailed" },
        { key: "afterCheckout", camelKey: "afterCheckOut", type: "AFTER_CHECKOUT", label: "⭐ After Check-out", dateKey: "checkoutDate", countKey: "afterCheckoutSent", failKey: "afterCheckoutFailed" }
      ];

      for (const b of preview.bookings) {
        if (!b.isValidPhone) continue;

        for (const s of stageList) {
          const stageEval = b.stages[s.key];
          if (stageEval && stageEval.isDueNow) {
            const templateName = stageEval.templateName;
            try {
              const stageConfig = (config.stages && (config.stages[s.camelKey] || config.stages[s.key] || config.stages[s.type])) || {};
              const variableMappings = stageConfig.variableMappings || {};
              const components = this.resolveTemplateVariables(templateName, variableMappings, b, config.defaultPropertyName);

              console.log(`[BookingAutomation] ${s.label} sending '${templateName}' to ${b.guestName} (+${b.cleanPhone}) for ${b[s.dateKey]} with parameters:`, JSON.stringify(components[0]?.parameters || []));

              const sendRes = await sendTemplateMessage({
                to: b.cleanPhone,
                templateName,
                languageCode: stageConfig.language || "en",
                components
              });

              recordStmt.run(
                b.bookingId,
                b.guestName,
                b.rawPhone,
                b.cleanPhone,
                b.propertyName,
                b.checkinDate,
                b.checkoutDate,
                s.type,
                templateName,
                sendRes.messageId || null,
                "SENT",
                null
              );

              // Also mirror to campaign_recipients for the persistent evergreen campaign
              try {
                db.prepare(`
                  INSERT INTO campaign_recipients (
                    campaign_id, phone_number, clean_phone, contact_name,
                    rendered_message, status, meta_message_id, sent_at
                  ) VALUES ('campaign_booking_lifecycle', ?, ?, ?, ?, 'SENT', ?, CURRENT_TIMESTAMP)
                `).run(b.rawPhone, b.cleanPhone, b.guestName, `[${s.label}] ${templateName}`, sendRes.messageId || null);
              } catch (recErr) {}

              results[s.countKey]++;
              results.totalSent++;
              results.logs.push({
                guest: b.guestName,
                phone: b.cleanPhone,
                type: s.type,
                template: templateName,
                status: "SENT",
                messageId: sendRes.messageId
              });

              // Gentle throttle (250ms) to respect WhatsApp throughput
              await new Promise(r => setTimeout(r, 250));
            } catch (sendErr) {
              console.error(`[BookingAutomation] Failed to send ${s.label} to ${b.cleanPhone}:`, sendErr.message);

              recordStmt.run(
                b.bookingId,
                b.guestName,
                b.rawPhone,
                b.cleanPhone,
                b.propertyName,
                b.checkinDate,
                b.checkoutDate,
                s.type,
                templateName,
                null,
                "FAILED",
                sendErr.message
              );

              try {
                db.prepare(`
                  INSERT INTO campaign_recipients (
                    campaign_id, phone_number, clean_phone, contact_name,
                    rendered_message, status, error_message, sent_at
                  ) VALUES ('campaign_booking_lifecycle', ?, ?, ?, ?, 'FAILED', ?, CURRENT_TIMESTAMP)
                `).run(b.rawPhone, b.cleanPhone, b.guestName, `[${s.label}] ${templateName}`, sendErr.message);
              } catch (recErr) {}

              results[s.failKey]++;
              results.totalFailed++;
              results.logs.push({
                guest: b.guestName,
                phone: b.cleanPhone,
                type: s.type,
                template: templateName,
                status: "FAILED",
                error: sendErr.message
              });
            }
          }
        }
      }

      setSetting("LAST_TRIGGER_EVALUATION_AT", new Date().toISOString());

      // Sync evergreen campaign in campaigns table with latest metrics
      this.syncEvergreenCampaign(preview.bookings?.length || 0);

      // Backwards compatible properties
      results.preCheckinSent = results.beforeCheckinSent;
      results.checkoutSent = results.onCheckoutSent;

      return {
        success: true,
        dispatchedCount: results.totalSent,
        totalSent: results.totalSent,
        message: `Automation executed: ${results.totalSent} messages dispatched (${results.beforeCheckinSent} Pre-Checkin, ${results.onCheckinSent} Welcome, ${results.onCheckoutSent} Checkout, ${results.afterCheckoutSent} Feedback).`,
        summary: results
      };
    } finally {
      this.isEvaluating = false;
    }
  }

  /**
   * Retrieves historical log of automated dispatches
   */
  getDispatchHistory(limit = 100) {
    const rows = db.prepare(`
      SELECT id, booking_id, guest_name, phone_number, clean_phone, property_name,
             checkin_date, checkout_date, trigger_type, template_name, meta_message_id,
             status, error_message, dispatched_at
      FROM automated_booking_dispatches
      ORDER BY dispatched_at DESC
      LIMIT ?
    `).all(limit);

    return rows;
  }

  /**
   * Resolves dynamic template variables and components for an automation booking
   */
  resolveTemplateVariables(templateName, variableMappings = {}, booking = {}) {
    let tRow = null;
    try {
      tRow = db.prepare("SELECT * FROM templates WHERE name = ? OR meta_id = ? LIMIT 1").get(templateName, templateName);
    } catch (e) {
      // Ignore
    }

    let parsedVars = [];
    let isNamed = false;
    if (tRow && tRow.variables) {
      try {
        parsedVars = JSON.parse(tRow.variables);
      } catch {}
    }

    if ((!parsedVars || parsedVars.length === 0) && tRow?.body_text) {
      const matches = tRow.body_text.match(/\{\{([a-zA-Z0-9_-]+)\}\}/g) || [];
      parsedVars = matches.map((m, idx) => {
        const k = m.replace(/[{}]/g, "");
        return { index: idx + 1, key: k, label: m };
      });
    }

    if (parsedVars.some(v => v.key && isNaN(Number(v.key)))) {
      isNamed = true;
    }

    if (!parsedVars || parsedVars.length === 0) {
      if (templateName === "kt_restaurant_invitation") {
        parsedVars = [
          { key: "name", label: "{{name}}" },
          { key: "restaurant", label: "{{restaurant}}" },
          { key: "link", label: "{{link}}" }
        ];
        isNamed = true;
      } else {
        parsedVars = [
          { key: "1", label: "{{1}}" },
          { key: "2", label: "{{2}}" }
        ];
      }
    }

    const rowData = booking.rawData || {};

    const parameters = parsedVars.map((v, idx) => {
      const varKey = String(v.key || idx + 1);
      const mappedCol = (variableMappings[varKey] || "").trim();
      let resolvedValue = "";

      if (mappedCol) {
        if (rowData[mappedCol] !== undefined) {
          resolvedValue = String(rowData[mappedCol]).trim();
        } else {
          // Case-insensitive match on row columns
          const foundKey = Object.keys(rowData).find(k => k.trim().toLowerCase() === mappedCol.toLowerCase());
          if (foundKey && rowData[foundKey] !== undefined) {
            resolvedValue = String(rowData[foundKey]).trim();
          }
        }
      }

      // Smart auto-detection if variable was not explicitly mapped or resolved cell was blank
      if (!resolvedValue || resolvedValue.trim() === "") {
        const cleanVarName = (v.name || v.key || "").toLowerCase();

        // 1. Guest Name
        if (varKey === "1" || varKey === "name" || /name|guest|customer/i.test(cleanVarName)) {
          resolvedValue = booking.guestName || rowData.name || rowData["Guest Name"] || rowData.guest || "";
        }
        // 2. Property / Resort / Restaurant
        else if (varKey === "2" || varKey === "restaurant" || varKey === "resort" || /property|resort|hotel|villa|restaurant/i.test(cleanVarName)) {
          resolvedValue = booking.propertyName || rowData.resort || rowData.property || rowData["Property Name"] || "";
        }
        // 3. Link / URL
        else if (varKey === "3" || varKey === "link" || /link|url|website|review/i.test(cleanVarName)) {
          resolvedValue = rowData.link || rowData.url || rowData.review || (v.example && v.example.startsWith("http") ? v.example : "") || "";
        }
        // 4. Dates
        else if (/check.*in|arrival|start/i.test(cleanVarName)) {
          resolvedValue = booking.checkinDate || rowData["check-in"] || "";
        }
        else if (/check.*out|departure|end/i.test(cleanVarName)) {
          resolvedValue = booking.checkoutDate || rowData["check-out"] || "";
        }

        // 5. Template example fallback
        if ((!resolvedValue || resolvedValue.trim() === "") && v.example && typeof v.example === "string" && v.example.trim()) {
          resolvedValue = v.example.trim();
        }
      }

      // Meta Cloud API requires non-empty string for template parameters.
      if (!resolvedValue || resolvedValue.trim() === "") {
        resolvedValue = " ";
      }

      const pObj = {
        type: "text",
        text: resolvedValue
      };

      if (isNamed || (!/^\d+$/.test(varKey))) {
        pObj.parameter_name = varKey;
      }

      return pObj;
    });

    const components = [];

    // Header check
    let tplComponents = [];
    if (tRow && tRow.components) {
      try { tplComponents = JSON.parse(tRow.components); } catch (e) {}
    }
    const headerComp = tplComponents.find(c => String(c.type || "").toUpperCase() === "HEADER");
    if (headerComp) {
      const mediaFormat = (headerComp.format || "IMAGE").toLowerCase();
      const mediaUrl = headerComp.example?.header_handle?.[0] || "";
      if (mediaUrl && ["image", "document", "video"].includes(mediaFormat)) {
        components.push({
          type: "header",
          parameters: [
            {
              type: mediaFormat,
              [mediaFormat]: { link: mediaUrl }
            }
          ]
        });
      }
    }

    components.push({
      type: "body",
      parameters
    });

    return components;
  }

  /**
   * Synchronizes or maintains the persistent "Evergreen" campaign in the campaigns table
   */
  syncEvergreenCampaign(totalBookings = 0) {
    try {
      const config = this.getConfig();
      const sentStats = db.prepare(`
        SELECT 
          COUNT(*) as total_dispatches,
          SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) as sent_count,
          SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_count
        FROM automated_booking_dispatches
      `).get();

      const existingCampaign = db.prepare("SELECT id FROM campaigns WHERE id = 'campaign_booking_lifecycle'").get();
      const campaignName = "🏨 Booking Lifecycle Automation (Always-On)";
      const fileName = config.googleSheetUrl ? "Google Sheets Live Sync" : "Uploaded Booking Contacts";
      const status = config.enabled ? "ACTIVE" : "PAUSED";
      const sentCount = Number(sentStats?.sent_count || 0);
      const failedCount = Number(sentStats?.failed_count || 0);

      // Count total distinct bookings available
      let detectedCount = totalBookings;
      if (!detectedCount || detectedCount === 0) {
        const savedContactsCount = db.prepare("SELECT COUNT(*) as count FROM automated_booking_contacts").get()?.count || 0;
        const distinctBookings = db.prepare("SELECT COUNT(DISTINCT clean_phone) as count FROM automated_booking_dispatches").get()?.count || 0;
        detectedCount = Math.max(savedContactsCount, distinctBookings, 1);
      }

      if (!existingCampaign) {
        db.prepare(`
          INSERT INTO campaigns (
            id, name, file_name, total_contacts, valid_contacts, invalid_contacts,
            sent_count, failed_count, status, message_type, template_name,
            delay_ms, created_at, started_at
          ) VALUES (
            'campaign_booking_lifecycle', ?, ?, ?, ?, 0,
            ?, ?, ?, 'AUTOMATION', 'Multi-Stage Lifecycle',
            250, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `).run(campaignName, fileName, detectedCount, detectedCount, sentCount, failedCount, status);
      } else {
        db.prepare(`
          UPDATE campaigns SET
            name = ?,
            file_name = ?,
            total_contacts = MAX(total_contacts, ?),
            valid_contacts = MAX(valid_contacts, ?),
            sent_count = ?,
            failed_count = ?,
            status = ?,
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
          WHERE id = 'campaign_booking_lifecycle'
        `).run(campaignName, fileName, detectedCount, detectedCount, sentCount, failedCount, status);
      }

      // Backfill any dispatches into campaign_recipients for unified reporting if missing
      const dispatches = db.prepare(`
        SELECT d.* FROM automated_booking_dispatches d
        LEFT JOIN campaign_recipients r 
          ON r.campaign_id = 'campaign_booking_lifecycle' 
          AND r.clean_phone = d.clean_phone 
          AND r.meta_message_id = d.meta_message_id
        WHERE r.id IS NULL AND d.meta_message_id IS NOT NULL
      `).all();

      if (dispatches && dispatches.length > 0) {
        const insertRec = db.prepare(`
          INSERT INTO campaign_recipients (
            campaign_id, phone_number, clean_phone, contact_name,
            rendered_message, status, meta_message_id, sent_at
          ) VALUES ('campaign_booking_lifecycle', ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const d of dispatches) {
          insertRec.run(
            d.phone_number,
            d.clean_phone,
            d.guest_name,
            `[${d.trigger_type}] Template: ${d.template_name}`,
            d.status,
            d.meta_message_id,
            d.dispatched_at
          );
        }
      }
    } catch (e) {
      console.warn("[BookingAutomation] syncEvergreenCampaign notice:", e.message);
    }
  }

  /**
   * Persists uploaded bookings to database permanently so they survive page reloads and system restarts
   */
  saveUploadedContacts(rawRows = [], defaultCountry = "91", userId = null) {
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return { success: false, message: "No contacts to save." };
    }

    const firstRow = rawRows[0]?.data || rawRows[0] || {};
    const headers = Object.keys(firstRow);
    const detected = googleSheetService.detectColumns(headers);

    const insertStmt = db.prepare(`
      INSERT INTO automated_booking_contacts (
        booking_id, guest_name, phone_number, clean_phone, property_name,
        checkin_date, checkout_date, raw_data, source, user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UPLOAD', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let savedCount = 0;
    for (const r of rawRows) {
      const dataObj = r.data || r;
      const rawName = detected.nameCol ? dataObj[detected.nameCol] : (dataObj[headers[0]] || "Guest");
      const rawPhone = detected.phoneCol ? dataObj[detected.phoneCol] : "";
      const cleaned = cleanPhone(rawPhone, defaultCountry);
      if (!cleaned || cleaned.length < 10) continue;

      const rawIn = detected.checkinCol ? dataObj[detected.checkinCol] : null;
      const rawOut = detected.checkoutCol ? dataObj[detected.checkoutCol] : null;
      const checkinDate = googleSheetService.normalizeDate(rawIn);
      const checkoutDate = googleSheetService.normalizeDate(rawOut);
      const property = detected.propertyCol ? String(dataObj[detected.propertyCol] || "").trim() : "";
      const bId = detected.bookingIdCol ? String(dataObj[detected.bookingIdCol] || "").trim() : `up_${Date.now()}_${savedCount + 1}`;

      insertStmt.run(
        bId,
        String(rawName || "").trim() || "Guest",
        String(rawPhone || "").trim(),
        cleaned,
        property,
        checkinDate,
        checkoutDate,
        JSON.stringify(dataObj),
        userId
      );
      savedCount++;
    }

    this.syncEvergreenCampaign(savedCount);

    return {
      success: true,
      savedCount,
      message: `Successfully saved ${savedCount} booking records permanently.`
    };
  }

  /**
   * Retrieves all permanently saved uploaded contacts
   */
  getUploadedContacts(limit = 100) {
    return db.prepare(`
      SELECT id, booking_id, guest_name, phone_number, clean_phone, property_name,
             checkin_date, checkout_date, raw_data, source, created_at
      FROM automated_booking_contacts
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Clears all permanently saved uploaded contacts
   */
  clearUploadedContacts() {
    const res = db.prepare("DELETE FROM automated_booking_contacts").run();
    this.syncEvergreenCampaign(0);
    return { success: true, count: res.changes || 0 };
  }
}

module.exports = new BookingAutomationService();
