/* ============================================================
   Plot Day — daily garden puzzle prototype
   Core loop: read the sun, spend your seeds & water, score.
   ============================================================ */

"use strict";

/* ---------- constants ---------- */

const VERSION = "0.8.3"; // bump on each deploy so phones can verify updates

// Prototype switch: while true, the daily never locks (test freely).
// Flip to false for release: one scored attempt per day, streaks count.
// OFF as of June 2026: the user wants the truest daily experience.
const DEV_MODE = false;

// Watercolor sprites on the play board: tried June 2026, reverted — the
// painterly vignettes clash with flat tiles (mixed-media). The watercolor
// set lives in the garden PORTRAIT instead. Flip to true to experiment.
const BOARD_ART = false;

// Gouache SVG crop sprites: tried June 2026, reverted — leafy crops read
// as samey green blobs; emoji are more charming and instantly readable.
const SPRITE_CROPS = false;
// Per-crop sprite overrides — kept empty: user prefers one consistent
// style across all crops over fixing individual emoji. The consistent
// fix shipped instead: the whole crop set renders as bundled Twemoji
// SVGs (assets/emoji/), identical on every device — including our own
// face-ectomied plain pumpkin (no plain pumpkin exists in Unicode).
const SPRITE_OVERRIDES = new Set([]);
const EMOJI_ART = {
  tomato: "1f345", pumpkin: "pumpkin", pepper: "1f336", basil: "1f33f",
  lettuce: "1f96c", kale: "kale", wintergreen: "wintergreen",
  mushroom: "1f344", corn: "1f33d", sunflower: "1f33b",
  strawberry: "1f353", carrot: "1f955", potato: "1f954",
  garlic: "1f9c4", brusselish: "1f966", onion: "1f9c5",
};

const W = 7, H = 5;
// Plot #1 = May 31, 2026 in LOCAL time. Both the board seed and the plot
// number roll over together at the player's local midnight (Wordle-style).
// (Epoch chosen so historical locked entries keep their numbers.)
const EPOCH_Y = 2026, EPOCH_M = 4, EPOCH_D = 31;

const PHASES = ["am", "noon", "pm"];

// Obstacle types: h = height in tiles of shadow at am/pm.
// noon shadow length = max(h - 2, 0), pointing north (up).
const OBSTACLES = {
  house:  { emoji: "🏠", h: 3 },
  garage: { emoji: "🚗", h: 2 }, // attached garage: lower roof, shorter shadow
  tree:   { emoji: "🌳", h: 2 },
  fence:  { emoji: "🧱", h: 1 },
};
// watercolor sprite art (assets/), multiply-blended onto the board so the
// white paper vanishes — crops without art yet fall back to emoji
const CROP_ART = {
  tomato: "Thriving Tomato.png",
  pumpkin: "Thriving Pumpkin.png",
  pepper: "Thriving Pepper.png",
  basil: "Thriving Basil.png",
  lettuce: "Thriving Lettuce.png",
  mushroom: "Thriving Mushrooms.png",
  corn: "Thriving Corn.png",
  sunflower: "Thriving Sunflower.jpg",
  kale: "Thriving Lettuce.png",        // leafy stand-ins until their own art
  wintergreen: "Thriving Lettuce.png",
};

// Twemoji image tag for UI chrome — consistent on every device
const em = (code, cls = "") =>
  `<img class="em${cls ? " " + cls : ""}" src="assets/emoji/${code}.svg" alt="">`;

// share-grid emoji per season (winter is an outdoor snowy garden now)
function shareArt(kind) {
  if (state.season === "winter" && kind === "tree") return "🌲";
  return OBSTACLES[kind].emoji;
}

// Plants: sun = exact sun-hours (0-3) needed to thrive,
// water = cost to fully water, pts = thriving score. tall = casts shade.
// friends = companion crops: +2 pts per adjacent living friend (mutual).
// lovesTrees: +2 pts per adjacent tree (mushrooms grow at trunks).
// Companion pairs follow real horticulture (extension-service guidance):
// Three Sisters (corn+squash, Cornell-documented yield gains), basil's
// volatiles disrupting tomato/pepper pests, allium scent shielding
// brassicas, lettuce intercropped with strawberries/carrots, and
// mushrooms' mycorrhizal partnership with trees. `why` shows in tooltips.
const COMPANION_BONUS = 2;
const CATALOG = {
  spring: [
    { id: "strawberry", name: "Strawberry", emoji: "🍓", sun: 3, water: 2, pts: 10, friends: ["lettuce"],
      why: "Strawberries interplant happily with leafy greens — shallow, friendly neighbors." },
    { id: "carrot",     name: "Carrot",     emoji: "🥕", sun: 2, water: 2, pts: 8, friends: ["lettuce"],
      why: "Quick lettuce between slow carrots: classic intercropping, no competition." },
    { id: "potato",     name: "Potato",     emoji: "🥔", sun: 2, water: 1, pts: 6, friends: [], enemies: ["sunflower"],
      why: "Potatoes keep to themselves — and sunflower roots actively stunt them (allelopathy)." },
    { id: "lettuce",    name: "Lettuce",    emoji: "🥬", sun: 1, water: 1, pts: 5, friends: ["strawberry", "carrot"],
      why: "Lettuce tucks in beside strawberries and carrots without crowding either." },
    { id: "mushroom",   name: "Mushroom",   emoji: "🍄", sun: 0, water: 1, pts: 7, friends: [], lovesTrees: true,
      why: "Real fungi partner with tree roots (mycorrhiza) — plant beside a tree for a bonus." },
    { id: "sunflower",  name: "Sunflower",  emoji: "🌻", sun: 3, water: 1, pts: 4, friends: [], enemies: ["potato"], tall: true,
      why: "Grows tall when watered and casts shade — but its allelopathic roots stunt potatoes." },
  ],
  summer: [
    { id: "pumpkin",    name: "Pumpkin",    emoji: "🎃", sun: 3, water: 3, pts: 14, friends: ["corn"],
      why: "Two of the Three Sisters: squash leaves shade the soil at corn's feet." },
    { id: "tomato",     name: "Tomato",     emoji: "🍅", sun: 3, water: 2, pts: 10, friends: ["basil"], enemies: ["pepper", "corn"],
      why: "The classic pair — basil's scent confuses hornworms and whiteflies. Keep away from peppers (family blight) and corn (they share the same worm)." },
    { id: "pepper",     name: "Chili Pepper", emoji: "🌶️", sun: 2, water: 2, pts: 8, friends: ["basil"], enemies: ["tomato"],
      why: "Basil helps shield peppers from aphids and spider mites. Tomatoes are kin — clustered nightshades share disease." },
    { id: "basil",      name: "Basil",      emoji: "🌿", sun: 2, water: 1, pts: 5, friends: ["tomato", "pepper"],
      why: "Basil's volatile oils disrupt the pests that hunt nightshades." },
    { id: "lettuce",    name: "Lettuce",    emoji: "🥬", sun: 1, water: 1, pts: 5, friends: [],
      why: "A shade-seeker. In summer heat, lettuce wants the cool spots." },
    { id: "mushroom",   name: "Mushroom",   emoji: "🍄", sun: 0, water: 1, pts: 7, friends: [], lovesTrees: true,
      why: "Real fungi partner with tree roots (mycorrhiza) — plant beside a tree for a bonus." },
    { id: "corn",       name: "Corn",       emoji: "🌽", sun: 3, water: 2, pts: 8, friends: ["pumpkin"], enemies: ["tomato"], tall: true,
      why: "Two of the Three Sisters — Cornell trials show the trio outyields monoculture. Keep corn away from tomatoes: corn earworm IS the tomato fruitworm." },
  ],
  fall: [
    { id: "pumpkin",    name: "Pumpkin",    emoji: "🎃", sun: 3, water: 3, pts: 14, friends: [],
      why: "A sprawling loner this season — give it room and full sun." },
    { id: "carrot",     name: "Carrot",     emoji: "🥕", sun: 2, water: 2, pts: 8, friends: ["garlic"],
      why: "Fall carrots sweeten after frost — and garlic's scent hides them from carrot fly." },
    { id: "garlic",     name: "Garlic",     emoji: "🧄", sun: 2, water: 1, pts: 6, friends: ["kale", "carrot"],
      why: "Fall-planted garlic is a scent-screen: it guards brassicas and carrots alike." },
    { id: "kale",       name: "Kale",       emoji: "🥬", sun: 1, water: 1, pts: 5, friends: ["garlic"],
      why: "Brassicas do better behind an allium scent-screen — classic pest defense." },
    { id: "mushroom",   name: "Mushroom",   emoji: "🍄", sun: 0, water: 1, pts: 7, friends: [], lovesTrees: true,
      why: "Real fungi partner with tree roots (mycorrhiza) — plant beside a tree for a bonus." },
    { id: "sunflower",  name: "Sunflower",  emoji: "🌻", sun: 3, water: 1, pts: 4, friends: [], tall: true,
      why: "Grows tall when watered and casts shade — a tool more than a crop." },
  ],
  winter: [ // hardy crops brave the snow; tender ones live or die by the glass
    { id: "tomato",     name: "Tomato",     emoji: "🍅", sun: 3, water: 2, pts: 12, friends: ["lettuce"], enemies: ["pepper"], tender: true,
      why: "Winter's prize — and it dies outside, full stop. Under glass, growers tuck quick lettuce between the slow tomato beds. Keep peppers apart: clustered nightshades share disease." },
    { id: "brusselish", name: "Winter Broccoli", emoji: "🥦", sun: 2, water: 2, pts: 10, friends: ["onion", "garlic"],
      why: "Overwintering brassicas are winter's workhorses — alliums keep their pests away." },
    { id: "pepper",     name: "Chili Pepper", emoji: "🌶️", sun: 2, water: 2, pts: 8, friends: [], enemies: ["tomato"], tender: true,
      why: "Peppers sulk below 50°F and freeze outside — greenhouse only. Tomatoes are kin: clustered nightshades share disease." },
    { id: "garlic",     name: "Garlic",     emoji: "🧄", sun: 2, water: 1, pts: 6, friends: ["brusselish"],
      why: "Garlic is planted into winter by tradition — and its scent shields brassicas." },
    { id: "onion",      name: "Onion",      emoji: "🧅", sun: 2, water: 1, pts: 6, friends: ["brusselish"],
      why: "Overwintering onions sit happily under the snow line." },
    { id: "wintergreen", name: "Winter Greens", emoji: "🥬", sun: 1, water: 1, pts: 5, friends: [],
      why: "Hardy greens that sweeten in the cold and shrug off frost." },
    { id: "lettuce",    name: "Lettuce",    emoji: "🥬", sun: 1, water: 1, pts: 5, friends: ["tomato"], tender: true,
      why: "The tender twin of winter greens: same easy keeper, but frost kills it outright. Under glass it tucks happily between the tomatoes." },
    { id: "mushroom",   name: "Mushroom",   emoji: "🍄", sun: 0, water: 1, pts: 7, friends: [], lovesTrees: true,
      why: "Winter oyster mushrooms partner with the evergreens (mycorrhiza)." },
  ],
};

// Daily sun arc: how high the sun rides. Lower arc = longer shadows,
// and short things (trees, fences, tall crops) start casting midday shade.
const SUN_ARCS = {
  // "short MIDDAY shadows": am/pm reach is identical to mid arc; high
  // sun only shrinks noon (user caught the old label overpromising)
  high: { label: "high sun · short midday shadows", ampm: h => h, noon: h => Math.max(h - 2, 0) },
  mid:  { label: "medium sun",               ampm: h => h,     noon: h => Math.max(h - 1, 0) },
  low:  { label: "low sun · long shadows",   ampm: h => h + 1, noon: h => h },
};
const ARC_WEIGHTS = { // per season: [high, mid, low]
  spring: [0.3, 0.5, 0.2],
  summer: [0.6, 0.3, 0.1],
  fall:   [0.3, 0.5, 0.2],
  winter: [0.1, 0.4, 0.5],
};

const SEASON_META = { // label keeps native emoji for share text; icon is the UI image
  spring: { label: "Spring 🌸", name: "Spring", icon: "1f338", cls: "spring" },
  summer: { label: "Summer ☀️", name: "Summer", icon: "2600", cls: "summer" },
  fall:   { label: "Fall 🍂",   name: "Fall",   icon: "1f342", cls: "fall" },
  winter: { label: "Winter ❄️", name: "Winter", icon: "2744", cls: "winter" },
};

/* ---------- seeded RNG (mulberry32) ---------- */

function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- state ---------- */

const state = {
  rng: null,
  seedLabel: "",
  dayNum: 0,
  season: "summer",
  grid: [],          // [y][x] -> { obstacle: key|null, plant: {def, watered}|null }
  sun: [],           // [y][x] -> 0-3 (recomputed when tall crops change)
  shadePhases: [],   // [y][x] -> Set of phases currently shaded
  packet: [],        // [{ def, qty }]
  waterMax: 10,
  waterLeft: 10,
  selected: null,    // {type:'seed', idx} | {type:'water'} | {type:'shovel'}
  resolved: false,
  par: 0,
  tutorial: null,    // { step } while the guided tutorial is running
};

/* ---------- generation ---------- */

function seasonForDate(d) {
  const m = d.getMonth(); // northern hemisphere
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "fall";
  return "winter";
}

function newGame({ daily = true, season = null, replay = false } = {}) {
  const today = new Date();
  state.isDailyBoard = daily; // daily boards (incl. replays) share spoiler-safe
  state.isTutorialBoard = false;
  if (daily) {
    const key = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    state.rng = mulberry32(hashStr("plotday:" + key));
    const localMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const epoch = new Date(EPOCH_Y, EPOCH_M, EPOCH_D);
    state.dayNum = Math.max(1, Math.round((localMidnight - epoch) / 86400000) + 1);
    state.seedLabel = `Plot #${state.dayNum}`;
    state.season = seasonForDate(today);
  } else {
    state.rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
    state.dayNum = 0;
    state.seedLabel = "Practice plot";
    state.season = season || ["spring", "summer", "fall", "winter"][(Math.random() * 4) | 0];
  }

  // Depth gate: roll candidate boards until the gold-par gap clears the
  // threshold (boards where greedy play is already optimal are flat days).
  // Deterministic: the rng stream and gate seeds derive from the date.
  const GATE_TRIES = 4;
  let pick = null;
  for (let attempt = 0; attempt < GATE_TRIES; attempt++) {
    const [pHigh, pMid] = ARC_WEIGHTS[state.season];
    const roll = state.rng();
    state.sunArc = roll < pHigh ? "high" : roll < pHigh + pMid ? "mid" : "low";
    generateYard();
    recomputeSun();
    generatePacket(); // after sun: the packet adapts to today's board
    const par = computePar();
    const board = snapshotBoard();
    const gold = solveGold(board, hashStr(state.seedLabel + "#gate" + attempt), GOLD_FAST_ITERS);
    const gap = gold - par;
    if (!pick || gap > pick.gap) pick = { board, par, gold, gap };
    if (gap >= depthThreshold(par)) break;
  }

  // restore the picked board (the gate loop may have rolled past it)
  state.sunArc = pick.board.arc;
  state.grid = pick.board.obstacles.map((row, y) =>
    row.map((o, x) => ({ obstacle: o, plant: null, barrel: false, inside: pick.board.inside[y][x] })));
  recomputeSun();
  state.packet = pick.board.defs.map((def, i) => ({ def, qty: pick.board.qty[i] }));
  state.waterMax = pick.board.waterMax;
  state.waterLeft = pick.board.waterMax;
  state.barrelStock = 1;
  state.pruneStock = 1;
  state.baseObstacles = pick.board.obstacles.map(row => row.slice());
  state.par = pick.par;
  state.gold = pick.gold;
  state.goldLayout = null;

  state.selected = null;
  state.resolved = false;
  renderAll();

  // a locked daily restores its finished garden read-only;
  // a replay loads the same board fresh, unscored and unlockable
  if (!DEV_MODE && state.dayNum > 0 && !replay) {
    const entry = todayEntry();
    if (entry) restoreLockedDaily(entry);
  }
  if (replay && daily) {
    state.seedLabel += " · replay";
    state.dayNum = 0; // practice rules: no lock, no streak
  }
  $("#bot-banner").hidden = true;
  renderAll();

  // refine gold in the background with the full budget (also yields the
  // bot's layout for the post-game reveal)
  state.gameId = (state.gameId || 0) + 1;
  const token = state.gameId, label = state.seedLabel;
  setTimeout(() => {
    if (state.gameId !== token) return; // board was replaced meanwhile
    const refined = solveGold(pick.board, hashStr(label + "#goldfull"), GOLD_FULL_ITERS, true);
    state.goldLayout = { ...refined, defs: pick.board.defs };
    if (refined.score > state.gold) state.gold = refined.score;
    if (!$("#results-scrim").hidden) refreshGoldUI();
  }, 80);
}

