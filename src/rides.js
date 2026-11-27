// Rides that are not cars: a motorbike, a speedboat, a jet ski and a helicopter, each a detailed model of a real machine made by an artist and
// published under a Creative Commons licence (assets/CREDITS.md says who made each). They wait where they are kept (the bike beside your car at the
// start, the boats moored at the Port Meridian quay, the helicopter on a helipad in the park south of the start); walk up to one and press the use
// key.
//   The motorbike is driven like a car (main.js: the car physics, given a bike's weight, power and footprint), and drawn leaning into the bends with
// its wheels turning and the rider on it, feet on the pegs. The boats (class Boat) and the helicopter (class Heli) are "craft": they have physics of
// their own (on the water: thrust, the hull's drag, the keel, a planing hull's bow lifting, the waves; in the air: rotor spin-up, lift, cyclic,
// yaw, the ground and the roofs under it, the buildings in the way), and main.js steps one of them instead of the car while you are aboard.
// Every model is put into the game's terms when it loads: the long axis along z, the nose at +z, scaled to the real machine's length, standing on
// y = 0 (the keel's bottom for a boat), centred, and the parts found that move (the wheels, the rotors) or carry a person (seat, grips).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { glowTex, carShadowTex } from './textures.js';
import { marqueSpec } from './marque-specs.js';
import { clamp, wrapAngle } from './util.js';
import { groundAt, heightAt, SEA_Y, WORLD } from './world.js';
import { queryColliders } from './city.js';
import { ROOFS } from './roofs.js';
const CURB = 0.15;                     // (the kerb height: building colliders' heights are measured from it, city.js)

// Per model: the file; the real length (m); which way the nose is (flip: the model's nose is at -z; narrow: the narrower end is the bow; tail: the
// end with the parts named tail is the back); parts to hide (registration numbers); and what moves or carries someone.
export const KINDS = {
  bike: { file: 'motorbike.glb', len: 2.15, flip: true, name: 'MOTORBIKE', prompt: 'RIDE THE MOTORBIKE', tyre: /Pneu/i, grip: /ACELERADOR/i, seat: /banco/i, tail: /luzes de tras/i, head: /farol/i },
  speedboat: { file: 'speedboat.glb', len: 6.5, front: 'narrow', name: 'SPEEDBOAT', prompt: 'TAKE THE SPEEDBOAT', boat: true, draft: 0.55, seatPart: /^polySurface(7|10)$/, pose: 'seat',
    thrust: 7.2, k1: 0.05, k2: 0.0105, turn: 0.9, grip: 2.4, plane: 10, mass: 1400 },
  jetski: { file: 'jetski.glb', len: 3.3, front: 'narrow', hide: /^Registration$/, name: 'WATER SCOOTER', prompt: 'TAKE THE WATER SCOOTER', boat: true, draft: 0.32, pose: 'bike',
    thrust: 8.5, k1: 0.06, k2: 0.0125, turn: 1.6, grip: 3.2, plane: 7, mass: 420 },
  heli: { file: 'helicopter.glb', len: 19.5, front: 'tail', tailPart: /backrotor/i, rotorPart: /propellar/i, name: 'HELICOPTER', prompt: 'FLY THE HELICOPTER', heli: true },
};
const DIR = new URL('../assets/rides/', import.meta.url).href, DRACO = new URL('../assets/draco/', import.meta.url).href;
let draco = null; const templates = {}, loading = {};
const namesOf = o => { const n = []; for (let p = o; p; p = p.parent) if (p.name) n.push(p.name); return n; };
const named = (re, o, mat) => !!re && (namesOf(o).some(n => re.test(n)) || (mat && re.test(mat.name || '')));

export function loadRide(kind) {
  const cfg = KINDS[kind]; if (!cfg) return Promise.reject(new Error('no ride ' + kind));
  if (templates[kind]) return Promise.resolve(templates[kind]);
  if (loading[kind]) return loading[kind];
  if (!draco) { draco = new DRACOLoader(); draco.setDecoderPath(DRACO); }
  const L = new GLTFLoader(); L.setDRACOLoader(draco);
  return (loading[kind] = L.loadAsync(DIR + cfg.file).then(g => (templates[kind] = prepare(g.scene, cfg))));
}
export const rideReady = kind => !!templates[kind];
export function preloadRides(kinds = Object.keys(KINDS)) { return Promise.allSettled(kinds.map(k => loadRide(k).catch(e => { console.warn('ride ' + k + ' did not load', e); throw e; }))); }

