const pool = require('../src/config/db');
const fs = require('fs');
const path = require('path');

const originalConsoleError = console.error;
const originalConsoleLog = console.log;

async function runSqlWithDeadlockRetry(sql, attempts = 5) {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await pool.query(sql);
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== '40P01' || attempt === attempts - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }

  throw lastError;
}

beforeAll(() => {
  const hiddenMigrationPath = path.join(
    __dirname,
    '..',
    'db',
    'migrations',
    '2026-04-11_event_admin_hidden.sql'
  );
  const hiddenMigrationSql = fs.readFileSync(hiddenMigrationPath, 'utf8');
  return pool.query(hiddenMigrationSql);
});

beforeAll(() => {
  const attendanceMigrationPath = path.join(
    __dirname,
    '..',
    'db',
    'migrations',
    '2026-04-13_event_attendance_marks.sql'
  );
  const attendanceMigrationSql = fs.readFileSync(attendanceMigrationPath, 'utf8');
  return pool.query(attendanceMigrationSql);
});

beforeAll(() => {
  const attendancePaymentsMigrationPath = path.join(
    __dirname,
    '..',
    'db',
    'migrations',
    '2026-04-13_event_attendance_payments.sql'
  );
  const attendancePaymentsMigrationSql = fs.readFileSync(attendancePaymentsMigrationPath, 'utf8');
  return pool.query(attendancePaymentsMigrationSql);
});

beforeAll(() => {
  const eventStatusMigrationPath = path.join(
    __dirname,
    '..',
    'db',
    'migrations',
    '2026-04-13_event_status_finished.sql'
  );
  const eventStatusMigrationSql = fs.readFileSync(eventStatusMigrationPath, 'utf8');
  return pool.query(eventStatusMigrationSql);
});

beforeAll(() => {
  const userCanCreateTeamMigrationPath = path.join(
    __dirname,
    '..',
    'db',
    'migrations',
    '2026-04-13_user_can_create_team.sql'
  );
  const userCanCreateTeamMigrationSql = fs.readFileSync(userCanCreateTeamMigrationPath, 'utf8');
  return pool.query(userCanCreateTeamMigrationSql);
});

beforeAll(() => runSqlWithDeadlockRetry(`
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
`));

beforeAll(() => runSqlWithDeadlockRetry(`
  alter table users
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
`));

beforeAll(() => runSqlWithDeadlockRetry(`
  alter table events
    add column if not exists location_latitude numeric null,
    add column if not exists location_longitude numeric null,
    add column if not exists location_place_id text null,
    add column if not exists location_formatted_address text null,
    add column if not exists location_geocoded_at timestamptz null;

  create index if not exists events_location_coordinates_idx
    on events(location_latitude, location_longitude)
    where location_latitude is not null
      and location_longitude is not null;

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
`));

beforeAll(() => {
  const teamRulesMigrationPath = path.join(
    __dirname,
    '..',
    'db',
    'migrations',
    '2026-05-27_team_rules_module.sql'
  );
  const teamRulesMigrationSql = fs.readFileSync(teamRulesMigrationPath, 'utf8');
  return pool.query(teamRulesMigrationSql);
});

beforeAll(() => runSqlWithDeadlockRetry(`
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
`));

beforeAll(() => runSqlWithDeadlockRetry(`
  alter table team_members
    add column if not exists break_started_at timestamptz null,
    add column if not exists break_until timestamptz null,
    add column if not exists break_extensions_count integer not null default 0,
    add column if not exists break_reminder_sent_at timestamptz null,
    add column if not exists passive_since timestamptz null,
    add column if not exists passive_reason text null;

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

  alter table event_email_action_log
    drop constraint if exists event_email_action_log_action_check;

  alter table event_email_action_log
    add constraint event_email_action_log_action_check
    check (action in ('register', 'skip', 'vacation_one_week'));

  create table if not exists team_break_action_log (
    id uuid primary key default gen_random_uuid(),
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

  create index if not exists team_break_action_log_team_user_idx
    on team_break_action_log(team_id, user_id, acted_at desc);

  alter table team_break_action_log
    drop constraint if exists team_break_action_log_action_check;

  alter table team_break_action_log
    add constraint team_break_action_log_action_check
    check (action in ('extend_break_one_week', 'end_break'));

  create table if not exists event_notification_schedules (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references events(id) on delete cascade,
    notification_type text not null,
    scheduled_at timestamptz not null,
    sent_at timestamptz null,
    status text not null default 'pending',
    attempt_count integer not null default 0,
    last_error text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'event_notification_schedules_type_check'
    ) then
      alter table event_notification_schedules
        add constraint event_notification_schedules_type_check
        check (notification_type in ('event_created'));
    end if;
  end $$;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'event_notification_schedules_status_check'
    ) then
      alter table event_notification_schedules
        add constraint event_notification_schedules_status_check
        check (status in ('pending', 'sent', 'skipped', 'failed'));
    end if;
  end $$;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'event_notification_schedules_attempt_count_check'
    ) then
      alter table event_notification_schedules
        add constraint event_notification_schedules_attempt_count_check
        check (attempt_count >= 0);
    end if;
  end $$;

  create unique index if not exists event_notification_schedules_event_type_unique_idx
    on event_notification_schedules(event_id, notification_type);

  create index if not exists event_notification_schedules_pending_due_idx
    on event_notification_schedules(scheduled_at, id)
    where status = 'pending';
`));

