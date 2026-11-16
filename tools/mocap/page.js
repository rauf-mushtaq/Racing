// Runs in a browser page (tools/mocap/build.mjs and look.mjs drive it). Turns CMU motion capture (BVH) into moves for the game's Rocketbox people.
//
// Retargeting: the CMU files start with a T-pose. For each Rocketbox bone driven by a CMU joint, its orientation in that same T-pose is found once (its
// rest orientation, turned so the bone points the way the CMU bone points in the T-pose: an A-pose arm is raised to the side). In every frame the CMU joint's
// turn away from its T-pose (in world space) is applied to that: the same movement, on a body of other proportions. The hips' path is scaled by the ratio
// of the two hip heights. Each move is turned to start facing +z, and can be mirrored (left and right swapped) to make the other-handed version.
import * as THREE from 'three';
import { loadPerson } from '../../src/people.js';
import { parseBVH, pose } from './bvh.js';

const FPS = 30;
// Rocketbox bone <- CMU joint (the joint whose rotation turns the same piece of the body).
const MAP = {
  Bip01: 'Hips', Bip01_Spine: 'LowerBack', Bip01_Spine1: 'Spine', Bip01_Spine2: 'Spine1', Bip01_Neck: 'Neck', Bip01_Head: 'Head',
  Bip01_L_Clavicle: 'LeftShoulder', Bip01_L_UpperArm: 'LeftArm', Bip01_L_Forearm: 'LeftForeArm', Bip01_L_Hand: 'LeftHand',
  Bip01_R_Clavicle: 'RightShoulder', Bip01_R_UpperArm: 'RightArm', Bip01_R_Forearm: 'RightForeArm', Bip01_R_Hand: 'RightHand',
  Bip01_L_Thigh: 'LeftUpLeg', Bip01_L_Calf: 'LeftLeg', Bip01_L_Foot: 'LeftFoot', Bip01_L_Toe0: 'LeftToeBase',
  Bip01_R_Thigh: 'RightUpLeg', Bip01_R_Calf: 'RightLeg', Bip01_R_Foot: 'RightFoot', Bip01_R_Toe0: 'RightToeBase',
};
// The bones the moves carry, parents first (the fingers and the face stay as the game sets them).
export const BONES = ['Bip01', 'Bip01_Pelvis', 'Bip01_Spine', 'Bip01_Spine1', 'Bip01_Spine2', 'Bip01_Neck', 'Bip01_Head',
  'Bip01_L_Clavicle', 'Bip01_L_UpperArm', 'Bip01_L_Forearm', 'Bip01_L_Hand', 'Bip01_R_Clavicle', 'Bip01_R_UpperArm', 'Bip01_R_Forearm', 'Bip01_R_Hand',
  'Bip01_L_Thigh', 'Bip01_L_Calf', 'Bip01_L_Foot', 'Bip01_L_Toe0', 'Bip01_R_Thigh', 'Bip01_R_Calf', 'Bip01_R_Foot', 'Bip01_R_Toe0'];