/* ---------- daily lock & history ledger ---------- */

const STORE_KEY = "plotday-v1";
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { ledger: [] }; }
  catch { return { ledger: [] }; }
}
function saveStore(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* storage off */ }
}
function todayEntry() {
  return loadStore().ledger.find(e => e.plot === state.dayNum);
}

// Store raw facts, not summaries: every future stat/badge can be derived.
function lockDaily() {
  const score = totalScore();
  const cells = [], prunedCells = [];
  let barrel = null;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = state.grid[y][x];
      if (c.plant) cells.push({ x, y, id: c.plant.def.id, w: c.plant.watered ? 1 : 0, p: c.plant.paid || 0 });
      if (c.barrel) barrel = { x, y };
      if (!c.obstacle && state.baseObstacles[y][x]) prunedCells.push({ x, y });
    }
  const store = loadStore();
  store.ledger.push({
    plot: state.dayNum, season: state.season, arc: state.sunArc,
    score, par: state.par, gold: state.gold,
    skill: Math.round((100 * score) / state.gold),
    cells, barrel, pruned: prunedCells, waterLeft: state.waterLeft,
    hard: store.hardMode ? 1 : 0, // the mode the day was locked under
    at: Date.now(),
  });
  saveStore(store);
}

function restoreLockedDaily(e) {
  const defs = CATALOG[state.season];
  if (e.pruned) for (const pc of e.pruned) state.grid[pc.y][pc.x].obstacle = null;
  if (e.pruned && e.pruned.length) state.pruneStock = 0;
  if (e.barrel) { state.grid[e.barrel.y][e.barrel.x].barrel = true; state.barrelStock = 0; }
  for (const c of e.cells) {
    const def = defs.find(d => d.id === c.id);
    if (!def) continue;
    state.grid[c.y][c.x].plant = { def, watered: !!c.w, paid: c.p || 0 };
    // spend the seed from the packet, as live play did — otherwise the
    // results tally counts the whole packet as "unplanted" after a reload
    const slot = state.packet.find(s => s.def.id === c.id);
    if (slot && slot.qty > 0) slot.qty--;
  }
  state.waterLeft = e.waterLeft ?? 0;
  state.resolved = true;
  recomputeSun();
}

function currentStreak() {
  const plots = new Set(loadStore().ledger.map(e => e.plot));
  let s = 0, d = state.dayNum;
  while (d > 0 && plots.has(d)) { s++; d--; }
  return s;
}

function generateYard() {
  const r = state.rng;
  state.grid = Array.from({ length: H }, () =>
    Array.from({ length: W }, () => ({ obstacle: null, plant: null, barrel: false }))
  );

  // House: 2x2 core, sometimes with an L-addition or an attached garage
  const hx = Math.floor(r() * (W - 1));
  const hy = Math.floor(r() * (H - 1));
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++)
      state.grid[hy + dy][hx + dx].obstacle = "house";

  const roll = r();
  state.reservedCells = new Set(); // kept clear: the garage door approach
  if (roll > 0.4) {
    const sides = [
      [[hx - 1, hy], [hx - 1, hy + 1]], // west wall
      [[hx + 2, hy], [hx + 2, hy + 1]], // east wall
      [[hx, hy - 1], [hx + 1, hy - 1]], // north wall
      [[hx, hy + 2], [hx + 1, hy + 2]], // south wall
    ].filter(cells => cells.every(([x, y]) =>
      x >= 0 && x < W && y >= 0 && y < H && !state.grid[y][x].obstacle));
    if (sides.length) {
      const side = sides[Math.floor(r() * sides.length)];
      if (roll > 0.7) {
        side.forEach(([x, y]) => state.grid[y][x].obstacle = "garage");
        // nobody fences in their own garage: the cells the doors open
        // onto stay free of trees and fences (plantable is fine)
        const horiz = side[0][1] === side[1][1];
        const out = horiz ? (side[0][1] < hy ? -1 : 1) : (side[0][0] < hx ? -1 : 1);
        for (const [x, y] of side) {
          const cx = horiz ? x : x + out, cy = horiz ? y + out : y;
          if (cx >= 0 && cx < W && cy >= 0 && cy < H)
            state.reservedCells.add(cx + "," + cy);
        }
      } else {
        const [x, y] = side[Math.floor(r() * side.length)];
        state.grid[y][x].obstacle = "house"; // L-addition
      }
    }
  }

  // Greenhouse (winter only): a glass shelter placed like the house, but
  // its footprint IS the plantable interior — the only ground where
  // tender crops survive. Glass casts no shade (h would be 0 anyway).
  if (state.season === "winter") placeGreenhouse();

  // Trees: 3-4
  const nTrees = 3 + Math.floor(r() * 2);
  for (let i = 0; i < nTrees; i++) placeRandomObstacle("tree");

  // Fence runs: 1-2 runs of 3-5 segments
  const nRuns = 1 + Math.floor(r() * 2);
  for (let i = 0; i < nRuns; i++) {
    const horiz = r() < 0.5;
    const len = 3 + Math.floor(r() * 3);
    const fx = Math.floor(r() * (horiz ? W - len : W));
    const fy = Math.floor(r() * (horiz ? H : H - len));
    for (let j = 0; j < len; j++) {
      const cy = fy + (horiz ? 0 : j), cx = fx + (horiz ? j : 0);
      const cell = state.grid[cy][cx];
      if (!cell.obstacle && !cell.inside && !state.reservedCells.has(cx + "," + cy))
        cell.obstacle = "fence";
    }
  }
}

function placeRandomObstacle(kind) {
  const r = state.rng;
  for (let tries = 0; tries < 40; tries++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H);
    if (!state.grid[y][x].obstacle && !state.grid[y][x].inside &&
        !state.reservedCells.has(x + "," + y)) {
      state.grid[y][x].obstacle = kind;
      return;
    }
  }
}

// 2x2 to 2x3 glass footprint, anywhere the yard is clear (garage-door
// approaches stay open too — nobody glasses in their own driveway).
function placeGreenhouse() {
  const r = state.rng;
  const sizes = [[2, 2], [3, 2], [2, 3]];
  const want = sizes[Math.floor(r() * sizes.length)];
  for (const [gw, gh] of [want, [2, 2]]) { // a 2x2 always fits somewhere
    const spots = [];
    for (let gy = 0; gy + gh <= H; gy++)
      for (let gx = 0; gx + gw <= W; gx++) {
        let ok = true;
        for (let dy = 0; dy < gh && ok; dy++)
          for (let dx = 0; dx < gw && ok; dx++)
            if (state.grid[gy + dy][gx + dx].obstacle ||
                state.reservedCells.has((gx + dx) + "," + (gy + dy))) ok = false;
        if (ok) spots.push([gx, gy]);
      }
    if (!spots.length) continue;
    const [gx, gy] = spots[Math.floor(r() * spots.length)];
    for (let dy = 0; dy < gh; dy++)
      for (let dx = 0; dx < gw; dx++) state.grid[gy + dy][gx + dx].inside = true;
    return;
  }
}

// Could a watered tall crop on the right neighbor close this phase's sun?
// am sun comes from the east (tall to the east blocks it), pm from the west,
// noon from the south (a tall blocks it only when the sun arc is low).
const TALL_BLOCKER_DIR = { am: [1, 0], pm: [-1, 0], noon: [0, 1] };
function phaseClosable(x, y, phase) {
  // noon is closable by a single tall on low arcs, or by a canopy (h2) on mid
  if (phase === "noon" && SUN_ARCS[state.sunArc].noon(2) < 1) return false;
  const [dx, dy] = TALL_BLOCKER_DIR[phase];
  const nx = x + dx, ny = y + dy;
  return nx >= 0 && nx < W && ny >= 0 && ny < H && !state.grid[ny][nx].obstacle;
}

function generatePacket() {
  const r = state.rng;
  const hasTalls = CATALOG[state.season].some(d => d.tall);

  // For each sun level: tiles that exist today, and tiles a player could
  // CRAFT by planting talls to close open phases (shade engineering).
  const sunCounts = [0, 0, 0, 0];
  const craftable = [0, 0, 0, 0];
  const insideSuns = []; // sun levels of greenhouse tiles (tender-only homes)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (state.grid[y][x].obstacle) continue;
      const sun = state.sun[y][x];
      sunCounts[sun]++;
      if (state.grid[y][x].inside) insideSuns.push(sun);
      if (!hasTalls) continue;
      const open = PHASES.filter(p => !state.shadePhases[y][x].has(p));
      const closable = open.filter(p => phaseClosable(x, y, p)).length;
      // one tall per closed phase: every level from sun-1 down to
      // sun-closable is reachable on this tile
      for (let lvl = sun - 1; lvl >= sun - closable; lvl--) craftable[lvl]++;
    }

  let needsEngineering = false;
  state.packet = CATALOG[state.season].map(def => {
    let qty = def.tall ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2); // tall:1-2, rest:2-3
    if (def.tender) {
      // Shelter triage: tender crops live or die by the glasshouse, so
      // their qty looks only at interior tiles — and deliberately stays
      // bigger than the shelter some days. That IS the day's question.
      const exact = insideSuns.filter(s => s === def.sun).length;
      const near = insideSuns.filter(s => Math.abs(s - def.sun) <= 1).length;
      if (near === 0) qty = 0;                  // nowhere under glass it can live
      else if (exact === 0) qty = Math.min(qty, 2); // it could only hang on
      return { def, qty };
    }
    const fits = sunCounts[def.sun];
    const buildable = Math.min(craftable[def.sun], 3);
    if (fits === 0 && buildable === 0) qty = 0;
    else if (fits === 0) { qty = Math.min(qty, 2); needsEngineering = true; }
    else if (fits <= 2) qty = Math.min(qty, fits + (buildable > 0 ? 1 : 0));
    return { def, qty };
  }).filter(s => s.qty > 0);

  // If a crop's only possible home must be built, guarantee the lumber:
  // at least 2 tall seeds in the packet.
  if (needsEngineering) {
    const tallSlot = state.packet.find(s => s.def.tall);
    if (tallSlot) tallSlot.qty = Math.max(tallSlot.qty, 2);
  }

  // Water covers ~65-80% of the packet's full cost (the barrel no longer
  // adds water, it discounts neighbors). You can't grow everything.
  // Winter ships a touch generous: shelter triage is squeeze enough.
  const totalWater = state.packet.reduce((n, s) => n + s.qty * s.def.water, 0);
  const frac = (state.season === "winter" ? 0.72 : 0.65) + r() * 0.15;
  state.waterMax = Math.max(5, Math.round(totalWater * frac));
  state.waterLeft = state.waterMax;
  state.barrelStock = 1; // one rain barrel per board: discounts neighbors, costs a tile
}

/* ---------- sun & shade ---------- */

// Canopy: two adjacent grown talls reinforce each other to height 2 —
// longer am/pm shadows, and midday shade once the sun arc is medium.
function tallHeight(x, y, requireWatered) {
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    const n = state.grid[ny][nx].plant;
    if (n && n.def.tall && (!requireWatered || n.watered)) return 2;
  }
  return 1;
}

function recomputeSun() {
  const arc = SUN_ARCS[state.sunArc];
  const computePhases = (includeUnwateredTalls) => {
    const phases = Array.from({ length: H }, () =>
      Array.from({ length: W }, () => new Set()));
    const cast = (x, y, h) => {
      const reach = arc.ampm(h), noonReach = arc.noon(h);
      for (let i = 1; i <= reach; i++) if (x - i >= 0) phases[y][x - i].add("am");
      for (let i = 1; i <= reach; i++) if (x + i < W) phases[y][x + i].add("pm");
      for (let i = 1; i <= noonReach; i++) if (y - i >= 0) phases[y - i][x].add("noon");
    };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = state.grid[y][x];
        if (c.obstacle) cast(x, y, OBSTACLES[c.obstacle].h);
        else if (c.plant && c.plant.def.tall && (includeUnwateredTalls || c.plant.watered))
          cast(x, y, tallHeight(x, y, !includeUnwateredTalls));
      }
    return phases;
  };

  state.shadePhases = computePhases(false);
  // ghost shade: what additionally falls once every placed tall is watered
  const potential = computePhases(true);
  state.ghostPhases = potential.map((row, y) =>
    row.map((set, x) => new Set([...set].filter(p => !state.shadePhases[y][x].has(p)))));

  state.sun = state.shadePhases.map((row, y) =>
    row.map((set, x) => (state.grid[y][x].obstacle ? 0 : 3 - set.size))
  );
}

/* ---------- plant status ---------- */

// Shelter is life too: tender crops freeze outside the greenhouse.
function frozenOut(x, y, def) {
  return !!def.tender && state.season === "winter" && !state.grid[y][x].inside;
}

// Water is life: unwatered plants die. Watered: exact sun = thrive,
// sun off by one = hanging on, off by two or more = dead anyway.
function plantStatus(x, y) {
  const p = state.grid[y][x].plant;
  if (!p) return null;
  if (frozenOut(x, y, p.def)) return "dead";
  const gap = Math.abs(state.sun[y][x] - p.def.sun);
  if (gap >= 2 || !p.watered) return "dead";
  return gap === 0 ? "thrive" : "ok";
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Companions: +2 per adjacent living friend, -2 per adjacent living enemy
// (real antagonists: shared pests, family blight, allelopathy).
// Mushrooms: +2 per adjacent tree. Returns the NET adjacency bonus.
function companionBonus(x, y) {
  const p = state.grid[y][x].plant;
  if (!p || plantStatus(x, y) === "dead") return 0;
  let net = 0;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    const n = state.grid[ny][nx];
    if (p.def.lovesTrees && n.obstacle === "tree") net += COMPANION_BONUS;
    else if (n.plant && plantStatus(nx, ny) !== "dead") {
      if (p.def.friends.includes(n.plant.def.id)) net += COMPANION_BONUS;
      else if ((p.def.enemies || []).includes(n.plant.def.id)) net -= COMPANION_BONUS;
    }
  }
  return net;
}

// Sun a tile will have once every placed tall crop is watered: today's
// shade plus the ghost shade. Previews must plan against THIS, not the
// current sun, or shade crops under a future canopy tally wrong.
function projectedSun(x, y) {
  return 3 - state.shadePhases[y][x].size - state.ghostPhases[y][x].size;
}

// What the adjacency bonus WOULD be if this plant and its neighbors were
// watered (viability judged at projected sun). Powers ghost chips.
function potentialBonus(x, y) {
  const p = state.grid[y][x].plant;
  if (!p) return 0;
  const viable = (px, py, d) =>
    !frozenOut(px, py, d) && Math.abs(projectedSun(px, py) - d.sun) < 2;
  if (!viable(x, y, p.def)) return 0;
  let net = 0;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
    const n = state.grid[ny][nx];
    if (p.def.lovesTrees && n.obstacle === "tree") net += COMPANION_BONUS;
    else if (n.plant && viable(nx, ny, n.plant.def)) {
      if (p.def.friends.includes(n.plant.def.id)) net += COMPANION_BONUS;
      else if ((p.def.enemies || []).includes(n.plant.def.id)) net -= COMPANION_BONUS;
    }
  }
  return net;
}

// A barrel left outdoors in winter freezes solid: no discount, no badges.
// (Placing it is still allowed — the shovel refunds fully, so the lesson
// is free. Under glass it works normally and competes for shelter tiles.)
function barrelFrozen(x, y) {
  return state.season === "winter" && !state.grid[y][x].inside;
}

// The rain barrel discounts watering for adjacent plants (min cost 1).
function nearBarrel(x, y) {
  return DIRS.some(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    return nx >= 0 && nx < W && ny >= 0 && ny < H &&
      state.grid[ny][nx].barrel && !barrelFrozen(nx, ny);
  });
}
function waterCost(x, y, def) {
  return nearBarrel(x, y) ? Math.max(0, def.water - 1) : def.water;
}

