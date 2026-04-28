const AppError = require('../utils/appError');
const { buildEventPaymentSummary } = require('../utils/eventPricing');

function normalizeMoneyInt(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.round(numeric);
}

function buildFinanceSnapshot({
  attendanceStatus,
  actualPaidAmount,
  paymentSummary,
  balanceBeforeEvent = 0
}) {
  const normalizedStatus = String(attendanceStatus || '').trim().toLowerCase();
  const balanceBefore = normalizeMoneyInt(balanceBeforeEvent, 0);
  const actualPaid = normalizeMoneyInt(actualPaidAmount, 0);
  const isPresent = normalizedStatus === 'present';

  const expectedBaseAmount = isPresent
    ? normalizeMoneyInt(paymentSummary?.base_amount_per_person, 0)
    : 0;
  const expectedFeeAmount = isPresent
    ? normalizeMoneyInt(paymentSummary?.per_player_fee, 0)
    : 0;
  const expectedTotalAmount = isPresent
    ? normalizeMoneyInt(
        paymentSummary?.final_amount_per_person,
        expectedBaseAmount + expectedFeeAmount
      )
    : 0;
  const settlementTargetAmount = isPresent
    ? Math.max(expectedTotalAmount - balanceBefore, 0)
    : 0;
  const eventDeltaAmount = actualPaid - expectedTotalAmount;
  const balanceAfterEvent = balanceBefore + eventDeltaAmount;

  return {
    expectedBaseAmount,
    expectedFeeAmount,
    expectedTotalAmount,
    balanceBeforeEvent: balanceBefore,
    settlementTargetAmount,
    actualPaidAmount: actualPaid,
    eventDeltaAmount,
    balanceAfterEvent
  };
}

async function recalculateLedgerForUser(client, { teamId, userId }) {
  const result = await client.query(
    `
    select
      'event'::text as entry_type,
      efe.id,
      efe.attendance_status,
      efe.actual_paid_amount,
      efe.expected_total_amount,
      coalesce(efe.recorded_at, efe.created_at) as occurred_at,
      e.start_at as event_start_at
    from event_financial_entries efe
    join events e on e.id = efe.event_id
    where efe.team_id = $1
      and efe.user_id = $2

    union all

    select
      'adjustment'::text as entry_type,
      tfa.id,
      null::text as attendance_status,
      tfa.adjustment_amount as actual_paid_amount,
      0::integer as expected_total_amount,
      coalesce(tfa.recorded_at, tfa.created_at) as occurred_at,
      null::timestamptz as event_start_at
    from team_financial_adjustments tfa
    where tfa.team_id = $1
      and tfa.user_id = $2
    order by occurred_at asc, event_start_at asc nulls last, id asc
    `,
    [teamId, userId]
  );

  let runningBalance = 0;

  for (const row of result.rows) {
    if (row.entry_type === 'event') {
      const settlementTargetAmount =
        row.attendance_status === 'present'
          ? Math.max(normalizeMoneyInt(row.expected_total_amount, 0) - runningBalance, 0)
          : 0;
      const actualPaidAmount = normalizeMoneyInt(row.actual_paid_amount, 0);
      const expectedTotalAmount = normalizeMoneyInt(row.expected_total_amount, 0);
      const eventDeltaAmount = actualPaidAmount - expectedTotalAmount;
      const balanceBeforeEvent = runningBalance;
      const balanceAfterEvent = balanceBeforeEvent + eventDeltaAmount;

      await client.query(
        `
        update event_financial_entries
        set balance_before_event = $2,
            settlement_target_amount = $3,
            event_delta_amount = $4,
            balance_after_event = $5,
            updated_at = now()
        where id = $1
        `,
        [
          row.id,
          balanceBeforeEvent,
          settlementTargetAmount,
          eventDeltaAmount,
          balanceAfterEvent
        ]
      );

      runningBalance = balanceAfterEvent;
      continue;
    }

    const adjustmentAmount = normalizeMoneyInt(row.actual_paid_amount, 0);
    const balanceBeforeAdjustment = runningBalance;
    const balanceAfterAdjustment = balanceBeforeAdjustment + adjustmentAmount;

    await client.query(
      `
      update team_financial_adjustments
      set balance_before_adjustment = $2,
          balance_after_adjustment = $3,
          updated_at = now()
      where id = $1
      `,
      [row.id, balanceBeforeAdjustment, balanceAfterAdjustment]
    );

    runningBalance = balanceAfterAdjustment;
  }
}

