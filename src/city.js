// Sunset City: a 25 x 25 grid of roads (about 4.4 km across) with a downtown of
// towers, mid-rise streets, low-rise neighbourhoods and suburbs, parks, palms,
// street lights and signs. The city is built in regions of 2 x 2 blocks that
// stream in around the player (and out again behind), merged by material so
// each region is a few dozen draw calls.
import * as THREE from 'three';
import * as T from './textures.js';
import { mulberry32, clamp, hash3 } from './util.js';
import { GB, rectPoly, chamferRect, roundedRect, circlePoly, scalePoly, offsetPoly, mergeGeoms } from './geom.js';
import { makeProps } from './props.js';
import { TOD } from './tod.js';
import { Q } from './quality.js';
export { mergeGeoms };

export const SP = 180;            // distance between road centre lines
export const N = 12;              // lines run from -N to N on both axes
export const isBlvd = k => (((k % 4) + 4) % 4) === 0;     // every fourth road is a boulevard
export const hw = k => (isBlvd(k) ? 16 : 9);              // road half width
export const medianHalf = k => (isBlvd(k) ? 2.5 : 0);
export const laneW = k => (isBlvd(k) ? 4 : 3.8);
export const laneCount = k => (isBlvd(k) ? 3 : 2);
export const laneOffset = (k, lane) => medianHalf(k) + laneW(k) * (lane + 0.5);
export const SIDEWALK = 5;
export const EDGE = N * SP + hw(N);   // outer edge of the ring road
export const LIMIT = EDGE + 420;      // how far out you can drive
const CURB = 0.15, MEDIAN_H = 0.18, CORNER = 5;
const R = 2;                          // blocks per region side
const NR = (2 * N) / R;               // regions per side
export const REGION = R * SP;
export const isPark = (i, j) => Math.max(Math.abs(i + 0.5), Math.abs(j + 0.5)) > 1.6 && hash3(i, j, 99) < 0.065;
export function blockRect(i, j) { return { x0: i * SP + hw(i), x1: (i + 1) * SP - hw(i + 1), z0: j * SP + hw(j), z1: (j + 1) * SP - hw(j + 1) }; }

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
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax > EDGE || az > EDGE) {
    const out = Math.max(ax, az) - EDGE;
    return out < 6 ? { y: CURB, grass: false } : { y: 0, grass: true };
  }
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

const COLORED = new Set(['park', 'mark', 'glass', 'apt', 'shop', 'brick', 'modern', 'house', 'roof', 'tile', 'props']);
const KEYS = ['walk', 'curb', 'park', 'mark', 'glass', 'apt', 'shop', 'brick', 'modern', 'house', 'roof', 'tile', 'lot', 'props', 'sign', 'rail', 'gantry'];
const FAR_KEYS = ['walk', 'curb', 'park', 'mark', 'glass', 'apt', 'shop', 'brick', 'modern', 'house', 'roof', 'tile', 'lot'];
const DETAIL_KEYS = ['props', 'sign', 'rail', 'gantry'];
const CASTS = new Set(['glass', 'apt', 'shop', 'brick', 'modern', 'house', 'roof', 'tile', 'props']);
const snap = h => Math.max(3.5, Math.round(h / 3.5) * 3.5);

