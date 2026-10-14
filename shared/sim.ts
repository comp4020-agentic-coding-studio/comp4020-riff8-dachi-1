// The authoritative room simulation. Pure functions over a JSON-serialisable
// RoomState, so it runs (and is tested) without a browser or a socket. The
// server owns the only live copy of each room and calls these in order: one
// command or one tick at a time, which is what serialises every mutation.
import {
  ANIMALS,
  BAG_PRIVATE_TICKS,
  BUILDINGS,
  BUILD_RANGE,
  DC_MODE,
  DC_MODES,
  EARTH_FAUNA,
  GROWTH_TICKS,
  HOTBAR,
  HUNGER_TICKS,
  HUNT_COOLDOWN_TICKS,
  ITEMS,
  ITEM_NAMES,
  MAX_FOOD,
  MAX_HP,
  PACK_SLOTS,
  PRIORITIES,
  RECIPES,
  RESIDENTS_PER_HOME,
  SPRINT,
  STACK,
  STATION_RANGE,
  THIRST_LIMIT,
  TOOLS,
  type AnimalKind,
  type ItemId,
  EMOTES,
  FAMILIES,
  HARVEST_COOLDOWN_TICKS,
  HARVEST_RANGE,
  HEAT_LIMIT,
  MARKS_PER_PLAYER,
  MAX_IDENTITIES,
  MAX_PLAYERS,
  PACES,
  PLAYER_SPEED,
  SALVAGE_RATE,
  STAGES,
  SUN_TO_RESERVE,
  TICK_MS,
  buildingName,
  type Bundle,
  type BuildingType,
  type Family,
  type Pace,
} from "./content.ts";
import type { Animal, Building, Command, Items, Ledger, Player, Private, RoomState, StageSummary, Tile, Town } from "./protocol.ts";
import { SCHEMA_VERSION } from "./protocol.ts";
import { generateStage, rng } from "./worldgen.ts";

/** What changed during one call: the server turns this into a delta. */
export interface Changes {
  tiles: Set<number>;
  buildings: Set<number>;
  removed: number[];
  meta: boolean;
  log: number;
  /** a stage boundary or the ending: save now, then broadcast a fresh snapshot */
  boundary: boolean;
  /** players whose private state changed: only they are sent it */
  priv: Set<string>;
  chests: Set<number>;
  animals: boolean;
  bags: boolean;
  town: boolean;
  /** who did what, for the server's log: never tokens */
  audit: string[];
  /** a player the host removed: the server closes their sockets */
  kicked?: string;
}

export const newChanges = (): Changes => ({
  tiles: new Set(),
  buildings: new Set(),
  removed: [],
  meta: false,
  log: 0,
  boundary: false,
  priv: new Set(),
  chests: new Set(),
  animals: false,
  bags: false,
  town: false,
  audit: [],
});

export type Result = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

const emptyLedger = (): Ledger =>
  Object.fromEntries(FAMILIES.map((f) => [f, { initial: 0, remaining: 0, extracted: 0, destroyed: 0 }])) as Ledger;

function ledgerFor(tiles: Tile[]): Ledger {
  const l = emptyLedger();
  for (const t of tiles) if (t.d) {
    l[t.d].initial += t.init;
    l[t.d].remaining += t.amt;
  }
  return l;
}

/**
 * The land holds only as much life as its world has left: every tile's life
 * is capped by how much of the world remains (60%) and how much of its water,
 * its coolant, remains (40%). So the whole land dries as it's consumed, in
 * whatever order, not just the tiles anyone touched, and draining the pond
 * costs more than its share. Derived from the ledger on both sides, so it
 * costs no traffic.
 */
export const lifeCap = (ledger: Ledger): number => {
  const frac = (rem: number, init: number): number => (init ? rem / init : 0);
  const total = FAMILIES.reduce((a, f) => a + ledger[f].remaining, 0);
  const initial = FAMILIES.reduce((a, f) => a + ledger[f].initial, 0);
  const left = 0.6 * frac(total, initial) + 0.4 * frac(ledger.coolant.remaining, ledger.coolant.initial);
  return Math.round(15 + 85 * left);
};

export const effectiveLife = (t: Tile, cap: number): number => Math.min(t.life, cap);

export const averageLife = (s: Pick<RoomState, "tiles" | "ledger">): number => {
  const cap = lifeCap(s.ledger);
  const land = s.tiles.filter((t) => t.t === 0 || t.t === 1 || t.t === 3);
  return Math.round(land.reduce((a, t) => a + effectiveLife(t, cap), 0) / Math.max(1, land.length));
};

export function createRoom(code: string, seed: number, pace: Pace): RoomState {
  const g = generateStage(seed, 0, pace);
  const s: RoomState = {
    v: SCHEMA_VERSION,
    code,
    seed,
    pace,
    hostId: null,
    tick: 0,
    seq: 0,
    gen: 1,
    stage: 0,
    stageStartTick: 0,
    lifeStart: 100,
    econTicks: 0,
    phase: { k: "play" },
    w: STAGES[0].size,
    tiles: g.tiles,
    buildings: g.buildings,
    nextBuildingId: g.buildings.length + 1,
    inventory: { ...STAGES[0].starter },
    ledger: ledgerFor(g.tiles),
    econ: { energySupply: 0, energyUsed: 0, computeSupply: 0, computeUsed: 0, workersSupply: 0, workersUsed: 0 },
    heat: 0,
    reserve: 0,
    history: [],
    archive: [],
    players: {},
    priv: {},
    chests: {},
    animals: spawnFauna(seed, g.tiles, STAGES[0].size),
    bags: [],
    fauna: { founded: 0, alive: 0, hunted: 0, starved: 0 },
    town: newTown(),
    nextItemId: 1,
    tokens: {},
    receipts: {},
    log: [],
  };
  s.fauna.founded = s.fauna.alive = s.animals.length;
  s.lifeStart = averageLife(s);
  return s;
}

export const newTown = (): Town => ({ priority: "balanced", residents: 0, sleeping: 0, dry: 0, served: 0, deaths: 0, arrivals: 0, water: [0, 0, 0, 0], events: [] });

/**
 * Earth's founding animals, placed once from the seed in their habitats. Nothing
 * respawns and nothing breeds: the fauna is a finite stock like the deposits,
 * accounted as founded = alive + hunted + starved.
 */
export function spawnFauna(seed: number, tiles: Tile[], w: number): Animal[] {
  const r = rng(seed * 97 + 5);
  const out: Animal[] = [];
  const habitats = {
    grove: tiles.flatMap((t, i) => (t.d === "matter" ? [i] : [])),
    meadow: tiles.flatMap((t, i) => (t.t === 0 && !t.d && !t.b ? [i] : [])),
    water: tiles.flatMap((t, i) => (t.t === 1 ? [i] : [])),
  };
  for (const kind of Object.keys(EARTH_FAUNA) as AnimalKind[]) {
    const def = ANIMALS[kind];
    const pool = habitats[def.habitat];
    for (let k = 0; k < EARTH_FAUNA[kind] && pool.length; k++) {
      const i = pool[Math.floor(r() * pool.length)];
      out.push({ id: out.length + 1, kind, x: round2((i % w) + (r() - 0.5) * 0.6), y: round2(Math.floor(i / w) + (r() - 0.5) * 0.6), hp: def.hp, dead: false, h: r() * Math.PI * 2 });
    }
  }
  const heron = out.find((a) => a.kind === "heron");
  if (heron) heron.name = "the Heron Pond heron";
  return out;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
const RESIDENT_NAMES = ["Mae", "Oskar", "Ines", "Tavi", "Ruth", "Ben", "Noor", "Kiri", "Aled", "Saoirse", "Joon", "Pita", "Lena", "Hamid", "Ada", "Wren"];

export const spawnPoint = (s: RoomState): { x: number; y: number } => {
  const st = STAGES[s.stage];
  const c = (st.size - 1) / 2;
  if (st.id === "sun") return { x: c, y: st.size - 4 };
  if (st.id === "system") return { x: c, y: c + 2 };
  return { x: c, y: c };
};

function log(s: RoomState, ch: Changes, text: string): void {
  s.log.push({ tick: s.tick, text });
  if (s.log.length > 40) s.log.splice(0, s.log.length - 40);
  ch.log++;
}

const cleanText = (raw: unknown, max: number): string | null => {
  if (typeof raw !== "string") return null;
  // printable characters only; collapse whitespace; hard length cap
  const t = raw.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  return t.length > 0 ? t : null;
};
export const cleanName = (raw: unknown): string => cleanText(raw, 16) ?? "Guest";

/** Add a player, or return the existing one. Returns null when the room is full. */
export function join(s: RoomState, id: string, token: string, name: string, ch: Changes): Player | null {
  const existing = s.players[id];
  if (existing?.banned) return null;
  if (existing) {
    existing.connected = true;
    if (!s.hostId || !s.players[s.hostId]?.connected) s.hostId = id;
    log(s, ch, `${existing.name} is back.`);
    ch.meta = true;
    return existing;
  }
  // capacity is seats at the table, not every browser that ever visited
  if (Object.values(s.players).filter((q) => q.connected).length >= MAX_PLAYERS) return null;
  if (Object.keys(s.players).length >= MAX_IDENTITIES) {
    // forget the longest-gone identity; its buildings stay, credited to "someone"
    const gone = Object.values(s.players)
      .filter((q) => !q.connected)
      .sort((a, b) => a.joinedTick - b.joinedTick)[0];
    delete s.players[gone.id];
    // their things aren't discarded: they wait in a bag where they last stood
    const pv = s.priv[gone.id];
    if (pv && (Object.keys(pv.items).length || pv.tools.length)) {
      s.bags.push({ id: s.nextItemId++, x: round2(gone.x), y: round2(gone.y), owner: gone.id, ownerName: gone.name, openAt: s.tick, items: pv.items, tools: pv.tools });
      ch.bags = true;
    }
    delete s.priv[gone.id];
    delete s.tokens[gone.id];
    delete s.receipts[gone.id];
  }
  const used = new Set(Object.values(s.players).map((p) => p.colour));
  let colour = 0;
  while (used.has(colour)) colour++;
  const sp = spawnPoint(s);
  const n = Object.keys(s.players).length;
  // two browsers called "Ada" stay tellable apart
  const taken = new Set(Object.values(s.players).map((q) => q.name));
  let unique = cleanName(name);
  for (let k = 2; taken.has(unique); k++) unique = `${cleanName(name).slice(0, 13)} ${k}`;
  const p: Player = {
    id,
    name: unique,
    colour,
    x: sp.x + (n % 3) - 1,
    y: sp.y + Math.floor(n / 3) * 0.8,
    dx: 0,
    dy: 0,
    facing: 2,
    act: null,
    connected: true,
    joinedTick: s.tick,
    nextHarvest: 0,
    nextEmote: 0,
    marks: 0,
    stats: { harvested: 0, built: 0, helped: 0 },
    hp: MAX_HP,
    holding: null,
    holdingId: 0,
    tag: id.slice(0, 6),
    nextHit: 0,
    deaths: 0,
  };
  s.players[id] = p;
  s.priv[id] = { items: {}, tools: [], food: MAX_FOOD };
  s.tokens[id] = token;
  s.receipts[id] = [];
  if (!s.hostId || !s.players[s.hostId]?.connected) s.hostId = id;
  log(s, ch, `${p.name} arrived.`);
  ch.meta = true;
  return p;
}

/** A player's connection dropped. Their buildings and stats stay; the host role moves on. */
export function leave(s: RoomState, id: string, ch: Changes): void {
  const p = s.players[id];
  if (!p) return;
  p.connected = false;
  p.dx = p.dy = 0;
  if (s.hostId === id) {
    const next = Object.values(s.players)
      .filter((q) => q.connected)
      .sort((a, b) => a.joinedTick - b.joinedTick)[0];
    s.hostId = next ? next.id : id;
  }
  log(s, ch, `${p.name} stepped away.`);
  ch.meta = true;
}

export const footprint = (b: Pick<Building, "x" | "y" | "type">): [number, number][] => {
  const n = BUILDINGS[b.type].size;
  const out: [number, number][] = [];
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) out.push([b.x + dx, b.y + dy]);
  return out;
};