// Which way each bone points (to the next bone), on both skeletons, for lining up the rest pose with the T-pose.
const AIM = {
  Bip01_Spine: ['Bip01_Spine1', 'LowerBack', 'Spine'], Bip01_Spine1: ['Bip01_Spine2', 'Spine', 'Spine1'], Bip01_Spine2: ['Bip01_Neck', 'Spine1', 'Neck'], Bip01_Neck: ['Bip01_Head', 'Neck', 'Head'],
  Bip01_L_Clavicle: ['Bip01_L_UpperArm', 'LeftShoulder', 'LeftArm'], Bip01_L_UpperArm: ['Bip01_L_Forearm', 'LeftArm', 'LeftForeArm'], Bip01_L_Forearm: ['Bip01_L_Hand', 'LeftForeArm', 'LeftHand'], Bip01_L_Hand: ['Bip01_L_Finger2', 'LeftHand', 'LeftHandIndex1'],
  Bip01_R_Clavicle: ['Bip01_R_UpperArm', 'RightShoulder', 'RightArm'], Bip01_R_UpperArm: ['Bip01_R_Forearm', 'RightArm', 'RightForeArm'], Bip01_R_Forearm: ['Bip01_R_Hand', 'RightForeArm', 'RightHand'], Bip01_R_Hand: ['Bip01_R_Finger2', 'RightHand', 'RightHandIndex1'],
  Bip01_L_Thigh: ['Bip01_L_Calf', 'LeftUpLeg', 'LeftLeg'], Bip01_L_Calf: ['Bip01_L_Foot', 'LeftLeg', 'LeftFoot'], Bip01_L_Foot: ['Bip01_L_Toe0', 'LeftFoot', 'LeftToeBase'],
  Bip01_R_Thigh: ['Bip01_R_Calf', 'RightUpLeg', 'RightLeg'], Bip01_R_Calf: ['Bip01_R_Foot', 'RightLeg', 'RightFoot'], Bip01_R_Foot: ['Bip01_R_Toe0', 'RightFoot', 'RightToeBase'],
};
const SWAP = n => n.replace(/^Left/, '#').replace(/^Right/, 'Left').replace(/^#/, 'Right').replace(/^L(Thumb|HipJoint)/, '#$1').replace(/^R(Thumb|HipJoint)/, 'L$1').replace(/^#/, 'R');

let person, rig;                      // the Rocketbox person everything is fitted to (agent: the player's default)
const T = {};                         // each driven bone's world orientation in the T-pose
let parentQ, parentInv, hipH, ankleH;
const files = {};                     // name -> parsed BVH

async function setup() {
  person = await loadPerson('agent');
  rig = new THREE.Group(); rig.add(person.root); person.root.updateMatrixWorld(true);
  const B = person.bones, wq = n => B[n].getWorldQuaternion(new THREE.Quaternion()), wp = n => B[n].getWorldPosition(new THREE.Vector3());
  ankleH = Math.min(wp('Bip01_L_Foot').y, wp('Bip01_R_Foot').y); hipH = wp('Bip01').y;
  parentQ = B.Bip01.parent.getWorldQuaternion(new THREE.Quaternion()); parentInv = B.Bip01.parent.matrixWorld.clone().invert();
  for (const n of BONES) T[n] = wq(n);
  window.restInfo = { hipH, ankleH, height: person.height, parentQ: parentQ.toArray().map(v => +v.toFixed(4)), hipLocal: B.Bip01.position.toArray().map(v => +v.toFixed(2)) };
}

// Fit a CMU file: its T-pose (frame 0) gives each CMU joint's T orientation and bone directions; the Rocketbox T orientations are the rest ones turned to match.
function load(name, text) {
  const b = parseBVH(text), I = b.index, Q = [], P = [];
  pose(b, 0, Q, P);
  b.Q0 = Q.map(q => q.clone()); b.P0 = P.map(p => p.clone());
  const footY = Math.min(P[I.LeftFoot].y, P[I.RightFoot].y);
  b.scale = (hipH - ankleH) / (P[I.Hips].y - footY);                                // CMU units -> metres
  // The floor: where the ankles are lowest in the whole take, less the height of an ankle above the sole. (Not from the T-pose: a take that starts lying
  // down has its T-pose put at the height its hips start at, under the floor.)
  { let lo = Infinity; const Q2 = [], P2 = [], step = Math.max(1, Math.floor(b.frames.length / 400)); for (let f = 1; f < b.frames.length; f += step) { pose(b, f, Q2, P2); lo = Math.min(lo, P2[I.LeftFoot].y, P2[I.RightFoot].y); } b.floor = lo - ankleH / b.scale; }
  // The Rocketbox T-pose for this file.
  const B = person.bones, wp = n => B[n].getWorldPosition(new THREE.Vector3());
  b.T = {};
  for (const n of BONES) {
    const a = AIM[n]; b.T[n] = T[n].clone();
    if (!a || !B[a[0]] || I[a[1]] === undefined || I[a[2]] === undefined) continue;
    const dr = wp(a[0]).sub(wp(n)).normalize(), dc = P[I[a[2]]].clone().sub(P[I[a[1]]]).normalize();
    b.T[n].premultiply(new THREE.Quaternion().setFromUnitVectors(dr, dc));
  }
  // (a bone with no aim of its own (the toes, the pelvis) keeps its rest turn relative to its parent's new one)
  for (const [n, p] of [['Bip01_L_Toe0', 'Bip01_L_Foot'], ['Bip01_R_Toe0', 'Bip01_R_Foot'], ['Bip01_Head', 'Bip01_Neck']]) {
    const rel = T[p].clone().invert().multiply(T[n]); b.T[n] = b.T[p].clone().multiply(rel);
  }
  b.Q0inv = b.Q0.map(q => q.clone().invert());
  files[name] = b;
  // The neck and head: the CMU T-pose does not hold them the way a person does (lined up by it, everyone looks up at the sky). So they are set from the
  // frames where the person stands upright instead: there, on the whole, the neck carries on from the chest and the head looks straight ahead.
  // (measured on the Rocketbox skeleton: each bone's turn away from its own rest orientation, the head's relative to the neck's, the neck's to the chest's)
  const W = {}, h = new THREE.Vector3(), E = n => W[n].clone().multiply(T[n].clone().invert());
  const rel = (a, c) => { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(E(a).invert().multiply(E(c))); return Math.asin(Math.max(-1, Math.min(1, f.y))); };
  const step = Math.max(1, Math.floor(b.frames.length / 300)), standing = [];
  for (let f = 1; f < b.frames.length; f += step) { frameWorld(b, f, false, W, h); const up = new THREE.Vector3(0, 1, 0).applyQuaternion(E('Bip01_Spine2')); if (h.y > hipH * 0.88 && up.y > 0.85) standing.push(f); }
  if (standing.length >= 5) for (const [a, c] of [['Bip01_Spine2', 'Bip01_Neck'], ['Bip01_Neck', 'Bip01_Head']]) for (let it = 0; it < 3; it++) {
    const xs = standing.map(f => { frameWorld(b, f, false, W, h); return rel(a, c); }).sort((p, q) => p - q), med = xs[xs.length >> 1];
    const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), med);
    b.T[c].premultiply(fix); if (c === 'Bip01_Neck') b.T.Bip01_Head.premultiply(fix);
    if (it === 0) b.calib = (b.calib || []).concat([`${c} ${med.toFixed(2)} (${xs.length} frames)`]);
  }
  return { frames: b.frames.length, fps: 1 / b.frameTime, seconds: b.frames.length * b.frameTime, calib: b.calib };
}

