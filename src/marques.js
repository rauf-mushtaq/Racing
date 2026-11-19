// The cars the dealership sells (dealer.js; what they are and how they drive: marque-specs.js), as models. Each body is lofted from its own cross-sections
// (carModel.js loft: a side, a shoulder and a glasshouse at every station along the car, with the wheel arches cut out of the sills), dressed with its own
// lamps, grille, intakes, vents, wing, mirrors and exhausts, on its own wheels (rims of its style, tyres, brake discs and calipers), with a cockpit to sit
// in, put together the way main.js expects of a car: root (placed by the physics) > body (pitches and rolls on the suspension), four wheels that steer
// and roll, tail lamps that brighten under braking, glows on the lamps, a contact shadow. A display car (the showroom, the forecourt) has a plain dark
// cabin in place of the cockpit. No maker's names or badges anywhere: the shapes are the point.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { attachSSR } from './ssr.js';
import { paintFlakes } from './paintfx.js';
import { curve, lerp } from './util.js';
import { glowTex, plateTex, carShadowTex } from './textures.js';
import { loft, stationsFor, archBottom, mergeByMaterial, sectionHalf } from './carModel.js';
import { buildCockpit } from './cockpit.js';
import { CAR_BY_ID, MPAINTS } from './marque-specs.js';

// ---- Materials: the paint is each car's own; everything else is shared by all of them ----------------------------------------------------------------
let SH = null;
function shared() {
  if (SH) return SH;
  const std = o => new THREE.MeshStandardMaterial(o), phy = o => new THREE.MeshPhysicalMaterial(o);
  SH = {
    glass: attachSSR(phy({ color: 0x07080a, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, transparent: true, opacity: 0.86 }), { range: 70, rough: 0.4, view: 120 }),
    lens: phy({ color: 0xdfe5ea, metalness: 0, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.5, transparent: true, opacity: 0.35, depthWrite: false }),
    chrome: attachSSR(std({ color: 0xe2e5ea, roughness: 0.07, metalness: 1, envMapIntensity: 1.3 }), { range: 60, rough: 0.3, view: 100 }),
    alu: std({ color: 0xb4b8be, roughness: 0.24, metalness: 1, envMapIntensity: 1.2 }),
    black: std({ color: 0x0c0c0e, roughness: 0.3, metalness: 0.35 }),
    matte: std({ color: 0x060607, roughness: 0.92 }),
    mesh: std({ color: 0x101113, roughness: 0.7, metalness: 0.5 }),
    carbon: std({ color: 0x18191c, roughness: 0.28, metalness: 0.55 }),
    rubber: std({ color: 0x141415, roughness: 0.8 }),
    tyre: std({ color: 0x131313, roughness: 0.86, side: THREE.DoubleSide }),
    barrel: std({ color: 0x1a1b1d, roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide }),
    disc: std({ color: 0x5c5f64, roughness: 0.32, metalness: 0.9 }),
    head: std({ color: 0xe8eeff, emissive: 0xeef4ff, emissiveIntensity: 2.4, roughness: 0.2 }),
    drl: std({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 3.2, roughness: 0.3 }),
    amber: std({ color: 0x553300, emissive: 0xff9a10, emissiveIntensity: 1.5, roughness: 0.3 }),
    reverse: std({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.3 }),
    redLens: phy({ color: 0x3a0606, roughness: 0.1, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.85 }),
    liner: std({ color: 0x050505, roughness: 1, side: THREE.BackSide }),
    cabin: std({ color: 0x1c1b1e, roughness: 0.8 }),
    lining: std({ color: 0x2a2a2e, roughness: 0.95, side: THREE.BackSide }),
    wood: std({ color: 0x5a3418, roughness: 0.35, metalness: 0.05 }),
    rims: {
      silver: attachSSR(std({ color: 0xbabdc3, roughness: 0.2, metalness: 1, envMapIntensity: 1.15 }), { range: 50, rough: 0.35, view: 80 }),
      dark: std({ color: 0x2b2d31, roughness: 0.28, metalness: 0.9 }),
      black: std({ color: 0x121315, roughness: 0.35, metalness: 0.6 }),
      chrome: null, gold: std({ color: 0xb0894a, roughness: 0.25, metalness: 1 }),
    },
    cal: {},
  };
  SH.rims.chrome = SH.chrome; SH.lining.userData.noProbe = true;
  const all = new Set(); const walk = o => { for (const v of Object.values(o)) { if (v && v.isMaterial) all.add(v); else if (v && typeof v === 'object') walk(v); } }; walk(SH);
  SH.all = all; return SH;
}
const calMat = hex => { const M = shared(); if (!M.cal[hex]) { M.cal[hex] = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.4, metalness: 0.3 }); M.all.add(M.cal[hex]); } return M.cal[hex]; };
function paintMat(key) {
  const p = MPAINTS[key] || MPAINTS.silver;
  const m = attachSSR(new THREE.MeshPhysicalMaterial({ color: p.color, metalness: p.metal, roughness: p.rough, clearcoat: p.matte ? 0.1 : 1, clearcoatRoughness: p.matte ? 0.6 : 0.03, envMapIntensity: p.matte ? 0.7 : 1.15 }), { range: 70, rough: 0.5, view: 120 });
  if (!p.matte) paintFlakes(m, p.metal > 0.3 ? 0.35 : 0.15);
  return m;
}
export function setMarquePaint(root, key) {
  const p = MPAINTS[key], m = root.userData.paint; if (!p || !m) return;
  m.color.setHex(p.color); m.metalness = p.metal; m.roughness = p.rough; m.clearcoat = p.matte ? 0.1 : 1; m.clearcoatRoughness = p.matte ? 0.6 : 0.03; m.envMapIntensity = p.matte ? 0.7 : 1.15;
  root.userData.paintKey = key;
}

// ---- Geometry helpers ---------------------------------------------------------------------------------------------------------------------------------
const rbx = (w, h, d, r = 0.01) => new RoundedBoxGeometry(w, h, d, 2, Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
// The body's surface, from the loft's own sections (carModel.js sectionHalf: the half section's fifteen points from the middle of the floor round the side
// to the middle of the roof, rounded off at the nose and the tail as the loft does it).
// The height of the top (bonnet, roof, deck) over a point (x, z):
function topY(P, z, x) {
  const h = sectionHalf(P, z), ax = Math.abs(x); let best = null;
  for (let k = 14; k > 7; k--) { const a = h[k], b = h[k - 1], lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]); if (ax >= lo && ax <= hi) { const t = (ax - a[0]) / ((b[0] - a[0]) || 1), y = a[1] + (b[1] - a[1]) * t; if (best === null || y > best) best = y; } }
  return best ?? h[7][1];
}
// How far out the side is at a height y (half the width there):
function sideX(P, z, y) {
  const h = sectionHalf(P, z);
  if (y <= h[2][1]) return h[2][0];
  for (let k = 2; k < 8; k++) { const a = h[k], b = h[k + 1]; if (y >= a[1] && y <= b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / ((b[1] - a[1]) || 1); }
  return h[8][0];
}
// The section's measurements at z (half width, sill, shoulder and roof heights), for placing things.
function sec(P, z) { const h = sectionHalf(P, z); return { w: h[5][0], yb: h[0][1], ys: h[7][1], yt: h[14][1], wt: h[11][0] }; }
const flipWinding = g => { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } };
const shape = pts => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))));
// Each triangle split in four, n times (the outline stays exactly as drawn), so a flat plate can be bent onto the body.
function subdiv(g, n) {
  let p = Array.from(g.toNonIndexed().attributes.position.array);
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  for (let k = 0; k < n; k++) {
    const q = [];
    for (let i = 0; i < p.length; i += 9) { const A = p.slice(i, i + 3), B2 = p.slice(i + 3, i + 6), C2 = p.slice(i + 6, i + 9), ab = m(A, B2), bc = m(B2, C2), ca = m(C2, A); q.push(...A, ...ab, ...ca, ...ab, ...B2, ...bc, ...ca, ...bc, ...C2, ...ab, ...bc, ...ca); }
    p = q;
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return out;
}
// A plate drawn in (z, y) on side s (+1 the car's left, +x), pressed onto the side `off` metres proud of it.
function onSide(P, pts, s, off = 0.004, n = 3) {
  const g0 = shape(pts); if (s > 0) flipWinding(g0); const g = subdiv(g0, n), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getX(i), y = p.getY(i); p.setXYZ(i, s * (sideX(P, z, y) + off), y, z); }
  // (the map (u, v) -> (x, v, u) turns the face to -x: the left side's is turned back)
  g.computeVertexNormals(); return g;
}
// A plate drawn in (x, z) from above, laid on the top `off` metres proud of it.
function onTop(P, pts, off = 0.004, n = 3) {
  const g0 = shape(pts); flipWinding(g0); const g = subdiv(g0, n), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getY(i); p.setXYZ(i, x, topY(P, z, x) + off, z); }
  g.computeVertexNormals(); return g;
}
// A flat plate across the front (f = +1, facing +z) or the back (f = -1), drawn in (x, y), at z.
function endPlate(pts, f, z) {
  const g = shape(pts), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, z);
  if (f < 0) flipWinding(g); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g.computeVertexNormals(); return g;
}
// A strip along a line (points in a plane), w wide: the outline of a band, for onTop / onSide (a lamp's blade of light, a crease, a vent's frame).
function band(pts, w) {
  const L = [], R = [];
  pts.forEach((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1, nx = -dz / d * w / 2, nz = dx / d * w / 2; L.push([p[0] + nx, p[1] + nz]); R.push([p[0] - nx, p[1] - nz]); });
  return [...L, ...R.reverse()];
}
// An ellipse's outline (for lamps), centre (a, b), radii (ra, rb), turned by t.
const ellipse = (a, b, ra, rb, t = 0, n = 24) => Array.from({ length: n }, (_, i) => { const u = i / n * Math.PI * 2, c = Math.cos(u) * ra, s = Math.sin(u) * rb; return [a + c * Math.cos(t) - s * Math.sin(t), b + c * Math.sin(t) + s * Math.cos(t)]; });

