// Real models of the dealership's cars (marques.js uses them when they have loaded; until then, or if one cannot be loaded, its own lofted body).
// Each is a detailed model of a real car, made by an artist and published under a Creative Commons licence (assets/CREDITS.md says who made each and
// under which licence); the game shows them under its own made-up names, with the makers' badges taken off.
//
// The files all differ (their axes, their scale, how their parts are named, whether a wheel is one part or an axle is), so each is put into the game's
// terms the same way: the long axis along z with the nose at +z (the end where the parts named `front` are), scaled to the real car's length, the tyres'
// bottoms on the ground; the wheel parts cut into the four corners (by where each triangle is) and centred on their hubs, to steer and to roll; the
// paint swapped for the game's clear-coated paint in the colour you choose; the badges hidden; the rest merged into one mesh a material. Where the wheels
// turn out to be (the axles, the track, the tyres' size) is measured and handed to the physics (marque-specs.js marqueSpec), so the car drives on the
// wheels you see.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { attachSSR } from './ssr.js';
import { paintFlakes } from './paintfx.js';
import { glowTex, carShadowTex } from './textures.js';
import { MPAINTS } from './marque-specs.js';
import { buildCockpit } from './cockpit.js';

// Per model: the file; the real car's length (m); which parts are at the front (names, matched against the part and its parents, and its material);
// which are the wheels (and of those, which do not roll: the calipers); which to hide (badges, the ground the model stood on, number plates); which
// material is the paint (null: the paint is in a texture with everything else, and keeps its own colour); which are the tail lamps and the headlamps;
// the steering wheel (and how far above and behind it the driver's eyes are, if not 0.3 and 0.56 m); where the driver's eyes are if there is no steering
// wheel to go by ([x, height over the sills, metres behind the front axle]); a badge modelled on the steering wheel's hub (hubBadge: the parts of that
// material within r metres of the wheel's middle are cut away); for a model with no inside: the windscreen (or the windows, the one furthest forward being the windscreen; made see-through when you drive it) and
// the dark box standing in for the cabin, which give way to the game's own cockpit (cockpit.js); behind an upright windscreen that cockpit is shortened
// (cockpit.sz) and its sloping pillar trims left out.
export const SCANS = {
  r9turbo: { file: 'porsche911.glb', len: 4.52, front: /bumper_front/i, wheel: /^Cylinder\.?00[01]/, hide: /logo|license|^Plane(\.00[0-9])?$|^Plane_0$|^Material$/i, paint: /^paint$/i, tail: /tex_shiny|lights/i, head: /lights|glass/i, eye: [0.37, 1.07, 1.55], screen: /^windshield/, cabin: /^Cube00[12]/ },
  furia: { file: 'revuelto.glb', len: 4.95, front: /daylight|headlight/i, wheel: /^Wheel_/i, still: /caliper/i, hide: /logo/i, paint: /^body$/i, tail: /tail_light|taillight/i, head: /headlight_light|daylight_light|^light$/i, steer: /^Steering_wheel_Steering/, eye: [0.38, 0.98, 1.75] },
  vitesse: { file: 'chiron.glb', len: 4.54, front: /wheel-f|brake_rotor_f/i, wheel: /^wheel-|^brake_rotor/i, still: /caliper/i, hide: /logo/i, paint: /^body$/i, tail: /tail|rear.?light|brake.?light|back.?light/i, head: /head.?light|front.?light|daylight/i, steer: /^Steering-wheel$/, hubBadge: { mat: /^Silver$/, r: 0.065 }, eyeFromWheel: [0.28, 0.74], eye: [0.38, 1.0, 1.85] },
  sovereign: { file: 'cullinan.glb', len: 5.34, front: /wheel_f/i, wheel: /^wheel_/i, hide: /logo|statue/i, paint: null, fixedPaint: 'ruby', steer: /^steer$/, eye: [0.4, 1.38, 1.9] },
  bergwagen: { file: 'g63.glb', len: 4.87, front: /front/i, wheel: /tyre|wheel rim|inner rim|rim_black/i, hide: /logo/i, paint: /jeep__paint/i, tail: /red_emission/i, head: /front.*light|headlight/i, eye: [0.4, 1.55, 1.75], glass: /^window_\d|^Plane002/, screen: /^Plane002/, cockpit: { sz: 0.72, pillars: false } },
};
SCANS.r9rs = { ...SCANS.r9turbo, rs: true };

