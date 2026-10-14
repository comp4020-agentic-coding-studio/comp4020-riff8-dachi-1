// The world renderer: a Three.js scene with its own requestAnimationFrame loop,
// reading the client's state directly (React never sees per-entity updates).
// One scene, three cameras over it (first person, third-person chase,
// isometric), and one targeting interface shared by all three, so the camera
// never changes what a click means or how far the avatar can reach: reach is
// the server's rule, measured from the avatar.
//
// Coordinates: tile (x, y) is world X = x, Z = y; one tile is one world unit
// (about two metres); Y is up. Models come from ./models.ts.
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { ANIMALS, BUILDINGS, HARVEST_RANGE, PACES, STAGES, TOOLS, buildingName, type Emote, type StageDef } from "../shared/content.ts";
import type { Animal, Building, Player, Snapshot, Tile } from "../shared/protocol.ts";
import { effectiveLife, lifeCap, placementProblem } from "../shared/sim.ts";
import type { GameClient } from "./net.ts";
import { G, animalModel, bagModel, buildingModel, disposeKit, galaxyTexture, glowTexture, hash, mat, picnic, playerRig, scaffold, signpost, viewModel, type Critter, type Model, type Rig } from "./models.ts";
import { PLAYER_COLOURS, type CameraMode, type View } from "./view.ts";

export type { CameraMode, Tool, View } from "./view.ts";
export { PLAYER_COLOURS } from "./view.ts";

const EMOTE_GLYPH: Record<Emote, string> = { wave: "👋", heart: "💛", laugh: "😄", wow: "😮", sad: "😢", point: "👉" };
const ISO_ELEVATION = Math.atan(1 / Math.SQRT2); // the classic 2:1 isometric angle
const EYE: Record<string, number> = { person: 0.8, suit: 0.82, drone: 0.75, probe: 0.75, wisp: 0.65 };
const SOIL: Record<string, string> = { earth: "#8a6a4a", mars: "#8a4a32", sun: "#4a4450", system: "#55525f", universe: "#2e2a44" };
const LOOK_SPEED = 0.0024;

type RGB = [number, number, number];
const colourOf = (c: RGB, out = new THREE.Color()): THREE.Color => out.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
const lerpRGB = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const hexRGB = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const r = (a: number, b: number): number => hash((a * 73856093) ^ (b * 19349663) ^ seed);
  const s = (f: number): number => f * f * (3 - 2 * f);
  const fx = s(x - xi);
  const fy = s(y - yi);
  const top = r(xi, yi) + (r(xi + 1, yi) - r(xi, yi)) * fx;
  const bot = r(xi, yi + 1) + (r(xi + 1, yi + 1) - r(xi, yi + 1)) * fx;
  return top + (bot - top) * fy;
}

/** A batch of identical props drawn as one InstancedMesh, remembering which tile each instance belongs to. */
class Batch {
  mesh: THREE.InstancedMesh;
  tiles: number[] = [];
  private n = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sv = new THREE.Vector3();
  constructor(geo: THREE.BufferGeometry, material: THREE.Material, cap: number, shadow = true) {
    this.mesh = new THREE.InstancedMesh(geo, material, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = shadow;
    this.mesh.userData.tileOf = (k: number): number | undefined => this.tiles[k];
  }
  begin(): void {
    this.n = 0;
    this.tiles.length = 0;
  }
  add(tile: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, colour?: THREE.Color, rx = 0, rz = 0): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(x, y, z), this.q, this.sv.set(sx, sy, sz));
    this.mesh.setMatrixAt(this.n, this.m);
    if (colour) this.mesh.setColorAt(this.n, colour);
    this.tiles[this.n] = tile;
    this.n++;
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.boundingSphere = null;
  }
  dispose(): void {
    this.mesh.dispose();
  }
}

interface BuildingView {
  group: THREE.Group;
  model: Model;
  key: string;
  body: THREE.Group;
  scaffold: THREE.Group | null;
  label: HTMLDivElement;
  labelObj: CSS2DObject;
  faded: boolean;
  h: number;
}

interface PlayerView {
  rig: Rig;
  key: string;
  label: HTMLDivElement;
  emote: HTMLDivElement;
  labelObj: CSS2DObject;
  emoteObj: CSS2DObject;
  last: [number, number];
  y: number;
  speed: number;
  phase: number;
  heading: number;
}

interface AnimalView {
  c: Critter;
  x: number;
  y: number;
  dead: boolean;
  phase: number;
  proxy: THREE.Mesh;
}

interface Fx {
  el: HTMLDivElement;
  obj: CSS2DObject;
  dust: THREE.Mesh[];
  vel: THREE.Vector3[];
  t0: number;
  x: number;
  y: number;
  z: number;
}

export interface Aim {
  tile: [number, number] | null;
  building: Building | null;
  animal: Animal | null;
}

export class Renderer3D {
  mode: CameraMode;
  frameMs = 0;
  /** what the crosshair (or pointer, in isometric) would do: plain text, also drawn by the renderer */
  hint = "";
  /** bumps whenever moveBasis() turns enough that held movement should be re-sent */
  basisVersion = 0;
  yaw = -0.75 * Math.PI; // facing tile (-1, -1): the same "up" as the isometric view
  pitch = -0.18;
  isoRot = 0;