async function upsertFinanceEntryForAttendance(
  client,
  {
    event,
    targetUserId,
    attendanceStatus,
    actualPaidAmount,
    recordedByUserId
  }
) {
  const paymentSummary = buildEventPaymentSummary(event, {
    goingCount: normalizeMoneyInt(event.going_count, 0),
    drawStatus: event.draw_status || null
  });

  const snapshot = buildFinanceSnapshot({
    attendanceStatus,
    actualPaidAmount,
    paymentSummary,
    balanceBeforeEvent: 0
  });

  await client.query(
    `
    insert into event_financial_entries (
      id,
      team_id,
      event_id,
      user_id,
      attendance_status,
      expected_base_amount,
      expected_fee_amount,
      expected_total_amount,
      balance_before_event,
      settlement_target_amount,
      actual_paid_amount,
      event_delta_amount,
      balance_after_event,
      recorded_by_user_id,
      recorded_at,
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
      now(),
      now(),
      now()
    )
    on conflict (event_id, user_id)
    do update
    set attendance_status = excluded.attendance_status,
        expected_base_amount = excluded.expected_base_amount,
        expected_fee_amount = excluded.expected_fee_amount,
        expected_total_amount = excluded.expected_total_amount,
        actual_paid_amount = excluded.actual_paid_amount,
        recorded_by_user_id = excluded.recorded_by_user_id,
        recorded_at = now(),
        updated_at = now()
    `,
    [
      event.team_id,
      event.id,
      targetUserId,
      attendanceStatus,
      snapshot.expectedBaseAmount,
      snapshot.expectedFeeAmount,
      snapshot.expectedTotalAmount,
      snapshot.balanceBeforeEvent,
      snapshot.settlementTargetAmount,
      snapshot.actualPaidAmount,
      snapshot.eventDeltaAmount,
      snapshot.balanceAfterEvent,
      recordedByUserId
    ]
  );

  await recalculateLedgerForUser(client, {
    teamId: event.team_id,
    userId: targetUserId
  });
}

async function recordManualFinanceAdjustment(
  client,
  { teamId, userId, adjustmentAmount, note = null, recordedByUserId }
) {
  const amount = normalizeMoneyInt(adjustmentAmount, NaN);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, 'Az adjustmentAmount csak 0-nál nagyobb egész szám lehet.');
  }

  await client.query(
    `
    insert into team_financial_adjustments (
      id,
      team_id,
      user_id,
      adjustment_amount,
      note,
      balance_before_adjustment,
      balance_after_adjustment,
      recorded_by_user_id,
      recorded_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      $1,
      $2,
      $3,
      $4,
      0,
      0,
      $5,
      now(),
      now(),
      now()
    )
    `,
    [teamId, userId, amount, note || null, recordedByUserId]
  );

  await recalculateLedgerForUser(client, { teamId, userId });
}

async function getTeamFinanceBalances(clientOrPool, teamId) {
  const result = await clientOrPool.query(
    `
    with ledger_entries as (
      select
        efe.user_id,
        coalesce(efe.balance_after_event, 0)::int as balance_after_amount,
        coalesce(efe.recorded_at, efe.created_at) as occurred_at
      from event_financial_entries efe
      where efe.team_id = $1

      union all

      select
        tfa.user_id,
        coalesce(tfa.balance_after_adjustment, 0)::int as balance_after_amount,
        coalesce(tfa.recorded_at, tfa.created_at) as occurred_at
      from team_financial_adjustments tfa
      where tfa.team_id = $1
    ),
    latest_balance as (
      select distinct on (le.user_id)
        le.user_id,
        le.balance_after_amount as current_balance_amount,
        le.occurred_at as last_recorded_at
      from ledger_entries le
      order by le.user_id, le.occurred_at desc
    ),
    event_totals as (
      select
        efe.user_id,
        count(*)::int as entry_count,
        coalesce(sum(efe.expected_total_amount), 0)::int as total_expected_amount,
        coalesce(sum(efe.actual_paid_amount), 0)::int as total_actual_paid_amount
      from event_financial_entries efe
      where efe.team_id = $1
      group by efe.user_id
    ),
    adjustment_totals as (
      select
        tfa.user_id,
        count(*)::int as adjustment_count,
        coalesce(sum(tfa.adjustment_amount), 0)::int as total_adjustment_amount
      from team_financial_adjustments tfa
      where tfa.team_id = $1
      group by tfa.user_id
    ),
    users_union as (
      select user_id from latest_balance
      union
      select user_id from event_totals
      union
      select user_id from adjustment_totals
    )
    select
      uu.user_id,
      coalesce(lb.current_balance_amount, 0)::int as current_balance_amount,
      coalesce(et.entry_count, 0)::int as entry_count,
      coalesce(et.total_expected_amount, 0)::int as total_expected_amount,
      coalesce(et.total_actual_paid_amount, 0)::int as total_actual_paid_amount,
      coalesce(at.adjustment_count, 0)::int as adjustment_count,
      coalesce(at.total_adjustment_amount, 0)::int as total_adjustment_amount,
      lb.last_recorded_at
    from users_union uu
    left join latest_balance lb on lb.user_id = uu.user_id
    left join event_totals et on et.user_id = uu.user_id
    left join adjustment_totals at on at.user_id = uu.user_id
    order by uu.user_id
    `,
    [teamId]
  );

  return new Map(
    result.rows.map(row => [
      row.user_id,
      {
        current_balance_amount: normalizeMoneyInt(row.current_balance_amount, 0),
        credit_amount: Math.max(normalizeMoneyInt(row.current_balance_amount, 0), 0),
        debt_amount: Math.max(-normalizeMoneyInt(row.current_balance_amount, 0), 0),
        entry_count: Number(row.entry_count || 0),
        adjustment_count: Number(row.adjustment_count || 0),
        total_expected_amount: normalizeMoneyInt(row.total_expected_amount, 0),
        total_actual_paid_amount: normalizeMoneyInt(row.total_actual_paid_amount, 0),
        total_adjustment_amount: normalizeMoneyInt(row.total_adjustment_amount, 0),
        last_recorded_at: row.last_recorded_at || null
      }
    ])
  );
}

