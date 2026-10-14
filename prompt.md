# PLENTY: UNTIL NOTHING REMAINS
## Single-run final-release implementation brief

Repository: https://github.com/comp4020-agentic-coding-studio/comp4020-riff8-dachi-4
Existing deployment: https://comp4020-riff8-dachi-4.fly.dev/

This document is the entire implementation prompt. Work on the supplied repository. Deliver the finished game described here, not a proposal for another development cycle.

---

## 1. Mission, authority, and the meaning of “finished”

You are the lead developer and creative director of an autonomous game-development team. Use the configured Claude Opus runtime, the owner’s expanded model allocation, the available tools, and approximately one-week execution window to transform the existing Plenty game into a complete browser-based 3D multiplayer survival, crafting, construction, and industrialisation game.

The owner has removed the earlier $500 model-usage budget and reports effectively unlimited Claude Max/Opus access for this run. Do not ration reasoning, implementation attempts, reviews, asset-authoring assistance, or testing against that old budget. Use the model allocation aggressively and intelligently. This is not permission to exceed actual tool limits, buy infrastructure, spend money on external APIs, or assume unlimited runtime, CPU, RAM, storage, or bandwidth. Do not invent model capabilities, unattended execution, or completed work.

This is ONE final-release mission. Internal prototypes, branches, tests, and revisions are how you finish the release; they are not separate products to return to the owner. Do not stop at an MVP, a 3D proof of concept, an impressive menu, or a roadmap. Do not routinely defer the requested systems to “version two.” The final result must join them into one working game.

Exercise creative judgement. Make ordinary reversible decisions without waiting for a reply: this run may be unattended. When access or an external permission is missing, complete all independent work, choose the safe existing configuration, and record the specific blocker. Do not replace implementation with questions that the code, tools, or research can answer.

Keep the name Plenty unless a substantially better identity emerges. “Until Nothing Remains” is a proposed subtitle, not a compulsory slogan.

The player fantasy is:

> Start as a vulnerable individual in a living world. Gather, hunt, craft, build a home, store possessions, cooperate with friends, and turn survival into comfortable abundance. Build settlements and machines that make you powerful. Become dependent on the infrastructure you created. Watch its demands destroy the world that made it possible. Carry your civilisation outward through Earth, Mars, the Sun, the Solar System, and the Universe—until there is nowhere left to expand.

The final game should combine the personal presence and tactile building of a first-person sandbox, the readability and warmth of a cosy isometric game, and an industrial economy with consequences. It must have an original art identity, writing, assets, and rules. Do not copy Minecraft or Animal Crossing assets, characters, branding, maps, sounds, or interface layouts.

## 2. Start from evidence, preserve what works

Read `CLAUDE.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/TESTING.md`, `fly.toml`, the build scripts, and the actual implementation before major changes. Inspect at least `client/Game.tsx`, `client/render.ts`, `client/net.ts`, `shared/protocol.ts`, `shared/sim.ts`, `shared/content.ts`, `server/rooms.ts`, and `server/store.ts`. Follow the actual repository workflow, including its instructions for the lifecycle of `prompt.md`.

The source review that informed this brief found the following baseline. Recheck it at your starting commit rather than assuming the repository has not changed:

- An original game called Plenty with five connected stages, environmental depletion, an archive, and endings.
- A static-exported Next.js shell, a Canvas 2D world renderer, and a separate authoritative Node/WebSocket simulation served by the same deployment.
- Shared room inventory rather than individual inventories. The reviewed Player model did not contain health, equipment, personal item slots, or a crafting system.
- Compact movement deltas, command acknowledgements, duplicate suppression, room incarnations, and stage generations worth preserving or carefully migrating.
- No collision handling in the documented movement implementation, and no per-player spatial interest management.
- SQLite persistence, pause-when-empty behaviour, and existing simulation/network tests.
- A documented eight-player room limit and performance evidence from a development workstation, not a reliable capacity result for the proposed 3D game.
- `fly.toml` explicitly describing a course-managed, one-machine, `shared-cpu-1x`, 256 MB RAM deployment, a single volume at `/data`, and Sydney as its configured primary region.

Do not inherit historical “two-day prototype” effort assumptions as this run’s scope. Do preserve genuine platform restrictions, security invariants, and deployment requirements. Until explicitly authorised otherwise, make the finished release run on the existing permitted deployment shape. Do not provision another app or database, increase machine size, or add replicas just to make a benchmark pass.

Time-box the initial investigation to approximately the first 60–90 minutes of productive execution. Capture the starting commit, launch the baseline, exercise a room, identify reusable systems and high-risk changes, and start implementation. Revisit questions through small experiments rather than spending the first day writing a thesis.

Create `docs/RELEASE_SCOPE.md` with each system’s acceptance criteria and evidence location. Track “implemented,” “integrated,” and “verified” separately. A button or type definition is not an implemented system.

## 3. The experience and its emotional structure

The world must initially feel worth living in. Give players beautiful places, a recognisable home, creatures, useful possessions, small social moments, and reasons to remember a location before it becomes a resource field.

Growth must feel good. Better tools, a warm shelter, a shared workshop, reliable food, electricity, transport, and automation should materially improve life. Datacentres should provide useful services rather than exist only as an obvious villain. Environmental harm must follow the way the group builds and operates its systems.

The emotional progression is attachment → competence → abundance → dependence → pressure → irreversible loss → confrontation. Convey it through play, sound, landscape, institutions, and the fates of familiar places. Avoid repeated moralising pop-ups.

Keep several viable strategies: cooperative industry, personal homesteads supporting a town, rapid extractive expansion, careful resource efficiency, conservation with real opportunity costs, and an eventual collective decision about whether to continue. The standard consumption campaign must remain fully playable through its ending. Restraint must be an earned alternative, not the only mechanically viable choice.

Choose explicit pacing targets. As a starting design hypothesis, aim for a useful crafted tool within several minutes, a personal shelter and cooperative activity in the first ten minutes, and a normal full campaign of roughly four to eight hours across saved sessions. Provide a clearly labelled accelerated test preset that can complete in tens of minutes through the same rules. Tune these values from play, not from a timer alone. Make party size affect work opportunities without letting a crowded room erase the opening world before newcomers understand it. Establish any size-dependent natural-stock budget at world creation; joining players must not silently spawn fresh finite resources.

Invent at least two distinctive, integrated moments or mechanics beyond generic survival-game conventions: for example, walking past a memorial beside the datacentre that caused a service failure, saving a familiar animal through a costly evacuation, or finding a named old home embedded in a later cosmic remnant. Choose your own stronger ideas. They should emerge from actual state and player choices, not be disconnected cutscenes.

Use satire sparingly and accurately. A cheerful cooperative notice praising record compute while the town is rationing water can be more effective than a long speech. Give the player enough information to recognise their role without falsely presenting invented mechanics as established real-world science.

## 4. One genuine 3D world, three usable views

Replace the flat Canvas world with a genuine 3D scene, with shared world coordinates, heights, collision geometry, buildings, creatures, items, and player bodies.

Ship fully playable first-person and isometric modes. Also provide a useful third-person chase view using the same scene and controller. Camera switching must be immediate once assets are loaded and must not reload the campaign, reconnect the socket, replace the player, or change inventories, physics, permissions, or resource rules.

First person is a real way to play the entire game: pointer-lock mouse look, visible equipped tool or hands, a useful crosshair, accurate targeting, movement, sprinting, jumping, crouching, gathering, mining, building, hunting, chest interaction, crafting, vehicle interaction, and survival feedback. It is not merely a spectator fly-through.

