// Hand to hand: punches (a jab with the left, a cross with the right, one after the other as long as you keep pressing), a kick, and a knife (a slash, then
// a stab, then a slash). A blow starts, swings (person.js turns the swing into poses: `walker.melee` is the pose), and lands at one moment in the middle of it:
// whatever is in front of you, within reach and in the arc, takes the hit. What can be hit: the people on the pavement (they go down and the
// crowd scatters), the police officers on foot, and the actors in a shop or bank (shopkeepers, guards: see heist.js).
//
// A target (from `env.targets()`) is { x, z, y, hit(damage, info), kind }. The pedestrians and the officers are looked up here.
import { clamp, lerp, wrapAngle } from './util.js';

export const MOVES = {
  jab:   { dur: 0.30, hit: 0.40, reach: 1.30, arc: 0.95, dmg: 9, knock: 0, hand: 'left', sound: 0.34, tired: 0.05 },
  cross: { dur: 0.36, hit: 0.42, reach: 1.40, arc: 0.95, dmg: 15, knock: 0.4, hand: 'right', sound: 0.5, tired: 0.08 },
  kick:  { dur: 0.58, hit: 0.46, reach: 1.75, arc: 0.85, dmg: 24, knock: 1, hand: null, sound: 0.7, tired: 0.2 },
  slash: { dur: 0.40, hit: 0.40, reach: 1.55, arc: 1.15, dmg: 26, knock: 0, hand: 'right', sound: 0.4, tired: 0.04, blade: true },
  stab:  { dur: 0.36, hit: 0.42, reach: 1.75, arc: 0.6, dmg: 42, knock: 0.2, hand: 'right', sound: 0.4, tired: 0.06, blade: true },
};

