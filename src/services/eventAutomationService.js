const { pool } = require('./dbService');
const { updateEventStatus } = require('./eventService');
const {
  saveEventTeamDraw,
  publishEventTeamDraw
} = require('./teamSkillService');
const {
  normalizeNotificationPreferences
} = require('../utils/notificationPreferences');
const eventNotificationService = require('./eventNotificationService');

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
    return prefs.enableAutoTeamDrawOneHourBefore === true || prefs.notifyWeatherAlerts === true;
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
  const prefs = normalizeNotificationPreferences(event.notification_preferences);
  const outcomes = [];
  const messages = [];
  let draw = null;
  let eventRecord = null;

  if (prefs.notifyWeatherAlerts === true) {
    try {
      const weatherResult = await eventNotificationService.notifyWeatherAlert({
        eventId: event.id
      });
      if (weatherResult?.sentCount > 0) {
        outcomes.push('weather_alert_sent');
        messages.push('Idojarasi figyelmeztetes kikuldve.');
      }
    } catch (error) {
      console.error('Prestart weather alert hiba:', error);
      outcomes.push('weather_alert_failed');
      messages.push('Az idojarasi figyelmeztetes nem sikerult.');
    }
  }

  if (prefs.enableAutoTeamDrawOneHourBefore === true) {
    if (Number(event.going_count) < Number(event.min_players)) {
      const cancelResult = await updateEventStatus({
        eventId: event.id,
        nextStatus: 'cancelled'
      });
      eventRecord = cancelResult.event;
      outcomes.push('cancelled_low_attendance');
      messages.push('Az esemeny elmarad, mert nincs meg a minimum letszam.');

      try {
        await eventNotificationService.notifyEventCancelled({
          eventId: event.id
        });
      } catch (error) {
        console.error('Prestart cancel notification hiba:', error);
      }
    } else {
      try {
        await saveEventTeamDraw({
          eventId: event.id,
          userId: null,
          draw: null
        });

        const publishResult = await publishEventTeamDraw({
          eventId: event.id
        });
        draw = publishResult.draw;
        outcomes.push('team_draw_published');
        messages.push('A csapatok leosztasra kerultek.');

        try {
          await eventNotificationService.notifyTeamDrawPublished({
            eventId: event.id,
            automated: true
          });
        } catch (error) {
          console.error('Prestart draw notification hiba:', error);
        }
      } catch (error) {
        outcomes.push('team_draw_failed');
        messages.push('Az automatikus csapatleosztas nem sikerult.');

        await markAutoPrestartProcessed({
          eventId: event.id,
          outcome: outcomes.join(',')
        });

        return {
          eventId: event.id,
          title: event.title,
          outcome: outcomes.join(','),
          message: messages.join(' '),
          error: error.message,
          draw,
          event: eventRecord
        };
      }
    }
  }

  const finalOutcome = outcomes.length ? outcomes.join(',') : 'noop';
  await markAutoPrestartProcessed({
    eventId: event.id,
    outcome: finalOutcome
  });

  return {
    eventId: event.id,
    title: event.title,
    outcome: finalOutcome,
    message: messages.join(' ') || 'Nem volt kuldendo automatikus muvelet.',
    draw,
    event: eventRecord
  };
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
