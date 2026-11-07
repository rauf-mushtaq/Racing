// Police officers on foot. When you are on foot and a police car gets close and can see you, it pulls up (its `held` flag: updateCop stops it
// if `holds` says so) and two officers step out (one SWAT pair from a pursuit truck). They are real people (people.js COPS) animated with the
// same walk, run and gun-holding code as the player (Walker, in its lite mode), with a pistol or a submachine gun in their hands.
//
// What they do: most hold a distance of about 10 to 25 metres, standing or crouching, and fire bursts at you, missing more the further away
// you are and the faster you move or the lower you crouch; some rush you, firing as they come, and arrest you if they get right up beside you
// and you stay put (police.js counts them toward the bust). They run dry and reload (crouching, with the gun tipped and the other hand
// reaching for a magazine, and they cannot fire meanwhile). They call for backup on the radio (a hand to the shoulder, standing still and
// open to a shot: kill them first and no call is made) when they first find you, when one is badly hurt, and when a colleague is shot beside
// them. They vault cars, bins, benches, hydrants and road barriers that get in their way. Your bullets, rockets and grenades hurt them (a
// shot to the head hurts more); when the last officer of a car is down, or has gone back to it, that car drives on. If you get back in your
// car the officers run back to theirs and the cars give chase again. Your armour (police.health) is what their bullets take, and it creeps
// back when you are left alone.
import * as THREE from 'three';
import { Walker } from './walker.js';
import { COPS, preload } from './people.js';
import { makeGun, placeGun, WEAPONS } from './weapons.js';
import { raycastStatic } from './police.js';
import { queryColliders } from './city.js';
import { clamp, damp, lerp, wrapAngle } from './util.js';

const CAPS = { ultra: 8, high: 6, medium: 4, low: 3 };
const NOINP = { mx: 0, my: 0, sprint: false, jump: false, crouch: false };
const _v = new THREE.Vector3(), found = [];
const KINDS = {
  pistol: { cfg: WEAPONS.pistol.cfg, dmg: 4.6, gap: 0.36, burst: 3, pause: [1.0, 1.9], mag: 12, reload: 1.5 },
  smg: { cfg: WEAPONS.smg.cfg, dmg: 3.2, gap: 0.11, burst: 6, pause: [0.9, 1.6], mag: 30, reload: 2.3 },
};
const guns = {};
const gunFor = kind => (guns[kind] || (guns[kind] = makeGun(kind))).clone(true);
const CALL_TIME = 1.5, BACKUP_COOLDOWN = 16;

class Officer {
  constructor(mgr, car, key, kind, style, side) {
    this.mgr = mgr; this.car = car; this.key = key; this.kind = KINDS[kind]; this.style = style; this.side = side;
    const env = mgr.env;
    this.walker = new Walker(env.scene, key, { lite: true });
    this.gun = gunFor(kind); this.gun.visible = false; env.scene.add(this.gun);
    const W = this.W = { draw: 0, aimK: 0, twist: 0, pitch: 0, recoil: 0, reload: 0, radio: 0, cfg: this.kind.cfg, out: { palm: new THREE.Vector3(), q: new THREE.Quaternion(), palmL: new THREE.Vector3() } };
    this.walker.arms = W; this.walker.placeWeapon = w => placeGun(w, this.gun, W, W.draw);
    this.hp = this.maxHp = kind === 'smg' ? 120 : 62; this.dead = false; this.deadT = 0; this.remove = false; this.retreat = false; this.retreatT = 0;
    this.exitT = 0.9; this.t = Math.random() * 6; this.los = false; this.losT = 0; this.seen = 0; this.lx = 0; this.lz = 0;
    this.fireT = 0.6 + Math.random() * 0.8; this.shots = 0; this.crouching = false; this.crouchT = 2 + Math.random() * 2; this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 1 + Math.random() * 2;
    this.mag = this.kind.mag; this.reloadT = 0; this.reloadTotal = 1;                                  // ammunition
    this.radioT = 0; this.callKind = null; this.wantCall = null; this.calledContact = false; this.calledWounded = false;      // the radio
    this.vault = null; this.stuckT = 0; this.probeT = 0; this.vaultCd = 0;                            // climbing
  }
  get x() { return this.walker.x; } get z() { return this.walker.z; }
  get crouched() { return this.walker.crouch > 0.5; }

