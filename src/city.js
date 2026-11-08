// Sunset City: a 25 x 25 grid of roads (about 4.4 km across) with a downtown of
// towers, mid-rise streets, low-rise neighbourhoods and suburbs, parks, palms,
// street lights and signs. The city is built in regions of 2 x 2 blocks that
// stream in around the player (and out again behind), merged by material so
// each region is a few dozen draw calls.
import * as THREE from 'three';
import * as T from './textures.js';
import { mulberry32, clamp, hash3 } from './util.js';
import { GB, rectPoly, chamferRect, roundedRect, circlePoly, scalePoly, offsetPoly, mergeGeoms, ccw, quadToward, tube } from './geom.js';
import { makeProps } from './props.js';
import { TOD } from './tod.js';
import { Q } from './quality.js';
import { attachSSR } from './ssr.js';
import { waterSurface, riverSdf, inRiverBox } from './rivercourse.js';
import { isRound, RB } from './junctions.js';
import { heightBL, hillyArea, plaza as plazaAt } from './hills.js';
import { AVENUES, roadSdf, nearAvenueArea, nearestAvenue, lotPieces, polyArea } from './avenues.js';
export { mergeGeoms, puddles, macro };
// Is a point within `m` metres of the river or a lake (or in it)? Nothing is put there.
const wet = (x, z, m = 3) => (inRiverBox(x, z, m) && riverSdf(x, z) < m) || roadSdf(x, z) < m;      // (in or by the river, or on one of the roads that cut across the grid)

export { SP, N, isBlvd, hw, medianHalf, laneW, laneCount, laneOffset, SIDEWALK, EDGE, LIMIT, REGION, isPark, blockRect, isLakeBlock, landmarkAt, signatureAt, isPlaza } from './grid.js';
import { SP, N, isBlvd, hw, medianHalf, laneW, laneCount, laneOffset, SIDEWALK, EDGE, LIMIT, REGION, isPark, blockRect, landmarkAt, signatureAt, isPlaza } from './grid.js';
const CURB = 0.15, MEDIAN_H = 0.18, CORNER = 5;
const R = 2;                          // blocks per region side
const NR = (2 * N) / R;               // regions per side

// ---------------------------------------------------------------------------
// Collision data: boxes (buildings) and circles (trees, poles) in a grid hash.
// Colliders come and go with the regions that own them.
// ---------------------------------------------------------------------------
const CELL = 40;
const grid = new Map();
const key = (cx, cz) => (cx + 2000) * 4096 + (cz + 2000);
function cellsOf(c, fn) {
  const x0 = c.type === 'box' ? c.x0 : c.x - c.r, x1 = c.type === 'box' ? c.x1 : c.x + c.r;
  const z0 = c.type === 'box' ? c.z0 : c.z - c.r, z1 = c.type === 'box' ? c.z1 : c.z + c.r;
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) fn(key(cx, cz));
}
function addCollider(c, list) {
  cellsOf(c, k => { let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(c); });
  list.push(c);
}
function removeColliders(list) {
  for (const c of list) cellsOf(c, k => { const a = grid.get(k); if (!a) return; const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); if (!a.length) grid.delete(k); });
}
export { addCollider, removeColliders };
export const colliderCount = () => { let n = 0; for (const a of grid.values()) n += a.length; return n; };       // (for the tests: nothing may be left in the street by a region that is gone)
// Street furniture that can be smashed. Each such collider carries `brk` (what it is and which instance of its instanced mesh);
// breaking one hides that instance, removes the collider and remembers it, so it stays broken when the region streams back in.
const BROKEN = new Set();
const brkKey = (x, z) => Math.round(x * 10) + ',' + Math.round(z * 10);
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
export function breakProp(c) {
  const b = c.brk; if (!b || b.broken) return null;
  b.broken = true; BROKEN.add(b.key);
  for (const im of b.ims || []) { im.setMatrixAt(b.i, ZERO_M); im.instanceMatrix.needsUpdate = true; }
  removeColliders([c]);
  if (b.region) { const k = b.region.colliders.indexOf(c); if (k >= 0) b.region.colliders.splice(k, 1); }
  return b;
}
const STATIC = [];
export const addStaticCollider = c => addCollider(c, STATIC);   // for things that never go away (bunker walls)
let qid = 0;
export function queryColliders(x, z, r, out) {
  out.length = 0; qid++;
  for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
    for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
      const a = grid.get(key(cx, cz)); if (!a) continue;
      for (const c of a) if (c.q !== qid) { c.q = qid; out.push(c); }
    }
  return out;
}

// ---------------------------------------------------------------------------
// What's under a point: height, and whether it's grass.
// ---------------------------------------------------------------------------
export function surfaceAt(x, z) {
  const s = surfaceFlat(x, z), h = heightBL(x, z);
  if (h) s.y += h;
  return s;
}
function surfaceFlat(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax > EDGE || az > EDGE) {
    const out = Math.max(ax, az) - EDGE;
    return out < 6 ? { y: CURB, grass: false } : { y: 0, grass: true };
  }
  const ws = waterSurface(x, z);                                          // the deck of a bridge, or water
  if (ws) return { y: ws.y, grass: false, water: ws.water };
  if (roadSdf(x, z) < 0) return { y: 0, grass: false };                       // a road cut across the grid: down at road level, not up on the pavement
  const kx = clamp(Math.round(x / SP), -N, N), kz = clamp(Math.round(z / SP), -N, N);
  const dx = Math.abs(x - kx * SP), dz = Math.abs(z - kz * SP);
  const onAve = dx < hw(kx), onSt = dz < hw(kz);
  if (onAve && onSt) return { y: 0, grass: false };
  if (onAve) return dx < medianHalf(kx) && dz > hw(kz) + 7 ? { y: MEDIAN_H, grass: true } : { y: 0, grass: false };
  if (onSt) return dz < medianHalf(kz) && dx > hw(kx) + 7 ? { y: MEDIAN_H, grass: true } : { y: 0, grass: false };
  // Inside a block; the corners are rounded off.
  const bi = clamp(Math.floor(x / SP), -N, N - 1), bj = clamp(Math.floor(z / SP), -N, N - 1), b = blockRect(bi, bj);
  const ex = Math.min(x - b.x0, b.x1 - x), ez = Math.min(z - b.z0, b.z1 - z);
  if (ex < CORNER && ez < CORNER && Math.hypot(CORNER - ex, CORNER - ez) > CORNER) return { y: 0, grass: false };
  if (isPark(bi, bj) && x > b.x0 + SIDEWALK && x < b.x1 - SIDEWALK && z > b.z0 + SIDEWALK && z < b.z1 - SIDEWALK) return { y: CURB, grass: true };
  return { y: CURB, grass: false };
}

// ---------------------------------------------------------------------------
// Traffic signals share a clock; the lamps are drawn by whichever regions are loaded.
// ---------------------------------------------------------------------------
export const SIGNAL_CYCLE = 34;
export function signalState(t) {
  const c = ((t % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  if (c < 13) return { Z: 'G', X: 'R' };
  if (c < 16) return { Z: 'A', X: 'R' };
  if (c < 17) return { Z: 'R', X: 'R' };
  if (c < 30) return { Z: 'R', X: 'G' };
  if (c < 33) return { Z: 'R', X: 'A' };
  return { Z: 'R', X: 'R' };
}

// Districts with a character of their own: the old town round the cathedral (low brick and plaster with tiled roofs), and the docks along the
// east end of the river (warehouses, container yards and cranes on the quays).
export const CIVIC = new Map();                    // (the banks, hotels and cinemas built so far: for the tests and debugging)
const oldTown = (i, j) => i >= -5 && i <= -2 && j >= 2 && j <= 4 && !landmarkAt(i, j);
const docksBlock = (i, j) => (i === 3 || i === 4) && j === -1;
const col = h => new THREE.Color(h);
const STUCCO = ['#efe6d8', '#e8d6c0', '#d9c3a5', '#f1ddd0', '#cfc6bd', '#e6cfc4', '#d8d0c0', '#c4b4a6', '#e9c9b0', '#d5c9b6'].map(col);
const GLASS = ['#d6e2ee', '#c4d0dc', '#e2dcd2', '#b4c4d6', '#ccd4cc', '#ffffff'].map(col);
const BRICK = ['#ffffff', '#f0e4dc', '#e6d8d0', '#d8ccc4'].map(col);
const MODERN = ['#ffffff', '#f2f0ea', '#e4e6e8'].map(col);
const SHOP = ['#f2e8dc', '#e7d2bc', '#d4b79a', '#c9c2b8', '#e9dccb', '#d8c4ae', '#bfa58f'].map(col);
const HOUSE = ['#ffffff', '#f4eee2', '#ebe0cc', '#dfe6ea', '#f0e4cf', '#e8d4c4', '#d8e0d0'].map(col);
const TILES = ['#ffffff', '#f2d8c8', '#c8a090', '#9a7a6a'].map(col);
const WHITE = new THREE.Color(1, 1, 1), STONE = new THREE.Color(0.2, 0.2, 0.22), METAL = new THREE.Color(0.55, 0.6, 0.66);
const GRASS_TINT = new THREE.Color(0.95, 1, 0.9);

const COLORED = new Set(['park', 'mark', 'amark', 'glass', 'apt', 'shop', 'brick', 'modern', 'house', 'roof', 'tile', 'props']);
const KEYS = ['walk', 'curb', 'park', 'mark', 'amark', 'acurb', 'glass', 'apt', 'shop', 'brick', 'modern', 'house', 'roof', 'tile', 'lot', 'props', 'sign', 'rail', 'gantry'];
const FAR_KEYS = ['walk', 'curb', 'park', 'mark', 'amark', 'acurb', 'glass', 'apt', 'shop', 'brick', 'modern', 'house', 'roof', 'tile', 'lot'];
const DETAIL_KEYS = ['props', 'sign', 'rail', 'gantry'];
const CASTS = new Set(['glass', 'apt', 'shop', 'brick', 'modern', 'house', 'roof', 'tile', 'props']);
const snap = h => Math.max(3.5, Math.round(h / 3.5) * 3.5);

const GROUND = new Set(['walk', 'curb', 'park', 'mark', 'amark', 'acurb', 'lot']);            // (surfaces that follow the ground; everything else stands level on a base)
class Ctx {
  // On hilly ground every vertex of a ground surface is lifted to the height of the ground under it, and everything that stands on the ground
  // (a building, a sign, a crane) is lifted by one amount, the highest ground under its lot, with its walls carried down to the lowest.
  constructor(hilly = false) {
    this.gb = {}; for (const k of KEYS) this.gb[k] = new GB(COLORED.has(k));
    this.hilly = hilly; this.base = 0; this.drop = 0;
    if (hilly) for (const k of KEYS) { const g = this.gb[k]; if (GROUND.has(k)) { g.lift = (x, y, z) => heightBL(x, z); g.fine = 12; } else g.lift = (x, y, z) => this.base - (y < 0.35 ? this.drop : 0); }
    this.colliders = [];
    this.L = { bushes: [], trees: [], palms: [], lamps: [], poles: [], hedges: [], hydrants: [], bins: [], benches: [], sigZ: [], sigX: [], bills: [], parked: [] };
    this.signN = 0;
  }
  H(x, z) { return this.hilly ? heightBL(x, z) : (this.baseY || 0); }
  // Everything lifted by `y`: a town on a level pad outside the city is built with the city's own pieces at its height.
  level(y) { this.baseY = y; for (const k of KEYS) this.gb[k].lift = () => y; return this; }
  setLot(lot) {
    if (!this.hilly) return; let hi = 0, lo = 1e9;
    for (const fx of [0, 0.5, 1]) for (const fz of [0, 0.5, 1]) { const h = heightBL(lot.x0 + (lot.x1 - lot.x0) * fx, lot.z0 + (lot.z1 - lot.z0) * fz); hi = Math.max(hi, h); lo = Math.min(lo, h); }
    this.base = hi; this.drop = hi - lo + 0.25;
  }
  setPoint(x, z, drop = 0.3) { if (this.hilly) { this.base = heightBL(x, z); this.drop = drop; } }
}

// Low-frequency variation on large surfaces, so the repeating texture doesn't
// show: a second, much larger sample of the same texture darkens and
// lightens big patches.
function macro(mat, scale, amount) {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 mc = texture2D(map, vMapUv * ${scale.toFixed(3)} + vec2(0.37, 0.11)).rgb;
        vec3 mc2 = texture2D(map, vMapUv * ${(scale * 0.31).toFixed(4)} + vec2(0.71, 0.53)).rgb;
        float mean = dot(texture2D(map, vec2(0.5), 16.0).rgb, vec3(0.3333)) + 1e-4;
        float m = dot(mc + mc2, vec3(0.1667)) / mean - 1.0;
        diffuseColor.rgb *= 1.0 + clamp(m, -1.0, 1.0) * ${amount.toFixed(2)}; }`);
  };
  mat.customProgramCacheKey = () => 'macro' + scale;
  return mat;
}
// Wet weather: puddles. Where a patch of tarmac is flooded, its roughness drops to that of still water (so the ray-traced reflections
// show up sharp and mirror-like there), it darkens, and its grain disappears, while the rest stays damp. The patches come from noise in
// world space, so they're the same every time you pass. `wet` is how much of it (0..1), `damp` darkens the rest in rain by day (the
// night streets are already tuned wet).
export const WETNESS = { wet: { value: 0 }, damp: { value: 0 } };
function puddles(mat, cover = 0.6) {
  const prev = mat.onBeforeCompile, key = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey() : (prev ? prev.toString() : '');
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.uniforms.uWet = WETNESS.wet; sh.uniforms.uDamp = WETNESS.damp;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPdW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vPdW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vPdW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vPdW; uniform float uWet, uDamp;
      float pdH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float pdN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(pdH(i), pdH(i + vec2(1.0, 0.0)), f.x), mix(pdH(i + vec2(0.0, 1.0)), pdH(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float pdn = 0.55 * pdN(vPdW.xz * 0.045) + 0.3 * pdN(vPdW.xz * 0.13 + 7.3) + 0.15 * pdN(vPdW.xz * 0.41 + 2.1);
        float puddle = smoothstep(${(0.66 - cover * 0.18).toFixed(3)}, ${(0.73 - cover * 0.18).toFixed(3)}, pdn) * uWet;
        roughnessFactor = mix(roughnessFactor, 0.03, puddle);
        diffuseColor.rgb *= (1.0 - 0.3 * puddle) * mix(1.0, 0.74, uDamp * uWet);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(mix(normal, nonPerturbedNormal, puddle));`);
  };
  mat.customProgramCacheKey = () => key + '|puddles' + cover;
  return mat;
}
// Dirt and shade at the foot of walls (the facade meshes are in world coordinates).
function grime(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWY = transformed.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(0.58, 1.0, smoothstep(0.0, 4.5, vWY));');
  };
  mat.customProgramCacheKey = () => 'grime';
  return mat;
}

const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