const DIR = new URL('../assets/cars/', import.meta.url).href, DRACO = new URL('../assets/draco/', import.meta.url).href, templates = {}, loading = {};          // (from this file, so any page can load them)
let draco = null;
const pathOf = o => { const n = []; for (let p = o; p; p = p.parent) if (p.name) n.push(p.name); return n; };
const matches = (re, o, mat) => !!re && (pathOf(o).some(n => re.test(n)) || (mat && re.test(mat.name || '')));

// Load (once) and take apart into the game's terms. Returns the template every car of this model is built from.
export function loadScan(id) {
  const cfg = SCANS[id]; if (!cfg) return Promise.reject(new Error('no model for ' + id));
  if (templates[cfg.file]) return Promise.resolve(templates[cfg.file]);
  if (loading[cfg.file]) return loading[cfg.file];
  if (!draco) { draco = new DRACOLoader(); draco.setDecoderPath(DRACO); }
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  return (loading[cfg.file] = loader.loadAsync(DIR + cfg.file).then(g => (templates[cfg.file] = takeApart(g.scene, cfg))));
}
export const scanReady = id => !!(SCANS[id] && templates[SCANS[id].file]);
export const scanDims = id => (scanReady(id) ? templates[SCANS[id].file].dims : null);
export function preloadScans(ids = Object.keys(SCANS)) { return Promise.allSettled(ids.map(id => loadScan(id).catch(e => { console.warn('car model ' + id + ' did not load', e); throw e; }))); }

