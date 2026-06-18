const express = require('express');
const {
  createEvent,
  updateEvent,
  updateEventStatus,
  registerForEvent,
  registerGuestForEvent,
  handleEventEmailAction,
  cancelEventRegistration,
  cancelGuestRegistration,
  setEventAttendanceStatus,
  getEventById,
  getEventWeather,
  getEventsByTeamId
} = require('../controllers/eventController');

const requireAuth = require('../middleware/requireAuth');
const {
  isTeamMember,
  isCaptainOrViceCaptain
} = require('../middleware/teamPermissions');
const {
  validateCreateEvent,
  validateUpdateEvent,
  validateUpdateEventStatus,
  validateRegisterEventGuest,
} = require('../middleware/requestValidation');

const router = express.Router();

router.get(
  '/event-email-actions/:token',
  handleEventEmailAction
);

router.post(
  '/teams/:teamId/events',
  requireAuth,
  isCaptainOrViceCaptain,
  validateCreateEvent,
  createEvent
);

router.get(
  '/teams/:teamId/events',
  requireAuth,
  isTeamMember,
  getEventsByTeamId
);

router.get(
  '/events/:eventId',
  requireAuth,
  isTeamMember,
  getEventById
);

router.get(
  '/events/:eventId/weather',
  requireAuth,
  isTeamMember,
  getEventWeather
);

router.patch(
  '/events/:eventId',
  requireAuth,
  isCaptainOrViceCaptain,
  validateUpdateEvent,
  updateEvent
);

router.patch(
  '/events/:eventId/status',
  requireAuth,
  isCaptainOrViceCaptain,
  validateUpdateEventStatus,
  updateEventStatus
);

router.post(
  '/events/:eventId/register',
  requireAuth,
  isTeamMember,
  registerForEvent
);

router.post(
  '/events/:eventId/guests',
  requireAuth,
  isTeamMember,
  validateRegisterEventGuest,
  registerGuestForEvent
);

router.post(
  '/events/:eventId/cancel',
  requireAuth,
  isTeamMember,
  cancelEventRegistration
);

router.post(
  '/events/:eventId/guests/:guestRegistrationId/cancel',
  requireAuth,
  isTeamMember,
  cancelGuestRegistration
);

router.post(
  '/events/:eventId/attendance/:userId',
  requireAuth,
  isCaptainOrViceCaptain,
  setEventAttendanceStatus
);

module.exports = router;
