// The procedural model kit for the 3D world: every building, body, creature
// and tool is a handful of flat-shaded primitives built here, so the visual
// bible (warm low-poly forms, soft light from the upper left, one palette per
// stage) lives in one file. Geometry and materials are shared through caches;
// `disposeKit` frees them when the renderer stops.
//
// Scale: one tile is one world unit (about two metres). Models face +X and
// stand on y = 0, centred on their footprint.
import * as THREE from "three";
import { type AnimalKind, type Avatar, type BuildingType, type StageDef, type ToolKind } from "../shared/content.ts";

export const hash = (i: number): number => {
  let h = Math.imul(i | 0, 374761393);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// --- shared geometry and materials -----------------------------------------

const geos = new Map<string, THREE.BufferGeometry>();
const mats = new Map<string, THREE.Material>();
const textures = new Map<string, THREE.Texture>();

function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geos.get(key);
  if (!g) geos.set(key, (g = make()));
  return g;
}

/** Unit primitives standing on y = 0 (except `ball`, which is centred). */
export const G = {
  box: () => geo("box", () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
  cube: () => geo("cube", () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (n = 8) => geo(`cyl${n}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, n).translate(0, 0.5, 0)),
  cone: (n = 8) => geo(`cone${n}`, () => new THREE.ConeGeometry(0.5, 1, n).translate(0, 0.5, 0)),
  ball: (d = 1) => geo(`ball${d}`, () => new THREE.IcosahedronGeometry(0.5, d)),
  dodeca: () => geo("dodeca", () => new THREE.DodecahedronGeometry(0.5, 0)),
  octa: () => geo("octa", () => new THREE.OctahedronGeometry(0.5, 0)),
  dome: () => geo("dome", () => new THREE.SphereGeometry(0.5, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2)),
  /** a triangular prism, apex up, ridge along Z: a gable roof */
  prism: () =>
    geo("prism", () => {
      const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 3).rotateX(-Math.PI / 2);
      g.translate(0, 0.25, 0);
      g.scale(1 / 0.866, 1 / 0.75, 1);
      return g;
    }),
  ring: () => geo("ring", () => new THREE.TorusGeometry(0.5, 0.04, 6, 28).rotateX(Math.PI / 2)),
  arc: () => geo("arc", () => new THREE.TorusGeometry(0.5, 0.05, 5, 12, Math.PI)),
  plane: () => geo("plane", () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
};

interface MatOpts {
  /** emissive strength, glowing in its own colour */
  e?: number;
  opacity?: number;
  /** unlit: always its own colour */
  basic?: boolean;
  additive?: boolean;
  shiny?: boolean;
  double?: boolean;
  /** draw over everything (markers) */
  top?: boolean;
  map?: THREE.Texture;
}

export function mat(colour: string, o: MatOpts = {}): THREE.Material {
  const key = `${colour}|${o.e ?? 0}|${o.opacity ?? 1}|${o.basic ? 1 : 0}|${o.additive ? 1 : 0}|${o.shiny ? 1 : 0}|${o.double ? 1 : 0}|${o.top ? 1 : 0}|${o.map?.uuid ?? ""}`;
  let m = mats.get(key);
  if (m) return m;
  const transparent = (o.opacity ?? 1) < 1 || !!o.additive || !!o.map;
  const common = {
    color: new THREE.Color(colour),
    transparent,
    opacity: o.opacity ?? 1,
    depthWrite: !transparent,
    side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    map: o.map ?? null,
  };
  if (o.basic || o.additive) m = new THREE.MeshBasicMaterial({ ...common, fog: !o.additive });
  else if (o.shiny) m = new THREE.MeshPhongMaterial({ ...common, shininess: 90, specular: new THREE.Color("#ffffff"), flatShading: false });
  else m = new THREE.MeshLambertMaterial({ ...common, flatShading: true, emissive: o.e ? new THREE.Color(colour) : new THREE.Color(0), emissiveIntensity: o.e ?? 0 });
  if (o.top) {
    m.depthTest = false;
    m.depthWrite = false;
  }
  mats.set(key, m);
  return m;
}

/** A soft round glow, for additive sprites and halos. */
export function glowTexture(): THREE.Texture {
  let t = textures.get("glow");
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  textures.set("glow", t);
  return t;
}

/** A two-armed spiral, drawn once: the galaxies of the last world. */
export function galaxyTexture(): THREE.Texture {
  let t = textures.get("galaxy");
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.translate(64, 64);
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
  core.addColorStop(0, "rgba(255,255,240,1)");
  core.addColorStop(1, "rgba(255,255,240,0)");
  ctx.fillStyle = core;
  ctx.fillRect(-64, -64, 128, 128);
  for (let arm = 0; arm < 2; arm++)
    for (let k = 0; k < 140; k++) {
      const f = k / 140;
      const th = f * 5.2 + arm * Math.PI;
      const r = 6 + f * 54;
      const x = Math.cos(th) * r + (hash(k * 7 + arm) - 0.5) * 8 * f;
      const y = Math.sin(th) * r + (hash(k * 13 + arm) - 0.5) * 8 * f;
      ctx.fillStyle = `rgba(255,255,255,${0.9 - f * 0.7})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.6 - f * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  textures.set("galaxy", t);
  return t;
}

export function disposeKit(): void {
  for (const g of geos.values()) g.dispose();
  for (const m of mats.values()) m.dispose();
  for (const t of textures.values()) t.dispose();
  geos.clear();
  mats.clear();
  textures.clear();
}

/** Add a mesh: geometry, material, position, scale, parent. */
function P(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  const opaque = !m.transparent && !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial;
  mesh.castShadow = opaque;
  mesh.receiveShadow = opaque;
  parent.add(mesh);
  return mesh;
}

export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k);
  else c.lerp(new THREE.Color("#ffffff"), k);
  return `#${c.getHexString()}`;
}

// --- buildings ---------------------------------------------------------------

export interface Model {
  root: THREE.Group;
  /** per-frame animation; `t` is seconds (frozen under reduced motion), `motion` false hides particles */
  tick?: (t: number, motion: boolean) => void;
  /** approximate height, for ghosts, labels and camera collision */
  h: number;
}

function smoke(root: THREE.Group, x: number, y: number, z: number, n: number, colour: string): (t: number, motion: boolean, on: boolean) => void {
  const puffs: THREE.Mesh[] = [];
  const m = mat(colour, { opacity: 0.3 });
  for (let k = 0; k < n; k++) {
    const p = P(root, G.ball(1), m, x, y, z, 0.1, 0.1, 0.1);
    p.castShadow = false;
    puffs.push(p);
  }
  return (t, motion, on) => {
    puffs.forEach((p, k) => {
      p.visible = on && motion;
      if (!p.visible) return;
      const ph = (t * 0.32 + k / n) % 1;
      const s = 0.08 + ph * 0.3;
      p.position.set(x + ph * 0.5 + Math.sin(t + k) * 0.06, y + ph * 1.7, z + ph * 0.25);
      p.scale.set(s, s * 0.85, s);
    });
  };
}

const STAGE_TRIM: Record<string, string> = { earth: "#f3e2c7", mars: "#ece2d4", sun: "#e6d3a6", system: "#c7cbd6", universe: "#b9b2f0" };

export function buildingModel(type: BuildingType, st: StageDef, ok: boolean, unserved: boolean, seed: number): Model {
  const root = new THREE.Group();
  const lit = mat("#ffe39a", { e: ok && !unserved ? 1.1 : 0 });
  const dark = mat("#4a4550");
  const wood = mat("#8a5a34");
  const trim = STAGE_TRIM[st.id] ?? "#f3e2c7";
  let tick: Model["tick"];
  let h = 1;
  switch (type) {
    case "city": {
      if (st.id === "earth") {
        const spots: [number, number, number][] = [[-0.42, -0.4, 0], [0.45, -0.32, 1], [-0.05, 0.45, 2]];
        for (const [x, z, k] of spots) {
          const wall = shade("#f3e2c7", (hash(seed * 3 + k) - 0.5) * 0.15);
          const roof = ["#d0664f", "#c45a48", "#b9653f"][(seed + k) % 3];
          const w = 0.62;
          P(root, G.box(), mat(wall), x, 0, z, w, 0.46, 0.54);
          P(root, G.prism(), mat(roof), x, 0.46, z, w + 0.12, 0.36, 0.64);
          P(root, G.box(), mat("#7a4a3a"), x + 0.18, 0.62, z - 0.12, 0.09, 0.3, 0.09);
          P(root, G.box(), wood, x + w / 2 + 0.005, 0, z, 0.02, 0.26, 0.12);
          P(root, G.box(), lit, x + w / 2 + 0.008, 0.2, z + 0.17, 0.02, 0.1, 0.1);
          P(root, G.box(), lit, x + w / 2 + 0.008, 0.2, z - 0.17, 0.02, 0.1, 0.1);
          P(root, G.box(), lit, x, 0.2, z + 0.275, 0.12, 0.1, 0.02);
        }
        // a hedge and a path between the cottages
        P(root, G.box(), mat("#5f9a4a"), 0.6, 0, 0.55, 0.5, 0.14, 0.14);
        P(root, G.box(), mat("#d8c39a"), 0.25, 0, 0.05, 0.9, 0.02, 0.2);
        h = 1;
      } else {
        const body = mat(trim);
        const pods: [number, number, number, number][] = [[-0.38, -0.38, 0.9, 0.5], [0.42, -0.3, 1.3, 0.42], [0, 0.42, 0.7, 0.55]];
        for (const [x, z, ph, r] of pods) {
          P(root, G.cyl(10), body, x, 0, z, r, ph, r);
          P(root, G.cyl(10), lit, x, ph * 0.55, z, r + 0.02, 0.08, r + 0.02);
          P(root, G.dome(), mat(shade(trim, -0.2)), x, ph, z, r, r * 0.8, r);
        }
        h = 1.6;
      }
      break;
    }
    case "furnace": {
      P(root, G.box(), mat("#a35d4a"), 0, 0, 0, 0.78, 0.58, 0.78);
      P(root, G.box(), mat("#6e3f35"), 0, 0.58, 0, 0.84, 0.08, 0.84);
      P(root, G.cyl(8), mat("#5b3a35"), -0.2, 0.6, -0.2, 0.22, 0.95, 0.22);
      P(root, G.cyl(8), mat("#3a2826"), -0.2, 1.52, -0.2, 0.26, 0.06, 0.26);
      P(root, G.box(), mat("#ff8a3a", { e: ok ? 1.4 : 0 }), 0.395, 0.06, 0, 0.02, 0.24, 0.28);
      P(root, G.ball(0), mat("#3b3330"), 0.5, 0.06, 0.3, 0.2, 0.14, 0.2);
      const puff = smoke(root, -0.2, 1.6, -0.2, 7, "#b8b0aa");
      tick = (t, motion) => puff(t, motion, ok);
      h = 1.6;
      break;
    }
    case "solar": {
      const panel = mat(st.id === "sun" ? "#ffd27a" : "#2f4f86", { e: st.id === "sun" && ok ? 0.6 : 0, shiny: st.id !== "sun" });
      const frame = mat("#c9ccd4");
      for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]] as const) {
        P(root, G.cyl(6), frame, x, 0, z, 0.06, 0.22, 0.06);
        const p = P(root, G.cube(), panel, x, 0.3, z, 0.8, 0.035, 0.78);
        p.rotation.z = 0.38;
        const strip = P(root, G.cube(), frame, x, 0.32, z, 0.82, 0.04, 0.03);
        strip.rotation.z = 0.38;
      }
      h = 0.5;
      break;
    }
    case "datacentre": {
      P(root, G.box(), mat("#5a6170"), 0, 0, 0, 1.7, 0.78, 1.25);
      P(root, G.box(), mat("#2e333d"), 0, 0.78, 0, 1.76, 0.06, 1.31);
      P(root, G.cyl(10), mat("#5bb6e8"), -0.2, 0.08, 0.7, 0.1, 1.2, 0.1).rotation.z = Math.PI / 2;
      const lights: THREE.Mesh[] = [];
      const on = [mat("#6fffb0", { basic: true }), mat("#6fd0ff", { basic: true })];
      const off = mat("#30353f");
      for (let row = 0; row < 3; row++)
        for (let k = 0; k < 7; k++) lights.push(P(root, G.cube(), off, 0.855, 0.18 + row * 0.18, -0.48 + k * 0.16, 0.01, 0.05, 0.08));
      const fans: THREE.Group[] = [];
      for (const z of [-0.3, 0.3]) {
        P(root, G.cyl(12), mat("#9aa3b5"), 0.3, 0.84, z, 0.42, 0.08, 0.42);
        const fan = new THREE.Group();
        fan.position.set(0.3, 0.93, z);
        for (let b = 0; b < 3; b++) {
          const blade = P(fan, G.cube(), mat("#3a404c"), 0, 0, 0, 0.36, 0.015, 0.07);
          blade.rotation.y = (b * Math.PI * 2) / 3;
        }
        root.add(fan);
        fans.push(fan);
      }
      tick = (t) => {
        lights.forEach((l, k) => {
          l.material = ok && Math.sin(t * 5 + k * 1.7 + seed) > 0.1 ? on[k % 2] : off;
        });
        if (ok) for (const f of fans) f.rotation.y = t * 9;
      };
      h = 1;
      break;
    }
    case "habitat": {
      P(root, G.cyl(18), mat("#b9c7cf"), 0, 0, 0, 1.8, 0.12, 1.8);
      P(root, G.ball(1), mat("#6fae5a"), -0.3, 0.2, 0.2, 0.35, 0.3, 0.35);
      P(root, G.ball(1), mat("#8fcf6a"), 0.25, 0.18, -0.3, 0.28, 0.24, 0.28);
      P(root, G.box(), mat(trim), 0.2, 0.12, 0.25, 0.4, 0.3, 0.3);
      P(root, G.box(), mat("#d8e6ee"), 0.86, 0, 0, 0.3, 0.36, 0.36);
      const dome = P(root, G.dome(), mat(ok ? "#c8ebff" : "#9a9aa4", { opacity: 0.38, double: true, shiny: true }), 0, 0.12, 0, 1.7, 1.4, 1.7);
      dome.castShadow = false;
      h = 0.95;
      break;
    }
    case "radiator": {
      P(root, G.box(), mat("#6b6f78"), 0, 0, 0, 0.7, 0.14, 0.7);
      const fin = ok ? mat("#ff7a4d", { e: 0.9 }) : mat("#80838c");
      for (let k = -2; k <= 2; k++) P(root, G.box(), fin, k * 0.14, 0.14, 0, 0.05, 0.85, 0.66);
      h = 1;
      break;
    }
    case "relay": {
      const steel = mat("#d9dde6");
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI * 2) / 3;
        const leg = P(root, G.cyl(5), steel, Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18, 0.04, 1.6, 0.04);
        leg.rotation.set(Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1);
      }
      P(root, G.cyl(6), steel, 0, 0, 0, 0.05, 2.1, 0.05);
      for (const y of [0.5, 1.0, 1.5]) P(root, G.cyl(6), steel, 0, y, 0, 0.36 - y * 0.12, 0.03, 0.36 - y * 0.12);
      const tip = P(root, G.ball(1), mat("#6fd0ff", { basic: true }), 0, 2.15, 0, 0.14, 0.14, 0.14);
      const ring = P(root, G.ring(), mat("#6fd0ff", { additive: true, opacity: 0.8 }), 0, 2.1, 0, 1, 1, 1);
      tick = (t, motion) => {
        tip.visible = !ok || Math.sin(t * 4) > -0.3;
        ring.visible = ok && motion;
        const k = (t % 1.6) / 1.6;
        ring.scale.setScalar(0.2 + k * 3);
        ring.position.y = 2.1 - k * 0.3;
      };
      h = 2.2;
      break;
    }
    case "plaza": {
      P(root, G.cyl(12), mat("#e0c99a"), 0, 0, 0, 0.9, 0.04, 0.9);
      P(root, G.box(), wood, 0, 0.16, 0.18, 0.5, 0.04, 0.16);
      P(root, G.box(), wood, 0, 0.2, 0.27, 0.5, 0.14, 0.03);
      for (const x of [-0.2, 0.2]) P(root, G.box(), mat("#5a4030"), x, 0.04, 0.18, 0.04, 0.12, 0.14);
      const pole = mat("#7a5233");
      P(root, G.cyl(5), pole, -0.38, 0, -0.38, 0.04, 0.8, 0.04);
      P(root, G.cyl(5), pole, 0.38, 0, -0.38, 0.04, 0.8, 0.04);
      const cols = ["#e8735a", "#f2c14e", "#4f9de0", "#8fcf6a", "#b47ce0", "#f08ab8"];
      for (let k = 0; k < 6; k++) {
        const f = (k + 0.5) / 6;
        const x = -0.38 + f * 0.76;
        const sag = Math.sin(f * Math.PI) * 0.1;
        const flag = P(root, G.cone(3), mat(cols[k], { double: true }), x, 0.78 - sag, -0.38, 0.1, -0.14, 0.02);
        flag.castShadow = false;
      }
      P(root, G.cyl(8), mat("#b9653f"), 0.3, 0.04, 0.3, 0.16, 0.12, 0.16);
      P(root, G.ball(0), mat(st.id === "earth" ? "#5f9a4a" : "#8fcf6a"), 0.3, 0.3, 0.3, 0.26, 0.3, 0.26);
      h = 0.8;
      break;
    }
    case "depot": {
      P(root, G.box(), mat("#a58a5c"), 0, 0, 0, 1.7, 0.8, 1.35);
      P(root, G.prism(), mat("#6b5a3a"), 0, 0.8, 0, 1.82, 0.4, 1.45).rotation.y = Math.PI / 2;
      P(root, G.box(), mat("#4a3a28"), 0.855, 0, 0, 0.02, 0.55, 0.6);
      for (let k = 0; k < 4; k++) P(root, G.box(), mat(["#c9905a", "#a87040", "#d9a441", "#8a6a4a"][k]), 1.05 + (k % 2) * 0.12, Math.floor(k / 2) * 0.22, -0.55 + k * 0.3, 0.2, 0.2, 0.2);
      P(root, G.cyl(5), mat("#d9dde6"), -0.6, 1.0, -0.5, 0.04, 0.7, 0.04);
      h = 1.4;
      break;
    }
    case "engine": {
      P(root, G.cyl(12), mat("#4a4d60"), 0, 0, 0, 1.6, 0.3, 1.6);
      const planet = P(root, G.ball(2), mat("#6a6f98", { e: 0.25 }), 0, 1.1, 0, 1.1, 1.1, 1.1);
      const orbit = new THREE.Group();
      orbit.position.y = 1.1;
      orbit.rotation.x = 0.35;
      P(orbit, G.ring(), mat("#c9c4ff", { basic: true }), 0, 0, 0, 2.1, 1, 2.1);
      const moon = P(orbit, G.ball(1), mat("#e6e3ff", { basic: true }), 1.05, 0, 0, 0.14, 0.14, 0.14);
      root.add(orbit);
      tick = (t) => {
        orbit.rotation.y = t * 0.4;
        planet.rotation.y = t * 0.1;
        void moon;
      };
      h = 1.8;
      break;
    }
    case "extractor": {
      P(root, G.box(), mat("#8a7a60"), 0, 0, 0, 0.7, 0.1, 0.7);
      const leg = mat("#d9a441");
      for (const [x, z] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]] as const) {
        const l = P(root, G.box(), leg, x * 0.6, 0.1, z * 0.6, 0.05, 1.05, 0.05);
        l.rotation.set(-z * 0.32, 0, x * 0.32);
      }
      P(root, G.box(), mat("#8a5a2b"), 0, 1.05, 0, 0.18, 0.1, 0.18);
      const head = P(root, G.box(), mat("#ffd36b"), 0, 0.5, 0, 0.22, 0.22, 0.22);
      const rod = P(root, G.cyl(6), mat("#5b4630"), 0, 0.1, 0, 0.06, 0.5, 0.06);
      tick = (t) => {
        const y = ok ? 0.3 + Math.abs(Math.sin(t * 5 + seed)) * 0.4 : 0.4;
        head.position.y = y;
        rod.scale.y = y;
      };
      h = 1.15;
      break;
    }
    case "workbench": {
      const top = mat("#a0723f");
      P(root, G.box(), top, 0, 0.38, 0, 0.75, 0.07, 0.42);
      for (const [x, z] of [[-0.32, -0.16], [0.32, -0.16], [-0.32, 0.16], [0.32, 0.16]] as const) P(root, G.box(), wood, x, 0, z, 0.06, 0.38, 0.06);
      P(root, G.box(), wood, 0, 0.1, 0, 0.66, 0.04, 0.34);
      P(root, G.box(), mat("#c0c6cf"), -0.12, 0.45, 0.05, 0.3, 0.015, 0.1);
      P(root, G.box(), mat("#5a4030"), 0.15, 0.45, -0.08, 0.06, 0.04, 0.22);
      P(root, G.box(), mat("#8a8f99"), 0.15, 0.45, 0.04, 0.1, 0.07, 0.07);
      P(root, G.box(), mat("#6b6f78"), 0.3, 0.45, 0.12, 0.1, 0.12, 0.08);
      h = 0.55;
      break;
    }
    case "campfire": {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        P(root, G.dodeca(), mat(k % 2 ? "#8f8a80" : "#a6a39b"), Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3, 0.14, 0.1, 0.14);
      }
      for (let k = 0; k < 3; k++) {
        const log = P(root, G.cyl(6), mat("#6b4a2e"), 0, 0.06, 0, 0.08, 0.5, 0.08);
        log.rotation.set(Math.PI / 2 - 0.25, (k * Math.PI * 2) / 3, 0);
        log.position.set(0, 0.03, 0);
      }
      const outer = P(root, G.cone(6), mat("#ff8a2a", { basic: true }), 0, 0.06, 0, 0.26, 0.42, 0.26);
      const inner = P(root, G.cone(5), mat("#ffe08a", { basic: true }), 0, 0.06, 0, 0.14, 0.28, 0.14);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#ffb060", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
      halo.position.y = 0.25;
      halo.scale.setScalar(1.1);
      root.add(halo);
      const puff = smoke(root, 0, 0.5, 0, 4, "#9a9090");
      tick = (t, motion) => {
        const f = motion ? 1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.06 : 1;
        outer.scale.set(0.26 * f, 0.42 * (2 - f), 0.26 * f);
        inner.scale.set(0.14, 0.28 * f, 0.14);
        halo.scale.setScalar(1.1 * f);
        puff(t, motion, true);
      };
      h = 0.5;
      break;
    }
    case "chest": {
      P(root, G.box(), mat("#8a5a2b"), 0, 0, 0, 0.5, 0.24, 0.34);
      P(root, G.box(), mat("#6e4422"), 0, 0.24, 0, 0.53, 0.09, 0.37);
      const band = mat("#c9a76a");
      for (const x of [-0.17, 0.17]) P(root, G.box(), band, x, 0, 0, 0.04, 0.335, 0.38);
      P(root, G.box(), mat("#e8c46a"), 0.26, 0.16, 0, 0.03, 0.08, 0.06);
      h = 0.4;
      break;
    }
    default:
      P(root, G.box(), dark, 0, 0, 0, 0.8, 0.6, 0.8);
  }
  return { root, tick, h };
}

