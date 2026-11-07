// The police helicopter. From three stars on, one comes in over the rooftops, circles the player with a searchlight, and tells every car where
// they are while it can see them (smoke hides you from it, and so does going far from it). It can be shot down: bullets, rockets and blasts
// hurt it; when it is destroyed it spins down and crashes, and the next one takes a while to arrive.
import * as THREE from 'three';
import { groundAt } from './world.js';
import { clamp, damp, lerp, wrapAngle } from './util.js';

const HP = 240, ORBIT = 46, ALT = 52, SPEED = 30;
const _down = new THREE.Vector3(0, -1, 0), _dir = new THREE.Vector3();
export class Heli {
  // env: { scene, police, audio, hud, fx (particles), camera, boom(x, z, power), target(), traffic }
  constructor(env) {
    this.env = env; this.alive = false; this.coolT = 0; this.hp = HP; this.t = 0; this.x = 0; this.y = 0; this.z = 0; this.h = 0; this.vx = 0; this.vz = 0; this.theta = Math.random() * 6.28; this.rotor = 0; this.told = false;
    const g = this.mesh = new THREE.Group(); g.visible = false; env.scene.add(g);
    const body = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.35, metalness: 0.5, envMapIntensity: 1.2 }), glass = new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.8 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b2e35, roughness: 0.5, metalness: 0.8 });
    const fus = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14).scale(1.25, 1.35, 3.0), body); fus.position.y = 0.2; g.add(fus);
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.12, 1.1, 1.7), glass); cab.position.set(0, 0.55, 1.65); g.add(cab);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.5, 6, 10).rotateX(Math.PI / 2), body); boom.position.set(0, 0.55, -5.2); g.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.9), body); fin.position.set(0, 1.25, -7.9); fin.rotation.x = -0.3; g.add(fin);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.07, 0.5), body); stab.position.set(0, 0.7, -7.2); g.add(stab);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.8, 8), metal); mast.position.y = 1.9; g.add(mast);
    this.rotorG = new THREE.Group(); this.rotorG.position.y = 2.35; g.add(this.rotorG);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.025, 0.22), metal); b.rotation.y = i * Math.PI / 2; b.position.set(0, 0, 0); this.rotorG.add(b); }
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(6.5, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xaab0b8, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide })); this.disc.position.y = 2.35; g.add(this.disc);
    this.tailRotor = new THREE.Group(); this.tailRotor.position.set(0.25, 1.35, -7.9); g.add(this.tailRotor); for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.5, 0.12), metal); b.rotation.x = i * Math.PI / 2; this.tailRotor.add(b); }
    for (const s of [-1, 1]) { const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6).rotateX(Math.PI / 2), metal); sk.position.set(s * 1.1, -1.35, 0.2); g.add(sk); for (const z of [-0.8, 1.3]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 5), metal); st.position.set(s * 1.0, -0.8, z); st.rotation.z = s * 0.25; g.add(st); } }
    // A white stripe on each flank (no canvas texture: a late canvas can fail on an iPad).
    const stripe = new THREE.MeshBasicMaterial({ color: 0xe8ecf2 });
    for (const sd of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.2), stripe); m.position.set(sd * 1.33, 0.1, -0.5); m.rotation.y = sd * Math.PI / 2; g.add(m); }
    // The searchlight: a soft cone down to a pool of light on the ground.
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); this.beam.visible = false; this.beam.frustumCulled = false; env.scene.add(this.beam);
    this.lx = 0; this.lz = 0; this.rotorT = 0; this.crash = null;
  }
  reset() { this.alive = false; this.mesh.visible = false; this.beam.visible = false; this.crash = null; this.coolT = 0; this.told = false; this.env.police.heliSees = false; }
  // Called every frame of a chase. P: the target (the player's car or on-foot character).
  update(dt, P) {
    const police = this.env.police, stars = police.stars, running = police.active && police.result === 'running';
    this.coolT = Math.max(0, this.coolT - dt); police.heliSees = false;
    if (this.crash) { this.crashUpdate(dt); return; }
    if (!this.alive) {
      if (running && stars >= 3 && police.time > 8 && this.coolT <= 0) this.spawn(P);
      return;
    }
    if (!running || stars < 2) { this.leave(dt); return; }
    this.t += dt; this.theta += dt * (SPEED * 0.8 / ORBIT);
    // Fly to a point on the circle round the target.
    const tx = P.x + Math.cos(this.theta) * ORBIT, tz = P.z + Math.sin(this.theta) * ORBIT, dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz) || 1, sp = Math.min(SPEED, d * 0.9 + 6);
    const ax = dx / d * sp, az = dz / d * sp; this.vx = damp(this.vx, ax, 1.4, dt); this.vz = damp(this.vz, az, 1.4, dt); this.x += this.vx * dt; this.z += this.vz * dt;
    const gy = groundAt(this.x, this.z).y, ty = Math.max(gy, P.y || 0) + ALT + Math.sin(this.t * 0.7) * 2.5; this.y = damp(this.y, ty, 1.0, dt);
    this.place(dt);
    // The searchlight follows the target, a little behind; it sees them if close enough and the smoke is not in the way.
    this.lx = damp(this.lx, P.x, 3.2, dt); this.lz = damp(this.lz, P.z, 3.2, dt);
    const dist = Math.hypot(P.x - this.x, P.z - this.z), smoke = police.smokeBlocks(this.x, this.z, P.x, P.z);
    const sees = dist < 190 && !smoke; police.heliSees = sees;
    if (sees && !this.told) { this.told = true; this.env.hud.toast('POLICE HELICOPTER: THE SEARCHLIGHT IS ON YOU', 2.4); }
    if (!sees) this.told = false;
    this.light(P);
    // The sound of it: a chopping noise from where it is (heard through the city, with its echo).
    this.rotorT -= dt; if (this.rotorT <= 0) { this.rotorT = 0.075; this.env.audio.burst(190, 95, 0.07, 0.22, 'lowpass', 0.9, [this.x, this.y, this.z]); }
  }
  spawn(P) {
    this.alive = true; this.hp = HP; this.t = 0; const a = Math.random() * 6.28; this.x = P.x + Math.cos(a) * 380; this.z = P.z + Math.sin(a) * 380; this.y = groundAt(this.x, this.z).y + ALT + 20; this.theta = a + Math.PI; this.vx = this.vz = 0;
    this.lx = P.x; this.lz = P.z; this.mesh.visible = true; this.env.police.messages.push('A HELICOPTER IS COMING');
  }
  leave(dt) { this.vz = damp(this.vz, 24, 0.6, dt); this.y += dt * 10; this.z += this.vz * dt; this.place(dt); this.beam.visible = false; if (this.y > 260) { this.alive = false; this.mesh.visible = false; } }
  place(dt) {
    const heading = Math.atan2(this.vx, this.vz); if (Math.hypot(this.vx, this.vz) > 4) this.h += wrapAngle(heading - this.h) * Math.min(1, dt * 2.2);
    this.rotor += dt * 40; this.rotorG.rotation.y = this.rotor; this.tailRotor.rotation.x = this.rotor * 1.4;
    const lat = (this.vx * Math.cos(this.h) - this.vz * Math.sin(this.h)) * 0.01, fwd = (this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h)) / SPEED;
    this.mesh.position.set(this.x, this.y, this.z); this.mesh.rotation.set(0.05 + fwd * 0.12, this.h, clamp(-lat, -0.25, 0.25), 'YXZ');
  }
  // The searchlight: a faint cone from the helicopter to where it points. It fades away when the camera is close to it (in the chase view it
  // would hang over the car like a fog).
  light(P) {
    const gy = groundAt(this.lx, this.lz).y, ox = this.x, oy = this.y - 1.2, oz = this.z, dx = this.lx - ox, dy = gy - oy, dz = this.lz - oz, L = Math.hypot(dx, dy, dz) || 1;
    const cam = this.env.camera, cp = cam.position, t = clamp(((cp.x - ox) * dx + (cp.y - oy) * dy + (cp.z - oz) * dz) / (L * L), 0, 1);
    const dist = Math.hypot(cp.x - (ox + dx * t), cp.y - (oy + dy * t), cp.z - (oz + dz * t)), fade = clamp((dist - 6) / 22, 0, 1);
    this.beam.visible = fade > 0.03; this.beam.material.opacity = 0.085 * fade;
    this.beam.position.set(ox, oy, oz); this.beam.scale.set(L * 0.14, L, L * 0.14);
    this.beam.quaternion.setFromUnitVectors(_down, _dir.set(dx / L, dy / L, dz / L));
  }
  // Shooting it.
  damage(amount) { if (!this.alive || this.crash) return false; this.hp -= amount; if (this.hp <= 0) { this.shotDown(); return true; } return false; }
  blast(x, y, z, radius, dmg) { if (!this.alive || this.crash) return; const d = Math.hypot(this.x - x, this.y - y, this.z - z); if (d < radius * 1.8) this.damage(dmg * (1 - d / (radius * 1.8))); }
  shotDown() { this.crash = { vy: 0, spin: 3 + Math.random() * 3, t: 0 }; this.env.hud.toast('HELICOPTER DOWN', 1.8); this.env.police.addHeat(0.3); this.env.police.messages.push('HELICOPTER DOWN'); this.beam.visible = false; }
  crashUpdate(dt) {
    const c = this.crash; c.t += dt; c.vy -= 22 * dt; this.y += c.vy * dt; this.h += c.spin * dt; this.x += this.vx * dt * 0.5; this.z += this.vz * dt * 0.5; this.mesh.position.set(this.x, this.y, this.z); this.mesh.rotation.set(0.5, this.h, 0.7, 'YXZ'); this.rotorG.rotation.y += dt * 12;
    if (this.env.fx && Math.random() < 0.7) this.env.fx.puff(this.x, this.y, this.z, 0, 1, 0, 1.2, 1.6, 0.1, 0.6, 2.4);
    const gy = groundAt(this.x, this.z).y + 1;
    if (this.y <= gy) {
      this.env.fx.explosion(this.x, gy, this.z, 1.5); this.env.boom(this.x, this.z, 1.5);
      const P = this.env.police; P.explode && P.explode(this.x, this.z, gy, 1.2, 16, 160, this.env.target(), this.env.traffic);
      this.mesh.visible = false; this.alive = false; this.crash = null; this.coolT = 45;
    }
  }
}
