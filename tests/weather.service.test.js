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
});
