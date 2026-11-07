// The player on foot: a character you walk, run, sprint, crouch and jump with, who gets in and out of the car. This file has the
// movement (camera-relative, with collisions against buildings, poles, parked cars and traffic), the animation and the third-person
// camera. The figure itself is in person.js.
import * as THREE from 'three';
import { animate, buildRig, PERSON_H } from './person.js';
import { makeSmoothFigure } from './figure.js';
import { loadPerson, personKey, COPS } from './people.js';
import { groundAt, isWater, coastX, WORLD_LIM } from './world.js';
import { queryColliders, EDGE } from './city.js';
import { clamp, damp, lerp, wrapAngle } from './util.js';

export const SPEED = { walk: 1.9, jog: 3.9, sprint: 6.7, crouch: 1.45 };
const RAD = 0.34, GRAV = 15, JUMP = 5.0;
const found = [];

let blobMat = null, blobGeo = null;
export class Walker {
  // opts.lite: for the police officers: no made-up stand-in figure, just the bare stick skeleton that animates the real model.
  constructor(scene, outfit = 'street', opts = {}) {
    this.rig = opts.lite ? Object.assign(buildRig(null, null, false), { meshes: [] }) : makeSmoothFigure(outfit); this.mesh = this.rig.root; this.mesh.visible = false; scene.add(this.mesh);
    // A soft contact shadow, so the feet sit on the ground even with shadow maps off.
    if (!blobMat) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      blobGeo = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2); blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    }
    this.blob = new THREE.Mesh(blobGeo, blobMat.clone()); this.blob.material.map = blobMat.map;
    this.blob.renderOrder = 1; this.blob.visible = false; scene.add(this.blob); this.lite = !!opts.lite;
    this.active = false;
    this.x = 0; this.z = 0; this.y = 0; this.h = 0; this.vx = 0; this.vz = 0; this.vy = 0; this.speed = 0; this.phase = 0; this.t = Math.random() * 10;
    this.crouch = 0; this.crouching = false; this.run = 0; this.air = 0; this.grounded = true; this.turn = 0; this.look = 0;
    this.down = 0; this.downT = 0; this.stepAcc = 0; this.jumpHeld = false; this.sight = 110; this.onFoot = true;
    this.kind = 'asphalt'; this.px = 0; this.pz = 0; this.onStep = null; this.person = null;
    this.arms = null; this.faceYaw = null; this.placeWeapon = null;      // (a weapon in hand: see weapons.js)
    this.setOutfit(outfit);
  }
  get bodyY() { return this.y + 0.9; }
  worldVel() { return [this.vx, this.vz]; }
  // The character: one of the real people (people.js). The stick figure animates; until the real model has loaded (or if it cannot be loaded)
  // the smooth made-up figure stands in.
  attachPerson(p) {
    if (this.person && this.person !== p) { this.rig.root.remove(this.person.root); if (!this.lite) for (const k in this.person.mats) { const m = this.person.mats[k]; for (const t of [m.map, m.normalMap, m.roughnessMap]) t && t.dispose(); } }
    this.person = p; this.rig.root.add(p.root);
    for (const m of this.rig.meshes) m.visible = false;
    this.pose(0);
  }
  async setOutfit(key) {
    key = this.lite && COPS[key] ? key : personKey(key); if (this.person && this.person.key === key) return; this.want = key;
    try { const p = await loadPerson(key); if (this.want === key) this.attachPerson(p); } catch (e) { console.warn('character model not loaded', e); }
  }

  // Stand somewhere, facing a way.
  place(x, z, h) {
    this.x = this.px = x; this.z = this.pz = z; this.h = h; this.vx = this.vz = this.vy = 0; this.speed = 0; this.crouch = 0; this.crouching = false; this.down = 0; this.downT = 0;
    this.y = groundAt(x, z).y; this.grounded = true; this.air = 0; this.phase = 0;
    this.show(true); this.pose(0);
  }
  show(v) { this.active = v; this.mesh.visible = v; this.blob.visible = v; }

  // Knocked flat (by a car): flung along (vx, vz) and stays down for a moment.
  knockDown(vx, vz) {
    if (this.down > 0.3) return;
    this.downT = 2.4; this.vx = vx; this.vz = vz; this.vy = 2.5; this.grounded = false;
  }

  // f: { mx, my (right and forward, -1..1, relative to the camera), sprint, jump, crouch (held) }; camYaw: where the camera looks.
  // obstacles(x, z, out): fills `out` with circles { x, z, r } of cars near a point.
  update(dt, f, camYaw, obstacles) {
    if (!this.active) return;
    this.t += dt; this.px = this.x; this.pz = this.z;
    const knocked = this.downT > 0; if (knocked) this.downT -= dt;
    this.down = damp(this.down, knocked ? 1 : 0, knocked ? 14 : 5, dt);
    let mx = knocked ? 0 : f.mx, my = knocked ? 0 : f.my; const mag = Math.min(1, Math.hypot(mx, my));
    // Crouch toggles on while held.
    this.crouching = !!f.crouch && !knocked; this.crouch = damp(this.crouch, this.crouching ? 1 : 0, 10, dt);
    const armed = !!this.arms && this.arms.draw > 0.5, aiming = armed && this.faceYaw != null;      // (with a gun up you face where it points, and you cannot sprint)
    const sprint = !!f.sprint && !this.crouching && mag > 0.1 && !aiming;
    // The speed asked for: an analogue stick walks gently and runs fully; the keyboard is a jog; Shift sprints.
    let want = sprint ? SPEED.sprint : this.crouching ? SPEED.crouch : lerp(SPEED.walk, SPEED.jog, clamp((mag - 0.35) / 0.55, 0, 1));
    want *= mag > 0.05 ? Math.min(1, mag * 1.6) : 0; if (aiming) want = Math.min(want, this.crouching ? SPEED.crouch : SPEED.walk * 1.1);
    const sn = Math.sin(camYaw), cs = Math.cos(camYaw);
    let dx = sn * my - cs * mx, dz = cs * my + sn * mx;                  // forward is (sin, cos); right is (-cos, sin)
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const accel = this.grounded ? 11 : 2.2;
    if (!knocked && this.grounded) { this.vx = damp(this.vx, dx * want, accel, dt); this.vz = damp(this.vz, dz * want, accel, dt); }
    else if (!this.grounded && !knocked) { this.vx = damp(this.vx, dx * want, accel, dt); this.vz = damp(this.vz, dz * want, accel, dt); }
    else { const k = Math.exp(-3.2 * dt); this.vx *= k; this.vz *= k; }
    // Face the way we are going.
    const sp = Math.hypot(this.vx, this.vz);
    if (aiming && !knocked) { const d = wrapAngle(this.faceYaw - this.h); this.h += d * Math.min(1, dt * 13); this.turn = damp(this.turn, clamp(d * 0.8, -1, 1), 8, dt); }
    else if (sp > 0.4 && !knocked) { const target = Math.atan2(this.vx, this.vz), d = wrapAngle(target - this.h); this.h += d * Math.min(1, dt * (sprint ? 9 : 12)); this.turn = damp(this.turn, clamp(d * 1.2, -1, 1), 8, dt); }
    else this.turn = damp(this.turn, 0, 8, dt);
    // Jump.
    if (f.jump && !this.jumpHeld && this.grounded && !knocked && !this.crouching) { this.vy = JUMP; this.grounded = false; }
    this.jumpHeld = !!f.jump;
    // Move in small steps so nothing is skipped over.
    const n = Math.max(1, Math.ceil(sp * dt / 0.12));
    for (let i = 0; i < n; i++) { this.x += this.vx * dt / n; this.z += this.vz * dt / n; this.collide(obstacles); }
    this.speed = Math.hypot((this.x - this.px) / dt, (this.z - this.pz) / dt) || 0; if (this.speed < 0.05) this.speed = 0;
    // Vertical: step onto kerbs, fall off ledges, land.
    const gy = groundAt(this.x, this.z);
    this.kind = gy.kind || (gy.grass ? 'grass' : 'asphalt');
    if (this.grounded) {
      const dy = gy.y - this.y; this.y = Math.abs(dy) < 0.5 ? this.y + dy * Math.min(1, dt * 22) : gy.y;
      if (this.y > gy.y + 0.35) { this.grounded = false; this.vy = 0; }
    } else {
      this.vy -= GRAV * dt; this.y += this.vy * dt;
      if (this.y <= gy.y && this.vy <= 0) { this.y = gy.y; this.vy = 0; this.grounded = true; if (this.onStep) this.onStep(0.9, this.kind); if (knocked) this.vx *= 0.5; }
    }
    if (this.grounded) this.air = damp(this.air, 0, 18, dt); else { const a = clamp(Math.abs(this.vy) / 5, 0.45, 1); this.air = this.vy > 0 ? -a : a; }
    // Animation.
    this.run = clamp((this.speed - 1.6) / 4.8, 0, 1);
    const stride = lerp(1.35, 2.55, this.run);
    const back = aiming && (this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h)) < -0.2 ? -1 : 1;       // backing away: the stride runs the other way
    const before = this.phase; this.phase += back * this.speed * dt / stride * Math.PI * 2 * (this.grounded ? 1 : 0.35);
    if (this.grounded && this.speed > 0.6 && Math.floor(before / Math.PI) !== Math.floor(this.phase / Math.PI) && this.onStep) this.onStep(clamp(0.25 + this.speed * 0.1, 0.2, 0.9) * (this.crouching ? 0.45 : 1), this.kind);
    this.pose(dt);
  }

  pose(dt) {
    const B = this.rig, armed = this.arms && this.arms.draw > 0.001;
    animate(B, { phase: this.phase, speed: this.speed, run: this.run, crouch: this.crouch, air: this.air, t: this.t, turn: this.turn, down: this.down, look: this.look, weapon: armed ? this.arms : null });
    if (this.person) { this.person.pose(B); this.person.grip('R', armed ? 1 : 0); this.person.grip('L', armed && !this.arms.cfg.one ? 1 : 0); }
    this.mesh.position.set(this.x, this.y + this.down * 0.13, this.z);
    this.mesh.rotation.y = this.h;
    if (armed && this.placeWeapon) { this.mesh.updateMatrixWorld(true); this.placeWeapon(this); }      // the gun goes where the hand is
    this.blob.position.set(this.x, this.y + 0.04, this.z); this.blob.scale.setScalar(1 + this.down * 1.2); this.blob.material.opacity = this.grounded ? 1 : clamp(1 - (this.y - groundAt(this.x, this.z).y) * 0.5, 0.3, 1);
  }

  // Push out of buildings, poles, trees, cars and the sea.
  collide(obstacles) {
    queryColliders(this.x, this.z, RAD + 1.2, found);
    for (const c of found) {
      if (c.type === 'box') {
        const qx = clamp(this.x, c.x0, c.x1), qz = clamp(this.z, c.z0, c.z1); let dx = this.x - qx, dz = this.z - qz, d = Math.hypot(dx, dz);
        if (d >= RAD) continue;
        if (d > 1e-4) { this.x += dx / d * (RAD - d); this.z += dz / d * (RAD - d); }
        else { const o = [[this.x - c.x0, -1, 0], [c.x1 - this.x, 1, 0], [this.z - c.z0, 0, -1], [c.z1 - this.z, 0, 1]].sort((a, b) => a[0] - b[0])[0]; this.x += o[1] * (o[0] + RAD); this.z += o[2] * (o[0] + RAD); }
      } else {
        const dx = this.x - c.x, dz = this.z - c.z, d = Math.hypot(dx, dz), r = RAD + c.r; if (d >= r || d < 1e-5) continue;
        this.x += dx / d * (r - d); this.z += dz / d * (r - d);
      }
    }
    if (obstacles) {
      const list = obstacles(this.x, this.z);
      for (const o of list) { const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz), r = RAD + o.r; if (d >= r || d < 1e-5) continue; this.x += dx / d * (r - d); this.z += dz / d * (r - d); }
    }
    // The sea, steep slopes and the edge of the world.
    if (Math.abs(this.x) > EDGE - 40 || Math.abs(this.z) > EDGE - 40) {
      const lim = coastX(this.z) + 74; if (this.x < lim) this.x = lim;
      this.x = clamp(this.x, WORLD_LIM.x0, WORLD_LIM.x1); this.z = clamp(this.z, WORLD_LIM.z0, WORLD_LIM.z1);
      const stepLen = Math.hypot(this.vx, this.vz) * 0.12;                  // a slope steeper than about 45 degrees ahead is a wall
      if (stepLen > 0.05) { const gx = groundAt(this.x + this.vx * 0.12, this.z + this.vz * 0.12).y - groundAt(this.x, this.z).y; if (gx / stepLen > 1.1) { this.x = this.px; this.z = this.pz; this.vx *= 0.3; this.vz *= 0.3; } }
    }
  }
}

