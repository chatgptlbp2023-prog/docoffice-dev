const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { isCaptainOrViceCaptain } = require('../middleware/teamPermissions');
const {
  createInvite,
  createJoinLink,
  getInviteByToken,
  getTeamInvites,
  getMyInvites,
  acceptInvite,
  acceptInviteToken,
  declineInvite,
  revokeInvite
} = require('../controllers/inviteController');
const {
  validateCreateInvite,
  validateCreateJoinLink,
} = require('../middleware/requestValidation');

const router = express.Router();

router.post(
  '/teams/:teamId/invites',
  requireAuth,
  isCaptainOrViceCaptain,
  validateCreateInvite,
  createInvite
);

router.post(
  '/teams/:teamId/join-links',
  requireAuth,
  isCaptainOrViceCaptain,
  validateCreateJoinLink,
  createJoinLink
);

router.get(
  '/teams/:teamId/invites',
  requireAuth,
  isCaptainOrViceCaptain,
  getTeamInvites
);

router.get('/invite-links/:inviteToken', getInviteByToken);
router.post('/invite-links/:inviteToken/accept', requireAuth, acceptInviteToken);
router.post('/invites/:inviteId/accept', requireAuth, acceptInvite);
router.post('/invites/:inviteId/decline', requireAuth, declineInvite);
router.get('/my/invites', requireAuth, getMyInvites);

router.post(
  '/teams/:teamId/invites/:inviteId/revoke',
  requireAuth,
  isCaptainOrViceCaptain,
  revokeInvite
);

module.exports = router;
