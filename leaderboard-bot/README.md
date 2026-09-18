# Leaderboard Discord bot

Watches a Discord channel, auto-detects daily-game scores (Wordle share
text, LinkedIn game shares, or a plain `Game name: score` /
`Game name: M:SS` message), and logs them to Supabase. The leaderboard
website reads from the same database.

There are **no bonus points anymore** - the old points-based roulette
wheel, full-sweep bonus, streak-tier bonus, and milestone bonus are all
gone. Two scheduled posts a day, both under a rotating daily mascot name:

- **`PREVIEW_HOUR` (default 12:00, noon)**: names the 5 creatures that
  evening's raffle will draw from - `pickCreaturePool()` in `index.js`
  weighted-picks 5 distinct creatures from `CREATURES` (same rarity odds
  as always, just 5 draws without replacement), persists them to
  `daily_creature_pool` (`play_date` PK), and announces them via
  `say.preview()`. Only announces if this call is the one that actually
  created today's pool - a repeat firing, or the evening close having
  already generated a fallback pool, stays silent.
- **`ROULETTE_HOUR` (default 16:00)**: sends **one single Discord
  message** (if anyone played that day) covering everything:

  - **Top 3 in the Standings** - the real weighted-average-rank Standings
    (see "Scoring rules" below), ported to the bot as `standings.js`
    (`computeGameRanks`/`computePlayerTotals`, mirrored from
    `index.html`'s own version - `standings.test.js` pins the
    eligibility/weight/tie behavior). Computed from **all-time** scores,
    not just today's, so it always agrees with the website's own
    Standings card. Rendered as an intro line (`say.podiumIntro()`) plus a
    plain 🥇🥈🥉 medal line per eligible player (1-3, via
    `buildPodiumLines()`), matching the website's own medal treatment.
  - **Daily creature raffle** (luck): everyone who played today gets one
    ticket per game played that day; one winner is drawn from the
    combined ticket pool. The creature itself is a **flat 1-in-5** pick
    among that day's noon-announced pool (`getOrCreateTodaysPool()`) - not
    re-weighted by rarity, since the rarity weighting already happened in
    choosing which 5 were in play at noon. If the noon preview never
    fired (bot was offline, or `--close-now` is run in isolation), the
    close generates and persists a pool on the fly, silently. Stored in
    `creatures_owned`, not `bonus_points` - it's a collectible, not a
    point bonus, and the description shown under the announcement
    (`creature.desc`) comes straight from the `CREATURES` entry. This is
    the only thing you can still "win."
- **Per-game streak milestones** (effort, no points): streaks are tracked
  **per game** now (a Wordle streak and a Krillion streak are independent),
  and only announced at specific "big" milestone lengths -
  `STREAK_MILESTONES` in `index.js` (14, 30, 50, 69, 85, 100, 123, 150,
  200, 250, 300, 350, 400, 420, 450, 500, 555, 600, 666, 700, 750, 800,
  850, 900, 950, 1000, 1337) - not every 7 days like the old system.
  Checked once per (player, game) pair that actually played that day, at
  the close, deduped via `streak_awards` (now keyed on
  `player_id, game_id, tier_days`) so the same milestone never announces
  twice. The website's **Average Streak** table and the new All-time
  Game-by-Game **Longest Streak** column both compute streak length
  themselves, directly from `scores` - neither reads anything the bot
  writes for this.
- **Full sweep** (no announcement anymore): played every game that
  counted today (>= 4 players, >= 3 games counted). Checked **once per
  day, in the `ROULETTE_HOUR` close** - self-correcting (deletes +
  rewrites today's marker rows each run), since a game can cross the
  4-player threshold later in the day and retroactively un-qualify someone
  who hadn't played it. Still recorded as a zero-amount `bonus_points` row
  (`source: 'completion'`) purely so the website's **Most Sweeps** table
  has something to count - a silent stat write, not part of the message.

### The 20:00 reveal

Scores are logged the instant someone posts, but the **website's Standings
card** (all-time weighted-average rank, the 30-day race chart) doesn't
count a calendar day's scores until the bot's daily close has actually run
for that day. The close upserts a row into `daily_close_log` as its last
step; the Standings card only counts a `play_date` once that row exists.
The daily creature raffle needs no separate gating - a creature for today
simply doesn't exist in `creatures_owned` until the close writes it. The
noon preview (`daily_creature_pool`) is its own thing, gated by nothing -
it's always about *today's* pool, independent of any close.
**Exempt, and fully live:** the website's Average Streak / Longest Streak
tables, Game-by-Game -> Today tab, and "Rank, Day by Day" table (all show
today's results as they're posted, independent of the close). If a close
fails and exhausts its one auto-retry, that day's scores stay out of the
Standings card and that day's raffle draw / streak milestones / full-sweep
tracking never happen at all, until someone runs `npm start -- --close-now`
(see below) or otherwise re-runs the close successfully - the exempt items
above are unaffected by a close failure.

The mascot doesn't have one fixed name. It wears a different absurd
nickname every day - "Drunken Platypus", "Feral Deranged Ferret", 100
in total, all <=24 characters so none ever get truncated - picked
deterministically from the date. The bot also **renames
itself** in the server to that day's mascot (needs the Change Nickname
permission; refreshed at 00:05). The website computes the same name
independently. The `NAMES` array is duplicated verbatim in `index.js` and
`index.html` - change both together.

