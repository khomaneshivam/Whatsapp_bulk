const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const config = require("../config/env");
const { db, getSetting, setSetting } = require("../config/database");

/**
 * List all registered users with summary statistics (Admin Only)
 */
async function listUsers(req, res) {
  try {
    const users = db.prepare(`
      SELECT 
        u.id, u.name, u.email, u.phone, u.role, u.status, u.assigned_phone_id, 
        u.created_at, u.last_login_at,
        p.display_name as assigned_phone_name,
        p.phone_number as assigned_phone_number,
        (SELECT COUNT(*) FROM campaigns c WHERE c.user_id = u.id) as campaign_count,
        (SELECT COALESCE(SUM(c.sent_count), 0) FROM campaigns c WHERE c.user_id = u.id) as total_messages_sent,
        (SELECT COUNT(*) FROM automated_booking_dispatches b WHERE b.user_id = u.id) as automation_dispatches_count
      FROM users u
      LEFT JOIN waba_phone_numbers p ON u.assigned_phone_id = p.id
      ORDER BY 
        CASE WHEN u.role = 'ADMIN' THEN 1 ELSE 2 END,
        u.created_at DESC
    `).all();

    return res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error("Admin listUsers error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Get detailed stats and recent activity for a specific user (Admin Only)
 */
async function getUserDetails(req, res) {
  try {
    const { userId } = req.params;
    const user = db.prepare(`
      SELECT id, name, email, phone, role, status, assigned_phone_id, created_at, last_login_at
      FROM users WHERE id = ?
    `).get(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const campaigns = db.prepare(`
      SELECT id, name, status, total_contacts, sent_count, failed_count, created_at
      FROM campaigns WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 10
    `).all(userId);

    const dispatches = db.prepare(`
      SELECT id, guest_name, clean_phone, trigger_type, template_name, status, dispatched_at
      FROM automated_booking_dispatches WHERE user_id = ?
      ORDER BY dispatched_at DESC LIMIT 10
    `).all(userId);

    return res.status(200).json({
      success: true,
      data: {
        user,
        recentCampaigns: campaigns,
        recentDispatches: dispatches
      }
    });
  } catch (error) {
    console.error("Admin getUserDetails error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Toggle user status: ACTIVE or SUSPENDED (Admin Only)
 */
async function updateUserStatus(req, res) {
  try {
    const { userId } = req.params;
    const { status } = req.body || {};

    if (!["ACTIVE", "SUSPENDED"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'ACTIVE' or 'SUSPENDED'." });
    }

    // Prevent admin from suspending themselves
    if (req.user.id === userId && status === "SUSPENDED") {
      return res.status(400).json({ success: false, message: "You cannot suspend your own Master Admin account." });
    }

    db.prepare("UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, userId);

    return res.status(200).json({
      success: true,
      message: `User status changed to ${status}.`
    });
  } catch (error) {
    console.error("Admin updateUserStatus error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Change user role: ADMIN or USER (Admin Only)
 */
async function updateUserRole(req, res) {
  try {
    const { userId } = req.params;
    const { role } = req.body || {};

    if (!["ADMIN", "USER"].includes(role)) {
      return res.status(400).json({ success: false, message: "Role must be 'ADMIN' or 'USER'." });
    }

    // Prevent demoting self if only admin
    if (req.user.id === userId && role === "USER") {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'").get().count;
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: "Cannot demote the only remaining Master Admin." });
      }
    }

    db.prepare("UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(role, userId);

    return res.status(200).json({
      success: true,
      message: `User role updated to ${role}.`
    });
  } catch (error) {
    console.error("Admin updateUserRole error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Assign a registered WABA phone number to a user (Admin Only)
 */
async function assignPhoneNumber(req, res) {
  try {
    const { userId } = req.params;
    const { phoneId } = req.body || {};

    if (phoneId) {
      const phoneExists = db.prepare("SELECT id FROM waba_phone_numbers WHERE id = ?").get(phoneId);
      if (!phoneExists) {
        return res.status(404).json({ success: false, message: "Selected phone number not found." });
      }
    }

    db.prepare("UPDATE users SET assigned_phone_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(phoneId || null, userId);

    return res.status(200).json({
      success: true,
      message: phoneId ? "Phone number assigned to user successfully." : "Phone number assignment cleared."
    });
  } catch (error) {
    console.error("Admin assignPhoneNumber error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Generate an Impersonation Token to view and manage the system as another user (Admin Only)
 */
async function impersonateUser(req, res) {
  try {
    const { userId } = req.params;
    const targetUser = db.prepare(`
      SELECT id, name, email, phone, role, status, assigned_phone_id
      FROM users WHERE id = ?
    `).get(userId);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: "Target user not found." });
    }

    // Generate impersonation token with original admin ID stored
    const impersonationToken = jwt.sign(
      {
        userId: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        isImpersonating: true,
        originalAdminId: req.user.id
      },
      config.JWT_SECRET,
      { expiresIn: "4h" }
    );

    return res.status(200).json({
      success: true,
      message: `Switched into ${targetUser.name}'s account view.`,
      token: impersonationToken,
      user: targetUser,
      originalAdmin: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email
      }
    });
  } catch (error) {
    console.error("Admin impersonateUser error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * =========================================================================
 * ADMIN-ONLY WABA PHONE NUMBERS MANAGEMENT
 * "admin only can register the new numbers in the platform"
 * =========================================================================
 */

/**
 * List all registered WhatsApp numbers (Admin Only)
 */
async function listPhoneNumbers(req, res) {
  try {
    const numbers = db.prepare(`
      SELECT 
        p.*,
        u.name as registered_by_name,
        (SELECT COUNT(*) FROM users u2 WHERE u2.assigned_phone_id = p.id) as assigned_users_count,
        (SELECT COUNT(*) FROM campaigns c WHERE c.phone_number_id = p.id) as campaigns_count
      FROM waba_phone_numbers p
      LEFT JOIN users u ON p.registered_by = u.id
      ORDER BY p.is_default DESC, p.created_at DESC
    `).all();

    return res.status(200).json({
      success: true,
      data: numbers
    });
  } catch (error) {
    console.error("Admin listPhoneNumbers error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Register a new WhatsApp Phone Number in the platform (Admin Only)
 */
async function registerPhoneNumber(req, res) {
  try {
    const displayName = req.body?.displayName || req.body?.display_name;
    const phoneNumber = req.body?.phoneNumber || req.body?.phone_number;
    const phoneNumberId = req.body?.phoneNumberId || req.body?.phone_number_id;
    const wabaId = req.body?.wabaId || req.body?.waba_id;
    const isDefault = req.body?.isDefault ?? req.body?.is_default;

    if (!displayName || !String(displayName).trim()) {
      return res.status(400).json({ success: false, message: "Display Name (e.g. 'Customer Support' or 'Company Hotline') is required." });
    }
    if (!phoneNumber || !String(phoneNumber).trim()) {
      return res.status(400).json({ success: false, message: "WhatsApp Phone Number with country code (e.g. '+1 234 567 8900') is required." });
    }
    if (!phoneNumberId || !String(phoneNumberId).trim()) {
      return res.status(400).json({ success: false, message: "Meta WhatsApp Phone Number ID is required." });
    }

    const cleanDisplay = String(displayName).trim();
    const cleanPhone = String(phoneNumber).trim();
    const cleanPhoneId = String(phoneNumberId).trim();
    const cleanWabaId = wabaId ? String(wabaId).trim() : null;

    // Check if Phone Number ID already exists
    const existing = db.prepare("SELECT id FROM waba_phone_numbers WHERE phone_number_id = ?").get(cleanPhoneId);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Phone Number ID '${cleanPhoneId}' is already registered in the system.`
      });
    }

    // Verify against Meta Graph API if active token exists
    let qualityRating = "GREEN";
    let metaStatus = "VERIFIED";
    const activeToken = getSetting("WHATSAPP_API_TOKEN") || config.WHATSAPP_API_TOKEN;

    if (activeToken) {
      try {
        const verifyRes = await fetch(`https://graph.facebook.com/${config.META_GRAPH_VERSION || "v21.0"}/${cleanPhoneId}`, {
          headers: { "Authorization": `Bearer ${activeToken}` }
        });
        const metaData = await verifyRes.json();
        if (verifyRes.ok && metaData.id) {
          qualityRating = metaData.quality_rating || "GREEN";
          metaStatus = metaData.code_verification_status || "VERIFIED";
        }
      } catch (e) {
        console.warn("[Admin Phone Register] Live Meta test check note:", e.message);
      }
    }

    const newId = crypto.randomUUID();
    const phoneCount = db.prepare("SELECT COUNT(*) as count FROM waba_phone_numbers").get().count;
    const shouldBeDefault = Boolean(isDefault) || phoneCount === 0;

    if (shouldBeDefault) {
      db.prepare("UPDATE waba_phone_numbers SET is_default = 0").run();
      setSetting("WHATSAPP_PHONE_NUMBER_ID", cleanPhoneId);
    }

    db.prepare(`
      INSERT INTO waba_phone_numbers (
        id, display_name, phone_number, phone_number_id, waba_id,
        quality_rating, status, is_default, registered_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId, cleanDisplay, cleanPhone, cleanPhoneId, cleanWabaId,
      qualityRating, metaStatus, shouldBeDefault ? 1 : 0, req.user ? req.user.id : null
    );

    const saved = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ?").get(newId);

    return res.status(201).json({
      success: true,
      message: `WhatsApp Phone Number '${cleanDisplay}' (${cleanPhone}) registered successfully!`,
      data: saved
    });
  } catch (error) {
    console.error("Admin registerPhoneNumber error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Delete a registered phone number (Admin Only)
 */
async function deletePhoneNumber(req, res) {
  try {
    const { id } = req.params;

    const phone = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ?").get(id);
    if (!phone) {
      return res.status(404).json({ success: false, message: "Phone number not found." });
    }

    if (phone.is_default) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete the default active WhatsApp number. Set another number as default first."
      });
    }

    db.prepare("DELETE FROM waba_phone_numbers WHERE id = ?").run(id);

    return res.status(200).json({
      success: true,
      message: `Phone number '${phone.display_name}' removed from platform.`
    });
  } catch (error) {
    console.error("Admin deletePhoneNumber error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Set a phone number as default active (Admin Only)
 */
async function setDefaultPhoneNumber(req, res) {
  try {
    const { id } = req.params;
    const phone = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ?").get(id);
    if (!phone) {
      return res.status(404).json({ success: false, message: "Phone number not found." });
    }

    db.prepare("UPDATE waba_phone_numbers SET is_default = 0").run();
    db.prepare("UPDATE waba_phone_numbers SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

    setSetting("WHATSAPP_PHONE_NUMBER_ID", phone.phone_number_id);

    return res.status(200).json({
      success: true,
      message: `'${phone.display_name}' set as default active WhatsApp sender.`
    });
  } catch (error) {
    console.error("Admin setDefaultPhoneNumber error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Global System Health & Overview Statistics (Admin Only)
 */
async function getSystemOverview(req, res) {
  try {
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const activeUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'ACTIVE'").get().count;
    const totalCampaigns = db.prepare("SELECT COUNT(*) as count FROM campaigns").get().count;
    const messageTotals = db.prepare(`
      SELECT 
        COALESCE(SUM(sent_count), 0) as total_sent,
        COALESCE(SUM(failed_count), 0) as total_failed,
        COALESCE(SUM(valid_contacts), 0) as total_recipients
      FROM campaigns
    `).get();

    const totalReplies = db.prepare("SELECT COUNT(*) as count FROM customer_replies").get().count;
    const unreadReplies = db.prepare("SELECT COUNT(*) as count FROM customer_replies WHERE is_read = 0").get().count;
    const totalDispatches = db.prepare("SELECT COUNT(*) as count FROM automated_booking_dispatches").get().count;
    const registeredPhones = db.prepare("SELECT COUNT(*) as count FROM waba_phone_numbers").get().count;

    const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'").get().count;
    const completedCampaigns = db.prepare("SELECT COUNT(*) as count FROM campaigns WHERE status = 'COMPLETED'").get().count;

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        adminUsers: adminCount,
        totalCampaigns,
        completedCampaigns,
        totalSent: messageTotals.total_sent,
        totalFailed: messageTotals.total_failed,
        totalRecipients: messageTotals.total_recipients,
        totalReplies,
        unreadReplies,
        totalBookingDispatches: totalDispatches,
        registeredPhonesCount: registeredPhones,

        // Structured objects for compatibility with various consumers
        users: {
          total: totalUsers,
          active: activeUsers,
          admins: adminCount
        },
        campaigns: {
          total: totalCampaigns,
          completed: completedCampaigns
        },
        messages: {
          sent: messageTotals.total_sent,
          delivered: messageTotals.total_sent,
          failed: messageTotals.total_failed
        },
        automation: {
          totalAutomatedDispatches: totalDispatches
        }
      }
    });
  } catch (error) {
    console.error("Admin getSystemOverview error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  listUsers,
  getUserDetails,
  updateUserStatus,
  updateUserRole,
  assignPhoneNumber,
  impersonateUser,
  listPhoneNumbers,
  registerPhoneNumber,
  deletePhoneNumber,
  setDefaultPhoneNumber,
  getSystemOverview
};
