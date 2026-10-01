const { parseExcelBuffer } = require("../services/excelService");
const { getSetting } = require("../config/database");

/**
 * Handle Excel / CSV file upload and parse contacts
 */
async function handleFileUpload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file was uploaded." });
    }

    const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
    const parsed = parseExcelBuffer(req.file.buffer, req.file.originalname, defaultCountry);

    return res.status(200).json({
      success: true,
      message: "File parsed successfully",
      data: parsed
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to process the uploaded file."
    });
  }
}

module.exports = {
  handleFileUpload
};
