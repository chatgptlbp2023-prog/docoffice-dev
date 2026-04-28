const AppError = require('../utils/appError');
const { pool, withTransaction } = require('./dbService');
const { getMemberRankSnapshot } = require('./rankService');
const { normalizeTeamRole, isTeamAdminRole } = require('../utils/teamRoles');
const { buildTeamCapabilities } = require('../utils/teamCapabilities');
const {
  getTeamFinanceBalances,
  getUserFinanceOverview,
  recordManualFinanceAdjustment
} = require('./financeLedgerService');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeRole(role) {
  return normalizeTeamRole(role);
}

async function assertTeamExists(client, teamId) {
  const result = await client.query(
    `
    select id, name, status
    from teams
    where id = $1
    `,
    [teamId]
  );

  if (result.rows.length === 0) {
    throw new AppError(404, 'A csapat nem található.');
  }

  return result.rows[0];
}

async function ensureTeamMembershipActive(
  client,
  { teamId, userId, role, allowExistingActive = false }
) {
  const normalizedRole = normalizeRole(role);

  const existingMembershipResult = await client.query(
    `
    select id, membership_status, role
    from team_members
    where team_id = $1
      and user_id = $2
    order by created_at asc
    for update
    `,
    [teamId, userId]
  );

  if (existingMembershipResult.rows.length > 0) {
    const existingMembership = existingMembershipResult.rows[0];

    if (existingMembership.membership_status === 'active') {
      if (!allowExistingActive) {
        throw new AppError(409, 'A user már aktív tagja a csapatnak.');
      }

      const currentMembershipResult = await client.query(
        `
        select id, team_id, user_id, role, membership_status, joined_at
        from team_members
        where id = $1
        `,
        [existingMembership.id]
      );

      return currentMembershipResult.rows[0];
    }

    const updateResult = await client.query(
      `
      update team_members
      set role = $2,
          membership_status = 'active',
          joined_at = now(),
          updated_at = now()
      where id = $1
      returning id, team_id, user_id, role, membership_status, joined_at
      `,
      [existingMembership.id, normalizedRole]
    );

    return updateResult.rows[0];
  }

  const insertResult = await client.query(
    `
    insert into team_members (
      id,
      team_id,
      user_id,
      role,
      membership_status,
      joined_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      $1,
      $2,
      $3,
      'active',
      now(),
      now(),
      now()
    )
    returning id, team_id, user_id, role, membership_status, joined_at
    `,
    [teamId, userId, normalizedRole]
  );

  return insertResult.rows[0];
}

async function createTeam({ name, createdByUserId }) {
  const normalizedName = String(name || '').trim();

  if (!normalizedName) {
    throw new AppError(400, 'A name kötelező.');
  }

  return withTransaction(async client => {
    const teamInsert = await client.query(
      `
      insert into teams (
        id,
        name,
        created_by_user_id,
        status,
        created_at,
        updated_at
      )
      values (
        gen_random_uuid(),
        $1,
        $2,
        'active',
        now(),
        now()
      )
      returning id, name, created_by_user_id, status, created_at, updated_at
      `,
      [normalizedName, createdByUserId]
    );

    const team = teamInsert.rows[0];

    await client.query(
      `
      insert into team_members (
        id,
        team_id,
        user_id,
        role,
        membership_status,
        joined_at,
        created_at,
        updated_at
      )
      values (
        gen_random_uuid(),
        $1,
        $2,
        'team_admin',
        'active',
        now(),
        now(),
        now()
      )
      `,
      [team.id, createdByUserId]
    );

    return {
      message: 'Csapat sikeresen létrehozva.',
      team
    };
  });
}

