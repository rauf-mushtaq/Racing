// Runs in a browser page (tools/unreal-import/run.mjs drives it): the web version's own code for its people and cars, exported as glTF for the Unreal
// version, so the two show the same people moving the same way and the same cars.
//
// People: each Rocketbox person (assets/people) is posed by the web code itself, frame by frame: people.js laying the motion capture (mocap.js) and the
// stick skeleton's moves (person.js: punches, the kick, aiming a pistol, hands up, being knocked down) onto the real skeleton. Every bone's rotation in
// each frame is written into the file as a glTF animation, so Unreal plays exactly what the web version shows. The files are turned from centimetres into
// metres (glTF's unit), with one mesh and one skin each.
// Cars: the Ferrari (ferrari.js, with the web's own paint, glass, chrome and lights) and the police cruiser (carModel.js), each as a body and a left and a
// right wheel with its hub at the origin. Plus a small box whose size says, once imported, which way Unreal turned glTF's axes.
import * as THREE from 'three';
import { GLTFExporter } from './vendor/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildRig, animate } from '../../src/person.js';
import { loadPerson } from '../../src/people.js';
import { Mocap } from '../../src/mocap.js';

const FPS = 30;
let PISTOL = { rx: 0.03, ry: -0.04, rz: 0.46, lx: -0.035, ly: -0.015, lz: 0.0, kick: 0.06 };     // (weapons.js's pistol grip, used if that file cannot be loaded here)
try { const w = await import('../../src/weapons.js'); if (w.WEAPONS && w.WEAPONS.pistol && w.WEAPONS.pistol.cfg) PISTOL = w.WEAPONS.pistol.cfg; } catch (e) { console.warn('weapons.js not loaded:', e.message); }

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = x => x * x * (3 - 2 * x), seg = (k, a, b) => clamp((k - a) / (b - a), 0, 1);
const envelope = k => ease(Math.min(seg(k, 0, 0.1), 1 - seg(k, 0.86, 1)));             // (person.js blowPose's own: in over the first tenth, out over the last)
const toB64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const exportGlb = (obj, animations = [], onlyVisible = true) => new GLTFExporter().parseAsync(obj, { binary: true, trs: true, onlyVisible, animations });

// ---------------------------------------------------------------------------------------------------- people
// The clips. Each frame gives: the stick skeleton's state (person.js animate), what poseMocap takes (speed m/s, phase in cycles, t seconds, how much of
// the legs and of the upper body the stick skeleton has), the fingers' grip (right, left, right index), and how far the body is tipped over (down).
// Unreal picks a clip by what the person is doing and sets the time in it itself (unreal/SunsetCity/Source/SunsetCity/SCPuppet.cpp).
function clipList() {
  const idle = Mocap.clips.idle, list = [];
  const still = (t) => ({ speed: 0, phase: 0, t, pLegs: 0, pUpper: 0 });
  list.push({ name: 'idle', dur: idle.dur, loop: true, frame: (k, t) => ({ a: { speed: 0, t }, mo: still(t), grip: [0, 0, 1] }) });
  for (const n of ['stroll', 'walk', 'jog', 'run', 'sprint']) {
    const c = Mocap.clips[n]; if (!c) throw new Error('no ' + n + ' cycle in the motion capture');
    list.push({ name: n, dur: c.dur, loop: true, speed: c.speed, frame: (k, t) => ({ a: { speed: c.speed, phase: k * Math.PI * 2, t, run: clamp((c.speed - 1.6) / 4.8, 0, 1) }, mo: { speed: c.speed, phase: k, t, pLegs: 0, pUpper: 0 }, grip: [0, 0, 1] }) });
  }
  // Punches: a jab with the lead (left) hand, a cross and a slow hook (the web's bruisers throw their hooks as a cross) with the right. `hit` is where in the
  // blow the fist lands: the same as the Unreal game's own blows (Core/SCBrain.h).
  const blow = (name, kind, hand, hit) => ({ name, dur: 1, hit, frame: (k, t) => {
    const e = envelope(k);
    return { a: { speed: 0, t, melee: { kind, k, hit, hand, blade: false } }, mo: { speed: 0, phase: 0, t, pLegs: kind === 'kick' ? e : 0, pUpper: e }, grip: kind === 'kick' ? [0, 0, 1] : [e, e, 1] };
  } });
  list.push(blow('jab', 'jab', 'left', 0.42), blow('cross', 'cross', 'right', 0.45), blow('hook', 'cross', 'right', 0.58), blow('kick', 'kick', null, 0.45));
  const W = { draw: 1, aimK: 1, twist: 0, pitch: 0, recoil: 0, reload: 0, radio: 0, cfg: PISTOL, out: { palm: new THREE.Vector3(), q: new THREE.Quaternion(), palmL: new THREE.Vector3() } };
  list.push({ name: 'aim', dur: idle.dur, loop: true, frame: (k, t) => ({ a: { speed: 0, t, weapon: W }, mo: { speed: 0, phase: 0, t, pLegs: 0, pUpper: 1 }, grip: [1, 1, 0.38] }) });
  list.push({ name: 'handsup', dur: idle.dur, loop: true, frame: (k, t) => ({ a: { speed: 0, t, hands: 1 }, mo: { speed: 0, phase: 0, t, pLegs: 0, pUpper: 1 }, grip: [0, 0, 1] }) });
  list.push({ name: 'down', dur: 1, frame: (k, t) => { const d = ease(k); return { a: { speed: 0, t, down: d }, mo: { speed: 0, phase: 0, t, pLegs: Math.min(1, d * 3), pUpper: Math.min(1, d * 3) }, grip: [0, 0, 1], down: d }; } });
  list.push({ name: 'stagger', dur: 0.8, frame: (k, t) => { const d = 0.3 * Math.sin(Math.PI * k); return { a: { speed: 0, t, down: d }, mo: { speed: 0, phase: 0, t, pLegs: Math.min(1, d * 3), pUpper: Math.min(1, d * 3) }, grip: [0, 0, 1], down: d }; } });
  return list;
}

