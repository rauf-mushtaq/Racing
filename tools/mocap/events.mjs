// Finds the blows in CMU files: node tools/mocap/events.mjs <file> [<file>...]
// A punch: a hand shooting out in front of the chest (its reach, in body heights, peaking above 0.3 after rising quickly). A kick: a foot rising above knee height.
// For each: the time of the peak, which hand or foot, the reach, how high (relative to the head), and how far to the side it came from (a hook swings in wide).
import fs from 'node:fs';
import * as THREE from '../../vendor/three/build/three.module.js';
import { parseBVH, pose } from './bvh.js';
import { CACHE } from './lib.mjs';
for (const name of process.argv.slice(2)) {
  const b = parseBVH(fs.readFileSync(`${CACHE}/${name}.bvh`, 'utf8')), I = b.index, Q = [], P = [], dt = b.frameTime;
  pose(b, 0, Q, P); const s = 1 / (P[I.Head].y - Math.min(P[I.LeftToeBase].y, P[I.RightToeBase].y));
  const fw = new THREE.Vector3(), rt = new THREE.Vector3(), rows = [];
  for (let f = 1; f < b.frames.length; f++) {
    pose(b, f, Q, P);
    fw.set(0, 0, 1).applyQuaternion(Q[I.Spine1]); fw.y = 0; fw.normalize(); rt.set(fw.z, 0, -fw.x);
    const ch = P[I.Spine1], fl = Math.min(P[I.LeftToeBase].y, P[I.RightToeBase].y, P[I.LeftFoot].y, P[I.RightFoot].y);
    const hand = h => { const d = P[h].clone().sub(ch); return [d.dot(fw) * s, (P[h].y - P[I.Head].y) * s, d.dot(rt) * s]; };
    rows.push({ t: f * dt, L: hand(I.LeftHand), R: hand(I.RightHand), fL: (P[I.LeftFoot].y - fl) * s, fR: (P[I.RightFoot].y - fl) * s, hipY: (P[I.Hips].y - fl) * s, fw: fw.clone() });
  }
  const out = [], W = Math.round(0.25 / dt);
  for (const side of ['L', 'R']) for (let i = W; i < rows.length - 3; i++) {
    const r = rows[i][side][0]; if (r < 0.3) continue;
    let peak = true; for (let k = i - W; k <= i + W && k < rows.length; k++) if (rows[k][side][0] > r) { peak = false; break; } if (!peak) continue;
    const before = Math.min(...rows.slice(i - W, i).map(x => x[side][0])); if (r - before < 0.15) continue;
    out.push(`${rows[i].t.toFixed(2).padStart(6)}  punch ${side}  reach ${r.toFixed(2)}  height ${rows[i][side][1].toFixed(2)}  side-start ${rows[i - W][side][2].toFixed(2)}  rise ${(r - before).toFixed(2)} in ${((i - rows.slice(i - W, i).findIndex(x => x[side][0] === before) - (i - W)) * dt).toFixed(2)}s`);
  }
  for (const side of ['fL', 'fR']) for (let i = W; i < rows.length - 3; i++) {
    const h = rows[i][side]; if (h < 0.22) continue;
    let peak = true; for (let k = i - W; k <= i + W && k < rows.length; k++) if (rows[k][side] > h) { peak = false; break; } if (!peak) continue;
    out.push(`${rows[i].t.toFixed(2).padStart(6)}  kick ${side === 'fL' ? 'L' : 'R'}  foot ${h.toFixed(2)}  hips ${rows[i].hipY.toFixed(2)}`);
  }
  out.sort((a, b) => parseFloat(a) - parseFloat(b));
  console.log(`== ${name} (${(rows.length * dt).toFixed(1)} s)`); console.log(out.join('\n'));
}
