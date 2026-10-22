const jwt = require("jsonwebtoken");
const config = require("../config/env");
const { db } = require("../config/database");

/**
 * Authenticates incoming request using JWT Bearer token in Authorization header.
 * Fails closed with 401 if token is missing, malformed, expired, or user is not found/active.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Authentication Bearer token required in Authorization header."
    });
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Empty authentication token provided."
    });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const uId = decoded?.userId || decoded?.id;
    if (!uId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload."
      });
    }

    // Always verify current user status and role against active database record
    const user = db.prepare(`
      SELECT id, name, email, phone, role, status, assigned_phone_id, created_at
      FROM users
      WHERE id = ?
    `).get(uId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found."
      });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Account is inactive or suspended. Please contact administrator."
      });
    }

    req.user = user;
    return next();
  } catch (err) {
    const isExpired = err.name === "TokenExpiredError";
    return res.status(401).json({
      success: false,
      message: isExpired ? "Session expired. Please log in again." : "Invalid authentication token."
    });
  }
}

/**
 * Dedicated authentication middleware for Server-Sent Events (SSE) connections.
 * Accepts short-lived stream token or Bearer header, validates DB user and fails closed.
 */
function authenticateStreamToken(req, res, next) {
  let token = null;
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (req.query && (req.query.streamToken || req.query.stream_token || req.query.token)) {
    token = String(req.query.streamToken || req.query.stream_token || req.query.token).trim();
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required for live stream connection."
    });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const uId = decoded?.userId || decoded?.id;
    if (!uId) {
      return res.status(401).json({ success: false, message: "Invalid stream token." });
    }

    const user = db.prepare("SELECT id, name, email, role, status FROM users WHERE id = ?").get(uId);
    if (!user || user.status !== "ACTIVE") {
      return res.status(403).json({ success: false, message: "Unauthorized or suspended account." });
    }

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired stream token." });
  }
}

/**
 * Strictly ensures authenticated user has Master Admin role.
 * Fails closed with 401 if unauthenticated and 403 if user is not an administrator.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });
  }

  if (req.user.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Forbidden. Master Administrator privileges required."
    });
  }

  return next();
}

/**
 * Optional authentication middleware (attaches verified user if present, sets null if absent).
 * Never attaches fallback admin identity.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  req.user = null;

  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const uId = decoded?.userId || decoded?.id;
    if (uId) {
      const user = db.prepare(`
        SELECT id, name, email, phone, role, status, assigned_phone_id
        FROM users
        WHERE id = ?
      `).get(uId);
      if (user && user.status === "ACTIVE") {
        req.user = user;
      }
    }
  } catch (e) {
    // Proceed unauthenticated
  }

  return next();
}

/**
 * Determines target User ID filter based on caller role:
 * - Admin can inspect any target user if specified or null (all users).
 * - Regular user is strictly restricted to their own user ID, ignoring client override attempts.
 */
function getScopedUserId(req) {
  if (!req.user) return null;
  if (req.user.role === "ADMIN") {
    const requested = req.query?.userId || req.body?.userId || req.headers["x-target-user-id"];
    return requested ? String(requested).trim() : null; // null means all users for admin
  }
  return req.user.id;
}

module.exports = {
  authenticateToken,
  authenticateStreamToken,
  requireAdmin,
  optionalAuth,
  getScopedUserId
};

