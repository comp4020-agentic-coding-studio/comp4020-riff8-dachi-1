// Live rooms: exactly one in-memory owner per room, inside this one process.
// Rooms with nobody connected pause (no ticks) and are unloaded after a
// minute, so an empty campaign never advances while its players are away.
import { randomBytes, randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, type BagView, type ChestView, type ClientMsg, type Command, type Delta, type Player, type RoomState, type ServerMsg, type Snapshot } from "../shared/protocol.ts";
import { PACES, TICK_MS, type Pace } from "../shared/content.ts";
import { applyCommand, createRoom, join, leave, newChanges, tick, type Changes } from "../shared/sim.ts";
import { loadRoom, roomExists, saveRoom } from "./store.ts";

const SAVE_EVERY_MS = 5000;
const UNLOAD_AFTER_MS = 60_000;
const MAX_CATCHUP_TICKS = 3;

interface Conn {
  ws: WebSocket;
  pid: string | null;
  /** this connection's own stream sequence: each recipient's deltas differ (private state), so each has its own count */
  seq: number;
  tokens: number;
  lastRefill: number;
}

interface LiveRoom {
  s: RoomState;
  /** fresh every time the room is loaded into memory: clients must resync on change */
  inc: string;
  conns: Set<Conn>;
  dirty: boolean;
  lastSave: number;
  emptySince: number | null;
  lastTickAt: number;
  sentPlayers: Map<string, string>;
  sentMoves: Map<string, string>;
  sentArchive: number;
  sentHistory: number;
  ch: Changes;
}

const rooms = new Map<string, LiveRoom>();
export const stats = { tickMsMax: 0, tickMsLast: 0, bytesOut: 0, msgsIn: 0 };

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function createNewRoom(pace: Pace): string {
  let code = "";
  do {
    code = Array.from(randomBytes(5), (b) => ALPHABET[b % ALPHABET.length]).join("");
  } while (roomExists(code));
  const s = createRoom(code, randomBytes(4).readUInt32LE(0), pace);
  saveRoom(s);
  return code;
}

function live(code: string): LiveRoom | null {
  let r = rooms.get(code);
  if (r) return r;
  const s = loadRoom(code);
  if (!s) return null;
  for (const p of Object.values(s.players)) {
    p.connected = false;
    p.dx = p.dy = 0;
  }
  r = { s, inc: randomUUID().slice(0, 8), conns: new Set(), dirty: false, lastSave: Date.now(), emptySince: Date.now(), lastTickAt: Date.now(), sentPlayers: new Map(), sentMoves: new Map(), sentArchive: s.archive.length, sentHistory: s.history.length, ch: newChanges() };
  rooms.set(code, r);
  return r;
}

/** What one player may see of a chest: who owns it always, what's inside only if they may open it. */
export const chestView = (s: RoomState, id: number, pid: string): ChestView | null => {
  const c = s.chests[id];
  if (!c) return null;
  const v: ChestView = { owner: c.owner, ownerName: s.players[c.owner]?.name ?? "someone", access: c.access };
  if (c.owner === pid || c.access === "public") v.items = c.items;
  return v;
};
const bagViews = (s: RoomState): BagView[] =>
  s.bags.map(({ items, tools, ...rest }) => ({ ...rest, n: Object.values(items).reduce((a, n) => a + (n ?? 0), 0) + tools.length }));

/** One player's view of the room: no tokens, no receipts, nobody else's pack or locked chest. */
export const snapshot = (s: RoomState, pid: string, seq: number): Snapshot => {
  const { tokens: _t, receipts: _r, priv, chests, bags: _b, ...rest } = s;
  const views: Record<number, ChestView> = {};
  for (const id of Object.keys(chests)) views[Number(id)] = chestView(s, Number(id), pid)!;
  return { ...rest, seq, me: priv[pid] ?? null, chests: views, bags: bagViews(s) };
};

/** Who did what, one line per action, for `flyctl logs`: a player's public tag and name, never a token. */
function audit(r: LiveRoom, pid: string | null, text: string): void {
  const p = pid ? r.s.players[pid] : null;
  console.log(`[${r.s.code}] ${p ? `${p.tag} ${JSON.stringify(p.name)}` : "-"} ${text}`);
}

