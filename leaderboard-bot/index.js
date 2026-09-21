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
  PREVIEW_HOUR = '12', // 24h, in TIMEZONE - when the noon "creatures spotted nearby" post fires.
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

// The creature system (noon preview + the raffle's creature draw) doesn't
// start until this date, so deploying mid-day doesn't fire it early - the
// rest of the close (Standings podium, streak milestones) is unaffected
// and runs as normal regardless of this date. Remove this once it's past.
const CREATURE_SYSTEM_START_DATE = '2026-09-19';

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
  'Drunken Platypus', 'Feral Deranged Ferret', 'Captain Sea Walrus',
  'Gary the Cursed Abacus', 'Big Naughty Dispenser', 'Baroness Von Snackpot',
  'Disappointed Dad Duck', 'Chunky Fiscal Raccoon', 'Legally Distinct Wizard',
  'Sweaty Gerald from HR', 'Panda on Probation', 'HR-Flagged Bumblebee',
  'The Unpaid Intern', 'Moist Ferret Returns', 'Karen of Cul-de-Sac',
  'A Goose That Owes Rent', 'Feral Cryptid', 'Sad Clown Terminal',
  'Diet Chaos Alpaca', 'Slightly Damp Lord', 'Squirrel, Court-Ordered',
  'Gremlin Who Stole Snacks', 'Hyperfixation Hamster', 'Dysfunction Pelican',
  'Chaos, But Make It Weird', 'Manatee, Peaked in HS', 'Unsupervised Otter',
  'Kevin, Do Not Feed', "Lord Farquaad's Realm", 'Deeply Unwell Flamingo',
  'Turtle With Daddy Issues', 'Aggressively Mid Turtle', 'The Tax-Evading Capybara',
  'Lizard, Ask My Lawyer', 'Emotionally Distant Owl', 'Wet Sock Full of Regret',
  'Broken Vending Machine', 'Trash Panda, Notarized', 'Pigeon Formerly Steve',
  'Chaotic Neutral Sloth', 'One Unhinged Moose', 'Wombat, Freshly Divorced',
  'Small Ashamed Kraken', 'The Dopamine Landlord', 'Wizard of Poor Choices',
  'Interpretive Dance Crab', "Gerald's Nemesis Gerald", 'Barely Legal Hedgehog',
  'Clinically Feral Badger', 'Snail With Road Rage', 'The Unlicensed Fairy',
  "Grandma's Cursed Frog", 'Just Keeps Screaming', 'Mildly Threatening Duck',
  'Sir Unwashed-a-Lot', 'Beaver on Probation', 'The Void, but Friendly',
  'Rejected Muppet Officer', 'Shrimp Who Forgot Meds', 'The Lobster Who Knows',
  'Fox, Pending Litigation', 'Gecko Sells Insurance', 'Overstimulated Koala',
  "Nap Goblin's Accountant", 'Fueled Entirely by Spite', 'Chad but a Chinchilla',
  'Unlicensed Pharmacist', 'The Hippo Texted at 3am', 'Crab in a Wizard Hat',
  'Eel, Tazed Once Again', 'Barry the Bat, Not That', 'Pigeon Who Ghosted You',
  "Ol' Sticky the Weird One", 'Therapist-Warned Slug', 'Suspiciously Rich Weasel',
  'Sleep-Deprived Gremlin', 'The Last Honest Possum', 'Yak With No Permanence',
  'Dr Chaos, PhD Nonsense', 'The Feral Stapler', 'Mildly Haunted Roomba',
  'Kombucha-Soaked Raccoon', 'Whale Who Gave Up Novel', 'Tiny Horse, Big Energy',
  'Bankrupt Meerkat', 'Held Hostage by Goose', 'The Unemployed Dragon',
  'Mole Person, Surfaced', 'Big Energy, No Plan', 'Salamander, Main Char',
  'Sir First, Last of Meds', 'Furniture-Moving Squid', 'Delivered by Trebuchet',
  'Feral Baby Elephant', 'The Newt Knows Too Much', 'Gerald III: Revenge',
  'The Weird Manatee', 'Unbothered Llama', 'The Nervous Walrus',
  'Extremely Suspicious Cat',
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
function mascotFor(dateStr) {
  return NAMES[hashString(dateStr) % NAMES.length];
}
function todaysName() {
  return mascotFor(playDateFor(new Date())); // YYYY-MM-DD in TIMEZONE
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

// Current hour (0-23) in TIMEZONE.
function hourIn(date) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(date));
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