/** Poles and planks around a site, standing `h` tall. */
export function scaffold(n: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const pole = mat("#a07a4a");
  const plank = mat("#c9a273");
  const r = n * 0.46;
  for (const [x, z] of [[-r, -r], [r, -r], [-r, r], [r, r]] as const) P(g, G.box(), pole, x, 0, z, 0.05, h, 0.05);
  for (const y of [h * 0.5, h]) {
    P(g, G.box(), plank, 0, y, -r, r * 2, 0.04, 0.06);
    P(g, G.box(), plank, 0, y, r, r * 2, 0.04, 0.06);
    P(g, G.box(), plank, -r, y, 0, 0.06, 0.04, r * 2);
    P(g, G.box(), plank, r, y, 0, 0.06, 0.04, r * 2);
  }
  const brace = P(g, G.box(), pole, 0, 0, -r, 0.04, Math.hypot(h, r * 2), 0.04);
  brace.rotation.x = 0;
  brace.rotation.z = Math.atan2(r * 2, h);
  brace.position.set(-r, 0, -r - 0.01);
  P(g, G.box(), mat("#c9a273"), 0, 0, 0, n * 0.8, 0.04, n * 0.8);
  return g;
}

// --- bodies ------------------------------------------------------------------

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** where a held tool attaches */
  hand: THREE.Group;
  /** extra spinning or pulsing parts */
  spin: THREE.Object3D[];
  avatar: Avatar;
  /** hover height for floating bodies */
  hover: number;
  held: ToolKind | null | undefined;
}

