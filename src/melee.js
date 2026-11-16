// Hand to hand: punches (a jab with the left, a cross with the right, one after the other as long as you keep pressing), a kick, and a knife (a slash, then
// a stab, then a slash). A blow starts, swings (person.js turns the swing into poses: `walker.melee` is the pose), and lands at one moment in the middle of it:
// whatever is in front of you, within reach and in the arc, takes the hit. What can be hit: the people on the pavement (they go down and the
// crowd scatters), the police officers on foot, and the actors in a shop or bank (shopkeepers, guards: see heist.js). Inside a room only the
// room's own people and glass cases can be hit (the room is a stage high above the map, and the street carries on underneath it).
//
// A target (from `env.targets()`) is { x, z, y, hit(damage, info), kind }. The pedestrians and the officers are looked up here.
import { clamp, lerp, wrapAngle } from './util.js';

// clip: the recorded move it plays (moves.js: real boxers' and fighters' motion), at `rate` times its speed; the blow lands at the clip's own moment of impact.
// (Without the real person or the moves, the old swing worked out in code is used: `dur` and `hit` are for that.) Fists go jab, cross, hook, then a big
// haymaker that puts people down, as long as you keep pressing; kicks go a street kick, then a high roundhouse.
export const MOVES = {
  jab:      { clip: 'jab', rate: 1.35, dur: 0.30, hit: 0.40, reach: 1.30, arc: 0.95, dmg: 9, knock: 0, hand: 'left', sound: 0.34, tired: 0.05 },
  cross:    { clip: 'cross', rate: 1.3, dur: 0.36, hit: 0.42, reach: 1.40, arc: 0.95, dmg: 15, knock: 0.4, hand: 'right', sound: 0.5, tired: 0.08 },
  hook:     { clip: 'hook', rate: 1.25, dur: 0.40, hit: 0.45, reach: 1.45, arc: 1.05, dmg: 18, knock: 0.6, hand: 'right', sound: 0.55, tired: 0.1, as: 'cross' },
  haymaker: { clip: 'haymaker', rate: 1.2, dur: 0.5, hit: 0.5, reach: 1.5, arc: 1.0, dmg: 26, knock: 1, hand: 'right', sound: 0.7, tired: 0.25, as: 'cross' },
  kick:     { clip: 'kick', rate: 1.25, dur: 0.58, hit: 0.46, reach: 1.75, arc: 0.85, dmg: 24, knock: 1, hand: null, sound: 0.7, tired: 0.2 },
  roundhouse: { clip: 'roundhouse', rate: 1.2, dur: 0.6, hit: 0.46, reach: 1.9, arc: 1.1, dmg: 30, knock: 1, hand: null, sound: 0.8, tired: 0.3, as: 'kick' },
  sidekick: { clip: 'sidekick', rate: 1.2, dur: 0.6, hit: 0.46, reach: 1.9, arc: 0.8, dmg: 28, knock: 1, hand: null, sound: 0.8, tired: 0.3, as: 'kick' },
  slash:    { dur: 0.40, hit: 0.40, reach: 1.55, arc: 1.15, dmg: 26, knock: 0, hand: 'right', sound: 0.4, tired: 0.04, blade: true },
  stab:     { dur: 0.36, hit: 0.42, reach: 1.75, arc: 0.6, dmg: 42, knock: 0.2, hand: 'right', sound: 0.4, tired: 0.06, blade: true },
};
const NEXT = { jab: 'cross', cross: 'hook', hook: 'haymaker', haymaker: 'jab', kick: 'roundhouse', roundhouse: 'sidekick', sidekick: 'kick', slash: 'stab', stab: 'slash' };

