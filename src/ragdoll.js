// A ragdoll: what happens to a real person (people.js) who is knocked over by a car, a kick, a big punch, a blast or a bullet. Instead of a fall
// worked out in advance, the body is let go: it is a set of points (the hips, the spine, the base of the neck, the head, and each shoulder, elbow, hand,
// hip, knee, ankle and toe) that fly and fall under gravity (Verlet integration), held together at the lengths of the bones, with the joints kept within
// what a body can do (knees that only bend one way, hips and a neck that only turn so far), landing on the ground (and pushed out of walls) with
// friction. The skeleton is then fitted to the points every frame: each bone is turned so it lies along its points (and, for the arms and legs, so the
// elbow and knee bend the way they do). When it has come to rest, the game knows how the body lies (on its back, its front or its side, and which way the
// head is) and plays the matching recorded get-up from there (moves.js).
import * as THREE from 'three';
import { clamp } from './util.js';

// [point, the bone it sits at, radius (how far the body's surface is from it), mass]
const PTS = [
  ['pelvis', 'Bip01', 0.11, 4], ['spine', 'Bip01_Spine1', 0.11, 3], ['chest', 'Bip01_Neck', 0.1, 3], ['head', 'Bip01_Head', 0.1, 1.5],
  ['shL', 'Bip01_L_UpperArm', 0.055, 1.4], ['shR', 'Bip01_R_UpperArm', 0.055, 1.4], ['elL', 'Bip01_L_Forearm', 0.045, 0.8], ['elR', 'Bip01_R_Forearm', 0.045, 0.8],
  ['hdL', 'Bip01_L_Hand', 0.035, 0.4], ['hdR', 'Bip01_R_Hand', 0.035, 0.4], ['hipL', 'Bip01_L_Thigh', 0.08, 2], ['hipR', 'Bip01_R_Thigh', 0.08, 2],
  ['knL', 'Bip01_L_Calf', 0.055, 1.2], ['knR', 'Bip01_R_Calf', 0.055, 1.2], ['anL', 'Bip01_L_Foot', 0.05, 0.6], ['anR', 'Bip01_R_Foot', 0.05, 0.6],
  ['toL', 'Bip01_L_Toe0', 0.025, 0.3], ['toR', 'Bip01_R_Toe0', 0.025, 0.3],
];
const I = Object.fromEntries(PTS.map((p, i) => [p[0], i]));
// Rigid pairs (the bones, and the braces that keep the hips and the chest each in one piece).
const RIGID = [['pelvis', 'spine'], ['pelvis', 'hipL'], ['pelvis', 'hipR'], ['hipL', 'hipR'], ['spine', 'hipL'], ['spine', 'hipR'],
  ['spine', 'chest'], ['chest', 'shL'], ['chest', 'shR'], ['shL', 'shR'], ['spine', 'shL'], ['spine', 'shR'], ['chest', 'head'],
  ['shL', 'elL'], ['elL', 'hdL'], ['shR', 'elR'], ['elR', 'hdR'], ['hipL', 'knL'], ['knL', 'anL'], ['anL', 'toL'], ['hipR', 'knR'], ['knR', 'anR'], ['anR', 'toR']];
// Pairs kept within a range of their resting length: [a, b, least, most] (the back bends a little; an elbow or a knee folds so far; the head stays off the shoulders).
const RANGE = [['pelvis', 'chest', 0.86, 1.03], ['hipL', 'shL', 0.85, 1.06], ['hipR', 'shR', 0.85, 1.06], ['shL', 'hdL', 0.42, 1], ['shR', 'hdR', 0.42, 1],
  ['hipL', 'anL', 0.4, 1], ['hipR', 'anR', 0.4, 1], ['knL', 'toL', 0.85, 1.08], ['knR', 'toR', 0.85, 1.08], ['head', 'shL', 0.75, 1.3], ['head', 'shR', 0.75, 1.3], ['head', 'spine', 0.9, 1.04]];