const centre = (b: Pick<Building, "x" | "y" | "type">): [number, number] => {
  const h = (BUILDINGS[b.type].size - 1) / 2;
  return [b.x + h, b.y + h];
};

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
const inBounds = (s: Pick<RoomState, "w">, x: number, y: number): boolean => x >= 0 && y >= 0 && x < s.w && y < s.w;
const tileAt = (s: Pick<RoomState, "w" | "tiles">, x: number, y: number): Tile | undefined => (inBounds(s, x, y) ? s.tiles[y * s.w + x] : undefined);
const near = (p: Player, x: number, y: number, range: number): boolean => Math.hypot(p.x - x, p.y - y) <= range;
const complete = (b: Building): boolean => b.work >= BUILDINGS[b.type].build * 10;

export const isHost = (s: RoomState, id: string): boolean => s.hostId === id;

/** Why a building can't go here, or null if it can. Shared by server and the ghost preview. */
export function placementProblem(s: Pick<RoomState, "stage" | "tiles" | "w" | "inventory" | "players">, type: BuildingType, x: number, y: number, p?: Player, pack?: Items): string | null {
  const st = STAGES[s.stage];
  if (!st.buildings.includes(type)) return `nothing like that can be built on ${st.name}`;
  const def = BUILDINGS[type];
  for (const [fx, fy] of footprint({ type, x, y })) {
    const t = tileAt(s, fx, fy);
    if (!t) return "off the edge of the map";
    if (t.b) return "something is already built here";
    if (t.d && t.amt > 0) return `there's ${st.families[t.d].label} here: harvest it first`;
    if (t.t === 1) return "can't build on water";
    if (t.t === 3) return "can't build on the star itself";
    if (t.t === 2 && type !== "relay") return "nothing to build on: only relays float in open space";
  }
  if (p && !near(p, x + (def.size - 1) / 2, y + (def.size - 1) / 2, BUILD_RANGE)) return "too far away: walk closer";
  const feet = footprint({ type, x, y });
  for (const q of Object.values(s.players))
    if (q.connected && feet.some(([fx, fy]) => Math.round(q.x) === fx && Math.round(q.y) === fy)) return q.id === p?.id ? "you're standing there: step aside" : `${q.name} is standing there`;
  if (type !== "plaza" && "buildings" in s) {
    const trapped = wouldTrap(s as Pick<RoomState, "tiles" | "w" | "buildings" | "players">, feet);
    if (trapped) return trapped;
  }
  for (const f of FAMILIES) {
    const need = def.cost[f] ?? 0;
    const have = (pack?.[f] ?? 0) + (def.personal ? 0 : s.inventory[f]);
    if (have < need) return `needs ${need} ${st.families[f].label} (have ${have}${def.personal ? " in your pack" : ""})`;
  }
  return null;
}

/**
 * Would solid ground at `feet` cut anyone off? Every connected player and every
 * deposit with stock left must still reach open ground connected to the rest
 * of the map: a flood fill from the first free tile found, over walkable tiles
 * (deposits count as reachable from any side). Cheap at these map sizes.
 */
function wouldTrap(s: Pick<RoomState, "tiles" | "w" | "buildings" | "players">, feet: [number, number][]): string | null {
  const w = s.w;
  const blocked = new Uint8Array(w * w);
  for (let i = 0; i < w * w; i++) {
    const t = s.tiles[i];
    if (t.t === 2 || t.t === 3) blocked[i] = 1; // void and the star: nobody walks there anyway
    else if (t.b) {
      const b = s.buildings.find((q) => q.id === t.b);
      if (b && b.type !== "plaza") blocked[i] = 1;
    }
  }
  for (const [fx, fy] of feet) blocked[fy * w + fx] = 1;
  // the largest open region is "outside"
  const region = new Int32Array(w * w).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < w * w; i++) {
    if (blocked[i] || region[i] >= 0) continue;
    const id = sizes.length;
    let n = 0;
    const stack = [i];
    region[i] = id;
    while (stack.length) {
      const k = stack.pop()!;
      n++;
      const x = k % w;
      const y = (k - x) / w;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= w) continue;
        const j = ny * w + nx;
        if (!blocked[j] && region[j] < 0) {
          region[j] = id;
          stack.push(j);
        }
      }
    }
    sizes.push(n);
  }
  if (!sizes.length) return null;
  const main = sizes.indexOf(Math.max(...sizes));
  const reaches = (x: number, y: number): boolean => {
    for (const [nx, ny] of [[x, y], [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= w) continue;
      if (region[ny * w + nx] === main) return true;
    }
    return false;
  };
  for (const q of Object.values(s.players)) if (q.connected && !reaches(Math.round(q.x), Math.round(q.y))) return `that would wall ${q.name} in`;
  for (let i = 0; i < w * w; i++) {
    const t = s.tiles[i];
    // only reachable deposits on walkable ground count: void-floating ones were never walkable
    if (t.d && t.amt > 0 && (t.t === 0 || t.t === 1) && !reaches(i % w, Math.floor(i / w))) return "that would cut off a deposit nobody could reach";
  }
  return null;
}

// --- packs: whole numbers, bounded slots ------------------------------------

const PACK_CAP = PACK_SLOTS + HOTBAR;
const slotsOf = (items: Items): number => Object.values(items).reduce((a, n) => a + Math.ceil((n ?? 0) / STACK), 0);
export const packSlots = (pv: Private): number => slotsOf(pv.items) + pv.tools.length;
/** how many more of an item fit in a container of `cap` slots */
export function room(items: Items, item: ItemId, cap: number, extraSlots = 0): number {
  const n = items[item] ?? 0;
  const others = slotsOf(items) - Math.ceil(n / STACK) + extraSlots;
  return Math.max(0, (cap - others) * STACK - n);
}
export const packRoom = (pv: Private, item: ItemId): number => room(pv.items, item, PACK_CAP, pv.tools.length);
const add = (items: Items, item: ItemId, n: number): void => {
  items[item] = (items[item] ?? 0) + n;
};
const sub = (items: Items, item: ItemId, n: number): void => {
  const left = (items[item] ?? 0) - n;
  if (left > 0) items[item] = left;
  else delete items[item];
};
const isItem = (v: unknown): v is ItemId => typeof v === "string" && (ITEMS as readonly string[]).includes(v);
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= 100_000;
export const itemName = (st: (typeof STAGES)[number], item: ItemId): string => ((FAMILIES as readonly string[]).includes(item) ? st.families[item as Family].label : ITEM_NAMES[item as Exclude<ItemId, Family>]);
const heldTool = (s: RoomState, p: Player) => (p.holdingId ? s.priv[p.id]?.tools.find((t) => t.id === p.holdingId) : undefined);
const wearing = (s: RoomState, pid: string): boolean => !!s.priv[pid]?.tools.some((t) => t.kind === "coat");

/** Use up one point of a tool's life; a worn-out tool is gone, and everyone hears about it. */
function wear(s: RoomState, p: Player, ch: Changes, kind?: string): void {
  const pv = s.priv[p.id];
  const t = kind ? pv.tools.find((x) => x.kind === kind) : heldTool(s, p);
  if (!t) return;
  t.dur--;
  ch.priv.add(p.id);
  if (t.dur > 0) return;
  pv.tools = pv.tools.filter((x) => x.id !== t.id);
  if (p.holdingId === t.id) {
    p.holdingId = 0;
    p.holding = null;
  }
  log(s, ch, `${p.name}'s ${TOOLS[t.kind].name} wore out.`);
}

