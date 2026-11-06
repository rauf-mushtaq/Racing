// A person: a jointed figure built from smooth parts (lathes and spheres), with a walk, run, crouch, jump, idle and fall
// animation worked out in code. The same rig serves the player's character (real meshes on the bones) and the pedestrians
// (the bones are only used to find where each part goes, and the parts are drawn as instanced meshes; see peds.js).
//
// The figure faces +z, stands on y = 0 and is about 1.78 m tall. Rotating a limb about x by a positive angle swings its
// lower end backwards, so a forward swing is a negative x rotation (the helpers below take care of that).
import * as THREE from 'three';
import { mergeGeoms } from './geom.js';
import { clamp, lerp } from './util.js';

export const SKINS = [0xf1c9a5, 0xe0ac86, 0xc68863, 0x9a6540, 0x6e452b, 0xf4d6bc];
export const HAIRS = [0x15110e, 0x2b1d14, 0x4a3020, 0x8a6a3c, 0xc9a35e, 0x6b3a22, 0x9a9a9a, 0x0e0e10];

// ---- Part shapes ---------------------------------------------------------------------------------------------------
const colorize = (g, c) => {
  const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
// Shade a part darker towards one end (cheap ambient occlusion in the vertex colours: under the arms, inside the collar...).
const shade = (g, y0, y1, k0, k1) => {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) { const t = clamp((p.getY(i) - y0) / (y1 - y0), 0, 1), k = lerp(k0, k1, t); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); }
  return g;
};
const place = (g, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return g.applyMatrix4(m);
};
const ball = (r, c, x, y, z, sx = 1, sy = 1, sz = 1, wseg = 18, hseg = 12) => place(colorize(new THREE.SphereGeometry(r, wseg, hseg), c), x, y, z, sx, sy, sz);
// A limb segment hanging down from its joint at y = 0: a lathe with a dome at each end and a taper (rTop at the joint, rBot at the far end).
function limb(rTop, rBot, L, bulge = 0, seg = 14) {
  const pts = [], cap = 4;
  for (let i = cap; i >= 0; i--) { const a = i / cap * Math.PI / 2; pts.push(new THREE.Vector2(rBot * Math.cos(a), -L - rBot * Math.sin(a) * 0.9)); }
  for (let i = 5; i >= 1; i--) { const t = i / 6; pts.push(new THREE.Vector2(lerp(rTop, rBot, t) + bulge * Math.sin(Math.PI * t), -t * L)); }
  for (let i = cap; i >= 0; i--) { const a = i / cap * Math.PI / 2; pts.push(new THREE.Vector2(rTop * Math.sin(a), rTop * Math.cos(a) * 0.85)); }
  // (the points run from the far end up to the joint, so the normals face outwards)
  return new THREE.LatheGeometry(pts, seg);
}
function lathe(profile, seg = 18) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }

