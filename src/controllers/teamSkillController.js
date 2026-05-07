const teamSkillService = require('../services/teamSkillService');
const eventNotificationService = require('../services/eventNotificationService');

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

async function getSkillSettings(req, res) {
  try {
    const result = await teamSkillService.getSkillSettings(req.params.teamId);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Skill settings lekérdezési hiba:',
      'Szerverhiba a skill beállítások lekérdezése közben.'
    );
  }
}

async function updateSkillSettings(req, res) {
  try {
    const result = await teamSkillService.updateSkillSettings({
      teamId: req.params.teamId,
      skillBalancingEnabled: req.body.skillBalancingEnabled,
      skillBalanceTolerancePercent: req.body.skillBalanceTolerancePercent,
      rankModuleEnabled: req.body.rankModuleEnabled
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Skill settings mentési hiba:',
      'Szerverhiba a skill beállítások mentése közben.'
    );
  }
}

async function updateMemberRank(req, res) {
  try {
    const result = await teamSkillService.updateMemberRank({
      teamId: req.params.teamId,
      memberId: req.params.memberId,
      rankValue: req.body.rankValue,
      rankStatus: req.body.rankStatus
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csapattag rang mentési hiba:',
      'Szerverhiba a csapattag rangjának mentése közben.'
    );
  }
}


async function updateMemberGoalkeeperRole(req, res) {
  try {
    const result = await teamSkillService.updateMemberGoalkeeperRole({
      teamId: req.params.teamId,
      memberId: req.params.memberId,
      isGoalkeeper: req.body.isGoalkeeper
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csapattag kapus szerepkör mentési hiba:',
      'Szerverhiba a csapattag kapus szerepkör mentése közben.'
    );
  }
}

async function updateMemberSkills(req, res) {
  try {
    const result = await teamSkillService.updateMemberSkills({
      teamId: req.params.teamId,
      memberId: req.params.memberId,
      skillsEnabled: req.body.skillsEnabled,
      goalkeeperSkill: req.body.goalkeeperSkill,
      defenseSkill: req.body.defenseSkill,
      attackSkill: req.body.attackSkill
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Csapattag skill mentési hiba:',
      'Szerverhiba a csapattag skill adatok mentése közben.'
    );
  }
}

async function previewBalancedTeams(req, res) {
  try {
    const result = await teamSkillService.previewBalancedTeams({
      teamId: req.params.teamId
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Skill alapú csapatsorsolás preview hiba:',
      'Szerverhiba a csapatsorsolás preview készítése közben.'
    );
  }
}

async function previewEventBalancedTeams(req, res) {
  try {
    const result = await teamSkillService.previewEventBalancedTeams({
      eventId: req.params.eventId
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Esemény alapú csapatsorsolás preview hiba:',
      'Szerverhiba az esemény csapatleosztás preview készítése közben.'
    );
  }
}

async function saveEventTeamDraw(req, res) {
  try {
    const result = await teamSkillService.saveEventTeamDraw({
      eventId: req.params.eventId,
      userId: req.user.id,
      draw: req.body?.draw || null
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Esemény csapatleosztás mentési hiba:',
      'Szerverhiba az esemény csapatleosztás mentése közben.'
    );
  }
}

async function publishEventTeamDraw(req, res) {
  try {
    const result = await teamSkillService.publishEventTeamDraw({
      eventId: req.params.eventId
    });

    try {
      await eventNotificationService.notifyTeamDrawPublished({
        eventId: req.params.eventId,
        automated: false
      });
    } catch (error) {
      console.error('Csapatleosztas ertesitesi hiba:', error);
    }

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Esemény csapatleosztás kihirdetési hiba:',
      'Szerverhiba az esemény csapatleosztás kihirdetése közben.'
    );
  }
}

async function getEventTeamDraw(req, res) {
  try {
    const result = await teamSkillService.getEventTeamDraw({
      eventId: req.params.eventId
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return handleServiceError(
      res,
      error,
      'Mentett esemény csapatleosztás lekérési hiba:',
      'Szerverhiba a mentett esemény csapatleosztás lekérése közben.'
    );
  }
}

module.exports = {
  getSkillSettings,
  updateSkillSettings,
  updateMemberRank,
  updateMemberGoalkeeperRole,
  updateMemberSkills,
  previewBalancedTeams,
  previewEventBalancedTeams,
  saveEventTeamDraw,
  publishEventTeamDraw,
  getEventTeamDraw
};
