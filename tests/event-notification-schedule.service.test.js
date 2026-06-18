jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn()
}));

const { randomUUID } = require('crypto');

const pool = require('../src/config/db');
const { sendEmail } = require('../src/services/emailService');
const eventNotificationScheduleService = require('../src/services/eventNotificationScheduleService');

const HOUR_MS = 60 * 60 * 1000;

describe('Event notification schedule service', () => {
  const created = {
    users: [],
    teams: [],
    events: []
  };

  async function createUser(name, email) {
    const userId = randomUUID();
    created.users.push(userId);

    await pool.query(
      `
      insert into users (id, name, email, status, password_hash, created_at, updated_at)
      values ($1, $2, $3, 'active', 'not-used', now(), now())
      `,
      [userId, name, email]
    );

    return userId;
  }

  async function createTeam({ adminId }) {
    const teamId = randomUUID();
    created.teams.push(teamId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, 'Schedule FC', $2, 'active', now(), now())
      `,
      [teamId, adminId]
    );

    return teamId;
  }

  async function addMembership({ teamId, userId, role = 'member' }) {
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

  async function createEvent({
    teamId,
    adminId,
    title = 'Schedule meccs',
    startAt,
    status = 'published',
    notifyTeamOnCreate = true
  }) {
    const eventId = randomUUID();
    created.events.push(eventId);

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at,
        location_name, location_address, min_players, max_players, status,
        published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, $4, 'Schedule notification test', $5,
        'Schedule palya', '1111 Budapest, Schedule utca 1.', 5, 12, $6::text,
        case when $6::text = 'published' then now() else null end, now(), now()
      )
      `,
      [eventId, teamId, adminId, title, startAt, status]
    );

    await pool.query(
      `
      insert into event_settings (id, event_id, notification_preferences)
      values ($1, $2, $3::jsonb)
      `,
      [
        randomUUID(),
        eventId,
        JSON.stringify({ notifyTeamOnCreate })
      ]
    );

    return {
      id: eventId,
      status,
      start_at: startAt
    };
  }

  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ status: 'sent', messageId: 'scheduled-msg' });
    process.env.APP_BASE_URL = 'https://app.example.com';
  });

  afterEach(async () => {
    if (created.events.length > 0) {
      await pool.query(
        `delete from event_notification_schedules where event_id = any($1::uuid[])`,
        [created.events]
      );
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

  test('weekly series schedules later published events 163 hours before start', async () => {
    const adminId = await createUser('Schedule Captain', `schedule_captain_${randomUUID()}@example.com`);
    const teamId = await createTeam({ adminId });
    await addMembership({ teamId, userId: adminId, role: 'team_admin' });

    const firstStart = new Date('2026-07-01T13:00:00.000Z');
    const secondStart = new Date('2026-07-08T13:00:00.000Z');
    const thirdStart = new Date('2026-07-15T13:00:00.000Z');
    const now = new Date('2026-06-20T10:00:00.000Z');

    const first = await createEvent({ teamId, adminId, title: 'Heti 1', startAt: firstStart.toISOString() });
    const second = await createEvent({ teamId, adminId, title: 'Heti 2', startAt: secondStart.toISOString() });
    const third = await createEvent({ teamId, adminId, title: 'Heti 3', startAt: thirdStart.toISOString() });

    const result = await eventNotificationScheduleService.scheduleEventCreatedNotificationsForSeries({
      generatedEvents: [{ event: first }, { event: second }, { event: third }],
      recurrenceType: 'weekly',
      now
    });

    expect(result.scheduledCount).toBe(2);
    expect(result.skippedFirstEventId).toBe(first.id);

    const scheduleResult = await pool.query(
      `
      select event_id, scheduled_at, status
      from event_notification_schedules
      where event_id = any($1::uuid[])
      order by scheduled_at asc
      `,
      [[first.id, second.id, third.id]]
    );

    expect(scheduleResult.rows).toHaveLength(2);
    expect(scheduleResult.rows[0].event_id).toBe(second.id);
    expect(new Date(scheduleResult.rows[0].scheduled_at).toISOString())
      .toBe(new Date(secondStart.getTime() - 163 * HOUR_MS).toISOString());
    expect(scheduleResult.rows[1].event_id).toBe(third.id);
    expect(new Date(scheduleResult.rows[1].scheduled_at).toISOString())
      .toBe(new Date(thirdStart.getTime() - 163 * HOUR_MS).toISOString());
    expect(scheduleResult.rows.every(row => row.status === 'pending')).toBe(true);
  });

  test('biweekly or rarer series schedules later event 168 hours before start and draft is ignored', async () => {
    const adminId = await createUser('Biweekly Captain', `biweekly_captain_${randomUUID()}@example.com`);
    const teamId = await createTeam({ adminId });
    await addMembership({ teamId, userId: adminId, role: 'team_admin' });

    const firstStart = new Date('2026-07-01T13:00:00.000Z');
    const secondStart = new Date('2026-07-15T13:00:00.000Z');
    const first = await createEvent({ teamId, adminId, title: 'Biweekly 1', startAt: firstStart.toISOString() });
    const second = await createEvent({ teamId, adminId, title: 'Biweekly 2', startAt: secondStart.toISOString() });
    const draft = await createEvent({
      teamId,
      adminId,
      title: 'Biweekly draft',
      startAt: '2026-07-29T13:00:00.000Z',
      status: 'draft'
    });

    const result = await eventNotificationScheduleService.scheduleEventCreatedNotificationsForSeries({
      generatedEvents: [{ event: first }, { event: second }, { event: draft }],
      recurrenceType: 'biweekly',
      now: new Date('2026-06-20T10:00:00.000Z')
    });

    expect(result.scheduledCount).toBe(1);

    const scheduleResult = await pool.query(
      `
      select event_id, scheduled_at
      from event_notification_schedules
      where event_id = any($1::uuid[])
      `,
      [[first.id, second.id, draft.id]]
    );

    expect(scheduleResult.rows).toHaveLength(1);
    expect(scheduleResult.rows[0].event_id).toBe(second.id);
    expect(new Date(scheduleResult.rows[0].scheduled_at).toISOString())
      .toBe(new Date(secondStart.getTime() - 168 * HOUR_MS).toISOString());
  });

  test('due processor sends event-created email through existing notification service', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Due Captain', `due_captain_${runId}@example.com`);
    const memberId = await createUser('Due Member', `due_member_${runId}@example.com`);
    const teamId = await createTeam({ adminId });
    await addMembership({ teamId, userId: adminId, role: 'team_admin' });
    await addMembership({ teamId, userId: memberId });
    const event = await createEvent({
      teamId,
      adminId,
      title: 'Due meccs',
      startAt: '2026-07-08T13:00:00.000Z'
    });

    await pool.query(
      `
      insert into event_notification_schedules (event_id, notification_type, scheduled_at)
      values ($1, 'event_created', $2)
      `,
      [event.id, '2026-07-01T10:00:00.000Z']
    );

    const result = await eventNotificationScheduleService.processDueEventCreatedNotifications({
      now: new Date('2026-07-01T10:01:00.000Z')
    });

    expect(result.sentCount).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls.map(call => call[0].to).sort()).toEqual([
      `due_captain_${runId}@example.com`,
      `due_member_${runId}@example.com`
    ].sort());

    const scheduleResult = await pool.query(
      `select status, sent_at from event_notification_schedules where event_id = $1`,
      [event.id]
    );
    expect(scheduleResult.rows[0].status).toBe('sent');
    expect(scheduleResult.rows[0].sent_at).toBeTruthy();
  });

  test('due processor skips schedule when notifyTeamOnCreate is disabled', async () => {
    const adminId = await createUser('Silent Captain', `silent_captain_${randomUUID()}@example.com`);
    const teamId = await createTeam({ adminId });
    await addMembership({ teamId, userId: adminId, role: 'team_admin' });
    const event = await createEvent({
      teamId,
      adminId,
      title: 'Silent meccs',
      startAt: '2026-07-08T13:00:00.000Z',
      notifyTeamOnCreate: false
    });

    await pool.query(
      `
      insert into event_notification_schedules (event_id, notification_type, scheduled_at)
      values ($1, 'event_created', $2)
      `,
      [event.id, '2026-07-01T10:00:00.000Z']
    );

    const result = await eventNotificationScheduleService.processDueEventCreatedNotifications({
      now: new Date('2026-07-01T10:01:00.000Z')
    });

    expect(result.skippedCount).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();

    const scheduleResult = await pool.query(
      `select status, last_error from event_notification_schedules where event_id = $1`,
      [event.id]
    );
    expect(scheduleResult.rows[0].status).toBe('skipped');
    expect(scheduleResult.rows[0].last_error).toBe('notification_disabled');
  });
});
