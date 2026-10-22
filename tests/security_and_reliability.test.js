const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db, setSetting, getSetting } = require("../src/config/database");
const config = require("../src/config/env");
const metaWhatsAppService = require("../src/services/metaWhatsAppService");
const broadcastEngine = require("../src/services/broadcastEngine");

describe("Security, Multi-Tenant Isolation & WhatsApp Broadcast Reliability Test Suite", () => {
  let server;
  let baseUrl;
  let adminUser;
  let userA;
  let userB;
  let suspendedUser;
  let adminToken;
  let userAToken;
  let userBToken;
  let suspendedToken;
  let expiredToken;

  const testCampaignIds = [];
  const testUserIds = [];
  const testPhone = "+919876543210";
  const suppressedPhone = "919999999999";

  before(() => {
    // 1. Start ephemeral HTTP server
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // 2. Ensure test secret in config
    if (!config.META_APP_SECRET) {
      config.META_APP_SECRET = "test_meta_app_secret_32_characters_long!";
    }
    setSetting("META_APP_SECRET", config.META_APP_SECRET);
    setSetting("WEBHOOK_VERIFY_TOKEN", "test_verify_token_123");

    // 3. Seed test users
    const passwordHash = bcrypt.hashSync("TestSecret123!", 8);
    const now = new Date().toISOString();

    adminUser = {
      id: "test_admin_" + crypto.randomUUID().slice(0, 8),
      name: "Test Admin",
      email: `admin_${Date.now()}@example.com`,
      role: "ADMIN",
      status: "ACTIVE"
    };
    userA = {
      id: "test_usera_" + crypto.randomUUID().slice(0, 8),
      name: "Tenant User A",
      email: `usera_${Date.now()}@example.com`,
      role: "USER",
      status: "ACTIVE"
    };
    userB = {
      id: "test_userb_" + crypto.randomUUID().slice(0, 8),
      name: "Tenant User B",
      email: `userb_${Date.now()}@example.com`,
      role: "USER",
      status: "ACTIVE"
    };
    suspendedUser = {
      id: "test_suspended_" + crypto.randomUUID().slice(0, 8),
      name: "Suspended User",
      email: `suspended_${Date.now()}@example.com`,
      role: "USER",
      status: "SUSPENDED"
    };

    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const u of [adminUser, userA, userB, suspendedUser]) {
      insertUser.run(u.id, u.name, u.email, passwordHash, u.role, u.status, now, now);
      testUserIds.push(u.id);
    }

    // 4. Generate JWT tokens
    adminToken = jwt.sign({ userId: adminUser.id, email: adminUser.email, role: adminUser.role }, config.JWT_SECRET, { expiresIn: "1h" });
    userAToken = jwt.sign({ userId: userA.id, email: userA.email, role: userA.role }, config.JWT_SECRET, { expiresIn: "1h" });
    userBToken = jwt.sign({ userId: userB.id, email: userB.email, role: userB.role }, config.JWT_SECRET, { expiresIn: "1h" });
    suspendedToken = jwt.sign({ userId: suspendedUser.id, email: suspendedUser.email, role: suspendedUser.role }, config.JWT_SECRET, { expiresIn: "1h" });
    expiredToken = jwt.sign({ userId: userA.id, email: userA.email, role: userA.role }, config.JWT_SECRET, { expiresIn: "-1s" });
  });

  after(() => {
    // Clean up test data
    try {
      for (const cid of testCampaignIds) {
        db.prepare("DELETE FROM campaign_recipients WHERE campaign_id = ?").run(cid);
        db.prepare("DELETE FROM campaigns WHERE id = ?").run(cid);
      }
      for (const uid of testUserIds) {
        db.prepare("DELETE FROM users WHERE id = ?").run(uid);
      }
      db.prepare("DELETE FROM users WHERE email LIKE '%@ephemeral-test.internal' OR email LIKE '%@test.com' OR name LIKE '%Attacker%' OR name LIKE '%Test Verification%'").run();
      db.prepare("DELETE FROM contact_suppressions WHERE clean_phone = ?").run(suppressedPhone);
    } catch (e) {
      console.warn("Test cleanup warning:", e.message);
    }

    if (server) {
      server.close();
    }
  });

  // =========================================================================
  // 1. AUTHENTICATION & AUTHORIZATION HARDENING
  // =========================================================================
  describe("1. Authentication & Authorization Security", () => {
    test("Rejects unauthenticated request with 401 Unauthorized", async () => {
      const res = await fetch(`${baseUrl}/api/campaigns`);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /authentication|bearer|token required/i);
    });

    test("Rejects malformed Bearer token with 401 Unauthorized", async () => {
      const res = await fetch(`${baseUrl}/api/campaigns`, {
        headers: { Authorization: "Bearer definitely-invalid-jwt-token" }
      });
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /invalid authentication token/i);
    });

    test("Rejects expired JWT token with 401 Unauthorized", async () => {
      const res = await fetch(`${baseUrl}/api/campaigns`, {
        headers: { Authorization: `Bearer ${expiredToken}` }
      });
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /session expired/i);
    });

    test("Rejects suspended user with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/api/campaigns`, {
        headers: { Authorization: `Bearer ${suspendedToken}` }
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /suspended|inactive/i);
    });

    test("Blocks standard non-admin user from accessing admin endpoints (403 Forbidden)", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /master administrator privileges required/i);
    });

    test("Allows Master Administrator to access admin endpoints (200 OK)", async () => {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.data));
    });

    test("Generates single-purpose SSE stream token and validates stream endpoint", async () => {
      // 1. Fetch stream token
      const tokenRes = await fetch(`${baseUrl}/api/broadcast/stream-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userAToken}`
        }
      });
      assert.strictEqual(tokenRes.status, 200);
      const tokenData = await tokenRes.json();
      assert.strictEqual(tokenData.success, true);
      assert.ok(tokenData.streamToken);

      // Verify token decoded purpose
      const decoded = jwt.decode(tokenData.streamToken);
      assert.strictEqual(decoded.purpose, "sse_stream");
      assert.strictEqual(decoded.userId, userA.id);

      // 2. Reject stream without token
      const unauthStream = await fetch(`${baseUrl}/api/broadcast/stream?campaignId=test`);
      assert.strictEqual(unauthStream.status, 401);
    });

    test("User registering with email containing 'admin' is assigned role 'USER' (Prevents privilege escalation)", async () => {
      const email = `test_operator_admin_${Date.now()}@ephemeral-test.internal`;
      let createdUserId = null;
      try {
        const regRes = await fetch(`${baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Test Verification User",
            email,
            phone: "919999888877",
            password: "SecurePassword123!"
          })
        });
        assert.strictEqual(regRes.status, 201);
        const regData = await regRes.json();
        assert.strictEqual(regData.success, true);
        assert.strictEqual(regData.user.role, "USER");
        createdUserId = regData.user.id;
      } finally {
        if (createdUserId) {
          db.prepare("DELETE FROM users WHERE id = ?").run(createdUserId);
        }
      }
    });

    test("Database re-initialization does not alter or promote existing USER roles to ADMIN", async () => {
      // userA was seeded as a standard USER
      const beforeUser = db.prepare("SELECT role FROM users WHERE id = ?").get(userA.id);
      assert.strictEqual(beforeUser.role, "USER");

      // Trigger database re-initialization
      delete require.cache[require.resolve("../src/config/database")];
      const reloadedDbModule = require("../src/config/database");

      const afterUser = reloadedDbModule.db.prepare("SELECT role FROM users WHERE id = ?").get(userA.id);
      assert.strictEqual(afterUser.role, "USER");
    });

    test("Non-admin user cannot register WABA phone numbers (403 Forbidden)", async () => {
      const res = await fetch(`${baseUrl}/api/admin/phone-numbers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userAToken}`
        },
        body: JSON.stringify({
          displayName: "Hacked Phone",
          phoneNumber: "+919876500000",
          phoneNumberId: "123456789"
        })
      });
      assert.strictEqual(res.status, 403);
    });

    test("GET /api/settings/verify-meta rejects unauthenticated requests with 401", async () => {
      const res = await fetch(`${baseUrl}/api/settings/verify-meta`);
      assert.strictEqual(res.status, 401);
    });
  });

  // =========================================================================
  // 2. MULTI-TENANT ISOLATION & RESOURCE OWNERSHIP
  // =========================================================================
  describe("2. Multi-Tenant Resource Isolation", () => {
    let campaignAId;

    before(() => {
      campaignAId = "cmp_a_" + crypto.randomUUID().slice(0, 8);
      testCampaignIds.push(campaignAId);

      db.prepare(`
        INSERT INTO campaigns (id, user_id, name, total_contacts, valid_contacts, status, delay_ms)
        VALUES (?, ?, ?, 10, 10, 'DRAFT', 250)
      `).run(campaignAId, userA.id, "User A Private Campaign");
    });

    test("Owner (User A) can view Campaign A details", async () => {
      const res = await fetch(`${baseUrl}/api/campaigns/${campaignAId}`, {
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.campaign.id, campaignAId);
    });

    test("Tenant B cannot view Campaign A details (403 Forbidden)", async () => {
      const res = await fetch(`${baseUrl}/api/campaigns/${campaignAId}`, {
        headers: { Authorization: `Bearer ${userBToken}` }
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /access|permission|forbidden/i);
    });

    test("Tenant B cannot start Campaign A (403 Forbidden)", async () => {
      const res = await fetch(`${baseUrl}/api/broadcast/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userBToken}`
        },
        body: JSON.stringify({ campaignId: campaignAId })
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /access|permission|forbidden/i);
    });

    test("Tenant B cannot delete Campaign A (403 Forbidden)", async () => {
      const res = await fetch(`${baseUrl}/api/campaigns/${campaignAId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userBToken}` }
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /access|permission|forbidden/i);
    });

    test("Tenant B cannot export Campaign A report (403 Forbidden)", async () => {
      const res = await fetch(`${baseUrl}/api/campaigns/${campaignAId}/export`, {
        headers: { Authorization: `Bearer ${userBToken}` }
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
    });

    test("Campaign listing filters strictly by authenticated user", async () => {
      const listA = await fetch(`${baseUrl}/api/campaigns`, {
        headers: { Authorization: `Bearer ${userAToken}` }
      }).then(r => r.json());

      const listB = await fetch(`${baseUrl}/api/campaigns`, {
        headers: { Authorization: `Bearer ${userBToken}` }
      }).then(r => r.json());

      assert.ok(listA.data.some(c => c.id === campaignAId), "User A should see Campaign A");
      assert.ok(!listB.data.some(c => c.id === campaignAId), "User B must NOT see Campaign A");
    });
  });

  // =========================================================================
  // 3. SENSITIVE CREDENTIAL MASKING & SETTINGS PROTECTION
  // =========================================================================
  describe("3. Secrets Masking & Settings Protection", () => {
    test("GET /api/settings masks sensitive tokens and secrets as ••••••••", async () => {
      setSetting("WHATSAPP_API_TOKEN", "EAAX_very_sensitive_live_token_12345");
      setSetting("META_APP_SECRET", "super_secret_meta_app_secret_value");
      setSetting("JWT_SECRET", "super_secret_jwt_signing_key_32chars");

      const res = await fetch(`${baseUrl}/api/settings`, {
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      assert.ok(data.data.WHATSAPP_API_TOKEN.includes("••••••••"));
      assert.ok(data.data.META_APP_SECRET.includes("••••••••"));
      assert.ok(data.data.WEBHOOK_VERIFY_TOKEN.includes("••••••••"));
      assert.ok(data.data.JWT_SECRET.includes("••••••••"));
    });

    test("Non-admin user cannot modify platform settings (403 Forbidden)", async () => {
      const res = await fetch(`${baseUrl}/api/settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userAToken}`
        },
        body: JSON.stringify({ WHATSAPP_API_TOKEN: "malicious_token_override" })
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /master administrator/i);
    });
  });

  // =========================================================================
  // 4. META CLOUD API WEBHOOK HMAC VERIFICATION & IDEMPOTENCY
  // =========================================================================
  describe("4. Meta Webhook HMAC Verification & Event Idempotency", () => {
    test("GET /webhook accepts valid verify token and echoes challenge", async () => {
      const challenge = "challenge_code_987654";
      const res = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token_123&hub.challenge=${challenge}`);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.strictEqual(text, challenge);
    });

    test("GET /webhook rejects invalid verify token with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test`);
      assert.strictEqual(res.status, 403);
    });

    test("POST /webhook rejects request missing x-hub-signature-256 header (403 Forbidden)", async () => {
      const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
      const res = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /signature|forbidden/i);
    });

    test("POST /webhook rejects invalid HMAC signature (403 Forbidden)", async () => {
      const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
      const res = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": "sha256=0000000000000000000000000000000000000000000000000000000000000000"
        },
        body: payload
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /signature|forbidden/i);
    });

    test("POST /webhook accepts valid HMAC signature and processes payload idempotently", async () => {
      const secret = config.META_APP_SECRET || getSetting("META_APP_SECRET");
      const entryId = "entry_" + Date.now();
      const msgId = "wamid.test_msg_" + Date.now();
      const payload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          {
            id: entryId,
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: { display_phone_number: "919999999999", phone_number_id: "test_phone_id" },
                  messages: [
                    {
                      from: "919876543210",
                      id: msgId,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      text: { body: "Hello test reply" },
                      type: "text"
                    }
                  ]
                },
                field: "messages"
              }
            ]
          }
        ]
      });

      const hmac = "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");

      // First dispatch
      const res1 = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": hmac
        },
        body: payload
      });
      assert.strictEqual(res1.status, 200);

      // Verify event was recorded in incoming_webhook_events
      const eventRow = db.prepare("SELECT * FROM incoming_webhook_events WHERE event_id = ?").get(entryId);
      assert.ok(eventRow, "Incoming event should be recorded in incoming_webhook_events table");

      // Second identical dispatch (Idempotency)
      const res2 = await fetch(`${baseUrl}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": hmac
        },
        body: payload
      });
      assert.strictEqual(res2.status, 200);
    });
  });

  // =========================================================================
  // 5. BROADCAST RELIABILITY, CONCURRENCY & AMBIGUITY
  // =========================================================================
  describe("5. Broadcast Engine Reliability, Concurrency & Ambiguity", () => {
    test("Atomic Campaign Lock prevents double launch of the same campaign", async () => {
      const testCid = "cmp_atomic_" + crypto.randomUUID().slice(0, 8);
      testCampaignIds.push(testCid);

      db.prepare(`
        INSERT INTO campaigns (id, user_id, name, total_contacts, valid_contacts, status)
        VALUES (?, ?, 'Atomic Lock Test', 5, 5, 'DRAFT')
      `).run(testCid, userA.id);

      // 1. First atomic claim
      const claim1 = db.prepare(`
        UPDATE campaigns 
        SET status = 'RUNNING' 
        WHERE id = ? AND status IN ('DRAFT', 'SCHEDULED', 'PAUSED')
      `).run(testCid);
      assert.strictEqual(claim1.changes, 1, "First launch claim must succeed");

      // 2. Concurrent second claim on same campaign
      const claim2 = db.prepare(`
        UPDATE campaigns 
        SET status = 'RUNNING' 
        WHERE id = ? AND status IN ('DRAFT', 'SCHEDULED', 'PAUSED')
      `).run(testCid);
      assert.strictEqual(claim2.changes, 0, "Second launch claim must fail due to atomic lock");
    });

    test("Opt-out contact suppression prevents dispatching to unsubscribed users", async () => {
      // 1. Add number to contact_suppressions table (clean_phone)
      db.prepare(`
        INSERT OR REPLACE INTO contact_suppressions (clean_phone, reason)
        VALUES (?, 'STOP_OPT_OUT')
      `).run(suppressedPhone);

      const checkRow = db.prepare("SELECT * FROM contact_suppressions WHERE clean_phone = ?").get(suppressedPhone);
      assert.ok(checkRow, "Suppression record must exist");

      // 2. Set up campaign with a suppressed recipient
      const suppCid = "cmp_supp_" + crypto.randomUUID().slice(0, 8);
      testCampaignIds.push(suppCid);

      db.prepare(`
        INSERT INTO campaigns (id, user_id, name, total_contacts, valid_contacts, status, delay_ms)
        VALUES (?, ?, 'Suppression Test Campaign', 1, 1, 'RUNNING', 50)
      `).run(suppCid, userA.id);

      db.prepare(`
        INSERT INTO campaign_recipients (campaign_id, phone_number, clean_phone, contact_name, status)
        VALUES (?, ?, ?, 'Suppressed Contact', 'PENDING')
      `).run(suppCid, suppressedPhone, suppressedPhone);

      // 3. Run broadcast engine queue directly on this campaign
      let apiCalled = false;
      const originalSend = metaWhatsAppService.sendTemplateMessage;
      metaWhatsAppService.sendTemplateMessage = async () => {
        apiCalled = true;
        return { success: true, messageId: "wamid.should_not_be_called" };
      };

      try {
        const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(suppCid);
        const jobState = { paused: false, cancelled: false, running: true, delayMs: 50 };
        broadcastEngine.activeJobs.set(suppCid, jobState);
        await broadcastEngine.runQueue(campaign, jobState);
      } finally {
        metaWhatsAppService.sendTemplateMessage = originalSend;
      }

      // 4. Verify recipient status is FAILED with error_code SUPPRESSED_OPT_OUT and API was NOT called
      assert.strictEqual(apiCalled, false, "Meta API must NOT be called for suppressed opt-out contacts");
      const recip = db.prepare("SELECT status, error_code, error_message FROM campaign_recipients WHERE campaign_id = ?").get(suppCid);
      assert.strictEqual(recip.status, "FAILED");
      assert.strictEqual(recip.error_code, "SUPPRESSED_OPT_OUT");
      assert.match(recip.error_message, /opted out|suppression/i);
    });

    test("Ambiguous outcome (network timeout) marks recipient as UNKNOWN without blind resend", async () => {
      const ambigCid = "cmp_ambig_" + crypto.randomUUID().slice(0, 8);
      testCampaignIds.push(ambigCid);

      db.prepare(`
        INSERT INTO campaigns (id, user_id, name, total_contacts, valid_contacts, status, delay_ms)
        VALUES (?, ?, 'Ambiguity Test Campaign', 1, 1, 'RUNNING', 50)
      `).run(ambigCid, userA.id);

      const targetPhone = "919123456789";
      db.prepare(`
        INSERT INTO campaign_recipients (campaign_id, phone_number, clean_phone, contact_name, status)
        VALUES (?, ?, ?, 'Ambiguous Contact', 'PENDING')
      `).run(ambigCid, targetPhone, targetPhone);

      // Mock metaWhatsAppService to throw a timeout / ambiguous error
      const originalSend = metaWhatsAppService.sendTemplateMessage;
      metaWhatsAppService.sendTemplateMessage = async () => {
        const timeoutErr = new Error("Meta API request timed out (15000ms)");
        timeoutErr.isAmbiguous = true;
        timeoutErr.code = "AMBIGUOUS_TIMEOUT";
        throw timeoutErr;
      };

      try {
        const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(ambigCid);
        const jobState = { paused: false, cancelled: false, running: true, delayMs: 50 };
        broadcastEngine.activeJobs.set(ambigCid, jobState);
        await broadcastEngine.runQueue(campaign, jobState);
      } finally {
        metaWhatsAppService.sendTemplateMessage = originalSend;
      }

      // Verify recipient was recorded as UNKNOWN with AMBIGUOUS_TIMEOUT error
      const recip = db.prepare("SELECT status, error_code, error_message FROM campaign_recipients WHERE campaign_id = ?").get(ambigCid);
      assert.strictEqual(recip.status, "UNKNOWN", "Recipient must be marked UNKNOWN on ambiguous timeout");
      assert.strictEqual(recip.error_code, "AMBIGUOUS_TIMEOUT");
      assert.match(recip.error_message, /timed out/i);

      // Verify campaign unknown_count is 1
      const campaign = db.prepare("SELECT unknown_count FROM campaigns WHERE id = ?").get(ambigCid);
      assert.strictEqual(campaign.unknown_count, 1, "Campaign unknown_count must increment");
    });
  });

  // =========================================================================
  // 6. PATH TRAVERSAL DEFENSE
  // =========================================================================
  describe("6. Path Traversal & Static Upload Defense", () => {
    test("Rejects path traversal attempts under /uploads directory with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/uploads/%2e%2e%2fpackage.json`);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /path traversal/i);
    });

    test("Rejects path traversal attempts under /uploads/inbound/ with 403 Forbidden", async () => {
      const res = await fetch(`${baseUrl}/uploads/inbound/%2e%2e%2f%2e%2e%2fpackage.json`);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /path traversal/i);
    });
  });

  // =========================================================================
  // 7. 2-WAY INBOX RELIABILITY & RELOAD VERIFICATION
  // =========================================================================
  describe("7. 2-Way Inbox Reliability & Reload", () => {
    const inboxTestPhone = "919876000001";
    let replyRowId = null;

    test("GET /api/inbox/replies supports high limits (limit=1000) for full conversation history", async () => {
      // Seed a customer reply with custom name
      const insertReply = db.prepare(`
        INSERT INTO customer_replies (
          wa_message_id, from_phone, customer_name, message_type, message_body, is_read, user_id, received_at
        ) VALUES (?, ?, 'Special Guest', 'text', 'Hello from inbox test', 0, ?, CURRENT_TIMESTAMP)
      `).run("wamid.inbox_test_" + Date.now(), inboxTestPhone, userA.id);
      replyRowId = insertReply.lastInsertRowid;

      const res = await fetch(`${baseUrl}/api/inbox/replies?limit=1000`, {
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.replies));
      assert.ok(data.pagination.limit >= 1000 || data.pagination.limit === 1000);
      assert.ok(data.replies.some(r => r.from_phone === inboxTestPhone));
    });

    test("POST /api/inbox/reply preserves customer name and creates outbound message record", async () => {
      // Mock meta sendTextMessage to avoid real network call
      const originalSend = metaWhatsAppService.sendTextMessage;
      metaWhatsAppService.sendTextMessage = async () => ({
        success: true,
        messageId: "wamid.mock_outbound_" + Date.now()
      });

      try {
        const res = await fetch(`${baseUrl}/api/inbox/reply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userAToken}`
          },
          body: JSON.stringify({
            to: inboxTestPhone,
            message: "Thank you for reaching out!"
          })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);

        // Verify outbound message preserved 'Special Guest'
        const outbound = db.prepare(`
          SELECT * FROM customer_replies 
          WHERE from_phone = ? AND message_type = 'outbound' 
          ORDER BY id DESC LIMIT 1
        `).get(inboxTestPhone);
        assert.ok(outbound);
        assert.strictEqual(outbound.customer_name, "Special Guest");
        assert.strictEqual(outbound.reply_text, "Thank you for reaching out!");
      } finally {
        metaWhatsAppService.sendTextMessage = originalSend;
      }
    });

    test("DELETE /api/inbox/conversation/:phone cleans up conversation history", async () => {
      const res = await fetch(`${baseUrl}/api/inbox/conversation/${inboxTestPhone}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userAToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      // Verify records removed
      const remaining = db.prepare("SELECT COUNT(*) as c FROM customer_replies WHERE from_phone = ?").get(inboxTestPhone);
      assert.strictEqual(remaining.c, 0);
    });
  });
});
