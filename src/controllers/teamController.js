const teamService = require('../services/teamService');
const teamRulesService = require('../services/teamRulesService');
const teamBreakActionService = require('../services/teamBreakActionService');
const adminEmailService = require('../services/adminEmailService');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderActionResultPage({ title, message, tone = 'success' }) {
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
      </head>
      <body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:${background};color:#111827;">
        <main style="max-width:560px;margin:64px auto;padding:28px;border:1px solid ${border};border-radius:18px;background:#ffffff;box-shadow:0 18px 45px rgba(15,23,42,0.08);">
          <h1 style="margin:0 0 14px;color:${accent};font-size:28px;">${escapeHtml(title)}</h1>
          <p style="font-size:16px;line-height:1.6;margin:0;">${escapeHtml(message)}</p>
        </main>
      </body>
    </html>
  `;
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

async function updateTeamRules(req, res) {
  try {
    const result = await teamRulesService.updateTeamRules({
      teamId: req.params.teamId,
      updatedByUserId: req.user.id,
      rulesModuleEnabled: req.body.rulesModuleEnabled,
      rulesText: req.body.rulesText
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csapatszabalyzat frissitesi hiba:',
      'Szerverhiba csapatszabalyzat frissitese kozben.'
    );
  }
}

async function updateTeamModuleSettings(req, res) {
  try {
    const result = await teamService.updateTeamModuleSettings({
      teamId: req.params.teamId,
      cashModuleEnabled: req.body.cashModuleEnabled,
      disciplineModuleEnabled: req.body.disciplineModuleEnabled,
      adminGuideModuleEnabled: req.body.adminGuideModuleEnabled
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csapat modulbeallitas frissitesi hiba:',
      'Szerverhiba csapat modulbeallitas frissitese kozben.'
    );
  }
}

async function acceptTeamRules(req, res) {
  try {
    const result = await teamRulesService.acceptTeamRules({
      teamId: req.params.teamId,
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
      'Csapatszabalyzat elfogadasi hiba:',
      'Szerverhiba csapatszabalyzat elfogadasa kozben.'
    );
  }
}

async function startMyTeamBreak(req, res) {
  try {
    const result = await teamService.startMyTeamBreak({
      teamId: req.params.teamId,
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
      'Szabi inditasi hiba:',
      'Szerverhiba szabi inditasa kozben.'
    );
  }
}

async function endMyTeamBreak(req, res) {
  try {
    const result = await teamService.endMyTeamBreak({
      teamId: req.params.teamId,
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
      'Szabi lezarasi hiba:',
      'Szerverhiba szabi lezarasa kozben.'
    );
  }
}

async function updateTeamMemberActivityStatus(req, res) {
  try {
    const result = await teamService.updateTeamMemberActivityStatus({
      teamId: req.params.teamId,
      memberId: req.params.memberId,
      status: req.body.status || null,
      clearBreak: req.body.clearBreak === true,
      extendBreak: req.body.extendBreak === true
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csapattag aktivitasi allapot hiba:',
      'Szerverhiba csapattag aktivitasi allapot modositasa kozben.'
    );
  }
}

async function previewAdminEmailSend(req, res) {
  try {
    const result = await adminEmailService.previewAdminEmailSend({
      teamId: req.params.teamId,
      template: req.body.template,
      eventId: req.body.eventId
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Admin email preview hiba:',
      'Szerverhiba admin email elonezet kozben.'
    );
  }
}

async function sendAdminEmail(req, res) {
  try {
    const result = await adminEmailService.sendAdminEmail({
      teamId: req.params.teamId,
      template: req.body.template,
      eventId: req.body.eventId,
      actorUserId: req.user.id
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Admin email kuldes hiba:',
      'Szerverhiba admin email kuldese kozben.'
    );
  }
}

async function handleTeamBreakEmailAction(req, res) {
  try {
    const result = await teamBreakActionService.executeTeamBreakActionToken(req.params.token);
    const titleByAction = {
      extend_break_one_week: 'Szabi meghosszabbítva',
      end_break: 'Visszatérés rögzítve'
    };

    return res
      .status(200)
      .type('html')
      .send(
        renderActionResultPage({
          title: titleByAction[result.action] || 'Szabi művelet rögzítve',
          message: result.message,
          tone: result.ok === false ? 'error' : 'success'
        })
      );
  } catch (error) {
    return res
      .status(error?.statusCode === 401 ? 401 : 200)
      .type('html')
      .send(
        renderActionResultPage({
          title: 'A művelet most nem sikerült',
          message: error?.message || 'A szabi művelet most nem sikerült.',
          tone: 'error'
        })
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
  addFinanceAdjustment,
  updateTeamRules,
  updateTeamModuleSettings,
  acceptTeamRules,
  startMyTeamBreak,
  endMyTeamBreak,
  updateTeamMemberActivityStatus,
  previewAdminEmailSend,
  sendAdminEmail,
  handleTeamBreakEmailAction
};
