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

// Wordle share text, e.g. "Wordle 1,234 3/6", "Wordle 1 234 3/6" (some
// clients use a space - sometimes literally a non-breaking space, not a
// plain U+0020 - instead of a comma as the thousands separator), or
// "Wordle 1234 X/6*" (searches the whole message; hard-mode "*" ignored;
// X = failed = 7). `\s` in JS regex matches all Unicode whitespace
// (regular space, non-breaking space U+00A0, narrow no-break U+202F,
// etc.), not just U+0020, so any of those separator variants work.
// The puzzle number is optional - "Wordle: 4/6" or "Wordle 4/6" (no
// number at all) also work, for manual/admin entry.
function parseWordle(text) {
  const m = text.match(/Wordle:?\s+(?:(?:\d{1,3}(?:[,\s]\d{3})*|\d+)\s+)?([1-6X])\/6/i);
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

// Two-line "header + score" shares, e.g.:
//   "Krillion #57 🦐"
//   "250"
// or a LinkedIn share with no "|" on the header line, e.g.:
//   "Zip #543"
//   "0:20 🏁"
//   "No hints"
// Line 1 is "<Name> #<number>"; the score is the number/time at the start
// of the first later line that has one - trailing text (emoji, "No hints",
// etc.) is ignored, just like the "|"-format parser. Kept as-is - the
// direction comes from games.sort_direction.
function parseHeaderScore(text) {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const h = lines[0].match(/^([A-Za-z][A-Za-z '\-]{1,29}?)\s+#[\d,]+/);
  if (!h) return null;
  let scoreValue = null;
  for (const l of lines.slice(1)) {
    const m = l.match(/^(\d{1,2}(?::\d{2})+|-?\d+(?:\.\d+)?)\b/);
    if (m) {
      scoreValue = m[1];
      break;
    }
  }
  if (scoreValue === null) return null;
  const name = h[1].trim();
  const gameId = toGameId(name);
  if (!gameId) return null;
  const rawScore = scoreValue.includes(':') ? timeToSeconds(scoreValue) : parseFloat(scoreValue);
  return { gameId, displayName: name, rawScore };
}

// Manual fallback: a single line "Game name: 15" or "Game name: 1:23".
// The colon is required, so ordinary chat ("lol i got 4") is ignored.
// The name may NOT contain digits: it used to (for a game with a number in
// its name), but that let a typo like "Zip 0:20" (missing the colon after
// "Zip") get misread as name="Zip 0", value="20" instead of failing - the
// "0" before the time's own colon looked like part of the name. No current
// game needs digits in its name, so this class of typo now fails cleanly.
function parseGeneric(text) {
  const firstLine = text.trim().split('\n')[0];
  const m = firstLine.match(/^([A-Za-z][A-Za-z '\-]{1,29}?):\s*(\d{1,2}(?::\d{2})+|-?\d+(?:\.\d+)?)\s*$/);
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

// "my name is <whatever>" / "my name's <whatever>" -> the leaderboard name.
// Discord names are often chaos; this lets people pick what shows on the
// board. Sanitised to letters/digits/space + a little punctuation (no
// markdown, mentions or emoji), first line only, capped at 32 chars.
function parseRename(text) {
  const m = text.trim().match(/^my name(?:'s| is)\s+(.+)$/i);
  if (!m) return null;
  const name = m[1]
    .split('\n')[0]
    .replace(/[^\p{L}\p{N} .,'!?()\-]/gu, '')
    .trim()
    .slice(0, 32)
    .trim();
  return name || null;
}

module.exports = {
  parseScore,
  parseWordle,
  parseLinkedIn,
  parseHeaderScore,
  parseGeneric,
  parseRename,
  toGameId,
  timeToSeconds,
};
