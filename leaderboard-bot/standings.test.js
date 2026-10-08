// Run: node standings.test.js  (part of `npm test`)
// Pins computeGameRanks/computePlayerTotals against small fabricated
// datasets - mirrors index.html's own version, so a change here should be
// mirrored there too (and vice versa).
const {
  computeGameRanks, computeSkillTotals, computePlayerStandings, computePlayerTotals,
  MIN_PLAYERS, VOLUME_PENALTY, RECENT_PENALTY, RECENT_DAYS,
} = require('./standings');

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

const score = (game_id, player_id, raw_score, play_date = '2026-10-01') => ({ game_id, player_id, raw_score, play_date });

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

// --- skill: weighted average rank across games (equal activity, so no penalties) ---
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
  const totals = computeSkillTotals(scores, games);
  check('a has the best (lowest) weighted average rank', totals.get('a'), 1);
  check('d has the worst (highest) weighted average rank', totals.get('d'), 4);
}

// --- volume: fewer total games than the most-played player costs a share
// of VOLUME_PENALTY; recent: each of the last RECENT_DAYS days missed costs
// an equal share of RECENT_PENALTY ---
{
  // same skill for everyone (one game, all tied), so only activity differs
  const scores = [];
  for (const d of ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']) {
    scores.push(score('wordle', 'a', 3, d)); // 4 games, played all 4 recent days
  }
  scores.push(score('wordle', 'b', 3, '2026-09-20'), score('wordle', 'b', 3, '2026-09-21')); // 2 games, none recent
  scores.push(score('wordle', 'c', 3, '2026-10-01'), score('wordle', 'c', 3, '2026-09-29')); // 2 games, 2 recent days
  scores.push(score('wordle', 'd', 3, '2026-10-01'), score('wordle', 'd', 3, '2026-10-01')); // 2 games, 1 recent day
  const games = [{ id: 'wordle', sort_direction: 'asc', weight: 1 }];
  const st = computePlayerStandings(scores, games, '2026-10-01');

  check('skill ignores activity', [...computeSkillTotals(scores, games).values()], [1, 1, 1, 1]);
  check('most games played -> no volume penalty', st.get('a').volume, 0);
  check('half as many games -> half the volume penalty', st.get('b').volume, VOLUME_PENALTY / 2);
  check('recent days counted within the window', ['a', 'b', 'c', 'd'].map((p) => st.get(p).recentDays), [4, 0, 2, 1]);
  check('no recent days -> full recent penalty', st.get('b').recent, RECENT_PENALTY);
  check('recent penalty scales per missed day',
    st.get('a').recent, RECENT_PENALTY * (RECENT_DAYS - 4) / RECENT_DAYS);
  check('total = skill + volume + recent', st.get('c').total, 1 + VOLUME_PENALTY / 2 + RECENT_PENALTY * 3 / 5);
  check('computePlayerTotals returns the totals',
    computePlayerTotals(scores, games, '2026-10-01').get('b'), 1 + VOLUME_PENALTY / 2 + RECENT_PENALTY);

  // asOf defaults to the latest play_date in the data
  check('asOf defaults to the latest play_date', computePlayerStandings(scores, games).get('a').recentDays, 4);
  // a later asOf slides the window forward: nobody has played since
  check('a later asOf counts nobody as recent',
    [...computePlayerStandings(scores, games, '2026-10-10').values()].map((v) => v.recentDays), [0, 0, 0, 0]);
}

if (failed) {
  console.error(`\n${failed} standings test(s) failed`);
  process.exit(1);
}
console.log('\nall standings tests passed');
