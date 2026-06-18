const AppError = require('../utils/appError');
const { pool } = require('./dbService');
const { isRegistrationOpen } = require('./eventService');
const { buildEventReadinessSummary } = require('../utils/eventReadiness');
const {
  getMemberRankSnapshot,
  getEventRegistrationContext,
  reconcileRankWaitingListForEvent
} = require('./rankService');
const { normalizeTeamRole } = require('../utils/teamRoles');
const { buildEventPaymentSummary } = require('../utils/eventPricing');
const { buildRulesAcceptanceState } = require('./teamRulesService');

async function getMyTeams(userId) {
  const result = await pool.query(
    `
    select
      t.id,
      t.name,
      t.status,
      t.rules_module_enabled,
      t.rules_version,
      t.created_at,
      t.updated_at,
      tm.role,
      tm.membership_status,
      tm.joined_at,
      rules.rules_version as rules_accepted_version,
      rules.accepted_at as rules_accepted_at
    from team_members tm
    join teams t on t.id = tm.team_id
    left join lateral (
      select tra.rules_version, tra.accepted_at
      from team_rule_acceptances tra
      where tra.team_id = tm.team_id
        and tra.user_id = tm.user_id
      order by tra.accepted_at desc
      limit 1
    ) rules on true
    where tm.user_id = $1
      and tm.membership_status = 'active'
    order by
      case tm.role
        when 'team_admin' then 1
        when 'team_manager' then 2
        else 3
      end,
      t.name asc
    `,
    [userId]
  );

  return {
    count: result.rows.length,
    teams: result.rows.map(team => ({
      ...team,
      role: normalizeTeamRole(team.role),
      rules_acceptance: buildRulesAcceptanceState(
        team,
        {
          rules_version: team.rules_accepted_version,
          accepted_at: team.rules_accepted_at
        }
      )
    }))
  };
}

