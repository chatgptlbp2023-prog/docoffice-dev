const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const pool = require('../src/config/db');
const eventAutomationService = require('../src/services/eventAutomationService');
const eventNotificationService = require('../src/services/eventNotificationService');

describe('Prestart event automation service', () => {
  const password = 'teszt123';
  const created = {
    users: [],
    teams: [],
    events: []
  };

  async function runMigration(fileName) {
    const migrationPath = path.join(__dirname, '..', 'db', 'migrations', fileName);
    await pool.query(fs.readFileSync(migrationPath, 'utf8'));
  }

  async function createUser(name) {
    const id = randomUUID();
    const email = `${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}_${Math.random().toString(16).slice(2)}@example.com`;
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

  async function createDueEventFixture({ startAt, notificationPreferences = {} } = {}) {
    const team_adminUserId = await createUser('Automation Captain');
    const memberOneUserId = await createUser('Automation Member One');
    const memberTwoUserId = await createUser('Automation Member Two');
    const memberThreeUserId = await createUser('Automation Member Three');
    const teamId = randomUUID();
    const eventId = randomUUID();

    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (
        id, name, created_by_user_id, status, skill_balancing_enabled,
        skill_balance_tolerance_percent, created_at, updated_at
      )
      values ($1, 'Automation FC', $2, 'active', true, 15, now(), now())
      `,
      [teamId, team_adminUserId]
    );

    await pool.query(
      `
      insert into team_members (
        id, team_id, user_id, role, membership_status,
        joined_at, created_at, updated_at,
        skills_enabled, is_goalkeeper, goalkeeper_score, defense_score, attack_score
      )
      values
      ($1, $5, $6, 'team_admin', 'active', now(), now(), now(), true, true, 8, 6, 6),
      ($2, $5, $7, 'member', 'active', now(), now(), now(), true, true, 7, 6, 7),
      ($3, $5, $8, 'member', 'active', now(), now(), now(), true, false, 0, 7, 8),
      ($4, $5, $9, 'member', 'active', now(), now(), now(), true, false, 0, 7, 8)
      `,
      [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        teamId,
        team_adminUserId,
        memberOneUserId,
        memberTwoUserId,
        memberThreeUserId
      ]
    );

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, start_at, location_name,
        min_players, max_players, status, published_at, created_at, updated_at
      )
      values ($1, $2, $3, 'Automation Match', $4, 'Automation pálya', 4, 10, 'published', now(), now(), now())
      `,
      [eventId, teamId, team_adminUserId, startAt]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, notification_preferences, created_at, updated_at
      )
      values (
        gen_random_uuid(),
        $1,
        $2::jsonb,
        now(),
        now()
      )
      `,
      [
        eventId,
        JSON.stringify({
          enableAutoTeamDrawOneHourBefore: true,
          notifyTeamDrawPublished: false,
          notifyWeatherAlerts: false,
          ...notificationPreferences
        })
      ]
    );

    await pool.query(
      `
      insert into event_registrations (
        id, event_id, user_id, team_id, registration_status, registered_at, created_at, updated_at
      )
      values
      ($1, $5, $6, $10, 'going', now(), now(), now()),
      ($2, $5, $7, $10, 'going', now(), now(), now()),
      ($3, $5, $8, $10, 'going', now(), now(), now()),
      ($4, $5, $9, $10, 'going', now(), now(), now())
      `,
      [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        eventId,
        team_adminUserId,
        memberOneUserId,
        memberTwoUserId,
        memberThreeUserId,
        teamId
      ]
    );

    return {
      eventId,
      teamId
    };
  }

  beforeAll(async () => {
    await runMigration('2026-04-01_team_member_skills.sql');
    await runMigration('2026-04-03_team_member_goalkeepers.sql');
    await runMigration('2026-04-03_event_team_draw_status_machine.sql');
    await runMigration('2026-04-09_event_notification_preferences_extensions.sql');
  });

  beforeEach(() => {
    jest.spyOn(eventNotificationService, 'notifyTeamDrawPublished').mockResolvedValue(null);
    jest.spyOn(eventNotificationService, 'notifyEventCancelled').mockResolvedValue(null);
    jest.spyOn(eventNotificationService, 'notifyWeatherAlert').mockResolvedValue(null);
  });

  afterEach(async () => {
    jest.restoreAllMocks();

    if (created.events.length > 0) {
      await pool.query('delete from event_team_draws where event_id = any($1::uuid[])', [created.events]);
      await pool.query('delete from event_registrations where event_id = any($1::uuid[])', [created.events]);
      await pool.query('delete from event_settings where event_id = any($1::uuid[])', [created.events]);
      await pool.query('delete from events where id = any($1::uuid[])', [created.events]);
    }

    if (created.teams.length > 0) {
      await pool.query('delete from team_members where team_id = any($1::uuid[])', [created.teams]);
      await pool.query('delete from teams where id = any($1::uuid[])', [created.teams]);
    }

    if (created.users.length > 0) {
      await pool.query('delete from users where id = any($1::uuid[])', [created.users]);
    }

    created.users.length = 0;
    created.teams.length = 0;
    created.events.length = 0;
  });

  test('dry-run lists due one-hour team draw candidates without writing state', async () => {
    const now = new Date('2035-01-01T10:00:00.000Z');
    const { eventId } = await createDueEventFixture({
      startAt: '2035-01-01T10:45:00.000Z'
    });

    const result = await eventAutomationService.previewDueAutoTeamDrawEvents({ now });
    const candidate = result.candidates.find(item => item.eventId === eventId);

    expect(candidate).toMatchObject({
      eventId,
      goingCount: 4,
      minPlayers: 4,
      willAutoDraw: true,
      expectedOutcome: 'team_draw_published'
    });

    const settingsResult = await pool.query(
      'select auto_prestart_processed_at from event_settings where event_id = $1',
      [eventId]
    );
    const drawResult = await pool.query(
      'select event_id from event_team_draws where event_id = $1',
      [eventId]
    );

    expect(settingsResult.rows[0].auto_prestart_processed_at).toBeNull();
    expect(drawResult.rows).toHaveLength(0);
  });

  test('processDueAutoTeamDrawEvents publishes due draw once and marks it processed', async () => {
    const now = new Date('2035-01-01T11:00:00.000Z');
    const { eventId } = await createDueEventFixture({
      startAt: '2035-01-01T11:30:00.000Z'
    });

    const result = await eventAutomationService.processDueAutoTeamDrawEvents({ now });
    const processed = result.results.find(item => item.eventId === eventId);

    expect(result.processedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    if (processed.outcome !== 'team_draw_published') {
      throw new Error(processed.error || processed.message || processed.outcome);
    }
    expect(processed.outcome).toBe('team_draw_published');
    expect(processed.draw.status).toBe('published');

    const drawResult = await pool.query(
      'select status, published_at from event_team_draws where event_id = $1',
      [eventId]
    );
    const settingsResult = await pool.query(
      'select auto_prestart_processed_at, auto_prestart_outcome from event_settings where event_id = $1',
      [eventId]
    );

    expect(drawResult.rows[0].status).toBe('published');
    expect(drawResult.rows[0].published_at).toBeTruthy();
    expect(settingsResult.rows[0].auto_prestart_processed_at).toBeTruthy();
    expect(settingsResult.rows[0].auto_prestart_outcome).toBe('team_draw_published');

    const secondRun = await eventAutomationService.processDueAutoTeamDrawEvents({ now });
    expect(secondRun.processedCount).toBe(0);
    expect(secondRun.results.some(item => item.eventId === eventId)).toBe(false);
  });
});
