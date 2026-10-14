import { describe, expect, it } from "vitest";
import { ANIMALS, BAG_PRIVATE_TICKS, MAX_HP, RECIPES, TOOLS } from "../shared/content.ts";
import type { RoomState } from "../shared/protocol.ts";
import { applyCommand, createRoom, join, ledgerHolds, newChanges, step, tick, walkable, type Changes } from "../shared/sim.ts";
import { snapshot } from "../server/rooms.ts";
import { migrateState } from "../server/store.ts";

// Personal play: packs, chests, tools, hunting, death, the town's water. The
// simulation directly, plus the per-player view the server sends.

let n = 0;
const id = (): string => `p${n++}`;

function room(players = ["a", "b"], pace: "normal" | "rapid" = "normal"): { s: RoomState; ch: Changes } {
  const s = createRoom("PLAYS", 11, pace);
  const ch = newChanges();
  for (const p of players) join(s, p, `tok-${p}`, p.toUpperCase(), ch);
  return { s, ch };
}
const cmd = (s: RoomState, ch: Changes, pid: string, c: Parameters<typeof applyCommand>[4]) => applyCommand(s, pid, id(), s.gen, c, ch);
const stand = (s: RoomState, pid: string, x: number, y: number): void => {
  s.players[pid].x = x;
  s.players[pid].y = y;
};
const freeTile = (s: RoomState): [number, number] => {
  for (let y = 2; y < s.w - 2; y++)
    for (let x = 2; x < s.w - 2; x++) {
      const t = s.tiles[y * s.w + x];
      if (t.t === 0 && !t.d && !t.b && !t.mark) return [x, y];
    }
  throw new Error("no free tile");
};

describe("personal packs", () => {
  it("harvests into the harvester's own pack, not a shared one", () => {
    const { s, ch } = room();
    const i = s.tiles.findIndex((t) => t.d === "matter");
    const [x, y] = [i % s.w, Math.floor(i / s.w)];
    stand(s, "a", x + 0.5, y);
    expect(cmd(s, ch, "a", { k: "harvest", x, y }).ok).toBe(true);
    expect(s.priv.a.items.matter).toBe(1);
    expect(s.priv.b.items.matter).toBeUndefined();
    expect(s.inventory.matter).toBe(0);
    expect(ledgerHolds(s)).toBe(true);
  });

  it("a held tool multiplies the yield, and wears", () => {
    const { s, ch } = room();
    s.priv.a.items = { matter: 3, mineral: 2 };
    expect(cmd(s, ch, "a", { k: "craft", recipe: "axe" }).ok).toBe(true);
    expect(s.players.a.holding).toBe("axe");
    const i = s.tiles.findIndex((t) => t.d === "matter");
    const [x, y] = [i % s.w, Math.floor(i / s.w)];
    stand(s, "a", x + 0.5, y);
    expect(cmd(s, ch, "a", { k: "harvest", x, y }).ok).toBe(true);
    expect(s.priv.a.items.matter).toBe(2);
    expect(s.priv.a.tools[0].dur).toBe(TOOLS.axe.dur - 1);
  });

  it("crafting refuses without inputs or station, and consumes inputs exactly once", () => {
    const { s, ch } = room();
    expect(cmd(s, ch, "a", { k: "craft", recipe: "axe" }).ok).toBe(false);
    s.priv.a.items = { meat: 2 };
    const r = cmd(s, ch, "a", { k: "craft", recipe: "meal" });
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("Campfire") });
    expect(s.priv.a.items.meat).toBe(2);
    // a retried craft id applies once
    s.priv.a.items = { matter: 6, mineral: 4 };
    applyCommand(s, "a", "same", s.gen, { k: "craft", recipe: "axe" }, ch);
    applyCommand(s, "a", "same", s.gen, { k: "craft", recipe: "axe" }, ch);
    expect(s.priv.a.tools).toHaveLength(1);
    expect(s.priv.a.items).toEqual({ matter: 3, mineral: 2 });
  });

  it("a personal piece is paid from the pack, never the Cooperative store", () => {
    const { s, ch } = room();
    s.inventory = { matter: 100, mineral: 100, coolant: 100 };
    const [x, y] = freeTile(s);
    stand(s, "a", x + 2, y);
    expect(cmd(s, ch, "a", { k: "build", x, y, type: "campfire" }).ok).toBe(false);
    expect(s.inventory.matter).toBe(100);
    s.priv.a.items = { matter: 3, mineral: 2 };
    expect(cmd(s, ch, "a", { k: "build", x, y, type: "campfire" }).ok).toBe(true);
    expect(s.priv.a.items).toEqual({});
    expect(s.inventory.matter).toBe(100);
  });

  it("never lets a building go up through someone standing there", () => {
    const { s, ch } = room();
    s.priv.a.items = { matter: 10 };
    const [x, y] = freeTile(s);
    stand(s, "a", x + 2, y);
    stand(s, "b", x, y);
    expect(cmd(s, ch, "a", { k: "build", x, y, type: "chest" })).toEqual({ ok: false, reason: "B is standing there" });
  });

  it("every recipe names real items and a reachable station", () => {
    for (const r of RECIPES) {
      if ("tool" in r.out) expect(TOOLS[r.out.tool]).toBeDefined();
      expect(Object.keys(r.in).length).toBeGreaterThan(0);
    }
  });
});

