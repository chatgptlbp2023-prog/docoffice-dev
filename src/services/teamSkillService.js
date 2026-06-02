const AppError = require('../utils/appError');
const { pool, withTransaction } = require('./dbService');
const {
  normalizeRankValue,
  normalizeRankStatus
} = require('../utils/rankModel');

const DRAW_STATUS = Object.freeze({
  SAVED: 'saved',
  PUBLISHED: 'published',
  STALE: 'stale'
});

const REQUIRED_GOALKEEPERS = 2;
const NEUTRAL_SKILL_SCORE = 5;

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function parseScore(value, fieldLabel) {
  const num = Number(value);
  if (!Number.isInteger(num)) {
    throw new AppError(400, `${fieldLabel} egész szám kell legyen.`);
  }
  if (num < 0 || num > 10) {
    throw new AppError(400, `${fieldLabel} csak 0 és 10 közötti érték lehet.`);
  }
  return num;
}

function parseTolerance(value) {
  const num = Number(value);
  if (!Number.isInteger(num)) {
    throw new AppError(400, 'A skill balance tolerance százalék egész szám kell legyen.');
  }
  if (num < 0 || num > 100) {
    throw new AppError(400, 'A skill balance tolerance százalék csak 0 és 100 közötti lehet.');
  }
  return num;
}

function computeOverallSkill(member) {
  return Number(member.goalkeeper_score || 0)
    + Number(member.defense_score || 0)
    + Number(member.attack_score || 0);
}

function mapDrawMember(member) {
  return {
    member_id: member.member_id,
    user_id: member.user_id,
    name: member.name,
    email: member.email,
    role: member.role,
    primary_position: member.primary_position,
    skills_enabled: member.skills_enabled,
    goalkeeper_candidate: Boolean(member.is_goalkeeper),
    is_goalkeeper: false,
    goalkeeper_score: member.goalkeeper_score,
    defense_score: member.defense_score,
    attack_score: member.attack_score,
    overall_skill: computeOverallSkill(member)
  };
}

function calculateTeamTotal(team) {
  return team.reduce((sum, member) => sum + Number(member.overall_skill || 0), 0);
}

function calculateDifferencePercent(teamATotal, teamBTotal) {
  const stronger = Math.max(teamATotal, teamBTotal);
  const weaker = Math.min(teamATotal, teamBTotal);

  if (stronger === 0) return 0;

  return Number((((stronger - weaker) / stronger) * 100).toFixed(2));
}

