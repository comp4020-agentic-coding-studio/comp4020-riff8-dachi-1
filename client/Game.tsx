"use client";
// The play screen: the 3D world (driven by Renderer3D's own frame loop) plus a
// compact React HUD that re-renders at most five times a second from the
// client's version counter, never per entity update. Movement is relative to
// the camera: Renderer3D.moveBasis() turns WASD into a tile-space direction.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BUILDINGS, EMOTES, FAMILIES, HARVEST_RANGE, STAGES, TOOLS, buildingName, type BuildingType, type Emote } from "../shared/content.ts";
import type { Building, Snapshot } from "../shared/protocol.ts";
import { averageLife } from "../shared/sim.ts";
import { GameClient } from "./net.ts";
import { Renderer3D } from "./render3d.ts";
import { CAMERA_LABEL, CAMERA_MODES, PLAYER_COLOURS, initialView, saveSettings, type CameraMode, type Tool, type View } from "./view.ts";
import { DcControls, Nearby, PackPanel, TownPanel, Vitals, interact } from "./Panels.tsx";
import { Atlas } from "./Atlas.tsx";
import { Sound, type Mix } from "./audio.ts";

const EMOTE_GLYPH: Record<Emote, string> = { wave: "👋", heart: "💛", laugh: "😄", wow: "😮", sad: "😢", point: "👉" };
/** [forward, right] per movement key */
const KEY_DIRS: Record<string, [number, number]> = {
  w: [1, 0], arrowup: [1, 0],
  s: [-1, 0], arrowdown: [-1, 0],
  a: [0, -1], arrowleft: [0, -1],
  d: [0, 1], arrowright: [0, 1],
};


const MECHANIC_HINT: Record<string, string> = {
  pollution: "Furnaces are strong but their smoke kills groves and browns the land. Sun Gardens are clean and slow.",
  pressure: "Nothing runs outside a Dome's air. Domes drink ice; so do datacentres. Watch the ice.",
  heat: "Collector Wings pour in power and heat. Over the limit, scoops throttle: radiators shed it.",
  relay: "No sunlight: every machine drinks from the Bottled Sun. Miners only ship if relays link them to the Depot.",
  legacy: "Your old worlds run as World Engines. The host can render one down for a burst of energy, for good.",
};

function useVersion(client: GameClient | null): number {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!client) return;
    let seen = -1;
    const id = setInterval(() => {
      if (client.version !== seen) {
        seen = client.version;
        setN((n) => n + 1);
      }
    }, 200);
    return () => clearInterval(id);
  }, [client]);
  return client?.version ?? 0;
}

const releasePointer = (): void => {
  if (typeof document !== "undefined" && document.pointerLockElement) document.exitPointerLock();
};