Isometric mode must remain attractive and practical for construction and coordination. Support pan, zoom, rotation in sensible increments, roofs/occluders that yield when necessary, placement previews, and readable selection. The avatar remains a physical character with the same legal reach as in first person. An overhead camera must not grant invisible teleportation, global looting, or attacks through walls. A later construction drone can legitimately extend reach through an explicit technology and server rule.

Third person needs camera collision, consistent aim and interaction, and readable animation. Do not maintain separate copies of gameplay logic for the three cameras. All modes use the same targeting and command-validation interfaces.

Use a clear initial control scheme: WASD, mouse look in first person, Space to jump, Shift to sprint, a crouch binding, E for contextual interaction, primary action for the equipped item, secondary action for its alternate use or block placement, number keys for the hotbar, and remappable inventory, crafting, map, and camera keys. Avoid binding a critical action to a key that conflicts with another required action. Release pointer lock while menus are open, handle focus loss, and require an intentional gesture to reacquire it.

Provide field-of-view, mouse sensitivity, invert-Y, camera-bob, reduced-motion, subtitles, volume, and quality settings. Make health/status information legible without depending on colour alone. The world should occupy most of the screen, not be hidden behind the prototype’s persistent panels.

## 5. Terrain, exploration, mining, and construction

Implement a finite, seeded, chunked 3D world with real elevation, coastlines or water boundaries, mineable terrain, deposits below the surface, caves or excavation spaces, and recognisable biomes. Earth should include at least forest, meadow, wetland or lakeshore, and rocky upland, with depleted counterparts. Give each a gameplay reason to explore.

Use editable voxel terrain or an equivalently capable block-based representation that actually permits digging, tunnelling, placing materials, and destroying the environment. A textured flat plane with decorative cubes does not satisfy this requirement. Choose bounded world dimensions and vertical depth after profiling; later stages may have much larger strategic extent without keeping all terrain in memory.

Make construction work at two scales. Players can build a personal shelter from structural pieces or blocks—floors, walls, roofs, doors, windows, stairs, foundations, fences, and lights—and place functional facilities with footprints, inputs, outputs, and access needs. Support rotation, snapping, obstruction feedback, confirmation, cancellation, repair, damage, and material recovery under explicit rules.

Buildings and terrain edits must respect physical occupancy. Do not place a wall through another player or trap someone inside a newly spawned machine. Provide collision-safe recovery from bad placement, disconnects, and terrain collapse. Claims must not permanently hide the final required deposit or prevent everyone from completing the campaign.

Make discoveries useful: ore seams, water sources, wildlife habitats, memorable landmarks, and salvage sites. Fog of war or personal exploration can exist, but should not obstruct the ability to understand the five-stage campaign. Use late-stage survey tools to locate remaining resources rather than forcing hours of searching for one invisible block.

Keep world generation finite and accounted for. Chunk streaming must not secretly add new natural resources forever. Reopening a chunk, revisiting it, changing camera mode, or reconnecting must never regenerate harvested stock.

## 6. Personal inventories, chests, equipment, and sharing

Every player owns a separate persistent inventory. Harvested or picked-up resources enter that player’s inventory, not a room-wide invisible bank. Start with a usable hotbar and backpack, equipment slots, stack rules, tool durability, and readable capacity feedback. Suggested starting sizes are a 9-slot hotbar and 27 backpack slots; tune after playtesting.

Implement stack splitting, merging, sorting, quick transfer, selected-slot use, item dropping, pickup, inventory-full behaviour, and controller-independent keyboard alternatives for essential transfers. Unique tools need stable instance IDs, durability, and equipment state. Count quantities as bounded integers.

Ship personal chests, permissioned shared chests, worksite supply containers, and industrial input/output buffers. Players can explicitly donate to collective infrastructure. Building costs come from the actor’s inventory or explicitly selected, authorised connected storage; never silently charge another player.

Chest access options should include owner-only, named collaborators or group access, and public access. Provide a meaningful ownership and abandonment policy. Capacity limits count currently connected players, but persistence must not discard an absent person’s items merely because the old implementation remembered only a limited number of identities.

Implement direct item transfer or a small two-party trade window. Offers must be locked and confirmed consistently, with cancellation and disconnect recovery. Shared construction sites can accept partial material contributions and multiple builders without charging the recipe twice.

Treat every transfer as an authoritative transaction: source, destination, item, count, permission, range, expected revision, and command identity. Validate and commit both sides together. Two players taking the last item, competing pickups, shift-click spam, breaking an open chest, death during a transfer, and reconnect retries must not duplicate or destroy items.

Do not broadcast private inventories or locked chest contents to other clients. Hiding a panel is not privacy. Replace broad snapshot copying with explicit public, owner-private, and authorised-container replication views. Other players may see equipped gear and public activity, not secret contents.

## 7. Crafting, tools, weapons, cooking, and progression

Implement a discoverable, searchable recipe system with prerequisites, stations, ingredients, outputs, craft quantities, useful filters, recipe pinning, and explanations of missing requirements. Recipes should form understandable production chains rather than a long list of unrelated unlocks.

Include hand crafting, a workbench, cooking, material processing, metalworking, electrical or precision assembly, and advanced fabrication. Station queues must reserve inputs, preserve progress, handle power loss, and place completed goods into a capacity-checked output buffer. Cancelling or destroying a station must have an explicit accounting outcome.

Tools should include at least an axe, pickaxe, shovel, building/repair tool, harvesting or butchering tool, ranged hunting implement, and an advanced powered extraction tool. Provide at least three meaningful technological tiers that differ in capability, speed, durability, reach where justified, and operating costs. A stronger tool should sometimes unlock a new material or process, not just change a number.

Add fictional melee and ranged weapons suitable for this original world. Support aiming, range, impact, cooldown, ammunition or energy, durability, server-validated hits, and material-specific damage. Wildlife can threaten players. More powerful equipment must make environmental destruction faster and more tempting, with costs and risks that remain relevant.

Use stylised hunting and butchering: a downed animal can yield meat, hide, bone, fibre, or other appropriate fictional resources. Carcasses have an authoritative harvestable state and cannot be harvested repeatedly by overlapping commands. Cooked food, clothing, carrying equipment, and useful tool components should connect these resources to the economy. Keep the presentation consistent with the warm art style rather than graphic gore.

Include damaging industrial tools and a controlled, fictional area-demolition capability. Treat all weapon and demolition recipes as invented game data, not real-world manufacture instructions. Destruction obeys room rules and ownership protections; an explosive effect must not bypass protected chests, buildings, or spawn areas.

Repair and recycling should recover value without creating infinite materials. Recipe cycles, salvage, durability repair, loot drops, and demolition need economy tests. Starter equipment and respawn provisions must not be salvageable into an infinite resource source.

Aim for a meaningful content library of at least 60 distinct useful items, 50 recipes, and 30 functional building or machine definitions across the full campaign, excluding cosmetic recolours and repeated tier labels. The purpose is interconnected depth, not meeting counts with filler. Build the chains and test their usefulness; do not represent unimplemented items as available content.

## 8. Survival, health, death, and recovery

Implement health, stamina, food, thirst, and context-specific exposure such as heat, cold, oxygen, or radiation. Display only relevant information prominently. Survival should create expeditions and decisions, not make every minute an inventory chore.

Provide warnings, understandable causes, countermeasures, equipment protection, food and water preparation, shelters, and medical support. A player should be able to inspect why their health is falling and respond before a preventable death.

