// Durable room storage: one SQLite file on the Fly volume, one row per room
// holding the whole RoomState as JSON. A save is a single UPSERT, so a crash
// mid-save leaves the previous snapshot intact (WAL mode). World state,
// sequence number and command receipts live in the same row, so they can
// never disagree about what was applied.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { RoomState } from "../shared/protocol.ts";
import { SCHEMA_VERSION } from "../shared/protocol.ts";
import { MAX_FOOD, MAX_HP, STAGES } from "../shared/content.ts";
import { newTown, spawnFauna } from "../shared/sim.ts";

const dir = process.env.DATA_DIR ?? join(process.cwd(), "data");
mkdirSync(dir, { recursive: true });

export const db = new DatabaseSync(join(dir, "plenty.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");

// Migrations run in order against PRAGMA user_version.
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS rooms (
     code TEXT PRIMARY KEY,
     schema INTEGER NOT NULL,
     state TEXT NOT NULL,
     saved_at INTEGER NOT NULL
   )`,
  // how many players a room has ever had, so rooms nobody joined can be pruned
  `ALTER TABLE rooms ADD COLUMN players INTEGER NOT NULL DEFAULT 1`,
];
const current = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
for (let i = current; i < MIGRATIONS.length; i++) {
  db.exec(MIGRATIONS[i]);
  db.exec(`PRAGMA user_version = ${i + 1}`);
}

const upsert = db.prepare(
  "INSERT INTO rooms (code, schema, state, saved_at, players) VALUES (?, ?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET schema = excluded.schema, state = excluded.state, saved_at = excluded.saved_at, players = excluded.players",
);
const prune = db.prepare("DELETE FROM rooms WHERE players = 0 AND saved_at < ?");

/** Rooms created but never joined, older than a day, are deleted. Joined rooms are kept. */
export function pruneRooms(): void {
  prune.run(Date.now() - 86_400_000);
}
const select = db.prepare("SELECT schema, state FROM rooms WHERE code = ?");
const exists = db.prepare("SELECT 1 FROM rooms WHERE code = ?");

export function saveRoom(s: RoomState): void {
  upsert.run(s.code, SCHEMA_VERSION, JSON.stringify(s), Date.now(), Object.keys(s.players).length);
}

/**
 * Saved-state migrations, by the schema they upgrade from. Each takes the parsed
 * row and returns the next schema's shape; rows are only rewritten by the next
 * save, so a server that can't read a row never touches it.
 */
const STATE_MIGRATIONS: Record<number, (s: any) => any> = {
  // 1 -> 2: personal packs, chests, wildlife, bags, the town. The old shared
  // stockpile stays exactly where it was, as the Cooperative store: it moves
  // once, into one place, not into a copy for every player. Players start with
  // empty packs and full health; Earth gets its founding animals only if it
  // hasn't been touched yet, since a used-up Earth has nowhere for them to live.
  1: (s) => {
    s.v = 2;
    s.priv = {};
    s.chests = {};
    s.bags = [];
    s.nextItemId = 1;
    const fresh = STAGES[s.stage].id === "earth" && s.tiles.every((t: any) => t.amt === t.init);
    s.animals = fresh ? spawnFauna(s.seed, s.tiles, s.w) : [];
    s.fauna = { founded: s.animals.length, alive: s.animals.length, hunted: 0, starved: 0 };
    s.town = newTown();
    for (const p of Object.values<any>(s.players)) {
      Object.assign(p, { hp: MAX_HP, holding: null, holdingId: 0, tag: p.id.slice(0, 6), nextHit: 0, deaths: 0 });
      s.priv[p.id] = { items: {}, tools: [], food: MAX_FOOD };
    }
    // homes that existed hold their two residents from the start
    s.town.residents = s.buildings.filter((b: any) => b.type === "city" && b.work >= 50).length * 2;
    return s;
  },
};

export function migrateState(schema: number, state: any): RoomState {
  let v = schema;
  while (v < SCHEMA_VERSION) {
    const m = STATE_MIGRATIONS[v];
    if (!m) throw new Error(`no migration from schema ${v}`);
    state = m(state);
    v++;
  }
  return state as RoomState;
}

export function loadRoom(code: string): RoomState | null {
  const row = select.get(code) as { schema: number; state: string } | undefined;
  if (!row) return null;
  if (row.schema > SCHEMA_VERSION) throw new Error(`room ${code} is schema ${row.schema}, server expects ${SCHEMA_VERSION}`);
  return migrateState(row.schema, JSON.parse(row.state));
}

/** A database-consistent copy, safe while the server runs in WAL mode (VACUUM INTO checkpoints a snapshot). */
export function backupTo(path: string): void {
  db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
}

export const roomExists = (code: string): boolean => exists.get(code) !== undefined;