// Every mesh of the model baked into the game's frame: [{ name, mat, g }] (g non-indexed, world space), plus the box.
function prepare(scene, cfg) {
  scene.updateMatrixWorld(true);
  const parts = [];
  scene.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    for (const m of [].concat(o.material)) { m.userData.ride = true; for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[k]) m[k].userData.ride = true; }
    if (named(cfg.hide, o, o.material)) return;
    let src = o.geometry;
    if (o.isSkinnedMesh) {                                                  // (a rigged model: its corners where its bones put them, not where they are stored)
      o.skeleton.update(); src = src.clone(); const P = src.attributes.position, out = new Float32Array(P.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); o.applyBoneTransform(i, v); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
      src.setAttribute('position', new THREE.BufferAttribute(out, 3)); src.deleteAttribute('normal');
    }
    let g = src.index ? src.toNonIndexed() : src.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(o.matrixWorld); parts.push({ names: namesOf(o), o, mat: o.material, g });
  });
  const box = () => { const b = new THREE.Box3(); for (const p of parts) { p.g.computeBoundingBox(); b.union(p.g.boundingBox); } return b; };
  const apply = M => { for (const p of parts) p.g.applyMatrix4(M); };
  let b = box(), s = b.getSize(new THREE.Vector3());
  if (s.x > s.z) { apply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)); b = box(); s = b.getSize(new THREE.Vector3()); }
  // Which end is the nose.
  let flip = !!cfg.flip;
  if (cfg.front === 'narrow') {
    const z0 = b.min.z, z1 = b.max.z, end = s.z * 0.15, wid = [[1e9, -1e9], [1e9, -1e9]];
    for (const p of parts) { const a = p.g.attributes.position; for (let i = 0; i < a.count; i++) { const z = a.getZ(i), x = a.getX(i), k = z < z0 + end ? 0 : z > z1 - end ? 1 : -1; if (k < 0) continue; wid[k][0] = Math.min(wid[k][0], x); wid[k][1] = Math.max(wid[k][1], x); } }
    flip = wid[0][1] - wid[0][0] < wid[1][1] - wid[1][0];          // (the low-z end narrower: that is the bow, so turn it round)
  } else if (cfg.front === 'tail') {
    const t = new THREE.Box3(); for (const p of parts) if (p.names.some(n => cfg.tailPart.test(n))) t.union(p.g.boundingBox);
    flip = !t.isEmpty() && t.getCenter(new THREE.Vector3()).z > (b.min.z + b.max.z) / 2;
  }
  if (flip) { apply(new THREE.Matrix4().makeRotationY(Math.PI)); b = box(); s = b.getSize(new THREE.Vector3()); }
  const k = cfg.len / s.z; apply(new THREE.Matrix4().makeScale(k, k, k)); b = box();
  apply(new THREE.Matrix4().makeTranslation(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)); b = box();
  for (const p of parts) { p.g.computeBoundingBox(); p.box = p.g.boundingBox.clone(); }
  return { cfg, parts, box: b, size: b.getSize(new THREE.Vector3()) };
}
function add(map, mat, g) { let a = map.get(mat); if (!a) map.set(mat, a = []); a.push(g); }
function mergeAll(map) { const out = new Map(); for (const [mat, list] of map) { const uv = list.some(g => g.attributes.uv); for (const g of list) { if (uv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!uv && g.attributes.uv) g.deleteAttribute('uv'); } const g = mergeGeometries(list, false); if (g) out.set(mat, mergeVertices(g, 1e-5)); } return out; }
function pick(g, tris) {
  const out = new THREE.BufferGeometry();
  for (const k of Object.keys(g.attributes)) { const a = g.attributes[k], n = a.itemSize, arr = new Float32Array(tris.length * 3 * n); tris.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < n; c++) arr[(i * 3 + v) * n + c] = a.array[(t + v) * n + c]; }); out.setAttribute(k, new THREE.BufferAttribute(arr, n)); }
  return out;
}
const meshOf = (g, mat, parent, shadow = true) => { const m = new THREE.Mesh(g, mat); m.castShadow = shadow && !mat.transparent; m.receiveShadow = !mat.transparent; parent.add(m); return m; };
let _glow = null;
const glow = () => _glow || (_glow = glowTex());
function contactShadow(w, l, parent) { const cs = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: carShadowTex(), transparent: true, depthWrite: false })); cs.position.y = 0.02; cs.renderOrder = 2; cs.name = 'contact'; parent.add(cs); return cs; }
function sprite(color, opacity, parent, x, y, z, sx, sy) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })); sp.position.set(x, y, z); sp.scale.set(sx, sy, 1); parent.add(sp); return sp; }

