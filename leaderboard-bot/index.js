require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
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

// A game only awards points on a given day if at least this many people
// played it that day. Fewer than that -> nobody scores for that game that
// day. Must match MIN_PLAYERS in the website's (index.html) scoring code.
const MIN_PLAYERS = 4;

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

// "Wordle 1,234 3/6" or "Wordle 1234 X/6*" (hard mode star is ignored)
function parseWordle(text) {
  const m = text.match(/Wordle\s+[\d,]+\s+([1-6X])\/6/i);
  if (!m) return null;
  const guesses = m[1].toUpperCase() === 'X' ? 7 : parseInt(m[1], 10);
  return { gameId: 'wordle', rawScore: guesses };
}

// "Connections \nPuzzle #123\n<emoji row>\n<emoji row>..." - score is mistakes.
const EMOJI_ROW = /^[\u{1F7E5}\u{1F7E7}\u{1F7E8}\u{1F7E9}\u{1F7E6}\u{1F7EA}\u{2B1B}\u{2B1C}\u{1F7EB}]{4}$/u;
function parseConnections(text) {
  if (!/Connections/i.test(text) || !/Puzzle\s*#?\d+/i.test(text)) return null;
  const rows = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => EMOJI_ROW.test(l));
  if (rows.length < 4) return null; // didn't finish, or not actually a Connections share
  const mistakes = Math.max(0, rows.length - 4);
  return { gameId: 'connections', rawScore: mistakes };
}

// Fallback: first line reads like "Krillion: 15", "Zip 1:23", "Tango: 0:47".
// A bare number is taken as-is; an M:SS / MM:SS / H:MM:SS time is converted to
// total seconds (so the LinkedIn timed games - Zip, Tango, Queens, Crossclimb,
// Wend, Patches - can be posted the way their share screens show them).
function parseGeneric(text) {
  const firstLine = text.trim().split('\n')[0];
  const m = firstLine.match(/^([A-Za-z0-9][A-Za-z0-9 '\-]{1,29}?)[:\s]+(\d{1,2}(?::\d{2})+|-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const name = m[1].trim();
  const valueStr = m[2];
  const rawScore = valueStr.includes(':')
    ? valueStr.split(':').reduce((acc, part) => acc * 60 + parseInt(part, 10), 0)
    : parseFloat(valueStr);
  const gameId = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!gameId) return null;
  return { gameId, displayName: name, rawScore };
}

function parseScore(text) {
  return parseWordle(text) || parseConnections(text) || parseGeneric(text);
}

function playDateFor(date) {
  // en-CA locale formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date);
}

// ---------- Supabase writes ----------

async function ensurePlayer(authorId, displayName) {
  const { error } = await supabase
    .from('players')
    .upsert({ id: authorId, display_name: displayName, discord_user_id: authorId }, { onConflict: 'id' });
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
    const sorted = [...rows].sort((a, b) =>
      lowerIsBetter ? a.raw_score - b.raw_score : b.raw_score - a.raw_score
    );
    const n = sorted.length;
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].raw_score !== sorted[i - 1].raw_score) rank = i + 1;
      add(sorted[i].player_id, n - rank + 1);
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
        .send(
          `🎲 **${todaysName().toUpperCase()} STUMBLES IN** 🎲\n` +
          `${milestone.emoji} **${displayName}** just hit **${total}** total points — ${milestone.flavor} (+${milestone.bonus} bonus)`
        )
        .catch(() => {});
    }
  }
}

// ---------- Mario Kart-style roulette for last place ----------

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
    const sorted = [...rows].sort((a, b) =>
      lowerIsBetter ? a.raw_score - b.raw_score : b.raw_score - a.raw_score
    );
    const n = sorted.length;
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].raw_score !== sorted[i - 1].raw_score) rank = i + 1;
      const pts = n - rank + 1;
      totals.set(sorted[i].player_id, (totals.get(sorted[i].player_id) || 0) + pts);
    }
  }
  return totals;
}

async function runDailyRoulette() {
  try {
    const today = playDateFor(new Date());

    const [{ data: games, error: gamesErr }, { data: scoresToday, error: scoresErr }] = await Promise.all([
      supabase.from('games').select('*'),
      supabase.from('scores').select('*').eq('play_date', today),
    ]);
    if (gamesErr) throw gamesErr;
    if (scoresErr) throw scoresErr;

    if (!scoresToday.length) {
      console.log(`[roulette] Nobody played on ${today} - skipping.`);
      return;
    }

    const gamesById = new Map(games.map((g) => [g.id, g]));
    const totals = computeTodayPoints(scoresToday, gamesById);

    let minPoints = Infinity;
    for (const v of totals.values()) if (v < minPoints) minPoints = v;
    const lastPlacePlayerIds = [...totals.entries()]
      .filter(([, pts]) => pts === minPoints)
      .map(([playerId]) => playerId);

    if (!lastPlacePlayerIds.length) return;

    const { data: players, error: playersErr } = await supabase
      .from('players')
      .select('id, display_name')
      .in('id', lastPlacePlayerIds);
    if (playersErr) throw playersErr;
    const nameById = new Map((players || []).map((p) => [p.id, p.display_name]));

    const results = [];
    for (const playerId of lastPlacePlayerIds) {
      const prize = spinWheel();
      const { error } = await supabase.from('bonus_points').upsert(
        {
          player_id: playerId,
          play_date: today,
          amount: prize.amount,
          label: prize.label,
          source: 'roulette',
        },
        { onConflict: 'player_id,play_date,source', ignoreDuplicates: true }
      );
      if (error) {
        console.error(`[roulette] Failed to award ${playerId}:`, error);
        continue;
      }
      results.push({ name: nameById.get(playerId) || playerId, prize });
    }

    if (!results.length) return;

    console.log(`[roulette] ${today} last place (${minPoints} pts):`, results);

    if (DISCORD_CHANNEL_ID) {
      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID).catch(() => null);
      if (channel) {
        const lines = results.map(
          (r) => `🎰 **${r.name}** was in last place today and spun **${r.prize.label}** (${r.prize.amount >= 0 ? '+' : ''}${r.prize.amount} pts)!`
        );
        await channel.send(`🎲 **${todaysName().toUpperCase()} STUMBLES IN** 🎲\n${lines.join('\n')}`).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[roulette] Failed to run daily roulette:', err);
  }
}

// ---------- bot ----------

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (DISCORD_CHANNEL_ID) {
    console.log(`Watching channel ${DISCORD_CHANNEL_ID} only.`);
  } else {
    console.log('Watching every channel the bot can see.');
  }

  cron.schedule(`0 ${ROULETTE_HOUR} * * *`, runDailyRoulette, { timezone: TIMEZONE });
  console.log(`Roulette scheduled for ${ROULETTE_HOUR}:00 ${TIMEZONE}, daily.`);
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (DISCORD_CHANNEL_ID && message.channelId !== DISCORD_CHANNEL_ID) return;

    const text = message.content;
    if (!text || !text.trim()) return;

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

    await message.react('✅').catch(() => {});

    // Fire-and-forget: check whether this update just landed the player's
    // all-time total exactly on a milestone number.
    checkMilestone(message.author.id, displayName, playDate).catch((err) =>
      console.error('[milestone] check failed:', err)
    );
  } catch (err) {
    console.error('Failed to log score:', err);
    await message.react('⚠️').catch(() => {});
  }
});

client.login(DISCORD_BOT_TOKEN);
