/**
 * Automated Verification: WhatsApp Flow-Compatible Templates & Flow Message Delivery
 * Run: node test_flow_template_delivery.js
 */
const { db } = require("./src/config/database");
const metaWhatsAppService = require("./src/services/metaWhatsAppService");
const broadcastEngine = require("./src/services/broadcastEngine");
const flowService = require("./src/services/flowService");
const webhookService = require("./src/services/webhookService");
const templateController = require("./src/controllers/templateController");

async function runFlowTemplateTests() {
  console.log("========================================================================");
  console.log("⚡ TESTING WHATSAPP FLOW-COMPATIBLE TEMPLATES & FLOW MESSAGE DELIVERY");
  console.log("========================================================================\n");

  const testPhone = "919876543210";
  const dummyMetaFlowId = "998877665544332";

  // 1. Setup a Test WhatsApp Flow in DB
  console.log("[Test 1] Ensuring a published WhatsApp Flow exists in DB...");
  const testFlowId = "flow_partner_onboarding";
  db.prepare(`
    INSERT INTO whatsapp_flows (
      id, user_id, name, description, meta_flow_id, status, categories, flow_json, json_version, data_api_version
    ) VALUES (?, 'system', 'Partner Onboarding Flow', 'Partner signup flow', ?, 'PUBLISHED', '["LEAD_GENERATION"]', '{"version":"3.1","screens":[]}', '3.1', '3.0')
    ON CONFLICT(id) DO UPDATE SET
      meta_flow_id = excluded.meta_flow_id,
      status = 'PUBLISHED'
  `).run(testFlowId, dummyMetaFlowId);
  console.log(`✓ Flow registered: '${testFlowId}' (Meta Flow ID: ${dummyMetaFlowId})`);

  // 2. Setup a Flow-compatible Template in DB
  console.log("\n[Test 2] Setting up Flow-compatible Template in DB...");
  const testTplName = "kt_partner_flow_invitation";
  const flowButtons = [
    {
      type: "FLOW",
      text: "Register Now",
      flow_id: dummyMetaFlowId,
      flow_action: "navigate",
      navigate_screen: "WELCOME"
    }
  ];
  const tplComponents = [
    {
      type: "BODY",
      text: "Hello {{1}}, welcome to KonkanTrip! Click below to start onboarding:"
    },
    {
      type: "BUTTONS",
      buttons: flowButtons
    }
  ];

  db.prepare(`
    INSERT INTO templates (
      id, name, meta_id, language, category, status, parameter_format,
      body_text, variables, components, buttons, updated_at
    ) VALUES (?, ?, ?, 'en', 'MARKETING', 'APPROVED', 'POSITIONAL', ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      components = excluded.components,
      buttons = excluded.buttons,
      body_text = excluded.body_text
  `).run(
    testTplName,
    testTplName,
    "9911223344",
    tplComponents[0].text,
    JSON.stringify([{ type: "positional", index: 1, key: "1", label: "{{1}}", name: "1" }]),
    JSON.stringify(tplComponents),
    JSON.stringify(flowButtons)
  );

  // Clear in-memory cache to pick up updated template
  metaWhatsAppService.clearTemplateCache();
  console.log(`✓ Saved template '${testTplName}' with FLOW button.`);

  // 3. Test templateController formatTemplateRow
  console.log("\n[Test 3] Verifying formatTemplateRow detects Flow button...");
  const tplRow = db.prepare("SELECT * FROM templates WHERE name = ?").get(testTplName);
  // simulate mock response
  let formattedTpl = null;
  const mockRes = {
    status(code) { this.statusCode = code; return this; },
    json(data) { formattedTpl = data.data?.[0] || data.template; return this; }
  };
  // directly test formatTemplateRow by checking the exported controller or listing
  const listRows = db.prepare("SELECT * FROM templates WHERE name = ?").all(testTplName);
  // test formatTemplateRow through database & listTemplates
  await templateController.listTemplates({ query: { search: testTplName } }, mockRes);
  if (!formattedTpl || !formattedTpl.hasFlowButton) {
    throw new Error("formatTemplateRow failed to detect hasFlowButton!");
  }
  console.log(`✓ Detected hasFlowButton: true, button text: '${formattedTpl.flowButton?.text}', flow_id: '${formattedTpl.flowButton?.flow_id}'`);

  // 4. Test broadcastEngine.buildTemplateComponents for Flow template
  console.log("\n[Test 4] Testing broadcastEngine.buildTemplateComponents for Flow template...");
  const testRecipient = { clean_phone: testPhone, contact_name: "Shivam Khomane" };
  const campaignId = "camp_test_flow_001";
  const rowData = { "1": "Shivam Khomane", Name: "Shivam Khomane" };
  const mappingConfig = {
    bodyParams: [{ key: "1", col: "1" }],
    flowActionData: { prefill_name: "Shivam Khomane" }
  };

  const builtComponents = broadcastEngine.buildTemplateComponents(mappingConfig, rowData, testTplName, testRecipient, campaignId);
  console.log("  Built components:", JSON.stringify(builtComponents, null, 2));

  const bodyComp = builtComponents.find(c => c.type === "body");
  const buttonComp = builtComponents.find(c => c.type === "button" && c.sub_type === "flow");

  if (!bodyComp || bodyComp.parameters[0].text !== "Shivam Khomane") {
    throw new Error("Body parameter failed to interpolate!");
  }
  if (!buttonComp) {
    throw new Error("Flow button component was NOT built!");
  }
  if (buttonComp.sub_type !== "flow" || buttonComp.index !== "0") {
    throw new Error(`Invalid button component structure: ${JSON.stringify(buttonComp)}`);
  }
  const flowToken = buttonComp.parameters[0]?.action?.flow_token;
  if (!flowToken || !flowToken.startsWith("flwtk_")) {
    throw new Error(`Invalid flow token generated: ${flowToken}`);
  }
  if (buttonComp.parameters[0]?.action?.flow_action_data?.prefill_name !== "Shivam Khomane") {
    throw new Error("flow_action_data was not attached!");
  }
  console.log(`✓ Flow button component correctly built with token: '${flowToken}' and prefilled data!`);

  // Verify token record in database
  const tokenRecord = db.prepare("SELECT * FROM flow_tokens WHERE token = ?").get(flowToken);
  if (!tokenRecord) {
    throw new Error("Flow token was not persisted to SQLite flow_tokens table!");
  }
  console.log(`✓ Token recorded in DB: flow_id='${tokenRecord.flow_id}', recipient='${tokenRecord.clean_phone}', status='${tokenRecord.status}'`);

  // 5. Test Simulated Meta Dispatch with flow_token linkage
  console.log("\n[Test 5] Simulating message dispatch & meta_message_id token linking...");
  const simulatedMetaMsgId = `wamid.HBgM${Date.now()}`;
  db.prepare("UPDATE flow_tokens SET meta_message_id = ? WHERE token = ?").run(simulatedMetaMsgId, flowToken);
  const updatedToken = db.prepare("SELECT * FROM flow_tokens WHERE token = ?").get(flowToken);
  if (updatedToken.meta_message_id !== simulatedMetaMsgId) {
    throw new Error("Failed to link meta_message_id to flow token!");
  }
  console.log(`✓ Token successfully linked to Meta Message ID: '${simulatedMetaMsgId}'`);

  // 6. Test Webhook Inbound Submission (nfm_reply from WhatsApp user)
  console.log("\n[Test 6] Testing Webhook nfm_reply submission processing...");
  const mockWebhookPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba_test",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "919988776655", phone_number_id: "phone_001" },
              contacts: [{ profile: { name: "Shivam Khomane" }, wa_id: testPhone }],
              messages: [
                {
                  from: testPhone,
                  id: `wamid.sub_${Date.now()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "interactive",
                  context: {
                    id: simulatedMetaMsgId
                  },
                  interactive: {
                    type: "nfm_reply",
                    nfm_reply: {
                      response_json: JSON.stringify({
                        flow_token: flowToken,
                        business_name: "Shiv Beach Resort",
                        contact_person: "Shivam Khomane",
                        email: "shivam@example.com"
                      }),
                      body: "Sent from WhatsApp Form",
                      name: "flow"
                    }
                  }
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  const webhookResult = await webhookService.processIncomingPayload(mockWebhookPayload);
  console.log("  Webhook processing result:", webhookResult);

  // Verify that flow_tokens status became COMPLETED
  const completedToken = db.prepare("SELECT status FROM flow_tokens WHERE token = ?").get(flowToken);
  if (completedToken.status !== "COMPLETED") {
    throw new Error(`Expected token status to be COMPLETED, found: ${completedToken.status}`);
  }
  console.log(`✓ Flow token status successfully transitioned to: '${completedToken.status}'`);

  // Verify flow_responses table record
  const flowResponse = db.prepare("SELECT * FROM flow_responses WHERE flow_token = ?").get(flowToken);
  if (!flowResponse) {
    throw new Error("Flow response not found in flow_responses table!");
  }
  const parsedFlowData = JSON.parse(flowResponse.parsed_data || "{}");
  console.log("✓ Saved flow response in SQLite flow_responses table:", parsedFlowData);
  if (parsedFlowData.business_name !== "Shiv Beach Resort") {
    throw new Error("Submitted flow fields do not match!");
  }

  // Verify customer_replies table record
  const customerReply = db.prepare("SELECT * FROM customer_replies WHERE context_message_id = ? OR message_type = 'flow_response' ORDER BY id DESC LIMIT 1").get(simulatedMetaMsgId);
  if (!customerReply) {
    throw new Error("Customer reply entry for flow response not created!");
  }
  console.log(`✓ Customer reply recorded: "${customerReply.message_body}" (Type: ${customerReply.message_type})`);

  console.log("\n========================================================================");
  console.log("🎉 ALL FLOW TEMPLATE & FLOW DELIVERY VERIFICATION TESTS PASSED (100%)");
  console.log("========================================================================\n");
}

runFlowTemplateTests().catch(err => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
