# Handover: Zip Phrasers to Krill (game-night leaderboard)

This is a working project being moved from a cloud chat session into Claude
Code. Everything below is context a fresh session needs — architecture,
current state, exact file locations, and what's left to do. Nothing here is
guessed; it reflects what has actually been built and verified so far.

## What this project is

A leaderboard for a friend group's daily games (Wordle, the LinkedIn
games — Zip, Wend, Patches, Tango, Queens, Crossclimb, Sudoku, Pinpoint —
Krillion, and any other game someone starts posting). Friends post their daily
scores in a Discord channel; a bot parses and stores them; a public
static website reads the same database and shows a leaderboard, a
30-day cumulative "race" line chart, a day-by-day points table, per-game
tables, and a running "bonus" feed (see below). The site is deliberately
loud/chaotic-fun, designed with neurodivergent friends in mind (motion is
still gated behind `prefers-reduced-motion`).

Page section order: Standings (table + 30-day race chart + bonus log) →
"Points, Day by Day" table → Game-by-Game tables → How This Works.

## Architecture

- **Website**: a single self-contained static HTML file (no build step,
  no framework) hosted on GitHub Pages. It fetches directly from
  Supabase's PostgREST API using the public/anon key. Read-only — enforced
  by Postgres Row Level Security, not by anything in the HTML/JS.
- **Discord bot**: a Node.js process (discord.js + `@supabase/supabase-js`
  + `node-cron`) that watches a channel, parses score posts, writes to
  Supabase using the **service_role** key (bypasses RLS — this key must
  never appear in the website or any public repo).
- **Database**: Supabase Postgres, shared by both. RLS is the only
  security boundary: `anon`/`authenticated` roles get read-only SELECT
  policies (with explicit REVOKEs for defense-in-depth); all writes go
  through the bot's service-role key.

This split exists specifically because a claude.ai Artifact-hosted page
can't make network calls to arbitrary external hosts like Supabase (CSP
sandbox only allows script tags from an allowlist of CDNs) — that's why
this is a plain static file on GitHub Pages instead.

## Live resources

- **GitHub repo**: `tysemitchbin/ZipPhrasersToKrill`
- **Live site**: https://tysemitchbin.github.io/ZipPhrasersToKrill/
- **Supabase project**: `zhvcrzybpnxmbnwjnqyf` ("Zip Phrasers to Krill"),
  org "Tyse Inc." (`kljmggprixthmquomwos`), region `eu-west-2`
- **Supabase URL**: `https://zhvcrzybpnxmbnwjnqyf.supabase.co`
- **Publishable/anon key** (safe to be public, already in the HTML):
  `sb_publishable_KLh6F8CjIHRJBYpghjLTXw_7Euch9dd`
- **Service role key**: known only to Mitch — lives in the bot's `.env`
  only, never committed, never shared in chat.
- **Bot host**: Oracle Cloud Always Free VM, `158.101.193.140` (ephemeral
  public IP — may change if the instance is ever stopped/started), Ubuntu
  24.04, ARM/A1 shape. `ssh -i <private key> ubuntu@158.101.193.140`.
  Repo cloned at `~/ZipPhrasersToKrill`, bot in `leaderboard-bot/`, run
  under `pm2` as process `leaderboard-bot` (`pm2 status` / `pm2 logs
  leaderboard-bot`), `pm2 startup` configured so it survives reboots.

## Repo/file layout (as delivered)

```
index.html        — the whole website (single self-contained file, served
                    by GitHub Pages)
HANDOVER.md        — this file
.gitignore         — excludes .env and node_modules/
leaderboard-bot/
  index.js             — the Discord bot (see below)
  parsers.js           — share-text -> {gameId, rawScore} parsers
  scoring.js           — gamePoints(): rankPoints() (competition ranking,
                         max = n players) for everything except Wordle,
                         wordlePoints() (fixed table) for Wordle
  announcements.js     — ~30 chaotic intro + body templates per event type
  parsers.test.js      — `npm test`: parsers vs real "copy result" text
  scoring.test.js      — `npm test`: pins the exact points table
  announcements.test.js — `npm test`: every template's {vars} resolve
  package.json         — deps: discord.js, @supabase/supabase-js, dotenv, node-cron
  package-lock.json
  .env.example     — documents required env vars (copy to .env, never commit)
  .gitignore       — also excludes node_modules/ and .env
  README.md        — full setup guide (Discord app creation, Supabase key,
                     Railway deployment, scoring reference)
dev/
  test-seed.sql    — fake data to eyeball the site; teardown line at the end
```

