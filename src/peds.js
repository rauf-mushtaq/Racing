// Pedestrians: people strolling round the pavements of the city blocks, standing about, getting out of the way (and running when
// something loud happens). They are drawn as instanced meshes (one per body part, so about a dozen draw calls for the whole crowd)
// on the same skeleton and animation as the player's character. A car that hits one knocks it over; that is a crime.
import * as THREE from 'three';
import { bodyParts, buildRig, animate, SKINS, HAIRS } from './person.js';
import { figureMaterials } from './figure.js';
import { N, SP, blockRect } from './city.js';
import { groundAt } from './world.js';
import { inWater } from './rivercourse.js';
import { mulberry32, clamp, damp, wrapAngle } from './util.js';
import { PEDS, loadPerson } from './people.js';
import { Mocap } from './mocap.js';
import { Q } from './quality.js';

const SHIRTS = [0xd9d4cc, 0x2c3e55, 0x8a2b2b, 0x2f5d44, 0xe0b23c, 0x3a3a3f, 0xf0f0f0, 0x7a4b8a, 0x2a7aa8, 0xc7632b, 0xb8a58a, 0x1e1e22, 0xc44d6b, 0x587a3a, 0x9bb7d4, 0xe8c9b0];
const PANTS = [0x2a3550, 0x1c1c20, 0x4a4036, 0x6b6b70, 0x3a2f28, 0x2d4660, 0x8a7d62, 0x22303a, 0x59606b];
const SHOES = [0xf2f2f2, 0x1c1c1c, 0x6b4a32, 0xc9c0b0, 0x7a2a2a];
const OFFSETS = [1.8, 2.4, 3.0];
const SHOW_R = 125;
// The people close to the camera are real people (Rocketbox models with recorded walking, see people.js and mocap.js): a small pool of them is
// handed to whoever is nearest, and given back as they walk away (the rest of the crowd is the instanced figures below).
const REAL = { ultra: 10, high: 8, medium: 5, low: 3 }[Q.name] ?? 4, REAL_IN = 36, REAL_OUT = 46;

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

// Hands in front of the chest, clapping.
function clapArms(B, t) {
  const c = Math.sin(t * 15) * 0.22;
  B.shoulderL.rotation.x = -(0.95 + c); B.shoulderR.rotation.x = -(0.95 - c); B.shoulderL.rotation.z = -0.2 + c * 0.4; B.shoulderR.rotation.z = 0.2 - c * 0.4; B.elbowL.rotation.x = -1.75; B.elbowR.rotation.x = -1.75;
}