// ---- Wheels -----------------------------------------------------------------------------------------------------------------------------------------
// A wheel of a style: the tyre (a lathed profile with a rounded shoulder), the rim's barrel and lip, its face (spokes in the style), the hub (a centre-lock
// nut on the racing ones); and, on the hub that steers but does not roll, the brake disc and its caliper. side: +1 the car's left (+x).
function makeWheel(o, side, M) {
  const { r, w: wid, style, rim: rimKey, cal } = o, rimMat = M.rims[rimKey] || M.rims.silver, spin = new THREE.Group(), hw = wid / 2;
  const rr = r * (o.rimK || 0.74), add = (geo, mat, x, y, z, rx = 0, parent = spin) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; parent.add(m); return m; };
  const prof = [new THREE.Vector2(rr, -hw)];
  for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 + k / 8 * Math.PI; prof.push(new THREE.Vector2(r - 0.04 + Math.cos(a) * 0.04, Math.sin(a) * (hw - 0.012))); }
  prof.push(new THREE.Vector2(rr, hw));
  add(new THREE.LatheGeometry(prof, 40).rotateZ(Math.PI / 2), M.tyre, 0, 0, 0);
  add(new THREE.CylinderGeometry(rr, rr, wid - 0.02, 32, 1, true).rotateZ(Math.PI / 2), M.barrel, 0, 0, 0);
  add(new THREE.CircleGeometry(rr, 32).rotateY(side * Math.PI / 2), M.barrel, side * (hw - 0.13), 0, 0);
  add(new THREE.TorusGeometry(rr - 0.004, 0.014, 8, 40).rotateY(Math.PI / 2), rimMat, side * (hw - 0.022), 0, 0);
  const fx = side * (hw - 0.05);
  const spoke = (a, r0, r1, w, t = 0.032, twist = 0, mat = rimMat, dx = 0) => { const g = new THREE.BoxGeometry(t, r1 - r0, w); if (twist) g.rotateY(twist); const m = add(g, mat, fx + dx, Math.cos(a) * (r0 + r1) / 2, Math.sin(a) * (r0 + r1) / 2, a); return m; };
  const n = { twin5: 5, ten: 10, y5: 5, multi: 16, turbine: 12, g5: 5, mesh: 10 }[style] || 5;
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2;
    if (style === 'twin5') { for (const off of [-0.09, 0.09]) spoke(a + off, 0.07, rr - 0.012, 0.036); }
    else if (style === 'ten') spoke(a, 0.06, rr - 0.012, 0.03, 0.03);
    else if (style === 'y5') { spoke(a, 0.06, rr * 0.5, 0.05, 0.034); for (const off of [-0.16, 0.16]) { const r0 = rr * 0.46, r1 = rr - 0.012, am = a + off * 0.6; spoke(am, r0, r1, 0.034, 0.03); } }
    else if (style === 'multi') spoke(a, 0.075, rr - 0.012, 0.022, 0.026);
    else if (style === 'turbine') spoke(a, 0.07, rr - 0.012, 0.05, 0.016, 0.7);
    else if (style === 'g5') { spoke(a, 0.08, rr - 0.012, 0.11, 0.045); }
    else if (style === 'mesh') { spoke(a, 0.06, rr - 0.012, 0.022); spoke(a + Math.PI / n, rr * 0.45, rr - 0.012, 0.022); }
  }
  add(new THREE.CylinderGeometry(rr * 0.24, rr * 0.27, 0.05, 20).rotateZ(Math.PI / 2), rimMat, side * (hw - 0.045), 0, 0);
  if (o.lock) add(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 6).rotateZ(Math.PI / 2), M.rims.dark, side * (hw - 0.02), 0, 0);
  else add(new THREE.CylinderGeometry(rr * 0.13, rr * 0.13, 0.02, 18).rotateZ(Math.PI / 2), M.black, side * (hw - 0.02), 0, 0);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(rr - 0.05, rr - 0.05, 0.032, 28).rotateZ(Math.PI / 2), M.disc); disc.position.x = side * (hw - 0.14);
  const caliper = new THREE.Mesh(rbx(0.085, 0.22, 0.13, 0.02), calMat(cal)); caliper.position.set(side * (hw - 0.115), (rr - 0.12) * 0.7, -(rr - 0.12) * 0.7); caliper.rotation.x = -Math.PI / 4;
  return { spin, disc, caliper };
}