class Ctx {
  constructor() {
    this.gb = {}; for (const k of KEYS) this.gb[k] = new GB(COLORED.has(k));
    this.colliders = [];
    this.L = { bushes: [], trees: [], palms: [], lamps: [], poles: [], hedges: [], hydrants: [], bins: [], benches: [], sigZ: [], sigX: [], bills: [], parked: [] };
    this.signN = 0;
  }
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
    this.regions = new Map(); this.job = null; this.deadline = 0; this.version = 0; this.parkCache = []; this.parkVersion = -1;
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
    const a2c = Q.msaa > 0;
    const m = this.mat = {
      walk: macro(std({ color: 0xc2b8b4, map: con.map, normalMap: con.normalMap, roughness: 0.92 }), 0.06, 0.3),
      curb: std({ color: 0xc8c0bc, map: con.map, roughness: 0.9 }),
      park: std({ color: 0x8fa070, map: grass, roughness: 1, vertexColors: true }),
      mark: std({ vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
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
    m.asphalt = macro(std({ color: TOD.road, map: asp.map, roughnessMap: asp.roughnessMap, normalMap: asp.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.66, metalness: 0, envMapIntensity: 1.1 }), 0.045, 0.35);
    this.style = {
      glass: { fac: facG, pal: GLASS }, modern: { fac: facM, pal: MODERN }, apt: { fac: facA, pal: STUCCO },
      brick: { fac: facB, pal: BRICK }, shop: { fac: facS, pal: SHOP }, house: { fac: facH, pal: HOUSE },
    };
    // The road surface: one big plane under everything.
    const ground = new GB(); ground.flat(-EDGE, -EDGE, EDGE, EDGE, 0, 10);
    const gm = new THREE.Mesh(ground.geometry(), m.asphalt); gm.receiveShadow = Q.shadows; gm.layers.enable(2); gm.frustumCulled = false;
    this.group.add(gm);
  }

  allMaterials() {
    const out = [];
    const add = o => { for (const v of Object.values(o)) { if (v && v.isMaterial) out.push(v); else if (v && typeof v === 'object') add(v); } };
    add(this.mat); add(this.props.mat);
    return out;
  }

  // --- Streaming ----------------------------------------------------------------
  regionAt(x, z) { return [clamp(Math.floor((x + N * SP) / REGION), 0, NR - 1), clamp(Math.floor((z + N * SP) / REGION), 0, NR - 1)]; }
  regionCenter(ri, rj) { return [-N * SP + (ri + 0.5) * REGION, -N * SP + (rj + 0.5) * REGION]; }

  // Build every region within `radius` of (x, z) before the first frame.
  async loadAround(x, z, radius, progress = () => {}) {
    const [pi, pj] = this.regionAt(x, z), list = [];
    for (let ri = Math.max(0, pi - radius); ri <= Math.min(NR - 1, pi + radius); ri++)
      for (let rj = Math.max(0, pj - radius); rj <= Math.min(NR - 1, pj + radius); rj++) list.push([ri, rj, Math.hypot(ri - pi, rj - pj)]);
    list.sort((a, b) => a[2] - b[2]);
    this.deadline = Infinity;
    for (let k = 0; k < list.length; k++) {
      const [ri, rj] = list[k];
      if (!this.regions.has(ri + ',' + rj)) { const gen = this.genRegion(ri, rj); let r; do { r = gen.next(); } while (!r.done); this.finish(ri, rj, r.value); }
      progress(`Building the city… ${Math.round((k + 1) / list.length * 100)}%`);
      await frame();
    }
  }

  // The same, all at once (a short hitch): for jumping to somewhere far away.
  loadNow(x, z, radius) {
    const [pi, pj] = this.regionAt(x, z); this.deadline = Infinity;
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
    if (this.job && Math.max(Math.abs(this.job.ri - pi), Math.abs(this.job.rj - pj)) > lr + 1) this.job = null;
    const t0 = performance.now(); this.deadline = t0 + budget;
    while (performance.now() < this.deadline) {
      if (!this.job) {
        let best = null, bd = 1e9;
        for (let ri = Math.max(0, pi - lr); ri <= Math.min(NR - 1, pi + lr); ri++) for (let rj = Math.max(0, pj - lr); rj <= Math.min(NR - 1, pj + lr); rj++) {
          if (this.regions.has(ri + ',' + rj)) continue;
          const d = Math.hypot(ri - pi, rj - pj); if (d < bd) { bd = d; best = [ri, rj]; }
        }
        if (!best) return;
        this.job = { ri: best[0], rj: best[1], gen: this.genRegion(best[0], best[1]) };
      }
      const r = this.job.gen.next();
      if (r.done) { this.finish(this.job.ri, this.job.rj, r.value); this.job = null; }
    }
  }

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
    if (this.parkVersion !== this.version) { this.parkCache = []; for (const r of this.regions.values()) for (const p of r.parked) this.parkCache.push(p); this.parkVersion = this.version; }
    return this.parkCache;
  }

  // --- Making a region ---------------------------------------------------------------
  *genRegion(ri, rj) {
    const ctx = new Ctx();
    for (let bi = 0; bi < R; bi++) for (let bj = 0; bj < R; bj++) {
      yield* this.genBlock(ctx, -N + ri * R + bi, -N + rj * R + bj);
      yield;
    }
    return ctx;
  }

  finish(ri, rj, ctx) {
    const [cx, cz] = this.regionCenter(ri, rj);
    const region = { ri, rj, group: new THREE.Group(), far: new THREE.Group(), detail: new THREE.Group(), trees: new THREE.Group(), colliders: ctx.colliders, parked: ctx.L.parked, lamps: { Z: {}, X: {} } };
    region.group.add(region.far, region.detail, region.trees);
    const mesh = (k, grp, far) => {
      const gb = ctx.gb[k]; if (!gb.count) return;
      const m = new THREE.Mesh(gb.geometry(), this.mat[k]);
      m.castShadow = CASTS.has(k) && Q.shadows; m.receiveShadow = Q.shadows && k !== 'sign';
      if (far) m.layers.enable(2);
      grp.add(m);
    };
    for (const k of FAR_KEYS) mesh(k, region.far, true);
    for (const k of DETAIL_KEYS) mesh(k, region.detail, false);
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
    const at = (x, y, z, yaw, sc) => { q.setFromAxisAngle(up, yaw); s.set(sc, sc, sc); v.set(x, y, z); m4.compose(v, q, s); };
    const placeTree = (t, rnd) => at(t[0], t[3], t[1], rnd() * 6.28, t[2]);
    const leaf = (c, rnd) => { const r = rnd(); c.setRGB(0.8 + r * 0.35, 0.88 + r * 0.2, 0.75 + r * 0.2); };
    inst(P.geo.treeCore, P.mat.treeCore, L.trees, placeTree, true, region.trees);
    inst(P.geo.treeCards, P.mat.treeCards, L.trees, placeTree, true, region.trees, leaf);
    inst(P.geo.bushCore, P.mat.treeCore, L.bushes, placeTree, false, region.trees);
    inst(P.geo.bushCards, P.mat.treeCards, L.bushes, placeTree, false, region.trees, leaf);
    inst(P.geo.palmTrunk, P.mat.palmTrunk, L.palms, placeTree, true, region.trees);
    inst(P.geo.palmFronds, P.mat.palmFronds, L.palms, placeTree, true, region.trees, leaf);
    const placeYaw = it => at(it[0], it[3], it[1], it[2], 1);
    inst(P.geo.lamp, P.mat.lamp, L.lamps, placeYaw, true, region.detail);
    inst(P.geo.bulb, P.mat.bulb, L.lamps, placeYaw, false, region.detail);
    if (TOD.lampsOn) { const pm = inst(P.geo.pool, P.mat.pool, L.lamps, it => at(it[0], 0.03, it[1], it[2], 1), false, region.detail); if (pm) pm.renderOrder = 1; }
    inst(P.geo.pole, P.mat.pole, L.poles, placeYaw, true, region.detail);
    inst(P.geo.hedge, P.mat.hedge, L.hedges, it => { q.identity(); s.set(it[2], 0.95, it[3]); v.set(it[0], CURB, it[1]); m4.compose(v, q, s); }, true, region.detail);
    inst(P.geo.hydrant, P.mat.hydrant, L.hydrants, placeYaw, false, region.detail);
    inst(P.geo.bin, P.mat.bin, L.bins, placeYaw, false, region.detail);
    inst(P.geo.bench, P.mat.bench, L.benches, placeYaw, false, region.detail);
    inst(P.geo.billFrame, P.mat.billFrame, L.bills, it => at(it.x, it.y, it.z, it.yaw, 1), true, region.far);
    inst(P.geo.billFace, P.mat.billFace, L.bills, it => at(it.x, it.y, it.z, it.yaw, 1), false, region.far);
    // Wires between neighbouring poles on the same pavement.
    const pts = [];
    for (let i = 1; i < L.poles.length; i++) {
      const a = L.poles[i - 1], b = L.poles[i];
      if (a[4] !== b[4]) continue;
      const ox = Math.cos(a[2]), oz = -Math.sin(a[2]);
      for (const off of [-1.1, 0, 1.1]) {
        const y0 = CURB + (off === 0 ? 10.6 : 10.28), S = 9;
        for (let k = 0; k < S; k++) {
          const t0 = k / S, t1 = (k + 1) / S;
          const Pt = t => [a[0] + (b[0] - a[0]) * t + ox * off, y0 - 0.7 * 4 * t * (1 - t), a[1] + (b[1] - a[1]) * t + oz * off];
          pts.push(...Pt(t0), ...Pt(t1));
        }
      }
    }
    if (pts.length) { const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); region.detail.add(new THREE.LineSegments(wg, P.mat.wire)); }
    // Traffic signals: a pole and arm, two heads, and a red, amber and green lamp on each.
    const all = [...L.sigZ, ...L.sigX];
    inst(P.geo.sigPole, P.mat.sigDark, all, it => at(it[0], CURB, it[1], it[2], 1), true, region.detail);
    inst(P.geo.sigArm, P.mat.sigDark, all, it => { q.setFromAxisAngle(up, it[2]); s.set(1, 1, it[3]); v.set(it[0], CURB, it[1]); m4.compose(v, q, s); }, true, region.detail);
    const fwd = new THREE.Vector3();
    const heads = { Z: [], X: [] };
    for (const [ax, list] of [['Z', L.sigZ], ['X', L.sigX]]) for (const it of list) for (const f of [0.55, 0.95]) heads[ax].push([it[0], it[1], it[2], it[3] * f]);
    const placeHead = (h, dy = 0, dxl = 0) => {
      q.setFromAxisAngle(up, h[2]); fwd.set(Math.sin(h[2]), 0, Math.cos(h[2]));
      v.set(h[0] + fwd.x * h[3] + Math.cos(h[2]) * dxl, CURB + 5.5 + dy, h[1] + fwd.z * h[3] - Math.sin(h[2]) * dxl); s.set(1, 1, 1); m4.compose(v, q, s);
    };
    inst(P.geo.sigHead, P.mat.sigHead, [...heads.Z, ...heads.X], h => placeHead(h), true, region.detail);
    for (const ax of ['Z', 'X']) for (const [k, dy] of [['R', 0.3], ['A', 0], ['G', -0.3]]) {
      const lm = inst(P.geo.sigLamp, P.mat.sigLamp[k], heads[ax], h => placeHead(h, dy, 0.17), false, region.detail);
      if (lm) { lm.visible = this.sig[ax] === k; region.lamps[ax][k] = lm; }
    }
    this.group.add(region.group);
    this.regions.set(ri + ',' + rj, region); this.version++;
  }

