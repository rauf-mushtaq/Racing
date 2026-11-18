// Gyms. The city has an Iron City Gym on many streets (venues.js puts them on the map, rooms.js lays out the inside). Walk in, pay for a membership at
// the front desk (with the money you have banked from robberies and fights), and train:
//   the heavy bags      punches (the recorded jabs, crosses, hooks, combinations and haymakers of moves.js), the bag swinging from each blow  -> STRENGTH
//   the kick bag        kicks (street kick, roundhouse, side kick, front kick)                                                               -> STRENGTH
//   the dumbbells       curls, one arm then the other                                                                                        -> STRENGTH
//   the treadmills      running                                                                                                              -> STAMINA
// Strength makes every blow land harder (more damage, people thrown further, a little quicker) and at its top, level 10, one kick kills anyone (see
// melee.js). Stamina makes you sprint faster. A membership sets how far you can go and how fast you get there: Basic (strength and stamina to 4),
// Pro (to 7, quicker) or Elite (to 10, quickest, with a personal trainer). It is good at every Iron City Gym, and it and what you have built up are kept.
// Other people are training too: someone working a bag, someone running, someone lifting, two fighters sparring in the ring, a receptionist at the desk.
import * as THREE from 'three';
import { Walker } from './walker.js';
import { preload } from './people.js';
import { STAGE_Y } from './interior.js';
import { clamp, damp, wrapAngle } from './util.js';

export const TIERS = [
  { key: 'basic', name: 'BASIC', price: 500, max: 4, rate: 1, perks: 'The bags, the weights and the treadmills. Strength and stamina up to 4.' },
  { key: 'pro', name: 'PRO', price: 3000, max: 7, rate: 1.7, perks: 'Gains 70% quicker. Strength and stamina up to 7.' },
  { key: 'elite', name: 'ELITE', price: 12000, max: 10, rate: 2.6, perks: 'A personal trainer: gains 160% quicker. Up to 10: one kick kills.' },
];
export const MAX_LEVEL = 10;
export const xpFor = n => 25 * n * n;                                         // what reaching level n takes
export const levelOf = xp => { let n = 0; while (n < MAX_LEVEL && xp >= xpFor(n + 1)) n++; return n; };

const NOINP = { mx: 0, my: 0, sprint: false, jump: false, crouch: false };
const PUNCHES = ['jab', 'cross', 'jab', 'hook', 'combo', 'cross', 'body', 'haymaker'], KICKS = ['kick', 'roundhouse', 'sidekick', 'frontkick'];
const XP = { jab: 1, cross: 1.2, hook: 1.4, body: 1.2, combo: 0.8, haymaker: 2.2, kick: 1.6, roundhouse: 2, sidekick: 1.8, frontkick: 1.8 };
const _v = new THREE.Vector3(), _a = new THREE.Vector3();

let dbGeo = null, dbMat = null;
function dumbbellMesh() {
  if (!dbGeo) {
    const bar = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8).rotateZ(Math.PI / 2), w1 = new THREE.CylinderGeometry(0.055, 0.055, 0.06, 14).rotateZ(Math.PI / 2).translate(-0.12, 0, 0), w2 = w1.clone().translate(0.24, 0, 0);
    dbGeo = [bar, w1, w2]; dbMat = [new THREE.MeshStandardMaterial({ color: 0xa8adb3, metalness: 1, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: 0x1e1f22, roughness: 0.5, metalness: 0.4 })];
  }
  const g = new THREE.Group(); g.add(new THREE.Mesh(dbGeo[0], dbMat[0]), new THREE.Mesh(dbGeo[1], dbMat[1]), new THREE.Mesh(dbGeo[2], dbMat[1]));
  g.traverse(o => { o.layers.set(1); o.castShadow = true; }); return g;
}
// A dumbbell in each hand (for whoever is lifting).
function holdDumbbells(w, pair) {
  if (!w.person) return; for (const [i, side] of [[0, 'L'], [1, 'R']]) {
    w.person.worldPos(`Bip01_${side}_Hand`, _v); w.person.worldPos(`Bip01_${side}_Finger2`, _a); _v.lerp(_a, 0.45);
    pair[i].position.copy(_v); pair[i].rotation.set(0, w.h, 0); pair[i].visible = true;
  }
}
// The bags: a swing about the pivot (the hook in the ceiling, or a standing bag's foot), sprung back and damped.
function stepBag(b, dt) {
  const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n, c = b.foot ? 9 : 2.2;
  for (let i = 0; i < n; i++) { b.vx += (-b.k * b.ax - c * b.vx) * h; b.vz += (-b.k * b.az - c * b.vz) * h; b.ax += b.vx * h; b.az += b.vz * h; }
  b.ax = clamp(b.ax, -0.9, 0.9); b.az = clamp(b.az, -0.9, 0.9);
  b.g.rotation.set(b.ax, 0, b.az);
}
// A blow on a bag, travelling along (dx, dz), as hard as k.
function hitBag(b, dx, dz, k) { const s = b.foot ? 0.5 : 0.32; b.vx += dz * k * s; b.vz += -dx * k * s; }      // (a heavy bag is 40 kg: a blow rocks it, a strong one swings it)

