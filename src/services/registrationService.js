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

      const goingCountResult = await client.query(
        `
        select count(*)::int as going_count
        from event_registrations
        where event_id = $1
          and registration_status = 'going'
        `,
        [eventId]
      );

      const goingCount = Number(goingCountResult.rows[0]?.going_count || 0);
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

    let promotedRegistration = null;
    const changedGoingParticipants = previousStatus === 'going';
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
        const waitingResult = await client.query(
          `
          select id
          from event_registrations
          where event_id = $1
            and registration_status = 'waiting_list'
          order by registered_at asc
          limit 1
          for update skip locked
          `,
          [eventId]
        );

        if (waitingResult.rows.length > 0) {
          const waitingId = waitingResult.rows[0].id;

          const promoteResult = await client.query(
            `
            update event_registrations
            set registration_status = 'going',
                promoted_at = now(),
                updated_at = now()
            where id = $1
            returning *
            `,
            [waitingId]
          );

          promotedRegistration = promoteResult.rows[0];
        }
      }
    }

    const rankReconciliation = await reconcileRankWaitingListForEvent({
      eventId,
      client
    });

    if (changedGoingParticipants || rankReconciliation.promotedToGoing > 0) {
      const staleResult = await markPublishedEventDrawStale({ eventId, client });
      drawStatus = staleResult.draw?.status || drawStatus;
    }

    const finalGoingCountResult = await client.query(
      `
      select count(*)::int as going_count
      from event_registrations
      where event_id = $1
        and registration_status = 'going'
      `,
      [eventId]
    );

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
      goingCount: finalGoingCountResult.rows[0]?.going_count || 0,
      minPlayers: finalEvent?.min_players || 0
    });

    return {
      message: 'A jelentkezes lemondva.',
      cancelledUserId: userId,
      previousStatus,
      promotedRegistration,
      readiness
    };
  });
}

module.exports = {
  registerForEvent,
  cancelEventRegistration
};
