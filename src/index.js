const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { validateEnv } = require('./config/env');
const { buildCorsOptions } = require('./utils/corsConfig');
const { getVersionInfo } = require('./utils/versionInfo');

const { PORT, TRUST_PROXY } = validateEnv();

const pool = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const eventRoutes = require('./routes/eventRoutes');
const inviteRoutes = require('./routes/inviteRoutes');
const myRoutes = require('./routes/myRoutes');
const eventSeriesRoutes = require('./routes/eventSeriesRoutes');
const teamSkillRoutes = require('./routes/teamSkillRoutes');
const teamRoutes = require('./routes/teamRoutes');

const app = express();

pool.query(`
  alter table events
    add column if not exists hidden_from_admin_list boolean not null default false
`).catch(error => {
  console.error('Schema ensure hiba:', error);
});

pool.query(`
  alter table team_invites
    add column if not exists email_delivery_status text null,
    add column if not exists email_delivery_reason text null,
    add column if not exists email_delivery_error text null,
    add column if not exists email_delivery_message_id text null,
    add column if not exists email_delivery_sent_at timestamptz null,
    add column if not exists email_delivery_updated_at timestamptz null;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'team_invites_email_delivery_status_check'
    ) then
      alter table team_invites
        add constraint team_invites_email_delivery_status_check
        check (
          email_delivery_status is null
          or email_delivery_status in ('sent', 'skipped', 'failed')
        );
    end if;
  end $$;
`).catch(error => {
  console.error('Schema ensure hiba:', error);
});

pool.query(`
  alter table users
    add column if not exists can_create_team boolean not null default false,
    add column if not exists registration_path text null,
    add column if not exists organizer_activity_type text null,
    add column if not exists payment_provider text null,
    add column if not exists payment_username text null,
    add column if not exists payment_qr_data_url text null;

  update users
  set registration_path = case
    when can_create_team = true then 'team_sport_organizer'
    else 'invited_participant'
  end
  where registration_path is null;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'users_registration_path_check'
    ) then
      alter table users
        add constraint users_registration_path_check
        check (
          registration_path is null
          or registration_path in (
            'tournament_organizer',
            'team_sport_organizer',
            'activity_organizer',
            'invited_participant'
          )
        );
    end if;
  end $$;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'users_organizer_activity_type_check'
    ) then
      alter table users
        add constraint users_organizer_activity_type_check
        check (
          organizer_activity_type is null
          or organizer_activity_type in (
            'football',
            'basketball',
            'yoga',
            'pilates',
            'running',
            'cycling',
            'hiking',
            'other'
          )
        );
    end if;
  end $$;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'users_payment_provider_check'
    ) then
      alter table users
        add constraint users_payment_provider_check
        check (
          payment_provider is null
          or payment_provider in ('revolut', 'wise')
        );
    end if;
  end $$;
`).catch(error => {
  console.error('Schema ensure hiba:', error);
});

pool.query(`
  alter table event_settings
    add column if not exists payment_link_provider text null,
    add column if not exists payment_link_url text null;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'event_settings_payment_link_provider_check'
    ) then
      alter table event_settings
        add constraint event_settings_payment_link_provider_check
        check (
          payment_link_provider is null
          or payment_link_provider in ('revolut', 'wise')
        );
    end if;
  end $$;

  alter table event_series
    add column if not exists payment_link_provider text null,
    add column if not exists payment_link_url text null;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'event_series_payment_link_provider_check'
    ) then
      alter table event_series
        add constraint event_series_payment_link_provider_check
        check (
          payment_link_provider is null
          or payment_link_provider in ('revolut', 'wise')
        );
    end if;
  end $$;
`).catch(error => {
  console.error('Schema ensure hiba:', error);
});

pool.query(`
  create table if not exists registration_notification_log (
    id uuid primary key default gen_random_uuid(),
    created_user_id uuid null references users(id) on delete set null,
    created_user_email text null,
    created_user_registration_path text null,
    recipient_email text not null,
    email_subject text not null,
    platform_name text not null,
    counts_snapshot jsonb not null default '[]'::jsonb,
    delivery_status text not null,
    delivery_reason text null,
    delivery_error text null,
    delivery_message_id text null,
    attempted_at timestamptz not null default now(),
    created_at timestamptz not null default now()
  );

  create index if not exists registration_notification_log_attempted_idx
    on registration_notification_log(attempted_at desc);

  create index if not exists registration_notification_log_created_user_idx
    on registration_notification_log(created_user_id, attempted_at desc);

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'registration_notification_log_delivery_status_check'
    ) then
      alter table registration_notification_log
        add constraint registration_notification_log_delivery_status_check
        check (delivery_status in ('sent', 'skipped', 'failed'));
    end if;
  end $$;
`).catch(error => {
  console.error('Schema ensure hiba:', error);
});