async function getTeamById(teamId, currentUser = null) {
  const teamResult = await pool.query(
    `
    select
      t.id,
      t.name,
      t.created_by_user_id,
      t.rank_module_enabled,
      t.cash_module_enabled,
      t.status,
      t.created_at,
      t.updated_at
    from teams t
    where t.id = $1
    `,
    [teamId]
  );

  if (teamResult.rows.length === 0) {
    throw new AppError(404, 'A csapat nem található.');
  }

  const membersResult = await pool.query(
    `
    select
      tm.id as member_id,
      tm.team_id,
      tm.user_id,
      u.name,
      u.email,
      u.payment_provider,
      u.payment_username,
      u.payment_qr_data_url,
      tm.role,
      tm.membership_status,
      tm.primary_position,
      tm.is_goalkeeper,
      tm.defense_score,
      tm.attack_score,
      tm.goalkeeper_score,
      tm.rank_value,
      tm.rank_status,
      tm.joined_at
    from team_members tm
    join users u on u.id = tm.user_id
    where tm.team_id = $1
      and tm.membership_status = 'active'
    order by
      case tm.role
        when 'team_admin' then 1
        when 'team_manager' then 2
        else 3
      end,
      u.name asc
    `,
    [teamId]
  );

  const attendanceStatsResult = await pool.query(
    `
    select
      eam.user_id,
      count(*) filter (where eam.status = 'present')::int as present_count,
      count(*) filter (where eam.status = 'no_show')::int as no_show_count,
      count(*)::int as marked_count
    from event_attendance_marks eam
    where eam.team_id = $1
    group by eam.user_id
    `,
    [teamId]
  );

  const attendanceStatsByUserId = new Map(
    attendanceStatsResult.rows.map(row => [
      row.user_id,
      {
        present_count: Number(row.present_count || 0),
        no_show_count: Number(row.no_show_count || 0),
        marked_count: Number(row.marked_count || 0)
      }
    ])
  );
  const registrationStatsResult = await pool.query(
    `
    select
      er.user_id,
      count(*) filter (where er.registration_status = 'going')::int as joined_count,
      count(*) filter (where er.registration_status = 'waiting_list')::int as waiting_count,
      count(*) filter (where er.registration_status = 'waiting_list_rank')::int as rank_waiting_count,
      count(*) filter (where er.registration_status = 'cancelled')::int as cancelled_count,
      count(distinct er.event_id)::int as reacted_event_count,
      max(
        coalesce(
          er.updated_at,
          er.cancelled_at,
          er.promoted_at,
          er.registered_at,
          er.created_at
        )
      ) as last_reaction_at
    from event_registrations er
    where er.team_id = $1
    group by er.user_id
    `,
    [teamId]
  );

  const registrationStatsByUserId = new Map(
    registrationStatsResult.rows.map(row => [
      row.user_id,
      {
        joined_count: Number(row.joined_count || 0),
        waiting_count: Number(row.waiting_count || 0),
        rank_waiting_count: Number(row.rank_waiting_count || 0),
        cancelled_count: Number(row.cancelled_count || 0),
        reacted_event_count: Number(row.reacted_event_count || 0),
        last_reaction_at: row.last_reaction_at || null
      }
    ])
  );

  const nonResponseStatsResult = await pool.query(
    `
    with active_members as (
      select
        tm.user_id,
        tm.joined_at
      from team_members tm
      where tm.team_id = $1
        and tm.membership_status = 'active'
    ),
    eligible_events as (
      select
        am.user_id,
        e.id as event_id
      from active_members am
      join events e
        on e.team_id = $1
       and e.status in ('published', 'finished')
       and e.start_at < now()
       and e.start_at >= am.joined_at
    ),
    responded_events as (
      select distinct
        ee.user_id,
        ee.event_id
      from eligible_events ee
      join event_registrations er
        on er.event_id = ee.event_id
       and er.user_id = ee.user_id
    )
    select
      ee.user_id,
      count(*)::int as eligible_event_count,
      count(re.event_id)::int as responded_event_count,
      (count(*) - count(re.event_id))::int as non_response_count
    from eligible_events ee
    left join responded_events re
      on re.user_id = ee.user_id
     and re.event_id = ee.event_id
    group by ee.user_id
    `,
    [teamId]
  );

  const nonResponseStatsByUserId = new Map(
    nonResponseStatsResult.rows.map(row => [
      row.user_id,
      {
        eligible_event_count: Number(row.eligible_event_count || 0),
        responded_event_count: Number(row.responded_event_count || 0),
        non_response_count: Number(row.non_response_count || 0)
      }
    ])
  );
  const financeStatsByUserId = await getTeamFinanceBalances(pool, teamId);
  const financeEntriesResult = await pool.query(
    `
    select
      'event'::text as entry_type,
      efe.id,
      efe.team_id,
      efe.event_id,
      efe.user_id,
      efe.attendance_status,
      efe.expected_base_amount,
      efe.expected_fee_amount,
      efe.expected_total_amount,
      efe.balance_before_event,
      efe.settlement_target_amount,
      efe.actual_paid_amount,
      efe.event_delta_amount,
      efe.balance_after_event,
      efe.recorded_at,
      e.title as event_title,
      e.start_at as event_start_at,
      e.location_name as event_location_name,
      u.name as user_name,
      null::text as note
    from event_financial_entries efe
    join events e on e.id = efe.event_id
    join users u on u.id = efe.user_id
    where efe.team_id = $1

    union all

    select
      'adjustment'::text as entry_type,
      tfa.id,
      tfa.team_id,
      null::uuid as event_id,
      tfa.user_id,
      null::text as attendance_status,
      0::int as expected_base_amount,
      0::int as expected_fee_amount,
      0::int as expected_total_amount,
      tfa.balance_before_adjustment as balance_before_event,
      0::int as settlement_target_amount,
      tfa.adjustment_amount as actual_paid_amount,
      tfa.adjustment_amount as event_delta_amount,
      tfa.balance_after_adjustment as balance_after_event,
      tfa.recorded_at,
      'Külön befizetés / rendezés'::text as event_title,
      tfa.recorded_at as event_start_at,
      null::text as event_location_name,
      u.name as user_name,
      tfa.note
    from team_financial_adjustments tfa
    join users u on u.id = tfa.user_id
    where tfa.team_id = $1

    order by event_start_at desc, recorded_at desc, user_name asc
    `,
    [teamId]
  );

  const members = await Promise.all(
    membersResult.rows.map(async member => {
      const rankSnapshot = await getMemberRankSnapshot({
        teamId,
        userId: member.user_id
      });

      return {
        ...member,
        role: normalizeTeamRole(member.role),
        rank_snapshot: rankSnapshot,
        effective_rank_value: rankSnapshot?.effectiveRankValue || null,
        attendance_stats: attendanceStatsByUserId.get(member.user_id) || {
          present_count: 0,
          no_show_count: 0,
          marked_count: 0
        },
        registration_stats: {
          joined_count: 0,
          waiting_count: 0,
          rank_waiting_count: 0,
          cancelled_count: 0,
          reacted_event_count: 0,
          last_reaction_at: null,
          eligible_event_count: 0,
          responded_event_count: 0,
          non_response_count: 0,
          ...(registrationStatsByUserId.get(member.user_id) || {}),
          ...(nonResponseStatsByUserId.get(member.user_id) || {})
        },
        finance_stats: financeStatsByUserId.get(member.user_id) || {
          current_balance_amount: 0,
          credit_amount: 0,
          debt_amount: 0,
          entry_count: 0,
          total_expected_amount: 0,
          total_actual_paid_amount: 0,
          last_recorded_at: null
        }
      };
    })
  );

  const currentUserFinance =
    currentUser?.id
      ? await getUserFinanceOverview(pool, {
          teamId,
          userId: currentUser.id
        })
      : null;

  return {
    team: {
      ...teamResult.rows[0],
      capabilities: buildTeamCapabilities({
        platformRole: currentUser?.platform_role,
        teamRole: members.find(member => member.user_id === currentUser?.id)?.role || null
      })
    },
    members,
    current_user_finance: currentUserFinance,
    team_finance_entries: financeEntriesResult.rows.map(row => ({
      ...row,
      expected_base_amount: Number(row.expected_base_amount || 0),
      expected_fee_amount: Number(row.expected_fee_amount || 0),
      expected_total_amount: Number(row.expected_total_amount || 0),
      balance_before_event: Number(row.balance_before_event || 0),
      settlement_target_amount: Number(row.settlement_target_amount || 0),
      actual_paid_amount: Number(row.actual_paid_amount || 0),
      event_delta_amount: Number(row.event_delta_amount || 0),
      balance_after_event: Number(row.balance_after_event || 0)
    }))
  };
}