Use a downed state and cooperative revival where appropriate. Death produces a recoverable, ownership-aware inventory cache or bag. Define what remains equipped, what drops, how long the cache persists, and who may access it. Prevent duplicate corpse loot, item farming through respawn, repeated environmental instant-death loops, and loss of critical campaign access.

Beds or expedition shelters set sensible respawn locations. Respawn must be collision-safe and use a viable survival environment. A minimal bound recovery tool or rescue capability can prevent total deadlock, but must not create tradeable materials, free infinite fuel, or a bypass to the main economy.

Distinguish human players from simulated settlement inhabitants. A worker shortage caused by NPC deaths should affect the city and its output; it must not mean that new human players cannot join. Conversely, player death should not arbitrarily delete an NPC household.

Define all-players-downed and settlement-collapse behaviour. Offer a coherent recovery or deliberate collapse ending without silently restoring nature or resetting inventories. Keep the five-stage consumption route reachable from ordinary mistakes through slower manual work, salvage, or finite reserves.

Pause an empty campaign. A disconnected player must not starve because the server kept their unattended avatar active forever. Address brief disconnects without granting a logout exploit during combat: choose a short, clearly disclosed grace policy, then safely persist the player.

## 9. Wildlife, farming, ecology, and nonhuman loss

Implement at least six distinguishable wildlife types or species with complementary roles, such as herbivores, a predator, small scavengers, fish, and birds. Not every creature needs elaborate AI, but harvestable animals must be authoritative entities rather than decorative animations.

Animals need appropriate combinations of wandering, feeding, drinking, fleeing, territorial or hunting behaviour, resting, reproduction, and habitat preference. Give players nonviolent ways to engage too: observing, naming, protecting habitat, or keeping a small sanctuary.

Provide farming or managed food production and a limited animal-husbandry system. Make food, water, space, and habitat quality matter. Hunting and industrial expansion should affect local populations; clearing the last grove should change what lives there. Loss should be visible in behaviour and sound as well as in a number.

Reproduction and regrowth must not break the finite campaign. Use a documented, finite ecological-capital model: living biomass, soil fertility, accessible water, feed, seed reserves, and managed stocks transfer or deplete under rules. A born animal consumes already-accounted inputs; a crop does not appear without a resource cost. Do not simply increment the old fixed-stock ledger when something respawns.

Separate decorative ambient creatures from harvestable resources. A decorative bird animation must not secretly count as the last remaining resource. Animal relocation into a sanctuary or ark can count as extraction from the current habitat without requiring slaughter; its future upkeep and productive output still use recorded resources.

Use detailed AI near players and lightweight population or scheduled simulation farther away. Waking a region must reconstruct its authoritative population without duplicating animals or undoing hunting. Distant ecology cannot freeze merely because a player looks away or closes the map.

## 10. Settlements and the people inside them

Expand cottages into a settlement system with housing, food, drinking water, power, employment, healthcare, safety, and a comprehensible wellbeing state. Use a bounded number of visible NPC representatives backed by aggregate population data rather than one expensive simulation per fictional citizen.

Create distinct town facilities: housing, workshops, storage, food production, water treatment, a clinic, civic space, and industrial services. Roads or logistics connections should make placement meaningful. A player should be able to walk through the town in first person, recognise facilities, hear activity, and see workers or residents using the place.

Give residents needs, contributions, and meaningful consequences. A clinic requires power and supplies; jobs require healthy workers; overcrowding or contamination has costs; reliable infrastructure and public space have benefits.

Population dynamics should be tunable and understandable. Avoid unrealistically fast spontaneous replacement of deceased workers. Maintain a historical record of migration, growth, deaths, and significant town events. Named representative residents can make consequences personal without simulating thousands of biographies.

Implement civic choices such as service priorities, industrial operating limits, communal construction goals, and resource rationing. Keep the controls small and usable. Town management should deepen the sandbox, not turn every player into a spreadsheet operator.

## 11. Industry, electricity, water, logistics, and datacentres

Build a real production economy. Include extraction, processing, generation, storage, transport, fabrication, and compute. Five well-connected production chains are more valuable than fifty independent generators.

Implement explicit electrical supply and demand, water supply and quality, storage, and throughput limits. Use connections or networks that players can understand and inspect. Support interrupted power, missing inputs, full output buffers, damaged connections, and clear “why this is idle” feedback.

Provide at least two early power approaches with different trade-offs, batteries or reserves, water pumping and treatment, powered extraction, material processing, and datacentres. Later stages should transform these systems through atmosphere, heat, orbital logistics, and finite stellar energy.

Datacentres are central, not decorative. They unlock or improve concrete capabilities: logistics coordination, automated machines, mapping and surveys, medical or civic services, advanced fabrication, drones, and research. Their operating mode determines compute, energy demand, cooling, heat, maintenance, and reliability.

Include underclocking, normal operation, and overclocking or an equivalent meaningful control. A cooling failure should produce warnings, throttling, damage, or shutdown through clear rules. Cooling alternatives should trade materials, electricity, water, land, or climate suitability rather than one being universally free and superior.

Implement the requested possibility that excessive datacentre expansion contributes to deaths, but use a causal model. Never use “more than N datacentres means somebody randomly dies.” A convincing chain is:

1. Compute expansion increases electricity and cooling demand.
2. The group chooses supply sources and resource-allocation priorities.
3. Fossil or dirty generation, waste heat, water depletion, contamination, or blackouts stress the environment and services.
4. Farms, habitats, homes, and clinics may lose essential inputs; wildlife and residents suffer exposure or shortages.
5. Warnings appear. Players can throttle compute, change priorities, improve treatment or cooling, relocate activity, restore services, or continue prioritising growth.
6. Prolonged unmitigated exposure or shortage can cause injuries and deaths, with an inspectable in-game cause history.

Keep local pollution, waste heat, water availability, drinking-water quality, and electricity shortages conceptually distinct even if their implementation is simplified. A solar-powered machine must not emit fictional chimney smoke just because it is industrial. Datacentre heat is not a magical poison aura. Label all balance coefficients and health effects as game rules, not calibrated real-world predictions.

Implement explicit priorities such as essentials-first, balanced, and industry-first. Expose the trade-offs before the player commits. Allow protection of hospitals or habitats without removing all consequences elsewhere. Conservation and efficiency may slow harm; they must not become infinite free growth.

## 12. Destruction, environmental simulation, and consequences

Make the world change physically and ecologically: removed trees, stumps, excavation pits, altered water levels, scarred terrain, damaged buildings, degraded soil, fewer animals, dust, smoke where appropriate, changed lighting, and diminishing ambient life.

Implement a bounded environmental field model for heat, pollution, moisture or water stress, and habitat quality. Update at a slower rate than movement. Use chunk-level grids, coarse propagation, and dirty-region scheduling, with clear sources, sinks, limits, and conservation or loss rules. Do not run full fluid dynamics or atmospheric chemistry.

Include fire or industrial accidents, structural failure, and at least a small set of contextual weather or hazard events. Events should arise from conditions or seeded probabilities and provide useful warnings. Weather must not endlessly refill finite water reserves without accounting for the source.

Support credible material resistance and structural consequences. Removing a critical support or violently damaging a machine can collapse a bounded connected section and create finite salvage. Limit the number of authoritative dynamic fragments; render extra debris cosmetically on clients. A cinematic effect must not spawn thousands of permanent rigid bodies.

