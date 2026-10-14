"use client";
// The personal and civic panels: your pack and crafting, a chest you're
// standing at, a carcass or bag at your feet, and the town's water. All text
// is React children, never HTML; every action is a command the server checks.
import { useState, type ReactNode } from "react";
import { ANIMALS, DC_MODE, FAMILIES, ITEMS, MAX_FOOD, MAX_HP, PRIORITIES, RECIPES, STATION_RANGE, STAGES, TOOLS, buildingName, type DcMode, type ItemId, type Priority } from "../shared/content.ts";
import type { Building, Snapshot } from "../shared/protocol.ts";
import { itemName } from "../shared/sim.ts";
import type { GameClient } from "./net.ts";

const EDIBLE: Partial<Record<ItemId, number>> = { meal: 50, ration: 34, meat: 15 };
const near = (c: GameClient, x: number, y: number, r: number): boolean => Math.hypot(c.me.x - x, c.me.y - y) <= r;

/** Health and hunger, always visible, as words and numbers as well as bars. */
export function Vitals({ s, client }: { s: Snapshot; client: GameClient }): ReactNode {
  const p = s.players[client.you];
  const me = s.me;
  if (!p || !me) return null;
  const hungry = me.food < 25;
  const hurt = p.hp < 40;
  const held = p.holdingId ? me.tools.find((t) => t.id === p.holdingId) : undefined;
  return (
    <div className="panel vitals" role="group" aria-label="You">
      <p>
        <span className="vlabel">Health</span> <span className="vbar" aria-hidden="true"><span style={{ width: `${(p.hp / MAX_HP) * 100}%`, background: hurt ? "#c0392b" : "#3a9b5c" }} /></span>{" "}
        <strong>{p.hp}</strong>
        {hurt ? " (hurt)" : ""}
      </p>
      <p>
        <span className="vlabel">Food</span> <span className="vbar" aria-hidden="true"><span style={{ width: `${(me.food / MAX_FOOD) * 100}%`, background: hungry ? "#d9822b" : "#d9a441" }} /></span>{" "}
        <strong>{me.food}</strong>
        {me.food === 0 ? " (starving: eat!)" : hungry ? " (hungry)" : ""}
      </p>
      {s.stage === 1 && (
        <p>
          <span className="vlabel">Air</span> <span className="vbar" aria-hidden="true"><span style={{ width: `${me.air ?? 100}%`, background: (me.air ?? 100) < 30 ? "#c0392b" : "#5bb6e8" }} /></span>{" "}
          <strong>{me.air ?? 100}</strong>
          {(me.air ?? 100) < 30 ? " (low: get inside a dome)" : ""}
        </p>
      )}
      {STAGES[s.stage].mechanic === "heat" && s.heat >= 70 && <p className="small bad">The heat is hurting everyone out here. Build radiators.</p>}
      <p className="small">
        In hand: <strong>{held ? `${TOOLS[held.kind].name} (${held.dur})` : "bare hands"}</strong>
        {me.tools.some((t) => t.kind === "coat") ? " · wearing a hide coat" : ""}
      </p>
      {me.hurt && s.tick - me.hurt.tick < 100 && (
        <p className="small bad">
          Hurt by {me.hurt.cause} (−health). {/bite/.test(me.hurt.cause) ? "Fight back (F) or walk away; a coat halves bites." : me.hurt.cause === "hunger" ? "Eat something (Tab)." : me.hurt.cause === "lack of air" ? "Get inside a working dome." : "Build radiators or get clear."}
        </p>
      )}
      {me.food === 0 && <p className="small bad">Starving costs health. Cook a ration at a campfire (Tab).</p>}
    </div>
  );
}

