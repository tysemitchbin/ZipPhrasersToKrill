// Run: node announcements.test.js  (part of `npm test`)
// Checks every template's placeholders resolve - no stray "{foo}" left behind.
const a = require('./announcements');

const vars = {
  mascot: 'Feral Points Ferret',
  player: 'Rob',
  total: 121,
  flavor: 'a palindrome - same backwards!',
  bonus: 5,
  days: 7,
  prize: '🐚 Blue Shell',
  amount: '+7',
  players: '**Rob**, **Kai**',
  count: 6,
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

const pools = { INTROS: a.INTROS, MILESTONE: a.MILESTONE, STREAK: a.STREAK, ROULETTE: a.ROULETTE, SWEEP: a.SWEEP };
for (const [name, arr] of Object.entries(pools)) {
  arr.forEach((t, i) => check(`${name}[${i}]`, a.fill(t, vars)));
  console.log(`  (${arr.length} templates)`);
}
a.DOUBLE_SPIN.forEach((t, i) => check(`DOUBLE_SPIN[${i}]`, a.fill(t, vars)));

check('say.milestone', a.say.milestone(vars));
check('say.streak', a.say.streak(vars));
check('say.rouletteLine (x2)', a.say.rouletteLine(vars, true));
check('say.sweepLine', a.say.sweepLine(vars));

if (failed) {
  console.error(`\n${failed} template(s) failed`);
  process.exit(1);
}
console.log('\nall announcement templates resolve');
