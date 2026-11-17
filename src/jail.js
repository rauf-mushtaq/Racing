// A police station (venues.js puts them on the streets; rooms.js has the plan). Walk in and it is the public lobby: the front desk behind glass, a
// bench, a locked steel door to the custody suite. Be arrested (stop.js, or caught at the end of a chase) and you are brought here and booked: the
// charges, the days you will serve, what has been taken off you. Then the cell: a steel bunk, a steel toilet, bars, a slot of sky high in the back wall.
//
// Time passes in the cells (an hour every few seconds; sleep on the bunk to get through the night, or rest for three hours in the day): a head count at
// seven, breakfast through the hatch at eight, lunch, dinner, lights out at ten. The window goes from night to dawn to day to dusk. The man in the next
// cell paces, the one beyond him shadow-boxes, another stands at his bars; a custody officer walks the corridor and looks in on each of you. On the morning
// you are due out, he comes to your door, it slides open, the custody door opens, and you walk out through the lobby: your car is parked outside.
import { Walker } from './walker.js';
import { clamp, damp, wrapAngle } from './util.js';

export const HOUR = 3.5;                                     // real seconds to an hour in the cells
const NOINP = { mx: 0, my: 0, sprint: false, jump: false, crouch: false };
const SCHEDULE = [[7, '07:00 · HEAD COUNT: ON YOUR FEET'], [8, '08:00 · BREAKFAST THROUGH THE HATCH'], [12.5, '12:30 · LUNCH'], [18, '18:00 · DINNER'], [22, '22:00 · LIGHTS OUT']];
const MEALS = [[8, 9], [12.5, 13.5], [18, 19]];
const TALK = ['INMATE: What you in for?', 'INMATE: I did not do anything, man.', 'INMATE: Keep it down over there!', 'OFFICER: Quiet in the cells.', 'INMATE: Got a light?', 'INMATE: My lawyer is coming. Any minute now.', 'INMATE: Second time this month. The food is still terrible.', 'OFFICER: Sit down and wait.'];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const clockText = h => { const m = Math.floor(((h % 24) + 24) % 24 * 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

// ---- The people in the station -----------------------------------------------------------------------------------------------------------------------
const KEYS = { sergeant: 'cop_black', guard: 'cop_blue', visitor: 'ped_f2' };
class Local {
  constructor(J, spot) {
    this.J = J; this.spot = spot; this.role = spot.role; this.act = spot.act || null; const I = J.env.interior;
    const w = this.walker = new Walker(J.env.scene, spot.key || KEYS[spot.role] || 'ped_m1', { lite: true }); w.interior = I;
    w.place(spot.x, spot.z, spot.face); w.y = I.ground(spot.x, spot.z).y; w.show(true);
    this.t = Math.random() * 4; this.next = 1 + Math.random() * 2; this.leg = 1; this.wait = 0; this.stopAt = null; this.seq = 0;
  }
  // Walks toward (x, z); returns the distance left.
  go(dt, x, z, slow = false) {
    const w = this.walker, ax = x - w.x, az = z - w.z, d = Math.hypot(ax, az);
    w.update(dt, d > 0.15 ? { mx: -ax / d * (slow ? 0.45 : 0.6), my: az / d * (slow ? 0.45 : 0.6), sprint: false, jump: false, crouch: false } : NOINP, 0, null); return d;
  }
  face(dt, yaw) { const w = this.walker; w.h += wrapAngle(yaw - w.h) * Math.min(1, dt * 5); }
  update(dt) {
    const J = this.J, w = this.walker, s = this.spot; this.t += dt;
    if (this.role === 'guard') {
      // Up and down the corridor, a look into each cell; at night slower; on your release day, to your door.
      if (J.fetch) { const C = J.J.cell, d = this.go(dt, C.door.x + 0.6, C.door.z - 1.0); if (d < 0.2) this.face(dt, Math.atan2(C.door.x - w.x, C.door.z + 1 - w.z)); return; }
      if (this.wait > 0) { this.wait -= dt; this.face(dt, 0); w.update(dt, NOINP, 0, null); return; }
      const gx = this.leg > 0 ? s.patrol[1] + J.room.ox : s.patrol[0] + J.room.ox, night = J.night;
      const d = this.go(dt, gx, s.z, night);
      for (const cx of J.cellX) if (this.stopAt !== cx && Math.abs(w.x - cx) < 0.15 && Math.random() < (night ? 0.35 : 0.8)) { this.stopAt = cx; this.wait = 1.6 + Math.random() * 1.6; }
      if (d < 0.3) { this.leg = -this.leg; this.stopAt = null; }
      return;
    }
    if (this.act === 'pace') {                                                         // back and forth across his cell
      const z0 = J.room.oz + 9.3, z1 = J.room.oz + 11.9;
      if (this.wait > 0) { this.wait -= dt; w.update(dt, NOINP, 0, null); return; }
      if (this.go(dt, s.x, this.leg > 0 ? z1 : z0, true) < 0.25) { this.leg = -this.leg; this.wait = 0.6 + Math.random() * 1.5; }
      return;
    }
    if (this.act === 'box' && w.body && w.body.ready('jab')) {                        // shadow-boxing to pass the time
      w.h = Math.PI; const a = w.body.act;
      if (!a) { this.next -= dt; if (this.next <= 0) { this.next = 0.2; const name = ['jab', 'jab', 'cross', 'hook', 'guard'][this.seq++ % 5]; w.play(name, name === 'guard' ? { lock: false, root: false, fade: 0.3 } : { rate: 0.95, fade: 0.12, root: false }); if (name === 'guard') this.next = 1.5 + Math.random() * 2; } }
      else if (a.name === 'guard' && a.age > 1.6 + Math.random()) w.body.stop(0.3);
      w.update(dt, NOINP, 0, null); w.x = s.x; w.z = s.z; return;
    }
    if (this.act === 'bars') { w.hands = damp(w.hands, (this.t % 14) < 6 ? 0.28 : 0, 3, dt); }      // (hands up on the bars now and then)
    if (this.role === 'sergeant') { this.next -= dt; if (this.next <= 0) { this.next = 3 + Math.random() * 4; this.look = (Math.random() - 0.5) * 1.2; } this.face(dt, s.face + (this.look || 0)); }
    w.update(dt, NOINP, 0, null);
  }
  dispose() { const sc = this.J.env.scene, w = this.walker; w.show(false); sc.remove(w.mesh); sc.remove(w.blob); }
}

export class Jail {
  // env: { scene, interior, walker, audio, toast(text, secs), settings, save(), fade(fn), release() }
  constructor(env) {
    this.env = env; this.active = false; this.locked = false; this.prisoner = false; this.booking = false; this.released = false;
    this.room = null; this.J = null; this.people = []; this._prompt = ''; this.hour = 13; this.V = null; this.hud = null; this.card = null; this.talkT = 20; this.fetch = false;
  }
  get prompt() { return this._prompt; }
  get night() { const h = this.hour % 24; return h >= 22 || h < 7; }
  get day() { return Math.floor(this.hour / 24) + 1; }
  toast(t, s = 2.2) { this.env.toast(t, s); }

  // Walked in off the street: the lobby.
  visit(venue) { this.start(venue, null); this.toast('POLICE STATION: PUBLIC ENQUIRIES', 2.2); }
  // Arrested: booked into a cell. verdict: { list: [{ name, n }], days, ... }, and what was taken (taken: { loot }).
  begin(venue, verdict, taken = {}) {
    this.start(venue, verdict);
    const P = this.env.walker, C = this.J.cell; P.place(C.cx + 0.5, C.cz - 0.2, Math.PI); P.hold = false; P.hands = 0;
    this.V = verdict; this.taken = taken; this.hour = 19.5; this.releaseAt = 24 * verdict.days + 9; this.booking = true; this.fetch = false;
    this.showBooking(true); this.applyHour();
  }
  start(venue, V) {
    this.end(); const I = this.env.interior; this.room = I.room; this.J = this.room.jail; this.venue = venue; this.active = true;
    this.prisoner = !!V; this.locked = !!V; this.released = false; this.hour = V ? 19.5 : 13; this.talkT = 25 + Math.random() * 20;
    this.cellX = [-6, -2, 2, 6].map(x => x + this.room.ox);
    this.people = this.room.spots.map(s => new Local(this, s));
    this.base = I.lights.map(l => l.intensity); this.keyBase = I.key ? I.key.intensity : 0;
    for (const k in this.J.doors) { const d = this.J.doors[k]; d.open = 0; d.want = 0; d.g.position.set(0, 0, 0); d.box.dead = false; }
    this.applyHour(); this.showHud(this.prisoner);
  }
  end() {
    for (const p of this.people) p.dispose(); this.people.length = 0;
    if (this.active) { const I = this.env.interior; if (I.lights && this.base) I.lights.forEach((L, i) => { if (this.base[i] != null) L.intensity = this.base[i]; }); if (I.key && this.keyBase) I.key.intensity = this.keyBase; }
    this.active = false; this.locked = false; this.prisoner = false; this.booking = false; this.fetch = false; this.room = null; this._prompt = '';
    this.showBooking(false); this.showHud(false);
  }
  nearest() { const P = this.env.walker; let best = null, bd = 1e9; for (const it of this.room.items) { const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < it.r && d < bd) { bd = d; best = it; } } return best; }

  // The use button: past the booking card; at the bunk, sleep; at the desk, a word with the sergeant; at the door (once you are free), out.
  use() {
    if (!this.active) return false;
    if (this.booking) { this.booking = false; this.showBooking(false); this.toast('YOUR CELL. SLEEP ON THE BUNK TO PASS THE NIGHT', 2.6); return true; }
    const P = this.env.walker, R = this.room;
    if (!this.locked && Math.hypot(R.exit.x - P.x, R.exit.z - P.z) < 1.7) return 'exit';
    const it = this.nearest(); if (!it) return false;
    if (it.type === 'bunk' && this.locked) { this.sleep(); return true; }
    if (it.type === 'desk') { this.toast(this.released ? 'SERGEANT: Here are your things. Your car is outside. Stay out of trouble.' : 'SERGEANT: Take a seat. Someone will be with you shortly.', 2.6); return true; }
    return false;
  }
  sleep() {
    const h = this.hour % 24, night = h >= 19 || h < 7, morning = Math.floor(this.hour / 24) * 24 + (h >= 19 ? 24 : 0) + 7;
    const to = Math.min(night ? morning : this.hour + 3, this.releaseAt);
    this.env.fade(() => { this.advance(to - this.hour); if (!this.released) this.toast((night ? 'YOU SLEPT. ' : 'YOU RESTED. ') + this.dayText(), 2.4); });
  }
  dayText() { return this.day > this.V.days ? 'RELEASE DAY, ' + clockText(this.hour) : `DAY ${this.day} OF ${this.V.days}, ${clockText(this.hour)}`; }
  advance(dh) {
    const prev = this.hour; this.hour += dh; let last = null;
    for (let d = Math.floor(prev / 24); d <= Math.floor(this.hour / 24); d++) for (const [hh, text] of SCHEDULE) { const t = d * 24 + hh; if (t > prev && t <= this.hour) last = text; }
    if (last && dh < 1) this.toast(last, 2.4);                                        // (slept through: the toast on waking says the time instead)
    if (this.locked && this.hour >= this.releaseAt - 0.5) this.fetch = true;           // (the officer comes for you)
    if (this.locked && this.hour >= this.releaseAt) this.release();
  }
  release() {
    this.locked = false; this.released = true; this.fetch = true;
    this.J.doors.cell.want = 1; this.custodyT = 1.5;                                  // (the custody door a moment after)
    const S = this.env.settings, rec = S.record || (S.record = { arrests: 0, fines: 0, days: 0 }); rec.days = (rec.days || 0) + this.V.days; this.env.save();
    this.toast('09:00 · RELEASED. YOUR THINGS ARE AT THE FRONT DESK: THE WAY OUT IS THROUGH THE LOBBY', 3.4);
    this.env.audio.clang && this.env.audio.clang(2);
    this.env.release && this.env.release();
    this.showHud(false);
  }

  update(dt, f) {
    if (!this.active) return; const P = this.env.walker, R = this.room;
    if (this.locked && !this.booking) this.advance(dt / HOUR);
    for (const p of this.people) p.update(dt);
    if (this.custodyT > 0 && (this.custodyT -= dt) <= 0) this.J.doors.custody.want = 1;
    for (const k in this.J.doors) { const d = this.J.doors[k]; d.open = damp(d.open, d.want, 2.2, dt); d.g.position.set(d.slide[0] * d.open, 0, d.slide[1] * d.open); d.box.dead = d.open > 0.6; }
    this.applyHour();
    // Now and then someone says something (not at night).
    if (this.locked && !this.night && !this.booking && (this.talkT -= dt) <= 0) { this.talkT = 30 + Math.random() * 35; this.toast(TALK[(Math.random() * TALK.length) | 0], 2.4); }
    // The prompt.
    const it = this.nearest(), exitD = Math.hypot(R.exit.x - P.x, R.exit.z - P.z);
    this._prompt = this.booking ? 'CONTINUE' : !this.locked && exitD < 1.7 ? 'LEAVE' : it && it.type === 'bunk' && this.locked ? (this.night || this.hour % 24 >= 19 ? 'SLEEP' : 'REST 3 HOURS') : it && it.type === 'desk' ? 'FRONT DESK' : '';
    this.renderHud();
  }
  // The light of the hour: the sky in the windows, the cell lights (out at ten), the room's lamps with them.
  applyHour() {
    const h = ((this.hour % 24) + 24) % 24, J = this.J, I = this.env.interior; if (!J) return;
    const sun = smooth(5.6, 8, h) * (1 - smooth(18, 20.6, h)), glow = Math.exp(-((h - 6.9) ** 2) / 0.7) + Math.exp(-((h - 19.4) ** 2) / 0.7);
    J.win.color.setRGB(0.04 + sun * 1.25 + glow * 1.5, 0.06 + sun * 1.4 + glow * 0.7, 0.14 + sun * 1.7 + glow * 0.3);
    const on = !this.prisoner || !(h >= 22 || h < 7) ? 1 : 0;
    J.lamp.color.setScalar(on ? 2.4 : 0.12);
    J.tray && (J.tray.visible = this.prisoner && this.locked && MEALS.some(([a, b]) => h >= a && h < b));
    if (this.base) I.lights.forEach((L, i) => { if (this.base[i] == null) return; L.intensity = this.base[i] * (i === 0 ? 1 : 0.1 + 0.9 * on); });
    if (I.key && this.keyBase) I.key.intensity = this.keyBase * (0.25 + 0.75 * Math.max(on, sun * 0.6));
  }

  // ---- On the screen: the custody clock, and the booking sheet --------------------------------------------------------------------------------------
  showHud(on) {
    if (typeof document === 'undefined') return;
    if (!this.hud) { style(); const el = document.createElement('div'); el.id = 'jailhud'; el.className = 'hidden'; el.innerHTML = '<div class="jh-top"><b>CENTRAL CUSTODY</b><span id="jh-day"></span></div><div class="jh-clock" id="jh-clock"></div><div class="jh-bar"><em id="jh-bar"></em></div><div class="jh-out" id="jh-out"></div>'; (document.getElementById('hud') || document.body).appendChild(el); this.hud = el; }
    this.hud.classList.toggle('hidden', !on); this.hudSig = '';
  }
  renderHud() {
    if (!this.hud || !this.prisoner || !this.locked) return; const V = this.V, m = Math.floor(this.hour * 4);
    const sig = m + '|' + this.booking; if (sig === this.hudSig) return; this.hudSig = sig;
    document.getElementById('jh-day').textContent = this.day > V.days ? 'RELEASE DAY' : `DAY ${this.day} OF ${V.days}`;
    document.getElementById('jh-clock').textContent = clockText(this.hour) + (this.night ? '  ·  LIGHTS OUT' : '');
    document.getElementById('jh-bar').style.width = clamp((this.hour - 19.5) / (this.releaseAt - 19.5), 0, 1) * 100 + '%';
    document.getElementById('jh-out').textContent = `OUT: DAY ${V.days + 1}, 09:00`;
  }
  showBooking(on) {
    if (typeof document === 'undefined') return;
    if (on && !this.card) { style(); const el = document.createElement('div'); el.id = 'booking'; el.className = 'hidden'; document.body.appendChild(el); this.card = el; el.addEventListener('click', e => { if (e.target.closest('[data-go]')) { e.stopPropagation(); this.use(); } }); }
    if (!this.card) return;
    if (on) {
      const V = this.V, rec = this.env.settings.record || {}, t = this.taken || {}, n = (rec.arrests || 0);
      const items = V.list.map(c => `<li>${c.name}${c.n > 1 ? ' ×' + c.n : ''}</li>`).join('');
      const held = ['your weapons and ammunition', 'your car keys'].concat(t.loot ? ['$' + t.loot.toLocaleString('en-US') + ' in stolen cash (kept as evidence)'] : []).map(s => `<li>${s}</li>`).join('');
      this.card.innerHTML = `<div class="bk-box"><div class="bk-head"><b>CENTRAL CUSTODY</b><span>CUSTODY RECORD</span></div>
        <div class="bk-grid"><div class="bk-photo"><div class="bk-board">BOOKING<br>${String(1000 + ((Math.random() * 9000) | 0))}</div></div>
        <div><h4>CHARGED WITH</h4><ul>${items}</ul><h4>SENTENCE</h4><p><em>${V.days} days</em> in the cells${n > 1 ? ` (your record: ${n} arrests)` : ''}. Out on day ${V.days + 1} at 09:00.</p><h4>HELD UNTIL RELEASE</h4><ul>${held}</ul></div></div>
        <button data-go="1">INTO THE CELLS (F)</button></div>`;
      if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
    }
    this.card.classList.toggle('hidden', !on);
  }
}

let styled = false;
function style() {
  if (styled || typeof document === 'undefined') return; styled = true;
  const s = document.createElement('style'); s.textContent = `
  #jailhud { position: absolute; left: 50%; top: calc(max(14px, env(safe-area-inset-top)) + 42px); transform: translateX(-50%); width: min(300px, 70vw); padding: 8px 12px 10px; border-radius: 12px; background: rgba(10,12,18,0.72); border: 1px solid rgba(255,255,255,0.2); color: #fff; font: 600 12px Barlow, sans-serif; pointer-events: none; }
  #jailhud.hidden, #booking.hidden { display: none; }
  #jailhud .jh-top { display: flex; justify-content: space-between; align-items: baseline; } #jailhud .jh-top b { font: 800 italic 15px 'Barlow Condensed', sans-serif; letter-spacing: 0.06em; color: #ffcf6a; }
  #jailhud .jh-clock { font: 700 26px 'Barlow Condensed', sans-serif; letter-spacing: 0.04em; margin: 2px 0 4px; }
  #jailhud .jh-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.15); overflow: hidden; } #jailhud .jh-bar em { display: block; height: 100%; background: linear-gradient(90deg, #ffcf6a, #7dffa8); }
  #jailhud .jh-out { margin-top: 4px; opacity: 0.75; }
  #booking { position: fixed; inset: 0; z-index: 56; display: grid; place-items: center; background: rgba(0,0,0,0.6); pointer-events: auto; }
  #booking .bk-box { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; background: #f3f0e6; color: #17181c; border-radius: 10px; padding: 16px 18px; font: 500 14px Barlow, sans-serif; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  #booking .bk-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #17181c; padding-bottom: 6px; margin-bottom: 10px; } #booking .bk-head b { font: 800 22px 'Barlow Condensed', sans-serif; letter-spacing: 0.08em; } #booking .bk-head span { font-weight: 700; letter-spacing: 0.12em; opacity: 0.7; }
  #booking .bk-grid { display: grid; grid-template-columns: 120px 1fr; gap: 14px; } @media (max-width: 480px) { #booking .bk-grid { grid-template-columns: 1fr; } #booking .bk-photo { display: none; } }
  #booking .bk-photo { height: 150px; border-radius: 6px; background: repeating-linear-gradient(0deg, #c9c5b8 0 14px, #b9b5a8 14px 15px); display: flex; align-items: flex-end; justify-content: center; padding-bottom: 10px; }
  #booking .bk-board { background: #17181c; color: #fff; font: 700 12px 'Barlow Condensed', sans-serif; text-align: center; padding: 4px 10px; border-radius: 3px; letter-spacing: 0.08em; }
  #booking h4 { margin: 0 0 2px; font: 800 12px Barlow, sans-serif; letter-spacing: 0.12em; opacity: 0.6; } #booking ul { margin: 0 0 8px; padding-left: 18px; } #booking p { margin: 0 0 8px; } #booking em { font-style: normal; font-weight: 800; }
  #booking button { margin-top: 6px; width: 100%; font: 800 italic 18px 'Barlow Condensed', sans-serif; border: 0; border-radius: 8px; padding: 11px; background: #17181c; color: #fff; cursor: pointer; }`;
  document.head.appendChild(s);
}