describe("chests", () => {
  function withChest(): { s: RoomState; ch: Changes; chest: number; x: number; y: number } {
    const { s, ch } = room(["a", "b"]);
    s.priv.a.items = { matter: 4 };
    const [x, y] = freeTile(s);
    stand(s, "a", x + 1.2, y);
    stand(s, "b", x - 1.2, y);
    expect(cmd(s, ch, "a", { k: "build", x, y, type: "chest" }).ok).toBe(true);
    const chest = s.buildings[s.buildings.length - 1].id;
    return { s, ch, chest, x, y };
  }

  it("is locked to its owner until they share it", () => {
    const { s, ch, chest } = withChest();
    s.priv.a.items = { mineral: 5 };
    expect(cmd(s, ch, "a", { k: "stash", chest, item: "mineral", n: 5 }).ok).toBe(true);
    expect(cmd(s, ch, "b", { k: "take", chest, item: "mineral", n: 1 })).toEqual({ ok: false, reason: "that chest is locked to its owner" });
    expect(cmd(s, ch, "b", { k: "access", chest, access: "public" }).ok).toBe(false);
    expect(cmd(s, ch, "a", { k: "access", chest, access: "public" }).ok).toBe(true);
    expect(cmd(s, ch, "b", { k: "take", chest, item: "mineral", n: 2 }).ok).toBe(true);
    expect(s.priv.b.items.mineral).toBe(2);
    expect(s.chests[chest].items.mineral).toBe(3);
  });

  it("two players taking the last stack: one gets it, nothing is duplicated", () => {
    const { s, ch, chest } = withChest();
    s.priv.a.items = { mineral: 1 };
    cmd(s, ch, "a", { k: "stash", chest, item: "mineral", n: 1 });
    cmd(s, ch, "a", { k: "access", chest, access: "public" });
    const r1 = cmd(s, ch, "a", { k: "take", chest, item: "mineral", n: 1 });
    const r2 = cmd(s, ch, "b", { k: "take", chest, item: "mineral", n: 1 });
    expect([r1.ok, r2.ok]).toEqual([true, false]);
    expect((s.priv.a.items.mineral ?? 0) + (s.priv.b.items.mineral ?? 0) + (s.chests[chest].items.mineral ?? 0)).toBe(1);
  });

  it("taking one down bags its contents for the owner instead of destroying them", () => {
    const { s, ch, chest, x, y } = withChest();
    s.priv.a.items = { mineral: 7 };
    cmd(s, ch, "a", { k: "stash", chest, item: "mineral", n: 7 });
    expect(cmd(s, ch, "a", { k: "demolish", x, y }).ok).toBe(true);
    expect(s.chests[chest]).toBeUndefined();
    const bag = s.bags.find((b) => b.items.mineral === 7)!;
    expect(bag.owner).toBe("a");
    expect(cmd(s, ch, "b", { k: "loot", bag: bag.id }).ok).toBe(false);
  });

  it("refuses counts that aren't positive whole numbers", () => {
    const { s, ch, chest } = withChest();
    for (const n of [0, -3, 1.5, Number.NaN, 1e20]) expect(cmd(s, ch, "a", { k: "stash", chest, item: "matter", n }).ok).toBe(false);
  });
});

