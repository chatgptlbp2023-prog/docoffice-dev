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

module.exports = {
  buildTeamCapabilities
};
