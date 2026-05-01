const AppError = require('../utils/appError');
const { pool, withTransaction } = require('./dbService');
const holidayData = require('../data/hu-holidays.json');
const {
  normalizeNotificationPreferences
} = require('../utils/notificationPreferences');
const {
  buildEventReadinessSummary
} = require('../utils/eventReadiness');
const {
  getMemberRankSnapshot,
  buildEventRegistrationWindow,
  getEventRegistrationContext,
  reconcileRankWaitingListForEvent
} = require('./rankService');
const {
  resolvePricingConfig,
  validatePricingConfig,
  buildEventPaymentSummary
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

const CREATE_ALLOWED_STATUSES = new Set([
  EVENT_STATUS.DRAFT,
  EVENT_STATUS.PUBLISHED
]);

const STATUS_TRANSITIONS = {
  [EVENT_STATUS.DRAFT]: new Set([
    EVENT_STATUS.PUBLISHED,
    EVENT_STATUS.CANCELLED
  ]),
  [EVENT_STATUS.PUBLISHED]: new Set([
    EVENT_STATUS.CANCELLED,
    EVENT_STATUS.FINISHED
  ]),
  [EVENT_STATUS.CANCELLED]: new Set([]),
  [EVENT_STATUS.FINISHED]: new Set([])
};

function normalizeStatus(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  return value.trim().toLowerCase();
}

function canTransitionStatus(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return true;
  }

  return STATUS_TRANSITIONS[currentStatus]?.has(nextStatus) || false;
}

function isRegistrationOpen(event) {
  return (
    event.status === EVENT_STATUS.PUBLISHED &&
    new Date(event.start_at).getTime() > Date.now()
  );
}

function assertValidDate(value, fieldName = 'startAt') {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, `A ${fieldName} érvénytelen dátum.`);
  }

  return date;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function getHolidayInfo(date) {
  const key = toIsoDate(date);
  return holidayData?.dates?.[key] || null;
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
      'Az esemény munkaszüneti vagy ünnepnapra esik. Ez nem tiltott, de érdemes ellenőrizni a szervezhetőséget.'
  };
}