// ---- The motorbike: a mesh in the shape main.js drives (as marques.js and scancars.js make them) ---------------------------------------------------
// A bike's physics: the car model with a narrow footprint, a light body and a short wheelbase (it does not fall over: the lean is drawn, not simulated).
const BIKE = { id: 'bike', phys: { mass: 290, T: 138, peak: 8200, red: 11000, vmax: 68, drag: 0.42, mu: 1.25, front: 0, cgH: 0.5, cgAt: 0.47, gears: 6, down: 0, sag: 0.04 } };
export function bikeSpec(dims) { const s = marqueSpec({ ...BIKE, dims }, dims); s.model = 'bike'; s.wid = 0.8; s.len = dims.len; return s; }
export function makeBike() {
  const T = templates.bike; if (!T) return null; const cfg = T.cfg;
  // The tyres: one part for both, split at the middle; each wheel's hub and radius from its tyre.
  const tyre = [new THREE.Box3(), new THREE.Box3()];
  for (const p of T.parts) if (p.names.some(n => cfg.tyre.test(n))) { const a = p.g.attributes.position; for (let i = 0; i < a.count; i++) { const z = a.getZ(i); tyre[z > 0 ? 0 : 1].expandByPoint(new THREE.Vector3(a.getX(i), a.getY(i), z)); } }
  const hubs = tyre.map(b => ({ c: b.getCenter(new THREE.Vector3()), r: (b.max.y - b.min.y) / 2, hw: (b.max.x - b.min.x) / 2 + 0.015 }));
  // Everything inside a wheel's cylinder turns with it; the rest is the bike.
  const rest = new Map(), spin = [new Map(), new Map()], seat = new THREE.Box3(), grip = new THREE.Box3(), tailB = new THREE.Box3(), headB = new THREE.Box3(), tailMats = new Set();
  for (const p of T.parts) {
    if (p.names.some(n => cfg.seat.test(n))) seat.union(p.box); if (p.names.some(n => cfg.grip.test(n))) grip.union(p.box);
    if (p.names.some(n => cfg.tail.test(n))) { tailB.union(p.box); tailMats.add(p.mat); } if (p.names.some(n => cfg.head.test(n))) headB.union(p.box);
    const a = p.g.attributes.position, sets = [[], [], []];
    for (let t = 0; t < a.count; t += 3) {
      const cx = (a.getX(t) + a.getX(t + 1) + a.getX(t + 2)) / 3, cy = (a.getY(t) + a.getY(t + 1) + a.getY(t + 2)) / 3, cz = (a.getZ(t) + a.getZ(t + 1) + a.getZ(t + 2)) / 3;
      let k = 2; for (let w = 0; w < 2; w++) { const H = hubs[w]; if (Math.abs(cx - H.c.x) < H.hw && Math.hypot(cy - H.c.y, cz - H.c.z) < H.r * 1.02) k = w; }
      sets[k].push(t);
    }
    if (sets[2].length) add(rest, p.mat, sets[2].length === a.count / 3 ? p.g : pick(p.g, sets[2]));
    for (let w = 0; w < 2; w++) if (sets[w].length) { const g = pick(p.g, sets[w]); g.translate(-hubs[w].c.x, -hubs[w].c.y, -hubs[w].c.z); add(spin[w], p.mat, g); }
  }
  const restM = mergeAll(rest), spinM = spin.map(mergeAll);
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const tails = [];
  const matFor = m => { if (!tailMats.has(m)) return m; const c = m.clone(); c.userData = {}; if (!c.emissive || c.emissive.getHex() === 0) { c.emissive = new THREE.Color(0xff2208); c.emissiveIntensity = 0.6; } tails.push(c); return c; };
  for (const [mat, g] of restM) meshOf(g, matFor(mat), body);
  const wheels = hubs.map((H, w) => { const steer = new THREE.Group(); steer.position.copy(H.c); body.add(steer); const sp = new THREE.Group(); steer.add(sp); for (const [mat, g] of spinM[w]) meshOf(g, mat, sp); return { steer, spin: sp, front: w === 0, side: 1, baseY: H.c.y }; });
  const base = tails.map(m => m.emissiveIntensity || 1); let tv = 3.2;
  const tail = { get emissiveIntensity() { return tv; }, set emissiveIntensity(x) { tv = x; tails.forEach((m, i) => { m.emissiveIntensity = base[i] * (x / 3.2); }); } };
  const tc = tailB.isEmpty() ? new THREE.Vector3(0, 0.8, T.box.min.z + 0.1) : tailB.getCenter(new THREE.Vector3()), hc = headB.isEmpty() ? new THREE.Vector3(0, 0.95, T.box.max.z - 0.3) : headB.getCenter(new THREE.Vector3());
  const tailGlow = [sprite(0xff2a10, 0.5, body, 0, tc.y, tc.z - 0.06, 0.35, 0.22)], headGlow = [sprite(0xe6eeff, 0.4, body, 0, hc.y, hc.z + 0.08, 0.45, 0.32)];
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0x5aa8ff, transparent: true, opacity: 0, depthWrite: false })); flame.visible = false; body.add(flame);
  contactShadow(0.9, T.size.z + 0.4, root);
  // The rider: hips on the front of the seat, hands on the grips (the throttle is the right one: -x), eyes above and a little ahead of the hips.
  const sTop = seat.isEmpty() ? 0.8 : seat.max.y, sFront = seat.isEmpty() ? 0 : seat.max.z;
  const gc = grip.isEmpty() ? new THREE.Vector3(-0.33, 1.0, sFront + 0.45) : grip.getCenter(new THREE.Vector3()), gx = Math.abs(gc.x);
  const hip = new THREE.Vector3(0, sTop - 0.04, sFront - 0.26), eye = hip.clone().add(new THREE.Vector3(0, 0.74, 0.2));
  const grips = [gx, -gx].map(x => { const m = new THREE.Object3D(); m.position.set(x, gc.y, gc.z); body.add(m); return m; });
  const cockpit = { eye, style: 'bike', group: body, seat: { hip, grips }, update() {} };
  const D = { wzf: +hubs[0].c.z.toFixed(3), wzr: +hubs[1].c.z.toFixed(3), track: 0.9, wheelR: +((hubs[0].r + hubs[1].r) / 2).toFixed(3), len: +T.size.z.toFixed(3), width: 0.8 };
  root.userData = { body, wheels, paint: new THREE.MeshStandardMaterial(), paintKey: null, tail, tailGlow, headGlow, flame, cockpit, bike: true, real: true, ride: { name: 'MOTORBIKE', own: true }, ownRide: true, lean: 0,
    dims: D, cgOff: -(D.wzr + (D.wzf - D.wzr) * BIKE.phys.cgAt), beamZ: hc.z, hoodCam: [0, eye.y + 0.05, eye.z + 0.4], bumperCam: [0, 0.6, T.box.max.z + 0.1], muzzleZ: T.box.max.z + 0.2 };
  return root;
}

