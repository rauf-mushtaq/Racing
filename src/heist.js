// A hold-up. Walk into a shop, a jeweller, a bank or a museum (interior.js, rooms.js) and take what is worth taking. The people in there are real
// people with minds of their own: customers run or crouch; staff put their hands up when you pull a weapon, and press the alarm if you stop watching
// them (keep the gun on them, or knock them out); guards are armed and shoot; in the museum the guards patrol, the cameras sweep and the lasers
// guard the treasures. Every kind of place gets harder (see VENUES in venues.js): more people, more of them armed, quicker police, bigger takings,
// and a vault or a security system between you and the money.
//
// Things to take are the room's `items` (a till, a drawer, a safe, a glass case, a vault, a stack of cash, a treasure). Press the use button beside one
// to begin: it takes a few seconds, and goes on while you stay close. Loot goes in your bag; the bag is only banked when you are away from the police.
import * as THREE from 'three';
import { Walker } from './walker.js';
import { makeGun, placeGun, WEAPONS } from './weapons.js';
import { STAGE_Y } from './interior.js';
import { clamp, damp, lerp, wrapAngle } from './util.js';

const NOINP = { mx: 0, my: 0, sprint: false, jump: false, crouch: false };
const OUTFITS = {
  clerk: ['ped_m2', 'ped_f1', 'ped_m3'], teller: ['ped_f2', 'ped_m1', 'ped_f3'], customer: ['ped_m4', 'ped_f4', 'ped_f1', 'ped_m1'], owner: ['agent'], manager: ['agent'], guard: ['cop_black', 'cop_vest'],
};
const _v = new THREE.Vector3();
const guns = {};
const gunClone = () => (guns.pistol || (guns.pistol = makeGun('pistol'))).clone(true);

