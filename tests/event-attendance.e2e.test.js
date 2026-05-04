const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('Event attendance / no-show E2E', () => {
  const password = 'teszt123';

  let teamAdminUserId;
  let teamManagerUserId;
  let memberAUserId;
  let memberBUserId;
  let teamId;

  let teamAdminEmail;
  let teamManagerEmail;
  let memberAEmail;
  let memberBEmail;

  let teamAdminToken;
  let teamManagerToken;
  let memberAToken;
  let memberBToken;

  const created = {
    events: [],
    teams: [],
    users: []
  };

  async function createUser({ name, email }) {
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    created.users.push(id);

    await pool.query(
      `
      insert into users (
        id, name, email, status, password_hash, created_at, updated_at
      )
      values ($1, $2, $3, 'active', $4, now(), now())
      `,
      [id, name, email, passwordHash]
    );

    return id;
  }

  async function login(email) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(res.status).toBe(200);
    return res.body.token;
  }

  async function addMembership(userId, role) {
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

  beforeEach(async () => {
    const unique = randomUUID();
    teamAdminEmail = `team_admin_att_${unique}@example.com`;
    teamManagerEmail = `team_manager_att_${unique}@example.com`;
    memberAEmail = `member_a_att_${unique}@example.com`;
    memberBEmail = `member_b_att_${unique}@example.com`;

    teamAdminUserId = await createUser({
      name: 'Captain Attendance',
      email: teamAdminEmail
    });

    teamManagerUserId = await createUser({
      name: 'Manager Attendance',
      email: teamManagerEmail
    });

    memberAUserId = await createUser({
      name: 'Member Attendance A',
      email: memberAEmail
    });

    memberBUserId = await createUser({
      name: 'Member Attendance B',
      email: memberBEmail
    });

    teamId = randomUUID();
    created.teams.push(teamId);

    await pool.query(
      `
      insert into teams (
        id, name, created_by_user_id, status, created_at, updated_at
      )
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Attendance Teszt FC', teamAdminUserId]
    );

    await addMembership(teamAdminUserId, 'team_admin');
    await addMembership(teamManagerUserId, 'team_manager');
    await addMembership(memberAUserId, 'member');
    await addMembership(memberBUserId, 'member');

    teamAdminToken = await login(teamAdminEmail);
    teamManagerToken = await login(teamManagerEmail);
    memberAToken = await login(memberAEmail);
    memberBToken = await login(memberBEmail);
  });

  afterEach(async () => {
    if (created.events.length > 0) {
      await pool.query(`delete from event_financial_entries where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_attendance_marks where event_id = any($1::uuid[])`, [created.events]);
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

    created.events.length = 0;
    created.teams.length = 0;
    created.users.length = 0;
  });

  async function createPublishedEvent(overrides = {}) {
    const createEventRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({
        title: 'Attendance Event',
        description: 'No-show teszt',
        startAt: '2026-05-10T18:00:00.000Z',
        locationName: 'Teszt palya',
        minPlayers: 2,
        playersOnFieldTotal: 2,
        substitutesEnabled: false,
        initialStatus: 'published',
        ...overrides
      });

    expect(createEventRes.status).toBe(201);
    const eventId = createEventRes.body.event.id;
    created.events.push(eventId);
    return eventId;
  }

  test('team_manager can mark a going player as no-show on a realized event before manual closure', async () => {
    const eventId = await createPublishedEvent();

    const regARes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(regARes.status).toBe(201);

    await pool.query(
      `update events set start_at = now() - interval '2 hour', updated_at = now() where id = $1`,
      [eventId]
    );

    const markRes = await request(app)
      .post(`/api/events/${eventId}/attendance/${memberAUserId}`)
      .set('Authorization', `Bearer ${teamManagerToken}`)
      .send({ status: 'no_show', note: 'Nem jelent meg.' });

    expect(markRes.status).toBe(200);
    expect(markRes.body.attendance.status).toBe('no_show');
    expect(markRes.body.summary.no_show_count).toBe(1);

    const detailRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.summary.attendanceSummary.noShowCount).toBe(1);
    expect(detailRes.body.registrations.going[0].attendance_status).toBe('no_show');

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.attendance_stats.no_show_count).toBe(1);
    expect(meRes.body.user.attendance_stats.present_count).toBe(0);

    const teamRes = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`);

    expect(teamRes.status).toBe(200);
    const memberA = teamRes.body.members.find(item => item.user_id === memberAUserId);
    expect(memberA.attendance_stats.no_show_count).toBe(1);
    expect(memberA.attendance_stats.marked_count).toBe(1);

    await pool.query(
      `
      update teams
      set rank_module_enabled = true,
          updated_at = now()
      where id = $1
      `,
      [teamId]
    );

    await pool.query(
      `
      update team_members
      set rank_status = 'ranked',
          rank_value = 6,
          joined_at = now() - interval '7 day',
          updated_at = now()
      where team_id = $1
        and user_id = $2
      `,
      [teamId, memberAUserId]
    );

    const teamResAfterRank = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`);

    expect(teamResAfterRank.status).toBe(200);
    const rankedMemberA = teamResAfterRank.body.members.find(item => item.user_id === memberAUserId);
    expect(rankedMemberA.rank_snapshot.stats.evaluatedEvents).toBe(1);
    expect(rankedMemberA.rank_snapshot.stats.attendedEvents).toBe(0);
    expect(rankedMemberA.rank_snapshot.stats.missedEvents).toBe(1);
    expect(rankedMemberA.rank_snapshot.stats.participationRatio).toBe(0);
  });

  test('no-show cannot be marked on non-finished event or for cancelled member', async () => {
    const eventId = await createPublishedEvent();

    const regARes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);
    expect(regARes.status).toBe(201);

    const activeMarkRes = await request(app)
      .post(`/api/events/${eventId}/attendance/${memberAUserId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ status: 'no_show' });

    expect(activeMarkRes.status).toBe(400);
    expect(activeMarkRes.body.message).toMatch(/megvalosult esemenynel/i);

    const cancelRes = await request(app)
      .post(`/api/events/${eventId}/cancel`)
      .set('Authorization', `Bearer ${memberAToken}`);
    expect(cancelRes.status).toBe(200);

    await pool.query(
      `update events set start_at = now() - interval '2 hour', updated_at = now() where id = $1`,
      [eventId]
    );

    const cancelledMarkRes = await request(app)
      .post(`/api/events/${eventId}/attendance/${memberAUserId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ status: 'no_show' });

    expect(cancelledMarkRes.status).toBe(400);
    expect(cancelledMarkRes.body.message).toMatch(/going statuszu/i);
  });

  test('present attendance can store payment amount and returns it in event detail', async () => {
    const eventId = await createPublishedEvent();

    const regARes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);
    expect(regARes.status).toBe(201);

    await pool.query(
      `update events set start_at = now() - interval '2 hour', updated_at = now() where id = $1`,
      [eventId]
    );

    const markRes = await request(app)
      .post(`/api/events/${eventId}/attendance/${memberAUserId}`)
      .set('Authorization', `Bearer ${teamManagerToken}`)
      .send({ status: 'present', paymentAmount: 1400 });

    expect(markRes.status).toBe(200);
    expect(markRes.body.attendance.status).toBe('present');
    expect(markRes.body.attendance.payment_amount).toBe(1400);
    expect(markRes.body.summary.total_paid_amount).toBe(1400);

    const detailRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.summary.attendanceSummary.totalPaidAmount).toBe(1400);
    expect(detailRes.body.registrations.going[0].attendance_payment_amount).toBe(1400);
  });

  test('past published event can be marked immediately but stays published until explicit closing', async () => {
    const eventId = await createPublishedEvent();

    const regARes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);
    expect(regARes.status).toBe(201);

    await pool.query(
      `update events set start_at = now() - interval '2 hour', updated_at = now() where id = $1`,
      [eventId]
    );

    const markRes = await request(app)
      .post(`/api/events/${eventId}/attendance/${memberAUserId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ status: 'present', paymentAmount: 1300 });

    expect(markRes.status).toBe(200);
    expect(markRes.body.attendance.status).toBe('present');

    const detailRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.event.status).toBe('published');
    expect(detailRes.body.summary.attendanceSummary.presentCount).toBe(1);
    expect(detailRes.body.summary.attendanceSummary.totalPaidAmount).toBe(1300);

    const finishRes = await request(app)
      .patch(`/api/events/${eventId}/status`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ status: 'finished' });

    expect(finishRes.status).toBe(200);

    const closedDetailRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`);

    expect(closedDetailRes.status).toBe(200);
    expect(closedDetailRes.body.event.status).toBe('finished');
  });

  test('event cannot be closed until every going player has attendance marked', async () => {
    const eventId = await createPublishedEvent();

    const regARes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);
    expect(regARes.status).toBe(201);

    const regBRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberBToken}`);
    expect(regBRes.status).toBe(201);

    await pool.query(
      `update events set start_at = now() - interval '2 hour', updated_at = now() where id = $1`,
      [eventId]
    );

    const partialMarkRes = await request(app)
      .post(`/api/events/${eventId}/attendance/${memberAUserId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ status: 'present', paymentAmount: 1300 });
    expect(partialMarkRes.status).toBe(200);

    const earlyFinishRes = await request(app)
      .patch(`/api/events/${eventId}/status`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ status: 'finished' });

    expect(earlyFinishRes.status).toBe(400);
    expect(earlyFinishRes.body.message).toContain('minden going játékos');

    const secondMarkRes = await request(app)
      .post(`/api/events/${eventId}/attendance/${memberBUserId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ status: 'no_show' });
    expect(secondMarkRes.status).toBe(200);

    const finishRes = await request(app)
      .patch(`/api/events/${eventId}/status`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ status: 'finished' });

    expect(finishRes.status).toBe(200);
  });

  test('finance ledger carries over overpayment to the next event and updates team balance', async () => {
    const financeEventPayload = {
      pricingMode: 'fixed_per_person',
      fixedPricePerPerson: 1200,
      perPlayerFee: 100
    };
    const firstEventId = await createPublishedEvent(financeEventPayload);
    const secondEventId = await createPublishedEvent(financeEventPayload);

    const regFirstRes = await request(app)
      .post(`/api/events/${firstEventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);
    expect(regFirstRes.status).toBe(201);

    const regSecondRes = await request(app)
      .post(`/api/events/${secondEventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);
    expect(regSecondRes.status).toBe(201);

    await pool.query(
      `update events set start_at = now() - interval '3 day', updated_at = now() where id = $1`,
      [firstEventId]
    );
    await pool.query(
      `update events set start_at = now() - interval '1 day', updated_at = now() where id = $1`,
      [secondEventId]
    );

    const firstMarkRes = await request(app)
      .post(`/api/events/${firstEventId}/attendance/${memberAUserId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ status: 'present', paymentAmount: 1500 });

    expect(firstMarkRes.status).toBe(200);

    const secondMarkRes = await request(app)
      .post(`/api/events/${secondEventId}/attendance/${memberAUserId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ status: 'present', paymentAmount: 1000 });

    expect(secondMarkRes.status).toBe(200);

    const secondDetailRes = await request(app)
      .get(`/api/events/${secondEventId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`);

    expect(secondDetailRes.status).toBe(200);
    expect(secondDetailRes.body.registrations.going[0].finance_balance_before_event).toBe(200);
    expect(secondDetailRes.body.registrations.going[0].finance_settlement_target_amount).toBe(1100);
    expect(secondDetailRes.body.registrations.going[0].finance_balance_after_event).toBe(-100);
    expect(secondDetailRes.body.summary.financeSummary.actualPaidTotalAmount).toBe(1000);

    const teamRes = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`);

    expect(teamRes.status).toBe(200);
    expect(teamRes.body.current_user_finance.current_balance_amount).toBe(0);
    const memberFinance = teamRes.body.members.find(item => item.user_id === memberAUserId)?.finance_stats;
    expect(memberFinance.current_balance_amount).toBe(-100);
    expect(memberFinance.entry_count).toBe(2);
    expect(teamRes.body.team_finance_entries).toHaveLength(2);
    expect(teamRes.body.team_finance_entries[0]).toHaveProperty('event_title');
    expect(teamRes.body.team_finance_entries[0]).toHaveProperty('settlement_target_amount');

    const memberTeamView = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(memberTeamView.status).toBe(200);
    expect(memberTeamView.body.current_user_finance.current_balance_amount).toBe(-100);
    expect(memberTeamView.body.current_user_finance.entries[0].balance_after_event).toBe(-100);
    expect(memberTeamView.body.current_user_finance.entries[1].balance_after_event).toBe(200);
  });

  test('manual finance adjustment can settle an existing debt without a new attendance mark', async () => {
    const financeEventPayload = {
      pricingMode: 'fixed_per_person',
      fixedPricePerPerson: 1200,
      perPlayerFee: 100
    };
    const eventId = await createPublishedEvent(financeEventPayload);

    const regARes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);
    expect(regARes.status).toBe(201);

    await pool.query(
      `
      update events
      set start_at = now() - interval '1 day'
      where id = $1
      `,
      [eventId]
    );

    const markRes = await request(app)
      .post(`/api/events/${eventId}/attendance/${memberAUserId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ status: 'present', paymentAmount: 1000 });

    expect(markRes.status).toBe(200);

    const adjustmentRes = await request(app)
      .post(`/api/teams/${teamId}/finance-adjustments/${memberAUserId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({
        adjustmentAmount: 300,
        note: 'Utolagos atutalas'
      });

    expect(adjustmentRes.status).toBe(201);
    expect(adjustmentRes.body.finance.current_balance_amount).toBe(0);
    expect(adjustmentRes.body.finance.adjustment_count).toBe(1);

    const teamRes = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`);

    expect(teamRes.status).toBe(200);
    const memberFinance = teamRes.body.members.find(item => item.user_id === memberAUserId)?.finance_stats;
    expect(memberFinance.current_balance_amount).toBe(0);
    expect(teamRes.body.team_finance_entries.some(item => item.entry_type === 'adjustment')).toBe(true);

    const memberTeamView = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(memberTeamView.status).toBe(200);
    expect(memberTeamView.body.current_user_finance.current_balance_amount).toBe(0);
    expect(memberTeamView.body.current_user_finance.entries[0].entry_type).toBe('adjustment');
    expect(memberTeamView.body.current_user_finance.entries[0].actual_paid_amount).toBe(300);
  });

  test('manual finance adjustment can record a negative correction against an existing credit', async () => {
    const financeEventPayload = {
      pricingMode: 'fixed_per_person',
      fixedPricePerPerson: 1200,
      perPlayerFee: 100
    };
    const eventId = await createPublishedEvent(financeEventPayload);

    const regARes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberAToken}`);
    expect(regARes.status).toBe(201);

    await pool.query(
      `
      update events
      set start_at = now() - interval '1 day'
      where id = $1
      `,
      [eventId]
    );

    const markRes = await request(app)
      .post(`/api/events/${eventId}/attendance/${memberAUserId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ status: 'present', paymentAmount: 1600 });

    expect(markRes.status).toBe(200);

    const adjustmentRes = await request(app)
      .post(`/api/teams/${teamId}/finance-adjustments/${memberAUserId}`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({
        adjustmentAmount: -200,
        note: 'Téves jóváírás korrekció'
      });

    expect(adjustmentRes.status).toBe(201);
    expect(adjustmentRes.body.message).toBe('Pénzügyi korrekció sikeresen rögzítve.');
    expect(adjustmentRes.body.finance.current_balance_amount).toBe(100);
    expect(adjustmentRes.body.finance.adjustment_count).toBe(1);

    const memberTeamView = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${memberAToken}`);

    expect(memberTeamView.status).toBe(200);
    expect(memberTeamView.body.current_user_finance.current_balance_amount).toBe(100);
    expect(memberTeamView.body.current_user_finance.entries[0].entry_type).toBe('adjustment');
    expect(memberTeamView.body.current_user_finance.entries[0].actual_paid_amount).toBe(-200);
    expect(memberTeamView.body.current_user_finance.entries[0].event_title).toBe('Külön pénzügyi korrekció');
  });
});