  update(dt) {
    const m = this.mgr, env = m.env, P = env.walker, police = env.police, w = this.walker, W = this.W;
    this.t += dt;
    if (!this.shadowsSet && w.person) { w.person.setShadows(!!env.shadows); this.shadowsSet = true; }
    if (this.dead) {                                                                   // lying where it fell
      this.deadT += dt; w.downT = 1e9; W.draw = Math.max(0, W.draw - dt * 4); W.radio = 0; w.faceYaw = null; w.noClip = false; w.update(dt, NOINP, 0, env.obstacles);
      if (W.draw < 0.35) this.gun.visible = false;
      if (this.deadT > 10) this.remove = true; return;
    }
    const dx = P.x - w.x, dz = P.z - w.z, d = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz), running = police.result === 'running';

    // Vaulting something that was in the way: a jump with no collisions, in a straight line, until the feet are down again.
    if (this.vault) {
      const v = this.vault; v.t += dt; w.faceYaw = null; W.aimK = damp(W.aimK, 0, 8, dt); W.radio = 0;
      w.update(dt, { mx: -v.dx, my: v.dz, sprint: false, jump: false, crouch: false }, 0, null);
      if ((w.grounded && v.t > 0.3) || v.t > 1.4) { this.vault = null; w.noClip = false; this.stuckT = 0; }
      return;
    }
    // Can it see you? (A few times a second; smoke and buildings block it, and crouching makes you harder to see.)
    this.losT -= dt;
    if (this.losT <= 0) { this.losT = 0.14 + Math.random() * 0.1; this.los = police.canSee(w.x, w.z, P.x, P.z, Math.max(30, P.sight || 100)); if (this.los) { this.lx = P.x; this.lz = P.z; this.seen = 0; } }
    this.seen += dt; this.exitT = Math.max(0, this.exitT - dt);

    // Radio: a hand to the shoulder while a call goes out. Reload: the magazine runs out, and a new one goes in.
    if (this.radioT > 0) { this.radioT -= dt; if (this.radioT <= 0) m.finishCall(this); }
    W.radio = damp(W.radio, this.radioT > 0 ? 1 : 0, 9, dt);
    if (this.reloadT > 0) { this.reloadT -= dt; W.reload = clamp(1 - this.reloadT / this.reloadTotal, 0, 1); if (this.reloadT <= 0) { this.mag = this.kind.mag; W.reload = 0; } } else W.reload = 0;
    const calling = this.radioT > 0, reloading = this.reloadT > 0;
    if (!calling && !this.retreat && running && this.exitT <= 0) {
      if (this.wantCall) { if (m.requestCall(this, this.wantCall)) this.wantCall = null; else if (m.backupT > 0) this.wantCall = null; }
      else if (!this.calledContact && this.los && this.t > 3) { this.calledContact = true; if (Math.random() < 0.6) m.requestCall(this, 'contact'); }
    }