const _Q = [], _P = [], _m = new THREE.Quaternion(), _w = new THREE.Quaternion(), _v = new THREE.Vector3(), _yaw = new THREE.Quaternion();
// One frame of a file, as Rocketbox bone world orientations (W) and the hips' world position (metres), before facing and placing.
function frameWorld(b, f, mirror, W, hips) {
  pose(b, f, _Q, _P); const I = b.index;
  for (const n of BONES) {
    if (n === 'Bip01_Pelvis') continue;
    const c = MAP[n]; if (!c) continue;
    const src = mirror ? SWAP(c) : c, k = I[src];
    _m.copy(_Q[k]).multiply(b.Q0inv[k]);                                           // the joint's turn away from the T-pose
    if (mirror) { _m.y = -_m.y; _m.z = -_m.z; }                                    // (reflected through the body's middle: x -> -x)
    W[n] = (W[n] || new THREE.Quaternion()).copy(_m).multiply(b.T[n]);
  }
  const h = _P[I.Hips];
  hips.set((mirror ? -1 : 1) * (h.x - b.P0[I.Hips].x) * b.scale, (h.y - b.floor) * b.scale, (h.z - b.P0[I.Hips].z) * b.scale);
}
// Which way the body faces in a frame (yaw about +y, 0 facing +z). how: 'hips' (the way the hips face), or { hand | foot: 'L' | 'R' } (the way that fist or
// foot is from the chest or the hips: a punch or kick then goes straight ahead), or { from, to } (joint names: the way from one to the other).
function jointAt(b, name, mirror) { const p = _P[b.index[mirror ? SWAP(name) : name]].clone(); if (mirror) p.x = -p.x; return p; }
function facing(b, f, mirror, how = 'hips') {
  pose(b, f, _Q, _P);
  if (how === 'hips') { const k = b.index.Hips; _m.copy(_Q[k]).multiply(b.Q0inv[k]); if (mirror) { _m.y = -_m.y; _m.z = -_m.z; } _v.set(0, 0, 1).applyQuaternion(_m); return Math.atan2(_v.x, _v.z); }
  const [from, to] = how.hand ? ['Spine1', how.hand === 'L' ? 'LeftHand' : 'RightHand'] : how.foot ? ['Hips', how.foot === 'L' ? 'LeftFoot' : 'RightFoot'] : [how.from, how.to];
  const d = jointAt(b, to, mirror).sub(jointAt(b, from, mirror)); return Math.atan2(d.x, d.z);
}