// Bake the skin's shape in the rest pose into the mesh itself (the vertices become where the skin is drawn, with the files' own bind shape, a turn left
// over from their conversion, folded in), so that binding again in that pose is exact.
function bakeRestShape(person, meshes) {
  person.scene.updateMatrixWorld(true);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Matrix4(), mb = new THREE.Matrix4(), nm = new THREE.Matrix3(), si = new THREE.Vector4(), sw = new THREE.Vector4();
  for (const mesh of meshes) {
    const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal, S = mesh.skeleton;
    const out = new Float32Array(P.count * 3), outN = N ? new Float32Array(N.count * 3) : null;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); mesh.applyBoneTransform(i, v); out.set([v.x, v.y, v.z], i * 3);
      if (!N) continue;
      si.fromBufferAttribute(g.attributes.skinIndex, i); sw.fromBufferAttribute(g.attributes.skinWeight, i);
      mb.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let j = 0; j < 4; j++) {
        const w = sw.getComponent(j); if (!w) continue;
        m.multiplyMatrices(S.bones[si.getComponent(j)].matrixWorld, S.boneInverses[si.getComponent(j)]);
        for (let e = 0; e < 16; e++) mb.elements[e] += m.elements[e] * w;
      }
      m.multiplyMatrices(mesh.bindMatrixInverse, mb).multiply(mesh.bindMatrix);
      nm.getNormalMatrix(m); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); outN.set([n.x, n.y, n.z], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(out, 3)); if (outN) g.setAttribute('normal', new THREE.BufferAttribute(outN, 3));
  }
}