function limb(parent: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, w: number, len: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  P(pivot, G.box(), m, 0, -len, 0, w, len, w);
  parent.add(pivot);
  return pivot;
}

export function playerRig(avatar: Avatar, colour: string): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = mat("#ffe0c2");
  const ink = mat("#2b2030");
  const main = mat(colour);
  const spin: THREE.Object3D[] = [];
  let hover = 0;
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  let hand = new THREE.Group();
  if (avatar === "person" || avatar === "suit") {
    const suit = avatar === "suit";
    const trousers = mat(suit ? "#e6e1d8" : "#3a3550");
    const torso = mat(suit ? "#f2efe8" : colour);
    const L = limb(body, trousers, 0, 0.32, 0.075, 0.11, 0.32);
    const R = limb(body, trousers, 0, 0.32, -0.075, 0.11, 0.32);
    legL.add(...L.children.splice(0));
    legR.add(...R.children.splice(0));
    body.remove(L, R);
    legL.position.copy(L.position);
    legR.position.copy(R.position);
    body.add(legL, legR);
    P(body, G.box(), torso, 0, 0.3, 0, 0.2, 0.33, 0.3);
    if (suit) {
      P(body, G.box(), main, 0, 0.44, 0, 0.21, 0.07, 0.31);
      P(body, G.box(), mat("#c9ccd4"), -0.15, 0.34, 0, 0.1, 0.26, 0.22);
    }
    const sleeve = suit ? mat("#f2efe8") : mat(shade(colour, -0.12));
    for (const [arm, z] of [[armL, 0.2], [armR, -0.2]] as const) {
      arm.position.set(0, 0.6, z);
      P(arm, G.box(), sleeve, 0, -0.28, 0, 0.09, 0.28, 0.09);
      P(arm, G.box(), suit ? mat("#c9ccd4") : skin, 0, -0.33, 0, 0.08, 0.06, 0.08);
      body.add(arm);
    }
    hand = new THREE.Group();
    hand.position.set(0.02, -0.31, 0);
    armR.add(hand);
    P(body, G.ball(1), skin, 0, 0.78, 0, 0.3, 0.29, 0.3);
    P(body, G.cube(), ink, 0.145, 0.8, 0.055, 0.02, 0.05, 0.03);
    P(body, G.cube(), ink, 0.145, 0.8, -0.055, 0.02, 0.05, 0.03);
    if (suit) {
      const helmet = P(body, G.ball(2), mat("#bfe6ff", { opacity: 0.4, shiny: true }), 0, 0.79, 0, 0.42, 0.4, 0.42);
      helmet.castShadow = false;
    } else {
      P(body, G.ball(1), mat(shade(colour, -0.35)), -0.03, 0.86, 0, 0.31, 0.18, 0.31);
    }
  } else if (avatar === "drone" || avatar === "probe") {
    hover = 0.45;
    P(body, G.ball(1), main, 0, 0.1, 0, 0.5, 0.26, 0.5);
    P(body, G.ball(1), mat(shade(colour, 0.4)), 0, 0.18, 0, 0.28, 0.16, 0.28);
    P(body, G.cube(), ink, 0.24, 0.1, 0.06, 0.03, 0.05, 0.04);
    P(body, G.cube(), ink, 0.24, 0.1, -0.06, 0.03, 0.05, 0.04);
    if (avatar === "drone") {
      for (const z of [0.36, -0.36]) {
        P(body, G.box(), mat("#5a5f6a"), 0, 0.12, z / 2, 0.05, 0.03, 0.36);
        const rotor = new THREE.Group();
        rotor.position.set(0, 0.17, z);
        P(rotor, G.cube(), mat("#ffffff", { opacity: 0.6 }), 0, 0, 0, 0.34, 0.01, 0.05);
        body.add(rotor);
        spin.push(rotor);
      }
    } else {
      for (const z of [0.42, -0.42]) {
        P(body, G.cube(), mat("#4f6fa8", { shiny: true }), 0, 0.1, z, 0.22, 0.02, 0.32);
        P(body, G.cube(), mat("#c9ccd4"), 0, 0.1, z / 2, 0.03, 0.03, 0.2);
      }
      P(body, G.cyl(5), mat("#c9ccd4"), -0.05, 0.22, 0, 0.02, 0.2, 0.02);
    }
    hand.position.set(0.12, -0.02, -0.1);
    body.add(hand);
  } else {
    hover = 0.4;
    P(body, G.ball(2), mat(shade(colour, 0.5), { basic: true }), 0, 0.2, 0, 0.3, 0.3, 0.3);
    const halo = P(body, G.ball(2), mat(colour, { additive: true, opacity: 0.35 }), 0, 0.2, 0, 0.62, 0.62, 0.62);
    spin.push(halo);
    P(body, G.cube(), ink, 0.14, 0.23, 0.05, 0.02, 0.05, 0.03);
    P(body, G.cube(), ink, 0.14, 0.23, -0.05, 0.02, 0.05, 0.03);
    hand.position.set(0.18, 0.1, -0.12);
    body.add(hand);
  }
  // a soft contact shadow, so a body reads as standing on the ground even without shadow maps
  const blob = P(root, G.plane(), mat("#000000", { opacity: 0.18, map: glowTexture() }), 0, 0.015, 0, 0.55, 1, 0.55);
  blob.castShadow = false;
  blob.receiveShadow = false;
  return { root, body, armL, armR, legL, legR, hand, spin, avatar, hover, held: undefined };
}