// ---- Craft: a boat or the helicopter, with its own physics -------------------------------------------------------------------------------------
// Things in the water that are not in the colliders: the pier and the ship at anchor at Port Meridian (sites-coast.js).
const SEA_BLOCKS = [{ x0: -3471, x1: -3320, z0: 493, z1: 506 }, { x0: -3463, x1: -3437, z0: 503, z1: 657 }];
// A craft's mesh: the model's parts merged a material, under a body group (which pitches and rolls); rotors in their own groups.
function craftMesh(T, extra = {}) {
  const cfg = T.cfg, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const statics = new Map(), groups = {};
  for (const p of T.parts) {
    const key = extra.part ? extra.part(p) : null;
    if (key) { (groups[key] || (groups[key] = [])).push(p); continue; }
    add(statics, p.mat, p.g);
  }
  for (const [mat, g] of mergeAll(statics)) meshOf(g, mat, body);
  const out = { root, body };
  for (const [key, list] of Object.entries(groups)) {
    const b = new THREE.Box3(); for (const p of list) b.union(p.box); const c = b.getCenter(new THREE.Vector3()), grp = new THREE.Group(); grp.position.copy(c); body.add(grp);
    const m = new Map(); for (const p of list) add(m, p.mat, p.g.clone().translate(-c.x, -c.y, -c.z)); for (const [mat, g] of mergeAll(m)) meshOf(g, mat, grp);
    out[key] = grp; out[key + 'Box'] = b;
  }
  return out;
}
class Craft {
  constructor(kind) {
    this.kind = kind; this.cfg = KINDS[kind]; this.name = this.cfg.name; this.isCraft = true; this.onFoot = false;
    this.x = 0; this.z = 0; this.y = 0; this.h = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.w = 0; this.speed = 0; this.pitch = 0; this.roll = 0; this.t = Math.random() * 10; this.sight = 260;
    this.mesh = null; this.ud = null;
  }
  get px() { return this.x; } get pz() { return this.z; }
  worldVel() { return [this.vx, this.vz]; }                             // (for the police: as the car's)
  get bodyY() { return this.y + 0.8; }
  place(x, z, h, y) { this.x = x; this.z = z; this.h = h; if (y !== undefined) this.y = y; this.vx = this.vy = this.vz = this.w = this.speed = 0; this.pose(); }
  pose() { if (!this.mesh) return; this.mesh.position.set(this.x, this.y, this.z); this.mesh.rotation.set(0, this.h, 0); this.ud.body.rotation.set(this.pitch, 0, this.roll); }
}

