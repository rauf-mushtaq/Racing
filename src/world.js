// The world beyond the city: where things are and what the ground is like.
//
// Everything outside the city square is described by functions of (x, z), so the
// renderer, the physics and the scenery all agree: a coast and sea to the west,
// snowy mountains to the north, desert with mesas and a great canyon to the
// east, scrubland to the south. A motorway ring with four spokes joins them, and
// hidden service roads lead to a desert airfield and two secret bunkers.
//
// North is -z, east is +x. Heights are in metres, with the city at 0.
import { fbm, clamp, lerp } from './util.js';
import { EDGE, LIMIT, surfaceAt } from './city.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const SEA_Y = -1.2;
export const WORLD = { x0: -4400, x1: 7800, z0: -7800, z1: 7800 };
export const WORLD_LIM = { x0: -3150, x1: 7650, z0: -7650, z1: 7650 };

// ---------------------------------------------------------------------------
// Climate and base terrain
// ---------------------------------------------------------------------------
export const coastX = z => -3450 + 160 * Math.sin(z / 850) + 90 * Math.sin(z / 260 + 1.3);

// How snowy and how desert-like a place is (0 to 1 each; the rest is grass).
export function climate(x, z) {
  const r = Math.hypot(x, z) + 1, ex = x / r, nz = -z / r;
  const wN = fbm(x * 0.00022 + 3.1, z * 0.00022 + 7.7, 3, 11), wE = fbm(x * 0.00022 + 9.3, z * 0.00022 + 1.9, 3, 12);
  const n = nz + (wN - 0.5) * 0.55, e = ex + (wE - 0.5) * 0.55;
  const snow = smooth(0.30, 0.62, n);
  return { snow, desert: (1 - snow) * smooth(0.10, 0.48, e) };
}

const mountainH = (x, z) => {
  const rd = 1 - Math.abs(2 * fbm(x * 0.00075 + 5.5, z * 0.00075 + 2.2, 5, 51) - 1);
  return 120 + 1100 * Math.pow(rd, 1.7) * (0.35 + 0.9 * fbm(x * 0.0003 + 1, z * 0.0003 + 8, 3, 52));
};
const desertCx = z => 3900 + 70 * Math.sin(z / 520) + 40 * Math.sin(z / 170);
const desertH = (x, z) => {
  const dunes = 14 * fbm(x * 0.0035 + 2, z * 0.0035 + 9, 4, 61) + 6 * fbm(x * 0.012, z * 0.012, 2, 62);
  const q = fbm(x * 0.00055 + 11, z * 0.00055 + 5, 4, 63);
  const mesa = smooth(0.56, 0.585, q);                                        // flat tops with steep sides
  return 8 + dunes + 95 * mesa + 22 * smooth(0.66, 0.69, q) * mesa;
};
// The great canyon across the desert highway (a bridge spans it).
const canyonDepth = (x, z) => 85 * Math.exp(-Math.pow((x - desertCx(z)) / 95, 2)) * smooth(-5200, -4400, z) * smooth(5200, 4400, z);
const grassH = (x, z) => 4 + 36 * Math.max(0, fbm(x * 0.0009 + 4, z * 0.0009 + 1, 4, 71) - 0.35);

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------
export const ROADS = [];
const STEP = 12;

function roundPath(pts, r) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]), ra = Math.min(r, da / 2), rb = Math.min(r, db / 2);
    const A = [p[0] + (a[0] - p[0]) / da * ra, p[1] + (a[1] - p[1]) / da * ra], B = [p[0] + (b[0] - p[0]) / db * rb, p[1] + (b[1] - p[1]) / db * rb];
    for (let k = 0; k <= 14; k++) { const t = k / 14, u = 1 - t; out.push([u * u * A[0] + 2 * u * t * p[0] + t * t * B[0], u * u * A[1] + 2 * u * t * p[1] + t * t * B[1]]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function resample(pts) {
  const out = [pts[0]]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = STEP - carry;
    while (t <= d) { out.push([a[0] + (b[0] - a[0]) * t / d, a[1] + (b[1] - a[1]) * t / d]); t += STEP; }
    carry = d - (t - STEP);
  }
  const last = pts[pts.length - 1], q = out[out.length - 1];
  if (Math.hypot(last[0] - q[0], last[1] - q[1]) > 1) out.push(last);
  return out;
}
// Sideways drift so long roads aren't ruler-straight (zero at both ends).
function wobble(pts, amps, ends = 300) {
  const n = pts.length, s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = s[n - 1], out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    let w = 0; for (const [amp, k, ph] of amps) w += amp * Math.sin(Math.PI * 2 * k * s[i] / L + ph);
    const fade = ends ? Math.min(1, s[i] / ends, (L - s[i]) / ends) : 1;
    out.push([pts[i][0] - tz / l * w * fade, pts[i][1] + tx / l * w * fade]);
  }
  return out;
}