// Builds the geometry of every part for an outfit. `tintable` makes the clothes white so a pedestrian's instance colour can dye
// them; the player's own colours come from the outfit.
export function bodyParts(o = {}, tintable = false) {
  const jacket = tintable ? 0xffffff : (o.jacket ?? 0x2a2d33), pants = tintable ? 0xffffff : (o.pants ?? 0x2f4366), shoes = tintable ? 0xffffff : (o.shoes ?? 0xf0f0f0), sole = o.sole ?? 0xe8e4dc;
  const skin = o.skin ?? SKINS[0], hair = tintable ? 0xffffff : (o.hair ?? HAIRS[1]), trim = tintable ? 0xcfcfcf : (o.trim ?? 0xd8d8d8);
  const P = {};
  // Torso: a lathe (rounded and tapered towards the waist), flattened front to back.
  const torso = place(colorize(lathe([[0.0, -0.02], [0.15, -0.02], [0.158, 0.03], [0.152, 0.13], [0.158, 0.22], [0.18, 0.30], [0.2, 0.38], [0.21, 0.44], [0.204, 0.48], [0.18, 0.52], [0.12, 0.548], [0.074, 0.562], [0.0, 0.566]], 22), jacket), 0, 0, 0, 1, 1, 0.64);
  shade(torso, 0, 0.5, 0.82, 1.05);
  const parts = [torso];
  // Ribbed hem and cuffs, a collar and a zip down the front.
  parts.push(place(colorize(new THREE.TorusGeometry(0.152, 0.014, 6, 24), trim), 0, 0.02, 0, 1, 1, 0.64, Math.PI / 2, 0, 0));
  parts.push(place(colorize(new THREE.TorusGeometry(0.083, 0.024, 8, 18), jacket), 0, 0.555, 0.003, 1, 1, 0.9, Math.PI / 2 - 0.2, 0, 0));
  // A strap across the chest (a small shoulder bag) when the outfit has one.
  if (o.bag) { const g = colorize(new THREE.TorusGeometry(0.205, 0.017, 6, 28), o.bag); g.rotateX(Math.PI / 2); g.scale(1, 1, 0.68); g.rotateZ(0.75); g.translate(0, 0.28, 0); parts.push(g); }
  P.torso = mergeGeoms(parts);
  // Pelvis and the tops of the legs.
  P.pelvis = mergeGeoms([place(colorize(lathe([[0.0, -0.11], [0.12, -0.11], [0.156, -0.05], [0.162, 0.03], [0.15, 0.09], [0.0, 0.1]], 20), pants), 0, 0, 0, 1, 1, 0.68),
    place(colorize(new THREE.TorusGeometry(0.152, 0.011, 6, 22), 0x1a1a1c), 0, 0.075, 0, 1, 1, 0.68, Math.PI / 2, 0, 0)]);
  P.uArm = shade(colorize(limb(0.058, 0.046, 0.29, 0.004), jacket), -0.3, 0, 0.88, 1.0);
  P.fArm = mergeGeoms([shade(colorize(limb(0.045, 0.036, 0.255, 0.002), jacket), -0.26, 0, 0.9, 1.0), place(colorize(new THREE.TorusGeometry(0.037, 0.011, 6, 14), trim), 0, -0.248, 0, 1, 1, 1, Math.PI / 2, 0, 0)]);
  P.hand = mergeGeoms([ball(0.04, skin, 0, -0.03, 0.005, 0.9, 1.25, 0.65), ball(0.016, skin, 0.005, -0.012, 0.03, 0.8, 1.6, 0.8)]);
  P.thigh = shade(colorize(limb(0.092, 0.068, 0.45, 0.004, 16), pants), -0.45, 0, 0.9, 1.0);
  P.shin = shade(colorize(limb(0.066, 0.05, 0.44, 0.003, 14), pants), -0.45, 0, 0.9, 1.0);
  // A trainer: a soft upper, a chunky sole and a toe cap.
  P.shoe = mergeGeoms([place(colorize(new THREE.SphereGeometry(0.05, 14, 10), shoes), 0, -0.035, 0.065, 1.05, 0.95, 2.35),
    place(colorize(new THREE.CylinderGeometry(0.052, 0.058, 0.044, 14), shoes), 0, -0.012, -0.0, 1, 1, 1),
    place(colorize(new THREE.SphereGeometry(0.052, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), sole), 0, -0.052, 0.07, 1.04, 0.8, 2.3),
    place(colorize(new THREE.SphereGeometry(0.03, 8, 6), 0x2a2a2c), 0, -0.032, 0.14, 1.2, 0.6, 1)]);
  // Head: one egg-shaped surface (a sphere pulled in towards the chin), with the nose, ears, eyes, brows and mouth on it.
  const hg = new THREE.SphereGeometry(1, 26, 18), hp0 = hg.attributes.position;
  for (let i = 0; i < hp0.count; i++) {
    const x = hp0.getX(i), y = hp0.getY(i), z = hp0.getZ(i), low = Math.max(0, -y), k = 1 - 0.3 * low * low - 0.06 * low;
    hp0.setXYZ(i, x * 0.093 * k, 0.118 * y + 0.135, z * 0.1 * (1 - 0.1 * low) + (y < -0.4 && z > 0 ? 0.012 * low : 0));
  }
  hg.computeVertexNormals();
  const head = [colorize(hg, skin),
    ball(0.019, skin, 0, 0.108, 0.098, 0.75, 1.15, 1.2, 8, 6), ball(0.02, skin, -0.091, 0.13, -0.006, 0.5, 1.1, 0.8, 8, 6), ball(0.02, skin, 0.091, 0.13, -0.006, 0.5, 1.1, 0.8, 8, 6),
    place(colorize(new THREE.CylinderGeometry(0.037, 0.043, 0.1, 10), skin), 0, 0.012, 0, 1, 1, 0.95)];
  if (!o.glasses) for (const s of [-1, 1]) {
    head.push(ball(0.0125, 0xf3f1ee, s * 0.036, 0.145, 0.085, 1.5, 0.8, 0.7, 8, 6)); head.push(ball(0.0075, 0x241810, s * 0.036, 0.145, 0.0935, 1, 1, 0.7, 8, 6));
    head.push(place(colorize(new THREE.BoxGeometry(0.034, 0.006, 0.009), tintable ? 0x40302a : hair), s * 0.037, 0.168, 0.088, 1, 1, 1, 0, 0, s * 0.07));
  }
  head.push(place(colorize(new THREE.BoxGeometry(0.044, 0.006, 0.008), 0x93564a), 0, 0.066, 0.094, 1, 1, 1));
  P.head = mergeGeoms(head); shade(P.head, 0.0, 0.24, 0.88, 1.0);
  // Hair: a cap over the top of the head, with a fringe and the sides; the styles differ in length and in a few tufts.
  const style = o.hairStyle ?? 'short', hp = [];
  if (style !== 'bald') {
    const sc = (g, y = 0.152, z = -0.008) => place(colorize(g, hair), 0, y, z, 0.99, 1.15, 1.1);
    hp.push(sc(new THREE.SphereGeometry(0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.38)));                                        // the top
    hp.push(sc(new THREE.SphereGeometry(0.1, 20, 10, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, Math.PI * 0.38, Math.PI * (style === 'long' ? 0.3 : 0.2))));   // the sides and back, leaving the face clear
    if (style === 'long') hp.push(place(colorize(limb(0.09, 0.055, 0.27, 0.0, 12), hair), 0, 0.12, -0.085, 1.0, 1, 0.5));
    if (style === 'tousled') for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; hp.push(place(colorize(new THREE.ConeGeometry(0.02, 0.06, 6), hair), Math.sin(a) * 0.055, 0.262, Math.cos(a) * 0.05 - 0.012, 1, 1, 1, Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55)); }
  }
  P.hair = hp.length ? mergeGeoms(hp) : null;
  if (o.glasses) P.glasses = mergeGeoms([place(colorize(new THREE.BoxGeometry(0.062, 0.034, 0.012), 0x0a0b0e), -0.037, 0.145, 0.094), place(colorize(new THREE.BoxGeometry(0.062, 0.034, 0.012), 0x0a0b0e), 0.037, 0.145, 0.094),
    place(colorize(new THREE.BoxGeometry(0.018, 0.008, 0.01), 0x0a0b0e), 0, 0.152, 0.094), place(colorize(new THREE.BoxGeometry(0.008, 0.008, 0.1), 0x0a0b0e), -0.077, 0.15, 0.045), place(colorize(new THREE.BoxGeometry(0.008, 0.008, 0.1), 0x0a0b0e), 0.077, 0.15, 0.045)]);
  return P;
}

