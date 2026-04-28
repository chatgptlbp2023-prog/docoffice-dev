const TEAM_ROLE_ALIASES = Object.freeze({
  captain: 'team_admin',
  vice_captain: 'team_manager',
  member: 'member',
  team_admin: 'team_admin',
  team_manager: 'team_manager'
});

const TEAM_ROLE_LABELS = Object.freeze({
  team_admin: 'csapatkapitány',
  team_manager: 'csapatkapitány-helyettes',
  member: 'tag'
});

function normalizeTeamRole(role, fallback = 'member') {
  const normalized = String(role || '').trim().toLowerCase();
  return TEAM_ROLE_ALIASES[normalized] || fallback;
}

function isTeamAdminRole(role) {
  return normalizeTeamRole(role) === 'team_admin';
}

function isTeamManagerRole(role) {
  return normalizeTeamRole(role) === 'team_manager';
}

function canManageTeam(role) {
  const normalized = normalizeTeamRole(role);
  return normalized === 'team_admin' || normalized === 'team_manager';
}

function formatTeamRole(role) {
  return TEAM_ROLE_LABELS[normalizeTeamRole(role)] || TEAM_ROLE_LABELS.member;
}

module.exports = {
  TEAM_ROLE_LABELS,
  normalizeTeamRole,
  isTeamAdminRole,
  isTeamManagerRole,
  canManageTeam,
  formatTeamRole
};
