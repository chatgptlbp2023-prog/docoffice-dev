const crypto = require('crypto');
const AppError = require('../utils/appError');
const { pool } = require('./dbService');

const SUPPORTED_PROVIDERS = Object.freeze(['postmark', 'mailgun', 'sendgrid', 'ses']);
const INACTIVE_PROVIDERS = Object.freeze(['', 'smtp']);
const WEBHOOK_EVENT_TYPES = Object.freeze(['delivered', 'bounced', 'complained', 'rejected', 'failed']);

const STATUS_PRIORITY = Object.freeze({
  pending: 10,
  skipped: 15,
  sent: 20,
  delivered: 30,
  failed: 40,
  rejected: 45,
  bounced: 50,
  complained: 60
});

function normalizeText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeProvider(value) {
  return String(value || '').trim().toLowerCase();
}

function getHeader(headers = {}, name) {
  const target = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() === target) {
      return Array.isArray(value) ? value[0] : value;
    }
  }
  return undefined;
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getConfiguredEmailProvider(env = process.env) {
  return normalizeProvider(env.EMAIL_PROVIDER);
}

function getProviderWebhookSecret(provider, env = process.env) {
  const normalizedProvider = normalizeProvider(provider);
  const providerSpecific = {
    postmark: env.POSTMARK_WEBHOOK_SECRET,
    mailgun: env.MAILGUN_WEBHOOK_SIGNING_KEY || env.MAILGUN_WEBHOOK_SECRET,
    sendgrid: env.SENDGRID_WEBHOOK_SECRET,
    ses: env.SES_WEBHOOK_SECRET
  };

  return normalizeText(providerSpecific[normalizedProvider]) || normalizeText(env.EMAIL_WEBHOOK_SECRET);
}

function assertProviderCanReceiveWebhook(provider, env = process.env) {
  const normalizedProvider = normalizeProvider(provider);
  if (!SUPPORTED_PROVIDERS.includes(normalizedProvider)) {
    throw new AppError(400, 'Ismeretlen email provider webhook.');
  }

  const configuredProvider = getConfiguredEmailProvider(env);
  if (INACTIVE_PROVIDERS.includes(configuredProvider)) {
    throw new AppError(400, 'Az email provider webhook nincs aktiv konfiguracioban.');
  }

  if (configuredProvider !== normalizedProvider) {
    throw new AppError(400, 'Ez az email provider webhook most nincs bekapcsolva.');
  }

  return normalizedProvider;
}

function readGenericSecretHeader(headers = {}) {
  const bearer = normalizeText(getHeader(headers, 'authorization'));
  if (bearer && bearer.toLowerCase().startsWith('bearer ')) {
    return bearer.slice(7).trim();
  }

  return normalizeText(getHeader(headers, 'x-email-webhook-secret'));
}

function verifyGenericSecret(headers, secret) {
  const receivedSecret = readGenericSecretHeader(headers);
  return Boolean(receivedSecret && timingSafeEqualText(receivedSecret, secret));
}