// Cut a move: seg { file, from, to (seconds), mirror, face ('start' | 'end' | a time in seconds), turn (extra yaw, radians), place ('start' | 'end') }.
// Returns the packed move (the format of assets/people/anims.json): local rotations per bone per frame as 16-bit numbers, the hip bone's position (cm, in its parent).
window.cut = function (seg) {
  const b = files[seg.file], dt = b.frameTime, f0 = seg.from / dt, f1 = Math.min(b.frames.length - 1, seg.to / dt), n = Math.max(2, Math.round((f1 - f0) * dt * FPS) + 1);
  const fc = seg.face || 'start', ft = fc === 'end' ? f1 : typeof fc === 'number' ? fc / dt : typeof fc === 'object' && fc.at !== undefined ? fc.at / dt : f0;
  const yaw = -facing(b, ft, seg.mirror, typeof fc === 'object' ? fc : 'hips') + (seg.turn || 0); _yaw.setFromAxisAngle(_v.set(0, 1, 0), yaw);
  // (lying at the start: which way the head is from the hips, in the move's own frame; the game turns a get-up to match the way the body lies)
  pose(b, f0, _Q, _P); const lie = jointAt(b, 'Head', seg.mirror).sub(jointAt(b, 'Hips', seg.mirror)).applyQuaternion(_yaw), lieYaw = Math.atan2(lie.x, lie.z), lieUp = lie.y / lie.length();
  pose(b, f1, _Q, _P); const lie1 = jointAt(b, 'Head', seg.mirror).sub(jointAt(b, 'Hips', seg.mirror)).applyQuaternion(_yaw), endYaw = Math.atan2(lie1.x, lie1.z), endUp = lie1.y / lie1.length();
  const W = {}, hips = new THREE.Vector3(), start = new THREE.Vector3();
  frameWorld(b, seg.place === 'end' ? f1 : f0, seg.mirror, W, start); start.applyQuaternion(_yaw);
  const NB = BONES.length, q = new Int16Array(n * NB * 4), pos = new Float32Array(n * 3), root = new Float32Array(n * 2), local = new THREE.Quaternion(), track = [];
  const B = person.bones, parentOf = {}; for (const nm of BONES) { const p = B[nm].parent; parentOf[nm] = BONES.includes(p.name) ? p.name : null; }
  const restLocal = {}; for (const nm of BONES) restLocal[nm] = B[nm].quaternion.clone();
  const Wf = {};
  // One frame: every bone's local rotation (into L) and the hips (metres, turned and placed: into H).
  const frameAt = (f, L, H) => {
    frameWorld(b, f, seg.mirror, W, H);
    H.applyQuaternion(_yaw); H.x -= start.x; H.z -= start.z;
    for (let k = 0; k < NB; k++) {
      const nm = BONES[k];
      if (nm === 'Bip01_Pelvis') { Wf[nm] = (Wf[nm] || new THREE.Quaternion()).copy(Wf.Bip01).multiply(restLocal[nm]); local.copy(restLocal[nm]); }
      else {
        Wf[nm] = (Wf[nm] || new THREE.Quaternion()).copy(_yaw).multiply(W[nm]);
        const p = parentOf[nm]; if (p) local.copy(Wf[p]).invert().multiply(Wf[nm]); else local.copy(parentQ).invert().multiply(Wf[nm]);
      }
      local.normalize(); local.toArray(L, k * 4);
    }
  };
  const L = new Float32Array(NB * 4), L2 = new Float32Array(NB * 4), H2 = new THREE.Vector3(), span = f1 - f0, blendF = seg.loop ? Math.min(span * 0.4, 0.35 / dt) : 0;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const f = f0 + span * i / (n - 1);
    frameAt(f, L, hips);
    // A loop: over its last part it turns into the frames just before its start, so the end runs straight on into the beginning.
    if (blendF && f > f1 - blendF) {
      const u = (f - (f1 - blendF)) / blendF, w = u * u * (3 - 2 * u); frameAt(f - span, L2, H2);
      for (let k = 0; k < NB; k++) { qa.fromArray(L, k * 4); qb.fromArray(L2, k * 4); if (qa.dot(qb) < 0) qb.set(-qb.x, -qb.y, -qb.z, -qb.w); qa.slerp(qb, w).toArray(L, k * 4); }
      hips.y += (H2.y - hips.y) * w;
    }
    if (seg.loop) { hips.x = 0; hips.z = 0; }                                          // (a loop stands where it is)
    for (let k = 0; k < NB; k++) {
      local.fromArray(L, k * 4).normalize(); if (local.w < 0) { local.x = -local.x; local.y = -local.y; local.z = -local.z; local.w = -local.w; }
      q[(i * NB + k) * 4] = Math.round(local.x * 32767); q[(i * NB + k) * 4 + 1] = Math.round(local.y * 32767); q[(i * NB + k) * 4 + 2] = Math.round(local.z * 32767); q[(i * NB + k) * 4 + 3] = Math.round(local.w * 32767);
    }
    _v.copy(hips).applyMatrix4(parentInv);                                           // (into the hip bone's parent: centimetres)
    pos.set([_v.x, _v.y, _v.z], i * 3); root.set([hips.x, hips.z], i * 2); track.push([+hips.x.toFixed(3), +hips.y.toFixed(3), +hips.z.toFixed(3)]);
  }
  const b64 = a => { const u = new Uint8Array(a.buffer); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const end = track[n - 1];
  const r3 = x => +x.toFixed(3);
  return { frames: n, dur: +((n - 1) / FPS).toFixed(4), q: b64(q), pos: b64(pos), root: b64(root), travel: [end[0], end[2]], lie: [r3(lieYaw), r3(lieUp)], end: [r3(endYaw), r3(endUp)], track: track.filter((_, i) => i % 6 === 0 || i === n - 1) };
};
window.load = load;
window.BONES_LIST = BONES;
// A take that hardly stands upright borrows the neck and head of another take of the same person.
window.borrowCalib = function (name, from) { const a = files[name], c = files[from]; if (!a || !c || a.calib) return; for (const n of ['Bip01_Neck', 'Bip01_Head']) a.T[n] = c.T[n].clone(); a.calib = ['from ' + from]; };

