const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');
const holidayData = require('../src/data/hu-holidays.json');

function getNextHolidayStartAt() {
  const now = new Date();
  const futureHolidayDate = Object.keys(holidayData.dates)
    .sort()
    .find(date => new Date(`${date}T18:00:00.000Z`).getTime() > now.getTime());

  if (!futureHolidayDate) {
    throw new Error('Nincs jövőbeli ünnepnap a hu-holidays fixture-ben.');
  }

  return {
    occursOn: futureHolidayDate,
    startAt: `${futureHolidayDate}T18:00:00.000Z`
  };
}

function buildStableFutureIsoDate({
  daysAhead = 7,
  hour = 18,
  minute = 0
} = {}) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  date.setUTCHours(hour, minute, 0, 0);

  while (holidayData.dates[date.toISOString().slice(0, 10)]) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date.toISOString();
}

describe('Event state and edit rules E2E', () => {
  const password = 'teszt123';

  let team_adminUserId;
  let memberUserId;
  let teamId;

  let team_adminEmail;
  let memberEmail;

  let team_adminToken;
  let memberToken;
  let nextHoliday;

  const created = {
    registrations: [],
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
    nextHoliday = getNextHolidayStartAt();

    team_adminEmail = `team_admin_${Date.now()}@example.com`;
    memberEmail = `member_${Date.now()}@example.com`;

    team_adminUserId = await createUser({
      name: 'Captain User',
      email: team_adminEmail
    });

    memberUserId = await createUser({
      name: 'Member User',
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
      [teamId, 'Teszt FC E2E', team_adminUserId]
    );

    await createTeamMembership(team_adminUserId, 'team_admin');
    await createTeamMembership(memberUserId, 'member');

    team_adminToken = await login(team_adminEmail);
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

    created.events.length = 0;
    created.teams.length = 0;
    created.users.length = 0;
    created.registrations.length = 0;
  });

  test('draft event: full edit works, register blocked, publish works', async () => {
    const draftStartAt = buildStableFutureIsoDate({ daysAhead: 7, hour: 18, minute: 0 });
    const updatedDraftStartAt = buildStableFutureIsoDate({ daysAhead: 9, hour: 19, minute: 0 });
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Draft E2E Event',
        description: 'State machine draft teszt',
        startAt: draftStartAt,
        locationName: 'Teszt pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        initialStatus: 'draft'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.event.status).toBe('draft');

    const eventId = createRes.body.event.id;
    created.events.push(eventId);

    const registerDraftRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(registerDraftRes.status).toBe(400);
    expect(registerDraftRes.body.ok).toBe(false);

    const updateDraftRes = await request(app)
      .patch(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Draft E2E Event Updated',
        startAt: updatedDraftStartAt,
        locationName: 'Másik pálya',
        minPlayers: 12,
        playersOnFieldTotal: 12,
        substitutesEnabled: true,
        substitutesCount: 3,
        rulesText: 'Új szabály'
      });

    expect(updateDraftRes.status).toBe(200);
    expect(updateDraftRes.body.event.status).toBe('draft');
    expect(updateDraftRes.body.event.max_players).toBe(15);
    expect(updateDraftRes.body.settings.players_on_field_total).toBe(12);
    expect(updateDraftRes.body.settings.substitutes_count).toBe(3);

    const publishRes = await request(app)
      .patch(`/api/events/${eventId}/status`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({ status: 'published' });

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.transition.from).toBe('draft');
    expect(publishRes.body.transition.to).toBe('published');

    const getRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.event.status).toBe('published');
    expect(getRes.body.summary.isRegistrationOpen).toBe(true);
  });

  test('published event: safe edit allowed, hard edit blocked', async () => {
    const publishedStartAt = buildStableFutureIsoDate({ daysAhead: 10, hour: 18, minute: 0 });
    const updatedPublishedStartAt = buildStableFutureIsoDate({ daysAhead: 10, hour: 19, minute: 30 });
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Published E2E Event',
        description: 'Soft edit teszt',
        startAt: publishedStartAt,
        locationName: 'Kezdő pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: true,
        substitutesCount: 4,
        initialStatus: 'published'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.event.status).toBe('published');

    const eventId = createRes.body.event.id;
    created.events.push(eventId);

    const softEditRes = await request(app)
      .patch(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Published E2E Event Updated',
        startAt: updatedPublishedStartAt,
        locationName: 'Új helyszín',
        rulesText: 'Friss szabályok',
        paymentNotes: 'Új fizetési infó',
        perPlayerFee: 150
      });

    expect(softEditRes.status).toBe(200);
    expect(softEditRes.body.event.title).toBe('Published E2E Event Updated');
    expect(softEditRes.body.event.start_at).toBe(updatedPublishedStartAt);
    expect(softEditRes.body.event.location_name).toBe('Új helyszín');
    expect(softEditRes.body.settings.rules_text).toBe('Friss szabályok');
    expect(softEditRes.body.settings.per_player_fee).toBe(150);

    const hardEditRes = await request(app)
      .patch(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        playersOnFieldTotal: 12
      });

    expect(hardEditRes.status).toBe(400);
    expect(hardEditRes.body.ok).toBe(false);
    expect(hardEditRes.body.message).toContain('Tiltott mez');
  });

  test('event can be hidden from admin list without deleting it', async () => {
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Rejthető esemény',
        startAt: '2026-05-05T18:00:00.000Z',
        locationName: 'Rejtett pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        initialStatus: 'published'
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.event.id;
    created.events.push(eventId);

    const hideRes = await request(app)
      .patch(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        hiddenFromAdminList: true
      });

    expect(hideRes.status).toBe(200);
    expect(hideRes.body.event.hidden_from_admin_list).toBe(true);

    const listRes = await request(app)
      .get(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(listRes.status).toBe(200);
    const hiddenEvent = listRes.body.events.find(item => item.id === eventId);
    expect(hiddenEvent).toBeTruthy();
    expect(hiddenEvent.hidden_from_admin_list).toBe(true);
  });

  test('event payment summary supports fixed and split pricing modes with rounded totals', async () => {
    const fixedCreateRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Fix díjas esemény',
        startAt: '2026-06-10T18:00:00.000Z',
        locationName: 'Fix pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        initialStatus: 'published',
        pricingMode: 'fixed_per_person',
        fixedPricePerPerson: 1250,
        perPlayerFee: 100
      });

    expect(fixedCreateRes.status).toBe(201);
    const fixedEventId = fixedCreateRes.body.event.id;
    created.events.push(fixedEventId);

    const fixedDetailRes = await request(app)
      .get(`/api/events/${fixedEventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(fixedDetailRes.status).toBe(200);
    expect(fixedDetailRes.body.summary.paymentSummary.pricing_mode).toBe('fixed_per_person');
    expect(fixedDetailRes.body.summary.paymentSummary.final_amount_per_person).toBe(1400);
    expect(fixedDetailRes.body.summary.paymentSummary.is_visible_to_user).toBe(true);

    const splitCreateRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Osztott díjas esemény',
        startAt: '2026-06-11T18:00:00.000Z',
        locationName: 'Osztott pálya',
        minPlayers: 2,
        playersOnFieldTotal: 2,
        substitutesEnabled: false,
        initialStatus: 'published',
        pricingMode: 'split_total_cost',
        totalEventCost: 20000,
        perPlayerFee: 100
      });

    expect(splitCreateRes.status).toBe(201);
    const splitEventId = splitCreateRes.body.event.id;
    created.events.push(splitEventId);

    const regARes = await request(app)
      .post(`/api/events/${splitEventId}/register`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(regARes.status).toBe(201);

    const regBRes = await request(app)
      .post(`/api/events/${splitEventId}/register`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(regBRes.status).toBe(201);

    const splitDetailRes = await request(app)
      .get(`/api/events/${splitEventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(splitDetailRes.status).toBe(200);
    expect(splitDetailRes.body.summary.paymentSummary.pricing_mode).toBe('split_total_cost');
    expect(splitDetailRes.body.summary.paymentSummary.final_amount_per_person).toBe(10100);
    expect(splitDetailRes.body.summary.paymentSummary.is_visible_to_user).toBe(false);
  });

  test('event payment link can be stored on create and updated later', async () => {
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Payment link event',
        startAt: buildStableFutureIsoDate({ daysAhead: 12, hour: 18, minute: 0 }),
        locationName: 'Linkes pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        initialStatus: 'published',
        pricingMode: 'fixed_per_person',
        fixedPricePerPerson: 1400,
        paymentLinkProvider: 'revolut',
        paymentLinkUrl: 'https://pay.example.com/revolut-event-link'
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.event.id;
    created.events.push(eventId);
    expect(createRes.body.settings.payment_link_provider).toBe('revolut');
    expect(createRes.body.settings.payment_link_url).toBe('https://pay.example.com/revolut-event-link');

    const updateRes = await request(app)
      .patch(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        paymentLinkProvider: 'wise',
        paymentLinkUrl: 'https://pay.example.com/wise-event-link'
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.settings.payment_link_provider).toBe('wise');
    expect(updateRes.body.settings.payment_link_url).toBe('https://pay.example.com/wise-event-link');

    const detailRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.event.payment_link_provider).toBe('wise');
    expect(detailRes.body.event.payment_link_url).toBe('https://pay.example.com/wise-event-link');
  });

  test('single event creation requires holiday confirmation and returns warning after approval', async () => {
    const blockedRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Ünnepnapi egyszeri esemény',
        description: 'Holiday warning teszt',
        startAt: nextHoliday.startAt,
        locationName: 'Ünnepi pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        initialStatus: 'published'
      });

    expect(blockedRes.status).toBe(409);
    expect(blockedRes.body.requiresHolidayConfirmation).toBe(true);
    expect(blockedRes.body.holidayWarning).toBeTruthy();
    expect(blockedRes.body.holidayWarning.occursOn).toBe(nextHoliday.occursOn);

    const createRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Ünnepnapi egyszeri esemény',
        description: 'Holiday warning teszt',
        startAt: nextHoliday.startAt,
        locationName: 'Ünnepi pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        initialStatus: 'published',
        notificationPreferences: {
          notifyTeamOnCreate: true,
          notifyAllOnNewRegistration: true,
          notifyAllWhenTwoSpotsLeft: false
        },
        confirmHolidayOverride: true
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.holidayWarning).toBeTruthy();
    expect(createRes.body.holidayWarning.occursOn).toBe(nextHoliday.occursOn);
    expect(createRes.body.holidayWarning.message).toContain('munkaszüneti');
    expect(createRes.body.settings.notification_preferences.notifyAllOnNewRegistration).toBe(true);
    expect(createRes.body.settings.notification_preferences.notifyAllWhenTwoSpotsLeft).toBe(false);
    expect(createRes.body.settings.notification_preferences.notifyTeamDrawPublished).toBe(true);
    expect(createRes.body.settings.notification_preferences.enableAutoTeamDrawOneHourBefore).toBe(true);
    expect(createRes.body.settings.notification_preferences.notifyWeatherAlerts).toBe(false);

    const eventId = createRes.body.event.id;
    created.events.push(eventId);

    const detailRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.holidayWarning).toBeTruthy();
    expect(detailRes.body.holidayWarning.occursOn).toBe(nextHoliday.occursOn);
    expect(detailRes.body.event.notification_preferences.notifyAllOnNewRegistration).toBe(true);
    expect(detailRes.body.event.notification_preferences.notifyAllWhenTwoSpotsLeft).toBe(false);
    expect(detailRes.body.event.notification_preferences.notifyTeamDrawPublished).toBe(true);
    expect(detailRes.body.event.notification_preferences.enableAutoTeamDrawOneHourBefore).toBe(true);
    expect(detailRes.body.event.notification_preferences.notifyWeatherAlerts).toBe(false);
  });

  test('cancelled event cannot be edited and cancelled -> published is blocked', async () => {
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Cancel Flow Event',
        description: 'Cancel státusz teszt',
        startAt: buildStableFutureIsoDate({ daysAhead: 14, hour: 18, minute: 0 }),
        locationName: 'Teszt pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        initialStatus: 'published'
      });

    expect(createRes.status).toBe(201);

    const eventId = createRes.body.event.id;
    created.events.push(eventId);

    const cancelRes = await request(app)
      .patch(`/api/events/${eventId}/status`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({ status: 'cancelled' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.transition.to).toBe('cancelled');

    const editCancelledRes = await request(app)
      .patch(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({ title: 'Nem mehet át' });

    expect(editCancelledRes.status).toBe(400);
    expect(editCancelledRes.body.message).toMatch(/nem szerkeszthető/i);

    const republishRes = await request(app)
      .patch(`/api/events/${eventId}/status`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({ status: 'published' });

    expect(republishRes.status).toBe(400);
    expect(republishRes.body.message).toMatch(/Tiltott státuszváltás/);
  });
});