const describe = (c: Command): string => {
  switch (c.k) {
    case "harvest":
    case "demolish":
      return `${c.k} ${c.x},${c.y}`;
    case "build":
      return `build ${c.type} ${c.x},${c.y}`;
    case "mark":
      return `name ${c.x},${c.y} ${String(JSON.stringify(c.name) ?? "").slice(0, 40)}`;
    default:
      return JSON.stringify(c).slice(0, 80);
  }
};

function send(c: Conn, msg: ServerMsg): void {
  if (c.ws.readyState !== c.ws.OPEN) return;
  // a slow client whose buffer is backing up gets dropped rather than stall or bloat the room
  if (c.ws.bufferedAmount > 1_000_000) {
    c.ws.close(1013, "too far behind");
    return;
  }
  const text = JSON.stringify(msg);
  stats.bytesOut += text.length;
  c.ws.send(text);
}

function welcome(r: LiveRoom, c: Conn): void {
  if (!c.pid) return;
  send(c, { t: "welcome", v: PROTOCOL_VERSION, inc: r.inc, you: c.pid, token: r.s.tokens[c.pid], snap: snapshot(r.s, c.pid, c.seq) });
}

function save(r: LiveRoom): void {
  saveRoom(r.s);
  r.dirty = false;
  r.lastSave = Date.now();
}

/** Turn accumulated changes into one delta for everyone. */
function flush(r: LiveRoom): void {
  const ch = r.ch;
  const s = r.s;
  if (ch.boundary) {
    for (const line of ch.audit.splice(0)) audit(r, null, line);
    // persist the boundary before anyone hears about it
    save(r);
    r.ch = newChanges();
    r.sentPlayers.clear();
    r.sentMoves.clear();
    for (const c of r.conns) welcome(r, c);
    return;
  }
  // walking is most of the traffic: send it as compact tuples, and whole
  // player records only when something besides position changed
  const players: Player[] = [];
  const moves: NonNullable<Delta["moves"]> = [];
  const r2 = (v: number): number => Math.round(v * 100) / 100;
  for (const p of Object.values(s.players)) {
    const { x, y, dx, dy, facing, nextHarvest: _h, nextEmote: _e, ...rest } = p;
    const full = JSON.stringify(rest);
    const motion = `${r2(x)},${r2(y)},${dx},${dy},${facing}`;
    if (r.sentPlayers.get(p.id) !== full) {
      r.sentPlayers.set(p.id, full);
      r.sentMoves.set(p.id, motion);
      players.push(p);
    } else if (r.sentMoves.get(p.id) !== motion) {
      r.sentMoves.set(p.id, motion);
      moves.push([p.id, r2(x), r2(y), dx, dy, facing]);
    }
  }
  for (const line of ch.audit.splice(0)) audit(r, null, line);
  const shared = players.length || moves.length || ch.tiles.size || ch.buildings.size || ch.removed.length || ch.meta || ch.log || ch.animals || ch.bags || ch.town;
  if (!shared && !ch.priv.size && !ch.chests.size) return;
  s.seq++;
  const d: Delta = { t: "delta", seq: 0, gen: s.gen, tick: s.tick, players };
  if (ch.animals) d.animals = s.animals;
  if (ch.bags) d.bags = bagViews(s);
  if (ch.town) d.town = s.town;
  if (ch.meta) d.fauna = s.fauna;
  if (moves.length) d.moves = moves;
  if (ch.tiles.size) d.tiles = [...ch.tiles].map((i) => [i, s.tiles[i]]);
  if (ch.buildings.size) d.buildings = s.buildings.filter((b) => ch.buildings.has(b.id));
  if (ch.removed.length) d.removed = ch.removed;
  if (ch.meta) {
    d.meta = { inventory: s.inventory, ledger: s.ledger, econ: s.econ, heat: s.heat, reserve: s.reserve, phase: s.phase, hostId: s.hostId };
    // the archive and history only ever grow: resend them only when they have
    if (s.archive.length !== r.sentArchive) d.meta.archive = s.archive;
    if (s.history.length !== r.sentHistory) d.meta.history = s.history;
    r.sentArchive = s.archive.length;
    r.sentHistory = s.history.length;
  }
  if (ch.log) d.log = s.log.slice(-ch.log);
  r.dirty = true;
  r.ch = newChanges();
  // the shared part is the same for everyone; private state and chest contents
  // go only to who may see them, and each recipient's stream counts its own seq
  for (const c of r.conns) {
    if (!c.pid) continue;
    const mine = ch.priv.has(c.pid);
    if (!shared && !mine && !ch.chests.size) continue;
    const out: Delta = { ...d, seq: ++c.seq };
    if (mine) out.me = s.priv[c.pid];
    if (ch.chests.size) out.chests = [...ch.chests].map((id) => [id, chestView(s, id, c.pid!)]);
    send(c, out);
  }
}

