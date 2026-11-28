// The insides of every other building (main.js: walk up to any wall and face it): not places to rob, but to look round, and big. An office tower's lobby
// five storeys high with a gallery round it, a loft flat over two floors, a family house, a department store with a supermarket, a hotel's grand lobby,
// a cinema, the cathedral's nave, a warehouse. Each is made from its venue's seed, so the same building always has the same inside. People in them are
// set out as spots (visit.js): sitting (at desks, on sofas, in seats and pews), standing, or walking a route round the floor (and up the stairs).
import * as THREE from 'three';
import { C } from './interior.js';
import { SCAN_MODELS } from './scans.js';
import { kit, plant, glassBox, leafGeom, LEAF_GREENS } from './rooms.js';

// The footprint of a kit's rectangle in room metres (for a solid footprint under a scanned piece).
const rectOf = (K, u0, w0, u1, w1) => { const [ax, az] = K.P(u0, w0), [bx, bz] = K.P(u1, w1); return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)]; };
// ---- Furniture and fittings ------------------------------------------------------------------------------------------------------------------------------
const OAK = C(0xffffff), STONE = C(0xeeebe4), GRAPH = C(0x2a2d32), STEEL = C(0xb9bec4), BLACK = C(0x151618), BRASS = C(0xc9a24a);
// A sofa for someone facing f, w wide; returns where its sitters go ([x, z] in room metres).
// (With the scans loaded, the sofas and chairs are the scanned leather sofa and upholstered chair, put in the same places: interior.js scanFurniture.)
function sofa(R, x, z, f, w, col) {
  const K = kit(R, x, z, f), c2 = col.clone().multiplyScalar(1.12);
  if (SCAN_MODELS.sofa) {
    (R.scanned.sofa || (R.scanned.sofa = [])).push({ x, z, f, sx: w / 1.8, y: R.lift, col }); { const [x0, z0, x1, z1] = rectOf(K, -w / 2, -0.45, w / 2, 0.45); R.boxes.push({ x0: R.ox + x0, x1: R.ox + x1, z0: R.oz + z0, z1: R.oz + z1, y0: R.oy + R.lift, y1: R.oy + R.lift + 0.75 }); }
    const out = []; for (let k = 0; k < Math.max(1, Math.floor(w / 0.75)); k++) out.push(K.P(-w / 2 + 0.5 + k * (w - 1) / Math.max(1, Math.floor(w / 0.75) - 1 || 1), 0.02));
    return out;
  }
  K.box('prop', -w / 2, -0.45, w / 2, 0.45, 0.08, 0.4, col, true);
  K.box('prop', -w / 2 + 0.14, -0.26, w / 2 - 0.14, 0.44, 0.4, 0.52, c2);
  K.box('prop', -w / 2, -0.47, w / 2, -0.24, 0.4, 0.92, col);
  for (const s of [-1, 1]) K.box('prop', s > 0 ? w / 2 - 0.16 : -w / 2, -0.45, s > 0 ? w / 2 : -w / 2 + 0.16, 0.45, 0.4, 0.66, col);
  for (const [u, v] of [[-w / 2 + 0.08, -0.38], [w / 2 - 0.08, -0.38], [-w / 2 + 0.08, 0.38], [w / 2 - 0.08, 0.38]]) K.box('metal', u - 0.03, v - 0.03, u + 0.03, v + 0.03, 0, 0.08, GRAPH);
  const out = []; for (let k = 0; k < Math.max(1, Math.floor(w / 0.75)); k++) out.push(K.P(-w / 2 + 0.5 + k * (w - 1) / Math.max(1, Math.floor(w / 0.75) - 1 || 1), 0.02));
  return out;
}
function chair(R, x, z, f, col, metal = GRAPH) {
  const K = kit(R, x, z, f);
  if (SCAN_MODELS.chair) { (R.scanned.chair || (R.scanned.chair = [])).push({ x, z, f, sx: 1, y: R.lift, col }); R.circs.push({ x: R.ox + x, z: R.oz + z, r: 0.28, y0: R.oy + R.lift, y1: R.oy + R.lift + 0.9 }); return; }
  K.box('prop', -0.22, -0.22, 0.22, 0.22, 0.42, 0.48, col); K.box('prop', -0.22, -0.26, 0.22, -0.2, 0.48, 0.92, col);
  for (const [u, v] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) K.box('metal', u - 0.015, v - 0.015, u + 0.015, v + 0.015, 0, 0.42, metal);
  R.circs.push({ x: R.ox + x, z: R.oz + z, r: 0.28, y0: R.oy + R.lift, y1: R.oy + R.lift + 0.9 });
}
function table(R, x0, z0, x1, z1, h, top, leg = GRAPH, kind = 'wood') {
  R.box(kind, x0, z0, x1, z1, h - 0.04, h, top, true);
  for (const [x, z] of [[x0 + 0.06, z0 + 0.06], [x1 - 0.06, z0 + 0.06], [x0 + 0.06, z1 - 0.06], [x1 - 0.06, z1 - 0.06]]) R.box('metal', x - 0.025, z - 0.025, x + 0.025, z + 0.025, 0, h - 0.04, leg);
}
function roundTable(R, x, z, r, h, top) { R.drum('wood', x, z, r, h - 0.04, h, top, true, 20); R.drum('metal', x, z, 0.04, 0, h - 0.04, GRAPH, false, 8); R.drum('metal', x, z, 0.24, 0, 0.03, GRAPH, false, 14); }
// A picture that glows (a television, a cinema screen, a monitor), x0..x1 / z0..z1 along a line, facing (fx, fz).
function screen(R, x0, z0, x1, z1, y0, y1, fx, fz, k = 1) {
  const U = [x1 - x0, 0, z1 - z0], V = [0, y1 - y0, 0], nx = U[1] * V[2] - U[2] * V[1], nz = U[0] * V[1] - U[1] * V[0], c = new THREE.Color(k, k, k);
  const y = R.oy + R.lift + y0; if (nx * fx + nz * fz >= 0) R.gb.screen.quad([R.ox + x0, y, R.oz + z0], U, V, 0, 0, 1, 1, c); else R.gb.screen.quad([R.ox + x1, y, R.oz + z1], [-U[0], 0, -U[2]], V, 0, 0, 1, 1, c);
}
// A desk with a monitor and a keyboard, the chair before it; returns where its sitter goes and which way they face.
function desk(R, x, z, f, col = OAK) {
  const K = kit(R, x, z, f);
  K.box('wood', -0.8, -0.35, 0.8, 0.4, 0.7, 0.74, col, true); for (const u of [-0.76, 0.76]) K.box('metal', u - 0.02, -0.33, u + 0.02, 0.38, 0, 0.7, GRAPH);
  K.box('prop', -0.32, 0.2, 0.32, 0.24, 0.84, 1.18, BLACK); K.box('metal', -0.03, 0.24, 0.03, 0.3, 0.74, 0.86, GRAPH);
  const [a, b] = [K.P(-0.29, 0.195), K.P(0.29, 0.195)]; screen(R, a[0], a[1], b[0], b[1], 0.87, 1.15, -Math.sin(f), -Math.cos(f), 0.9);
  K.box('prop', -0.22, -0.12, 0.22, 0.04, 0.74, 0.755, C(0x2a2a2c));
  const c = K.P(0, -0.62); chair(R, c[0], c[1], f, C(0x2c2e33));
  return c;
}
function bed(R, x, z, f, w = 1.8) {
  const K = kit(R, x, z, f);
  K.box('wood', -w / 2 - 0.05, -1.05, w / 2 + 0.05, 1.05, 0, 0.32, OAK, true); K.box('prop', -w / 2, -1.0, w / 2, 1.0, 0.32, 0.55, C(0xf2f0ea));
  K.box('prop', -w / 2 + 0.02, -0.6, w / 2 - 0.02, 1.0, 0.55, 0.6, C(0x6a7f94)); K.box('wood', -w / 2 - 0.05, 1.0, w / 2 + 0.05, 1.08, 0, 1.15, C(0x9a7a5a));
  for (const s of [-1, 1]) K.box('prop', s * w / 4 - 0.33, 0.62, s * w / 4 + 0.33, 0.92, 0.55, 0.7, C(0xfafaf6));
}
function rug(R, x0, z0, x1, z1, col) { R.box('prop', x0, z0, x1, z1, 0, 0.012, col); R.box('prop', x0 + 0.15, z0 + 0.15, x1 - 0.15, z1 - 0.15, 0.012, 0.014, col.clone().multiplyScalar(1.25)); }
function shelfUnit(R, x0, z0, x1, z1, h, fx, fz, col = OAK) {           // shelves against a wall, full of books and things, facing (fx, fz)
  R.box('wood', x0, z0, x1, z1, 0, h, col, true);
  const along = Math.abs(x1 - x0) > Math.abs(z1 - z0), fo = 0.005;
  if (along) R.goods(x0 + 0.05, fz > 0 ? z1 + fo : z0 - fo, x1 - 0.05, fz > 0 ? z1 + fo : z0 - fo, 0.1, h - 0.1, fx, fz, 'books');
  else R.goods(fx > 0 ? x1 + fo : x0 - fo, z0 + 0.05, fx > 0 ? x1 + fo : x0 - fo, z1 - 0.05, 0.1, h - 0.1, fx, fz, 'books');
}
function pendant(R, x, z, y, r, col, H) { R.box('metal', x - 0.006, z - 0.006, x + 0.006, z + 0.006, y + 0.2, H, BLACK); R.drum('prop', x, z, r, y + 0.12, y + 0.2, GRAPH, false, 16); R.drum('emit', x, z, r * 0.9, y, y + 0.12, col, false, 16); }
// An indoor tree in a big planter: a trunk, and a crown of long leaves all round the top of it.
function tree(R, x, z, h, planter = C(0x5c5f63)) {
  R.box('prop', x - 0.7, z - 0.7, x + 0.7, z + 0.7, 0, 0.7, planter, true); R.box('prop', x - 0.62, z - 0.62, x + 0.62, z + 0.62, 0.7, 0.71, C(0x2a2018));
  R.drum('wood', x, z, 0.1, 0.7, h * 0.7, C(0x8a6a4a), false, 10);
  const leaves = R.plantLeaves || (R.plantLeaves = []), n = 46;
  for (let k = 0; k < n; k++) {
    const r1 = (Math.sin(x * 3.1 + k * 2.7) + 1) / 2, r2 = (Math.sin(z * 1.7 + k * 4.3) + 1) / 2, L = 0.6 + 0.6 * r1, g = leafGeom(L, 0.16 + 0.1 * r2, 0.5 + 0.4 * r2);
    g.rotateX(-(0.4 + 1.6 * (k / n))); g.rotateY(k * 2.39996); g.translate(R.ox + x, R.oy + h * 0.66 + 0.4 * r2, R.oz + z);
    const c = LEAF_GREENS[k % 4], a = g.attributes.color; for (let i = 0; i < a.count; i++) a.setXYZ(i, a.getX(i) * c.r, a.getY(i) * c.g, a.getZ(i) * c.b);
    leaves.push(g);
  }
}
// A window in a wall: daylight (a glowing panel) between mullions, on the inside face of wall `side` ('front' z=0, 'back' z=D, 'left' x=-W/2, 'right' x=W/2), a0..a1 along it.
function windowIn(R, side, a0, a1, y0, y1, mull = 1.5, frame = GRAPH, k = 1.8) {
  const W = R.W, D = R.D, day = C(0xd8ecff).multiplyScalar(k);
  const at = (a, o, y0b, y1b, col, kind, w = 0.04) => {
    if (side === 'front') R.box(kind, a - w, -0.02 + o, a + w, 0.03 + o, y0b, y1b, col); else if (side === 'back') R.box(kind, a - w, D - 0.03 - o, a + w, D + 0.02 - o, y0b, y1b, col);
    else if (side === 'left') R.box(kind, -W / 2 - 0.02 + o, a - w, -W / 2 + 0.03 + o, a + w, y0b, y1b, col); else R.box(kind, W / 2 - 0.03 - o, a - w, W / 2 + 0.02 - o, a + w, y0b, y1b, col);
  };
  if (side === 'front') R.box('emit', a0, -0.02, a1, 0.0, y0, y1, day); else if (side === 'back') R.box('emit', a0, D, a1, D + 0.02, y0, y1, day);
  else if (side === 'left') R.box('emit', -W / 2 - 0.02, a0, -W / 2, a1, y0, y1, day); else R.box('emit', W / 2, a0, W / 2 + 0.02, a1, y0, y1, day);
  const n = Math.max(1, Math.round((a1 - a0) / mull)); for (let i = 0; i <= n; i++) at(a0 + (a1 - a0) * i / n, 0.005, y0 - 0.04, y1 + 0.04, frame, 'metal');
  for (const y of [y0 - 0.06, y1]) { if (side === 'front') R.box('metal', a0, -0.01, a1, 0.06, y, y + 0.06, frame); else if (side === 'back') R.box('metal', a0, D - 0.06, a1, D + 0.01, y, y + 0.06, frame); else if (side === 'left') R.box('metal', -W / 2 - 0.01, a0, -W / 2 + 0.06, a1, y, y + 0.06, frame); else R.box('metal', W / 2 - 0.06, a0, W / 2 + 0.01, a1, y, y + 0.06, frame); }
}
// A raised floor (a gallery, a mezzanine): its slab, the underside with lights in it, the deck to walk on, and columns under it.
function gallery(R, x0, z0, x1, z1, h, top = C(0xeeebe4), cols = []) {
  R.box('prop', x0, z0, x1, z1, h - 0.3, h, top); R.gb.ceil.ceil(R.ox + x0, R.oz + z0, R.ox + x1, R.oz + z1, R.oy + h - 0.3, 4, C(0xf4f2ee));
  R.deck(x0, z0, x1, z1, h);
  for (const [x, z] of cols) R.drum('prop', x, z, 0.28, 0, h - 0.3, C(0xf0eee8), true, 18);
  const along = x1 - x0 > z1 - z0, n = Math.max(1, Math.round((along ? x1 - x0 : z1 - z0) / 4));
  for (let k = 0; k < n; k++) { const f = (k + 0.5) / n; if (along) R.panel(x0 + (x1 - x0) * f, (z0 + z1) / 2, 1.2, 0.18, h - 0.3, C(0xfff4e2), 3); else R.panel((x0 + x1) / 2, z0 + (z1 - z0) * f, 0.18, 1.2, h - 0.3, C(0xfff4e2), 3); }
}
function glassPanel(R, x0, z0, x1, z1, y0, y1, frame = GRAPH, solid = true) {
  glassBox(R, x0, z0, x1, z1, y0, y1); if (solid) R.block(x0, z0, x1, z1, y0, y1);
  for (const y of [y0, y1 - 0.05]) R.box('metal', x0 - 0.01, z0 - 0.01, x1 + 0.01, z1 + 0.01, y, y + 0.05, frame);
}
const people = (R, list) => { for (const [role, x, z, face, o] of list) R.spot(role, x, z, face, o || {}); };

