
const AppError = require('../utils/appError');
const { pool, withTransaction } = require('./dbService');
const holidayData = require('../data/hu-holidays.json');
const {
  normalizeNotificationPreferences
} = require('../utils/notificationPreferences');
const {
  resolvePricingConfig,
  validatePricingConfig
} = require('../utils/eventPricing');
const {
  normalizePaymentLinkProvider,
  normalizePaymentLinkUrl,
  validatePaymentLinkConfig
} = require('../utils/paymentLinks');

const EVENT_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CANCELLED: 'cancelled',
  FINISHED: 'finished'
});

const RECURRENCE_TYPES = new Set(['weekly', 'biweekly', 'monthly']);
const SERIES_END_TYPES = new Set(['occurrence_count', 'until_date']);
const CREATE_ALLOWED_STATUSES = new Set([
  EVENT_STATUS.DRAFT,
  EVENT_STATUS.PUBLISHED
]);

const DEFAULT_GENERATION_HORIZON_COUNT = 6;
const MAX_OCCURRENCE_COUNT = 24;

function normalizeString(value) {
  if (value == null) {
    return null;
  }
  return String(value).trim();
}

function normalizeStatus(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  return value.trim().toLowerCase();
}

function assertValidDate(value, fieldName = 'startAt') {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, `A ${fieldName} érvénytelen dátum.`);
  }

  return date;
}

