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
  players, >= 3 games counted) -> flat `COMPLETION_BONUS`.
- **Play streaks** (effort): played *any* game N days running. `STREAK_TIERS`
  in `index.js` (3/7/14/30/60/100 -> 3/5/7/11/15/20). Re-earnable after a
  broken streak.
- **Milestones** (luck): all-time total lands exactly on a special number -
  repdigit (`222`), palindrome (`121`, `2332`), run up/down (`123`,
  `4321`), or a classic (`69`, `420`, `666`, `1337`). See `specialNumber()`.

The mascot doesn't have one fixed name. It wears a different absurd
nickname every day - "Drunken Bonus Platypus", "Feral Points Ferret", ~97
in total - picked deterministically from the date, so every announcement
that day is signed the same (`🎲 FERAL POINTS FERRET STUMBLES IN 🎲`). The
website computes the same name independently. The `NAMES` array is
duplicated verbatim in `index.js` and `index.html` - change both together.

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
   - Bot permissions: `View Channels`, `Send Messages`, `Read Message History`, `Add Reactions`
   - Copy the generated URL, open it in a browser, and add the bot to your server.
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

Post a real game share (Wordle, Queens, Krillion, etc.) into the channel and check for a ✅
reaction, then refresh the leaderboard site.

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
- Current games: Wordle, Zip, Wend, Patches, Tango, Queens, Crossclimb all
  rank **lower-wins**; Krillion ranks **higher-wins**.
- **Points per game per day:** rank 1 gets **4**, last gets **1**, spaced
  evenly between, regardless of how many played (`rankPoints` /
  `SKILL_SPAN` in `index.js`). Ties share rank and points. **A game only
  scores when at least 4 people played it** that day (`MIN_PLAYERS`).
- On top of game points come the bonus types above (roulette / full sweep
  / streak / milestone).
- Reposting a score for the same game/day overwrites the previous one, so
  typos can just be corrected by posting again.

Full scoring rationale (the skill/effort/luck design) is in the repo's
`HANDOVER.md`.
