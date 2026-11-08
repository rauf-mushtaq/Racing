// Roads that are not on the grid: two long diagonal boulevards cutting across it at 45 degrees (so the blocks they pass through become pentagons and
// triangles, and buildings become wedges) and two roads that spiral up the hills. Everything about them is here as plain numbers: where they run,
// the distance to them, which of the city's lots they cut (and how), so the graphics, the physics, the traffic and the tests agree.
//
// The diagonals are placed on lines z = x + 90 + 180k and x + z = 90 + 180k, which pass exactly half way between road junctions, so they never go
// near one (they cross the grid's roads in the middle of a stretch), and through the middle of the blocks.
import { SP, N } from './grid.js';
import { isRound } from './junctions.js';

const STEP = 12;
function densify(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP)); for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  return out;
}
// A spiral round a hill from a start point on a grid road in to a lookout near the top.
function spiral(cx, cz, from, rEnd, turns, dir = 1) {
  const r0 = Math.hypot(from[0] - cx, from[1] - cz), a0 = Math.atan2(from[1] - cz, from[0] - cx), pts = [], n = 160;
  for (let k = 0; k <= n; k++) { const t = k / n, r = r0 + (rEnd - r0) * Math.pow(t, 0.9), a = a0 + dir * t * turns * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return pts;
}
// Keep a winding road clear of road junctions (a roundabout more so): push its points away from the nearest one and smooth it, a few times over.
function clearOfNodes(pts) {
  let p = pts.map(q => q.slice());
  for (let it = 0; it < 14; it++) {
    for (const q of p) {
      const ni = Math.round(q[0] / SP), nj = Math.round(q[1] / SP), nx = ni * SP, nz = nj * SP, need = isRound(ni, nj) ? 100 : 66, d = Math.hypot(q[0] - nx, q[1] - nz);
      if (d < need) { const ux = d > 1e-3 ? (q[0] - nx) / d : 1, uz = d > 1e-3 ? (q[1] - nz) / d : 0; q[0] = nx + ux * need; q[1] = nz + uz * need; }
    }
    p = p.map((q, i) => (i === 0 || i === p.length - 1) ? q : [(p[i - 1][0] + 2 * q[0] + p[i + 1][0]) / 4, (p[i - 1][1] + 2 * q[1] + p[i + 1][1]) / 4]);
  }
  return p;
}
export const AVENUES = [
  { id: 'grand', name: 'Grand Diagonal', kind: 'diag', hw: 11, sw: 5, pts: densify([[-2160, -810], [810, 2160]]) },
  { id: 'cross', name: 'Cross Diagonal', kind: 'diag', hw: 11, sw: 5, pts: densify([[2160, -450], [450, 1260]]) },
  { id: 'skyline', name: 'Skyline Drive', kind: 'hill', hw: 5.4, sw: 2.4, pts: densify(clearOfNodes(densify(spiral(-1450, -1350, [-1260, -990], 120, 1.12, 1)))) },
  { id: 'mesa', name: 'Mesa Drive', kind: 'hill', hw: 5.4, sw: 2.4, pts: densify(clearOfNodes(densify(spiral(1500, 1250, [1260, 990], 110, 1.1, -1)))) },
];
for (const A of AVENUES) {
  const n = A.pts.length; A.n = n; A.x = new Float32Array(n); A.z = new Float32Array(n); A.s = new Float32Array(n); A.tx = new Float32Array(n); A.tz = new Float32Array(n);
  A.pts.forEach((p, i) => { A.x[i] = p[0]; A.z[i] = p[1]; if (i) A.s[i] = A.s[i - 1] + Math.hypot(p[0] - A.pts[i - 1][0], p[1] - A.pts[i - 1][1]); });
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = A.x[b] - A.x[a], dz = A.z[b] - A.z[a], l = Math.hypot(dx, dz) || 1; A.tx[i] = dx / l; A.tz[i] = dz / l; }
  A.length = A.s[n - 1]; A.W = A.hw + A.sw;                                  // (the road, and the road with its pavement)
}

