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

  test('budapesti időbélyeget ad a tárgyhoz', () => {
    const formatted = formatBudapestTimestamp(new Date('2026-05-04T08:07:00.000Z'));

    expect(formatted).toBe('2026.05.04 10:07');
  });

  test('a levél tárgya és törzse a várt bontásban épül fel napi email listával', () => {
    const counts = REGISTRATION_PATH_ROWS.map(item => {
      if (item.path === 'team_sport_organizer') {
        return {
          ...item,
          dailyCount: 1,
          totalCount: 2,
          dailyEmails: ['emailx@example.com']
        };
      }

      if (item.path === 'invited_participant') {
        return {
          ...item,
          dailyCount: 2,
          totalCount: 2,
          dailyEmails: ['email1@example.com', 'email2@example.com']
        };
      }

      return {
        ...item,
        dailyCount: 0,
        totalCount: 0,
        dailyEmails: []
      };
    });

    const content = buildRegistrationNotificationContent({
      counts,
      platformName: 'Foci App',
      timestampLabel: '2026.05.04 10:07'
    });

    expect(content.subject).toBe('2026.05.04 10:07 új regisztráció történt a Foci App');
    expect(content.text).toContain('tornaszervező: 0/0');
    expect(content.text).toContain('haveri csapatszervező: 1/2');
    expect(content.text).toContain('emailx@example.com');
    expect(content.text).toContain('csoportos órák: 0/0');
    expect(content.text).toContain('tag: 2/2');
    expect(content.text).toContain('email1@example.com');
    expect(content.text).toContain('email2@example.com');
    expect(content.html).toContain('haveri csapatszervező: 1/2');
    expect(content.html).toContain('emailx@example.com');
  });

  test('a küldés állapota DB-be mentődik', async () => {
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

  test('a not_configured állapot is DB-be mentődik', async () => {
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
