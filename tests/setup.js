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
  alter table users
    add column if not exists payment_provider text null,
    add column if not exists payment_username text null,
    add column if not exists payment_qr_data_url text null;

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
