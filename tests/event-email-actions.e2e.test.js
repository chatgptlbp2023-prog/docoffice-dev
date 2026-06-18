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
        $1, $2, $3, 'Email gombos esemény', 'Email action teszt', now() + interval '2 days', 'Teszt pálya', 5, 10, 'published', now(), now(), now()
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

    expect(response.status).toBe(200);
    expect(response.text).toContain('Jelentkezés rögzítve');
    expect(response.text).toContain('Sikeres jelentkezes');

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

  test('Jelentkezem email action telt esemenynel varolistara teszi a jatekost', async () => {
    const runId = randomUUID();
    const adminId = await createUser({ name: 'Full Email Admin', email: `full_email_admin_${runId}@example.com` });
    const goingMemberId = await createUser({ name: 'Full Going Member', email: `full_going_${runId}@example.com` });
    const waitlistMemberId = await createUser({ name: 'Full Waitlist Member', email: `full_waitlist_${runId}@example.com` });
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, rank_module_enabled, created_at, updated_at)
      values ($1, $2, $3, 'active', false, now(), now())
      `,
      [teamId, 'Email Varolista FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, goingMemberId, 'member');
    await addMembership(teamId, waitlistMemberId, 'member');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Email varolistas esemeny', 'Email action varolista teszt', now() + interval '2 days', 'Teszt palya', 1, 1, 'published', now(), now(), now()
      )
      `,
      [eventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, notification_preferences
      )
      values ($1, $2, '{"notifyTeamOnCreate":true}'::jsonb)
      `,
      [randomUUID(), eventId]
    );

    await pool.query(
      `
      insert into event_registrations (
        id, event_id, team_id, user_id, registration_status, registered_at, created_at, updated_at
      )
      values ($1, $2, $3, $4, 'going', now() - interval '5 minutes', now(), now())
      `,
      [randomUUID(), eventId, teamId, goingMemberId]
    );

    const token = buildEventEmailActionToken({
      eventId,
      userId: waitlistMemberId,
      action: EVENT_EMAIL_ACTIONS.REGISTER
    });

    const response = await request(app)
      .get(`/api/event-email-actions/${encodeURIComponent(token)}`)
      .redirects(0);

    expect(response.status).toBe(200);
    expect(response.text).toContain('Jelentkez');
    expect(response.text).toContain('varolistara');

    const registrationResult = await pool.query(
      `
      select registration_status
      from event_registrations
      where event_id = $1
        and user_id = $2
      `,
      [eventId, waitlistMemberId]
    );

    expect(registrationResult.rows).toHaveLength(1);
    expect(registrationResult.rows[0].registration_status).toBe('waiting_list');
  });

  test('Jelentkezem email action sem keruli meg az aktiv csapatszabalyzat elfogadasat', async () => {
    const runId = randomUUID();
    const adminId = await createUser({ name: 'Rules Email Admin', email: `rules_email_admin_${runId}@example.com` });
    const memberId = await createUser({ name: 'Rules Email Member', email: `rules_email_member_${runId}@example.com` });
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (
        id, name, created_by_user_id, status, rank_module_enabled,
        rules_module_enabled, rules_text, rules_version,
        created_at, updated_at
      )
      values ($1, $2, $3, 'active', false, true, $4, 2, now(), now())
      `,
      [teamId, 'Email Szabaly FC', adminId, 'Emailbol sem lehet megkerulni a csapatszabalyzatot.']
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, memberId, 'member');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Email szabaly esemĂ©ny', 'Email rules action teszt', now() + interval '2 days', 'Teszt pĂˇlya', 5, 10, 'published', now(), now(), now()
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
      action: EVENT_EMAIL_ACTIONS.REGISTER
    });

    const response = await request(app)
      .get(`/api/event-email-actions/${encodeURIComponent(token)}`)
      .redirects(0);

    expect(response.status).toBe(200);
    expect(response.text).toContain('Szabályzat');

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
      select action, status, message
      from event_email_action_log
      where event_id = $1
        and user_id = $2
      order by created_at desc
      limit 1
      `,
      [eventId, memberId]
    );

    expect(logResult.rows[0].action).toBe('register');
    expect(logResult.rows[0].status).toBe('error');
    expect(logResult.rows[0].message).toContain('Szabályzat');
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
        $1, $2, $3, 'Skip esemény', 'Skip action teszt', now() + interval '2 days', 'Rank pálya', 5, 10, 'published', now(), now(), now()
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

    expect(response.status).toBe(200);
    expect(response.text).toContain('Kihagyás rögzítve');
    expect(response.text).toContain('rangmodul');

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

  test('Szabin vagyok email action egy hetes szabadsagot rogzit a csapattagsagon', async () => {
    const runId = randomUUID();
    const adminId = await createUser({ name: 'Vacation Admin', email: `vacation_admin_${runId}@example.com` });
    const memberId = await createUser({ name: 'Vacation Member', email: `vacation_member_${runId}@example.com` });
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, rank_module_enabled, created_at, updated_at)
      values ($1, $2, $3, 'active', true, now(), now())
      `,
      [teamId, 'Szabi Action FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, memberId, 'member');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Szabi action esemeny', 'Vacation action teszt', now() + interval '2 days', 'Teszt palya', 5, 10, 'published', now(), now(), now()
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
      action: EVENT_EMAIL_ACTIONS.VACATION_ONE_WEEK
    });

    const beforeClick = Date.now();
    const response = await request(app)
      .get(`/api/event-email-actions/${encodeURIComponent(token)}`)
      .redirects(0);
    const afterClick = Date.now();

    expect(response.status).toBe(200);
    expect(response.text).toContain('Szabads');
    expect(response.text).toContain('1 hétig szabin vagy ebben a csapatban');

    const memberResult = await pool.query(
      `
      select membership_status, break_started_at, break_until, break_extensions_count
      from team_members
      where team_id = $1
        and user_id = $2
      `,
      [teamId, memberId]
    );

    expect(memberResult.rows).toHaveLength(1);
    expect(memberResult.rows[0].membership_status).toBe('active');
    expect(memberResult.rows[0].break_started_at).toBeTruthy();
    expect(memberResult.rows[0].break_until).toBeTruthy();
    expect(memberResult.rows[0].break_extensions_count).toBe(1);

    const breakUntilMs = new Date(memberResult.rows[0].break_until).getTime();
    expect(breakUntilMs).toBeGreaterThanOrEqual(beforeClick + (6 * 24 * 60 * 60 * 1000));
    expect(breakUntilMs).toBeLessThanOrEqual(afterClick + (8 * 24 * 60 * 60 * 1000));

    const logResult = await pool.query(
      `
      select action, status, metadata
      from event_email_action_log
      where event_id = $1
        and user_id = $2
      order by created_at desc
      limit 1
      `,
      [eventId, memberId]
    );

    expect(logResult.rows[0].action).toBe('vacation_one_week');
    expect(logResult.rows[0].status).toBe('recorded');
    expect(logResult.rows[0].metadata.rankModuleEnabled).toBe(true);
  });
});
