function normalizeOrigin(origin) {
  const value = String(origin || '').trim();
  return value ? value.replace(/\/+$/, '') : '';
}

function parseAllowedOrigins(value) {
  return String(value || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
}

function buildCorsOptions(env = process.env) {
  const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  const allowWithoutOrigin = env.NODE_ENV !== 'production';

  return {
    origin(origin, callback) {
      if (!origin) {
        if (allowWithoutOrigin) {
          return callback(null, true);
        }

        return callback(new Error('Hiányzó Origin fejléc.'));
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (allowedOrigins.length === 0) {
        if (env.NODE_ENV === 'production') {
          return callback(new Error('Nincs beállított engedélyezett Origin.'));
        }

        return callback(null, true);
      }

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      return callback(new Error(`Tiltott Origin: ${origin}`));
    },
    credentials: false,
  };
}

module.exports = {
  buildCorsOptions,
  parseAllowedOrigins,
};
