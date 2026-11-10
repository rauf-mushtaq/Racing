// Swimming pools for the gardens of houses and for the resort at the beach: a raised basin (a tiled wall, stone coping, a little step, a ladder) with a deck round it, two sun
// loungers and a parasol. The water is its own mesh (see poolMaterial in water.js: a tiled floor seen through the surface, caustics, pool lights at night). A pool stands above the ground
// (the city's ground is one flat sheet and cannot be dug into), which is how the raised pools of hillside houses look anyway.
import * as THREE from 'three';
import { circlePoly } from './geom.js';

export const POOLS = [];                          // every pool built so far: { x, z, x0, z0, x1, z1 } (for the tests and for looking at them)
const H = 0.95, COPE = 0.32;

// `CURB` is the height of the pavement, `collide(x0, z0, x1, z1)` makes the basin solid; x0..x1, z0..z1 is the water's outline with its coping.
export function addPool(ctx, CURB, collide, x0, z0, x1, z1, rnd) {
  const G = ctx.gb, y0 = CURB + 0.03, yt = CURB + H, yw = yt - 0.1;
  const tile = new THREE.Color(0.5, 0.78, 0.88), stone = new THREE.Color(0.92, 0.9, 0.84), deck = new THREE.Color(1.08, 1.04, 0.98), steel = new THREE.Color(0.75, 0.78, 0.8), white = new THREE.Color(0.95, 0.95, 0.93);
  G.walk.flat(x0 - 1.5, z0 - 1.5, x1 + 1.5, z1 + 1.5, CURB + 0.05, 5, deck);                                           // the deck
  G.pool.walls(x0, z0, x1, z1, y0, yt, 1.5, 1.5, tile);                                                                   // the tiled outer wall
  const lo = yw - 0.02, hi = yt + 0.07;                                                                                   // the coping: from the water up
  G.pool.box(x0, z0, x1, z0 + COPE, lo, hi, 2, stone); G.pool.box(x0, z1 - COPE, x1, z1, lo, hi, 2, stone);
  G.pool.box(x0, z0 + COPE, x0 + COPE, z1 - COPE, lo, hi, 2, stone); G.pool.box(x1 - COPE, z0 + COPE, x1, z1 - COPE, lo, hi, 2, stone);
  G.water.flat(x0 + COPE, z0 + COPE, x1 - COPE, z1 - COPE, yw, 1, new THREE.Color(1, 1, 1));                              // the water
  const long = x1 - x0 > z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // a step up to the coping on one long side, and a ladder (two rails and rungs) at one end
  const side = rnd() < 0.5 ? -1 : 1;
  if (long) G.pool.box(cx - 1.2, side < 0 ? z0 - 0.45 : z1, cx + 1.2, side < 0 ? z0 : z1 + 0.45, CURB + 0.03, CURB + 0.5, 2, stone);
  else G.pool.box(side < 0 ? x0 - 0.45 : x1, cz - 1.2, side < 0 ? x0 : x1 + 0.45, cz + 1.2, CURB + 0.03, CURB + 0.5, 2, stone);
  const lx = long ? x1 - 0.9 : cx, lz = long ? cz : z1 - 0.9;
  for (const o of [-0.25, 0.25]) { if (long) G.props.box(lx - 0.025, lz + o - 0.025, lx + 0.025, lz + o + 0.025, yt - 0.25, yt + 0.75, 2, steel); else G.props.box(lx + o - 0.025, lz - 0.025, lx + o + 0.025, lz + 0.025, yt - 0.25, yt + 0.75, 2, steel); }
  // two loungers on the deck and a parasol
  const ly = CURB + 0.05, nz = (side < 0 ? z1 + 1.0 : z0 - 1.0), nx = (side < 0 ? x1 + 1.0 : x0 - 1.0);
  const lounger = (px, pz, alongX) => {
    const a = alongX ? [0.95, 0.3] : [0.3, 0.95];
    G.props.box(px - a[0], pz - a[1], px + a[0], pz + a[1], ly, ly + 0.34, 2, white);
    if (alongX) G.props.box(px + 0.3, pz - 0.3, px + 0.95, pz + 0.3, ly + 0.34, ly + 0.5, 2, white); else G.props.box(px - 0.3, pz + 0.3, px + 0.3, pz + 0.95, ly + 0.34, ly + 0.5, 2, white);
    G.props.box(px - a[0] + 0.05, pz - a[1] + 0.05, px + a[0] - 0.05, pz + a[1] - 0.05, ly + 0.34, ly + 0.4, 2, new THREE.Color(0.35, 0.65, 0.85));
  };
  const lc = long ? (side < 0 ? [cx - 1.8, z1 + 1.0] : [cx - 1.8, z0 - 1.0]) : (side < 0 ? [x1 + 1.0, cz - 1.8] : [x0 - 1.0, cz - 1.8]);
  void nz; void nx;
  lounger(lc[0], lc[1], long); lounger(long ? lc[0] + 1.9 : lc[0], long ? lc[1] : lc[1] + 1.9, long);
  const px = long ? cx + 3.4 : lc[0], pz = long ? lc[1] : cz + 3.4, cols = [new THREE.Color(0.9, 0.3, 0.25), new THREE.Color(0.95, 0.93, 0.85), new THREE.Color(0.2, 0.5, 0.8), new THREE.Color(0.95, 0.75, 0.25)];
  G.props.box(px - 0.03, pz - 0.03, px + 0.03, pz + 0.03, ly, ly + 2.3, 2, steel);
  G.props.loft(circlePoly(px, pz, 1.6, 10), ly + 2.1, circlePoly(px, pz, 0.12, 10), ly + 2.7, 4, cols[(rnd() * cols.length) | 0]);
  collide(x0, z0, x1, z1);
  POOLS.push({ x: cx, z: cz, x0, z0, x1, z1 });
}