// --- creatures -----------------------------------------------------------------

export interface Critter {
  root: THREE.Group;
  body: THREE.Group;
  legs: THREE.Group[];
}

export function animalModel(kind: AnimalKind): Critter {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs: THREE.Group[] = [];
  const ink = mat("#2b2030");
  const legsAt = (m: THREE.Material, len: number, dx: number, dz: number, w = 0.045): void => {
    for (const [x, z] of [[dx, dz], [dx, -dz], [-dx, dz], [-dx, -dz]] as const) {
      const leg = limb(body, m, x, len, z, w, len);
      legs.push(leg);
    }
  };
  switch (kind) {
    case "deer": {
      const hide = mat("#b07a4a");
      legsAt(mat("#8a5a34"), 0.32, 0.17, 0.07);
      P(body, G.box(), hide, 0, 0.3, 0, 0.5, 0.22, 0.2);
      P(body, G.box(), mat("#f3e2c7"), -0.26, 0.42, 0, 0.05, 0.08, 0.08);
      const neck = P(body, G.box(), hide, 0.22, 0.42, 0, 0.09, 0.26, 0.09);
      neck.rotation.z = -0.5;
      P(body, G.box(), hide, 0.36, 0.62, 0, 0.18, 0.1, 0.1);
      P(body, G.cube(), ink, 0.4, 0.68, 0.052, 0.02, 0.02, 0.01);
      P(body, G.cube(), ink, 0.4, 0.68, -0.052, 0.02, 0.02, 0.01);
      const antler = mat("#e8d8b8");
      for (const z of [0.05, -0.05]) {
        const a = P(body, G.box(), antler, 0.32, 0.7, z, 0.025, 0.2, 0.025);
        a.rotation.set(z * 6, 0, 0.3);
        P(body, G.box(), antler, 0.3, 0.8, z * 2, 0.02, 0.1, 0.02).rotation.z = -0.6;
      }
      break;
    }
    case "rabbit": {
      const fur = mat("#a8916f");
      legsAt(fur, 0.06, 0.06, 0.04, 0.04);
      P(body, G.ball(1), fur, 0, 0.12, 0, 0.26, 0.18, 0.18);
      P(body, G.ball(1), fur, 0.13, 0.2, 0, 0.13, 0.12, 0.12);
      for (const z of [0.03, -0.03]) P(body, G.box(), mat("#c9b08a"), 0.11, 0.24, z, 0.03, 0.14, 0.04).rotation.z = 0.25;
      P(body, G.ball(0), mat("#ffffff"), -0.13, 0.15, 0, 0.07, 0.07, 0.07);
      P(body, G.cube(), ink, 0.19, 0.22, 0.04, 0.015, 0.015, 0.01);
      P(body, G.cube(), ink, 0.19, 0.22, -0.04, 0.015, 0.015, 0.01);
      break;
    }
    case "boar": {
      const hide = mat("#5a4033");
      legsAt(mat("#3a2c26"), 0.16, 0.16, 0.08, 0.06);
      P(body, G.box(), hide, 0, 0.14, 0, 0.52, 0.28, 0.28);
      P(body, G.box(), mat("#4a3329"), -0.02, 0.4, 0, 0.36, 0.06, 0.06);
      P(body, G.box(), hide, 0.3, 0.16, 0, 0.16, 0.2, 0.2);
      P(body, G.box(), mat("#d9a0a0"), 0.4, 0.18, 0, 0.05, 0.08, 0.1);
      for (const z of [0.07, -0.07]) P(body, G.cone(4), mat("#f6f0e0"), 0.38, 0.16, z, 0.03, 0.1, 0.03);
      P(body, G.cube(), ink, 0.37, 0.28, 0.06, 0.02, 0.02, 0.01);
      P(body, G.cube(), ink, 0.37, 0.28, -0.06, 0.02, 0.02, 0.01);
      break;
    }
    case "wolf": {
      const fur = mat("#8a8a92");
      legsAt(mat("#6a6a72"), 0.26, 0.16, 0.06);
      P(body, G.box(), fur, 0, 0.24, 0, 0.5, 0.2, 0.18);
      P(body, G.box(), fur, 0.3, 0.34, 0, 0.16, 0.15, 0.15);
      P(body, G.box(), mat("#b0b0b8"), 0.42, 0.3, 0, 0.12, 0.07, 0.08);
      for (const z of [0.05, -0.05]) P(body, G.cone(4), fur, 0.28, 0.48, z, 0.05, 0.1, 0.04);
      const tail = P(body, G.box(), fur, -0.3, 0.32, 0, 0.05, 0.22, 0.05);
      tail.rotation.z = 1.0;
      P(body, G.cube(), mat("#ffd36b", { basic: true }), 0.385, 0.38, 0.05, 0.015, 0.02, 0.012);
      P(body, G.cube(), mat("#ffd36b", { basic: true }), 0.385, 0.38, -0.05, 0.015, 0.02, 0.012);
      break;
    }
    case "heron": {
      const grey = mat("#b9bec9");
      for (const z of [0.03, -0.03]) legs.push(limb(body, mat("#5b5560"), 0, 0.34, z, 0.02, 0.34));
      P(body, G.ball(1), grey, 0, 0.42, 0, 0.3, 0.17, 0.16);
      const neck = P(body, G.box(), grey, 0.12, 0.46, 0, 0.04, 0.24, 0.04);
      neck.rotation.z = -0.25;
      P(body, G.ball(1), mat("#c9ced8"), 0.17, 0.7, 0, 0.08, 0.07, 0.07);
      P(body, G.cone(4), mat("#e0a040"), 0.2, 0.69, 0, 0.025, 0.16, 0.025).rotation.z = -Math.PI / 2;
      P(body, G.box(), mat("#3a3a48"), 0.15, 0.72, 0, 0.1, 0.015, 0.012);
      break;
    }
    case "fish": {
      P(body, G.ball(1), mat("#f08a4a"), 0, 0.05, 0, 0.24, 0.1, 0.08);
      P(body, G.cone(4), mat("#e06a3a"), -0.14, 0.05, 0, 0.02, 0.1, 0.1).rotation.z = Math.PI / 2;
      break;
    }
  }
  return { root, body, legs };
}

