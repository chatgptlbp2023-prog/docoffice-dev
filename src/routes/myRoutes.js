const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const {
  getMyTeams,
  getMyEvents,
  getPlatformSummary
} = require('../controllers/myController');

const router = express.Router();

router.get('/my/teams', requireAuth, getMyTeams);
router.get('/my/events', requireAuth, getMyEvents);
router.get('/my/platform-summary', requireAuth, getPlatformSummary);

module.exports = router;
