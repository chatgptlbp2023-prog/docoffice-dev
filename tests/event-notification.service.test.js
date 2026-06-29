jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn()
}));

jest.mock('../src/services/weatherService', () => {
  const actual = jest.requireActual('../src/services/weatherService');
  return {
    ...actual,
    fetchEventWeatherForecast: jest.fn()
  };
});

const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');
const { sendEmail } = require('../src/services/emailService');
const { fetchEventWeatherForecast } = require('../src/services/weatherService');
const eventNotificationService = require('../src/services/eventNotificationService');
const inviteService = require('../src/services/inviteService');

describe('Event notification service', () => {
  const created = {
    users: [],
    teams: [],
    events: []
  };

  beforeAll(async () => {
    for (const fileName of ['2026-06-29_email_delivery_logs.sql', '2026-06-29_email_delivery_batch_id.sql']) {
      const migrationSql = fs.readFileSync(
        path.join(__dirname, '..', 'db', 'migrations', fileName),
        'utf8'
      );
      await pool.query(migrationSql);
    }
  });

  async function createUser(name, email) {
    const userId = randomUUID();
    created.users.push(userId);

    await pool.query(
      `
      insert into users (id, name, email, status, password_hash, created_at, updated_at)
      values ($1, $2, $3, 'active', $4, now(), now())
      `,
      [userId, name, email, 'not-used-in-this-test']
    );

    return userId;
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

  async function getEventEmailLogs(eventId) {
    return getTemplateEmailLogs(eventId, 'event_created');
  }

  async function getTemplateEmailLogs(eventId, template) {
    const result = await pool.query(
      `
      select
        recipient_user_id,
        recipient_email,
        template,
        status,
        reason,
        delivery_batch_id,
        provider_message_id,
        error_message,
        metadata
      from email_delivery_logs
      where event_id = $1
        and template = $2
      order by recipient_email asc, created_at asc
      `,
      [eventId, template]
    );

    return result.rows;
  }

  function expectSingleDeliveryBatch(logs) {
    expect(logs.length).toBeGreaterThan(0);
    const batchIds = [...new Set(logs.map(row => row.delivery_batch_id).filter(Boolean))];
    expect(batchIds).toHaveLength(1);
  }

  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ status: 'sent', messageId: 'msg-1' });
    fetchEventWeatherForecast.mockReset();
    process.env.APP_BASE_URL = 'https://app.example.com';
  });

  afterEach(async () => {
    if (created.events.length > 0) {
      await pool.query(`delete from email_delivery_logs where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_registrations where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_settings where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from events where id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_email_action_log where event_id = any($1::uuid[])`, [created.events]);
    }

    if (created.teams.length > 0) {
      await pool.query(`delete from email_delivery_logs where team_id = any($1::uuid[])`, [created.teams]);
      await pool.query(`delete from team_invites where team_id = any($1::uuid[])`, [created.teams]);
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

  test('uj esemeny levelben ott vannak a deep linkek es az akciogombok', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_${runId}@example.com`);
    const memberId = await createUser('Member', `member_${runId}@example.com`);
    const duplicateEmailMemberId = await createUser('Duplicate Email', `CAPTAIN_${runId}@example.com`);
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Gomb Teszt FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, memberId, 'member');
    await addMembership(teamId, duplicateEmailMemberId, 'member');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, location_address, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Csutortoki meccs', 'Email template teszt', '2026-06-12T18:30:00.000Z', 'BME palya', '1111 Budapest, Minta utca 1.', 5, 12, 'published', now(), now(), now()
      )
      `,
      [eventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, field_size, field_quality, surface_type, pricing_mode, fixed_price_per_person, per_player_fee, players_on_field_total, payment_notes, notification_preferences
      )
      values (
        $1, $2, '5+1', 'jo allapot', 'mufu', 'fixed_per_person', 1200, 200, 12, 'Keszpenz vagy utalas.', '{"notifyTeamOnCreate":true}'::jsonb
      )
      `,
      [randomUUID(), eventId]
    );

    const result = await eventNotificationService.notifyEventCreated({
      eventId,
      actorUserId: adminId
    });

    expect(result.sentCount).toBe(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);

    const payloads = sendEmail.mock.calls.map(call => call[0]);
    const recipients = payloads.map(payload => payload.to).sort();
    expect(recipients).toEqual([
      `captain_${runId}@example.com`,
      `member_${runId}@example.com`
    ].sort());

    const payload = payloads.find(item => item.to === `captain_${runId}@example.com`);
    expect(payload.html).toContain('Jelentkezem');
    expect(payload.html).toContain('Kihagyom');
    expect(payload.html).toContain('Belepes a feluletre');
    expect(payload.html).toContain('Esemeny megnyitasa');
    expect(payload.html).toContain('Szabin vagyok (1 hét)');
    expect(payload.html).toContain('1 hétig nem kapsz értesítéseket az eseményekről. Ha a csapatodban aktív a rangmodul, akkor nem veszítesz pozíciót.');
    expect(payload.html).toContain('Milyen palya');
    expect(payload.html).toContain('Mennyi penz');
    expect(payload.html).toContain('2026. 06. 12. 20:30');
    expect(payload.text).toContain('2026. 06. 12. 20:30');
    expect(payload.html).toContain('https://app.example.com/?teamId=');
    expect(payload.html).toContain('https://app.example.com/api/event-email-actions/');
    expect(payload.text).toContain('Belepes a feluletre: https://app.example.com/');
    expect(payload.text).toContain('Jelentkezem: https://app.example.com/api/event-email-actions/');
    expect(payload.text).toContain('Szabin vagyok (1 hét): https://app.example.com/api/event-email-actions/');
    const auditLogs = await getEventEmailLogs(eventId);
    expect(auditLogs).toHaveLength(2);
    expect(auditLogs.map(row => row.status)).toEqual(['sent', 'sent']);
    expect(auditLogs.map(row => row.recipient_email).sort()).toEqual(recipients);
    expect(auditLogs.every(row => row.provider_message_id === 'msg-1')).toBe(true);
  });

  test('uj esemeny email nem megy ki szabadsagon levo csapattagnak', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_break_${runId}@example.com`);
    const memberId = await createUser('Member', `member_break_${runId}@example.com`);
    const breakMemberId = await createUser('Break Member', `break_member_${runId}@example.com`);
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Szabi FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, memberId, 'member');
    await addMembership(teamId, breakMemberId, 'member');

    await pool.query(
      `
      update team_members
      set break_started_at = now() - interval '1 day',
          break_until = now() + interval '6 days',
          break_extensions_count = 1
      where team_id = $1
        and user_id = $2
      `,
      [teamId, breakMemberId]
    );

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, location_address, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Szabis meccs', 'Szabi email teszt', now() + interval '2 days', 'Szabi palya', '1111 Budapest, Szabi utca 1.', 5, 12, 'published', now(), now(), now()
      )
      `,
      [eventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, notification_preferences
      )
      values (
        $1, $2, '{"notifyTeamOnCreate":true}'::jsonb
      )
      `,
      [randomUUID(), eventId]
    );

    const result = await eventNotificationService.notifyEventCreated({
      eventId,
      actorUserId: adminId
    });

    expect(result.sentCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    const recipients = sendEmail.mock.calls.map(call => call[0].to).sort();
    expect(recipients).toEqual([
      `captain_break_${runId}@example.com`,
      `member_break_${runId}@example.com`
    ].sort());
    expect(recipients).not.toContain(`break_member_${runId}@example.com`);

    const auditLogs = await getEventEmailLogs(eventId);
    expect(auditLogs).toHaveLength(3);
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        recipient_email: `break_member_${runId}@example.com`,
        status: 'skipped',
        reason: 'on_break'
      }),
      expect.objectContaining({
        recipient_email: `captain_break_${runId}@example.com`,
        status: 'sent'
      }),
      expect.objectContaining({
        recipient_email: `member_break_${runId}@example.com`,
        status: 'sent'
      })
    ]));
  });

  test('uj esemeny email nem megy ki passziv csapattagnak', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_passive_${runId}@example.com`);
    const memberId = await createUser('Member', `member_passive_${runId}@example.com`);
    const passiveMemberId = await createUser('Passive Member', `passive_member_${runId}@example.com`);
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Passziv FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, memberId, 'member');
    await addMembership(teamId, passiveMemberId, 'member');

    await pool.query(
      `
      update team_members
      set passive_since = now() - interval '1 day',
          passive_reason = 'test_passive'
      where team_id = $1
        and user_id = $2
      `,
      [teamId, passiveMemberId]
    );

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, location_address, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Passziv szures meccs', 'Passziv email teszt', now() + interval '2 days', 'Passziv palya', '1111 Budapest, Passziv utca 1.', 5, 12, 'published', now(), now(), now()
      )
      `,
      [eventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, notification_preferences
      )
      values (
        $1, $2, '{"notifyTeamOnCreate":true}'::jsonb
      )
      `,
      [randomUUID(), eventId]
    );

    const result = await eventNotificationService.notifyEventCreated({
      eventId,
      actorUserId: adminId
    });

    expect(result.sentCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    const recipients = sendEmail.mock.calls.map(call => call[0].to).sort();
    expect(recipients).toEqual([
      `captain_passive_${runId}@example.com`,
      `member_passive_${runId}@example.com`
    ].sort());
    expect(recipients).not.toContain(`passive_member_${runId}@example.com`);

    const auditLogs = await getEventEmailLogs(eventId);
    expect(auditLogs).toHaveLength(3);
    expect(auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        recipient_email: `passive_member_${runId}@example.com`,
        status: 'skipped',
        reason: 'passive'
      }),
      expect.objectContaining({
        recipient_email: `captain_passive_${runId}@example.com`,
        status: 'sent'
      }),
      expect.objectContaining({
        recipient_email: `member_passive_${runId}@example.com`,
        status: 'sent'
      })
    ]));
  });

  test('uj esemeny email draft vagy kikapcsolt notifyTeamOnCreate mellett nem megy ki', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_disabled_${runId}@example.com`);
    const memberId = await createUser('Member', `member_disabled_${runId}@example.com`);
    const teamId = randomUUID();
    const draftEventId = randomUUID();
    const disabledEventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(draftEventId, disabledEventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Csendes FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, memberId, 'member');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, location_address, min_players, max_players, status, published_at, created_at, updated_at
      )
      values
        ($1, $3, $4, 'Draft meccs', 'Draft email teszt', now() + interval '1 day', 'Draft palya', '1111 Budapest, Draft utca 1.', 5, 12, 'draft', null, now(), now()),
        ($2, $3, $4, 'Csendes meccs', 'Notify off teszt', now() + interval '2 days', 'Csendes palya', '1111 Budapest, Csendes utca 1.', 5, 12, 'published', now(), now(), now())
      `,
      [draftEventId, disabledEventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, notification_preferences
      )
      values (
        $1, $2, '{"notifyTeamOnCreate":false}'::jsonb
      )
      `,
      [randomUUID(), disabledEventId]
    );

    const draftResult = await eventNotificationService.notifyEventCreated({
      eventId: draftEventId,
      actorUserId: adminId
    });
    const disabledResult = await eventNotificationService.notifyEventCreated({
      eventId: disabledEventId,
      actorUserId: adminId
    });

    expect(draftResult).toBeNull();
    expect(disabledResult).toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();

    const draftSentLogs = await pool.query(
      `
      select count(*)::int as count
      from email_delivery_logs
      where event_id = $1
        and template = 'event_created'
        and status = 'sent'
      `,
      [draftEventId]
    );
    const disabledSentLogs = await pool.query(
      `
      select count(*)::int as count
      from email_delivery_logs
      where event_id = $1
        and template = 'event_created'
        and status = 'sent'
      `,
      [disabledEventId]
    );

    expect(draftSentLogs.rows[0].count).toBe(0);
    expect(disabledSentLogs.rows[0].count).toBe(0);
    expect(await getEventEmailLogs(draftEventId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'skipped', reason: 'event_not_published' })
    ]));
    expect(await getEventEmailLogs(disabledEventId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'skipped', reason: 'notification_disabled' })
    ]));
  });

  test('uj esemeny email kuldesi hiba failed audit logot keszit', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_failed_${runId}@example.com`);
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    sendEmail.mockRejectedValueOnce(new Error('SMTP timeout'));

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Failed Email FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, location_address, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Hibas email meccs', 'Email hiba teszt', now() + interval '2 days', 'Hiba palya', '1111 Budapest, Hiba utca 1.', 5, 12, 'published', now(), now(), now()
      )
      `,
      [eventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, notification_preferences
      )
      values (
        $1, $2, '{"notifyTeamOnCreate":true}'::jsonb
      )
      `,
      [randomUUID(), eventId]
    );

    const result = await eventNotificationService.notifyEventCreated({
      eventId,
      actorUserId: adminId
    });

    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(1);

    const auditLogs = await getEventEmailLogs(eventId);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toEqual(expect.objectContaining({
      recipient_email: `captain_failed_${runId}@example.com`,
      status: 'failed',
      error_message: 'SMTP timeout'
    }));
  });

  test('ujonnan csatlakozo tag catch-up emailt kap a kozelgo esemenyekrol', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_catchup_${runId}@example.com`);
    const newMemberId = await createUser('Late Member', `late_member_${runId}@example.com`);
    const teamId = randomUUID();
    const pastEventId = randomUUID();
    const disabledEventId = randomUUID();
    const enabledEventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(pastEventId, disabledEventId, enabledEventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Catchup FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, newMemberId, 'member');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, location_address, min_players, max_players, status, published_at, created_at, updated_at
      )
      values
        ($1, $4, $5, 'Regi meccs', 'Mar nem relevans', now() - interval '1 day', 'Regi palya', '1111 Budapest, Regi utca 1.', 5, 12, 'published', now(), now(), now()),
        ($2, $4, $5, 'Csendes meccs', 'Ertesites kikapcsolva', now() + interval '1 day', 'Csendes palya', '1111 Budapest, Csendes utca 1.', 5, 12, 'published', now(), now(), now()),
        ($3, $4, $5, 'Szombati catchup', 'Uj tag ertesites teszt', now() + interval '2 days', 'Uj palya', '1111 Budapest, Uj utca 1.', 5, 12, 'published', now(), now(), now())
      `,
      [pastEventId, disabledEventId, enabledEventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, field_size, field_quality, surface_type, pricing_mode, fixed_price_per_person, notification_preferences
      )
      values
        ($1, $3, '5+1', 'jo allapot', 'mufu', 'fixed_per_person', 1400, '{"notifyTeamOnCreate":false}'::jsonb),
        ($2, $4, '5+1', 'jo allapot', 'mufu', 'fixed_per_person', 1400, '{"notifyTeamOnCreate":true}'::jsonb)
      `,
      [randomUUID(), randomUUID(), disabledEventId, enabledEventId]
    );

    const result = await eventNotificationService.notifyNewMemberUpcomingEvents({
      teamId,
      userId: newMemberId
    });

    expect(result.eventCount).toBe(2);
    expect(result.sentCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const payload = sendEmail.mock.calls[0][0];
    expect(payload.to).toBe(`late_member_${runId}@example.com`);
    expect(payload.html).toContain('Szombati catchup');
    expect(payload.html).toContain('Jelentkezem');
    expect(payload.html).toContain('Kihagyom');
    expect(payload.text).toContain('Esemeny: Szombati catchup');

    const auditLogs = await getTemplateEmailLogs(enabledEventId, 'new_member_event_catchup');
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toEqual(expect.objectContaining({
      recipient_user_id: newMemberId,
      recipient_email: `late_member_${runId}@example.com`,
      template: 'new_member_event_catchup',
      status: 'sent',
      provider_message_id: 'msg-1'
    }));
    expect(auditLogs[0].metadata).toEqual(expect.objectContaining({
      catchupUserId: newMemberId
    }));
    expectSingleDeliveryBatch(auditLogs);
  });

  test('meghivo elfogadasakor a kesobb csatlakozo tag megkapja a mar letezo esemeny emailjet', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_invite_catchup_${runId}@example.com`);
    const newMemberEmail = `invite_late_member_${runId}@example.com`;
    const newMemberId = await createUser('Invite Late Member', newMemberEmail);
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Invite Catchup FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, location_address, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Meghivo utani meccs', 'Invite catchup teszt', now() + interval '3 days', 'Teszt palya', '1111 Budapest, Teszt utca 1.', 5, 12, 'published', now(), now(), now()
      )
      `,
      [eventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, pricing_mode, fixed_price_per_person, notification_preferences
      )
      values (
        $1, $2, 'fixed_per_person', 1600, '{"notifyTeamOnCreate":true}'::jsonb
      )
      `,
      [randomUUID(), eventId]
    );

    const inviteResult = await inviteService.createInvite({
      teamId,
      invitedByUserId: adminId,
      email: newMemberEmail,
      role: 'member'
    });

    const result = await inviteService.acceptInviteToken({
      inviteToken: inviteResult.invite.invite_token,
      userId: newMemberId,
      email: newMemberEmail
    });

    expect(result.member.team_id).toBe(teamId);
    expect(result.eventCatchupDelivery.sentCount).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const payload = sendEmail.mock.calls[0][0];
    expect(payload.to).toBe(newMemberEmail);
    expect(payload.html).toContain('Meghivo utani meccs');
    expect(payload.html).toContain('Jelentkezem');

    const auditLogs = await getTemplateEmailLogs(eventId, 'new_member_event_catchup');
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toEqual(expect.objectContaining({
      recipient_user_id: newMemberId,
      recipient_email: newMemberEmail,
      template: 'new_member_event_catchup',
      status: 'sent',
      provider_message_id: 'msg-1'
    }));
    expectSingleDeliveryBatch(auditLogs);
  });

  test('uj jelentkezo level tartalmazza a mar jelentkezettek nevsorat', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_notify_${runId}@example.com`);
    const firstMemberId = await createUser('Anna', `anna_notify_${runId}@example.com`);
    const secondMemberId = await createUser('Bela', `bela_notify_${runId}@example.com`);
    const registrantId = await createUser('Csaba', `csaba_notify_${runId}@example.com`);
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Ertesites FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, firstMemberId, 'member');
    await addMembership(teamId, secondMemberId, 'member');
    await addMembership(teamId, registrantId, 'member');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, location_address, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Penteki meccs', 'Jelentkezesi email teszt', '2026-06-19T18:30:00.000Z', 'Teskand palya', '1117 Budapest, Pelda koz 2.', 5, 12, 'published', now(), now(), now()
      )
      `,
      [eventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, notification_preferences
      )
      values (
        $1, $2, '{"notifyAllOnNewRegistration":true}'::jsonb
      )
      `,
      [randomUUID(), eventId]
    );

    await pool.query(
      `
      insert into event_registrations (
        id, event_id, team_id, user_id, registration_status, registered_at, created_at, updated_at
      )
      values
        ($1, $4, $5, $6, 'going', now() - interval '10 minutes', now(), now()),
        ($2, $4, $5, $7, 'waiting_list', now() - interval '8 minutes', now(), now()),
        ($3, $4, $5, $8, 'going', now() - interval '2 minutes', now(), now())
      `,
      [randomUUID(), randomUUID(), randomUUID(), eventId, teamId, firstMemberId, secondMemberId, registrantId]
    );

    const result = await eventNotificationService.notifyRegistrationActivity({
      eventId,
      actorUserId: registrantId,
      registrationStatus: 'going',
      includeNewRegistrationNotification: true
    });

    expect(result.newRegistration.sentCount).toBeGreaterThan(0);
    const sentPayloads = sendEmail.mock.calls.map(call => call[0]);
    expect(sentPayloads.some(payload => payload.html.includes('Mar jelentkeztek:'))).toBe(true);
    expect(sentPayloads.some(payload => payload.html.includes('Anna, Bela, Csaba'))).toBe(true);
    expect(sentPayloads.some(payload => payload.text.includes('Mar jelentkeztek: Anna, Bela, Csaba'))).toBe(true);

    const auditLogs = await getTemplateEmailLogs(eventId, 'new_registration');
    expect(auditLogs).toHaveLength(3);
    expect(auditLogs.map(row => row.recipient_email).sort()).toEqual([
      `anna_notify_${runId}@example.com`,
      `bela_notify_${runId}@example.com`,
      `captain_notify_${runId}@example.com`
    ].sort());
    expect(auditLogs.every(row => row.status === 'sent')).toBe(true);
    expect(auditLogs.every(row => row.template === 'new_registration')).toBe(true);
    expect(auditLogs[0].metadata).toEqual(expect.objectContaining({
      actorUserId: registrantId,
      registrationStatus: 'going'
    }));
    expectSingleDeliveryBatch(auditLogs);
  });

  test('bulk rendszer-email kuldesi hiba failed audit sort keszit', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_bulk_fail_${runId}@example.com`);
    const memberId = await createUser('Anna', `anna_bulk_fail_${runId}@example.com`);
    const registrantId = await createUser('Csaba', `csaba_bulk_fail_${runId}@example.com`);
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Bulk Fail FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, memberId, 'member');
    await addMembership(teamId, registrantId, 'member');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, location_address, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Bulk fail meccs', 'Audit hiba teszt', now() + interval '2 days', 'Teszt palya', '1111 Budapest, Pelda utca 1.', 5, 12, 'published', now(), now(), now()
      )
      `,
      [eventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, notification_preferences
      )
      values (
        $1, $2, '{"notifyAllOnNewRegistration":true}'::jsonb
      )
      `,
      [randomUUID(), eventId]
    );

    await pool.query(
      `
      insert into event_registrations (
        id, event_id, team_id, user_id, registration_status, registered_at, created_at, updated_at
      )
      values ($1, $2, $3, $4, 'going', now(), now(), now())
      `,
      [randomUUID(), eventId, teamId, registrantId]
    );

    sendEmail.mockRejectedValueOnce(new Error('Bulk SMTP timeout'));

    const result = await eventNotificationService.notifyRegistrationActivity({
      eventId,
      actorUserId: registrantId,
      registrationStatus: 'going',
      includeNewRegistrationNotification: true
    });

    expect(result.newRegistration.sentCount).toBe(1);
    expect(result.newRegistration.failedCount).toBe(1);

    const auditLogs = await getTemplateEmailLogs(eventId, 'new_registration');
    expect(auditLogs).toHaveLength(2);
    expect(auditLogs.map(row => row.status).sort()).toEqual(['failed', 'sent']);
    expect(auditLogs.find(row => row.status === 'failed')).toEqual(expect.objectContaining({
      error_message: 'Bulk SMTP timeout'
    }));
    expect(auditLogs.find(row => row.status === 'sent')).toEqual(expect.objectContaining({
      provider_message_id: 'msg-1'
    }));
    expectSingleDeliveryBatch(auditLogs);
  });

  test('mar csak ket hely emailt csak a meg nem reagalt aktiv tagok kapnak', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_two_left_${runId}@example.com`);
    const actorId = await createUser('Actor', `actor_two_left_${runId}@example.com`);
    const goingId = await createUser('Going', `going_two_left_${runId}@example.com`);
    const waitingId = await createUser('Waiting', `waiting_two_left_${runId}@example.com`);
    const rankWaitingId = await createUser('Rank Waiting', `rank_waiting_two_left_${runId}@example.com`);
    const skipActionId = await createUser('Skip Action', `skip_action_two_left_${runId}@example.com`);
    const vacationActionId = await createUser('Vacation Action', `vacation_action_two_left_${runId}@example.com`);
    const breakId = await createUser('Break', `break_two_left_${runId}@example.com`);
    const passiveId = await createUser('Passive', `passive_two_left_${runId}@example.com`);
    const targetId = await createUser('Target', `target_two_left_${runId}@example.com`);
    const duplicateTargetId = await createUser('Duplicate Target', `TARGET_TWO_LEFT_${runId}@example.com`);
    const otherEventActionId = await createUser('Other Event Action', `other_action_two_left_${runId}@example.com`);
    const teamId = randomUUID();
    const eventId = randomUUID();
    const otherEventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId, otherEventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Ket Hely FC', adminId]
    );

    for (const userId of [
      adminId,
      actorId,
      goingId,
      waitingId,
      rankWaitingId,
      skipActionId,
      vacationActionId,
      breakId,
      passiveId,
      targetId,
      duplicateTargetId,
      otherEventActionId
    ]) {
      await addMembership(teamId, userId, userId === adminId ? 'team_admin' : 'member');
    }

    await pool.query(
      `
      update team_members
      set break_started_at = now() - interval '1 day',
          break_until = now() + interval '6 days',
          break_extensions_count = 1
      where team_id = $1
        and user_id = $2
      `,
      [teamId, breakId]
    );

    await pool.query(
      `
      update team_members
      set passive_since = now() - interval '1 day',
          passive_reason = 'teszt passziv'
      where team_id = $1
        and user_id = $2
      `,
      [teamId, passiveId]
    );

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, location_address, min_players, max_players, status, published_at, created_at, updated_at
      )
      values
        ($1, $3, $4, 'Ket helyes meccs', 'Ket hely email teszt', now() + interval '2 days', 'Teszt palya', '1111 Budapest, Pelda utca 1.', 4, 4, 'published', now(), now(), now()),
        ($2, $3, $4, 'Masik action esemeny', 'Masik event', now() + interval '3 days', 'Teszt palya', '1111 Budapest, Pelda utca 1.', 4, 4, 'published', now(), now(), now())
      `,
      [eventId, otherEventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, notification_preferences
      )
      values (
        $1, $2, '{"notifyAllWhenTwoSpotsLeft":true,"notifyAllOnNewRegistration":false,"notifyAllWhenFull":false}'::jsonb
      )
      `,
      [randomUUID(), eventId]
    );

    await pool.query(
      `
      insert into event_registrations (
        id, event_id, team_id, user_id, registration_status, registered_at, created_at, updated_at
      )
      values
        ($1, $5, $6, $7, 'going', now() - interval '12 minutes', now(), now()),
        ($2, $5, $6, $8, 'going', now() - interval '10 minutes', now(), now()),
        ($3, $5, $6, $9, 'waiting_list', now() - interval '6 minutes', now(), now()),
        ($4, $5, $6, $10, 'waiting_list_rank', now() - interval '5 minutes', now(), now())
      `,
      [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        eventId,
        teamId,
        actorId,
        goingId,
        waitingId,
        rankWaitingId
      ]
    );

    await pool.query(
      `
      insert into event_email_action_log (
        id, event_id, team_id, user_id, action, status, message, metadata, acted_at, created_at
      )
      values
        ($1, $4, $5, $6, 'skip', 'recorded_for_rank', 'Kihagyas rogzitve', '{}'::jsonb, now() - interval '4 minutes', now() - interval '4 minutes'),
        ($2, $4, $5, $7, 'vacation_one_week', 'break_started', 'Szabi rogzitve', '{}'::jsonb, now() - interval '3 minutes', now() - interval '3 minutes'),
        ($3, $8, $5, $9, 'skip', 'recorded_for_rank', 'Masik event skip', '{}'::jsonb, now() - interval '2 minutes', now() - interval '2 minutes')
      `,
      [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        eventId,
        teamId,
        skipActionId,
        vacationActionId,
        otherEventId,
        otherEventActionId
      ]
    );

    const result = await eventNotificationService.notifyRegistrationActivity({
      eventId,
      actorUserId: actorId,
      registrationStatus: 'going',
      includeNewRegistrationNotification: false,
      includeCapacityNotifications: true
    });

    expect(result.twoSpotsLeft.sentCount).toBe(3);
    expect(sendEmail).toHaveBeenCalledTimes(3);

    const recipients = sendEmail.mock.calls.map(call => call[0].to).sort();
    expect(recipients).toEqual([
      `captain_two_left_${runId}@example.com`,
      `other_action_two_left_${runId}@example.com`,
      `target_two_left_${runId}@example.com`
    ].sort());
    expect(recipients).not.toContain(`actor_two_left_${runId}@example.com`);
    expect(recipients).not.toContain(`going_two_left_${runId}@example.com`);
    expect(recipients).not.toContain(`waiting_two_left_${runId}@example.com`);
    expect(recipients).not.toContain(`rank_waiting_two_left_${runId}@example.com`);
    expect(recipients).not.toContain(`skip_action_two_left_${runId}@example.com`);
    expect(recipients).not.toContain(`vacation_action_two_left_${runId}@example.com`);
    expect(recipients).not.toContain(`break_two_left_${runId}@example.com`);
    expect(recipients).not.toContain(`passive_two_left_${runId}@example.com`);
    expect(recipients.filter(email => email === `target_two_left_${runId}@example.com`)).toHaveLength(1);

    const sentPayloads = sendEmail.mock.calls.map(call => call[0]);
    expect(sentPayloads.every(payload => payload.subject.includes('Mar csak 2 hely maradt'))).toBe(true);

    const auditLogs = await getTemplateEmailLogs(eventId, 'capacity_two_spots_left');
    expect(auditLogs).toHaveLength(3);
    expect(auditLogs.map(row => row.recipient_email).sort()).toEqual(recipients.sort());
    expect(auditLogs.every(row => row.status === 'sent')).toBe(true);
    expect(auditLogs.every(row => row.template === 'capacity_two_spots_left')).toBe(true);
    expect(auditLogs[0].metadata).toEqual(expect.objectContaining({
      spotsLeft: 2
    }));
    expectSingleDeliveryBatch(auditLogs);
  });

  test('resztvevoi rendszer-email sablonok audit naploba kerulnek', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_system_${runId}@example.com`);
    const firstMemberId = await createUser('Anna', `anna_system_${runId}@example.com`);
    const secondMemberId = await createUser('Bela', `bela_system_${runId}@example.com`);
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'System Email FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, firstMemberId, 'member');
    await addMembership(teamId, secondMemberId, 'member');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, location_address, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Rendszer email meccs', 'Audit teszt', now() + interval '3 days', 'System palya', '1111 Budapest, Pelda utca 1.', 4, 12, 'published', now(), now(), now()
      )
      `,
      [eventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, notification_preferences
      )
      values (
        $1, $2, '{"notifyParticipantsOnEventUpdate":true,"notifyParticipantsOnEventCancel":true,"notifyTeamDrawPublished":true,"notifyWeatherAlerts":true}'::jsonb
      )
      `,
      [randomUUID(), eventId]
    );

    await pool.query(
      `
      insert into event_registrations (
        id, event_id, team_id, user_id, registration_status, registered_at, cancelled_at, created_at, updated_at
      )
      values
        ($1, $4, $5, $6, 'going', now() - interval '20 minutes', null, now(), now()),
        ($2, $4, $5, $7, 'waiting_list', now() - interval '10 minutes', null, now(), now()),
        ($3, $4, $5, $8, 'cancelled', now() - interval '5 minutes', now() - interval '4 minutes', now(), now())
      `,
      [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        eventId,
        teamId,
        firstMemberId,
        secondMemberId,
        adminId
      ]
    );

    await eventNotificationService.notifyEventUpdated({
      eventId,
      previousEvent: {
        start_at: '2026-01-01T10:00:00.000Z',
        location_name: 'Regi palya',
        location_address: '1111 Budapest, Regi utca 1.'
      }
    });
    await eventNotificationService.notifyEventCancelled({ eventId });
    await eventNotificationService.notifyTeamDrawPublished({ eventId, automated: true });

    fetchEventWeatherForecast.mockResolvedValueOnce({
      weatherCode: 12,
      weatherLabel: 'Eso',
      locationLabel: 'System palya',
      temperature: 12,
      precipitationProbability: 85,
      windSpeed: 12
    });
    await eventNotificationService.notifyWeatherAlert({ eventId });

    const activeRecipientEmails = [
      `anna_system_${runId}@example.com`,
      `bela_system_${runId}@example.com`
    ].sort();
    const cancelRecipientEmails = [
      `anna_system_${runId}@example.com`,
      `bela_system_${runId}@example.com`,
      `captain_system_${runId}@example.com`
    ].sort();

    for (const template of ['event_updated', 'team_draw_published', 'weather_alert']) {
      const auditLogs = await getTemplateEmailLogs(eventId, template);
      expect(auditLogs).toHaveLength(2);
      expect(auditLogs.map(row => row.recipient_email).sort()).toEqual(activeRecipientEmails);
      expect(auditLogs.every(row => row.status === 'sent')).toBe(true);
      expect(auditLogs.every(row => row.template === template)).toBe(true);
      expectSingleDeliveryBatch(auditLogs);
    }

    const cancelAuditLogs = await getTemplateEmailLogs(eventId, 'event_cancelled');
    expect(cancelAuditLogs).toHaveLength(3);
    expect(cancelAuditLogs.map(row => row.recipient_email).sort()).toEqual(cancelRecipientEmails);
    expect(cancelAuditLogs.every(row => row.status === 'sent')).toBe(true);
    expect(cancelAuditLogs.every(row => row.template === 'event_cancelled')).toBe(true);
    expectSingleDeliveryBatch(cancelAuditLogs);
  });

  test('varolistarol bekerulo jatekos emailje audit naploba kerul', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_waitlist_${runId}@example.com`);
    const promotedId = await createUser('Promoted', `promoted_waitlist_${runId}@example.com`);
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Waitlist FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, promotedId, 'member');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, location_address, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Varolista meccs', 'Varolista email teszt', now() + interval '2 days', 'Teszt palya', '1111 Budapest, Pelda utca 1.', 4, 8, 'published', now(), now(), now()
      )
      `,
      [eventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, notification_preferences
      )
      values (
        $1, $2, '{"notifyWaitlistPromotion":true}'::jsonb
      )
      `,
      [randomUUID(), eventId]
    );

    await pool.query(
      `
      insert into event_registrations (
        id, event_id, team_id, user_id, registration_status, promoted_at, registered_at, created_at, updated_at
      )
      values (
        $1, $2, $3, $4, 'going', now(), now() - interval '10 minutes', now(), now()
      )
      `,
      [randomUUID(), eventId, teamId, promotedId]
    );

    const result = await eventNotificationService.notifyRegistrationActivity({
      eventId,
      promotedUserId: promotedId,
      includeNewRegistrationNotification: false,
      includeCapacityNotifications: false
    });

    expect(result.waitlistPromotion.sentCount).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toEqual(expect.objectContaining({
      to: `promoted_waitlist_${runId}@example.com`
    }));

    const auditLogs = await getTemplateEmailLogs(eventId, 'waitlist_promotion');
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toEqual(expect.objectContaining({
      recipient_user_id: promotedId,
      recipient_email: `promoted_waitlist_${runId}@example.com`,
      template: 'waitlist_promotion',
      status: 'sent',
      provider_message_id: 'msg-1'
    }));
    expect(auditLogs[0].metadata).toEqual(expect.objectContaining({
      promotedUserId: promotedId
    }));
    expectSingleDeliveryBatch(auditLogs);
  });

  test('betelt esemeny email a nem jelentkezett csapattagot varolistara osztonzi', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_full_${runId}@example.com`);
    const firstMemberId = await createUser('Anna', `anna_full_${runId}@example.com`);
    const registrantId = await createUser('Csaba', `csaba_full_${runId}@example.com`);
    const notRegisteredId = await createUser('Dani', `dani_full_${runId}@example.com`);
    const teamId = randomUUID();
    const eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Betelt FC', adminId]
    );

    await addMembership(teamId, adminId, 'team_admin');
    await addMembership(teamId, firstMemberId, 'member');
    await addMembership(teamId, registrantId, 'member');
    await addMembership(teamId, notRegisteredId, 'member');

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, description, start_at, location_name, location_address, min_players, max_players, status, published_at, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Tengo', 'Betelt email teszt', '2026-06-03T09:00:00.000Z', 'Teszt palya', '1046 budapest Oceanarok 23', 2, 2, 'published', now(), now(), now()
      )
      `,
      [eventId, teamId, adminId]
    );

    await pool.query(
      `
      insert into event_settings (
        id, event_id, notification_preferences
      )
      values (
        $1, $2, '{"notifyAllWhenFull":true}'::jsonb
      )
      `,
      [randomUUID(), eventId]
    );

    await pool.query(
      `
      insert into event_registrations (
        id, event_id, team_id, user_id, registration_status, registered_at, created_at, updated_at
      )
      values
        ($1, $3, $4, $5, 'going', now() - interval '10 minutes', now(), now()),
        ($2, $3, $4, $6, 'going', now() - interval '2 minutes', now(), now())
      `,
      [randomUUID(), randomUUID(), eventId, teamId, firstMemberId, registrantId]
    );

    const result = await eventNotificationService.notifyRegistrationActivity({
      eventId,
      actorUserId: registrantId,
      registrationStatus: 'going',
      includeNewRegistrationNotification: false
    });

    expect(result.full.sentCount).toBe(3);
    const sentPayloads = sendEmail.mock.calls.map(call => call[0]);
    const waitlistPayload = sentPayloads.find(payload => payload.to === `dani_full_${runId}@example.com`);
    const alreadyGoingPayload = sentPayloads.find(payload => payload.to === `anna_full_${runId}@example.com`);

    expect(waitlistPayload).toBeTruthy();
    expect(waitlistPayload.subject).toContain('Betelt az esemeny: Tengo');
    expect(waitlistPayload.text).toContain('Az esemény most betelt, de ne maradj le!');
    expect(waitlistPayload.html).toContain('Várólistára jelentkezem');
    expect(waitlistPayload.html).toContain('https://app.example.com/api/event-email-actions/');
    expect(alreadyGoingPayload).toBeTruthy();
    const auditLogs = await getTemplateEmailLogs(eventId, 'capacity_full');
    expect(auditLogs).toHaveLength(3);
    expect(auditLogs.map(row => row.recipient_email).sort()).toEqual([
      `anna_full_${runId}@example.com`,
      `captain_full_${runId}@example.com`,
      `dani_full_${runId}@example.com`
    ].sort());
    expect(auditLogs.every(row => row.status === 'sent')).toBe(true);
    expect(auditLogs.every(row => row.template === 'capacity_full')).toBe(true);
    expect(auditLogs[0].metadata).toEqual(expect.objectContaining({
      spotsLeft: 0
    }));
    expectSingleDeliveryBatch(auditLogs);
    expect(alreadyGoingPayload.html).not.toContain('Várólistára jelentkezem');
  });
});
