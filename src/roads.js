// Roads outside the city, built as ribbons following the road network in
// world.js, a tile at a time as the terrain streams in: motorways with lane
// markings, median barriers and guardrails; bridges with parapets and piers; the
// runway with its markings; narrow service roads. Barriers are solid to the car.
import * as THREE from 'three';
import { GB, ccw } from './geom.js';
import { ROADS, baseHeight } from './world.js';
import { addCollider, removeColliders } from './city.js';
import { TILE } from './terrain.js';

const WHITE = new THREE.Color(0.92, 0.92, 0.88), YELLOW = new THREE.Color(0.95, 0.72, 0.15), CONC = new THREE.Color(0.7, 0.68, 0.65), CONC2 = new THREE.Color(0.55, 0.53, 0.5);
const GRAV = new THREE.Color(0.52, 0.47, 0.4), STEEL = new THREE.Color(0.74, 0.76, 0.78), POST = new THREE.Color(0.5, 0.52, 0.55);

// Where the roads join others, so the guardrail leaves a gap there.
const junctions = [];
for (const R of ROADS) {
  if (R.kind === 'service') junctions.push([R.x[0], R.z[0]]);
  if (R.kind === 'motorway' && !R.closed) junctions.push([R.x[R.x.length - 1], R.z[R.z.length - 1]]);
}
const nearJunction = (x, z, r) => junctions.some(j => (j[0] - x) ** 2 + (j[1] - z) ** 2 < r * r);

// Which stretches are bridges (the road is well above the ground).
for (const R of ROADS) {
  R.under = new Float32Array(R.x.length); R.bridge = new Uint8Array(R.x.length);
  for (let i = 0; i < R.x.length; i++) { R.under[i] = baseHeight(R.x[i], R.z[i]); R.bridge[i] = R.y[i] - R.under[i] > 5 ? 1 : 0; }
}
// Which tile each road segment belongs to (by its midpoint).
const segs = new Map();
for (const R of ROADS) for (let i = 0; i < R.x.length - 1; i++) {
  const k = Math.floor((R.x[i] + R.x[i + 1]) / 2 / TILE) + ',' + Math.floor((R.z[i] + R.z[i + 1]) / 2 / TILE);
  let a = segs.get(k); if (!a) segs.set(k, a = []); a.push([R, i]);
}

