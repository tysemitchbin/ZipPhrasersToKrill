// Run: node standings.test.js  (part of `npm test`)
// Pins computeGameRanks/computePlayerTotals against small fabricated
// datasets - mirrors index.html's own version, so a change here should be
// mirrored there too (and vice versa).
const {
  computeGameRanks, computeSkillTotals, computeGameActivity, computePlayerStandings, computePlayerTotals,
  MIN_PLAYERS, RECENT_PENALTY, RECENT_DAYS, ACTIVE_GAME_DAYS,
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

// --- recent: each of the last RECENT_DAYS days missed costs an equal share
// of RECENT_PENALTY (+1 a day); total games played doesn't matter ---
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
  check('one missed day costs +1', RECENT_PENALTY / RECENT_DAYS, 1);
  check('recent days counted within the window', ['a', 'b', 'c', 'd'].map((p) => st.get(p).recentDays), [4, 0, 2, 1]);
  check('no recent days -> full recent penalty', st.get('b').recent, RECENT_PENALTY);
  check('recent penalty scales per missed day',
    st.get('a').recent, RECENT_PENALTY * (RECENT_DAYS - 4) / RECENT_DAYS);
  check('total = skill + recent', st.get('c').total, 1 + 3);
  check('more total games alone does not help', st.get('a').total - st.get('a').recent, st.get('b').total - st.get('b').recent);
  check('computePlayerTotals returns the totals',
    computePlayerTotals(scores, games, '2026-10-01').get('b'), 1 + RECENT_PENALTY);

  // asOf defaults to the latest play_date in the data
  check('asOf defaults to the latest play_date', computePlayerStandings(scores, games).get('a').recentDays, 4);
  // a later asOf slides the recent window forward
  check('a later asOf slides the recent window',
    ['a', 'b', 'c', 'd'].map((p) => computePlayerStandings(scores, games, '2026-10-03').get(p).recentDays), [3, 0, 2, 1]);
  // ...and a game that's gone quiet still counts (everyone keeps a row)
  check('a quiet game still counts', computePlayerStandings(scores, games, '2026-12-31').size, 4);
}

// --- each game's weight is multiplied by 1 + how many different people
// played it in the last ACTIVE_GAME_DAYS days, so busy games count more
// and quiet ones still count, just less ---
{
  const scores = [
    // tango: 4 players, but only long ago -> activity 0, weight x1
    score('tango', 'a', 10, '2026-09-01'), score('tango', 'b', 20, '2026-09-01'),
    score('tango', 'c', 30, '2026-09-01'), score('tango', 'd', 40, '2026-09-01'),
    // wordle: 4 players this week -> activity 4, weight x5; a is worst here
    score('wordle', 'a', 6, '2026-10-01'), score('wordle', 'b', 2, '2026-10-01'),
    score('wordle', 'c', 3, '2026-09-30'), score('wordle', 'd', 4, '2026-09-29'),
    // zip: 1 recent player (same person twice counts once)
    score('zip', 'a', 5, '2026-10-01'), score('zip', 'a', 6, '2026-09-30'),
  ];
  const games = [
    { id: 'tango', sort_direction: 'asc', weight: 1 },
    { id: 'wordle', sort_direction: 'asc', weight: 1 },
    { id: 'zip', sort_direction: 'asc', weight: 1 },
  ];
  check('activity = different players in the window',
    Object.fromEntries(computeGameActivity(scores, '2026-10-01')), { wordle: 4, zip: 1 });
  check('a game played exactly ACTIVE_GAME_DAYS ago has dropped out of the window',
    computeGameActivity(scores, '2026-09-' + String(1 + ACTIVE_GAME_DAYS).padStart(2, '0')).has('tango'), false);
  check('a game played ACTIVE_GAME_DAYS - 1 days ago is still in the window',
    computeGameActivity(scores, '2026-09-' + String(ACTIVE_GAME_DAYS).padStart(2, '0')).get('tango'), 4);
  // a: tango #1 (weight 1 x 1), wordle #4 (weight 1 x 5) -> (1 + 20) / 6 = 3.5
  // (zip has only 1 player, so it never ranks - MIN_PLAYERS)
  check('busy game outweighs a quiet one', computePlayerStandings(scores, games, '2026-10-01').get('a').skill, 3.5);
  check('computeSkillTotals with no activity uses base weights', computeSkillTotals(scores, games).get('a'), 2.5);
  // games.weight still multiplies in: wordle weight 3 -> x15 vs tango x1
  const weighted = games.map((g) => (g.id === 'wordle' ? { ...g, weight: 3 } : g));
  check('base game weight still applies', computePlayerStandings(scores, weighted, '2026-10-01').get('a').skill, (1 + 4 * 15) / 16);
}

if (failed) {
  console.error(`\n${failed} standings test(s) failed`);
  process.exit(1);
}
console.log('\nall standings tests passed');