  // --- One block: pavement, furniture, road markings and buildings --------------------
  *genBlock(ctx, i, j) {
    const rnd = mulberry32(Math.imul(i + 1000, 73856093) ^ Math.imul(j + 1000, 19349663));
    const b = blockRect(i, j), gb = ctx.gb, L = ctx.L;
    const park = isPark(i, j);
    const ix0 = b.x0 + SIDEWALK, ix1 = b.x1 - SIDEWALK, iz0 = b.z0 + SIDEWALK, iz1 = b.z1 - SIDEWALK;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, d = Math.max(Math.abs(cx), Math.abs(cz));
    const zone = d < 520 ? 'down' : d < 1000 ? 'mid' : d < 1500 ? 'low' : 'sub';

    // The pavement slab, with rounded corners and a kerb round it.
    const pad = roundedRect(b.x0, b.z0, b.x1, b.z1, CORNER, 5);
    gb.walk.cap(pad, CURB, 6, WHITE);
    gb.curb.extrude(pad, 0, CURB, 4.5, 4.5, WHITE, 0, true);
    this.outerStrip(ctx, i, j, b, rnd);

    // Street furniture along the four sides of the block.
    const sides = [
      { line: i, axis: 'x', c: b.x0, from: b.z0, to: b.z1, out: -1 },
      { line: i + 1, axis: 'x', c: b.x1, from: b.z0, to: b.z1, out: 1 },
      { line: j, axis: 'z', c: b.z0, from: b.x0, to: b.x1, out: -1 },
      { line: j + 1, axis: 'z', c: b.z1, from: b.x0, to: b.x1, out: 1 },
    ];
    sides.forEach((s, si) => {
      const blvd = isBlvd(s.line), len = s.to - s.from, nLamps = Math.max(2, Math.round(len / 34));
      for (let n = 0; n < nLamps; n++) {
        const t = s.from + 8 + (len - 16) * (n / (nLamps - 1)), p = s.c + s.out * -0.8;
        const yaw = s.axis === 'x' ? (s.out < 0 ? -Math.PI / 2 : Math.PI / 2) : (s.out < 0 ? Math.PI : 0);
        const [x, z] = s.axis === 'x' ? [p, t] : [t, p];
        L.lamps.push([x, z, yaw, CURB]); addCollider({ type: 'circ', x, z, r: 0.25 }, ctx.colliders);
        if (n < nLamps - 1) {
          const r2 = rnd(), tq = t + (len - 16) / (nLamps - 1) * 0.28;
          const [qx, qz] = s.axis === 'x' ? [s.c - s.out * 0.7, tq] : [tq, s.c - s.out * 0.7];
          if (r2 < 0.12) { L.hydrants.push([qx, qz, 0, CURB]); addCollider({ type: 'circ', x: qx, z: qz, r: 0.3 }, ctx.colliders); }
          else if (r2 < 0.3) { L.bins.push([qx, qz, rnd() * 6, CURB]); addCollider({ type: 'circ', x: qx, z: qz, r: 0.3 }, ctx.colliders); }
          else if (r2 < 0.38 && blvd) { const [bx, bz] = s.axis === 'x' ? [s.c - s.out * 3.9, tq] : [tq, s.c - s.out * 3.9]; L.benches.push([bx, bz, yaw + Math.PI, CURB]); }
        }
        if (!blvd && s.out > 0 && n % 2 === 0) {
          const pp = s.c - s.out * 4.3, [px, pz] = s.axis === 'x' ? [pp, t] : [t, pp];
          L.poles.push([px, pz, s.axis === 'x' ? 0 : Math.PI / 2, CURB, i + ',' + j + ',' + si]); addCollider({ type: 'circ', x: px, z: pz, r: 0.25 }, ctx.colliders);
        }
        if (n < nLamps - 1) {
          const tm = t + (len - 16) / (nLamps - 1) / 2, pt = s.c - s.out * 2.6;
          const [tx, tz] = s.axis === 'x' ? [pt, tm] : [tm, pt];
          if (blvd) { if ((n + i + j) % 3 === 2) this.tree(ctx, tx, tz, 1.1 + rnd() * 0.5, CURB, false); else this.tree(ctx, tx, tz, 0.9 + rnd() * 0.35, CURB, true); L.bushes.push([tx + (rnd() - 0.5) * 3, tz + (rnd() - 0.5) * 3, 0.8 + rnd() * 0.6, CURB]); }
          else if (rnd() < 0.8) this.tree(ctx, tx, tz, 0.85 + rnd() * 0.5, CURB, false);
        }
      }
    });

    // The roads this block owns: the avenue on its west side, the street on its
    // north side, and (on the far edge of the map) the ring roads.
    this.segment(ctx, 'x', i, j, rnd); this.segment(ctx, 'z', j, i, rnd);
    if (i === N - 1) this.segment(ctx, 'x', N, j, rnd);
    if (j === N - 1) this.segment(ctx, 'z', N, i, rnd);
    this.junction(ctx, i, j);
    if (i === N - 1) this.junction(ctx, N, j);
    if (j === N - 1) this.junction(ctx, i, N);
    if (i === N - 1 && j === N - 1) this.junction(ctx, N, N);

    if (park) {
      const lawn = roundedRect(ix0, iz0, ix1, iz1, 3, 4);
      gb.park.cap(lawn, CURB + 0.03, 18, GRASS_TINT);
      gb.curb.extrude(lawn, CURB, CURB + 0.03, 4.5, 4.5, WHITE, 0, true);
      const mx = (ix0 + ix1) / 2, mz = (iz0 + iz1) / 2;
      gb.walk.flat(ix0, mz - 1.6, ix1, mz + 1.6, CURB + 0.05, 6, WHITE); gb.walk.flat(mx - 1.6, iz0, mx + 1.6, iz1, CURB + 0.05, 6, WHITE);
      for (let k = 0; k < 40; k++) {
        const bx = ix0 + 4 + rnd() * (ix1 - ix0 - 8), bz = iz0 + 4 + rnd() * (iz1 - iz0 - 8);
        if (Math.abs(bx - mx) > 3 && Math.abs(bz - mz) > 3) L.bushes.push([bx, bz, 0.9 + rnd() * 0.9, CURB + 0.03]);
      }
      for (let k = 0; k < 44; k++) {
        const x = ix0 + 6 + rnd() * (ix1 - ix0 - 12), z = iz0 + 6 + rnd() * (iz1 - iz0 - 12);
        if (Math.abs(x - mx) < 4 || Math.abs(z - mz) < 4) continue;
        this.tree(ctx, x, z, 1.0 + rnd() * 0.8, CURB + 0.03, rnd() < 0.25);
      }
      for (let k = 0; k < 6; k++) { const px = k < 3 ? mx + 3 : mx - 3, pz = mz - 24 + k * 16; L.benches.push([px, pz, k < 3 ? -Math.PI / 2 : Math.PI / 2, CURB + 0.05]); }
      return;
    }

    // Buildings on lots.
    const houseBlock = zone === 'sub' ? hash3(i, j, 5) < 0.93 : zone === 'low' ? hash3(i, j, 5) < 0.5 : false;
    const maxLot = zone === 'down' ? 60 : zone === 'mid' ? 44 : houseBlock ? 30 : 36;
    const lots = []; subdivide({ x0: ix0, z0: iz0, x1: ix1, z1: iz1 }, maxLot, rnd, lots);
    for (const lot of lots) {
      const faces = [];
      if (lot.x0 - ix0 < 0.5) faces.push({ dir: [-1, 0], line: i, axis: 'x' });
      if (ix1 - lot.x1 < 0.5) faces.push({ dir: [1, 0], line: i + 1, axis: 'x' });
      if (lot.z0 - iz0 < 0.5) faces.push({ dir: [0, -1], line: j, axis: 'z' });
      if (iz1 - lot.z1 < 0.5) faces.push({ dir: [0, 1], line: j + 1, axis: 'z' });
      const onBlvd = faces.some(f => isBlvd(f.line));
      if (houseBlock && !onBlvd) this.addHouse(ctx, lot, faces, rnd);
      else if (!faces.length && (zone === 'low' || zone === 'sub') && rnd() < 0.4) this.parkingLot(ctx, lot, rnd);
      else this.addBuilding(ctx, lot, faces, zone, d, onBlvd, rnd);
      if (performance.now() > this.deadline) yield;
    }
  }