class Actor {
  constructor(H, spot, i) {
    this.H = H; this.spot = spot; this.role = spot.role; this.armed = !!spot.armed; this.i = i;
    const keys = OUTFITS[this.role] || OUTFITS.customer, key = keys[(H.seed + i) % keys.length];
    const w = this.walker = new Walker(H.env.scene, key, { lite: true }); w.interior = H.env.interior;
    w.place(spot.x, spot.z, spot.face); w.y = STAGE_Y; w.show(true);
    this.alive = true; this.state = spot.patrol ? 'patrol' : 'idle'; this.t = Math.random() * 5; this.hp = this.armed ? 70 : 34; this.pressT = null; this.hands = 0; this.remove = false;
    this.path = spot.patrol ? spot.patrol.map(p => [H.room.ox + p[0], H.room.oz + p[1]]) : null; this.pi = 0; this.seen = 0; this.fireT = 0.8; this.crouching = false; this.mag = 12; this.rel = 0;
    this.fleeT = 0; this.coverT = 0; this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 1;
    if (this.armed) {
      this.gun = gunClone(); this.gun.visible = false; H.env.scene.add(this.gun); this.gun.traverse(o => o.layers.set(1));
      const W = this.W = { draw: 0, aimK: 0, twist: 0, pitch: 0, recoil: 0, reload: 0, radio: 0, cfg: WEAPONS.pistol.cfg, out: { palm: new THREE.Vector3(), q: new THREE.Quaternion(), palmL: new THREE.Vector3() } };
      w.arms = W; w.placeWeapon = ww => placeGun(ww, this.gun, W, W.draw);
    }
  }
  get x() { return this.walker.x; } get z() { return this.walker.z; } get y() { return this.walker.y; }
  // Is the player in front of this one, close enough, and not behind a wall or a counter?
  sees(P, d, dx, dz, range = 22, cone = 1.9) {
    if (d > range) return false; const w = this.walker;
    if (d > 1.5 && Math.abs(wrapAngle(Math.atan2(dx, dz) - w.h)) > cone) return false;
    const I = this.H.env.interior, ey = w.y + 1.55, py = P.y + 1.3 - P.crouch * 0.4, r = I.trace(w.x, ey, w.z, dx / d, (py - ey) / d, dz / d, d);
    return r.t >= d - 0.35;
  }
  // A blow or a bullet. Staff and customers go down quickly; guards take more.
  hit(dmg, info = {}) {
    if (!this.alive) return;
    this.hp -= dmg * (info.head ? 2 : 1); this.H.violence(this);
    const w = this.walker, dir = info.dir || { x: 0, z: 1 };
    if (this.hp <= 0) { this.alive = false; this.state = 'down'; this.hands = 0; w.hands = 0; w.crouching = false; w.knockDown(dir.x * 3.5, dir.z * 3.5); w.downT = 1e9; if (this.gun) this.gun.visible = false; this.H.toast(this.role === 'guard' ? 'GUARD DOWN' : 'DOWN', 0.9); return; }
    if (info.knock > 0.8) w.knockDown(dir.x * 3, dir.z * 3);
    this.react(true);
  }
  react(hurt = false) {
    if (this.state === 'down' || this.state === 'fight' || this.state === 'flee') return;
    const r = this.role;
    if (r === 'customer') { if (Math.random() < 0.6) { this.state = 'flee'; } else { this.state = 'cower'; } }
    else if (r === 'guard' || this.armed) { this.state = 'fight'; this.H.alarmNow(r === 'guard' ? 'GUARD' : 'ARMED CLERK', 0); }
    else { if (this.state !== 'hands') { this.state = 'hands'; if (this.pressT == null) this.pressT = this.H.pressDelay(); } if (hurt) this.pressT = Math.max(this.pressT ?? 0, 2); }
  }
  update(dt, ctx) {
    const w = this.walker, P = ctx.P, H = this.H; this.t += dt;
    if (!this.alive) { w.downT = 1e9; w.update(dt, NOINP, 0, null); if (this.W) this.W.draw = Math.max(0, this.W.draw - dt * 4); return; }
    const dx = P.x - w.x, dz = P.z - w.z, d = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz);
    const sees = this.sees(P, d, dx, dz), calm = this.state === 'idle' || this.state === 'patrol';
    // What it takes to set one off: seeing you with a weapon out, hearing shots, seeing violence, or (a guard on patrol) catching you in the wrong place for long enough.
    if (calm) {
      if ((ctx.drawn && sees) || ctx.heard > 0 && d < 28 || (ctx.violence > 0 && sees)) this.react();
      else if (this.state === 'patrol' || this.spot.post) {
        if (sees && ctx.suspicious) { this.seen += dt * (d < 6 ? 2.2 : 1) * (P.crouching ? 0.6 : 1); H.suspect = Math.max(H.suspect, this.seen / 1.4); if (this.seen > 1.4) { this.react(); H.alarmNow('SPOTTED', 0); } }
        else this.seen = Math.max(0, this.seen - dt * 0.8);
      }
    }
    let mx = 0, mz = 0, crouch = false, face = null, hands = 0, sprint = false;
    switch (this.state) {
      case 'idle': face = this.spot.face; break;
      case 'patrol': {
        const p = this.path[this.pi], ex = p[0] - w.x, ez = p[1] - w.z, ed = Math.hypot(ex, ez);
        if (ed < 0.8) this.pi = (this.pi + 1) % this.path.length; else { mx = ex / ed * 0.55; mz = ez / ed * 0.55; }
        break;
      }
      case 'hands': {
        hands = 1; face = yaw; this.mark = true;
        const aimed = ctx.aimedAt(this);
        if (this.pressT != null) {                                                                              // creeping towards the button, unless you are watching
          if (aimed) this.pressT = Math.max(this.pressT, 1.5); else this.pressT -= dt * (ctx.threatNow ? 0.7 : 1);
          if (this.pressT <= 0 && !H.alarm) { this.pressT = null; H.alarmNow('A SILENT ALARM', H.type.delay); }
        }
        if (!ctx.drawn && !ctx.violence && this.t > 4 && !H.alarm && Math.random() < dt * 0.1) { this.state = 'idle'; }      // calms down once you put the weapon away
        break;
      }
      case 'cower': crouch = true; hands = 0.5; face = yaw; if (!ctx.drawn && !H.alarm && this.t > 6) { this.state = 'idle'; } break;
      case 'flee': {
        const ex = H.room.exit.x - w.x, ez = H.room.exit.z - w.z, ed = Math.hypot(ex, ez); sprint = true; mx = ex / (ed || 1); mz = ez / (ed || 1);
        if (ed < 1.3) { this.remove = true; w.show(false); } break;
      }
      case 'fight': this.fight(dt, ctx, d, dx, dz, yaw, sees); return;
    }
    // Idle staff who have been threatened and not been watched creep towards the button.
    if (this.state === 'idle' && this.pressT != null && !H.alarm) { this.pressT -= dt; if (this.pressT <= 0) { this.pressT = null; H.alarmNow('A SILENT ALARM', H.type.delay); } }
    w.hands = damp(w.hands, hands, 8, dt); w.faceYaw = null;
    if (face != null) { const dd = wrapAngle(face - w.h); w.h += dd * Math.min(1, dt * 6); }
    w.crouching = crouch;
    w.update(dt, { mx: -mx, my: mz, sprint, jump: false, crouch }, 0, null);
    if (this.W) this.W.draw = damp(this.W.draw, 0, 8, dt), this.gun.visible = this.W.draw > 0.35;
  }
  // A guard in a fight: face the player, keep 6 to 10 metres away, sidestep, and fire a few shots at a time.
  fight(dt, ctx, d, dx, dz, yaw, sees) {
    const w = this.walker, P = ctx.P, W = this.W, H = this.H; let mx = 0, mz = 0;
    if (!W) { this.state = 'hands'; return; }
    this.strafeT -= dt; if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 0.8 + Math.random() * 1.8; }
    const los = sees || d < 9; this.coverT = los ? 0 : this.coverT + dt;
    if (!los && this.coverT > 0.3) { mx = dx / d * 0.9; mz = dz / d * 0.9; }                                  // lost you: go to where you are
    else if (d > 9.5) { mx = dx / d * 0.8; mz = dz / d * 0.8; } else if (d < 5) { mx = -dx / d * 0.7; mz = -dz / d * 0.7; } else { mx = -dz / d * 0.4 * this.strafe; mz = dx / d * 0.4 * this.strafe; }
    const aim = los && d < 26;
    W.draw = damp(W.draw, 1, 8, dt); W.aimK = damp(W.aimK, aim ? 1 : 0.3, 7, dt); W.recoil = Math.max(0, W.recoil - dt * 7);
    const chestY = w.y + 1.35, tY = P.y + 1.25 - P.crouch * 0.45; W.pitch = clamp(Math.atan2(tY - chestY, Math.max(d, 2)), -0.8, 0.8); W.twist = wrapAngle(yaw - w.h);
    w.faceYaw = W.draw > 0.5 ? yaw : null; w.hands = damp(w.hands, 0, 8, dt); this.gun.visible = W.draw > 0.35;
    w.update(dt, { mx: -mx, my: mz, sprint: false, jump: false, crouch: false }, 0, null);
    this.fireT -= dt;
    if (this.rel > 0) { this.rel -= dt; W.reload = clamp(1 - this.rel / 1.5, 0, 1); if (this.rel <= 0) { this.mag = 12; W.reload = 0; } return; }
    if (aim && W.aimK > 0.85 && W.draw > 0.85 && this.fireT <= 0) {
      this.fireT = 0.5 + Math.random() * 0.45; this.mag--; if (this.mag <= 0) { this.rel = 1.5; ctx.audio.reloadSound && ctx.audio.reloadSound(1.5, 'pistol'); return; }
      this.shoot(ctx, P, d, tY);
    }
  }
  shoot(ctx, P, d, tY) {
    const g = this.gun, W = this.W, H = this.H, fx = ctx.fx;
    g.updateMatrixWorld(true); _v.copy(g.userData.muzzle).applyMatrix4(g.matrixWorld); const mx = _v.x, my = _v.y, mz = _v.z;
    let p = 0.58 - d / 40 - (P.crouching ? 0.12 : 0) - Math.min(0.2, (P.speed || 0) * 0.04); p = clamp(p, 0.08, 0.6) * (this.t < 1.5 ? 0.5 : 1) * H.type.aim;
    const hit = Math.random() < p; let ex = P.x, ey = tY, ez = P.z;
    if (!hit) { const k = 0.6 + Math.random() * 1.0, a = Math.random() * 6.283; ex += Math.cos(a) * k; ez += Math.sin(a) * k; ey += (Math.random() - 0.5) * 1.0; }
    const L = Math.hypot(ex - mx, ey - my, ez - mz) || 1, tr = H.env.interior.trace(mx, my, mz, (ex - mx) / L, (ey - my) / L, (ez - mz) / L, L + 4), bt = hit ? L : Math.min(L + 4, tr.t);
    const bx = mx + (ex - mx) / L * bt, by = my + (ey - my) / L * bt, bz = mz + (ez - mz) / L * bt;
    fx.tracer(mx, my, mz, bx, by, bz, 0.035, 0.07); fx.flash(mx, my, mz, 0.16, 0.05, 3.5); W.recoil = Math.min(1.2, W.recoil + 0.45);
    for (let i = 0; i < 2; i++) fx.spark(bx, by, bz, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 0.3);
    ctx.audio.copShot && ctx.audio.copShot(1, mx, my, mz); H.env.shake && H.env.shake(0.04);
    if (hit && tr.t >= L - 0.4) H.env.hurt(H.type.dmg);
  }
  dispose() {
    const w = this.walker, sc = this.H.env.scene; w.show(false); sc.remove(w.mesh); sc.remove(w.blob); if (this.gun) { sc.remove(this.gun); }
    if (w.person) for (const k in w.person.mats) { const m = w.person.mats[k]; for (const t of [m.map, m.normalMap, m.roughnessMap]) t && t.dispose(); }
  }
}