    let tx = this.lx || P.x, tz = this.lz || P.z, move = 0, sprint = false, crouch = false, back = false;
    if (this.retreat) {                                                                // you got back in your car: back to theirs
      tx = this.car.x; tz = this.car.z; move = 1; this.retreatT += dt;
      if (Math.hypot(tx - w.x, tz - w.z) < 2.6 || this.retreatT > 6) { this.remove = true; return; }
    } else if (this.exitT > 0 || !running) move = 0;
    else if (calling) { move = 0; crouch = true; }                                     // (standing still to talk: crouched, and not firing)
    else if (this.style === 'rush') {
      if (d > 2.6) { move = 1; sprint = d > 16 || (!this.los && d > 8); }
      if (reloading) sprint = false;
    } else if (!this.los && this.seen > 1.5) move = 1;                                 // lost you: go to where you were
    else if (reloading) { move = 0; crouch = true; }                                   // get down and reload
    else if (d > 24) move = 1;
    else if (d < 9.5) { move = 0.7; back = true; tx = w.x - dx; tz = w.z - dz; }       // too close: back off, still facing you
    else {                                                                             // hold here: stand, crouch, sidestep
      this.crouchT -= dt; if (this.crouchT <= 0) { this.crouching = !this.crouching && Math.random() < 0.55; this.crouchT = 1.5 + Math.random() * 2.5; }
      this.strafeT -= dt; if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 1 + Math.random() * 2.5; move = 0; }
      crouch = this.crouching;
    }
    // Steering: toward the target, round whatever is in the way, away from other officers.
    let ax = tx - w.x, az = tz - w.z, al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    if (back) { ax = -dx / d; az = -dz / d; }
    if (move > 0) {
      const ahead = raycastStatic(w.x, w.z, ax, az, 5);
      if (ahead < 4) {
        const l = raycastStatic(w.x, w.z, ax * Math.cos(0.8) - az * Math.sin(0.8), ax * Math.sin(0.8) + az * Math.cos(0.8), 6), r = raycastStatic(w.x, w.z, ax * Math.cos(-0.8) - az * Math.sin(-0.8), ax * Math.sin(-0.8) + az * Math.cos(-0.8), 6), a = l > r ? 0.9 : -0.9;
        const nx = ax * Math.cos(a) - az * Math.sin(a), nz = ax * Math.sin(a) + az * Math.cos(a); ax = nx; az = nz;
      }
      for (const o of m.list) { if (o === this || o.dead) continue; const ex = w.x - o.x, ez = w.z - o.z, ed = Math.hypot(ex, ez); if (ed < 1.4 && ed > 1e-3) { ax += ex / ed * 0.6; az += ez / ed * 0.6; } }
      const nl = Math.hypot(ax, az) || 1; ax /= nl; az /= nl;
    }
    // Something low and climbable right in the way (a car, a bin, a barrier)? Mostly they go over it rather than round, and always if they are stuck.
    if (move > 0 && this.exitT <= 0 && w.grounded) {
      this.stuckT = w.speed < 0.6 ? this.stuckT + dt : Math.max(0, this.stuckT - dt * 2); this.probeT -= dt;
      if (this.probeT <= 0) {
        this.probeT = 0.1; if (this.vaultCd > 0) this.vaultCd -= 0.1;
        else if (m.climbableAhead(w.x, w.z, ax, az, env)) {
          if (this.stuckT > 0.25 || Math.random() < 0.85) { this.vault = { t: 0, dx: ax, dz: az }; w.noClip = true; w.vx = ax * 3.8; w.vz = az * 3.8; w.vy = 6.0; w.grounded = false; w.faceYaw = null; w.h = Math.atan2(ax, az); this.vaultCd = 1.5; return; }
          this.vaultCd = 1.5;
        }
      }
    } else this.stuckT = Math.max(0, this.stuckT - dt * 2);

    // Where the gun points, and whether it is up.
    const aimWanted = !this.retreat && running && this.exitT <= 0.25 && this.los && d < 48 && (this.style === 'hold' || d < 15) && !calling && !reloading;
    W.draw = damp(W.draw, this.exitT > 0.45 ? 0 : 1, 7, dt); W.aimK = damp(W.aimK, aimWanted ? 1 : 0, 6, dt); W.recoil = Math.max(0, W.recoil - dt * 7);
    const chestY = w.y + 1.35, tY = P.y + 1.25 - (P.crouch || 0) * 0.45;
    W.pitch = clamp(Math.atan2(tY - chestY, Math.max(d, 2)), -0.8, 0.8); W.twist = wrapAngle(yaw - w.h);
    w.faceYaw = (W.aimK > 0.5 || calling) && W.draw > 0.5 ? yaw : null;
    this.gun.visible = W.draw > 0.35;
    // Move.
    const side = !move && this.style === 'hold' && !crouch && this.los && d >= 9.5 && d <= 24 && this.strafeT > 0.4 ? 0.4 * this.strafe : 0;      // (a sidestep, across your line of sight)
    const mx = ax * move + (-dz / d) * side, mz = az * move + (dx / d) * side;
    w.update(dt, { mx: -mx, my: mz, sprint, jump: false, crouch }, 0, env.obstacles);
    // Shoot (and when the magazine is empty, reload).
    if (aimWanted && W.aimK > 0.85 && W.draw > 0.85) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.shoot(P, d, dx, dz, tY); this.mag--;
        if (this.mag <= 0) { this.reloadT = this.reloadTotal = this.kind.reload * (0.9 + Math.random() * 0.3); this.shots = 0; this.fireT = 0.3; if (d < 40) env.audio.reloadSound(this.reloadTotal, 'pistol'); }
        else if (++this.shots % this.kind.burst === 0) this.fireT = lerp(this.kind.pause[0], this.kind.pause[1], Math.random()) * (this.style === 'rush' ? 0.7 : 1); else this.fireT = this.kind.gap;
      }
    }
  }

  shoot(P, d, dx, dz, tY) {
    const m = this.mgr, env = m.env, fx = env.police.fx, g = this.gun, W = this.W;
    g.updateMatrixWorld(true); _v.copy(g.userData.muzzle).applyMatrix4(g.matrixWorld); const mx = _v.x, my = _v.y, mz = _v.z;
    // Does it hit? Worse the further you are, the faster you run and the lower you crouch, and a little worse for the first moments.
    let p = 0.5 - d / 85 - (P.crouching ? 0.12 : 0) - Math.min(0.2, (P.speed || 0) * 0.04) + (this.kind === KINDS.smg ? 0.05 : 0);
    p = clamp(p, 0.06, 0.62) * (this.t < 1.8 ? 0.5 : 1);
    const hit = Math.random() < p;
    let ex = P.x, ey = tY, ez = P.z;
    if (!hit) { const k = 0.7 + Math.random() * 1.1, a = Math.random() * 6.283; ex += Math.cos(a) * k; ez += Math.sin(a) * k; ey += (Math.random() - 0.5) * 1.1; const ext = 1 + 6 / Math.max(d, 4); ex = mx + (ex - mx) * ext; ey = my + (ey - my) * ext; ez = mz + (ez - mz) * ext; }
    fx.tracer(mx, my, mz, ex, ey, ez, 0.035, 0.06); fx.flash(mx, my, mz, 0.16, 0.05, 3.5);
    for (let i = 0; i < 2; i++) fx.spark(mx, my, mz, (ex - mx) / d * (6 + Math.random() * 10) + (Math.random() - 0.5) * 3, Math.random() * 2, (ez - mz) / d * (6 + Math.random() * 10) + (Math.random() - 0.5) * 3, 0.2);
    W.recoil = Math.min(1.2, W.recoil + 0.45);
    env.audio.copShot(clamp(1.2 - d / 110, 0.18, 1));
    if (hit) m.hitPlayer(this.kind.dmg, this);
    else if (d < 30) fx.spark(ex, Math.max(ey, 0.05), ez, 0, 2, 0, 0.25);
  }
}

