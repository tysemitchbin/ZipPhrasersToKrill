// Run: node scoring.test.js  (part of `npm test`)
const { rankPoints, wordlePoints, gamePoints } = require('./scoring');

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
const tieDay = [3, 3, 3, 4, 4, 5, 5, 6];
check('3-way tie at 3 -> rank 1 -> n', rankPoints(3, tieDay, true), 8);
check('2-way tie at 4 -> rank 4 (skipped past the 3-tie)', rankPoints(4, tieDay, true), 5);
check('2-way tie at 5 -> rank 6', rankPoints(5, tieDay, true), 3);
check('last at 6 -> rank 8 -> min 1', rankPoints(6, tieDay, true), 1);

console.log('\n--- higher-is-better (e.g. Krillion) ---');
const krillion = [230, 270, 285, 310, 325];
check('best (325, highest)', rankPoints(325, krillion, false), 5);
check('worst (230, lowest)', rankPoints(230, krillion, false), 1);

console.log('\n--- everyone tied -> everyone gets the max ---');
check('all tied at 60, n=3', rankPoints(60, [60, 60, 60], true), 3);

console.log('\n--- floor: rank can never push points below 1 ---');
check('large field, dead last', rankPoints(999, [1, 2, 3, 4, 5, 6, 7, 8, 999], true), 1);

console.log('\n--- Wordle: fixed table by guess count, ignores the field entirely ---');
check('1 guess', wordlePoints(1), 6);
check('2 guesses', wordlePoints(2), 5);
check('3 guesses', wordlePoints(3), 4);
check('4 guesses', wordlePoints(4), 3);
check('5 guesses', wordlePoints(5), 2);
check('6 guesses', wordlePoints(6), 1);
check('failed (X/6, stored as 7)', wordlePoints(7), 0);
// a 3-way tie at 4 guesses no longer costs the next player extra points
// for the tie itself - they still just get 3 points for their own 4 guesses
check('tie has no effect on wordlePoints', wordlePoints(4), 3);

console.log('\n--- gamePoints: routes Wordle to the fixed table, everything else to rankPoints ---');
check('gamePoints wordle uses fixed table', gamePoints('wordle', 4, [4, 4, 4, 5, 6], true), 3);
check('gamePoints krillion uses rankPoints', gamePoints('krillion', 325, [230, 270, 285, 310, 325], false), 5);

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nall scoring tests passed');
