# CONSUME THE UNIVERSE
## A seven-day creative and engineering mission for an autonomous AI game developer

### 1. Your role and mission

Act as the creative director, game designer, gameplay programmer, multiplayer engineer, technical artist, and playtester for an original browser game. Work iteratively across approximately one week to design, implement, test, and polish a playable game. Use the tools and execution time actually available to you. This is an implementation assignment: written design should lead directly to working software.

The premise is simple:

Players arrive together in a beautiful world. They harvest its natural resources, build settlements, cities, industrial infrastructure, and datacentres, and become increasingly effective at production. Their success gradually turns the environment into a depleted, desolate landscape. When the map's natural resources have been exhausted, the group advances to another stage with a larger playable scope and new resources to exploit. The required progression is Earth -> Mars -> the Sun -> the Solar System -> the Universe. You may add an opening island or intermediate galactic stage if it strengthens the experience without compromising completion.

The game explores humanity's appetite for unending growth and the environmental destruction that appetite can produce. Make that idea something players experience through satisfying decisions and visible consequences. Let them enjoy building the machine, then notice what the machine has consumed.

The presentation should be charming, animated, and approachable, with a top-down isometric perspective and the warmth, tactile interactions, decorating, gathering, and social presence associated with Animal Crossing. Create an original visual identity, characters, interface, writing, assets, and music.

Use Next.js and TypeScript for the browser application. Render the interactive world on the client. Run authoritative multiplayer simulation on a persistent server deployed to Fly.io. The server owns game state; browsers render it and submit player intentions.

Deliver a coherent, enjoyable game with a complete progression arc. Every major decision should serve the experience of playing together, building, consuming, and confronting the results.

### 2. Your creative authority

You have substantial creative freedom. Invent the title, setting details, player characters, visual language, economy, machines, fictional institutions, stage transitions, sound palette, humour, and ending. Treat the examples in this brief as starting points unless explicitly described as required.

Early on, explore two or three concise creative directions. Compare their emotional impact, gameplay potential, visual identity, and implementation cost. Select one and proceed. Record the decision briefly; do not spend days producing competing design documents.

You may challenge an example when you have a stronger solution. Preserve the central premise, multiplayer, tile construction, isometric presentation, ecological transformation, required cosmic stages, and technology constraints. Explain consequential departures in a short decision log.

Design for desktop browsers first. Start with private rooms for 2-8 players, with solo play available for development and exploration through the same simulation. Treat this player count as an initial design target to verify. Room capacity and map sizes must follow measured performance.

The emotional arc should move through discovery, attachment, ambition, dependency, acceleration, loss, and a final confrontation with the absence of another frontier. These feelings should arise from play rather than repeated explanatory text.

### 3. Design pillars

Build around these principles:

- **The world is worth spending time in.** Give the initial landscape movement, texture, little surprises, recognizable places, and activities that help players become attached to it.
- **Growth is genuinely attractive.** A new building should offer a useful capability, satisfying animation, social benefit, or interesting new decision. Let players understand the appeal of expansion.
- **Every convenience has dependencies.** Automation reduces manual work while creating greater demands for energy, materials, cooling, space, and infrastructure.
- **The consequences remain visible.** Extraction changes the places players inhabit, not just a resource counter.
- **Other people matter.** Cooperation should create capabilities and tensions that a solo player would experience differently.
- **Scale changes the problem.** Each new stage adds a meaningful spatial, economic, environmental, or cooperative decision.
- **The ending follows the premise.** Consuming the universe must lead somewhere emotionally and mechanically deliberate.

Critique the incentive structure and the appetite for unlimited expansion. Give construction and technology real benefits within the fiction, so the player faces a compelling trade-off. Keep scientific speculation and balance numbers clearly within the game's invented rules.

### 4. The experience of playing

Create a game people can understand by moving around and trying things. A player should enter a room, recognize their character, see another player, interact with a resource, and understand how to place their first useful building with very little explanation.

