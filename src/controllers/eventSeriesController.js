
const eventSeriesService = require('../services/eventSeriesService');
const eventNotificationService = require('../services/eventNotificationService');
const eventNotificationScheduleService = require('../services/eventNotificationScheduleService');

async function runNotificationSafely(work, label) {
  try {
    return await work();
  } catch (error) {
    console.error(label, error);
    return null;
  }
}

async function notifyFirstGeneratedEventCreated({ result, actorUserId }) {
  const firstPublishedEvent = (result.generatedEvents || [])
    .map(item => item?.event)
    .find(event => event?.id && event?.status === 'published');

  if (!firstPublishedEvent) return null;

  const notificationResult = await runNotificationSafely(
    () => eventNotificationService.notifyEventCreated({
      eventId: firstPublishedEvent.id,
      actorUserId
    }),
    'Esemenysorozat elso alkalom ertesitesi hiba:'
  );

  return {
    event: firstPublishedEvent,
    notificationResult
  };
}

async function scheduleLaterGeneratedEventCreatedNotifications({ result }) {
  const recurrenceType = result?.recurrence?.recurrenceType || result?.series?.recurrence_type;

  if (!recurrenceType) return null;

  return runNotificationSafely(
    () => eventNotificationScheduleService.scheduleEventCreatedNotificationsForSeries({
      generatedEvents: result.generatedEvents || [],
      recurrenceType,
      now: new Date()
    }),
    'Esemenysorozat kesobbi alkalmak email utemezesi hiba:'
  );
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

async function createEventSeries(req, res) {
  try {
    const result = await eventSeriesService.createEventSeries({
      teamId: req.params.teamId,
      createdByUserId: req.user.id,
      data: req.body
    });

    const firstNotification = await notifyFirstGeneratedEventCreated({
      result,
      actorUserId: req.user.id
    });
    const scheduledNotifications = await scheduleLaterGeneratedEventCreatedNotifications({
      result
    });

    return res.status(201).json({
      ok: true,
      eventNotification: {
        firstEventId: firstNotification?.event?.id || null,
        scheduledCount: scheduledNotifications?.scheduledCount || 0
      },
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Eseménysorozat létrehozási hiba:',
      'Szerverhiba eseménysorozat létrehozása közben.'
    );
  }
}

async function getEventSeriesByTeamId(req, res) {
  try {
    const result = await eventSeriesService.getEventSeriesByTeamId(
      req.params.teamId
    );

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Eseménysorozat-lista hiba:',
      'Szerverhiba eseménysorozatok lekérdezése közben.'
    );
  }
}

async function getEventSeriesById(req, res) {
  try {
    const result = await eventSeriesService.getEventSeriesById({
      teamId: req.params.teamId,
      seriesId: req.params.seriesId
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Eseménysorozat lekérdezési hiba:',
      'Szerverhiba eseménysorozat lekérdezése közben.'
    );
  }
}

async function getSeriesEvents(req, res) {
  try {
    const result = await eventSeriesService.getSeriesEvents({
      teamId: req.params.teamId,
      seriesId: req.params.seriesId
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Sorozat alkalmainak lekérdezési hiba:',
      'Szerverhiba sorozat alkalmainak lekérdezése közben.'
    );
  }
}

async function stopEventSeries(req, res) {
  try {
    const result = await eventSeriesService.stopEventSeries({
      teamId: req.params.teamId,
      seriesId: req.params.seriesId
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Eseménysorozat leállítási hiba:',
      'Szerverhiba eseménysorozat leállítása közben.'
    );
  }
}

module.exports = {
  createEventSeries,
  getEventSeriesByTeamId,
  getEventSeriesById,
  getSeriesEvents,
  stopEventSeries
};
