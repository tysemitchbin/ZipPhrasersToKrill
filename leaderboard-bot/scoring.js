// Points = your rank among everyone who played that game *today*, using
// competition ("1224") ranking for ties: a tied group shares a rank, and
// the next DISTINCT score's rank skips ahead by however many people tied
// (a 3-way tie for 1st -> next score is rank 4, not rank 2).
//
// Max points = however many people played that game that day (the
// winner's rank is always 1, so they always get the full player count).
// Min points is always 1 (guaranteed - rank can never exceed n).
//
// One rule, every game - no fixed scale, no per-game special case.
// Kept in its own module so scoring.test.js can pin the exact numbers, and
// mirrored byte-for-byte in index.html's <script>.
function rankPoints(score, allScores, lowerIsBetter) {
  const n = allScores.length;
  const beatenBy = allScores.filter((s) => (lowerIsBetter ? s < score : s > score)).length;
  const rank = beatenBy + 1; // 1 + how many PLAYERS beat this score
  return Math.max(1, n - rank + 1);
}

module.exports = { rankPoints };