// ---- An office tower's lobby: 56 m by 40, eighteen high; a gallery round three sides at 6 m (a grand stair up to it, desks and a meeting room on it) and
// another at 12; a curtain wall of glass at the front; reception, security gates, a bank of six lifts, a café, sofas, trees, pendant lights.
function office(R, v, rnd) {
  const W = 56, D = 40, H = 18, G1 = 6, G2 = 12, wall = C(0xf2f0ec);
  R.shell(W, D, H, { floor: C(0xffffff), floorS: 4, wall, trim: C(0x9a9ea4), ceil: C(0xf4f2ee) });
  // The curtain wall: glass the whole height of the front, bar the door.
  windowIn(R, 'front', -27.6, -1.4, 0.3, 17.4, 2.2); windowIn(R, 'front', 1.4, 27.6, 0.3, 17.4, 2.2); windowIn(R, 'front', -1.4, 1.4, 2.9, 17.4, 1.4);
  for (const y of [G1, G2]) R.box('metal', -W / 2, 0.0, W / 2, 0.25, y - 0.3, y, C(0xd8dadc));
  // Galleries: left and right (6 m deep) and along the back (7 m), at 6 m and at 12 m, on columns.
  for (const h of [G1, G2]) {
    const top = h === G1 ? C(0xe6e2da) : C(0xdedad2);
    gallery(R, -W / 2, 3, -W / 2 + 6, D - 7, h, top, h === G1 ? [[-W / 2 + 6, 8], [-W / 2 + 6, 16], [-W / 2 + 6, 24]] : []);
    gallery(R, W / 2 - 6, 3, W / 2, D - 7, h, top, h === G1 ? [[W / 2 - 6, 8], [W / 2 - 6, 16], [W / 2 - 6, 24]] : []);
    gallery(R, -W / 2, D - 7, W / 2, D, h, top, h === G1 ? [[-14, D - 7], [-5, D - 7], [5, D - 7], [14, D - 7]] : []);
    if (h === G1) { R.rail(-W / 2 + 6, 3, -W / 2 + 6, 12, h, STEEL, true); R.rail(-W / 2 + 6, 29, -W / 2 + 6, D - 7, h, STEEL, true); }          // (a gap where the stair comes up)
    else R.rail(-W / 2 + 6, 3, -W / 2 + 6, D - 7, h, STEEL, true);
    R.rail(W / 2 - 6, 3, W / 2 - 6, D - 7, h, STEEL, true); R.rail(-W / 2 + 6, D - 7, W / 2 - 6, D - 7, h, STEEL, true);
    R.rail(-W / 2, 3, -W / 2 + 6, 3, h, STEEL, true); R.rail(W / 2 - 6, 3, W / 2, 3, h, STEEL, true);
  }
  // The grand stair, up the left side of the floor to the first gallery (it lands on the gallery's edge).
  R.stairs(-W / 2 + 6.2, 12, -W / 2 + 8.6, 26, '+z', 0, G1, 'prop', C(0xe8e4dc), 'ab', STEEL);
  R.box('prop', -W / 2 + 6, 26, -W / 2 + 8.6, 29, G1 - 0.3, G1, C(0xe6e2da)); R.deck(-W / 2 + 6, 26, -W / 2 + 8.6, 29, G1); R.rail(-W / 2 + 8.6, 26, -W / 2 + 8.6, 29, G1, STEEL, true); R.rail(-W / 2 + 6, 29, -W / 2 + 8.6, 29, G1, STEEL, true);
  // Reception: a long desk of stone and oak, a lit wall behind with the company's mark, two receptionists.
  R.box('wood', -6, 9, 6, 10.2, 0, 1.05, C(0x8a6a4a), true); R.box('prop', -6.1, 8.9, 6.1, 10.3, 1.05, 1.12, STONE);
  for (const x of [-3.5, 0, 3.5]) { R.box('prop', x - 0.3, 9.9, x + 0.3, 10.0, 1.12, 1.45, BLACK); screen(R, x - 0.27, 9.89, x + 0.27, 9.89, 1.15, 1.42, 0, -1, 0.8); }
  R.box('prop', -7, 13.2, 7, 13.6, 0, 5.5, C(0x2a2b2f), true); R.box('emit', -4, 13.18, 4, 13.2, 2.4, 3.6, C(0xf4f0e0).multiplyScalar(1.6)); R.box('emit', -1, 13.17, 1, 13.18, 2.6, 3.4, C(0x2a6fb0).multiplyScalar(1.4));
  people(R, [['recep', -2.5, 11.0, Math.PI], ['recep', 2.5, 11.0, Math.PI]]);
  // Security gates: a row of glass speed gates with posts, between reception and the lifts, a guard beside them.
  for (let k = 0; k < 6; k++) { const x = -7.5 + k * 3; R.box('metal', x - 0.12, 17.6, x + 0.12, 19.0, 0, 1.0, STEEL, true); R.box('emit', x - 0.1, 17.58, x + 0.1, 17.6, 0.8, 0.95, C(0x5dff8a).multiplyScalar(1.5)); if (k < 5) glassBox(R, x + 0.12, 18.25, x + 1.2, 18.3, 0.3, 1.0); }
  people(R, [['guard', 10.5, 18.3, -Math.PI / 2, { key: 'agent' }]]);
  // The lifts: six steel doors along the back under the gallery, a number over each.
  R.lifts = []; for (let k = 0; k < 6; k++) R.lifts.push([-12.5 + k * 5, D - 1.0]);          // (where you stand to call one: visit.js; a tower with a helipad, roofs.js, goes up to the roof)
  for (let k = 0; k < 6; k++) { const x = -12.5 + k * 5; R.box('prop', x - 1.3, D - 0.1, x + 1.3, D, 0, 3.2, C(0x8a8d92)); R.box('metal', x - 0.95, D - 0.14, x - 0.01, D - 0.1, 0.0, 2.6, C(0xc6cbd0)); R.box('metal', x + 0.01, D - 0.14, x + 0.95, D - 0.1, 0.0, 2.6, C(0xc6cbd0)); R.box('emit', x - 0.25, D - 0.12, x + 0.25, D - 0.1, 2.8, 3.0, C(0xffa040).multiplyScalar(1.6)); R.box('metal', x + 1.4, D - 0.13, x + 1.52, D - 0.1, 1.0, 1.3, STEEL); }
  // The café, front right: a counter, a menu board, tables and chairs.
  R.box('wood', 14, 6, 22, 7, 0, 1.08, OAK, true); R.box('prop', 13.95, 5.95, 22.05, 7.05, 1.08, 1.12, STONE); R.box('metal', 20.5, 6.2, 21.3, 6.9, 1.12, 1.6, STEEL);
  R.box('prop', 14, 3.05, 22, 3.1, 2.4, 3.6, BLACK); for (let k = 0; k < 5; k++) R.box('emit', 14.4, 3.1, 21.6 - (k % 2) * 2, 3.11, 3.3 - k * 0.2, 3.32 - k * 0.2, C(0xf4efe0).multiplyScalar(1.3));
  for (const [x, z] of [[14.5, 10.5], [18, 10.5], [14.5, 14], [18, 14], [21.2, 12.2]]) { roundTable(R, x, z, 0.4, 0.74, OAK); chair(R, x - 0.7, z, Math.PI / 2, C(0x3c5a6a)); chair(R, x + 0.7, z, -Math.PI / 2, C(0x3c5a6a)); }
  people(R, [['barista', 18, 5.2, 0], ['cafe', 14.5 - 0.7, 10.5, Math.PI / 2, { sit: 'sit', seat: 0.48 }], ['cafe', 18 + 0.7, 14, -Math.PI / 2, { sit: 'sit', seat: 0.48 }]]);
  // Sofas round low tables, front left, and trees in planters through the lobby.
  for (const [x, z] of [[-16, 8], [-16, 16]]) {
    rug(R, x - 3.4, z - 2.4, x + 3.4, z + 2.4, C(0x4a5260));
    const a = sofa(R, x, z - 1.6, 0, 3.0, C(0x2c3e50)), b = sofa(R, x, z + 1.6, Math.PI, 3.0, C(0x2c3e50)); R.box('wood', x - 0.8, z - 0.5, x + 0.8, z + 0.5, 0, 0.42, C(0x7a5a3a), true);
    R.spot('visitor', a[0][0], a[0][1], 0, { sit: 'sofa', seat: 0.5 }); R.spot('visitor', b[1][0], b[1][1], Math.PI, { sit: 'sofa', seat: 0.5 });
  }
  for (const [x, z] of [[-9, 5], [9, 5], [-10, 24], [10, 24], [0, 24]]) tree(R, x, z, 6.5);
  // Big pendant lights hanging into the void, and the ceiling's light lines.
  for (const [x, z] of [[-8, 9], [8, 9], [-8, 20], [8, 20], [0, 15]]) pendant(R, x, z, 9, 1.0, C(0xfff2dc).multiplyScalar(2.4), H);
  for (const z of [6, 14, 22, 30]) R.panel(0, z, 30, 0.12, H, C(0xfff7ec), 4);
  // The first gallery is an office floor: desks along the left and right, a glass meeting room at the back, people at work.
  R.lift = G1;
  for (const side of [-1, 1]) for (let k = 0; k < 6; k++) {
    const z = 5 + k * 4.2, x = side * (W / 2 - 3.2);
    const at = desk(R, x, z, side < 0 ? Math.PI / 2 : -Math.PI / 2);
    if ((k + (side > 0 ? 1 : 0)) % 3 === 0) R.spot('worker', at[0], at[1], side < 0 ? Math.PI / 2 : -Math.PI / 2, { sit: 'desk', seat: 0.46, y: G1 });
  }
  for (const [x0, x1] of [[-6, 6]]) { glassPanel(R, x0, D - 6.6, x1, D - 6.5, G1, G1 + 3, GRAPH); glassPanel(R, x0, D - 6.6, x0 + 0.1, D - 0.1, G1, G1 + 3, GRAPH); glassPanel(R, x1 - 0.1, D - 6.6, x1, D - 0.1, G1, G1 + 3, GRAPH); }
  table(R, -3, D - 4.6, 3, D - 2.6, 0.75, OAK); for (let k = 0; k < 4; k++) { chair(R, -2.2 + k * 1.5, D - 5.1, 0, C(0x2c2e33)); chair(R, -2.2 + k * 1.5, D - 2.1, Math.PI, C(0x2c2e33)); }
  R.lift = 0;
  people(R, [['worker', -2.2, D - 5.1, 0, { sit: 'sit', seat: 0.46, y: G1 }], ['worker', 0.8, D - 2.1, Math.PI, { sit: 'sit', seat: 0.46, y: G1 }]]);
  // People crossing the lobby, and one walking up the stair and along the gallery.
  people(R, [['walker', 0, 4, 0, { route: [[0, 4], [-9, 7], [-9, 22], [-4, 30], [4, 30], [9, 22], [9, 7]] }], ['walker', 6, 22, 0, { route: [[6, 22], [-6, 22], [-6, 30], [6, 30]] }],
    ['walker', -20.6, 8, 0, { route: [[-20.6, 8], [-20.6, 11], [-20.6, 25.5], [-21, 27.5], [-23, 27.5], [-23, 6], [-23, 27.5], [-21, 27.5], [-20.6, 25.5], [-20.6, 11]] }]]);
  R.light(-12, 5, 10, 1.6); R.light(12, 5, 10, 1.6); R.light(0, 9, 24, 1.8); R.light(0, 14, 34, 1.5);
}

