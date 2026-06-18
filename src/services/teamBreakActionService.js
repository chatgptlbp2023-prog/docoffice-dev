const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

const AppError = require('../utils/appError');
const { pool } = require('./dbService');
const teamService = require('./teamService');
const { normalizeAppBaseUrl } = require('./eventEmailActionService');

const TEAM_BREAK_EMAIL_ACTIONS = Object.freeze({
  EXTEND_ONE_WEEK: 'extend_break_one_week',
  END_BREAK: 'end_break'
});

function buildTeamBreakActionUrl(token, baseUrl = '') {
  const normalizedBaseUrl = normalizeAppBaseUrl(baseUrl);
  const path = `/api/team-break-actions/${encodeURIComponent(String(token || ''))}`;
  return normalizedBaseUrl ? `${normalizedBaseUrl}${path}` : path;
}

function buildTeamBreakActionToken({ teamId, userId, action, expiresInSeconds } = {}) {
  if (!teamId || !userId) {
    throw new Error('A teamId és userId kötelező a szabi email action tokenhez.');
  }

  if (!Object.values(TEAM_BREAK_EMAIL_ACTIONS).includes(action)) {
    throw new Error('Ismeretlen szabi email action.');
  }

  return jwt.sign(
    {
      kind: 'team_break_action',
      jti: randomUUID(),
      teamId,
      userId,
      action
    },
    process.env.JWT_SECRET,
    {
      expiresIn: Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
        ? expiresInSeconds
        : '30d'
    }
  );
}

function verifyTeamBreakActionToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) {
    throw new AppError(400, 'Hiányzó szabi action token.');
  }

  let payload;
  try {
    payload = jwt.verify(normalized, process.env.JWT_SECRET);
  } catch {
    throw new AppError(401, 'Érvénytelen vagy lejárt szabi action token.');
  }

  if (payload?.kind !== 'team_break_action') {
    throw new AppError(401, 'Érvénytelen szabi action token.');
  }

  if (!Object.values(TEAM_BREAK_EMAIL_ACTIONS).includes(payload.action)) {
    throw new AppError(400, 'Ismeretlen szabi action.');
  }

  return payload;
}

async function getTeamBreakActionContext({ teamId, userId }) {
  const result = await pool.query(
    `
    select
      tm.team_id,
      tm.user_id,
      tm.membership_status,
      t.name as team_name,
      u.name as user_name
    from team_members tm
    join teams t on t.id = tm.team_id
    join users u on u.id = tm.user_id
    where tm.team_id = $1
      and tm.user_id = $2
      and tm.membership_status = 'active'
    limit 1
    `,
    [teamId, userId]
  );

  if (!result.rows.length) {
    throw new AppError(404, 'Az aktív csapattagság nem található ehhez a szabi művelethez.');
  }

  return result.rows[0];
}

async function logTeamBreakAction({
  teamId,
  userId,
  action,
  status,
  message,
  tokenJti = null,
  metadata = null
}) {
  await pool.query(
    `
    insert into team_break_action_log (
      team_id,
      user_id,
      action,
      status,
      message,
      token_jti,
      metadata,
      acted_at,
      created_at
    )
    values ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), now())
    `,
    [
      teamId,
      userId,
      action,
      status,
      message || null,
      tokenJti,
      metadata ? JSON.stringify(metadata) : JSON.stringify({})
    ]
  );
}

async function executeTeamBreakActionToken(token) {
  const payload = verifyTeamBreakActionToken(token);
  const context = await getTeamBreakActionContext({
    teamId: payload.teamId,
    userId: payload.userId
  });

  try {
    const result = payload.action === TEAM_BREAK_EMAIL_ACTIONS.EXTEND_ONE_WEEK
      ? await teamService.extendMyTeamBreak({
          teamId: context.team_id,
          userId: context.user_id
        })
      : await teamService.endMyTeamBreak({
          teamId: context.team_id,
          userId: context.user_id
        });

    await logTeamBreakAction({
      teamId: context.team_id,
      userId: context.user_id,
      action: payload.action,
      status: 'recorded',
      message: result.message,
      tokenJti: payload.jti,
      metadata: {
        breakUntil: result.member?.break_until || null,
        breakExtensionsCount: result.member?.break_extensions_count || 0
      }
    });

    return {
      ok: true,
      action: payload.action,
      teamId: context.team_id,
      teamName: context.team_name,
      userId: context.user_id,
      message: result.message,
      member: result.member
    };
  } catch (error) {
    await logTeamBreakAction({
      teamId: context.team_id,
      userId: context.user_id,
      action: payload.action,
      status: 'error',
      message: error?.message || 'A szabi művelet nem sikerült.',
      tokenJti: payload.jti,
      metadata: {
        errorStatusCode: error?.statusCode || null
      }
    });
    throw error;
  }
}

module.exports = {
  TEAM_BREAK_EMAIL_ACTIONS,
  buildTeamBreakActionToken,
  buildTeamBreakActionUrl,
  verifyTeamBreakActionToken,
  executeTeamBreakActionToken
};