/** Tab: the pack, the tools, and every recipe with why it can't be made yet. */
export function PackPanel({ s, client, onClose }: { s: Snapshot; client: GameClient; onClose: () => void }): ReactNode {
  const st = STAGES[s.stage];
  const me = s.me;
  const p = s.players[client.you];
  const [filter, setFilter] = useState("");
  if (!me || !p) return null;
  const stations = (type: "campfire" | "workbench" | "datacentre"): boolean =>
    s.buildings.some((b) => b.type === type && b.work >= 10 && (type !== "datacentre" || b.status === "ok") && near(client, b.x + (type === "datacentre" ? 0.5 : 0), b.y + (type === "datacentre" ? 0.5 : 0), STATION_RANGE + (type === "datacentre" ? 0.5 : 0)));
  const items = ITEMS.filter((k) => me.items[k]);
  const recipes = RECIPES.filter((r) => !filter || r.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="overlay center" role="dialog" aria-modal="true" aria-labelledby="pack-h">
      <div className="card pack">
        <div className="pack-head">
          <h2 id="pack-h">Your pack</h2>
          <button type="button" onClick={onClose} autoFocus>
            Close (Esc)
          </button>
        </div>
        <p className="small">Only you can see this. What you gather is yours; give raw stock to the Cooperative store to build shared works.</p>
        <div className="pack-cols">
          <section aria-labelledby="items-h">
            <h3 id="items-h">Things</h3>
            {items.length === 0 ? (
              <p className="small">Empty. Hold E beside a tree, rock or pond.</p>
            ) : (
              <ul className="items">
                {items.map((k) => (
                  <li key={k}>
                    <span>
                      {itemName(st, k)}: <strong>{me.items[k]}</strong>
                    </span>
                    <span className="row tight">
                      {EDIBLE[k] && (
                        <button type="button" onClick={() => client.send({ k: "eat", item: k })} aria-label={`Eat one ${itemName(st, k)}`}>
                          Eat
                        </button>
                      )}
                      {(FAMILIES as readonly string[]).includes(k) && (
                        <button type="button" onClick={() => client.send({ k: "donate", item: k, n: me.items[k]! })} aria-label={`Give all ${itemName(st, k)} to the Cooperative`}>
                          Give all
                        </button>
                      )}
                      <button type="button" className="secondary" onClick={() => client.send({ k: "drop", item: k, n: me.items[k]! })} aria-label={`Drop all ${itemName(st, k)} on the ground for someone`}>
                        Drop
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <h3>Tools</h3>
            {me.tools.length === 0 ? (
              <p className="small">None yet: an axe is three timber and two stone.</p>
            ) : (
              <ul className="items">
                {me.tools.map((t, i) => (
                  <li key={t.id}>
                    <span>
                      <kbd>{i + 1}</kbd> {TOOLS[t.kind].name} <span className="small">tier {TOOLS[t.kind].tier}, {t.dur}/{TOOLS[t.kind].dur} left</span>
                    </span>
                    {!TOOLS[t.kind].armour && (
                      <button type="button" aria-pressed={p.holdingId === t.id} onClick={() => client.send({ k: "hold", tool: p.holdingId === t.id ? 0 : t.id })}>
                        {p.holdingId === t.id ? "Holding" : "Hold"}
                      </button>
                    )}
                    {TOOLS[t.kind].armour && <span className="small">worn</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="small">
              Food {me.food}/{MAX_FOOD} · Health {p.hp}/{MAX_HP}
            </p>
          </section>
          <section aria-labelledby="craft-h">
            <h3 id="craft-h">Make</h3>
            <label className="small">
              Search <input value={filter} onChange={(e) => setFilter(e.target.value)} maxLength={20} />
            </label>
            <ul className="recipes">
              {recipes.map((r) => {
                const missing = (Object.entries(r.in) as [ItemId, number][]).filter(([k, n]) => (me.items[k] ?? 0) < n);
                const station = r.station;
                const why = station && !stations(station)
                  ? `needs ${station === "datacentre" ? "a running datacentre" : `a ${buildingName(st, station)}`} within ${STATION_RANGE} tiles`
                  : missing.length
                    ? `needs ${missing.map(([k, n]) => `${n - (me.items[k] ?? 0)} more ${itemName(st, k)}`).join(", ")}`
                    : null;
                const cost = (Object.entries(r.in) as [ItemId, number][]).map(([k, n]) => `${n} ${itemName(st, k)}`).join(", ");
                return (
                  <li key={r.id} className={why ? "cant" : ""}>
                    <div>
                      <strong>{r.name}</strong> <span className="small">({cost})</span>
                      <p className="small">{r.blurb}</p>
                      {why && <p className="small why">✕ {why}</p>}
                    </div>
                    <button type="button" disabled={!!why} onClick={() => client.send({ k: "craft", recipe: r.id })} aria-label={`Make ${r.name}${why ? `: ${why}` : ""}`}>
                      Make
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

/** What's at your feet: a chest you can use, a carcass, a bag. Shown when you're close enough. */
export function Nearby({ s, client }: { s: Snapshot; client: GameClient }): ReactNode {
  const st = STAGES[s.stage];
  const me = s.me;
  if (!me) return null;
  const chestB = s.buildings.find((b) => b.type === "chest" && near(client, b.x, b.y, 2.6));
  const chest = chestB ? s.chests[chestB.id] : undefined;
  const carcass = (s.animals ?? []).find((a) => a.dead && near(client, a.x, a.y, 2.1));
  const bag = (s.bags ?? []).find((b) => near(client, b.x, b.y, 2.1));
  const animal = (s.animals ?? []).find((a) => !a.dead && near(client, a.x, a.y, 7));
  if (!chest && !carcass && !bag && !animal) return null;
  const mine = chest && chest.owner === client.you;
  return (
    <div className="panel nearby" role="group" aria-label="Close by">
      {chestB && chest && (
        <div>
          <h2>
            {mine ? "Your chest" : `${chest.ownerName}'s chest`} <span className="small">({chest.access === "public" ? "open to everyone" : "locked to its owner"})</span>
          </h2>
          {chest.items ? (
            <>
              <ul className="items">
                {ITEMS.filter((k) => chest.items![k]).map((k) => (
                  <li key={k}>
                    {itemName(st, k)}: <strong>{chest.items![k]}</strong>{" "}
                    <button type="button" onClick={() => client.send({ k: "take", chest: chestB.id, item: k, n: chest.items![k]! })}>
                      Take
                    </button>
                  </li>
                ))}
                {!ITEMS.some((k) => chest.items![k]) && <li className="small">Empty.</li>}
              </ul>
              <p className="small">Put in:</p>
              <div className="row tight">
                {ITEMS.filter((k) => me.items[k]).map((k) => (
                  <button key={k} type="button" onClick={() => client.send({ k: "stash", chest: chestB.id, item: k, n: me.items[k]! })}>
                    {me.items[k]} {itemName(st, k)}
                  </button>
                ))}
              </div>
              {mine && (
                <button type="button" className="secondary" onClick={() => client.send({ k: "access", chest: chestB.id, access: chest.access === "public" ? "owner" : "public" })}>
                  {chest.access === "public" ? "Lock it to me" : "Open it to everyone"}
                </button>
              )}
            </>
          ) : (
            <p className="small">Locked. Only {chest.ownerName} can open it.</p>
          )}
        </div>
      )}
      {carcass && (
        <p>
          A {ANIMALS[carcass.kind].name} carcass.{" "}
          <button type="button" onClick={() => client.send({ k: "butcher", animal: carcass.id })}>
            Butcher (F)
          </button>
        </p>
      )}
      {bag && (
        <p>
          {bag.owner === client.you ? "Your bag" : `${bag.ownerName}'s bag`} ({bag.n} things)
          {bag.owner !== client.you && s.tick < bag.openAt ? ", only theirs to open for now." : ". "}
          {(bag.owner === client.you || s.tick >= bag.openAt) && (
            <button type="button" onClick={() => client.send({ k: "loot", bag: bag.id })}>
              Pick up (F)
            </button>
          )}
        </p>
      )}
      {!carcass && animal && (
        <p className="small">
          {animal.name ?? `A ${ANIMALS[animal.kind].name}`} nearby{ANIMALS[animal.kind].bite ? " (it bites)" : ""}. F to strike{s.players[client.you]?.holding === "bow" ? " or shoot" : ""}.
        </p>
      )}
    </div>
  );
}

/** The F key: butcher, pick up, or strike whatever is closest, in that order. */
export function interact(s: Snapshot, client: GameClient): boolean {
  const carcass = (s.animals ?? []).find((a) => a.dead && near(client, a.x, a.y, 2.1));
  if (carcass) return client.send({ k: "butcher", animal: carcass.id }), true;
  const bag = (s.bags ?? []).find((b) => near(client, b.x, b.y, 2.1));
  if (bag) return client.send({ k: "loot", bag: bag.id }), true;
  const p = s.players[client.you];
  const range = p?.holding ? (TOOLS[p.holding].range ?? 1.4) : 1.4;
  const live = (s.animals ?? []).filter((a) => !a.dead).sort((a, b) => Math.hypot(a.x - client.me.x, a.y - client.me.y) - Math.hypot(b.x - client.me.x, b.y - client.me.y))[0];
  if (live && near(client, live.x, live.y, range + 0.3)) return client.send({ k: "hit", animal: live.id }), true;
  return false;
}

/** The town: who lives here, where the water goes, and the host's one big choice. */
export function TownPanel({ s, host, client }: { s: Snapshot; host: boolean; client: GameClient }): ReactNode {
  const t = s.town;
  if (!t || (t.residents === 0 && t.sleeping === 0 && t.deaths === 0 && !s.buildings.some((b) => b.type === "city"))) return null;
  const st = STAGES[s.stage];
  const [toHomes, homesNeed, toDcs, dcsWant] = t.water;
  const label: Record<Priority, string> = { essentials: "Homes first", balanced: "Share evenly", industry: "Datacentres first" };
  return (
    <div className="panel town">
      <h2>The town</h2>
      <p className="small">
        <strong>{t.residents}</strong> living here{t.sleeping ? `, ${t.sleeping} evacuees asleep` : ""}
        {t.deaths ? `, ${t.deaths} died` : ""}.
      </p>
      <p className="small">
        {st.families.coolant.label}: homes {toHomes}/{homesNeed} · datacentres {toDcs}/{dcsWant}
        {t.dry > 0 ? <strong className="bad"> · homes short for {t.dry}</strong> : null}
      </p>
      <div className="row tight" role="radiogroup" aria-label="Water priority">
        {PRIORITIES.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={t.priority === p} className={t.priority === p ? "on" : ""} disabled={!host} onClick={() => client.send({ k: "priority", p })}>
            {label[p]}
          </button>
        ))}
      </div>
      {!host && <p className="small">The host sets the water priority.</p>}
      {t.events.length > 0 && (
        <ul className="small events">
          {t.events.slice(-3).map((e, i) => (
            <li key={`${e.tick}-${i}`}>{e.text}</li>
          ))}
        </ul>
      )}
      <p className="small">
        {s.stage === 0 ? "Wildlife" : "Earth's wildlife, left behind"}: {s.fauna?.alive ?? 0} of {s.fauna?.founded ?? 0} alive{s.fauna?.hunted ? `, ${s.fauna.hunted} hunted` : ""}
        {s.fauna?.starved ? `, ${s.fauna.starved} starved` : ""}.
      </p>
    </div>
  );
}

/** Datacentre controls for the Inspect panel. */
export function DcControls({ b, client, canTune }: { b: Building; client: GameClient; canTune: boolean }): ReactNode {
  if (b.type !== "datacentre") return null;
  const mode = b.mode ?? "normal";
  const label: Record<DcMode, string> = { under: "Underclock", normal: "Normal", over: "Overclock" };
  return (
    <div>
      <div className="row tight" role="radiogroup" aria-label="Datacentre mode">
        {(Object.keys(DC_MODE) as DcMode[]).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} disabled={!canTune} onClick={() => client.send({ k: "mode", x: b.x, y: b.y, mode: m })}>
            {label[m]}
          </button>
        ))}
      </div>
      <p className="small">
        {label[mode]}: +{DC_MODE[mode].compute} compute for {DC_MODE[mode].energy} power and {DC_MODE[mode].coolant} water a tick, heat {DC_MODE[mode].heat}. Game rules, not real figures.
      </p>
    </div>
  );
}