export class Officers {
  // env: { scene, police, walker (the player), audio, hud, obstacles(x, z), onFoot(), shadows, quality }
  constructor(env) {
    this.env = env; this.list = []; this.ready = false; this.loading = false; this.cap = this.fullCap = CAPS[env.quality] || 4; this.enabled = true; this.sinceHit = 99; this.first = true; this.seed = 7; this.backupT = 0;
  }
  rnd() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  prepare() {                                                                          // load the four models (a little over three megabytes) before the first deployment
    if (this.ready || this.loading) return; this.loading = true;
    Promise.all(Object.keys(COPS).map(k => preload(k))).then(() => { this.ready = true; }).catch(e => { console.warn('police officers not loaded', e); this.enabled = false; });
  }
  // updateCop asks: should this police car stay where it is?
  holds(c, dist) {
    if (!this.enabled || c.spent || c.wreck) return false;
    if (c.officers > 0) return true;                                                   // its officers are out: wait for them
    if (!this.env.onFoot()) { c.held = false; return false; }
    if (!this.ready) return false;
    if (c.held) { if (dist > 95) c.held = false; return c.held; }
    if (c.sees && dist < 34) { c.held = true; return true; }
    return false;
  }
  clear() { for (const o of this.list) this.dispose(o); this.list.length = 0; for (const c of this.env.police.cops) { c.held = false; c.officers = 0; c.deployed = false; c.spent = false; } this.sinceHit = 99; this.first = true; this.backupT = 0; }
  dispose(o) { o.walker.show(false); o.gun.visible = false; this.env.scene.remove(o.gun); this.env.scene.remove(o.walker.mesh); this.env.scene.remove(o.walker.blob); }
  get living() { let n = 0; for (const o of this.list) if (!o.dead && !o.retreat) n++; return n; }
  // How many officers are close enough to grab you.
  nearCount(p, r) { let n = 0; for (const o of this.list) if (!o.dead && !o.retreat && o.exitT <= 0 && Math.hypot(o.x - p.x, o.z - p.z) < r) n++; return n; }

