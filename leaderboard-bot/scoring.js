// Points = your rank among everyone who played that game *today*, using
// competition ("1224") ranking for ties: a tied group shares a rank, and
// the next DISTINCT score's rank skips ahead by however many people tied
// (a 3-way tie for 1st -> next score is rank 4, not rank 2).
//
// Max points = however many people played that game that day (the
// winner's rank is always 1, so they always get the full player count).
// Min points is always 1 (guaranteed - rank can never exceed n).
//
// Every game except Wordle (see wordlePoints below) - no fixed scale.
// Kept in its own module so scoring.test.js can pin the exact numbers, and
// mirrored byte-for-byte in index.html's <script>.
function rankPoints(score, allScores, lowerIsBetter) {
  const n = allScores.length;
  const beatenBy = allScores.filter((s) => (lowerIsBetter ? s < score : s > score)).length;
  const rank = beatenBy + 1; // 1 + how many PLAYERS beat this score
  return Math.max(1, n - rank + 1);
}

// Wordle is scored on a fixed table by guess count instead of rank -
// rank-based scoring meant a big tie at the top (common with only 6
// possible outcomes) could cost a player several points for missing by
// just one guess, purely because of how many people tied above them.
// rawScore is the guess count (1-6); the parser stores a failed puzzle
// (X/6) as 7.
const WORDLE_TABLE = { 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 1, 7: 0 };
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
