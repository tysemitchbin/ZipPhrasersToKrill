// Run: node standings.test.js  (part of `npm test`)
// Pins computeGameRanks/computePlayerTotals against small fabricated
// datasets - mirrors index.html's own version, so a change here should be
// mirrored there too (and vice versa).
const { computeGameRanks, computePlayerTotals, MIN_PLAYERS } = require('./standings');

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

const score = (game_id, player_id, raw_score) => ({ game_id, player_id, raw_score });

// --- MIN_PLAYERS gate: fewer than 4 eligible players -> game doesn't rank ---
{
  const scores = [
    score('wordle', 'a', 1), score('wordle', 'b', 2), score('wordle', 'c', 3),
  ];
  const games = [{ id: 'wordle', sort_direction: 'asc', weight: 1 }];
  const ranks = computeGameRanks(scores, games);
  check('3 players < MIN_PLAYERS -> no rank for the game', ranks.has('wordle'), false);
}

// --- lower-is-better ranking, 4 eligible players ---
{
  const scores = [
    score('wordle', 'a', 1), score('wordle', 'b', 2), score('wordle', 'c', 3), score('wordle', 'd', 4),
  ];
  const games = [{ id: 'wordle', sort_direction: 'asc', weight: 1 }];
  const ranks = computeGameRanks(scores, games);
  const byPlayer = Object.fromEntries(ranks.get('wordle').map((r) => [r.playerId, r.rank]));
  check('lower avg -> rank 1', byPlayer, { a: 1, b: 2, c: 3, d: 4 });
}

// --- higher-is-better ranking ---
{
  const scores = [
    score('krillion', 'a', 100), score('krillion', 'b', 300), score('krillion', 'c', 200), score('krillion', 'd', 50),
  ];
  const games = [{ id: 'krillion', sort_direction: 'desc', weight: 1 }];
  const ranks = computeGameRanks(scores, games);
  const byPlayer = Object.fromEntries(ranks.get('krillion').map((r) => [r.playerId, r.rank]));
  check('higher avg -> rank 1', byPlayer, { b: 1, c: 2, a: 3, d: 4 });
}

// --- ties share a rank, next distinct value skips ahead by the tie count ---
{
  const scores = [
    score('wordle', 'a', 3), score('wordle', 'b', 3), score('wordle', 'c', 3), score('wordle', 'd', 4),
  ];
  const games = [{ id: 'wordle', sort_direction: 'asc', weight: 1 }];
  const ranks = computeGameRanks(scores, games);
  const byPlayer = Object.fromEntries(ranks.get('wordle').map((r) => [r.playerId, r.rank]));
  check('3-way tie at rank 1, next player is rank 4', byPlayer, { a: 1, b: 1, c: 1, d: 4 });
}

// --- eligibility: a player under half the league's average play count for
// that game is excluded from ranking it, even if MIN_PLAYERS is otherwise met ---
{
  const scores = [
    score('wordle', 'a', 1), score('wordle', 'a', 1), score('wordle', 'a', 1), score('wordle', 'a', 1),
    score('wordle', 'b', 2), score('wordle', 'b', 2), score('wordle', 'b', 2), score('wordle', 'b', 2),
    score('wordle', 'c', 3), score('wordle', 'c', 3), score('wordle', 'c', 3), score('wordle', 'c', 3),
    score('wordle', 'd', 4), score('wordle', 'd', 4), score('wordle', 'd', 4), score('wordle', 'd', 4),
    score('wordle', 'e', 5), // one lucky play, league avg is 4, needs >= 2 to be eligible
  ];
  const games = [{ id: 'wordle', sort_direction: 'asc', weight: 1 }];
  const ranks = computeGameRanks(scores, games);
  const playerIds = ranks.get('wordle').map((r) => r.playerId).sort();
  check('under half the league average plays is excluded', playerIds, ['a', 'b', 'c', 'd']);
}

// --- computePlayerTotals: weighted average rank across games ---
{
  const scores = [
    score('wordle', 'a', 1), score('wordle', 'b', 2), score('wordle', 'c', 3), score('wordle', 'd', 4),
    score('krillion', 'a', 300), score('krillion', 'b', 200), score('krillion', 'c', 100), score('krillion', 'd', 50),
  ];
  const games = [
    { id: 'wordle', sort_direction: 'asc', weight: 3 },
    { id: 'krillion', sort_direction: 'desc', weight: 1 },
  ];
  // a: wordle rank 1 (weight 3), krillion rank 1 (weight 1) -> (1*3 + 1*1) / 4 = 1
  // d: wordle rank 4 (weight 3), krillion rank 4 (weight 1) -> (4*3 + 4*1) / 4 = 4
  const totals = computePlayerTotals(scores, games);
  check('a has the best (lowest) weighted average rank', totals.get('a'), 1);
  check('d has the worst (highest) weighted average rank', totals.get('d'), 4);
}

if (failed) {
  console.error(`\n${failed} standings test(s) failed`);
  process.exit(1);
}
console.log('\nall standings tests passed');
