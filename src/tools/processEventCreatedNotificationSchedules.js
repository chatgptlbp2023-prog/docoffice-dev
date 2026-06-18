const eventNotificationScheduleService = require('../services/eventNotificationScheduleService');
const pool = require('../config/db');

function printHelp() {
  console.log(`
Event created notification schedules

Usage:
  node src/tools/processEventCreatedNotificationSchedules.js [--dry-run] [--now=<ISO date>] [--limit=<number>]

Options:
  --dry-run, --check   Only list schedules that would be processed. No writes, no emails.
  --now=<ISO date>    Override current time for verification/tests.
  --limit=<number>    Maximum schedules to process. Default: 50.
  --help              Show this help.
`.trim());
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    help: false,
    now: new Date(),
    limit: 50
  };

  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '--check') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg.startsWith('--now=')) {
      const rawValue = arg.slice('--now='.length);
      const parsed = new Date(rawValue);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Invalid --now value: ${rawValue}`);
      }
      options.now = parsed;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const rawValue = arg.slice('--limit='.length);
      const parsed = Number.parseInt(rawValue, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`Invalid --limit value: ${rawValue}`);
      }
      options.limit = parsed;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const result = options.dryRun
    ? {
        checkedAt: options.now.toISOString(),
        dueSchedules: await eventNotificationScheduleService.listDueEventCreatedNotificationSchedules({
          now: options.now,
          limit: options.limit
        })
      }
    : await eventNotificationScheduleService.processDueEventCreatedNotifications({
        now: options.now,
        limit: options.limit
      });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});