export class Heist {
  // env: { scene, interior, walker, arsenal, melee, audio, hud, fx, police, toast(text, secs), startWanted(), hurt(dmg), shake(v), cash }
  constructor(env) { this.env = env; this.active = false; this.actors = []; this.loot = 0; this.task = null; this.room = null; this.type = null; this.alarm = false; }
  get prompt() { return this._prompt || ''; }
  toast(t, s = 1.4) { this.env.toast && this.env.toast(t, s); }
  pressDelay() { const t = this.type; return t.press[0] + Math.random() * (t.press[1] - t.press[0]); }
  begin(venue, type) {
    this.end(); const I = this.env.interior, R = this.room = I.room; this.venue = venue; this.type = type; this.seed = (venue.seed ?? 1) >>> 0;
    this.active = true; this.loot = 0; this.task = null; this.alarm = false; this.alarmT = 0; this.dispatched = false; this.dispatchT = -1; this.suspect = 0; this.disabledT = 0; this.keycard = false; this.violenceT = 0; this.heardT = 0; this.doneItems = 0; this.value = 0;
    this.camSeen = 0; this.pulse = 0; this.lastBeep = 0; this.stats = { taken: 0, kills: 0 };
    this.actors = R.spots.map((s, i) => new Actor(this, s, i));
    for (const it of R.items) { it.hit = (dmg, info) => { if (it.type === 'case' && it.state === 'ready') this.smash(it); }; it.alive = false; it.kind = 'case'; if (it.type === 'case') it.alive = true; }
  }
  end() {
    for (const a of this.actors) a.dispose(); this.actors.length = 0; this.active = false; this.task = null; this._prompt = ''; this.room = null;
    if (this.env.interior.room) for (const L of this.env.interior.lights) L.color.set(0xfff1d8);
  }
  // Melee targets: the people (and the glass cases): see melee.js.
  targets() { if (!this.active) return null; const out = []; for (const a of this.actors) if (a.alive && !a.remove) out.push(a); for (const it of this.room.items) if (it.type === 'case' && it.state === 'ready') out.push(it); return out; }
  // A ray against the people and the cases: the nearest one in front of it.
  rayActors(ox, oy, oz, dx, dy, dz, maxT) {
    if (!this.active) return null; let best = maxT, ref = null; const hl = Math.hypot(dx, dz);
    for (const a of this.actors) {
      if (!a.alive || a.remove) continue; const ex = a.x - ox, ez = a.z - oz, s = (ex * dx + ez * dz) / (hl || 1); if (hl < 1e-6 || s < 0) continue; const d2 = ex * ex + ez * ez - s * s, r = 0.42; if (d2 > r * r) continue;
      const t = (s - Math.sqrt(r * r - d2)) / hl, y = oy + dy * t, top = a.walker.crouch > 0.5 ? 1.25 : 1.85; if (t >= 0 && t < best && y > a.y - 0.1 && y < a.y + top) { best = t; ref = a; }
    }
    for (const it of this.room.items) {
      if (it.type !== 'case' || it.state !== 'ready') continue; const x0 = it.x - it.sx, x1 = it.x + it.sx, z0 = it.z - it.sz, z1 = it.z + it.sz, y0 = this.room.oy + 0.9, y1 = this.room.oy + it.h;
      let tmin = 0, tmax = best; const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1]; let ok = true;
      for (let i = 0; i < 3 && ok; i++) { if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) ok = false; continue; } let a1 = (lo[i] - o[i]) / d[i], a2 = (hi[i] - o[i]) / d[i]; if (a1 > a2) [a1, a2] = [a2, a1]; tmin = Math.max(tmin, a1); tmax = Math.min(tmax, a2); if (tmin > tmax) ok = false; }
      if (ok && tmin < best) { best = tmin; ref = it; }
    }
    return ref ? { t: best, ref } : null;
  }
  // ---- Events ------------------------------------------------------------------------------------------------------------------------------------
  violence(who) { this.violenceT = 8; this.heardT = Math.max(this.heardT, 3); }
  gunshot() { this.heardT = 5; this.violenceT = 8; }
  alarmNow(reason, delay = 0) {
    if (this.alarm && this.dispatched) return;
    if (!this.alarm) { this.alarm = true; this.alarmT = 0; this.toast('ALARM: ' + reason, 2.4); }
    if (this.dispatchT < 0) this.dispatchT = Math.max(0, delay);
  }
  smash(it) {
    if (it.state !== 'ready') return; it.state = 'open'; it.label = 'GRAB THE JEWELS'; it.dur = 1.5; it.alive = false;
    if (it.glass) it.glass.visible = false; this.env.audio.clang && this.env.audio.clang(6); this.env.audio.beep && this.env.audio.beep(2400, 0.05, 0.2);
    for (let k = 0; k < 8; k++) this.env.fx.spark(it.x + (Math.random() - 0.5) * it.sx, this.room.oy + 1.2, it.z + (Math.random() - 0.5) * it.sz, (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4, 0.7);
    this.violence(); if (this.disabledT <= 0) this.alarmNow('GLASS BROKEN', this.type.delay);
  }
  // ---- The things to do --------------------------------------------------------------------------------------------------------------------------------
  // Which thing is the player at (within its reach and not behind a wall)? And what stops it being done?
  nearest() {
    const P = this.env.walker, R = this.room; let best = null, bd = 1e9;
    for (const it of R.items) {
      if (it.state === 'done' || it.state === 'taken') continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < it.r && d < bd && Math.abs(P.y - (R.oy)) < 3) { bd = d; best = it; }
    }
    // The manager (when he has his hands up): his key card.
    if (!this.keycard) for (const a of this.actors) if (a.role === 'manager' && a.alive && a.state === 'hands') { const d = Math.hypot(a.x - P.x, a.z - P.z); if (d < 1.9) { bd = d; best = { id: 'keycard', type: 'keycard', label: 'TAKE THE KEY CARD', dur: 1.2, r: 1.9, x: a.x, z: a.z, y: R.oy + 1, state: 'ready', actor: a }; } }
    return best;
  }
  blocker(it) {                                                                                                // why not yet?
    const P = this.env.walker;
    if (it.staff || it.type === 'keycard') { for (const a of this.actors) if (a.alive && !a.remove && (a.role === 'clerk' || a.role === 'teller' || a.role === 'owner') && (a.state === 'idle') && Math.hypot(a.x - it.x, a.z - it.z) < 6) return 'THE ' + a.role.toUpperCase() + ' IS WATCHING: THREATEN OR KNOCK THEM OUT'; }
    if (it.type === 'case' && it.state === 'ready') return null;
    if (it.type === 'stack' && it.locked) return 'THE VAULT IS SHUT';
    if (it.type === 'art' && it.laser && this.disabledT <= 0) { if (this.insideLasers(it)) return null; }
    return null;
  }
  insideLasers(it) { return true; }
  use() {
    if (!this.active) return false; const P = this.env.walker, R = this.room;
    if (Math.hypot(R.exit.x - P.x, R.exit.z - P.z) < 1.7) return 'exit';
    if (this.task) { this.task = null; return true; }
    const it = this.nearest(); if (!it) return false;
    const why = this.blocker(it); if (why) { this.toast(why, 1.6); return true; }
    if (it.type === 'case' && it.state === 'ready') { this.smash(it); return true; }
    let dur = it.dur, label = it.label;
    if (it.type === 'vault') { if (this.keycard) { dur = 3; } else { dur = it.dur; if (this.disabledT <= 0) this.alarmNow('DRILLING', this.type.delay); } }
    this.task = { it, t: 0, dur }; if (it.type === 'safe' || it.type === 'vault') this.env.audio.clang && this.env.audio.clang(3);
    return true;
  }
  finish(it) {
    this.task = null;
    switch (it.type) {
      case 'till': case 'drawer': case 'safe': case 'stack': this.take(it); break;
      case 'case': this.take(it); if (it.gems) it.gems.visible = false; break;
      case 'art': this.take(it); if (it.loud && this.disabledT <= 0) this.alarmNow('PRESSURE PLATE', this.type.delay); break;
      case 'vault': { it.state = 'done'; if (it.obj) it.obj.visible = false; if (it.box) it.box.dead = true; for (const s of this.room.items) if (s.type === 'stack') s.locked = false; this.toast('THE VAULT IS OPEN', 1.6); this.env.audio.clang && this.env.audio.clang(8); break; }
      case 'panel': { it.state = 'done'; this.disabledT = 55; for (const l of this.room.lasers) l.on = false; this.toast('SECURITY OFF FOR 55 SECONDS', 2.2); break; }
      case 'keycard': { this.keycard = true; this.toast('KEY CARD: THE VAULT WILL OPEN FASTER', 2); break; }
    }
  }
  take(it) {
    it.state = 'taken'; if (it.obj) it.obj.visible = false; if (it.gems) it.gems.visible = false; this.loot += it.value; this.value += it.value; this.stats.taken++;
    this.toast('+ $' + it.value.toLocaleString('en-US'), 1.2); this.env.audio.beep && (this.env.audio.beep(1400, 0.05, 0.2), setTimeout(() => this.env.audio.beep(2100, 0.07, 0.2), 70));
  }
  // ---- Every frame -------------------------------------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.active) return; const { walker: P, arsenal, interior: I } = this.env, R = this.room;
    this.violenceT = Math.max(0, this.violenceT - dt); this.heardT = Math.max(0, this.heardT - dt); this.disabledT = Math.max(0, this.disabledT - dt); this.suspect = Math.max(0, this.suspect - dt * 0.5);
    if (this.disabledT <= 0 && R.lasers.length && !R.lasers[0].on) for (const l of R.lasers) l.on = true;
    const carrying = this.loot > 0, near = it => Math.hypot(it.x - P.x, it.z - P.z) < 2.6;
    const drawn = arsenal.cur >= 0 && arsenal.draw > 0.6, aimK = arsenal.aimK;
    const suspicious = drawn || carrying || (R.items.some(it => it.laser && it.state !== 'taken' && near(it))) || (this.task && this.task.it.loud);
    const ctx = {
      P, drawn, suspicious, heard: this.heardT, violence: this.violenceT, threatNow: drawn, audio: this.env.audio, fx: this.env.fx,
      aimedAt: a => {                                                                                         // is the gun (or knife) on this one?
        if (!drawn) return false; const dx = a.x - P.x, dz = a.z - P.z, d = Math.hypot(dx, dz); if (d < 0.01) return true; const ap = arsenal.aimPoint, adx = ap.x - P.x, adz = ap.z - P.z;
        if (arsenal.hud.melee) return d < 2.4 && Math.abs(wrapAngle(Math.atan2(dx, dz) - P.h)) < 0.7;
        return d < 16 && Math.abs(wrapAngle(Math.atan2(dx, dz) - Math.atan2(adx, adz))) < 0.3 && aimK > 0.3;
      },
    };
    for (const a of this.actors) a.update(dt, ctx);
    this.actors = this.actors.filter(a => { if (a.remove) { a.dispose(); return false; } return true; });
    // Cameras: they see only what they would call a crime, and only while the security is on.
    if (this.disabledT <= 0 && R.cams.length) {
      let seen = false;
      for (const c of R.cams) {
        const yaw = c.yaw + Math.sin(I.t * 0.45 + c.x) * c.sweep, dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz);
        c.cur = yaw; if (d > c.range) continue; if (Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw)) > c.fov) continue;
        const dy = P.y + 1.3 - c.y, r = I.trace(c.x, c.y, c.z, dx / d, dy / d, dz / d, d + 0.2); if (r.t < d - 0.4) continue;
        seen = true;
      }
      if (seen && suspicious) { this.camSeen += dt; this.suspect = Math.max(this.suspect, this.camSeen / 2.2); if (this.camSeen > 2.2) this.alarmNow('CAMERAS', this.type.delay); } else this.camSeen = Math.max(0, this.camSeen - dt);
    }
    // Lasers.
    if (this.disabledT <= 0) for (const l of R.lasers) {
      if (!l.on) continue; const ax = l.a[0], az = l.a[1], bx = l.b[0], bz = l.b[1], vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1, t = clamp(((P.x - ax) * vx + (P.z - az) * vz) / L2, 0, 1), d = Math.hypot(P.x - (ax + vx * t), P.z - (az + vz * t));
      const top = P.y + (P.crouching ? 1.15 : 1.78); if (d < 0.32 && l.y > P.y + 0.05 && l.y < top) { this.alarmNow('LASER TRIPPED', this.type.delay); break; }
    }
    // The task in hand.
    if (this.task) {
      const it = this.task.it, d = Math.hypot(it.x - P.x, it.z - P.z);
      if (d <= it.r * 1.25 && P.down < 0.3) { this.task.t += dt; if (this.task.t >= this.task.dur) this.finish(it); } else if (d > it.r * 2) this.task = null;
      if (it.type === 'vault' && this.task && (Math.floor(this.task.t * 4) !== Math.floor((this.task.t - dt) * 4)) && !this.keycard) this.env.audio.beep && this.env.audio.beep(180 + Math.random() * 60, 0.05, 0.15);
    }
    // The alarm: a bell, red lights, and the police on the way.
    if (this.alarm) {
      this.alarmT += dt; this.pulse = (Math.sin(this.alarmT * 7) + 1) / 2;
      for (const L of I.lights) L.color.setRGB(1, 0.3 + 0.7 * (1 - this.pulse), 0.25 + 0.7 * (1 - this.pulse));
      if (this.alarmT - this.lastBeep > 0.42) { this.lastBeep = this.alarmT; this.env.audio.beep && this.env.audio.beep(this.alarmT % 0.84 < 0.42 ? 1180 : 880, 0.2, 0.12); }
      if (this.dispatchT >= 0 && !this.dispatched) { this.dispatchT -= dt; if (this.dispatchT <= 0) { this.dispatched = true; this.env.startWanted(this.type.stars); } }
    }
    // The prompt: what the use button will do here.
    const exitD = Math.hypot(R.exit.x - P.x, R.exit.z - P.z), it = this.task ? this.task.it : this.nearest();
    this._prompt = this.task ? 'STOP' : exitD < 1.7 ? 'LEAVE' : it ? (this.blocker(it) ? it.label : it.label) : '';
    this._blocked = it && !this.task ? this.blocker(it) : null;
  }
  get progress() { return this.task ? clamp(this.task.t / Math.max(0.01, this.task.dur), 0, 1) : -1; }
}
