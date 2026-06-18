const AppError = require('../utils/appError');
const { withTransaction } = require('./dbService');
const { isRegistrationOpen } = require('./eventService');
const { markPublishedEventDrawStale } = require('./teamSkillService');
const { buildEventReadinessSummary } = require('../utils/eventReadiness');
const {
  getEventRegistrationContext,
  reconcileRankWaitingListForEvent
} = require('./rankService');
const { assertTeamRulesAccepted } = require('./teamRulesService');

const ACTIVE_REGISTRATION_STATUSES = ['going', 'waiting_list', 'waiting_list_rank'];
const ACTIVE_GUEST_REGISTRATION_STATUSES = ['going', 'waiting_list'];

function normalizeGuestName(value) {
  const guestName = String(value ?? '').replace(/\s+/g, ' ').trim();

  if (guestName.length < 2) {
    throw new AppError(400, 'A vendeg neve legalabb 2 karakter legyen.');
  }

  if (guestName.length > 120) {
    throw new AppError(400, 'A vendeg neve legfeljebb 120 karakter lehet.');
  }

  return guestName;
}

async function getCombinedGoingCount(client, eventId) {
  const result = await client.query(
    `
    select
      (
        select count(*)::int
        from event_registrations
        where event_id = $1
          and registration_status = 'going'
      ) +
      (
        select count(*)::int
        from event_guest_registrations
        where event_id = $1
          and registration_status = 'going'
      ) as going_count
    `,
    [eventId]
  );

  return Number(result.rows[0]?.going_count || 0);
}

async function promoteNextWaitingListEntry({ client, eventId }) {
  const waitingResult = await client.query(
    `
    select source, id
    from (
      select 'user' as source, id, registered_at
      from event_registrations
      where event_id = $1
        and registration_status = 'waiting_list'
      union all
      select 'guest' as source, id, registered_at
      from event_guest_registrations
      where event_id = $1
        and registration_status = 'waiting_list'
    ) waiting_entries
    order by registered_at asc
    limit 1
    `,
    [eventId]
  );

  if (waitingResult.rows.length === 0) {
    return null;
  }

  const waitingEntry = waitingResult.rows[0];

  if (waitingEntry.source === 'guest') {
    const promoteResult = await client.query(
      `
      update event_guest_registrations
      set registration_status = 'going',
          promoted_at = now(),
          updated_at = now()
      where id = $1
      returning *, true as is_guest
      `,
      [waitingEntry.id]
    );

    return promoteResult.rows[0] || null;
  }

  const promoteResult = await client.query(
    `
    update event_registrations
    set registration_status = 'going',
        promoted_at = now(),
        updated_at = now()
    where id = $1
    returning *, false as is_guest
    `,
    [waitingEntry.id]
  );

  return promoteResult.rows[0] || null;
}

