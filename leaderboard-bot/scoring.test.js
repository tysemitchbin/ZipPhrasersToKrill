// Run: node scoring.test.js  (part of `npm test`)
const { rankPoints } = require('./scoring');

let failed = 0;
function check(label, got, want) {
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} -> ${got}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${want}`);
  }
}

console.log('--- no ties: winner = n, last = 1, one point per rank ---');
const noTies = [6, 20, 49, 70]; // lower-is-better, e.g. seconds
check('best (6)', rankPoints(6, noTies, true), 4);
check('2nd (20)', rankPoints(20, noTies, true), 3);
check('3rd (49)', rankPoints(49, noTies, true), 2);
check('worst (70)', rankPoints(70, noTies, true), 1);

console.log('\n--- competition ranking: ties skip ahead by tie count, not dense ---');
// 8 players, lower-is-better: three-way tie at 3, two-way at 4 and 5, one at 6
const wordleDay = [3, 3, 3, 4, 4, 5, 5, 6];
check('3-way tie at 3 -> rank 1 -> n', rankPoints(3, wordleDay, true), 8);
check('2-way tie at 4 -> rank 4 (skipped past the 3-tie)', rankPoints(4, wordleDay, true), 5);
check('2-way tie at 5 -> rank 6', rankPoints(5, wordleDay, true), 3);
check('last at 6 -> rank 8 -> min 1', rankPoints(6, wordleDay, true), 1);

console.log('\n--- higher-is-better (e.g. Krillion) ---');
const krillion = [230, 270, 285, 310, 325];
check('best (325, highest)', rankPoints(325, krillion, false), 5);
check('worst (230, lowest)', rankPoints(230, krillion, false), 1);

console.log('\n--- everyone tied -> everyone gets the max ---');
check('all tied at 60, n=3', rankPoints(60, [60, 60, 60], true), 3);

console.log('\n--- floor: rank can never push points below 1 ---');
check('large field, dead last', rankPoints(999, [1, 2, 3, 4, 5, 6, 7, 8, 999], true), 1);

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nall scoring tests passed');
