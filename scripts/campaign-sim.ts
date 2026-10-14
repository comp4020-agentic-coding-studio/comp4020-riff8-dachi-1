#!/usr/bin/env node
// A headless whole campaign through the real rules: N hand-harvest bots that
// give everything they gather to the Cooperative store, eat when hungry, and
// otherwise just harvest. Prints when each world ends and checks the books
// every tick. The slowest honest strategy, used for pacing.
//
//   node scripts/campaign-sim.ts [players=2] [normal|rapid]
import { FAMILIES, STAGES } from "../shared/content.ts";
import type { RoomState } from "../shared/protocol.ts";
import { applyCommand, createRoom, join, ledgerHolds, newChanges, tick } from "../shared/sim.ts";

const players = Number(process.argv[2] ?? 2);
const pace = process.argv[3] === "rapid" ? "rapid" : "normal";
const s: RoomState = createRoom("SIMUL", 42, pace);
const ch = newChanges();
const ids = Array.from({ length: players }, (_, i) => `bot${i}`);
for (const id of ids) join(s, id, `tok-${id}`, id, ch);
let n = 0;
const cmd = (pid: string, c: Parameters<typeof applyCommand>[4]) => applyCommand(s, pid, `c${n++}`, s.gen, c, ch);

function act(pid: string): void {
  const p = s.players[pid];
  const pv = s.priv[pid];
  for (const f of FAMILIES) if ((pv.items[f] ?? 0) > 0) cmd(pid, { k: "donate", item: f, n: pv.items[f]! });
  if (pv.food < 50) {
    // no campfire in this bot's plan: it eats raw meat if it has any, and otherwise goes hungry
    if (pv.items.meat) cmd(pid, { k: "eat", item: "meat" });
  }
  let best = -1;
  let bd = Infinity;
  s.tiles.forEach((t, i) => {
    if (!t.d || t.amt <= 0) return;
    const d = Math.hypot((i % s.w) - p.x, Math.floor(i / s.w) - p.y);
    if (d < bd) [bd, best] = [d, i];
  });
  if (best < 0) return;
  const [x, y] = [best % s.w, Math.floor(best / s.w)];
  if (bd > 1.5) cmd(pid, { k: "move", dx: x - p.x, dy: y - p.y });
  else {
    cmd(pid, { k: "move", dx: 0, dy: 0 });
    cmd(pid, { k: "harvest", x, y });
  }
}

let last = 0;
while (s.phase.k !== "ended" && s.tick < 2_000_000) {
  if (s.phase.k === "play" && s.tick % 8 === 0) for (const id of ids) act(id);
  const gen = s.gen;
  tick(s, ch);
  if (!ledgerHolds(s)) throw new Error(`ledger broke at tick ${s.tick}`);
  if (s.gen !== gen || (s.phase as { k: string }).k === "ended") {
    const mins = ((s.tick - last) / 600).toFixed(1);
    console.log(`${STAGES[gen - 1].name} spent after ${mins} min (deaths so far: ${ids.map((i) => s.players[i].deaths).join(",")})`);
    last = s.tick;
  }
}
console.log(`campaign ${s.phase.k} in ${(s.tick / 600).toFixed(0)} min of play, ${players} hand-harvest bots, ${pace} pace`);