Every announcement is a random **intro line** (mascot-signed) + a random
**body line** for the event - ~30 of each, all in `announcements.js`
(`npm test` checks the placeholders resolve). Add more lines freely.

Both mechanics need `DISCORD_CHANNEL_ID` set to actually post
announcements (see below) - without it, sweeps/streaks/raffle still get
recorded and show up on the site, they just won't be announced in Discord.

## 1. Create the Discord bot

1. Go to https://discord.com/developers/applications -> **New Application**.
   Name it anything (e.g. "Scorekeeper").
2. Left sidebar -> **Bot** -> **Reset Token** -> copy it. This is `DISCORD_BOT_TOKEN`.
3. On the same Bot page, turn on **Message Content Intent** (under
   "Privileged Gateway Intents"). The bot can't read message text without this.
4. Left sidebar -> **OAuth2** -> **URL Generator**:
   - Scopes: `bot`
   - Bot permissions: `View Channels`, `Send Messages`, `Read Message History`,
     `Add Reactions`, `Change Nickname` (the last one lets the bot rename
     itself to the daily mascot — if you skip it the bot still works, it
     just keeps its default name).
   - Copy the generated URL, open it in a browser, and add the bot to your server.
   - Already invited without `Change Nickname`? Either re-open a new invite
     URL with it ticked, or Server Settings -> Roles -> the bot's role ->
     enable Change Nickname.
5. In Discord, turn on Developer Mode (User Settings -> Advanced), then
   right-click the channel where scores get posted -> **Copy Channel ID**.
   That's `DISCORD_CHANNEL_ID`. Set it if you want the mascot's
   raffle/sweep/streak announcements to post there (recommended); leaving
   it blank means the bot watches every channel it's in for scores, but
   has nowhere to send those announcements.

## 2. Get the Supabase service-role key

In the Supabase dashboard for this project -> **Project Settings** -> **API**
-> copy the **service_role** secret. This key bypasses Row Level Security, so:

- It only ever goes in this bot's environment variables.
- It must never be put in the website (the website only ever uses the
  public anon/publishable key, which is read-only).

## 3. Configure

Copy `.env.example` to `.env` and fill in:

```
DISCORD_BOT_TOKEN=...
DISCORD_CHANNEL_ID=...        # needed for raffle/sweep/streak announcements; optional for score-watching
SUPABASE_URL=https://zhvcrzybpnxmbnwjnqyf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
TIMEZONE=Europe/Oslo
ROULETTE_HOUR=16              # optional, 24h clock in TIMEZONE, defaults to 16
```

Run locally to test:

```
npm install
npm start
```

Post a real game share (Wordle, Queens, Krillion, etc.) into the channel and check for a 🦐
reaction, then refresh the leaderboard site.

## 3b. Test before inviting real users

1. **Fill the site with fake data:** Supabase dashboard -> SQL Editor ->
   run `dev/test-seed.sql`. Load the site and check the standings, the
   30-day race chart, the day-by-day table, the per-game tables, and the
   Average Streak / Most Sweeps box all look right.
2. **Test the bot live:** with `npm start` running, post a few real
   shares yourself (`Wordle ... 4/6`, `Queens #x | 1:23 ...`,
   `Krillion #x` / number, `Wend: 1:30`). Each should get a 🦐 and show up
   on the site. Post some ordinary chat too - it should be ignored.