The core loop is:

Explore -> gather or extract -> choose a location -> construct -> gain a useful capability -> encounter new demand and environmental cost -> coordinate and expand -> exhaust the frontier -> move outward.

Make the first ten minutes especially strong. Include a beautiful starting area, readable movement, a satisfying harvest interaction, a placement preview, construction feedback, a visible production result, a useful cooperative action, and the first unmistakable environmental change.

Characters should inhabit the world. Support movement, contextual interaction, facing, and readable activity animations. Choose a coherent control scheme such as keyboard movement with mouse interaction, optionally supplemented by click-to-move. Explain controls through compact prompts and an accessible help panel.

Construction must occur on tiles. Include a ghost preview, footprint highlighting, valid and invalid placement states, understandable rejection reasons, cancellation, inspection, and rotation where a building's design benefits from it. Larger buildings can occupy several tiles. Decide how players remain visible around tall structures and how obstructed routes are handled.

Keep gathering tactile at the beginning. As automation develops, replace repetitive actions with decisions about layout, throughput, priorities, shared projects, and expansion. Players should continue having meaningful things to do after machines take over basic extraction.

Add a few low-pressure social pleasures: emotes, naming a district, decorating a plaza, marking a favourite place, or taking an in-game photograph. Choose those that reinforce attachment and fit the week. A small expressive set is enough.

Avoid real-world waiting requirements. Construction timers and progression should support active browser sessions. Provide a clearly labelled accelerated development preset so the entire campaign can be tested quickly through the normal simulation rules.

Choose and document a target duration for an ordinary full campaign, approximate time per stage, and how progress scales with player count. A campaign may span saved sessions. Validate this pacing through play so the final result has room to develop its emotional arc without becoming an extraction grind.

### 5. Resources, cities, and datacentres

Create an understandable economy with meaningful interactions between a small number of resource families. Possible early resources include biomass, stone, metals, water, fertile land, energy sources, and processed materials. You choose the final names and recipes.

Distinguish finite natural stocks, harvested inventory, manufactured goods, and ongoing production capacity. Make the relationship between them readable. Show when a building is idle, what input it lacks, and how the player could resolve the shortage.

Give the major building families clear jobs: extraction, processing, power, logistics, housing or city development, datacentres, and stage-specific infrastructure. Avoid adding buildings that differ only by a larger output number. Prioritize a compact set whose interactions create interesting choices.

Cities and datacentres must be central to the game. One promising relationship is:

Cities create demand for services and computation. Datacentres provide capabilities, automation, research, and growth opportunities. Those capabilities enable larger cities and more extraction. The resulting demand requires more power, materials, land, and cooling, encouraging still more expansion.

Develop this into a playable feedback loop. Compute should have concrete uses. A datacentre might coordinate logistics, reveal deposits, enable autonomous extractors, unlock new building types, or support a larger settlement. It should be a functioning part of the world with an operating footprint.

Offer decisions with different immediate benefits and longer consequences: compact versus sprawling development, rapid versus efficient extraction, alternative cooling methods, specialization versus redundancy, or shared infrastructure versus private convenience. You can propose better trade-offs.

Let players inspect costs, outputs, bottlenecks, and environmental effects without reading a spreadsheet. Use visual connections, simple overlays, contextual panels, and a restrained HUD. Choose one understandable transport or network model and implement it well.

Economy balance belongs in editable data. Define units, rates, recipe inputs, output limits, construction costs, and upgrade effects consistently. Prevent negative inventories, duplicate production, infinite refund loops, and unbounded numerical overflow. At cosmic scales, choose a deliberate large-number representation or normalize units by stage.

Account for bad decisions. Players must have a recoverable path after spending resources poorly, losing access to power, demolishing infrastructure, or exhausting an input. A basic extraction action, lossy salvage, protected shared utility, or another coherent rule can help. Recovery must obey the resource accounting and should create gameplay rather than silently inventing missing resources.

