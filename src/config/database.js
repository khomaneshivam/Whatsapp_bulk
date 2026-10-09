const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const config = require("./env");

// Ensure data directory exists inside whatsapp_bulk/
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

const dbPath = path.join(config.DATA_DIR, "whatsapp_bulk.db");
const db = new DatabaseSync(dbPath);

// Enable WAL mode for better concurrency and performance
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");

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
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_recipients_campaign ON campaign_recipients(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_recipients_status ON campaign_recipients(campaign_id, status);
    CREATE INDEX IF NOT EXISTS idx_templates_name ON templates(name);
    CREATE INDEX IF NOT EXISTS idx_templates_meta_id ON templates(meta_id);
    CREATE INDEX IF NOT EXISTS idx_replies_phone ON customer_replies(from_phone);
    CREATE INDEX IF NOT EXISTS idx_replies_campaign ON customer_replies(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_replies_received ON customer_replies(received_at);
    CREATE INDEX IF NOT EXISTS idx_replies_is_read ON customer_replies(is_read);
  `);

  // Migrate existing databases: add scheduled_at column if not present
  try {
    const tableInfo = db.prepare("PRAGMA table_info(campaigns)").all();
    const hasScheduledAt = tableInfo.some(col => col.name === "scheduled_at");
    if (!hasScheduledAt) {
      db.exec("ALTER TABLE campaigns ADD COLUMN scheduled_at DATETIME;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_campaigns_status_scheduled ON campaigns(status, scheduled_at);");
  } catch (migErr) {
    console.warn("[DB Migration] scheduled_at check:", migErr.message);
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
  } catch (migErr2) {
    console.warn("[DB Migration] customer_replies columns check:", migErr2.message);
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
  if (!getSetting.get("AUTO_REPLY_MESSAGE")) {
    setSetting.run(
      "AUTO_REPLY_MESSAGE",
      "Hi {{name}}, thank you for reaching out to KonkanTrip! We have received your message and our team will get back to you shortly."
    );
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
