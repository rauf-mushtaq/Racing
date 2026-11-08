// Landmarks, so different parts of the city look different: a tall signature tower downtown, a stadium, a cathedral with its square
// (the old town round it), a big wheel in a park, a lighthouse on an island in the west lake, and boats on the river. Each is built
// once as a group of meshes on the map (in world coordinates) that hides itself when you are far away; the blocks they stand on are
// emptied of ordinary buildings by city.js (see LANDMARKS in grid.js).
import * as THREE from 'three';
import { GB, ccw, circlePoly, chamferRect, rectPoly, quadToward, tube } from './geom.js';
import { blockRect, LANDMARKS } from './grid.js';
import { addStaticCollider } from './city.js';
import { RIVER, LAKES, WATER_Y, BRIDGES } from './rivercourse.js';
import { mulberry32 } from './util.js';

const C = (r, g, b) => new THREE.Color(r, g, b);
const STONE = C(0.74, 0.7, 0.64), STONE_D = C(0.5, 0.47, 0.43), SLATE = C(0.22, 0.26, 0.32), WHITE = C(0.93, 0.92, 0.9), RED = C(0.72, 0.14, 0.1), DARKC = C(0.08, 0.1, 0.14), GOLD = C(0.9, 0.7, 0.25), GREEN = C(0.18, 0.4, 0.2);
const circ = (x, z, r) => addStaticCollider({ type: 'circ', x, z, r });
const rect = (x0, z0, x1, z1) => addStaticCollider({ type: 'box', x0, z0, x1, z1 });
const centre = key => { const [i, j] = key.split(',').map(Number), b = blockRect(i, j); return { b, x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }; };
const where = name => centre(Object.keys(LANDMARKS).find(k => LANDMARKS[k] === name));
// A band between two rings of points (A at height yA, B at yB), facing `dir`.
// `dir` is a direction, or 'out' / 'in' (away from or toward the centre c) for a vertical face round a ring.
function band(gb, A, yA, B, yB, col, dir, c) {
  const n = A.length;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n, mx = (A[k][0] + A[j][0]) / 2, mz = (A[k][1] + A[j][1]) / 2, d = dir === 'out' ? [mx - c[0], 0, mz - c[1]] : dir === 'in' ? [c[0] - mx, 0, c[1] - mz] : dir;
    quadToward(gb, [A[k][0], yA, A[k][1]], [A[j][0], yA, A[j][1]], [B[j][0], yB, B[j][1]], [B[k][0], yB, B[k][1]], [[0, 0], [1, 0], [1, 1], [0, 1]], col, d);
  }
}
// A flat disc standing up, facing +z.
function discZ(gb, x, y, z, r, col, n = 20) {
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, b = (k + 1) / n * Math.PI * 2; quadToward(gb, [x, y, z], [x + Math.cos(a) * r, y + Math.sin(a) * r, z], [x + Math.cos(b) * r, y + Math.sin(b) * r, z], [x, y, z], [[0, 0], [1, 0], [1, 1], [0, 1]], col, [0, 0, 1]); }
}
const ellipse = (cx, cz, a, b, n = 56) => { const p = []; for (let k = 0; k < n; k++) { const t = Math.PI / 2 - Math.PI * 2 * k / n; p.push([cx + Math.cos(t) * a, cz + Math.sin(t) * b]); } return p; };
// A hip roof over a rectangle: eaves at y, the ridge rising `rise` (as the houses have).
function hipRoof(gb, x0, z0, x1, z1, y, rise, col, over = 0.8) {
  const e = [[x0 - over, z1 + over], [x1 + over, z1 + over], [x1 + over, z0 - over], [x0 - over, z0 - over]], hx = (x0 + x1) / 2, hz = (z0 + z1) / 2, wx = x1 - x0 + 2 * over, wz = z1 - z0 + 2 * over;
  const ridge = wx >= wz ? (() => { const h = (wx - wz) / 2; return [[hx - h, hz], [hx + h, hz], [hx + h, hz], [hx - h, hz]]; })() : (() => { const h = (wz - wx) / 2; return [[hx, hz + h], [hx, hz + h], [hx, hz - h], [hx, hz - h]]; })();
  gb.loft(e, y, ridge, y + rise, 5, col);
}
const spire = (gb, cx, cz, half, y0, y1, col) => gb.loft([[cx - half, cz + half], [cx + half, cz + half], [cx + half, cz - half], [cx - half, cz - half]], y0, [[cx, cz], [cx, cz], [cx, cz], [cx, cz]], y1, 5, col);

