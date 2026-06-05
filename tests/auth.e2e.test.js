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
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;

  function restoreGoogleClientId() {
    if (originalGoogleClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
      return;
    }

    process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
  }

  afterEach(async () => {
    restoreGoogleClientId();

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

  test('GET /api/version returns visible deploy metadata', async () => {
    const res = await request(app).get('/api/version');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.version).toBeTruthy();
    expect(res.body.version.name).toBe('Foci Szervező');
    expect(res.body.version.version).toBeTruthy();
    expect(res.body.version.commit).toBeTruthy();
    expect(res.body.version.environment).toBeTruthy();
    expect(res.body.version.startedAt).toBeTruthy();
  });

  test('GET /api/auth/google/config exposes only a valid real Google client id', async () => {
    process.env.GOOGLE_CLIENT_ID = 'your-google-client-id';

    const placeholderRes = await request(app).get('/api/auth/google/config');

    expect(placeholderRes.status).toBe(200);
    expect(placeholderRes.body.ok).toBe(true);
    expect(placeholderRes.body.enabled).toBe(false);
    expect(placeholderRes.body.clientId).toBeNull();
    expect(placeholderRes.body.hasInvalidClientIds).toBe(true);

    process.env.GOOGLE_CLIENT_ID = '1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com';

    const configuredRes = await request(app).get('/api/auth/google/config');

    expect(configuredRes.status).toBe(200);
    expect(configuredRes.body.ok).toBe(true);
    expect(configuredRes.body.enabled).toBe(true);
    expect(configuredRes.body.clientId).toBe('1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com');
    expect(configuredRes.body.clientIdCount).toBe(1);
  });

  test('POST /api/auth/google reports disabled login when GOOGLE_CLIENT_ID is missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;

    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'dummy-google-token' });

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toContain('Google');
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
        registrationPath: 'team_sport_organizer',
        registerAsOrganizer: true
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.ok).toBe(true);
    expect(registerRes.body.user.can_create_team).toBe(true);
    expect(registerRes.body.user.registration_path).toBe('team_sport_organizer');

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
    expect(registerRes.body.user.registration_path).toBe('invited_participant');
    expect(registerRes.body.joined_invite).toBeTruthy();

    createdUserIds.push(registerRes.body.user.id);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registerRes.body.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.can_create_team).toBe(false);
  });

  test('invite-based registration with an existing email joins the existing account to the new team', async () => {
    const ownerId = randomUUID();
    const existingUserId = randomUUID();
    const teamId = randomUUID();
    const inviteId = randomUUID();
    const inviteToken = `invite_existing_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const inviteCode = `EXIST${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 10)}`;
    const ownerEmail = `owner_existing_${Date.now()}@example.com`;
    const existingEmail = `multi_team_${Date.now()}@example.com`;
    const ownerPasswordHash = await bcrypt.hash(password, 10);
    const existingPasswordHash = await bcrypt.hash(password, 10);

    createdUserIds.push(ownerId, existingUserId);
    createdTeamIds.push(teamId);
    createdInviteIds.push(inviteId);

    await pool.query(
      `
      insert into users (
        id, name, email, status, password_hash, registration_path, can_create_team, created_at, updated_at
      )
      values
        ($1, 'Invite Owner Existing', $2, 'active', $3, 'team_sport_organizer', true, now(), now()),
        ($4, 'Already Registered Player', $5, 'active', $6, 'invited_participant', false, now(), now())
      `,
      [ownerId, ownerEmail, ownerPasswordHash, existingUserId, existingEmail, existingPasswordHash]
    );

    await pool.query(
      `
      insert into teams (
        id, name, created_by_user_id, status, created_at, updated_at
      )
      values ($1, 'Second Team Invite Target', $2, 'active', now(), now())
      `,
      [teamId, ownerId]
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
      [inviteId, teamId, existingEmail, inviteToken, inviteCode, ownerId]
    );

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Existing Player Rejoin',
        email: existingEmail,
        password,
        inviteToken,
        registrationPath: 'invited_participant',
        registerAsOrganizer: false
      });

    expect(registerRes.status).toBe(200);
    expect(registerRes.body.ok).toBe(true);
    expect(registerRes.body.existing_user_joined).toBe(true);
    expect(registerRes.body.user.id).toBe(existingUserId);
    expect(registerRes.body.joined_invite).toBeTruthy();

    const membershipRes = await pool.query(
      `
      select role, membership_status
      from team_members
      where team_id = $1 and user_id = $2
      `,
      [teamId, existingUserId]
    );

    expect(membershipRes.rows).toHaveLength(1);
    expect(membershipRes.rows[0].role).toBe('member');
    expect(membershipRes.rows[0].membership_status).toBe('active');

    const userCountRes = await pool.query(
      `
      select count(*)::int as count
      from users
      where lower(email) = lower($1)
      `,
      [existingEmail]
    );

    expect(userCountRes.rows[0].count).toBe(1);
  });

  test('tournament organizer registration stores the dedicated registration path', async () => {
    const email = `tournament_${Date.now()}@example.com`;

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Tournament Admin',
        email,
        password,
        registrationPath: 'tournament_organizer',
        registerAsOrganizer: true
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.ok).toBe(true);
    expect(registerRes.body.user.can_create_team).toBe(true);
    expect(registerRes.body.user.registration_path).toBe('tournament_organizer');

    createdUserIds.push(registerRes.body.user.id);
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
