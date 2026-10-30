// Smoke, fire, sparks, flashes and tracer streaks for explosions, gunfire and wrecks. Two draw calls in all: one THREE.Points for
// the additive things (fire, sparks, flashes) and one for alpha-blended smoke. Particles are simulated on the CPU.
import * as THREE from 'three';
import { puffTex } from './textures.js';

const MAX = 600;
function makeSystem(additive, scene) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), size = new Float32Array(MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: puffTex() }, uScale: { value: 600 } },
    vertexShader: `attribute float size; attribute vec4 color; varying vec4 vCol; uniform float uScale;
      void main(){ vCol = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(size * uScale / max(-mv.z, 0.5), 1.0, 420.0); }`,
    fragmentShader: `uniform sampler2D uMap; varying vec4 vCol;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); float a = t.a * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb * ${additive ? 'a' : '1.0'}, ${additive ? '1.0' : 'a'}); }`,
    transparent: true, depthWrite: false, depthTest: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = additive ? 4 : 3; scene.add(pts);
  return { pts, geo, mat, pos, col, size, list: [] };
}

export class Particles {
  constructor(scene) {
    this.add = makeSystem(true, scene); this.smoke = makeSystem(false, scene);
    // Tracers: a few stretched, glowing quads.
    this.tracers = [];
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(geo, mat); m.visible = false; m.frustumCulled = false; scene.add(m); this.tracers.push({ m, t: 0 }); }
    this.ti = 0; this.rng = 99; this._glows = [];
  }
  rnd() { this.rng = (this.rng * 1664525 + 1013904223) >>> 0; return this.rng / 4294967296; }
  rr(a, b) { return a + (b - a) * this.rnd(); }
  // A glow for this frame only (lamps and light bars): call every frame it should show.
  glow(x, y, z, size, r, g, b, a = 1) { this._glows.push(x, y, z, size, r, g, b, a); }
  clear() { this._glows.length = 0; this.add.list.length = 0; this.smoke.list.length = 0; for (const t of this.tracers) { t.m.visible = false; t.t = 0; } }
  get count() { return this.add.list.length + this.smoke.list.length; }
  push(sys, p) { if (sys.list.length >= MAX) sys.list.shift(); sys.list.push(p); }
  // Emitters.
  puff(x, y, z, vx, vy, vz, size, life, shade = 0.3, alpha = 0.55, grow = 2.0) {
    this.push(this.smoke, { x, y, z, vx, vy, vz, size, grow, life, age: 0, drag: 0.8, rise: 0.6, g: 0, c0: [shade * 1.05, shade, shade * 0.95, alpha], c1: [shade * 0.9, shade * 0.9, shade * 0.88, 0] });
  }
  fire(x, y, z, vx, vy, vz, size, life) { this.push(this.add, { x, y, z, vx, vy, vz, size, grow: -size / life * 0.5, life, age: 0, drag: 1.5, rise: 3, g: 0, c0: [3.2, 1.3, 0.28, 0.9], c1: [0.9, 0.18, 0.04, 0.3] }); }
  spark(x, y, z, vx, vy, vz, life = 0.6) { this.push(this.add, { x, y, z, vx, vy, vz, size: 0.07, grow: 0, life, age: 0, drag: 0.4, rise: 0, g: -14, spark: true, c0: [8, 5, 1.6, 1], c1: [3, 0.8, 0.1, 0.5] }); }
  flash(x, y, z, size, life, power = 6, r = 1, g = 0.8, b = 0.45) { this.push(this.add, { x, y, z, vx: 0, vy: 0, vz: 0, size, grow: size * 1.5 / life, life, age: 0, drag: 0, rise: 0, g: 0, c0: [r * power, g * power, b * power, 1], c1: [r, g, b, 0] }); }
  tracer(ax, ay, az, bx, by, bz, width = 0.05, life = 0.07) {
    const t = this.tracers[this.ti++ % this.tracers.length]; t.t = life; t.m.visible = true; t.m.position.set(ax, ay, az); t.m.lookAt(bx, by, bz); t.m.scale.set(width, width, Math.hypot(bx - ax, by - ay, bz - az));
  }
  muzzle(x, y, z, dx, dz) {
    this.flash(x + dx * 0.2, y, z + dz * 0.2, 0.2, 0.05, 4.5);
    for (let i = 0; i < 2; i++) this.spark(x + dx * 0.3, y, z + dz * 0.3, dx * this.rr(8, 26) + this.rr(-3, 3), this.rr(-1, 3), dz * this.rr(8, 26) + this.rr(-3, 3), 0.25);
  }
  explosion(x, y, z, power) {
    const r = this.rr.bind(this);
    this.flash(x, y + 1, z, 4.5 * power, 0.28, 4.5);
    for (let i = 0; i < 16 * power; i++) { const a = r(0, 6.283), e = r(0.1, 1), s = r(3, 14) * power; this.fire(x, y + 0.8, z, Math.cos(a) * s * (1 - e * 0.4), e * s, Math.sin(a) * s * (1 - e * 0.4), r(1.0, 2.2) * power, r(0.5, 1.0)); }
    for (let i = 0; i < 14 * power; i++) { const a = r(0, 6.283), s = r(2, 9) * power; this.puff(x, y + 1.2, z, Math.cos(a) * s, r(1, 6), Math.sin(a) * s, r(2.2, 4) * power, r(2.5, 5), 0.12, 0.75, r(1.2, 2.6)); }
    for (let i = 0; i < 30 * power; i++) { const a = r(0, 6.283), e = r(0.4, 1.4), s = r(8, 30); this.spark(x, y + 0.5, z, Math.cos(a) * s, e * s * 0.6, Math.sin(a) * s, r(0.5, 1.4)); }
  }
  burn(x, y, z, dt) {
    if (this.rnd() < dt * 22) this.fire(x + this.rr(-0.9, 0.9), y + this.rr(0.2, 0.6), z + this.rr(-1.5, 1.5), this.rr(-0.3, 0.3), this.rr(1, 2.2), this.rr(-0.3, 0.3), this.rr(0.5, 0.9), this.rr(0.5, 0.9));
    if (this.rnd() < dt * 10) this.puff(x + this.rr(-0.6, 0.6), y + 1, z + this.rr(-1, 1), this.rr(-0.4, 0.4), this.rr(1.5, 3), this.rr(-0.4, 0.4), this.rr(1, 1.6), this.rr(2.5, 4), 0.08, 0.7, 1.8);
  }
  update(dt, camera, renderer) {
    const scale = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
    for (const sys of [this.add, this.smoke]) {
      sys.mat.uniforms.uScale.value = scale; const L = sys.list; let n = 0;
      for (let i = 0; i < L.length;) {
        const p = L[i]; p.age += dt;
        if (p.age >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
        p.vy += (p.g + p.rise) * dt; const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.size += p.grow * dt;
        if (p.spark && p.y < 0.03) { p.y = 0.03; p.vy = -p.vy * 0.3; p.vx *= 0.6; p.vz *= 0.6; }
        const t = p.age / p.life; sys.pos[n * 3] = p.x; sys.pos[n * 3 + 1] = p.y; sys.pos[n * 3 + 2] = p.z; sys.size[n] = Math.max(p.size, 0.01) * 2;
        for (let c = 0; c < 4; c++) sys.col[n * 4 + c] = p.c0[c] + (p.c1[c] - p.c0[c]) * t;
        n++; i++;
      }
      if (sys === this.add) {
        const G = this._glows;
        for (let k = 0; k + 7 < G.length && n < MAX; k += 8, n++) {
          sys.pos[n * 3] = G[k]; sys.pos[n * 3 + 1] = G[k + 1]; sys.pos[n * 3 + 2] = G[k + 2]; sys.size[n] = G[k + 3] * 2;
          sys.col[n * 4] = G[k + 4]; sys.col[n * 4 + 1] = G[k + 5]; sys.col[n * 4 + 2] = G[k + 6]; sys.col[n * 4 + 3] = G[k + 7];
        }
        G.length = 0;
      }
      sys.geo.setDrawRange(0, n); for (const a of ['position', 'color', 'size']) sys.geo.attributes[a].needsUpdate = true;
    }
    for (const t of this.tracers) if (t.t > 0) { t.t -= dt; if (t.t <= 0) t.m.visible = false; }
  }
}