const stationNear = (s: RoomState, p: Player, type: BuildingType): boolean =>
  s.buildings.some((b) => b.type === type && complete(b) && (type !== "datacentre" || b.status === "ok") && near(p, ...centre(b), STATION_RANGE + (BUILDINGS[type].size - 1) / 2));

/** Give items to a player if they fit; whatever doesn't waits in a bag at (x, y) that only they can open for a while. */
function giveOrBag(s: RoomState, owner: string, items: Items, x: number, y: number, ch: Changes): void {
  const pv = s.priv[owner];
  const left: Items = {};
  for (const [k, n] of Object.entries(items) as [ItemId, number][]) {
    const fit = pv ? Math.min(n, packRoom(pv, k)) : 0;
    if (fit) add(pv.items, k, fit);
    if (n - fit) left[k] = n - fit;
  }
  if (pv) ch.priv.add(owner);
  if (Object.keys(left).length) {
    s.bags.push({ id: s.nextItemId++, x: round2(x), y: round2(y), owner, ownerName: s.players[owner]?.name ?? "someone", openAt: s.tick + BAG_PRIVATE_TICKS, items: left, tools: [] });
    ch.bags = true;
  }
}

function remember(s: RoomState, tile: Tile, fate: string, ch: Changes): void {
  if (!tile.mark) return;
  s.archive.push({ stage: STAGES[s.stage].id, name: tile.mark.name, fate });
  log(s, ch, `${tile.mark.name} ${fate}.`);
  delete tile.mark;
  ch.meta = true;
}

function takeFrom(s: RoomState, idx: number, amount: number, ch: Changes, into: Items = s.inventory): number {
  const tile = s.tiles[idx];
  if (!tile.d || tile.amt <= 0) return 0;
  const took = Math.min(amount, tile.amt);
  tile.amt -= took;
  s.ledger[tile.d].remaining -= took;
  s.ledger[tile.d].extracted += took;
  into[tile.d] = (into[tile.d] ?? 0) + took;
  tile.life = Math.min(tile.life, Math.round((tile.amt / tile.init) * 60));
  ch.tiles.add(idx);
  ch.meta = true;
  if (tile.amt === 0) {
    remember(s, tile, "was harvested bare", ch);
    // a grove or pond gone leaves the ground around it poorer
    const x = idx % s.w;
    const y = Math.floor(idx / s.w);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = tileAt(s, x + dx, y + dy);
        if (!n || n.t === 2 || (dx === 0 && dy === 0)) continue;
        n.life = Math.max(0, n.life - 15);
        ch.tiles.add((y + dy) * s.w + x + dx);
      }
  }
  return took;
}

function receipt(s: RoomState, pid: string, cmdId: string): void {
  const r = (s.receipts[pid] ??= []);
  r.push(cmdId);
  if (r.length > 64) r.splice(0, r.length - 64);
}

export function applyCommand(s: RoomState, pid: string, cmdId: string, gen: number, c: Command, ch: Changes): Result {
  const p = Object.hasOwn(s.players, pid) ? s.players[pid] : undefined;
  if (!p) return no("not in this room");
  if (p.banned) return no("the host removed you from this room");
  if (typeof cmdId !== "string" || cmdId.length < 1 || cmdId.length > 40) return no("bad command id");
  if (gen !== s.gen) return no("that was meant for a world that's gone");
  if (!c || typeof c !== "object") return no("malformed command");

  if (c.k === "move") {
    // continuous intent, idempotent by nature: not receipted
    if (typeof c.dx !== "number" || typeof c.dy !== "number" || !Number.isFinite(c.dx) || !Number.isFinite(c.dy)) return no("malformed move");
    const len = Math.hypot(c.dx, c.dy);
    p.dx = len > 1 ? c.dx / len : c.dx;
    p.dy = len > 1 ? c.dy / len : c.dy;
    p.sprint = c.sprint === true;
    return OK;
  }

  if (s.phase.k !== "play") return no(s.phase.k === "ended" ? "there is nothing left" : "the world is changing: wait a moment");
  // a retry of a command that was applied is acknowledged again, not applied again;
  // only applied commands are receipted, so a refused one can be retried for real
  if (s.receipts[pid]?.includes(cmdId)) return OK;
  const res = mutate(s, p, c, ch);
  if (res.ok) receipt(s, pid, cmdId);
  return res;
}