// ---- A loft flat: two floors in one, 30 m by 22, eight high: a wall of windows, a kitchen with an island, a long dining table, a sitting room round a big
// television, a library wall; a stair up the side to the sleeping gallery over the back (a bed, a desk, wardrobes) with a glass balustrade.
function flats(R, v, rnd) {
  const W = 30, D = 22, H = 8, M = 3.6, wall = C(0xf4f1ea);
  R.shell(W, D, H, { floor: C(0xffffff), floorS: 2.4, wall, trim: C(0x2a2c30), ceil: C(0xf6f4f0) });
  windowIn(R, 'right', 1, D - 1, 0.3, H - 0.4, 1.8); windowIn(R, 'front', 4, 14, 0.6, H - 0.4, 2.0); windowIn(R, 'front', -14, -4, 0.6, H - 0.4, 2.0);
  // A brick feature wall on the left.
  R.box('prop', -W / 2 + 0.01, 0.5, -W / 2 + 0.05, D - 0.5, 0, H, C(0x9a5a44)); for (let y = 0.12; y < H; y += 0.15) R.box('prop', -W / 2 + 0.05, 0.5, -W / 2 + 0.055, D - 0.5, y, y + 0.012, C(0xb8a898));
  // The kitchen: units along the back of the ground floor, an island with stools, pendants over it.
  R.box('wood', 2, D - 0.65, 13, D - 0.05, 0, 0.88, C(0x2f3a40), true); R.box('prop', 1.95, D - 0.7, 13.05, D - 0.02, 0.88, 0.92, STONE);
  R.box('wood', 2, D - 0.4, 13, D - 0.05, 1.45, 2.2, C(0x2f3a40)); R.box('metal', 6.5, D - 0.62, 7.4, D - 0.1, 0.92, 0.95, STEEL); R.box('metal', 9.4, D - 0.62, 10.4, D - 0.1, 0.92, 0.93, BLACK); R.box('metal', 13.1, D - 0.8, 14.2, D - 0.05, 0, 2.2, STEEL, true);
  R.box('wood', 5, D - 4.2, 10, D - 3.0, 0, 0.88, C(0x2f3a40), true); R.box('prop', 4.9, D - 4.3, 10.1, D - 2.9, 0.88, 0.94, STONE);
  for (let k = 0; k < 4; k++) { const x = 5.6 + k * 1.25; R.drum('metal', x, D - 4.75, 0.025, 0, 0.7, STEEL, false, 6); R.drum('prop', x, D - 4.75, 0.2, 0.7, 0.76, C(0x5a3a2a), true, 12); }
  for (let k = 0; k < 3; k++) pendant(R, 5.8 + k * 1.7, D - 3.6, 2.2, 0.18, C(0xffd9a0).multiplyScalar(2.2), H);
  // Dining: a long table under the windows, eight chairs.
  table(R, 6, 4.5, 11, 6.1, 0.75, C(0x7a5a3a)); for (let k = 0; k < 4; k++) { const x = 6.6 + k * 1.3; chair(R, x, 3.9, 0, C(0x222326)); chair(R, x, 6.7, Math.PI, C(0x222326)); }
  // Sitting room: a long sofa and two armchairs on a rug before a big television on the brick wall, a library of shelves.
  rug(R, -13, 4, -4, 12, C(0x8a7a62));
  const so = sofa(R, -6.5, 8, -Math.PI / 2, 3.4, C(0x5a6a5a)); sofa(R, -9.5, 4.8, 0, 1.0, C(0x8a4a3a)); sofa(R, -9.5, 11.2, Math.PI, 1.0, C(0x8a4a3a));
  R.box('wood', -10.3, 7.2, -8.7, 8.8, 0, 0.4, C(0x5a3a22), true);
  R.box('prop', -W / 2 + 0.06, 6, -W / 2 + 0.12, 10, 1.1, 3.4, BLACK); screen(R, -W / 2 + 0.125, 6.1, -W / 2 + 0.125, 9.9, 1.15, 3.35, 1, 0);
  R.box('wood', -W / 2 + 0.06, 5.5, -W / 2 + 0.6, 10.5, 0, 0.45, C(0x3a2a1c), true);
  shelfUnit(R, -6, D - 0.45, 0, D - 0.05, 3.2, 0, -1);
  R.spot('resident', so[1][0], so[1][1], -Math.PI / 2, { sit: 'sofa', seat: 0.5 }); R.spot('resident', 8.5, D - 1.4, 0);
  plant(R, -13.6, 1.6, 1.8); plant(R, 0, 2.2, 2.0); plant(R, 13.6, 1.6, 2.2);
  // The sleeping gallery over the back, and the stair up to it along the left wall.
  gallery(R, -W / 2, 14, W / 2 - 14, D, M, C(0xd8c8b0), [[-2, 14], [-8, 14]]);
  R.box('wood', -W / 2, 14, W / 2 - 14, D, M - 0.01, M, C(0xd8c8b0));
  R.rail(-W / 2 + 1.6, 14, W / 2 - 14, 14, M, STEEL, true); R.rail(W / 2 - 14, 14, W / 2 - 14, D, M, STEEL, true);
  R.stairs(-W / 2 + 0.1, 4, -W / 2 + 1.5, 14, '+z', 0, M, 'wood', C(0xd8c8b0), 'b', STEEL, true);
  R.lift = M; bed(R, -6, 18.5, Math.PI / 2); chair(R, -11, 20.8, Math.PI, C(0x2c2e33)); R.box('wood', -12, D - 0.8, -10, D - 0.1, 0, 0.74, OAK, true); R.lift = 0;
  R.box('wood', -2.5, D - 0.7, 1.5, D - 0.05, M, M + 2.4, C(0xe8e2d8)); R.block(-2.5, D - 0.7, 1.5, D - 0.05, M, M + 2.4);
  R.spot('resident', -4, 16, Math.PI, { y: M });
  R.light(-6, 6, 7, 1.4); R.light(6, 6, 8, 1.4); R.light(-5, M + 2.8, 18, 1.0); R.light(8, 3.2, 17, 1.2);
}

