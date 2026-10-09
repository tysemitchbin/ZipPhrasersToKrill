// One-off migration helper: copies every table from the old Zip project
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, schema public) into the `zip`
// schema of the Wanderlings project (WANDERLINGS_URL /
// WANDERLINGS_SERVICE_ROLE_KEY), then re-reads both and checks every row
// matches. Never writes to the source. Safe to re-run: rows are upserted by
// primary key, and target rows missing from the source are deleted.
// Usage: node copy-to-wanderlings.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { TABLES, dumpTable } = require('./backup');

// Parents before children, so foreign keys are satisfied on insert.
const INSERT_ORDER = Object.keys(TABLES);
const BATCH = 500;

const pick = (row, cols) => Object.fromEntries(cols.map(c => [c, row[c]]));

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WANDERLINGS_URL, WANDERLINGS_SERVICE_ROLE_KEY } = process.env;
  if (!WANDERLINGS_URL || !WANDERLINGS_SERVICE_ROLE_KEY) throw new Error('Set WANDERLINGS_URL and WANDERLINGS_SERVICE_ROLE_KEY in .env');
  if (WANDERLINGS_URL === SUPABASE_URL) throw new Error('Source and target are the same project');
  const auth = { persistSession: false };
  const src = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth });
  const dst = createClient(WANDERLINGS_URL, WANDERLINGS_SERVICE_ROLE_KEY, { auth, db: { schema: 'zip' } });

  const source = {};
  for (const table of INSERT_ORDER) source[table] = await dumpTable(src, table, TABLES[table]);

  // Delete stale target rows children-first, then upsert parents-first,
  // skipping rows that are already identical.
  const unchanged = {};
  for (const table of [...INSERT_ORDER].reverse()) {
    const pk = TABLES[table].split(',');
    const keep = new Set(source[table].map(r => JSON.stringify(pick(r, pk))));
    const existing = await dumpTable(dst, table, TABLES[table]);
    unchanged[table] = new Set(existing.map(r => JSON.stringify(r)));
    for (const row of existing) {
      if (keep.has(JSON.stringify(pick(row, pk)))) continue;
      const { error } = await dst.from(table).delete().match(pick(row, pk));
      if (error) throw new Error(`${table} delete: ${error.message}`);
    }
  }
  for (const table of INSERT_ORDER) {
    const rows = source[table].filter(r => !unchanged[table].has(JSON.stringify(r)));
    console.log(`${table}: writing ${rows.length} of ${source[table].length} rows`);
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await dst.from(table).upsert(rows.slice(i, i + BATCH), { onConflict: TABLES[table] });
      if (error) throw new Error(`${table} upsert: ${error.message}`);
    }
  }

  const { error: seqErr } = await dst.rpc('sync_identities');
  if (seqErr) throw new Error(`sync_identities: ${seqErr.message}`);

  // Verify: re-read both sides and compare row by row.
  let ok = true;
  for (const table of INSERT_ORDER) {
    const a = await dumpTable(src, table, TABLES[table]);
    const b = await dumpTable(dst, table, TABLES[table]);
    const same = a.length === b.length && a.every((row, i) => JSON.stringify(row) === JSON.stringify(b[i]));
    console.log(`${same ? 'OK  ' : 'DIFF'} ${table}: ${a.length} source / ${b.length} target`);
    ok = ok && same;
  }
  if (!ok) { console.error('Mismatch - do not switch over.'); process.exit(1); }
  console.log('All tables match.');
}

main().catch(err => { console.error(err); process.exit(1); });
