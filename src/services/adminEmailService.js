const AppError = require('../utils/appError');
const { pool } = require('./dbService');
const eventNotificationService = require('./eventNotificationService');
const {
  fetchEventWeatherForecast,
  buildWeatherAlert,
  hasPreciseWeatherAddress
} = require('./weatherService');
const {
  normalizeNotificationPreferences
} = require('../utils/notificationPreferences');
const {
  EMAIL_TEMPLATE_KEYS,
  getEmailTemplateDefinition,
  getManualResendEmailTemplates,
  normalizeTemplateKey
} = require('../utils/emailTemplateCatalog');

const ADMIN_EMAIL_TEMPLATES = EMAIL_TEMPLATE_KEYS;
const ACTIVE_EVENT_REGISTRATION_STATUSES = ['going', 'waiting_list', 'waiting_list_rank'];
const ALL_EVENT_NOTIFICATION_STATUSES = ['going', 'waiting_list', 'waiting_list_rank', 'cancelled'];

function normalizeTemplate(template) {
  return normalizeTemplateKey(template);
}

function isMemberOnBreak(member, referenceDate = new Date()) {
  if (!member?.break_until) return false;
  const breakUntil = new Date(member.break_until);
  const reference = new Date(referenceDate);
  if (Number.isNaN(breakUntil.getTime()) || Number.isNaN(reference.getTime())) return false;
  return breakUntil > reference;
}

function isMemberPassive(member) {
  return Boolean(member?.passive_since);
}

function summarizeRecipients(members = [], { referenceDate = new Date() } = {}) {
  const seenEligibleEmails = new Set();
  const seenExcludedEmails = new Set();
  const eligibleRecipients = [];
  const excluded = [];
  const counters = {
    onBreak: 0,
    passive: 0,
    missingEmail: 0,
    duplicateEmail: 0
  };

  for (const member of members) {
    const email = String(member?.email || '').trim().toLowerCase();

    if (!email) {
      counters.missingEmail += 1;
      excluded.push({
        userId: member?.user_id || null,
        reason: 'missing_email'
      });
      continue;
    }

    if (isMemberPassive(member)) {
      counters.passive += 1;
      if (!seenExcludedEmails.has(email)) {
        seenExcludedEmails.add(email);
        excluded.push({
          userId: member.user_id,
          email,
          reason: 'passive'
        });
      }
      continue;
    }

    if (isMemberOnBreak(member, referenceDate)) {
      counters.onBreak += 1;
      if (!seenExcludedEmails.has(email)) {
        seenExcludedEmails.add(email);
        excluded.push({
          userId: member.user_id,
          email,
          reason: 'on_break'
        });
      }
      continue;
    }

    if (seenEligibleEmails.has(email)) {
      counters.duplicateEmail += 1;
      excluded.push({
        userId: member.user_id,
        email,
        reason: 'duplicate_email'
      });
      continue;
    }

    seenEligibleEmails.add(email);
    eligibleRecipients.push({
      userId: member.user_id,
      name: member.name || '',
      email
    });
  }

  return {
    recipientCount: eligibleRecipients.length,
    excludedCount: excluded.length,
    excludedBreakCount: counters.onBreak,
    excludedPassiveCount: counters.passive,
    excludedMissingEmailCount: counters.missingEmail,
    excludedDuplicateEmailCount: counters.duplicateEmail,
    recipients: eligibleRecipients,
    excluded
  };
}

function buildExcludedReasons(summary = {}) {
  const reasons = {};
  if (Number(summary.excludedBreakCount || 0) > 0) reasons.on_break = Number(summary.excludedBreakCount || 0);
  if (Number(summary.excludedPassiveCount || 0) > 0) reasons.passive = Number(summary.excludedPassiveCount || 0);
  if (Number(summary.excludedMissingEmailCount || 0) > 0) reasons.missing_email = Number(summary.excludedMissingEmailCount || 0);
  if (Number(summary.excludedDuplicateEmailCount || 0) > 0) reasons.duplicate_email = Number(summary.excludedDuplicateEmailCount || 0);
  return reasons;
}

function emptyRecipientSummary() {
  return summarizeRecipients([]);
}

function appendReason(reasons, condition, message) {
  if (condition) {
    reasons.push(message);
  }
}

