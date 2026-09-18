require('dotenv').config();
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');

const {
  DISCORD_BOT_TOKEN,
  DISCORD_CHANNEL_ID,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TIMEZONE = 'Europe/Oslo',
  ROULETTE_HOUR = '16', // 24h, in TIMEZONE - when the daily close (standings/raffle/streaks post) fires. Kept the name for backward compat with existing .env files.
} = process.env;

if (!DISCORD_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars. Check DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// ---------- scoring constants (mirror these in index.html) ----------

// A game only awards points on a given day if at least this many people
// played it that day. Fewer than that -> nobody scores for that game.
const MIN_PLAYERS = 4;

// Standings math (weighted average rank across games) lives in
// standings.js, mirrored byte-for-byte from index.html's own version -
// this is what decides the top 3 in the single 20:00 post.
const { computePlayerTotals } = require('./standings');

// Per-game play streaks only get a shout-out at these "big" milestones -
// not every 7 days like the old bonus-tier system (bonus points are gone,
// replaced by the daily creature raffle below; a streak milestone is a
// pure shout-out, no points). Checked once per game per day, only for
// games someone actually played that day, at the 20:00 close - deduped via
// streak_awards (player_id, game_id, tier_days) so the same milestone
// never gets announced twice.
const STREAK_MILESTONES = [
  14, 30, 50, 69, 85, 100, 123, 150, 200, 250, 300, 350, 400, 420, 450, 500,
  555, 600, 666, 700, 750, 800, 850, 900, 950, 1000, 1337,
];

// Playing every game that "counted" (>= MIN_PLAYERS players) on a day,
// when at least this many games counted, counts as a full sweep. No
// announcement anymore (see the single 20:00 post below) - just tracked
// (a zero-amount bonus_points marker row) so the website's Most Sweeps
// stat has something to count.
const COMPLETION_MIN_GAMES = 3;

// ---------- daily rotating persona ----------
// The bonus system doesn't have one fixed name - it wears a different
// deeply unwell nickname every day, picked deterministically from the date
// so the bot and the website always agree on "today's name" without
// talking to each other. Edit this list freely.
const NAMES = [
  'Drunken Bonus Platypus', 'Sir Reginald Pointsworth, Disgraced', 'The Bonus Goblin (Unmedicated)',
  'Feral Points Ferret', 'Captain Emotional Support Walrus', 'Gary, The Cursed Abacus',
  'Big Naughty Number Dispenser', 'Baroness Von Snackpoint', 'The Points Ghost Who Saw Too Much',
  'Disappointed Bonus Dad', 'Chunky Fiscal Raccoon', 'Legally Distinct Bonus Wizard',
  'Sweaty Gerald From Accounting', 'Points Panda With a Restraining Order', 'HR-Flagged Bonus Bumblebee',
  'The Unpaid Intern (Bonus Division)', 'Moist Bonus Ferret 2: The Reckoning', 'Karen of the Bonus Points',
  'A Goose That Owes You Money', 'Feral Bonus Cryptid', 'Sad Clown Points Terminal', 'Diet Chaos Alpaca',
  'Slightly Damp Bonus Lord', 'The Bonus Point Squirrel (Court-Ordered)', 'Gremlin Who Stole Your Dopamine',
  'Hyperfixation Hamster, Esq.', 'Executive Dysfunction Pelican', 'Bonus Points But Make It Weird',
  'The Manatee Who Peaked in High School', 'Unsupervised Points Otter', 'Kevin (Do Not Feed After Midnight)',
  'Lord Farquaad of the Bonus Realm', 'Deeply Unwell Bonus Flamingo', 'Points Dispenser With Daddy Issues',
  'Aggressively Mid Bonus Turtle', 'The Tax-Evading Capybara', 'Bonus Lizard (Ask Me About My Crimes)',
  'Emotionally Unavailable Bonus Owl', 'Wet Sock Full of Points', 'Bonus Vending Machine That Ate Your Dollar',
  'Trash Panda With a Notary License', 'The Bonus Pigeon Formerly Known as Steve', 'Chaotic Neutral Points Sloth',
  'One (1) Unhinged Bonus Moose', 'Bonus Wombat, Recently Divorced', 'Points Kraken (Small, Ashamed)',
  'The Dopamine Landlord', 'Wizard of Points and Poor Decisions', 'Bonus Points Delivered Via Interpretive Dance',
  "Gerald's Nemesis, Also Named Gerald", "Barely Legal Bonus Hedgehog (He's 18, It's Fine)",
  'Clinically Feral Points Badger', 'Bonus Snail With Road Rage', 'The Points Fairy (Unlicensed)',
  "Grandma's Cursed Bonus Frog", 'Bonus Points, But It Just Keeps Screaming', 'The Mildly Threatening Bonus Duck',
  "Sir Points-a-Lot the Unwashed", 'Bonus Beaver on Probation', 'The Void, But Friendly and It Has Points',
  'Rejected Muppet Points Officer', 'Shrimp Who Forgot to Take Its Meds', 'The Bonus Lobster That Knows Your Browser History',
  'Points Fox, Pending Litigation', 'Bonus Gecko Who Sells Insurance Now', 'Overstimulated Points Koala',
  "The Nap Goblin's Accountant", 'Bonus Points Fueled Entirely by Spite', "Chad, but He's a Chinchilla",
  'Unlicensed Dopamine Pharmacist', 'The Bonus Hippo Who Sent That Text at 3am', 'Points Crab in a Tiny Wizard Hat',
  'Bonus Eel (Tazed Once, Would Do It Again)', 'Barry the Bonus Bat (Not That Kind)', 'Points Pigeon Who Ghosted Your Friend',
  "Ol' Sticky, Distributor of Points", 'The Bonus Slug Your Therapist Warned You About', 'Suspiciously Wealthy Points Weasel',
  'Bonus Gremlin Running on Two Hours of Sleep', 'The Last Honest Points Possum', 'Bonus Points, Brought to You by Impulse',
  'A Bonus Yak With No Sense of Object Permanence', 'Dr. Bonus, PhD in Chaos', 'The Feral Stapler',
  'Bonus Points Mildly Haunted Roomba', 'Kombucha-Soaked Points Raccoon', "The Bonus Whale Who Gave Up on Its Novel",
  'Tiny Horse, Massive Bonus Energy', 'Points Meerkat Filing for Bankruptcy', 'Bonus Points Being Held Hostage by a Goose',
  'The Unemployed Points Dragon', 'Bonus Mole Person, Freshly Surfaced', 'Big Bonus Energy and Nothing Else',
  'Points Salamander With Main Character Syndrome', 'Sir Bonus, First of His Name, Last of His Meds',
  'The Bonus Squid That Rearranged Your Furniture', 'Bonus Points, Delivered by Trebuchet', 'Feral Baby Points Elephant',
  'The Bonus Newt That Knows Too Much', 'Gerald III: Revenge of the Bonus',
];

// Deterministic, environment-independent hash -> same "today's name" on the
// bot and on the website for a given calendar date, with no coordination.
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
function todaysName() {
  const dateStr = playDateFor(new Date()); // YYYY-MM-DD in TIMEZONE
  return NAMES[hashString(dateStr) % NAMES.length];
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ---------- parsers ----------
// All the share-text parsing lives in parsers.js so parsers.test.js can run
// it against real "copy result" strings. parseScore tries each in order:
// Wordle -> LinkedIn (Name #n | M:SS) -> header+number (Krillion) -> manual.
const { parseScore, parseRename } = require('./parsers');

// Chaotic Discord announcement templates (see announcements.js).
const { say } = require('./announcements');

function playDateFor(date) {
  // en-CA locale formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date);
}

// ---------- Supabase writes ----------

// First time we see someone, record them with their Discord name. Later
// score posts DON'T touch display_name (ignoreDuplicates) so a name set via
// "my name is ..." sticks.
async function ensurePlayer(authorId, displayName) {
  const { error } = await supabase
    .from('players')
    .upsert(
      { id: authorId, display_name: displayName, discord_user_id: authorId },
      { onConflict: 'id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

// "my name is ..." - explicitly (re)set the leaderboard name.
async function setPlayerName(authorId, name) {
  const { error } = await supabase
    .from('players')
    .upsert(
      { id: authorId, display_name: name, discord_user_id: authorId },
      { onConflict: 'id' }
    );
  if (error) throw error;
}

async function ensureGame(gameId, displayName) {
  const { error } = await supabase
    .from('games')
    .upsert(
      { id: gameId, display_name: displayName, sort_direction: 'desc' },
      { onConflict: 'id', ignoreDuplicates: true }
    );
  if (error) throw error;
}

async function recordScore({ gameId, playerId, playDate, rawScore, rawText }) {
  const { error } = await supabase.from('scores').upsert(
    {
      game_id: gameId,
      player_id: playerId,
      play_date: playDate,
      raw_score: rawScore,
      raw_text: rawText,
      source: 'discord',
    },
    { onConflict: 'game_id,player_id,play_date' }
  );
  if (error) throw error;
}

// ---------- per-game play streaks ----------
// A player's streak in a specific game is however many consecutive
// calendar days ending on `throughDate` they've played THAT game - not
// "any game," so someone can carry a Wordle streak and a Krillion streak
// independently. Checked once per game per day at the 20:00 close (see
// runDailyClose), not live - only games actually played that day can have
// just crossed a new milestone, so there's no need to check more often.

const dayStr = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (isoDate, delta) =>
  dayStr(new Date(isoDate + 'T00:00:00Z').getTime() + delta * 86400000);

async function currentGameStreak(playerId, gameId, throughDate) {
  const { data: rows, error } = await supabase
    .from('scores')
    .select('play_date')
    .eq('player_id', playerId)
    .eq('game_id', gameId)
    .lte('play_date', throughDate);
  if (error) {
    console.error('[streak] fetch failed:', error);
    return 0;
  }
  const days = new Set((rows || []).map((r) => r.play_date));
  if (!days.has(throughDate)) return 0;
  let len = 0;
  let cursor = throughDate;
  while (days.has(cursor)) {
    len += 1;
    cursor = addDays(cursor, -1);
  }
  return len;
}

// Podium text for the 20:00 post - reads naturally whether there are 1, 2,
// or 3 eligible players in the Standings yet (early days, before enough
// games/people have built up rankable history).
function buildPodiumText(names) {
  if (!names.length) return null;
  if (names.length === 1) return `**${names[0]}**, flying solo at the top`;
  if (names.length === 2) return `**${names[0]}** and **${names[1]}**`;
  return `**${names[0]}**, **${names[1]}**, **${names[2]}**, in that order`;
}

// ---------- daily creature raffle + full-sweep shout-out ----------

// Weighted creature pool for the daily raffle. Weights don't need to add
// to 100 - they're relative, higher rarity = lower weight.
const CREATURES = [
  { name: 'Unicorn', emoji: '🦄', rarity: 'common', weight: 30 },
  { name: 'Pegasus', emoji: '🐴', rarity: 'common', weight: 30 },
  { name: 'Griffin Chick', emoji: '🦅', rarity: 'common', weight: 30 },
  { name: 'Jackalope', emoji: '🐇', rarity: 'common', weight: 30 },
  { name: 'Baby Wyrm', emoji: '🦎', rarity: 'common', weight: 30 },
  { name: 'Dragon', emoji: '🐉', rarity: 'uncommon', weight: 15 },
  { name: 'Mermaid', emoji: '🧜', rarity: 'uncommon', weight: 15 },
  { name: 'Kraken Spawn', emoji: '🐙', rarity: 'uncommon', weight: 15 },
  { name: 'Manticore', emoji: '🦁', rarity: 'uncommon', weight: 15 },
  { name: 'Ancient Wyrm', emoji: '🐲', rarity: 'rare', weight: 6 },
  { name: 'Leviathan', emoji: '🌊', rarity: 'rare', weight: 6 },
  { name: 'Alicorn', emoji: '🌈', rarity: 'rare', weight: 6 },
  { name: 'Phoenix', emoji: '🔥', rarity: 'legendary', weight: 2 },
  { name: 'The Last Unicorn', emoji: '👑', rarity: 'legendary', weight: 2 },
];

function pickCreature() {
  const total = CREATURES.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * total;
  for (const creature of CREATURES) {
    if (roll < creature.weight) return creature;
    roll -= creature.weight;
  }
  return CREATURES[0];
}

// Runs once a day (ROULETTE_HOUR), and sends exactly ONE Discord message
// (if anyone played today) covering everything:
//   1. top 3 in the Standings (real weighted-average rank, via standings.js)
//   2. the daily creature raffle result
//   3. any per-game streak milestones hit today
// plus a silent (no announcement) full-sweep marker write, purely so the
// website's Most Sweeps stat has something to count.
//
// isRetry: internal flag for the one auto-retry below.
// scheduleRetryOnFail: if the run throws (e.g. a transient Supabase
// gateway timeout), retry once, 2 minutes later, before giving up for the
// day - a silent failure here means nobody gets that day's bonuses and
// nothing gets announced, so one retry is cheap insurance against a blip.
// Off for --close-now, since that command exits right after this call and
// a retry firing after the process is gone would never run anyway.
async function runDailyClose(isRetry = false, scheduleRetryOnFail = true) {
  try {
    const today = playDateFor(new Date());

    const [
      { data: games, error: gamesErr },
      { data: scoresToday, error: scoresErr },
      { data: allScores, error: allScoresErr },
      { data: players, error: playersErr },
    ] = await Promise.all([
      supabase.from('games').select('*'),
      supabase.from('scores').select('*').eq('play_date', today),
      supabase.from('scores').select('game_id, player_id, raw_score'),
      supabase.from('players').select('id, display_name'),
    ]);
    if (gamesErr) throw gamesErr;
    if (scoresErr) throw scoresErr;
    if (allScoresErr) throw allScoresErr;
    if (playersErr) throw playersErr;

    if (!scoresToday.length) {
      console.log(`[close] Nobody played on ${today} - marking closed anyway.`);
      await supabase.from('daily_close_log').upsert({ play_date: today }, { onConflict: 'play_date' });
      return;
    }

    const nameById = new Map((players || []).map((p) => [p.id, p.display_name]));

    // games/players touched today, and which games "counted" (>= MIN_PLAYERS
    // distinct players played it today)
    const playersPerGame = new Map();
    const gamesPerPlayer = new Map();
    for (const s of scoresToday) {
      if (!playersPerGame.has(s.game_id)) playersPerGame.set(s.game_id, new Set());
      playersPerGame.get(s.game_id).add(s.player_id);
      if (!gamesPerPlayer.has(s.player_id)) gamesPerPlayer.set(s.player_id, new Set());
      gamesPerPlayer.get(s.player_id).add(s.game_id);
    }
    const countedGames = new Set(
      [...playersPerGame.entries()].filter(([, ps]) => ps.size >= MIN_PLAYERS).map(([g]) => g)
    );

    const lines = [];

    // ---- 1. top 3 in the Standings ----
    // Real weighted-average rank (standings.js), same math the website
    // uses - computed from ALL scores, not just today's.
    const totalsMap = computePlayerTotals(allScores, games);
    const top3Names = [...totalsMap.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([id]) => nameById.get(id) || id);
    const podium = buildPodiumText(top3Names);
    if (podium) lines.push(say.podium({ podium }));

    // ---- 2. daily creature raffle ----
    // One ticket per game played today (gamesPerPlayer.size); one winner
    // drawn from the combined ticket pool, one creature awarded from the
    // weighted CREATURES pool. The unique constraint on
    // creatures_owned.awarded_date means a retried close can't draw twice.
    const ticketPool = [];
    for (const [playerId, gameSet] of gamesPerPlayer) {
      for (let i = 0; i < gameSet.size; i++) ticketPool.push(playerId);
    }
    if (ticketPool.length) {
      const winnerId = ticketPool[Math.floor(Math.random() * ticketPool.length)];
      const creature = pickCreature();
      const { error: raffleErr } = await supabase.from('creatures_owned').insert({
        player_id: winnerId,
        creature_name: creature.name,
        creature_emoji: creature.emoji,
        rarity: creature.rarity,
        awarded_date: today,
      });
      if (raffleErr && raffleErr.code !== '23505') {
        console.error('[close] creature raffle insert failed:', raffleErr);
      } else if (!raffleErr) {
        const winnerName = nameById.get(winnerId) || winnerId;
        console.log(`[close] ${today} raffle: ${winnerName} won ${creature.emoji} ${creature.name} (${creature.rarity})`);
        lines.push(say.raffle({
          player: winnerName,
          creature: `${creature.emoji} ${creature.name}`,
          rarity: creature.rarity,
          tickets: gamesPerPlayer.get(winnerId).size,
        }));
      }
    }

    // ---- 3. per-game streak milestones hit today ----
    // Only games actually played today can have just crossed a milestone -
    // check each (player, game) pair from today's scores, in whatever
    // order Object.entries gives them (multiple milestones on the same day
    // just stack as separate lines).
    for (const [playerId, gameSet] of gamesPerPlayer) {
      for (const gameId of gameSet) {
        const streakLen = await currentGameStreak(playerId, gameId, today);
        if (!STREAK_MILESTONES.includes(streakLen)) continue;
        const { error: insErr } = await supabase
          .from('streak_awards')
          .insert({ player_id: playerId, game_id: gameId, tier_days: streakLen, streak_start: addDays(today, -(streakLen - 1)) });
        if (insErr) {
          if (insErr.code !== '23505') console.error('[streak] award insert failed:', insErr);
          continue; // 23505 -> already announced this milestone for this player+game
        }
        const game = games.find((g) => g.id === gameId);
        lines.push(say.streakMilestone({
          player: nameById.get(playerId) || playerId,
          game: (game && game.display_name) || gameId,
          days: streakLen,
        }));
      }
    }

    // ---- 4. full-sweep tracking (no announcement - see comment above) ----
    const qualifies = (playerId) =>
      countedGames.size >= COMPLETION_MIN_GAMES &&
      [...countedGames].every((g) => gamesPerPlayer.get(playerId)?.has(g));
    const completed = [...gamesPerPlayer.keys()].filter(qualifies);

    // self-correcting: clear stale completion rows, (re)write current ones
    await supabase.from('bonus_points').delete().eq('play_date', today).eq('source', 'completion');
    for (const playerId of completed) {
      const { error } = await supabase.from('bonus_points').insert({
        player_id: playerId,
        play_date: today,
        amount: 0,
        label: `✅ Full sweep (${countedGames.size} games)`,
        source: 'completion',
      });
      if (error && error.code !== '23505') console.error('[close] completion insert failed:', error);
    }

    // One message, everything above stacked together.
    if (lines.length && DISCORD_CHANNEL_ID) {
      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID).catch(() => null);
      if (channel) {
        await channel
          .send(`${say.intro({ mascot: todaysName() })}\n${lines.join('\n')}`)
          .catch(() => {});
      }
    }

    // Mark the day closed LAST, only once everything above has actually
    // finished - this is what the website checks before it'll show today's
    // scores at all (see index.html). If this throws (join with the outer
    // catch), the day stays hidden and the retry re-does the whole run.
    const { error: closeLogErr } = await supabase
      .from('daily_close_log')
      .upsert({ play_date: today }, { onConflict: 'play_date' });
    if (closeLogErr) throw closeLogErr;
    console.log(`[close] ${today} marked closed.`);
  } catch (err) {
    console.error('[close] Failed to run daily close:', err);
    if (scheduleRetryOnFail && !isRetry) {
      console.log('[close] retrying once in 2 minutes...');
      setTimeout(() => runDailyClose(true, false), 2 * 60 * 1000);
    } else if (isRetry) {
      console.error('[close] retry also failed - giving up for today.');
    }
  }
}

// ---------- bot ----------

// `node index.js --close-now` runs the daily close once and exits - handy for
// testing, or for catching up a day the bot was offline for.
const CLOSE_NOW = process.argv.includes('--close-now');

// Discord nicknames cap at 32 chars. Trim whole words off the end rather
// than cutting mid-word (so "The Bonus Lobster That Knows Your Browser
// History" becomes "The Bonus Lobster That Knows", not "...Knows You…").
function fitNickname(name) {
  if (name.length <= 32) return name;
  let out = '';
  for (const word of name.split(' ')) {
    if ((out ? out.length + 1 : 0) + word.length > 32) break;
    out += (out ? ' ' : '') + word;
  }
  return (out || name.slice(0, 32)).replace(/[,;:(\s]+$/, '');
}

// Rename the bot to today's mascot in every server it's in. Needs the
// "Change Nickname" permission (re-invite the bot or grant it in Server
// Settings -> Roles); if it's missing this just logs and moves on.
async function refreshNickname() {
  const nick = fitNickname(todaysName());
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.members.me.setNickname(nick);
      console.log(`[nick] ${guild.name}: "${nick}"`);
    } catch (e) {
      console.warn(`[nick] couldn't rename in ${guild.name}: ${e.message}`);
    }
  }
}

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  if (CLOSE_NOW) {
    console.log('Running daily close once (--close-now)...');
    await runDailyClose(false, false); // no auto-retry - the process exits right after
    console.log('Done. Exiting.');
    process.exit(0);
  }

  if (DISCORD_CHANNEL_ID) {
    console.log(`Watching channel ${DISCORD_CHANNEL_ID} only.`);
  } else {
    console.log('Watching every channel the bot can see.');
  }

  await refreshNickname();
  cron.schedule('5 0 * * *', refreshNickname, { timezone: TIMEZONE }); // new mascot at 00:05
  cron.schedule(`0 ${ROULETTE_HOUR} * * *`, () => runDailyClose(), { timezone: TIMEZONE });
  console.log(`Daily close (standings/raffle/streaks post) scheduled for ${ROULETTE_HOUR}:00 ${TIMEZONE}.`);
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (DISCORD_CHANNEL_ID && message.channelId !== DISCORD_CHANNEL_ID) return;

    const text = message.content;
    if (!text || !text.trim()) return;

    // "my name is ..." - rename on the leaderboard
    const newName = parseRename(text);
    if (newName) {
      await setPlayerName(message.author.id, newName);
      await message.react('✏️').catch(() => {});
      await message
        .reply({ content: `✏️ you're **${newName}** on the leaderboard now.`, allowedMentions: { parse: [] } })
        .catch(() => {});
      return;
    }

    // Admin override: "score @player <anything the normal parsers understand>"
    // e.g. "score @Dave Krillion: 250" or "score @Dave Wordle 1,234 4/6".
    // For fixing a missed post or backfilling - server Administrators only.
    const adminMatch = text.match(/^\s*score\s+<@!?\d+>\s*([\s\S]*)$/i);
    if (adminMatch && message.mentions.members?.size) {
      const isAdmin = message.member?.permissions?.has(PermissionsBitField.Flags.Administrator);
      if (!isAdmin) {
        await message
          .reply({ content: '🚫 only a server admin can assign a score for someone else.', allowedMentions: { parse: [] } })
          .catch(() => {});
        return;
      }
      const target = message.mentions.members.first();
      const targetName = target.displayName;
      const assigned = parseScore(adminMatch[1].trim());
      if (!assigned) {
        await message.react('⚠️').catch(() => {});
        await message
          .reply({
            content: `couldn't read a score out of that. e.g. \`score @${targetName} Krillion: 250\` or paste their share text after the mention.`,
            allowedMentions: { parse: [] },
          })
          .catch(() => {});
        return;
      }
      const assignedPlayDate = playDateFor(message.createdAt);
      await ensurePlayer(target.id, targetName);
      if (assigned.displayName) await ensureGame(assigned.gameId, assigned.displayName);
      await recordScore({
        gameId: assigned.gameId,
        playerId: target.id,
        playDate: assignedPlayDate,
        rawScore: assigned.rawScore,
        rawText: text,
      });
      await message.react('🛠️').catch(() => {});
      await message
        .reply({ content: `🛠️ logged for **${targetName}**.`, allowedMentions: { parse: [] } })
        .catch(() => {});
      // Standings, the raffle, and streak milestones are all checked once
      // at the 20:00 close, not live - see runDailyClose.
      return;
    }

    const parsed = parseScore(text);
    if (!parsed) return;

    const displayName = message.member?.displayName || message.author.username;
    const playDate = playDateFor(message.createdAt);

    await ensurePlayer(message.author.id, displayName);
    if (parsed.displayName) {
      await ensureGame(parsed.gameId, parsed.displayName);
    }
    await recordScore({
      gameId: parsed.gameId,
      playerId: message.author.id,
      playDate,
      rawScore: parsed.rawScore,
      rawText: text,
    });

    await message.react('🦐').catch(() => {});

    // Standings, the raffle, and streak milestones are all checked once at
    // the 20:00 close on the day's final state, not live on every post -
    // see runDailyClose.
  } catch (err) {
    console.error('Failed to log score:', err);
    await message.react('⚠️').catch(() => {});
  }
});

client.login(DISCORD_BOT_TOKEN);
