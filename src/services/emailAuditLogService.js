const { pool } = require('./dbService');

const EMAIL_DELIVERY_STATUSES = Object.freeze({
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  BOUNCED: 'bounced',
  COMPLAINED: 'complained',
  REJECTED: 'rejected',
  SKIPPED: 'skipped',
  FAILED: 'failed'
});

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return metadata;
}

function normalizeRequiredText(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${fieldName} megadasa kotelezo az email audit loghoz.`);
  }
  return normalized;
}

async function createEmailLog({
  teamId = null,
  eventId = null,
  deliveryBatchId = null,
  recipientUserId = null,
  recipientEmail,
  template,
  status = EMAIL_DELIVERY_STATUSES.PENDING,
  reason = null,
  providerMessageId = null,
  errorMessage = null,
  metadata = {}
}) {
  const result = await pool.query(
    `
    insert into email_delivery_logs (
      team_id,
      event_id,
      delivery_batch_id,
      recipient_user_id,
      recipient_email,
      template,
      status,
      reason,
      provider_message_id,
      error_message,
      metadata,
      created_at,
      updated_at
    )
    values (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11::jsonb,
      now(),
      now()
    )
    returning *
    `,
    [
      teamId,
      eventId,
      deliveryBatchId,
      recipientUserId,
      normalizeRequiredText(recipientEmail, 'recipientEmail'),
      normalizeRequiredText(template, 'template'),
      normalizeRequiredText(status, 'status'),
      reason,
      providerMessageId,
      errorMessage,
      JSON.stringify(normalizeMetadata(metadata))
    ]
  );

  return result.rows[0] || null;
}

async function updateEmailLogStatus({
  id,
  status,
  reason = null,
  providerMessageId = null,
  errorMessage = null,
  metadata = {}
}) {
  const result = await pool.query(
    `
    update email_delivery_logs
    set status = $2,
        reason = coalesce($3, reason),
        provider_message_id = coalesce($4, provider_message_id),
        error_message = coalesce($5, error_message),
        metadata = coalesce(metadata, '{}'::jsonb) || $6::jsonb,
        updated_at = now()
    where id = $1
    returning *
    `,
    [
      id,
      normalizeRequiredText(status, 'status'),
      reason,
      providerMessageId,
      errorMessage,
      JSON.stringify(normalizeMetadata(metadata))
    ]
  );

  return result.rows[0] || null;
}

async function markEmailLogSent({ id, providerMessageId = null, metadata = {} }) {
  return updateEmailLogStatus({
    id,
    status: EMAIL_DELIVERY_STATUSES.SENT,
    providerMessageId,
    metadata
  });
}

async function markEmailLogSkipped({ id, reason = null, metadata = {} }) {
  return updateEmailLogStatus({
    id,
    status: EMAIL_DELIVERY_STATUSES.SKIPPED,
    reason,
    metadata
  });
}

async function markEmailLogFailed({ id, errorMessage = null, metadata = {} }) {
  return updateEmailLogStatus({
    id,
    status: EMAIL_DELIVERY_STATUSES.FAILED,
    errorMessage,
    metadata
  });
}

async function createSkippedEmailLog(payload) {
  return createEmailLog({
    ...payload,
    status: EMAIL_DELIVERY_STATUSES.SKIPPED
  });
}

module.exports = {
  EMAIL_DELIVERY_STATUSES,
  createEmailLog,
  createSkippedEmailLog,
  markEmailLogSent,
  markEmailLogSkipped,
  markEmailLogFailed
};
