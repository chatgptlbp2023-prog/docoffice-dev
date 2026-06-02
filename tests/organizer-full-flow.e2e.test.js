const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('Organizer full journey E2E', () => {
  const password = 'teszt123';
  const created = {
    users: [],
    teams: [],
    members: [],
    events: []
  };

  let organizerToken;
  let organizerUserId;
  let organizerEmail;
  let memberOneUserId;
  let memberTwoUserId;
  let memberOneEmail;
  let memberTwoEmail;

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

  beforeEach(async () => {
    const stamp = Date.now().toString();
    organizerEmail = `journey_organizer_${stamp}@example.com`;
    memberOneEmail = `journey_member_one_${stamp}@example.com`;
    memberTwoEmail = `journey_member_two_${stamp}@example.com`;

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Journey Organizer',
        email: organizerEmail,
        password,
        phone: '+36111111111',
        registerAsOrganizer: true
      });

    expect(registerRes.status).toBe(201);
    organizerToken = registerRes.body.token;
    organizerUserId = registerRes.body.user.id;
    created.users.push(organizerUserId);

    memberOneUserId = await createUser({ name: 'Journey Member One', email: memberOneEmail });
    memberTwoUserId = await createUser({ name: 'Journey Member Two', email: memberTwoEmail });
  });

  afterEach(async () => {
    if (created.events.length > 0) {
      await pool.query(`delete from event_team_draws where event_id = any($1::uuid[])`, [created.events]);
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

    created.users.length = 0;
    created.teams.length = 0;
    created.members.length = 0;
    created.events.length = 0;
  });

  test('organizer can go from team creation to event close, draw publish and cash booking', async () => {
    const createTeamRes = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ name: 'Journey FC' });

    expect(createTeamRes.status).toBe(201);
    const teamId = createTeamRes.body.team.id;
    created.teams.push(teamId);

    const addMemberOneRes = await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ email: memberOneEmail, role: 'member' });
    expect(addMemberOneRes.status).toBe(201);

    const addMemberTwoRes = await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ email: memberTwoEmail, role: 'member' });
    expect(addMemberTwoRes.status).toBe(201);

    await pool.query(
      `
      update team_members
      set is_goalkeeper = true,
          goalkeeper_score = 3,
          defense_score = 7,
          attack_score = 6,
          updated_at = now()
      where team_id = $1
        and user_id in ($2, $3, $4)
      `,
      [teamId, organizerUserId, memberOneUserId, memberTwoUserId]
    );

    const createEventRes = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        title: 'Journey Match',
        description: 'Teljes folyamat',
        startAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        locationName: 'Journey Arena',
        minPlayers: 2,
        playersOnFieldTotal: 2,
        substitutesEnabled: true,
        substitutesCount: 1,
        pricingMode: 'fixed_per_person',
        fixedPricePerPerson: 1200,
        perPlayerFee: 100,
        initialStatus: 'published'
      });

    expect(createEventRes.status).toBe(201);
    const eventId = createEventRes.body.event.id;
    created.events.push(eventId);

    const memberOneLogin = await request(app).post('/api/auth/login').send({ email: memberOneEmail, password });
    const memberTwoLogin = await request(app).post('/api/auth/login').send({ email: memberTwoEmail, password });
    expect(memberOneLogin.status).toBe(200);
    expect(memberTwoLogin.status).toBe(200);

    await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(201);

    await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberOneLogin.body.token}`)
      .expect(201);

    await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberTwoLogin.body.token}`)
      .expect(201);

    const previewRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/preview`)
      .set('Authorization', `Bearer ${organizerToken}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.draw.status).toBe('preview');

    const saveRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/save`)
      .set('Authorization', `Bearer ${organizerToken}`);

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.draw.status).toBe('saved');

    const publishRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/publish`)
      .set('Authorization', `Bearer ${organizerToken}`);

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.draw.status).toBe('published');

    const drawRes = await request(app)
      .get(`/api/events/${eventId}/team-draw`)
      .set('Authorization', `Bearer ${organizerToken}`);

    expect(drawRes.status).toBe(200);
    expect(drawRes.body.draw.status).toBe('published');

    await pool.query(
      `update events set start_at = now() - interval '2 hour', updated_at = now() where id = $1`,
      [eventId]
    );

    await request(app)
      .post(`/api/events/${eventId}/attendance/${organizerUserId}`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ status: 'present', paymentAmount: 1300 })
      .expect(200);

    await request(app)
      .post(`/api/events/${eventId}/attendance/${memberOneUserId}`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ status: 'present', paymentAmount: 1500 })
      .expect(200);

    await request(app)
      .post(`/api/events/${eventId}/attendance/${memberTwoUserId}`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ status: 'no_show' })
      .expect(200);

    const detailRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${organizerToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.event.status).toBe('published');
    expect(detailRes.body.summary.attendanceSummary.presentCount).toBe(2);
    expect(detailRes.body.summary.attendanceSummary.noShowCount).toBe(1);
    expect(detailRes.body.summary.attendanceSummary.totalPaidAmount).toBe(2800);
    expect(detailRes.body.summary.paymentSummary.final_amount_per_person).toBe(1300);

    const finishRes = await request(app)
      .patch(`/api/events/${eventId}/status`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ status: 'finished' });

    expect(finishRes.status).toBe(200);

    const closedDetailRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${organizerToken}`);

    expect(closedDetailRes.status).toBe(200);
    expect(closedDetailRes.body.event.status).toBe('finished');

    const teamEventsRes = await request(app)
      .get(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${organizerToken}`);

    expect(teamEventsRes.status).toBe(200);
    expect(teamEventsRes.body.events).toHaveLength(1);
    expect(teamEventsRes.body.events[0].attendance_summary.total_paid_amount).toBe(2800);
    expect(teamEventsRes.body.events[0].payment_summary.final_amount_per_person).toBe(1300);
  });
});