// Plain medal lines for the 20:00 post - one per eligible player (1-3, not
// always 3 - early days, before enough games/people have built up rankable
// Standings history, there may be fewer).
const MEDALS = ['🥇', '🥈', '🥉'];
function buildPodiumLines(names) {
  return names.map((name, i) => `${MEDALS[i]} **${name}**`);
}

// ---------- daily creature raffle + full-sweep shout-out ----------

// Weighted creature pool for the daily raffle. Weights don't need to add
// to 100 - they're relative, higher rarity = lower weight.
const CREATURES = [
  // ---- common ----
  { name: 'Unicorn', emoji: '🦄', rarity: 'common', weight: 30, desc: 'A horse bearing a single spiraled horn, long regarded as a symbol of purity and grace.' },
  { name: 'Pegasus', emoji: '🐴', rarity: 'common', weight: 30, desc: 'A horse born of the heavens, its wings said to have carried heroes beyond the reach of mortals.' },
  { name: 'Griffin Chick', emoji: '🦅', rarity: 'common', weight: 30, desc: 'The young of a noble guardian — half eagle, half lion — destined to watch over treasures not yet its own.' },
  { name: 'Jackalope', emoji: '🐇', rarity: 'common', weight: 30, desc: 'A horned hare of the American plains, elusive and quick, said to outwit every hunter.' },
  { name: 'Baby Wyrm', emoji: '🦖', rarity: 'common', weight: 30, desc: 'A young serpent-dragon, its fire still a smoldering promise of the power to come.' },
  { name: 'Wolpertinger', emoji: '🐰', rarity: 'common', weight: 30, desc: 'A winged, antlered creature of the Bavarian forests, small in stature but fierce in defense of its territory.' },
  { name: 'Hedgehog', emoji: '🦔', rarity: 'common', weight: 30, desc: 'A small, spine-cloaked wanderer of hedgerows and gardens, curling into an impenetrable ball when threatened.' },
  { name: 'Fennec Fox', emoji: '🦊', rarity: 'common', weight: 30, desc: 'A fox of the desert sands, its oversized ears carrying sound — and heat — across the dunes.' },
  { name: 'Quokka', emoji: '🐹', rarity: 'common', weight: 30, desc: 'A small marsupial of the Australian isles, forever wearing an expression of pure contentment.' },

  // ---- uncommon ----
  { name: 'Dragon', emoji: '🐉', rarity: 'uncommon', weight: 15, desc: 'A great fire-breathing beast, ancient and proud, guarding treasures beyond counting.' },
  { name: 'Kraken Spawn', emoji: '🐙', rarity: 'uncommon', weight: 15, desc: 'The offspring of the deep-sea leviathan, already carrying the weight of legend in its small frame.' },
  { name: 'Qilin', emoji: '🦌', rarity: 'uncommon', weight: 15, desc: 'A hooved and scaled creature of Chinese legend, its appearance long taken as a sign of great fortune.' },
  { name: 'Kelpie', emoji: '🐎', rarity: 'uncommon', weight: 15, desc: 'A shape-shifting water horse of Scottish lochs, as beautiful as it is perilous to those who approach.' },
  { name: 'Chimera', emoji: '🐐', rarity: 'uncommon', weight: 15, desc: 'A fearsome union of lion, goat, and serpent, born of ancient Greek nightmare.' },
  { name: 'Amphisbaena', emoji: '🐍', rarity: 'uncommon', weight: 15, desc: 'A serpent bearing a head at each end, moving with equal purpose in either direction.' },
  { name: 'Caladrius', emoji: '🐦‍⬛', rarity: 'uncommon', weight: 15, desc: 'A pure white bird of old Roman legend, said to draw sickness from the afflicted with a single glance.' },
  { name: 'Axolotl', emoji: '🦎', rarity: 'uncommon', weight: 15, desc: 'An aquatic salamander that never leaves its youth behind, capable of regrowing limbs lost to misfortune.' },
  { name: 'Narwhal', emoji: '🐋', rarity: 'uncommon', weight: 15, desc: 'A whale of the Arctic seas, bearing a single spiraled tusk — the true unicorn of the ocean.' },
  { name: 'Leafy Seadragon', emoji: '🍃', rarity: 'uncommon', weight: 15, desc: 'A seahorse relative draped in leaf-shaped fins, drifting through kelp forests as if grown from the sea itself.' },
  { name: 'Sugar Glider', emoji: '🐿️', rarity: 'uncommon', weight: 15, desc: 'A tiny gliding marsupial, its outstretched skin catching the air between the treetops of the night.' },

  // ---- rare ----
  { name: 'Ancient Wyrm', emoji: '🐲', rarity: 'rare', weight: 6, desc: 'A dragon-serpent of great age, its scales bearing the weight of centuries.' },
  { name: 'Alicorn', emoji: '🌈', rarity: 'rare', weight: 6, desc: 'A unicorn graced with wings, uniting two symbols of nobility into one.' },
  { name: 'Bunyip', emoji: '🐊', rarity: 'rare', weight: 6, desc: 'A creature of Australian waterways, its true form lost to conflicting tales across generations.' },
  { name: 'Nue', emoji: '🐒', rarity: 'rare', weight: 6, desc: 'A Japanese chimera of monkey, badger, tiger, and serpent — a portent of misfortune in old legend.' },
  { name: 'Hippogriff', emoji: '🪽', rarity: 'rare', weight: 6, desc: 'The union of eagle and horse, a creature of the sky born from ancient poetry.' },
  { name: 'Glass Frog', emoji: '🐸', rarity: 'rare', weight: 6, desc: 'A frog of the cloud forest whose translucent skin reveals the beating of its own heart.' },
  { name: 'Sea Bunny', emoji: '🐌', rarity: 'rare', weight: 6, desc: 'A nudibranch of the shallows, its rabbit-like markings disguising a creature entirely alien in nature.' },
  { name: 'Mandarinfish', emoji: '🎨', rarity: 'rare', weight: 6, desc: 'A reef-dweller painted in colors too vivid to be believed, proof that beauty needs no excuse.' },
  { name: 'Satanic Leaf-tailed Gecko', emoji: '🍂', rarity: 'rare', weight: 6, desc: 'A gecko disguised so perfectly as a dead leaf that its discovery is often mistaken for illusion.' },
  { name: 'Pink Fairy Armadillo', emoji: '🩷', rarity: 'rare', weight: 6, desc: 'The smallest of armadillos, sheltering beneath a shell the color of dawn, rarely seen by mortal eyes.' },

  // ---- legendary ----
  { name: 'Phoenix', emoji: '🔥', rarity: 'legendary', weight: 2, desc: 'A bird of fire and rebirth, consumed by flame only to rise renewed from its own ashes.' },
  { name: 'The Last Unicorn', emoji: '👑', rarity: 'legendary', weight: 2, desc: 'The sole unicorn remaining in a world that has forgotten the rest, bearing that solitude with quiet dignity.' },
  { name: 'Simurgh', emoji: '🦚', rarity: 'legendary', weight: 2, desc: 'An ancient and benevolent bird of Persian legend, said to hold the wisdom of all ages within its wings.' },
  { name: 'Questing Beast', emoji: '🦁', rarity: 'legendary', weight: 2, desc: 'A creature of Arthurian legend — serpent-headed, leopard-bodied — endlessly pursued and never once caught.' },
  { name: 'Blue Dragon Sea Slug', emoji: '🩵', rarity: 'legendary', weight: 2, desc: 'A sea slug no larger than a fingernail, drifting the open ocean in the exact likeness of a tiny dragon.' },
  { name: 'Tardigrade', emoji: '🐻', rarity: 'legendary', weight: 2, desc: 'A creature nearly indestructible, said to survive the vacuum of space itself — legend made microscopic.' },
];

