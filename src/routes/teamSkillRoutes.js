const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { isTeamMember, isCaptainOrViceCaptain } = require('../middleware/teamPermissions');
const { validateUpdateMySkills } = require('../middleware/requestValidation');
const {
  getSkillSettings,
  updateSkillSettings,
  updateMemberRank,
  updateMemberGoalkeeperRole,
  updateMemberSkills,
  updateMySkills,
  previewBalancedTeams,
  previewEventBalancedTeams,
  saveEventTeamDraw,
  publishEventTeamDraw,
  getEventTeamDraw
} = require('../controllers/teamSkillController');

const router = express.Router();

router.get(
  '/teams/:teamId/skill-settings',
  requireAuth,
  isCaptainOrViceCaptain,
  getSkillSettings
);

router.patch(
  '/teams/:teamId/skill-settings',
  requireAuth,
  isCaptainOrViceCaptain,
  updateSkillSettings
);

router.patch(
  '/teams/:teamId/members/:memberId/rank',
  requireAuth,
  isCaptainOrViceCaptain,
  updateMemberRank
);


router.patch(
  '/teams/:teamId/members/:memberId/goalkeeper-role',
  requireAuth,
  isCaptainOrViceCaptain,
  updateMemberGoalkeeperRole
);

router.patch(
  '/teams/:teamId/members/:memberId/skills',
  requireAuth,
  isCaptainOrViceCaptain,
  updateMemberSkills
);

router.patch(
  '/teams/:teamId/me/skills',
  requireAuth,
  isTeamMember,
  validateUpdateMySkills,
  updateMySkills
);

router.post(
  '/teams/:teamId/team-draw/preview',
  requireAuth,
  isCaptainOrViceCaptain,
  previewBalancedTeams
);

router.post(
  '/events/:eventId/team-draw/preview',
  requireAuth,
  previewEventBalancedTeams
);

router.post(
  '/events/:eventId/team-draw/save',
  requireAuth,
  isCaptainOrViceCaptain,
  saveEventTeamDraw
);

router.post(
  '/events/:eventId/team-draw/publish',
  requireAuth,
  isCaptainOrViceCaptain,
  publishEventTeamDraw
);

router.get(
  '/events/:eventId/team-draw',
  requireAuth,
  getEventTeamDraw
);

module.exports = router;
