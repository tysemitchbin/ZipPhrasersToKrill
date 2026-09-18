// Mirrors index.html's computeGameRanks/computePlayerTotals - the website's
// Standings math (weighted average rank across every game, lower is
// better, like a golfer's average finish). Kept in its own module, same
// way scoring.js is, so a test file can pin the exact numbers; mirrored
// byte-for-byte in index.html's <script>. Used by the bot to announce the
// real top 3 at the 20:00 close, instead of a separate points system the
// website doesn't use.

// A game only produces a rank at all once at least this many people have
// EVER played it (checked after the eligibility filter below, so it's this
// many ELIGIBLE players, not just this many who've ever posted a score).
const MIN_PLAYERS = 4;

// gameId -> [{playerId, avg, plays, rank}], one entry per player who's
// ever played that game, ranked by their AVERAGE raw score against
// everyone else eligible in it. A player is only eligible in a game once
// they've played it at least half as often as that game's own average
// play count - one lucky play can't earn a rank next to people who've
// actually put in the reps.
function computeGameRanks(scores, games) {
  const byGame = new Map(); // gameId -> playerId -> {sum, plays}
  for (const s of scores) {
    if (!byGame.has(s.game_id)) byGame.set(s.game_id, new Map());
    const byPlayer = byGame.get(s.game_id);
    const cur = byPlayer.get(s.player_id) || { sum: 0, plays: 0 };
    cur.sum += Number(s.raw_score);
    cur.plays += 1;
    byPlayer.set(s.player_id, cur);
  }

  const gamesById = new Map(games.map((g) => [g.id, g]));
  const ranks = new Map();
  for (const [gameId, byPlayer] of byGame) {
    const game = gamesById.get(gameId) || { sort_direction: 'desc' };
    const lowerIsBetter = game.sort_direction === 'asc';

    const allPlayCounts = [...byPlayer.values()].map((v) => v.plays);
    const leagueAvgPlays = allPlayCounts.reduce((a, b) => a + b, 0) / allPlayCounts.length;
    const minPlays = leagueAvgPlays / 2;

    const entries = [...byPlayer.entries()]
      .filter(([, v]) => v.plays >= minPlays)
      .map(([playerId, v]) => ({ playerId, avg: v.sum / v.plays, plays: v.plays }));
    if (entries.length < MIN_PLAYERS) continue; // not enough ELIGIBLE people to rank this game

    const sorted = [...entries].sort((a, b) => (lowerIsBetter ? a.avg - b.avg : b.avg - a.avg));
    let rank = 1;
    const out = sorted.map((e, i) => {
      if (i > 0 && e.avg !== sorted[i - 1].avg) rank = i + 1;
      return { ...e, rank };
    });
    ranks.set(gameId, out);
  }
  return ranks;
}

// playerId -> their WEIGHTED average rank across every game they're
// eligible in - lower is better. Weighted by each game's own weight
// (games.weight, default 1) - some games count more toward the overall
// standing, same multiplier for every player regardless of how many times
// they've played it.
function computePlayerTotals(scores, games) {
  const ranks = computeGameRanks(scores, games);
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const perPlayer = new Map(); // playerId -> {weightedSum, totalWeight}
  for (const [gameId, rows] of ranks) {
    const weight = Number((gamesById.get(gameId) || {}).weight ?? 1) || 1;
    for (const r of rows) {
      const cur = perPlayer.get(r.playerId) || { weightedSum: 0, totalWeight: 0 };
      cur.weightedSum += r.rank * weight;
      cur.totalWeight += weight;
      perPlayer.set(r.playerId, cur);
    }
  }
  const totals = new Map();
  for (const [playerId, { weightedSum, totalWeight }] of perPlayer) {
    totals.set(playerId, weightedSum / totalWeight);
  }
  return totals;
}

module.exports = { MIN_PLAYERS, computeGameRanks, computePlayerTotals };
