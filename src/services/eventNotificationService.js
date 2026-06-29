const { randomUUID } = require('crypto');
const { pool } = require('./dbService');
const { sendEmail } = require('./emailService');
const emailAuditLogService = require('./emailAuditLogService');
const { normalizeNotificationPreferences } = require('../utils/notificationPreferences');
const { buildEventPaymentSummary } = require('../utils/eventPricing');
const {
  EVENT_EMAIL_ACTIONS,
  normalizeAppBaseUrl,
  buildEventAppUrl,
  buildEventEmailActionUrl,
  buildEventEmailActionToken
} = require('./eventEmailActionService');
const {
  fetchEventWeatherForecast,
  buildWeatherAlert,
  buildWeatherAlertEmail,
  hasPreciseWeatherAddress
} = require('./weatherService');

const ACTIVE_EVENT_REGISTRATION_STATUSES = ['going', 'waiting_list', 'waiting_list_rank'];
const ALL_EVENT_NOTIFICATION_STATUSES = ['going', 'waiting_list', 'waiting_list_rank', 'cancelled'];
const EVENT_TIMEZONE = 'Europe/Budapest';
const DEFAULT_NEW_MEMBER_CATCHUP_EVENT_LIMIT = 5;
const EVENT_CREATED_EMAIL_TEMPLATE = 'event_created';
const EMAIL_TEMPLATES = Object.freeze({
  NEW_MEMBER_EVENT_CATCHUP: 'new_member_event_catchup',
  NEW_REGISTRATION: 'new_registration',
  CAPACITY_TWO_SPOTS_LEFT: 'capacity_two_spots_left',
  CAPACITY_FULL: 'capacity_full',
  WAITLIST_PROMOTION: 'waitlist_promotion',
  TEAM_DRAW_PUBLISHED: 'team_draw_published',
  EVENT_UPDATED: 'event_updated',
  EVENT_CANCELLED: 'event_cancelled',
  WEATHER_ALERT: 'weather_alert'
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function uniqueRecipients(rows = [], { excludeUserIds = [] } = {}) {
  const excluded = new Set((excludeUserIds || []).map(item => String(item)));
  const seen = new Set();
  const recipients = [];

  for (const row of rows) {
    const email = String(row?.email || '').trim().toLowerCase();
    const userId = String(row?.user_id || '');
    if (
      !email ||
      excluded.has(userId) ||
      seen.has(email) ||
      isTeamMemberOnBreak(row) ||
      isTeamMemberPassive(row)
    ) {
      continue;
    }
    seen.add(email);
    recipients.push({
      userId,
      name: row?.name || '',
      email
    });
  }

  return recipients;
}

function normalizeRecipientEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function buildMissingEmailAuditAddress(member) {
  const userId = String(member?.user_id || '').trim();
  return userId ? `missing:${userId}` : 'missing:unknown';
}

function formatEventDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('hu-HU', {
    timeZone: EVENT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return '-';
  }

  return `${amount.toLocaleString('hu-HU')} Ft`;
}

async function getEventNotificationContext(eventId) {
  const eventResult = await pool.query(
    `
    select
      e.id,
      e.team_id,
      e.created_by_user_id,
      e.title,
      e.description,
      e.start_at,
      e.published_at,
      e.location_name,
      e.location_address,
      e.status,
      e.max_players,
      es.notification_preferences,
      es.field_size,
      es.field_quality,
      es.surface_type,
      es.fixed_price_per_person,
      es.total_event_cost,
      es.per_player_fee,
      es.payment_notes,
      es.payment_link_provider,
      es.payment_link_url,
      es.pricing_mode,
      es.price_per_player,
      es.players_on_field_total,
      etd.status as draw_status,
      t.name as team_name
    from events e
    left join event_settings es on es.event_id = e.id
    left join event_team_draws etd on etd.event_id = e.id
    join teams t on t.id = e.team_id
    where e.id = $1
    `,
    [eventId]
  );

  if (!eventResult.rows.length) {
    return null;
  }

  const event = eventResult.rows[0];
  const notificationPreferences = normalizeNotificationPreferences(event.notification_preferences);

  const teamMembersResult = await pool.query(
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
    `,
    [event.team_id]
  );

  const registrationsResult = await pool.query(
    `
    select
      er.user_id,
      u.name,
      lower(u.email) as email,
      er.registration_status,
      er.promoted_at,
      er.registered_at,
      er.cancelled_at,
      tm.break_until,
      tm.passive_since
    from event_registrations er
    join users u on u.id = er.user_id
    left join team_members tm on tm.team_id = er.team_id
      and tm.user_id = er.user_id
    where er.event_id = $1
      and nullif(trim(u.email), '') is not null
    order by er.registered_at asc
    `,
    [eventId]
  );

  const emailActionsResult = await pool.query(
    `
    select
      eal.user_id,
      eal.action,
      eal.status,
      eal.acted_at
    from event_email_action_log eal
    where eal.event_id = $1
    order by eal.acted_at desc, eal.created_at desc
    `,
    [eventId]
  );

  return {
    event,
    notificationPreferences,
    teamMembers: teamMembersResult.rows,
    registrations: registrationsResult.rows,
    emailActions: emailActionsResult.rows
  };
}

async function createBulkEmailAuditLog(auditBase, recipient, metadata = {}) {
  if (!auditBase?.template) return null;

  return runEmailAuditSafely(
    () => emailAuditLogService.createEmailLog({
      ...auditBase,
      recipientUserId: recipient?.userId || recipient?.user_id || null,
      recipientEmail: recipient?.email,
      status: 'pending',
      metadata
    }),
    `pending:${auditBase.template}`
  );
}

async function markBulkEmailAuditSkipped(auditLog, reason, template, metadata = {}) {
  if (!auditLog?.id) return null;
  return runEmailAuditSafely(
    () => emailAuditLogService.markEmailLogSkipped({
      id: auditLog.id,
      reason,
      metadata
    }),
    `skipped:${template}:${reason}`
  );
}

async function markBulkEmailAuditSent(auditLog, delivery, template) {
  if (!auditLog?.id) return null;
  return runEmailAuditSafely(
    () => emailAuditLogService.markEmailLogSent({
      id: auditLog.id,
      providerMessageId: delivery?.messageId || null,
      metadata: {
        accepted: delivery?.accepted || [],
        rejected: delivery?.rejected || []
      }
    }),
    `sent:${template}`
  );
}

async function markBulkEmailAuditFailed(auditLog, errorMessage, template, metadata = {}) {
  if (!auditLog?.id) return null;
  return runEmailAuditSafely(
    () => emailAuditLogService.markEmailLogFailed({
      id: auditLog.id,
      errorMessage,
      metadata
    }),
    `failed:${template}`
  );
}

function buildBulkEmailAuditBase(auditOptions = {}) {
  const template = normalizeOptionalEmailTemplate(auditOptions.template);
  if (!template) return null;

  return {
    template,
    teamId: auditOptions.teamId || null,
    eventId: auditOptions.eventId || null,
    deliveryBatchId: auditOptions.deliveryBatchId || randomUUID()
  };
}

function normalizeOptionalEmailTemplate(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

async function sendBulkEmails(recipients, payloadOrFactory, metaLabel, auditOptions = {}) {
  const results = [];
  const auditBase = buildBulkEmailAuditBase(auditOptions);
  const auditMetadata = {
    flow: auditBase?.template || metaLabel,
    metaLabel,
    ...(auditOptions.metadata || {})
  };

  for (const recipient of recipients) {
    const auditLog = await createBulkEmailAuditLog(auditBase, recipient, auditMetadata);

    try {
      const payload = typeof payloadOrFactory === 'function'
        ? await payloadOrFactory(recipient)
        : payloadOrFactory;

      if (!payload || !payload.subject) {
        await markBulkEmailAuditSkipped(auditLog, 'missing_payload', auditBase?.template, auditMetadata);
        results.push({
          email: recipient.email,
          status: 'skipped',
          reason: 'missing_payload'
        });
        continue;
      }

      const delivery = await sendEmail({
        to: recipient.email,
        subject: payload.subject,
        text: payload.text,
        html: payload.html
      });
      results.push({
        email: recipient.email,
        ...delivery
      });

      const rawDeliveryStatus = String(delivery?.status || 'sent');
      if (rawDeliveryStatus === 'sent') {
        await markBulkEmailAuditSent(auditLog, delivery, auditBase?.template);
      } else if (rawDeliveryStatus === 'skipped') {
        await markBulkEmailAuditSkipped(
          auditLog,
          delivery?.reason || 'provider_skipped',
          auditBase?.template,
          auditMetadata
        );
      } else if (rawDeliveryStatus === 'failed') {
        await markBulkEmailAuditFailed(
          auditLog,
          delivery?.error || delivery?.reason || 'email_provider_failed',
          auditBase?.template,
          auditMetadata
        );
      }
    } catch (error) {
      console.error(`${metaLabel} email send error:`, error);
      await markBulkEmailAuditFailed(auditLog, error.message, auditBase?.template, auditMetadata);
      results.push({
        email: recipient.email,
        status: 'failed',
        reason: 'send_error',
        error: error.message
      });
    }
  }

  const sentCount = results.filter(item => item.status === 'sent').length;
  const skippedCount = results.filter(item => item.status === 'skipped').length;
  const failedCount = results.filter(item => item.status === 'failed').length;

  console.log(`${metaLabel}: sent=${sentCount} skipped=${skippedCount} failed=${failedCount}`);

  return {
    sentCount,
    skippedCount,
    failedCount,
    deliveryBatchId: auditBase?.deliveryBatchId || null,
    deliveries: results
  };
}

function buildEventBaseCopy(context) {
  const event = context.event;
  const appBaseUrl = normalizeAppBaseUrl(process.env.APP_BASE_URL || '');
  const goingCount = context.registrations.filter(item => item.registration_status === 'going').length;
  const paymentSummary = buildEventPaymentSummary(event, {
    goingCount,
    drawStatus: event.draw_status
  });
  const fieldLabel = [event.field_size, event.field_quality, event.surface_type]
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .join(' · ');

  return {
    teamName: context.event.team_name || 'Foci Szervező',
    eventTitle: event.title || 'esemeny',
    whenLabel: formatEventDateTime(event.start_at),
    locationLabel: event.location_address || event.location_name || '-',
    fieldLabel: fieldLabel || event.location_name || '-',
    moneyLabel:
      paymentSummary.final_amount_per_person != null
        ? formatMoney(paymentSummary.final_amount_per_person)
        : paymentSummary.pricing_mode === 'split_total_cost'
          ? 'A vegso osszeg a jelentkezok szama alapjan szamolodik.'
          : paymentSummary.pricing_mode === 'free'
            ? 'Ingyenes'
            : '-',
    paymentNotes: String(event.payment_notes || '').trim() || '',
    loginUrl: buildEventAppUrl({}, appBaseUrl),
    eventUrl: buildEventAppUrl(
      {
        teamId: event.team_id,
        eventId: event.id
      },
      appBaseUrl
    ),
    appBaseUrl
  };
}

function buildActionButtonsHtml(actions = []) {
  return actions.map(action => `
    <a href="${escapeHtml(action.href)}" style="display:inline-block;background:${escapeHtml(action.background)};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;margin-right:8px;margin-bottom:8px;">
      ${escapeHtml(action.label)}
    </a>
  `).join('');
}

function isTeamMemberOnBreak(member, referenceDate = new Date()) {
  if (!member?.break_until) return false;
  const breakUntil = new Date(member.break_until);
  const reference = new Date(referenceDate);
  if (Number.isNaN(breakUntil.getTime()) || Number.isNaN(reference.getTime())) return false;
  return breakUntil > reference;
}

function isTeamMemberPassive(member) {
  return Boolean(member?.passive_since);
}

function buildEventCreatedRecipient(member) {
  return {
    userId: String(member?.user_id || ''),
    name: member?.name || '',
    email: normalizeRecipientEmail(member?.email)
  };
}

function getEventCreatedSkipReason(member, referenceDate = new Date()) {
  if (isTeamMemberPassive(member)) return 'passive';
  if (isTeamMemberOnBreak(member, referenceDate)) return 'on_break';
  return null;
}

function buildSkippedAuditRecipient(member, reason) {
  const email = normalizeRecipientEmail(member?.email);
  return {
    userId: member?.user_id || null,
    name: member?.name || '',
    email: email || buildMissingEmailAuditAddress(member),
    reason,
    hasRealEmail: Boolean(email)
  };
}

function buildEventCreatedAudience(context, {
  forcedSkipReason = null,
  referenceDate = new Date()
} = {}) {
  const emailGroups = new Map();
  const recipients = [];
  const skipped = [];

  for (const member of context?.teamMembers || []) {
    const email = normalizeRecipientEmail(member?.email);

    if (!email) {
      skipped.push(buildSkippedAuditRecipient(member, 'missing_email'));
      continue;
    }

    if (!emailGroups.has(email)) {
      emailGroups.set(email, []);
    }
    emailGroups.get(email).push(member);
  }

  for (const members of emailGroups.values()) {
    if (forcedSkipReason) {
      skipped.push(buildSkippedAuditRecipient(members[0], forcedSkipReason));
      continue;
    }

    const sendableMember = members.find(member => !getEventCreatedSkipReason(member, referenceDate));
    if (sendableMember) {
      recipients.push(buildEventCreatedRecipient(sendableMember));
      continue;
    }

    const firstMember = members[0];
    skipped.push(buildSkippedAuditRecipient(
      firstMember,
      getEventCreatedSkipReason(firstMember, referenceDate) || 'no_recipients'
    ));
  }

  return {
    recipients,
    skipped
  };
}

function buildUnresponsiveTeamRecipients(context, { excludeUserIds = [] } = {}) {
  const excludedUserIds = new Set((excludeUserIds || []).filter(Boolean).map(item => String(item)));
  const registrationUserIds = new Set(
    (context?.registrations || [])
      .map(item => String(item.user_id))
  );
  const reactedUserIds = new Set(
    (context?.emailActions || [])
      .filter(item => [
        EVENT_EMAIL_ACTIONS.REGISTER,
        EVENT_EMAIL_ACTIONS.SKIP,
        EVENT_EMAIL_ACTIONS.VACATION_ONE_WEEK
      ].includes(item.action))
      .map(item => String(item.user_id))
  );

  const candidates = (context?.teamMembers || []).filter(member => {
    const userId = String(member?.user_id || '');
    if (!userId || excludedUserIds.has(userId)) return false;
    if (!normalizeRecipientEmail(member?.email)) return false;
    if (isTeamMemberOnBreak(member)) return false;
    if (isTeamMemberPassive(member)) return false;
    if (registrationUserIds.has(userId)) return false;
    if (reactedUserIds.has(userId)) return false;
    return true;
  });

  return uniqueRecipients(candidates);
}

function buildEventCreatedAuditBase(context) {
  return {
    teamId: context?.event?.team_id || null,
    eventId: context?.event?.id || null,
    deliveryBatchId: context?.deliveryBatchId || null,
    template: EVENT_CREATED_EMAIL_TEMPLATE
  };
}

function buildEventCreatedAuditMetadata(context, extraMetadata = {}) {
  return {
    flow: EVENT_CREATED_EMAIL_TEMPLATE,
    eventStatus: context?.event?.status || null,
    notifyTeamOnCreate: context?.notificationPreferences?.notifyTeamOnCreate === true,
    ...(context?.auditMetadata || {}),
    ...extraMetadata
  };
}

async function runEmailAuditSafely(action, label) {
  try {
    return await action();
  } catch (error) {
    console.error(`Email audit log ${label} hiba:`, error);
    return null;
  }
}

async function createEventCreatedSkippedLogs(context, skippedRecipients = [], extraMetadata = {}) {
  const deliveries = [];
  const base = buildEventCreatedAuditBase(context);

  for (const recipient of skippedRecipients) {
    await runEmailAuditSafely(
      () => emailAuditLogService.createSkippedEmailLog({
        ...base,
        recipientUserId: recipient.userId || null,
        recipientEmail: recipient.email,
        reason: recipient.reason,
        metadata: {
          ...buildEventCreatedAuditMetadata(context, {
            hasRealEmail: recipient.hasRealEmail === true,
            ...extraMetadata
          })
        }
      }),
      `skipped:${EVENT_CREATED_EMAIL_TEMPLATE}:${recipient.reason}`
    );

    deliveries.push({
      email: recipient.hasRealEmail ? recipient.email : null,
      status: 'skipped',
      reason: recipient.reason
    });
  }

  return deliveries;
}

async function sendEventCreatedEmailsWithAudit(context, recipients, preSkippedDeliveries = []) {
  const results = [...preSkippedDeliveries];
  const base = buildEventCreatedAuditBase(context);

  for (const recipient of recipients) {
    const auditLog = await runEmailAuditSafely(
      () => emailAuditLogService.createEmailLog({
        ...base,
        recipientUserId: recipient.userId || null,
        recipientEmail: recipient.email,
        status: 'pending',
        metadata: buildEventCreatedAuditMetadata(context)
      }),
      `pending:${EVENT_CREATED_EMAIL_TEMPLATE}`
    );

    try {
      const payload = buildEventCreatedEmail(context, recipient);

      if (!payload || !payload.subject) {
        if (auditLog?.id) {
          await runEmailAuditSafely(
            () => emailAuditLogService.markEmailLogSkipped({
              id: auditLog.id,
              reason: 'missing_payload',
              metadata: buildEventCreatedAuditMetadata(context)
            }),
            `missing_payload:${EVENT_CREATED_EMAIL_TEMPLATE}`
          );
        }

        results.push({
          email: recipient.email,
          status: 'skipped',
          reason: 'missing_payload'
        });
        continue;
      }

      const delivery = await sendEmail({
        to: recipient.email,
        subject: payload.subject,
        text: payload.text,
        html: payload.html
      });
      const rawDeliveryStatus = String(delivery?.status || 'sent');
      const deliveryStatus = ['sent', 'skipped', 'failed'].includes(rawDeliveryStatus)
        ? rawDeliveryStatus
        : 'failed';
      const normalizedDelivery = {
        ...(delivery || {}),
        status: deliveryStatus
      };

      if (deliveryStatus === 'sent') {
        if (auditLog?.id) {
          await runEmailAuditSafely(
            () => emailAuditLogService.markEmailLogSent({
              id: auditLog.id,
              providerMessageId: normalizedDelivery.messageId || null,
              metadata: {
                accepted: normalizedDelivery.accepted || [],
                rejected: normalizedDelivery.rejected || []
              }
            }),
            `sent:${EVENT_CREATED_EMAIL_TEMPLATE}`
          );
        }
      } else if (deliveryStatus === 'skipped') {
        if (auditLog?.id) {
          await runEmailAuditSafely(
            () => emailAuditLogService.markEmailLogSkipped({
              id: auditLog.id,
              reason: normalizedDelivery.reason || 'provider_skipped',
              metadata: buildEventCreatedAuditMetadata(context)
            }),
            `provider_skipped:${EVENT_CREATED_EMAIL_TEMPLATE}`
          );
        }
      } else if (auditLog?.id) {
        await runEmailAuditSafely(
          () => emailAuditLogService.markEmailLogFailed({
            id: auditLog.id,
            errorMessage: normalizedDelivery.error || normalizedDelivery.reason || 'email_provider_failed',
            metadata: buildEventCreatedAuditMetadata(context)
          }),
          `provider_failed:${EVENT_CREATED_EMAIL_TEMPLATE}`
        );
      }

      results.push({
        email: recipient.email,
        ...normalizedDelivery
      });
    } catch (error) {
      console.error(`event_created:${context?.event?.id || 'unknown'} email send error:`, error);
      if (auditLog?.id) {
        await runEmailAuditSafely(
          () => emailAuditLogService.markEmailLogFailed({
            id: auditLog.id,
            errorMessage: error.message,
            metadata: buildEventCreatedAuditMetadata(context)
          }),
          `failed:${EVENT_CREATED_EMAIL_TEMPLATE}`
        );
      }

      results.push({
        email: recipient.email,
        status: 'failed',
        reason: 'send_error',
        error: error.message
      });
    }
  }

  const sentCount = results.filter(item => item.status === 'sent').length;
  const skippedCount = results.filter(item => item.status === 'skipped').length;
  const failedCount = results.filter(item => item.status === 'failed').length;

  console.log(`event_created:${context?.event?.id || 'unknown'}: sent=${sentCount} skipped=${skippedCount} failed=${failedCount}`);

  return {
    sentCount,
    skippedCount,
    failedCount,
    deliveries: results
  };
}

function buildActiveRegistrationNames(context) {
  const seen = new Set();
  return (context?.registrations || [])
    .filter(item => ACTIVE_EVENT_REGISTRATION_STATUSES.includes(item.registration_status))
    .map(item => String(item?.name || '').trim())
    .filter(Boolean)
    .filter(name => {
      const normalized = name.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function getRecipientActiveRegistrationStatus(context, recipient) {
  if (!recipient?.userId) return null;
  const registration = (context?.registrations || []).find(item => (
    String(item?.user_id || '') === String(recipient.userId) &&
    ACTIVE_EVENT_REGISTRATION_STATUSES.includes(item.registration_status)
  ));
  return registration?.registration_status || null;
}

function buildEventCreatedEmail(context, recipient) {
  const copy = buildEventBaseCopy(context);
  const registerToken = buildEventEmailActionToken({
    eventId: context.event.id,
    userId: recipient.userId,
    action: EVENT_EMAIL_ACTIONS.REGISTER
  });
  const skipToken = buildEventEmailActionToken({
    eventId: context.event.id,
    userId: recipient.userId,
    action: EVENT_EMAIL_ACTIONS.SKIP
  });
  const vacationToken = buildEventEmailActionToken({
    eventId: context.event.id,
    userId: recipient.userId,
    action: EVENT_EMAIL_ACTIONS.VACATION_ONE_WEEK
  });
  const registerUrl = buildEventEmailActionUrl(registerToken, copy.appBaseUrl);
  const skipUrl = buildEventEmailActionUrl(skipToken, copy.appBaseUrl);
  const vacationUrl = buildEventEmailActionUrl(vacationToken, copy.appBaseUrl);
  const vacationExplanation = '1 hétig nem kapsz értesítéseket az eseményekről. Ha a csapatodban aktív a rangmodul, akkor nem veszítesz pozíciót.';
  const subject = `Uj esemeny: ${copy.eventTitle}`;
  const text = [
    'Szia!',
    '',
    `A(z) ${copy.teamName} csapat uj esemenyt hozott letre.`,
    `Esemeny: ${copy.eventTitle}`,
    `Mikor: ${copy.whenLabel}`,
    `Hol: ${copy.locationLabel}`,
    `Milyen palya: ${copy.fieldLabel}`,
    `Mennyi penz: ${copy.moneyLabel}`,
    copy.paymentNotes ? `Fizetesi info: ${copy.paymentNotes}` : '',
    '',
    `Belepes a feluletre: ${copy.loginUrl}`,
    `Esemeny megnyitasa: ${copy.eventUrl}`,
    `Jelentkezem: ${registerUrl}`,
    `Kihagyom: ${skipUrl}`,
    '',
    vacationExplanation,
    `Szabin vagyok (1 hét): ${vacationUrl}`
  ].filter(Boolean).join('\n');
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#1f2937;">
      <h2 style="margin-bottom:12px;">Uj esemeny erkezett</h2>
      <p>A(z) <strong>${escapeHtml(copy.teamName)}</strong> csapat uj esemenyt hozott letre.</p>
      <div style="background:#f8fafc;border:1px solid #dbeafe;border-radius:16px;padding:16px 18px;margin:16px 0;">
        <div style="font-size:22px;font-weight:800;margin-bottom:8px;">${escapeHtml(copy.eventTitle)}</div>
        <div><strong>Mikor:</strong> ${escapeHtml(copy.whenLabel)}</div>
        <div><strong>Hol:</strong> ${escapeHtml(copy.locationLabel)}</div>
        <div><strong>Milyen palya:</strong> ${escapeHtml(copy.fieldLabel)}</div>
        <div><strong>Mennyi penz:</strong> ${escapeHtml(copy.moneyLabel)}</div>
        ${copy.paymentNotes ? `<div><strong>Fizetesi info:</strong> ${escapeHtml(copy.paymentNotes)}</div>` : ''}
      </div>
      <div style="margin:20px 0 12px;">
        ${buildActionButtonsHtml([
          { label: 'Jelentkezem', href: registerUrl, background: '#2563eb' },
          { label: 'Kihagyom', href: skipUrl, background: '#ef4444' }
        ])}
      </div>
      <div style="margin:8px 0 20px;">
        ${buildActionButtonsHtml([
          { label: 'Belepes a feluletre', href: copy.loginUrl, background: '#0f766e' },
          { label: 'Esemeny megnyitasa', href: copy.eventUrl, background: '#475569' }
        ])}
      </div>
      <div style="margin:24px 0 0;padding:14px 16px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:14px;">
        <p style="margin:0 0 10px;font-size:13px;color:#475569;">${escapeHtml(vacationExplanation)}</p>
        ${buildActionButtonsHtml([
          { label: 'Szabin vagyok (1 hét)', href: vacationUrl, background: '#64748b' }
        ])}
      </div>
    </div>
  `;
  return { subject, text, html };
}

function buildNewRegistrationEmail(context, registrationUserName, registrationStatus) {
  const copy = buildEventBaseCopy(context);
  const activeRegistrationNames = buildActiveRegistrationNames(context);
  const activeRegistrationNamesLabel = activeRegistrationNames.length
    ? activeRegistrationNames.join(', ')
    : 'Még nincs más aktív jelentkező.';
  const statusLabel =
    registrationStatus === 'going' ? 'going' :
    registrationStatus === 'waiting_list' ? 'varolista' :
    'rangvarolista';
  const subject = `Uj jelentkezo: ${copy.eventTitle}`;
  const text = [
    'Szia!',
    '',
    `${registrationUserName} uj jelentkezest adott le a(z) ${copy.eventTitle} esemenyre.`,
    `Statusz: ${statusLabel}`,
    `Idopont: ${copy.whenLabel}`,
    `Helyszin: ${copy.locationLabel}`,
    `Mar jelentkeztek: ${activeRegistrationNamesLabel}`
  ].join('\n');
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1f2937;">
      <h2>Uj jelentkezo</h2>
      <p><strong>${escapeHtml(registrationUserName)}</strong> uj jelentkezest adott le a(z) <strong>${escapeHtml(copy.eventTitle)}</strong> esemenyre.</p>
      <p><strong>Statusz:</strong> ${escapeHtml(statusLabel)}<br /><strong>Idopont:</strong> ${escapeHtml(copy.whenLabel)}<br /><strong>Helyszin:</strong> ${escapeHtml(copy.locationLabel)}</p>
      <p><strong>Mar jelentkeztek:</strong> ${escapeHtml(activeRegistrationNamesLabel)}</p>
    </div>
  `;
  return { subject, text, html };
}

function buildCapacityEmail(context, type, spotsLeft, recipient = null) {
  const copy = buildEventBaseCopy(context);
  const recipientRegistrationStatus = getRecipientActiveRegistrationStatus(context, recipient);
  const waitlistEncouragement = 'Az esemény most betelt, de ne maradj le! Jelentkezz várólistára, és ha felszabadul egy hely, elsők között értesítünk — így még simán pályára léphetsz.';
  const waitlistActionUrl = type === 'full' && recipient?.userId && !recipientRegistrationStatus
    ? buildEventEmailActionUrl(
        buildEventEmailActionToken({
          eventId: context.event.id,
          userId: recipient.userId,
          action: EVENT_EMAIL_ACTIONS.REGISTER
        }),
        copy.appBaseUrl
      )
    : '';
  const subject = type === 'two_spots_left'
    ? `Mar csak 2 hely maradt: ${copy.eventTitle}`
    : `Betelt az esemeny: ${copy.eventTitle}`;
  const summary = type === 'two_spots_left'
    ? `A(z) ${copy.eventTitle} esemenyen mar csak ${spotsLeft} hely maradt.`
    : `A(z) ${copy.eventTitle} esemeny betelt.`;
  const text = [
    'Szia!',
    '',
    summary,
    type === 'full' ? waitlistEncouragement : '',
    `Idopont: ${copy.whenLabel}`,
    `Helyszin: ${copy.locationLabel}`,
    waitlistActionUrl ? `Varolistara jelentkezem: ${waitlistActionUrl}` : ''
  ].filter(Boolean).join('\n');
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1f2937;">
      <h2>${escapeHtml(type === 'two_spots_left' ? 'Mar csak 2 hely maradt' : 'Betelt az esemeny')}</h2>
      <p>${escapeHtml(summary)}</p>
      ${type === 'full' ? `<p>${escapeHtml(waitlistEncouragement)}</p>` : ''}
      <p><strong>Idopont:</strong> ${escapeHtml(copy.whenLabel)}<br /><strong>Helyszin:</strong> ${escapeHtml(copy.locationLabel)}</p>
      ${waitlistActionUrl ? `
        <div style="margin:20px 0 12px;">
          ${buildActionButtonsHtml([
            { label: 'Várólistára jelentkezem', href: waitlistActionUrl, background: '#f59e0b' }
          ])}
        </div>
      ` : ''}
    </div>
  `;
  return { subject, text, html };
}

function buildWaitlistPromotionEmail(context) {
  const copy = buildEventBaseCopy(context);
  const subject = `Bekerultel a varolistabol: ${copy.eventTitle}`;
  const text = [
    'Szia!',
    '',
    `Bekerultel a varolistabol a(z) ${copy.eventTitle} esemenyre.`,
    `Idopont: ${copy.whenLabel}`,
    `Helyszin: ${copy.locationLabel}`
  ].join('\n');
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1f2937;">
      <h2>Varolistarol bekerultel</h2>
      <p>Bekerultel a varolistabol a(z) <strong>${escapeHtml(copy.eventTitle)}</strong> esemenyre.</p>
      <p><strong>Idopont:</strong> ${escapeHtml(copy.whenLabel)}<br /><strong>Helyszin:</strong> ${escapeHtml(copy.locationLabel)}</p>
    </div>
  `;
  return { subject, text, html };
}

function buildDrawPublishedEmail(context, automated = false) {
  const copy = buildEventBaseCopy(context);
  const subject = `Csapatleosztas kesz: ${copy.eventTitle}`;
  const summary = automated
    ? 'A csapatleosztast a rendszer automatikusan kihirdette.'
    : 'A csapatleosztas elerheto.';
  const text = [
    'Szia!',
    '',
    summary,
    `Esemeny: ${copy.eventTitle}`,
    `Idopont: ${copy.whenLabel}`,
    `Helyszin: ${copy.locationLabel}`
  ].join('\n');
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1f2937;">
      <h2>Csapatleosztas kesz</h2>
      <p>${escapeHtml(summary)}</p>
      <p><strong>${escapeHtml(copy.eventTitle)}</strong><br />${escapeHtml(copy.whenLabel)}<br />${escapeHtml(copy.locationLabel)}</p>
    </div>
  `;
  return { subject, text, html };
}

function buildEventUpdatedEmail(context, previousEvent) {
  const copy = buildEventBaseCopy(context);
  const previousWhenLabel = formatEventDateTime(previousEvent.start_at);
  const previousLocation = previousEvent.location_address || previousEvent.location_name || '-';
  const subject = `Valtozott az esemeny: ${copy.eventTitle}`;
  const text = [
    'Szia!',
    '',
    `Valtozott a(z) ${copy.eventTitle} esemeny idopontja vagy helyszine.`,
    `Korabban: ${previousWhenLabel} | ${previousLocation}`,
    `Most: ${copy.whenLabel} | ${copy.locationLabel}`
  ].join('\n');
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1f2937;">
      <h2>Valtozott az esemeny</h2>
      <p>Valtozott a(z) <strong>${escapeHtml(copy.eventTitle)}</strong> esemeny idopontja vagy helyszine.</p>
      <p><strong>Korabban:</strong> ${escapeHtml(previousWhenLabel)} | ${escapeHtml(previousLocation)}<br /><strong>Most:</strong> ${escapeHtml(copy.whenLabel)} | ${escapeHtml(copy.locationLabel)}</p>
    </div>
  `;
  return { subject, text, html };
}

function buildEventCancelledEmail(context) {
  const copy = buildEventBaseCopy(context);
  const subject = `Elmarad az esemeny: ${copy.eventTitle}`;
  const text = [
    'Szia!',
    '',
    `A(z) ${copy.eventTitle} esemeny elmarad / torolve lett.`,
    `Eredeti idopont: ${copy.whenLabel}`,
    `Helyszin: ${copy.locationLabel}`
  ].join('\n');
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1f2937;">
      <h2>Az esemeny elmarad</h2>
      <p>A(z) <strong>${escapeHtml(copy.eventTitle)}</strong> esemeny elmarad vagy torolve lett.</p>
      <p><strong>Eredeti idopont:</strong> ${escapeHtml(copy.whenLabel)}<br /><strong>Helyszin:</strong> ${escapeHtml(copy.locationLabel)}</p>
    </div>
  `;
  return { subject, text, html };
}

async function notifyEventCreated({ eventId, actorUserId = null, auditMetadata = {} }) {
  const context = await getEventNotificationContext(eventId);
  if (!context) return null;
  context.deliveryBatchId = randomUUID();
  context.auditMetadata = auditMetadata && typeof auditMetadata === 'object' ? auditMetadata : {};

  if (context.event.status !== 'published') {
    const audience = buildEventCreatedAudience(context, { forcedSkipReason: 'event_not_published' });
    await createEventCreatedSkippedLogs(context, audience.skipped, {
      actorUserId,
      eventStatus: context.event.status || null
    });
    return null;
  }

  if (context.notificationPreferences.notifyTeamOnCreate !== true) {
    const audience = buildEventCreatedAudience(context, { forcedSkipReason: 'notification_disabled' });
    await createEventCreatedSkippedLogs(context, audience.skipped, { actorUserId });
    return null;
  }

  const audience = buildEventCreatedAudience(context);
  const skippedDeliveries = await createEventCreatedSkippedLogs(context, audience.skipped, { actorUserId });
  if (!audience.recipients.length) return null;

  return sendEventCreatedEmailsWithAudit(context, audience.recipients, skippedDeliveries);
}

function mergeEmailSummary(target, source, eventId) {
  if (!source) return;

  target.sentCount += Number(source.sentCount || 0);
  target.skippedCount += Number(source.skippedCount || 0);
  target.failedCount += Number(source.failedCount || 0);
  target.deliveries.push(
    ...(source.deliveries || []).map(delivery => ({
      eventId,
      ...delivery
    }))
  );
}

async function notifyNewMemberUpcomingEvents({
  teamId,
  userId,
  limit = DEFAULT_NEW_MEMBER_CATCHUP_EVENT_LIMIT
}) {
  if (!teamId || !userId) return null;

  const normalizedLimit = Math.max(
    1,
    Math.min(Number.parseInt(limit, 10) || DEFAULT_NEW_MEMBER_CATCHUP_EVENT_LIMIT, 20)
  );
  const summary = {
    sentCount: 0,
    skippedCount: 0,
    failedCount: 0,
    eventCount: 0,
    deliveries: []
  };

  const userResult = await pool.query(
    `
    select u.id as user_id, u.name, lower(u.email) as email
    from team_members tm
    join users u on u.id = tm.user_id
    where tm.team_id = $1
      and tm.user_id = $2
      and tm.membership_status = 'active'
      and u.status = 'active'
      and nullif(trim(u.email), '') is not null
    `,
    [teamId, userId]
  );
  const recipient = uniqueRecipients(userResult.rows)[0];

  if (!recipient) {
    summary.skippedCount += 1;
    summary.deliveries.push({
      eventId: null,
      email: null,
      status: 'skipped',
      reason: 'missing_recipient'
    });
    return summary;
  }

  const upcomingEventsResult = await pool.query(
    `
    select e.id
    from events e
    where e.team_id = $1
      and e.status = 'published'
      and e.start_at > now()
    order by e.start_at asc
    limit $2
    `,
    [teamId, normalizedLimit]
  );

  summary.eventCount = upcomingEventsResult.rows.length;

  for (const row of upcomingEventsResult.rows) {
    const context = await getEventNotificationContext(row.id);
    if (!context || context.notificationPreferences.notifyTeamOnCreate !== true) {
      summary.skippedCount += 1;
      summary.deliveries.push({
        eventId: row.id,
        email: recipient.email,
        status: 'skipped',
        reason: 'notification_disabled'
      });
      continue;
    }

    const alreadyRegistered = context.registrations.some(item => (
      String(item.user_id) === String(userId) &&
      ACTIVE_EVENT_REGISTRATION_STATUSES.includes(item.registration_status)
    ));
    if (alreadyRegistered) {
      summary.skippedCount += 1;
      summary.deliveries.push({
        eventId: row.id,
        email: recipient.email,
        status: 'skipped',
        reason: 'already_registered'
      });
      continue;
    }

    const delivery = await sendBulkEmails(
      [recipient],
      currentRecipient => buildEventCreatedEmail(context, currentRecipient),
      `new_member_event_catchup:${row.id}:${userId}`,
      {
        template: EMAIL_TEMPLATES.NEW_MEMBER_EVENT_CATCHUP,
        teamId,
        eventId: row.id,
        metadata: { catchupUserId: userId }
      }
    );
    mergeEmailSummary(summary, delivery, row.id);
  }

  return summary;
}

async function notifyRegistrationActivity({
  eventId,
  actorUserId = null,
  registrationStatus = 'going',
  promotedUserId = null,
  includeNewRegistrationNotification = true,
  includeCapacityNotifications = true
}) {
  const context = await getEventNotificationContext(eventId);
  if (!context) return null;

  const summary = { deliveries: [] };
  const activeRegistrations = context.registrations.filter(item => ACTIVE_EVENT_REGISTRATION_STATUSES.includes(item.registration_status));
  const teamRecipients = uniqueRecipients(context.teamMembers, { excludeUserIds: [actorUserId] });
  const unresponsiveRecipients = buildUnresponsiveTeamRecipients(context, { excludeUserIds: [actorUserId] });
  const registrant = context.teamMembers.find(item => String(item.user_id) === String(actorUserId))
    || context.registrations.find(item => String(item.user_id) === String(actorUserId));

  const spotsLeft = Math.max(Number(context.event.max_players || 0) - activeRegistrations.filter(item => item.registration_status === 'going').length, 0);

  if (
    includeNewRegistrationNotification === true &&
    context.notificationPreferences.notifyAllOnNewRegistration === true &&
    registrant &&
    teamRecipients.length
  ) {
    summary.newRegistration = await sendBulkEmails(
      teamRecipients,
      buildNewRegistrationEmail(context, registrant.name || 'Uj jelentkezo', registrationStatus),
      `registration_created:${eventId}`,
      {
        template: EMAIL_TEMPLATES.NEW_REGISTRATION,
        teamId: context.event.team_id,
        eventId,
        metadata: {
          actorUserId,
          registrationStatus
        }
      }
    );
  }

  if (
    includeCapacityNotifications === true &&
    context.notificationPreferences.notifyAllWhenTwoSpotsLeft === true &&
    spotsLeft === 2 &&
    unresponsiveRecipients.length
  ) {
    summary.twoSpotsLeft = await sendBulkEmails(
      unresponsiveRecipients,
      buildCapacityEmail(context, 'two_spots_left', spotsLeft),
      `capacity_two_left:${eventId}`,
      {
        template: EMAIL_TEMPLATES.CAPACITY_TWO_SPOTS_LEFT,
        teamId: context.event.team_id,
        eventId,
        metadata: { spotsLeft }
      }
    );
  }

  if (
    includeCapacityNotifications === true &&
    context.notificationPreferences.notifyAllWhenFull === true &&
    spotsLeft === 0 &&
    teamRecipients.length
  ) {
    summary.full = await sendBulkEmails(
      teamRecipients,
      recipient => buildCapacityEmail(context, 'full', spotsLeft, recipient),
      `capacity_full:${eventId}`,
      {
        template: EMAIL_TEMPLATES.CAPACITY_FULL,
        teamId: context.event.team_id,
        eventId,
        metadata: { spotsLeft }
      }
    );
  }

  if (context.notificationPreferences.notifyWaitlistPromotion === true && promotedUserId) {
    const promotedRecipient = uniqueRecipients(context.registrations.filter(item => String(item.user_id) === String(promotedUserId)));
    if (promotedRecipient.length) {
      summary.waitlistPromotion = await sendBulkEmails(
        promotedRecipient,
        buildWaitlistPromotionEmail(context),
        `waitlist_promotion:${eventId}`,
        {
          template: EMAIL_TEMPLATES.WAITLIST_PROMOTION,
          teamId: context.event.team_id,
          eventId,
          metadata: { promotedUserId }
        }
      );
    }
  }

  return summary;
}

async function notifyEventUpdated({ eventId, previousEvent, auditMetadata = {} }) {
  const context = await getEventNotificationContext(eventId);
  if (!context || !previousEvent) return null;
  if (context.notificationPreferences.notifyParticipantsOnEventUpdate !== true) return null;

  const changed =
    String(previousEvent.start_at || '') !== String(context.event.start_at || '') ||
    String(previousEvent.location_name || '') !== String(context.event.location_name || '') ||
    String(previousEvent.location_address || '') !== String(context.event.location_address || '');

  if (!changed) return null;

  const recipients = uniqueRecipients(
    context.registrations.filter(item => ACTIVE_EVENT_REGISTRATION_STATUSES.includes(item.registration_status))
  );
  if (!recipients.length) return null;
  return sendBulkEmails(
    recipients,
    buildEventUpdatedEmail(context, previousEvent),
    `event_updated:${eventId}`,
    {
      template: EMAIL_TEMPLATES.EVENT_UPDATED,
      teamId: context.event.team_id,
      eventId,
      metadata: {
        previousStartAt: previousEvent.start_at || null,
        previousLocationName: previousEvent.location_name || null,
        previousLocationAddress: previousEvent.location_address || null,
        ...(auditMetadata && typeof auditMetadata === 'object' ? auditMetadata : {})
      }
    }
  );
}

async function notifyEventCancelled({ eventId, auditMetadata = {} }) {
  const context = await getEventNotificationContext(eventId);
  if (!context) return null;
  if (context.notificationPreferences.notifyParticipantsOnEventCancel !== true) return null;
  const recipients = uniqueRecipients(
    context.registrations.filter(item => ALL_EVENT_NOTIFICATION_STATUSES.includes(item.registration_status))
  );
  if (!recipients.length) return null;
  return sendBulkEmails(
    recipients,
    buildEventCancelledEmail(context),
    `event_cancelled:${eventId}`,
    {
      template: EMAIL_TEMPLATES.EVENT_CANCELLED,
      teamId: context.event.team_id,
      eventId,
      metadata: auditMetadata && typeof auditMetadata === 'object' ? auditMetadata : {}
    }
  );
}

async function notifyTeamDrawPublished({ eventId, automated = false, auditMetadata = {} }) {
  const context = await getEventNotificationContext(eventId);
  if (!context) return null;
  if (context.notificationPreferences.notifyTeamDrawPublished !== true) return null;
  const recipients = uniqueRecipients(
    context.registrations.filter(item => ACTIVE_EVENT_REGISTRATION_STATUSES.includes(item.registration_status))
  );
  if (!recipients.length) return null;
  return sendBulkEmails(
    recipients,
    buildDrawPublishedEmail(context, automated),
    `draw_published:${eventId}`,
    {
      template: EMAIL_TEMPLATES.TEAM_DRAW_PUBLISHED,
      teamId: context.event.team_id,
      eventId,
      metadata: {
        automated: automated === true,
        ...(auditMetadata && typeof auditMetadata === 'object' ? auditMetadata : {})
      }
    }
  );
}

async function notifyWeatherAlert({ eventId, auditMetadata = {} }) {
  const context = await getEventNotificationContext(eventId);
  if (!context) return null;
  if (context.notificationPreferences.notifyWeatherAlerts !== true) return null;
  if (!hasPreciseWeatherAddress(context.event)) return null;

  const weather = await fetchEventWeatherForecast(context.event);
  const alert = buildWeatherAlert(weather);
  if (!alert) return null;

  const recipients = uniqueRecipients(
    context.registrations.filter(item => ACTIVE_EVENT_REGISTRATION_STATUSES.includes(item.registration_status))
  );
  if (!recipients.length) return null;

  const emailPayload = buildWeatherAlertEmail({
    event: context.event,
    teamName: context.event.team_name || 'Foci Szervező',
    weatherAlert: alert
  });
  return sendBulkEmails(
    recipients,
    emailPayload,
    `weather_alert:${eventId}`,
    {
      template: EMAIL_TEMPLATES.WEATHER_ALERT,
      teamId: context.event.team_id,
      eventId,
      metadata: {
        weatherSeverity: alert.severity || null,
        weatherTitle: alert.title || null,
        ...(auditMetadata && typeof auditMetadata === 'object' ? auditMetadata : {})
      }
    }
  );
}

module.exports = {
  getEventNotificationContext,
  notifyEventCreated,
  notifyNewMemberUpcomingEvents,
  notifyRegistrationActivity,
  notifyEventUpdated,
  notifyEventCancelled,
  notifyTeamDrawPublished,
  notifyWeatherAlert
};
