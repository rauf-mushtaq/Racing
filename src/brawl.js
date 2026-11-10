// People who fight back. A few of the people on the pavements are armed (they carry a pistol under their jacket) and a few are big, muscular men. Leave them alone and they
// walk about like everyone else. Hit one (a punch, a kick, the knife, a shot, a car) and he stops being a pedestrian: he becomes a fighter, a real person (people.js) who
// goes for you.
//   bruiser   a big man: charges at you and hits hard (a jab, a cross, and now and then a slow haymaker that knocks you flat). Takes a lot of punishment.
//   armed     draws a pistol and shoots at you from a distance (burst after burst, missing more the further away and the faster you move); runs away when badly hurt.
//   enforcer  big and armed: shoots as he comes, and when he is on you, hits.
// What you do to them works like it does on the police: punches, kicks and the knife (melee.js) and bullets (weapons.js) hurt them. A beaten fighter is knocked out (lies still for
// a few seconds, then gets up and slopes off); one who was shot or cut is down for good. Beat one and you take what is in his wallet. Shots in the street bring the police
// (the same as any other gunfire), and the other armed people nearby may join in.
import * as THREE from 'three';
import { Walker } from './walker.js';
import { makeGun, placeGun, WEAPONS } from './weapons.js';
import { raycastStatic } from './police.js';
import { clamp, damp, lerp, wrapAngle } from './util.js';

const CAPS = { ultra: 6, high: 5, medium: 4, low: 3 };
const NOINP = { mx: 0, my: 0, sprint: false, jump: false, crouch: false };
const MALE = ['ped_m1', 'ped_m2', 'ped_m3', 'ped_m4'];
const _v = new THREE.Vector3();
// How each kind fights. hp: how much it takes; wallet: what you get for beating one; bulk: the muscle build (people.js setBulk); gun: pistol or none.
export const KINDS = {
  bruiser:  { hp: 190, wallet: [120, 320], bulk: 1, gun: null, speed: 5.9, stagger: false, flees: false },
  armed:    { hp: 62, wallet: [40, 180], bulk: 0, gun: 'pistol', speed: 5.4, stagger: true, flees: true },
  enforcer: { hp: 150, wallet: [200, 520], bulk: 0.85, gun: 'pistol', speed: 5.7, stagger: false, flees: false },
};
// A blow: how long it takes, when in it the fist lands (0..1), how far it reaches, what it does, and which arm throws it.
export const BLOWS = {
  jab:   { dur: 0.34, hit: 0.42, reach: 1.5, dmg: 7, hand: 'left', knock: 0 },
  cross: { dur: 0.42, hit: 0.45, reach: 1.6, dmg: 12, hand: 'right', knock: 0 },
  hook:  { dur: 0.7, hit: 0.58, reach: 1.75, dmg: 20, hand: 'right', knock: 1 },          // the big swing: a long wind-up (there is time to step back), and it knocks you down
};
const GUN = { cfg: WEAPONS.pistol.cfg, dmg: 3.6, gap: 0.5, burst: 2, pause: [1.3, 2.3], mag: 8, reload: 1.8 };
const gunMeshes = {};
const gunFor = () => (gunMeshes.pistol || (gunMeshes.pistol = makeGun('pistol'))).clone(true);

