// All balance and stage content lives here as data. Units are whole numbers
// throughout (no floats in the economy), so inventories can't drift, go
// negative or overflow: every natural stock is finite and every inventory is
// bounded by the stock it came from, except the Bottled Sun reserve, which is
// bounded by the Sun's own stock (see SUN_TO_RESERVE).

export const FAMILIES = ["matter", "mineral", "coolant"] as const;
export type Family = (typeof FAMILIES)[number];
export type Bundle = Record<Family, number>;

export const BUILDING_TYPES = [
  "extractor",
  "furnace",
  "solar",
  "city",
  "datacentre",
  "habitat",
  "radiator",
  "relay",
  "plaza",
  "depot",
  "engine",
  "workbench",
  "campfire",
  "chest",
] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

export interface BuildingDef {
  size: 1 | 2;
  cost: Partial<Bundle>;
  /** construction time in economy ticks */
  build: number;
  energy: number; // + produces, - consumes (per economy tick)
  workers: number; // + houses, - employs
  compute: number; // + produces, - consumes
  coolantUse?: number; // coolant drawn from inventory per economy tick
  fuelUse?: number; // matter drawn per economy tick
  /** extraction per economy tick from adjacent deposits */
  extract?: number;
  /** tiles of life lost per economy tick, Chebyshev radius */
  pollution?: { radius: number; amount: number; burnsMatter?: number };
  heat?: number;
  cooling?: number;
  pressureRadius?: number;
  relayRange?: number;
  /** protected shared utility: nobody can demolish it */
  protected?: boolean;
  /** energy released into the reserve when this is rendered down */
  renderValue?: number;
  tall?: boolean;
  /** a personal piece: always paid from the builder's own pack, never the Cooperative store */
  personal?: boolean;
  blurb: string;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  extractor: {
    size: 1,
    cost: { mineral: 6, matter: 4 },
    build: 3,
    energy: -1,
    workers: 0,
    compute: -1,
    extract: 1,
    pollution: { radius: 1, amount: 4 },
    heat: 2,
    blurb: "Harvests every neighbouring deposit by itself. Needs power and compute.",
  },
  furnace: {
    size: 1,
    cost: { mineral: 8 },
    build: 3,
    energy: 5,
    workers: -1,
    compute: 0,
    fuelUse: 1,
    pollution: { radius: 2, amount: 3, burnsMatter: 1 },
    tall: true,
    blurb: "Burns matter for lots of power. Its smoke browns the land and kills nearby groves.",
  },
  solar: {
    size: 2,
    cost: { mineral: 10, coolant: 2 },
    build: 4,
    energy: 2,
    workers: 0,
    compute: 0,
    blurb: "Clean, slow power that takes a lot of ground.",
  },
  city: {
    size: 2,
    cost: { matter: 12, mineral: 6 },
    build: 5,
    energy: -1,
    workers: 2,
    compute: -1,
    tall: true,
    blurb: "Homes for workers. Served with compute, a city houses far more of them.",
  },
  datacentre: {
    size: 2,
    cost: { mineral: 10, matter: 6 },
    build: 6,
    energy: -2,
    workers: -2,
    compute: 4,
    coolantUse: 1,
    heat: 3,
    tall: true,
    blurb: "Turns power, workers and coolant into compute: automation, services, growth.",
  },
  habitat: {
    size: 2,
    cost: { mineral: 12, coolant: 4 },
    build: 5,
    energy: -1,
    workers: 0,
    compute: 0,
    coolantUse: 1,
    pressureRadius: 4,
    tall: true,
    blurb: "A sealed dome. Machines only run inside the air it holds.",
  },
  radiator: {
    size: 1,
    cost: { mineral: 8 },
    build: 3,
    energy: -1,
    workers: 0,
    compute: 0,
    cooling: 5,
    blurb: "Sheds heat so collectors don't throttle.",
  },
  relay: {
    size: 1,
    cost: { mineral: 4, matter: 2 },
    build: 2,
    energy: -1,
    workers: 0,
    compute: 0,
    relayRange: 5,
    blurb: "Links machines to the Depot. Extractors off the network ship nothing.",
  },
  plaza: {
    size: 1,
    cost: { matter: 2 },
    build: 1,
    energy: 0,
    workers: 0,
    compute: 0,
    blurb: "A bench and some bunting. A city beside a plaza houses one more worker.",
  },
  depot: {
    size: 2,
    cost: {},
    build: 0,
    energy: 0,
    workers: 0,
    compute: 0,
    relayRange: 6,
    protected: true,
    tall: true,
    blurb: "The Cooperative's shared depot. Everything the relays carry ends up here.",
  },
  engine: {
    size: 2,
    cost: {},
    build: 0,
    energy: 0,
    workers: 0,
    compute: 4,
    renderValue: 160,
    tall: true,
    blurb: "A whole spent world, running as compute. Render it down for a burst of energy.",
  },
  workbench: {
    size: 1,
    cost: { matter: 6, mineral: 2 },
    build: 1,
    energy: 0,
    workers: 0,
    compute: 0,
    personal: true,
    blurb: "A sturdy bench. Stand near one to make metal tools, coats and traps.",
  },
  campfire: {
    size: 1,
    cost: { matter: 3, mineral: 2 },
    build: 1,
    energy: 0,
    workers: 0,
    compute: 0,
    personal: true,
    blurb: "Warmth and a place to cook. Stand near one to cook meat.",
  },
  chest: {
    size: 1,
    cost: { matter: 4 },
    build: 1,
    energy: 0,
    workers: 0,
    compute: 0,
    personal: true,
    blurb: "Your own storage. Locked to you unless you share it.",
  },
};

