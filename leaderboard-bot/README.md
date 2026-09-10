# Leaderboard Discord bot

Watches a Discord channel, auto-detects daily-game scores (Wordle share
text, Connections share text, or a plain `Game name: score` /
`Game name: M:SS` message), and logs them to Supabase. The leaderboard
website reads from the same database.

It also runs a **rotating bonus mascot** - two random-bonus mechanics,
both announced in the channel and logged on the site:

- **Roulette**: every day at 16:00 (configurable), whoever earned the
  fewest points *that day* gets a Mario Kart-style item spin - mostly a
  boost, sometimes a dud. See `WHEEL` in `index.js` to change the prizes/odds.
- **Milestones**: the moment a player's all-time total lands exactly on a
  special number, they get a shout-out and a small bonus. A number counts
  as special when its digits form a pattern - a repdigit (`222`), a
  palindrome (`121`, `2332`), or a run up/down (`123`, `4321`) - plus a
  few classics by reputation (`69`, `420`, `666`, `1337`). See
  `specialNumber()` and `MEME_NUMBERS` in `index.js` to change the rules.

The mascot doesn't have one fixed name. It wears a different absurd
nickname every day - "Drunken Bonus Platypus", "Sir Reginald Pointsworth,
Disgraced", "Feral Points Ferret", ~97 in total - picked deterministically
from the calendar date, so every announcement that day is signed by the
same name (e.g. `🎲 FERAL POINTS FERRET STUMBLES IN 🎲`). The website
computes the exact same name for the day independently, with no
coordination between the two. Edit the `NAMES` array in `index.js` to
change the list; if you do, mirror the change into the identical `NAMES`
array in `leaderboard.html` or the site and the bot will disagree.

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

Post a real Wordle share (or e.g. `Zip: 1:23`) into the channel and check for a ✅
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

- **Wordle**: paste the normal share text (e.g. `Wordle 1,234 3/6`). Score
  is guess count -- lower is better. A failed puzzle (`X/6`) counts as 7.
- **Connections**: paste the normal share text (title, `Puzzle #123`, and
  the emoji grid). Score is number of mistakes -- lower is better.
- **Timed games** (Zip, Tango, Queens, Crossclimb, Wend, Patches): post
  `Game name: time` as the first line, e.g. `Zip: 1:23` or `Queens 0:47`.
  An `M:SS` / `MM:SS` time is converted to total seconds -- lower is
  better. A plain number (`Zip: 83`) also works.
- **Krillion / anything else**: post `Game name: score` as the first line,
  e.g. `Krillion: 15`. The bot creates any unknown game automatically the
  first time it sees it, ranking higher-is-better by default. To flip a
  game to lowest-is-best: `update games set sort_direction = 'asc' where
  id = '...'` in Supabase.
- Current games and their direction: Wordle, Connections, Zip, Wend,
  Patches, Tango, Queens, Crossclimb all rank **lower-wins**; Krillion
  ranks **higher-wins**.
- A day's points for each game = however many people played that game that
  day, going to 1st place, one fewer for 2nd, and so on down to 1 point for
  last place. Ties share the same rank and points. **A game only scores at
  all on a day when at least 4 people played it** -- below that, nobody
  gets points for it (see `MIN_PLAYERS` in `index.js`).
- Reposting a score for the same game/day overwrites the previous one, so
  typos can just be corrected by posting again.
