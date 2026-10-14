# Plenty

A cosy multiplayer game about having enough, and never stopping.

You and up to seven friends arrive on a little meadow island: a pond with a heron, a few groves, an old oak, a hill for picnics, deer and rabbits and a few wolves. You gather timber and stone into your own pack, make an axe, cook over a campfire and keep a chest of your own. Then you give to the Cooperative, build cottages, power them, and teach a datacentre to do the gathering for you. It works beautifully. When the island is used up, the Plenty Cooperative has another world ready: Mars, then the Sun itself, then the whole Solar System, then the Universe. There is no sixth.

The game is built from a pod's brief, _Consume the Universe_: let players enjoy building the machine, then notice what the machine has consumed.

## How to play

Start a world from the front page and send the invite link (or the five-letter room code) to friends. No account: your browser remembers who you are in each room.

- **Look** three ways, switched with `C` at any moment: third person (the default), first person, or isometric. In first and third person, click the world and the mouse looks around (`Esc` lets it go); in isometric, `Q`/`R` rotate and the wheel zooms. Reach is the same in every view: the server decides.
- **Walk** with WASD or the arrow keys, relative to the camera. `Shift` sprints. Buildings are solid.
- **Harvest** by holding `E` near a tree, rock or pond, or by clicking it. It goes into your own pack, which only you can see.
- **Your pack** (`Tab`): eat, give raw stock to the Cooperative store, drop things for someone, and make tools and food. Recipes say what they're missing. Stone tools by hand; iron tools, a bow and a hide coat at a workbench; cooked food at a campfire; a powered drill only beside a running datacentre. `G` changes what's in your hand.
- **Hunt** with `F` (or a click): strike, then butcher the carcass once. Wolves bite back. Animals don't come back.
- **Build** with `1`--`9`. Campfires, workbenches and chests come out of your own pack; cottages, power and datacentres out of your pack first and then the Cooperative store. A ghost shows the footprint and why it can't go there. Click to place it, or press `Enter`. `Esc` cancels.
- **Chests** are locked to you until you open one to everyone. Stand beside one to put things in or take them out.
- **Help raise** a building site by pressing `E` beside it: several people building together finish faster.
- `I` inspects a building (what it needs, what it makes, why it's idle; datacentres can be underclocked or overclocked), `X` takes one down for half its cost back, `N` names a favourite place, `V` surveys every deposit left, `M` opens the World Atlas, `T` talks to the room, `P` saves a photo, and `Shift`+`1`--`6` emotes.
- `H` opens help in the game.

Stay fed: hunger costs health, the vitals panel says what's hurting you, and dying leaves your things in a bag where you fell, yours alone for five minutes. On Mars your suit's air only refills inside a working dome.

Start with the Cooperative memo in the corner: gather, make an axe, put down a fire and a chest, give to the store, build cottages, power them, build a datacentre, put a harvester beside a grove. The store panel tells you what most of your idle machines are waiting for.

**The town and its water.** Cottages hold residents, and residents drink the world's water from the store. So do datacentres, and an overclocked one drinks three times as much. When there isn't enough for both, the host's water priority decides who goes short (homes first, shared evenly, or datacentres first). A long shortage kills a resident, named, with the cause on record and a stone beside the datacentre. The game's numbers are rules, not real-world figures.

A world moves on when every deposit on it is gone, for everyone at once. The survey arrow points at the nearest remaining deposit, so the last few never turn into a hunt.

## The five worlds

| World | What you consume | What's different |
| --- | --- | --- |
| Earth | timber, stone, fresh water | Furnaces are strong, but their smoke kills groves and browns the land. Sun Gardens are clean and slow. |
| Mars | regolith, iron, buried ice | Nothing runs outside a dome's air, and domes drink the same ice your datacentres need. |
| The Sun | plasma, magnetics, shade | Collectors pour in power and heat; past the limit, scoops throttle until radiators shed it. The star dims as you take it. |
| The Solar System | volatiles, asteroid metal, comet ice | No sunlight now. Every machine draws on the Bottled Sun you saved, and it doesn't refill. Miners only ship if relays link them to the Depot. |
| The Universe | starlight, stellar cores, dark cold | Your spent worlds run as World Engines. The host can render one down for a burst of energy, forever. And if everyone here agrees, you can stop, and leave the rest alone. |

Spent Earth and Mars float in the Solar System as grey remnants, and the Solar System sits in a corner of the Universe. Nothing you've finished comes back fresh.

## What the game is arguing

Every convenience has a dependency. A datacentre gives you compute, which runs harvesters, which empty the land faster, which needs more power, which on Earth means furnaces, whose smoke burns the groves you were going to harvest anyway. The game never stops you and never lectures you. It shows the cost in the land (grass browns, trees become stumps, the pond shrinks to mud, the birds thin out and the birdsong with them) and it keeps a short archive of every named place and what became of it. The ending reads that archive back to you.

The design document, [`docs/DESIGN.md`](docs/DESIGN.md), covers the economy, pacing, stages and ending in detail.

## How it works

One Node process on Fly.io owns every room's simulation and speaks WebSocket; browsers render the world and send intentions (move, harvest, craft, stash). Each player is sent only their own pack. The browser app is Next.js, exported to static files that the same process serves, with the world drawn by Three.js in its own frame loop. Rooms persist as snapshots in SQLite on the Fly volume. The server log names who did what, by a short public tag and name.

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): the stack, the protocol, authority, persistence, deployment and recovery
- [`docs/DECISIONS.md`](docs/DECISIONS.md): the decision log, including the creative directions weighed at the start
- [`docs/adr/0001-empty-rooms-pause.md`](docs/adr/0001-empty-rooms-pause.md): what a player finds when they come back
- [`docs/TESTING.md`](docs/TESTING.md): what was tested, how, and what was measured
- [`docs/ASSETS.md`](docs/ASSETS.md): where every picture and sound comes from, and how to replace them
- [`docs/RELEASE_SCOPE.md`](docs/RELEASE_SCOPE.md): which systems are built and verified, and which aren't

## Running it

You need the versions in `mise.toml` (Node 24, pnpm 11).

```sh
pnpm install
pnpm build          # Next.js shell -> out/
pnpm start          # game server on :8080 (PORT and DATA_DIR override)
```

Then open <http://localhost:8080>. `pnpm check` typechecks and runs the spec against the running server (set `APP_URL` if it isn't on :8080). `node scripts/playbot.ts <ROOM> [url] [name]` joins a room with a bot that plays it, which is the quickest way to see later stages or fill a room.

The rapid preset (a button on the front page) runs the same rules with the economy five times faster, a hand harvest worth ten and deposits a quarter as deep. Two bots finish a campaign in about eight minutes on it; the normal pace is two to three hours.

## Known limits

Desktop browsers with a keyboard and mouse first; it renders on a phone but isn't playable there. One server process and one Fly machine host every room, so a deploy or crash pauses all rooms for a few seconds and can roll back up to five seconds of play. The world is a grid with visual height, not editable voxels: no digging, no block-by-block building, no vehicles. What's built and what isn't is in [`docs/RELEASE_SCOPE.md`](docs/RELEASE_SCOPE.md).