function plantPoints(x, y) {
  const p = state.grid[y][x].plant;
  const s = plantStatus(x, y);
  if (s === "dead") return 0;
  const base = s === "thrive" ? p.def.pts : Math.ceil(p.def.pts / 2);
  return Math.max(0, base + companionBonus(x, y)); // enemies can zero a plant, never go negative
}

// What this plant WOULD earn once watered (projected sun, neighbors assumed
// watered too) — powers the on-tile points preview for planning.
function pointsPreview(x, y) {
  const p = state.grid[y][x].plant;
  if (!p) return 0;
  if (p.watered) return plantPoints(x, y);
  if (frozenOut(x, y, p.def)) return 0; // no amount of water thaws it
  const gap = Math.abs(projectedSun(x, y) - p.def.sun);
  if (gap >= 2) return 0;
  const base = gap === 0 ? p.def.pts : Math.ceil(p.def.pts / 2);
  return Math.max(0, base + potentialBonus(x, y));
}

function totalScore() {
  let sum = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (state.grid[y][x].plant) sum += plantPoints(x, y);
  return sum;
}

/* ---------- par: greedy gardener benchmark ----------
   Water is life, so par only plants what it can water. Works through
   crops best-points-first, each onto its best-fitting sunny tile.
   Par is blind to companions, tall-crop shade, and the rain barrel —
   always reachable by plain play; those three layers are your edge. */

function computePar() {
  const sun = state.sun.map(row => row.slice());
  const placed = Array.from({ length: H }, () => Array(W).fill(null));
  const baseAt = Array.from({ length: H }, () => Array(W).fill(0));
  let water = state.waterMax;

  const stock = state.packet.filter(s => !s.def.tall)
    .map(s => ({ def: s.def, qty: s.qty }))
    .sort((a, b) => b.def.pts - a.def.pts);

  for (const item of stock) {
    for (let n = 0; n < item.qty; n++) {
      if (water < item.def.water) break; // can't water it -> it would die
      let best = null;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (placed[y][x] || state.grid[y][x].obstacle) continue;
          if (frozenOut(x, y, item.def)) continue; // tender can't live out here
          const gap = Math.abs(sun[y][x] - item.def.sun);
          if (gap >= 2) continue;
          if (!best || gap < best.gap) best = { x, y, gap };
        }
      if (!best) break;
      placed[best.y][best.x] = item.def;
      baseAt[best.y][best.x] = best.gap === 0 ? item.def.pts : Math.ceil(item.def.pts / 2);
      water -= item.def.water;
    }
  }

  // Par's plants are all watered and alive, so it banks whatever companion
  // hearts (and enemy penalties) its sun-greedy layout happens to produce.
  let score = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = placed[y][x];
      if (!d) continue;
      let net = 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const nd = placed[ny][nx];
        if (d.lovesTrees && state.grid[ny][nx].obstacle === "tree") net += COMPANION_BONUS;
        else if (nd && d.friends.includes(nd.id)) net += COMPANION_BONUS;
        else if (nd && (d.enemies || []).includes(nd.id)) net -= COMPANION_BONUS;
      }
      score += Math.max(0, baseAt[y][x] + net);
    }
  return score;
}

/* ---------- gold: deterministic annealing optimizer ----------
   Searches placements + watering + barrel + tall-shade jointly. Seeded
   from the plot's date so every player computes the same Gold. Exact
   optimum is infeasible; Gold = best the bot found (beating it is a
   feat, not a bug). Also powers the board-depth gate in newGame. */

const GOLD_FAST_ITERS = 12000;  // generation gate budget
const GOLD_FULL_ITERS = 120000; // background refinement budget

function depthThreshold(par) {
  return Math.max(6, Math.ceil(par * 0.12));
}

function snapshotBoard() {
  return {
    obstacles: state.grid.map(row => row.map(c => c.obstacle)),
    inside: state.grid.map(row => row.map(c => !!c.inside)),
    season: state.season,
    arc: state.sunArc,
    defs: state.packet.map(s => s.def),
    qty: state.packet.map(s => s.qty),
    waterMax: state.waterMax,
  };
}

function solveGold(board, seed, iterations, wantLayout = false) {
  const { obstacles, arc, defs, qty, waterMax, inside, season } = board;
  const winter = season === "winter";
  const rng = mulberry32(seed);
  const arcDef = SUN_ARCS[arc];
  const N = W * H;
  const obst = new Array(N).fill(null);
  const ins = new Uint8Array(N); // greenhouse interior: tender-safe, barrel-safe
  const tiles = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      obst[i] = obstacles[y][x];
      if (inside && inside[y][x]) ins[i] = 1;
      if (!obstacles[y][x]) tiles.push(i);
    }

  const plant = new Array(N).fill(-1); // def index, all placed plants watered
  const left = qty.slice();
  let barrelPos = -1;
  let pruned = -1; // one tree/fence the solver may fell (mirrors the prune tool)
  const prunable = [];
  for (let i = 0; i < N; i++)
    if (obst[i] === "tree" || obst[i] === "fence") prunable.push(i);

  const cellOpen = i => !obst[i] || i === pruned;
  const openCells = () => (pruned >= 0 ? tiles.concat(pruned) : tiles);

  const am = new Uint8Array(N), noon = new Uint8Array(N), pm = new Uint8Array(N);
  function castAll() {
    am.fill(0); noon.fill(0); pm.fill(0);
    const castFrom = (i, h) => {
      const x = i % W, y = (i / W) | 0;
      const reach = arcDef.ampm(h), nr = arcDef.noon(h);
      for (let k = 1; k <= reach; k++) {
        if (x - k >= 0) am[i - k] = 1;
        if (x + k < W) pm[i + k] = 1;
      }
      for (let k = 1; k <= nr; k++) if (y - k >= 0) noon[i - k * W] = 1;
    };
    const isTall = i => plant[i] >= 0 && defs[plant[i]].tall;
    for (let i = 0; i < N; i++) {
      if (obst[i] && i !== pruned) castFrom(i, OBSTACLES[obst[i]].h);
      else if (isTall(i)) {
        // canopy: adjacent talls reinforce each other to height 2
        const x = i % W, y = (i / W) | 0;
        let h = 1;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H && isTall(ny * W + nx)) { h = 2; break; }
        }
        castFrom(i, h);
      }
    }
  }

  function evaluate() {
    castAll();
    let water = 0;
    for (let i = 0; i < N; i++) {
      if (plant[i] < 0) continue;
      const d = defs[plant[i]];
      let cost = d.water;
      if (barrelPos >= 0 && (!winter || ins[barrelPos])) { // frozen barrel: no discount
        const dx = Math.abs((i % W) - (barrelPos % W));
        const dy = Math.abs(((i / W) | 0) - ((barrelPos / W) | 0));
        if (dx + dy === 1) cost = Math.max(0, cost - 1);
      }
      water += cost;
    }
    if (water > waterMax) return -1; // infeasible
    const alive = new Uint8Array(N);
    const base = new Int16Array(N);
    for (let i = 0; i < N; i++) {
      if (plant[i] < 0) continue;
      const d = defs[plant[i]];
      if (winter && d.tender && !ins[i]) continue; // froze outside the glass
      const sun = 3 - (am[i] + noon[i] + pm[i]);
      const gap = Math.abs(sun - d.sun);
      if (gap >= 2) continue;
      alive[i] = 1;
      base[i] = gap === 0 ? d.pts : Math.ceil(d.pts / 2);
    }
    let score = 0;
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      const d = defs[plant[i]];
      const x = i % W, y = (i / W) | 0;
      let net = 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const j = ny * W + nx;
        if (d.lovesTrees && obst[j] === "tree" && j !== pruned) net += COMPANION_BONUS;
        else if (alive[j] && d.friends.includes(defs[plant[j]].id)) net += COMPANION_BONUS;
        else if (alive[j] && (d.enemies || []).includes(defs[plant[j]].id)) net -= COMPANION_BONUS;
      }
      score += Math.max(0, base[i] + net);
    }
    return score;
  }

  // warm start: the par greedy (non-tall, best points first, exact tiles)
  (function warmStart() {
    castAll();
    let water = 0;
    const order = defs.map((_, di) => di).filter(di => !defs[di].tall)
      .sort((a, b) => defs[b].pts - defs[a].pts);
    for (const di of order) {
      for (let n = 0; n < qty[di]; n++) {
        if (water + defs[di].water > waterMax) break;
        let best = -1, bestGap = 99;
        for (const i of tiles) {
          if (plant[i] >= 0) continue;
          if (winter && defs[di].tender && !ins[i]) continue;
          const sun = 3 - (am[i] + noon[i] + pm[i]);
          const gap = Math.abs(sun - defs[di].sun);
          if (gap >= 2) continue;
          if (gap < bestGap) { bestGap = gap; best = i; }
        }
        if (best < 0) break;
        plant[best] = di; left[di]--; water += defs[di].water;
      }
    }
  })();

  let cur = evaluate();
  let best = cur;
  let bestPlant = plant.slice(), bestBarrel = barrelPos, bestPruned = pruned;

  // annealing with two reheats; acceptance uses only +,*,/ so results
  // are deterministic across JS engines (no Math.exp)
  const T0 = 6, seg = Math.max(1, (iterations / 3) | 0);
  for (let it = 0; it < iterations; it++) {
    const T = T0 * (1 - (it % seg) / seg);
    let undo = null;
    const mv = rng();
    if (mv < 0.28) { // add a plant
      const cand = [];
      for (let di = 0; di < defs.length; di++) if (left[di] > 0) cand.push(di);
      if (!cand.length) continue;
      const di = cand[(rng() * cand.length) | 0];
      const empt = openCells().filter(i => plant[i] < 0 && i !== barrelPos);
      if (!empt.length) continue;
      const i = empt[(rng() * empt.length) | 0];
      plant[i] = di; left[di]--;
      undo = () => { plant[i] = -1; left[di]++; };
    } else if (mv < 0.42) { // remove a plant
      const occ = openCells().filter(i => plant[i] >= 0);
      if (!occ.length) continue;
      const i = occ[(rng() * occ.length) | 0];
      const di = plant[i];
      plant[i] = -1; left[di]++;
      undo = () => { plant[i] = di; left[di]--; };
    } else if (mv < 0.70) { // move a plant
      const occ = openCells().filter(i => plant[i] >= 0);
      const empt = openCells().filter(i => plant[i] < 0 && i !== barrelPos);
      if (!occ.length || !empt.length) continue;
      const a = occ[(rng() * occ.length) | 0];
      const b = empt[(rng() * empt.length) | 0];
      const di = plant[a];
      plant[a] = -1; plant[b] = di;
      undo = () => { plant[b] = -1; plant[a] = di; };
    } else if (mv < 0.86) { // swap two plants
      const occ = openCells().filter(i => plant[i] >= 0);
      if (occ.length < 2) continue;
      const a = occ[(rng() * occ.length) | 0];
      const b = occ[(rng() * occ.length) | 0];
      if (a === b) continue;
      const t = plant[a]; plant[a] = plant[b]; plant[b] = t;
      undo = () => { const t2 = plant[a]; plant[a] = plant[b]; plant[b] = t2; };
    } else if (mv < 0.94) { // move / place / remove the barrel
      const old = barrelPos;
      if (old >= 0 && rng() < 0.25) barrelPos = -1;
      else {
        const empt = openCells().filter(i => plant[i] < 0 && i !== old);
        if (!empt.length) continue;
        barrelPos = empt[(rng() * empt.length) | 0];
      }
      undo = () => { barrelPos = old; };
    } else { // fell (or regrow) one tree/fence — mirrors the prune tool
      if (!prunable.length) continue;
      const snapPlant = plant.slice(), snapLeft = left.slice();
      const snapPruned = pruned, snapBarrel = barrelPos;
      if (pruned >= 0 && rng() < 0.3) {
        // regrow: evict whatever moved onto the stump
        if (plant[pruned] >= 0) { left[plant[pruned]]++; plant[pruned] = -1; }
        if (barrelPos === pruned) barrelPos = -1;
        pruned = -1;
      } else {
        const i = prunable[(rng() * prunable.length) | 0];
        if (i === pruned) continue;
        if (pruned >= 0) { // moving the prune: evict from the old stump
          if (plant[pruned] >= 0) { left[plant[pruned]]++; plant[pruned] = -1; }
          if (barrelPos === pruned) barrelPos = -1;
        }
        pruned = i;
      }
      undo = () => {
        plant.length = 0; plant.push(...snapPlant);
        left.length = 0; left.push(...snapLeft);
        pruned = snapPruned; barrelPos = snapBarrel;
      };
    }
    const next = evaluate();
    const accept = next >= 0 &&
      (next >= cur || (next >= cur - (3 + T) && rng() < 0.10 + 0.20 * (T / T0)));
    if (accept) {
      cur = next;
      if (cur > best) {
        best = cur;
        bestPlant = plant.slice(); bestBarrel = barrelPos; bestPruned = pruned;
      }
    } else if (undo) undo();
  }
  if (!wantLayout) return best;
  // Tidy the reveal: dead non-tall plants and a frozen barrel score nothing,
  // but they'd make the bot's garden look like littering. Stripping them is
  // score-neutral (dead plants feed no companion math; talls are kept — a
  // watered tall casts its shadow even while dying).
  plant.length = 0; plant.push(...bestPlant);
  barrelPos = bestBarrel; pruned = bestPruned;
  castAll();
  for (let i = 0; i < N; i++) {
    if (plant[i] < 0 || defs[plant[i]].tall) continue;
    const d = defs[plant[i]];
    const sun = 3 - (am[i] + noon[i] + pm[i]);
    if ((winter && d.tender && !ins[i]) || Math.abs(sun - d.sun) >= 2) plant[i] = -1;
  }
  if (barrelPos >= 0 && winter && !ins[barrelPos]) barrelPos = -1;
  return { score: best, plant: plant.slice(), barrelPos, pruned };
}

/* ---------- illustrated scene (SVG structures over the grid) ---------- */

const SVG_HOUSE = `
<svg viewBox="0 0 100 100" overflow="visible">
  <ellipse cx="50" cy="94" rx="43" ry="5" fill="rgba(46,62,33,.22)"/>
  <rect x="12" y="42" width="76" height="51" rx="4" fill="#f2e2c2"/>
  <rect x="12" y="42" width="76" height="9" fill="#dcc69e"/>
  <rect x="80" y="42" width="8" height="51" fill="#e2cfa9"/>
  <polygon points="4,46 50,10 96,46" fill="#c96a4b"/>
  <polygon points="50,10 96,46 76,46 50,21" fill="#a84e33"/>
  <polygon points="4,46 50,10 58,16 14,46" fill="#dd8059"/>
  <rect x="64" y="19" width="11" height="16" fill="#b25a3c"/>
  <rect x="64" y="19" width="11" height="4.5" fill="#8e442a"/>
  <rect x="57" y="60" width="18" height="33" rx="3" fill="#96683f"/>
  <rect x="57" y="60" width="6" height="33" rx="3" fill="#aa7c50"/>
  <circle cx="71" cy="77" r="1.7" fill="#54381e"/>
  <rect x="23" y="57" width="20" height="16" rx="2" fill="#cfe7f0"/>
  <rect x="23" y="57" width="20" height="5" fill="#a6cdd9"/>
  <rect x="21" y="72" width="24" height="4" rx="2" fill="#d9c49b"/>
</svg>`;

const SVG_HUT = `
<svg viewBox="0 0 100 100" overflow="visible">
  <ellipse cx="50" cy="93" rx="36" ry="4.5" fill="rgba(46,62,33,.22)"/>
  <rect x="16" y="48" width="68" height="44" rx="4" fill="#f2e2c2"/>
  <rect x="16" y="48" width="68" height="8" fill="#dcc69e"/>
  <polygon points="10,52 50,20 90,52" fill="#c96a4b"/>
  <polygon points="50,20 90,52 74,52 50,30" fill="#a84e33"/>
  <polygon points="10,52 50,20 57,25 17,52" fill="#dd8059"/>
  <rect x="39" y="62" width="22" height="30" rx="3" fill="#96683f"/>
  <rect x="39" y="62" width="7" height="30" rx="3" fill="#aa7c50"/>
</svg>`;

