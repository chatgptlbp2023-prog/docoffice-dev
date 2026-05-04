jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn()
}));

const pool = require('../src/config/db');
const { sendEmail } = require('../src/services/emailService');
const {
  REGISTRATION_PATH_ROWS,
  formatBudapestTimestamp,
  buildRegistrationNotificationContent,
  notifyRegistrationSummary
} = require('../src/services/registrationNotificationService');

describe('Registration notification service', () => {
  afterEach(async () => {
    sendEmail.mockReset();
    await pool.query('delete from registration_notification_log');
  });

  test('budapesti idobelyeget ad a targyhoz', () => {
    const formatted = formatBudapestTimestamp(new Date('2026-05-04T08:07:00.000Z'));

    expect(formatted).toBe('2026.05.04 10:07');
  });

  test('a level targya es torzse a vart bontasban epul fel', () => {
    const counts = REGISTRATION_PATH_ROWS.map(item => ({
      ...item,
      dailyCount: item.path === 'tournament_organizer' ? 2 : 0,
      totalCount: item.path === 'tournament_organizer' ? 5 : 1
    }));

    const content = buildRegistrationNotificationContent({
      counts,
      platformName: 'Foci App',
      timestampLabel: '2026.05.04 10:07'
    });

    expect(content.subject).toBe('2026.05.04 10:07 új regisztráció történt a Foci App');
    expect(content.text).toContain('tornaszervező: 2/5');
    expect(content.text).toContain('haveri csapatszervező: 0/1');
    expect(content.text).toContain('csoportos órák: 0/1');
    expect(content.text).toContain('tag: 0/1');
    expect(content.html).toContain('tornaszervező: 2/5');
  });

  test('a kuldes allapota DB-be mentodik', async () => {
    sendEmail.mockResolvedValue({
      status: 'sent',
      messageId: 'message-123'
    });

    const result = await notifyRegistrationSummary({
      createdUserEmail: 'uj@example.com',
      createdUserRegistrationPath: 'team_sport_organizer'
    });

    expect(result.status).toBe('sent');

    const logResult = await pool.query(`
      select
        created_user_email,
        created_user_registration_path,
        recipient_email,
        delivery_status,
        delivery_message_id
      from registration_notification_log
      order by created_at desc
      limit 1
    `);

    expect(logResult.rows[0]).toEqual(expect.objectContaining({
      created_user_email: 'uj@example.com',
      created_user_registration_path: 'team_sport_organizer',
      recipient_email: 'erhardtpeter.bm@gmail.com',
      delivery_status: 'sent',
      delivery_message_id: 'message-123'
    }));
  });

  test('a not_configured allapot is DB-be mentodik', async () => {
    sendEmail.mockResolvedValue({
      status: 'skipped',
      reason: 'not_configured'
    });

    const result = await notifyRegistrationSummary({
      createdUserEmail: 'nincs-smtp@example.com',
      createdUserRegistrationPath: 'activity_organizer'
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'skipped',
      reason: 'not_configured'
    }));

    const logResult = await pool.query(`
      select
        created_user_email,
        created_user_registration_path,
        delivery_status,
        delivery_reason
      from registration_notification_log
      order by created_at desc
      limit 1
    `);

    expect(logResult.rows[0]).toEqual(expect.objectContaining({
      created_user_email: 'nincs-smtp@example.com',
      created_user_registration_path: 'activity_organizer',
      delivery_status: 'skipped',
      delivery_reason: 'not_configured'
    }));
  });
});
