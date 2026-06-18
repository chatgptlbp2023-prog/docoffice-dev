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
const STRONG_SKILL_THRESHOLD = 8;
const AUTO_BALANCE_EXHAUSTIVE_LIMIT = 16;
const AUTO_BALANCE_RANDOM_TRIALS = 700;
const DRAW_STRATEGIES = Object.freeze({
  AUTO_BALANCED: 'auto_balanced',
  RANDOM: 'random',
  SUM_BALANCE: 'sum_balance',
  COUNTER_PAIR_BALANCE: 'counter_pair_balance',
  ROLE_BALANCE: 'role_balance',
  OPTIMIZED: 'optimized'
});

const ALLOWED_DRAW_STRATEGIES = new Set(Object.values(DRAW_STRATEGIES));

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
    is_guest: Boolean(member.is_guest),
    guest_registration_id: member.guest_registration_id || null,
    host_user_id: member.host_user_id || null,
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

function calculateTeamProfile(team = []) {
  return team.reduce((profile, member) => {
    const goalkeeperScore = Number(member.goalkeeper_score || 0);
    const defenseScore = Number(member.defense_score || 0);
    const attackScore = Number(member.attack_score || 0);
    const overallScore = Number(member.overall_skill || goalkeeperScore + defenseScore + attackScore);
    const goalkeeperCandidate = Boolean(member.goalkeeper_candidate || member.is_goalkeeper);

    profile.size += 1;
    profile.goalkeeperStrength += goalkeeperCandidate ? goalkeeperScore : 0;
    profile.defenseStrength += defenseScore;
    profile.attackStrength += attackScore;
    profile.overallStrength += overallScore;
    profile.goalkeeperCount += goalkeeperCandidate ? 1 : 0;
    profile.strongAttackers += attackScore >= STRONG_SKILL_THRESHOLD ? 1 : 0;
    profile.strongDefenders += defenseScore >= STRONG_SKILL_THRESHOLD ? 1 : 0;

    return profile;
  }, {
    size: 0,
    goalkeeperStrength: 0,
    defenseStrength: 0,
    attackStrength: 0,
    overallStrength: 0,
    goalkeeperCount: 0,
    strongAttackers: 0,
    strongDefenders: 0
  });
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

function isGoalkeeperModuleEnabled(team) {
  return team?.goalkeeper_module_enabled !== false;
}

function buildSumBalancedTeams(members) {
  const mappedMembers = members.map(mapDrawMember);
  const maxTeamSize = Math.ceil(mappedMembers.length / 2);
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

    if (teamA.length >= maxTeamSize) {
      teamB.push(normalizedMember);
      teamBTotal += normalizedMember.overall_skill;
    } else if (teamB.length >= maxTeamSize) {
      teamA.push(normalizedMember);
      teamATotal += normalizedMember.overall_skill;
    } else if (teamATotal <= teamBTotal) {
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

function applyGoalkeeperFlags(team = []) {
  return team.map(member => ({
    ...member,
    is_goalkeeper: Boolean(member.goalkeeper_candidate)
  }));
}

function normalizeCandidateTeams(teamA, teamB) {
  return {
    teamA: applyGoalkeeperFlags(teamA),
    teamB: applyGoalkeeperFlags(teamB)
  };
}

function scoreDrawCandidate(teamA, teamB, options = {}) {
  const { goalkeeperModuleEnabled = true } = options;
  const profileA = calculateTeamProfile(teamA);
  const profileB = calculateTeamProfile(teamB);
  const sizeDiff = Math.abs(profileA.size - profileB.size);
  const overallDiff = Math.abs(profileA.overallStrength - profileB.overallStrength);
  const attackDiff = Math.abs(profileA.attackStrength - profileB.attackStrength);
  const defenseDiff = Math.abs(profileA.defenseStrength - profileB.defenseStrength);
  const goalkeeperDiff = Math.abs(profileA.goalkeeperStrength - profileB.goalkeeperStrength);
  const strongAttackerDiff = Math.abs(profileA.strongAttackers - profileB.strongAttackers);
  const strongDefenderDiff = Math.abs(profileA.strongDefenders - profileB.strongDefenders);
  const counterA = profileB.defenseStrength + (profileB.goalkeeperStrength * 0.7);
  const counterB = profileA.defenseStrength + (profileA.goalkeeperStrength * 0.7);
  const attackOverloadA = Math.max(profileA.attackStrength - counterA, 0);
  const attackOverloadB = Math.max(profileB.attackStrength - counterB, 0);
  let fairnessScore = 0;

  fairnessScore += sizeDiff > 1 ? 100000 : sizeDiff * 300;
  fairnessScore += overallDiff * 2.2;
  fairnessScore += attackDiff * 3.1;
  fairnessScore += defenseDiff * 2.6;
  fairnessScore += goalkeeperDiff * 1.7;
  fairnessScore += strongAttackerDiff * 90;
  fairnessScore += strongDefenderDiff * 35;
  fairnessScore += Math.max(attackOverloadA - 6, 0) * 8;
  fairnessScore += Math.max(attackOverloadB - 6, 0) * 8;

  if (goalkeeperModuleEnabled) {
    if (profileA.goalkeeperCount === 0 || profileB.goalkeeperCount === 0) {
      fairnessScore += 60000;
    }
  } else if ((profileA.goalkeeperCount + profileB.goalkeeperCount) >= REQUIRED_GOALKEEPERS) {
    if (profileA.goalkeeperCount === 0 || profileB.goalkeeperCount === 0) {
      fairnessScore += 250;
    }
  }

  if (profileA.strongAttackers > 1 && profileB.strongDefenders === 0 && profileB.goalkeeperCount === 0) {
    fairnessScore += 180;
  }

  if (profileB.strongAttackers > 1 && profileA.strongDefenders === 0 && profileA.goalkeeperCount === 0) {
    fairnessScore += 180;
  }

  return {
    fairnessScore: Number(fairnessScore.toFixed(2)),
    profiles: {
      teamA: profileA,
      teamB: profileB
    }
  };
}

function buildDrawExplanation({ teamA, teamB, strategy, fairnessScore }) {
  const profileA = calculateTeamProfile(teamA);
  const profileB = calculateTeamProfile(teamB);
  const overallDiffPercent = calculateDifferencePercent(profileA.overallStrength, profileB.overallStrength);
  const attackDiff = Math.abs(profileA.attackStrength - profileB.attackStrength);
  const defenseDiff = Math.abs(profileA.defenseStrength - profileB.defenseStrength);
  const goalkeeperSeparated = profileA.goalkeeperCount > 0 && profileB.goalkeeperCount > 0;
  const bullets = [];

  if (strategy === DRAW_STRATEGIES.RANDOM) {
    bullets.push('A skill modul ki van kapcsolva, ezért gyors random leosztás készült.');
  } else {
    bullets.push(`A két csapat összereje ${overallDiffPercent}%-on belül van.`);
    bullets.push(attackDiff <= 3
      ? 'A támadóerő közel azonos.'
      : 'A támadóerőt védő- és kapuserővel ellensúlyoztam.');
    bullets.push(defenseDiff <= 3
      ? 'A védekező erő kiegyensúlyozott.'
      : 'A védekező különbséget összerőben kompenzáltam.');

    if (Math.abs(profileA.strongAttackers - profileB.strongAttackers) === 0 && (profileA.strongAttackers + profileB.strongAttackers) > 1) {
      bullets.push('A legerősebb támadók nem kerültek egy oldalra.');
    }

    if (goalkeeperSeparated) {
      bullets.push('A kapusjelöltek külön csapatba kerültek.');
    }
  }

  return {
    summary: strategy === DRAW_STRATEGIES.RANDOM
      ? 'Gyors random leosztás készült.'
      : 'Automatikusan kiegyensúlyozott leosztás készült.',
    bullets: bullets.slice(0, 4),
    profiles: {
      teamA: {
        overallStrength: profileA.overallStrength,
        defenseStrength: profileA.defenseStrength,
        attackStrength: profileA.attackStrength,
        goalkeeperStrength: profileA.goalkeeperStrength
      },
      teamB: {
        overallStrength: profileB.overallStrength,
        defenseStrength: profileB.defenseStrength,
        attackStrength: profileB.attackStrength,
        goalkeeperStrength: profileB.goalkeeperStrength
      }
    },
    fairnessScore
  };
}

function buildCombinationCandidates(items, pickSize, onCandidate) {
  const selectedIndexes = [];

  function visit(startIndex) {
    if (selectedIndexes.length === pickSize) {
      onCandidate(new Set(selectedIndexes));
      return;
    }

    const remainingNeeded = pickSize - selectedIndexes.length;
    for (let index = startIndex; index <= items.length - remainingNeeded; index += 1) {
      selectedIndexes.push(index);
      visit(index + 1);
      selectedIndexes.pop();
    }
  }

  visit(0);
}

function evaluateAutoCandidate(teamA, teamB, options, bestCandidate) {
  const normalized = normalizeCandidateTeams(teamA, teamB);
  const score = scoreDrawCandidate(normalized.teamA, normalized.teamB, options);

  if (!bestCandidate || score.fairnessScore < bestCandidate.fairnessScore) {
    return {
      ...normalized,
      fairnessScore: score.fairnessScore,
      profiles: score.profiles
    };
  }

  return bestCandidate;
}

function buildAutoBalancedTeams(members, options = {}) {
  const mappedMembers = members.map(mapDrawMember);
  const memberCount = mappedMembers.length;
  const targetSizes = Array.from(new Set([
    Math.floor(memberCount / 2),
    Math.ceil(memberCount / 2)
  ])).filter(size => size > 0 && size < memberCount);
  let bestCandidate = null;

  try {
    if (memberCount <= AUTO_BALANCE_EXHAUSTIVE_LIMIT) {
      for (const targetSize of targetSizes) {
        buildCombinationCandidates(mappedMembers, targetSize, teamAIndexes => {
          const teamA = [];
          const teamB = [];

          mappedMembers.forEach((member, index) => {
            if (teamAIndexes.has(index)) {
              teamA.push(member);
            } else {
              teamB.push(member);
            }
          });

          bestCandidate = evaluateAutoCandidate(teamA, teamB, options, bestCandidate);
        });
      }
    } else {
      for (let trial = 0; trial < AUTO_BALANCE_RANDOM_TRIALS; trial += 1) {
        const shuffled = shuffleMembers(mappedMembers);
        const targetSize = targetSizes[trial % targetSizes.length] || Math.ceil(memberCount / 2);
        bestCandidate = evaluateAutoCandidate(
          shuffled.slice(0, targetSize),
          shuffled.slice(targetSize),
          options,
          bestCandidate
        );
      }
    }

    const sumBalanced = buildSumBalancedTeams(members);
    bestCandidate = evaluateAutoCandidate(sumBalanced.teamA, sumBalanced.teamB, options, bestCandidate);

    if (!bestCandidate) {
      return {
        ...sumBalanced,
        explanation: buildDrawExplanation({
          teamA: sumBalanced.teamA,
          teamB: sumBalanced.teamB,
          strategy: DRAW_STRATEGIES.SUM_BALANCE,
          fairnessScore: 0
        }),
        fallbackUsed: true
      };
    }

    return {
      teamA: bestCandidate.teamA,
      teamB: bestCandidate.teamB,
      teamATotal: calculateTeamTotal(bestCandidate.teamA),
      teamBTotal: calculateTeamTotal(bestCandidate.teamB),
      explanation: buildDrawExplanation({
        teamA: bestCandidate.teamA,
        teamB: bestCandidate.teamB,
        strategy: DRAW_STRATEGIES.AUTO_BALANCED,
        fairnessScore: bestCandidate.fairnessScore
      }),
      fallbackUsed: false
    };
  } catch (error) {
    const fallback = buildSumBalancedTeams(members);

    return {
      ...fallback,
      explanation: buildDrawExplanation({
        teamA: fallback.teamA,
        teamB: fallback.teamB,
        strategy: DRAW_STRATEGIES.SUM_BALANCE,
        fairnessScore: scoreDrawCandidate(fallback.teamA, fallback.teamB, options).fairnessScore
      }),
      fallbackUsed: true
    };
  }
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

  const settings = row.settings_json || {};

  return {
    event_id: row.event_id,
    teamA: row.team_a_json || [],
    teamB: row.team_b_json || [],
    totals: row.totals_json || {},
    settings,
    explanation: settings.explanation || null,
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
    settings: draw.settings && typeof draw.settings === 'object'
      ? {
          ...draw.settings,
          ...(draw.explanation && typeof draw.explanation === 'object' ? { explanation: draw.explanation } : {})
        }
      : (draw.explanation && typeof draw.explanation === 'object' ? { explanation: draw.explanation } : {}),
    explanation: draw.explanation && typeof draw.explanation === 'object' ? draw.explanation : null,
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
    select *
    from (
      select
        tm.id::text as member_id,
        tm.team_id,
        tm.user_id,
        false as is_guest,
        null::uuid as guest_registration_id,
        null::uuid as host_user_id,
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

      union all

      select
        ('guest:' || egr.id::text) as member_id,
        egr.team_id,
        null::uuid as user_id,
        true as is_guest,
        egr.id as guest_registration_id,
        egr.host_user_id,
        'guest' as role,
        'active' as membership_status,
        true as skills_enabled,
        null::text as primary_position,
        false as is_goalkeeper,
        $3::int as goalkeeper_score,
        $3::int as defense_score,
        $3::int as attack_score,
        egr.guest_name as name,
        null::text as email
      from event_guest_registrations egr
      where egr.event_id = $1
        and egr.registration_status = 'going'
    ) draw_members
    order by name asc
    `,
    [eventId, respectSkillEnabled, NEUTRAL_SKILL_SCORE]
  );

  return result.rows;
}

async function assertTeamExists(teamId) {
  const teamResult = await pool.query(
    `
    select id, name, status,
           skill_balancing_enabled,
           skill_balance_tolerance_percent,
           draw_strategy,
           goalkeeper_module_enabled,
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
      draw_strategy: resolveDrawStrategy(team),
      goalkeeper_module_enabled: isGoalkeeperModuleEnabled(team),
      rank_module_enabled: team.rank_module_enabled,
      required_goalkeepers: REQUIRED_GOALKEEPERS
    }
  };
}

function resolveDrawMode(team) {
  if (resolveDrawStrategy(team) === DRAW_STRATEGIES.RANDOM) {
    return 'random';
  }

  return 'skill';
}

function resolveDrawStrategy(team, requestedStrategy = null) {
  if (team?.skill_balancing_enabled === false) {
    return DRAW_STRATEGIES.RANDOM;
  }

  const requested = String(requestedStrategy || '').trim();
  if (ALLOWED_DRAW_STRATEGIES.has(requested)) {
    return requested;
  }

  const rawStrategy = String(team?.draw_strategy || '').trim();
  if (ALLOWED_DRAW_STRATEGIES.has(rawStrategy)) {
    return rawStrategy;
  }

  return DRAW_STRATEGIES.AUTO_BALANCED;
}

function buildDrawResult({ members, mode, strategy, tolerance, goalkeeperModuleEnabled = true }) {
  const effectiveStrategy = strategy || (mode === 'random' ? DRAW_STRATEGIES.RANDOM : DRAW_STRATEGIES.AUTO_BALANCED);
  const isRandomMode = mode === 'random' || effectiveStrategy === DRAW_STRATEGIES.RANDOM;
  let drawTeams;

  if (isRandomMode) {
    drawTeams = buildRandomTeams(members);
  } else if (effectiveStrategy === DRAW_STRATEGIES.SUM_BALANCE) {
    drawTeams = buildSumBalancedTeams(members);
  } else {
    drawTeams = buildAutoBalancedTeams(members, { goalkeeperModuleEnabled });
  }

  const { teamA, teamB, teamATotal, teamBTotal } = drawTeams;

  const difference = Math.abs(teamATotal - teamBTotal);
  const differencePercent = calculateDifferencePercent(teamATotal, teamBTotal);
  const withinTolerance = isRandomMode ? true : differencePercent <= tolerance;
  const fairnessScore = drawTeams.explanation?.fairnessScore
    ?? scoreDrawCandidate(teamA, teamB, { goalkeeperModuleEnabled }).fairnessScore;
  const explanation = drawTeams.explanation || buildDrawExplanation({
    teamA,
    teamB,
    strategy: effectiveStrategy,
    fairnessScore
  });

  return {
    teamA,
    teamB,
    teamATotal,
    teamBTotal,
    difference,
    differencePercent,
    withinTolerance,
    strategy: effectiveStrategy,
    explanation,
    fallbackUsed: Boolean(drawTeams.fallbackUsed)
  };
}

async function updateSkillSettings({ teamId, skillBalancingEnabled, skillBalanceTolerancePercent, goalkeeperModuleEnabled, rankModuleEnabled }) {
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
  const goalkeeperEnabled =
    goalkeeperModuleEnabled == null
      ? isGoalkeeperModuleEnabled(team)
      : toBoolean(goalkeeperModuleEnabled, true);

  const updateResult = await pool.query(
    `
    update teams
    set skill_balancing_enabled = $2,
        skill_balance_tolerance_percent = $3,
        rank_module_enabled = $4,
        goalkeeper_module_enabled = $5,
        updated_at = now()
    where id = $1
    returning id, skill_balancing_enabled, skill_balance_tolerance_percent, draw_strategy, goalkeeper_module_enabled, rank_module_enabled
    `,
    [teamId, enabled, tolerance, rankEnabled, goalkeeperEnabled]
  );

  return {
    message: 'Csapat skill beállítások mentve.',
    settings: {
      team_id: updateResult.rows[0].id,
      skill_balancing_enabled: updateResult.rows[0].skill_balancing_enabled,
      skill_balance_tolerance_percent: updateResult.rows[0].skill_balance_tolerance_percent,
      draw_strategy: resolveDrawStrategy(updateResult.rows[0]),
      goalkeeper_module_enabled: updateResult.rows[0].goalkeeper_module_enabled,
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

async function updateMySkills({ teamId, userId, goalkeeperSkill, defenseSkill, attackSkill, isGoalkeeper }) {
  const team = await assertTeamExists(teamId);

  if (team.skill_balancing_enabled === false) {
    throw new AppError(400, 'A skill modul ennél a csapatnál nincs bekapcsolva.');
  }

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
        and tm.user_id = $2
        and tm.membership_status = 'active'
      for update
      `,
      [teamId, userId]
    );

    if (memberResult.rows.length === 0) {
      throw new AppError(404, 'Nincs aktív tagságod ebben a csapatban.');
    }

    const member = memberResult.rows[0];
    const nextGoalkeeper = parseScore(goalkeeperSkill ?? member.goalkeeper_score ?? 0, 'A kapus skill');
    const nextDefense = parseScore(defenseSkill ?? member.defense_score ?? NEUTRAL_SKILL_SCORE, 'A védő skill');
    const nextAttack = parseScore(attackSkill ?? member.attack_score ?? NEUTRAL_SKILL_SCORE, 'A támadó skill');
    const nextIsGoalkeeper = toBoolean(isGoalkeeper, Boolean(member.is_goalkeeper));

    const updateResult = await client.query(
      `
      update team_members
      set is_goalkeeper = $3,
          goalkeeper_score = $4,
          defense_score = $5,
          attack_score = $6,
          updated_at = now()
      where id = $1
        and team_id = $2
      returning id, team_id, user_id, role, membership_status,
                skills_enabled, is_goalkeeper, goalkeeper_score, defense_score, attack_score
      `,
      [member.id, teamId, nextIsGoalkeeper, nextGoalkeeper, nextDefense, nextAttack]
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

    return {
      message: staleEventIds.length > 0
        ? 'Saját skill értékeid mentve. A kapcsolódó, korábban kihirdetett csapatleosztás elavult állapotba került.'
        : 'Saját skill értékeid mentve.',
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
        goalkeeper_score: updated.goalkeeper_score,
        defense_score: updated.defense_score,
        attack_score: updated.attack_score,
        goalkeeper_skill: updated.goalkeeper_score,
        defense_skill: updated.defense_score,
        attack_skill: updated.attack_score
      },
      staleEventIds
    };
  });
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

async function previewBalancedTeams({ teamId, strategy = null }) {
  const team = await assertTeamExists(teamId);
  const drawStrategy = resolveDrawStrategy(team, strategy);
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

  if (isGoalkeeperModuleEnabled(team)) {
    validateGoalkeeperRequirement(members, drawMode === 'skill'
    ? 'A skill alapú csapatsorsoláshoz.'
    : 'A random csapatsorsoláshoz.');

  }

  const tolerance = Number(team.skill_balance_tolerance_percent ?? 15);
  const drawResult = buildDrawResult({
    members,
    mode: drawMode,
    strategy: drawStrategy,
    goalkeeperModuleEnabled: isGoalkeeperModuleEnabled(team),
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
        strategy: drawResult.strategy,
        fallbackUsed: drawResult.fallbackUsed,
        goalkeeperModuleEnabled: isGoalkeeperModuleEnabled(team),
        generationMode: drawMode,
        requiredGoalkeepers: REQUIRED_GOALKEEPERS
      },
      explanation: drawResult.explanation,
      withinTolerance: drawResult.withinTolerance
    }
  };
}

async function previewEventBalancedTeams({ eventId, strategy = null }) {
  const event = await getEventById(eventId);
  const team = await assertTeamExists(event.team_id);
  const drawStrategy = resolveDrawStrategy(team, strategy);
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

  if (isGoalkeeperModuleEnabled(team)) {
    validateGoalkeeperRequirement(members, drawMode === 'skill'
    ? 'Az esemény skill alapú csapatleosztásához.'
    : 'Az esemény random csapatleosztásához.');

  }

  const tolerance = Number(team.skill_balance_tolerance_percent ?? 15);
  const drawResult = buildDrawResult({
    members,
    mode: drawMode,
    strategy: drawStrategy,
    goalkeeperModuleEnabled: isGoalkeeperModuleEnabled(team),
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
        strategy: drawResult.strategy,
        fallbackUsed: drawResult.fallbackUsed,
        goalkeeperModuleEnabled: isGoalkeeperModuleEnabled(team),
        generationMode: drawMode,
        requiredGoalkeepers: REQUIRED_GOALKEEPERS
      },
      explanation: drawResult.explanation,
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
    const persistedSettings = {
      ...(persistedDraw.settings || {}),
      ...(persistedDraw.explanation && typeof persistedDraw.explanation === 'object'
        ? { explanation: persistedDraw.explanation }
        : {})
    };

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
        JSON.stringify(persistedSettings),
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
    if (isGoalkeeperModuleEnabled(team)) {
      validateGoalkeeperRequirement(
        currentMembers,
        'A kihirdetéshez.'
      );
    }

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
  updateMySkills,
  updateMemberGoalkeeperRole,
  previewBalancedTeams,
  previewEventBalancedTeams,
  saveEventTeamDraw,
  publishEventTeamDraw,
  getEventTeamDraw,
  markPublishedEventDrawStale,
  DRAW_STATUS
};