### 6. Environmental transformation

Make depletion spatial, cumulative, and emotionally legible. Earth should visibly change from a living place into an industrialized and increasingly desolate landscape as resources are consumed.

Consider several connected layers: vegetation density, soil condition, water availability, wildlife presence, industrial footprint, heat or pollution, ambient sound, and the balance between organic and mechanical motion. Choose a manageable subset and make its interactions clear.

Transform individual places. A harvested grove leaves stumps or exposed ground; intensive extraction may damage nearby vegetation; a cooling system may alter a water source; a settlement may replace fertile terrain. Tie changes to authoritative game state and explainable rules.

Give important changes sensory consequences. Fewer birds, quieter water, stronger machine hum, dust, diminished movement, or an altered colour palette can make absence perceptible. Maintain attractive composition and expressive machinery even when the world becomes bleak.

Preserve some memory of what existed: named landmarks, a lightweight before-and-after record, stage summaries, photographs, or a small archive. Make it possible to recognize that a former favourite place became infrastructure. Avoid retaining every historical entity if a compact summary achieves the same effect.

Restoration, efficiency, or conservation can exist if you give them meaningful costs and limits. They may slow degradation or preserve a place. They must remain consistent with the finite-resource progression rule; cosmetic regrowth must not accidentally create an unlimited extractable stock.

Avoid an effortless upgrade that erases every consequence while allowing unlimited growth. An alternative path of restraint is optional, and should involve a meaningful collective choice if included.

### 7. Progression through cosmic stages

Implement all five required stages in a connected playable campaign. Use a shared simulation foundation and data-driven stage definitions, while giving each stage its own atmosphere and at least one consequential new mechanic.

The progression should offer an increasing playable extent or strategic reach. Choose practical map dimensions and chunking after profiling. Do not confuse a later gameplay stage with a claim that its celestial body is physically larger; Mars can offer a larger playable map without being portrayed as larger than Earth.

Use the following as creative starting points:

| Stage | Resource and construction possibilities | Distinctive design challenge |
| --- | --- | --- |
| Earth | Forests, freshwater, fertile land, minerals, towns, cities, industry, and datacentres. | Players turn a place they enjoy inhabiting into a production landscape. |
| Mars | Buried ice, minerals, sealed settlements, habitat systems, solar infrastructure, and cooling reserves. | Expansion depends on scarce survivable conditions and connected life-support infrastructure. |
| The Sun | Fictional stellar collectors, plasma infrastructure, magnetic systems, heat handling, and extreme computation. | Manage extraction intensity, heat, or shifting collection zones while consuming a source that once powered everything else. |
| Solar System | Planetary industry, asteroid resources, orbital routes, interplanetary networks, and distributed computation. | Coordinate specialized bodies and transport bottlenecks across an entire system. |
| Universe | Stars, galaxies, immense computing structures, and a clearly fictional final resource frontier. | Earlier worlds become production units as players confront the possibility of consuming everything available. |

Mars should show the loss of ice, reserves, or habitable possibility. The Sun might dim, destabilize, or change as fictional extraction proceeds. Cosmic stages should communicate exhaustion through their own visual language. Design these deliberately.

Keep the isometric interaction vocabulary recognizable as scale changes. A tile can represent land, a platform, an orbital sector, or a cosmic region. Decide how the player avatar evolves: person, suited explorer, construction drone, or another expressive representation. Preserve a sense of presence.

Simplify or summarize earlier systems when introducing larger ones. The final stage must run as a bounded game simulation; it does not need to instantiate every planet or star implied by the fiction.

Preserve continuity as the camera moves outward. Exhausted Earth and Mars must remain exhausted within the Solar System, and that depleted system must remain part of the Universe's history. New stages expose new frontiers, not refreshed copies of resources already consumed. Carry their consequences forward through summarized state, visible remnants, or another lightweight mechanism.