function computeCapacity({
  minPlayers,
  playersOnFieldTotal,
  substitutesEnabled,
  substitutesCount
}) {
  if (minPlayers < 1) {
    throw new AppError(400, 'A minPlayers legalább 1 kell legyen.');
  }

  if (playersOnFieldTotal < 1) {
    throw new AppError(400, 'A playersOnFieldTotal legalább 1 kell legyen.');
  }

  let normalizedSubstitutesCount = 0;

  if (substitutesEnabled === true) {
    if (
      substitutesCount == null ||
      Number(substitutesCount) < 1 ||
      Number(substitutesCount) > 10
    ) {
      throw new AppError(
        400,
        'Ha a csere engedélyezett, a substitutesCount értéke 1 és 10 között kell legyen.'
      );
    }

    normalizedSubstitutesCount = Number(substitutesCount);
  }

  const maxPlayers = Number(playersOnFieldTotal) + normalizedSubstitutesCount;

  if (Number(minPlayers) > maxPlayers) {
    throw new AppError(
      400,
      'A minPlayers nem lehet nagyobb, mint a számolt maxPlayers.'
    );
  }

  return {
    normalizedSubstitutesCount,
    maxPlayers
  };
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function getHolidayMap() {
  return holidayData?.dates || {};
}

function getHolidayInfo(date) {
  const map = getHolidayMap();
  const key = toIsoDate(date);
  return map[key] || null;
}

function buildHolidayWarning(date) {
  const holiday = getHolidayInfo(date);

  if (!holiday) {
    return null;
  }

  return {
    occursOn: toIsoDate(date),
    name: holiday.name,
    type: holiday.type || 'holiday',
    message:
      'A generált alkalom munkaszüneti vagy ünnepnapra esik. Ez nem tiltott, de érdemes ellenőrizni a szervezhetőséget.'
  };
}

function createHolidayConfirmationError(holidayWarnings) {
  const uniqueDates = [...new Set(holidayWarnings.map(item => item.occursOn))];
  const formattedDates = uniqueDates.join(', ');

  return new AppError(
    409,
    'Az eseménysorozat legalább egy alkalma ünnepnapra vagy munkaszüneti napra esik, megerősítés szükséges.',
    {
      requiresHolidayConfirmation: true,
      holidayWarnings,
      confirmationMessage:
        uniqueDates.length === 1
          ? `Figyelem! A megszervezés előtt álló esemény ${formattedDates} munkaszüneti napra vagy ünnepnapra esik. Mindenképpen létre kívánod hozni az eseményt?`
          : `Figyelem! A megszervezés előtt álló eseménysorozat több alkalma ünnepnapra vagy munkaszüneti napra esik (${formattedDates}). Mindenképpen létre kívánod hozni az eseményt?`
    }
  );
}

function addInterval(date, recurrenceType) {
  const next = new Date(date.getTime());

  if (recurrenceType === 'weekly') {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  if (recurrenceType === 'biweekly') {
    next.setUTCDate(next.getUTCDate() + 14);
    return next;
  }

  if (recurrenceType === 'monthly') {
    const originalDay = next.getUTCDate();
    next.setUTCMonth(next.getUTCMonth() + 1);

    if (next.getUTCDate() < originalDay) {
      next.setUTCDate(0);
    }

    return next;
  }

  throw new AppError(400, 'Ismeretlen recurrenceType.');
}

function validateCreateInput(data) {
  const {
    title,
    startAt,
    locationName,
    minPlayers,
    playersOnFieldTotal,
    substitutesEnabled,
    recurrenceType,
    seriesEndType,
    seriesOccurrenceCount,
    seriesUntilDate,
    initialStatus
  } = data;

  if (
    !title ||
    !startAt ||
    !locationName ||
    minPlayers == null ||
    playersOnFieldTotal == null ||
    substitutesEnabled == null ||
    !recurrenceType ||
    !seriesEndType
  ) {
    throw new AppError(
      400,
      'A title, startAt, locationName, minPlayers, playersOnFieldTotal, substitutesEnabled, recurrenceType és seriesEndType kötelező.'
    );
  }

  if (!RECURRENCE_TYPES.has(recurrenceType)) {
    throw new AppError(
      400,
      'A recurrenceType csak weekly, biweekly vagy monthly lehet.'
    );
  }

  if (!SERIES_END_TYPES.has(seriesEndType)) {
    throw new AppError(
      400,
      'A seriesEndType csak occurrence_count vagy until_date lehet.'
    );
  }

  const normalizedInitialStatus =
    normalizeStatus(initialStatus) || EVENT_STATUS.PUBLISHED;

  if (!CREATE_ALLOWED_STATUSES.has(normalizedInitialStatus)) {
    throw new AppError(
      400,
      'Az initialStatus csak draft vagy published lehet.'
    );
  }

  const startAtDate = assertValidDate(startAt);

  if (
    normalizedInitialStatus === EVENT_STATUS.PUBLISHED &&
    startAtDate.getTime() <= Date.now()
  ) {
    throw new AppError(
      400,
      'Múltbeli első alkalom nem hozható létre published státusszal.'
    );
  }

  let normalizedOccurrenceCount = null;
  let normalizedUntilDate = null;

  if (seriesEndType === 'occurrence_count') {
    normalizedOccurrenceCount = Number(seriesOccurrenceCount);

    if (
      !Number.isInteger(normalizedOccurrenceCount) ||
      normalizedOccurrenceCount < 1 ||
      normalizedOccurrenceCount > MAX_OCCURRENCE_COUNT
    ) {
      throw new AppError(
        400,
        `A seriesOccurrenceCount 1 és ${MAX_OCCURRENCE_COUNT} közötti egész szám kell legyen.`
      );
    }
  }

  if (seriesEndType === 'until_date') {
    if (!seriesUntilDate) {
      throw new AppError(
        400,
        'until_date esetén a seriesUntilDate kötelező.'
      );
    }

    normalizedUntilDate = assertValidDate(seriesUntilDate, 'seriesUntilDate');

    if (normalizedUntilDate.getTime() < startAtDate.getTime()) {
      throw new AppError(
        400,
        'A seriesUntilDate nem lehet korábbi, mint a startAt.'
      );
    }
  }

  return {
    startAtDate,
    normalizedInitialStatus,
    normalizedOccurrenceCount,
    normalizedUntilDate
  };
}

function buildOccurrenceDates({
  startAtDate,
  recurrenceType,
  seriesEndType,
  occurrenceCount,
  untilDate,
  generationHorizonCount = DEFAULT_GENERATION_HORIZON_COUNT
}) {
  const dates = [];
  let current = new Date(startAtDate.getTime());

  while (dates.length < generationHorizonCount) {
    if (seriesEndType === 'occurrence_count' && dates.length >= occurrenceCount) {
      break;
    }

    if (seriesEndType === 'until_date' && current.getTime() > untilDate.getTime()) {
      break;
    }

    dates.push(new Date(current.getTime()));
    current = addInterval(current, recurrenceType);
  }

  return dates;
}

async function assertTeamExists(client, teamId) {
  const teamResult = await client.query(
    `
    select id, name, status
    from teams
    where id = $1
    `,
    [teamId]
  );

  if (teamResult.rows.length === 0) {
    throw new AppError(404, 'A csapat nem található.');
  }

  return teamResult.rows[0];
}

async function insertGeneratedEvent(client, {
  teamId,
  createdByUserId,
  seriesId,
  occurrenceIndex,
  startAt,
  data,
  maxPlayers,
  normalizedInitialStatus,
  normalizedSubstitutesCount,
  normalizedNotificationPreferences
}) {
  const pricingConfig = resolvePricingConfig({
    pricingMode: data.pricingMode,
    fixedPricePerPerson: data.fixedPricePerPerson,
    totalEventCost: data.totalEventCost,
    perPlayerFee: data.perPlayerFee,
    pricePerPlayer: data.pricePerPlayer
  });

  const eventInsert = await client.query(
    `
    insert into events (
      id,
      team_id,
      created_by_user_id,
      title,
      description,
      start_at,
      location_name,
      location_address,
      min_players,
      max_players,
      status,
      published_at,
      series_id,
      occurrence_index,
      occurs_on,
      is_exception,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
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
      $11,
      $12,
      $13,
      $14,
      false,
      now(),
      now()
    )
    returning *
    `,
    [
      teamId,
      createdByUserId,
      normalizeString(data.title),
      normalizeString(data.description),
      startAt.toISOString(),
      normalizeString(data.locationName),
      normalizeString(data.locationAddress),
      data.minPlayers,
      maxPlayers,
      normalizedInitialStatus,
      normalizedInitialStatus === EVENT_STATUS.PUBLISHED ? new Date().toISOString() : null,
      seriesId,
      occurrenceIndex,
      toIsoDate(startAt)
    ]
  );

  const event = eventInsert.rows[0];

  const settingsInsert = await client.query(
    `
    insert into event_settings (
      id,
      event_id,
      field_size,
      field_quality,
      surface_type,
      game_duration_minutes,
      rules_text,
      pricing_mode,
      fixed_price_per_person,
      total_event_cost,
      per_player_fee,
      price_per_player,
      payment_notes,
      payment_link_provider,
      payment_link_url,
      players_on_field_total,
      substitutes_enabled,
      notification_preferences,
      substitutes_count,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
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
      $11,
      $12,
      $13,
      $14,
      $15,
      $16,
      $17,
      $18,
      now(),
      now()
    )
    returning *
    `,
    [
      event.id,
      normalizeString(data.fieldSize),
      normalizeString(data.fieldQuality),
      normalizeString(data.surfaceType),
      data.gameDurationMinutes || null,
      normalizeString(data.rulesText),
      pricingConfig.pricingMode,
      pricingConfig.fixedPricePerPerson,
      pricingConfig.totalEventCost,
      pricingConfig.perPlayerFee,
      pricingConfig.fixedPricePerPerson ?? data.pricePerPlayer ?? null,
      normalizeString(data.paymentNotes),
      normalizePaymentLinkProvider(data.paymentLinkProvider),
      normalizePaymentLinkUrl(data.paymentLinkUrl),
      data.playersOnFieldTotal,
      data.substitutesEnabled,
      normalizedNotificationPreferences,
      normalizedSubstitutesCount
    ]
  );

  return {
    event,
    settings: settingsInsert.rows[0]
  };
}

async function createEventSeries({ teamId, createdByUserId, data }) {
  const {
    title,
    description,
    startAt,
    locationName,
    locationAddress,
    minPlayers,
    playersOnFieldTotal,
    substitutesEnabled,
    substitutesCount,
    fieldSize,
    fieldQuality,
    surfaceType,
    gameDurationMinutes,
    rulesText,
    pricePerPlayer,
    pricingMode,
    fixedPricePerPerson,
    totalEventCost,
    perPlayerFee,
    paymentNotes,
    paymentLinkProvider,
    paymentLinkUrl,
    initialStatus,
    recurrenceType,
    seriesEndType,
    seriesOccurrenceCount,
    seriesUntilDate,
    confirmHolidayOverride,
    notificationPreferences
  } = data;

  const {
    startAtDate,
    normalizedInitialStatus,
    normalizedOccurrenceCount,
    normalizedUntilDate
  } = validateCreateInput(data);

  const { normalizedSubstitutesCount, maxPlayers } = computeCapacity({
    minPlayers: Number(minPlayers),
    playersOnFieldTotal: Number(playersOnFieldTotal),
    substitutesEnabled,
    substitutesCount
  });
  const normalizedNotificationPreferences =
    normalizeNotificationPreferences(notificationPreferences);
  const pricingConfig = resolvePricingConfig({
    pricingMode,
    fixedPricePerPerson,
    totalEventCost,
    perPlayerFee,
    pricePerPlayer
  });
  const pricingError = validatePricingConfig(pricingConfig);

  if (pricingError) {
    throw new AppError(400, pricingError);
  }

  const normalizedPaymentLinkProvider =
    normalizePaymentLinkProvider(paymentLinkProvider);
  const normalizedPaymentLinkUrl = normalizePaymentLinkUrl(paymentLinkUrl);
  const paymentLinkError = validatePaymentLinkConfig({
    provider: normalizedPaymentLinkProvider,
    url: normalizedPaymentLinkUrl
  });

  if (paymentLinkError) {
    throw new AppError(400, paymentLinkError);
  }

  const occurrenceDates = buildOccurrenceDates({
    startAtDate,
    recurrenceType,
    seriesEndType,
    occurrenceCount: normalizedOccurrenceCount,
    untilDate: normalizedUntilDate,
    generationHorizonCount: DEFAULT_GENERATION_HORIZON_COUNT
  });

  if (occurrenceDates.length === 0) {
    throw new AppError(400, 'Nem generálható egyetlen alkalom sem a megadott sorozatból.');
  }

  const holidayWarnings = occurrenceDates
    .map((occurrenceDate, index) => {
      const holidayWarning = buildHolidayWarning(occurrenceDate);

      return holidayWarning
        ? {
            occurrenceIndex: index + 1,
            ...holidayWarning
          }
        : null;
    })
    .filter(Boolean);

  if (holidayWarnings.length > 0 && confirmHolidayOverride !== true) {
    throw createHolidayConfirmationError(holidayWarnings);
  }

  return withTransaction(async client => {
    await assertTeamExists(client, teamId);

    const seriesInsert = await client.query(
      `
      insert into event_series (
        id,
        team_id,
        created_by_user_id,
        title,
        description,
        location_name,
        location_address,
        start_at_template,
        min_players,
        max_players,
        initial_event_status,
        recurrence_type,
        series_end_type,
        series_occurrence_count,
        series_until_date,
        generation_horizon_count,
        field_size,
        field_quality,
        surface_type,
        game_duration_minutes,
        rules_text,
        pricing_mode,
        fixed_price_per_person,
        total_event_cost,
        per_player_fee,
        price_per_player,
        payment_notes,
        payment_link_provider,
        payment_link_url,
        players_on_field_total,
        substitutes_enabled,
        substitutes_count,
        is_active,
        created_at,
        updated_at
      )
      values (
        gen_random_uuid(),
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
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19,
        $20,
        $21,
        $22,
        $23,
        $24,
        $25,
        $26,
        $27,
        $28,
        $29,
        $30,
        $31,
        true,
        now(),
        now()
      )
      returning *
      `,
      [
        teamId,
        createdByUserId,
        normalizeString(title),
        normalizeString(description),
        normalizeString(locationName),
        normalizeString(locationAddress),
        startAtDate.toISOString(),
        Number(minPlayers),
        maxPlayers,
        normalizedInitialStatus,
        recurrenceType,
        seriesEndType,
        normalizedOccurrenceCount,
        normalizedUntilDate ? normalizedUntilDate.toISOString() : null,
        DEFAULT_GENERATION_HORIZON_COUNT,
        normalizeString(fieldSize),
        normalizeString(fieldQuality),
        normalizeString(surfaceType),
        gameDurationMinutes || null,
        normalizeString(rulesText),
        pricingConfig.pricingMode,
        pricingConfig.fixedPricePerPerson,
        pricingConfig.totalEventCost,
        pricingConfig.perPlayerFee,
        pricingConfig.fixedPricePerPerson ?? pricePerPlayer ?? null,
        normalizeString(paymentNotes),
        normalizedPaymentLinkProvider,
        normalizedPaymentLinkUrl,
        Number(playersOnFieldTotal),
        substitutesEnabled,
        normalizedSubstitutesCount
      ]
    );

    const series = seriesInsert.rows[0];
    const generatedEvents = [];
    const generatedHolidayWarnings = [];

    for (let index = 0; index < occurrenceDates.length; index += 1) {
      const occurrenceDate = occurrenceDates[index];
      const generated = await insertGeneratedEvent(client, {
        teamId,
        createdByUserId,
        seriesId: series.id,
        occurrenceIndex: index + 1,
        startAt: occurrenceDate,
        data: {
          title,
          description,
          locationName,
          locationAddress,
          minPlayers: Number(minPlayers),
          playersOnFieldTotal: Number(playersOnFieldTotal),
          substitutesEnabled,
          fieldSize,
          fieldQuality,
            surfaceType,
            gameDurationMinutes,
            rulesText,
            pricePerPlayer,
            pricingMode: pricingConfig.pricingMode,
            fixedPricePerPerson: pricingConfig.fixedPricePerPerson,
            totalEventCost: pricingConfig.totalEventCost,
            perPlayerFee: pricingConfig.perPlayerFee,
            paymentNotes,
            paymentLinkProvider: normalizedPaymentLinkProvider,
            paymentLinkUrl: normalizedPaymentLinkUrl
          },
        maxPlayers,
        normalizedInitialStatus,
        normalizedSubstitutesCount,
        normalizedNotificationPreferences
      });

      generatedEvents.push({
        event: generated.event,
        settings: generated.settings
      });

      const holidayWarning = buildHolidayWarning(occurrenceDate);
      if (holidayWarning) {
        generatedHolidayWarnings.push({
          occurrenceIndex: index + 1,
          ...holidayWarning
        });
      }
    }

    return {
      message: 'Ismétlődő eseménysorozat sikeresen létrehozva.',
      series,
      generatedCount: generatedEvents.length,
      generatedEvents,
      holidayWarnings: generatedHolidayWarnings,
      recurrence: {
        recurrenceType,
        seriesEndType,
        seriesOccurrenceCount: normalizedOccurrenceCount,
        seriesUntilDate: normalizedUntilDate
          ? normalizedUntilDate.toISOString()
          : null,
        generationHorizonCount: DEFAULT_GENERATION_HORIZON_COUNT
      }
    };
  });
}

async function getEventSeriesByTeamId(teamId) {
  const seriesResult = await pool.query(
    `
    select
      es.*,
      (
        select count(*)
        from events e
        where e.series_id = es.id
      )::int as generated_events_count,
      (
        select min(e.start_at)
        from events e
        where e.series_id = es.id
          and e.start_at >= now()
      ) as next_occurrence_at
    from event_series es
    where es.team_id = $1
    order by es.created_at desc
    `,
    [teamId]
  );

  return {
    count: seriesResult.rows.length,
    series: seriesResult.rows
  };
}

async function getEventSeriesById({ teamId, seriesId }) {
  const seriesResult = await pool.query(
    `
    select
      es.*,
      (
        select count(*)
        from events e
        where e.series_id = es.id
      )::int as generated_events_count,
      (
        select min(e.start_at)
        from events e
        where e.series_id = es.id
          and e.start_at >= now()
      ) as next_occurrence_at
    from event_series es
    where es.id = $1
      and es.team_id = $2
    `,
    [seriesId, teamId]
  );

  if (seriesResult.rows.length === 0) {
    throw new AppError(404, 'Az eseménysorozat nem található.');
  }

  const eventsResult = await pool.query(
    `
    select
      e.id,
      e.team_id,
      e.title,
      e.start_at,
      e.location_name,
      e.location_address,
      e.min_players,
      e.max_players,
      e.status,
      e.series_id,
      e.occurrence_index,
      e.occurs_on,
      e.is_exception,
      (
        select count(*)
        from event_registrations er
        where er.event_id = e.id
          and er.registration_status = 'going'
      )::int as going_count,
      (
        select count(*)
        from event_registrations er
        where er.event_id = e.id
          and er.registration_status = 'waiting_list'
      )::int as waiting_count
    from events e
    where e.series_id = $1
    order by e.start_at asc
    `,
    [seriesId]
  );

  const holidayWarnings = eventsResult.rows
    .map(event => {
      const warning = buildHolidayWarning(new Date(event.start_at));
      return warning
        ? {
            eventId: event.id,
            occurrenceIndex: event.occurrence_index,
            ...warning
          }
        : null;
    })
    .filter(Boolean);

  return {
    series: seriesResult.rows[0],
    eventsCount: eventsResult.rows.length,
    events: eventsResult.rows,
    holidayWarnings
  };
}

async function getSeriesEvents({ teamId, seriesId }) {
  const seriesCheck = await pool.query(
    `
    select id
    from event_series
    where id = $1
      and team_id = $2
    `,
    [seriesId, teamId]
  );

  if (seriesCheck.rows.length === 0) {
    throw new AppError(404, 'Az eseménysorozat nem található.');
  }

  const result = await pool.query(
    `
    select
      e.id,
      e.team_id,
      e.title,
      e.description,
      e.start_at,
      e.location_name,
      e.location_address,
      e.min_players,
      e.max_players,
      e.status,
      e.series_id,
      e.occurrence_index,
      e.occurs_on,
      e.is_exception,
      e.created_at,
      e.updated_at
    from events e
    where e.series_id = $1
    order by e.start_at asc
    `,
    [seriesId]
  );

  return {
    count: result.rows.length,
    events: result.rows
  };
}

async function stopEventSeries({ teamId, seriesId }) {
  return withTransaction(async client => {
    const seriesResult = await client.query(
      `
      select
        id,
        team_id,
        is_active,
        title
      from event_series
      where id = $1
        and team_id = $2
      for update
      `,
      [seriesId, teamId]
    );

    if (seriesResult.rows.length === 0) {
      throw new AppError(404, 'Az eseménysorozat nem található.');
    }

    const currentSeries = seriesResult.rows[0];

    if (!currentSeries.is_active) {
      return {
        message: 'Az eseménysorozat már le van állítva.',
        series: currentSeries
      };
    }

    const updateResult = await client.query(
      `
      update event_series
      set is_active = false,
          updated_at = now()
      where id = $1
      returning *
      `,
      [seriesId]
    );

    return {
      message: 'Az eseménysorozat leállítva.',
      series: updateResult.rows[0]
    };
  });
}

module.exports = {
  createEventSeries,
  getEventSeriesByTeamId,
  getEventSeriesById,
  getSeriesEvents,
  stopEventSeries
};
