// Real people. The player's character is one of a few photo-textured human models from the Microsoft Rocketbox avatar library (MIT licence,
// see assets/CREDITS.md): a real face, real clothes, real shoes, about 7,000 triangles each. They were converted from the library's FBX files
// into the compact GLB files in assets/people (one 1024-pixel colour, normal and roughness map each for the body and the head).
//
// The models have a 3ds Max "Bip01" biped skeleton in an A-pose. The game animates a simple stick skeleton (person.js: walk, run, crouch,
// jump, fall, and now aiming and shooting) and this file copies that pose onto the real skeleton. The two skeletons have different rest
// poses, so the copy is done with world-space rotations: for each real bone, take the rotation the stick joint has been given (a turn
// about the world axes, the same for any skeleton), and apply it to the real bone's own rest orientation (after first straightening an
// A-pose arm to hang straight down like the stick figure's). The result is the same pose on a different body.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Mocap } from './mocap.js';

export const PEOPLE = {
  agent:   { name: 'Agent',   file: 'assets/people/agent.glb',   sw: [0x202022, 0x1a1a1c] },
  street:  { name: 'Street',  file: 'assets/people/street.glb',  sw: [0xb4382e, 0x2f4260] },
  denim:   { name: 'Denim',   file: 'assets/people/denim.glb',   sw: [0x4c6692, 0x4a5f86] },
  hoodie:  { name: 'Hoodie',  file: 'assets/people/hoodie.glb',  sw: [0x5b3b2b, 0x2b3350] },
  leather: { name: 'Leather', file: 'assets/people/leather.glb', sw: [0x5b3421, 0x6c6552] },
  tee:     { name: 'Tee',     file: 'assets/people/tee.glb',     sw: [0x8b8d93, 0x3b4a69] },
};
// The police officers (lighter textures, since they are seen from a distance): blue and black uniforms, a plain-clothes vest, and a SWAT officer.
export const COPS = {
  cop_blue:  { name: 'Officer', file: 'assets/people/cop_blue.glb' },
  cop_black: { name: 'Officer', file: 'assets/people/cop_black.glb' },
  cop_vest:  { name: 'Detective', file: 'assets/people/cop_vest.glb' },
  cop_swat:  { name: 'SWAT', file: 'assets/people/cop_swat.glb' },
};
// The people on the pavements (smaller 512-pixel textures: they are seen from further away than the player and the officers).
export const PEDS = {
  ped_m1: { name: 'Pedestrian', file: 'assets/people/ped_m1.glb' }, ped_m2: { name: 'Pedestrian', file: 'assets/people/ped_m2.glb' },
  ped_m3: { name: 'Pedestrian', file: 'assets/people/ped_m3.glb' }, ped_m4: { name: 'Pedestrian', file: 'assets/people/ped_m4.glb' },
  ped_f1: { name: 'Pedestrian', file: 'assets/people/ped_f1.glb' }, ped_f2: { name: 'Pedestrian', file: 'assets/people/ped_f2.glb' },
  ped_f3: { name: 'Pedestrian', file: 'assets/people/ped_f3.glb' }, ped_f4: { name: 'Pedestrian', file: 'assets/people/ped_f4.glb' },
};
export const DEFAULT_PERSON = 'agent';
export const personKey = k => (PEOPLE[k] ? k : DEFAULT_PERSON);

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0), _w = new THREE.Quaternion(), _qm = new THREE.Quaternion(), _I = new THREE.Quaternion();
const LEGS = new Set(['Bip01', 'Bip01_Pelvis', 'Bip01_L_Thigh', 'Bip01_L_Calf', 'Bip01_L_Foot', 'Bip01_L_Toe0', 'Bip01_R_Thigh', 'Bip01_R_Calf', 'Bip01_R_Foot', 'Bip01_R_Toe0']);
const templates = new Map();         // key -> Promise of the loaded scene (cloned for each person)
let aniso = 4;
export function setPeopleAnisotropy(n) { aniso = n; }

function template(key) {
  key = COPS[key] || PEDS[key] ? key : personKey(key); const def = COPS[key] || PEDS[key] || PEOPLE[key];
  if (!templates.has(key)) templates.set(key, new GLTFLoader().loadAsync(def.file).then(g => g.scene).catch(e => { templates.delete(key); throw e; }));
  return templates.get(key);
}
export const preload = key => { Mocap.load(); return template(key); };
export async function loadPerson(key) { key = COPS[key] || PEDS[key] ? key : personKey(key); const [t] = await Promise.all([template(key), Mocap.load()]); return new Person(key, cloneSkinned(t)); }

