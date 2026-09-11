// Run: node scoring.test.js  (part of `npm test`)
const { wordlePoints, fieldPoints, skillPointsFor } = require('./scoring');

let failed = 0;
function check(label, got, want) {
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(40)} -> ${got}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${want}`);
  }
}

console.log('--- Wordle: fixed 1-6 guess scale ---');
check('1 guess', wordlePoints(1), 6);
check('2 guesses', wordlePoints(2), 5);
check('3 guesses', wordlePoints(3), 4);
check('4 guesses', wordlePoints(4), 3);
check('5 guesses', wordlePoints(5), 2);
check('6 guesses', wordlePoints(6), 1);
check('failed (7)', wordlePoints(7), 1); // floors at 1, never negative/zero

console.log('\n--- Wordle ties: identical score -> identical points, no rank compression ---');
const wordleDay = [3, 3, 3, 4, 4, 5, 5, 6];
for (const g of wordleDay) {
  check(`tied-day guesses=${g}`, skillPointsFor('wordle', g, wordleDay, true), wordlePoints(g));
}

console.log('\n--- fieldPoints: scales to the day\'s own best/worst ---');
check('lower-is-better: best of the day', fieldPoints(45, [45, 50, 60], true), 6);
check('lower-is-better: worst of the day', fieldPoints(60, [45, 50, 60], true), 1);
check('higher-is-better: best of the day', fieldPoints(300, [100, 200, 300], false), 6);
check('higher-is-better: worst of the day', fieldPoints(100, [100, 200, 300], false), 1);
check('everyone tied (range 0) -> max for all', fieldPoints(60, [60, 60, 60], true), 6);

console.log('\n--- skillPointsFor: routes wordle to the fixed table, others to fieldPoints ---');
check('wordle routes to wordlePoints', skillPointsFor('wordle', 3, [3, 4, 5], true), wordlePoints(3));
check('non-wordle routes to fieldPoints', skillPointsFor('zip', 45, [45, 50, 60], true), fieldPoints(45, [45, 50, 60], true));

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nall scoring tests passed');