export class Melee {
  // env: { walker, camera yaw (yaw()), peds, officers (list + damage), audio, hud, fx, crime (kind), shake, targets (extra: () => array), active () }
  constructor(env) {
    this.env = env; this.move = null; this.t = 0; this.done = false; this.queued = null; this.next = { fist: 'jab', knife: 'slash', kick: 'kick' }; this.cool = 0; this.comboT = 0; this.hitT = 0; this.clip = false;
    this.pose = null;                                                                        // { kind, k (0..1 through the blow), hand } for the animation, or null
    this.landed = 0; this.swung = 0;                                                         // (counted for the tests and the HUD)
  }
  get busy() { return !!this.move; }
  // Ask for a blow. `style` is 'fist' (the arms, in turn) or 'knife'. A blow asked for in the last part of the one in progress is kept and thrown next.
  attack(style) {
    const w = this.env.walker; if (!w.active || w.down > 0.3 || w.air) return false;
    if (this.move) { if (this.t > (this.clip ? 0.12 : this.move.dur * 0.5)) this.queued = style; return false; }
    if (this.cool > 0) return false;
    if (this.comboT <= 0) this.next[style] = style === 'knife' ? 'slash' : 'jab';                // (a fresh start after a pause)
    const kind = this.next[style]; this.begin(kind, style); return true;
  }
  kick() {
    const w = this.env.walker; if (!w.active || w.down > 0.3 || w.air) return false;
    if (this.move) { if (this.t > (this.clip ? 0.12 : this.move.dur * 0.5)) this.queued = 'kick'; return false; }
    if (this.cool > 0) return false;
    if (this.comboT <= 0) this.next.kick = 'kick';
    this.begin(this.next.kick, 'kick'); return true;
  }
  begin(kind, style) {
    const w = this.env.walker;
    if (!MOVES[kind].clip || !(w.body && w.body.ready(MOVES[kind].clip))) kind = MOVES[kind].as || (kind === 'hook' || kind === 'haymaker' ? 'cross' : kind === 'roundhouse' || kind === 'sidekick' ? 'kick' : kind);   // (the old swings: there is no hook or roundhouse among them)
    const m = MOVES[kind];
    this.move = m; this.kind = kind; this.style = style; this.t = 0; this.done = false; this.swung++;
    this.next[style] = NEXT[kind] || kind;
    if (style === 'fist' && !(w.body && w.body.ready('hook')) && kind === 'cross') this.next.fist = 'jab';
    this.comboT = 1.1;
    this.clip = !!(m.clip && w.play(m.clip, { rate: m.rate * (1 + 0.02 * this.power()), fade: 0.08, out: 0.25, onHit: () => { if (this.move === m && !this.done) { this.done = true; this.land(m); } } }));
    // Turn to face what is being hit: the nearest thing in front (within 70 degrees of where the camera looks), else the way the camera looks.
    const cam = this.env.yaw(), t = this.nearest(w.x, w.z, cam, 2.6, 1.25);
    w.meleeYaw = t ? Math.atan2(t.x - w.x, t.z - w.z) : cam;
    this.env.audio.swish && this.env.audio.swish(m.sound);
  }
  // The closest target within `reach` of (x, z) and within `arc` radians of `yaw` (or null).
  nearest(x, z, yaw, reach, arc) {
    let best = null, bd = 1e9;
    this.each((t, tx, tz) => {
      const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz); if (d > reach) return;
      if (Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw)) > arc) return;
      if (d < bd) { bd = d; best = t; }
    });
    return best ? { x: best.x, z: best.z, t: best } : null;
  }
  // Every target the blow could land on: calls fn(target, x, z).
  each(fn) {
    const { peds, officers, brawl } = this.env;
    if (!this.env.walker.interior) {                                    // (a room is a stage of its own, high above the map: the people of the street below it are not in reach)
      if (peds) for (const p of peds.list) { if (p.state === 'down' || p.state === 'away') continue; fn(p, p.x, p.z, 'ped'); }
      if (brawl) for (const b of brawl.list) { if (!b.alive) continue; fn(b, b.x, b.z, 'brawler'); }
      if (officers) for (const o of officers.list) { if (o.dead) continue; fn(o, o.walker.x, o.walker.z, 'officer'); }
    }
    const extra = this.env.targets && this.env.targets();
    if (extra) for (const a of extra) { if (a.alive === false) continue; fn(a, a.x, a.z, 'actor'); }
  }
  update(dt) {
    const w = this.env.walker; this.cool = Math.max(0, this.cool - dt); this.comboT = Math.max(0, this.comboT - dt); this.hitT = Math.max(0, this.hitT - dt);
    if (!this.move) { this.pose = w.melee = null; w.meleeYaw = null; return; }
    if (w.down > 0.3) { this.move = null; this.pose = w.melee = null; w.meleeYaw = null; return; }          // knocked flat in the middle of a blow
    const m = this.move; this.t += dt;
    if (this.clip) {                                                                         // a recorded blow: the walker plays it, and it lands at its own moment
      const a = w.body && w.body.act; this.pose = w.melee = null;
      if (!a || a.c.name !== m.clip) { this.move = null; this.cool = m.tired; this.next1(); return; }
      if (this.queued && this.done && a.t > a.hits[a.hits.length - 1] + 0.1) { this.move = null; this.next1(); return; }   // the next blow cuts in once this one has landed
      return;
    }
    const k = clamp(this.t / m.dur, 0, 1);
    this.pose = w.melee = { kind: this.kind, k, hit: m.hit, hand: m.hand, blade: !!m.blade };
    if (!this.done && k >= m.hit) { this.done = true; this.land(m); }
    if (k >= 1) {
      this.move = null; this.pose = w.melee = null; this.cool = m.tired;
      if (this.queued) { const q = this.queued; this.queued = null; this.cool = 0; if (q === 'kick') this.kick(); else this.attack(q); }
      else w.meleeYaw = null;
    }
  }
  next1() {
    const w = this.env.walker;
    if (this.queued) { const q = this.queued; this.queued = null; this.cool = 0; if (q === 'kick') this.kick(); else this.attack(q); }
    else w.meleeYaw = null;
  }
  // The moment of the blow: everything within reach and arc in front of the character is hit.
  // Strength, built up in a gym (gym.js): 0 to 10. Each level makes a blow 30% harder and throws people further; at 10 a kick kills.
  power() { return this.env.power ? this.env.power() : 0; }
  land(m) {
    const w = this.env.walker, { fx, audio } = this.env, yaw = w.meleeYaw ?? w.h; let hit = 0;
    const P = this.power(), kick = /kick|roundhouse/.test(this.kind), lethal = kick && P >= 10 && !m.blade, power = 1 + 0.3 * P;
    const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw), y = w.y + (/kick|roundhouse/.test(this.kind) ? 0.9 : 1.35);
    const strikes = [];
    this.each((t, tx, tz, type) => {
      const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz); if (d > m.reach + 0.35) return;
      if (d > 0.5 && Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw)) > m.arc) return;
      strikes.push({ t, type, d, dx, dz });
    });
    strikes.sort((a, b) => a.d - b.d);
    for (const s of strikes.slice(0, m.knock >= 0.9 ? 2 : 1)) {                                // (a kick can catch two people; the rest hit one)
      const n = Math.hypot(s.dx, s.dz) || 1, dir = { x: s.dx / n, z: s.dz / n }, info = { dmg: lethal ? 9999 : m.dmg * (m.blade ? 1 : power), knock: m.blade ? m.knock : Math.min(1, m.knock + 0.07 * P), blade: !!m.blade, kind: this.kind, dir, from: w, power: m.blade ? 0 : P, lethal };
      this.strike(s, info); hit++;
      fx && fx.puff && fx.puff(w.x + dir.x * 0.9, y, w.z + dir.z * 0.9, dir.x * 1.2, 0.4, dir.z * 1.2, 0.18, 0.5, m.blade ? 0.5 : 0.7, 0.2, 0.9);
    }
    if (hit) { this.landed++; this.hitT = 0.2; if (m.blade && audio.slice) audio.slice(); else audio.thump(Math.min(1, 0.28 + m.knock * 0.3 + P * 0.04)); if (this.env.shake) this.env.shake(0.04 + m.knock * 0.08 + P * 0.012); }
    else if (this.env.walls && this.env.walls(w.x + fwdX * (m.reach + 0.2), w.z + fwdZ * (m.reach + 0.2))) audio.clang && audio.clang(m.blade ? 3 : 1);
  }
  strike(s, info) {
    const { peds, officers, crime } = this.env, t = s.t;
    if (s.type === 'ped') {
      const p = t;
      if (p.kind && p.kind !== 'civ') {                                                              // an armed man, or a big one: he is not going down, he is going to fight
        const b = peds.provoke(p, info);
        if (b) { b.hit(info.dmg, info); peds.scare(b.x, b.z, 22, 5); if (crime) crime('assault', info.blade ? 2 : 1); return; }
      }
      const fling = 1 + 0.15 * (info.power || 0) + (info.lethal ? 0.8 : 0);                          // (strength throws people further)
      p.state = 'down'; p.downT = 1.6 + info.knock * 1.2; p.vx = info.dir.x * (1.5 + info.knock * 3) * fling; p.vz = info.dir.z * (1.5 + info.knock * 3) * fling; p.vy = (1.6 + info.knock * 1.5) * Math.min(1.8, fling); p.lie = 0; p.at = /kick|roundhouse/.test(info.kind) ? 'chest' : 'head';
      if (info.lethal) { p.dead = true; p.downT = 25; this.env.hud.toast('ONE KICK', 0.9); }
      peds.scare(p.x, p.z, 22, 5); if (crime) crime('assault', info.blade ? 2 : 1);
    } else if (s.type === 'officer') {
      const killed = officers.damage(t, info.dmg, false), fl = 4 * (1 + 0.15 * (info.power || 0)) + (info.lethal ? 3 : 0);
      if (info.knock > 0.8 || killed) t.walker.knockDown(info.dir.x * fl, info.dir.z * fl, { at: info.kind === 'haymaker' ? 'head' : 'chest' }); else if (!killed) { const w2 = t.walker; w2.flinch(info.dir.x, info.dir.z, 0.6 + info.knock, !/kick|roundhouse/.test(info.kind)); if (info.dir.x * Math.sin(w2.h) + info.dir.z * Math.cos(w2.h) > 0.5) w2.play('stumble', { fade: 0.08, out: 0.3, rate: 1.1 }); }
      if (killed) { this.env.hud.toast('OFFICER DOWN', 1.1); this.env.heat && this.env.heat(0.3); } else this.env.heat && this.env.heat(0.03);
    } else if (t.hit) t.hit(info.dmg, info);
  }
}
