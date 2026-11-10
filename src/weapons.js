// The player's weapons on foot: a pistol with a silencer, a compact submachine gun, a pump shotgun, a shoulder-fired rocket launcher, and
// grenades. This file builds the guns (from shaped parts: slides, barrels, magazines, wood and polymer), runs the arsenal (drawing,
// aiming, firing, recoil, reloading, ammunition) and the ballistics (bullets hit buildings, the ground, police cars and traffic; rockets
// and grenades fly and explode). How the character holds each gun is worked out in person.js (aimArms); where the gun is held and which
// way it points is handed back through walker.arms.out.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundAt } from './world.js';
import { raycastStatic } from './police.js';
import { queryColliders } from './city.js';
import { clamp, lerp, wrapAngle } from './util.js';

// ---- The guns ---------------------------------------------------------------------------------------------------------------------
// cfg: where the right palm and (relative to it) the left palm go when aimed: to the right, up, forward, in metres (see person.js aimArms).
export const WEAPONS = {
  pistol:   { name: 'SILENCED PISTOL', slot: 1, mag: 12, reserve: 96, rate: 4.2, dmg: 17, pellets: 1, spread: 0.006, kick: 0.5, reload: 1.25, range: 140, cfg: { rx: 0.03, ry: -0.04, rz: 0.46, lx: -0.035, ly: -0.015, lz: 0.0, kick: 0.06 }, hold: 0.55 },
  smg:      { name: 'SUBMACHINE GUN',  slot: 2, mag: 30, reserve: 210, rate: 13, dmg: 7.5, pellets: 1, spread: 0.024, kick: 0.22, reload: 1.9, range: 130, cfg: { rx: 0.09, ry: -0.06, rz: 0.30, lx: 0.0, ly: 0.02, lz: 0.17, kick: 0.035 }, hold: 0.6 },
  shotgun:  { name: 'PUMP SHOTGUN',    slot: 3, mag: 6, reserve: 30, rate: 1.15, dmg: 12, pellets: 9, spread: 0.055, kick: 1.0, reload: 2.4, range: 60, cfg: { rx: 0.09, ry: -0.07, rz: 0.28, lx: 0.0, ly: 0.01, lz: 0.19, kick: 0.09 }, hold: 0.6 },
  launcher: { name: 'ROCKET LAUNCHER', slot: 4, mag: 1, reserve: 5, rate: 0.7, dmg: 0, pellets: 0, spread: 0.0, kick: 1.0, reload: 2.6, range: 400, cfg: { launcher: true, rx: 0.14, ry: -0.05, rz: 0.26, lx: -0.02, ly: 0.0, lz: 0.2, kick: 0.12 }, hold: 0.7 },
  knife:    { name: 'KNIFE', slot: 5, mag: 1, reserve: 0, rate: 2.4, dmg: 26, pellets: 0, spread: 0, kick: 0, reload: 0, range: 1.5, melee: true, cfg: { one: true, rx: 0.02, ry: -0.06, rz: 0.4, lx: 0, ly: 0, lz: 0, kick: 0, lowY: 0.02, lowZ: 0.34 }, hold: 0.5 },
};
export const ORDER = ['pistol', 'smg', 'shotgun', 'launcher', 'knife'];
const GRENADES = 4;

const steel = new THREE.MeshStandardMaterial({ color: 0x35383f, roughness: 0.36, metalness: 0.92, envMapIntensity: 1.0 });
const poly = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.62, metalness: 0.1, envMapIntensity: 0.7 });
const dark = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.5, metalness: 0.55, envMapIntensity: 0.8 });
const wood = new THREE.MeshStandardMaterial({ color: 0x5c3a22, roughness: 0.5, metalness: 0.0, envMapIntensity: 0.8 });
const olive = new THREE.MeshStandardMaterial({ color: 0x4b5438, roughness: 0.55, metalness: 0.3, envMapIntensity: 0.7 });
const redM = new THREE.MeshStandardMaterial({ color: 0xb02a18, roughness: 0.5, metalness: 0.3, envMapIntensity: 0.7 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd3d9, roughness: 0.14, metalness: 1, envMapIntensity: 1.1 });

// A small kit for building guns: parts are collected per material and merged, so each gun is a few draw calls.
class Kit {
  constructor() { this.parts = new Map(); }
  add(g, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); if (!this.parts.has(mat)) this.parts.set(mat, []); this.parts.get(mat).push(g); return this; }
  box(w, h, d, mat, x, y, z, rx, ry, rz, r = 0.004) { return this.add(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)), mat, x, y, z, rx, ry, rz); }
  cyl(r0, r1, len, mat, x, y, z, seg = 14) { return this.add(new THREE.CylinderGeometry(r1, r0, len, seg).rotateX(Math.PI / 2), mat, x, y, z); }   // along z, r0 at the rear
  build(name) {
    const g = new THREE.Group(); g.name = name;
    for (const [mat, list] of this.parts) { const m = new THREE.Mesh(mergeGeometries(list.map(x => x.index ? x.toNonIndexed() : x), false), mat); m.castShadow = true; g.add(m); }
    return g;
  }
}

