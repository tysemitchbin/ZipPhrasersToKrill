# Leaderboard Discord bot

Watches a Discord channel, auto-detects daily-game scores (Wordle share
text, LinkedIn game shares, or a plain `Game name: score` /
`Game name: M:SS` message), and logs them to Supabase. The leaderboard
website reads from the same database.

It also hands out **bonus points** (four kinds), all announced in the
channel under a rotating daily mascot name and logged on the site:

- **Roulette** (luck): daily at `ROULETTE_HOUR` (default 16:00), the
  bottom third of the day by points each spin a Mario Kart-style wheel;
  the lowest scorer(s) spin twice. See `WHEEL` in `index.js`.
- **Full sweep** (effort): played every game that counted today (>= 4
  players, >= 3 games counted) -> flat `COMPLETION_BONUS`. Checked
  **once per day, in the `ROULETTE_HOUR` close** - self-correcting
  (deletes + rewrites today's rows each run), since a game can cross the
  4-player threshold later in the day and retroactively un-qualify someone
  who hadn't played it.
- **Play streaks** (effort): played *any* game N days running -> **+1
  every 7 days** (`STREAK_TIER_DAYS`/`STREAK_TIER_BONUS` in `index.js`).
  Re-earnable after a broken streak. Checked **live**, on every post.
- **Milestones** (luck): a player's *all-time* total lands exactly on a
  special number - repdigit (`222`), palindrome (`121`, `2332`), run
  up/down (`123`, `4321`), or a classic (`69`, `420`, `666`, `1337`). See
  `specialNumber()`. Checked **once per day, in the `ROULETTE_HOUR` close**,
  on each player's final total for the day - not live on every post.

At the very end of the close, once every bonus above has landed, the bot
also posts a **daily recap** - one chaotic message naming the day's top
scorer (skill points + every bonus dated that day), plus how many players
and games counted. See `RECAP` in `announcements.js` and `say.recap()`.

### The 20:00 reveal

Scores are logged the instant someone posts, but the **website's Standings
card** (all-time totals, the 30-day race chart) doesn't count a calendar
day's skill points, full sweep, roulette, or milestones until the bot's
daily close has actually run for that day. The close upserts a row into
`daily_close_log` as its last step; the Standings card only counts a
`play_date` once that row exists. **Exempt, and fully live:** streaks, and
the website's Game-by-Game -> Today tab and "Points, Day by Day" table
(both show today's results as they're posted, independent of the close).
If a close fails and exhausts its one auto-retry, that day's skill
points/full-sweep/roulette/milestones stay out of the Standings card until
someone runs `npm start -- --close-now` (see below) or otherwise re-runs
the close successfully - the exempt items above are unaffected by a close
failure.

The mascot doesn't have one fixed name. It wears a different absurd
nickname every day - "Drunken Bonus Platypus", "Feral Points Ferret", ~97
in total - picked deterministically from the date. The bot also **renames
itself** in the server to that day's mascot (needs the Change Nickname
permission; refreshed at 00:05). The website computes the same name
independently. The `NAMES` array is duplicated verbatim in `index.js` and
`index.html` - change both together.

Every announcement is a random **intro line** (mascot-signed) + a random
**body line** for the event - ~30 of each, all in `announcements.js`
(`npm test` checks the placeholders resolve). Add more lines freely.

Both mechanics need `DISCORD_CHANNEL_ID` set to actually post
announcements (see below) - without it, bonuses still get recorded and
show up on the site, they just won't be announced in Discord.

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
   roulette/milestone announcements to post there (recommended); leaving
   it blank means the bot watches every channel it's in for scores, but
   has nowhere to send bonus announcements.

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
DISCORD_CHANNEL_ID=...        # needed for bonus announcements; optional for score-watching
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
   Bonus Points table all look right.
2. **Test the bot live:** with `npm start` running, post a few real
   shares yourself (`Wordle ... 4/6`, `Queens #x | 1:23 ...`,
   `Krillion #x` / number, `Wend: 1:30`). Each should get a 🦐 and show up
   on the site. Post some ordinary chat too - it should be ignored.
3. **Test the daily close:** `npm start -- --close-now` runs the
   completion + roulette pass once against today's data and exits (also
   how you'd catch up a day the bot missed).
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
- **LinkedIn games** (Queens, Tango, Zip, Crossclimb, and similar): the
  normal share, whose first line looks like
  `Queens #863 | 12:14 with no hints`. Score = the time after the `|`,
  stored as total seconds, lower is better.
- **Krillion** (and any `<Name> #<n>` header followed by a number on its
  own line): score = that number, as-is. Krillion ranks higher-is-better.
- **Manual entry**: a single line `Game name: score` or
  `Game name: M:SS`, e.g. `Wend: 1:05`. The colon is required so ordinary
  chat isn't misread as a score. Unknown games are auto-created ranking
  higher-is-better; flip one with
  `update games set sort_direction = 'asc' where id = '...'` in Supabase.
- Current games: Wordle, Zip, Wend, Patches, Tango, Queens, Crossclimb,
  Sudoku all rank **lower-wins**; Krillion and Pinpoint rank
  **higher-wins** (Pinpoint's direction is unverified — nobody's confirmed
  whether its real share text is actually higher-is-better or a
  guess-count like Wordle; check `sort_direction` in Supabase if its
  ordering looks off).
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
- On top of game points come the bonus types above (roulette / full sweep
  / streak / milestone).
- Reposting a score for the same game/day overwrites the previous one, so
  typos can just be corrected by posting again.

Full scoring rationale (the skill/effort/luck design) is in the repo's
`HANDOVER.md`.