function addRoad(id, kind, xz, hw, closed = false) {
  const R = { id, kind, hw, closed, x: xz.map(p => p[0]), z: xz.map(p => p[1]), y: new Float32Array(xz.length), s: [0] };
  for (let i = 1; i < xz.length; i++) R.s.push(R.s[i - 1] + Math.hypot(R.x[i] - R.x[i - 1], R.z[i] - R.z[i - 1]));
  R.len = R.s[R.s.length - 1]; R.idx = ROADS.length; ROADS.push(R);
  return R;
}
const nearestPoint = (R, x, z) => { let bi = 0, bd = 1e18; for (let i = 0; i < R.x.length; i++) { const d = (R.x[i] - x) ** 2 + (R.z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; };

const MW = 11.3;                     // motorway half width
// The ring motorway (a loop, with the coast highway on its west side) ...
const ringPts = wobble(resample(roundPath([[0, -6200], [6500, -6200], [6500, 6200], [-2800, 6200], [-2800, -6200], [0, -6200]], 700)), [[70, 23, 0.4], [32, 47, 2.1]], 0);
ringPts[ringPts.length - 1] = ringPts[0];
const RING = addRoad('ring', 'motorway', ringPts, MW, true);
// ... and four spokes from the city to it.
const spoke = (id, from, to) => {
  const t = nearestPoint(RING, to[0], to[1]), end = [RING.x[t], RING.z[t]];
  return addRoad(id, 'motorway', wobble(resample([from, end]), [[55, 3, 0.7], [22, 7, 2.4]], 350), MW);
};
const SPOKE_N = spoke('north', [0, -EDGE - 8], [0, -6200]);
const SPOKE_E = spoke('east', [EDGE + 8, 0], [6500, 0]);
const SPOKE_S = spoke('south', [0, EDGE + 8], [0, 6200]);
const SPOKE_W = spoke('west', [-EDGE - 8, 0], [-2800, 0]);

// ---------------------------------------------------------------------------
// Sites: the airfield and the bunkers (the service roads to them are hidden)
// ---------------------------------------------------------------------------
export const AIRFIELD = { name: 'Dry Lake Airfield', x: 5400, z: 3300, r: 520, y: 22, runwayZ0: 2350, runwayZ1: 4500, hw: 24 };
export const BUNKERS = [
  { id: 'alpine', name: 'Site 7 (Alpine)', cx: 1180, cz: -5060, fx: -1, fz: 0, tunnel: { len: 70, w: 10, h: 6 }, hangar: { len: 80, w: 70, h: 14 }, apronY: 0, butte: false },
  { id: 'mesa', name: 'Site 12 (Mesa)', cx: 6150, cz: -1750, fx: -1, fz: 0, tunnel: { len: 70, w: 10, h: 6 }, hangar: { len: 80, w: 70, h: 14 }, apronY: 0, butte: true },
];
export const KEEP_CLEAR = [];                // places where plants and rocks aren't scattered
const APRON = 46;                   // length of the concrete apron in front of a portal

for (const b of BUNKERS) KEEP_CLEAR.push({ x: b.cx + 40, z: b.cz, r: 140 });
KEEP_CLEAR.push({ x: 5400, z: 3300, r: 900 });
// The hidden service roads. They start from a point on a main road and end
// at the apron (or the airfield gate).
{
  const sn = nearestPoint(SPOKE_N, 0, -5060), P = [SPOKE_N.x[sn], SPOKE_N.z[sn]], b = BUNKERS[0];
  addRoad('svc-alpine', 'service', wobble(resample(roundPath([P, [320, -5120], [680, -4960], [960, -5110], [b.cx - APRON, b.cz]], 130)), [[22, 6, 0.3]], 120), 4.4);
  const se = nearestPoint(SPOKE_E, 4900, 0), Q = [SPOKE_E.x[se], SPOKE_E.z[se]], d = BUNKERS[1];
  addRoad('svc-mesa', 'service', wobble(resample(roundPath([Q, [5200, -500], [5700, -1500], [d.cx - APRON, d.cz]], 120)), [[22, 5, 1.1]], 120), 4.4);
  const ra = nearestPoint(RING, 6500, 3300), G = [RING.x[ra], RING.z[ra]];
  addRoad('svc-airfield', 'service', resample([G, [AIRFIELD.x + 160, AIRFIELD.z]]), 5.5);
  // The runway and its taxiway.
  addRoad('runway', 'runway', resample([[AIRFIELD.x, AIRFIELD.runwayZ0], [AIRFIELD.x, AIRFIELD.runwayZ1]]), AIRFIELD.hw);
  addRoad('taxiway', 'service', resample([[AIRFIELD.x, AIRFIELD.z], [AIRFIELD.x + 160, AIRFIELD.z]]), 9);
}

// ---------------------------------------------------------------------------
// Distance to the nearest road (coarse), used to carve valleys round roads
// ---------------------------------------------------------------------------
const DC = 100, DNX = Math.ceil((WORLD.x1 - WORLD.x0) / DC) + 1, DNZ = Math.ceil((WORLD.z1 - WORLD.z0) / DC) + 1;
const distField = new Float32Array(DNX * DNZ).fill(1e4);
for (const R of ROADS) for (let i = 0; i < R.x.length; i++) {
  const cx = Math.round((R.x[i] - WORLD.x0) / DC), cz = Math.round((R.z[i] - WORLD.z0) / DC);
  if (cx >= 0 && cx < DNX && cz >= 0 && cz < DNZ) distField[cz * DNX + cx] = 0;
}
for (let pass = 0; pass < 2; pass++) {                                           // chamfer distance transform
  const fwd = pass === 0;
  for (let zi = fwd ? 0 : DNZ - 1; fwd ? zi < DNZ : zi >= 0; zi += fwd ? 1 : -1) for (let xi = fwd ? 0 : DNX - 1; fwd ? xi < DNX : xi >= 0; xi += fwd ? 1 : -1) {
    let d = distField[zi * DNX + xi];
    for (const [dx, dz, c] of fwd ? [[-1, 0, 100], [0, -1, 100], [-1, -1, 141], [1, -1, 141]] : [[1, 0, 100], [0, 1, 100], [1, 1, 141], [-1, 1, 141]]) {
      const nx = xi + dx, nz = zi + dz;
      if (nx >= 0 && nx < DNX && nz >= 0 && nz < DNZ) d = Math.min(d, distField[nz * DNX + nx] + c);
    }
    distField[zi * DNX + xi] = d;
  }
}
export function roadDist(x, z) {
  const fx = (x - WORLD.x0) / DC, fz = (z - WORLD.z0) / DC;
  const x0 = clamp(Math.floor(fx), 0, DNX - 2), z0 = clamp(Math.floor(fz), 0, DNZ - 2), tx = clamp(fx - x0, 0, 1), tz = clamp(fz - z0, 0, 1);
  const a = distField[z0 * DNX + x0], b = distField[z0 * DNX + x0 + 1], c = distField[(z0 + 1) * DNX + x0], d = distField[(z0 + 1) * DNX + x0 + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

// Terrain before roads and sites are cut into it. It is lowered into broad
// valleys around roads (so they run through passes, not over peaks).
export function baseHeight(x, z) {
  const { snow, desert } = climate(x, z), wg = Math.max(0, 1 - snow - desert);
  const carve = 0.14 + 0.86 * smooth(250, 1100, roadDist(x, z));
  let h = 0;
  if (wg > 0.001) h += grassH(x, z) * wg;
  if (desert > 0.001) h += desertH(x, z) * desert;
  if (snow > 0.001) h += mountainH(x, z) * snow;
  h *= carve;
  if (desert > 0.001) h -= canyonDepth(x, z) * desert;
  h *= smooth(LIMIT - 100, LIMIT + 1300, Math.max(Math.abs(x), Math.abs(z)));
  // The coast: sea to the west, then a beach rising into the land.
  const sh = x - coastX(z);
  const beach = clamp(-4 + sh * 0.015, -34, 3.2);
  return lerp(beach, h, smooth(40, 420, sh));
}

// ---------------------------------------------------------------------------
AIRFIELD.y = Math.max(14, baseHeight(AIRFIELD.x, AIRFIELD.z));

// Road heights: follow the (smoothed) ground, with a gentle gradient
// ---------------------------------------------------------------------------
function profile(R, anchors) {
  const n = R.x.length, g = (R.kind === 'motorway' ? 0.07 : R.kind === 'runway' ? 0.002 : 0.1) * STEP;
  // Roads ignore the canyon (they bridge it) so they run at the height of the rims.
  let y = Float32Array.from({ length: n }, (_, i) => baseHeight(R.x[i], R.z[i]) + canyonDepth(R.x[i], R.z[i]) * climate(R.x[i], R.z[i]).desert);
  if (R.kind === 'runway') { const m = y.reduce((a, b) => a + b, 0) / n; y.fill(m); }
  const smoothPass = (w) => {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = -w; k <= w; k++) { let j = i + k; if (R.closed) j = (j + n - 1) % (n - 1); else j = clamp(j, 0, n - 1); a += y[j]; c++; } o[i] = a / c; }
    y = o;
  };
  smoothPass(14); smoothPass(14);
  if (anchors.length) { for (const [i, val] of anchors) { const d = val - y[i], reach = 500; for (let j = 0; j < n; j++) y[j] += d * (1 - smooth(0, reach, Math.abs(R.s[j] - R.s[i]))); } }
  const pin = () => { for (const [i, val] of anchors) y[i] = val; };
  for (let it = 0; it < 4; it++) {                                              // limit the gradient, holding the anchors
    pin(); for (let i = 1; i < n; i++) y[i] = clamp(y[i], y[i - 1] - g, y[i - 1] + g);
    pin(); for (let i = n - 2; i >= 0; i--) y[i] = clamp(y[i], y[i + 1] - g, y[i + 1] + g);
    if (R.closed) y[n - 1] = y[0];
  }
  pin();
  R.y.set(y);
}
// The ring first; spokes then meet it at its height.
profile(RING, []);
for (const S of [SPOKE_N, SPOKE_E, SPOKE_S, SPOKE_W]) {
  const end = S.x.length - 1, rj = nearestPoint(RING, S.x[end], S.z[end]);
  profile(S, [[0, 0], [end, RING.y[rj]]]);
}
// The sites: aprons sit at the ground height, and their roads end there.
for (const b of BUNKERS) b.apronY = baseHeight(b.cx + b.fx * 30, b.cz + b.fz * 30);
for (const R of ROADS) {
  if (R.kind === 'motorway') continue;
  if (R.id === 'svc-alpine') profile(R, [[0, SPOKE_N.y[nearestPoint(SPOKE_N, R.x[0], R.z[0])]], [R.x.length - 1, BUNKERS[0].apronY]]);
  else if (R.id === 'svc-mesa') profile(R, [[0, SPOKE_E.y[nearestPoint(SPOKE_E, R.x[0], R.z[0])]], [R.x.length - 1, BUNKERS[1].apronY]]);
  else if (R.id === 'svc-airfield') profile(R, [[0, RING.y[nearestPoint(RING, R.x[0], R.z[0])]], [R.x.length - 1, AIRFIELD.y]]);
  else profile(R, []);
}
for (const R of ROADS) if (R.id === 'runway' || R.id === 'taxiway') R.y.fill(AIRFIELD.y);
const sIdx = id => ROADS.find(r => r.id === id);
{ const rwy = sIdx('runway'); rwy.y.fill(AIRFIELD.y); const tw = sIdx('taxiway'); tw.y.fill(AIRFIELD.y); }

// ---------------------------------------------------------------------------
// Finding the road under a point
// ---------------------------------------------------------------------------
const GR = 100, grid = new Map();
const gk = (cx, cz) => (cx + 200) * 1000 + (cz + 200);
for (const R of ROADS) {
  for (let i = 0; i < R.x.length - 1; i++) {
    const ref = R.idx * 1048576 + i, seen = new Set();
    for (const j of [i, i + 1]) {
      const k = gk(Math.floor(R.x[j] / GR), Math.floor(R.z[j] / GR));
      if (seen.has(k)) continue; seen.add(k);
      let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(ref);
    }
  }
}
// The nearest road within about a hundred metres: its distance, height,
// distance along it, and which side of it the point is on.
export function roadAt(x, z) {
  const cx = Math.floor(x / GR), cz = Math.floor(z / GR);
  let bd = 1e18, br = null, bi = 0, bt = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const a = grid.get(gk(cx + dx, cz + dz)); if (!a) continue;
    for (const ref of a) {
      const R = ROADS[(ref / 1048576) | 0], i = ref % 1048576;
      const ax = R.x[i], az = R.z[i], ex = R.x[i + 1] - ax, ez = R.z[i + 1] - az, l2 = ex * ex + ez * ez || 1;
      const t = clamp(((x - ax) * ex + (z - az) * ez) / l2, 0, 1), px = ax + ex * t - x, pz = az + ez * t - z, d2 = px * px + pz * pz;
      if (d2 < bd) { bd = d2; br = R; bi = i; bt = t; }
    }
  }
  if (!br) return null;
  const ex = br.x[bi + 1] - br.x[bi], ez = br.z[bi + 1] - br.z[bi], side = ((x - br.x[bi]) * ez - (z - br.z[bi]) * ex) >= 0 ? 1 : -1;
  return { d: Math.sqrt(bd), road: br, y: br.y[bi] + (br.y[bi + 1] - br.y[bi]) * bt, s: br.s[bi] + (br.s[bi + 1] - br.s[bi]) * bt, i: bi, t: bt, side };
}

// ---------------------------------------------------------------------------
// Stamps: places where the ground is shaped by hand
// ---------------------------------------------------------------------------
// Distance to the airfield's runway (the lakebed is a stadium shape round it).
const lakeDist = (x, z) => Math.hypot(x - AIRFIELD.x, Math.max(0, AIRFIELD.runwayZ0 - z, z - AIRFIELD.runwayZ1));
function stampHeight(x, z, h) {
  // The dry lakebed, perfectly flat.
  const da = lakeDist(x, z);
  if (da < AIRFIELD.r + 800) h = lerp(AIRFIELD.y - 0.05, h, smooth(AIRFIELD.r, AIRFIELD.r + 800, da));
  for (const b of BUNKERS) {
    const dx = x - b.cx, dz = z - b.cz;
    if (Math.abs(dx) > 520 || Math.abs(dz) > 520) continue;
    // u: distance in front of the portal (negative is inside the mountain); v: sideways.
    const u = dx * b.fx + dz * b.fz, v = -dx * b.fz + dz * b.fx;
    if (b.butte && u < 0) {                                                     // a steep-sided butte for the mesa bunker
      const rough = 38 * (fbm(x * 0.012 + 3, z * 0.012 + 8, 3, 91) - 0.5), edge = Math.max(0, -u - 340 + rough, Math.abs(v) - 200 + rough);
      const top = b.apronY + 150 + 8 * (fbm(x * 0.02, z * 0.02, 2, 92) - 0.5), w = (1 - smooth(0, 44, edge)) * smooth(6, 40, -u);   // the face starts behind the portal wall
      h = Math.max(h, lerp(h, top, w));
    }
    if (u < -8 && u > -400) h = Math.max(h, lerp(h, b.apronY + Math.min(60, (-u - 8) * 2.2), smooth(70, 30, Math.abs(v))));   // the slope behind the portal, clear of the door
    if (u > -8 && u < APRON + 20 && Math.abs(v) < 48) h = lerp(h, b.apronY, smooth(APRON + 20, APRON - 2, Math.max(u, 0)) * smooth(48, 28, Math.abs(v)));
  }
  return h;
}

// Final ground height: roads cut into the terrain, with banks either side;
// bridges (a road well above the ground) leave the ground alone.
export function heightAt(x, z) {
  let h = baseHeight(x, z);
  if (roadDist(x, z) < 260) {
    const r = roadAt(x, z);
    if (r && r.d < r.road.hw + 60) {
      const m = smooth(r.road.hw + 40, r.road.hw + 5, r.d) * (1 - smooth(5, 9, r.y - h));
      h = lerp(h, r.y - 0.3, m);
    }
  }
  return stampHeight(x, z, h);
}

// ---------------------------------------------------------------------------
// Bunker interiors
// ---------------------------------------------------------------------------
// Rectangles (axis-aligned; the portals all face west) of the tunnel and hangar.
export function bunkerRects(b) {
  const d = -b.fx;                       // the interior runs away from the portal: +x for a west-facing portal
  const tx0 = b.cx, tx1 = b.cx + d * b.tunnel.len, hx1 = tx1 + d * b.hangar.len;
  return {
    tunnel: { x0: Math.min(tx0, tx1), x1: Math.max(tx0, tx1), z0: b.cz - b.tunnel.w / 2, z1: b.cz + b.tunnel.w / 2 },
    hangar: { x0: Math.min(tx1, hx1), x1: Math.max(tx1, hx1), z0: b.cz - b.hangar.w / 2, z1: b.cz + b.hangar.w / 2 },
  };
}
const interiors = BUNKERS.map(b => ({ b, r: bunkerRects(b) }));
// Walls as collision boxes: [x0, z0, x1, z1].
export function bunkerWalls(b) {
  const { tunnel: t, hangar: h } = bunkerRects(b), w = 1.2, gap = b.tunnel.w / 2, mid = b.cz;
  return [
    [t.x0, t.z0 - w, t.x1, t.z0], [t.x0, t.z1, t.x1, t.z1 + w],                                               // tunnel sides
    [h.x0, h.z0 - w, h.x1, h.z0], [h.x0, h.z1, h.x1, h.z1 + w],                                               // hangar sides
    [h.x1, h.z0 - w, h.x1 + w, h.z1 + w],                                                                     // far end
    [h.x0 - w, h.z0 - w, h.x0, mid - gap], [h.x0 - w, mid + gap, h.x0, h.z1 + w],                              // hangar's near wall, either side of the tunnel
  ];
}
function interiorAt(x, z) {
  for (const { b, r } of interiors) for (const q of [r.tunnel, r.hangar]) if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1) return b;
  return null;
}

