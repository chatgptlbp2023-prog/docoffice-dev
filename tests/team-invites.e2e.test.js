const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('Team invites E2E', () => {
  const password = 'teszt123';

  const created = {
    users: [],
    teams: []
  };

  let team_adminUserId;
  let memberUserId;
  let invitedUserId;
  let teamId;
  let team_adminToken;
  let memberToken;
  let invitedToken;
  let invitedEmail;

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
    const unique = Date.now().toString();
    const team_adminEmail = `team_admin_invite_${unique}@example.com`;
    const basicMemberEmail = `member_invite_${unique}@example.com`;
    invitedEmail = `invited_invite_${unique}@example.com`;

    team_adminUserId = await createUser({
      name: 'Captain Invite',
      email: team_adminEmail
    });

    memberUserId = await createUser({
      name: 'Basic Member',
      email: basicMemberEmail
    });

    invitedUserId = await createUser({
      name: 'Invited Player',
      email: invitedEmail
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
      [teamId, 'Meghívó FC', team_adminUserId]
    );

    await pool.query(
      `
      insert into team_members (
        id, team_id, user_id, role, membership_status, joined_at, created_at, updated_at
      )
      values ($1, $2, $3, 'team_admin', 'active', now(), now(), now())
      `,
      [randomUUID(), teamId, team_adminUserId]
    );

    await pool.query(
      `
      insert into team_members (
        id, team_id, user_id, role, membership_status, joined_at, created_at, updated_at
      )
      values ($1, $2, $3, 'member', 'active', now(), now(), now())
      `,
      [randomUUID(), teamId, memberUserId]
    );

    team_adminToken = await login(team_adminEmail);
    memberToken = await login(basicMemberEmail);
    invitedToken = await login(invitedEmail);
  });

  afterEach(async () => {
    if (created.teams.length > 0) {
      await pool.query(
        `delete from team_invites where team_id = any($1::uuid[])`,
        [created.teams]
      );

      await pool.query(
        `delete from team_members where team_id = any($1::uuid[])`,
        [created.teams]
      );

      await pool.query(
        `delete from teams where id = any($1::uuid[])`,
        [created.teams]
      );
    }

    if (created.users.length > 0) {
      await pool.query(
        `delete from users where id = any($1::uuid[])`,
        [created.users]
      );
    }

    created.users.length = 0;
    created.teams.length = 0;
  });

  test('team_admin can create invite for a user email', async () => {
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        email: invitedEmail,
        role: 'member',
        message: 'Gyere játszani.'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.ok).toBe(true);
    expect(createRes.body.invite.invited_email).toBe(invitedEmail);
    expect(createRes.body.invite.status).toBe('pending');
    expect(createRes.body.emailDelivery).toBeTruthy();
    expect(['sent', 'skipped']).toContain(createRes.body.emailDelivery.status);
    if (createRes.body.emailDelivery.status === 'skipped') {
      expect(createRes.body.emailDelivery.reason).toBe('not_configured');
    }
  });

  test('simple member cannot create invite', async () => {
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        email: invitedEmail,
        role: 'member'
      });

    expect(createRes.status).toBe(403);
    expect(createRes.body.ok).toBe(false);
  });

  test('invited user sees and accepts own invite', async () => {
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        email: invitedEmail,
        role: 'member'
      });

    expect(createRes.status).toBe(201);

    const inviteId = createRes.body.invite.id;

    const myInvitesRes = await request(app)
      .get('/api/my/invites')
      .set('Authorization', `Bearer ${invitedToken}`);

    expect(myInvitesRes.status).toBe(200);
    expect(myInvitesRes.body.invites.some(invite => invite.id === inviteId)).toBe(true);

    const acceptRes = await request(app)
      .post(`/api/invites/${inviteId}/accept`)
      .set('Authorization', `Bearer ${invitedToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.ok).toBe(true);
    expect(acceptRes.body.invite.status).toBe('accepted');
    expect(acceptRes.body.member.email).toBe(invitedEmail);

    const myTeamsRes = await request(app)
      .get('/api/my/teams')
      .set('Authorization', `Bearer ${invitedToken}`);

    expect(myTeamsRes.status).toBe(200);
    expect(myTeamsRes.body.teams.some(team => team.id === teamId)).toBe(true);
  });

  test('invite token can be previewed and accepted after login', async () => {
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        email: invitedEmail,
        role: 'member'
      });

    expect(createRes.status).toBe(201);

    const inviteToken = createRes.body.invite.invite_token;
    expect(inviteToken).toBeTruthy();

    const previewRes = await request(app)
      .get(`/api/invite-links/${inviteToken}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.ok).toBe(true);
    expect(previewRes.body.invite.team_id).toBe(teamId);

    const acceptRes = await request(app)
      .post(`/api/invite-links/${inviteToken}/accept`)
      .set('Authorization', `Bearer ${invitedToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.ok).toBe(true);
    expect(acceptRes.body.member.role).toBe('member');
  });

  test('cannot create duplicate pending invite for same team and email', async () => {
    const firstRes = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        email: invitedEmail,
        role: 'member'
      });

    expect(firstRes.status).toBe(201);

    const secondRes = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        email: invitedEmail,
        role: 'member'
      });

    expect(secondRes.status).toBe(409);
    expect(secondRes.body.ok).toBe(false);
  });

  test('revoked invite cannot be accepted later', async () => {
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        email: invitedEmail,
        role: 'member'
      });

    expect(createRes.status).toBe(201);

    const inviteId = createRes.body.invite.id;

    const revokeRes = await request(app)
      .post(`/api/teams/${teamId}/invites/${inviteId}/revoke`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.invite.status).toBe('revoked');

    const acceptRes = await request(app)
      .post(`/api/invites/${inviteId}/accept`)
      .set('Authorization', `Bearer ${invitedToken}`);

    expect(acceptRes.status).toBe(409);
    expect(acceptRes.body.ok).toBe(false);
  });

  test('invited user can decline invite', async () => {
    const createRes = await request(app)
      .post(`/api/teams/${teamId}/invites`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        email: invitedEmail,
        role: 'member'
      });

    expect(createRes.status).toBe(201);

    const inviteId = createRes.body.invite.id;

    const declineRes = await request(app)
      .post(`/api/invites/${inviteId}/decline`)
      .set('Authorization', `Bearer ${invitedToken}`);

    expect(declineRes.status).toBe(200);
    expect(declineRes.body.ok).toBe(true);
    expect(declineRes.body.invite.status).toBe('declined');

    const myTeamsRes = await request(app)
      .get('/api/my/teams')
      .set('Authorization', `Bearer ${invitedToken}`);

    expect(myTeamsRes.status).toBe(200);
    expect(myTeamsRes.body.teams.some(team => team.id === teamId)).toBe(false);
  });
});
