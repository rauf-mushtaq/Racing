// Pedestrians: people strolling round the pavements of the city blocks, standing about, getting out of the way (and running when
// something loud happens). They are drawn as instanced meshes (one per body part, so about a dozen draw calls for the whole crowd)
// on the same skeleton and animation as the player's character. A car that hits one knocks it over; that is a crime.
import * as THREE from 'three';
import { bodyParts, buildRig, animate, personMaterials, SKINS, HAIRS } from './person.js';
import { N, SP, blockRect } from './city.js';
import { groundAt } from './world.js';
import { mulberry32, clamp, damp, wrapAngle } from './util.js';

const SHIRTS = [0xd9d4cc, 0x2c3e55, 0x8a2b2b, 0x2f5d44, 0xe0b23c, 0x3a3a3f, 0xf0f0f0, 0x7a4b8a, 0x2a7aa8, 0xc7632b, 0xb8a58a, 0x1e1e22, 0xc44d6b, 0x587a3a, 0x9bb7d4, 0xe8c9b0];
const PANTS = [0x2a3550, 0x1c1c20, 0x4a4036, 0x6b6b70, 0x3a2f28, 0x2d4660, 0x8a7d62, 0x22303a, 0x59606b];
const SHOES = [0xf2f2f2, 0x1c1c1c, 0x6b4a32, 0xc9c0b0, 0x7a2a2a];
const OFFSETS = [1.8, 2.4, 3.0];
const SHOW_R = 125;

// Walking loops round a block's pavement (corners cut), cached per block and distance from the kerb.
const rings = new Map();
function ringOf(i, j, d) {
  const key = i + ',' + j + ',' + d; let r = rings.get(key); if (r) return r;
  const b = blockRect(i, j), X0 = b.x0 + d, X1 = b.x1 - d, Z0 = b.z0 + d, Z1 = b.z1 - d, c = 2.2;
  const pts = [[X0 + c, Z0], [X1 - c, Z0], [X1, Z0 + c], [X1, Z1 - c], [X1 - c, Z1], [X0 + c, Z1], [X0, Z1 - c], [X0, Z0 + c]];
  const cum = [0]; for (let k = 1; k <= pts.length; k++) { const a = pts[k - 1], q = pts[k % pts.length]; cum.push(cum[k - 1] + Math.hypot(q[0] - a[0], q[1] - a[1])); }
  r = { pts, cum, L: cum[pts.length] }; rings.set(key, r); return r;
}
function ringAt(r, s) {
  s = ((s % r.L) + r.L) % r.L; let k = 1; while (k < r.cum.length - 1 && r.cum[k] < s) k++;
  const a = r.pts[k - 1], b = r.pts[k % r.pts.length], t = (s - r.cum[k - 1]) / (r.cum[k] - r.cum[k - 1] || 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, b[0] - a[0], b[1] - a[1]];
}