function verifyMailgunSignature(payload, secret) {
  const signature = payload?.signature || {};
  const timestamp = normalizeText(signature.timestamp);
  const token = normalizeText(signature.token);
  const receivedSignature = normalizeText(signature.signature);
  if (!timestamp || !token || !receivedSignature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}${token}`)
    .digest('hex');

  return timingSafeEqualText(receivedSignature, expectedSignature);
}

function verifyProviderSignature(provider, payload, headers, env = process.env) {
  const secret = getProviderWebhookSecret(provider, env);
  if (!secret) {
    throw new AppError(400, 'Az email webhook secret nincs bekonfiguralva.');
  }

  if (provider === 'postmark') {
    const token = normalizeText(getHeader(headers, 'x-postmark-webhook-token')) || readGenericSecretHeader(headers);
    if (token && timingSafeEqualText(token, secret)) return true;
    throw new AppError(401, 'Hibas email webhook alairas vagy token.');
  }

  if (provider === 'mailgun') {
    if (verifyMailgunSignature(payload, secret) || verifyGenericSecret(headers, secret)) return true;
    throw new AppError(401, 'Hibas email webhook alairas vagy token.');
  }

  if (verifyGenericSecret(headers, secret)) return true;
  throw new AppError(401, 'Hibas email webhook alairas vagy token.');
}

function parseProviderDate(value) {
  if (value == null || value === '') return new Date();

  if (typeof value === 'number') {
    const millis = value > 100000000000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeEventType(value, provider = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['delivery', 'delivered', 'processed'].includes(normalized)) return 'delivered';
  if (['bounce', 'bounced', 'hardbounce', 'softbounce'].includes(normalized)) return 'bounced';
  if (['spamcomplaint', 'complaint', 'complained', 'spamreport', 'spam_report'].includes(normalized)) return 'complained';
  if (['rejected', 'dropped', 'reject'].includes(normalized)) return 'rejected';
  if (['failed', 'failure', 'error'].includes(normalized)) return 'failed';

  if (provider === 'mailgun' && normalized === 'failed') return 'failed';
  return null;
}

function normalizePostmarkEvent(payload) {
  const recordType = normalizeText(payload.RecordType || payload.recordType || payload.Type || payload.type);
  const eventType = normalizeEventType(recordType, 'postmark');
  if (!eventType) return null;

  return {
    providerMessageId: normalizeText(payload.MessageID || payload.MessageId || payload.messageId),
    providerEventId: normalizeText(payload.ID || payload.EventID || payload.EventId || payload.BounceID),
    eventType,
    recipientEmail: normalizeText(payload.Recipient || payload.Email || payload.email),
    occurredAt: parseProviderDate(
      payload.DeliveredAt ||
      payload.BouncedAt ||
      payload.ReceivedAt ||
      payload.CreatedAt ||
      payload.Date
    )
  };
}

function normalizeMailgunEvent(payload) {
  const eventData = payload['event-data'] || payload.eventData || payload;
  const messageHeaders = eventData?.message?.headers || {};
  const eventType = normalizeEventType(eventData?.event, 'mailgun');
  if (!eventType) return null;

  return {
    providerMessageId: normalizeText(
      eventData?.message?.headers?.['message-id'] ||
      messageHeaders['Message-Id'] ||
      eventData?.message?.id ||
      eventData?.['message-id']
    ),
    providerEventId: normalizeText(eventData?.id),
    eventType,
    recipientEmail: normalizeText(eventData?.recipient),
    occurredAt: parseProviderDate(eventData?.timestamp)
  };
}

function normalizeSendgridEvent(payload) {
  const eventType = normalizeEventType(payload.event, 'sendgrid');
  if (!eventType) return null;

  return {
    providerMessageId: normalizeText(payload.sg_message_id || payload.smtp_id || payload.message_id),
    providerEventId: normalizeText(payload.sg_event_id),
    eventType,
    recipientEmail: normalizeText(payload.email),
    occurredAt: parseProviderDate(payload.timestamp)
  };
}

function normalizeSesEvent(payload) {
  const message = typeof payload.Message === 'string'
    ? JSON.parse(payload.Message)
    : payload.Message || payload;
  const notificationType = normalizeText(message.notificationType || message.eventType || payload.Type);
  const eventType = normalizeEventType(notificationType, 'ses');
  if (!eventType) return null;

  const recipientEmail = message.mail?.destination?.[0]
    || message.bounce?.bouncedRecipients?.[0]?.emailAddress
    || message.complaint?.complainedRecipients?.[0]?.emailAddress;

  return {
    providerMessageId: normalizeText(message.mail?.messageId || message.mail?.commonHeaders?.messageId),
    providerEventId: normalizeText(message.mail?.messageId || payload.MessageId),
    eventType,
    recipientEmail: normalizeText(recipientEmail),
    occurredAt: parseProviderDate(
      message.delivery?.timestamp ||
      message.bounce?.timestamp ||
      message.complaint?.timestamp ||
      message.mail?.timestamp
    )
  };
}

function normalizeProviderEvent(provider, payload, headers = {}) {
  const normalizedProvider = normalizeProvider(provider);
  let normalized = null;

  try {
    if (normalizedProvider === 'postmark') normalized = normalizePostmarkEvent(payload || {});
    if (normalizedProvider === 'mailgun') normalized = normalizeMailgunEvent(payload || {});
    if (normalizedProvider === 'sendgrid') normalized = normalizeSendgridEvent(payload || {});
    if (normalizedProvider === 'ses') normalized = normalizeSesEvent(payload || {});
  } catch (error) {
    console.warn('Email provider webhook payload normalizalasi hiba:', {
      provider: normalizedProvider,
      error: error.message
    });
    return null;
  }

  if (!normalized) return null;

  return {
    provider: normalizedProvider,
    providerMessageId: normalized.providerMessageId,
    providerEventId: normalized.providerEventId || `${normalizedProvider}:${normalized.providerMessageId}:${normalized.eventType}:${normalized.occurredAt.toISOString()}`,
    eventType: normalized.eventType,
    recipientEmail: normalized.recipientEmail,
    occurredAt: normalized.occurredAt,
    rawPayload: payload,
    headers: {
      userAgent: normalizeText(getHeader(headers, 'user-agent'))
    }
  };
}

function getProviderPayloadItems(provider, payload) {
  if (normalizeProvider(provider) === 'sendgrid' && Array.isArray(payload)) return payload;
  return [payload];
}

function shouldApplyStatus(currentStatus, nextStatus) {
  const currentPriority = STATUS_PRIORITY[currentStatus] || 0;
  const nextPriority = STATUS_PRIORITY[nextStatus] || 0;
  return nextPriority >= currentPriority;
}

function getTimestampColumn(eventType) {
  if (eventType === 'delivered') return 'delivered_at';
  if (eventType === 'bounced') return 'bounced_at';
  if (eventType === 'complained') return 'complained_at';
  return null;
}

async function applyNormalizedProviderEvent(event) {
  if (!event?.providerMessageId) {
    return {
      status: 'ignored',
      reason: 'missing_provider_message_id',
      eventType: event?.eventType || null
    };
  }

  if (!WEBHOOK_EVENT_TYPES.includes(event.eventType)) {
    return {
      status: 'ignored',
      reason: 'unsupported_event_type',
      providerMessageId: event.providerMessageId
    };
  }

  const currentResult = await pool.query(
    `
    select id, status, provider_event_id, provider_event_type
    from email_delivery_logs
    where provider_message_id = $1
    order by created_at desc
    limit 1
    `,
    [event.providerMessageId]
  );

  const currentLog = currentResult.rows[0] || null;
  if (!currentLog) {
    console.warn('Email provider webhook: no matching email_delivery_logs row', {
      provider: event.provider,
      providerMessageId: event.providerMessageId,
      eventType: event.eventType
    });
    return {
      status: 'missing_log',
      providerMessageId: event.providerMessageId,
      eventType: event.eventType
    };
  }

  const nextStatus = event.eventType;
  const canApplyStatus = shouldApplyStatus(currentLog.status, nextStatus);
  const timestampColumn = getTimestampColumn(event.eventType);
  const occurredAtIso = event.occurredAt.toISOString();
  const timestampUpdate = timestampColumn
    ? `, ${timestampColumn} = coalesce(${timestampColumn}, $8::timestamptz)`
    : '';

  const updateResult = await pool.query(
    `
    update email_delivery_logs
    set status = case when $2::boolean then $3 else status end,
        provider_event_id = $4,
        provider_event_type = $5,
        provider_payload = $6::jsonb,
        metadata = coalesce(metadata, '{}'::jsonb) || $7::jsonb,
        updated_at = now()
        ${timestampUpdate}
    where id = $1
    returning *
    `,
    [
      currentLog.id,
      canApplyStatus,
      nextStatus,
      event.providerEventId,
      event.eventType,
      JSON.stringify(event.rawPayload || {}),
      JSON.stringify({
        provider: event.provider,
        providerEventId: event.providerEventId,
        providerEventType: event.eventType,
        providerRecipientEmail: event.recipientEmail,
        providerOccurredAt: occurredAtIso,
        providerStatusApplied: canApplyStatus
      }),
      occurredAtIso
    ]
  );

  const updatedLog = updateResult.rows[0] || null;
  return {
    status: currentLog.provider_event_id === event.providerEventId ? 'already_processed' : 'updated',
    providerMessageId: event.providerMessageId,
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    emailLogId: currentLog.id,
    appliedStatus: canApplyStatus,
    emailStatus: updatedLog?.status || currentLog.status
  };
}

async function processProviderEvent({ provider, payload, headers = {}, env = process.env }) {
  const normalizedProvider = assertProviderCanReceiveWebhook(provider, env);
  verifyProviderSignature(normalizedProvider, payload, headers, env);

  const results = [];
  for (const item of getProviderPayloadItems(normalizedProvider, payload)) {
    const normalizedEvent = normalizeProviderEvent(normalizedProvider, item, headers);
    if (!normalizedEvent) {
      results.push({
        status: 'ignored',
        reason: 'unsupported_event_type'
      });
      continue;
    }
    results.push(await applyNormalizedProviderEvent(normalizedEvent));
  }

  return {
    provider: normalizedProvider,
    processedCount: results.length,
    updatedCount: results.filter(result => ['updated', 'already_processed'].includes(result.status)).length,
    missingCount: results.filter(result => result.status === 'missing_log').length,
    ignoredCount: results.filter(result => result.status === 'ignored').length,
    results
  };
}

module.exports = {
  normalizeProviderEvent,
  processProviderEvent,
  applyNormalizedProviderEvent
};