// The real bones, parents first: [bone, the child it points at (to find its rest direction), which stick joint drives it, straighten (an arm)].
const ARMS = ['L', 'R'].flatMap(s => [[`Bip01_${s}_UpperArm`, `Bip01_${s}_Forearm`], [`Bip01_${s}_Forearm`, `Bip01_${s}_Hand`], [`Bip01_${s}_Hand`, `Bip01_${s}_Finger2`]]);
const DRIVEN = [
  ['Bip01', null], ['Bip01_Pelvis', null], ['Bip01_Spine', null], ['Bip01_Spine1', null], ['Bip01_Spine2', null], ['Bip01_Neck', null], ['Bip01_Head', null],
  ['Bip01_L_Clavicle', null], ['Bip01_R_Clavicle', null],
  ...ARMS,
  ['Bip01_L_Thigh', null], ['Bip01_L_Calf', null], ['Bip01_L_Foot', null], ['Bip01_L_Toe0', null],
  ['Bip01_R_Thigh', null], ['Bip01_R_Calf', null], ['Bip01_R_Foot', null], ['Bip01_R_Toe0', null],
];
const armChild = Object.fromEntries(ARMS);

export class Person {
  constructor(key, scene) {
    this.key = key; this.root = new THREE.Group(); this.root.name = 'person';
    this.root.scale.setScalar(0.01);                       // the files are in centimetres
    this.root.add(scene); this.scene = scene;
    this.bones = {}; scene.traverse(o => { if (!o.isMesh && /^Bip01/.test(o.name)) this.bones[o.name] = o; });   // (the root, Bip01, carries no skin weights, so the loader does not call it a bone)
    this.meshes = []; this.mats = {};
    scene.traverse(o => {
      if (!o.isMesh) return; this.meshes.push(o); o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
      for (const m of [].concat(o.material)) {
        if (!m || this.mats[m.name]) continue; this.mats[m.name] = m;
        for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t) t.anisotropy = aniso;
        if (m.name === 'opacity') { m.alphaTest = 0.45; m.alphaToCoverage = true; m.side = THREE.DoubleSide; m.roughness = 0.75; m.envMapIntensity = 0.5; }
        else if (m.name === 'head') { m.envMapIntensity = 0.7; m.normalScale.set(0.9, 0.9); }
        else { m.envMapIntensity = 0.65; }
        m.metalness = 0; m.roughness = 1; m.needsUpdate = true;
      }
    });
    this.root.updateMatrixWorld(true);
    // The rest pose: each bone's orientation in the character's own frame, and (for the arms) the turn that straightens it to hang down.
    this.rest = {}; this.order = [];
    const wq = n => this.bones[n].getWorldQuaternion(new THREE.Quaternion()), wp = n => this.bones[n].getWorldPosition(new THREE.Vector3());
    for (const [name] of DRIVEN) {
      const b = this.bones[name]; if (!b) continue;
      const e = { b, name, R: wq(name), S: null, parent: DRIVEN.find(d => b.parent && d[0] === b.parent.name) ? b.parent.name : null, local0: b.quaternion.clone(), W: new THREE.Quaternion(), D: new THREE.Quaternion() };
      if (armChild[name] && this.bones[armChild[name]]) { _v.copy(wp(armChild[name])).sub(wp(name)).normalize(); e.S = new THREE.Quaternion().setFromUnitVectors(_v, DOWN); }
      this.rest[name] = e; this.order.push(e);
    }
    this.hipY0 = this.bones.Bip01.position.y; this.height = this.heightNow();
    this.ankleH = Math.max(0.04, wp('Bip01_L_Foot').y);                         // (how high the ankle bones stand above the sole, standing)
    this.fingers = {}; for (const s of ['L', 'R']) this.fingers[s] = [0, 1, 2, 3, 4].map(f => [f ? `Bip01_${s}_Finger${f}` : `Bip01_${s}_Finger0`, f ? `Bip01_${s}_Finger${f}1` : `Bip01_${s}_Finger01`, f ? `Bip01_${s}_Finger${f}2` : `Bip01_${s}_Finger02`].map(n => this.bones[n]).filter(Boolean));
    this.restFingers = new Map(); for (const s of ['L', 'R']) for (const chain of this.fingers[s]) for (const b of chain) this.restFingers.set(b, b.quaternion.clone());
    this.D = {}; for (const n of ['pelvis', 'spine', 'spine1', 'spine2', 'torso', 'neck', 'head', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR', 'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR']) this.D[n] = new THREE.Quaternion();
    this.curl = { L: 0, R: 0 }; this.indexK = { L: 1, R: 1 }; this.curlPose = { L: null, R: null };
    // The face: eyelids and eyeballs. Each is moved in the face's own directions (found once, in the rest pose), so it works whichever way the head is turned.
    this.face = {}; this.blinkIn = 1 + Math.random() * 3; this.blinkT = 9; this.gazeIn = 0.5; this.gaze = { x: 0, y: 0, tx: 0, ty: 0 }; this.faceOn = true;
    for (const n of ['Bip01_LEyeBlinkTop', 'Bip01_REyeBlinkTop', 'Bip01_LEyeBlinkBottom', 'Bip01_REyeBlinkBottom', 'Bip01_LEye', 'Bip01_REye']) {
      const b = this.bones[n]; if (!b || !b.parent) continue;
      const pq = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.face[n] = { b, p0: b.position.clone(), q0: b.quaternion.clone(), down: new THREE.Vector3(0, -1, 0).applyQuaternion(pq), yaw: new THREE.Vector3(0, 1, 0).applyQuaternion(pq), pitch: new THREE.Vector3(1, 0, 0).applyQuaternion(pq) };
    }
  }
  // Blinking (every few seconds, sometimes twice) and the eyes moving about a little. dt in seconds.
  updateFace(dt) {
    if (!this.faceOn) return;
    this.blinkIn -= dt; if (this.blinkIn <= 0) { this.blinkT = 0; this.blinkIn = 2.2 + Math.random() * 4.5; if (Math.random() < 0.18) this.blinkIn = 0.35; }
    this.blinkT += dt;
    const c = this.blinkT < 0.07 ? this.blinkT / 0.07 : this.blinkT < 0.19 ? 1 - (this.blinkT - 0.07) / 0.12 : 0;           // lids: down in 70 ms, up in 120 ms
    this.gazeIn -= dt; if (this.gazeIn <= 0) { this.gazeIn = 0.7 + Math.random() * 2.2; this.gaze.tx = (Math.random() - 0.5) * 0.28; this.gaze.ty = (Math.random() - 0.5) * 0.14; }
    const k = 1 - Math.exp(-dt * 22); this.gaze.x += (this.gaze.tx - this.gaze.x) * k; this.gaze.y += (this.gaze.ty - this.gaze.y) * k;
    for (const n in this.face) {
      const f = this.face[n];
      if (/Top$/.test(n)) f.b.position.copy(f.p0).addScaledVector(f.down, 0.85 * c);
      else if (/Bottom$/.test(n)) f.b.position.copy(f.p0).addScaledVector(f.down, -0.4 * c);
      else { _q.setFromAxisAngle(f.yaw, this.gaze.x * (1 - 0.6 * c)); _qm.setFromAxisAngle(f.pitch, this.gaze.y); f.b.quaternion.copy(_q).multiply(_qm).multiply(f.q0); }
    }
  }
  heightNow() { const box = new THREE.Box3(); box.setFromObject(this.scene, true); return box.max.y - box.min.y; }

  // Pose the real skeleton like the stick skeleton B (see person.js buildRig / animate).
  pose(B) {
    const D = this.D, lh = B.hips.quaternion, lt = B.torso.quaternion, lhd = B.head.quaternion;
    D.pelvis.copy(lh); D.torso.copy(lh).multiply(lt);
    D.spine.copy(lh).multiply(_q.identity().slerp(lt, 0.34)); D.spine1.copy(lh).multiply(_q.identity().slerp(lt, 0.67)); D.spine2.copy(D.torso);
    D.neck.copy(D.torso).multiply(_q.identity().slerp(lhd, 0.4)); D.head.copy(D.torso).multiply(lhd);
    for (const s of ['L', 'R']) {                                // (s names the real character's side; the stick figure's 'L' joints stand at -x, which is the character's right)
      const j = s === 'L' ? 'R' : 'L';
      D['sh' + s].copy(D.torso).multiply(B['shoulder' + j].quaternion); D['el' + s].copy(D['sh' + s]).multiply(B['elbow' + j].quaternion); D['wr' + s].copy(D['el' + s]).multiply(B['wrist' + j].quaternion);
      D['hip' + s].copy(lh).multiply(B['hipJ' + j].quaternion); D['kn' + s].copy(D['hip' + s]).multiply(B['knee' + j].quaternion); D['an' + s].copy(D['kn' + s]).multiply(B['ankle' + j].quaternion);
    }
    const dOf = {
      Bip01: null, Bip01_Pelvis: D.pelvis, Bip01_Spine: D.spine, Bip01_Spine1: D.spine1, Bip01_Spine2: D.spine2, Bip01_Neck: D.neck, Bip01_Head: D.head, Bip01_L_Clavicle: D.torso, Bip01_R_Clavicle: D.torso,
      Bip01_L_UpperArm: D.shL, Bip01_L_Forearm: D.elL, Bip01_L_Hand: D.wrL, Bip01_R_UpperArm: D.shR, Bip01_R_Forearm: D.elR, Bip01_R_Hand: D.wrR,
      Bip01_L_Thigh: D.hipL, Bip01_L_Calf: D.knL, Bip01_L_Foot: D.anL, Bip01_L_Toe0: D.anL, Bip01_R_Thigh: D.hipR, Bip01_R_Calf: D.knR, Bip01_R_Foot: D.anR, Bip01_R_Toe0: D.anR,
    };
    for (const e of this.order) {
      const d = dOf[e.name];
      if (d) e.W.copy(d); else e.W.identity();
      if (e.S) e.W.multiply(e.S);
      e.W.multiply(e.R);
      if (e.parent) { _q.copy(this.rest[e.parent].W).invert().multiply(e.W); e.b.quaternion.copy(_q); } else e.b.quaternion.copy(e.W);
    }
    // The hips rise and fall with the stick figure (its legs are a little longer, so scaled down).
    this.bones.Bip01.position.y = this.hipY0 + (B.hips.position.y - 0.93) * 89;
    this.gripFingers();
  }
  // The stick skeleton's rotation for a bone, as the real bone's world orientation (shared by pose and poseMocap).
  proxyWorld(e, dOf) {
    const d = dOf[e.name], W = _w; if (d) W.copy(d); else W.identity();
    if (e.S) W.multiply(e.S);
    return W.multiply(e.R);
  }
  setupD(B) {
    const D = this.D, lh = B.hips.quaternion, lt = B.torso.quaternion, lhd = B.head.quaternion;
    D.pelvis.copy(lh); D.torso.copy(lh).multiply(lt);
    D.spine.copy(lh).multiply(_q.identity().slerp(lt, 0.34)); D.spine1.copy(lh).multiply(_q.identity().slerp(lt, 0.67)); D.spine2.copy(D.torso);
    D.neck.copy(D.torso).multiply(_q.identity().slerp(lhd, 0.4)); D.head.copy(D.torso).multiply(lhd);
    for (const s of ['L', 'R']) {
      const j = s === 'L' ? 'R' : 'L';
      D['sh' + s].copy(D.torso).multiply(B['shoulder' + j].quaternion); D['el' + s].copy(D['sh' + s]).multiply(B['elbow' + j].quaternion); D['wr' + s].copy(D['el' + s]).multiply(B['wrist' + j].quaternion);
      D['hip' + s].copy(lh).multiply(B['hipJ' + j].quaternion); D['kn' + s].copy(D['hip' + s]).multiply(B['knee' + j].quaternion); D['an' + s].copy(D['kn' + s]).multiply(B['ankle' + j].quaternion);
    }
    const D2 = this.D;
    return {
      Bip01: null, Bip01_Pelvis: D2.pelvis, Bip01_Spine: D2.spine, Bip01_Spine1: D2.spine1, Bip01_Spine2: D2.spine2, Bip01_Neck: D2.neck, Bip01_Head: D2.head, Bip01_L_Clavicle: D2.torso, Bip01_R_Clavicle: D2.torso,
      Bip01_L_UpperArm: D2.shL, Bip01_L_Forearm: D2.elL, Bip01_L_Hand: D2.wrL, Bip01_R_UpperArm: D2.shR, Bip01_R_Forearm: D2.elR, Bip01_R_Hand: D2.wrR,
      Bip01_L_Thigh: D2.hipL, Bip01_L_Calf: D2.knL, Bip01_L_Foot: D2.anL, Bip01_L_Toe0: D2.anL, Bip01_R_Thigh: D2.hipR, Bip01_R_Calf: D2.knR, Bip01_R_Foot: D2.anR, Bip01_R_Toe0: D2.anR,
    };
  }
  // Pose with recorded motion (mocap.js) underneath and the stick skeleton laid over it where the game needs to be in charge:
  //   o.speed (m/s), o.phase (cycles), o.t (seconds): which recorded cycles, and where in them;
  //   o.pLegs (0..1): how much of the legs, hips and root come from the stick skeleton instead (crouching, in the air, knocked down);
  //   o.pUpper (0..1): the same for the spine, head, shoulders and arms (aiming a weapon, and so on).
  poseMocap(B, o) {
    if (!Mocap.ready) { this.pose(B); return false; }
    const nB = Mocap.bones.length;
    if (!this.mq) { this.mq = new Float32Array(nB * 4); this.mroot = new Float32Array(3); this.mbones = Mocap.bones.map(n => this.bones[n] || null); this.driven = new Set(this.order.map(e => e.name)); this.mi = {}; Mocap.bones.forEach((n, i) => { this.mi[n] = i; }); }
    Mocap.evaluate(this.mq, this.mroot, o.speed, o.phase, o.t); this.curlPose.L = this.curlPose.R = null;
    const dOf = this.setupD(B), pL = o.pLegs, pU = o.pUpper;
    for (const e of this.order) {
      const n = e.name, k = this.mi[n], qm = k !== undefined ? _qm.fromArray(this.mq, k * 4) : _qm.copy(e.local0);
      const upper = !LEGS.has(n), pw = n === 'Bip01' ? pL : upper ? pU : pL;
      const Wp = e.parent ? this.rest[e.parent].W : _I;
      if (pw > 0.001) {
        const wp = this.proxyWorld(e, dOf);
        _q.copy(Wp).invert().multiply(wp);                                  // the stick skeleton's rotation, relative to the real parent
        if (pw < 0.999) qm.slerp(_q, pw); else qm.copy(_q);
      }
      e.b.quaternion.copy(qm); e.W.copy(Wp).multiply(qm);
    }
    // The hip bone's position: the recorded bounce and sway, or the stick skeleton's height.
    const proxyY = this.hipY0 + (B.hips.position.y - 0.93) * 89, mocapY = this.mroot[1] * this.hipScale();
    this.bones.Bip01.position.set(this.mroot[0] * (1 - pL), proxyY * pL + mocapY * (1 - pL), this.mroot[2] * (1 - pL));
    // The fingers: the relaxed hand of the recording, curled round whatever is held.
    for (let i = 0; i < nB; i++) {
      const b = this.mbones[i]; if (!b || this.driven.has(Mocap.bones[i])) continue;
      b.quaternion.fromArray(this.mq, i * 4);
    }
    this.curlFingers();
    return true;
  }
  hipScale() { return this._hs || (this._hs = this.hipY0 / 89.5); }
  curlFingers() {
    for (const s of ['L', 'R']) {
      const k = this.curl[s]; if (!k) continue;
      this.fingers[s].forEach((chain, f) => chain.forEach((b, j) => { const a = (f === 0 ? [0.25, 0.5, 0.45] : [0.95, 1.25, 0.85])[j] * k * (f === 1 ? this.indexK[s] : 1); _q.setFromAxisAngle(_v.set(0, 0, 1), a); b.quaternion.multiply(_q); }));
    }
  }
  // Curl the fingers of a hand: k 0 (open) to 1 (gripping).
  grip(side, k, indexK = 1) { this.curl[side] = k; this.indexK[side] = indexK; }               // (indexK: how far the index finger curls: less on a trigger hand, so it lies along the guard)
  gripFingers() {
    for (const s of ['L', 'R']) {
      const k = this.curl[s]; if (k === this.curlPose[s]) continue; this.curlPose[s] = k;
      const sign = 1;
      this.fingers[s].forEach((chain, f) => chain.forEach((b, j) => {
        const rest = this.restFingers.get(b); if (!k) { b.quaternion.copy(rest); return; }
        const a = (f === 0 ? [0.25, 0.5, 0.45] : [0.95, 1.25, 0.85])[j] * k * sign;
        _q.setFromAxisAngle(_v.set(0, 0, 1), a); b.quaternion.copy(rest).multiply(_q);
      }));
    }
  }
  // World position of a bone (for putting a weapon in the hand).
  worldPos(name, out) { this.bones[name].getWorldPosition(out); return out; }
  setShadows(on) { for (const m of this.meshes) m.castShadow = on; }
  dispose() { for (const m of this.meshes) { m.geometry.dispose(); } for (const k in this.mats) { const m = this.mats[k]; for (const t of [m.map, m.normalMap, m.roughnessMap]) t && t.dispose(); m.dispose(); } }
}