function createHolidayConfirmationError(holidayWarning) {
  return new AppError(
    409,
    'Az esemény ünnepnapra vagy munkaszüneti napra esik, megerősítés szükséges.',
    {
      requiresHolidayConfirmation: true,
      holidayWarning,
      confirmationMessage: `Figyelem! A megszervezés előtt álló esemény ${holidayWarning.occursOn} munkaszüneti napra vagy ünnepnapra esik. Mindenképpen létre kívánod hozni az eseményt?`
    }
  );
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
      substitutesCount < 1 ||
      substitutesCount > 10
    ) {
      throw new AppError(
        400,
        'Ha a csere engedélyezett, a substitutesCount értéke 1 és 10 között kell legyen.'
      );
    }

    normalizedSubstitutesCount = substitutesCount;
  }

  const maxPlayers = playersOnFieldTotal + normalizedSubstitutesCount;

  if (minPlayers > maxPlayers) {
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

async function createEvent({ teamId, createdByUserId, data }) {
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
    confirmHolidayOverride,
    notificationPreferences
  } = data;

  const normalizedInitialStatus =
    normalizeStatus(initialStatus) || EVENT_STATUS.PUBLISHED;

  if (!CREATE_ALLOWED_STATUSES.has(normalizedInitialStatus)) {
    throw new AppError(
      400,
      'Az initialStatus csak draft vagy published lehet.'
    );
  }

  if (
    !title ||
    !startAt ||
    !locationName ||
    minPlayers == null ||
    playersOnFieldTotal == null ||
    substitutesEnabled == null
  ) {
    throw new AppError(
      400,
      'A title, startAt, locationName, minPlayers, playersOnFieldTotal és substitutesEnabled kötelező.'
    );
  }

  const startAtDate = assertValidDate(startAt);
  const holidayWarning = buildHolidayWarning(startAtDate);
  const normalizedNotificationPreferences =
    normalizeNotificationPreferences(notificationPreferences);
  const normalizedPaymentLinkProvider =
    normalizePaymentLinkProvider(paymentLinkProvider);
  const normalizedPaymentLinkUrl = normalizePaymentLinkUrl(paymentLinkUrl);
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

  const paymentLinkError = validatePaymentLinkConfig({
    provider: normalizedPaymentLinkProvider,
    url: normalizedPaymentLinkUrl
  });

  if (paymentLinkError) {
    throw new AppError(400, paymentLinkError);
  }

  if (holidayWarning && confirmHolidayOverride !== true) {
    throw createHolidayConfirmationError(holidayWarning);
  }

  if (
    normalizedInitialStatus === EVENT_STATUS.PUBLISHED &&
    startAtDate.getTime() <= Date.now()
  ) {
    throw new AppError(
      400,
      'Múltbeli eseményt nem lehet published státusszal létrehozni.'
    );
  }

  const { normalizedSubstitutesCount, maxPlayers } = computeCapacity({
    minPlayers,
    playersOnFieldTotal,
    substitutesEnabled,
    substitutesCount
  });

  return withTransaction(async client => {
    const teamCheck = await client.query(
      `
      select id, name, status
      from teams
      where id = $1
      `,
      [teamId]
    );

    if (teamCheck.rows.length === 0) {
      throw new AppError(404, 'A csapat nem található.');
    }

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
        now(),
        now()
      )
      returning *
      `,
      [
        teamId,
        createdByUserId,
        String(title).trim(),
        description || null,
        startAt,
        String(locationName).trim(),
        locationAddress || null,
        minPlayers,
        maxPlayers,
        normalizedInitialStatus,
        normalizedInitialStatus === EVENT_STATUS.PUBLISHED ? new Date().toISOString() : null
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
        fieldSize || null,
        fieldQuality || null,
        surfaceType || null,
        gameDurationMinutes || null,
        rulesText || null,
        pricingConfig.pricingMode,
        pricingConfig.fixedPricePerPerson,
        pricingConfig.totalEventCost,
        pricingConfig.perPlayerFee,
        pricingConfig.fixedPricePerPerson ?? pricePerPlayer ?? null,
        paymentNotes || null,
        normalizedPaymentLinkProvider,
        normalizedPaymentLinkUrl,
        playersOnFieldTotal,
        substitutesEnabled,
        normalizedNotificationPreferences,
        normalizedSubstitutesCount
      ]
    );

    return {
      message: 'Esemény sikeresen létrehozva.',
      holidayWarning,
      computed: {
        playersOnFieldTotal,
        substitutesEnabled,
        substitutesCount: normalizedSubstitutesCount,
        maxPlayers
      },
      lifecycle: {
        status: normalizedInitialStatus,
        isRegistrationOpen:
          normalizedInitialStatus === EVENT_STATUS.PUBLISHED &&
          startAtDate.getTime() > Date.now()
      },
      event,
      settings: settingsInsert.rows[0]
    };
  });
}

async function updateEventStatus({ eventId, nextStatus }) {
  const normalizedNextStatus = normalizeStatus(nextStatus);

  if (!normalizedNextStatus) {
    throw new AppError(400, 'A status kötelező.');
  }

  if (!Object.values(EVENT_STATUS).includes(normalizedNextStatus)) {
    throw new AppError(
      400,
      'Az érvényes státuszok: draft, published, cancelled, finished.'
    );
  }

  return withTransaction(async client => {
    const eventResult = await client.query(
      `
      select
        id,
        team_id,
        title,
        start_at,
        published_at,
        status,
        updated_at
      from events
      where id = $1
      for update
      `,
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      throw new AppError(404, 'Az esemény nem található.');
    }

    const currentEvent = eventResult.rows[0];
    const currentStatus = currentEvent.status;

    if (currentStatus === normalizedNextStatus) {
      return {
        message: 'Az esemény már ebben a státuszban van.',
        event: currentEvent
      };
    }

    if (!canTransitionStatus(currentStatus, normalizedNextStatus)) {
      throw new AppError(
        400,
        `Tiltott státuszváltás: ${currentStatus} -> ${normalizedNextStatus}.`
      );
    }

    const startAtMs = new Date(currentEvent.start_at).getTime();

    if (
      normalizedNextStatus === EVENT_STATUS.PUBLISHED &&
      startAtMs <= Date.now()
    ) {
      throw new AppError(
        400,
        'Múltbeli eseményt nem lehet published státuszra állítani.'
      );
    }

    if (
      normalizedNextStatus === EVENT_STATUS.FINISHED &&
      startAtMs > Date.now()
    ) {
      throw new AppError(
        400,
        'Jövőbeli eseményt nem lehet finished státuszra állítani.'
      );
    }

    if (normalizedNextStatus === EVENT_STATUS.FINISHED) {
      const registrationStatsResult = await client.query(
        `
        select
          count(*) filter (where er.registration_status = 'going')::int as going_count,
          count(*) filter (
            where er.registration_status = 'going'
              and eam.status in ('present', 'no_show')
          )::int as marked_going_count
        from event_registrations er
        left join event_attendance_marks eam
          on eam.event_id = er.event_id
         and eam.user_id = er.user_id
        where er.event_id = $1
        `,
        [eventId]
      );

      const stats = registrationStatsResult.rows[0] || {
        going_count: 0,
        marked_going_count: 0
      };

      if (Number(stats.going_count || 0) > Number(stats.marked_going_count || 0)) {
        throw new AppError(
          400,
          'Az esemény csak akkor zárható le, ha minden going játékos jelenléte vagy no-show állapota rögzítve van.'
        );
      }
    }

    const updateResult = await client.query(
      `
      update events
      set status = $2,
          published_at = case
            when $3 = 'published' then coalesce(published_at, now())
            else published_at
          end,
          updated_at = now()
      where id = $1
      returning *
      `,
      [eventId, normalizedNextStatus, normalizedNextStatus]
    );

    let cancelledRegistrationsCount = 0;

    if (normalizedNextStatus === EVENT_STATUS.CANCELLED) {
      const cancelRegistrationsResult = await client.query(
        `
        update event_registrations
        set registration_status = 'cancelled',
            cancelled_at = coalesce(cancelled_at, now()),
            updated_at = now()
        where event_id = $1
          and registration_status in ('going', 'waiting_list', 'waiting_list_rank')
        returning id
        `,
        [eventId]
      );

      cancelledRegistrationsCount = cancelRegistrationsResult.rows.length;
    }

    return {
      message: 'Esemény státusza frissítve.',
      transition: {
        from: currentStatus,
        to: normalizedNextStatus
      },
      effects: {
        cancelledRegistrationsCount
      },
      event: updateResult.rows[0]
    };
  });
}

async function updateEvent({ eventId, data }) {
  return withTransaction(async client => {
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
    notificationPreferences,
    hiddenFromAdminList
  } = data;

    const eventResult = await client.query(
      `
      select
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
        hidden_from_admin_list,
        status,
        created_at,
        updated_at
      from events
      where id = $1
      for update
      `,
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      throw new AppError(404, 'Az esemény nem található.');
    }

    const settingsResult = await client.query(
      `
      select
        id as settings_id,
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
      from event_settings
      where event_id = $1
      for update
      `,
      [eventId]
    );

    if (settingsResult.rows.length === 0) {
      throw new AppError(404, 'Az esemény beállításai nem találhatók.');
    }

    const currentEvent = {
      ...eventResult.rows[0],
      ...settingsResult.rows[0]
    };

    if (
      currentEvent.status === EVENT_STATUS.CANCELLED ||
      currentEvent.status === EVENT_STATUS.FINISHED
    ) {
      throw new AppError(
        400,
        'Cancelled vagy finished esemény nem szerkeszthető.'
      );
    }

    const requestedFields = Object.keys(data);

    if (requestedFields.length === 0) {
      throw new AppError(400, 'Nincs módosítandó mező.');
    }

    const allEditableFields = new Set([
      'title',
      'description',
      'startAt',
      'locationName',
      'locationAddress',
      'minPlayers',
      'playersOnFieldTotal',
      'substitutesEnabled',
      'substitutesCount',
      'fieldSize',
      'fieldQuality',
      'surfaceType',
      'gameDurationMinutes',
      'rulesText',
      'pricingMode',
      'fixedPricePerPerson',
      'totalEventCost',
      'perPlayerFee',
      'pricePerPlayer',
      'paymentNotes',
      'paymentLinkProvider',
      'paymentLinkUrl',
      'hiddenFromAdminList'
    ]);

    const publishedEditableFields = new Set([
      'title',
      'description',
      'startAt',
      'locationName',
      'locationAddress',
      'rulesText',
      'paymentNotes',
      'paymentLinkProvider',
      'paymentLinkUrl',
      'hiddenFromAdminList',
      'fixedPricePerPerson',
      'totalEventCost',
      'perPlayerFee',
      'pricePerPlayer'
    ]);

    const invalidFields = requestedFields.filter(
      field => !allEditableFields.has(field)
    );

    if (invalidFields.length > 0) {
      throw new AppError(
        400,
        `Nem szerkeszthető vagy ismeretlen mezők: ${invalidFields.join(', ')}`
      );
    }

    if (currentEvent.status === EVENT_STATUS.PUBLISHED) {
      const forbiddenPublishedFields = requestedFields.filter(
        field => !publishedEditableFields.has(field)
      );

      if (forbiddenPublishedFields.length > 0) {
        throw new AppError(
          400,
          `Published esem?nyn?l csak biztons?gosan m?dos?that? mez?k szerkeszthet?k. Tiltott mez?k: ${forbiddenPublishedFields.join(', ')}`
        );
      }
    }

    const nextEvent = {
      title: title !== undefined ? title : currentEvent.title,
      description:
        description !== undefined ? description : currentEvent.description,
      startAt: startAt !== undefined ? startAt : currentEvent.start_at,
      locationName:
        locationName !== undefined
          ? locationName
          : currentEvent.location_name,
      locationAddress:
        locationAddress !== undefined
          ? locationAddress
          : currentEvent.location_address,
      minPlayers:
        minPlayers !== undefined ? minPlayers : currentEvent.min_players,
      playersOnFieldTotal:
        playersOnFieldTotal !== undefined
          ? playersOnFieldTotal
          : currentEvent.players_on_field_total,
      substitutesEnabled:
        substitutesEnabled !== undefined
          ? substitutesEnabled
          : currentEvent.substitutes_enabled,
      substitutesCount:
        substitutesCount !== undefined
          ? substitutesCount
          : currentEvent.substitutes_count,
      fieldSize:
        fieldSize !== undefined ? fieldSize : currentEvent.field_size,
      fieldQuality:
        fieldQuality !== undefined ? fieldQuality : currentEvent.field_quality,
      surfaceType:
        surfaceType !== undefined ? surfaceType : currentEvent.surface_type,
      gameDurationMinutes:
        gameDurationMinutes !== undefined
          ? gameDurationMinutes
          : currentEvent.game_duration_minutes,
      rulesText:
        rulesText !== undefined ? rulesText : currentEvent.rules_text,
      pricingMode:
        pricingMode !== undefined ? pricingMode : currentEvent.pricing_mode,
      fixedPricePerPerson:
        fixedPricePerPerson !== undefined
          ? fixedPricePerPerson
          : currentEvent.fixed_price_per_person,
      totalEventCost:
        totalEventCost !== undefined
          ? totalEventCost
          : currentEvent.total_event_cost,
      perPlayerFee:
        perPlayerFee !== undefined
          ? perPlayerFee
          : currentEvent.per_player_fee,
      pricePerPlayer:
        pricePerPlayer !== undefined
          ? pricePerPlayer
          : currentEvent.price_per_player,
      paymentNotes:
        paymentNotes !== undefined
          ? paymentNotes
          : currentEvent.payment_notes,
      paymentLinkProvider:
        paymentLinkProvider !== undefined
          ? normalizePaymentLinkProvider(paymentLinkProvider)
          : currentEvent.payment_link_provider,
      paymentLinkUrl:
        paymentLinkUrl !== undefined
          ? normalizePaymentLinkUrl(paymentLinkUrl)
          : currentEvent.payment_link_url,
      hiddenFromAdminList:
        hiddenFromAdminList !== undefined
          ? hiddenFromAdminList
          : currentEvent.hidden_from_admin_list,
      notificationPreferences:
        notificationPreferences !== undefined
          ? normalizeNotificationPreferences(notificationPreferences)
          : normalizeNotificationPreferences(currentEvent.notification_preferences)
    };

    if (!nextEvent.title || !String(nextEvent.title).trim()) {
      throw new AppError(400, 'A title nem lehet üres.');
    }

    if (!nextEvent.locationName || !String(nextEvent.locationName).trim()) {
      throw new AppError(400, 'A locationName nem lehet üres.');
    }

    const pricingConfig = resolvePricingConfig({
      pricingMode: nextEvent.pricingMode,
      fixedPricePerPerson: nextEvent.fixedPricePerPerson,
      totalEventCost: nextEvent.totalEventCost,
      perPlayerFee: nextEvent.perPlayerFee,
      pricePerPlayer: nextEvent.pricePerPlayer
    });
    const pricingError = validatePricingConfig(pricingConfig);

    if (pricingError) {
      throw new AppError(400, pricingError);
    }

    const paymentLinkError = validatePaymentLinkConfig({
      provider: nextEvent.paymentLinkProvider,
      url: nextEvent.paymentLinkUrl
    });

    if (paymentLinkError) {
      throw new AppError(400, paymentLinkError);
    }

    const nextStartAtDate = assertValidDate(nextEvent.startAt);

    if (
      currentEvent.status === EVENT_STATUS.PUBLISHED &&
      nextStartAtDate.getTime() <= Date.now()
    ) {
      throw new AppError(
        400,
        'Published esemény startAt értéke nem tehető múltba.'
      );
    }

    const { normalizedSubstitutesCount, maxPlayers } = computeCapacity({
      minPlayers: nextEvent.minPlayers,
      playersOnFieldTotal: nextEvent.playersOnFieldTotal,
      substitutesEnabled: nextEvent.substitutesEnabled,
      substitutesCount: nextEvent.substitutesCount
    });

    const activeGoingCountResult = await client.query(
      `
      select count(*)::int as going_count
      from event_registrations
      where event_id = $1
        and registration_status = 'going'
      `,
      [eventId]
    );

    const activeGoingCount = activeGoingCountResult.rows[0].going_count;

    if (maxPlayers < activeGoingCount) {
      throw new AppError(
        400,
        `A maxPlayers nem lehet kisebb a már going státuszú jelentkezők számánál (${activeGoingCount}).`
      );
    }

    const updatedEventResult = await client.query(
      `
      update events
      set title = $2,
          description = $3,
          start_at = $4,
          location_name = $5,
          location_address = $6,
          min_players = $7,
          max_players = $8,
          hidden_from_admin_list = $9,
          updated_at = now()
      where id = $1
      returning *
      `,
      [
        eventId,
        String(nextEvent.title).trim(),
        nextEvent.description || null,
        nextEvent.startAt,
        String(nextEvent.locationName).trim(),
        nextEvent.locationAddress || null,
        nextEvent.minPlayers,
        maxPlayers,
        nextEvent.hiddenFromAdminList === true
      ]
    );

    const updatedSettingsResult = await client.query(
      `
      update event_settings
      set field_size = $2,
          field_quality = $3,
          surface_type = $4,
          game_duration_minutes = $5,
          rules_text = $6,
          pricing_mode = $7,
          fixed_price_per_person = $8,
          total_event_cost = $9,
          per_player_fee = $10,
          price_per_player = $11,
          payment_notes = $12,
          payment_link_provider = $13,
          payment_link_url = $14,
          players_on_field_total = $15,
          substitutes_enabled = $16,
          notification_preferences = $17,
          substitutes_count = $18,
          updated_at = now()
      where event_id = $1
      returning *
      `,
      [
        eventId,
        nextEvent.fieldSize || null,
        nextEvent.fieldQuality || null,
        nextEvent.surfaceType || null,
        nextEvent.gameDurationMinutes || null,
        nextEvent.rulesText || null,
        pricingConfig.pricingMode,
        pricingConfig.fixedPricePerPerson,
        pricingConfig.totalEventCost,
        pricingConfig.perPlayerFee,
        pricingConfig.fixedPricePerPerson ?? nextEvent.pricePerPlayer ?? null,
        nextEvent.paymentNotes || null,
        nextEvent.paymentLinkProvider,
        nextEvent.paymentLinkUrl,
        nextEvent.playersOnFieldTotal,
        nextEvent.substitutesEnabled,
        nextEvent.notificationPreferences,
        normalizedSubstitutesCount
      ]
    );

    return {
      message: 'Esemény sikeresen frissítve.',
      holidayWarning: buildHolidayWarning(nextStartAtDate),
      event: updatedEventResult.rows[0],
      settings: updatedSettingsResult.rows[0],
      computed: {
        maxPlayers,
        activeGoingCount
      }
    };
  });
}

async function getEventById(eventId, userId = null) {
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
      e.min_players,
      e.max_players,
      e.hidden_from_admin_list,
      e.status,
      e.created_at,
      e.updated_at,
      etd.status as draw_status,
      etd.published_at as draw_published_at,
      etd.stale_at as draw_stale_at,
      es.field_size,
      es.field_quality,
      es.surface_type,
      es.game_duration_minutes,
      es.rules_text,
      es.pricing_mode,
      es.fixed_price_per_person,
      es.total_event_cost,
      es.per_player_fee,
      es.price_per_player,
      es.payment_notes,
      es.payment_link_provider,
      es.payment_link_url,
      es.players_on_field_total,
      es.substitutes_enabled,
      es.notification_preferences,
      es.substitutes_count,
      my_reg.registration_status as my_registration_status,
      my_reg.registered_at as my_registered_at,
      my_reg.cancelled_at as my_cancelled_at,
      my_reg.promoted_at as my_promoted_at,
      coalesce(my_reg_stats.cancelled_count, 0)::int as my_cancelled_count
    from events e
    left join event_team_draws etd on etd.event_id = e.id
    left join event_settings es on es.event_id = e.id
    left join lateral (
      select
        reg.registration_status,
        reg.registered_at,
        reg.cancelled_at,
        reg.promoted_at
      from event_registrations reg
      where reg.event_id = e.id
        and reg.user_id = $2
      order by
        case reg.registration_status
          when 'going' then 1
          when 'waiting_list' then 2
          when 'waiting_list_rank' then 3
          when 'cancelled' then 4
          else 5
        end,
        reg.registered_at desc
      limit 1
    ) my_reg on true
    left join lateral (
      select count(*)::int as cancelled_count
      from event_registrations reg
      where reg.event_id = e.id
        and reg.user_id = $2
        and reg.registration_status = 'cancelled'
    ) my_reg_stats on true
    where e.id = $1
    `,
    [eventId, userId]
  );

  if (eventResult.rows.length === 0) {
    throw new AppError(404, 'Az esemény nem található.');
  }

  const event = {
    ...eventResult.rows[0],
    my_cancelled_count: Number(eventResult.rows[0].my_cancelled_count || 0),
    registration_limit_reached: Number(eventResult.rows[0].my_cancelled_count || 0) >= 2
  };
  await reconcileRankWaitingListForEvent({ eventId, event });
  const holidayWarning = buildHolidayWarning(new Date(event.start_at));

  const registrationsResult = await pool.query(
    `
    select
      er.id as registration_id,
      er.user_id,
      u.name,
      u.email,
      u.payment_provider,
      u.payment_username,
      u.payment_qr_data_url,
      er.registration_status,
      er.registered_at,
      er.cancelled_at,
      er.promoted_at,
      eam.status as attendance_status,
      eam.note as attendance_note,
      eam.payment_amount as attendance_payment_amount,
      eam.payment_recorded_at as attendance_payment_recorded_at,
      eam.marked_at as attendance_marked_at,
      eam.marked_by_user_id as attendance_marked_by_user_id,
      efe.expected_base_amount as finance_expected_base_amount,
      efe.expected_fee_amount as finance_expected_fee_amount,
      efe.expected_total_amount as finance_expected_total_amount,
      coalesce(efe.balance_before_event, prev_finance.balance_after_event, 0)::int as finance_balance_before_event,
      efe.settlement_target_amount as finance_settlement_target_amount,
      efe.actual_paid_amount as finance_actual_paid_amount,
      efe.event_delta_amount as finance_event_delta_amount,
      efe.balance_after_event as finance_balance_after_event
    from event_registrations er
    join users u on u.id = er.user_id
    left join event_attendance_marks eam
      on eam.event_id = er.event_id
     and eam.user_id = er.user_id
    left join event_financial_entries efe
      on efe.event_id = er.event_id
     and efe.user_id = er.user_id
    left join lateral (
      select prev.balance_after_event
      from event_financial_entries prev
      join events pe on pe.id = prev.event_id
      where prev.team_id = $2
        and prev.user_id = er.user_id
        and prev.event_id <> $1
        and (
          pe.start_at < $3
          or (pe.start_at = $3 and prev.event_id <> $1)
        )
      order by pe.start_at desc, pe.created_at desc, prev.recorded_at desc, prev.created_at desc, prev.id desc
      limit 1
    ) prev_finance on true
    where er.event_id = $1
    order by er.registered_at asc
    `,
    [eventId, event.team_id, event.start_at]
  );

  const allRegistrations = registrationsResult.rows;
  const going = allRegistrations.filter(
    r => r.registration_status === 'going'
  );
  const waitingList = allRegistrations.filter(
    r => r.registration_status === 'waiting_list'
  );
  const rankWaitingList = allRegistrations.filter(
    r => r.registration_status === 'waiting_list_rank'
  );
  const cancelled = allRegistrations.filter(
    r => r.registration_status === 'cancelled'
  );
  const myLatestRegistration = userId
    ? allRegistrations.find(r => r.user_id === userId && r.registration_status !== 'cancelled')
      || allRegistrations.find(r => r.user_id === userId && r.registration_status === 'cancelled')
    : null;
  if (myLatestRegistration) {
    event.my_registration_status = myLatestRegistration.registration_status;
    event.my_registered_at = myLatestRegistration.registered_at;
    event.my_cancelled_at = myLatestRegistration.cancelled_at;
    event.my_promoted_at = myLatestRegistration.promoted_at;
  }

  const goingCount = going.length;
  const waitingCount = waitingList.length;
  const rankWaitingCount = rankWaitingList.length;
  const cancelledCount = cancelled.length;
  const attendanceSummary = {
    presentCount: going.filter(item => item.attendance_status === 'present').length,
    noShowCount: going.filter(item => item.attendance_status === 'no_show').length,
    unmarkedCount: going.filter(item => !item.attendance_status).length,
    totalPaidAmount: going.reduce((sum, item) => sum + Number(item.attendance_payment_amount || 0), 0)
  };
  const maxPlayers = event.max_players;
  const spotsLeft = Math.max(maxPlayers - goingCount, 0);
  const paymentSummary = buildEventPaymentSummary(event, {
    goingCount,
    drawStatus: event.draw_status
  });
  const financeSummary = {
    expectedBaseTotalAmount: going.reduce((sum, item) => sum + Number(item.finance_expected_base_amount || 0), 0),
    expectedFeeTotalAmount: going.reduce((sum, item) => sum + Number(item.finance_expected_fee_amount || 0), 0),
    expectedTotalAmount: going.reduce((sum, item) => sum + Number(item.finance_expected_total_amount || 0), 0),
    settlementTargetTotalAmount: going.reduce((sum, item) => {
      const payment = Number(item.finance_settlement_target_amount);
      if (Number.isFinite(payment)) return sum + payment;
      const balanceBefore = Number(item.finance_balance_before_event || 0);
      return sum + Math.max(Number(paymentSummary.final_amount_per_person || 0) - balanceBefore, 0);
    }, 0),
    actualPaidTotalAmount: going.reduce(
      (sum, item) =>
        sum + Number((item.finance_actual_paid_amount ?? item.attendance_payment_amount) || 0),
      0
    ),
    eventDeltaTotalAmount: going.reduce((sum, item) => {
      const delta = Number(item.finance_event_delta_amount);
      if (Number.isFinite(delta)) return sum + delta;
      return (
        sum +
        (Number((item.finance_actual_paid_amount ?? item.attendance_payment_amount) || 0) -
          Number(paymentSummary.final_amount_per_person || 0))
      );
    }, 0)
  };
  const readiness = buildEventReadinessSummary({
    eventStatus: event.status,
    drawStatus: event.draw_status,
    goingCount,
    minPlayers: event.min_players
  });
  const { rankSnapshot, registrationWindow } = await getEventRegistrationContext({
    event,
    userId
  });

  return {
    event,
    holidayWarning,
    rankSnapshot,
    registrationWindow,
    registrations: {
      going,
      waitingList,
      rankWaitingList,
      cancelled
    },
    summary: {
      status: event.status,
      isRegistrationOpen: isRegistrationOpen(event),
      goingCount,
      waitingCount,
      rankWaitingCount,
      cancelledCount,
      attendanceSummary,
      minPlayers: event.min_players,
      maxPlayers,
      spotsLeft,
      paymentSummary,
      financeSummary,
      registrationWindow,
      ...readiness
    }
  };
}

