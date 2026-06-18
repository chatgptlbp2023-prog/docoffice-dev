const { pool } = require('./dbService');
const eventNotificationService = require('./eventNotificationService');
const {
  normalizeNotificationPreferences
} = require('../utils/notificationPreferences');

const EVENT_CREATED_NOTIFICATION_TYPE = 'event_created';
const SCHEDULE_STATUS = Object.freeze({
  PENDING: 'pending',
  SENT: 'sent',
  SKIPPED: 'skipped',
  FAILED: 'failed'
});

const HOUR_MS = 60 * 60 * 1000;
const WEEKLY_EVENT_CREATED_NOTICE_HOURS_BEFORE = 163;
const DEFAULT_EVENT_CREATED_NOTICE_HOURS_BEFORE = 168;

function normalizeDate(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function normalizeGeneratedEvent(item) {
  return item?.event || item || null;
}

function calculateEventCreatedScheduledAt({
  event,
  recurrenceType,
  now = new Date()
}) {
  const startAt = normalizeDate(event?.start_at || event?.startAt, now);
  const hoursBefore = recurrenceType === 'weekly'
    ? WEEKLY_EVENT_CREATED_NOTICE_HOURS_BEFORE
    : DEFAULT_EVENT_CREATED_NOTICE_HOURS_BEFORE;
  const planned = new Date(startAt.getTime() - hoursBefore * HOUR_MS);
  const nowDate = normalizeDate(now);

  return planned.getTime() < nowDate.getTime() ? nowDate : planned;
}

async function scheduleEventCreatedNotificationsForSeries({
  generatedEvents = [],
  recurrenceType,
  now = new Date()
} = {}) {
  const publishedEvents = generatedEvents
    .map(normalizeGeneratedEvent)
    .filter(event => event?.id && event.status === 'published')
    .sort((left, right) => {
      const leftStart = normalizeDate(left.start_at || left.startAt).getTime();
      const rightStart = normalizeDate(right.start_at || right.startAt).getTime();
      return leftStart - rightStart;
    });

  if (publishedEvents.length <= 1) {
    return {
      scheduledCount: 0,
      skippedFirstEventId: publishedEvents[0]?.id || null,
      schedules: []
    };
  }

  const schedules = [];
  const eventsToSchedule = publishedEvents.slice(1);

  for (const event of eventsToSchedule) {
    const scheduledAt = calculateEventCreatedScheduledAt({
      event,
      recurrenceType,
      now
    });

    const insertResult = await pool.query(
      `
      insert into event_notification_schedules (
        event_id,
        notification_type,
        scheduled_at,
        status,
        created_at,
        updated_at
      )
      values ($1, $2, $3, 'pending', now(), now())
      on conflict (event_id, notification_type) do nothing
      returning *
      `,
      [event.id, EVENT_CREATED_NOTIFICATION_TYPE, scheduledAt.toISOString()]
    );

    if (insertResult.rows[0]) {
      schedules.push(insertResult.rows[0]);
    }
  }

  return {
    scheduledCount: schedules.length,
    skippedFirstEventId: publishedEvents[0].id,
    schedules
  };
}

async function listDueEventCreatedNotificationSchedules({
  now = new Date(),
  limit = 50
} = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 50, 200));
  const result = await pool.query(
    `
    select
      ens.*,
      e.team_id,
      e.created_by_user_id,
      e.title,
      e.status as event_status,
      e.start_at,
      es.notification_preferences
    from event_notification_schedules ens
    join events e on e.id = ens.event_id
    left join event_settings es on es.event_id = e.id
    where ens.notification_type = $1
      and ens.status = 'pending'
      and ens.scheduled_at <= $2::timestamptz
    order by ens.scheduled_at asc, ens.created_at asc
    limit $3
    `,
    [EVENT_CREATED_NOTIFICATION_TYPE, normalizeDate(now).toISOString(), normalizedLimit]
  );

  return result.rows;
}

async function withScheduleLock(scheduleId, work) {
  const client = await pool.connect();
  let locked = false;

  try {
    const lockKey = `event_notification_schedule:${scheduleId}`;
    const lockResult = await client.query(
      'select pg_try_advisory_lock(hashtext($1::text)) as locked',
      [lockKey]
    );
    locked = lockResult.rows[0]?.locked === true;

    if (!locked) {
      return {
        scheduleId,
        eventId: null,
        outcome: 'skipped_locked',
        message: 'Ezt az utemezett ertesitest egy masik worker mar feldolgozza.'
      };
    }

    return work(client);
  } finally {
    if (locked) {
      try {
        await client.query(
          'select pg_advisory_unlock(hashtext($1::text))',
          [`event_notification_schedule:${scheduleId}`]
        );
      } catch (error) {
        console.error('Event notification schedule advisory lock release hiba:', error);
      }
    }

    client.release();
  }
}

async function markSchedule({
  scheduleId,
  status,
  lastError = null,
  sentAt = null,
  incrementAttempt = false,
  client = pool
}) {
  const result = await client.query(
    `
    update event_notification_schedules
    set status = $2,
        sent_at = case when $3::timestamptz is not null then $3::timestamptz else sent_at end,
        attempt_count = attempt_count + case when $4::boolean then 1 else 0 end,
        last_error = $5,
        updated_at = now()
    where id = $1
    returning *
    `,
    [scheduleId, status, sentAt ? normalizeDate(sentAt).toISOString() : null, incrementAttempt, lastError]
  );

  return result.rows[0] || null;
}

