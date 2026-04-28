const { randomBytes } = require('crypto');
const AppError = require('../utils/appError');
const { withTransaction } = require('./dbService');
const {
  normalizeEmail,
  normalizeRole,
  assertTeamExists,
  ensureTeamMembershipActive
} = require('./teamService');
const { normalizeTeamRole } = require('../utils/teamRoles');

const INVITE_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  REVOKED: 'revoked',
  EXPIRED: 'expired'
});

const INVITE_ROLE_VALUES = new Set(['member', 'team_manager']);
const DEFAULT_EXPIRY_DAYS = 7;

function generateInviteToken() {
  return randomBytes(24).toString('hex');
}

function generateInviteCode() {
  return randomBytes(5).toString('hex').toUpperCase();
}

function buildInviteLink(token) {
  return `/ ?invite=${encodeURIComponent(token)}`;
}

function assertValidInviteRole(role) {
  const normalizedRole = normalizeTeamRole(normalizeRole(role));

  if (!INVITE_ROLE_VALUES.has(normalizedRole)) {
    throw new AppError(400, 'A role csak member vagy team_manager lehet.');
  }

  return normalizedRole;
}

function assertValidInviteEmail(email, { required = false } = {}) {
  const normalized = normalizeEmail(email);

  if (!normalized) {
    if (required) {
      throw new AppError(400, 'Az email kötelező.');
    }

    return null;
  }

  if (!normalized.includes('@')) {
    throw new AppError(400, 'Érvénytelen email cím.');
  }

  return normalized;
}

function normalizePhone(phone) {
  const value = String(phone || '').trim();
  return value || null;
}

function normalizeMessage(message) {
  const value = String(message || '').trim();
  return value || null;
}

async function expirePendingInvitesForTeam(client, teamId) {
  await client.query(
    `
    update team_invites
    set status = 'expired',
        updated_at = now()
    where team_id = $1
      and status = 'pending'
      and expires_at < now()
    `,
    [teamId]
  );
}

async function expirePendingInvitesForEmail(client, invitedEmail) {
  await client.query(
    `
    update team_invites
    set status = 'expired',
        updated_at = now()
    where lower(coalesce(invited_email, '')) = $1
      and status = 'pending'
      and expires_at < now()
    `,
    [invitedEmail]
  );
}

async function getUserByEmail(client, email) {
  const result = await client.query(
    `
    select id, name, email, status
    from users
    where lower(email) = $1
    `,
    [email]
  );

  return result.rows[0] || null;
}