function mutate(s: RoomState, p: Player, c: Exclude<Command, { k: "move" }>, ch: Changes): Result {
  const pid = p.id;
  const st = STAGES[s.stage];

  switch (c.k) {
    case "harvest": {
      if (!isInt(c.x) || !isInt(c.y) || !inBounds(s, c.x, c.y)) return no("off the map");
      if (s.tick < p.nextHarvest) return no("too fast");
      if (!near(p, c.x, c.y, HARVEST_RANGE)) return no("too far away");
      const idx = c.y * s.w + c.x;
      const tile = s.tiles[idx];
      if (tile.b) {
        const b = s.buildings.find((q) => q.id === tile.b)!;
        if (complete(b)) return no(`the ${buildingName(st, b.type)} is already built`);
        b.work = Math.min(BUILDINGS[b.type].build * 10, b.work + 5);
        ch.buildings.add(b.id);
        p.stats.helped++;
        p.nextHarvest = s.tick + HARVEST_COOLDOWN_TICKS;
        p.act = { k: "build", until: s.tick + 4 };
        return OK;
      }
      if (!tile.d || tile.amt <= 0) return no("nothing to harvest there");
      const pv = s.priv[pid];
      const tool = heldTool(s, p);
      const mult = (tool && TOOLS[tool.kind].yields?.[tile.d]) ?? 1;
      const want = Math.min(PACES[s.pace].harvestYield * mult, packRoom(pv, tile.d));
      if (want <= 0) return no("your pack is full: stash, donate or drop something");
      const took = takeFrom(s, idx, want, ch, pv.items);
      ch.priv.add(pid);
      if (tool && TOOLS[tool.kind].yields?.[tile.d]) wear(s, p, ch);
      withdraw(s, p, ch);
      p.stats.harvested += took;
      p.nextHarvest = s.tick + HARVEST_COOLDOWN_TICKS;
      p.act = { k: "harvest", until: s.tick + 4 };
      p.facing = facingTo(c.x - p.x, c.y - p.y, p.facing);
      checkExhausted(s, ch);
      return OK;
    }
    case "build": {
      if (!isInt(c.x) || !isInt(c.y) || typeof c.type !== "string" || !(c.type in BUILDINGS)) return no("malformed build");
      const problem = placementProblem(s, c.type, c.x, c.y, p, s.priv[pid].items);
      if (problem) return no(problem);
      const def = BUILDINGS[c.type];
      const pack = s.priv[pid].items;
      // payment and occupancy commit together: nothing between them can fail.
      // The builder's own pack pays first; for shared works the Cooperative store
      // covers the rest. A personal piece never touches the store.
      const paid: string[] = [];
      const fromStore: Partial<Bundle> = {};
      for (const f of FAMILIES) {
        const need = def.cost[f] ?? 0;
        const mine = Math.min(need, pack[f] ?? 0);
        sub(pack, f, mine);
        s.inventory[f] -= need - mine;
        if (need - mine) fromStore[f] = need - mine;
        if (need) paid.push(`${need} ${f}${need - mine ? ` (${need - mine} from the store)` : ""}`);
      }
      ch.priv.add(pid);
      const b: Building = { id: s.nextBuildingId++, type: c.type, x: c.x, y: c.y, owner: pid, work: 0, status: "under construction", paid: fromStore };
      if (c.type === "datacentre") b.mode = "normal";
      if (c.type === "chest") {
        s.chests[b.id] = { owner: pid, access: "owner", items: {} };
        ch.chests.add(b.id);
      }
      ch.audit.push(`build ${c.type} #${b.id} at ${c.x},${c.y} paid ${paid.join(", ") || "nothing"}`);
      s.buildings.push(b);
      for (const [fx, fy] of footprint(b)) {
        const idx = fy * s.w + fx;
        const tile = s.tiles[idx];
        tile.b = b.id;
        if (c.type !== "plaza") tile.life = Math.min(tile.life, 15);
        ch.tiles.add(idx);
        remember(s, tile, `became a ${buildingName(st, c.type)}`, ch);
      }
      ch.buildings.add(b.id);
      ch.meta = true;
      withdraw(s, p, ch);
      p.stats.built++;
      p.act = { k: "build", until: s.tick + 6 };
      log(s, ch, `${p.name} started a ${buildingName(st, c.type)}.`);
      return OK;
    }
    case "demolish": {
      if (!isInt(c.x) || !isInt(c.y)) return no("malformed demolish");
      const tile = tileAt(s, c.x, c.y);
      if (!tile?.b) return no("nothing built there");
      const b = s.buildings.find((q) => q.id === tile.b)!;
      const def = BUILDINGS[b.type];
      if (def.protected) return no("the Depot is shared: nobody can take it down");
      if (def.renderValue) {
        if (!isHost(s, pid)) return no("only the host can render down a world");
        s.reserve += def.renderValue;
        s.archive.push({ stage: st.id, name: b.name ?? "A world", fate: `was rendered down for ${def.renderValue} energy` });
        log(s, ch, `${p.name} rendered down ${b.name}.`);
      } else {
        if (b.owner !== pid && !isHost(s, pid)) return no("only its builder or the host can take this down");
        if (!near(p, ...centre(b), BUILD_RANGE)) return no("too far away: walk closer");
        // lossy salvage: always strictly less than the cost, so no refund loop.
        // Each part goes back where it came from: what the store paid returns to
        // the store, what the builder's pack paid returns to the builder (bagged
        // for them if their pack is full), whoever takes it down.
        const back: Items = {};
        for (const f of FAMILIES) {
          const fromStore = b.paid?.[f] ?? (def.personal ? 0 : (def.cost[f] ?? 0));
          s.inventory[f] += Math.floor(fromStore * SALVAGE_RATE);
          const n = Math.floor(((def.cost[f] ?? 0) - fromStore) * SALVAGE_RATE);
          if (n) back[f] = n;
        }
        if (Object.keys(back).length && b.owner) giveOrBag(s, b.owner, back, b.x, b.y, ch);
        // a chest's contents are never destroyed: they're bagged for its owner
        const chest = s.chests[b.id];
        if (chest) {
          if (Object.keys(chest.items).length) {
            // the owner's alone, for good: taking down someone's chest never opens it to anyone else
            s.bags.push({ id: s.nextItemId++, x: b.x, y: b.y, owner: chest.owner, ownerName: s.players[chest.owner]?.name ?? "someone", openAt: Number.MAX_SAFE_INTEGER, items: chest.items, tools: [] });
            ch.bags = true;
          }
          delete s.chests[b.id];
          ch.chests.add(b.id);
        }
        log(s, ch, `${p.name} took down a ${buildingName(st, b.type)}.`);
        ch.audit.push(`demolish ${b.type} #${b.id} owned by ${b.owner ? (s.players[b.owner]?.tag ?? "gone") : "coop"}`);
      }
      for (const [fx, fy] of footprint(b)) {
        const idx = fy * s.w + fx;
        s.tiles[idx].b = 0;
        ch.tiles.add(idx);
      }
      s.buildings = s.buildings.filter((q) => q.id !== b.id);
      ch.removed.push(b.id);
      ch.meta = true;
      return OK;
    }
    case "emote": {
      if (!(EMOTES as readonly string[]).includes(c.e)) return no("unknown emote");
      if (s.tick < p.nextEmote) return no("too fast");
      p.act = { k: "emote", e: c.e, until: s.tick + 25 };
      p.nextEmote = s.tick + 8;
      return OK;
    }
    case "mark": {
      if (!isInt(c.x) || !isInt(c.y)) return no("malformed mark");
      const tile = tileAt(s, c.x, c.y);
      const name = cleanText(c.name, 24);
      if (!tile) return no("off the map");
      if (!name) return no("give the place a name");
      if (tile.b) return no("pick somewhere nothing is built");
      if (tile.mark) return no(`that's already ${tile.mark.name}`);
      if (p.marks >= MARKS_PER_PLAYER) return no(`you can name ${MARKS_PER_PLAYER} places per world`);
      if (!near(p, c.x, c.y, BUILD_RANGE)) return no("too far away");
      tile.mark = { name, by: p.name };
      p.marks++;
      ch.tiles.add(c.y * s.w + c.x);
      log(s, ch, `${p.name} named a place ${name}.`);
      return OK;
    }
    case "stop": {
      if (STAGES[s.stage].id !== "universe") return no("there's always another world, until the last one");
      if (typeof c.on !== "boolean") return no("malformed vote");
      // a dropped connection never ends the campaign: if a holdout leaves, someone
      // still here confirms by voting again
      if (p.stop !== c.on) {
        p.stop = c.on;
        log(s, ch, c.on ? `${p.name} wants to stop here and leave the rest alone.` : `${p.name} wants to keep going.`);
        ch.meta = true;
      }
      checkRestraint(s, ch);
      return OK;
    }
    case "craft": {
      const r = RECIPES.find((q) => q.id === c.recipe);
      if (!r) return no("no such recipe");
      const pv = s.priv[pid];
      if (r.station && !stationNear(s, p, r.station)) {
        const where = r.station === "datacentre" ? "a running datacentre" : `a ${buildingName(st, r.station)}`;
        return no(`needs ${where} within ${STATION_RANGE} tiles`);
      }
      for (const [k, n] of Object.entries(r.in) as [ItemId, number][])
        if ((pv.items[k] ?? 0) < n) return no(`needs ${n} ${itemName(st, k)} in your pack (have ${pv.items[k] ?? 0})`);
      if ("tool" in r.out) {
        if (packSlots(pv) >= PACK_CAP) return no("your pack is full");
      } else {
        // the inputs free their slots first, so check room after taking them
        const after = { ...pv.items };
        for (const [k, n] of Object.entries(r.in) as [ItemId, number][]) sub(after, k, n);
        if (room(after, r.out.item, PACK_CAP, pv.tools.length) < r.out.n) return no("your pack is full");
      }
      for (const [k, n] of Object.entries(r.in) as [ItemId, number][]) sub(pv.items, k, n);
      if ("tool" in r.out) {
        const t = { id: s.nextItemId++, kind: r.out.tool, dur: TOOLS[r.out.tool].dur };
        pv.tools.push(t);
        if (!p.holdingId && !TOOLS[t.kind].armour) {
          p.holdingId = t.id;
          p.holding = t.kind;
        }
      } else add(pv.items, r.out.item, r.out.n);
      ch.priv.add(pid);
      ch.audit.push(`craft ${r.id}`);
      if ("tool" in r.out) log(s, ch, `${p.name} made a ${TOOLS[r.out.tool].name}.`);
      return OK;
    }
    case "hold": {
      if (c.tool === 0) {
        p.holdingId = 0;
        p.holding = null;
        return OK;
      }
      const t = s.priv[pid].tools.find((q) => q.id === c.tool);
      if (!t) return no("you don't have that");
      if (TOOLS[t.kind].armour) return no("that's worn, not held");
      p.holdingId = t.id;
      p.holding = t.kind;
      return OK;
    }
    case "eat": {
      const pv = s.priv[pid];
      const fill: Partial<Record<ItemId, number>> = { meal: 50, ration: 34, meat: 15 };
      if (!isItem(c.item) || !fill[c.item]) return no("you can't eat that");
      if (!pv.items[c.item]) return no("you don't have any");
      if (pv.food >= MAX_FOOD) return no("you're not hungry");
      sub(pv.items, c.item, 1);
      pv.food = Math.min(MAX_FOOD, pv.food + fill[c.item]!);
      if (c.item === "meat") p.hp = Math.max(1, p.hp - 5);
      ch.priv.add(pid);
      return OK;
    }
    case "donate": {
      // an explicit gift from your pack to the Cooperative store, which builds the shared works
      if (!isItem(c.item) || !(FAMILIES as readonly string[]).includes(c.item) || !isCount(c.n)) return no("malformed gift");
      const pv = s.priv[pid];
      const n = Math.min(c.n, pv.items[c.item] ?? 0);
      if (n <= 0) return no("you don't have any");
      sub(pv.items, c.item, n);
      s.inventory[c.item as Family] += n;
      ch.priv.add(pid);
      ch.meta = true;
      ch.audit.push(`donate ${n} ${c.item}`);
      log(s, ch, `${p.name} gave ${n} ${itemName(st, c.item)} to the Cooperative.`);
      return OK;
    }
    case "stash":
    case "take": {
      if (!isItem(c.item) || !isCount(c.n) || !isInt(c.chest) || !Object.hasOwn(s.chests, c.chest)) return no("malformed transfer");
      const chest = s.chests[c.chest];
      const b = s.buildings.find((q) => q.id === c.chest);
      if (!chest || !b) return no("that chest is gone");
      if (chest.owner !== pid && chest.access !== "public") return no("that chest is locked to its owner");
      if (!near(p, ...centre(b), HARVEST_RANGE + 0.5)) return no("too far away: walk up to it");
      const pv = s.priv[pid];
      const [from, to, cap] = c.k === "stash" ? [pv.items, chest.items, 0] : [chest.items, pv.items, 1];
      const fit = cap ? packRoom(pv, c.item) : room(chest.items, c.item, 27);
      const n = Math.min(c.n, from[c.item] ?? 0, fit);
      if (n <= 0) return no((from[c.item] ?? 0) <= 0 ? "there's none to move" : "no room");
      // both sides in one synchronous step: nothing can interleave between them
      sub(from, c.item, n);
      add(to, c.item, n);
      ch.priv.add(pid);
      ch.chests.add(c.chest);
      ch.audit.push(`${c.k} ${n} ${c.item} chest #${c.chest} owned by ${s.players[chest.owner]?.tag ?? "gone"}`);
      return OK;
    }
    case "access": {
      if (!isInt(c.chest) || !Object.hasOwn(s.chests, c.chest)) return no("that chest is gone");
      const chest = s.chests[c.chest];
      if (!chest) return no("that chest is gone");
      if (chest.owner !== pid) return no("only its owner can change who opens it");
      if (c.access !== "owner" && c.access !== "public") return no("malformed access");
      chest.access = c.access;
      ch.chests.add(c.chest);
      ch.audit.push(`chest #${c.chest} access ${c.access}`);
      log(s, ch, c.access === "public" ? `${p.name} opened their chest to everyone.` : `${p.name} locked their chest.`);
      return OK;
    }
    case "hit": {
      const a = s.animals.find((q) => q.id === c.animal);
      if (!a || a.dead) return no("nothing to hit there");
      if (s.tick < p.nextHit) return no("too fast");
      const tool = heldTool(s, p);
      const def = tool ? TOOLS[tool.kind] : undefined;
      const dmg = def?.dmg ?? 5;
      const range = def?.range ?? 1.4;
      if (!near(p, a.x, a.y, range)) return no(def?.ammo ? "out of bow range" : "too far away: get closer");
      if (def?.ammo) {
        const pv = s.priv[pid];
        if (!pv.items[def.ammo]) return no("no arrows");
        sub(pv.items, def.ammo, 1);
        ch.priv.add(pid);
      }
      if (tool) wear(s, p, ch);
      p.nextHit = s.tick + HUNT_COOLDOWN_TICKS;
      p.act = { k: "harvest", until: s.tick + 4 };
      p.facing = facingTo(a.x - p.x, a.y - p.y, p.facing);
      a.hp = Math.max(0, a.hp - dmg);
      ch.animals = true;
      if (a.hp === 0) {
        a.dead = true;
        s.fauna.alive--;
        s.fauna.hunted++;
        ch.meta = true;
        log(s, ch, `${p.name} killed ${a.name ?? `a ${ANIMALS[a.kind].name}`}.`);
        ch.audit.push(`killed ${a.kind} #${a.id}`);
        if (a.name) s.archive.push({ stage: st.id, name: a.name, fate: `was killed by ${p.name}` });
      } else if (ANIMALS[a.kind].flees) a.h = Math.atan2(a.y - p.y, a.x - p.x);
      return OK;
    }
    case "butcher": {
      const i = s.animals.findIndex((q) => q.id === c.animal);
      const a = s.animals[i];
      if (!a || !a.dead) return no("nothing to butcher there");
      if (!near(p, a.x, a.y, HARVEST_RANGE)) return no("too far away");
      // the carcass is removed in the same step that pays out: it can't be butchered twice
      s.animals.splice(i, 1);
      ch.animals = true;
      giveOrBag(s, pid, { ...ANIMALS[a.kind].yields } as Items, a.x, a.y, ch);
      ch.audit.push(`butchered ${a.kind} #${a.id}`);
      return OK;
    }
    case "loot": {
      const i = s.bags.findIndex((q) => q.id === c.bag);
      const bag = s.bags[i];
      if (!bag) return no("that bag is gone");
      if (!near(p, bag.x, bag.y, HARVEST_RANGE)) return no("too far away");
      if (bag.owner !== pid && s.tick < bag.openAt) return no(`that's ${bag.ownerName}'s: only they can open it for now`);
      const pv = s.priv[pid];
      for (const k of Object.keys(bag.items) as ItemId[]) {
        const n = Math.min(bag.items[k] ?? 0, packRoom(pv, k));
        if (n) {
          sub(bag.items, k, n);
          add(pv.items, k, n);
        }
      }
      while (bag.tools.length && packSlots(pv) < PACK_CAP) pv.tools.push(bag.tools.shift()!);
      if (!Object.keys(bag.items).length && !bag.tools.length) s.bags.splice(i, 1);
      ch.priv.add(pid);
      ch.bags = true;
      ch.audit.push(`loot bag #${bag.id} of ${s.players[bag.owner]?.tag ?? "gone"}`);
      return OK;
    }
    case "drop": {
      if (!isItem(c.item) || !isCount(c.n)) return no("malformed drop");
      const pv = s.priv[pid];
      const n = Math.min(c.n, pv.items[c.item] ?? 0);
      if (n <= 0) return no("you don't have any");
      // a dropped bundle is open to anyone straight away: that's how you hand
      // something over. Drops near your last open one join it, and you can only
      // have a few lying about, so the ground (and every delta) stays small
      const mine = s.bags.filter((b) => b.owner === pid && b.openAt <= s.tick);
      const here = mine.find((b) => Math.hypot(b.x - p.x, b.y - p.y) < 1.5);
      if (!here && mine.length >= 3) return no("you've three bundles lying about already: pick one up first");
      sub(pv.items, c.item, n);
      if (here) add(here.items, c.item, n);
      else s.bags.push({ id: s.nextItemId++, x: round2(p.x), y: round2(p.y), owner: pid, ownerName: p.name, openAt: s.tick, items: { [c.item]: n }, tools: [] });
      ch.priv.add(pid);
      ch.bags = true;
      ch.audit.push(`drop ${n} ${c.item}`);
      return OK;
    }
    case "mode": {
      if (!isInt(c.x) || !isInt(c.y) || !(DC_MODES as readonly string[]).includes(c.mode)) return no("malformed mode");
      const b = s.buildings.find((q) => q.id === tileAt(s, c.x, c.y)?.b);
      if (!b || b.type !== "datacentre") return no("that isn't a datacentre");
      if (b.owner !== pid && !isHost(s, pid)) return no("only its builder or the host can retune it");
      b.mode = c.mode;
      ch.buildings.add(b.id);
      ch.audit.push(`datacentre #${b.id} mode ${c.mode}`);
      log(s, ch, `${p.name} set a ${buildingName(st, "datacentre")} to ${{ under: "underclock", normal: "normal", over: "overclock" }[c.mode]}.`);
      return OK;
    }
    case "say": {
      const text = cleanText(c.text, 120);
      if (!text) return no("say something");
      if (s.tick < (p.nextSay ?? 0)) return no("too fast: one line every couple of seconds");
      p.nextSay = s.tick + 20;
      s.log.push({ tick: s.tick, text: `${p.name}: ${text}`, by: pid });
      if (s.log.length > 40) s.log.splice(0, s.log.length - 40);
      ch.log++;
      return OK;
    }
    case "kick": {
      if (!isHost(s, pid)) return no("only the host can remove someone");
      if (typeof c.player !== "string" || !Object.hasOwn(s.players, c.player)) return no("no such player");
      const q = s.players[c.player];
      if (q.id === pid) return no("you can't remove yourself");
      q.banned = true;
      q.connected = false;
      q.dx = q.dy = 0;
      ch.kicked = q.id;
      log(s, ch, `${p.name} removed ${q.name} from the room. Their things stay theirs.`);
      ch.audit.push(`kicked ${q.tag} ${JSON.stringify(q.name)}`);
      return OK;
    }
    case "priority": {
      if (!(PRIORITIES as readonly string[]).includes(c.p)) return no("malformed priority");
      if (!isHost(s, pid)) return no("only the host sets the town's water priority");
      s.town.priority = c.p;
      ch.town = true;
      ch.audit.push(`priority ${c.p}`);
      log(s, ch, `${p.name} set water to ${{ essentials: "homes first", balanced: "shared evenly", industry: "datacentres first" }[c.p]}.`);
      return OK;
    }
    default:
      return no("unknown command");
  }
}

