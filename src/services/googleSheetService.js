const xlsx = require("xlsx");
const { cleanPhone } = require("./metaWhatsAppService");

/**
 * Service to parse and access live Google Sheets and spreadsheet data
 */
class GoogleSheetService {
  /**
   * Extracts spreadsheet ID and sheet GID from any Google Sheets URL
   */
  parseSheetUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") {
      throw new Error("Invalid or empty Google Sheet URL provided.");
    }

    const trimmed = rawUrl.trim();

    let spreadsheetId = null;
    let gid = null;
    let isPublishedWeb = false;
    let pubKey = null;

    // Check if published web URL: /spreadsheets/d/e/2PACX-...
    const pubMatch = trimmed.match(/\/spreadsheets\/d\/e\/(2PACX-[a-zA-Z0-9-_]+)/i);
    if (pubMatch) {
      isPublishedWeb = true;
      pubKey = pubMatch[1];
    } else {
      // Standard spreadsheet URL: /spreadsheets/d/{id}/
      const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
      if (idMatch && idMatch[1] !== "e") {
        spreadsheetId = idMatch[1];
      } else if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
        spreadsheetId = trimmed;
      } else {
        throw new Error(
          "Could not extract Google Spreadsheet ID. Please provide a valid Google Sheet URL (e.g. https://docs.google.com/spreadsheets/d/your-sheet-id/edit)."
        );
      }
    }

    const gidMatch = trimmed.match(/[#&?]gid=([0-9]+)/i);
    if (gidMatch) {
      gid = gidMatch[1];
    }

    return { spreadsheetId, gid, isPublishedWeb, pubKey, originalUrl: trimmed };
  }

  /**
   * Normalizes various date representations into YYYY-MM-DD
   */
  normalizeDate(val) {
    if (!val) return null;

    // If it's already a Date object
    if (val instanceof Date && !isNaN(val.getTime())) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, "0");
      const d = String(val.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    // If Excel serial number (e.g. 40000 to 60000)
    if (typeof val === "number" || (/^\d{5}$/.test(String(val).trim()))) {
      const serial = Number(val);
      if (serial > 20000 && serial < 80000) {
        const utcDays = Math.floor(serial - 25569);
        const dateObj = new Date(utcDays * 86400 * 1000);
        const y = dateObj.getUTCFullYear();
        const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
        const d = String(dateObj.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    }

    const str = String(val).trim();
    if (!str) return null;

    // Already YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (isoMatch) {
      const y = isoMatch[1];
      const m = String(isoMatch[2]).padStart(2, "0");
      const d = String(isoMatch[3]).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    // Indian / European DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (dmyMatch) {
      const d = String(dmyMatch[1]).padStart(2, "0");
      const m = String(dmyMatch[2]).padStart(2, "0");
      const y = dmyMatch[3];
      return `${y}-${m}-${d}`;
    }

    // 2-digit year format DD/MM/YY
    const dmyShortMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
    if (dmyShortMatch) {
      const d = String(dmyShortMatch[1]).padStart(2, "0");
      const m = String(dmyShortMatch[2]).padStart(2, "0");
      const y = `20${dmyShortMatch[3]}`;
      return `${y}-${m}-${d}`;
    }

    // Try standard JS Date parse (e.g. "15 Oct 2026" or "October 15, 2026")
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, "0");
      const d = String(parsed.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    return null;
  }

  /**
   * Fetches CSV from public Google Sheet via export URLs
   */
  async fetchSheetCsv(url, tabName = null) {
    const parsed = this.parseSheetUrl(url);

    let exportUrls = [];

    if (parsed.isPublishedWeb) {
      const base = `https://docs.google.com/spreadsheets/d/e/${parsed.pubKey}/pub?output=csv`;
      exportUrls.push(
        parsed.gid ? `${base}&gid=${parsed.gid}&single=true` : `${base}&single=true`,
        base
      );
      if (parsed.originalUrl.includes("output=csv")) {
        exportUrls.unshift(parsed.originalUrl);
      }
    } else {
      const sId = parsed.spreadsheetId;
      const cleanTab = tabName ? String(tabName).trim() : null;

      if (cleanTab && cleanTab.toLowerCase() !== "sheet1") {
        exportUrls.push(
          `https://docs.google.com/spreadsheets/d/${sId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cleanTab)}`,
          `https://docs.google.com/spreadsheets/d/${sId}/export?format=csv&sheet=${encodeURIComponent(cleanTab)}`
        );
      }

      if (parsed.gid !== null && parsed.gid !== undefined) {
        exportUrls.push(
          `https://docs.google.com/spreadsheets/d/${sId}/export?format=csv&gid=${parsed.gid}`,
          `https://docs.google.com/spreadsheets/d/${sId}/gviz/tq?tqx=out:csv&gid=${parsed.gid}`
        );
      }

      exportUrls.push(
        `https://docs.google.com/spreadsheets/d/${sId}/export?format=csv`,
        `https://docs.google.com/spreadsheets/d/${sId}/gviz/tq?tqx=out:csv`
      );

      if (cleanTab) {
        exportUrls.push(
          `https://docs.google.com/spreadsheets/d/${sId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cleanTab)}`
        );
      }
    }

    let lastError = null;
    const cacheBuster = `_cb=${Date.now()}`;

    for (let fetchUrl of exportUrls) {
      try {
        const separator = fetchUrl.includes("?") ? "&" : "?";
        const freshUrl = `${fetchUrl}${separator}${cacheBuster}`;

        const response = await fetch(freshUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WhatsApp-Bulk-Engine/1.0",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
          },
          cache: "no-store",
          redirect: "follow"
        });

        if (!response.ok) {
          continue;
        }

        const text = await response.text();

        // Check if Google returned an HTML login or access denied page
        if (text.includes("<!DOCTYPE html>") || text.includes("<html") || text.includes("accounts.google.com")) {
          throw new Error(
            "Access Denied: The Google Sheet is private. Please open the Google Sheet > click 'Share' > set General Access to 'Anyone with the link can view'."
          );
        }

        if (!text || text.trim().length === 0) {
          continue;
        }

        return { csvText: text, spreadsheetId: parsed.spreadsheetId || parsed.pubKey, gid: parsed.gid };
      } catch (err) {
        lastError = err;
        if (err.message && err.message.includes("Access Denied")) {
          throw err;
        }
      }
    }

    throw lastError || new Error("Failed to fetch Google Sheet data. Please check that 'Anyone with link can view' is enabled in Google Sheet share settings.");
  }

  /**
   * Intelligently detects core booking columns from header list
   */
  detectColumns(headers = []) {
    let nameCol = null;
    let phoneCol = null;
    let checkinCol = null;
    let checkoutCol = null;
    let propertyCol = null;
    let bookingIdCol = null;

    for (const h of headers) {
      const clean = String(h || "").trim();
      const lower = clean.toLowerCase();

      // Check-in date column
      if (!checkinCol && /check.*in|checkin|arrival|from.*date|in.*date|start.*date/i.test(lower)) {
        checkinCol = clean;
      }
      // Check-out date column
      else if (!checkoutCol && /check.*out|checkout|departure|to.*date|out.*date|end.*date/i.test(lower)) {
        checkoutCol = clean;
      }
      // Phone column
      else if (!phoneCol && /phone|mobile|whatsapp|contact|cell|number|contact.*no/i.test(lower)) {
        phoneCol = clean;
      }
      // Name column
      else if (!nameCol && /name|guest|customer|client|traveler/i.test(lower)) {
        nameCol = clean;
      }
      // Property column
      else if (!propertyCol && /property|resort|hotel|room|villa|location|stay/i.test(lower)) {
        propertyCol = clean;
      }
      // Booking ID column
      else if (!bookingIdCol && /booking.*id|booking.*no|reservation|ref|id/i.test(lower)) {
        bookingIdCol = clean;
      }
    }

    // Fallbacks if not detected by regex
    if (!nameCol && headers.length > 0) nameCol = headers[0];
    if (!phoneCol && headers.length > 1) phoneCol = headers[1];

    return {
      nameCol,
      phoneCol,
      checkinCol,
      checkoutCol,
      propertyCol,
      bookingIdCol
    };
  }

  /**
   * Ingests, parses and structures live Google Sheet data
   */
  async parseLiveSheet(sheetUrl, tabName = null) {
    const { csvText, spreadsheetId, gid } = await this.fetchSheetCsv(sheetUrl, tabName);

    // Parse CSV into 2D array / workbook using xlsx
    const workbook = xlsx.read(csvText, {
      type: "string",
      raw: false,
      cellDates: true
    });

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    if (!rows || rows.length < 2) {
      throw new Error("The Google Sheet does not contain enough rows (must have header + at least 1 row).");
    }

    // Dynamic header row detection: scan first 10 rows to find row with maximum non-empty cells
    let headerRowIndex = 0;
    let maxHeadersCount = 0;
    let bestHeaders = [];

    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const rowArr = rows[r];
      if (!Array.isArray(rowArr)) continue;
      const candidateHeaders = rowArr.map(h => String(h !== null && h !== undefined ? h : "").trim());
      const nonEmpty = candidateHeaders.filter(Boolean);
      
      const hasKeyKeywords = nonEmpty.some(h => /name|phone|mobile|check|date|villa|guest|contact|room|id|number/i.test(h));
      const score = nonEmpty.length + (hasKeyKeywords ? 5 : 0);
      
      if (score > maxHeadersCount) {
        maxHeadersCount = score;
        headerRowIndex = r;
        bestHeaders = candidateHeaders;
      }
    }

    if (maxHeadersCount === 0 || bestHeaders.filter(Boolean).length === 0) {
      throw new Error("Could not detect column headers in the Google Sheet. Please ensure row 1 contains column titles.");
    }

    // Clean headers: ensure unique, non-empty header names
    const headers = [];
    const usedHeaders = new Set();
    bestHeaders.forEach((h, colIdx) => {
      let cleanH = String(h || "").trim();
      if (!cleanH) cleanH = `Column_${colIdx + 1}`;
      let finalH = cleanH;
      let counter = 2;
      while (usedHeaders.has(finalH.toLowerCase())) {
        finalH = `${cleanH}_${counter++}`;
      }
      usedHeaders.add(finalH.toLowerCase());
      headers.push(finalH);
    });

    const detected = this.detectColumns(headers);

    const bookings = [];
    let validCount = 0;
    let missingPhoneCount = 0;
    let missingDateCount = 0;

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const rowArr = rows[i];
      if (!rowArr || rowArr.length === 0 || rowArr.every(c => String(c).trim() === "")) {
        continue; // skip blank row
      }

      // Map to object
      const rowObj = {};
      headers.forEach((h, colIdx) => {
        rowObj[h] = rowArr[colIdx] !== undefined ? String(rowArr[colIdx]).trim() : "";
      });

      const rawGuestName = detected.nameCol ? String(rowObj[detected.nameCol] || "").trim() : (rowObj[headers[0]] || "");
      const rawPhoneVal = detected.phoneCol ? String(rowObj[detected.phoneCol] || "").trim() : "";
      const rawCheckinVal = detected.checkinCol ? rowObj[detected.checkinCol] : null;
      const rawCheckoutVal = detected.checkoutCol ? rowObj[detected.checkoutCol] : null;
      const rawPropertyVal = detected.propertyCol ? String(rowObj[detected.propertyCol] || "").trim() : "";
      const bookingIdVal = detected.bookingIdCol ? String(rowObj[detected.bookingIdCol] || "").trim() : `row_${i + 1}`;

      const cleanedPhone = cleanPhone(rawPhoneVal, "91");
      const checkinDate = this.normalizeDate(rawCheckinVal);
      const checkoutDate = this.normalizeDate(rawCheckoutVal);
      const propertyName = rawPropertyVal;

      const isValidPhone = Boolean(cleanedPhone && cleanedPhone.length >= 10);
      const hasDates = Boolean(checkinDate || checkoutDate);

      if (!isValidPhone) missingPhoneCount++;
      if (!hasDates) missingDateCount++;
      if (isValidPhone && hasDates) validCount++;

      bookings.push({
        rowIndex: i + 1,
        bookingId: bookingIdVal || `BK-${i + 1}`,
        guestName: rawGuestName,
        rawPhone: rawPhoneVal,
        cleanPhone: cleanedPhone,
        checkinDate,
        checkoutDate,
        propertyName,
        isValidPhone,
        hasDates,
        rawData: rowObj
      });
    }

    return {
      success: true,
      spreadsheetId,
      gid: gid || "0",
      totalRows: bookings.length,
      validBookingsCount: validCount,
      missingPhoneCount,
      missingDateCount,
      headers,
      detectedColumns: detected,
      bookings
    };
  }
}

module.exports = new GoogleSheetService();
