// The lie of the land inside the city. Four hills (one in each outer corner) and gentle swells over the suburbs, none of it near the river, the
// landmarks or downtown, which stay flat. The height is fixed at each road junction and the ground is a bilinear patch between four of them, so
// along any road it rises and falls in straight stretches from junction to junction (and every road, kerb, line and pavement agrees about the
// height: they all just ask `heightBL`). Plain numbers, shared by the graphics, the physics and the tests.
import { SP, N, EDGE, LANDMARKS, landmarkAt, signatureAt, isLakeBlock } from './grid.js';
import { hash3 } from './util.js';
import { blockRect } from './grid.js';
import { nearAvenueArea } from './avenues.js';
import { inRiverBox } from './rivercourse.js';

export const HILLS = [
  { name: 'Sunset Heights', cx: -1450, cz: -1350, r: 860, h: 56 },
  { name: 'Mesa Park', cx: 1500, cz: 1250, r: 800, h: 46 },
  { name: 'Observatory Hill', cx: 1350, cz: -1450, r: 660, h: 38 },
  { name: 'South Ridge', cx: -1300, cz: 1350, r: 700, h: 32 },
];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const LM = Object.keys(LANDMARKS).map(k => { const [i, j] = k.split(',').map(Number); return [i * SP + SP / 2, j * SP + SP / 2]; });
function raw(x, z) {
  let h = 0;
  for (const H of HILLS) { const d = Math.hypot(x - H.cx, z - H.cz) / H.r; if (d < 1) h += H.h * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * d), 1.35); }
  const dc = Math.max(Math.abs(x), Math.abs(z));                                                  // swells in the outer districts, a few metres, a kilometre or so across
  h += smooth(800, 1300, dc) * 4.2 * (0.5 + 0.5 * Math.sin(x / 118 + 1.3) * Math.sin(z / 162 + 0.4));
  let flat = 1; for (const [lx, lz] of LM) flat = Math.min(flat, smooth(260, 480, Math.hypot(x - lx, z - lz)));      // level round the landmarks
  return h * flat * (1 - smooth(1700, 2100, dc));
}
const cache = new Map();
export function nodeH(i, j) {
  if (i < -N || i > N || j < -N || j > N) return 0;
  const k = (i + 20) * 64 + (j + 20); let v = cache.get(k);
  if (v === undefined) { const x = i * SP, z = j * SP; v = inRiverBox(x, z, 300) ? 0 : raw(x, z); if (v < 0.35) v = 0; cache.set(k, v); }
  return v;
}
// The height of the ground at (x, z): zero on the flat, bilinear between junctions elsewhere.
export function heightBL(x, z) {
  if (x <= -EDGE || x >= EDGE || z <= -EDGE || z >= EDGE) return 0;
  const fx = x / SP, fz = z / SP, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = nodeH(i, j), b = nodeH(i + 1, j), c = nodeH(i, j + 1), d = nodeH(i + 1, j + 1);
  if (a === 0 && b === 0 && c === 0 && d === 0) return 0;
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
// Is any of the ground in this square (x0..x1, z0..z1) off the flat?
export function hillyArea(x0, z0, x1, z1) {
  for (let i = Math.floor(x0 / SP); i <= Math.floor(x1 / SP) + 1; i++) for (let j = Math.floor(z0 / SP); j <= Math.floor(z1 / SP) + 1; j++) if (nodeH(i, j) > 0) return true;
  return false;
}
// Level enough for a plaza (a paved square with a fountain, stalls and a tower on it)?
export const flatBlock = (i, j) => nodeH(i, j) === 0 && nodeH(i + 1, j) === 0 && nodeH(i, j + 1) === 0 && nodeH(i + 1, j + 1) === 0;
export const plaza = (i, j) => Math.abs(i) < N && Math.abs(j) < N && Math.max(Math.abs(i + 0.5), Math.abs(j + 0.5)) > 2.6 && hash3(i, j, 77) < 0.32 && !isLakeBlock(i, j) && !landmarkAt(i, j) && !signatureAt(i, j) && j !== -1 && j !== -2 && flatBlock(i, j) && (() => { const b = blockRect(i, j); return !nearAvenueArea(b.x0 - 40, b.z0 - 40, b.x1 + 40, b.z1 + 40); })();
// The steepest slope anywhere (a fraction: 0.1 is one metre up in ten), found by looking along the roads.
export function steepest() {
  let m = 0;
  for (let i = -N; i < N; i++) for (let j = -N; j <= N; j++) { m = Math.max(m, Math.abs(nodeH(i + 1, j) - nodeH(i, j)) / SP, Math.abs(nodeH(j, i + 1) - nodeH(j, i)) / SP); }
  return m;
}