(An earlier revision kept `leaderboard.html` as a source copy of
`index.html`; that's gone — there is just the one `index.html` now. Stale
duplicate bot files that used to sit at the repo root were also removed.)

## Database schema (already applied via migrations)

Tables: `players`, `games`, `scores`, `bonus_points`, `milestones_hit`,
`streak_awards`, `daily_close_log`, `creatures_owned`.

- `games.sort_direction` is `'asc'` (lower score wins — Wordle and all the
  timed games: Zip, Wend, Patches, Tango, Queens, Crossclimb) or `'desc'`
  (higher wins — Krillion, and the default for any auto-created generic
  game). Timed games store the raw score as **total seconds** (the bot
  converts `M:SS` on the way in).
- `games.weight` (numeric, default `1`, added 2026-09-17) — how much that
  game's rank counts toward a player's website Standings average (see
  "Per-game weights" below). Bot-side scoring doesn't read this column at
  all yet.
- `scores` has a unique constraint on `(game_id, player_id, play_date)` —
  reposting a score for the same game/day overwrites the previous one
  (typo correction).
- `bonus_points` has `(player_id, play_date, amount, source, note)`, with
  a unique constraint on `(player_id, play_date, source)` — originally for
  idempotent roulette upserts. As of 2026-09-18 (bonus points removed —
  see "Scoring rules" below) the bot only ever writes a **zero-amount**
  `source='completion'` marker row here now, purely so the website's Most
  Sweeps table has something to count; `milestone`/`streak` source rows
  are no longer written (any that exist are historical), and `roulette`
  was already a dead legacy source value before that.
- `creatures_owned` (added 2026-09-17, replaces roulette) — one row per
  day a creature was awarded: `player_id, creature_name, creature_emoji,
  rarity, awarded_date`. `unique(awarded_date)` - only one creature is
  ever given out globally per day, so this doubles as the idempotency
  guard against a retried close drawing twice.
- `milestones_hit` is a lockdown table (RLS on, zero public policies,
  service-role-only) that used to guard "has this player already hit this
  milestone, ever." **Unused as of 2026-09-18** — milestones were removed
  from the bot entirely, nothing inserts into this table anymore. Left in
  the schema; no migration was run to drop it.
- `daily_close_log` (`play_date` PK, `closed_at` timestamptz, public
  SELECT policy) is a one-row-per-day marker the bot upserts as the very
  last step of a successful `runDailyClose` (also on the "nobody played"
  early-return path, so an empty day still closes). The website treats a
  `play_date` as visible **only** if it has a row here — see "The 20:00
  reveal" below.

**Current data status:** Mitch wiped all scoring history on 2026-09-13 for
a clean-slate relaunch now that everyone's joined — `scores`,
`bonus_points`, `milestones_hit`, `streak_awards`, and `daily_close_log`
were emptied then, and real play has been accumulating since (9 players
as of 2026-09-17). `games` holds 12 definitions: Wordle, Zip, Wend,
Patches, Tango, Queens, Crossclimb, Sudoku, Mini Sudoku (all `asc`) and
Krillion, Pinpoint, Rabbithole (`desc`). **Pinpoint's `desc` default is
unverified** — it was auto-created by `ensureGame` from a real share
before this session, and nobody's confirmed whether LinkedIn Pinpoint's
share text is actually higher-is-better or a guess-count like Wordle
(which would need `asc`). Check `sort_direction` in the games table if
Pinpoint's ordering looks backwards once it gets played again.

## ⚠️ The website and the bot currently disagree on scoring

As of 2026-09-17 the **website's** displayed points and the **bot's**
actual scoring/bonus logic are two different systems, mid-migration:

- **Bot** (`leaderboard-bot/scoring.js` + `index.js`): still the per-day
  model described in "Scoring rules" below — rank each game each day,
  points = `n - rank + 1`, **summed** across every game/day — but as of
  2026-09-18 this only ever feeds the daily recap flavor text, nothing
  else. It's not used for any bonus anymore: there are no bonuses left.
  Full-sweep eligibility is still computed from the day's counted games
  (unrelated to this points sum), and milestones are gone entirely (the
  daily creature raffle, added 2026-09-17, was always unrelated too - it's
  ticket-per-game-played, not points-based at all).
