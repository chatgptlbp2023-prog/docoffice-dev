const AppError = require('../utils/appError');
const { withTransaction } = require('./dbService');
const { buildEventPaymentSummary } = require('../utils/eventPricing');
const { upsertFinanceEntryForAttendance } = require('./financeLedgerService');

const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: 'present',
  NO_SHOW: 'no_show'
});

function normalizeAttendanceStatus(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  return value.trim().toLowerCase();
}

async function setEventAttendanceStatus({
  eventId,
  targetUserId,
  status,
  paymentAmount = null,
  note = null,
  markedByUserId
}) {
  const normalizedStatus = normalizeAttendanceStatus(status);
  const normalizedPaymentAmount =
    paymentAmount == null || paymentAmount === ''
      ? null
      : Number.isInteger(Number(paymentAmount)) && Number(paymentAmount) >= 0
        ? Number(paymentAmount)
        : NaN;

  if (!Object.values(ATTENDANCE_STATUS).includes(normalizedStatus)) {
    throw new AppError(400, 'Az attendance status csak present vagy no_show lehet.');
  }

  if (Number.isNaN(normalizedPaymentAmount)) {
    throw new AppError(400, 'A paymentAmount csak 0 vagy annal nagyobb egesz szam lehet.');
  }

  if (!targetUserId) {
    throw new AppError(400, 'A targetUserId kotelezo.');
  }

  if (!markedByUserId) {
    throw new AppError(400, 'A markedByUserId kotelezo.');
  }

  return withTransaction(async client => {
    const eventResult = await client.query(
      `
      select
        e.id,
        e.team_id,
        e.status,
        e.start_at
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
    const eventStartMs = new Date(event.start_at).getTime();
    const isPastPublishedEvent =
      event.status === 'published' &&
      Number.isFinite(eventStartMs) &&
      eventStartMs <= Date.now();

    if (event.status !== 'finished' && !isPastPublishedEvent) {
      throw new AppError(400, 'Jelenlet vagy no-show csak megvalosult esemenynel rogzitheto.');
    }

    const eventPricingResult = await client.query(
      `
      select
        etd.status as draw_status,
        es.pricing_mode,
        es.fixed_price_per_person,
        es.total_event_cost,
        es.per_player_fee,
        es.price_per_player,
        coalesce(stats.going_count, 0)::int as going_count
      from events e
      left join event_team_draws etd on etd.event_id = e.id
      left join event_settings es on es.event_id = e.id
      left join lateral (
        select count(*) filter (where er.registration_status = 'going') as going_count
        from event_registrations er
        where er.event_id = e.id
      ) stats on true
      where e.id = $1
      `,
      [eventId]
    );

    const eventPricing = eventPricingResult.rows[0] || {};
    const paymentSummary = buildEventPaymentSummary(
      {
        ...event,
        ...eventPricing
      },
      {
      goingCount: eventPricing.going_count,
      drawStatus: eventPricing.draw_status
      }
    );

    const registrationResult = await client.query(
      `
      select id, registration_status, registered_at
      from event_registrations
      where event_id = $1
        and user_id = $2
        and registration_status = 'going'
      order by registered_at desc
      limit 1
      for update
      `,
      [eventId, targetUserId]
    );

    if (registrationResult.rows.length === 0) {
      throw new AppError(
        400,
        'Csak going statuszu jatekos jelolheto jelenletre vagy no-show-ra.'
      );
    }

    const existingAttendanceResult = await client.query(
      `
      select payment_amount
      from event_attendance_marks
      where event_id = $1
        and user_id = $2
      for update
      `,
      [eventId, targetUserId]
    );
    const existingPaymentAmount = Number(existingAttendanceResult.rows[0]?.payment_amount);
    const effectivePaymentAmount =
      normalizedStatus === ATTENDANCE_STATUS.NO_SHOW
        ? 0
        : normalizedPaymentAmount == null
          ? (Number.isFinite(existingPaymentAmount) ? existingPaymentAmount : 0)
          : normalizedPaymentAmount;

    const upsertResult = await client.query(
      `
      insert into event_attendance_marks (
        event_id,
        team_id,
        user_id,
        status,
        note,
        payment_amount,
        payment_recorded_at,
        marked_by_user_id,
        marked_at,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6::integer, case when $6::integer is null then null else now() end, $7, now(), now(), now())
      on conflict (event_id, user_id)
      do update
      set status = excluded.status,
          note = excluded.note,
          payment_amount = case
            when excluded.status = 'no_show' then null
            when excluded.payment_amount is null then event_attendance_marks.payment_amount
            else excluded.payment_amount
          end,
          payment_recorded_at = case
            when excluded.status = 'no_show' then null
            when excluded.payment_amount is null then event_attendance_marks.payment_recorded_at
            else excluded.payment_recorded_at
          end,
          marked_by_user_id = excluded.marked_by_user_id,
          marked_at = now(),
          updated_at = now()
      returning *
      `,
      [
        eventId,
        event.team_id,
        targetUserId,
        normalizedStatus,
        note || null,
        normalizedPaymentAmount,
        markedByUserId
      ]
    );

    await upsertFinanceEntryForAttendance(client, {
      event: {
        ...event,
        ...eventPricing,
        ...paymentSummary
      },
      targetUserId,
      attendanceStatus: normalizedStatus,
      actualPaidAmount: effectivePaymentAmount,
      recordedByUserId: markedByUserId
    });

    const summaryResult = await client.query(
      `
      select
        count(*) filter (where eam.status = 'present')::int as present_count,
        count(*) filter (where eam.status = 'no_show')::int as no_show_count,
        coalesce(sum(eam.payment_amount), 0)::int as total_paid_amount
      from event_attendance_marks eam
      where eam.event_id = $1
      `,
      [eventId]
    );

    return {
      message:
        normalizedStatus === ATTENDANCE_STATUS.NO_SHOW
          ? 'Nem jelent meg allapot sikeresen rogzitve.'
          : normalizedPaymentAmount == null
            ? 'Jelenlet sikeresen rogzitve.'
            : 'Befizetes sikeresen rogzitve.',
      attendance: upsertResult.rows[0],
      summary: summaryResult.rows[0]
    };
  });
}

module.exports = {
  ATTENDANCE_STATUS,
  normalizeAttendanceStatus,
  setEventAttendanceStatus
};
