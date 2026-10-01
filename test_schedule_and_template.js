/**
 * Automated Verification Script: Template Number & Excel Variable Mapping + Scheduling
 */
const { db } = require("./src/config/database.js");
const metaWhatsAppService = require("./src/services/metaWhatsAppService.js");
const broadcastEngine = require("./src/services/broadcastEngine.js");
const schedulerService = require("./src/services/schedulerService.js");
const crypto = require("crypto");

async function runTests() {
  console.log("=== STARTING AUTOMATED VERIFICATION ===");

  // Test 1: Dynamic template inspection by Template Number/ID
  console.log("\n[Test 1] Inspecting Template by ID: 1059862786867912");
  const tpl1 = await metaWhatsAppService.getTemplateDetails("1059862786867912");
  console.log(`✓ Fetched template: ${tpl1.name} (Status: ${tpl1.status}, Format: ${tpl1.parameter_format})`);
  console.log(`  Variables detected (${tpl1.variables.length}):`, tpl1.variables.map(v => v.label));
  console.log(`  Body text snippet:`, tpl1.bodyText.substring(0, 80) + "...");
  if (tpl1.variables.length !== 3) {
    throw new Error(`Expected 3 variables for 1059862786867912, got ${tpl1.variables.length}`);
  }

  // Test 2: Inspecting named parameter template
  console.log("\n[Test 2] Inspecting Template by ID: 1757343188867100");
  const tpl2 = await metaWhatsAppService.getTemplateDetails("1757343188867100");
  console.log(`✓ Fetched template: ${tpl2.name} (Status: ${tpl2.status}, Format: ${tpl2.parameter_format})`);
  console.log(`  Variables detected (${tpl2.variables.length}):`, tpl2.variables.map(v => v.label));

  // Test 3: Dynamic parameter component builder for arbitrary template & Excel row
  console.log("\n[Test 3] Testing dynamic parameter mapping from Excel row data");
  const sampleExcelRow = {
    Name: "John Doe",
    Mobile: "9876543210",
    Restaurant: "Seaside Bistro",
    Link: "https://konkantrip.com/partner/seaside"
  };

  const mappingConfig = {
    bodyParams: [
      { key: "1", col: "Name" },
      { key: "2", col: "Restaurant" },
      { key: "3", col: "Link" }
    ],
    parameterFormat: "POSITIONAL"
  };

  const components = broadcastEngine.buildTemplateComponents(mappingConfig, sampleExcelRow, "1059862786867912");
  console.log("✓ Built components payload:", JSON.stringify(components, null, 2));
  if (!components[0] || components[0].parameters.length !== 3) {
    throw new Error("Component building failed: expected 3 parameters");
  }
  if (components[0].parameters[0].text !== "John Doe") {
    throw new Error("Parameter 1 mapping incorrect, expected John Doe");
  }
  if (components[0].parameters[1].text !== "Seaside Bistro") {
    throw new Error("Parameter 2 mapping incorrect, expected Seaside Bistro");
  }

  // Test 4: Creating a Scheduled Campaign in SQLite
  console.log("\n[Test 4] Creating Scheduled Campaign (+2 hours)");
  const c1Id = "test_sched_" + crypto.randomBytes(4).toString("hex");
  const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO campaigns (
      id, name, file_name, total_contacts, valid_contacts, invalid_contacts,
      sent_count, failed_count, status, message_type, template_name,
      template_language, message_body, mapping_config, delay_ms, scheduled_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'SCHEDULED', 'TEMPLATE', ?, 'en', '', ?, 200, ?, CURRENT_TIMESTAMP)
  `).run(
    c1Id,
    "Test Scheduled Campaign",
    "contacts.xlsx",
    1,
    1,
    0,
    "1059862786867912",
    JSON.stringify(mappingConfig),
    futureDate
  );

  const campaign1 = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(c1Id);
  console.log(`✓ Created campaign ${campaign1.id} with status: ${campaign1.status}, scheduled_at: ${campaign1.scheduled_at}`);
  if (campaign1.status !== "SCHEDULED" || !campaign1.scheduled_at) {
    throw new Error("Campaign scheduling failed to save status or scheduled_at");
  }

  // Test 5: Rescheduling Campaign
  console.log("\n[Test 5] Rescheduling Campaign to +4 hours");
  const rescheduledDate = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  const rescheduleResult = schedulerService.rescheduleCampaign(campaign1.id, rescheduledDate);
  const updatedCampaign1 = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaign1.id);
  console.log(`✓ Rescheduled campaign: status: ${updatedCampaign1.status}, new scheduled_at: ${updatedCampaign1.scheduled_at}`);
  if (new Date(updatedCampaign1.scheduled_at).getTime() !== new Date(rescheduledDate).getTime()) {
    throw new Error("Reschedule time mismatch");
  }

  // Test 6: Cancelling Scheduled Campaign
  console.log("\n[Test 6] Cancelling Scheduled Campaign");
  const cancelResult = schedulerService.cancelSchedule(campaign1.id);
  const cancelledCampaign1 = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaign1.id);
  console.log(`✓ Cancelled campaign status: ${cancelledCampaign1.status}`);
  if (cancelledCampaign1.status !== "CANCELLED") {
    throw new Error("Cancel schedule failed, expected CANCELLED");
  }

  // Test 7: Scheduler Service Auto-Trigger
  console.log("\n[Test 7] Testing Scheduler Service Auto-Trigger (Due campaign in 2 seconds)");
  const c2Id = "test_auto_" + crypto.randomBytes(4).toString("hex");
  const dueTime = new Date(Date.now() + 2000).toISOString();

  db.prepare(`
    INSERT INTO campaigns (
      id, name, file_name, total_contacts, valid_contacts, invalid_contacts,
      sent_count, failed_count, status, message_type, template_name,
      template_language, message_body, mapping_config, delay_ms, scheduled_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'SCHEDULED', 'TEMPLATE', ?, 'en', '', ?, 200, ?, CURRENT_TIMESTAMP)
  `).run(
    c2Id,
    "Test Auto-Trigger Campaign",
    "contacts.xlsx",
    1,
    1,
    0,
    "kt_invitation_",
    JSON.stringify(mappingConfig),
    dueTime
  );

  db.prepare(`
    INSERT INTO campaign_recipients (
      campaign_id, phone_number, clean_phone, contact_name, raw_data, status
    ) VALUES (?, ?, ?, ?, ?, 'PENDING')
  `).run(
    c2Id,
    "9307382030",
    "919307382030",
    "Auto Test Lead",
    JSON.stringify(sampleExcelRow)
  );

  console.log(`Created campaign ${c2Id}, scheduled for ${dueTime}`);
  console.log("Checking scheduled campaigns before due time...");
  await schedulerService.checkScheduledCampaigns();
  let campBefore = db.prepare("SELECT status FROM campaigns WHERE id = ?").get(c2Id);
  console.log(`Campaign ${c2Id} status before due time: ${campBefore.status} (Expected: SCHEDULED)`);
  if (campBefore.status !== "SCHEDULED") {
    throw new Error(`Campaign should be SCHEDULED before due time, got ${campBefore.status}`);
  }

  console.log("Waiting 3.2 seconds for schedule to become due...");
  await new Promise(r => setTimeout(r, 3200));

  console.log("Running checkScheduledCampaigns after due time...");
  await schedulerService.checkScheduledCampaigns();
  let campAfter = db.prepare("SELECT status FROM campaigns WHERE id = ?").get(c2Id);
  console.log(`Campaign ${c2Id} status after wait: ${campAfter.status} (Expected: RUNNING or COMPLETED)`);
  if (campAfter.status === "SCHEDULED") {
    throw new Error(`Campaign ${c2Id} was not triggered by schedulerService`);
  }
  console.log(`✓ Successfully auto-triggered campaign ${c2Id}! Status is now: ${campAfter.status}`);

  // Clean up test campaigns from database
  db.prepare("DELETE FROM campaign_recipients WHERE campaign_id IN (?, ?)").run(c1Id, c2Id);
  db.prepare("DELETE FROM campaigns WHERE id IN (?, ?)").run(c1Id, c2Id);
  console.log("✓ Cleaned up test database records.");

  console.log("\n=== ALL 7 TESTS PASSED ACCURATELY! ===");
  process.exit(0);
}

runTests().catch(err => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