function makePistol(silenced = true) {
  const k = new Kit();
  k.box(0.03, 0.026, 0.15, poly, 0, 0.012, 0.045);                                  // frame
  k.box(0.031, 0.104, 0.05, poly, 0, -0.048, -0.014, 0.17);                         // grip
  k.box(0.032, 0.036, 0.175, steel, 0, 0.047, 0.062, 0, 0, 0, 0.006);               // slide
  for (let i = 0; i < 5; i++) k.box(0.034, 0.03, 0.004, dark, 0, 0.047, -0.01 + i * 0.01);   // slide serrations
  if (silenced) { k.cyl(0.0155, 0.0155, 0.17, dark, 0, 0.047, 0.235); k.cyl(0.011, 0.011, 0.03, steel, 0, 0.047, 0.155); }     // the silencer
  else k.cyl(0.009, 0.009, 0.03, dark, 0, 0.047, 0.17);
  k.box(0.004, 0.04, 0.004, poly, 0, 0.0, 0.052);                                   // trigger
  k.box(0.028, 0.004, 0.06, poly, 0, -0.012, 0.075);                                // trigger guard (bottom)
  k.box(0.028, 0.026, 0.004, poly, 0, 0.0, 0.103);                                  // trigger guard (front)
  k.box(0.032, 0.012, 0.056, steel, 0, -0.104, -0.028, 0.17);                       // magazine base plate
  k.box(0.006, 0.008, 0.01, dark, 0, 0.069, 0.0).box(0.004, 0.01, 0.006, dark, 0, 0.07, 0.14);   // sights
  const g = k.build('pistol'); g.userData.muzzle = new THREE.Vector3(0, 0.047, silenced ? 0.32 : 0.19); return g;
}
function makeSMG(silenced = true) {
  const k = new Kit();
  k.box(0.042, 0.064, 0.31, poly, 0, 0.04, 0.04, 0, 0, 0, 0.007);                    // receiver
  k.box(0.022, 0.01, 0.28, steel, 0, 0.079, 0.05);                                   // top rail
  k.cyl(0.0185, 0.0185, 0.2, steel, 0, 0.046, 0.3);                                  // barrel shroud
  for (let i = 0; i < 6; i++) k.box(0.044, 0.01, 0.012, dark, 0, 0.046, 0.23 + i * 0.03, 0, 0, 0, 0.002);
  if (silenced) { k.cyl(0.025, 0.025, 0.27, dark, 0, 0.046, 0.5); k.cyl(0.02, 0.02, 0.035, steel, 0, 0.046, 0.65); }   // silencer
  else k.cyl(0.014, 0.014, 0.07, dark, 0, 0.046, 0.43);                              // flash hider
  k.box(0.025, 0.17, 0.036, poly, 0, -0.065, 0.1, 0.1);                              // magazine
  k.box(0.036, 0.1, 0.046, poly, 0, -0.045, -0.04, 0.24);                            // pistol grip
  k.box(0.032, 0.075, 0.036, poly, 0, -0.01, 0.255, 0.12);                           // foregrip
  k.cyl(0.006, 0.006, 0.19, steel, -0.017, 0.045, -0.2, 8).cyl(0.006, 0.006, 0.19, steel, 0.017, 0.045, -0.2, 8);   // wire stock
  k.box(0.045, 0.075, 0.016, poly, 0, 0.04, -0.3);                                   // butt plate
  k.box(0.008, 0.02, 0.012, dark, 0, 0.095, -0.07).box(0.006, 0.02, 0.008, dark, 0, 0.095, 0.24);   // iron sights
  k.box(0.01, 0.012, 0.03, chrome, 0.023, 0.05, 0.0);                                // cocking handle
  const g = k.build('smg'); g.userData.muzzle = new THREE.Vector3(0, 0.046, silenced ? 0.67 : 0.47); return g;
}
function makeShotgun() {
  const k = new Kit();
  k.box(0.042, 0.078, 0.23, steel, 0, 0.035, 0.0, 0, 0, 0, 0.008);                  // receiver
  k.cyl(0.0125, 0.0125, 0.62, dark, 0, 0.064, 0.42);                                // barrel
  k.cyl(0.0115, 0.0115, 0.5, steel, 0, 0.032, 0.36);                                // magazine tube
  k.cyl(0.018, 0.018, 0.012, steel, 0, 0.032, 0.615);                               // tube cap
  k.box(0.047, 0.046, 0.18, wood, 0, 0.018, 0.27, 0, 0, 0, 0.012);                  // pump
  for (let i = 0; i < 5; i++) k.box(0.049, 0.01, 0.004, dark, 0, 0.018, 0.2 + i * 0.03);
  k.box(0.04, 0.095, 0.32, wood, 0, 0.0, -0.26, -0.1, 0, 0, 0.012);                 // stock
  k.box(0.034, 0.1, 0.052, wood, 0, -0.05, -0.06, 0.3);                             // grip
  k.box(0.044, 0.1, 0.012, dark, 0, -0.005, -0.425, -0.1);                          // butt pad
  k.box(0.006, 0.014, 0.008, chrome, 0, 0.085, 0.715).box(0.008, 0.01, 0.03, dark, 0, 0.084, 0.0);
  k.box(0.01, 0.012, 0.04, steel, 0.024, 0.05, 0.05);                               // ejection port
  const g = k.build('shotgun'); g.userData.muzzle = new THREE.Vector3(0, 0.064, 0.735); return g;
}
function makeLauncher() {
  const k = new Kit();
  k.cyl(0.055, 0.055, 1.02, olive, 0, 0.1, 0.1, 22);                                // tube
  k.add(new THREE.CylinderGeometry(0.075, 0.056, 0.14, 22, 1, true).rotateX(Math.PI / 2), dark, 0, 0.1, -0.46);   // the rear flare
  k.add(new THREE.CylinderGeometry(0.056, 0.07, 0.1, 22, 1, true).rotateX(Math.PI / 2), dark, 0, 0.1, 0.65);      // the muzzle flare
  k.cyl(0.058, 0.058, 0.03, steel, 0, 0.1, 0.0, 22).cyl(0.058, 0.058, 0.03, steel, 0, 0.1, 0.3, 22);             // bands
  k.add(new THREE.ConeGeometry(0.048, 0.2, 18).rotateX(Math.PI / 2), redM, 0, 0.1, 0.7);                         // the rocket's nose
  k.cyl(0.045, 0.045, 0.12, steel, 0, 0.1, 0.6, 16);
  k.box(0.036, 0.1, 0.05, poly, 0, -0.025, 0.0, 0.2);                               // pistol grip
  k.box(0.03, 0.05, 0.07, poly, 0, 0.035, 0.0);
  k.box(0.034, 0.08, 0.04, poly, 0, 0.04, 0.22, 0.1);                               // foregrip
  k.box(0.03, 0.04, 0.05, poly, 0, 0.065, 0.22);
  k.box(0.02, 0.05, 0.09, dark, 0.062, 0.175, 0.12).box(0.03, 0.02, 0.1, dark, 0.062, 0.2, 0.12);   // sight
  k.box(0.13, 0.13, 0.035, poly, 0, 0.1, -0.5, 0, 0, 0, 0.02);                       // shoulder pad
  const g = k.build('launcher'); g.userData.muzzle = new THREE.Vector3(0, 0.1, 0.82); return g;
}
function makeKnife() {
  const k = new Kit();
  k.box(0.026, 0.03, 0.115, poly, 0, 0, 0.0, 0, 0, 0, 0.01);                       // handle
  for (let i = 0; i < 4; i++) k.box(0.028, 0.032, 0.006, dark, 0, 0, -0.04 + i * 0.026);   // grip bands
  k.box(0.044, 0.014, 0.012, steel, 0, 0, 0.066);                                   // guard
  k.box(0.007, 0.036, 0.15, chrome, 0, 0.004, 0.147, 0, 0, 0, 0.002);                // blade
  k.add(new THREE.ConeGeometry(0.0185, 0.07, 3).rotateX(Math.PI / 2).scale(0.19, 1, 1).translate(0, 0.004, 0.255), chrome, 0, 0, 0);      // the point
  k.box(0.0068, 0.006, 0.12, steel, 0, 0.0215, 0.15);                               // the spine
  const g = k.build('knife'); g.userData.muzzle = new THREE.Vector3(0, 0.004, 0.29); return g;
}
function makeGrenade() {
  const k = new Kit();
  k.add(new THREE.SphereGeometry(0.036, 14, 10).scale(1, 1.2, 1), olive, 0, 0, 0);
  k.cyl(0.012, 0.012, 0.02, steel, 0, 0.048, 0).cyl(0.007, 0.007, 0.03, steel, 0, 0.06, 0);
  k.box(0.008, 0.07, 0.016, chrome, 0.026, 0.02, 0);
  return k.build('grenade');
}