beforeAll(() => runSqlWithDeadlockRetry(`
  create table if not exists email_delivery_logs (
    id uuid primary key default gen_random_uuid(),
    team_id uuid null references teams(id) on delete set null,
    event_id uuid null references events(id) on delete set null,
    delivery_batch_id uuid null,
    recipient_user_id uuid null references users(id) on delete set null,
    recipient_email text not null,
    template text not null,
    status text not null,
    reason text null,
    provider_message_id text null,
    provider_event_id text null,
    provider_event_type text null,
    provider_payload jsonb null,
    delivered_at timestamptz null,
    bounced_at timestamptz null,
    complained_at timestamptz null,
    error_message text null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  alter table email_delivery_logs
    add column if not exists delivery_batch_id uuid null,
    add column if not exists provider_event_id text null,
    add column if not exists provider_event_type text null,
    add column if not exists provider_payload jsonb null,
    add column if not exists delivered_at timestamptz null,
    add column if not exists bounced_at timestamptz null,
    add column if not exists complained_at timestamptz null;

  alter table email_delivery_logs
    drop constraint if exists email_delivery_logs_status_check;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'email_delivery_logs_status_check'
    ) then
      alter table email_delivery_logs
        add constraint email_delivery_logs_status_check
        check (status in (
          'pending',
          'sent',
          'delivered',
          'bounced',
          'complained',
          'rejected',
          'skipped',
          'failed'
        ));
    end if;
  end $$;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'email_delivery_logs_recipient_email_check'
    ) then
      alter table email_delivery_logs
        add constraint email_delivery_logs_recipient_email_check
        check (length(trim(recipient_email)) > 0);
    end if;
  end $$;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'email_delivery_logs_template_check'
    ) then
      alter table email_delivery_logs
        add constraint email_delivery_logs_template_check
        check (length(trim(template)) > 0);
    end if;
  end $$;

  create index if not exists email_delivery_logs_team_created_idx
    on email_delivery_logs(team_id, created_at desc);

  create index if not exists email_delivery_logs_event_created_idx
    on email_delivery_logs(event_id, created_at desc);

  create index if not exists email_delivery_logs_batch_idx
    on email_delivery_logs(delivery_batch_id)
    where delivery_batch_id is not null;

  create index if not exists email_delivery_logs_recipient_created_idx
    on email_delivery_logs(recipient_email, created_at desc);

  create index if not exists email_delivery_logs_template_status_idx
    on email_delivery_logs(template, status, created_at desc);

  create index if not exists email_delivery_logs_team_template_created_idx
    on email_delivery_logs(team_id, template, created_at desc);

  create index if not exists email_delivery_logs_provider_message_idx
    on email_delivery_logs(provider_message_id)
    where provider_message_id is not null;

  create index if not exists email_delivery_logs_provider_event_idx
    on email_delivery_logs(provider_event_id)
    where provider_event_id is not null;
`));

beforeAll(() => {
  const rankWaitlistMigrationPath = path.join(
    __dirname,
    '..',
    'db',
    'migrations',
    '2026-04-17_event_registration_rank_waitlist.sql'
  );
  const rankWaitlistMigrationSql = fs.readFileSync(rankWaitlistMigrationPath, 'utf8');
  return pool.query(rankWaitlistMigrationSql);
});

beforeAll(() => {
  const guestRegistrationsMigrationPath = path.join(
    __dirname,
    '..',
    'db',
    'migrations',
    '2026-06-10_event_guest_registrations.sql'
  );
  const guestRegistrationsMigrationSql = fs.readFileSync(guestRegistrationsMigrationPath, 'utf8');
  return pool.query(guestRegistrationsMigrationSql);
});

beforeAll(() => {
  const adminGuideMigrationPath = path.join(
    __dirname,
    '..',
    'db',
    'migrations',
    '2026-06-11_admin_guide_module.sql'
  );
  const adminGuideMigrationSql = fs.readFileSync(adminGuideMigrationPath, 'utf8');
  return pool.query(adminGuideMigrationSql);
});

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    const [firstArg, secondArg] = args;

    const isExpectedAppError =
      typeof firstArg === 'string' &&
      (
        firstArg.includes('Jelentkezési hiba:') ||
        firstArg.includes('Esemény frissítési hiba:') ||
        firstArg.includes('Esemény státuszfrissítési hiba:')
      ) &&
      secondArg &&
      secondArg.statusCode;

    if (isExpectedAppError) {
      return;
    }

    originalConsoleError(...args);
  });

  jest.spyOn(console, 'log').mockImplementation((...args) => {
    const [firstArg] = args;

    const isDotenvNoise =
      typeof firstArg === 'string' &&
      firstArg.includes('[dotenv@');

    if (isDotenvNoise) {
      return;
    }

    originalConsoleLog(...args);
  });
});

afterAll(async () => {
  console.error.mockRestore();
  console.log.mockRestore();
  await pool.end();
});
