const nodemailer = require('nodemailer');

let cachedTransporter = null;
let cachedTransporterKey = null;

function readEmailConfig(env = process.env) {
  const host = String(env.SMTP_HOST || '').trim();
  const portRaw = String(env.SMTP_PORT || '').trim();
  const secureRaw = String(env.SMTP_SECURE || '').trim().toLowerCase();
  const user = String(env.SMTP_USER || '').trim();
  const pass = String(env.SMTP_PASS || '').trim();
  const from = String(env.MAIL_FROM || '').trim();
  const fromName = String(env.MAIL_FROM_NAME || '').trim();

  const port = portRaw ? Number(portRaw) : 587;
  const secure = ['1', 'true', 'yes', 'on'].includes(secureRaw);

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    fromName
  };
}

function isEmailConfigured(config = readEmailConfig()) {
  const allowEmailInTests = String(process.env.ENABLE_EMAIL_IN_TESTS || '').trim().toLowerCase() === 'true';
  if (process.env.NODE_ENV === 'test' && !allowEmailInTests) {
    return false;
  }

  return Boolean(
    config.host &&
    Number.isFinite(config.port) &&
    config.user &&
    config.pass &&
    config.from
  );
}

function getMailFrom(config = readEmailConfig()) {
  if (!config.from) {
    return '';
  }

  return config.fromName
    ? `"${config.fromName.replace(/"/g, '\\"')}" <${config.from}>`
    : config.from;
}

function getTransporter(config = readEmailConfig()) {
  if (!isEmailConfigured(config)) {
    return null;
  }

  const cacheKey = JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    from: config.from,
    fromName: config.fromName
  });

  if (cachedTransporter && cachedTransporterKey === cacheKey) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
  cachedTransporterKey = cacheKey;
  return cachedTransporter;
}

async function sendEmail({ to, subject, text, html }) {
  const config = readEmailConfig();
  if (!isEmailConfigured(config)) {
    return {
      status: 'skipped',
      reason: 'not_configured'
    };
  }

  const transporter = getTransporter(config);
  const info = await transporter.sendMail({
    from: getMailFrom(config),
    to,
    subject,
    text,
    html
  });

  return {
    status: 'sent',
    messageId: info.messageId || null,
    accepted: Array.isArray(info.accepted) ? info.accepted : [],
    rejected: Array.isArray(info.rejected) ? info.rejected : []
  };
}

module.exports = {
  readEmailConfig,
  isEmailConfigured,
  getMailFrom,
  sendEmail
};