export type StageId = "earth" | "mars" | "sun" | "system" | "universe";
export type Mechanic = "pollution" | "pressure" | "heat" | "relay" | "legacy";
export type Avatar = "person" | "suit" | "drone" | "probe" | "wisp";

export interface FamilySpec {
  label: string;
  /** number of deposit tiles generated */
  tiles: number;
  perTile: number;
}

export interface StageDef {
  id: StageId;
  name: string;
  tagline: string;
  size: number;
  mechanic: Mechanic;
  avatar: Avatar;
  energySource: "local" | "bottled";
  families: Record<Family, FamilySpec>;
  buildings: BuildingType[];
  names: Partial<Record<BuildingType, string>>;
  starter: Bundle;
  landmarks: string[];
  /** solar output multiplier for this stage */
  solarScale: number;
  palette: {
    sky: [string, string];
    lush: [number, number, number];
    dead: [number, number, number];
    matter: string;
    mineral: string;
    coolant: string;
  };
  arrival: string;
  departure: string;
}

export const STAGES: StageDef[] = [
  {
    id: "earth",
    name: "Earth",
    tagline: "A meadow island with a pond, a few groves and an old oak.",
    size: 24,
    mechanic: "pollution",
    avatar: "person",
    energySource: "local",
    families: {
      matter: { label: "timber", tiles: 34, perTile: 18 },
      mineral: { label: "stone", tiles: 16, perTile: 20 },
      coolant: { label: "fresh water", tiles: 14, perTile: 14 },
    },
    buildings: ["city", "plaza", "furnace", "solar", "datacentre", "extractor", "campfire", "workbench", "chest"],
    names: {
      city: "Cottages",
      furnace: "Furnace",
      solar: "Sun Garden",
      datacentre: "Datacentre",
      extractor: "Harvester",
      plaza: "Plaza",
      campfire: "Campfire",
      workbench: "Workbench",
      chest: "Chest",
    },
    starter: { matter: 0, mineral: 0, coolant: 0 },
    landmarks: ["The Old Oak", "Heron Pond", "Picnic Hill", "Granite Seat"],
    solarScale: 1,
    palette: {
      sky: ["#bfe7ff", "#fdf3d8"],
      lush: [126, 196, 104],
      dead: [150, 128, 104],
      matter: "#3f8f4f",
      mineral: "#a6a39b",
      coolant: "#5bb6e8",
    },
    arrival: "The Plenty Cooperative welcomes you to Earth. Everything here is yours to use.",
    departure: "Earth is spent. The Cooperative thanks you for your growth.",
  },
  {
    id: "mars",
    name: "Mars",
    tagline: "Rust dunes over buried ice. Nothing runs outside a dome.",
    size: 26,
    mechanic: "pressure",
    avatar: "suit",
    energySource: "local",
    families: {
      matter: { label: "regolith", tiles: 30, perTile: 18 },
      mineral: { label: "iron", tiles: 18, perTile: 20 },
      coolant: { label: "buried ice", tiles: 18, perTile: 16 },
    },
    buildings: ["habitat", "solar", "city", "datacentre", "extractor", "plaza", "campfire", "workbench", "chest"],
    names: {
      habitat: "Dome",
      solar: "Solar Field",
      city: "Hab Block",
      datacentre: "Cold Datacentre",
      extractor: "Rover Drill",
      plaza: "Garden Pod",
      campfire: "Galley",
      workbench: "Workshop",
      chest: "Locker",
    },
    starter: { matter: 20, mineral: 40, coolant: 12 },
    landmarks: ["First Footprint", "Ice Cathedral", "Olympus Lookout"],
    solarScale: 2,
    palette: {
      sky: ["#f2b08a", "#5a2a2a"],
      lush: [214, 120, 74],
      dead: [110, 84, 76],
      matter: "#c4683e",
      mineral: "#7d5a50",
      coolant: "#dff6ff",
    },
    arrival: "Mars. The ice under the dust is everything: air, water, coolant.",
    departure: "The ice is gone. Mars can no longer hold anyone, including you.",
  },
  {
    id: "sun",
    name: "The Sun",
    tagline: "Collector platforms in the corona. The star itself is the deposit.",
    size: 28,
    mechanic: "heat",
    avatar: "drone",
    energySource: "local",
    families: {
      matter: { label: "plasma", tiles: 44, perTile: 16 },
      mineral: { label: "magnetics", tiles: 16, perTile: 18 },
      coolant: { label: "shade", tiles: 14, perTile: 14 },
    },
    buildings: ["solar", "radiator", "datacentre", "city", "extractor", "plaza", "campfire", "workbench", "chest"],
    names: {
      solar: "Collector Wing",
      radiator: "Radiator",
      datacentre: "Furnace Mind",
      city: "Crew Ring",
      extractor: "Plasma Scoop",
      plaza: "Viewing Deck",
      campfire: "Galley",
      workbench: "Workshop",
      chest: "Locker",
    },
    starter: { matter: 20, mineral: 50, coolant: 10 },
    landmarks: ["Morning", "The Last Noon"],
    solarScale: 4,
    palette: {
      sky: ["#ffcf6b", "#7a2410"],
      lush: [255, 196, 92],
      dead: [92, 60, 52],
      matter: "#ffe27a",
      mineral: "#7b6cff",
      coolant: "#2b3a66",
    },
    arrival: "The Sun. It has powered everything you have ever done. It is now a deposit.",
    departure: "The Sun goes out. What's left of it is bottled, and the bottle is all there is.",
  },
  {
    id: "system",
    name: "The Solar System",
    tagline: "Asteroids, comets and two spent worlds, under a dead star.",
    size: 30,
    mechanic: "relay",
    avatar: "probe",
    energySource: "bottled",
    families: {
      matter: { label: "volatiles", tiles: 34, perTile: 16 },
      mineral: { label: "asteroid metal", tiles: 22, perTile: 18 },
      coolant: { label: "comet ice", tiles: 16, perTile: 14 },
    },
    buildings: ["relay", "datacentre", "city", "extractor", "plaza", "campfire", "workbench", "chest"],
    names: {
      relay: "Relay",
      datacentre: "Orbital Datacentre",
      city: "Station",
      extractor: "Asteroid Miner",
      plaza: "Observation Ring",
      depot: "Cooperative Depot",
      campfire: "Galley",
      workbench: "Workshop",
      chest: "Locker",
    },
    starter: { matter: 20, mineral: 40, coolant: 10 },
    landmarks: ["Ceres Pier", "The Long Comet"],
    solarScale: 0,
    palette: {
      sky: ["#141a33", "#05060c"],
      lush: [138, 132, 160],
      dead: [64, 62, 74],
      matter: "#9fe3d0",
      mineral: "#c9a76a",
      coolant: "#cfe8ff",
    },
    arrival: "No sunlight now. Every machine draws on the Bottled Sun, and it does not refill.",
    departure: "The Solar System is spent. The Cooperative looks further out.",
  },
  {
    id: "universe",
    name: "The Universe",
    tagline: "Galaxies as deposits. Your old worlds hum along as compute.",
    size: 32,
    mechanic: "legacy",
    avatar: "wisp",
    energySource: "bottled",
    families: {
      matter: { label: "starlight", tiles: 40, perTile: 16 },
      mineral: { label: "stellar cores", tiles: 20, perTile: 18 },
      coolant: { label: "dark cold", tiles: 16, perTile: 14 },
    },
    buildings: ["datacentre", "city", "extractor", "plaza", "campfire", "workbench", "chest"],
    names: {
      datacentre: "Matrioshka Shell",
      city: "Mind City",
      extractor: "Galaxy Siphon",
      plaza: "Memorial",
      engine: "World Engine",
      campfire: "Galley",
      workbench: "Workshop",
      chest: "Locker",
    },
    starter: { matter: 30, mineral: 50, coolant: 10 },
    landmarks: ["Andromeda", "The Quiet Arm"],
    solarScale: 0,
    palette: {
      sky: ["#0b0820", "#000000"],
      lush: [120, 110, 200],
      dead: [30, 30, 38],
      matter: "#fff1b8",
      mineral: "#ff9dd2",
      coolant: "#6fd0ff",
    },
    arrival: "The Universe. Every star is a deposit. The worlds you finished are machinery now.",
    departure: "Nothing left.",
  },
];

