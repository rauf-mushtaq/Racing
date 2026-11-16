// A real person's body in motion: the recorded moves (moves.js) played over walking and running, the ragdoll (ragdoll.js) when knocked over, the
// recorded get-up that follows it, and a flinch when hit. Used by the walkers (the player, the officers, the fighters: walker.js) and by the real people
// on the pavements (peds.js). The owner keeps the position and the heading; this moves them along a move's path (so planted feet stay planted) and, in
// a ragdoll, to where the body has gone.
//
//   play(name, { rate, fade, out, from, legs, onHit(i), onEnd() })  a move; the one before fades out under it
//   knock(v, kick, keep)   let the body go (v: world velocity; kick: { at, v } a push on one part); keep: it stays down (dead)
//   tick(dt, owner)        before posing: advances the moves (the owner's x, z move along the move's path; h is its heading)
//   pose(B, o)             the pose: o as Person.poseMocap's, the moves laid over it, the flinch on top
import * as THREE from 'three';
import { Moves } from './moves.js';
import { Ragdoll } from './ragdoll.js';
import { clamp } from './util.js';

const XZ0 = new Float32Array(2), XZ1 = new Float32Array(2), _q = new THREE.Quaternion(), _ax = new THREE.Vector3(), _v = new THREE.Vector3();
export const GETUPS = { back: 'getup_back', front: 'getup_front', side: 'getup_side' };

export class Body {
  constructor(person) {
    this.person = person; this.rag = null; this.act = null; this.old = null; this.snap = null; this.snapW = 0; this.snapFade = 0.4;
    this.ragOn = false; this.dead = false; this.fl = { p: 0, vp: 0, r: 0, vr: 0, y: 0, vy: 0, head: 0 };
    this.acts = [null, null]; this.snapO = { pose: null, w: 0 };
  }
  get acting() { return !!this.act; }
  get name() { return this.act ? this.act.name : null; }
  ready(name) { return Moves.ready && !!Moves.clips[name]; }

  play(name, o = {}) {
    const c = Moves.get(name); if (!c) return false;
    if (this.act) { this.old = this.act; this.old.fadeT = 0; this.old.fadeDur = o.fade ?? 0.12; }
    const t0 = o.from || 0;
    this.act = { name, c, t: t0, rate: o.rate || 1, fade: o.fade ?? 0.12, out: o.out ?? 0.22, legs: o.legs !== false, w: 0, hits: c.hit.slice(), hitI: 0, onHit: o.onHit || null, onEnd: o.onEnd || null, lock: o.lock !== false, root: o.root !== false, xz: [0, 0], loop: c.loop, upright: o.upright, age: 0 };
    while (this.act.hitI < this.act.hits.length && this.act.hits[this.act.hitI] < t0) this.act.hitI++;
    sampleXZ(c, t0, XZ0); this.act.xz[0] = XZ0[0]; this.act.xz[1] = XZ0[1];
    return true;
  }
  stop(out = 0.2) { if (!this.act) return; this.old = this.act; this.old.fadeT = 0; this.old.fadeDur = out; this.act = null; }

  // owner: { x, z, h, scale (how much bigger than the motion's actor) }. Returns true while a move is being played.
  tick(dt, owner) {
    const a = this.act;
    if (this.old) { this.old.fadeT += dt; this.old.t += dt * this.old.rate; if (this.old.fadeT >= this.old.fadeDur) this.old = null; }
    if (this.snapW > 0) this.snapW = Math.max(0, this.snapW - dt / this.snapFade);
    if (!a) return false;
    a.age += dt;
    const prevT = a.t; a.t += dt * a.rate;
    // Blows landing.
    while (a.hitI < a.hits.length && a.t >= a.hits[a.hitI]) { const i = a.hitI++; if (a.onHit) a.onHit(i); if (this.act !== a) return !!this.act; }
    // Along the move's path.
    if (a.root && !a.loop) {
      const c = a.c, k = owner.scale || 1; sampleXZ(c, Math.min(a.t, c.dur), XZ1);
      const dx = (XZ1[0] - a.xz[0]) * k, dz = (XZ1[1] - a.xz[1]) * k; a.xz[0] = XZ1[0]; a.xz[1] = XZ1[1];
      const s = Math.sin(owner.h), co = Math.cos(owner.h); owner.x += dx * co + dz * s; owner.z += -dx * s + dz * co;
    }
    // In and out.
    const c = a.c, fin = a.loop ? 1 : clamp((c.dur - a.t) / Math.max(0.01, a.out), 0, 1);
    a.w = Math.min(a.fade > 0 ? clamp(a.age / a.fade, 0, 1) : 1, fin);
    if (!a.loop && a.t >= c.dur) { this.act = null; if (a.onEnd) a.onEnd(); }
    return true;
  }

