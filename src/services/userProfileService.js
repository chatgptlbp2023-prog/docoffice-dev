const pool = require('../config/db');

function buildAttendanceStats(row = {}) {
  return {
    present_count: Number(row.present_count || 0),
    no_show_count: Number(row.no_show_count || 0),
    marked_count: Number(row.marked_count || 0)
  };
}

async function getAttendanceStatsForUser(userId) {
  const result = await pool.query(
    `
    select
      count(*) filter (where eam.status = 'present')::int as present_count,
      count(*) filter (where eam.status = 'no_show')::int as no_show_count,
      count(*)::int as marked_count
    from event_attendance_marks eam
    where eam.user_id = $1
    `,
    [userId]
  );

  return buildAttendanceStats(result.rows[0] || {});
}

async function getUserByIdWithStats(userId) {
  const userResult = await pool.query(
    `
    select id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team
    from users
    where id = $1
    `,
    [userId]
  );

  if (userResult.rows.length === 0) {
    return null;
  }

  return {
    ...userResult.rows[0],
    attendance_stats: await getAttendanceStatsForUser(userId)
  };
}

module.exports = {
  buildAttendanceStats,
  getAttendanceStatsForUser,
  getUserByIdWithStats
};