async function registerForEvent({ eventId, userId }) {
  if (!userId) {
    throw new AppError(400, 'A userId kotelezo.');
  }

  try {
    return await withTransaction(async client => {
      const eventResult = await client.query(
        `
        select
          e.id,
          e.team_id,
          e.status,
          e.start_at,
          e.published_at,
          e.created_at,
          e.max_players,
          e.min_players,
          (
            select etd.status
            from event_team_draws etd
            where etd.event_id = e.id
          ) as draw_status
        from events e
        where e.id = $1
        for update
        `,
        [eventId]
      );

      if (eventResult.rows.length === 0) {
        throw new AppError(404, 'Az esemeny nem talalhato.');
      }

      const event = eventResult.rows[0];

      if (!isRegistrationOpen(event)) {
        throw new AppError(
          400,
          'Erre az esemenyre jelenleg nem lehet jelentkezni. Csak jovobeli published esemenyre lehet jelentkezni.'
        );
      }

      await assertTeamRulesAccepted(client, {
        teamId: event.team_id,
        userId
      });

      const rankReconciliation = await reconcileRankWaitingListForEvent({
        eventId,
        event,
        client
      });

      const { rankSnapshot, registrationWindow } = await getEventRegistrationContext({
        event,
        userId,
        client
      });

      const existingRegistration = await client.query(
        `
        select id, registration_status
        from event_registrations
        where event_id = $1
          and user_id = $2
          and registration_status = any($3::text[])
        for update
        `,
        [eventId, userId, ACTIVE_REGISTRATION_STATUSES]
      );

      if (existingRegistration.rows.length > 0) {
        throw new AppError(409, 'A user mar jelentkezett erre az esemenyre.', {
          registrationStatus: existingRegistration.rows[0].registration_status
        });
      }

      const cancellationCountResult = await client.query(
        `
        select count(*)::int as cancelled_count
        from event_registrations
        where event_id = $1
          and user_id = $2
          and registration_status = 'cancelled'
        `,
        [eventId, userId]
      );

      const cancellationCount = Number(cancellationCountResult.rows[0]?.cancelled_count || 0);

      if (cancellationCount >= 2) {
        throw new AppError(
          403,
          'Erre az esemenyre mar nem tudsz ujra jelentkezni. Fordulj a csapat adminjahoz.',
          {
            cancellationLimitReached: true,
            cancellationCount,
            registrationStatus: 'cancelled'
          }
        );
      }

      const goingCount = await getCombinedGoingCount(client, eventId);
      const registrationStatus =
        rankSnapshot?.rankModuleEnabled && !registrationWindow.isOpen
          ? 'waiting_list_rank'
          : goingCount < Number(event.max_players || 0)
            ? 'going'
            : 'waiting_list';

      const insertResult = await client.query(
        `
        insert into event_registrations (
          id,
          event_id,
          user_id,
          team_id,
          registration_status,
          registered_at,
          created_at,
          updated_at
        )
        values (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          now(),
          now(),
          now()
        )
        returning *
        `,
        [eventId, userId, event.team_id, registrationStatus]
      );

      let drawStatus = event.draw_status;

      if (registrationStatus === 'going' || rankReconciliation.promotedToGoing > 0) {
        const staleResult = await markPublishedEventDrawStale({ eventId, client });
        drawStatus = staleResult.draw?.status || drawStatus;
      }

      const readiness = buildEventReadinessSummary({
        eventStatus: event.status,
        drawStatus,
        goingCount: registrationStatus === 'going' ? goingCount + 1 : goingCount,
        minPlayers: event.min_players
      });

      return {
        message:
          registrationStatus === 'going'
            ? 'Sikeres jelentkezes.'
            : registrationStatus === 'waiting_list_rank'
              ? 'Elojelentkezes rogzitve. Rangvarolistara kerultel, es a savod nyitasakor automatikusan atsorol a rendszer.'
              : 'Az esemeny betelt, varolistara kerultel.',
        registration: insertResult.rows[0],
        cancellationCount,
        rankSnapshot,
        registrationWindow,
        readiness
      };
    });
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError(409, 'A user mar jelentkezett erre az esemenyre.');
    }

    throw error;
  }
}

