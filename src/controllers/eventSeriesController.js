
const eventSeriesService = require('../services/eventSeriesService');

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

    return res.status(201).json({
      ok: true,
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
