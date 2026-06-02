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

async function withPrestartEventLock(eventId, work) {
  const client = await pool.connect();
  let locked = false;

  try {
    const lockResult = await client.query(
      'select pg_try_advisory_lock(hashtext($1::text)) as locked',
      [String(eventId)]
    );
    locked = lockResult.rows[0]?.locked === true;

    if (!locked) {
      return {
        locked: false,
        result: {
          eventId,
          outcome: 'skipped_locked',
          message: 'Az eseményt egy másik prestart worker már feldolgozza.'
        }
      };
    }

    return {
      locked: true,
      result: await work(client)
    };
  } finally {
    if (locked) {
      try {
        await client.query(
          'select pg_advisory_unlock(hashtext($1::text))',
          [String(eventId)]
        );
      } catch (error) {
        console.error('Prestart advisory lock release hiba:', error);
      }
    }

    client.release();
  }
}

async function listDueAutoTeamDrawEvents({ now = new Date() } = {}) {
  const nowIso = now.toISOString();

  const result = await pool.query(
    `
    select
      e.id,
      e.team_id,
      e.created_by_user_id,
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

function summarizePrestartCandidate(event) {
  const prefs = normalizeNotificationPreferences(event.notification_preferences);
  const goingCount = Number(event.going_count || 0);
  const minPlayers = Number(event.min_players || 0);
  const willAutoDraw = prefs.enableAutoTeamDrawOneHourBefore === true;
  const willWeatherAlert = prefs.notifyWeatherAlerts === true;

  return {
    eventId: event.id,
    teamId: event.team_id,
    title: event.title,
    startAt: event.start_at,
    status: event.status,
    goingCount,
    minPlayers,
    willAutoDraw,
    willWeatherAlert,
    expectedOutcome: willAutoDraw
      ? goingCount < minPlayers
        ? 'cancelled_low_attendance'
        : 'team_draw_published'
      : willWeatherAlert
        ? 'weather_alert_check'
        : 'noop'
  };
}

async function previewDueAutoTeamDrawEvents({ now = new Date() } = {}) {
  const dueEvents = await listDueAutoTeamDrawEvents({ now });

  return {
    checkedAt: now.toISOString(),
    dueCount: dueEvents.length,
    candidates: dueEvents.map(summarizePrestartCandidate)
  };
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

async function isAutoPrestartAlreadyProcessed({ eventId, client = pool }) {
  const result = await client.query(
    `
    select auto_prestart_processed_at, auto_prestart_outcome
    from event_settings
    where event_id = $1
    limit 1
    `,
    [eventId]
  );

  const row = result.rows[0];

  return Boolean(row?.auto_prestart_processed_at)
    ? {
        processedAt: row.auto_prestart_processed_at,
        outcome: row.auto_prestart_outcome || null
      }
    : null;
}

async function processSinglePrestartEventUnlocked(event, { client = pool } = {}) {
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
          userId: event.created_by_user_id || null,
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
          outcome: outcomes.join(','),
          client
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
    outcome: finalOutcome,
    client
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

async function processSinglePrestartEvent(event) {
  const { result } = await withPrestartEventLock(event.id, async client => {
    const alreadyProcessed = await isAutoPrestartAlreadyProcessed({
      eventId: event.id,
      client
    });

    if (alreadyProcessed) {
      return {
        eventId: event.id,
        title: event.title,
        outcome: 'skipped_already_processed',
        message: `Az esemény prestart feldolgozása már megtörtént: ${alreadyProcessed.outcome || 'ismeretlen eredmény'}.`,
        processedAt: alreadyProcessed.processedAt
      };
    }

    return processSinglePrestartEventUnlocked(event, { client });
  });

  return result;
}

async function processDueAutoTeamDrawEvents({ now = new Date() } = {}) {
  const dueEvents = await listDueAutoTeamDrawEvents({ now });
  const results = [];

  for (const event of dueEvents) {
    const result = await processSinglePrestartEvent(event);
    results.push(result);
  }

  const skippedCount = results.filter(result => String(result.outcome || '').startsWith('skipped_')).length;

  return {
    processedCount: results.length - skippedCount,
    skippedCount,
    results
  };
}

module.exports = {
  listDueAutoTeamDrawEvents,
  previewDueAutoTeamDrawEvents,
  processDueAutoTeamDrawEvents
};
