const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config/env");
const { db } = require("../config/database");

/**
 * Generates signed JWT session token
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role
    },
    config.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/**
 * Register a new user account
 */
async function register(req, res) {
  try {
    const { name, email, phone, password } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: "Full Name is required." });
    }
    if (!email || !String(email).trim() || !email.includes("@")) {
      return res.status(400).json({ success: false, message: "A valid email address is required." });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters long." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(name).trim();
    const cleanPhone = phone ? String(phone).trim() : null;

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();

    // Check optional admin bootstrap token from header or body
    const bootstrapToken = req.headers["x-admin-bootstrap-token"] || req.body?.adminBootstrapToken;
    const configuredBootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;

    // Atomically check existing user and insert within SQLite transaction
    let role = "USER";
    let assignedPhoneId = null;

    db.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      const existing = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(cleanEmail);
      if (existing) {
        db.exec("ROLLBACK;");
        return res.status(409).json({
          success: false,
          message: "An account with this email address already exists. Please log in instead."
        });
      }

      const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
      if (configuredBootstrapToken && bootstrapToken === configuredBootstrapToken) {
        role = "ADMIN";
      } else if (userCount === 0) {
        // The first registered user in the platform is always Master Administrator
        role = "ADMIN";
      } else {
        role = "USER";
      }

      const defaultPhone = db.prepare("SELECT id FROM waba_phone_numbers WHERE is_default = 1 LIMIT 1").get();
      assignedPhoneId = defaultPhone ? defaultPhone.id : null;

      db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, status, assigned_phone_id)
        VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
      `).run(userId, cleanName, cleanEmail, cleanPhone, passwordHash, role, assignedPhoneId);

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    const newUser = db.prepare(`
      SELECT id, name, email, phone, role, status, assigned_phone_id, created_at
      FROM users WHERE id = ?
    `).get(userId);

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: `Account created successfully! Welcome, ${cleanName}.`,
      token,
      user: newUser
    });
  } catch (error) {
    console.error("User registration error:", error);
    return res.status(500).json({ success: false, message: error.message || "Registration failed." });
  }
}

/**
 * Log in with existing email and password
 */
async function login(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const user = db.prepare(`
      SELECT * FROM users WHERE email = ? COLLATE NOCASE
    `).get(cleanEmail);

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    if (user.status === "SUSPENDED") {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Please contact platform administration."
      });
    }

    const passwordValid = await bcrypt.compare(String(password), user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    // Update last login timestamp
    db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      assigned_phone_id: user.assigned_phone_id,
      created_at: user.created_at,
      last_login_at: user.last_login_at
    };

    const token = generateToken(safeUser);

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      token,
      user: safeUser
    });
  } catch (error) {
    console.error("User login error:", error);
    return res.status(500).json({ success: false, message: error.message || "Login failed." });
  }
}

/**
 * Get profile of current authenticated user
 */
async function getMe(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated." });
    }

    // Fetch assigned phone details if assigned
    let assignedPhone = null;
    if (user.assigned_phone_id) {
      assignedPhone = db.prepare(`
        SELECT id, display_name, phone_number, phone_number_id, quality_rating, status, is_default
        FROM waba_phone_numbers WHERE id = ?
      `).get(user.assigned_phone_id);
    } else {
      // Fallback to default system phone number
      assignedPhone = db.prepare(`
        SELECT id, display_name, phone_number, phone_number_id, quality_rating, status, is_default
        FROM waba_phone_numbers WHERE is_default = 1 LIMIT 1
      `).get();
    }

    return res.status(200).json({
      success: true,
      user: {
        ...user,
        assignedPhone
      }
    });
  } catch (error) {
    console.error("GetMe error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Update authenticated user's profile
 */
async function updateProfile(req, res) {
  try {
    const { name, phone, currentPassword, newPassword } = req.body || {};
    const userId = req.user.id;

    if (name) {
      db.prepare("UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(String(name).trim(), userId);
    }
    if (phone !== undefined) {
      db.prepare("UPDATE users SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(phone ? String(phone).trim() : null, userId);
    }

    // Password change
    if (newPassword) {
      if (String(newPassword).length < 6) {
        return res.status(400).json({ success: false, message: "New password must be at least 6 characters long." });
      }

      const userRow = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId);
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: "Current password is required to change password." });
      }

      const match = await bcrypt.compare(String(currentPassword), userRow.password_hash);
      if (!match) {
        return res.status(400).json({ success: false, message: "Current password is incorrect." });
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newHash, userId);
    }

    const updated = db.prepare(`
      SELECT id, name, email, phone, role, status, assigned_phone_id, created_at
      FROM users WHERE id = ?
    `).get(userId);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: updated
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Request password recovery code (Sent via WhatsApp or logged for emergency access)
 */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body || {};
    if (!email || !String(email).trim()) {
      return res.status(400).json({ success: false, message: "Email address is required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.prepare("SELECT id, name, email, phone, role FROM users WHERE email = ? COLLATE NOCASE").get(cleanEmail);

    if (!user) {
      // Return generic message to prevent email enumeration
      return res.status(200).json({
        success: true,
        message: "If an account with this email exists, a password recovery code has been generated."
      });
    }

    // Generate 6-digit numeric recovery code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString().replace("T", " ").substring(0, 19);

    // Invalidate previous unused codes for this user
    db.prepare("UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0").run(user.id);

    // Record new reset code
    db.prepare(`
      INSERT INTO password_resets (user_id, token_hash, expires_at, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(user.id, tokenHash, expiresAt, req.ip || null);

    let whatsappSent = false;
    let recipientPhone = null;

    if (user.phone) {
      try {
        const metaWhatsAppService = require("../services/metaWhatsAppService");
        const targetPhone = metaWhatsAppService.cleanPhone(user.phone, "91");
        if (targetPhone) {
          recipientPhone = targetPhone;
          const sendRes = await metaWhatsAppService.sendTextMessage({
            to: targetPhone,
            body: `Your KonkanTrip engine password reset code is: *${code}*\n\nThis verification code expires in 30 minutes. If you did not request this, you can safely ignore this message.`
          });
          if (sendRes?.success || sendRes?.messageId) {
            whatsappSent = true;
          }
        }
      } catch (waErr) {
        console.warn("[Auth] WhatsApp password reset dispatch note:", waErr.message);
      }
    }

    console.log(`[Auth Recovery] Password reset requested for ${user.email}. Code: ${code} (Expires: ${expiresAt})`);

    const isDev = config.NODE_ENV !== "production";
    const maskedPhone = recipientPhone ? recipientPhone.replace(/(\d{2})(\d+)(\d{4})/, "$1******$3") : null;

    return res.status(200).json({
      success: true,
      message: whatsappSent
        ? `A 6-digit recovery code was dispatched to your WhatsApp number (${maskedPhone}).`
        : `A password reset code was generated. Please enter the 6-digit code${isDev ? ` (Dev Code: ${code})` : " provided by your administrator"}.`,
      data: {
        email: cleanEmail,
        whatsappSent,
        maskedPhone,
        // Include code in non-production environments or when WhatsApp delivery wasn't configured
        devRecoveryCode: isDev ? code : undefined
      }
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to process recovery request." });
  }
}

/**
 * Verifies validity of a reset code
 */
async function verifyResetToken(req, res) {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ success: false, message: "Email and recovery code are required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(cleanEmail);
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid email or recovery code." });
    }

    const tokenHash = crypto.createHash("sha256").update(String(code).trim()).digest("hex");
    const resetRecord = db.prepare(`
      SELECT id, expires_at, used
      FROM password_resets
      WHERE user_id = ? AND token_hash = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY id DESC LIMIT 1
    `).get(user.id, tokenHash);

    if (!resetRecord) {
      return res.status(400).json({ success: false, message: "Recovery code is invalid or has expired." });
    }

    return res.status(200).json({
      success: true,
      message: "Recovery code verified successfully."
    });
  } catch (error) {
    console.error("Verify reset token error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Resets password using verified reset code
 */
async function resetPassword(req, res) {
  try {
    const { email, code, newPassword } = req.body || {};
    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: "Email, recovery code, and new password are required." });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters long." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.prepare("SELECT id, name, email, role FROM users WHERE email = ? COLLATE NOCASE").get(cleanEmail);
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid email or recovery code." });
    }

    const tokenHash = crypto.createHash("sha256").update(String(code).trim()).digest("hex");
    const resetRecord = db.prepare(`
      SELECT id, expires_at, used
      FROM password_resets
      WHERE user_id = ? AND token_hash = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY id DESC LIMIT 1
    `).get(user.id, tokenHash);

    if (!resetRecord) {
      return res.status(400).json({ success: false, message: "Recovery code is invalid or has expired. Please request a new one." });
    }

    // Hash new password
    const newHash = await bcrypt.hash(newPassword, 10);

    db.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      // Update password
      db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newHash, user.id);

      // Invalidate recovery code
      db.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(resetRecord.id);

      // If user is ADMIN, backfill any legacy unassigned records
      if (user.role === "ADMIN") {
        db.prepare("UPDATE customer_replies SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(user.id);
        db.prepare("UPDATE campaigns SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(user.id);
        db.prepare("UPDATE automated_booking_dispatches SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(user.id);
      }

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    console.log(`[Auth Recovery] Password successfully reset for user ${user.email} (${user.id})`);

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. You can now sign in with your new credentials."
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to reset password." });
  }
}

/**
 * Change password for authenticated user
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Current password and new password are required." });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters long." });
    }

    const userRow = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId);
    if (!userRow) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const match = await bcrypt.compare(String(currentPassword), userRow.password_hash);
    if (!match) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newHash, userId);

    return res.status(200).json({
      success: true,
      message: "Password updated successfully."
    });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  forgotPassword,
  verifyResetToken,
  resetPassword,
  changePassword
};
