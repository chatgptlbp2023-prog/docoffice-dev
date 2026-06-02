const eventAutomationService = require('../services/eventAutomationService');
const pool = require('../config/db');

function printHelp() {
  console.log(`
Prestart event automation

Usage:
  node src/tools/processPrestartEventAutomation.js [--dry-run] [--now=<ISO date>]

Options:
  --dry-run, --check   Only list events that would be processed. No writes, no emails.
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
        throw new Error(`Érvénytelen --now érték: ${rawValue}`);
      }
      options.now = parsed;
      continue;
    }

    throw new Error(`Ismeretlen argumentum: ${arg}`);
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
    ? await eventAutomationService.previewDueAutoTeamDrawEvents({ now: options.now })
    : await eventAutomationService.processDueAutoTeamDrawEvents({ now: options.now });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