async function loadEventEmailContext({ teamId, eventId, template }) {
  const normalizedTemplate = normalizeTemplate(template);
  const templateDefinition = getEmailTemplateDefinition(normalizedTemplate);
  if (!templateDefinition || templateDefinition.manualResendEnabled !== true) {
    throw new AppError(400, 'Ismeretlen vagy nem tamogatott email sablon.');
  }

  if (templateDefinition.requiresEvent && !eventId) {
    throw new AppError(400, 'Az eventId kotelezo ehhez az email sablonhoz.');
  }

  if (!templateDefinition.requiresEvent) {
    return {
      template: normalizedTemplate,
      templateDefinition,
      event: null,
      notificationPreferences: {},
      members: [],
      registrations: []
    };
  }

  const eventResult = await pool.query(
    `
    select
      e.id,
      e.team_id,
      e.created_by_user_id,
      e.title,
      e.start_at,
      e.location_name,
      e.location_address,
      e.status,
      e.max_players,
      es.notification_preferences
      ,
      etd.status as draw_status,
      etd.published_at as draw_published_at
    from events e
    left join event_settings es on es.event_id = e.id
    left join event_team_draws etd on etd.event_id = e.id
    where e.id = $1
      and e.team_id = $2
    limit 1
    `,
    [eventId, teamId]
  );

  const event = eventResult.rows[0];
  if (!event) {
    throw new AppError(404, 'Az esemeny nem talalhato ennel a csapatnal.');
  }

  const notificationPreferences = normalizeNotificationPreferences(event.notification_preferences);

  const membersResult = await pool.query(
    `
    select
      u.id as user_id,
      u.name,
      lower(u.email) as email,
      tm.break_until,
      tm.passive_since
    from team_members tm
    join users u on u.id = tm.user_id
    where tm.team_id = $1
      and tm.membership_status = 'active'
    order by u.name asc, u.email asc
    `,
    [teamId]
  );

  const registrationsResult = await pool.query(
    `
    select
      er.user_id,
      u.name,
      lower(u.email) as email,
      er.registration_status,
      tm.break_until,
      tm.passive_since
    from event_registrations er
    join users u on u.id = er.user_id
    left join team_members tm on tm.team_id = er.team_id
      and tm.user_id = er.user_id
    where er.event_id = $1
    order by er.registered_at asc
    `,
    [eventId]
  );

  return {
    template: normalizedTemplate,
    templateDefinition,
    event,
    notificationPreferences,
    members: membersResult.rows,
    registrations: registrationsResult.rows
  };
}

function getRecipientsForTemplate(context) {
  switch (context.template) {
    case ADMIN_EMAIL_TEMPLATES.EVENT_CREATED:
    case ADMIN_EMAIL_TEMPLATES.EVENT_CREATED_SCHEDULED:
      return summarizeRecipients(context.members);
    case ADMIN_EMAIL_TEMPLATES.TEAM_DRAW_PUBLISHED:
    case ADMIN_EMAIL_TEMPLATES.EVENT_UPDATED:
    case ADMIN_EMAIL_TEMPLATES.WEATHER_ALERT:
      return summarizeRecipients(
        context.registrations.filter(item => ACTIVE_EVENT_REGISTRATION_STATUSES.includes(item.registration_status))
      );
    case ADMIN_EMAIL_TEMPLATES.EVENT_CANCELLED:
      return summarizeRecipients(
        context.registrations.filter(item => ALL_EVENT_NOTIFICATION_STATUSES.includes(item.registration_status))
      );
    default:
      return emptyRecipientSummary();
  }
}

async function buildSendability(context, recipientSummary) {
  const reasons = [];
  const event = context.event || {};
  const prefs = context.notificationPreferences || {};

  if (!context.templateDefinition.requiresEvent) {
    return {
      sendable: false,
      reasons: [...(context.templateDefinition.sendabilityRules || [])]
    };
  }

  appendReason(reasons, Number(recipientSummary.recipientCount || 0) <= 0, 'Nincs kikuldheto cimzett ehhez a sablonhoz.');

  switch (context.template) {
    case ADMIN_EMAIL_TEMPLATES.EVENT_CREATED:
      appendReason(reasons, event.status !== 'published', 'Uj esemeny email csak published esemenyhez kuldheto.');
      appendReason(reasons, prefs.notifyTeamOnCreate !== true, 'Ennel az esemenynel az uj esemeny ertesites ki van kapcsolva.');
      break;
    case ADMIN_EMAIL_TEMPLATES.EVENT_CREATED_SCHEDULED:
      reasons.push('Az utemezett uj esemeny emailt az utemezo kezeli. Kezi ujrakuldeshez valaszd az Uj esemeny sablont.');
      break;
    case ADMIN_EMAIL_TEMPLATES.NEW_MEMBER_EVENT_CATCHUP:
      reasons.push('Ehhez konkret uj tag kivalasztasa szukseges, amit ez a kezi felulet meg nem kezel.');
      break;
    case ADMIN_EMAIL_TEMPLATES.TEAM_DRAW_PUBLISHED:
      appendReason(reasons, event.draw_status !== 'published', 'Ehhez az esemenyhez meg nincs kihirdetett csapatleosztas.');
      appendReason(reasons, prefs.notifyTeamDrawPublished !== true, 'A csapatleosztas ertesites kapcsolo ki van kapcsolva.');
      break;
    case ADMIN_EMAIL_TEMPLATES.EVENT_UPDATED:
      reasons.push('Kezi ujrakuldeshez nincs eleg korabbi idopont/helyszin adat a pontos osszehasonlitashoz.');
      break;
    case ADMIN_EMAIL_TEMPLATES.EVENT_CANCELLED:
      appendReason(reasons, event.status !== 'cancelled', 'Torlesi email csak cancelled statuszu esemenyhez kuldheto.');
      appendReason(reasons, prefs.notifyParticipantsOnEventCancel !== true, 'Az esemeny torlesi ertesites kapcsolo ki van kapcsolva.');
      break;
    case ADMIN_EMAIL_TEMPLATES.WEATHER_ALERT:
      appendReason(reasons, prefs.notifyWeatherAlerts !== true, 'Az idojarasi ertesites kapcsolo ki van kapcsolva.');
      appendReason(reasons, !hasPreciseWeatherAddress(event), 'Az idojarasi figyelmezteteshez pontos cim szukseges.');
      if (!reasons.length) {
        try {
          const weather = await fetchEventWeatherForecast(event);
          const alert = buildWeatherAlert(weather);
          appendReason(reasons, !alert, 'Az aktualis elorejelzes alapjan nincs kikuldheto idojarasi figyelmeztetes.');
        } catch (error) {
          reasons.push(error.message || 'Az idojaras szolgaltatas most nem elerheto.');
        }
      }
      break;
    case ADMIN_EMAIL_TEMPLATES.TEAM_BREAK_REMINDER:
      reasons.push('Ehhez konkret szabin levo tag kivalasztasa szukseges, amit ez a kezi felulet meg nem kezel.');
      break;
    default:
      reasons.push('Ez a sablon nem kuldheto kezzel.');
      break;
  }

  return {
    sendable: reasons.length === 0,
    reasons
  };
}