async function transferCaptainRole({
  teamId,
  actingUserId,
  targetUserId,
  actingPlatformRole = null
}) {
  const normalizedTargetUserId = String(targetUserId || '').trim();
  const isPlatformOwner = actingPlatformRole === 'platform_owner';

  if (!normalizedTargetUserId) {
    throw new AppError(400, 'A targetUserId kötelező.');
  }

  if (String(actingUserId) === normalizedTargetUserId) {
    throw new AppError(400, 'A kapitányi szerep nem adható át saját magadnak.');
  }

  return withTransaction(async client => {
    await assertTeamExists(client, teamId);

    if (!isPlatformOwner) {
      const captainResult = await client.query(
        `
        select id, team_id, user_id, role, membership_status
        from team_members
        where team_id = $1
          and user_id = $2
        for update
        `,
        [teamId, actingUserId]
      );

      if (captainResult.rows.length === 0) {
        throw new AppError(403, 'Nincs hozzáférésed ehhez a művelethez.');
      }

      const actingCaptain = captainResult.rows[0];

      if (actingCaptain.membership_status !== 'active' || !isTeamAdminRole(actingCaptain.role)) {
        throw new AppError(403, 'Csak az aktuális csapatkapitány adhatja át a kapitányi szerepet.');
      }
    }

    const activeCaptainsResult = await client.query(
      `
      select id, user_id
      from team_members
      where team_id = $1
        and membership_status = 'active'
        and role = 'team_admin'
      for update
      `,
      [teamId]
    );

    if (activeCaptainsResult.rows.length !== 1) {
      throw new AppError(409, 'Érvénytelen csapatállapot: pontosan egy aktív csapatkapitány szükséges a művelethez.');
    }

    const currentCaptain = activeCaptainsResult.rows[0];

    const targetResult = await client.query(
      `
      select
        tm.id,
        tm.team_id,
        tm.user_id,
        tm.role,
        tm.membership_status,
        tm.joined_at,
        u.name,
        u.email,
        u.payment_provider,
        u.payment_username,
        u.payment_qr_data_url
      from team_members tm
      join users u on u.id = tm.user_id
      where tm.team_id = $1
        and tm.user_id = $2
      for update
      `,
      [teamId, normalizedTargetUserId]
    );

    if (targetResult.rows.length === 0) {
      throw new AppError(404, 'A célzott csapattag nem található.');
    }

    const targetMember = targetResult.rows[0];

    if (targetMember.membership_status !== 'active') {
      throw new AppError(400, 'Csak aktív csapattagra ruházható át a kapitányi szerep.');
    }

    await client.query(
      `
      update team_members
      set role = 'team_manager',
          updated_at = now()
      where id = $1
      `,
      [currentCaptain.id]
    );

    const updatedTargetResult = await client.query(
      `
      update team_members
      set role = 'team_admin',
          updated_at = now()
      where id = $1
      returning id, team_id, user_id, role, membership_status, joined_at
      `,
      [targetMember.id]
    );

    return {
      message: 'Csapatkapitányi szerep sikeresen átadva.',
      team_id: teamId,
      previous_captain: {
        user_id: currentCaptain.user_id,
        role: 'team_manager'
      },
      new_captain: {
        user_id: updatedTargetResult.rows[0].user_id,
        role: updatedTargetResult.rows[0].role,
        membership_status: updatedTargetResult.rows[0].membership_status,
        joined_at: updatedTargetResult.rows[0].joined_at,
        name: targetMember.name,
        email: targetMember.email
      }
    };
  });
}