export class Peds {
  constructor(scene, count, shadows) {
    this.scene = scene; this.count = count; this.rnd = mulberry32(2025); this.list = []; this.onHit = null;
    // Geometry for every part, with white clothes (dyed per instance) and white skin (tinted per instance).
    const parts = bodyParts({ skin: 0xffffff, hairStyle: 'short' }, true), mats = personMaterials();
    this.B = buildRig(null, null);                              // just the joints
    this.kinds = [];
    const dye = { torso: 'shirt', uArm: 'shirt', fArm: 'shirt', pelvis: 'pants', thigh: 'pants', shin: 'pants', shoe: 'shoes', head: 'skin', hand: 'skin', hair: 'hair' };
    for (const [k, geo] of Object.entries(parts)) {
      if (!geo || !dye[k]) continue;
      const bones = this.B.parts[k], n = count * bones.length;
      const mesh = new THREE.InstancedMesh(geo, k === 'head' || k === 'hand' ? mats.skin : mats.cloth, n);
      mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = shadows; mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(mesh); this.kinds.push({ k, bones, mesh, dye: dye[k] });
    }
    this.vis = []; this.slotOwner = new Array(count).fill(-1); this.tmpC = new THREE.Color(); this.m = new THREE.Matrix4(); this.mir = new THREE.Matrix4().makeScale(-1, 1, 1);
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  // Put a person on a pavement somewhere around `focus`, not too close and (when we can manage it) out of sight.
  spawn(p, focus, camera, initial) {
    const rnd = () => this.rnd();
    for (let tries = 0; tries < 14; tries++) {
      const fi = Math.floor(focus.x / SP), fj = Math.floor(focus.z / SP), i = clamp(fi + Math.floor(rnd() * 5) - 2, -N, N - 1), j = clamp(fj + Math.floor(rnd() * 5) - 2, -N, N - 1);
      const d = OFFSETS[(rnd() * OFFSETS.length) | 0], ring = ringOf(i, j, d), s = rnd() * ring.L, [x, z, tx, tz] = ringAt(ring, s);
      const dist = Math.hypot(x - focus.x, z - focus.z); if (dist < (initial ? 12 : 55) || dist > 150) continue;
      if (!initial && camera) { const dx = x - camera.position.x, dz = z - camera.position.z; const f = camera.getWorldDirection(this.tmpV || (this.tmpV = new THREE.Vector3())); if ((dx * f.x + dz * f.z) / (Math.hypot(dx, dz) || 1) > 0.6 && dist < 110) continue; }
      Object.assign(p, { i, j, d, s, dir: rnd() < 0.5 ? 1 : -1, x, z, h: Math.atan2(tx, tz), state: 'walk', idleT: 0, panic: 0, downT: 0, vx: 0, vz: 0, vy: 0, y: groundAt(x, z).y, phase: rnd() * 6.28, speedBase: 1.0 + rnd() * 0.55, speed: 0, t: rnd() * 20, look: 0, hit: false, lie: 0, ring });
      p.colors = [SHIRTS[(rnd() * SHIRTS.length) | 0], PANTS[(rnd() * PANTS.length) | 0], SHOES[(rnd() * SHOES.length) | 0], SKINS[(rnd() * SKINS.length) | 0], HAIRS[(rnd() * HAIRS.length) | 0]];
      return p;
    }
    // Nowhere good: park it far away (it is tried again next frame).
    p.x = 1e5; p.z = 1e5; p.state = 'away'; p.ring = null; p.colors = p.colors || [SHIRTS[0], PANTS[0], SHOES[0], SKINS[0], HAIRS[0]]; return p;
  }
  setCount(n) { n = Math.min(n, this.count); while (this.list.length > n) this.list.pop(); while (this.list.length < n) this.list.push({}); }

  // Everyone within r metres of a point is frightened and runs.
  scare(x, z, r, secs = 4) {
    for (const p of this.list) {
      if (p.state === 'down' || p.state === 'away' || !p.ring) continue; const dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz > r * r) continue;
      p.state = 'panic'; p.panic = secs * (0.7 + this.rnd() * 0.6); const [, , tx, tz] = ringAt(p.ring, p.s); p.dir = (tx * dx + tz * dz) >= 0 ? 1 : -1;
    }
  }

