// What the player is looking at and how: the tool in hand, the camera, and the
// look settings. One mutable object shared by the HUD (which writes it) and the
// renderer (which reads it every frame), so neither re-renders the other.
import type { BuildingType, ToolKind } from "../shared/content.ts";

export type Tool = "harvest" | "build" | "inspect" | "demolish" | "mark";
export type CameraMode = "first" | "third" | "iso";
export const CAMERA_MODES: CameraMode[] = ["first", "third", "iso"];
export const CAMERA_LABEL: Record<CameraMode, string> = { first: "First person", third: "Third person", iso: "Isometric" };

export interface View {
  tool: Tool;
  build: BuildingType | null;
  hover: [number, number] | null;
  /** keyboard placement: the tile in front of the avatar, used when the mouse is idle (isometric) */
  keyboardTarget: boolean;
  survey: boolean;
  selected: number | null;
  reducedMotion: boolean;
  low: boolean;
  zoom: number;
  mode: CameraMode;
  /** vertical field of view in degrees, first and third person */
  fov: number;
  sensitivity: number;
  invertY: boolean;
  /** subtle head bob while walking in first person */
  bob: boolean;
  /** the tool in hand, for the first-person view model; null is bare hands */
  held: ToolKind | null;
}

export const PLAYER_COLOURS = ["#e8735a", "#4f9de0", "#f2c14e", "#8fcf6a", "#b47ce0", "#f08ab8", "#4fc6b8", "#c9905a"];

const KEY = "plenty:settings";
type Saved = Partial<Pick<View, "mode" | "fov" | "sensitivity" | "invertY" | "bob" | "low" | "reducedMotion">>;

const prefersReducedMotion = (): boolean => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initialView(): View {
  let saved: Saved = {};
  try {
    saved = (JSON.parse(localStorage.getItem(KEY) ?? "{}") as Saved) ?? {};
  } catch {
    saved = {};
  }
  const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  return {
    tool: "harvest",
    build: null,
    hover: null,
    keyboardTarget: true,
    survey: false,
    selected: null,
    reducedMotion: typeof saved.reducedMotion === "boolean" ? saved.reducedMotion : prefersReducedMotion(),
    low: saved.low === true,
    zoom: 1,
    mode: saved.mode && CAMERA_MODES.includes(saved.mode) ? saved.mode : "third",
    fov: num(saved.fov, 60, 100, 75),
    sensitivity: num(saved.sensitivity, 0.2, 3, 1),
    invertY: saved.invertY === true,
    bob: saved.bob !== false,
    held: null,
  };
}

export function saveSettings(v: View): void {
  const out: Saved = { mode: v.mode, fov: v.fov, sensitivity: v.sensitivity, invertY: v.invertY, bob: v.bob, low: v.low, reducedMotion: v.reducedMotion };
  try {
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    // private browsing: settings just don't persist
  }
}
