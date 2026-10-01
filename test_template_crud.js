/**
 * Automated Test: Template CRUD and Direct Add to System
 */
async function runTemplateCrudTests() {
  console.log("=== RUNNING TEMPLATE SYSTEM REGISTRY & CRUD TESTS ===\n");
  const baseUrl = "http://localhost:5000";

  // Test 1: List all templates
  console.log("[Test 1] GET /api/templates (List saved templates)");
  const listRes = await fetch(`${baseUrl}/api/templates`);
  const listData = await listRes.json();
  if (!listData.success) throw new Error(`List templates failed: ${listData.message}`);
  console.log(`✓ Fetched ${listData.data.length} saved templates:`);
  listData.data.forEach(t => console.log(`  - ${t.name} (Meta ID: ${t.meta_id}, Format: ${t.parameter_format})`));
  if (listData.data.length === 0) throw new Error("Expected seeded templates in database");

  // Test 2: Add template directly by Meta Template ID
  console.log("\n[Test 2] POST /api/templates with Template ID: 1059862786867912");
  const addRes1 = await fetch(`${baseUrl}/api/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateIdOrName: "1059862786867912",
      language: "en"
    })
  });
  const addData1 = await addRes1.json();
  if (!addData1.success) throw new Error(`Add template failed: ${addData1.message}`);
  console.log(`✓ Added template: ${addData1.data.name} (ID: ${addData1.data.id})`);
  console.log(`  Variables detected (${addData1.data.variables.length}):`, addData1.data.variables.map(v => v.label));

  // Test 3: Add template directly by Template Name
  console.log("\n[Test 3] POST /api/templates with Template Name: kt_restaurant_invitation");
  const addRes2 = await fetch(`${baseUrl}/api/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateIdOrName: "kt_restaurant_invitation",
      language: "en"
    })
  });
  const addData2 = await addRes2.json();
  if (!addData2.success) throw new Error(`Add template failed: ${addData2.message}`);
  console.log(`✓ Added/Updated template: ${addData2.data.name}`);

  // Test 4: Add custom template
  console.log("\n[Test 4] POST /api/templates (Custom Template)");
  const addRes3 = await fetch(`${baseUrl}/api/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateIdOrName: "weekend_special_offer",
      name: "weekend_special_offer",
      language: "en",
      category: "MARKETING",
      parameter_format: "POSITIONAL",
      bodyText: "Hi {{1}}, special weekend offer for {{2}}! Use code {{3}}.",
      variables: [
        { key: "1", label: "{{1}}", example: "Rahul" },
        { key: "2", label: "{{2}}", example: "Alibaug Resort" },
        { key: "3", label: "{{3}}", example: "WEEKEND50" }
      ]
    })
  });
  const addData3 = await addRes3.json();
  if (!addData3.success) throw new Error(`Add custom template failed: ${addData3.message}`);
  console.log(`✓ Created custom template: ${addData3.data.name}`);

  // Test 5: Verify custom template appears in list
  console.log("\n[Test 5] GET /api/templates (Verify new template in list)");
  const listRes2 = await fetch(`${baseUrl}/api/templates`);
  const listData2 = await listRes2.json();
  const foundCustom = listData2.data.find(t => t.name === "weekend_special_offer");
  if (!foundCustom) throw new Error("Custom template not found in list");
  console.log(`✓ Verified custom template in list with ${foundCustom.variables.length} variables`);

  // Test 6: Get single template details
  console.log("\n[Test 6] GET /api/templates/weekend_special_offer");
  const getRes = await fetch(`${baseUrl}/api/templates/weekend_special_offer`);
  const getData = await getRes.json();
  if (!getData.success || getData.data.name !== "weekend_special_offer") {
    throw new Error("Get single template failed");
  }
  console.log(`✓ Retrieved single template: ${getData.data.name}`);

  // Test 7: Delete custom template
  console.log("\n[Test 7] DELETE /api/templates/weekend_special_offer");
  const delRes = await fetch(`${baseUrl}/api/templates/weekend_special_offer`, { method: "DELETE" });
  const delData = await delRes.json();
  if (!delData.success) throw new Error(`Delete failed: ${delData.message}`);
  console.log(`✓ Deleted custom template successfully.`);

  // Test 8: Verify deletion
  const listRes3 = await fetch(`${baseUrl}/api/templates`);
  const listData3 = await listRes3.json();
  const deletedStillFound = listData3.data.find(t => t.name === "weekend_special_offer");
  if (deletedStillFound) throw new Error("Template should have been deleted");
  console.log(`✓ Verified template was cleanly removed.`);

  console.log("\n========================================================");
  console.log("🎉 ALL TEMPLATE DIRECT ADD & CRUD TESTS PASSED (100%)!");
  console.log("========================================================");
  process.exit(0);
}

runTemplateCrudTests().catch(err => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
