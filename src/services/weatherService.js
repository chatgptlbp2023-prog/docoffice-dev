const ACCUWEATHER_BASE_URL = 'https://dataservice.accuweather.com';
const OPEN_METEO_FORECAST_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_GEOCODING_BASE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const EVENT_TIMEZONE = 'Europe/Budapest';
const MAX_HOURLY_FORECAST_DAYS = 5;
const SEVERE_WEATHER_ICON_CODES = new Set([12, 13, 14, 15, 16, 17, 18, 24, 25, 26, 29, 41, 42]);
const OPEN_METEO_SEVERE_WEATHER_CODES = new Set([95, 96, 99]);
const {
  getEventLocationCoordinates,
  persistEventLocationGeo,
  resolveEventLocationGeo
} = require('./googleGeocodingService');

const WEATHER_UNAVAILABLE_MESSAGES = Object.freeze({
  missing_location: 'Az eseményhez nincs megadva használható helyszín.',
  outside_forecast_window: 'Az órás előrejelzés az esemény előtt kb. 5 nappal lesz elérhető.',
  past_event: 'Múltbeli eseményhez már nem kérünk időjárás-előrejelzést.',
  missing_api_key: 'Az időjárás szolgáltatás nincs bekonfigurálva.',
  missing_geocoding_api_key: 'A cím alapú helymeghatározás nincs bekonfigurálva.',
  geocode_failed: 'Ehhez a címhez nem sikerült koordinátát találni. Válassz címet a Google találatok közül.',
  forecast_not_found: 'Ehhez az időponthoz nem találtunk órás előrejelzést.',
  provider_error: 'Az időjárás szolgáltató most nem elérhető. Próbáld meg később.'
});

function buildWeatherUnavailable(reason, details = {}) {
  return {
    available: false,
    reason,
    message: WEATHER_UNAVAILABLE_MESSAGES[reason] || WEATHER_UNAVAILABLE_MESSAGES.provider_error,
    ...details
  };
}

const ACCUWEATHER_ICON_MAP = Object.freeze({
  1: { label: 'Derult', icon: '☀️' },
  2: { label: 'Tobbnyire napos', icon: '🌤️' },
  3: { label: 'Reszben napos', icon: '⛅' },
  4: { label: 'Intervallumos felhozet', icon: '🌥️' },
  5: { label: 'Kodos napsutes', icon: '🌥️' },
  6: { label: 'Tobbnyire borult', icon: '☁️' },
  7: { label: 'Borult', icon: '☁️' },
  8: { label: 'Szurke, borult', icon: '☁️' },
  11: { label: 'Kod', icon: '🌫️' },
  12: { label: 'Zapor', icon: '🌦️' },
  13: { label: 'Tobbnyire felhos, zapor', icon: '🌦️' },
  14: { label: 'Reszben napos, zapor', icon: '🌦️' },
  15: { label: 'Zivatar', icon: '⛈️' },
  16: { label: 'Tobbnyire felhos, zivatar', icon: '⛈️' },
  17: { label: 'Reszben napos, zivatar', icon: '⛈️' },
  18: { label: 'Eso', icon: '🌧️' },
  19: { label: 'Havas zapor', icon: '🌨️' },
  20: { label: 'Tobbnyire felhos, havas zapor', icon: '🌨️' },
  21: { label: 'Reszben napos, havas zapor', icon: '🌨️' },
  22: { label: 'Ho', icon: '❄️' },
  23: { label: 'Tobbnyire felhos, ho', icon: '❄️' },
  24: { label: 'Jeges eso', icon: '🧊' },
  25: { label: 'Szeles, jeges eso', icon: '🧊' },
  26: { label: 'Fagyott eso', icon: '🧊' },
  29: { label: 'Eso es ho', icon: '🌨️' },
  30: { label: 'Forro', icon: '🌡️' },
  31: { label: 'Hideg', icon: '🥶' },
  32: { label: 'Szel', icon: '💨' },
  33: { label: 'Derult ejjel', icon: '🌙' },
  34: { label: 'Tobbnyire derult ejjel', icon: '🌙' },
  35: { label: 'Reszben felhos ejjel', icon: '☁️' },
  36: { label: 'Intervallumos felhozet ejjel', icon: '☁️' },
  37: { label: 'Kodos ejjel', icon: '🌫️' },
  38: { label: 'Tobbnyire borult ejjel', icon: '☁️' },
  39: { label: 'Tobbnyire felhos, ejjeli zapor', icon: '🌧️' },
  40: { label: 'Reszben felhos, ejjeli zapor', icon: '🌧️' },
  41: { label: 'Tobbnyire felhos, ejjeli zivatar', icon: '⛈️' },
  42: { label: 'Reszben felhos, ejjeli zivatar', icon: '⛈️' },
  43: { label: 'Tobbnyire felhos, ejjeli havas zapor', icon: '🌨️' },
  44: { label: 'Reszben felhos, ejjeli havas zapor', icon: '🌨️' }
});

