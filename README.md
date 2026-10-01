# WhatsApp Bulk Broadcast System (Isolated Project)

A standalone, enterprise-grade WhatsApp Bulk Broadcast application powered by the **Meta WhatsApp Cloud API (v21.0)** with **Excel (.xlsx, .xls) and CSV** contact parsing, dynamic variable mapping, smartphone preview mockup, rate-limited dispatching, live progress monitoring, and downloadable delivery reports.

> **Zero Dependency on KonkanTrip OTA**:  
> This project is 100% self-contained inside the `whatsapp_bulk` directory. It uses an embedded SQLite database (`data/whatsapp_bulk.db`) and does not modify or depend on the KonkanTrip database, backend, or frontend.

---

## Features

- **Excel & CSV Ingestion**:
  - Drag-and-drop file upload for `.xlsx`, `.xls`, and `.csv` files.
  - Automatic column detection for Phone Numbers and Contact Names.
  - Phone number normalization (auto-detects missing country codes e.g. `91`, removes formatting characters).
  - Validation metrics (Valid, Invalid, and Duplicate numbers detected).
  - Interactive preview table of contacts.
  - In-browser sample template generator (`Sample_WhatsApp_Contacts.xlsx`).

- **Direct Template Management & System Registry**:
  - **Direct Add Template Modal**: Add any approved Meta template into the system registry directly by **Template ID / Number** (e.g. `1059862786867912`, `1757343188867100`) or **Name**.
  - **Meta API Pre-Verification**: Queries Meta Graph API to automatically inspect and verify category, language, approval status, body structure, parameters, and buttons before saving.
  - **Persistent System Registry**: Stored in embedded SQLite (`templates` table) so all team members and future broadcasts can access your saved templates instantly without re-typing.
  - **Dynamic Template Pills**: Saved templates appear directly in the Compose Message view as 1-click selector pills, complete with variable counts, category badges, and quick deletion for custom templates.

- **Dynamic Template Inspection & Auto-Mapping**:
  - Accept **ANY Meta Template Number or ID** (e.g. `1059862786867912`, `1757343188867100`) or template name.
  - Automatically fetches the approved template structure, category, language, and components from Meta Cloud API.
  - Detects both **Positional parameters** (`{{1}}`, `{{2}}`, etc.) and **Named parameters** (`{{name}}`, `{{restaurant}}`, `{{link}}`, etc.).
  - **"✨ Auto-Map from Excel" button**: Automatically matches each template variable to the best matching Excel column using semantic keyword matching and column ordering.
  - Real-time **Live Sample Pills** (`e.g. "shivam khomane"`) showing exact values from row 1 of your Excel file.
  - **Interactive Live Smartphone Mockup**: Renders the authentic Meta template body text with real Excel recipient data interpolated in real time, plus action buttons (e.g. "Register Now", "Copy Code").

- **Broadcast Scheduling Engine**:
  - Choose between **⚡ Broadcast Immediately** and **📅 Schedule Broadcast for Later**.
  - Intuitive `datetime-local` picker with time zone awareness.
  - Quick Timing Preset chips (`+15 Mins`, `+30 Mins`, `+1 Hour`, `Tomorrow 10 AM`, `Tomorrow 6 PM`).
  - Dynamic schedule summary box with formatted date and relative countdown (e.g. *"in 30 mins"*).
  - Background Node.js polling worker (`schedulerService.js`) scanning SQLite WAL database every 5 seconds for due campaigns.
  - Zero-downtime execution: automatically dispatches campaigns when their scheduled time arrives.
  - Comprehensive schedule management controls in the Campaigns dashboard:
    - **`⚡ Run Now`**: Instantly triggers a scheduled campaign ahead of time.
    - **`🕒 Reschedule`**: Interactive modal with quick presets to update future dispatch time.
    - **`✕ Cancel`**: Safely cancels a scheduled campaign before dispatch.

- **Queue Engine & Throttling**:
  - Adjustable throttle delay (100ms - 1500ms) to respect Meta rate limits and prevent account blocks.
  - Real-time Server-Sent Events (SSE) stream for live progress bars, speed counters (messages/sec), and activity feed.
  - Interactive controls: **Pause**, **Resume**, and **Cancel/Stop** active broadcasts.

- **Meta Webhooks & Live Customer Replies**:
  - **Meta Verification Handshake**: Automatic support for Meta's `GET /webhook` and `GET /api/webhook` handshake protocol (`hub.mode`, `hub.challenge`, `hub.verify_token`).
  - **Verify Token Management**:
    - Generates cryptographically secure verify tokens (`wb_verify_...`) with 1-click from the dashboard.
    - Synchronized across SQLite `settings` and `.env`.
    - 1-click **"📋 Copy Token"** and **"📋 Copy Webhook URL"** buttons.
  - **Incoming Message Processing (`POST /webhook`)**:
    - Automatically parses customer replies: text messages, quick reply button clicks, interactive list selections, reactions, images, audio, documents, and locations.
    - Matches sender phone numbers to active contacts and broadcast campaigns in SQLite (`customer_replies` table).
    - Captures customer WhatsApp profile names and message timestamps.
  - **Customer Replies Inbox**:
    - Dedicated **"💬 Customer Replies"** dashboard tab with real-time unread counter badge.
    - Real-time Server-Sent Events (SSE) push alerts when a customer replies.
    - Filter by Unread / All, with instant search by phone, customer name, or message text.
    - 1-click **"💬 Chat on WhatsApp"** button (`https://wa.me/{phone}`) to reply directly to the customer on WhatsApp.
    - Built-in **"🧪 Simulate Test"** modal for testing inbound replies locally without external tunnels.
  - **Real-Time Delivery Receipts**:
    - Automatically updates recipient delivery statuses (`DELIVERED`, `READ`, `FAILED`) when Meta pushes delivery receipts.

