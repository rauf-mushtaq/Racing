// Motion capture: real walking, running and standing, recorded on people and shipped with the Rocketbox avatars (Microsoft, MIT licence; see
// assets/CREDITS.md). assets/people/anims.json holds a handful of cycles, each as a rotation for every body bone and finger at 30 frames a second
// (converted from the library's FBX files; see tools/ in the repository notes). The clips were made for exactly this skeleton, so a clip's rotation
// for a bone is simply that bone's local rotation.
//
// Each cycle is stored with its own speed (how fast the hips travelled) and the moment in the cycle at which the right foot is furthest forward, so
// that cycles of different speeds can be lined up and blended: stroll, walk, jog, run, sprint, with a standing, breathing clip underneath.
import * as THREE from 'three';

const URL = 'assets/people/anims.json';
const LADDER = ['stroll', 'walk', 'jog', 'run', 'sprint'];
const frac = x => x - Math.floor(x);
const slerpFlat = THREE.Quaternion.slerpFlat;

export const Mocap = {
  ready: false, failed: false, bones: [], index: {}, clips: {}, ladder: [], _p: null,
  load() {
    if (!this._p) this._p = fetch(URL).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => this.init(d)).catch(e => { this.failed = true; console.warn('motion capture not loaded', e); });
    return this._p;
  },
  init(d) {
    const dec = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
    this.bones = d.bones; this.index = Object.fromEntries(d.bones.map((n, i) => [n, i]));
    for (const [name, c] of Object.entries(d.clips)) {
      const q16 = new Int16Array(dec(c.q)), q = new Float32Array(q16.length); for (let i = 0; i < q16.length; i++) q[i] = q16[i] / 32767;
      this.clips[name] = { name, frames: c.frames, dur: c.dur, speed: c.speed, stride: c.speed * c.dur, off: c.dur ? c.tR / c.dur - 0.25 : 0, q, pos: new Float32Array(dec(c.pos)) };
    }
    this.ladder = LADDER.map(n => this.clips[n]).filter(Boolean).sort((a, b) => a.speed - b.speed);
    this.TA = new Float32Array(this.bones.length * 4); this.TB = new Float32Array(this.bones.length * 4); this.TI = new Float32Array(this.bones.length * 4);
    this.ready = true;
  },
  // The two cycles either side of a speed (m/s), and how far between them.
  pair(speed, out = {}) {
    const L = this.ladder;
    if (speed <= L[0].speed) { out.a = out.b = L[0]; out.w = 0; return out; }
    if (speed >= L[L.length - 1].speed) { out.a = out.b = L[L.length - 1]; out.w = 0; return out; }
    for (let i = 0; i < L.length - 1; i++) if (speed < L[i + 1].speed) { out.a = L[i]; out.b = L[i + 1]; out.w = (speed - L[i].speed) / (L[i + 1].speed - L[i].speed); return out; }
    return out;
  },
  // Metres of ground covered by one full cycle (two steps) at this speed: how fast to run the cycle so the feet do not slide.
  strideAt(speed) { const p = this.pair(speed, _pair); return p.a.stride + (p.b.stride - p.a.stride) * p.w; },
  // One cycle sampled at phase (cycles; 0.25 is the right foot furthest forward) into dst (a rotation per bone) and rootDst (hip bone position, cm).
  sample(c, phase, dst, rootDst) {
    const B = this.bones.length, f = frac(phase + c.off) * (c.frames - 1), i = Math.min(c.frames - 2, Math.floor(f)), a = f - i;
    if (c.frames < 2) { dst.set(c.q.subarray(0, B * 4)); rootDst[0] = c.pos[0]; rootDst[1] = c.pos[1]; rootDst[2] = c.pos[2]; return; }
    const o0 = i * B * 4, o1 = (i + 1) * B * 4;
    for (let k = 0; k < B; k++) slerpFlat(dst, k * 4, c.q, o0 + k * 4, c.q, o1 + k * 4, a);
    for (let k = 0; k < 3; k++) rootDst[k] = c.pos[i * 3 + k] + (c.pos[(i + 1) * 3 + k] - c.pos[i * 3 + k]) * a;
  },
  // The whole locomotion pose: standing (breathing) blended into the cycles for this speed. phase in cycles. out: a rotation per bone; returns the hip position in root (cm).
  evaluate(out, root, speed, phase, t) {
    const B = this.bones.length, p = this.pair(speed, _pair), TA = this.TA, TB = this.TB, TI = this.TI;
    this.sample(p.a, phase, TA, _r0);
    if (p.w > 0) { this.sample(p.b, phase, TB, _r1); for (let k = 0; k < B; k++) slerpFlat(TA, k * 4, TA, k * 4, TB, k * 4, p.w); for (let k = 0; k < 3; k++) _r0[k] += (_r1[k] - _r0[k]) * p.w; }
    const idle = this.clips.idle, wl = Math.min(1, Math.max(0, (speed - 0.04) / 0.5));
    if (idle && wl < 1) {
      this.sample(idle, t / idle.dur - idle.off, TI, _r1);
      for (let k = 0; k < B; k++) slerpFlat(out, k * 4, TI, k * 4, TA, k * 4, wl);
      for (let k = 0; k < 3; k++) root[k] = _r1[k] + (_r0[k] - _r1[k]) * wl;
    } else { out.set(TA); root[0] = _r0[0]; root[1] = _r0[1]; root[2] = _r0[2]; }
  },
};
const _pair = { a: null, b: null, w: 0 }, _r0 = new Float32Array(3), _r1 = new Float32Array(3);
