const { pool, withTransaction } = require('./dbService');
const { updateEventStatus } = require('./eventService');
const {
  saveEventTeamDraw,
  publishEventTeamDraw
} = require('./teamSkillService');
const {
  normalizeNotificationPreferences
} = require('../utils/notificationPreferences');

async function listDueAutoTeamDrawEvents({ now = new Date() } = {}) {
  const nowIso = now.toISOString();

  const result = await pool.query(
    `
    select
      e.id,
      e.team_id,
      e.title,
      e.start_at,
      e.min_players,
      e.status,
      es.notification_preferences,
      es.auto_prestart_processed_at,
      es.auto_prestart_outcome,
      (
        select count(*)
        from event_registrations er
        where er.event_id = e.id
          and er.registration_status = 'going'
      )::int as going_count
    from events e
    join event_settings es on es.event_id = e.id
    where e.status = 'published'
      and es.auto_prestart_processed_at is null
      and e.start_at > $1::timestamptz
      and e.start_at <= ($1::timestamptz + interval '1 hour')
    order by e.start_at asc
    `,
    [nowIso]
  );

  return result.rows.filter(event => {
    const prefs = normalizeNotificationPreferences(event.notification_preferences);
    return prefs.enableAutoTeamDrawOneHourBefore === true;
  });
}

async function markAutoPrestartProcessed({
  eventId,
  outcome,
  client = pool
}) {
  await client.query(
    `
    update event_settings
    set auto_prestart_processed_at = now(),
        auto_prestart_outcome = $2,
        updated_at = now()
    where event_id = $1
    `,
    [eventId, outcome]
  );
}

async function processSinglePrestartEvent(event) {
  if (Number(event.going_count) < Number(event.min_players)) {
    const cancelResult = await updateEventStatus({
      eventId: event.id,
      nextStatus: 'cancelled'
    });

    await markAutoPrestartProcessed({
      eventId: event.id,
      outcome: 'cancelled_low_attendance'
    });

    return {
      eventId: event.id,
      title: event.title,
      outcome: 'cancelled_low_attendance',
      message: 'Az esemény elmarad, mert nincs meg a minimum létszám.',
      event: cancelResult.event
    };
  }

  try {
    await saveEventTeamDraw({
      eventId: event.id,
      userId: null,
      draw: null
    });

    const publishResult = await publishEventTeamDraw({
      eventId: event.id
    });

    await markAutoPrestartProcessed({
      eventId: event.id,
      outcome: 'team_draw_published'
    });

    return {
      eventId: event.id,
      title: event.title,
      outcome: 'team_draw_published',
      message: 'A csapatok leosztásra kerültek!',
      draw: publishResult.draw
    };
  } catch (error) {
    await markAutoPrestartProcessed({
      eventId: event.id,
      outcome: 'team_draw_failed'
    });

    return {
      eventId: event.id,
      title: event.title,
      outcome: 'team_draw_failed',
      message: 'Az automatikus csapatleosztás nem sikerült.',
      error: error.message
    };
  }
}

async function processDueAutoTeamDrawEvents({ now = new Date() } = {}) {
  const dueEvents = await listDueAutoTeamDrawEvents({ now });
  const results = [];

  for (const event of dueEvents) {
    const result = await processSinglePrestartEvent(event);
    results.push(result);
  }

  return {
    processedCount: results.length,
    results
  };
}

module.exports = {
  listDueAutoTeamDrawEvents,
  processDueAutoTeamDrawEvents
};