function pickCreature(pool = CREATURES) {
  const total = pool.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * total;
  for (const creature of pool) {
    if (roll < creature.weight) return creature;
    roll -= creature.weight;
  }
  return pool[0];
}

// How many creatures the noon preview shows, and the evening raffle is
// restricted to - see DAILY_CREATURE_POOL_SIZE.
const DAILY_CREATURE_POOL_SIZE = 5;

// Picks DAILY_CREATURE_POOL_SIZE distinct creatures, weighted by rarity
// same as always, without replacement (each pick removes that creature
// from the remaining pool) - so which 5 show up today still favors
// commons, but a rare or legendary can absolutely make the cut. Tonight's
// actual winner is then a FLAT 1-in-5 among these (see runDailyClose) -
// the rarity weighting already happened in choosing which 5 are in play.
function pickCreaturePool(size = DAILY_CREATURE_POOL_SIZE) {
  const remaining = [...CREATURES];
  const chosen = [];
  for (let i = 0; i < size && remaining.length; i++) {
    const pick = pickCreature(remaining);
    chosen.push(pick);
    remaining.splice(remaining.indexOf(pick), 1);
  }
  return chosen;
}

// Creature name -> CREATURES entry, for turning the names stored in
// daily_creature_pool back into full creature objects (emoji, rarity, desc).
function creaturesByNames(names) {
  return names.map((n) => CREATURES.find((c) => c.name === n)).filter(Boolean);
}