  // Knocked over: the body is let go. Returns false if this person has no ragdoll (the owner falls back on the old fall).
  knock(v, kick, keep = false) {
    if (!this.rag) this.rag = new Ragdoll(this.person);
    if (!this.rag.ok) return false;
    if (this.ragOn) { this.push(v, kick); this.dead = this.dead || keep; return true; }
    this.act = null; this.old = null; this.snapW = 0;
    this.rag.start(v, kick); this.ragOn = true; this.dead = keep; return true;
  }
  // A push on a body already down (a shot, a kick).
  push(v, kick) {
    const R = this.rag; if (!R || !this.ragOn) return; const dt = 1 / 60;
    for (let i = 0; i < R.n; i++) { const o = i * 3; R.p[o] -= v.x * dt * 0.5; R.p[o + 1] -= v.y * dt * 0.5; R.p[o + 2] -= v.z * dt * 0.5; }
    if (kick) { const near = kick.at === 'head' ? [3, 2] : kick.at === 'legs' ? [12, 13, 14, 15] : [0, 1, 2]; for (const i of near) { const o = i * 3; R.p[o] -= kick.v.x * dt; R.p[o + 1] -= kick.v.y * dt; R.p[o + 2] -= kick.v.z * dt; } }
    R.settled = false; R.still = 0; R.t = Math.min(R.t, 1);
  }
  // Every frame while knocked over: the points move; the owner's x, z follow the hips (call with the owner's figure placed, then posed by ragApply).
  ragStep(dt, ground, push) { if (this.ragOn && !(this.dead && this.rag.settled)) this.rag.step(dt, ground, push); }
  ragApply() { if (this.ragOn) this.rag.apply(); }
  get settled() { return this.ragOn && this.rag.settled; }
  pelvis(out) { return this.rag.get('pelvis', out); }
  // Up again: the get-up that matches how the body lies. Returns { h, x, z } (where the owner should now stand and face) or null.
  getUp(hurt = false) {
    if (!this.ragOn) return null;
    const L = this.rag.lying(), name = hurt && L.how !== 'front' ? 'getup_hurt' : GETUPS[L.how], c = Moves.get(name);
    this.snap = this.person.snapshot(this.snap); this.ragOn = false;
    if (!c) { this.snapW = 0; return null; }
    const h = L.yaw - c.lie[0];
    this.play(name, { fade: 0, out: 0.35 }); this.snapW = 1; this.snapFade = 0.55;
    return { h, x: L.pelvis.x, z: L.pelvis.z };
  }

  // Hit: a flinch (the body rocks back or sideways and the head snaps, then it springs back). (dx, dz): the way the blow travels, in the world; h the heading.
  flinch(dx, dz, k, h, head = false) {
    const f = dx * Math.sin(h) + dz * Math.cos(h), s = dx * Math.cos(h) - dz * Math.sin(h), F = this.fl;
    F.vp += f * k * 9; F.vr += -s * k * 7; F.vy += s * k * 5; F.head = Math.max(F.head, head ? 1 : 0.4);
  }
  springs(dt) {
    const F = this.fl, K = 140, D = 15, n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) { F.vp += (-K * F.p - D * F.vp) * h; F.p += F.vp * h; F.vr += (-K * F.r - D * F.vr) * h; F.r += F.vr * h; F.vy += (-K * F.y - D * F.vy) * h; F.y += F.vy * h; }
    F.head = Math.max(0, F.head - dt * 1.5);
    F.p = clamp(F.p, -0.7, 0.7); F.r = clamp(F.r, -0.6, 0.6); F.y = clamp(F.y, -0.6, 0.6);
  }

  // o: Person.poseMocap's options (the walking, the stick figure's part). The moves and the kept pose are laid over it, then the flinch.
  pose(B, o, dt) {
    const P = this.person;
    if (this.ragOn) { this.ragApply(); return; }
    const A = this.acts; A[0] = this.old ? { c: this.old.c, t: this.old.t, w: this.old.w * (1 - clamp(this.old.fadeT / this.old.fadeDur, 0, 1)), legs: this.old.legs } : null;
    A[1] = this.act ? { c: this.act.c, t: this.act.t, w: this.act.w, legs: this.act.legs } : null;
    o.acts = A; this.snapO.pose = this.snap; this.snapO.w = this.snapW > 0 ? this.snapW * this.snapW * (3 - 2 * this.snapW) : 0; o.snap = this.snapO;
    P.poseMocap(B, o);
    this.springs(dt || 1 / 60);
    const F = this.fl;
    if (Math.abs(F.p) + Math.abs(F.r) + Math.abs(F.y) > 0.002) {
      // Turned about the body's own axes (x to its left: rocking back is a turn about +x; z ahead: leaning sideways), spread up the spine to the head.
      for (const [n, k, hk] of [['Bip01_Spine1', 0.25, 0], ['Bip01_Spine2', 0.35, 0], ['Bip01_Neck', 0.2, 0.4], ['Bip01_Head', 0.2, 0.9]]) {
        const b = P.bones[n], e = P.rest[n]; if (!b || !e) continue;
        const pr = e.parent ? P.rest[e.parent].R : null, m = k + hk * F.head;
        _q.setFromAxisAngle(_ax.set(1, 0, 0), F.p * m); if (pr) _rot(_q, pr); b.quaternion.premultiply(_q);
        _q.setFromAxisAngle(_ax.set(0, 0, 1), F.r * m); if (pr) _rot(_q, pr); b.quaternion.premultiply(_q);
        _q.setFromAxisAngle(_ax.set(0, 1, 0), F.y * m); if (pr) _rot(_q, pr); b.quaternion.premultiply(_q);
      }
    }
  }
}
// A turn about an axis of the character's frame, made into one about the same axis in a bone's parent's frame (taken at rest).
const _pi = new THREE.Quaternion();
function _rot(q, parentRest) { _pi.copy(parentRest).invert(); _v.set(q.x, q.y, q.z).applyQuaternion(_pi); q.x = _v.x; q.y = _v.y; q.z = _v.z; return q; }
function sampleXZ(c, t, out) { const n = c.frames, f = Math.min(n - 1, Math.max(0, t * 30)), i = Math.min(n - 2, Math.floor(f)), a = f - i; for (let k = 0; k < 2; k++) out[k] = c.root[i * 2 + k] + (c.root[(i + 1) * 2 + k] - c.root[i * 2 + k]) * a; }
