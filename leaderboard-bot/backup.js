// Dumps every table to ../backups/<timestamp>/<table>.json using the
// service-role key from .env. Read-only - never writes to the database.
// Usage: node backup.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const TABLES = {
  players: 'id',
  games: 'id',
  scores: 'id',
  bonus_points: 'id',
  milestones_hit: 'player_id,milestone',
  streak_awards: 'player_id,game_id,tier_days',
  daily_close_log: 'play_date',
  creatures_owned: 'id',
  daily_creature_pool: 'play_date',
};
const PAGE = 1000;

async function dumpTable(supabase, table, orderCols) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*');
    for (const col of orderCols.split(',')) q = q.order(col);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    db: { schema: process.env.SUPABASE_SCHEMA || 'public' },
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(__dirname, '..', 'backups', stamp);
  fs.mkdirSync(dir, { recursive: true });
  for (const [table, orderCols] of Object.entries(TABLES)) {
    const rows = await dumpTable(supabase, table, orderCols);
    fs.writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(rows, null, 2));
    console.log(`${table}: ${rows.length} rows`);
  }
  console.log(`Saved to ${dir}`);
}

if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });

module.exports = { TABLES, dumpTable };