class Brawler {
  constructor(mgr, kind, key, p) {
    const env = mgr.env; this.mgr = mgr; this.kindName = kind; this.def = KINDS[kind]; this.key = key;
    this.walker = new Walker(env.scene, key, { lite: true });
    this.walker.place(p.x, p.z, p.h); this.walker.y = p.y;
    this.maxHp = this.hp = this.def.hp; this.state = 'draw'; this.t = 0; this.dead = false; this.ko = false; this.koT = 0; this.remove = false; this.gone = 0;
    this.drawT = 0.55 + Math.random() * 0.25;                                  // (a moment to turn on you and square up, or pull the gun)
    this.atk = null; this.cd = 0.3; this.combo = 0; this.stun = 0; this.hurtT = 99; this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 1 + Math.random() * 2; this.stuckT = 0; this.detour = null;
    this.fleeT = 0; this.leaving = false; this.leaveT = 0; this.paid = false; this.bulked = false;
    this.lx = 0; this.lz = 0; this.los = true; this.losT = 0; this.seen = 0; this.dir = { x: 0, z: 1 };
    if (this.def.gun) {
      this.gun = gunFor(); this.gun.visible = false; env.scene.add(this.gun);
      this.W = { draw: 0, aimK: 0, twist: 0, pitch: 0, recoil: 0, reload: 0, radio: 0, cfg: GUN.cfg, out: { palm: new THREE.Vector3(), q: new THREE.Quaternion(), palmL: new THREE.Vector3() } };
      this.walker.arms = this.W; this.walker.placeWeapon = w => placeGun(w, this.gun, this.W, this.W.draw);
      this.mag = GUN.mag; this.reloadT = 0; this.reloadTotal = 1; this.fireT = 0.7 + Math.random() * 0.5; this.shots = 0; this.fired = false;
    }
  }
  get x() { return this.walker.x; } get z() { return this.walker.z; } get y() { return this.walker.y; }
  get crouched() { return this.walker.crouch > 0.5; }
  get alive() { return !this.dead && !this.ko; }

  // Hurt by the player: a punch, a kick, a blade or a bullet. info: { gun, blade, knock, head, dir }.
  hit(dmg, info = {}) {
    if (!this.alive) return false;
    const w = this.walker; this.hp -= dmg * (info.head ? 1.7 : 1); this.hurtT = 0; this.state = this.state === 'draw' ? 'fight' : this.state;
    if (info.dir) { this.dir.x = info.dir.x; this.dir.z = info.dir.z; }
    if (info.knock >= 0.9 && this.def.stagger && this.hp > 0) { this.stun = 0.9; this.clearBlow(); w.knockDown(this.dir.x * 2.6, this.dir.z * 2.6); }            // (a kick puts a smaller man on the floor)
    else if (dmg >= 12 && this.hp > 0 && !info.gun) { this.stun = Math.max(this.stun, this.def.stagger ? 0.5 : 0.28); if (this.stun > 0.4) this.clearBlow(); w.vx += this.dir.x * 1.2; w.vz += this.dir.z * 1.2; }
    if (this.hp <= 0) { this.defeat(info); return true; }
    if (this.def.flees && !this.fleeT && this.hp < this.maxHp * 0.3 && Math.random() < 0.6) { this.fleeT = 6 + Math.random() * 3; this.clearBlow(); }
    return false;
  }
  clearBlow() { const w = this.walker; this.atk = null; w.melee = null; w.meleeYaw = null; }
  defeat(info) {
    const w = this.walker, m = this.mgr, env = m.env; this.hp = 0; this.clearBlow(); this.fleeT = 0;
    this.dead = !!(info.gun || info.blade || info.car || info.blast); this.ko = !this.dead;
    if (this.W) this.W.aimK = 0;
    w.faceYaw = null; w.knockDown((this.dir.x || 0) * 3.2, (this.dir.z || 0) * 3.2);
    if (this.dead) { w.downT = 1e9; this.gone = 0; } else { w.downT = this.koT = 5 + Math.random() * 2; }
    if (!this.paid) {                                                          // the wallet
      this.paid = true; const [lo, hi] = this.def.wallet, n = Math.round((lo + Math.random() * (hi - lo)) / 5) * 5;
      if (env.reward) env.reward(n, this.dead ? 'IN HIS WALLET' : 'TAKEN FROM HIS WALLET');
    }
    if (env.hud) env.hud.toast(this.dead ? 'HE IS DOWN' : 'KNOCKED OUT', 1.2);
    m.downs++;
  }
  flee() { this.fleeT = Math.max(this.fleeT, 5); }

