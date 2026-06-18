const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

const AppError = require('../utils/appError');
const { pool } = require('./dbService');
const registrationService = require('./registrationService');
const teamService = require('./teamService');

const EVENT_EMAIL_ACTIONS = Object.freeze({
  REGISTER: 'register',
  SKIP: 'skip',
  VACATION_ONE_WEEK: 'vacation_one_week'
});

function normalizeAppBaseUrl(baseUrl = '') {
  const value = String(baseUrl || process.env.APP_BASE_URL || '').trim();
  return value ? value.replace(/\/+$/, '') : '';
}

function escapeQueryValue(value) {
  return encodeURIComponent(String(value ?? '').trim());
}

function buildEventAppUrl({ teamId, eventId, actionStatus = '', actionMessage = '' } = {}, baseUrl = '') {
  const normalizedBaseUrl = normalizeAppBaseUrl(baseUrl);
  const params = new URLSearchParams();

  if (teamId) params.set('teamId', String(teamId));
  if (eventId) params.set('eventId', String(eventId));
  if (actionStatus) params.set('emailActionStatus', String(actionStatus));
  if (actionMessage) params.set('emailActionMessage', String(actionMessage));

  const query = params.toString();
  const path = query ? `/?${query}` : '/';

  return normalizedBaseUrl ? `${normalizedBaseUrl}${path}` : path;
}

function buildEventEmailActionUrl(token, baseUrl = '') {
  const normalizedBaseUrl = normalizeAppBaseUrl(baseUrl);
  const path = `/api/event-email-actions/${escapeQueryValue(token)}`;
  return normalizedBaseUrl ? `${normalizedBaseUrl}${path}` : path;
}

