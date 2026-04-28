const eventService = require('../services/eventService');
const registrationService = require('../services/registrationService');
const eventAttendanceService = require('../services/eventAttendanceService');

function handleServiceError(res, error, logLabel, fallbackMessage) {
  if (error && error.statusCode) {
    return res.status(error.statusCode).json({
      ok: false,
      message: error.message,
      ...error.payload
    });
  }

  console.error(logLabel, error);

  return res.status(500).json({
    ok: false,
    message: fallbackMessage,
    error: error.message
  });
}

async function createEvent(req, res) {
  try {
    const result = await eventService.createEvent({
      teamId: req.params.teamId,
      createdByUserId: req.user.id,
      data: req.body
    });

    return res.status(201).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Esemény létrehozási hiba:',
      'Szerverhiba esemény létrehozás közben.'
    );
  }
}

async function updateEvent(req, res) {
  try {
    const result = await eventService.updateEvent({
      eventId: req.params.eventId,
      data: req.body
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Esemény frissítési hiba:',
      'Szerverhiba esemény frissítés közben.'
    );
  }
}

async function updateEventStatus(req, res) {
  try {
    const result = await eventService.updateEventStatus({
      eventId: req.params.eventId,
      nextStatus: req.body.status
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Esemény státuszfrissítési hiba:',
      'Szerverhiba esemény státuszfrissítés közben.'
    );
  }
}

async function cancelEventRegistration(req, res) {
  try {
    const result = await registrationService.cancelEventRegistration({
      eventId: req.params.eventId,
      userId: req.user.id
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Lemondási hiba:',
      'Szerverhiba lemondás közben.'
    );
  }
}

async function getEventById(req, res) {
  try {
    const result = await eventService.getEventById(req.params.eventId, req.user.id);

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Esemény lekérdezési hiba:',
      'Szerverhiba esemény lekérdezés közben.'
    );
  }
}

async function getEventsByTeamId(req, res) {
  try {
    const result = await eventService.getEventsByTeamId(req.params.teamId, req.user.id);

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csapat eseménylista hiba:',
      'Szerverhiba csapat eseményeinek lekérdezése közben.'
    );
  }
}

async function registerForEvent(req, res) {
  try {
    const result = await registrationService.registerForEvent({
      eventId: req.params.eventId,
      userId: req.user.id
    });

    return res.status(201).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Jelentkezési hiba:',
      'Szerverhiba jelentkezés közben.'
    );
  }
}

async function setEventAttendanceStatus(req, res) {
  try {
    const result = await eventAttendanceService.setEventAttendanceStatus({
      eventId: req.params.eventId,
      targetUserId: req.params.userId,
      status: req.body.status,
      paymentAmount: req.body.paymentAmount,
      note: req.body.note,
      markedByUserId: req.user.id
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Attendance rogzitasi hiba:',
      'Szerverhiba attendance rogzitese kozben.'
    );
  }
}

module.exports = {
  createEvent,
  updateEvent,
  updateEventStatus,
  registerForEvent,
  cancelEventRegistration,
  setEventAttendanceStatus,
  getEventById,
  getEventsByTeamId
};
