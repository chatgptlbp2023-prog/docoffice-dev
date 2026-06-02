const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('Team skills E2E', () => {
  const password = 'teszt123';
  const created = {
    users: [],
    teams: [],
    members: [],
    events: []
  };

  let team_adminUserId;
  let memberUserId;
  let outsiderUserId;
  let teamId;
  let team_adminToken;
  let outsiderToken;
  let memberRecordId;
  let eventId;

  async function createUser({ name, email }) {
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    created.users.push(id);

    await pool.query(
      `
      insert into users (id, name, email, status, password_hash, created_at, updated_at)
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

  beforeAll(async () => {
    const skillsMigrationPath = path.join(
      __dirname,
      '..',
      'db',
      'migrations',
      '2026-04-01_team_member_skills.sql'
    );

    const drawMigrationPath = path.join(
      __dirname,
      '..',
      'db',
      'migrations',
      '2026-04-03_event_team_draw_status_machine.sql'
    );

    const goalkeeperMigrationPath = path.join(
      __dirname,
      '..',
      'db',
      'migrations',
      '2026-04-03_team_member_goalkeepers.sql'
    );

    const cashMigrationPath = path.join(
      __dirname,
      '..',
      'db',
      'migrations',
      '2026-04-10_cash_module_prep.sql'
    );

    const moduleSettingsMigrationPath = path.join(
      __dirname,
      '..',
      'db',
      'migrations',
      '2026-05-28_team_module_settings.sql'
    );

    await pool.query(fs.readFileSync(skillsMigrationPath, 'utf8'));
    await pool.query(fs.readFileSync(drawMigrationPath, 'utf8'));
    await pool.query(fs.readFileSync(goalkeeperMigrationPath, 'utf8'));
    await pool.query(fs.readFileSync(cashMigrationPath, 'utf8'));
    await pool.query(fs.readFileSync(moduleSettingsMigrationPath, 'utf8'));
  });

  beforeEach(async () => {
    const stamp = Date.now();
    team_adminUserId = await createUser({ name: 'Captain Skills', email: `team_admin_skills_${stamp}@example.com` });
    memberUserId = await createUser({ name: 'Member Skills', email: `member_skills_${stamp}@example.com` });
    outsiderUserId = await createUser({ name: 'Outsider Skills', email: `outsider_skills_${stamp}@example.com` });

    teamId = randomUUID();
    created.teams.push(teamId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, 'Skill FC', $2, 'active', now(), now())
      `,
      [teamId, team_adminUserId]
    );

    const team_adminMemberId = randomUUID();
    memberRecordId = randomUUID();
    created.members.push(team_adminMemberId, memberRecordId);

    await pool.query(
      `
      insert into team_members (
        id, team_id, user_id, role, membership_status,
        joined_at, created_at, updated_at,
        skills_enabled, is_goalkeeper, goalkeeper_score, defense_score, attack_score
      )
      values
      ($1, $3, $4, 'team_admin', 'active', now(), now(), now(), true, true, 0, 5, 5),
      ($2, $3, $5, 'member', 'active', now(), now(), now(), true, true, 0, 5, 5)
      `,
      [team_adminMemberId, memberRecordId, teamId, team_adminUserId, memberUserId]
    );

    eventId = randomUUID();
    created.events.push(eventId);

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, start_at, location_name,
        min_players, max_players, status, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Skill Match', now() + interval '5 day', 'Skill Arena',
        2, 10, 'published', now(), now()
      )
      `,
      [eventId, teamId, team_adminUserId]
    );

    await pool.query(
      `
      insert into event_registrations (
        id, event_id, user_id, team_id, registration_status, registered_at, created_at, updated_at
      )
      values
      ($1, $3, $4, $5, 'going', now(), now(), now()),
      ($2, $3, $6, $5, 'going', now(), now(), now())
      `,
      [randomUUID(), randomUUID(), eventId, team_adminUserId, teamId, memberUserId]
    );

    team_adminToken = await login(`team_admin_skills_${stamp}@example.com`);
    outsiderToken = await login(`outsider_skills_${stamp}@example.com`);
  });

  afterEach(async () => {
    if (created.events.length > 0) {
      await pool.query(`delete from event_team_draws where event_id = any($1::uuid[])`, [created.events]);
      await pool.query(`delete from event_registrations where event_id = any($1::uuid[])`, [created.events]);
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

  test('team_admin can read and update team skill settings', async () => {
    const getRes = await request(app)
      .get(`/api/teams/${teamId}/skill-settings`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.settings.skill_balancing_enabled).toBe(true);
    expect(getRes.body.settings.skill_balance_tolerance_percent).toBe(15);

    const patchRes = await request(app)
      .patch(`/api/teams/${teamId}/skill-settings`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        skillBalancingEnabled: false,
        skillBalanceTolerancePercent: 12
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.settings.skill_balancing_enabled).toBe(false);
    expect(patchRes.body.settings.skill_balance_tolerance_percent).toBe(12);
  });

  test('team_admin can update team module settings', async () => {
    const patchRes = await request(app)
      .patch(`/api/teams/${teamId}/module-settings`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        cashModuleEnabled: true
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.team.cash_module_enabled).toBe(true);
    expect(patchRes.body.team.module_settings.finance.enabled).toBe(true);
    expect(patchRes.body.team.module_settings.rank.enabled).toBe(false);
  });


  test('team_admin can toggle goalkeeper role and draw blocks below two goalkeepers', async () => {
    const toggleRes = await request(app)
      .patch(`/api/teams/${teamId}/members/${memberRecordId}/goalkeeper-role`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        isGoalkeeper: false
      });

    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.member.is_goalkeeper).toBe(false);

    const previewRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/preview`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(previewRes.status).toBe(400);
    expect(previewRes.body.message).toMatch(/Legalább 2 kapusnak jelölt játékos kell/);
  });

  test('goalkeeper role change marks a published draw stale for affected event', async () => {
    const saveRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/save`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.draw.status).toBe('saved');

    const publishRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/publish`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.draw.status).toBe('published');

    const toggleRes = await request(app)
      .patch(`/api/teams/${teamId}/members/${memberRecordId}/goalkeeper-role`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        isGoalkeeper: false
      });

    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.staleEventIds).toContain(eventId);

    const drawRes = await request(app)
      .get(`/api/events/${eventId}/team-draw`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(drawRes.status).toBe(200);
    expect(drawRes.body.draw.status).toBe('stale');
    expect(drawRes.body.draw.stale_at).toBeTruthy();
  });

  test('team_admin can update member skills', async () => {
    const res = await request(app)
      .patch(`/api/teams/${teamId}/members/${memberRecordId}/skills`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        skillsEnabled: true,
        goalkeeperSkill: 0,
        defenseSkill: 7,
        attackSkill: 7
      });

    expect(res.status).toBe(200);
    expect(res.body.member.skills_enabled).toBe(true);
    expect(res.body.member.goalkeeper_skill).toBe(0);
    expect(res.body.member.defense_skill).toBe(7);
    expect(res.body.member.attack_skill).toBe(7);
  });

  test('skill module OFF uses random neutral 5-5-5 draw flow and still allows save/publish', async () => {
    const skillUpdateRes = await request(app)
      .patch(`/api/teams/${teamId}/members/${memberRecordId}/skills`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        skillsEnabled: false,
        goalkeeperSkill: 9,
        defenseSkill: 8,
        attackSkill: 6
      });

    expect(skillUpdateRes.status).toBe(200);

    const settingsRes = await request(app)
      .patch(`/api/teams/${teamId}/skill-settings`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        skillBalancingEnabled: false,
        skillBalanceTolerancePercent: 12
      });

    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.settings.skill_balancing_enabled).toBe(false);

    const teamPreviewRes = await request(app)
      .post(`/api/teams/${teamId}/team-draw/preview`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(teamPreviewRes.status).toBe(200);
    expect(teamPreviewRes.body.draw.settings.skillBalancingEnabled).toBe(false);
    expect(teamPreviewRes.body.draw.settings.generationMode).toBe('random');
    expect(teamPreviewRes.body.draw.source_member_count).toBe(2);
    expect(teamPreviewRes.body.draw.teamA[0].overall_skill).toBe(15);
    expect(teamPreviewRes.body.draw.teamB[0].overall_skill).toBe(15);
    expect(teamPreviewRes.body.draw.teamA[0].goalkeeper_score).toBe(5);
    expect(teamPreviewRes.body.draw.teamB[0].defense_score).toBe(5);

    const eventPreviewRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/preview`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(eventPreviewRes.status).toBe(200);
    expect(eventPreviewRes.body.draw.settings.skillBalancingEnabled).toBe(false);
    expect(eventPreviewRes.body.draw.settings.generationMode).toBe('random');
    expect(eventPreviewRes.body.draw.source_member_count).toBe(2);

    const saveRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/save`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.draw.status).toBe('saved');
    expect(saveRes.body.draw.settings.generationMode).toBe('random');

    const publishRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/publish`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.draw.status).toBe('published');
  });

  test('non team admin cannot access skill settings', async () => {
    const res = await request(app)
      .get(`/api/teams/${teamId}/skill-settings`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
  });

  test('invalid member skill score is rejected', async () => {
    const res = await request(app)
      .patch(`/api/teams/${teamId}/members/${memberRecordId}/skills`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({
        skillsEnabled: true,
        goalkeeperSkill: 11,
        defenseSkill: 5,
        attackSkill: 5
      });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});
