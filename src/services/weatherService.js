const ACCUWEATHER_BASE_URL = 'https://dataservice.accuweather.com';
const EVENT_TIMEZONE = 'Europe/Budapest';
const MAX_HOURLY_FORECAST_DAYS = 5;
const SEVERE_WEATHER_ICON_CODES = new Set([12, 13, 14, 15, 16, 17, 18, 24, 25, 26, 29, 41, 42]);

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
    error.code = 'ACCUWEATHER_API_KEY_MISSING';
    throw error;
  }
  return apiKey;
}

function buildWeatherLocationQuery(event = {}) {
  return String(event.location_address || event.location_name || '').trim();
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

async function fetchEventWeatherForecast(event) {
  if (!event?.start_at) {
    return null;
  }

  const query = buildWeatherLocationQuery(event);
  if (!query) {
    return null;
  }

  const forecastWindow = getForecastWindowLabel(event.start_at);
  if (!forecastWindow) {
    return null;
  }

  const location = await geocodeLocation(query);
  if (!location?.locationKey) {
    return null;
  }

  const forecast = await fetchAccuWeatherJson(`/forecasts/v1/hourly/${forecastWindow}/${location.locationKey}`, {
    searchParams: {
      language: 'hu-hu',
      metric: 'true',
      details: 'true'
    }
  });

  const nearestEntry = findNearestForecastEntry(forecast, event.start_at);
  if (!nearestEntry) {
    return null;
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
    provider: 'AccuWeather',
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

function buildWeatherAlert(weather) {
  if (!weather) {
    return null;
  }

  const alerts = [];

  if (SEVERE_WEATHER_ICON_CODES.has(Number(weather.weatherCode))) {
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
