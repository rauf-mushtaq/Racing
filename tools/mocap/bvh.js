// A BVH reader for the CMU motion capture (the MotionBuilder-friendly conversion: Y up, centimetre-ish units, the first frame a T-pose facing +Z).
// parseBVH(text) -> { joints: [{ name, parent (index or -1), offset: [x,y,z], channels: ['Xposition', ...] }], frames: Float32Array[], frameTime }
// pose(bvh, frame, outQ, outP): every joint's world rotation (THREE.Quaternion) and position (THREE.Vector3) in that frame.
// Used by tools/mocap/page.js (in the browser) and tools/mocap/scan.mjs (in Node).
import * as THREE from '../../vendor/three/build/three.module.js';

export function parseBVH(text) {
  const tok = text.split(/\s+/).filter(Boolean); let i = 0;
  const joints = [], stack = [];
  const next = () => tok[i++];
  if (next() !== 'HIERARCHY') throw new Error('not a BVH file');
  let nch = 0;
  while (i < tok.length) {
    const t = next();
    if (t === 'ROOT' || t === 'JOINT') {
      const j = { name: next(), parent: stack.length ? stack[stack.length - 1] : -1, offset: null, channels: [], ch0: 0 };
      joints.push(j); next(); /* { */ stack.push(joints.length - 1);
    } else if (t === 'End') { next(); next(); /* Site { */ next(); const o = [+next(), +next(), +next()]; joints[stack[stack.length - 1]].end = o; next(); /* } */ }
    else if (t === 'OFFSET') { joints[stack[stack.length - 1]].offset = [+next(), +next(), +next()]; }
    else if (t === 'CHANNELS') { const j = joints[stack[stack.length - 1]], n = +next(); j.ch0 = nch; for (let k = 0; k < n; k++) j.channels.push(next()); nch += n; }
    else if (t === '}') stack.pop();
    else if (t === 'MOTION') break;
  }
  next(); const nf = +next(); next(); next(); const frameTime = +next();          // Frames: n  Frame Time: dt
  const frames = [];
  for (let f = 0; f < nf; f++) { const a = new Float32Array(nch); for (let k = 0; k < nch; k++) a[k] = +tok[i++]; frames.push(a); }
  return { joints, frames, frameTime, index: Object.fromEntries(joints.map((j, k) => [j.name, k])) };
}

const _q = new THREE.Quaternion(), _e = new THREE.Vector3(), _v = new THREE.Vector3(), D2R = Math.PI / 180;
const AX = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) };
// World rotations and positions of every joint in a frame (f may be fractional: the two frames either side are blended).
export function pose(bvh, f, outQ, outP) {
  const { joints, frames } = bvh, f0 = Math.max(0, Math.min(frames.length - 1, Math.floor(f))), f1 = Math.min(frames.length - 1, f0 + 1), a = f - f0;
  for (let k = 0; k < joints.length; k++) {
    const j = joints[k]; outQ[k] = outQ[k] || new THREE.Quaternion(); outP[k] = outP[k] || new THREE.Vector3();
    const local = outQ[k].identity(), lp = _e.set(j.offset[0], j.offset[1], j.offset[2]);
    for (let c = 0; c < j.channels.length; c++) {
      const ch = j.channels[c], v0 = frames[f0][j.ch0 + c], v1 = frames[f1][j.ch0 + c];
      let v = v0 + (v1 - v0) * a;
      if (ch.endsWith('rotation')) { if (Math.abs(v1 - v0) > 180) v = a < 0.5 ? v0 : v1; local.multiply(_q.setFromAxisAngle(AX[ch[0]], v * D2R)); }
      else lp.setComponent('XYZ'.indexOf(ch[0]), v);
    }
    if (j.parent < 0) { outP[k].copy(lp); }
    else { outP[k].copy(lp).applyQuaternion(outQ[j.parent]).add(outP[j.parent]); local.premultiply(outQ[j.parent]); }
  }
}
