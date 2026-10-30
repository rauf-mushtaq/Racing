// Bakes a glTF/GLB car (Draco-compressed or plain) into the game's own "SCM1" model file (see src/carasset.h).
//   cd native/tools && npm install && node bake-model.mjs ferrari|carconcept [--survey]
// Source models are downloaded to ./source (see CREDITS in ../assets). Output goes to ../assets/cars/.
// Every part is flattened to car space (x left, y up, z forward, metres, tyres on y = 0, front axle at z = 1.546 so the physics and
// the model agree), merged by material role, and written as the engine's 36-byte MeshVertex records. Wheels are kept apart (one set of
// tyre/rim/brake meshes per wheel, centred on the wheel) so the game can spin and steer them, and the steering wheel is its own part.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'source') + '/', OUT = path.join(HERE, '..', 'assets', 'cars') + '/';
const ROLE = { PAINT: 0, GLASS: 1, TRIM: 2, CHROME: 3, HEAD: 4, TAIL: 5, CARBON: 6, TIRE: 7, RIM: 8, BRAKE: 9, INTERIOR: 10, STEER: 11, SKIP: 99 };

const MODELS = {
  // Ferrari 458 Italia Spider, from the three.js examples (CC BY 4.0, vicent091036 on Sketchfab).
  ferrari: {
    file: 'ferrari.glb', out: 'ferrari.scm', wheelRe: /^wheel_/, steerRimNode: 'steering_leather', budget: { lights_red: 6000, brakes: 3000, chrome: 12000, plastic_gray: 8000, wheel: 5000, rim_rr: 2500, rim_rl: 2500, rim_fl: 2500, rim_fr: 2500, brake: 2200, metal: 4000 },
    classify(node, mat, hasWheel) {
      switch (node) {
        case 'body': return ROLE.PAINT;
        case 'glass': return ROLE.GLASS;
        case 'chrome': case 'metal': return ROLE.CHROME;
        case 'lights_red': case 'brakes': return ROLE.TAIL;          // 'brakes' outside a wheel is the rear light strip
        case 'lights': case 'leds': return ROLE.HEAD;
        case 'carbon fibre': case 'carbon_fibre_trim': return ROLE.CARBON;
        case 'steering_carbon': case 'steering_leather': case 'steering_centre': case 'steering_metal': case 'steering_trim': case 'steering_red_lights': return ROLE.STEER;
        case 'interior_light': case 'leather': case 'carpet': case 'interior_dark': case 'steering_column': return ROLE.INTERIOR;
        case 'tire': return ROLE.TIRE;
        case 'wheel': case 'rim_rr': case 'rim_rl': case 'rim_fl': case 'rim_fr': case 'centre': case 'nuts': return ROLE.RIM;
        case 'brake': return hasWheel ? ROLE.BRAKE : ROLE.TRIM;
      }
      return ROLE.TRIM;
    },
  },
  // Car concept by Eric Chadwick, Khronos Group / Darmstadt Graphics Group (CC BY 4.0), from glTF-Sample-Assets.
  carconcept: {
    file: 'CarConcept.glb', out: 'carconcept.scm', wheelRe: /^Wheel(Front|Rear)[LR]$/, wheelFromTyre: true, straightenWheels: true, steerRimRe: /^InteriorSteeringWheel/, budget: { BodyWindshieldWipers: 1500 },
    trafficSkip: /^(Interior|Engine|Axles|BodyUnderside|BodyHoodInterior|BodyHoodUnder|License|BodyDoor[LR]Handle|BodyWindshieldWipers)/,
    classify(node, mat, hasWheel) {
      if (/^InteriorSteering(Wheel|Emblem)/.test(node)) return ROLE.STEER;
      if (/^Paint 2/.test(mat)) return ROLE.CARBON;               // the secondary colour (roof, sills, grille) is glossy black trim
      if (/^Paint/.test(mat)) return ROLE.PAINT;
      if (mat === 'Glass') return ROLE.GLASS;
      if (mat === 'Headlight') return ROLE.HEAD;
      if (mat === 'Brakelight' || mat === 'Signallight') return ROLE.TAIL;
      if (mat === 'Tireside' || mat === 'Tiretread') return ROLE.TIRE;
      if (/^Rim/.test(mat)) return ROLE.RIM;
      if (mat === 'Disc' || mat === 'Brake') return hasWheel ? ROLE.BRAKE : ROLE.TRIM;
      if (mat === 'Mirror') return ROLE.CHROME;
      if (/^Interior|^Floormat|^Dashboard/.test(mat)) return ROLE.INTERIOR;
      if (/Interior/.test(node)) return ROLE.INTERIOR;
      return ROLE.TRIM;
    },
  },
};

