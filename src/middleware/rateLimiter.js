/**
 * Lightweight, in-memory IP & tenant rate limiter middleware
 */
class MemoryRateLimiter {
  constructor(windowMs = 60000, maxRequests = 60, message = "Too many requests, please try again later.") {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.message = message;
    this.hits = new Map();

    // Clean up expired buckets periodically (every 2 minutes)
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.hits.entries()) {
        if (now - record.startTime > this.windowMs) {
          this.hits.delete(key);
        }
      }
    }, 120000);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  middleware() {
    return (req, res, next) => {
      // Key on authenticated user ID or client IP
      const clientKey = req.user?.id ? `user_${req.user.id}` : (req.ip || req.connection?.remoteAddress || "client_unknown");
      const routeKey = `${clientKey}_${req.baseUrl || ""}${req.path}`;
      const now = Date.now();

      let record = this.hits.get(routeKey);
      if (!record || now - record.startTime > this.windowMs) {
        record = { count: 1, startTime: now };
        this.hits.set(routeKey, record);
      } else {
        record.count++;
      }

      const remaining = Math.max(0, this.maxRequests - record.count);
      res.setHeader("X-RateLimit-Limit", this.maxRequests);
      res.setHeader("X-RateLimit-Remaining", remaining);

      if (record.count > this.maxRequests) {
        return res.status(429).json({
          success: false,
          message: this.message,
          retryAfterSeconds: Math.ceil((this.windowMs - (now - record.startTime)) / 1000)
        });
      }

      return next();
    };
  }
}

// 1. Strict rate limit on authentication (login / registration): 15 attempts / 60s
const authLimiter = new MemoryRateLimiter(60000, 15, "Too many authentication attempts. Please try again after 1 minute.").middleware();

// 2. Broadcast send limiter: 25 requests / 60s
const broadcastLimiter = new MemoryRateLimiter(60000, 25, "Broadcast dispatch rate limit reached. Please wait before creating more campaigns.").middleware();

// 3. Upload limiter: 30 requests / 60s
const uploadLimiter = new MemoryRateLimiter(60000, 30, "File upload rate limit reached. Please wait before uploading more files.").middleware();

module.exports = {
  authLimiter,
  broadcastLimiter,
  uploadLimiter
};