// ---- The skeleton --------------------------------------------------------------------------------------------------
const J = { hipY: 0.93, hipX: 0.098, thigh: 0.45, shin: 0.44, shoulderX: 0.212, shoulderY: 0.465, uArm: 0.29, fArm: 0.255, neckY: 0.565 };
export const PERSON_H = 1.78;

// A set of joints (empty groups). `meshes` is given for the player: each part is added to its bone.
export function buildRig(parts, materials) {
  const root = new THREE.Group(), B = { root }; root.rotation.order = 'YXZ';         // turn to face a way first, then (when knocked down) tip over
  const add = (name, parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); B[name] = g; return g; };
  add('hips', root, 0, J.hipY, 0); add('torso', B.hips, 0, 0.02, 0); add('head', B.torso, 0, J.neckY, 0);
  for (const [n, s] of [['L', -1], ['R', 1]]) {
    add('shoulder' + n, B.torso, s * J.shoulderX, J.shoulderY, 0); add('elbow' + n, B['shoulder' + n], 0, -J.uArm, 0); add('wrist' + n, B['elbow' + n], 0, -J.fArm, 0);
    add('hipJ' + n, B.hips, s * J.hipX, -0.02, 0); add('knee' + n, B['hipJ' + n], 0, -J.thigh, 0); add('ankle' + n, B['knee' + n], 0, -J.shin, 0);
  }
  B.parts = {
    torso: [B.torso], pelvis: [B.hips], uArm: [B.shoulderL, B.shoulderR], fArm: [B.elbowL, B.elbowR], hand: [B.wristL, B.wristR],
    thigh: [B.hipJL, B.hipJR], shin: [B.kneeL, B.kneeR], shoe: [B.ankleL, B.ankleR], head: [B.head], hair: [B.head], glasses: [B.head],
  };
  B.meshes = [];
  if (parts) attachParts(B, parts, materials);
  return B;
}
// Put a mesh for each part on its bones (replacing any there already).
export function attachParts(B, parts, materials) {
  for (const m of B.meshes) m.parent.remove(m);
  B.meshes = [];
  for (const [k, bones] of Object.entries(B.parts)) {
    if (!parts[k]) continue;
    for (const b of bones) {
      const m = new THREE.Mesh(parts[k], k === 'glasses' ? materials.glass : k === 'head' || k === 'hand' ? materials.skin : materials.cloth);
      m.castShadow = true; b.add(m); B.meshes.push(m);
      if (k === 'hand' && b === B.wristL) m.scale.x = -1;       // hands are mirrored left to right
    }
  }
}