// A boat. Throttle (forward / back) and steering; Shift for more. The hull drags (a little at low speed, a lot as it goes faster); the keel stops it
// sliding sideways; it turns only while water flows past the rudder (or the jet); a planing hull lifts its bow over the hump and then levels out;
// the waves lift it and rock it. It cannot leave the water: it stops against the shore, the quay, the pier and the ship.
export class Boat extends Craft {
  constructor(kind) {
    super(kind); const T = templates[kind], cfg = this.cfg, M = craftMesh(T);
    this.mesh = M.root; this.mesh.name = kind; this.len = T.size.z; this.width = T.size.x; this.top = T.size.y;
    this.y = SEA_Y - cfg.draft;
    // Where the driver sits: on the seat part on the right (-x) side, or along the middle (a jet ski: like a bike).
    let hip, grips;
    if (cfg.pose === 'seat') {
      let best = null; for (const p of T.parts) if (p.names.some(n => cfg.seatPart.test(n))) { const c = p.box.getCenter(new THREE.Vector3()); if (!best || c.x < best.x) best = c.clone().setY(p.box.max.y); }
      const c = best || new THREE.Vector3(-0.6, T.size.y * 0.45, 0.1 * this.len);
      hip = new THREE.Vector3(c.x, c.y + 0.02, c.z - 0.05); grips = [0.17, -0.17].map(dx => new THREE.Vector3(c.x + dx, c.y + 0.42, c.z + 0.48));
    } else {
      hip = new THREE.Vector3(0, T.size.y * 0.62, -0.12 * this.len); grips = [0.3, -0.3].map(dx => new THREE.Vector3(dx, T.size.y * 0.8, 0.12 * this.len));
    }
    const gm = grips.map(v => { const o = new THREE.Object3D(); o.position.copy(v); M.body.add(o); return o; });
    this.ud = { body: M.body, cockpit: { eye: hip.clone().add(new THREE.Vector3(0, 0.75, 0.1)), seat: { hip, grips: gm }, style: cfg.pose === 'bike' ? 'bike' : 'seat', update() {} }, craft: this };
    this.mesh.userData = this.ud;
    this.cam = { dist: 6 + this.len * 0.9, height: 2.2 + this.len * 0.25, look: 1.0 };
  }
  // Deep enough for the hull here, and nothing in the way.
  water(x, z) {
    if (x < WORLD.x0 + 60 || z < WORLD.z0 + 60 || z > WORLD.z1 - 60) return false;
    for (const b of SEA_BLOCKS) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return false;
    return heightAt(x, z) < SEA_Y - this.cfg.draft - 0.25;
  }
  // Where you step off: the nearest dry land within reach, or null.
  landing() {
    let best = null, bd = 1e9;
    for (let r = 2; r <= 16; r += 1) for (let a = 0; a < 24; a++) {
      const ang = a / 24 * Math.PI * 2, x = this.x + Math.sin(ang) * r, z = this.z + Math.cos(ang) * r, g = groundAt(x, z);
      if (g.y > SEA_Y + 0.6 && heightAt(x, z) > SEA_Y + 0.6 && r < bd) { bd = r; best = { x, z, y: g.y, h: ang }; }
      if (best) return best;
    }
    return best;
  }
  canLeave() { return this.speed > 2.5 ? 'SLOW DOWN FIRST' : this.landing() ? null : 'GET TO THE SHORE OR THE QUAY'; }
  update(dt, f = {}) {
    const c = this.cfg, thr = clamp(f.my || 0, -1, 1), st = clamp(f.mx || 0, -1, 1), boost = f.sprint ? 1.35 : 1;
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    let v = this.vx * fx + this.vz * fz, vl = this.vx * fz - this.vz * fx;
    const F = thr > 0 ? thr * c.thrust * boost : thr * c.thrust * 0.45;
    const drag = c.k1 * v * 9.8 * 0.1 + c.k2 * v * Math.abs(v);
    v += (F - drag) * dt; if (thr === 0) v *= Math.exp(-dt * 0.25);
    vl *= Math.exp(-dt * c.grip);
    // Turning needs water past the rudder (a jet ski steers with its jet: less with the throttle off).
    const flow = clamp(Math.abs(v) / 4, 0, 1) * (c.pose === 'bike' ? 0.35 + 0.65 * Math.max(0, thr) : 1), wT = -st * c.turn * flow * Math.sign(v || 1) / (1 + Math.abs(v) / 28);
    this.w += (wT - this.w) * Math.min(1, dt * 3);
    this.h = wrapAngle(this.h + this.w * dt);
    const nfx = Math.sin(this.h), nfz = Math.cos(this.h);
    let vx = nfx * v + nfz * vl, vz = nfz * v - nfx * vl;
    // The shore: try the move; if the bow (or the middle) would be aground, stop against it.
    const nx = this.x + vx * dt, nz = this.z + vz * dt, bow = this.len * 0.42;
    if (this.water(nx + nfx * bow * Math.sign(v || 1), nz + nfz * bow * Math.sign(v || 1)) && this.water(nx, nz)) { this.x = nx; this.z = nz; }
    else { const hit = Math.hypot(vx, vz); this.bump = hit; vx *= -0.25; vz *= -0.25; v = vx * nfx + vz * nfz; }
    this.vx = vx; this.vz = vz; this.speed = Math.hypot(vx, vz); this.vfwd = v;
    // The water: waves lift and rock it; a planing hull's bow rises over the hump, then the hull levels and skims; it heels into a turn.
    this.t += dt; const sp = Math.abs(v), hump = clamp(sp / c.plane, 0, 1) * clamp(2.2 - sp / c.plane, 0, 1), skim = clamp((sp - c.plane) / (c.plane * 2), 0, 1);
    const wave = (Math.sin(this.t * 1.6 + this.x * 0.05) * 0.09 + Math.sin(this.t * 2.7 + this.z * 0.07 + 1) * 0.05) * (1 - 0.6 * skim);
    this.y = SEA_Y - c.draft * (1 - 0.45 * skim) + wave;
    const pT = -0.11 * hump - 0.02 * skim + Math.sin(this.t * 1.3) * 0.02 * (1 - skim) - clamp(F / c.thrust, -1, 1) * 0.02, rT = -this.w * sp * 0.012 * (c.pose === 'bike' ? 3.2 : 1) + Math.sin(this.t * 1.1 + 0.5) * 0.025 * (1 - skim);          // (heeled into the turn: w < 0 is a turn to the right, a positive roll)
    this.pitch += (pT - this.pitch) * Math.min(1, dt * 3); this.roll += (clamp(rT, -0.45, 0.45) - this.roll) * Math.min(1, dt * 3);
    this.pose();
  }
  hud() { return Math.round(this.speed * 3.6) + ' KM/H'; }
}

