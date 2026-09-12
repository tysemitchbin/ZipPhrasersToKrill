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
  ROULETTE_HOUR = '16', // 24h, in TIMEZONE - when the last-place roulette spin fires
} = process.env;

if (!DISCORD_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars. Check DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// ---------- scoring constants (mirror these in index.html) ----------

// A game only awards points on a given day if at least this many people
// played it that day. Fewer than that -> nobody scores for that game.
const MIN_PLAYERS = 4;

// Scoring formulas live in scoring.js so scoring.test.js can pin the exact
// numbers; mirrored byte-for-byte in index.html's <script>.
const { rankPoints } = require('./scoring');

// Playing ANY game on this many consecutive days pays a one-off bonus
// (re-earnable after a broken streak). bonus ~= round(2 * sqrt(days)).
const STREAK_TIERS = [
  { days: 3, bonus: 3 },
  { days: 7, bonus: 5 },
  { days: 14, bonus: 7 },
  { days: 30, bonus: 11 },
  { days: 60, bonus: 15 },
  { days: 100, bonus: 20 },
];

// Playing every game that "counted" (>= MIN_PLAYERS players) on a day,
// when at least this many games counted, pays a flat completion bonus.
const COMPLETION_MIN_GAMES = 3;
const COMPLETION_BONUS = 3;

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

// ---------- milestone celebrations ----------
// Landing EXACTLY on a "special" all-time total (game points + bonus points
// combined - the same number the site shows) triggers a little bonus + a
// shout-out. A number is special when its digits form a nice pattern:
//   - repdigit   - every digit the same           (55, 222, 4444)
//   - palindrome - reads the same backwards        (121, 2332, 8008)
//   - digit run  - digits step up or down by one   (123, 456, 4321)
// plus a short list of numbers that are special by reputation, not shape.
const MEME_NUMBERS = {
  69: { flavor: 'nice.', emoji: '😏', bonus: 3 },
  420: { flavor: 'blaze it.', emoji: '🌿', bonus: 3 },
  666: { flavor: 'the number of the beast.', emoji: '😈', bonus: 4 },
  1337: { flavor: 'certified leet.', emoji: '💻', bonus: 5 },
};

function specialNumber(n) {
  if (!Number.isInteger(n) || n < 11) return null; // single digits are too easy
  if (MEME_NUMBERS[n]) return MEME_NUMBERS[n];

  const s = String(n);
  const digits = [...s].map(Number);

  if (/^(\d)\1+$/.test(s)) {
    return { flavor: `${s.length} of the same digit!`, emoji: '🎯', bonus: 4 };
  }
  if (s === [...s].reverse().join('')) {
    return { flavor: 'a palindrome - same backwards!', emoji: '🪞', bonus: 3 };
  }
  const up = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
  const down = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);
  if (s.length >= 3 && (up || down)) {
    return { flavor: up ? 'a clean run up!' : 'a clean run down!', emoji: '🪜', bonus: 3 };
  }
  return null;
}

// Sums game-ranking points (grouped by game+date, exactly like the website)
// plus any bonus_points, per player, across ALL history.
function computeAllTimeTotals(scoresAll, gamesById, bonusAll) {
  const groups = new Map(); // "gameId|date" -> rows
  for (const s of scoresAll) {
    const key = s.game_id + '|' + s.play_date;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const totals = new Map();
  const add = (playerId, amount) => totals.set(playerId, (totals.get(playerId) || 0) + amount);
  for (const [key, rows] of groups) {
    if (rows.length < MIN_PLAYERS) continue; // not enough players that day -> no points
    const [gameId] = key.split('|');
    const game = gamesById.get(gameId) || { sort_direction: 'desc' };
    const lowerIsBetter = game.sort_direction === 'asc';
    const allScores = rows.map((r) => r.raw_score);
    for (const r of rows) {
      add(r.player_id, rankPoints(r.raw_score, allScores, lowerIsBetter));
    }
  }
  for (const b of bonusAll) add(b.player_id, Number(b.amount));
  return totals;
}

async function checkMilestone(playerId, displayName, todayStr) {
  const [{ data: scoresAll, error: se }, { data: games, error: ge }, { data: bonusAll, error: be }] = await Promise.all([
    supabase.from('scores').select('game_id, player_id, play_date, raw_score'),
    supabase.from('games').select('*'),
    supabase.from('bonus_points').select('player_id, amount'),
  ]);
  if (se || ge || be) {
    console.error('[milestone] fetch failed:', se || ge || be);
    return;
  }
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const totals = computeAllTimeTotals(scoresAll, gamesById, bonusAll);
  const total = totals.get(playerId) || 0;
  const milestone = specialNumber(total);
  if (!milestone) return;

  const { error: insertErr } = await supabase
    .from('milestones_hit')
    .insert({ player_id: playerId, milestone: total });
  if (insertErr) {
    if (insertErr.code === '23505') return; // already celebrated this one for this player
    console.error('[milestone] insert failed:', insertErr);
    return;
  }

  // Plain insert (not upsert): milestones_hit above is what prevents duplicate
  // awards. In the rare case two different milestones land for the same
  // player on the same calendar day, the second bonus_points row can't also
  // be stored (one row per player/day/source) - the celebration still fires
  // either way since that's driven by milestones_hit, not this insert.
  const { error: bonusErr } = await supabase.from('bonus_points').insert({
    player_id: playerId,
    play_date: todayStr,
    amount: milestone.bonus,
    label: `${milestone.emoji} Milestone: ${total}`,
    source: 'milestone',
  });
  if (bonusErr && bonusErr.code !== '23505') {
    console.error('[milestone] bonus insert failed:', bonusErr);
  }

  if (DISCORD_CHANNEL_ID) {
    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID).catch(() => null);
    if (channel) {
      await channel
        .send(say.milestone({
          mascot: todaysName(),
          player: displayName,
          total,
          flavor: milestone.flavor,
          bonus: milestone.bonus,
        }))
        .catch(() => {});
    }
  }
}