function svgGarage(horizontal) {
  const vb = horizontal ? "0 0 200 100" : "0 0 100 200";
  const body = horizontal
    ? `<ellipse cx="100" cy="94" rx="92" ry="5" fill="rgba(46,62,33,.2)"/>
       <rect x="8" y="36" width="184" height="56" rx="6" fill="#ecdab6"/>
       <rect x="8" y="36" width="184" height="9" fill="#d6c096"/>
       <rect x="2" y="22" width="196" height="17" rx="7" fill="#bb8d60"/>
       <rect x="2" y="22" width="196" height="6" rx="3" fill="#d2a878"/>
       <rect x="24" y="48" width="66" height="40" rx="4" fill="#9aa6b0"/>
       <rect x="24" y="48" width="66" height="8" rx="4" fill="#828f9a"/>
       <rect x="110" y="48" width="66" height="40" rx="4" fill="#9aa6b0"/>
       <rect x="110" y="48" width="66" height="8" rx="4" fill="#828f9a"/>
       <path d="M30 64h54M30 74h54M116 64h54M116 74h54" stroke="#8794a0" stroke-width="3" stroke-linecap="round"/>`
    : `<ellipse cx="50" cy="192" rx="42" ry="5" fill="rgba(46,62,33,.2)"/>
       <rect x="36" y="8" width="56" height="184" rx="6" fill="#ecdab6"/>
       <rect x="36" y="8" width="9" height="184" fill="#d6c096"/>
       <rect x="22" y="2" width="17" height="196" rx="7" fill="#bb8d60"/>
       <rect x="22" y="2" width="6" height="196" rx="3" fill="#d2a878"/>
       <rect x="48" y="24" width="40" height="66" rx="4" fill="#9aa6b0"/>
       <rect x="48" y="24" width="8" height="66" rx="4" fill="#828f9a"/>
       <rect x="48" y="110" width="40" height="66" rx="4" fill="#9aa6b0"/>
       <rect x="48" y="110" width="8" height="66" rx="4" fill="#828f9a"/>
       <path d="M64 30v54M74 30v54M64 116v54M74 116v54" stroke="#8794a0" stroke-width="3" stroke-linecap="round"/>`;
  return `<svg viewBox="${vb}" overflow="visible">${body}</svg>`;
}

const SVG_TREE = `
<svg viewBox="0 0 100 100" overflow="visible">
  <ellipse cx="50" cy="92" rx="27" ry="5" fill="rgba(46,62,33,.25)"/>
  <path d="M45,90 C43,74 43,62 46,52 L54,52 C56,64 55,76 54,90 Z" fill="#7d5435"/>
  <path d="M45,90 C43,74 43,62 46,52 L49,52 C48,68 48,78 49,90 Z" fill="#684328"/>
  <circle cx="69" cy="46" r="17" fill="#4d7e43"/>
  <circle cx="31" cy="47" r="17" fill="#69a258"/>
  <circle cx="50" cy="33" r="24" fill="#5b9350"/>
  <path d="M29,28 a25,25 0 0 1 33,-4 c-4,-9 -19,-13 -28,-7 -4,3 -6,7 -5,11 Z" fill="#7fb46b"/>
  <circle cx="41" cy="24" r="4.5" fill="#90c47c" opacity=".85"/>
</svg>`;

const SVG_EVERGREEN = `
<svg viewBox="0 0 100 100" overflow="visible">
  <ellipse cx="50" cy="93" rx="27" ry="4.5" fill="rgba(40,58,56,.25)"/>
  <rect x="45" y="84" width="10" height="10" rx="3" fill="#6d4527"/>
  <polygon points="50,6 74,42 26,42" fill="#41805a"/>
  <polygon points="50,6 74,42 50,42" fill="#346849"/>
  <polygon points="50,24 80,62 20,62" fill="#498a62"/>
  <polygon points="50,24 80,62 50,62" fill="#3b7251"/>
  <polygon points="50,44 86,88 14,88" fill="#529469"/>
  <polygon points="50,44 86,88 50,88" fill="#437c57"/>
  <path d="M50,6 L61,23 q-6,4 -11,2.5 q-6,1.5 -11,-2.5 Z" fill="#eef4ee"/>
  <path d="M35,50 q15,7 30,0 l5,7 q-20,9 -40,0 Z" fill="#e7efe9" opacity=".92"/>
</svg>`;

/* ---------- gouache crop sprites (replace emoji on the board) ----------
   Same language as the structures: no outlines, tonal shading, light
   from the upper left. Drawn to sit on the tile's tilled soil bed. */
const CROP_SVGS = {
  tomato: `<svg viewBox="0 0 100 100">
    <ellipse cx="50" cy="58" rx="26" ry="22" fill="#4f8045"/>
    <ellipse cx="42" cy="48" rx="17" ry="13" fill="#69a258"/>
    <path d="M50,36 q-2,-8 4,-12" stroke="#4d7e43" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <circle cx="37" cy="66" r="9" fill="#cf4527"/><circle cx="34.5" cy="63.5" r="3" fill="#ec8266"/>
    <circle cx="58" cy="71" r="10.5" fill="#dd5331"/><circle cx="55" cy="68" r="3.5" fill="#f29076"/>
    <circle cx="63" cy="52" r="8" fill="#c43e22"/><circle cx="61" cy="50" r="2.6" fill="#ec8266"/>
  </svg>`,
  pumpkin: `<svg viewBox="0 0 100 100">
    <ellipse cx="36" cy="60" rx="20" ry="13" fill="#5b9350"/>
    <ellipse cx="29" cy="53" rx="12" ry="8" fill="#79b066"/>
    <path d="M52,42 q10,-8 18,-4" stroke="#5b9350" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="61" cy="66" rx="22" ry="18" fill="#d07a2e"/>
    <path d="M61,48 a22,18 0 0 1 0,36 a14,18 0 0 0 0,-36" fill="#b66120"/>
    <path d="M53,50 a19,17 0 0 0 0,33" fill="none" stroke="#e8a35c" stroke-width="3.5"/>
    <rect x="58" y="40" width="6" height="10" rx="3" fill="#6d8a3e"/>
  </svg>`,
  pepper: `<svg viewBox="0 0 100 100">
    <ellipse cx="50" cy="52" rx="25" ry="19" fill="#4f8045"/>
    <ellipse cx="42" cy="44" rx="15" ry="11" fill="#69a258"/>
    <path d="M34,62 q-3,16 7,19 q8,-3 5,-19 Z" fill="#d24b2e"/>
    <path d="M36,62 q-1,12 4,16 q-6,-6 -4,-16 Z" fill="#ef7c52"/>
    <path d="M57,64 q-2,14 7,17 q7,-3 4,-17 Z" fill="#c43d22"/>
    <path d="M48,58 q-1,11 5,14 q6,-3 4,-14 Z" fill="#e06a3a"/>
  </svg>`,
  basil: `<svg viewBox="0 0 100 100">
    <ellipse cx="50" cy="60" rx="25" ry="21" fill="#57964b"/>
    <ellipse cx="40" cy="50" rx="14" ry="11" fill="#76b364"/>
    <ellipse cx="61" cy="48" rx="11" ry="9" fill="#8ac377"/>
    <ellipse cx="50" cy="37" rx="9" ry="7" fill="#9ed289"/>
    <ellipse cx="50" cy="35" rx="4" ry="3" fill="#c4e4af"/>
  </svg>`,
  lettuce: `<svg viewBox="0 0 100 100">
    <ellipse cx="50" cy="68" rx="27" ry="16" fill="#67a957"/>
    <ellipse cx="50" cy="62" rx="21" ry="13" fill="#84c070"/>
    <ellipse cx="50" cy="58" rx="14" ry="9" fill="#a8d791"/>
    <ellipse cx="50" cy="55" rx="8" ry="5.5" fill="#cdeab4"/>
  </svg>`,
  mushroom: `<svg viewBox="0 0 100 100">
    <path d="M27,60 a15,12 0 0 1 30,0 Z" fill="#9a6233"/>
    <path d="M27,60 a15,12 0 0 1 9,-11 l3,11 Z" fill="#bb8350"/>
    <rect x="36" y="60" width="11" height="18" rx="4.5" fill="#ead9bd"/>
    <rect x="36" y="60" width="4.5" height="18" rx="2" fill="#f4e9d4"/>
    <path d="M52,70 a12,10 0 0 1 24,0 Z" fill="#84522a"/>
    <path d="M52,70 a12,10 0 0 1 7,-9 l2.5,9 Z" fill="#a26c3b"/>
    <rect x="60" y="70" width="9" height="13" rx="4" fill="#e3d2b3"/>
  </svg>`,
  corn: `<svg viewBox="0 0 100 100">
    <path d="M50,92 L50,26" stroke="#5b9350" stroke-width="5" stroke-linecap="round"/>
    <path d="M50,62 q-17,-4 -21,-21 q15,2 21,15 Z" fill="#69a258"/>
    <path d="M50,72 q17,-4 21,-23 q-15,2 -21,17 Z" fill="#4f8045"/>
    <path d="M50,26 q-6,-9 -3,-15 M50,26 q6,-8 4,-14 M50,26 q0,-9 0,-15" stroke="#cdb15c" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="41" cy="50" rx="6" ry="11.5" fill="#e9c460" transform="rotate(-13 41 50)"/>
    <ellipse cx="39.4" cy="46" rx="2.2" ry="5" fill="#f3da92" transform="rotate(-13 39 46)"/>
    <path d="M41,39 q-6,9 -3,22" stroke="#79b066" stroke-width="3" fill="none" stroke-linecap="round"/>
  </svg>`,
  sunflower: `<svg viewBox="0 0 100 100">
    <path d="M50,92 L50,36" stroke="#5e8c44" stroke-width="5" stroke-linecap="round"/>
    <path d="M50,64 q-15,-2 -19,-15 q13,1 19,11 Z" fill="#69a258"/>
    <path d="M50,73 q15,-3 18,-16 q-13,2 -18,12 Z" fill="#4f8045"/>
    <g transform="translate(50 29)">
      <g fill="#eebf4b">
        <ellipse rx="6.5" ry="15"/><ellipse rx="6.5" ry="15" transform="rotate(45)"/>
        <ellipse rx="6.5" ry="15" transform="rotate(90)"/><ellipse rx="6.5" ry="15" transform="rotate(135)"/>
      </g>
      <g fill="#f6d87c"><ellipse rx="3" ry="13"/><ellipse rx="3" ry="13" transform="rotate(90)"/></g>
      <circle r="8.5" fill="#7c5430"/><circle cx="-2.5" cy="-2.5" r="3" fill="#96703f"/>
    </g>
  </svg>`,
  strawberry: `<svg viewBox="0 0 100 100">
    <ellipse cx="50" cy="62" rx="26" ry="15" fill="#56904a"/>
    <ellipse cx="43" cy="55" rx="14" ry="8.5" fill="#74af61"/>
    <circle cx="44" cy="50" r="3.6" fill="#fdf6e7"/><circle cx="44" cy="50" r="1.4" fill="#e9c460"/>
    <path d="M28,70 q-2,9 5,11 q7,-2 4,-11 Z" fill="#d8402a"/>
    <path d="M52,74 q-2,10 6,12 q7,-2 4,-12 Z" fill="#e25535"/>
    <path d="M67,64 q-2,8 5,10 q6,-2 3,-10 Z" fill="#cf3a24"/>
    <circle cx="32" cy="74" r="1.5" fill="#f4a791"/><circle cx="57" cy="79" r="1.5" fill="#f4a791"/>
  </svg>`,
  carrot: `<svg viewBox="0 0 100 100">
    <g stroke="#5e9a4c" stroke-width="3" fill="none" stroke-linecap="round">
      <path d="M42,76 q-7,-22 -16,-30"/><path d="M48,76 q-2,-26 2,-36"/>
      <path d="M56,76 q5,-24 14,-32"/><path d="M50,76 q-9,-16 -20,-20"/><path d="M53,76 q10,-16 20,-22"/>
    </g>
    <path d="M40,76 a10,6 0 0 0 20,0 Z" fill="#d97c2e"/>
    <path d="M40,76 a10,6 0 0 0 6,5 l2,-5 Z" fill="#ef9a4a"/>
  </svg>`,
  potato: `<svg viewBox="0 0 100 100">
    <ellipse cx="48" cy="58" rx="26" ry="18" fill="#54874a"/>
    <ellipse cx="40" cy="50" rx="15" ry="10" fill="#6fa75e"/>
    <circle cx="58" cy="44" r="3" fill="#f5f0f8"/><circle cx="64" cy="49" r="2.4" fill="#f5f0f8"/>
    <ellipse cx="63" cy="77" rx="9" ry="5.5" fill="#b98a5e"/>
    <ellipse cx="60.5" cy="75.5" rx="3.4" ry="2" fill="#d6ac7e"/>
  </svg>`,
  garlic: `<svg viewBox="0 0 100 100">
    <g stroke="#74a75f" stroke-width="3.2" fill="none" stroke-linecap="round">
      <path d="M50,72 L50,34"/><path d="M44,72 Q40,52 34,42"/><path d="M56,72 Q60,52 66,42"/>
    </g>
    <path d="M50,86 q-13,-2 -11,-15 q3,-9 11,-9 q8,0 11,9 q2,13 -11,15 Z" fill="#eee3d2"/>
    <path d="M50,62 q-3,12 0,24 q2.5,-12 0,-24 Z" fill="#cdbb9f"/>
    <path d="M41,68 q-2,8 1,15" stroke="#cdbb9f" stroke-width="2" fill="none"/>
  </svg>`,
  kale: `<svg viewBox="0 0 100 100">
    <ellipse cx="50" cy="62" rx="25" ry="17" fill="#3f7a52"/>
    <ellipse cx="38" cy="52" rx="13" ry="9.5" fill="#578f63"/>
    <ellipse cx="61" cy="50" rx="11" ry="8.5" fill="#6aa275"/>
    <ellipse cx="50" cy="42" rx="9" ry="7" fill="#7fb38a"/>
    <circle cx="33" cy="62" r="2.2" fill="#2e5c3c"/><circle cx="58" cy="66" r="2.2" fill="#2e5c3c"/>
    <circle cx="46" cy="68" r="2" fill="#2e5c3c"/>
  </svg>`,
  brusselish: `<svg viewBox="0 0 100 100">
    <rect x="45" y="56" width="10" height="24" rx="4.5" fill="#c2d49a"/>
    <rect x="45" y="56" width="4" height="24" rx="2" fill="#d8e4b6"/>
    <circle cx="37" cy="50" r="12.5" fill="#3f7a52"/>
    <circle cx="59" cy="48" r="13.5" fill="#46835a"/>
    <circle cx="48" cy="39" r="12" fill="#549066"/>
    <circle cx="43" cy="46" r="4" fill="#6fa77c"/><circle cx="56" cy="42" r="4" fill="#6fa77c"/>
  </svg>`,
  onion: `<svg viewBox="0 0 100 100">
    <g stroke="#6fae5c" stroke-width="3.4" fill="none" stroke-linecap="round">
      <path d="M46,66 Q44,44 40,34"/><path d="M52,66 Q52,40 52,30"/><path d="M58,66 Q62,44 66,36"/>
    </g>
    <circle cx="51" cy="76" r="13" fill="#d9a455"/>
    <circle cx="46.5" cy="71.5" r="4.5" fill="#ecc183"/>
    <path d="M51,63 q-4,13 0,26 q3.5,-13 0,-26 Z" fill="#b3792f"/>
  </svg>`,
  wintergreen: `<svg viewBox="0 0 100 100">
    <ellipse cx="50" cy="64" rx="25" ry="15" fill="#46735a"/>
    <ellipse cx="43" cy="56" rx="13" ry="8.5" fill="#5d8a6c"/>
    <ellipse cx="59" cy="54" rx="9.5" ry="6.5" fill="#74a182"/>
    <ellipse cx="50" cy="48" rx="6.5" ry="4.5" fill="#9dc0a8"/>
  </svg>`,
};