// ---- The other people in the gym ------------------------------------------------------------------------------------------------------------------------
const KEYS = { staff: 'ped_f1', boxer: 'hoodie', lifter: 'ped_m3', runner: 'ped_f3', sparA: 'tee', sparB: 'ped_m1', karA: 'ped_m2', karB: 'ped_m4' };
const PAIR = r => (r === 'sparA' || r === 'sparB' ? 'spar' : r === 'karA' || r === 'karB' ? 'kar' : null);
class Goer {
  constructor(G, spot) {
    this.G = G; this.role = spot.role; this.spot = spot; const I = G.env.interior;
    const w = this.walker = new Walker(G.env.scene, KEYS[spot.role] || 'ped_m2', { lite: true }); w.interior = I;
    w.place(spot.x, spot.z, spot.face); w.y = I.ground(spot.x, spot.z).y; w.show(true);
    this.t = Math.random() * 3; this.next = 0.5 + Math.random(); this.seq = Math.floor(Math.random() * 8);
    if (spot.role === 'lifter') this.dumbbells = [dumbbellMesh(), dumbbellMesh()].map(m => (G.env.scene.add(m), m));
  }
  update(dt) {
    const G = this.G, w = this.walker, r = this.role; this.t += dt;
    // A bout in the ring or on the mat sends the pair practising there off to the side (they come back when it is over).
    const off = !!G.bout && PAIR(r) === (G.bout.style === 'boxing' ? 'spar' : 'kar');
    if (off !== !!this.off) { this.off = off; w.show(!off); if (!off) { w.place(this.spot.x, this.spot.z, this.spot.face); w.y = G.env.interior.ground(this.spot.x, this.spot.z).y; } }
    if (off) return;
    if (r === 'runner') w.treadmill = 3.0;
    if (r === 'lifter') { w.lift = (w.lift || 0) + dt * 2.4; }
    if (PAIR(r) && G.partner(this)) {
      const o = G.partner(this).walker, yaw = Math.atan2(o.x - w.x, o.z - w.z); w.h += wrapAngle(yaw - w.h) * Math.min(1, dt * 6);
      if (w.body && w.body.ready('guard')) {
        if (!w.body.act) w.play('guard', { lock: false, root: false, fade: 0.3 });
        this.next -= dt;
        if (this.next <= 0 && w.body.act && w.body.act.name === 'guard') {
          this.next = 1.6 + Math.random() * 2.2; const list = PAIR(r) === 'kar' ? ['roundhouse', 'jab', 'sidekick', 'frontkick', 'kick', 'cross'] : ['jab', 'jab', 'cross', 'body', 'hook'], name = list[(Math.random() * list.length) | 0];
          w.play(name, { rate: 1.1, fade: 0.1, root: false, onHit: () => { const d = Math.hypot(o.x - w.x, o.z - w.z) || 1; o.flinch((o.x - w.x) / d, (o.z - w.z) / d, 0.6, name !== 'kick'); G.env.audio.thump && G.dist(w) < 12 && G.env.audio.thump(0.12); } });
        }
      }
    }
    if (r === 'boxer' && w.body && w.body.ready('jab')) {
      const bag = G.room.bags[this.spot.bag]; w.h = 0;
      const a = w.body.act; if (!a || a.t > a.hits[a.hits.length - 1] + 0.12) { this.seq++; const name = PUNCHES[this.seq % PUNCHES.length]; w.play(name, { rate: 1.05, fade: 0.1, root: false, onHit: () => { if (bag) hitBag(bag, Math.sin(w.h), Math.cos(w.h), name === 'haymaker' ? 1.6 : 0.9); if (G.dist(w) < 10 && G.env.audio.thump) G.env.audio.thump(0.1); } }); }
    }
    w.update(dt, NOINP, 0, null);
    if (r === 'boxer') { w.x = this.spot.x; w.z = this.spot.z; }                         // (he stays at his bag)
    if (this.dumbbells) holdDumbbells(w, this.dumbbells);
  }
  dispose() { const sc = this.G.env.scene, w = this.walker; w.show(false); sc.remove(w.mesh); sc.remove(w.blob); if (this.dumbbells) for (const m of this.dumbbells) sc.remove(m); }
}

