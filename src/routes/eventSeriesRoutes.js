
const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const {
  isTeamMember,
  isCaptainOrViceCaptain
} = require('../middleware/teamPermissions');
const {
  createEventSeries,
  getEventSeriesByTeamId,
  getEventSeriesById,
  getSeriesEvents,
  stopEventSeries
} = require('../controllers/eventSeriesController');

const router = express.Router();

router.post(
  '/teams/:teamId/event-series',
  requireAuth,
  isCaptainOrViceCaptain,
  createEventSeries
);

router.get(
  '/teams/:teamId/event-series',
  requireAuth,
  isTeamMember,
  getEventSeriesByTeamId
);

router.get(
  '/teams/:teamId/event-series/:seriesId',
  requireAuth,
  isTeamMember,
  getEventSeriesById
);

router.get(
  '/teams/:teamId/event-series/:seriesId/events',
  requireAuth,
  isTeamMember,
  getSeriesEvents
);

router.post(
  '/teams/:teamId/event-series/:seriesId/stop',
  requireAuth,
  isCaptainOrViceCaptain,
  stopEventSeries
);

module.exports = router;
