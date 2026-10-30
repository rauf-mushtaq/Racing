// The heads-up display: the round rev counter and speedometer (gear in the
// middle, driver aids, nitro gauge), the minimap, and race information.
import { $, clamp, fmtTime } from './util.js';
import { N, SP, hw, isBlvd, EDGE, LIMIT, blockRect, isPark } from './city.js';
import { WORLD, ROADS, coastX, climate, baseHeight, BUNKERS, AIRFIELD } from './world.js';

const A0 = 125 * Math.PI / 180, SPAN = 290 * Math.PI / 180;

export class HUD {
  constructor() {
    this.dial = $('dial'); this.dctx = this.dial.getContext('2d');
    this.map = $('minimap'); this.mctx = this.map.getContext('2d');
    this.resize();
    addEventListener('resize', () => this.resize());
    this.toastT = 0;
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
    const txt = P.bustT > 0.4 ? 'BEING ARRESTED' : P.spotted ? 'SPOTTED' : P.hidden > 0.5 ? `HIDING ${Math.max(1, Math.ceil(P.hiddenNeeded - P.hidden))}` : 'SEARCHING FOR YOU';
    if (C.status.textContent !== txt) C.status.textContent = txt;
    C.status.className = P.bustT > 0.4 ? 'bust' : P.spotted ? 'seen' : 'hid';
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

  // The whole world, north up, painted once: sea, beach, desert, snow, grass, shaded by the lie of the land.
  makeWorldLayer(W, H, s, cx, cz) {
    const L = document.createElement('canvas'); L.width = W; L.height = H; const c = L.getContext('2d');
    c.fillStyle = '#3f7fa6'; c.fillRect(0, 0, W, H);
    c.translate(W / 2, H / 2); c.scale(s, s); c.translate(-cx, -cz);
    const cell = 80, nx = Math.ceil((WORLD.x1 - WORLD.x0) / cell), nz = Math.ceil((WORLD.z1 - WORLD.z0) / cell);
    const tc = document.createElement('canvas'); tc.width = nx; tc.height = nz;
    const tcx = tc.getContext('2d'), im = tcx.createImageData(nx, nz), d = im.data;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const px = WORLD.x0 + (i + 0.5) * cell, pz = WORLD.z0 + (j + 0.5) * cell, sh = px - coastX(pz), o = (j * nx + i) * 4;
      if (sh < 0) continue;
      const cl = climate(px, pz), h = baseHeight(px, pz), shade = clamp((baseHeight(px - 120, pz - 120) - baseHeight(px + 120, pz + 120)) / 260, -0.5, 0.5);
      let r, g, b;
      if (sh < 360 && h < 6) [r, g, b] = [232, 220, 170];
      else if (cl.snow > 0.5 || h > 520) { const k = clamp(h / 900, 0, 1); [r, g, b] = [236 - 40 * k, 242 - 36 * k, 250 - 24 * k]; }
      else if (cl.desert > 0.45) [r, g, b] = [218, 182, 124];
      else [r, g, b] = [150, 176, 104];
      const k = 1 + shade * 0.5;
      d[o] = clamp(r * k, 0, 255); d[o + 1] = clamp(g * k, 0, 255); d[o + 2] = clamp(b * k, 0, 255); d[o + 3] = 255;
    }
    tcx.putImageData(im, 0, 0);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(tc, WORLD.x0, WORLD.z0, nx * cell, nz * cell);
    c.fillStyle = '#d6d3cc'; c.fillRect(-EDGE - 8, -EDGE - 8, 2 * EDGE + 16, 2 * EDGE + 16);
    c.fillStyle = '#c3bfce'; c.fillRect(-520, -520, 1040, 1040);
    c.fillStyle = '#c9cfa8'; for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) if (isPark(i, j)) { const bk = blockRect(i, j); c.fillRect(bk.x0, bk.z0, bk.x1 - bk.x0, bk.z1 - bk.z0); }
    c.lineCap = 'butt';
    for (let k = -N; k <= N; k++) {
      c.strokeStyle = isBlvd(k) ? '#ffffff' : '#f6f3ec'; c.lineWidth = Math.max(hw(k) * 2, 1.4 / s);
      c.beginPath(); c.moveTo(k * SP, -EDGE); c.lineTo(k * SP, EDGE); c.stroke();
      c.beginPath(); c.moveTo(-EDGE, k * SP); c.lineTo(EDGE, k * SP); c.stroke();
    }
    c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(26, 3.2 / s); c.lineJoin = 'round';
    for (const R of ROADS) { if (R.kind !== 'motorway') continue; c.beginPath(); R.x.forEach((x, i) => (i ? c.lineTo(x, R.z[i]) : c.moveTo(x, R.z[i]))); c.stroke(); }
    c.font = `700 ${15 / s}px Barlow, sans-serif`; c.textAlign = 'center'; c.fillStyle = 'rgba(30,40,60,0.75)';
    for (const [t, x, z] of [['DOWNTOWN', 0, 0], ['THE OCEAN', -3900, 600], ['SNOWY MOUNTAINS', 1500, -5600], ['THE DESERT', 5200, -300], ['GRASSLAND', 300, 4800], ['COAST', -2900, -2800]]) c.fillText(t, x, z);
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