/** A small tied sack: what someone left behind when they fell. */
export function bagModel(): THREE.Group {
  const g = new THREE.Group();
  P(g, G.ball(1), mat("#b08a5a"), 0, 0.12, 0, 0.3, 0.26, 0.3);
  P(g, G.cone(6), mat("#9a7448"), 0, 0.22, 0, 0.14, 0.12, 0.14);
  P(g, G.cyl(6), mat("#5a4030"), 0, 0.23, 0, 0.1, 0.03, 0.1);
  return g;
}

export function signpost(): THREE.Group {
  const g = new THREE.Group();
  P(g, G.box(), mat("#7a5233"), 0, 0, 0, 0.05, 0.62, 0.05);
  P(g, G.box(), mat("#e9d6ae"), 0.02, 0.44, 0.12, 0.04, 0.14, 0.32);
  P(g, G.cone(3), mat("#ff8a65", { double: true }), 0, 0.62, 0, 0.04, 0.06, 0.04);
  return g;
}

export function picnic(): THREE.Group {
  const g = new THREE.Group();
  P(g, G.box(), mat("#e86a5a"), 0, 0, 0, 0.5, 0.012, 0.5);
  P(g, G.box(), mat("#fff3e8"), -0.125, 0.004, -0.125, 0.25, 0.012, 0.25);
  P(g, G.box(), mat("#fff3e8"), 0.125, 0.004, 0.125, 0.25, 0.012, 0.25);
  P(g, G.box(), mat("#c98a4a"), 0.05, 0.012, -0.05, 0.16, 0.1, 0.12);
  P(g, G.prism(), mat("#a87040"), 0.05, 0.11, -0.05, 0.16, 0.05, 0.12);
  return g;
}