function svgFence(horizontal) {
  return horizontal
    ? `<svg viewBox="0 0 100 100" overflow="visible">
        <ellipse cx="50" cy="84" rx="46" ry="4" fill="rgba(46,62,33,.16)"/>
        <rect x="0" y="37" width="100" height="9" rx="4.5" fill="#c99a6c"/>
        <rect x="0" y="42" width="100" height="4" rx="2" fill="#a4794e"/>
        <rect x="0" y="58" width="100" height="9" rx="4.5" fill="#c99a6c"/>
        <rect x="0" y="63" width="100" height="4" rx="2" fill="#a4794e"/>
        <rect x="13" y="25" width="12" height="56" rx="5" fill="#ab7a4a"/>
        <rect x="13" y="25" width="5" height="56" rx="2.5" fill="#c99e6e"/>
        <rect x="74" y="25" width="12" height="56" rx="5" fill="#ab7a4a"/>
        <rect x="74" y="25" width="5" height="56" rx="2.5" fill="#c99e6e"/>
      </svg>`
    : `<svg viewBox="0 0 100 100" overflow="visible">
        <ellipse cx="50" cy="92" rx="30" ry="4" fill="rgba(46,62,33,.16)"/>
        <rect x="37" y="0" width="9" height="100" rx="4.5" fill="#c99a6c"/>
        <rect x="42" y="0" width="4" height="100" rx="2" fill="#a4794e"/>
        <rect x="58" y="0" width="9" height="100" rx="4.5" fill="#c99a6c"/>
        <rect x="63" y="0" width="4" height="100" rx="2" fill="#a4794e"/>
        <rect x="25" y="13" width="56" height="12" rx="5" fill="#ab7a4a"/>
        <rect x="25" y="13" width="56" height="5" rx="2.5" fill="#c99e6e"/>
        <rect x="25" y="74" width="56" height="12" rx="5" fill="#ab7a4a"/>
        <rect x="25" y="74" width="56" height="5" rx="2.5" fill="#c99e6e"/>
      </svg>`;
}

const SVG_BARREL = `
<svg viewBox="0 0 100 100" class="barrel-art">
  <ellipse cx="50" cy="90" rx="29" ry="5" fill="rgba(46,62,33,.22)"/>
  <path d="M26,24 C20,52 21,70 30,86 a38 11 0 0 0 40 0 C79,70 80,52 74,24" fill="#a8703f"/>
  <path d="M26,24 C20,52 21,70 30,86 a38 11 0 0 0 12 4 C32,72 30,48 33,24 Z" fill="#bf8650"/>
  <path d="M23.5,46 L76.5,46 L76,52 L24,52 Z" fill="#7c5733"/>
  <path d="M25,66 L75,66 L74.4,72 L25.6,72 Z" fill="#7c5733"/>
  <ellipse cx="50" cy="24" rx="24" ry="9" fill="#8fc0d6"/>
  <ellipse cx="50" cy="23" rx="24" ry="8" fill="#a9d2e2"/>
  <ellipse cx="43" cy="21.5" rx="8" ry="3" fill="#d6ecf4"/>
</svg>`;

// The same barrel left out in a winter yard: frosty wood, the water a
// cracked ice sheet, icicles off the rim. Pure consequence-art — the
// shovel refunds fully, so discovering this costs nothing.
const SVG_BARREL_ICE = `
<svg viewBox="0 0 100 100" class="barrel-art">
  <ellipse cx="50" cy="90" rx="29" ry="5" fill="rgba(46,62,33,.22)"/>
  <path d="M26,24 C20,52 21,70 30,86 a38 11 0 0 0 40 0 C79,70 80,52 74,24" fill="#9b8261"/>
  <path d="M26,24 C20,52 21,70 30,86 a38 11 0 0 0 12 4 C32,72 30,48 33,24 Z" fill="#b09574"/>
  <path d="M23.5,46 L76.5,46 L76,52 L24,52 Z" fill="#75634d"/>
  <path d="M25,66 L75,66 L74.4,72 L25.6,72 Z" fill="#75634d"/>
  <ellipse cx="50" cy="24" rx="24" ry="9" fill="#cfe7f0"/>
  <ellipse cx="50" cy="23" rx="24" ry="8" fill="#e8f5fa"/>
  <path d="M33,22 L45,25 L42,20.5 L57,24 L54,19.5 L66,22.5" stroke="#a8cddc" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M34,30 l2.5,10 l2.5,-9 Z" fill="#d8edf5"/>
  <path d="M47,31 l2,6.5 l2,-6 Z" fill="#e8f5fa"/>
  <path d="M62,30.5 l2.2,8.5 l2.3,-8 Z" fill="#d8edf5"/>
  <ellipse cx="41" cy="20.5" rx="9" ry="3" fill="#ffffff" opacity=".9"/>
  <ellipse cx="38" cy="47.5" rx="10" ry="2.4" fill="#ffffff" opacity=".75"/>
</svg>`;

// Greenhouse: a plan-view glass roof you garden through — white frame,
// near-transparent panes (the crops beneath ARE the picture), a snowy
// ridge along the long axis, diagonal shine. Any 2x2/2x3 footprint.
function svgGreenhouse(w, h) {
  const Wp = w * 100, Hp = h * 100;
  const horiz = w >= h;                       // ridge runs the long way
  const L = horiz ? Wp : Hp, C = horiz ? Hp : Wp, mid = C / 2;
  const pt = (a, c) => horiz ? `${a},${c}` : `${c},${a}`; // along,across -> x,y
  let mull = ""; // glazing bars, perpendicular to the ridge
  for (let a = 50; a <= L - 50; a += 50)
    mull += `M${pt(a, 16)} L${pt(a, C - 16)} `;
  // lumpy snow band sitting on the ridge
  let a = 18, k = 0, snow = `M${pt(18, mid - 3)}`;
  while (a + 36 <= L - 18) { snow += ` q${pt(18, k % 2 ? -8 : -12)} ${pt(36, 0)}`; a += 36; k++; }
  snow += ` L${pt(a, mid + 4)} L${pt(18, mid + 4)} Z`;
  const ridge = horiz
    ? `<rect x="12" y="${mid - 6}" width="${Wp - 24}" height="12" rx="6" fill="#eef5f6"/>
       <rect x="12" y="${mid - 6}" width="${Wp - 24}" height="5" rx="2.5" fill="#fdfefe"/>`
    : `<rect x="${mid - 6}" y="12" width="12" height="${Hp - 24}" rx="6" fill="#eef5f6"/>
       <rect x="${mid - 6}" y="12" width="5" height="${Hp - 24}" rx="2.5" fill="#fdfefe"/>`;
  const panes = horiz // the half facing the light reads a touch lighter
    ? `<rect x="10" y="10" width="${Wp - 20}" height="${mid - 10}" fill="#d8edf6" opacity=".28"/>
       <rect x="10" y="${mid}" width="${Wp - 20}" height="${Hp - mid - 10}" fill="#9fcfe2" opacity=".32"/>`
    : `<rect x="10" y="10" width="${mid - 10}" height="${Hp - 20}" fill="#d8edf6" opacity=".28"/>
       <rect x="${mid}" y="10" width="${Wp - mid - 10}" height="${Hp - 20}" fill="#9fcfe2" opacity=".32"/>`;
  return `<svg viewBox="0 0 ${Wp} ${Hp}" overflow="visible">
    <ellipse cx="${Wp / 2}" cy="${Hp - 4}" rx="${Wp / 2 - 8}" ry="6" fill="rgba(46,62,33,.18)"/>
    <defs><clipPath id="gh-pane"><rect x="10" y="10" width="${Wp - 20}" height="${Hp - 20}" rx="8"/></clipPath></defs>
    ${panes}
    <g clip-path="url(#gh-pane)" stroke="#ffffff" stroke-linecap="round" fill="none">
      <path d="M${Wp * 0.62},-20 L${Wp * 0.62 - Hp - 40},${Hp + 20}" stroke-width="18" opacity=".20"/>
      <path d="M${Wp * 0.80},-20 L${Wp * 0.80 - Hp - 40},${Hp + 20}" stroke-width="7" opacity=".24"/>
    </g>
    <path d="${mull}" stroke="#f4f9fa" stroke-width="3" opacity=".8" fill="none"/>
    ${ridge}
    <path d="${snow}" fill="#ffffff" opacity=".96"/>
    <rect x="6" y="6" width="${Wp - 12}" height="${Hp - 12}" rx="11" fill="none" stroke="#c9dde2" stroke-width="11"/>
    <rect x="6" y="6" width="${Wp - 12}" height="${Hp - 12}" rx="11" fill="none" stroke="#eff6f7" stroke-width="7"/>
    <ellipse cx="${Wp - 28}" cy="8" rx="16" ry="5" fill="#ffffff" opacity=".9"/>
    <ellipse cx="26" cy="${Hp - 8}" rx="13" ry="4.5" fill="#ffffff" opacity=".85"/>
  </svg>`;
}

function renderScene() {
  const winter = state.season === "winter";
  const at = (x, y, sw, sh, svg, cls = "") =>
    `<div class="structure ${cls}" style="grid-area:${y + 1} / ${x + 1} / span ${sh} / span ${sw}">${svg}</div>`;
  const kind = (x, y) =>
    x >= 0 && x < W && y >= 0 && y < H ? state.grid[y][x].obstacle : null;

  const parts = [];
  const houses = [], garages = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = state.grid[y][x].obstacle;
      const flip = (x + y) % 2 ? " flip" : "";
      if (k === "house") houses.push([x, y]);
      else if (k === "garage") garages.push([x, y]);
      else if (k === "tree") parts.push(!winter && BOARD_ART
        ? at(x, y, 1, 1, `<img src="assets/Leafy Round Garden Tree.jpg" alt="tree">`, "s-tree art" + flip)
        : at(x, y, 1, 1, winter ? SVG_EVERGREEN : SVG_TREE, "s-tree"));
      else if (k === "fence") {
        const horiz = kind(x - 1, y) === "fence" || kind(x + 1, y) === "fence" || (kind(x, y - 1) !== "fence" && kind(x, y + 1) !== "fence");
        parts.push(!winter && BOARD_ART
          ? at(x, y, 1, 1, `<img src="assets/Wooden Fence Section.png" alt="fence">`, "art" + flip)
          : at(x, y, 1, 1, svgFence(horiz)));
      }
    }

  // the 2x2 core renders as one cottage; leftover house cells become huts
  const isHouse = (x, y) => houses.some(([hx, hy]) => hx === x && hy === y);
  let core = null;
  for (const [x, y] of houses)
    if (!core && isHouse(x + 1, y) && isHouse(x, y + 1) && isHouse(x + 1, y + 1)) core = [x, y];
  if (core) parts.push(!winter && BOARD_ART
    ? at(core[0], core[1], 2, 2, `<img src="assets/Cottage.jpg" alt="cottage">`, "s-house art")
    : at(core[0], core[1], 2, 2, SVG_HOUSE, "s-house"));
  for (const [x, y] of houses) {
    const inCore = core && x >= core[0] && x <= core[0] + 1 && y >= core[1] && y <= core[1] + 1;
    if (!inCore) parts.push(at(x, y, 1, 1, SVG_HUT));
  }

  // garages come as an adjacent pair; span them with one annex whose
  // doors always face AWAY from the house
  if (garages.length === 2) {
    const [[x1, y1], [x2, y2]] = garages;
    const horiz = y1 === y2;
    const gx = Math.min(x1, x2), gy = Math.min(y1, y2);
    let cls = "";
    if (core) {
      if (horiz && core[1] > gy) cls = "gflipy";  // house below: doors point up/out
      if (!horiz && core[0] > gx) cls = "gflipx"; // house right: doors point left/out
    }
    parts.push(at(gx, gy, horiz ? 2 : 1, horiz ? 1 : 2, svgGarage(horiz), cls));
  } else for (const [x, y] of garages) parts.push(at(x, y, 1, 1, svgGarage(true)));

  // the glasshouse spans its interior tiles (winter boards only); painted
  // last so its panes wash over whatever grows beneath them
  let g0 = null, g1 = null;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (state.grid[y][x].inside) { if (!g0) g0 = [x, y]; g1 = [x, y]; }
  if (g0) {
    const gw = g1[0] - g0[0] + 1, gh = g1[1] - g0[1] + 1;
    parts.push(at(g0[0], g0[1], gw, gh, svgGreenhouse(gw, gh), "s-glass"));
  }

  return `<div class="scene" style="grid-template-columns:repeat(${W},1fr);grid-template-rows:repeat(${H},1fr)">${parts.join("")}</div>`;
}

/* ---------- DOM rendering ---------- */

const $ = sel => document.querySelector(sel);
const boardEl = $("#board");

function renderAll() {
  applyHardMode(); // body class first: badges render under its CSS
  renderHeader();
  renderBoard();
  renderPacket();
  renderWater();
  renderTools();
  tutorialRefresh(); // re-renders wipe the highlight; re-anchor the callout
}

