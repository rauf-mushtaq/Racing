// Collisions between the player's car and buildings, poles, trees, the edge of
// the world and traffic. The car is three overlapping circles along its length;
// each contact gets a proper impulse, so a glancing hit slides and spins you
// while a head-on one stops you.
import { queryColliders, EDGE } from './city.js';
import { groundAt, WORLD_LIM, isWater } from './world.js';

const CIRCLES = [-1.45, 0, 1.45], RAD = 1.0;
const found = [];

function applyImpulse(car, px, pz, nx, nz, e, mu, hit, otherMassInv = 0, otherVel = null) {
  const m = car.s.mass, I = car.I;
  const [Vx, Vz] = car.worldVel();
  let Om = -car.w; // world yaw rate about +y
  const rx = px - car.x, rz = pz - car.z;
  let vpx = Vx + Om * rz, vpz = Vz - Om * rx;
  if (otherVel) { vpx -= otherVel[0]; vpz -= otherVel[1]; }
  const vn = vpx * nx + vpz * nz;
  if (vn >= 0) return 0;
  const rn = rz * nx - rx * nz;
  const j = -(1 + e) * vn / (1 / m + rn * rn / I + otherMassInv);
  let nVx = Vx + j * nx / m, nVz = Vz + j * nz / m; Om += rn * j / I;
  // Friction along the contact.
  const tx = -nz, tz = nx, vt = vpx * tx + vpz * tz, rt = rz * tx - rx * tz;
  let jt = -vt / (1 / m + rt * rt / I + otherMassInv);
  jt = Math.max(-mu * j, Math.min(mu * j, jt));
  nVx += jt * tx / m; nVz += jt * tz / m; Om += rt * jt / I;
  car.setWorldVel(nVx, nVz); car.w = -Om;
  if (hit) hit(j, px, pz);
  return j;
}

export function collideStatic(car, onHit) {
  const f = car.fwd;
  for (let pass = 0; pass < 2; pass++) for (const off of CIRCLES) {
    const cx = car.x + f[0] * off, cz = car.z + f[1] * off;
    queryColliders(cx, cz, RAD + 0.5, found);
    for (const c of found) {
      let nx, nz, pen, px, pz;
      if (c.type === 'box') {
        const qx = Math.max(c.x0, Math.min(cx, c.x1)), qz = Math.max(c.z0, Math.min(cz, c.z1));
        let dx = cx - qx, dz = cz - qz, dist = Math.hypot(dx, dz);
        if (dist >= RAD) continue;
        if (dist > 1e-4) { nx = dx / dist; nz = dz / dist; pen = RAD - dist; }
        else {
          // Centre inside the box: push out the shortest way.
          const opts = [[cx - c.x0, -1, 0], [c.x1 - cx, 1, 0], [cz - c.z0, 0, -1], [c.z1 - cz, 0, 1]].sort((a, b) => a[0] - b[0]);
          nx = opts[0][1]; nz = opts[0][2]; pen = opts[0][0] + RAD;
        }
        px = cx - nx * RAD; pz = cz - nz * RAD;
      } else {
        const dx = cx - c.x, dz = cz - c.z, dist = Math.hypot(dx, dz), r = RAD + c.r;
        if (dist >= r || dist < 1e-5) continue;
        nx = dx / dist; nz = dz / dist; pen = r - dist; px = c.x + nx * c.r; pz = c.z + nz * c.r;
      }
      car.x += nx * pen; car.z += nz * pen;
      applyImpulse(car, px, pz, nx, nz, 0.25, 0.25, pass === 0 ? onHit : null);
    }
  }
  // The edge of the world: a soft invisible wall.
  for (const [ax, sign, lim] of [['x', 1, WORLD_LIM.x1], ['x', -1, -WORLD_LIM.x0], ['z', 1, WORLD_LIM.z1], ['z', -1, -WORLD_LIM.z0]]) {
    if (car[ax] * sign > lim) {
      car[ax] = sign * lim;
      const nx = ax === 'x' ? -sign : 0, nz = ax === 'z' ? -sign : 0;
      applyImpulse(car, car.x - nx, car.z - nz, nx, nz, 0.3, 0.3, onHit);
    }
  }
}

// Out in the countryside: the sea is a wall (you can paddle in the shallows but
// not drive out to sea) and so are slopes steeper than about 45 degrees.
const _gp = [0, 0];
function slopeAt(x, z) {
  const d = 2.5;
  return [(groundAt(x + d, z).y - groundAt(x - d, z).y) / (2 * d), (groundAt(x, z + d).y - groundAt(x, z - d).y) / (2 * d)];
}
export function collideTerrain(car, onHit) {
  if (Math.abs(car.x) < EDGE - 40 && Math.abs(car.z) < EDGE - 40) return;
  if (isWater(car.x, car.z)) {
    const nx = 1, nz = 0;                                  // inland is east
    car.x += 0.25;
    applyImpulse(car, car.x - nx, car.z, nx, nz, 0.2, 0.4, onHit);
    return;
  }
  const f = car.fwd, v = car.worldVel(), moving = Math.hypot(v[0], v[1]) > 0.5;
  if (!moving) return;
  const dir = car.vx >= 0 ? 1 : -1;
  const px = car.x + f[0] * 2.4 * dir, pz = car.z + f[1] * 2.4 * dir;
  const [gx, gz] = slopeAt(px, pz), gm = Math.hypot(gx, gz);
  if (gm < 0.95) return;
  const nx = -gx / gm, nz = -gz / gm;                       // down the slope, away from the wall
  if (v[0] * nx + v[1] * nz > 0) return;                    // already moving off it
  car.x += nx * 0.12; car.z += nz * 0.12;
  applyImpulse(car, px, pz, nx, nz, 0.15, 0.5, onHit);
}

// Traffic cars are pairs of circles; they get knocked aside when hit.
export function collideTraffic(car, traffic, onHit) {
  const f = car.fwd;
  for (const t of traffic.cars) {
    if (!t.active) continue;
    const dx0 = t.x - car.x, dz0 = t.z - car.z;
    if (dx0 * dx0 + dz0 * dz0 > 100) continue;
    const tf = [Math.sin(t.h), Math.cos(t.h)];
    for (const off of CIRCLES) {
      const cx = car.x + f[0] * off, cz = car.z + f[1] * off;
      // Long vehicles are three circles; heavy ones barely move when you hit them.
      const mt = t.mass || 1400, tr = t.rad || 0.95, offs = t.len > 6.5 ? [-t.len * 0.34, 0, t.len * 0.34] : [-t.len * 0.28, t.len * 0.28];
      for (const toff of offs) {
        const ox = t.x + tf[0] * toff, oz = t.z + tf[1] * toff;
        const dx = cx - ox, dz = cz - oz, dist = Math.hypot(dx, dz), r = RAD + tr;
        if (dist >= r || dist < 1e-5) continue;
        const nx = dx / dist, nz = dz / dist, pen = r - dist;
        // Split the push between both cars by mass.
        const share = mt / (mt + car.s.mass);
        car.x += nx * pen * share; car.z += nz * pen * share;
        t.x -= nx * pen * (1 - share); t.z -= nz * pen * (1 - share);
        const tv = traffic.velocityOf(t);
        const j = applyImpulse(car, ox + nx * tr, oz + nz * tr, nx, nz, 0.2, 0.2, onHit, 1 / mt, tv);
        if (j > 0) traffic.knock(t, tv[0] - nx * j / mt, tv[1] - nz * j / mt, (Math.random() - 0.5) * j / (mt * 2));
      }
    }
  }
}
