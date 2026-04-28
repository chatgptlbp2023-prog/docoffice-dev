const eventAutomationService = require('../services/eventAutomationService');

async function main() {
  const result = await eventAutomationService.processDueAutoTeamDrawEvents({
    now: new Date()
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