function renderHeader() {
  const meta = SEASON_META[state.season];
  const badge = $("#season-badge");
  badge.innerHTML = `${meta.name} ${em(meta.icon)}`;
  badge.className = "season-badge " + meta.cls;
  // the date sits beside the plot number — "one puzzle a day" made visible
  const date = state.dayNum > 0
    ? ` · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : "";
  $("#day-label").textContent = state.seedLabel + date;
  $("#arc-label").innerHTML = `${em("1f31e")} ` + SUN_ARCS[state.sunArc].label;
  boardEl.classList.toggle("winter", state.season === "winter");
}

function renderBoard() {
  boardEl.style.gridTemplateColumns = `repeat(${W}, 1fr)`;
  boardEl.innerHTML = "";
  boardEl.classList.toggle("resolved", state.resolved);

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const cell = state.grid[y][x];
      const t = document.createElement("div");
      t.className = "tile";
      if (cell.inside) t.classList.add("inside");
      t.dataset.x = x; t.dataset.y = y;
      t.dataset.sun = state.sun[y][x];

      for (const ph of state.shadePhases[y][x]) t.classList.add("shade-" + ph);
      t.insertAdjacentHTML("beforeend", `<div class="veil"></div>`);
      const gset = state.ghostPhases[y][x];
      if (gset.size && !cell.obstacle) {
        for (const ph of gset) t.classList.add("ghost-" + ph);
        t.classList.add("ghost-any");
        t.insertAdjacentHTML("beforeend", `<div class="gveil"></div>`);
      }

      if (cell.obstacle) {
        t.classList.add("obstacle"); // drawn by the scene layer
      } else {
        const pips = PHASES.map((_, i) =>
          `<span class="pip ${i < state.sun[y][x] ? "" : "off"}"></span>`).join("");
        t.insertAdjacentHTML("beforeend", `<span class="pips">${pips}</span>`);

        if (cell.barrel) {
          const frozen = barrelFrozen(x, y);
          t.insertAdjacentHTML("beforeend", frozen ? SVG_BARREL_ICE : (BOARD_ART
            ? `<img class="crop-art" src="assets/Wooden Water Barrel.jpg" alt="rain barrel">`
            : SVG_BARREL));
          t.title = frozen
            ? "Frozen solid — barrels need shelter in winter.\nDig it up (full refund) and try it under glass."
            : "Rain barrel: adjacent plants cost 1 less water.\nDigging it up un-waters its discounted neighbors.";
        } else if (cell.plant) {
          const status = plantStatus(x, y);
          const net = companionBonus(x, y);
          t.classList.add("status-" + status, "tilled");
          const art = BOARD_ART ? CROP_ART[cell.plant.def.id] : null;
          const sprite = (SPRITE_CROPS || SPRITE_OVERRIDES.has(cell.plant.def.id))
            ? CROP_SVGS[cell.plant.def.id] : null;
          if (art) {
            t.classList.add("has-art");
            const flip = (x + y) % 2 ? " flip" : "";
            t.insertAdjacentHTML("beforeend",
              `<img class="crop-art${cell.plant.def.tall ? " tall-art" : ""}${flip}" src="assets/${art}" alt="${cell.plant.def.name}">`);
          } else if (sprite) {
            const flip = (x + y) % 2 ? " flip" : "";
            t.insertAdjacentHTML("beforeend",
              `<span class="crop-svg${cell.plant.def.tall ? " tallc" : ""}${flip}">${sprite}</span>`);
          } else if (EMOJI_ART[cell.plant.def.id]) {
            t.insertAdjacentHTML("beforeend",
              `<img class="crop" src="assets/emoji/${EMOJI_ART[cell.plant.def.id]}.svg" alt="${cell.plant.def.name}">`);
          } else {
            t.insertAdjacentHTML("beforeend", `<span class="crop">${cell.plant.def.emoji}</span>`);
          }
          if (cell.plant.watered)
            t.insertAdjacentHTML("beforeend", `<span class="drop-badge">${em("1f4a7")}</span>`);
          // bare ♥/⚠ marks adjacency in play; the points badge carries the math
          let chipNote = "";
          if (cell.plant.watered && net !== 0) {
            t.insertAdjacentHTML("beforeend",
              `<span class="friend-badge${net < 0 ? " foe" : ""}">${net > 0 ? "♥" : "⚠"}</span>`);
            chipNote = ` · ${net > 0 ? "♥ +" + net : "⚠ " + net + " (bad neighbors)"}`;
          } else if (!cell.plant.watered) {
            const pot = potentialBonus(x, y);
            if (pot !== 0) {
              t.insertAdjacentHTML("beforeend",
                `<span class="friend-badge ghost${pot < 0 ? " foe" : ""}">${pot > 0 ? "♥" : "⚠"}</span>`);
              chipNote = ` · if watered: ${pot > 0 ? "♥ +" + pot : "⚠ " + pot}`;
            }
          }
          let zoneNote = "";
          if (nearBarrel(x, y)) {
            const missed = cell.plant.watered && cell.plant.paid >= cell.plant.def.water;
            // a thirsty plant that would drink for free says "free", not "−1":
            // the barrel discounts the chore, it doesn't do the chore for you
            // (new players read −1 + free water as "already watered")
            const free = !cell.plant.watered && waterCost(x, y, cell.plant.def) === 0;
            t.insertAdjacentHTML("beforeend",
              `<span class="zone-badge${missed ? " missed" : ""}">${free ? "free" : "−1"}</span>`);
            zoneNote = missed
              ? " · watered at full price! Re-water to use the barrel's −1💧"
              : free ? " · barrel: watering it is FREE — but it still needs the can"
              : " · barrel −1💧";
          }
          // live worth: real points when watered, projected when not
          const pts = pointsPreview(x, y);
          t.insertAdjacentHTML("beforeend",
            `<span class="pts-badge${cell.plant.watered ? "" : " ghost"}${pts === 0 ? " zero" : ""}">${pts}</span>`);
          const frozenPlant = frozenOut(x, y, cell.plant.def);
          t.title = `${cell.plant.def.name}: ${frozenPlant
              ? "frozen 🧊 — tender crops die outside in winter" : statusLabel(status)}` +
            (chipNote ? "\n" + chipNote.replace(/^ · /, "") : "") +
            (zoneNote ? "\n" + zoneNote.replace(/^ · /, "") : "");
        } else if (nearBarrel(x, y)) {
          t.insertAdjacentHTML("beforeend", `<span class="zone-badge">−1</span>`);
          t.title = `${state.sun[y][x]} sun${cell.inside ? " · under glass" : ""} · barrel −1💧 · click to plant`;
        } else {
          t.title = `${state.sun[y][x]} sun${cell.inside ? " · under glass — tender crops live here" : ""} · click to plant`;
        }
      }
      t.addEventListener("click", () => onTileClick(x, y));
      boardEl.appendChild(t);
    }
  boardEl.insertAdjacentHTML("beforeend", renderScene());
  updateTally();
}

// Running total on the board's shoulder. Speaks the badges' language:
// ghost (dashed) while anything is thirsty = "as planned, if watered";
// solid once every plant has its drink (or the day is done).
function updateTally() {
  const chip = $("#tally-chip");
  let sum = 0, plants = 0, thirsty = 0, need = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = state.grid[y][x].plant;
      if (!p) continue;
      plants++;
      if (!p.watered) { thirsty++; need += waterCost(x, y, p.def); }
      sum += state.resolved ? plantPoints(x, y) : pointsPreview(x, y);
    }
  chip.hidden = plants === 0;
  const ghost = !state.resolved && thirsty > 0;
  chip.classList.toggle("ghost", ghost);
  // The dashed tally reads "if everything gets watered" — and that "if"
  // must stay honest. When the plan outruns the can, say by how much;
  // never silently cap (choosing what goes thirsty is the player's call).
  const short = ghost ? Math.max(0, need - state.waterLeft) : 0;
  chip.classList.toggle("over", short > 0);
  chip.innerHTML = `${em("1f3c6")} ${sum}` +
    (short > 0 ? ` ${em("1f4a7")}−${short}` : "");
  chip.title = short > 0
    ? `If everything were watered… but watering the rest needs ${need}💧 and you have ${state.waterLeft}.\nSomething here goes thirsty — this number isn't reachable as planted.`
    : ghost ? "Your plan's worth, once everything placed is watered." : "";
}

function statusLabel(s) {
  return s === "thrive" ? "thriving 🌟" : s === "ok" ? "hanging on" : "doomed 💀";
}

function renderPacket() {
  const wrap = $("#packet");
  wrap.innerHTML = "";
  state.packet.forEach((slot, idx) => {
    const d = slot.def;
    const btn = document.createElement("button");
    btn.className = "seed-card";
    btn.dataset.crop = d.id; // lets the tutorial point at a specific card
    if (d.why) btn.title = d.why.replace(/\. /g, ".\n"); // one sentence per line
    if (state.selected?.type === "seed" && state.selected.idx === idx) btn.classList.add("is-selected");
    btn.disabled = slot.qty === 0 || state.resolved;
    const cropIcon = id => {
      const c = CATALOG[state.season].find(c => c.id === id);
      if (!c) return "";
      return EMOJI_ART[c.id] ? em(EMOJI_ART[c.id]) : c.emoji;
    };
    const friendArt = d.friends.map(cropIcon).join("");
    const treeArt = d.lovesTrees ? em(state.season === "winter" ? "1f332" : "1f333") : "";
    const hearts = friendArt + treeArt;
    const foes = (d.enemies || []).map(cropIcon).join("");
    const bits = [`${em("2600")}${"●".repeat(d.sun) || "–"}`, `${em("1f4a7")}${d.water}`, `${em("1f3c6")}${d.pts}`];
    if (hearts) bits.push(`♥${hearts}`);
    if (foes) bits.push(`${em("1f6ab")}${foes}`);
    if (d.tall) bits.push(`TALL`);
    if (d.tender) bits.push(`TENDER`);
    const cardFace = EMOJI_ART[d.id]
      ? `<span class="seed-emoji"><img class="eimg-card" src="assets/emoji/${EMOJI_ART[d.id]}.svg" alt=""></span>`
      : `<span class="seed-emoji">${d.emoji}</span>`;
    btn.innerHTML = `
      ${cardFace}
      <span>
        <span class="seed-name">${d.name}</span>
        <span class="seed-stats">${bits.map(b => `<span>${b}</span>`).join("")}</span>
      </span>
      <span class="seed-qty">×${slot.qty}</span>`;
    btn.addEventListener("click", () => {
      if (state.tutorial) { // scripted: only the asked-for seed, no deselect
        if (!tutExpect("seed", d.id)) return tutNudge();
        state.selected = { type: "seed", idx };
        renderPacket(); renderTools();
        tutAdvance();
        return;
      }
      state.selected = (state.selected?.type === "seed" && state.selected.idx === idx)
        ? null : { type: "seed", idx };
      renderPacket(); renderTools();
    });
    wrap.appendChild(btn);
  });
}

function renderWater() {
  const countEl = $("#water-count");
  const label = `${state.waterLeft}/${state.waterMax}`;
  if (countEl.textContent && countEl.textContent !== label) {
    countEl.classList.remove("bump"); // restart the animation on rapid spends
    void countEl.offsetWidth;
    countEl.classList.add("bump");
  }
  countEl.textContent = label;
  const wrap = $("#water-pips");
  wrap.innerHTML = "";
  for (let i = 0; i < state.waterMax; i++)
    wrap.insertAdjacentHTML("beforeend",
      `<span class="wpip ${i < state.waterLeft ? "" : "spent"}"></span>`);
}

function renderTools() {
  $("#tool-water").classList.toggle("is-selected", state.selected?.type === "water");
  $("#tool-shovel").classList.toggle("is-selected", state.selected?.type === "shovel");
  const barrel = $("#tool-barrel");
  barrel.classList.toggle("is-selected", state.selected?.type === "barrel");
  barrel.disabled = state.barrelStock === 0 || state.resolved;
  barrel.innerHTML = (state.barrelStock > 0
    ? `<span class="tool-face">${em("1f6e2")}<span class="long-label"> Rain barrel: ${em("1f4a7")}−1 for neighbors</span></span>`
    : `<span class="tool-face">${em("1f6e2")}<span class="long-label"> Rain barrel</span> ✓</span>`)
    + `<small class="dock-label">barrel</small>`;
  const prune = $("#tool-prune");
  prune.classList.toggle("is-selected", state.selected?.type === "prune");
  prune.disabled = state.pruneStock === 0 || state.resolved;
  prune.innerHTML = (state.pruneStock > 0
    ? `<span class="tool-face">${em("1fa93")}<span class="long-label"> Prune</span></span>`
    : `<span class="tool-face">${em("1fa93")}<span class="long-label"> Pruned</span> ✓</span>`)
    + `<small class="dock-label">prune</small>`;
}

/* ---------- interactions ---------- */

// A dry watering can is information, not a dead button: shake the meter
// so a failed pour reads as "out of water," never "the game ignored me."
function waterDenied() {
  const m = document.querySelector(".water-meter");
  m.classList.remove("denied");
  void m.offsetWidth; // restart the animation on rapid retries
  m.classList.add("denied");
}

function onTileClick(x, y) {
  if (state.resolved) return;
  if (state.tutorial && !tutTileOk(x, y)) return tutNudge(); // scripted tile only
  const cell = state.grid[y][x];
  const sel = state.selected;
  if (!sel) return;
  if (cell.obstacle && sel.type !== "prune") return;

  if (sel.type === "prune") {
    if (state.pruneStock === 0) return;
    if (cell.obstacle !== "tree" && cell.obstacle !== "fence") return;
    cell.obstacle = null;
    state.pruneStock--;
    state.selected = null;
    recomputeSun();
    sfx("chop");
    renderAll();
    tutAdvance();
  } else if (sel.type === "barrel" && !cell.plant && !cell.barrel) {
    if (state.barrelStock === 0) return;
    cell.barrel = true;
    state.barrelStock--;
    state.selected = null;
    sfx("barrel");
    renderAll();
    tutAdvance();
  } else if (sel.type === "seed" && !cell.plant && !cell.barrel) {
    const slot = state.packet[sel.idx];
    if (slot.qty === 0) return;
    slot.qty--;
    cell.plant = { def: slot.def, watered: false };
    if (slot.def.tall) recomputeSun();
    if (slot.qty === 0) state.selected = null;
    sfx("plant");
    renderAll();
    tutAdvance();
  } else if (sel.type === "water" && cell.plant) {
    if (cell.plant.watered) {
      cell.plant.watered = false;
      state.waterLeft += cell.plant.paid; // paid is always set when watered (may be 0)
      cell.plant.paid = 0;
    } else {
      const cost = waterCost(x, y, cell.plant.def);
      if (state.waterLeft < cost) return waterDenied();
      cell.plant.watered = true;
      cell.plant.paid = cost;
      state.waterLeft -= cost;
      sfx("water");
    }
    if (cell.plant.def.tall) recomputeSun(); // watering a tall raises its shadow
    renderBoard(); renderWater();
    tutAdvance();
  } else if (sel.type === "shovel" && cell.barrel) {
    // removing the barrel un-waters neighbors that enjoyed its discount,
    // so the discount can't be farmed by re-placing the barrel elsewhere
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const n = state.grid[ny][nx];
      if (n.plant && n.plant.watered && n.plant.paid < n.plant.def.water) {
        state.waterLeft += n.plant.paid;
        n.plant.watered = false;
        n.plant.paid = 0;
        if (n.plant.def.tall) recomputeSun();
      }
    }
    cell.barrel = false;
    state.barrelStock++;
    sfx("dig");
    renderAll();
  } else if (sel.type === "shovel" && cell.plant) {
    const slot = state.packet.find(s => s.def === cell.plant.def);
    if (slot) slot.qty++;
    if (cell.plant.watered) state.waterLeft += cell.plant.paid;
    const wasTall = cell.plant.def.tall;
    cell.plant = null;
    if (wasTall) recomputeSun();
    sfx("dig");
    renderAll();
  }
}

/* ---------- sound: tiny synthesized garden noises ----------
   All Web Audio, no files: soft toy-like foley to match the storybook
   art (the watercolor lesson applies to ears too — style over realism).
   Every call site is a click handler, which satisfies autoplay rules.
   If the water sprinkle disappoints real ears, swap in one recorded
   sample for water only; keep the knocks and chimes synthesized. */

let audioCtx = null;
function ac() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone(ctx, { freq, type = "sine", t0, dur, vol, slideTo }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(ctx, { t0, dur, vol, filterType = "lowpass", filterFreq = 2000, q = 0.8, sweepTo }) {
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.setValueAtTime(filterFreq, t0);
  f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
}

function sfx(name) {
  if (state.muted) return;
  let ctx;
  try { ctx = ac(); } catch { return; } // no audio is never an error
  const t = ctx.currentTime;
  if (name === "plant") { // seed tucked into soil
    noise(ctx, { t0: t, dur: 0.08, vol: 0.22, filterFreq: 900 });
    tone(ctx, { freq: 130, t0: t, dur: 0.12, vol: 0.24, slideTo: 70 });
  } else if (name === "water") {
    // pure droplet bubble-chirps, no noise bed — any hiss layer reads
    // as static on phone speakers (user-tested, twice)
    for (let i = 0; i < 9; i++) {
      const at = t + 0.02 + Math.random() * 0.26;
      const f = 450 + Math.random() * 950;
      tone(ctx, { freq: f, t0: at, dur: 0.05 + Math.random() * 0.05, vol: 0.05 + Math.random() * 0.03, slideTo: f * 1.8 });
    }
  } else if (name === "dig") { // shovel scoop
    noise(ctx, { t0: t, dur: 0.14, vol: 0.2, filterFreq: 1400, sweepTo: 500 });
  } else if (name === "chop") { // axe bite
    noise(ctx, { t0: t, dur: 0.05, vol: 0.26, filterType: "highpass", filterFreq: 900 });
    tone(ctx, { freq: 180, type: "triangle", t0: t, dur: 0.09, vol: 0.26, slideTo: 90 });
  } else if (name === "barrel") { // wooden knock-knock
    tone(ctx, { freq: 160, type: "triangle", t0: t, dur: 0.07, vol: 0.28, slideTo: 120 });
    tone(ctx, { freq: 140, type: "triangle", t0: t + 0.09, dur: 0.09, vol: 0.24, slideTo: 100 });
  } else if (name === "finish") { // warm dusk chime
    [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.38]].forEach(([f, d]) =>
      tone(ctx, { freq: f, t0: t + d, dur: 0.5, vol: 0.11 }));
  }
}

function renderMute() {
  const btn = $("#mute-btn");
  btn.innerHTML = em(state.muted ? "1f507" : "1f50a");
  btn.title = state.muted ? "Sound is off" : "Sound is on";
}

$("#mute-btn").addEventListener("click", () => {
  state.muted = !state.muted;
  const s = loadStore();
  s.muted = state.muted;
  saveStore(s);
  renderMute();
  if (!state.muted) sfx("water"); // a little sprinkle says "you're back on"
});

// Themed stand-in for window.confirm — the tutorial's bookend cards use it
// too (with dismiss off, so a stray scrim tap can't skip the tour).
function gardenConfirm({ text, yes = "Do it", no = "Never mind", dismiss = true }) {
  return new Promise(resolve => {
    $("#confirm-text").textContent = text;
    $("#confirm-yes").textContent = yes;
    $("#confirm-no").textContent = no;
    const scrim = $("#confirm-scrim");
    const finish = val => { scrim.hidden = true; resolve(val); };
    $("#confirm-yes").onclick = () => finish(true);
    $("#confirm-no").onclick = () => finish(false);
    scrim.onclick = e => { if (dismiss && e.target === scrim) finish(false); };
    scrim.hidden = false;
  });
}

// One handler for every pick-up-a-tool button. In the tutorial only the
// scripted tool answers, and it can't be put back down mid-lesson.
function selectTool(name) {
  if (state.tutorial) {
    if (!tutExpect("tool", name)) return tutNudge();
    state.selected = { type: name };
    renderPacket(); renderTools();
    tutAdvance();
    return;
  }
  state.selected = state.selected?.type === name ? null : { type: name };
  renderPacket(); renderTools();
}

