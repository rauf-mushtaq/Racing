// Tyre smoke and skid marks.
import * as THREE from 'three';
import { puffTex } from './textures.js';

export class FX {
  constructor(scene) {
    // Skid marks: a ring buffer of flat quads.
    this.maxSkid = 1800;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.skids = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), this.maxSkid);
    this.skids.count = 0; this.skids.frustumCulled = false; this.skids.renderOrder = 1;
    scene.add(this.skids);
    this.skidN = 0; this.last = [null, null, null, null];
    // Smoke puffs.
    const tex = puffTex();
    this.smoke = [];
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xd8d0d4, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false; scene.add(s); this.smoke.push({ s, life: 0, vx: 0, vy: 0, vz: 0 });
    }
    this.si = 0;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
  }
  reset() { this.skids.count = 0; this.skidN = 0; this.last = [null, null, null, null]; for (const p of this.smoke) { p.life = 0; p.s.visible = false; } }

  // wheels: [{x, y, z, slide}] in world space, one per wheel.
  skid(i, x, y, z, on) {
    const prev = this.last[i];
    if (!on) { this.last[i] = null; return; }
    if (prev) {
      const dx = x - prev.x, dz = z - prev.z, len = Math.hypot(dx, dz);
      if (len < 0.25) return;
      if (len < 3) {
        this.v.set((x + prev.x) / 2, y + 0.02, (z + prev.z) / 2);
        this.q.setFromAxisAngle(this.up, Math.atan2(dx, dz)); this.sc.set(0.27, 1, len + 0.05);
        this.m4.compose(this.v, this.q, this.sc);
        this.skids.setMatrixAt(this.skidN % this.maxSkid, this.m4);
        this.skidN++; this.skids.count = Math.min(this.maxSkid, this.skidN);
        this.skids.instanceMatrix.needsUpdate = true;
      }
    }
    this.last[i] = { x, z };
  }
  puff(x, y, z, strength, vx, vz) {
    const p = this.smoke[this.si++ % this.smoke.length];
    p.life = 1; p.max = 1.2 + Math.random() * 0.8; p.age = 0; p.str = Math.min(1, strength);
    p.vx = vx * 0.3 + (Math.random() - 0.5) * 1.5; p.vz = vz * 0.3 + (Math.random() - 0.5) * 1.5; p.vy = 0.6 + Math.random() * 0.6;
    p.s.position.set(x, y + 0.3, z); p.s.visible = true;
  }
  update(dt) {
    for (const p of this.smoke) {
      if (!p.s.visible) continue;
      p.age += dt; const t = p.age / p.max;
      if (t >= 1) { p.s.visible = false; continue; }
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.vx *= 0.97; p.vz *= 0.97;
      const sc = 1.2 + t * 5; p.s.scale.set(sc, sc, 1);
      p.s.material.opacity = (1 - t) * 0.42 * p.str * Math.min(1, t * 8);
    }
  }
}