function withdraw(s: RoomState, p: Player, ch: Changes): void {
  if (!p.stop) return;
  p.stop = false;
  log(s, ch, `${p.name} went back to work.`);
}

/**
 * The restraint ending: if everyone present in the Universe agrees to stop,
 * the campaign ends with what's left still out there. It can't be undone, and
 * absent players can't block it (or make it happen) by staying away.
 */
export function checkRestraint(s: RoomState, ch: Changes): void {
  if (s.phase.k !== "play" || STAGES[s.stage].id !== "universe") return;
  const here = Object.values(s.players).filter((p) => p.connected);
  if (here.length === 0 || !here.every((p) => p.stop)) return;
  const left = totalRemaining(s);
  if (left === 0) return;
  s.history.push({
    stage: "universe",
    ledger: structuredClone(s.ledger),
    lifeStart: s.lifeStart,
    lifeEnd: averageLife(s),
    buildings: s.buildings.filter((b) => b.owner).length,
    ticks: s.tick - s.stageStartTick,
    lost: s.archive.filter((a) => a.stage === "universe").map((a) => a.name),
  });
  for (const t of s.tiles) if (t.mark) s.archive.push({ stage: "universe", name: t.mark.name, fate: "is still there" });
  s.archive.push({ stage: "universe", name: `${left} units of the Universe`, fate: "were left alone" });
  s.phase = { k: "ended", how: "restraint" };
  for (const p of Object.values(s.players)) p.dx = p.dy = 0;
  log(s, ch, "You stopped. The rest is still out there.");
  ch.meta = true;
  ch.boundary = true;
}

export function facingTo(dx: number, dy: number, fallback: number): number {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return fallback;
  return (Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * 8) + 8) % 8;
}

function checkExhausted(s: RoomState, ch: Changes): void {
  if (s.phase.k !== "play") return;
  if (FAMILIES.some((f) => s.ledger[f].remaining > 0)) return;
  const st = STAGES[s.stage];
  const lost: string[] = [];
  for (const t of s.tiles) if (t.mark) {
    lost.push(t.mark.name);
    s.archive.push({ stage: st.id, name: t.mark.name, fate: `was left behind on spent ${st.name}` });
    delete t.mark;
  }
  const summary: StageSummary = {
    stage: st.id,
    ledger: structuredClone(s.ledger),
    lifeStart: s.lifeStart,
    lifeEnd: averageLife(s),
    buildings: s.buildings.filter((b) => b.owner).length,
    ticks: s.tick - s.stageStartTick,
    lost: [...s.archive.filter((a) => a.stage === st.id).map((a) => a.name)],
  };
  s.history.push(summary);
  s.phase = { k: "transition", until: s.tick + PACES[s.pace].transitionTicks, summary };
  log(s, ch, st.departure);
  ch.meta = true;
  ch.boundary = true;
}

/**
 * The evacuation manifest, settled once at the boundary. Each person keeps their
 * tools, food, hides and arrows; the raw stock of the spent world in packs, bags
 * and chests stays behind and is listed; residents travel asleep and wake as
 * homes are built; animals can't come.
 */
function evacuate(s: RoomState, ch: Changes): void {
  const st = STAGES[s.stage];
  let left = 0;
  const strip = (items: Items): void => {
    for (const f of FAMILIES) {
      left += items[f] ?? 0;
      delete items[f];
    }
  };
  for (const pv of Object.values(s.priv)) strip(pv.items);
  // what's left in chests and bags (food, hides, arrows, tools) goes home with
  // its owner as far as their pack holds; the rest is listed as left behind
  const carry: { owner: string; items: Items; tools: Private["tools"] }[] = [
    ...Object.values(s.chests).map((c) => ({ owner: c.owner, items: c.items, tools: [] })),
    ...s.bags.map((b) => ({ owner: b.owner, items: b.items, tools: b.tools })),
  ];
  let bagged = 0;
  for (const c of carry) {
    strip(c.items);
    const pv = Object.hasOwn(s.priv, c.owner) ? s.priv[c.owner] : undefined;
    let lost = 0;
    for (const [k, n] of Object.entries(c.items) as [ItemId, number][]) {
      const fit = pv ? Math.min(n, packRoom(pv, k)) : 0;
      if (fit) add(pv!.items, k, fit);
      lost += n - fit;
    }
    for (const t of c.tools) {
      if (pv && packSlots(pv) < PACK_CAP) pv.tools.push(t);
      else lost++;
    }
    if (pv) ch.priv.add(c.owner);
    bagged += lost;
  }
  for (const id of Object.keys(s.priv)) ch.priv.add(id);
  if (left) s.archive.push({ stage: st.id, name: `${left} units of gathered ${st.name} stock`, fate: "were left behind in packs and chests" });
  if (bagged) s.archive.push({ stage: st.id, name: `${bagged} things that didn't fit in anyone's pack`, fate: `stayed on spent ${st.name}` });
  const alive = s.animals.filter((a) => !a.dead);
  if (alive.length) s.archive.push({ stage: st.id, name: `${alive.length} animals`, fate: `were left on spent ${st.name}` });
  if (s.town.residents) {
    s.town.sleeping += s.town.residents;
    townEvent(s, ch, `${s.town.residents} residents left ${st.name} asleep, to wake when there are homes for them.`);
    s.town.residents = 0;
  }
  s.town.dry = 0;
}

