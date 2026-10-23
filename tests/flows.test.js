const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { db, getSetting, setSetting } = require("../src/config/database");
const flowService = require("../src/services/flowService");
const flowCryptoService = require("../src/services/flowCryptoService");
const flowStarterTemplates = require("../src/services/flowStarterTemplates");
const webhookService = require("../src/services/webhookService");
const metaWhatsAppService = require("../src/services/metaWhatsAppService");
const flowController = require("../src/controllers/flowController");

describe("WhatsApp Flows Comprehensive Test Suite", () => {
  let testAdminUser = null;
  let testRegularUser = null;
  let testFlowId = null;

  before(() => {
    // 1. Ensure test users exist in DB
    const admin = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get();
    testAdminUser = admin || { id: "test_admin", role: "ADMIN", name: "Test Admin" };

    const regular = db.prepare("SELECT * FROM users WHERE role = 'USER' LIMIT 1").get();
    if (regular) {
      testRegularUser = regular;
    } else {
      const regId = `test_user_${Date.now()}`;
      db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, status)
        VALUES (?, 'Test User', ?, '919800000000', 'hash', 'USER', 'ACTIVE')
      `).run(regId, `user_${Date.now()}@example.com`);
      testRegularUser = { id: regId, role: "USER", name: "Test User" };
    }

    // 2. Ensure WHATSAPP_FLOWS_ENABLED is true for testing
    setSetting("WHATSAPP_FLOWS_ENABLED", "true");
  });

  describe("1. Starter Templates & Flow JSON Validation", () => {
    test("All 4 starter templates exist and are valid Meta Flow JSON", () => {
      const templates = flowStarterTemplates.getStarterTemplates();
      assert.strictEqual(templates.length, 4);

      const expectedSlugs = ["lead_capture", "appointment_booking", "customer_support", "customer_feedback"];
      expectedSlugs.forEach(slug => {
        const tpl = flowStarterTemplates.getTemplateBySlug(slug);
        assert.ok(tpl, `Template ${slug} should exist`);
        assert.ok(tpl.name);
        assert.ok(tpl.flow_json);

        const validation = flowService.validateFlowJson(tpl.flow_json);
        assert.strictEqual(validation.valid, true, `Template ${slug} validation failed: ${validation.error}`);
        assert.ok(validation.parsed.version);
        assert.ok(validation.parsed.screens.length > 0);
      });
    });

    test("validateFlowJson catches syntax errors and invalid JSON", () => {
      const invalidJson = "{ invalid_json: true ";
      const result = flowService.validateFlowJson(invalidJson);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes("Invalid JSON"));
    });

    test("validateFlowJson catches missing screens or screens not being an array", () => {
      const missingScreens = JSON.stringify({ version: "6.0" });
      const result = flowService.validateFlowJson(missingScreens);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes("screens"));
    });

    test("validateFlowJson catches missing title or data on screens", () => {
      const malformedScreen = JSON.stringify({
        version: "6.0",
        screens: [{ id: "SCREEN_ONE", layout: {} }] // Missing title and data
      });
      const result = flowService.validateFlowJson(malformedScreen);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes("title"));
    });
  });

  describe("2. Database Persistence & Token Management", () => {
    test("Can create, read, and update a local Flow draft record", () => {
      const flow = flowService.createLocalFlow({
        name: "Test Customer Survey",
        category: "SURVEY",
        description: "Unit test survey",
        flowJson: flowStarterTemplates.getTemplateBySlug("customer_feedback").flow_json,
        userId: testAdminUser.id
      });

      assert.ok(flow);
      assert.ok(flow.id);
      testFlowId = flow.id;
      assert.strictEqual(flow.name, "Test Customer Survey");
      assert.strictEqual(flow.category, "SURVEY");
      assert.strictEqual(flow.status, "DRAFT");

      // Update local flow
      const updated = flowService.updateLocalFlow(flow.id, {
        name: "Updated Customer Survey",
        meta_status: "DRAFT"
      });
      assert.strictEqual(updated.name, "Updated Customer Survey");
    });

    test("Opaque flow_token generation and resolution", () => {
      const token = flowService.createFlowToken({
        flowId: testFlowId,
        recipientPhone: "919999888877",
        contextMessageId: "ctx_msg_123",
        campaignId: null
      });

      assert.ok(token);
      assert.ok(token.startsWith("flwtk_"));

      const resolved = flowService.resolveFlowToken(token);
      assert.ok(resolved);
      assert.strictEqual(resolved.flow_id, testFlowId);
      assert.strictEqual(resolved.recipient_phone, "919999888877");
      assert.strictEqual(resolved.context_message_id, "ctx_msg_123");
    });
  });

  describe("3. Dynamic Flow Data Exchange Cryptography", () => {
    let keyPair = null;

    test("Generates valid RSA 2048-bit keypair and stores in settings", () => {
      keyPair = flowCryptoService.generateRsaKeyPair();
      assert.ok(keyPair.publicKey.includes("BEGIN PUBLIC KEY"));
      assert.ok(keyPair.privateKey.includes("BEGIN PRIVATE KEY"));

      setSetting("FLOWS_PRIVATE_KEY", keyPair.privateKey);
      setSetting("FLOWS_PUBLIC_KEY", keyPair.publicKey);

      const retrievedPriv = flowCryptoService.getPrivateKey();
      assert.strictEqual(retrievedPriv, keyPair.privateKey);

      const derivedPub = flowCryptoService.getPublicKey();
      assert.ok(derivedPub.includes("BEGIN PUBLIC KEY"));
    });

    test("Complete RSA-OAEP + AES-128-GCM roundtrip encryption/decryption with inverted IV", () => {
      // Simulate Meta calling our dynamic exchange endpoint:
      // 1. Meta generates 128-bit (16-byte) AES key and 12-byte IV
      const aesKey = crypto.randomBytes(16);
      const iv = crypto.randomBytes(12);

      // 2. Meta encrypts AES key with our RSA public key using RSA-OAEP SHA-256
      const encryptedAesKey = crypto.publicEncrypt(
        {
          key: keyPair.publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256"
        },
        aesKey
      ).toString("base64");

      // 3. Meta encrypts request payload using AES-128-GCM
      const incomingPayload = {
        version: "6.0",
        action: "ping"
      };
      const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, iv);
      const ciphertext = Buffer.concat([
        cipher.update(Buffer.from(JSON.stringify(incomingPayload), "utf8")),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();
      // Concatenate ciphertext + 16-byte auth tag as required by Meta Flow specs
      const encryptedFlowData = Buffer.concat([ciphertext, authTag]).toString("base64");

      // 4. Server decrypts incoming request
      const decrypted = flowCryptoService.decryptFlowPayload({
        encrypted_flow_data: encryptedFlowData,
        encrypted_aes_key: encryptedAesKey,
        initial_vector: iv.toString("base64")
      });

      assert.deepStrictEqual(decrypted.decryptedPayload, incomingPayload);
      assert.deepStrictEqual(decrypted.aesKey, aesKey);

      // 5. Server handles "ping" action
      const responseData = flowCryptoService.handleFlowAction(decrypted.decryptedPayload);
      assert.strictEqual(responseData.data.status, "active");

      // 6. Server encrypts response with inverted IV (~iv[i])
      const encryptedResponseBase64 = flowCryptoService.encryptFlowResponse({
        responsePayload: responseData,
        aesKey: decrypted.aesKey,
        initialVector: decrypted.initialVector
      });

      assert.ok(encryptedResponseBase64);

      // 7. Verify Meta client can decrypt response using inverted IV and original AES key
      const invertedIv = Buffer.alloc(iv.length);
      for (let i = 0; i < iv.length; i++) {
        invertedIv[i] = ~iv[i];
      }

      const responseBuf = Buffer.from(encryptedResponseBase64, "base64");
      const respCiphertext = responseBuf.subarray(0, responseBuf.length - 16);
      const respAuthTag = responseBuf.subarray(responseBuf.length - 16);

      const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, invertedIv);
      decipher.setAuthTag(respAuthTag);
      const decryptedRespBuf = Buffer.concat([
        decipher.update(respCiphertext),
        decipher.final()
      ]);
      const finalResp = JSON.parse(decryptedRespBuf.toString("utf8"));

      assert.strictEqual(finalResp.data.status, "active");
    });

    test("Rejects malformed or tampered encrypted data", () => {
      assert.throws(() => {
        flowCryptoService.decryptFlowPayload({
          encrypted_flow_data: "tampered_data_too_short",
          encrypted_aes_key: "invalid_key",
          initial_vector: "invalid_iv"
        });
      });
    });
  });

  describe("4. Outbound Interactive Flow Message Construction", () => {
    test("metaWhatsAppService.sendFlowMessage validates input and formats interactive payload", async () => {
      // Mock fetch to capture outbound request payload
      const originalFetch = global.fetch;
      let capturedPayload = null;
      let capturedUrl = null;

      global.fetch = async (url, options) => {
        capturedUrl = url;
        capturedPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messages: [{ id: "wamid.mock_flow_send_12345" }]
          })
        };
      };

      try {
        const result = await metaWhatsAppService.sendFlowMessage({
          to: "919999888877",
          flowId: "meta_flow_id_1001",
          flowToken: "flwtk_test_sample_token",
          bodyText: "Please fill out our booking questionnaire:",
          ctaText: "Start Booking",
          headerText: "Booking Form",
          footerText: "KonkanTrip Holidays",
          screen: "APPOINTMENT_SCREEN"
        });

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.messageId, "wamid.mock_flow_send_12345");

        // Verify payload shape according to Meta WhatsApp Flows Cloud API specifications
        assert.strictEqual(capturedPayload.messaging_product, "whatsapp");
        assert.strictEqual(capturedPayload.type, "interactive");
        assert.strictEqual(capturedPayload.interactive.type, "flow");
        assert.strictEqual(capturedPayload.interactive.header.text, "Booking Form");
        assert.strictEqual(capturedPayload.interactive.body.text, "Please fill out our booking questionnaire:");
        assert.strictEqual(capturedPayload.interactive.footer.text, "KonkanTrip Holidays");

        const action = capturedPayload.interactive.action;
        assert.strictEqual(action.name, "flow");
        assert.strictEqual(action.parameters.flow_message_version, "3");
        assert.strictEqual(action.parameters.flow_id, "meta_flow_id_1001");
        assert.strictEqual(action.parameters.flow_token, "flwtk_test_sample_token");
        assert.strictEqual(action.parameters.flow_cta, "Start Booking");
        assert.strictEqual(action.parameters.flow_action, "navigate");
        assert.strictEqual(action.parameters.flow_action_payload.screen, "APPOINTMENT_SCREEN");
      } finally {
        global.fetch = originalFetch;
      }
    });

    test("metaWhatsAppService.sendFlowMessage fails safely on invalid phone number", async () => {
      const result = await metaWhatsAppService.sendFlowMessage({
        to: "",
        flowId: "meta_flow_123"
      });
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes("Valid recipient phone number"));
    });

    test("metaWhatsAppService.sendFlowMessage fails safely on missing flow ID", async () => {
      const result = await metaWhatsAppService.sendFlowMessage({
        to: "919876543210",
        flowId: ""
      });
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes("flowId"));
    });
  });

  describe("5. Webhook Submissions Ingestion & Idempotency", () => {
    test("Parses nfm_reply Flow completion webhook and records response", async () => {
      const testToken = `flwtk_test_webhook_${Date.now()}`;
      db.prepare(`
        INSERT INTO flow_tokens (token, flow_id, recipient_phone, created_at)
        VALUES (?, ?, '919876543210', datetime('now'))
      `).run(testToken, testFlowId);

      const mockResponseData = {
        name: "Rahul Sharma",
        interest: "Luxury Beach Villa",
        preferred_dates: "2026-11-15",
        notes: "Need airport pickup"
      };

      const waMessageId = `wamid.flow_response_${Date.now()}`;

      const rawWebhookMessage = {
        from: "919876543210",
        id: waMessageId,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "interactive",
        interactive: {
          type: "nfm_reply",
          nfm_reply: {
            response_json: JSON.stringify(mockResponseData),
            body: "Sent Form Response",
            name: "flow"
          }
        },
        context: {
          id: "wamid.original_flow_message"
        }
      };

      // Ingest webhook message
      const savedReply = await webhookService.handleCustomerReply(rawWebhookMessage, "Rahul Sharma");

      assert.ok(savedReply);
      assert.strictEqual(savedReply.wa_message_id, waMessageId);
      assert.strictEqual(savedReply.message_type, "flow_response");
      assert.ok(savedReply.text.includes("Rahul Sharma"));
      assert.ok(savedReply.text.includes("Luxury Beach Villa"));

      // Verify record exists in flow_responses table
      const flowResp = db.prepare("SELECT * FROM flow_responses WHERE wa_message_id = ?").get(waMessageId);
      assert.ok(flowResp);
      assert.strictEqual(flowResp.sender_phone, "919876543210");
      const parsedStored = JSON.parse(flowResp.response_data);
      assert.strictEqual(parsedStored.interest, "Luxury Beach Villa");
    });

    test("Idempotency: Re-submitting the same Flow webhook does not create duplicate records", async () => {
      const waMessageId = `wamid.flow_idempotent_${Date.now()}`;
      const rawWebhookMessage = {
        from: "919876543210",
        id: waMessageId,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "interactive",
        interactive: {
          type: "nfm_reply",
          nfm_reply: {
            response_json: JSON.stringify({ rating: 5, comments: "Superb!" }),
            body: "Sent Feedback"
          }
        }
      };

      // First run
      const first = await webhookService.handleCustomerReply(rawWebhookMessage, "Customer");
      assert.ok(first);

      // Second run (duplicate from Meta retry)
      const second = await webhookService.handleCustomerReply(rawWebhookMessage, "Customer");
      assert.strictEqual(second, null);

      // Verify only 1 record in flow_responses
      const count = db.prepare("SELECT COUNT(*) as cnt FROM flow_responses WHERE wa_message_id = ?").get(waMessageId);
      assert.strictEqual(count.cnt, 1);
    });
  });

  describe("6. RBAC & Feature Flag Control", () => {
    test("flowController respects WHATSAPP_FLOWS_ENABLED = false", async () => {
      setSetting("WHATSAPP_FLOWS_ENABLED", "false");

      let statusCode = 200;
      let jsonResult = null;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: (data) => { jsonResult = data; return res; }
      };

      await flowController.listFlows({ user: testAdminUser, query: {} }, res);

      assert.strictEqual(statusCode, 403);
      assert.strictEqual(jsonResult.success, false);
      assert.ok(jsonResult.message.includes("disabled"));

      // Restore
      setSetting("WHATSAPP_FLOWS_ENABLED", "true");
    });

    test("flowController restricts publish/delete/sync to administrators", async () => {
      let statusCode = 200;
      let jsonResult = null;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: (data) => { jsonResult = data; return res; }
      };

      // Regular user tries to publish
      await flowController.publishFlow({ user: testRegularUser, params: { id: testFlowId } }, res);
      assert.strictEqual(statusCode, 403);
      assert.ok(jsonResult.message.includes("Administrator"));

      // Regular user tries to delete
      await flowController.deleteFlow({ user: testRegularUser, params: { id: testFlowId } }, res);
      assert.strictEqual(statusCode, 403);
      assert.ok(jsonResult.message.includes("Administrator"));

      // Regular user tries to generate keypair
      await flowController.generateKeyPair({ user: testRegularUser }, res);
      assert.strictEqual(statusCode, 403);
      assert.ok(jsonResult.message.includes("Administrator"));
    });
  });
});
