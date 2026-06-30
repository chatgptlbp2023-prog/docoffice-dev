const { pool } = require('./dbService');

const GOOGLE_GEOCODING_BASE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

function getGoogleMapsApiKey() {
  return String(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY || '').trim();
}

function normalizeNullableString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeCoordinate(value, { min, max } = {}) {
  if (value == null || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (min != null && numeric < min) {
    return null;
  }

  if (max != null && numeric > max) {
    return null;
  }

  return numeric;
}

function normalizeLatitude(value) {
  return normalizeCoordinate(value, { min: -90, max: 90 });
}

function normalizeLongitude(value) {
  return normalizeCoordinate(value, { min: -180, max: 180 });
}

function getEventLocationCoordinates(event = {}) {
  const latitude = normalizeLatitude(event.location_latitude ?? event.locationLatitude);
  const longitude = normalizeLongitude(event.location_longitude ?? event.locationLongitude);

  if (latitude == null || longitude == null) {
    return null;
  }

  return {
    latitude,
    longitude,
    placeId: normalizeNullableString(event.location_place_id ?? event.locationPlaceId),
    formattedAddress: normalizeNullableString(
      event.location_formatted_address ?? event.locationFormattedAddress
    ),
    geocodedAt: event.location_geocoded_at ?? event.locationGeocodedAt ?? null
  };
}

function buildLocationAddress(event = {}) {
  return normalizeNullableString(
    event.locationAddress
      ?? event.location_address
      ?? event.locationName
      ?? event.location_name
  );
}

function buildProvidedGeo(input = {}) {
  const latitude = normalizeLatitude(input.locationLatitude ?? input.location_latitude);
  const longitude = normalizeLongitude(input.locationLongitude ?? input.location_longitude);

  if (latitude == null || longitude == null) {
    return null;
  }

  return {
    latitude,
    longitude,
    placeId: normalizeNullableString(input.locationPlaceId ?? input.location_place_id),
    formattedAddress: normalizeNullableString(
      input.locationFormattedAddress ?? input.location_formatted_address
    ),
    geocodedAt: new Date().toISOString(),
    source: 'provided'
  };
}

function buildGoogleGeocodingUrl(address) {
  const params = new URLSearchParams({
    address,
    key: getGoogleMapsApiKey(),
    language: 'hu',
    region: 'hu'
  });

  return `${GOOGLE_GEOCODING_BASE_URL}?${params.toString()}`;
}

async function geocodeAddressWithGoogle(address) {
  const normalizedAddress = normalizeNullableString(address);
  if (!normalizedAddress) {
    return null;
  }

  if (!getGoogleMapsApiKey()) {
    const error = new Error('A cím alapú helymeghatározás nincs bekonfigurálva.');
    error.code = 'missing_google_api_key';
    throw error;
  }

  const response = await fetch(buildGoogleGeocodingUrl(normalizedAddress));
  if (!response.ok) {
    const error = new Error(`Google Geocoding HTTP ${response.status}`);
    error.code = 'google_geocoding_provider_error';
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const status = String(payload?.status || '').toUpperCase();
  if (status === 'ZERO_RESULTS') {
    return null;
  }

  if (status && status !== 'OK') {
    const error = new Error(payload?.error_message || `Google Geocoding status ${status}`);
    error.code = status === 'REQUEST_DENIED' ? 'missing_google_api_key' : 'google_geocoding_provider_error';
    error.googleStatus = status;
    throw error;
  }

  const result = Array.isArray(payload?.results) ? payload.results[0] : null;
  const location = result?.geometry?.location || null;
  const latitude = normalizeLatitude(location?.lat);
  const longitude = normalizeLongitude(location?.lng);

  if (latitude == null || longitude == null) {
    return null;
  }

  return {
    latitude,
    longitude,
    placeId: normalizeNullableString(result?.place_id),
    formattedAddress: normalizeNullableString(result?.formatted_address) || normalizedAddress,
    geocodedAt: new Date().toISOString(),
    source: 'google'
  };
}

async function resolveEventLocationGeo(input = {}, options = {}) {
  const providedGeo = buildProvidedGeo(input);
  if (providedGeo) {
    return providedGeo;
  }

  const address = buildLocationAddress(input);
  if (!address) {
    return null;
  }

  try {
    return await geocodeAddressWithGoogle(address);
  } catch (error) {
    if (options.throwOnFailure === true) {
      throw error;
    }

    if (error?.code !== 'missing_google_api_key') {
      console.warn('Google geocoding skipped:', error?.message || error);
    }
    return null;
  }
}

async function persistEventLocationGeo(eventId, geo) {
  if (!eventId || geo?.latitude == null || geo?.longitude == null) {
    return null;
  }

  const result = await pool.query(
    `
    update events
    set location_latitude = $2,
        location_longitude = $3,
        location_place_id = $4,
        location_formatted_address = $5,
        location_geocoded_at = coalesce($6::timestamptz, now()),
        updated_at = updated_at
    where id = $1
    returning
      location_latitude,
      location_longitude,
      location_place_id,
      location_formatted_address,
      location_geocoded_at
    `,
    [
      eventId,
      geo.latitude,
      geo.longitude,
      geo.placeId || null,
      geo.formattedAddress || null,
      geo.geocodedAt || null
    ]
  );

  return result.rows[0] || null;
}

function toEventLocationGeoColumns(geo) {
  if (geo?.latitude == null || geo?.longitude == null) {
    return {
      locationLatitude: null,
      locationLongitude: null,
      locationPlaceId: null,
      locationFormattedAddress: null,
      locationGeocodedAt: null
    };
  }

  return {
    locationLatitude: geo.latitude,
    locationLongitude: geo.longitude,
    locationPlaceId: geo.placeId || null,
    locationFormattedAddress: geo.formattedAddress || null,
    locationGeocodedAt: geo.geocodedAt || new Date().toISOString()
  };
}

module.exports = {
  buildLocationAddress,
  geocodeAddressWithGoogle,
  getEventLocationCoordinates,
  getGoogleMapsApiKey,
  normalizeLatitude,
  normalizeLongitude,
  persistEventLocationGeo,
  resolveEventLocationGeo,
  toEventLocationGeoColumns
};