const VMAX = 11;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();
const _lat = new THREE.Vector3(), _up = new THREE.Vector3(), _fwd = new THREE.Vector3(), _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _Rp = new THREE.Quaternion(), _Rc = new THREE.Quaternion(), _Rn = new THREE.Quaternion(), _Rr = new THREE.Quaternion();

// The turn that takes a bone lying along d0 (with its side towards r0) to lie along d (with its side towards r). All unit-ish vectors; r is made square to d.
function aim(d0, r0, d, r, out) {
  _e.copy(r0).addScaledVector(d0, -r0.dot(d0)).normalize(); _f.crossVectors(d0, _e); _m0.makeBasis(d0, _e, _f);
  _c.copy(d).normalize(); _d.copy(r).addScaledVector(_c, -r.dot(_c)); if (_d.lengthSq() < 1e-8) _d.copy(_e); _d.normalize(); _a.crossVectors(_c, _d); _m1.makeBasis(_c, _d, _a);
  _m1.multiply(_m0.transpose()); return out.setFromRotationMatrix(_m1);
}

export class Ragdoll {
  constructor(person) {
    this.person = person; const B = person.bones;
    this.ok = PTS.every(p => B[p[1]]) && !!person.restPos;
    if (!this.ok) return;
    const n = PTS.length; this.n = n;
    this.x = new Float32Array(n * 3); this.p = new Float32Array(n * 3); this.gy = new Float32Array(n); this.r = new Float32Array(n); this.w = new Float32Array(n);
    PTS.forEach((p, i) => { this.r[i] = p[2]; this.w[i] = 1 / p[3]; });
    const rp = name => person.restPos[name], len = (a, b) => rp(PTS[I[a]][1]).distanceTo(rp(PTS[I[b]][1]));
    this.rigid = RIGID.map(([a, b]) => [I[a], I[b], len(a, b)]);
    this.range = RANGE.map(([a, b, lo, hi]) => [I[a], I[b], len(a, b) * lo, len(a, b) * hi]);
    this.thigh = len('hipL', 'knL');
    // Rest directions in the character's own frame (x to its left, y up, z ahead), for fitting the bones.
    const dir = (a, b) => rp(b).clone().sub(rp(a)).normalize();
    this.rest = {
      pelvisUp: dir('Bip01', 'Bip01_Spine1'), pelvisLat: dir('Bip01_R_Thigh', 'Bip01_L_Thigh'),
      chestUp: dir('Bip01_Spine1', 'Bip01_Neck'), chestLat: dir('Bip01_R_UpperArm', 'Bip01_L_UpperArm'), neck: dir('Bip01_Neck', 'Bip01_Head'),
    };
    for (const s of ['L', 'R']) {
      const ua = dir(`Bip01_${s}_UpperArm`, `Bip01_${s}_Forearm`), fa = dir(`Bip01_${s}_Forearm`, `Bip01_${s}_Hand`), th = dir(`Bip01_${s}_Thigh`, `Bip01_${s}_Calf`), ca = dir(`Bip01_${s}_Calf`, `Bip01_${s}_Foot`), ft = dir(`Bip01_${s}_Foot`, `Bip01_${s}_Toe0`);
      const Z = new THREE.Vector3(0, 0, 1);
      this.rest['ua' + s] = ua; this.rest['fa' + s] = fa; this.rest['th' + s] = th; this.rest['ca' + s] = ca; this.rest['ft' + s] = ft;
      this.rest['armH' + s] = new THREE.Vector3().crossVectors(ua, Z).normalize();                 // the elbow's hinge (an arm hanging down bends forward)
      this.rest['legH' + s] = new THREE.Vector3().crossVectors(Z, th).normalize();                 // the knee's (the shin folds back)
    }
    this.rootQ = new THREE.Quaternion(); this.W = {}; for (const e of person.order) this.W[e.name] = new THREE.Quaternion();
    this.parentQ = new THREE.Quaternion(); this.active = false; this.still = 0; this.t = 0;
    this.v = {}; for (const k of ['pelvisUp', 'pelvisLat', 'chestUp', 'chestLat']) this.v[k] = new THREE.Vector3();
  }
  get(name, out) { const i = I[name] * 3; return out.set(this.x[i], this.x[i + 1], this.x[i + 2]); }