// Returns today's 5-creature raffle pool (as CREATURES objects), creating
// and persisting one via pickCreaturePool() if it doesn't exist yet - e.g.
// the noon preview never fired (bot was offline), or --close-now is being
// used to test the close in isolation. Silent - never announces anything,
// just guarantees the evening raffle always has a pool to draw from.
async function getOrCreateTodaysPool(today) {
  const { data: existing, error: fetchErr } = await supabase
    .from('daily_creature_pool')
    .select('creature_names')
    .eq('play_date', today)
    .maybeSingle();
  if (fetchErr) console.error('[creatures] pool fetch failed:', fetchErr);
  if (existing) return creaturesByNames(existing.creature_names);

  const chosen = pickCreaturePool();
  const { error: insertErr } = await supabase
    .from('daily_creature_pool')
    .insert({ play_date: today, creature_names: chosen.map((c) => c.name) });
  if (insertErr && insertErr.code === '23505') {
    // lost a race with a concurrent call (e.g. the noon preview firing at
    // the same moment) - use whichever one actually landed.
    const { data: raced } = await supabase
      .from('daily_creature_pool')
      .select('creature_names')
      .eq('play_date', today)
      .maybeSingle();
    if (raced) return creaturesByNames(raced.creature_names);
  } else if (insertErr) {
    console.error('[creatures] pool insert failed:', insertErr);
  }
  return chosen;
}

// Runs once a day (PREVIEW_HOUR, default noon) - picks and persists today's
// 5-creature raffle pool (if not already set) and announces it, so people
// know what's actually on the table before deciding whether to play today.
// Only announces if this call is the one that actually created the pool -
// if it already existed (e.g. this fires twice, or the close already made
// one via getOrCreateTodaysPool), stays silent rather than re-announcing.
async function runMiddayPreview() {
  try {
    const today = playDateFor(new Date());
    if (today < CREATURE_SYSTEM_START_DATE) {
      console.log(`[preview] Creature system starts ${CREATURE_SYSTEM_START_DATE} - skipping for ${today}.`);
      return;
    }
    const chosen = pickCreaturePool();
    const { error: insertErr } = await supabase
      .from('daily_creature_pool')
      .insert({ play_date: today, creature_names: chosen.map((c) => c.name) });
    if (insertErr) {
      if (insertErr.code !== '23505') console.error('[preview] pool insert failed:', insertErr);
      return; // already exists - already announced (or will be used silently by the close)
    }

    if (DISCORD_CHANNEL_ID) {
      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID).catch(() => null);
      if (channel) {
        const creatures = chosen.map((c) => `${c.emoji} ${c.name} (${c.rarity})`).join(', ');
        await channel
          .send(`${say.intro({ mascot: todaysName() })}\n${say.preview({ creatures })}`)
          .catch(() => {});
      }
    }
  } catch (err) {
    console.error('[preview] Failed to run midday preview:', err);
  }
}

