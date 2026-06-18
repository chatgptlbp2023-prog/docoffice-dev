const { pool } = require('./dbService');
const {
  buildMemberRankSnapshot,
  computeRegistrationWindow,
  getRegistrationWaveOffsetHours
} = require('../utils/rankEngine');

function getQueryable(client) {
  return client || pool;
}

async function getMemberRankSnapshot({ teamId, userId, client }) {
  if (!teamId || !userId) {
    return null;
  }

  const db = getQueryable(client);

  const membershipResult = await db.query(
    `
    select
      t.rank_module_enabled,
      tm.joined_at,
      tm.rank_value,
      tm.rank_status,
      tm.break_started_at,
      tm.break_until,
      tm.passive_since
    from team_members tm
    join teams t on t.id = tm.team_id
    where tm.team_id = $1
      and tm.user_id = $2
      and tm.membership_status = 'active'
    limit 1
    `,
    [teamId, userId]
  );

  if (membershipResult.rows.length === 0) {
    return null;
  }

  const membership = membershipResult.rows[0];
  const statsResult = await db.query(
    `
    with event_outcomes as (
      select
        case
          when e.status = 'cancelled' then 'neutral'
          when eam.status = 'present' then 'attended'
          when eam.status = 'no_show' then 'missed'
          when latest_reg.registration_status = 'going' then 'attended'
          when latest_reg.registration_status in ('cancelled', 'waiting_list', 'waiting_list_rank') then 'missed'
          when latest_reg.registration_status is null then 'missed'
          else 'neutral'
        end as outcome
      from events e
      left join lateral (
        select er.registration_status
        from event_registrations er
        where er.event_id = e.id
          and er.user_id = $2
        order by
          case er.registration_status
            when 'going' then 1
            when 'waiting_list' then 2
            when 'waiting_list_rank' then 3
            when 'cancelled' then 4
            else 5
          end,
          er.updated_at desc nulls last,
          er.registered_at desc nulls last
        limit 1
      ) latest_reg on true
      left join event_attendance_marks eam
        on eam.event_id = e.id
       and eam.user_id = $2
      where e.team_id = $1
        and e.start_at >= $3
        and e.start_at < now()
        and e.status in ('published', 'finished', 'cancelled')
        and (
          $6::timestamptz is null
          or coalesce(e.published_at, e.created_at, e.start_at) < $6::timestamptz
        )
        and not (
          $4::timestamptz is not null
          and $5::timestamptz is not null
          and coalesce(e.published_at, e.created_at, e.start_at) >= $4::timestamptz
          and coalesce(e.published_at, e.created_at, e.start_at) < $5::timestamptz
        )
    )
    select
      count(*) filter (where outcome in ('attended', 'missed'))::int as evaluated_events,
      count(*) filter (where outcome = 'attended')::int as attended_events,
      count(*) filter (where outcome = 'missed')::int as missed_events,
      count(*) filter (where outcome = 'neutral')::int as neutral_events
    from event_outcomes
    `,
    [
      teamId,
      userId,
      membership.joined_at,
      membership.break_started_at,
      membership.break_until,
      membership.passive_since
    ]
  );

  const stats = statsResult.rows[0] || {};
  return buildMemberRankSnapshot({
    rankModuleEnabled: membership.rank_module_enabled,
    rankStatus: membership.rank_status,
    rankValue: membership.rank_value,
    evaluatedEvents: Number(stats.evaluated_events || 0),
    attendedEvents: Number(stats.attended_events || 0),
    missedEvents: Number(stats.missed_events || 0),
    neutralEvents: Number(stats.neutral_events || 0)
  });
}