describe("what each player is sent", () => {
  it("never includes someone else's pack, tokens, or a locked chest's contents", () => {
    const { s, ch } = room(["a", "b"]);
    s.priv.a.items = { matter: 4, mineral: 9 };
    const [x, y] = freeTile(s);
    stand(s, "a", x + 1.2, y);
    cmd(s, ch, "a", { k: "build", x, y, type: "chest" });
    const chest = s.buildings[s.buildings.length - 1].id;
    cmd(s, ch, "a", { k: "stash", chest, item: "mineral", n: 9 });
    const forB = snapshot(s, "b", 1);
    const text = JSON.stringify(forB);
    expect(forB.me).toEqual(s.priv.b);
    expect(text).not.toContain("tok-a");
    expect(forB.chests[chest].items).toBeUndefined();
    expect(forB.chests[chest].ownerName).toBe("A");
    expect((forB as unknown as Record<string, unknown>).priv).toBeUndefined();
    expect(snapshot(s, "a", 1).chests[chest].items).toEqual({ mineral: 9 });
  });
});

describe("hunting and death", () => {
  it("a carcass is butchered once, into the butcher's pack", () => {
    const { s, ch } = room(["a", "b"]);
    const deer = s.animals.find((a) => a.kind === "deer")!;
    stand(s, "a", deer.x + 0.5, deer.y);
    stand(s, "b", deer.x - 0.5, deer.y);
    deer.hp = 1;
    expect(cmd(s, ch, "a", { k: "hit", animal: deer.id }).ok).toBe(true);
    expect(deer.dead).toBe(true);
    expect(s.fauna.hunted).toBe(1);
    const r1 = cmd(s, ch, "a", { k: "butcher", animal: deer.id });
    const r2 = cmd(s, ch, "b", { k: "butcher", animal: deer.id });
    expect([r1.ok, r2.ok]).toEqual([true, false]);
    expect(s.priv.a.items.meat).toBe(ANIMALS.deer.yields.meat);
    expect(s.priv.b.items.meat).toBeUndefined();
    expect(s.fauna.founded).toBe(s.fauna.alive + s.fauna.hunted + s.fauna.starved);
  });

  it("death drops a bag only its owner can open for a while; nothing is duplicated", () => {
    const { s, ch } = room(["a", "b"], "rapid");
    s.priv.a.items = { mineral: 12 };
    s.priv.a.food = 0;
    s.players.a.hp = 1;
    const at = { x: s.players.a.x, y: s.players.a.y };
    for (let i = 0; i < 40 && s.players.a.deaths === 0; i++) tick(s, ch);
    expect(s.players.a.deaths).toBe(1);
    expect(s.players.a.hp).toBe(MAX_HP);
    expect(s.priv.a.items).toEqual({});
    const bag = s.bags[0];
    expect(bag.items).toEqual({ mineral: 12 });
    stand(s, "b", bag.x, bag.y);
    expect(cmd(s, ch, "b", { k: "loot", bag: bag.id }).ok).toBe(false);
    stand(s, "a", at.x, at.y);
    expect(cmd(s, ch, "a", { k: "loot", bag: bag.id }).ok).toBe(true);
    expect(s.priv.a.items.mineral).toBe(12);
    expect(s.bags).toHaveLength(0);
    expect(BAG_PRIVATE_TICKS).toBeGreaterThan(0);
  });

  it("an absent player doesn't starve", () => {
    const { s, ch } = room(["a", "b"], "rapid");
    s.players.b.connected = false;
    const food = s.priv.b.food;
    for (let i = 0; i < 500; i++) tick(s, ch);
    expect(s.priv.b.food).toBe(food);
    expect(s.priv.a.food).toBeLessThan(food);
  });
});