// ---- previews: a strip of poses from moves (decoded the way the game decodes them), on a grid floor.
let renderer, scene, cam, figs = [];
function stage(w, h) {
  if (renderer) { renderer.setSize(w, h); return; }
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(w, h); renderer.setPixelRatio(1); document.body.appendChild(renderer.domElement);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a3038);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x403830, 1.6)); const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(3, 6, 4); scene.add(d);
  const g = new THREE.GridHelper(40, 40, 0x88909a, 0x4a525c); scene.add(g);
  cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
}
const dec = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
// moves: [{ clip (packed), t (seconds), x (where along the strip), label }]; view: 'side' | 'front' | 'three'.
window.strip = async function (items, view = 'three', w = 1800, h = 420) {
  stage(w, h);
  for (const f of figs) scene.remove(f); figs = [];
  const n = items.length, gap = 1.25;
  for (let i = 0; i < n; i++) {
    const it = items[i], p = await loadPerson(it.key || 'agent'), g = new THREE.Group(); g.add(p.root); scene.add(g); figs.push(g);
    const c = it.clip, q16 = new Int16Array(dec(c.q)), pos = new Float32Array(dec(c.pos)), NB = BONES.length;
    const fr = Math.min(c.frames - 1, Math.max(0, it.t * FPS)), a = Math.floor(fr), b = Math.min(c.frames - 1, a + 1), u = fr - a;
    for (let k = 0; k < NB; k++) {
      const o0 = (a * NB + k) * 4, o1 = (b * NB + k) * 4;
      const qa = new THREE.Quaternion(q16[o0] / 32767, q16[o0 + 1] / 32767, q16[o0 + 2] / 32767, q16[o0 + 3] / 32767).normalize();
      const qb = new THREE.Quaternion(q16[o1] / 32767, q16[o1 + 1] / 32767, q16[o1 + 2] / 32767, q16[o1 + 3] / 32767).normalize();
      p.bones[BONES[k]].quaternion.copy(qa.slerp(qb, u));
    }
    p.bones.Bip01.position.set(pos[a * 3] + (pos[b * 3] - pos[a * 3]) * u, pos[a * 3 + 1] + (pos[b * 3 + 1] - pos[a * 3 + 1]) * u, pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * u);
    if (it.keepTravel === false) { p.bones.Bip01.position.x = 0; p.bones.Bip01.position.z = 0; }
    g.position.x = (i - (n - 1) / 2) * gap * (it.spread || 1);
    if (it.yaw) g.rotation.y = it.yaw;
  }
  const span = (n - 1) * gap + 1.5, dist = span / 2 / Math.tan(15 * Math.PI / 180) * (h / w) * 1.05 + 2;
  if (view === 'side') { cam.position.set(0, 1.1, Math.max(4, dist)); cam.lookAt(0, 0.85, 0); }
  else { cam.position.set(0, 2.2, Math.max(4.5, dist)); cam.lookAt(0, 0.75, 0); }
  cam.aspect = w / h; cam.updateProjectionMatrix();
  renderer.render(scene, cam);
  return true;
};
setup().then(() => { window.ready = true; }).catch(e => { window.failed = String(e && e.stack || e); });
// (checking) how far the head and the chest are pitched (radians, + up) in some frames of a file, measured as each bone's turn away from its rest pose.
window.pitches = function (file, times) {
  const b = files[file], W = {}, h = new THREE.Vector3(), out = [];
  for (const t of times) {
    frameWorld(b, t / b.frameTime, false, W, h);
    const r = {};
    for (const n of ['Bip01', 'Bip01_Spine2', 'Bip01_Neck', 'Bip01_Head']) {
      const d = W[n].clone().multiply(T[n].clone().invert()), f = new THREE.Vector3(0, 0, 1).applyQuaternion(d), hf = new THREE.Vector3(0, 0, 1).applyQuaternion(W.Bip01.clone().multiply(T.Bip01.clone().invert()));
      r[n] = +(Math.asin(f.y) - Math.asin(hf.y) * (n === 'Bip01' ? 0 : 1)).toFixed(2);
    }
    out.push([t, r]);
  }
  return out;
};