export function stepAll(): void {
  const now = Date.now();
  const t0 = performance.now();
  for (const [code, r] of rooms) {
    if (r.conns.size === 0) {
      r.lastTickAt = now;
      if (r.dirty) save(r);
      if (r.emptySince && now - r.emptySince > UNLOAD_AFTER_MS) rooms.delete(code);
      continue;
    }
    // catch up after a stall, but never more than a few ticks: no runaway economy
    let due = Math.floor((now - r.lastTickAt) / TICK_MS);
    if (due > MAX_CATCHUP_TICKS) {
      r.lastTickAt = now - MAX_CATCHUP_TICKS * TICK_MS;
      due = MAX_CATCHUP_TICKS;
    }
    try {
      for (let i = 0; i < due; i++) {
        tick(r.s, r.ch);
        r.lastTickAt += TICK_MS;
        if (r.ch.boundary) break;
      }
      flush(r);
      if (r.dirty && now - r.lastSave > SAVE_EVERY_MS) save(r);
    } catch (err) {
      // one room's failure mustn't stop the others; it resumes from its last save on next load
      console.error(`room ${code}:`, err);
      for (const c of r.conns) c.ws.close(1011, "room error");
      rooms.delete(code);
    }
  }
  stats.tickMsLast = performance.now() - t0;
  stats.tickMsMax = Math.max(stats.tickMsMax, stats.tickMsLast);
}

export function saveAll(): void {
  for (const r of rooms.values()) save(r);
}

export const roomCount = (): number => rooms.size;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const perIp = new Map<string, number>();
// generous: a whole class on campus Wi-Fi can share one public address
const MAX_SOCKETS_PER_IP = 32;