  // Let go: the points start where the bones are now, moving with velocity v (world, m/s); `kick` adds a push to one part ({ at: 'head' | 'chest' |
  // 'legs' | 'pelvis', v: Vector3 }): a car takes the legs from under you, a punch snaps the head back.
  start(v, kick) {
    if (!this.ok) return false;
    const B = this.person.bones, dt = 1 / 60;
    this.person.root.updateMatrixWorld(true);
    this.person.root.parent.getWorldQuaternion(this.rootQ);
    B.Bip01.parent.getWorldQuaternion(this.parentQ);
    for (let i = 0; i < this.n; i++) { B[PTS[i][1]].getWorldPosition(_a); this.x.set([_a.x, _a.y, _a.z], i * 3); }
    // (the pose it is let go from is bent in ways the points' braces do not allow: settled into them first, so that does not set it flying)
    this.p.set(this.x); for (let it = 0; it < 12; it++) { this.solve(); this.limits(); }
    for (let i = 0; i < this.n; i++) {
      _a.set(this.x[i * 3], this.x[i * 3 + 1], this.x[i * 3 + 2]);
      let vx = v.x, vy = v.y, vz = v.z;
      if (kick) {
        const nm = PTS[i][0], k = kick.at === 'legs' ? (/^(kn|an|to)/.test(nm) ? 1 : /^hip/.test(nm) ? 0.6 : 0) : kick.at === 'head' ? (nm === 'head' ? 1 : nm === 'chest' ? 0.6 : /^sh/.test(nm) ? 0.4 : 0)
          : kick.at === 'chest' ? (nm === 'chest' || /^sh/.test(nm) ? 1 : nm === 'spine' || nm === 'head' ? 0.7 : 0) : (nm === 'pelvis' || /^hip/.test(nm) ? 1 : nm === 'spine' ? 0.6 : 0);
        vx += kick.v.x * k; vy += kick.v.y * k; vz += kick.v.z * k;
      }
      this.p.set([_a.x - vx * dt, _a.y - vy * dt, _a.z - vz * dt], i * 3);
    }
    this.active = true; this.still = 0; this.t = 0; this.dtPrev = dt; this.settled = false;
    return true;
  }