const wheelMode = process.argv.includes('--wheel');
const name = process.argv[2], survey = process.argv.includes('--survey'), trafficIdx = process.argv.indexOf('--traffic'), trafficTris = trafficIdx > 0 ? parseInt(process.argv[trafficIdx + 1]) : 0, police = process.argv.includes('--police');
const M = MODELS[name]; if (!M) { console.error('usage: node bake-model.mjs ' + Object.keys(MODELS).join('|') + ' [--survey]'); process.exit(1); }
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.readBinary(fs.readFileSync(SRC + M.file));
const scene = doc.getRoot().listScenes()[0];

// ---- 1. every primitive in world space --------------------------------------------------------------------------------
const mulPoint = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const det3 = (m) => m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
function cofactor3(m) { // inverse transpose of the upper 3x3 up to a scale (normals are renormalised afterwards)
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  return [e * i - f * h, -(d * i - f * g), d * h - e * g, -(b * i - c * h), a * i - c * g, -(a * h - b * g), b * f - c * e, -(a * f - c * d), a * e - b * d];
}
const parts = [];
scene.traverse((node) => {
  const mesh = node.getMesh(); if (!mesh) return;
  const W = node.getWorldMatrix(), nm = cofactor3(W), flip = det3(W) < 0;
  let wheelNode = null; for (let p = node; p; p = p.getParentNode?.() ?? null) if (M.wheelRe.test(p.getName())) { wheelNode = p; break; }
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), idx = prim.getIndices(); if (!pos) continue;
    const mat = prim.getMaterial(), n = pos.getCount(), t = [0, 0, 0]; let v = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      pos.getElement(i, t); const p = mulPoint(W, t[0], t[1], t[2]); v[i * 6] = p[0]; v[i * 6 + 1] = p[1]; v[i * 6 + 2] = p[2];
      if (nor) { nor.getElement(i, t); const x = nm[0] * t[0] + nm[3] * t[1] + nm[6] * t[2], y = nm[1] * t[0] + nm[4] * t[1] + nm[7] * t[2], z = nm[2] * t[0] + nm[5] * t[1] + nm[8] * t[2], l = Math.hypot(x, y, z) || 1; v[i * 6 + 3] = x / l; v[i * 6 + 4] = y / l; v[i * 6 + 5] = z / l; } else v[i * 6 + 4] = 1;
    }
    let ind = idx ? Uint32Array.from(idx.getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
    // weld vertices that share position and normal (they differ only by texture coordinates, which the game does not use)
    { const map = new Map(), nv = [], out = new Uint32Array(ind.length), q = (x, k) => Math.round(x * k);
      for (let i = 0; i < ind.length; i++) { const o = ind[i], key = q(v[o * 6], 40000) + ',' + q(v[o * 6 + 1], 40000) + ',' + q(v[o * 6 + 2], 40000) + ',' + q(v[o * 6 + 3], 400) + ',' + q(v[o * 6 + 4], 400) + ',' + q(v[o * 6 + 5], 400); let r = map.get(key); if (r === undefined) { r = map.size; map.set(key, r); nv.push(v[o * 6], v[o * 6 + 1], v[o * 6 + 2], v[o * 6 + 3], v[o * 6 + 4], v[o * 6 + 5]); } out[i] = r; }
      v = Float32Array.from(nv); ind = out; }
    if (flip) for (let i = 0; i < ind.length; i += 3) { const s = ind[i + 1]; ind[i + 1] = ind[i + 2]; ind[i + 2] = s; }
    // Draco quantises normals coarsely, which shows as banding in shiny paint: rebuild smooth normals from the geometry (hard edges are kept:
    // only faces within about 40 degrees of the original normal are averaged in).
    { const key = (i) => Math.round(v[i * 6] * 10000) + ',' + Math.round(v[i * 6 + 1] * 10000) + ',' + Math.round(v[i * 6 + 2] * 10000), groups = new Map(), fns = new Float32Array(ind.length);
      for (let f = 0; f < ind.length; f += 3) { const a = ind[f] * 6, b = ind[f + 1] * 6, c = ind[f + 2] * 6; const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
        fns[f] = uy * wz - uz * wy; fns[f + 1] = uz * wx - ux * wz; fns[f + 2] = ux * wy - uy * wx;
        for (let k = 0; k < 3; k++) { const kk = key(ind[f + k]); let l = groups.get(kk); if (!l) groups.set(kk, l = []); l.push(f); } }
      const nv = Float32Array.from(v);
      for (let i = 0; i < n2(v); i++) { const l = groups.get(key(i)); if (!l) continue; const ox = v[i * 6 + 3], oy = v[i * 6 + 4], oz = v[i * 6 + 5]; let ax = 0, ay = 0, az = 0;
        for (const f of l) { const fl = Math.hypot(fns[f], fns[f + 1], fns[f + 2]) || 1; if ((fns[f] * ox + fns[f + 1] * oy + fns[f + 2] * oz) / fl > 0.75) { ax += fns[f]; ay += fns[f + 1]; az += fns[f + 2]; } }
        const al = Math.hypot(ax, ay, az); if (al > 1e-12) { nv[i * 6 + 3] = ax / al; nv[i * 6 + 4] = ay / al; nv[i * 6 + 5] = az / al; } }
      v = nv; }
    const em = mat ? mat.getEmissiveFactor() : [0, 0, 0], emS = mat?.getExtension?.('KHR_materials_emissive_strength')?.getEmissiveStrength?.() ?? 1;
    parts.push({ node: node.getName(), mat: mat ? mat.getName() : '', color: mat ? mat.getBaseColorFactor() : [0.5, 0.5, 0.5, 1], emissive: em, emissiveStrength: emS, wheelNode: wheelNode ? wheelNode.getName() : null, wheelPos: wheelNode ? wheelNode.getWorldTranslation() : null, v, ind });
  }
});
function n2(v) { return v.length / 6; }
const roleOf = (p) => M.classify(p.node, p.mat, !!p.wheelNode);