// ---- A bout: boxing in the ring, or karate on the mat, against one of the gym's fighters --------------------------------------------------------------
// Use the steps of the ring (or the edge of the mat) to fight. You are put in one corner and your opponent in the other; the bell goes; you fight with
// your own punches and kicks (melee.js: he is a target while the bout is on). He squares up and keeps to the distance his style likes, circles, and throws
// the recorded blows of a real boxer or fighter (moves.js), each landing at its own moment if you are still in front of him and in reach. Damage in a
// bout comes off a bout's own health (yours and his: the bars at the top), not your real health.
//   BOXING   fists only (a kick is a foul: three and you are disqualified); win by knockout (his health to nothing), or on the damage done when the 90 s are up.
//   KARATE   punches score a point, kicks two, a kick that puts him down three; first to 8 points wins, or the most points at the end.
// A win pays a purse and some strength; a loss costs nothing but pride. Strength from the bags makes your blows count for more here too.
export const STYLES = {
  boxing: { name: 'BOXING', blows: ['jab', 'jab', 'cross', 'body', 'jab', 'combo', 'cross', 'hook'], range: [1.05, 1.4], gap: [0.55, 1.2], purse: 150, time: 90, key: 'ped_m1', kicks: false },
  karate: { name: 'KARATE', blows: ['jab', 'roundhouse', 'cross', 'sidekick', 'frontkick', 'kick'], range: [1.45, 1.95], gap: [0.8, 1.5], purse: 200, time: 90, key: 'ped_m4', kicks: true, target: 8 },
};
const OPP = {
  jab: { clip: 'jab', rate: 1.15, reach: 1.45, dmg: 5, knock: 0, hand: true }, cross: { clip: 'cross', rate: 1.1, reach: 1.55, dmg: 8, knock: 0, hand: true },
  body: { clip: 'body', rate: 1.1, reach: 1.45, dmg: 7, knock: 0, hand: true }, combo: { clip: 'combo', rate: 1.05, reach: 1.5, dmg: 4, knock: 0, hand: true },
  hook: { clip: 'hook', rate: 1.0, reach: 1.55, dmg: 11, knock: 0.6, hand: true },
  kick: { clip: 'kick', rate: 1.05, reach: 1.9, dmg: 9, knock: 0, hand: false }, roundhouse: { clip: 'roundhouse', rate: 1.05, reach: 2.0, dmg: 12, knock: 0.6, hand: false },
  sidekick: { clip: 'sidekick', rate: 1.05, reach: 2.0, dmg: 11, knock: 0.5, hand: false }, frontkick: { clip: 'frontkick', rate: 1.0, reach: 1.95, dmg: 10, knock: 0.3, hand: false },
};
const KICK = /kick|roundhouse/;
class Bout {
  constructor(G, it) {
    this.G = G; this.style = it.type === 'ring' ? 'boxing' : 'karate'; this.S = STYLES[this.style]; this.item = it;
    const R = G.room, I = G.env.interior, P = G.env.walker, A = this.area = this.style === 'boxing' ? R.gymRing : R.gymMat;
    this.state = 'intro'; this.t = 0; this.clock = this.S.time; this.php = 100; this.ohp = 100; this.pts = [0, 0]; this.downs = [0, 0]; this.fouls = 0; this.result = null;
    this.landed = 0; this.taken = 0; this.cd = 1.4; this.strafe = 1; this.strafeT = 1;
    const cz = (A.z0 + A.z1) / 2, xa = A.x0 + (A.x1 - A.x0) * 0.3, xb = A.x0 + (A.x1 - A.x0) * 0.7;
    P.place(xa, cz, Math.PI / 2); P.y = I.ground(xa, cz).y; P.vx = P.vz = 0; P.hold = false;
    const o = this.opp = new Walker(G.env.scene, this.S.key, { lite: true }); o.interior = I; o.place(xb, cz, -Math.PI / 2); o.y = I.ground(xb, cz).y; o.show(true);
    G.toast(`${this.S.name}: ${this.style === 'boxing' ? 'FISTS ONLY. KNOCK HIM OUT' : 'FIRST TO 8 POINTS: PUNCH 1, KICK 2'}`, 2.4);
    G.bell(1);
  }
  get x() { return this.opp.x; } get z() { return this.opp.z; } get y() { return this.opp.y; }
  get alive() { return this.state === 'fight' && this.ohp > 0 && this.opp.down < 0.3; }
  // Your blow lands on him (melee.js).
  hit(dmg, info = {}) {
    if (!this.alive) return false;
    const o = this.opp, kick = KICK.test(info.kind || ''), dir = info.dir || { x: Math.sin(o.h + Math.PI), z: Math.cos(o.h + Math.PI) };
    if (this.style === 'boxing' && kick) {
      this.fouls++; this.G.toast(this.fouls >= 3 ? 'THIRD FOUL: DISQUALIFIED' : `FOUL: NO KICKING IN THE RING (${this.fouls} OF 3)`, 1.6);
      if (this.fouls >= 3) this.finish('lose', 'DISQUALIFIED'); return false;
    }
    // Squared up and not throwing, he gets his guard to some of them: a blocked blow does a fraction of its damage (and scores nothing on the mat).
    const act = o.body && o.body.act, guarding = !act || act.name === 'guard', blocked = guarding && Math.random() < (kick ? (this.style === 'karate' ? 0.35 : 0.2) : 0.35);
    const d = Math.min(30, dmg * (blocked ? 0.12 : 0.42)); this.ohp = Math.max(0, this.ohp - d); if (blocked) { o.flinch(dir.x, dir.z, 0.25, !kick); this.G.toast('BLOCKED', 0.5); this.G.env.audio.thump && this.G.env.audio.thump(0.15); return true; }
    this.landed++;
    let floored = false;
    if (this.ohp <= 0 || (info.knock >= 0.9 && (kick ? this.style === 'karate' : this.ohp < 45) && Math.random() < (kick ? 0.22 : 0.5))) { o.knockDown(dir.x * 3.2, dir.z * 3.2, { at: kick ? 'chest' : 'head', hurt: this.ohp <= 0 }); o.downT = this.ohp <= 0 ? 7 : 2.4; this.downs[1]++; floored = true; }
    else o.flinch(dir.x, dir.z, Math.min(1.5, 0.4 + d / 14), !kick);
    if (this.style === 'karate') { const p = floored && kick ? 3 : kick ? 2 : 1; this.pts[0] += p; this.G.toast(p === 3 ? 'IPPON! 3 POINTS' : p === 2 ? 'WAZA-ARI: 2 POINTS' : 'YUKO: 1 POINT', 0.8); }
    if (this.G.env.audio.thump) this.G.env.audio.thump(Math.min(0.9, 0.3 + d / 30));
    this.G.gain('str', kick ? 0.9 : 0.6);
    if (this.ohp <= 0) this.finish('win', this.style === 'boxing' ? 'KNOCKOUT' : 'HE CANNOT GO ON');
    else if (this.style === 'karate' && this.pts[0] >= this.S.target) this.finish('win', `${this.pts[0]} POINTS TO ${this.pts[1]}`);
    else if (floored && this.style === 'boxing') this.G.toast(`KNOCKDOWN!`, 1.0);
    return true;
  }
  // One of his blows lands at its recorded moment: does it catch you?
  land(def, name) {
    if (this.state !== 'fight') return;
    const o = this.opp, P = this.G.env.walker, dx = P.x - o.x, dz = P.z - o.z, d = Math.hypot(dx, dz) || 1, ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - o.h));
    if (d > def.reach + 0.15 || ang > 0.85 || P.down > 0.3) { if (this.G.env.audio.swish) this.G.env.audio.swish(0.25); return; }
    const dmg = def.dmg * (P.crouching ? 0.55 : 1); this.php = Math.max(0, this.php - dmg); this.taken++;
    if (this.style === 'karate') this.pts[1] += KICK.test(name) ? 2 : 1;
    if (this.G.env.audio.thump) this.G.env.audio.thump(0.3 + def.knock * 0.3);
    if (this.php <= 0 || (def.knock && this.php < 35 && Math.random() < def.knock)) { P.knockDown(dx / d * 3.5, dz / d * 3.5, { at: def.hand ? 'head' : 'chest', hurt: this.php <= 0 }); P.downT = this.php <= 0 ? 4 : 2.2; this.downs[0]++; }
    else P.flinch(dx / d, dz / d, 0.45 + dmg / 18, def.hand);
    if (this.php <= 0) this.finish('lose', this.style === 'boxing' ? 'YOU WERE KNOCKED OUT' : 'YOU CANNOT GO ON');
    else if (this.style === 'karate' && this.pts[1] >= this.S.target) this.finish('lose', `${this.pts[0]} POINTS TO ${this.pts[1]}`);
  }
  finish(result, why) {
    if (this.state === 'over') return; this.state = 'over'; this.t = 0; this.result = result; this.why = why; const G = this.G;
    G.bell(3);
    if (result === 'win') {
      const S = G.settings; S.cash = (S.cash || 0) + this.S.purse; G.gain('str', 6); G.env.save && G.env.save();
      G.toast(`YOU WIN: ${why}. PURSE $${this.S.purse}`, 3.2);
    } else G.toast(result === 'draw' ? `A DRAW: ${why}` : `YOU LOSE: ${why}`, 3.2);
    const o = this.opp; if (o.body && o.body.act) o.body.stop(0.2);
  }
  update(dt, f) {
    const G = this.G, P = G.env.walker, o = this.opp, A = this.area, S = this.S; this.t += dt;
    if (this.state === 'intro') { if (this.t > 2.2 && ((o.person && o.body && o.body.ready('jab')) || this.t > 10)) { this.state = 'fight'; this.t = 0; G.toast('FIGHT!', 1.0); } }
    else if (this.state === 'fight') {
      this.clock -= dt;
      if (this.clock <= 0) {
        const a = this.style === 'boxing' ? 100 - this.ohp : this.pts[0], b = this.style === 'boxing' ? 100 - this.php : this.pts[1];
        this.finish(a > b ? 'win' : a < b ? 'lose' : 'draw', this.style === 'boxing' ? `ON POINTS (${Math.round(a)} TO ${Math.round(b)})` : `${this.pts[0]} POINTS TO ${this.pts[1]}`);
      }
    } else if (this.t > 3.4 && P.down < 0.3) { G.endBout(); return; }
    // Him: squared up, facing you, keeping his distance and circling, throwing his blows.
    const dx = P.x - o.x, dz = P.z - o.z, d = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz);
    let mx = 0, mz = 0;
    if (o.down < 0.3 && !(o.body && o.body.ragOn)) {
      o.h += wrapAngle(yaw - o.h) * Math.min(1, dt * 7);
      if (this.state === 'fight') {
        const [lo, hi] = S.range, busy = o.body && o.body.act && o.body.act.name !== 'guard';
        if (!busy) {
          if (d > hi) { mx = dx / d; mz = dz / d; } else if (d < lo) { mx = -dx / d * 0.8; mz = -dz / d * 0.8; }
          this.strafeT -= dt; if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 0.8 + Math.random() * 1.6; }
          mx += (-dz / d) * 0.3 * this.strafe; mz += (dx / d) * 0.3 * this.strafe;
        }
        this.cd -= dt;
        if (this.cd <= 0 && !busy && d < hi + 0.35 && P.down < 0.3 && o.body && o.body.ready('jab')) {
          const name = S.blows[(Math.random() * S.blows.length) | 0], def = OPP[name];
          if (o.play(def.clip, { rate: def.rate, fade: 0.08, out: 0.25, root: false, onHit: () => this.land(def, name) })) this.cd = S.gap[0] + Math.random() * (S.gap[1] - S.gap[0]);
          else this.cd = 0.3;
        }
      }
      if (o.body && o.body.ready('guard') && !o.body.act) o.play('guard', { lock: false, root: false, fade: 0.3 });
    }
    o.update(dt, { mx: -mx, my: mz, sprint: false, jump: false, crouch: false }, 0, null);
    // The ropes keep both of you in the ring; on the mat you are kept on it.
    const keep = w => { w.x = clamp(w.x, A.x0 + 0.45, A.x1 - 0.45); w.z = clamp(w.z, A.z0 + 0.45, A.z1 - 0.45); };
    if (!(o.body && o.body.ragOn)) keep(o); if (this.state !== 'over' && !(P.body && P.body.ragOn)) keep(P);
    G.renderBout(this);
  }
  dispose() { const sc = this.G.env.scene, o = this.opp; o.show(false); sc.remove(o.mesh); sc.remove(o.blob); }
}

