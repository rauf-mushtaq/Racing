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
const KEYS = { staff: 'ped_f1', boxer: 'hoodie', lifter: 'ped_m3', runner: 'ped_f3', sparA: 'tee', sparB: 'ped_m1' };
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
    if (r === 'runner') w.treadmill = 3.0;
    if (r === 'lifter') { w.lift = (w.lift || 0) + dt * 2.4; }
    if ((r === 'sparA' || r === 'sparB') && G.partner(this)) {
      const o = G.partner(this).walker, yaw = Math.atan2(o.x - w.x, o.z - w.z); w.h += wrapAngle(yaw - w.h) * Math.min(1, dt * 6);
      if (w.body && w.body.ready('guard')) {
        if (!w.body.act) w.play('guard', { lock: false, root: false, fade: 0.3 });
        this.next -= dt;
        if (this.next <= 0 && w.body.act && w.body.act.name === 'guard') {
          this.next = 1.6 + Math.random() * 2.2; const name = ['jab', 'jab', 'cross', 'body', 'kick'][(Math.random() * 5) | 0];
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
  partner(g) { return this.goers.find(o => o !== g && (o.role === 'sparA' || o.role === 'sparB')); }
  toast(t, s = 1.6) { this.env.toast && this.env.toast(t, s); }

  begin(venue) {
    this.end(); const I = this.env.interior; this.room = I.room; this.venue = venue; this.active = true; this.session = null;
    this.goers = this.room.spots.map(s => new Goer(this, s));
    if (!this.dumbbells) { this.dumbbells = [dumbbellMesh(), dumbbellMesh()]; for (const m of this.dumbbells) { m.visible = false; this.env.scene.add(m); } }
    this.showHud(true);
    this.toast(this.tier ? `IRON CITY GYM: ${TIERS[this.tier - 1].name} MEMBER` : 'IRON CITY GYM: SEE THE FRONT DESK FOR A MEMBERSHIP', 2.6);
  }
  end() {
    this.stop(); for (const g of this.goers) g.dispose(); this.goers.length = 0; this.active = false; this.room = null; this._prompt = '';
    if (this.dumbbells) for (const m of this.dumbbells) m.visible = false;
    this.showMenu(false); this.showHud(false);
  }
  // Melee targets in here: none (it is a gym: the bags are for hitting).
  targets() { return null; }

  // The use button: the desk opens the memberships; a machine or a bag starts (or stops) training; by the door, out.
  use() {
    if (!this.active) return false; const P = this.env.walker, R = this.room;
    if (this.menuOpen) { this.showMenu(false); return true; }
    if (this.session) { this.stop(); return true; }
    if (Math.hypot(R.exit.x - P.x, R.exit.z - P.z) < 1.7) return 'exit';
    const it = this.nearest(); if (!it) return false;
    if (it.type === 'desk') { this.showMenu(true); return true; }
    if (!this.tier) { this.toast('YOU NEED A MEMBERSHIP: SEE THE FRONT DESK', 1.8); return true; }
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
  #gymhud.hidden, #gymmenu.hidden { display: none; }
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