// --- tools ---------------------------------------------------------------------

const STONE = "#8f8a80";
const IRON = "#c0c6cf";

/** A tool as held: the handle runs up +Y from the grip at the origin. */
export function toolModel(kind: ToolKind | null): THREE.Group {
  const g = new THREE.Group();
  const handle = mat("#7a5233");
  switch (kind) {
    case "axe":
    case "ironaxe": {
      P(g, G.cyl(6), handle, 0, -0.06, 0, 0.035, 0.48, 0.035);
      P(g, G.box(), mat(kind === "axe" ? STONE : IRON), 0.06, 0.32, 0, 0.14, 0.1, 0.03);
      P(g, G.box(), mat(kind === "axe" ? "#6f6a60" : "#e6eaf0"), 0.13, 0.31, 0, 0.02, 0.12, 0.035);
      break;
    }
    case "pick":
    case "ironpick": {
      P(g, G.cyl(6), handle, 0, -0.06, 0, 0.035, 0.5, 0.035);
      const head = P(g, G.box(), mat(kind === "pick" ? STONE : IRON), 0, 0.38, 0, 0.34, 0.05, 0.04);
      head.rotation.z = 0.08;
      break;
    }
    case "bucket": {
      P(g, G.cyl(10), mat("#a0723f"), 0.02, -0.18, 0, 0.18, 0.16, 0.18);
      P(g, G.cyl(10), mat("#5bb6e8"), 0.02, -0.04, 0, 0.15, 0.01, 0.15);
      const bail = P(g, G.arc(), mat("#8a8f99"), 0.02, -0.02, 0, 0.17, 0.2, 0.17);
      bail.rotation.y = Math.PI / 2;
      break;
    }
    case "spear": {
      P(g, G.cyl(6), handle, 0, -0.3, 0, 0.03, 0.95, 0.03);
      P(g, G.cone(4), mat(STONE), 0, 0.65, 0, 0.06, 0.14, 0.03);
      break;
    }
    case "bow": {
      const arc = P(g, G.arc(), mat("#8a5a34"), 0, 0.05, 0, 0.5, 0.6, 0.5);
      arc.rotation.z = -Math.PI / 2;
      P(g, G.box(), mat("#f3e2c7"), -0.0, -0.25, 0, 0.005, 0.6, 0.005);
      break;
    }
    case "drill": {
      P(g, G.box(), mat("#3a3550"), -0.02, -0.08, 0, 0.07, 0.14, 0.07);
      P(g, G.box(), mat("#f2c14e"), 0.0, 0.06, 0, 0.18, 0.12, 0.1);
      const bit = P(g, G.cone(6), mat(IRON), 0.09, 0.12, 0, 0.05, 0.22, 0.05);
      bit.rotation.z = -Math.PI / 2;
      break;
    }
    default:
      break;
  }
  return g;
}

/** The first-person view model: a forearm and hand, holding `kind` if any. */
export function viewModel(kind: ToolKind | null, sleeve: string): { root: THREE.Group; tool: THREE.Group } {
  const root = new THREE.Group();
  P(root, G.box(), mat(sleeve), 0, -0.42, 0, 0.11, 0.36, 0.11);
  P(root, G.box(), mat("#ffe0c2"), 0, -0.07, 0, 0.1, 0.1, 0.12);
  const tool = toolModel(kind);
  tool.position.set(0.0, -0.04, 0);
  tool.rotation.z = -0.2;
  root.add(tool);
  if (!kind) {
    // bare hands: a second, open hand on the left, so the empty view still reads as a body
    P(root, G.box(), mat("#ffe0c2"), -0.04, 0.0, 0, 0.06, 0.05, 0.1);
  }
  return { root, tool };
}