function buildEventRegistrationWindow({ event, rankSnapshot, now = new Date() }) {
  if (!event) return null;

  const window = computeRegistrationWindow({
    rankModuleEnabled: rankSnapshot?.rankModuleEnabled,
    rankStatus: rankSnapshot?.rankStatus,
    effectiveRankValue: rankSnapshot?.effectiveRankValue,
    publishedAt: event.published_at || event.created_at,
    eventStartAt: event.start_at,
    now
  });

  const rankModuleEnabled = Boolean(rankSnapshot?.rankModuleEnabled);
  const rankStatus = rankSnapshot?.rankStatus || 'guest';
  const numericRank = Number(rankSnapshot?.effectiveRankValue);
  const effectiveRankValue = Number.isFinite(numericRank) ? numericRank : null;
  const opensAtLabel = new Date(window.opensAt).toLocaleString('hu-HU');
  const isRestrictedByRank = rankModuleEnabled && !window.isOpen && window.offsetHours > 0;
  const rankLabel = rankStatus === 'ranked' && effectiveRankValue
    ? `${effectiveRankValue}. rang`
    : 'vendég státusz';

  return {
    ...window,
    rankModuleEnabled,
    rankStatus,
    effectiveRankValue,
    isRestrictedByRank,
    opensAtLabel,
    message: window.fastStartException
      ? 'A rangmodul aktiv, de ez az esemeny a letrehozasatol szamitva 3 oran belul kezdodik, ezert a jelentkezes azonnal nyitott.'
      : isRestrictedByRank
      ? `A csapatkapitány aktiválta a rangmodult. A jelenlegi ${rankLabel} alapján ${opensAtLabel} után tudsz jelentkezni.`
      : window.isOpen
        ? `A jelentkezési sávod nyitva van (${window.waveLabel}).`
        : `A jelentkezési sávod ${opensAtLabel} időpontban nyílik meg.`
  };
}

async function shouldEarlyOpenRegistrationWindow({
  event,
  rankSnapshot,
  userId,
  client
}) {
  if (!event || !rankSnapshot?.rankModuleEnabled || !userId) {
    return {
      earlyOpened: false,
      reason: null
    };
  }

  const currentOffset = getRegistrationWaveOffsetHours({
    rankModuleEnabled: rankSnapshot.rankModuleEnabled,
    rankStatus: rankSnapshot.rankStatus,
    effectiveRankValue: rankSnapshot.effectiveRankValue
  });

  if (currentOffset <= 0) {
    return {
      earlyOpened: false,
      reason: null
    };
  }

  const db = getQueryable(client);
  const membersResult = await db.query(
    `
    select user_id
    from team_members
    where team_id = $1
      and membership_status = 'active'
      and passive_since is null
      and not (
        break_started_at is not null
        and break_until is not null
        and $2::timestamptz >= break_started_at
        and $2::timestamptz < break_until
      )
    `,
    [event.team_id, event.published_at || event.created_at || event.start_at]
  );

  const higherWaveMembers = [];

  for (const member of membersResult.rows) {
    if (member.user_id === userId) {
      continue;
    }

    const memberSnapshot = await getMemberRankSnapshot({
      teamId: event.team_id,
      userId: member.user_id,
      client: db
    });

    const memberOffset = getRegistrationWaveOffsetHours({
      rankModuleEnabled: memberSnapshot?.rankModuleEnabled,
      rankStatus: memberSnapshot?.rankStatus,
      effectiveRankValue: memberSnapshot?.effectiveRankValue
    });

    if (memberOffset < currentOffset) {
      higherWaveMembers.push(member.user_id);
    }
  }

  if (higherWaveMembers.length === 0) {
    return {
      earlyOpened: true,
      reason: 'higher_wave_empty'
    };
  }

  const registrationsResult = await db.query(
    `
    select distinct user_id
    from event_registrations
    where event_id = $1
      and user_id = any($2::uuid[])
      and registration_status in ('going', 'waiting_list', 'waiting_list_rank', 'cancelled')
    `,
    [event.id, higherWaveMembers]
  );

  const respondedUsers = new Set(registrationsResult.rows.map(row => row.user_id));
  const allResponded = higherWaveMembers.every(memberId => respondedUsers.has(memberId));

  return {
    earlyOpened: allResponded,
    reason: allResponded ? 'higher_wave_responded' : null
  };
}