  update(dt) {
    const m = this.mgr, env = m.env, P = env.walker, w = this.walker, W = this.W, def = this.def; this.t += dt; this.hurtT += dt;
    if (!this.shadowsSet && w.person) { w.person.setShadows(!!env.shadows); this.shadowsSet = true; }
    if (!this.bulked && w.person && def.bulk) { w.person.setBulk(def.bulk); w.person.root.scale.y *= 1.06; this.bulked = true; }          // (the muscle, once the model has arrived)
    if (this.dead) { this.gone += dt; if (W) W.draw = Math.max(0, W.draw - dt * 4); if (this.gun && W.draw < 0.35) this.gun.visible = false; w.faceYaw = null; w.update(dt, NOINP, 0, env.obstacles); if (this.gone > 9) this.remove = true; return; }
    if (this.ko) {
      if (W) W.draw = Math.max(0, W.draw - dt * 4); if (this.gun && W.draw < 0.35) this.gun.visible = false;
      this.koT -= dt; w.faceYaw = null; w.update(dt, NOINP, 0, env.obstacles);
      if (this.koT <= 0) { this.ko = false; this.leaving = true; this.leaveT = 0; }
      return;
    }
    const dx = P.x - w.x, dz = P.z - w.z, d = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz), foot = env.onFoot();
    this.stun = Math.max(0, this.stun - dt);
    // Gone from view: the player is in a building, or has got into a car: stand about for a bit, then lose interest.
    const away = !!P.interior || !foot;
    if (away || this.leaving) {
      this.leaveT += dt; if (this.leaveT > (away ? 8 : 6)) { this.remove = true; return; }
      if (W) { W.draw = damp(W.draw, 0, 6, dt); W.aimK = damp(W.aimK, 0, 6, dt); if (W.draw < 0.35) this.gun.visible = false; }
      w.faceYaw = null; this.clearBlow();
      const away2 = this.leaving && !P.interior && foot, mx = away2 ? -dx / d : 0, mz = away2 ? -dz / d : 0;
      w.update(dt, { mx: -mx, my: mz, sprint: false, jump: false, crouch: false }, 0, env.obstacles); return;
    }
    // Can he see you? (a few times a second)
    this.losT -= dt; if (this.losT <= 0) { this.losT = 0.15 + Math.random() * 0.1; this.los = d < 6 || raycastStatic(w.x, w.z, dx, dz, d) >= d - 3; if (this.los) { this.lx = P.x; this.lz = P.z; this.seen = 0; } }
    this.seen += dt;
    const state = this.state; let move = 0, sprint = false, crouch = false, back = false, tx = this.lx || P.x, tz = this.lz || P.z, side = 0;
    // Drawing the gun / squaring up.
    if (state === 'draw') {
      this.drawT -= dt; w.faceYaw = null; if (W) W.draw = damp(W.draw, 1, 6, dt);
      const turn = wrapAngle(yaw - w.h); w.h += turn * Math.min(1, dt * 9);
      if (this.drawT <= 0) this.state = 'fight';
      w.update(dt, NOINP, 0, env.obstacles); if (this.gun) { this.gun.visible = W.draw > 0.35; } return;
    }
    // Reloading.
    const reloading = !!W && this.reloadT > 0;
    if (W && this.reloadT > 0) { this.reloadT -= dt; W.reload = clamp(1 - this.reloadT / this.reloadTotal, 0, 1); if (this.reloadT <= 0) { this.mag = GUN.mag; W.reload = 0; } } else if (W) W.reload = 0;

