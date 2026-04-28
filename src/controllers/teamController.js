const teamService = require('../services/teamService');

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

async function createTeam(req, res) {
  try {
    const result = await teamService.createTeam({
      name: req.body.name,
      createdByUserId: req.user.id
    });

    return res.status(201).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csapat létrehozási hiba:',
      'Szerverhiba csapat létrehozás közben.'
    );
  }
}

async function getTeamById(req, res) {
  try {
    const result = await teamService.getTeamById(req.params.teamId, req.user);

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csapat lekérdezési hiba:',
      'Szerverhiba csapat lekérdezés közben.'
    );
  }
}

async function transferCaptainRole(req, res) {
  try {
    const result = await teamService.transferCaptainRole({
      teamId: req.params.teamId,
      actingUserId: req.user.id,
      targetUserId: req.body.targetUserId,
      actingPlatformRole: req.user.platform_role
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Captain transfer hiba:',
      'Szerverhiba captain transfer közben.'
    );
  }
}

async function addTeamMember(req, res) {
  try {
    const result = await teamService.addTeamMember({
      teamId: req.params.teamId,
      email: req.body.email,
      role: req.body.role
    });

    return res.status(201).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csapattag hozzáadási hiba:',
      'Szerverhiba csapattag hozzáadása közben.'
    );
  }
}

async function updateTeamMember(req, res) {
  try {
    const result = await teamService.updateTeamMember({
      teamId: req.params.teamId,
      memberId: req.params.memberId,
      role: req.body.role
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csapattag frissítési hiba:',
      'Szerverhiba csapattag frissítése közben.'
    );
  }
}

async function removeTeamMember(req, res) {
  try {
    const result = await teamService.removeTeamMember({
      teamId: req.params.teamId,
      memberId: req.params.memberId
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csapattag eltávolítási hiba:',
      'Szerverhiba csapattag eltávolítása közben.'
    );
  }
}

async function addFinanceAdjustment(req, res) {
  try {
    const result = await teamService.addFinanceAdjustment({
      teamId: req.params.teamId,
      targetUserId: req.params.userId,
      adjustmentAmount: req.body.adjustmentAmount,
      note: req.body.note,
      recordedByUserId: req.user.id
    });

    return res.status(201).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Kulon befizetes rogzitese hiba:',
      'Szerverhiba kulon befizetes rogzitese kozben.'
    );
  }
}

module.exports = {
  createTeam,
  getTeamById,
  transferCaptainRole,
  addTeamMember,
  updateTeamMember,
  removeTeamMember,
  addFinanceAdjustment
};
