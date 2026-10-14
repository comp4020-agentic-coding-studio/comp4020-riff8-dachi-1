// The wire protocol between browser and game server. Versioned: a client and
// server that disagree on PROTOCOL_VERSION refuse each other rather than
// guess. All messages are JSON text frames.
import type { AnimalKind, Bundle, BuildingType, DcMode, Emote, Family, ItemId, Pace, Priority, StageId, ToolKind } from "./content.ts";

export const PROTOCOL_VERSION = 2;
export const SCHEMA_VERSION = 2;
export const MAX_MESSAGE_BYTES = 2048;

export type Terrain = 0 | 1 | 2 | 3 | 4; // ground, water/ice, void, stellar core, remnant

export interface Tile {
  t: Terrain;
  /** deposit family, or null for no natural stock */
  d: Family | null;
  amt: number;
  init: number;
  /** 0..100: how alive (or, off Earth, how untouched) the tile is */
  life: number;
  /** id of the building covering this tile, 0 if none */
  b: number;
  mark?: { name: string; by: string };
  /** label for remnant regions (spent worlds) */
  ghost?: string;
}

export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  owner: string | null;
  /** work units done; complete at BUILDINGS[type].build * 10 */
  work: number;
  /** "ok", or why it's idle: shown to players as text, never colour alone */
  status: string;
  name?: string;
  /** datacentres only: how hard it's driven */
  mode?: DcMode;
  /** what the Cooperative store paid toward it, so salvage goes back where it came from */
  paid?: Partial<Bundle>;
}

/** A tool instance: stable id, durability that wears with use. */
export interface ToolItem {
  id: number;
  kind: ToolKind;
  dur: number;
}

export type Items = Partial<Record<ItemId, number>>;

/** What only the owner sees: pack contents, tools and hunger. */
export interface Private {
  items: Items;
  tools: ToolItem[];
  food: number;
  /** suit air on Mars: refills inside a working dome's air, runs down outside */
  air?: number;
  /** what last hurt you, and when: the vitals panel says why your health is falling */
  hurt?: { cause: string; tick: number };
}

export type ChestAccess = "owner" | "public";
export interface Chest {
  owner: string;
  access: ChestAccess;
  items: Items;
}
/** what a client sees of a chest: contents only when it may open it */
export interface ChestView {
  owner: string;
  ownerName: string;
  access: ChestAccess;
  items?: Items;
}

export interface Animal {
  id: number;
  kind: AnimalKind;
  name?: string;
  x: number;
  y: number;
  hp: number;
  /** a carcass, waiting to be butchered once */
  dead: boolean;
  /** heading, radians */
  h: number;
  /** a predator that just bit someone keeps away until this tick */
  calm?: number;
}

export interface Bag {
  id: number;
  x: number;
  y: number;
  owner: string;
  ownerName: string;
  /** after this tick anyone may open it */
  openAt: number;
  items: Items;
  tools: ToolItem[];
}
export type BagView = Omit<Bag, "items" | "tools"> & { n: number };

export interface Fauna {
  founded: number;
  alive: number;
  hunted: number;
  starved: number;
}

export interface Town {
  priority: Priority;
  residents: number;
  /** evacuees from earlier worlds, asleep until there are homes for them */
  sleeping: number;
  /** consecutive economy ticks the homes went without water */
  dry: number;
  served: number;
  deaths: number;
  arrivals: number;
  /** last water split, for the panel: [to homes, needed by homes, to datacentres, wanted by datacentres] */
  water: [number, number, number, number];
  events: LogEntry[];
}

export interface PlayerStats {
  harvested: number;
  built: number;
  helped: number;
}

export interface Player {
  id: string;
  name: string;
  colour: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  facing: number;
  act: { k: "harvest" | "build" | "emote"; until: number; e?: Emote } | null;
  connected: boolean;
  joinedTick: number;
  nextHarvest: number;
  nextEmote: number;
  marks: number;
  /** in the Universe: this player wants to stop and leave the rest alone */
  stop?: boolean;
  stats: PlayerStats;
  hp: number;
  /** the tool in hand, visible to everyone; its instance lives in the owner's Private */
  holding: ToolKind | null;
  holdingId: number;
  sprint?: boolean;
  /** short public tag for logs and the roster: a hash of the id, never the token */
  tag: string;
  nextHit: number;
  deaths: number;
  nextSay?: number;
  /** removed by the host: can't rejoin this room */
  banned?: boolean;
}

export interface LedgerEntry {
  initial: number;
  remaining: number;
  extracted: number;
  destroyed: number;
}
export type Ledger = Record<Family, LedgerEntry>;

