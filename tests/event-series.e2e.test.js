
jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn()
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');
const { sendEmail } = require('../src/services/emailService');
const holidayData = require('../src/data/hu-holidays.json');

function buildFutureIsoDate({
  daysAhead = 7,
  hour = 18,
  minute = 0
} = {}) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

function getNextHolidayStartAt() {
  const now = new Date();
  const futureHolidayDate = Object.keys(holidayData.dates)
    .sort()
    .find(date => new Date(`${date}T17:00:00.000Z`).getTime() > now.getTime());

  if (!futureHolidayDate) {
    throw new Error('Nincs jövőbeli ünnepnap a hu-holidays fixture-ben.');
  }

  return {
    occursOn: futureHolidayDate,
    startAt: `${futureHolidayDate}T17:00:00.000Z`
  };
}

describe('Event series E2E', () => {
  const password = 'teszt123';

  let captainUserId;
  let memberUserId;
  let teamId;

  let captainEmail;
  let memberEmail;

  let captainToken;
  let memberToken;
  let nextHoliday;

  const created = {
    series: [],
    events: [],
    teams: [],
    users: []
  };

  async function createUser({ name, email }) {
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    created.users.push(id);

    await pool.query(
      `
      insert into users (
        id, name, email, status, password_hash, created_at, updated_at
      )
      values ($1, $2, $3, 'active', $4, now(), now())
      `,
      [id, name, email, passwordHash]
    );

    return id;
  }

  async function login(email) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(res.status).toBe(200);
    return res.body.token;
  }

  async function createTeamMembership(userId, role) {
    await pool.query(
      `
      insert into team_members (
        id, team_id, user_id, role, membership_status, joined_at, created_at, updated_at
      )
      values ($1, $2, $3, $4, 'active', now(), now(), now())
      `,
      [randomUUID(), teamId, userId, role]
    );
  }

  beforeEach(async () => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ status: 'sent', messageId: 'series-email-msg' });
    process.env.APP_BASE_URL = 'https://app.example.com';

    nextHoliday = getNextHolidayStartAt();

    captainEmail = `captain_series_${randomUUID()}@example.com`;
    memberEmail = `member_series_${randomUUID()}@example.com`;

    captainUserId = await createUser({
      name: 'Captain Series User',
      email: captainEmail
    });

    memberUserId = await createUser({
      name: 'Member Series User',
      email: memberEmail
    });

    teamId = randomUUID();
    created.teams.push(teamId);

    await pool.query(
      `
      insert into teams (
        id, name, created_by_user_id, status, created_at, updated_at
      )
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Sorozat FC', captainUserId]
    );

    await createTeamMembership(captainUserId, 'team_admin');
    await createTeamMembership(memberUserId, 'member');

    captainToken = await login(captainEmail);
    memberToken = await login(memberEmail);
  });

  afterEach(async () => {
    if (created.events.length > 0) {
      await pool.query(
        `delete from event_registrations where event_id = any($1::uuid[])`,
        [created.events]
      );

      await pool.query(
        `delete from event_settings where event_id = any($1::uuid[])`,
        [created.events]
      );

      await pool.query(
        `delete from events where id = any($1::uuid[])`,
        [created.events]
      );
    }

    if (created.series.length > 0) {
      await pool.query(
        `delete from event_series where id = any($1::uuid[])`,
        [created.series]
      );
    }

    if (created.teams.length > 0) {
      await pool.query(
        `delete from team_members where team_id = any($1::uuid[])`,
        [created.teams]
      );

      await pool.query(
        `delete from teams where id = any($1::uuid[])`,
        [created.teams]
      );
    }

    if (created.users.length > 0) {
      await pool.query(
        `delete from users where id = any($1::uuid[])`,
        [created.users]
      );
    }

    created.series.length = 0;
    created.events.length = 0;
    created.teams.length = 0;
    created.users.length = 0;
  });

  test('captain can create weekly event series and generated events are listable', async () => {
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/event-series`)
      .set('Authorization', `Bearer ${captainToken}`)
      .send({
        title: 'Keddi esti foci',
        description: 'Heti sorozat',
        startAt: buildFutureIsoDate({ daysAhead: 8, hour: 18, minute: 0 }),
        locationName: 'Sorozat pálya',
        locationAddress: 'Budapest, Teszt utca 1.',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: true,
        substitutesCount: 2,
        initialStatus: 'published',
        recurrenceType: 'weekly',
        seriesEndType: 'occurrence_count',
        seriesOccurrenceCount: 4,
        confirmHolidayOverride: true
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.ok).toBe(true);
    expect(createRes.body.generatedCount).toBe(4);
    expect(createRes.body.series.recurrence_type).toBe('weekly');
    expect(createRes.body.eventNotification.scheduledCount).toBe(3);

    const seriesId = createRes.body.series.id;
    created.series.push(seriesId);

    createRes.body.generatedEvents.forEach(item => {
      created.events.push(item.event.id);
    });

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const recipients = sendEmail.mock.calls.map(call => call[0].to).sort();
    expect(recipients).toEqual([captainEmail, memberEmail].sort());
    const payload = sendEmail.mock.calls[0][0];
    expect(payload.subject).toContain('Keddi esti foci');
    expect(payload.html).toContain('Jelentkezem');
    expect(payload.html).toContain('Kihagyom');
    expect(payload.html).toContain('Szabin vagyok');

    const eventsRes = await request(app)
      .get(`/api/teams/${teamId}/event-series/${seriesId}/events`)
      .set('Authorization', `Bearer ${captainToken}`);

    expect(eventsRes.status).toBe(200);
    expect(eventsRes.body.count).toBe(4);
    expect(eventsRes.body.events[0].occurrence_index).toBe(1);
    expect(eventsRes.body.events[1].occurrence_index).toBe(2);

    const firstStart = new Date(eventsRes.body.events[0].start_at).getTime();
    const secondStart = new Date(eventsRes.body.events[1].start_at).getTime();

    expect(secondStart - firstStart).toBe(7 * 24 * 60 * 60 * 1000);

    const scheduleRes = await pool.query(
      `
      select ens.event_id, ens.scheduled_at, ens.status, e.occurrence_index, e.start_at
      from event_notification_schedules ens
      join events e on e.id = ens.event_id
      where e.series_id = $1
      order by e.occurrence_index asc
      `,
      [seriesId]
    );

    expect(scheduleRes.rows).toHaveLength(3);
    expect(scheduleRes.rows.map(row => row.occurrence_index)).toEqual([2, 3, 4]);
    expect(scheduleRes.rows.every(row => row.status === 'pending')).toBe(true);
    for (const row of scheduleRes.rows) {
      const expectedScheduledAt = new Date(new Date(row.start_at).getTime() - 163 * 60 * 60 * 1000);
      expect(new Date(row.scheduled_at).toISOString()).toBe(expectedScheduledAt.toISOString());
    }

    const listRes = await request(app)
      .get(`/api/teams/${teamId}/event-series`)
      .set('Authorization', `Bearer ${captainToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.count).toBe(1);
    expect(listRes.body.series[0].id).toBe(seriesId);
  });

  test('generated occurrence can be registered just like a normal event', async () => {
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/event-series`)
      .set('Authorization', `Bearer ${captainToken}`)
      .send({
        title: 'Csütörtöki foci',
        startAt: buildFutureIsoDate({ daysAhead: 9, hour: 18, minute: 30 }),
        locationName: 'Műfüves pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        initialStatus: 'published',
        recurrenceType: 'weekly',
        seriesEndType: 'occurrence_count',
        seriesOccurrenceCount: 2
      });

    expect(createRes.status).toBe(201);

    const seriesId = createRes.body.series.id;
    created.series.push(seriesId);

    createRes.body.generatedEvents.forEach(item => {
      created.events.push(item.event.id);
    });

    const firstEventId = createRes.body.generatedEvents[0].event.id;

    const registerRes = await request(app)
      .post(`/api/events/${firstEventId}/register`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.ok).toBe(true);
    expect(registerRes.body.registration.registration_status).toBe('going');
  });

  test('series creation copies payment link settings into generated events', async () => {
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/event-series`)
      .set('Authorization', `Bearer ${captainToken}`)
      .send({
        title: 'Linkes sorozat',
        startAt: buildFutureIsoDate({ daysAhead: 11, hour: 19, minute: 0 }),
        locationName: 'Fizetős pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        initialStatus: 'published',
        recurrenceType: 'weekly',
        seriesEndType: 'occurrence_count',
        seriesOccurrenceCount: 2,
        paymentLinkProvider: 'revolut',
        paymentLinkUrl: 'https://pay.example.com/series-revolut-link'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.series.payment_link_provider).toBe('revolut');
    expect(createRes.body.series.payment_link_url).toBe('https://pay.example.com/series-revolut-link');

    const seriesId = createRes.body.series.id;
    created.series.push(seriesId);
    createRes.body.generatedEvents.forEach(item => created.events.push(item.event.id));

    const eventDetailRes = await request(app)
      .get(`/api/events/${createRes.body.generatedEvents[0].event.id}`)
      .set('Authorization', `Bearer ${captainToken}`);

    expect(eventDetailRes.status).toBe(200);
    expect(eventDetailRes.body.event.payment_link_provider).toBe('revolut');
    expect(eventDetailRes.body.event.payment_link_url).toBe('https://pay.example.com/series-revolut-link');
  });

  test('holiday warning is returned but does not block creation', async () => {
    const blockedRes = await request(app)
      .post(`/api/teams/${teamId}/event-series`)
      .set('Authorization', `Bearer ${captainToken}`)
      .send({
        title: 'Ünnepnapi foci',
        startAt: nextHoliday.startAt,
        locationName: 'Ünnepi pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        initialStatus: 'published',
        recurrenceType: 'weekly',
        seriesEndType: 'occurrence_count',
        seriesOccurrenceCount: 2
      });

    expect(blockedRes.status).toBe(409);
    expect(blockedRes.body.requiresHolidayConfirmation).toBe(true);
    expect(Array.isArray(blockedRes.body.holidayWarnings)).toBe(true);
    expect(blockedRes.body.holidayWarnings[0].occursOn).toBe(nextHoliday.occursOn);

    const createRes = await request(app)
      .post(`/api/teams/${teamId}/event-series`)
      .set('Authorization', `Bearer ${captainToken}`)
      .send({
        title: 'Ünnepnapi foci',
        startAt: nextHoliday.startAt,
        locationName: 'Ünnepi pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        initialStatus: 'published',
        recurrenceType: 'weekly',
        seriesEndType: 'occurrence_count',
        seriesOccurrenceCount: 2,
        confirmHolidayOverride: true
      });

    expect(createRes.status).toBe(201);
    expect(Array.isArray(createRes.body.holidayWarnings)).toBe(true);
    expect(createRes.body.holidayWarnings.length).toBeGreaterThan(0);

    const seriesId = createRes.body.series.id;
    created.series.push(seriesId);
    createRes.body.generatedEvents.forEach(item => created.events.push(item.event.id));

    expect(createRes.body.holidayWarnings[0].occursOn).toBe(nextHoliday.occursOn);
    expect(createRes.body.holidayWarnings[0].message).toContain('munkaszüneti');
  });

  test('member cannot create series and captain can stop it', async () => {
    const forbiddenRes = await request(app)
      .post(`/api/teams/${teamId}/event-series`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        title: 'Tiltott sorozat',
        startAt: buildFutureIsoDate({ daysAhead: 12, hour: 18, minute: 0 }),
        locationName: 'Tiltott pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        recurrenceType: 'weekly',
        seriesEndType: 'occurrence_count',
        seriesOccurrenceCount: 2
      });

    expect(forbiddenRes.status).toBe(403);

    const createRes = await request(app)
      .post(`/api/teams/${teamId}/event-series`)
      .set('Authorization', `Bearer ${captainToken}`)
      .send({
        title: 'Leállítandó sorozat',
        startAt: buildFutureIsoDate({ daysAhead: 13, hour: 18, minute: 0 }),
        locationName: 'Leállítás pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        recurrenceType: 'biweekly',
        seriesEndType: 'occurrence_count',
        seriesOccurrenceCount: 3,
        confirmHolidayOverride: true
      });

    expect(createRes.status).toBe(201);

    const seriesId = createRes.body.series.id;
    created.series.push(seriesId);
    createRes.body.generatedEvents.forEach(item => created.events.push(item.event.id));

    const stopRes = await request(app)
      .post(`/api/teams/${teamId}/event-series/${seriesId}/stop`)
      .set('Authorization', `Bearer ${captainToken}`);

    expect(stopRes.status).toBe(200);
    expect(stopRes.body.series.is_active).toBe(false);
  });
});