function nextStage(s: RoomState, ch: Changes): void {
  const leaving = STAGES[s.stage];
  if (s.stage === STAGES.length - 1) {
    s.phase = { k: "ended", how: "consumed" };
    for (const p of Object.values(s.players)) p.dx = p.dy = 0;
    log(s, ch, "The engine keeps searching for a next frontier. There isn't one.");
    ch.meta = true;
    ch.boundary = true;
    return;
  }
  if (leaving.id === "sun") s.reserve += s.ledger.matter.extracted * SUN_TO_RESERVE;
  evacuate(s, ch);
  s.stage++;
  s.gen++;
  const st = STAGES[s.stage];
  const g = generateStage(s.seed, s.stage, s.pace);
  s.w = st.size;
  s.tiles = g.tiles;
  s.buildings = g.buildings;
  s.nextBuildingId = g.buildings.length + 1;
  s.inventory = { ...st.starter };
  s.ledger = ledgerFor(g.tiles);
  s.heat = 0;
  s.stageStartTick = s.tick;
  s.lifeStart = averageLife(s);
  s.phase = { k: "play" };
  const sp = spawnPoint(s);
  Object.values(s.players).forEach((p, i) => {
    p.x = sp.x + (i % 3) - 1;
    p.y = sp.y + Math.floor(i / 3) * 0.8;
    p.dx = p.dy = 0;
    p.act = null;
    p.marks = 0;
  });
  s.receipts = Object.fromEntries(Object.keys(s.players).map((id) => [id, []]));
  s.animals = [];
  s.bags = [];
  s.chests = {};
  log(s, ch, st.arrival);
  ch.meta = true;
  ch.boundary = true;
}

/** One server tick (TICK_MS). Movement every tick; the economy every PACES[pace].econEvery. */
export function tick(s: RoomState, ch: Changes): void {
  s.tick++;
  const dt = TICK_MS / 1000;
  for (const p of Object.values(s.players)) {
    if (p.act && p.act.until <= s.tick) p.act = null;
    if (!p.connected || s.phase.k === "ended" || (p.dx === 0 && p.dy === 0)) continue;
    const [x, y] = step(s, p.x, p.y, p.dx, p.dy, dt, !!p.sprint);
    p.x = x;
    p.y = y;
    p.facing = facingTo(p.dx, p.dy, p.facing);
  }
  if (s.phase.k === "play") {
    survival(s, ch);
    wildlife(s, ch);
  }
  if (s.phase.k === "transition") {
    if (s.tick >= s.phase.until) nextStage(s, ch);
    return;
  }
  if (s.phase.k === "ended") return;
  if (s.tick % PACES[s.pace].econEvery === 0) economy(s, ch);
}

/** Is (x, y) somewhere a body can stand? Buildings are solid except plazas; spent or not, deposits never are. */
export function walkable(s: Pick<RoomState, "tiles" | "w" | "buildings">, x: number, y: number): boolean {
  const t = s.tiles[Math.round(y) * s.w + Math.round(x)];
  if (!t) return false;
  if (!t.b) return true;
  const b = s.buildings.find((q) => q.id === t.b);
  return !b || b.type === "plaza";
}

/**
 * One movement step, shared by the server and the browser's prediction so they
 * agree: axis-separated, so a body slides along a wall rather than sticking. A
 * body already inside something (a building finished around it, an old save)
 * is never trapped: it may always move.
 */
export function step(s: Pick<RoomState, "tiles" | "w" | "buildings">, x: number, y: number, dx: number, dy: number, dt: number, sprint: boolean): [number, number] {
  const v = PLAYER_SPEED * (sprint ? SPRINT : 1) * dt;
  const clamp = (n: number): number => Math.max(0, Math.min(s.w - 1, n));
  const stuck = !walkable(s, x, y);
  const nx = clamp(x + dx * v);
  if (stuck || walkable(s, nx, y)) x = nx;
  const ny = clamp(y + dy * v);
  if (stuck || walkable(s, x, ny)) y = ny;
  return [x, y];
}

/** Hunger, healing, and death: only for players who are actually here. */
function survival(s: RoomState, ch: Changes): void {
  const every = s.pace === "rapid" ? Math.ceil(HUNGER_TICKS / 3) : HUNGER_TICKS;
  for (const p of Object.values(s.players)) {
    if (!p.connected) continue;
    const pv = s.priv[p.id];
    if (!pv) continue;
    if ((s.tick + p.joinedTick) % every === 0) {
      if (pv.food > 0) {
        pv.food--;
        ch.priv.add(p.id);
        if (pv.food >= 50 && p.hp < MAX_HP) p.hp = Math.min(MAX_HP, p.hp + 2);
      } else hurt(s, p, 3, "hunger", ch);
    }
  }
  exposure(s, ch);
}

/**
 * Each world's own hazard, tied to its own mechanic. Mars: suit air refills
 * only inside a working dome's air and runs out in about three minutes outside
 * it. The Sun: past the heat limit, everyone out on the platforms is hurt
 * slowly, a coat halving it. Respawning refills the suit, so dying never loops.
 */
function exposure(s: RoomState, ch: Changes): void {
  const st = STAGES[s.stage];
  const every = s.pace === "rapid" ? 10 : 20;
  if (s.tick % every !== 0) return;
  if (st.mechanic === "pressure") {
    const air = new Set<number>();
    for (const h of s.buildings) if (h.type === "habitat" && h.status === "ok") for (const i of within(s, h, BUILDINGS.habitat.pressureRadius!)) air.add(i);
    for (const p of Object.values(s.players)) {
      const pv = s.priv[p.id];
      if (!p.connected || !pv) continue;
      const before = pv.air ?? 100;
      const inside = air.has(Math.round(p.y) * s.w + Math.round(p.x));
      pv.air = inside ? Math.min(100, before + 10) : Math.max(0, before - 1);
      if (pv.air !== before) ch.priv.add(p.id);
      if (pv.air === 25 && !inside) log(s, ch, `${p.name}'s suit is low on air: get inside a dome.`);
      if (pv.air === 0) {
        hurt(s, p, 6, "lack of air", ch);
        if (p.hp === MAX_HP) pv.air = 100; // just respawned
      }
    }
  } else if (st.mechanic === "heat" && s.heat >= HEAT_LIMIT) {
    for (const p of Object.values(s.players)) if (p.connected) hurt(s, p, 2, "the heat", ch);
  }
}

function hurt(s: RoomState, p: Player, amount: number, cause: string, ch: Changes): void {
  const dmg = wearing(s, p.id) ? Math.ceil(amount / 2) : amount;
  if (wearing(s, p.id)) wear(s, p, ch, "coat");
  p.hp = Math.max(0, p.hp - dmg);
  if (p.hp > 0) return;
  // death: everything carried waits in a bag where they fell, theirs alone for a while;
  // the coat stays on, and they wake at the spawn, fed enough to get back to it
  const pv = s.priv[p.id];
  const keep = pv.tools.filter((t) => TOOLS[t.kind].armour);
  const dropped = pv.tools.filter((t) => !TOOLS[t.kind].armour);
  if (Object.keys(pv.items).length || dropped.length)
    s.bags.push({ id: s.nextItemId++, x: round2(p.x), y: round2(p.y), owner: p.id, ownerName: p.name, openAt: s.tick + BAG_PRIVATE_TICKS, items: pv.items, tools: dropped });
  pv.items = {};
  pv.tools = keep;
  pv.food = Math.max(pv.food, 40);
  p.holding = null;
  p.holdingId = 0;
  p.hp = MAX_HP;
  p.deaths++;
  const sp = spawnPoint(s);
  p.x = sp.x;
  p.y = sp.y;
  p.dx = p.dy = 0;
  ch.priv.add(p.id);
  ch.bags = true;
  log(s, ch, `${p.name} died of ${cause}. Their things are in a bag where they fell.`);
  ch.audit.push(`${p.tag} died of ${cause}`);
}

/**
 * Animals wander their habitat, flee people, and predators bite whoever's
 * close. Cheap: positions move every tick, decisions every few. Clearing a
 * grove or draining the pond leaves its animals nowhere to feed; they starve,
 * and that's recorded too.
 */