export function attach(ws: WebSocket, ip: string): void {
  // one machine opening many sockets can't take every seat or multiply its rate limit
  const open = perIp.get(ip) ?? 0;
  if (open >= MAX_SOCKETS_PER_IP) {
    ws.close(1013, "too many connections from one address");
    return;
  }
  perIp.set(ip, open + 1);
  const c: Conn = { ws, pid: null, seq: 0, tokens: 60, lastRefill: Date.now() };
  let room: LiveRoom | null = null;
  const fail = (reason: string): void => send(c, { t: "error", reason });

  ws.on("message", (raw, isBinary) => {
    // a throw in here would take every room down with it: contain it to this message
    try {
      onMessage(raw.toString(), isBinary);
    } catch (err) {
      console.error("message handler:", err);
      fail("server error");
    }
  });

  const onMessage = (text: string, isBinary: boolean): void => {
    stats.msgsIn++;
    // token bucket: 40 messages a second sustained, bursts of 60
    const now = Date.now();
    c.tokens = Math.min(60, c.tokens + ((now - c.lastRefill) / 1000) * 40);
    c.lastRefill = now;
    if (c.tokens < 1) return fail("slow down");
    c.tokens--;
    if (isBinary || text.length > MAX_MESSAGE_BYTES) return fail("message too large");
    let msg: ClientMsg;
    try {
      msg = JSON.parse(text);
    } catch {
      return fail("malformed message");
    }
    if (!isRecord(msg)) return fail("malformed message");

    if (msg.t === "hello") {
      if (room) return fail("already joined");
      if (msg.v !== PROTOCOL_VERSION) return fail("this page is out of date: reload it");
      if (typeof msg.room !== "string" || !/^[A-Z0-9]{5}$/.test(msg.room)) return fail("no such room");
      const r = live(msg.room);
      if (!r) return fail("no such room");
      const s = r.s;
      let pid = typeof msg.token === "string" ? Object.keys(s.tokens).find((id) => s.tokens[id] === msg.token) : undefined;
      if (pid) {
        // the same player opened a second tab: the newest wins
        for (const other of r.conns) if (other.pid === pid) other.ws.close(4001, "opened in another tab");
      }
      const id = pid ?? randomUUID().slice(0, 12);
      const token = pid ? s.tokens[pid] : randomBytes(18).toString("base64url");
      if (pid && s.players[pid]?.banned) return fail("the host removed you from this room");
      const p = join(s, id, token, typeof msg.name === "string" ? msg.name : "", r.ch);
      if (!p) return fail("this room is full");
      room = r;
      c.pid = id;
      r.conns.add(c);
      audit(r, id, pid ? "rejoined" : "joined (new identity)");
      r.emptySince = null;
      // pending changes go out first, so the snapshot is the exact boundary for later deltas
      flush(r);
      welcome(r, c);
      return;
    }
    if (!room || !c.pid) return fail("say hello first");
    if (msg.t === "ping") return send(c, { t: "pong", n: typeof msg.n === "number" && Number.isFinite(msg.n) ? msg.n : 0 });
    if (msg.t === "sync") {
      flush(room);
      return welcome(room, c);
    }
    if (msg.t === "cmd") {
      if (typeof msg.id !== "string" || msg.id.length < 1 || msg.id.length > 40) return fail("malformed command");
      if (msg.inc !== room.inc) {
        send(c, { t: "ack", id: msg.id, ok: false, reason: "the server restarted: resyncing" });
        flush(room);
        return welcome(room, c);
      }
      if (!isRecord(msg.c) || typeof msg.c.k !== "string") return fail("malformed command");
      const res = applyCommand(room.s, c.pid, msg.id, msg.gen, msg.c, room.ch);
      if (room.ch.kicked) {
        for (const other of room.conns)
          if (other.pid === room.ch.kicked) {
            other.ws.close(4003, "removed by the host");
            // and stop listening now, in case it ignores the close
            room.conns.delete(other);
            setTimeout(() => other.ws.terminate(), 2000);
          }
        room.ch.kicked = undefined;
      }
      if (msg.c.k === "say") audit(room, c.pid, `say ${String(JSON.stringify((msg.c as { text?: unknown }).text) ?? "").slice(0, 130)} -> ${res.ok ? "ok" : `refused: ${res.reason}`}`);
      else if (msg.c.k !== "move") {
        audit(room, c.pid, `${describe(msg.c as Command)} -> ${res.ok ? "ok" : `refused: ${res.reason}`}`);
        for (const line of room.ch.audit.splice(0)) audit(room, c.pid, `  ${line}`);
        send(c, res.ok ? { t: "ack", id: msg.id, ok: true } : { t: "ack", id: msg.id, ok: false, reason: res.reason });
      }
      return;
    }
    fail("unknown message");
  };

  ws.on("close", () => {
    const left = (perIp.get(ip) ?? 1) - 1;
    if (left <= 0) perIp.delete(ip);
    else perIp.set(ip, left);
    if (!room || !c.pid) return;
    room.conns.delete(c);
    const stillHere = [...room.conns].some((o) => o.pid === c.pid);
    if (!stillHere) {
      leave(room.s, c.pid, room.ch);
      audit(room, c.pid, "left");
    }
    flush(room);
    if (room.conns.size === 0) {
      room.emptySince = Date.now();
      save(room);
    }
  });
}

export const paceOf = (raw: unknown): Pace => (raw === "rapid" ? "rapid" : "normal");
export { PACES };