const OPEN_METEO_WEATHER_CODE_MAP = Object.freeze({
  0: { label: 'Derult', icon: '\u2600\ufe0f' },
  1: { label: 'Tobbnyire derult', icon: '\ud83c\udf24\ufe0f' },
  2: { label: 'Reszben felhos', icon: '\u26c5' },
  3: { label: 'Borult', icon: '\u2601\ufe0f' },
  45: { label: 'Kod', icon: '\ud83c\udf2b\ufe0f' },
  48: { label: 'Zuzmaras kod', icon: '\ud83c\udf2b\ufe0f' },
  51: { label: 'Gyenge szitalas', icon: '\ud83c\udf26\ufe0f' },
  53: { label: 'Szitalas', icon: '\ud83c\udf26\ufe0f' },
  55: { label: 'Eros szitalas', icon: '\ud83c\udf26\ufe0f' },
  56: { label: 'Onos szitalas', icon: '\ud83e\uddca' },
  57: { label: 'Eros onos szitalas', icon: '\ud83e\uddca' },
  61: { label: 'Gyenge eso', icon: '\ud83c\udf27\ufe0f' },
  63: { label: 'Eso', icon: '\ud83c\udf27\ufe0f' },
  65: { label: 'Eros eso', icon: '\ud83c\udf27\ufe0f' },
  66: { label: 'Onos eso', icon: '\ud83e\uddca' },
  67: { label: 'Eros onos eso', icon: '\ud83e\uddca' },
  71: { label: 'Gyenge havazas', icon: '\u2744\ufe0f' },
  73: { label: 'Havazas', icon: '\u2744\ufe0f' },
  75: { label: 'Eros havazas', icon: '\u2744\ufe0f' },
  77: { label: 'Hodara', icon: '\u2744\ufe0f' },
  80: { label: 'Gyenge zapor', icon: '\ud83c\udf26\ufe0f' },
  81: { label: 'Zapor', icon: '\ud83c\udf26\ufe0f' },
  82: { label: 'Eros zapor', icon: '\ud83c\udf26\ufe0f' },
  85: { label: 'Hozapor', icon: '\ud83c\udf28\ufe0f' },
  86: { label: 'Eros hozapor', icon: '\ud83c\udf28\ufe0f' },
  95: { label: 'Zivatar', icon: '\u26c8\ufe0f' },
  96: { label: 'Zivatar jegesovel', icon: '\u26c8\ufe0f' },
  99: { label: 'Eros zivatar jegesovel', icon: '\u26c8\ufe0f' }
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getAccuWeatherApiKey() {
  const apiKey = String(process.env.ACCUWEATHER_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('Az AccuWeather API kulcs nincs beallitva.');
    error.code = 'missing_api_key';
    throw error;
  }
  return apiKey;
}

function normalizeWeatherProvider(value) {
  const normalized = String(value || '').trim().toLowerCase().replaceAll('-', '_');
  if (['open_meteo', 'openmeteo'].includes(normalized)) return 'open_meteo';
  if (['accuweather', 'accu_weather', 'accu'].includes(normalized)) return 'accuweather';
  return '';
}

function getConfiguredWeatherProvider() {
  const explicitProvider = normalizeWeatherProvider(process.env.WEATHER_PROVIDER);
  if (explicitProvider) {
    return explicitProvider;
  }

  return String(process.env.ACCUWEATHER_API_KEY || '').trim()
    ? 'accuweather'
    : 'open_meteo';
}

function buildWeatherLocationQuery(event = {}) {
  return String(event.location_formatted_address || event.location_address || event.location_name || '').trim();
}

function hasPreciseWeatherAddress(event = {}) {
  return Boolean(String(event.location_address || '').trim());
}

function uniqueStrings(values = []) {
  const seen = new Set();
  return values.filter(item => {
    const normalized = String(item || '').trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function buildLocationQueryCandidates(query) {
  const normalized = String(query || '').trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return [];
  }

  const withCountry = normalized.toLowerCase().includes('hungary')
    ? normalized
    : `${normalized}, Hungary`;

  const candidates = [normalized, withCountry];
  if (!normalized.includes(',') && !/\b\d{4}\b/.test(normalized)) {
    candidates.push(`Budapest, ${normalized}, Hungary`);
  }
  const match = normalized.match(/^([^,]+),\s*(\d{4})\s+(.+)$/u);
  if (match) {
    const [, city, postalCode, street] = match;
    candidates.push(`${postalCode} ${city}, ${street}, Hungary`);
    candidates.push(`${postalCode} ${city}, Hungary`);
    candidates.push(`${city}, Hungary`);
  }

  return uniqueStrings(candidates);
}

async function fetchAccuWeatherJson(path, { searchParams = {} } = {}) {
  const params = new URLSearchParams();
  params.set('apikey', getAccuWeatherApiKey());

  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (value == null || value === '') return;
    params.set(key, String(value));
  });

  const response = await fetch(`${ACCUWEATHER_BASE_URL}${path}?${params.toString()}`);
  if (!response.ok) {
    const error = new Error(`AccuWeather HTTP ${response.status}`);
    error.code = 'ACCUWEATHER_HTTP_ERROR';
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function fetchOpenMeteoJson(url, { searchParams = {} } = {}) {
  const params = new URLSearchParams();
  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (value == null || value === '') return;
    params.set(key, String(value));
  });

  const response = await fetch(`${url}?${params.toString()}`);
  if (!response.ok) {
    const error = new Error(`Open-Meteo HTTP ${response.status}`);
    error.code = 'OPEN_METEO_HTTP_ERROR';
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function pickBestLocation(results = []) {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) {
    return null;
  }

  const hungaryResult = list.find(item => String(item?.Country?.ID || '').toUpperCase() === 'HU');
  return hungaryResult || list[0] || null;
}

async function geocodeLocation(query) {
  const candidates = buildLocationQueryCandidates(query);

  for (const candidate of candidates) {
    const payload = await fetchAccuWeatherJson('/locations/v1/search', {
      searchParams: {
        q: candidate,
        language: 'hu-hu',
        details: 'true'
      }
    });

    const location = pickBestLocation(payload);
    if (!location) {
      continue;
    }

    return {
      locationKey: String(location.Key || '').trim(),
      latitude: Number(location?.GeoPosition?.Latitude ?? 0),
      longitude: Number(location?.GeoPosition?.Longitude ?? 0),
      label: [
        location.LocalizedName,
        location?.AdministrativeArea?.LocalizedName,
        location?.Country?.LocalizedName
      ].filter(Boolean).join(', ')
    };
  }

  return null;
}

async function geocodeLocationOpenMeteo(query) {
  const candidates = buildLocationQueryCandidates(query);

  for (const candidate of candidates) {
    const payload = await fetchOpenMeteoJson(OPEN_METEO_GEOCODING_BASE_URL, {
      searchParams: {
        name: candidate,
        count: 5,
        language: 'hu',
        format: 'json'
      }
    });

    const results = Array.isArray(payload?.results) ? payload.results : [];
    const location = results.find(item => String(item?.country_code || '').toUpperCase() === 'HU')
      || results[0]
      || null;

    if (!location) {
      continue;
    }

    return {
      latitude: Number(location.latitude ?? 0),
      longitude: Number(location.longitude ?? 0),
      label: [
        location.name,
        location.admin1,
        location.country
      ].filter(Boolean).join(', ')
    };
  }

  return null;
}

function getForecastWindowLabel(eventStartAt, now = new Date()) {
  const eventMs = new Date(eventStartAt).getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(eventMs) || !Number.isFinite(nowMs)) {
    return null;
  }

  const diffHours = (eventMs - nowMs) / (1000 * 60 * 60);
  if (diffHours < 0) {
    return null;
  }

  if (diffHours <= 12) {
    return '12hour';
  }

  if (diffHours <= MAX_HOURLY_FORECAST_DAYS * 24) {
    return '120hour';
  }

  return null;
}

function mapAccuWeatherIcon(iconCode, fallbackText = '') {
  return ACCUWEATHER_ICON_MAP[Number(iconCode)] || {
    label: String(fallbackText || 'Ismeretlen idojaras').trim() || 'Ismeretlen idojaras',
    icon: '🌤️'
  };
}

function mapOpenMeteoWeatherCode(code) {
  return OPEN_METEO_WEATHER_CODE_MAP[Number(code)] || {
    label: 'Ismeretlen idojaras',
    icon: '\ud83c\udf24\ufe0f'
  };
}

function findNearestForecastEntry(entries = [], targetIso) {
  const targetMs = new Date(targetIso).getTime();
  if (!Number.isFinite(targetMs) || !Array.isArray(entries) || !entries.length) {
    return null;
  }

  let nearestEntry = null;
  let nearestDiff = Number.POSITIVE_INFINITY;

  entries.forEach(entry => {
    const candidateMs = new Date(entry?.DateTime).getTime();
    if (!Number.isFinite(candidateMs)) {
      return;
    }
    const diff = Math.abs(candidateMs - targetMs);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearestEntry = entry;
    }
  });

  return nearestEntry;
}

function parseOpenMeteoTimeMs(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return Number.NaN;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    return new Date(normalized).getTime();
  }
  return new Date(`${normalized}Z`).getTime();
}