// The helicopter. The rotor spins up when you get in (and only lifts when it is up to speed); Space climbs and Z (or Ctrl) descends; forward and back
// tip the nose and drive it that way; left and right turn it; Shift is faster. It settles on whatever is under it: the ground, a road, a roof (the
// buildings' tops are known from their colliders), and it cannot fly through a building: it stops against it (and a hard knock shakes it).
export class Heli extends Craft {
  constructor() {
    super('heli'); const T = templates.heli, cfg = this.cfg;
    const M = craftMesh(T, { part: p => p.names.some(n => cfg.rotorPart.test(n)) ? 'rotor' : p.names.some(n => cfg.tailPart.test(n)) ? 'tailRotor' : null });
    this.mesh = M.root; this.mesh.name = 'heli'; this.len = T.size.z; this.rotor = M.rotor || null; this.tailRotor = M.tailRotor || null; this.R = M.rotorBox ? (M.rotorBox.max.x - M.rotorBox.min.x) / 2 : 9;
    contactShadow(T.size.x * 0.7, T.size.z * 0.8, this.mesh);
    this.ud = { body: M.body, cockpit: { eye: new THREE.Vector3(0.5, 2.6, T.size.z * 0.38), seat: null, update() {} }, craft: this, noRider: true };
    this.mesh.userData = this.ud;
    this.spool = 0; this.onGround = true; this.alt = 0; this.sight = 420; this.cam = { dist: 26, height: 8, look: 2.5 }; this.ang = 0; this.tAng = 0;
  }
  // What it would rest on at (x, z): the ground, or the top of a building under its middle.
  floor(x, z) {
    let y = Math.max(groundAt(x, z).y, heightAt(x, z) < SEA_Y ? SEA_Y : -1e9); const cs = queryColliders(x, z, 2, this._q || (this._q = []));
    for (const c of cs) if (c.bld && (c.type === 'box' ? x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 : Math.hypot(x - c.x, z - c.z) < c.r)) y = Math.max(y, CURB + c.bld.h + (c.bld.base || 0));          // (base: the building's lift on a hill)
    return y;
  }
  // A building (taller than where it is flying) in the way of its body.
  blocked(x, z, y) {
    const cs = queryColliders(x, z, 5, this._q || (this._q = []));
    for (const c of cs) {
      if (!c.bld) continue; const top = CURB + c.bld.h + (c.bld.base || 0); if (y > top - 0.5) continue;
      if (c.type === 'box') { const dx = Math.max(c.x0 - x, 0, x - c.x1), dz = Math.max(c.z0 - z, 0, z - c.z1); if (Math.hypot(dx, dz) < 3.5) return true; }
      else if (Math.hypot(x - c.x, z - c.z) < c.r + 3.5) return true;
    }
    return false;
  }
  canLeave() { return !this.onGround ? 'LAND FIRST' : this.speed > 2 ? 'SLOW DOWN FIRST' : null; }
  landing() { const a = this.h + Math.PI / 2, x = this.x + Math.sin(a) * 3.2, z = this.z + Math.cos(a) * 3.2; return { x, z, y: this.floor(x, z), h: this.h }; }
  update(dt, f = {}) {
    const on = f.engine !== false; this.spool = clamp(this.spool + (on ? dt / 3 : -dt / 5), 0, 1);
    const ready = this.spool > 0.85, fast = f.sprint ? 1.45 : 1, fwd = clamp(f.my || 0, -1, 1), turn = clamp(f.mx || 0, -1, 1);
    const up = (f.jump ? 1 : 0) - (f.crouch ? 1 : 0);
    // Vertical: climb or descend at a rate (lift needs the rotor up to speed); with nothing pressed it holds its height.
    const settle = up === 0 && this.alt < 2.5 ? -2.2 : 0;                    // (with nothing pressed just over the ground, it settles onto it)
    const vyT = ready ? (up ? up * (up > 0 ? 7.5 : 6) : settle) : -9.8 * (1 - this.spool) * (this.onGround ? 0 : 1);
    this.vy += (vyT - this.vy) * Math.min(1, dt * (ready ? 2.2 : 1));
    // Horizontal: the nose tips and it goes that way, up to ~180 km/h (~260 with Shift); it turns on the spot or banks round in flight.
    const fx = Math.sin(this.h), fz = Math.cos(this.h), air = !this.onGround && ready;
    let v = this.vx * fx + this.vz * fz, vl = this.vx * fz - this.vz * fx;
    const vT = air ? fwd * (fwd > 0 ? 50 : 15) * fast : 0, acc = vT - v;
    v += clamp(acc, -12, 9) * dt; vl *= Math.exp(-dt * 1.4);
    const wT = (ready ? -turn * (this.onGround ? 0.6 : 1.1) : 0); this.w += (wT - this.w) * Math.min(1, dt * 2.5);
    this.h = wrapAngle(this.h + this.w * dt);
    const nfx = Math.sin(this.h), nfz = Math.cos(this.h); let vx = nfx * v + nfz * vl, vz = nfz * v - nfx * vl;
    // Move, then the buildings and the floor.
    let nx = this.x + vx * dt, nz = this.z + vz * dt, ny = this.y + this.vy * dt;
    if (this.blocked(nx, nz, ny)) { const hit = Math.hypot(vx, vz); this.bump = hit; nx = this.x; nz = this.z; vx *= -0.3; vz *= -0.3; v = vx * nfx + vz * nfz; }
    nx = clamp(nx, WORLD.x0 + 50, WORLD.x1 - 50); nz = clamp(nz, WORLD.z0 + 50, WORLD.z1 - 50); ny = Math.min(ny, 650);
    const fl = this.floor(nx, nz);
    if (ny <= fl) { if (this.vy < -7) this.bump = -this.vy; ny = fl; this.vy = Math.max(0, this.vy); this.onGround = true; vx *= Math.exp(-dt * 6); vz *= Math.exp(-dt * 6); }
    else if (ny > fl + 0.15) this.onGround = false;
    this.x = nx; this.z = nz; this.y = ny; this.vx = vx; this.vz = vz; this.speed = Math.hypot(vx, vz); this.alt = ny - fl;
    // How it hangs: the nose down as it speeds up (up as it slows), banked into a turn; the rotor blur with the spool.
    const pT = air ? clamp(acc / 30, -0.25, 0.3) + clamp(v / 300, -0.05, 0.12) : 0, rT = air ? clamp(-this.w * Math.max(4, Math.abs(v)) / 55, -0.4, 0.4) : 0;
    this.pitch += (pT - this.pitch) * Math.min(1, dt * 2); this.roll += (rT - this.roll) * Math.min(1, dt * 2.4);
    this.t += dt; if (air) this.y += Math.sin(this.t * 1.7) * 0.004;
    this.ang += dt * this.spool * 28; this.tAng += dt * this.spool * 60;
    if (this.rotor) this.rotor.rotation.y = this.ang; if (this.tailRotor) this.tailRotor.rotation.x = this.tAng;
    this.pose();
  }
  hud() { return Math.round(this.speed * 3.6) + ' KM/H · ' + Math.round(this.alt) + ' M UP' + (this.spool < 0.85 ? ' · ROTOR ' + Math.round(this.spool * 100) + '%' : ''); }
}

