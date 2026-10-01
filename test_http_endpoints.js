/**
 * HTTP Integration Test Suite against live running server http://localhost:5000
 */
const fs = require("fs");
const path = require("path");

async function runHttpTests() {
  console.log("=== RUNNING LIVE HTTP INTEGRATION TESTS (http://localhost:5000) ===\n");
  const baseUrl = "http://localhost:5000";

  // Test 1: Web UI Index Route
  console.log("[HTTP Test 1] GET / (Main Dashboard)");
  const indexRes = await fetch(`${baseUrl}/`);
  if (!indexRes.ok) throw new Error(`GET / failed with status ${indexRes.status}`);
  const html = await indexRes.text();
  console.log(`✓ Dashboard HTML loaded (${html.length} bytes)`);
  if (!html.includes("btnDispatchSchedule") || !html.includes("btnFetchTemplate")) {
    throw new Error("HTML missing schedule or template inspect elements");
  }

  // Test 2: Inspect Template by ID via REST API
  console.log("\n[HTTP Test 2] GET /api/templates/1059862786867912");
  const tplRes1 = await fetch(`${baseUrl}/api/templates/1059862786867912`);
  const tplData1 = await tplRes1.json();
  if (!tplData1.success) throw new Error(`Template inspect failed: ${tplData1.message}`);
  console.log(`✓ Fetched template: ${tplData1.data.name}`);
  console.log(`  Variables count: ${tplData1.data.variables.length}`);
  console.log(`  Format: ${tplData1.data.parameter_format}`);

  // Test 3: Inspect Named Template by ID
  console.log("\n[HTTP Test 3] GET /api/templates/1757343188867100");
  const tplRes2 = await fetch(`${baseUrl}/api/templates/1757343188867100`);
  const tplData2 = await tplRes2.json();
  if (!tplData2.success) throw new Error(`Template inspect failed: ${tplData2.message}`);
  console.log(`✓ Fetched template: ${tplData2.data.name}`);
  console.log(`  Variables:`, tplData2.data.variables.map(v => v.label));

  // Test 4: Excel File Upload
  console.log("\n[HTTP Test 4] POST /api/upload with Sample_WhatsApp_Contacts.xlsx");
  const filePath = path.join(__dirname, "Sample_WhatsApp_Contacts.xlsx");
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const formData = new FormData();
  formData.append("file", blob, "Sample_WhatsApp_Contacts.xlsx");

  const uploadRes = await fetch(`${baseUrl}/api/upload`, {
    method: "POST",
    body: formData
  });
  const uploadData = await uploadRes.json();
  if (!uploadData.success) throw new Error(`Upload failed: ${uploadData.message}`);
  console.log(`✓ Uploaded ${uploadData.data.filename}`);
  console.log(`  Total Rows: ${uploadData.data.totalRows}, Valid: ${uploadData.data.validRows}`);
  console.log(`  Detected Columns:`, uploadData.data.columns);

  // Test 5: Create a Scheduled Campaign via REST API
  console.log("\n[HTTP Test 5] POST /api/campaigns (Schedule for Later)");
  const scheduleTarget = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const createPayload = {
    name: "Automated Live Scheduled Campaign",
    fileName: uploadData.data.filename,
    phoneColumn: "Mobile",
    nameColumn: "Name",
    messageType: "TEMPLATE",
    templateName: "1059862786867912",
    templateLanguage: "en",
    mappingConfig: {
      bodyParams: [
        { key: "1", col: "Name" },
        { key: "2", col: "Restaurant" },
        { key: "3", col: "Link" }
      ],
      parameterFormat: "POSITIONAL"
    },
    delayMs: 250,
    contacts: uploadData.data.allRows.map(r => r.data),
    scheduleMode: "SCHEDULE",
    scheduledAt: scheduleTarget
  };

  const createRes = await fetch(`${baseUrl}/api/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createPayload)
  });
  const createResult = await createRes.json();
  if (!createResult.success) throw new Error(`Create campaign failed: ${createResult.message}`);
  const createdCamp = createResult.data;
  console.log(`✓ Created campaign '${createdCamp.name}' (ID: ${createdCamp.id})`);
  console.log(`  Status: ${createdCamp.status}`);
  console.log(`  Scheduled At: ${createdCamp.scheduled_at}`);

  // Test 6: List Campaigns and verify scheduled campaign presence
  console.log("\n[HTTP Test 6] GET /api/campaigns");
  const listRes = await fetch(`${baseUrl}/api/campaigns`);
  const listData = await listRes.json();
  if (!listData.success) throw new Error("List campaigns failed");
  const foundCamp = listData.data.find(c => c.id === createdCamp.id);
  if (!foundCamp || foundCamp.status !== "SCHEDULED") {
    throw new Error("Created scheduled campaign not found in list with status SCHEDULED");
  }
  console.log(`✓ Verified campaign in list with status: ${foundCamp.status}`);

  // Test 7: Reschedule Campaign
  console.log("\n[HTTP Test 7] POST /api/campaigns/:id/reschedule");
  const newSchedTarget = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
  const reschedRes = await fetch(`${baseUrl}/api/campaigns/${createdCamp.id}/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduledAt: newSchedTarget })
  });
  const reschedData = await reschedRes.json();
  if (!reschedData.success) throw new Error(`Reschedule failed: ${reschedData.message}`);
  console.log(`✓ Rescheduled successfully to: ${reschedData.data.scheduledAt}`);

  // Test 8: Run Scheduled Campaign Now
  console.log("\n[HTTP Test 8] POST /api/campaigns/:id/run-now");
  const runNowRes = await fetch(`${baseUrl}/api/campaigns/${createdCamp.id}/run-now`, {
    method: "POST"
  });
  const runNowData = await runNowRes.json();
  if (!runNowData.success) throw new Error(`Run now failed: ${runNowData.message}`);
  console.log(`✓ Run Now triggered successfully!`);

  // Test 9: Export Campaign Delivery Report
  console.log("\n[HTTP Test 9] GET /api/campaigns/:id/export (Excel Report)");
  const exportRes = await fetch(`${baseUrl}/api/campaigns/${createdCamp.id}/export`);
  if (!exportRes.ok) throw new Error(`Export failed with status: ${exportRes.status}`);
  const reportBuffer = await exportRes.arrayBuffer();
  console.log(`✓ Excel report downloaded successfully (${reportBuffer.byteLength} bytes)`);

  // Test 10: Clean up campaign
  console.log("\n[HTTP Test 10] DELETE /api/campaigns/:id");
  const delRes = await fetch(`${baseUrl}/api/campaigns/${createdCamp.id}`, { method: "DELETE" });
  const delData = await delRes.json();
  if (!delData.success) throw new Error("Delete campaign failed");
  console.log(`✓ Cleaned up test campaign from server.`);

  console.log("\n========================================================");
  console.log("🎉 ALL 10 HTTP INTEGRATION TESTS PASSED WITH 100% SUCCESS!");
  console.log("========================================================");
  process.exit(0);
}

runHttpTests().catch(err => {
  console.error("❌ HTTP TEST FAILED:", err);
  process.exit(1);
});
