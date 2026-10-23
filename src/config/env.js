const crypto = require("crypto");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

process.env.TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

let jwtSecret = process.env.JWT_SECRET;
if (isProduction) {
  if (!jwtSecret || jwtSecret.trim().length < 32) {
    throw new Error(
      "FATAL SECURITY CONFIGURATION ERROR: JWT_SECRET environment variable is missing, empty, or shorter than 32 characters in production. Application startup aborted."
    );
  }
} else if (!jwtSecret || !jwtSecret.trim()) {
  // Safe ephemeral dev fallback (changes on restart in dev if not set)
  jwtSecret = process.env.DEV_JWT_SECRET || "dev_secret_" + crypto.randomBytes(32).toString("hex");
}

let webhookVerifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
if (!webhookVerifyToken || !webhookVerifyToken.trim()) {
  if (isProduction) {
    console.warn("[Security Warning] WEBHOOK_VERIFY_TOKEN is not configured in production environment.");
  }
  webhookVerifyToken = "wb_verify_" + crypto.randomBytes(16).toString("hex");
}

const config = {
  PORT: process.env.PORT || 5000,
  NODE_ENV,
  WHATSAPP_API_TOKEN: process.env.WHATSAPP_API_TOKEN || "",
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  META_APP_SECRET: process.env.META_APP_SECRET || "",
  META_GRAPH_VERSION: process.env.META_GRAPH_VERSION || "v21.0",
  WHATSAPP_TEMPLATE_ID: process.env.WHATSAPP_TEMPLATE_ID || "",
  DEFAULT_TEMPLATE_NAME: process.env.DEFAULT_TEMPLATE_NAME || "kt_restaurant_invitation",
  DEFAULT_TEMPLATE_LANG: process.env.DEFAULT_TEMPLATE_LANG || "en",
  DEFAULT_COUNTRY_CODE: process.env.DEFAULT_COUNTRY_CODE || "91",
  BROADCAST_DELAY_MS: parseInt(process.env.BROADCAST_DELAY_MS || "250", 10),
  WEBHOOK_VERIFY_TOKEN: webhookVerifyToken,
  DATA_DIR: path.resolve(__dirname, "../../data"),
  UPLOADS_DIR: path.resolve(__dirname, "../../uploads"),
  APP_TIMEZONE: process.env.APP_TIMEZONE || "Asia/Kolkata",
  JWT_SECRET: jwtSecret,
  CORS_ORIGIN: process.env.CORS_ORIGIN || "",
  WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
  WHATSAPP_FLOWS_ENABLED: process.env.WHATSAPP_FLOWS_ENABLED === "true",
  FLOWS_PRIVATE_KEY: process.env.FLOWS_PRIVATE_KEY || "",
  FLOWS_PASSPHRASE: process.env.FLOWS_PASSPHRASE || "",
  FLOWS_ENDPOINT_URL: process.env.FLOWS_ENDPOINT_URL || ""
};

module.exports = config;