Escalating equipment should change the scale of damage: hand tools remove individual resources, powered tools excavate faster, machines process areas, and cosmic tools consume sectors. Every destructive action must update inventories, terrain, ecology, claims, and the campaign ledger consistently.

Keep environmental loss understandable in both first person and the overview. From the ground, players experience noise, heat warnings, disappearing wildlife, and ruins. From above, they understand networks, land change, and regional consequences.

## 13. Vehicles, automation, and shared projects

Ship at least one useful ground transport option—cart or rover—and one advanced drone or shuttle appropriate to later stages. Vehicles need embark/disembark, cargo, fuel or energy where appropriate, permissions, damage, and safe collision handling. They should help with real transport or exploration problems.

Use bounded vehicle physics suited to the terrain and hosting budget. Prefer one dependable vehicle controller over many half-working chassis. Persist parked vehicles and cargo without keeping them permanently active physics bodies.

Make logistics meaningful through physical carrying, linked containers, carts, pipes/cables, conveyors, or scheduled delivery drones. Choose a coherent combination. Do not simulate every transported inventory item as an independent rigid body. Visual delivery effects can represent aggregate authoritative transfers.

Allow machine configuration, supply priorities, input filters, on/off controls, and small reusable building blueprints. Blueprints place construction plans that still require materials and work; they do not duplicate completed structures.

Add cooperative megaprojects that connect the personal game to the cosmic arc: an expedition ark, a habitat network, a stellar collector, an interplanetary relay system, and a final universe-scale structure or decision. They should be functional, visible, and jointly buildable—not just achievement text.

## 14. All five stages must be fully playable

The required sequence is Earth → Mars → the Sun → the Solar System → the Universe. Each stage needs first-person presence, usable construction and equipment, stage-specific resources, an environmental transformation, a distinctive systemic challenge, and an actual transition or ending.

**Earth: attachment and industrialisation.** Rich biomes, survival, personal homes, wildlife, villages, cities, electricity, datacentres, and growing automation. The group can see living land become an extraction and computing landscape.

**Mars: life support and scarcity.** Use low-gravity traversal, pressure-safe habitats, buried ice, atmosphere and oxygen constraints, greenhouses, rovers, dust hazards, and competition between people and industry for scarce reserves. Track atmosphere by bounded habitat zones rather than per-voxel gas simulation. Breaches matter, but rebuilding a habitat must be possible.

**The Sun: power without a surface.** Do not portray the real Sun as ordinary solid ground. Put characters on fictional shielded stations, magnetic platforms, or collector structures, with protected local gravity where needed. Stellar extraction, intense heat, radiation, cooling, anchoring, and machine protection are central. The star visibly changes as energy is captured or consumed. The physics is deliberately science-fictional outside supported local mechanics.

**The Solar System: logistics after the Sun.** Use multiple bounded sectors or bodies, interplanetary links, specialised deposits, mining platforms, cargo movement, and a finite inherited stellar-energy reserve. Earth and Mars remain depleted remnants. Do not silently restore sunlight or reset the consumed Sun. Provide a coherent energy plan and a recoverable bootstrap path under the finite ledger.

**The Universe: the final frontier.** Represent stars, galaxies, and large structures through bounded strategic sectors and walkable local installations. Players still have embodied actions—operating, building, maintaining, exploring, or controlling an explicitly fictional construction form. Macro extraction changes the visible cosmos. Empty regions, vanished light, legacy worlds, and immense infrastructure communicate the scale of consumption.

Larger stages mean larger strategic reach, new spatial decisions, and changed dependencies. They are not the same green tile map recoloured five times. Do not attempt astronomical distances with one floating-point coordinate space. Use sector IDs and local coordinates, with an appropriate render origin.

Decide how personal gear, technology, cargo, and identity evolve across stages. Preserve meaningful possessions and player choice. A wooden pick should not mine a star unchanged; it may remain a keepsake or be deliberately converted through an explicit recipe.

## 15. Let players see every level without breaking progression

Ship a World Atlas accessible from the title screen and in-game. From the beginning, show all five stages, the current one, their broad themes, prerequisites, and the campaign’s progress.

Provide an interactive, read-only preview diorama for future stages. Clearly label it a preview rather than the current campaign’s authoritative world. Let players rotate, zoom, and understand the next frontier without obtaining resources, revealing private inventories, triggering simulation, or jumping ahead in the campaign.

Preserve completed worlds as read-only ruins or archived visits reconstructed from the campaign’s actual saved changes. Players should be able to recognise their old home, destroyed landscape, or infrastructure. Stream archived geometry at low priority; do not keep every past world fully simulated in RAM.

The active campaign, preview mode, archived visit, photo mode, and any developer sandbox must be separate session capabilities. Leaving a preview returns to the same live identity and state. Preview actions, stale commands, and imported creative items cannot mutate a survival campaign.

Include a campaign timeline, landmark archive, population/environmental history, and a before-and-after photo or composition system. The ending should use the room’s actual story rather than generic statistics alone.

## 16. Resource accounting, progress, evacuation, and endings

Preserve the original premise: the normal stage transition follows exhaustion of the current stage’s designated finite natural stocks. Define those stocks explicitly in the UI and content data. Ordinary decorative terrain and background visuals must not require mining every possible voxel.

For fixed geological or other one-way stocks, retain the invariant:

`initial = remaining in nature + extracted + explicitly destroyed`

For living and transformable stocks, implement a compatible finite-capital ledger with recorded internal transfers, stored outputs, consumption, waste, and irreversible loss. Keep units coherent. Do not pretend wood, water, energy, and animal population are the same physical substance. Separate ledgers may track distinct conserved quantities or explicitly fictional ecological-capital units.

Chunk manifests must establish finite stock totals independently of whether anyone has loaded those chunks. Maintain incremental remaining-stock totals; do not scan every voxel in every stage each tick to determine completion. Lazy generation must use a stable generator version, seed, manifest, and saved deltas. Persist ownership and state changes before eviction. Mining, pollution, animal reproduction, farming, fire, collapse, salvaging, and relocation must use the appropriate accounting path.

Recycling recovers previously extracted material at a defined loss; it does not recreate an original ore deposit. Managed farming can preserve life at a cost; it does not spawn unlimited campaign capital. No weather, respawn, blueprint, machine, or repair loop may manufacture free stock.

Make the final deposits findable and reachable. Avoid softlocks from claims, deep caves, destroyed bridges, lost tools, unavailable workers, output blockage, or exhausted energy inputs. A slow manual or salvage route may remain when industry fails.

At exhaustion, start a server-controlled finalisation phase. Warn and show what has happened. Freeze incompatible new actions, settle transactions and station queues, capture the world archive, and prepare the next stage atomically. Do not demand a final payment that cannot be made after resources are gone.

Give evacuation clear rules. Preserve each player’s personal items and identity through a bounded, explicit carryover design; settle communal cargo, vehicles, chest contents, research, and landmarks. Show left-behind contents and their fate in the archive, and recover any designated carried-forward items through the settled evacuation manifest only—not by mutating an archived world. Clearly disclose what is transported, stored, or deliberately abandoned before finalisation; never silently delete valuables. Bound storage without destructive surprises. Do not let an absent player block the room indefinitely.

Carry historical depletion outward: exhausted Earth and Mars remain exhausted in the Solar System; the depleted system remains part of the Universe. New frontiers expose new stocks, not refreshed copies of old ones.

