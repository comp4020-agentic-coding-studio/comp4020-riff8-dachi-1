"use client";
// The World Atlas: all five worlds from the start, what each one asks of you,
// and (in a campaign) which are spent, which is current and what they cost.
// Read-only: it's built from the stage data and the room's own history, and
// sends nothing.
import type { ReactNode } from "react";
import { FAMILIES, STAGES } from "../shared/content.ts";
import type { Snapshot } from "../shared/protocol.ts";

const WHAT: Record<string, string> = {
  pollution: "Survive, build a home, power a town. Furnaces are strong; their smoke kills groves.",
  pressure: "Suit air runs out outside a dome. Domes and datacentres drink the same buried ice.",
  heat: "Power pours in, and so does heat. Past the limit, scoops throttle and the platforms hurt.",
  relay: "No sunlight: every machine drinks the Bottled Sun. Relays link miners to the Depot.",
  legacy: "Your spent worlds hum along as engines. If everyone agrees, you can stop.",
};

export function Atlas({ s, onClose }: { s?: Snapshot; onClose?: () => void }): ReactNode {
  const body = (
    <>
      <ol className="atlas">
        {STAGES.map((st, i) => {
          const done = s?.history.find((h) => h.stage === st.id);
          const current = s && s.stage === i && s.phase.k !== "ended";
          const state = done ? "spent" : current ? "you are here" : s && i > s.stage ? "ahead" : s ? "" : `world ${i + 1}`;
          return (
            <li key={st.id} className={`${done ? "spent" : ""} ${current ? "current" : ""}`} style={{ background: `linear-gradient(135deg, ${st.palette.sky[0]}, ${st.palette.sky[1]})` }}>
              <div className="atlas-card">
                <p className="small">{state}</p>
                <h3>{st.name}</h3>
                <p className="small">{st.tagline}</p>
                <p className="small">{WHAT[st.mechanic]}</p>
                <p className="small">
                  Stock: {FAMILIES.map((f) => st.families[f].label).join(", ")}
                </p>
                {done && (
                  <p className="small">
                    Taken: {FAMILIES.reduce((a, f) => a + done.ledger[f].extracted, 0)}, destroyed: {FAMILIES.reduce((a, f) => a + done.ledger[f].destroyed, 0)}. Living land {done.lifeStart}% → {done.lifeEnd}%.
                    {done.lost.length ? ` Lost: ${done.lost.slice(0, 4).join(", ")}${done.lost.length > 4 ? "…" : ""}.` : ""}
                  </p>
                )}
                {current && s && (
                  <p className="small">
                    {FAMILIES.reduce((a, f) => a + s.ledger[f].remaining, 0)} of {FAMILIES.reduce((a, f) => a + s.ledger[f].initial, 0)} units left.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="small">A world moves on when every deposit on it is gone. Nothing you've finished comes back.</p>
    </>
  );
  if (!onClose) return body;
  return (
    <div className="overlay center" role="dialog" aria-modal="true" aria-labelledby="atlas-h">
      <div className="card atlas-wrap">
        <div className="pack-head">
          <h2 id="atlas-h">World Atlas</h2>
          <button type="button" onClick={onClose} autoFocus>
            Close (Esc)
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
