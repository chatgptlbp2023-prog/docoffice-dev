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
  acceptTeamRules
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
} = require('../middleware/requestValidation');

const router = express.Router();

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
  '/teams/:teamId/captain-transfer',
  requireAuth,
  isCaptain,
  validateCaptainTransfer,
  transferCaptainRole
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
