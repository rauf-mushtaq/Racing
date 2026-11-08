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
function waterPath() {
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
    const mg = this.mg = this.mg || { cell, x0, z0, gx, gz, h: new Float32Array(gx * gz), rgb: new Float32Array(gx * gz * 3), row: 0, done: false };
    const rows = (n) => {
      for (let k = 0; k < n && mg.row < gz; k++, mg.row++) {
        const j = mg.row, pz = z0 + j * cell;
        for (let i = 0; i < gx; i++) {
          const px = x0 + i * cell, sh = px - coastX(pz), cl = climate(px, pz), h = baseHeight(px, pz), o = j * gx + i; mg.h[i + j * gx] = h;
          let r, g, b;
          if (sh < 360 && h < 6) [r, g, b] = [232, 220, 170];
          else if (cl.snow > 0.5 || h > 520) { const kk = clamp(h / 900, 0, 1); [r, g, b] = [236 - 40 * kk, 242 - 36 * kk, 250 - 24 * kk]; }
          else if (cl.desert > 0.45) [r, g, b] = [218, 182, 124];
          else [r, g, b] = [150, 176, 104];
          mg.rgb[o * 3] = r; mg.rgb[o * 3 + 1] = g; mg.rgb[o * 3 + 2] = b;
        }
      }
      if (mg.row >= gz) { mg.sh = new Float32Array(gx * gz); const H = (i, j) => mg.h[clamp(j, 0, gz - 1) * gx + clamp(i, 0, gx - 1)]; for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) mg.sh[j * gx + i] = clamp((H(i - 2, j - 2) - H(i + 2, j + 2)) / 244, -0.5, 0.5); mg.done = true; }
    };
    if (sync) { rows(gz); return mg; }
    const step = () => { rows(6); if (!mg.done) setTimeout(step, 16); };
    setTimeout(step, 4000);
    return mg;
  }
  // The whole world, north up, painted once: sea, beach, desert, snow, grass shaded by the lie of the land, the city, the roads and the places.
  makeWorldLayer(W, H, s, cx, cz) {
    const L = document.createElement('canvas'); L.width = W; L.height = H; const c = L.getContext('2d');
    const mg = this.prepareMapGrid(true), { cell, x0, z0, gx, gz } = mg;
    // Every pixel: its colour from the four nodes round it (smoothly), shaded by the slope there, and the sea where it is west of the coast (to the pixel).
    const im = c.createImageData(W, H), d = im.data, sea = [63, 127, 166];
    const coastRow = new Float32Array(H); for (let y = 0; y < H; y++) coastRow[y] = coastX((y - H / 2) / s + cz);
    for (let y = 0; y < H; y++) {
      const pz = (y - H / 2) / s + cz, fz = (pz - z0) / cell, j = Math.floor(fz), tz = fz - j, inZ = j >= 0 && j < gz - 1;
      for (let x = 0; x < W; x++) {
        const px = (x - W / 2) / s + cx, o = (y * W + x) * 4, fx = (px - x0) / cell, i = Math.floor(fx), tx = fx - i;
        if (!inZ || i < 0 || i >= gx - 1) { d[o] = sea[0]; d[o + 1] = sea[1]; d[o + 2] = sea[2]; d[o + 3] = 255; continue; }
        const n00 = j * gx + i, n10 = n00 + 1, n01 = n00 + gx, n11 = n01 + 1, w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
        let r = mg.rgb[n00 * 3] * w00 + mg.rgb[n10 * 3] * w10 + mg.rgb[n01 * 3] * w01 + mg.rgb[n11 * 3] * w11;
        let g = mg.rgb[n00 * 3 + 1] * w00 + mg.rgb[n10 * 3 + 1] * w10 + mg.rgb[n01 * 3 + 1] * w01 + mg.rgb[n11 * 3 + 1] * w11;
        let b = mg.rgb[n00 * 3 + 2] * w00 + mg.rgb[n10 * 3 + 2] * w10 + mg.rgb[n01 * 3 + 2] * w01 + mg.rgb[n11 * 3 + 2] * w11;
        const sl = mg.sh[n00] * w00 + mg.sh[n10] * w10 + mg.sh[n01] * w01 + mg.sh[n11] * w11, k = 1 + sl * 0.5, land = clamp((px - coastRow[y]) * s + 0.5, 0, 1);
        r = sea[0] + (clamp(r * k, 0, 255) - sea[0]) * land; g = sea[1] + (clamp(g * k, 0, 255) - sea[1]) * land; b = sea[2] + (clamp(b * k, 0, 255) - sea[2]) * land;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    c.putImageData(im, 0, 0);
    c.translate(W / 2, H / 2); c.scale(s, s); c.translate(-cx, -cz);
    // The city: blocks tinted by district with their buildings in clumps, parks and plazas, the hills shaded, the water, then every road.
    c.fillStyle = '#cfcbc3'; c.fillRect(-EDGE - 8, -EDGE - 8, 2 * EDGE + 16, 2 * EDGE + 16);
    const zoneCol = (i, j) => { const d = Math.max(Math.abs(i + 0.5), Math.abs(j + 0.5)) * SP; return d < 520 ? ['#9aa0ad', '#adb3c0', '#8a909e'] : d < 1000 ? ['#b8aa98', '#c7b9a6', '#a99b89'] : d < 1500 ? ['#c9bca6', '#d6c9b3', '#baa98f'] : ['#d7cdb8', '#c9d0ad', '#e0d4bd']; };
    for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
      const bk = blockRect(i, j), cols = zoneCol(i, j), w = bk.x1 - bk.x0, h = bk.z1 - bk.z0;
      if (isPark(i, j)) { c.fillStyle = '#b9cf9a'; c.fillRect(bk.x0, bk.z0, w, h); c.fillStyle = '#8fb374'; for (let k = 0; k < 14; k++) { const px = bk.x0 + hash3(i, j, 10 + k) * w, pz = bk.z0 + hash3(i, j, 40 + k) * h; c.beginPath(); c.arc(px, pz, 7, 0, 7); c.fill(); } continue; }
      c.fillStyle = '#d8d2c6'; c.fillRect(bk.x0, bk.z0, w, h);
      const n = 2 + Math.floor(hash3(i, j, 5) * 2);                                                                     // buildings: a few rectangles in each block, not one square
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        const lw = w / n, lh = h / n, ix = 4 + hash3(i * 7 + a, j * 3 + b, 1) * 7, iz = 4 + hash3(i * 5 + a, j * 11 + b, 2) * 7; c.fillStyle = cols[(hash3(i + a, j + b, 3) * 3) | 0];
        c.fillRect(bk.x0 + a * lw + ix, bk.z0 + b * lh + iz, lw - ix - 4, lh - iz - 4);
      }
    }
    c.fillStyle = 'rgba(190,200,170,0.0)';
    for (let x = -EDGE; x < EDGE; x += 90) for (let z = -EDGE; z < EDGE; z += 90) {                                      // the hills, shaded as if lit from the north-west
      const hh = heightBL(x + 45, z + 45); if (hh < 0.5) continue; const sh = clamp((heightBL(x - 30, z - 30) - heightBL(x + 120, z + 120)) / 50, -0.5, 0.5);
      c.fillStyle = `rgba(${sh > 0 ? '255,250,215' : '60,70,45'},${Math.min(0.5, Math.abs(sh) * 0.9)})`; c.fillRect(x, z, 90.5, 90.5); c.fillStyle = `rgba(120,150,90,${Math.min(0.45, hh / 90)})`; c.fillRect(x, z, 90.5, 90.5);
    }
    c.fillStyle = '#8cc3e6'; c.fill(waterPath(), 'nonzero');
    c.lineCap = 'butt';
    for (let k = -N; k <= N; k++) {
      c.strokeStyle = isBlvd(k) ? '#ffffff' : '#f6f3ec'; c.lineWidth = Math.max(hw(k) * 2, 1.4 / s);
      c.beginPath(); c.moveTo(k * SP, -EDGE); c.lineTo(k * SP, EDGE); c.stroke();
      c.beginPath(); c.moveTo(-EDGE, k * SP); c.lineTo(EDGE, k * SP); c.stroke();
    }
    c.lineJoin = 'round'; for (const A of AVENUES) { c.strokeStyle = A.kind === 'hill' ? '#f6f3ec' : '#ffffff'; c.lineWidth = Math.max(A.hw * 2, 1.8 / s); c.beginPath(); A.pts.forEach((q, k) => (k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.stroke(); }
    // Roads outside the city: the motorways (wide), the roads into the towns and farms and the streets in them (thin).
    c.lineJoin = 'round';
    for (const R of ROADS) { if (R.kind !== 'street' && !R.id.startsWith('acc-')) continue; c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(R.kind === 'street' ? R.hw * 2 : 9, 1.8 / s); c.beginPath(); R.x.forEach((x, i) => (i ? c.lineTo(x, R.z[i]) : c.moveTo(x, R.z[i]))); c.stroke(); }
    c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(26, 3.2 / s);
    for (const R of ROADS) { if (R.kind !== 'motorway') continue; c.beginPath(); R.x.forEach((x, i) => (i ? c.lineTo(x, R.z[i]) : c.moveTo(x, R.z[i]))); c.stroke(); }
    // The places outside the city: a small coloured spot and the name.
    const KIND = { town: ['#d9534f', 'town'], farm: ['#8aa83c', 'farm'], harbour: ['#2b6cb0', 'port'], village: ['#e8a33d', 'village'], lighthouse: ['#c0392b', 'light'], resort: ['#4aa3d9', 'ski'], western: ['#a8764a', 'ghost town'], oil: ['#3a3a3a', 'oil'], solar: ['#2b4a8a', 'solar'], dishes: ['#6b7280', 'radio'] };
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const S of SITES) {
      const [col] = KIND[S.kind] || ['#555', ''];
      c.save(); c.translate(S.x, S.z); c.scale(1 / s, 1 / s); c.fillStyle = col; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 5.5, 0, 7); c.fill(); c.stroke();
      c.font = '700 11px Barlow, sans-serif'; c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.fillStyle = 'rgba(30,35,50,0.95)'; c.strokeText(S.name, 0, -12); c.fillText(S.name, 0, -12); c.restore();
    }
    c.font = `700 ${15 / s}px Barlow, sans-serif`; c.fillStyle = 'rgba(30,40,60,0.75)';
    for (const [t, x, z] of [['DOWNTOWN', 0, 0], ['THE OCEAN', -3900, 600], ['SNOWY MOUNTAINS', 1500, -5600], ['THE DESERT', 5200, -300], ['GRASSLAND', 300, 4800], ['COAST', -2900, -2800]]) c.fillText(t, x, z);
    c.font = `600 ${11 / s}px Barlow, sans-serif`; c.fillStyle = 'rgba(40,80,30,0.9)'; for (const H of HILLS) c.fillText(H.name.toUpperCase(), H.cx, H.cz);
    c.fillStyle = 'rgba(20,70,120,0.85)';
    for (const [t, x, z] of [['SUNSET RIVER', 0, -330], ['SUNSET LAKE', -990, -190], ['EAST BASIN', 990, -10]]) c.fillText(t, x, z);
    c.fillStyle = 'rgba(70,50,40,0.8)';
    for (const [t, x, z] of [['TOWER', -93, 230], ['OLD TOWN', -450, 540], ['STADIUM', 626, 900], ['BIG WHEEL', 626, -450], ['DOCKS', 650, -10]]) c.fillText(t, x, z);
    return L;
  }
  drawBigMap(cv, car, route, waypoint, found = []) {
    const c = cv.getContext('2d'), W = cv.width, H = cv.height;
    const wx = WORLD.x1 - WORLD.x0, wz = WORLD.z1 - WORLD.z0, s = Math.min(W / wx, H / wz) * 0.98, cx = (WORLD.x0 + WORLD.x1) / 2, cz = (WORLD.z0 + WORLD.z1) / 2;
    this.bigScale = s; this.bigW = W; this.bigH = H; this.bigC = [cx, cz];
    if (!this.worldLayer || this.worldLayer.width !== W) this.worldLayer = this.makeWorldLayer(W, H, s, cx, cz);
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(this.worldLayer, 0, 0);
    c.translate(W / 2, H / 2); c.scale(s, s); c.translate(-cx, -cz);
    const icon = (x, z, fill, label) => {
      c.save(); c.translate(x, z); c.scale(1 / s, 1 / s); c.fillStyle = fill; c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -11); c.lineTo(10, 0); c.lineTo(0, 11); c.lineTo(-10, 0); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.font = '700 12px Barlow, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 0, 1); c.restore();
    };
    if (found.includes('airfield')) icon(AIRFIELD.x, 3350, '#2b5db3', '✈');
    for (const b of BUNKERS) if (found.includes(b.id)) icon(b.cx - 30, b.cz, '#c4202a', '!');
    if (route) {
      c.strokeStyle = '#18b5e0'; c.lineWidth = 6 / s; c.lineJoin = 'round';
      c.beginPath(); route.path.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
      c.fillStyle = '#f0b400'; for (const p of route.cps) { c.beginPath(); c.arc(p.x, p.z, 6 / s, 0, Math.PI * 2); c.fill(); }
    }
    if (waypoint) {
      c.fillStyle = '#ff3d9a'; c.strokeStyle = '#fff'; c.lineWidth = 2 / s;
      c.beginPath(); c.arc(waypoint.x, waypoint.z, 10 / s, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.save(); c.translate(car.x, car.z); c.rotate(Math.PI - car.h); c.scale(1 / s, 1 / s);
    c.fillStyle = '#ff7a2a'; c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -13); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill(); c.stroke(); c.restore();
  }
  // Canvas pixel position on the big map -> world position.
  bigToWorld(px, py) { const s = this.bigScale; return { x: (px - this.bigW / 2) / s + this.bigC[0], z: (py - this.bigH / 2) / s + this.bigC[1] }; }
}