async function addTeamMember({ teamId, email, role }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = normalizeRole(role);

  if (!normalizedEmail) {
    throw new AppError(400, 'Az email kötelező.');
  }

  if (!normalizedEmail.includes('@')) {
    throw new AppError(400, 'Érvénytelen email cím.');
  }

  if (!['member', 'team_manager'].includes(normalizedRole)) {
    throw new AppError(400, 'A role csak member vagy team_manager lehet.');
  }

  return withTransaction(async client => {
    await assertTeamExists(client, teamId);

    const userResult = await client.query(
      `
      select id, name, email, status
      from users
      where lower(email) = $1
      `,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      throw new AppError(404, 'Nincs ilyen emaillel user.');
    }

    const user = userResult.rows[0];

    if (user.status !== 'active') {
      throw new AppError(400, 'A user nem aktív.');
    }

    const membership = await ensureTeamMembershipActive(client, {
      teamId,
      userId: user.id,
      role: normalizedRole
    });

    return {
      message: 'Tag sikeresen hozzáadva a csapathoz.',
      member: {
        member_id: membership.id,
        team_id: membership.team_id,
        user_id: membership.user_id,
        name: user.name,
        email: user.email,
        role: membership.role,
        membership_status: membership.membership_status,
        joined_at: membership.joined_at
      }
    };
  });
}

