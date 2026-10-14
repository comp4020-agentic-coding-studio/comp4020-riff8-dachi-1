#!/usr/bin/env node
// A database-consistent backup of every room, safe while the server runs
// (SQLite's VACUUM INTO reads one snapshot, WAL included), then a restore
// check: the copy is opened read-only and every room in it is loaded through
// the same migrations the server uses.
//
//   DATA_DIR=/data node scripts/backup.ts /data/backup-$(date +%F).db
import { DatabaseSync } from "node:sqlite";
import { backupTo, migrateState } from "../server/store.ts";
import { ledgerHolds } from "../shared/sim.ts";

const [dest] = process.argv.slice(2);
if (!dest) {
  console.error("usage: DATA_DIR=<dir> node scripts/backup.ts <file.db>");
  process.exit(1);
}
backupTo(dest);
const copy = new DatabaseSync(dest, { readOnly: true });
const rows = copy.prepare("SELECT code, schema, state FROM rooms").all() as { code: string; schema: number; state: string }[];
let bad = 0;
for (const r of rows) {
  const s = migrateState(r.schema, JSON.parse(r.state));
  if (!ledgerHolds(s)) {
    bad++;
    console.error(`room ${r.code}: ledger doesn't hold`);
  }
}
console.log(`backed up ${rows.length} rooms to ${dest}; ${rows.length - bad} restore cleanly`);
process.exit(bad ? 1 : 0);
