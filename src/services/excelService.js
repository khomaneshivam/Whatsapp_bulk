const XLSX = require("xlsx");
const path = require("path");
const { cleanPhone } = require("./metaWhatsAppService");

/**
 * Supported upload extensions
 */
const SUPPORTED_FILE_EXTENSIONS = [".xlsx", ".xls", ".csv"];

/**
 * Check whether the uploaded file extension is supported
 */
function isSupportedFile(filename = "") {
  const extension = path.extname(filename).toLowerCase();
  return SUPPORTED_FILE_EXTENSIONS.includes(extension);
}

/**
 * Get uploaded file type
 */
function getFileType(filename = "") {
  const extension = path.extname(filename).toLowerCase();

  if (extension === ".csv") return "csv";
  if (extension === ".xls") return "xls";
  if (extension === ".xlsx") return "xlsx";

  return "unknown";
}

/**
 * Heuristics to identify the phone number column
 */
function detectPhoneColumn(columns) {
  const phonePatterns = [
    /^(mobile|phone|contact|number|whatsapp|cell|tel|mob|ph|telephone)$/i,
    /(mobile|phone|contact|number|whatsapp|cell)/i
  ];

  for (const pattern of phonePatterns) {
    const found = columns.find(
      (col) => pattern.test(String(col).trim())
    );

    if (found) return found;
  }

  return columns[0] || "";
}

/**
 * Heuristics to identify the contact name column
 */
function detectNameColumn(columns) {
  const namePatterns = [
    /^(name|full[\s_]?name|customer[\s_]?name|client[\s_]?name|guest[\s_]?name)$/i,
    /(name|customer|guest|client)/i
  ];

  for (const pattern of namePatterns) {
    const found = columns.find(
      (col) => pattern.test(String(col).trim())
    );

    if (found) return found;
  }

  return "";
}

/**
 * Parse Excel or CSV buffer
 *
 * Supports:
 * - .xlsx
 * - .xls
 * - .csv
 *
 * The returned structure is identical for all supported formats.
 */
function parseExcelBuffer(
  buffer,
  originalFilename = "contacts.xlsx",
  defaultCountryCode = "91"
) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Invalid or missing file buffer.");
  }

  /**
   * Validate extension
   */
  if (!isSupportedFile(originalFilename)) {
    throw new Error(
      `Unsupported file type. Allowed formats: ${SUPPORTED_FILE_EXTENSIONS.join(", ")}`
    );
  }

  const fileType = getFileType(originalFilename);

  /**
   * SheetJS can read XLSX, XLS and CSV from a Buffer.
   *
   * raw: false helps normalize values coming from Excel/CSV.
   * cellDates: true allows Excel date cells to be parsed properly.
   * codepage: 65001 supports UTF-8 CSV content.
   */
  let workbook;

  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      raw: false,
      codepage: 65001
    });
  } catch (error) {
    throw new Error(
      `Unable to read ${fileType.toUpperCase()} file: ${error.message}`
    );
  }

  const sheetNames = workbook.SheetNames;

  if (!sheetNames || sheetNames.length === 0) {
    throw new Error(
      "The uploaded file has no readable sheets/data."
    );
  }

  /**
   * Use first sheet for both:
   *
   * XLSX:
   * Workbook → Sheet → Data
   *
   * CSV:
   * CSV → SheetJS creates a single sheet
   */
  const activeSheet = sheetNames[0];
  const firstSheet = workbook.Sheets[activeSheet];

  if (!firstSheet) {
    throw new Error("Unable to read the first sheet from the uploaded file.");
  }

  /**
   * Convert sheet data to JSON.
   *
   * defval: "" ensures missing cells become empty strings.
   */
  const rawRows = XLSX.utils.sheet_to_json(firstSheet, {
    defval: "",
    raw: false
  });

  if (!rawRows || rawRows.length === 0) {
    throw new Error("The uploaded file is empty.");
  }

  /**
   * Detect columns
   */
  const columns = Object.keys(rawRows[0] || {});

  if (columns.length === 0) {
    throw new Error(
      "No columns were detected. Please make sure the file has a header row."
    );
  }

  const detectedPhoneCol = detectPhoneColumn(columns);
  const detectedNameCol = detectNameColumn(columns);

  if (!detectedPhoneCol) {
    throw new Error(
      "Unable to detect a phone number column."
    );
  }

  /**
   * Statistics
   */
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  const seenPhones = new Set();

  /**
   * Process every row
   */
  const processedRows = rawRows.map((row, index) => {
    const rawPhone = detectedPhoneCol
      ? String(row[detectedPhoneCol] || "").trim()
      : "";

    const cleaned = cleanPhone(
      rawPhone,
      defaultCountryCode
    );

    const rawName = detectedNameCol
      ? String(row[detectedNameCol] || "").trim()
      : "";

    let isValid = false;
    let validationNote = "";

    /**
     * Validate phone
     */
    if (!rawPhone) {
      validationNote = "Missing phone number";
      invalidCount++;
    } else if (!cleaned) {
      validationNote = "Unable to normalize phone number";
      invalidCount++;
    } else if (cleaned.length < 10 || cleaned.length > 15) {
      validationNote = `Invalid length (${cleaned.length} digits)`;
      invalidCount++;
    } else {
      isValid = true;
      validCount++;
    }

    /**
     * Duplicate check
     */
    let isDuplicate = false;

    if (isValid) {
      if (seenPhones.has(cleaned)) {
        isDuplicate = true;
        duplicateCount++;
      } else {
        seenPhones.add(cleaned);
      }
    }

    return {
      /**
       * Keep current structure so existing frontend
       * does not need to change.
       */
      rowIndex: index + 1,

      rawPhone,

      cleanPhone: cleaned,

      contactName: rawName,

      isValid,

      isDuplicate,

      validationNote,

      /**
       * Original row
       */
      data: row
    };
  });

  return {
    filename: originalFilename,

    /**
     * New information
     */
    fileType,

    fileExtension: path.extname(originalFilename).toLowerCase(),

    sheetNames,

    activeSheet,

    columns,

    detectedPhoneCol,

    detectedNameCol,

    totalRows: processedRows.length,

    validRows: validCount,

    invalidRows: invalidCount,

    duplicateRows: duplicateCount,

    preview: processedRows.slice(0, 10),

    allRows: processedRows
  };
}