- **Website** (`index.html` only), current as of 2026-09-17 evening: rank
  each game by players' **all-time average** raw score (not per-day), same
  competition-ranking math as the bot (`rank`, ties share a rank and skip
  ahead by tie count) — but **no points conversion**. A player's Standings
  number is the **weighted average of their raw rank** across every game
  they're *eligible* in, and **lower is better** — like a golfer's average
  finish position, not a points total. `computeGameRanks` /
  `computePlayerTotals` / `computeDailyDeltas` / `withCompetitionRank` in
  `index.html`. Went through four iterations the same day: summed points
  (morning) → averaged points (midday) → weighted-average of raw rank
  weighted by play count (afternoon) → weighted by each **game's own
  weight** instead, after Mitch clarified "weighted average" meant "some
  games matter more," not "more plays of a game count more" (evening,
  current). `rankPoints()` and every "Pts" column are gone from the
  website entirely now (Mitch: "no pts, just ranking, player, score") -
  Game-by-Game → Today shows `#`/Player/Score only, same for All-time's
  `#`/Player/Avg/Plays. The race chart is renamed "📈 Rank, last 30 days"
  and its Y axis is **inverted** (0 pinned at the top, larger/worse
  further down) so climbing the chart always means improving. The "Rank,
  Day by Day" table's displayed deltas are the **negation** of the
  underlying stored delta (`fmtDelta` in `renderDailyTable` does
  `-n`) - positive shown = moved up in the ranking, negative = moved
  down - but `computeDailyDeltas`'s actual stored values are untouched
  (still true lower-is-better rank deltas), since `renderRaceChart`
  accumulates them directly into the chart's Y values and must not be
  flipped or the chart breaks.
- **Two eligibility rules gate whether a game produces a rank at all, and
  who's eligible in it** (both in `computeGameRanks`): a game only ranks
  once at least `MIN_PLAYERS` (4) people have **ever** played it (checked
  *after* the rule below, so it's 4 *eligible* players, not just 4 who've
  ever posted a score); and within a qualifying game, a player must have
  played it **at least half as often as that game's own average play
  count** (`leagueAvgPlays / 2`) to be eligible - so someone with one
  lucky play can't rank next to people with dozens.
- **Per-game weights** (2026-09-17): `games.weight` (numeric, default 1) -
  a new Supabase column, `add_game_weight` migration. Each game's rank
  contributes `weight` times as much to a player's weighted-average total
  (`computePlayerTotals` sums `rank * weight` over `sum(weight)`), same
  multiplier for every player regardless of how many times they've played
  it - this is what "weighted average" actually meant, correcting the
  previous (wrong) play-count-weighted interpretation. Current weights,
  set by Mitch: **Wordle 3, Krillion 3, Queens 2, Rabbithole 2**, every
  other game **1** (neutral). Tune by updating `games.weight` directly in
  Supabase - no code change needed, the website reads it via the normal
  `fetchTable('games')` call.
- **Bonuses no longer exist at all, as of 2026-09-18** (Mitch: "the
  bonuses got replaced by the mystical creature raffle"). Milestones and
  the streak-tier/full-sweep point bonuses were removed from the bot
  entirely (see "⚠️ Bonus points are gone" in Scoring rules below) rather
  than folded into the weighted-average-rank figure — that "how would a
  positive bonus combine with a lower-is-better ranking" question Mitch
  had twice declined to answer is now moot, there's nothing left to fold
  in. The old "Known gap" callout in the website's How This Works card
  (bot vs. website disagreeing on bonus logic) has been rewritten to
  describe the current no-bonus reality instead.
- Two new **all-time-only** pseudo-tables were added to Game-by-Game
  (`computeAverageStreaks`, `computeSweepCounts` in `index.html`) that sit
  outside this whole points debate — one ranks players by their longest
  per-game consecutive-day play streak, averaged across every game they've
  played (reads `scoresLive`, since streaks are always live), the other by
  how many full-sweep bonuses they've earned (reads the gated `state.bonus`,
  filtered to `source==='completion'`). Neither does any rank-to-points
  conversion, unaffected by whatever the primary scoring model ends up
  being. Ranked with
  `withCompetitionRank()`, the same tied-players-share-a-rank rule as
  everywhere else on the site (added after Mitch flagged the first version
  numbering ties sequentially, e.g. six people tied at "5 days" showing as
  1-6 instead of all showing 1).

