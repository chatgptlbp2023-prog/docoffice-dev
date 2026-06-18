const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('Event team draw status machine E2E', () => {
  const password = 'teszt123';
  const created = {
    users: [],
    teams: [],
    events: []
  };

  let team_adminUserId;
  let memberOneUserId;
  let memberTwoUserId;
  let memberThreeUserId;
  let memberFourUserId;
  let outsiderUserId;
  let teamId;
  let eventId;
  let team_adminToken;
  let memberOneToken;
  let memberThreeToken;
  let memberFourToken;
  let outsiderToken;

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

  async function saveAndPublishDraw() {
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

    return publishRes.body.draw;
  }

  async function getDraw() {
    const res = await request(app)
      .get(`/api/events/${eventId}/team-draw`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(res.status).toBe(200);
    return res.body.draw;
  }

  beforeAll(async () => {
    const migrationPath = path.join(
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
    const goalkeeperModuleMigrationPath = path.join(
      __dirname,
      '..',
      'db',
      'migrations',
      '2026-06-05_goalkeeper_module.sql'
    );

    await pool.query(fs.readFileSync(migrationPath, 'utf8'));
    await pool.query(fs.readFileSync(goalkeeperMigrationPath, 'utf8'));
    await pool.query(fs.readFileSync(goalkeeperModuleMigrationPath, 'utf8'));
  });

  beforeEach(async () => {
    const stamp = Date.now();
    team_adminUserId = await createUser({ name: 'Captain Draw', email: `team_admin_draw_${stamp}@example.com` });
    memberOneUserId = await createUser({ name: 'Draw Member One', email: `draw_member_one_${stamp}@example.com` });
    memberTwoUserId = await createUser({ name: 'Draw Member Two', email: `draw_member_two_${stamp}@example.com` });
    memberThreeUserId = await createUser({ name: 'Draw Member Three', email: `draw_member_three_${stamp}@example.com` });
    memberFourUserId = await createUser({ name: 'Draw Member Four', email: `draw_member_four_${stamp}@example.com` });
    outsiderUserId = await createUser({ name: 'Draw Outsider', email: `draw_outsider_${stamp}@example.com` });

    teamId = randomUUID();
    eventId = randomUUID();
    created.teams.push(teamId);
    created.events.push(eventId);

    await pool.query(
      `
      insert into teams (id, name, created_by_user_id, status, created_at, updated_at)
      values ($1, 'Draw FC', $2, 'active', now(), now())
      `,
      [teamId, team_adminUserId]
    );

    await pool.query(
      `
      insert into team_members (
        id, team_id, user_id, role, membership_status,
        joined_at, created_at, updated_at,
        skills_enabled, is_goalkeeper, goalkeeper_score, defense_score, attack_score
      )
      values
      ($1, $6, $7, 'team_admin', 'active', now(), now(), now(), true, true, 4, 7, 7),
      ($2, $6, $8, 'member', 'active', now(), now(), now(), true, true, 0, 7, 6),
      ($3, $6, $9, 'member', 'active', now(), now(), now(), true, false, 0, 6, 8),
      ($4, $6, $10, 'member', 'active', now(), now(), now(), true, false, 1, 6, 6),
      ($5, $6, $11, 'member', 'active', now(), now(), now(), true, false, 0, 7, 6)
      `,
      [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        teamId,
        team_adminUserId,
        memberOneUserId,
        memberTwoUserId,
        memberThreeUserId,
        memberFourUserId
      ]
    );

    await pool.query(
      `
      insert into events (
        id, team_id, created_by_user_id, title, start_at, location_name,
        min_players, max_players, status, created_at, updated_at
      )
      values (
        $1, $2, $3, 'Status Machine Match', now() + interval '7 day', 'Teszt pálya',
        4, 10, 'published', now(), now()
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
      ($1, $4, $5, $7, 'going', now(), now(), now()),
      ($2, $4, $6, $7, 'going', now(), now(), now()),
      ($3, $4, $8, $7, 'going', now(), now(), now())
      `,
      [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        eventId,
        team_adminUserId,
        memberOneUserId,
        teamId,
        memberTwoUserId
      ]
    );

    team_adminToken = await login(`team_admin_draw_${stamp}@example.com`);
    memberOneToken = await login(`draw_member_one_${stamp}@example.com`);
    memberThreeToken = await login(`draw_member_three_${stamp}@example.com`);
    memberFourToken = await login(`draw_member_four_${stamp}@example.com`);
    outsiderToken = await login(`draw_outsider_${stamp}@example.com`);
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
    created.events.length = 0;
  });

  test('event draw preview returns transient preview status', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/team-draw/preview`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.draw.status).toBe('preview');
    expect(res.body.draw.persisted).toBe(false);
    expect(Array.isArray(res.body.draw.teamA)).toBe(true);
    expect(Array.isArray(res.body.draw.teamB)).toBe(true);
  });

  test('skill draw keeps team sizes within one player even when skill totals are skewed', async () => {
    await pool.query(
      `
      update team_members
      set goalkeeper_score = case
            when user_id = $2 then 10
            when user_id = $3 then 0
            else 0
          end,
          defense_score = case
            when user_id = $2 then 10
            when user_id = $3 then 0
            else 1
          end,
          attack_score = case
            when user_id = $2 then 10
            when user_id = $3 then 0
            else 1
          end,
          is_goalkeeper = case
            when user_id in ($2, $3) then true
            else false
          end,
          skills_enabled = true,
          updated_at = now()
      where team_id = $1
      `,
      [teamId, team_adminUserId, memberOneUserId]
    );

    for (let index = 0; index < 7; index += 1) {
      const extraUserId = await createUser({
        name: `Low Skill ${index + 1}`,
        email: `low_skill_${index}_${Date.now()}@example.com`
      });

      await pool.query(
        `
        insert into team_members (
          id, team_id, user_id, role, membership_status,
          joined_at, created_at, updated_at,
          skills_enabled, is_goalkeeper, goalkeeper_score, defense_score, attack_score
        )
        values (
          $1, $2, $3, 'member', 'active',
          now(), now(), now(),
          true, false, 0, 1, 1
        )
        `,
        [randomUUID(), teamId, extraUserId]
      );

      await pool.query(
        `
        insert into event_registrations (
          id, event_id, user_id, team_id, registration_status, registered_at, created_at, updated_at
        )
        values ($1, $2, $3, $4, 'going', now(), now(), now())
        `,
        [randomUUID(), eventId, extraUserId, teamId]
      );
    }

    const res = await request(app)
      .post(`/api/events/${eventId}/team-draw/preview`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.draw.source_member_count).toBe(10);
    expect(Math.abs(res.body.draw.teamA.length - res.body.draw.teamB.length)).toBeLessThanOrEqual(1);
    expect(res.body.draw.teamA.length).toBe(5);
    expect(res.body.draw.teamB.length).toBe(5);
  });


  test('draw preview is blocked if there are fewer than two goalkeeper candidates among going players', async () => {
    await pool.query(
      `
      update team_members
      set is_goalkeeper = false,
          updated_at = now()
      where team_id = $1
        and user_id = $2
      `,
      [teamId, memberOneUserId]
    );

    const res = await request(app)
      .post(`/api/events/${eventId}/team-draw/preview`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Legalább 2 kapusnak jelölt játékos kell/);
  });


  test('save persists the currently visible preview instead of regenerating a new draw', async () => {
    const previewRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/preview`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(previewRes.status).toBe(200);

    const saveRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/save`)
      .set('Authorization', `Bearer ${team_adminToken}`)
      .send({ draw: previewRes.body.draw });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.draw.status).toBe('saved');
    expect(saveRes.body.draw.teamA.map(member => member.member_id)).toEqual(
      previewRes.body.draw.teamA.map(member => member.member_id)
    );
    expect(saveRes.body.draw.teamB.map(member => member.member_id)).toEqual(
      previewRes.body.draw.teamB.map(member => member.member_id)
    );
  });

  test('team_admin can save and publish an event draw', async () => {
    const saveRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/save`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.draw.status).toBe('saved');
    expect(saveRes.body.draw.published_at).toBeNull();
    expect(saveRes.body.draw.stale_at).toBeNull();

    const getSavedRes = await request(app)
      .get(`/api/events/${eventId}/team-draw`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(getSavedRes.status).toBe(200);
    expect(getSavedRes.body.draw.status).toBe('saved');

    const publishRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/publish`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.draw.status).toBe('published');
    expect(publishRes.body.draw.published_at).toBeTruthy();
    expect(publishRes.body.draw.stale_at).toBeNull();

    const getPublishedRes = await request(app)
      .get(`/api/events/${eventId}/team-draw`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(getPublishedRes.status).toBe(200);
    expect(getPublishedRes.body.draw.status).toBe('published');
  });

  test('published draw cannot be overwritten by save and outsider cannot publish', async () => {
    const saveRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/save`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(saveRes.status).toBe(200);

    const outsiderPublishRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/publish`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(outsiderPublishRes.status).toBe(403);

    const publishRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/publish`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.draw.status).toBe('published');

    const secondSaveRes = await request(app)
      .post(`/api/events/${eventId}/team-draw/save`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(secondSaveRes.status).toBe(409);
    expect(secondSaveRes.body.ok).toBe(false);
  });

  test('published draw becomes stale when a new going participant registers', async () => {
    await saveAndPublishDraw();

    const registerRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberThreeToken}`);

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.registration.registration_status).toBe('going');
    expect(registerRes.body.readiness.eventReadiness).toBe('draw_stale');
    expect(registerRes.body.readiness.drawStatus).toBe('stale');
    expect(registerRes.body.readiness.requiresRepublish).toBe(true);

    const draw = await getDraw();
    expect(draw.status).toBe('stale');
    expect(draw.published_at).toBeTruthy();
    expect(draw.stale_at).toBeTruthy();
  });

  test('waiting list change alone does not stale a published draw', async () => {
    await pool.query(`update events set min_players = 3, max_players = 3, updated_at = now() where id = $1`, [eventId]);
    await saveAndPublishDraw();

    const registerRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberThreeToken}`);

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.registration.registration_status).toBe('waiting_list');

    const draw = await getDraw();
    expect(draw.status).toBe('published');
    expect(draw.stale_at).toBeNull();
  });

  test('going cancel with auto-promotion marks draw stale without overwriting payload', async () => {
    await pool.query(`update events set min_players = 3, max_players = 3, updated_at = now() where id = $1`, [eventId]);
    const publishedDraw = await saveAndPublishDraw();

    const waitingRegisterRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberThreeToken}`);

    expect(waitingRegisterRes.status).toBe(201);
    expect(waitingRegisterRes.body.registration.registration_status).toBe('waiting_list');

    const beforeCancelDraw = await getDraw();
    expect(beforeCancelDraw.status).toBe('published');

    const cancelRes = await request(app)
      .post(`/api/events/${eventId}/cancel`)
      .set('Authorization', `Bearer ${memberOneToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.previousStatus).toBe('going');
    expect(cancelRes.body.promotedRegistration).toBeTruthy();
    expect(cancelRes.body.promotedRegistration.user_id).toBe(memberThreeUserId);
    expect(cancelRes.body.promotedRegistration.registration_status).toBe('going');
    expect(cancelRes.body.readiness.eventReadiness).toBe('draw_stale');
    expect(cancelRes.body.readiness.drawStatus).toBe('stale');
    expect(cancelRes.body.readiness.requiresRepublish).toBe(true);

    const staleDraw = await getDraw();
    expect(staleDraw.status).toBe('stale');
    expect(staleDraw.stale_at).toBeTruthy();
    expect(staleDraw.teamA).toEqual(publishedDraw.teamA);
    expect(staleDraw.teamB).toEqual(publishedDraw.teamB);
    expect(staleDraw.totals).toEqual(publishedDraw.totals);
  });

  test('published draw cancellation below minimum returns below_minimum readiness', async () => {
    const publishedDraw = await saveAndPublishDraw();

    const cancelRes = await request(app)
      .post(`/api/events/${eventId}/cancel`)
      .set('Authorization', `Bearer ${memberOneToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.previousStatus).toBe('going');
    expect(cancelRes.body.promotedRegistration).toBeNull();
    expect(cancelRes.body.readiness.eventReadiness).toBe('below_minimum');
    expect(cancelRes.body.readiness.drawStatus).toBe('stale');
    expect(cancelRes.body.readiness.requiresRepublish).toBe(true);

    const eventRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${team_adminToken}`);

    expect(eventRes.status).toBe(200);
    expect(eventRes.body.summary.eventReadiness).toBe('below_minimum');
    expect(eventRes.body.summary.drawStatus).toBe('stale');
    expect(eventRes.body.summary.requiresRepublish).toBe(true);

    const staleDraw = await getDraw();
    expect(staleDraw.status).toBe('stale');
    expect(staleDraw.teamA).toEqual(publishedDraw.teamA);
    expect(staleDraw.teamB).toEqual(publishedDraw.teamB);
  });

  test('waiting list cancel does not stale a published draw', async () => {
    await pool.query(`update events set min_players = 3, max_players = 3, updated_at = now() where id = $1`, [eventId]);
    await saveAndPublishDraw();

    const waitingRegisterRes = await request(app)
      .post(`/api/events/${eventId}/register`)
      .set('Authorization', `Bearer ${memberFourToken}`);

    expect(waitingRegisterRes.status).toBe(201);
    expect(waitingRegisterRes.body.registration.registration_status).toBe('waiting_list');

    const cancelRes = await request(app)
      .post(`/api/events/${eventId}/cancel`)
      .set('Authorization', `Bearer ${memberFourToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.previousStatus).toBe('waiting_list');
    expect(cancelRes.body.promotedRegistration).toBeNull();

    const draw = await getDraw();
    expect(draw.status).toBe('published');
    expect(draw.stale_at).toBeNull();
  });
});