Create a deliberate consumption ending after the Universe is exhausted. A final expansion interface with no destination, a city with no living surroundings, or extraordinary output with nobody left to benefit could work. Use the actual campaign’s choices, places, lives, and losses. You may invent a stronger ending.

Also implement an earned collective restraint ending with transparent voting and protections against disconnect manipulation. The vote must not pass solely because a dissenting player momentarily loses connection. A new campaign is explicit and separate; neither ending secretly resets the old world.

## 17. Multiplayer rules, social tools, and protection

Default to cooperative environmental survival. Each player has private possessions; infrastructure can be shared by permission; environmental effects are collective. Support guest sessions, inviting friends, reconnect identity, late joins, host succession, and room settings.

Provide emotes, location pings, map markers, a concise activity feed, safe text chat with mute and basic host controls, and collaborative project markers. Keep names and chat as text, cap sizes, and avoid rendering user-supplied HTML. Voice chat is not required and must not become a dependency or a paid service assumption.

Implement host kick/ban controls, room locking, private invitations, claim or building protections, chest permissions, and sensible spawn protection. Guest tokens are not strong real-world identities; do not claim bans cannot be evaded. Do not leak session or invitation secrets through public state, URLs in logs, or telemetry.

Optional PvP can be a room setting, but it must be off by default, clearly disclosed, and not switch on unexpectedly during an existing cooperative session. Permissions must cover melee, projectiles, vehicles, environmental damage, and demolition consistently. Friendly-fire settings do not grant a bypass to resource or ownership rules.

Allow new players to contribute without automatically handing them an exploitable pile of resources. Use bound starter gear, shared work opportunities, and clear team onboarding. Protect persistent owners’ property when their client is absent. Separate connection/session cache eviction from durable player and container ownership.

Maintain a single authoritative owner of each campaign. This release is not an unsharded, globally shared MMO. Maximise tested players per room and per server while keeping that shared world correct and responsive.

## 18. Rendering and world-data architecture

Use Next.js and TypeScript for the shell, menus, settings, routing, and HUD. Preserve static export and the current one-port deployment unless a verified reason and permission justify a change. The interactive world is browser-rendered through a client-only graphics boundary.

Recommended starting approach: Three.js with a dedicated render loop and a chunked voxel/world representation. React Three Fiber is acceptable if it demonstrably improves implementation without putting per-entity or per-frame state through React. A stronger maintained renderer is acceptable after a short evidence-based comparison. Select early and stop framework shopping.

Use one scene and entity representation with camera adapters. Separate world data, render meshes, physics colliders, networking, gameplay systems, and UI summaries. Keep browser-only modules out of server imports. Pin compatible stable dependencies; do not mechanically upgrade every package.

Use packed typed arrays or compact palettes for voxel data, sparse modified chunks, bounded caches, and explicit ownership of memory. Generate chunk meshes from visible surfaces, with face culling and greedy merging or a similarly measured strategy. Do not create one JavaScript object, scene node, draw call, or physics body for every block in the entire world.

Use instancing for repeated compatible props, material atlases where useful, LOD, frustum culling, configurable draw distance, limited shadow budgets, and bounded lights and particles. Offload substantial meshing or generation work to workers when measurements justify it. Never transfer the only authoritative buffer and accidentally detach the server’s or client’s live state.

Dirty chunk remeshing must include affected neighbours at boundaries. Keep visual and collider revisions coherent. Avoid visible holes, stale hit tests, and walking through terrain while a mesh is being rebuilt. Rebuild only affected regions.

Stream nearby chunks and low-detail strategic summaries rather than the whole universe. Prediction requires nearby collision data, so prefetch a safety margin ahead of movement. Block or constrain movement into unknown collision space instead of trusting empty space.

Handle WebGL context loss, tab hiding, resize, high device-pixel ratios, shader compilation stalls, and device quality differences. Bound all caches, dispose abandoned GPU resources, and ensure repeated stage previews or camera switches do not leak memory.

Do not require WebGPU-only hardware to play. Start with a dependable broadly supported graphics path and graceful quality options. Additional rendering features must improve the tested experience rather than become prerequisites for booting.

## 19. Physics: credible, consistent, and budgeted

“Accurate physics” means consistent units, believable movement and collisions, correct consequences, and shared authoritative rules. It does not mean solving full fluid dynamics, relativistic astrophysics, or rigid-body interaction for every grain of soil.

Use world-local metres, seconds, velocities, accelerations, collision masks, and material properties consistently. Define the relationship between a voxel and a world unit. Use an upright capsule or equivalent stable player collider, gravity, grounded detection, step height, slope limits, jump behaviour, crouch clearance, fall damage, and swimming or buoyancy where appropriate.

Use a fixed-step server-authoritative movement simulation. Start by evaluating approximately 20–30 Hz against the real CPU budget; run the same movement step for local client prediction and interpolate rendering independently. Do not tie speed to frame rate or let clients choose their own elapsed time.

Evaluate Rapier’s JavaScript/WASM controller and bounded rigid-body support against the existing machine’s memory and sustained CPU allowance. Use it if it fits. A focused, well-tested voxel collision controller is acceptable if it preserves the required behaviour more efficiently. Decide through a representative collision/terrain benchmark, not a preference argument.

Pin engine versions and initialise collision data consistently on client and server. Deterministic engine behaviour alone does not guarantee identical game outcomes when inputs, entity order, world edits, or timestamps differ. Keep authoritative reconciliation even when prediction uses the same library.

Use swept collision or suitable continuous collision detection for fast projectiles and relevant vehicles. Validate hit distance, timing, line of sight, attack state, and target existence server-side. Use a bounded history window for lag compensation only where justified, and never trust arbitrary client timestamps or unlimited rewind.

Implement static terrain collision efficiently; use dynamic bodies only for active objects that need them. Sleeping props, distant vehicles, and aggregate logistics should not consume full-rate physics. Cosmetic fragments and particles never decide damage or item outcomes.

Structural integrity can use a bounded support graph. Habitat atmosphere can use connected zones. Water can use bounded volumes or a coarse flow approximation with explicit source accounting. Document these abstractions honestly and test their edge cases.

Mars may use reduced gravity. Solar and cosmic installations need explicit fictional platforms, suits, or construction bodies; do not claim that ordinary people can stand on plasma or walk between galaxies under Earth physics.

## 20. Authoritative state, efficient replication, and latency

Retain or improve the existing authoritative Node/WebSocket architecture. Do not place the simulation in Next.js request handlers or move authoritative decisions into clients to claim a higher player limit.

The server owns positions, health, inventory, equipment, world edits, hit results, wildlife, crafting, machines, environmental fields, containers, permissions, research, progression, and endings. Clients submit bounded intentions with sequence and identity information. Never accept a client’s final inventory, damage, teleport position, harvest yield, or claimed elapsed simulation time as truth.

Separate update frequencies: fixed-rate movement and active collision; lower-rate AI decisions; approximately 1 Hz economic/environmental updates where suitable; much slower distant aggregates; event-driven private inventory and container changes. Profile the choices. Gameplay away from a camera or unloaded client chunk must still follow authoritative macro rules.

Implement server-controlled spatial interest management using chunks or spatial cells. Replicate nearby entities and relevant chunk revisions, room-level summaries, and private data only to authorised recipients. Use coarse map information for strategic cameras instead of granting every client every detailed entity in the world.

The old room-wide contiguous delta sequence must be redesigned carefully. Filtering different changes for different clients creates intentional gaps. Use a per-recipient stream sequence or explicit baseline/revision protocol, not a global `seq + 1` check that triggers endless full resynchronisation when updates are filtered out.