// ---- 2. orientation: the car must face +z; the tail lights tell us which way it faces -------------------------------------
const tailC = (() => { let s = [0, 0, 0], c = 0; for (const p of parts) if (roleOf(p) === ROLE.TAIL) for (let i = 0; i < p.v.length; i += 6) { s[0] += p.v[i]; s[1] += p.v[i + 1]; s[2] += p.v[i + 2]; c++; } return s.map((x) => x / Math.max(1, c)); })();
let flipZ = tailC[2] > 0;
if (M.forceFlip !== undefined) flipZ = M.forceFlip;
const T = (x, y, z) => (flipZ ? [-x, y, -z] : [x, y, z]);
for (const p of parts) {
  for (let i = 0; i < p.v.length; i += 6) { const q = T(p.v[i], p.v[i + 1], p.v[i + 2]), nn = T(p.v[i + 3], p.v[i + 4], p.v[i + 5]); p.v.set([q[0], q[1], q[2], nn[0], nn[1], nn[2]], i); }
  if (p.wheelPos) p.wheelPos = T(...p.wheelPos);
}

// ---- 3. wheels: centre, straighten the pose, slot (0 FL, 1 FR, 2 RL, 3 RR; x is the car's left) -----------------------------
const wheelNames = [...new Set(parts.filter((p) => p.wheelNode).map((p) => p.wheelNode))];
const bbox = (ps) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const p of ps) for (let i = 0; i < p.v.length; i += 6) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.v[i + k]); mx[k] = Math.max(mx[k], p.v[i + k]); } return [mn, mx]; };
const eigenLeast = (pts) => {                                   // direction of least spread of a point set
  const c = [0, 1, 2].map((k) => pts.reduce((s, q) => s + q[k], 0) / pts.length), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const q of pts) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += ((q[a] - c[a]) * (q[b] - c[b])) / pts.length;
  const mv = (X, v) => [0, 1, 2].map((a) => X[a][0] * v[0] + X[a][1] * v[1] + X[a][2] * v[2]), norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const power = (X, v0) => { let v = norm(v0); for (let i = 0; i < 100; i++) v = norm(mv(X, v)); return v; };
  const e1 = power(C, [1, 0.31, 0.17]), l1 = mv(C, e1).reduce((s, x, i) => s + x * e1[i], 0);
  const D = C.map((row, a) => row.map((x, b) => x - l1 * e1[a] * e1[b])), e2 = power(D, [0.13, 1, 0.21]);
  return { centre: c, axis: norm([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]) };
};
const wheels = wheelNames.map((n) => {
  const ps = parts.filter((p) => p.wheelNode === n), tyre = ps.filter((p) => roleOf(p) === ROLE.TIRE);
  let c = ps[0].wheelPos;
  if (M.wheelFromTyre) { const [mn, mx] = bbox(tyre); c = [0, 1, 2].map((k) => (mn[k] + mx[k]) / 2); }
  if (M.straightenWheels) {                                     // some models pose the wheels steered or spun: turn each one about the vertical so its axle lies along x
    const pts = []; for (const p of tyre) for (let i = 0; i < p.v.length; i += 6) pts.push([p.v[i], p.v[i + 1], p.v[i + 2]]);
    const { axis } = eigenLeast(pts), yaw = Math.atan2(axis[2], axis[0]);
    const turn = (ps_, a) => { const cs = Math.cos(a), sn = Math.sin(a), rot = (x, y, z) => [cs * x + sn * z, y, -sn * x + cs * z];   // about the vertical through the wheel centre
      for (const p of ps_) for (let i = 0; i < p.v.length; i += 6) { const q = rot(p.v[i] - c[0], p.v[i + 1] - c[1], p.v[i + 2] - c[2]), nn = rot(p.v[i + 3], p.v[i + 4], p.v[i + 5]); p.v.set([q[0] + c[0], q[1] + c[1], q[2] + c[2], nn[0], nn[1], nn[2]], i); } };
    turn(ps, yaw);                                               // the axle now lies along x
    const meanX = (list) => { let s = 0, k = 0; for (const p of list) for (let i = 0; i < p.v.length; i += 6) { s += p.v[i]; k++; } return s / Math.max(1, k); };
    const discs = ps.filter((p) => roleOf(p) === ROLE.BRAKE);
    if (discs.length && (meanX(discs) - meanX(tyre)) * Math.sign(c[0]) > 0) { turn(ps, Math.PI); console.log(`  ${n}: turned round (disc was outboard)`); }   // the brake disc belongs on the inside
    console.log(`  straightened ${n} by ${(yaw * 180 / Math.PI).toFixed(1)} deg`);
  }
  return { n, c, slot: (c[2] > 0 ? 0 : 2) + (c[0] > 0 ? 0 : 1) };
});
let tireR = 0; for (const p of parts) if (p.wheelNode && roleOf(p) === ROLE.TIRE) { const [mn, mx] = bbox([p]); tireR = Math.max(tireR, (mx[1] - mn[1]) / 2); }
const wheelY = wheels.reduce((s, w) => s + w.c[1], 0) / wheels.length, dy = tireR - wheelY;
const frontZ = wheels.filter((w) => w.c[2] > 0).reduce((s, w) => s + w.c[2], 0) / 2, dz = (M.frontAxleZ ?? 1.546) - frontZ;
// the lowest point of the tyres goes on y = 0
console.log(`model ${name}: flipZ=${flipZ} tyreR=${tireR.toFixed(3)} wheelY=${wheelY.toFixed(3)} dy=${dy.toFixed(3)} frontZ=${frontZ.toFixed(3)} dz=${dz.toFixed(3)}`);
for (const p of parts) for (let i = 0; i < p.v.length; i += 6) { p.v[i + 1] += dy; p.v[i + 2] += dz; }
for (const w of wheels) { w.c = [w.c[0], w.c[1] + dy, w.c[2] + dz]; console.log('  wheel', w.n, 'slot', w.slot, w.c.map((x) => x.toFixed(3)).join(',')); }

