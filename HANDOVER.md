# Handover: Zip Phrasers to Krill (game-night leaderboard)

This is a working project being moved from a cloud chat session into Claude
Code. Everything below is context a fresh session needs — architecture,
current state, exact file locations, and what's left to do. Nothing here is
guessed; it reflects what has actually been built and verified so far.

## What this project is

A leaderboard for a friend group's daily games (Wordle, the LinkedIn
timed games — Zip, Wend, Patches, Tango, Queens, Crossclimb — Krillion,
and any other game someone starts posting). Friends post their daily
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

## Repo/file layout (as delivered)

```
index.html        — the whole website (single self-contained file, served
                    by GitHub Pages)
HANDOVER.md        — this file
.gitignore         — excludes .env and node_modules/
leaderboard-bot/
  index.js         — the Discord bot (see below)
  parsers.js       — share-text -> {gameId, rawScore} parsers
  parsers.test.js  — `npm test`: parsers vs real "copy result" strings
  package.json     — deps: discord.js, @supabase/supabase-js, dotenv, node-cron
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

Tables: `players`, `games`, `scores`, `bonus_points`, `milestones_hit`.

- `games.sort_direction` is `'asc'` (lower score wins — Wordle and all the
  timed games: Zip, Wend, Patches, Tango, Queens, Crossclimb) or `'desc'`
  (higher wins — Krillion, and the default for any auto-created generic
  game). Timed games store the raw score as **total seconds** (the bot
  converts `M:SS` on the way in).
- `scores` has a unique constraint on `(game_id, player_id, play_date)` —
  reposting a score for the same game/day overwrites the previous one
  (typo correction).
- `bonus_points` has `(player_id, play_date, amount, source, note)`, with
  a unique constraint on `(player_id, play_date, source)` used for
  idempotent roulette upserts.
- `milestones_hit` is a lockdown table (RLS on, zero public policies,
  service-role-only) used purely as a "has this player already hit this
  milestone, ever" guard — insert fails with Postgres error `23505` on a
  repeat, which the bot catches to detect "already celebrated."

**Current data status:** all test data was cleared on 2026‑09‑10.
`players`, `scores`, `bonus_points`, `milestones_hit` are all empty,
waiting for real Discord posts. `games` holds the 8 live definitions:
Wordle, Zip, Wend, Patches, Tango, Queens, Crossclimb (all `asc`) and
Krillion (`desc`).

## Scoring rules

Designed as a deliberate **skill / effort / luck** mix so a committed but
weak player stays in contention. Every rule below is implemented
identically in three places — website JS (`index.html`), the bot's
per-day ranking (`computeTodayPoints`), and the bot's all-time ranking
(`computeAllTimeTotals`) — change all three together.

### Skill — daily game ranking
For each game each day, players are ranked by score (ties share rank,
"1224"-style competition ranking). Rank `r` of `n` players earns:

```
rankPoints(r, n) = 1 + round( SKILL_SPAN * (n - r) / (n - 1) )
```

`SKILL_SPAN = 3`, so the winner always gets **4** and last always gets
**1**, spaced linearly between and **independent of `n`** (winning a
4-person game is worth the same as a 12-person one). Defined as
`SKILL_SPAN` + `rankPoints()` in both files.

**Minimum turnout:** a (game, day) only scores when at least
`MIN_PLAYERS` (= **4**) distinct players played it; otherwise the whole
group is skipped. Skipping a game is never penalised.

### Effort
- **Full sweep** (`COMPLETION_BONUS = 3`): played every game that counted
  today, when `COMPLETION_MIN_GAMES` (= 3) or more counted. Awarded in the
  daily close job; self-correcting (deletes + rewrites today's
  `source='completion'` rows each run).
- **Play streaks** (`STREAK_TIERS`): played *any* game on N consecutive
  days. Tiers 3/7/14/30/60/100 pay 3/5/7/11/15/20 (≈ `round(2·√N)`).
  Tracked per streak *run* in `streak_awards` (PK
  `player_id, tier_days, streak_start`) so a rebuilt streak re-earns the
  tiers. Checked live after every score post (`checkStreak`).

### Luck
- **Roulette**: in the daily close job (`ROULETTE_HOUR`, default 16:00
  `TIMEZONE`), the **bottom third** of the day by skill points each spin
  the `WHEEL` (−1…+7, μ≈1.85); the lowest scorer(s) spin twice. Targeting
  is by skill points only (bonuses don't move you in or out of range).
  `unique(player_id, play_date, source)` + upsert-ignore, so re-runs never
  re-roll.
- **Milestones**: all-time total lands **exactly** on a *special number* —
  repdigit (`222`), palindrome (`121`, `2332`), run up/down (`123`,
  `4321`), or a `MEME_NUMBERS` classic (69, 420, 666, 1337). Guarded by
  `milestones_hit`, once per number per player, checked after every score
  post (`checkMilestone`). Palindromes alone are ~10% of 3-digit numbers,
  so tune the `n < 11` floor / `bonus` amounts in `specialNumber()` if
  hits feel too frequent.

All four bonus types land in `bonus_points` (`source` in
`roulette | milestone | streak | completion`) and, if `DISCORD_CHANNEL_ID`
is set, are announced in Discord under the day's rotating mascot name. The
website folds every `bonus_points` row into daily and all-time totals, and
shows a **Bonus Points** pseudo-table at the end of Game-by-Game.

A player's daily total = skill points from every game they played that day
+ any bonus points dated that day. The standings table shows all-time
totals; the race chart in that card plots each player's **running total
over the last 30 days** (`renderRaceChart`, carries in the pre-window
total so lines start where the player actually stood).

## The rotating mascot

All bonus announcements are signed with a **rotating daily mascot name**
instead of a single fixed name. This was ported from a reference Python
bot Mitch uploaded (`bonus_bot.py`) — specifically *only* the
rotating-name concept was ported (Mitch explicitly declined porting that
file's manual `/bonus` slash command or its JSON-file storage; the Node
bot's Supabase-based storage stays as-is).

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
DISCORD_CHANNEL_ID=           # required for bonus/milestone announcements
SUPABASE_URL=https://zhvcrzybpnxmbnwjnqyf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=    # a secret key: Project Settings -> API Keys -> sb_secret_...
TIMEZONE=Europe/Oslo          # decides which calendar day a score counts for
ROULETTE_HOUR=16              # 24h clock in TIMEZONE
```

