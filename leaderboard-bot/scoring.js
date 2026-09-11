// Points come from each player's own score, not rank - so ties are simply
// identical scores getting identical points, never compressed by how many
// people tied that day (Wordle in particular ties constantly - only 6
// possible outcomes). Max is always 1 + SKILL_SPAN, min is always 1.
// Kept in its own module so scoring.test.js can pin the exact numbers, and
// mirrored byte-for-byte in index.html's <script>.
const SKILL_SPAN = 5;

// Wordle has a fixed, universal 1-6 guess scale (same every day, for
// everyone), so it maps straight from guess count - not compared to the
// field. 1 guess = 6, 2 = 5, 3 = 4, 4 = 3, 5 = 2, 6 = 1; a failed puzzle
// (guesses = 7) still floors at 1.
function wordlePoints(guesses) {
  return Math.max(1, 1 + SKILL_SPAN - (guesses - 1));
}

// Every other game has no fixed absolute scale (a good Zip time varies by
// day), so points come from where a score falls between the best and worst
// score actually posted for that game *that day* - still purely a function
// of your own score, ties still automatically identical, just self-scaling
// instead of a hardcoded range.
function fieldPoints(score, allScores, lowerIsBetter) {
  const best = lowerIsBetter ? Math.min(...allScores) : Math.max(...allScores);
  const worst = lowerIsBetter ? Math.max(...allScores) : Math.min(...allScores);
  const range = Math.abs(worst - best);
  if (range === 0) return 1 + SKILL_SPAN; // everyone tied -> everyone gets max
  return 1 + Math.round((SKILL_SPAN * Math.abs(worst - score)) / range);
}

function skillPointsFor(gameId, score, allScores, lowerIsBetter) {
  return gameId === 'wordle' ? wordlePoints(score) : fieldPoints(score, allScores, lowerIsBetter);
}

module.exports = { SKILL_SPAN, wordlePoints, fieldPoints, skillPointsFor };
