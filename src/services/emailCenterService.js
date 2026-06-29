const AppError = require('../utils/appError');
const { pool } = require('./dbService');

const DEFAULT_LOG_LIMIT = 25;
const MAX_LOG_LIMIT = 100;

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LOG_LIMIT;
  }
  return Math.min(parsed, MAX_LOG_LIMIT);
}

function normalizeOptionalText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function buildLogGroupExpression(alias = 'edl') {
  return `
    coalesce(
      ${alias}.delivery_batch_id::text,
      md5(
        coalesce(${alias}.template, '') || ':' ||
        coalesce(${alias}.event_id::text, '') || ':' ||
        to_char(date_trunc('minute', ${alias}.created_at), 'YYYY-MM-DD HH24:MI')
      )
    )
  `;
}

async function listEmailCenterSchedules({ teamId }) {
  const result = await pool.query(
    `
    select
      ens.id,
      ens.event_id,
      ens.notification_type as template,
      ens.scheduled_at,
      ens.sent_at,
      ens.status,
      ens.attempt_count,
      ens.last_error,
      ens.created_at,
      ens.updated_at,
      e.title as event_title,
      e.start_at as event_start_at,
      (
        select count(distinct lower(u.email))::int
        from team_members tm
        join users u on u.id = tm.user_id
        where tm.team_id = e.team_id
          and tm.membership_status = 'active'
          and nullif(trim(u.email), '') is not null
          and tm.passive_since is null
          and (
            tm.break_until is null
            or tm.break_until <= now()
          )
      ) as expected_recipient_count
    from event_notification_schedules ens
    join events e on e.id = ens.event_id
    where e.team_id = $1
      and ens.status = 'pending'
    order by ens.scheduled_at asc, ens.created_at asc
    `,
    [teamId]
  );

  return {
    schedules: result.rows.map(row => ({
      ...row,
      expected_recipient_count: Number(row.expected_recipient_count || 0),
      attempt_count: Number(row.attempt_count || 0)
    }))
  };
}

async function listEmailCenterLogs({
  teamId,
  limit,
  template = null,
  eventId = null,
  status = null
}) {
  const params = [teamId];
  const where = ['edl.team_id = $1'];
  const normalizedTemplate = normalizeOptionalText(template);
  const normalizedEventId = normalizeOptionalText(eventId);
  const normalizedStatus = normalizeOptionalText(status);

  if (normalizedTemplate) {
    params.push(normalizedTemplate);
    where.push(`edl.template = $${params.length}`);
  }

  if (normalizedEventId) {
    params.push(normalizedEventId);
    where.push(`edl.event_id = $${params.length}::uuid`);
  }

  if (normalizedStatus) {
    params.push(normalizedStatus);
    where.push(`edl.status = $${params.length}`);
  }

  params.push(parseLimit(limit));
  const limitPlaceholder = `$${params.length}`;
  const groupExpression = buildLogGroupExpression('filtered');

  const result = await pool.query(
    `
    with filtered as (
      select
        edl.*,
        e.title as event_title,
        e.start_at as event_start_at
      from email_delivery_logs edl
      left join events e on e.id = edl.event_id
      where ${where.join(' and ')}
    ),
    grouped as (
      select
        ${groupExpression} as group_id,
        filtered.delivery_batch_id,
        filtered.template,
        filtered.event_id,
        max(filtered.event_title) as event_title,
        max(filtered.event_start_at) as event_start_at,
        min(filtered.created_at) as first_created_at,
        max(filtered.updated_at) as last_updated_at,
        count(*)::int as total_count,
        count(*) filter (where filtered.status = 'sent')::int as sent_count,
        count(*) filter (where filtered.status = 'skipped')::int as skipped_count,
        count(*) filter (where filtered.status = 'failed')::int as failed_count,
        count(*) filter (where filtered.status = 'pending')::int as pending_count
      from filtered
      group by
        ${groupExpression},
        filtered.delivery_batch_id,
        filtered.template,
        filtered.event_id
    )
    select *
    from grouped
    order by last_updated_at desc, first_created_at desc
    limit ${limitPlaceholder}
    `,
    params
  );

  return {
    logs: result.rows.map(row => ({
      ...row,
      total_count: Number(row.total_count || 0),
      sent_count: Number(row.sent_count || 0),
      skipped_count: Number(row.skipped_count || 0),
      failed_count: Number(row.failed_count || 0),
      pending_count: Number(row.pending_count || 0)
    }))
  };
}

async function listEmailCenterLogRecipients({ teamId, groupId }) {
  const normalizedGroupId = normalizeOptionalText(groupId);
  if (!normalizedGroupId) {
    throw new AppError(400, 'Hianyzo email naplo csoport azonosito.');
  }

  const groupExpression = buildLogGroupExpression('edl');
  const result = await pool.query(
    `
    select
      edl.id,
      edl.delivery_batch_id,
      edl.team_id,
      edl.event_id,
      edl.recipient_user_id,
      edl.recipient_email,
      edl.template,
      edl.status,
      edl.reason,
      edl.provider_message_id,
      edl.error_message,
      edl.metadata,
      edl.created_at,
      edl.updated_at,
      u.name as recipient_name,
      e.title as event_title,
      e.start_at as event_start_at
    from email_delivery_logs edl
    left join users u on u.id = edl.recipient_user_id
    left join events e on e.id = edl.event_id
    where edl.team_id = $1
      and ${groupExpression} = $2
    order by
      case edl.status
        when 'failed' then 1
        when 'skipped' then 2
        when 'pending' then 3
        else 4
      end,
      edl.recipient_email asc,
      edl.created_at asc
    `,
    [teamId, normalizedGroupId]
  );

  if (!result.rows.length) {
    throw new AppError(404, 'Ez az email naplo csoport nem talalhato ennel a csapatnal.');
  }

  return {
    groupId: normalizedGroupId,
    recipients: result.rows
  };
}

module.exports = {
  listEmailCenterSchedules,
  listEmailCenterLogs,
  listEmailCenterLogRecipients
};
