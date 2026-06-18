jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn()
}));

const { randomUUID } = require('crypto');

const pool = require('../src/config/db');
const { sendEmail } = require('../src/services/emailService');
const teamBreakReminderService = require('../src/services/teamBreakReminderService');
const {
  TEAM_BREAK_EMAIL_ACTIONS,
  buildTeamBreakActionToken,
  executeTeamBreakActionToken
} = require('../src/services/teamBreakActionService');

describe('Team break reminder lifecycle service', () => {
  const created = {
    users: [],
    teams: [],
    events: []
  };

  async function createUser(name, emailPrefix) {
    const id = randomUUID();
    created.users.push(id);

    await pool.query(
      `
      insert into users (id, name, email, status, password_hash, created_at, updated_at)
      values ($1, $2, $3, 'active', 'not-used', now(), now())
      `,
      [id, name, `${emailPrefix}_${Date.now()}_${Math.random().toString(16).slice(2)}@example.com`]
    );

    return id;
  }

  async function createTeamWithMember({ memberName = 'Break Member' } = {}) {
    const adminId = await createUser('Captain', 'break_captain');
    const memberId = await createUser(memberName, 'break_member');
    const teamId = randomUUID();
    created.teams.push(teamId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, 'Szabi Reminder FC', $2, 'active', now(), now())
      `,
      [teamId, adminId]
    );

    await pool.query(
      `
      insert into team_members (
        id, team_id, user_id, role, membership_status, joined_at, created_at, updated_at
      )
      values
        ($1, $3, $4, 'team_admin', 'active', now() - interval '30 days', now(), now()),
        ($2, $3, $5, 'member', 'active', now() - interval '30 days', now(), now())
      `,
      [randomUUID(), randomUUID(), teamId, adminId, memberId]
    );

    return { teamId, adminId, memberId };
  }

  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ status: 'sent', messageId: 'break-msg-1' });
    process.env.APP_BASE_URL = 'https://app.example.com';
  });

  afterEach(async () => {
    if (created.events.length > 0) {
      await pool.query('delete from event_email_action_log where event_id = any($1::uuid[])', [created.events]);
      await pool.query('delete from event_registrations where event_id = any($1::uuid[])', [created.events]);
      await pool.query('delete from event_settings where event_id = any($1::uuid[])', [created.events]);
      await pool.query('delete from events where id = any($1::uuid[])', [created.events]);
    }

    if (created.teams.length > 0) {
      await pool.query('delete from team_break_action_log where team_id = any($1::uuid[])', [created.teams]);
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

  test('lejaro szabi eseten emlekezteto emailt kuld es idempotensen jeloli a ciklust', async () => {
    const now = new Date('2035-01-01T10:00:00.000Z');
    const { teamId, memberId } = await createTeamWithMember();

    await pool.query(
      `
      update team_members
      set break_started_at = $3::timestamptz - interval '7 days',
          break_until = $3::timestamptz + interval '12 hours',
          break_extensions_count = 1,
          break_reminder_sent_at = null
      where team_id = $1
        and user_id = $2
      `,
      [teamId, memberId, now.toISOString()]
    );

    const result = await teamBreakReminderService.sendDueBreakReminders({ now });

    expect(result.dueCount).toBe(1);
    expect(result.sentCount).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const payload = sendEmail.mock.calls[0][0];
    expect(payload.subject).toBe('Még mindig szabin vagy?');
    expect(payload.text).toContain('Maradok szabin még 1 hétig');
    expect(payload.text).toContain('Visszatérek aktívnak');
    expect(payload.html).toContain('/api/team-break-actions/');

    const memberResult = await pool.query(
      `
      select break_reminder_sent_at
      from team_members
      where team_id = $1
        and user_id = $2
      `,
      [teamId, memberId]
    );
    expect(memberResult.rows[0].break_reminder_sent_at).toBeTruthy();

    sendEmail.mockClear();
    const secondRun = await teamBreakReminderService.sendDueBreakReminders({ now });
    expect(secondRun.dueCount).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('email action hosszabbit, max negyig enged, majd visszaterest is kezel', async () => {
    const { teamId, memberId } = await createTeamWithMember();

    await pool.query(
      `
      update team_members
      set break_started_at = now() - interval '7 days',
          break_until = now() + interval '1 hour',
          break_extensions_count = 3,
          break_reminder_sent_at = now()
      where team_id = $1
        and user_id = $2
      `,
      [teamId, memberId]
    );

    const extendToken = buildTeamBreakActionToken({
      teamId,
      userId: memberId,
      action: TEAM_BREAK_EMAIL_ACTIONS.EXTEND_ONE_WEEK
    });
    const extendResult = await executeTeamBreakActionToken(extendToken);
    expect(extendResult.ok).toBe(true);
    expect(extendResult.member.break_extensions_count).toBe(4);
    expect(extendResult.member.break_reminder_sent_at).toBeNull();

    const blockedToken = buildTeamBreakActionToken({
      teamId,
      userId: memberId,
      action: TEAM_BREAK_EMAIL_ACTIONS.EXTEND_ONE_WEEK
    });
    await expect(executeTeamBreakActionToken(blockedToken)).rejects.toThrow('Elérted a 4 hetes szabi limitet');

    const endToken = buildTeamBreakActionToken({
      teamId,
      userId: memberId,
      action: TEAM_BREAK_EMAIL_ACTIONS.END_BREAK
    });
    const endResult = await executeTeamBreakActionToken(endToken);
    expect(endResult.ok).toBe(true);
    expect(endResult.member.break_until).toBeNull();
    expect(endResult.member.break_started_at).toBeNull();
    expect(endResult.member.break_extensions_count).toBe(0);
  });

  test('ot relevans nem reagalas passzivva tesz, de szabi alatti esemenyek nem szamitanak', async () => {
    const now = new Date('2035-01-20T10:00:00.000Z');
    const { teamId, adminId, memberId } = await createTeamWithMember();
    const breakMemberId = await createUser('Break Protected', 'break_protected');

    await pool.query(
      `
      insert into team_members (
        id, team_id, user_id, role, membership_status,
        joined_at, break_started_at, break_until, break_extensions_count, created_at, updated_at
      )
      values ($1, $2, $3, 'member', 'active', $4::timestamptz - interval '30 days', $4::timestamptz - interval '20 days', $4::timestamptz + interval '1 day', 1, now(), now())
      `,
      [randomUUID(), teamId, breakMemberId, now.toISOString()]
    );

    for (let index = 0; index < 5; index += 1) {
      const eventId = randomUUID();
      created.events.push(eventId);
      await pool.query(
        `
        insert into events (
          id, team_id, created_by_user_id, title, start_at, location_name,
          min_players, max_players, status, published_at, created_at, updated_at
        )
        values (
          $1, $2, $3, $4, $5::timestamptz, 'Teszt pálya',
          5, 12, 'published', $6::timestamptz, $6::timestamptz, $6::timestamptz
        )
        `,
        [
          eventId,
          teamId,
          adminId,
          `Nem reagált meccs ${index + 1}`,
          new Date(now.getTime() - (index + 1) * 24 * 60 * 60 * 1000).toISOString(),
          new Date(now.getTime() - (index + 2) * 24 * 60 * 60 * 1000).toISOString()
        ]
      );

      await pool.query(
        `
        insert into event_registrations (
          id, event_id, user_id, team_id, registration_status, registered_at, created_at, updated_at
        )
        values ($1, $2, $3, $4, 'going', now(), now(), now())
        `,
        [randomUUID(), eventId, adminId, teamId]
      );
    }

    const result = await teamBreakReminderService.markPassiveMembersByNonResponse({
      teamId,
      now,
      threshold: 5
    });

    expect(result.passiveCount).toBe(1);
    expect(result.members[0].user_id).toBe(memberId);

    const rows = await pool.query(
      `
      select user_id, passive_since
      from team_members
      where team_id = $1
        and user_id = any($2::uuid[])
      order by user_id
      `,
      [teamId, [memberId, breakMemberId]]
    );
    const byUser = new Map(rows.rows.map(row => [row.user_id, row]));
    expect(byUser.get(memberId).passive_since).toBeTruthy();
    expect(byUser.get(breakMemberId).passive_since).toBeNull();
  });
});
