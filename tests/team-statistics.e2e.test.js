const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('Team statistics E2E', () => {
  const password = 'teszt123';
  const created = {
    users: [],
    teams: [],
    events: []
  };

  let adminUserId;
  let memberUserId;
  let teamId;
  let adminToken;
  let memberToken;
  let memberEmail;

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
      values ($1, $2, $3, $4, 'active', now() - interval '10 days', now(), now())
      `,
      [randomUUID(), teamId, userId, role]
    );
  }

  async function createPublishedEvent(title) {
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title,
        description: 'Statisztika teszt',
        startAt: '2026-05-10T18:00:00.000Z',
        locationName: 'Teszt palya',
        minPlayers: 2,
        playersOnFieldTotal: 2,
        substitutesEnabled: false,
        initialStatus: 'published'
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.event.id;
    created.events.push(eventId);
    return eventId;
  }

  beforeEach(async () => {
    const unique = randomUUID();
    const adminEmail = `stats_admin_${unique}@example.com`;
    memberEmail = `stats_member_${unique}@example.com`;

    adminUserId = await createUser({ name: 'Stats Admin', email: adminEmail });
    memberUserId = await createUser({ name: 'Stats Member', email: memberEmail });

    teamId = randomUUID();
    created.teams.push(teamId);

    await pool.query(
      `
      insert into teams (
        id, name, created_by_user_id, status, created_at, updated_at
      )
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Statistics FC', adminUserId]
    );

    await addMembership(adminUserId, 'team_admin');
    await addMembership(memberUserId, 'member');

    adminToken = await login(adminEmail);
    memberToken = await login(memberEmail);
  });

  afterEach(async () => {
    if (created.events.length > 0) {
      await pool.query(`delete from event_financial_entries where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_attendance_marks where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_registrations where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_settings where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from events where id = any($1::uuid[])`, [created.events]);
    }

    if (created.teams.length > 0) {
      await pool.query(`delete from team_members where team_id = any($1::uuid[])`, [created.teams]);
      await pool.query(`delete from teams where id = any($1::uuid[])`, [created.teams]);
    }

    if (created.users.length > 0) {
      await pool.query(`delete from users where id = any($1::uuid[])`, [created.users]);
    }

    created.events.length = 0;
    created.teams.length = 0;
    created.users.length = 0;
  });

  test('team endpoint returns registration and non-response statistics per active member', async () => {
    const reactedEventId = await createPublishedEvent('Reacted event');
    const ignoredEventId = await createPublishedEvent('Ignored event');

    await request(app)
      .post(`/api/events/${reactedEventId}/register`)
      .set('Authorization', `Bearer ${memberToken}`);

    await pool.query(
      `
      update event_registrations
      set registration_status = 'cancelled',
          cancelled_at = now(),
          updated_at = now()
      where event_id = $1
        and user_id = $2
      `,
      [reactedEventId, memberUserId]
    );

    await pool.query(
      `update events set start_at = now() - interval '2 day', updated_at = now() where id = any($1::uuid[])`,
      [[reactedEventId, ignoredEventId]]
    );

    const teamRes = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(teamRes.status).toBe(200);
    const member = teamRes.body.members.find(item => item.user_id === memberUserId);
    expect(member).toBeTruthy();
    expect(member.registration_stats.cancelled_count).toBe(1);
    expect(member.registration_stats.reacted_event_count).toBe(1);
    expect(member.registration_stats.non_response_count).toBe(1);
    expect(member.registration_stats.eligible_event_count).toBeGreaterThanOrEqual(2);
  });
});