Consuming the Sun must also change the following stage's energy logic. Invent a coherent fictional answer such as captured stellar energy, surviving collection infrastructure, or alternative power. Let the loss of the Sun remain perceptible. You choose the fiction; maintain its consequences.

### 8. Depletion, transitions, and the ending

Define precisely what counts as exhausting a stage. The normal transition must follow exhaustion of all natural stocks designated as extractable by that stage's rules. Purchased goods, stored inventory, unused energy capacity, and background scenery are different concepts.

For each finite stock, maintain a consistent ledger: initial amount, remaining natural stock, extracted amount, and explicitly destroyed amount. An inaccessible deposit must not simply disappear from the completion condition. Generate reachable deposits or implement a clear way to access them.

Define the accounting per resource type: initial stock = remaining natural stock + extracted stock + explicitly destroyed stock. If an action destroys a deposit, record that loss and its consequences under an explicit rule. Merely hiding, blocking, or failing to generate access to a deposit does not make it depleted. Recycling changes processed inventory; it does not refill the original natural stock.

Prevent the final-resource scavenger hunt. Reveal remaining deposits, provide useful scanning, or introduce an understandable late-stage cleanup action. Every unit must still be accounted for. Also prevent buildings from permanently trapping deposits or blocking access needed for completion.

Exhaustion should initiate a server-controlled transition with a brief shared opportunity to see the result. Do not require a final payment that becomes impossible after the last resource is consumed. Any readiness mechanism must handle absent players without indefinitely blocking the room.

Specify what carries forward: player identity, selected upgrades, cumulative consumption, discoveries, statistics, or another carefully chosen legacy. Decide what becomes historical. Progression belongs to the room's campaign, with everyone entering the same next stage.

Make transitions memorable. A camera pullback, a corporate celebration, a departing view of the ruined world, or the sudden realization of a much larger frontier could work. Select a consistent language and evolve it across the campaign.

Design a real ending for exhaustion of the Universe. A possible direction is immaculate infrastructure, extraordinary output, almost no remaining life or sound, and an expansion system searching for a destination that no longer exists. You may invent a stronger ending.

Do not silently loop into another pristine universe and erase the conclusion. Replay can be an explicit new campaign after the ending. If you add an alternative ending or deliberate refusal to expand, make its rules and costs understandable and keep the full consumption arc available.

### 9. Multiplayer as part of the premise

The baseline is cooperative construction in a shared world with shared environmental consequences. Decide which resources and buildings are communal, which have ownership, and what individual recognition means. Keep these rules consistent and visible.

Players should benefit from dividing work and coordinating layouts or projects. Useful tensions might arise when one player's efficient plan consumes another player's favourite place, when a shared datacentre competes for scarce cooling resources, or when a production milestone accelerates departure from a world the group has built together.

Support inviting friends through room links or codes, clear player identities, presence indicators, joining an existing campaign, leaving, and reconnecting. Emotes, pings, project markers, and concise activity messages can provide useful communication without requiring a full social platform.

Prefer lightweight guest sessions over mandatory account setup for the first release, while preserving secure reconnect identity and room permissions.

Choose practical safeguards against accidental sabotage and griefing: building permissions, understandable ownership, limited destructive controls, rate limits, and host moderation. If text chat is included, handle user text safely and provide basic mute or moderation controls.

Test whether shared resources create cooperation or allow one player to monopolize everything. Ensure late joiners can contribute. Define what happens to a departed player's buildings, reserved resources, and identity, and what happens when the host leaves.

Choose an explicit policy for empty rooms. Pausing simulation and resuming from saved state is a reasonable starting point. If you implement offline progress, define its limits and make sure players cannot unexpectedly miss entire worlds while absent.

### 10. Art, animation, audio, and interface

Treat visual and tactile quality as core development work from the first playable build. Establish a small visual bible: camera angle, tile proportions, character scale, lighting, palette, material treatment, outline rules, interface typography, and animation rhythm.