export function personMaterials() {
  return {
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.0, envMapIntensity: 0.55 }),
    skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.0, envMapIntensity: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.6 }),
  };
}

// ---- Animation -----------------------------------------------------------------------------------------------------
// a: { phase (radians, advances with distance walked), speed (m/s), run (0 walking .. 1 sprinting), crouch (0..1), air (-1 rising .. 1 falling; 0 on the ground),
//      t (seconds, for the idle motion), turn (turning rate, for the lean), down (0..1: knocked flat), look (head yaw) }
const sw = (b, s) => { b.rotation.x = -s; };                      // swing a limb forward by s
export function animate(B, a) {
  const { phase: f = 0, speed = 0, run = 0, crouch = 0, air = 0, t = 0, turn = 0, down = 0, look = 0 } = a;
  const w = clamp(speed / 1.1, 0, 1) * (1 - Math.abs(air));                     // how much of a stride there is
  const A = lerp(0.46, 0.92, run), K = lerp(0.9, 1.65, run), armA = lerp(0.5, 1.05, run), lean = w * lerp(0.04, 0.3, run) + crouch * 0.28;
  const sL = Math.sin(f) * A * w, sR = Math.sin(f + Math.PI) * A * w;
  const flex = (psi) => w * (lerp(0.16, 0.42, run) + K * Math.pow(Math.max(0, Math.cos(psi + 0.25)), 1.3));
  const breathe = Math.sin(t * 1.9) * 0.5 + 0.5, idle = 1 - w;
  // Root and hips: the body rises over each planted foot and drops between steps; crouching lowers it.
  const bob = (Math.cos(2 * f) * lerp(0.016, 0.05, run)) * w;
  B.hips.position.y = J.hipY + bob - crouch * 0.34 + Math.sin(t * 1.9) * 0.002 * idle;
  B.hips.rotation.set(lean * 0.35, Math.sin(f) * 0.12 * w * lerp(1, 1.5, run), Math.sin(f) * 0.04 * w + Math.sin(t * 0.43) * 0.015 * idle);
  B.torso.rotation.set(lean * 0.65 + 0.012 * breathe * idle + crouch * 0.1, -Math.sin(f) * 0.17 * w * lerp(1, 1.8, run) + turn * 0.18, -Math.sin(f) * 0.03 * w + turn * -0.07);
  B.torso.scale.set(1 + 0.006 * breathe * idle, 1, 1 + 0.012 * breathe * idle);
  B.head.rotation.set(-lean * 0.55 + Math.sin(t * 0.7) * 0.025 * idle, look - B.torso.rotation.y * 0.7 + Math.sin(t * 0.31) * 0.2 * idle * (1 - crouch), -B.torso.rotation.z * 0.6);
  // Legs. (Crouching folds both: the thighs forward and the knees back by about the same, so the feet stay under the hips.)
  const c = crouch;
  const kL = flex(f) + c * 1.75, kR = flex(f + Math.PI) + c * 1.75;
  sw(B.hipJL, sL + c * 0.88); sw(B.hipJR, sR + c * 0.88); B.kneeL.rotation.x = kL; B.kneeR.rotation.x = kR;
  B.hipJL.rotation.z = -0.02 - crouch * 0.07; B.hipJR.rotation.z = 0.02 + crouch * 0.07;
  B.ankleL.rotation.x = (sL + c * 0.88 - kL) * 0.9; B.ankleR.rotation.x = (sR + c * 0.88 - kR) * 0.9;     // keeps each foot roughly level with the ground
  // Arms swing against the legs; the elbows bend more the faster it goes.
  const e0 = 0.1 + lerp(0.22, 1.35, run) * w, eL = e0 + 0.35 * w * Math.max(0, -Math.sin(f)) * run, eR = e0 + 0.35 * w * Math.max(0, Math.sin(f)) * run;
  const hang = 0.05 + 0.02 * breathe * idle;
  sw(B.shoulderL, -Math.sin(f) * armA * w + Math.sin(t * 1.3) * 0.03 * idle - crouch * 0.25); sw(B.shoulderR, Math.sin(f) * armA * w - Math.sin(t * 1.3) * 0.03 * idle - crouch * 0.25);
  B.shoulderL.rotation.z = -hang - 0.04 * w; B.shoulderR.rotation.z = hang + 0.04 * w;
  B.elbowL.rotation.x = -eL; B.elbowR.rotation.x = -eR; B.elbowL.rotation.z = 0.06 * w; B.elbowR.rotation.z = -0.06 * w;
  B.wristL.rotation.x = -0.1; B.wristR.rotation.x = -0.1;
  // In the air: a stride held in the legs, the arms thrown up; falling spreads them.
  if (air) {
    const k = Math.abs(air), up = air < 0 ? 1 : 0.6;
    sw(B.hipJL, lerp(B.hipJL.rotation.x * -1, 0.62, k)); sw(B.hipJR, lerp(B.hipJR.rotation.x * -1, -0.18, k)); B.kneeL.rotation.x = lerp(B.kneeL.rotation.x, 1.0, k); B.kneeR.rotation.x = lerp(B.kneeR.rotation.x, 0.5, k);
    sw(B.shoulderL, lerp(B.shoulderL.rotation.x * -1, 1.2 * up, k)); sw(B.shoulderR, lerp(B.shoulderR.rotation.x * -1, 1.0 * up, k));
    B.shoulderL.rotation.z = lerp(B.shoulderL.rotation.z, -0.5, k); B.shoulderR.rotation.z = lerp(B.shoulderR.rotation.z, 0.5, k);
    B.elbowL.rotation.x = lerp(B.elbowL.rotation.x, -0.5, k); B.elbowR.rotation.x = lerp(B.elbowR.rotation.x, -0.5, k);
  }
  // Knocked flat: the whole body tips back about the feet (the walker lifts it a little so it lies on the ground), limbs flopping out.
  B.root.rotation.x = -down * 1.5;
  if (down) {
    B.shoulderL.rotation.z = lerp(B.shoulderL.rotation.z, -0.9, down); B.shoulderR.rotation.z = lerp(B.shoulderR.rotation.z, 0.9, down);
    B.hipJL.rotation.z = lerp(B.hipJL.rotation.z, -0.22, down); B.hipJR.rotation.z = lerp(B.hipJR.rotation.z, 0.26, down);
    B.kneeL.rotation.x = lerp(B.kneeL.rotation.x, 0.5, down); B.kneeR.rotation.x = lerp(B.kneeR.rotation.x, 0.15, down);
  }
}