// ---- The bodies -------------------------------------------------------------------------------------------------------------------------------------
// Each: the loft's profile (P: the ends, the axles and the curves of the roof, the half width, the glasshouse, the shoulder, the sills; isGlass picks the
// windows out of the bands of the sections), the wheels, where the windscreen meets the bonnet (the cockpit goes behind it), and dress(K): the details.
// Lamps, intakes and vents that lie on the body are plates pressed onto its surface (onTop, onSide), so they follow its curves.
const B = {};
const prof = (o, D) => {
  const P = { ...o, wzf: D.wzf, wzr: D.wzr, wheelR: D.wheelR, top: curve(o.top), half: curve(o.half), topHalf: curve(o.topHalf), shoulder: curve(o.shoulder), bottom: null };
  P.bottom = archBottom(P, curve(o.bottom)); return P;
};
// An intake set into the front of a low nose: a black box tucked up under it, only its face and its floor showing (x0..x1 across, y0..y1, back to z0).
const tuck = (K, x0, x1, y0, y1, z0, z1, mat) => K.add(rbx(x1 - x0, y1 - y0, z1 - z0, 0.02), mat || K.M.matte, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

// FALKNER R9 (the Turbo and the RS): a rear-engined coupé. Oval lamps at the front of wings that stand up from the bonnet, the bonnet falling away between
// them, the roof running on in one curve down over the engine to the tail, broad hips over the back wheels, a light bar across the tail, louvres in the lid.
B.r9 = (c, rs) => ({
  P: prof({
    zf: 2.27, zr: rs ? -2.3 : -2.27, noseR: 0.3, tailR: 0.26, endW: 0.8, endH: 0.68, tailW: 0.84, tailH: 0.74, archR: 0.41, archLift: 0.96,
    top: [[-2.3, 0.86], [-2.15, 0.97], [-1.95, 1.0], [-1.6, 1.05], [-1.2, 1.14], [-0.75, 1.24], [-0.35, 1.29], [0.0, 1.3], [0.3, 1.27], [0.55, 1.15], [0.8, 1.0], [0.98, 0.89], [1.3, 0.82], [1.8, 0.74], [2.1, 0.64], [2.27, 0.5]],
    half: [[-2.3, 0.86], [-2.05, 0.935], [-1.5, 0.955], [-1.0, 0.945], [-0.5, 0.915], [0.3, 0.9], [0.9, 0.905], [1.35, 0.925], [1.85, 0.915], [2.15, 0.86], [2.27, 0.8]],
    topHalf: [[-2.3, 0.72], [-1.9, 0.74], [-1.5, 0.66], [-1.0, 0.6], [-0.5, 0.57], [0.0, 0.56], [0.4, 0.6], [0.8, 0.72], [1.0, 0.8], [1.6, 0.82], [2.27, 0.68]],
    shoulder: [[-2.3, 0.76], [-2.0, 0.86], [-1.5, 0.9], [-0.9, 0.9], [0.0, 0.88], [0.9, 0.85], [1.4, 0.8], [1.9, 0.72], [2.15, 0.62], [2.27, 0.5]],
    bottom: [[-2.3, 0.34], [-2.05, 0.22], [-1.7, 0.15], [1.75, 0.15], [2.1, 0.21], [2.27, 0.3]],
    isGlass(b, z) { return (b >= 11 && z > 0.33 && z < 0.93) || (b >= 11 && z > -1.42 && z < -0.62) || (b >= 8 && b <= 10 && z > -0.95 + (b - 8) * 0.1 && z < 0.82 - (b - 8) * 0.16); },
  }, c.dims),
  wheels: { f: { w: 0.255, style: rs ? 'ten' : 'twin5', rim: rs ? 'black' : 'silver', cal: rs ? 0xd21818 : 0xf2c21a, lock: rs }, r: { w: 0.31 } },
  screen: 0.93, exhaust: rs ? [0, 0.4] : [0.42, 0.3],
  dress(K) {
    const { add, M, paint, P, mir } = K, zr = P.zr;
    mir(s => {
      // The wings stand up from the bonnet: a long ridge of paint on each, ending at the lamp. The lamp: a chrome ring round a dark lens tipped forward
      // and up, a projector in it and four points of light round that.
      const px = s * 0.64, cz = 1.7, cy = topY(P, cz, 0.64) - 0.025;
      add(new THREE.SphereGeometry(1, 28, 16), paint, px, cy, cz).scale.set(0.21, 0.1, 0.44);
      const lz = cz + 0.38, ly = cy + 0.05, rx = -0.6;
      add(new THREE.CircleGeometry(0.118, 28), M.black, px, ly, lz, rx).scale.set(1, 0.85, 1);
      add(new THREE.TorusGeometry(0.118, 0.012, 8, 32), M.chrome, px, ly, lz - 0.004, rx).scale.set(1, 0.85, 1);
      add(new THREE.CircleGeometry(0.045, 20), M.head, px, ly + 0.004, lz + 0.004, rx);
      for (const [dx, dy] of [[-0.058, 0.04], [0.058, 0.04], [-0.058, -0.04], [0.058, -0.04]]) add(rbx(0.03, 0.012, 0.01, 0.004), M.drl, px + dx, ly + 0.004 + dy * Math.cos(-rx) * 0.85, lz + 0.006 - dy * Math.sin(-rx) * 0.85, rx);
      add(new THREE.SphereGeometry(0.118, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M.lens, px, ly + 0.002, lz + 0.002, rx).scale.set(1, 0.85, 0.35);
      // Mirrors on the doors, and a flush handle.
      add(rbx(0.2, 0.09, 0.13, 0.04), paint, s * 1.0, 0.98, 0.62, 0, s * 0.12); add(rbx(0.1, 0.03, 0.05, 0.012), M.black, s * 0.92, 0.95, 0.6);
      add(onSide(P, band([[-0.06, 0.86], [-0.24, 0.86]], 0.028), s, 0.003), M.black);
      // The intakes in front of the back wheels (the Turbo's), or the RS's bigger ducts and the louvres on top of its front wings.
      add(onSide(P, rs ? [[-0.46, 0.5], [-0.95, 0.5], [-0.93, 0.8], [-0.55, 0.82]] : [[-0.5, 0.56], [-0.92, 0.56], [-0.9, 0.78], [-0.56, 0.8]], s, 0.004), M.matte);
      if (rs) for (let k = 0; k < 6; k++) add(onTop(P, band([[s * 0.52, 1.05 + k * 0.06], [s * 0.76, 1.05 + k * 0.06]], 0.022), 0.004), M.black);
      // Lamps in the corners of the front bumper (intakes beneath them); the sill; a lamp round each back corner that the light bar joins.
      add(onSide(P, [[2.14, 0.24], [1.98, 0.24], [1.99, 0.42], [2.12, 0.44]], s, 0.004), M.mesh);
      add(onSide(P, band([[2.16, 0.47], [1.98, 0.46]], 0.025), s, 0.006), M.drl);
      add(rbx(0.04, 0.07, 1.55, 0.02), M.black, s * (P.half(0) - 0.02), 0.2, -0.05);
      add(onSide(P, band([[-2.05, 0.92], [-2.24, 0.925]], 0.05), s, 0.004), K.tail);
      add(rbx(0.22, 0.012, 0.04, 0.006), M.reverse, s * 0.3, 0.88, zr - 0.012);
    });
    // The light bar across the tail, the louvres in the engine lid, the wing, the diffuser, the exhausts and the plate.
    add(rbx(1.24, 0.04, 0.03, 0.01), K.tail, 0, 0.925, zr + 0.005); add(rbx(1.3, 0.07, 0.03, 0.01), M.redLens, 0, 0.925, zr + 0.012);
    for (let k = -6; k <= 6; k++) add(onTop(P, band([[k * 0.07, -1.6], [k * 0.07, -1.86]], 0.035), 0.004), M.black);
    if (!rs) { add(rbx(1.42, 0.035, 0.3, 0.012), paint, 0, 1.07, -2.02, 0.1); for (const x of [-0.4, 0.4]) add(rbx(0.04, 0.1, 0.12, 0.01), M.black, x, 1.02, -2.0); }
    else {
      add(rbx(1.74, 0.04, 0.44, 0.015), M.carbon, 0, 1.4, -1.98, 0.12); for (const s of [-1, 1]) add(rbx(0.02, 0.18, 0.5, 0.008), M.carbon, s * 0.87, 1.37, -1.98);
      for (const x of [-0.32, 0.32]) { add(rbx(0.03, 0.42, 0.06, 0.01), M.carbon, x, 1.22, -1.86, -0.5); add(rbx(0.03, 0.05, 0.18, 0.01), M.carbon, x, 1.43, -1.88); }
      for (const s of [-1, 1]) add(onTop(P, [[s * 0.1, 1.45], [s * 0.34, 1.45], [s * 0.32, 1.68], [s * 0.12, 1.68]], 0.004), M.matte);
    }
    add(rbx(1.3, 0.13, 0.2, 0.03), M.black, 0, 0.24, zr + 0.14); for (let k = -3; k <= 3; k++) add(rbx(0.016, 0.1, 0.24, 0.004), M.black, k * 0.17, 0.2, zr + 0.18);
    if (!rs) for (const s of [-1, 1]) { add(rbx(0.2, 0.08, 0.1, 0.03), M.chrome, s * 0.42, 0.3, zr + 0.08); add(rbx(0.17, 0.055, 0.02, 0.02), M.matte, s * 0.42, 0.3, zr + 0.03); }
    else for (const x of [-0.08, 0.08]) { add(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 16).rotateX(Math.PI / 2), M.chrome, x, 0.4, zr + 0.06); add(new THREE.CircleGeometry(0.045, 16), M.matte, x, 0.4, zr - 0.001, 0, Math.PI); }
    add(new THREE.PlaneGeometry(0.5, 0.12), K.plate, 0, 0.6, zr - 0.006, 0, Math.PI).castShadow = false;
    // The front: the middle intake under the nose, a splitter.
    tuck(K, -0.36, 0.36, 0.25, 0.37, P.zf - 0.4, P.zf - 0.02, M.mesh); add(rbx(1.5, 0.02, 0.18, 0.008), M.black, 0, 0.2, P.zf - 0.12);
    K.glows({ head: [[0.64, 0.8, 2.15]], tail: [[0.6, 0.925, zr - 0.06]] });
  },
});

// TAURINO FURIA: a wedge, one line from the tip of the nose up the windscreen to the roof; Y-shaped lamps, intakes like caves behind the doors, louvres
// over the engine, a black grille right across a square tail with the exhaust in the middle like a nut, and a wing.
B.furia = c => ({
  P: prof({
    zf: 2.4, zr: -2.4, noseR: 0.14, tailR: 0.06, endW: 0.84, endH: 0.5, tailW: 0.94, tailH: 0.86, archR: 0.43, archLift: 0.95,
    top: [[-2.4, 0.86], [-2.25, 0.93], [-1.9, 0.97], [-1.4, 1.0], [-0.9, 1.06], [-0.45, 1.12], [-0.15, 1.135], [0.15, 1.08], [0.5, 0.96], [0.85, 0.83], [1.1, 0.76], [1.5, 0.71], [1.95, 0.63], [2.25, 0.5], [2.4, 0.38]],
    half: [[-2.4, 0.94], [-2.15, 1.0], [-1.6, 1.015], [-1.05, 1.0], [-0.5, 0.965], [0.2, 0.95], [0.9, 0.985], [1.4, 1.0], [1.95, 0.97], [2.25, 0.9], [2.4, 0.82]],
    topHalf: [[-2.4, 0.84], [-1.9, 0.82], [-1.35, 0.7], [-0.85, 0.62], [-0.35, 0.58], [0.25, 0.62], [0.75, 0.74], [1.2, 0.84], [1.8, 0.88], [2.4, 0.74]],
    shoulder: [[-2.4, 0.82], [-2.0, 0.87], [-1.4, 0.88], [-0.9, 0.86], [-0.3, 0.8], [0.4, 0.73], [1.1, 0.7], [1.7, 0.65], [2.1, 0.55], [2.4, 0.38]],
    bottom: [[-2.4, 0.3], [-2.15, 0.18], [-1.7, 0.12], [1.85, 0.12], [2.25, 0.16], [2.4, 0.22]],
    isGlass(b, z) { return (b >= 11 && z > -0.1 && z < 0.95) || (b >= 8 && b <= 10 && z > -0.72 + (b - 8) * 0.06 && z < 0.62 - (b - 8) * 0.16); },
  }, c.dims),
  wheels: { f: { w: 0.26, style: 'y5', rim: 'dark', cal: 0xff6a10 }, r: { w: 0.34 } },
  screen: 0.95, exhaust: [0, 0.56],
  dress(K) {
    const { add, M, paint, P, mir } = K, zr = P.zr, zf = P.zf;
    mir(s => {
      // The lamps: a dark lens laid in the corner of the nose, with a Y of light in it and the lamp at its fork.
      add(onTop(P, [[s * 0.4, 2.02], [s * 0.86, 1.92], [s * 0.82, 2.2], [s * 0.48, 2.25]], 0.004), M.black);
      add(onTop(P, band([[s * 0.46, 2.19], [s * 0.64, 2.1], [s * 0.82, 1.98]], 0.02), 0.007), M.drl);
      add(onTop(P, band([[s * 0.64, 2.1], [s * 0.72, 2.2]], 0.018), 0.007), M.drl);
      add(onTop(P, ellipse(s * 0.56, 2.08, 0.04, 0.03), 0.008), M.head);
      // Big intakes in the nose's corners (tucked under it), the splitter's ends.
      tuck(K, s > 0 ? 0.36 : -0.86, s > 0 ? 0.86 : -0.36, 0.17, 0.34, zf - 0.45, zf - 0.08);
      // The side: a cave of an intake behind the door, the scoop on the shoulder over it, the door's shut lines, a mirror on an arm, the sill.
      add(onSide(P, [[-0.5, 0.3], [-1.12, 0.28], [-1.08, 0.78], [-0.62, 0.6]], s, 0.004), M.matte);
      add(onSide(P, [[-0.95, 0.86], [-1.45, 0.86], [-1.42, 0.92], [-1.0, 0.92]], s, 0.004), M.matte);
      add(onSide(P, band([[0.55, 0.3], [0.58, 0.7]], 0.01), s, 0.003), M.black); add(onSide(P, band([[-0.48, 0.32], [-0.48, 0.78]], 0.01), s, 0.003), M.black);
      add(rbx(0.16, 0.07, 0.12, 0.03), paint, s * 1.06, 0.92, 0.35, 0, s * 0.1); add(rbx(0.12, 0.025, 0.03, 0.01), M.black, s * 0.97, 0.88, 0.37);
      add(rbx(0.05, 0.12, 1.9, 0.02), M.carbon, s * (P.half(0) - 0.02), 0.2, -0.05);
      // The tail: a Y of red at each corner round the end of the black grille.
      add(rbx(0.36, 0.035, 0.03, 0.01), K.tail, s * 0.62, 0.82, zr - 0.01, 0, 0, s * -0.18); add(rbx(0.2, 0.03, 0.03, 0.01), K.tail, s * 0.74, 0.72, zr - 0.012, 0, 0, s * 0.7);
      add(onSide(P, band([[-2.2, 0.83], [-2.37, 0.8]], 0.035), s, 0.004), K.tail);
    });
    // The front: a carbon splitter and a middle intake.
    add(rbx(1.7, 0.025, 0.22, 0.008), M.carbon, 0, 0.16, zf - 0.13); tuck(K, -0.28, 0.28, 0.2, 0.3, zf - 0.4, zf - 0.04);
    // Over the engine: louvres in two banks, and the scoop at the back of the roof.
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const z = -1.0 - k * 0.15, w2 = 0.17 - Math.abs(k - 2.5) * 0.025; add(onTop(P, band([[s * (0.3 - w2), z], [s * (0.3 + w2), z]], 0.045), 0.005), M.black); }
    add(onTop(P, [[-0.26, -0.42], [0.26, -0.42], [0.22, -0.7], [-0.22, -0.7]], 0.005), M.matte);
    // The back: the black grille right across, the diffuser's fins, the hexagonal exhaust and the wing.
    add(endPlate([[-0.82, 0.36], [0.82, 0.36], [0.8, 0.78], [-0.8, 0.78]], -1, zr - 0.006), M.mesh);
    for (let k = -4; k <= 4; k++) add(rbx(0.016, 0.12, 0.32, 0.004), M.carbon, k * 0.17, 0.24, zr + 0.17);
    add(rbx(1.7, 0.03, 0.4, 0.012), M.carbon, 0, 0.19, zr + 0.24);
    const ex = add(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 6).rotateX(Math.PI / 2), M.chrome, 0, 0.56, zr - 0.03); ex.rotation.z = Math.PI / 6;
    add(new THREE.CircleGeometry(0.105, 6), M.matte, 0, 0.56, zr - 0.091, 0, Math.PI, Math.PI / 6);
    add(rbx(1.62, 0.03, 0.3, 0.01), M.carbon, 0, 1.03, -2.12, 0.08); for (const x of [-0.5, 0.5]) add(rbx(0.03, 0.1, 0.14, 0.01), M.carbon, x, 0.97, -2.1);
    add(new THREE.PlaneGeometry(0.45, 0.11), K.plate, 0, 0.3, zr - 0.006, 0, Math.PI).castShadow = false;
    K.glows({ head: [[0.62, 0.52, 2.26]], tail: [[0.66, 0.8, zr - 0.08]] });
  },
});

