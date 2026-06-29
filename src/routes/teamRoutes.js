const express = require('express');
const {
  createTeam,
  getTeamById,
  addTeamMember,
  updateTeamMember,
  removeTeamMember,
  transferCaptainRole,
  addFinanceAdjustment,
  updateTeamRules,
  updateTeamModuleSettings,
  acceptTeamRules,
  startMyTeamBreak,
  endMyTeamBreak,
  updateTeamMemberActivityStatus,
  previewAdminEmailSend,
  sendAdminEmail,
  listEmailCenterSchedules,
  listEmailCenterLogs,
  listEmailCenterLogRecipients,
  handleTeamBreakEmailAction
} = require('../controllers/teamController');

const requireAuth = require('../middleware/requireAuth');
const {
  isTeamMember,
  isCaptainOrViceCaptain,
  isCaptain
} = require('../middleware/teamPermissions');
const {
  validateCreateTeam,
  validateAddTeamMember,
  validateUpdateTeamMember,
  validateCaptainTransfer,
  validateTeamFinanceAdjustment,
  validateUpdateTeamRules,
  validateUpdateTeamModuleSettings,
  validateUpdateTeamMemberActivityStatus,
  validateAdminEmailSend,
} = require('../middleware/requestValidation');

const router = express.Router();

router.get(
  '/team-break-actions/:token',
  handleTeamBreakEmailAction
);

router.post('/teams', requireAuth, validateCreateTeam, createTeam);
router.get('/teams/:teamId', requireAuth, isTeamMember, getTeamById);

router.patch(
  '/teams/:teamId/rules',
  requireAuth,
  isCaptainOrViceCaptain,
  validateUpdateTeamRules,
  updateTeamRules
);

router.patch(
  '/teams/:teamId/module-settings',
  requireAuth,
  isCaptainOrViceCaptain,
  validateUpdateTeamModuleSettings,
  updateTeamModuleSettings
);

router.post(
  '/teams/:teamId/rules/accept',
  requireAuth,
  isTeamMember,
  acceptTeamRules
);

router.post(
  '/teams/:teamId/me/break',
  requireAuth,
  isTeamMember,
  startMyTeamBreak
);

router.delete(
  '/teams/:teamId/me/break',
  requireAuth,
  isTeamMember,
  endMyTeamBreak
);

router.post(
  '/teams/:teamId/captain-transfer',
  requireAuth,
  isCaptain,
  validateCaptainTransfer,
  transferCaptainRole
);

router.patch(
  '/teams/:teamId/members/:memberId/activity-status',
  requireAuth,
  isCaptainOrViceCaptain,
  validateUpdateTeamMemberActivityStatus,
  updateTeamMemberActivityStatus
);

router.post(
  '/teams/:teamId/admin-email/preview',
  requireAuth,
  isCaptainOrViceCaptain,
  validateAdminEmailSend,
  previewAdminEmailSend
);

router.post(
  '/teams/:teamId/admin-email/send',
  requireAuth,
  isCaptainOrViceCaptain,
  validateAdminEmailSend,
  sendAdminEmail
);

router.get(
  '/teams/:teamId/email-center/schedules',
  requireAuth,
  isCaptainOrViceCaptain,
  listEmailCenterSchedules
);

router.get(
  '/teams/:teamId/email-center/logs',
  requireAuth,
  isCaptainOrViceCaptain,
  listEmailCenterLogs
);

router.get(
  '/teams/:teamId/email-center/logs/:groupId/recipients',
  requireAuth,
  isCaptainOrViceCaptain,
  listEmailCenterLogRecipients
);

router.post(
  '/teams/:teamId/members',
  requireAuth,
  isCaptainOrViceCaptain,
  validateAddTeamMember,
  addTeamMember
);

router.patch(
  '/teams/:teamId/members/:memberId',
  requireAuth,
  isCaptain,
  validateUpdateTeamMember,
  updateTeamMember
);

router.delete(
  '/teams/:teamId/members/:memberId',
  requireAuth,
  isCaptainOrViceCaptain,
  removeTeamMember
);

router.post(
  '/teams/:teamId/finance-adjustments/:userId',
  requireAuth,
  isCaptainOrViceCaptain,
  validateTeamFinanceAdjustment,
  addFinanceAdjustment
);

module.exports = router;
