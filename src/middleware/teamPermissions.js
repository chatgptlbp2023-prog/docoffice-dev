const pool = require('../config/db');
const {
  normalizeTeamRole,
  isTeamAdminRole,
  canManageTeam
} = require('../utils/teamRoles');

async function resolveAccessContext(req) {
  if (req.params.teamId) {
    const teamResult = await pool.query(
      `
      select id, name, status
      from teams
      where id = $1
      `,
      [req.params.teamId]
    );

    if (teamResult.rows.length === 0) {
      return { notFound: 'team' };
    }

    return {
      entityType: 'team',
      teamId: teamResult.rows[0].id,
      team: teamResult.rows[0]
    };
  }

  if (req.params.eventId) {
    const eventResult = await pool.query(
      `
      select id, team_id, title, status
      from events
      where id = $1
      `,
      [req.params.eventId]
    );

    if (eventResult.rows.length === 0) {
      return { notFound: 'event' };
    }

    return {
      entityType: 'event',
      eventId: eventResult.rows[0].id,
      event: eventResult.rows[0],
      teamId: eventResult.rows[0].team_id
    };
  }

  return { invalid: true };
}

async function loadActiveMembership(teamId, userId) {
  const membershipResult = await pool.query(
    `
    select
      tm.id,
      tm.team_id,
      tm.user_id,
      tm.role,
      tm.membership_status
    from team_members tm
    where tm.team_id = $1
      and tm.user_id = $2
      and tm.membership_status = 'active'
    `,
    [teamId, userId]
  );

  return membershipResult.rows[0] || null;
}

function handleContextErrors(res, context) {
  if (context.invalid) {
    return res.status(400).json({
      ok: false,
      message: 'Hiányzó teamId vagy eventId paraméter.'
    });
  }

  if (context.notFound === 'team') {
    return res.status(404).json({
      ok: false,
      message: 'A csapat nem található.'
    });
  }

  if (context.notFound === 'event') {
    return res.status(404).json({
      ok: false,
      message: 'Az esemény nem található.'
    });
  }

  return null;
}

async function isTeamMember(req, res, next) {
  try {
    if (req.user?.platform_role === 'platform_owner') {
      const context = await resolveAccessContext(req);
      const contextError = handleContextErrors(res, context);
      if (contextError) {
        return contextError;
      }

      req.accessContext = context;
      req.teamId = context.teamId;
      req.teamMembership = {
        id: null,
        team_id: context.teamId,
        user_id: req.user.id,
        role: 'platform_owner',
        membership_status: 'active'
      };
      return next();
    }

    const context = await resolveAccessContext(req);
    const contextError = handleContextErrors(res, context);

    if (contextError) {
      return contextError;
    }

    const membership = await loadActiveMembership(context.teamId, req.user.id);

    if (!membership) {
      return res.status(403).json({
        ok: false,
        message: 'Nincs hozzáférésed ehhez a csapathoz.'
      });
    }

    membership.role = normalizeTeamRole(membership.role);
    req.accessContext = context;
    req.teamId = context.teamId;
    req.teamMembership = membership;

    next();
  } catch (error) {
    console.error('isTeamMember middleware hiba:', error);

    return res.status(500).json({
      ok: false,
      message: 'Szerverhiba jogosultság ellenőrzés közben.',
      error: error.message
    });
  }
}

async function isCaptainOrViceCaptain(req, res, next) {
  try {
    if (req.user?.platform_role === 'platform_owner') {
      const context = await resolveAccessContext(req);
      const contextError = handleContextErrors(res, context);
      if (contextError) {
        return contextError;
      }

      req.accessContext = context;
      req.teamId = context.teamId;
      req.teamMembership = {
        id: null,
        team_id: context.teamId,
        user_id: req.user.id,
        role: 'platform_owner',
        membership_status: 'active'
      };
      return next();
    }

    const context = await resolveAccessContext(req);
    const contextError = handleContextErrors(res, context);

    if (contextError) {
      return contextError;
    }

    const membership = await loadActiveMembership(context.teamId, req.user.id);

    if (!membership) {
      return res.status(403).json({
        ok: false,
        message: 'Nincs hozzáférésed ehhez a csapathoz.'
      });
    }

    membership.role = normalizeTeamRole(membership.role);

    if (!canManageTeam(membership.role)) {
      return res.status(403).json({
        ok: false,
        message: 'Ehhez a művelethez csapatkapitány vagy csapatkapitány-helyettes jogosultság kell.'
      });
    }

    req.accessContext = context;
    req.teamId = context.teamId;
    req.teamMembership = membership;

    next();
  } catch (error) {
    console.error('isCaptainOrViceCaptain middleware hiba:', error);

    return res.status(500).json({
      ok: false,
      message: 'Szerverhiba jogosultság ellenőrzés közben.',
      error: error.message
    });
  }
}

async function isCaptain(req, res, next) {
  try {
    if (req.user?.platform_role === 'platform_owner') {
      const context = await resolveAccessContext(req);
      const contextError = handleContextErrors(res, context);
      if (contextError) {
        return contextError;
      }

      req.accessContext = context;
      req.teamId = context.teamId;
      req.teamMembership = {
        id: null,
        team_id: context.teamId,
        user_id: req.user.id,
        role: 'platform_owner',
        membership_status: 'active'
      };
      return next();
    }

    const context = await resolveAccessContext(req);
    const contextError = handleContextErrors(res, context);

    if (contextError) {
      return contextError;
    }

    const membership = await loadActiveMembership(context.teamId, req.user.id);

    if (!membership) {
      return res.status(403).json({
        ok: false,
        message: 'Nincs hozzáférésed ehhez a csapathoz.'
      });
    }

    membership.role = normalizeTeamRole(membership.role);

    if (!isTeamAdminRole(membership.role)) {
      return res.status(403).json({
        ok: false,
        message: 'Csak a csapatkapitány végezheti ezt a műveletet.'
      });
    }

    req.accessContext = context;
    req.teamId = context.teamId;
    req.teamMembership = membership;

    next();
  } catch (error) {
    console.error('isCaptain middleware hiba:', error);

    return res.status(500).json({
      ok: false,
      message: 'Szerverhiba jogosultság ellenőrzés közben.',
      error: error.message
    });
  }
}

module.exports = {
  isTeamMember,
  isCaptainOrViceCaptain,
  isCaptain
};
