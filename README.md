# Leaderboard Discord bot

Watches a Discord channel, auto-detects daily-game share text (Wordle,
Connections, or a plain `Game name: score` message), and logs it to
Supabase. The leaderboard website reads from the same database.

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
   That's `DISCORD_CHANNEL_ID` (optional -- leave it blank to watch every
   channel the bot is in instead).

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
DISCORD_CHANNEL_ID=...        # optional
SUPABASE_URL=https://zhvcrzybpnxmbnwjnqyf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
TIMEZONE=Europe/Oslo
```

Run locally to test:

```
npm install
npm start
```

Post a real Wordle or Connections share into the channel and check for a ✅
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
- **Connections**: paste the normal share text (title, puzzle number, and
  the emoji grid). Score is number of mistakes -- lower is better.
- **Anything else** (Krillion, etc.): just post `Game name: score` as the
  first line of a message, e.g. `Krillion: 15`. The bot creates that game
  automatically the first time it sees it, ranking higher-is-better by
  default. If a game should actually rank lowest-is-best, that's a one-line
  fix in Supabase (`update games set sort_direction = 'asc' where id = '...'`)
  -- just ask and it can be changed anytime.
- A day's points for each game = however many people played that game that
  day, going to 1st place, one fewer for 2nd, and so on down to 1 point for
  last place. Ties share the same rank and points.
- Reposting a score for the same game/day overwrites the previous one, so
  typos can just be corrected by posting again.
