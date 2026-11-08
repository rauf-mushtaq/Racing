// The river: where it runs, how wide it is, where the roads cross it, and what is under any point. Pure numbers (no three.js), so the
// graphics, the car, the people and the tests all ask the same questions and get the same answers.
//
// The river enters from a lake in the west, winds east through the north of downtown and ends in a second lake in the east. It
// stays inside one "band" of blocks between two streets for most of its length (so it never runs over a junction), steps across one
// street in the middle, and crosses the avenues on bridges. Everything is measured in metres on the city's own coordinates.
import { SP, N, hw, medianHalf, SIDEWALK } from './grid.js';

export const WATER_Y = -2.0;          // the water surface, 2.15 m below the pavement
export const QUAY_Y = 0.15;           // top of the quay walls (the kerb height)

// x, z, half width of the water. The first and last points are inside the lakes.
const KNOTS = [
  [-1010, -264, 13], [-900, -268, 17], [-760, -296, 20], [-610, -262, 22], [-450, -226, 22], [-300, -236, 23],
  [-150, -286, 25], [0, -296, 29], [150, -272, 25], [260, -256, 22], [360, -250, 22], [450, -182, 22],
  [545, -112, 22], [650, -84, 23], [780, -72, 24], [900, -62, 21], [985, -86, 13],
];
// Lakes: centre, radii, and a little wobble so the outline isn't an ellipse.
export const LAKES = [
  { name: 'Sunset Lake', cx: -990, cz: -270, rx: 66, rz: 56, a: 0.4, b: 2.1 },
  { name: 'East Basin', cx: 992, cz: -90, rx: 66, rz: 58, a: 1.3, b: 0.2 },
];
const lakeR = (L, t) => 1 + 0.05 * Math.sin(3 * t + L.a) + 0.035 * Math.sin(5 * t + L.b);
export function lakeOutline(L, n = 72) {
  const out = [];
  for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2, r = lakeR(L, t); out.push([L.cx + Math.cos(t) * L.rx * r, L.cz + Math.sin(t) * L.rz * r]); }
  return out;
}

// --- The centre line: a Catmull-Rom curve through the knots, resampled every 3 m -------------------
function curve(knots, step) {
  const dense = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const p0 = knots[Math.max(0, i - 1)], p1 = knots[i], p2 = knots[i + 1], p3 = knots[Math.min(knots.length - 1, i + 2)];
    for (let k = 0; k < 24; k++) {
      const t = k / 24, t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  dense.push(knots[knots.length - 1].slice());
  const out = [dense[0]]; let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - carry;
    while (t <= d) { const u = t / d; out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]); t += step; }
    carry = d - (t - step);
  }
  out.push(dense[dense.length - 1]);
  return out;
}
const pts = curve(KNOTS, 3);
export const RIVER = { n: pts.length, x: new Float32Array(pts.length), z: new Float32Array(pts.length), w: new Float32Array(pts.length), s: new Float32Array(pts.length), tx: new Float32Array(pts.length), tz: new Float32Array(pts.length) };
pts.forEach((p, i) => { RIVER.x[i] = p[0]; RIVER.z[i] = p[1]; RIVER.w[i] = p[2]; if (i) RIVER.s[i] = RIVER.s[i - 1] + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); });
for (let i = 0; i < RIVER.n; i++) {
  const a = Math.max(0, i - 1), b = Math.min(RIVER.n - 1, i + 1), dx = RIVER.x[b] - RIVER.x[a], dz = RIVER.z[b] - RIVER.z[a], l = Math.hypot(dx, dz) || 1;
  RIVER.tx[i] = dx / l; RIVER.tz[i] = dz / l;
}
RIVER.length = RIVER.s[RIVER.n - 1];