export interface Econ {
  energySupply: number;
  energyUsed: number;
  computeSupply: number;
  computeUsed: number;
  workersSupply: number;
  workersUsed: number;
}

export interface StageSummary {
  stage: StageId;
  ledger: Ledger;
  lifeStart: number;
  lifeEnd: number;
  buildings: number;
  ticks: number;
  lost: string[];
}

export interface ArchiveEntry {
  stage: StageId;
  name: string;
  fate: string;
}

export interface LogEntry {
  tick: number;
  text: string;
  /** chat: who said it (player id), so a listener can mute them */
  by?: string;
}

export type Phase =
  | { k: "play" }
  | { k: "transition"; until: number; summary: StageSummary }
  | { k: "ended"; how?: "consumed" | "restraint" };

/** Everything a room is. JSON-serialisable: this is exactly what gets saved. */
export interface RoomState {
  v: number;
  code: string;
  seed: number;
  pace: Pace;
  hostId: string | null;
  tick: number;
  seq: number;
  gen: number;
  stage: number;
  stageStartTick: number;
  lifeStart: number;
  econTicks: number;
  phase: Phase;
  w: number;
  tiles: Tile[];
  buildings: Building[];
  nextBuildingId: number;
  inventory: Bundle;
  ledger: Ledger;
  econ: Econ;
  heat: number;
  reserve: number;
  history: StageSummary[];
  archive: ArchiveEntry[];
  players: Record<string, Player>;
  /** player id -> what only that player sees */
  priv: Record<string, Private>;
  chests: Record<number, Chest>;
  animals: Animal[];
  bags: Bag[];
  fauna: Fauna;
  town: Town;
  nextItemId: number;
  /** player id -> session token (secret; never sent to other clients) */
  tokens: Record<string, string>;
  /** player id -> recent command ids, for duplicate suppression */
  receipts: Record<string, string[]>;
  log: LogEntry[];
}

export type Command =
  | { k: "move"; dx: number; dy: number; sprint?: boolean }
  | { k: "harvest"; x: number; y: number }
  | { k: "build"; x: number; y: number; type: BuildingType }
  | { k: "demolish"; x: number; y: number }
  | { k: "emote"; e: Emote }
  | { k: "mark"; x: number; y: number; name: string }
  | { k: "stop"; on: boolean }
  | { k: "craft"; recipe: string }
  | { k: "hold"; tool: number }
  | { k: "eat"; item: ItemId }
  | { k: "donate"; item: ItemId; n: number }
  | { k: "stash"; chest: number; item: ItemId; n: number }
  | { k: "take"; chest: number; item: ItemId; n: number }
  | { k: "access"; chest: number; access: ChestAccess }
  | { k: "hit"; animal: number }
  | { k: "butcher"; animal: number }
  | { k: "loot"; bag: number }
  | { k: "drop"; item: ItemId; n: number }
  | { k: "mode"; x: number; y: number; mode: DcMode }
  | { k: "priority"; p: Priority }
  | { k: "say"; text: string }
  | { k: "kick"; player: string };

export type ClientMsg =
  | { t: "hello"; v: number; room: string; token?: string; name: string }
  | { t: "cmd"; id: string; inc: string; gen: number; c: Command }
  | { t: "sync" }
  | { t: "ping"; n: number };

/** What a client sees of the room: the state minus secrets and other people's private things. */
export type Snapshot = Omit<RoomState, "tokens" | "receipts" | "priv" | "chests" | "bags"> & {
  me: Private | null;
  chests: Record<number, ChestView>;
  bags: BagView[];
};

export interface Delta {
  t: "delta";
  seq: number;
  gen: number;
  tick: number;
  /** players whose non-movement fields changed, in full */
  players: Player[];
  /** everyone else who moved: [id, x, y, dx, dy, facing], positions to 0.01 tile */
  moves?: [string, number, number, number, number, number][];
  tiles?: [number, Tile][];
  buildings?: Building[];
  removed?: number[];
  meta?: Pick<RoomState, "inventory" | "ledger" | "econ" | "heat" | "reserve" | "phase" | "hostId"> &
    Partial<Pick<RoomState, "archive" | "history">>;
  log?: LogEntry[];
  /** the recipient's own private state, when it changed */
  me?: Private;
  chests?: [number, ChestView | null][];
  animals?: Animal[];
  bags?: BagView[];
  fauna?: Fauna;
  town?: Town;
}

export type ServerMsg =
  | { t: "welcome"; v: number; inc: string; you: string; token: string; snap: Snapshot }
  | Delta
  | { t: "ack"; id: string; ok: boolean; reason?: string }
  | { t: "error"; reason: string }
  | { t: "pong"; n: number };
