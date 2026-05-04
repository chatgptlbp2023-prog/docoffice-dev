const inviteService = require('../services/inviteService');
const { sendInviteEmail } = require('../services/inviteEmailService');

function resolveAppBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || '').trim();
  if (configured) {
    return configured;
  }

  const host = String(req.get('host') || '').trim();
  if (!host) {
    return '';
  }

  const forwardedProto = String(req.get('x-forwarded-proto') || '').trim();
  const protocol = forwardedProto || req.protocol || 'http';
  return `${protocol}://${host}`;
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

async function createInvite(req, res) {
  try {
    const result = await inviteService.createInvite({
      teamId: req.params.teamId,
      invitedByUserId: req.user.id,
      email: req.body.email,
      phone: req.body.phone,
      role: req.body.role,
      message: req.body.message
    });

    let emailDelivery;
    let invite = result.invite;
    try {
      emailDelivery = await sendInviteEmail(result.invite, {
        appBaseUrl: resolveAppBaseUrl(req)
      });
    } catch (emailError) {
      console.error('Meghivo email kuldesi hiba:', emailError);
      emailDelivery = {
        status: 'failed',
        reason: 'send_failed',
        error: emailError.message,
        inviteUrl: result.invite.invite_link
      };
    }

    try {
      const deliveryUpdate = await inviteService.updateInviteEmailDelivery({
        inviteId: result.invite.id,
        status: emailDelivery.status,
        reason: emailDelivery.reason || null,
        error: emailDelivery.error || null,
        messageId: emailDelivery.messageId || null
      });
      invite = deliveryUpdate.invite;
    } catch (deliverySaveError) {
      console.error('Meghivo email allapot mentesi hiba:', deliverySaveError);
    }

    return res.status(201).json({
      ok: true,
      ...result,
      invite,
      emailDelivery
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Meghívó létrehozási hiba:',
      'Szerverhiba meghívó létrehozása közben.'
    );
  }
}

async function createJoinLink(req, res) {
  try {
    const result = await inviteService.createJoinLinkInvite({
      teamId: req.params.teamId,
      invitedByUserId: req.user.id,
      role: req.body.role,
      message: req.body.message
    });

    const appBaseUrl = resolveAppBaseUrl(req).replace(/\/+$/, '');
    const shareUrl = `${appBaseUrl}${result.invite.invite_link || ''}`;

    return res.status(201).json({
      ok: true,
      ...result,
      shareUrl
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csatlakozó link létrehozási hiba:',
      'Szerverhiba csatlakozó link létrehozása közben.'
    );
  }
}

async function getInviteByToken(req, res) {
  try {
    const result = await inviteService.getInviteByToken({
      inviteToken: req.params.inviteToken
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Meghívókód lekérdezési hiba:',
      'Szerverhiba meghívókód lekérdezése közben.'
    );
  }
}

async function getTeamInvites(req, res) {
  try {
    const result = await inviteService.getTeamInvites({
      teamId: req.params.teamId
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csapat meghívók lekérdezési hiba:',
      'Szerverhiba csapat meghívók lekérdezése közben.'
    );
  }
}

async function getMyInvites(req, res) {
  try {
    const result = await inviteService.getMyInvites({
      email: req.user.email
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Saját meghívók lekérdezési hiba:',
      'Szerverhiba saját meghívók lekérdezése közben.'
    );
  }
}

async function acceptInvite(req, res) {
  try {
    const result = await inviteService.acceptInvite({
      inviteId: req.params.inviteId,
      userId: req.user.id,
      email: req.user.email
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Meghívás elfogadási hiba:',
      'Szerverhiba meghívás elfogadása közben.'
    );
  }
}

async function acceptInviteToken(req, res) {
  try {
    const result = await inviteService.acceptInviteTokenForAuthenticatedUser({
      inviteToken: req.params.inviteToken,
      userId: req.user.id,
      email: req.user.email
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Meghívókód elfogadási hiba:',
      'Szerverhiba meghívókód elfogadása közben.'
    );
  }
}

async function declineInvite(req, res) {
  try {
    const result = await inviteService.declineInvite({
      inviteId: req.params.inviteId,
      email: req.user.email
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Meghívás elutasítási hiba:',
      'Szerverhiba meghívás elutasítása közben.'
    );
  }
}

async function revokeInvite(req, res) {
  try {
    const result = await inviteService.revokeInvite({
      teamId: req.params.teamId,
      inviteId: req.params.inviteId
    });

    return res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Meghívó visszavonási hiba:',
      'Szerverhiba meghívó visszavonása közben.'
    );
  }
}

module.exports = {
  createInvite,
  createJoinLink,
  getInviteByToken,
  getTeamInvites,
  getMyInvites,
  acceptInvite,
  acceptInviteToken,
  declineInvite,
  revokeInvite
};
