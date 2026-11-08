// The performance test (Settings > Performance test, or open the game with ?bench).
//
// A fixed drive through the places that cost the most, steered by a small autopilot so every run is the same: a downtown avenue (tall buildings,
// the most traffic and people), a bridge, the diagonal boulevard, the spiral road up a hill, and a street past a street performer. Every
// frame's time is recorded, and at the end the numbers are shown place by place, so a slow spot can be found, and can be copied out as text.
// The car goes through traffic and walls (collisions are off) so a crash never changes what is being measured; nothing else is switched off:
// the game still lowers its own resolution and features if it is struggling (the result says so), as it would when you play.
//
// The route and the numbers are plain code with no graphics in it (the game gives it the car and a few functions), so tests can run it.
import { BRIDGES } from './rivercourse.js';
import { AVENUES } from './avenues.js';
import { SP } from './grid.js';

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LANE = 6.3;                                                    // (the lane the autopilot keeps to, from the middle of the road)

// A polyline moved sideways by `off`, to the left of the way it goes.
function lane(pts, off) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [p[0] - dz / l * off, p[1] + dx / l * off];
  });
}
// The part of a road polyline (an avenue's points) from index i0 that is `len` metres long.
function stretch(A, i0, len) {
  const out = [[A.x[i0], A.z[i0]]]; let s = 0;
  for (let i = i0 + 1; i < A.n && s < len; i++) { s += Math.hypot(A.x[i] - A.x[i - 1], A.z[i] - A.z[i - 1]); out.push([A.x[i], A.z[i]]); }
  return out;
}

// `spots`: the street performers' places (buskers.js has them; it is a graphics module, so the game hands them in).
export function stations(spots) {
  const out = [];
  out.push({ name: 'Downtown avenue', speed: 22, pts: lane([[0, 380], [0, 40]], LANE), len: 340 });
  const br = BRIDGES.find(b => b.type === 'suspension') || BRIDGES[0];
  { const a = br.u0 - 150, b = br.u1 + 150, pts = br.axis === 'z' ? [[br.c, a], [br.c, b]] : [[a, br.c], [b, br.c]]; out.push({ name: 'Bridge over the river', speed: 20, pts: lane(pts, LANE), len: b - a }); }
  { const A = AVENUES[0], i0 = Math.round(A.n * 0.55), pts = stretch(A, i0, 330); out.push({ name: 'Diagonal boulevard', speed: 24, pts: lane(pts, 4.4), len: 330 }); }
  { const A = AVENUES[2], pts = stretch(A, 8, 260); out.push({ name: 'Road up the hill', speed: 14, pts: lane(pts, 2), len: 260 }); }
  { const s = spots.filter(q => Math.max(Math.abs(q.x), Math.abs(q.z)) < 700).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[2] || spots[0];
    const kx = Math.round(s.x / SP) * SP, kz = Math.round(s.z / SP) * SP, alongZ = Math.abs(s.x - kx) < Math.abs(s.z - kz), pts = alongZ ? [[kx, s.z - 170], [kx, s.z + 170]] : [[s.x - 170, kz], [s.x + 170, kz]];
    out.push({ name: 'Street with performers', speed: 16, pts: lane(pts, LANE), len: 340 }); }
  for (const st of out) { st.t = 0; st.k = 0; }
  return out;
}