Choose a coherent rendering approach: illustrated isometric sprites, 2.5D scenes, or lightweight orthographic 3D. A small technical and visual prototype should resolve this choice early. Use the approach that best delivers the intended style within the available time.

Aim for rounded forms, clear silhouettes, readable tools, friendly expressions, pleasant colour, and lively motion. Build a consistent original asset family. Generated, procedural, hand-authored, or suitably licensed assets are all acceptable when available; document their provenance and keep them replaceable.

Prioritize high-value animation: locomotion, facing, gathering, carrying or interacting, placement, construction, building operation, environmental change, and stage transitions. Small anticipation, impact, bounce, and settling movements can make simple assets feel good.

Make the world dominate the screen. Keep the HUD compact. Use contextual building panels, readable resource feedback, an intelligible build menu, an inspect tool, a map or overview when helpful, and clear room and connection status.

Handle different viewport sizes, UI scaling, keyboard focus, colour-independent status cues, reduced motion, and separate audio controls. Provide readable reconnect and loading states. Manage occlusion around tall buildings and crowded industrial areas.

Use ambient audio and music to support the environmental arc, with user-controlled sound and an explicit interaction to start audio where required. If audio tooling is limited, deliver a small consistent sound set and useful hooks for expansion.

Ensure the game remains legible and emotionally expressive in both its beautiful and depleted states. Compare them visually during development.

### 11. Technical architecture

Use Next.js with TypeScript for the application shell, room screens, settings, onboarding, and interface. Run the game world in a dedicated browser graphics renderer with a frame loop independent of React updates. Choose a suitable maintained renderer or engine and justify the choice briefly after a small working prototype.

Do not implement the world as thousands of DOM elements or route every entity update through React state. Keep world rendering, network state, and interface summaries appropriately separated. Send the HUD the information it needs at a sensible frequency.

Load browser-dependent graphics code through a proper client-only boundary. In Next.js, a Client Component can still be prerendered; when disabling SSR for a browser-only game module, place the dynamic loading boundary in a Client Component. Verify current framework guidance and use compatible stable dependency versions with a committed lockfile.

Run the authoritative simulation in a separate long-running TypeScript service on Fly.io. Use WebSockets or an appropriate room-based networking framework. Choose a small, understandable stack. Next.js request handlers and Server Actions should not own the persistent simulation loop.

A useful code organization separates the web application, game server, shared protocol and simulation types, and data-driven content. Keep simulation logic testable without a browser. Avoid building a general-purpose engine or a distributed platform before the game works.

Create explicit tile/world/screen coordinate conversions, reliable isometric depth sorting, camera pan and zoom, selection and hit testing, collision rules, and viewport culling. Use chunking or appropriate spatial indexing as map sizes grow. Render only what contributes to the current view.

Choose a modest fixed server simulation rate and decouple it from browser rendering. Approximately 10-20 server ticks per second is a starting hypothesis, not a required or proven optimum. Economic systems may update less frequently. Use elapsed-time handling that avoids runaway catch-up after a stall or pause.

Interpolate remote movement between authoritative updates. Local movement prediction is optional if it improves feel and can be reconciled correctly. Building ghosts and immediate feedback may be optimistic previews; confirmed resources, construction, and progression must come from the server.

### 12. Authority, synchronization, and correctness

Give each active room exactly one authoritative simulation owner. Start with one server instance capable of hosting several isolated rooms if that is the simplest viable deployment.

Clients send intentions such as move, harvest, place, upgrade, or demolish. The server determines the result. Validate session identity, room membership, action permissions, range, collision, tile availability, affordability, cooldowns, and input bounds. Reject malformed, non-finite, or oversized values and limit command rates.

Serialize room mutations. Two players trying to place a building on the same tile, spend the same shared balance, or harvest the last resource must produce one consistent outcome. Multi-tile occupancy and payment must commit together.

Define a typed, versioned protocol. Include command identifiers, room identity, stage generation, acknowledgements or clear rejections, and authoritative update ordering. Use safe retry and duplicate handling so resending a build or harvest cannot apply it twice.