/** energy units banked per unit of plasma extracted from the Sun */
export const SUN_TO_RESERVE = 4;

export const TICK_MS = 100;
export const MAX_PLAYERS = 8;
/** identities a room remembers; past this the longest-gone is forgotten */
export const MAX_IDENTITIES = 32;
export const PACES = {
  // normal: one economy tick a second; harvest yields 1; every deposit four
  // times as deep as its stage data, fixed when the world is made
  normal: { econEvery: 10, harvestYield: 1, transitionTicks: 90, stockScale: 4 },
  // the accelerated development preset: same rules, the economy five times
  // faster and a hand harvest worth ten
  rapid: { econEvery: 2, harvestYield: 10, transitionTicks: 50, stockScale: 1 },
} as const;
export type Pace = keyof typeof PACES;

export const PLAYER_SPEED = 3; // tiles per second
export const HARVEST_RANGE = 2.2; // tiles
export const BUILD_RANGE = 8; // tiles
export const HARVEST_COOLDOWN_TICKS = 8;
export const MARKS_PER_PLAYER = 3;
export const SALVAGE_RATE = 0.5;
/** heat at which collectors throttle to half output (the Sun) */
export const HEAT_LIMIT = 70;

// --- personal play: items, tools, recipes, wildlife, survival -------------