    if (this.stun > 0) { move = 0; }
    else if (this.fleeT > 0) { this.fleeT -= dt; move = 1; sprint = true; tx = w.x - dx; tz = w.z - dz; if (this.fleeT <= 0) { this.leaving = true; this.leaveT = 0; } }
    else if (def.gun && this.kindName === 'armed') {                            // holds a distance and shoots
      if (!this.los && this.seen > 1.2) move = 1;
      else if (reloading) { move = 0; crouch = true; }
      else if (d > 15) { move = 1; sprint = d > 26; }
      else if (d < 5.5) { move = 0.8; back = true; tx = w.x - dx; tz = w.z - dz; }
      else { this.strafeT -= dt; if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 1 + Math.random() * 2; } side = 0.35 * this.strafe; }
    } else if (def.gun) {                                                       // the enforcer: comes on, shooting, and hits when he gets there
      if (d > 1.4) { move = 1; sprint = d > 14 && !this.wantFire; }
    } else {                                                                    // the bruiser: straight at you
      if (d > 1.35) { move = 1; sprint = d > 5; }
      else { this.strafeT -= dt; if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 0.8 + Math.random() * 1.6; } side = 0.25 * this.strafe; }
    }
    // Steering, round whatever is in the way.
    let ax = tx - w.x, az = tz - w.z, al = Math.hypot(ax, az) || 1; ax /= al; az /= al; if (back) { ax = -dx / d; az = -dz / d; }
    if (move > 0) {
      const ahead = raycastStatic(w.x, w.z, ax, az, 5);
      if (this.detour) { this.detour.t -= dt; if (this.detour.t <= 0) this.detour = null; }
      if (ahead < 4 || this.detour) {
        if (!this.detour) {
          const l = raycastStatic(w.x, w.z, ax * Math.cos(0.8) - az * Math.sin(0.8), ax * Math.sin(0.8) + az * Math.cos(0.8), 8), r = raycastStatic(w.x, w.z, ax * Math.cos(-0.8) - az * Math.sin(-0.8), ax * Math.sin(-0.8) + az * Math.cos(-0.8), 8);
          if (this.stuckT > 0.7) this.detour = { a: (l > r ? 1 : -1) * 1.45, t: 1.5 + Math.random() }; else this.detour0 = l > r ? 0.9 : -0.9;
        }
        const a = this.detour ? this.detour.a : this.detour0, nx = ax * Math.cos(a) - az * Math.sin(a), nz = ax * Math.sin(a) + az * Math.cos(a); ax = nx; az = nz;
      }
      for (const o of m.list) { if (o === this || !o.alive) continue; const ex = w.x - o.x, ez = w.z - o.z, ed = Math.hypot(ex, ez); if (ed < 1.3 && ed > 1e-3) { ax += ex / ed * 0.6; az += ez / ed * 0.6; } }
      const nl = Math.hypot(ax, az) || 1; ax /= nl; az /= nl;
      this.stuckT = w.speed < 0.5 && !this.atk ? this.stuckT + dt : Math.max(0, this.stuckT - dt * 2);
    } else this.stuckT = Math.max(0, this.stuckT - dt * 2);

    // The gun: up when he can see you and is not busy reloading or running away.
    let aimWanted = false;
    if (W) {
      aimWanted = this.fleeT <= 0 && this.stun <= 0 && this.los && d < 40 && !reloading && (this.kindName === 'armed' || d > 2.2);
      W.draw = damp(W.draw, this.fleeT > 0 || this.leaving ? 0.3 : 1, 7, dt); W.aimK = damp(W.aimK, aimWanted ? 1 : 0, 6, dt); W.recoil = Math.max(0, W.recoil - dt * 7);
      const chestY = w.y + 1.35, tY = P.y + 1.25 - (P.crouch || 0) * 0.45;
      W.pitch = clamp(Math.atan2(tY - chestY, Math.max(d, 2)), -0.8, 0.8); W.twist = wrapAngle(yaw - w.h);
      this.gun.visible = W.draw > 0.35;
    }
    w.faceYaw = W && W.aimK > 0.5 && W.draw > 0.5 ? yaw : null;
    // A blow (the bruiser, and the enforcer when he is on you).
    if ((!def.gun || this.kindName === 'enforcer') && this.stun <= 0 && this.fleeT <= 0) this.fists(dt, P, d, yaw);
    // Move.
    const mx = ax * move + (-dz / d) * side, mz = az * move + (dx / d) * side;
    w.update(dt, { mx: -mx, my: mz, sprint, jump: false, crouch }, 0, env.obstacles);
    // Shoot.
    if (W && aimWanted && W.aimK > 0.85 && W.draw > 0.85) {
      this.fireT -= dt; this.wantFire = true;
      if (this.fireT <= 0) {
        this.shoot(P, d, dx, dz); this.mag--;
        if (this.mag <= 0) { this.reloadT = this.reloadTotal = GUN.reload * (0.9 + Math.random() * 0.3); this.shots = 0; this.fireT = 0.3; if (d < 40 && env.audio.reloadSound) env.audio.reloadSound(this.reloadTotal, 'pistol'); }
        else if (++this.shots % GUN.burst === 0) this.fireT = lerp(GUN.pause[0], GUN.pause[1], Math.random()); else this.fireT = GUN.gap;
      }
    } else this.wantFire = false;
  }

  // Fists: step in, wind up, swing. He hits at one moment in the swing, and only if you are still in reach and in front of him.
  fists(dt, P, d, yaw) {
    const w = this.walker, env = this.mgr.env; this.cd = Math.max(0, this.cd - dt);
    if (this.atk) {
      const a = this.atk; a.t += dt; const k = clamp(a.t / a.def.dur, 0, 1);
      w.melee = { kind: 'cross', k, hit: a.def.hit, hand: a.def.hand, blade: false }; w.meleeYaw = yaw;
      if (!a.done && k >= a.def.hit) {
        a.done = true;
        const dx = P.x - w.x, dz = P.z - w.z, dist = Math.hypot(dx, dz), ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - w.h));
        if (dist <= a.def.reach + 0.2 && ang < 0.9 && !(P.down > 0.3)) {
          let dmg = a.def.dmg * (P.crouching ? 0.7 : 1);
          env.hurt(dmg); if (env.audio.thump) env.audio.thump(0.3 + a.def.knock * 0.25); if (env.shake) env.shake(0.12 + a.def.knock * 0.18);
          if (a.def.knock) P.knockDown(dx / (dist || 1) * 4.5, dz / (dist || 1) * 4.5);
        } else if (env.audio.swish) env.audio.swish(0.3);
      }
      if (k >= 1) { this.atk = null; w.melee = null; w.meleeYaw = null; this.cd = a.name === 'jab' ? 0.2 + Math.random() * 0.25 : 0.65 + Math.random() * 0.6; }
      return;
    }
    if (this.cd <= 0 && d <= 1.75 && !(P.down > 0.3)) {
      let name = this.combo === 1 ? 'cross' : ['jab', 'jab', 'cross', 'cross', 'hook'][(Math.random() * 5) | 0];
      this.combo = name === 'jab' ? 1 : 0; this.atk = { name, def: BLOWS[name], t: 0, done: false };
      if (env.audio.swish) env.audio.swish(0.22);
    }
  }

  shoot(P, d, dx, dz) {
    const m = this.mgr, env = m.env, fx = env.police.fx, g = this.gun, W = this.W, tY = P.y + 1.25 - (P.crouch || 0) * 0.45;
    g.updateMatrixWorld(true); _v.copy(g.userData.muzzle).applyMatrix4(g.matrixWorld); const mx = _v.x, my = _v.y, mz = _v.z;
    if (!this.fired) { this.fired = true; if (env.gunCrime) env.gunCrime(); }                                    // the first shot in the street: the police are on their way
    const blk = env.blocked ? env.blocked(mx, my, mz, P.x, tY, P.z) : null;
    if (blk) {
      const L = Math.hypot(P.x - mx, tY - my, P.z - mz) || 1, bt = 0.4 + blk.t, bx = mx + (P.x - mx) / L * bt, by = my + (tY - my) / L * bt, bz = mz + (P.z - mz) / L * bt;
      fx.tracer(mx, my, mz, bx, by, bz, 0.035, 0.06); fx.flash(mx, my, mz, 0.16, 0.05, 3.5); W.recoil = Math.min(1.2, W.recoil + 0.45);
      for (let i = 0; i < 3; i++) fx.spark(bx, by, bz, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 0.3);
      env.audio.copShot(1, mx, my, mz); return;
    }
    // Worse the further you are and the faster you move; a civilian is a worse shot than the police.
    let p = 0.4 - d / 80 - (P.crouching ? 0.1 : 0) - Math.min(0.18, (P.speed || 0) * 0.035); p = clamp(p, 0.05, 0.4) * (this.t < 1.6 ? 0.5 : 1);
    const hit = Math.random() < p; let ex = P.x, ey = tY, ez = P.z;
    if (!hit) { const k = 0.7 + Math.random() * 1.1, a = Math.random() * 6.283; ex += Math.cos(a) * k; ez += Math.sin(a) * k; ey += (Math.random() - 0.5) * 1.1; const ext = 1 + 6 / Math.max(d, 4); ex = mx + (ex - mx) * ext; ey = my + (ey - my) * ext; ez = mz + (ez - mz) * ext; }
    fx.tracer(mx, my, mz, ex, ey, ez, 0.035, 0.06); fx.flash(mx, my, mz, 0.16, 0.05, 3.5);
    W.recoil = Math.min(1.2, W.recoil + 0.45); env.audio.copShot(1, mx, my, mz);
    if (hit) { env.hurt(GUN.dmg); if (env.shake) env.shake(0.12); } else if (d < 30) fx.spark(ex, Math.max(ey, 0.05), ez, 0, 2, 0, 0.25);
  }
}