  // ground(x, z) -> height of the ground there; push(pos, r) moves a point (a Vector3) out of walls and parked cars (optional).
  step(dt, ground, push) {
    if (!this.active) return;
    this.t += dt;
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = Math.min(dt, 0.05) / n, x = this.x, p = this.p, G = -11.5;
    let maxV = 0;
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < this.n; i++) {
        const o = i * 3, damp = 0.998;
        for (let k = 0; k < 3; k++) { const cur = x[o + k], vel = (cur - p[o + k]) * damp; p[o + k] = cur; x[o + k] = cur + vel + (k === 1 ? G * h * h : 0); }
      }
      // The bones and joints, with the ground among them (so the solver does not push points into it, to be thrown out again next step).
      if (s === 0) for (let i = 0; i < this.n; i++) this.gy[i] = ground(x[i * 3], x[i * 3 + 2]) + this.r[i];      // (the ground under each point, once a frame)
      this.limits();                                                                  // (the joints' limits, gently, once a step: pushed hard they fight the bones and the ground)
      for (let it = 0; it < 8; it++) {
        this.solve();
        for (let i = 0; i < this.n; i++) { const o = i * 3, g = this.gy[i]; if (x[o + 1] < g) x[o + 1] = g; }
      }
      for (let i = 0; i < this.n; i++) {
        const o = i * 3, g = this.gy[i];
        if (x[o + 1] <= g + 0.002) {                                                   // on the ground: it stops falling, and slides to a halt
          if (p[o + 1] > x[o + 1] || p[o + 1] < x[o + 1] - 0.05) p[o + 1] = x[o + 1];
          const mu = 0.3; p[o] += (x[o] - p[o]) * mu; p[o + 2] += (x[o + 2] - p[o + 2]) * mu; p[o + 1] += (x[o + 1] - p[o + 1]) * 0.3;
        }
        if (push && i <= 3) { _a.set(x[o], x[o + 1], x[o + 2]); if (push(_a, this.r[i] + 0.05)) { p[o] += _a.x - x[o]; p[o + 2] += _a.z - x[o + 2]; x[o] = _a.x; x[o + 2] = _a.z; } }
        const vx = x[o] - p[o], vy = x[o + 1] - p[o + 1], vz = x[o + 2] - p[o + 2], v = Math.hypot(vx, vy, vz) / h;     // (no point moves faster than a body can be thrown)
        if (v > VMAX) { const k = 1 - VMAX / v; p[o] += vx * k; p[o + 1] += vy * k; p[o + 2] += vz * k; }
      }
    }
    for (let i = 0; i < 4; i++) { const o = i * 3, vx = x[o] - p[o], vy = x[o + 1] - p[o + 1], vz = x[o + 2] - p[o + 2]; maxV = Math.max(maxV, Math.hypot(vx, vy, vz) / h); }   // (the trunk and head: a hand still twitching is no matter)
    this.speed = maxV;
    // Nearly still, a while after the fall: it settles (what is left is only the joints nudging each other).
    if (this.t > 1 && maxV < 1.5) { const k = clamp((1.5 - maxV) / 1.5, 0, 1) * 0.25; for (let i = 0; i < this.n * 3; i++) p[i] += (x[i] - p[i]) * k; }
    this.still = maxV < 0.5 ? this.still + dt : 0;
    if ((this.still > 0.4 && this.t > 0.8) || this.t > 4.5) this.settled = true;
  }
  solve() {
    const x = this.x, w = this.w;
    const fix = (a, b, target, l, dx, dy, dz) => {
      const wa = w[a], wb = w[b], k = (l - target) / (l * (wa + wb)), oa = a * 3, ob = b * 3;
      x[oa] += dx * k * wa; x[oa + 1] += dy * k * wa; x[oa + 2] += dz * k * wa; x[ob] -= dx * k * wb; x[ob + 1] -= dy * k * wb; x[ob + 2] -= dz * k * wb;
    };
    for (const [a, b, len] of this.rigid) {
      const oa = a * 3, ob = b * 3, dx = x[ob] - x[oa], dy = x[ob + 1] - x[oa + 1], dz = x[ob + 2] - x[oa + 2], l = Math.hypot(dx, dy, dz) || 1e-6;
      fix(a, b, len, l, dx, dy, dz);
    }
    for (const [a, b, lo, hi] of this.range) {
      const oa = a * 3, ob = b * 3, dx = x[ob] - x[oa], dy = x[ob + 1] - x[oa + 1], dz = x[ob + 2] - x[oa + 2], l = Math.hypot(dx, dy, dz) || 1e-6;
      if (l < lo) fix(a, b, lo, l, dx, dy, dz); else if (l > hi) fix(a, b, hi, l, dx, dy, dz);
    }
  }
  // The joints: each knee bends only forward; each thigh stays within a cone (not far back, not up through the belly, not across the other leg); the head
  // stays within 60 degrees of the line of the chest.
  limits() {
    this.frame('pelvis', 'spine', 'hipL', 'hipR');
    for (const s of ['L', 'R']) {
      const hip = this.get('hip' + s, _a), kn = this.get('kn' + s, _b), an = this.get('an' + s, _c), side = s === 'L' ? 1 : -1;
      // The thigh's cone.
      _d.copy(kn).sub(hip); const L = _d.length() || 1e-6; _d.multiplyScalar(1 / L);
      let dl = _d.dot(_lat) * side, du = _d.dot(_up), df = _d.dot(_fwd), bad = false;
      if (df < -0.45) { df = -0.45; bad = true; }
      const upMax = -0.15 + 0.85 * Math.max(0, df); if (du > upMax) { du = upMax; bad = true; }
      if (dl < -0.3) { dl = -0.3; bad = true; } else if (dl > 0.8) { dl = 0.8; bad = true; }
      if (bad) { _d.set(0, 0, 0).addScaledVector(_lat, dl * side).addScaledVector(_up, du).addScaledVector(_fwd, df).normalize(); _e.copy(hip).addScaledVector(_d, L); kn.lerp(_e, 0.3); this.set('kn' + s, kn); }
      // The knee: if it has bent backwards, it is turned over to the front of the line from hip to ankle.
      _e.copy(kn).sub(hip); _f.copy(an).sub(kn);
      const bend = _e.clone().cross(_f).dot(_lat) / ((_e.length() * _f.length()) || 1e-6);
      if (bend < -0.1) {
        _d.copy(an).sub(hip); const dl2 = _d.lengthSq() || 1e-6, t = _e.dot(_d) / dl2; _f.copy(hip).addScaledVector(_d, t);       // the foot of the knee on that line
        kn.sub(_f); kn.multiplyScalar(0.6).add(_f); kn.addScaledVector(_fwd, 0.01); this.set('kn' + s, kn);                   // (eased back towards straight)
      }
    }
    // The neck.
    this.frame('spine', 'chest', 'shL', 'shR');
    const ch = this.get('chest', _a), hd = this.get('head', _b); _d.copy(hd).sub(ch); const L = _d.length() || 1e-6; _d.multiplyScalar(1 / L);
    const du = _d.dot(_up); if (du < 0.5) { _d.addScaledVector(_up, 0.5 - du).normalize(); _e.copy(ch).addScaledVector(_d, L); hd.lerp(_e, 0.35); this.set('head', hd); }
  }
  // (a point put back within its joint's limits: its previous position moves with it, so the correction does not turn into speed)
  set(name, v) { const i = I[name] * 3, x = this.x, p = this.p; for (let k = 0; k < 3; k++) { const d = v.getComponent(k) - x[i + k]; p[i + k] += d * 0.85; x[i + k] += d; } }
  // A body frame from points: up from a to b, the side from r to l, ahead = side x up (into _lat, _up, _fwd).
  frame(a, b, l, r) {
    this.get(b, _up).sub(this.get(a, _c)).normalize(); this.get(l, _lat).sub(this.get(r, _c));
    _lat.addScaledVector(_up, -_lat.dot(_up)).normalize(); _fwd.crossVectors(_lat, _up);
  }

  // Turn the bones to lie along the points. The person's root (and its parent, the walker's figure) must be placed first: worldX/worldQ of the
  // parents are read from the scene.
  apply() {
    if (!this.ok) return;
    const P = this.person, B = P.bones, R = this.rest, W = this.W, rq = this.rootQ;
    P.root.parent.getWorldQuaternion(rq); B.Bip01.parent.getWorldQuaternion(this.parentQ);
    const rw = (v, out) => out.copy(v).applyQuaternion(rq);                      // a rest direction, in the world
    const v0 = _c, v1 = _d;
    // The hips and the chest.
    this.frame('pelvis', 'spine', 'hipL', 'hipR'); aim(rw(R.pelvisUp, v0), rw(R.pelvisLat, v1), _up, _lat, _Rp);
    const pelUp = _up.clone(), pelLat = _lat.clone(), pelFwd = _fwd.clone();
    this.frame('spine', 'chest', 'shL', 'shR'); aim(rw(R.chestUp, v0), rw(R.chestLat, v1), _up, _lat, _Rc);
    const chLat = _lat.clone();
    const restW = n => _q2.copy(rq).multiply(P.rest[n].R);
    W.Bip01.copy(_Rp).multiply(restW('Bip01')); W.Bip01_Pelvis.copy(_Rp).multiply(restW('Bip01_Pelvis'));
    W.Bip01_Spine.copy(_q.copy(_Rp).slerp(_Rc, 0.33)).multiply(restW('Bip01_Spine')); W.Bip01_Spine1.copy(_q.copy(_Rp).slerp(_Rc, 0.67)).multiply(restW('Bip01_Spine1'));
    W.Bip01_Spine2.copy(_Rc).multiply(restW('Bip01_Spine2')); W.Bip01_L_Clavicle.copy(_Rc).multiply(restW('Bip01_L_Clavicle')); W.Bip01_R_Clavicle.copy(_Rc).multiply(restW('Bip01_R_Clavicle'));
    // The neck and head.
    const nd = this.get('head', new THREE.Vector3()).sub(this.get('chest', _a)); aim(rw(R.neck, v0), rw(R.chestLat, v1), nd, chLat, _Rn);
    W.Bip01_Neck.copy(_Rn).multiply(restW('Bip01_Neck')); W.Bip01_Head.copy(_Rn).multiply(restW('Bip01_Head'));
    // Arms and legs: each segment along its points, its side along the hinge of the elbow or knee (or, held straight, as the body turned).
    const limb = (s, up, lo, end, dU0, dL0, h0, base, upper, lower, hand, leg) => {
      const a = this.get(up + s, new THREE.Vector3()), b = this.get(lo + s, new THREE.Vector3()), c = this.get(end + s, new THREE.Vector3());
      const dU = b.clone().sub(a), dL = c.clone().sub(b), hc = new THREE.Vector3().crossVectors(dU.clone().normalize(), dL.clone().normalize());
      const fb = rw(h0, new THREE.Vector3()).applyQuaternion(base), k = clamp((hc.length() - 0.08) / 0.3, 0, 1);
      const hinge = fb.multiplyScalar(1 - k).addScaledVector(hc.normalize(), k);
      aim(rw(dU0, v0), rw(h0, v1), dU, hinge, _Rr); W[upper].copy(_Rr).multiply(restW(upper));
      aim(rw(dL0, v0), rw(h0, v1), dL, hinge, _Rr); W[lower].copy(_Rr).multiply(restW(lower)); if (hand) W[hand].copy(_Rr).multiply(restW(hand));
      if (leg) { const to = this.get('to' + s, new THREE.Vector3()).sub(c); aim(rw(R['ft' + s], v0), rw(h0, v1), to, hinge, _Rr); W[`Bip01_${s}_Foot`].copy(_Rr).multiply(restW(`Bip01_${s}_Foot`)); W[`Bip01_${s}_Toe0`].copy(_Rr).multiply(restW(`Bip01_${s}_Toe0`)); }
    };
    for (const s of ['L', 'R']) {
      limb(s, 'sh', 'el', 'hd', R['ua' + s], R['fa' + s], R['armH' + s], _Rc, `Bip01_${s}_UpperArm`, `Bip01_${s}_Forearm`, `Bip01_${s}_Hand`, false);
      limb(s, 'hip', 'kn', 'an', R['th' + s], R['ca' + s], R['legH' + s], _Rp, `Bip01_${s}_Thigh`, `Bip01_${s}_Calf`, null, true);
    }
    // World turns into local ones, parents first; the hip bone goes where the pelvis point is.
    for (const e of P.order) {
      const w = W[e.name]; if (!w) continue;
      const parentW = e.parent ? W[e.parent] : this.parentQ;
      e.b.quaternion.copy(parentW).invert().multiply(w);
    }
    this.get('pelvis', _a); B.Bip01.parent.worldToLocal(_a); B.Bip01.position.copy(_a);
    this.pelvisFwd = pelFwd; this.pelvisUp = pelUp; this.pelvisLat = pelLat;
  }
  // How the body lies, once still: 'back', 'front' or 'side', and the way the head points from the hips (yaw, radians, world).
  lying() {
    this.frame('pelvis', 'chest', 'shL', 'shR');
    const up = _fwd.y, head = this.get('head', _a).sub(this.get('pelvis', _b));
    return { how: up > 0.45 ? 'back' : up < -0.45 ? 'front' : 'side', yaw: Math.atan2(head.x, head.z), pelvis: this.get('pelvis', new THREE.Vector3()) };
  }
}