Handle enter/leave-interest events, chunk baselines, revisions, entity creation/removal, late packets, and snapshot boundaries. A delta must name the baseline or revision it applies to. A missing baseline triggers a bounded local resync, not an unlimited resend of the entire campaign.

Separate public state from owner-private state and temporarily authorised container state. Invalidate permissions promptly when a chest closes, ownership changes, or access is revoked. Preview and spectator subscriptions must not expand authority or private visibility.

Use quantised movement, compact identifiers, dirty-field updates, batched block edits, bounded binary messages where profiling demonstrates a gain, and prioritised transmission. Keep a versioned codec with round-trip and malformed-packet tests. JSON for rare control messages can remain if it is cheaper to maintain and sufficient.

Generate repeatable terrain client-side from an authorised manifest when useful, then apply authoritative modifications. This is compression, not permission for the browser to invent resources. Decide what the seed exposes and do not claim it provides anti-x-ray security.

Use local movement prediction and server reconciliation, with input acknowledgements and a bounded replay buffer. Interpolate remote players and creatures with an adaptive but capped buffer. Immediate camera/tool feedback is allowed; unconfirmed economic outcomes must remain visibly pending until accepted.

Bound outgoing and incoming queues. Monitor buffered bytes and apply application-level flow control: coalesce superseded movement before transmission, prioritise reliable game events, throttle bulk chunk sends, and resynchronise or disconnect genuinely slow clients safely. Do not discard confirmed item transfers or stage events to improve apparent ping.

A WebSocket stream remains ordered and reliable under its transport. Do not write code that assumes you can cancel bytes already sent or achieve UDP-like delivery by renaming messages. Avoid introducing a new transport or complex service unless it solves a measured problem within the permitted deployment.

Report RTT, input-to-local-feedback, command-to-authoritative-confirmation, server processing time, snapshot age, bandwidth, and correction magnitude separately. Prediction improves perceived responsiveness; it does not eliminate geographic network delay. A Sydney-hosted world cannot promise equally low RTT to every continent.

Keep room mutation serialised. Concurrent building, hitting, looting, crafting, revival, and final-resource extraction must have one valid outcome. Use stage generations and room incarnations to reject stale commands after transitions or restarts.

## 21. Persistence, migration, security, and failure recovery

Preserve existing campaigns. Bump protocol and schema versions for incompatible changes, with explicit migrations and compatibility behaviour. Do not wipe the SQLite database to avoid writing a migration.

Map the existing two-dimensional positions into the new 3D coordinate convention deliberately. Preserve resource depletion, buildings, ownership, landmarks, stage history, and player identity where present. Move a legacy shared stockpile into a named communal supply container exactly once, not into a full copy for each player. Find safe new spawn positions without generating free natural resources.

Separate durable world and economy data from transient render state, interpolation buffers, and active physics handles. Store generation version, finite manifests, modified chunks, item instances, containers, players, crafting queues, machine state, population/ecology summaries, research, stage history, and critical receipts.

Use SQLite transactions on the existing persistent volume unless authorised architecture changes justify another store. Avoid serialising a giant universe or writing every position at every tick. Use appropriate chunk records, indexed identifiers, periodic snapshots, and a bounded journal or transaction record for critical changes.

Economic command effects and deduplication receipts must share a durable commit boundary. Choose and implement a clear acknowledgement policy: critical item transfers, crafting consumption, loot ownership, and stage transitions should not be reported durably committed before their database commit. Group commits are acceptable when pending and completed states remain distinguishable. Do not block physics on unnecessarily large synchronous writes.

Movement can use periodic persistence with a declared rollback bound. Recovery must not restore item inventories from one time and chest contents or command receipts from another. Test crash windows before, during, and after commit.

Exactly-once network delivery is not the claim. The requirement is one valid economic effect under duplicate, retried, interrupted, or replayed commands, with a clear resynchronisation policy after a new incarnation.

Persist the finalisation phase and next-stage identity before announcing completion. Restarting at a stage boundary must not duplicate a world, its resources, carryover cargo, or rewards. Rejoining during the change yields one valid authoritative stage.

Use real backups. For SQLite WAL mode, use a database-consistent backup mechanism or checkpoint procedure; do not copy only the main `.db` file from a live WAL database and assume it is complete. Test restore into an isolated data directory. Fly volume snapshots are supplementary, not the entire recovery plan.

Enforce payload bounds, nesting/count limits, finite numerical values, range and cooldown validation, session checks, an explicitly configured origin policy, path safety, container permissions, and per-command rate limits. Trust forwarded host/address headers only from the configured proxy; do not let an arbitrary client-supplied host establish authorisation. Prevent decompression bombs, oversized chunk requests, and unbounded terrain edits. Redact tokens and private player data from logs and public health endpoints.

Developer cheats, world mutation APIs, and accelerated presets must be explicitly isolated and disabled or permissioned in normal production rooms. No public endpoint may fast-forward stages, grant items, or bypass ownership without proper authority.

## 22. Capacity: maximise what the actual server can sustain

Do not retain eight players merely because the old prototype used eight. Do not replace it with an arbitrary claim of 100 or 1,000 either. Find and publish the tested safe operating envelope.

Benchmark increasing active populations such as 8, 16, 24, 32, 48, and 64, continuing higher only while sustained measurements justify it. Test players clustered in one busy region and spread across many chunks. Include active mining, crafting, chests, vehicles, wildlife, industrial networks, environmental events, and a stage transition. Idle sockets are not active-player evidence.

Measure both players per room and total active players/rooms per server. Bots generating server load do not establish the browser’s ability to render that many players. Include real rendered clients viewing the crowded area and the largest permitted settlement.

On the permitted shared-CPU Fly machine, sustained quota and throttling matter, not just brief burst performance. Warm up and run long enough to observe behaviour after CPU burst credits can no longer mask the workload. Record cgroup/platform throttling where available. A test on a powerful local machine is useful development evidence, not production certification.

Starting targets, to be measured rather than advertised without proof:

- 60 FPS at 1080p medium quality on an explicitly identified ordinary laptop or integrated-GPU desktop; a usable 30 FPS low-quality mode where hardware needs it.
- Record p50, p95, and p99 frame times and 1% lows in a dense scene; do not substitute “time spent in my draw function” for complete browser frame pacing.
- Server p95 step time comfortably below half of its chosen step interval, p99 within its deadline, and sustained CPU within the actual allocation after other server work.
- Memory and GPU memory stable during extended traversal, previews, joins, and stage changes. Preserve substantial measured headroom under the real container memory limit.
- A bounded steady-state bandwidth budget per player, provisionally aiming below roughly 30 KB/s downstream and 8 KB/s upstream during ordinary play, with chunk streaming measured separately. Optimise based on actual traffic, not these provisional numbers alone.
- Local input feedback within a render frame when possible, and authoritative confirmation approximately RTT plus bounded server scheduling/processing rather than a hidden long queue.
- No growing replication backlog or loss of economic correctness under the declared capacity.

Derive the published cap from the worst relevant tested scenario with explicit safety headroom. Implement admission control, reconnect reservations, an understandable full-room state, and a bounded queue or invitation to another room. Avoid dropping existing players simply because a smoothed utilisation metric fluctuated for one tick.

Under overload, reduce cosmetic detail and noncritical update work before correctness. Never stop validating attacks or inventory, skip economic accounting, or grant client authority. Do not change time progression unfairly for only part of a room.