export class Bench {
  // C: the pieces of the game it needs: car, spots, resetCar(x, z, h), loadNow(x, z), info() -> { calls, tris, res, easeGpu, easeCpu, heap }, status(text), env()
  constructor(C) { this.C = C; this.on = false; this.result = null; this.onDone = null; }
  start(o = {}) {
    this.scale = o.scale || 1;                                       // (tests run it shorter)
    this.list = stations(this.C.spots); this.i = -1; this.frames = []; this.hitchList = []; this.away = 0; this.t = 0; this.t0 = performance.now(); this.on = true; this.res0 = this.C.info().res;
    this.next();
  }
  next() {
    this.i++;
    if (this.i >= this.list.length) return this.finish();
    const st = this.list[this.i]; st.t = 0; st.k = 0; this.cur = st; st.frames = [];
    const [a, b] = [st.pts[0], st.pts[1]], h = Math.atan2(b[0] - a[0], b[1] - a[1]);
    this.C.resetCar(a[0], a[1], h); this.C.loadNow(a[0], a[1]);
    this.stationT = 0;
    if (this.C.status) this.C.status(`PERFORMANCE TEST ${this.i + 1}/${this.list.length} · ${st.name}`);
  }
  stop() { if (!this.on) return; this.on = false; this.result = null; if (this.C.status) this.C.status(''); }
  // The controls for the car this frame (called instead of reading the keyboard).
  read(dt) {
    const { car } = this.C, st = this.cur, P = st.pts;
    this.stationT += dt;
    // How far along the road: the nearest point of the polyline ahead of where we were.
    let best = st.k, bd = 1e18;
    for (let k = st.k; k < Math.min(P.length - 1, st.k + 40); k++) {
      const d = Math.hypot(P[k][0] - car.x, P[k][1] - car.z); if (d < bd) { bd = d; best = k; }
    }
    st.k = best;
    // The point `look` metres ahead along the road.
    const look = clamp(6 + car.speed * 0.55, 8, 26); let acc = 0, ti = st.k, tx = P[st.k][0], tz = P[st.k][1];
    for (let k = st.k; k < P.length - 1 && acc < look; k++) { acc += Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]); ti = k + 1; tx = P[ti][0]; tz = P[ti][1]; }
    const end = st.k >= P.length - 2 && Math.hypot(P[P.length - 1][0] - car.x, P[P.length - 1][1] - car.z) < 25;
    if (end || this.stationT > st.len / Math.max(6, st.speed * 0.5) * this.scale + 12 * this.scale) { this.next(); return this.on ? this.read(0) : { steer: 0, gas: 0, brake: 1, handbrake: false, nitro: false, analog: true, sens: 1, device: 'pad', digital: {} }; }
    const err = wrap(Math.atan2(tx - car.x, tz - car.z) - car.h);
    // Slower where the road bends: the bend ahead (over the next 40 m) sets the speed.
    let bend = 0; { let a2 = 0; for (let k = st.k; k < P.length - 2 && a2 < 40; k++) { a2 += Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]); const d1 = Math.atan2(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]), d2 = Math.atan2(P[k + 2][0] - P[k + 1][0], P[k + 2][1] - P[k + 1][1]); bend = Math.max(bend, Math.abs(wrap(d2 - d1)) / Math.max(1, Math.hypot(P[k + 2][0] - P[k][0], P[k + 2][1] - P[k][1]) / 2)); } }
    const want = Math.min(st.speed, bend > 1e-4 ? Math.sqrt(5 / bend) : 99), dv = want - car.speed;
    const steer = clamp(this.SIGN * err * 1.6, -1, 1);
    return { steer, gas: clamp(dv * 0.35, 0, 1), brake: clamp(-dv * 0.25, 0, 1), handbrake: false, nitro: false, analog: true, sens: 1, device: 'pad', digital: {} };
  }
  // One frame's numbers: the whole frame in ms (as the screen saw it), how much of it was the game's own JavaScript, and what was drawn.
  sample(frameMs, jsMs) {
    if (!this.on || !this.cur) return;
    if (frameMs > 1500) { this.away++; return; }                    // the tab was in the background, or the page was suspended
    const I = this.C.info(), f = { ms: frameMs, js: jsMs, calls: I.calls, tris: I.tris };
    this.frames.push(f); this.cur.frames.push(f);
    if (frameMs > 50) this.hitchList.push([this.cur.name, +(this.stationT).toFixed(1), Math.round(frameMs)]);
  }
  finish() {
    this.on = false; if (this.C.status) this.C.status('');
    const I = this.C.info();
    this.result = summarise(this.list, this.frames, { away: this.away, hitches: this.hitchList, seconds: (performance.now() - this.t0) / 1000, res0: this.res0, res1: I.res, easeGpu: I.easeGpu, easeCpu: I.easeCpu, heap: I.heap, env: this.C.env ? this.C.env() : {} });
    if (this.onDone) this.onDone(this.result);
  }
}
Bench.prototype.SIGN = -1;                                               // (a positive steer turns the car to a smaller heading; tests check that it follows the road)

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
export function stats(frames) {
  if (!frames.length) return { frames: 0, fps: 0, low: 0, worst: 0, js: 0, calls: 0, tris: 0, hitches: 0 };
  const ms = frames.map(f => f.ms).sort((a, b) => a - b), mean = ms.reduce((a, b) => a + b, 0) / ms.length;
  return { frames: frames.length, fps: 1000 / mean, low: 1000 / pct(ms, 0.99), worst: ms[ms.length - 1], js: frames.reduce((a, f) => a + f.js, 0) / frames.length, calls: Math.max(...frames.map(f => f.calls)), tris: Math.max(...frames.map(f => f.tris)), hitches: frames.filter(f => f.ms > 50).length };
}
export function summarise(list, frames, extra) {
  const all = stats(frames), places = list.map(st => ({ name: st.name, ...stats(st.frames || []) }));
  const verdict = all.frames < 30 ? 'Not enough frames to judge (was the page in the background?)'
    : all.fps >= 55 && all.low >= 40 ? 'Smooth.' : all.fps >= 40 && all.low >= 25 ? 'Playable, with some dips.' : 'Heavy: try Graphics: Medium or Low, or a lower Render scale.';
  return { when: new Date().toISOString(), all, places, verdict, ...extra };
}
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
export function toText(r) {
  const e = r.env || {}, row = (n, s) => `${n.padEnd(24)} ${String(Math.round(s.fps)).padStart(4)} ${String(Math.round(s.low)).padStart(7)} ${String(Math.round(s.worst)).padStart(7)} ${String(s.hitches).padStart(8)} ${f1(s.js).padStart(7)} ${String(s.calls).padStart(6)} ${String(Math.round(s.tris / 1000)).padStart(6)}`;
  return [
    `SUNSET CITY performance test, ${r.when.slice(0, 16).replace('T', ' ')} UTC`,
    `Device: ${e.device || '?'} | graphics ${e.quality || '?'} | ${e.canvas || '?'} | ray tracing ${e.rt || '?'} | MSAA ${e.msaa ?? '?'}x | ${e.gpu || 'unknown GPU'}`,
    `Time of day: ${e.tod || '?'} | resolution scale ${f1(r.res0)} -> ${f1(r.res1)}${r.easeGpu || r.easeCpu ? ` | the game eased ${r.easeGpu} picture and ${r.easeCpu} CPU steps by itself` : ''}${r.heap ? ` | JS heap ${Math.round(r.heap)} MB` : ''}`,
    `Overall: ${Math.round(r.all.fps)} fps average, ${Math.round(r.all.low)} fps in the slowest 1% of frames, worst frame ${Math.round(r.all.worst)} ms, ${r.all.hitches} frames over 50 ms (${r.all.frames} frames in ${Math.round(r.seconds)} s). ${r.verdict}`,
    '', `${'Place'.padEnd(24)} ${'fps'.padStart(4)} ${'1% low'.padStart(7)} ${'worst ms'.padStart(7)} ${'>50 ms'.padStart(8)} ${'JS ms'.padStart(7)} ${'draws'.padStart(6)} ${'k tris'.padStart(6)}`,
    ...r.places.map(p => row(p.name, p)),
    ...(r.hitches.length ? ['', 'Longest hitches (place, seconds in, ms): ' + r.hitches.sort((a, b) => b[2] - a[2]).slice(0, 8).map(h => `${h[0]} ${h[1]}s ${h[2]}`).join('; ')] : []),
  ].join('\n');
}
