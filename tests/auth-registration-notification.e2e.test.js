jest.mock('../src/services/registrationNotificationService', () => ({
  notifyRegistrationSummary: jest.fn(async () => ({
    status: 'sent',
    messageId: 'mock-message-id'
  }))
}));

const request = require('supertest');

const app = require('../src/index');
const pool = require('../src/config/db');
const registrationNotificationService = require('../src/services/registrationNotificationService');

describe('Auth registration notification E2E', () => {
  const createdUserIds = [];
  const password = 'teszt123';

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await pool.query(
        `delete from users where id = any($1::uuid[])`,
        [createdUserIds]
      );
      createdUserIds.length = 0;
    }

    registrationNotificationService.notifyRegistrationSummary.mockClear();
  });

  test('local registration triggers the registration summary email notification', async () => {
    const email = `notify_${Date.now()}@example.com`;

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Notify User',
        email,
        password,
        registrationPath: 'team_sport_organizer',
        registerAsOrganizer: true
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.ok).toBe(true);
    expect(registrationNotificationService.notifyRegistrationSummary).toHaveBeenCalledTimes(1);
    expect(registrationNotificationService.notifyRegistrationSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        createdUserEmail: email,
        createdUserRegistrationPath: 'team_sport_organizer'
      })
    );

    createdUserIds.push(registerRes.body.user.id);
  });
});