Read this note before touching scoring code - "Scoring rules" below is
accurate for the **bot only** right now.

## Scoring rules (bot)

Designed as a deliberate **skill / effort / luck** mix so a committed but
weak player stays in contention. This is what `leaderboard-bot` actually
runs today. The website's own scoring has diverged from this (see above)
and is a separate, still-changing thing living entirely in `index.html`.

### Skill — ranked, same rule for every game except Wordle
For each game each day, everyone who played is ranked by score. **Max
points = however many people played that game that day** — the winner's
rank is always 1, so a 6-player game's winner gets 6; last place gets
**1**.

Ties use **competition ("1224") ranking**: a tied group shares a rank,
and the next *distinct* score's rank skips ahead by however many people
tied (a 3-way tie for 1st → the next player is 4th, not 2nd — so that
next player's points drop by 3, not 1). `rankPoints(score, allScores,
lowerIsBetter)` in `scoring.js` computes this from `1 + (count of
players who beat this score)`.

**Wordle is special-cased** (changed 2026-09-12): it has only 6 possible
outcomes, so ties at the top are common, and under competition ranking
that meant a player one guess behind a big tie could lose several points
just from the tie-count, not from their own performance. Wordle now uses
a **fixed table by guess count** instead, independent of the field:
`wordlePoints(rawScore)` in `scoring.js` maps 1→6, 2→5, 3→4, 4→3, 5→2,
6→1, a failed puzzle (`X/6`, stored as rawScore 7)→0. `gamePoints(gameId,
score, allScores, lowerIsBetter)` is the entry point every call site uses
now — it routes Wordle to `wordlePoints` and everything else to
`rankPoints`. Wordle still needs `MIN_PLAYERS` to have posted that day for
anyone to score (same turnout gate as every other game), it just doesn't
compare guess counts against each other once that gate is cleared.

**Minimum turnout:** a (game, day) only scores when at least
`MIN_PLAYERS` (= **4**) distinct players played it; otherwise the whole
group is skipped. Skipping a game is never penalised.

### ⚠️ Bonus points are gone (2026-09-18)
The old points-based roulette wheel, the full-sweep bonus, the streak-tier
bonus, and milestones are **all removed** — there is no bonus-points
system left in the bot at all. What survives is re-framed as shout-outs
and stats, not points:

- **Full sweep** (no points): played every game that counted today, when
  `COMPLETION_MIN_GAMES` (= 3) or more counted. Checked **once per day, in
  the `ROULETTE_HOUR` close** (`runDailyClose`) — self-correcting (deletes
  + rewrites today's `source='completion'` rows each run, since a game can
  cross `MIN_PLAYERS` later in the day and retroactively un-qualify
  someone). Still writes a **zero-amount** `bonus_points` row (`amount: 0,
  source: 'completion'`) — not a bonus anymore, just an event marker so
  the website's **Most Sweeps** table (Game-by-Game, reads
  `computeSweepCounts` on `state.bonus`) has something to count. Announced
  via `say.sweepLine()` with no `{bonus}` var.
- **Play streaks** (no points): played *any* game on N consecutive days
  gets a shout-out every `STREAK_TIER_DAYS` (= 7) days — day 7, 14, 21,
  ... Tracked per streak *run* in `streak_awards` (PK
  `player_id, tier_days, streak_start`, dedupe only, no `bonus_points`
  write at all now) so a rebuilt streak re-announces from day 7 again.
  Checked live after every score post (`checkStreak`); a late check (bot
  was offline) catches up and announces every tier crossed since the last
  check in one go. The website's **Average Streak** table doesn't read
  any of this — it computes streak length straight from `scores`
  (`computeAverageStreaks` in `index.html`), always has.
- **Milestones**: removed entirely. `specialNumber()`, `MEME_NUMBERS`,
  `computeAllTimeTotals()`, `checkMilestone()` are all gone from
  `index.js`; the `milestones_hit` table is no longer written to (left in
  the schema, just unused going forward — no migration was run to drop
  it). There's no equivalent under the average-rank model; the "special
  all-time total" concept doesn't map to anything meaningful once
  Standings stopped being a running point sum.

### Luck
- **Daily creature raffle** (replaced points-based roulette 2026-09-17,
  survives the 2026-09-18 bonus removal unchanged — it was never a point
  bonus): in the daily close job (`ROULETTE_HOUR`, default 16:00
  `TIMEZONE`), every player gets one **raffle ticket per game they played
  that day** (`gamesPerPlayer.get(playerId).size`) — playing more games
  means more tickets, not a bigger prize. One winner is drawn from the
  combined ticket pool (`ticketPool` array, one entry per ticket,
  `Math.random()` pick), and receives one creature drawn from the weighted
  `CREATURES` pool (`pickCreature()` in `index.js`) — common/uncommon/rare/
  legendary, weights 30/15/6/2. Stored in `creatures_owned` (not
  `bonus_points` — this isn't a point bonus, it's a collectible), one row
  per day thanks to a `unique(awarded_date)` constraint so a retried close
  can't draw twice. Announced via `say.raffle()` (`RAFFLE` templates in
  `announcements.js`). Website shows each player's collection as a "pen"
  — see below.

### Daily recap
Added 2026-09-12: the very last thing `runDailyClose` does before marking
the day closed is post one chaotic **recap** message — the day's top
scorer by skill points (as of 2026-09-18, no bonus points folded in —
there aren't any anymore), plus how many players and games counted. One
self-contained message (its own random intro + body, same pattern as
`say.streak()`) via `say.recap()` — 100 body templates in the `RECAP`
array in `announcements.js`. Silently skipped if `DISCORD_CHANNEL_ID`
isn't set.

### The 20:00 reveal
As of 2026-09-12 (revised twice the same day after Mitch narrowed, then
re-tightened, the scope), only the **Standings card** — its all-time
totals and the 30-day race chart — waits on the bot's 20:00 close before
counting a calendar day's skill points, full-sweep, or milestones.
`daily_close_log` gets a row only as the last step of a successful
`runDailyClose`; `index.html`'s `loadAll()` filters `state.scores` (used
by the Standings totals and race chart) down to rows whose `play_date` is
in that table, and filters `state.bonus` to `source === 'streak'` for any
not-yet-closed date (full-sweep/milestone rows simply don't exist yet for
an open day, since both are still close-only, so this is mostly a safety
net). A `#pending-banner` shows while today isn't closed yet. The daily
creature raffle (2026-09-17) needs no extra filtering for the same
reason — a creature for today literally doesn't exist in `creatures_owned`
until the close writes it, so just fetching the whole table naturally
only shows already-closed days.