  tree(ctx, x, z, sc, y, palm) {
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
    for (const [a0, dir] of [[aA + 0.6, 1], [aB - 0.6, -1]]) {                 // crosswalks and stop lines
      for (let c = -H + 1; c < H - 1; c += 1.25) rect(a0, a0 + dir * 4, c, c + 0.6, 0.012, W);
      const side = dir > 0 ? -rs : rs;
      rect(a0 + dir * 5.2, a0 + dir * 5.7, side * m, side * (m + nl * lw), 0.012, W);
    }
    const s0 = aA + 6.5, s1 = aB - 6.5;
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
      for (let a = a0 + 6; a < a1 - 3; a += 21) ctx.L.palms.push(axis === 'x' ? [C, a, 0.95 + rnd() * 0.35, MEDIAN_H] : [a, C, 0.95 + rnd() * 0.35, MEDIAN_H]);
      for (let a = a0 + 3; a < a1 - 1; a += 5.5) {                                // a lush strip of bushes down the median
        const o = (rnd() - 0.5) * 2.2, sc = 0.9 + rnd() * 0.7;
        ctx.L.bushes.push(axis === 'x' ? [C + o, a, sc, MEDIAN_H] : [a, C + o, sc, MEDIAN_H]);
      }
      if (hash3(k, seg, axis === 'x' ? 1 : 2) < 0.2) this.gantry(ctx, axis, k, (aA + aB) / 2, m, lw, nl, H);
    }
  }

  // An overhead road sign over a boulevard, one panel over each direction.
  gantry(ctx, axis, k, a, m, lw, nl, H) {
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
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (Math.abs(i - dx) > N || Math.abs(j - dz) > N) continue;
      const rx = -dz, rz = dx, lat = dz !== 0 ? hw(i) : hw(j), lon = dz !== 0 ? hw(j) : hw(i);
      const x = i * SP + rx * (lat + 2.2) - dx * (lon + 2.2), z = j * SP + rz * (lat + 2.2) - dz * (lon + 2.2);
      (dz !== 0 ? ctx.L.sigZ : ctx.L.sigX).push([x, z, Math.atan2(dz, -dx), Math.min(lat - 1, 8.5)]);
      addCollider({ type: 'circ', x, z, r: 0.3 }, ctx.colliders);
    }
  }

  // --- Buildings ----------------------------------------------------------------------
  pickStyle(zone, d, onBlvd, faces, rnd) {
    const r = rnd();
    let style, h;
    if (zone === 'down') {
      style = r < 0.62 ? 'glass' : r < 0.9 ? 'modern' : 'apt';
      h = style === 'apt' ? 28 + rnd() * 18 : 40 + Math.pow(rnd(), 1.3) * 130 * clamp(1.3 - d / 520, 0.35, 1);
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
    const { style, h } = this.pickStyle(zone, d, onBlvd, faces, rnd);
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

  buildMass(ctx, b, style, h, faces, rnd) {
    const { fac, pal } = this.style[style], gb = ctx.gb[style], G = ctx.gb;
    const c = pal[(rnd() * pal.length) | 0], uOff = Math.floor(rnd() * 4) / 4;
    const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const tower = style === 'glass' || style === 'modern';
    const r = rnd();
    let poly = rectPoly(b), kind = 'rect';
    if (tower && h > 50 && Math.min(w, d) > 24 && r < 0.3) { kind = 'round'; poly = circlePoly(cx, cz, Math.min(w, d) / 2 - 0.5, 28); }
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
    if (kind === 'round') addCollider({ type: 'circ', x: cx, z: cz, r: Math.min(w, d) / 2 }, ctx.colliders);
    else addCollider({ type: 'box', x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 }, ctx.colliders);
    if ((style === 'apt' || style === 'brick' || style === 'modern') && (kind === 'rect' || kind === 'chamfer') && h >= 10 && h < 70) this.balconies(ctx, b, h, faces, kind === 'chamfer' ? 5.5 : 1.5, rnd);
    if (style === 'shop' && faces.length) {
      for (const f of faces.slice(0, 2)) this.shopSign(ctx, b, f, h, rnd);
      if (isBlvd(faces[0].line) && rnd() < 0.3) this.poleSign(ctx, b, faces[0], rnd);
    }
    if (!tower && faces.length && ctx.L.bills.length < 2 && rnd() < 0.05) ctx.L.bills.push({ x: cx, z: cz, y: top + 2, yaw: Math.atan2(faces[0].dir[0], faces[0].dir[1]) });
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

  signUV(ctx) {
    const n = ctx.signN++ % 32, cc = n % 4, rr = (n / 4) | 0;
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
          ctx.L.parked.push({ x: px, z: pz, h: yaw, y: CURB, type: (rnd() * 3) | 0, ci: (rnd() * 12) | 0 });
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