// HALCYON S8: a teardrop canopy on a low body, deep black sockets for the lamps running down into the intakes, channels for air in the doors and over the
// hips, slim blades of light across the tail over a black mesh, the exhausts set high, and an air brake across the back.
B.halcyon = c => ({
  P: prof({
    zf: 2.27, zr: -2.27, noseR: 0.2, tailR: 0.08, endW: 0.82, endH: 0.56, tailW: 0.92, tailH: 0.84, archR: 0.41, archLift: 0.96,
    top: [[-2.27, 0.94], [-2.15, 0.99], [-1.8, 1.01], [-1.35, 1.04], [-0.95, 1.1], [-0.5, 1.17], [-0.15, 1.2], [0.2, 1.16], [0.55, 1.03], [0.85, 0.9], [1.1, 0.83], [1.5, 0.77], [1.9, 0.68], [2.15, 0.55], [2.27, 0.42]],
    half: [[-2.27, 0.9], [-2.0, 0.95], [-1.45, 0.965], [-0.9, 0.94], [-0.3, 0.9], [0.5, 0.9], [1.2, 0.94], [1.8, 0.93], [2.15, 0.87], [2.27, 0.8]],
    topHalf: [[-2.27, 0.8], [-1.8, 0.7], [-1.3, 0.6], [-0.8, 0.55], [-0.2, 0.55], [0.4, 0.6], [0.9, 0.76], [1.5, 0.82], [2.27, 0.7]],
    shoulder: [[-2.27, 0.86], [-1.9, 0.88], [-1.3, 0.86], [-0.6, 0.8], [0.2, 0.76], [1.0, 0.74], [1.6, 0.7], [2.0, 0.62], [2.27, 0.42]],
    bottom: [[-2.27, 0.3], [-2.0, 0.17], [-1.6, 0.12], [1.8, 0.12], [2.15, 0.16], [2.27, 0.22]],
    isGlass(b, z) { return (b >= 11 && z > 0.05 && z < 0.92) || (b >= 11 && z > -1.3 && z < -0.78) || (b >= 8 && b <= 10 && z > -0.95 + (b - 8) * 0.1 && z < 0.7 - (b - 8) * 0.15); },
  }, c.dims),
  wheels: { f: { w: 0.255, style: 'ten', rim: 'dark', cal: 0xff6a10 }, r: { w: 0.32 } },
  screen: 0.92, exhaust: [0.12, 0.74],
  dress(K) {
    const { add, M, paint, P, mir } = K, zr = P.zr, zf = P.zf;
    mir(s => {
      // The eye sockets: a black recess laid on the nose, a blade of light along its top edge and a lamp in it; the intake it runs down into.
      add(onTop(P, [[s * 0.42, 1.98], [s * 0.8, 1.9], [s * 0.78, 2.16], [s * 0.5, 2.22]], 0.004), M.matte);
      add(onTop(P, band([[s * 0.44, 1.99], [s * 0.79, 1.92]], 0.022), 0.007), M.drl);
      add(onTop(P, ellipse(s * 0.62, 2.07, 0.05, 0.035), 0.008), M.head);
      tuck(K, s > 0 ? 0.46 : -0.82, s > 0 ? 0.82 : -0.46, 0.2, 0.4, zf - 0.42, zf - 0.1);
      // The door's channel, the air over the hips, the mirror on its arm, the sill.
      add(onSide(P, [[0.78, 0.3], [0.05, 0.28], [0.22, 0.62], [0.74, 0.56]], s, 0.004), M.matte);
      add(onTop(P, [[s * 0.6, -0.85], [s * 0.74, -0.9], [s * 0.76, -1.62], [s * 0.62, -1.62]], 0.006), M.matte);
      add(rbx(0.15, 0.06, 0.11, 0.025), paint, s * 1.02, 0.94, 0.42, 0, s * 0.1); add(rbx(0.1, 0.02, 0.025, 0.008), M.black, s * 0.94, 0.9, 0.44);
      add(rbx(0.05, 0.1, 1.85, 0.02), M.carbon, s * (P.half(0) - 0.02), 0.19, -0.02);
      // Blades of light across the tail, wrapping round its corners.
      add(rbx(0.62, 0.022, 0.03, 0.008), K.tail, s * 0.42, 0.9, zr - 0.006, 0, 0, s * -0.06);
      add(onSide(P, band([[-2.12, 0.88], [-2.26, 0.9]], 0.024), s, 0.004), K.tail);
    });
    // The front splitter and the middle intake.
    add(rbx(1.6, 0.025, 0.22, 0.008), M.carbon, 0, 0.16, zf - 0.13); tuck(K, -0.3, 0.3, 0.2, 0.3, zf - 0.4, zf - 0.04, M.mesh);
    // The back: a black mesh over most of it, the two round exhausts set high, the air brake, the diffuser.
    add(endPlate([[-0.82, 0.32], [0.82, 0.32], [0.8, 0.84], [-0.8, 0.84]], -1, zr - 0.004), M.mesh);
    for (const x of [-0.12, 0.12]) { add(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 18).rotateX(Math.PI / 2), M.chrome, x, 0.74, zr - 0.02); add(new THREE.CircleGeometry(0.05, 18), M.matte, x, 0.74, zr - 0.091, 0, Math.PI); }
    add(rbx(1.66, 0.035, 0.34, 0.012), M.carbon, 0, 1.0, -2.08, 0.18);
    for (let k = -4; k <= 4; k++) add(rbx(0.016, 0.12, 0.3, 0.004), M.carbon, k * 0.16, 0.24, zr + 0.16);
    add(new THREE.PlaneGeometry(0.45, 0.11), K.plate, 0, 0.46, zr - 0.008, 0, Math.PI).castShadow = false;
    K.glows({ head: [[0.62, 0.58, 2.2]], tail: [[0.42, 0.9, zr - 0.08]] });
  },
});

