// The heads-up display: the round rev counter and speedometer (gear in the
// middle, driver aids, nitro gauge), the minimap, and race information.
import { $, clamp, fmtTime, hash3 } from './util.js';
import { N, SP, hw, isBlvd, EDGE, LIMIT, blockRect, isPark } from './city.js';
import { RIVER, LAKES, lakeOutline, bankPoint, inRiverBox } from './rivercourse.js';
import { heightBL, HILLS } from './hills.js';
import { AVENUES } from './avenues.js';
import { WORLD, ROADS, coastX, climate, baseHeight, BUNKERS, AIRFIELD } from './world.js';
import { SITES } from './settlements.js';

const A0 = 125 * Math.PI / 180, SPAN = 290 * Math.PI / 180;

// The river and the lakes as one shape to fill on a map (built once).
let _water = null;
export function waterPath() {
  if (_water) return _water;
  const p = _water = new Path2D();
  for (let i = 0; i < RIVER.n; i += 3) { const [x, z] = bankPoint(i, 1); i ? p.lineTo(x, z) : p.moveTo(x, z); }
  for (let i = RIVER.n - 1; i >= 0; i -= 3) { const [x, z] = bankPoint(i, -1); p.lineTo(x, z); }
  p.closePath();
  for (const L of LAKES) { const o = lakeOutline(L, 48); o.forEach(([x, z], k) => (k ? p.lineTo(x, z) : p.moveTo(x, z))); p.closePath(); }
  return p;
}
export class HUD {
  constructor() {
    this.dial = $('dial'); this.dctx = this.dial.getContext('2d');
    this.map = $('minimap'); this.mctx = this.map.getContext('2d');
    this.resize();
    addEventListener('resize', () => this.resize());
    this.toastT = 0;
    this.prepareMapGrid();                                       // (the land of the big map, worked out a few rows a frame soon after the start)
  }
  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const c of [this.dial, this.map]) {
      const r = c.getBoundingClientRect();
      c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
    }
  }

  drawDial(car, units, flags) {
    const c = this.dctx, S = this.dial.width, cx = S / 2, cy = S / 2, R = S * 0.4;
    c.clearRect(0, 0, S, S);
    const ang = v => A0 + clamp(v / 10, 0, 1) * SPAN;
    // Disc.
    const g = c.createRadialGradient(cx, cy - R * 0.3, R * 0.1, cx, cy, R);
    g.addColorStop(0, 'rgba(38,40,52,0.62)'); g.addColorStop(1, 'rgba(12,13,20,0.72)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = S * 0.006; c.stroke();
    // Rev arc (yellow) up to the current revs, with a glowing tip.
    const rpm = car.rpm / 1000;
    c.lineCap = 'butt';
    c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = S * 0.02;
    c.beginPath(); c.arc(cx, cy, R * 0.94, ang(0), ang(10)); c.stroke();
    const hot = rpm > 7.6;
    c.strokeStyle = hot ? '#ff4040' : '#f5e04a'; c.lineWidth = S * 0.02;
    c.beginPath(); c.arc(cx, cy, R * 0.94, ang(0), ang(rpm)); c.stroke();
    const ta = ang(rpm), tg = c.createRadialGradient(cx + Math.cos(ta) * R * 0.94, cy + Math.sin(ta) * R * 0.94, 0, cx + Math.cos(ta) * R * 0.94, cy + Math.sin(ta) * R * 0.94, S * 0.08);
    tg.addColorStop(0, hot ? 'rgba(255,80,60,0.55)' : 'rgba(255,240,140,0.55)'); tg.addColorStop(1, 'rgba(255,240,140,0)');
    c.fillStyle = tg; c.fillRect(0, 0, S, S);
    // Red line.
    c.strokeStyle = '#e52b3a'; c.lineWidth = S * 0.012;
    c.beginPath(); c.arc(cx, cy, R * 0.83, ang(8), ang(10)); c.stroke();
    // Numbers.
    c.fillStyle = '#f1f1f4'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `500 ${S * 0.058}px Barlow, system-ui, sans-serif`;
    for (let v = 0; v <= 10; v++) {
      const a = ang(v), rr = R * 0.75;
      c.globalAlpha = v >= 8 ? 1 : 0.92;
      c.fillText(String(v), cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    c.globalAlpha = 1;
    // Nitro gauge: a cyan arc on the right with a diamond badge.
    const n0 = -58 * Math.PI / 180, n1 = 58 * Math.PI / 180, nr = R * 1.1;
    c.lineWidth = S * 0.016; c.strokeStyle = 'rgba(80,220,255,0.18)';
    c.beginPath(); c.arc(cx, cy, nr, n0, n1); c.stroke();
    c.strokeStyle = car.nitroOn ? '#b8f6ff' : '#3fd8f2'; c.shadowColor = '#3fd8f2'; c.shadowBlur = car.nitroOn ? S * 0.05 : S * 0.02;
    c.beginPath(); c.arc(cx, cy, nr, n1 - (n1 - n0) * car.nitro, n1); c.stroke(); c.shadowBlur = 0;
    const bx = cx + nr, by = cy, bs = S * 0.035;
    c.fillStyle = '#0e1a22'; c.strokeStyle = '#3fd8f2'; c.lineWidth = S * 0.007;
    c.beginPath(); c.moveTo(bx, by - bs); c.lineTo(bx + bs, by); c.lineTo(bx, by + bs); c.lineTo(bx - bs, by); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#3fd8f2'; c.beginPath(); c.moveTo(bx + bs * 0.15, by - bs * 0.55); c.lineTo(bx - bs * 0.3, by + bs * 0.1); c.lineTo(bx, by + bs * 0.1); c.lineTo(bx - bs * 0.15, by + bs * 0.55); c.lineTo(bx + bs * 0.3, by - bs * 0.1); c.lineTo(bx, by - bs * 0.1); c.closePath(); c.fill();
    // Gear.
    const gear = car.gear === -1 ? 'R' : car.speed < 0.3 && car.throttle < 0.05 && car.gear === 1 ? 'N' : String(car.gear);
    c.fillStyle = '#fff'; c.font = `500 ${S * 0.2}px Barlow, system-ui, sans-serif`;
    c.fillText(gear, cx, cy - R * 0.2);
    // Shift light.
    const blink = rpm > 7.4 && (performance.now() / 90 | 0) % 2;
    c.fillStyle = rpm > 7.4 ? (blink ? '#ff3b3b' : '#401010') : rpm > 6.2 ? '#36e07a' : 'rgba(54,224,122,0.35)';
    c.beginPath(); c.arc(cx, cy + R * 0.02, S * 0.012, 0, Math.PI * 2); c.fill();
    // Driver aids.
    c.font = `500 ${S * 0.046}px Barlow, system-ui, sans-serif`;
    const aids = [['ABS', flags.abs, car.absOn], ['ESP', flags.esp, car.espOn], ['TCS+', flags.tcs, car.tcsOn]];
    aids.forEach(([label, on, active], i) => {
      const x = cx + (i - 1) * R * 0.42, y = cy + R * 0.17;
      const col = active && (performance.now() / 120 | 0) % 2 ? '#ffb020' : on ? '#e8e8ee' : 'rgba(232,232,238,0.32)';
      c.fillStyle = col; c.fillText(label, x, y);
      c.fillRect(x - S * 0.03, y + S * 0.03, S * 0.06, S * 0.006);
    });
    // Speed.
    const v = units === 'mph' ? car.speed * 2.23694 : car.speed * 3.6;
    c.fillStyle = '#fff'; c.font = `400 ${S * 0.2}px Barlow, system-ui, sans-serif`;
    c.fillText(String(Math.round(v)), cx, cy + R * 0.56);
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = `500 ${S * 0.045}px Barlow, system-ui, sans-serif`;
    c.fillText(units === 'mph' ? 'mph' : 'km/h', cx, cy + R * 0.84);
  }

  drawMap(car, traffic, route, nextCp, waypoint, police) {
    const c = this.mctx, W = this.map.width, H = this.map.height, cx = W / 2, cy = H * 0.62;
    const scale = W / 520; // metres to pixels
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(14,16,26,0.72)'; c.fillRect(0, 0, W, H);
    c.translate(cx, cy); c.rotate(car.h + Math.PI); c.scale(scale, scale); c.translate(-car.x, -car.z);
    // Mirror x so the map reads like the view (right is right).
    // (heading-up: forward is up the screen)
    c.lineCap = 'butt';
    if (inRiverBox(car.x, car.z, 400)) { c.fillStyle = 'rgba(70,150,205,0.9)'; c.fill(waterPath(), 'nonzero'); }
    c.lineJoin = 'round'; for (const A of AVENUES) { c.strokeStyle = 'rgba(220,220,235,0.45)'; c.lineWidth = A.hw * 2; c.beginPath(); let pen = false; for (let i = 0; i < A.n; i += 2) { if (Math.abs(A.x[i] - car.x) > 340 || Math.abs(A.z[i] - car.z) > 340) { pen = false; continue; } if (pen) c.lineTo(A.x[i], A.z[i]); else { c.moveTo(A.x[i], A.z[i]); pen = true; } } c.stroke(); }
    for (let k = -N; k <= N; k++) {
      c.strokeStyle = isBlvd(k) ? 'rgba(220,220,235,0.55)' : 'rgba(200,200,215,0.32)';
      c.lineWidth = hw(k) * 2;
      c.beginPath(); c.moveTo(k * SP, -EDGE); c.lineTo(k * SP, EDGE); c.stroke();
      c.beginPath(); c.moveTo(-EDGE, k * SP); c.lineTo(EDGE, k * SP); c.stroke();
    }
    if (Math.abs(car.x) > EDGE - 800 || Math.abs(car.z) > EDGE - 800) {            // the motorways
      c.strokeStyle = 'rgba(235,235,245,0.55)'; c.lineWidth = 22; c.lineJoin = 'round';
      for (const R of ROADS) {
        if (R.kind !== 'motorway') continue;
        c.beginPath(); let pen = false;
        for (let i = 0; i < R.x.length; i += 2) { if (Math.abs(R.x[i] - car.x) > 330 || Math.abs(R.z[i] - car.z) > 330) { pen = false; continue; } if (pen) c.lineTo(R.x[i], R.z[i]); else { c.moveTo(R.x[i], R.z[i]); pen = true; } }
        c.stroke();
      }
    }
    if (route) {
      c.strokeStyle = 'rgba(60,220,255,0.9)'; c.lineWidth = 9; c.lineJoin = 'round';
      c.beginPath(); route.path.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
      route.cps.forEach((p, i) => {
        if (i < nextCp) return;
        c.fillStyle = i === nextCp ? '#ffd23f' : 'rgba(255,210,63,0.5)';
        c.beginPath(); c.arc(p.x, p.z, i === nextCp ? 16 : 10, 0, Math.PI * 2); c.fill();
      });
    }
    c.fillStyle = 'rgba(255,255,255,0.75)';
    for (const t of traffic.cars) { c.fillRect(t.x - 3, t.z - 3, 6, 6); }
    if (police) {                                       // police: red and blue, flashing; wrecks are grey
      for (const q of police.cops) {
        const on = ((police.clock * 3.4 + q.flash) % 1) < 0.5;
        c.fillStyle = q.wreck ? 'rgba(120,120,120,0.7)' : on ? '#ff3a2a' : '#3a6bff';
        c.beginPath(); c.arc(q.x, q.z, q.kind ? 13 : 10, 0, Math.PI * 2); c.fill();
        if (!q.wreck) { c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3; c.stroke(); }
      }
    }
    c.restore();
    if (waypoint) {                                     // the waypoint, pinned to the rim when it's off the map
      const dx = (waypoint.x - car.x) * scale, dz = (waypoint.z - car.z) * scale, th = car.h + Math.PI;
      let px = dx * Math.cos(th) - dz * Math.sin(th), py = dx * Math.sin(th) + dz * Math.cos(th);
      const lim = W / 2 - 14, dd = Math.hypot(px, py);
      if (dd > lim) { px *= lim / dd; py *= lim / dd; }
      c.fillStyle = '#ff3d9a'; c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx + px, cy + py - 9); c.lineTo(cx + px + 7, cy + py); c.lineTo(cx + px, cy + py + 9); c.lineTo(cx + px - 7, cy + py); c.closePath(); c.fill(); c.stroke();
    }
    // Player arrow.
    c.fillStyle = '#ff7a2a'; c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx, cy - 11); c.lineTo(cx + 7, cy + 8); c.lineTo(cx, cy + 4); c.lineTo(cx - 7, cy + 8); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 2; c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); c.stroke();
  }

  // The police chase's heads-up display: wanted stars, status, armour and escape bars, the gadget buttons and the screen flashes.
  chase(P, clock) {
    const root = $('chase');
    if (!P) { root.classList.add('hidden'); $('sirens').style.opacity = 0; $('dmg').style.opacity = 0; return; }
    root.classList.remove('hidden');
    if (!this.cg) this.cg = { stars: [...document.querySelectorAll('#c-stars i')], gads: [...document.querySelectorAll('[data-g]')].map(el => ({ el, g: el.dataset.g, cnt: el.querySelector('.cnt') })), status: $('c-status'), health: $('c-health'), hide: $('c-hide'), sirens: $('sirens'), dmg: $('dmg') };
    const C = this.cg, st = P.stars, blink = ((clock * 4) % 1) < 0.5;
    C.stars.forEach((el, i) => { el.className = i < st ? (P.spotted && blink ? 'on hot' : 'on') : ''; });
    const txt = P.bustT > 0.4 ? 'BEING ARRESTED' : P.spotted ? (P.heliSees ? 'HELICOPTER ON YOU' : 'SPOTTED') : P.hidden > 0.5 ? 'OUT OF SIGHT' : 'SEARCHING FOR YOU';
    if (C.status.textContent !== txt) C.status.textContent = txt;
    C.status.className = P.bustT > 0.4 ? 'bust' : P.spotted ? 'seen' : 'hid';
    C.status.style.setProperty('--p', (P.bustT > 0.4 ? clamp(P.bustFrac || 0, 0, 1) : 0).toFixed(3));        // (the arrest fills the label)
    // The minute: red and full while they can see you, counting down in green while you are hidden.
    if (!C.timer) { C.timer = $('c-timer'); C.time = $('c-time'); C.timeL = $('c-time-l'); }
    const left = Math.max(0, P.hiddenNeeded - P.hidden), sec = Math.ceil(left - 0.001), tt = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    C.timer.classList.remove('hidden'); C.timer.className = P.spotted ? 'seen' : 'hid';
    if (C.time.textContent !== tt) C.time.textContent = tt;
    const tl = P.spotted ? 'SPOTTED: HIDE FOR A WHOLE MINUTE' : P.hidden > 0.5 ? 'UNSEEN: KEEP OUT OF SIGHT' : 'STAY OUT OF SIGHT FOR 1:00';
    if (C.timeL.textContent !== tl) C.timeL.textContent = tl;
    C.health.style.width = `${clamp(P.health, 0, 100)}%`; C.health.className = P.health < 35 ? 'low' : '';
    C.hide.style.width = `${clamp(P.hidden / P.hiddenNeeded, 0, 1) * 100}%`;
    for (const { el, g, cnt } of C.gads) {
      let cd = 0, n = '', live = false;
      if (g === 'fire') cd = P.jammed ? 1 : P.gunHeat; else if (g === 'missile') { n = P.ammoMissile; cd = n ? 0 : 1; } else if (g === 'bomb') { n = P.ammoBomb; cd = n ? 0 : 1; }
      else if (g === 'oil') cd = P.cdOil / 7; else if (g === 'smoke') cd = P.cdSmoke / 14; else if (g === 'shield') { cd = P.cdShield / 15; live = P.shieldT > 0; }
      el.style.setProperty('--cd', cd.toFixed(3)); el.classList.toggle('live', live); el.classList.toggle('jam', g === 'fire' && P.jammed);
      if (cnt && cnt.textContent !== String(n)) cnt.textContent = n;
    }
    // Flashes: blue and red at the edges when cops are close, red when hurt.
    const near = clamp(1 - P.nearest / 90, 0, 1);
    C.sirens.className = ((clock * 3.4) % 1) < 0.5 ? 'a' : 'b'; C.sirens.style.opacity = (near * 0.9).toFixed(3);
    C.dmg.style.opacity = clamp(P.damageFlash * 0.9 + (P.health < 25 ? 0.12 + 0.1 * Math.sin(clock * 6) : 0), 0, 0.9).toFixed(3);
  }
  toast(text, secs = 2.2) {
    const el = $('toast'); el.textContent = text; el.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove('show'), secs * 1000);
  }
  race(info) {
    const el = $('race-info');
    if (!info) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    $('r-time').textContent = fmtTime(info.time);
    $('r-cp').textContent = `CHECKPOINT ${Math.min(info.cp, info.total)}/${info.total}`;
    $('r-best').textContent = info.best != null ? `BEST ${fmtTime(info.best)}` : '';
    this.nav(info);
  }
  // The arrow and distance to the next checkpoint or the waypoint.
  nav(info) {
    const nav = $('nav');
    if (!info) { nav.classList.add('hidden'); return; }
    nav.classList.remove('hidden');
    $('nav-arrow').style.transform = `rotate(${info.arrow}rad)`;
    $('nav-arrow').style.borderBottomColor = info.waypoint ? '#ff3d9a' : '#ffd23f';
    const m = info.dist;
    $('nav-dist').textContent = m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
  }

  // The land of the whole world, worked out once on a grid of nodes 56 m apart: its colour and its height (done a few rows a frame soon after the game
  // starts, so that opening the map does not wait for it).
  prepareMapGrid(sync = false) {
    if (this.mg && this.mg.done) return this.mg;
    const cell = 56, x0 = WORLD.x0, z0 = WORLD.z0, gx = Math.ceil((WORLD.x1 - x0) / cell) + 1, gz = Math.ceil((WORLD.z1 - z0) / cell) + 1;
    const mg = this.mg = this.mg || { cell, x0, z0, gx, gz, h: new Float32Array(gx * gz), f: new Float32Array(gx * gz * 3), row: 0, done: false };
    const rows = (n) => {
      for (let k = 0; k < n && mg.row < gz; k++, mg.row++) {
        const j = mg.row, pz = z0 + j * cell;
        for (let i = 0; i < gx; i++) {
          const px = x0 + i * cell, sh = px - coastX(pz), cl = climate(px, pz), h = baseHeight(px, pz), o = j * gx + i; mg.h[i + j * gx] = h;
          // Not a colour but how far inside each kind of ground the node is (positive inside), so that the edges between them can be drawn smoothly: snow, desert, beach.
          mg.f[o * 3] = Math.max((cl.snow - 0.5) * 8, (h - 520) / 60); mg.f[o * 3 + 1] = (cl.desert - 0.45) * 8; mg.f[o * 3 + 2] = Math.min((360 - sh) / 80, (6 - h) / 2);
        }
      }
      if (mg.row >= gz) { mg.sh = new Float32Array(gx * gz); const H = (i, j) => mg.h[clamp(j, 0, gz - 1) * gx + clamp(i, 0, gx - 1)]; for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) mg.sh[j * gx + i] = clamp((H(i - 2, j - 2) - H(i + 2, j + 2)) / 244, -0.5, 0.5); mg.done = true; }
    };
    if (sync) { rows(gz); return mg; }
    const step = () => { rows(6); if (!mg.done) setTimeout(step, 16); };
    setTimeout(step, 4000);
    return mg;
  }
  // The land of the whole world as a picture (the map's base layer): W pixels across, covering exactly WORLD.x0..x1 by WORLD.z0..z1. Sea, beach, desert, snow and
  // grass, shaded by the lie of the land; every pixel from the four grid nodes round it, so nothing is blocky, and the coast is to the pixel.
  terrainLayer(W) {
    const mg = this.prepareMapGrid(true), { cell, x0, z0, gx, gz } = mg, wx = WORLD.x1 - x0, wz = WORLD.z1 - z0, H = Math.round(W * wz / wx), sx = W / wx;
    const L = document.createElement('canvas'); L.width = W; L.height = H; const c = L.getContext('2d'), im = c.createImageData(W, H), d = im.data, sea = [61, 126, 166];
    for (let y = 0; y < H; y++) {
      const pz = z0 + (y + 0.5) / H * wz, fz = (pz - z0) / cell, j = Math.min(gz - 2, Math.floor(fz)), tz = fz - j, cx0 = coastX(pz);
      for (let x = 0; x < W; x++) {
        const px = x0 + (x + 0.5) / W * wx, o = (y * W + x) * 4, fx = (px - x0) / cell, i = Math.min(gx - 2, Math.floor(fx)), tx = fx - i;
        const n00 = j * gx + i, n10 = n00 + 1, n01 = n00 + gx, n11 = n01 + 1, w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
        const F = q => mg.f[n00 * 3 + q] * w00 + mg.f[n10 * 3 + q] * w10 + mg.f[n01 * 3 + q] * w01 + mg.f[n11 * 3 + q] * w11, ss = v => { v = v * 0.5 + 0.5; return v < 0 ? 0 : v > 1 ? 1 : v * v * (3 - 2 * v); };
        const hh = mg.h[n00] * w00 + mg.h[n10] * w10 + mg.h[n01] * w01 + mg.h[n11] * w11, kk = clamp(hh / 900, 0, 1), sn = ss(F(0) * 1.5), de = ss(F(1) * 1.5), sa = ss(F(2) * 1.5);
        let r = 150 + (218 - 150) * de, g = 176 + (182 - 176) * de, b = 104 + (124 - 104) * de;                      // grass, going to desert
        r += (236 - 40 * kk - r) * sn; g += (242 - 36 * kk - g) * sn; b += (250 - 24 * kk - b) * sn;                  // then snow (greyer up high)
        r += (232 - r) * sa; g += (220 - g) * sa; b += (170 - b) * sa;                                                // then the beach
        const sl = mg.sh[n00] * w00 + mg.sh[n10] * w10 + mg.sh[n01] * w01 + mg.sh[n11] * w11, k = 1 + sl * 0.5, land = clamp((px - cx0) * sx + 0.5, 0, 1);
        d[o] = sea[0] + (clamp(r * k, 0, 255) - sea[0]) * land; d[o + 1] = sea[1] + (clamp(g * k, 0, 255) - sea[1]) * land; d[o + 2] = sea[2] + (clamp(b * k, 0, 255) - sea[2]) * land; d[o + 3] = 255;
      }
    }
    c.putImageData(im, 0, 0);
    return L;
  }
}
