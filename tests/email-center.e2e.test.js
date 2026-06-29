const request = require('supertest');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('Admin email center', () => {
  const password = 'teszt123';
  const created = {
    users: [],
    teams: [],
    events: []
  };

  beforeAll(async () => {
    const migrations = [
      '2026-06-18_event_notification_schedules.sql',
      '2026-06-29_email_delivery_logs.sql',
      '2026-06-29_email_delivery_batch_id.sql'
    ];

    for (const fileName of migrations) {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', fileName), 'utf8');
      await pool.query(sql);
    }

    await pool.query(`
      create table if not exists event_email_action_log (
        id uuid primary key default gen_random_uuid(),
        event_id uuid not null references events(id) on delete cascade,
        team_id uuid not null references teams(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        action text not null,
        status text not null,
        message text null,
        token_jti text null,
        metadata jsonb not null default '{}'::jsonb,
        acted_at timestamptz not null default now(),
        created_at timestamptz not null default now()
      );

      create index if not exists event_email_action_log_event_idx
        on event_email_action_log(event_id, acted_at desc);

      create index if not exists event_email_action_log_user_idx
        on event_email_action_log(user_id, acted_at desc);
    `);
  });

  async function createUser({ name, email }) {
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    created.users.push(userId);

    await pool.query(
      `
      insert into users (id, name, email, status, password_hash, created_at, updated_at)
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

  async function createTeam({ adminId, name = 'Email Center FC' }) {
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

  async function createEvent({ teamId, adminId, title = 'Email center meccs' }) {
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
        $1, $2, $3, $4, 'Email center test', now() + interval '3 days',
        'Center palya', '1111 Budapest, Center utca 1.', 5, 12, 'published',
        now(), now(), now()
      )
      `,
      [eventId, teamId, adminId, title]
    );

    return eventId;
  }

  afterEach(async () => {
    if (created.events.length > 0) {
      await pool.query(`delete from event_email_action_log where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from email_delivery_logs where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_notification_schedules where event_id = any($1::uuid[])`, [created.events]);
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

  test('team admin sees schedules, aggregated logs and recipient details', async () => {
    const runId = randomUUID();
    const adminEmail = `email_center_admin_${runId}@example.com`;
    const memberEmail = `email_center_member_${runId}@example.com`;
    const skippedEmail = `email_center_skipped_${runId}@example.com`;
    const failedEmail = `email_center_failed_${runId}@example.com`;
    const adminId = await createUser({ name: 'Admin', email: adminEmail });
    const memberId = await createUser({ name: 'Member', email: memberEmail });
    const skippedId = await createUser({ name: 'Skipped', email: skippedEmail });
    const failedId = await createUser({ name: 'Failed', email: failedEmail });
    const teamId = await createTeam({ adminId });
    const eventId = await createEvent({ teamId, adminId });
    const otherActionEventId = await createEvent({ teamId, adminId, title: 'Other action event' });
    const batchId = randomUUID();
    const capacityBatchId = randomUUID();

    await addMembership({ teamId, userId: adminId, role: 'team_admin' });
    await addMembership({ teamId, userId: memberId });
    await addMembership({ teamId, userId: skippedId });
    await addMembership({ teamId, userId: failedId });

    await pool.query(
      `
      insert into event_notification_schedules (event_id, notification_type, scheduled_at, status)
      values ($1, 'event_created', now() + interval '1 hour', 'pending')
      `,
      [eventId]
    );

    await pool.query(
      `
      insert into email_delivery_logs (
        team_id, event_id, delivery_batch_id, recipient_user_id, recipient_email,
        template, status, reason, provider_message_id, error_message, metadata
      )
      values
        ($1, $2, $3, $4, $5, 'event_created', 'sent', null, 'provider-1', null, '{}'::jsonb),
        ($1, $2, $3, $6, $7, 'event_created', 'skipped', 'on_break', null, null, '{}'::jsonb),
        ($1, $2, $3, $8, $9, 'event_created', 'failed', null, null, 'SMTP timeout', '{}'::jsonb)
      `,
      [teamId, eventId, batchId, memberId, memberEmail, skippedId, skippedEmail, failedId, failedEmail]
    );

    await pool.query(
      `
      insert into email_delivery_logs (
        team_id, event_id, delivery_batch_id, recipient_user_id, recipient_email,
        template, status, provider_message_id, metadata
      )
      values (
        $1, $2, $3, $4, $5, 'capacity_full', 'sent', 'provider-capacity-1', '{}'::jsonb
      )
      `,
      [teamId, eventId, capacityBatchId, memberId, memberEmail]
    );

    await pool.query(
      `
      insert into event_email_action_log (
        event_id, team_id, user_id, action, status, message, metadata, acted_at, created_at
      )
      values
        ($1, $2, $3, 'skip', 'recorded_for_rank', 'Kihagyas rogzitve', '{"source":"email_center_test"}'::jsonb, now() - interval '1 minute', now() - interval '1 minute'),
        ($4, $2, $5, 'register', 'ok', 'Masik esemeny action', '{}'::jsonb, now(), now())
      `,
      [eventId, teamId, memberId, otherActionEventId, failedId]
    );

    const token = await login(adminEmail);

    const schedulesRes = await request(app)
      .get(`/api/teams/${teamId}/email-center/schedules`)
      .set('Authorization', `Bearer ${token}`);
    expect(schedulesRes.status).toBe(200);
    expect(schedulesRes.body.schedules).toHaveLength(1);
    expect(schedulesRes.body.schedules[0]).toEqual(expect.objectContaining({
      template: 'event_created',
      event_id: eventId,
      status: 'pending',
      expected_recipient_count: 4
    }));

    const logsRes = await request(app)
      .get(`/api/teams/${teamId}/email-center/logs`)
      .set('Authorization', `Bearer ${token}`);
    expect(logsRes.status).toBe(200);
    expect(logsRes.body.logs).toHaveLength(2);
    const eventCreatedLog = logsRes.body.logs.find(row => row.template === 'event_created');
    const capacityLog = logsRes.body.logs.find(row => row.template === 'capacity_full');
    expect(eventCreatedLog).toEqual(expect.objectContaining({
      group_id: batchId,
      template: 'event_created',
      event_id: eventId,
      sent_count: 1,
      skipped_count: 1,
      failed_count: 1,
      total_count: 3,
      action_count: 1,
      skip_action_count: 1
    }));
    expect(capacityLog).toEqual(expect.objectContaining({
      group_id: capacityBatchId,
      template: 'capacity_full',
      event_id: eventId,
      sent_count: 1,
      total_count: 1
    }));

    const recipientsRes = await request(app)
      .get(`/api/teams/${teamId}/email-center/logs/${eventCreatedLog.group_id}/recipients`)
      .set('Authorization', `Bearer ${token}`);
    expect(recipientsRes.status).toBe(200);
    expect(recipientsRes.body.recipients).toEqual(expect.arrayContaining([
      expect.objectContaining({
        recipient_email: memberEmail,
        recipient_name: 'Member',
        status: 'sent',
        provider_message_id: 'provider-1',
        action_type: 'skip',
        action_status: 'recorded_for_rank',
        action_message: 'Kihagyas rogzitve'
      }),
      expect.objectContaining({
        recipient_email: skippedEmail,
        status: 'skipped',
        reason: 'on_break'
      }),
      expect.objectContaining({
        recipient_email: failedEmail,
        status: 'failed',
        error_message: 'SMTP timeout',
        action_type: null
      })
    ]));
  });

  test('normal member cannot access email center endpoints', async () => {
    const adminId = await createUser({ name: 'Admin', email: `email_center_forbidden_admin_${randomUUID()}@example.com` });
    const memberEmail = `email_center_forbidden_member_${randomUUID()}@example.com`;
    const memberId = await createUser({ name: 'Member', email: memberEmail });
    const teamId = await createTeam({ adminId });
    await addMembership({ teamId, userId: adminId, role: 'team_admin' });
    await addMembership({ teamId, userId: memberId });
    const memberToken = await login(memberEmail);

    const res = await request(app)
      .get(`/api/teams/${teamId}/email-center/logs`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
  });

  test('team admin cannot see another team email logs', async () => {
    const adminEmail = `email_center_scope_admin_${randomUUID()}@example.com`;
    const adminId = await createUser({ name: 'Admin', email: adminEmail });
    const teamId = await createTeam({ adminId, name: 'Own FC' });
    const otherTeamId = await createTeam({ adminId, name: 'Other FC' });
    const eventId = await createEvent({ teamId, adminId, title: 'Own event' });
    const otherEventId = await createEvent({ teamId: otherTeamId, adminId, title: 'Other event' });
    await addMembership({ teamId, userId: adminId, role: 'team_admin' });
    await addMembership({ teamId: otherTeamId, userId: adminId, role: 'team_admin' });

    await pool.query(
      `
      insert into email_delivery_logs (
        team_id, event_id, delivery_batch_id, recipient_user_id, recipient_email,
        template, status, metadata
      )
      values
        ($1, $2, $3, $4, $5, 'event_created', 'sent', '{}'::jsonb),
        ($6, $7, $8, $4, $5, 'event_created', 'sent', '{}'::jsonb)
      `,
      [
        teamId,
        eventId,
        randomUUID(),
        adminId,
        adminEmail,
        otherTeamId,
        otherEventId,
        randomUUID()
      ]
    );

    const token = await login(adminEmail);
    const res = await request(app)
      .get(`/api/teams/${teamId}/email-center/logs`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].event_id).toBe(eventId);
  });
});