On joining, send a consistent snapshot and then incremental updates from its sequence boundary. Do not lose changes that occur while the snapshot is being prepared. Detect missing updates and resynchronize. Avoid broadcasting the complete map every frame; use changed entities, tiles, or chunks where appropriate.

Handle reconnects, browser refreshes, late joins, background tabs, slow connections, and dropped sessions deliberately. Show connection state, bound queues and buffers, and restore the player's authoritative state. Never let a returning browser overwrite the world with its old local copy.

Stage changes require special care. Stop accepting old-stage mutations, resolve the final extraction, persist the transition and next-stage identity consistently, and broadcast the new authoritative state. Increment the stage generation and reject delayed commands addressed to the previous stage. Clear obsolete client previews and pending actions.

Joining during a transition must yield one valid stage, with a consistent roster and economy. Restarting during the transition must recover the recorded result. Generating the next stage twice must not grant extra resources or duplicate carryover rewards.

Define retry behaviour across process restarts. Persist the deduplication information needed for commands that may be retried, or establish a fresh connection epoch with mandatory resynchronization and explicit handling of unconfirmed actions. Match the policy to the persistence guarantee. Do not claim exactly-once network delivery.

Checkpoint world state, authoritative sequence, and applicable command receipts consistently, so a rolled-back action is not incorrectly recorded as completed. On recovery, issue a new room incarnation identifier: clients must replace their state and reset sequence tracking, interpolation, and obsolete pending actions. Under a fresh-session policy, do not automatically replay pre-restart economic actions; resynchronize before accepting a new intention.

### 13. Persistence and Fly.io deployment

The world must survive a server process restart according to a clearly stated recovery policy. In-memory state alone is insufficient.

Choose and implement the simplest appropriate durable store, such as transactional database-backed snapshots or SQLite on a properly configured persistent volume for a single-instance alpha. Record the choice, backup strategy, schema version, and migration approach.

Persist enough information to recover room identity, players, current stage, stage seed, tile changes, buildings, inventories, progression, and transition status. Use authoritative seeds and state; client-generated maps must never become the source of truth.

Define save frequency and the maximum progress that could be rolled back after an unexpected crash. Periodic snapshots can be acceptable if this limitation is explicit and tested. Persist stage boundaries before announcing them as complete. Graceful shutdown should save and drain appropriately, but recovery must also handle an abrupt termination.

Treat Fly.io routing and storage as real engineering work. Fly Volumes are local to their placement and do not automatically replicate. A load balancer does not synchronize separate in-memory worlds. Do not add replicas that can independently mutate the same campaign.

If multiple simulation instances are needed, provide an explicit room-to-owner lookup and connection-routing mechanism, plus a way to prevent conflicting ownership. Verify a suitable Fly-supported approach such as routing the WebSocket handshake using fly-replay. Otherwise keep one authoritative instance and state its capacity and availability limits honestly.

The single-owner rule also applies during deployments. Ensure an old process and its replacement cannot simultaneously run the same campaign.

Configure machine lifecycle deliberately. Background simulation work is not sufficient evidence of activity for traffic-based autostop. Choose settings consistent with room pause behaviour and persistence. Handle deploys, shutdowns, and reconnects; do not assume machines or connections live forever.

Provide the necessary Dockerfiles, Fly configuration, environment-variable examples, health checks, development commands, and deployment instructions. Bind services correctly, use secure browser connections in deployment, keep secrets server-side, and validate allowed origins and session access. Room codes identify rooms; authorization must use a deliberate membership or session mechanism.

Prepare infrastructure early enough to discover deployment problems while there is time to fix them. Deploy and verify when the provided access, authorization, and spending limits permit it. If something is missing, complete local work and the deployment package, then identify the exact remaining requirement. Never report a deployment or test that did not happen.

### 14. Performance, testing, and playtesting

