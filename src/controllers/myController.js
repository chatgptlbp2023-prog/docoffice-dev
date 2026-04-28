const myService = require('../services/myService');

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

async function getMyTeams(req, res) {
  try {
    const result = await myService.getMyTeams(req.user.id);

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Saját csapatok lekérdezési hiba:',
      'Szerverhiba saját csapatok lekérdezése közben.'
    );
  }
}

async function getMyEvents(req, res) {
  try {
    const result = await myService.getMyEvents(req.user.id);

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Saját események lekérdezési hiba:',
      'Szerverhiba saját események lekérdezése közben.'
    );
  }
}

async function getPlatformSummary(req, res) {
  try {
    const result = await myService.getPlatformSummary(req.user);

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Platform summary lekérdezési hiba:',
      'Szerverhiba platform összkép lekérdezése közben.'
    );
  }
}

module.exports = {
  getMyTeams,
  getMyEvents,
  getPlatformSummary
};