async function getUserFinanceOverview(clientOrPool, { teamId, userId }) {
  const entriesResult = await clientOrPool.query(
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
      efe.balance_before_event as balance_before_amount,
      efe.settlement_target_amount,
      efe.actual_paid_amount,
      efe.event_delta_amount as delta_amount,
      efe.balance_after_event as balance_after_amount,
      efe.recorded_at,
      e.title as event_title,
      e.start_at as event_start_at,
      e.location_name as event_location_name,
      null::text as note
    from event_financial_entries efe
    join events e on e.id = efe.event_id
    where efe.team_id = $1
      and efe.user_id = $2

    union all

    select
      'adjustment'::text as entry_type,
      tfa.id,
      tfa.team_id,
      null::uuid as event_id,
      tfa.user_id,
      null::text as attendance_status,
      0::integer as expected_base_amount,
      0::integer as expected_fee_amount,
      0::integer as expected_total_amount,
      tfa.balance_before_adjustment as balance_before_amount,
      0::integer as settlement_target_amount,
      tfa.adjustment_amount as actual_paid_amount,
      tfa.adjustment_amount as delta_amount,
      tfa.balance_after_adjustment as balance_after_amount,
      tfa.recorded_at,
      'Külön befizetés / rendezés'::text as event_title,
      tfa.recorded_at as event_start_at,
      null::text as event_location_name,
      tfa.note
    from team_financial_adjustments tfa
    where tfa.team_id = $1
      and tfa.user_id = $2
    order by recorded_at desc, id desc
    `,
    [teamId, userId]
  );

  const entries = entriesResult.rows.map(row => ({
    ...row,
    expected_base_amount: normalizeMoneyInt(row.expected_base_amount, 0),
    expected_fee_amount: normalizeMoneyInt(row.expected_fee_amount, 0),
    expected_total_amount: normalizeMoneyInt(row.expected_total_amount, 0),
    balance_before_amount: normalizeMoneyInt(row.balance_before_amount, 0),
    balance_before_event: normalizeMoneyInt(row.balance_before_amount, 0),
    settlement_target_amount: normalizeMoneyInt(row.settlement_target_amount, 0),
    actual_paid_amount: normalizeMoneyInt(row.actual_paid_amount, 0),
    delta_amount: normalizeMoneyInt(row.delta_amount, 0),
    event_delta_amount: normalizeMoneyInt(row.delta_amount, 0),
    balance_after_amount: normalizeMoneyInt(row.balance_after_amount, 0),
    balance_after_event: normalizeMoneyInt(row.balance_after_amount, 0)
  }));

  const latestEntry = entries[0] || null;
  const currentBalanceAmount = normalizeMoneyInt(latestEntry?.balance_after_amount, 0);

  return {
    current_balance_amount: currentBalanceAmount,
    credit_amount: Math.max(currentBalanceAmount, 0),
    debt_amount: Math.max(-currentBalanceAmount, 0),
    entry_count: entries.filter(item => item.entry_type === 'event').length,
    adjustment_count: entries.filter(item => item.entry_type === 'adjustment').length,
    total_expected_amount: entries
      .filter(item => item.entry_type === 'event')
      .reduce((sum, item) => sum + item.expected_total_amount, 0),
    total_actual_paid_amount: entries.reduce((sum, item) => sum + item.actual_paid_amount, 0),
    total_adjustment_amount: entries
      .filter(item => item.entry_type === 'adjustment')
      .reduce((sum, item) => sum + item.actual_paid_amount, 0),
    last_recorded_at: latestEntry?.recorded_at || null,
    entries
  };
}

module.exports = {
  buildFinanceSnapshot,
  recalculateLedgerForUser,
  upsertFinanceEntryForAttendance,
  recordManualFinanceAdjustment,
  getTeamFinanceBalances,
  getUserFinanceOverview
};