// --- Finding the nearest road: a grid of buckets of 64 m, and a coarse yes/no map to skip most places at once -------------------
const BC = 64, buckets = new Map(), bk = (cx, cz) => cx * 8192 + cz;
const GN = Math.ceil(2 * 2300 / BC) + 2, near = new Uint8Array(GN * GN), gi = v => Math.floor((v + 2300) / BC);
AVENUES.forEach((A, ai) => {
  for (let i = 0; i < A.n - 1; i++) {
    const mx = (A.x[i] + A.x[i + 1]) / 2, mz = (A.z[i] + A.z[i + 1]) / 2, k = bk(Math.floor(mx / BC), Math.floor(mz / BC));
    let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(ai * 100000 + i);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const x = gi(mx) + dx, z = gi(mz) + dz; if (x >= 0 && z >= 0 && x < GN && z < GN) near[z * GN + x] = 1; }
  }
});
const _r = { d: 0, a: null, i: 0, t: 0 };
// The nearest centre line within about 60 m: { d, a (the avenue), i, t }, or null.
export function nearestAvenue(x, z) {
  if (x < -2300 || x > 2300 || z < -2300 || z > 2300 || !near[gi(z) * GN + gi(x)]) return null;
  const cx = Math.floor(x / BC), cz = Math.floor(z / BC); let bd = 1e18, bi = -1, bt = 0, ba = null;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const list = buckets.get(bk(cx + dx, cz + dz)); if (!list) continue;
    for (const ref of list) {
      const A = AVENUES[(ref / 100000) | 0], i = ref % 100000, ax = A.x[i], az = A.z[i], ex = A.x[i + 1] - ax, ez = A.z[i + 1] - az, l2 = ex * ex + ez * ez || 1;
      let t = ((x - ax) * ex + (z - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; const px = ax + ex * t - x, pz = az + ez * t - z, d2 = px * px + pz * pz;
      if (d2 < bd) { bd = d2; bi = i; bt = t; ba = A; }
    }
  }
  if (!ba) return null; _r.d = Math.sqrt(bd); _r.a = ba; _r.i = bi; _r.t = bt; return _r;
}
// Signed distance to the edge of the road surface (negative on it) / to the edge of the road and its pavements.
export function roadSdf(x, z) { const r = nearestAvenue(x, z); return r ? r.d - r.a.hw : 99; }
export function wideSdf(x, z) { const r = nearestAvenue(x, z); return r ? r.d - r.a.W : 99; }
export const onAvenue = (x, z) => roadSdf(x, z) < 0;
export function nearAvenueArea(x0, z0, x1, z1) { for (let x = gi(x0); x <= gi(x1); x++) for (let z = gi(z0); z <= gi(z1); z++) if (x >= 0 && z >= 0 && x < GN && z < GN && near[z * GN + x]) return true; return false; }

// --- Cutting a lot: what is left of a rectangle once the road and its pavements are taken out ------------------------------------
// For a diagonal: up to two convex pieces (one each side), clipped by the edge of the pavement. For a hill road: null (the lot goes to lawn).
function clip(poly, nx, nz, c) {                                      // keep the part with nx*x + nz*z >= c (Sutherland-Hodgman, convex)
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = nx * a[0] + nz * a[1] - c, db = nx * b[0] + nz * b[1] - c;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
export const polyArea = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; };
// Does the lot (a rectangle) touch the road's pavement or come within `m` of it? Returns the nearest road's record (see nearestAvenue) or null.
export function lotAvenue(lot, m = 0) {
  let best = null;
  for (const fx of [0, 0.25, 0.5, 0.75, 1]) for (const fz of [0, 0.25, 0.5, 0.75, 1]) {
    const r = nearestAvenue(lot.x0 + (lot.x1 - lot.x0) * fx, lot.z0 + (lot.z1 - lot.z0) * fz);
    if (r && r.d < r.a.W + m && (!best || r.d < best.d)) best = { d: r.d, a: r.a, i: r.i };
  }
  return best;
}
export function clipLot(lot, hit) {
  const A = hit.a, i = hit.i, tx = A.tx[i], tz = A.tz[i], nx = -tz, nz = tx, px = A.x[i], pz = A.z[i], off = A.W + 0.4;
  const rect = [[lot.x0, lot.z1], [lot.x1, lot.z1], [lot.x1, lot.z0], [lot.x0, lot.z0]], base = nx * px + nz * pz, out = [];
  const a = clip(rect, nx, nz, base + off), b = clip(rect, -nx, -nz, -base + off);               // each side of the road
  if (a.length >= 3) out.push(a); if (b.length >= 3) out.push(b);
  return out;
}