window.bakePerson = async function (key) {
  const p = await loadPerson(key);
  const B = buildRig(null, null, false);
  const sc = p.scene;
  p.root.updateMatrixWorld(true);
  const names = Object.keys(p.bones);
  const rest = {}; for (const n of names) rest[n] = { q: p.bones[n].quaternion.clone(), p: p.bones[n].position.clone(), s: p.bones[n].scale.clone() };
  const face = /Eye|Blink|Jaw|Mouth|Lip|Brow|Cheek|Tongue/i;
  const animated = names.filter(n => !face.test(n));
  // Where the body tips over: about the feet, in the scene's own frame (centimetres), as the web tips the stick skeleton's root.
  const hip = p.bones.Bip01, sceneInv = new THREE.Matrix4().copy(sc.matrixWorld).invert();
  const Pm = new THREE.Matrix4().multiplyMatrices(sceneInv, hip.parent.matrixWorld), PmInv = Pm.clone().invert();
  const clips = [], info = [];
  for (const c of clipList()) {
    const N = Math.max(2, Math.round(c.dur * FPS) + 1), times = new Float32Array(N), qv = {}, hipP = new Float32Array(N * 3);
    for (const n of animated) qv[n] = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1), t = k * c.dur; times[i] = t;
      const f = c.frame(k, t);
      animate(B, f.a);
      p.grip('R', f.grip[0], f.grip[2]); p.grip('L', f.grip[1]);
      if (!p.poseMocap(B, f.mo)) throw new Error('the motion capture is not loaded');
      let hp = hip.position.clone(), hq = hip.quaternion.clone();
      if (f.down) {
        const T = new THREE.Matrix4().makeRotationX(-1.5 * f.down).setPosition(0, 13 * f.down, 0);
        const L = new THREE.Matrix4().compose(hp, hq, hip.scale);
        new THREE.Matrix4().multiplyMatrices(PmInv, T).multiply(Pm).multiply(L).decompose(hp, hq, new THREE.Vector3());
      }
      for (const n of animated) { const q = n === 'Bip01' ? hq : p.bones[n].quaternion; qv[n].set([q.x, q.y, q.z, q.w], i * 4); }
      hipP.set([hp.x * 0.01, hp.y * 0.01, hp.z * 0.01], i * 3);
    }
    const tracks = animated.map(n => new THREE.QuaternionKeyframeTrack(n + '.quaternion', times, qv[n]));
    tracks.push(new THREE.VectorKeyframeTrack('Bip01.position', times, hipP));
    clips.push(new THREE.AnimationClip('SC_' + c.name, c.dur, tracks));
    info.push({ name: c.name, dur: +c.dur.toFixed(5), speed: c.speed ? +c.speed.toFixed(5) : 0, hit: c.hit || 0, loop: !!c.loop, frames: N });
  }
  // Back to the rest pose.
  for (const n of names) { const b = p.bones[n], r = rest[n]; b.quaternion.copy(r.q); b.position.copy(r.p); b.scale.copy(r.s); }
  p.grip('R', 0); p.grip('L', 0); p.gripFingers();
  for (const n of names) p.bones[n].quaternion.copy(rest[n].q);
  p.root.updateMatrixWorld(true);
  // One skinned mesh (the body, the head and the see-through parts as three materials of it), not three.
  const skinned = []; sc.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
  for (const m of skinned) m.geometry = m.geometry.clone();
  bakeRestShape(p, skinned);
  const holder = skinned[0].parent, skeleton = skinned[0].skeleton;
  const sameBones = m => m.skeleton.bones.length === skeleton.bones.length && m.skeleton.bones.every((b, i) => b === skeleton.bones[i]);   // (a cloned person has a Skeleton object per part, over the same bones)
  if (skinned.some(m => m.parent !== holder || !sameBones(m))) throw new Error('the parts do not share one skeleton');
  const attrs = Object.keys(skinned[0].geometry.attributes);
  for (const m of skinned) for (const a of Object.keys(m.geometry.attributes)) if (!attrs.includes(a)) m.geometry.deleteAttribute(a);
  for (const m of skinned) for (const a of attrs) if (!m.geometry.attributes[a]) throw new Error('a part has no ' + a);
  const merged = mergeGeometries(skinned.map(m => m.geometry), true);
  const one = new THREE.SkinnedMesh(merged, skinned.map(m => m.material)); one.name = key;
  one.position.copy(skinned[0].position); one.quaternion.copy(skinned[0].quaternion); one.scale.copy(skinned[0].scale);
  for (const m of skinned) holder.remove(m);
  holder.add(one);
  // Centimetres to metres: every position in the tree and the mesh itself; then the skin is bound again in that rest pose.
  p.root.remove(sc);
  sc.traverse(o => { if (o !== sc) o.position.multiplyScalar(0.01); });
  merged.scale(0.01, 0.01, 0.01);
  sc.updateMatrixWorld(true);

  skeleton.calculateInverses();
  one.bind(skeleton, one.matrixWorld);
  merged.computeBoundingBox();
  const box = new THREE.Box3().setFromObject(sc, true), size = box.getSize(new THREE.Vector3());
  const glb = await exportGlb(sc, clips, false);
  return { key, glb: toB64(glb), clips: info, height: +size.y.toFixed(3), width: +size.x.toFixed(3), minY: +box.min.y.toFixed(3), bones: names.length, tris: merged.index ? merged.index.count / 3 : merged.attributes.position.count / 3 };
};