// A gun for someone else to hold (the police officers): 'pistol' or 'smg', without the silencer.
export function makeGun(kind) { return kind === 'smg' ? makeSMG(false) : makePistol(false); }
// Put a gun in a walker's hand once its pose is final: where the arms' IK put the palm, drawn to the real hand, pointing the way the aim frame says.
export function placeGun(walker, m, W, draw = 1) {
  const o = W.out, rig = walker.rig;
  _w.copy(o.palm); rig.torso.localToWorld(_w); rig.torso.getWorldQuaternion(_q); _q.multiply(o.q);
  if (walker.person) { walker.person.worldPos('Bip01_R_Hand', _v); walker.person.worldPos('Bip01_R_Finger2', _aim); _v.lerp(_aim, 0.5); _w.lerp(_v, 0.85); }
  m.position.copy(_w); m.quaternion.copy(_q); m.scale.setScalar(lerp(0.6, 1, clamp((draw - 0.35) / 0.65, 0, 1)));
  m.updateMatrixWorld(true);
}

// ---- Bullet holes and glass cracks ---------------------------------------------------------------------------------------------
// Flat dark discs stuck to whatever a bullet hit (walls, the ground, cars), and star-shaped cracks where it hit glass higher up: two ring buffers
// of instanced quads, so the last 200 shots stay where they landed.
// (Built from arrays of pixels, not drawn on a canvas: a canvas created late can fail on an iPad, and a failed one shows as coloured noise.)
const markTex = glass => {
  const S = 64, d = new Uint8Array(S * S * 4), c = S / 2;
  const put = (x, y, r, g, b, a) => { if (x < 0 || y < 0 || x >= S || y >= S) return; const o = (y * S + x) * 4, k = a / 255, inv = 1 - k; d[o] = d[o] * inv + r * k; d[o + 1] = d[o + 1] * inv + g * k; d[o + 2] = d[o + 2] * inv + b * k; d[o + 3] = Math.max(d[o + 3], a); };
  if (!glass) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const r = Math.hypot(x - c + 0.5, y - c + 0.5); if (r < 15) { const t = r / 15; put(x, y, 8 + 22 * t, 7 + 18 * t, 6 + 16 * t, Math.round(255 * (t < 0.45 ? 0.95 : 0.75 * (1 - (t - 0.45) / 0.55)))); } }
  } else {
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * 6.283 + (i % 2) * 0.2, l = 12 + (i * 37 % 17);
      for (let t = 0; t < l; t += 0.5) put(Math.round(c + Math.cos(a) * t), Math.round(c + Math.sin(a) * t), 235, 245, 250, 230);
      for (let t = l * 0.6; t < l * 0.85; t += 0.5) { const aa = a + 0.5 * (t - l * 0.6) / (l * 0.25); put(Math.round(c + Math.cos(aa) * t), Math.round(c + Math.sin(aa) * t), 235, 245, 250, 180); }
    }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (Math.hypot(x - c + 0.5, y - c + 0.5) < 3.2) put(x, y, 20, 24, 30, 205);
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.flipY = false; t.needsUpdate = true; return t;
};
class BulletMarks {
  constructor(scene, n = 200) {
    this.n = n; this.i = 0; this.meshes = [false, true].map(glass => {
      const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: markTex(glass), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true }), n);
      m.count = 0; m.frustumCulled = false; m.renderOrder = 2; scene.add(m); m.userData = { next: 0 }; return m;
    });
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.sc = new THREE.Vector3(); this.z = new THREE.Vector3(0, 0, 1); this.nv = new THREE.Vector3();
  }
  add(x, y, z, nx, ny, nz, size = 0.14, glass = false) {
    const m = this.meshes[glass ? 1 : 0], u = m.userData, k = u.next++ % this.n; m.count = Math.min(this.n, m.count + 1);
    this.nv.set(nx, ny, nz).normalize(); this.q.setFromUnitVectors(this.z, this.nv); this.q.multiply(_roll.setFromAxisAngle(this.z, Math.random() * 6.283));
    this.v.set(x + this.nv.x * 0.012, y + this.nv.y * 0.012, z + this.nv.z * 0.012); this.sc.setScalar(size * (glass ? 3 : 1));
    this.m4.compose(this.v, this.q, this.sc); m.setMatrixAt(k, this.m4); m.instanceMatrix.needsUpdate = true;
  }
  clear() { for (const m of this.meshes) { m.count = 0; m.userData.next = 0; } }
}
const _roll = new THREE.Quaternion();
// Which way a building's wall faces at a point where a bullet hit it (the nearest face of the box it hit), turned against the way the bullet was going.
const _found = [];
function wallNormal(x, z, dx, dz, out) {
  queryColliders(x, z, 0.6, _found); let best = 0.12, nx = -dx, nz = -dz;
  for (const c of _found) {
    if (c.type !== 'box') continue;
    const faces = [[Math.abs(x - c.x0), -1, 0], [Math.abs(x - c.x1), 1, 0], [Math.abs(z - c.z0), 0, -1], [Math.abs(z - c.z1), 0, 1]];
    for (const f of faces) if (f[0] < best && x > c.x0 - 0.2 && x < c.x1 + 0.2 && z > c.z0 - 0.2 && z < c.z1 + 0.2) { best = f[0]; nx = f[1]; nz = f[2]; }
  }
  if (nx * dx + nz * dz > 0) { nx = -nx; nz = -nz; }
  return out.set(nx, 0, nz);
}

// ---- Things dropped by officers: a box of ammunition (and now and then a body-armour kit) ----------------------------------------
class Pickups {
  constructor(scene) {
    this.list = []; this.scene = scene;
    const ammo = new THREE.Group(); ammo.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.22), new THREE.MeshStandardMaterial({ color: 0x4d5a2c, roughness: 0.7 })), new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.12), new THREE.MeshStandardMaterial({ color: 0xe8c42a, roughness: 0.6, emissive: 0x6b5200, emissiveIntensity: 0.5 })));
    const armour = new THREE.Group(); armour.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.12), new THREE.MeshStandardMaterial({ color: 0x1f4f9a, roughness: 0.6, emissive: 0x0a2a60, emissiveIntensity: 0.6 })), new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.13), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x777777, emissiveIntensity: 0.5 })), new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.13), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x777777, emissiveIntensity: 0.5 })));
    this.proto = { ammo, armour };
  }
  drop(x, y, z, kind) {
    if (this.list.length >= 8) this.remove(0);
    const m = this.proto[kind].clone(true); m.position.set(x, y + 0.35, z); this.scene.add(m); this.list.push({ kind, x, z, y, m, age: 0 });
  }
  remove(i) { const p = this.list[i]; this.scene.remove(p.m); this.list.splice(i, 1); }
  clear() { while (this.list.length) this.remove(0); }
  // Walk over one to take it. take(kind) returns true if it was used (not full already).
  update(dt, walker, take) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.age += dt; p.m.rotation.y += dt * 1.6; p.m.position.y = p.y + 0.4 + Math.sin(p.age * 3) * 0.05;
      p.m.visible = p.age < 40 || Math.floor(p.age * 6) % 2 === 0;
      if (p.age > 50) { this.remove(i); continue; }
      if (walker.active && Math.hypot(walker.x - p.x, walker.z - p.z) < 1.3 && take(p.kind)) this.remove(i);
    }
  }
}

