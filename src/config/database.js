const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { DatabaseSync } = require("node:sqlite");
const config = require("./env");

// Ensure data directory exists inside whatsapp_bulk/
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

const dbPath = path.join(config.DATA_DIR, "whatsapp_bulk.db");
const db = new DatabaseSync(dbPath);

// Enable WAL mode and tune SQLite performance for high-throughput production (2000+ msgs)
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec("PRAGMA cache_size = -64000;"); // 64MB memory page cache
db.exec("PRAGMA temp_store = MEMORY;");

// Initialize tables
function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_name TEXT,
      total_contacts INTEGER DEFAULT 0,
      valid_contacts INTEGER DEFAULT 0,
      invalid_contacts INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'DRAFT',
      message_type TEXT DEFAULT 'TEMPLATE',
      template_name TEXT,
      template_language TEXT DEFAULT 'en_US',
      message_body TEXT,
      mapping_config TEXT,
      delay_ms INTEGER DEFAULT 250,
      scheduled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS campaign_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      clean_phone TEXT NOT NULL,
      contact_name TEXT,
      raw_data TEXT,
      rendered_message TEXT,
      status TEXT DEFAULT 'PENDING',
      meta_message_id TEXT,
      error_message TEXT,
      sent_at DATETIME,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      meta_id TEXT,
      language TEXT NOT NULL DEFAULT 'en',
      category TEXT DEFAULT 'MARKETING',
      status TEXT DEFAULT 'APPROVED',
      parameter_format TEXT DEFAULT 'POSITIONAL',
      body_text TEXT,
      variables TEXT,
      components TEXT,
      buttons TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wa_message_id TEXT UNIQUE,
      from_phone TEXT NOT NULL,
      customer_name TEXT,
      message_type TEXT DEFAULT 'text',
      message_body TEXT,
      raw_payload TEXT,
      context_message_id TEXT,
      campaign_id TEXT,
      is_read INTEGER DEFAULT 0,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reply_text TEXT,
      reply_sent_at DATETIME,
      reply_status TEXT,
      user_id TEXT,
      media_url TEXT,
      media_type TEXT,
      media_caption TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS automated_booking_dispatches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id TEXT,
      guest_name TEXT,
      phone_number TEXT NOT NULL,
      clean_phone TEXT NOT NULL,
      property_name TEXT,
      checkin_date TEXT,
      checkout_date TEXT,
      trigger_type TEXT NOT NULL,
      template_name TEXT NOT NULL,
      meta_message_id TEXT,
      status TEXT DEFAULT 'SENT',
      error_message TEXT,
      dispatched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'USER' CHECK(role IN ('ADMIN', 'USER')),
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SUSPENDED')),
      assigned_phone_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS waba_phone_numbers (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      phone_number_id TEXT UNIQUE NOT NULL,
      waba_id TEXT,
      quality_rating TEXT DEFAULT 'GREEN',
      status TEXT DEFAULT 'VERIFIED',
      is_default INTEGER DEFAULT 0,
      registered_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS automated_booking_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id TEXT,
      guest_name TEXT,
      phone_number TEXT,
      clean_phone TEXT NOT NULL,
      property_name TEXT,
      checkin_date TEXT,
      checkout_date TEXT,
      raw_data TEXT,
      source TEXT DEFAULT 'UPLOAD',
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_suppressions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clean_phone TEXT UNIQUE NOT NULL,
      reason TEXT DEFAULT 'USER_OPT_OUT',
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT NOT NULL,
      target_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS incoming_webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE,
      event_type TEXT,
      status TEXT DEFAULT 'PROCESSED',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_recipients_campaign ON campaign_recipients(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_recipients_status ON campaign_recipients(campaign_id, status);
    CREATE INDEX IF NOT EXISTS idx_templates_name ON templates(name);
    CREATE INDEX IF NOT EXISTS idx_templates_meta_id ON templates(meta_id);
    CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
    CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
    CREATE INDEX IF NOT EXISTS idx_replies_phone ON customer_replies(from_phone);
    CREATE INDEX IF NOT EXISTS idx_replies_campaign ON customer_replies(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_replies_received ON customer_replies(received_at);
    CREATE INDEX IF NOT EXISTS idx_replies_is_read ON customer_replies(is_read);
    CREATE INDEX IF NOT EXISTS idx_auto_booking_phone_trigger ON automated_booking_dispatches(clean_phone, trigger_type, checkin_date);
    CREATE INDEX IF NOT EXISTS idx_auto_booking_dispatched ON automated_booking_dispatches(dispatched_at);
    CREATE INDEX IF NOT EXISTS idx_auto_contacts_phone ON automated_booking_contacts(clean_phone);
    CREATE INDEX IF NOT EXISTS idx_auto_contacts_checkin ON automated_booking_contacts(checkin_date);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_waba_phone_id ON waba_phone_numbers(phone_number_id);
    CREATE INDEX IF NOT EXISTS idx_suppressions_phone ON contact_suppressions(clean_phone);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
  `);

  // Migrate existing databases: add scheduled_at, unknown_count, estimated_cost to campaigns
  try {
    const tableInfo = db.prepare("PRAGMA table_info(campaigns)").all();
    const colNames = tableInfo.map(col => col.name);
    if (!colNames.includes("scheduled_at")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN scheduled_at DATETIME;");
    }
    if (!colNames.includes("unknown_count")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN unknown_count INTEGER DEFAULT 0;");
    }
    if (!colNames.includes("estimated_cost")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN estimated_cost REAL DEFAULT 0;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_campaigns_status_scheduled ON campaigns(status, scheduled_at);");
  } catch (migErr) {
    console.warn("[DB Migration] campaigns columns check:", migErr.message);
  }

  // Migrate customer_replies: add reply tracking columns if not present
  try {
    const replyTableInfo = db.prepare("PRAGMA table_info(customer_replies)").all();
    const cols = replyTableInfo.map(c => c.name);
    if (!cols.includes("reply_text")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN reply_text TEXT;");
    }
    if (!cols.includes("reply_sent_at")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN reply_sent_at DATETIME;");
    }
    if (!cols.includes("reply_status")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN reply_status TEXT;");
    }
    if (!cols.includes("user_id")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN user_id TEXT;");
    }
    if (!cols.includes("media_url")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN media_url TEXT;");
    }
    if (!cols.includes("media_type")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN media_type TEXT;");
    }
    if (!cols.includes("media_caption")) {
      db.exec("ALTER TABLE customer_replies ADD COLUMN media_caption TEXT;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_customer_replies_user ON customer_replies(user_id);");
  } catch (migErr2) {
    console.warn("[DB Migration] customer_replies columns check:", migErr2.message);
  }

  // Migrate campaigns: add user_id and phone_number_id columns if not present
  try {
    const tableInfo = db.prepare("PRAGMA table_info(campaigns)").all();
    const cols = tableInfo.map(c => c.name);
    if (!cols.includes("user_id")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN user_id TEXT;");
    }
    if (!cols.includes("phone_number_id")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN phone_number_id TEXT;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);");
  } catch (migErr3) {
    console.warn("[DB Migration] campaigns user columns check:", migErr3.message);
  }

  // Migrate campaign_recipients: add delivery tracking timestamps and error_code if not present
  try {
    const recipTableInfo = db.prepare("PRAGMA table_info(campaign_recipients)").all();
    const recipCols = recipTableInfo.map(c => c.name);
    if (!recipCols.includes("delivered_at")) {
      db.exec("ALTER TABLE campaign_recipients ADD COLUMN delivered_at DATETIME;");
    }
    if (!recipCols.includes("read_at")) {
      db.exec("ALTER TABLE campaign_recipients ADD COLUMN read_at DATETIME;");
    }
    if (!recipCols.includes("failed_at")) {
      db.exec("ALTER TABLE campaign_recipients ADD COLUMN failed_at DATETIME;");
    }
    if (!recipCols.includes("error_code")) {
      db.exec("ALTER TABLE campaign_recipients ADD COLUMN error_code TEXT;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_recipients_meta_msg_id ON campaign_recipients(meta_message_id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_recipients_pending_batch ON campaign_recipients(campaign_id, status, id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_recipients_clean_phone ON campaign_recipients(clean_phone);");
  } catch (migErrRecip) {
    console.warn("[DB Migration] campaign_recipients delivery columns check:", migErrRecip.message);
  }

  // Migrate campaigns: add delivered_count and read_count columns if not present
  try {
    const campTableInfo = db.prepare("PRAGMA table_info(campaigns)").all();
    const campCols = campTableInfo.map(c => c.name);
    if (!campCols.includes("delivered_count")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN delivered_count INTEGER DEFAULT 0;");
    }
    if (!campCols.includes("read_count")) {
      db.exec("ALTER TABLE campaigns ADD COLUMN read_count INTEGER DEFAULT 0;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_replies_context_msg ON customer_replies(context_message_id);");
    db.exec("CREATE INDEX IF NOT EXISTS idx_replies_camp_from ON customer_replies(campaign_id, from_phone);");
  } catch (migErrCampCols) {
    console.warn("[DB Migration] campaigns delivered/read columns check:", migErrCampCols.message);
  }

  // Migrate automated_booking_dispatches: add user_id column if not present
  try {
    const tableInfo = db.prepare("PRAGMA table_info(automated_booking_dispatches)").all();
    const cols = tableInfo.map(c => c.name);
    if (!cols.includes("user_id")) {
      db.exec("ALTER TABLE automated_booking_dispatches ADD COLUMN user_id TEXT;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_auto_booking_user ON automated_booking_dispatches(user_id);");
  } catch (migErr4) {
    console.warn("[DB Migration] automated_booking_dispatches user column check:", migErr4.message);
  }

  // Backfill unassigned/legacy customer_replies and campaigns to default admin
  try {
    const adminUser = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1").get();
    if (adminUser?.id) {
      db.prepare("UPDATE customer_replies SET user_id = ? WHERE user_id IS NULL").run(adminUser.id);
      db.prepare("UPDATE campaigns SET user_id = ? WHERE user_id IS NULL").run(adminUser.id);
    }
  } catch (backfillErr) {
    console.warn("[DB Migration] User ID backfill notice:", backfillErr.message);
  }

  // Seed default templates if empty
  try {
    const templateCount = db.prepare("SELECT COUNT(*) as count FROM templates").get().count;
    if (templateCount === 0) {
      const insertTpl = db.prepare(`
        INSERT INTO templates (
          id, name, meta_id, language, category, status, parameter_format,
          body_text, variables, components, buttons
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // 1. kt_invitation_ (1059862786867912)
      insertTpl.run(
        "1059862786867912",
        "kt_invitation_",
        "1059862786867912",
        "en",
        "MARKETING",
        "APPROVED",
        "POSITIONAL",
        "Hi *{{1}}*,\n\nKonkanTrip is inviting *{{2}}* to join our restaurant partner network.\n\nCreate your partner profile and start receiving customer opportunities through KonkanTrip.\n\nComplete your registration here: {{3}}\n\nRegards,\nKonkanTrip Partner Team",
        JSON.stringify([
          { key: "1", label: "{{1}}", example: "Shivam khomane" },
          { key: "2", label: "{{2}}", example: "Konkan Trip Beach Resort" },
          { key: "3", label: "{{3}}", example: "https://konkantrip.com/partner" }
        ]),
        JSON.stringify([]),
        JSON.stringify([])
      );

      // 2. kt_restaurant_invitation (1757343188867100)
      insertTpl.run(
        "1757343188867100",
        "kt_restaurant_invitation",
        "1757343188867100",
        "en",
        "MARKETING",
        "APPROVED",
        "NAMED",
        "Hi *{{name}}*,\n\nKonkanTrip is inviting *{{restaurant}}* to join our restaurant partner network.\n\nCreate your partner profile and start receiving customer opportunities through KonkanTrip.\n\nComplete your registration here: {{link}}\n\nRegards,\nKonkanTrip Partner Team",
        JSON.stringify([
          { key: "name", label: "{{name}}", example: "Shivam khomane" },
          { key: "restaurant", label: "{{restaurant}}", example: "Konkan Trip Beach Resort" },
          { key: "link", label: "{{link}}", example: "https://konkantrip.com/partner" }
        ]),
        JSON.stringify([]),
        JSON.stringify([
          { type: "URL", text: "Register Now", url: "https://konkantrip.com/" }
        ])
      );

      // 3. konkantrip_auth (OTP)
      insertTpl.run(
        "konkantrip_auth",
        "konkantrip_auth",
        "konkantrip_auth",
        "en_US",
        "AUTHENTICATION",
        "APPROVED",
        "POSITIONAL",
        "Your KonkanTrip verification code is *{{1}}*. Do not share this code with anyone.",
        JSON.stringify([
          { key: "1", label: "{{1}}", example: "492018" }
        ]),
        JSON.stringify([]),
        JSON.stringify([
          { type: "OTP", text: "Copy Code" }
        ])
      );
    }
  } catch (tplSeedErr) {
    console.warn("[DB Seed] templates seed check:", tplSeedErr.message);
  }

  // Seed default admin user if users table is empty (Development only)
  try {
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get()?.count || 0;
    if (userCount === 0) {
      if (process.env.NODE_ENV === "production") {
        console.log("[Security] Production startup: No users found. First registered user will be assigned Master Administrator role.");
      } else {
        const defaultHash = bcrypt.hashSync("admin123", 10);
        db.prepare(`
          INSERT INTO users (id, name, email, phone, password_hash, role, status)
          VALUES ('admin_root', 'Shivam Khomane', 'khomaneshivam@gmail.com', '9307382030', ?, 'ADMIN', 'ACTIVE')
        `).run(defaultHash);
        console.log("[DB Seed] Development admin user seeded ('admin_root'). Change password immediately in production.");
      }
    }
  } catch (userSeedErr) {
    console.warn("[DB Seed] user seed check:", userSeedErr.message);
  }

  // Seed default settings if not exists
  const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
  const setSetting = db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)");

  if (!getSetting.get("WHATSAPP_API_TOKEN")) {
    setSetting.run("WHATSAPP_API_TOKEN", config.WHATSAPP_API_TOKEN);
  }
  if (!getSetting.get("WHATSAPP_PHONE_NUMBER_ID")) {
    setSetting.run("WHATSAPP_PHONE_NUMBER_ID", config.WHATSAPP_PHONE_NUMBER_ID);
  }
  if (!getSetting.get("DEFAULT_COUNTRY_CODE")) {
    setSetting.run("DEFAULT_COUNTRY_CODE", config.DEFAULT_COUNTRY_CODE);
  }
  if (!getSetting.get("BROADCAST_DELAY_MS")) {
    setSetting.run("BROADCAST_DELAY_MS", String(config.BROADCAST_DELAY_MS));
  }
  if (!getSetting.get("WHATSAPP_TEMPLATE_ID")) {
    setSetting.run("WHATSAPP_TEMPLATE_ID", config.WHATSAPP_TEMPLATE_ID || "1757343188867100");
  }
  if (!getSetting.get("DEFAULT_TEMPLATE_NAME")) {
    setSetting.run("DEFAULT_TEMPLATE_NAME", config.DEFAULT_TEMPLATE_NAME || "kt_restaurant_invitation");
  }
  if (!getSetting.get("DEFAULT_TEMPLATE_LANG")) {
    setSetting.run("DEFAULT_TEMPLATE_LANG", config.DEFAULT_TEMPLATE_LANG || "en");
  }
  if (!getSetting.get("WEBHOOK_VERIFY_TOKEN")) {
    setSetting.run("WEBHOOK_VERIFY_TOKEN", config.WEBHOOK_VERIFY_TOKEN || "wb_verify_konkantrip_7f3a9e2c4b810d56");
  }
  if (!getSetting.get("AUTO_REPLY_ENABLED")) {
    setSetting.run("AUTO_REPLY_ENABLED", "true");
  }
  if (!getSetting.get("AUTO_REPLY_MODE")) {
    setSetting.run("AUTO_REPLY_MODE", "ONCE_PER_CONTACT");
  }
  if (!getSetting.get("AUTO_REPLY_MESSAGE")) {
    setSetting.run(
      "AUTO_REPLY_MESSAGE",
      "Hi {{name}}, thank you for reaching out to KonkanTrip! We have received your message and our team will get back to you shortly."
    );
  }
  if (!getSetting.get("BOOKING_AUTOMATION_ENABLED")) {
    setSetting.run("BOOKING_AUTOMATION_ENABLED", "true");
  }
  if (!getSetting.get("PRE_CHECKIN_OFFSET_DAYS")) {
    setSetting.run("PRE_CHECKIN_OFFSET_DAYS", "1");
  }
  if (!getSetting.get("PRE_CHECKIN_TEMPLATE")) {
    setSetting.run("PRE_CHECKIN_TEMPLATE", "kt_best_route_to_property");
  }
  if (!getSetting.get("CHECKOUT_TEMPLATE")) {
    setSetting.run("CHECKOUT_TEMPLATE", "kt_checkout_belongings_reminder");
  }
}

initializeDatabase();

module.exports = {
  db,
  getSetting(key) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
  },
  setSetting(key, value) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(key, String(value));
  },
  getAllSettings() {
    const rows = db.prepare("SELECT key, value FROM settings").all();
    const result = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  }
};
