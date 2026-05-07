jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn()
}));

const { randomUUID } = require('crypto');
const pool = require('../src/config/db');
const { sendEmail } = require('../src/services/emailService');
const eventNotificationService = require('../src/services/eventNotificationService');

describe('Event notification service', () => {
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

  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ status: 'sent', messageId: 'msg-1' });
    process.env.APP_BASE_URL = 'https://app.example.com';
  });

  afterEach(async () => {
    if (created.events.length > 0) {
      await pool.query(`delete from event_registrations where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_settings where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from events where id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_email_action_log where event_id = any($1::uuid[])`, [created.events]);
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

  test('uj esemeny levelben ott vannak a deep linkek es az akciogombok', async () => {
    const runId = randomUUID();
    const adminId = await createUser('Captain', `captain_${runId}@example.com`);
    const memberId = await createUser('Member', `member_${runId}@example.com`);
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

    expect(result.sentCount).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const payload = sendEmail.mock.calls[0][0];
    expect(payload.to).toBe(`member_${runId}@example.com`);
    expect(payload.html).toContain('Jelentkezem');
    expect(payload.html).toContain('Kihagyom');
    expect(payload.html).toContain('Belepes a feluletre');
    expect(payload.html).toContain('Esemeny megnyitasa');
    expect(payload.html).toContain('Milyen palya');
    expect(payload.html).toContain('Mennyi penz');
    expect(payload.html).toContain('https://app.example.com/?teamId=');
    expect(payload.html).toContain('https://app.example.com/api/event-email-actions/');
    expect(payload.text).toContain('Belepes a feluletre: https://app.example.com/');
    expect(payload.text).toContain('Jelentkezem: https://app.example.com/api/event-email-actions/');
  });
});