async function getEventsByTeamId(teamId, userId = null) {
  const teamCheck = await pool.query(
    `
    select id, name, status
    from teams
    where id = $1
    `,
    [teamId]
  );

  if (teamCheck.rows.length === 0) {
    throw new AppError(404, 'A csapat nem található.');
  }

  const buildEventsQuery = () => pool.query(
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
      e.min_players,
      e.max_players,
      e.hidden_from_admin_list,
      e.status,
      e.created_at,
      e.updated_at,
      etd.status as draw_status,
      etd.published_at as draw_published_at,
      etd.stale_at as draw_stale_at,
      es.field_size,
      es.field_quality,
      es.surface_type,
      es.game_duration_minutes,
      es.rules_text,
      es.pricing_mode,
      es.fixed_price_per_person,
      es.total_event_cost,
      es.per_player_fee,
      es.price_per_player,
      es.payment_notes,
      es.payment_link_provider,
      es.payment_link_url,
      es.players_on_field_total,
      es.substitutes_enabled,
      es.notification_preferences,
      es.substitutes_count,
      my_reg.registration_status as my_registration_status,
      my_reg.registered_at as my_registered_at,
      my_reg.cancelled_at as my_cancelled_at,
      my_reg.promoted_at as my_promoted_at,
      coalesce(my_reg_stats.cancelled_count, 0)::int as my_cancelled_count,
      coalesce(sum(case when er.registration_status = 'going' then 1 else 0 end), 0)::int as going_count,
      coalesce(sum(case when er.registration_status = 'waiting_list' then 1 else 0 end), 0)::int as waiting_count,
      coalesce(sum(case when er.registration_status = 'waiting_list_rank' then 1 else 0 end), 0)::int as rank_waiting_count,
      coalesce(sum(case when er.registration_status = 'cancelled' then 1 else 0 end), 0)::int as cancelled_count
    from events e
    left join event_team_draws etd on etd.event_id = e.id
    left join event_settings es on es.event_id = e.id
    left join lateral (
      select
        reg.registration_status,
        reg.registered_at,
        reg.cancelled_at,
        reg.promoted_at
      from event_registrations reg
      where reg.event_id = e.id
        and reg.user_id = $2
      order by
        case reg.registration_status
          when 'going' then 1
          when 'waiting_list' then 2
          when 'waiting_list_rank' then 3
          when 'cancelled' then 4
          else 5
        end,
        reg.registered_at desc
      limit 1
    ) my_reg on true
    left join lateral (
      select count(*)::int as cancelled_count
      from event_registrations reg
      where reg.event_id = e.id
        and reg.user_id = $2
        and reg.registration_status = 'cancelled'
    ) my_reg_stats on true
    left join event_registrations er on er.event_id = e.id
    where e.team_id = $1
    group by
      e.id,
      etd.id,
      es.id,
      my_reg.registration_status,
      my_reg.registered_at,
      my_reg.cancelled_at,
      my_reg.promoted_at,
      my_reg_stats.cancelled_count
    order by e.start_at asc
    `,
    [teamId, userId]
  );

  let eventsResult = await buildEventsQuery();
  let didPromote = false;
  for (const event of eventsResult.rows) {
    const reconciliation = await reconcileRankWaitingListForEvent({
      eventId: event.id,
      event
    });
    if (reconciliation.promotedToGoing > 0 || reconciliation.promotedToWaitingList > 0) {
      didPromote = true;
    }
  }
  if (didPromote) {
    eventsResult = await buildEventsQuery();
  }

  let rankSnapshot = null;

  const eventIds = eventsResult.rows.map(event => event.id);
  const attendanceSummaryByEventId = new Map();
  const financeSummaryByEventId = new Map();

  if (eventIds.length > 0) {
    const attendanceSummaryResult = await pool.query(
      `
      select
        er.event_id,
        count(*) filter (where er.registration_status = 'going')::int as going_count_basis,
        count(*) filter (where eam.status = 'present')::int as present_count,
        count(*) filter (where eam.status = 'no_show')::int as no_show_count,
        count(*) filter (where er.registration_status = 'going' and eam.status is null)::int as unmarked_count,
        coalesce(sum(eam.payment_amount), 0)::int as total_paid_amount
      from event_registrations er
      left join event_attendance_marks eam
        on eam.event_id = er.event_id
       and eam.user_id = er.user_id
      where er.event_id = any($1::uuid[])
      group by er.event_id
      `,
      [eventIds]
    );

    attendanceSummaryResult.rows.forEach(row => {
      attendanceSummaryByEventId.set(row.event_id, row);
    });

    const financeSummaryResult = await pool.query(
      `
      select
        efe.event_id,
        count(*)::int as entry_count,
        coalesce(sum(efe.expected_base_amount), 0)::int as expected_base_total_amount,
        coalesce(sum(efe.expected_fee_amount), 0)::int as expected_fee_total_amount,
        coalesce(sum(efe.expected_total_amount), 0)::int as expected_total_amount,
        coalesce(sum(efe.settlement_target_amount), 0)::int as settlement_target_total_amount,
        coalesce(sum(efe.actual_paid_amount), 0)::int as actual_paid_total_amount,
        coalesce(sum(efe.event_delta_amount), 0)::int as event_delta_total_amount
      from event_financial_entries efe
      where efe.event_id = any($1::uuid[])
      group by efe.event_id
      `,
      [eventIds]
    );

    financeSummaryResult.rows.forEach(row => {
      financeSummaryByEventId.set(row.event_id, {
        entry_count: Number(row.entry_count || 0),
        expected_base_total_amount: Number(row.expected_base_total_amount || 0),
        expected_fee_total_amount: Number(row.expected_fee_total_amount || 0),
        expected_total_amount: Number(row.expected_total_amount || 0),
        settlement_target_total_amount: Number(row.settlement_target_total_amount || 0),
        actual_paid_total_amount: Number(row.actual_paid_total_amount || 0),
        event_delta_total_amount: Number(row.event_delta_total_amount || 0)
      });
    });
  }

  const events = eventsResult.rows.map(event => {
    const readiness = buildEventReadinessSummary({
      eventStatus: event.status,
      drawStatus: event.draw_status,
      goingCount: event.going_count,
      minPlayers: event.min_players
    });
    const attendanceSummary = attendanceSummaryByEventId.get(event.id) || {
      going_count_basis: event.going_count,
      present_count: 0,
      no_show_count: 0,
      unmarked_count: event.going_count,
      total_paid_amount: 0
    };
    const financeSummary = financeSummaryByEventId.get(event.id) || {
      entry_count: 0,
      expected_base_total_amount: 0,
      expected_fee_total_amount: 0,
      expected_total_amount: 0,
      settlement_target_total_amount: 0,
      actual_paid_total_amount: 0,
      event_delta_total_amount: 0
    };
    return {
      ...event,
      readiness,
      attendanceSummary,
      financeSummary
    };
  });

  const hydratedEvents = [];
  for (const item of events) {
    if (!rankSnapshot && userId) {
      rankSnapshot = await getMemberRankSnapshot({ teamId, userId });
    }
    const { registrationWindow } = await getEventRegistrationContext({
      event: item,
      userId
    });
    const paymentSummary = buildEventPaymentSummary(item, {
      goingCount: item.going_count,
      drawStatus: item.draw_status
    });
    hydratedEvents.push({
      ...item,
      my_cancelled_count: Number(item.my_cancelled_count || 0),
      registration_limit_reached: Number(item.my_cancelled_count || 0) >= 2,
      holidayWarning: buildHolidayWarning(new Date(item.start_at)),
      spots_left: Math.max(item.max_players - item.going_count, 0),
      is_registration_open: isRegistrationOpen(item),
      registration_window: registrationWindow,
      payment_summary: paymentSummary,
      attendance_summary: item.attendanceSummary,
      finance_summary: item.financeSummary,
      event_readiness: item.readiness.eventReadiness,
      requires_republish: item.readiness.requiresRepublish
    });
  }

  return {
    team: teamCheck.rows[0],
    rankSnapshot,
    count: hydratedEvents.length,
    events: hydratedEvents
  };
}

module.exports = {
  EVENT_STATUS,
  normalizeStatus,
  canTransitionStatus,
  isRegistrationOpen,
  createEvent,
  updateEvent,
  updateEventStatus,
  getEventById,
  getEventsByTeamId
};
