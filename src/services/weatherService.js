const WEATHER_CODE_MAP = Object.freeze({
  0: 'Derult',
  1: 'Tobbnyire derult',
  2: 'Reszben felhos',
  3: 'Borult',
  45: 'Kod',
  48: 'Zuzmaras kod',
  51: 'Gyenge szitalas',
  53: 'Kozepes szitalas',
  55: 'Eroteljes szitalas',
  56: 'Gyenge fagyott szitalas',
  57: 'Eroteljes fagyott szitalas',
  61: 'Gyenge eso',
  63: 'Eso',
  65: 'Heves eso',
  66: 'Gyenge fagyott eso',
  67: 'Heves fagyott eso',
  71: 'Gyenge havas eses',
  73: 'Havas eses',
  75: 'Heves havas eses',
  77: 'Hodara',
  80: 'Zapor',
  81: 'Eroteljes zapor',
  82: 'Heves zapor',
  85: 'Hozapor',
  86: 'Heves hozapor',
  95: 'Zivatar',
  96: 'Zivatar jegenyel',
  99: 'Heves zivatar jegenyel'
});

const SEVERE_WEATHER_CODES = new Set([65, 67, 75, 82, 86, 95, 96, 99]);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildWeatherLocationQuery(event = {}) {
  return String(event.location_address || event.location_name || '').trim();
}

function hasPreciseWeatherAddress(event = {}) {
  return Boolean(String(event.location_address || '').trim());
}

async function geocodeLocation(query) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    return null;
  }

  const params = new URLSearchParams({
    name: normalizedQuery,
    count: '1',
    language: 'hu',
    format: 'json'
  });

  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Geocode HTTP ${response.status}`);
  }

  const payload = await response.json();
  const location = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (!location) {
    return null;
  }

  return {
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    label: [location.name, location.admin1, location.country].filter(Boolean).join(', ')
  };
}

function findNearestHourIndex(times = [], targetIso) {
  const targetMs = new Date(targetIso).getTime();
  if (!Number.isFinite(targetMs) || !times.length) {
    return -1;
  }

  let nearestIndex = -1;
  let nearestDiff = Number.POSITIVE_INFINITY;

  times.forEach((time, index) => {
    const diff = Math.abs(new Date(time).getTime() - targetMs);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

async function fetchEventWeatherForecast(event) {
  if (!event?.start_at) {
    return null;
  }

  const query = buildWeatherLocationQuery(event);
  if (!query) {
    return null;
  }

  const location = await geocodeLocation(query);
  if (!location) {
    return null;
  }

  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m',
    timezone: 'Europe/Budapest',
    forecast_days: '16'
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Forecast HTTP ${response.status}`);
  }

  const payload = await response.json();
  const times = payload?.hourly?.time || [];
  const nearestIndex = findNearestHourIndex(times, event.start_at);
  if (nearestIndex < 0) {
    return null;
  }

  const weatherCode = Number(payload.hourly.weather_code?.[nearestIndex]);
  return {
    locationLabel: location.label || query,
    forecastTime: times[nearestIndex],
    temperature: Number(payload.hourly.temperature_2m?.[nearestIndex] ?? 0),
    precipitationProbability: Number(payload.hourly.precipitation_probability?.[nearestIndex] ?? 0),
    windSpeed: Number(payload.hourly.wind_speed_10m?.[nearestIndex] ?? 0),
    weatherCode,
    weatherLabel: WEATHER_CODE_MAP[weatherCode] || 'Ismeretlen ido',
    usedPreciseAddress: hasPreciseWeatherAddress(event)
  };
}

function buildWeatherAlert(weather) {
  if (!weather) {
    return null;
  }

  const alerts = [];

  if (SEVERE_WEATHER_CODES.has(Number(weather.weatherCode))) {
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
  const whenLabel = new Date(event.start_at).toLocaleString('hu-HU');
  const locationLabel = weatherAlert?.weather?.locationLabel || buildWeatherLocationQuery(event) || '-';
  const subject = `Idojarasi figyelmeztetes: ${event.title}`;
  const text = [
    `Szia!`,
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
  buildWeatherLocationQuery,
  hasPreciseWeatherAddress,
  geocodeLocation,
  fetchEventWeatherForecast,
  buildWeatherAlert,
  buildWeatherAlertEmail
};