  // Calls add(x, z, r) for each person near a point (for the walker to bump into).
  near(x, z, add) {
    for (const p of this.list) { if (p.state === 'away' || p.state === 'down') continue; const dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz < 6) add(p.x, p.z, 0.3); }
  }

  // A car hitting people. Returns how many were hit this call.
  hitByCar(car) {
    let n = 0; const f = [Math.sin(car.h), Math.cos(car.h)], sp = car.speed;
    for (const p of this.list) {
      if (p.state === 'down' || p.state === 'away') continue; const dx = p.x - car.x, dz = p.z - car.z; if (dx * dx + dz * dz > 25) continue;
      for (const off of [-1.45, 0, 1.45]) {
        const cx = car.x + f[0] * off, cz = car.z + f[1] * off; if (Math.hypot(p.x - cx, p.z - cz) > 1.0 + 0.3) continue;
        if (sp < 1.5) break;
        const v = car.worldVel(), nx = p.x - cx, nz = p.z - cz, l = Math.hypot(nx, nz) || 1;
        p.state = 'down'; p.downT = 2.8; p.vx = v[0] * 0.85 + nx / l * 2.5; p.vz = v[1] * 0.85 + nz / l * 2.5; p.vy = 3.2 + Math.min(4, sp * 0.15); p.lie = 0; n++; if (this.onHit) this.onHit(p, sp); break;
      }
    }
    return n;
  }

  update(dt, focus, camera, signals) {
    const rnd = () => this.rnd(), N0 = this.list.length;
    for (let idx = 0; idx < N0; idx++) {
      const p = this.list[idx];
      if (!p.colors || p.state === 'away' || Math.hypot(p.x - focus.x, p.z - focus.z) > 230) { this.spawn(p, focus, camera, !this._started); if (p.state === 'away') continue; }
      p.t += dt;
      if (p.state === 'down') {
        p.downT -= dt; p.vy -= 16 * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; const g = groundAt(p.x, p.z).y;
        if (p.y <= g) { p.y = g; p.vy = 0; const k = Math.exp(-5 * dt); p.vx *= k; p.vz *= k; }
        p.lie = damp(p.lie, 1, 14, dt); p.speed = 0;
        if (p.downT <= 0) { p.state = 'panic'; p.panic = 4; p.lie = 0; this.relink(p); }
      } else {
        let spd = 0;
        if (p.state === 'walk') { spd = p.speedBase; p.idleT -= dt; if (rnd() < dt * 0.025) { p.state = 'idle'; p.idleT = 2 + rnd() * 6; } }
        else if (p.state === 'idle') { p.idleT -= dt; if (p.idleT <= 0) p.state = 'walk'; }
        else if (p.state === 'panic') { spd = 3.9; p.panic -= dt; if (p.panic <= 0) p.state = 'walk'; }
        // Someone (you) in the way: wait.
        if (spd > 0 && focus.onFoot) { const dx = focus.x - p.x, dz = focus.z - p.z; if (dx * dx + dz * dz < 2.4) spd *= 0.15; }
        p.speed = damp(p.speed, spd, 5, dt);
        if (p.ring && p.speed > 0.01) p.s += p.dir * p.speed * dt;
        if (p.ring) {
          const [x, z, tx, tz] = ringAt(p.ring, p.s); p.x = x; p.z = z; const th = Math.atan2(tx * p.dir, tz * p.dir);
          p.h += wrapAngle(th - p.h) * Math.min(1, dt * (p.speed > 0.1 ? 7 : 2)); p.y = 0.15;
        }
        p.lie = damp(p.lie, 0, 8, dt);
        p.look = Math.sin(p.t * 0.5 + idx) * 0.4 * (p.state === 'idle' ? 1 : 0.3);
      }
    }
    this._started = true;
  }
  // After being knocked down, rejoin the nearest pavement loop.
  relink(p) {
    const i = clamp(Math.floor(p.x / SP), -N, N - 1), j = clamp(Math.floor(p.z / SP), -N, N - 1), d = OFFSETS[1], ring = ringOf(i, j, d);
    let best = 0, bd = 1e9; for (let s = 0; s < ring.L; s += 3) { const [x, z] = ringAt(ring, s); const dd = (x - p.x) ** 2 + (z - p.z) ** 2; if (dd < bd) { bd = dd; best = s; } }
    p.i = i; p.j = j; p.d = d; p.ring = ring; p.s = best; p.y = 0.15;
  }

  render(camera, dt) {
    this.vis.length = 0;
    const cx = camera.position.x, cz = camera.position.z, f = camera.getWorldDirection(this.tmpV || (this.tmpV = new THREE.Vector3()));
    for (const p of this.list) {
      if (p.state === 'away' || !p.colors) continue; const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz; if (d2 > SHOW_R * SHOW_R) continue;
      if (d2 > 36 && (dx * f.x + dz * f.z) < -0.25 * Math.sqrt(d2) - 2) continue;         // behind the camera
      this.vis.push(p);
    }
    const B = this.B, n = this.vis.length;
    for (let s = 0; s < n; s++) {
      const p = this.vis[s];
      animate(B, { phase: p.phase += p.speed * dt / (p.state === 'panic' ? 2.2 : 1.4) * 6.283, speed: p.speed, run: p.state === 'panic' ? 0.55 : 0.0, t: p.t, down: p.lie, look: p.look });
      B.root.position.set(p.x, p.y + p.lie * 0.13, p.z); B.root.rotation.y = p.h; B.root.updateMatrixWorld(true);
      for (const K of this.kinds) {
        const nb = K.bones.length;
        for (let b = 0; b < nb; b++) K.mesh.setMatrixAt(s * nb + b, K.bones[b].matrixWorld);
      }
      if (this.slotOwner[s] !== p) { this.slotOwner[s] = p; this.dye(s, p); }
    }
    for (const K of this.kinds) { K.mesh.count = n * K.bones.length; K.mesh.instanceMatrix.needsUpdate = true; if (this.recolor && K.mesh.instanceColor) K.mesh.instanceColor.needsUpdate = true; }
    if (this.recolor) this.recolor = false;
  }
  dye(slot, p) {
    const c = this.tmpC, col = p.colors; this.recolor = true;
    for (const K of this.kinds) {
      const hex = K.dye === 'shirt' ? col[0] : K.dye === 'pants' ? col[1] : K.dye === 'shoes' ? col[2] : K.dye === 'skin' ? col[3] : col[4];
      c.setHex(hex); const nb = K.bones.length; for (let b = 0; b < nb; b++) K.mesh.setColorAt(slot * nb + b, c);
    }
  }
}