function wildlife(s: RoomState, ch: Changes): void {
  if (!s.animals.length) return;
  const dt = TICK_MS / 1000;
  const here = Object.values(s.players).filter((p) => p.connected);
  const decide = s.tick % 5 === 0;
  for (const a of s.animals) {
    if (a.dead) continue;
    const def = ANIMALS[a.kind];
    let speed = def.speed * 0.35;
    const close = here.reduce<Player | null>((best, p) => (!best || Math.hypot(p.x - a.x, p.y - a.y) < Math.hypot(best.x - a.x, best.y - a.y) ? p : best), null);
    const d = close ? Math.hypot(close.x - a.x, close.y - a.y) : Infinity;
    if (close && def.flees && d < 3) {
      a.h = Math.atan2(a.y - close.y, a.x - close.x);
      speed = def.speed;
    } else if (close && def.bite && (a.calm ?? 0) <= s.tick && d < 3) {
      // a predator closes in, bites once, then backs off for a few seconds:
      // dangerous to stand and ignore, survivable if you fight or walk away
      a.h = Math.atan2(close.y - a.y, close.x - a.x);
      speed = def.speed * 0.7;
      if (d < 0.9) {
        hurt(s, close, def.bite, `a ${def.name}'s bite`, ch);
        a.calm = s.tick + 50;
        a.h += Math.PI;
      }
    } else if ((a.calm ?? 0) > s.tick && close) {
      a.h = Math.atan2(a.y - close.y, a.x - close.x);
    } else if (decide) {
      // drift back toward home ground when off it
      const home = habitatNear(s, a);
      a.h = home ? Math.atan2(home[1] - a.y, home[0] - a.x) + (hash01(a.id * 13 + s.tick) - 0.5) * 1.5 : a.h + (hash01(a.id + s.tick) - 0.5) * 2;
    }
    const nx = a.x + Math.cos(a.h) * speed * dt;
    const ny = a.y + Math.sin(a.h) * speed * dt;
    const water = def.habitat === "water";
    const t = s.tiles[Math.round(ny) * s.w + Math.round(nx)];
    const ok = t && (water ? t.t === 1 || (a.kind === "heron" && t.t === 0) : t.t === 0 && walkable(s, nx, ny));
    if (ok && nx >= 0 && ny >= 0 && nx <= s.w - 1 && ny <= s.w - 1) {
      a.x = round2(nx);
      a.y = round2(ny);
    } else a.h += Math.PI / 2;
  }
  // positions go out five times a second; hits, deaths and butchering go out at once
  if (s.tick % 2 === 0) ch.animals = true;
  // starvation: once a minute, an animal with no habitat left anywhere starves
  if (s.tick % 600 === 0) {
    for (const a of s.animals) {
      if (a.dead || habitatNear(s, a, Infinity)) continue;
      a.dead = true;
      a.hp = 0;
      s.fauna.alive--;
      s.fauna.starved++;
      ch.meta = true;
      log(s, ch, `${a.name ? a.name[0].toUpperCase() + a.name.slice(1) : `A ${ANIMALS[a.kind].name}`} starved: there's nowhere left for it to feed.`);
      if (a.name) s.archive.push({ stage: STAGES[s.stage].id, name: a.name, fate: "starved when its home was used up" });
    }
  }
}

const hash01 = (i: number): number => {
  let h = i * 374761393;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** The nearest tile of this animal's habitat with life left in it, within `radius`. */
function habitatNear(s: RoomState, a: Animal, radius = 6): [number, number] | null {
  const hab = ANIMALS[a.kind].habitat;
  let best: [number, number] | null = null;
  let bd = radius;
  const cap = lifeCap(s.ledger);
  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i];
    const fits = hab === "grove" ? t.d === "matter" && t.amt > 0 : hab === "water" ? t.t === 1 && t.d === "coolant" && t.amt > 0 : t.t === 0 && !t.b && effectiveLife(t, cap) > 30;
    if (!fits) continue;
    const d = Math.hypot((i % s.w) - a.x, Math.floor(i / s.w) - a.y);
    if (d <= bd) [bd, best] = [d, [i % s.w, Math.floor(i / s.w)]];
  }
  return best;
}

const setStatus = (b: Building, status: string, ch: Changes): void => {
  if (b.status !== status) {
    b.status = status;
    ch.buildings.add(b.id);
  }
};

const ring = (s: RoomState, b: Building): number[] => {
  const n = BUILDINGS[b.type].size;
  const out: number[] = [];
  for (let y = b.y - 1; y <= b.y + n; y++)
    for (let x = b.x - 1; x <= b.x + n; x++) {
      if (x >= b.x && x < b.x + n && y >= b.y && y < b.y + n) continue;
      if (inBounds(s, x, y)) out.push(y * s.w + x);
    }
  return out;
};

const within = (s: RoomState, b: Building, radius: number): number[] => {
  const [cx, cy] = centre(b);
  const out: number[] = [];
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++)
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++)
      if (inBounds(s, x, y) && Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= radius + 0.5) out.push(y * s.w + x);
  return out;
};

function economy(s: RoomState, ch: Changes): void {
  s.econTicks++;
  const st = STAGES[s.stage];
  const built = s.buildings.filter(complete);
  for (const b of s.buildings) if (!complete(b)) {
    b.work = Math.min(BUILDINGS[b.type].build * 10, b.work + 10);
    ch.buildings.add(b.id);
    // a finished building earns its real status on the next tick, not a free one now
    if (complete(b)) setStatus(b, "starting up", ch);
  }
  const of = (t: BuildingType): Building[] => built.filter((b) => b.type === t);
  const plazaTiles = new Set(of("plaza").flatMap((b) => ring(s, b)));

  // workers are the town's residents: a home holds 2, or 5 when served last
  // tick, and one more lives beside a plaza; nobody appears from nowhere
  const town = s.town;
  let homes = 0;
  for (const city of of("city")) {
    const byPlaza = footprint(city).some(([x, y]) => plazaTiles.has(y * s.w + x));
    homes += (city.status === "ok" ? RESIDENTS_PER_HOME : 2) + (byPlaza ? 1 : 0);
  }
  townGrowth(s, homes, ch);
  let workers = Math.min(town.residents, homes);
  const workersSupply = workers;

  // energy
  let energy = 0;
  for (const f of of("furnace")) {
    if (workers < 1) setStatus(f, "idle: no workers (build homes)", ch);
    else if (s.inventory.matter < 1) setStatus(f, `idle: no ${st.families.matter.label} to burn`, ch);
    else {
      workers--;
      s.inventory.matter--;
      energy += BUILDINGS.furnace.energy;
      setStatus(f, "ok", ch);
    }
  }
  for (const p of of("solar")) {
    energy += BUILDINGS.solar.energy * st.solarScale;
    setStatus(p, "ok", ch);
  }
  if (st.energySource === "bottled") energy = s.reserve;
  const energySupply = st.energySource === "bottled" ? s.reserve : energy;

  let compute = 0;
  for (const e of of("engine")) {
    compute += BUILDINGS.engine.compute;
    setStatus(e, "ok", ch);
  }

  const take = (b: Building, opts: { pressure?: Set<number>; network?: Set<number> } = {}): boolean => {
    const def = BUILDINGS[b.type];
    let why: string | null = null;
    if (opts.pressure && !footprint(b).some(([x, y]) => opts.pressure!.has(y * s.w + x))) why = "idle: outside a dome's air";
    else if (opts.network && !opts.network.has(b.id)) why = "idle: not linked to the Depot (build relays)";
    else if (energy < -def.energy) why = st.energySource === "bottled" ? "idle: the Bottled Sun is empty" : "idle: no power";
    else if (workers < -def.workers) why = "idle: no workers (build homes)";
    else if (compute < -def.compute) why = "idle: no compute (build a datacentre)";
    else if ((def.coolantUse ?? 0) > s.inventory.coolant) why = `idle: no ${st.families.coolant.label} for cooling`;
    if (why) {
      setStatus(b, why, ch);
      return false;
    }
    energy += Math.min(0, def.energy);
    workers += Math.min(0, def.workers);
    compute += Math.min(0, def.compute);
    s.inventory.coolant -= def.coolantUse ?? 0;
    setStatus(b, "ok", ch);
    return true;
  };

  // Mars: air comes from domes
  let pressure: Set<number> | undefined;
  if (st.mechanic === "pressure") {
    pressure = new Set();
    for (const h of of("habitat")) if (take(h)) for (const i of within(s, h, BUILDINGS.habitat.pressureRadius!)) pressure.add(i);
  }
  // Solar System: relays link to the depot
  let network: Set<number> | undefined;
  if (st.mechanic === "relay") {
    const nodes = [...of("depot"), ...of("relay").filter((r) => take(r))];
    network = new Set();
    const linked: Building[] = nodes.filter((n) => n.type === "depot");
    for (const n of linked) network.add(n.id);
    for (let i = 0; i < linked.length; i++) {
      const [ax, ay] = centre(linked[i]);
      const range = BUILDINGS[linked[i].type].relayRange!;
      for (const b of built) {
        if (network.has(b.id)) continue;
        const [bx, by] = centre(b);
        if (Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= range) {
          network.add(b.id);
          if (b.type === "relay" && b.status === "ok") linked.push(b);
        }
      }
    }
  }

  // water: homes drink, datacentres cool. The host's priority decides who goes
  // short when there isn't enough, and the cost of that choice is real
  const dcs = of("datacentre");
  const dcWant = dcs.map((d) => dcDraw(d, s.econTicks));
  // homes drink every fifth economy tick, a unit per ten residents (or part)
  const homesNeed = s.econTicks % 5 === 0 ? Math.ceil(town.residents / 10) : 0;
  const water = splitWater(s, homesNeed, dcWant.reduce((a, b) => a + b, 0));
  let dcWater = water.dcs;
  dcs.forEach((d, i) => {
    const mode = DC_MODE[d.mode ?? "normal"];
    if (dcWater < dcWant[i]) {
      setStatus(d, `idle: no ${st.families.coolant.label} for cooling`, ch);
      return;
    }
    const def = BUILDINGS.datacentre;
    let why: string | null = null;
    if (pressure && !footprint(d).some(([x, y]) => pressure!.has(y * s.w + x))) why = "idle: outside a dome's air";
    else if (energy < mode.energy) why = st.energySource === "bottled" ? "idle: the Bottled Sun is empty" : "idle: no power";
    else if (workers < -def.workers) why = "idle: no workers (build homes)";
    if (why) return setStatus(d, why, ch);
    dcWater -= dcWant[i];
    s.inventory.coolant -= dcWant[i];
    energy -= mode.energy;
    workers += def.workers;
    compute += mode.compute;
    setStatus(d, d.mode === "over" ? "ok" : "ok", ch);
  });
  const computeSupply = compute;
  for (const r of of("radiator")) take(r);

  thirst(s, water, ch);
  const throttled = st.mechanic === "heat" && s.heat >= HEAT_LIMIT;
  let heat = 0;
  for (const x of of("extractor")) {
    if (!take(x, { pressure, network })) continue;
    heat += BUILDINGS.extractor.heat ?? 0;
    if (throttled && s.econTicks % 2 === 0) {
      setStatus(x, "throttled: too hot (build radiators)", ch);
      continue;
    }
    const targets = ring(s, x).filter((i) => s.tiles[i].d && s.tiles[i].amt > 0);
    if (targets.length === 0) {
      setStatus(x, "idle: nothing left to harvest beside it", ch);
      continue;
    }
    targets.sort((a, b) => s.tiles[b].amt - s.tiles[a].amt);
    takeFrom(s, targets[0], BUILDINGS.extractor.extract!, ch);
  }
  for (const city of of("city")) {
    const def = BUILDINGS.city;
    if (energy >= -def.energy && compute >= -def.compute) {
      energy += def.energy;
      compute += def.compute;
      setStatus(city, "ok", ch);
    } else setStatus(city, energy < -def.energy ? "unserved: no power (houses fewer)" : "unserved: no compute (houses fewer)", ch);
  }
  for (const p of of("plaza")) setStatus(p, "ok", ch);

  if (st.energySource === "bottled") s.reserve = Math.max(0, energy);

  // the Sun: heat builds with collectors and computation, radiators shed it
  if (st.mechanic === "heat") {
    for (const b of built) if (b.status === "ok" && b.type !== "extractor") heat += b.type === "datacentre" ? DC_MODE[b.mode ?? "normal"].heat : (BUILDINGS[b.type].heat ?? 0);
    heat += of("solar").length * 4;
    for (const r of of("radiator")) if (r.status === "ok") heat -= BUILDINGS.radiator.cooling!;
    const next = Math.max(0, Math.min(100, s.heat + heat - 2));
    if (next !== s.heat) ch.meta = true;
    s.heat = next;
  }

  // pollution: smoke browns the land and burns groves; extraction scars around it
  for (const b of built) {
    const pol = BUILDINGS[b.type].pollution;
    if (!pol || b.status !== "ok") continue;
    for (const i of within(s, b, pol.radius)) {
      const t = s.tiles[i];
      if (t.t === 2 || t.life === 0) continue;
      t.life = Math.max(0, t.life - pol.amount);
      ch.tiles.add(i);
    }
    if (pol.burnsMatter) {
      const grove = within(s, b, pol.radius).find((i) => s.tiles[i].d === "matter" && s.tiles[i].amt > 0);
      if (grove !== undefined) {
        const t = s.tiles[grove];
        const burnt = Math.min(pol.burnsMatter, t.amt);
        t.amt -= burnt;
        s.ledger.matter.remaining -= burnt;
        s.ledger.matter.destroyed += burnt;
        t.life = Math.min(t.life, Math.round((t.amt / t.init) * 60));
        ch.tiles.add(grove);
        if (t.amt === 0) remember(s, t, "burnt away in the smoke", ch);
      }
    }
  }

  const econ = {
    energySupply,
    energyUsed: energySupply - Math.max(0, energy),
    computeSupply,
    computeUsed: computeSupply - compute,
    workersSupply,
    workersUsed: workersSupply - workers,
  };
  if (JSON.stringify(econ) !== JSON.stringify(s.econ)) ch.meta = true;
  s.econ = econ;
  checkExhausted(s, ch);
}

