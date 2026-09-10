// Score parsers for the leaderboard bot. Kept in their own module so
// parsers.test.js can exercise them against real "copy result" strings.
//
// parseScore() tries each parser in order; the first non-null wins.

function toGameId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// "M:SS" / "MM:SS" / "H:MM:SS" -> total seconds
function timeToSeconds(str) {
  return str.split(':').reduce((acc, part) => acc * 60 + parseInt(part, 10), 0);
}

// Wordle share text, e.g. "Wordle 1,234 3/6" or "Wordle 1234 X/6*"
// (searches the whole message; hard-mode "*" ignored; X = failed = 7).
function parseWordle(text) {
  const m = text.match(/Wordle\s+[\d,]+\s+([1-6X])\/6/i);
  if (!m) return null;
  const guesses = m[1].toUpperCase() === 'X' ? 7 : parseInt(m[1], 10);
  return { gameId: 'wordle', rawScore: guesses };
}

// LinkedIn puzzle shares - every LinkedIn game uses this line-1 format:
//   "Queens #863 | 12:14 with no hints"
//   "Patches #177 | 0:36 🧶"
//   "Wend #94 | 0:15 🌀"
// Score = the time after the "|", in seconds (lower is better). Anything
// after the time (hints / mistakes / redraws / emoji) is ignored.
function parseLinkedIn(text) {
  const firstLine = text.trim().split('\n')[0];
  const m = firstLine.match(/^([A-Za-z][A-Za-z]{1,19})\s+#[\d,]+\s*\|\s*(\d{1,2}(?::\d{2})+)\b/);
  if (!m) return null;
  const name = m[1].trim();
  const gameId = toGameId(name);
  if (!gameId) return null;
  return { gameId, displayName: name, rawScore: timeToSeconds(m[2]) };
}

// Two-line "header + score" shares, e.g. Krillion:
//   "Krillion #57 🦐"
//   "250"
// Line 1 is "<Name> #<number>"; the score is the first later line that is a
// bare number (or M:SS). Kept as-is - direction comes from games.sort_direction.
function parseHeaderScore(text) {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const h = lines[0].match(/^([A-Za-z][A-Za-z '\-]{1,29}?)\s+#[\d,]+/);
  if (!h) return null;
  const scoreLine = lines.slice(1).find((l) => /^-?\d+(?:\.\d+)?$/.test(l) || /^\d{1,2}(?::\d{2})+$/.test(l));
  if (!scoreLine) return null;
  const name = h[1].trim();
  const gameId = toGameId(name);
  if (!gameId) return null;
  const rawScore = scoreLine.includes(':') ? timeToSeconds(scoreLine) : parseFloat(scoreLine);
  return { gameId, displayName: name, rawScore };
}

// Manual fallback: a single line "Game name: 15" or "Game name: 1:23".
// The colon is required, so ordinary chat ("lol i got 4") is ignored.
function parseGeneric(text) {
  const firstLine = text.trim().split('\n')[0];
  const m = firstLine.match(/^([A-Za-z0-9][A-Za-z0-9 '\-]{1,29}?):\s*(\d{1,2}(?::\d{2})+|-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const name = m[1].trim();
  const gameId = toGameId(name);
  if (!gameId) return null;
  const rawScore = m[2].includes(':') ? timeToSeconds(m[2]) : parseFloat(m[2]);
  return { gameId, displayName: name, rawScore };
}

function parseScore(text) {
  return (
    parseWordle(text) ||
    parseLinkedIn(text) ||
    parseHeaderScore(text) ||
    parseGeneric(text)
  );
}

module.exports = {
  parseScore,
  parseWordle,
  parseLinkedIn,
  parseHeaderScore,
  parseGeneric,
  toGameId,
  timeToSeconds,
};
