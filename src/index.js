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
const emailWebhookRoutes = require('./routes/emailWebhookRoutes');

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
    add column if not exists platform_role text not null default 'user',
    add column if not exists auth_provider text not null default 'local',
    add column if not exists google_sub text null,
    add column if not exists phone text null,
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
      where conname = 'users_platform_role_check'
    ) then
      alter table users
        add constraint users_platform_role_check
        check (platform_role in ('platform_owner', 'user'));
    end if;
  end $$;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'users_auth_provider_check'
    ) then
      alter table users
        add constraint users_auth_provider_check
        check (auth_provider in ('local', 'google'));
    end if;
  end $$;

  create unique index if not exists users_google_sub_unique_idx
    on users(google_sub)
    where google_sub is not null;

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
    add column if not exists notification_preferences jsonb not null default '{
      "notifyTeamOnCreate": true,
      "notifyAllOnNewRegistration": false,
      "notifyAllWhenTwoSpotsLeft": true,
      "notifyAllWhenFull": true,
      "notifyWaitlistPromotion": true,
      "notifyTeamDrawPublished": true,
      "enableAutoTeamDrawOneHourBefore": true,
      "notifyParticipantsOnEventUpdate": true,
      "notifyParticipantsOnEventCancel": true,
      "notifyWeatherAlerts": false
    }'::jsonb,
    add column if not exists auto_prestart_processed_at timestamptz null,
    add column if not exists auto_prestart_outcome text null,
    add column if not exists payment_link_provider text null,
    add column if not exists payment_link_url text null;

  update event_settings
  set notification_preferences =
    coalesce(notification_preferences, '{}'::jsonb)
    || jsonb_build_object(
      'notifyTeamOnCreate', coalesce((notification_preferences ->> 'notifyTeamOnCreate')::boolean, true),
      'notifyAllOnNewRegistration', coalesce((notification_preferences ->> 'notifyAllOnNewRegistration')::boolean, false),
      'notifyAllWhenTwoSpotsLeft', coalesce((notification_preferences ->> 'notifyAllWhenTwoSpotsLeft')::boolean, true),
      'notifyAllWhenFull', coalesce((notification_preferences ->> 'notifyAllWhenFull')::boolean, true),
      'notifyWaitlistPromotion', coalesce((notification_preferences ->> 'notifyWaitlistPromotion')::boolean, true),
      'notifyTeamDrawPublished', coalesce((notification_preferences ->> 'notifyTeamDrawPublished')::boolean, true),
      'enableAutoTeamDrawOneHourBefore', coalesce((notification_preferences ->> 'enableAutoTeamDrawOneHourBefore')::boolean, true),
      'notifyParticipantsOnEventUpdate', coalesce((notification_preferences ->> 'notifyParticipantsOnEventUpdate')::boolean, true),
      'notifyParticipantsOnEventCancel', coalesce((notification_preferences ->> 'notifyParticipantsOnEventCancel')::boolean, true),
      'notifyWeatherAlerts', coalesce((notification_preferences ->> 'notifyWeatherAlerts')::boolean, false)
    );

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
  alter table teams
    add column if not exists skill_balancing_enabled boolean not null default true,
    add column if not exists skill_balance_tolerance_percent integer not null default 15,
    add column if not exists draw_strategy text not null default 'auto_balanced',
    add column if not exists goalkeeper_module_enabled boolean not null default true,
    add column if not exists rank_module_enabled boolean not null default false,
    add column if not exists cash_module_enabled boolean not null default false,
    add column if not exists discipline_module_enabled boolean not null default false,
    add column if not exists admin_guide_module_enabled boolean not null default false;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'teams_draw_strategy_check'
    ) then
      alter table teams
        add constraint teams_draw_strategy_check
        check (draw_strategy in ('auto_balanced', 'random', 'sum_balance'));
    end if;
  end $$;

  alter table teams
    add column if not exists rules_module_enabled boolean not null default false,
    add column if not exists rules_text text null,
    add column if not exists rules_version integer not null default 1,
    add column if not exists rules_updated_at timestamptz null,
    add column if not exists rules_updated_by_user_id uuid null references users(id) on delete set null;

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'teams_rules_version_check'
    ) then
      alter table teams
        add constraint teams_rules_version_check
        check (rules_version >= 1);
    end if;
  end $$;

  create table if not exists team_rule_acceptances (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references teams(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    rules_version integer not null,
    accepted_at timestamptz not null default now(),
    created_at timestamptz not null default now()
  );

  create unique index if not exists team_rule_acceptances_team_user_version_idx
    on team_rule_acceptances(team_id, user_id, rules_version);

  create index if not exists team_rule_acceptances_team_user_idx
    on team_rule_acceptances(team_id, user_id, accepted_at desc);

  do $$
  begin
    if not exists (
      select 1
      from pg_constraint
      where conname = 'team_rule_acceptances_rules_version_check'
    ) then
      alter table team_rule_acceptances
        add constraint team_rule_acceptances_rules_version_check
        check (rules_version >= 1);
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
`).catch(error => {
  console.error('Schema ensure hiba:', error);
});

pool.query(`
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

  create table if not exists event_guest_registrations (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references events(id) on delete cascade,
    team_id uuid not null references teams(id) on delete cascade,
    host_user_id uuid not null references users(id) on delete cascade,
    guest_name text not null,
    registration_status varchar(20) not null,
    registered_at timestamptz not null default now(),
    cancelled_at timestamptz null,
    promoted_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint event_guest_registrations_status_check
      check (registration_status in ('going', 'waiting_list', 'cancelled')),
    constraint event_guest_registrations_guest_name_check
      check (length(trim(guest_name)) between 2 and 120),
    constraint event_guest_registrations_cancelled_at_check
      check (
        (registration_status = 'cancelled' and cancelled_at is not null)
        or registration_status <> 'cancelled'
      )
  );

  create unique index if not exists ux_event_guest_registrations_active_host
    on event_guest_registrations(event_id, host_user_id)
    where registration_status in ('going', 'waiting_list');

  create index if not exists idx_event_guest_registrations_event_id
    on event_guest_registrations(event_id);

  create index if not exists idx_event_guest_registrations_team_id
    on event_guest_registrations(team_id);

  create index if not exists idx_event_guest_registrations_host_user_id
    on event_guest_registrations(host_user_id);

  create index if not exists idx_event_guest_registrations_status
    on event_guest_registrations(registration_status);

  create index if not exists idx_event_guest_registrations_registered_at
    on event_guest_registrations(registered_at);
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
app.use(emailWebhookRoutes);

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