// ---------------------------------------------------------------------------------------------------- cars
// A geometry coloured per vertex becomes one mesh per colour, each with that colour in its material (an importer need not read vertex colours).
function splitByColour(geo, makeMat, name) {
  const g = geo.index ? geo.toNonIndexed() : geo, C = g.attributes.color, P = g.attributes.position;
  if (!C) return [new THREE.Mesh(g, makeMat(new THREE.Color(1, 1, 1)))];
  const buckets = new Map(), q = x => Math.round(x * 64) / 64;
  for (let t = 0; t < P.count / 3; t++) {
    let r = 0, gg = 0, b = 0; for (let j = 0; j < 3; j++) { r += C.getX(t * 3 + j); gg += C.getY(t * 3 + j); b += C.getZ(t * 3 + j); }
    const key = [q(r / 3), q(gg / 3), q(b / 3)].join(','); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(t);
  }
  const out = [];
  for (const [key, tris] of buckets) {
    const ng = new THREE.BufferGeometry();
    for (const a of Object.keys(g.attributes)) {
      if (a === 'color') continue;
      const src = g.attributes[a], arr = new Float32Array(tris.length * 3 * src.itemSize);
      tris.forEach((t, i) => { for (let j = 0; j < 3; j++) for (let c = 0; c < src.itemSize; c++) arr[(i * 3 + j) * src.itemSize + c] = src.getComponent(t * 3 + j, c); });
      ng.setAttribute(a, new THREE.BufferAttribute(arr, src.itemSize));
    }
    const [r, gg, b] = key.split(',').map(Number), m = new THREE.Mesh(ng, makeMat(new THREE.Color(r, gg, b))); m.name = name + '_' + out.length; out.push(m);
  }
  return out;
}
// A mirror image across x, with each triangle's corners swapped so it still faces outwards (rather than a negative scale, which an importer may not undo).
function mirrored(group) {
  const out = new THREE.Group();
  group.traverse(o => {
    if (!o.isMesh) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    g.scale(-1, 1, 1);
    for (const a of Object.values(g.attributes)) for (let t = 0; t < a.count / 3; t++) for (let c = 0; c < a.itemSize; c++) { const i1 = (t * 3 + 1), i2 = (t * 3 + 2), v = a.getComponent(i1, c); a.setComponent(i1, c, a.getComponent(i2, c)); a.setComponent(i2, c, v); }
    const m = new THREE.Mesh(g, o.material); m.name = o.name; out.add(m);
  });
  return out;
}
const lit = (o) => c => { const m = new THREE.MeshStandardMaterial({ ...o, color: c }); if (o.map) m.map = o.map; return m; };
const glowing = c => { const k = Math.max(c.r, c.g, c.b, 1); return new THREE.MeshStandardMaterial({ color: new THREE.Color(c.r / k, c.g / k, c.b / k), emissive: new THREE.Color(c.r / k, c.g / k, c.b / k), emissiveIntensity: k * 2, roughness: 0.3 }); };

// Everything visible in a group as one mesh with a material for each part (so it imports as one asset): positions, normals and texture coordinates only.
function oneMesh(group, name) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), geos = [], mats = [];
  group.traverse(o => {
    if (!o.isMesh) return;
    for (let q = o; q && q !== group; q = q.parent) if (!q.visible) return;
    const g = o.geometry.clone();
    if (!g.index) { const n = g.attributes.position.count, idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }   // (all indexed, so shared corners stay shared)
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {}; g.clearGroups();
    geos.push(g); mats.push(Array.isArray(o.material) ? o.material[0] : o.material);
  });
  const m = new THREE.Mesh(mergeGeometries(geos, true), mats); m.name = name;
  const out = new THREE.Group(); out.add(m); return out;
}

async function wheelsOf(root, wheels) {
  const out = {};
  for (const w of wheels) {
    if (!w.front) continue;
    const g = new THREE.Group(); const c = w.steer.clone(true); c.position.set(0, 0, 0); c.quaternion.identity(); g.add(c);
    out[w.side > 0 ? 'left' : 'right'] = g;              // (the car faces +z with +y up, so +x is its left)
  }
  return out;
}