export function initLandmarks(scene, city) {
  const std = o => new THREE.MeshStandardMaterial(o), root = new THREE.Group(); scene.add(root);
  const lawn = std({ color: 0x8fa070, map: city.tx.grass, roughness: 1, vertexColors: true });
  const M = { props: city.mat.props, roof: city.mat.roof, glass: city.mat.glass, modern: city.mat.modern, lawn, glow: new THREE.MeshBasicMaterial({ vertexColors: true }) };
  const sites = [];
  // Collect geometry per material into one group; the group shows only within `show` metres of (x, z).
  const make = (name, x, z, show, gbs) => {
    const group = new THREE.Group();
    for (const [k, gb] of Object.entries(gbs)) { if (!gb.count) continue; const m = new THREE.Mesh(gb.geometry(), M[k]); m.castShadow = k !== 'glow' && k !== 'lawn'; m.receiveShadow = k !== 'glow'; group.add(m); }
    root.add(group); const s = { name, group, x, z, show }; sites.push(s); return s;
  };
  const sets = () => ({ props: new GB(true), roof: new GB(true), glass: new GB(true), modern: new GB(true), lawn: new GB(true), glow: new GB(true) });
  const fg = city.style.glass.fac, fm = city.style.modern.fac;

  // ---- Sunset Tower: the tallest thing in the city, in glass, in steps ------------------------------------------------
  {
    const { b, x, z } = where('tower'), G = sets(), w = 150;
    const sq = (s, ch) => chamferRect({ x0: x - s / 2, x1: x + s / 2, z0: z - s / 2, z1: z + s / 2 }, ch);
    G.modern.extrude(ccw(rectPoly({ x0: x - 70, x1: x + 70, z0: z - 70, z1: z + 70 })), 0, 15, fm.w, fm.h, C(0.92, 0.91, 0.88), 0, false); G.roof.cap(rectPoly({ x0: x - 70, x1: x + 70, z0: z - 70, z1: z + 70 }), 15, 8, C(0.5, 0.5, 0.5));
    for (const [s, ch, y0, y1] of [[64, 7, 15, 150], [46, 5, 150, 206], [30, 4, 206, 238]]) {
      G.glass.extrude(sq(s, ch), y0, y1, fg.w, fg.h, C(0.78, 0.86, 0.94), 0, true);
      G.roof.cap(sq(s, ch), y1, 8, C(0.5, 0.52, 0.55)); G.props.extrude(ccw(sq(s + 1.2, ch)), y1, y1 + 1.2, 4, 4, WHITE, 0, false);
    }
    G.props.extrude(ccw(circlePoly(x, z, 36, 40)), 150, 152, 4, 4, C(0.2, 0.22, 0.26), 0, true); G.props.cap(circlePoly(x, z, 36, 40), 152, 4, C(0.2, 0.22, 0.26));           // a sky-lobby ring at the first setback
    spire(G.props, x, z, 15, 238, 262, C(0.6, 0.64, 0.7));
    G.props.box(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 262, 292, 3, C(0.7, 0.7, 0.72));
    G.glow.box(x - 0.9, z - 0.9, x + 0.9, z + 0.9, 290, 293, 3, C(6, 0.3, 0.15));
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) G.glow.box(x + dx * 14 - 0.5, z + dz * 14 - 0.5, x + dx * 14 + 0.5, z + dz * 14 + 0.5, 238, 239.4, 3, C(6, 0.3, 0.15));
    rect(x - 70, z - 70, x + 70, z + 70);
    make('Sunset Tower', x, z, 4200, G);
  }

  // ---- The stadium: an oval bowl of seats under a ring of roof, a pitch, floodlights -----------------------------------------
  {
    const { x, z } = where('stadium'), G = sets(), a = 70, bb = 67, E = s => ellipse(x, z, a * s, bb * s);
    G.modern.extrude(E(1), 0, 27, fm.w, fm.h, C(0.92, 0.92, 0.9), 0, true);
    band(G.props, E(0.94), 25, E(0.81), 14, C(0.15, 0.3, 0.6), [0, 1, 0]);                      // upper tier
    band(G.props, E(0.81), 14, E(0.57), 3, C(0.7, 0.14, 0.12), [0, 1, 0]);                      // lower tier
    band(G.props, E(1.03), 28, E(0.7), 25.5, C(0.94, 0.94, 0.92), [0, 1, 0]); band(G.props, E(1.03), 28, E(0.7), 25.5, C(0.55, 0.56, 0.58), [0, -1, 0]);   // the roof (top and underside)
    band(G.props, E(1.03), 28, E(1.03), 25.2, C(0.9, 0.9, 0.88), 'out', [x, z]); band(G.props, E(0.7), 28.3, E(0.7), 25.5, C(0.8, 0.8, 0.8), 'in', [x, z]);
    const pc = E(0.565), pc2 = pc.map(p => p); G.lawn.cap(pc2, 3, 8, C(0.85, 1, 0.8));
    const line = (x0, z0, x1, z1) => G.props.box(Math.min(x0, x1) - 0.12, Math.min(z0, z1) - 0.12, Math.max(x0, x1) + 0.12, Math.max(z0, z1) + 0.12, 3.02, 3.06, 3, WHITE);
    line(x - 30, z - 18, x + 30, z - 18); line(x - 30, z + 18, x + 30, z + 18); line(x - 30, z - 18, x - 30, z + 18); line(x + 30, z - 18, x + 30, z + 18); line(x, z - 18, x, z + 18);
    for (const s of [-1, 1]) { line(x + s * 30, z - 8, x + s * 30 - s * 8, z - 8); line(x + s * 30, z + 8, x + s * 30 - s * 8, z + 8); line(x + s * 30 - s * 8, z - 8, x + s * 30 - s * 8, z + 8); }
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {                                 // floodlight masts
      const mx = x + dx * a * 0.78, mz = z + dz * bb * 0.78;
      G.props.box(mx - 0.7, mz - 0.7, mx + 0.7, mz + 0.7, 0, 46, 3, C(0.6, 0.62, 0.66)); G.props.box(mx - 4, mz - 1, mx + 4, mz + 1, 46, 48.4, 3, C(0.5, 0.52, 0.55)); G.glow.box(mx - 3.6, mz - 1.05, mx + 3.6, mz + 1.05, 46.2, 47.8, 3, C(4, 3.8, 3.2));
      circ(mx, mz, 1.2);
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const gx = x + dx * a * 1.003, gz = z + dz * bb * 1.003; G.props.box(gx - (dx ? 0.5 : 6), gz - (dz ? 0.5 : 6), gx + (dx ? 0.5 : 6), gz + (dz ? 0.5 : 6), 0, 9, 3, DARKC); }   // the gates
    const wall = ellipse(x, z, a * 0.97, bb * 0.97, 44); for (const [px, pz] of wall) circ(px, pz, 5.2);
    make('Sunset Stadium', x, z, 2200, G);
  }

  // ---- The cathedral: a long nave, a transept, two west towers with spires, a rose window; a fountain in the square before it ----
  {
    const { b, x, z } = where('cathedral'), G = sets(), cx = x, front = b.z1 - 46, back = b.z0 + 6, wall = 24;
    const mass = (x0, z0, x1, z1, h, col = STONE) => { G.props.extrude(ccw(rectPoly({ x0, x1, z0, z1 })), 0, h, 4, 4, col, 0, false); G.props.cap(rectPoly({ x0, x1, z0, z1 }), h, 4, STONE_D); };
    mass(cx - 13, back, cx + 13, front, wall); hipRoof(G.roof, cx - 13, back, cx + 13, front, wall, 10, SLATE, 1.0); rect(cx - 13, back, cx + 13, front);
    mass(cx - 36, back + 40, cx + 36, back + 64, wall); hipRoof(G.roof, cx - 36, back + 40, cx + 36, back + 64, wall, 9, SLATE, 1.0); rect(cx - 36, back + 40, cx + 36, back + 64);
    for (const s of [-1, 1]) {                                                              // the towers
      const x0 = s > 0 ? cx + 14 : cx - 26, x1 = x0 + 12;
      mass(x0, front - 12, x1, front + 4, 52); spire(G.roof, (x0 + x1) / 2, front - 4, 7.2, 52, 78, SLATE); rect(x0, front - 12, x1, front + 4);
      for (const lvl of [20, 33, 45]) { G.props.box((x0 + x1) / 2 - 1.2, front + 4.02, (x0 + x1) / 2 + 1.2, front + 4.4, lvl, lvl + 5, 3, DARKC); G.props.box(x1 - 0.4, front - 8, x1 + 0.4 + (s > 0 ? 0.01 : 0), front - 5, lvl, lvl + 4, 3, DARKC); G.props.box(x0 - 0.4, front - 8, x0 + 0.4, front - 5, lvl, lvl + 4, 3, DARKC); }
    }
    spire(G.roof, cx, back + 52, 5, wall + 9, wall + 12, SLATE); spire(G.roof, cx, back + 52, 2.6, wall + 12, wall + 40, SLATE);
    discZ(G.props, cx, 17, front + 4.05, 3.8, C(0.15, 0.25, 0.5)); discZ(G.props, cx, 17, front + 4.1, 1.4, GOLD);                                   // the rose window
    G.props.box(cx - 3, front - 0.2, cx + 3, front + 0.5, 0, 9, 3, DARKC);                     // the great door
    for (let zz = back + 6; zz < front - 12; zz += 9) for (const sx of [-13.05, 13.05]) G.props.box(cx + sx - 0.3, zz, cx + sx + 0.3, zz + 1.4, 8, 17, 3, DARKC);   // tall windows down the nave
    for (let zz = back + 5; zz < front - 4; zz += 9) for (const sx of [-1, 1]) G.props.box(cx + sx * 13 - (sx > 0 ? 0 : 1.6), zz, cx + sx * 13 + (sx > 0 ? 1.6 : 0), zz + 1.4, 0, 19, 3, STONE_D);    // buttresses
    // the fountain in the square
    const fx = cx, fz = b.z1 - 20;
    G.props.extrude(circlePoly(fx, fz, 5.4, 24), 0.15, 0.9, 4, 4, STONE, 0, true); G.props.cap(circlePoly(fx, fz, 5.4, 24), 0.9, 4, STONE); G.props.cap(circlePoly(fx, fz, 4.9, 24), 0.98, 4, C(0.3, 0.6, 0.75));
    G.props.extrude(circlePoly(fx, fz, 0.6, 12), 0.15, 3.6, 4, 4, STONE, 0, true); G.props.cap(circlePoly(fx, fz, 0.6, 12), 3.6, 4, STONE); circ(fx, fz, 5.4);
    make('Cathedral', x, z, 1800, G);
  }

  // ---- The big wheel in the park: two rims, spokes, gondolas that carry on turning; the legs are solid ------------------------
  let wheel = null;
  {
    const { x, z } = where('wheel'), R = 36, hubY = 41, G = sets(), spin = new GB(true), hub = [0, 0, 0];
    for (const dz of [-3.4, 3.4]) {
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, b = (k + 1) / 24 * Math.PI * 2; tube(spin, [Math.cos(a) * R, Math.sin(a) * R, dz], [Math.cos(b) * R, Math.sin(b) * R, dz], 0.32, WHITE); }
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; tube(spin, [0, 0, dz], [Math.cos(a) * R, Math.sin(a) * R, dz], 0.1, C(0.8, 0.82, 0.86)); }
    }
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; tube(spin, [Math.cos(a) * R, Math.sin(a) * R, -3.4], [Math.cos(a) * R, Math.sin(a) * R, 3.4], 0.14, WHITE); }
    for (const dz of [-5, 5]) for (const s of [-1, 1]) { tube(G.props, [x, hubY, z + dz], [x + s * 22, 0, z + dz * 1.9], 0.7, C(0.85, 0.86, 0.9)); circ(x + s * 22, z + dz * 1.9, 1.6); }
    tube(G.props, [x, hubY, z - 5], [x, hubY, z + 5], 0.9, C(0.7, 0.72, 0.76)); G.props.box(x - 24, z - 11, x + 24, z + 11, 0, 0.5, 3, C(0.55, 0.55, 0.56));
    const group = make('Ferris wheel', x, z, 2400, G).group, wm = new THREE.Mesh(spin.geometry(), M.props); wm.position.set(x, hubY, z); wm.castShadow = true; group.add(wm);
    const gond = new THREE.InstancedMesh(new THREE.BoxGeometry(2.8, 2.4, 2.8).translate(0, -1.9, 0), std({ roughness: 0.5, metalness: 0.2 }), 16);
    const cols = [C(0.85, 0.15, 0.12), C(0.95, 0.75, 0.15), C(0.15, 0.45, 0.8), C(0.2, 0.65, 0.35)]; for (let k = 0; k < 16; k++) gond.setColorAt(k, cols[k % 4]);
    gond.frustumCulled = false; group.add(gond); wheel = { x, z, hubY, R, wm, gond, ang: 0, m4: new THREE.Matrix4() };
  }

  // ---- A lighthouse on an island in the west lake ------------------------------------------------------------------------------
  {
    const L = LAKES[0], G = sets(), x = L.cx, z = L.cz, disc = (r, n = 20) => circlePoly(x, z, r, n);
    G.props.extrude(disc(17.5, 28), WATER_Y - 1, 0.7, 4, 4, C(0.55, 0.53, 0.5), 0, true); G.lawn.cap(disc(17, 28), 0.7, 8, C(0.85, 1, 0.8));
    const bands = [[3.4, 0.7, 7, WHITE], [3.1, 7, 13, RED], [2.8, 13, 19, WHITE], [2.6, 19, 25, RED]];
    for (const [r, y0, y1, c] of bands) { G.props.extrude(disc(r, 16), y0, y1, 4, 4, c, 0, true); }
    G.props.extrude(disc(3.6, 16), 25, 25.5, 4, 4, DARKC, 0, true); G.props.cap(disc(3.6, 16), 25.5, 4, DARKC);
    G.glow.extrude(disc(1.7, 12), 25.5, 28.5, 4, 4, C(5, 4.2, 2.4), 0, true);
    G.props.extrude(disc(2.3, 14), 28.5, 29.2, 4, 4, RED, 0, true); G.props.extrude(disc(1.5, 12), 29.2, 30.4, 4, 4, RED, 0, true); G.props.extrude(disc(0.6, 8), 30.4, 32, 4, 4, DARKC, 0, true);
    G.props.box(x + 5, z - 1.4, x + 10, z + 1.4, 0.7, 4, 3, WHITE);                           // a little keeper's house
    G.roof.loft([[x + 4.5, z + 1.9], [x + 10.5, z + 1.9], [x + 10.5, z - 1.9], [x + 4.5, z - 1.9]], 4, [[x + 7.5, z], [x + 7.5, z], [x + 7.5, z], [x + 7.5, z]], 6.6, 5, RED);
    for (const [dx, dz, h] of [[-9, 4, 6], [-11, -3, 7], [-6, -8, 5.5], [8, 9, 6.5]]) { G.props.extrude(circlePoly(x + dx, z + dz, 0.3, 6), 0.7, 0.7 + h, 3, 3, C(0.35, 0.25, 0.15), 0, true); G.props.extrude(circlePoly(x + dx, z + dz, 2.4, 10), 0.7 + h - 1.2, 0.7 + h + 1.6, 3, 3, GREEN, 0, true); G.props.cap(circlePoly(x + dx, z + dz, 2.4, 10), 0.7 + h + 1.6, 3, GREEN); }
    make('Lighthouse', x, z, 1600, G);
  }

  // ---- Boats: some moored along the quays, some going to and fro between the bridges ---------------------------------------------
  const boats = [];
  {
    const rnd = mulberry32(31), hulls = [C(0.85, 0.85, 0.82), C(0.15, 0.3, 0.55), C(0.7, 0.15, 0.12), C(0.12, 0.35, 0.28), C(0.85, 0.7, 0.2)];
    const hull = (len, col, cabinCol, big) => {
      const g = new GB(true), w = big ? 1.9 : 1.2, pts = ccw([[-len / 2, -w], [len * 0.2, -w], [len / 2, 0], [len * 0.2, w], [-len / 2, w]]);
      g.extrude(pts, -0.5, 0.9, 3, 3, col, 0, false); g.cap(pts, 0.9, 3, C(0.6, 0.45, 0.3));
      g.box(-len * 0.3, -w * 0.6, len * 0.12, w * 0.6, 0.9, big ? 3.4 : 2.2, 3, cabinCol);
      if (big) g.box(-len * 0.1, -w * 0.4, len * 0.1, w * 0.4, 3.4, 3.8, 3, C(0.3, 0.3, 0.32)); else g.box(len * 0.22, -0.05, len * 0.22 + 0.1, 0.05, 0.9, 2.6, 3, C(0.5, 0.5, 0.5));
      return g;
    };
    // moving boats: the stretches between bridges that are long enough
    const bs = BRIDGES.map(br => { const bx = br.axis === 'z' ? br.c : br.pos, bz = br.axis === 'z' ? br.pos : br.c; let best = 0, bd = 1e18; for (let i = 0; i < RIVER.n; i++) { const d = (RIVER.x[i] - bx) ** 2 + (RIVER.z[i] - bz) ** 2; if (d < bd) { bd = d; best = i; } } return RIVER.s[best]; }).sort((p, q) => p - q);
    const reaches = []; const edges = [RIVER.s[40], ...bs, RIVER.s[RIVER.n - 40]];
    for (let k = 0; k < edges.length - 1; k++) if (edges[k + 1] - edges[k] > 140) reaches.push([edges[k] + 45, edges[k + 1] - 45]);
    reaches.forEach(([s0, s1], k) => {
      const big = k % 3 === 0, g = hull(big ? 12 : 6.5, hulls[k % hulls.length], WHITE, big), m = new THREE.Mesh(g.geometry(), M.props); m.castShadow = false; root.add(m);
      boats.push({ mesh: m, s: s0 + rnd() * (s1 - s0), s0, s1, v: (big ? 2.2 : 3.6) * (k % 2 ? 1 : -1), side: (k % 2 ? 1 : -1) * (big ? 6 : 9) });
    });
    // moored: close to the quay, nose along it, every so often
    for (let i = 60; i < RIVER.n - 60; i += 52) {
      const side = i % 104 === 8 ? 1 : -1; if (BRIDGES.some(br => { const pos = br.axis === 'z' ? RIVER.x[i] - br.c : RIVER.z[i] - br.c; return Math.abs(pos) < 40; })) continue;
      const g = hull(6, hulls[(i / 52 | 0) % hulls.length], WHITE, false), m = new THREE.Mesh(g.geometry(), M.props), off = RIVER.w[i] - 2.0;
      m.position.set(RIVER.x[i] - RIVER.tz[i] * off * side, WATER_Y + 0.15, RIVER.z[i] + RIVER.tx[i] * off * side); m.rotation.y = Math.atan2(RIVER.tx[i], RIVER.tz[i]) - Math.PI / 2; root.add(m);
      sites.push({ name: 'boat', group: m, x: m.position.x, z: m.position.z, show: 500 });
    }
  }
  const at = (s, side) => { let i = 1; while (i < RIVER.n - 1 && RIVER.s[i] < s) i++; return [RIVER.x[i] - RIVER.tz[i] * side, RIVER.z[i] + RIVER.tx[i] * side, Math.atan2(RIVER.tx[i], RIVER.tz[i])]; };

  return {
    group: root, sites, boats, wheel,
    update(dt, x, z) {
      for (const s of sites) s.group.visible = Math.hypot(s.x - x, s.z - z) < s.show;
      if (wheel && wheel.wm.parent.visible) {
        wheel.ang += dt * 0.045; wheel.wm.rotation.z = wheel.ang;
        for (let k = 0; k < 16; k++) { const a = wheel.ang + k / 16 * Math.PI * 2; wheel.m4.makeTranslation(wheel.x + Math.cos(a) * wheel.R, wheel.hubY + Math.sin(a) * wheel.R, wheel.z); wheel.gond.setMatrixAt(k, wheel.m4); }
        wheel.gond.instanceMatrix.needsUpdate = true;
      }
      for (const b of boats) {
        b.s += b.v * dt; if (b.s > b.s1 || b.s < b.s0) { b.v = -b.v; b.s = Math.max(b.s0, Math.min(b.s1, b.s)); }
        const [px, pz, h] = at(b.s, b.side); b.mesh.position.set(px, WATER_Y + 0.15, pz); b.mesh.rotation.y = h + (b.v > 0 ? -Math.PI / 2 : Math.PI / 2);
        b.mesh.visible = Math.hypot(px - x, pz - z) < 520;
      }
    },
    materials: [lawn, M.glow],
  };
}