async function registerGuestForEvent({ eventId, userId, guestName }) {
  if (!userId) {
    throw new AppError(400, 'A userId kotelezo.');
  }

  const normalizedGuestName = normalizeGuestName(guestName);

  try {
    return await withTransaction(async client => {
      const eventResult = await client.query(
        `
        select
          e.id,
          e.team_id,
          e.status,
          e.start_at,
          e.published_at,
          e.created_at,
          e.max_players,
          e.min_players,
          (
            select etd.status
            from event_team_draws etd
            where etd.event_id = e.id
          ) as draw_status
        from events e
        where e.id = $1
        for update
        `,
        [eventId]
      );

      if (eventResult.rows.length === 0) {
        throw new AppError(404, 'Az esemeny nem talalhato.');
      }

      const event = eventResult.rows[0];

      if (!isRegistrationOpen(event)) {
        throw new AppError(
          400,
          'Erre az esemenyre jelenleg nem lehet vendeget rogziteni. Csak jovobeli published esemenyre lehet jelentkezni.'
        );
      }

      await assertTeamRulesAccepted(client, {
        teamId: event.team_id,
        userId
      });

      const rankReconciliation = await reconcileRankWaitingListForEvent({
        eventId,
        event,
        client
      });

      const hostRegistrationResult = await client.query(
        `
        select id, registration_status
        from event_registrations
        where event_id = $1
          and user_id = $2
          and registration_status = any($3::text[])
        order by
          case registration_status
            when 'going' then 1
            when 'waiting_list' then 2
            when 'waiting_list_rank' then 3
            else 4
          end,
          registered_at desc
        limit 1
        for update
        `,
        [eventId, userId, ACTIVE_REGISTRATION_STATUSES]
      );

      if (hostRegistrationResult.rows.length === 0) {
        throw new AppError(
          403,
          'Elobb jelentkezz az esemenyre, utana tudsz vendeget hozni.'
        );
      }

      const hostRegistration = hostRegistrationResult.rows[0];

      const existingGuestResult = await client.query(
        `
        select id, registration_status
        from event_guest_registrations
        where event_id = $1
          and host_user_id = $2
          and registration_status = any($3::text[])
        for update
        `,
        [eventId, userId, ACTIVE_GUEST_REGISTRATION_STATUSES]
      );

      if (existingGuestResult.rows.length > 0) {
        throw new AppError(409, 'Ehhez az esemenyhez mar rogzitettel vendeget.', {
          registrationStatus: existingGuestResult.rows[0].registration_status
        });
      }

      const goingCount = await getCombinedGoingCount(client, eventId);
      const registrationStatus =
        hostRegistration.registration_status === 'going' &&
        goingCount < Number(event.max_players || 0)
          ? 'going'
          : 'waiting_list';

      const insertResult = await client.query(
        `
        insert into event_guest_registrations (
          id,
          event_id,
          team_id,
          host_user_id,
          guest_name,
          registration_status,
          registered_at,
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
          now(),
          now(),
          now()
        )
        returning *, true as is_guest
        `,
        [eventId, event.team_id, userId, normalizedGuestName, registrationStatus]
      );

      let drawStatus = event.draw_status;

      if (registrationStatus === 'going' || rankReconciliation.promotedToGoing > 0) {
        const staleResult = await markPublishedEventDrawStale({ eventId, client });
        drawStatus = staleResult.draw?.status || drawStatus;
      }

      const readiness = buildEventReadinessSummary({
        eventStatus: event.status,
        drawStatus,
        goingCount: registrationStatus === 'going' ? goingCount + 1 : goingCount,
        minPlayers: event.min_players
      });

      return {
        message:
          registrationStatus === 'going'
            ? 'Vendeg rogzitve. A letszamba beleszamit.'
            : 'Az esemeny betelt, a vendeg varolistara kerult.',
        guestRegistration: insertResult.rows[0],
        readiness
      };
    });
  } catch (error) {
    if (error.code === '23505') {
      throw new AppError(409, 'Ehhez az esemenyhez mar rogzitettel vendeget.');
    }

    throw error;
  }
}

async function cancelGuestRegistration({ eventId, userId, guestRegistrationId }) {
  return withTransaction(async client => {
    const guestResult = await client.query(
      `
      select id, registration_status
      from event_guest_registrations
      where id = $1
        and event_id = $2
        and host_user_id = $3
        and registration_status = any($4::text[])
      for update
      `,
      [guestRegistrationId, eventId, userId, ACTIVE_GUEST_REGISTRATION_STATUSES]
    );

    if (guestResult.rows.length === 0) {
      throw new AppError(404, 'Nincs aktiv vendegjelentkezes ehhez az esemenyhez.');
    }

    const currentGuest = guestResult.rows[0];
    const previousStatus = currentGuest.registration_status;

    await client.query(
      `
      update event_guest_registrations
      set registration_status = 'cancelled',
          cancelled_at = now(),
          updated_at = now()
      where id = $1
      `,
      [currentGuest.id]
    );

    let promotedRegistration = null;
    let drawStatus = null;

    if (previousStatus === 'going') {
      const eventResult = await client.query(
        `
        select
          e.id,
          e.status,
          e.start_at,
          e.min_players,
          (
            select etd.status
            from event_team_draws etd
            where etd.event_id = e.id
          ) as draw_status
        from events e
        where e.id = $1
        for update
        `,
        [eventId]
      );

      const event = eventResult.rows[0];

      if (event && isRegistrationOpen(event)) {
        promotedRegistration = await promoteNextWaitingListEntry({ client, eventId });
      }
    }

    const rankReconciliation = await reconcileRankWaitingListForEvent({
      eventId,
      client
    });

    if (previousStatus === 'going' || promotedRegistration || rankReconciliation.promotedToGoing > 0) {
      const staleResult = await markPublishedEventDrawStale({ eventId, client });
      drawStatus = staleResult.draw?.status || drawStatus;
    }

    const finalGoingCount = await getCombinedGoingCount(client, eventId);
    const finalEventResult = await client.query(
      `
      select
        e.status,
        e.min_players,
        etd.status as draw_status
      from events e
      left join event_team_draws etd on etd.event_id = e.id
      where e.id = $1
      `,
      [eventId]
    );

    const finalEvent = finalEventResult.rows[0];
    const readiness = buildEventReadinessSummary({
      eventStatus: finalEvent?.status,
      drawStatus: drawStatus || finalEvent?.draw_status,
      goingCount: finalGoingCount,
      minPlayers: finalEvent?.min_players || 0
    });

    return {
      message: 'A vendeg jelentkezese lemondva.',
      cancelledGuestRegistrationId: currentGuest.id,
      previousStatus,
      promotedRegistration,
      readiness
    };
  });
}