window.exportFerrari = async function (paint = 'rosso') {
  const { loadFerrari } = await import('../../src/ferrari.js');
  const { HERO_DIMS } = await import('../../src/carModel.js');
  const car = await loadFerrari(paint), U = car.userData;
  for (const s of [...U.tailGlow, ...U.headGlow, U.flame]) s.visible = false;
  const gadgets = [].concat(U.guns || [], U.shield || []);                               // (each a group, or a list of them)
  for (const o of gadgets) if (o && o.isObject3D) o.visible = false;                     // (the chase gadgets: hidden, as on the road)
  car.updateMatrixWorld(true);
  const body = new THREE.Group(); body.add(U.body.clone(true));
  const W = await wheelsOf(car, U.wheels);
  const wheelPos = U.wheels.map(w => ({ x: +w.steer.position.x.toFixed(4), y: +w.steer.position.y.toFixed(4), z: +w.steer.position.z.toFixed(4), front: w.front }));
  const bb = new THREE.Box3().setFromObject(body);
  return { body: toB64(await exportGlb(oneMesh(body, 'ferrari_body'))), wheel_left: toB64(await exportGlb(oneMesh(W.left, 'ferrari_wheel_left'))), wheel_right: toB64(await exportGlb(oneMesh(W.right, 'ferrari_wheel_right'))),
    dims: { len: +(bb.max.z - bb.min.z).toFixed(3), width: +(bb.max.x - bb.min.x).toFixed(3), height: +bb.max.y.toFixed(3), zf: HERO_DIMS.wzf, zr: HERO_DIMS.wzr, track: HERO_DIMS.track, wheelR: U.wheels[0].baseY, wheels: wheelPos } };
};

window.exportPolice = async function () {
  const { policeModels } = await import('../../src/carModel.js');
  const { carMaterials } = await import('../../src/cardetail.js');
  const model = policeModels().cruiser, N = model.near, mats = carMaterials();
  const body = new THREE.Group();
  const paint = c => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 });
  for (const m of splitByColour(N.body, paint, 'body')) body.add(m);
  body.add(new THREE.Mesh(N.glass, new THREE.MeshPhysicalMaterial({ color: 0x0b1218, metalness: 0.9, roughness: 0.03, transparent: true, opacity: 0.58, clearcoat: 1 })));
  for (const m of splitByColour(N.details, lit({ roughness: 0.5, metalness: 0.4 }), 'details')) body.add(m);
  for (const m of splitByColour(N.lamps, glowing, 'lamps')) body.add(m);
  if (N.decal) for (const m of splitByColour(N.decal, lit({ roughness: 0.35, metalness: 0.2, transparent: true, map: mats.decal.map }), 'decal')) body.add(m);
  const wheel = new THREE.Group(); for (const m of splitByColour(N.wheel, lit({ roughness: 0.55, metalness: 0.55 }), 'wheel')) wheel.add(m);
  const right = mirrored(wheel);                                                          // (a mirror image for the other side)
  const bb = new THREE.Box3().setFromObject(body);
  const front = model.wheelAt.filter(w => w[2]), rear = model.wheelAt.filter(w => !w[2]);
  return { body: toB64(await exportGlb(oneMesh(body, 'police_body'))), wheel_left: toB64(await exportGlb(oneMesh(wheel, 'police_wheel_left'))), wheel_right: toB64(await exportGlb(oneMesh(right, 'police_wheel_right'))),
    dims: { len: +(bb.max.z - bb.min.z).toFixed(3), width: +(bb.max.x - bb.min.x).toFixed(3), height: +bb.max.y.toFixed(3), zf: front[0][1], zr: rear[0][1], track: +(Math.abs(front[0][0]) * 2).toFixed(4), wheelR: model.wr, wheels: model.wheelAt.map(w => ({ x: w[0], y: model.wr, z: w[1], front: w[2] })) } };
};

// A box 1 m along x, 2 m along y and 3 m along z from the origin: imported, its bounds say where each glTF axis went (and in which direction, and at what scale).
window.exportAxes = async function () {
  const g = new THREE.BoxGeometry(1, 2, 3); g.translate(0.5, 1, 1.5);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x808080 })); m.name = 'SC_Axes';
  const s = new THREE.Group(); s.add(m);
  return toB64(await exportGlb(s));
};

window.peopleKeys = async function () {
  const { PEOPLE, COPS, PEDS } = await import('../../src/people.js');
  return { people: Object.keys(PEOPLE), cops: Object.keys(COPS), peds: Object.keys(PEDS) };
};
window.ready = true;