// --- Distance to the water ----------------------------------------------------------------------------
const BC = 64, MAXD = 56, buckets = new Map();
const bk = (cx, cz) => cx * 8192 + cz;
for (let i = 0; i < RIVER.n - 1; i++) {
  const mx = (RIVER.x[i] + RIVER.x[i + 1]) / 2, mz = (RIVER.z[i] + RIVER.z[i + 1]) / 2, k = bk(Math.floor(mx / BC), Math.floor(mz / BC));
  let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(i);
}
const lakeSdf = (L, x, z) => { const dx = (x - L.cx) / L.rx, dz = (z - L.cz) / L.rz, q = Math.hypot(dx, dz); return (q - lakeR(L, Math.atan2(dz, dx))) * Math.min(L.rx, L.rz); };
// The nearest bit of the river's centre line: { d (distance), i, t, w (half width there) }; null if there is none within about 56 m.
const _n = { d: 0, i: 0, t: 0, w: 0 };
function nearest(x, z) {
  const cx = Math.floor(x / BC), cz = Math.floor(z / BC);
  let bd = 1e18, bi = -1, bt = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const a = buckets.get(bk(cx + dx, cz + dz)); if (!a) continue;
    for (const i of a) {
      const ax = RIVER.x[i], az = RIVER.z[i], ex = RIVER.x[i + 1] - ax, ez = RIVER.z[i + 1] - az, l2 = ex * ex + ez * ez || 1;
      let t = ((x - ax) * ex + (z - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + ex * t - x, pz = az + ez * t - z, d2 = px * px + pz * pz;
      if (d2 < bd) { bd = d2; bi = i; bt = t; }
    }
  }
  if (bi < 0) return null;
  _n.d = Math.sqrt(bd); _n.i = bi; _n.t = bt; _n.w = RIVER.w[bi] + (RIVER.w[bi + 1] - RIVER.w[bi]) * bt;
  return _n;
}
// Signed distance to the water's edge: negative in the water. Reliable to about 50 m out (past that it just says 99).
export function lakesSdf(x, z) {
  let d = 99;
  for (const L of LAKES) { if (Math.abs(x - L.cx) < L.rx + MAXD && Math.abs(z - L.cz) < L.rz + MAXD) d = Math.min(d, lakeSdf(L, x, z)); }
  return d;
}
export function streamSdf(x, z) { const n = nearest(x, z); return n ? n.d - n.w : 99; }
export function riverSdf(x, z) { return Math.min(lakesSdf(x, z), streamSdf(x, z)); }
// The box that holds all the water, with room to spare (the ground is cut by a texture of this area).
export const RIVER_BOX = (() => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < RIVER.n; i++) { x0 = Math.min(x0, RIVER.x[i] - RIVER.w[i]); x1 = Math.max(x1, RIVER.x[i] + RIVER.w[i]); z0 = Math.min(z0, RIVER.z[i] - RIVER.w[i]); z1 = Math.max(z1, RIVER.z[i] + RIVER.w[i]); }
  for (const L of LAKES) { x0 = Math.min(x0, L.cx - L.rx * 1.1); x1 = Math.max(x1, L.cx + L.rx * 1.1); z0 = Math.min(z0, L.cz - L.rz * 1.1); z1 = Math.max(z1, L.cz + L.rz * 1.1); }
  const m = 60; return { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
})();
export const inRiverBox = (x, z, m = 0) => x > RIVER_BOX.x0 - m && x < RIVER_BOX.x1 + m && z > RIVER_BOX.z0 - m && z < RIVER_BOX.z1 + m;
// Is a point within `m` metres of the water (cheap rejection for everything that doesn't care)?
export function nearWater(x, z, m = 0) { return riverSdf(x, z) < m; }
// The edge of the water at distance `s` along the river, left (side = 1) or right (-1) of the direction of flow.
export function bankPoint(i, side, off = 0) { const w = RIVER.w[i] + off; return [RIVER.x[i] - RIVER.tz[i] * w * side, RIVER.z[i] + RIVER.tx[i] * w * side]; }