Message posting formats the bot recognizes, tried in this order
(`leaderboard-bot/README.md` has full detail):
1. **Wordle** share text.
2. **LinkedIn** shares — first line `<Name> #<n> | <M:SS> ...` (Queens,
   Tango, Zip, Crossclimb, …); score = the time in seconds.
3. **Header+score** — first line `<Name> #<n>`, then a bare number on a
   later line (Krillion); score = that number as-is.
4. **Manual** — one line `Game name: score` or `Game name: M:SS`. The
   colon is required (so chat isn't misparsed).

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
- `<title>Zip Phrasers to Krill</title>` is the tab/link title; the
  on-page banner still reads "GAME NIGHT LEADERBOARD" — these were
  deliberately made different per Mitch's request.

## What's been tested and verified

- `node --check` on `leaderboard-bot/index.js`; `index.html` loads with no
  console errors.
- `rankPoints`, `computeTodayPoints`, `computeAllTimeTotals`, the streak
  date math, and all five message parsers unit-tested offline against the
  real LinkedIn / Wordle / Krillion share formats.
- RLS + the key-leak fix verified directly against the live Supabase
  project (legacy JWT keys disabled; bot on an `sb_secret_` key).
- **Not yet verified end-to-end with live Discord traffic** — the streak /
  completion / roulette DB writes have only been exercised in isolation,
  not through a real day of posts.

## Explicitly out of scope / declined

- No manual `/bonus` Discord slash command (that existed in the reference
  Python bot; Mitch chose not to port it).
- No switch to Python/discord.py — the bot stays Node.js/discord.js.
- No nickname-changing behavior for the bot itself (the reference bot
  changed its own Discord nickname hourly; this was not requested or
  ported — only the *displayed* rotating name in announcements/website).

## Open items / what's left

1. **Deploy the bot 24/7** (Railway — see `leaderboard-bot/README.md` §4).
   It currently only runs while Mitch's PC is on.
2. **Watch the skill/effort/luck balance** once real scores flow. Knobs:
   `SKILL_SPAN`, `STREAK_TIERS`, `COMPLETION_BONUS`, the roulette
   bottom-third fraction, `ROULETTE_HOUR`.
3. **`ROULETTE_HOUR` is 16:00** — scores posted after that don't count
   toward that day's completion/roulette (they still count for skill and
   streaks). Bump it later if people play in the evening.
4. Unknown games auto-create as higher-is-better; a new *timed* game would
   need `sort_direction` flipped to `asc` manually.

## Working conventions

- `index.html` is the whole website; edit it directly (no separate source
  copy anymore).
- Any scoring-logic change must be mirrored in **all three**
  implementations — website JS, bot per-day (`computeTodayPoints`), bot
  all-time (`computeAllTimeTotals`) — plus the shared constants
  (`MIN_PLAYERS`, `SKILL_SPAN`, `rankPoints`) which are duplicated in
  `index.html` and `leaderboard-bot/index.js`.
- `.env` is gitignored and must never be committed or edited on
  github.com.
