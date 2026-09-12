// Run: node parsers.test.js   (or: npm test)
// Real "copy result" text for every game, plus things that must be ignored.
const { parseScore, parseRename } = require('./parsers');

const cases = [
  // ---- Wordle (real share) ----
  ['Wordle 1,909 4/6\n\n⬜🟩⬜⬜⬜\n⬜🟩⬜⬜⬜\n⬜🟩⬜⬜⬜\n🟩🟩🟩🟩🟩', { gameId: 'wordle', rawScore: 4 }],
  ['Wordle 1,543 X/6*', { gameId: 'wordle', rawScore: 7 }],
  ['Wordle 1234 1/6', { gameId: 'wordle', rawScore: 1 }],
  // space instead of comma as the thousands separator (real bug, missed a score)
  ['Wordle 1 910 5/6', { gameId: 'wordle', rawScore: 5 }],
  ['Wordle 1,910 5/6', { gameId: 'wordle', rawScore: 5 }],
  // non-breaking space (U+00A0) as the separator - looks identical to a
  // normal space but isn't one; real bug, missed a score
  ['Wordle 1 911 4/6', { gameId: 'wordle', rawScore: 4 }],
  // no puzzle number at all - manual/admin entry, e.g. "score @Tinuviel Wordle: 4/6"
  ['Wordle: 4/6', { gameId: 'wordle', rawScore: 4 }],
  ['Wordle 4/6', { gameId: 'wordle', rawScore: 4 }],
  ['Wordle: X/6', { gameId: 'wordle', rawScore: 7 }],
  // "GameName: score" also works without the "/6" - parseGeneric handles it
  ['Wordle: 4', { gameId: 'wordle', rawScore: 4 }],

  // ---- Krillion (real share: header + number, then an emoji grid) ----
  ['Krillion #57 🦐\n250\n\n🐟🐟🫧🐟🦑🐟🦑', { gameId: 'krillion', rawScore: 250 }],
  // no-"|" LinkedIn share (real bug, missed a score): time on its own line,
  // with a trailing flag emoji, not on the header line
  ['Zip #543\n0:20 🏁\nNo hints\nlnkd.in/zip.', { gameId: 'zip', rawScore: 20 }],

  // ---- LinkedIn games (all share the same "Name #n | M:SS ..." line 1) ----
  ['Patches #177 | 0:36 🧶\nWith no hints & 6 redraws\nlnkd.in/patches.', { gameId: 'patches', rawScore: 36 }],
  ['Wend #94 | 0:15 🌀\nWith no hints & 1 backtrack\nlnkd.in/wend.', { gameId: 'wend', rawScore: 15 }],
  ['Queens #863 | 12:14 with no hints\nFirst 👑s: ⬜🟧🟪\nlnkd.in/queens.', { gameId: 'queens', rawScore: 734 }],
  ['Crossclimb #863 | 0:37 with no mistakes\nFill order: 1️⃣2️⃣3️⃣4️⃣5️⃣🔼🔽 🪜\nlnkd.in/crossclimb.', { gameId: 'crossclimb', rawScore: 37 }],
  ['Zip #16 | 0:56 and flawless 🏆', { gameId: 'zip', rawScore: 56 }],
  ['Tango #99 | 1:23', { gameId: 'tango', rawScore: 83 }],
  // solve over an hour -> H:MM:SS
  ['Queens #999 | 1:02:14 with no hints', { gameId: 'queens', rawScore: 3734 }],

  // ---- manual entry (colon required) ----
  ['Wend: 1:30', { gameId: 'wend', rawScore: 90 }],
  ['Krillion: 250', { gameId: 'krillion', rawScore: 250 }],
  ['Zip: 83', { gameId: 'zip', rawScore: 83 }],

  // ---- must be ignored (parseScore returns null) ----
  ['anyone up for queens?', null],
  ['lol i got 4', null],
  ['gg all', null],
  ['nice, 250', null],
  ['Wordle', null],
  ['', null],
  // real bug: missing colon after the game name used to get misread as
  // name="Zip 0", value="20" instead of failing - now fails cleanly
  ['Zip 0:20', null],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = parseScore(input);
  const ok = expected === null
    ? got === null
    : !!got && got.gameId === expected.gameId && got.rawScore === expected.rawScore;
  const label = JSON.stringify(input.split('\n')[0].slice(0, 45));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(48)} -> ${JSON.stringify(got)}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${JSON.stringify(expected)}`);
  }
}

const renameCases = [
  ['my name is Dave', 'Dave'],
  ["my name's Big Dave", 'Big Dave'],
  ['My Name Is dave the destroyer', 'dave the destroyer'],
  ['my name is  José  ', 'José'],
  ['my name is **@everyone**', 'everyone'],           // markdown + mention stripped
  ['my name is 🦐 shrimp lord 🦐', 'shrimp lord'],     // emoji stripped
  ['my name is ' + 'x'.repeat(50), 'x'.repeat(32)],   // capped at 32
  ['my name is', null],                               // nothing after
  ['my name is    ', null],                           // only whitespace
  ['tell me your name', null],
  ['Wordle 1,909 4/6', null],
];
for (const [input, expected] of renameCases) {
  const got = parseRename(input);
  const ok = got === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  rename ${JSON.stringify(input.slice(0, 40)).padEnd(44)} -> ${JSON.stringify(got)}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${JSON.stringify(expected)}`);
  }
}

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nall ${cases.length + renameCases.length} parser tests passed`);