pool.query(`
  create table if not exists event_email_action_log (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references events(id) on delete cascade,
    team_id uuid not null references teams(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    action text not null,
    status text not null,
    message text null,
    token_jti text null,
    metadata jsonb not null default '{}'::jsonb,
    acted_at timestamptz not null default now(),
    created_at timestamptz not null default now()
  );

  create index if not exists event_email_action_log_event_idx
    on event_email_action_log(event_id, acted_at desc);

  create index if not exists event_email_action_log_user_idx
    on event_email_action_log(user_id, acted_at desc);

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'event_email_action_log_action_check'
    ) then
      alter table event_email_action_log
        add constraint event_email_action_log_action_check
        check (action in ('register', 'skip'));
    end if;
  end $$;
`).catch(error => {
  console.error('Schema ensure hiba:', error);
});

  pool.query(`
    create table if not exists event_attendance_marks (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references events(id) on delete cascade,
    team_id uuid not null references teams(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    status text not null,
    note text null,
    payment_amount integer null,
    payment_recorded_at timestamptz null,
    marked_by_user_id uuid not null references users(id) on delete restrict,
    marked_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create unique index if not exists event_attendance_marks_event_user_unique_idx
    on event_attendance_marks(event_id, user_id);

  alter table event_attendance_marks
    add column if not exists payment_amount integer null,
    add column if not exists payment_recorded_at timestamptz null;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'event_attendance_marks_payment_amount_check'
    ) then
      alter table event_attendance_marks
        add constraint event_attendance_marks_payment_amount_check
        check (payment_amount is null or payment_amount >= 0);
    end if;
  end $$;

  alter table events
    drop constraint if exists chk_event_status;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'events_status_check'
    ) then
      alter table events
        add constraint events_status_check
        check (status in ('draft', 'published', 'cancelled', 'finished'));
    end if;
  end $$;

  alter table event_registrations
    drop constraint if exists chk_registration_status;

  alter table event_registrations
    drop constraint if exists event_registrations_registration_status_check;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'event_registrations_status_check'
    ) then
      alter table event_registrations
        add constraint event_registrations_status_check
        check (registration_status in ('going', 'waiting_list', 'waiting_list_rank', 'cancelled'));
    end if;
  end $$;
  `).catch(error => {
    console.error('Schema ensure hiba:', error);
  });

  pool.query(`
    create table if not exists event_financial_entries (
      id uuid primary key default gen_random_uuid(),
      team_id uuid not null references teams(id) on delete cascade,
      event_id uuid not null references events(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      attendance_status text not null,
      expected_base_amount integer not null default 0,
      expected_fee_amount integer not null default 0,
      expected_total_amount integer not null default 0,
      balance_before_event integer not null default 0,
      settlement_target_amount integer not null default 0,
      actual_paid_amount integer not null default 0,
      event_delta_amount integer not null default 0,
      balance_after_event integer not null default 0,
      recorded_by_user_id uuid not null references users(id) on delete restrict,
      recorded_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create unique index if not exists event_financial_entries_event_user_unique_idx
      on event_financial_entries(event_id, user_id);

    create index if not exists event_financial_entries_team_user_idx
      on event_financial_entries(team_id, user_id, recorded_at desc);

    create index if not exists event_financial_entries_team_event_idx
      on event_financial_entries(team_id, event_id);

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'event_financial_entries_attendance_status_check'
      ) then
        alter table event_financial_entries
          add constraint event_financial_entries_attendance_status_check
          check (attendance_status in ('present', 'no_show'));
      end if;
    end $$;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'event_financial_entries_expected_base_amount_check'
      ) then
        alter table event_financial_entries
          add constraint event_financial_entries_expected_base_amount_check
          check (expected_base_amount >= 0);
      end if;
    end $$;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'event_financial_entries_expected_fee_amount_check'
      ) then
        alter table event_financial_entries
          add constraint event_financial_entries_expected_fee_amount_check
          check (expected_fee_amount >= 0);
      end if;
    end $$;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'event_financial_entries_expected_total_amount_check'
      ) then
        alter table event_financial_entries
          add constraint event_financial_entries_expected_total_amount_check
          check (expected_total_amount >= 0);
      end if;
    end $$;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'event_financial_entries_settlement_target_amount_check'
      ) then
        alter table event_financial_entries
          add constraint event_financial_entries_settlement_target_amount_check
          check (settlement_target_amount >= 0);
      end if;
    end $$;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'event_financial_entries_actual_paid_amount_check'
      ) then
        alter table event_financial_entries
          add constraint event_financial_entries_actual_paid_amount_check
          check (actual_paid_amount >= 0);
      end if;
    end $$;
  `).catch(error => {
    console.error('Schema ensure hiba:', error);
  });

  pool.query(`
    create table if not exists team_financial_adjustments (
      id uuid primary key default gen_random_uuid(),
      team_id uuid not null references teams(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      adjustment_amount integer not null,
      note text null,
      balance_before_adjustment integer not null default 0,
      balance_after_adjustment integer not null default 0,
      recorded_by_user_id uuid not null references users(id) on delete restrict,
      recorded_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists team_financial_adjustments_team_user_idx
      on team_financial_adjustments(team_id, user_id, recorded_at desc);

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'team_financial_adjustments_nonzero_amount_check'
      ) then
        alter table team_financial_adjustments
          add constraint team_financial_adjustments_nonzero_amount_check
          check (adjustment_amount <> 0);
      end if;
    end $$;
  `).catch(error => {
    console.error('Schema ensure hiba:', error);
  });

app.disable('x-powered-by');
app.set('trust proxy', TRUST_PROXY);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('select now() as server_time');

    res.json({
      ok: true,
      message: 'Backend + adatbazis mukodik',
      dbTime: result.rows[0].server_time,
    });
  } catch (error) {
    console.error('DB hiba:', error);

    res.status(500).json({
      ok: false,
      message: 'Adatbazis kapcsolat hiba',
      error: error.message,
    });
  }
});

app.get('/api/version', (req, res) => {
  res.json({
    ok: true,
    version: getVersionInfo()
  });
});

app.use('/api', authRoutes);
app.use('/api', teamRoutes);
app.use('/api', eventRoutes);
app.use('/api', myRoutes);
app.use('/api', inviteRoutes);
app.use('/api', eventSeriesRoutes);
app.use('/api', teamSkillRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Szerver fut: http://localhost:${PORT}`);
  });
}

module.exports = app;