$("#tool-barrel").addEventListener("click", () => selectTool("barrel"));
$("#tool-reset").addEventListener("click", async () => {
  if (state.resolved) return;
  if (state.tutorial) return tutNudge();
  const touched = state.grid.flat().some(c => c.plant || c.barrel) || state.pruneStock === 0;
  if (!touched) return;
  const ok = await gardenConfirm({
    text: "Dig up the whole garden and start this board over?",
    yes: "Clear it",
  });
  if (!ok) return;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const cell = state.grid[y][x];
      if (cell.plant) {
        const slot = state.packet.find(s => s.def === cell.plant.def);
        if (slot) slot.qty++;
        cell.plant = null;
      }
      cell.barrel = false;
      cell.obstacle = state.baseObstacles[y][x]; // regrow anything pruned
    }
  state.barrelStock = 1;
  state.pruneStock = 1;
  state.waterLeft = state.waterMax;
  state.selected = null;
  recomputeSun();
  sfx("dig");
  renderAll();
});

$("#tool-water").addEventListener("click", () => selectTool("water"));
$("#tool-prune").addEventListener("click", () => selectTool("prune"));
$("#tool-shovel").addEventListener("click", () => selectTool("shovel"));

document.querySelectorAll(".phase-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".phase-btn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    boardEl.dataset.view = btn.dataset.view;
  });
});

/* ---------- finish & share ---------- */

$("#finish-btn").addEventListener("click", () => {
  if (playerSnap) { exitBotView(); return; } // never score the bot's garden as yours
  if (state.tutorial) { // the tutorial ends on its own card, not the results screen
    if (!tutExpect("finish")) return tutNudge();
    state.resolved = true;
    state.selected = null;
    sfx("finish");
    renderAll();
    tutAdvance();
    return;
  }
  if (state.isTutorialBoard) return tutEndCard(); // admiring: Finish re-offers the exits
  if (state.resolved) { showResults(); return; } // restored locked days repopulate too
  state.resolved = true;
  state.selected = null;
  sfx("finish");
  if (!DEV_MODE && state.dayNum > 0 && !todayEntry()) lockDaily(); // one scored attempt per day
  renderAll();
  showResults();
});

/* ---------- ribbons: horticulture-show awards by skill ----------
   Real garden shows pin ribbons by placing: Best in Show rosette, then
   blue / red / white, with yellow as honorable mention. Skill (% of
   Gold) is already in every ledger entry, so the future calendar can
   award all past days retroactively. */

// art = bundled SVG in assets/emoji/ (drawn in the game's hand, same set
// as the shovel & watering can — regenerate via the palette in git log).
// emoji = the share-TEXT stand-in: text can only carry real unicode that
// every platform's own font renders, so friends see the tier color there.
const RIBBONS = {
  rosette: { name: "Best in Show", emoji: "🏵️", art: "ribbon-rosette" },
  blue:    { name: "Blue Ribbon",  emoji: "🔵", art: "ribbon-blue" },
  red:     { name: "Red Ribbon",   emoji: "🔴", art: "ribbon-red" },
  white:   { name: "White Ribbon", emoji: "⚪", art: "ribbon-white" },
  yellow:  { name: "Honorable Mention", emoji: "🟡", art: "ribbon-yellow" },
};

function ribbonFor(score, gold) {
  if (score >= gold) return RIBBONS.rosette; // matched or beat the bot
  const skill = Math.round((100 * score) / gold);
  if (skill >= 90) return RIBBONS.blue;
  if (skill >= 75) return RIBBONS.red;
  if (skill >= 60) return RIBBONS.white;
  if (skill >= 45) return RIBBONS.yellow;
  return null; // the judges walked past
}

function ribbonImg(rb) {
  return `<img class="ribbon-svg" src="assets/emoji/${rb.art}.svg" alt="">`;
}

function showResults() {
  const score = totalScore();
  let thrive = 0, ok = 0, dead = 0, hearts = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (state.grid[y][x].plant) {
        const s = plantStatus(x, y);
        if (s === "thrive") thrive++; else if (s === "ok") ok++; else dead++;
        hearts += companionBonus(x, y);
      }

  $("#final-score").textContent = score;
  $("#par-score").textContent = state.par;
  $("#par-verdict").innerHTML =
    score > state.par ? `Beat it! ${em("1f31f")}` : score === state.par ? "Matched!" : "";
  refreshGoldUI();
  const unplanted = state.packet.reduce((n, s) => n + s.qty, 0);
  const tallyRow2 = [
    ...(hearts ? [`♥ +${hearts} companions`] : []),
    ...(unplanted ? [`${em("1f330")} ${unplanted} seeds unplanted`] : []),
  ];
  $("#results-tally").innerHTML =
    `<div>${em("1f31f")} ${thrive} thriving · ${em("1f605")} ${ok} hanging on · ${em("1f480")} ${dead} lost</div>` +
    (tallyRow2.length ? `<div>${tallyRow2.join(" · ")}</div>` : "");
  $("#replay-btn").hidden = state.dayNum === 0; // replays/practice can't re-replay
  // practice & replay results offer the way home — finishing a replay was
  // a dead end (the only exit was knowing the Today button existed)
  $("#today-return-btn").hidden = state.dayNum !== 0;
  const streakEl = $("#streak-line");
  if (state.dayNum > 0) {
    const led = loadStore().ledger;
    streakEl.innerHTML = `${em("1f525")} ${currentStreak()}-day streak · ${em("1f4da")} ${led.length} ${led.length === 1 ? "plot" : "plots"} grown`;
    streakEl.hidden = false;
  } else streakEl.hidden = true;
  $("#results-scrim").hidden = false;
}

function refreshGoldUI() {
  const score = totalScore();
  $("#gold-score").textContent = state.gold;
  $("#skill-line").innerHTML =
    score > state.gold ? `${em("1f3c6")} You beat the bot!` :
    score === state.gold ? `${em("1f3c5")} Matched the bot's best!` :
    `Skill ${Math.round((100 * score) / state.gold)}`;
  const rb = ribbonFor(score, state.gold);
  const ribbonLine = $("#ribbon-line");
  ribbonLine.hidden = !rb;
  if (rb) ribbonLine.innerHTML = ribbonImg(rb) + `<span class="ribbon-name">${rb.name}</span>`;
  $("#bot-btn").disabled = !state.goldLayout;
  state.lastShare = buildShareText(score); // raw text for the clipboard
  const headLines = ribbonFor(score, state.gold) ? 3 : 2; // everything above the grid
  $("#share-head").textContent = state.lastShare.split("\n").slice(0, headLines).join("\n");
  $("#share-grid").innerHTML = shareGridCells()
    .map(r => `<div class="sg-row">${r.map(c => `<span>${c}</span>`).join("")}</div>`)
    .join("");
}

// one emoji per tile, shared by the clipboard text and the visual preview
function shareGridCells() {
  const spoilerSafe = state.isDailyBoard;
  const rows = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      const c = state.grid[y][x];
      const empty = state.sun[y][x] >= 2 ? "🟨" : "🟩";
      if (c.obstacle) row.push(shareArt(c.obstacle));
      else if (c.plant) {
        const s = plantStatus(x, y);
        row.push(spoilerSafe
          ? (s === "thrive" ? "🌸" : s === "ok" ? "🌼" : "🥀")
          : (s === "dead" ? "🥀" : c.plant.def.emoji));
      }
      // masked barrel poses as a bloom: the tile reads "used," not "empty,"
      // without telling friends where the discount lived (a frozen one may
      // as well say so — it did nothing worth hiding)
      else if (c.barrel) row.push(spoilerSafe ? "🌼" : (barrelFrozen(x, y) ? "🧊" : "🛢️"));
      // empty greenhouse tiles read as glass; planted ones show their crop
      // like anywhere else — the structure itself is public board geometry
      else if (c.inside) row.push("🪟");
      else row.push(empty);
    }
    rows.push(row);
  }
  return rows;
}

function buildShareText(score) {
  const meta = SEASON_META[state.season];
  // The daily share is spoiler-safe (blooms, not crop identities) — see
  // shareGridCells. Practice plots are random, so they share full detail.
  const grid = shareGridCells().map(r => r.join("")).join("\n");
  const skill = score > state.gold ? "BEAT GOLD 🏆" : `Skill ${Math.round((100 * score) / state.gold)}`;
  // dated like Wordle; the streak stays on your own results screen — shares
  // shouldn't make streakless friends feel behind
  const date = state.dayNum > 0
    ? ` · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : "";
  // no Gold/Par line: skill already encodes the benchmark, and to friends
  // it was just extra text (the results screen keeps the private ladder)
  const rb = ribbonFor(score, state.gold);
  const ribbonLine = rb ? `${rb.emoji} ${rb.name}\n` : "";
  // 🎓 marks a score earned without the math badges — a locked daily reads
  // the mode it was locked under, a practice share reads the live setting
  const hard = state.dayNum > 0 ? !!(todayEntry() || {}).hard : !!loadStore().hardMode;
  return `${state.seedLabel} · ${meta.label}${date}\n🏆 ${score} pts · ${skill}${hard ? " · 🎓 hard" : ""}\n${ribbonLine}${grid}\n`;
}

$("#copy-btn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.lastShare || buildShareText(totalScore()));
    $("#copy-btn").textContent = "✅ Copied!";
    setTimeout(() => ($("#copy-btn").textContent = "📋 Copy result"), 1500);
  } catch { /* clipboard blocked on file:// in some browsers; text is selectable */ }
});

// the system share sheet where it exists (phones, mostly); Copy demotes
// to the secondary spot. Elsewhere Copy stays the primary verb.
if (navigator.share) {
  $("#share-btn").hidden = false;
  $("#copy-btn").classList.replace("finish-btn", "tool-btn");
  $("#share-btn").addEventListener("click", () => {
    navigator.share({ text: state.lastShare || buildShareText(totalScore()) })
      .catch(() => { /* user closed the sheet */ });
  });
}

/* ---------- bot garden reveal (post-game post-mortem) ---------- */

let playerSnap = null;

function enterBotView() {
  const L = state.goldLayout;
  if (!L) return;
  playerSnap = {
    cells: state.grid.map(row => row.map(c => ({ obstacle: c.obstacle, plant: c.plant, barrel: c.barrel }))),
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = state.grid[y][x];
      c.obstacle = state.baseObstacles[y][x];
      c.plant = null;
      c.barrel = false;
    }
  if (L.pruned >= 0)
    state.grid[(L.pruned / W) | 0][L.pruned % W].obstacle = null;
  if (L.barrelPos >= 0)
    state.grid[(L.barrelPos / W) | 0][L.barrelPos % W].barrel = true;
  for (let i = 0; i < W * H; i++) {
    if (L.plant[i] < 0) continue;
    const x = i % W, y = (i / W) | 0;
    const def = L.defs[L.plant[i]];
    state.grid[y][x].plant = { def, watered: true, paid: 0 };
  }
  // price each plant as the bot would have paid (display only)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (state.grid[y][x].plant)
        state.grid[y][x].plant.paid = waterCost(x, y, state.grid[y][x].plant.def);
  recomputeSun();
  $("#results-scrim").hidden = true;
  const b = $("#bot-banner");
  b.innerHTML = `${em("1f916")} The bot's garden · ${state.gold} pts · tap to return`;
  b.hidden = false;
  renderBoard();
}

function exitBotView() {
  if (!playerSnap) return;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = state.grid[y][x], s = playerSnap.cells[y][x];
      c.obstacle = s.obstacle; c.plant = s.plant; c.barrel = s.barrel;
    }
  playerSnap = null;
  $("#bot-banner").hidden = true;
  recomputeSun();
  renderBoard();
  $("#results-scrim").hidden = false;
}

$("#bot-btn").addEventListener("click", enterBotView);
$("#bot-banner").addEventListener("click", exitBotView);

$("#results-x").addEventListener("click", () => { $("#results-scrim").hidden = true; });
$("#again-btn").addEventListener("click", () => {
  $("#results-scrim").hidden = true;
  newGame({ daily: false });
});
$("#replay-btn").addEventListener("click", () => {
  $("#results-scrim").hidden = true;
  newGame({ daily: true, replay: true });
});
$("#today-return-btn").addEventListener("click", () => {
  $("#results-scrim").hidden = true;
  newGame({ daily: true }); // restores a locked daily read-only
});

/* ---------- practice / dev buttons ---------- */

document.querySelectorAll(".dev-btn[data-season]").forEach(btn =>
  btn.addEventListener("click", () => {
    if (state.tutorial) return tutNudge(); // mid-lesson, the exit is the skip link
    newGame({ daily: false, season: btn.dataset.season });
  }));
$("#random-btn").addEventListener("click", () => {
  if (state.tutorial) return tutNudge();
  newGame({ daily: false });
});
$("#today-btn").addEventListener("click", () => {
  if (state.tutorial) return tutNudge();
  newGame({ daily: true });
});

/* ---------- trophy cabinet: calendar, lifetime stats, first settings ----------
   Pure UI over the ledger — lockDaily stores raw facts precisely so all
   of this (ribbons for past days included) is derivable retroactively.
   The cabinet is also the game's first settings surface (hard mode). */

const plotDate = plot => new Date(EPOCH_Y, EPOCH_M, EPOCH_D + (plot - 1));
function todayPlot() {
  const t = new Date();
  const mid = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((mid - new Date(EPOCH_Y, EPOCH_M, EPOCH_D)) / 86400000) + 1;
}

let calCursor = { y: EPOCH_Y, m: EPOCH_M };

// Streaks independent of the board on screen (currentStreak needs a live
// daily). A not-yet-played today doesn't break the chain — Wordle rules.
function cabinetStreaks() {
  const plots = new Set(loadStore().ledger.map(e => e.plot));
  const tp = todayPlot();
  let cur = 0, d = plots.has(tp) ? tp : tp - 1;
  while (d > 0 && plots.has(d)) { cur++; d--; }
  let best = 0, run = 0;
  for (let p = 1; p <= tp; p++) { run = plots.has(p) ? run + 1 : 0; best = Math.max(best, run); }
  return { cur, best };
}

function renderCabinet() {
  const led = loadStore().ledger;
  const counts = {};
  let beaten = 0, skillSum = 0;
  for (const k in RIBBONS) counts[k] = 0;
  for (const e of led) {
    const rb = ribbonFor(e.score, e.gold);
    for (const k in RIBBONS) if (rb === RIBBONS[k]) counts[k]++;
    if (e.score > e.gold) beaten++;
    skillSum += e.skill;
  }
  $("#cabinet-shelf").innerHTML = Object.keys(RIBBONS).map(k =>
    `<span class="shelf-slot${counts[k] ? "" : " none"}" title="${RIBBONS[k].name}">${ribbonImg(RIBBONS[k])}<b>×${counts[k]}</b></span>`).join("");
  const stats = $("#cabinet-stats");
  if (!led.length) {
    stats.innerHTML = "The shelf is waiting — finish a daily plot and the ribbons start arriving.";
    return;
  }
  const { cur, best } = cabinetStreaks();
  stats.innerHTML =
    `<div>${em("1f4da")} ${led.length} ${led.length === 1 ? "plot" : "plots"} grown · ${em("1f525")} ${cur}-day streak${best > cur ? ` (best ${best})` : ""}</div>` +
    `<div>${em("1f3c5")} average skill ${Math.round(skillSum / led.length)} · ${em("1f916")} bot beaten ${beaten}×</div>`;
}