async function updateTeamMember({ teamId, memberId, role }) {
  const normalizedRole = normalizeRole(role);

  if (!['member', 'team_manager', 'team_admin'].includes(normalizedRole)) {
    throw new AppError(400, 'A role csak member, team_manager vagy team_admin lehet.');
  }

  return withTransaction(async client => {
    await assertTeamExists(client, teamId);

    const memberResult = await client.query(
      `
      select
        tm.id,
        tm.team_id,
        tm.user_id,
        tm.role,
        tm.membership_status,
        tm.joined_at,
        u.name,
        u.email,
        u.payment_provider,
        u.payment_username,
        u.payment_qr_data_url
      from team_members tm
      join users u on u.id = tm.user_id
      where tm.team_id = $1
        and tm.id = $2
      for update
      `,
      [teamId, memberId]
    );

    if (memberResult.rows.length === 0) {
      throw new AppError(404, 'A csapattag nem található.');
    }

    const member = memberResult.rows[0];

    if (member.membership_status !== 'active') {
      throw new AppError(400, 'Csak aktív tag szerkeszthető.');
    }

    if (normalizeTeamRole(member.role) === 'team_admin') {
      throw new AppError(400, 'Az aktuális csapatkapitány szerepköre itt nem módosítható.');
    }

    const updateResult = await client.query(
      `
      update team_members
      set role = $2,
          updated_at = now()
      where id = $1
      returning id, team_id, user_id, role, membership_status, joined_at
      `,
      [memberId, normalizedRole]
    );

    const updated = updateResult.rows[0];

    return {
      message: 'Csapattag szerepköre frissítve.',
      member: {
        member_id: updated.id,
        team_id: updated.team_id,
        user_id: updated.user_id,
        name: member.name,
        email: member.email,
        role: updated.role,
        membership_status: updated.membership_status,
        joined_at: updated.joined_at
      }
    };
  });
}

async function removeTeamMember({ teamId, memberId }) {
  return withTransaction(async client => {
    await assertTeamExists(client, teamId);

    const memberResult = await client.query(
      `
      select
        tm.id,
        tm.team_id,
        tm.user_id,
        tm.role,
        tm.membership_status,
        tm.joined_at,
        u.name,
        u.email
      from team_members tm
      join users u on u.id = tm.user_id
      where tm.team_id = $1
        and tm.id = $2
      for update
      `,
      [teamId, memberId]
    );

    if (memberResult.rows.length === 0) {
      throw new AppError(404, 'A csapattag nem található.');
    }

    const member = memberResult.rows[0];

    if (member.membership_status !== 'active') {
      throw new AppError(400, 'A csapattag már nem aktív.');
    }

    if (normalizeTeamRole(member.role) === 'team_admin') {
      throw new AppError(400, 'A csapatkapitány nem távolítható el ezen a felületen.');
    }

    const updateResult = await client.query(
      `
      update team_members
      set membership_status = 'inactive',
          updated_at = now()
      where id = $1
      returning id, team_id, user_id, role, membership_status, joined_at
      `,
      [memberId]
    );

    const updated = updateResult.rows[0];

    return {
      message: 'Csapattag eltávolítva a csapatból.',
      member: {
        member_id: updated.id,
        team_id: updated.team_id,
        user_id: updated.user_id,
        name: member.name,
        email: member.email,
        role: updated.role,
        membership_status: updated.membership_status,
        joined_at: updated.joined_at
      }
    };
  });
}

async function addFinanceAdjustment({
  teamId,
  targetUserId,
  adjustmentAmount,
  note = null,
  recordedByUserId
}) {
  return withTransaction(async client => {
    await assertTeamExists(client, teamId);

    const memberResult = await client.query(
      `
      select tm.user_id, tm.membership_status, u.name
      from team_members tm
      join users u on u.id = tm.user_id
      where tm.team_id = $1
        and tm.user_id = $2
      for update
      `,
      [teamId, targetUserId]
    );

    if (memberResult.rows.length === 0) {
      throw new AppError(404, 'A célzott csapattag nem található.');
    }

    const member = memberResult.rows[0];

    if (member.membership_status !== 'active') {
      throw new AppError(400, 'Csak aktív tagnak rögzíthető külön befizetés.');
    }

    await recordManualFinanceAdjustment(client, {
      teamId,
      userId: targetUserId,
      adjustmentAmount,
      note,
      recordedByUserId
    });

    const financeOverview = await getUserFinanceOverview(client, {
      teamId,
      userId: targetUserId
    });

    return {
      message: 'Külön befizetés sikeresen rögzítve.',
      finance: financeOverview,
      member: {
        user_id: member.user_id,
        name: member.name
      }
    };
  });
}

module.exports = {
  normalizeEmail,
  normalizeRole,
  assertTeamExists,
  ensureTeamMembershipActive,
  createTeam,
  getTeamById,
  transferCaptainRole,
  addTeamMember,
  updateTeamMember,
  removeTeamMember,
  addFinanceAdjustment
};