// KAISER BERGWAGEN: a box. Upright glass, flat sides, a roof with gutters, round lamps either side of a grille of upright chrome bars, indicators standing
// on the wings, flared arches, steps along the sills, exhausts out of the sides, hinges on the doors and the spare wheel hung on the back door.
B.bergwagen = c => ({
  P: prof({
    zf: 2.43, zr: -2.25, noseR: 0.05, tailR: 0.04, endW: 0.96, endH: 0.96, archR: 0.47, archLift: 0.92,
    top: [[-2.25, 1.86], [-2.2, 1.93], [-2.0, 1.95], [0.45, 1.96], [0.56, 1.93], [0.62, 1.8], [0.72, 1.42], [0.78, 1.28], [0.95, 1.22], [2.2, 1.18], [2.35, 1.14], [2.43, 1.08]],
    half: [[-2.25, 0.95], [-2.15, 0.965], [2.3, 0.965], [2.43, 0.95]],
    topHalf: [[-2.25, 0.9], [0.5, 0.89], [0.8, 0.91], [2.43, 0.92]],
    shoulder: [[-2.25, 1.2], [-1.0, 1.22], [0.6, 1.24], [0.9, 1.21], [2.2, 1.19], [2.43, 1.1]],
    bottom: [[-2.25, 0.52], [-2.0, 0.44], [2.1, 0.44], [2.43, 0.52]],
    isGlass(b, z) { return (b >= 11 && z > 0.58 && z < 0.77) || (b >= 8 && b <= 10 && ((z > -0.32 && z < 0.55) || (z > -1.28 && z < -0.46) || (z > -2.08 && z < -1.4))); },
  }, c.dims),
  wheels: { f: { w: 0.29, style: 'g5', rim: 'dark', cal: 0xc41e1e, rimK: 0.66 }, r: { w: 0.29 } },
  screen: 0.78, exhaust: [0.98, 0.38],
  dress(K) {
    const { add, M, paint, P, mir } = K, zr = P.zr, zf = P.zf;
    mir(s => {
      // Round lamps with a ring of light, indicators on the wings, the fog lamps in the bumper.
      add(new THREE.TorusGeometry(0.115, 0.016, 10, 32), M.chrome, s * 0.68, 1.0, zf + 0.004); add(new THREE.CircleGeometry(0.11, 28), M.black, s * 0.68, 1.0, zf + 0.002);
      add(new THREE.TorusGeometry(0.085, 0.008, 8, 28), M.drl, s * 0.68, 1.0, zf + 0.008); add(new THREE.CircleGeometry(0.045, 18), M.head, s * 0.68, 1.0, zf + 0.006);
      add(new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M.lens, s * 0.68, 1.0, zf + 0.003).scale.set(1, 1, 0.4);
      add(rbx(0.14, 0.06, 0.12, 0.02), M.black, s * 0.78, 1.205, 2.28); add(rbx(0.12, 0.04, 0.1, 0.015), M.amber, s * 0.78, 1.24, 2.29);
      add(new THREE.CircleGeometry(0.04, 14), M.drl, s * 0.66, 0.52, zf + 0.165);
      // Flared arches, the protective strip, the step, the side exhausts, the hinges, the gutter, the mirror, the handles.
      for (const wz of [P.wzf, P.wzr]) add(rbx(0.08, 0.11, 1.0, 0.03), M.rubber, s * (P.half(wz) + 0.02), 0.92, wz);
      add(rbx(0.03, 0.05, 4.3, 0.015), M.rubber, s * (P.half(0) + 0.012), 0.86, 0.05);
      add(rbx(0.22, 0.04, 1.62, 0.015), M.black, s * (P.half(0) - 0.02), 0.42, 0.05); add(rbx(0.2, 0.015, 1.55, 0.006), M.alu, s * (P.half(0) - 0.02), 0.446, 0.05);
      for (const dz of [0, -0.12]) add(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 14).rotateZ(Math.PI / 2), M.chrome, s * (P.half(0) + 0.03), 0.37, -0.75 + dz);
      for (const z of [0.56, -0.43]) for (const y of [0.78, 1.12]) add(rbx(0.03, 0.08, 0.06, 0.01), M.black, s * (P.half(z) + 0.012), y, z);
      add(rbx(0.025, 0.02, 2.75, 0.006), M.black, s * (P.topHalf(-0.8) + 0.01), 1.92, -0.8);
      add(rbx(0.24, 0.17, 0.09, 0.03), paint, s * 1.08, 1.34, 0.6, 0, s * 0.08); add(rbx(0.16, 0.03, 0.05, 0.01), M.black, s * 1.0, 1.29, 0.6);
      for (const z of [0.2, -0.7]) add(rbx(0.012, 0.025, 0.14, 0.006), M.chrome, s * (P.half(z) + 0.012), 1.12, z);
      // The tail lamps, tall in the back corners.
      add(rbx(0.14, 0.3, 0.05, 0.015), K.tail, s * 0.84, 1.02, zr - 0.012); add(rbx(0.15, 0.32, 0.03, 0.015), M.redLens, s * 0.84, 1.02, zr - 0.03);
    });
    // The grille: a black panel with upright chrome bars, framed in chrome; the bumper and the skid plate under it.
    add(rbx(0.92, 0.32, 0.04, 0.012), M.black, 0, 0.98, zf + 0.0); for (let k = -6; k <= 6; k++) add(rbx(0.014, 0.28, 0.02, 0.005), M.chrome, k * 0.065, 0.98, zf + 0.025);
    add(rbx(0.96, 0.025, 0.03, 0.01), M.chrome, 0, 1.14, zf + 0.02); add(rbx(0.96, 0.025, 0.03, 0.01), M.chrome, 0, 0.82, zf + 0.02);
    add(rbx(1.94, 0.22, 0.2, 0.05), M.black, 0, 0.6, zf + 0.06); add(rbx(1.0, 0.05, 0.3, 0.02), M.alu, 0, 0.44, zf + 0.0);
    // The windscreen's frame and wipers; the back door: its window, the spare wheel and its cover, a step bumper.
    add(rbx(1.8, 0.04, 0.05, 0.015), M.black, 0, 1.27, 0.8); for (const x of [-0.32, 0.32]) add(rbx(0.5, 0.012, 0.02, 0.004), M.black, x, 1.3, 0.79, -1.2);
    add(endPlate([[-0.74, 1.4], [0.74, 1.4], [0.72, 1.86], [-0.72, 1.86]], -1, zr - 0.004), M.glass);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.26, 28).rotateX(Math.PI / 2), M.tyre, 0, 1.0, zr - 0.17);
    add(new THREE.CylinderGeometry(0.36, 0.36, 0.27, 28).rotateX(Math.PI / 2), M.rims.dark, 0, 1.0, zr - 0.172);
    add(new THREE.CylinderGeometry(0.405, 0.405, 0.04, 28).rotateX(Math.PI / 2), M.black, 0, 1.0, zr - 0.31);
    add(rbx(1.94, 0.2, 0.2, 0.05), M.black, 0, 0.58, zr - 0.04);
    add(new THREE.PlaneGeometry(0.5, 0.12), K.plate, 0, 0.75, zr - 0.006, 0, Math.PI).castShadow = false;
    K.glows({ head: [[0.68, 1.0, zf + 0.06]], tail: [[0.84, 1.02, zr - 0.08]] });
  },
});

