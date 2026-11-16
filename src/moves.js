// Moves: recorded human motion for fighting, falling and getting up, played on the real people (people.js) over their walking and running (mocap.js).
// assets/people/moves.json is made by tools/mocap/build.mjs from the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu; see assets/CREDITS.md):
// boxers' jabs, crosses, hooks and combinations, street and karate kicks, a fighter's guard, a stumble, ducking, falling flat, and four ways of getting up
// off the ground (from the back, the front, the side, and slowly, hurt). Each move is a rotation for every body bone at 30 frames a second (fitted to this
// skeleton, so a rotation is the bone's local rotation), the hip bone's height, and the path the hips take over the ground (the game moves the person
// along it, so the feet stay where they are planted).
//   clip.hit: the moments (seconds) a blow lands;  clip.lie: [the way the head lies from the hips at the start (yaw, radians), how upright (-1..1)];
//   clip.loop: a loop (the guard).
import * as THREE from 'three';

const URL = 'assets/people/moves.json';
const slerpFlat = THREE.Quaternion.slerpFlat;

export const Moves = {
  ready: false, failed: false, bones: [], clips: {}, hip: 89.52, _p: null,
  load() {
    if (!this._p) this._p = fetch(URL).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => this.init(d)).catch(e => { this.failed = true; console.warn('moves not loaded', e); });
    return this._p;
  },
  init(d) {
    const dec = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
    this.bones = d.bones; this.hip = (d.rest && d.rest.hipLocal && d.rest.hipLocal[1]) || 89.52;
    for (const [name, c] of Object.entries(d.clips)) {
      const q16 = new Int16Array(dec(c.q)), q = new Float32Array(q16.length); for (let i = 0; i < q16.length; i++) q[i] = q16[i] / 32767;
      this.clips[name] = { name, frames: c.frames, dur: c.dur, q, pos: new Float32Array(dec(c.pos)), root: new Float32Array(dec(c.root)), hit: c.hit || [], loop: !!c.loop, lie: c.lie || [0, 1], end: c.end || [0, 1], travel: c.travel || [0, 0] };
    }
    this.ready = true;
  },
  get(name) { return this.ready ? this.clips[name] || null : null; },
  // A move at time t (seconds; a loop wraps, anything else holds its ends): a rotation per bone (in the order of Moves.bones) into dst, the hip bone's
  // position (centimetres, in its parent) into pos, and the hips' path over the ground (metres, in the move's own frame: x to the side, z ahead) into xz.
  sample(c, t, dst, pos, xz) {
    const B = this.bones.length, n = c.frames;
    let f = c.loop ? (((t / c.dur) % 1 + 1) % 1) * (n - 1) : Math.min(n - 1, Math.max(0, t * 30));
    const i = Math.min(n - 2, Math.floor(f)), a = f - i, o0 = i * B * 4, o1 = (i + 1) * B * 4;
    for (let k = 0; k < B; k++) slerpFlat(dst, k * 4, c.q, o0 + k * 4, c.q, o1 + k * 4, a);
    if (pos) for (let k = 0; k < 3; k++) pos[k] = c.pos[i * 3 + k] + (c.pos[(i + 1) * 3 + k] - c.pos[i * 3 + k]) * a;
    if (xz) for (let k = 0; k < 2; k++) xz[k] = c.root[i * 2 + k] + (c.root[(i + 1) * 2 + k] - c.root[i * 2 + k]) * a;
  },
};