if (survey) {
  for (const p of parts) { const [mn, mx] = bbox([p]); console.log(`${p.node.padEnd(26)} ${p.mat.padEnd(20)} role=${String(roleOf(p)).padEnd(2)} tris=${String(p.ind.length / 3).padStart(6)} wheel=${(p.wheelNode || '-').padEnd(12)} x[${mn[0].toFixed(2)},${mx[0].toFixed(2)}] y[${mn[1].toFixed(2)},${mx[1].toFixed(2)}] z[${mn[2].toFixed(2)},${mx[2].toFixed(2)}] col=${p.color.slice(0, 3).map((x) => x.toFixed(2)).join(',')}`); }
  process.exit(0);
}

// ---- 4. simplify what can be simplified without anyone noticing ---------------------------------------------------------------
for (const p of parts) {
  const target = M.budget?.[p.node], tris = p.ind.length / 3; if (!target || tris <= target) continue;
  const [ni] = MeshoptSimplifier.simplify(p.ind, p.v, 6, Math.max(3, Math.floor(target) * 3), 0.14, []);
  const remap = new Map(), nv = [], out = new Uint32Array(ni.length);
  for (let i = 0; i < ni.length; i++) { const o = ni[i]; let r = remap.get(o); if (r === undefined) { r = remap.size; remap.set(o, r); nv.push(...p.v.subarray(o * 6, o * 6 + 6)); } out[i] = r; }
  p.v = Float32Array.from(nv); p.ind = out;
}

