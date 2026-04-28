const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('Request validation E2E', () => {
  const password = 'teszt123';

  const created = {
    users: [],
    teams: []
  };

  let captainUserId;
  let teamId;
  let captainToken;

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

  beforeEach(async () => {
    const captainEmail = `validation_captain_${Date.now()}@example.com`;

    captainUserId = await createUser({
      name: 'Validation Captain',
      email: captainEmail
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
      [teamId, 'Validation FC', captainUserId]
    );

    await pool.query(
      `
      insert into team_members (
        id, team_id, user_id, role, membership_status, joined_at, created_at, updated_at
      )
      values ($1, $2, $3, 'team_admin', 'active', now(), now(), now())
      `,
      [randomUUID(), teamId, captainUserId]
    );

    captainToken = await login(captainEmail);
  });

  afterEach(async () => {
    if (created.teams.length > 0) {
      await pool.query(`delete from team_invites where team_id = any($1::uuid[])`, [created.teams]);
      await pool.query(`delete from event_settings where event_id in (select id from events where team_id = any($1::uuid[]))`, [created.teams]);
      await pool.query(`delete from events where team_id = any($1::uuid[])`, [created.teams]);
      await pool.query(`delete from team_members where team_id = any($1::uuid[])`, [created.teams]);
      await pool.query(`delete from teams where id = any($1::uuid[])`, [created.teams]);
    }

    if (created.users.length > 0) {
      await pool.query(`delete from users where id = any($1::uuid[])`, [created.users]);
    }

    created.users.length = 0;
    created.teams.length = 0;
  });

  test('register rejects invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Uj User',
        email: 'hibas-email',
        password: 'teszt123',
        registerAsOrganizer: true
      });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toBe('Érvénytelen email cím.');
  });

  test('create team rejects blank name', async () => {
    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${captainToken}`)
      .send({ name: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('create invite rejects invalid email', async () => {
    const res = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Authorization', `Bearer ${captainToken}`)
      .send({
        email: 'rossz-email',
        role: 'member'
      });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toBe('Érvénytelen email cím.');
  });

  test('create event rejects non-boolean substitutesEnabled', async () => {
    const res = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${captainToken}`)
      .send({
        title: 'Teszt meccs',
        startAt: '2026-06-01T18:00:00.000Z',
        locationName: 'Teszt pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: 'igen'
      });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toBe('A substitutesEnabled csak boolean lehet.');
  });

  test('create event rejects non-boolean confirmHolidayOverride', async () => {
    const res = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${captainToken}`)
      .send({
        title: 'Teszt meccs',
        startAt: '2026-06-01T18:00:00.000Z',
        locationName: 'Teszt pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        confirmHolidayOverride: 'igen'
      });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toBe('A confirmHolidayOverride csak boolean lehet.');
  });

  test('create event rejects invalid notificationPreferences payload', async () => {
    const res = await request(app)
      .post(`/api/teams/${teamId}/events`)
      .set('Authorization', `Bearer ${captainToken}`)
      .send({
        title: 'Teszt meccs',
        startAt: '2026-06-01T18:00:00.000Z',
        locationName: 'Teszt pálya',
        minPlayers: 10,
        playersOnFieldTotal: 10,
        substitutesEnabled: false,
        notificationPreferences: {
          notifyAllWhenFull: 'igen'
        }
      });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toBe('A notificationPreferences.notifyAllWhenFull csak boolean lehet.');
  });
});
