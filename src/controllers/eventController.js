const eventService = require('../services/eventService');
const registrationService = require('../services/registrationService');
const eventAttendanceService = require('../services/eventAttendanceService');
const eventNotificationService = require('../services/eventNotificationService');
const eventEmailActionService = require('../services/eventEmailActionService');

async function runNotificationSafely(work, label) {
  try {
    await work();
  } catch (error) {
    console.error(label, error);
  }
}

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

    await runNotificationSafely(
      () => eventNotificationService.notifyEventCreated({
        eventId: result.event.id,
        actorUserId: req.user.id
      }),
      'Esemeny letrehozasi ertesites hiba:'
    );

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

    await runNotificationSafely(
      () => eventNotificationService.notifyEventUpdated({
        eventId: req.params.eventId,
        previousEvent: result.previousEvent
      }),
      'Esemeny modositas ertesitesi hiba:'
    );

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

    if (result.transition?.to === 'published') {
      await runNotificationSafely(
        () => eventNotificationService.notifyEventCreated({
          eventId: req.params.eventId,
          actorUserId: req.user.id
        }),
        'Esemeny publish ertesitesi hiba:'
      );
    }

    if (result.transition?.to === 'cancelled') {
      await runNotificationSafely(
        () => eventNotificationService.notifyEventCancelled({
          eventId: req.params.eventId
        }),
        'Esemeny torles ertesitesi hiba:'
      );
    }

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

    await runNotificationSafely(
      () => eventNotificationService.notifyRegistrationActivity({
        eventId: req.params.eventId,
        promotedUserId: result.promotedRegistration?.user_id || null,
        includeNewRegistrationNotification: false,
        includeCapacityNotifications: false
      }),
      'Varolista promoci o ertesitesi hiba:'
    );

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

    await runNotificationSafely(
      () => eventNotificationService.notifyRegistrationActivity({
        eventId: req.params.eventId,
        actorUserId: req.user.id,
        registrationStatus: result.registration?.registration_status || 'going'
      }),
      'Jelentkezesi ertesitesi hiba:'
    );

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

async function handleEventEmailAction(req, res) {
  const fallbackBaseUrl = eventEmailActionService.normalizeAppBaseUrl(
    process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`
  );

  try {
    const result = await eventEmailActionService.executeEventEmailActionToken(req.params.token);
    const redirectUrl = eventEmailActionService.buildEventAppUrl(
      {
        teamId: result.teamId,
        eventId: result.eventId,
        actionStatus: result.status,
        actionMessage: result.message
      },
      fallbackBaseUrl
    );

    return res.redirect(302, redirectUrl);
  } catch (error) {
    const redirectUrl = eventEmailActionService.buildEventAppUrl(
      {
        actionStatus: 'error',
        actionMessage: error?.message || 'Az emailes művelet most nem sikerült.'
      },
      fallbackBaseUrl
    );

    return res.redirect(302, redirectUrl);
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
  handleEventEmailAction,
  cancelEventRegistration,
  setEventAttendanceStatus,
  getEventById,
  getEventsByTeamId
};
