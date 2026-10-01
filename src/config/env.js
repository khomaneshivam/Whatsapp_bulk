const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const config = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  WHATSAPP_API_TOKEN: process.env.WHATSAPP_API_TOKEN || "",
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  META_GRAPH_VERSION: process.env.META_GRAPH_VERSION || "v21.0",
  WHATSAPP_TEMPLATE_ID: process.env.WHATSAPP_TEMPLATE_ID || "1757343188867100",
  DEFAULT_TEMPLATE_NAME: process.env.DEFAULT_TEMPLATE_NAME || "kt_restaurant_invitation",
  DEFAULT_TEMPLATE_LANG: process.env.DEFAULT_TEMPLATE_LANG || "en",
  DEFAULT_COUNTRY_CODE: process.env.DEFAULT_COUNTRY_CODE || "91",
  BROADCAST_DELAY_MS: parseInt(process.env.BROADCAST_DELAY_MS || "250", 10),
  WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN || "wb_verify_konkantrip_7f3a9e2c4b810d56",
  DATA_DIR: path.resolve(__dirname, "../../data"),
  UPLOADS_DIR: path.resolve(__dirname, "../../uploads"),
};

module.exports = config;