// ---- 4a. wheel mode: one wheel (front left), simplified, centred, for the procedural vehicles -----------------------------------
if (wheelMode) {
  const keep = parts.filter((p) => p.wheelNode && slotOf0(p) === 0 && [ROLE.TIRE, ROLE.RIM, ROLE.BRAKE].includes(roleOf(p)));
  function slotOf0(p) { return wheels.find((w) => w.n === p.wheelNode).slot; }
  const wc = wheels.find((w) => w.slot === 0).c, outParts = [];
  const target = { [ROLE.TIRE]: 700, [ROLE.RIM]: 1500, [ROLE.BRAKE]: 1 };
  for (const role of [ROLE.TIRE, ROLE.RIM]) {                      // the brake disc hides behind the rim: left out
    const g = { v: [], col: [], ind: [] };
    for (const p of keep.filter((q) => roleOf(q) === role)) {
      const base = g.v.length / 6; let c = p.color.slice(0, 3);
      if (role === ROLE.TIRE) c = [0.03, 0.03, 0.033]; else if (role === ROLE.RIM) c = p.node === 'centre' ? [0.6, 0.5, 0.1] : [0.5, 0.5, 0.52]; else c = [0.2, 0.2, 0.21];
      for (let i = 0; i < p.v.length; i += 6) { g.v.push(p.v[i] - wc[0], p.v[i + 1] - wc[1], p.v[i + 2] - wc[2], p.v[i + 3], p.v[i + 4], p.v[i + 5]); g.col.push(c); }
      for (const x of p.ind) g.ind.push(base + x);
    }
    const sp = { v: Float32Array.from(g.v), ind: Uint32Array.from(g.ind), node: 'wheel' }; const tris = sp.ind.length / 3;
    if (tris > target[role]) { const [ni] = MeshoptSimplifier.simplify(sp.ind, sp.v, 6, target[role] * 3, 0.5, ['Permissive']); const remap = new Map(), nv = [], nc = [], out = new Uint32Array(ni.length);
      for (let i = 0; i < ni.length; i++) { const o = ni[i]; let r = remap.get(o); if (r === undefined) { r = remap.size; remap.set(o, r); nv.push(...sp.v.subarray(o * 6, o * 6 + 6)); nc.push(g.col[o]); } out[i] = r; } outParts.push({ role, slot: 0, v: nv, col: nc, ind: Array.from(out) }); }
    else outParts.push({ role, slot: 0, v: g.v, col: g.col, ind: g.ind });
  }
  const hdr3 = Buffer.alloc(4 + 4 + 4 + 64 + 24 + 24); let o3 = 0; hdr3.write('SCM1', o3); o3 += 4; hdr3.writeUInt32LE(2, o3); o3 += 4; hdr3.writeUInt32LE(outParts.length, o3); o3 += 4;
  hdr3.writeFloatLE(0, o3); hdr3.writeFloatLE(0, o3 + 4); hdr3.writeFloatLE(0, o3 + 8); hdr3.writeFloatLE(tireR, o3 + 12);
  const ch3 = [hdr3];
  for (const g of outParts) {
    const nvv = g.v.length / 6, nii = g.ind.length, vb = Buffer.alloc(nvv * 36), ib = Buffer.alloc(nii * 4), h = Buffer.alloc(16);
    h.writeUInt32LE(g.role, 0); h.writeInt32LE(0, 4); h.writeUInt32LE(nvv, 8); h.writeUInt32LE(nii, 12);
    for (let i = 0; i < nvv; i++) { for (let k = 0; k < 6; k++) vb.writeFloatLE(g.v[i * 6 + k], i * 36 + k * 4); const c = g.col[i]; vb.writeUInt32LE(((Math.round(Math.min(1, c[0]) * 255)) | (Math.round(Math.min(1, c[1]) * 255) << 8) | (Math.round(Math.min(1, c[2]) * 255) << 16) | (255 << 24)) >>> 0, i * 36 + 24); }
    for (let i = 0; i < nii; i++) ib.writeUInt32LE(g.ind[i], i * 4);
    ch3.push(h, vb, ib); console.log(`  wheel part role=${g.role} verts=${nvv} tris=${nii / 3}`);
  }
  fs.mkdirSync(OUT, { recursive: true }); const b3 = Buffer.concat(ch3); fs.writeFileSync(OUT + 'wheel.scm', b3); console.log(`wrote ${OUT}wheel.scm ${(b3.length / 1024).toFixed(0)} KB, tyre radius ${tireR.toFixed(3)}`); process.exit(0);
}