export class Peds {
  constructor(scene, count, shadows) {
    this.scene = scene; this.count = count; this.rnd = mulberry32(2025); this.list = []; this.onHit = null;
    // Geometry for every part, with white clothes (dyed per instance) and white skin (tinted per instance).
    const parts = bodyParts({ skin: 0xffffff, hairStyle: 'short' }, true), mats = figureMaterials();
    this.B = buildRig(null, null);                              // just the joints
    this.kinds = [];
    const dye = { torso: 'shirt', uArm: 'shirt', fArm: 'shirt', pelvis: 'pants', thigh: 'pants', shin: 'pants', shoe: 'shoes', head: 'skin', hand: 'skin', hair: 'hair' };
    for (const [k, geo] of Object.entries(parts)) {
      if (!geo || !dye[k]) continue;
      const bones = this.B.parts[k], n = count * bones.length;
      const mesh = new THREE.InstancedMesh(geo, k === 'head' || k === 'hand' ? mats.skin : k === 'hair' ? mats.hair : k === 'shoe' ? mats.shoe : mats.cloth, n);
      mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = shadows; mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(mesh); this.kinds.push({ k, bones, mesh, dye: dye[k] });
    }
    this.vis = []; this.slotOwner = new Array(count).fill(-1); this.tmpC = new THREE.Color(); this.m = new THREE.Matrix4(); this.mir = new THREE.Matrix4().makeScale(-1, 1, 1);
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.real = { slots: [], started: false }; this.realScale = 1; this.shadows = shadows; this.frame = 0;
  }
  // Real people, one at a time (each costs a model to clone and some textures to upload, so they are spread out in time).
  startReal() {
    const R = this.real; if (R.started || !REAL) return; R.started = true;
    const keys = Object.keys(PEDS); let n = 0;
    const next = async () => {
      if (n >= REAL) return;
      const key = keys[n % keys.length];
      try {
        const person = await loadPerson(key), rig = Object.assign(buildRig(null, null, false), { meshes: [] });
        rig.root.add(person.root); person.setShadows(this.shadows); rig.root.visible = false; this.scene.add(rig.root);
        R.slots.push({ idx: R.slots.length, key, person, rig, ped: null });
      } catch (e) { console.warn('pedestrian model not loaded', key, e); R.failed = true; return; }
      n++; setTimeout(next, 600);
    };
    next();
  }
  // Give the nearest people to the pool, and take them back when they are far away.
  bindReal(camera) {
    const R = this.real, n = Math.min(R.slots.length, Math.round(R.slots.length * this.realScale)); const cx = camera.position.x, cz = camera.position.z;
    for (const p of this.vis) p.seen = this.frame;
    for (const sl of R.slots) {
      const p = sl.ped; if (!p) continue;
      const d2 = (p.x - cx) ** 2 + (p.z - cz) ** 2;
      if (p.state === 'away' || p.seen !== this.frame || d2 > REAL_OUT * REAL_OUT || sl.idx >= n) { sl.ped = null; p.real = null; sl.rig.root.visible = false; }
    }
    if (!n) return;
    const cand = this.vis.filter(p => !p.real && p.state !== 'away' && (p.x - cx) ** 2 + (p.z - cz) ** 2 < REAL_IN * REAL_IN);
    if (!cand.length) return;
    cand.sort((a, b) => ((a.x - cx) ** 2 + (a.z - cz) ** 2) - ((b.x - cx) ** 2 + (b.z - cz) ** 2));
    for (const p of cand) { const free = R.slots.find(sl => !sl.ped && sl.idx < n); if (!free) break; free.ped = p; p.real = free; free.rig.root.visible = true; p.hs = p.hs || 0.95 + this.rnd() * 0.1; free.person.root.scale.setScalar(0.01 * p.hs); }
  }
  poseReal(camera, dt) {
    const cx = camera.position.x, cz = camera.position.z;
    for (const sl of this.real.slots) {
      const p = sl.ped; if (!p) continue;
      const sp = Math.min(p.speed, 5.5), lie = p.lie || 0, B = sl.rig, d2 = (p.x - cx) ** 2 + (p.z - cz) ** 2;
      p.mphase = (p.mphase ?? p.phase / 6.283) + sp * dt / Mocap.strideAt(Math.max(sp, 0.7));
      if (lie > 0.01 || p.clap) { animate(B, { down: lie, t: p.t, speed: 0 }); if (p.clap) clapArms(B, p.t); } else B.root.rotation.x = 0;
      sl.person.faceOn = d2 < 450;
      sl.person.poseMocap(B, { speed: sp, phase: p.mphase, t: p.t, pLegs: Math.min(1, lie * 3), pUpper: p.clap ? 1 : Math.min(1, lie * 3) });
      sl.person.updateFace(dt);
      B.root.position.set(p.x, p.y + lie * 0.13, p.z); B.root.rotation.y = p.h;
    }
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
  setCount(n) { for (const p of this.list.slice(n)) if (p.real) { p.real.ped = null; p.real.rig.root.visible = false; p.real = null; } n = Math.min(n, this.count); while (this.list.length > n) this.list.pop(); while (this.list.length < n) this.list.push({}); }

  // Everyone within r metres of a point is frightened and runs.
  scare(x, z, r, secs = 4) {
    for (const p of this.list) {
      if (p.state === 'down' || p.state === 'away') continue; const dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz > r * r) continue;
      if (p.state === 'watch') { this.relink(p); p.spot = null; p.clap = 0; p.state = 'panic'; p.panic = secs * (0.7 + this.rnd() * 0.6); p.dir = 1; continue; }     // (the audience scatters)
      if (!p.ring) continue;
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
      if (p.state === 'watch') {                                                 // standing round a street performer (see buskers.js)
        p.t += dt; p.speed = damp(p.speed, 0, 5, dt); p.lie = damp(p.lie || 0, 0, 8, dt); p.look = Math.sin(p.t * 0.5 + idx) * 0.3;
        if (!p.spot || !p.spot.live) { p.state = 'away'; p.spot = null; p.clap = 0; }
        continue;
      }
      if (!p.colors || p.state === 'away' || Math.hypot(p.x - focus.x, p.z - focus.z) > 230) { this.spawn(p, focus, camera, !this._started); if (p.state === 'away') continue; }
      p.t += dt;
      if (p.state === 'down') {
        p.downT -= dt; p.vy -= 16 * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; const g = groundAt(p.x, p.z).y;
        if (p.y <= g) { p.y = g; p.vy = 0; const k = Math.exp(-5 * dt); p.vx *= k; p.vz *= k; }
        if (inWater(p.x, p.z)) { p.state = 'away'; continue; }                                         // (knocked into the river: gone; someone else turns up)
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
          p.h += wrapAngle(th - p.h) * Math.min(1, dt * (p.speed > 0.1 ? 7 : 2)); p.y = groundAt(p.x, p.z).y;       // (on a bridge, the deck)
        }
        p.lie = damp(p.lie, 0, 8, dt);
        p.look = Math.sin(p.t * 0.5 + idx) * 0.4 * (p.state === 'idle' ? 1 : 0.3);
      }
    }
    if (!this._started) { setTimeout(() => this.startReal(), 2500); }
    this._started = true;
  }
  // After being knocked down, rejoin the nearest pavement loop.
  relink(p) {
    const i = clamp(Math.floor(p.x / SP), -N, N - 1), j = clamp(Math.floor(p.z / SP), -N, N - 1), d = OFFSETS[1], ring = ringOf(i, j, d);
    let best = 0, bd = 1e9; for (let s = 0; s < ring.L; s += 3) { const [x, z] = ringAt(ring, s); const dd = (x - p.x) ** 2 + (z - p.z) ** 2; if (dd < bd) { bd = dd; best = s; } }
    p.i = i; p.j = j; p.d = d; p.ring = ring; p.s = best; p.y = groundAt(p.x, p.z).y;
  }

  render(camera, dt) {
    this.vis.length = 0;
    const cx = camera.position.x, cz = camera.position.z, f = camera.getWorldDirection(this.tmpV || (this.tmpV = new THREE.Vector3()));
    for (const p of this.list) {
      if (p.state === 'away' || !p.colors) continue; const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz; if (d2 > SHOW_R * SHOW_R) continue;
      if (d2 > 36 && (dx * f.x + dz * f.z) < -0.25 * Math.sqrt(d2) - 2) continue;         // behind the camera
      this.vis.push(p);
    }
    this.frame++;
    if (this.real.slots.length) { this.bindReal(camera); this.poseReal(camera, dt); }
    const inst = this.inst || (this.inst = []); inst.length = 0; for (const p of this.vis) { if (!p.real) inst.push(p); else p.phase += p.speed * dt / (p.state === 'panic' ? 2.2 : 1.4) * 6.283; }
    const B = this.B, n = inst.length;
    for (let s = 0; s < n; s++) {
      const p = inst[s];
      animate(B, { phase: p.phase += p.speed * dt / (p.state === 'panic' ? 2.2 : 1.4) * 6.283, speed: p.speed, run: p.state === 'panic' ? 0.55 : 0.0, t: p.t, down: p.lie, look: p.look });
      if (p.clap) clapArms(B, p.t);
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