export class Melee {
  // env: { walker, camera yaw (yaw()), peds, officers (list + damage), audio, hud, fx, crime (kind), shake, targets (extra: () => array), active () }
  constructor(env) {
    this.env = env; this.move = null; this.t = 0; this.done = false; this.queued = null; this.next = { fist: 'jab', knife: 'slash' }; this.cool = 0; this.comboT = 0; this.hitT = 0;
    this.pose = null;                                                                        // { kind, k (0..1 through the blow), hand } for the animation, or null
    this.landed = 0; this.swung = 0;                                                         // (counted for the tests and the HUD)
  }
  get busy() { return !!this.move; }
  // Ask for a blow. `style` is 'fist' (the arms, in turn) or 'knife'. A blow asked for in the last part of the one in progress is kept and thrown next.
  attack(style) {
    const w = this.env.walker; if (!w.active || w.down > 0.3 || w.air) return false;
    if (this.move) { if (this.t > this.move.dur * 0.5) this.queued = style; return false; }
    if (this.cool > 0) return false;
    if (this.comboT <= 0) this.next[style] = style === 'knife' ? 'slash' : 'jab';                // (a fresh start after a pause)
    const kind = this.next[style]; this.begin(kind, style); return true;
  }
  kick() {
    const w = this.env.walker; if (!w.active || w.down > 0.3 || w.air) return false;
    if (this.move) { if (this.t > this.move.dur * 0.5) this.queued = 'kick'; return false; }
    if (this.cool > 0) return false;
    this.begin('kick', 'kick'); return true;
  }
  begin(kind, style) {
    const m = MOVES[kind], w = this.env.walker;
    this.move = m; this.kind = kind; this.style = style; this.t = 0; this.done = false; this.swung++;
    if (style === 'fist') this.next.fist = kind === 'jab' ? 'cross' : 'jab';
    else if (style === 'knife') this.next.knife = kind === 'slash' ? 'stab' : 'slash';
    this.comboT = 1.1;
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
    if (peds) for (const p of peds.list) { if (p.state === 'down' || p.state === 'away') continue; fn(p, p.x, p.z, 'ped'); }
    if (brawl) for (const b of brawl.list) { if (!b.alive) continue; fn(b, b.x, b.z, 'brawler'); }
    if (officers) for (const o of officers.list) { if (o.dead) continue; fn(o, o.walker.x, o.walker.z, 'officer'); }
    const extra = this.env.targets && this.env.targets();
    if (extra) for (const a of extra) { if (a.alive === false) continue; fn(a, a.x, a.z, 'actor'); }
  }
  update(dt) {
    const w = this.env.walker; this.cool = Math.max(0, this.cool - dt); this.comboT = Math.max(0, this.comboT - dt); this.hitT = Math.max(0, this.hitT - dt);
    if (!this.move) { this.pose = w.melee = null; w.meleeYaw = null; return; }
    if (w.down > 0.3) { this.move = null; this.pose = w.melee = null; w.meleeYaw = null; return; }          // knocked flat in the middle of a blow
    const m = this.move; this.t += dt; const k = clamp(this.t / m.dur, 0, 1);
    this.pose = w.melee = { kind: this.kind, k, hit: m.hit, hand: m.hand, blade: !!m.blade };
    if (!this.done && k >= m.hit) { this.done = true; this.land(m); }
    if (k >= 1) {
      this.move = null; this.pose = w.melee = null; this.cool = m.tired;
      if (this.queued) { const q = this.queued; this.queued = null; this.cool = 0; if (q === 'kick') this.kick(); else this.attack(q); }
      else w.meleeYaw = null;
    }
  }
  // The moment of the blow: everything within reach and arc in front of the character is hit.
  land(m) {
    const w = this.env.walker, { fx, audio } = this.env, yaw = w.meleeYaw ?? w.h; let hit = 0;
    const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw), y = w.y + (this.kind === 'kick' ? 0.9 : 1.35);
    const strikes = [];
    this.each((t, tx, tz, type) => {
      const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz); if (d > m.reach + 0.35) return;
      if (d > 0.5 && Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw)) > m.arc) return;
      strikes.push({ t, type, d, dx, dz });
    });
    strikes.sort((a, b) => a.d - b.d);
    for (const s of strikes.slice(0, m.knock >= 0.9 ? 2 : 1)) {                                // (a kick can catch two people; the rest hit one)
      const n = Math.hypot(s.dx, s.dz) || 1, dir = { x: s.dx / n, z: s.dz / n }, info = { dmg: m.dmg, knock: m.knock, blade: !!m.blade, kind: this.kind, dir, from: w };
      this.strike(s, info); hit++;
      fx && fx.puff && fx.puff(w.x + dir.x * 0.9, y, w.z + dir.z * 0.9, dir.x * 1.2, 0.4, dir.z * 1.2, 0.18, 0.5, m.blade ? 0.5 : 0.7, 0.2, 0.9);
    }
    if (hit) { this.landed++; this.hitT = 0.2; if (m.blade && audio.slice) audio.slice(); else audio.thump(0.28 + m.knock * 0.3); if (this.env.shake) this.env.shake(0.04 + m.knock * 0.08); }
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
      p.state = 'down'; p.downT = 1.6 + info.knock * 1.2; p.vx = info.dir.x * (1.5 + info.knock * 3); p.vz = info.dir.z * (1.5 + info.knock * 3); p.vy = 1.6 + info.knock * 1.5; p.lie = 0;
      peds.scare(p.x, p.z, 22, 5); if (crime) crime('assault', info.blade ? 2 : 1);
    } else if (s.type === 'officer') {
      const killed = officers.damage(t, info.dmg, false); if (info.knock > 0.8) t.walker.knockDown(info.dir.x * 4, info.dir.z * 4);
      if (killed) { this.env.hud.toast('OFFICER DOWN', 1.1); this.env.heat && this.env.heat(0.3); } else this.env.heat && this.env.heat(0.03);
    } else if (t.hit) t.hit(info.dmg, info);
  }
}