// ---- The gym --------------------------------------------------------------------------------------------------------------------------------------------
export class Gym {
  // env: { scene, interior, walker, audio, toast(text, secs), settings, save(), cash() }
  constructor(env) {
    this.env = env; this.active = false; this.room = null; this.session = null; this.goers = []; this._prompt = ''; this.menuOpen = false;
    this.dumbbells = null; this.hud = null;
  }
  get settings() { return this.env.settings; }
  get tier() { return clamp(this.settings.gymTier | 0, 0, TIERS.length); }                     // 0: no membership; 1..3
  get maxLevel() { return this.tier ? TIERS[this.tier - 1].max : 0; }
  get strength() { return levelOf(this.settings.gymStr || 0); }
  get stamina() { return levelOf(this.settings.gymSta || 0); }
  get prompt() { return this._prompt; }
  dist(w) { const P = this.env.walker; return Math.hypot(w.x - P.x, w.z - P.z); }
  partner(g) { return this.goers.find(o => o !== g && PAIR(o.role) === PAIR(g.role)); }
  toast(t, s = 1.6) { this.env.toast && this.env.toast(t, s); }

  begin(venue) {
    this.end(); const I = this.env.interior; this.room = I.room; this.venue = venue; this.active = true; this.session = null;
    this.goers = this.room.spots.map(s => new Goer(this, s));
    for (const k in STYLES) preload(STYLES[k].key).catch(() => {});                 // (the fighters you can spar with, ready before you ask)
    if (!this.dumbbells) { this.dumbbells = [dumbbellMesh(), dumbbellMesh()]; for (const m of this.dumbbells) { m.visible = false; this.env.scene.add(m); } }
    this.showHud(true);
    this.toast(this.tier ? `IRON CITY GYM: ${TIERS[this.tier - 1].name} MEMBER` : 'IRON CITY GYM: SEE THE FRONT DESK FOR A MEMBERSHIP', 2.6);
  }
  end() {
    if (this.bout) { this.bout.dispose(); this.bout = null; this.showBout(false); }
    this.stop(); for (const g of this.goers) g.dispose(); this.goers.length = 0; this.active = false; this.room = null; this._prompt = '';
    if (this.dumbbells) for (const m of this.dumbbells) m.visible = false;
    this.showMenu(false); this.showHud(false);
  }
  // Melee targets in here: your opponent, while a bout is on (the bags are hit by training on them, not by punching the air at them).
  targets() { return this.bout && this.bout.alive ? [this.bout] : null; }
  startBout(it) {
    const w = this.env.walker; if (w.down > 0.3 || this.bout) return;
    this.stop(); this.bout = new Bout(this, it); this.showBout(true);
  }
  endBout() {
    const b = this.bout; if (!b) return; this.bout = null; b.dispose(); this.showBout(false);
    const P = this.env.walker, it = b.item; P.place(it.x, it.z, it.face || 0); P.y = this.env.interior.ground(it.x, it.z).y; P.vx = P.vz = 0;     // (out of the ring, back down the steps)
  }
  bell(n) { const a = this.env.audio; if (!a || !a.beep) return; for (let i = 0; i < n; i++) setTimeout(() => a.beep(1250, 0.35, 0.22), i * 260); }