describe("collision", () => {
  it("buildings are solid, plazas aren't, and a body inside something can always walk out", () => {
    const { s, ch } = room(["a"]);
    s.priv.a.items = { matter: 10 };
    const [x, y] = freeTile(s);
    stand(s, "a", x + 1.6, y);
    cmd(s, ch, "a", { k: "build", x, y, type: "chest" });
    expect(walkable(s, x, y)).toBe(false);
    const [nx] = step(s, x + 1.6, y, -1, 0, 0.5, false);
    expect(nx).toBeGreaterThan(x + 0.5);
    // trapped inside (an old save): still free to move
    const [ix] = step(s, x, y, 1, 0, 0.1, false);
    expect(ix).toBeGreaterThan(x);
  });
});

describe("the town's water", () => {
  /** A town with homes and an overclocked datacentre, on a store with not enough water for both. */
  function thirsty(priority: "industry" | "essentials"): RoomState {
    const s = createRoom("WATER", 3, "normal");
    const ch = newChanges();
    join(s, "a", "tok", "A", ch);
    s.inventory = { matter: 1000, mineral: 1000, coolant: 100 };
    const place = (type: "city" | "solar" | "datacentre", x: number, y: number): void => {
      stand(s, "a", x + 3.5, y + 3.5);
      const r = cmd(s, ch, "a", { k: "build", x, y, type });
      if (!r.ok) throw new Error(r.reason);
      s.buildings[s.buildings.length - 1].work = 1000;
    };
    const spots: [number, number][] = [];
    for (let y = 0; y < s.w - 1 && spots.length < 6; y += 2)
      for (let x = 0; x < s.w - 1 && spots.length < 6; x += 2) {
        const ok = [0, 1].every((dy) => [0, 1].every((dx) => {
          const t = s.tiles[(y + dy) * s.w + x + dx];
          return t.t === 0 && !t.d && !t.b;
        }));
        if (ok) spots.push([x, y]);
      }
    place("city", ...spots[0]);
    place("city", ...spots[1]);
    place("solar", ...spots[2]);
    place("solar", ...spots[3]);
    place("solar", ...spots[4]);
    place("datacentre", ...spots[5]);
    s.buildings[s.buildings.length - 1].mode = "over";
    s.inventory.coolant = 0;
    s.town.priority = priority;
    s.players.a.x = -100; // out of the way of the animals
    return s;
  }

  it("an overclocked datacentre on a dry store kills a resident, with the cause on record", () => {
    const s = thirsty("industry");
    const ch = newChanges();
    let i = 0;
    for (; i < 6000 && s.town.deaths === 0; i++) {
      s.inventory.coolant = 3; // just what the overclocked datacentre wants each tick
      tick(s, ch);
    }
    expect(s.town.deaths).toBe(1);
    const ev = s.town.events.map((e) => e.text).join("\n");
    expect(ev).toContain("Water shortage warning");
    expect(ev).toMatch(/died after \d+ ticks without enough water while the datacentres drew 3/);
    expect(s.tiles.some((t) => t.mark?.name.startsWith("In memory of"))).toBe(true);
  });

  it("homes first, on the same water, keeps everyone alive", () => {
    const s = thirsty("essentials");
    const ch = newChanges();
    for (let i = 0; i < 6000; i++) {
      s.inventory.coolant = 3;
      tick(s, ch);
    }
    expect(s.town.residents).toBeGreaterThan(0);
    expect(s.town.deaths).toBe(0);
  });
});

describe("migration", () => {
  it("moves an old room's shared stockpile once into the Cooperative store, and keeps everything else", () => {
    const { s } = room(["a", "b"]);
    // shape a schema-1 row: no personal state at all
    const old: Record<string, unknown> = JSON.parse(JSON.stringify(s));
    for (const k of ["priv", "chests", "animals", "bags", "fauna", "town", "nextItemId"]) delete old[k];
    old.v = 1;
    old.inventory = { matter: 30, mineral: 20, coolant: 5 };
    for (const p of Object.values(old.players as Record<string, Record<string, unknown>>)) for (const k of ["hp", "holding", "holdingId", "tag", "nextHit", "deaths"]) delete p[k];
    const m = migrateState(1, old);
    expect(m.inventory).toEqual({ matter: 30, mineral: 20, coolant: 5 });
    expect(m.priv.a.items).toEqual({});
    expect(m.priv.b.items).toEqual({});
    expect(m.players.a.hp).toBe(MAX_HP);
    expect(m.ledger).toEqual(s.ledger);
    expect(m.animals.length).toBeGreaterThan(0);
    expect(ledgerHolds(m)).toBe(true);
  });
});

