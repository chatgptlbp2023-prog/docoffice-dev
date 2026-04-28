const PRICING_MODE = Object.freeze({
  FREE: 'free',
  FIXED_PER_PERSON: 'fixed_per_person',
  SPLIT_TOTAL_COST: 'split_total_cost'
});

const PRICING_MODE_VALUES = new Set(Object.values(PRICING_MODE));
const ALLOWED_FEE_VALUES = new Set([0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500]);

function normalizePricingMode(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return PRICING_MODE_VALUES.has(normalized) ? normalized : null;
}

function normalizeMoneyValue(value) {
  if (value == null || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeFeeValue(value) {
  if (value == null || value === '') {
    return 0;
  }

  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function roundToHundreds(value) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value / 100) * 100;
}

function resolvePricingConfig(source = {}) {
  const legacyPrice = normalizeMoneyValue(source.price_per_player ?? source.pricePerPlayer);
  const pricingMode =
    normalizePricingMode(source.pricing_mode ?? source.pricingMode) ||
    (legacyPrice != null ? PRICING_MODE.FIXED_PER_PERSON : PRICING_MODE.FREE);
  const fixedPricePerPerson =
    normalizeMoneyValue(source.fixed_price_per_person ?? source.fixedPricePerPerson) ??
    (pricingMode === PRICING_MODE.FIXED_PER_PERSON ? legacyPrice : null);
  const totalEventCost = normalizeMoneyValue(source.total_event_cost ?? source.totalEventCost);
  const perPlayerFee = normalizeFeeValue(source.per_player_fee ?? source.perPlayerFee);

  return {
    pricingMode,
    fixedPricePerPerson,
    totalEventCost,
    perPlayerFee
  };
}

function validatePricingConfig(config) {
  const pricingMode = normalizePricingMode(config.pricingMode);

  if (!pricingMode) {
    return 'Érvénytelen díjszámítási mód.';
  }

  if (!ALLOWED_FEE_VALUES.has(config.perPlayerFee)) {
    return 'Az alapdíj csak 0 és 500 Ft közötti, 50-es léptékű érték lehet.';
  }

  if (pricingMode === PRICING_MODE.FREE) {
    return null;
  }

  if (
    pricingMode === PRICING_MODE.FIXED_PER_PERSON &&
    (config.fixedPricePerPerson == null || config.fixedPricePerPerson < 0)
  ) {
    return 'Fix fejpénznél a fejpénz / fő megadása kötelező.';
  }

  if (
    pricingMode === PRICING_MODE.SPLIT_TOTAL_COST &&
    (config.totalEventCost == null || config.totalEventCost < 0)
  ) {
    return 'Osztott pályadíjnál a teljes pályadíj megadása kötelező.';
  }

  return null;
}

function buildEventPaymentSummary(source = {}, { goingCount = 0, drawStatus = null } = {}) {
  const config = resolvePricingConfig(source);
  let baseAmount = 0;
  let finalAmount = 0;
  let isVisibleToUser = false;
  let statusLabel = 'Ingyenes esemény';

  if (config.pricingMode === PRICING_MODE.FREE) {
    isVisibleToUser = true;
    statusLabel = 'Ingyenes esemény';
  } else if (config.pricingMode === PRICING_MODE.FIXED_PER_PERSON) {
    baseAmount = config.fixedPricePerPerson || 0;
    finalAmount = roundToHundreds(baseAmount + config.perPlayerFee) || 0;
    isVisibleToUser = true;
    statusLabel = 'Fix fejpénz';
  } else if (config.pricingMode === PRICING_MODE.SPLIT_TOTAL_COST) {
    baseAmount =
      goingCount > 0 && config.totalEventCost != null
        ? config.totalEventCost / goingCount
        : null;
    finalAmount =
      baseAmount == null ? null : roundToHundreds(baseAmount + config.perPlayerFee);
    isVisibleToUser =
      finalAmount != null && ['saved', 'published', 'stale'].includes(String(drawStatus || '').toLowerCase());
    statusLabel = 'Osztott pályadíj';
  }

  return {
    pricing_mode: config.pricingMode,
    fixed_price_per_person: config.fixedPricePerPerson,
    total_event_cost: config.totalEventCost,
    per_player_fee: config.perPlayerFee,
    going_count_basis: goingCount,
    base_amount_per_person: baseAmount == null ? null : Math.round(baseAmount),
    final_amount_per_person: finalAmount,
    is_visible_to_user: isVisibleToUser,
    label: statusLabel
  };
}

module.exports = {
  PRICING_MODE,
  ALLOWED_FEE_VALUES,
  normalizePricingMode,
  resolvePricingConfig,
  validatePricingConfig,
  buildEventPaymentSummary,
  roundToHundreds
};
