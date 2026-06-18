const { pool } = require('./dbService');
const { sendEmail } = require('./emailService');
const {
  TEAM_BREAK_EMAIL_ACTIONS,
  buildTeamBreakActionToken,
  buildTeamBreakActionUrl
} = require('./teamBreakActionService');
const { normalizeAppBaseUrl } = require('./eventEmailActionService');

function formatBreakDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('hu-HU', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildBreakReminderEmail(member) {
  const appBaseUrl = normalizeAppBaseUrl(process.env.APP_BASE_URL || '');
  const extendUrl = buildTeamBreakActionUrl(
    buildTeamBreakActionToken({
      teamId: member.team_id,
      userId: member.user_id,
      action: TEAM_BREAK_EMAIL_ACTIONS.EXTEND_ONE_WEEK
    }),
    appBaseUrl
  );
  const returnUrl = buildTeamBreakActionUrl(
    buildTeamBreakActionToken({
      teamId: member.team_id,
      userId: member.user_id,
      action: TEAM_BREAK_EMAIL_ACTIONS.END_BREAK
    }),
    appBaseUrl
  );
  const name = member.name || 'Játékos';
  const subject = 'Még mindig szabin vagy?';
  const intro = `Egy hete szabin vagy a(z) ${member.team_name} csapatban.`;
  const question = 'Még mindig kimaradnál az eseményértesítésekből?';
  const breakUntilLabel = formatBreakDate(member.break_until);
  const text = [
    `Szia ${name}!`,
    '',
    intro,
    question,
    `Jelenlegi szabi vége: ${breakUntilLabel}`,
    '',
    `Maradok szabin még 1 hétig: ${extendUrl}`,
    `Visszatérek aktívnak: ${returnUrl}`
  ].join('\n');
  const button = (label, href, background) => `
    <a href="${escapeHtml(href)}" style="display:inline-block;background:${escapeHtml(background)};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:800;margin-right:8px;margin-bottom:8px;">
      ${escapeHtml(label)}
    </a>
  `;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#1f2937;">
      <h2 style="margin-bottom:12px;">Még mindig szabin vagy?</h2>
      <p>Szia <strong>${escapeHtml(name)}</strong>!</p>
      <p>${escapeHtml(intro)}<br />${escapeHtml(question)}</p>
      <p style="color:#64748b;">Jelenlegi szabi vége: ${escapeHtml(breakUntilLabel)}</p>
      <div style="margin:20px 0 12px;">
        ${button('Maradok szabin még 1 hétig', extendUrl, '#64748b')}
        ${button('Visszatérek aktívnak', returnUrl, '#16a34a')}
      </div>
    </div>
  `;

  return { subject, text, html };
}

async function listDueBreakReminderMembers({ now = new Date() } = {}) {
  const result = await pool.query(
    `
    select
      tm.team_id,
      tm.user_id,
      tm.break_started_at,
      tm.break_until,
      tm.break_extensions_count,
      tm.break_reminder_sent_at,
      t.name as team_name,
      u.name,
      lower(u.email) as email
    from team_members tm
    join teams t on t.id = tm.team_id
    join users u on u.id = tm.user_id
    where tm.membership_status = 'active'
      and tm.passive_since is null
      and tm.break_until is not null
      and tm.break_until <= ($1::timestamptz + interval '24 hours')
      and tm.break_reminder_sent_at is null
      and nullif(trim(u.email), '') is not null
    order by tm.break_until asc
    `,
    [now.toISOString()]
  );

  return result.rows;
}

async function sendDueBreakReminders({ now = new Date() } = {}) {
  const dueMembers = await listDueBreakReminderMembers({ now });
  const deliveries = [];

  for (const member of dueMembers) {
    try {
      const email = buildBreakReminderEmail(member);
      const delivery = await sendEmail({
        to: member.email,
        subject: email.subject,
        text: email.text,
        html: email.html
      });

      await pool.query(
        `
        update team_members
        set break_reminder_sent_at = now(),
            updated_at = now()
        where team_id = $1
          and user_id = $2
          and membership_status = 'active'
        `,
        [member.team_id, member.user_id]
      );

      deliveries.push({
        teamId: member.team_id,
        userId: member.user_id,
        email: member.email,
        ...delivery
      });
    } catch (error) {
      console.error('Team break reminder email hiba:', error);
      await pool.query(
        `
        update team_members
        set break_reminder_sent_at = now(),
            updated_at = now()
        where team_id = $1
          and user_id = $2
          and membership_status = 'active'
        `,
        [member.team_id, member.user_id]
      );
      deliveries.push({
        teamId: member.team_id,
        userId: member.user_id,
        email: member.email,
        status: 'failed',
        reason: 'send_error',
        error: error.message
      });
    }
  }

  return {
    checkedAt: now.toISOString(),
    dueCount: dueMembers.length,
    sentCount: deliveries.filter(item => item.status === 'sent').length,
    failedCount: deliveries.filter(item => item.status === 'failed').length,
    deliveries
  };
}

async function markPassiveMembersByNonResponse({ teamId = null, now = new Date(), threshold = 5 } = {}) {
  const params = [now.toISOString(), Number(threshold) || 5];
  const teamFilter = teamId ? 'and tm.team_id = $3' : '';
  if (teamId) params.push(teamId);

  const result = await pool.query(
    `
    with active_members as (
      select
        tm.id,
        tm.team_id,
        tm.user_id,
        tm.joined_at,
        tm.break_started_at,
        tm.break_until
      from team_members tm
      where tm.membership_status = 'active'
        and tm.passive_since is null
        ${teamFilter}
    ),
    eligible_events as (
      select
        am.id as member_id,
        am.team_id,
        am.user_id,
        e.id as event_id,
        coalesce(e.published_at, e.created_at, e.start_at) as notification_at
      from active_members am
      join events e
        on e.team_id = am.team_id
       and e.status in ('published', 'finished')
       and e.start_at < $1::timestamptz
       and e.start_at >= am.joined_at
       and not (
         am.break_started_at is not null
         and am.break_until is not null
         and coalesce(e.published_at, e.created_at, e.start_at) >= am.break_started_at
         and coalesce(e.published_at, e.created_at, e.start_at) < am.break_until
       )
    ),
    responded_events as (
      select distinct ee.member_id, ee.event_id
      from eligible_events ee
      join event_registrations er
        on er.event_id = ee.event_id
       and er.user_id = ee.user_id
      union
      select distinct ee.member_id, ee.event_id
      from eligible_events ee
      join event_email_action_log log
        on log.event_id = ee.event_id
       and log.user_id = ee.user_id
       and log.action in ('register', 'skip', 'vacation_one_week')
       and log.status <> 'error'
    ),
    non_response_counts as (
      select
        ee.member_id,
        count(*) filter (where re.event_id is null)::int as non_response_count
      from eligible_events ee
      left join responded_events re
        on re.member_id = ee.member_id
       and re.event_id = ee.event_id
      group by ee.member_id
    ),
    updated as (
      update team_members tm
      set passive_since = $1::timestamptz,
          passive_reason = 'auto_non_response_5',
          break_started_at = null,
          break_until = null,
          break_extensions_count = 0,
          break_reminder_sent_at = null,
          updated_at = now()
      from non_response_counts nrc
      where tm.id = nrc.member_id
        and nrc.non_response_count >= $2::int
      returning tm.id, tm.team_id, tm.user_id, nrc.non_response_count
    )
    select * from updated
    `,
    params
  );

  return {
    checkedAt: now.toISOString(),
    passiveCount: result.rows.length,
    members: result.rows
  };
}

module.exports = {
  buildBreakReminderEmail,
  listDueBreakReminderMembers,
  sendDueBreakReminders,
  markPassiveMembersByNonResponse
};
