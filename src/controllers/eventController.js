const eventService = require('../services/eventService');
const registrationService = require('../services/registrationService');
const eventAttendanceService = require('../services/eventAttendanceService');
const eventNotificationService = require('../services/eventNotificationService');
const eventEmailActionService = require('../services/eventEmailActionService');
const { fetchEventWeatherForecast } = require('../services/weatherService');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderEmailActionResultPage({ title, message, tone = 'success' }) {
  const background = tone === 'error' ? '#fef2f2' : '#f0fdf4';
  const border = tone === 'error' ? '#fecaca' : '#bbf7d0';
  const accent = tone === 'error' ? '#b91c1c' : '#166534';

  return `
    <!DOCTYPE html>
    <html lang="hu">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            margin: 0;
            font-family: Segoe UI, Arial, sans-serif;
            background: #f8fafc;
            color: #0f172a;
            display: grid;
            place-items: center;
            min-height: 100vh;
            padding: 24px;
          }
          .card {
            width: min(100%, 460px);
            background: ${background};
            border: 1px solid ${border};
            border-radius: 18px;
            padding: 24px;
            box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
          }
          h1 {
            margin: 0 0 12px;
            font-size: 24px;
            color: ${accent};
          }
          p {
            margin: 0 0 10px;
            line-height: 1.5;
          }
          .muted {
            color: #475569;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(message)}</p>
          <p class="muted">Ha ez a lap nem záródik be magától, nyugodtan becsukhatod.</p>
        </div>
        <script>
          setTimeout(function () {
            window.close();
          }, 120);
        </script>
      </body>
    </html>
  `;
}

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

async function getEventWeather(req, res) {
  try {
    const result = await eventService.getEventById(req.params.eventId, req.user.id);
    const event = result?.event || null;
    const weather = await fetchEventWeatherForecast(event);

    if (!weather) {
      return res.status(200).json({
        ok: true,
        available: false,
        message: 'Ehhez az esemenyhez most nem erheto el idojarasi adat.'
      });
    }

    return res.status(200).json({
      ok: true,
      available: true,
      weather
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Idojarasi lekerdezesi hiba:',
      'Szerverhiba idojaras lekerdezes kozben.'
    );
  }
}

async function handleEventEmailAction(req, res) {
  try {
    const result = await eventEmailActionService.executeEventEmailActionToken(req.params.token);
    return res
      .status(200)
      .type('html')
      .send(
        renderEmailActionResultPage({
          title: result.action === 'skip' ? 'Kihagyás rögzítve' : 'Jelentkezés rögzítve',
          message: result.message,
          tone: result.ok === false ? 'error' : 'success'
        })
      );
  } catch (error) {
    return res
      .status(error?.statusCode === 401 ? 401 : 200)
      .type('html')
      .send(
        renderEmailActionResultPage({
          title: 'A művelet most nem sikerült',
          message: error?.message || 'Az emailes művelet most nem sikerült.',
          tone: 'error'
        })
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
  handleEventEmailAction,
  cancelEventRegistration,
  setEventAttendanceStatus,
  getEventById,
  getEventWeather,
  getEventsByTeamId
};
