# Decision log

Consequential decisions, newest last. The multi-user behaviour decision has its own record: [ADR 0001](adr/0001-empty-rooms-pause.md).

## Creative direction

Three directions were sketched against emotional impact, gameplay, visual identity and cost:

| Direction | Pitch | For | Against |
| --- | --- | --- | --- |
| **Plenty** (chosen) | a cheerful cooperative hands you world after world; the copy stays sunny while the land dies | the critique lives in the gap between the voice and the screen, so no lecture is needed; warm Animal Crossing tone is natural | relies on visible environmental change being strong enough |
| Ledger | a clean corporate dashboard world, every tile a spreadsheet cell, players as consultants | the economy reads clearly; cheap to draw | cold from the first minute: no attachment to lose |
| Hearth | a village of named animals who move away as their homes are consumed | strongest attachment | named characters cost far more art and writing than the time allows, and the cosmic stages have no animals to lose |

Plenty keeps Hearth's attachment through landmarks, player-named places and wildlife, and takes Ledger's legibility for the HUD.

## Decisions

- **One authoritative Node process; Next.js exported static.** Satisfies "Next.js for the shell, a separate long-running service for the simulation" on the course's one-machine Fly setup. See [`ARCHITECTURE.md`](ARCHITECTURE.md).
- **Three.js with procedural models, one scene, three cameras.** Chosen over React Three Fiber so no per-frame state goes through React, and over a heavier engine for bundle size and a short learning curve in a four-hour run. Third person is the default view for newcomers.
- **Solid buildings, with a no-walling-in rule.** Buildings block movement (plazas don't), sharing one `step()` between server and prediction. Placement is refused if it would cut a connected player or a deposit with stock off from the open map (a flood fill), and a body that ends up inside something can always walk out. This replaced walk-anywhere after an independent review showed eight chests could cage a player.
- **Buildings can't cover a deposit that still has stock.** Combined with the no-walling-in rule, no deposit is ever unreachable, so exhaustion is always achievable.
- **Private packs and a Cooperative store, not one shared stockpile.** Harvests go to the harvester; the store fills only by explicit gifts and pays for shared works after the builder's own pack. The old stockpile's tension survives (one player's overclocked datacentre still drinks everyone's water) but each unit in the store is now somebody's choice. Old rooms migrate their stockpile once into the store.
- **Per-recipient delta sequences.** Filtering private state per player makes a room-wide sequence show gaps that aren't real; each connection counts its own stream instead.
- **Finite wildlife, no breeding.** Animals are a founding stock with their own ledger. Breeding needs a feed budget the finite world can account for; without one it would quietly mint resources, so it isn't built.
- **Datacentre harm is a chain, not a threshold.** Modes, a host water priority, a dry spell with a warning halfway, then one named death with the cause on record and a memorial stone. Homes first or an underclock stops it; a test proves both.
- **Deposits four times as deep on the normal pace**, fixed at world creation, after tools made a world go by in ten minutes. The rapid preset keeps the old depth.
- **Three resource families relabelled per world.** One economy to balance and learn, five sets of names and looks.
- **Raw stock doesn't carry between worlds; tools, food and the Bottled Sun do.** The evacuation manifest keeps each person's tools, food, hides and arrows (up to their pack's room), lists the spent world's raw stock left in packs and chests in the archive, and wakes residents as homes are built on the next world.
- **No readiness vote at transitions.** The server moves the room on after a fixed pause, so no absent player can block it.
- **No rotation.** No building's function depends on facing, so rotation would be decoration with a key binding.
- **Short text chat, with the smallest moderation that works.** 120 characters, one line every two seconds, rendered as text, mutable per listener; the host can remove a player, who can't rejoin with that identity (a fresh browser can, which is the honest limit of guest identities).
- **Host is a role, not a person.** The creator, or the longest-connected player present. The host can take down anyone's building and render down World Engines.
- **Hand harvest slowed to 0.8 s and stocks deepened about 1.4×** after measuring a two-player Earth at under three minutes. See [`DESIGN.md`](DESIGN.md#pacing).
- **Movement sent as compact tuples** after measuring bandwidth. See [`TESTING.md`](TESTING.md).
- **Spent deposits are buildable.** Found playtesting: a stump refused a plaza because the tile still had a deposit family with zero stock.
- **No restoration mechanic in this version.** Regrowth that doesn't refill stock risks reading as an undo; one that does breaks the finite-stock rule.
- **Restraint is a unanimous vote, offered only in the Universe.** Unanimous among those present, so it's collective without letting absentees block it; consuming withdraws your vote; a dropped connection never completes it. Offered last so it saves something real without undoing the earlier worlds. The full consumption ending stays available.
- **Fixes from an independent review** (a subagent auditing `server/` and `shared/`): a message that crashed the process, rooms that filled forever, receipts for refused commands, a resync that doubled log lines, a city served for free, unlimited room creation. All fixed with regression tests where they're testable.
- **Fixes from a second independent review** of the personal-play layer: a kick naming `__proto__` polluted every object in the process and locked everyone out; salvage from a store-paid work went to the demolisher's pack; a host could open someone's locked chest by taking it down and waiting; evacuation dropped chest food and overfilled packs; drop spam bloated every delta. All fixed with regression tests in `spec/play.test.ts`.
