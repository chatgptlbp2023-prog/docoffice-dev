const {
  NOTIFICATION_PREFERENCE_KEYS,
  normalizeNotificationPreferences
} = require('../utils/notificationPreferences');
const {
  normalizePricingMode,
  validatePricingConfig
} = require('../utils/eventPricing');
const {
  normalizePaymentLinkProvider,
  normalizePaymentLinkUrl,
  validatePaymentLinkConfig
} = require('../utils/paymentLinks');
const { validateAvatarDataUrl } = require('../utils/imageDataUrl');

function badRequest(res, message, extra = {}) {
  return res.status(400).json({
    ok: false,
    message,
    ...extra,
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureBodyObject(req, res) {
  if (!isPlainObject(req.body)) {
    badRequest(res, 'Érvénytelen kérésformátum. A body csak JSON objektum lehet.');
    return false;
  }

  return true;
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
}

function validateOptionalString(value, fieldLabel, { maxLength = 1000, allowNull = true } = {}) {
  if (value == null) {
    if (allowNull) {
      return { value: null };
    }

    return { error: `${fieldLabel} kötelező.` };
  }

  if (typeof value !== 'string') {
    return { error: `${fieldLabel} csak szöveg lehet.` };
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    return { error: `${fieldLabel} legfeljebb ${maxLength} karakter lehet.` };
  }

  return { value: normalized };
}

function validateRequiredString(value, fieldLabel, { minLength = 1, maxLength = 255 } = {}) {
  if (typeof value !== 'string') {
    return { error: `${fieldLabel} kötelező.` };
  }

  const normalized = value.trim();

  if (!normalized) {
    return { error: `${fieldLabel} kötelező.` };
  }

  if (normalized.length < minLength) {
    return { error: `${fieldLabel} legalább ${minLength} karakter legyen.` };
  }

  if (normalized.length > maxLength) {
    return { error: `${fieldLabel} legfeljebb ${maxLength} karakter lehet.` };
  }

  return { value: normalized };
}

function validateInteger(value, fieldLabel, { min = null, max = null, required = false } = {}) {
  if (value == null) {
    if (required) {
      return { error: `${fieldLabel} kötelező.` };
    }

    return { value };
  }

  if (!Number.isInteger(value)) {
    return { error: `${fieldLabel} csak egész szám lehet.` };
  }

  if (min != null && value < min) {
    return { error: `${fieldLabel} legalább ${min} kell legyen.` };
  }

  if (max != null && value > max) {
    return { error: `${fieldLabel} legfeljebb ${max} lehet.` };
  }

  return { value };
}

function validateNumber(value, fieldLabel, { min = null, max = null } = {}) {
  if (value == null) {
    return { value };
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    return { error: `${fieldLabel} csak szám lehet.` };
  }

  if (min != null && value < min) {
    return { error: `${fieldLabel} legalább ${min} lehet.` };
  }

  if (max != null && value > max) {
    return { error: `${fieldLabel} legfeljebb ${max} lehet.` };
  }

  return { value };
}

function validateBoolean(value, fieldLabel, { required = false } = {}) {
  if (value == null) {
    if (required) {
      return { error: `${fieldLabel} kötelező.` };
    }

    return { value };
  }

  if (typeof value !== 'boolean') {
    return { error: `${fieldLabel} csak boolean lehet.` };
  }

  return { value };
}

function validateNotificationPreferences(value) {
  if (value == null) {
    return { value: normalizeNotificationPreferences(undefined) };
  }

  if (!isPlainObject(value)) {
    return { error: 'A notificationPreferences csak objektum lehet.' };
  }

  const unknownFields = Object.keys(value).filter(
    key => !NOTIFICATION_PREFERENCE_KEYS.includes(key)
  );

  if (unknownFields.length > 0) {
    return {
      error: `Ismeretlen notificationPreferences mezők: ${unknownFields.join(', ')}`
    };
  }

  for (const key of NOTIFICATION_PREFERENCE_KEYS) {
    if (
      Object.prototype.hasOwnProperty.call(value, key) &&
      typeof value[key] !== 'boolean'
    ) {
      return {
        error: `A notificationPreferences.${key} csak boolean lehet.`
      };
    }
  }

  return {
    value: normalizeNotificationPreferences(value)
  };
}

function rejectUnknownFields(body, allowedFields) {
  return Object.keys(body).filter(key => !allowedFields.includes(key));
}

function validateRegister(req, res, next) {
  if (!ensureBodyObject(req, res)) {
    return;
  }

  const name = validateRequiredString(req.body.name, 'A név', { minLength: 2, maxLength: 100 });
  if (name.error) {
    return badRequest(res, name.error);
  }

  const email = normalizeEmail(req.body.email);
  if (!email) {
    return badRequest(res, 'Az email kötelező.');
  }

  if (!isValidEmail(email)) {
    return badRequest(res, 'Érvénytelen email cím.');
  }

  const password = normalizeString(req.body.password);
  if (!password) {
    return badRequest(res, 'A password kötelező.');
  }

  if (password.length < 6) {
    return badRequest(res, 'A jelszó legalább 6 karakter legyen.');
  }

  if (password.length > 128) {
    return badRequest(res, 'A jelszó legfeljebb 128 karakter lehet.');
  }

  const phone = req.body.phone == null ? null : normalizeString(req.body.phone);
  if (phone && phone.length > 40) {
    return badRequest(res, 'A telefonszám legfeljebb 40 karakter lehet.');
  }

  const inviteToken = req.body.inviteToken == null ? null : normalizeString(req.body.inviteToken);
  if (inviteToken && inviteToken.length > 255) {
    return badRequest(res, 'A meghívókód túl hosszú.');
  }

  if (
    req.body.registerAsOrganizer != null &&
    typeof req.body.registerAsOrganizer !== 'boolean'
  ) {
    return badRequest(res, 'A registerAsOrganizer csak boolean lehet.');
  }

  req.body.name = name.value;
  req.body.email = email;
  req.body.password = password;
  req.body.phone = phone;
  req.body.inviteToken = inviteToken;
  req.body.registerAsOrganizer = req.body.registerAsOrganizer === true;
  return next();
}

function validateLogin(req, res, next) {
  if (!ensureBodyObject(req, res)) {
    return;
  }

  const email = normalizeEmail(req.body.email);
  const password = normalizeString(req.body.password);

  if (!email || !password) {
    return badRequest(res, 'Az email és a password kötelező.');
  }

  if (!isValidEmail(email)) {
    return badRequest(res, 'Érvénytelen email cím.');
  }

  req.body.email = email;
  req.body.password = password;
  return next();
}

function validateCreateTeam(req, res, next) {
  if (!ensureBodyObject(req, res)) {
    return;
  }

  const name = validateRequiredString(req.body.name, 'A csapat neve', { minLength: 2, maxLength: 120 });
  if (name.error) {
    return badRequest(res, name.error);
  }

  req.body.name = name.value;
  return next();
}

function validateAddTeamMember(req, res, next) {
  if (!ensureBodyObject(req, res)) {
    return;
  }

  const email = normalizeEmail(req.body.email);
  if (!email) {
    return badRequest(res, 'Az email kötelező.');
  }

  if (!isValidEmail(email)) {
    return badRequest(res, 'Érvénytelen email cím.');
  }

  const role = normalizeString(req.body.role || 'member').toLowerCase();
  if (!['member', 'vice_captain'].includes(role)) {
    return badRequest(res, 'A role csak member vagy vice_captain lehet.');
  }

  req.body.email = email;
  req.body.role = role;
  return next();
}

function validateUpdateTeamMember(req, res, next) {
  if (!ensureBodyObject(req, res)) {
    return;
  }

  const role = normalizeString(req.body.role).toLowerCase();
  if (!['member', 'vice_captain'].includes(role)) {
    return badRequest(res, 'A role csak member vagy vice_captain lehet.');
  }

  req.body.role = role;
  return next();
}

function validateCaptainTransfer(req, res, next) {
  if (!ensureBodyObject(req, res)) {
    return;
  }

  const targetUserId = normalizeString(req.body.targetUserId);
  if (!targetUserId) {
    return badRequest(res, 'A targetUserId kötelező.');
  }

  req.body.targetUserId = targetUserId;
  return next();
}

function validateTeamFinanceAdjustment(req, res, next) {
  if (!ensureBodyObject(req, res)) {
    return;
  }

  const rawAmount = req.body.adjustmentAmount;
  const amount =
    rawAmount === '' || rawAmount == null
      ? NaN
      : Number(rawAmount);

  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount === 0) {
    return badRequest(res, 'Az adjustmentAmount csak 0-tol kulonbozo egesz szam lehet.');
  }

  const note = req.body.note == null ? null : normalizeString(req.body.note);
  if (note && note.length > 300) {
    return badRequest(res, 'A megjegyzes legfeljebb 300 karakter lehet.');
  }

  req.body.adjustmentAmount = amount;
  req.body.note = note || null;
  return next();
}

function validateCreateInvite(req, res, next) {
  if (!ensureBodyObject(req, res)) {
    return;
  }

  const email = req.body.email == null ? null : normalizeEmail(req.body.email);
  if (!email) {
    return badRequest(res, 'Az email cím kötelező.');
  }
  if (email && !isValidEmail(email)) {
    return badRequest(res, 'Érvénytelen email cím.');
  }

  const role = normalizeString(req.body.role || 'member').toLowerCase();
  if (!['member', 'team_manager'].includes(role)) {
    return badRequest(res, 'A role csak member vagy team_manager lehet.');
  }

  const messageResult = validateOptionalString(req.body.message, 'Az üzenet', { maxLength: 500, allowNull: true });
  if (messageResult.error) {
    return badRequest(res, messageResult.error);
  }

  const phone = req.body.phone == null ? null : normalizeString(req.body.phone);
  if (phone && phone.length > 40) {
    return badRequest(res, 'A telefonszám legfeljebb 40 karakter lehet.');
  }

  req.body.email = email;
  req.body.phone = phone;
  req.body.role = role;
  req.body.message = messageResult.value ?? null;
  return next();
}

function validateGoogleAuth(req, res, next) {
  if (!ensureBodyObject(req, res)) {
    return;
  }

  const idToken = normalizeString(req.body.idToken);
  if (!idToken) {
    return badRequest(res, 'A Google azonosító token kötelező.');
  }

  const inviteToken = req.body.inviteToken == null ? null : normalizeString(req.body.inviteToken);
  if (inviteToken && inviteToken.length > 255) {
    return badRequest(res, 'A meghívókód túl hosszú.');
  }

  const phone = req.body.phone == null ? null : normalizeString(req.body.phone);
  if (phone && phone.length > 40) {
    return badRequest(res, 'A telefonszám legfeljebb 40 karakter lehet.');
  }

  if (
    req.body.registerAsOrganizer != null &&
    typeof req.body.registerAsOrganizer !== 'boolean'
  ) {
    return badRequest(res, 'A registerAsOrganizer csak boolean lehet.');
  }

  req.body.idToken = idToken;
  req.body.inviteToken = inviteToken;
  req.body.phone = phone;
  req.body.registerAsOrganizer = req.body.registerAsOrganizer === true;
  return next();
}

function validateUpdateProfile(req, res, next) {
  if (!ensureBodyObject(req, res)) {
    return;
  }

  const name = validateRequiredString(req.body.name, 'A regisztrációs név', {
    minLength: 2,
    maxLength: 100
  });
  if (name.error) {
    return badRequest(res, name.error);
  }

  const nicknameResult = validateOptionalString(req.body.nickname, 'A becenév', {
    maxLength: 60,
    allowNull: true
  });
  if (nicknameResult.error) {
    return badRequest(res, nicknameResult.error);
  }

  const phoneResult = validateOptionalString(req.body.phone, 'A telefonszám', {
    maxLength: 40,
    allowNull: true
  });
  if (phoneResult.error) {
    return badRequest(res, phoneResult.error);
  }

  let birthYear = null;
  if (req.body.birthYear != null && req.body.birthYear !== '') {
    const normalizedBirthYear = String(req.body.birthYear).trim();
    if (!/^\d{4}$/.test(normalizedBirthYear)) {
      return badRequest(res, 'A születési év pontosan 4 számjegy lehet.');
    }

    birthYear = Number(normalizedBirthYear);
    if (birthYear < 1900 || birthYear > 2100) {
      return badRequest(res, 'A születési év érvénytelen.');
    }
  }

  const avatarDataUrl = req.body.avatarDataUrl == null ? null : String(req.body.avatarDataUrl).trim();
  if (
    avatarDataUrl &&
    !/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(avatarDataUrl) &&
    !/^data:image\/svg\+xml;charset=utf-8,/i.test(avatarDataUrl)
  ) {
    return badRequest(res, 'Az avatar csak kép formátumú data URL lehet.');
  }

  if (avatarDataUrl) {
    const avatarValidation = validateAvatarDataUrl(avatarDataUrl);
    if (!avatarValidation.ok) {
      return badRequest(res, avatarValidation.message);
    }
  }

  const paymentProviderRaw = req.body.paymentProvider == null ? null : String(req.body.paymentProvider).trim().toLowerCase();
  const paymentProvider =
    paymentProviderRaw === ''
      ? null
      : paymentProviderRaw;
  if (paymentProvider && !['revolut', 'wise'].includes(paymentProvider)) {
    return badRequest(res, 'A fizetési szolgáltató csak Revolut vagy Wise lehet.');
  }

  const paymentUsernameResult = validateOptionalString(req.body.paymentUsername, 'A fizetési felhasználónév', {
    maxLength: 120,
    allowNull: true
  });
  if (paymentUsernameResult.error) {
    return badRequest(res, paymentUsernameResult.error);
  }

  const paymentQrDataUrl = req.body.paymentQrDataUrl == null ? null : String(req.body.paymentQrDataUrl).trim();
  if (
    paymentQrDataUrl &&
    !/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(paymentQrDataUrl) &&
    !/^data:image\/svg\+xml;charset=utf-8,/i.test(paymentQrDataUrl)
  ) {
    return badRequest(res, 'A fizetési QR-kód csak kép formátumú data URL lehet.');
  }

  if (paymentQrDataUrl) {
    const qrValidation = validateAvatarDataUrl(paymentQrDataUrl);
    if (!qrValidation.ok) {
      return badRequest(
        res,
        qrValidation.message
          .replace(/^Az avatar/i, 'A fizetési QR-kód')
          .replace(/^Az avatar/i, 'A fizetési QR-kód')
          .replace(/^avatar/i, 'fizetési QR-kód')
      );
    }
  }

  req.body.name = name.value;
  req.body.nickname = nicknameResult.value ?? null;
  req.body.phone = phoneResult.value ?? null;
  req.body.birthYear = birthYear;
  req.body.avatarDataUrl = avatarDataUrl || null;
  req.body.paymentProvider = paymentProvider;
  req.body.paymentUsername = paymentUsernameResult.value ?? null;
  req.body.paymentQrDataUrl = paymentQrDataUrl || null;
  return next();
}

function validateCreateEvent(req, res, next) {
  if (!ensureBodyObject(req, res)) {
    return;
  }

  const title = validateRequiredString(req.body.title, 'A title', { minLength: 3, maxLength: 150 });
  if (title.error) return badRequest(res, title.error);

  const startAt = validateRequiredString(req.body.startAt, 'A startAt', { minLength: 10, maxLength: 50 });
  if (startAt.error) return badRequest(res, startAt.error);
  if (!isValidDate(startAt.value)) return badRequest(res, 'A startAt érvénytelen dátum.');

  const locationName = validateRequiredString(req.body.locationName, 'A locationName', { minLength: 2, maxLength: 150 });
  if (locationName.error) return badRequest(res, locationName.error);

  const minPlayers = validateInteger(req.body.minPlayers, 'A minPlayers', { required: true, min: 1, max: 50 });
  if (minPlayers.error) return badRequest(res, minPlayers.error);

  const playersOnFieldTotal = validateInteger(req.body.playersOnFieldTotal, 'A playersOnFieldTotal', { required: true, min: 1, max: 50 });
  if (playersOnFieldTotal.error) return badRequest(res, playersOnFieldTotal.error);

  const substitutesEnabled = validateBoolean(req.body.substitutesEnabled, 'A substitutesEnabled', { required: true });
  if (substitutesEnabled.error) return badRequest(res, substitutesEnabled.error);

  const substitutesCount = validateInteger(req.body.substitutesCount, 'A substitutesCount', { min: 0, max: 10 });
  if (substitutesCount.error) return badRequest(res, substitutesCount.error);

  if (req.body.substitutesEnabled === true && req.body.substitutesCount == null) {
    return badRequest(res, 'Ha a substitutesEnabled igaz, a substitutesCount kötelező.');
  }

  if (req.body.substitutesEnabled === false && req.body.substitutesCount != null && req.body.substitutesCount !== 0) {
    return badRequest(res, 'Ha a substitutesEnabled hamis, a substitutesCount csak 0 vagy üres lehet.');
  }

  const initialStatus = req.body.initialStatus == null ? null : normalizeString(req.body.initialStatus).toLowerCase();
  if (initialStatus && !['draft', 'published'].includes(initialStatus)) {
    return badRequest(res, 'Az initialStatus csak draft vagy published lehet.');
  }

  if (
    req.body.confirmHolidayOverride != null &&
    typeof req.body.confirmHolidayOverride !== 'boolean'
  ) {
    return badRequest(res, 'A confirmHolidayOverride csak boolean lehet.');
  }

  const notificationPreferences = validateNotificationPreferences(
    req.body.notificationPreferences
  );
  if (notificationPreferences.error) {
    return badRequest(res, notificationPreferences.error);
  }

  const gameDurationMinutes = validateInteger(req.body.gameDurationMinutes, 'A gameDurationMinutes', { min: 1, max: 300 });
  if (gameDurationMinutes.error) return badRequest(res, gameDurationMinutes.error);

  const pricePerPlayer = validateNumber(req.body.pricePerPlayer, 'A pricePerPlayer', { min: 0, max: 1000000 });
  if (pricePerPlayer.error) return badRequest(res, pricePerPlayer.error);
  const fixedPricePerPerson = validateNumber(req.body.fixedPricePerPerson, 'A fixedPricePerPerson', { min: 0, max: 1000000 });
  if (fixedPricePerPerson.error) return badRequest(res, fixedPricePerPerson.error);
  const totalEventCost = validateNumber(req.body.totalEventCost, 'A totalEventCost', { min: 0, max: 1000000 });
  if (totalEventCost.error) return badRequest(res, totalEventCost.error);
  const perPlayerFee = validateInteger(req.body.perPlayerFee, 'A perPlayerFee', { min: 0, max: 500 });
  if (perPlayerFee.error) return badRequest(res, perPlayerFee.error);
  const pricingMode = normalizePricingMode(req.body.pricingMode) || (req.body.pricePerPlayer != null ? 'fixed_per_person' : 'free');
  const pricingError = validatePricingConfig({
    pricingMode,
    fixedPricePerPerson: req.body.fixedPricePerPerson ?? req.body.pricePerPlayer ?? null,
    totalEventCost: req.body.totalEventCost ?? null,
    perPlayerFee: req.body.perPlayerFee ?? 0
  });
  if (pricingError) return badRequest(res, pricingError);

  for (const [field, label, maxLength] of [
    ['description', 'A description', 2000],
    ['locationAddress', 'A locationAddress', 255],
    ['fieldSize', 'A fieldSize', 50],
    ['fieldQuality', 'A fieldQuality', 50],
    ['surfaceType', 'A surfaceType', 50],
    ['rulesText', 'A rulesText', 4000],
    ['paymentNotes', 'A paymentNotes', 1000],
    ['paymentLinkUrl', 'A paymentLinkUrl', 2000],
  ]) {
    const result = validateOptionalString(req.body[field], label, { maxLength, allowNull: true });
    if (result.error) {
      return badRequest(res, result.error);
    }
    req.body[field] = result.value ?? null;
  }

  req.body.title = title.value;
  req.body.startAt = startAt.value;
  req.body.locationName = locationName.value;
  req.body.notificationPreferences = notificationPreferences.value;
  req.body.pricingMode = pricingMode;
  req.body.fixedPricePerPerson = req.body.fixedPricePerPerson ?? req.body.pricePerPlayer ?? null;
  req.body.totalEventCost = req.body.totalEventCost ?? null;
  req.body.perPlayerFee = req.body.perPlayerFee ?? 0;
  const rawPaymentLinkProvider = req.body.paymentLinkProvider;
  req.body.paymentLinkProvider = normalizePaymentLinkProvider(req.body.paymentLinkProvider);
  req.body.paymentLinkUrl = normalizePaymentLinkUrl(req.body.paymentLinkUrl);
  if (normalizeString(rawPaymentLinkProvider) && req.body.paymentLinkProvider == null) {
    return badRequest(res, 'A fizetési link szolgáltatója csak Revolut vagy Wise lehet.');
  }
  {
    const paymentLinkError = validatePaymentLinkConfig({
      provider: req.body.paymentLinkProvider,
      url: req.body.paymentLinkUrl
    });
    if (paymentLinkError) return badRequest(res, paymentLinkError);
  }
  if (initialStatus) req.body.initialStatus = initialStatus;
  return next();
}

function validateUpdateEvent(req, res, next) {
  if (!ensureBodyObject(req, res)) {
    return;
  }

  const allowedFields = [
    'title',
    'description',
    'startAt',
    'locationName',
    'locationAddress',
    'minPlayers',
    'playersOnFieldTotal',
    'substitutesEnabled',
    'substitutesCount',
    'fieldSize',
    'fieldQuality',
    'surfaceType',
    'gameDurationMinutes',
    'rulesText',
    'pricePerPlayer',
    'pricingMode',
    'fixedPricePerPerson',
    'totalEventCost',
    'perPlayerFee',
    'paymentNotes',
    'paymentLinkProvider',
    'paymentLinkUrl',
    'hiddenFromAdminList'
  ];

  const keys = Object.keys(req.body);
  if (keys.length === 0) {
    return badRequest(res, 'Nincs módosítandó mező.');
  }

  const unknownFields = rejectUnknownFields(req.body, allowedFields);
  if (unknownFields.length > 0) {
    return badRequest(res, `Nem szerkeszthető vagy ismeretlen mezők: ${unknownFields.join(', ')}`);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
    const result = validateRequiredString(req.body.title, 'A title', { minLength: 3, maxLength: 150 });
    if (result.error) return badRequest(res, result.error);
    req.body.title = result.value;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'startAt')) {
    const result = validateRequiredString(req.body.startAt, 'A startAt', { minLength: 10, maxLength: 50 });
    if (result.error) return badRequest(res, result.error);
    if (!isValidDate(result.value)) return badRequest(res, 'A startAt érvénytelen dátum.');
    req.body.startAt = result.value;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'locationName')) {
    const result = validateRequiredString(req.body.locationName, 'A locationName', { minLength: 2, maxLength: 150 });
    if (result.error) return badRequest(res, result.error);
    req.body.locationName = result.value;
  }

  for (const [field, label, maxLength] of [
    ['description', 'A description', 2000],
    ['locationAddress', 'A locationAddress', 255],
    ['fieldSize', 'A fieldSize', 50],
    ['fieldQuality', 'A fieldQuality', 50],
    ['surfaceType', 'A surfaceType', 50],
    ['rulesText', 'A rulesText', 4000],
    ['paymentNotes', 'A paymentNotes', 1000],
    ['paymentLinkUrl', 'A paymentLinkUrl', 2000],
  ]) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      const result = validateOptionalString(req.body[field], label, { maxLength, allowNull: true });
      if (result.error) {
        return badRequest(res, result.error);
      }
      req.body[field] = result.value ?? null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'minPlayers')) {
    const result = validateInteger(req.body.minPlayers, 'A minPlayers', { min: 1, max: 50, required: true });
    if (result.error) return badRequest(res, result.error);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'playersOnFieldTotal')) {
    const result = validateInteger(req.body.playersOnFieldTotal, 'A playersOnFieldTotal', { min: 1, max: 50, required: true });
    if (result.error) return badRequest(res, result.error);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'substitutesEnabled')) {
    const result = validateBoolean(req.body.substitutesEnabled, 'A substitutesEnabled', { required: true });
    if (result.error) return badRequest(res, result.error);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'substitutesCount')) {
    const result = validateInteger(req.body.substitutesCount, 'A substitutesCount', { min: 0, max: 10 });
    if (result.error) return badRequest(res, result.error);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'hiddenFromAdminList')) {
    const result = validateBoolean(req.body.hiddenFromAdminList, 'A hiddenFromAdminList', { required: true });
    if (result.error) return badRequest(res, result.error);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'paymentLinkProvider')) {
    const rawPaymentLinkProvider = req.body.paymentLinkProvider;
    req.body.paymentLinkProvider = normalizePaymentLinkProvider(rawPaymentLinkProvider);
    if (normalizeString(rawPaymentLinkProvider) && req.body.paymentLinkProvider == null) {
      return badRequest(res, 'A fizetési link szolgáltatója csak Revolut vagy Wise lehet.');
    }
  }

  if (req.body.substitutesEnabled === true && Object.prototype.hasOwnProperty.call(req.body, 'substitutesCount') && req.body.substitutesCount == null) {
    return badRequest(res, 'Ha a substitutesEnabled igaz, a substitutesCount kötelező.');
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'gameDurationMinutes')) {
    const result = validateInteger(req.body.gameDurationMinutes, 'A gameDurationMinutes', { min: 1, max: 300 });
    if (result.error) return badRequest(res, result.error);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'pricePerPlayer')) {
    const result = validateNumber(req.body.pricePerPlayer, 'A pricePerPlayer', { min: 0, max: 1000000 });
    if (result.error) return badRequest(res, result.error);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'fixedPricePerPerson')) {
    const result = validateNumber(req.body.fixedPricePerPerson, 'A fixedPricePerPerson', { min: 0, max: 1000000 });
    if (result.error) return badRequest(res, result.error);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'totalEventCost')) {
    const result = validateNumber(req.body.totalEventCost, 'A totalEventCost', { min: 0, max: 1000000 });
    if (result.error) return badRequest(res, result.error);
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'perPlayerFee')) {
    const result = validateInteger(req.body.perPlayerFee, 'A perPlayerFee', { min: 0, max: 500 });
    if (result.error) return badRequest(res, result.error);
  }

  const resolvedPricingMode =
    normalizePricingMode(req.body.pricingMode) ||
    (Object.prototype.hasOwnProperty.call(req.body, 'pricePerPlayer') ? 'fixed_per_person' : null);

  if (Object.prototype.hasOwnProperty.call(req.body, 'pricingMode') && !resolvedPricingMode) {
    return badRequest(res, 'Érvénytelen díjszámítási mód.');
  }

  if (
    resolvedPricingMode ||
    Object.prototype.hasOwnProperty.call(req.body, 'fixedPricePerPerson') ||
    Object.prototype.hasOwnProperty.call(req.body, 'totalEventCost') ||
    Object.prototype.hasOwnProperty.call(req.body, 'perPlayerFee') ||
    Object.prototype.hasOwnProperty.call(req.body, 'pricePerPlayer')
  ) {
    const pricingError = validatePricingConfig({
      pricingMode: resolvedPricingMode || 'free',
      fixedPricePerPerson: req.body.fixedPricePerPerson ?? req.body.pricePerPlayer ?? null,
      totalEventCost: req.body.totalEventCost ?? null,
      perPlayerFee: req.body.perPlayerFee ?? 0
    });
    if (pricingError) return badRequest(res, pricingError);
    if (resolvedPricingMode) {
      req.body.pricingMode = resolvedPricingMode;
    }
    if (
      Object.prototype.hasOwnProperty.call(req.body, 'fixedPricePerPerson') ||
      Object.prototype.hasOwnProperty.call(req.body, 'pricePerPlayer')
    ) {
      req.body.fixedPricePerPerson = req.body.fixedPricePerPerson ?? req.body.pricePerPlayer ?? null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'paymentLinkUrl')) {
    req.body.paymentLinkUrl = normalizePaymentLinkUrl(req.body.paymentLinkUrl);
  }

  if (
    Object.prototype.hasOwnProperty.call(req.body, 'paymentLinkProvider') ||
    Object.prototype.hasOwnProperty.call(req.body, 'paymentLinkUrl')
  ) {
    const paymentLinkError = validatePaymentLinkConfig({
      provider: req.body.paymentLinkProvider,
      url: req.body.paymentLinkUrl
    });
    if (paymentLinkError) return badRequest(res, paymentLinkError);
  }

  return next();
}

function validateUpdateEventStatus(req, res, next) {
  if (!ensureBodyObject(req, res)) {
    return;
  }

  const status = normalizeString(req.body.status).toLowerCase();
  if (!status) {
    return badRequest(res, 'A status kötelező.');
  }

  if (!['draft', 'published', 'cancelled', 'finished'].includes(status)) {
    return badRequest(res, 'Az érvényes státuszok: draft, published, cancelled, finished.');
  }

  req.body.status = status;
  return next();
}

module.exports = {
  validateRegister,
  validateLogin,
  validateCreateTeam,
  validateAddTeamMember,
  validateUpdateTeamMember,
  validateCaptainTransfer,
  validateTeamFinanceAdjustment,
  validateCreateInvite,
  validateGoogleAuth,
  validateUpdateProfile,
  validateCreateEvent,
  validateUpdateEvent,
  validateUpdateEventStatus,
};