// ---- Where the rides are kept -----------------------------------------------------------------------------------------------------------------
// spots: [{ kind, x, z, h }]. The bike stands on the road; the boats float; the helicopter sits on its pad. Each is built when its model has loaded
// and shown only within a few hundred metres.
export class Rides {
  constructor(scene) { this.scene = scene; this.list = []; this.owned = new Set(); this.roofT = 0; }
  init(spots) {
    for (const s of spots) this.list.push({ ...s, home: { ...s }, mesh: null, craft: null, taken: false });
    return preloadRides([...new Set(spots.map(s => s.kind))]).then(() => { for (const r of this.list) this.build(r); });
  }
  build(r) {
    if (r.mesh || !rideReady(r.kind)) return;
    if (r.kind === 'bike') { r.mesh = makeBike(); if (!r.mesh) return; r.mesh.name = 'bike'; r.mesh.position.set(r.x, groundAt(r.x, r.z).y, r.z); r.mesh.rotation.y = r.h; this.scene.add(r.mesh); return; }
    r.craft = r.kind === 'heli' ? new Heli() : new Boat(r.kind); r.mesh = r.craft.mesh;
    r.craft.place(r.x, r.z, r.h, r.kind === 'heli' ? r.craft.floor(r.x, r.z) : undefined); if (r.kind === 'heli') r.craft.spool = 0;
    this.scene.add(r.mesh);
  }
  // The ride you could take from where you stand: { ride, prompt } or null.
  near(w) {
    let best = null, bd = 1e9;
    for (const r of this.list) {
      if (r.taken || !r.mesh || !r.mesh.visible) continue;
      const x = r.craft ? r.craft.x : r.x, z = r.craft ? r.craft.z : r.z, d = Math.hypot(w.x - x, w.z - z), reach = r.kind === 'bike' ? 2.2 : r.kind === 'heli' ? 8 : 16;
      if (r.craft && r.craft.isCraft && r.kind !== 'heli' && !(groundAt(w.x, w.z).y > SEA_Y + 0.6)) continue;
      if (r.kind === 'heli' && r.craft && Math.abs(w.y - r.craft.y) > 3) continue;                      // (a helicopter on a roof is not reached from the street under it)
      if (d < reach && d < bd) { bd = d; best = { ride: r, prompt: this.promptOf(r), buy: this.priceOf(r), d: r.kind === 'bike' ? d : Math.max(0.5, d * 0.2) }; }
    }
    return best;
  }
  // A helicopter on a roof: yours (bought), or someone else's (to steal, or to buy: its price, or 0 when it is not for sale).
  promptOf(r) { return r.roof ? (this.owned.has(r.roof) ? 'FLY YOUR HELICOPTER' : 'STEAL THE HELICOPTER') : KINDS[r.kind].prompt; }
  priceOf(r) { if (!r.roof || this.owned.has(r.roof)) return 0; const R = ROOFS.get(r.roof); return R ? R.price : 0; }
  // The helicopters on the roofs with a helipad (roofs.js): the nearest few within 650 m stand on their pads; one far away that nobody is flying goes
  // (and is back on its pad when you come near again, wherever it was left).
  roofs(F, active) {
    if (!rideReady('heli')) return;
    let n = 0; for (const r of this.list) if (r.roof) n++;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i]; if (!r.roof || !r.craft || r.craft === active) continue;
      if (Math.hypot(F.x - r.craft.x, F.z - r.craft.z) > 900) { this.scene.remove(r.mesh); this.list.splice(i, 1); n--; const R = ROOFS.get(r.roof); if (R && R.ride === r) R.ride = null; }
    }
    const near = []; for (const R of ROOFS.values()) { if (R.ride) continue; const d = Math.hypot(F.x - R.pad.x, F.z - R.pad.z); if (d < 650) near.push([d, R]); }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, R] of near) {
      if (n >= 8) break;
      const r = { kind: 'heli', x: R.pad.x, z: R.pad.z, h: R.pad.h, roof: R.id, mesh: null, craft: null, taken: false };
      r.home = { ...r }; this.build(r); if (!r.craft) continue;
      if (r.craft.y < R.y - 1) { this.scene.remove(r.mesh); r.craft = null; r.mesh = null; continue; }                            // (the roof is not built yet: not there)
      this.list.push(r); R.ride = r; n++;
    }
  }
  update(dt, F, active) {
    if ((this.roofT -= dt) <= 0) { this.roofT = 1; this.roofs(F, active); }
    for (const r of this.list) {
      if (!r.mesh) continue; const x = r.craft ? r.craft.x : r.x, z = r.craft ? r.craft.z : r.z, d = Math.hypot(F.x - x, F.z - z);
      if (r.taken && r.kind === 'bike') continue;
      r.mesh.visible = d < 900 || (r.craft && r.craft === active);
      if (r.craft && r.craft !== active && r.mesh.visible) r.craft.update(dt, { engine: false });           // (the boats bob; a helicopter left sits, its rotor running down)
    }
  }
  // The bike back on its stand (after an arrest, or when your own car is chosen again).
  homeBike() { const r = this.list.find(r => r.kind === 'bike'); if (!r || !r.mesh) return null; Object.assign(r, r.home); r.taken = false; r.mesh.visible = true; r.mesh.position.set(r.x, groundAt(r.x, r.z).y, r.z); r.mesh.rotation.set(0, r.h, 0); r.mesh.userData.body.rotation.set(0, 0, 0); if (!r.mesh.parent) this.scene.add(r.mesh); return r; }
}
