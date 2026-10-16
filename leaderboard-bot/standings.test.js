// Run: node standings.test.js  (part of `npm test`)
// Pins computeDailyPoints/computePlayerTotals against small fabricated
// datasets - mirrors index.html's own version, so a change here should be
// mirrored there too (and vice versa).
const { computeDailyPoints, computePlayerTotals, shiftDate, WINDOW_DAYS } = require('./standings');

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`PASS  ${label}`);
  } else {
    console.log(`FAIL  ${label}\n  got:      ${a}\n  expected: ${e}`);
    failed++;
  }
}

const score = (game_id, player_id, play_date, raw_score) => ({ game_id, player_id, play_date, raw_score });
const games = [
  { id: 'krillion', sort_direction: 'desc', weight: 3 },
  { id: 'zip', sort_direction: 'asc', weight: 1 },
  { id: 'wordle', sort_direction: 'asc', weight: 3 },
];
const pointsOn = (daily, player, date) => (daily.get(player) || new Map()).get(date) || 0;

// --- one game, one day: 5/3/2/1 by place, weights ignored ---
{
  const d = '2026-10-11';
  const daily = computeDailyPoints([
    score('krillion', 'a', d, 415), score('krillion', 'b', d, 385),
    score('krillion', 'c', d, 335), score('krillion', 'd', d, 285),
  ], games);
  check('4 players: 5/3/2/1 points, no weighting',
    ['a', 'b', 'c', 'd'].map((p) => pointsOn(daily, p, d)), [5, 3, 2, 1]);
}

// --- a place is worth the same however many people played ---
{
  const d = '2026-10-10';
  const daily = computeDailyPoints([
    score('zip', 'a', d, 20), score('zip', 'b', d, 30),
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((p, i) => score('krillion', p, d, 400 - i * 10)),
  ], games);
  // a wins both: 5 + 5;  b is 2nd in both: 3 + 3;  h is 8th in Krillion: 1
  check('2-player win = 8-player win = 5',
    ['a', 'b', 'h'].map((p) => pointsOn(daily, p, d)), [10, 6, 1]);
}

// --- ties share a place, next place skips ahead ---
{
  const d = '2026-10-08';
  const daily = computeDailyPoints([
    score('krillion', 'a', d, 330), score('krillion', 'b', d, 330), score('krillion', 'c', d, 280),
  ], games);
  check('tie for 1st: 5/5, then 3rd gets 2',
    ['a', 'b', 'c'].map((p) => pointsOn(daily, p, d)), [5, 5, 2]);
}

// --- a game only counts on a day when at least 2 people played it ---
{
  const d = '2026-10-05';
  const daily = computeDailyPoints([score('wordle', 'a', d, 3)], games);
  check('solo game-day earns nothing', pointsOn(daily, 'a', d), 0);
}

// --- points from different games on the same day add up ---
{
  const d = '2026-09-29';
  const daily = computeDailyPoints([
    score('krillion', 'a', d, 300), score('krillion', 'b', d, 200),
    score('zip', 'a', d, 40), score('zip', 'b', d, 30),
    score('wordle', 'a', d, 3), score('wordle', 'b', d, 7),
  ], games);
  // a: krillion 5 + zip 3 + wordle 3 = 11;  b: krillion 3 + zip 5 + wordle 0 = 8
  check('same-day games add up (Wordle on its fixed table)',
    [pointsOn(daily, 'a', d), pointsOn(daily, 'b', d)], [11, 8]);
}

// --- totals only count the last WINDOW_DAYS days, ending on endDate ---
{
  const end = '2026-10-11';
  const first = shiftDate(end, -(WINDOW_DAYS - 1)); // still in the window
  const tooOld = shiftDate(end, -WINDOW_DAYS);      // one day too old
  const scores = [
    score('krillion', 'a', tooOld, 400), score('krillion', 'b', tooOld, 100),
    score('krillion', 'a', first, 100), score('krillion', 'b', first, 400),
    score('krillion', 'a', end, 400), score('krillion', 'b', end, 100),
    score('krillion', 'a', shiftDate(end, 1), 400), score('krillion', 'b', shiftDate(end, 1), 100), // after endDate
  ];
  const totals = computePlayerTotals(scores, games, end);
  check(`window is ${WINDOW_DAYS} days, inclusive of both ends`, [totals.get('a'), totals.get('b')], [8, 8]);
}

if (failed) {
  console.error(`\n${failed} standings test(s) failed`);
  process.exit(1);
}
console.log('\nall standings tests passed');