// ---- 4b. traffic version: everything visible merged into one coloured mesh, wheels at rest, centred, simplified ------------------
if (trafficTris) {
  const tp = parts.filter((p) => !(M.trafficSkip?.test(p.node)) && ![ROLE.INTERIOR, ROLE.STEER].includes(roleOf(p)));
  const merged = { v: [], col: [], ind: [] }, lights = { [ROLE.HEAD]: { v: [], col: [], ind: [] }, [ROLE.TAIL]: { v: [], col: [], ind: [] } };
  const [pmn, pmx] = bbox(tp.filter((p) => !p.wheelNode)), zc = (pmn[2] + pmx[2]) / 2;
  const tint = { [ROLE.GLASS]: [0.02, 0.025, 0.03], [ROLE.TIRE]: [0.012, 0.012, 0.014], [ROLE.CHROME]: [0.5, 0.5, 0.52], [ROLE.RIM]: [0.3, 0.3, 0.32], [ROLE.BRAKE]: [0.12, 0.12, 0.13], [ROLE.TRIM]: null, [ROLE.CARBON]: null };
  for (const p of tp) {
    const role = roleOf(p), target = role === ROLE.HEAD || role === ROLE.TAIL ? lights[role] : merged, base = target.v.length / 6;
    const wc = p.wheelNode ? wheels.find((w) => w.n === p.wheelNode).c : [0, 0, 0];
    let c = p.color.slice(0, 3);
    if (role === ROLE.PAINT) c = [1, 1, 1]; else if (tint[role]) c = tint[role]; else if (role === ROLE.HEAD) c = [1.0, 0.93, 0.8];
    else if (role === ROLE.TAIL && p.emissive.some((x) => x > 0)) { const m = Math.max(...p.emissive); c = p.emissive.map((x) => x / m); }
    c = c.map((x) => Math.max(x, role === ROLE.TRIM || role === ROLE.CARBON ? 0.02 : 0));
    for (let i = 0; i < p.v.length; i += 6) { target.v.push(p.v[i], p.v[i + 1], p.v[i + 2] - zc, p.v[i + 3], p.v[i + 4], p.v[i + 5]); target.col.push(c); }
    for (const x of p.ind) target.ind.push(base + x);
    void wc;
  }
  if (police) {                                                  // the livery: dark blue below the waist line on the sides, a white band, white above
    for (let i = 0; i < merged.col.length; i++) {
      const c = merged.col[i]; if (!(c[0] === 1 && c[1] === 1 && c[2] === 1)) continue;
      const y = merged.v[i * 6 + 1], nx = merged.v[i * 6 + 3], nz = merged.v[i * 6 + 5], zz = merged.v[i * 6 + 2];
      if (Math.abs(nx) > 0.45 && y < 0.64 && zz > -1.9 && zz < 1.5) merged.col[i] = [0.03, 0.06, 0.2];
    }
  }
  // simplify the merged mesh, keeping the colours as vertex attributes so the dark parts stay dark
  const pos = Float32Array.from(merged.v), cols = Float32Array.from(merged.col.flat()), ind = Uint32Array.from(merged.ind);
  const nvert = pos.length / 6, attr = new Float32Array(nvert * 6); for (let i = 0; i < nvert; i++) { attr.set(cols.subarray(i * 3, i * 3 + 3), i * 6); attr.set(pos.subarray(i * 6 + 3, i * 6 + 6), i * 6 + 3); }
  const pos3 = new Float32Array(pos.length / 6 * 3); for (let i = 0; i < pos.length / 6; i++) pos3.set(pos.subarray(i * 6, i * 6 + 3), i * 3);
  console.log(`traffic mesh before: ${merged.ind.length / 3} tris, ${pos.length / 6} verts`);
  const [ni, err] = MeshoptSimplifier.simplifyWithAttributes(ind, pos3, 3, attr, 6, [1.0, 1.0, 1.0, 2.0, 2.0, 2.0], null, trafficTris * 3, 0.3, []);
  const remap = new Map(), nv = [], nc = [], nind = new Uint32Array(ni.length);
  for (let i = 0; i < ni.length; i++) { const o = ni[i]; let r = remap.get(o); if (r === undefined) { r = remap.size; remap.set(o, r); nv.push(...pos.subarray(o * 6, o * 6 + 6)); nc.push(merged.col[o]); } nind[i] = r; }
  console.log(`traffic mesh after: ${ni.length / 3} tris (error ${err.toFixed(4)})`);
  const [bmn, bmx] = bbox([{ v: Float32Array.from(nv) }]);
  const out = [{ role: ROLE.PAINT, slot: -1, v: nv, col: nc, ind: Array.from(nind) }];
  for (const r of [ROLE.HEAD, ROLE.TAIL]) if (lights[r].ind.length) out.push({ role: r, slot: -1, ...lights[r] });
  const hdr2 = Buffer.alloc(4 + 4 + 4 + 64 + 24 + 24); let o2 = 0; hdr2.write('SCM1', o2); o2 += 4; hdr2.writeUInt32LE(2, o2); o2 += 4; hdr2.writeUInt32LE(out.length, o2); o2 += 4;
  const fl = (arr) => { for (const x of arr) { hdr2.writeFloatLE(x, o2); o2 += 4; } };
  for (let sl = 0; sl < 4; sl++) { const w = wheels.find((x) => x.slot === sl); fl([w.c[0], w.c[1], w.c[2] - zc, tireR]); }
  fl([...bmn, ...bmx, 0, 0, 0, 0, 0, 1]);
  const ch = [hdr2];
  for (const g of out) {
    const nvv = g.v.length / 6, nii = g.ind.length, vb = Buffer.alloc(nvv * 36), ib = Buffer.alloc(nii * 4), h = Buffer.alloc(16);
    h.writeUInt32LE(g.role, 0); h.writeInt32LE(g.slot, 4); h.writeUInt32LE(nvv, 8); h.writeUInt32LE(nii, 12);
    for (let i = 0; i < nvv; i++) { for (let k = 0; k < 6; k++) vb.writeFloatLE(g.v[i * 6 + k], i * 36 + k * 4); const c = g.col[i]; vb.writeUInt32LE(((Math.round(Math.min(1, c[0]) * 255)) | (Math.round(Math.min(1, c[1]) * 255) << 8) | (Math.round(Math.min(1, c[2]) * 255) << 16) | (255 << 24)) >>> 0, i * 36 + 24); }
    for (let i = 0; i < nii; i++) ib.writeUInt32LE(g.ind[i], i * 4);
    ch.push(h, vb, ib); console.log(`  part role=${g.role} verts=${nvv} tris=${nii / 3}`);
  }
  fs.mkdirSync(OUT, { recursive: true }); const b2 = Buffer.concat(ch); const fname = M.out.replace('.scm', police ? '_police.scm' : '_traffic.scm'); fs.writeFileSync(OUT + fname, b2);
  console.log(`wrote ${OUT}${fname}: ${(b2.length / 1048576).toFixed(2)} MB, body ${bmn.map((x) => x.toFixed(2))} .. ${bmx.map((x) => x.toFixed(2))}`);
  process.exit(0);
}

