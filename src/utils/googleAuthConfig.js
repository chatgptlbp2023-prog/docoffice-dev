const GOOGLE_CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/;

const GOOGLE_CLIENT_ID_PLACEHOLDERS = new Set([
  'google-client-id',
  'your-google-client-id',
  'your_google_client_id',
  'replace_me',
  'replace-with-google-client-id',
  'replace_with_google_client_id'
]);

function splitGoogleClientIdValue(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function isGoogleClientIdPlaceholder(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || GOOGLE_CLIENT_ID_PLACEHOLDERS.has(normalized);
}

function isValidGoogleClientId(value) {
  const normalized = String(value || '').trim();
  return Boolean(normalized) &&
    !isGoogleClientIdPlaceholder(normalized) &&
    GOOGLE_CLIENT_ID_PATTERN.test(normalized);
}

function getGoogleClientIds(env = process.env) {
  return splitGoogleClientIdValue(env.GOOGLE_CLIENT_ID)
    .filter(isValidGoogleClientId);
}

function getGoogleAuthPublicConfig(env = process.env) {
  const rawClientIds = splitGoogleClientIdValue(env.GOOGLE_CLIENT_ID);
  const validClientIds = rawClientIds.filter(isValidGoogleClientId);
  const invalidClientIds = rawClientIds.filter(value => !isValidGoogleClientId(value));

  return {
    ok: true,
    enabled: validClientIds.length > 0,
    configured: validClientIds.length > 0,
    clientId: validClientIds[0] || null,
    clientIdCount: validClientIds.length,
    hasInvalidClientIds: invalidClientIds.length > 0,
    message: validClientIds.length > 0
      ? 'Google login configured.'
      : 'GOOGLE_CLIENT_ID is not configured with a valid Google OAuth Web Client ID.'
  };
}

module.exports = {
  getGoogleAuthPublicConfig,
  getGoogleClientIds,
  isValidGoogleClientId,
};