/** stackable things a pack or chest holds; the three families are the stage's natural stock */
export const ITEMS = ["matter", "mineral", "coolant", "meat", "meal", "ration", "hide", "arrow"] as const;
export type ItemId = (typeof ITEMS)[number];
export const ITEM_NAMES: Record<Exclude<ItemId, Family>, string> = {
  meat: "raw meat",
  meal: "cooked meal",
  ration: "ration",
  hide: "hide",
  arrow: "arrows",
};
export const STACK = 50;
export const PACK_SLOTS = 27;
export const HOTBAR = 9;
export const CHEST_SLOTS = 27;

export type ToolKind = "axe" | "pick" | "bucket" | "spear" | "bow" | "ironaxe" | "ironpick" | "drill" | "coat";
export interface ToolDef {
  name: string;
  tier: 1 | 2 | 3;
  /** harvest multiplier per family while held */
  yields?: Partial<Record<Family, number>>;
  /** hunting: damage per hit, reach in tiles, arrows used per shot */
  dmg?: number;
  range?: number;
  ammo?: ItemId;
  /** worn rather than held: halves damage taken */
  armour?: boolean;
  dur: number;
}
export const TOOLS: Record<ToolKind, ToolDef> = {
  axe: { name: "stone axe", tier: 1, yields: { matter: 2 }, dmg: 15, range: 1.6, dur: 60 },
  pick: { name: "stone pick", tier: 1, yields: { mineral: 2 }, dur: 60 },
  bucket: { name: "bucket", tier: 1, yields: { coolant: 2 }, dur: 80 },
  spear: { name: "spear", tier: 1, dmg: 35, range: 2.2, dur: 40 },
  bow: { name: "bow", tier: 2, dmg: 30, range: 7, ammo: "arrow", dur: 80 },
  ironaxe: { name: "iron axe", tier: 2, yields: { matter: 3 }, dmg: 25, range: 1.6, dur: 160 },
  ironpick: { name: "iron pick", tier: 2, yields: { mineral: 3, coolant: 2 }, dur: 160 },
  drill: { name: "powered drill", tier: 3, yields: { matter: 4, mineral: 5, coolant: 4 }, dur: 120 },
  coat: { name: "hide coat", tier: 1, armour: true, dur: 100 },
};