async function cancelEventRegistration({ eventId, userId }) {
  return withTransaction(async client => {
    const registrationResult = await client.query(
      `
      select id, registration_status
      from event_registrations
      where event_id = $1
        and user_id = $2
        and registration_status = any($3::text[])
      for update
      `,
      [eventId, userId, ACTIVE_REGISTRATION_STATUSES]
    );

    if (registrationResult.rows.length === 0) {
      throw new AppError(
        404,
        'A usernek nincs aktiv jelentkezese erre az esemenyre.'
      );
    }

    const currentRegistration = registrationResult.rows[0];
    const previousStatus = currentRegistration.registration_status;

    const guestRegistrationsResult = await client.query(
      `
      select id, registration_status
      from event_guest_registrations
      where event_id = $1
        and host_user_id = $2
        and registration_status = any($3::text[])
      for update
      `,
      [eventId, userId, ACTIVE_GUEST_REGISTRATION_STATUSES]
    );
    const activeGuestRegistrations = guestRegistrationsResult.rows;

    await client.query(
      `
      update event_registrations
      set registration_status = 'cancelled',
          cancelled_at = now(),
          updated_at = now()
      where id = $1
      `,
      [currentRegistration.id]
    );

    if (activeGuestRegistrations.length > 0) {
      await client.query(
        `
        update event_guest_registrations
        set registration_status = 'cancelled',
            cancelled_at = now(),
            updated_at = now()
        where event_id = $1
          and host_user_id = $2
          and registration_status = any($3::text[])
        `,
        [eventId, userId, ACTIVE_GUEST_REGISTRATION_STATUSES]
      );
    }

    const freedGoingSlots =
      (previousStatus === 'going' ? 1 : 0) +
      activeGuestRegistrations.filter(item => item.registration_status === 'going').length;
    const promotedRegistrations = [];
    let promotedRegistration = null;
    const changedGoingParticipants = freedGoingSlots > 0;
    let drawStatus = null;

    if (freedGoingSlots > 0) {
      const eventResult = await client.query(
        `
        select
          e.id,
          e.status,
          e.start_at,
          e.min_players,
          (
            select etd.status
            from event_team_draws etd
            where etd.event_id = e.id
          ) as draw_status
        from events e
        where e.id = $1
        for update
        `,
        [eventId]
      );

      const event = eventResult.rows[0];

      if (event && isRegistrationOpen(event)) {
        for (let slot = 0; slot < freedGoingSlots; slot += 1) {
          const promoted = await promoteNextWaitingListEntry({ client, eventId });
          if (!promoted) {
            break;
          }
          promotedRegistrations.push(promoted);
        }
      }
    }

    promotedRegistration =
      promotedRegistrations.find(item => !item.is_guest) ||
      promotedRegistrations[0] ||
      null;

    const rankReconciliation = await reconcileRankWaitingListForEvent({
      eventId,
      client
    });

    if (changedGoingParticipants || rankReconciliation.promotedToGoing > 0) {
      const staleResult = await markPublishedEventDrawStale({ eventId, client });
      drawStatus = staleResult.draw?.status || drawStatus;
    }

    const finalGoingCount = await getCombinedGoingCount(client, eventId);

    const finalEventResult = await client.query(
      `
      select
        e.status,
        e.min_players,
        etd.status as draw_status
      from events e
      left join event_team_draws etd on etd.event_id = e.id
      where e.id = $1
      `,
      [eventId]
    );

    const finalEvent = finalEventResult.rows[0];
    const readiness = buildEventReadinessSummary({
      eventStatus: finalEvent?.status,
      drawStatus: drawStatus || finalEvent?.draw_status,
      goingCount: finalGoingCount,
      minPlayers: finalEvent?.min_players || 0
    });

    return {
      message: 'A jelentkezes lemondva.',
      cancelledUserId: userId,
      cancelledGuestRegistrationIds: activeGuestRegistrations.map(item => item.id),
      previousStatus,
      promotedRegistration,
      promotedRegistrations,
      readiness
    };
  });
}

module.exports = {
  registerForEvent,
  registerGuestForEvent,
  cancelGuestRegistration,
  cancelEventRegistration
};