Set concrete targets, measure them, and distinguish targets from results. A useful starting goal is smooth play around 60 FPS at 1080p on a specified ordinary desktop or laptop, with a lower-quality mode when needed. Document the browser, hardware, map size, populated scene, player count, and server configuration used.

Benchmark a dense late-stage scene, not only an empty starting map. Measure frame time, server tick time, memory, update bandwidth, and command latency. Check for unbounded growth over a sustained session. Keep interest management, animation detail, update rates, and visible effects within an explicit budget.

Test under realistic delay and jitter. Prefer dependable, readable feedback over elaborate prediction that introduces economic inconsistencies. Slow or disconnected clients must not stall the room.

Prioritize meaningful automated tests for:

- Resource accounting, recipe costs, salvage, upgrades, and production limits.
- Simultaneous building placement, shared spending, and final-resource extraction.
- Duplicate commands, invalid commands, stale stage identifiers, and unauthorized actions.
- Snapshot consistency, reconnects, late joins, and process restart recovery.
- Exactly one authoritative transition per exhausted stage, including crash recovery at that boundary.
- Reachable progression through every required stage without resource or access softlocks.

Use at least two independent browser sessions for real multiplayer testing. Watch both players gather, build, see the same damage, reconnect, and advance together. Exercise the full campaign through an accelerated preset using normal game rules. A developer teleport to the ending is useful for inspection but does not establish that progression works.

Inspect actual rendered screens in lush, industrial, depleted, and cosmic scenes, including smaller viewports. Check isometric picking, occlusion, placement, animation, text overflow, interface readability, and loading states.

Playtesting must also answer: Is the first harvest satisfying? Are buildings useful? Does automation produce new decisions? Can players understand shortages? Does environmental loss register without a speech? Does cooperation change the experience? Is the last portion of a stage tedious? Does each new scale feel different? Does the ending land?

Fix observed problems and repeat the affected checks. Do not substitute extensive test counts or documentation for a convincing playable experience.

### 15. A seven-day execution plan

Use this as a sequence of milestones and an approximate allocation of effort. Adapt when evidence warrants it. Do not wait for calendar time to pass, and do not rush to claim completion simply because every heading has some code beneath it.

**Day 1 — Commit to a direction and prove the foundation.** Inspect the workspace and available tooling. Choose a concept and visual approach. Establish the project, shared types, renderer, authoritative server, and room connection. Get two browser sessions into the same small map. Implement movement, one resource interaction, and one building. Produce an early visual target and a short risk list.

**Day 2 — Make Earth enjoyable.** Build the coherent gathering, construction, city, datacentre, and production loop. Add visible environmental damage, readable feedback, basic coordination, and a workable depletion rule. Implement basic save/reload and exercise restart recovery. Test an Earth-to-Mars transition and reconnect. Begin tuning the first ten minutes. Prepare or exercise the Fly deployment path.

**Day 3 — Connect the whole cosmic journey.** Make Earth, Mars, Sun, Solar System, and Universe playable through the shared stage system, initially with restrained content and rough assets. Give each stage its distinguishing mechanic. Implement carryover, summaries, and the ending. Complete a small accelerated end-to-end campaign; use the results to expose progression problems early.

**Day 4 — Develop the game's identity.** Improve terrain, characters, building families, animation, environmental transformations, audio, interface, and transitions. Replace conspicuous temporary assets. Add a small amount of social expression and place memory. Strengthen the emotional difference between healthy and exhausted worlds.

**Day 5 — Harden shared-world behaviour.** Resolve multiplayer conflicts, ownership, late joins, disconnects, stale commands, persistence, and restart recovery. Test deployed behaviour where access permits. Balance cooperative bottlenecks and griefing safeguards. Measure actual performance before increasing map sizes or room capacity.

**Day 6 — Play, tune, and finish.** Run complete campaigns, including sustained multiplayer sessions and adverse network conditions. Address pacing, softlocks, confusing feedback, performance bottlenecks, and weak stage identities. Freeze major new systems. Close the gap between implemented features and a coherent game.

