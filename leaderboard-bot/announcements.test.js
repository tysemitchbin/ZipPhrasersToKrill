// Run: node announcements.test.js  (part of `npm test`)
// Checks every template's placeholders resolve - no stray "{foo}" left behind.
const a = require('./announcements');

const vars = {
  mascot: 'Feral Points Ferret',
  player: 'Rob',
  days: 100,
  game: 'Krillion',
  podium: '**Rob**, **Kai**, **Sam**, in that order',
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

const pools = { INTROS: a.INTROS, PODIUM: a.PODIUM, RAFFLE: a.RAFFLE, STREAK_MILESTONE: a.STREAK_MILESTONE };
for (const [name, arr] of Object.entries(pools)) {
  arr.forEach((t, i) => check(`${name}[${i}]`, a.fill(t, vars)));
  console.log(`  (${arr.length} templates)`);
}

check('say.intro', a.say.intro(vars));
check('say.podium', a.say.podium(vars));
check('say.raffle', a.say.raffle(vars));
check('say.streakMilestone', a.say.streakMilestone(vars));

if (failed) {
  console.error(`\n${failed} template(s) failed`);
  process.exit(1);
}
console.log('\nall announcement templates resolve');