export type Station = "campfire" | "workbench" | "datacentre";
export interface Recipe {
  id: string;
  name: string;
  in: Partial<Record<ItemId, number>>;
  out: { tool: ToolKind } | { item: ItemId; n: number };
  /** a complete station of this type within reach (a datacentre must also be running) */
  station?: Station;
  blurb: string;
}
export const STATION_RANGE = 3;
export const RECIPES: Recipe[] = [
  { id: "axe", name: "Stone axe", in: { matter: 3, mineral: 2 }, out: { tool: "axe" }, blurb: "Twice the timber per swing. A weak weapon." },
  { id: "pick", name: "Stone pick", in: { matter: 2, mineral: 3 }, out: { tool: "pick" }, blurb: "Twice the stone per swing." },
  { id: "bucket", name: "Bucket", in: { matter: 3 }, out: { tool: "bucket" }, blurb: "Twice the water per scoop." },
  { id: "spear", name: "Spear", in: { matter: 2, mineral: 1 }, out: { tool: "spear" }, blurb: "For hunting, close up." },
  { id: "ration", name: "Ration", in: { matter: 2, coolant: 1 }, out: { item: "ration", n: 1 }, station: "campfire", blurb: "Plain food from whatever the world has. Fills a third of your hunger." },
  { id: "meal", name: "Cooked meal", in: { meat: 1 }, out: { item: "meal", n: 2 }, station: "campfire", blurb: "Meat cooked over a fire. Each fills half your hunger." },
  { id: "arrows", name: "Arrows", in: { matter: 1, mineral: 1 }, out: { item: "arrow", n: 4 }, station: "workbench", blurb: "Four arrows for a bow." },
  { id: "bow", name: "Bow", in: { matter: 4, hide: 1 }, out: { tool: "bow" }, station: "workbench", blurb: "Hunt from a distance. Uses arrows." },
  { id: "coat", name: "Hide coat", in: { hide: 3 }, out: { tool: "coat" }, station: "workbench", blurb: "Worn, not held: halves the harm from bites and exposure." },
  { id: "ironaxe", name: "Iron axe", in: { mineral: 6, matter: 2 }, out: { tool: "ironaxe" }, station: "workbench", blurb: "Three times the timber, and lasts." },
  { id: "ironpick", name: "Iron pick", in: { mineral: 7, matter: 2 }, out: { tool: "ironpick" }, station: "workbench", blurb: "Three times the stone; breaks ice twice as fast too." },
  { id: "drill", name: "Powered drill", in: { mineral: 10, coolant: 3, matter: 2 }, out: { tool: "drill" }, station: "datacentre", blurb: "Assembled beside a running datacentre. Strips anything four or five times as fast." },
];