async function getMyEvents(userId) {
  const buildMyEventsQuery = () => pool.query(
    `
    select
      e.id,
      e.team_id,
      t.name as team_name,
      e.created_by_user_id,
      e.title,
      e.description,
      e.start_at,
      e.published_at,
      e.location_name,
      e.location_address,
      e.min_players,
      e.max_players,
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
      tm.role as my_team_role,
      tm.rank_value as my_rank_value,
      tm.rank_status as my_rank_status,
      t.rank_module_enabled,
      t.rules_module_enabled,
      t.rules_version,
      rules.rules_version as my_rules_accepted_version,
      rules.accepted_at as my_rules_accepted_at,
      coalesce(stats.going_count, 0)::int as going_count,
      coalesce(stats.waiting_count, 0)::int as waiting_count,
      coalesce(stats.rank_waiting_count, 0)::int as rank_waiting_count,
      coalesce(stats.cancelled_count, 0)::int as cancelled_count,
      my_reg.registration_status as my_registration_status,
      my_reg.registered_at as my_registered_at,
      my_reg.cancelled_at as my_cancelled_at,
      my_reg.promoted_at as my_promoted_at,
      my_guest.id as my_guest_registration_id,
      my_guest.guest_name as my_guest_name,
      my_guest.registration_status as my_guest_registration_status,
      my_guest.registered_at as my_guest_registered_at,
      my_guest.cancelled_at as my_guest_cancelled_at,
      my_guest.promoted_at as my_guest_promoted_at,
      coalesce(my_reg_stats.cancelled_count, 0)::int as my_cancelled_count
    from team_members tm
    join teams t on t.id = tm.team_id
    left join lateral (
      select tra.rules_version, tra.accepted_at
      from team_rule_acceptances tra
      where tra.team_id = tm.team_id
        and tra.user_id = tm.user_id
      order by tra.accepted_at desc
      limit 1
    ) rules on true
    join events e on e.team_id = tm.team_id
    left join event_team_draws etd on etd.event_id = e.id
    left join event_settings es on es.event_id = e.id
    left join lateral (
      select
        (
          select count(*)::int
          from event_registrations er
          where er.event_id = e.id
            and er.registration_status = 'going'
        ) +
        (
          select count(*)::int
          from event_guest_registrations egr
          where egr.event_id = e.id
            and egr.registration_status = 'going'
        ) as going_count,
        (
          select count(*)::int
          from event_registrations er
          where er.event_id = e.id
            and er.registration_status = 'waiting_list'
        ) +
        (
          select count(*)::int
          from event_guest_registrations egr
          where egr.event_id = e.id
            and egr.registration_status = 'waiting_list'
        ) as waiting_count,
        (
          select count(*)::int
          from event_registrations er
          where er.event_id = e.id
            and er.registration_status = 'waiting_list_rank'
        ) as rank_waiting_count,
        (
          select count(*)::int
          from event_registrations er
          where er.event_id = e.id
            and er.registration_status = 'cancelled'
        ) +
        (
          select count(*)::int
          from event_guest_registrations egr
          where egr.event_id = e.id
            and egr.registration_status = 'cancelled'
        ) as cancelled_count
    ) stats on true
    left join lateral (
      select
        er.registration_status,
        er.registered_at,
        er.cancelled_at,
        er.promoted_at
      from event_registrations er
      where er.event_id = e.id
        and er.user_id = $1
      order by
        case er.registration_status
          when 'going' then 1
          when 'waiting_list' then 2
          when 'waiting_list_rank' then 3
          when 'cancelled' then 4
          else 5
        end,
        er.registered_at desc
      limit 1
    ) my_reg on true
    left join lateral (
      select
        egr.id,
        egr.guest_name,
        egr.registration_status,
        egr.registered_at,
        egr.cancelled_at,
        egr.promoted_at
      from event_guest_registrations egr
      where egr.event_id = e.id
        and egr.host_user_id = $1
      order by
        case egr.registration_status
          when 'going' then 1
          when 'waiting_list' then 2
          when 'cancelled' then 3
          else 4
        end,
        egr.registered_at desc
      limit 1
    ) my_guest on true
    left join lateral (
      select count(*)::int as cancelled_count
      from event_registrations er
      where er.event_id = e.id
        and er.user_id = $1
        and er.registration_status = 'cancelled'
    ) my_reg_stats on true
    where tm.user_id = $1
      and tm.membership_status = 'active'
    order by e.start_at asc, e.created_at desc
    `,
    [userId]
  );

  let result = await buildMyEventsQuery();
  let didPromote = false;
  for (const event of result.rows) {
    const reconciliation = await reconcileRankWaitingListForEvent({
      eventId: event.id,
      event
    });
    if (reconciliation.promotedToGoing > 0 || reconciliation.promotedToWaitingList > 0) {
      didPromote = true;
    }
  }
  if (didPromote) {
    result = await buildMyEventsQuery();
  }

  const rankSnapshotsByTeamId = new Map();

  const events = [];

  for (const event of result.rows) {
    let rankSnapshot = rankSnapshotsByTeamId.get(event.team_id);
    if (!rankSnapshotsByTeamId.has(event.team_id)) {
      rankSnapshot = await getMemberRankSnapshot({
        teamId: event.team_id,
        userId
      });
      rankSnapshotsByTeamId.set(event.team_id, rankSnapshot);
    }

    const readiness = buildEventReadinessSummary({
      eventStatus: event.status,
      drawStatus: event.draw_status,
      goingCount: event.going_count,
      minPlayers: event.min_players
    });
    const { registrationWindow } = await getEventRegistrationContext({
      event,
      userId
    });
    const paymentSummary = buildEventPaymentSummary(event, {
      goingCount: event.going_count,
      drawStatus: event.draw_status
    });

    events.push({
      ...event,
      my_cancelled_count: Number(event.my_cancelled_count || 0),
      registration_limit_reached: Number(event.my_cancelled_count || 0) >= 2,
      my_guest_registration: event.my_guest_registration_id
        ? {
            id: event.my_guest_registration_id,
            guest_name: event.my_guest_name,
            registration_status: event.my_guest_registration_status,
            registered_at: event.my_guest_registered_at,
            cancelled_at: event.my_guest_cancelled_at,
            promoted_at: event.my_guest_promoted_at,
            is_guest: true
          }
        : null,
      spots_left: Math.max(event.max_players - event.going_count, 0),
      is_registration_open: isRegistrationOpen(event),
      registration_window: registrationWindow,
      payment_summary: paymentSummary,
      rules_acceptance: buildRulesAcceptanceState(
        event,
        {
          rules_version: event.my_rules_accepted_version,
          accepted_at: event.my_rules_accepted_at
        }
      ),
      rank_snapshot: rankSnapshot,
      event_readiness: readiness.eventReadiness,
      requires_republish: readiness.requiresRepublish
    });
  }

  return {
    count: events.length,
    events
  };
}

async function getPlatformSummary(user) {
  if (!user || user.platform_role !== 'platform_owner') {
    throw new AppError(403, 'Ehhez a nézethez platform owner jogosultság kell.');
  }

  const [countsRes, teamsRes, eventsRes] = await Promise.all([
    pool.query(
      `
      select
        (select count(*)::int from users where status = 'active') as active_users,
        (select count(*)::int from teams where status = 'active') as active_teams,
        (select count(*)::int from events where status = 'published') as published_events,
        (select count(*)::int from event_registrations where registration_status = 'going') as active_going_registrations
      `
    ),
    pool.query(
      `
      select
        t.id,
        t.name,
        t.status,
        t.created_at,
        owner.name as owner_name,
        count(tm.id)::int as active_members
      from teams t
      left join users owner on owner.id = t.created_by_user_id
      left join team_members tm on tm.team_id = t.id and tm.membership_status = 'active'
      group by t.id, owner.name
      order by t.created_at desc
      limit 8
      `
    ),
    pool.query(
      `
      select
        e.id,
        e.team_id,
        e.title,
        e.status,
        e.start_at,
        e.created_at,
        t.name as team_name,
        coalesce(stats.going_count, 0)::int as going_count
      from events e
      join teams t on t.id = e.team_id
      left join lateral (
        select count(*) filter (where er.registration_status = 'going') as going_count
        from event_registrations er
        where er.event_id = e.id
      ) stats on true
      order by e.start_at asc nulls last, e.created_at desc
      limit 10
      `
    )
  ]);

  return {
    counts: countsRes.rows[0],
    recent_teams: teamsRes.rows,
    recent_events: eventsRes.rows
  };
}

module.exports = {
  getMyTeams,
  getMyEvents,
  getPlatformSummary
};