  standDown() { for (const o of this.list) if (!o.dead) { o.retreat = true; o.retreatT = 0; o.radioT = 0; } }

  // Something low in front that an officer can get over: a car (or anything the walkers bump into that is as wide as one), a bin, a bench, a hydrant, a road barrier.
  climbableAhead(x, z, ax, az, env) {
    const px = x + ax * 0.9, pz = z + az * 0.9;
    for (const o of env.obstacles(px, pz)) if (o.r >= 0.8 && Math.hypot(o.x - px, o.z - pz) < o.r + 0.6) return true;
    queryColliders(px, pz, 0.8, found);
    for (const c of found) {
      if (c.type !== 'circ' || Math.hypot(c.x - px, c.z - pz) > c.r + 0.6) continue;
      if (c.brk ? (c.brk.kind === 'bin' || c.brk.kind === 'bench' || c.brk.kind === 'hydrant') : (c.r >= 0.75 && c.r <= 1.05)) return true;
    }
    return false;
  }

  // The radio. An officer asks (it takes a moment, during which he stands still and open to a shot), and the call goes out when he is done.
  requestCall(o, kind) {
    if (this.backupT > 0 || o.dead || o.retreat || o.radioT > 0) return false;
    const P = this.env.police; if (P.cops.filter(c => !c.wreck).length >= 28) return false;
    o.radioT = CALL_TIME; o.callKind = kind; this.backupT = BACKUP_COOLDOWN; return true;
  }
  finishCall(o) {
    const P = this.env.police, big = o.callKind === 'down';
    P.callBackup(this.env.walker, big ? 2 : 1, big && P.stars >= 3);
    this.env.hud.toast(big ? 'OFFICER DOWN: BACKUP CALLED' : 'OFFICER REQUESTS BACKUP', 1.8); this.env.audio.beep(1700, 0.04, 0.12); setTimeout(() => this.env.audio.beep(1300, 0.05, 0.12), 80);
  }

  deploy() {
    const P = this.env.police, free = this.cap - this.list.filter(o => !o.dead).length;
    if (free <= 0) return;
    let used = 0;
    for (const c of P.cops) {
      if (used >= free) break;
      if (!c.held || c.deployed || c.wreck || c.speed > 2.5) continue;
      const n = Math.min(2, free - used); if (n <= 0) break;
      c.deployed = true; c.officers = 0;
      for (let i = 0; i < n; i++) { this.spawn(c, i); c.officers++; used++; }
      if (this.first) { this.first = false; this.env.hud.toast('OFFICERS OUT OF THE CAR', 1.8); this.env.audio.beep(520, 0.1, 0.2); }
    }
  }
  spawn(c, i) {
    const swat = !!c.kind, key = swat ? 'cop_swat' : ['cop_blue', 'cop_black', 'cop_vest'][Math.floor(this.rnd() * 3)];
    const o = new Officer(this, c, key, swat ? 'smg' : 'pistol', this.rnd() < (swat ? 0.25 : 0.34) ? 'rush' : 'hold', i ? -1 : 1);
    const f = [Math.sin(c.h), Math.cos(c.h)], r = [-Math.cos(c.h), Math.sin(c.h)], sd = i ? -1 : 1;
    const x = c.x + r[0] * sd * 1.7 + f[0] * 0.5, z = c.z + r[1] * sd * 1.7 + f[1] * 0.5, P = this.env.walker;
    o.walker.place(x, z, Math.atan2(P.x - x, P.z - z)); this.list.push(o);
  }