// --- Bridges: wherever the centre line crosses a road ---------------------------------------------------------
// A bridge is an axis-aligned deck. `axis` 'z' means the road runs north-south (an avenue at x = c), 'x' east-west. The deck runs
// from u0 to u1 along the road and is `W` metres either side of the road's centre line (the road and a pavement each side).
const margin = 3;
export const BRIDGES = [];
{
  const seen = new Set();
  for (let i = 0; i < RIVER.n - 1; i++) {
    for (const axis of ['z', 'x']) {
      const a = axis === 'z' ? RIVER.x[i] : RIVER.z[i], b = axis === 'z' ? RIVER.x[i + 1] : RIVER.z[i + 1];
      const ka = Math.floor(a / SP), kb = Math.floor(b / SP);
      if (ka === kb) continue;
      const k = Math.max(ka, kb); if (Math.abs(k) > N) continue;
      const id = axis + k; if (seen.has(id)) continue; seen.add(id);
      const t = (k * SP - a) / (b - a), pos = axis === 'z' ? RIVER.z[i] + (RIVER.z[i + 1] - RIVER.z[i]) * t : RIVER.x[i] + (RIVER.x[i + 1] - RIVER.x[i]) * t;
      const c = k * SP, W = hw(k) + SIDEWALK + 1;
      let u0 = 1e9, u1 = -1e9;
      for (let u = pos - 150; u <= pos + 150; u += 1) for (const v of [-W, -W / 2, 0, W / 2, W]) {
        const x = axis === 'z' ? c + v : u, z = axis === 'z' ? u : c + v;
        if (riverSdf(x, z) < 0) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); }
      }
      if (u1 < u0) continue;
      BRIDGES.push({ id, axis, k, c, pos, u0: u0 - margin, u1: u1 + margin, W, hw: hw(k), blvd: medianHalf(k) > 0, H: 0, type: 'girder' });
    }
  }
  BRIDGES.sort((p, q) => (p.axis === 'z' ? p.c : p.pos) - (q.axis === 'z' ? q.c : q.pos));
  for (const b of BRIDGES) { b.L = b.u1 - b.u0; b.uc = (b.u0 + b.u1) / 2; }
}
// What each crossing is. Boulevards get the big ones; the rest take turns. `H` is how high the deck rises over the middle.
const TYPE_BY_ID = {
  'z-8': null,
  'z-5': ['arch', 2.1], 'z-4': ['tower', 0.0], 'z-3': ['girder', 0.0], 'z-2': ['truss', 0.0], 'z-1': ['shops', 1.2], 'z0': ['suspension', 0.0],
  'z1': ['arch', 2.2], 'x-1': ['arch', 1.8], 'z2': ['truss', 0.0], 'z3': ['girder', 0.6], 'z4': ['stay', 1.0], 'z5': ['shops', 1.0],
};
for (const b of BRIDGES) { const t = TYPE_BY_ID[b.id]; if (t) { b.type = t[0]; b.H = t[1]; } else { b.type = 'girder'; b.H = 0; } }

// Deck height at distance u along the bridge: a gentle hump (a sine, flat at the ends so it meets the road).
export function deckY(b, u) {
  if (!b.H) return 0;
  const t = (u - b.u0) / b.L; if (t <= 0 || t >= 1) return 0;
  return b.H * Math.pow(Math.sin(Math.PI * t), 0.9);
}
// The bridge whose deck is under a point (axis-aligned rectangles), or null.
export function bridgeAt(x, z) {
  for (const b of BRIDGES) {
    const u = b.axis === 'z' ? z : x, v = (b.axis === 'z' ? x : z) - b.c;
    if (u >= b.u0 && u <= b.u1 && v >= -b.W && v <= b.W) return b;
  }
  return null;
}
// The height and kind of surface the river system makes at a point, or null if it has nothing to say: the deck of a bridge, or
// water. (Everything else is the normal city ground.)
const _s = { y: 0, grass: false, water: false };
export function waterSurface(x, z) {
  if (!inRiverBox(x, z)) return null;
  const b = bridgeAt(x, z);
  if (b) {
    const u = b.axis === 'z' ? z : x, v = Math.abs((b.axis === 'z' ? x : z) - b.c);
    _s.y = deckY(b, u) + (v > b.hw + 0.4 ? 0.15 : 0); _s.water = false; return _s;
  }
  if (riverSdf(x, z) < 0) { _s.y = WATER_Y; _s.water = true; return _s; }
  return null;
}
// Is this point in the water, not on a bridge? `pad` shrinks the water (negative) or grows it.
export function inWater(x, z, pad = 0) { return riverSdf(x, z) < pad && !bridgeAt(x, z); }

// Keep something that walks or drives out of the water: if the point (o.x, o.z) is closer than `r` to the water's edge (and not on a
// bridge) it is pushed back to `r` away. Returns the push's direction [nx, nz] if it moved, else null.
const _push = [0, 0];
export function pushFromWater(o, r = 0.5, px = o.x, pz = o.z) {
  if (!inRiverBox(px, pz, r + 2)) return null;
  const d = riverSdf(px, pz); if (d >= r) return null;
  if (bridgeAt(px, pz)) return null;
  let gx = riverSdf(px + 1, pz) - riverSdf(px - 1, pz), gz = riverSdf(px, pz + 1) - riverSdf(px, pz - 1); const l = Math.hypot(gx, gz);
  if (l < 1e-4) return null; gx /= l; gz /= l;
  o.x += gx * (r - d); o.z += gz * (r - d); _push[0] = gx; _push[1] = gz; return _push;
}