async function getEventRegistrationContext({
  event,
  teamId,
  userId,
  client,
  now = new Date()
}) {
  const rankSnapshot = userId
    ? await getMemberRankSnapshot({ teamId: teamId || event?.team_id, userId, client })
    : null;

  const baseWindow = buildEventRegistrationWindow({
    event,
    rankSnapshot,
    now
  });

  if (!userId || !baseWindow || !baseWindow.isRestrictedByRank || baseWindow.isOpen) {
    return {
      rankSnapshot,
      registrationWindow: baseWindow
    };
  }

  const earlyOpen = await shouldEarlyOpenRegistrationWindow({
    event,
    rankSnapshot,
    userId,
    client
  });

  if (!earlyOpen.earlyOpened) {
    return {
      rankSnapshot,
      registrationWindow: baseWindow
    };
  }

  return {
    rankSnapshot,
    registrationWindow: {
      ...baseWindow,
      isOpen: true,
      isRestrictedByRank: false,
      earlyOpened: true,
      earlyOpenReason: earlyOpen.reason,
      message: earlyOpen.reason === 'higher_wave_empty'
        ? 'A magasabb rangsávban nincs aktív tag, ezért a jelentkezés korábban megnyílt.'
        : 'A magasabb rangsáv minden releváns tagja már reagált, ezért a jelentkezésed korábban megnyílt.'
    }
  };
}

async function reconcileRankWaitingListForEvent({
  eventId,
  event,
  client,
  now = new Date()
}) {
  const db = getQueryable(client);
  let currentEvent = event;

  if (!currentEvent && !eventId) {
    return {
      promotedToGoing: 0,
      promotedToWaitingList: 0
    };
  }

  if (!currentEvent) {
    const eventResult = await db.query(
      `
      select
        id,
        team_id,
        status,
        start_at,
        published_at,
        created_at,
        max_players
      from events
      where id = $1
      `,
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      return {
        promotedToGoing: 0,
        promotedToWaitingList: 0
      };
    }

    currentEvent = eventResult.rows[0];
  }

  if (
    currentEvent.status !== 'published' ||
    new Date(currentEvent.start_at).getTime() <= now.getTime()
  ) {
    return {
      promotedToGoing: 0,
      promotedToWaitingList: 0
    };
  }

  const goingCountResult = await db.query(
    `
    select count(*)::int as going_count
    from event_registrations
    where event_id = $1
      and registration_status = 'going'
    `,
    [currentEvent.id]
  );

  let goingCount = Number(goingCountResult.rows[0]?.going_count || 0);

  const waitingRankResult = await db.query(
    `
    select id, user_id, registered_at
    from event_registrations
    where event_id = $1
      and registration_status = 'waiting_list_rank'
    order by registered_at asc
    `,
    [currentEvent.id]
  );

  let promotedToGoing = 0;
  let promotedToWaitingList = 0;

  for (const registration of waitingRankResult.rows) {
    const rankSnapshot = await getMemberRankSnapshot({
      teamId: currentEvent.team_id,
      userId: registration.user_id,
      client: db
    });
    const { registrationWindow } = await getEventRegistrationContext({
      event: currentEvent,
      userId: registration.user_id,
      client: db,
      now
    });

    if (!registrationWindow.isOpen) {
      continue;
    }

    const nextStatus =
      goingCount < Number(currentEvent.max_players || 0)
        ? 'going'
        : 'waiting_list';

    await db.query(
      `
      update event_registrations
      set registration_status = $2,
          promoted_at = now(),
          updated_at = now()
      where id = $1
      `,
      [registration.id, nextStatus]
    );

    if (nextStatus === 'going') {
      promotedToGoing += 1;
      goingCount += 1;
    } else {
      promotedToWaitingList += 1;
    }
  }

  return {
    promotedToGoing,
    promotedToWaitingList
  };
}

module.exports = {
  getMemberRankSnapshot,
  buildEventRegistrationWindow,
  getEventRegistrationContext,
  reconcileRankWaitingListForEvent
};