// ASHWORTH SOVEREIGN: a limousine. A tall chrome grille standing up at the front like a temple's, slim lamps either side, a long bonnet, a high waist with
// chrome along it and round the windows, a formal roof over a short boot, tall lamps at the back.
B.sovereign = c => ({
  P: prof({
    zf: 2.88, zr: -2.88, noseR: 0.1, tailR: 0.16, endW: 0.93, endH: 0.9, archR: 0.46, archLift: 0.93,
    top: [[-2.88, 1.0], [-2.78, 1.07], [-2.4, 1.12], [-1.9, 1.14], [-1.6, 1.2], [-1.35, 1.42], [-1.1, 1.6], [-0.6, 1.66], [0.3, 1.66], [0.7, 1.58], [0.95, 1.45], [1.25, 1.24], [1.45, 1.18], [2.0, 1.165], [2.5, 1.15], [2.75, 1.13], [2.88, 1.05]],
    half: [[-2.88, 0.93], [-2.7, 0.99], [-2.0, 1.01], [0, 1.01], [2.0, 1.0], [2.7, 0.98], [2.88, 0.94]],
    topHalf: [[-2.88, 0.9], [-1.7, 0.9], [-1.4, 0.8], [-1.0, 0.76], [0.3, 0.77], [0.8, 0.8], [1.3, 0.92], [2.88, 0.92]],
    shoulder: [[-2.88, 0.98], [-2.6, 1.06], [-1.8, 1.1], [-0.5, 1.09], [0.8, 1.1], [1.5, 1.12], [2.4, 1.12], [2.75, 1.09], [2.88, 1.02]],
    bottom: [[-2.88, 0.4], [-2.6, 0.27], [-2.2, 0.22], [2.3, 0.22], [2.7, 0.27], [2.88, 0.36]],
    isGlass(b, z) { return (b >= 11 && z > 0.74 && z < 1.3) || (b >= 11 && z > -1.5 && z < -1.14) || (b >= 8 && b <= 10 && ((z > 0.06 && z < 1.05 - (b - 8) * 0.17) || (z > -1.25 + (b - 8) * 0.06 && z < -0.06))); },
  }, c.dims),
  wheels: { f: { w: 0.27, style: 'multi', rim: 'chrome', cal: 0x2a2c30, rimK: 0.72 }, r: { w: 0.29 } },
  screen: 1.3, exhaust: [0.45, 0.28], classic: true,
  dress(K) {
    const { add, M, paint, P, mir } = K, zr = P.zr, zf = P.zf;
    // The grille: a tall chrome frame leaning back a touch, dark behind, with polished vanes; a chrome line back along the middle of the bonnet.
    const g = new THREE.Group(); g.position.set(0, 0.88, zf + 0.03); g.rotation.x = -0.05; K.body.add(g);
    add(rbx(0.86, 0.5, 0.05, 0.01), M.black, 0, 0, -0.01, 0, 0, 0, g);
    for (let k = -8; k <= 8; k++) add(rbx(0.016, 0.46, 0.04, 0.005), M.chrome, k * 0.048, 0, 0.012, 0, 0, 0, g);
    add(rbx(0.96, 0.06, 0.09, 0.02), M.chrome, 0, 0.27, 0.0, 0, 0, 0, g); add(rbx(0.96, 0.05, 0.08, 0.02), M.chrome, 0, -0.265, 0.0, 0, 0, 0, g);
    for (const s of [-1, 1]) add(rbx(0.06, 0.6, 0.09, 0.02), M.chrome, s * 0.46, 0, 0.0, 0, 0, 0, g);
    mergeByMaterial(g); add(onTop(P, band([[0, 1.5], [0, 2.8]], 0.04), 0.004), M.chrome);
    mir(s => {
      // Slim lamps in a chrome surround, a strip of light under each; lamps in the bumper.
      add(rbx(0.42, 0.1, 0.06, 0.02), M.chrome, s * 0.72, 0.98, zf - 0.05, 0, s * 0.18); add(rbx(0.38, 0.07, 0.03, 0.015), M.black, s * 0.72, 0.98, zf - 0.02, 0, s * 0.18);
      add(new THREE.CircleGeometry(0.03, 14), M.head, s * 0.64, 0.98, zf - 0.003, 0, s * 0.18); add(new THREE.CircleGeometry(0.03, 14), M.head, s * 0.8, 0.98, zf - 0.02, 0, s * 0.18);
      add(rbx(0.36, 0.012, 0.02, 0.005), M.drl, s * 0.72, 0.915, zf - 0.025, 0, s * 0.18);
      add(new THREE.CircleGeometry(0.045, 16), M.drl, s * 0.66, 0.46, zf + 0.0);
      // Chrome: the waistline, round the windows, the sill, the door handles; the coachline; the doors' lines (the back ones hinged at the back); the mirror.
      add(onSide(P, band([[-2.4, P.shoulder(0) + 0.005], [2.5, P.shoulder(0) + 0.015]], 0.018), s, 0.004), M.chrome);
      add(rbx(0.012, 0.012, 2.25, 0.004), M.chrome, s * (P.topHalf(0) + 0.012), 1.56, -0.1);
      add(onSide(P, band([[-1.6, 0.3], [1.45, 0.3]], 0.06), s, 0.004), M.chrome);
      for (const z of [0.85, -0.25]) add(rbx(0.016, 0.03, 0.18, 0.01), M.chrome, s * (P.half(z) + 0.01), 1.02, z);
      add(onSide(P, band([[-2.6, 0.94], [2.6, 0.95]], 0.008), s, 0.004), M.alu);
      for (const z of [0.0, 1.1, -1.3]) add(onSide(P, band([[z, 0.36], [z, 1.06]], 0.01), s, 0.003), M.black);
      add(rbx(0.24, 0.12, 0.14, 0.05), paint, s * 1.1, 1.28, 1.0, 0, s * 0.1); add(rbx(0.14, 0.04, 0.06, 0.015), M.chrome, s * 1.0, 1.23, 1.0);
      // Tall tail lamps in the back corners, the exhaust.
      add(rbx(0.14, 0.3, 0.05, 0.02), K.tail, s * 0.8, 0.88, zr + 0.07, 0, s * 0.35); add(rbx(0.15, 0.32, 0.03, 0.02), M.redLens, s * 0.8, 0.88, zr + 0.05, 0, s * 0.35);
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 16).rotateX(Math.PI / 2), M.chrome, s * 0.45, 0.28, zr + 0.08);
    });
    // The bumper's chrome blade and lower intake; the boot's chrome strip and the plate.
    add(rbx(1.4, 0.04, 0.05, 0.015), M.chrome, 0, 0.42, zf + 0.01); add(rbx(1.1, 0.1, 0.04, 0.02), M.mesh, 0, 0.32, zf + 0.0);
    add(rbx(1.3, 0.03, 0.04, 0.012), M.chrome, 0, 0.86, zr + 0.005);
    add(new THREE.PlaneGeometry(0.52, 0.12), K.plate, 0, 0.62, zr - 0.006, 0, Math.PI).castShadow = false;
    K.glows({ head: [[0.72, 0.98, zf + 0.04]], tail: [[0.8, 0.88, zr - 0.05]] });
  },
});

