const AppError = require('../utils/appError');
const { pool } = require('./dbService');
const eventNotificationService = require('./eventNotificationService');
const {
  normalizeNotificationPreferences
} = require('../utils/notificationPreferences');

const ADMIN_EMAIL_TEMPLATES = Object.freeze({
  EVENT_CREATED: 'event_created'
});

function normalizeTemplate(template) {
  return String(template || '').trim().toLowerCase();
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

async function loadEventEmailContext({ teamId, eventId, template }) {
  const normalizedTemplate = normalizeTemplate(template);
  if (normalizedTemplate !== ADMIN_EMAIL_TEMPLATES.EVENT_CREATED) {
    throw new AppError(400, 'Ismeretlen vagy nem tamogatott email sablon.');
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
      es.notification_preferences
    from events e
    left join event_settings es on es.event_id = e.id
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

  if (event.status !== 'published') {
    throw new AppError(400, 'Uj esemeny email csak published esemenyhez kuldheto.');
  }

  const notificationPreferences = normalizeNotificationPreferences(event.notification_preferences);
  if (notificationPreferences.notifyTeamOnCreate !== true) {
    throw new AppError(400, 'Ennel az esemenynel az uj esemeny ertesites ki van kapcsolva.');
  }

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

  return {
    template: normalizedTemplate,
    event,
    notificationPreferences,
    members: membersResult.rows
  };
}

async function previewAdminEmailSend({ teamId, template, eventId }) {
  const context = await loadEventEmailContext({ teamId, template, eventId });
  const recipientSummary = summarizeRecipients(context.members);

  return {
    template: context.template,
    event: {
      id: context.event.id,
      title: context.event.title,
      start_at: context.event.start_at,
      location_name: context.event.location_name,
      location_address: context.event.location_address,
      status: context.event.status
    },
    recipientSummary
  };
}

async function sendAdminEmail({ teamId, template, eventId, actorUserId = null }) {
  const preview = await previewAdminEmailSend({ teamId, template, eventId });

  if (preview.recipientSummary.recipientCount <= 0) {
    throw new AppError(400, 'Nincs kikuldheto cimzett ehhez az emailhez.');
  }

  const notificationResult = await eventNotificationService.notifyEventCreated({
    eventId,
    actorUserId
  });

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

module.exports = {
  ADMIN_EMAIL_TEMPLATES,
  previewAdminEmailSend,
  sendAdminEmail
};