// The player's character: a rig with meshes. `outfit` colours the clothes.
export const OUTFITS = {
  street: { name: 'Street', jacket: 0x46607e, pants: 0x25282f, shoes: 0xf2f2f2, trim: 0xe0662c, hair: HAIRS[1], skin: SKINS[1], hairStyle: 'tousled' },
  night: { name: 'Night', jacket: 0x101114, pants: 0x1b1c20, shoes: 0x1c1c1e, sole: 0x303034, trim: 0x9a9aa2, hair: HAIRS[7], skin: SKINS[0], hairStyle: 'short', glasses: true },
  sunset: { name: 'Sunset', jacket: 0xc4472c, pants: 0x2a2a2e, shoes: 0xf2e8d8, trim: 0xf4ead8, hair: HAIRS[3], skin: SKINS[2], hairStyle: 'long' },
  olive: { name: 'Olive', jacket: 0x59613c, pants: 0x8c7a5a, shoes: 0x3a2c22, sole: 0xc9c0b0, trim: 0x2a2f1c, hair: HAIRS[0], skin: SKINS[3], hairStyle: 'short', bag: 0x2c2a26 },
  arctic: { name: 'Arctic', jacket: 0xdfe6ee, pants: 0x3a3f4a, shoes: 0xd0d6de, trim: 0x2a8fd0, hair: HAIRS[4], skin: SKINS[5], hairStyle: 'tousled' },
};
export function makePlayerFigure(outfitKey = 'street', materials = personMaterials()) {
  const o = OUTFITS[outfitKey] || OUTFITS.street, parts = bodyParts(o, false), rig = buildRig(parts, materials);
  rig.materials = materials; rig.outfit = outfitKey;
  return rig;
}
export function setOutfit(rig, key) {
  const o = OUTFITS[key] || OUTFITS.street;
  attachParts(rig, bodyParts(o, false), rig.materials); rig.outfit = key;
}
export const JOINTS = J;