// ---- A family house, the ground floor: 30 m by 22, three and a half high, rooms off a hall: a sitting room with a fire, a kitchen and dining room across the
// back, a study, a playroom; oak floors, rugs, windows in every outside wall, a staircase in the hall.
function home(R, v, rnd) {
  const W = 30, D = 22, H = 3.4, wall = [C(0xf2ece0), C(0xe8eef0), C(0xf0e6dc)][(rnd() * 3) | 0];
  R.shell(W, D, H, { floor: C(0xffffff), floorS: 2.2, wall, trim: C(0xf6f4ee), ceil: C(0xf8f6f2) });
  for (const [s, a0, a1] of [['front', -13, -6], ['front', 6, 13], ['left', 3, 9], ['left', 13, 19], ['right', 3, 9], ['right', 13, 19], ['back', -12, -4], ['back', 4, 12]]) windowIn(R, s, a0, a1, 0.9, 2.6, 1.2, C(0xf2f2ee), 1.5);
  // Inner walls with doorways: the hall runs from the front door to the back; the sitting room and study either side at the front, the kitchen across the back.
  const iw = (x0, z0, x1, z1) => R.box('wall', x0, z0, x1, z1, 0, H, wall, true);
  iw(-3, 0, -2.85, 4.5); iw(-3, 6, -2.85, 12); iw(2.85, 0, 3, 4.5); iw(2.85, 6, 3, 12);                      // the hall's walls, a doorway each side
  iw(-W / 2, 12, -6, 12.15); iw(-4, 12, -2.85, 12.15); iw(2.85, 12, 4, 12.15); iw(6, 12, W / 2, 12.15);              // across the back, doorways into the kitchen
  // The staircase in the hall (to the floor above: as far as the landing).
  R.stairs(0.4, 3, 2.7, 9, '+z', 0, 2.2, 'wood', C(0xc8a87a), 'a', C(0xf4f2ec));
  R.box('wood', 0.4, 9, 2.85, 11.9, 2.0, 2.2, C(0xc8a87a)); R.deck(0.4, 9, 2.85, 11.9, 2.2); R.rail(0.4, 9, 0.4, 11.9, 2.2, C(0xf4f2ec));
  // The sitting room (front left): a fireplace with a fire, sofas, a rug, shelves, a television.
  R.box('prop', -W / 2 + 0.05, 4.5, -W / 2 + 0.6, 7.5, 0, 1.3, STONE, true); R.box('prop', -W / 2 + 0.05, 5.3, -W / 2 + 0.62, 6.7, 0.1, 0.8, BLACK); R.box('emit', -W / 2 + 0.3, 5.5, -W / 2 + 0.6, 6.5, 0.12, 0.5, C(0xff7a30).multiplyScalar(2.4));
  rug(R, -12, 2.5, -5, 9.5, C(0x7a3a3a));
  const s1 = sofa(R, -6.3, 6, -Math.PI / 2, 2.6, C(0x6a7a8a)); sofa(R, -9, 3.2, 0, 2.2, C(0x6a7a8a)); R.box('wood', -10, 5.2, -8.4, 6.8, 0, 0.42, C(0x5a3a22), true);
  shelfUnit(R, -12, 11.5, -6.5, 11.95, 2.4, 0, -1);
  R.box('prop', -10.5, 0.1, -7.5, 0.4, 0.5, 0.9, C(0x3a2a1c)); R.box('prop', -10.4, 0.25, -7.6, 0.3, 0.95, 2.1, BLACK); screen(R, -10.35, 0.31, -7.65, 0.31, 1.0, 2.05, 0, 1);
  R.spot('family', s1[1][0], s1[1][1], -Math.PI / 2, { sit: 'sofa', seat: 0.5 });
  // The study (front right): a desk, shelves, an armchair.
  const st = desk(R, 9, 2, 0); shelfUnit(R, 4, 11.5, 13, 11.95, 2.4, 0, -1); sofa(R, 12, 7, -Math.PI / 2, 1.0, C(0x6a4a2a)); rug(R, 6, 4, 13, 10, C(0x3a4a6a));
  R.spot('family', st[0], st[1], 0, { sit: 'desk', seat: 0.46 });
  // The kitchen and dining room across the back: units along the back wall, an island, a table for eight; a playroom corner.
  R.box('wood', -2, D - 0.65, 12, D - 0.05, 0, 0.88, C(0xe8e2d4), true); R.box('prop', -2.05, D - 0.7, 12.05, D - 0.02, 0.88, 0.92, C(0x3a3a3c));
  R.box('wood', -2, D - 0.4, 12, D - 0.05, 1.45, 2.3, C(0xe8e2d4)); R.box('metal', 12.1, D - 0.8, 13.2, D - 0.05, 0, 2.2, STEEL, true); R.box('metal', 4, D - 0.62, 4.9, D - 0.1, 0.92, 0.95, STEEL);
  R.box('wood', 2, 16.8, 7, 18, 0, 0.9, C(0xe8e2d4), true); R.box('prop', 1.95, 16.75, 7.05, 18.05, 0.9, 0.95, C(0x3a3a3c));
  for (let k = 0; k < 3; k++) pendant(R, 3 + k * 1.8, 17.4, 2.2, 0.16, C(0xffd9a0).multiplyScalar(2.2), H);
  table(R, -11, 15.5, -5, 17.5, 0.75, C(0x8a6a4a)); for (let k = 0; k < 4; k++) { chair(R, -10.3 + k * 1.5, 14.9, 0, C(0x3a2a1c)); chair(R, -10.3 + k * 1.5, 18.1, Math.PI, C(0x3a2a1c)); }
  R.spot('family', 5.5, D - 1.4, 0); R.spot('family', -8.8, 14.9, 0, { sit: 'sit', seat: 0.46 });
  rug(R, 9, 14, 14, 18, C(0x5a8a6a)); for (let k = 0; k < 6; k++) R.box('prop', 10 + (k % 3) * 1.1, 15 + ((k / 3) | 0) * 1.4, 10.4 + (k % 3) * 1.1, 15.4 + ((k / 3) | 0) * 1.4, 0.014, 0.25 + (k % 2) * 0.15, C([0xd23a3a, 0xe8c030, 0x3a78d2, 0x3aa860][k % 4]));
  plant(R, -1.8, 1.4, 1.5); plant(R, 1.8, 13, 1.5); plant(R, -13.8, 13, 1.8);
  for (const [x, z] of [[-9, 6], [9, 6], [0, 6], [-6, 17], [6, 17]]) { R.drum('prop', x, z, 0.3, H - 0.05, H, C(0xf6f4ee), false, 16); R.drum('emit', x, z, 0.26, H - 0.06, H - 0.05, C(0xfff2dc).multiplyScalar(2.6), false, 16); }
  R.light(-8, 3.0, 6, 1.0); R.light(8, 3.0, 6, 1.0); R.light(-6, 3.0, 17, 1.0); R.light(6, 3.0, 17, 1.0);
}