function takeApart(scene, cfg) {
  scene.updateMatrixWorld(true);
  scene.traverse(o => { for (const m of [].concat(o.material || [])) { m.userData.model = true; for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[k]) m[k].userData.model = true; } });       // (shared by every car of this model: never thrown away)
  const parts = [];
  scene.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    for (const [i, mat] of [].concat(o.material).entries()) {
      if (matches(cfg.hide, o, mat)) continue;
      let g = o.geometry; if (Array.isArray(o.material)) { const gr = g.groups[i]; if (!gr) continue; g = g.clone(); g.setIndex(g.index ? Array.from(g.index.array).slice(gr.start, gr.start + gr.count) : null); }
      g = g.index ? g.toNonIndexed() : g.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(o.matrixWorld);
      parts.push({ o, mat, g, wheel: matches(cfg.wheel, o, mat), still: matches(cfg.still, o, mat), front: matches(cfg.front, o, mat), steer: matches(cfg.steer, o, mat), tail: matches(cfg.tail, o, mat), head: matches(cfg.head, o, mat), screen: matches(cfg.screen, o, mat), cabin: matches(cfg.cabin, o, mat), glass: matches(cfg.glass, o, mat) });
    }
  });
  // Axes: the long horizontal axis becomes z, the front (the parts called front) at +z; scaled to the real length; centred; the tyres on the ground.
  const box = g => new THREE.Box3().setFromBufferAttribute(g.attributes.position), all = new THREE.Box3(); for (const p of parts) all.union(box(p.g));
  const sz = all.getSize(new THREE.Vector3()), M = new THREE.Matrix4();
  if (sz.x > sz.z) M.makeRotationY(-Math.PI / 2);
  const fr = new THREE.Box3(); for (const p of parts) if (p.front) fr.union(box(p.g.clone().applyMatrix4(M)));
  const al = all.clone().applyMatrix4(M); if (!fr.isEmpty() && (fr.min.z + fr.max.z) / 2 < (al.min.z + al.max.z) / 2) M.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
  const b1 = all.clone().applyMatrix4(M), s = cfg.len / (b1.max.z - b1.min.z); M.premultiply(new THREE.Matrix4().makeScale(s, s, s));
  for (const p of parts) p.g.applyMatrix4(M);
  const b2 = new THREE.Box3(); for (const p of parts) b2.union(box(p.g)); const wb = new THREE.Box3(); for (const p of parts) if (p.wheel) wb.union(box(p.g));
  const T = new THREE.Matrix4().makeTranslation(-(b2.min.x + b2.max.x) / 2, -(wb.isEmpty() ? b2.min.y : wb.min.y), -(b2.min.z + b2.max.z) / 2);
  for (const p of parts) p.g.applyMatrix4(T);
  // The wheels: every wheel triangle goes to the corner it is in.
  const corners = [0, 1, 2, 3].map(i => ({ front: i < 2, side: i % 2 ? -1 : 1, spin: new Map(), still: new Map(), box: new THREE.Box3(), tyre: new THREE.Box3() }));
  const TYRE = /tire|tyre|rubber/i;
  const cornerOf = (x, z) => (z > 0 ? 0 : 2) + (x > 0 ? 0 : 1);
  for (const p of parts) {
    if (!p.wheel) continue;
    const a = p.g.attributes, n = a.position.count, by = [[], [], [], []];
    for (let t = 0; t < n; t += 3) { const cx = (a.position.getX(t) + a.position.getX(t + 1) + a.position.getX(t + 2)) / 3, cz = (a.position.getZ(t) + a.position.getZ(t + 1) + a.position.getZ(t + 2)) / 3; by[cornerOf(cx, cz)].push(t); }
    by.forEach((tris, c) => { if (!tris.length) return; const g = pick(p.g, tris), bb = box(g); corners[c].box.union(bb); if (TYRE.test(p.mat.name || '')) corners[c].tyre.union(bb); add(p.still ? corners[c].still : corners[c].spin, p.mat, g); });
  }
  const body = new Map(), steer = new Map(), stParts = [], cabin = new Map(), glass = new Map(), panes = [], lamps = { tail: [], head: [] }, stBox = new THREE.Box3(), scBox = new THREE.Box3();
  for (const p of parts) {
    if (p.wheel) continue;
    if (p.steer) { stParts.push(p); stBox.union(box(p.g)); continue; }
    if (p.cabin) { add(cabin, p.mat, p.g); continue; }
    if (p.screen) scBox.union(box(p.g));
    if (p.glass) { add(glass, p.mat, p.g); panes.push(box(p.g)); continue; }
    add(body, p.mat, p.g);
    const bb = box(p.g), c = bb.getCenter(new THREE.Vector3());
    if (p.tail && c.z < 0) lamps.tail.push(bb); if (p.head && c.z > 0) lamps.head.push(bb);
  }
  // Each corner's hub: the middle of its tyre (of all its parts if no tyre is named: the brakes inside would pull it inwards); the radius: half its height. The parts are moved to be about the hub.
  const hubs = corners.map(c => { const B = c.tyre.isEmpty() ? c.box : c.tyre, ctr = B.isEmpty() ? new THREE.Vector3() : B.getCenter(new THREE.Vector3()), r = B.isEmpty() ? 0.35 : (B.max.y - B.min.y) / 2; for (const m of [c.spin, c.still]) for (const list of m.values()) for (const g of list) g.translate(-ctr.x, -ctr.y, -ctr.z); return { ctr, r }; });
  const zf = (hubs[0].ctr.z + hubs[1].ctr.z) / 2, zr = (hubs[2].ctr.z + hubs[3].ctr.z) / 2, track = (Math.abs(hubs[0].ctr.x - hubs[1].ctr.x) + Math.abs(hubs[2].ctr.x - hubs[3].ctr.x)) / 2, wr = hubs.reduce((a, h) => a + h.r, 0) / 4;
  const bf = new THREE.Box3(); for (const g of [...body.values()].flat()) bf.union(box(g));
  const merged = m => { const out = new Map(); for (const [mat, list] of m) { const g = mergeSafe(list); if (g) out.set(mat, mergeVertices(g, 1e-5)); } return out; };      // (indexed again: a third of the memory, and each corner shaded once)
  const steerAt = stBox.isEmpty() ? null : stBox.getCenter(new THREE.Vector3());
  for (const p of stParts) {
    let g = p.g;
    if (cfg.hubBadge && cfg.hubBadge.mat.test(p.mat.name || '')) {          // (a maker's badge modelled on the hub: the parts of that material at its middle go)
      const a = g.attributes.position, keep = [], r2 = cfg.hubBadge.r ** 2;
      for (let t = 0; t < a.count; t += 3) { const cx = (a.getX(t) + a.getX(t + 1) + a.getX(t + 2)) / 3 - steerAt.x, cy = (a.getY(t) + a.getY(t + 1) + a.getY(t + 2)) / 3 - steerAt.y, cz = (a.getZ(t) + a.getZ(t + 1) + a.getZ(t + 2)) / 3 - steerAt.z; if (cx * cx + cy * cy + cz * cz > r2) keep.push(t); }
      if (!keep.length) continue; g = pick(g, keep);
    }
    add(steer, p.mat, g.translate(-steerAt.x, -steerAt.y, -steerAt.z));      // (about its own middle, to turn)
  }
  if (scBox.isEmpty() && panes.length) scBox.copy(panes.reduce((a, b) => (b.getCenter(new THREE.Vector3()).z > a.getCenter(new THREE.Vector3()).z ? b : a)));      // (the windscreen: the pane furthest forward)
  const T2 = { cfg, body: merged(body), steer: merged(steer), cabin: merged(cabin), glass: merged(glass), screen: scBox, steerAt, steerBox: stBox,
    corners: corners.map((c, i) => ({ front: c.front, side: c.side, hub: hubs[i].ctr, r: hubs[i].r, spin: merged(c.spin), still: merged(c.still) })),
    lamps, len: cfg.len, zf: bf.max.z, zr: bf.min.z, top: bf.max.y, width: bf.max.x - bf.min.x,
    dims: { wzf: +zf.toFixed(3), wzr: +zr.toFixed(3), track: +track.toFixed(3), wheelR: +wr.toFixed(3), len: cfg.len, width: +(bf.max.x - bf.min.x).toFixed(3) } };
  // For a car on show (it never rolls): all four wheels merged, one mesh a material.
  const st = new Map(); T2.corners.forEach(c => { for (const m of [c.spin, c.still]) for (const [mat, g] of m) add(st, mat, g.clone().translate(c.hub.x, c.hub.y, c.hub.z)); }); T2.wheelsStill = merged(st);
  return T2;
}
function add(map, mat, g) { let a = map.get(mat); if (!a) map.set(mat, a = []); a.push(g); }
function pick(g, tris) {
  const out = new THREE.BufferGeometry();
  for (const k of Object.keys(g.attributes)) { const a = g.attributes[k], n = a.itemSize, arr = new Float32Array(tris.length * 3 * n); tris.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < n; c++) arr[(i * 3 + v) * n + c] = a.array[(t + v) * n + c]; }); out.setAttribute(k, new THREE.BufferAttribute(arr, n)); }
  return out;
}
// Merge geometries that may not all have texture coordinates (those without get zeros).
function mergeSafe(list) {
  const uv = list.some(g => g.attributes.uv);
  for (const g of list) { if (uv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!uv && g.attributes.uv) g.deleteAttribute('uv'); }
  return mergeGeometries(list, false);
}

