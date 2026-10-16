// Points = a fixed amount by finish place among everyone who played that
// game *today*, the same no matter how many people played (since
// 2026-10-16 - before, the winner got one point per player, so a busy day
// was worth far more than a quiet one):
//   1st = 5, 2nd = 3, 3rd = 2, anyone below = 1
// Ties use competition ("1224") ranking: a tied group shares a place, and
// the next DISTINCT score's place skips ahead by however many people tied
// (a 3-way tie for 1st -> all three get 5, the next score is 4th -> 1).
//
// Every game except Wordle (see wordlePoints below).
// Kept in its own module so scoring.test.js can pin the exact numbers, and
// mirrored byte-for-byte in index.html's <script>.
const PLACE_POINTS = [5, 3, 2]; // 1st, 2nd, 3rd - everyone below gets 1
function rankPoints(score, allScores, lowerIsBetter) {
  const beatenBy = allScores.filter((s) => (lowerIsBetter ? s < score : s > score)).length;
  const rank = beatenBy + 1; // 1 + how many PLAYERS beat this score
  return PLACE_POINTS[rank - 1] ?? 1;
}

// Wordle is scored on a fixed table by guess count instead of rank -
// rank-based scoring meant a big tie at the top (common with only 6
// possible outcomes) could cost a player several points for missing by
// just one guess, purely because of how many people tied above them.
// rawScore is the guess count (1-6); the parser stores a failed puzzle
// (X/6) as 7. Same 5/3/2/1 scale as every other game.
const WORDLE_TABLE = { 1: 5, 2: 5, 3: 3, 4: 2, 5: 1, 6: 1, 7: 0 };
function wordlePoints(rawScore) {
  return WORDLE_TABLE[rawScore] ?? 0;
}

// Points for one score in one game on one day - Wordle uses its own fixed
// table, everything else uses rank-based competition scoring. Callers are
// still responsible for the MIN_PLAYERS turnout gate (this only computes
// the per-score value, for whichever games clear that gate).
function gamePoints(gameId, score, allScores, lowerIsBetter) {
  return gameId === 'wordle' ? wordlePoints(score) : rankPoints(score, allScores, lowerIsBetter);
}

module.exports = { rankPoints, wordlePoints, gamePoints };