// ---- A department store and a supermarket under one roof: 64 m by 50, seven high. Tills across the front; on the right the supermarket (ten aisles of
// shelves, chiller cabinets along the back, fruit and vegetables, a bakery); on the left the store (rails of clothes, a wall of shoes, a wall of
// televisions, perfume counters).
function store(R, v, rnd) {
  const W = 64, D = 50, H = 7;
  R.shell(W, D, H, { floor: C(0xffffff), floorS: 2.4, wall: C(0xf2f2ee), trim: C(0x2a6a3a), ceil: C(0xf6f6f2) });
  windowIn(R, 'front', -31, -2, 0.4, 3.6, 2); windowIn(R, 'front', 2, 31, 0.4, 3.6, 2);
  // The tills: eight checkouts with belts and screens, across the front of the supermarket side.
  for (let k = 0; k < 8; k++) {
    const x = 3 + k * 3.4; R.box('prop', x - 0.4, 7, x + 0.4, 11, 0, 0.88, C(0xdedfe0), true); R.box('prop', x - 0.36, 7.4, x + 0.36, 10.4, 0.88, 0.9, BLACK);
    R.box('prop', x + 0.45, 9.6, x + 1.0, 10.4, 0, 1.0, C(0xdedfe0), true); R.box('prop', x + 0.55, 9.9, x + 0.9, 10.0, 1.0, 1.3, BLACK); screen(R, x + 0.57, 9.89, x + 0.88, 9.89, 1.03, 1.27, 0, -1, 0.7);
    R.box('metal', x - 0.05, 6.9, x + 0.05, 7.0, 0, 2.2, STEEL); R.box('emit', x - 0.2, 6.88, x + 0.2, 6.9, 2.0, 2.3, C(0x5dff8a).multiplyScalar(1.6));
    if (k % 2 === 0) R.spot('cashier', x + 0.75, 10.6, Math.PI, {});
  }
  // The supermarket's aisles: double-sided shelves of goods, a sign hanging over each aisle.
  for (let k = 0; k < 10; k++) {
    const x = 3.5 + k * 2.8; R.box('metal', x - 0.45, 14, x + 0.45, 40, 0, 2.1, C(0xc4c8cc), true); R.box('prop', x - 0.5, 13.95, x + 0.5, 40.05, 2.1, 2.16, C(0x2a6a3a));
    R.goods(x - 0.455, 14.1, x - 0.455, 39.9, 0.1, 2.0, -1, 0); R.goods(x + 0.455, 14.1, x + 0.455, 39.9, 0.1, 2.0, 1, 0);
    R.box('prop', x + 1.0, 26.8, x + 1.8, 27.2, 4.2, 4.8, C(0x2a6a3a)); R.box('emit', x + 1.05, 26.78, x + 1.75, 26.8, 4.3, 4.7, C(0xf4f4f0).multiplyScalar(1.2));
  }
  // Chiller cabinets along the back wall, glowing cold; fruit and vegetables in crates near the front; the bakery counter.
  for (let x = 2; x < W / 2 - 1; x += 3) { R.box('metal', x, D - 1.0, x + 2.9, D - 0.05, 0, 2.2, C(0xb4bcc4), true); R.box('emit', x + 0.1, D - 1.02, x + 2.8, D - 1.0, 0.2, 2.0, C(0xbfe8ff).multiplyScalar(1.3)); R.goods(x + 0.1, D - 1.03, x + 2.8, D - 1.03, 0.25, 1.9, 0, -1); }
  for (let k = 0; k < 4; k++) for (let m = 0; m < 2; m++) { const x0 = 4 + k * 6, z0 = 11.6 + m * 1.4; R.box('wood', x0, z0, x0 + 4.5, z0 + 1.1, 0, 0.7, C(0x9a7a5a), true); for (let c = 0; c < 6; c++) R.box('prop', x0 + 0.1 + c * 0.72, z0 + 0.1, x0 + 0.72 + c * 0.72, z0 + 1.0, 0.7, 0.85, C([0xd23a3a, 0xf0a020, 0x6ab030, 0xe8d040, 0x8a3a8a, 0xf06a30][(c + k + m) % 6])); }
  R.box('wood', W / 2 - 1.2, 14, W / 2 - 0.05, 30, 0, 1.0, C(0x8a6a4a), true); R.box('prop', W / 2 - 1.25, 13.95, W / 2 - 0.02, 30.05, 1.0, 1.05, STONE); R.goods(W / 2 - 1.21, 14.2, W / 2 - 1.21, 29.8, 1.05, 1.5, -1, 0);
  // The store: rails of clothes in rows, a wall of shoes, a wall of televisions, perfume counters with mirrors.
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
    const x = -28 + k * 6.5, z = 16 + r * 6; R.box('metal', x, z, x + 4.2, z + 0.04, 1.5, 1.54, STEEL); for (const xx of [x, x + 4.2]) R.box('metal', xx - 0.02, z - 0.02, xx + 0.02, z + 0.06, 0, 1.54, STEEL);
    for (let c = 0; c < 18; c++) { const cx = x + 0.15 + c * 0.22; R.box('prop', cx, z - 0.28, cx + 0.06, z + 0.32, 0.6 + (c % 3) * 0.1, 1.48, C([0x2a3a5a, 0xc23a3a, 0xe8e2d0, 0x3a5a3a, 0x1c1c1e, 0xd2a03a][(c + k * 2 + r) % 6])); }
    R.block(x, z - 0.3, x + 4.2, z + 0.34, 0, 1.6);
  }
  shelfUnit(R, -W / 2 + 0.05, 14, -W / 2 + 0.6, 40, 2.4, 1, 0, C(0xe8e4dc));
  for (let k = 0; k < 6; k++) for (let m = 0; m < 3; m++) { const x = -26 + k * 3.2; R.box('prop', x, D - 0.12, x + 2.9, D - 0.05, 0.7 + m * 1.7, 2.3 + m * 1.7, BLACK); screen(R, x + 0.05, D - 0.13, x + 2.85, D - 0.13, 0.75 + m * 1.7, 2.25 + m * 1.7, 0, -1, 0.95); }
  for (const x of [-20, -12]) { R.box('prop', x - 1.5, 8, x + 1.5, 9.2, 0, 1.0, STONE, true); R.box('emit', x - 1.45, 7.98, x + 1.45, 8.0, 0.2, 0.9, C(0xf4ead8).multiplyScalar(1.4)); glassBox(R, x - 1.5, 8, x + 1.5, 9.2, 1.0, 1.3); }
  // Shoppers, and staff.
  people(R, [['shopper', 6, 18, 0, { route: [[2, 13], [2, 42], [8.6, 42], [8.6, 13]] }], ['shopper', 20, 30, 0, { route: [[19.3, 13], [19.3, 42], [24.9, 42], [24.9, 13]] }],
    ['shopper', -18, 14, 0, { route: [[-18, 13], [-18, 42], [-8, 42], [-8, 13]] }], ['shopper', 0, 6, 0, { route: [[0, 5], [-24, 12], [-24, 44], [0, 44], [29, 44], [29, 12]] }],
    ['shopper', 11.5, 27, Math.PI / 2], ['shopper', -22, 28, -Math.PI / 2], ['staff', -16, 9.8, Math.PI], ['staff', W / 2 - 1.7, 22, -Math.PI / 2]]);
  for (let x = -28; x <= 28; x += 8) for (let z = 6; z < D; z += 8) R.panel(x, z, 3.2, 0.3, H, C(0xf8fbff), 3.4);
  R.light(-16, 6, 14, 1.6); R.light(16, 6, 14, 1.6); R.light(-16, 6, 36, 1.6); R.light(16, 6, 36, 1.6);
}

// ---- A grand hotel lobby: 48 m by 36, fourteen high: marble, two rows of columns, chandeliers, reception along the right, a bar on the left, sofas round
// rugs, a stair that splits up to a gallery across the back (lifts under it), a table of flowers in the middle.
function hotel(R, v, rnd) {
  const W = 48, D = 36, H = 14, G = 5.4, gold = BRASS;
  R.shell(W, D, H, { floor: C(0xffffff), floorS: 3.2, wall: C(0xf0e6d4), trim: C(0x5a3a22), ceil: C(0xf4ecdc) });
  windowIn(R, 'front', -22, -3, 0.5, 9, 1.6, C(0x5a3a22)); windowIn(R, 'front', 3, 22, 0.5, 9, 1.6, C(0x5a3a22));
  // Panelling round the walls up to 3 m, the columns.
  for (const [x0, z0, x1, z1] of [[-W / 2 + 0.01, 0.4, -W / 2 + 0.06, D - 0.4], [W / 2 - 0.06, 0.4, W / 2 - 0.01, D - 0.4]]) { R.box('wood', x0, z0, x1, z1, 0, 3.0, C(0x7a4a2a)); R.box('prop', x0 - 0.01, z0, x1 + 0.01, z1, 3.0, 3.1, gold); }
  for (const x of [-9, 9]) for (let z = 6; z < D - 7; z += 6) { R.drum('prop', x, z, 0.55, 0, H, C(0xefe8dc), true, 20); R.drum('prop', x, z, 0.72, 0, 0.5, C(0xd8ccb8), true, 20); R.drum('prop', x, z, 0.75, H - 0.8, H - 0.4, gold, false, 20); }
  // Chandeliers: tiers of light hanging on chains.
  for (const [x, z] of [[0, 9], [0, 20], [-16, 14], [16, 14]]) { R.box('metal', x - 0.01, z - 0.01, x + 0.01, z + 0.01, 8.8, H, gold); for (let t = 0; t < 3; t++) { R.drum('prop', x, z, 1.4 - t * 0.4, 7.6 + t * 0.5, 7.66 + t * 0.5, gold, false, 24); R.drum('emit', x, z, 1.3 - t * 0.4, 7.66 + t * 0.5, 7.9 + t * 0.5, C(0xfff0cc).multiplyScalar(2.6), false, 24); } }
  // Reception along the right wall.
  R.box('wood', W / 2 - 6, 8, W / 2 - 5, 22, 0, 1.1, C(0x5a3a22), true); R.box('prop', W / 2 - 6.1, 7.9, W / 2 - 4.9, 22.1, 1.1, 1.18, C(0x2a2a2c));
  R.box('wood', W / 2 - 0.2, 9, W / 2 - 0.06, 21, 1.2, 4.4, C(0x5a3a22)); R.box('emit', W / 2 - 0.22, 12, W / 2 - 0.2, 18, 3.4, 4.0, gold.clone().multiplyScalar(1.4));
  people(R, [['recep', W / 2 - 3.6, 11, -Math.PI / 2, { key: 'agent' }], ['recep', W / 2 - 3.6, 17, -Math.PI / 2, { key: 'ped_f1' }]]);
  // The bar along the left wall: a counter, stools, shelves of bottles lit from behind.
  R.box('wood', -W / 2 + 4, 8, -W / 2 + 5, 22, 0, 1.12, C(0x3a2416), true); R.box('prop', -W / 2 + 3.9, 7.9, -W / 2 + 5.1, 22.1, 1.12, 1.18, C(0x1c1c1e));
  R.box('emit', -W / 2 + 0.06, 9, -W / 2 + 0.08, 21, 1.3, 3.4, C(0xffc880).multiplyScalar(1.1)); R.goods(-W / 2 + 0.1, 9.2, -W / 2 + 0.1, 20.8, 1.3, 3.3, 1, 0);
  for (let z = 9; z < 21.5; z += 1.5) { R.drum('metal', -W / 2 + 5.8, z, 0.03, 0, 0.78, gold, false, 6); R.drum('prop', -W / 2 + 5.8, z, 0.22, 0.78, 0.84, C(0x6a2a2a), true, 12); }
  people(R, [['barman', -W / 2 + 2.4, 15, Math.PI / 2], ['guest', -W / 2 + 6.4, 12, -Math.PI / 2], ['guest', -W / 2 + 6.4, 18, -Math.PI / 2, { key: 'ped_f2' }]]);
  // Lounges: sofas round low tables on rugs, between the columns and the walls.
  for (const [x, z] of [[-14, 26], [14, 26], [0, 27]]) {
    rug(R, x - 3.5, z - 2.6, x + 3.5, z + 2.6, C(0x6a2a2a));
    const a = sofa(R, x, z - 1.7, 0, 3.0, C(0xd8c8a8)), b = sofa(R, x, z + 1.7, Math.PI, 3.0, C(0xd8c8a8)); R.box('wood', x - 0.9, z - 0.5, x + 0.9, z + 0.5, 0, 0.42, C(0x3a2416), true);
    R.spot('guest', a[0][0], a[0][1], 0, { sit: 'sofa', seat: 0.5 }); if (x !== 0) R.spot('guest', b[1][0], b[1][1], Math.PI, { sit: 'sofa', seat: 0.5 });
  }
  // The flowers on a round table in the middle.
  R.drum('wood', 0, 15, 1.6, 0.7, 0.78, C(0x3a2416), true, 24); R.drum('prop', 0, 15, 0.25, 0, 0.7, C(0x3a2416), false, 12); plant(R, 0, 15, 2.2, C(0xf0ece4));
  // The stair at the back: up the middle to a landing, then the gallery across the back with a balustrade; lifts under it.
  R.stairs(-2, 25.5, 2, 31, '+z', 0, G, 'prop', C(0xefe8dc), 'ab', gold);
  gallery(R, -W / 2, 31, W / 2, D, G, C(0xe8e0d0), [[-16, 31], [-8, 31], [8, 31], [16, 31]]);
  R.rail(-W / 2, 31, -2, 31, G, gold); R.rail(2, 31, W / 2, 31, G, gold);
  R.lifts = [-18, -6, 6, 18].map(x => [x, D - 1.0]);
  for (let k = 0; k < 4; k++) { const x = -18 + k * 12; if (Math.abs(x) < 3) continue; R.box('metal', x - 1.0, D - 0.14, x + 1.0, D - 0.1, 0, 2.6, gold); R.box('prop', x - 1.3, D - 0.1, x + 1.3, D, 0, 3.0, C(0x5a3a22)); }
  people(R, [['guest', 0, 4, 0, { route: [[0, 5], [-6, 12], [-6, 24], [0, 25], [0, 31.8], [10, 33], [-10, 33], [0, 31.8], [0, 25], [6, 24], [6, 12]] }], ['porter', 4, 3.5, 0, { key: 'agent', route: [[4, 3.5], [16, 6], [18, 24], [4, 4]] }]]);
  R.light(-12, 9, 9, 1.6); R.light(12, 9, 9, 1.6); R.light(0, 9, 22, 1.8); R.light(0, G + 3, 33, 1.0);
}

