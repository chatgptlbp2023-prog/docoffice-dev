const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const inviteService = require('../services/inviteService');
const registrationNotificationService = require('../services/registrationNotificationService');
const REGISTRATION_PATHS = Object.freeze({
  TOURNAMENT_ORGANIZER: 'tournament_organizer',
  TEAM_SPORT_ORGANIZER: 'team_sport_organizer',
  ACTIVITY_ORGANIZER: 'activity_organizer',
  INVITED_PARTICIPANT: 'invited_participant'
});

const ORGANIZER_REGISTRATION_PATHS = new Set([
  REGISTRATION_PATHS.TOURNAMENT_ORGANIZER,
  REGISTRATION_PATHS.TEAM_SPORT_ORGANIZER,
  REGISTRATION_PATHS.ACTIVITY_ORGANIZER
]);

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

function normalizeRegistrationPath(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.values(REGISTRATION_PATHS).includes(normalized) ? normalized : null;
}

function normalizeOrganizerActivityType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
}

function resolveRegistrationContext({ registrationPath, registerAsOrganizer, inviteToken }) {
  const normalizedPath = normalizeRegistrationPath(registrationPath);

  if (normalizedPath) {
    if (
      normalizedPath === REGISTRATION_PATHS.INVITED_PARTICIPANT &&
      !inviteToken
    ) {
      throw Object.assign(
        new Error('A meghívóval érkező regisztrációhoz érvényes meghívót kell megadnod.'),
        { statusCode: 400 }
      );
    }

    if (
      normalizedPath !== REGISTRATION_PATHS.INVITED_PARTICIPANT &&
      !ORGANIZER_REGISTRATION_PATHS.has(normalizedPath)
    ) {
      throw Object.assign(new Error('Érvénytelen regisztrációs útvonal.'), {
        statusCode: 400
      });
    }

    return {
      registrationPath: normalizedPath,
      canCreateTeam: normalizedPath !== REGISTRATION_PATHS.INVITED_PARTICIPANT
    };
  }

  if (inviteToken) {
    return {
      registrationPath: REGISTRATION_PATHS.INVITED_PARTICIPANT,
      canCreateTeam: false
    };
  }

  if (registerAsOrganizer) {
    return {
      registrationPath: REGISTRATION_PATHS.TEAM_SPORT_ORGANIZER,
      canCreateTeam: true
    };
  }

  throw Object.assign(
    new Error('Regisztrációhoz válaszd ki, milyen szervezőként indulsz, vagy érkezz meghívóval.'),
    { statusCode: 400 }
  );
}

function getRegistrationSuccessMessage(registrationPath) {
  switch (registrationPath) {
    case REGISTRATION_PATHS.TOURNAMENT_ORGANIZER:
      return 'Sikeres regisztráció. Most már létrehozhatod az első tornádat.';
    case REGISTRATION_PATHS.ACTIVITY_ORGANIZER:
      return 'Sikeres regisztráció. Most már létrehozhatod az első saját eseményedet.';
    case REGISTRATION_PATHS.TEAM_SPORT_ORGANIZER:
      return 'Sikeres regisztráció. Most már létrehozhatod a saját csapatodat.';
    case REGISTRATION_PATHS.INVITED_PARTICIPANT:
    default:
      return 'Sikeres regisztráció és csatlakozás a csapathoz.';
  }
}

function getGoogleRegistrationSuccessMessage(registrationPath) {
  switch (registrationPath) {
    case REGISTRATION_PATHS.TOURNAMENT_ORGANIZER:
      return 'Sikeres Google-belépés. Most már létrehozhatod az első tornádat.';
    case REGISTRATION_PATHS.ACTIVITY_ORGANIZER:
      return 'Sikeres Google-belépés. Most már létrehozhatod az első saját eseményedet.';
    case REGISTRATION_PATHS.TEAM_SPORT_ORGANIZER:
      return 'Sikeres Google-belépés. Most már létrehozhatod a saját csapatodat.';
    case REGISTRATION_PATHS.INVITED_PARTICIPANT:
    default:
      return 'Sikeres Google-belépés és csatlakozás a csapathoz.';
  }
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
    registration_path: user.registration_path || null,
    organizer_activity_type: user.organizer_activity_type || null,
    attendance_stats: user.attendance_stats || {
      present_count: 0,
      no_show_count: 0,
      marked_count: 0
    }
  };
}

