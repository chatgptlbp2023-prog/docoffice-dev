const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('Event registration flow E2E', () => {
  const password = 'teszt123';

  function futureIso(daysFromNow, hourUtc = 18, minuteUtc = 0) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + daysFromNow);
    date.setUTCHours(hourUtc, minuteUtc, 0, 0);
    return date.toISOString();
  }

  let team_adminUserId;
  let memberAUserId;
  let memberBUserId;
  let teamId;

  let team_adminEmail;
  let memberAEmail;
  let memberBEmail;

  let team_adminToken;
  let memberAToken;
  let memberBToken;

  const created = {
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

  async function addMembership(userId, role) {
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

  beforeAll(async () => {
    const rankMigrationPath = require('path').join(
      __dirname,
      '..',
      'db',
      'migrations',
      '2026-04-09_team_rank_module.sql'
    );
    const eventPublishedMigrationPath = require('path').join(
      __dirname,
      '..',
      'db',
      'migrations',
      '2026-04-10_event_published_at.sql'
    );

    await pool.query(require('fs').readFileSync(rankMigrationPath, 'utf8'));
    await pool.query(require('fs').readFileSync(eventPublishedMigrationPath, 'utf8'));
  });

  beforeEach(async () => {
    const runId = randomUUID();
    team_adminEmail = `team_admin_reg_${runId}@example.com`;
    memberAEmail = `member_a_${runId}@example.com`;
    memberBEmail = `member_b_${runId}@example.com`;

    team_adminUserId = await createUser({
      name: 'Captain Reg',
      email: team_adminEmail
    });

    memberAUserId = await createUser({
      name: 'Member A',
      email: memberAEmail
    });

    memberBUserId = await createUser({
      name: 'Member B',
      email: memberBEmail
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
      [teamId, 'Registration Teszt FC', team_adminUserId]
    );

    await addMembership(team_adminUserId, 'team_admin');
    await addMembership(memberAUserId, 'member');
    await addMembership(memberBUserId, 'member');

    team_adminToken = await login(team_adminEmail);
    memberAToken = await login(memberAEmail);
    memberBToken = await login(memberBEmail);
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
  });

  test('single available slot creates going + waiting_list, then cancel promotes first waiting user', async () => {
    const createEventRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Registration Flow Event',
        description: 'Waitlist teszt',
        startAt: futureIso(10, 18, 0),
        locationName: 'Teszt pálya',
        minPlayers: 1,
        playersOnFieldTotal: 1,
        substitutesEnabled: false,
        initialStatus: 'published',
        confirmHolidayOverride: true
      });

    expect(createEventRes.status).toBe(201);

    const eventId = createEventRes.body.event.id;
    created.events.push(eventId);

    const regARes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(regARes.status).toBe(201);
    expect(regARes.body.registration.registration_status).toBe('going');

    const regBRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberBToken}`);

    expect(regBRes.status).toBe(201);
    expect(regBRes.body.registration.registration_status).toBe('waiting_list');

    const eventBeforeCancel = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(eventBeforeCancel.status).toBe(200);
    expect(eventBeforeCancel.body.summary.goingCount).toBe(1);
    expect(eventBeforeCancel.body.summary.waitingCount).toBe(1);

    const cancelARes = await request(app)
      .post(`/api/events/${eventId}/cancel`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(cancelARes.status).toBe(200);
    expect(cancelARes.body.previousStatus).toBe('going');
    expect(cancelARes.body.promotedRegistration).toBeTruthy();
    expect(cancelARes.body.promotedRegistration.user_id).toBe(memberBUserId);
    expect(cancelARes.body.promotedRegistration.registration_status).toBe('going');

    const eventAfterCancel = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(eventAfterCancel.status).toBe(200);
    expect(eventAfterCancel.body.summary.goingCount).toBe(1);
    expect(eventAfterCancel.body.summary.waitingCount).toBe(0);
    expect(eventAfterCancel.body.summary.cancelledCount).toBe(1);

    expect(eventAfterCancel.body.registrations.going[0].user_id).toBe(memberBUserId);
    expect(eventAfterCancel.body.registrations.cancelled[0].user_id).toBe(memberAUserId);
  });

  test('user cannot register twice actively, but can re-register after cancel', async () => {
    const createEventRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Re-register Event',
        description: 'Re-register teszt',
        startAt: futureIso(11, 18, 0),
        locationName: 'Teszt pálya',
        minPlayers: 2,
        playersOnFieldTotal: 2,
        substitutesEnabled: false,
        initialStatus: 'published'
      });

    expect(createEventRes.status).toBe(201);

    const eventId = createEventRes.body.event.id;
    created.events.push(eventId);

    const firstRegisterRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(firstRegisterRes.status).toBe(201);
    expect(firstRegisterRes.body.registration.registration_status).toBe('going');

    const duplicateRegisterRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(duplicateRegisterRes.status).toBe(409);
    expect(duplicateRegisterRes.body.registrationStatus).toBe('going');

    const cancelRes = await request(app)
      .post(`/api/events/${eventId}/cancel`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.previousStatus).toBe('going');

    const reRegisterRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(reRegisterRes.status).toBe(201);
    expect(reRegisterRes.body.registration.registration_status).toBe('going');

    const detailRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.summary.goingCount).toBe(1);
    expect(detailRes.body.summary.cancelledCount).toBe(1);
  });

  test('active team rules module blocks event registration until the member accepts the current rules version', async () => {
    const createEventRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Rules Guard Event',
        description: 'Szabályzat őr teszt',
        startAt: futureIso(12, 18, 0),
        locationName: 'Teszt pálya',
        minPlayers: 2,
        playersOnFieldTotal: 2,
        substitutesEnabled: false,
        initialStatus: 'published',
        confirmHolidayOverride: true
      });

    expect(createEventRes.status).toBe(201);
    const eventId = createEventRes.body.event.id;
    created.events.push(eventId);

    const rulesRes = await request(app)
      .patch(`/api/teams/${teamId}/rules`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        rulesModuleEnabled: true,
        rulesText: 'A csapat szabályzatát el kell fogadni jelentkezés előtt.'
      });

    expect(rulesRes.status).toBe(200);
    expect(rulesRes.body.team.rules_module_enabled).toBe(true);
    expect(Number(rulesRes.body.team.rules_version)).toBe(2);

    const blockedRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.rulesAcceptanceRequired).toBe(true);
    expect(blockedRes.body.rulesVersion).toBe(2);
    expect(blockedRes.body.message).toContain('Szabályzat');

    const teamBeforeAcceptRes = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(teamBeforeAcceptRes.status).toBe(200);
    const memberBeforeAccept = teamBeforeAcceptRes.body.members.find(member => member.user_id === memberAUserId);
    expect(memberBeforeAccept.rules_acceptance.required).toBe(true);
    expect(memberBeforeAccept.rules_acceptance.accepted).toBe(false);

    const acceptRes = await request(app)
      .post(`/api/teams/${teamId}/rules/accept`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.rules_acceptance.accepted).toBe(true);
    expect(acceptRes.body.rules_acceptance.current_version).toBe(2);

    const allowedRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(allowedRes.status).toBe(201);
    expect(allowedRes.body.registration.registration_status).toBe('going');
  });

  test('re-register after cancel goes to waiting list if the spot has already been taken', async () => {
    const createEventRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Re-register to waitlist Event',
        description: 'Visszajelentkezes varolista teszt',
        startAt: futureIso(12, 18, 0),
        locationName: 'Teszt palya',
        minPlayers: 1,
        playersOnFieldTotal: 1,
        substitutesEnabled: false,
        initialStatus: 'published',
        confirmHolidayOverride: true
      });

    expect(createEventRes.status).toBe(201);

    const eventId = createEventRes.body.event.id;
    created.events.push(eventId);

    const firstRegisterRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(firstRegisterRes.status).toBe(201);
    expect(firstRegisterRes.body.registration.registration_status).toBe('going');

    const cancelRes = await request(app)
      .post(`/api/events/${eventId}/cancel`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.previousStatus).toBe('going');

    const occupyingRegisterRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberBToken}`);

    expect(occupyingRegisterRes.status).toBe(201);
    expect(occupyingRegisterRes.body.registration.registration_status).toBe('going');

    const reRegisterRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(reRegisterRes.status).toBe(201);
    expect(reRegisterRes.body.registration.registration_status).toBe('waiting_list');

    const detailRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.summary.goingCount).toBe(1);
    expect(detailRes.body.summary.waitingCount).toBe(1);
    expect(detailRes.body.registrations.waitingList[0].user_id).toBe(memberAUserId);
  });

  test('user can cancel twice, but third registration attempt is blocked and exposed in event payloads', async () => {
    const createEventRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Cancellation Limit Event',
        description: 'Ketszeri lemondas limit teszt',
        startAt: futureIso(10, 20, 0),
        locationName: 'Limit palya',
        minPlayers: 2,
        playersOnFieldTotal: 2,
        substitutesEnabled: false,
        initialStatus: 'published',
        confirmHolidayOverride: true
      });

    expect(createEventRes.status).toBe(201);

    const eventId = createEventRes.body.event.id;
    created.events.push(eventId);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const registerRes = await request(app)
        .post(`/api/events/${eventId}/register`)
        .set('Authorization', `Bearer ${memberAToken}`);

      expect(registerRes.status).toBe(201);

      const cancelRes = await request(app)
        .post(`/api/events/${eventId}/cancel`)
        .set('Authorization', `Bearer ${memberAToken}`);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.previousStatus).toBe('going');
    }

    const blockedRegisterRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(blockedRegisterRes.status).toBe(403);
    expect(blockedRegisterRes.body.cancellationLimitReached).toBe(true);
    expect(blockedRegisterRes.body.cancellationCount).toBe(2);

    const detailRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.event.my_cancelled_count).toBe(2);
    expect(detailRes.body.event.registration_limit_reached).toBe(true);

    const teamEventsRes = await request(app)
      .get(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(teamEventsRes.status).toBe(200);
    expect(teamEventsRes.body.events[0].my_cancelled_count).toBe(2);
    expect(teamEventsRes.body.events[0].registration_limit_reached).toBe(true);

    const myEventsRes = await request(app)
      .get('/api/my/events')
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(myEventsRes.status).toBe(200);
    expect(myEventsRes.body.events[0].my_cancelled_count).toBe(2);
    expect(myEventsRes.body.events[0].registration_limit_reached).toBe(true);
  });

  test('rank module can delay registration window by rank wave', async () => {
    await pool.query(
      `
      update teams
      set rank_module_enabled = true
      where id = $1
      `,
      [teamId]
    );

    await pool.query(
      `
      update team_members
      set rank_status = 'ranked',
          rank_value = 4
      where team_id = $1
        and user_id = $2
      `,
      [teamId, memberAUserId]
    );

    const createEventRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Rank Gate Event',
        description: 'Rangkapu teszt',
        startAt: futureIso(11, 18, 0),
        locationName: 'Hullám pálya',
        minPlayers: 2,
        playersOnFieldTotal: 2,
        substitutesEnabled: false,
        initialStatus: 'published',
        confirmHolidayOverride: true
      });

    expect(createEventRes.status).toBe(201);

    const eventId = createEventRes.body.event.id;
    created.events.push(eventId);

    const blockedRegisterRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(blockedRegisterRes.status).toBe(201);
    expect(blockedRegisterRes.body.registration.registration_status).toBe('waiting_list_rank');
    expect(blockedRegisterRes.body.registrationWindow).toBeTruthy();
    expect(blockedRegisterRes.body.registrationWindow.offsetHours).toBe(72);
    expect(blockedRegisterRes.body.registrationWindow.isRestrictedByRank).toBe(true);
    expect(blockedRegisterRes.body.registrationWindow.rankModuleEnabled).toBe(true);
    expect(blockedRegisterRes.body.registrationWindow.effectiveRankValue).toBe(4);
    expect(blockedRegisterRes.body.registrationWindow.message).toContain('A csapatkapitány aktiválta a rangmodult');

    await pool.query(
      `
      update events
      set published_at = now() - interval '73 hours'
      where id = $1
      `,
      [eventId]
    );

    const allowedRegisterRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(allowedRegisterRes.status).toBe(200);
    expect(allowedRegisterRes.body.event.my_registration_status).toBe('going');
    expect(allowedRegisterRes.body.summary.rankWaitingCount).toBe(0);
  });

  test('rank module does not delay registration when the event starts within 3 hours of creation', async () => {
    await pool.query(
      `
      update teams
      set rank_module_enabled = true
      where id = $1
      `,
      [teamId]
    );

    await pool.query(
      `
      update team_members
      set rank_status = 'ranked',
          rank_value = 4
      where team_id = $1
        and user_id = $2
      `,
      [teamId, memberAUserId]
    );

    const createEventRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Fast Start Event',
        description: 'Gyors kezdésű rangkivétel',
        startAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        locationName: 'Gyors pálya',
        minPlayers: 2,
        playersOnFieldTotal: 2,
        substitutesEnabled: false,
        initialStatus: 'published',
        confirmHolidayOverride: true
      });

    expect(createEventRes.status).toBe(201);

    const eventId = createEventRes.body.event.id;
    created.events.push(eventId);

    const registerRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.registration.registration_status).toBe('going');

    const detailRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.registrationWindow.offsetHours).toBe(0);
    expect(detailRes.body.registrationWindow.fastStartException).toBe(true);
    expect(detailRes.body.registrationWindow.isRestrictedByRank).toBe(false);
  });

  test('rank module early-opens the next wave when every higher-wave member already responded', async () => {
    await pool.query(
      `
      update teams
      set rank_module_enabled = true
      where id = $1
      `,
      [teamId]
    );

    await pool.query(
      `
      update team_members
      set rank_status = 'ranked',
          rank_value = case
            when user_id = $2 then 4
            when user_id = $3 then 8
            else 10
          end
      where team_id = $1
        and user_id in ($2, $3, $4)
      `,
      [teamId, memberAUserId, memberBUserId, team_adminUserId]
    );

    const createEventRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        title: 'Early wave opening Event',
        description: 'Korai savnyitas teszt',
        startAt: futureIso(12, 18, 0),
        locationName: 'Korai palya',
        minPlayers: 2,
        playersOnFieldTotal: 4,
        substitutesEnabled: false,
        substitutesCount: 0,
        initialStatus: 'published',
        confirmHolidayOverride: true
      });

    expect(createEventRes.status).toBe(201);

    const eventId = createEventRes.body.event.id;
    created.events.push(eventId);

    const blockedRegisterRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(blockedRegisterRes.status).toBe(201);
    expect(blockedRegisterRes.body.registration.registration_status).toBe('waiting_list_rank');

    const higherWaveRegisterCaptainRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(higherWaveRegisterCaptainRes.status).toBe(201);
    expect(higherWaveRegisterCaptainRes.body.registration.registration_status).toBe('going');

    const higherWaveRegisterMemberRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberBToken}`);

    expect(higherWaveRegisterMemberRes.status).toBe(201);
    expect(higherWaveRegisterMemberRes.body.registration.registration_status).toBe('going');

    const detailRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.registrationWindow.isOpen).toBe(true);
    expect(detailRes.body.registrationWindow.earlyOpened).toBe(true);
    expect(detailRes.body.event.my_registration_status).toBe('going');
  });
});
