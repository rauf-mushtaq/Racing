// The car dealership (venues.js 'dealer': its glass front, the forecourt; rooms-visit.js dealer: the showroom). The cars are on show in the showroom, each on
// its stand (the hypercar turning on a turntable), and three more stand on the forecourt outside. Walk up to one and the use button opens its card: what
// it is, what it does (0 to 100 km/h, top speed, both from the game's own physics), its paints (the car on the stand changes as you choose), its price
// and what you have. Buy it and it is yours (kept between games, settings.garage), and it becomes the car you drive (settings.myCar); DRIVE IT OUT puts
// you in it on the forecourt, pointing the way the traffic goes. A car you already own can be driven out again, in a new colour if you like.
// The Garage on the main menu (menus.js) lets you choose between the cars you own.
import { CARS, CAR_BY_ID, MPAINTS, marqueSpec } from './marque-specs.js';
import { makeMarque, setMarquePaint, disposeMarque } from './marques.js';
import { Vehicle } from './vehicle.js';
import { VENUES } from './venues.js';

const money = n => '$' + Math.round(n).toLocaleString('en-US');
const layer = (o, n) => o.traverse(m => m.layers.set(n));
// How quick a car is, measured as the game drives it: flat out from rest on level road (0 to 100 km/h, and the top speed).
const PERF = {};
export function carPerf(id) {
  if (PERF[id]) return PERF[id];
  const v = new Vehicle(marqueSpec(id)), dt = 1 / 120, inp = { steer: 0, gas: 1, brake: 0, handbrake: false, nitro: false, analog: true, sens: 1, device: 'keyboard' }, g = () => ({ y: 0, grass: false });
  v.reset(0, 0, 0); let t = 0, s100 = null, top = 0;
  for (let i = 0; i < 120 * 75; i++) { v.step(dt, inp, g); t += dt; const k = v.speed * 3.6; if (s100 === null && k >= 100) s100 = t; top = Math.max(top, k); }
  return (PERF[id] = { s100: s100 ?? 99, kmh: Math.round(top) });
}

