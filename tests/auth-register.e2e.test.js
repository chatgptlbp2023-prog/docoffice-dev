const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('My dashboard E2E', () => {
  const password = 'teszt123';

  const created = {
    users: [],
    teams: [],
    events: []
  };

  let team_adminUserId;
  let memberUserId;
  let team_adminToken;
  let memberToken;
  let teamId;
  let eventId;
  let team_adminEmail;

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

  beforeEach(async () => {
    team_adminEmail = `dash_team_admin_${Date.now()}@example.com`;
    const memberEmail = `dash_member_${Date.now()}@example.com`;

    team_adminUserId = await createUser({
      name: 'Captain Dash',
      email: team_adminEmail
    });

    memberUserId = await createUser({
      name: 'Member Dash',
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
      [teamId, 'Dashboard FC', team_adminUserId]
    );

    await pool.query(
      `
      insert into team_members (
        id, team_id, user_id, role, membership_status, joined_at, created_at, updated_at
      )
      values
      ($1, $3, $4, 'team_admin', 'active', now(), now(), now()),
      ($2, $3, $5, 'member', 'active', now(), now(), now())
      `,
      [randomUUID(), randomUUID(), teamId, team_adminUserId, memberUserId]
    );

    eventId = randomUUID();
    created.events.push(eventId);

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at,
        location_name, location_address, min_players, max_players, status,
        created_at, updated_at
      )
      values (
        $1, $2, $3, 'Dashboard Event', 'My dashboard teszt',
        '2026-06-01T18:00:00.000Z',
        'Teszt pálya', null, 10, 10, 'published', now(), now()
      )
      `,
      [eventId, teamId, team_adminUserId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, field_size, field_quality, surface_type,
        game_duration_minutes, rules_text, price_per_player, payment_notes,
        players_on_field_total, substitutes_enabled, substitutes_count,
        created_at, updated_at
      )
      values (
        gen_random_uuid(), $1, null, null, null, null, null, null, null,
        10, false, 0, now(), now()
      )
      `,
      [eventId]
    );

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
  });

  test('user can fetch own teams and own events', async () => {
    const teamsRes = await request(app)
      .get('/api/my/teams')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(teamsRes.status).toBe(200);
    expect(teamsRes.body.ok).toBe(true);
    expect(teamsRes.body.count).toBe(1);
    expect(teamsRes.body.teams[0].name).toBe('Dashboard FC');
    expect(teamsRes.body.teams[0].role).toBe('member');

    const eventsRes = await request(app)
      .get('/api/my/events')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(eventsRes.status).toBe(200);
    expect(eventsRes.body.ok).toBe(true);
    expect(eventsRes.body.count).toBe(1);
    expect(eventsRes.body.events[0].title).toBe('Dashboard Event');
    expect(eventsRes.body.events[0].team_name).toBe('Dashboard FC');
    expect(eventsRes.body.events[0].my_team_role).toBe('member');
  });

  test('platform owner can fetch platform summary', async () => {
    await pool.query(
      `
      update users
      set platform_role = 'platform_owner',
          updated_at = now()
      where id = $1
      `,
      [team_adminUserId]
    );

    const platformToken = await login(team_adminEmail);

    const summaryRes = await request(app)
      .get('/api/my/platform-summary')
      .set('Authorization', `Bearer ${platformToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.ok).toBe(true);
    expect(summaryRes.body.counts.active_users).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(summaryRes.body.recent_teams)).toBe(true);
    expect(Array.isArray(summaryRes.body.recent_events)).toBe(true);
  });
});
