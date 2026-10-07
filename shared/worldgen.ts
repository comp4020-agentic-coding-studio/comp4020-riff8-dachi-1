// Deterministic stage generation: the server seeds it, the browser never
// does. Same (seed, stage) always yields the same map, which is what makes
// regenerating a stage after a crash at the transition boundary safe.
import { BUILDINGS, FAMILIES, STAGES, type BuildingType, type Family } from "./content.ts";
import type { Building, Terrain, Tile } from "./protocol.ts";

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Generated {
  tiles: Tile[];
  buildings: Building[];
  spawn: { x: number; y: number };
}

const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

export function generateStage(seed: number, stageIndex: number): Generated {
  const stage = STAGES[stageIndex];
  const w = stage.size;
  const r = rng(seed * 31 + stageIndex * 7919 + 1);
  const tiles: Tile[] = Array.from({ length: w * w }, () => ({ t: 0, d: null, amt: 0, init: 0, life: 100, b: 0 }));
  const at = (x: number, y: number): Tile | undefined =>
    x >= 0 && y >= 0 && x < w && y < w ? tiles[y * w + x] : undefined;
  const c = (w - 1) / 2;
  let spawn = { x: c, y: c };
  const buildings: Building[] = [];
  let nextId = 1;
  const place = (type: BuildingType, x: number, y: number, name?: string): void => {
    const b: Building = { id: nextId++, type, x, y, owner: null, work: BUILDINGS[type].build * 10, status: "ok", name };
    const s = BUILDINGS[type].size;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) at(x + dx, y + dy)!.b = b.id;
    buildings.push(b);
  };
  const setTerrain = (pred: (x: number, y: number) => boolean, t: Terrain, ghost?: string): void => {
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++)
        if (pred(x, y)) {
          const tile = at(x, y)!;
          tile.t = t;
          if (ghost) tile.ghost = ghost;
          if (t === 2 || t === 4) tile.life = t === 4 ? 4 : 0;
        }
  };

  // Free tiles a deposit may go on: open ground, nothing built, away from spawn.
  const free = (x: number, y: number, allowVoid = false): boolean => {
    const tile = at(x, y);
    if (!tile || tile.d || tile.b || (tile.t !== 0 && !(allowVoid && tile.t === 2))) return false;
    return dist(x, y, spawn.x, spawn.y) > 3;
  };

  // Grow `count` deposit tiles in a few blobs around random seeds.
  const blobs = (family: Family, count: number, clusters: number, ok: (x: number, y: number) => boolean, terrain?: Terrain): void => {
    const spec = stage.families[family];
    let placed = 0;
    let guard = 0;
    const perCluster = Math.ceil(count / clusters);
    while (placed < count && guard++ < 5000) {
      let x = Math.floor(r() * w);
      let y = Math.floor(r() * w);
      if (!ok(x, y)) continue;
      let inCluster = 0;
      let walk = 0;
      while (placed < count && inCluster < perCluster && walk++ < perCluster * 12) {
        if (ok(x, y)) {
          const tile = at(x, y)!;
          tile.d = family;
          tile.amt = tile.init = spec.perTile;
          if (terrain !== undefined) tile.t = terrain;
          placed++;
          inCluster++;
        }
        x = Math.max(0, Math.min(w - 1, x + Math.floor(r() * 3) - 1));
        y = Math.max(0, Math.min(w - 1, y + Math.floor(r() * 3) - 1));
      }
    }
    if (placed < count) throw new Error(`worldgen: placed ${placed}/${count} ${family} on ${stage.id}`);
  };

  switch (stage.id) {
    case "earth": {
      blobs("coolant", stage.families.coolant.tiles, 1, (x, y) => free(x, y), 1);
      blobs("matter", stage.families.matter.tiles, 4, (x, y) => free(x, y));
      blobs("mineral", stage.families.mineral.tiles, 3, (x, y) => free(x, y));
      break;
    }
    case "mars": {
      blobs("coolant", stage.families.coolant.tiles, 3, (x, y) => free(x, y));
      blobs("matter", stage.families.matter.tiles, 4, (x, y) => free(x, y));
      blobs("mineral", stage.families.mineral.tiles, 3, (x, y) => free(x, y));
      break;
    }
    case "sun": {
      // the star: the N tiles nearest the centre are core, and all of it is plasma
      const order = tiles.map((_, i) => i).sort((a, b) => dist(a % w, Math.floor(a / w), c, c) - dist(b % w, Math.floor(b / w), c, c));
      for (const i of order.slice(0, stage.families.matter.tiles)) {
        tiles[i].t = 3;
        tiles[i].d = "matter";
        tiles[i].amt = tiles[i].init = stage.families.matter.perTile;
      }
      spawn = { x: c, y: w - 4 };
      blobs("mineral", stage.families.mineral.tiles, 4, (x, y) => free(x, y) && dist(x, y, c, c) > 6);
      blobs("coolant", stage.families.coolant.tiles, 3, (x, y) => free(x, y) && dist(x, y, c, c) > 9);
      break;
    }
    case "system": {
      const ring = (x: number, y: number): number => dist(x, y, c, c);
      setTerrain((x, y) => ring(x, y) > 3.2, 2);
      setTerrain((x, y) => ring(x, y) >= 8 && ring(x, y) <= 11.5, 0); // the belt
      setTerrain((x, y) => dist(x, y, 4, 4) <= 2.3, 4, "the Sun's husk");
      setTerrain((x, y) => dist(x, y, w - 5, 5) <= 1.6, 4, "spent Earth");
      setTerrain((x, y) => dist(x, y, 5, w - 5) <= 1.6, 4, "spent Mars");
      spawn = { x: c, y: c + 2 };
      place("depot", Math.floor(c), Math.floor(c) - 1, "Cooperative Depot");
      blobs("matter", stage.families.matter.tiles, 6, (x, y) => free(x, y) && ring(x, y) >= 8);
      blobs("mineral", stage.families.mineral.tiles, 5, (x, y) => free(x, y) && ring(x, y) >= 8);
      blobs("coolant", stage.families.coolant.tiles, 4, (x, y) => free(x, y, true) && ring(x, y) > 12.5, 1);
      break;
    }
    case "universe": {
      setTerrain(() => true, 2);
      setTerrain((x, y) => x < 7 && y > w - 8, 4, "the old Solar System");
      setTerrain((x, y) => dist(x, y, c, c) <= 2.5, 0);
      place("engine", 1, w - 7, "Earth Engine");
      place("engine", 4, w - 6, "Mars Engine");
      place("engine", 1, w - 3, "Sun Husk Engine");
      const space = (x: number, y: number): boolean => free(x, y, true);
      blobs("matter", stage.families.matter.tiles, 5, space, 0);
      blobs("mineral", stage.families.mineral.tiles, 6, space, 0);
      blobs("coolant", stage.families.coolant.tiles, 4, space, 1);
      break;
    }
  }

  // Landmarks: named places, assigned deterministically to a tile kind each.
  const kinds: (Family | null)[] = ["matter", "coolant", null, "mineral"];
  stage.landmarks.forEach((name, i) => {
    const kind = kinds[i % kinds.length];
    const candidates: number[] = [];
    tiles.forEach((tile, idx) => {
      const x = idx % w;
      const y = Math.floor(idx / w);
      if (tile.mark || tile.b) return;
      if (kind === null ? !tile.d && tile.t === 0 && dist(x, y, spawn.x, spawn.y) <= 6 && dist(x, y, spawn.x, spawn.y) > 2 : tile.d === kind) candidates.push(idx);
    });
    if (candidates.length === 0) return;
    candidates.sort((a, b) => dist(a % w, Math.floor(a / w), spawn.x, spawn.y) - dist(b % w, Math.floor(b / w), spawn.x, spawn.y));
    const pick = candidates[Math.floor(r() * Math.min(4, candidates.length))];
    tiles[pick].mark = { name, by: "the Cooperative" };
  });

  // sanity: deposit tile counts match the stage definition exactly
  for (const f of FAMILIES) {
    const n = tiles.filter((t) => t.d === f).length;
    if (n !== stage.families[f].tiles) throw new Error(`worldgen: ${stage.id} ${f} has ${n} tiles`);
  }
  return { tiles, buildings, spawn };
}