function findNearestOpenMeteoForecastEntry(hourly = {}, targetIso) {
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const targetMs = new Date(targetIso).getTime();
  if (!Number.isFinite(targetMs) || !times.length) {
    return null;
  }

  let nearestIndex = -1;
  let nearestDiff = Number.POSITIVE_INFINITY;

  times.forEach((time, index) => {
    const candidateMs = parseOpenMeteoTimeMs(time);
    if (!Number.isFinite(candidateMs)) {
      return;
    }
    const diff = Math.abs(candidateMs - targetMs);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearestIndex = index;
    }
  });

  if (nearestIndex < 0) {
    return null;
  }

  return {
    time: times[nearestIndex],
    temperature: hourly.temperature_2m?.[nearestIndex],
    precipitationProbability: hourly.precipitation_probability?.[nearestIndex],
    weatherCode: hourly.weather_code?.[nearestIndex],
    windSpeed: hourly.wind_speed_10m?.[nearestIndex]
  };
}

async function fetchOpenMeteoForecastForEvent(event, location) {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    return buildWeatherUnavailable('geocode_failed');
  }

  let forecast;
  try {
    forecast = await fetchOpenMeteoJson(OPEN_METEO_FORECAST_BASE_URL, {
      searchParams: {
        latitude: location.latitude,
        longitude: location.longitude,
        hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m',
        timezone: 'UTC',
        forecast_days: MAX_HOURLY_FORECAST_DAYS
      }
    });
  } catch {
    return buildWeatherUnavailable('provider_error');
  }

  const nearestEntry = findNearestOpenMeteoForecastEntry(forecast?.hourly, event.start_at);
  if (!nearestEntry) {
    return buildWeatherUnavailable('forecast_not_found');
  }

  const iconMeta = mapOpenMeteoWeatherCode(nearestEntry.weatherCode);

  return {
    available: true,
    provider: 'Open-Meteo',
    providerKey: 'open_meteo',
    locationLabel: location.label || location.formattedAddress || buildWeatherLocationQuery(event),
    forecastTime: nearestEntry.time,
    temperature: Number(nearestEntry.temperature ?? 0),
    precipitationProbability: Number(nearestEntry.precipitationProbability ?? 0),
    windSpeed: Number(nearestEntry.windSpeed ?? 0),
    weatherCode: Number(nearestEntry.weatherCode ?? 0),
    weatherLabel: iconMeta.label,
    weatherIcon: iconMeta.icon,
    usedPreciseAddress: hasPreciseWeatherAddress(event)
  };
}