  // The use button: the desk opens the memberships; a machine or a bag starts (or stops) training; by the door, out.
  use() {
    if (!this.active) return false; const P = this.env.walker, R = this.room;
    if (this.menuOpen) { this.showMenu(false); return true; }
    if (this.bout) { if (this.bout.state === 'over') this.endBout(); else { this.bout.finish('lose', 'YOU THREW IN THE TOWEL'); } return true; }
    if (this.session) { this.stop(); return true; }
    if (Math.hypot(R.exit.x - P.x, R.exit.z - P.z) < 1.7) return 'exit';
    const it = this.nearest(); if (!it) return false;
    if (it.type === 'desk') { this.showMenu(true); return true; }
    if (!this.tier) { this.toast('YOU NEED A MEMBERSHIP: SEE THE FRONT DESK', 1.8); return true; }
    if (it.type === 'ring' || it.type === 'dojo') { this.startBout(it); return true; }
    this.start(it); return true;
  }
  nearest() {
    const P = this.env.walker; let best = null, bd = 1e9;
    for (const it of this.room.items) { const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < it.r && d < bd) { bd = d; best = it; } }
    return best;
  }
  start(it) {
    const w = this.env.walker; if (w.down > 0.3) return;
    w.x = it.x; w.z = it.z; w.h = it.face || 0; w.vx = w.vz = 0; w.hold = true; this.session = { it, t: 0, seq: 0, last: -1 };
    if (it.type === 'treadmill') w.treadmill = 2.2 + 0.25 * this.stamina;
    if (it.type === 'weights') w.lift = 0;
    if ((it.type === 'bag' || it.type === 'kickbag') && !(w.body && w.body.ready('jab'))) { this.toast('LOADING...', 0.8); }
    this.toast(it.type === 'treadmill' ? 'RUNNING: STAMINA' : 'TRAINING: STRENGTH  (USE AGAIN, OR MOVE, TO STOP)', 1.8);
  }
  stop() {
    const w = this.env.walker; if (!this.session) return; this.session = null;
    w.hold = false; w.treadmill = 0; w.lift = null; if (w.body && w.body.act) w.body.stop(0.2);
    if (this.dumbbells) for (const m of this.dumbbells) m.visible = false;
  }
  // Experience into strength or stamina, up to what the membership allows.
  gain(stat, n) {
    const S = this.settings, key = stat === 'str' ? 'gymStr' : 'gymSta', T = TIERS[this.tier - 1]; if (!T) return;
    const cap = xpFor(T.max), before = levelOf(S[key] || 0);
    if ((S[key] || 0) >= cap) { if (!this.capped) { this.capped = true; this.toast(this.tier < TIERS.length ? `${stat === 'str' ? 'STRENGTH' : 'STAMINA'} ${T.max}: THE MOST A ${T.name} MEMBERSHIP GIVES. UPGRADE AT THE DESK` : 'YOU ARE AS STRONG AS ANYONE GETS', 2.4); } return; }
    S[key] = Math.min(cap, (S[key] || 0) + n * T.rate); const after = levelOf(S[key]);
    if (after > before) {
      this.env.save && this.env.save();
      const what = stat === 'str' ? 'STRENGTH' : 'STAMINA';
      this.toast(stat === 'str' && after >= MAX_LEVEL ? 'STRENGTH 10: ONE KICK KILLS' : `${what} ${after}` + (stat === 'str' ? `: YOUR BLOWS HIT ${Math.round((1 + 0.3 * after) * 100)}% AS HARD` : `: YOU SPRINT ${Math.round(after * 2)}% FASTER`), 2.2);
      if (this.env.audio.beep) { this.env.audio.beep(900, 0.07, 0.2); setTimeout(() => this.env.audio.beep(1350, 0.09, 0.2), 90); setTimeout(() => this.env.audio.beep(1800, 0.12, 0.2), 190); }
    }
  }
  buy(i) {
    const T = TIERS[i], S = this.settings, have = this.tier, cash = S.cash || 0; if (!T) return false;
    if (have >= i + 1) { this.toast('YOU ALREADY HAVE THAT', 1.2); return false; }
    const price = T.price - (have ? TIERS[have - 1].price : 0);
    if (cash < price) { this.toast(`NOT ENOUGH MONEY: $${price.toLocaleString('en-US')} NEEDED (ROB A SHOP, OR WIN A FIGHT)`, 2.2); return false; }
    S.cash = cash - price; S.gymTier = i + 1; this.capped = false; this.env.save && this.env.save();
    this.toast(`${T.name} MEMBERSHIP: $${price.toLocaleString('en-US')}. GOOD AT EVERY IRON CITY GYM`, 2.6);
    if (this.env.audio.beep) { this.env.audio.beep(1200, 0.08, 0.2); setTimeout(() => this.env.audio.beep(1700, 0.1, 0.2), 90); }
    this.renderMenu(); return true;
  }

  update(dt, f = null) {
    if (!this.active) return; const P = this.env.walker, R = this.room;
    for (const b of R.bags) stepBag(b, dt);
    for (const g of this.goers) g.update(dt);
    if (this.bout) { this.bout.update(dt, f); this._prompt = this.bout ? (this.bout.state === 'over' ? 'LEAVE THE RING' : 'THROW IN THE TOWEL') : ''; if (this.bout) { this.renderHud(); return; } }
    // Training.
    const s = this.session;
    if (s) {
      s.t += dt; const it = s.it;
      if (f && (Math.abs(f.mx) + Math.abs(f.my) > 0.35 || f.jump) && s.t > 0.4) this.stop();
      else if (P.down > 0.3) this.stop();
      else {
        P.x = it.x; P.z = it.z;
        if (it.type === 'bag' || it.type === 'kickbag') {
          const kick = it.type === 'kickbag', list = kick ? KICKS : PUNCHES, a = P.body && P.body.act, bag = R.bags[it.bag];
          P.h = it.face || 0;
          if (P.body && P.body.ready('jab') && (!a || a.t > a.hits[a.hits.length - 1] + 0.08)) {
            const name = list[s.seq++ % list.length], k = 1 + 0.3 * this.strength;
            P.play(name, { rate: 1.1 * (1 + 0.02 * this.strength), fade: 0.1, root: false, onHit: () => {
              if (bag) hitBag(bag, Math.sin(P.h), Math.cos(P.h), (name === 'haymaker' || kick ? 1.5 : 0.9) * Math.min(3, k));
              if (this.env.audio.thump) this.env.audio.thump(Math.min(0.9, 0.25 + 0.05 * this.strength));
              this.gain('str', XP[name] || 1);
            } });
          }
        } else if (it.type === 'weights') {
          const before = P.lift || 0; P.lift = before + dt * (2.2 + 0.08 * this.strength); P.h = it.face || 0;
          if (Math.floor(P.lift / Math.PI) !== Math.floor(before / Math.PI)) this.gain('str', 0.9);
          if (this.dumbbells) holdDumbbells(P, this.dumbbells);
        } else if (it.type === 'treadmill') {
          P.treadmill = 2.2 + 0.25 * this.stamina; P.h = it.face || 0;
          s.acc = (s.acc || 0) + dt; if (s.acc >= 1) { s.acc -= 1; this.gain('sta', 1.4); }
        }
      }
    }
    // The prompt.
    const exitD = Math.hypot(R.exit.x - P.x, R.exit.z - P.z), it = this.nearest();
    this._prompt = this.menuOpen ? 'CLOSE' : this.session ? 'STOP' : exitD < 1.7 ? 'LEAVE' : it ? (it.type === 'desk' ? 'MEMBERSHIP' : it.label) : '';
    this.renderHud();
  }

  // ---- What is on the screen: the gym panel (membership, strength, stamina) and the membership desk's menu ------------------------------------------------
  showHud(on) {
    if (typeof document === 'undefined') return;
    if (!this.hud) {
      ensureStyle();
      const el = document.createElement('div'); el.id = 'gymhud'; el.className = 'hidden';
      el.innerHTML = '<div class="gh-top"><b>IRON CITY GYM</b><span id="gh-tier"></span></div><div class="gh-row"><span>STRENGTH</span><b id="gh-str"></b><i><em id="gh-strb"></em></i></div><div class="gh-row"><span>STAMINA</span><b id="gh-sta"></b><i><em id="gh-stab"></em></i></div>';
      (document.getElementById('hud') || document.body).appendChild(el); this.hud = el; this.hudSig = '';
    }
    this.hud.classList.toggle('hidden', !on);
  }
  renderHud() {
    if (!this.hud) return; const S = this.settings, str = S.gymStr || 0, sta = S.gymSta || 0, ls = levelOf(str), lt = levelOf(sta);
    const sig = [this.tier, Math.floor(str), Math.floor(sta)].join('|'); if (sig === this.hudSig) return; this.hudSig = sig;
    const frac = (xp, l) => l >= MAX_LEVEL ? 1 : (xp - xpFor(l)) / (xpFor(l + 1) - xpFor(l));
    document.getElementById('gh-tier').textContent = this.tier ? TIERS[this.tier - 1].name + ' MEMBER' : 'NOT A MEMBER';
    document.getElementById('gh-str').textContent = ls + ' / ' + MAX_LEVEL; document.getElementById('gh-sta').textContent = lt + ' / ' + MAX_LEVEL;
    document.getElementById('gh-strb').style.width = clamp(frac(str, ls), 0, 1) * 100 + '%'; document.getElementById('gh-stab').style.width = clamp(frac(sta, lt), 0, 1) * 100 + '%';
  }
  showBout(on) {
    if (typeof document === 'undefined') return;
    if (!this.boutEl) {
      ensureStyle(); const el = document.createElement('div'); el.id = 'bouthud'; el.className = 'hidden';
      el.innerHTML = '<div class="bh-top"><b id="bh-name"></b><span id="bh-clock"></span></div><div class="bh-row"><span>YOU</span><i><em id="bh-p"></em></i><b id="bh-pp"></b></div><div class="bh-row"><span>HIM</span><i><em id="bh-o"></em></i><b id="bh-op"></b></div>';
      (document.getElementById('hud') || document.body).appendChild(el); this.boutEl = el;
    }
    this.boutEl.classList.toggle('hidden', !on); if (this.hud) this.hud.classList.toggle('hidden', !!on || !this.active);
  }
  renderBout(b) {
    if (!this.boutEl) return; const sig = [b.state, Math.ceil(b.clock), Math.round(b.php), Math.round(b.ohp), b.pts[0], b.pts[1]].join('|'); if (sig === this.boutSig) return; this.boutSig = sig;
    document.getElementById('bh-name').textContent = b.S.name + (b.state === 'intro' ? ': SQUARE UP' : b.state === 'over' ? (b.result === 'win' ? ': YOU WIN' : b.result === 'draw' ? ': A DRAW' : ': YOU LOSE') : '');
    const c = Math.max(0, Math.ceil(b.clock)); document.getElementById('bh-clock').textContent = `${(c / 60) | 0}:${String(c % 60).padStart(2, '0')}`;
    document.getElementById('bh-p').style.width = b.php + '%'; document.getElementById('bh-o').style.width = b.ohp + '%';
    document.getElementById('bh-pp').textContent = b.style === 'karate' ? b.pts[0] + ' PTS' : ''; document.getElementById('bh-op').textContent = b.style === 'karate' ? b.pts[1] + ' PTS' : '';
  }
  showMenu(on) {
    this.menuOpen = !!on; if (typeof document === 'undefined') return;
    if (on && !this.menu) {
      ensureStyle();
      const el = document.createElement('div'); el.id = 'gymmenu'; el.className = 'hidden'; document.body.appendChild(el); this.menu = el;
      el.addEventListener('click', e => { const b = e.target.closest('[data-buy]'); if (b) { e.stopPropagation(); this.buy(+b.dataset.buy); } else if (e.target.closest('[data-close]')) { e.stopPropagation(); this.showMenu(false); } });
      this.onKey = e => { if (!this.menuOpen) return; if (e.code === 'Escape') { this.showMenu(false); e.preventDefault(); e.stopPropagation(); } else if (/^Digit[1-3]$/.test(e.code)) { this.buy(+e.code.slice(5) - 1); e.preventDefault(); e.stopPropagation(); } };
      window.addEventListener('keydown', this.onKey, true);
    }
    if (!this.menu) return;
    if (on) { this.renderMenu(); if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); }
    this.menu.classList.toggle('hidden', !on);
  }
  renderMenu() {
    if (!this.menu) return; const cash = this.settings.cash || 0, have = this.tier;
    this.menu.innerHTML = `<div class="gm-box"><div class="gm-head"><b>IRON CITY GYM</b><span>MEMBERSHIP</span><em>$ ${cash.toLocaleString('en-US')}</em></div><div class="gm-cards">${TIERS.map((T, i) => {
      const owned = have >= i + 1, price = T.price - (have && have < i + 1 ? TIERS[have - 1].price : 0), can = !owned && cash >= price;
      return `<div class="gm-card${owned ? ' own' : ''}"><b>${T.name}</b><div class="gm-price">${owned ? 'YOURS' : '$ ' + price.toLocaleString('en-US')}</div><p>${T.perks}</p><button data-buy="${i}" ${can ? '' : 'disabled'}>${owned ? 'MEMBER' : can ? (have ? 'UPGRADE' : 'JOIN') + ' (' + (i + 1) + ')' : 'NOT ENOUGH MONEY'}</button></div>`;
    }).join('')}</div><p class="gm-note">Strength makes your punches and kicks hit harder and throw people further; at 10, one kick kills. Stamina makes you sprint faster. Your membership is good at every Iron City Gym.</p><button class="gm-close" data-close="1">CLOSE (ESC)</button></div>`;
  }
}
let styled = false;
function ensureStyle() {
  if (styled || typeof document === 'undefined') return; styled = true;
  const s = document.createElement('style'); s.textContent = `
  #gymhud { position: absolute; left: 50%; top: calc(max(14px, env(safe-area-inset-top)) + 40px); transform: translateX(-50%); width: min(320px, 60vw); padding: 8px 12px 10px; border-radius: 12px; background: rgba(12,10,20,0.66); border: 1px solid rgba(255,255,255,0.22); font: 600 12px Barlow, sans-serif; color: #fff; pointer-events: none; }
  #gymhud.hidden, #gymmenu.hidden, #bouthud.hidden { display: none; }
  #bouthud { position: absolute; left: 50%; top: calc(max(14px, env(safe-area-inset-top)) + 40px); transform: translateX(-50%); width: min(380px, 70vw); padding: 8px 12px 10px; border-radius: 12px; background: rgba(12,10,20,0.7); border: 1px solid rgba(255,255,255,0.22); font: 600 12px Barlow, sans-serif; color: #fff; pointer-events: none; }
  #bouthud .bh-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; } #bouthud .bh-top b { font: 800 italic 17px 'Barlow Condensed', sans-serif; color: #f2c230; letter-spacing: 0.04em; } #bouthud .bh-top span { font: 700 18px 'Barlow Condensed', sans-serif; }
  #bouthud .bh-row { display: grid; grid-template-columns: 34px 1fr 48px; align-items: center; gap: 6px; margin-top: 4px; } #bouthud .bh-row b { text-align: right; }
  #bouthud .bh-row i { display: block; height: 8px; border-radius: 4px; background: rgba(255,255,255,0.18); overflow: hidden; } #bouthud .bh-row em { display: block; height: 100%; background: linear-gradient(90deg, #46d36a, #f2c230); transition: width 0.15s; }
  #bouthud .bh-row:last-child em { background: linear-gradient(90deg, #ff5a3a, #f2c230); }
  #gymhud .gh-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; } #gymhud .gh-top b { font: 800 italic 16px 'Barlow Condensed', sans-serif; color: #f2c230; letter-spacing: 0.04em; } #gymhud .gh-top span { opacity: 0.8; }
  #gymhud .gh-row { display: grid; grid-template-columns: 74px 46px 1fr; align-items: center; gap: 6px; margin-top: 3px; } #gymhud .gh-row b { text-align: right; }
  #gymhud .gh-row i { display: block; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.18); overflow: hidden; } #gymhud .gh-row em { display: block; height: 100%; background: linear-gradient(90deg, #f2c230, #ff7a2a); }
  #gymmenu { position: fixed; inset: 0; z-index: 55; display: grid; place-items: center; background: rgba(4,4,8,0.55); pointer-events: auto; }
  #gymmenu .gm-box { width: min(760px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; background: rgba(16,14,22,0.94); border: 1px solid rgba(255,255,255,0.18); border-radius: 16px; padding: 18px; color: #fff; font: 500 14px Barlow, sans-serif; }
  #gymmenu .gm-head { display: flex; gap: 12px; align-items: baseline; margin-bottom: 12px; } #gymmenu .gm-head b { font: 800 italic 26px 'Barlow Condensed', sans-serif; color: #f2c230; } #gymmenu .gm-head span { opacity: 0.7; letter-spacing: 0.12em; } #gymmenu .gm-head em { margin-left: auto; font: 700 20px 'Barlow Condensed', sans-serif; font-style: normal; color: #7dffa8; }
  #gymmenu .gm-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; } @media (max-width: 640px) { #gymmenu .gm-cards { grid-template-columns: 1fr; } }
  #gymmenu .gm-card { border: 1px solid rgba(255,255,255,0.16); border-radius: 12px; padding: 12px; background: rgba(255,255,255,0.04); display: flex; flex-direction: column; gap: 6px; } #gymmenu .gm-card.own { border-color: #f2c230; }
  #gymmenu .gm-card b { font: 800 italic 22px 'Barlow Condensed', sans-serif; } #gymmenu .gm-price { font: 700 20px 'Barlow Condensed', sans-serif; color: #f2c230; } #gymmenu .gm-card p { margin: 0; opacity: 0.85; flex: 1; }
  #gymmenu button { font: 800 italic 17px 'Barlow Condensed', sans-serif; border: 0; border-radius: 8px; padding: 9px 12px; color: #1a0c06; background: linear-gradient(90deg, #f2c230, #ff7a2a); cursor: pointer; } #gymmenu button[disabled] { background: rgba(255,255,255,0.14); color: rgba(255,255,255,0.6); cursor: default; }
  #gymmenu .gm-note { opacity: 0.75; margin: 12px 0 8px; font-size: 13px; } #gymmenu .gm-close { background: rgba(255,255,255,0.14); color: #fff; }`;
  document.head.appendChild(s);
}