async function getPendingScheduleForProcessing({ scheduleId, now, client = pool }) {
  const result = await client.query(
    `
    select
      ens.*,
      e.team_id,
      e.created_by_user_id,
      e.title,
      e.status as event_status,
      e.start_at,
      es.notification_preferences
    from event_notification_schedules ens
    join events e on e.id = ens.event_id
    left join event_settings es on es.event_id = e.id
    where ens.id = $1
      and ens.notification_type = $2
      and ens.status = 'pending'
      and ens.scheduled_at <= $3::timestamptz
    limit 1
    `,
    [scheduleId, EVENT_CREATED_NOTIFICATION_TYPE, normalizeDate(now).toISOString()]
  );

  return result.rows[0] || null;
}

async function processSingleEventCreatedNotificationSchedule(schedule, { now = new Date() } = {}) {
  return withScheduleLock(schedule.id, async client => {
    const current = await getPendingScheduleForProcessing({
      scheduleId: schedule.id,
      now,
      client
    });

    if (!current) {
      return {
        scheduleId: schedule.id,
        eventId: schedule.event_id || null,
        outcome: 'skipped_not_due_or_processed',
        message: 'Az utemezett ertesites mar nem pending vagy meg nem esedekes.'
      };
    }

    if (current.event_status !== 'published') {
      await markSchedule({
        scheduleId: current.id,
        status: SCHEDULE_STATUS.SKIPPED,
        lastError: `event_status:${current.event_status || 'unknown'}`,
        client
      });

      return {
        scheduleId: current.id,
        eventId: current.event_id,
        outcome: 'skipped_event_not_published',
        message: 'Az esemeny mar nem published, ezert nem kuldunk uj esemeny emailt.'
      };
    }

    const prefs = normalizeNotificationPreferences(current.notification_preferences);
    if (prefs.notifyTeamOnCreate !== true) {
      await markSchedule({
        scheduleId: current.id,
        status: SCHEDULE_STATUS.SKIPPED,
        lastError: 'notification_disabled',
        client
      });

      return {
        scheduleId: current.id,
        eventId: current.event_id,
        outcome: 'skipped_notification_disabled',
        message: 'Az uj esemeny ertesites ki van kapcsolva.'
      };
    }

    try {
      const notificationResult = await eventNotificationService.notifyEventCreated({
        eventId: current.event_id,
        actorUserId: current.created_by_user_id || null
      });

      if (!notificationResult) {
        await markSchedule({
          scheduleId: current.id,
          status: SCHEDULE_STATUS.SKIPPED,
          lastError: 'no_recipients_or_not_sendable',
          client
        });

        return {
          scheduleId: current.id,
          eventId: current.event_id,
          outcome: 'skipped_no_recipients',
          message: 'Nem volt kuldheto cimzett az uj esemeny emailhez.'
        };
      }

      const sentCount = Number(notificationResult.sentCount || 0);
      const failedCount = Number(notificationResult.failedCount || 0);

      if (sentCount === 0 && failedCount > 0) {
        await markSchedule({
          scheduleId: current.id,
          status: SCHEDULE_STATUS.FAILED,
          lastError: 'all_email_deliveries_failed',
          incrementAttempt: true,
          client
        });

        return {
          scheduleId: current.id,
          eventId: current.event_id,
          outcome: 'failed',
          message: 'Az uj esemeny email kikuldese nem sikerult.',
          notificationResult
        };
      }

      await markSchedule({
        scheduleId: current.id,
        status: SCHEDULE_STATUS.SENT,
        sentAt: now,
        lastError: failedCount > 0 ? 'partial_email_delivery_failure' : null,
        incrementAttempt: failedCount > 0,
        client
      });

      return {
        scheduleId: current.id,
        eventId: current.event_id,
        outcome: 'sent',
        message: 'Uj esemeny email utemezes feldolgozva.',
        notificationResult
      };
    } catch (error) {
      await markSchedule({
        scheduleId: current.id,
        status: SCHEDULE_STATUS.FAILED,
        lastError: error.message,
        incrementAttempt: true,
        client
      });

      return {
        scheduleId: current.id,
        eventId: current.event_id,
        outcome: 'failed',
        message: 'Az utemezett uj esemeny email feldolgozasa hibat dobott.',
        error: error.message
      };
    }
  });
}

async function processDueEventCreatedNotifications({
  now = new Date(),
  limit = 50
} = {}) {
  const dueSchedules = await listDueEventCreatedNotificationSchedules({ now, limit });
  const results = [];

  for (const schedule of dueSchedules) {
    const result = await processSingleEventCreatedNotificationSchedule(schedule, { now });
    results.push(result);
  }

  return {
    checkedAt: normalizeDate(now).toISOString(),
    dueCount: dueSchedules.length,
    sentCount: results.filter(result => result.outcome === 'sent').length,
    skippedCount: results.filter(result => String(result.outcome || '').startsWith('skipped')).length,
    failedCount: results.filter(result => result.outcome === 'failed').length,
    results
  };
}

module.exports = {
  EVENT_CREATED_NOTIFICATION_TYPE,
  SCHEDULE_STATUS,
  calculateEventCreatedScheduledAt,
  scheduleEventCreatedNotificationsForSeries,
  listDueEventCreatedNotificationSchedules,
  processDueEventCreatedNotifications
};