**Exempt from the gate** (fully live, no waiting on 20:00):
- **Game-by-Game → Today** and the **"Rank, Day by Day" table** — both
  read `state.scoresLive` (the raw, unfiltered fetch) instead of the gated
  `state.scores`, specifically so people can watch today develop (who's
  leading Wordle right now, etc.) as scores are posted. Game-by-Game →
  All-time still uses the gated data, same as the Standings card.
  `render()` computes a second `dailyLive`/`allDatesLive`/`totalsLive` set
  from `state.scoresLive` just for the Day by Day table; the
  Standings/leaderboard/race-chart/stats all keep using the gated
  `daily`/`allDates`/`totals`.
- **Streaks** (`checkStreak`) — fires and announces on every post, live,
  unaffected by the bonus-source filter above.

**Still gated to 20:00**: scores feeding the Standings totals and race
chart, the full-sweep shout-out/marker row, and (by construction, not
extra filtering) the daily creature raffle. Full-sweep moved to live and
back to close-only again the same day (Mitch tried it live, then asked
for it back at 20:00 — see `runDailyClose`'s completion block). Scores
are still *logged* the instant someone posts, regardless of any of this —
the gate only hides already-written data from the Standings/race chart,
it never delays a write or hides it from Game-by-Game/Day by Day.

Consequence: if a close ever fails past its one retry, that day's scores
stay out of Standings and that day's full-sweep shout-out/creature raffle
never happens (no draw happens at all until the close succeeds)
indefinitely until someone runs `--close-now` or otherwise fixes it —
worth keeping an eye on `pm2 logs` after 20:00. (Streaks, and the
Game-by-Game/Day-by-Day views, aren't affected by a close failure at all,
since none of them depend on it.)

**Update, 2026-09-18 — bonus points removed:** the paragraph above is
historical. `bonus_points` no longer carries real point bonuses at all —
`milestone` and `streak` rows stopped being written the day bonuses were
removed (see "⚠️ Bonus points are gone" above); the only thing still
written there is a **zero-amount** `source='completion'` marker row per
full-sweep, purely so the website's **Most Sweeps** table has something
to count. `roulette` remains a legacy `source` value nothing writes
anymore. The website's old **Bonus Points** pseudo-table
(`computeGameTables` in `index.html`) now explicitly skips any
`amount === 0` row, so in practice it's empty going forward — it'll only
ever show pre-2026-09-18 historical bonus rows, if any are still in the
table, until they age out of whatever view scopes them. The daily creature
raffle still writes to `creatures_owned` (see above), unaffected — it was
never a point bonus.

A player's daily total (bot-side skill points only, no bonuses) is what
`computeTodayPoints` in `index.js` produces for the daily recap. The
**website's** Standings table is a completely different number — see
"⚠️ The website and the bot currently disagree on scoring" near the top
of this file for the weighted-average-rank model it actually uses; the
race chart there plots each player's rank trend, not a points total.

## The rotating mascot

All bonus announcements are signed with a **rotating daily mascot name**
instead of a single fixed name, and the bot **renames itself** in the
server to that day's mascot (`refreshNickname()`, on startup + a 00:05
cron; needs the "Change Nickname" permission, otherwise it just logs a
warning). Names over 32 chars are truncated for the nickname only.
The concept came from a reference Python bot (`bonus_bot.py`); its manual
`/bonus` command and JSON storage were deliberately not ported.

