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

console.log('--- no ties: 1st 5, 2nd 3, 3rd 2, everyone below 1 ---');
const noTies = [6, 20, 49, 70, 90]; // lower-is-better, e.g. seconds
check('1st (6)', rankPoints(6, noTies, true), 5);
check('2nd (20)', rankPoints(20, noTies, true), 3);
check('3rd (49)', rankPoints(49, noTies, true), 2);
check('4th (70)', rankPoints(70, noTies, true), 1);
check('5th (90)', rankPoints(90, noTies, true), 1);

console.log('\n--- field size never changes what a place is worth ---');
check('win a 2-player game', rankPoints(10, [10, 20], true), 5);
check('lose a 2-player game', rankPoints(20, [10, 20], true), 3);
check('win a 9-player game', rankPoints(1, [1, 2, 3, 4, 5, 6, 7, 8, 9], true), 5);
check('dead last of 9', rankPoints(9, [1, 2, 3, 4, 5, 6, 7, 8, 9], true), 1);

console.log('\n--- competition ranking: ties share a place, next skips ahead ---');
// 8 players, lower-is-better: three-way tie at 3, two-way at 4 and 5, one at 6
const tieDay = [3, 3, 3, 4, 4, 5, 5, 6];
check('3-way tie at 3 -> all 1st -> 5', rankPoints(3, tieDay, true), 5);
check('2-way tie at 4 -> 4th (skipped past the 3-tie)', rankPoints(4, tieDay, true), 1);
check('tie for 2nd -> both 3', rankPoints(20, [10, 20, 20, 30], true), 3);
check('after a tie for 2nd -> 4th -> 1', rankPoints(30, [10, 20, 20, 30], true), 1);

console.log('\n--- higher-is-better (e.g. Krillion) ---');
const krillion = [230, 270, 285, 310, 325];
check('best (325, highest)', rankPoints(325, krillion, false), 5);
check('3rd (285)', rankPoints(285, krillion, false), 2);
check('worst (230, lowest)', rankPoints(230, krillion, false), 1);

console.log('\n--- everyone tied -> everyone gets 1st ---');
check('all tied at 60, n=3', rankPoints(60, [60, 60, 60], true), 5);

console.log('\n--- Wordle: fixed table by guess count, ignores the field entirely ---');
check('1 guess', wordlePoints(1), 5);
check('2 guesses', wordlePoints(2), 5);
check('3 guesses', wordlePoints(3), 3);
check('4 guesses', wordlePoints(4), 2);
check('5 guesses', wordlePoints(5), 1);
check('6 guesses', wordlePoints(6), 1);
check('failed (X/6, stored as 7)', wordlePoints(7), 0);

console.log('\n--- gamePoints: routes Wordle to the fixed table, everything else to rankPoints ---');
check('gamePoints wordle uses fixed table', gamePoints('wordle', 4, [4, 4, 4, 5, 6], true), 2);
check('gamePoints krillion uses rankPoints', gamePoints('krillion', 325, [230, 270, 285, 310, 325], false), 5);

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nall scoring tests passed');
