// Mirrors index.html's computeGameRanks/computePlayerStandings - the
// website's Standings math. Kept in its own module, same way scoring.js
// is, so a test file can pin the exact numbers; mirrored byte-for-byte in
// index.html's <script>. Used by the bot to announce the real top 3 at the
// 20:00 close, instead of a separate points system the website doesn't use.
//
// A player's Standings score (lower is better, like golf) is three parts
// added together:
//   skill   - weighted average finish position across every game (below)
//   volume  - up to VOLUME_PENALTY for playing fewer games in total than
//             whoever has played the most
//   recent  - up to RECENT_PENALTY for not playing in the last RECENT_DAYS
//             days (each day missed costs an equal share)
// So someone who's good but rarely shows up, or who stopped playing a
// while ago, sinks below the people who are actually playing.

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

// playerId -> their skill score: WEIGHTED average rank across every game
// they're eligible in - lower is better. Weighted by each game's own weight
// (games.weight, default 1) - some games count more toward the overall
// standing, same multiplier for every player regardless of how many times
// they've played it.
function computeSkillTotals(scores, games) {
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

// Activity weighting - see the header comment above.
const VOLUME_PENALTY = 3;
const RECENT_PENALTY = 3;
const RECENT_DAYS = 5;

const dayNumber = (isoDate) => Date.parse(isoDate + 'T00:00:00Z') / 86400000;

// playerId -> {skill, plays, recentDays, volume, recent, total}, for every
// player with a skill rank in at least one game. `asOf` (YYYY-MM-DD) is the
// day the "last RECENT_DAYS days" window ends on, inclusive - defaults to
// the latest play_date in `scores`.
function computePlayerStandings(scores, games, asOf) {
  if (!asOf) asOf = scores.reduce((max, s) => (s.play_date > max ? s.play_date : max), '');
  const skill = computeSkillTotals(scores, games);

  const plays = new Map(); // playerId -> total games played
  const recentDates = new Map(); // playerId -> Set of play_dates in the window
  for (const s of scores) {
    plays.set(s.player_id, (plays.get(s.player_id) || 0) + 1);
    const daysAgo = dayNumber(asOf) - dayNumber(s.play_date);
    if (daysAgo >= 0 && daysAgo < RECENT_DAYS) {
      if (!recentDates.has(s.player_id)) recentDates.set(s.player_id, new Set());
      recentDates.get(s.player_id).add(s.play_date);
    }
  }
  const maxPlays = Math.max(0, ...plays.values());

  const standings = new Map();
  for (const [playerId, skillScore] of skill) {
    const playerPlays = plays.get(playerId) || 0;
    const recentDays = (recentDates.get(playerId) || new Set()).size;
    const volume = VOLUME_PENALTY * (1 - playerPlays / maxPlays);
    const recent = RECENT_PENALTY * (RECENT_DAYS - recentDays) / RECENT_DAYS;
    standings.set(playerId, {
      skill: skillScore, plays: playerPlays, recentDays, volume, recent,
      total: skillScore + volume + recent,
    });
  }
  return standings;
}

// playerId -> Standings score (lower is better).
function computePlayerTotals(scores, games, asOf) {
  const totals = new Map();
  for (const [playerId, s] of computePlayerStandings(scores, games, asOf)) totals.set(playerId, s.total);
  return totals;
}

module.exports = {
  MIN_PLAYERS, VOLUME_PENALTY, RECENT_PENALTY, RECENT_DAYS,
  computeGameRanks, computeSkillTotals, computePlayerStandings, computePlayerTotals,
};