export class Dealer {
  // env: { scene, interior, walker, audio, toast(text, secs), settings, save, drive(id, paint, venue), cash() }
  constructor(env) {
    this.env = env; this.active = false; this.cars = []; this.near = null; this.menuOpen = false; this.cur = null;
    this.stands = new Map();                  // the showroom's cars (built once, kept between visits)
    this.street = new Map();                  // the forecourts' cars, by venue
    this.t = 0;
  }
  get settings() { return this.env.settings; }
  owned(id) { const g = this.settings.garage; return !!(g && g[id]); }
  paintOf(id) { const g = this.settings.garage, c = CAR_BY_ID[id]; return (g && g[id] && g[id].paint) || c.paints[0]; }
  // ---- In the showroom ----------------------------------------------------------------------------------------------------------------------------
  begin(v) {
    this.end(); const I = this.env.interior, R = I.room; this.venue = v; this.active = true;
    this.cars = (R.cars || []).map(c => {
      let m = this.stands.get(c.id); if (!m) { m = makeMarque(c.id, this.paintOf(c.id), { display: true }); this.stands.set(c.id, m); }
      setMarquePaint(m, this.paintOf(c.id)); m.position.set(c.x, c.y, c.z); m.rotation.set(0, c.h, 0); m.visible = true;
      layer(m, 1); I.group.add(m); return { ...c, mesh: m };
    });
  }
  end() {
    for (const c of this.cars) if (c.mesh.parent) c.mesh.parent.remove(c.mesh);        // (taken out of the room before it is thrown away: they are kept)
    this.cars = []; this.near = null; this.active = false; if (this.menuOpen) this.showMenu(false);
  }
  update(dt) {
    if (!this.active) return; this.t += dt;
    const w = this.env.walker; let best = null, bd = 1e9;
    for (const c of this.cars) {
      if (c.turn) c.mesh.rotation.y = c.h + this.t * 0.22;
      const d = Math.hypot(w.x - c.x, w.z - c.z); if (d < c.r + 1.6 && d < bd) { bd = d; best = c; }
    }
    this.near = best;
    if (this.menuOpen && (!best || best.id !== this.cur)) this.showMenu(false);                     // (walked away from it)
  }
  get prompt() {
    if (this.menuOpen) return 'CLOSE';
    const c = this.near && CAR_BY_ID[this.near.id]; if (!c) return '';
    return (this.owned(c.id) ? 'YOURS: ' : '') + c.make + ' ' + c.model + (this.owned(c.id) ? '' : '  ' + money(c.price));
  }
  // The use button: the card of the car you are standing at (or closes it). False when there is none (the door's LEAVE is the visit's).
  use() {
    if (this.menuOpen) { this.showMenu(false); return true; }
    if (this.near) { this.open(this.near.id); return true; }
    return false;
  }
  open(id) { this.cur = id; this.choice = this.paintOf(id); this.showMenu(true); }
  // Choosing a paint: the car on its stand is painted to show it.
  pick(key) {
    const c = CAR_BY_ID[this.cur]; if (!c || !c.paints.includes(key)) return false; this.choice = key;
    const m = this.stands.get(this.cur); if (m) setMarquePaint(m, key);
    this.render(); return true;
  }
  buy() {
    const c = CAR_BY_ID[this.cur]; if (!c) return false;
    if (this.owned(c.id)) return this.driveOut();
    const S = this.settings, cash = S.cash || 0;
    if (cash < c.price) { this.env.toast('YOU NEED ' + money(c.price - cash) + ' MORE', 1.8); if (this.env.audio) this.env.audio.beep(220, 0.12, 0.2); return false; }
    S.cash = cash - c.price; S.garage = S.garage || {}; S.garage[c.id] = { paint: this.choice, bought: Date.now() }; this.env.save();
    this.env.toast('THE ' + c.make + ' ' + c.model + ' IS YOURS', 2.6);
    if (this.env.audio) { this.env.audio.beep(1500, 0.08, 0.2); setTimeout(() => this.env.audio.beep(2100, 0.14, 0.2), 90); }
    this.render(); return true;
  }
  // Drive it away: in the paint chosen (a car you own can be resprayed for nothing).
  driveOut() {
    const c = CAR_BY_ID[this.cur]; if (!c || !this.owned(c.id)) return false;
    const S = this.settings; S.garage[c.id].paint = this.choice; this.env.save();
    this.showMenu(false); this.env.drive(c.id, this.choice, this.venue); return true;
  }
  // ---- The card ---------------------------------------------------------------------------------------------------------------------------------------
  showMenu(on) {
    this.menuOpen = !!on;
    if (on && !this.menu) {
      const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      const el = document.createElement('div'); el.id = 'carmenu'; el.className = 'hidden'; document.body.appendChild(el); this.menu = el;
      el.addEventListener('click', e => { const t = e.target.closest('[data-p],[data-buy],[data-close]'); if (!t) return; if (t.dataset.p) this.pick(t.dataset.p); else if (t.dataset.buy) this.buy(); else this.showMenu(false); });
      addEventListener('keydown', e => {
        if (!this.menuOpen) return;
        if (e.code === 'Escape') { this.showMenu(false); e.preventDefault(); }
        else if (e.code === 'Enter') { this.buy(); e.preventDefault(); e.stopPropagation(); }
        else if (/^Digit[1-6]$/.test(e.code)) { const c = CAR_BY_ID[this.cur], k = c && c.paints[+e.code.slice(5) - 1]; if (k) this.pick(k); e.preventDefault(); e.stopPropagation(); }
      }, true);
    }
    if (!this.menu) return;
    if (on) { this.render(); if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); }
    else { const m = this.stands.get(this.cur); if (m && this.cur) setMarquePaint(m, this.paintOf(this.cur)); }       // (closed without buying: back to its own paint)
    this.menu.classList.toggle('hidden', !on);
  }
  render() {
    const c = CAR_BY_ID[this.cur]; if (!this.menu || !c) return;
    const P = carPerf(c.id), cash = this.settings.cash || 0, own = this.owned(c.id), short = Math.max(0, c.price - cash);
    const sw = c.paints.map((k, i) => { const p = MPAINTS[k]; return `<button class="cm-sw ${k === this.choice ? 'on' : ''}" data-p="${k}"><i style="background:#${p.color.toString(16).padStart(6, '0')}"></i>${p.name}<small>${i + 1}</small></button>`; }).join('');
    const btn = own ? `<button class="cm-buy" data-buy="1">DRIVE IT OUT (ENTER)</button>` : short > 0 ? `<button class="cm-buy" data-buy="1" disabled>YOU NEED ${money(short)} MORE</button>` : `<button class="cm-buy" data-buy="1">BUY FOR ${money(c.price)} (ENTER)</button>`;
    this.menu.innerHTML = `<div class="cm-box"><div class="cm-head"><span>${c.make}</span><b>${c.model}</b><em>${money(cash)}</em></div>
      <div class="cm-type">${c.type} · ${c.engine} · ${c.drive}</div><p class="cm-blurb">${c.blurb}</p>
      <div class="cm-spec"><div><b>${c.hp.toLocaleString('en-US')}</b>horsepower</div><div><b>${P.s100.toFixed(1)} s</b>0 to 100 km/h</div><div><b>${P.kmh} km/h</b>top speed</div><div><b>${c.phys.mass.toLocaleString('en-US')} kg</b>weight</div></div>
      <div class="cm-paint">${sw}</div>
      <div class="cm-foot"><div class="cm-price">${own ? 'YOU OWN THIS CAR' : money(c.price)}</div>${btn}<button class="cm-close" data-close="1">CLOSE (ESC)</button></div>
      <p class="cm-note">${own ? 'Choose a colour and drive it out: it is waiting on the forecourt. In the Garage on the main menu you can pick which of your cars to drive.' : "Bought, it is yours for good, and the car you drive. The figures are the game's own: how it accelerates and how fast it goes in this game."}</p></div>`;
  }
  // ---- On the forecourts ----------------------------------------------------------------------------------------------------------------------------
  // Each dealership's forecourt cars are built when you come within 320 m of it and put away beyond 400 (thrown away beyond 900).
  updateStreet(x, z) {
    for (const v of VENUES.values()) {
      if (v.kind !== 'dealer' || !v.show) continue;
      const d = Math.hypot(v.x - x, v.z - z); let list = this.street.get(v.id);
      if (d < 320 && !list) {
        list = v.show.map((s, i) => { const c = CAR_BY_ID[s.id], m = makeMarque(s.id, c.paints[(i + 1) % c.paints.length], { display: true }); m.position.set(s.x, s.y, s.z); m.rotation.y = s.h; this.env.scene.add(m); return m; });
        this.street.set(v.id, list);
      }
      if (list) { for (const m of list) m.visible = d < 400; if (d > 900) { for (const m of list) disposeMarque(m); this.street.delete(v.id); } }
    }
  }
  // The dealership a building's wall belongs to (venues.js registers the door): where its handover spot is.
  static nearest(x, z) { let best = null, bd = 1e18; for (const v of VENUES.values()) { if (v.kind !== 'dealer') continue; const d = (v.x - x) ** 2 + (v.z - z) ** 2; if (d < bd) { bd = d; best = v; } } return bd < 140 * 140 ? best : null; }
}
export { CARS };