// ---------- daily-play streaks ----------
// "Played any game today" extends a streak. Hitting a STREAK_TIERS length
// pays a one-off bonus, tracked per streak run (streak_start) so it can be
// earned again after a broken streak.

const dayStr = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (isoDate, delta) =>
  dayStr(new Date(isoDate + 'T00:00:00Z').getTime() + delta * 86400000);

async function checkStreak(playerId, displayName, playDate) {
  const { data: rows, error } = await supabase
    .from('scores')
    .select('play_date')
    .eq('player_id', playerId)
    .lte('play_date', playDate);
  if (error) {
    console.error('[streak] fetch failed:', error);
    return;
  }

  const days = new Set((rows || []).map((r) => r.play_date));
  if (!days.has(playDate)) return;

  let streakLen = 0;
  let cursor = playDate;
  while (days.has(cursor)) {
    streakLen += 1;
    cursor = addDays(cursor, -1);
  }
  const streakStart = addDays(playDate, -(streakLen - 1));

  const newTiers = [];
  for (const tier of STREAK_TIERS) {
    if (streakLen < tier.days) continue;
    const { error: insErr } = await supabase
      .from('streak_awards')
      .insert({ player_id: playerId, tier_days: tier.days, streak_start: streakStart });
    if (insErr) {
      if (insErr.code !== '23505') console.error('[streak] award insert failed:', insErr);
      continue; // 23505 -> already paid for this tier in this run
    }
    newTiers.push(tier);
  }
  if (!newTiers.length) return;

  const bonusTotal = newTiers.reduce((sum, t) => sum + t.bonus, 0);
  const topTier = newTiers[newTiers.length - 1];

  const { error: bErr } = await supabase.from('bonus_points').upsert(
    {
      player_id: playerId,
      play_date: playDate,
      amount: bonusTotal,
      label: `🔥 ${topTier.days}-day streak`,
      source: 'streak',
    },
    { onConflict: 'player_id,play_date,source' }
  );
  if (bErr) console.error('[streak] bonus insert failed:', bErr);

  if (DISCORD_CHANNEL_ID) {
    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID).catch(() => null);
    if (channel) {
      await channel
        .send(say.streak({ mascot: todaysName(), player: displayName, days: topTier.days, bonus: bonusTotal }))
        .catch(() => {});
    }
  }
}

// ---------- Mario Kart-style roulette + completion bonuses ----------

// Weighted prize wheel. Weights don't need to add to 100 - they're relative.
const WHEEL = [
  { label: '🍄 Mushroom', amount: 1, weight: 30 },
  { label: '🐢 Green Shell', amount: 2, weight: 25 },
  { label: '💣 Bob-omb', amount: 3, weight: 15 },
  { label: '🍌 Banana Peel', amount: -1, weight: 15 }, // the rare dud
  { label: '🌟 Star', amount: 4, weight: 10 },
  { label: '🐚 Blue Shell', amount: 7, weight: 5 },    // jackpot
];

function spinWheel() {
  const total = WHEEL.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * total;
  for (const prize of WHEEL) {
    if (roll < prize.weight) return prize;
    roll -= prize.weight;
  }
  return WHEEL[0];
}

// Same ranking/points math as the website - kept in sync deliberately.
function computeTodayPoints(scoresToday, gamesById) {
  const groups = new Map(); // gameId -> rows
  for (const s of scoresToday) {
    if (!groups.has(s.game_id)) groups.set(s.game_id, []);
    groups.get(s.game_id).push(s);
  }
  const totals = new Map(); // playerId -> points today
  for (const [gameId, rows] of groups) {
    if (rows.length < MIN_PLAYERS) continue; // not enough players today -> no points
    const game = gamesById.get(gameId) || { sort_direction: 'desc' };
    const lowerIsBetter = game.sort_direction === 'asc';
    const allScores = rows.map((r) => r.raw_score);
    for (const r of rows) {
      const pts = rankPoints(r.raw_score, allScores, lowerIsBetter);
      totals.set(r.player_id, (totals.get(r.player_id) || 0) + pts);
    }
  }
  return totals;
}