Announcement wording is randomized: `announcements.js` holds ~30 intro
lines (mascot-signed) and ~20-30 body lines per event type
(streak / sweep / raffle / recap — no more milestone, removed
2026-09-18). Each message = one random intro
+ one random body, so there are ~900+ variants per type. `say.*()` in
that file composes them; `index.js` just passes the vars.

- A ~97-entry list of absurd names (`NAMES` array — "Drunken Bonus
  Platypus" is just one of them now, not the fixed identity) lives
  **verbatim identical** in both `leaderboard-bot/index.js` and inside
  `index.html`'s `<script>`.
- `hashString(str)` — a simple deterministic string hash
  (`h = (Math.imul(h,31)+charCode)|0`, unsigned) — combined with a
  `YYYY-MM-DD` date string picks `NAMES[hash % NAMES.length]`, so the same
  calendar day always picks the same name, computed independently by the
  bot (Node) and the website (browser) without any coordination.
- The bot computes the date string from its own `TIMEZONE`-aware
  `playDateFor(new Date())`. The website **hardcodes `'Europe/Oslo'`**
  in its own `todaysName()` (via
  `new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' })`) to
  match the bot's default `TIMEZONE` env var — if Mitch ever changes the
  bot's deployed `TIMEZONE`, the hardcoded string in `index.html` must be
  updated to match, or the site and bot will disagree on "today" near
  midnight.
- On the website, the name shows in two places, both verified to render
  identically: the bonus-log card header ("🎲 Bonus Log — today's mascot:
  ...") and a `<strong id="todays-persona">` span inside the "How this
  works" card, populated by a one-line
  `document.getElementById('todays-persona').textContent = todaysName();`
  near the bottom of the script.

## Environment variables the bot needs (`.env`, see `.env.example`)

```
DISCORD_BOT_TOKEN=            # from Discord Developer Portal, Bot page
DISCORD_CHANNEL_ID=           # required for raffle/sweep/streak announcements
SUPABASE_URL=https://zhvcrzybpnxmbnwjnqyf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=    # a secret key: Project Settings -> API Keys -> sb_secret_...
TIMEZONE=Europe/Oslo          # decides which calendar day a score counts for
ROULETTE_HOUR=16              # 24h clock in TIMEZONE
```

Message posting formats the bot recognizes, tried in this order
(`leaderboard-bot/README.md` has full detail):
1. **Wordle** share text — `Wordle <puzzle#> <N>/6` (puzzle number
   accepts a comma, a space, *or* a non-breaking space U+00A0 as the
   thousands separator — a real one broke this once, `\s` in the regex
   now covers all Unicode whitespace, not just U+0020). The puzzle number
   is optional, so `Wordle: 4/6` / `Wordle 4/6` also work (manual entry).
2. **LinkedIn** shares — first line `<Name> #<n> | <M:SS> ...` (Queens,
   Tango, Zip, Crossclimb, Mini Sudoku, …); score = the time in seconds.
   The name allows spaces (`[A-Za-z '\-]`), not just one word — real bug
   fixed 2026-09-17, `Mini Sudoku #402 | 2:19 ...` silently failed to
   parse before this, since the regex only ever captured a single word.
3. **Header+score** — first line `<Name> #<n>`, then a bare number on a
   later line (Krillion); score = that number as-is.
4. **Rabbithole** (The Atlantic) — `I got <N> of <M> points on Rabbithole
   ...`; score = points earned (`<N>`), higher is better. The `<M>` max
   isn't stored, same as no game stores a par value.
5. **Manual** — one line `Game name: score` or `Game name: M:SS`. The
   colon is required (so chat isn't misparsed).

Also, checked before the score parsers:
- `my name is <x>` sets the poster's leaderboard `display_name` —
  sanitised to letters/digits/basic punctuation, 32 chars, no
  markdown/mentions/emoji (`parseRename` + `setPlayerName`). `ensurePlayer`
  only writes `display_name` on a player's first-ever post
  (`ignoreDuplicates`), so a chosen name is never clobbered by later scores.
- `score @player <anything parseScore understands>` — a server
  **Administrator** logs a score on someone else's behalf (missed post,
  backfill). Regex `^score\s+<@!?\d+>\s*(.*)$`, rest run through the normal
  `parseScore()`, target resolved via `message.mentions.members`. Reacts
  🛠️; non-admins get a refusal reply. No test coverage (needs a discord.js
  message mock) — the reused `parseScore()` underneath is fully tested.

Times are stored as total seconds. Unknown games are auto-created
defaulting to higher-is-better unless someone flips `sort_direction` in
Supabase. All parsers live in `leaderboard-bot/parsers.js`;
`parsers.test.js` (`npm test`) runs them against real "copy result" text
for every game — add a case there whenever a share format changes.
(Connections was tried and dropped — the emoji-grid share had no reliable
score to extract.)

## Design notes on the website (in case styling needs touching)

- Two separate CSS custom-property groups in `:root`: data/chart tokens
  (validated colorblind-safe categorical palette `--s1`..`--s8`, plus
  `--good`/`--bad` for bonus amounts) vs. decoration/"chaos" tokens
  (`--pink`, `--yellow`, `--lime`, `--cyan`, `--orange`, `--purple`,
  `--ink`). Keep these separate — the chart's data colors should never be
  repurposed for confetti/decoration or vice versa.
- Dark-only theme by design (no light-mode media query).
- `prefers-reduced-motion` zeroes all animation durations/iterations
  globally — bubbles and the confetti `celebrate()` burst both respect it.
- The chart is a hand-rolled inline SVG (`renderRaceChart()`) — no
  charting library. Legend items toggle series visibility; hover shows the
  standings as of that day.
- Two original inline-SVG diving-mascot doodles in the header
  (`.mascot-corner.left/.right`) — deliberately original artwork, not a
  reproduction of Krillion's actual logo (that image couldn't be fetched
  to verify/copy, and shouldn't be copied even if it could).
- `<title>` and the on-page banner (`.logo-line`) both now read "Zip
  Phasers to Krill" — they used to be deliberately different ("Zip
  Phrasers to Krill" / "GAME NIGHT LEADERBOARD"), Mitch changed both to
  match.
- Three play-links under the ticker (Wordle / LinkedIn Games / Krillion)
  open the actual games in a new tab.
- Favicon is an inline `data:image/svg+xml` 🦐 — no image asset to host.

## What's been tested and verified

- `node --check` on `leaderboard-bot/index.js`; `index.html` loads with no
  console errors.
- `rankPoints`, `wordlePoints`, `gamePoints`, `computeTodayPoints`,
  `computeAllTimeTotals`, the streak date math, and all parsers
  unit-tested offline against the real LinkedIn / Wordle / Krillion share
  formats.
- RLS + the key-leak fix verified directly against the live Supabase
  project (legacy JWT keys disabled; bot on an `sb_secret_` key).
- **Verified end-to-end with live Discord traffic** as of 2026-09-11 —
  real friends posting real scores, roulette/completion running for real
  at the daily close. Three real bugs found and fixed this way: Wordle's
  space-as-thousands-separator variant, a no-`|` LinkedIn share (score on
  its own line with trailing text), and `parseGeneric` misreading a
  missing colon as part of the game name (`"Zip 0:20"` → bogus game
  `"Zip 0"`). Streak tiers still untested live (needs someone posting 3+
  consecutive days).
- The 20:00 reveal (`daily_close_log` + website filtering + milestones
  moved into the close): migration applied and confirmed against Supabase,
  bot changes pass `node --check` and all three `npm test` suites, site
  changes confirmed to load with no console errors locally. **Not yet**
  verified live end-to-end (a real "hidden all day, revealed at 20:00"
  cycle) — watch the first real close after deploying this.

## Explicitly out of scope / declined

- No manual `/bonus` Discord slash command (that existed in the reference
  Python bot; Mitch chose not to port it).
- No switch to Python/discord.py — the bot stays Node.js/discord.js.
- The bot renames itself to the daily mascot (daily, not hourly like the
  reference bot).

## Open items / what's left

1. **Deployed and live** as of 2026-09-11 — an Oracle Cloud Always Free VM
   (`158.101.193.140`), Node under `pm2` (`pm2 startup` configured, so it
   survives reboots). Not Railway in the end; free tier, real friends
   already posting.
2. **`ROULETTE_HOUR` is 20:00** (bumped from the original 16:00 default —
   people were still playing past 16:00; name kept for backward compat
   with the deployed `.env`, even though it now times the completion
   check + creature raffle, not roulette). Scores posted after the close
   hour don't count toward that day's completion/raffle tickets (they
   still count for skill and streaks, which are live).
3. **Watch the skill/effort/luck balance** once more history builds up.
   Knobs (bot-side): `rankPoints()`'s ranking rule, the `WORDLE_TABLE`
   fixed values, `STREAK_TIER_DAYS`/`STREAK_TIER_BONUS`, `COMPLETION_BONUS`,
   the `CREATURES` pool's rarity weights, `ROULETTE_HOUR`.
4. Unknown games auto-create as higher-is-better; a new *timed* game would
   need `sort_direction` flipped to `asc` manually.
5. **Admin `score @player ...` needs `score @player Game name: score`**
   (colon required) or real multi-line share text. A missing colon can
   silently misparse (see the 2026-09-11 "Zip 0:20" incident above).
   Wordle is the one exception — it also accepts its own `N/6` shorthand
   with no colon (`Wordle: 4/6`, `Wordle 4/6`, or even plain `Wordle: 4`).
   Consider tightening `parseGeneric` further, or having the admin command
   reject unrecognised game ids instead of auto-creating, if this recurs.
6. **The 20:00 close silently produced nothing on the night of 2026-09-11**
   — `pm2 logs` showed `[close] Failed to run daily close: { message:
   'Gateway Timeout' }`, a transient Supabase timeout, not a code bug.
   `runDailyClose()` now retries itself once, 2 minutes later, if it
   throws (off for `--close-now`, which exits right after the call).
   Backfilled that night's bonuses by hand afterward - see the DB `id`s
   noted in session history if a similar gap needs reconciling later.
7. **The 20:00 reveal raises the stakes of close-reliability**: a close
   that exhausts its one retry leaves that day's skill points, full-sweep,
   and milestones out of the Standings card/race chart indefinitely until
   someone runs `--close-now` — and that day's creature raffle simply
   never happens (no draw at all, not even a hidden one, until the close
   succeeds). Streaks, and the Game-by-Game/Day-by-Day live views, are
   unaffected either way, since none of them depend on the close having
   run.
8. **Wordle's fixed scoring table is a first guess** (2026-09-12):
   6/5/4/3/2/1/0 by guess count. Watch whether it feels right once more
   real days of Wordle results come in - it's just as tunable as any other
   knob in `scoring.js`.

## Working conventions

- `index.html` is the whole website; edit it directly (no separate source
  copy anymore).
- Any scoring-logic change must be mirrored in **all three**
  implementations — website JS, bot per-day (`computeTodayPoints`), bot
  all-time (`computeAllTimeTotals`) — plus the shared constants
  (`MIN_PLAYERS`, `rankPoints`) which are duplicated in `index.html` and
  `leaderboard-bot/index.js` (canonically defined in `scoring.js` on the
  bot side).
- After any bot change: `npm test` locally, push, then on the server
  `git pull && npm install && npm test && pm2 restart leaderboard-bot`.
  Node doesn't hot-reload — a restart is required every time.
- `.env` is gitignored and must never be committed or edited on
  github.com.