async function resolveOpenMeteoLocation(event) {
  const storedCoordinates = getEventLocationCoordinates(event);
  if (storedCoordinates) {
    return {
      ...storedCoordinates,
      label: storedCoordinates.formattedAddress || buildWeatherLocationQuery(event)
    };
  }

  try {
    const geo = await resolveEventLocationGeo(event, { throwOnFailure: true });
    if (!geo) {
      return buildWeatherUnavailable('geocode_failed');
    }

    if (event?.id) {
      try {
        await persistEventLocationGeo(event.id, geo);
      } catch (error) {
        console.warn('Event location geocode persist failed:', error?.message || error);
      }
    }

    return {
      ...geo,
      label: geo.formattedAddress || buildWeatherLocationQuery(event)
    };
  } catch (error) {
    if (error?.code === 'missing_google_api_key') {
      return buildWeatherUnavailable('missing_geocoding_api_key');
    }

    return buildWeatherUnavailable('provider_error');
  }
}

async function fetchAccuWeatherForecastForEvent(event, query, forecastWindow) {
  let location;
  try {
    location = await geocodeLocation(query);
  } catch (error) {
    if (error?.code === 'missing_api_key') {
      return buildWeatherUnavailable('missing_api_key');
    }

    return buildWeatherUnavailable('provider_error');
  }

  if (!location?.locationKey) {
    return buildWeatherUnavailable('geocode_failed');
  }

  let forecast;
  try {
    forecast = await fetchAccuWeatherJson(`/forecasts/v1/hourly/${forecastWindow}/${location.locationKey}`, {
      searchParams: {
        language: 'hu-hu',
        metric: 'true',
        details: 'true'
      }
    });
  } catch (error) {
    if (error?.code === 'missing_api_key') {
      return buildWeatherUnavailable('missing_api_key');
    }

    return buildWeatherUnavailable('provider_error');
  }

  const nearestEntry = findNearestForecastEntry(forecast, event.start_at);
  if (!nearestEntry) {
    return buildWeatherUnavailable('forecast_not_found');
  }

  const iconMeta = mapAccuWeatherIcon(
    nearestEntry.WeatherIcon,
    nearestEntry.IconPhrase || nearestEntry.WeatherText
  );
  const precipitationProbability = Number(
    nearestEntry.PrecipitationProbability
      ?? nearestEntry.RainProbability
      ?? nearestEntry.SnowProbability
      ?? 0
  );
  const windSpeed = Number(nearestEntry?.Wind?.Speed?.Value ?? 0);
  const temperature = Number(nearestEntry?.Temperature?.Value ?? 0);

  return {
    available: true,
    provider: 'AccuWeather',
    providerKey: 'accuweather',
    locationLabel: location.label || query,
    forecastTime: nearestEntry.DateTime,
    temperature,
    precipitationProbability,
    windSpeed,
    weatherCode: Number(nearestEntry.WeatherIcon ?? 0),
    weatherLabel: iconMeta.label,
    weatherIcon: iconMeta.icon,
    usedPreciseAddress: hasPreciseWeatherAddress(event)
  };
}