const CSS = `
  #carmenu.hidden { display: none; }
  #carmenu { position: fixed; inset: 0; z-index: 55; display: grid; place-items: center; background: rgba(4,4,8,0.45); pointer-events: auto; }
  #carmenu .cm-box { width: min(780px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; background: rgba(12,13,16,0.95); border: 1px solid rgba(255,255,255,0.16); border-radius: 16px; padding: 18px 20px; color: #fff; font: 500 14px Barlow, sans-serif; }
  #carmenu .cm-head { display: flex; gap: 10px; align-items: baseline; } #carmenu .cm-head span { font: 700 16px 'Barlow Condensed', sans-serif; letter-spacing: 0.3em; opacity: 0.7; }
  #carmenu .cm-head b { font: 800 italic 32px 'Barlow Condensed', sans-serif; color: #fff; } #carmenu .cm-head em { margin-left: auto; font: 700 20px 'Barlow Condensed', sans-serif; font-style: normal; color: #7dffa8; }
  #carmenu .cm-type { opacity: 0.75; letter-spacing: 0.04em; margin: 2px 0 8px; } #carmenu .cm-blurb { margin: 0 0 12px; opacity: 0.9; line-height: 1.4; }
  #carmenu .cm-spec { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; } @media (max-width: 640px) { #carmenu .cm-spec { grid-template-columns: repeat(2, 1fr); } }
  #carmenu .cm-spec div { border: 1px solid rgba(255,255,255,0.14); border-radius: 10px; padding: 8px 10px; font-size: 12px; opacity: 0.9; } #carmenu .cm-spec b { display: block; font: 800 22px 'Barlow Condensed', sans-serif; }
  #carmenu .cm-paint { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
  #carmenu .cm-sw { display: flex; align-items: center; gap: 7px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.05); color: #fff; border-radius: 20px; padding: 5px 11px 5px 6px; font: 600 13px Barlow, sans-serif; cursor: pointer; }
  #carmenu .cm-sw i { width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.4); } #carmenu .cm-sw small { opacity: 0.5; } #carmenu .cm-sw.on { border-color: #f2c230; background: rgba(242,194,48,0.14); }
  #carmenu .cm-foot { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } #carmenu .cm-price { font: 800 26px 'Barlow Condensed', sans-serif; color: #f2c230; margin-right: auto; }
  #carmenu button.cm-buy, #carmenu button.cm-close { font: 800 italic 17px 'Barlow Condensed', sans-serif; border: 0; border-radius: 8px; padding: 10px 14px; color: #1a0c06; background: linear-gradient(90deg, #f2c230, #ff7a2a); cursor: pointer; }
  #carmenu button[disabled] { background: rgba(255,255,255,0.14); color: rgba(255,255,255,0.65); cursor: default; } #carmenu button.cm-close { background: rgba(255,255,255,0.14); color: #fff; }
  #carmenu .cm-note { opacity: 0.65; margin: 10px 0 0; font-size: 12.5px; }`;
