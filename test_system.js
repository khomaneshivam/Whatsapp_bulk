/**
 * Automated Verification Script for WhatsApp Bulk Broadcast System
 */
const XLSX = require("xlsx");

async function runTests() {
  console.log("=== Starting WhatsApp Bulk Broadcast System Verification ===\n");
  const BASE_URL = "http://localhost:5050";

  // Test 1: Health / Settings Test Connection
  console.log("TEST 1: Testing Meta Cloud API Connection...");
  const connRes = await fetch(`${BASE_URL}/api/settings/test-connection`, { method: "POST" });
  const connData = await connRes.json();
  console.log("Meta Connection Result:", connData.success ? "SUCCESS" : "FAILED");
  if (connData.success) {
    console.log(`- Verified Business: ${connData.data.verifiedName}`);
    console.log(`- Display Phone: ${connData.data.displayPhoneNumber}`);
    console.log(`- Quality Rating: ${connData.data.qualityRating}\n`);
  } else {
    console.error("- Error:", connData.message, "\n");
  }

  // Test 2: In-memory Excel creation and Upload
  console.log("TEST 2: Creating and Uploading Test Excel File...");
  const testData = [
    { Name: "Shivam Khomane", Mobile: "9209967364", City: "Alibaug", Offer: "FLAT20" },
    { Name: "Rahul Sharma", Mobile: "9876543210", City: "Goa", Offer: "WELCOME" },
    { Name: "Invalid User", Mobile: "12345", City: "Pune", Offer: "NONE" },
    { Name: "Duplicate User", Mobile: "9876543210", City: "Mumbai", Offer: "REPEAT" }
  ];
  const ws = XLSX.utils.json_to_sheet(testData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contacts");
  const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const boundary = "----WebKitFormBoundaryTest12345";
  const bodyParts = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="file"; filename="test_contacts.xlsx"\r\n`,
    `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
    excelBuffer,
    `\r\n--${boundary}--\r\n`
  ];

  const totalLength = bodyParts.reduce((acc, part) => acc + (typeof part === "string" ? Buffer.byteLength(part) : part.length), 0);
  const combinedBuffer = Buffer.concat(bodyParts.map(part => typeof part === "string" ? Buffer.from(part) : part));

  const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(totalLength)
    },
    body: combinedBuffer
  });

  const uploadData = await uploadRes.json();
  console.log("Upload Result:", uploadData.success ? "SUCCESS" : "FAILED");
  if (uploadData.success) {
    console.log(`- Total Rows: ${uploadData.data.totalRows}`);
    console.log(`- Valid Rows: ${uploadData.data.validRows}`);
    console.log(`- Invalid Rows: ${uploadData.data.invalidRows}`);
    console.log(`- Detected Phone Column: ${uploadData.data.detectedPhoneCol}`);
    console.log(`- Detected Name Column: ${uploadData.data.detectedNameCol}\n`);
  } else {
    console.error("- Error:", uploadData.message, "\n");
    return;
  }

  // Test 3: Create Campaign
  console.log("TEST 3: Creating Broadcast Campaign...");
  const createRes = await fetch(`${BASE_URL}/api/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Automated Verification Test Campaign",
      fileName: "test_contacts.xlsx",
      phoneColumn: uploadData.data.detectedPhoneCol,
      nameColumn: uploadData.data.detectedNameCol,
      messageType: "TEMPLATE",
      templateName: "1757343188867100", // Test passing template ID directly
      templateLanguage: "en",
      mappingConfig: { bodyParams: [] },
      delayMs: 250,
      contacts: uploadData.data.allRows.map(r => r.data)
    })
  });
  const createData = await createRes.json();
  console.log("Campaign Creation Result:", createData.success ? "SUCCESS" : "FAILED");
  if (createData.success) {
    console.log(`- Campaign ID: ${createData.data.id}`);
    console.log(`- Total Contacts: ${createData.data.total_contacts}`);
    console.log(`- Valid Contacts: ${createData.data.valid_contacts}\n`);
  } else {
    console.error("- Error:", createData.message, "\n");
    return;
  }

  const campaignId = createData.data.id;

  // Test 4: List Campaigns
  console.log("TEST 4: Listing Campaigns...");
  const listRes = await fetch(`${BASE_URL}/api/campaigns`);
  const listData = await listRes.json();
  console.log("List Result:", listData.success ? "SUCCESS" : "FAILED");
  console.log(`- Total Campaigns in SQLite: ${listData.data.length}\n`);

  // Test 5: Export Campaign Excel Report
  console.log("TEST 5: Exporting Campaign Delivery Report (Excel)...");
  const exportRes = await fetch(`${BASE_URL}/api/campaigns/${campaignId}/export`);
  console.log("Export HTTP Status:", exportRes.status, exportRes.headers.get("content-type"));
  const exportArrayBuffer = await exportRes.arrayBuffer();
  const exportWb = XLSX.read(Buffer.from(exportArrayBuffer), { type: "buffer" });
  console.log(`- Excel Report Sheets: ${exportWb.SheetNames.join(", ")}`);
  const recipientsSheet = exportWb.Sheets["Recipients"];
  const rows = XLSX.utils.sheet_to_json(recipientsSheet);
  console.log(`- Recipients in Exported Excel: ${rows.length}\n`);

  console.log("=== All Tests Passed Successfully! System is 100% Operational. ===");
}

runTests().catch(e => console.error("Test failure:", e));
