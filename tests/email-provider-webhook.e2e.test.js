const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const app = require('../src/index');
const pool = require('../src/config/db');

describe('Email provider webhook', () => {
  const createdLogEmails = [];
  const originalEnv = {
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    EMAIL_WEBHOOK_SECRET: process.env.EMAIL_WEBHOOK_SECRET,
    POSTMARK_WEBHOOK_SECRET: process.env.POSTMARK_WEBHOOK_SECRET
  };

  function restoreEnv(name) {
    if (originalEnv[name] == null) {
      delete process.env[name];
    } else {
      process.env[name] = originalEnv[name];
    }
  }

  beforeAll(async () => {
    for (const fileName of [
      '2026-06-29_email_delivery_logs.sql',
      '2026-06-29_email_delivery_batch_id.sql',
      '2026-06-29_email_provider_webhooks.sql'
    ]) {
      const migrationSql = fs.readFileSync(
        path.join(__dirname, '..', 'db', 'migrations', fileName),
        'utf8'
      );
      await pool.query(migrationSql);
    }
  });

  beforeEach(() => {
    process.env.EMAIL_PROVIDER = 'postmark';
    process.env.EMAIL_WEBHOOK_SECRET = 'webhook-secret';
    process.env.POSTMARK_WEBHOOK_SECRET = '';
  });

  afterEach(async () => {
    if (createdLogEmails.length) {
      await pool.query(
        `delete from email_delivery_logs where recipient_email = any($1::text[])`,
        [createdLogEmails]
      );
      createdLogEmails.length = 0;
    }

    restoreEnv('EMAIL_PROVIDER');
    restoreEnv('EMAIL_WEBHOOK_SECRET');
    restoreEnv('POSTMARK_WEBHOOK_SECRET');
  });

  async function createEmailLog({
    providerMessageId,
    recipientEmail = `webhook_${randomUUID()}@example.com`,
    status = 'sent'
  }) {
    createdLogEmails.push(recipientEmail);
    const result = await pool.query(
      `
      insert into email_delivery_logs (
        recipient_email,
        template,
        status,
        provider_message_id,
        metadata
      )
      values ($1, 'event_created', $2, $3, '{}'::jsonb)
      returning id
      `,
      [recipientEmail, status, providerMessageId]
    );

    return {
      id: result.rows[0].id,
      recipientEmail
    };
  }

  async function getEmailLog(id) {
    const result = await pool.query(
      `
      select
        status,
        provider_message_id,
        provider_event_id,
        provider_event_type,
        provider_payload,
        delivered_at,
        bounced_at,
        complained_at
      from email_delivery_logs
      where id = $1
      `,
      [id]
    );

    return result.rows[0] || null;
  }

  function postmarkRequest(payload, secret = 'webhook-secret') {
    return request(app)
      .post('/webhooks/email/postmark')
      .set('X-Postmark-Webhook-Token', secret)
      .send(payload);
  }

  test('delivered webhook frissiti a logot delivered statuszra', async () => {
    const messageId = `msg-delivered-${randomUUID()}`;
    const { id, recipientEmail } = await createEmailLog({ providerMessageId: messageId });

    const res = await postmarkRequest({
      RecordType: 'Delivery',
      MessageID: messageId,
      Recipient: recipientEmail,
      DeliveredAt: '2026-06-29T12:00:00.000Z',
      ID: 'postmark-delivered-1'
    });

    expect(res.status).toBe(200);
    expect(res.body.updatedCount).toBe(1);

    const log = await getEmailLog(id);
    expect(log.status).toBe('delivered');
    expect(log.provider_event_id).toBe('postmark-delivered-1');
    expect(log.provider_event_type).toBe('delivered');
    expect(log.delivered_at.toISOString()).toBe('2026-06-29T12:00:00.000Z');
  });

  test('bounce webhook frissiti a logot bounced statuszra', async () => {
    const messageId = `msg-bounced-${randomUUID()}`;
    const { id, recipientEmail } = await createEmailLog({ providerMessageId: messageId });

    const res = await postmarkRequest({
      RecordType: 'Bounce',
      MessageID: messageId,
      Email: recipientEmail,
      BouncedAt: '2026-06-29T13:00:00.000Z',
      ID: 'postmark-bounced-1'
    });

    expect(res.status).toBe(200);

    const log = await getEmailLog(id);
    expect(log.status).toBe('bounced');
    expect(log.provider_event_type).toBe('bounced');
    expect(log.bounced_at.toISOString()).toBe('2026-06-29T13:00:00.000Z');
  });

  test('complaint webhook frissiti a logot complained statuszra', async () => {
    const messageId = `msg-complained-${randomUUID()}`;
    const { id, recipientEmail } = await createEmailLog({ providerMessageId: messageId });

    const res = await postmarkRequest({
      RecordType: 'SpamComplaint',
      MessageID: messageId,
      Email: recipientEmail,
      ReceivedAt: '2026-06-29T14:00:00.000Z',
      ID: 'postmark-complained-1'
    });

    expect(res.status).toBe(200);

    const log = await getEmailLog(id);
    expect(log.status).toBe('complained');
    expect(log.provider_event_type).toBe('complained');
    expect(log.complained_at.toISOString()).toBe('2026-06-29T14:00:00.000Z');
  });

  test('hibas secret 401-et ad', async () => {
    const messageId = `msg-secret-${randomUUID()}`;
    const { id } = await createEmailLog({ providerMessageId: messageId });

    const res = await postmarkRequest({
      RecordType: 'Delivery',
      MessageID: messageId,
      DeliveredAt: '2026-06-29T12:00:00.000Z',
      ID: 'postmark-secret-1'
    }, 'wrong-secret');

    expect(res.status).toBe(401);
    const log = await getEmailLog(id);
    expect(log.status).toBe('sent');
  });

  test('ismeretlen provider 400-at ad', async () => {
    const res = await request(app)
      .post('/webhooks/email/unknown')
      .set('X-Email-Webhook-Secret', 'webhook-secret')
      .send({});

    expect(res.status).toBe(400);
  });

  test('smtp provider mellett a webhook inaktiv', async () => {
    process.env.EMAIL_PROVIDER = 'smtp';

    const res = await postmarkRequest({
      RecordType: 'Delivery',
      MessageID: `smtp-inactive-${randomUUID()}`,
      DeliveredAt: '2026-06-29T12:00:00.000Z',
      ID: 'postmark-smtp-inactive-1'
    });

    expect(res.status).toBe(400);
  });

  test('ismeretlen message id nem dob hibat es 200-zal visszater', async () => {
    const res = await postmarkRequest({
      RecordType: 'Delivery',
      MessageID: `missing-${randomUUID()}`,
      DeliveredAt: '2026-06-29T12:00:00.000Z',
      ID: 'postmark-missing-1'
    });

    expect(res.status).toBe(200);
    expect(res.body.missingCount).toBe(1);
    expect(res.body.updatedCount).toBe(0);
  });

  test('dupla webhook esemeny idempotens', async () => {
    const messageId = `msg-duplicate-${randomUUID()}`;
    const { id } = await createEmailLog({ providerMessageId: messageId });
    const payload = {
      RecordType: 'Delivery',
      MessageID: messageId,
      DeliveredAt: '2026-06-29T12:00:00.000Z',
      ID: 'postmark-duplicate-1'
    };

    const firstRes = await postmarkRequest(payload);
    const secondRes = await postmarkRequest(payload);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(secondRes.body.results[0].status).toBe('already_processed');

    const log = await getEmailLog(id);
    expect(log.status).toBe('delivered');
    expect(log.provider_event_id).toBe('postmark-duplicate-1');
  });
});