/**
 * Generates an Excel workbook buffer containing campaign delivery results
 */
function generateCampaignReportExcel(campaign, recipients) {
  const wb = XLSX.utils.book_new();

  /**
   * Summary sheet
   */
  const summaryData = [
    {
      Property: "Campaign Name",
      Value: campaign.name
    },
    {
      Property: "Campaign ID",
      Value: campaign.id
    },
    {
      Property: "File Name",
      Value: campaign.file_name || "N/A"
    },
    {
      Property: "Status",
      Value: campaign.status
    },
    {
      Property: "Message Type",
      Value: campaign.message_type
    },
    {
      Property: "Template Name",
      Value: campaign.template_name || "N/A"
    },
  const totalSent = campaign.sent_count || 0;
  const totalFailed = campaign.failed_count || 0;
  const deliveredRecips = recipients.filter(r => r.status === "DELIVERED" || r.status === "READ").length;
  const readRecips = recipients.filter(r => r.status === "READ").length;
  const deliveryRate = totalSent > 0 ? ((deliveredRecips / totalSent) * 100).toFixed(1) + "%" : "0.0%";
  const readRate = deliveredRecips > 0 ? ((readRecips / deliveredRecips) * 100).toFixed(1) + "%" : "0.0%";

  const summaryData = [
    { Property: "Campaign Name", Value: campaign.name },
    { Property: "Template Name", Value: campaign.template_name || "Direct Message" },
    { Property: "Campaign Status", Value: campaign.status },
    { Property: "Total Contacts", Value: campaign.total_contacts || recipients.length },
    { Property: "Successfully Dispatched (Sent)", Value: totalSent },
    { Property: "Delivered Count", Value: deliveredRecips },
    { Property: "Delivery Rate (%)", Value: deliveryRate },
    { Property: "Read / Opened Count", Value: readRecips },
    { Property: "Read Rate (%)", Value: readRate },
    { Property: "Failed Count", Value: totalFailed },
    { Property: "Dispatch Throttle (ms)", Value: `${campaign.delay_ms || 250} ms` },
    { Property: "Created At", Value: campaign.created_at || "" },
    { Property: "Scheduled At", Value: campaign.scheduled_at || "Immediate" },
    { Property: "Completed At", Value: campaign.completed_at || (campaign.status === "COMPLETED" ? "Finished" : "Active / In Progress") }
  ];

  const summarySheet = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary Metrics");

  /**
   * Detailed recipients sheet with timestamps and audit trail
   */
  const sanitize = (val) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  };

  const detailsData = recipients.map((r, idx) => {
    let latencySec = "";
    if (r.sent_at && r.delivered_at) {
      const diffMs = new Date(r.delivered_at).getTime() - new Date(r.sent_at).getTime();
      if (!isNaN(diffMs) && diffMs >= 0) {
        latencySec = (diffMs / 1000).toFixed(1) + "s";
      }
    }

    return {
      "#": idx + 1,
      "Recipient Name": sanitize(r.contact_name || ""),
      "Original Phone": sanitize(r.phone_number || ""),
      "Clean WhatsApp Number": sanitize(r.clean_phone || ""),
      "Delivery Status": sanitize(r.status || ""),
      "Meta Message ID": sanitize(r.meta_message_id || ""),
      "Error Code": sanitize(r.error_code || ""),
      "Error / Reason": sanitize(r.error_message || ""),
      "Dispatched At (Sent)": sanitize(r.sent_at || ""),
      "Delivered At": sanitize(r.delivered_at || ""),
      "Read At": sanitize(r.read_at || ""),
      "Failed At": sanitize(r.failed_at || ""),
      "Delivery Turnaround Latency": latencySec
    };
  });

  const detailsSheet = XLSX.utils.json_to_sheet(detailsData);
  XLSX.utils.book_append_sheet(wb, detailsSheet, "Recipients Audit");

  return XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx"
  });
}

module.exports = {
  parseExcelBuffer,
  detectPhoneColumn,
  detectNameColumn,
  generateCampaignReportExcel,
  isSupportedFile,
  getFileType
};