const AppError = require('../utils/appError');
const { pool, withTransaction } = require('./dbService');
const { buildTeamModuleSettings } = require('../utils/teamCapabilities');

const RULES_ACCEPTANCE_REQUIRED_MESSAGE =
  'A szabályzat modul aktív ennél a csapatnál. A bal oldali Szabályzat menüpontban fogadd el a csapat szabályait, utána tudsz jelentkezni.';

function normalizeRulesText(value) {
  return String(value || '').trim();
}

function buildRulesAcceptanceState(team, acceptance = null) {
  const currentVersion = Number(team?.rules_version || 1);
  const acceptedVersion = acceptance?.rules_version == null
    ? null
    : Number(acceptance.rules_version);
  const required = Boolean(team?.rules_module_enabled);
  const accepted = !required || acceptedVersion === currentVersion;

  return {
    required,
    accepted,
    current_version: currentVersion,
    accepted_version: acceptedVersion,
    accepted_at: acceptance?.accepted_at || null,
    needs_acceptance: required && !accepted
  };
}

async function getLatestRulesAcceptance(client, { teamId, userId }) {
  if (!teamId || !userId) return null;

  const result = await client.query(
    `
    select rules_version, accepted_at
    from team_rule_acceptances
    where team_id = $1
      and user_id = $2
    order by accepted_at desc
    limit 1
    `,
    [teamId, userId]
  );

  return result.rows[0] || null;
}

async function getTeamRulesRequirement(client, { teamId, userId }) {
  const teamResult = await client.query(
    `
    select
      id,
      name,
      rules_module_enabled,
      rules_text,
      rules_version,
      rules_updated_at
    from teams
    where id = $1
    `,
    [teamId]
  );

  if (teamResult.rows.length === 0) {
    throw new AppError(404, 'A csapat nem található.');
  }

  const team = teamResult.rows[0];
  const acceptance = await getLatestRulesAcceptance(client, { teamId, userId });

  return {
    team,
    acceptance: buildRulesAcceptanceState(team, acceptance)
  };
}

async function assertTeamRulesAccepted(client, { teamId, userId }) {
  const requirement = await getTeamRulesRequirement(client, { teamId, userId });

  if (requirement.acceptance.needs_acceptance) {
    throw new AppError(403, RULES_ACCEPTANCE_REQUIRED_MESSAGE, {
      rulesAcceptanceRequired: true,
      teamId,
      teamName: requirement.team.name,
      rulesVersion: requirement.acceptance.current_version,
      rulesMenuLabel: 'Szabályzat'
    });
  }

  return requirement;
}

async function updateTeamRules({
  teamId,
  updatedByUserId,
  rulesModuleEnabled,
  rulesText
}) {
  const nextEnabled = Boolean(rulesModuleEnabled);
  const normalizedRulesText = normalizeRulesText(rulesText);

  if (nextEnabled && !normalizedRulesText) {
    throw new AppError(400, 'Bekapcsolt szabályzat modulhoz meg kell adni a szabályzat szövegét.');
  }

  return withTransaction(async client => {
    const currentResult = await client.query(
      `
      select
        id,
        name,
        rules_module_enabled,
        coalesce(rules_text, '') as rules_text,
        rules_version
      from teams
      where id = $1
      for update
      `,
      [teamId]
    );

    if (currentResult.rows.length === 0) {
      throw new AppError(404, 'A csapat nem található.');
    }

    const current = currentResult.rows[0];
    const currentVersion = Number(current.rules_version || 1);
    const textChanged = normalizeRulesText(current.rules_text) !== normalizedRulesText;
    const nextVersion = textChanged ? currentVersion + 1 : currentVersion;

    const updateResult = await client.query(
      `
      update teams
      set rules_module_enabled = $2,
          rules_text = $3,
          rules_version = $4,
          rules_updated_at = now(),
          rules_updated_by_user_id = $5,
          updated_at = now()
      where id = $1
      returning
        id,
        name,
        created_by_user_id,
        skill_balancing_enabled,
        skill_balance_tolerance_percent,
        draw_strategy,
        goalkeeper_module_enabled,
        rank_module_enabled,
        cash_module_enabled,
        discipline_module_enabled,
        rules_module_enabled,
        rules_text,
        rules_version,
        rules_updated_at,
        status,
        created_at,
        updated_at
      `,
      [
        teamId,
        nextEnabled,
        normalizedRulesText || null,
        nextVersion,
        updatedByUserId
      ]
    );

    const updatedTeam = updateResult.rows[0];

    return {
      message: nextEnabled
        ? 'A csapatszabályzat modul beállításai elmentve.'
        : 'A csapatszabályzat modul kikapcsolva.',
      team: {
        ...updatedTeam,
        module_settings: buildTeamModuleSettings(updatedTeam)
      },
      version_changed: textChanged,
      previous_version: currentVersion,
      current_version: nextVersion
    };
  });
}

async function acceptTeamRules({ teamId, userId }) {
  return withTransaction(async client => {
    const membershipResult = await client.query(
      `
      select id
      from team_members
      where team_id = $1
        and user_id = $2
        and membership_status = 'active'
      limit 1
      `,
      [teamId, userId]
    );

    if (membershipResult.rows.length === 0) {
      throw new AppError(403, 'Nincs hozzáférésed ehhez a csapathoz.');
    }

    const requirement = await getTeamRulesRequirement(client, { teamId, userId });

    if (!requirement.team.rules_module_enabled) {
      throw new AppError(400, 'Ennél a csapatnál nincs bekapcsolva a szabályzat modul.');
    }

    if (!normalizeRulesText(requirement.team.rules_text)) {
      throw new AppError(409, 'A szabályzat modul aktív, de a szabályzat szövege még nincs kitöltve.');
    }

    const version = Number(requirement.team.rules_version || 1);
    const acceptanceResult = await client.query(
      `
      insert into team_rule_acceptances (
        team_id,
        user_id,
        rules_version,
        accepted_at,
        created_at
      )
      values ($1, $2, $3, now(), now())
      on conflict (team_id, user_id, rules_version)
      do update set accepted_at = excluded.accepted_at
      returning rules_version, accepted_at
      `,
      [teamId, userId, version]
    );

    return {
      message: 'A csapatszabályzat elfogadva. Most már jelentkezhetsz a csapat eseményeire.',
      team_id: teamId,
      rules_acceptance: buildRulesAcceptanceState(
        requirement.team,
        acceptanceResult.rows[0]
      )
    };
  });
}

module.exports = {
  RULES_ACCEPTANCE_REQUIRED_MESSAGE,
  buildRulesAcceptanceState,
  getLatestRulesAcceptance,
  getTeamRulesRequirement,
  assertTeamRulesAccepted,
  updateTeamRules,
  acceptTeamRules
};