// ---- A car built from a template ------------------------------------------------------------------------------------------------------------------
function paintFrom(orig, key) {
  const p = MPAINTS[key] || MPAINTS.silver;
  const m = attachSSR(new THREE.MeshPhysicalMaterial({ color: p.color, metalness: p.metal, roughness: p.rough, clearcoat: p.matte ? 0.1 : 1, clearcoatRoughness: p.matte ? 0.6 : 0.03, envMapIntensity: p.matte ? 0.7 : 1.15, normalMap: orig.normalMap || null }), { range: 70, rough: 0.5, view: 120 });
  if (!p.matte) paintFlakes(m, p.metal > 0.3 ? 0.35 : 0.15);
  return m;
}
// The tail lamps' materials, brightened together under braking (main.js sets emissiveIntensity: 3.2 at rest, 9 braking).
function tailProxy(mats) {
  const base = mats.map(m => { if (!m.emissive || m.emissive.getHex() === 0) { m.emissive = new THREE.Color(0xff2208); m.emissiveIntensity = 0.6; } return m.emissiveIntensity || 1; });
  let v = 3.2; return { get emissiveIntensity() { return v; }, set emissiveIntensity(x) { v = x; mats.forEach((m, i) => { m.emissiveIntensity = base[i] * (x / 3.2); }); } };
}
const _glow = { t: null };
// Tinted glass to see the cockpit through, for a model whose windows are solid (shared, never thrown away).
let _glass = null;
const seeThrough = () => _glass || (_glass = Object.assign(new THREE.MeshStandardMaterial({ color: 0x0b0e12, metalness: 0.3, roughness: 0.04, transparent: true, opacity: 0.32, depthWrite: false }), { userData: { model: true } }));
export function makeScanCar(id, paintKey, { display = false, rs = false } = {}) {
  const cfg = SCANS[id], T = templates[cfg.file]; if (!T) return null;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const own = new Map(); let paint = null; const tails = [];
  // Materials: the paint is this car's own; the tail lamps' too (they brighten); the rest are the model's, shared by every car of it.
  const matFor = orig => {
    if (own.has(orig)) return own.get(orig);
    let m = orig;
    if (cfg.paint && cfg.paint.test(orig.name || '')) { m = paint = paint || paintFrom(orig, paintKey); }
    else if (T.tailMats && T.tailMats.has(orig)) { m = orig.clone(); m.userData = {}; tails.push(m); }
    own.set(orig, m); return m;
  };
  if (!T.tailMats) { T.tailMats = new Set(); for (const [mat] of T.body) if (cfg.tail && cfg.tail.test(mat.name || '')) T.tailMats.add(mat); }
  const mesh = (geo, mat, parent) => { const m = new THREE.Mesh(geo, matFor(mat)); m.castShadow = !mat.transparent; m.receiveShadow = !mat.transparent; if (mat.transparent) m.renderOrder = 3; parent.add(m); return m; };
  for (const [mat, g] of T.body) mesh(g, mat, body);
  // The steering wheel turns about the column (the thinnest direction of it).
  let steerBase = null, steerAxis = new THREE.Vector3(0, 0, 1);
  if (T.steer.size && T.steerAt) {
    steerBase = new THREE.Group(); steerBase.position.copy(T.steerAt); body.add(steerBase);
    for (const [mat, g] of T.steer) mesh(g, mat, steerBase);
    const s = T.steerBox.getSize(new THREE.Vector3()), mn = Math.min(s.x, s.y, s.z); steerAxis = mn === s.x ? new THREE.Vector3(1, 0, 0) : mn === s.y ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  }
  // Wheels.
  const wheels = [];
  if (display) for (const [mat, g] of T.wheelsStill) mesh(g, mat, root);
  else for (const c of T.corners) {
    const steer = new THREE.Group(); steer.position.copy(c.hub); root.add(steer); const spin = new THREE.Group(); steer.add(spin);
    for (const [mat, g] of c.spin) mesh(g, mat, spin); for (const [mat, g] of c.still) mesh(g, mat, steer);
    wheels.push({ steer, spin, front: c.front, side: c.side, baseY: c.hub.y });
  }
  // The RS: a swan-neck wing standing over the tail.
  if (rs || cfg.rs) {
    // (on two struts from the engine lid, the wing's top a little under the roof's)
    const carbon = new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.28, metalness: 0.55 }), lid = T.top * 0.75, wy = T.top * 0.93, z = T.zr + 0.36;
    const part = (geo, x, y, zz, rx = 0) => { const m = new THREE.Mesh(geo, carbon); m.position.set(x, y, zz); m.rotation.x = rx; m.castShadow = true; m.userData.own = true; body.add(m); };
    part(new THREE.BoxGeometry(1.7, 0.035, 0.36), 0, wy, z, 0.1);
    for (const s of [-1, 1]) { part(new THREE.BoxGeometry(0.02, 0.16, 0.42), s * 0.86, wy - 0.03, z); part(new THREE.BoxGeometry(0.03, wy - lid, 0.07), s * 0.3, (wy + lid) / 2, z + 0.12, -0.15); }
  }
  // Glows on the lamps, and a soft shadow under the car.
  const glow = _glow.t || (_glow.t = glowTex()), tailGlow = [], headGlow = [];
  const at = (list, fallback) => { if (!list.length) return fallback; const b = new THREE.Box3(); for (const x of list) b.union(x); const c = b.getCenter(new THREE.Vector3()); return [Math.max(0.35, b.max.x * 0.8), c.y, c.z]; };
  const tp = at(T.lamps.tail, [0.62, 0.85, T.zr + 0.05]), hp = at(T.lamps.head, [0.65, 0.65, T.zf - 0.1]);
  for (const s of [-1, 1]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff2a10, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); sp.position.set(s * tp[0], tp[1], tp[2] - 0.12); sp.scale.set(0.8, 0.45, 1); body.add(sp); tailGlow.push(sp);
    const hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xe6eeff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })); hs.position.set(s * hp[0], hp[1], hp[2] + 0.1); hs.scale.set(0.7, 0.4, 1); body.add(hs); headGlow.push(hs);
  }
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x5aa8ff, transparent: true, opacity: 0, depthWrite: false })); flame.visible = false; body.add(flame);
  const cs = new THREE.Mesh(new THREE.PlaneGeometry(T.width + 0.7, T.len + 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: carShadowTex(), transparent: true, depthWrite: false })); cs.position.y = 0.02; cs.renderOrder = 2; cs.name = 'contact'; root.add(cs);
  // The driver: eyes behind the steering wheel (or where the model's seat is), hips under them, hands on the wheel.
  const D = T.dims; let cockpit;
  for (const [mat, g] of T.glass) mesh(g, display ? mat : seeThrough(), body);
  if (!display && !T.screen.isEmpty() && (T.cabin.size || T.glass.size)) {
    // A model with no inside: the game's cockpit, its dashboard against the foot of the windscreen, narrowed to the cabin (as marques.js does for its own bodies).
    const cp = cockpit = buildCockpit(body, new THREE.BufferGeometry(), 'modern'), g = cp.group; g.name = 'cockpit';
    const inner = g.children.find(o => Array.isArray(o.material)); if (inner) g.remove(inner);
    const C = cfg.cockpit || {}, S = T.screen, sx = Math.min(1, ((S.max.x - S.min.x) / 2 + 0.06) / 0.95), sz = C.sz || 1, oy = S.min.y - 0.03 - 0.845, oz = S.max.z - 0.96 * sz;
    if (C.pillars === false) for (const o of g.children.filter(o => o.name === 'pillar')) { g.remove(o); o.geometry.dispose(); }
    g.scale.set(sx, 1, sz); g.position.set(0, oy, oz); g.traverse(o => { if (o.isMesh) o.userData.own = true; });
    const at = v => v.set(v.x * sx, v.y + oy, v.z * sz + oz); at(cp.eye); at(cp.seat.hip);
  } else {
    for (const [mat, g] of T.cabin) mesh(g, mat, body);
    const [ey, ez] = cfg.eyeFromWheel || [0.3, 0.56], eye = T.steerAt ? new THREE.Vector3(T.steerAt.x, T.steerAt.y + ey, T.steerAt.z - ez) : new THREE.Vector3(cfg.eye[0], cfg.eye[1], D.wzf - cfg.eye[2]);
    const grips = [-1, 1].map(s => { const m = new THREE.Object3D(); if (steerBase) { m.position.set(s * 0.17, 0.04, 0); steerBase.add(m); } else { m.position.set(eye.x + s * 0.18, eye.y - 0.32, eye.z + 0.5); body.add(m); } return m; });
    cockpit = { eye, style: 'real', group: body, seat: { hip: eye.clone().add(new THREE.Vector3(0, -0.73, 0.09)), grips }, update(st) { if (steerBase) steerBase.quaternion.setFromAxisAngle(steerAxis, -st.wheelAngle); } };
  }
  const eye = cockpit.eye;
  const cgOff = -(D.wzr + (D.wzf - D.wzr) * (cfg.cgAt ?? 0.45));
  root.userData = {
    body, wheels, paint: paint || new THREE.MeshStandardMaterial(), paintKey, tail: tailProxy(tails), tailGlow, headGlow, flame, cockpit, marque: id, real: true, scan: cfg.file,
    dims: { ...D }, cgOff, beamZ: T.zf - 0.6, hoodCam: [0, eye.y + 0.06, eye.z + 0.75], bumperCam: [0, 0.5, T.zf + 0.12], muzzleZ: T.zf + 0.2, fixedPaint: !cfg.paint,
  };
  return root;
}