// Runs once a day (ROULETTE_HOUR). Two things, both based on the day's
// scores as of that hour:
//   1. completion bonus - played every game that counted today
//   2. roulette - the bottom third of the day each spin the wheel; the
//      lowest scorer(s) spin twice
// Scores posted after this hour still count for skill points and streaks
// (those are live), just not for that day's completion / roulette.
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

    const [{ data: games, error: gamesErr }, { data: scoresToday, error: scoresErr }] = await Promise.all([
      supabase.from('games').select('*'),
      supabase.from('scores').select('*').eq('play_date', today),
    ]);
    if (gamesErr) throw gamesErr;
    if (scoresErr) throw scoresErr;

    if (!scoresToday.length) {
      console.log(`[close] Nobody played on ${today} - skipping.`);
      return;
    }

    const gamesById = new Map(games.map((g) => [g.id, g]));

    // games that "counted" today (>= MIN_PLAYERS distinct players)
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

    const { data: players, error: playersErr } = await supabase
      .from('players')
      .select('id, display_name')
      .in('id', [...gamesPerPlayer.keys()]);
    if (playersErr) throw playersErr;
    const nameById = new Map((players || []).map((p) => [p.id, p.display_name]));

    const announce = [];

    // ---- 1. completion bonus ----
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
        amount: COMPLETION_BONUS,
        label: `✅ Full sweep (${countedGames.size} games)`,
        source: 'completion',
      });
      if (error && error.code !== '23505') console.error('[close] completion insert failed:', error);
    }
    if (completed.length) {
      announce.push(say.sweepLine({
        players: completed.map((id) => `**${nameById.get(id) || id}**`).join(', '),
        count: countedGames.size,
        bonus: COMPLETION_BONUS,
      }));
    }

    // ---- 2. roulette for the bottom third ----
    const totals = computeTodayPoints(scoresToday, gamesById);
    const ranked = [...totals.entries()].sort((a, b) => a[1] - b[1]); // fewest points first
    if (ranked.length) {
      const cutoff = Math.max(1, Math.ceil(ranked.length / 3));
      const threshold = ranked[Math.min(cutoff, ranked.length) - 1][1];
      const minPoints = ranked[0][1];
      const bottom = ranked.filter(([, pts]) => pts <= threshold);

      const spins = [];
      for (const [playerId, pts] of bottom) {
        const nSpins = pts === minPoints ? 2 : 1; // dead last spins twice
        let amount = 0;
        const labels = [];
        for (let k = 0; k < nSpins; k++) {
          const prize = spinWheel();
          amount += prize.amount;
          labels.push(prize.label);
        }
        const { error } = await supabase.from('bonus_points').upsert(
          {
            player_id: playerId,
            play_date: today,
            amount,
            label: (nSpins > 1 ? '🎰x2 ' : '🎰 ') + labels.join(' + '),
            source: 'roulette',
          },
          { onConflict: 'player_id,play_date,source', ignoreDuplicates: true }
        );
        if (error) {
          console.error(`[close] roulette award failed for ${playerId}:`, error);
          continue;
        }
        spins.push({ name: nameById.get(playerId) || playerId, amount, labels, nSpins });
      }
      if (spins.length) {
        console.log(`[close] ${today} roulette:`, spins);
        for (const s of spins) {
          announce.push(say.rouletteLine(
            {
              player: s.name,
              prize: s.labels.join(' + '),
              amount: `${s.amount >= 0 ? '+' : ''}${s.amount}`,
            },
            s.nSpins > 1
          ));
        }
      }
    }

    if (announce.length && DISCORD_CHANNEL_ID) {
      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID).catch(() => null);
      if (channel) {
        await channel
          .send(`${say.intro({ mascot: todaysName() })}\n${announce.join('\n')}`)
          .catch(() => {});
      }
    }
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
  console.log(`Daily close (completion + roulette) scheduled for ${ROULETTE_HOUR}:00 ${TIMEZONE}.`);
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
      checkMilestone(target.id, targetName, assignedPlayDate).catch((err) =>
        console.error('[milestone] check failed:', err)
      );
      checkStreak(target.id, targetName, assignedPlayDate).catch((err) =>
        console.error('[streak] check failed:', err)
      );
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

    // Fire-and-forget follow-ups: milestone (all-time total hit a special
    // number) and streak (played on N consecutive days).
    checkMilestone(message.author.id, displayName, playDate).catch((err) =>
      console.error('[milestone] check failed:', err)
    );
    checkStreak(message.author.id, displayName, playDate).catch((err) =>
      console.error('[streak] check failed:', err)
    );
  } catch (err) {
    console.error('Failed to log score:', err);
    await message.react('⚠️').catch(() => {});
  }
});

client.login(DISCORD_BOT_TOKEN);