export type AnimalKind = "deer" | "rabbit" | "boar" | "wolf" | "heron" | "fish";
export interface AnimalDef {
  name: string;
  hp: number;
  speed: number; // tiles per second
  /** where it lives: grove (matter), meadow (open ground), water */
  habitat: "grove" | "meadow" | "water";
  yields: Partial<Record<ItemId, number>>;
  /** predators bite players in reach */
  bite?: number;
  flees?: boolean;
}
export const ANIMALS: Record<AnimalKind, AnimalDef> = {
  deer: { name: "deer", hp: 60, speed: 2.4, habitat: "grove", yields: { meat: 3, hide: 2 }, flees: true },
  rabbit: { name: "rabbit", hp: 15, speed: 2.8, habitat: "meadow", yields: { meat: 1, hide: 1 }, flees: true },
  boar: { name: "boar", hp: 80, speed: 1.8, habitat: "grove", yields: { meat: 4, hide: 1 }, bite: 6 },
  wolf: { name: "wolf", hp: 70, speed: 2.6, habitat: "grove", yields: { hide: 2, meat: 1 }, bite: 8 },
  heron: { name: "heron", hp: 20, speed: 1.2, habitat: "water", yields: { meat: 1 }, flees: true },
  fish: { name: "fish", hp: 10, speed: 1, habitat: "water", yields: { meat: 1 }, flees: true },
};
/** Earth's founding populations; nothing else lives anywhere else, and nothing respawns */
export const EARTH_FAUNA: Record<AnimalKind, number> = { deer: 6, rabbit: 8, boar: 3, wolf: 3, heron: 2, fish: 6 };

export const MAX_HP = 100;
export const MAX_FOOD = 100;
/** ticks between one point of hunger while connected (normal pace) */
export const HUNGER_TICKS = 60;
export const SPRINT = 1.6;
/** ticks a death bag stays owner-only before anyone may open it */
export const BAG_PRIVATE_TICKS = 3000;
export const HUNT_COOLDOWN_TICKS = 6;

// --- the town: residents, water and the datacentres' thirst ---------------

export const PRIORITIES = ["essentials", "balanced", "industry"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const DC_MODES = ["under", "normal", "over"] as const;
export type DcMode = (typeof DC_MODES)[number];
/** game rules, not real-world figures: what each datacentre mode draws and makes per economy tick */
export const DC_MODE: Record<DcMode, { compute: number; energy: number; coolant: number; heat: number }> = {
  under: { compute: 2, energy: 1, coolant: 0.5, heat: 1 },
  normal: { compute: 4, energy: 2, coolant: 1, heat: 3 },
  over: { compute: 7, energy: 4, coolant: 3, heat: 6 },
};
export const RESIDENTS_PER_HOME = 5;
/** drinking rounds (every fifth economy tick) homes can go short before a resident dies of it */
export const THIRST_LIMIT = 40;
/** economy ticks of good service before a home takes in a new resident */
export const GROWTH_TICKS = 90;

export const EMOTES = ["wave", "heart", "laugh", "wow", "sad", "point"] as const;
export type Emote = (typeof EMOTES)[number];

export function buildingName(stage: StageDef, type: BuildingType): string {
  return stage.names[type] ?? type[0].toUpperCase() + type.slice(1);
}