// A point on the road with its sideways direction, so ribbons can be laid either side of it.
function pt(R, k) {
  const a = Math.max(0, k - 1), b = Math.min(R.x.length - 1, k + 1);
  let tx = R.x[b] - R.x[a], tz = R.z[b] - R.z[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
  return { x: R.x[k], z: R.z[k], y: R.y[k] + R.lift, rx: -tz, rz: tx, tx, tz, s: R.s[k] };
}
const mix = (A, B, t) => { const rx = A.rx + (B.rx - A.rx) * t, rz = A.rz + (B.rz - A.rz) * t, l = Math.hypot(rx, rz) || 1; return { x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t, y: A.y + (B.y - A.y) * t, rx: rx / l, rz: rz / l, tx: A.tx, tz: A.tz, s: A.s + (B.s - A.s) * t }; };
const P = (p, l, dy = 0) => [p.x + p.rx * l, p.y + dy, p.z + p.rz * l];

// A flat ribbon between sideways offsets l1 and l2 over the stretch A to B.
function ribbon(gb, A, B, l1, l2, dy, col, uvScale = 0) {
  const u1 = l1 / 10, u2 = l2 / 10, v1 = A.s / 10, v2 = B.s / 10;
  gb.q4(P(A, l1, dy), P(A, l2, dy), P(B, l2, dy), P(B, l1, dy), uvScale ? [[u1, v1], [u2, v1], [u2, v2], [u1, v2]] : [[0, 0], [1, 0], [1, 1], [0, 1]], col);
}
// A sloping ribbon from (l1, dy1) to (l2, dy2).
function slope(gb, A, B, l1, dy1, l2, dy2, col) { gb.q4(P(A, l1, dy1), P(A, l2, dy2), P(B, l2, dy2), P(B, l1, dy1), [[0, 0], [1, 0], [1, 1], [0, 1]], col); }
// A vertical wall along the road at offset l, from dy0 up to dy1.
function wall(gb, A, B, l, dy0, dy1, col) { gb.q4(P(A, l, dy0), P(B, l, dy0), P(B, l, dy1), P(A, l, dy1), [[0, 0], [1, 0], [1, 1], [0, 1]], col); }

export function initRoads(terrain, city) {
  const std = o => new THREE.MeshStandardMaterial(o);
  const mats = {
    asph: city.mat.asphalt, mark: city.mat.mark,
    conc: std({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    metal: std({ vertexColors: true, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }),
    grav: std({ vertexColors: true, roughness: 1 }),
  };
  for (const R of ROADS) R.lift = R.kind === 'motorway' ? (R.closed ? 0 : 0.03) : R.kind === 'runway' ? 0.02 : 0.05;

  terrain.onTile(tile => {
    const list = segs.get(tile.tx + ',' + tile.tz);
    if (!list) return;
    const G = { asph: new GB(), mark: new GB(true), conc: new GB(true), metal: new GB(true), grav: new GB(true) };
    for (const [R, i] of list) emit(G, R, i, tile);
    for (const k of Object.keys(G)) {
      if (!G[k].count) continue;
      const m = new THREE.Mesh(G[k].geometry(), mats[k]);
      m.castShadow = k === 'conc' || k === 'metal'; m.receiveShadow = true; tile.group.add(m);
    }
    tile.disposers.push(() => removeColliders(tile.colliders));
  });
  return Object.values(mats);

  function emit(G, R, i, tile) {
    const A = pt(R, i), B = pt(R, i + 1), hw = R.hw, motorway = R.kind === 'motorway', bridge = R.bridge[i] || R.bridge[i + 1];
    ribbon(G.asph, A, B, -hw, hw, 0, WHITE, 1);
    if (!bridge) { slope(G.grav, A, B, -hw, 0, -hw - 3.6, -1.3, GRAV); slope(G.grav, A, B, hw, 0, hw + 3.6, -1.3, GRAV); }
    if (R.kind === 'runway') return runwayMarks(G, R, A, B, i);
    const dy = 0.02;
    if (motorway) {
      for (const sd of [-1, 1]) {
        ribbon(G.mark, A, B, sd * (hw - 0.55) - 0.075, sd * (hw - 0.55) + 0.075, dy, WHITE);            // edge lines
        ribbon(G.mark, A, B, sd * 1.55 - 0.075, sd * 1.55 + 0.075, dy, YELLOW);                          // lines beside the barrier
        const d0 = mix(A, B, 0), d1 = mix(A, B, 0.25);                                                   // one 3 m dash every 12 m
        ribbon(G.mark, d0, d1, sd * 5.2 - 0.075, sd * 5.2 + 0.075, dy, WHITE);
      }
      // Median barrier (it stops short of a junction with another motorway).
      if (!(!R.closed && (R.s[R.s.length - 1] - A.s) < 40)) {
        slope(G.conc, A, B, -0.45, 0, -0.14, 0.85, CONC); slope(G.conc, A, B, -0.14, 0.85, 0.14, 0.85, CONC2); slope(G.conc, A, B, 0.14, 0.85, 0.45, 0, CONC);
        for (let k = 0; k < 5; k++) { const t = mix(A, B, k / 5); addCollider({ type: 'circ', x: t.x, z: t.z, r: 0.8 }, tile.colliders); }
      }
    } else if (R.kind === 'service') {
      ribbon(G.mark, A, B, -hw + 0.3 - 0.06, -hw + 0.3 + 0.06, dy, WHITE); ribbon(G.mark, A, B, hw - 0.3 - 0.06, hw - 0.3 + 0.06, dy, WHITE);
    }
    if (!motorway) return;
    if (bridge) {                                                                                        // parapets, a deck edge and piers
      for (const sd of [-1, 1]) {
        const o = sd * (hw + 0.1);
        wall(G.conc, A, B, o + sd * 0.25, -1.6, 0.95, CONC); wall(G.conc, A, B, o - sd * 0.25, 0, 0.95, CONC);
        ribbon(G.conc, A, B, o - 0.25, o + 0.25, 0.95, CONC2);
        for (let k = 0; k < 5; k++) { const t = mix(A, B, k / 5); addCollider({ type: 'circ', x: t.x + t.rx * o, z: t.z + t.rz * o, r: 1.0 }, tile.colliders); }
      }
      ribbon(G.conc, A, B, -hw - 0.35, hw + 0.35, -1.6, CONC2);
      if (i % 3 === 0) {
        const under = Math.min(R.under[i], R.under[i + 1]) - 1.5, top = A.y - 1.6;
        if (top - under > 1) {
          const cx = A.x, cz = A.z, f = [A.tx, A.tz], r = [A.rx, A.rz], hx = hw - 2.5, hl = 1.3;
          const poly = ccw([[-hx, -hl], [hx, -hl], [hx, hl], [-hx, hl]].map(([a, b]) => [cx + r[0] * a + f[0] * b, cz + r[1] * a + f[1] * b]));
          G.conc.extrude(poly, under, top, 4, 4, CONC2, 0, false);
        }
      }
      return;
    }
    // Guardrail on both sides: a steel beam on posts, solid to the car except at junctions.
    for (const sd of [-1, 1]) {
      const o = sd * (hw + 0.55);
      if (nearJunction(A.x + A.rx * o, A.z + A.rz * o, 30)) continue;
      wall(G.metal, A, B, o, 0.5, 0.86, STEEL);
      for (let k = 0; k < 3; k++) {                                                                      // a post every 4 m
        const t = mix(A, B, k / 3), px = t.x + t.rx * (o + sd * 0.1), pz = t.z + t.rz * (o + sd * 0.1), py = t.y - 0.1;
        G.metal.q4([px - t.tx * 0.06, py, pz - t.tz * 0.06], [px + t.tx * 0.06, py, pz + t.tz * 0.06], [px + t.tx * 0.06, py + 0.95, pz + t.tz * 0.06], [px - t.tx * 0.06, py + 0.95, pz - t.tz * 0.06], [[0, 0], [1, 0], [1, 1], [0, 1]], POST);
      }
      for (let k = 0; k < 6; k++) { const t = mix(A, B, k / 6); addCollider({ type: 'circ', x: t.x + t.rx * (o + sd * 0.4), z: t.z + t.rz * (o + sd * 0.4), r: 1.0 }, tile.colliders); }
    }
  }

  // The runway: edge lines, a dashed centre line, thresholds, and aiming and touchdown marks.
  function runwayMarks(G, R, A, B, i) {
    const hw = R.hw, dy = 0.02, L = R.len, a = A.s, b = B.s;
    const bar = (s0, s1, l0, l1) => { const lo = Math.max(a, s0), hi = Math.min(b, s1); if (hi <= lo) return; ribbon(G.mark, mix(A, B, (lo - a) / (b - a)), mix(A, B, (hi - a) / (b - a)), l0, l1, dy, WHITE); };
    for (const sd of [-1, 1]) bar(a, b, sd * (hw - 1.1) - 0.2, sd * (hw - 1.1) + 0.2);
    for (let s = 60; s < L - 60; s += 50) bar(s, s + 30, -0.45, 0.45);
    for (const [s0, dir] of [[8, 1], [L - 8, -1]]) for (let l = -hw + 3.5; l < hw - 3; l += 4.2) { if (Math.abs(l) < 1.6) continue; bar(Math.min(s0, s0 + dir * 30), Math.max(s0, s0 + dir * 30), l - 0.9, l + 0.9); }
    for (const s of [300, L - 300]) for (const sd of [-1, 1]) bar(s - 22, s + 22, sd * 10 - 1.5, sd * 10 + 1.5);
    for (const s of [450, 600, L - 450, L - 600]) for (const sd of [-1, 1]) bar(s - 11, s + 11, sd * 7 - 1, sd * 7 + 1);
  }
}
