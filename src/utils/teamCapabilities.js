const { normalizeTeamRole } = require('./teamRoles');

function buildTeamCapabilities({ platformRole, teamRole }) {
  if (platformRole === 'platform_owner') {
    return {
      canManageEvents: true,
      canManageMembers: true,
      canManageInvites: true,
      canManageRoles: true,
      canViewPaymentStatus: true,
      canViewCashLedger: true,
      canManageCashModule: true
    };
  }

  const normalizedRole = normalizeTeamRole(teamRole);
  const isAdmin = normalizedRole === 'team_admin';
  const isManager = normalizedRole === 'team_manager';

  return {
    canManageEvents: isAdmin || isManager,
    canManageMembers: isAdmin || isManager,
    canManageInvites: isAdmin || isManager,
    canManageRoles: isAdmin,
    canViewPaymentStatus: isAdmin || isManager,
    canViewCashLedger: isAdmin,
    canManageCashModule: isAdmin
  };
}

function booleanOrDefault(value, defaultValue = false) {
  return value == null ? defaultValue : Boolean(value);
}

function buildTeamModuleSettings(team = {}) {
  const rulesText = String(team.rules_text || '').trim();

  return {
    skill: {
      enabled: booleanOrDefault(team.skill_balancing_enabled, true),
      tolerance_percent: Number(team.skill_balance_tolerance_percent ?? 15)
    },
    rank: {
      enabled: booleanOrDefault(team.rank_module_enabled, false)
    },
    rules: {
      enabled: booleanOrDefault(team.rules_module_enabled, false),
      version: Number(team.rules_version || 1),
      has_text: rulesText.length > 0
    },
    finance: {
      enabled: booleanOrDefault(team.cash_module_enabled, false)
    },
    discipline: {
      enabled: booleanOrDefault(team.discipline_module_enabled, false)
    }
  };
}

module.exports = {
  buildTeamCapabilities,
  buildTeamModuleSettings
};
