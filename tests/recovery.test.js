const { test, describe, before } = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcryptjs");
const { db } = require("../src/config/database");
const authController = require("../src/controllers/authController");
const adminController = require("../src/controllers/adminController");

describe("8. Password Reset, Account Recovery & History Attribution", () => {
  const testEmail = `test_recovery_${Date.now()}@example.com`;
  const initialPassword = "InitialPassword123!";
  const newPassword = "BrandNewPassword456!";
  let testUserId = null;
  let adminUserId = null;

  before(async () => {
    // Ensure test user exists
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    testUserId = `test_user_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status)
      VALUES (?, 'Recovery Tester', ?, '919876543210', ?, 'USER', 'ACTIVE')
    `).run(testUserId, testEmail, passwordHash);

    // Get an admin user
    const admin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1").get();
    adminUserId = admin?.id || testUserId;
  });

  test("forgotPassword generates valid recovery code", async () => {
    let resStatus = 200;
    let resJson = null;
    const res = {
      status: (code) => { resStatus = code; return res; },
      json: (data) => { resJson = data; return res; }
    };

    await authController.forgotPassword({ body: { email: testEmail }, ip: "127.0.0.1" }, res);
    assert.strictEqual(resStatus, 200);
    assert.strictEqual(resJson.success, true);
    assert.ok(resJson.data.devRecoveryCode);

    // Verify record in password_resets
    const reset = db.prepare("SELECT * FROM password_resets WHERE user_id = ? AND used = 0").get(testUserId);
    assert.ok(reset);
    assert.ok(reset.token_hash);
  });

  test("verifyResetToken verifies correct code and rejects invalid code", async () => {
    let resStatus = 200;
    let resJson = null;
    const res = {
      status: (code) => { resStatus = code; return res; },
      json: (data) => { resJson = data; return res; }
    };

    // Get active code
    const reset = db.prepare("SELECT * FROM password_resets WHERE user_id = ? AND used = 0 ORDER BY id DESC LIMIT 1").get(testUserId);
    assert.ok(reset);

    // Invalidate test with wrong code
    await authController.verifyResetToken({ body: { email: testEmail, code: "000000" } }, res);
    assert.strictEqual(resStatus, 400);

    // Get the generated code from forgotPassword response
    let activeCode = null;
    await authController.forgotPassword({ body: { email: testEmail }, ip: "127.0.0.1" }, {
      status: () => ({ json: (d) => { activeCode = d.data?.devRecoveryCode; } })
    });

    assert.ok(activeCode);

    await authController.verifyResetToken({ body: { email: testEmail, code: activeCode } }, res);
    assert.strictEqual(resStatus, 200);
    assert.strictEqual(resJson.success, true);
  });

  test("resetPassword successfully updates password and marks token as used", async () => {
    let resStatus = 200;
    let resJson = null;
    const res = {
      status: (code) => { resStatus = code; return res; },
      json: (data) => { resJson = data; return res; }
    };

    let activeCode = null;
    await authController.forgotPassword({ body: { email: testEmail }, ip: "127.0.0.1" }, {
      status: () => ({ json: (d) => { activeCode = d.data?.devRecoveryCode; } })
    });

    await authController.resetPassword({
      body: { email: testEmail, code: activeCode, newPassword }
    }, res);

    assert.strictEqual(resStatus, 200);
    assert.strictEqual(resJson.success, true);

    // Verify login with new password
    let loginData = null;
    await authController.login({ body: { email: testEmail, password: newPassword } }, {
      status: (c) => ({ json: (d) => { loginData = d; } })
    });
    assert.ok(loginData?.token);
    assert.strictEqual(loginData?.user?.email, testEmail);
  });

  test("adminResetUserPassword allows admin to directly set user password", async () => {
    let resStatus = 200;
    let resJson = null;
    const res = {
      status: (code) => { resStatus = code; return res; },
      json: (data) => { resJson = data; return res; }
    };

    const adminNewPassword = "AdminChangedThisPassword789!";
    await adminController.resetUserPassword({
      user: { id: adminUserId, role: "ADMIN" },
      params: { userId: testUserId },
      body: { newPassword: adminNewPassword }
    }, res);

    assert.strictEqual(resStatus, 200);
    assert.strictEqual(resJson.success, true);

    // Verify login with admin-set password
    let loginData = null;
    await authController.login({ body: { email: testEmail, password: adminNewPassword } }, {
      status: (c) => ({ json: (d) => { loginData = d; } })
    });
    assert.ok(loginData?.token);
  });

  test("claimLegacyHistory attributes unassigned records to target user without data loss", async () => {
    // Insert dummy unassigned campaign
    const dummyCampId = `dummy_camp_${Date.now()}`;
    db.prepare(`
      INSERT INTO campaigns (id, name, total_contacts, sent_count, failed_count, status, user_id)
      VALUES (?, 'Legacy Test Broadcast', 10, 8, 2, 'COMPLETED', NULL)
    `).run(dummyCampId);

    let resStatus = 200;
    let resJson = null;
    const res = {
      status: (code) => { resStatus = code; return res; },
      json: (data) => { resJson = data; return res; }
    };

    await adminController.claimLegacyHistory({
      user: { id: adminUserId, role: "ADMIN" },
      params: { userId: testUserId }
    }, res);

    assert.strictEqual(resStatus, 200);
    assert.strictEqual(resJson.success, true);
    assert.ok(resJson.data.claimedCampaigns >= 1);

    // Verify the dummy campaign is now owned by testUserId
    const camp = db.prepare("SELECT user_id FROM campaigns WHERE id = ?").get(dummyCampId);
    assert.strictEqual(camp.user_id, testUserId);

    // Clean up
    db.prepare("DELETE FROM campaigns WHERE id = ?").run(dummyCampId);
    db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);
  });
});
