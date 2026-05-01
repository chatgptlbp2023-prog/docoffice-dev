const { sendEmail } = require('./emailService');

function normalizeBaseUrl(baseUrl) {
  const value = String(baseUrl || process.env.APP_BASE_URL || '').trim();
  return value ? value.replace(/\/+$/, '') : '';
}

function buildInviteAbsoluteUrl(inviteToken, baseUrl = '') {
  const path = `/?invite=${encodeURIComponent(String(inviteToken || '').trim())}`;
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (!normalizedBaseUrl) {
    return path;
  }

  return `${normalizedBaseUrl}${path}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildInviteEmail(invite, { appBaseUrl = '' } = {}) {
  const inviteUrl = buildInviteAbsoluteUrl(invite.invite_token, appBaseUrl);
  const teamName = invite.team_name || 'ismeretlen csapat';
  const inviterName = invite.invited_by_name || 'A csapatkapitány';
  const roleLabel = invite.role === 'team_manager' ? 'csapatkapitány-helyettes' : 'tag';
  const subject = `Meghívó a(z) ${teamName} csapatba`;
  const messageLine = invite.message
    ? `Személyes üzenet: ${invite.message}`
    : 'A meghívóhoz nem tartozik külön üzenet.';

  const text = [
    `Szia!`,
    '',
    `${inviterName} meghívott a(z) ${teamName} csapatba.`,
    `Neked szánt szerep: ${roleLabel}.`,
    messageLine,
    '',
    `A meghívó megnyitása: ${inviteUrl}`,
    `Meghívókód: ${invite.invite_code || '-'}`,
    '',
    `A meghívó lejár: ${invite.expires_at || '-'}`,
    '',
    'Ha nem te vártad ezt a meghívót, nyugodtan hagyd figyelmen kívül ezt a levelet.'
  ].join('\n');

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1f2937;">
      <h2 style="margin-bottom:12px;">Meghívó a csapatba</h2>
      <p><strong>${escapeHtml(inviterName)}</strong> meghívott a(z) <strong>${escapeHtml(teamName)}</strong> csapatba.</p>
      <p>Neked szánt szerep: <strong>${escapeHtml(roleLabel)}</strong>.</p>
      <p>${escapeHtml(messageLine)}</p>
      <p style="margin:20px 0;">
        <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">
          Meghívó megnyitása
        </a>
      </p>
      <p><strong>Meghívókód:</strong> ${escapeHtml(invite.invite_code || '-')}</p>
      <p><strong>Lejárat:</strong> ${escapeHtml(invite.expires_at || '-')}</p>
      <p style="color:#6b7280;font-size:14px;">Ha nem te vártad ezt a meghívót, nyugodtan hagyd figyelmen kívül ezt a levelet.</p>
    </div>
  `;

  return {
    to: invite.invited_email,
    subject,
    text,
    html,
    inviteUrl
  };
}

async function sendInviteEmail(invite, options = {}) {
  if (!invite?.invited_email) {
    return {
      status: 'skipped',
      reason: 'missing_email'
    };
  }

  const payload = buildInviteEmail(invite, options);
  const delivery = await sendEmail(payload);

  return {
    ...delivery,
    inviteUrl: payload.inviteUrl
  };
}

module.exports = {
  normalizeBaseUrl,
  buildInviteAbsoluteUrl,
  buildInviteEmail,
  sendInviteEmail
};
