const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('Team members E2E', () => {
  const password = 'teszt123';

  const created = {
    users: [],
    teams: []
  };

  let team_adminUserId;
  let memberUserId;
  let teamId;
  let team_adminToken;

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
    const team_adminEmail = `team_admin_team_${Date.now()}@example.com`;
    const memberEmail = `member_team_${Date.now()}@example.com`;

    team_adminUserId = await createUser({
      name: 'Captain Team',
      email: team_adminEmail
    });

    memberUserId = await createUser({
      name: 'Member Team',
      email: memberEmail
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
      [teamId, 'Bal láb FC', team_adminUserId]
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

    team_adminToken = await login(team_adminEmail);

    global.__teamMemberTestEmail = memberEmail;
  });

  afterEach(async () => {
    if (created.teams.length > 0) {
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

  test('team_admin can add member by email', async () => {
    const addRes = await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        email: global.__teamMemberTestEmail,
        role: 'member'
      });

    expect(addRes.status).toBe(201);
    expect(addRes.body.ok).toBe(true);
    expect(addRes.body.member.email).toBe(global.__teamMemberTestEmail);
    expect(addRes.body.member.role).toBe('member');

    const teamRes = await request(app)
      .get(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(teamRes.status).toBe(200);
    expect(
      teamRes.body.members.some(m => m.email === global.__teamMemberTestEmail)
    ).toBe(true);
  });

  test('cannot add the same active member twice', async () => {
    const firstRes = await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        email: global.__teamMemberTestEmail,
        role: 'member'
      });

    expect(firstRes.status).toBe(201);

    const secondRes = await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        email: global.__teamMemberTestEmail,
        role: 'member'
      });

    expect(secondRes.status).toBe(409);
    expect(secondRes.body.ok).toBe(false);
  });

  test('active member can start and end their own one-week break', async () => {
    const addRes = await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        email: global.__teamMemberTestEmail,
        role: 'member'
      });

    expect(addRes.status).toBe(201);

    const memberToken = await login(global.__teamMemberTestEmail);

    const startRes = await request(app)
      .post(`/api/teams/${teamId}/me/break`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ memberId: team_adminUserId });

    expect(startRes.status).toBe(200);
    expect(startRes.body.ok).toBe(true);
    expect(startRes.body.member.user_id).toBe(memberUserId);
    expect(startRes.body.member.break_until).toBeTruthy();
    expect(startRes.body.member.is_on_break).toBe(true);

    const afterStart = await pool.query(
      `
      select user_id, break_started_at, break_until, break_extensions_count
      from team_members
      where team_id = $1
      order by user_id
      `,
      [teamId]
    );

    const memberRow = afterStart.rows.find(row => row.user_id === memberUserId);
    const captainRow = afterStart.rows.find(row => row.user_id === team_adminUserId);
    expect(memberRow.break_started_at).toBeTruthy();
    expect(memberRow.break_until).toBeTruthy();
    expect(Number(memberRow.break_extensions_count)).toBe(1);
    expect(captainRow.break_until).toBeNull();

    const endRes = await request(app)
      .delete(`/api/teams/${teamId}/me/break`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(endRes.status).toBe(200);
    expect(endRes.body.ok).toBe(true);
    expect(endRes.body.member.user_id).toBe(memberUserId);
    expect(endRes.body.member.break_until).toBeNull();
    expect(endRes.body.member.break_started_at).toBeNull();
    expect(endRes.body.member.break_extensions_count).toBe(0);
    expect(endRes.body.member.is_on_break).toBe(false);
  });
});
