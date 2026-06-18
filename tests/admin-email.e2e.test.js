jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn()
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');
const { sendEmail } = require('../src/services/emailService');

describe('Admin manual email send', () => {
  const password = 'teszt123';
  const created = {
    users: [],
    teams: [],
    events: []
  };

  async function createUser({ name, email }) {
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    created.users.push(userId);

    await pool.query(
      `
      insert into users (
        id, name, email, status, password_hash, created_at, updated_at
      )
      values ($1, $2, $3, 'active', $4, now(), now())
      `,
      [userId, name, email, passwordHash]
    );

    return userId;
  }

  async function login(email) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(res.status).toBe(200);
    return res.body.token;
  }

  async function createTeam({ adminId, name = 'Admin Email FC' }) {
    const teamId = randomUUID();
    created.teams.push(teamId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, name, adminId]
    );

    return teamId;
  }

  async function addMembership({ teamId, userId, role = 'member', extras = '' }) {
    await pool.query(
      `
      insert into team_members (
        id, team_id, user_id, role, membership_status,
        joined_at, created_at, updated_at
        ${extras ? ', ' + extras.split('=').map(item => item.trim())[0] : ''}
      )
      values (
        $1, $2, $3, $4, 'active',
        now(), now(), now()
        ${extras ? ', ' + extras.split('=').slice(1).join('=').trim() : ''}
      )
      `,
      [randomUUID(), teamId, userId, role]
    );
  }

  async function createEvent({
    teamId,
    adminId,
    title = 'Manual email meccs',
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
        $1, $2, $3, $4, 'Manual email test', now() + interval '3 days',
        'Manual palya', '1111 Budapest, Manual utca 1.', 5, 12, $5::text,
        case when $5::text = 'published' then now() else null end, now(), now()
      )
      `,
      [eventId, teamId, adminId, title, status]
    );

    await pool.query(
      `
      insert into event_settings (id, event_id, notification_preferences)
      values ($1, $2, $3::jsonb)
      `,
      [randomUUID(), eventId, JSON.stringify({ notifyTeamOnCreate })]
    );

    return eventId;
  }

  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ status: 'sent', messageId: 'admin-email-msg' });
    process.env.APP_BASE_URL = 'https://app.example.com';
  });

  afterEach(async () => {
    if (created.events.length > 0) {
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

  test('team admin can preview and resend event-created email without break or passive members', async () => {
    const runId = randomUUID();
    const adminEmail = `admin_email_admin_${runId}@example.com`;
    const memberEmail = `admin_email_member_${runId}@example.com`;
    const breakEmail = `admin_email_break_${runId}@example.com`;
    const passiveEmail = `admin_email_passive_${runId}@example.com`;
    const adminId = await createUser({ name: 'Admin', email: adminEmail });
    const memberId = await createUser({ name: 'Member', email: memberEmail });
    const breakMemberId = await createUser({ name: 'Break', email: breakEmail });
    const passiveMemberId = await createUser({ name: 'Passive', email: passiveEmail });
    const teamId = await createTeam({ adminId });
    await addMembership({ teamId, userId: adminId, role: 'team_admin' });
    await addMembership({ teamId, userId: memberId });
    await addMembership({ teamId, userId: breakMemberId });
    await addMembership({ teamId, userId: passiveMemberId });

    await pool.query(
      `
      update team_members
      set break_started_at = now() - interval '1 day',
          break_until = now() + interval '6 days',
          break_extensions_count = 1
      where team_id = $1 and user_id = $2
      `,
      [teamId, breakMemberId]
    );

    await pool.query(
      `
      update team_members
      set passive_since = now() - interval '1 day',
          passive_reason = 'test'
      where team_id = $1 and user_id = $2
      `,
      [teamId, passiveMemberId]
    );

    const eventId = await createEvent({ teamId, adminId });
    const token = await login(adminEmail);

    const previewRes = await request(app)
      .post(`/api/teams/${teamId}/admin-email/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template: 'event_created', eventId });

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.recipientSummary.recipientCount).toBe(2);
    expect(previewRes.body.recipientSummary.excludedBreakCount).toBe(1);
    expect(previewRes.body.recipientSummary.excludedPassiveCount).toBe(1);

    const sendRes = await request(app)
      .post(`/api/teams/${teamId}/admin-email/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template: 'event_created', eventId });

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.sentCount).toBe(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const recipients = sendEmail.mock.calls.map(call => call[0].to).sort();
    expect(recipients).toEqual([adminEmail, memberEmail].sort());
    expect(recipients).not.toContain(breakEmail);
    expect(recipients).not.toContain(passiveEmail);
  });

  test('normal member cannot use manual admin email endpoint', async () => {
    const adminId = await createUser({ name: 'Admin', email: `member_forbidden_admin_${randomUUID()}@example.com` });
    const memberEmail = `member_forbidden_${randomUUID()}@example.com`;
    const memberId = await createUser({ name: 'Member', email: memberEmail });
    const teamId = await createTeam({ adminId });
    await addMembership({ teamId, userId: adminId, role: 'team_admin' });
    await addMembership({ teamId, userId: memberId });
    const eventId = await createEvent({ teamId, adminId });
    const memberToken = await login(memberEmail);

    const res = await request(app)
      .post(`/api/teams/${teamId}/admin-email/send`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ template: 'event_created', eventId });

    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('manual admin email rejects foreign, draft and notification-disabled events', async () => {
    const adminEmail = `admin_reject_${randomUUID()}@example.com`;
    const adminId = await createUser({ name: 'Admin', email: adminEmail });
    const teamId = await createTeam({ adminId, name: 'Own FC' });
    const otherTeamId = await createTeam({ adminId, name: 'Other FC' });
    await addMembership({ teamId, userId: adminId, role: 'team_admin' });
    await addMembership({ teamId: otherTeamId, userId: adminId, role: 'team_admin' });
    const foreignEventId = await createEvent({ teamId: otherTeamId, adminId });
    const draftEventId = await createEvent({ teamId, adminId, status: 'draft' });
    const disabledEventId = await createEvent({ teamId, adminId, notifyTeamOnCreate: false });
    const token = await login(adminEmail);

    const foreignRes = await request(app)
      .post(`/api/teams/${teamId}/admin-email/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template: 'event_created', eventId: foreignEventId });
    expect(foreignRes.status).toBe(404);

    const draftRes = await request(app)
      .post(`/api/teams/${teamId}/admin-email/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template: 'event_created', eventId: draftEventId });
    expect(draftRes.status).toBe(400);

    const disabledRes = await request(app)
      .post(`/api/teams/${teamId}/admin-email/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template: 'event_created', eventId: disabledEventId });
    expect(disabledRes.status).toBe(400);

    expect(sendEmail).not.toHaveBeenCalled();
  });
});