async function fetchEventWeatherForecast(event) {
  if (!event?.start_at) {
    return buildWeatherUnavailable('forecast_not_found');
  }

  const query = buildWeatherLocationQuery(event);
  if (!query && !getEventLocationCoordinates(event)) {
    return buildWeatherUnavailable('missing_location');
  }

  const forecastWindow = getForecastWindowLabel(event.start_at);
  if (!forecastWindow) {
    const eventMs = new Date(event.start_at).getTime();
    const nowMs = Date.now();
    return Number.isFinite(eventMs) && eventMs < nowMs
      ? buildWeatherUnavailable('past_event')
      : buildWeatherUnavailable('outside_forecast_window');
  }

  const provider = getConfiguredWeatherProvider();
  if (provider === 'open_meteo') {
    const location = await resolveOpenMeteoLocation(event);
    if (location?.available === false) {
      return location;
    }
    return fetchOpenMeteoForecastForEvent(event, location);
  }

  return fetchAccuWeatherForecastForEvent(event, query, forecastWindow);
}

function buildWeatherAlert(weather) {
  if (!weather) {
    return null;
  }

  const alerts = [];

  const severeWeatherCodes = weather.providerKey === 'open_meteo'
    ? OPEN_METEO_SEVERE_WEATHER_CODES
    : SEVERE_WEATHER_ICON_CODES;

  if (severeWeatherCodes.has(Number(weather.weatherCode))) {
    alerts.push(`A rendszer eros idojarasi kockazatot lat: ${weather.weatherLabel}.`);
  }

  if (Number(weather.precipitationProbability) >= 60) {
    alerts.push(`A csapadek eselye ${Math.round(Number(weather.precipitationProbability))}%.`);
  }

  if (Number(weather.windSpeed) >= 35) {
    alerts.push(`A varhato szel ${Math.round(Number(weather.windSpeed))} km/h.`);
  }

  if (!alerts.length) {
    return null;
  }

  return {
    headline: 'Idojarasi figyelmeztetes az esemenyhez',
    summary: alerts.join(' '),
    weather
  };
}

