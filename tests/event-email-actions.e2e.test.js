const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');
const {
  buildEventEmailActionToken,
  EVENT_EMAIL_ACTIONS
} = require('../src/services/eventEmailActionService');

describe('Event email actions E2E', () => {
  const password = 'teszt123';
  const created = {
    users: [],
    teams: [],
    events: []
  };

  async function createUser({ name, email }) {
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    created.users.push(id);

    await pool.query(
      `
      insert into users (id, name, email, status, password_hash, created_at, updated_at)
      values ($1, $2, $3, 'active', $4, now(), now())
      `,
      [id, name, email, passwordHash]
    );

    return id;
  }

  async function addMembership(teamId, userId, role) {
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

  afterEach(async () => {
    if (created.events.length > 0) {
      await pool.query(`delete from event_email_action_log where event_id = any($1::uuid[])`, [created.events]);
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

    created.users.length = 0;
    created.teams.length = 0;
    created.events.length = 0;
  });

  test('Jelentkezem email action ugyanugy regisztral, mint a rendes UI gomb', async () => {
    const runId = randomUUID();
    const adminId = await createUser({ name: 'Email Admin', email: `email_admin_${runId}@example.com` });
    const memberId = await createUser({ name: 'Email Member', email: `email_member_${runId}@example.com` });
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, rank_module_enabled, created_at, updated_at)
      values ($1, $2, $3, 'active', false, now(), now())
      `,
      [teamId, 'Email Akcio FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, memberId, 'member');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Email gombos esemény', 'Email action teszt', '2026-06-10T18:00:00.000Z', 'Teszt pálya', 5, 10, 'published', now(), now(), now()
      )
      `,
      [eventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, pricing_mode, fixed_price_per_person, players_on_field_total, notification_preferences
      )
      values ($1, $2, 'fixed_per_person', 1400, 10, '{"notifyTeamOnCreate":true}'::jsonb)
      `,
      [randomUUID(), eventId]
    );

    const token = buildEventEmailActionToken({
      eventId,
      userId: memberId,
      action: EVENT_EMAIL_ACTIONS.REGISTER
    });

    const response = await request(app)
      .get(`/api/event-email-actions/${encodeURIComponent(token)}`)
      .redirects(0);

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain(`teamId=${teamId}`);
    expect(response.headers.location).toContain(`eventId=${eventId}`);
    expect(response.headers.location).toContain('emailActionStatus=going');

    const registrationResult = await pool.query(
      `
      select registration_status
      from event_registrations
      where event_id = $1
        and user_id = $2
      `,
      [eventId, memberId]
    );

    expect(registrationResult.rows).toHaveLength(1);
    expect(registrationResult.rows[0].registration_status).toBe('going');
  });

  test('Kihagyom email action csak naploz, es nem hoz letre jelentkezest', async () => {
    const runId = randomUUID();
    const adminId = await createUser({ name: 'Skip Admin', email: `skip_admin_${runId}@example.com` });
    const memberId = await createUser({ name: 'Skip Member', email: `skip_member_${runId}@example.com` });
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, rank_module_enabled, created_at, updated_at)
      values ($1, $2, $3, 'active', true, now(), now())
      `,
      [teamId, 'Skip Jelzes FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, memberId, 'member');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Skip esemény', 'Skip action teszt', '2026-06-11T18:00:00.000Z', 'Rank pálya', 5, 10, 'published', now(), now(), now()
      )
      `,
      [eventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (id, event_id, notification_preferences)
      values ($1, $2, '{"notifyTeamOnCreate":true}'::jsonb)
      `,
      [randomUUID(), eventId]
    );

    const token = buildEventEmailActionToken({
      eventId,
      userId: memberId,
      action: EVENT_EMAIL_ACTIONS.SKIP
    });

    const response = await request(app)
      .get(`/api/event-email-actions/${encodeURIComponent(token)}`)
      .redirects(0);

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('emailActionStatus=recorded_for_rank');

    const registrationResult = await pool.query(
      `
      select count(*)::int as count
      from event_registrations
      where event_id = $1
        and user_id = $2
      `,
      [eventId, memberId]
    );
    expect(registrationResult.rows[0].count).toBe(0);

    const logResult = await pool.query(
      `
      select action, status
      from event_email_action_log
      where event_id = $1
        and user_id = $2
      order by created_at desc
      limit 1
      `,
      [eventId, memberId]
    );

    expect(logResult.rows[0]).toEqual(
      expect.objectContaining({
        action: 'skip',
        status: 'recorded_for_rank'
      })
    );
  });
});