// ---------------------------------------------------------------------------
// What the car drives on
// ---------------------------------------------------------------------------
// mu is grip (1 = asphalt) and drag the extra rolling resistance (N s/m).
const SURF = {
  asphalt: { mu: 1, drag: 0 }, gravel: { mu: 0.8, drag: 50 }, grass: { mu: 0.72, drag: 95 }, sand: { mu: 0.62, drag: 210 },
  snow: { mu: 0.42, drag: 150 }, rock: { mu: 0.9, drag: 30 }, lakebed: { mu: 0.82, drag: 40 }, concrete: { mu: 0.9, drag: 0 },
};
export function groundKind(x, z, h, slope) {
  const { snow, desert } = climate(x, z);
  if (slope > 0.75) return 'rock';
  if (lakeDist(x, z) < AIRFIELD.r + 60) return 'lakebed';
  const sh = x - coastX(z);
  if (sh < 420 && h < 3.5) return 'sand';
  if (snow > 0.5 || h > 520) return 'snow';
  if (desert > 0.45) return 'sand';
  return 'grass';
}
const _g = (y, kind) => { const s = SURF[kind]; return { y, grass: kind === 'grass', kind, mu: s.mu, drag: s.drag }; };

export function groundAt(x, z) {
  if (Math.abs(x) <= EDGE + 6 && Math.abs(z) <= EDGE + 6) {
    const g = surfaceAt(x, z);
    g.kind = g.grass ? 'grass' : 'asphalt'; g.mu = g.grass ? 0.72 : 1; g.drag = g.grass ? 95 : 0;
    return g;
  }
  const bk = interiorAt(x, z);
  if (bk) return _g(bk.apronY, 'concrete');
  if (roadDist(x, z) < 260) {
    const r = roadAt(x, z);
    if (r) {
      if (r.d < r.road.hw) return _g(r.y, 'asphalt');
      if (r.d < r.road.hw + 3.5 && r.road.kind === 'motorway') return _g(r.y - 0.02, 'gravel');
    }
  }
  const h = heightAt(x, z);
  return _g(h, groundKind(x, z, h, 0));
}

// Is this the sea (or the shallows)?
export { lakeDist };
export const isWater = (x, z) => x < coastX(z) + 70;