function buildPreviewResponse(context, recipientSummary, sendability) {
  const event = context.event;
  const templateDefinition = context.templateDefinition;

  return {
    template: context.template,
    templateLabel: templateDefinition.label,
    description: templateDefinition.description,
    recipientsDescription: templateDefinition.recipientsDescription,
    triggerDescription: templateDefinition.triggerDescription,
    contentDescription: templateDefinition.contentDescription,
    sendability,
    sendabilityRules: templateDefinition.sendabilityRules || [],
    expectedRecipientCount: Number(recipientSummary.recipientCount || 0),
    excludedRecipientCount: Number(recipientSummary.excludedCount || 0),
    excludedReasons: buildExcludedReasons(recipientSummary),
    event: event ? {
      id: event.id,
      title: event.title,
      start_at: event.start_at,
      location_name: event.location_name,
      location_address: event.location_address,
      status: event.status,
      draw_status: event.draw_status || null
    } : null,
    recipientSummary
  };
}

async function previewAdminEmailSend({ teamId, template, eventId }) {
  const context = await loadEventEmailContext({ teamId, template, eventId });
  const recipientSummary = getRecipientsForTemplate(context);
  const sendability = await buildSendability(context, recipientSummary);
  return buildPreviewResponse(context, recipientSummary, sendability);
}

async function sendAdminEmail({ teamId, template, eventId, actorUserId = null }) {
  const preview = await previewAdminEmailSend({ teamId, template, eventId });

  if (preview.sendability?.sendable !== true) {
    const reason = (preview.sendability?.reasons || [])[0] || 'Ez az email sablon most nem kuldheto.';
    throw new AppError(400, reason);
  }

  const auditMetadata = {
    manualResend: true,
    manualResendTemplate: preview.template,
    actorUserId
  };

  let notificationResult = null;
  if (preview.template === ADMIN_EMAIL_TEMPLATES.EVENT_CREATED) {
    notificationResult = await eventNotificationService.notifyEventCreated({
      eventId,
      actorUserId,
      auditMetadata
    });
  } else if (preview.template === ADMIN_EMAIL_TEMPLATES.TEAM_DRAW_PUBLISHED) {
    notificationResult = await eventNotificationService.notifyTeamDrawPublished({
      eventId,
      automated: false,
      auditMetadata
    });
  } else if (preview.template === ADMIN_EMAIL_TEMPLATES.EVENT_CANCELLED) {
    notificationResult = await eventNotificationService.notifyEventCancelled({
      eventId,
      auditMetadata
    });
  } else if (preview.template === ADMIN_EMAIL_TEMPLATES.WEATHER_ALERT) {
    notificationResult = await eventNotificationService.notifyWeatherAlert({
      eventId,
      auditMetadata
    });
  }

  if (!notificationResult) {
    throw new AppError(400, 'Az email kikuldese nem indult el. Ellenorizd az esemeny allapotat es az ertesitesi beallitast.');
  }

  return {
    template: preview.template,
    eventId,
    sentCount: Number(notificationResult.sentCount || 0),
    skippedCount: Number(notificationResult.skippedCount || 0),
    failedCount: Number(notificationResult.failedCount || 0),
    deliveries: notificationResult.deliveries || [],
    preview
  };
}

function listManualAdminEmailTemplates() {
  return {
    templates: getManualResendEmailTemplates()
  };
}

module.exports = {
  ADMIN_EMAIL_TEMPLATES,
  listManualAdminEmailTemplates,
  previewAdminEmailSend,
  sendAdminEmail
};
