const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const inviteService = require('../services/inviteService');
const { getUserByIdWithStats } = require('../services/userProfileService');

function createToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      platformRole: user.platform_role || 'user'
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone(phone) {
  const value = String(phone || '').trim();
  return value || null;
}

function normalizeInviteToken(token) {
  const value = String(token || '').trim();
  return value || null;
}

function bool(value) {
  return value === true;
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    nickname: user.nickname || null,
    email: user.email,
    phone: user.phone || null,
    birth_year: user.birth_year ?? null,
    avatar_data_url: user.avatar_data_url || null,
    payment_provider: user.payment_provider || null,
    payment_username: user.payment_username || null,
    payment_qr_data_url: user.payment_qr_data_url || null,
    status: user.status,
    platform_role: user.platform_role || 'user',
    auth_provider: user.auth_provider || 'local',
    can_create_team: user.can_create_team === true,
    attendance_stats: user.attendance_stats || {
      present_count: 0,
      no_show_count: 0,
      marked_count: 0
    }
  };
}

async function createLocalUser({ name, email, phone, password, canCreateTeam = false }) {
  const passwordHash = await bcrypt.hash(password, 10);

  const insertResult = await pool.query(
    `
    insert into users (
      id,
      name,
      email,
      phone,
      can_create_team,
      platform_role,
      auth_provider,
      status,
      password_hash,
      created_at,
      updated_at
    )
    values ($1, $2, $3, $4, $5, 'user', 'local', 'active', $6, now(), now())
    returning id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team
    `,
    [randomUUID(), name, email, phone, canCreateTeam, passwordHash]
  );

  return insertResult.rows[0];
}

function getGoogleClientIds() {
  return String(process.env.GOOGLE_CLIENT_ID || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

async function verifyGoogleIdToken(idToken) {
  const clientIds = getGoogleClientIds();

  if (!clientIds.length) {
    throw Object.assign(new Error('A Google belépés még nincs bekapcsolva.'), {
      statusCode: 503
    });
  }

  const client = new OAuth2Client(clientIds[0]);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientIds
  });

  return ticket.getPayload();
}

async function upsertGoogleUser({ payload, phone, canCreateTeam = false }) {
  const googleSub = String(payload.sub || '').trim();
  const email = normalizeEmail(payload.email);
  const name = String(payload.name || payload.email || '').trim();
  const avatarUrl = String(payload.picture || '').trim() || null;
  const normalizedPhone = normalizePhone(phone);

  if (!googleSub || !email || !name) {
    throw Object.assign(new Error('Hiányos Google profiladatok érkeztek.'), {
      statusCode: 400
    });
  }

  const existingByGoogle = await pool.query(
    `
    select id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team
    from users
    where google_sub = $1
    `,
    [googleSub]
  );

  if (existingByGoogle.rows.length > 0) {
    const updatedResult = await pool.query(
      `
      update users
      set name = $2,
          email = $3,
          phone = coalesce($4, phone),
          can_create_team = users.can_create_team or $5,
          auth_provider = 'google',
          updated_at = now()
      where id = $1
      returning id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team
      `,
      [existingByGoogle.rows[0].id, name, email, normalizedPhone, canCreateTeam]
    );

    return updatedResult.rows[0];
  }

  const existingByEmail = await pool.query(
    `
    select id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team
    from users
    where lower(email) = $1
    `,
    [email]
  );

  if (existingByEmail.rows.length > 0) {
    const linkedResult = await pool.query(
      `
      update users
      set google_sub = $2,
          name = $3,
          phone = coalesce($4, phone),
          can_create_team = users.can_create_team or $5,
          auth_provider = 'google',
          updated_at = now()
      where id = $1
      returning id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team
      `,
      [existingByEmail.rows[0].id, googleSub, name, normalizedPhone, canCreateTeam]
    );

    return linkedResult.rows[0];
  }

  const insertResult = await pool.query(
    `
    insert into users (
      id,
      name,
      email,
      phone,
      can_create_team,
      platform_role,
      auth_provider,
      google_sub,
      status,
      created_at,
      updated_at
    )
    values ($1, $2, $3, $4, $5, 'user', 'google', $6, 'active', now(), now())
    returning id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team
    `,
    [randomUUID(), name, email, normalizedPhone, canCreateTeam, googleSub]
  );

  return insertResult.rows[0];
}

async function attachInviteIfPresent({ inviteToken, user }) {
  if (!inviteToken) {
    return null;
  }

  return inviteService.acceptInviteToken({
    inviteToken,
    userId: user.id,
    email: user.email
  });
}