3. **Test the daily close:** `npm start -- --close-now` runs the
   completion + creature raffle pass once against today's data and exits
   (also how you'd catch up a day the bot missed).
4. **Wipe it:** run the teardown line at the bottom of `dev/test-seed.sql`
   before real users join. `players`/`scores`/`bonus_points` should all be
   empty again.

## 4. Deploy so it runs all the time

The bot needs to stay running 24/7 to catch scores as people post them --
Railway's free tier works well for this.

**Option A -- Railway CLI (no GitHub needed)**

```
npm install -g @railway/cli
railway login
cd leaderboard-bot
railway init
railway up
```

Then set the environment variables (either in the Railway dashboard under
your new project -> Variables, or via CLI):

```
railway variables --set DISCORD_BOT_TOKEN=... \
  --set DISCORD_CHANNEL_ID=... \
  --set SUPABASE_URL=https://zhvcrzybpnxmbnwjnqyf.supabase.co \
  --set SUPABASE_SERVICE_ROLE_KEY=... \
  --set TIMEZONE=Europe/Oslo
railway up
```

**Option B -- GitHub + Railway dashboard**

1. Push this `leaderboard-bot` folder to a new GitHub repo.
2. In Railway: **New Project** -> **Deploy from GitHub repo** -> pick it.
3. Add the same environment variables in the project's **Variables** tab.
4. Railway redeploys automatically on every push.

Either way, Railway will run `npm start` and keep the process alive,
restarting it if it crashes.

## Changing your leaderboard name

Post `my name is <whatever>` in the channel and the bot renames you on the
board (letters/digits/basic punctuation, 32 chars max). Otherwise the name
is your Discord display name from the first score you post - later posts
don't overwrite it, so a chosen name sticks.

## Admins: assigning a score for someone else

If the bot missed a post (parser gap, was offline, whatever), a server
**Administrator** can log it manually. **The syntax is:**

```
score @Player Game name: score
```

e.g. `score @Player Krillion: 250`, `score @Player Wend: 1:30`. **The
colon is required** - `score @Player Zip 0:20` (no colon) will silently
misparse the game name; `score @Player Zip: 20` is correct.

Wordle is special-cased to also accept its own `N/6` shorthand, no colon
needed: `score @Player Wordle: 4/6`, `score @Player Wordle 4/6`, or even
just `score @Player Wordle: 4` (plain guess count) all work.

You can also paste the real share text after the mention (any format
`parseScore()` understands - see below) if you have it, e.g.
`score @Player Queens #863 | 1:23 with no hints`. Reacts 🛠️ and confirms
who it was logged for. Non-admins get told no. Counts as
posted *today* (server time), same as a normal message.

## How scoring works, for reference

Just paste the game's normal share text into the channel -- the bot
recognizes several formats and picks the score out automatically:

- **Wordle**: `Wordle 1,234 3/6` share text. Score = guess count, lower is
  better; a failed puzzle (`X/6`) counts as 7.
- **LinkedIn games** (Queens, Tango, Zip, Crossclimb, Sudoku, Mini Sudoku,
  and similar): the normal share, whose first line looks like
  `Queens #863 | 12:14 with no hints` or `Mini Sudoku #402 | 2:19 and
  flawless` (the game name can be more than one word). Score = the time
  after the `|`, stored as total seconds, lower is better.
- **Pinpoint**: its own format, `Pinpoint #871 | 4 guesses` on the first
  line (not a time). Score = guess count, lower is better, same idea as
  Wordle. Handled by a dedicated parser so the numbered guess lines below
  it in the share (`1️⃣ | 60% match`, ...) never get mistaken for the score.
- **Krillion** (and any `<Name> #<n>` header followed by a number on its
  own line): score = that number, as-is. Krillion ranks higher-is-better.
- **Rabbithole** (The Atlantic): `I got 18 of 21 points on Rabbithole ...`
  share text. Score = points earned, higher is better; the "of 21" max
  isn't stored.
- **Manual entry**: a single line `Game name: score` or
  `Game name: M:SS`, e.g. `Wend: 1:05`. The colon is required so ordinary
  chat isn't misread as a score. Unknown games are auto-created ranking
  higher-is-better; flip one with
  `update games set sort_direction = 'asc' where id = '...'` in Supabase.
- Current games: Wordle, Zip, Wend, Patches, Tango, Queens, Crossclimb,
  Sudoku, Mini Sudoku, and **Pinpoint** all rank **lower-wins**; Krillion
  and Rabbithole rank **higher-wins**. Pinpoint's share (`Pinpoint #871 |
  4 guesses`, followed by numbered guess lines) has its own parser
  (`parsePinpoint` in `parsers.js`) that reads the guess count off the
  header line — it used to fall through to the generic header-score parser
  and get mis-scored, see the 2026-09-18 fix in `HANDOVER.md` if this
  regresses.
- **Points per game per day**: ranked by score, same rule for every game
  except Wordle. The winner scores the same as however many people played
  (6 players -> winner gets 6), down to 1 for last (`rankPoints()` in
  `scoring.js`). Ties share a rank, and the next distinct score's rank
  skips ahead by however many tied (competition/"1224" ranking - a 3-way
  tie for 1st means the next player is 4th, not 2nd). **A game only scores
  when at least 4 people played it** that day (`MIN_PLAYERS`).
- **Wordle is the one exception**: only 6 possible outcomes means ties are
  common, so instead of ranking against the field it uses a flat table by
  guess count (`wordlePoints()` in `scoring.js`) - 1 guess = 6pts, 2 = 5,
  3 = 4, 4 = 3, 5 = 2, 6 = 1, a failed puzzle = 0. Still needs 4 people to
  have posted Wordle that day for anyone to score.
- **As of 2026-09-18, these per-day skill points (`rankPoints()`/
  `wordlePoints()`/`gamePoints()` in `scoring.js`) have no caller left in
  the bot at all** - the old daily recap that used them for "today's top
  scorer" was replaced by the single 20:00 post's real Standings top 3
  (see above), which uses `standings.js`, not `scoring.js`. `scoring.js`
  and `scoring.test.js` are left in place (nothing deletes them) but are
  currently vestigial as far as the running bot goes.
- Reposting a score for the same game/day overwrites the previous one, so
  typos can just be corrected by posting again.

Full scoring rationale (the skill/effort/luck design) is in the repo's
`HANDOVER.md`.
