# Handover: Zip Phrasers to Krill (game-night leaderboard)

This is a working project being moved from a cloud chat session into Claude
Code. Everything below is context a fresh session needs — architecture,
current state, exact file locations, and what's left to do. Nothing here is
guessed; it reflects what has actually been built and verified so far.

## What this project is

A leaderboard for a friend group's daily games (Wordle, Connections, the
LinkedIn timed games — Zip, Wend, Patches, Tango, Queens, Crossclimb —
Krillion, and any other game someone starts posting). Friends post their daily
scores in a Discord channel; a bot parses and stores them; a public
static website reads the same database and shows a leaderboard, a line
chart of points over time, a day-by-day points table, per-game tables,
and a running "bonus" feed (see below). The site is deliberately
loud/chaotic-fun, designed with neurodivergent friends in mind (motion is
still gated behind `prefers-reduced-motion`).

Page section order: Standings → line chart → "Points, Day by Day" table →
Game-by-Game tables → How This Works.

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
  package.json     — deps: discord.js, @supabase/supabase-js, dotenv, node-cron
  package-lock.json
  .env.example     — documents required env vars (copy to .env, never commit)
  .gitignore       — also excludes node_modules/ and .env
  README.md        — full setup guide (Discord app creation, Supabase key,
                     Railway deployment, scoring reference)