**Day 7 — Release preparation and final polish.** Fix remaining material defects, refine the opening and ending, verify production builds and deployment, and complete the operating guide. Produce screenshots or a short playthrough where tooling allows. Report what is implemented, what was tested, and what remains limited.

Build the full arc early, then deepen it. If time becomes constrained, reduce building variants, secondary systems, map dimensions, or cosmetic breadth while preserving real multiplayer, cities and datacentres, environmental transformation, the required stages, and a meaningful ending.

### 16. Working autonomously across sessions

Make ordinary reversible design and engineering decisions yourself. Ask a focused question only when missing information would materially change the work or an external action needs authorization. Continue independent work while a blocked dependency remains unresolved.

Maintain a small set of durable project records: a concise design document, architecture and protocol notes, task list, decision log, test evidence, and a handoff file. These may be separate files or a compact structure that serves the same purpose.

At every major milestone and before a session ends, record the current runnable state, exact startup and test commands, completed work, known defects, important decisions, and the next concrete task. Commit coherent changes if version control is available. After a restart or context reset, read these records and inspect the actual repository before continuing.

If subagents are available, delegate bounded tasks such as visual exploration, stage content, independent review, or testing. Give each clear ownership and coordinate shared interfaces. Integrate and verify their work; parallel activity alone is not progress.

Use short implementation-and-playtest loops. Keep the project runnable. Avoid repeated scaffolding, unnecessary framework rewrites, speculative infrastructure, and accumulating optional systems before the existing game works.

Treat one week as an iteration budget, not a promise of uninterrupted execution. Use the available runtime productively and leave precise checkpoints when execution limits are reached. Do not claim to have kept working while the environment was inactive.

### 17. Definition of done and final delivery

Success means a new player can open the game, join a friend, move through an attractive isometric world, gather finite resources, construct useful cities and datacentres, observe the environment change, cooperate through exhaustion, progress across all five stages, and reach an intentional ending.

The authoritative server must resolve conflicting actions consistently. Refreshing or reconnecting must restore the shared state. Restarting the server must recover the campaign within the documented durability guarantee. The visuals, controls, economy, and sound should feel like parts of the same game.

Deliver:

- The complete runnable source project and reproducible development and production commands.
- A concise design document explaining the experience, economy, progression, and creative decisions.
- The authoritative game server, shared protocol, persistence implementation, and editable stage and balance data.
- Original or properly sourced assets, an asset manifest, and practical instructions for replacing or extending them.
- Fly.io deployment files and a verified running deployment when authorized and available, or a precise deployment handoff when blocked.
- Evidence from meaningful tests, actual multiplayer playthroughs, visual inspection, and measured performance.
- A short player guide, server operation and recovery instructions, known limitations, and a prioritized next-development list.

Avoid declaring victory based on a landing page, a disconnected prototype, or a design document alone. Aim for a small but complete game with a strong identity, then make it as rich and polished as the week allows.

### 18. Begin now

Inspect the available workspace, tools, and constraints. Present the chosen creative direction, the smallest playable implementation of the full vision, the highest-risk technical decisions, and the first concrete milestone. Then start building in the same working session.

Keep returning to this question: what does the player gain from the next act of expansion, and what becomes impossible to recover because of it?

### Technical references to verify when implementing

- Next.js browser-only loading: https://nextjs.org/docs/app/guides/lazy-loading
- Fly.io WebSocket hosting: https://fly.io/blog/websockets-and-fly/
- Fly.io connection routing: https://fly.io/docs/blueprints/connecting-to-user-machines/
- Fly.io persistent volumes: https://fly.io/docs/volumes/overview/
- Fly.io machine lifecycle: https://fly.io/docs/blueprints/long-running-tasks/

Consult the current official documentation for the versions and services you actually use. These references support implementation choices; the game's creative direction is yours to develop.