// DELORME VITESSE 16: a hypercar. A tall oval grille in the middle of the nose, four small lamps a side, a fin along the spine, a sweep of polished metal
// round each side behind the door, one light right across the tail, four exhausts in the middle of it and a wing that lies flat.
B.vitesse = c => ({
  P: prof({
    zf: 2.27, zr: -2.27, noseR: 0.24, tailR: 0.12, endW: 0.8, endH: 0.6, tailW: 0.92, tailH: 0.84, archR: 0.43, archLift: 0.95,
    top: [[-2.27, 0.96], [-2.1, 1.02], [-1.7, 1.05], [-1.25, 1.08], [-0.8, 1.14], [-0.4, 1.2], [-0.05, 1.21], [0.3, 1.15], [0.62, 1.0], [0.92, 0.88], [1.3, 0.82], [1.75, 0.75], [2.05, 0.66], [2.27, 0.5]],
    half: [[-2.27, 0.94], [-2.0, 1.0], [-1.45, 1.02], [-0.85, 0.99], [-0.2, 0.955], [0.6, 0.965], [1.3, 1.0], [1.85, 0.98], [2.15, 0.9], [2.27, 0.84]],
    topHalf: [[-2.27, 0.86], [-1.8, 0.8], [-1.25, 0.68], [-0.7, 0.58], [-0.1, 0.56], [0.45, 0.62], [0.95, 0.8], [1.5, 0.86], [2.27, 0.74]],
    shoulder: [[-2.27, 0.9], [-1.9, 0.93], [-1.3, 0.92], [-0.6, 0.86], [0.3, 0.79], [1.1, 0.78], [1.7, 0.74], [2.05, 0.66], [2.27, 0.48]],
    bottom: [[-2.27, 0.3], [-2.0, 0.18], [-1.6, 0.12], [1.8, 0.12], [2.15, 0.16], [2.27, 0.24]],
    isGlass(b, z) { return (b >= 11 && z > 0.02 && z < 0.96) || (b >= 8 && b <= 10 && z > -0.82 + (b - 8) * 0.08 && z < 0.64 - (b - 8) * 0.14); },
  }, c.dims),
  wheels: { f: { w: 0.27, style: 'turbine', rim: 'silver', cal: 0x1d4fd0, lock: true }, r: { w: 0.35 } },
  screen: 0.96, exhaust: [0.08, 0.5],
  dress(K) {
    const { add, M, paint, P, mir } = K, zr = P.zr, zf = P.zf;
    // The oval grille, tall, chrome round a dark mesh, standing at the front of the nose; the fin along the spine.
    const ring = add(new THREE.TorusGeometry(0.15, 0.02, 10, 40), M.chrome, 0, 0.44, zf - 0.005); ring.scale.set(1, 1.45, 1);
    add(new THREE.CircleGeometry(0.15, 32), M.mesh, 0, 0.44, zf - 0.008).scale.set(1, 1.45, 1);
    tuck(K, -0.14, 0.14, 0.24, 0.64, zf - 0.3, zf - 0.02, M.mesh);
    add(onTop(P, band([[0, 0.18], [0, -2.05]], 0.045), 0.018), paint);
    mir(s => {
      // Four little lamps a side in a dark housing laid on the nose; big intakes below.
      add(onTop(P, [[s * 0.4, 2.0], [s * 0.82, 1.92], [s * 0.78, 2.12], [s * 0.44, 2.18]], 0.004), M.black);
      for (let i = 0; i < 4; i++) add(onTop(P, ellipse(s * (0.47 + i * 0.085), 2.1 - i * 0.04, 0.03, 0.02), 0.008), i % 2 ? M.drl : M.head);
      tuck(K, s > 0 ? 0.24 : -0.82, s > 0 ? 0.82 : -0.24, 0.17, 0.4, zf - 0.5, zf - 0.12);
      // The sweep of polished metal round the side: down behind the door from the roof, back along the sill; a black intake inside it.
      const pts = [[-0.62, 1.05], [-0.92, 0.95], [-1.06, 0.72], [-1.0, 0.46], [-0.82, 0.3], [-0.2, 0.25], [0.5, 0.28], [0.8, 0.34]].map(([z, y]) => new THREE.Vector3(s * (sideX(P, z, y) + 0.014), y, z));
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.026, 8), M.chrome);
      add(onSide(P, [[-0.64, 0.42], [-0.96, 0.5], [-0.98, 0.78], [-0.72, 0.88]], s, 0.004), M.matte);
      add(rbx(0.16, 0.06, 0.12, 0.025), paint, s * 1.05, 0.95, 0.4, 0, s * 0.1); add(rbx(0.1, 0.02, 0.025, 0.008), M.black, s * 0.97, 0.91, 0.42);
      add(rbx(0.05, 0.1, 1.9, 0.02), M.carbon, s * (P.half(0) - 0.02), 0.19, -0.02);
      add(onSide(P, band([[-2.08, 0.86], [-2.25, 0.86]], 0.03), s, 0.004), K.tail);
    });
    // The single light across the tail, a black panel under it, the four exhausts, the diffuser and the wing lying flat.
    add(rbx(1.46, 0.03, 0.03, 0.01), K.tail, 0, 0.86, zr - 0.008); add(rbx(1.52, 0.06, 0.03, 0.01), M.redLens, 0, 0.86, zr - 0.0);
    add(endPlate([[-0.78, 0.34], [0.78, 0.34], [0.76, 0.8], [-0.76, 0.8]], -1, zr - 0.004), M.mesh);
    for (const x of [-0.24, -0.08, 0.08, 0.24]) { add(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 18).rotateX(Math.PI / 2), M.chrome, x, 0.5, zr - 0.02); add(new THREE.CircleGeometry(0.045, 18), M.matte, x, 0.5, zr - 0.081, 0, Math.PI); }
    for (let k = -4; k <= 4; k++) add(rbx(0.016, 0.12, 0.32, 0.004), M.carbon, k * 0.17, 0.24, zr + 0.17);
    add(rbx(1.56, 0.03, 0.34, 0.01), M.carbon, 0, 1.06, -2.0, 0.03);
    add(new THREE.PlaneGeometry(0.45, 0.11), K.plate, 0, 0.26, zr - 0.006, 0, Math.PI).castShadow = false;
    K.glows({ head: [[0.6, 0.62, 2.16]], tail: [[0.55, 0.86, zr - 0.06]] });
  },
});

