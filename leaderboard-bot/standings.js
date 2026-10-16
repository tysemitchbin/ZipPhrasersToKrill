// Mirrors index.html's computeDailyPoints/computePlayerTotals - the
// website's Standings math. Kept in its own module, same way scoring.js is,
// so a test file can pin the exact numbers; mirrored byte-for-byte in
// index.html's <script>. Used by the bot to announce the real top 3 at the
// 20:00 close.
//
// Standings = daily points, summed over the last WINDOW_DAYS days:
//   - every day, every game hands out points by finish place (gamePoints in
//     scoring.js: 1st 5, 2nd 3, 3rd 2, everyone else 1, however many
//     played; Wordle uses its fixed guess-count table)
//   - a game only counts on a day when at least MIN_PLAYERS_PER_DAY people
//     played it - so games nobody's playing anymore just drop out
//   - every game counts the same (no per-game weights)
//   - only the last WINDOW_DAYS days count, so an old lead fades out
const { gamePoints } = require('./scoring');

const WINDOW_DAYS = 14;
const MIN_PLAYERS_PER_DAY = 2;

// 'YYYY-MM-DD' plus n days (n can be negative).
function shiftDate(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// playerId -> Map(date -> points earned that day, across every game).
function computeDailyPoints(scores, games) {
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const byGameDay = new Map(); // "gameId|date" -> [score rows]
  for (const s of scores) {
    const key = s.game_id + '|' + s.play_date;
    if (!byGameDay.has(key)) byGameDay.set(key, []);
    byGameDay.get(key).push(s);
  }
  const daily = new Map();
  for (const rows of byGameDay.values()) {
    if (rows.length < MIN_PLAYERS_PER_DAY) continue; // not enough people played it that day
    const { game_id: gameId, play_date: date } = rows[0];
    const lowerIsBetter = (gamesById.get(gameId) || {}).sort_direction === 'asc';
    const all = rows.map((r) => Number(r.raw_score));
    for (const r of rows) {
      const pts = gamePoints(gameId, Number(r.raw_score), all, lowerIsBetter);
      if (!daily.has(r.player_id)) daily.set(r.player_id, new Map());
      const byDate = daily.get(r.player_id);
      byDate.set(date, (byDate.get(date) || 0) + pts);
    }
  }
  return daily;
}

// playerId -> total points over the WINDOW_DAYS days ending on endDate
// (inclusive). Higher is better. Only players who scored in the window.
function computePlayerTotals(scores, games, endDate) {
  const startDate = shiftDate(endDate, -(WINDOW_DAYS - 1));
  const inWindow = scores.filter((s) => s.play_date >= startDate && s.play_date <= endDate);
  const totals = new Map();
  for (const [playerId, byDate] of computeDailyPoints(inWindow, games)) {
    let sum = 0;
    for (const pts of byDate.values()) sum += pts;
    totals.set(playerId, sum);
  }
  return totals;
}

module.exports = { WINDOW_DAYS, MIN_PLAYERS_PER_DAY, shiftDate, computeDailyPoints, computePlayerTotals };
