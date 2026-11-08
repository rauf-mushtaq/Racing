// Which junctions are roundabouts. A roundabout is a raised island in the middle of the junction with traffic circling it
// counter-clockwise (the city drives on the right), so the 4-way crossings aren't all the same.
import { N, SP, isBlvd } from './grid.js';
import { hash3 } from './util.js';
import { riverSdf, inRiverBox } from './rivercourse.js';

export const RB = { island: 8.2, lane: 11.5, outer: 14.6 };       // radius of the island, the line cars follow, and the outer edge of the road round it
const cache = new Map();
export function isRound(i, j) {
  if (Math.abs(i) >= N || Math.abs(j) >= N) return false;
  const key = i * 64 + j; let v = cache.get(key);
  if (v === undefined) {
    v = hash3(i, j, 41) < 0.13 && !(isBlvd(i) && isBlvd(j)) && !(Math.abs(i) < 2 && Math.abs(j) < 2) && !(inRiverBox(i * SP, j * SP, 120) && riverSdf(i * SP, j * SP) < 70);
    cache.set(key, v);
  }
  return v;
}
// Keep something (a cruiser, say) from driving over a roundabout's island: pushes it out to `r` beyond the kerb. True if it moved.
export function pushFromIsland(o, r) {
  const i = Math.round(o.x / SP), j = Math.round(o.z / SP); if (!isRound(i, j)) return false;
  const dx = o.x - i * SP, dz = o.z - j * SP, d = Math.hypot(dx, dz), R = RB.island + r; if (d >= R) return false;
  const nx = d > 1e-3 ? dx / d : 1, nz = d > 1e-3 ? dz / d : 0; o.x += nx * (R - d); o.z += nz * (R - d); return true;
}
