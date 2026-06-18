const teamBreakReminderService = require('../services/teamBreakReminderService');
const pool = require('../config/db');

function printHelp() {
  console.log(`
Team break reminders

Usage:
  node src/tools/processTeamBreakReminders.js [--dry-run] [--now=<ISO date>]

Options:
  --dry-run, --check   Only list members that would receive a reminder. No writes, no emails.
  --now=<ISO date>    Override current time for verification/tests.
  --help              Show this help.
`.trim());
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    help: false,
    now: new Date()
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
        dueMembers: await teamBreakReminderService.listDueBreakReminderMembers({ now: options.now })
      }
    : await teamBreakReminderService.sendDueBreakReminders({ now: options.now });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