export class City {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.regions = new Map(); this.sites = []; this.job = null; this.deadline = 0; this.version = 0; this.parkCache = []; this.parkVersion = -1;
    this.sig = { Z: 'G', X: 'R' };
  }

  // Textures and materials (done once, with progress messages).
  async init(progress = () => {}) {
    const step = async (msg, fn) => { progress(msg); await frame(); return fn(); };
    const asp = await step('Paving the roads…', T.asphalt);
    const con = await step('Laying the pavements…', T.concrete);
    const grass = await step('Growing the grass…', T.ground);
    const facG = await step('Glazing the towers…', T.facadeGlass);
    const facM = await step('Casting concrete…', T.facadeModern);
    const facA = await step('Plastering apartments…', T.facadeApartment);
    const facB = await step('Laying brick…', T.facadeBrick);
    const facS = await step('Fitting shop fronts…', T.facadeShop);
    const facH = await step('Building houses…', T.facadeHouse);
    const misc = await step('Hanging the signs…', () => ({ roof: T.roofTex(), tile: T.roofTileTex(), rail: T.railTex(), sign: T.signAtlas(), gantry: T.gantryAtlas() }));
    this.tx = { asp, con, grass };
    this.props = makeProps();
    const std = o => new THREE.MeshStandardMaterial(o);
    const fac = (f, ei, env) => grime(std({
      map: f.map, emissiveMap: f.emissiveMap, roughnessMap: f.ormMap, metalnessMap: f.ormMap, normalMap: f.normalMap, normalScale: new THREE.Vector2(1, 1),
      emissive: 0xffffff, emissiveIntensity: ei, vertexColors: true, metalness: 1, roughness: 1, envMapIntensity: env,
    }));
    // Road and pavement materials come from these so that the bridges (which must not be cut by the river) can have their own copies.
    const makeWalk = () => { const w = macro(std({ color: 0xc2b8b4, map: con.map, normalMap: con.normalMap, roughness: TOD.wet ? 0.62 : 0.92, envMapIntensity: TOD.wet ? 1.5 : 1 }), 0.06, 0.3); attachSSR(w, { range: 70, rough: 0.7 }); puddles(w, 0.35); return w; };
    const makeAsphalt = () => { const a = macro(std({ color: new THREE.Color(TOD.road).multiplyScalar(TOD.wet ? 1 : 0.78), map: asp.map, roughnessMap: asp.roughnessMap, normalMap: asp.normalMap, normalScale: TOD.wet ? new THREE.Vector2(0.4, 0.4) : new THREE.Vector2(0.55, 0.55), roughness: TOD.wet ? 0.4 : 0.86, metalness: 0, envMapIntensity: TOD.wet ? 2.0 : 0.75 }), 0.045, 0.35); attachSSR(a, { range: 90, rough: 0.64 }); puddles(a, 0.6); return a; };
    this.makeWalk = makeWalk; this.makeAsphalt = makeAsphalt;
    const a2c = Q.msaa > 0;
    const m = this.mat = {
      walk: makeWalk(),
      curb: std({ color: 0xc8c0bc, map: con.map, roughness: 0.9 }),
      park: std({ color: 0x8fa070, map: grass, roughness: 1, vertexColors: true }),
      mark: std({ vertexColors: true, color: 0xd4d2cc, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      glass: fac(facG, TOD.windows, 1.5), modern: fac(facM, TOD.windows, 1.3), apt: fac(facA, TOD.windows * 1.05, 0.8),
      brick: fac(facB, TOD.windows * 1.05, 0.7), shop: fac(facS, TOD.lampsOn ? 2.0 : 0.45, 0.8), house: fac(facH, TOD.windows * 1.05, 0.8),
      roof: std({ map: misc.roof, vertexColors: true, roughness: 0.95 }),
      tile: std({ map: misc.tile, vertexColors: true, roughness: 0.85 }),
      lot: std({ color: 0x8a8486, map: asp.map, roughnessMap: asp.roughnessMap, roughness: 1 }),
      props: std({ vertexColors: true, roughness: 0.7, metalness: 0.2 }),
      sign: std({ map: misc.sign, emissiveMap: misc.sign, emissive: 0xffffff, emissiveIntensity: TOD.signs, roughness: 0.5, side: THREE.DoubleSide }),
      rail: std({ map: misc.rail, alphaTest: 0.5, alphaToCoverage: a2c, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 }),
      gantry: std({ map: misc.gantry, emissiveMap: misc.gantry, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.6, side: THREE.DoubleSide }),
    };
    for (const k of ['glass', 'modern', 'shop']) attachSSR(m[k], { range: 110, rough: 0.45, view: 160, strength: 0.85 });
    m.asphalt = makeAsphalt();
    m.amark = std({ vertexColors: true, color: 0xd4d2cc, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); m.acurb = std({ color: 0xc8c0bc, map: con.map, roughness: 0.9 });      // (the markings and kerb of the roads cut across the grid: never cut away themselves)
    m.hillAsphalt = makeAsphalt();
    for (const a of [m.asphalt, m.hillAsphalt]) if (a === m.asphalt) { a.polygonOffset = true; a.polygonOffsetFactor = 1; a.polygonOffsetUnits = 1; }          // (the flat plane is pushed back a little, so the ground of a hilly region, which is at the true height, always wins over it)
    this.style = {
      glass: { fac: facG, pal: GLASS }, modern: { fac: facM, pal: MODERN }, apt: { fac: facA, pal: STUCCO },
      brick: { fac: facB, pal: BRICK }, shop: { fac: facS, pal: SHOP }, house: { fac: facH, pal: HOUSE },
    };
    // The road surface: one big plane under everything.
    const ground = new GB(); ground.flat(-EDGE, -EDGE, EDGE, EDGE, -0.05, 10);          // (a few centimetres down, so that the ground of a hilly region, which is exactly at the true height, always wins)
    const gm = new THREE.Mesh(ground.geometry(), m.asphalt); gm.receiveShadow = Q.shadows; gm.layers.enable(2); gm.frustumCulled = false;
    this.group.add(gm); this.ground = gm;
    // The hills, for the far view: a coarse mesh a little under the ground of the regions that are loaded (which has all the detail), so the hills
    // show from a distance too, even where the buildings aren't built.
    {
      const cell = 60, nc = Math.round(2 * EDGE / cell), x0 = -EDGE, z0 = -EDGE, pos = [], idx = [], nor = [], at = new Map();
      const vid = (i, j) => { const k = i * 4096 + j; let v = at.get(k); if (v === undefined) { const x = x0 + i * cell, z = z0 + j * cell, e = 4, gx = (heightBL(x + e, z) - heightBL(x - e, z)) / (2 * e), gz = (heightBL(x, z + e) - heightBL(x, z - e)) / (2 * e), l = Math.hypot(gx, 1, gz); v = pos.length / 3; pos.push(x, heightBL(x, z) - 0.45, z); nor.push(-gx / l, 1 / l, -gz / l); at.set(k, v); } return v; };
      for (let j = 0; j < nc; j++) for (let i = 0; i < nc; i++) {
        const xa = x0 + i * cell, za = z0 + j * cell; if (!hillyArea(xa, za, xa + cell, za + cell) || !(heightBL(xa, za) + heightBL(xa + cell, za) + heightBL(xa, za + cell) + heightBL(xa + cell, za + cell) > 0)) continue;
        const a = vid(i, j), b = vid(i + 1, j), c2 = vid(i, j + 1), d = vid(i + 1, j + 1); idx.push(a, c2, b, b, c2, d);
      }
      if (idx.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
        const hm = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x4a4a4e, roughness: 1 })); hm.layers.enable(2); hm.frustumCulled = false; this.group.add(hm); this.coarseHills = hm;
      }
    }
  }

  allMaterials() {
    const out = [];
    const add = o => { for (const v of Object.values(o)) { if (v && v.isMaterial) out.push(v); else if (v && typeof v === 'object') add(v); } };
    add(this.mat); add(this.props.mat); if (this.matCut) add(this.matCut); if (this.matRoad) add(this.matRoad);
    return out;
  }

  // --- Streaming ----------------------------------------------------------------
  regionAt(x, z) { return [clamp(Math.floor((x + N * SP) / REGION), 0, NR - 1), clamp(Math.floor((z + N * SP) / REGION), 0, NR - 1)]; }
  // The road surface of a hilly region: a mesh on the real height, a cell every 12 m (the pavements and everything else are on top of it).
  hillGround(ri, rj) {
    const n = 30, step = REGION / n, x0 = -N * SP + ri * REGION, z0 = -N * SP + rj * REGION, w = n + 1, pos = new Float32Array(w * w * 3), nor = new Float32Array(w * w * 3), uv = new Float32Array(w * w * 2), idx = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = x0 + i * step, z = z0 + j * step, k = j * w + i, gx = (heightBL(x + 2, z) - heightBL(x - 2, z)) / 4, gz = (heightBL(x, z + 2) - heightBL(x, z - 2)) / 4, l = Math.hypot(gx, 1, gz);
      pos[k * 3] = x; pos[k * 3 + 1] = heightBL(x, z); pos[k * 3 + 2] = z; nor[k * 3] = -gx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -gz / l; uv[k * 2] = x / 10; uv[k * 2 + 1] = -z / 10;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.mat.hillAsphalt); m.receiveShadow = Q.shadows; m.layers.enable(2); return m;
  }
  nearRiver(ri, rj) {
    const x0 = -N * SP + ri * REGION, z0 = -N * SP + rj * REGION;
    return inRiverBox(x0 + REGION / 2, z0 + REGION / 2, REGION / 2 + 40);
  }
  regionCenter(ri, rj) { return [-N * SP + (ri + 0.5) * REGION, -N * SP + (rj + 0.5) * REGION]; }

  // Build every region within `radius` of (x, z) before the first frame.
  async loadAround(x, z, radius, progress = () => {}) {
    const [pi, pj] = this.regionAt(x, z), list = [];
    for (let ri = Math.max(0, pi - radius); ri <= Math.min(NR - 1, pi + radius); ri++)
      for (let rj = Math.max(0, pj - radius); rj <= Math.min(NR - 1, pj + radius); rj++) list.push([ri, rj, Math.hypot(ri - pi, rj - pj)]);
    list.sort((a, b) => a[2] - b[2]);
    this.deadline = Infinity; this.dropJob();
    for (let k = 0; k < list.length; k++) {
      const [ri, rj] = list[k];
      if (!this.regions.has(ri + ',' + rj)) { const gen = this.genRegion(ri, rj); let r; do { r = gen.next(); } while (!r.done); this.finish(ri, rj, r.value); }
      progress(`Building the city… ${Math.round((k + 1) / list.length * 100)}%`);
      await frame();
    }
  }

  // The same, all at once (a short hitch): for jumping to somewhere far away.
  loadNow(x, z, radius) {
    const [pi, pj] = this.regionAt(x, z); this.deadline = Infinity; this.dropJob();
    for (let ri = Math.max(0, pi - radius); ri <= Math.min(NR - 1, pi + radius); ri++) for (let rj = Math.max(0, pj - radius); rj <= Math.min(NR - 1, pj + radius); rj++) {
      if (this.regions.has(ri + ',' + rj)) continue;
      const gen = this.genRegion(ri, rj); let r; do { r = gen.next(); } while (!r.done); this.finish(ri, rj, r.value);
    }
  }

  update(x, z, budget = 4) {
    const [pi, pj] = this.regionAt(x, z), lr = Q.loadR;
    for (const [k, r] of this.regions) {
      if (Math.max(Math.abs(r.ri - pi), Math.abs(r.rj - pj)) > lr + 1) this.unload(k, r);
      else {
        const [cx, cz] = this.regionCenter(r.ri, r.rj);
        const dist = Math.hypot(Math.max(Math.abs(x - cx) - REGION / 2, 0), Math.max(Math.abs(z - cz) - REGION / 2, 0));
        r.detail.visible = dist < Q.detailR; r.trees.visible = dist < Q.treeR;
      }
    }
    if (this.job && Math.max(Math.abs(this.job.ri - pi), Math.abs(this.job.rj - pj)) > lr + 1) this.dropJob();
    const t0 = performance.now(); this.deadline = t0 + budget;
    while (performance.now() < this.deadline) {
      if (!this.job) {
        let best = null, bd = 1e9;
        for (let ri = Math.max(0, pi - lr); ri <= Math.min(NR - 1, pi + lr); ri++) for (let rj = Math.max(0, pj - lr); rj <= Math.min(NR - 1, pj + lr); rj++) {
          if (this.regions.has(ri + ',' + rj)) continue;
          const d = Math.hypot(ri - pi, rj - pj); if (d < bd) { bd = d; best = [ri, rj]; }
        }
        if (!best) return;
        const ctx = this.newCtx(best[0], best[1]);
        this.job = { ri: best[0], rj: best[1], ctx, gen: this.genRegion(best[0], best[1], ctx), made: false };
      }
      const r = this.job.gen.next();
      if (!r.done) continue;
      if (!this.job.made) { this.job.made = true; this.job.gen = this.finishGen(this.job.ri, this.job.rj, this.job.ctx); }       // (the pieces are built, now hand them to the scene: in steps too)
      else this.job = null;
    }
  }
  // Give up on the region being built (the player has gone far from it): its colliders were already put in the street, so take them out.
  dropJob() { if (this.job) { removeColliders(this.job.ctx.colliders); this.job = null; } }

  unload(k, r) {
    this.group.remove(r.group);
    r.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o.geometry) o.geometry.dispose(); });
    removeColliders(r.colliders);
    this.regions.delete(k); this.version++;
  }

  setSignals(state) {
    this.sig = state;
    for (const r of this.regions.values()) for (const ax of ['Z', 'X']) for (const k of ['R', 'A', 'G']) { const m = r.lamps[ax][k]; if (m) m.visible = state[ax] === k; }
  }
  parkedList() {
    if (this.parkVersion !== this.version) { this.parkCache = []; for (const r of this.regions.values()) for (const p of r.parked) this.parkCache.push(p); for (const s of this.sites) for (const p of s.parked) this.parkCache.push(p); this.parkVersion = this.version; }
    return this.parkCache;
  }

  // --- Making a region ---------------------------------------------------------------
  newCtx(ri, rj) { const x0 = -N * SP + ri * REGION, z0 = -N * SP + rj * REGION; return new Ctx(hillyArea(x0, z0, x0 + REGION, z0 + REGION)); }
  *genRegion(ri, rj, ctx = this.newCtx(ri, rj)) {
    for (let bi = 0; bi < R; bi++) for (let bj = 0; bj < R; bj++) {
      yield* this.genBlock(ctx, -N + ri * R + bi, -N + rj * R + bj);
      yield;
    }
    yield* this.avenues(ctx, ri, rj);
    return ctx;
  }

  finish(ri, rj, ctx) { const g = this.finishGen(ri, rj, ctx); while (!g.next().done); }
  // Hand a built region to the scene. Turning the pieces into meshes and instanced props is a few milliseconds of work (more on a tablet), so it is
  // done in steps too, with a look at the clock between them (`this.deadline` is Infinity when everything is wanted at once).
  *finishGen(ri, rj, ctx, site = false) {
    const over = () => performance.now() > this.deadline;
    if (!site && this.regions.has(ri + ',' + rj)) this.unload(ri + ',' + rj, this.regions.get(ri + ',' + rj));         // (never two of the same region)
    const region = { ri, rj, group: new THREE.Group(), far: new THREE.Group(), detail: new THREE.Group(), trees: new THREE.Group(), colliders: ctx.colliders, parked: ctx.L.parked, lamps: { Z: {}, X: {} } };
    region.group.add(region.far, region.detail, region.trees);
    const mesh = (k, grp, far, set = null) => {
      const gb = ctx.gb[k]; if (!gb.count) return;
      const m = new THREE.Mesh(gb.geometry(), set && set[k] ? set[k] : this.mat[k]);
      m.castShadow = CASTS.has(k) && Q.shadows; m.receiveShadow = Q.shadows && k !== 'sign';
      if (far) m.layers.enable(2);
      grp.add(m);
    };
    if (ctx.hilly) region.far.add(this.hillGround(ri, rj));
    const rx0 = -N * SP + ri * REGION, rz0 = -N * SP + rj * REGION;
    const set = site ? null : this.matCut && this.nearRiver(ri, rj) ? this.matCut : this.matRoad && nearAvenueArea(rx0, rz0, rx0 + REGION, rz0 + REGION) ? this.matRoad : null;       // (only regions by the river or a road across the grid need materials that cut it away)
    for (const k of FAR_KEYS) { mesh(k, region.far, true, set); if (over()) yield; }
    for (const k of DETAIL_KEYS) { mesh(k, region.detail, false); if (over()) yield; }
    const P = this.props, L = ctx.L;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const inst = (geom, mat, list, place, cast, grp, tint) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geom, mat, list.length);
      const rnd = mulberry32(list.length * 977 + Math.floor(list[0][0]));
      const c = new THREE.Color();
      list.forEach((it, n) => { place(it, rnd); im.setMatrixAt(n, m4); if (tint) { tint(c, rnd); im.setColorAt(n, c); } });
      im.castShadow = cast && Q.shadows; im.receiveShadow = false; im.computeBoundingSphere(); grp.add(im); return im;
    };
    const Hh = ctx.hilly ? heightBL : ctx.baseY ? () => ctx.baseY : () => 0;
    const atN = (x, y, z, yaw, sc) => { q.setFromAxisAngle(up, yaw); s.set(sc, sc, sc); v.set(x, y, z); m4.compose(v, q, s); };
    const at = (x, y, z, yaw, sc) => atN(x, y + Hh(x, z), z, yaw, sc);
    const placeTree = (t, rnd) => { const sc = t[2]; q.setFromAxisAngle(up, rnd() * 6.28); s.set(sc * (0.86 + rnd() * 0.32), sc * (0.9 + rnd() * 0.26), sc * (0.86 + rnd() * 0.32)); v.set(t[0], t[3] + Hh(t[0], t[1]), t[1]); m4.compose(v, q, s); };   // (no two crowns the same shape)
    const leaf = (c, rnd) => { const r = rnd(); c.setRGB(0.8 + r * 0.35, 0.88 + r * 0.2, 0.75 + r * 0.2); };
    inst(P.geo.treeCore, P.mat.treeCore, L.trees, placeTree, true, region.trees);
    inst(P.geo.treeCards, P.mat.treeCards, L.trees, placeTree, true, region.trees, leaf);
    inst(P.geo.bushCore, P.mat.treeCore, L.bushes, placeTree, false, region.trees);
    inst(P.geo.bushCards, P.mat.treeCards, L.bushes, placeTree, false, region.trees, leaf);
    inst(P.geo.palmTrunk, P.mat.palmTrunk, L.palms, placeTree, true, region.trees);
    inst(P.geo.palmFronds, P.mat.palmFronds, L.palms, placeTree, true, region.trees, leaf);
    if (over()) yield;
    const placeYaw = it => at(it[0], it[3], it[1], it[2], 1);
    const ims = { lamp: [], pole: [], hydrant: [], bin: [], bench: [] };
    const keep = (k, im) => { if (im) ims[k].push(im); return im; };
    keep('lamp', inst(P.geo.lamp, P.mat.lamp, L.lamps, placeYaw, true, region.detail));
    keep('lamp', inst(P.geo.bulb, P.mat.bulb, L.lamps, placeYaw, false, region.detail));
    if (TOD.lampsOn) { const pm = keep('lamp', inst(P.geo.pool, P.mat.pool, L.lamps, it => at(it[0], 0.03, it[1], it[2], 1), false, region.detail)); if (pm) pm.renderOrder = 1; }
    keep('pole', inst(P.geo.pole, P.mat.pole, L.poles, placeYaw, true, region.detail));
    inst(P.geo.hedge, P.mat.hedge, L.hedges, it => { q.identity(); s.set(it[2], 0.95, it[3]); v.set(it[0], CURB + Hh(it[0], it[1]), it[1]); m4.compose(v, q, s); }, true, region.detail);
    keep('hydrant', inst(P.geo.hydrant, P.mat.hydrant, L.hydrants, placeYaw, false, region.detail));
    keep('bin', inst(P.geo.bin, P.mat.bin, L.bins, placeYaw, false, region.detail));
    keep('bench', inst(P.geo.bench, P.mat.bench, L.benches, placeYaw, false, region.detail));
    if (over()) yield;
    inst(P.geo.billFrame, P.mat.billFrame, L.bills, it => atN(it.x, it.y, it.z, it.yaw, 1), true, region.far);
    inst(P.geo.billFace, P.mat.billFace, L.bills, it => atN(it.x, it.y, it.z, it.yaw, 1), false, region.far);
    // Wires between neighbouring poles on the same pavement.
    const pts = [];
    for (let i = 1; i < L.poles.length; i++) {
      const a = L.poles[i - 1], b = L.poles[i];
      if (a[4] !== b[4]) continue;
      const ox = Math.cos(a[2]), oz = -Math.sin(a[2]);
      for (const off of [-1.1, 0, 1.1]) {
        const y0 = CURB + (off === 0 ? 10.6 : 10.28), S = 9, ha = Hh(a[0], a[1]), hb = Hh(b[0], b[1]);
        for (let k = 0; k < S; k++) {
          const t0 = k / S, t1 = (k + 1) / S;
          const Pt = t => [a[0] + (b[0] - a[0]) * t + ox * off, y0 + ha + (hb - ha) * t - 0.7 * 4 * t * (1 - t), a[1] + (b[1] - a[1]) * t + oz * off];
          pts.push(...Pt(t0), ...Pt(t1));
        }
      }
    }
    if (over()) yield;
    if (pts.length) { const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); region.detail.add(new THREE.LineSegments(wg, P.mat.wire)); }
    // Traffic signals: a pole and arm, two heads, and a red, amber and green lamp on each.
    const all = [...L.sigZ, ...L.sigX];
    inst(P.geo.sigPole, P.mat.sigDark, all, it => at(it[0], CURB, it[1], it[2], 1), true, region.detail);
    inst(P.geo.sigArm, P.mat.sigDark, all, it => { q.setFromAxisAngle(up, it[2]); s.set(1, 1, it[3]); v.set(it[0], CURB + Hh(it[0], it[1]), it[1]); m4.compose(v, q, s); }, true, region.detail);
    const fwd = new THREE.Vector3();
    const heads = { Z: [], X: [] };
    for (const [ax, list] of [['Z', L.sigZ], ['X', L.sigX]]) for (const it of list) for (const f of [0.55, 0.95]) heads[ax].push([it[0], it[1], it[2], it[3] * f]);
    const placeHead = (h, dy = 0, dxl = 0) => {
      q.setFromAxisAngle(up, h[2]); fwd.set(Math.sin(h[2]), 0, Math.cos(h[2]));
      v.set(h[0] + fwd.x * h[3] + Math.cos(h[2]) * dxl, CURB + 5.5 + dy + Hh(h[0], h[1]), h[1] + fwd.z * h[3] - Math.sin(h[2]) * dxl); s.set(1, 1, 1); m4.compose(v, q, s);
    };
    inst(P.geo.sigHead, P.mat.sigHead, [...heads.Z, ...heads.X], h => placeHead(h), true, region.detail);
    for (const ax of ['Z', 'X']) for (const [k, dy] of [['R', 0.3], ['A', 0], ['G', -0.3]]) {
      const lm = inst(P.geo.sigLamp, P.mat.sigLamp[k], heads[ax], h => placeHead(h, dy, 0.17), false, region.detail);
      if (lm) { lm.visible = this.sig[ax] === k; region.lamps[ax][k] = lm; }
    }
    for (const c of ctx.colliders.slice()) if (c.brk) { c.brk.ims = ims[c.brk.kind]; c.brk.region = region; if (BROKEN.has(c.brk.key)) breakProp(c); }   // (things already smashed stay smashed)
    if (site) return region;                                                      // (a site outside the city is added to the scene by towns.js)
    this.group.add(region.group);
    this.regions.set(ri + ',' + rj, region); this.version++;
  }
  // Build a site outside the city from a context filled with the city's pieces (see towns.js): its meshes and instanced props, not yet in the scene.
  buildSite(ctx) { const g = this.finishGen(null, null, ctx, true); let r; do { r = g.next(); } while (!r.done); return r.value; }
  newCtx0(y) { return new Ctx(false).level(y); }

  // --- One block: pavement, furniture, road markings and buildings --------------------
  *genBlock(ctx, i, j) {
    const rnd = mulberry32(Math.imul(i + 1000, 73856093) ^ Math.imul(j + 1000, 19349663));
    const b = blockRect(i, j), gb = ctx.gb, L = ctx.L;
    const park = isPark(i, j);
    const ix0 = b.x0 + SIDEWALK, ix1 = b.x1 - SIDEWALK, iz0 = b.z0 + SIDEWALK, iz1 = b.z1 - SIDEWALK;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, d = Math.max(Math.abs(cx), Math.abs(cz));
    const zone = d < 520 ? 'down' : d < 1000 ? 'mid' : d < 1500 ? 'low' : 'sub';
    ctx.cur = [i, j]; ctx.old = oldTown(i, j);

    // The pavement slab, with rounded corners and a kerb round it.
    const pad = roundedRect(b.x0, b.z0, b.x1, b.z1, CORNER, 5);
    gb.walk.cap(pad, CURB, 6, WHITE);
    gb.curb.extrude(pad, 0, CURB, 4.5, 4.5, WHITE, 0, true);
    this.outerStrip(ctx, i, j, b, rnd);
    if (performance.now() > this.deadline) yield;

    // Street furniture along the four sides of the block.
    const sides = [
      { line: i, axis: 'x', c: b.x0, from: b.z0, to: b.z1, out: -1 },
      { line: i + 1, axis: 'x', c: b.x1, from: b.z0, to: b.z1, out: 1 },
      { line: j, axis: 'z', c: b.z0, from: b.x0, to: b.x1, out: -1 },
      { line: j + 1, axis: 'z', c: b.z1, from: b.x0, to: b.x1, out: 1 },
    ];
    for (const [si, s] of sides.entries()) {
      if (performance.now() > this.deadline) yield;
      const blvd = isBlvd(s.line), len = s.to - s.from, nLamps = Math.max(2, Math.round(len / 34));
      for (let n = 0; n < nLamps; n++) {
        const t = s.from + 8 + (len - 16) * (n / (nLamps - 1)), p = s.c + s.out * -0.8;
        const yaw = s.axis === 'x' ? (s.out < 0 ? -Math.PI / 2 : Math.PI / 2) : (s.out < 0 ? Math.PI : 0);
        const [x, z] = s.axis === 'x' ? [p, t] : [t, p];
        if (!wet(x, z, 3)) { L.lamps.push([x, z, yaw, CURB]); addCollider({ type: 'circ', x, z, r: 0.25, brk: { kind: 'lamp', i: L.lamps.length - 1, yaw, key: brkKey(x, z) } }, ctx.colliders); }
        if (n < nLamps - 1) {
          const r2 = rnd(), tq = t + (len - 16) / (nLamps - 1) * 0.28;
          const [qx, qz] = s.axis === 'x' ? [s.c - s.out * 0.7, tq] : [tq, s.c - s.out * 0.7];
          if (wet(qx, qz, 3)) { /* nothing in the water */ }
          else if (r2 < 0.12) { L.hydrants.push([qx, qz, 0, CURB]); addCollider({ type: 'circ', x: qx, z: qz, r: 0.3, brk: { kind: 'hydrant', i: L.hydrants.length - 1, yaw: 0, key: brkKey(qx, qz) } }, ctx.colliders); }
          else if (r2 < 0.3) { const by = rnd() * 6; L.bins.push([qx, qz, by, CURB]); addCollider({ type: 'circ', x: qx, z: qz, r: 0.3, brk: { kind: 'bin', i: L.bins.length - 1, yaw: by, key: brkKey(qx, qz) } }, ctx.colliders); }
          else if (r2 < 0.38 && blvd && !wet(...(s.axis === 'x' ? [s.c - s.out * 3.9, tq] : [tq, s.c - s.out * 3.9]), 3)) { const [bx, bz] = s.axis === 'x' ? [s.c - s.out * 3.9, tq] : [tq, s.c - s.out * 3.9]; L.benches.push([bx, bz, yaw + Math.PI, CURB]); addCollider({ type: 'circ', x: bx, z: bz, r: 0.55, brk: { kind: 'bench', i: L.benches.length - 1, yaw: yaw + Math.PI, key: brkKey(bx, bz) } }, ctx.colliders); }
        }
        if (!blvd && s.out > 0 && n % 2 === 0 && !wet(...(s.axis === 'x' ? [s.c - s.out * 4.3, t] : [t, s.c - s.out * 4.3]), 3)) {
          const pp = s.c - s.out * 4.3, [px, pz] = s.axis === 'x' ? [pp, t] : [t, pp];
          L.poles.push([px, pz, s.axis === 'x' ? 0 : Math.PI / 2, CURB, i + ',' + j + ',' + si]); addCollider({ type: 'circ', x: px, z: pz, r: 0.25, brk: { kind: 'pole', i: L.poles.length - 1, yaw: s.axis === 'x' ? 0 : Math.PI / 2, key: brkKey(px, pz) } }, ctx.colliders);
        }
        if (n < nLamps - 1) {
          const tm = t + (len - 16) / (nLamps - 1) / 2, pt = s.c - s.out * 2.6;
          const [tx, tz] = s.axis === 'x' ? [pt, tm] : [tm, pt];
          if (blvd) { if ((n + i + j) % 3 === 2) this.tree(ctx, tx, tz, 1.1 + rnd() * 0.5, CURB, false); else this.tree(ctx, tx, tz, 0.9 + rnd() * 0.35, CURB, true); if (!wet(tx, tz, 4)) L.bushes.push([tx + (rnd() - 0.5) * 3, tz + (rnd() - 0.5) * 3, 0.8 + rnd() * 0.6, CURB]); }
          else if (rnd() < 0.8) this.tree(ctx, tx, tz, 0.85 + rnd() * 0.5, CURB, false);
        }
      }
    }

    // The roads this block owns: the avenue on its west side, the street on its
    // north side, and (on the far edge of the map) the ring roads.
    if (performance.now() > this.deadline) yield;
    this.segment(ctx, 'x', i, j, rnd); this.segment(ctx, 'z', j, i, rnd);
    if (performance.now() > this.deadline) yield;
    if (i === N - 1) this.segment(ctx, 'x', N, j, rnd);
    if (j === N - 1) this.segment(ctx, 'z', N, i, rnd);
    this.junction(ctx, i, j);
    if (i === N - 1) this.junction(ctx, N, j);
    if (j === N - 1) this.junction(ctx, i, N);
    if (i === N - 1 && j === N - 1) this.junction(ctx, N, N);

    const lm = landmarkAt(i, j);
    if (lm && lm !== 'wheel') { if (lm === 'cathedral') this.square(ctx, b, rnd); return; }                     // (landmarks.js builds it)
    const sg = signatureAt(i, j);
    if (sg) { this.signature(ctx, { x0: ix0, z0: iz0, x1: ix1, z1: iz1 }, sg, rnd); return; }                       // a skyscraper that fills the block
    if (plazaAt(i, j)) { this.plaza(ctx, { x0: ix0, z0: iz0, x1: ix1, z1: iz1 }, rnd); return; }
    if (park) {
      const lawn = roundedRect(ix0, iz0, ix1, iz1, 3, 4);
      gb.park.cap(lawn, CURB + 0.03, 18, GRASS_TINT);
      gb.curb.extrude(lawn, CURB, CURB + 0.03, 4.5, 4.5, WHITE, 0, true);
      const mx = (ix0 + ix1) / 2, mz = (iz0 + iz1) / 2;
      gb.walk.flat(ix0, mz - 1.6, ix1, mz + 1.6, CURB + 0.05, 6, WHITE); gb.walk.flat(mx - 1.6, iz0, mx + 1.6, iz1, CURB + 0.05, 6, WHITE);
      for (let k = 0; k < 40; k++) {
        const bx = ix0 + 4 + rnd() * (ix1 - ix0 - 8), bz = iz0 + 4 + rnd() * (iz1 - iz0 - 8);
        if (Math.abs(bx - mx) > 3 && Math.abs(bz - mz) > 3 && !wet(bx, bz, 3) && !(landmarkAt(i, j) && Math.abs(bx - mx) < 32 && Math.abs(bz - mz) < 16)) L.bushes.push([bx, bz, 0.9 + rnd() * 0.9, CURB + 0.03]);
      }
      for (let k = 0; k < 44; k++) {
        const x = ix0 + 6 + rnd() * (ix1 - ix0 - 12), z = iz0 + 6 + rnd() * (iz1 - iz0 - 12);
        if (Math.abs(x - mx) < 4 || Math.abs(z - mz) < 4) continue;
        if (landmarkAt(i, j) && Math.abs(x - mx) < 32 && Math.abs(z - mz) < 16) continue;               // (room for the wheel)
        this.tree(ctx, x, z, 1.0 + rnd() * 0.8, CURB + 0.03, rnd() < 0.25);
      }
      for (let k = 0; k < 6; k++) { const px = k < 3 ? mx + 3 : mx - 3, pz = mz - 24 + k * 16; if (!wet(px, pz, 4)) L.benches.push([px, pz, k < 3 ? -Math.PI / 2 : Math.PI / 2, CURB + 0.05]); }
      return;
    }

    // Buildings on lots.
    const houseBlock = zone === 'sub' ? hash3(i, j, 5) < 0.93 : zone === 'low' ? hash3(i, j, 5) < 0.5 : false;
    const maxLot = zone === 'down' ? 60 : zone === 'mid' ? 44 : houseBlock ? 30 : 36;
    const lots = []; subdivide({ x0: ix0, z0: iz0, x1: ix1, z1: iz1 }, maxLot, rnd, lots);
    for (const lot of lots) {
      ctx.setLot(lot);
      if (this.nearWater(lot)) { this.riverLot(ctx, lot, rnd); continue; }
      if (yield* this.avenueLot(ctx, lot, zone, d, rnd)) continue;
      const faces = [];
      if (lot.x0 - ix0 < 0.5) faces.push({ dir: [-1, 0], line: i, axis: 'x' });
      if (ix1 - lot.x1 < 0.5) faces.push({ dir: [1, 0], line: i + 1, axis: 'x' });
      if (lot.z0 - iz0 < 0.5) faces.push({ dir: [0, -1], line: j, axis: 'z' });
      if (iz1 - lot.z1 < 0.5) faces.push({ dir: [0, 1], line: j + 1, axis: 'z' });
      const onBlvd = faces.some(f => isBlvd(f.line)), hz = hash3(Math.round(lot.x0), Math.round(lot.z0), 61);
      const civic = faces.length && !houseBlock && lot.x1 - lot.x0 > 22 && lot.z1 - lot.z0 > 22 ? (zone === 'down' || zone === 'mid' ? (hz < 0.02 ? 'bank' : hz < 0.04 ? 'hotel' : hz < 0.055 ? 'cinema' : null) : zone === 'low' && hz < 0.012 ? 'bank' : null) : null;
      if (civic) this.civic(ctx, lot, faces, zone, civic, rnd);
      else if (!houseBlock && zone !== 'sub' && !faces.length === false && hz > 0.97 && lot.x1 - lot.x0 > 26) this.construction(ctx, lot, faces, rnd);
      else if (houseBlock && !onBlvd) this.addHouse(ctx, lot, faces, rnd);
      else if (!faces.length && (zone === 'low' || zone === 'sub') && rnd() < 0.4) this.parkingLot(ctx, lot, rnd);
      else this.addBuilding(ctx, lot, faces, zone, d, onBlvd, rnd);
      if (performance.now() > this.deadline) yield;
    }
  }

  // Is any part of this lot close to the water? (Samples round the edge and across the middle.)
  nearWater(lot) {
    if (!inRiverBox((lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, 140)) return false;
    for (const fx of [0, 0.25, 0.5, 0.75, 1]) for (const fz of [0, 0.25, 0.5, 0.75, 1]) if (riverSdf(lot.x0 + (lot.x1 - lot.x0) * fx, lot.z0 + (lot.z1 - lot.z0) * fz) < 12) return true;
    return false;
  }
  // The land beside the water: a lawn with a gravel walk along the quay, trees, bushes and benches looking out over the river.
  riverLot(ctx, lot, rnd) {
    if (ctx.cur && docksBlock(ctx.cur[0], ctx.cur[1])) return this.dockLot(ctx, lot, rnd);
    const G = ctx.gb, L = ctx.L, lw = lot.x1 - lot.x0, ld = lot.z1 - lot.z0;
    G.park.cap(rectPoly({ x0: lot.x0 + 0.3, z0: lot.z0 + 0.3, x1: lot.x1 - 0.3, z1: lot.z1 - 0.3 }), CURB + 0.03, 18, GRASS_TINT);
    const n = Math.round(lw * ld / 150);
    for (let k = 0; k < n; k++) {
      const x = lot.x0 + 2 + rnd() * (lw - 4), z = lot.z0 + 2 + rnd() * (ld - 4), d = riverSdf(x, z);
      if (d < 5.5) continue;
      if (rnd() < 0.3) { if (!wet(x, z, 3)) L.bushes.push([x, z, 0.8 + rnd() * 0.8, CURB + 0.03]); } else this.tree(ctx, x, z, 0.95 + rnd() * 0.7, CURB + 0.03, rnd() < 0.3);
    }
    // benches along the quay, facing the water
    for (let k = 0; k < Math.round((lw + ld) / 40); k++) {
      const x = lot.x0 + 1 + rnd() * (lw - 2), z = lot.z0 + 1 + rnd() * (ld - 2), d = riverSdf(x, z);
      if (d < 2.6 || d > 4.2) continue;
      const gx = riverSdf(x + 1, z) - riverSdf(x - 1, z), gz = riverSdf(x, z + 1) - riverSdf(x, z - 1), yaw = Math.atan2(-gx, -gz);       // looking at the water
      L.benches.push([x, z, yaw, CURB + 0.03]); addCollider({ type: 'circ', x, z, r: 0.55, brk: { kind: 'bench', i: L.benches.length - 1, yaw, key: brkKey(x, z) } }, ctx.colliders);
    }
  }

  tree(ctx, x, z, sc, y, palm) {
    if (wet(x, z, 2.5)) return;
    (palm ? ctx.L.palms : ctx.L.trees).push([x, z, sc, y]);
    addCollider({ type: 'circ', x, z, r: palm ? 0.4 : 0.45 }, ctx.colliders);
  }

  // A strip of pavement and palms beyond the ring road, on the edges of the map.
  outerStrip(ctx, i, j, b, rnd) {
    const S = 6, gb = ctx.gb;
    const add = (x0, z0, x1, z1, palmsAlong) => {
      gb.walk.flat(x0, z0, x1, z1, CURB, 6, WHITE); gb.curb.walls(x0, z0, x1, z1, 0, CURB, 4.5, 4.5, WHITE);
      for (let t = 10; t < palmsAlong; t += 26) ctx.L.palms.push(x1 - x0 < z1 - z0 ? [(x0 + x1) / 2, z0 + t, 0.85 + rnd() * 0.45, CURB] : [x0 + t, (z0 + z1) / 2, 0.85 + rnd() * 0.45, CURB]);
    };
    if (i === -N) add(-N * SP - hw(-N) - S, b.z0, -N * SP - hw(-N), b.z1, b.z1 - b.z0);
    if (i === N - 1) add(N * SP + hw(N), b.z0, N * SP + hw(N) + S, b.z1, b.z1 - b.z0);
    if (j === -N) add(b.x0, -N * SP - hw(-N) - S, b.x1, -N * SP - hw(-N), b.x1 - b.x0);
    if (j === N - 1) add(b.x0, N * SP + hw(N), b.x1, N * SP + hw(N) + S, b.x1 - b.x0);
  }

  // Road markings, medians and signs on one stretch of road: line k of the given
  // axis ('x': an avenue at x = k*SP running along z; 'z': a street at z = k*SP
  // running along x), between crossing lines `seg` and `seg + 1`.
  segment(ctx, axis, k, seg, rnd) {
    const gb = ctx.gb, C = k * SP, rs = axis === 'x' ? -1 : 1;
    const W = new THREE.Color(0.9, 0.9, 0.86), Y = new THREE.Color(0.92, 0.7, 0.2);
    const rect = (a0, a1, c0, c1, y, color) => {
      const [p0, p1] = [Math.min(a0, a1), Math.max(a0, a1)], [q0, q1] = [Math.min(c0, c1), Math.max(c0, c1)];
      if (axis === 'x') gb.mark.flat(C + q0, p0, C + q1, p1, y, 10, color); else gb.mark.flat(p0, C + q0, p1, C + q1, y, 10, color);
    };
    const m = medianHalf(k), lw = laneW(k), nl = laneCount(k), H = hw(k);
    const aA = seg * SP + hw(seg), aB = (seg + 1) * SP - hw(seg + 1);
    const rA = (axis === 'x' ? isRound(k, seg) : isRound(seg, k)) ? RB.outer + 1.5 - hw(seg) : 0, rB = (axis === 'x' ? isRound(k, seg + 1) : isRound(seg + 1, k)) ? RB.outer + 1.5 - hw(seg + 1) : 0;   // (round a roundabout, the crossings and lane lines start further out)
    for (const [a0, dir] of [[aA + 0.6 + rA, 1], [aB - 0.6 - rB, -1]]) {                 // crosswalks and stop lines
      for (let c = -H + 1; c < H - 1; c += 1.25) rect(a0, a0 + dir * 4, c, c + 0.6, 0.012, W);
      const side = dir > 0 ? -rs : rs;
      rect(a0 + dir * 5.2, a0 + dir * 5.7, side * m, side * (m + nl * lw), 0.012, W);
    }
    const s0 = aA + 6.5 + rA, s1 = aB - 6.5 - rB;
    for (const side of [-1, 1]) {
      for (let b = 1; b < nl; b++) { const c = side * (m + b * lw); for (let a = s0; a < s1 - 3; a += 9) rect(a, a + 3, c - 0.07, c + 0.07, 0.012, W); }
      const ce = side * (m + nl * lw); rect(s0, s1, ce - 0.08, ce + 0.08, 0.012, W);
    }
    if (m === 0) { rect(s0, s1, -0.25, -0.1, 0.012, Y); rect(s0, s1, 0.1, 0.25, 0.012, Y); }
    else {
      for (const side of [-1, 1]) rect(s0, s1, side * (m + 0.25), side * (m + 0.4), 0.012, Y);
      const a0 = aA + 7, a1 = aB - 7;                                          // raised median with palms
      if (axis === 'x') { gb.park.flat(C - m, a0, C + m, a1, MEDIAN_H, 18, WHITE); gb.curb.walls(C - m, a0, C + m, a1, 0, MEDIAN_H, 4.5, 4.5, WHITE); }
      else { gb.park.flat(a0, C - m, a1, C + m, MEDIAN_H, 18, WHITE); gb.curb.walls(a0, C - m, a1, C + m, 0, MEDIAN_H, 4.5, 4.5, WHITE); }
      for (let a = a0 + 6; a < a1 - 3; a += 21) if (!wet(axis === 'x' ? C : a, axis === 'x' ? a : C, 3)) ctx.L.palms.push(axis === 'x' ? [C, a, 0.95 + rnd() * 0.35, MEDIAN_H] : [a, C, 0.95 + rnd() * 0.35, MEDIAN_H]);
      for (let a = a0 + 3; a < a1 - 1; a += 5.5) {                                // a lush strip of bushes down the median
        const o = (rnd() - 0.5) * 2.2, sc = 0.9 + rnd() * 0.7;
        if (!wet(axis === 'x' ? C : a, axis === 'x' ? a : C, 3)) ctx.L.bushes.push(axis === 'x' ? [C + o, a, sc, MEDIAN_H] : [a, C + o, sc, MEDIAN_H]);
      }
      if (hash3(k, seg, axis === 'x' ? 1 : 2) < 0.2 && !wet(axis === 'x' ? (aA + aB) / 2 : C, axis === 'x' ? C : (aA + aB) / 2, 60)) this.gantry(ctx, axis, k, (aA + aB) / 2, m, lw, nl, H);
    }
  }

  // An overhead road sign over a boulevard, one panel over each direction.
  gantry(ctx, axis, k, a, m, lw, nl, H) {
    ctx.setPoint(axis === 'x' ? k * SP : a, axis === 'x' ? a : k * SP);
    const gb = ctx.gb, C = k * SP, dark = new THREE.Color(0.5, 0.52, 0.55), ext = H + 1.4;
    const n = (hash3(k, Math.round(a), 7) * 16) | 0, cc = n % 2, rr = (n / 2) | 0;
    const u0 = cc / 2 + 0.003, u1 = (cc + 1) / 2 - 0.003, v0 = 1 - (rr + 1) / 8 + 0.003, v1 = 1 - rr / 8 - 0.003;
    const w = 9, y0 = 4.9, h = 2.6, mid = m + nl * lw / 2;
    if (axis === 'x') {
      for (const s of [-1, 1]) { gb.props.box(C + s * ext - 0.3, a - 0.3, C + s * ext + 0.3, a + 0.3, 0, 8, 4, dark); addCollider({ type: 'circ', x: C + s * ext, z: a, r: 0.45 }, ctx.colliders); }
      gb.props.box(C - ext, a - 0.35, C + ext, a + 0.35, 7.3, 8, 4, dark);
      gb.gantry.quad([C + mid - w / 2, y0, a + 0.4], [w, 0, 0], [0, h, 0], u0, v0, u1, v1);
      gb.gantry.quad([C - mid + w / 2, y0, a - 0.4], [-w, 0, 0], [0, h, 0], u0, v0, u1, v1);
    } else {
      for (const s of [-1, 1]) { gb.props.box(a - 0.3, C + s * ext - 0.3, a + 0.3, C + s * ext + 0.3, 0, 8, 4, dark); addCollider({ type: 'circ', x: a, z: C + s * ext, r: 0.45 }, ctx.colliders); }
      gb.props.box(a - 0.35, C - ext, a + 0.35, C + ext, 7.3, 8, 4, dark);
      gb.gantry.quad([a - 0.4, y0, C + mid - w / 2], [0, 0, w], [0, h, 0], u0, v0, u1, v1);
      gb.gantry.quad([a + 0.4, y0, C - mid + w / 2], [0, 0, -w], [0, h, 0], u0, v0, u1, v1);
    }
  }

  // Traffic signals on the four corners of junction (i, j), facing the approaches.
  junction(ctx, i, j) {
    if (isRound(i, j)) return this.roundabout(ctx, i, j);
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (Math.abs(i - dx) > N || Math.abs(j - dz) > N) continue;
      const rx = -dz, rz = dx, lat = dz !== 0 ? hw(i) : hw(j), lon = dz !== 0 ? hw(j) : hw(i);
      const x = i * SP + rx * (lat + 2.2) - dx * (lon + 2.2), z = j * SP + rz * (lat + 2.2) - dz * (lon + 2.2);
      (dz !== 0 ? ctx.L.sigZ : ctx.L.sigX).push([x, z, Math.atan2(dz, -dx), Math.min(lat - 1, 8.5)]);
      addCollider({ type: 'circ', x, z, r: 0.3 }, ctx.colliders);
    }
  }

  // A quay in the docks: tarmac, rows of containers stacked up to three high, and (often) a container crane straddling the quay edge.
  dockLot(ctx, lot, rnd) {
    const G = ctx.gb, lw = lot.x1 - lot.x0, ld = lot.z1 - lot.z0, cols = [[0.75, 0.12, 0.1], [0.1, 0.3, 0.6], [0.15, 0.5, 0.3], [0.9, 0.5, 0.1], [0.55, 0.55, 0.58], [0.88, 0.88, 0.85], [0.45, 0.28, 0.16], [0.8, 0.7, 0.15]].map(c => new THREE.Color(...c));
    G.lot.flat(lot.x0 + 0.4, lot.z0 + 0.4, lot.x1 - 0.4, lot.z1 - 0.4, CURB + 0.012, 10);
    for (let z = lot.z0 + 2.5, row = 0; z + 2.5 < lot.z1 - 1; z += 2.9, row++) {
      if (row % 4 === 3) continue;                                                              // an aisle
      for (let x = lot.x0 + 2; x + 12.2 < lot.x1 - 1;) {
        const run = 1 + Math.floor(rnd() * 3), ok = [0, 12.2].every(dx => riverSdf(x + dx, z + 1.25) > 12) && riverSdf(x + 6, z + 1.25) > 12;
        if (rnd() < 0.78 && ok) {
          const hgt = 1 + Math.floor(rnd() * 3), c = cols[(rnd() * cols.length) | 0];
          for (let h = 0; h < hgt; h++) G.props.box(x, z, x + 12, z + 2.5, CURB + h * 2.65, CURB + (h + 1) * 2.62, 3, h % 2 ? cols[(rnd() * cols.length) | 0] : c);
          addCollider({ type: 'box', x0: x, z0: z, x1: x + 12, z1: z + 2.5 }, ctx.colliders);
        }
        x += 12.6 * (rnd() < 0.2 ? 2 : 1);
      }
    }
    if (rnd() < 0.55) {                                                                         // a crane at the quay: walk from the middle of the lot toward the water
      let px = (lot.x0 + lot.x1) / 2, pz = (lot.z0 + lot.z1) / 2;
      for (let k = 0; k < 40 && riverSdf(px, pz) > 5; k++) { const gx = riverSdf(px + 1, pz) - riverSdf(px - 1, pz), gz = riverSdf(px, pz + 1) - riverSdf(px, pz - 1), l = Math.hypot(gx, gz) || 1; px -= gx / l * 3; pz -= gz / l * 3; }
      if (riverSdf(px, pz) < 8 && riverSdf(px, pz) > 0 && px > lot.x0 + 8 && px < lot.x1 - 8 && pz > lot.z0 + 8 && pz < lot.z1 - 8) {
        const gx = riverSdf(px + 1, pz) - riverSdf(px - 1, pz), gz = riverSdf(px, pz + 1) - riverSdf(px, pz - 1), l = Math.hypot(gx, gz) || 1, yaw = Math.atan2(-gx / l, -gz / l);
        const T = new GB(true), blue = new THREE.Color(0.15, 0.3, 0.55), grey = new THREE.Color(0.7, 0.72, 0.76), org = new THREE.Color(0.9, 0.45, 0.1);
        for (const u of [-7, 7]) for (const w of [-5, 5]) tube(T, [u, CURB, w], [u, 30, w], 0.7, blue);
        for (const w of [-5, 5]) tube(T, [-7, 30, w], [7, 30, w], 0.6, blue);
        for (const u of [-7, 7]) tube(T, [u, 30, -5], [u, 30, 5], 0.6, blue);
        for (const u of [-5, 5]) tube(T, [u, 32, -30], [u, 32, 42], 0.55, org);
        tube(T, [-5, 32, -30], [5, 32, -30], 0.4, org); tube(T, [-5, 32, 42], [5, 32, 42], 0.4, org);
        T.box(-4, -14, 4, -6, 28, 33, 3, grey); T.box(-2, 17, 2, 21, 29.5, 31, 3, grey); tube(T, [0, 29.5, 19], [0, 9, 19], 0.15, grey); T.box(-6, 17, 6, 21, 8.3, 10.9, 3, org);
        G.props.addTransformed(T, yaw, px, 0, pz);
        const c = Math.cos(yaw), sn = Math.sin(yaw);
        for (const u of [-7, 7]) for (const w of [-5, 5]) addCollider({ type: 'circ', x: px + u * c + w * sn, z: pz - u * sn + w * c, r: 0.9 }, ctx.colliders);
      }
    }
  }
  // The square in front of the cathedral: rows of trees along it, benches round the fountain, bushes down the sides of the church.
  square(ctx, b, rnd) {
    const L = ctx.L, mx = (b.x0 + b.x1) / 2, fz = b.z1 - 20, n = 9;
    for (let k = 0; k < n; k++) { const x = b.x0 + 12 + k * ((b.x1 - b.x0 - 24) / (n - 1)); for (const zz of [b.z1 - 6, b.z1 - 44]) { if (Math.abs(x - mx) < 10 && zz > b.z1 - 30) continue; this.tree(ctx, x, zz, 1.1 + rnd() * 0.5, CURB, rnd() < 0.2); } }
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + 0.5, bx = mx + Math.cos(a) * 9.5, bz = fz + Math.sin(a) * 9.5, yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
      L.benches.push([bx, bz, yaw, CURB]); addCollider({ type: 'circ', x: bx, z: bz, r: 0.55, brk: { kind: 'bench', i: L.benches.length - 1, yaw, key: brkKey(bx, bz) } }, ctx.colliders);
    }
    for (let z = b.z0 + 10; z < b.z1 - 60; z += 9) for (const x of [b.x0 + 9, b.x1 - 9]) L.bushes.push([x + (rnd() - 0.5) * 3, z, 0.9 + rnd() * 0.5, CURB]);
  }

  // --- Civic buildings, café terraces, plazas, construction sites and the signature skyscrapers -------------------------------------
  // Where a point is on a building's face: t along it, o out from it (f.dir is the way the face looks).
  facePt(b, f, t, o) {
    const [dx, dz] = f.dir, base = dx < 0 ? b.x0 : dx > 0 ? b.x1 : dz < 0 ? b.z0 : b.z1, mid = dx !== 0 ? (b.z0 + b.z1) / 2 : (b.x0 + b.x1) / 2;
    return dx !== 0 ? [base + dx * o, mid + t] : [mid + t, base + dz * o];
  }
  // A box on a building's face, from t0 to t1 along it and o0 to o1 out from it.
  faceBox(gb, b, f, t0, t1, o0, o1, y0, y1, col) {
    const [x0, z0] = this.facePt(b, f, t0, o0), [x1, z1] = this.facePt(b, f, t1, o1);
    gb.box(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y0, y1, 4, col);
  }
  // A lit sign on a building's face (a cell of the sign atlas: 0 bank, 1 hotel, 2 cinema, 3 cash machine), `w` wide and `h` tall, centred at t.
  faceSign(ctx, b, f, special, t, o, y, w, h) {
    const [px, pz] = this.facePt(b, f, t, o), [dx, dz] = f.dir, [u0, v0, u1, v1] = this.signUV(ctx, special);
    ctx.gb.sign.quad([px - dz * w / 2, y, pz + dx * w / 2], [dz * w, 0, -dx * w], [0, h, 0], u0, v0, u1, v1);
  }
  // A bank, a hotel or a cinema: an ordinary mass with the front of the real thing. The bank is stone with a portico of columns under a pediment,
  // steps, bronze doors, its name in gold and a cash machine on the pavement; the hotel a tall tower with a canopy and flags; the cinema a marquee.
  civic(ctx, lot, faces, zone, kind, rnd) {
    CIVIC.set(kind + Math.round(lot.x0) + ',' + Math.round(lot.z0), [kind, (lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2]);
    const f = faces[0], g = 1.0 + rnd() * 1.4, b = { x0: lot.x0 + g, z0: lot.z0 + g, x1: lot.x1 - g, z1: lot.z1 - g }, G = ctx.gb;
    for (const ff of faces) { if (ff.dir[0] < 0) b.x0 = lot.x0 + 0.3; if (ff.dir[0] > 0) b.x1 = lot.x1 - 0.3; if (ff.dir[1] < 0) b.z0 = lot.z0 + 0.3; if (ff.dir[1] > 0) b.z1 = lot.z1 - 0.3; }
    const stone = new THREE.Color(0.86, 0.82, 0.74), dark = new THREE.Color(0.16, 0.12, 0.09), gold = new THREE.Color(0.85, 0.65, 0.2), along = f.dir[0] !== 0 ? b.z1 - b.z0 : b.x1 - b.x0;
    if (kind === 'bank') {
      this.buildMass(ctx, b, 'modern', 20 + Math.floor(rnd() * 2) * 3.5, faces, rnd, { rect: true, color: stone });
      const W = Math.min(along - 6, 20), n = 6, step = W / (n - 1);
      this.faceBox(G.props, b, f, -W / 2 - 1.2, W / 2 + 1.2, 0, 3.4, CURB, CURB + 0.5, stone); this.faceBox(G.props, b, f, -W / 2 - 0.6, W / 2 + 0.6, 0, 2.6, CURB + 0.5, CURB + 1.0, stone);     // steps
      for (let k = 0; k < n; k++) { const [cx, cz] = this.facePt(b, f, -W / 2 + k * step, 1.7); G.props.extrude(circlePoly(cx, cz, 0.55, 10), CURB + 1.0, CURB + 10.2, 4, 4, stone, 0, true); G.props.cap(circlePoly(cx, cz, 0.55, 10), CURB + 10.2, 4, stone); addCollider({ type: 'circ', x: cx, z: cz, r: 0.6 }, ctx.colliders); }
      this.faceBox(G.props, b, f, -W / 2 - 0.9, W / 2 + 0.9, 0, 2.5, CURB + 10.2, CURB + 12.2, stone);                                                                                       // entablature
      const [ax, az] = this.facePt(b, f, -W / 2 - 0.9, 0), [bx, bz] = this.facePt(b, f, W / 2 + 0.9, 2.5), x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
      const ridge = f.dir[0] !== 0 ? [[(x0 + x1) / 2, z1], [(x0 + x1) / 2, z1], [(x0 + x1) / 2, z0], [(x0 + x1) / 2, z0]] : [[x0, (z0 + z1) / 2], [x0, (z0 + z1) / 2], [x1, (z0 + z1) / 2], [x1, (z0 + z1) / 2]];
      G.roof.loft([[x0, z1], [x1, z1], [x1, z0], [x0, z0]], CURB + 12.2, ridge, CURB + 14.6, 5, new THREE.Color(0.8, 0.76, 0.7));                                                   // the pediment
      this.faceBox(G.props, b, f, -1.3, 1.3, -0.02, 0.4, CURB + 1.0, CURB + 5.6, dark);                                                                                               // the doors
      this.faceSign(ctx, b, f, 0, 0, 2.52, CURB + 10.3, Math.min(8, W * 0.5), 1.75);
      const [kx, kz] = this.facePt(b, f, W / 2 + 3.2, 1.0); const kb = { x0: kx - 0.55, x1: kx + 0.55, z0: kz - 0.55, z1: kz + 0.55 };                                                    // a cash machine on the pavement, with its queue marker
      G.props.box(kb.x0, kb.z0, kb.x1, kb.z1, CURB, CURB + 2.2, 3, new THREE.Color(0.25, 0.27, 0.3)); this.faceSign(ctx, { x0: kb.x0 + 0.55, x1: kb.x0 + 0.55, z0: kb.z0 + 0.55, z1: kb.z0 + 0.55 }, f, 3, 0, 0.58, CURB + 1.5, 0.9, 0.45);
      addCollider({ type: 'box', ...kb }, ctx.colliders);
    } else if (kind === 'hotel') {
      this.buildMass(ctx, b, 'modern', 40 + Math.floor(rnd() * 5) * 3.5, faces, rnd, { rect: true });
      const W = Math.min(along - 8, 14);
      this.faceBox(G.props, b, f, -W / 2, W / 2, 0, 4.2, CURB + 5.2, CURB + 5.7, new THREE.Color(0.2, 0.22, 0.26));                                                                      // the canopy
      for (const t of [-W / 2 + 0.6, W / 2 - 0.6]) { const [cx, cz] = this.facePt(b, f, t, 3.7); G.props.box(cx - 0.18, cz - 0.18, cx + 0.18, cz + 0.18, CURB, CURB + 5.2, 3, gold); addCollider({ type: 'circ', x: cx, z: cz, r: 0.3 }, ctx.colliders); }
      this.faceSign(ctx, b, f, 1, 0, 0.12, CURB + 6.4, Math.min(8.5, W * 0.7), 2.1);
      for (const t of [-W / 2 - 1.5, W / 2 + 1.5]) { const [px, pz] = this.facePt(b, f, t, 1.0), [dx, dz] = f.dir; G.props.box(px - 0.07, pz - 0.07, px + 0.07, pz + 0.07, CURB, CURB + 7.5, 3, new THREE.Color(0.7, 0.7, 0.72)); G.gantry.quad([px + 0.1 * (dx ? 0 : 1), CURB + 5.4, pz + 0.1 * (dz ? 0 : 1)], [-dz * 1.9, 0, dx * 1.9], [0, 1.2, 0], 0.02, 0.02, 0.2, 0.1); addCollider({ type: 'circ', x: px, z: pz, r: 0.2 }, ctx.colliders); }   // two flagpoles
    } else {
      this.buildMass(ctx, b, 'brick', 14, faces, rnd, { rect: true });
      const W = Math.min(along - 4, 13);
      this.faceBox(G.props, b, f, -W / 2, W / 2, 0, 3.4, CURB + 4.6, CURB + 5.1, new THREE.Color(0.9, 0.2, 0.55));                                                                      // the lit marquee
      this.faceSign(ctx, b, f, 2, 0, 0.1, CURB + 5.4, Math.min(10, W * 0.85), 3.4);
      for (let k = 0; k < 3; k++) { const t = -W / 2 + 1.6 + k * ((W - 3.2) / 2); this.faceBox(G.props, b, f, t - 0.7, t + 0.7, -0.05, 0.12, CURB + 1.2, CURB + 3.2, new THREE.Color(0.6 + rnd() * 0.4, 0.2 + rnd() * 0.5, 0.3 + rnd() * 0.5)); }   // film posters
    }
  }
  // A café terrace in front of a shop: round tables, chairs and a striped umbrella over each, on the pavement.
  terrace(ctx, b, f, rnd) {
    const G = ctx.gb, along = f.dir[0] !== 0 ? b.z1 - b.z0 : b.x1 - b.x0, n = Math.min(4, Math.floor((along - 3) / 4.2)), cols = [[0.8, 0.15, 0.12], [0.15, 0.4, 0.7], [0.9, 0.7, 0.2], [0.2, 0.55, 0.3]].map(c => new THREE.Color(...c));
    const t0 = (rnd() - 0.5) * Math.max(0, along - n * 4.2 - 3) * 0.5;
    for (let k = 0; k < n; k++) {
      const t = t0 + (k - (n - 1) / 2) * 4.2, [px, pz] = this.facePt(b, f, t, 1.15), col = cols[(rnd() * cols.length) | 0];
      G.props.extrude(circlePoly(px, pz, 0.42, 8), CURB, CURB + 0.78, 3, 3, new THREE.Color(0.15, 0.15, 0.17), 0, true); G.props.cap(circlePoly(px, pz, 0.45, 8), CURB + 0.78, 3, new THREE.Color(0.85, 0.82, 0.75));
      G.props.box(px - 0.04, pz - 0.04, px + 0.04, pz + 0.04, CURB + 0.78, CURB + 2.3, 3, new THREE.Color(0.8, 0.8, 0.8));
      G.props.loft(circlePoly(px, pz, 1.5, 10), CURB + 2.15, circlePoly(px, pz, 0.12, 10), CURB + 2.65, 4, col);
      for (const a of [0.6, 2.2, 3.8, 5.4]) G.props.box(px + Math.cos(a) * 0.72 - 0.2, pz + Math.sin(a) * 0.72 - 0.2, px + Math.cos(a) * 0.72 + 0.2, pz + Math.sin(a) * 0.72 + 0.2, CURB, CURB + 0.46, 3, new THREE.Color(0.2, 0.2, 0.22));
      addCollider({ type: 'circ', x: px, z: pz, r: 0.55 }, ctx.colliders);
    }
  }
  // A paved square instead of a block of buildings: a fountain, rows of trees, benches round it, stalls selling things under striped canopies.
  plaza(ctx, r, rnd) {
    const G = ctx.gb, L = ctx.L, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, stone = new THREE.Color(0.8, 0.77, 0.72);
    G.walk.cap(rectPoly({ x0: r.x0 + 1, z0: r.z0 + 1, x1: r.x1 - 1, z1: r.z1 - 1 }), CURB + 0.04, 5, new THREE.Color(1.05, 1.0, 0.95));
    G.props.extrude(circlePoly(cx, cz, 7, 28), CURB, CURB + 0.8, 4, 4, stone, 0, true); G.props.cap(circlePoly(cx, cz, 7, 28), CURB + 0.8, 4, stone); G.props.cap(circlePoly(cx, cz, 6.5, 28), CURB + 0.86, 4, new THREE.Color(0.3, 0.6, 0.75));
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; G.props.extrude(circlePoly(cx + Math.cos(a) * 2.6, cz + Math.sin(a) * 2.6, 0.45, 8), CURB + 0.8, CURB + 3.8, 3, 3, stone, 0, true); }
    G.props.extrude(circlePoly(cx, cz, 0.7, 10), CURB + 0.8, CURB + 4.8, 3, 3, stone, 0, true); G.props.cap(circlePoly(cx, cz, 0.7, 10), CURB + 4.8, 3, stone);
    addCollider({ type: 'circ', x: cx, z: cz, r: 7 }, ctx.colliders);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2, bx = cx + Math.cos(a) * 9.6, bz = cz + Math.sin(a) * 9.6, yaw = Math.atan2(-Math.cos(a), -Math.sin(a)); L.benches.push([bx, bz, yaw, CURB + 0.04]); addCollider({ type: 'circ', x: bx, z: bz, r: 0.55, brk: { kind: 'bench', i: L.benches.length - 1, yaw, key: brkKey(bx, bz) } }, ctx.colliders); }
    for (let x = r.x0 + 12; x < r.x1 - 8; x += 15) for (const z of [r.z0 + 10, r.z1 - 10]) this.tree(ctx, x, z, 1.1 + rnd() * 0.5, CURB + 0.04, rnd() < 0.3);
    for (let z = r.z0 + 28; z < r.z1 - 20; z += 15) for (const x of [r.x0 + 10, r.x1 - 10]) this.tree(ctx, x, z, 1.1 + rnd() * 0.5, CURB + 0.04, rnd() < 0.3);
    // a pattern in the paving, a clock tower at the north end, a bandstand, and planters down the middle
    const line = new THREE.Color(0.55, 0.53, 0.5);
    for (let x = r.x0 + 12; x < r.x1 - 6; x += 12) G.mark.flat(x - 0.07, r.z0 + 1, x + 0.07, r.z1 - 1, CURB + 0.055, 10, line);
    for (let z = r.z0 + 12; z < r.z1 - 6; z += 12) G.mark.flat(r.x0 + 1, z - 0.07, r.x1 - 1, z + 0.07, CURB + 0.055, 10, line);
    const tx = cx, tz = r.z0 + 11, tw = new THREE.Color(0.8, 0.74, 0.62), face = new THREE.Color(0.96, 0.95, 0.9);
    G.props.box(tx - 3, tz - 3, tx + 3, tz + 3, CURB + 0.04, CURB + 24, 4, tw); G.props.box(tx - 3.4, tz - 3.4, tx + 3.4, tz + 3.4, CURB + 24, CURB + 25, 4, new THREE.Color(0.55, 0.5, 0.42));
    G.roof.loft([[tx - 3.6, tz + 3.6], [tx + 3.6, tz + 3.6], [tx + 3.6, tz - 3.6], [tx - 3.6, tz - 3.6]], CURB + 25, [[tx, tz], [tx, tz], [tx, tz], [tx, tz]], CURB + 33, 5, new THREE.Color(0.2, 0.3, 0.28));
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) for (let k = 0; k < 16; k++) {                                  // four clock faces
      const a = k / 16 * Math.PI * 2, b = (k + 1) / 16 * Math.PI * 2, P = t => { const u = Math.cos(t) * 2.1, v = Math.sin(t) * 2.1; return [tx + dx * 3.04 - dz * u, CURB + 19 + v, tz + dz * 3.04 + dx * u]; };
      quadToward(G.props, [tx + dx * 3.04, CURB + 19, tz + dz * 3.04], P(a), P(b), [tx + dx * 3.04, CURB + 19, tz + dz * 3.04], [[0, 0], [1, 0], [1, 1], [0, 1]], face, [dx, 0, dz]);
    }
    G.props.box(tx - 0.08 + 0.02, tz + 3.05, tx + 0.08, tz + 3.1, CURB + 19, CURB + 20.7, 3, new THREE.Color(0.1, 0.1, 0.1)); G.props.box(tx - 0.08, tz + 3.05, tx + 1.0, tz + 3.1, CURB + 19, CURB + 19.15, 3, new THREE.Color(0.1, 0.1, 0.1));
    addCollider({ type: 'box', x0: tx - 3, x1: tx + 3, z0: tz - 3, z1: tz + 3 }, ctx.colliders);
    const bx = cx - 44, bz = cz, copper = new THREE.Color(0.3, 0.55, 0.5);
    G.props.extrude(circlePoly(bx, bz, 4.6, 8), CURB + 0.04, CURB + 0.9, 3, 3, stone, 0, false); G.props.cap(circlePoly(bx, bz, 4.6, 8), CURB + 0.9, 3, stone);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.39; G.props.box(bx + Math.cos(a) * 4.1 - 0.15, bz + Math.sin(a) * 4.1 - 0.15, bx + Math.cos(a) * 4.1 + 0.15, bz + Math.sin(a) * 4.1 + 0.15, CURB + 0.9, CURB + 4.2, 3, new THREE.Color(0.92, 0.9, 0.86)); }
    G.roof.loft(circlePoly(bx, bz, 5.2, 8), CURB + 4.2, circlePoly(bx, bz, 0.2, 8), CURB + 7.4, 5, copper); addCollider({ type: 'circ', x: bx, z: bz, r: 4.6 }, ctx.colliders);
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
      const px = cx + s * (16 + k * 15) - 1, pz = cz - 1; G.props.box(px, pz, px + 2, pz + 2, CURB + 0.04, CURB + 0.75, 3, new THREE.Color(0.7, 0.68, 0.65)); L.bushes.push([px + 1, pz + 1, 0.9 + rnd() * 0.5, CURB + 0.75]); addCollider({ type: 'box', x0: px, x1: px + 2, z0: pz, z1: pz + 2 }, ctx.colliders);
    }
    const cols = [[0.85, 0.2, 0.15], [0.2, 0.5, 0.8], [0.95, 0.75, 0.2], [0.25, 0.65, 0.35], [0.9, 0.45, 0.1]].map(c => new THREE.Color(...c));
    for (const rowZ of [cz - 27, cz + 27]) for (let k = 0; k < 6; k++) {
      const sx = cx - 40 + k * 16 + 1, col = cols[(rnd() * cols.length) | 0];
      G.props.box(sx, rowZ - 1.4, sx + 3.4, rowZ + 1.4, CURB + 0.04, CURB + 1.0, 3, new THREE.Color(0.55, 0.4, 0.28));                                       // the counter
      G.props.loft([[sx - 0.3, rowZ + 1.8], [sx + 3.7, rowZ + 1.8], [sx + 3.7, rowZ - 1.8], [sx - 0.3, rowZ - 1.8]], CURB + 2.4, [[sx + 1.7, rowZ + 0.4], [sx + 1.7, rowZ + 0.4], [sx + 1.7, rowZ - 0.4], [sx + 1.7, rowZ - 0.4]], CURB + 3.1, 4, col);
      for (const dx of [0, 3.4]) for (const dz of [-1.5, 1.5]) G.props.box(sx + dx - 0.05, rowZ + dz - 0.05, sx + dx + 0.05, rowZ + dz + 0.05, CURB + 0.04, CURB + 2.4, 3, new THREE.Color(0.7, 0.7, 0.72));
      for (let q = 0; q < 4; q++) G.props.box(sx + 0.2 + q * 0.8, rowZ - 0.5, sx + 0.7 + q * 0.8, rowZ + 0.4, CURB + 1.0, CURB + 1.35, 3, cols[(q + k) % cols.length]);          // things for sale
      addCollider({ type: 'box', x0: sx - 0.2, x1: sx + 3.6, z0: rowZ - 1.5, z1: rowZ + 1.5 }, ctx.colliders);
    }
  }
  // A building site: a fence, the concrete frame of a few storeys, a tall crane with its jib and counterweight, heaps of sand and a site hut.
  construction(ctx, lot, faces, rnd) {
    const G = ctx.gb, grey = new THREE.Color(0.6, 0.6, 0.6), org = new THREE.Color(0.95, 0.55, 0.1), yel = new THREE.Color(0.95, 0.8, 0.1);
    G.lot.flat(lot.x0 + 0.5, lot.z0 + 0.5, lot.x1 - 0.5, lot.z1 - 0.5, CURB + 0.012, 10);
    for (const [a, c, e, d] of [[lot.x0 + 1, lot.z0 + 1, lot.x1 - 1, lot.z0 + 1.3], [lot.x0 + 1, lot.z1 - 1.3, lot.x1 - 1, lot.z1 - 1], [lot.x0 + 1, lot.z0 + 1, lot.x0 + 1.3, lot.z1 - 1], [lot.x1 - 1.3, lot.z0 + 1, lot.x1 - 1, lot.z1 - 1]]) G.props.box(a, c, e, d, CURB, CURB + 2.2, 3, rnd() < 0.5 ? org : grey);
    const fx = (lot.x0 + lot.x1) / 2 - 3, fz = (lot.z0 + lot.z1) / 2, W = Math.min(lot.x1 - lot.x0 - 18, 24), D = Math.min(lot.z1 - lot.z0 - 18, 18), floors = 2 + Math.floor(rnd() * 3), conc = new THREE.Color(0.62, 0.61, 0.58);
    for (let fl = 0; fl <= floors; fl++) { const y = CURB + fl * 3.6; G.props.box(fx - W / 2, fz - D / 2, fx + W / 2, fz + D / 2, y, y + 0.3, 4, conc); }
    for (let i = 0; i <= 3; i++) for (let j = 0; j <= 2; j++) G.props.box(fx - W / 2 + i * W / 3 - 0.25, fz - D / 2 + j * D / 2 - 0.25, fx - W / 2 + i * W / 3 + 0.25, fz - D / 2 + j * D / 2 + 0.25, CURB, CURB + floors * 3.6 + 2.4, 3, conc);
    addCollider({ type: 'box', x0: fx - W / 2, x1: fx + W / 2, z0: fz - D / 2, z1: fz + D / 2 }, ctx.colliders);
    const T = new GB(true), cx = lot.x1 - 8, cz = lot.z1 - 8, mast = 40 + floors * 3;                                    // the crane
    for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) tube(T, [dx, CURB, dz], [dx, mast, dz], 0.12, yel);
    for (let y = 2; y < mast; y += 3) { tube(T, [-0.7, y, -0.7], [0.7, y + 3, -0.7], 0.06, yel); tube(T, [-0.7, y, 0.7], [0.7, y + 3, 0.7], 0.06, yel); }
    tube(T, [-9, mast + 1.2, 0], [34, mast + 1.2, 0], 0.4, yel); tube(T, [-9, mast + 1.2, 0.9], [34, mast + 1.2, 0.9], 0.1, yel); T.box(-0.9, -0.9, 0.9, 0.9, mast, mast + 1.2, 3, grey); T.box(-9.5, -1.1, -5, 1.1, mast - 2.4, mast + 1.2, 3, new THREE.Color(0.35, 0.35, 0.37)); T.box(-0.6, 1.0, 1.4, 2.6, mast - 1.6, mast + 0.8, 3, org);
    tube(T, [24, mast + 0.8, 0], [24, mast - 14, 0], 0.05, grey); T.box(23.5, -0.6, 24.5, 0.6, mast - 16, mast - 14, 3, org);
    G.props.addTransformed(T, rnd() * Math.PI * 2, cx, 0, cz); addCollider({ type: 'circ', x: cx, z: cz, r: 1.6 }, ctx.colliders);
    for (let k = 0; k < 3; k++) { const px = lot.x0 + 5 + rnd() * 6, pz = lot.z0 + 5 + rnd() * (lot.z1 - lot.z0 - 10); G.props.loft(circlePoly(px, pz, 2.2, 8), CURB, circlePoly(px, pz, 0.3, 8), CURB + 1.9, 4, new THREE.Color(0.78, 0.7, 0.52)); }
    G.props.box(lot.x0 + 3, lot.z1 - 7, lot.x0 + 9, lot.z1 - 3, CURB, CURB + 2.6, 3, new THREE.Color(0.9, 0.9, 0.88));
  }
  // The signature skyscrapers: each block a different silhouette (see SIGNATURE in grid.js).
  signature(ctx, r, kind, rnd) {
    const G = ctx.gb, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, fg = this.style.glass.fac, fm = this.style.modern.fac, metal = METAL;
    const rect = (w, d, ox = 0, oz = 0, a = 0) => { const c = Math.cos(a), s = Math.sin(a); return [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]].map(([x, z]) => [cx + ox + x * c + z * s, cz + oz - x * s + z * c]); };
    const chamfer = (w, ch, ox = 0, oz = 0) => chamferRect({ x0: cx + ox - w / 2, x1: cx + ox + w / 2, z0: cz + oz - w / 2, z1: cz + oz + w / 2 }, ch);
    const colGlass = () => GLASS[(rnd() * GLASS.length) | 0], colMod = () => MODERN[(rnd() * MODERN.length) | 0], trim = new THREE.Color(0.93, 0.92, 0.9), gold = new THREE.Color(0.9, 0.7, 0.25);
    const sect = (poly, y0, y1, style, col, uo = 0) => {
      const st = this.style[style]; G[style].extrude(poly, y0, y1, st.fac.w, st.fac.h, col, uo, true);
      G.roof.cap(poly, y1, 8, new THREE.Color(0.52, 0.52, 0.54)); G.roof.extrude(offsetPoly(poly, 0.05), y1, y1 + 0.9, 8, 8, trim, 0, false);
    };
    const light = (x, z, y) => G.props.box(x - 0.5, z - 0.5, x + 0.5, z + 0.5, y, y + 1.4, 3, new THREE.Color(0.95, 0.2, 0.15));
    const mast = (x, z, y0, len) => { G.props.box(x - 0.25, z - 0.25, x + 0.25, z + 0.25, y0, y0 + len, 3, metal); light(x, z, y0 + len); };
    const tip = (poly, y0, y1, col, px = cx, pz = cz) => { G.roof.loft(poly, y0, poly.map(() => [px, pz]), y1, 6, col); };
    // a wide podium under every one of them, with a stone plinth, so they stand on something
    const plinth = (w, h) => { sect(rect(w, w), CURB, CURB + h, 'modern', new THREE.Color(0.93, 0.91, 0.87)); addCollider({ type: 'box', x0: cx - w / 2, x1: cx + w / 2, z0: cz - w / 2, z1: cz + w / 2 }, ctx.colliders); };
    if (kind === 'crown') {                                                              // an art-deco tower: setbacks, corner fins, a stepped crown, a spire
      plinth(110, 12); let y = CURB + 12, c = colMod();
      for (const [w, h] of [[74, 100], [60, 44], [46, 40], [32, 30]]) { sect(chamfer(w, 5), y, y + h, 'modern', c, 0); for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) G.props.box(cx + sx * (w / 2 - 1.6) - 0.9, cz + sz * (w / 2 - 1.6) - 0.9, cx + sx * (w / 2 - 1.6) + 0.9, cz + sz * (w / 2 - 1.6) + 0.9, y, y + h + 2.5, 3, trim); y += h; }
      tip(chamfer(22, 3), y, y + 22, gold); mast(cx, cz, y + 22, 30);
    } else if (kind === 'twist') {                                                       // twenty-degree turns, storey on storey
      plinth(100, 10); let y = CURB + 10; const c = colGlass();
      for (let k = 0; k < 11; k++) { sect(rect(46 - k * 1.2, 46 - k * 1.2, 0, 0, k * 0.13), y, y + 17, 'glass', c, k * 0.13); y += 17; }
      mast(cx, cz, y, 22);
    } else if (kind === 'pyramid') {
      plinth(96, 10); const c = colGlass(); sect(chamfer(56, 6), CURB + 10, CURB + 130, 'glass', c);
      G.glass.loft(chamfer(56, 6), CURB + 130.9, chamfer(56, 6).map(() => [cx, cz]), CURB + 182, 8, new THREE.Color(0.7, 0.82, 0.92)); mast(cx, cz, CURB + 182, 14);
    } else if (kind === 'twin') {                                                        // two towers and a sky bridge
      plinth(112, 10);
      for (const [ox, h] of [[-32, 154], [32, 140]]) { sect(chamfer(38, 4, ox, 0), CURB + 10, CURB + h, 'modern', colMod()); tip(chamfer(24, 3, ox, 0), CURB + h + 1, CURB + h + 14, metal, cx + ox, cz); G.props.box(cx + ox - 0.25, cz - 0.25, cx + ox + 0.25, cz + 0.25, CURB + h + 14, CURB + h + 34, 3, metal); light(cx + ox, cz, CURB + h + 34); }
      G.glass.box(cx - 14, cz - 9, cx + 14, cz + 9, CURB + 96, CURB + 108, 4, new THREE.Color(0.55, 0.65, 0.8)); G.props.box(cx - 14, cz - 9.2, cx + 14, cz + 9.2, CURB + 108, CURB + 109.2, 3, metal);
    } else if (kind === 'round') {                                                       // a drum with a ring round it halfway up
      plinth(100, 10); const c = colGlass(); sect(circlePoly(cx, cz, 26, 36), CURB + 10, CURB + 178, 'glass', c);
      G.props.extrude(circlePoly(cx, cz, 33, 40), CURB + 118, CURB + 121, 4, 4, new THREE.Color(0.22, 0.24, 0.28), 0, true); G.props.cap(circlePoly(cx, cz, 33, 40), CURB + 121, 4, new THREE.Color(0.3, 0.32, 0.36));
      G.props.extrude(circlePoly(cx, cz, 10, 20), CURB + 178.9, CURB + 182, 4, 4, trim, 0, true); mast(cx, cz, CURB + 182, 30);
    } else if (kind === 'lean') {                                                        // each storey a little to one side
      plinth(100, 10); let y = CURB + 10; const c = colMod();
      for (let k = 0; k < 9; k++) { sect(rect(44, 44, -16 + k * 3.8, 0), y, y + 17.5, 'modern', c, k * 0.1); y += 17.5; }
      mast(cx + 15, cz, y, 22);
    } else if (kind === 'portal') {                                                      // two slabs joined at the top, a gap you can see through
      plinth(112, 10);
      for (const ox of [-26, 26]) sect(rect(24, 46, ox, 0), CURB + 10, CURB + 160, 'glass', colGlass());
      sect(rect(28, 46, 0, 0), CURB + 112, CURB + 160, 'modern', colMod());
    } else if (kind === 'needle') {                                                      // slim, very tall, with a long spire
      plinth(84, 10); sect(chamfer(28, 4), CURB + 10, CURB + 190, 'glass', colGlass()); sect(chamfer(20, 3), CURB + 191, CURB + 232, 'glass', colGlass()); tip(chamfer(14, 2), CURB + 233, CURB + 252, metal); mast(cx, cz, CURB + 252, 40);
    } else if (kind === 'terrace') {                                                     // stepped back, a garden on every roof
      plinth(110, 8); let y = CURB + 8; const c = colMod();
      for (const w of [86, 72, 58, 44, 30]) { sect(rect(w, w), y, y + 24, 'modern', c); G.park.cap(rect(w + 6, w + 6).map(p => p), y + 24.2, 18, GRASS_TINT); y += 24; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; ctx.L.bushes.push([cx + Math.cos(a) * (w / 2 + 1.5), cz + Math.sin(a) * (w / 2 + 1.5), 1.0 + rnd() * 0.6, y + 0.2]); } }
      mast(cx, cz, y, 24);
    } else {                                                                             // a thin wide blade, turned off the grid
      plinth(110, 10); sect(rect(86, 18, 0, 0, 0.35), CURB + 10, CURB + 185, 'glass', colGlass()); sect(rect(60, 14, 0, 0, 0.35), CURB + 186, CURB + 205, 'glass', colGlass()); mast(cx, cz, CURB + 205, 20);
    }
  }

  // --- The roads that are not on the grid (avenues.js) -------------------------------------------------------------------
  // The kerb along each edge, the markings down the middle and along the lanes, lamps and trees along the pavements. Each stretch is made by the
  // region its middle is in.
  *avenues(ctx, ri, rj) {
    const x0 = -N * SP + ri * REGION, z0 = -N * SP + rj * REGION, x1 = x0 + REGION, z1 = z0 + REGION, G = ctx.gb, L = ctx.L, rnd = mulberry32(Math.imul(ri + 11, 7919) ^ Math.imul(rj + 7, 104729));
    const lineW = new THREE.Color(0.9, 0.9, 0.86), lineY = new THREE.Color(0.92, 0.7, 0.2), uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const onGrid = (x, z) => { const kx = clamp(Math.round(x / SP), -N, N), kz = clamp(Math.round(z / SP), -N, N); return Math.abs(x - kx * SP) < hw(kx) + 2 || Math.abs(z - kz * SP) < hw(kz) + 2; };
    for (const A of AVENUES) for (let i = 0; i < A.n - 1; i++) {
      const mx = (A.x[i] + A.x[i + 1]) / 2, mz = (A.z[i] + A.z[i + 1]) / 2; if (mx < x0 || mx >= x1 || mz < z0 || mz >= z1) continue;
      if (performance.now() > this.deadline) yield;
      const ax = A.x[i], az = A.z[i], bx = A.x[i + 1], bz = A.z[i + 1], nx = -A.tz[i], nz = A.tx[i], len = Math.hypot(bx - ax, bz - az), s0 = A.s[i];
      const cr = nearestAvenue(mx, mz, A); if (cr && cr.d < cr.a.W + 7) continue;                // (where another road crosses this one the junction is left open: no kerb, no lines, no lamps)
      const P = (o, f, y) => [ax + (bx - ax) * f + nx * o, y, az + (bz - az) * f + nz * o];
      const strip = (o0, o1, col, f0 = 0, f1 = 1) => quadToward(G.amark, P(o0, f0, 0.012), P(o0, f1, 0.012), P(o1, f1, 0.012), P(o1, f0, 0.012), uv, col, [0, 1, 0]);
      for (const s of [-1, 1]) {                                                                      // the kerb, facing the road
        const o = s * (A.hw - 0.02), pa = P(o, 0, 0), pb = P(o, 1, 0);
        quadToward(G.acurb, pa, pb, [pb[0], CURB, pb[2]], [pa[0], CURB, pa[2]], [[0, 0], [len / 4, 0], [len / 4, 0.04], [0, 0.04]], WHITE, [-nx * s, 0, -nz * s]);
      }
      if (A.kind === 'diag') {
        strip(-0.22, -0.08, lineY); strip(0.08, 0.22, lineY);                                         // a double yellow line down the middle
        for (const s of [-1, 1]) {
          strip(s * (A.hw - 0.75) - 0.07, s * (A.hw - 0.75) + 0.07, lineW);                          // a solid edge line each side
          for (let d0 = Math.floor(s0 / 9) * 9; d0 < s0 + len; d0 += 9) { const f0 = Math.max(0, (d0 - s0) / len), f1 = Math.min(1, (d0 + 3 - s0) / len); if (f1 > f0) strip(s * 5.4 - 0.07, s * 5.4 + 0.07, lineW, f0, f1); }      // dashes between the lanes
        }
      } else for (let d0 = Math.floor(s0 / 8) * 8; d0 < s0 + len; d0 += 8) { const f0 = Math.max(0, (d0 - s0) / len), f1 = Math.min(1, (d0 + 3 - s0) / len); if (f1 > f0) strip(-0.07, 0.07, lineW, f0, f1); }      // (a dashed line down a lane road)
      // lamps every 38 m on alternate sides, trees between them (the lamps lean over the road)
      if (Math.floor(A.s[i + 1] / 38) > Math.floor(s0 / 38)) {
        const s = Math.floor(s0 / 38) % 2 ? 1 : -1, o = s * (A.hw + 1.1), x = mx + nx * o, z = mz + nz * o, yaw = Math.atan2(-nx * s, -nz * s);
        if (!onGrid(x, z) && roadSdf(x, z) > 0.5 && !wet(x, z, 0.5)) { L.lamps.push([x, z, yaw, CURB]); addCollider({ type: 'circ', x, z, r: 0.25, brk: { kind: 'lamp', i: L.lamps.length - 1, yaw, key: brkKey(x, z) } }, ctx.colliders); }
      }
      if (A.kind === 'diag' && Math.floor((A.s[i + 1] + 19) / 38) > Math.floor((s0 + 19) / 38)) for (const s of [-1, 1]) { const o = s * (A.hw + 3.3), x = mx + nx * o, z = mz + nz * o; if (!onGrid(x, z)) this.tree(ctx, x, z, 1.1 + rnd() * 0.5, CURB, false); }
    }
  }
  // A lot that a road across the grid goes through or by. A diagonal cuts it into wedges: a building on each (shaped to it), or a little park where
  // too small. A winding road just turns it to lawn.
  *avenueLot(ctx, lot, zone, d, rnd) {
    const res = lotPieces(lot); if (!res) return false;
    if (res.hill) { this.riverLot(ctx, lot, rnd); return true; }                  // (a winding road through a lot: the lot goes to lawn)
    for (const poly of res.pieces) {
      const inner = offsetPoly(poly, -(1.1 + rnd() * 1.1)), a = polyArea(inner), per = inner.reduce((s, p, k) => s + Math.hypot(p[0] - inner[(k + 1) % inner.length][0], p[1] - inner[(k + 1) % inner.length][1]), 0);
      if (inner.length < 3 || a < 330 || 2 * a / per < 4.6 || polyArea(poly) < 80) this.pocketPark(ctx, poly, rnd); else this.polyBuilding(ctx, ccw(inner), zone, d, rnd);
      if (performance.now() > this.deadline) yield;
    }
    return true;
  }
  // A building on any convex footprint (a wedge between a diagonal road and the grid): its walls straight up, a flat roof, a plinth; the colliders
  // are a stack of boxes down it.
  polyBuilding(ctx, P, zone, d, rnd) {
    const { style: st0, h } = this.pickStyle(zone, d, true, [], rnd, ctx), style = st0 === 'shop' ? 'apt' : st0, { fac, pal } = this.style[style], G = ctx.gb, col = pal[(rnd() * pal.length) | 0];
    const top = CURB + h, rc = new THREE.Color(0.55 + rnd() * 0.15, 0.53 + rnd() * 0.12, 0.52 + rnd() * 0.1), trim = new THREE.Color(0.93, 0.92, 0.9).multiplyScalar(0.9 + rnd() * 0.1);
    G[style].extrude(P, CURB, top, fac.w, fac.h, col, Math.floor(rnd() * 4) / 4, false);
    G.roof.cap(P, top, 8, rc); G.roof.extrude(offsetPoly(P, 0.05), top, top + 0.75, 8, 8, trim, 0, false);
    G.props.extrude(offsetPoly(P, 0.25), CURB, CURB + 1.1, 4, 4, STONE, 0, false);
    let zmin = 1e9, zmax = -1e9; for (const p of P) { zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
    const span = z => { let lo = 1e9, hi = -1e9; for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; if ((a[1] <= z && b[1] > z) || (b[1] <= z && a[1] > z)) { const x = a[0] + (z - a[1]) / (b[1] - a[1]) * (b[0] - a[0]); lo = Math.min(lo, x); hi = Math.max(hi, x); } } return [lo, hi]; };
    for (let z = zmin; z < zmax - 0.2; z += 1.5) { const [l0, h0] = span(Math.min(zmax - 0.01, z + 0.01)), [l1, h1] = span(Math.max(zmin + 0.01, Math.min(zmax - 0.01, z + 1.49))), lo = Math.max(l0, l1) + 0.1, hi = Math.min(h0, h1) - 0.1; if (hi - lo > 0.5) addCollider({ type: 'box', x0: lo, x1: hi, z0: z, z1: Math.min(zmax, z + 1.5) }, ctx.colliders); }
  }
  // A wedge too small to build on: a little park with a few trees and a bench.
  pocketPark(ctx, P, rnd) {
    if (polyArea(P) < 30) return;
    ctx.gb.park.cap(P, CURB + 0.03, 18, GRASS_TINT);
    const inner = offsetPoly(P, -2.5), inside = (q, x, z) => { for (let k = 0; k < q.length; k++) { const a = q[k], b = q[(k + 1) % q.length]; if ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) > 0) return false; } return true; };
    let xs = P.map(p => p[0]), zs = P.map(p => p[1]); const bx0 = Math.min(...xs), bx1 = Math.max(...xs), bz0 = Math.min(...zs), bz1 = Math.max(...zs), n = Math.min(6, Math.round(polyArea(P) / 140));
    for (let k = 0, t = 0; k < n && t < 40; t++) { const x = bx0 + rnd() * (bx1 - bx0), z = bz0 + rnd() * (bz1 - bz0); if (inner.length >= 3 && inside(inner, x, z)) { this.tree(ctx, x, z, 0.9 + rnd() * 0.6, CURB + 0.03, rnd() < 0.3); k++; } }
  }

  // A roundabout: a kerbed island with something on it (a fountain, an obelisk, a grove or a statue), a white line round it, and a
  // small island splitting each side street's traffic. No traffic lights. Cars circle it (traffic.js) and can't drive over it.
  roundabout(ctx, i, j) {
    ctx.setPoint(i * SP, j * SP, 1.6);
    const cx = i * SP, cz = j * SP, G = ctx.gb, L = ctx.L, Ri = RB.island, rnd = mulberry32(Math.imul(i + 500, 7919) ^ Math.imul(j + 500, 104729)), kind = Math.floor(hash3(i, j, 43) * 4);
    const ring = circlePoly(cx, cz, Ri, 40);
    G.curb.extrude(ring, 0, 0.24, 4.5, 4.5, WHITE, 0, true);
    G.park.cap(ring, 0.24, 18, GRASS_TINT);
    const stone = new THREE.Color(0.78, 0.76, 0.72), gold = new THREE.Color(0.9, 0.7, 0.25), water = new THREE.Color(0.3, 0.6, 0.75), white = new THREE.Color(0.93, 0.92, 0.9);
    const y0 = 0.24, disc = (r, n = 20) => circlePoly(cx, cz, r, n);
    if (kind === 0) {                                                                    // a fountain: a stone basin, water, a column and a bowl
      G.props.extrude(disc(4.6, 24), y0, y0 + 0.7, 4, 4, stone, 0, true); G.props.cap(disc(4.6, 24), y0 + 0.7, 4, stone);
      G.props.cap(disc(4.2, 24), y0 + 0.78, 4, water);
      G.props.extrude(disc(0.55, 12), y0, y0 + 3.2, 4, 4, stone, 0, true); G.props.cap(disc(0.55, 12), y0 + 3.2, 4, stone);
      G.props.loft(disc(1.9, 16), y0 + 2.9, disc(0.6, 16), y0 + 2.3, 4, stone); G.props.cap(disc(1.7, 16), y0 + 2.88, 4, water);
    } else if (kind === 1) {                                                             // an obelisk on a stepped plinth
      for (let s = 0; s < 3; s++) G.props.box(cx - 3 + s * 0.7, cz - 3 + s * 0.7, cx + 3 - s * 0.7, cz + 3 - s * 0.7, y0 + s * 0.35, y0 + s * 0.35 + 0.35, 4, stone);
      const sq = h => [[cx - h, cz + h], [cx + h, cz + h], [cx + h, cz - h], [cx - h, cz - h]], h0 = 1.05, tall = 13 + rnd() * 4;
      G.props.loft(sq(h0), y0 + 1.05, sq(h0 * 0.52), y0 + tall, 4, white);
      G.props.loft(sq(h0 * 0.52), y0 + tall, [[cx, cz], [cx, cz], [cx, cz], [cx, cz]], y0 + tall + 1.4, 4, gold);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; this.tree(ctx, cx + Math.cos(a) * 5.2, cz + Math.sin(a) * 5.2, 0.9, y0, true); }
    } else if (kind === 2) {                                                             // a small wood
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + rnd(), r = k ? 3.2 + rnd() * 1.4 : 0; this.tree(ctx, cx + Math.cos(a) * r, cz + Math.sin(a) * r, 1.2 + rnd() * 0.8, y0, k % 3 === 2); }
      for (let k = 0; k < 10; k++) { const a = rnd() * 6.28, r = 3 + rnd() * 3; L.bushes.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.7 + rnd() * 0.6, y0]); }
    } else {                                                                             // a statue on a column, ringed with flower beds
      G.props.extrude(disc(2.6), y0, y0 + 0.9, 4, 4, stone, 0, true); G.props.cap(disc(2.6), y0 + 0.9, 4, stone);
      G.props.extrude(disc(0.9, 12), y0 + 0.9, y0 + 4.6, 4, 4, stone, 0, true); G.props.cap(disc(0.9, 12), y0 + 4.6, 4, stone);
      G.props.box(cx - 0.45, cz - 0.3, cx + 0.45, cz + 0.3, y0 + 4.6, y0 + 6.1, 3, gold); G.props.box(cx - 0.3, cz - 0.25, cx + 0.3, cz + 0.25, y0 + 6.1, y0 + 6.7, 3, gold);
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; L.bushes.push([cx + Math.cos(a) * 4.8, cz + Math.sin(a) * 4.8, 0.55 + rnd() * 0.25, y0]); }
    }
    addCollider({ type: 'circ', x: cx, z: cz, r: Ri }, ctx.colliders);
    // a white line round the island (a strip of quads), and a splitter island on each minor approach
    const lineCol = new THREE.Color(0.9, 0.9, 0.86), n = 48, ringStrip = (gb, r0, r1, y, col) => {
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, b = (k + 1) / n * Math.PI * 2, P = (r, t) => [cx + Math.cos(t) * r, y, cz + Math.sin(t) * r];
        quadToward(gb, P(r0, a), P(r0, b), P(r1, b), P(r1, a), [[P(r0, a)[0] / 6, P(r0, a)[2] / 6], [P(r0, b)[0] / 6, P(r0, b)[2] / 6], [P(r1, b)[0] / 6, P(r1, b)[2] / 6], [P(r1, a)[0] / 6, P(r1, a)[2] / 6]], col, [0, 1, 0]);
      }
    };
    ringStrip(G.walk, Ri, Ri + 1.5, 0.05, WHITE);                                                     // a paved apron round the kerb (for lorries), a step above the road
    G.curb.extrude(circlePoly(cx, cz, Ri + 1.5, 48), 0, 0.05, 4.5, 4.5, WHITE, 0, true);
    ringStrip(G.mark, Ri + 1.7, Ri + 1.9, 0.014, lineCol);
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (isBlvd(dx !== 0 ? j : i)) continue;                                            // a boulevard has its median
      const rx = -dz, rz = dx, P = (t, s) => [cx + dx * t + rx * s, cz + dz * t + rz * s];
      const isl = ccw([P(RB.outer + 1.0, -0.9), P(RB.outer + 1.0, 0.9), P(RB.outer + 9, 0.15), P(RB.outer + 9, -0.15)]);
      G.walk.cap(isl, CURB + 0.03, 6, WHITE); G.curb.extrude(isl, 0, CURB + 0.03, 4.5, 4.5, WHITE, 0, false);
    }
  }

  // --- Buildings ----------------------------------------------------------------------
  pickStyle(zone, d, onBlvd, faces, rnd, ctx) {
    const r = rnd();
    let style, h;
    if (ctx && ctx.old) {                                                  // the old town: three or four storeys of brick, plaster and shops
      if (onBlvd && r < 0.5) { style = 'shop'; h = 5 + rnd() * 1.4; } else { style = rnd() < 0.5 ? 'brick' : 'apt'; h = 10.5 + Math.floor(rnd() * 3) * 3.5; }
    } else if (ctx && ctx.cur && docksBlock(ctx.cur[0], ctx.cur[1])) {   // the docks: long low warehouses
      style = rnd() < 0.6 ? 'brick' : 'modern'; h = 8.4 + Math.floor(rnd() * 2) * 3.5;
    } else if (zone === 'down') {
      style = r < 0.62 ? 'glass' : r < 0.9 ? 'modern' : 'apt';
      h = style === 'apt' ? 28 + rnd() * 18 : 46 + Math.pow(rnd(), 1.15) * 150 * clamp(1.35 - d / 520, 0.4, 1);
    } else if (zone === 'mid') {
      if (onBlvd && r < 0.4) { style = 'shop'; h = 4.8 + rnd() * 1.6; }
      else if (r < 0.62) { style = rnd() < 0.45 ? 'brick' : 'apt'; h = 10.5 + Math.floor(rnd() * 6) * 3.5; }
      else { style = rnd() < 0.5 ? 'glass' : 'modern'; h = 17 + rnd() * 38; }
    } else if (zone === 'low') {
      if (onBlvd && r < 0.6) { style = 'shop'; h = 4.6 + rnd() * 1.8; }
      else if (r < 0.75) { style = rnd() < 0.5 ? 'brick' : 'apt'; h = 7 + Math.floor(rnd() * 4) * 3.5; }
      else { style = 'modern'; h = 10.5 + rnd() * 14; }
    } else {
      style = onBlvd ? 'shop' : rnd() < 0.5 ? 'apt' : 'brick';
      h = style === 'shop' ? 4.6 + rnd() * 1.6 : 7 + Math.floor(rnd() * 3) * 3.5;
    }
    if (!faces.length && style === 'shop') { style = 'apt'; h = 7 + Math.floor(rnd() * 3) * 3.5; }
    return { style, h: style === 'shop' ? h : snap(h) };
  }

  addBuilding(ctx, lot, faces, zone, d, onBlvd, rnd) {
    const { style, h } = this.pickStyle(zone, d, onBlvd, faces, rnd, ctx);
    const g = 1.0 + rnd() * 1.6;
    const b = { x0: lot.x0 + g, z0: lot.z0 + g, x1: lot.x1 - g, z1: lot.z1 - g };
    // Shops and towers build right up to the pavement; low blocks sit behind a hedge.
    const front = (style === 'apt' || style === 'brick') && zone !== 'down' ? 3.6 : 0.3;
    for (const f of faces) {
      if (f.dir[0] < 0) b.x0 = lot.x0 + front; if (f.dir[0] > 0) b.x1 = lot.x1 - front;
      if (f.dir[1] < 0) b.z0 = lot.z0 + front; if (f.dir[1] > 0) b.z1 = lot.z1 - front;
      if (front > 1) this.hedgeRow(ctx, lot, f);
    }
    if (style !== 'shop') {                                                    // whole window bays, so facades don't end mid-window
      for (const [lo, hi] of [['x0', 'x1'], ['z0', 'z1']]) {
        const len = b[hi] - b[lo], q = Math.floor(len / 4) * 4;
        if (q >= 8 && q < len) { const mid = (b[lo] + b[hi]) / 2; b[lo] = mid - q / 2; b[hi] = mid + q / 2; }
      }
    }
    if (b.x1 - b.x0 < 6 || b.z1 - b.z0 < 6) return;
    this.buildMass(ctx, b, style, h, faces, rnd);
  }

  hedgeRow(ctx, lot, f) {
    const e = f.dir[0] < 0 ? lot.x0 + 0.9 : f.dir[0] > 0 ? lot.x1 - 0.9 : f.dir[1] < 0 ? lot.z0 + 0.9 : lot.z1 - 0.9;
    const [a0, a1] = f.dir[0] !== 0 ? [lot.z0 + 1, lot.z1 - 1] : [lot.x0 + 1, lot.x1 - 1], mid = (a0 + a1) / 2;
    for (const [p0, p1] of [[a0, mid - 1.5], [mid + 1.5, a1]]) if (p1 - p0 > 1) {
      const hd = f.dir[0] !== 0 ? [e, (p0 + p1) / 2, 1.0, p1 - p0] : [(p0 + p1) / 2, e, p1 - p0, 1.0];
      ctx.L.hedges.push(hd);
      addCollider({ type: 'box', x0: hd[0] - hd[2] / 2, x1: hd[0] + hd[2] / 2, z0: hd[1] - hd[3] / 2, z1: hd[1] + hd[3] / 2 }, ctx.colliders);
    }
  }

  buildMass(ctx, b, style, h, faces, rnd, opt = {}) {
    const { fac, pal } = this.style[style], gb = ctx.gb[style], G = ctx.gb;
    const c = opt.color || pal[(rnd() * pal.length) | 0], uOff = Math.floor(rnd() * 4) / 4;
    const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const tower = style === 'glass' || style === 'modern';
    const r = rnd();
    let poly = rectPoly(b), kind = 'rect';
    if (opt.rect) kind = 'rect';
    else if (tower && h > 50 && Math.min(w, d) > 24 && r < 0.3) { kind = 'round'; poly = circlePoly(cx, cz, Math.min(w, d) / 2 - 0.5, 28); }
    else if (tower && r < 0.62) { kind = 'chamfer'; poly = chamferRect(b, 2.5 + rnd() * 3); }
    else if (tower && Math.min(w, d) > 20 && r < 0.8) { kind = 'rounded'; poly = roundedRect(b.x0, b.z0, b.x1, b.z1, 4 + rnd() * 3, 4); }
    const rc = new THREE.Color(0.55 + rnd() * 0.15, 0.53 + rnd() * 0.12, 0.52 + rnd() * 0.1);
    const trim = new THREE.Color(0.93, 0.92, 0.9).multiplyScalar(0.9 + rnd() * 0.1);
    const plan = !tower || h < 56 ? [[1, 1]] : rnd() < 0.5 ? [[0.62, 1], [0.38, 0.78]] : [[0.5, 1], [0.3, 0.82], [0.2, 0.62]];
    let y = CURB, topP = poly;
    plan.forEach(([frac, sc], t) => {
      const last = t === plan.length - 1;
      const th = last ? Math.max(3.5, CURB + h - y) : snap(h * frac);
      const P = t === 0 ? poly : scalePoly(poly, sc);
      gb.extrude(P, y, y + th, fac.w, fac.h, c, uOff + t * 0.25, true, style === 'shop');
      G.roof.cap(P, y + th, 8, rc);
      G.roof.extrude(offsetPoly(P, 0.05), y + th, y + th + 0.75, 8, 8, trim, 0, false);
      y += th; topP = P;
    });
    const top = y;
    if (tower) G.props.extrude(offsetPoly(poly, 0.25), CURB, CURB + 1.2, 4, 4, STONE, 0, false);       // stone plinth
    else G.roof.extrude(offsetPoly(poly, 0.4), top - 0.5, top + 0.05, 4, 4, trim, 0, false);           // cornice
    if (tower && h > 105 && rnd() < 0.55) {
      const tc = clamp(h * 0.08, 6, 14), small = scalePoly(topP, 0.55);                                   // tapered crown and mast
      G.roof.loft(topP, top, small, top + tc, 8, METAL); G.roof.cap(small, top + tc, 8, METAL);
      const [mx, mz] = [cx, cz]; G.roof.box(mx - 0.2, mz - 0.2, mx + 0.2, mz + 0.2, top + tc, top + tc + 12 + rnd() * 10, 4, METAL);
    } else {
      for (let k = 0; k < 1 + rnd() * 2; k++) {
        const ax = b.x0 + 2 + rnd() * Math.max(1, w - 6), az = b.z0 + 2 + rnd() * Math.max(1, d - 6);
        if (kind === 'round' && Math.hypot(ax - cx, az - cz) > Math.min(w, d) / 2 - 3) continue;
        G.props.box(ax, az, ax + 1.6 + rnd() * 1.5, az + 1.2 + rnd(), top, top + 1.1 + rnd(), 4, new THREE.Color(0.62, 0.62, 0.6));
      }
    }
    if (ctx.old && kind === 'rect' && h < 30 && style !== 'shop') {                                 // a hip roof of tiles over the flat one
      const e = 0.6, hx = (b.x0 + b.x1) / 2, hz = (b.z0 + b.z1) / 2, wx = w + 2 * e, wz = d + 2 * e, rise = Math.min(4.2, Math.min(wx, wz) * 0.3), tile = TILES[(rnd() * TILES.length) | 0];
      const eave = [[b.x0 - e, b.z1 + e], [b.x1 + e, b.z1 + e], [b.x1 + e, b.z0 - e], [b.x0 - e, b.z0 - e]];
      const ridge = wx >= wz ? (() => { const hh = (wx - wz) / 2; return [[hx - hh, hz], [hx + hh, hz], [hx + hh, hz], [hx - hh, hz]]; })() : (() => { const hh = (wz - wx) / 2; return [[hx, hz + hh], [hx, hz + hh], [hx, hz - hh], [hx, hz - hh]]; })();
      G.tile.loft(eave, top + 0.05, ridge, top + 0.05 + rise, 5, tile);
    }
    if (kind === 'round') addCollider({ type: 'circ', x: cx, z: cz, r: Math.min(w, d) / 2 }, ctx.colliders);
    else addCollider({ type: 'box', x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 }, ctx.colliders);
    if ((style === 'apt' || style === 'brick' || style === 'modern') && (kind === 'rect' || kind === 'chamfer') && h >= 10 && h < 70) this.balconies(ctx, b, h, faces, kind === 'chamfer' ? 5.5 : 1.5, rnd);
    if (style === 'shop' && faces.length) {
      for (const f of faces.slice(0, 2)) this.shopSign(ctx, b, f, h, rnd);
      if (hash3(Math.round(b.x0), Math.round(b.z0), 63) < 0.4) this.terrace(ctx, b, faces[0], rnd);
      if (isBlvd(faces[0].line) && rnd() < 0.3) this.poleSign(ctx, b, faces[0], rnd);
    }
    if (!tower && faces.length && ctx.L.bills.length < 2 && rnd() < 0.05) ctx.L.bills.push({ x: cx, z: cz, y: top + 2 + ctx.base, yaw: Math.atan2(faces[0].dir[0], faces[0].dir[1]) });
  }

  // Thin slab balconies with railings cut from a bar texture (no solid boxes).
  balconies(ctx, b, h, faces, margin, rnd) {
    const slab = new THREE.Color(0.93, 0.92, 0.9), D = 1.3, RH = 1.05, G = ctx.gb;
    const rail = (x0, z0, x1, z1, y) => G.rail.quad([x0, y, z0], [x1 - x0, 0, z1 - z0], [0, RH, 0], 0, 0, Math.hypot(x1 - x0, z1 - z0), 1);
    for (const f of faces) {
      const along = f.dir[0] !== 0 ? [b.z0, b.z1] : [b.x0, b.x1], len = along[1] - along[0] - margin * 2;
      if (len < 6) continue;
      const nb = Math.max(1, Math.floor(len / 9)), bw = Math.min(6, len / nb - 2);
      for (let fl = 1; fl * 3.5 < h - 2; fl++) {
        const y = CURB + fl * 3.5 - 0.15;
        for (let k = 0; k < nb; k++) {
          const c = along[0] + margin + (k + 0.5) * len / nb, a0 = c - bw / 2, a1 = c + bw / 2;
          if (f.dir[0] !== 0) {
            const x = f.dir[0] < 0 ? b.x0 : b.x1, xo = x + f.dir[0] * D;
            G.props.box(Math.min(x, xo), a0, Math.max(x, xo), a1, y, y + 0.14, 4, slab);
            rail(xo, a0, xo, a1, y + 0.14); rail(x, a0, xo, a0, y + 0.14); rail(x, a1, xo, a1, y + 0.14);
          } else {
            const z = f.dir[1] < 0 ? b.z0 : b.z1, zo = z + f.dir[1] * D;
            G.props.box(a0, Math.min(z, zo), a1, Math.max(z, zo), y, y + 0.14, 4, slab);
            rail(a0, zo, a1, zo, y + 0.14); rail(a0, z, a0, zo, y + 0.14); rail(a1, z, a1, zo, y + 0.14);
          }
        }
      }
    }
  }

  signUV(ctx, special = -1) {
    const n = special >= 0 ? 28 + special : ctx.signN++ % 28, cc = n % 4, rr = (n / 4) | 0;               // (the last four cells are the bank, hotel, cinema and cash-machine signs)
    return [cc / 4 + 0.004, 1 - (rr + 1) / 8 + 0.004, (cc + 1) / 4 - 0.004, 1 - rr / 8 - 0.004];
  }
  shopSign(ctx, b, f, h, rnd) {
    const gb = ctx.gb.sign, along = f.dir[0] !== 0 ? b.z1 - b.z0 : b.x1 - b.x0;
    const w = Math.min(along * 0.55, 10), sh = Math.min(1.5, w / 2.2), y0 = CURB + h * 0.74;
    const [u0, v0, u1, v1] = this.signUV(ctx), t = 0.35;
    if (f.dir[0] !== 0) {
      const x = f.dir[0] < 0 ? b.x0 : b.x1, zc = (b.z0 + b.z1) / 2 + (rnd() - 0.5) * (along - w) * 0.6, s = f.dir[0], xo = x + s * t;
      if (s > 0) gb.quad([xo, y0, zc + w / 2], [0, 0, -w], [0, sh, 0], u0, v0, u1, v1); else gb.quad([xo, y0, zc - w / 2], [0, 0, w], [0, sh, 0], u0, v0, u1, v1);
    } else {
      const z = f.dir[1] < 0 ? b.z0 : b.z1, xc = (b.x0 + b.x1) / 2 + (rnd() - 0.5) * (along - w) * 0.6, s = f.dir[1], zo = z + s * t;
      if (s > 0) gb.quad([xc - w / 2, y0, zo], [w, 0, 0], [0, sh, 0], u0, v0, u1, v1); else gb.quad([xc + w / 2, y0, zo], [-w, 0, 0], [0, sh, 0], u0, v0, u1, v1);
    }
  }
  poleSign(ctx, b, f, rnd) {
    ctx.setPoint((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const s = f.dir[0] !== 0 ? f.dir[0] : f.dir[1], G = ctx.gb;
    let x, z;
    if (f.dir[0] !== 0) { x = (f.dir[0] < 0 ? b.x0 : b.x1) + s * (SIDEWALK - 1.2); z = b.z0 + 2; }
    else { z = (f.dir[1] < 0 ? b.z0 : b.z1) + s * (SIDEWALK - 1.2); x = b.x0 + 2; }
    const ph = 8 + rnd() * 3, dark = new THREE.Color(0.18, 0.18, 0.2);
    G.props.box(x - 0.18, z - 0.18, x + 0.18, z + 0.18, CURB, CURB + ph, 2, dark);
    addCollider({ type: 'circ', x, z, r: 0.3 }, ctx.colliders);
    const [u0, v0, u1, v1] = this.signUV(ctx), w = 4.2, sh = 2.1, y0 = CURB + ph;
    if (f.dir[0] !== 0) {
      G.sign.quad([x - w / 2, y0, z + 0.25], [w, 0, 0], [0, sh, 0], u0, v0, u1, v1); G.sign.quad([x + w / 2, y0, z - 0.25], [-w, 0, 0], [0, sh, 0], u0, v0, u1, v1);
      G.props.walls(x - w / 2, z - 0.25, x + w / 2, z + 0.25, y0, y0 + sh, 4, 4, dark);
    } else {
      G.sign.quad([x + 0.25, y0, z + w / 2], [0, 0, -w], [0, sh, 0], u0, v0, u1, v1); G.sign.quad([x - 0.25, y0, z - w / 2], [0, 0, w], [0, sh, 0], u0, v0, u1, v1);
      G.props.walls(x - 0.25, z - w / 2, x + 0.25, z + w / 2, y0, y0 + sh, 4, 4, dark);
    }
  }

  // A detached house: plaster walls, a hip roof of tiles, a lawn, a driveway,
  // a hedge along the front and a few trees.
  addHouse(ctx, lot, faces, rnd) {
    const G = ctx.gb, f = faces.length ? faces[0].dir : [0, 1], fac = this.style.house.fac;
    const lw = lot.x1 - lot.x0, ld = lot.z1 - lot.z0;
    G.park.cap(rectPoly({ x0: lot.x0 + 0.6, z0: lot.z0 + 0.6, x1: lot.x1 - 0.6, z1: lot.z1 - 0.6 }), CURB + 0.03, 18, GRASS_TINT);
    const alongX = f[0] === 0;                                                    // the street runs along x
    const W = 11 + Math.floor(rnd() * 4), D = 9 + Math.floor(rnd() * 3), sb = 7 + rnd() * 3;
    const span = alongX ? lw : ld, depth = alongX ? ld : lw;
    if (span < W + 4 || depth < D + sb + 3) { this.tree(ctx, (lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, 1 + rnd() * 0.6, CURB + 0.03, false); return; }
    const hb = { x0: 0, x1: 0, z0: 0, z1: 0 };
    const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
    if (alongX) { hb.x0 = cx - W / 2; hb.x1 = cx + W / 2; if (f[1] < 0) { hb.z0 = lot.z0 + sb; hb.z1 = hb.z0 + D; } else { hb.z1 = lot.z1 - sb; hb.z0 = hb.z1 - D; } }
    else { hb.z0 = cz - W / 2; hb.z1 = cz + W / 2; if (f[0] < 0) { hb.x0 = lot.x0 + sb; hb.x1 = hb.x0 + D; } else { hb.x1 = lot.x1 - sb; hb.x0 = hb.x1 - D; } }
    const floors = rnd() < 0.55 ? 2 : 1, hf = floors === 2 ? 6.2 : 3.3, wall = HOUSE[(rnd() * HOUSE.length) | 0];
    G.house.extrude(rectPoly(hb), CURB, CURB + hf, fac.w, fac.h, wall, Math.floor(rnd() * 8) / 8, false);
    // Hip roof: eaves a little proud of the walls, rising to a ridge.
    const e = 0.55, ey = CURB + hf, rise = 2.4 + rnd() * 0.9, tile = TILES[(rnd() * TILES.length) | 0];
    const eave = [[hb.x0 - e, hb.z1 + e], [hb.x1 + e, hb.z1 + e], [hb.x1 + e, hb.z0 - e], [hb.x0 - e, hb.z0 - e]];
    const hx = (hb.x0 + hb.x1) / 2, hz = (hb.z0 + hb.z1) / 2, wx = hb.x1 - hb.x0 + 2 * e, wz = hb.z1 - hb.z0 + 2 * e;
    let ridge;
    if (wx >= wz) { const half = (wx - wz) / 2; ridge = [[hx - half, hz], [hx + half, hz], [hx + half, hz], [hx - half, hz]]; }
    else { const half = (wz - wx) / 2; ridge = [[hx, hz + half], [hx, hz + half], [hx, hz - half], [hx, hz - half]]; }
    G.tile.loft(eave, ey, ridge, ey + rise, 5, tile);
    G.roof.extrude(eave, ey - 0.3, ey, 4, 4, trimWhite, 0, false);            // fascia
    if (rnd() < 0.6) G.props.box(hx + 1.5, hz - 0.5, hx + 2.5, hz + 0.5, ey + rise * 0.3, ey + rise + 1.4, 3, new THREE.Color(0.6, 0.45, 0.4));
    addCollider({ type: 'box', x0: hb.x0, z0: hb.z0, x1: hb.x1, z1: hb.z1 }, ctx.colliders);
    // Driveway and front hedge.
    const dw = 3.2;
    if (alongX) { const zf = f[1] < 0 ? lot.z0 : hb.z1, zt = f[1] < 0 ? hb.z0 : lot.z1; G.walk.flat(cx + W / 2 - dw - 1, Math.min(zf, zt), cx + W / 2 - 1, Math.max(zf, zt), CURB + 0.05, 6, WHITE); }
    else { const xf = f[0] < 0 ? lot.x0 : hb.x1, xt = f[0] < 0 ? hb.x0 : lot.x1; G.walk.flat(Math.min(xf, xt), cz + W / 2 - dw - 1, Math.max(xf, xt), cz + W / 2 - 1, CURB + 0.05, 6, WHITE); }
    if (faces.length) this.hedgeRow(ctx, lot, faces[0]);
    for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
      const tx = lot.x0 + 3 + rnd() * (lw - 6), tz = lot.z0 + 3 + rnd() * (ld - 6);
      if (tx > hb.x0 - 2.5 && tx < hb.x1 + 2.5 && tz > hb.z0 - 2.5 && tz < hb.z1 + 2.5) continue;
      this.tree(ctx, tx, tz, 0.8 + rnd() * 0.7, CURB + 0.03, rnd() < 0.3);
    }
  }

  parkingLot(ctx, lot, rnd) {
    ctx.gb.lot.flat(lot.x0 + 0.5, lot.z0 + 0.5, lot.x1 - 0.5, lot.z1 - 0.5, CURB + 0.01, 10);
    const alongX = lot.x1 - lot.x0 > lot.z1 - lot.z0, white = new THREE.Color(0.85, 0.85, 0.8);
    const n = Math.floor(((alongX ? lot.x1 - lot.x0 : lot.z1 - lot.z0) - 4) / 3);
    for (let k = 0; k <= n; k++) {
      const t = (alongX ? lot.x0 : lot.z0) + 2 + k * 3;
      for (const side of [0, 1]) {
        const a = side ? (alongX ? lot.z1 - 6 : lot.x1 - 6) : (alongX ? lot.z0 + 1 : lot.x0 + 1);
        if (alongX) ctx.gb.mark.flat(t - 0.06, a, t + 0.06, a + 5, CURB + 0.02, 10, white); else ctx.gb.mark.flat(a, t - 0.06, a + 5, t + 0.06, CURB + 0.02, 10, white);
        if (k < n && rnd() < 0.3) {
          const c = t + 1.5, m = a + 2.5, yaw = alongX ? (side ? Math.PI : 0) : (side ? -Math.PI / 2 : Math.PI / 2);
          const px = alongX ? c : m, pz = alongX ? m : c;
          ctx.L.parked.push({ x: px, z: pz, h: yaw, y: CURB + ctx.H(px, pz), type: (rnd() * 3) | 0, ci: (rnd() * 12) | 0 });
          addCollider({ type: 'circ', x: px, z: pz, r: 1.3 }, ctx.colliders);
        }
      }
    }
  }
}
const trimWhite = new THREE.Color(0.95, 0.94, 0.92);

function subdivide(r, max, rnd, out) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (w <= max && d <= max) { out.push(r); return; }
  const t = 0.35 + rnd() * 0.3;
  if (w > d) { const x = r.x0 + w * t; subdivide({ ...r, x1: x }, max, rnd, out); subdivide({ ...r, x0: x }, max, rnd, out); }
  else { const z = r.z0 + d * t; subdivide({ ...r, z1: z }, max, rnd, out); subdivide({ ...r, z0: z }, max, rnd, out); }
}

// Road graph for traffic and the minimap: nodes are intersections (i, j).
export function nodePos(i, j) { return [i * SP, j * SP]; }
