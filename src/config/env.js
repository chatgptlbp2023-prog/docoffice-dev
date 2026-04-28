function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function parseBoolean(value) {
  if (value == null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return null;
}

function parsePositiveInt(name, value, errors, { allowZero = false } = {}) {
  if (value == null || String(value).trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  const isValidInteger = Number.isInteger(parsed);
  const isValidRange = allowZero ? parsed >= 0 : parsed > 0;

  if (!isValidInteger || !isValidRange) {
    errors.push(`${name} értéke érvénytelen. Pozitív egész szám szükséges.`);
    return undefined;
  }

  return parsed;
}

function validateEnv(env = process.env) {
  const errors = [];

  const nodeEnv = env.NODE_ENV || 'development';
  const allowedNodeEnvs = ['development', 'test', 'production'];

  if (!allowedNodeEnvs.includes(nodeEnv)) {
    errors.push(`NODE_ENV értéke érvénytelen: ${nodeEnv}. Engedélyezett: development, test, production.`);
  }

  if (isBlank(env.JWT_SECRET)) {
    errors.push('JWT_SECRET hiányzik.');
  }

  const hasDatabaseUrl = !isBlank(env.DATABASE_URL);
  const hasPgConfig = !isBlank(env.PGHOST) && !isBlank(env.PGDATABASE) && !isBlank(env.PGUSER);
  const hasDbConfig = !isBlank(env.DB_HOST) && !isBlank(env.DB_NAME) && !isBlank(env.DB_USER);

  if (!hasDatabaseUrl && !hasPgConfig && !hasDbConfig) {
    errors.push(
      'Adatbázis konfiguráció hiányzik. Adj meg DATABASE_URL-t, a PGHOST + PGDATABASE + PGUSER, vagy a DB_HOST + DB_NAME + DB_USER kombinációt.'
    );
  }

  parsePositiveInt('PORT', env.PORT, errors);
  parsePositiveInt('PGPORT', env.PGPORT, errors);
  parsePositiveInt('DB_PORT', env.DB_PORT, errors);
  parsePositiveInt('AUTH_LOGIN_WINDOW_MS', env.AUTH_LOGIN_WINDOW_MS, errors);
  parsePositiveInt('AUTH_LOGIN_MAX_REQUESTS', env.AUTH_LOGIN_MAX_REQUESTS, errors);
  parsePositiveInt('AUTH_REGISTER_WINDOW_MS', env.AUTH_REGISTER_WINDOW_MS, errors);
  parsePositiveInt('AUTH_REGISTER_MAX_REQUESTS', env.AUTH_REGISTER_MAX_REQUESTS, errors);

  const trustProxy = parseBoolean(env.TRUST_PROXY);
  if (trustProxy === null) {
    errors.push('TRUST_PROXY értéke érvénytelen. Használj true/false értéket.');
  }

  if (errors.length > 0) {
    const message = ['Érvénytelen vagy hiányos környezeti konfiguráció:', ...errors.map(error => `- ${error}`)].join('\n');
    const startupError = new Error(message);
    startupError.name = 'StartupConfigError';
    startupError.details = errors;
    throw startupError;
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: env.PORT ? Number(env.PORT) : 3000,
    TRUST_PROXY: trustProxy === true,
  };
}

module.exports = {
  validateEnv,
};