// ---- 5. the steering wheel's pivot and axis (the rim is a ring: its axis is the direction of least spread) --------------
function steerFrame() {
  const pts = []; for (const p of parts) if (M.steerRimNode ? p.node === M.steerRimNode : M.steerRimRe?.test(p.node)) for (let i = 0; i < p.v.length; i += 6) pts.push([p.v[i], p.v[i + 1], p.v[i + 2]]);
  if (!pts.length) return { pivot: [0, 0, 0], axis: [0, 0, 1] };
  let { centre, axis } = eigenLeast(pts); if (axis[2] < 0) axis = axis.map((x) => -x);   // pointing forward, away from the driver: a positive angle turns the wheel clockwise as the driver sees it
  return { pivot: centre, axis };
}
const SF = steerFrame(); console.log('steering wheel pivot', SF.pivot.map((x) => x.toFixed(3)), 'axis', SF.axis.map((x) => x.toFixed(3)));

// ---- 6. roles, colours, merge ---------------------------------------------------------------------------------------------
const groups = new Map(), slotOf = new Map(wheels.map((w) => [w.n, w.slot]));
for (const p of parts) {
  const role = roleOf(p); if (role === ROLE.SKIP) continue;
  const isWheelPart = !!p.wheelNode && (role === ROLE.TIRE || role === ROLE.RIM || role === ROLE.BRAKE), slot = isWheelPart ? slotOf.get(p.wheelNode) : -1;
  const key = role + ':' + slot; if (!groups.has(key)) groups.set(key, { role, slot, v: [], col: [], ind: [] });
  const g = groups.get(key), base = g.v.length / 6;
  let c = p.color.slice(0, 3);
  if (role === ROLE.PAINT) c = [1, 1, 1]; else if (role === ROLE.GLASS) c = [0.02, 0.025, 0.03]; else if (role === ROLE.TIRE) c = [0.03, 0.03, 0.033];
  else if (role === ROLE.HEAD) c = [1.0, 0.93, 0.8];
  else if (role === ROLE.TAIL && p.emissive.some((x) => x > 0)) { const m = Math.max(...p.emissive); c = p.emissive.map((x) => x / m); }
  else if (role === ROLE.CHROME && p.mat === 'Mirror') c = [0.55, 0.55, 0.58];
  const centre = isWheelPart ? wheels.find((w) => w.n === p.wheelNode).c : [0, 0, 0];
  for (let i = 0; i < p.v.length; i += 6) { g.v.push(p.v[i] - centre[0], p.v[i + 1] - centre[1], p.v[i + 2] - centre[2], p.v[i + 3], p.v[i + 4], p.v[i + 5]); g.col.push(c); }
  for (const x of p.ind) g.ind.push(base + x);
}
const list = [...groups.values()].sort((a, b) => a.role - b.role || a.slot - b.slot);
const [bmin, bmax] = bbox(parts.filter((p) => !p.wheelNode && roleOf(p) === ROLE.PAINT));
const hdr = Buffer.alloc(4 + 4 + 4 + 64 + 24 + 24); let o = 0;
hdr.write('SCM1', o); o += 4; hdr.writeUInt32LE(2, o); o += 4; hdr.writeUInt32LE(list.length, o); o += 4;
for (let s = 0; s < 4; s++) { const w = wheels.find((x) => x.slot === s) ?? { c: [0, 0, 0] }; for (const x of [...w.c, tireR]) { hdr.writeFloatLE(x, o); o += 4; } }
for (const x of [...bmin, ...bmax, ...SF.pivot, ...SF.axis]) { hdr.writeFloatLE(x, o); o += 4; }
const chunks = [hdr]; let totalTris = 0;
const q8 = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
for (const g of list) {
  const nv = g.v.length / 6, ni = g.ind.length, vb = Buffer.alloc(nv * 36), ib = Buffer.alloc(ni * 4), h = Buffer.alloc(16);
  h.writeUInt32LE(g.role, 0); h.writeInt32LE(g.slot, 4); h.writeUInt32LE(nv, 8); h.writeUInt32LE(ni, 12);
  for (let i = 0; i < nv; i++) { for (let k = 0; k < 6; k++) vb.writeFloatLE(g.v[i * 6 + k], i * 36 + k * 4); const c = g.col[i]; vb.writeUInt32LE((q8(c[0]) | (q8(c[1]) << 8) | (q8(c[2]) << 16) | (255 << 24)) >>> 0, i * 36 + 24); }
  for (let i = 0; i < ni; i++) ib.writeUInt32LE(g.ind[i], i * 4);
  chunks.push(h, vb, ib); totalTris += ni / 3;
  console.log(`  part role=${g.role} wheel=${g.slot} verts=${nv} tris=${ni / 3}`);
}
fs.mkdirSync(OUT, { recursive: true }); const buf = Buffer.concat(chunks); fs.writeFileSync(OUT + M.out, buf);
console.log(`wrote ${OUT}${M.out}: ${list.length} parts, ${totalTris} triangles, ${(buf.length / 1048576).toFixed(1)} MB, body ${bmin.map((x) => x.toFixed(2))} .. ${bmax.map((x) => x.toFixed(2))}`);