async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    const phone = normalizePhone(req.body.phone);
    const inviteToken = normalizeInviteToken(req.body.inviteToken);
    const registerAsOrganizer = bool(req.body.registerAsOrganizer);

    if (!registerAsOrganizer && !inviteToken) {
      return res.status(400).json({
        ok: false,
        message: 'Regisztrációhoz csapatszervezőként kell indulnod, vagy érvényes meghívólinkkel kell érkezned.'
      });
    }

    const existingUserResult = await pool.query(
      `
      select id
      from users
      where lower(email) = $1
      `,
      [email]
    );

    if (existingUserResult.rows.length > 0) {
      return res.status(409).json({
        ok: false,
        message: 'Ez az email cím már foglalt.'
      });
    }

    const user = await createLocalUser({
      name,
      email,
      phone,
      password,
      canCreateTeam: registerAsOrganizer
    });

    const inviteResult = await attachInviteIfPresent({ inviteToken, user });
    const token = createToken(user);

    return res.status(201).json({
      ok: true,
      message: registerAsOrganizer
        ? 'Sikeres regisztráció. Most már létrehozhatod a saját csapatodat.'
        : 'Sikeres regisztráció és csatlakozás a csapathoz.',
      token,
      user: serializeUser(user),
      joined_invite: inviteResult
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        ok: false,
        message: 'Ez az email cím már foglalt.'
      });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        ok: false,
        message: error.message,
        ...error.payload
      });
    }

    console.error('Regisztrációs hiba:', error);

    return res.status(500).json({
      ok: false,
      message: 'Szerverhiba regisztráció közben.',
      error: error.message
    });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    const userResult = await pool.query(
      `
      select id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team, password_hash
      from users
      where lower(email) = $1
      `,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        ok: false,
        message: 'Hibás email vagy jelszó.'
      });
    }

    const user = userResult.rows[0];

    if (user.status !== 'active') {
      return res.status(403).json({
        ok: false,
        message: 'A felhasználó nem aktív.'
      });
    }

    if (!user.password_hash) {
      return res.status(401).json({
        ok: false,
        message: 'Ehhez a fiókhoz nincs helyi jelszó beállítva. Jelentkezz be Google-fiókkal.'
      });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
      return res.status(401).json({
        ok: false,
        message: 'Hibás email vagy jelszó.'
      });
    }

    const token = createToken(user);

    return res.status(200).json({
      ok: true,
      message: 'Sikeres bejelentkezés.',
      token,
      user: serializeUser(user)
    });
  } catch (error) {
    console.error('Login hiba:', error);

    return res.status(500).json({
      ok: false,
      message: 'Szerverhiba bejelentkezés közben.',
      error: error.message
    });
  }
}

async function googleAuth(req, res) {
  try {
    const idToken = String(req.body.idToken || '').trim();
    const inviteToken = normalizeInviteToken(req.body.inviteToken);
    const registerAsOrganizer = bool(req.body.registerAsOrganizer);
    const phone = normalizePhone(req.body.phone);

    if (!idToken) {
      return res.status(400).json({
        ok: false,
        message: 'A Google azonosító token kötelező.'
      });
    }

    if (!registerAsOrganizer && !inviteToken) {
      return res.status(400).json({
        ok: false,
        message: 'Google-belépésnél is csapatszervezőként kell indulnod, vagy meghívólinkkel kell érkezned.'
      });
    }

    const payload = await verifyGoogleIdToken(idToken);
    const user = await upsertGoogleUser({ payload, phone, canCreateTeam: registerAsOrganizer });

    if (user.status !== 'active') {
      return res.status(403).json({
        ok: false,
        message: 'A felhasználó nem aktív.'
      });
    }

    const inviteResult = await attachInviteIfPresent({ inviteToken, user });
    const token = createToken(user);

    return res.status(200).json({
      ok: true,
      message: registerAsOrganizer
        ? 'Sikeres Google-belépés. Most már létrehozhatod a saját csapatodat.'
        : 'Sikeres Google-belépés és csatlakozás a csapathoz.',
      token,
      user: serializeUser(user),
      joined_invite: inviteResult
    });
  } catch (error) {
    const statusCode = error.statusCode || 401;

    return res.status(statusCode).json({
      ok: false,
      message: error.message || 'A Google-belépés nem sikerült.'
    });
  }
}

function getGoogleAuthConfig(req, res) {
  const clientIds = getGoogleClientIds();

  return res.status(200).json({
    ok: true,
    enabled: clientIds.length > 0,
    clientId: clientIds[0] || null
  });
}

async function getMe(req, res) {
  return res.status(200).json({
    ok: true,
    user: serializeUser(req.user)
  });
}

async function updateMe(req, res) {
  try {
    const result = await pool.query(
      `
      update users
      set name = $2,
          nickname = $3,
          phone = $4,
          birth_year = $5,
          avatar_data_url = $6,
          payment_provider = $7,
          payment_username = $8,
          payment_qr_data_url = $9,
          updated_at = now()
      where id = $1
      returning id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team
      `,
      [
        req.user.id,
        req.body.name,
        req.body.nickname,
        req.body.phone,
        req.body.birthYear,
        req.body.avatarDataUrl,
        req.body.paymentProvider,
        req.body.paymentUsername,
        req.body.paymentQrDataUrl
      ]
    );

    return res.status(200).json({
      ok: true,
      message: 'Profil sikeresen frissítve.',
      user: serializeUser({
        ...result.rows[0],
        attendance_stats: req.user.attendance_stats
      })
    });
  } catch (error) {
    console.error('Profil frissítési hiba:', error);
    return res.status(500).json({
      ok: false,
      message: 'Szerverhiba profil frissítése közben.',
      error: error.message
    });
  }
}

module.exports = {
  register,
  login,
  googleAuth,
  getGoogleAuthConfig,
  getMe,
  updateMe
};
