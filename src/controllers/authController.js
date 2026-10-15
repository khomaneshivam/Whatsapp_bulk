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
    if (!password || String(password).length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(name).trim();
    const cleanPhone = phone ? String(phone).trim() : null;

    // Check if email already registered
    const existing = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(cleanEmail);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An account with this email address already exists. Please log in instead."
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();

    // Check if this is the very first user in the system -> make them Admin
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const role = userCount === 0 ? "ADMIN" : "USER";

    // Assign default phone number if available
    const defaultPhone = db.prepare("SELECT id FROM waba_phone_numbers WHERE is_default = 1 LIMIT 1").get();
    const assignedPhoneId = defaultPhone ? defaultPhone.id : null;

    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, assigned_phone_id)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
    `).run(userId, cleanName, cleanEmail, cleanPhone, passwordHash, role, assignedPhoneId);

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

module.exports = {
  register,
  login,
  getMe,
  updateProfile
};
