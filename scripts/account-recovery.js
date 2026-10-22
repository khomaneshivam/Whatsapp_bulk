#!/usr/bin/env node
/**
 * Emergency Account Recovery & Historical Data Attribution CLI Tool
 *
 * Usage on Server / Local:
 *   node scripts/account-recovery.js list
 *   node scripts/account-recovery.js reset-password <email> <newPassword>
 *   node scripts/account-recovery.js make-admin <email>
 *   node scripts/account-recovery.js claim-history <email>
 *   node scripts/account-recovery.js unassigned
 */

const path = require("path");
const bcrypt = require("bcryptjs");
const { db, initializeDatabase } = require("../src/config/database");

// Ensure tables and columns exist
try {
  initializeDatabase();
} catch (e) {}

const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

function printHelp() {
  console.log(`
===============================================================
 KonkanTrip WhatsApp Engine - Emergency Account Recovery CLI
===============================================================
Commands:
  node scripts/account-recovery.js list
    List all authorized accounts, roles, statuses, and campaign counts.

  node scripts/account-recovery.js reset-password <email> <newPassword>
    Instantly reset any user's password directly in the database.

  node scripts/account-recovery.js make-admin <email>
    Promote a user account to Master Admin.

  node scripts/account-recovery.js claim-history <email>
    Assign all unassigned legacy campaigns, replies, and dispatches to this user.

  node scripts/account-recovery.js unassigned
    Show count of unassigned historical data (user_id IS NULL).
===============================================================
`);
}

async function run() {
  try {
    switch (command) {
      case "list":
      case "users": {
        const users = db.prepare(`
          SELECT 
            u.id, u.name, u.email, u.phone, u.role, u.status, u.created_at,
            (SELECT COUNT(*) FROM campaigns c WHERE c.user_id = u.id) as campaigns_count,
            (SELECT COUNT(*) FROM customer_replies r WHERE r.user_id = u.id) as replies_count,
            (SELECT COUNT(*) FROM automated_booking_dispatches d WHERE d.user_id = u.id) as dispatches_count
          FROM users u
          ORDER BY u.created_at ASC
        `).all();

        console.log(`\nFound ${users.length} authorized user account(s):`);
        console.table(users.map(u => ({
          ID: u.id.length > 12 ? `${u.id.substring(0, 8)}...` : u.id,
          Name: u.name,
          Email: u.email,
          Phone: u.phone || "None",
          Role: u.role,
          Status: u.status,
          Campaigns: u.campaigns_count,
          Replies: u.replies_count,
          Dispatches: u.dispatches_count,
          Joined: u.created_at
        })));
        break;
      }

      case "reset-password": {
        if (!arg1 || !arg2) {
          console.error("Error: Missing arguments.\nUsage: node scripts/account-recovery.js reset-password <email> <newPassword>");
          process.exit(1);
        }

        const cleanEmail = arg1.trim().toLowerCase();
        const newPassword = arg2.trim();

        if (newPassword.length < 6) {
          console.error("Error: Password must be at least 6 characters.");
          process.exit(1);
        }

        const user = db.prepare("SELECT id, name, email FROM users WHERE email = ? COLLATE NOCASE").get(cleanEmail);
        if (!user) {
          console.error(`Error: User with email '${cleanEmail}' not found.`);
          process.exit(1);
        }

        console.log(`Hashing password for ${user.name} (${user.email})...`);
        const newHash = await bcrypt.hash(newPassword, 10);

        db.exec("BEGIN IMMEDIATE TRANSACTION;");
        try {
          db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newHash, user.id);
          try {
            db.prepare("UPDATE password_resets SET used = 1 WHERE user_id = ?").run(user.id);
          } catch (e) {}
          db.exec("COMMIT;");
        } catch (e) {
          db.exec("ROLLBACK;");
          throw e;
        }

        console.log(`\nSUCCESS: Password for '${user.email}' has been reset successfully!`);
        console.log(`The user can now login immediately with the new password.\n`);
        break;
      }

      case "make-admin": {
        if (!arg1) {
          console.error("Error: Missing email.\nUsage: node scripts/account-recovery.js make-admin <email>");
          process.exit(1);
        }

        const cleanEmail = arg1.trim().toLowerCase();
        const user = db.prepare("SELECT id, name, email, role FROM users WHERE email = ? COLLATE NOCASE").get(cleanEmail);
        if (!user) {
          console.error(`Error: User with email '${cleanEmail}' not found.`);
          process.exit(1);
        }

        db.prepare("UPDATE users SET role = 'ADMIN', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
        console.log(`\nSUCCESS: User '${user.email}' (${user.name}) has been elevated to role: ADMIN.\n`);
        break;
      }

      case "claim-history": {
        if (!arg1) {
          console.error("Error: Missing email.\nUsage: node scripts/account-recovery.js claim-history <email>");
          process.exit(1);
        }

        const cleanEmail = arg1.trim().toLowerCase();
        const user = db.prepare("SELECT id, name, email FROM users WHERE email = ? COLLATE NOCASE").get(cleanEmail);
        if (!user) {
          console.error(`Error: User with email '${cleanEmail}' not found.`);
          process.exit(1);
        }

        db.exec("BEGIN IMMEDIATE TRANSACTION;");
        try {
          const campRes = db.prepare("UPDATE campaigns SET user_id = ? WHERE user_id IS NULL").run(user.id);
          const replyRes = db.prepare("UPDATE customer_replies SET user_id = ? WHERE user_id IS NULL").run(user.id);
          const dispRes = db.prepare("UPDATE automated_booking_dispatches SET user_id = ? WHERE user_id IS NULL").run(user.id);
          const contRes = db.prepare("UPDATE automated_booking_contacts SET user_id = ? WHERE user_id IS NULL").run(user.id);

          db.exec("COMMIT;");

          console.log(`\nSUCCESS: Historical data attributed to ${user.name} (${user.email}):`);
          console.log(`  - Campaigns claimed:            ${campRes.changes}`);
          console.log(`  - Customer replies claimed:     ${replyRes.changes}`);
          console.log(`  - Booking dispatches claimed:   ${dispRes.changes}`);
          console.log(`  - Uploaded contacts claimed:    ${contRes.changes}\n`);
        } catch (e) {
          db.exec("ROLLBACK;");
          throw e;
        }
        break;
      }

      case "unassigned": {
        const unassignedCampaigns = db.prepare("SELECT COUNT(*) as count FROM campaigns WHERE user_id IS NULL").get().count;
        const unassignedReplies = db.prepare("SELECT COUNT(*) as count FROM customer_replies WHERE user_id IS NULL").get().count;
        const unassignedDispatches = db.prepare("SELECT COUNT(*) as count FROM automated_booking_dispatches WHERE user_id IS NULL").get().count;
        const unassignedContacts = db.prepare("SELECT COUNT(*) as count FROM automated_booking_contacts WHERE user_id IS NULL").get().count;

        console.log("\nUnassigned Legacy Data Status:");
        console.log(`  - Campaigns (user_id IS NULL):            ${unassignedCampaigns}`);
        console.log(`  - Customer Replies (user_id IS NULL):     ${unassignedReplies}`);
        console.log(`  - Booking Dispatches (user_id IS NULL):   ${unassignedDispatches}`);
        console.log(`  - Booking Contacts (user_id IS NULL):     ${unassignedContacts}\n`);
        break;
      }

      default:
        printHelp();
        break;
    }
  } catch (err) {
    console.error("Execution error:", err.message);
    process.exit(1);
  }
}

run();