async function createLocalUser({
  name,
  email,
  phone,
  password,
  canCreateTeam = false,
  registrationPath = REGISTRATION_PATHS.TEAM_SPORT_ORGANIZER,
  organizerActivityType = null
}) {
  const passwordHash = await bcrypt.hash(password, 10);

  const insertResult = await pool.query(
    `
    insert into users (
      id,
      name,
      email,
      phone,
      can_create_team,
      registration_path,
      organizer_activity_type,
      platform_role,
      auth_provider,
      status,
      password_hash,
      created_at,
      updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, 'user', 'local', 'active', $8, now(), now())
    returning id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team, registration_path, organizer_activity_type
    `,
    [
      randomUUID(),
      name,
      email,
      phone,
      canCreateTeam,
      registrationPath,
      normalizeOrganizerActivityType(organizerActivityType),
      passwordHash
    ]
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

async function upsertGoogleUser({
  payload,
  phone,
  canCreateTeam = false,
  registrationPath = REGISTRATION_PATHS.TEAM_SPORT_ORGANIZER,
  organizerActivityType = null
}) {
  const googleSub = String(payload.sub || '').trim();
  const email = normalizeEmail(payload.email);
  const name = String(payload.name || payload.email || '').trim();
  const normalizedPhone = normalizePhone(phone);
  const normalizedRegistrationPath = normalizeRegistrationPath(registrationPath)
    || REGISTRATION_PATHS.TEAM_SPORT_ORGANIZER;
  const normalizedOrganizerActivityType = normalizeOrganizerActivityType(organizerActivityType);

  if (!googleSub || !email || !name) {
    throw Object.assign(new Error('Hiányos Google profiladatok érkeztek.'), {
      statusCode: 400
    });
  }

  const existingByGoogle = await pool.query(
    `
    select id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team, registration_path, organizer_activity_type
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
          registration_path = coalesce(users.registration_path, $6),
          organizer_activity_type = coalesce($7, users.organizer_activity_type),
          auth_provider = 'google',
          updated_at = now()
      where id = $1
      returning id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team, registration_path, organizer_activity_type
      `,
      [
        existingByGoogle.rows[0].id,
        name,
        email,
        normalizedPhone,
        canCreateTeam,
        normalizedRegistrationPath,
        normalizedOrganizerActivityType
      ]
    );

    return {
      user: updatedResult.rows[0],
      wasCreated: false
    };
  }

  const existingByEmail = await pool.query(
    `
    select id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team, registration_path, organizer_activity_type
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
          registration_path = coalesce(users.registration_path, $6),
          organizer_activity_type = coalesce($7, users.organizer_activity_type),
          auth_provider = 'google',
          updated_at = now()
      where id = $1
      returning id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team, registration_path, organizer_activity_type
      `,
      [
        existingByEmail.rows[0].id,
        googleSub,
        name,
        normalizedPhone,
        canCreateTeam,
        normalizedRegistrationPath,
        normalizedOrganizerActivityType
      ]
    );

    return {
      user: linkedResult.rows[0],
      wasCreated: false
    };
  }

  const insertResult = await pool.query(
    `
    insert into users (
      id,
      name,
      email,
      phone,
      can_create_team,
      registration_path,
      organizer_activity_type,
      platform_role,
      auth_provider,
      google_sub,
      status,
      created_at,
      updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, 'user', 'google', $8, 'active', now(), now())
    returning id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team, registration_path, organizer_activity_type
    `,
    [
      randomUUID(),
      name,
      email,
      normalizedPhone,
      canCreateTeam,
      normalizedRegistrationPath,
      normalizedOrganizerActivityType,
      googleSub
    ]
  );

  return {
    user: insertResult.rows[0],
    wasCreated: true
  };
}

async function notifyRegistrationSummarySafely(user = null) {
  try {
    return await registrationNotificationService.notifyRegistrationSummary({
      createdUserId: user?.id || null,
      createdUserEmail: user?.email || null,
      createdUserRegistrationPath: user?.registration_path || null
    });
  } catch (error) {
    console.error('Regisztrációs összesítő email hiba:', error);
    return {
      status: 'failed',
      error: error.message
    };
  }
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
    const { registrationPath, canCreateTeam } = resolveRegistrationContext({
      registrationPath: req.body.registrationPath,
      registerAsOrganizer,
      inviteToken
    });
    const organizerActivityType = req.body.organizerActivityType || null;

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
      canCreateTeam,
      registrationPath,
      organizerActivityType
    });

    const inviteResult = await attachInviteIfPresent({ inviteToken, user });
    const token = createToken(user);
    await notifyRegistrationSummarySafely(user);

    return res.status(201).json({
      ok: true,
      message: getRegistrationSuccessMessage(registrationPath),
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
      select id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team, registration_path, organizer_activity_type, password_hash
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
    const { registrationPath, canCreateTeam } = resolveRegistrationContext({
      registrationPath: req.body.registrationPath,
      registerAsOrganizer,
      inviteToken
    });
    const organizerActivityType = req.body.organizerActivityType || null;

    if (!idToken) {
      return res.status(400).json({
        ok: false,
        message: 'A Google azonosító token kötelező.'
      });
    }

    const payload = await verifyGoogleIdToken(idToken);
    const { user, wasCreated } = await upsertGoogleUser({
      payload,
      phone,
      canCreateTeam,
      registrationPath,
      organizerActivityType
    });

    if (user.status !== 'active') {
      return res.status(403).json({
        ok: false,
        message: 'A felhasználó nem aktív.'
      });
    }

    const inviteResult = await attachInviteIfPresent({ inviteToken, user });
    const token = createToken(user);
    if (wasCreated) {
      await notifyRegistrationSummarySafely(user);
    }

    return res.status(200).json({
      ok: true,
      message: getGoogleRegistrationSuccessMessage(registrationPath),
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
      returning id, name, nickname, email, phone, birth_year, avatar_data_url, payment_provider, payment_username, payment_qr_data_url, status, platform_role, auth_provider, can_create_team, registration_path, organizer_activity_type
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
