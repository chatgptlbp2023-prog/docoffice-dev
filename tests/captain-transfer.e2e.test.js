const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('Captain transfer E2E', () => {
  const password = 'teszt123';

  const created = {
    users: [],
    teams: [],
    memberships: []
  };

  let teamAdminUserId;
  let viceCaptainUserId;
  let memberUserId;
  let outsiderUserId;
  let teamId;
  let teamAdminEmail;
  let viceCaptainEmail;
  let memberEmail;
  let outsiderEmail;

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

  async function addMembership({ userId, role, membershipStatus = 'active' }) {
    const id = randomUUID();
    created.memberships.push(id);

    await pool.query(
      `
      insert into team_members (
        id,
        team_id,
        user_id,
        role,
        membership_status,
        joined_at,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, now(), now(), now())
      `,
      [id, teamId, userId, role, membershipStatus]
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
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    teamAdminEmail = `team_admin_transfer_${suffix}@example.com`;
    viceCaptainEmail = `vice_transfer_${suffix}@example.com`;
    memberEmail = `member_transfer_${suffix}@example.com`;
    outsiderEmail = `outsider_transfer_${suffix}@example.com`;

    teamAdminUserId = await createUser({
      name: 'Captain Transfer',
      email: teamAdminEmail
    });

    viceCaptainUserId = await createUser({
      name: 'Vice Transfer',
      email: viceCaptainEmail
    });

    memberUserId = await createUser({
      name: 'Member Transfer',
      email: memberEmail
    });

    outsiderUserId = await createUser({
      name: 'Outsider Transfer',
      email: outsiderEmail
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
      [teamId, 'Captain Transfer FC', teamAdminUserId]
    );

    await addMembership({ userId: teamAdminUserId, role: 'team_admin' });
    await addMembership({ userId: viceCaptainUserId, role: 'team_manager' });
    await addMembership({ userId: memberUserId, role: 'member' });
  });

  afterEach(async () => {
    if (created.memberships.length > 0) {
      await pool.query(
        `delete from team_members where id = any($1::uuid[])`,
        [created.memberships]
      );
    }

    if (created.teams.length > 0) {
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
    created.memberships.length = 0;
  });

  test('team_admin can transfer role to active member and exactly one team_admin remains', async () => {
    const teamAdminToken = await login(teamAdminEmail);

    const transferRes = await request(app)
      .post(`/api/teams/${teamId}/captain-transfer`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ targetUserId: memberUserId });

    expect(transferRes.status).toBe(200);
    expect(transferRes.body.ok).toBe(true);
    expect(transferRes.body.previous_captain.user_id).toBe(teamAdminUserId);
    expect(transferRes.body.previous_captain.role).toBe('team_manager');
    expect(transferRes.body.new_captain.user_id).toBe(memberUserId);
    expect(transferRes.body.new_captain.role).toBe('team_admin');

    const memberRoles = await pool.query(
      `
      select user_id, role, membership_status
      from team_members
      where team_id = $1
        and user_id = any($2::uuid[])
      order by user_id asc
      `,
      [teamId, [teamAdminUserId, memberUserId]]
    );

    const captainMembership = memberRoles.rows.find(row => row.user_id === teamAdminUserId);
    const targetMembership = memberRoles.rows.find(row => row.user_id === memberUserId);

    expect(captainMembership.role).toBe('team_manager');
    expect(targetMembership.role).toBe('team_admin');
    expect(captainMembership.membership_status).toBe('active');
    expect(targetMembership.membership_status).toBe('active');

    const captainCountRes = await pool.query(
      `
      select count(*)::int as active_captain_count
      from team_members
      where team_id = $1
        and membership_status = 'active'
        and role = 'team_admin'
      `,
      [teamId]
    );

    expect(captainCountRes.rows[0].active_captain_count).toBe(1);
  });

  test('platform_owner can transfer captain role without team membership', async () => {
    await pool.query(
      `
      update users
      set platform_role = 'platform_owner',
          updated_at = now()
      where id = $1
      `,
      [outsiderUserId]
    );

    const ownerToken = await login(outsiderEmail);

    const transferRes = await request(app)
      .post(`/api/teams/${teamId}/captain-transfer`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ targetUserId: memberUserId });

    expect(transferRes.status).toBe(200);
    expect(transferRes.body.ok).toBe(true);
    expect(transferRes.body.previous_captain.user_id).toBe(teamAdminUserId);
    expect(transferRes.body.new_captain.user_id).toBe(memberUserId);
  });

  test('team_manager cannot transfer team_admin role', async () => {
    const viceToken = await login(viceCaptainEmail);

    const transferRes = await request(app)
      .post(`/api/teams/${teamId}/captain-transfer`)
      .set('Authorization', `Bearer ${viceToken}`)
      .send({ targetUserId: memberUserId });

    expect(transferRes.status).toBe(403);
    expect(transferRes.body.ok).toBe(false);
  });

  test('team_admin cannot transfer role to self', async () => {
    const teamAdminToken = await login(teamAdminEmail);

    const transferRes = await request(app)
      .post(`/api/teams/${teamId}/captain-transfer`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ targetUserId: teamAdminUserId });

    expect(transferRes.status).toBe(400);
    expect(transferRes.body.ok).toBe(false);
  });

  test('team_admin cannot transfer role to non-team-member user', async () => {
    const teamAdminToken = await login(teamAdminEmail);

    const transferRes = await request(app)
      .post(`/api/teams/${teamId}/captain-transfer`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ targetUserId: outsiderUserId });

    expect(transferRes.status).toBe(404);
    expect(transferRes.body.ok).toBe(false);
  });

  test('team_admin cannot transfer role to inactive member', async () => {
    const inactiveUserId = await createUser({
      name: 'Inactive Transfer',
      email: `inactive_transfer_${Date.now()}_${Math.floor(Math.random() * 100000)}@example.com`
    });

    await addMembership({
      userId: inactiveUserId,
      role: 'member',
      membershipStatus: 'inactive'
    });

    const teamAdminToken = await login(teamAdminEmail);

    const transferRes = await request(app)
      .post(`/api/teams/${teamId}/captain-transfer`)
      .set('Authorization', `Bearer ${teamAdminToken}`)
      .send({ targetUserId: inactiveUserId });

    expect(transferRes.status).toBe(400);
    expect(transferRes.body.ok).toBe(false);
  });
});