/** Coolant a datacentre wants this economy tick: underclocked ones sip every other tick. */
export const dcDraw = (d: Building, econTicks: number): number => {
  const c = DC_MODE[d.mode ?? "normal"].coolant;
  return c < 1 ? (econTicks % 2 === 0 ? 1 : 0) : c;
};

/** How the store's water is shared between homes and datacentres this tick, by the town's priority. */
export function splitWater(s: Pick<RoomState, "inventory" | "town">, homesNeed: number, dcsWant: number): { homes: number; dcs: number; homesNeed: number; dcsWant: number } {
  const w = s.inventory.coolant;
  let homes = 0;
  let dcs = 0;
  if (s.town.priority === "essentials") {
    homes = Math.min(homesNeed, w);
    dcs = Math.min(dcsWant, w - homes);
  } else if (s.town.priority === "industry") {
    dcs = Math.min(dcsWant, w);
    homes = Math.min(homesNeed, w - dcs);
  } else {
    // shared evenly: in proportion to need, homes rounded down when it's tight
    const total = homesNeed + dcsWant;
    if (total <= w) [homes, dcs] = [homesNeed, dcsWant];
    else {
      homes = Math.floor((w * homesNeed) / Math.max(1, total));
      dcs = Math.min(dcsWant, w - homes);
    }
  }
  return { homes, dcs, homesNeed, dcsWant };
}

/** New residents move in slowly to homes that are served and watered; evacuees wake first. */
function townGrowth(s: RoomState, homes: number, ch: Changes): void {
  const t = s.town;
  if (t.residents > homes) return;
  // a home gets its first two residents as soon as it's finished
  const floor = Math.min(homes, s.buildings.filter((b) => b.type === "city" && complete(b)).length * 2);
  while (t.residents < floor) {
    t.residents++;
    if (t.sleeping > 0) t.sleeping--;
    else t.arrivals++;
    ch.town = true;
  }
  if (t.residents >= homes || t.dry > 0) return;
  t.served++;
  const every = s.pace === "rapid" ? Math.ceil(GROWTH_TICKS / 5) : GROWTH_TICKS;
  if (t.served % every !== 0) return;
  t.residents++;
  if (t.sleeping > 0) {
    t.sleeping--;
    townEvent(s, ch, "An evacuee from an old world woke and moved in.");
  } else {
    t.arrivals++;
    townEvent(s, ch, `${RESIDENT_NAMES[(t.arrivals + s.seed) % RESIDENT_NAMES.length]} moved into the Cottages.`);
  }
}

function townEvent(s: RoomState, ch: Changes, text: string): void {
  s.town.events.push({ tick: s.tick, text });
  if (s.town.events.length > 30) s.town.events.splice(0, s.town.events.length - 30);
  ch.town = true;
}

/**
 * Homes that go without water long enough lose someone. The chain is causal and
 * inspectable: compute wants coolant, the priority decides who goes short, the
 * homes' dry spell counts up with a warning halfway, and only a long unmitigated
 * shortage kills. All game rules, not real-world figures.
 */
function thirst(s: RoomState, w: { homes: number; dcs: number; homesNeed: number; dcsWant: number }, ch: Changes): void {
  const t = s.town;
  if (w.homesNeed === 0 && t.residents > 0) return;
  s.inventory.coolant -= w.homes;
  const next: Town["water"] = [w.homes, w.homesNeed, w.dcs, w.dcsWant];
  if (next.join() !== t.water.join()) ch.town = true;
  t.water = next;
  if (w.homes >= w.homesNeed) {
    if (t.dry > 0) {
      t.dry = 0;
      ch.town = true;
    }
    return;
  }
  t.dry++;
  ch.town = true;
  const limit = s.pace === "rapid" ? Math.ceil(THIRST_LIMIT / 3) : THIRST_LIMIT;
  if (t.dry === Math.ceil(limit / 2)) {
    const why = w.dcs > 0 ? `the datacentres are taking ${w.dcs} of it` : "there's none left in the store";
    log(s, ch, `The Cottages are short of water: ${why}. Homes first, or underclock, before someone dies.`);
    townEvent(s, ch, `Water shortage warning: homes got ${w.homes} of ${w.homesNeed}; datacentres got ${w.dcs}.`);
  }
  if (t.dry < limit || t.residents === 0) return;
  t.dry = Math.ceil(limit / 2);
  t.residents--;
  t.deaths++;
  const name = RESIDENT_NAMES[(t.deaths * 7 + s.seed) % RESIDENT_NAMES.length];
  const cause = w.dcs > 0 ? `after ${limit} ticks without enough water while the datacentres drew ${w.dcs} a tick` : `after ${limit} ticks without water`;
  log(s, ch, `${name}, who lived in the Cottages, died ${cause}.`);
  townEvent(s, ch, `${name} died ${cause} (priority: ${t.priority}).`);
  s.archive.push({ stage: STAGES[s.stage].id, name, fate: `died ${cause}` });
  // the town puts up a stone beside the datacentre that drank their water
  const dc = s.buildings.find((b) => b.type === "datacentre" && b.status === "ok") ?? s.buildings.find((b) => b.type === "city");
  if (dc) {
    const spot = ring(s, dc).find((i) => !s.tiles[i].b && !s.tiles[i].mark && !(s.tiles[i].d && s.tiles[i].amt > 0) && s.tiles[i].t === 0);
    if (spot !== undefined) {
      s.tiles[spot].mark = { name: `In memory of ${name}`, by: "the town" };
      ch.tiles.add(spot);
    }
  }
}

/** Total across families; used by tests and the HUD. */
export const totalRemaining = (s: RoomState): number => FAMILIES.reduce((a, f) => a + s.ledger[f].remaining, 0);

/** initial = remaining + extracted + destroyed, per family, and remaining matches the tiles. */
export function ledgerHolds(s: RoomState): boolean {
  for (const f of FAMILIES) {
    const l = s.ledger[f];
    const onTiles = s.tiles.reduce((a, t) => a + (t.d === f ? t.amt : 0), 0);
    if (l.initial !== l.remaining + l.extracted + l.destroyed || onTiles !== l.remaining) return false;
  }
  return true;
}

export const bundleOk = (b: Bundle): boolean => FAMILIES.every((f) => Number.isSafeInteger(b[f]) && b[f] >= 0);
export type { Family };