async function getUserById(client, userId) {
  const result = await client.query(
    `
    select id, name, email, status
    from users
    where id = $1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

function mapInvite(row) {
  return {
    id: row.id,
    team_id: row.team_id,
    team_name: row.team_name,
    invited_email: row.invited_email,
    invited_phone: row.invited_phone,
    role: normalizeTeamRole(row.role),
    status: row.status,
    message: row.message,
    invited_by_user_id: row.invited_by_user_id,
    invited_by_name: row.invited_by_name,
    invited_by_email: row.invited_by_email,
    expires_at: row.expires_at,
    responded_at: row.responded_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    invite_token: row.token,
    invite_code: row.invite_code,
    invite_link: buildInviteLink(row.token)
  };
}

async function loadInviteById(client, inviteId, { forUpdate = false } = {}) {
  const result = await client.query(
    `
    select
      ti.*,
      t.name as team_name,
      inviter.name as invited_by_name,
      inviter.email as invited_by_email
    from team_invites ti
    join teams t on t.id = ti.team_id
    join users inviter on inviter.id = ti.invited_by_user_id
    where ti.id = $1
    ${forUpdate ? 'for update' : ''}
    `,
    [inviteId]
  );

  return result.rows[0] || null;
}

async function loadInviteByToken(client, inviteToken, { forUpdate = false } = {}) {
  const result = await client.query(
    `
    select
      ti.*,
      t.name as team_name,
      inviter.name as invited_by_name,
      inviter.email as invited_by_email
    from team_invites ti
    join teams t on t.id = ti.team_id
    join users inviter on inviter.id = ti.invited_by_user_id
    where ti.token = $1
    ${forUpdate ? 'for update' : ''}
    `,
    [inviteToken]
  );

  return result.rows[0] || null;
}

async function createInvite({ teamId, invitedByUserId, email, phone, role, message }) {
  const invitedEmail = assertValidInviteEmail(email, { required: false });
  const invitedPhone = normalizePhone(phone);
  const normalizedRole = assertValidInviteRole(role);
  const normalizedMessage = normalizeMessage(message);

  return withTransaction(async client => {
    await assertTeamExists(client, teamId);
    await expirePendingInvitesForTeam(client, teamId);

    if (invitedEmail) {
      const existingUser = await getUserByEmail(client, invitedEmail);

      if (existingUser && existingUser.status !== 'active') {
        throw new AppError(400, 'A felhasználó nem aktív.');
      }

      if (existingUser) {
        const activeMembershipResult = await client.query(
          `
          select id
          from team_members
          where team_id = $1
            and user_id = $2
            and membership_status = 'active'
          `,
          [teamId, existingUser.id]
        );

        if (activeMembershipResult.rows.length > 0) {
          throw new AppError(409, 'A felhasználó már aktív tagja a csapatnak.');
        }
      }

      const pendingInviteResult = await client.query(
        `
        select id
        from team_invites
        where team_id = $1
          and lower(invited_email) = $2
          and status = 'pending'
        `,
        [teamId, invitedEmail]
      );

      if (pendingInviteResult.rows.length > 0) {
        throw new AppError(409, 'Ehhez az emailhez már van nyitott meghívó ebben a csapatban.');
      }
    }

    const insertResult = await client.query(
      `
      insert into team_invites (
        id,
        team_id,
        invited_email,
        invited_phone,
        role,
        status,
        invited_by_user_id,
        message,
        token,
        invite_code,
        max_uses,
        used_count,
        expires_at,
        created_at,
        updated_at
      )
      values (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4,
        'pending',
        $5,
        $6,
        $7,
        $8,
        1,
        0,
        now() + ($9::text || ' days')::interval,
        now(),
        now()
      )
      returning *
      `,
      [
        teamId,
        invitedEmail,
        invitedPhone,
        normalizedRole,
        invitedByUserId,
        normalizedMessage,
        generateInviteToken(),
        generateInviteCode(),
        String(DEFAULT_EXPIRY_DAYS)
      ]
    );

    const invite = mapInvite({
      ...insertResult.rows[0],
      team_name: null,
      invited_by_name: null,
      invited_by_email: null
    });

    return {
      message: 'Meghívó sikeresen létrehozva.',
      invite
    };
  });
}

async function getTeamInvites({ teamId }) {
  return withTransaction(async client => {
    await assertTeamExists(client, teamId);
    await expirePendingInvitesForTeam(client, teamId);

    const result = await client.query(
      `
      select
        ti.*,
        t.name as team_name,
        inviter.name as invited_by_name,
        inviter.email as invited_by_email
      from team_invites ti
      join teams t on t.id = ti.team_id
      join users inviter on inviter.id = ti.invited_by_user_id
      where ti.team_id = $1
      order by
        case ti.status
          when 'pending' then 1
          when 'accepted' then 2
          when 'declined' then 3
          when 'revoked' then 4
          when 'expired' then 5
          else 6
        end,
        ti.created_at desc
      `,
      [teamId]
    );

    return {
      count: result.rows.length,
      invites: result.rows.map(mapInvite)
    };
  });
}

async function getMyInvites({ email }) {
  const invitedEmail = assertValidInviteEmail(email, { required: true });

  return withTransaction(async client => {
    await expirePendingInvitesForEmail(client, invitedEmail);

    const result = await client.query(
      `
      select
        ti.*,
        t.name as team_name,
        inviter.name as invited_by_name,
        inviter.email as invited_by_email
      from team_invites ti
      join teams t on t.id = ti.team_id
      join users inviter on inviter.id = ti.invited_by_user_id
      where lower(coalesce(ti.invited_email, '')) = $1
      order by
        case ti.status
          when 'pending' then 1
          when 'accepted' then 2
          when 'declined' then 3
          when 'revoked' then 4
          when 'expired' then 5
          else 6
        end,
        ti.created_at desc
      `,
      [invitedEmail]
    );

    return {
      count: result.rows.length,
      invites: result.rows.map(mapInvite)
    };
  });
}

function assertInviteCanBeConsumed(invite, email) {
  if (!invite) {
    throw new AppError(404, 'A meghívó nem található.');
  }

  if (invite.status !== INVITE_STATUS.PENDING) {
    throw new AppError(409, 'A meghívó már nem fogadható el.');
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    throw new AppError(409, 'A meghívó lejárt.');
  }

  if (
    invite.invited_email &&
    normalizeEmail(invite.invited_email) !== normalizeEmail(email)
  ) {
    throw new AppError(403, 'Ez a meghívó nem ehhez az email címhez tartozik.');
  }

  if (Number(invite.used_count || 0) >= Number(invite.max_uses || 1)) {
    throw new AppError(409, 'Ez a meghívó már fel lett használva.');
  }
}

async function consumeInvite(client, invite, user) {
  const membership = await ensureTeamMembershipActive(client, {
    teamId: invite.team_id,
    userId: user.id,
    role: invite.role,
    allowExistingActive: true
  });

  const nextUsedCount = Number(invite.used_count || 0) + 1;
  const nextStatus = nextUsedCount >= Number(invite.max_uses || 1)
    ? INVITE_STATUS.ACCEPTED
    : INVITE_STATUS.PENDING;

  const updateInviteResult = await client.query(
    `
    update team_invites
    set status = $2,
        used_count = $3,
        responded_at = case when $2 = 'accepted' then now() else responded_at end,
        updated_at = now()
    where id = $1
    returning *
    `,
    [invite.id, nextStatus, nextUsedCount]
  );

  return {
    invite: updateInviteResult.rows[0],
    member: {
      member_id: membership.id,
      team_id: membership.team_id,
      user_id: membership.user_id,
      name: user.name,
      email: user.email,
      role: normalizeTeamRole(membership.role),
      membership_status: membership.membership_status,
      joined_at: membership.joined_at
    }
  };
}

async function acceptInvite({ inviteId, userId, email }) {
  const invitedEmail = assertValidInviteEmail(email, { required: true });

  return withTransaction(async client => {
    const invite = await loadInviteById(client, inviteId, { forUpdate: true });
    assertInviteCanBeConsumed(invite, invitedEmail);

    const user = await getUserById(client, userId);
    if (!user) {
      throw new AppError(404, 'A felhasználó nem található.');
    }

    if (user.status !== 'active') {
      throw new AppError(403, 'A felhasználó nem aktív.');
    }

    const consumed = await consumeInvite(client, invite, user);

    return {
      message: 'Meghívás sikeresen elfogadva.',
      invite: mapInvite({
        ...consumed.invite,
        team_name: invite.team_name,
        invited_by_name: invite.invited_by_name,
        invited_by_email: invite.invited_by_email
      }),
      member: consumed.member
    };
  });
}

async function acceptInviteToken({ inviteToken, userId, email }) {
  const normalizedEmail = assertValidInviteEmail(email, { required: true });

  return withTransaction(async client => {
    const invite = await loadInviteByToken(client, inviteToken, { forUpdate: true });
    assertInviteCanBeConsumed(invite, normalizedEmail);

    const user = await getUserById(client, userId);
    if (!user) {
      throw new AppError(404, 'A felhasználó nem található.');
    }

    if (user.status !== 'active') {
      throw new AppError(403, 'A felhasználó nem aktív.');
    }

    const consumed = await consumeInvite(client, invite, user);

    return {
      message: 'Meghívókód sikeresen beváltva.',
      invite: mapInvite({
        ...consumed.invite,
        team_name: invite.team_name,
        invited_by_name: invite.invited_by_name,
        invited_by_email: invite.invited_by_email
      }),
      member: consumed.member
    };
  });
}

async function getInviteByToken({ inviteToken }) {
  const normalized = String(inviteToken || '').trim();
  if (!normalized) {
    throw new AppError(400, 'A meghívókód kötelező.');
  }

  return withTransaction(async client => {
    const invite = await loadInviteByToken(client, normalized);
    if (!invite) {
      throw new AppError(404, 'A meghívó nem található.');
    }

    if (invite.status === INVITE_STATUS.PENDING && new Date(invite.expires_at).getTime() < Date.now()) {
      await client.query(
        `
        update team_invites
        set status = 'expired',
            updated_at = now()
        where id = $1
        `,
        [invite.id]
      );

      invite.status = INVITE_STATUS.EXPIRED;
    }

    return {
      invite: mapInvite(invite)
    };
  });
}

async function acceptInviteTokenForAuthenticatedUser({ inviteToken, userId, email }) {
  return acceptInviteToken({ inviteToken, userId, email });
}

async function declineInvite({ inviteId, email }) {
  const invitedEmail = assertValidInviteEmail(email, { required: true });

  return withTransaction(async client => {
    const invite = await loadInviteById(client, inviteId, { forUpdate: true });

    if (!invite) {
      throw new AppError(404, 'A meghívó nem található.');
    }

    if (
      invite.invited_email &&
      normalizeEmail(invite.invited_email) !== invitedEmail
    ) {
      throw new AppError(403, 'Ez a meghívó nem ehhez az email címhez tartozik.');
    }

    if (invite.status !== INVITE_STATUS.PENDING) {
      throw new AppError(409, 'A meghívó már nem utasítható el.');
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await client.query(
        `
        update team_invites
        set status = 'expired',
            updated_at = now()
        where id = $1
        `,
        [inviteId]
      );

      throw new AppError(409, 'A meghívó lejárt.');
    }

    const updateResult = await client.query(
      `
      update team_invites
      set status = 'declined',
          responded_at = now(),
          updated_at = now()
      where id = $1
      returning *
      `,
      [inviteId]
    );

    return {
      message: 'Meghívás elutasítva.',
      invite: mapInvite({
        ...updateResult.rows[0],
        team_name: invite.team_name,
        invited_by_name: invite.invited_by_name,
        invited_by_email: invite.invited_by_email
      })
    };
  });
}

async function revokeInvite({ teamId, inviteId }) {
  return withTransaction(async client => {
    await assertTeamExists(client, teamId);

    const invite = await loadInviteById(client, inviteId, { forUpdate: true });
    if (!invite) {
      throw new AppError(404, 'A meghívó nem található.');
    }

    if (invite.team_id !== teamId) {
      throw new AppError(400, 'A meghívó nem ehhez a csapathoz tartozik.');
    }

    if (invite.status !== INVITE_STATUS.PENDING) {
      throw new AppError(409, 'Csak függő meghívó vonható vissza.');
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      const expiredResult = await client.query(
        `
        update team_invites
        set status = 'expired',
            updated_at = now()
        where id = $1
        returning *
        `,
        [inviteId]
      );

      throw new AppError(409, 'A meghívó már lejárt.', {
        invite: mapInvite({
          ...expiredResult.rows[0],
          team_name: invite.team_name,
          invited_by_name: invite.invited_by_name,
          invited_by_email: invite.invited_by_email
        })
      });
    }

    const updateResult = await client.query(
      `
      update team_invites
      set status = 'revoked',
          revoked_at = now(),
          updated_at = now()
      where id = $1
      returning *
      `,
      [inviteId]
    );

    return {
      message: 'Meghívó visszavonva.',
      invite: mapInvite({
        ...updateResult.rows[0],
        team_name: invite.team_name,
        invited_by_name: invite.invited_by_name,
        invited_by_email: invite.invited_by_email
      })
    };
  });
}

module.exports = {
  createInvite,
  getTeamInvites,
  getMyInvites,
  getInviteByToken,
  acceptInvite,
  acceptInviteToken,
  acceptInviteTokenForAuthenticatedUser,
  declineInvite,
  revokeInvite
};