function buildWeatherAlertEmail({ event, teamName, weatherAlert }) {
  const whenLabel = new Date(event.start_at).toLocaleString('hu-HU', {
    timeZone: EVENT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  const locationLabel = weatherAlert?.weather?.locationLabel || buildWeatherLocationQuery(event) || '-';
  const subject = `Idojarasi figyelmeztetes: ${event.title}`;
  const text = [
    'Szia!',
    '',
    `A(z) ${teamName} csapat ${event.title} esemenyehez idojarasi figyelmeztetes tartozik.`,
    `Idopont: ${whenLabel}`,
    `Helyszin: ${locationLabel}`,
    '',
    weatherAlert.summary,
    '',
    `Reszletek: ${weatherAlert.weather.weatherLabel}, ${Math.round(Number(weatherAlert.weather.temperature || 0))} C, csapadek ${Math.round(Number(weatherAlert.weather.precipitationProbability || 0))}%, szel ${Math.round(Number(weatherAlert.weather.windSpeed || 0))} km/h.`
  ].join('\n');

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1f2937;">
      <h2 style="margin-bottom:12px;">Idojarasi figyelmeztetes</h2>
      <p>A(z) <strong>${escapeHtml(teamName)}</strong> csapat <strong>${escapeHtml(event.title || 'esemeny')}</strong> alkalmahoz figyelmeztetes tartozik.</p>
      <p><strong>Idopont:</strong> ${escapeHtml(whenLabel)}<br /><strong>Helyszin:</strong> ${escapeHtml(locationLabel)}</p>
      <p>${escapeHtml(weatherAlert.summary)}</p>
      <p><strong>Elorejelzes:</strong> ${escapeHtml(weatherAlert.weather.weatherLabel)}, ${escapeHtml(String(Math.round(Number(weatherAlert.weather.temperature || 0))))} C, csapadek ${escapeHtml(String(Math.round(Number(weatherAlert.weather.precipitationProbability || 0))))}%, szel ${escapeHtml(String(Math.round(Number(weatherAlert.weather.windSpeed || 0))))} km/h.</p>
    </div>
  `;

  return { subject, text, html };
}

module.exports = {
  ACCUWEATHER_ICON_MAP,
  buildLocationQueryCandidates,
  buildWeatherLocationQuery,
  hasPreciseWeatherAddress,
  geocodeLocation,
  fetchEventWeatherForecast,
  buildWeatherAlert,
  buildWeatherAlertEmail
};