// ---- A cinema: an auditorium 30 m by 34, thirteen high; the screen across the front wall over the door, sixteen rows of seats stepping up to the back,
// aisles up each side, low lights along the walls. A film is showing.
function cinema(R, v, rnd) {
  const W = 30, D = 34, H = 13, wall = C(0x2a2228);
  R.shell(W, D, H, { floor: C(0xffffff), floorS: 1.6, wall, trim: C(0x111111), ceil: C(0x1c1a1e) });
  // The screen, high on the front wall, and the black masking round it; the stage before it.
  R.box('prop', -14.6, 0.05, 14.6, 0.2, 2.6, 12.2, BLACK); screen(R, -13.6, 0.22, 13.6, 0.22, 3.0, 11.6, 0, 1, 1.15);
  R.box('prop', -14.8, 0.2, 14.8, 2.2, 0, 0.5, C(0x1c1a1e)); R.deck(-14.8, 0.2, -1.6, 2.2, 0.5); R.deck(1.6, 0.2, 14.8, 2.2, 0.5);
  // The rows: each a step up (0.36), seats in a block between the aisles, a dim light on each step's end.
  const rows = 16, z0 = 6, dz = 1.65, rise = 0.36;
  for (let r = 0; r < rows; r++) {
    const z = z0 + r * dz, h = r * rise;
    if (r > 0) { R.box('prop', -W / 2, z, W / 2, z + dz, 0, h, C(0x3a1418)); R.deck(-W / 2, z, W / 2, z + dz, h); }
    for (const side of [-1, 1]) R.box('emit', side * (W / 2 - 2.6) - 0.08, z + 0.02, side * (W / 2 - 2.6) + 0.08, z + 0.05, h + 0.02, h + 0.06, C(0xffc880).multiplyScalar(1.6));
    for (let k = 0; k < 18; k++) {
      const x = -11.6 + k * 1.36, red = C(0x8a1a22);
      R.box('prop', x - 0.32, z + 0.4, x + 0.32, z + 1.0, h + 0.4, h + 0.5, red); R.box('prop', x - 0.32, z + 1.0, x + 0.32, z + 1.12, h + 0.45, h + 1.05, red); R.box('prop', x + 0.33, z + 0.45, x + 0.37, z + 1.1, h, h + 0.68, BLACK);
      if ((r * 5 + k * 3) % 17 === 0 && r < 13) R.spot('audience', x, z + 0.72, Math.PI, { sit: 'sit', seat: 0.46, y: h });
    }
    R.block(-11.6 - 0.4, z + 0.35, -11.6 + 17 * 1.36 + 0.4, z + 1.15, h, h + 1.1);
  }
  // A dim light along the walls; the projection window at the back.
  for (const s of [-1, 1]) for (let z = 4; z < D; z += 6) R.box('emit', s * (W / 2 - 0.06) - 0.03, z, s * (W / 2 - 0.06) + 0.03, z + 0.5, 5, 5.4, C(0xffb870).multiplyScalar(1.2));
  R.box('emit', -1.5, D - 0.05, 1.5, D - 0.02, 10.4, 11.4, C(0xd8e4ff).multiplyScalar(2));
  people(R, [['usher', W / 2 - 1.4, 5, -Math.PI / 2, { key: 'agent' }], ['latecomer', -W / 2 + 1.4, 4, 0, { route: [[-W / 2 + 1.4, 4], [-W / 2 + 1.4, 30], [-W / 2 + 1.4, 4]] }]]);
  R.light(-8, 6, 4, 0.9, 0x9fb4ff); R.light(8, 6, 4, 0.9, 0x9fb4ff); R.light(0, 11, 20, 0.45, 0xffc890); R.light(0, 12, 31, 0.35, 0xffc890);
}

// ---- The cathedral: the nave, 34 m by 76 and 26 high, two rows of great columns, side aisles, pews, stained glass in every bay and a great window over the
// altar, the chancel raised up steps at the far end, an organ, candles, chandeliers hanging on long chains.
function church(R, v, rnd) {
  const W = 34, D = 76, H = 26;
  R.shell(W, D, H, { floor: C(0xffffff), floorS: 3, wall: C(0xe8e0d0), trim: C(0x8a8070), ceil: C(0xd8d0c0) });
  // The columns, with bases and capitals, carrying arches (beams) across and along.
  for (const x of [-7, 7]) for (let z = 8; z < 62; z += 6) { R.drum('prop', x, z, 0.85, 0, 16, C(0xe0d8c8), true, 20); R.drum('prop', x, z, 1.05, 0, 0.8, C(0xd0c8b8), true, 20); R.drum('prop', x, z, 1.1, 15.4, 16.2, C(0xd0c8b8), false, 20); }
  for (const x of [-7, 7]) R.box('prop', x - 0.9, 8, x + 0.9, 62, 16.2, 17.4, C(0xd8d0c0));
  for (let z = 8; z < 62; z += 6) R.box('prop', -7, z - 0.4, 7, z + 0.4, 23.8, 25, C(0xc8beac));
  // Stained glass: a tall window in every bay of both side walls, and a great window over the altar.
  const glassCols = [0x2a4aa8, 0xb02a2a, 0xe0b030, 0x2a8a4a, 0x7a3aa8];
  for (const s of [-1, 1]) for (let z = 9.5; z < 60; z += 6) {
    const xw = s * W / 2, xf = xw - s * 0.02, xp = xw - s * 0.045; R.box('prop', Math.min(xw, xf), z - 0.1, Math.max(xw, xf), z + 3.1, 5.9, 14.6, C(0x3a3632));
    for (let r = 0; r < 9; r++) for (let c = 0; c < 3; c++) { if (r === 8 && c !== 1) continue; R.box('emit', Math.min(xf, xp), z + c + 0.02, Math.max(xf, xp), z + c + 0.98, 6 + r, 6.96 + r, C(glassCols[(r * 3 + c + Math.round(z)) % 5]).multiplyScalar(1.6)); }
  }
  for (let r = 0; r < 14; r++) for (let c = 0; c < 8; c++) { if (r >= 10 && (c < r - 9 || c > 16 - r)) continue; const x = -4.8 + c * 1.2; R.box('emit', x, D - 0.05, x + 1.15, D - 0.02, 8 + r, 8.95 + r, C(glassCols[(r + c * 2) % 5]).multiplyScalar(1.7)); }
  for (const [rr, n, sz] of [[2.6, 24, 0.25], [1.75, 16, 0.24], [0.9, 8, 0.22], [0, 1, 0.3]]) for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; R.box('emit', Math.cos(a) * rr - sz, D - 0.06, Math.cos(a) * rr + sz, D - 0.03, 23.2 + Math.sin(a) * rr - sz, 23.2 + Math.sin(a) * rr + sz, C(glassCols[(k + n) % 5]).multiplyScalar(1.8)); }          // (the rose window, ring within ring)
  // Pews in two blocks up the nave, a central aisle between them.
  for (let r = 0; r < 26; r++) for (const s of [-1, 1]) {
    const z = 10 + r * 1.9, x0 = s < 0 ? -6.2 : 1.2, x1 = s < 0 ? -1.2 : 6.2;
    R.box('wood', x0, z, x1, z + 0.45, 0.42, 0.48, C(0x6a4a2a)); R.box('wood', x0, z + 0.45, x1, z + 0.55, 0.42, 1.0, C(0x5a3a22)); for (const x of [x0, x1 - 0.08]) R.box('wood', x, z - 0.05, x + 0.08, z + 0.55, 0, 0.9, C(0x5a3a22));
    R.block(x0, z - 0.05, x1, z + 0.55, 0, 1.0);
    if ((r * 3 + (s > 0 ? 1 : 0)) % 5 === 0) R.spot('worshipper', s < 0 ? -3.5 : 3.5, z + 0.22, 0, { sit: 'sit', seat: 0.48 });
  }
  // The chancel: steps up, the altar, candles, choir stalls, the organ's pipes.
  R.stairs(-6, 60, 6, 61.2, '+z', 0, 0.6, 'prop', C(0xd8d0c0), ''); R.box('prop', -10, 61.2, 10, D, 0, 0.6, C(0xd8d0c0)); R.deck(-10, 61.2, 10, D, 0.6);
  R.stairs(-4, 68, 4, 69, '+z', 0.6, 1.0, 'prop', C(0xd0c8b8), ''); R.box('prop', -5, 69, 5, D, 0, 1.0, C(0xd0c8b8)); R.deck(-5, 69, 5, D, 1.0);
  R.box('prop', -2.2, 71.5, 2.2, 72.7, 1.0, 2.05, C(0xf4f0e8), true); R.box('prop', -2.3, 71.4, 2.3, 72.8, 2.05, 2.12, BRASS);
  for (const x of [-1.6, 1.6]) { R.drum('prop', x, 72.1, 0.05, 2.12, 2.7, BRASS, false, 8); R.drum('emit', x, 72.1, 0.02, 2.7, 2.78, C(0xffc860).multiplyScalar(3), false, 6); }
  for (const s of [-1, 1]) { R.box('wood', s * 7.5 - 1.2, 62, s * 7.5 + 1.2, 68, 0.6, 1.6, C(0x5a3a22), true); for (let k = 0; k < 14; k++) R.drum('metal', s * (W / 2 - 1.2), 64 + k * 0.6, 0.18, 2, 5 + (k % 7) * 1.1, C(0xc9b07a), true, 10); }
  // Chandeliers on long chains down the nave; candles on stands by the columns.
  for (let z = 14; z < 60; z += 12) { R.box('metal', -0.01, z - 0.01, 0.01, z + 0.01, 9, H, BLACK); R.drum('metal', 0, z, 1.6, 8.6, 8.7, BLACK, false, 24); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; R.drum('emit', Math.cos(a) * 1.5, z + Math.sin(a) * 1.5, 0.05, 8.7, 8.95, C(0xffc860).multiplyScalar(3), false, 6); } }
  for (const s of [-1, 1]) for (let z = 11; z < 58; z += 12) { R.drum('metal', s * 8.6, z, 0.04, 0, 1.4, BRASS, false, 6); for (let k = 0; k < 3; k++) R.drum('emit', s * 8.6 + (k - 1) * 0.12, z, 0.015, 1.4, 1.5, C(0xffc860).multiplyScalar(3), false, 6); }
  people(R, [['priest', 0, 70.4, Math.PI, { y: 1.0, key: 'agent' }], ['visitor', -11, 6, 0, { route: [[-11, 6], [-11, 58], [11, 58], [11, 6]] }], ['visitor', 0, 5, 0, { route: [[0, 5], [0, 58], [0, 5]] }]]);
  R.light(0, 18, 20, 2.0, 0xffe8c8); R.light(0, 18, 45, 2.0, 0xffe8c8); R.light(0, 12, 70, 1.5, 0xffd8a8); R.light(0, 10, 6, 1.0, 0xc8d8ff);
}

