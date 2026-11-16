// A look through CMU clips for the moments worth cutting: node tools/mocap/scan.mjs <bvh file> [step seconds]
// Prints, every step, the hips' height and travel, each hand's reach in front of the chest, each foot's height, and which way the body faces.
import fs from 'node:fs';
import * as THREE from '../../vendor/three/build/three.module.js';
import { parseBVH, pose } from './bvh.js';
const file = process.argv[2], step = +(process.argv[3] || 0.1);
const b = parseBVH(fs.readFileSync(file, 'utf8')), I = b.index, Q = [], P = [];
pose(b, 0, Q, P); const s = 1 / (P[I.Head].y - Math.min(P[I.LeftToeBase].y, P[I.RightToeBase].y)), hip0 = P[I.Hips].y * s;   // (in body heights)
const fw = new THREE.Vector3(), r = n => (n >= 0 ? ' ' : '') + n.toFixed(2);
console.log(`${file}: ${b.frames.length} frames at ${(1 / b.frameTime).toFixed(0)} fps, ${(b.frames.length * b.frameTime).toFixed(1)} s; units per body height ${(1 / s).toFixed(1)}`);
console.log('    t   hipY   hipX   hipZ  face  reachL reachR  footL  footR  headY');
for (let t = 0; t < b.frames.length * b.frameTime; t += step) {
  pose(b, t / b.frameTime, Q, P);
  fw.set(0, 0, 1).applyQuaternion(Q[I.Hips]); const face = Math.atan2(fw.x, fw.z) * 57.3;
  const ch = P[I.Spine1], reach = h => { const d = P[h].clone().sub(ch); d.y = 0; return d.dot(fw.set(fw.x, 0, fw.z).normalize()) * s; };
  console.log(`${t.toFixed(1).padStart(5)} ${r(P[I.Hips].y * s)} ${r(P[I.Hips].x * s)} ${r(P[I.Hips].z * s)} ${face.toFixed(0).padStart(5)} ${r(reach(I.LeftHand))} ${r(reach(I.RightHand))} ${r(Math.min(P[I.LeftToeBase].y, P[I.LeftFoot].y) * s)} ${r(Math.min(P[I.RightToeBase].y, P[I.RightFoot].y) * s)} ${r(P[I.Head].y * s)}`);
}