```

(An earlier revision kept `leaderboard.html` as a source copy of
`index.html`; that's gone — there is just the one `index.html` now. Stale
duplicate bot files that used to sit at the repo root were also removed.)

## Database schema (already applied via migrations)

Tables: `players`, `games`, `scores`, `bonus_points`, `milestones_hit`.

- `games.sort_direction` is `'asc'` (lower score wins — Wordle,
  Connections, and all the timed games: Zip, Wend, Patches, Tango, Queens,
  Crossclimb) or `'desc'` (higher wins — Krillion, and the default for any
  auto-created generic game). Timed games store the raw score as **total
  seconds** (the bot converts `M:SS` on the way in); Connections stores
  the mistake count.
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
waiting for real Discord posts. `games` holds the 9 live definitions:
Wordle, Connections, Zip, Wend, Patches, Tango, Queens, Crossclimb (all
`asc`) and Krillion (`desc`).

## Scoring rules (as specified by Mitch, implemented identically in 3
places: website JS, bot's per-day ranking, bot's all-time ranking)

For each game, each day: the best score earns points equal to however
many people played that game that day. Each place below earns one point
less, down to 1. Ties share the same rank *and* the same points
("1224"-style competition ranking — a tie for 1st means both get top
points, and the next distinct score drops by however many people tied,
not just by one). Skipping a game entirely is not penalized — no
score, no points, no zero recorded.

**Minimum turnout:** a game only awards points on a day when at least
`MIN_PLAYERS` people (currently **4**) played it that day. Below that,
the whole (game, day) group is skipped and nobody scores for it. This
constant is defined once in `leaderboard-bot/index.js` and once in
`index.html` — change both together.

A player's total for a day is the sum across every game they played that
day, plus any bonus points dated that day. The chart plots daily point
totals per player over time; the standings table shows all-time totals.

## The bonus system ("rotating mascot" bonuses)

Two independent bonus mechanics, both logged to `bonus_points` and (if
`DISCORD_CHANNEL_ID` is set) announced in Discord:

1. **Daily roulette** ("Mario Kart" mechanic): every day at a configured
   hour (`ROULETTE_HOUR`, default `16`, i.e. 16:00 in `TIMEZONE`), the
   bot computes that day's points, finds whoever has the *lowest* points
   for that specific day (all ties included, not just one), and gives
   each of them a themed prize-wheel spin (`WHEEL` array in `index.js` —
   weighted random, mostly positive, rare small negative "dud"). Uses
   `unique(player_id, play_date, source)` + upsert-ignore so re-running
   the cron job never double-awards.
2. **Milestones**: the moment a player's *all-time total* lands **exactly**
   on a *special number*, they get a bonus and a Discord shout-out. A
   number is special when its digits form a pattern — repdigit (`222`),
   palindrome (`121`, `2332`), or a consecutive run up/down (`123`,
   `4321`) — plus a short `MEME_NUMBERS` list (69, 420, 666, 1337). See
   `specialNumber()` in `index.js`. Guarded by `milestones_hit` so each
   distinct number can only ever fire once per player, checked after
   every score post. Note: palindromes alone make ~10% of 3-digit
   numbers special, so hits are fairly frequent — tune the floor
   (`n < 11`) or the `bonus` amounts in `specialNumber()` if it's too
   generous once real data flows.

Both mechanics are branded with a **rotating daily mascot name** instead
of a single fixed name. This was ported from a reference Python bot Mitch
uploaded (`bonus_bot.py`) — specifically *only* the rotating-name concept
was ported (Mitch explicitly declined porting that file's manual `/bonus`
slash command or its JSON-file storage; the Node bot's Supabase-based
storage stays as-is).

- A ~97-entry list of absurd names (`NAMES` array — "Drunken Bonus
  Platypus" is just one of them now, not the fixed identity) lives
  **verbatim identical** in both `leaderboard-bot/index.js` and inside
  `leaderboard.html`'s `<script>`.
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
  bot's deployed `TIMEZONE`, the hardcoded string in `leaderboard.html`
  must be updated to match, or the site and bot will disagree on "today"
  near midnight.
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

Message posting formats the bot recognizes (`leaderboard-bot/README.md`
has full detail): Wordle share text, Connections share text (emoji grid,
score = mistakes), or a generic first line `Game name: score` /
`Game name: M:SS` (a time is stored as total seconds; unknown games are
auto-created defaulting to higher-is-better unless someone flips
`sort_direction` in Supabase).

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
- The chart is a hand-rolled inline SVG (`renderChart()`) — no charting
  library. Legend items are clickable to toggle series visibility.
- Two original inline-SVG diving-mascot doodles in the header
  (`.mascot-corner.left/.right`) — deliberately original artwork, not a
  reproduction of Krillion's actual logo (that image couldn't be fetched
  to verify/copy, and shouldn't be copied even if it could).
- `<title>Zip Phrasers to Krill</title>` is the tab/link title; the
  on-page banner still reads "GAME NIGHT LEADERBOARD" — these were
  deliberately made different per Mitch's request.

## What's been tested and verified

- A 6-day/6-player/4-game simulated run through the full scoring +
  ranking pipeline, hand-checked against independently computed expected
  point totals.
- Roulette's weighted-random wheel selector verified via a 200k-iteration
  Monte Carlo run matching target percentages within 0.1%.
- Row Level Security verified directly against the real Supabase project
  (`set local role anon; insert ...` correctly blocked).
- The rotating-mascot-name feature verified via headless Playwright with
  mocked Supabase responses: the bonus-log header and the "How this
  works" persona span render the identical name, and `node --check` on
  `index.js` passes.
- Not yet verified: the actual live GitHub Pages site end-to-end (the
  sandbox this was built in can't reach outbound hosts like
  `supabase.co` or `github.io` directly — verification was done against
  mocked-but-identical data instead).

## Explicitly out of scope / declined

- No manual `/bonus` Discord slash command (that existed in the reference
  Python bot; Mitch chose not to port it).
- No switch to Python/discord.py — the bot stays Node.js/discord.js.
- No nickname-changing behavior for the bot itself (the reference bot
  changed its own Discord nickname hourly; this was not requested or
  ported — only the *displayed* rotating name in announcements/website).

## Open items / what's left

1. **Confirm/clear test data** in Supabase (6 fake players, 116 fake
   scores currently live) before real Discord data starts flowing in.
2. **`leaderboard-bot/README.md` doesn't yet mention the rotating-mascot
   feature** — it still only describes "The Drunken Bonus Platypus" as a
   fixed identity. Should be updated to describe the rotating list.
3. **Discord bot setup itself is still in progress** on Mitch's end —
   token generation, enabling the Message Content Intent, inviting the
   bot to the server, and deploying (Railway is the documented option in
   the README) haven't been confirmed as done.
4. No other known bugs — the last few rounds of changes (16:00 roulette
   hour, per-game tables, bonus log, rotating mascot name) have all been
   implemented, tested, and delivered.

## Working conventions used throughout this project (for consistency)

- Every change to `leaderboard.html` gets copied to `index.html` before
  delivery (GitHub Pages serves `index.html`; keeping a separately-named
  source file avoids confusion about which is "the real one").
- Any change to `leaderboard-bot/` gets re-zipped to
  `leaderboard-bot.zip` for easy download alongside the raw folder.
- Ranking/points logic changes must be mirrored in all three
  implementations (website JS, bot per-day, bot all-time) — they're
  intentionally duplicated rather than shared, so a change to the rules
  needs a manual pass through all three.
