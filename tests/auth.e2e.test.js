const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('Auth E2E', () => {
  const createdUserIds = [];
  const createdTeamIds = [];
  const createdInviteIds = [];
  const password = 'teszt123';

  afterEach(async () => {
    if (createdInviteIds.length > 0) {
      await pool.query(
        `delete from team_invites where id = any($1::uuid[])`,
        [createdInviteIds]
      );
      createdInviteIds.length = 0;
    }

    if (createdTeamIds.length > 0) {
      await pool.query(
        `delete from team_members where team_id = any($1::uuid[])`,
        [createdTeamIds]
      );
      await pool.query(
        `delete from teams where id = any($1::uuid[])`,
        [createdTeamIds]
      );
      createdTeamIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await pool.query(
        `delete from users where id = any($1::uuid[])`,
        [createdUserIds]
      );
      createdUserIds.length = 0;
    }
  });

  test('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.dbTime).toBeTruthy();
  });

  test('login + auth/me works with a real active user', async () => {
    const userId = randomUUID();
    const email = `auth_${Date.now()}@example.com`;
    const passwordHash = await bcrypt.hash(password, 10);

    createdUserIds.push(userId);

    await pool.query(
      `
      insert into users (
        id, name, email, status, password_hash, created_at, updated_at
      )
      values ($1, $2, $3, 'active', $4, now(), now())
      `,
      [userId, 'Auth Teszt User', email, passwordHash]
    );

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email,
        password
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.ok).toBe(true);
    expect(loginRes.body.token).toBeTruthy();
    expect(loginRes.body.user.email).toBe(email);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.ok).toBe(true);
    expect(meRes.body.user.email).toBe(email);
    expect(meRes.body.user.status).toBe('active');
  });

  test('auth/me rejects missing token', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test('auth/me profile can be updated with nickname, phone, birth year, avatar and payment profile', async () => {
    const userId = randomUUID();
    const email = `profile_${Date.now()}@example.com`;
    const passwordHash = await bcrypt.hash(password, 10);

    createdUserIds.push(userId);

    await pool.query(
      `
      insert into users (
        id, name, email, status, password_hash, created_at, updated_at
      )
      values ($1, $2, $3, 'active', $4, now(), now())
      `,
      [userId, 'Profil Teszt User', email, passwordHash]
    );

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email,
        password
      });

    expect(loginRes.status).toBe(200);

    const avatarDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1cAAAAASUVORK5CYII=';
    const updateRes = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({
        name: 'Profil Teszt User',
        nickname: 'Peti',
        phone: '+36301234567',
        birthYear: '1991',
        avatarDataUrl,
        paymentProvider: 'revolut',
        paymentUsername: '@peti',
        paymentQrDataUrl: avatarDataUrl
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.ok).toBe(true);
    expect(updateRes.body.user.nickname).toBe('Peti');
    expect(updateRes.body.user.phone).toBe('+36301234567');
    expect(updateRes.body.user.birth_year).toBe(1991);
    expect(updateRes.body.user.avatar_data_url).toBe(avatarDataUrl);
    expect(updateRes.body.user.payment_provider).toBe('revolut');
    expect(updateRes.body.user.payment_username).toBe('@peti');
    expect(updateRes.body.user.payment_qr_data_url).toBe(avatarDataUrl);
  });

  test('organizer registration enables team creation bootstrap', async () => {
    const email = `organizer_${Date.now()}@example.com`;

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Organizer User',
        email,
        password,
        phone: '+36301234567',
        registerAsOrganizer: true
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.ok).toBe(true);
    expect(registerRes.body.user.can_create_team).toBe(true);

    createdUserIds.push(registerRes.body.user.id);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registerRes.body.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.can_create_team).toBe(true);
  });

  test('invite-based registration without organizer intent does not enable team creation bootstrap', async () => {
    const ownerId = randomUUID();
    const teamId = randomUUID();
    const inviteId = randomUUID();
    const inviteToken = `invite_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const inviteCode = `AUTH${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 10)}`;
    const ownerEmail = `owner_${Date.now()}@example.com`;
    const invitedEmail = `invitee_${Date.now()}@example.com`;
    const ownerPasswordHash = await bcrypt.hash(password, 10);

    createdUserIds.push(ownerId);
    createdTeamIds.push(teamId);
    createdInviteIds.push(inviteId);

    await pool.query(
      `
      insert into users (
        id, name, email, status, password_hash, created_at, updated_at
      )
      values ($1, $2, $3, 'active', $4, now(), now())
      `,
      [ownerId, 'Invite Owner', ownerEmail, ownerPasswordHash]
    );

    await pool.query(
      `
      insert into teams (
        id, name, created_by_user_id, status, created_at, updated_at
      )
      values ($1, $2, $3, 'active', now(), now())
      `,
      [teamId, 'Invite Team', ownerId]
    );

    await pool.query(
      `
      insert into team_members (
        id, team_id, user_id, role, membership_status, joined_at, created_at, updated_at
      )
      values ($1, $2, $3, 'team_admin', 'active', now(), now(), now())
      `,
      [randomUUID(), teamId, ownerId]
    );

    await pool.query(
      `
      insert into team_invites (
        id, team_id, invited_email, role, token, invite_code, status, invited_by_user_id, expires_at, created_at, updated_at
      )
      values ($1, $2, $3, 'member', $4, $5, 'pending', $6, now() + interval '7 days', now(), now())
      `,
      [inviteId, teamId, invitedEmail, inviteToken, inviteCode, ownerId]
    );

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Invited User',
        email: invitedEmail,
        password,
        inviteToken
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.ok).toBe(true);
    expect(registerRes.body.user.can_create_team).toBe(false);
    expect(registerRes.body.joined_invite).toBeTruthy();

    createdUserIds.push(registerRes.body.user.id);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registerRes.body.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.can_create_team).toBe(false);
  });

  test('auth/me rejects avatar that exceeds 600x600 dimensions', async () => {
    const userId = randomUUID();
    const email = `profile_large_${Date.now()}@example.com`;
    const passwordHash = await bcrypt.hash(password, 10);

    createdUserIds.push(userId);

    await pool.query(
      `
      insert into users (
        id, name, email, status, password_hash, created_at, updated_at
      )
      values ($1, $2, $3, 'active', $4, now(), now())
      `,
      [userId, 'Large Avatar User', email, passwordHash]
    );

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email,
        password
      });

    expect(loginRes.status).toBe(200);

    const largeSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="601" height="10"></svg>'
    );

    const updateRes = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({
        name: 'Large Avatar User',
        nickname: 'Nagy',
        phone: '+36301111111',
        birthYear: '1990',
        avatarDataUrl: largeSvg
      });

    expect(updateRes.status).toBe(400);
    expect(updateRes.body.ok).toBe(false);
    expect(updateRes.body.message).toBe('Az avatar legfeljebb 600×600 képpont lehet.');
  });
});
