// Rooftops you can stand on. About a third of the tall glass and concrete towers (45 m and up, flat-topped and wide enough) have a helipad painted on the
// roof with a helicopter waiting on it (rides.js), a lift room in one corner of the roof (the lifts in the lobby go up to it: rooms-visit.js, visit.js) and a
// steel ladder up the outside wall from the pavement (city.js draws them; main.js does the climbing). The helicopter on a roof can be stolen (the police
// come) or bought with your money, and once it is yours it waits on its roof for you.
// Any other roof you land a helicopter on can be walked about on too, with a stair down to the street.
// No graphics in here: the city registers the roofs as it builds them, and the walker (walker.js: walker.roof) stands on whichever one it is on.
import { queryColliders } from './city.js';
import { hash3 } from './util.js';

const CURB = 0.15;
// The rooftops with a helipad: id -> { id, x0, x1, z0, z1 (the walkable roof), y (the roof's height), pad: { x, z, r }, hut: { x0, x1, z0, z1, door: { x, z } },
// ladder: { x, z (where you stand on the pavement at its foot), tx, tz (where you step off on the roof), h (which way you face climbing), x0, x1, z0, z1 }, price }
export const ROOFS = new Map();
const idOf = (cx, cz) => 'bld' + Math.round(cx) + ',' + Math.round(cz);            // (the same as a building's id when you walk into it: main.js buildingNear)
export function addRoof(r) { r.id = idOf((r.bx0 + r.bx1) / 2, (r.bz0 + r.bz1) / 2); r.price = 150000 + Math.round(hash3(Math.round(r.bx0), Math.round(r.bz0), 41) * 30) * 5000; ROOFS.set(r.id, r); return r; }

// The roof of the building whose collider this is: a registered one (with its pad, lift room and ladder), or a plain flat one made up from the collider.
export function roofOfCollider(c) {
  if (!c || !c.bld || c.bld.h < 4) return null;
  const cx = c.type === 'box' ? (c.x0 + c.x1) / 2 : c.x, cz = c.type === 'box' ? (c.z0 + c.z1) / 2 : c.z, id = idOf(cx, cz);
  const R = ROOFS.get(id); if (R) return R;
  const k = c.type === 'box' ? 0 : c.r * 0.29, x0 = c.type === 'box' ? c.x0 : c.x - c.r, x1 = c.type === 'box' ? c.x1 : c.x + c.r, z0 = c.type === 'box' ? c.z0 : c.z - c.r, z1 = c.type === 'box' ? c.z1 : c.z + c.r;
  return { id, plain: true, bx0: x0, bx1: x1, bz0: z0, bz1: z1, x0: x0 + 1.2 + k, x1: x1 - 1.2 - k, z0: z0 + 1.2 + k, z1: z1 - 1.2 - k, y: CURB + c.bld.h + (c.bld.base || 0), cx, cz };
}
const _q = [];
// The roof of the building under (x, z), if there is one.
export function roofAt(x, z) {
  queryColliders(x, z, 1, _q);
  for (const c of _q) {
    if (!c.bld) continue;
    if (c.type === 'box' ? x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 : Math.hypot(x - c.x, z - c.z) < c.r) return roofOfCollider(c);
  }
  return null;
}
// The foot of a ladder near a point in the street (within r), or null.
export function ladderNear(x, z, r = 1.6) {
  let best = null, bd = r;
  for (const R of ROOFS.values()) { const L = R.ladder; if (!L || Math.abs(L.x - x) > 4 || Math.abs(L.z - z) > 4) continue; const d = Math.hypot(L.x - x, L.z - z); if (d < bd) { bd = d; best = R; } }
  return best;
}
// On a roof: what is within reach to get down (the top of its ladder, the lift room's door), or, on a roof with neither, the stair.
export function wayDown(R, x, z) {
  if (R.ladder && Math.hypot(R.ladder.tx - x, R.ladder.tz - z) < 1.8) return 'ladder';
  if (R.hut && Math.hypot(R.hut.door.x - x, R.hut.door.z - z) < 1.8) return 'lift';
  if (R.plain) return 'stair';
  return null;
}
// Where to come out in the street from a roof's building: the foot of its ladder, or the middle of one of its sides, just outside (the first that is clear).
export function streetSpot(R, clear) {
  if (R.ladder) return { x: R.ladder.x, z: R.ladder.z, h: R.ladder.h + Math.PI };
  const cx = (R.bx0 + R.bx1) / 2, cz = (R.bz0 + R.bz1) / 2;
  for (const [x, z, h] of [[cx, R.bz0 - 1.6, Math.PI], [cx, R.bz1 + 1.6, 0], [R.bx0 - 1.6, cz, -Math.PI / 2], [R.bx1 + 1.6, cz, Math.PI / 2]]) if (!clear || clear(x, z)) return { x, z, h };
  return { x: cx, z: R.bz0 - 1.6, h: Math.PI };
}
