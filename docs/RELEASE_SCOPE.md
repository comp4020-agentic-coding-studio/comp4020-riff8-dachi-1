# Release scope

The brief for this run asked for a week-long, multi-agent build of a full 3D survival, crafting and industry game. This run had one unattended session of about four hours, with one lead and one renderer subagent. This file is the honest account of what that bought: each system, its acceptance criterion, and whether it is **implemented** (code exists), **integrated** (reachable in the real game) and **verified** (a test or a real-browser check shows it working). "No" means no; nothing here is inferred from a README.

Evidence: `spec/play.test.ts` (simulation and per-player view), `spec/server.test.ts` (the live server over WebSocket), `spec/sim.test.ts` (the original accounting suite), and the browser checks in [`TESTING.md`](TESTING.md).

## What shipped

| System | Acceptance criterion | Impl. | Integr. | Verified | Evidence |
| --- | --- | --- | --- | --- | --- |
| 3D world | Three.js scene over the shared tile world: terrain with height, water, props, buildings, creatures, bodies | yes | yes | browser screenshots | `client/render3d.ts`, TESTING.md |
| Three cameras | first person (pointer lock, crosshair, hands/tool), third-person chase, isometric (zoom, 90° rotation); switching never touches the socket or state | yes | yes | browser | `C` key, settings panel |
| One targeting path | all cameras aim through the same raycast and send the same commands; reach is the server's rule | yes | yes | spec (server reach checks) + browser | `Renderer3D.aim()`, `applyCommand` |
| Collision | buildings are solid (plazas aren't), the same `step()` runs on server and in prediction, a body inside something can always walk out, nothing can be built through a player | yes | yes | spec | `walkable`, `step`, `placementProblem` |
| Personal packs | harvest goes to the harvester's own pack; whole numbers, 36 slots of 50 | yes | yes | spec | "harvests into the harvester's own pack" |
| Private replication | each player is sent only their own pack; locked chests show owner, not contents; per-recipient stream sequence | yes | yes | spec + live server | "never includes someone else's pack", "nobody is sent anyone else's" |
| Cooperative store | shared works are paid from the builder's pack first, then the store; you add to it only by explicit gift | yes | yes | spec | "a personal piece is paid from the pack" |
| Chests | owner-only or public, range-checked, both sides of a transfer in one step, contents bagged (never destroyed) when taken down | yes | yes | spec | "chests" suite |
| Crafting | 12 recipes over hand, campfire, workbench and a running datacentre; refusals say what's missing; inputs consumed once | yes | yes | spec | "crafting refuses…", Tab panel |
| Tools | 9 tools over 3 tiers; yield multipliers per material, durability, visible in hand to others | yes | yes | spec | "a held tool multiplies the yield, and wears" |
| Hunting | 6 species, server-checked range and cooldown, bows use arrows, carcass butchered exactly once | yes | yes | spec | "a carcass is butchered once" |
| Wildlife and loss | founding populations from the seed, nothing respawns; animals flee, predators bite and back off; clearing a habitat starves its animals, on record | yes | yes | spec (accounting) | `fauna` ledger: founded = alive + hunted + starved |
| Survival | health, hunger, cooking, Mars suit air, Sun heat; only connected players get hungry | yes | yes | spec | "an absent player doesn't starve", "each world's hazard" |
| Death and recovery | death bag owner-only for 5 minutes, then anyone's; coat stays on; respawn at spawn, fed enough to recover | yes | yes | spec | "death drops a bag…" |
| Town and water | residents (not spawned from nothing), water split by a host priority, datacentre under/normal/overclock | yes | yes | spec | "the town's water" |
| Causal datacentre harm | overclocking on a dry store, with industry first, warns then kills a resident with the cause recorded and a memorial stone; homes first on the same water keeps everyone alive | yes | yes | spec | "an overclocked datacentre on a dry store…" |
| Evacuation manifest | at each boundary: tools and food travel, raw stock of the spent world is listed as left behind, residents travel asleep, animals stay | yes | yes | spec (campaign) | `evacuate()` |
| Atlas | all five worlds from the title screen and in game, with each spent world's ledger | yes | yes | browser | `client/Atlas.tsx`, `M` |
| Chat and host controls | 120-character text chat (rendered as text), per-line rate limit, local mute; host kick bars rejoin | yes | yes | spec | "talk and the host's controls" |
| Who-did-what log | every action logged as `[ROOM] tag "Name" action -> ok/refused: reason`; never a token | yes | yes | live server spec | "the server's log says who did what" |
| Migration | schema 1 rooms load: shared stockpile moves once into the Cooperative store, nothing else lost | yes | yes | spec | "migration" |
| Backup | `scripts/backup.ts` makes a WAL-consistent copy and restores every room through the real migrations | yes | n/a | spec | "backup" |
| Five stages, both endings | unchanged from the previous release, still reachable through ordinary depletion | yes | yes | spec (whole campaign) | `spec/sim.test.ts` |

## What didn't ship, and why

These are named so nobody mistakes them for done. Each was weighed against the four hours; the ones above were chosen because they change who owns what and what a choice costs, which is the game's argument.

- **Editable voxel terrain, digging, caves.** The world is still a tile grid with visual height. Real voxel chunks, meshing and a chunk-delta protocol are a multi-day job on their own.
- **Block-by-block construction** (walls, roofs, doors), rotation, structural collapse. Buildings are still whole pieces with footprints.
- **Vehicles, drones, conveyors, blueprints, megaprojects.**
- **Farming and animal husbandry.** The ecology is a finite founding stock that only declines.
- **Fire, weather, field-model pollution.** Pollution stays the existing per-tile life model.
- **Spatial interest management.** Every player in a room still receives every public entity; at 24--32 tiles square and eight players that's measured as cheap (TESTING.md), but it won't scale to larger worlds.
- **Trade window, named collaborators on chests, ban lists beyond a kick.**
- **Remappable keys, UI scale, subtitles beyond the existing text log.**
- **A capacity study on the Fly machine.** The cap stays eight per room; nothing here measured more.
- **Archived-world visits and a stage preview diorama.** The atlas shows the worlds as cards.

## Pacing (measured, bots)

`node scripts/campaign-sim.ts <players> <pace>`: hand-harvest-only bots that give everything away and never cook, so slower than people with tools and machines.

| Pace | Players | Each world | Whole campaign |
| --- | --- | --- | --- |
| normal (deposits 4× deep) | 2 | 31--34 min | 163 min |
| rapid (testing preset) | 2 | 1.3--1.8 min | 8 min |

The brief's starting hypothesis was four to eight hours across sessions. Tools (two to five times the yield) and harvesters will bring the measured figure down, so a real group probably lands near two hours; that's untested with people.
