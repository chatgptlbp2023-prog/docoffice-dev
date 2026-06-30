const {
  buildLocationQueryCandidates,
  fetchEventWeatherForecast
} = require('../src/services/weatherService');

describe('weatherService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.ACCUWEATHER_API_KEY = 'test-key';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.ACCUWEATHER_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.WEATHER_PROVIDER;
    jest.restoreAllMocks();
  });

  test('magyar cimhez fallback kereseseket general', () => {
    expect(buildLocationQueryCandidates('Budapest, 1046 Óceánárok 23')).toEqual([
      'Budapest, 1046 Óceánárok 23',
      'Budapest, 1046 Óceánárok 23, Hungary',
      '1046 Budapest, Óceánárok 23, Hungary',
      '1046 Budapest, Hungary',
      'Budapest, Hungary'
    ]);

    expect(buildLocationQueryCandidates('Ferihegyi út 140')).toContain(
      'Budapest, Ferihegyi út 140, Hungary'
    );
  });

  test('AccuWeather forecastbol a legkozelebbi oras adatot valasztja', async () => {
    const event = {
      id: 'evt-1',
      start_at: '2026-05-13T18:00:00.000Z',
      location_address: 'Budapest, 1046 Óceánárok 23'
    };

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-13T10:00:00.000Z'));

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([])
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          {
            Key: '12345',
            LocalizedName: 'Budapest',
            AdministrativeArea: { LocalizedName: 'Budapest' },
            Country: { ID: 'HU', LocalizedName: 'Hungary' },
            GeoPosition: { Latitude: 47.55, Longitude: 19.11 }
          }
        ])
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          {
            DateTime: '2026-05-13T19:00:00+02:00',
            WeatherIcon: 12,
            IconPhrase: 'Zápor',
            PrecipitationProbability: 72,
            Temperature: { Value: 19.4 },
            Wind: { Speed: { Value: 21.3 } }
          },
          {
            DateTime: '2026-05-13T20:00:00+02:00',
            WeatherIcon: 15,
            IconPhrase: 'Zivatar',
            PrecipitationProbability: 88,
            Temperature: { Value: 18.1 },
            Wind: { Speed: { Value: 33.1 } }
          }
        ])
      });

    const weather = await fetchEventWeatherForecast(event);

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch.mock.calls[0][0]).toContain('/locations/v1/search');
    expect(global.fetch.mock.calls[1][0]).toContain('Budapest%2C+1046');
    expect(global.fetch.mock.calls[2][0]).toContain('/forecasts/v1/hourly/12hour/12345');
    expect(weather).toMatchObject({
      provider: 'AccuWeather',
      locationLabel: 'Budapest, Budapest, Hungary',
      weatherCode: 15,
      weatherLabel: 'Zivatar',
      weatherIcon: '⛈️'
    });

    jest.useRealTimers();
  });

  test('Open-Meteo provider mentett koordinataval API kulcs nelkul ad oras elorejelzest', async () => {
    delete process.env.ACCUWEATHER_API_KEY;
    process.env.WEATHER_PROVIDER = 'open_meteo';
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-13T10:00:00.000Z'));

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hourly: {
          time: ['2026-05-13T17:00', '2026-05-13T18:00', '2026-05-13T19:00'],
          temperature_2m: [20.1, 19.2, 18.7],
          precipitation_probability: [20, 75, 80],
          weather_code: [2, 95, 96],
          wind_speed_10m: [11.4, 28.6, 36.1]
        }
      })
    });

    const weather = await fetchEventWeatherForecast({
      id: 'evt-open-meteo',
      start_at: '2026-05-13T18:00:00.000Z',
      location_address: 'Budapest, 1046 Oceanarok 23',
      location_latitude: 47.4979,
      location_longitude: 19.0402
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain('api.open-meteo.com');
    expect(weather).toMatchObject({
      provider: 'Open-Meteo',
      providerKey: 'open_meteo',
      locationLabel: 'Budapest, 1046 Oceanarok 23',
      weatherCode: 95,
      weatherLabel: 'Zivatar',
      weatherIcon: '\u26c8\ufe0f',
      precipitationProbability: 75
    });

    jest.useRealTimers();
  });

  test('Open-Meteo provider Google geokodolt koordinatabol ker elorejelzest', async () => {
    delete process.env.ACCUWEATHER_API_KEY;
    process.env.WEATHER_PROVIDER = 'open_meteo';
    process.env.GOOGLE_MAPS_API_KEY = 'maps-key';
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-13T10:00:00.000Z'));

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [{
            place_id: 'place-1',
            formatted_address: 'Budapest, Oceánárok 23, 1046 Hungary',
            geometry: {
              location: {
                lat: 47.583,
                lng: 19.09
              }
            }
          }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-05-13T18:00'],
            temperature_2m: [21.5],
            precipitation_probability: [10],
            weather_code: [1],
            wind_speed_10m: [8.2]
          }
        })
      });

    const weather = await fetchEventWeatherForecast({
      start_at: '2026-05-13T18:00:00.000Z',
      location_address: '1046 Budapest, Oceanarok 23'
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toContain('maps.googleapis.com/maps/api/geocode/json');
    expect(global.fetch.mock.calls[1][0]).toContain('api.open-meteo.com');
    expect(global.fetch.mock.calls[1][0]).toContain('latitude=47.583');
    expect(global.fetch.mock.calls[1][0]).toContain('longitude=19.09');
    expect(weather).toMatchObject({
      provider: 'Open-Meteo',
      providerKey: 'open_meteo',
      locationLabel: 'Budapest, Oceánárok 23, 1046 Hungary',
      temperature: 21.5
    });

    jest.useRealTimers();
  });

  test('Open-Meteo provider hianyzo Google kulcsnal cimfeloldasi hibat ad', async () => {
    delete process.env.ACCUWEATHER_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    process.env.WEATHER_PROVIDER = 'open_meteo';
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-13T10:00:00.000Z'));

    const result = await fetchEventWeatherForecast({
      id: 'evt-open-meteo-no-google',
      start_at: '2026-05-13T18:00:00.000Z',
      location_address: '1046 Budapest, Oceanarok 23'
    });

    expect(result).toMatchObject({
      available: false,
      reason: 'missing_geocoding_api_key',
      message: 'A cím alapú helymeghatározás nincs bekonfigurálva.'
    });
    expect(global.fetch).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  test('strukturalt okot ad, ha hianyzik az API kulcs', async () => {
    delete process.env.ACCUWEATHER_API_KEY;
    process.env.WEATHER_PROVIDER = 'accuweather';
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-13T10:00:00.000Z'));

    const result = await fetchEventWeatherForecast({
      id: 'evt-no-key',
      start_at: '2026-05-13T18:00:00.000Z',
      location_address: 'Budapest, 1046 Oceanarok 23'
    });

    expect(result).toMatchObject({
      available: false,
      reason: 'missing_api_key',
      message: 'Az időjárás szolgáltatás nincs bekonfigurálva.'
    });
    expect(global.fetch).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  test('strukturalt okot ad tul tavoli es multbeli esemenyre', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-13T10:00:00.000Z'));

    const futureResult = await fetchEventWeatherForecast({
      id: 'evt-future',
      start_at: '2026-05-25T18:00:00.000Z',
      location_address: 'Budapest, 1046 Oceanarok 23'
    });

    expect(futureResult).toMatchObject({
      available: false,
      reason: 'outside_forecast_window',
      message: 'Az órás előrejelzés az esemény előtt kb. 5 nappal lesz elérhető.'
    });

    const pastResult = await fetchEventWeatherForecast({
      id: 'evt-past',
      start_at: '2026-05-12T18:00:00.000Z',
      location_address: 'Budapest, 1046 Oceanarok 23'
    });

    expect(pastResult).toMatchObject({
      available: false,
      reason: 'past_event',
      message: 'Múltbeli eseményhez már nem kérünk időjárás-előrejelzést.'
    });
    expect(global.fetch).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  test('strukturalt okot ad geokod es forecast hianyra', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-13T10:00:00.000Z'));

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => []
    });

    const geocodeResult = await fetchEventWeatherForecast({
      id: 'evt-geocode',
      start_at: '2026-05-13T18:00:00.000Z',
      location_address: 'Nemletezo palya'
    });

    expect(geocodeResult).toMatchObject({
      available: false,
      reason: 'geocode_failed',
      message: 'Ehhez a címhez nem sikerült koordinátát találni. Válassz címet a Google találatok közül.'
    });

    global.fetch.mockReset();
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{
          Key: '12345',
          LocalizedName: 'Budapest',
          Country: { ID: 'HU', LocalizedName: 'Hungary' },
          GeoPosition: { Latitude: 47.55, Longitude: 19.11 }
        }])
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

    const forecastResult = await fetchEventWeatherForecast({
      id: 'evt-forecast',
      start_at: '2026-05-13T18:00:00.000Z',
      location_address: 'Budapest, 1046 Oceanarok 23'
    });

    expect(forecastResult).toMatchObject({
      available: false,
      reason: 'forecast_not_found',
      message: 'Ehhez az időponthoz nem találtunk órás előrejelzést.'
    });

    jest.useRealTimers();
  });
});
