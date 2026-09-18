// Run: node announcements.test.js  (part of `npm test`)
// Checks every template's placeholders resolve - no stray "{foo}" left behind.
const a = require('./announcements');

const vars = {
  mascot: 'Feral Points Ferret',
  player: 'Rob',
  days: 7,
  players: '**Rob**, **Kai**',
  count: 6,
  topPlayer: 'Rob',
  topPoints: 14,
  playerCount: 7,
  gameCount: 5,
  creature: '🦄 Unicorn',
  rarity: 'common',
  tickets: 4,
};

let failed = 0;
function check(label, str) {
  const leftover = str.match(/\{[A-Za-z]+\}/g);
  if (leftover) {
    console.log(`FAIL  ${label} - unresolved ${leftover.join(', ')}`);
    failed++;
  } else {
    console.log(`PASS  ${label}`);
  }
}

const pools = { INTROS: a.INTROS, STREAK: a.STREAK, SWEEP: a.SWEEP, RAFFLE: a.RAFFLE, RECAP: a.RECAP };
for (const [name, arr] of Object.entries(pools)) {
  arr.forEach((t, i) => check(`${name}[${i}]`, a.fill(t, vars)));
  console.log(`  (${arr.length} templates)`);
}

check('say.streak', a.say.streak(vars));
check('say.sweepLine', a.say.sweepLine(vars));
check('say.raffle', a.say.raffle(vars));
check('say.recap', a.say.recap(vars));

if (failed) {
  console.error(`\n${failed} template(s) failed`);
  process.exit(1);
}
console.log('\nall announcement templates resolve');