export class Brawlers {
  // env: { scene, walker (the player), police, audio, hud, quality, shadows, obstacles, blocked, onFoot(), hurt(d), shake(v), reward(n, text), gunCrime(), assault(n) }
  constructor(env) { this.env = env; this.list = []; this.cap = CAPS[env.quality] || 4; this.downs = 0; this.taken = 0; this.enabled = true; }
  get active() { return this.list.some(b => b.alive); }
  get living() { return this.list.filter(b => b.alive).length; }
  // A pedestrian (peds.js) has been attacked: if he is armed or a big man, he becomes a fighter. Returns the fighter, or null (nobody fights back: too many already, or he is just a citizen).
  take(p, info = {}) {
    if (!this.enabled || !p || p.kind === 'civ' || this.living >= this.cap) return null;
    const kind = p.kind === 'bruiser' ? (Math.random() < 0.28 ? 'enforcer' : 'bruiser') : 'armed';
    const key = p.real && /^ped_m/.test(p.real.key) ? p.real.key : MALE[(Math.random() * MALE.length) | 0];                  // (a man's model; the same one he was walking about in, if he was one of the real people)
    const b = new Brawler(this, kind, key, p); this.list.push(b); this.taken++;
    if (info.dir) { b.dir.x = info.dir.x; b.dir.z = info.dir.z; }
    return b;
  }
  // Armed people near a gunshot join in (they carry a gun because they mean to use it). `peds` is the crowd.
  gunfire(peds, x, z, r = 18) {
    if (!this.enabled) return;
    for (const p of peds.list) {
      if (p.kind !== 'armed' || p.state === 'down' || p.state === 'away' || p.state === 'watch') continue;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 > r * r || Math.random() > 0.5) continue;
      const b = peds.provoke(p, {}); if (!b) break;
    }
  }
  clear() { for (const b of this.list) this.dispose(b); this.list.length = 0; }
  dispose(b) { b.walker.show(false); if (b.gun) { b.gun.visible = false; this.env.scene.remove(b.gun); } this.env.scene.remove(b.walker.mesh); this.env.scene.remove(b.walker.blob); }
  // An explosion: everyone near it is hurt and thrown.
  blast(x, z, y, radius, dmg) {
    for (const b of this.list) {
      if (!b.alive) continue; const d = Math.hypot(b.x - x, b.z - z); if (d > radius) continue; const fall = 1 - d / radius;
      b.dir.x = (b.x - x) / (d || 1); b.dir.z = (b.z - z) / (d || 1); b.hit(dmg * fall * 0.9, { blast: true, knock: 1 }); if (b.alive) b.walker.knockDown(b.dir.x * 5 * fall, b.dir.z * 5 * fall);
    }
  }
  update(dt) {
    for (const b of this.list) b.update(dt);
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].remove) { this.dispose(this.list[i]); this.list.splice(i, 1); }
  }
}