- **Reports & History**:
  - SQLite persistent storage for all historical broadcast campaigns.
  - Scheduled campaigns marked with purple `SCHEDULED` status badge and live countdown timer.
  - View individual message delivery statuses (`SENT`, `FAILED`, Meta Message IDs, error details).
  - Export full campaign delivery reports directly to Excel (`.xlsx`), with `Scheduled At` timestamp included.

---

## Quick Start

### 1. Install Dependencies
```bash
cd d:\whatsapp_bulk
npm install
```

### 2. Configure Environment (`.env`)
The `.env` file is pre-configured with default credentials and port `5000`:
```env
PORT=5000
NODE_ENV=development

# Meta WhatsApp Cloud API Credentials
WHATSAPP_API_TOKEN=your_meta_system_user_token_here
WHATSAPP_PHONE_NUMBER_ID=1292128907326342
META_GRAPH_VERSION=v21.0

# Broadcasting Defaults
DEFAULT_COUNTRY_CODE=91
BROADCAST_DELAY_MS=250

# Local Data Directories (Self-Contained)
DATA_DIR=./data
UPLOADS_DIR=./uploads
```

### 3. Start the Server
```bash
npm start
# or
node server.js
```

Open your browser at:
👉 **`http://localhost:5000`**

---

## Project Structure

```
whatsapp_bulk/
├── .env                  # Project configuration & verify token
├── .env.example          # Sample environment file
├── package.json          # Node.js dependencies
├── server.js             # Express application entrypoint (/webhook mounted)
├── data/
│   └── whatsapp_bulk.db  # Embedded SQLite database (Self-contained)
├── public/               # Modern Glassmorphic Web Dashboard
│   ├── index.html        # Single Page Application (New Broadcast, History, Customer Replies)
│   ├── css/
│   │   └── style.css     # Dark mode, responsive design system & reply cards
│   └── js/
│       └── app.js        # Reactive client logic, SSE streaming & webhook modal
└── src/
    ├── config/
    │   ├── env.js        # Environment loader
    │   └── database.js   # SQLite connection & customer_replies table
    ├── controllers/
    │   ├── uploadController.js     # File upload & parsing
    │   ├── broadcastController.js  # Campaign lifecycle & test dispatch
    │   ├── campaignController.js   # Reports & history
    │   ├── settingsController.js   # Meta credentials & diagnostics
    │   ├── templateController.js   # System templates CRUD & verification
    │   └── webhookController.js    # Meta webhook handshake & reply handlers
    ├── routes/
    │   └── apiRoutes.js  # REST & SSE endpoints
    └── services/
        ├── excelService.js         # Excel/CSV parser & generator
        ├── metaWhatsAppService.js  # Meta Graph API client
        ├── broadcastEngine.js      # Throttled queue runner & SSE emitter
        ├── schedulerService.js     # Background cron scheduler
        └── webhookService.js       # Meta verification & inbound parser
```

---

## ⚡ Meta Webhook Setup Guide (Step-by-Step)

To receive real-time WhatsApp replies from your customers:

1. **Get Your Callback URL and Verify Token**:
   - In the dashboard, click **⚡ Webhook & Token** in the top navigation or under **Customer Replies**.
   - Copy the **Callback URL** (e.g. `https://your-domain.com/webhook` or `https://your-domain.com/api/webhook`).
   - Click **🔄 Generate New Token** or copy the existing **Verify Token**.

2. **Configure in Meta App Dashboard**:
   - Go to [Meta for Developers](https://developers.facebook.com/apps) > Your App > **WhatsApp** > **Configuration**.
   - Under **Webhook**, click **Edit**.
   - Paste your **Callback URL** and **Verify Token**.
   - Click **Verify and Save**. Meta will execute the handshake and mark it verified!

3. **Subscribe to Messages**:
   - Under **Webhook fields**, click **Manage**.
   - Click **Subscribe** on the **`messages`** row.

> **Localhost Testing Note**:  
> Meta requires an **HTTPS** URL. For local testing, start a tunnel using:  
> `ngrok http 5000`  
> Copy the generated HTTPS domain (e.g. `https://xxxx.ngrok-free.app/webhook`) into Meta!  
> You can also click **🧪 Simulate Test** in the dashboard to test inbound customer replies immediately without any tunnel.

