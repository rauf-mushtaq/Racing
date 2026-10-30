// The sunset: sky, lighting, reflections, distant mountains, horizon clouds and
// the tall pink smoke plume rising behind the hills.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { fbm, mulberry32, lerp, clamp } from './util.js';
import { puffTex } from './textures.js';

// The sun sits low over the far end of the main boulevard (north is -z).
export const SUN_DIR = new THREE.Vector3(-0.30, 0.035, -0.95).normalize();
// Shadows use a higher sun so they stay readable on the road.
export const LIGHT_DIR = new THREE.Vector3(-0.42, 0.42, -0.80).normalize();

function setSky(sky) {
  const u = sky.material.uniforms;
  u.turbidity.value = 9;
  u.rayleigh.value = 3.4;
  u.mieCoefficient.value = 0.008;
  u.mieDirectionalG.value = 0.86;
  u.sunPosition.value.copy(SUN_DIR).multiplyScalar(1000);
}

export function buildSky(scene, renderer, quality) {
  const sky = new Sky();
  sky.scale.setScalar(4000);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  setSky(sky);
  scene.add(sky);

  // Reflections and image-based light come from the same sky, with a dark ground below.
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky2 = new Sky(); sky2.scale.setScalar(100); setSky(sky2); envScene.add(sky2);
  const gnd = new THREE.Mesh(new THREE.CircleGeometry(95, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1d1a1e }));
  gnd.position.y = -1.5; envScene.add(gnd);
  // A few warm city lights along the horizon give the paint some sparkle.
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.6, 1.8) });
  const rnd = mulberry32(4);
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, d = 60 + rnd() * 25;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4), lampMat);
    m.position.set(Math.sin(a) * d, -0.6 + rnd() * 1.2, Math.cos(a) * d); envScene.add(m);
  }
  const env = pm.fromScene(envScene, 0.015, 0.1, 400).texture;
  scene.environment = env;
  pm.dispose();

  // Fog colour matches the horizon haze.
  scene.fog = new THREE.FogExp2(0xc4919a, 0.0011);

  const hemi = new THREE.HemisphereLight(0xa597dc, 0x4a3838, 1.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffcfb4, 3.8);
  sun.castShadow = quality !== 'low';
  const ms = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(ms, ms);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);

  buildMountains(scene);
  buildClouds(scene);
  return { sky, sun, hemi };
}

// Moves the sun's shadow box with the car, snapped to whole shadow texels so
// shadow edges don't crawl as you drive.
const right = new THREE.Vector3(0, 1, 0).cross(LIGHT_DIR).normalize(), up = LIGHT_DIR.clone().cross(right);
export function placeSun(sun, p) {
  const texel = 90 / sun.shadow.mapSize.x, snap = v => Math.round(v / texel) * texel;
  sun.target.position.copy(right).multiplyScalar(snap(p.dot(right))).addScaledVector(up, snap(p.dot(up))).addScaledVector(LIGHT_DIR, p.dot(LIGHT_DIR));
  sun.position.copy(sun.target.position).addScaledVector(LIGHT_DIR, 150);
}

function ridge(radius, segs, base, height, seed, top, bottom, focus) {
  const pos = [], col = [], idx = [];
  const ct = new THREE.Color(top), cb = new THREE.Color(bottom), c = new THREE.Color();
  const rows = 6;
  for (let i = 0; i <= segs; i++) {
    const a = i / segs * Math.PI * 2;
    const x = Math.sin(a), z = Math.cos(a);
    // Taller toward the sunset (-z), lower behind.
    const toward = Math.max(0, -z * 0.8 + 0.2 + x * focus);
    const n = fbm(x * 2.2 + 10, z * 2.2 + 10, 5, seed);
    const peaks = Math.pow(clamp(n * 1.35 - 0.2, 0, 1), 1.6);
    const h = base + height * peaks * (0.35 + 0.65 * toward);
    for (let r = 0; r <= rows; r++) {
      const t = r / rows, y = lerp(-40, h, t);
      pos.push(x * radius, y, z * radius);
      c.copy(cb).lerp(ct, Math.pow(t, 0.8)); col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) for (let r = 0; r < rows; r++) {
    const a = i * (rows + 1) + r, b = a + rows + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  m.renderOrder = -5; m.frustumCulled = false;
  return m;
}

function buildMountains(scene) {
  scene.add(ridge(7000, 360, 60, 1500, 3, '#6f5d82', '#c9939a', 0.15));
  scene.add(ridge(4600, 300, 20, 700, 9, '#4d3f60', '#b58894', -0.2));
  scene.add(ridge(2600, 260, 5, 160, 17, '#3d3248', '#a77f8a', 0.0));
}

// All the clouds are one mesh: quads that face the middle of the city (they're
// kilometres away, so they look the same from anywhere in town), each with its
// own colour and opacity, drawn far to near.
function buildClouds(scene) {
  const tex = puffTex();
  const rnd = mulberry32(99);
  const quads = [];
  const mk = (p, sx, sy, c, a) => quads.push({ p, sx, sy, c, a });
  // The plume: a tall column of smoke that leans and spreads at the top.
  const base = new THREE.Vector3(-1500, 300, -6300);
  for (let i = 0; i < 70; i++) {
    const t = i / 69;
    const p = base.clone();
    p.y = 250 + t * 4300;
    p.x += Math.sin(t * 5.5) * 140 + t * t * 1400 + (rnd() - 0.5) * 200 * (0.3 + t);
    p.z += (rnd() - 0.5) * 300;
    const size = 650 + t * 1500 + rnd() * 400;
    const c = new THREE.Color().setRGB(lerp(0.74, 1.0, t), lerp(0.48, 0.66, t), lerp(0.56, 0.70, t));
    mk(p, size * (1 + rnd() * 0.4), size, c, 0.30 + 0.25 * (1 - t) + rnd() * 0.1);
  }
  // Low clouds strung along the horizon, lit pink from below.
  for (let i = 0; i < 46; i++) {
    const a = (rnd() - 0.5) * Math.PI * 1.7 + Math.PI;
    const d = 5200 + rnd() * 2000;
    const p = new THREE.Vector3(Math.sin(a) * d, 300 + rnd() * 900, Math.cos(a) * d);
    const toward = Math.max(0, -Math.cos(a));
    const c = new THREE.Color().setRGB(1.0, lerp(0.62, 0.74, toward), lerp(0.70, 0.62, toward));
    mk(p, 1500 + rnd() * 2500, 260 + rnd() * 320, c, 0.25 + rnd() * 0.3);
  }
  quads.sort((a, b) => Math.hypot(b.p.x, b.p.z) - Math.hypot(a.p.x, a.p.z));
  const pos = [], uv = [], col = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3();
  for (const q of quads) {
    right.set(q.p.x, 0, q.p.z).normalize().cross(up).multiplyScalar(q.sx / 2);
    const b = pos.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(q.p.x + right.x * (u * 2 - 1), q.p.y + (v - 0.5) * q.sy, q.p.z + right.z * (u * 2 - 1));
      uv.push(u, v); col.push(q.c.r, q.c.g, q.c.b, q.a);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  m.renderOrder = -2; m.frustumCulled = false;
  scene.add(m);
}