  // A bullet hurts an officer: true if it kills.
  damage(o, amount, head) {
    if (o.dead) return false; o.hp -= amount; o.retreat = false; o.style = 'hold';
    if (o.hp > 0) { if (o.hp < o.maxHp * 0.5 && !o.calledWounded) { o.calledWounded = true; o.wantCall = 'wounded'; } return false; }
    this.kill(o, this.env.walker.x, this.env.walker.z, 2.2); return true;
  }
  kill(o, fromX, fromZ, power) {
    if (o.dead) return; o.dead = true; o.deadT = 0; o.hp = 0; const w = o.walker, dx = w.x - fromX, dz = w.z - fromZ, d = Math.hypot(dx, dz) || 1;
    if (o.radioT > 0) { o.radioT = 0; this.backupT = 0; }                              // killed with the radio in his hand: no call
    o.vault = null; w.noClip = false;
    w.knockDown(dx / d * power, dz / d * power); w.downT = 1e9; this.env.police.officersDown = (this.env.police.officersDown || 0) + 1;
    const c = o.car; if (c) { c.officers = Math.max(0, (c.officers || 1) - 1); if (c.officers === 0) c.spentT = 4; }
    // The nearest officer who saw it radios for help.
    let best = null, bd = 35; for (const q of this.list) { if (q.dead || q.retreat || q === o) continue; const qd = Math.hypot(q.x - o.x, q.z - o.z); if (qd < bd) { bd = qd; best = q; } }
    if (best) best.wantCall = 'down';
  }
  // An explosion: everyone near it is hurt, and thrown.
  blast(x, z, y, radius, dmg) {
    for (const o of this.list) {
      if (o.dead) continue; const d = Math.hypot(o.x - x, o.z - z); if (d > radius) continue; const fall = 1 - d / radius;
      o.hp -= dmg * fall * 0.9; if (o.hp <= 0) this.kill(o, x, z, 6 * fall + 2); else { o.vault = null; o.walker.noClip = false; o.walker.knockDown((o.x - x) / (d || 1) * 5 * fall, (o.z - z) / (d || 1) * 5 * fall); if (o.hp < o.maxHp * 0.5 && !o.calledWounded) { o.calledWounded = true; o.wantCall = 'wounded'; } }
    }
  }
  hitPlayer(dmg, o) {
    const P = this.env.police; this.sinceHit = 0; P.health -= dmg; P.damageFlash = Math.min(1, P.damageFlash + 0.22); P.shake = Math.min(1, P.shake + 0.1);
    this.env.audio.thump(0.3); if (this.env.shake) this.env.shake(0.2);
  }

  update(dt) {
    const P = this.env.police, foot = this.env.onFoot();
    if (!P.active) { if (this.list.length) this.clear(); return; }
    if (!this.ready) this.prepare();
    if (foot && P.result === 'running' && this.ready) this.deploy();
    this.sinceHit += dt; this.backupT = Math.max(0, this.backupT - dt);
    for (const o of this.list) o.update(dt);
    // Tidy up: officers who have gone back to their car or lain there long enough; cars whose officers are done.
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i]; if (!o.remove) continue;
      const c = o.car; if (c && !o.dead) { c.officers = Math.max(0, (c.officers || 1) - 1); if (c.officers === 0) c.spent = true; }
      this.dispose(o); this.list.splice(i, 1);
    }
    for (const c of P.cops) if (c.spentT > 0) { c.spentT -= dt; if (c.spentT <= 0) c.spent = true; }
    if (foot && P.result === 'running' && this.sinceHit > 6 && P.health < 100) P.health = Math.min(100, P.health + dt * 2.5);      // catch your breath
  }
}
