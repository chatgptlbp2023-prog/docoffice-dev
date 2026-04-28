const buckets = new Map();

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getClientIp(req) {
  const trustProxy = req.app?.get('trust proxy') === true;
  const forwardedFor = trustProxy ? req.headers['x-forwarded-for'] : null;

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return (
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function cleanupExpiredBuckets(now) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.expiresAt <= now) {
      buckets.delete(key);
    }
  }
}

function createRateLimiter(options = {}) {
  const {
    bucketName = 'default',
    windowMs = 15 * 60 * 1000,
    maxRequests = 10,
    skip = () => false,
    keyGenerator = req => getClientIp(req),
    message = 'Túl sok kérés érkezett. Próbáld újra később.',
  } = options;

  return function rateLimiter(req, res, next) {
    if (process.env.NODE_ENV === 'test' || skip(req)) {
      return next();
    }

    const now = Date.now();
    cleanupExpiredBuckets(now);

    const key = `${bucketName}:${keyGenerator(req)}`;
    const currentBucket = buckets.get(key);

    if (!currentBucket || currentBucket.expiresAt <= now) {
      buckets.set(key, {
        count: 1,
        expiresAt: now + windowMs,
      });

      return next();
    }

    currentBucket.count += 1;

    if (currentBucket.count > maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((currentBucket.expiresAt - now) / 1000)
      );

      res.set('Retry-After', String(retryAfterSeconds));

      return res.status(429).json({
        ok: false,
        message,
        retryAfterSeconds,
      });
    }

    return next();
  };
}

const loginRateLimiter = createRateLimiter({
  bucketName: 'auth-login',
  windowMs: parsePositiveInt(process.env.AUTH_LOGIN_WINDOW_MS, 5 * 60 * 1000),
  maxRequests: parsePositiveInt(process.env.AUTH_LOGIN_MAX_REQUESTS, 20),
  keyGenerator: req => {
    const ip = getClientIp(req);
    const email = String(req.body?.email || '').trim().toLowerCase() || 'unknown-email';
    return `${ip}:${email}`;
  },
  message: 'Túl sok bejelentkezési próbálkozás érkezett. Kérlek, próbáld újra később.',
});

const registerRateLimiter = createRateLimiter({
  bucketName: 'auth-register',
  windowMs: parsePositiveInt(process.env.AUTH_REGISTER_WINDOW_MS, 60 * 60 * 1000),
  maxRequests: parsePositiveInt(process.env.AUTH_REGISTER_MAX_REQUESTS, 20),
  message: 'Túl sok regisztrációs próbálkozás érkezett. Kérlek, próbáld újra később.',
});

module.exports = {
  createRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
};