export default function Game({ room, name }: { room: string; name: string }): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [client, setClient] = useState<GameClient | null>(null);
  const rendererRef = useRef<Renderer3D | null>(null);
  const soundRef = useRef(new Sound());
  const viewRef = useRef<View>(initialView());
  const [, force] = useState(0);
  const [help, setHelp] = useState(false);
  const [naming, setNaming] = useState<[number, number] | null>(null);
  const [mix, setMix] = useState<Mix>({ music: 0.5, ambience: 0.7, effects: 0.8 });
  const [settings, setSettings] = useState(false);
  const [pack, setPack] = useState(false);
  const [atlas, setAtlas] = useState(false);
  const atlasOpen = useRef(false);
  atlasOpen.current = atlas;
  const [chatting, setChatting] = useState(false);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [locked, setLocked] = useState(false);
  useVersion(client);
  const view = viewRef.current;
  const rerender = (): void => force((n) => n + 1);

  useEffect(() => {
    const c = new GameClient(room, name);
    const canvas = canvasRef.current!;
    const r = new Renderer3D(canvas, c, viewRef.current);
    rendererRef.current = r;
    c.onAck = (ok, cmd) => {
      const snd = soundRef.current;
      if (!ok) snd.reject();
      else if (cmd.k === "harvest") snd.harvest();
      else if (cmd.k === "build") snd.build();
    };
    const prevBoundary = c.onBoundary;
    c.onBoundary = () => {
      prevBoundary?.();
      soundRef.current.boundary();
      viewRef.current.tool = "harvest";
      viewRef.current.build = null;
      viewRef.current.selected = null;
    };
    const onLock = (): void => setLocked(document.pointerLockElement === canvas);
    document.addEventListener("pointerlockchange", onLock);
    c.connect();
    r.start();
    setClient(c);
    return () => {
      document.removeEventListener("pointerlockchange", onLock);
      releasePointer();
      r.stop();
      c.close();
      soundRef.current.stop();
      rendererRef.current = null;
    };
  }, [room, name]);

  // keep the sound engine fed with the world's state, and the hand model with what's held
  const s = client?.state ?? null;
  useEffect(() => {
    if (!s || !client) return;
    const snd = soundRef.current;
    snd.life = averageLife(s);
    snd.machines = s.buildings.filter((b) => b.status === "ok" && b.owner).length;
    snd.stage = s.stage;
    snd.ended = s.phase.k === "ended" && s.phase.how !== "restraint";
    view.held = s.players[client.you]?.holding ?? null;
  });
  useEffect(() => soundRef.current.setMix(mix), [mix]);

  // a dialog or menu takes the mouse back; getting it again takes a deliberate click
  useEffect(() => {
    if (help || naming || settings || pack || atlas || chatting) releasePointer();
  }, [help, naming, settings, pack, atlas, chatting]);

  // keyboard
  useEffect(() => {
    if (!client) return;
    const held = new Set<string>();
    let sprint = false;
    let harvestTimer: ReturnType<typeof setInterval> | null = null;
    let basisSeen = -1;
    const sendMove = (force = false): void => {
      let f = 0;
      let r = 0;
      for (const k of held) {
        const d = KEY_DIRS[k];
        if (d) {
          f += d[0];
          r += d[1];
        }
      }
      let dx = 0;
      let dy = 0;
      const rend = rendererRef.current;
      if ((f || r) && rend) {
        const b = rend.moveBasis();
        dx = b.fx * f + b.rx * r;
        dy = b.fy * f + b.ry * r;
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        basisSeen = rend.basisVersion;
      }
      // a few decimals is plenty, and keeps tiny jitters from re-sending
      dx = Math.round(dx * 1000) / 1000;
      dy = Math.round(dy * 1000) / 1000;
      const sp = sprint && (dx !== 0 || dy !== 0);
      if (force || dx !== client.me.dx || dy !== client.me.dy || sp !== client.me.sprint) {
        client.me.dx = dx;
        client.me.dy = dy;
        client.me.sprint = sp;
        client.send({ k: "move", dx, dy, sprint: sp || undefined });
      }
    };
    // turning the camera while walking changes which way "forward" is
    const steer = setInterval(() => {
      const rend = rendererRef.current;
      if (rend && held.size && rend.basisVersion !== basisSeen) sendMove();
    }, 100);
    const down = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target instanceof Element ? e.target : null;
      // inside a dialog, Tab moves between its controls, and Esc (or the panel's own key) closes it
      if (el?.closest("dialog, [role=dialog]") && !el.closest("input, textarea, select")) {
        const key = e.key.toLowerCase();
        if (key === "escape" || (key === "m" && atlasOpen.current)) {
          setPack(false);
          setAtlas(false);
          setHelp(false);
          canvasRef.current?.focus();
        }
        return;
      }
      if (el?.closest("input, textarea, select")) return;
      if (el?.closest("button, a") && (e.key === "Enter" || e.key === " ")) return;
      const k = e.key.toLowerCase();
      const st = client.state ? STAGES[client.state.stage] : null;
      const rend = rendererRef.current;
      if (e.key === "Shift") {
        sprint = true;
        sendMove();
        return;
      }
      if (KEY_DIRS[k]) {
        e.preventDefault();
        held.add(k);
        viewRef.current.keyboardTarget = true;
        sendMove();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (!e.repeat) setPack((p) => !p);
        return;
      }
      if (k === " ") {
        e.preventDefault();
        rend?.jump();
        return;
      }
      if (e.repeat) return;
      if (k === "e") {
        e.preventDefault();
        quickHarvest();
        if (!harvestTimer) harvestTimer = setInterval(quickHarvest, 820);
      } else if (e.shiftKey && /^digit[1-6]$/i.test(e.code)) {
        e.preventDefault();
        client.send({ k: "emote", e: EMOTES[Number(e.code.slice(5)) - 1] });
      } else if (/^[1-9]$/.test(k) && st) {
        const type = st.buildings[Number(k) - 1];
        if (type) {
          e.preventDefault();
          chooseBuild(type);
        }
      } else if (k === "escape") {
        setTool("harvest");
        setHelp(false);
        setPack(false);
        setAtlas(false);
      } else if (k === "enter") {
        e.preventDefault();
        if (view.mode === "iso") viewRef.current.keyboardTarget = true;
        const tgt = rend?.target();
        if (tgt) act(tgt[0], tgt[1], rend?.aim().building ?? null, rend?.aim().animal ?? null);
      } else if (k === "c") cycleMode();
      else if ((k === "q" || k === "r") && view.mode === "iso") rend?.rotateIso(k === "q" ? -1 : 1);
      else if (k === "f") {
        if (client.state && !interact(client.state, client)) client.toast("Nothing close enough to use.", "bad");
      } else if (k === "g") cycleTool();
      else if (k === "x") setTool("demolish");
      else if (k === "i") setTool("inspect");
      else if (k === "n") setTool("mark");
      else if (k === "v") {
        viewRef.current.survey = !viewRef.current.survey;
        rerender();
      } else if (k === "p") photo();
      else if (k === "h" || k === "?") setHelp((h) => !h);
      else if (k === "m") setAtlas((a) => !a);
      else if (k === "t") {
        e.preventDefault();
        setChatting(true);
      }
      else if (k === "=" || k === "+") zoomBy(1.15);
      else if (k === "-") zoomBy(1 / 1.15);
    };
    const up = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase();
      if (e.key === "Shift") {
        sprint = false;
        sendMove();
      }
      if (held.delete(k)) sendMove();
      if (k === "e" && harvestTimer) {
        clearInterval(harvestTimer);
        harvestTimer = null;
      }
    };
    const blur = (): void => {
      held.clear();
      sprint = false;
      sendMove();
      releasePointer();
      if (harvestTimer) clearInterval(harvestTimer);
      harvestTimer = null;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      clearInterval(steer);
      if (harvestTimer) clearInterval(harvestTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  function setTool(tool: Tool): void {
    view.tool = tool;
    if (tool !== "build") view.build = null;
    if (tool !== "inspect") view.selected = null;
    rerender();
  }

  function chooseBuild(type: BuildingType): void {
    view.tool = "build";
    view.build = type;
    view.selected = null;
    rerender();
  }

  function zoomBy(k: number): void {
    view.zoom = Math.max(0.5, Math.min(2.2, view.zoom * k));
  }

  function setMode(m: CameraMode): void {
    rendererRef.current?.setMode(m);
    view.mode = m;
    if (m === "iso") releasePointer();
    saveSettings(view);
    rerender();
  }

  function cycleMode(): void {
    setMode(CAMERA_MODES[(CAMERA_MODES.indexOf(view.mode) + 1) % CAMERA_MODES.length]);
  }

  function updateSettings(patch: Partial<View>): void {
    Object.assign(view, patch);
    saveSettings(view);
    rerender();
  }

  /** G: the next tool in your pack you can hold, then bare hands. */
  function cycleTool(): void {
    const c = client;
    const st = c?.state;
    if (!c || !st) return;
    const tools = (st.me?.tools ?? []).filter((t) => !TOOLS[t.kind]?.armour);
    if (!tools.length) return c.toast("No tools yet: make one in your pack (Tab).", "bad");
    const current = st.players[c.you]?.holdingId ?? 0;
    const at = tools.findIndex((t) => t.id === current);
    const next = at === -1 ? tools[0] : tools[at + 1];
    c.send({ k: "hold", tool: next ? next.id : 0 });
  }

  const useful = (st: Snapshot, x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= st.w || y >= st.w) return false;
    const t = st.tiles[y * st.w + x];
    const site = t.b ? st.buildings.find((b) => b.id === t.b) : undefined;
    return !!((t.d && t.amt > 0) || (site && site.work < BUILDINGS[site.type].build * 10));
  };

  /** Harvest (or help build) the best thing in reach: the forgiving keyboard path. In first and third person, what you aim at wins if it's in reach. */
  function quickHarvest(): void {
    const c = client;
    const st = c?.state;
    if (!c || !st) return;
    let best: [number, number] | null = null;
    const aimed = view.mode !== "iso" ? rendererRef.current?.aim().tile : null;
    if (aimed && useful(st, aimed[0], aimed[1]) && Math.hypot(aimed[0] - c.me.x, aimed[1] - c.me.y) <= HARVEST_RANGE - 0.1) best = aimed;
    let bd = Infinity;
    const r = Math.ceil(HARVEST_RANGE);
    if (!best)
      for (let y = Math.floor(c.me.y) - r; y <= Math.ceil(c.me.y) + r; y++)
        for (let x = Math.floor(c.me.x) - r; x <= Math.ceil(c.me.x) + r; x++) {
          const d = Math.hypot(x - c.me.x, y - c.me.y);
          if (useful(st, x, y) && d <= HARVEST_RANGE - 0.1 && d < bd) [bd, best] = [d, [x, y]];
        }
    if (best) {
      c.send({ k: "harvest", x: best[0], y: best[1] });
      soundRef.current.tap();
    } else c.toast("Nothing in reach to harvest. Press V to survey.", "bad");
  }

  /** The one action path for every camera: the server decides reach and validity. */
  function act(x: number, y: number, building: Building | null = null, animal: NonNullable<Snapshot["animals"]>[number] | null = null): void {
    const c = client;
    const st = c?.state;
    if (!c || !st) return;
    if (animal && (view.tool === "harvest" || view.tool === "inspect")) {
      c.send(animal.dead ? { k: "butcher", animal: animal.id } : { k: "hit", animal: animal.id });
      soundRef.current.tap();
      return;
    }
    if (building && view.tool !== "build" && view.tool !== "mark") [x, y] = [building.x, building.y];
    if (x < 0 || y < 0 || x >= st.w || y >= st.w) return;
    const t = st.tiles[y * st.w + x];
    switch (view.tool) {
      case "build":
        if (view.build) c.send({ k: "build", x, y, type: view.build });
        break;
      case "demolish":
        if (t.b) c.send({ k: "demolish", x, y });
        break;
      case "mark":
        setNaming([x, y]);
        break;
      case "inspect":
        view.selected = t.b || null;
        rerender();
        break;
      default:
        if ((t.d && t.amt > 0) || t.b) {
          const site = t.b ? st.buildings.find((b) => b.id === t.b) : undefined;
          if (site && site.work >= BUILDINGS[site.type].build * 10) {
            view.selected = site.id;
            rerender();
          } else {
            c.send({ k: "harvest", x, y });
            soundRef.current.tap();
          }
        } else view.selected = null;
        rerender();
    }
  }

  function photo(): void {
    const url = rendererRef.current?.photo();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `plenty-${client?.state ? STAGES[client.state.stage].id : "world"}-${Date.now()}.png`;
    a.click();
    client?.toast("Photo saved.");
  }

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (view.mode !== "iso") return;
    const rect = e.currentTarget.getBoundingClientRect();
    view.hover = rendererRef.current?.pick(e.clientX - rect.left, e.clientY - rect.top) ?? null;
    view.keyboardTarget = false;
  };
  const onClick = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0) return;
    const rend = rendererRef.current;
    if (!rend) return;
    const canvas = e.currentTarget;
    if (view.mode !== "iso") {
      // first and third person aim with the crosshair; with a mouse, the first click only takes the pointer
      if (e.pointerType === "mouse" && document.pointerLockElement !== canvas) {
        const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => undefined);
        return;
      }
      if (e.pointerType === "touch") return;
      const a = rend.aim();
      if (a.tile) act(a.tile[0], a.tile[1], a.building, a.animal);
      return;
    }
    onPointer(e);
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const animal = rend.pickAnimal(sx, sy);
    // a tall building is picked by what you see of it, not only its footprint
    const b = view.tool === "harvest" || view.tool === "inspect" || view.tool === "demolish" ? rend.pickBuilding(sx, sy) : null;
    if (animal) return act(Math.round(animal.x), Math.round(animal.y), null, animal);
    if (b) return act(b.x, b.y, b);
    if (view.hover) act(view.hover[0], view.hover[1]);
  };
  // a tap (not a drag) on a touch screen acts where it lands, in every camera
  const tapRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (e.pointerType !== "touch" || view.mode === "iso") return;
    const t0 = tapRef.current;
    tapRef.current = null;
    if (!t0 || Math.hypot(e.clientX - t0.x, e.clientY - t0.y) > 10 || performance.now() - t0.t > 400) return;
    const rend = rendererRef.current;
    if (!rend) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const animal = rend.pickAnimal(sx, sy);
    const b = rend.pickBuilding(sx, sy);
    const tile = rend.pick(sx, sy);
    if (animal) act(Math.round(animal.x), Math.round(animal.y), null, animal);
    else if (tile) act(tile[0], tile[1], b);
  };

  const st = s ? STAGES[s.stage] : null;
  const host = !!(s && client && s.hostId === client.you);
  const firstPerson = view.mode !== "iso";

  return (
    <main className="game">
      <h1 className="sr-only">{st ? `Plenty: ${st.name}, room ${room}` : "Plenty"}</h1>
      <canvas
        ref={canvasRef}
        className="world"
        tabIndex={0}
        aria-label={st ? `${st.name}: the shared world, ${CAMERA_LABEL[view.mode].toLowerCase()} view. Move with WASD or arrows, harvest with E, C changes the camera.` : "Loading the world"}
        onPointerMove={onPointer}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") tapRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
          onClick(e);
        }}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          setTool("harvest");
        }}
        onMouseDown={(e) => {
          if (e.button === 2) setTool("harvest");
        }}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1)}
      />
      {firstPerson && s && (
        <div className={`crosshair ${view.tool}`} aria-hidden="true">
          <span />
        </div>
      )}
      {firstPerson && s && !locked && !help && !naming && !settings && !pack && !atlas && !chatting && s.phase.k === "play" && (
        <p className="lock-hint" aria-hidden="true">Click the world to look around · C changes camera</p>
      )}
      {!s || !client || !st ? (
        <div className="overlay center">
          <div className="card">
            <p className="title">Plenty</p>
            <p>{client?.status === "error" ? client.error : "Walking to the world…"}</p>
            {client?.status === "error" && <a href="/">Back to the start</a>}
          </div>
        </div>
      ) : (
        <>
          <div className="col-left">
            <StagePanel s={s} />
            <Vitals s={s} client={client} />
            <Economy s={s} />
            <TownPanel s={s} host={host} client={client} />
            {st.id === "earth" && s.phase.k === "play" && <Memo s={s} />}
          {st.id === "universe" && s.phase.k === "play" && <LastFrontier s={s} you={client.you} onVote={(on) => client.send({ k: "stop", on })} />}
          </div>
          <RoomPanel s={s} client={client} host={host} />
          <BuildBar s={s} view={view} onPick={chooseBuild} onTool={setTool} />
          <Log s={s} client={client} muted={muted} onMute={(id) => setMuted((m) => new Set(m).add(id))} />
          {chatting && <ChatBox onSend={(text) => client.send({ k: "say", text })} onClose={() => setChatting(false)} />}
          {view.selected === null && <Nearby s={s} client={client} />}
          {view.selected !== null && <Inspect s={s} client={client} b={s.buildings.find((b) => b.id === view.selected)} youId={client.you} host={host} onDemolish={(b) => client.send({ k: "demolish", x: b.x, y: b.y })} onClose={() => setTool("harvest")} />}
          {pack && <PackPanel s={s} client={client} onClose={() => setPack(false)} />}
          {atlas && <Atlas s={s} onClose={() => setAtlas(false)} />}
          <div className="corner-buttons">
            <div className="emotes" role="group" aria-label="Emotes">
              {EMOTES.map((e, i) => (
                <button key={e} type="button" title={`${e} (Shift+${i + 1})`} aria-label={`Emote: ${e}`} onClick={() => client.send({ k: "emote", e })}>
                  {EMOTE_GLYPH[e]}
                </button>
              ))}
            </div>
            <button type="button" onClick={cycleMode} title="Change camera (C)">
              {CAMERA_LABEL[view.mode]} (C)
            </button>
            <button type="button" onClick={() => { view.survey = !view.survey; rerender(); }} aria-pressed={view.survey}>
              Survey (V)
            </button>
            <button type="button" onClick={photo}>Photo (P)</button>
            <button type="button" onClick={() => { if (!soundRef.current.running) soundRef.current.start(mix); setSettings((v) => !v); }} aria-expanded={settings}>
              Settings
            </button>
            <button type="button" onClick={() => setPack(true)}>Pack (Tab)</button>
            <button type="button" onClick={() => setAtlas(true)}>Atlas (M)</button>
            <button type="button" onClick={() => setChatting(true)}>Talk (T)</button>
            <button type="button" onClick={() => setHelp(true)}>Help (H)</button>
          </div>
          {settings && (
            <div className="panel settings" role="group" aria-label="Settings">
              <label>
                camera
                <select value={view.mode} onChange={(e) => setMode(e.target.value as CameraMode)}>
                  {CAMERA_MODES.map((m) => (
                    <option key={m} value={m}>{CAMERA_LABEL[m]}</option>
                  ))}
                </select>
              </label>
              <label>
                field of view {view.fov}°
                <input type="range" min={60} max={100} step={1} value={view.fov} onChange={(e) => updateSettings({ fov: Number(e.target.value) })} />
              </label>
              <label>
                mouse sensitivity {view.sensitivity.toFixed(1)}
                <input type="range" min={0.2} max={3} step={0.1} value={view.sensitivity} onChange={(e) => updateSettings({ sensitivity: Number(e.target.value) })} />
              </label>
              <label>
                <input type="checkbox" checked={view.invertY} onChange={(e) => updateSettings({ invertY: e.target.checked })} /> invert mouse Y
              </label>
              <label>
                <input type="checkbox" checked={view.bob} onChange={(e) => updateSettings({ bob: e.target.checked })} /> camera bob
              </label>
              {(Object.keys(mix) as (keyof Mix)[]).map((k) => (
                <label key={k}>
                  {k}
                  <input type="range" min={0} max={1} step={0.05} value={mix[k]} onChange={(e) => setMix({ ...mix, [k]: Number(e.target.value) })} />
                </label>
              ))}
              <label>
                <input type="checkbox" checked={view.reducedMotion} onChange={(e) => updateSettings({ reducedMotion: e.target.checked })} /> reduced motion
              </label>
              <label>
                <input type="checkbox" checked={view.low} onChange={(e) => updateSettings({ low: e.target.checked })} /> low detail
              </label>
              <p className="small">
                frame {rendererRef.current?.frameMs.toFixed(1)} ms · ping {client.rtt} ms
              </p>
            </div>
          )}
          {help && <Help onClose={() => setHelp(false)} st={st} />}
          {naming && (
            <NameDialog
              onCancel={() => setNaming(null)}
              onName={(n) => {
                client.send({ k: "mark", x: naming[0], y: naming[1], name: n });
                setNaming(null);
                setTool("harvest");
              }}
            />
          )}
          {s.phase.k === "transition" && <Transition s={s} />}
          {s.phase.k === "ended" && <Ending s={s} />}
          <Toasts client={client} />
          {client.status === "reconnecting" && (
            <div className="overlay center" role="status">
              <div className="card">
                <p className="title">Reconnecting…</p>
                <p>The world is safe on the server. You'll be back where you were in a moment.</p>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function StagePanel({ s }: { s: Snapshot }): ReactNode {
  const st = STAGES[s.stage];
  const life = averageLife(s);
  return (
      <div className="panel top-left">
        <p className="stage">
          <span className="stage-n">Stage {s.stage + 1} of 5</span> <strong>{st.name}</strong>
        </p>
        <p className="small">{st.tagline}</p>
        <ul className="stocks" aria-label="Natural stock remaining">
          {FAMILIES.map((f) => {
            const l = s.ledger[f];
            const pct = l.initial ? (l.remaining / l.initial) * 100 : 0;
            return (
              <li key={f}>
                <span className="lbl">{st.families[f].label}</span>
                <span className="bar" aria-hidden="true">
                  <span style={{ width: `${pct}%`, background: st.palette[f] }} />
                </span>
                <span className="num">
                  {l.remaining}/{l.initial}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="small">
          {st.id === "earth" ? "Living land" : "Untouched ground"}: <strong>{life}%</strong>
          {st.mechanic === "heat" && (
            <>
              {" "}· Heat: <strong>{s.heat}</strong>/100{s.heat >= 70 ? " (throttling)" : ""}
            </>
          )}
          {st.energySource === "bottled" && (
            <>
              {" "}· Bottled Sun: <strong>{s.reserve}</strong> energy left
            </>
          )}
        </p>
      </div>
  );
}

function RoomPanel({ s, client, host }: { s: Snapshot; client: GameClient; host: boolean }): ReactNode {
  const [copied, setCopied] = useState(false);
  const status = { live: "connected", connecting: "connecting…", reconnecting: "reconnecting…", error: "disconnected" }[client.status];
  return (
      <div className="panel top-right">
        <p>
          Room <strong className="code">{s.code}</strong>{" "}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(`${location.origin}/play/?room=${s.code}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Link copied" : "Copy invite link"}
          </button>
        </p>
        <p className="small" role="status">
          <span className={`dot ${client.status}`} aria-hidden="true" /> {status}
          {s.pace === "rapid" ? " · rapid preset" : ""}
        </p>
        <ul className="roster" aria-label="Players">
          {Object.values(s.players)
            .sort((a, b) => Number(b.connected) - Number(a.connected))
            .map((p) => (
              <li key={p.id} className={p.connected ? "" : "away"}>
                <span className="swatch" style={{ background: PLAYER_COLOURS[p.colour % 8] }} aria-hidden="true" />
                {p.name}
                {p.id === client.you ? " (you)" : ""}
                {s.hostId === p.id ? " · host" : ""}
                {p.connected ? "" : " · away"}
              </li>
            ))}
        </ul>
        {host && <p className="small">You're the host: you can take down anyone's buildings.</p>}
      </div>
  );
}

function Economy({ s }: { s: Snapshot }): ReactNode {
  const st = STAGES[s.stage];
  const e = s.econ;
  // the shortage most of the machine is waiting on, so nobody has to inspect buildings one by one
  const idle = s.buildings.filter((b) => b.status !== "ok" && b.work >= BUILDINGS[b.type].build * 10);
  const tally = new Map<string, number>();
  for (const b of idle) tally.set(b.status, (tally.get(b.status) ?? 0) + 1);
  const top = [...tally].sort((a, b) => b[1] - a[1])[0];
  const bottleneck = top ? { n: idle.length, why: top[0] } : null;
  return (
    <div className="panel left">
      <h2>Cooperative store (shared)</h2>
      <ul className="inv">
        {FAMILIES.map((f) => (
          <li key={f}>
            <span className="swatch" style={{ background: st.palette[f] }} aria-hidden="true" />
            {st.families[f].label}: <strong>{s.inventory[f]}</strong>
          </li>
        ))}
      </ul>
      <ul className="inv small">
        <li>
          Power {e.energyUsed}/{e.energySupply}
        </li>
        <li>
          Compute {e.computeUsed}/{e.computeSupply}
        </li>
        <li>
          Workers {e.workersUsed}/{e.workersSupply}
        </li>
      </ul>
      {bottleneck && (
        <p className="small bottleneck">
          <strong>⚠ {bottleneck.n} idle</strong>, mostly “{bottleneck.why.replace(/^(idle|unserved|throttled): /, "")}”
        </p>
      )}
    </div>
  );
}

function Memo({ s }: { s: Snapshot }): ReactNode {
  const has = (t: BuildingType): boolean => s.buildings.some((b) => b.type === t && b.owner);
  const steps: [string, boolean][] = [
    ["Gather timber and stone (hold E near a tree or rock)", s.ledger.matter.extracted + s.ledger.mineral.extracted >= 20],
    ["Make a stone axe or pick (Tab), then hold it (G)", !!s.me?.tools.length],
    ["Put down a Campfire and a Chest of your own", has("campfire") && has("chest")],
    ["Give stock to the Cooperative store (Tab)", FAMILIES.some((f) => s.inventory[f] > 0) || has("city")],
    ["Build Cottages: residents drink water from the store, so give it some", has("city")],
    ["Power them: a Furnace or a Sun Garden", has("furnace") || has("solar")],
    ["Build a Datacentre (it drinks pond water)", has("datacentre")],
    ["Put a Harvester beside a grove", has("extractor")],
    ["Name a favourite place (N)", s.tiles.some((t) => t.mark && t.mark.by !== "the Cooperative") || s.archive.length > 0],
  ];
  const next = steps.findIndex(([, done]) => !done);
  if (next === -1) return null;
  return (
    <div className="panel memo">
      <h2>Cooperative memo</h2>
      <ol>
        {steps.map(([text, done], i) => (
          <li key={text} className={done ? "done" : i === next ? "next" : ""}>
            {done ? "✓ " : ""}
            {text}
          </li>
        ))}
      </ol>
    </div>
  );
}

function LastFrontier({ s, you, onVote }: { s: Snapshot; you: string; onVote: (on: boolean) => void }): ReactNode {
  const here = Object.values(s.players).filter((p) => p.connected);
  const ready = here.filter((p) => p.stop).length;
  const mine = !!s.players[you]?.stop;
  const left = FAMILIES.reduce((a, f) => a + s.ledger[f].remaining, 0);
  return (
    <div className="panel memo">
      <h2>The last frontier</h2>
      <p className="small">
        {left} units of the Universe are left. You could stop here and leave them alone, for good. Everyone here has to agree; harvesting or building takes your vote back.
      </p>
      <p className="small">
        <strong>
          {ready} of {here.length}
        </strong>{" "}
        here want to stop.
      </p>
      <button type="button" aria-pressed={mine} onClick={() => onVote(!mine || ready === here.length)}>
        {mine ? (ready === here.length ? "Stop for good" : "Keep going instead") : "Stop here"}
      </button>
    </div>
  );
}

function BuildBar({ s, view, onPick, onTool }: { s: Snapshot; view: View; onPick: (t: BuildingType) => void; onTool: (t: Tool) => void }): ReactNode {
  const st = STAGES[s.stage];
  return (
    <div className="panel bottom" role="toolbar" aria-label="Build and tools">
      {st.buildings.map((type, i) => {
        const def = BUILDINGS[type];
        const short = FAMILIES.filter((f) => (def.cost[f] ?? 0) > s.inventory[f]);
        const cost = FAMILIES.filter((f) => def.cost[f]).map((f) => `${def.cost[f]} ${st.families[f].label}`).join(", ");
        return (
          <button
            key={type}
            type="button"
            className={`build ${view.build === type ? "on" : ""} ${short.length ? "short" : ""}`}
            aria-pressed={view.build === type}
            title={def.blurb}
            aria-label={`${buildingName(st, type)}, costs ${cost || "nothing"}${short.length ? ", can't afford yet" : ""}`}
            onClick={() => onPick(type)}
          >
            <span className="key">{i + 1}</span>
            <span className="bname">{buildingName(st, type)}</span>
            <span className="cost">
              {short.length ? "✕ " : ""}
              {cost || "free"}
            </span>
          </button>
        );
      })}
      <span className="sep" aria-hidden="true" />
      {(["harvest", "inspect", "demolish", "mark"] as Tool[]).map((t) => (
        <button key={t} type="button" className={`tool ${view.tool === t ? "on" : ""}`} aria-pressed={view.tool === t} onClick={() => onTool(t)}>
          {{ harvest: "Harvest (E)", inspect: "Inspect (I)", demolish: "Take down (X)", mark: "Name (N)", build: "" }[t]}
        </button>
      ))}
    </div>
  );
}

function Log({ s, client, muted, onMute }: { s: Snapshot; client: GameClient; muted: Set<string>; onMute: (id: string) => void }): ReactNode {
  const lines = s.log.filter((l) => !l.by || !muted.has(l.by)).slice(-5);
  return (
    <div className="panel log" aria-live="polite" aria-label="Activity and talk">
      {lines.map((l, i) => (
        <p key={`${l.tick}-${i}`} className={l.by ? "said" : ""}>
          {l.text}
          {l.by && l.by !== client.you && (
            <button type="button" className="mute" onClick={() => onMute(l.by!)} aria-label={`Mute ${s.players[l.by]?.name ?? "them"}`} title="Mute">
              mute
            </button>
          )}
        </p>
      ))}
    </div>
  );
}

function ChatBox({ onSend, onClose }: { onSend: (text: string) => void; onClose: () => void }): ReactNode {
  const [v, setV] = useState("");
  return (
    <form
      className="panel chat"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onSend(v.trim());
        onClose();
      }}
    >
      <label className="sr-only" htmlFor="chat-in">
        Say something to the room
      </label>
      <input id="chat-in" autoFocus maxLength={120} value={v} placeholder="Say something (Enter sends, Esc cancels)" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onClose()} onBlur={onClose} />
    </form>
  );
}

function Inspect({ s, client, b, youId, host, onDemolish, onClose }: { s: Snapshot; client: GameClient; b: Building | undefined; youId: string; host: boolean; onDemolish: (b: Building) => void; onClose: () => void }): ReactNode {
  if (!b) return null;
  const st = STAGES[s.stage];
  const def = BUILDINGS[b.type];
  const owner = b.owner ? (s.players[b.owner]?.name ?? "someone") : "the Cooperative";
  const done = b.work >= def.build * 10;
  const io: string[] = [];
  if (def.energy) io.push(def.energy > 0 ? `+${def.energy * (b.type === "solar" ? st.solarScale : 1)} power` : `uses ${-def.energy} power`);
  if (def.workers) io.push(def.workers > 0 ? `houses ${def.workers}–5 workers` : `employs ${-def.workers} workers`);
  if (def.compute) io.push(def.compute > 0 ? `+${def.compute} compute` : `uses ${-def.compute} compute`);
  if (def.coolantUse) io.push(`drinks ${def.coolantUse} ${st.families.coolant.label}`);
  if (def.fuelUse) io.push(`burns ${def.fuelUse} ${st.families.matter.label}`);
  if (def.extract) io.push(`harvests ${def.extract} from a neighbour`);
  const canDemolish = !def.protected && (def.renderValue ? host : b.owner === youId || host);
  return (
    <div className="panel inspect" role="dialog" aria-label={`${buildingName(st, b.type)} details`}>
      <h2>{b.name ?? buildingName(st, b.type)}</h2>
      <p className="small">Built by {owner}. {def.blurb}</p>
      <p>
        Status: <strong>{done ? (b.status === "ok" ? "running" : b.status) : `under construction (${Math.round((b.work / (def.build * 10)) * 100)}%) — press E beside it to help`}</strong>
      </p>
      <p className="small">Per tick: {io.join(" · ") || "nothing"}</p>
      <DcControls b={b} client={client} canTune={b.owner === youId || host} />
      <div className="row">
        {canDemolish && (
          <button type="button" onClick={() => onDemolish(b)}>
            {def.renderValue ? `Render down (+${def.renderValue} energy, forever)` : "Take down (half back)"}
          </button>
        )}
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function Help({ onClose, st }: { onClose: () => void; st: (typeof STAGES)[number] }): ReactNode {
  return (
    <div className="overlay center" role="dialog" aria-modal="true" aria-labelledby="help-h">
      <div className="card help">
        <h2 id="help-h">How to play</h2>
        <ul>
          <li><kbd>WASD</kbd> or arrows: walk, relative to the camera. <kbd>Shift</kbd>: sprint. <kbd>Space</kbd>: hop (just for show).</li>
          <li><kbd>C</kbd>: change camera (first person, third person, isometric). First and third person: click the world, then the mouse looks around; <kbd>Esc</kbd> lets the mouse go. Isometric: <kbd>Q</kbd>/<kbd>R</kbd> rotate, wheel or <kbd>+</kbd>/<kbd>-</kbd> zoom.</li>
          <li><kbd>E</kbd> (hold): harvest what you aim at if it's in reach, otherwise the nearest thing, or help raise a building site. Click: act on what the crosshair (or, in isometric, the pointer) is on. Reach is the same in every camera.</li>
          <li><kbd>1</kbd>–<kbd>9</kbd>: pick a building. A ghost shows where it goes and why it can't. Click, or <kbd>Enter</kbd>. Right click or <kbd>Esc</kbd> cancels.</li>
          <li><kbd>Tab</kbd> pack and crafting · <kbd>F</kbd> use what's beside you · <kbd>G</kbd> change the tool in hand.</li>
          <li><kbd>I</kbd> inspect · <kbd>X</kbd> take down (half back) · <kbd>N</kbd> name a place · <kbd>V</kbd> survey the remaining stock · <kbd>P</kbd> photo · <kbd>Shift</kbd>+<kbd>1</kbd>–<kbd>6</kbd> emote.</li>
        </ul>
        <p>What you gather goes into your own pack, which only you can see. Give raw stock to the Cooperative store (Tab) to build the shared works: cottages, power, datacentres. Campfires, workbenches and chests come out of your own pack. Only the builder or the host can take a building down.</p>
        <p><kbd>T</kbd> talks to the room · <kbd>M</kbd> the World Atlas.</p>
        <p>When every deposit on this world is gone, the room moves on together. There are five worlds.</p>
        <p><strong>{st.name}:</strong> {MECHANIC_HINT[st.mechanic]}</p>
        <button type="button" onClick={onClose} autoFocus>Back to the world</button>
      </div>
    </div>
  );
}

function NameDialog({ onName, onCancel }: { onName: (n: string) => void; onCancel: () => void }): ReactNode {
  const [v, setV] = useState("");
  return (
    <div className="overlay center" role="dialog" aria-modal="true" aria-labelledby="name-h">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) onName(v.trim());
        }}
      >
        <h2 id="name-h">Name this place</h2>
        <label>
          Name <input autoFocus maxLength={24} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()} />
        </label>
        <div className="row">
          <button type="submit">Name it</button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function Transition({ s }: { s: Snapshot }): ReactNode {
  if (s.phase.k !== "transition") return null;
  const sum = s.phase.summary;
  const st = STAGES.find((x) => x.id === sum.stage)!;
  const next = STAGES[s.stage + 1];
  const secs = Math.max(0, Math.ceil((s.phase.until - s.tick) / 10));
  return (
    <div className="overlay bottom-card" role="status">
      <div className="card transition">
        <h2>{st.departure}</h2>
        <table>
          <thead>
            <tr><th scope="col">Stock</th><th scope="col">Was</th><th scope="col">Extracted</th><th scope="col">Destroyed</th></tr>
          </thead>
          <tbody>
            {FAMILIES.map((f) => (
              <tr key={f}>
                <th scope="row">{st.families[f].label}</th>
                <td>{sum.ledger[f].initial}</td>
                <td>{sum.ledger[f].extracted}</td>
                <td>{sum.ledger[f].destroyed}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          {st.id === "earth" ? "Living land" : "Untouched ground"}: {sum.lifeStart}% → {sum.lifeEnd}%.{" "}
          {sum.lost.length ? `Lost: ${sum.lost.join(", ")}.` : ""}
        </p>
        <p className="small">{next ? `Leaving for ${next.name} in ${secs}s.` : `The engine looks for a next frontier… ${secs}s`}</p>
      </div>
    </div>
  );
}

function Ending({ s }: { s: Snapshot }): ReactNode {
  const total = s.history.reduce((a, h) => a + FAMILIES.reduce((b, f) => b + h.ledger[f].extracted + h.ledger[f].destroyed, 0), 0);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (hidden)
    return (
      <div className="overlay bottom-card">
        <button type="button" onClick={() => setHidden(false)}>
          Back to the ending
        </button>
      </div>
    );
  const restraint = s.phase.k === "ended" && s.phase.how === "restraint";
  const left = FAMILIES.reduce((a, f) => a + s.ledger[f].remaining, 0);
  const hands = `${Object.keys(s.players).length} pair${Object.keys(s.players).length === 1 ? "" : "s"} of hands`;
  return (
    <div className="overlay center ending" role="dialog" aria-labelledby="end-h">
      <div className={`card ${restraint ? "dawn" : "dark"}`}>
        {restraint ? (
          <>
            <h2 id="end-h">You stopped.</h2>
            <p>
              Four worlds and most of a fifth, {total.toLocaleString("en-AU")} units of everything, consumed by {hands}. {left.toLocaleString("en-AU")} units of the Universe are
              still out there, and will stay there.
            </p>
            <p>The Cooperative's machine idles. It could have finished. Nobody asked it to.</p>
          </>
        ) : (
          <>
            <h2 id="end-h">There is nothing left.</h2>
            <p>Five worlds, {total.toLocaleString("en-AU")} units of everything, consumed by {hands}.</p>
            <p>The machine runs perfectly. It has no input. Somewhere in its last datacentre, a process is still searching for a next frontier.</p>
            <p className="search" aria-hidden="true">searching… 0 found</p>
          </>
        )}
        <h3>What was named, and what became of it</h3>
        <ul className="archive">
          {s.archive.map((a, i) => (
            <li key={i}>
              <strong>{a.name}</strong> ({STAGES.find((x) => x.id === a.stage)?.name}) {a.fate}.
            </li>
          ))}
        </ul>
        <h3>Who did it</h3>
        <ul>
          {Object.values(s.players).map((p) => (
            <li key={p.id}>
              {p.name}: harvested {p.stats.harvested}, built {p.stats.built}, helped {p.stats.helped} times
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pace: s.pace }) });
            const { code } = (await res.json()) as { code: string };
            location.href = `/play/?room=${code}`;
          }}
        >
          Start a new campaign, somewhere else
        </button>{" "}
        <button type="button" onClick={() => setHidden(true)}>
          Look at what's left
        </button>
      </div>
    </div>
  );
}

function Toasts({ client }: { client: GameClient }): ReactNode {
  return (
    <div className="toasts" aria-live="assertive">
      {client.toasts.map((t) => (
        <p key={t.id} className={t.kind}>
          {t.kind === "bad" ? "✕ " : ""}
          {t.text}
        </p>
      ))}
    </div>
  );
}