function buildEventEmailActionToken({ eventId, userId, action, expiresInSeconds } = {}) {
  if (!eventId || !userId) {
    throw new Error('Az eventId és userId kötelező az email action tokenhez.');
  }

  if (!Object.values(EVENT_EMAIL_ACTIONS).includes(action)) {
    throw new Error('Ismeretlen email action.');
  }

  return jwt.sign(
    {
      kind: 'event_email_action',
      jti: randomUUID(),
      eventId,
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

function verifyEventEmailActionToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) {
    throw new AppError(400, 'Hiányzó email action token.');
  }

  let payload;
  try {
    payload = jwt.verify(normalized, process.env.JWT_SECRET);
  } catch {
    throw new AppError(401, 'Érvénytelen vagy lejárt email action token.');
  }

  if (payload?.kind !== 'event_email_action') {
    throw new AppError(401, 'Érvénytelen email action token.');
  }

  if (!Object.values(EVENT_EMAIL_ACTIONS).includes(payload.action)) {
    throw new AppError(400, 'Ismeretlen email action.');
  }

  return payload;
}

async function getEventEmailActionContext({ eventId, userId }) {
  const result = await pool.query(
    `
    select
      e.id as event_id,
      e.team_id,
      e.title,
      e.start_at,
      e.status as event_status,
      u.id as user_id,
      lower(u.email) as user_email,
      t.rank_module_enabled
    from events e
    join team_members tm
      on tm.team_id = e.team_id
     and tm.user_id = $2
     and tm.membership_status = 'active'
    join users u on u.id = tm.user_id
    join teams t on t.id = e.team_id
    where e.id = $1
    limit 1
    `,
    [eventId, userId]
  );

  if (!result.rows.length) {
    throw new AppError(404, 'Az email actionhöz tartozó esemény vagy tagság nem található.');
  }

  return result.rows[0];
}

async function getCurrentRegistrationStatus({ eventId, userId }) {
  const result = await pool.query(
    `
    select registration_status
    from event_registrations
    where event_id = $1
      and user_id = $2
    order by
      case registration_status
        when 'going' then 1
        when 'waiting_list' then 2
        when 'waiting_list_rank' then 3
        when 'cancelled' then 4
        else 5
      end,
      updated_at desc nulls last,
      registered_at desc nulls last
    limit 1
    `,
    [eventId, userId]
  );

  return result.rows[0]?.registration_status || null;
}

async function logEventEmailAction({
  eventId,
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
    insert into event_email_action_log (
      event_id,
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
    values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now(), now())
    `,
    [
      eventId,
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

async function performRegisterAction(context, payload) {
  try {
    const result = await registrationService.registerForEvent({
      eventId: context.event_id,
      userId: context.user_id
    });

    await logEventEmailAction({
      eventId: context.event_id,
      teamId: context.team_id,
      userId: context.user_id,
      action: EVENT_EMAIL_ACTIONS.REGISTER,
      status: result.registration?.registration_status || 'going',
      message: result.message,
      tokenJti: payload.jti,
      metadata: {
        registrationStatus: result.registration?.registration_status || null
      }
    });

    return {
      ok: true,
      status: result.registration?.registration_status || 'going',
      message: result.message || 'Sikeres jelentkezés.'
    };
  } catch (error) {
    if (error?.statusCode === 409) {
      const currentStatus = await getCurrentRegistrationStatus({
        eventId: context.event_id,
        userId: context.user_id
      });
      const message = currentStatus
        ? `A jelentkezésed már rögzítve van (${currentStatus}).`
        : 'A jelentkezésed már korábban rögzítve lett.';

      await logEventEmailAction({
        eventId: context.event_id,
        teamId: context.team_id,
        userId: context.user_id,
        action: EVENT_EMAIL_ACTIONS.REGISTER,
        status: 'already_registered',
        message,
        tokenJti: payload.jti,
        metadata: {
          currentStatus
        }
      });

      return {
        ok: true,
        status: 'already_registered',
        message
      };
    }

    const message = error?.message || 'A jelentkezés emailből most nem sikerült.';

    await logEventEmailAction({
      eventId: context.event_id,
      teamId: context.team_id,
      userId: context.user_id,
      action: EVENT_EMAIL_ACTIONS.REGISTER,
      status: 'error',
      message,
      tokenJti: payload.jti,
      metadata: {
        errorStatusCode: error?.statusCode || null
      }
    });

    return {
      ok: false,
      status: 'error',
      message
    };
  }
}

async function performSkipAction(context, payload) {
  const rankEnabled = Boolean(context.rank_module_enabled);
  const status = rankEnabled ? 'recorded_for_rank' : 'rank_module_disabled';
  const message = rankEnabled
    ? 'A kihagyás jelzését rögzítettük a rangmodul számára.'
    : 'A kihagyás jelzését vettük, de ennél a csapatnál most nincs aktív rangmodul.';

  await logEventEmailAction({
    eventId: context.event_id,
    teamId: context.team_id,
    userId: context.user_id,
    action: EVENT_EMAIL_ACTIONS.SKIP,
    status,
    message,
    tokenJti: payload.jti,
    metadata: {
      rankModuleEnabled: rankEnabled
    }
  });

  return {
    ok: true,
    status,
    message
  };
}

async function performVacationOneWeekAction(context, payload) {
  const breakResult = await teamService.startMyTeamBreak({
    teamId: context.team_id,
    userId: context.user_id
  });
  const breakUntil = breakResult.member.break_until;
  const message = breakResult.message || 'Rogzitettuk: 1 hetig szabin vagy ebben a csapatban.';

  await logEventEmailAction({
    eventId: context.event_id,
    teamId: context.team_id,
    userId: context.user_id,
    action: EVENT_EMAIL_ACTIONS.VACATION_ONE_WEEK,
    status: 'recorded',
    message,
    tokenJti: payload.jti,
    metadata: {
      breakUntil,
      breakExtensionsCount: breakResult.member.break_extensions_count,
      rankModuleEnabled: Boolean(context.rank_module_enabled)
    }
  });

  return {
    ok: true,
    status: 'recorded',
    message,
    breakUntil
  };
}

async function executeEventEmailActionToken(token) {
  const payload = verifyEventEmailActionToken(token);
  const context = await getEventEmailActionContext({
    eventId: payload.eventId,
    userId: payload.userId
  });

  if (payload.action === EVENT_EMAIL_ACTIONS.REGISTER) {
    const outcome = await performRegisterAction(context, payload);
    return {
      ...outcome,
      action: payload.action,
      eventId: context.event_id,
      teamId: context.team_id,
      eventTitle: context.title
    };
  }

  if (payload.action === EVENT_EMAIL_ACTIONS.VACATION_ONE_WEEK) {
    const outcome = await performVacationOneWeekAction(context, payload);
    return {
      ...outcome,
      action: payload.action,
      eventId: context.event_id,
      teamId: context.team_id,
      eventTitle: context.title
    };
  }

  const outcome = await performSkipAction(context, payload);
  return {
    ...outcome,
    action: payload.action,
    eventId: context.event_id,
    teamId: context.team_id,
    eventTitle: context.title
  };
}

module.exports = {
  EVENT_EMAIL_ACTIONS,
  normalizeAppBaseUrl,
  buildEventAppUrl,
  buildEventEmailActionUrl,
  buildEventEmailActionToken,
  verifyEventEmailActionToken,
  executeEventEmailActionToken
};
