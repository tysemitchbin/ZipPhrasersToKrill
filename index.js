require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const {
  DISCORD_BOT_TOKEN,
  DISCORD_CHANNEL_ID,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TIMEZONE = 'Europe/Oslo',
} = process.env;

if (!DISCORD_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars. Check DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
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

// "Connections \nPuzzle #123\n<emoji row>\n<emoji row>..."
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

// Fallback: first line reads like "Krillion: 15" or "Krillion 15"
function parseGeneric(text) {
  const firstLine = text.trim().split('\n')[0];
  const m = firstLine.match(/^([A-Za-z0-9][A-Za-z0-9 '\-]{1,29}?)[:\s]+(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const name = m[1].trim();
  const rawScore = parseFloat(m[2]);
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

// ---------- bot ----------

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  if (DISCORD_CHANNEL_ID) {
    console.log(`Watching channel ${DISCORD_CHANNEL_ID} only.`);
  } else {
    console.log('Watching every channel the bot can see.');
  }
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
  } catch (err) {
    console.error('Failed to log score:', err);
    await message.react('⚠️').catch(() => {});
  }
});

client.login(DISCORD_BOT_TOKEN);
