jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn()
}));

const { randomUUID } = require('crypto');
const pool = require('../src/config/db');
const { sendEmail } = require('../src/services/emailService');
const eventNotificationService = require('../src/services/eventNotificationService');
const inviteService = require('../src/services/inviteService');

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
      await pool.query(`delete from team_invites where team_id = any($1::uuid[])`, [created.teams]);
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
    expect(payload.html).toContain('2026. 06. 12. 20:30');
    expect(payload.text).toContain('2026. 06. 12. 20:30');
    expect(payload.html).toContain('https://app.example.com/?teamId=');
    expect(payload.html).toContain('https://app.example.com/api/event-email-actions/');
    expect(payload.text).toContain('Belepes a feluletre: https://app.example.com/');
    expect(payload.text).toContain('Jelentkezem: https://app.example.com/api/event-email-actions/');
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
    expect(alreadyGoingPayload.html).not.toContain('Várólistára jelentkezem');
  });
});
