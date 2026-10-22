/**
 * SQLite Database Inspector Script for WhatsApp Bulk Broadcaster
 * Run anytime: node inspect_db.js
 */
const { db } = require("./src/config/database");

console.log("========================================================================");
console.log("📊 WHATSAPP BULK BROADCASTER - SQLITE DATABASE INSPECTION");
console.log("========================================================================\n");

// 1. Table Counts Summary
console.log("--- 1. TABLE RECORD COUNTS ---");
const tables = [
  "campaigns",
  "campaign_recipients",
  "customer_replies",
  "automated_booking_dispatches",
  "automated_booking_contacts",
  "templates",
  "users",
  "waba_phone_numbers",
  "contact_suppressions",
  "audit_logs"
];

for (const table of tables) {
  try {
    const row = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get();
    console.log(`  • ${table.padEnd(30)} : ${row.c} record(s)`);
  } catch (e) {
    console.log(`  • ${table.padEnd(30)} : [Table not created yet]`);
  }
}
console.log("");

// 2. Users in DB
console.log("--- 2. REGISTERED USERS ---");
try {
  const users = db.prepare("SELECT id, name, email, role, status, created_at FROM users").all();
  if (users.length === 0) {
    console.log("  (No users registered yet)");
  } else {
    users.forEach((u, i) => {
      console.log(`  [${i + 1}] ${u.name} <${u.email}> | Role: ${u.role} | Status: ${u.status} | ID: ${u.id}`);
    });
  }
} catch (e) {
  console.log("  Error checking users:", e.message);
}
console.log("");

// 3. Recent Broadcast Campaigns
console.log("--- 3. RECENT CAMPAIGNS (Last 10) ---");
try {
  const campaigns = db.prepare(`
    SELECT id, name, total_contacts, sent_count, failed_count, status, created_at, user_id 
    FROM campaigns 
    ORDER BY created_at DESC 
    LIMIT 10
  `).all();
  if (campaigns.length === 0) {
    console.log("  (No campaigns found)");
  } else {
    campaigns.forEach((c, i) => {
      console.log(`  [${i + 1}] "${c.name}" | Status: ${c.status} | Contacts: ${c.total_contacts} (Sent: ${c.sent_count}, Failed: ${c.failed_count}) | Created: ${c.created_at}`);
    });
  }
} catch (e) {
  console.log("  Error checking campaigns:", e.message);
}
console.log("");

// 4. Recent Customer Replies & Inbox Messages
console.log("--- 4. RECENT CUSTOMER REPLIES (Last 10) ---");
try {
  const replies = db.prepare(`
    SELECT id, from_phone, customer_name, message_type, message_body, reply_text, reply_status, received_at 
    FROM customer_replies 
    ORDER BY received_at DESC 
    LIMIT 10
  `).all();
  if (replies.length === 0) {
    console.log("  (No customer replies found)");
  } else {
    replies.forEach((r, i) => {
      const bodySnippet = (r.message_body || "").replace(/\n/g, " ").substring(0, 45);
      console.log(`  [${i + 1}] From: ${r.from_phone} (${r.customer_name || 'Guest'}) | Type: ${r.message_type} | "${bodySnippet}" | Received: ${r.received_at}`);
    });
  }
} catch (e) {
  console.log("  Error checking replies:", e.message);
}
console.log("");

// 5. Active Phone Number & Meta Setup
console.log("--- 5. WABA PHONE NUMBERS & SETTINGS ---");
try {
  const phones = db.prepare("SELECT phone_number_id, phone_number, display_name, quality_rating, is_default FROM waba_phone_numbers").all();
  if (phones.length === 0) {
    console.log("  (No WABA phone numbers registered)");
  } else {
    phones.forEach((p, i) => {
      console.log(`  [${i + 1}] ID: ${p.phone_number_id} | Phone: ${p.phone_number || 'N/A'} | Name: ${p.display_name || 'N/A'} | Quality: ${p.quality_rating} | Default: ${Boolean(p.is_default)}`);
    });
  }
} catch (e) {
  console.log("  Error checking phones:", e.message);
}

console.log("\n========================================================================");
console.log("💡 TIP: To run custom queries, run: node -e \"const { db } = require('./src/config/database'); console.log(db.prepare('YOUR SQL').all());\"");
console.log("========================================================================\n");