Make limits configurable, but distinguish certified limits from an administrator’s experimental override. Include population, active chunks, buildings, agents, network, tick, and memory budgets in `docs/CAPACITY.md`.

## 23. Deployment and operating the finished release

Respect the existing one-machine, one-volume, one-port course setup unless the owner explicitly authorises a different infrastructure budget. Unlimited model usage is not cloud-spending approval.

Keep one authoritative campaign owner. Fly load balancing does not merge independent in-memory worlds, and independent volumes do not automatically replicate. Do not add replicas without implementing and testing owner routing, ownership fencing, persistence, and failure behaviour first.

Do not promise global low latency from one Sydney machine. Measure actual routes. Prepare portable region configuration and, only where permitted, recommend a better host region for the actual group. Avoid mid-session migrations that create two owners or lose inventory.

Preserve or improve Docker builds, CI checks, health probes, graceful shutdown, secure WebSockets, origin checks, and static asset caching. Coordinate protocol upgrades with browser reload/reconnect behaviour. Handle an old cached client meeting a new server without corrupting state.

Pause and save when the room is empty, then unload it. Confirm machine autostop behaviour matches open connections and room policy. Do not assume background CPU alone will keep the machine alive. Configure startup so assets, storage, and physics dependencies are ready before readiness is reported.

Maintain `main` deployable and follow the repository’s CI/deployment ownership rules. Test changes and migrations in isolated worlds/data first. A public release must not be an unannounced destructive reset. Where CI owns deployment, use the prescribed path; where credentials are absent, provide the exact tested package and remaining action without claiming it is live.

Do not run unrestricted load generators against shared public infrastructure. Use controlled test rooms and authorised limits, clean up test data, and stop tests that threaten the deployed service. Perform destructive crash tests in isolated environments.

## 24. Visual identity, sound, accessibility, and delight

Create an original cohesive art direction: warm, stylised, readable low-poly or voxel forms, appealing characters, expressive wildlife, attractive terrain, and industrial structures that are recognisable from the ground and above. Procedural assets are acceptable when they look intentional; primitive placeholders are not the final art direction.

Use a consistent palette, scale, material language, lighting style, icon set, typography, and animation rhythm. Add meaningful detail: doors, rooflines, work surfaces, pipes, stacks, fans, cables, lights, and visible machine operation. Dense industry should look like a constructed place, not the same cube repeated with text labels.

Animate movement, tool use, impacts, carrying or interaction, construction progress, equipment, creature behaviour, vehicle activity, and machinery. Include day/night or an equivalent lighting cycle where appropriate, keeping work playable and accessible. Cosmic stages should have their own visual grammar rather than grass tiles painted black.

Use spatial or directionally meaningful ambience, footsteps, materials, tools, water, animals, industry, warning sounds, and music transitions. As an environment dies, the soundscape should lose life in a recognisable way. Provide subtitles or visual equivalents for critical audio cues and independent volume controls.

No runtime LLM dependency is required for NPCs, chat, quests, dialogue, or procedural content. Use the development model allocation to author rich deterministic content and scripts. Do not impose API charges, credentials, or variable network delays on players to make the game function.

Make controls remappable, menus keyboard navigable, UI scale adjustable, key text readable, and important information colour-independent. Provide motion and flashing-effect reductions. Test pointer lock and first-person interaction in real browsers; automated accessibility checks alone do not establish that a 3D world is accessible.

Desktop keyboard/mouse is the primary release platform. Add gamepad or touch support only when it can be fully integrated and tested without sacrificing the mandatory release. On unsupported devices, provide an honest message and usable atlas rather than a broken “play” promise.

Track asset sources and licences in `docs/ASSETS.md`. Avoid missing remote assets at runtime. Prefer assets bundled and optimised for this deployment. Never expose keys or rely on paid content that has not been authorised.

## 25. Use the model allocation as a real development team

Where the harness permits subagents, use a coordinated parallel team with bounded responsibilities:

- Integration lead: architecture, shared interfaces, migration, build health, and release decisions.
- World/rendering engineer: 3D scene, cameras, chunks, assets, lighting, and render profiling.
- Physics/gameplay engineer: character control, tools, weapons, damage, vehicles, and interactions.
- Economy/simulation engineer: crafting, machines, power/water, datacentres, ecology, settlements, and stages.
- Networking/persistence engineer: interest management, transactions, schema migration, security, and recovery.
- UX/content engineer: onboarding, inventories, atlas, progression clarity, audio, writing, and usability.
- Independent QA/reviewer: adversarial tests, real multiplayer sessions, balance runs, performance evidence, and regression review.

Adapt concurrency to the actual development environment. Parallel model calls do not create infinite CPU for builds or benchmarks. Do not run competing performance tests simultaneously and then present noisy results as clean measurements. Assign file/module ownership, freeze shared contracts early, and integrate regularly.

Use independent reviews for dangerous boundaries: private state, chest transactions, crafting escrow, terrain accounting, collision changes, stage finalisation, and crash recovery. Reviewers should inspect code and run tests, not merely affirm a summary written by the implementer.

If subagents are unavailable, carry out the same roles as separate passes with saved findings. Do not claim multiple agents or independent verification when it did not happen.

Spend abundant model usage on resolving observed defects, improving assets and writing, generating edge cases, maintaining tests, tuning balance, and checking the integrated experience. Avoid repeated scaffolding, redundant design reports, uncontrolled framework churn, or a huge amount of generated code nobody has executed.

## 26. Seven-day internal execution plan

This is an internal plan for one final product, not seven releases. Adjust the order when dependency evidence requires it, but bring the complete game together early enough to test it deeply.

**Day 1 — Evidence, contracts, and a playable 3D foundation.** Run and record the baseline. Define coordinate conventions, chunk representation, entity IDs, inventory/container transactions, schema/protocol changes, and rendering interfaces. Implement genuine 3D terrain, the three cameras, authoritative collision-aware movement, two clients in one world, and a first personal inventory/chest transaction. Establish the art target and physics/hosting microbenchmarks. Keep tests running.

**Day 2 — The personal sandbox becomes real.** Complete harvesting, mining, block/piece construction, tools, equipment, crafting stations, cooking, health, death/recovery, chests, cooperative supply, and first wildlife. Integrate chunk streaming and interest management early. Test two people building, trading, hunting, and reconnecting in the same 3D environment.

**Day 3 — Towns, industry, and the complete five-stage skeleton.** Add settlements, electricity, water, datacentres, automation, ecological pressure, vehicles, and the atlas. Make all five stages traversable through normal rule-driven progression with accelerated balance presets. Implement their distinct mechanics, carryover, archive state, and the endings now—not on the final evening.

**Day 4 — System depth and content completion.** Finish the meaningful recipe and building library, production chains, wildlife behaviours, farming, heat/pollution/water effects, civic priorities, damaging tools, structural/habitat consequences, social permissions, and each stage’s identity. Complete migration and transaction durability. Run full campaigns while content work continues in parallel.

**Day 5 — Multiplayer hardening and sustained capacity work.** Freeze major architecture changes. Run adversarial inventory and permission tests, spatial-streaming edge cases, collision/terrain regressions, and isolated crash/restore tests. Run active load tests on the actual permitted machine where available and calibrate capacity. Profile crowded first-person and isometric scenes, not only empty terrain.

**Day 6 — Whole-game playtests and polish.** Freeze new large systems. Play complete normal and accelerated campaigns, including inefficient and destructive strategies, failed infrastructure, deaths, late joins, empty-room resume, and the final transition. Fix pacing, softlocks, confusing UI, weak content, sound, animation, and framerate problems. Obtain human feedback where people are available; clearly distinguish it from bots.