const BUILD = { r9turbo: c => B.r9(c, false), r9rs: c => B.r9(c, true), furia: B.furia, halcyon: B.halcyon, bergwagen: B.bergwagen, sovereign: B.sovereign, vitesse: B.vitesse };
let _plate = null, _glow = null;

// ---- Putting a car together ---------------------------------------------------------------------------------------------------------------------------
// id: a car of marque-specs.js; paintKey: one of MPAINTS; display: a car to look at (the showroom's, the forecourt's), with a plain dark cabin instead
// of the cockpit. Returns the root group, its userData in the shape main.js reads (body, wheels, paint, tail, glows, cockpit, dims, cgOff...).
export function makeMarque(id, paintKey, { display = false } = {}) {
  const c = CAR_BY_ID[id]; if (!c) throw new Error('no such car: ' + id);
  const def = BUILD[id](c), P = def.P, M = shared(), D = c.dims, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = paintMat(paintKey || c.paints[0]);
  const tail = new THREE.MeshStandardMaterial({ color: 0x400404, emissive: 0xff2208, emissiveIntensity: 3.2, roughness: 0.3 });
  _plate = _plate || new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.5 }); M.all.add(_plate);
  const bodyGeo = loft(P, stationsFor(P, 84, 8)), shell = new THREE.Mesh(bodyGeo, [paint, M.glass]); shell.castShadow = true; shell.receiveShadow = true; shell.name = 'shell'; body.add(shell);
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  const glowAt = { head: [], tail: [] };
  const K = { add, M, paint, tail, plate: _plate, P, body, mir: fn => { fn(-1); fn(1); }, glows: g => { glowAt.head = g.head || []; glowAt.tail = g.tail || []; } };
  def.dress(K);
  // The arch liners hide the inside of the body; the contact shadow.
  for (const wz of [D.wzf, D.wzr]) { const hw = Math.min(sideX(P, wz + P.archR, D.wheelR + P.archR * 0.6), sideX(P, wz - P.archR, D.wheelR + P.archR * 0.6)) - 0.03, lin = new THREE.Mesh(new THREE.CylinderGeometry(P.archR, P.archR, hw * 2, 28, 1, true, -0.5, Math.PI + 1.0).rotateZ(Math.PI / 2), M.liner); lin.position.set(0, D.wheelR, wz); body.add(lin); }
  const cs = new THREE.Mesh(new THREE.PlaneGeometry(D.width + 0.7, D.len + 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: carShadowTex(), transparent: true, depthWrite: false })); cs.position.y = 0.02; cs.renderOrder = 2; cs.name = 'contact'; root.add(cs);
  // The exhaust's flame (none of these has nitro: it stays out) and the lamps' glows.
  const glow = _glow || (_glow = glowTex()), tailGlow = [], headGlow = [];
  const sprite = (col, op, x, y, z, sx, sy) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending })); sp.position.set(x, y, z); sp.scale.set(sx, sy, 1); body.add(sp); return sp; };
  for (const [x, y, z] of glowAt.tail) for (const s of [-1, 1]) tailGlow.push(sprite(0xff2a10, 0.5, s * x, y, z, 0.8, 0.45));
  for (const [x, y, z] of glowAt.head) for (const s of [-1, 1]) headGlow.push(sprite(0xe6eeff, 0.42, s * x, y, z, 0.7, 0.4));
  const flame = sprite(0x5aa8ff, 0, 0, def.exhaust[1], P.zr - 0.3, 0.5, 0.4); flame.visible = false;
  // Wheels: a hub that steers at each corner, with the wheel in it that rolls (the disc and the caliper stay with the hub).
  const wheels = [];
  for (const [wz, front] of [[D.wzf, true], [D.wzr, false]]) for (const s of [-1, 1]) {
    const o = { r: D.wheelR, ...def.wheels.f, ...(front ? {} : def.wheels.r) };
    const steer = new THREE.Group(); steer.position.set(s * D.track / 2, D.wheelR, wz); root.add(steer);
    const w = makeWheel(o, s, M); steer.add(w.spin); steer.add(w.disc); steer.add(w.caliper); w.spin.traverse(m => { m.castShadow = true; });
    wheels.push({ steer, spin: w.spin, front, side: s, baseY: D.wheelR });
  }
  mergeByMaterial(body, shell); for (const w of wheels) mergeByMaterial(w.spin);
  if (display) {
    // A car on show never rolls: its four wheels (tyres, rims, discs, calipers) are merged into one mesh a material, a handful of draws instead of thirty.
    const still = new THREE.Group(); root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    for (const w of wheels) { w.steer.traverse(o => { if (o.isMesh) { const c = o.clone(); c.matrix.copy(inv).multiply(o.matrixWorld); c.matrix.decompose(c.position, c.quaternion, c.scale); still.add(c); } }); root.remove(w.steer); }
    mergeByMaterial(still); still.children.forEach(m => { m.castShadow = true; }); still.name = 'wheels'; root.add(still);
    for (const w of wheels) w.steer.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  // Inside: the dark lining of the shell (else you would see out through the roof), and either the cockpit or a plain cabin.
  const lining = new THREE.Mesh(bodyGeo, [M.lining, new THREE.MeshBasicMaterial({ visible: false })]); lining.name = 'lining'; lining.scale.set(0.985, 0.99, 0.995); body.add(lining);
  const scZ = def.screen, scY = sec(P, scZ).yt, eyeHalf = P.half(scZ - 1.2);
  let cockpit = null, eye;
  if (!display) {
    // The game's cockpit (cockpit.js), moved so its dashboard meets the foot of the windscreen, and narrowed to the cabin.
    const cp = cockpit = buildCockpit(body, bodyGeo, def.classic ? 'classic' : 'modern'), g = cp.group; g.name = 'cockpit';
    const inner = g.children.find(o => Array.isArray(o.material)); if (inner) g.remove(inner);
    const dashTop = def.classic ? [0.88, 0.935] : [0.96, 0.845], sx = Math.min(1, (eyeHalf - 0.05) / 0.95);
    const ox = 0, oy = scY - 0.03 - dashTop[1], oz = scZ - dashTop[0];
    g.scale.x = sx; g.position.set(ox, oy, oz);
    const at = v => v.set(v.x * sx + ox, v.y + oy, v.z + oz); at(cp.eye); at(cp.seat.hip); eye = cp.eye;
  } else {
    // A plain cabin to see through the glass: two seats and a dashboard.
    const dy = scY - 0.88, cab = new THREE.Group(); cab.name = 'cabin'; body.add(cab);
    const sz = scZ - 1.4;
    for (const x of [-0.37, 0.37]) { add(rbx(0.46, 0.13, 0.52, 0.04), M.cabin, x, 0.36 + dy * 0.6, sz, 0, 0, 0, cab); add(rbx(0.46, 0.62, 0.13, 0.05), M.cabin, x, 0.74 + dy * 0.6, sz - 0.3, -0.25, 0, 0, cab); }
    add(rbx(eyeHalf * 2 - 0.2, 0.2, 0.5, 0.05), def.classic ? M.wood : M.cabin, 0, scY - 0.14, scZ - 0.3, 0, 0, 0, cab);
    mergeByMaterial(cab); eye = new THREE.Vector3(0.37, scY + 0.2, scZ - 1.25);
  }
  const cg = D.wzr + (D.wzf - D.wzr) * c.phys.cgAt;
  root.userData = {
    body, wheels, paint, paintKey: paintKey || c.paints[0], tail, tailGlow, headGlow, flame, cockpit, marque: id,
    dims: { wzf: D.wzf, wzr: D.wzr, track: D.track, wheelR: D.wheelR, len: D.len, width: D.width }, cgOff: -cg, beamZ: P.zf - 0.6,
    hoodCam: [0, eye.y + 0.06, eye.z + 0.75], bumperCam: [0, 0.5, P.zf + 0.12], muzzleZ: P.zf + 0.2,
  };
  return root;
}

// Take one apart: its own geometry, its paint and lamp materials, its cockpit's (the shared materials stay).
export function disposeMarque(root) {
  const M = shared(); root.parent && root.parent.remove(root);
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) if (!M.all.has(m) && m !== _plate) { for (const k of ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'emissiveMap']) if (m[k] && m[k] !== _glow && m[k] !== carShadowTex()) m[k].dispose(); m.dispose(); }
  });
}