// ---- The camera on foot -----------------------------------------------------------------------------------------------
// Orbits the character: the mouse, the right stick or a drag turns it; moving forward turns it round behind you. It is pulled
// in when a building is in the way.
const _t = new THREE.Vector3(), _p = new THREE.Vector3();
export class FootCamera {
  constructor() { this.yaw = 0; this.pitch = 0.16; this.dist = 3.5; this.height = 1.5; this.init = false; this.idle = 9; this.shoulder = 0.3; this.fov = 62; this.cur = 3.5; }
  reset(yaw) { this.yaw = yaw; this.pitch = 0.2; this.init = false; this.idle = 9; }
  // o: { dyaw, dpitch, zoom } from the input; w: the walker; move: { my } forward amount.
  update(dt, camera, w, o, move) {
    if (o.dyaw || o.dpitch) this.idle = 0; else this.idle += dt;
    this.yaw -= o.dyaw; this.pitch = clamp(this.pitch + o.dpitch, -0.35, 1.15);
    // Behind you when you run forward and are not looking about.
    if (this.idle > 1.2 && move.my > 0.2 && w.speed > 1) this.yaw += wrapAngle(w.h - this.yaw) * Math.min(1, dt * 1.7 * move.my);
    const crouchK = w.crouch * 0.45, zoom = clamp(o.zoom, 0.55, 2.2);
    const aim = this.aimK = damp(this.aimK || 0, o.aim || 0, 9, dt);                       // aiming: in close over the right shoulder, looking where the crosshair points
    const dist = (this.dist + w.run * 0.5) * zoom * (1 - 0.52 * aim), hy = (this.height - crouchK) + (w.down * -0.8);
    const shoulder = lerp(this.shoulder, 0.62, aim);
    _t.set(w.x, w.y + hy, w.z);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    // The point behind and above, a little to the right (over the shoulder).
    const bx = -sn * cp * dist, bz = -cs * cp * dist;
    const rx = -cs * shoulder, rz = sn * shoulder;
    let k = 1;
    for (let i = 0; i <= 8; i++) {                                          // walk out along the line, stopping short of anything solid
      const t = i / 8, px = _t.x + (bx + rx) * t, pz = _t.z + (bz + rz) * t, py = _t.y + sp * dist * t;
      queryColliders(px, pz, 0.7, found);
      let hit = false;
      for (const c of found) { if (c.type === 'box' && px > c.x0 - 0.35 && px < c.x1 + 0.35 && pz > c.z0 - 0.35 && pz < c.z1 + 0.35) hit = true; else if (c.type === 'circ' && Math.hypot(px - c.x, pz - c.z) < c.r + 0.2 && c.r > 0.9) hit = true; }
      if (hit || py < groundAt(px, pz).y + 0.25) { k = Math.max(0.12, (i - 1) / 8); break; }
    }
    this.cur = this.init ? damp(this.cur, k, k < this.cur ? 18 : 3, dt) : k; this.init = true;
    const c = this.cur;
    _p.set(_t.x + (bx + rx) * c, Math.max(_t.y + sp * dist * c, groundAt(_t.x + (bx + rx) * c, _t.z + (bz + rz) * c).y + 0.3), _t.z + (bz + rz) * c);
    camera.position.copy(_p);
    // Look at the character's shoulders, a bit ahead of where they are going.
    let lx = _t.x + sn * 0.0 + (rx * -0.5) + Math.sin(this.yaw) * 2.2, ly = w.y + 1.28 - crouchK - Math.sin(this.pitch) * 0.2 + w.down * -0.8, lz = _t.z + (rz * -0.5) + Math.cos(this.yaw) * 2.2;
    if (aim > 0.001) {                                                                      // aimed: look straight along the line that runs through the character's head
      lx = lerp(lx, _p.x + sn * cp * 14, aim); ly = lerp(ly, _p.y - sp * 14, aim); lz = lerp(lz, _p.z + cs * cp * 14, aim);
    }
    camera.lookAt(lx, ly, lz);
    camera.fov = damp(camera.fov, lerp(60 + w.run * 6 + (w.speed > 5.5 ? 2 : 0), 47, aim), 5, dt); camera.updateProjectionMatrix();
  }
}