// ---- A warehouse: 60 m by 44, twelve high: rows of pallet racking (orange and blue steel, three levels of pallets and boxes), forklifts, a loading dock with
// roller doors, an office up on steel legs (stairs up to it), yellow lines on the floor, roof lights.
function warehouse(R, v, rnd) {
  const W = 60, D = 44, H = 12;
  R.shell(W, D, H, { floor: C(0xffffff), floorS: 4, wall: C(0xdedcd6), trim: C(0xe8b020), ceil: C(0x9a9ca0) });
  for (let x = -26; x <= 26; x += 6.5) R.box('metal', x - 0.15, 0.3, x + 0.15, D - 0.3, H - 1.4, H - 1.1, C(0x6a6e74));                  // roof trusses
  for (let x = -24; x <= 24; x += 12) for (let z = 6; z < D; z += 10) R.panel(x, z, 4, 1.4, H, C(0xf4f8ff), 3.6);
  // The racking: seven rows of bays, pallets of boxes on three levels.
  const boxCol = [C(0xb08a5a), C(0xa07a4a), C(0xc8a070), C(0x8a6a4a)];
  for (let r = 0; r < 7; r++) {
    const z = 8 + r * 4.6;
    for (let x = -24; x < 12; x += 2.8) {
      for (const zz of [z, z + 1.1]) for (const xx of [x, x + 2.7]) R.box('metal', xx - 0.05, zz - 0.05, xx + 0.05, zz + 0.05, 0, 7.6, C(0x2a5ab0));
      for (const y of [1.8, 3.8, 5.8]) { for (const zz of [z - 0.05, z + 1.05]) R.box('metal', x, zz, x + 2.7, zz + 0.1, y - 0.12, y, C(0xe87a20)); }
      for (const y of [0, 1.8, 3.8, 5.8]) if (((x + r * 7 + y * 3) | 0) % 5 !== 0) { R.box('wood', x + 0.15, z + 0.05, x + 2.55, z + 1.05, y, y + 0.14, C(0xd8b888)); R.box('prop', x + 0.2, z + 0.1, x + 2.5, z + 1.0, y + 0.14, y + 0.14 + 0.8 + ((x * 7 + r) | 0) % 3 * 0.25, boxCol[((x + r) | 0) & 3]); }
    }
    R.block(-24.1, z - 0.1, 12, z + 1.15, 0, 7.6);
  }
  // Yellow lines along the aisles; forklifts; the loading dock (roller doors in the right wall, a dock leveller before each).
  for (let r = 0; r <= 7; r++) R.box('prop', -24, 7.3 + r * 4.6, 12, 7.42 + r * 4.6, 0, 0.012, C(0xf0c020));
  const forklift = (x, z, f) => { const K = kit(R, x, z, f); K.box('prop', -0.55, -1.1, 0.55, 0.9, 0.25, 1.15, C(0xf0b020), true); K.box('prop', -0.5, -1.25, 0.5, -0.9, 0.25, 1.0, C(0x2a2a2c)); K.box('metal', -0.5, 0.9, 0.5, 1.0, 0.1, 2.6, C(0x2a2a2c)); K.box('metal', -0.45, 1.0, 0.45, 2.1, 0.12, 0.18, C(0x8a8e94)); for (const s of [-1, 1]) for (const w of [-0.7, 0.55]) K.drum('prop', s * 0.6, w, 0.32, 0, 0.35, BLACK, false, 12); K.box('metal', -0.5, -0.5, 0.5, 0.4, 2.0, 2.06, C(0x2a2a2c)); for (const [u, w] of [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.38], [0.48, 0.38]]) K.box('metal', u - 0.03, w - 0.03, u + 0.03, w + 0.03, 1.15, 2.0, C(0x2a2a2c)); return K.P(0, -0.35); };
  const fk = forklift(16, 14, -Math.PI / 2); forklift(-6, 41, Math.PI); forklift(18, 30, 0);
  R.spot('driver', fk[0], fk[1], -Math.PI / 2, { sit: 'sit', seat: 0.95 });
  for (let k = 0; k < 4; k++) { const z = 8 + k * 9; R.box('prop', W / 2 - 0.06, z, W / 2 - 0.02, z + 4, 0, 4.6, C(0x9aa0a6)); for (let y = 0.2; y < 4.6; y += 0.2) R.box('prop', W / 2 - 0.07, z, W / 2 - 0.06, z + 4, y, y + 0.03, C(0x7a8086)); R.box('metal', W / 2 - 2.2, z + 0.3, W / 2 - 0.1, z + 3.7, 0, 0.04, C(0x5a5e64)); R.box('prop', W / 2 - 0.1, z - 0.15, W / 2 - 0.05, z, 0, 4.8, C(0xf0c020)); }
  // Pallets of boxes waiting on the floor by the dock; stacks of crates.
  for (let k = 0; k < 8; k++) { const x = 20 + (k % 2) * 3, z = 6 + ((k / 2) | 0) * 4.5; R.box('wood', x, z, x + 1.2, z + 1.0, 0, 0.14, C(0xd8b888)); R.box('prop', x + 0.05, z + 0.05, x + 1.15, z + 0.95, 0.14, 0.14 + 0.9 + (k % 3) * 0.3, boxCol[k & 3], true); }
  // The office on legs, back left, with stairs up to it.
  const ox0 = -W / 2 + 0.5, ox1 = -W / 2 + 10, oz0 = D - 7, oz1 = D - 0.5, OH = 3.2;
  for (const [x, z] of [[ox0 + 0.2, oz0 + 0.2], [ox1 - 0.2, oz0 + 0.2], [ox1 - 0.2, oz1 - 0.2]]) R.box('metal', x - 0.12, z - 0.12, x + 0.12, z + 0.12, 0, OH, C(0x2a5ab0), true);
  gallery(R, ox0, oz0, ox1, oz1, OH, C(0x9a9ca0));
  R.box('prop', ox0, oz0, ox1, oz0 + 0.1, OH, OH + 0.9, C(0xe8e8e4)); R.block(ox0, oz0, ox1 - 2.4, oz0 + 0.1, OH, OH + 2.6); R.box('prop', ox1 - 0.1, oz0, ox1, oz1, OH, OH + 0.9, C(0xe8e8e4)); R.block(ox1 - 0.1, oz0, ox1, oz1, OH, OH + 2.6);
  glassBox(R, ox0, oz0, ox1 - 2.4, oz0 + 0.1, OH + 0.9, OH + 2.4); glassBox(R, ox1 - 0.1, oz0, ox1, oz1, OH + 0.9, OH + 2.4); R.box('prop', ox0, oz0, ox1, oz1, OH + 2.5, OH + 2.65, C(0xe8e8e4));
  R.stairs(ox1 - 2.3, oz0 - 6, ox1 - 1.1, oz0, '+z', 0, OH, 'metal', C(0x6a6e74), 'ab', C(0xf0c020));
  R.lift = OH; const dsk = desk(R, ox0 + 3, oz1 - 2.5, Math.PI); R.lift = 0;
  R.spot('clerk', dsk[0], dsk[1], Math.PI, { sit: 'desk', seat: 0.46, y: OH });
  people(R, [['worker', 14, 6, 0, { key: 'tee', route: [[14, 6], [14, 38], [-26, 38.5], [-26, 6.5]] }], ['worker', -10, 7, Math.PI / 2, { key: 'hoodie' }], ['worker', 22, 20, -Math.PI / 2, { key: 'denim' }]]);
  R.light(-14, 9, 14, 1.5); R.light(10, 9, 14, 1.5); R.light(-14, 9, 32, 1.5); R.light(10, 9, 32, 1.5);
}