  private canvas: HTMLCanvasElement;
  private client: GameClient;
  private view: View;
  private gl: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private hintEl: HTMLDivElement;
  private flashEl: HTMLDivElement;
  private scene = new THREE.Scene();
  private persp = new THREE.PerspectiveCamera(75, 1, 0.05, 220);
  private ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -100, 300);
  private raycaster = new THREE.Raycaster();
  private raf = 0;
  private last = performance.now();
  private lost = false;
  private worldKey = "";
  private stage: StageDef = STAGES[0];
  private w = 0;

  // world-lifetime objects (rebuilt with each stage)
  private world = new THREE.Group();
  private pickables = new THREE.Group();
  private hemi = new THREE.HemisphereLight("#fff4dd", "#6b8a4a", 1.3);
  private sun = new THREE.DirectionalLight("#fff0d0", 2.2);
  private coreLight = new THREE.PointLight("#ffcc66", 0, 0, 0);
  private skyTex: THREE.CanvasTexture | null = null;
  private stars: THREE.Points | null = null;
  private turf: THREE.InstancedMesh | null = null;
  private soil: THREE.InstancedMesh | null = null;
  private core: THREE.InstancedMesh | null = null;
  private water: THREE.InstancedMesh | null = null;
  private batches: Record<string, Batch> = {};
  private galaxies: { sprite: THREE.Sprite; tile: number; spin: number }[] = [];
  private coreGlow: THREE.Sprite | null = null;
  private heights: Float32Array = new Float32Array(0);
  private bases: Float32Array = new Float32Array(0);
  private pondLevel = 0.1;
  private sigs: string[] = [];
  private seenVersion = -1;
  private cap = 100;
  private coreTiles: number[] = [];
  private decor = new THREE.Group();
  private birds: THREE.Group[] = [];
  private clouds: THREE.Mesh[] = [];

  private buildings = new Map<number, BuildingView>();
  private players = new Map<string, PlayerView>();
  private animals = new Map<number, AnimalView>();
  private bags = new Map<number, THREE.Group>();
  private marks = new Map<number, { group: THREE.Group; label: HTMLDivElement; obj: CSS2DObject; landmark: boolean }>();
  private ghostLabels: CSS2DObject[] = [];
  private survey = new Map<number, { obj: CSS2DObject; el: HTMLDivElement }>();
  private surveyOn = false;
  private fx: Fx[] = [];

  // targeting and previews
  private outline: THREE.LineSegments;
  private ghost: { group: THREE.Group; key: string } | null = null;
  private ghostOk = mat("#7be08a", { opacity: 0.45 });
  private ghostBad = mat("#ff6b5a", { opacity: 0.45 });
  private ghostFoot: THREE.Mesh;
  private markers: Batch;
  private faded = new Map<THREE.Material, THREE.Material>();
  private hidden = new THREE.MeshBasicMaterial({ visible: false });

  // first person
  private hands: { root: THREE.Group; tool: THREE.Group; key: string } | null = null;
  private jumpAt = -10;
  private walkPhase = 0;
  private aimCache: Aim = { tile: null, building: null, animal: null };
  private aimPoint = new THREE.Vector3();
  private lastBasis: [number, number] = [0, 0];
  private boundaryAt = -1e9;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInit = false;
  private touchLook: { id: number; x: number; y: number } | null = null;
  private dprSeen = 0;

  constructor(canvas: HTMLCanvasElement, client: GameClient, view: View) {
    this.canvas = canvas;
    this.client = client;
    this.view = view;
    this.mode = view.mode;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.labels = new CSS2DRenderer();
    const le = this.labels.domElement;
    le.className = "world-labels";
    le.setAttribute("aria-hidden", "true");
    canvas.after(le);
    this.hintEl = document.createElement("div");
    this.hintEl.className = "aim-hint";
    this.hintEl.setAttribute("role", "status");
    le.after(this.hintEl);
    this.flashEl = document.createElement("div");
    this.flashEl.className = "world-flash";
    this.flashEl.setAttribute("aria-hidden", "true");
    this.hintEl.after(this.flashEl);

    this.scene.add(this.world, this.hemi, this.sun, this.sun.target, this.coreLight, this.persp);
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;

    const sq = new THREE.BufferGeometry().setFromPoints(
      [[-0.5, -0.5], [0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    );
    this.outline = new THREE.LineSegments(sq, new THREE.LineBasicMaterial({ color: "#fffbe0", depthTest: false, transparent: true }));
    this.outline.renderOrder = 10;
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.ghostFoot = new THREE.Mesh(G.box(), this.ghostOk);
    this.ghostFoot.visible = false;
    this.scene.add(this.ghostFoot);
    this.markers = new Batch(G.cone(4), mat("#fffbe0", { additive: true, opacity: 0.9, top: true }), 400, false);
    this.markers.mesh.renderOrder = 11;
    this.scene.add(this.markers.mesh);

    client.onTile = (i, before, after) => this.tileFx(i, before - after);
    client.onBoundary = () => {
      this.boundaryAt = performance.now();
      this.clearFx();
    };
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
    document.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("pointerdown", this.onTouchDown);
    canvas.addEventListener("pointermove", this.onTouchMove);
    canvas.addEventListener("pointerup", this.onTouchUp);
    canvas.addEventListener("pointercancel", this.onTouchUp);
  }

  // --- lifecycle -------------------------------------------------------------

  start(): void {
    const loop = (now: number): void => {
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    document.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("pointerdown", this.onTouchDown);
    this.canvas.removeEventListener("pointermove", this.onTouchMove);
    this.canvas.removeEventListener("pointerup", this.onTouchUp);
    this.canvas.removeEventListener("pointercancel", this.onTouchUp);
    if (this.client.onTile) this.client.onTile = null;
    this.clearWorld();
    this.markers.dispose();
    this.outline.geometry.dispose();
    (this.outline.material as THREE.Material).dispose();
    for (const m of this.faded.values()) m.dispose();
    this.hidden.dispose();
    disposeKit();
    this.gl.dispose();
    this.labels.domElement.remove();
    this.hintEl.remove();
    this.flashEl.remove();
  }

  private onLost = (e: Event): void => {
    e.preventDefault();
    this.lost = true;
  };

  private onRestored = (): void => {
    this.lost = false;
    this.worldKey = ""; // rebuild everything against the fresh context
  };

  setMode(m: CameraMode): void {
    if (m === this.mode) return;
    // keep looking the same way across a switch
    if (m === "iso") this.isoRot = ((Math.round((this.yaw + 0.75 * Math.PI) / (Math.PI / 2)) % 4) + 4) % 4;
    else if (this.mode === "iso") this.yaw = -0.75 * Math.PI + this.isoRot * (Math.PI / 2);
    this.mode = m;
    this.view.mode = m;
    this.camInit = false;
    this.basisVersion++;
  }

  rotateIso(dir: number): void {
    this.isoRot = (((this.isoRot + Math.sign(dir)) % 4) + 4) % 4;
    this.basisVersion++;
  }

  /** A little hop: purely cosmetic and local. The server never hears about it and nothing about movement or reach changes. */
  jump(): void {
    const now = performance.now() / 1000;
    if (now - this.jumpAt > 0.5) this.jumpAt = now;
  }

  /** Forward and right unit vectors in tile (x, y) space for the current camera. */
  moveBasis(): { fx: number; fy: number; rx: number; ry: number } {
    const a = this.mode === "iso" ? -0.75 * Math.PI + this.isoRot * (Math.PI / 2) : this.yaw;
    const fx = Math.cos(a);
    const fy = Math.sin(a);
    return { fx, fy, rx: -fy, ry: fx };
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas || this.mode === "iso") return;
    this.look(e.movementX, e.movementY);
  };

  private look(mx: number, my: number): void {
    const k = LOOK_SPEED * this.view.sensitivity;
    this.yaw += mx * k;
    this.pitch -= my * k * (this.view.invertY ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.35, this.pitch));
    if (Math.abs(this.yaw - this.lastBasis[0]) > 0.06) {
      this.lastBasis[0] = this.yaw;
      this.basisVersion++;
    }
  }

  // touch screens have no pointer lock: a drag looks around in first and third person
  private onTouchDown = (e: PointerEvent): void => {
    if (e.pointerType === "touch" && this.mode !== "iso") this.touchLook = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  private onTouchMove = (e: PointerEvent): void => {
    const t = this.touchLook;
    if (!t || t.id !== e.pointerId) return;
    this.look((e.clientX - t.x) * 1.6, (e.clientY - t.y) * 1.6);
    t.x = e.clientX;
    t.y = e.clientY;
  };
  private onTouchUp = (e: PointerEvent): void => {
    if (this.touchLook?.id === e.pointerId) this.touchLook = null;
  };

  // --- targeting -------------------------------------------------------------

  private get camera(): THREE.Camera {
    return this.mode === "iso" ? this.ortho : this.persp;
  }

  private rayAt(sx: number, sy: number): THREE.Intersection[] {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.raycaster.setFromCamera(new THREE.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1), this.camera);
    this.raycaster.camera = this.camera;
    return this.raycaster.intersectObject(this.pickables, true);
  }

  private hitOf(hit: THREE.Intersection | undefined): { tile?: [number, number]; building?: Building; animal?: Animal; point?: THREE.Vector3 } {
    const s = this.client.state;
    if (!s || !hit) return {};
    let o: THREE.Object3D | null = hit.object;
    while (o && o !== this.pickables) {
      const ud = o.userData;
      if (ud.building !== undefined) {
        const b = s.buildings.find((q) => q.id === ud.building);
        if (b) return { building: b, tile: [b.x, b.y], point: hit.point };
      }
      if (ud.animal !== undefined) {
        const a = (s.animals ?? []).find((q) => q.id === ud.animal);
        if (a) return { animal: a, tile: [Math.round(a.x), Math.round(a.y)], point: hit.point };
      }
      if (ud.tile !== undefined) return { tile: [ud.tile % s.w, Math.floor(ud.tile / s.w)], point: hit.point };
      if (ud.tileOf && hit.instanceId !== undefined) {
        const i = (ud.tileOf as (k: number) => number | undefined)(hit.instanceId);
        if (i !== undefined) return { tile: [i % s.w, Math.floor(i / s.w)], point: hit.point };
      }
      o = o.parent;
    }
    return {};
  }

  /** The tile under a screen point (CSS px from the canvas corner), or null off the world. */
  pick(sx: number, sy: number): [number, number] | null {
    const s = this.client.state;
    if (!s) return null;
    const hit = this.hitOf(this.rayAt(sx, sy)[0]);
    if (hit.tile) return hit.tile;
    // nothing solid (open space): fall back to the ground plane, so relays can still go in the void
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return null;
    const x = Math.round(p.x);
    const y = Math.round(p.z);
    return x >= 0 && y >= 0 && x < s.w && y < s.w ? [x, y] : null;
  }

  /** The front-most building under a screen point, if the first thing hit is a building. */
  pickBuilding(sx: number, sy: number): Building | null {
    return this.hitOf(this.rayAt(sx, sy)[0]).building ?? null;
  }

  /** The front-most creature (alive or a carcass) under a screen point. */
  pickAnimal(sx: number, sy: number): Animal | null {
    return this.hitOf(this.rayAt(sx, sy)[0]).animal ?? null;
  }

  /** What the crosshair points at (first and third person), or what the pointer hovers (isometric). */
  aim(): Aim {
    return this.aimCache;
  }

  private computeAim(s: Snapshot): void {
    if (this.mode === "iso") {
      const tile = this.view.keyboardTarget ? this.facingTile() : this.view.hover;
      const b = tile ? s.tiles[tile[1] * s.w + tile[0]]?.b : 0;
      this.aimCache = { tile, building: b ? (s.buildings.find((q) => q.id === b) ?? null) : null, animal: null };
      return;
    }
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const hit = this.hitOf(this.rayAt(w / 2, h / 2)[0]);
    let tile = hit.tile ?? null;
    if (!tile) {
      const p = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) && p.distanceTo(this.raycaster.ray.origin) < 40) {
        const x = Math.round(p.x);
        const y = Math.round(p.z);
        if (x >= 0 && y >= 0 && x < s.w && y < s.w) tile = [x, y];
      }
    }
    if (hit.point) this.aimPoint.copy(hit.point);
    this.aimCache = { tile, building: hit.building ?? null, animal: hit.animal ?? null };
  }

  /** The tile in front of the avatar: where keyboard building and harvesting aim. */
  facingTile(): [number, number] | null {
    const s = this.client.state;
    const p = s?.players[this.client.you];
    if (!s || !p) return null;
    const a = this.mode === "iso" ? (p.facing / 8) * Math.PI * 2 : this.yaw;
    return [Math.round(this.client.me.x + Math.cos(a) * 1.2), Math.round(this.client.me.y + Math.sin(a) * 1.2)];
  }

  target(): [number, number] | null {
    if (this.mode !== "iso") return this.aimCache.tile ?? this.facingTile();
    return this.view.keyboardTarget ? this.facingTile() : this.view.hover;
  }

  // --- world building ----------------------------------------------------------

  private tileTop(i: number): number {
    return this.heights[i] ?? 0;
  }

  /** Where a body stands at (x, y): the tile's top, the pond's shallows, or open space. */
  private groundAt(x: number, y: number): number {
    const s = this.client.state;
    if (!s) return 0;
    const tx = Math.max(0, Math.min(s.w - 1, Math.round(x)));
    const ty = Math.max(0, Math.min(s.w - 1, Math.round(y)));
    const i = ty * s.w + tx;
    const t = s.tiles[i];
    if (!t) return 0;
    if (t.t === 2) return 0;
    if (t.t === 1) return this.stage.id === "earth" ? this.waterY(t) - 0.18 : 0;
    if (t.b) {
      const b = this.buildings.get(t.b);
      if (b) return b.group.position.y + (s.buildings.find((q) => q.id === t.b)?.type === "plaza" ? 0.04 : 0);
    }
    return this.tileTop(i);
  }

  private waterY(t: Tile): number {
    const full = t.init ? t.amt / t.init : 0;
    const bed = this.pondLevel - 0.32;
    return bed + 0.03 + (this.pondLevel - bed - 0.03) * full;
  }

  private clearWorld(): void {
    for (const b of this.buildings.values()) this.dropBuilding(b);
    this.buildings.clear();
    for (const p of this.players.values()) {
      p.labelObj.removeFromParent();
      p.emoteObj.removeFromParent();
      p.label.remove();
      p.emote.remove();
    }
    this.players.clear();
    this.animals.clear();
    this.bags.clear();
    for (const m of this.marks.values()) {
      m.obj.removeFromParent();
      m.label.remove();
    }
    this.marks.clear();
    for (const g of this.ghostLabels) {
      g.removeFromParent();
      g.element.remove();
    }
    this.ghostLabels = [];
    for (const v of this.survey.values()) {
      v.obj.removeFromParent();
      v.el.remove();
    }
    this.survey.clear();
    this.clearFx();
    for (const b of Object.values(this.batches)) b.dispose();
    this.batches = {};
    for (const g of this.galaxies) (g.sprite.material as THREE.Material).dispose();
    this.galaxies = [];
    if (this.coreGlow) (this.coreGlow.material as THREE.Material).dispose();
    this.coreGlow = null;
    for (const m of [this.turf, this.soil, this.core, this.water]) {
      if (!m) continue;
      m.dispose();
      // the shared kit owns the water plane; the terrain columns and their materials are this world's own
      if (m !== this.water) m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.turf = this.soil = this.core = this.water = null;
    if (this.stars) {
      this.stars.geometry.dispose();
      (this.stars.material as THREE.Material).dispose();
    }
    this.stars = null;
    this.skyTex?.dispose();
    this.skyTex = null;
    this.birds = [];
    this.clouds = [];
    if (this.hands) this.hands.root.removeFromParent();
    this.hands = null;
    if (this.ghost) this.ghost.group.removeFromParent();
    this.ghost = null;
    this.world.clear();
    this.pickables = new THREE.Group();
    this.decor = new THREE.Group();
    this.world.add(this.pickables, this.decor);
    this.sigs = [];
    this.seenVersion = -1;
  }

  private buildWorld(s: Snapshot): void {
    this.clearWorld();
    const st = STAGES[s.stage];
    this.stage = st;
    this.w = s.w;
    const w = s.w;
    const n = w * w;
    const seed = (s.seed ^ (s.stage * 7919)) | 0;
    const c = (w - 1) / 2;

    // heights: rolling ground on the islands, flat decks in the corona, slabs in the belt
    this.heights = new Float32Array(n);
    this.bases = new Float32Array(n);
    const coreR = Math.sqrt(st.families.matter.tiles / Math.PI) + 0.6;
    for (let i = 0; i < n; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      const t = s.tiles[i];
      const edge = Math.min(x, y, w - 1 - x, w - 1 - y) / (w / 2);
      const r = hash(i + seed);
      let h = 0;
      let base = -0.5;
      if (st.id === "earth" || st.id === "mars") {
        const amp = st.id === "earth" ? 0.6 : 0.8;
        const nz = vnoise(x / 5, y / 5, seed) * 0.75 + vnoise(x / 2.2, y / 2.2, seed + 1) * 0.25;
        h = 0.1 + amp * nz * (0.45 + 0.55 * Math.min(1, edge * 2.2));
        h = Math.round(h / 0.07) * 0.07;
        base = -0.5 - 2.2 * Math.min(1, edge * 1.4) * (0.55 + 0.45 * r);
      } else if (st.id === "sun") {
        h = 0.05 + r * 0.03;
        base = h - 0.14;
        if (t.t === 3) {
          const d = Math.hypot(x - c, y - c) / coreR;
          h = 0.3 + 2.4 * Math.sqrt(Math.max(0, 1 - d * d));
          base = -0.6;
        }
      } else if (st.id === "system") {
        h = t.t === 4 ? 0.05 + r * 0.25 : 0.06 + vnoise(x / 3, y / 3, seed) * 0.3;
        base = h - 0.35 - 0.5 * r;
      } else {
        h = t.t === 4 ? 0.04 + r * 0.14 : 0.02;
        base = h - 0.2 - 0.25 * r;
      }
      this.heights[i] = h;
      this.bases[i] = base;
    }
    // the pond sits in a hollow at one level, a little under its lowest bank
    let pond = Infinity;
    s.tiles.forEach((t, i) => {
      if (t.t !== 1) return;
      const x = i % w;
      const y = Math.floor(i / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * w + (x + dx);
        if (x + dx < 0 || y + dy < 0 || x + dx >= w || y + dy >= w) continue;
        if (s.tiles[j].t === 0) pond = Math.min(pond, this.heights[j]);
      }
    });
    this.pondLevel = Number.isFinite(pond) ? pond - 0.05 : 0.08;
    s.tiles.forEach((t, i) => {
      if (t.t === 1 && st.id === "earth") this.heights[i] = this.pondLevel - 0.32;
    });

    // terrain: a turf cap and a soil column per tile, instanced; the star's core glows on its own
    const colGeo = (): THREE.BufferGeometry => {
      const g = new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0);
      const nrm = g.getAttribute("normal");
      const col = new Float32Array(nrm.count * 3);
      for (let k = 0; k < nrm.count; k++) {
        const ny = nrm.getY(k);
        const v = ny > 0.5 ? 1 : ny < -0.5 ? 0.55 : 0.8;
        col.set([v, v, v], k * 3);
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return g;
    };
    const turfGeo = colGeo();
    const soilGeo = colGeo();
    const turfMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const soilMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.turf = new THREE.InstancedMesh(turfGeo, turfMat, n);
    this.soil = new THREE.InstancedMesh(soilGeo, soilMat, n);
    for (const m of [this.turf, this.soil]) {
      m.frustumCulled = false;
      m.receiveShadow = true;
      m.castShadow = true;
      m.userData.tileOf = (k: number): number => k;
      this.pickables.add(m);
    }
    this.turf.castShadow = false;
    this.coreTiles = [];
    s.tiles.forEach((t, i) => t.t === 3 && this.coreTiles.push(i));
    if (this.coreTiles.length) {
      this.core = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: "#ffffff" }), this.coreTiles.length);
      this.core.frustumCulled = false;
      this.core.userData.tileOf = (k: number): number | undefined => this.coreTiles[k];
      this.pickables.add(this.core);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#ffd27a", blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      glow.position.set(c, 1.6, c);
      this.coreGlow = glow;
      this.decor.add(glow);
      this.coreLight.position.set(c, 3, c);
    }
    const waterTiles = st.id === "earth" ? s.tiles.filter((t) => t.t === 1).length : 0;
    if (waterTiles) {
      this.water = new THREE.InstancedMesh(G.plane(), new THREE.MeshPhongMaterial({ color: "#5bb6e8", transparent: true, opacity: 0.72, shininess: 120, specular: new THREE.Color("#ffffff"), depthWrite: false }), n);
      this.water.frustumCulled = false;
      this.water.receiveShadow = true;
      this.water.userData.tileOf = (k: number): number | undefined => this.waterTiles[k];
      this.pickables.add(this.water);
    }

    // props: one batch per kind, rebuilt whenever any tile changes
    const cap = n;
    const B = (name: string, geo: THREE.BufferGeometry, material: THREE.Material, k: number, shadow = true): void => {
      const b = new Batch(geo, material, Math.max(16, Math.round(cap * k)), shadow);
      this.batches[name] = b;
      this.pickables.add(b.mesh);
    };
    const white = (o: Parameters<typeof mat>[1] = {}): THREE.Material => mat("#ffffff", o);
    B("trunk", G.cyl(6), mat("#7a5233"), 0.4);
    B("canopy", G.dodeca(), white(), 0.4);
    B("canopy2", G.ball(0), white(), 0.4);
    B("stump", G.cyl(8), mat("#8a6a4a"), 0.1);
    B("stumpTop", G.cyl(8), mat("#d6b07a"), 0.1, false);
    B("rock", G.dodeca(), white(), 0.25);
    B("crystal", G.octa(), white({ e: 0.6 }), 0.25);
    B("mound", G.ball(1), white(), 0.25);
    B("pool", G.cyl(10), white({ opacity: 0.85 }), 0.12, false);
    B("ice", G.octa(), mat("#eaf8ff", { shiny: true }), 0.2);
    B("tuft", G.cone(4), white(), 0.5);
    B("flower", G.ball(0), white({ basic: true }), 0.2, false);
    B("plasma", G.cone(5), mat("#fff6c8", { basic: true }), 0.12, false);
    B("comet", G.ball(1), mat("#eef8ff", { e: 0.3 }), 0.1);
    B("tail", G.cone(6), mat("#cfe8ff", { additive: true, opacity: 0.5 }), 0.1, false);
    B("cloud", G.ball(1), mat("#6fd0ff", { additive: true, opacity: 0.35 }), 0.1, false);
    B("dust", G.cyl(12), mat("#2e2a44"), 0.15, false);

    // sky, fog, light
    const sky = document.createElement("canvas");
    sky.width = 2;
    sky.height = 256;
    const sctx = sky.getContext("2d")!;
    const grad = sctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, st.palette.sky[0]);
    grad.addColorStop(1, st.palette.sky[1]);
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 2, 256);
    this.skyTex = new THREE.CanvasTexture(sky);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyTex;
    const LIGHT: Record<string, [string, string, number, string, number]> = {
      earth: ["#fff4dd", "#6b8a4a", 1.5, "#fff0d0", 2.4],
      mars: ["#ffd9c0", "#7a3a2a", 1.4, "#ffe0c0", 2.2],
      sun: ["#ffd27a", "#5a1a10", 1.3, "#ffe7b0", 1.2],
      system: ["#a9b4e8", "#24242e", 1.1, "#cfd8ff", 1.4],
      universe: ["#a89ae8", "#0a0820", 1.1, "#e6e0ff", 1.0],
    };
    const [hs, hg, hi, ds, di] = LIGHT[st.id];
    this.hemi.color.set(hs);
    this.hemi.groundColor.set(hg);
    this.hemi.intensity = hi;
    this.hemi.userData.base = hi;
    this.sun.color.set(ds);
    this.sun.intensity = di;
    this.sun.userData.base = di;
    this.sun.position.set(c - w * 0.45, w * 0.9, c - w * 0.2);
    this.sun.target.position.set(c, 0, c);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -w * 0.75;
    sc.right = sc.top = w * 0.75;
    sc.near = 1;
    sc.far = w * 3;
    sc.updateProjectionMatrix();
    this.coreLight.intensity = 0;
    const fogCol = new THREE.Color(st.id === "earth" ? "#e9efe6" : st.id === "mars" ? "#d89a78" : st.id === "sun" ? "#c8642a" : st.palette.sky[1]);
    this.scene.fog = new THREE.Fog(fogCol, 24, 70);

    // stars beyond everything, off Earth and Mars
    if (st.id !== "earth" && st.id !== "mars") {
      const count = st.id === "sun" ? 200 : 1600;
      const pos = new Float32Array(count * 3);
      for (let k = 0; k < count; k++) {
        const u = hash(k * 3 + 1) * 2 - 1;
        const th = hash(k * 5 + 2) * Math.PI * 2;
        const r = 120;
        const q = Math.sqrt(1 - u * u);
        pos.set([c + Math.cos(th) * q * r, u * r * 0.8 + 10, c + Math.sin(th) * q * r], k * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: "#ffffff", size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9 }));
      this.decor.add(this.stars);
    }

    // a little life in the air on Earth: birds over the land, clouds below the island's rim
    if (st.id === "earth") {
      for (let k = 0; k < 10; k++) {
        const bird = new THREE.Group();
        const wing = mat("#5a5060");
        for (const sgn of [-1, 1]) {
          const hinge = new THREE.Group();
          const m = new THREE.Mesh(G.cube(), wing);
          m.scale.set(0.06, 0.01, 0.18);
          m.position.z = sgn * 0.09;
          hinge.add(m);
          hinge.userData.sgn = sgn;
          bird.add(hinge);
        }
        const torso = new THREE.Mesh(G.ball(0), wing);
        torso.scale.set(0.11, 0.04, 0.04);
        bird.add(torso);
        bird.userData.k = k;
        this.birds.push(bird);
        this.decor.add(bird);
      }
      const cloudMat = mat("#ffffff", { opacity: 0.85 });
      for (let k = 0; k < 14; k++) {
        const a = hash(k * 11) * Math.PI * 2;
        const r = w * (0.62 + hash(k * 13) * 0.35);
        const m = new THREE.Mesh(G.ball(1), cloudMat);
        m.position.set(c + Math.cos(a) * r, -1.4 - hash(k * 17) * 2.5, c + Math.sin(a) * r);
        m.scale.set(2.5 + hash(k) * 3, 0.8 + hash(k * 3), 1.6 + hash(k * 5) * 2);
        m.userData.a = a;
        m.userData.r = r;
        this.clouds.push(m);
        this.decor.add(m);
      }
    }

    this.sigs = new Array<string>(n).fill("");
    this.waterTiles = [];
  }

  private waterTiles: number[] = [];

  /** Re-derive instance data for tiles whose appearance changed since last frame. */
  private syncTiles(s: Snapshot, now: number): void {
    const st = this.stage;
    const w = s.w;
    this.cap = lifeCap(s.ledger);
    const dirty: number[] = [];
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      const sig = `${t.t}|${t.d}|${t.amt}|${Math.round(effectiveLife(t, this.cap) / 4)}|${t.b}|${t.mark?.name ?? ""}`;
      if (sig !== this.sigs[i]) {
        this.sigs[i] = sig;
        dirty.push(i);
      }
    }
    if (!dirty.length) return;
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const soil = hexRGB(SOIL[st.id] ?? "#7a6a5a");
    const turf = this.turf!;
    const soilM = this.soil!;
    const gone = (i: number): void => {
      m4.makeScale(1e-4, 1e-4, 1e-4).setPosition(0, -200, 0);
      turf.setMatrixAt(i, m4);
      soilM.setMatrixAt(i, m4);
    };
    for (const i of dirty) {
      const t = s.tiles[i];
      const x = i % w;
      const y = Math.floor(i / w);
      const h = this.heights[i];
      const base = this.bases[i];
      const r = hash(i * 7 + 3);
      // void, the core (drawn by its own mesh), and space-borne deposits have no ground of their own
      const floating = (st.id === "universe" && t.t === 0 && t.d && t.amt > 0) || (t.t === 1 && st.id !== "earth");
      if (t.t === 2 || t.t === 3 || floating) {
        gone(i);
        continue;
      }
      const capH = 0.09;
      const inset = st.id === "sun" ? 0.94 : 1;
      m4.makeScale(inset, capH, inset).setPosition(x, h, y);
      turf.setMatrixAt(i, m4);
      m4.makeScale(inset, Math.max(0.01, h - capH - base), inset).setPosition(x, h - capH, y);
      soilM.setMatrixAt(i, m4);
      let top: RGB;
      if (t.t === 1) top = lerpRGB([112, 92, 72], [92, 112, 96], t.init ? t.amt / t.init : 0);
      else if (t.t === 4) top = lerpRGB([60, 58, 66], [96, 94, 104], r);
      else if (st.id === "universe") top = t.d ? [44, 40, 60] : [78, 72, 120];
      else {
        const k = clamp01(effectiveLife(t, this.cap) / 100 + (r - 0.5) * 0.08);
        top = lerpRGB(st.palette.dead, st.palette.lush, k);
        const patch = vnoise(x / 3.5, y / 3.5, 99) - 0.5;
        top = [top[0] * (1 + patch * 0.16) + 10 * patch, top[1] * (1 + patch * 0.1), top[2] * (1 - patch * 0.12)];
      }
      turf.setColorAt(i, colourOf(top, col));
      soilM.setColorAt(i, colourOf(lerpRGB(soil, top, 0.12 + r * 0.08), col));
    }
    turf.instanceMatrix.needsUpdate = true;
    soilM.instanceMatrix.needsUpdate = true;
    if (turf.instanceColor) turf.instanceColor.needsUpdate = true;
    if (soilM.instanceColor) soilM.instanceColor.needsUpdate = true;
    turf.boundingSphere = soilM.boundingSphere = null;
    this.rebuildProps(s, now);
  }

  private rebuildProps(s: Snapshot, now: number): void {
    const st = this.stage;
    const w = s.w;
    const B = this.batches;
    for (const b of Object.values(B)) b.begin();
    const col = new THREE.Color();
    const tmp = new THREE.Color();
    for (const g of this.galaxies) {
      g.sprite.removeFromParent();
      (g.sprite.material as THREE.Material).dispose();
    }
    this.galaxies = [];
    if (this.water) this.waterTiles = [];
    const m4 = new THREE.Matrix4();
    let wn = 0;
    s.tiles.forEach((t, i) => {
      const x = i % w;
      const y = Math.floor(i / w);
      const h = this.heights[i];
      const full = t.init ? t.amt / t.init : 0;
      const r = (k: number): number => hash(i * 31 + k * 977);
      const life = effectiveLife(t, this.cap) / 100;
      // the pond: a surface that sinks as it's drawn down
      if (this.water && t.t === 1 && st.id === "earth") {
        if (t.amt > 0) {
          m4.makeScale(1, 1, 1).setPosition(x, this.waterY(t), y);
          this.water.setMatrixAt(wn, m4);
          this.waterTiles[wn++] = i;
        }
      }
      if (t.b) return;
      // grass and flowers on living Earth ground
      if (st.id === "earth" && t.t === 0 && !t.d && life > 0.4) {
        const n = Math.floor(r(1) * 3 + life * 2);
        for (let k = 0; k < n; k++) {
          const ox = (r(k + 2) - 0.5) * 0.8;
          const oz = (r(k + 9) - 0.5) * 0.8;
          colourOf(lerpRGB([170, 150, 100], [150, 214, 110], life), col);
          B.tuft.add(i, x + ox, h, y + oz, 0.07, 0.08 + r(k) * 0.07, 0.07, r(k + 4) * 3, col);
        }
        if (life > 0.65 && r(20) > 0.6) {
          const fc = ["#fff6a8", "#ffb3c7", "#ffffff", "#c9b3ff"][Math.floor(r(21) * 4)];
          B.flower.add(i, x + (r(22) - 0.5) * 0.7, h + 0.06, y + (r(23) - 0.5) * 0.7, 0.07, 0.07, 0.07, 0, col.set(fc));
        }
      }
      if (!t.d) return;
      const family = t.d;
      const pc = new THREE.Color(st.palette[family]);
      if (st.id === "earth" && family === "matter") {
        if (t.amt === 0) {
          B.stump.add(i, x, h, y, 0.26, 0.12, 0.26);
          B.stumpTop.add(i, x, h + 0.12, y, 0.22, 0.01, 0.22);
          return;
        }
        const n = Math.max(1, Math.ceil(full * 3));
        // foliage thins and browns as the grove is cut and the land dies
        tmp.set(st.palette.matter).lerp(new THREE.Color("#8a6a3a"), clamp01((1 - life) * 0.8));
        for (let k = 0; k < n; k++) {
          const ox = n === 1 ? 0 : (r(k) - 0.5) * 0.62;
          const oz = n === 1 ? 0 : (r(k + 5) - 0.5) * 0.62;
          const s = 0.75 + r(k + 11) * 0.4;
          const leaf = (0.45 + 0.55 * full) * s;
          B.trunk.add(i, x + ox, h, y + oz, 0.09 * s, 0.55 * s, 0.09 * s);
          col.copy(tmp).offsetHSL((r(k + 3) - 0.5) * 0.04, 0, (r(k + 7) - 0.5) * 0.08);
          B.canopy.add(i, x + ox, h + 0.5 * s, y + oz, 0.62 * leaf, 0.58 * leaf, 0.62 * leaf, r(k) * 6, col);
          col.offsetHSL(0, 0, 0.06);
          B.canopy2.add(i, x + ox + 0.05, h + 0.5 * s + 0.36 * leaf, y + oz - 0.04, 0.38 * leaf, 0.34 * leaf, 0.38 * leaf, r(k + 1) * 6, col);
        }
        return;
      }
      if (family === "mineral") {
        if (t.amt === 0) return;
        const n = Math.max(1, Math.ceil(full * 3));
        const glowy = st.id === "sun" || st.id === "universe";
        const floating = st.id === "system" || st.id === "universe";
        for (let k = 0; k < n; k++) {
          const ox = n === 1 ? 0 : (r(k) - 0.5) * 0.5;
          const oz = n === 1 ? 0 : (r(k + 5) - 0.5) * 0.5;
          const s = (0.22 + r(k + 2) * 0.16) * (0.55 + 0.45 * full) * (st.id === "mars" ? 1.25 : 1);
          col.copy(pc).offsetHSL(0, 0, (r(k + 8) - 0.5) * 0.12);
          if (glowy) B.crystal.add(i, x + ox, (floating ? 0.5 : h) + s * 0.6, y + oz, s * 0.8, s * 2.2, s * 0.8, r(k) * 3, col, (r(k + 1) - 0.5) * 0.4, (r(k + 2) - 0.5) * 0.4);
          else if (floating) B.rock.add(i, x + ox, h + 0.45 + r(k + 4) * 0.3, y + oz, s * 1.5, s * 1.2, s * 1.4, r(k) * 6, col, r(k + 1) * 2);
          else if (st.id === "mars") B.rock.add(i, x + ox, h + s * 0.3, y + oz, s * 1.1, s * 2.0, s * 1.1, r(k) * 6, col, (r(k + 1) - 0.5) * 0.3);
          else B.rock.add(i, x + ox, h + s * 0.25, y + oz, s * 1.6, s * 1.15, s * 1.4, r(k) * 6, col);
        }
        return;
      }
      if (family === "matter") {
        if (t.amt === 0) {
          if (st.id === "universe") B.dust.add(i, x, h + 0.02, y, 0.6, 0.02, 0.6);
          return;
        }
        if (st.id === "mars") {
          col.copy(pc);
          const s = 0.55 + 0.45 * full;
          B.mound.add(i, x, h, y, 0.9 * s, 0.45 * s, 0.8 * s, r(1) * 6, col);
          col.offsetHSL(0, 0, 0.06);
          B.mound.add(i, x + 0.25, h, y - 0.2, 0.4 * s, 0.25 * s, 0.4 * s, 0, col);
        } else if (st.id === "sun") {
          // plasma: the core column itself carries it (see the core pass in frame)
        } else if (st.id === "universe") {
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: galaxyTexture(), color: st.palette.matter, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.35 + 0.65 * full }));
          const sz = 0.9 + 0.9 * full;
          sprite.scale.set(sz, sz, 1);
          sprite.position.set(x, 0.55 + r(2) * 0.4, y);
          sprite.userData.tile = i;
          this.galaxies.push({ sprite, tile: i, spin: (r(3) - 0.5) * 0.6 });
          this.pickables.add(sprite);
        } else {
          col.copy(pc);
          const s = 0.3 * (0.5 + 0.5 * full);
          B.crystal.add(i, x, h + 0.55, y, s * 1.2, s * 1.6, s * 1.2, r(1) * 6, col, 0.3, 0.2);
          B.rock.add(i, x + 0.2, h + 0.35, y - 0.15, s * 0.8, s * 0.7, s * 0.8, r(2) * 6, col.offsetHSL(0, 0, -0.1));
        }
        return;
      }
      // coolant
      if (t.amt === 0) return;
      if (st.id === "mars") {
        const s = 0.35 + 0.65 * full;
        B.pool.add(i, x, h + 0.005, y, 0.85 * s, 0.03, 0.85 * s, 0, col.set("#dff6ff"));
        for (let k = 0; k < 3; k++) B.ice.add(i, x + (r(k) - 0.5) * 0.5, h + 0.06, y + (r(k + 3) - 0.5) * 0.5, 0.14 * s, 0.3 * s, 0.14 * s, r(k) * 3, undefined, (r(k + 1) - 0.5) * 0.5);
      } else if (st.id === "sun") {
        const s = 0.35 + 0.65 * full;
        B.pool.add(i, x, h + 0.005, y, 0.85 * s, 0.03, 0.85 * s, 0, col.set("#1e2a5a"));
        B.rock.add(i, x, h, y, 0.06, 0.6, 0.06, 0, col.set("#8a8f99"));
        B.rock.add(i, x, h + 0.6, y, 0.7 * s, 0.03, 0.7 * s, 0.3, col.set("#2b3a66"));
      } else if (st.id === "system") {
        const s = 0.5 + 0.5 * full;
        B.comet.add(i, x, 0.6, y, 0.34 * s, 0.3 * s, 0.32 * s, r(1) * 6);
        B.tail.add(i, x + 0.6 * s, 0.6, y + 0.3 * s, 0.22 * s, 1.4 * s, 0.22 * s, 0, undefined, 0, Math.PI / 2 + 0.45);
      } else if (st.id === "universe") {
        const s = 0.5 + 0.5 * full;
        B.cloud.add(i, x, 0.5, y, 0.9 * s, 0.45 * s, 0.9 * s, r(1) * 3, col.set(st.palette.coolant));
        B.cloud.add(i, x + 0.2, 0.6, y - 0.1, 0.5 * s, 0.3 * s, 0.5 * s, 0, col.set("#2b3a66"));
      }
    });
    if (this.water) {
      this.water.count = wn;
      this.water.instanceMatrix.needsUpdate = true;
      this.water.boundingSphere = null;
    }
    for (const b of Object.values(B)) b.end();
    this.syncMarks(s);
    this.surveyDirty = true;
    void now;
  }

  private surveyDirty = true;

  private syncMarks(s: Snapshot): void {
    const seen = new Set<number>();
    s.tiles.forEach((t, i) => {
      if (!t.mark || t.b) return;
      seen.add(i);
      const name = t.mark.name;
      let m = this.marks.get(i);
      if (!m) {
        const group = signpost();
        const x = i % s.w;
        const y = Math.floor(i / s.w);
        const top = t.t === 1 && this.stage.id === "earth" ? this.pondLevel : t.t === 2 || (t.t === 1 && this.stage.id !== "earth") ? 0 : this.heights[i];
        group.position.set(x + 0.32, top, y + 0.32);
        if (this.stage.id === "earth" && name === "Picnic Hill") {
          const p = picnic();
          p.position.set(-0.55, 0.005, -0.4);
          group.add(p);
        }
        const label = document.createElement("div");
        label.className = "wl wl-place";
        const obj = new CSS2DObject(label);
        obj.position.set(0, 0.95, 0);
        obj.center.set(0.5, 1);
        group.add(obj);
        this.decor.add(group);
        m = { group, label, obj, landmark: false };
        this.marks.set(i, m);
      }
      m.label.textContent = name;
      m.landmark = t.mark.by === "the Cooperative";
    });
    for (const [i, m] of this.marks) {
      if (seen.has(i)) continue;
      m.obj.removeFromParent();
      m.label.remove();
      m.group.removeFromParent();
      this.marks.delete(i);
    }
    // each spent world's remnant is named once, floating over it
    if (!this.ghostLabels.length) {
      const named = new Set<string>();
      s.tiles.forEach((t, i) => {
        if (!t.ghost || named.has(t.ghost)) return;
        named.add(t.ghost);
        const el = document.createElement("div");
        el.className = "wl wl-ghost";
        el.textContent = t.ghost;
        const o = new CSS2DObject(el);
        o.position.set((i % s.w) + 1, this.heights[i] + 1.2, Math.floor(i / s.w) + 1);
        this.decor.add(o);
        this.ghostLabels.push(o);
      });
    }
  }

  // --- buildings ---------------------------------------------------------------

  private dropBuilding(v: BuildingView): void {
    v.labelObj.removeFromParent();
    v.label.remove();
    v.group.removeFromParent();
  }

  private syncBuildings(s: Snapshot): void {
    const seen = new Set<number>();
    for (const b of s.buildings) {
      seen.add(b.id);
      const def = BUILDINGS[b.type];
      const done = b.work >= def.build * 10;
      const ok = b.status === "ok";
      const unserved = b.status.startsWith("unserved");
      const key = `${b.type}|${done}|${ok}|${unserved}|${this.stage.id}`;
      let v = this.buildings.get(b.id);
      if (!v || v.key !== key) {
        if (v) this.dropBuilding(v);
        const n = def.size;
        const group = new THREE.Group();
        group.userData.building = b.id;
        // level the footprint: stand on its highest tile, with a plinth down to the lowest
        let top = -Infinity;
        let low = Infinity;
        let any = false;
        for (let dy = 0; dy < n; dy++)
          for (let dx = 0; dx < n; dx++) {
            const i = (b.y + dy) * s.w + b.x + dx;
            const t = s.tiles[i];
            if (!t || t.t === 2) continue;
            any = true;
            top = Math.max(top, this.heights[i]);
            low = Math.min(low, this.heights[i]);
          }
        if (!any) top = low = 0;
        group.position.set(b.x + (n - 1) / 2, top, b.y + (n - 1) / 2);
        if (top - low > 0.01 || (this.stage.id === "system" && b.type === "relay")) {
          const plinth = new THREE.Mesh(G.box(), mat(SOIL[this.stage.id] ?? "#7a6a5a"));
          plinth.scale.set(n * 0.96, top - low + 0.06, n * 0.96);
          plinth.position.y = low - top - 0.03;
          plinth.castShadow = plinth.receiveShadow = true;
          group.add(plinth);
        }
        const model = buildingModel(b.type, this.stage, ok, unserved, b.id);
        const body = new THREE.Group();
        body.add(model.root);
        group.add(body);
        let sc: THREE.Group | null = null;
        if (!done) {
          sc = scaffold(n, Math.max(0.5, model.h * 0.9));
          group.add(sc);
        }
        const label = document.createElement("div");
        label.className = "wl wl-building";
        const labelObj = new CSS2DObject(label);
        labelObj.center.set(0.5, 1);
        labelObj.position.y = model.h + 0.35;
        group.add(labelObj);
        this.pickables.add(group);
        v = { group, model, key, body, scaffold: sc, label, labelObj, faded: false, h: model.h };
        this.buildings.set(b.id, v);
      }
      const progress = Math.min(1, b.work / Math.max(1, def.build * 10));
      v.body.scale.y = done ? 1 : 0.12 + 0.88 * progress;
      // text, never colour alone: names, progress and why something is idle
      let text = "";
      if (!done) text = `building ${Math.round(progress * 100)}%`;
      else if (!ok) text = `${b.status.startsWith("throttled") ? "~" : "!"} ${b.status.replace(/^(idle|unserved|throttled): /, "")}`;
      else if (b.name && (b.type === "depot" || b.type === "engine")) text = b.name;
      if (v.label.textContent !== text) v.label.textContent = text;
      v.label.dataset.kind = !done ? "site" : !ok ? "idle" : "name";
      v.labelObj.visible = !!text && (!done || !ok || this.mode === "iso" || this.distTo(v.group.position) < 14);
      v.label.style.outline = this.view.selected === b.id ? "2px solid #fffbe0" : "";
    }
    for (const [id, v] of this.buildings) {
      if (seen.has(id)) continue;
      this.dropBuilding(v);
      this.buildings.delete(id);
    }
  }

  private distTo(p: THREE.Vector3): number {
    return Math.hypot(p.x - this.client.me.x, p.z - this.client.me.y);
  }

  private setFaded(v: BuildingView, on: boolean): void {
    if (v.faded === on) return;
    v.faded = on;
    v.body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (on) {
        const orig = mesh.material as THREE.Material;
        mesh.userData.orig = orig;
        let f = this.faded.get(orig);
        if (!f) {
          f = orig.clone();
          f.transparent = true;
          f.opacity = Math.min(orig.opacity, 0.3);
          f.depthWrite = false;
          this.faded.set(orig, f);
        }
        mesh.material = f;
        mesh.castShadow = false;
      } else if (mesh.userData.orig) {
        mesh.material = mesh.userData.orig as THREE.Material;
        mesh.castShadow = true;
      }
    });
  }

  // --- bodies ------------------------------------------------------------------

  private syncPlayers(s: Snapshot, t: number, dt: number, motion: boolean): void {
    const seen = new Set<string>();
    const st = this.stage;
    const nowMs = performance.now();
    for (const p of Object.values(s.players)) {
      const isMe = p.id === this.client.you;
      const pos = isMe ? ([this.client.me.x, this.client.me.y] as [number, number]) : this.client.position(p.id);
      if (!pos) continue;
      seen.add(p.id);
      const colour = PLAYER_COLOURS[p.colour % PLAYER_COLOURS.length];
      const key = `${st.avatar}|${colour}`;
      let v = this.players.get(p.id);
      if (!v || v.key !== key) {
        if (v) {
          v.rig.root.removeFromParent();
          v.labelObj.removeFromParent();
          v.label.remove();
          v.emote.remove();
        }
        const rig = playerRig(st.avatar, colour);
        const label = document.createElement("div");
        label.className = "wl wl-name";
        label.style.setProperty("--who", colour);
        const labelObj = new CSS2DObject(label);
        labelObj.center.set(0.5, 1);
        labelObj.position.y = 1.35;
        rig.root.add(labelObj);
        const emote = document.createElement("div");
        emote.className = "wl wl-emote";
        const emoteObj = new CSS2DObject(emote);
        emoteObj.center.set(0.5, 1);
        emoteObj.position.set(0, 1.75, 0);
        rig.root.add(emoteObj);
        this.world.add(rig.root);
        v = { rig, key, label, emote, labelObj, emoteObj, last: [pos[0], pos[1]], y: this.groundAt(pos[0], pos[1]), speed: 0, phase: 0, heading: (p.facing / 8) * Math.PI * 2 };
        this.players.set(p.id, v);
      }
      const rig = v.rig;
      const moved = Math.hypot(pos[0] - v.last[0], pos[1] - v.last[1]);
      const inst = dt > 0 ? moved / dt : 0;
      v.speed += (Math.min(6, inst) - v.speed) * Math.min(1, dt * 10);
      if (moved > 0.002) v.heading = Math.atan2(pos[1] - v.last[1], pos[0] - v.last[0]);
      v.last = [pos[0], pos[1]];
      const walking = v.speed > 0.4;
      v.phase += dt * (6 + v.speed * 2.2);
      const gy = this.groundAt(pos[0], pos[1]);
      v.y += (gy - v.y) * Math.min(1, dt * 12);
      let hop = 0;
      if (isMe) {
        const since = t - this.jumpAt;
        if (since >= 0 && since < 0.45) hop = Math.sin((since / 0.45) * Math.PI) * 0.45;
      }
      const bob = motion && walking ? Math.abs(Math.sin(v.phase)) * 0.04 : 0;
      const float = rig.hover ? rig.hover + (motion ? Math.sin(t * 2.5 + p.colour) * 0.05 : 0) : 0;
      rig.root.position.set(pos[0], v.y + hop + float, pos[1]);
      rig.body.position.y = bob;
      // own body turns with the camera in first and third person; everyone else faces where they walk
      let heading = v.heading;
      if (isMe && this.mode !== "iso") heading = this.yaw;
      else if (!walking && !isMe) heading = (p.facing / 8) * Math.PI * 2;
      rig.root.rotation.y = -heading;
      // limbs
      const swing = motion && walking ? Math.sin(v.phase) * 0.7 * Math.min(1, v.speed / 3) : 0;
      rig.legL.rotation.z = swing;
      rig.legR.rotation.z = -swing;
      rig.armL.rotation.z = -swing * 0.8;
      const working = (p.act && (p.act.k === "harvest" || p.act.k === "build") && p.act.until > s.tick) || (isMe && nowMs < this.client.swingUntil);
      rig.armR.rotation.z = working ? (motion ? -1.4 + Math.sin(t * 16) * 0.9 : -1.2) : swing * 0.8;
      for (const sp of rig.spin) {
        if (st.avatar === "wisp") sp.scale.setScalar(0.62 * (1 + (motion ? 0.12 * Math.sin(t * 3 + p.colour) : 0)));
        else sp.rotation.y = motion ? t * 30 : 0.4;
      }
      // held tool, visible to everyone
      const held = p.holding ?? null;
      if (rig.held !== held) {
        rig.hand.clear();
        if (held && !TOOLS[held]?.armour) {
          const tool = viewToolForHand(held);
          rig.hand.add(tool);
        }
        rig.held = held;
      }
      rig.root.visible = !(isMe && this.mode === "first");
      const nm = `${p.name}${isMe ? " (you)" : ""}${p.connected ? "" : " · away"}`;
      if (v.label.textContent !== nm) v.label.textContent = nm;
      v.labelObj.visible = !(isMe && this.mode !== "iso");
      rig.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = p.connected;
      });
      const emoting = p.act?.k === "emote" && p.act.e && p.act.until > s.tick;
      v.emoteObj.visible = !!emoting && !(isMe && this.mode === "first");
      if (emoting && p.act?.e) v.emote.textContent = EMOTE_GLYPH[p.act.e];
      v.label.style.opacity = p.connected ? "1" : "0.6";
    }
    for (const [id, v] of this.players) {
      if (seen.has(id)) continue;
      v.rig.root.removeFromParent();
      v.labelObj.removeFromParent();
      v.emoteObj.removeFromParent();
      v.label.remove();
      v.emote.remove();
      this.players.delete(id);
    }
  }

  private syncAnimals(s: Snapshot, t: number, dt: number, motion: boolean): void {
    const list = s.animals ?? [];
    const seen = new Set<number>();
    for (const a of list) {
      seen.add(a.id);
      let v = this.animals.get(a.id);
      if (!v) {
        const c = animalModel(a.kind);
        c.root.userData.animal = a.id;
        const proxy = new THREE.Mesh(G.ball(0), this.hidden);
        proxy.scale.setScalar(a.kind === "rabbit" || a.kind === "fish" ? 0.5 : 0.8);
        proxy.position.y = 0.3;
        c.root.add(proxy);
        this.pickables.add(c.root);
        v = { c, x: a.x, y: a.y, dead: a.dead, phase: hash(a.id) * 10, proxy };
        this.animals.set(a.id, v);
      }
      const dx = a.x - v.x;
      const dy = a.y - v.y;
      const far = Math.hypot(dx, dy) > 3;
      const k = far ? 1 : Math.min(1, dt * 8);
      v.x += dx * k;
      v.y += dy * k;
      const moving = !a.dead && Math.hypot(dx, dy) > 0.02;
      if (moving) v.phase += dt * 12;
      const root = v.c.root;
      let gy = this.groundAt(v.x, v.y);
      if (a.kind === "fish") gy = Math.max(gy, this.pondLevel - 0.12) + (motion ? Math.sin(t * 2 + a.id) * 0.03 : 0);
      root.position.set(v.x, gy, v.y);
      root.rotation.y = -a.h;
      // a carcass lies on its side
      v.c.body.rotation.x = a.dead ? Math.PI / 2 : 0;
      v.c.body.position.y = a.dead ? 0.12 : moving && motion && a.kind === "rabbit" ? Math.abs(Math.sin(v.phase * 0.8)) * 0.12 : 0;
      v.c.legs.forEach((leg, n) => {
        leg.rotation.z = moving && motion ? Math.sin(v.phase + (n % 2 ? Math.PI : 0) + (n > 1 ? Math.PI / 2 : 0)) * 0.6 : 0;
      });
    }
    for (const [id, v] of this.animals) {
      if (seen.has(id)) continue;
      v.c.root.removeFromParent();
      this.animals.delete(id);
    }
    // the bags people left where they fell
    const bags = (s.bags ?? []) as { id: number; x: number; y: number }[];
    const bseen = new Set<number>();
    for (const b of bags) {
      bseen.add(b.id);
      let g = this.bags.get(b.id);
      if (!g) {
        g = bagModel();
        this.decor.add(g);
        this.bags.set(b.id, g);
      }
      g.position.set(b.x, this.groundAt(b.x, b.y), b.y);
    }
    for (const [id, g] of this.bags) {
      if (bseen.has(id)) continue;
      g.removeFromParent();
      this.bags.delete(id);
    }
  }

  // --- effects -------------------------------------------------------------------

  private tileFx(i: number, amount: number): void {
    const s = this.client.state;
    if (!s || this.view.low) return;
    const st = STAGES[s.stage];
    const t = s.tiles[i];
    const x = i % s.w;
    const y = Math.floor(i / s.w);
    const el = document.createElement("div");
    el.className = "wl wl-pop";
    el.textContent = `+${amount} ${t.d ? st.families[t.d].label : ""}`;
    const obj = new CSS2DObject(el);
    const z = (t.t === 2 ? 0 : this.heights[i] ?? 0) + 0.6;
    obj.position.set(x, z, y);
    this.scene.add(obj);
    const dust: THREE.Mesh[] = [];
    const vel: THREE.Vector3[] = [];
    const m = mat(t.d ? st.palette[t.d] : "#ffffff");
    if (!this.view.reducedMotion)
      for (let k = 0; k < 6; k++) {
        const d = new THREE.Mesh(G.cube(), m);
        d.scale.setScalar(0.06);
        d.position.set(x, z - 0.2, y);
        this.scene.add(d);
        dust.push(d);
        vel.push(new THREE.Vector3((Math.random() - 0.5) * 1.6, 1 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6));
      }
    this.fx.push({ el, obj, dust, vel, t0: performance.now(), x, y: z, z: y });
  }

  private stepFx(now: number, dt: number): void {
    this.fx = this.fx.filter((f) => {
      const age = (now - f.t0) / 1000;
      if (age > 1.1) {
        f.obj.removeFromParent();
        f.el.remove();
        for (const d of f.dust) d.removeFromParent();
        return false;
      }
      f.obj.position.y = f.y + age * 0.7;
      f.el.style.opacity = String(Math.max(0, 1 - age));
      f.dust.forEach((d, k) => {
        const v = f.vel[k];
        v.y -= 5 * dt;
        d.position.addScaledVector(v, dt);
        d.scale.setScalar(0.06 * Math.max(0, 1 - age));
      });
      return true;
    });
  }

  private clearFx(): void {
    for (const f of this.fx) {
      f.obj.removeFromParent();
      f.el.remove();
      for (const d of f.dust) d.removeFromParent();
    }
    this.fx = [];
  }

  // --- the frame -------------------------------------------------------------------

  private resize(): void {
    const dpr = this.view.low ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const size = this.gl.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h || this.dprSeen !== dpr) {
      this.dprSeen = dpr;
      this.gl.setPixelRatio(dpr);
      this.gl.setSize(w, h, false);
      this.labels.setSize(w, h);
    }
    this.persp.aspect = w / h;
    const half = 6.5 / this.view.zoom;
    this.ortho.left = -half * (w / h);
    this.ortho.right = half * (w / h);
    this.ortho.top = half;
    this.ortho.bottom = -half;
  }

  frame(now: number): void {
    const t0 = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.lost) return;
    this.resize();
    const s = this.client.state;
    if (!s) {
      this.gl.setClearColor("#fdf3d8");
      this.gl.clear();
      return;
    }
    this.client.predict(dt);
    const key = `${s.gen}:${s.stage}:${s.w}`;
    if (key !== this.worldKey) {
      this.worldKey = key;
      this.buildWorld(s);
    }
    const motion = !this.view.reducedMotion;
    const t = motion ? now / 1000 : 0;
    if (this.client.version !== this.seenVersion) {
      this.seenVersion = this.client.version;
      this.syncTiles(s, now);
      this.syncBuildings(s);
    }
    if (this.mode !== this.view.mode) this.setMode(this.view.mode);
    this.syncPlayers(s, now / 1000, dt, motion);
    this.syncAnimals(s, t, dt, motion);
    for (const v of this.buildings.values()) v.model.tick?.(t, motion && !this.view.low);
    this.animateWorld(s, t, motion);
    this.placeCamera(s, dt, now / 1000);
    this.computeAim(s);
    this.previews(s);
    this.syncSurvey(s, t);
    this.declutter();
    this.stepFx(now, dt);
    this.sun.castShadow = !this.view.low;
    this.scene.fog = this.mode === "iso" ? null : this.scene.fog ?? null;
    if (this.mode !== "iso" && !this.scene.fog) this.worldFog();
    const since = performance.now() - this.boundaryAt;
    this.flashEl.style.opacity = since < 1500 ? String(1 - since / 1500) : "0";
    this.gl.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  private worldFog(): void {
    const st = this.stage;
    const col = new THREE.Color(st.id === "earth" ? "#e9efe6" : st.id === "mars" ? "#d89a78" : st.id === "sun" ? "#c8642a" : st.palette.sky[1]);
    this.scene.fog = new THREE.Fog(col, 24, 70);
  }

  private animateWorld(s: Snapshot, t: number, motion: boolean): void {
    const st = this.stage;
    const w = s.w;
    const c = (w - 1) / 2;
    // the Sun: its core glows, shrinks and dims as it's consumed, and the light goes with it
    const rem = s.ledger.matter.initial ? s.ledger.matter.remaining / s.ledger.matter.initial : 0;
    if (this.core && st.id === "sun") {
      const m4 = new THREE.Matrix4();
      const col = new THREE.Color();
      this.coreTiles.forEach((i, k) => {
        const tile = s.tiles[i];
        const full = tile.init ? tile.amt / tile.init : 0;
        const x = i % w;
        const y = Math.floor(i / w);
        const h = 0.25 + (this.heights[i] - 0.25) * (0.25 + 0.75 * full);
        m4.makeScale(1, h + 0.6, 1).setPosition(x, h, y);
        this.core!.setMatrixAt(k, m4);
        const pulse = 0.88 + 0.12 * Math.sin(t * 2 + i);
        colourOf(full > 0 ? lerpRGB([110, 50, 36], [255, 240, 170], full * pulse) : [58, 40, 40], col);
        this.core!.setColorAt(k, col);
      });
      this.core.instanceMatrix.needsUpdate = true;
      if (this.core.instanceColor) this.core.instanceColor.needsUpdate = true;
      this.core.boundingSphere = null;
      if (this.coreGlow) {
        const sz = (6 + 10 * rem) * (1 + (motion ? 0.03 * Math.sin(t) : 0));
        this.coreGlow.scale.set(sz, sz, 1);
        (this.coreGlow.material as THREE.SpriteMaterial).opacity = 0.15 + 0.75 * rem;
      }
      this.coreLight.intensity = 3 * rem;
      this.hemi.intensity = (this.hemi.userData.base as number) * (0.35 + 0.65 * rem);
      this.sun.intensity = (this.sun.userData.base as number) * (0.3 + 0.7 * rem);
    }
    if (st.id === "universe" && this.stars) {
      const l = s.ledger;
      const init = l.matter.initial + l.mineral.initial + l.coolant.initial;
      const left = init ? (l.matter.remaining + l.mineral.remaining + l.coolant.remaining) / init : 0;
      this.stars.geometry.setDrawRange(0, Math.round(1600 * (0.08 + 0.92 * left)));
    }
    for (const g of this.galaxies) (g.sprite.material as THREE.SpriteMaterial).rotation = t * g.spin;
    if (this.water) this.water.position.y = motion ? Math.sin(t * 1.3) * 0.008 : 0;
    // birds: as many as the land can still hold
    if (this.birds.length) {
      let sum = 0;
      let cnt = 0;
      for (const tile of s.tiles)
        if (tile.t === 0 || tile.t === 1) {
          sum += effectiveLife(tile, this.cap);
          cnt++;
        }
      const life = cnt ? sum / cnt / 100 : 0;
      const n = this.view.low ? 0 : Math.round(life ** 1.5 * this.birds.length);
      this.birds.forEach((b, k) => {
        b.visible = k < n;
        if (!b.visible) return;
        const a = t * (0.15 + hash(k) * 0.1) + hash(k * 7) * 6.28;
        const r = 4 + hash(k * 3) * w * 0.35;
        b.position.set(c + Math.cos(a) * r, 3.5 + hash(k * 5) * 2.5 + Math.sin(t + k) * 0.2, c + Math.sin(a) * r);
        b.rotation.y = -a - Math.PI / 2;
        const flap = motion ? Math.sin(t * 10 + k) * 0.6 : 0.2;
        b.children.forEach((wing) => {
          if (wing.userData.sgn) wing.rotation.x = flap * (wing.userData.sgn as number);
        });
      });
    }
    for (const cl of this.clouds) {
      const a = (cl.userData.a as number) + t * 0.01;
      cl.position.x = c + Math.cos(a) * (cl.userData.r as number);
      cl.position.z = c + Math.sin(a) * (cl.userData.r as number);
    }
    // the end, unless they stopped: the light goes out of everything
    const dark = s.phase.k === "ended" && s.phase.how !== "restraint";
    if (dark && st.id !== "sun") {
      this.hemi.intensity = (this.hemi.userData.base as number) * 0.55;
      this.sun.intensity = (this.sun.userData.base as number) * 0.45;
    }
  }

  private placeCamera(s: Snapshot, dt: number, nowS: number): void {
    const me = s.players[this.client.you];
    const st = this.stage;
    const mx = this.client.me.x;
    const my = this.client.me.y;
    const pv = this.players.get(this.client.you);
    const footY = pv ? pv.rig.root.position.y - (pv.rig.hover ? pv.rig.hover : 0) : this.groundAt(mx, my);
    const w = s.w;
    const c = (w - 1) / 2;
    // transitions and the ending pull the camera back into a slow orbit over the whole world
    let cine = 0;
    if (s.phase.k === "transition") cine = clamp01(1 - (s.phase.until - s.tick) / PACES[s.pace].transitionTicks) ** 0.7;
    else if (s.phase.k === "ended") cine = 1;
    const reduced = this.view.reducedMotion;
    const orbitA = (reduced ? 0.6 : nowS * 0.06) - 0.75 * Math.PI;
    if (this.mode === "iso") {
      const az = -0.75 * Math.PI + this.isoRot * (Math.PI / 2) + Math.PI + cine * (reduced ? 0 : nowS * 0.05 % (Math.PI * 2));
      const dir = new THREE.Vector3(Math.cos(az) * Math.cos(ISO_ELEVATION), Math.sin(ISO_ELEVATION), Math.sin(az) * Math.cos(ISO_ELEVATION));
      const target = new THREE.Vector3(mx + (c - mx) * cine, footY + 0.4, my + (c - my) * cine);
      const ease = reduced || !this.camInit ? 1 : Math.min(1, dt * 6);
      this.camLook.lerp(target, ease);
      if (!this.camInit) this.camLook.copy(target);
      this.camInit = true;
      this.ortho.position.copy(this.camLook).addScaledVector(dir, 40);
      this.ortho.up.set(0, 1, 0);
      this.ortho.lookAt(this.camLook);
      this.ortho.zoom = 1 - 0.55 * cine;
      this.ortho.updateProjectionMatrix();
      this.fadeOccluders(s);
      this.showHands(false);
      return;
    }
    for (const v of this.buildings.values()) this.setFaded(v, false);
    this.persp.fov += (this.view.fov - this.persp.fov) * Math.min(1, dt * 8);
    if (Math.abs(this.persp.fov - this.view.fov) < 0.05) this.persp.fov = this.view.fov;
    const fwd = new THREE.Vector3(Math.cos(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.sin(this.yaw) * Math.cos(this.pitch));
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    const moving = Math.hypot(this.client.me.dx, this.client.me.dy) > 0;
    if (this.mode === "first") {
      if (moving) this.walkPhase += dt * (this.client.me.sprint ? 13 : 9);
      const bob = this.view.bob && !reduced && moving ? Math.sin(this.walkPhase) * 0.035 : 0;
      const since = nowS - this.jumpAt;
      const hop = since >= 0 && since < 0.45 ? Math.sin((since / 0.45) * Math.PI) * 0.45 : 0;
      const hover = pv?.rig.hover ?? 0;
      pos.set(mx, footY + hover + (EYE[st.avatar] ?? 0.8) + bob + hop, my);
      look.copy(pos).add(fwd);
      this.showHands(cine < 0.5 && !!me);
    } else {
      // chase: behind and above, a little over the right shoulder so the avatar never covers the crosshair
      const right = new THREE.Vector3(-Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const target = new THREE.Vector3(mx, footY + 1.05, my).addScaledVector(right, 0.42);
      const dist = Math.max(1.6, Math.min(8, 3.6 / this.view.zoom));
      const lift = Math.min(1.35, this.pitch - 0.3);
      const back = new THREE.Vector3(-Math.cos(this.yaw) * Math.cos(lift), -Math.sin(lift), -Math.sin(this.yaw) * Math.cos(lift));
      const want = target.clone().addScaledVector(back, dist);
      // pull in if something solid is between the avatar and the camera
      this.raycaster.set(target, back);
      this.raycaster.far = dist;
      const hits = this.raycaster.intersectObjects([this.turf!, this.soil!, ...[...this.buildings.values()].map((b) => b.group), ...(this.core ? [this.core] : [])], true);
      this.raycaster.far = Infinity;
      const hit = hits.find((h) => h.object.visible);
      if (hit) want.copy(target).addScaledVector(back, Math.max(0.5, hit.distance - 0.25));
      pos.copy(want);
      look.copy(target).addScaledVector(fwd, 4);
      this.showHands(false);
    }
    if (cine > 0) {
      const orbit = new THREE.Vector3(c + Math.cos(orbitA) * w * 0.85, w * 0.55, c + Math.sin(orbitA) * w * 0.85);
      pos.lerp(orbit, cine);
      look.lerp(new THREE.Vector3(c, 0, c), cine);
    }
    this.persp.position.copy(pos);
    this.persp.up.set(0, 1, 0);
    this.persp.lookAt(look);
    this.persp.updateProjectionMatrix();
    if (this.hands) this.animateHands(nowS, moving);
  }

  private fadeOccluders(s: Snapshot): void {
    // a tall building between the camera and a body turns translucent, so nobody is ever hidden
    const cam = this.ortho;
    cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse;
    const bodies: THREE.Vector3[] = [];
    for (const p of this.players.values()) bodies.push(p.rig.root.position.clone().setY(p.rig.root.position.y + 0.5).applyMatrix4(inv));
    for (const [id, v] of this.buildings) {
      const b = s.buildings.find((q) => q.id === id);
      if (!b || v.h < 0.7) {
        this.setFaded(v, false);
        continue;
      }
      const n = BUILDINGS[b.type].size;
      const bc = v.group.position.clone().setY(v.group.position.y + v.h * 0.5).applyMatrix4(inv);
      const hide = bodies.some((q) => bc.z > q.z && Math.abs(bc.x - q.x) < n * 0.7 + 0.25 && q.y > bc.y - v.h * 0.6 - 0.4 && q.y < bc.y + v.h * 0.9 && bc.z - q.z < 6);
      this.setFaded(v, hide);
    }
  }

  private showHands(on: boolean): void {
    const held = this.view.held ?? null;
    const me = this.client.state?.players[this.client.you];
    const sleeve = me ? PLAYER_COLOURS[me.colour % PLAYER_COLOURS.length] : "#e8735a";
    const key = `${held}|${sleeve}|${this.stage.avatar}`;
    if (on && (!this.hands || this.hands.key !== key)) {
      this.hands?.root.removeFromParent();
      const vm = viewModel(held && !TOOLS[held]?.armour ? held : null, this.stage.avatar === "suit" ? "#f2efe8" : sleeve);
      vm.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = false;
          m.receiveShadow = false;
          m.renderOrder = 20;
        }
      });
      this.persp.add(vm.root);
      this.hands = { ...vm, key };
    }
    if (this.hands) this.hands.root.visible = on && (this.stage.avatar === "person" || this.stage.avatar === "suit" || !!held);
  }

  private animateHands(nowS: number, moving: boolean): void {
    const h = this.hands!;
    const motion = !this.view.reducedMotion;
    const s = this.client.state;
    const me = s?.players[this.client.you];
    const acting = performance.now() < this.client.swingUntil || !!(me?.act && me.act.k !== "emote" && s && me.act.until > s.tick);
    const sway = motion && this.view.bob && moving ? Math.sin(this.walkPhase) * 0.012 : 0;
    h.root.position.set(0.26 + sway, -0.2 + Math.abs(sway) * 0.8, -0.5);
    h.root.rotation.set(-0.45, 0.3, 0.12);
    h.root.scale.setScalar(0.55);
    if (acting) {
      const k = motion ? (Math.sin(nowS * 16) + 1) / 2 : 0.6;
      h.root.rotation.x = -0.35 - k * 1.1;
      h.root.position.y += -k * 0.05;
      h.root.position.z += -k * 0.08;
    }
  }

  // --- previews, hints and survey ------------------------------------------------

  private previews(s: Snapshot): void {
    const st = this.stage;
    const aim = this.aimCache;
    const me = s.players[this.client.you];
    const meP = me ? { ...me, x: this.client.me.x, y: this.client.me.y } : undefined;
    const tile = aim.tile;
    let hint = "";
    this.outline.visible = false;
    this.ghostFoot.visible = false;
    if (this.ghost) this.ghost.group.visible = false;
    const playing = s.phase.k === "play";
    if (playing && tile) {
      const [x, y] = tile;
      const i = y * s.w + x;
      const t = s.tiles[i];
      const top = !t ? 0 : t.t === 2 || (t.t === 1 && st.id !== "earth") ? 0 : t.t === 1 ? this.waterY(t) : this.heights[i];
      const dist = Math.hypot(x - this.client.me.x, y - this.client.me.y);
      if (this.view.tool === "build" && this.view.build) {
        const type = this.view.build;
        const def = BUILDINGS[type];
        const problem = placementProblem(s, type, x, y, meP, s.me?.items);
        const key = `${type}|${st.id}`;
        if (!this.ghost || this.ghost.key !== key) {
          this.ghost?.group.removeFromParent();
          const model = buildingModel(type, st, true, false, 1);
          model.root.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.castShadow = false;
              m.receiveShadow = false;
            }
          });
          this.ghost = { group: model.root, key };
          this.scene.add(model.root);
        }
        const g = this.ghost.group;
        const gm = problem ? this.ghostBad : this.ghostOk;
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.material = gm;
        });
        g.visible = true;
        g.position.set(x + (def.size - 1) / 2, top + 0.01, y + (def.size - 1) / 2);
        this.ghostFoot.material = gm;
        this.ghostFoot.visible = true;
        this.ghostFoot.scale.set(def.size * 0.98, 0.04, def.size * 0.98);
        this.ghostFoot.position.set(x + (def.size - 1) / 2, top, y + (def.size - 1) / 2);
        hint = problem ? `✕ ${problem}` : `✓ place ${buildingName(st, type)}`;
      } else if (t) {
        this.outline.visible = true;
        this.outline.position.set(x, top + 0.02, y);
        const n = aim.building ? BUILDINGS[aim.building.type].size : 1;
        this.outline.scale.set(n, 1, n);
        if (aim.building) this.outline.position.set(aim.building.x + (n - 1) / 2, top + 0.02, aim.building.y + (n - 1) / 2);
        const colour = this.view.tool === "demolish" ? "#ff8a7a" : this.view.tool === "mark" ? "#ffd27a" : "#fffbe0";
        (this.outline.material as THREE.LineBasicMaterial).color.set(colour);
        hint = this.describe(s, st, t, aim, dist, me);
      }
    }
    if (!hint && playing && me && this.view.tool === "harvest" && me.stats.harvested + me.stats.helped < 25) hint = this.nearbyHint(s, st);
    this.hint = hint;
    if (this.hintEl.textContent !== hint) this.hintEl.textContent = hint;
    this.hintEl.hidden = !hint;
    this.hintEl.dataset.bad = hint.startsWith("✕") || hint.includes("out of reach") ? "1" : "";
    // under the crosshair in first and third person; under the target in isometric
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    let hx = w / 2;
    let hy = h / 2 + 30;
    if (this.mode === "iso") {
      const anchor = tile ? new THREE.Vector3(tile[0], this.outline.position.y, tile[1]) : new THREE.Vector3(this.client.me.x, 0, this.client.me.y);
      anchor.project(this.ortho);
      hx = (anchor.x * 0.5 + 0.5) * w;
      hy = (-anchor.y * 0.5 + 0.5) * h + 26;
    }
    this.hintEl.style.transform = `translate(${Math.round(hx)}px, ${Math.round(hy)}px) translate(-50%, 0)`;
  }

  private describe(s: Snapshot, st: StageDef, t: Tile, aim: Aim, dist: number, me: Player | undefined): string {
    const reach = (r: number): boolean => dist <= r;
    const far = " (out of reach: walk closer)";
    if (this.view.tool === "inspect") return aim.building ? `Click: look at the ${buildingName(st, aim.building.type)}` : "";
    if (this.view.tool === "demolish") return aim.building ? `Click: take down the ${buildingName(st, aim.building.type)}` : "";
    if (this.view.tool === "mark") return "Click: name this place";
    if (aim.animal) {
      const a = aim.animal;
      const name = a.name ?? `the ${ANIMALS[a.kind].name}`;
      const ad = Math.hypot(a.x - this.client.me.x, a.y - this.client.me.y);
      if (a.dead) return ad <= HARVEST_RANGE ? `Click or F: butcher ${name}` : `${name}: out of reach`;
      const held = me?.holding ?? null;
      const range = (held && TOOLS[held]?.range) || 1.4;
      return ad <= range ? `Click: strike ${name}` : `${name}: out of reach`;
    }
    if (aim.building) {
      const b = aim.building;
      const done = b.work >= BUILDINGS[b.type].build * 10;
      if (!done) return reach(HARVEST_RANGE) ? "Click or E: help build" : `building site${far}`;
      return `Click: look at the ${b.name ?? buildingName(st, b.type)}`;
    }
    if (t.d && t.amt > 0) return reach(HARVEST_RANGE) ? `Click or E: harvest ${st.families[t.d].label}` : `${st.families[t.d].label}: out of reach`;
    return "";
  }

  private nearbyHint(s: Snapshot, st: StageDef): string {
    const px = this.client.me.x;
    const py = this.client.me.y;
    for (let r = 0; r <= 2; r++)
      for (let y = Math.round(py) - r; y <= Math.round(py) + r; y++)
        for (let x = Math.round(px) - r; x <= Math.round(px) + r; x++) {
          if (x < 0 || y < 0 || x >= s.w || y >= s.w || Math.hypot(x - px, y - py) > HARVEST_RANGE - 0.1) continue;
          const t = s.tiles[y * s.w + x];
          if (t.d && t.amt > 0) return `E: harvest ${st.families[t.d].label}`;
          const b = t.b ? s.buildings.find((q) => q.id === t.b) : undefined;
          if (b && b.work < BUILDINGS[b.type].build * 10) return "E: help build";
        }
    return "";
  }

  /** Named places stay legible: the world's landmarks from further off, everyone else's names and memorials only up close. */
  private declutter(): void {
    const iso = this.mode === "iso";
    for (const m of this.marks.values()) {
      const d = this.distTo(m.group.position);
      m.obj.visible = d < (m.landmark ? (iso ? 30 : 16) : iso ? 6 : 5);
    }
  }

  private syncSurvey(s: Snapshot, t: number): void {
    const on = this.view.survey;
    if (on !== this.surveyOn) {
      this.surveyOn = on;
      this.surveyDirty = true;
    }
    if (this.surveyDirty) {
      this.surveyDirty = false;
      this.markers.begin();
      const seen = new Set<number>();
      if (on)
        s.tiles.forEach((tile, i) => {
          if (!tile.d || tile.amt <= 0) return;
          seen.add(i);
          let v = this.survey.get(i);
          if (!v) {
            const el = document.createElement("div");
            el.className = "wl wl-survey";
            const obj = new CSS2DObject(el);
            obj.center.set(0.5, 1);
            this.scene.add(obj);
            v = { obj, el };
            this.survey.set(i, v);
          }
          const x = i % s.w;
          const y = Math.floor(i / s.w);
          const top = tile.t === 2 || (tile.t === 1 && this.stage.id !== "earth") ? 0.6 : tile.t === 1 ? this.pondLevel : this.heights[i];
          v.obj.position.set(x, top + 1.55, y);
          v.el.textContent = `${tile.amt}`;
          this.markers.add(i, x, top + 1.25, y, 0.16, -0.26, 0.16);
        });
      this.markers.end();
      for (const [i, v] of this.survey) {
        if (seen.has(i)) continue;
        v.obj.removeFromParent();
        v.el.remove();
        this.survey.delete(i);
      }
    }
    this.markers.mesh.visible = on;
    this.markers.mesh.position.y = on && !this.view.reducedMotion ? Math.sin(t * 4) * 0.06 : 0;
  }

  /** A PNG of the current view, for the in-game photograph. */
  photo(): string {
    this.gl.render(this.scene, this.camera);
    return this.canvas.toDataURL("image/png");
  }
}

/** A tool sized and turned for a body's hand (the view model holds its own, larger copy). */
function viewToolForHand(kind: NonNullable<Player["holding"]>): THREE.Group {
  const g = viewModel(kind, "#000000").tool;
  g.removeFromParent();
  g.position.set(0, 0, 0);
  g.rotation.set(0, 0, -Math.PI / 2 + 0.2);
  g.scale.setScalar(0.85);
  return g;
}
