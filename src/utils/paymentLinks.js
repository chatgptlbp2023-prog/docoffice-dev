const PAYMENT_LINK_PROVIDERS = new Set(['revolut', 'wise']);

function normalizePaymentLinkProvider(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return PAYMENT_LINK_PROVIDERS.has(normalized) ? normalized : null;
}

function normalizePaymentLinkUrl(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function validatePaymentLinkConfig({ provider, url }) {
  const normalizedProvider = normalizePaymentLinkProvider(provider);
  const normalizedUrl = normalizePaymentLinkUrl(url);

  if (!normalizedProvider && !normalizedUrl) {
    return null;
  }

  if (!normalizedProvider) {
    return 'A fizetési linkhez szolgáltatót is meg kell adni.';
  }

  if (!normalizedUrl) {
    return 'A fizetési linkhez linket is meg kell adni.';
  }

  if (normalizedUrl.length > 2000) {
    return 'A fizetési link túl hosszú.';
  }

  try {
    const parsed = new URL(normalizedUrl);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return 'A fizetési link csak http vagy https lehet.';
    }
  } catch (error) {
    return 'A fizetési link nem érvényes URL.';
  }

  return null;
}

module.exports = {
  PAYMENT_LINK_PROVIDERS,
  normalizePaymentLinkProvider,
  normalizePaymentLinkUrl,
  validatePaymentLinkConfig
};