describe("talk and the host's controls", () => {
  it("chat is capped, cleaned, rate limited and attributed", () => {
    const { s, ch } = room(["a", "b"]);
    expect(cmd(s, ch, "a", { k: "say", text: "  hi\u0000 <b>there</b> " + "x".repeat(300) }).ok).toBe(true);
    const line = s.log[s.log.length - 1];
    expect(line.by).toBe("a");
    expect(line.text.startsWith("A: hi <b>there</b>")).toBe(true);
    expect(line.text.length).toBeLessThanOrEqual(3 + 120);
    expect(cmd(s, ch, "a", { k: "say", text: "again" }).ok).toBe(false);
  });

  it("only the host can remove someone, who then can't rejoin, and keeps their things", () => {
    const { s, ch } = room(["a", "b"]);
    s.priv.b.items = { mineral: 3 };
    expect(cmd(s, ch, "b", { k: "kick", player: "a" }).ok).toBe(false);
    expect(cmd(s, ch, "a", { k: "kick", player: "b" }).ok).toBe(true);
    expect(s.players.b.connected).toBe(false);
    expect(join(s, "b", "tok-b", "B", ch)).toBeNull();
    expect(s.priv.b.items).toEqual({ mineral: 3 });
  });
});

describe("backup", () => {
  it("a live-database backup restores every room with its books balanced", async () => {
    const { execFileSync } = await import("node:child_process");
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join: pjoin } = await import("node:path");
    const { DatabaseSync } = await import("node:sqlite");
    const dir = mkdtempSync(pjoin(tmpdir(), "plenty-bk-"));
    try {
      const db = new DatabaseSync(pjoin(dir, "plenty.db"));
      db.exec("PRAGMA journal_mode = WAL; CREATE TABLE rooms (code TEXT PRIMARY KEY, schema INTEGER NOT NULL, state TEXT NOT NULL, saved_at INTEGER NOT NULL, players INTEGER NOT NULL DEFAULT 1); PRAGMA user_version = 2;");
      const { s } = room(["a"]);
      db.prepare("INSERT INTO rooms VALUES (?, 2, ?, 0, 1)").run(s.code, JSON.stringify(s));
      // still open, so the row is in the WAL, not yet the main file
      const out = execFileSync(process.execPath, ["scripts/backup.ts", pjoin(dir, "copy.db")], { env: { ...process.env, DATA_DIR: dir } }).toString();
      expect(out).toContain("backed up 1 rooms");
      expect(out).toContain("1 restore cleanly");
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("each world's hazard", () => {
  it("on Mars a suit runs out of air outside a dome, hurts, and never kills in a loop", () => {
    const { s, ch } = room(["a"], "rapid");
    s.stage = 1;
    s.priv.a.air = 2;
    for (let i = 0; i < 40; i++) tick(s, ch);
    expect(s.priv.a.air).toBe(0);
    expect(s.players.a.hp).toBeLessThan(MAX_HP);
  });
});

describe("fixes from the independent review", () => {
  it("a kick naming __proto__ is refused and pollutes nothing", () => {
    const { s, ch } = room(["a", "b"]);
    expect(cmd(s, ch, "a", { k: "kick", player: "__proto__" }).ok).toBe(false);
    expect(({} as Record<string, unknown>).banned).toBeUndefined();
    expect(cmd(s, ch, "a", { k: "access", chest: "__proto__" as unknown as number, access: "public" }).ok).toBe(false);
  });

  it("a removed player's socket can't act", () => {
    const { s, ch } = room(["a", "b"]);
    s.priv.b.items = { matter: 2 };
    cmd(s, ch, "a", { k: "kick", player: "b" });
    expect(cmd(s, ch, "b", { k: "drop", item: "matter", n: 1 }).ok).toBe(false);
  });

  it("nobody can wall another player in", () => {
    const { s, ch } = room(["a", "b"]);
    s.priv.a.items = { matter: 100 };
    const [x, y] = freeTile(s);
    const cx = x + 3;
    const cy = y + 3;
    stand(s, "b", cx, cy);
    stand(s, "a", cx + 3, cy);
    const ring = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    const results = ring.map(([dx, dy]) => cmd(s, ch, "a", { k: "build", x: cx + dx, y: cy + dy, type: "chest" }));
    expect(results.some((r) => !r.ok && r.reason === "that would wall B in")).toBe(true);
  });

  it("taking down a store-paid work returns salvage to the store, not the demolisher's pack", () => {
    const { s, ch } = room(["a", "b"]);
    s.inventory = { matter: 100, mineral: 100, coolant: 100 };
    const [x, y] = freeTile(s);
    stand(s, "b", x + 3.5, y + 3.5);
    expect(cmd(s, ch, "b", { k: "build", x, y, type: "plaza" }).ok).toBe(true);
    expect(cmd(s, ch, "b", { k: "demolish", x, y }).ok).toBe(true);
    expect(s.priv.b.items).toEqual({});
    expect(s.inventory.matter).toBe(100 - 2 + 1);
  });

  it("a host taking down someone's locked chest never opens its contents to anyone else", () => {
    const { s, ch } = room(["a", "b"]);
    s.priv.b.items = { matter: 4, mineral: 40 };
    const [x, y] = freeTile(s);
    stand(s, "b", x + 1.2, y);
    stand(s, "a", x - 1.2, y);
    cmd(s, ch, "b", { k: "build", x, y, type: "chest" });
    const chest = s.buildings[s.buildings.length - 1].id;
    cmd(s, ch, "b", { k: "stash", chest, item: "mineral", n: 40 });
    expect(cmd(s, ch, "a", { k: "demolish", x, y }).ok).toBe(true);
    const bag = s.bags.find((b) => b.items.mineral === 40)!;
    s.tick += 1_000_000;
    s.players.a.x = bag.x;
    s.players.a.y = bag.y;
    expect(cmd(s, ch, "a", { k: "loot", bag: bag.id }).ok).toBe(false);
  });

  it("evacuation carries chest food home within the pack's room and archives the rest", () => {
    const { s, ch } = room(["a"], "rapid");
    s.chests[999] = { owner: "a", access: "owner", items: { meat: 7, hide: 3, matter: 5 } };
    s.priv.a.items = { meal: 50 * 36 };
    // exhaust the world
    for (const t of s.tiles) if (t.d && t.amt) {
      s.ledger[t.d].remaining -= t.amt;
      s.ledger[t.d].extracted += t.amt;
      t.amt = 0;
    }
    const i = s.tiles.findIndex((t) => t.d);
    s.tiles[i].amt = 1;
    s.ledger[s.tiles[i].d!].remaining += 1;
    s.ledger[s.tiles[i].d!].extracted -= 1;
    stand(s, "a", i % s.w + 0.5, Math.floor(i / s.w));
    s.priv.a.items = { meal: 50 * 35 };
    expect(cmd(s, ch, "a", { k: "harvest", x: i % s.w, y: Math.floor(i / s.w) }).ok).toBe(true);
    for (let k = 0; k < 100 && s.stage === 0; k++) tick(s, ch);
    expect(s.stage).toBe(1);
    const slots = Object.values(s.priv.a.items).reduce((a, n) => a + Math.ceil((n ?? 0) / 50), 0) + s.priv.a.tools.length;
    expect(slots).toBeLessThanOrEqual(36);
    expect(s.archive.some((a) => a.name.includes("didn't fit"))).toBe(true);
  });

  it("drops gather into a few bundles rather than flooding the ground", () => {
    const { s, ch } = room(["a"]);
    s.priv.a.items = { matter: 100 };
    for (let k = 0; k < 50; k++) cmd(s, ch, "a", { k: "drop", item: "matter", n: 1 });
    expect(s.bags.length).toBe(1);
    expect(s.bags[0].items.matter).toBe(50);
  });
});