// Runs once a day (ROULETTE_HOUR), and sends exactly ONE Discord message
// (if anyone played today) covering everything:
//   1. top 3 in the Standings (real weighted-average rank, via standings.js)
//   2. the daily creature raffle result
//   3. any per-game streak milestones hit today
// plus a silent (no announcement) full-sweep marker write, purely so the
// website's Most Sweeps stat has something to count.
//
// `day` is the play date (YYYY-MM-DD) being closed - normally today, but
// catchUpCloses() also passes earlier days that never got closed. Throws
// on any failure, leaving the day out of daily_close_log so the next
// catchUpCloses() pass (every 10 minutes) tries the whole thing again.
// Safe to re-run: the raffle and streak awards are unique per day, and a
// re-run re-announces whatever an earlier failed attempt already saved.
async function runDailyClose(day = playDateFor(new Date())) {
  const today = day;
  const isLate = today !== playDateFor(new Date());

  const [
    { data: games, error: gamesErr },
    { data: scoresToday, error: scoresErr },
    { data: allScores, error: allScoresErr },
    { data: players, error: playersErr },
  ] = await Promise.all([
    supabase.from('games').select('*'),
    supabase.from('scores').select('*').eq('play_date', today),
    // only up to the day being closed, so a late close ranks as of that day
    supabase.from('scores').select('game_id, player_id, raw_score').lte('play_date', today),
    supabase.from('players').select('id, display_name'),
  ]);
  if (gamesErr) throw gamesErr;
  if (scoresErr) throw scoresErr;
  if (allScoresErr) throw allScoresErr;
  if (playersErr) throw playersErr;

  if (!scoresToday.length) {
    console.log(`[close] Nobody played on ${today} - marking closed anyway.`);
    const { error } = await supabase.from('daily_close_log').upsert({ play_date: today }, { onConflict: 'play_date' });
    if (error) throw error;
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
  if (top3Names.length) {
    lines.push(say.podiumIntro());
    lines.push(...buildPodiumLines(top3Names));
  }

  // ---- 2. daily creature raffle ----
  // One ticket per game played today (gamesPerPlayer.size); one winner
  // drawn from the combined ticket pool. The creature itself is a FLAT
  // 1-in-5 pick among today's already-weighted 5-creature pool (see
  // getOrCreateTodaysPool/pickCreaturePool) - the rarity weighting
  // already happened in choosing which 5 were in play at noon. The
  // unique constraint on creatures_owned.awarded_date means a retried
  // close can't draw twice.
  const ticketPool = [];
  for (const [playerId, gameSet] of gamesPerPlayer) {
    for (let i = 0; i < gameSet.size; i++) ticketPool.push(playerId);
  }
  if (today < CREATURE_SYSTEM_START_DATE) {
    console.log(`[close] Creature system starts ${CREATURE_SYSTEM_START_DATE} - skipping raffle for ${today}.`);
  } else if (ticketPool.length) {
    const winnerId = ticketPool[Math.floor(Math.random() * ticketPool.length)];
    const todaysPool = await getOrCreateTodaysPool(today);
    const creature = todaysPool[Math.floor(Math.random() * todaysPool.length)];
    const { error: raffleErr } = await supabase.from('creatures_owned').insert({
      player_id: winnerId,
      creature_name: creature.name,
      creature_emoji: creature.emoji,
      rarity: creature.rarity,
      awarded_date: today,
    });
    let won = { player_id: winnerId, creature_name: creature.name };
    if (raffleErr && raffleErr.code === '23505') {
      // an earlier attempt at this close already drew - announce that draw
      const { data: prior, error: priorErr } = await supabase
        .from('creatures_owned')
        .select('player_id, creature_name')
        .eq('awarded_date', today)
        .maybeSingle();
      if (priorErr) throw priorErr;
      won = prior;
    } else if (raffleErr) {
      throw raffleErr;
    }
    const wonCreature = won && CREATURES.find((c) => c.name === won.creature_name);
    if (wonCreature) {
      const winnerName = nameById.get(won.player_id) || won.player_id;
      console.log(`[close] ${today} raffle: ${winnerName} won ${wonCreature.emoji} ${wonCreature.name} (${wonCreature.rarity})`);
      lines.push(say.raffle({
        player: winnerName,
        creature: `${wonCreature.emoji} ${wonCreature.name}`,
        rarity: wonCreature.rarity,
        tickets: gamesPerPlayer.get(won.player_id)?.size || 1,
      }));
      lines.push(`*${wonCreature.desc}*`);
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
      const streakStart = addDays(today, -(streakLen - 1));
      const { error: insErr } = await supabase
        .from('streak_awards')
        .insert({ player_id: playerId, game_id: gameId, tier_days: streakLen, streak_start: streakStart });
      if (insErr) {
        if (insErr.code !== '23505') throw insErr;
        // Already awarded this tier. If it was for this same streak, an
        // earlier failed attempt at this close saved it - still announce.
        // If it was an older streak, it's been announced before - skip.
        const { data: prior, error: priorErr } = await supabase
          .from('streak_awards')
          .select('streak_start')
          .eq('player_id', playerId).eq('game_id', gameId).eq('tier_days', streakLen)
          .maybeSingle();
        if (priorErr) throw priorErr;
        if (!prior || prior.streak_start !== streakStart) continue;
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
    if (error && error.code !== '23505') throw error;
  }

  // One message, everything above stacked together. A failed send throws
  // too, so the close is retried rather than silently never posted.
  if (lines.length && DISCORD_CHANNEL_ID) {
    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    if (isLate) {
      const label = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
      lines.unshift(`*(running late - this is ${label}'s close)*`);
    }
    await channel.send(`${say.closeIntro({ mascot: mascotFor(today) })}\n${lines.join('\n')}`);
  }

  // Mark the day closed LAST, only once everything above has actually
  // finished - this is what the website checks before it'll show today's
  // scores at all (see index.html). If this throws, the day stays hidden
  // and the next catchUpCloses() pass re-does the whole run.
  const { error: closeLogErr } = await supabase
    .from('daily_close_log')
    .upsert({ play_date: today }, { onConflict: 'play_date' });
  if (closeLogErr) throw closeLogErr;
  console.log(`[close] ${today} marked closed.`);
}

// How many past days catchUpCloses() looks back for a missed close.
const CATCH_UP_DAYS = 3;
let closeInProgress = false;

// Runs at ROULETTE_HOUR, every 10 minutes after that, and on startup:
// closes any of the last CATCH_UP_DAYS days (plus today, once it's past
// ROULETTE_HOUR) that isn't in daily_close_log yet, oldest first. So a
// Supabase blip or the bot being down at 20:00 just delays the close
// until the next pass that works, instead of skipping the day.
async function catchUpCloses() {
  if (closeInProgress) return;
  closeInProgress = true;
  try {
    const now = new Date();
    const today = playDateFor(now);
    const due = [];
    for (let i = CATCH_UP_DAYS; i >= 1; i--) due.push(addDays(today, -i));
    if (hourIn(now) >= Number(ROULETTE_HOUR)) due.push(today);

    const { data, error } = await supabase.from('daily_close_log').select('play_date').in('play_date', due);
    if (error) throw error;
    const closed = new Set(data.map((r) => r.play_date));
    for (const day of due) {
      if (!closed.has(day)) await runDailyClose(day);
    }
  } catch (err) {
    console.error('[close] Failed to run daily close (will try again in 10 minutes):', err);
  } finally {
    closeInProgress = false;
  }
}

// ---------- bot ----------

// `node index.js --close-now [YYYY-MM-DD]` runs the daily close once for
// that date (default today) and exits - handy for testing. Missed days are
// normally caught up automatically by catchUpCloses().
const CLOSE_NOW = process.argv.includes('--close-now');
const CLOSE_NOW_DATE = process.argv.find((a) => /^d{4}-d{2}-d{2}$/.test(a));
// `node index.js --preview-now` runs the noon creature preview once and exits.
const PREVIEW_NOW = process.argv.includes('--preview-now');

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
    try {
      await runDailyClose(CLOSE_NOW_DATE);
    } catch (err) {
      console.error('[close] Failed to run daily close:', err);
      process.exit(1);
    }
    console.log('Done. Exiting.');
    process.exit(0);
  }

  if (PREVIEW_NOW) {
    console.log('Running noon creature preview once (--preview-now)...');
    await runMiddayPreview();
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
  cron.schedule(`0 ${PREVIEW_HOUR} * * *`, () => runMiddayPreview(), { timezone: TIMEZONE });
  // The close fires at ROULETTE_HOUR:00; the */10 pass retries it if that
  // failed and catches up any recent day that never closed.
  cron.schedule(`0 ${ROULETTE_HOUR} * * *`, catchUpCloses, { timezone: TIMEZONE });
  cron.schedule('*/10 * * * *', catchUpCloses, { timezone: TIMEZONE });
  console.log(`Creature preview scheduled for ${PREVIEW_HOUR}:00, daily close (standings/raffle/streaks post) scheduled for ${ROULETTE_HOUR}:00, ${TIMEZONE}.`);
  await catchUpCloses();
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
