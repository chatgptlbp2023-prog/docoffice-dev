const pool = require('../config/db');
const { sendEmail } = require('./emailService');
const { getVersionInfo } = require('../utils/versionInfo');

const REGISTRATION_PATH_ROWS = Object.freeze([
  { path: 'tournament_organizer', label: 'tornaszervező' },
  { path: 'team_sport_organizer', label: 'haveri csapatszervező' },
  { path: 'activity_organizer', label: 'csoportos órák' },
  { path: 'invited_participant', label: 'tag' }
]);

const DEFAULT_RECIPIENT = 'erhardtpeter.bm@gmail.com';
const BUDAPEST_TIMEZONE = 'Europe/Budapest';

function getRegistrationNotificationRecipient() {
  return String(process.env.REGISTRATION_NOTIFY_EMAIL || DEFAULT_RECIPIENT).trim();
}

function formatBudapestTimestamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('hu-HU', {
    timeZone: BUDAPEST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

async function getRegistrationCounts() {
  const result = await pool.query(
    `
    select
      registration_path,
      count(*)::int as total_count,
      count(*) filter (
        where (created_at at time zone 'Europe/Budapest')::date = (now() at time zone 'Europe/Budapest')::date
      )::int as daily_count
    from users
    where registration_path = any($1::text[])
    group by registration_path
    `,
    [REGISTRATION_PATH_ROWS.map(item => item.path)]
  );

  const byPath = new Map(result.rows.map(row => [
    row.registration_path,
    {
      dailyCount: Number(row.daily_count || 0),
      totalCount: Number(row.total_count || 0)
    }
  ]));

  return REGISTRATION_PATH_ROWS.map(item => ({
    ...item,
    dailyCount: byPath.get(item.path)?.dailyCount || 0,
    totalCount: byPath.get(item.path)?.totalCount || 0
  }));
}

function buildRegistrationNotificationContent({ counts, platformName, timestampLabel }) {
  const lines = counts.map(item => `${item.label}: ${item.dailyCount}/${item.totalCount}`);
  const subject = `${timestampLabel} új regisztráció történt a ${platformName}`;
  const text = lines.join('\n');
  const html = `
    <div>
      ${lines.map(line => `<div>${line}</div>`).join('')}
    </div>
  `;

  return { subject, text, html };
}

async function persistRegistrationNotificationLog({
  createdUserId = null,
  createdUserEmail = null,
  createdUserRegistrationPath = null,
  recipientEmail,
  subject,
  platformName,
  counts,
  deliveryStatus,
  deliveryReason = null,
  deliveryError = null,
  deliveryMessageId = null
}) {
  try {
    await pool.query(
      `
      insert into registration_notification_log (
        created_user_id,
        created_user_email,
        created_user_registration_path,
        recipient_email,
        email_subject,
        platform_name,
        counts_snapshot,
        delivery_status,
        delivery_reason,
        delivery_error,
        delivery_message_id,
        attempted_at,
        created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, now(), now())
      `,
      [
        createdUserId,
        createdUserEmail,
        createdUserRegistrationPath,
        recipientEmail,
        subject,
        platformName,
        JSON.stringify(counts),
        deliveryStatus,
        deliveryReason,
        deliveryError,
        deliveryMessageId
      ]
    );
  } catch (error) {
    console.error('Regisztrációs értesítő DB-napló hiba:', error);
  }
}

function logRegistrationNotificationResult({
  recipientEmail,
  createdUserEmail,
  createdUserRegistrationPath,
  result
}) {
  const registrationPathLabel = createdUserRegistrationPath || 'ismeretlen';
  const userLabel = createdUserEmail || 'ismeretlen user';

  if (result.status === 'sent') {
    console.log(
      `Registration summary email: sent | to=${recipientEmail} | user=${userLabel} | path=${registrationPathLabel} | messageId=${result.messageId || '-'}`
    );
    return;
  }

  if (result.status === 'skipped') {
    console.log(
      `Registration summary email: skipped | to=${recipientEmail || '-'} | user=${userLabel} | path=${registrationPathLabel} | reason=${result.reason || 'unknown'}`
    );
    return;
  }

  console.error(
    `Registration summary email: failed | to=${recipientEmail || '-'} | user=${userLabel} | path=${registrationPathLabel} | reason=${result.reason || 'unknown'} | error=${result.error || '-'}`
  );
}

async function notifyRegistrationSummary({
  createdUserId = null,
  createdUserEmail = null,
  createdUserRegistrationPath = null
} = {}) {
  const recipientEmail = getRegistrationNotificationRecipient();
  const counts = await getRegistrationCounts();
  const platformName = getVersionInfo().name || 'Foci App';
  const timestampLabel = formatBudapestTimestamp();
  const { subject, text, html } = buildRegistrationNotificationContent({
    counts,
    platformName,
    timestampLabel
  });

  let result;

  if (!recipientEmail) {
    result = {
      status: 'skipped',
      reason: 'missing_recipient'
    };
  } else {
    try {
      result = await sendEmail({
        to: recipientEmail,
        subject,
        text,
        html
      });
    } catch (error) {
      result = {
        status: 'failed',
        reason: 'send_error',
        error: error.message
      };
    }
  }

  await persistRegistrationNotificationLog({
    createdUserId,
    createdUserEmail,
    createdUserRegistrationPath,
    recipientEmail,
    subject,
    platformName,
    counts,
    deliveryStatus: result.status,
    deliveryReason: result.reason || null,
    deliveryError: result.error || null,
    deliveryMessageId: result.messageId || null
  });

  logRegistrationNotificationResult({
    recipientEmail,
    createdUserEmail,
    createdUserRegistrationPath,
    result
  });

  return result;
}

module.exports = {
  REGISTRATION_PATH_ROWS,
  getRegistrationNotificationRecipient,
  formatBudapestTimestamp,
  getRegistrationCounts,
  buildRegistrationNotificationContent,
  notifyRegistrationSummary
};