function renderCalendar() {
  const { y, m } = calCursor;
  $("#cal-title").textContent =
    new Date(y, m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const now = new Date();
  $("#cal-prev").disabled = y < EPOCH_Y || (y === EPOCH_Y && m <= EPOCH_M);
  $("#cal-next").disabled = y > now.getFullYear() ||
    (y === now.getFullYear() && m >= now.getMonth());

  const byPlot = new Map(loadStore().ledger.map(e => [e.plot, e]));
  const epoch = new Date(EPOCH_Y, EPOCH_M, EPOCH_D);
  const tp = todayPlot();
  // days before your first-ever garden aren't "missed" — they're before
  // your story starts (and before the game's: numbering predates launch)
  const firstPlot = byPlot.size ? Math.min(...byPlot.keys()) : tp;
  const startDow = new Date(y, m, 1).getDay();
  const daysIn = new Date(y, m + 1, 0).getDate();
  let html = "";
  for (let i = 0; i < startDow; i++) html += `<span class="cal-cell pad"></span>`;
  for (let d = 1; d <= daysIn; d++) {
    const plot = Math.round((new Date(y, m, d) - epoch) / 86400000) + 1;
    let cls = "cal-cell", body = `<i>${d}</i>`;
    if (plot < 1 || plot > tp) cls += " off"; // before Plot #1, or the future
    else {
      const e = byPlot.get(plot);
      if (e) {
        const rb = ribbonFor(e.score, e.gold);
        body += rb ? ribbonImg(rb) : em("1f331"); // sub-45 days still grew something
        cls += " played";
      } else if (plot === tp) { cls += " open"; body += `<span class="cal-dot"></span>`; }
      else if (plot < firstPlot) cls += " off";
      else cls += " missed";
    }
    if (plot === tp) cls += " today";
    html += `<button type="button" class="${cls}" data-plot="${plot}">${body}</button>`;
  }
  $("#cal-grid").innerHTML = html;
  $("#cal-grid").querySelectorAll("button[data-plot]").forEach(b =>
    b.addEventListener("click", () => showCalDetail(+b.dataset.plot)));
}

function showCalDetail(plot) {
  const box = $("#cal-detail");
  const tp = todayPlot();
  // the tapped day lights up leaf-green so the detail card below needs no
  // cross-referencing (today keeps its terracotta ring; selection wins)
  $("#cal-grid").querySelectorAll(".cal-cell.selected")
    .forEach(el => el.classList.remove("selected"));
  if (plot < 1 || plot > tp) { box.hidden = true; return; }
  $("#cal-grid").querySelector(`button[data-plot="${plot}"]`)?.classList.add("selected");
  const dateTxt = plotDate(plot).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const e = loadStore().ledger.find(x => x.plot === plot);
  if (!e) {
    const led = loadStore().ledger;
    const firstPlot = led.length ? Math.min(...led.map(x => x.plot)) : tp;
    box.innerHTML = plot === tp
      ? `<b>Plot #${plot} · ${dateTxt}:</b> today's plot is still waiting for its gardener.`
      : plot < firstPlot
        ? `<b>Plot #${plot} · ${dateTxt}:</b> before your garden began.`
        : `<b>Plot #${plot} · ${dateTxt}:</b> no garden grown this day.`;
  } else {
    const meta = SEASON_META[e.season];
    const rb = ribbonFor(e.score, e.gold);
    box.innerHTML =
      `<b>Plot #${e.plot} · ${dateTxt} · ${meta.name} ${em(meta.icon)}</b><br>` +
      `${em("1f3c6")} ${e.score} pts · skill ${e.skill}${e.hard ? " · 🎓 hard" : ""} · Par ${e.par} · Gold ${e.gold}` +
      (rb ? `<span class="cal-detail-ribbon">${ribbonImg(rb)}<b>${rb.name}</b></span>` : "");
  }
  box.hidden = false;
}

function calShift(delta) {
  let { y, m } = calCursor;
  m += delta;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  calCursor = { y, m };
  $("#cal-detail").hidden = true;
  renderCalendar();
}

$("#cabinet-btn").addEventListener("click", () => {
  if (state.tutorial) return tutNudge();
  const now = new Date();
  calCursor = { y: now.getFullYear(), m: now.getMonth() };
  $("#hardmode-toggle").checked = !!loadStore().hardMode;
  renderCabinet();
  renderCalendar();
  $("#cal-detail").hidden = true;
  $("#cabinet-scrim").hidden = false;
});
$("#cabinet-x").addEventListener("click", () => { $("#cabinet-scrim").hidden = true; });
$("#cal-prev").addEventListener("click", () => calShift(-1));
$("#cal-next").addEventListener("click", () => calShift(1));

/* hard mode: hide the math badges (points, hearts, −1, running tally);
   pips and status rings are board truth and always stay. The tutorial
   always renders fully instrumented — its lessons point at the badges. */
function applyHardMode() {
  const on = !!loadStore().hardMode && !state.tutorial && !state.isTutorialBoard;
  document.body.classList.toggle("hardmode", on);
}

$("#hardmode-toggle").addEventListener("change", ev => {
  const s = loadStore();
  s.hardMode = ev.target.checked;
  saveStore(s);
  renderAll();
});

/* ---------- first-visit guided tutorial ----------
   Teach by doing, on a hand-built scripted board — never the real daily,
   so learning can't spend anyone's one scored attempt. Each step
   highlights exactly one element (tile, seed card, or tool) with an
   anchored paper-card callout; every other action just nudges. The whole
   tour: core loop -> companions -> mushrooms & trees -> rain barrel ->
   prune -> finish. Skippable at any step, replayable from the footer. */

// 7x5 summer yard, "mid" sun arc. Hand-placed so the lessons line up:
// (4,1) full sun for the tomato, (4,2) 2-sun beside it for basil, (1,2) a
// 0-sun nook between two trees for the mushroom, (4,4) 1-sun beside the
// barrel spot (3,4) for lettuce, and the fence at (5,3) shades (6,3) —
// prune it and a full-sun corner opens for the last tomato.
const TUT_OBSTACLES = [ // [y][x]
  [null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null],
  ["tree", null, "tree", null, null, null, null],
  [null, "house", "house", null, null, "fence", null],
  [null, "house", "house", null, null, "fence", null],
];

// type "seed"/"tool": tap that card or button (selection is forced, no
// deselect). type "tile": tap tile (x,y) — the action comes from whatever
// the previous step put in hand. type "finish": the Finish button.
// type "look": nothing to do — spotlight an element (sel) and wait for
// the callout's own "Got it" button; everything else stays gated.
const TUT_STEPS = [
  { type: "seed", id: "tomato",
    text: `Every seed card shows the sun it needs. Tomatoes crave <b>full sun</b> — ${em("2600")}●●●. Tap the <b>tomato</b> to pick it up.` },
  { type: "tile", x: 4, y: 1,
    text: `See this tile's <b>3 sun pips</b>? Full sun all day — a perfect match. Tap it to plant your tomato.` },
  { type: "tool", id: "water",
    text: `<b>Water is life</b> — an unwatered plant wilts by sundown. Tap the <b>watering can</b>.` },
  { type: "tile", x: 4, y: 1,
    text: `Give the tomato a drink. Its card says ${em("1f4a7")}2, so it drinks 2 of your 6 water.` },
  { type: "look", sel: ".water-meter",
    text: `That drink came from your day's supply — see it? <b>4 of 6</b> left. There's never enough for everything, so spend it wisely.` },
  { type: "seed", id: "basil",
    text: `Thriving! 🌟 Now — crops have <b>friends</b>. Basil keeps the bugs off tomatoes. Tap the <b>basil</b>.` },
  { type: "tile", x: 4, y: 2,
    text: `Basil wants <b>2 sun</b>, and the tree shades this spot every afternoon — exactly 2 pips. (Peek with the <b>afternoon</b> button up top!) And its tomato friend is right next door.` },
  { type: "tool", id: "water",
    text: `You know the rhythm — watering can first.` },
  { type: "tile", x: 4, y: 2,
    text: `Water the basil (${em("1f4a7")}1) and watch the <b>♥</b> appear: friends side by side earn <b>+2 each</b>.` },
  { type: "seed", id: "mushroom",
    text: `Mushrooms are the odd ones out: they want <b>no sun at all</b>. Tap the <b>mushroom</b>.` },
  { type: "tile", x: 1, y: 2,
    text: `This nook between the trees never sees the sun — <b>0 pips</b>. Better still, mushrooms <b>love trees</b>: +2 for each one beside them.` },
  { type: "tool", id: "water",
    text: `Even mushrooms get thirsty.` },
  { type: "tile", x: 1, y: 2,
    text: `A little drink (${em("1f4a7")}1).` },
  { type: "tool", id: "barrel",
    text: `You get one <b>rain barrel</b> a day. Crops planted beside it cost <b>1 less ${em("1f4a7")}</b> to water. Tap the barrel.` },
  { type: "tile", x: 3, y: 4,
    text: `Set it down here — we'll plant its neighbor next.` },
  { type: "seed", id: "lettuce",
    text: `See the <b>−1</b> tags around the barrel? Anything planted there waters cheaper. Lettuce is easygoing — 1 sun, ${em("1f4a7")}1. Tap the <b>lettuce</b>.` },
  { type: "tile", x: 4, y: 4,
    text: `One pip of sun — just enough. And it's right beside the barrel…` },
  { type: "tool", id: "water",
    text: `The watering can again — lettuce is thirsty too.` },
  { type: "tile", x: 4, y: 4,
    text: `Now water it.` },
  { type: "look", sel: ".water-meter",
    text: `<b>Free!</b> Your supply didn't budge — still 2 of 6. That's the barrel: neighbors pay 1 less ${em("1f4a7")}.` },
  { type: "tool", id: "prune",
    text: `One last tool: the axe <b>fells a single tree or fence</b> each day to open up sun. (Spare the trees — mushrooms would miss them.) Tap <b>prune</b>.` },
  { type: "tile", x: 5, y: 3,
    text: `This fence shades the plot beside it all afternoon. Chop it down.` },
  { type: "seed", id: "tomato",
    text: `Look at that freed-up plot — <b>full sun</b> now. And you have one tomato left…` },
  { type: "tile", x: 6, y: 3,
    text: `Plant it in the sunshine you just made.` },
  { type: "tool", id: "water",
    text: `One last job for the watering can.` },
  { type: "tile", x: 6, y: 3,
    text: `Your final 2 ${em("1f4a7")} — a garden with nothing wasted.` },
  { type: "finish",
    text: `That's the whole craft: sun, water, friends, barrel, axe. Tap <b>Finish</b> to see how your garden grew.` },
];

function tutExpect(type, id) {
  const s = TUT_STEPS[state.tutorial.step];
  return s.type === type && (id === undefined || s.id === id);
}
function tutTileOk(x, y) {
  const s = TUT_STEPS[state.tutorial.step];
  return s.type === "tile" && s.x === x && s.y === y;
}
function tutTargetEl(s) {
  if (s.type === "seed") return document.querySelector(`#packet .seed-card[data-crop="${s.id}"]`);
  if (s.type === "tool") return $("#tool-" + s.id);
  if (s.type === "tile") return boardEl.querySelector(`.tile[data-x="${s.x}"][data-y="${s.y}"]`);
  if (s.type === "look") return document.querySelector(s.sel);
  return $("#finish-btn");
}

// a stray tap shakes the callout: "over here"
function tutNudge() {
  const pop = $("#tutor-pop");
  if (pop.hidden) return;
  pop.classList.remove("nudge");
  void pop.offsetWidth; // restart the animation
  pop.classList.add("nudge");
}

function tutAdvance() {
  if (!state.tutorial) return;
  state.tutorial.step++;
  if (state.tutorial.step >= TUT_STEPS.length) return tutComplete();
  tutorialRefresh();
}

function tutorialRefresh() {
  const pop = $("#tutor-pop");
  document.querySelectorAll(".tutor-target").forEach(el => el.classList.remove("tutor-target"));
  if (!state.tutorial) { pop.hidden = true; return; }
  const s = TUT_STEPS[state.tutorial.step];
  const el = tutTargetEl(s);
  if (!el) { pop.hidden = true; return; }
  el.classList.add("tutor-target");
  $("#tutor-text").innerHTML = s.text;
  $("#tutor-count").textContent = `${state.tutorial.step + 1} of ${TUT_STEPS.length}`;
  $("#tutor-next").hidden = s.type !== "look"; // look steps advance from the card itself
  pop.hidden = false;
  positionTutorPop();
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

// fixed-position callout beside its target, clamped to the viewport; the
// little arrow keeps pointing at the target even when the card is clamped
function positionTutorPop() {
  const pop = $("#tutor-pop");
  const el = document.querySelector(".tutor-target");
  if (pop.hidden || !el) return;
  const r = el.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 10;
  const above = r.top > innerHeight - r.bottom; // roomier side wins
  let top = above ? r.top - ph - gap : r.bottom + gap;
  const left = Math.max(8, Math.min(r.left + r.width / 2 - pw / 2, innerWidth - pw - 8));
  top = Math.max(8, Math.min(top, innerHeight - ph - 8));
  pop.style.top = top + "px";
  pop.style.left = left + "px";
  pop.classList.toggle("arrow-down", above);
  const ax = Math.max(16, Math.min(r.left + r.width / 2 - left, pw - 16));
  pop.style.setProperty("--arrow-x", ax + "px");
}
addEventListener("resize", positionTutorPop);
addEventListener("scroll", positionTutorPop, { passive: true });

function tutStoreDone() {
  const store = loadStore();
  store.tutorialDone = true;
  saveStore(store);
}

function tutSkip() {
  state.tutorial = null;
  tutStoreDone();
  tutorialRefresh();
  newGame({ daily: true });
}

function tutComplete() {
  state.tutorial = null;
  tutStoreDone();
  tutorialRefresh();
  tutEndCard();
}

// Also re-shown when Finish is tapped on the admired tutorial garden —
// the results screen would be a dead end (and its Par/Gold are fake here).
function tutEndCard() {
  gardenConfirm({
    text: `🌟 ${totalScore()} points — your first garden is in! Sun, water, friends, the barrel, the axe: that's the whole game. Out there it's one shared plot a day — the same garden for everyone.`,
    yes: "Play\ntoday's plot",
    no: "Admire\nthis one first",
    dismiss: false,
  }).then(go => { if (go) newGame({ daily: true }); });
}

function startTutorialBoard() {
  state.gameId = (state.gameId || 0) + 1; // cancel any pending gold refinement
  state.isDailyBoard = false;
  state.isTutorialBoard = true; // routes Finish back to the tutorial end card
  state.rng = mulberry32(hashStr("plotday:tutorial"));
  state.dayNum = 0; // practice rules: no lock, no streak
  state.seedLabel = "Tutorial garden";
  state.season = "summer";
  state.sunArc = "mid";
  state.grid = TUT_OBSTACLES.map(row =>
    row.map(o => ({ obstacle: o, plant: null, barrel: false })));
  state.baseObstacles = TUT_OBSTACLES.map(row => row.slice());
  const def = id => CATALOG.summer.find(d => d.id === id);
  state.packet = [ // lesson order; water budget spends to exactly zero
    { def: def("tomato"), qty: 2 },
    { def: def("basil"), qty: 1 },
    { def: def("mushroom"), qty: 1 },
    { def: def("lettuce"), qty: 1 },
  ];
  state.waterMax = 6;
  state.waterLeft = 6;
  state.barrelStock = 1;
  state.pruneStock = 1;
  state.par = 0; state.gold = 1; state.goldLayout = null; // never shown: the tutorial ends on its own card
  state.selected = null;
  state.resolved = false;
  recomputeSun();
  $("#bot-banner").hidden = true;
  renderAll();
  scrollTo(0, 0); // the replay link lives in the footer; the lesson starts at the board
}

function startTutorial(welcome = false) {
  startTutorialBoard();
  const begin = () => { state.tutorial = { step: 0 }; tutorialRefresh(); };
  if (!welcome) return begin(); // replays skip the pitch — they asked for it
  gardenConfirm({
    text: "Welcome to Plot Day! 🌱 One little garden to grow, every day. Want a quick tour of your first plot? It takes about two minutes.",
    yes: "Show me\naround",
    no: "Skip —\nlet me dig",
    dismiss: false,
  }).then(go => (go ? begin() : tutSkip()));
}

$("#tutor-skip").addEventListener("click", tutSkip);
$("#tutor-next").addEventListener("click", () => tutAdvance());
$("#tutorial-link").addEventListener("click", async e => {
  e.preventDefault();
  if (state.tutorial) return;
  const touched = !state.resolved && state.grid.flat().some(c => c.plant || c.barrel);
  if (touched) {
    const ok = await gardenConfirm({
      text: "Put down the trowel and replay the tutorial? This board's progress is cleared (an unfinished daily stays unscored).",
      yes: "Replay tutorial",
    });
    if (!ok) return;
  }
  startTutorial();
});

/* ---------- go ---------- */
$("#version-line").textContent = `Plot Day v${VERSION}`;
state.muted = !!loadStore().muted;
renderMute();
if (loadStore().tutorialDone) newGame({ daily: true });
else startTutorial(true); // first visit: a guided tour on a scripted board

// offline play + instant loads once installed (no-op on file:// dev)
if ("serviceWorker" in navigator && location.protocol !== "file:")
  navigator.serviceWorker.register("sw.js").catch(() => { /* offline still optional */ });
