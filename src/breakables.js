// Smashed street furniture. When the car (or a police car) hits a lamp post, pole, hydrant, bin or bench hard enough, city.js hides
// it and this file takes over: lamp posts and poles topple about their foot and spark; hydrants, bins and benches are flung away and
// tumble to a stop; a hydrant leaves a jet of water and a spreading puddle. Debris stays where it lands.
import * as THREE from 'three';
import { groundAt } from './world.js';
import { clamp } from './util.js';

const MAX = 28, TALL = { lamp: 8.6, pole: 11 };
const PIECE = { lamp: ['lamp', 'bulb'], pole: ['pole'], hydrant: ['hydrant'], bin: ['bin'], bench: ['bench'] };
const RADIUS = { hydrant: 0.28, bin: 0.32, bench: 0.3 };

export class Debris {
  constructor(scene, props, fx) {
    this.scene = scene; this.props = props; this.fx = fx; this.list = []; this.jets = []; this.onClang = null;
    const wet = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0, envMapIntensity: 1.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.puddleGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2); this.wet = wet;
  }
  // x, z: where it stood; vx, vz: the way it is pushed (the car's velocity).
  spawn(kind, x, z, yaw, vx, vz) {
    const P = this.props, y = groundAt(x, z).y, speed = Math.hypot(vx, vz);
    const grp = new THREE.Group();
    for (const k of PIECE[kind]) { const m = new THREE.Mesh(P.geo[k], P.mat[k]); m.castShadow = true; grp.add(m); }
    grp.position.set(x, y, z); grp.rotation.y = yaw; this.scene.add(grp);
    const d = { kind, grp, x, y, z, yaw, vx: 0, vy: 0, vz: 0, age: 0, rest: false, tall: !!TALL[kind] };
    if (d.tall) {
      // Topples about its foot, away from the push.
      const l = Math.hypot(vx, vz) || 1; d.dx = speed > 0.5 ? vx / l : Math.cos(yaw); d.dz = speed > 0.5 ? vz / l : -Math.sin(yaw);
      d.theta = 0.04; d.omega = 0.5 + speed * 0.07; d.len = TALL[kind]; d.hits = 0;
      this.fx.flash(x, y + 0.5, z, 1.4, 0.18, 4, 0.7, 0.85, 1);
      for (let i = 0; i < 14; i++) this.fx.spark(x + (Math.random() - 0.5) * 0.3, y + 0.3, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 6, 2 + Math.random() * 5, (Math.random() - 0.5) * 6, 0.5 + Math.random() * 0.7);
    } else {
      d.vx = vx * 0.85 + (Math.random() - 0.5) * 2.5; d.vz = vz * 0.85 + (Math.random() - 0.5) * 2.5; d.vy = 2.5 + Math.random() * 3 + speed * 0.15;
      d.spin = [(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 12]; d.r = RADIUS[kind] || 0.3; d.y0 = y + d.r; grp.position.y = d.y0;
      for (let i = 0; i < 6; i++) this.fx.spark(x, y + 0.4, z, (Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 5, 0.4);
    }
    if (kind === 'hydrant') {
      const pud = new THREE.Mesh(this.puddleGeo, this.wet.clone()); pud.position.set(x, y + 0.025, z); pud.scale.setScalar(0.1); pud.renderOrder = 2; this.scene.add(pud);
      this.jets.push({ x, y, z, t: 0, life: 16, pud });
    }
    this.list.push(d);
    while (this.list.length > MAX) this.remove(this.list.shift());
    if (this.onClang) this.onClang(kind, speed);
    return d;
  }
  remove(d) { this.scene.remove(d.grp); }
  clear() { for (const d of this.list) this.remove(d); this.list.length = 0; for (const j of this.jets) { this.scene.remove(j.pud); j.pud.material.dispose(); } this.jets.length = 0; }
  update(dt) {
    for (const d of this.list) {
      d.age += dt; if (d.rest) continue;
      if (d.tall) {
        d.omega += (1.7 * Math.sin(d.theta) + 0.02) * dt * (9.8 / 9.8) * 1.0; d.theta += d.omega * dt;
        if (d.theta > 1.52) { d.theta = 1.52; if (d.omega > 0.8 && d.hits < 3) { d.hits++; if (this.onClang) this.onClang(d.kind, d.omega * 3); for (let i = 0; i < 5; i++) this.fx.spark(d.x + d.dx * d.len * 0.97, d.y + 0.2, d.z + d.dz * d.len * 0.97, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, 0.4); } d.omega = -d.omega * 0.28; if (Math.abs(d.omega) < 0.3) { d.omega = 0; d.rest = d.hits > 0 || d.age > 3; } }
        d.grp.quaternion.setFromAxisAngle(this._ax.set(d.dz, 0, -d.dx), d.theta); d.grp.quaternion.multiply(this._q.setFromAxisAngle(this._up, d.yaw));
        d.grp.position.set(d.x, d.y + (d.theta > 1.4 ? 0.12 : 0), d.z);
      } else {
        d.vy -= 16 * dt; d.x += d.vx * dt; d.z += d.vz * dt; d.y0 += d.vy * dt;
        const g = groundAt(d.x, d.z).y + d.r;
        if (d.y0 <= g) { d.y0 = g; if (d.vy < -1.5 && this.onClang && d.vy < -3) this.onClang(d.kind, -d.vy); d.vy = -d.vy * 0.28; const f = Math.exp(-3.5 * dt); d.vx *= f; d.vz *= f; d.spin[0] *= 0.6; d.spin[1] *= 0.6; d.spin[2] *= 0.6; if (Math.abs(d.vy) < 0.6) d.vy = 0; }
        const sp = Math.hypot(d.vx, d.vz);
        d.grp.rotation.x += d.spin[0] * dt; d.grp.rotation.y += d.spin[1] * dt; d.grp.rotation.z += d.spin[2] * dt;
        if (d.vy === 0 && sp < 0.35) {                                           // come to rest lying on a side (or upright), whichever is nearer
          const q = Math.PI / 2, tx = Math.round(d.grp.rotation.x / q) * q, tz = Math.round(d.grp.rotation.z / q) * q, k = Math.min(1, dt * 10);
          d.grp.rotation.x += (tx - d.grp.rotation.x) * k; d.grp.rotation.z += (tz - d.grp.rotation.z) * k;
          d.spin[0] = d.spin[1] = d.spin[2] = 0; d.vx = d.vz = 0;
          if (Math.abs(tx - d.grp.rotation.x) < 0.02 && Math.abs(tz - d.grp.rotation.z) < 0.02) { d.rest = true; d.grp.rotation.x = tx; d.grp.rotation.z = tz; }
        }
        d.grp.position.set(d.x, d.y0 - d.r + (d.rest && (Math.abs(d.grp.rotation.x) > 1 || Math.abs(d.grp.rotation.z) > 1) ? d.r * 0.6 : 0), d.z);
      }
    }
    // Hydrant jets: a column of spray that falls back as droplets, and a puddle that spreads.
    for (let i = 0; i < this.jets.length;) {
      const j = this.jets[i]; j.t += dt;
      const k = clamp(1 - Math.max(0, j.t - (j.life - 3)) / 3, 0, 1);
      if (k > 0) {
        const n = Math.max(1, Math.round(dt * 70 * k));
        for (let q = 0; q < n; q++) { const a = Math.random() * 6.283, r = Math.random() * 0.5 * k; this.fx.water(j.x + Math.cos(a) * 0.05, j.y + 0.5, j.z + Math.sin(a) * 0.05, Math.cos(a) * r, (8 + Math.random() * 3.5) * k, Math.sin(a) * r); }
      }
      const sc = 0.3 + Math.min(3.2, j.t * 0.3) * k + (1 - k) * 1.2; j.pud.scale.setScalar(sc); j.pud.material.opacity = clamp(j.t / 2, 0, 1) * (0.4 + 0.5 * k);
      if (j.t > j.life + 12) { this.scene.remove(j.pud); j.pud.material.dispose(); this.jets.splice(i, 1); } else i++;
    }
  }
}
Debris.prototype._ax = new THREE.Vector3(); Debris.prototype._up = new THREE.Vector3(0, 1, 0); Debris.prototype._q = new THREE.Quaternion();