function shuffleMembers(members) {
  const shuffled = [...members];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function buildNeutralDrawMember(member) {
  const base = mapDrawMember(member);

  return {
    ...base,
    skills_enabled: true,
    goalkeeper_score: NEUTRAL_SKILL_SCORE,
    defense_score: NEUTRAL_SKILL_SCORE,
    attack_score: NEUTRAL_SKILL_SCORE,
    overall_skill: NEUTRAL_SKILL_SCORE * 3
  };
}

function selectGoalkeeperCandidates(members, mode) {
  const candidates = members.filter(member => Boolean(member.goalkeeper_candidate));

  if (mode === 'random') {
    return shuffleMembers(candidates).slice(0, REQUIRED_GOALKEEPERS);
  }

  return [...candidates]
    .sort((a, b) => {
      const goalkeeperDiff = Number(b.goalkeeper_score || 0) - Number(a.goalkeeper_score || 0);
      if (goalkeeperDiff !== 0) return goalkeeperDiff;

      const overallDiff = Number(b.overall_skill || 0) - Number(a.overall_skill || 0);
      if (overallDiff !== 0) return overallDiff;

      return String(a.name || '').localeCompare(String(b.name || ''), 'hu');
    })
    .slice(0, REQUIRED_GOALKEEPERS);
}

function validateGoalkeeperRequirement(members, label) {
  const goalkeeperCount = members.filter(member => Boolean(member.is_goalkeeper)).length;

  if (goalkeeperCount < REQUIRED_GOALKEEPERS) {
    throw new AppError(400, `${label} Legalább ${REQUIRED_GOALKEEPERS} kapusnak jelölt játékos kell a sorsoláshoz. Most ${goalkeeperCount} érhető el.`);
  }

  return goalkeeperCount;
}

function buildBalancedTeams(members) {
  const mappedMembers = members.map(mapDrawMember);
  const selectedGoalkeepers = selectGoalkeeperCandidates(mappedMembers, 'skill');
  const selectedGoalkeeperIds = new Set(selectedGoalkeepers.map(member => member.member_id));
  const remainingMembers = mappedMembers
    .filter(member => !selectedGoalkeeperIds.has(member.member_id))
    .sort((a, b) => b.overall_skill - a.overall_skill);

  const teamA = [];
  const teamB = [];
  let teamATotal = 0;
  let teamBTotal = 0;

  if (selectedGoalkeepers[0]) {
    teamA.push({ ...selectedGoalkeepers[0], is_goalkeeper: true });
    teamATotal += selectedGoalkeepers[0].overall_skill;
  }

  if (selectedGoalkeepers[1]) {
    teamB.push({ ...selectedGoalkeepers[1], is_goalkeeper: true });
    teamBTotal += selectedGoalkeepers[1].overall_skill;
  }

  for (const member of remainingMembers) {
    const normalizedMember = { ...member, is_goalkeeper: false };

    if (teamATotal <= teamBTotal) {
      teamA.push(normalizedMember);
      teamATotal += normalizedMember.overall_skill;
    } else {
      teamB.push(normalizedMember);
      teamBTotal += normalizedMember.overall_skill;
    }
  }

  return {
    teamA,
    teamB,
    teamATotal,
    teamBTotal
  };
}

function buildRandomTeams(members) {
  const randomizedMembers = shuffleMembers(members).map(buildNeutralDrawMember);
  const selectedGoalkeepers = selectGoalkeeperCandidates(randomizedMembers, 'random');
  const selectedGoalkeeperIds = new Set(selectedGoalkeepers.map(member => member.member_id));
  const remainingMembers = shuffleMembers(
    randomizedMembers.filter(member => !selectedGoalkeeperIds.has(member.member_id))
  );

  const teamA = [];
  const teamB = [];

  if (selectedGoalkeepers[0]) {
    teamA.push({ ...selectedGoalkeepers[0], is_goalkeeper: true });
  }

  if (selectedGoalkeepers[1]) {
    teamB.push({ ...selectedGoalkeepers[1], is_goalkeeper: true });
  }

  remainingMembers.forEach(member => {
    const normalizedMember = { ...member, is_goalkeeper: false };

    if (teamA.length <= teamB.length) {
      teamA.push(normalizedMember);
    } else {
      teamB.push(normalizedMember);
    }
  });

  return {
    teamA,
    teamB,
    teamATotal: calculateTeamTotal(teamA),
    teamBTotal: calculateTeamTotal(teamB)
  };
}

function normalizeSavedDrawRow(row) {
  if (!row) return null;

  return {
    event_id: row.event_id,
    teamA: row.team_a_json || [],
    teamB: row.team_b_json || [],
    totals: row.totals_json || {},
    settings: row.settings_json || {},
    withinTolerance: Boolean(row.within_tolerance),
    status: row.status || DRAW_STATUS.SAVED,
    published_at: row.published_at,
    stale_at: row.stale_at,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function normalizeProvidedEventDraw(draw, eventId) {
  if (!draw || typeof draw !== 'object') {
    return null;
  }

  if (draw.event_id && String(draw.event_id) !== String(eventId)) {
    throw new AppError(400, 'A mentett preview nem ehhez az eseményhez tartozik.');
  }

  const teamA = Array.isArray(draw.teamA) ? draw.teamA : null;
  const teamB = Array.isArray(draw.teamB) ? draw.teamB : null;

  if (!teamA || !teamB) {
    throw new AppError(400, 'A mentéshez érvényes preview csapatleosztás kell.');
  }

  return {
    teamA,
    teamB,
    totals: draw.totals && typeof draw.totals === 'object' ? draw.totals : {},
    settings: draw.settings && typeof draw.settings === 'object' ? draw.settings : {},
    withinTolerance: Boolean(draw.withinTolerance)
  };
}

async function getEventById(eventId) {
  const result = await pool.query(
    `
    select
      e.id,
      e.team_id,
      e.title,
      e.status,
      e.start_at,
      e.location_name
    from events e
    where e.id = $1
    limit 1
    `,
    [eventId]
  );

  if (!result.rows[0]) {
    throw new AppError(404, 'Az esemény nem található.');
  }

  return result.rows[0];
}

async function getEventDrawMembers(eventId, { respectSkillEnabled = true } = {}) {
  const result = await pool.query(
    `
    select
      tm.id as member_id,
      tm.team_id,
      tm.user_id,
      tm.role,
      tm.membership_status,
      tm.skills_enabled,
      tm.primary_position,
      tm.is_goalkeeper,
      tm.goalkeeper_score,
      tm.defense_score,
      tm.attack_score,
      u.name,
      u.email
    from event_registrations er
    join team_members tm
      on tm.user_id = er.user_id
     and tm.team_id = er.team_id
    join users u
      on u.id = tm.user_id
    where er.event_id = $1
      and er.registration_status = 'going'
      and tm.membership_status = 'active'
      and ($2::boolean = false or tm.skills_enabled = true)
    order by u.name asc
    `,
    [eventId, respectSkillEnabled]
  );

  return result.rows;
}

async function assertTeamExists(teamId) {
  const teamResult = await pool.query(
    `
    select id, name, status,
           skill_balancing_enabled,
           skill_balance_tolerance_percent,
           rank_module_enabled
    from teams
    where id = $1
    `,
    [teamId]
  );

  if (teamResult.rows.length === 0) {
    throw new AppError(404, 'A csapat nem található.');
  }

  return teamResult.rows[0];
}

async function getSkillSettings(teamId) {
  const team = await assertTeamExists(teamId);

  return {
    message: 'Skill beállítások betöltve.',
    settings: {
      team_id: team.id,
      skill_balancing_enabled: team.skill_balancing_enabled,
      skill_balance_tolerance_percent: team.skill_balance_tolerance_percent,
      rank_module_enabled: team.rank_module_enabled,
      required_goalkeepers: REQUIRED_GOALKEEPERS
    }
  };
}

function resolveDrawMode(team) {
  if (team?.skill_balancing_enabled === false) {
    return 'random';
  }

  return 'skill';
}

function buildDrawResult({ members, mode, tolerance }) {
  const isRandomMode = mode === 'random';
  const { teamA, teamB, teamATotal, teamBTotal } = isRandomMode
    ? buildRandomTeams(members)
    : buildBalancedTeams(members);

  const difference = Math.abs(teamATotal - teamBTotal);
  const differencePercent = calculateDifferencePercent(teamATotal, teamBTotal);
  const withinTolerance = isRandomMode ? true : differencePercent <= tolerance;

  return {
    teamA,
    teamB,
    teamATotal,
    teamBTotal,
    difference,
    differencePercent,
    withinTolerance
  };
}

async function updateSkillSettings({ teamId, skillBalancingEnabled, skillBalanceTolerancePercent, rankModuleEnabled }) {
  const team = await assertTeamExists(teamId);

  const enabled =
    skillBalancingEnabled == null
      ? Boolean(team.skill_balancing_enabled)
      : toBoolean(skillBalancingEnabled, true);
  const tolerance =
    skillBalanceTolerancePercent == null
      ? Number(team.skill_balance_tolerance_percent ?? 15)
      : parseTolerance(skillBalanceTolerancePercent ?? 15);
  const rankEnabled =
    rankModuleEnabled == null
      ? Boolean(team.rank_module_enabled)
      : toBoolean(rankModuleEnabled, false);

  const updateResult = await pool.query(
    `
    update teams
    set skill_balancing_enabled = $2,
        skill_balance_tolerance_percent = $3,
        rank_module_enabled = $4,
        updated_at = now()
    where id = $1
    returning id, skill_balancing_enabled, skill_balance_tolerance_percent, rank_module_enabled
    `,
    [teamId, enabled, tolerance, rankEnabled]
  );

  return {
    message: 'Csapat skill beállítások mentve.',
    settings: {
      team_id: updateResult.rows[0].id,
      skill_balancing_enabled: updateResult.rows[0].skill_balancing_enabled,
      skill_balance_tolerance_percent: updateResult.rows[0].skill_balance_tolerance_percent,
      rank_module_enabled: updateResult.rows[0].rank_module_enabled,
      required_goalkeepers: REQUIRED_GOALKEEPERS
    }
  };
}

async function updateMemberRank({ teamId, memberId, rankValue, rankStatus }) {
  await assertTeamExists(teamId);

  const normalizedRankValue = normalizeRankValue(rankValue, 10);
  const normalizedRankStatus = normalizeRankStatus(rankStatus, 'guest');

  const memberResult = await pool.query(
    `
    select
      tm.id,
      tm.team_id,
      tm.user_id,
      tm.role,
      tm.membership_status,
      tm.rank_value,
      tm.rank_status,
      u.name,
      u.email
    from team_members tm
    join users u on u.id = tm.user_id
    where tm.team_id = $1
      and tm.id = $2
    `,
    [teamId, memberId]
  );

  if (memberResult.rows.length === 0) {
    throw new AppError(404, 'A csapattag nem található.');
  }

  const member = memberResult.rows[0];

  if (member.membership_status !== 'active') {
    throw new AppError(400, 'Csak aktív tag rangja módosítható.');
  }

  const updateResult = await pool.query(
    `
    update team_members
    set rank_value = $3,
        rank_status = $4,
        updated_at = now()
    where team_id = $1
      and id = $2
    returning id, team_id, user_id, role, membership_status, rank_value, rank_status
    `,
    [teamId, memberId, normalizedRankValue, normalizedRankStatus]
  );

  return {
    message: normalizedRankStatus === 'guest'
      ? 'Csapattag vendég státusza mentve.'
      : 'Csapattag rangja mentve.',
    member: {
      member_id: updateResult.rows[0].id,
      team_id: updateResult.rows[0].team_id,
      user_id: updateResult.rows[0].user_id,
      role: updateResult.rows[0].role,
      membership_status: updateResult.rows[0].membership_status,
      rank_value: updateResult.rows[0].rank_value,
      rank_status: updateResult.rows[0].rank_status,
      name: member.name,
      email: member.email
    }
  };
}

async function updateMemberSkills({ teamId, memberId, skillsEnabled, goalkeeperSkill, defenseSkill, attackSkill }) {
  await assertTeamExists(teamId);

  const memberResult = await pool.query(
    `
    select
      tm.id,
      tm.team_id,
      tm.user_id,
      tm.role,
      tm.membership_status,
      tm.skills_enabled,
      tm.is_goalkeeper,
      tm.goalkeeper_score,
      tm.defense_score,
      tm.attack_score,
      u.name,
      u.email
    from team_members tm
    join users u on u.id = tm.user_id
    where tm.team_id = $1
      and tm.id = $2
    `,
    [teamId, memberId]
  );

  if (memberResult.rows.length === 0) {
    throw new AppError(404, 'A csapattag nem található.');
  }

  const member = memberResult.rows[0];

  if (member.membership_status !== 'active') {
    throw new AppError(400, 'Csak aktív csapattag skillje szerkeszthető.');
  }

  const nextSkillsEnabled = toBoolean(skillsEnabled, true);
  const nextGoalkeeper = parseScore(goalkeeperSkill ?? 0, 'A kapus skill');
  const nextDefense = parseScore(defenseSkill ?? NEUTRAL_SKILL_SCORE, 'A védő skill');
  const nextAttack = parseScore(attackSkill ?? NEUTRAL_SKILL_SCORE, 'A támadó skill');

  const updateResult = await pool.query(
    `
    update team_members
    set skills_enabled = $3,
        goalkeeper_score = $4,
        defense_score = $5,
        attack_score = $6,
        updated_at = now()
    where id = $1
      and team_id = $2
    returning id, team_id, user_id, role, membership_status,
              skills_enabled, is_goalkeeper, goalkeeper_score, defense_score, attack_score
    `,
    [memberId, teamId, nextSkillsEnabled, nextGoalkeeper, nextDefense, nextAttack]
  );

  const updated = updateResult.rows[0];

  return {
    message: 'Csapattag skill adatai mentve.',
    member: {
      member_id: updated.id,
      team_id: updated.team_id,
      user_id: updated.user_id,
      name: member.name,
      email: member.email,
      role: updated.role,
      membership_status: updated.membership_status,
      skills_enabled: updated.skills_enabled,
      is_goalkeeper: updated.is_goalkeeper,
      goalkeeper_skill: updated.goalkeeper_score,
      defense_skill: updated.defense_score,
      attack_skill: updated.attack_score
    }
  };
}

async function updateMemberGoalkeeperRole({ teamId, memberId, isGoalkeeper }) {
  await assertTeamExists(teamId);

  return withTransaction(async client => {
    const memberResult = await client.query(
      `
      select
        tm.id,
        tm.team_id,
        tm.user_id,
        tm.role,
        tm.membership_status,
        tm.skills_enabled,
        tm.is_goalkeeper,
        tm.goalkeeper_score,
        tm.defense_score,
        tm.attack_score,
        u.name,
        u.email
      from team_members tm
      join users u on u.id = tm.user_id
      where tm.team_id = $1
        and tm.id = $2
      for update
      `,
      [teamId, memberId]
    );

    if (memberResult.rows.length === 0) {
      throw new AppError(404, 'A csapattag nem található.');
    }

    const member = memberResult.rows[0];

    if (member.membership_status !== 'active') {
      throw new AppError(400, 'Csak aktív csapattag kapus szerepköre szerkeszthető.');
    }

    const nextIsGoalkeeper = toBoolean(isGoalkeeper, false);

    const updateResult = await client.query(
      `
      update team_members
      set is_goalkeeper = $3,
          updated_at = now()
      where id = $1
        and team_id = $2
      returning id, team_id, user_id, role, membership_status,
                skills_enabled, is_goalkeeper, goalkeeper_score, defense_score, attack_score
      `,
      [memberId, teamId, nextIsGoalkeeper]
    );

    const updated = updateResult.rows[0];

    const affectedEventResult = await client.query(
      `
      select distinct er.event_id
      from event_registrations er
      join event_team_draws etd on etd.event_id = er.event_id
      where er.team_id = $1
        and er.user_id = $2
        and er.registration_status = 'going'
        and etd.status = $3
      `,
      [teamId, updated.user_id, DRAW_STATUS.PUBLISHED]
    );

    const staleEventIds = [];

    for (const row of affectedEventResult.rows) {
      const staleResult = await markPublishedEventDrawStale({
        eventId: row.event_id,
        client
      });

      if (staleResult.changed) {
        staleEventIds.push(row.event_id);
      }
    }

    const roleMessage = nextIsGoalkeeper
      ? 'A csapattag kapusnak jelölve.'
      : 'A csapattag mezőnyjátékosra állítva.';

    return {
      message: staleEventIds.length > 0
        ? `${roleMessage} A kapcsolódó, korábban kihirdetett csapatleosztás elavult (stale) állapotba került.`
        : roleMessage,
      member: {
        member_id: updated.id,
        team_id: updated.team_id,
        user_id: updated.user_id,
        name: member.name,
        email: member.email,
        role: updated.role,
        membership_status: updated.membership_status,
        skills_enabled: updated.skills_enabled,
        is_goalkeeper: updated.is_goalkeeper,
        goalkeeper_skill: updated.goalkeeper_score,
        defense_skill: updated.defense_score,
        attack_skill: updated.attack_score
      },
      staleEventIds
    };
  });
}

async function previewBalancedTeams({ teamId }) {
  const team = await assertTeamExists(teamId);
  const drawMode = resolveDrawMode(team);
  const respectSkillEnabled = drawMode === 'skill';

  const memberResult = await pool.query(
    `
    select
      tm.id as member_id,
      tm.team_id,
      tm.user_id,
      tm.role,
      tm.membership_status,
      tm.skills_enabled,
      tm.primary_position,
      tm.is_goalkeeper,
      tm.goalkeeper_score,
      tm.defense_score,
      tm.attack_score,
      u.name,
      u.email
    from team_members tm
    join users u on u.id = tm.user_id
    where tm.team_id = $1
      and tm.membership_status = 'active'
      and ($2::boolean = false or tm.skills_enabled = true)
    order by u.name asc
    `,
    [teamId, respectSkillEnabled]
  );

  const members = memberResult.rows;

  if (members.length < 2) {
    throw new AppError(
      400,
      drawMode === 'skill'
        ? 'Legalább 2 aktív, skill-engedélyezett tag kell a csapatsorsolás previewhoz.'
        : 'Legalább 2 aktív tag kell a random csapatsorsolás previewhoz.'
    );
  }

  validateGoalkeeperRequirement(members, drawMode === 'skill'
    ? 'A skill alapú csapatsorsoláshoz.'
    : 'A random csapatsorsoláshoz.');

  const tolerance = Number(team.skill_balance_tolerance_percent ?? 15);
  const drawResult = buildDrawResult({
    members,
    mode: drawMode,
    tolerance
  });

  return {
    message: drawMode === 'skill'
      ? 'Csapatsorsolás preview elkészült.'
      : 'Random csapatsorsolás preview elkészült. A skill modul ki van kapcsolva, minden játékos 5-5-5 alapállapotból kerül sorsolásra.',
    draw: {
      team_id: team.id,
      team_name: team.name,
      source_member_count: members.length,
      teamA: drawResult.teamA,
      teamB: drawResult.teamB,
      totals: {
        teamA: drawResult.teamATotal,
        teamB: drawResult.teamBTotal,
        difference: drawResult.difference,
        differencePercent: drawResult.differencePercent
      },
      settings: {
        skillBalancingEnabled: Boolean(team.skill_balancing_enabled),
        skillBalanceTolerancePercent: tolerance,
        generationMode: drawMode,
        requiredGoalkeepers: REQUIRED_GOALKEEPERS
      },
      withinTolerance: drawResult.withinTolerance
    }
  };
}

async function previewEventBalancedTeams({ eventId }) {
  const event = await getEventById(eventId);
  const team = await assertTeamExists(event.team_id);
  const drawMode = resolveDrawMode(team);
  const members = await getEventDrawMembers(eventId, {
    respectSkillEnabled: drawMode === 'skill'
  });

  if (members.length < 2) {
    throw new AppError(
      400,
      drawMode === 'skill'
        ? 'Legalább 2 aktív, jelentkezett és skill-engedélyezett játékos kell a csapatleosztáshoz.'
        : 'Legalább 2 aktív, jelentkezett játékos kell a random csapatleosztáshoz.'
    );
  }

  validateGoalkeeperRequirement(members, drawMode === 'skill'
    ? 'Az esemény skill alapú csapatleosztásához.'
    : 'Az esemény random csapatleosztásához.');

  const tolerance = Number(team.skill_balance_tolerance_percent ?? 15);
  const drawResult = buildDrawResult({
    members,
    mode: drawMode,
    tolerance
  });

  return {
    message: drawMode === 'skill'
      ? 'Esemény alapú csapatsorsolás preview elkészült.'
      : 'Random esemény csapatsorsolás preview elkészült. A skill modul ki van kapcsolva, minden játékos 5-5-5 alapállapotból kerül sorsolásra.',
    draw: {
      event_id: event.id,
      event_title: event.title,
      team_id: team.id,
      team_name: team.name,
      source_member_count: members.length,
      teamA: drawResult.teamA,
      teamB: drawResult.teamB,
      totals: {
        teamA: drawResult.teamATotal,
        teamB: drawResult.teamBTotal,
        difference: drawResult.difference,
        differencePercent: drawResult.differencePercent
      },
      settings: {
        skillBalancingEnabled: Boolean(team.skill_balancing_enabled),
        skillBalanceTolerancePercent: tolerance,
        generationMode: drawMode,
        requiredGoalkeepers: REQUIRED_GOALKEEPERS
      },
      withinTolerance: drawResult.withinTolerance,
      status: 'preview',
      persisted: false
    }
  };
}

async function getPersistedEventTeamDrawRow({ eventId, client = pool, forUpdate = false }) {
  const result = await client.query(
    `
    select *
    from event_team_draws
    where event_id = $1
    limit 1
    ${forUpdate ? 'for update' : ''}
    `,
    [eventId]
  );

  return result.rows[0] || null;
}

async function markPublishedEventDrawStale({ eventId, client = pool }) {
  const existingDraw = await getPersistedEventTeamDrawRow({
    eventId,
    client,
    forUpdate: true
  });

  if (!existingDraw || existingDraw.status !== DRAW_STATUS.PUBLISHED) {
    return {
      changed: false,
      draw: normalizeSavedDrawRow(existingDraw)
    };
  }

  const result = await client.query(
    `
    update event_team_draws
    set status = $2,
        stale_at = coalesce(stale_at, now()),
        updated_at = now()
    where event_id = $1
    returning *
    `,
    [eventId, DRAW_STATUS.STALE]
  );

  return {
    changed: true,
    draw: normalizeSavedDrawRow(result.rows[0])
  };
}

async function saveEventTeamDraw({ eventId, userId, draw }) {
  await getEventById(eventId);

  return withTransaction(async client => {
    const existingDraw = await getPersistedEventTeamDrawRow({
      eventId,
      client,
      forUpdate: true
    });

    if (existingDraw && existingDraw.status === DRAW_STATUS.PUBLISHED) {
      throw new AppError(
        409,
        'A kihirdetett csapatleosztás nem írható felül mentéssel. Készíts új admin döntést a következő lépésben.'
      );
    }

    const normalizedProvidedDraw = normalizeProvidedEventDraw(draw, eventId);
    const persistedDraw = normalizedProvidedDraw || (await previewEventBalancedTeams({ eventId })).draw;

    const result = await client.query(
      `
      insert into event_team_draws (
        event_id,
        team_a_json,
        team_b_json,
        totals_json,
        settings_json,
        within_tolerance,
        status,
        published_at,
        stale_at,
        created_by_user_id,
        created_at,
        updated_at
      )
      values (
        $1,
        $2::jsonb,
        $3::jsonb,
        $4::jsonb,
        $5::jsonb,
        $6,
        $7,
        null,
        null,
        $8,
        now(),
        now()
      )
      on conflict (event_id)
      do update set
        team_a_json = excluded.team_a_json,
        team_b_json = excluded.team_b_json,
        totals_json = excluded.totals_json,
        settings_json = excluded.settings_json,
        within_tolerance = excluded.within_tolerance,
        status = excluded.status,
        published_at = excluded.published_at,
        stale_at = excluded.stale_at,
        created_by_user_id = excluded.created_by_user_id,
        updated_at = now()
      returning *
      `,
      [
        eventId,
        JSON.stringify(persistedDraw.teamA || []),
        JSON.stringify(persistedDraw.teamB || []),
        JSON.stringify(persistedDraw.totals || {}),
        JSON.stringify(persistedDraw.settings || {}),
        Boolean(persistedDraw.withinTolerance),
        DRAW_STATUS.SAVED,
        userId
      ]
    );

    return {
      message: normalizedProvidedDraw
        ? 'Az esemény csapatleosztása a látható preview alapján mentve.'
        : 'Az esemény csapatleosztása mentve.',
      draw: normalizeSavedDrawRow(result.rows[0])
    };
  });
}

async function publishEventTeamDraw({ eventId }) {
  const event = await getEventById(eventId);
  const team = await assertTeamExists(event.team_id);

  return withTransaction(async client => {
    const existingDraw = await getPersistedEventTeamDrawRow({
      eventId,
      client,
      forUpdate: true
    });

    if (!existingDraw) {
      throw new AppError(404, 'Ehhez az eseményhez még nincs mentett csapatleosztás.');
    }

    if (existingDraw.status === DRAW_STATUS.PUBLISHED) {
      return {
        message: 'Az esemény csapatleosztása már kihirdetett állapotban van.',
        draw: normalizeSavedDrawRow(existingDraw)
      };
    }

    if (existingDraw.status !== DRAW_STATUS.SAVED) {
      throw new AppError(
        409,
        'Csak saved állapotú csapatleosztás hirdethető ki.'
      );
    }

    const drawMode = resolveDrawMode(team);
    const currentMembers = await getEventDrawMembers(eventId, {
      respectSkillEnabled: drawMode === 'skill'
    });
    validateGoalkeeperRequirement(
      currentMembers,
      'A kihirdetéshez.'
    );

    const result = await client.query(
      `
      update event_team_draws
      set status = $2,
          published_at = coalesce(published_at, now()),
          stale_at = null,
          updated_at = now()
      where event_id = $1
      returning *
      `,
      [eventId, DRAW_STATUS.PUBLISHED]
    );

    return {
      message: 'Az esemény csapatleosztása kihirdetve.',
      draw: normalizeSavedDrawRow(result.rows[0])
    };
  });
}

async function getEventTeamDraw({ eventId }) {
  await getEventById(eventId);

  const row = await getPersistedEventTeamDrawRow({ eventId });

  return {
    message: 'Mentett csapatleosztás lekérve.',
    draw: normalizeSavedDrawRow(row)
  };
}

module.exports = {
  getSkillSettings,
  updateSkillSettings,
  updateMemberRank,
  updateMemberSkills,
  updateMemberGoalkeeperRole,
  previewBalancedTeams,
  previewEventBalancedTeams,
  saveEventTeamDraw,
  publishEventTeamDraw,
  getEventTeamDraw,
  markPublishedEventDrawStale,
  DRAW_STATUS
};