// ---- A car showroom (dealer.js sells the cars): 64 m by 46, ten high, glass across the whole front. Seven cars on show, each on a pale plinth with a ring of
// light round its foot (dealer.js puts the cars there: R.cars), the hypercar in the middle on a dark turntable under a great round light; reception by the
// door, a lounge, a coffee bar, the salesmen's desks before a wall of screens, glass offices, the handover bay with its roller door, trees, light lines.
function dealer(R, v, rnd) {
  const W = 64, D = 46, H = 10, wall = C(0xf3f3f1), dark = C(0x1e2023);
  R.shell(W, D, H, { floor: C(0xffffff), floorS: 5, wall, trim: dark, ceil: C(0xf6f6f4) });
  windowIn(R, 'front', -31.7, -1.4, 0.15, H - 0.4, 3.2, C(0xc8ccd0)); windowIn(R, 'front', 1.4, 31.7, 0.15, H - 0.4, 3.2, C(0xc8ccd0)); windowIn(R, 'front', -1.4, 1.4, 2.9, H - 0.4, 2.8, C(0xc8ccd0));
  // The cars' stands.
  const stands = [['vitesse', 0, 19, Math.PI + 0.5, true], ['furia', -16, 11, Math.PI - 0.75], ['halcyon', 16, 11, Math.PI + 0.75], ['r9turbo', -24, 26, Math.PI - 1.15], ['r9rs', -10, 32, Math.PI - 0.4], ['sovereign', 10, 32, Math.PI + 0.4], ['bergwagen', 24, 26, Math.PI + 1.15]];
  R.cars = [];
  for (const [id, x, z, h, turn] of stands) {
    const r = turn ? 3.7 : 3.35;
    R.drum('emit', x, z, r + 0.07, 0, 0.03, C(0xdcecff).multiplyScalar(turn ? 2.4 : 1.7), false, 56);
    R.drum('prop', x, z, r, 0, 0.07, turn ? C(0x2a2c30) : C(0xeaeae8), false, 56);
    R.circs.push({ x: R.ox + x, z: R.oz + z, r: 2.55, y0: R.oy, y1: R.oy + 1.7 });
    R.cars.push({ id, x: R.ox + x, z: R.oz + z, y: R.oy + 0.07, h, turn: !!turn, r });
    if (!turn) { R.drum('prop', x, z, 1.25, H - 0.12, H - 0.04, GRAPH, false, 24); R.drum('emit', x, z, 1.05, H - 0.15, H - 0.11, C(0xfff6ea).multiplyScalar(3), false, 24); }      // a round light over each car
    if (!turn) { const a = h + Math.PI, tx = x + Math.sin(a) * (r + 0.7) + Math.cos(a) * 1.6, tz = z + Math.cos(a) * (r + 0.7) - Math.sin(a) * 1.6; R.box('metal', tx - 0.05, tz - 0.05, tx + 0.05, tz + 0.05, 0, 1.05, STEEL); R.box('prop', tx - 0.22, tz - 0.22, tx + 0.22, tz + 0.22, 0, 0.02, GRAPH); R.box('emit', tx - 0.2, tz - 0.035, tx + 0.2, tz + 0.035, 1.05, 1.35, C(0xf4f6f8).multiplyScalar(1.3)); }   // a little lit stand with the car's details
  }
  R.drum('prop', 0, 19, 4.7, H - 0.32, H - 0.2, dark, false, 48); R.drum('emit', 0, 19, 4.3, H - 0.36, H - 0.3, C(0xfff8ee).multiplyScalar(2.6), false, 48);       // the great round light over the turntable
  // Light lines across the ceiling, and the lamps.
  for (const z of [5, 12, 26, 33, 40]) for (const x of [-20, 20]) R.panel(x, z, 18, 0.14, H, C(0xfff7ec), 4.2);
  for (const x of [-27, 27]) R.panel(x, 19, 0.14, 30, H, C(0xfff7ec), 4.2);
  // Reception by the door: a long white desk with a lit front, the name on the wall behind it in lights.
  R.box('prop', 9, 4.2, 17, 5.3, 0, 1.06, C(0xf6f6f4), true); R.box('emit', 9.02, 4.18, 16.98, 4.2, 0.15, 0.95, C(0xeaf4ff).multiplyScalar(1.2)); R.box('prop', 8.95, 4.15, 17.05, 5.35, 1.06, 1.1, GRAPH);
  R.box('prop', 9, 7.6, 17, 7.8, 0, 3.6, dark, true); R.box('emit', 10.5, 7.58, 15.5, 7.6, 2.1, 2.7, C(0xf2f6ff).multiplyScalar(1.8));
  for (const x of [11, 15]) { R.box('prop', x - 0.25, 4.9, x + 0.25, 5.0, 1.1, 1.42, BLACK); screen(R, x - 0.22, 4.89, x + 0.22, 4.89, 1.13, 1.39, 0, -1, 0.8); }
  people(R, [['recep', 13, 6.2, Math.PI, { key: 'agent' }]]);
  // The lounge, front left: a rug, two sofas facing over a low table, a tree; people waiting.
  rug(R, -30, 2.2, -21, 8.6, C(0x3a3f48));
  { const a = sofa(R, -25.5, 3.4, 0, 3.2, C(0x2a2c30)), b2 = sofa(R, -25.5, 7.4, Math.PI, 3.2, C(0x2a2c30)); R.box('wood', -26.6, 4.9, -24.4, 5.9, 0, 0.4, C(0x6a4a2a), true);
    R.spot('customer', a[0][0], a[0][1], 0, { sit: 'sofa', seat: 0.5 }); R.spot('customer', b2[1][0], b2[1][1], Math.PI, { sit: 'sofa', seat: 0.5 }); }
  for (const [x, z] of [[-30, 14], [30, 14], [-30, 38], [30.2, 20]]) tree(R, x, z, 5.5);
  // The coffee bar, back left: a counter, stools, a barista.
  R.box('wood', -30, 40, -21, 41.2, 0, 1.05, C(0x2a2c30), true); R.box('prop', -30.05, 39.95, -20.95, 41.25, 1.05, 1.1, STONE); R.box('metal', -23, 40.3, -22, 41, 1.1, 1.55, STEEL);
  for (let k = 0; k < 4; k++) chair(R, -28.5 + k * 2, 39.2, Math.PI, C(0x8a6a4a));
  people(R, [['barista', -25.5, 42, Math.PI], ['customer', -26.5, 39.2, Math.PI, { sit: 'sit', seat: 0.6 }]]);
  // The sales desks along the back before a wall of screens; glass offices in the back left corner.
  R.box('prop', -16, D - 0.22, 16, D - 0.02, 0, H, C(0x26282c)); R.box('prop', -12.3, D - 0.3, 12.3, D - 0.22, 1.3, 7.7, BLACK); screen(R, -12, D - 0.31, 12, D - 0.31, 1.6, 7.4, 0, -1, 1.15);       // a dark wall at the back, a wall of screens on it
  for (const x of [-7, 0, 7]) { const at = desk(R, x, D - 4.2, Math.PI, C(0xf2f2f0)); chair(R, x, D - 5.25, 0, C(0x2a2c30)); R.spot('sales', at[0], at[1], Math.PI, { sit: 'desk', seat: 0.46, key: 'agent' }); }
  for (const [x0, x1] of [[-31.7, -24], [-23.6, -16]]) { glassPanel(R, x0, D - 7, x1, D - 6.9, 0, 3, GRAPH); glassPanel(R, x1, D - 7, x1 + 0.1, D, 0, 3, GRAPH); R.box('prop', x0, D - 7, x1 + 0.1, D, 3, 3.15, C(0xe8e8e6)); desk(R, (x0 + x1) / 2, D - 3, Math.PI, C(0xf2f2f0)); }
  // The handover bay, back right: a roller door in the right wall, the floor marked out in front of it, a car under a cover waiting.
  R.box('prop', W / 2 - 0.08, 31, W / 2 - 0.02, 43, 0, 5.2, C(0x9aa0a6)); for (let y = 0.25; y < 5.2; y += 0.25) R.box('prop', W / 2 - 0.09, 31, W / 2 - 0.08, 43, y, y + 0.03, C(0x7a8086));
  R.box('prop', W / 2 - 0.1, 30.8, W / 2 - 0.02, 31, 0, 5.5, C(0xf0c020)); R.box('prop', W / 2 - 0.1, 43, W / 2 - 0.02, 43.2, 0, 5.5, C(0xf0c020));
  for (const [x0, z0, x1, z1] of [[19, 31, 31.9, 31.15], [19, 42.85, 31.9, 43], [19, 31, 19.15, 43]]) R.box('prop', x0, z0, x1, z1, 0, 0.012, C(0xf0c020));
  R.box('prop', 21.5, 34, 29.5, 40, 0, 0.5, C(0x3a3d44), true); R.box('prop', 21.7, 34.6, 29.3, 39.4, 0.5, 1.15, C(0x464a52)); R.box('prop', 23.2, 35.2, 27.2, 38.8, 1.15, 1.32, C(0x464a52));       // a car under its cover
  // People: salesmen by the cars, customers walking round them.
  people(R, [['sales', -3.2, 13.6, Math.PI - 0.4, { key: 'agent' }], ['customer', -1.8, 14.2, 0.6], ['sales', 12.6, 15.6, -0.6, { key: 'agent' }],
    ['customer', -8, 6, 0, { route: [[-8, 6], [-21, 16], [-15, 26], [-2, 26.5], [6, 25], [14, 18], [8, 6]] }], ['customer', 20, 18, 0, { route: [[20, 18], [27, 33], [17, 38], [4, 39], [-17, 38], [-27, 33], [-20, 18], [0, 10]] }],
    ['customer', -18, 33, Math.PI / 2], ['customer', 19.6, 21.5, -2.2]]);
  R.light(-14, 8, 12, 1.7); R.light(14, 8, 12, 1.7); R.light(0, 8.5, 30, 1.8); R.light(0, 9.2, 19, 1.3);
}

export const VISIT_PLANS = { office, flats, home, store, hotel, cinema, church, warehouse, dealer };
// (the big jeweller and the bank, rooms.js, furnish with these too)
export { sofa, rug, pendant, tree };