// ---- The arsenal ------------------------------------------------------------------------------------------------------------------
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _aim = new THREE.Vector3(), _mz = new THREE.Vector3(), _dir = new THREE.Vector3(), _q = new THREE.Quaternion();
const HIT = { none: 0, wall: 1, ground: 2, cop: 3, car: 4, parked: 5, officer: 6, heli: 7, actor: 8, ped: 9, brawler: 10 };
const hitOut = { t: 0, type: 0, ref: null }, officerOut = { t: 0, type: 0, ref: null };
const BOOT_COOLDOWN = 90;

export class Arsenal {
  // env: { scene, fx (the particle system), police, traffic, city, peds, audio, camera, hud (toast), crime (kind), walker }
  constructor(env) {
    this.env = env; const { scene } = env;
    this.models = { pistol: makePistol(), smg: makeSMG(), shotgun: makeShotgun(), launcher: makeLauncher(), knife: makeKnife() };
    this.holder = new THREE.Group(); this.holder.visible = false; scene.add(this.holder);
    for (const k of ORDER) { this.models[k].visible = false; this.holder.add(this.models[k]); }
    this.models.knife.scale.setScalar(1.15);
    // Rockets and grenades in flight.
    this.rocketMeshes = []; this.grenadeMeshes = [];
    for (let i = 0; i < 4; i++) { const r = new THREE.Group(); r.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 12).rotateX(Math.PI / 2), olive)); r.add(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 12).rotateX(Math.PI / 2).translate(0, 0, 0.43), redM));
      for (let f = 0; f < 4; f++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.1, 0.12), dark); const o = new THREE.Group(); o.rotation.z = f * Math.PI / 2; fin.position.set(0, 0.07, -0.3); o.add(fin); r.add(o); } r.visible = false; scene.add(r); this.rocketMeshes.push(r); }
    for (let i = 0; i < 6; i++) { const g = makeGrenade(); g.visible = false; scene.add(g); this.grenadeMeshes.push(g); }
    this.rockets = []; this.grenades = [];
    this.ammo = {}; this.restock(true);
    this.cur = -1; this.draw = 0; this.aimK = 0; this.aimHeld = false; this.aimToggle = false; this.fireT = 0; this.reloadT = 0; this.reloadTotal = 1; this.swapT = 0; this.pending = -1; this.recoil = 0; this.hitT = 0; this.shots = 0; this.lastFire = 99; this.wasFiring = false; this.last = 0;
    this.W = { draw: 0, aimK: 0, twist: 0, pitch: 0, recoil: 0, reload: 0, cfg: WEAPONS.pistol.cfg, out: { palm: new THREE.Vector3(), q: new THREE.Quaternion(), palmL: new THREE.Vector3() } };
    this.aimPoint = new THREE.Vector3(); this.aimDist = 100; this.aimKind = 0; this.nearCar = false; this.fresh = 0;
    this.marks = new BulletMarks(scene); this.pickups = new Pickups(scene); this.bootT = 0; this.nrm = new THREE.Vector3();
  }
  // The boot of the car holds one resupply, then it takes a while to find more (the rest comes from what the police drop).
  bootRestock() {
    if (this.bootT > 0) { this.env.hud.toast(`THE BOOT IS EMPTY: ${Math.ceil(this.bootT)} S UNTIL MORE`, 1.4); return false; }
    this.restock(); this.bootT = BOOT_COOLDOWN; return true;
  }
  // Taking what an officer dropped: half a load of ammunition, or armour.
  take(kind) {
    if (kind === 'armour') { const P = this.env.police; if (P.health >= 100) return false; P.health = Math.min(100, P.health + 40); this.env.hud.toast('BODY ARMOUR: +40', 1.3); this.env.audio.beep(900, 0.08, 0.2); return true; }
    let any = false; for (const k of ORDER) { const a = this.ammo[k], w = WEAPONS[k], max = w.reserve + w.mag; const add = Math.ceil(w.reserve * 0.5); if (a.reserve + a.mag < max) { a.reserve = Math.min(w.reserve, a.reserve + add); any = true; } }
    if (this.gren < GRENADES) { this.gren = Math.min(GRENADES, this.gren + 1); any = true; }
    if (any) { this.env.hud.toast('AMMUNITION PICKED UP', 1.3); this.env.audio.beep(700, 0.06, 0.2); setTimeout(() => this.env.audio.beep(1100, 0.06, 0.2), 70); }
    return any;
  }
  needsStock() { return this.gren < GRENADES || ORDER.some(k => this.ammo[k].mag < WEAPONS[k].mag || this.ammo[k].reserve < WEAPONS[k].reserve); }
  restock(silent) {
    for (const k of ORDER) this.ammo[k] = { mag: WEAPONS[k].mag, reserve: WEAPONS[k].reserve };
    this.gren = GRENADES; this.reloadT = 0; if (silent) this.bootT = 0;
    if (!silent) { this.env.hud.toast('RESTOCKED FROM THE BOOT', 1.6); this.env.audio.beep(660, 0.08, 0.2); setTimeout(() => this.env.audio.beep(990, 0.1, 0.2), 90); }
  }
  get key() { return this.cur >= 0 ? ORDER[this.cur] : null; }
  get drawn() { return this.cur >= 0 && this.draw > 0.5; }

  // --- Choosing --------------------------------------------------------------------------------------------------------------------
  // Choosing: 0..3, or -1 to put the gun away. Choosing the one already in hand puts it away.
  select(i) {
    if (i === this.cur && this.swapT <= 0) i = -1;
    if (i === this.cur && this.swapT <= 0) return;
    if (i >= 0) this.last = i;
    this.pending = i; this.swapT = 0.28;
  }
  cycle(d) { const from = this.swapT > 0 ? this.pending : this.cur; let i = from + d; if (i >= ORDER.length) i = -1; if (i < -1) i = ORDER.length - 1; this.select2(i); }
  select2(i) { if (i >= 0) this.last = i; this.pending = i; this.swapT = 0.28; }
  holster() { if (this.cur >= 0) { this.pending = -1; this.swapT = 0.2; } this.aimToggle = false; this.reloadT = 0; }
  toggleAim() { if (this.cur >= 0) this.aimToggle = !this.aimToggle; }
  reload() {
    const k = this.key; if (!k || this.reloadT > 0 || this.draw < 0.8) return; const a = this.ammo[k], w = WEAPONS[k];
    if (a.mag >= w.mag || a.reserve <= 0) { if (a.reserve <= 0 && a.mag < w.mag) this.env.hud.toast('NO AMMUNITION', 0.9); return; }
    this.reloadT = this.reloadTotal = w.reload; this.env.audio.reloadSound(w.reload, k);
  }

  // --- Seeing what is in the way ---------------------------------------------------------------------------------------------------
  // The first thing along a ray: a building, the ground, a police car, a car in the traffic, or a parked car.
  trace(ox, oy, oz, dx, dy, dz, maxD, out = hitOut, skipOfficers = false) {
    const { police, traffic, city } = this.env; let best = maxD, type = HIT.none, ref = null;
    const room = this.env.interior;                                       // inside a building: its own walls, and the people in it (see interior.js, heist.js)
    if (room) {
      const r = room.trace(ox, oy, oz, dx, dy, dz, maxD); best = r.t; type = r.type === 2 ? HIT.ground : r.type === 1 ? HIT.wall : HIT.none;
      const ha = this.env.heist && this.env.heist.rayActors(ox, oy, oz, dx, dy, dz, best); if (ha) { best = ha.t; type = HIT.actor; ref = ha.ref; }
      out.t = best; out.type = type; out.ref = ref; out.y = oy + dy * best; return out;
    }
    const hl = Math.hypot(dx, dz);
    if (hl > 1e-4) { const th = raycastStatic(ox, oz, dx / hl, dz / hl, maxD * hl), t = th / hl; if (t < best) { best = t; type = HIT.wall; } }
    // The ground: march, then refine.
    let prev = 0;
    for (let t = 1.5; t <= best + 1.2; t += t < 30 ? 1.5 : 4) {
      const tt = Math.min(t, best), y = oy + dy * tt, g = groundAt(ox + dx * tt, oz + dz * tt).y;
      if (y < g) { let a = prev, b = tt; for (let i = 0; i < 6; i++) { const m = (a + b) / 2; if (oy + dy * m < groundAt(ox + dx * m, oz + dz * m).y) b = m; else a = m; } if (b < best) { best = b; type = HIT.ground; } break; }
      prev = tt; if (tt >= best) break;
    }
    const circ = (cx, cz, cy, r, h) => {                      // a vertical cylinder: the ray's closest approach in plan, and the height there
      if (hl < 1e-4) return -1; const ex = cx - ox, ez = cz - oz, s = (ex * dx + ez * dz) / hl;      // distance along the plan projection
      if (s < 0 || s / hl > best + 3) return -1; const d2 = ex * ex + ez * ez - s * s; if (d2 > r * r) return -1;
      const th = (s - Math.sqrt(Math.max(0, r * r - d2))) / hl; if (th < 0 || th > best) return -1;
      const y = oy + dy * th; return y > cy - 0.15 && y < cy + h ? th : -1;
    };
    if (police && police.active) for (const c of police.cops) {
      if (c.wreck) continue; const ex = c.x - ox, ez = c.z - oz; if (ex * ex + ez * ez > (maxD + 8) ** 2) continue;
      const cf = [Math.sin(c.h), Math.cos(c.h)];
      for (const co of [-c.len * 0.3, 0, c.len * 0.3]) { const t = circ(c.x + cf[0] * co, c.z + cf[1] * co, c.y, c.rad + 0.1, c.kind ? 2.2 : 1.5); if (t >= 0 && t < best) { best = t; type = HIT.cop; ref = c; } }
    }
    for (const t0 of traffic.cars) {
      if (!t0.active || !t0.pts || t0.mode === 'wreck') continue; const ex = t0.x - ox, ez = t0.z - oz; if (ex * ex + ez * ez > (maxD + 8) ** 2) continue;
      const tf = [Math.sin(t0.h), Math.cos(t0.h)];
      for (const to of [-t0.len * 0.28, t0.len * 0.28]) { const t = circ(t0.x + tf[0] * to, t0.z + tf[1] * to, t0.y || groundAt(t0.x, t0.z).y, (t0.rad || 0.95) + 0.1, 1.6); if (t >= 0 && t < best) { best = t; type = HIT.car; ref = t0; } }
    }
    if (this.env.officers && !skipOfficers) for (const o of this.env.officers.list) {
      if (o.dead) continue; const w = o.walker, ex = w.x - ox, ez = w.z - oz; if (ex * ex + ez * ez > (maxD + 8) ** 2) continue;
      const t = circ(w.x, w.z, w.y, 0.42, o.crouched ? 1.3 : 1.85); if (t >= 0 && t < best) { best = t; type = HIT.officer; ref = o; }
    }
    if (this.env.brawl) for (const b of this.env.brawl.list) {                       // the people who fight back
      if (!b.alive) continue; const ex = b.x - ox, ez = b.z - oz; if (ex * ex + ez * ez > (maxD + 8) ** 2) continue;
      const t = circ(b.x, b.z, b.y, 0.45, b.crouched ? 1.3 : 1.88); if (t >= 0 && t < best) { best = t; type = HIT.brawler; ref = b; }
    }
    if (this.env.peds && !skipOfficers) for (const p of this.env.peds.list) {                  // and the people on the pavements
      if (p.state === 'away' || p.state === 'down' || p.state === 'watch') continue; const ex = p.x - ox, ez = p.z - oz; if (ex * ex + ez * ez > (maxD + 8) ** 2) continue;
      const t = circ(p.x, p.z, p.y, 0.4, 1.8); if (t >= 0 && t < best) { best = t; type = HIT.ped; ref = p; }
    }
    const hel = this.env.heli; if (hel && hel.alive && !hel.crash) { const t = circ(hel.x, hel.z, hel.y - 1.6, 3.2, 4.2); if (t >= 0 && t < best) { best = t; type = HIT.heli; ref = hel; } }
    for (const p of city.parkedList()) {
      const ex = p.x - ox, ez = p.z - oz; if (ex * ex + ez * ez > (maxD + 8) ** 2 || (p.adopted)) continue;
      const pf = [Math.sin(p.h), Math.cos(p.h)];
      for (const to of [-1.1, 1.1]) { const t = circ(p.x + pf[0] * to, p.z + pf[1] * to, groundAt(p.x, p.z).y, 1.0, 1.5); if (t >= 0 && t < best) { best = t; type = HIT.parked; ref = p; } }
    }
    out.t = best; out.type = type; out.ref = ref; out.y = oy + dy * best; return out;
  }

  // Is something in the way between a point and a target (for an officer's shot)? A building, a car (any kind) or the ground. Officers do not shoot each other.
  blockedBetween(ox, oy, oz, tx, ty, tz) {
    const dx = tx - ox, dy = ty - oy, dz = tz - oz, d = Math.hypot(dx, dy, dz); if (d < 1) return null;
    const r = this.trace(ox + dx / d * 0.4, oy + dy / d * 0.4, oz + dz / d * 0.4, dx / d, dy / d, dz / d, d - 0.9, officerOut, true);
    return r.type === HIT.none ? null : r;
  }

  // --- Every frame -------------------------------------------------------------------------------------------------------------------
  // a: { fire, aim, sprint } held; walker; camera (last frame's, for where the crosshair points)
  update(dt, a, walker, camera, active) {
    const { audio, hud, police } = this.env, W = this.W;
    // Swapping: put the gun away, then bring the new one out.
    if (this.swapT > 0) { this.swapT -= dt; if (this.swapT <= 0) { this.cur = this.pending; this.pending = -1; this.reloadT = 0; this.aimToggle = this.aimToggle && this.cur >= 0; if (this.cur >= 0) { this.swapT = 0; audio.beep(1400, 0.02, 0.12); } } }
    const drawn = this.cur >= 0 && this.swapT <= 0 && active && walker.down < 0.3;
    this.draw = lerp(this.draw, drawn ? 1 : 0, 1 - Math.exp(-dt * (drawn ? 9 : 14)));
    if (!drawn && this.draw < 0.02) this.draw = 0;
    const kk0 = this.key, isMelee = !!(kk0 && WEAPONS[kk0].melee);
    const wantAim = (a.aim || this.aimToggle) && drawn && !a.sprint && !isMelee;
    this.aimK += ((wantAim ? 1 : 0) - this.aimK) * Math.min(1, dt * 11);
    this.bootT = Math.max(0, this.bootT - dt); if (active) this.pickups.update(dt, walker, k => this.take(k));
    this.fireT -= dt; this.lastFire += dt; this.recoil = Math.max(0, this.recoil - dt * 7); this.hitT = Math.max(0, this.hitT - dt); this.fresh = Math.max(0, this.fresh - dt);
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { const k = this.key, ammo = this.ammo[k], w = WEAPONS[k], n = Math.min(w.mag - ammo.mag, ammo.reserve); ammo.mag += n; ammo.reserve -= n; } }
    // The crosshair: where does the camera's centre line meet the world?
    if (this.draw > 0.02 || this.fresh > 0) {
      const o = this.env.aimRay.pos; _dir.copy(this.env.aimRay.dir);
      this.trace(o.x, o.y, o.z, _dir.x, _dir.y, _dir.z, 150); this.aimDist = hitOut.t; this.aimKind = hitOut.type;
      this.aimPoint.set(o.x + _dir.x * hitOut.t, o.y + _dir.y * hitOut.t, o.z + _dir.z * hitOut.t);
    }
    // Which way the character faces and how the arms hold the gun.
    const chest = _v.set(walker.x, walker.y + 1.35, walker.z), dx = this.aimPoint.x - chest.x, dz = this.aimPoint.z - chest.z, dy = this.aimPoint.y - chest.y;
    const hd = Math.hypot(dx, dz);
    walker.arms = this.draw > 0.01 ? W : null;
    W.draw = this.draw; W.aimK = this.aimK; W.recoil = this.recoil; W.reload = this.reloadT > 0 ? 1 - this.reloadT / this.reloadTotal : 0;
    const k = this.key; if (k) W.cfg = WEAPONS[k].cfg;
    const yaw = hd > 0.5 ? Math.atan2(dx, dz) : walker.h;
    W.pitch = clamp(Math.atan2(dy, Math.max(hd, 2)), -0.85, 0.85); W.twist = wrapAngle(yaw - walker.h);
    walker.faceYaw = !isMelee && (this.aimK > 0.5 || this.lastFire < 1.6) && this.draw > 0.5 ? yaw : null;
    // Firing.
    // Nothing in hand: the trigger button throws a punch (the melee, melee.js). A knife in hand: it slashes and stabs.
    if (a.fire && this.cur < 0 && this.swapT <= 0 && active && walker.down < 0.3 && !a.sprint && this.env.melee) this.env.melee.attack('fist');
    const firing = !!a.fire && drawn && this.draw > 0.85 && !a.sprint;
    if (firing && isMelee) { if (this.env.melee) this.env.melee.attack('knife'); }
    else if (firing && this.key) {
      const w = WEAPONS[this.key], ammo = this.ammo[this.key];
      if (this.reloadT <= 0 && this.fireT <= 0) {
        if (ammo.mag > 0) { this.shoot(w, walker); ammo.mag--; this.fireT = 1 / w.rate; if (ammo.mag === 0) this.reload(); }
        else if (ammo.reserve > 0) this.reload();
        else if (!this.wasFiring) { audio.beep(300, 0.03, 0.12); hud.toast('NO AMMUNITION', 0.8); this.fireT = 0.3; }
      }
    }
    this.wasFiring = firing;
    this.updateProjectiles(dt, walker);
    // The weapon's model follows the hand.
    const mesh = k ? this.models[k] : null;
    for (const m of ORDER) this.models[m].visible = m === k && this.draw > 0.35;
    this.holder.visible = this.draw > 0.35;
  }
  // Called by the walker once the pose is final (see walker.pose): the gun is put in the hand.
  place(walker) {
    const k = this.key; if (!k || this.draw < 0.35) return;
    placeGun(walker, this.models[k], this.W, this.draw);
  }

  // --- Shooting ----------------------------------------------------------------------------------------------------------------------
  muzzleWorld(out) { const m = this.models[this.key]; return out.copy(m.userData.muzzle).applyMatrix4(m.matrixWorld); }
  shoot(w, walker) {
    const { fx, audio, camera } = this.env, key = this.key; const moving = Math.min(1, walker.speed / 4);
    this.muzzleWorld(_mz);
    // Toward where the crosshair points (unless that is right next to the gun).
    _aim.copy(this.aimPoint).sub(_mz); let dist = _aim.length();
    const mm = this.models[key]; _v.set(0, 0, 1).applyQuaternion(mm.quaternion);
    if (dist < 2.5 || _aim.dot(_v) < 0.3 * dist) _aim.copy(_v); else _aim.multiplyScalar(1 / dist);
    // A little help for a finger on a glass screen: nudge toward a target near the crosshair.
    this.assist(_mz, _aim, this.env.touch ? 0.09 : 0.035);
    this.recoil = Math.min(1.4, this.recoil + w.kick); this.lastFire = 0; this.fresh = 2; this.shots++;
    this.env.crime('gun');
    if (key === 'launcher') { this.launch(_mz, _aim); audio.rocketSound(); return; }
    const spread = w.spread * (1 + moving * 1.6 + (1 - this.aimK) * 0.9 + this.recoil * 0.25);
    for (let p = 0; p < w.pellets; p++) {
      _dir.copy(_aim); _dir.x += (Math.random() - 0.5) * 2 * spread; _dir.y += (Math.random() - 0.5) * 2 * spread; _dir.z += (Math.random() - 0.5) * 2 * spread; _dir.normalize();
      this.bullet(_mz, _dir, w);
    }
    fx.flash(_mz.x + _aim.x * 0.12, _mz.y + _aim.y * 0.12, _mz.z + _aim.z * 0.12, key === 'shotgun' ? 0.45 : key === 'pistol' ? 0.14 : 0.24, key === 'shotgun' ? 0.07 : 0.045, key === 'pistol' ? 2.5 : 5);
    for (let i = 0; i < (key === 'shotgun' ? 4 : 1); i++) fx.spark(_mz.x + _aim.x * 0.3, _mz.y + _aim.y * 0.3, _mz.z + _aim.z * 0.3, _aim.x * (8 + Math.random() * 16) + (Math.random() - 0.5) * 4, _aim.y * 10 + Math.random() * 2, _aim.z * (8 + Math.random() * 16) + (Math.random() - 0.5) * 4, 0.2);
    if (key === 'shotgun') fx.puff(_mz.x + _aim.x * 0.4, _mz.y, _mz.z + _aim.z * 0.4, _aim.x * 2, 0.8, _aim.z * 2, 0.25, 0.9, 0.55, 0.35, 2.5);
    audio.shot(key); this.env.peds.scare(walker.x, walker.z, key === 'pistol' ? 28 : 55, 6, true);
    if (this.env.shake) this.env.shake(key === 'shotgun' ? 0.18 : key === 'smg' ? 0.05 : 0.07);
  }
  assist(o, d, cone) {                                           // bend d toward the nearest car whose centre is within the cone (radians)
    const { police, traffic } = this.env; let best = cone, tx = 0, ty = 0, tz = 0, found = false;
    const test = (x, y, z) => { _v.set(x - o.x, y - o.y, z - o.z); const l = _v.length(); if (l < 4 || l > 90) return; _v.multiplyScalar(1 / l); const ang = Math.acos(clamp(_v.dot(d), -1, 1)); if (ang < best) { best = ang; tx = _v.x; ty = _v.y; tz = _v.z; found = true; } };
    if (police && police.active) for (const c of police.cops) if (!c.wreck) test(c.x, c.y + 0.9, c.z);
    for (const t of traffic.cars) if (t.active && t.pts && t.mode !== 'wreck') test(t.x, (t.y || 0) + 0.8, t.z);
    if (this.env.officers) for (const o of this.env.officers.list) if (!o.dead) test(o.walker.x, o.walker.y + 1.2, o.walker.z);
    if (found) { d.x = lerp(d.x, tx, 0.7); d.y = lerp(d.y, ty, 0.7); d.z = lerp(d.z, tz, 0.7); d.normalize(); }
  }
  // One bullet (or pellet): a ray, a tracer, and what it hit.
  bullet(o, d, w) {
    const { fx, police, traffic, hud } = this.env;
    const r = this.trace(o.x, o.y, o.z, d.x, d.y, d.z, w.range), t = r.t, ex = o.x + d.x * t, ey = o.y + d.y * t, ez = o.z + d.z * t;
    if (w.pellets < 2 || Math.random() < 0.3) fx.tracer(o.x + d.x * 0.5, o.y + d.y * 0.5, o.z + d.z * 0.5, ex, ey, ez, w.pellets > 1 ? 0.02 : 0.03, 0.05);
    const fall = w.pellets > 1 ? clamp(1.25 - t / 38, 0.15, 1) : 1;      // pellets lose their punch with distance
    const spark = n => { for (let s = 0; s < n; s++) fx.spark(ex, ey, ez, (Math.random() - 0.5) * 7, Math.random() * 5, (Math.random() - 0.5) * 7, 0.3); };
    if (r.type === HIT.cop) { police.damageCop(r.ref, w.dmg * fall); spark(3); this.hitT = 0.15; this.env.heat(0.015); }
    else if (r.type === HIT.car) { const c = r.ref; this.marks.add(ex, ey, ez, -d.x, -d.y, -d.z, 0.1); if (traffic.damage(c, w.dmg * fall)) { police.civilians++; this.env.heat(0.12); fx.explosion(c.x, (c.y || 0) + 0.5, c.z, 0.7); this.env.boom(c.x, c.z, 0.7); hud.toast('CAR DESTROYED', 1.1); } spark(3); this.hitT = 0.15; }
    else if (r.type === HIT.officer) {
      const o = r.ref, head = r.y - o.walker.y > (o.crouched ? 1.05 : 1.5), killed = this.env.officers.damage(o, w.dmg * fall * (head ? 2.3 : 1), head);
      spark(2); fx.puff(ex, ey, ez, 0, 0.3, 0, 0.25, 0.6, 0.35, 0.3, 1.5); this.hitT = head ? 0.3 : 0.15; this.env.heat(0.02);
      if (killed) { hud.toast(head ? 'HEADSHOT: OFFICER DOWN' : 'OFFICER DOWN', 1.3); this.env.heat(0.3); }
    }
    else if (r.type === HIT.brawler) {
      const b = r.ref, head = r.y - b.y > (b.crouched ? 1.05 : 1.55);
      b.hit(w.dmg * fall * (head ? 1.4 : 1), { gun: true, head, knock: 0, dir: { x: d.x, z: d.z } }); spark(2); fx.puff(ex, ey, ez, 0, 0.3, 0, 0.25, 0.6, 0.35, 0.3, 1.5); this.hitT = head ? 0.3 : 0.15;
      if (!b.alive) hud.toast(head ? 'HEADSHOT' : 'HE IS DOWN', 1.1);
    }
    else if (r.type === HIT.ped) {
      const p = r.ref, pe = this.env.peds, head = r.y - p.y > 1.5;
      const b = p.kind !== 'civ' ? pe.provoke(p, { gun: true, dir: { x: d.x, z: d.z } }) : null;
      if (b) b.hit(w.dmg * fall * (head ? 1.4 : 1), { gun: true, head, knock: 0, dir: { x: d.x, z: d.z } });
      else { p.state = 'down'; p.downT = 2.2; p.vx = d.x * 2.2; p.vz = d.z * 2.2; p.vy = 2.0; p.lie = 0; }
      spark(2); fx.puff(ex, ey, ez, 0, 0.3, 0, 0.25, 0.6, 0.35, 0.3, 1.5); this.hitT = 0.15; pe.scare(p.x, p.z, 24, 6);
    }
    else if (r.type === HIT.heli) { r.ref.damage(w.dmg * fall); spark(3); this.hitT = 0.15; this.env.heat(0.01); }
    else if (r.type === HIT.actor) { const a = r.ref; a.hit(w.dmg * fall * 1.6, { dir: { x: d.x, z: d.z }, head: !!a.walker && r.y - a.y > 1.5, gun: true }); spark(2); fx.puff(ex, ey, ez, 0, 0.3, 0, 0.25, 0.6, 0.35, 0.3, 1.5); this.hitT = 0.2; }
    else if (r.type === HIT.parked) { spark(2); this.env.audio.clang(3); this.marks.add(ex, ey, ez, -d.x, -d.y, -d.z, 0.1); }
    else if (r.type === HIT.wall) {
      const n = this.env.interior ? this.nrm.set(-d.x, 0, -d.z) : wallNormal(ex, ez, d.x, d.z, this.nrm), glassy = ey > 2.4 && ey < 60; spark(glassy ? 4 : 2); fx.puff(ex, ey, ez, 0, 0.4, 0, 0.35, 0.8, glassy ? 0.7 : 0.5, 0.3, 1.2);
      this.marks.add(ex, ey, ez, n.x, 0, n.z, glassy ? 0.1 : 0.14, glassy);
      if (glassy && w.pellets < 2) for (let s = 0; s < 3; s++) fx.spark(ex, ey, ez, n.x * 2 + (Math.random() - 0.5) * 3, -1 - Math.random() * 2, n.z * 2 + (Math.random() - 0.5) * 3, 0.9);       // (glass falling)
    }
    else if (r.type === HIT.ground) { spark(2); fx.puff(ex, ey, ez, 0, 0.4, 0, 0.35, 0.8, 0.5, 0.3, 1.2); this.marks.add(ex, ey, ez, 0, 1, 0, 0.12); }
  }

  // --- Rockets and grenades ------------------------------------------------------------------------------------------------------
  launch(o, d) {
    const { fx, audio } = this.env; if (this.rockets.length >= 4) return;
    this.rockets.push({ x: o.x + d.x * 0.5, y: o.y + d.y * 0.5, z: o.z + d.z * 0.5, vx: d.x * 12, vy: d.y * 12, vz: d.z * 12, dx: d.x, dy: d.y, dz: d.z, age: 0, speed: 12 });
    fx.flash(o.x, o.y, o.z, 0.9, 0.12, 6, 1, 0.7, 0.35);
    for (let i = 0; i < 10; i++) fx.puff(o.x - d.x * (0.6 + i * 0.25), o.y - d.y * (0.6 + i * 0.25), o.z - d.z * (0.6 + i * 0.25), -d.x * 6 + (Math.random() - 0.5) * 3, 0.6, -d.z * 6 + (Math.random() - 0.5) * 3, 0.5, 1.4, 0.7, 0.5, 2);    // backblast
    if (this.env.shake) this.env.shake(0.35);
  }
  throwGrenade(walker) {
    if (!this.env.active() || walker.down > 0.3) return; if (this.gren <= 0) { this.env.hud.toast('NO GRENADES', 0.8); return; }
    if (this.grenades.length >= 6) return; this.gren--;
    _dir.copy(this.env.aimRay.dir);
    const pitch = Math.asin(clamp(_dir.y, -1, 1)) + 0.28, hs = Math.cos(pitch), yaw = Math.atan2(_dir.x, _dir.z);
    const sp = 17;
    this.grenades.push({ x: walker.x + Math.sin(yaw) * 0.5, y: walker.y + 1.6, z: walker.z + Math.cos(yaw) * 0.5, vx: Math.sin(yaw) * hs * sp + walker.vx * 0.5, vy: Math.sin(pitch) * sp, vz: Math.cos(yaw) * hs * sp + walker.vz * 0.5, age: 0, spin: 0 });
    this.env.audio.beep(500, 0.04, 0.15); this.env.crime('gun'); this.fresh = 1; this.lastFire = 0.3;
    this.env.hud.toast('GRENADE OUT', 0.7);
  }
  updateProjectiles(dt, walker) {
    const { fx, police, traffic, audio } = this.env, boom = (x, y, z, power, radius, dmg) => { police.explode(x, z, y, power, radius, dmg, walker, traffic); };
    for (let i = 0; i < this.rockets.length;) {
      const r = this.rockets[i]; r.age += dt; r.speed = Math.min(88, r.speed + 95 * dt);
      const step = r.speed * dt; r.vx = r.dx * r.speed; r.vy = r.dy * r.speed; r.vz = r.dz * r.speed;
      const hit = this.trace(r.x, r.y, r.z, r.dx, r.dy, r.dz, step + 0.4);
      fx.puff(r.x - r.dx * 0.9, r.y - r.dy * 0.9, r.z - r.dz * 0.9, 0, 0.2, 0, 0.35, 1.6, 0.6, 0.45, 1.8); fx.fire(r.x - r.dx * 0.6, r.y - r.dy * 0.6, r.z - r.dz * 0.6, 0, 0, 0, 0.32, 0.16);
      if (hit.type !== HIT.none || r.age > 6) {
        const t = hit.type !== HIT.none ? hit.t : step; boom(r.x + r.dx * t, r.y + r.dy * t, r.z + r.dz * t, 1.2, 12, 185); this.env.heat(0.1);
        this.rockets[i] = this.rockets[this.rockets.length - 1]; this.rockets.pop(); continue;
      }
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt; i++;
    }
    for (let i = 0; i < this.grenades.length;) {
      const g = this.grenades[i]; g.age += dt; g.vy -= 17 * dt; const k = Math.exp(-0.15 * dt); g.vx *= k; g.vz *= k;
      const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt, gy = groundAt(nx, nz).y + 0.04;
      // Bounce off the ground and off walls/cars.
      const sp = Math.hypot(g.vx, g.vy, g.vz) || 1, hit = this.trace(g.x, g.y, g.z, g.vx / sp, g.vy / sp, g.vz / sp, sp * dt + 0.05);
      if (hit.type === HIT.wall || hit.type === HIT.cop || hit.type === HIT.car || hit.type === HIT.parked || hit.type === HIT.officer) { g.vx *= -0.35; g.vz *= -0.35; g.vy *= 0.5; } else { g.x = nx; g.z = nz; g.y = ny; }
      if (g.y < gy) { g.y = gy; if (g.vy < -2) audio.clang(2); g.vy = -g.vy * 0.38; g.vx *= 0.62; g.vz *= 0.62; }
      g.spin += dt * 9;
      if (g.age > 2.1) { boom(g.x, g.y, g.z, 1.5, 14, 240); this.env.heat(0.1); this.grenades[i] = this.grenades[this.grenades.length - 1]; this.grenades.pop(); continue; }
      i++;
    }
    for (let i = 0; i < this.rocketMeshes.length; i++) { const r = this.rockets[i], m = this.rocketMeshes[i]; m.visible = !!r; if (r) { m.position.set(r.x, r.y, r.z); m.lookAt(r.x + r.dx, r.y + r.dy, r.z + r.dz); } }
    for (let i = 0; i < this.grenadeMeshes.length; i++) { const g = this.grenades[i], m = this.grenadeMeshes[i]; m.visible = !!g; if (g) { m.position.set(g.x, g.y, g.z); m.rotation.set(g.spin, g.spin * 0.7, 0); } }
  }

  clear() { this.pickups.clear(); this.rockets.length = 0; this.grenades.length = 0; for (const m of this.rocketMeshes) m.visible = false; for (const m of this.grenadeMeshes) m.visible = false; this.holder.visible = false; this.draw = 0; }
  // What the HUD shows.
  get hud() {
    const k = this.key, a = k ? this.ammo[k] : null;
    return { key: k, name: k ? WEAPONS[k].name : null, mag: a ? a.mag : 0, reserve: a ? a.reserve : 0, reloading: this.reloadT > 0, reload: this.reloadT > 0 ? 1 - this.reloadT / this.reloadTotal : 0, melee: !!(k && WEAPONS[k].melee), drawn: this.drawn && !(k && WEAPONS[k].melee), aim: this.aimK, hit: this.hitT > 0, gren: this.gren, slots: ORDER.map((n, i) => ({ n: WEAPONS[n].name, i: i + 1, cur: i === this.cur, empty: this.ammo[n].mag + this.ammo[n].reserve === 0 })), kind: this.aimKind, spread: 1 };
  }
}
