jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn()
}));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
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

  beforeAll(async () => {
    for (const fileName of [
      '2026-04-03_event_team_draw_status_machine.sql',
      '2026-06-29_email_delivery_logs.sql',
      '2026-06-29_email_delivery_batch_id.sql'
    ]) {
      const migrationSql = fs.readFileSync(
        path.join(__dirname, '..', 'db', 'migrations', fileName),
        'utf8'
      );
      await pool.query(migrationSql);
    }
  });

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
    notifyTeamOnCreate = true,
    notificationPreferences = null
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
      [randomUUID(), eventId, JSON.stringify(notificationPreferences || { notifyTeamOnCreate })]
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
      await pool.query(`delete from email_delivery_logs where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_team_draws where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_registrations where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_settings where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from events where id = any($1::uuid[])`, [created.events]);
    }

    if (created.teams.length > 0) {
      await pool.query(`delete from email_delivery_logs where team_id = any($1::uuid[])`, [created.teams]);
      await pool.query(`delete from team_members where team_id = any($1::uuid[])`, [created.teams]);
      await pool.query(`delete from teams where id = any($1::uuid[])`, [created.teams]);
    }

    if (created.users.length > 0) {
      await pool.query(`delete from email_delivery_logs where recipient_user_id = any($1::uuid[])`, [created.users]);
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

    const templatesRes = await request(app)
      .get(`/api/teams/${teamId}/admin-email/templates`)
      .set('Authorization', `Bearer ${token}`);

    expect(templatesRes.status).toBe(200);
    const templateKeys = templatesRes.body.templates.map(item => item.key);
    expect(templateKeys).toEqual(expect.arrayContaining([
      'event_created',
      'event_created_scheduled',
      'new_member_event_catchup',
      'team_draw_published',
      'event_updated',
      'event_cancelled',
      'weather_alert',
      'team_break_reminder'
    ]));
    expect(templateKeys).not.toContain('capacity_full');
    expect(templateKeys).not.toContain('new_registration');

    const previewRes = await request(app)
      .post(`/api/teams/${teamId}/admin-email/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template: 'event_created', eventId });

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.templateLabel).toBe('Uj esemeny');
    expect(previewRes.body.description).toBeTruthy();
    expect(previewRes.body.recipientsDescription).toBeTruthy();
    expect(previewRes.body.triggerDescription).toBeTruthy();
    expect(previewRes.body.contentDescription).toBeTruthy();
    expect(previewRes.body.sendability.sendable).toBe(true);
    expect(previewRes.body.expectedRecipientCount).toBe(2);
    expect(previewRes.body.excludedRecipientCount).toBe(2);
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

    const auditResult = await pool.query(
      `
      select recipient_email, status, metadata
      from email_delivery_logs
      where event_id = $1
        and template = 'event_created'
      order by recipient_email asc
      `,
      [eventId]
    );
    expect(auditResult.rows).toHaveLength(4);
    expect(auditResult.rows.filter(row => row.status === 'sent')).toHaveLength(2);
    expect(auditResult.rows.every(row => row.metadata.manualResend === true)).toBe(true);
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

  test('manual admin email rejects non-resendable and non-sendable templates', async () => {
    const adminEmail = `admin_template_reject_${randomUUID()}@example.com`;
    const adminId = await createUser({ name: 'Admin', email: adminEmail });
    const teamId = await createTeam({ adminId });
    await addMembership({ teamId, userId: adminId, role: 'team_admin' });
    const eventId = await createEvent({ teamId, adminId });
    const token = await login(adminEmail);

    const nonResendPreview = await request(app)
      .post(`/api/teams/${teamId}/admin-email/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template: 'capacity_full', eventId });
    expect(nonResendPreview.status).toBe(400);

    const eventUpdatedPreview = await request(app)
      .post(`/api/teams/${teamId}/admin-email/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template: 'event_updated', eventId });
    expect(eventUpdatedPreview.status).toBe(200);
    expect(eventUpdatedPreview.body.sendability.sendable).toBe(false);
    expect(eventUpdatedPreview.body.sendability.reasons.join(' ')).toContain('korabbi');

    const eventUpdatedSend = await request(app)
      .post(`/api/teams/${teamId}/admin-email/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template: 'event_updated', eventId });
    expect(eventUpdatedSend.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('team admin can manually resend published team draw email with audit metadata', async () => {
    const runId = randomUUID();
    const adminEmail = `draw_admin_${runId}@example.com`;
    const memberEmail = `draw_member_${runId}@example.com`;
    const adminId = await createUser({ name: 'Admin', email: adminEmail });
    const memberId = await createUser({ name: 'Member', email: memberEmail });
    const teamId = await createTeam({ adminId });
    await addMembership({ teamId, userId: adminId, role: 'team_admin' });
    await addMembership({ teamId, userId: memberId });
    const eventId = await createEvent({
      teamId,
      adminId,
      notificationPreferences: {
        notifyTeamOnCreate: true,
        notifyTeamDrawPublished: true
      }
    });

    await pool.query(
      `
      insert into event_registrations (
        id, event_id, team_id, user_id, registration_status, registered_at, created_at, updated_at
      )
      values
        ($1, $3, $4, $5, 'going', now(), now(), now()),
        ($2, $3, $4, $6, 'waiting_list', now(), now(), now())
      `,
      [randomUUID(), randomUUID(), eventId, teamId, adminId, memberId]
    );

    await pool.query(
      `
      insert into event_team_draws (
        event_id, team_a_json, team_b_json, totals_json, settings_json,
        within_tolerance, status, published_at, created_by_user_id, created_at, updated_at
      )
      values (
        $1, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
        true, 'published', now(), $2, now(), now()
      )
      `,
      [eventId, adminId]
    );

    const token = await login(adminEmail);
    const previewRes = await request(app)
      .post(`/api/teams/${teamId}/admin-email/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template: 'team_draw_published', eventId });

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.sendability.sendable).toBe(true);
    expect(previewRes.body.expectedRecipientCount).toBe(2);

    const sendRes = await request(app)
      .post(`/api/teams/${teamId}/admin-email/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ template: 'team_draw_published', eventId });

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.sentCount).toBe(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);

    const auditResult = await pool.query(
      `
      select recipient_email, status, metadata
      from email_delivery_logs
      where event_id = $1
        and template = 'team_draw_published'
      order by recipient_email asc
      `,
      [eventId]
    );
    expect(auditResult.rows).toHaveLength(2);
    expect(auditResult.rows.every(row => row.status === 'sent')).toBe(true);
    expect(auditResult.rows.every(row => row.metadata.manualResend === true)).toBe(true);
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