**Day 7 — Release verification and presentation.** Resolve material defects, run the final clean-build and regression matrix, restore a backup, verify saved-game migration, and verify the deployment through its actual URL where access permits. Produce a short complete playthrough or evidence set, measured capacity report, operating guide, player guide, and honest final status. Keep time for fixes found by this verification.

Use the week productively. Do not wait for calendar time to pass. Do not stop because a simple lint/build check is green while known requested systems are missing. Before context reset or interruption, save exact progress and next tasks so work can resume without redoing the project.

## 27. Acceptance tests that define the release

Implement automated tests and real-browser checks appropriate to each requirement. At minimum, demonstrate the following integrated scenarios:

1. Two independent browser clients join one campaign, choose different camera modes, see the same physical world, and interact with the same building and creature.
2. Switching first-person/isometric/third-person view preserves position, velocity, health, selected tool, inventory, permissions, and connection.
3. A player mines terrain; both clients see matching geometry and collision changes, including a chunk boundary, an excavation, and a later reconnect.
4. Players harvest into different inventories. One transfers items through a shared chest; two users race for its last stack; only valid transfers succeed.
5. A crafting queue survives disconnection and restart, consumes inputs once, handles a full output buffer, and cannot duplicate goods through cancellation or demolition.
6. Tools wear, repair correctly, unlock useful capabilities, and damage materials or targets according to authoritative rules.
7. Hunting, carcass harvesting, cooking, equipment crafting, farming, and an animal population change form a complete resource chain.
8. Player damage, revival, death, loot recovery, respawn, and a disconnect during these actions produce no duplication, unauthorised looting, or permanent trap.
9. A town grows with reliable services. Aggressive datacentre operation strains a visible utility, triggers warnings, and can cause a traceable shortage-related harm. Changing priorities or throttling prevents or mitigates that harm in a reproducible test.
10. A vehicle carries real cargo, crosses streamed terrain safely, and persists when parked; a delivery mechanism transfers materials without creating independent infinite items.
11. Buildings, claims, attacks, projectiles, demolition, chest access, and PvP settings obey the same permissions under hostile commands, not merely through disabled buttons.
12. Atlas previews and archived visits cannot grant items, damage the active world, expose private contents, or advance the campaign.
13. A complete campaign reaches Earth, Mars, Sun, Solar System, Universe, and the consumption ending through normal production and depletion rules. A developer skip button is not evidence.
14. Each stage is meaningfully playable in first person and isometric mode; none is only a screenshot, menu, placeholder, or renamed Earth scene.
15. Resource accounting remains valid through regrowth, reproduction, water handling, industry, fire, salvage, destruction, streaming, and stage carryover.
16. Exhaustion finalises once, including simultaneous last-resource actions, disconnects, and crash/restart around the stage boundary. Previous worlds never regain consumed natural stock.
17. An empty campaign pauses; the next player resumes the same world. Absent owners retain their inventories and chests.
18. A legacy saved room migrates without multiplying its shared stockpile or losing ownership, history, or depletion. A consistent backup restores successfully.
19. Sustained active-player tests establish the published cap, with full server metrics and real rendered-client evidence under crowded conditions.
20. The release works under measured local, ordinary regional, and degraded network conditions. Test at least several RTT/jitter conditions such as approximately 50, 150, and 300 ms RTT, and use a real network impairment mechanism for transport loss/retransmission tests. Do not fake packet loss by randomly discarding authoritative application transactions.
21. Bounded buffers, private snapshots, malicious inputs, schema mismatches, and slow clients cannot corrupt or crash unrelated rooms.
22. New players can understand the first ten minutes: get a useful tool, store something personally, craft a meaningful item, cooperate, build shelter, and perceive a consequence without consulting a developer.
23. Final browser profiling includes normal hardware where available, p95/p99 frame times, both camera perspectives, industrial density, and repeated preview/stage transitions. Software-rendered headless runs are labelled as such.
24. The final ending uses the actual campaign’s places, consumption, survivors or losses, and choices. The restraint ending is verified separately, including reconnect and dissent cases.

Maintain a reproducible acceptance matrix with commands, fixtures, results, environment, timestamps, and links to screenshots/logs. Mark an unavailable measurement as unmeasured. Do not infer a pass from a README claim or a bot’s success when the requirement concerns human usability or rendered performance.

## 28. Checkpoints, completion discipline, and handoff

Keep a concise `agent/now.md` or equivalent checkpoint with the current commit, runnable commands, integrated systems, failing tests, measured limits, pending decisions, and the next concrete tasks. Keep architecture, protocol, data definitions, and migrations discoverable without reading a giant conversation transcript.

Before ending a session, leave a clean handoff and coherent commit where possible. After resuming, read the checkpoint and inspect actual code and test results. Do not assume an earlier agent’s claimed completion is proof.

Protect integration time. When a subsystem is too expensive in its first form, change its representation while preserving the player-facing capability: aggregated distant animals instead of full-rate AI, bounded habitat zones instead of per-voxel gas, chunk meshes instead of per-block scene nodes, visual cargo instead of physics for every item. Do not silently remove first-person play, private inventories, chests, crafting, wildlife, meaningful datacentres, physics, the atlas, or any of the five stages.

The final delivery must contain the runnable game, source and lockfile, data-driven content, original/licensed assets, migration and recovery mechanisms, tested deployment configuration, play instructions, server-operation instructions, capacity evidence, and the acceptance report. Include a release note with actual implemented capabilities and any material remaining defects. Do not claim this brief guarantees completion irrespective of the real execution window.

Do not end with “here is the plan for the final version.” Build the final version. If execution is forcibly interrupted, give the exact checkpoint and honest remaining work, not a fabricated success report.

## 29. Primary references to verify while implementing

These references informed the brief. Use official documentation for the versions actually selected and record consequential compatibility decisions. Do not spend the run browsing instead of building.

- Existing architecture and fixed deployment constraints: the repository’s `docs/ARCHITECTURE.md`, `CLAUDE.md`, and `fly.toml`.
- Next.js client-only loading: https://nextjs.org/docs/app/guides/lazy-loading
- Three.js voxel geometry: https://threejs.org/manual/pages/voxel-geometry.html
- Rapier JavaScript character control: https://rapier.rs/docs/user_guides/javascript/character_controller/
- Rapier determinism conditions: https://rapier.rs/docs/user_guides/javascript/determinism/
- Browser WebSocket API and its queue limitations: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
- Pointer lock and browser interaction: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API
- Fly CPU allocation and burst behaviour: https://fly.io/docs/machines/cpu-performance/
- Fly volume durability, replication, and backups: https://fly.io/docs/volumes/overview/
- Fly room-owner connection routing, should authorised infrastructure ever require it: https://fly.io/docs/blueprints/connecting-to-user-machines/
- IEA, data-centre electricity and cooling context: https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai

The environmental, mortality, cosmic-extraction, and balance systems requested here are fictional game models. Use research to improve their causal coherence, not to misrepresent them as measured real-world predictions.

## 30. Start now

Inspect the workspace, start the existing application, record the baseline and constraints, establish shared implementation contracts, assign the available parallel roles, and begin the playable 3D integration in this session.

Keep asking two questions throughout the week:

> Can another person actually play this feature together with me, in the real shared world?
>
> What does the next act of growth make possible—and what does it make impossible to recover?
