// The big map (Tab, or the MAP button). The whole world, or the city close up: drag to move, pinch or the + and - buttons (or the mouse wheel) to zoom,
// CITY and WORLD jump between the two, ME comes back to where you are, and the places list jumps to any named place. Tap anywhere to pick a spot: a card shows
// what is there and how far, with SET WAYPOINT and TELEPORT HERE (not during a race or a police chase; it asks twice, so a stray tap cannot throw you across
// the world). Everything but the land is drawn live from the same numbers the game uses (the roads, the blocks, the river), so it is sharp at any zoom.
import { $, clamp, hash3 } from './util.js';
import { N, SP, hw, isBlvd, EDGE, blockRect, isPark } from './city.js';
import { LANDMARKS, SIGNATURE } from './grid.js';
import { heightBL, HILLS, plaza } from './hills.js';
import { AVENUES, nearestAvenue } from './avenues.js';
import { WORLD, ROADS, coastX, climate, BUNKERS, AIRFIELD } from './world.js';
import { SITES } from './settlements.js';
import { waterPath } from './hud.js';

const COL = {
  out: '#24364a', sea: '#3d7ea6', city: '#ddd8cc', park: '#bfd6a4', tree: '#98bb7d', water: '#8cc3e6', waterEdge: '#5f9fc7', plaza: '#ece6d6', sig: '#aab0bd',
  road: '#ffffff', roadCase: '#b3aea3', lane: '#f4f1ea', motor: '#fff2b8', motorCase: '#cfa94a', hill: '#a6bd86',
};
const KIND = {
  town: ['#d9534f', 'Town'], farm: ['#8aa83c', 'Farm'], harbour: ['#2b6cb0', 'Harbour'], village: ['#e8a33d', 'Seaside village'], lighthouse: ['#c0392b', 'Lighthouse'],
  resort: ['#3aa0d9', 'Ski resort'], western: ['#a8764a', 'Ghost town'], oil: ['#3a3a3a', 'Oil field'], solar: ['#2b4a8a', 'Solar farm'], dishes: ['#6b7280', 'Radio telescope'],
};
// The named places the list jumps to, and what the card calls a spot near one.
export const PLACES = [
  { name: 'Downtown', x: 0, z: 0, r: 300, group: 'City', zoom: 0.5 }, { name: 'Sunset Tower', x: -90, z: 270, r: 130, group: 'City', zoom: 0.8 },
  { name: 'Old Town', x: -450, z: 630, r: 330, group: 'City', zoom: 0.7 }, { name: 'Stadium', x: 630, z: 810, r: 200, group: 'City', zoom: 0.7 },
  { name: 'Big Wheel', x: 630, z: -450, r: 130, group: 'City', zoom: 0.8 }, { name: 'The Docks', x: 650, z: -10, r: 220, group: 'City', zoom: 0.7 },
  { name: 'Sunset Lake', x: -990, z: -190, r: 170, group: 'City', zoom: 0.7 }, { name: 'East Basin', x: 990, z: -10, r: 170, group: 'City', zoom: 0.7 },
  ...HILLS.map(h => ({ name: h.name, x: h.cx, z: h.cz, r: 380, group: 'Hills', zoom: 0.45 })),
  ...SITES.map(S => ({ name: S.name, x: S.x, z: S.z, r: Math.max(S.pads[0].hx, S.pads[0].hz) + 140, group: 'Out there', zoom: 0.35, kind: KIND[S.kind][1], site: S })),
];
const BIOME_LABELS = [['OCEAN', -3950, 1500], ['SNOWY MOUNTAINS', 1500, -5600], ['THE DESERT', 5200, -300], ['GRASSLAND', -1700, 5300], ['COAST', -2750, -3300]];
const DISTRICT_LABELS = [['DOWNTOWN', 0, 60], ['OLD TOWN', -450, 560], ['STADIUM', 630, 900], ['SUNSET RIVER', 0, -330], ['SUNSET LAKE', -990, -190], ['EAST BASIN', 990, -10], ['THE DOCKS', 650, 40], ['BIG WHEEL', 630, -380], ['TOWER', -90, 180]];
const fmtDist = m => m < 950 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';

export class BigMap {
  // hooks: focus() -> { x, z, h }, route(), waypoint(), setWaypoint(p | null), found(), canTeleport() -> null or a reason, teleport(x, z) -> { name } or null
  constructor(hud, hooks) {
    this.hud = hud; this.h = hooks; this.cv = $('bigmap-c'); this.ctx = this.cv.getContext('2d'); this.v = { cx: 0, cz: 0, s: 0.2 }; this.sel = null; this.terrain = null;
    this.ptr = new Map(); this.raf = 0; this.W = 1; this.H = 1; this.u = 1; this.open_ = false;
    const cv = this.cv, k = () => cv.width / Math.max(1, cv.getBoundingClientRect().width);
    cv.addEventListener('pointerdown', e => {
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* not a capturable pointer */ }
      this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0 }); this.pinch = null;
    });
    cv.addEventListener('pointermove', e => {
      const p = this.ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.moved = Math.max(p.moved, Math.hypot(p.x - p.x0, p.y - p.y0));
      if (this.ptr.size === 1) { this.v.cx -= dx * k() / this.v.s; this.v.cz -= dy * k() / this.v.s; this.clampView(); this.redraw(); }
      else if (this.ptr.size === 2) {
        const [a, b] = [...this.ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mid = this.canvasXY((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (this.pinch) this.zoomAt(mid[0], mid[1], d / this.pinch); this.pinch = d;
      }
    });
    const up = e => {
      const p = this.ptr.get(e.pointerId); if (!p) return; this.ptr.delete(e.pointerId); this.pinch = null;
      if (this.ptr.size === 0 && p.moved < 9 && performance.now() - p.t0 < 800) this.tap(...this.canvasXY(e.clientX, e.clientY));
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { this.ptr.delete(e.pointerId); this.pinch = null; });
    cv.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = this.canvasXY(e.clientX, e.clientY); this.zoomAt(x, y, Math.exp(-e.deltaY * 0.0016)); }, { passive: false });
    $('bm-in').addEventListener('click', () => this.zoomAt(this.W / 2, this.H / 2, 1.6)); $('bm-out').addEventListener('click', () => this.zoomAt(this.W / 2, this.H / 2, 1 / 1.6));
    $('bm-city').addEventListener('click', () => { this.fitCity(); this.redraw(); }); $('bm-world').addEventListener('click', () => { this.fitWorld(); this.redraw(); });
    $('bm-me').addEventListener('click', () => { const f = this.h.focus(); this.v.cx = f.x; this.v.cz = f.z; this.v.s = Math.max(this.v.s, 0.35); this.clampView(); this.redraw(); });
    $('bm-clear').addEventListener('click', () => { this.h.setWaypoint(null); this.redraw(); this.fillCard(); });
    $('bm-wp').addEventListener('click', () => { if (!this.sel) return; const w = this.h.waypoint(), same = w && Math.hypot(w.x - this.sel.x, w.z - this.sel.z) < 1; this.h.setWaypoint(same ? null : { x: this.sel.x, z: this.sel.z }); this.redraw(); this.fillCard(); });
    $('bm-tp').addEventListener('click', () => this.teleportClick());
    $('bm-places').addEventListener('click', () => $('bm-chips').classList.toggle('hidden'));
    $('bm-pop-x').addEventListener('click', () => { this.sel = null; this.showCard(); this.redraw(); });
    addEventListener('resize', () => { if (this.open_) { this.resize(); this.redraw(); } });
    // The places list.
    const chips = $('bm-chips'); let group = '';
    for (const p of PLACES) { if (p.group !== group) { group = p.group; const t = document.createElement('span'); t.className = 'grp'; t.textContent = group; chips.appendChild(t); } const b = document.createElement('button'); b.textContent = p.name; b.addEventListener('click', () => this.goTo(p)); chips.appendChild(b); }
  }
  // --- the view ------------------------------------------------------------------------------------------------------------------------------------------------
  canvasXY(cx, cy) { const r = this.cv.getBoundingClientRect(), k = this.cv.width / Math.max(1, r.width); return [(cx - r.left) * k, (cy - r.top) * k]; }
  toWorld(px, py) { return [(px - this.W / 2) / this.v.s + this.v.cx, (py - this.H / 2) / this.v.s + this.v.cz]; }
  toScreen(x, z) { return [(x - this.v.cx) * this.v.s + this.W / 2, (z - this.v.cz) * this.v.s + this.H / 2]; }
  worldFitS() { return Math.min(this.W / (WORLD.x1 - WORLD.x0), this.H / (WORLD.z1 - WORLD.z0)) * 0.96; }
  fitWorld() { this.v.s = this.worldFitS(); this.v.cx = (WORLD.x0 + WORLD.x1) / 2; this.v.cz = (WORLD.z0 + WORLD.z1) / 2; }
  fitCity() { this.v.s = Math.min(this.W, this.H) / (2 * EDGE + 240); this.v.cx = 0; this.v.cz = 0; }
  clampView() { const v = this.v; v.s = clamp(v.s, this.worldFitS() * 0.9, 2.4 * this.u); v.cx = clamp(v.cx, WORLD.x0, WORLD.x1); v.cz = clamp(v.cz, WORLD.z0, WORLD.z1); }
  zoomAt(px, py, f) { const [wx, wz] = this.toWorld(px, py); this.v.s *= f; this.clampView(); this.v.cx = wx - (px - this.W / 2) / this.v.s; this.v.cz = wz - (py - this.H / 2) / this.v.s; this.clampView(); this.redraw(); }
  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(300, Math.round(r.width * dpr)), h = Math.max(200, Math.round(r.height * dpr));
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.W = this.cv.width; this.H = this.cv.height; this.u = this.W / Math.max(1, r.width);                      // (canvas pixels per CSS pixel: text and buttons keep their size on a retina screen)
  }
  open() {
    this.open_ = true; this.resize(); if (!this.terrain) this.terrain = this.hud.terrainLayer(1000);
    const f = this.h.focus(); this.sel = null; this.showCard();
    if (Math.abs(f.x) < EDGE + 200 && Math.abs(f.z) < EDGE + 200) { this.fitCity(); this.v.cx = clamp(f.x, -EDGE * 0.35, EDGE * 0.35); this.v.cz = clamp(f.z, -EDGE * 0.35, EDGE * 0.35); this.v.s *= 1.5; } else this.fitWorld();
    this.clampView(); this.draw();
  }
  close() { this.open_ = false; $('bm-chips').classList.add('hidden'); this.sel = null; this.showCard(); }
  goTo(p) { $('bm-chips').classList.add('hidden'); this.v.cx = p.x; this.v.cz = p.z; this.v.s = Math.max(this.v.s, p.zoom * (Math.min(this.W, this.H) / 900)); this.clampView(); this.select(p.x, p.z); }
  // --- picking a spot ----------------------------------------------------------------------------------------------------------------------------------------
  tap(px, py) { const [x, z] = this.toWorld(px, py); this.select(x, z); }
  select(x, z) { this.sel = { x, z, ...this.describe(x, z) }; this.confirm = false; this.showCard(); this.redraw(); }
  describe(x, z) {
    for (const p of PLACES) if (p.site && Math.hypot(x - p.x, z - p.z) < p.r) return { name: p.name, kind: p.kind };
    for (const p of PLACES) if (!p.site && Math.hypot(x - p.x, z - p.z) < p.r) return { name: p.name, kind: p.group === 'Hills' ? 'Hill' : 'In the city' };
    if (Math.abs(x) < EDGE && Math.abs(z) < EDGE) {
      const r = nearestAvenue(x, z); if (r && r.d < r.a.W + 6) return { name: r.a.name, kind: r.a.kind === 'hill' ? 'Winding road' : 'Road' };
      const d = Math.max(Math.abs(x), Math.abs(z)); return { name: d < 520 ? 'Downtown' : d < 1000 ? 'Midtown' : d < 1500 ? 'Uptown' : 'The suburbs', kind: 'In the city' };
    }
    if (x < coastX(z) + 70) return { name: 'The ocean', kind: 'Open water' };
    const cl = climate(x, z); return { name: cl.snow > 0.5 ? 'Snowy mountains' : cl.desert > 0.45 ? 'The desert' : 'Grassland', kind: 'Open country' };
  }
  fillCard() {
    if (!this.sel) return; const f = this.h.focus(), d = Math.hypot(this.sel.x - f.x, this.sel.z - f.z), why = this.h.canTeleport(), w = this.h.waypoint();
    $('bm-pop-name').textContent = this.sel.name; $('bm-pop-sub').textContent = `${this.sel.kind} · ${d < 30 ? 'you are here' : fmtDist(d) + ' away'}`;
    const same = w && Math.hypot(w.x - this.sel.x, w.z - this.sel.z) < 1; $('bm-wp').textContent = same ? 'REMOVE WAYPOINT' : 'SET WAYPOINT';
    const tp = $('bm-tp'); tp.disabled = !!why; tp.textContent = this.confirm ? 'TAP AGAIN TO GO' : 'TELEPORT HERE'; tp.classList.toggle('arm', !!this.confirm);
    $('bm-pop-why').textContent = why || '';
  }
  showCard() { const pop = $('bm-pop'); pop.classList.toggle('hidden', !this.sel); if (this.sel) this.fillCard(); }
  teleportClick() {
    if (!this.sel || this.h.canTeleport()) return;
    if (!this.confirm) { this.confirm = true; this.fillCard(); clearTimeout(this.cT); this.cT = setTimeout(() => { this.confirm = false; this.fillCard(); }, 3000); return; }
    clearTimeout(this.cT); this.confirm = false; this.h.teleport(this.sel.x, this.sel.z);
  }
  redraw() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; if (this.open_) this.draw(); }); }
  // --- drawing -----------------------------------------------------------------------------------------------------------------------------------------------
  draw() {
    const c = this.ctx, { W, H } = this, { cx, cz, s } = this.v, b = { x0: cx - W / 2 / s, x1: cx + W / 2 / s, z0: cz - H / 2 / s, z1: cz + H / 2 / s };
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = COL.out; c.fillRect(0, 0, W, H);
    c.setTransform(s, 0, 0, s, W / 2 - cx * s, H / 2 - cz * s); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    if (this.terrain) c.drawImage(this.terrain, WORLD.x0, WORLD.z0, WORLD.x1 - WORLD.x0, WORLD.z1 - WORLD.z0);
    { const za = Math.max(WORLD.z0, b.z0 - 80), zb = Math.min(WORLD.z1, b.z1 + 80); c.fillStyle = COL.sea; c.beginPath(); c.moveTo(WORLD.x0, za); for (let z = za; z <= zb; z += 40) c.lineTo(coastX(z), z); c.lineTo(WORLD.x0, zb); c.closePath(); c.fill(); }   // (the coast, sharp at any zoom)
    this.drawCity(c, s, b); this.drawRoads(c, s, b); this.drawPlaces(c, s, b); this.drawMarks(c, s);
    c.setTransform(1, 0, 0, 1, 0, 0); this.drawFrame(c);
    // keep the card on its spot
    if (this.sel) { const pop = $('bm-pop'), [sx, sy] = this.toScreen(this.sel.x, this.sel.z), r = this.cv.getBoundingClientRect(), k = r.width / this.W, w = pop.offsetWidth || 250, h = pop.offsetHeight || 130;
      let left = sx * k + 16, top = sy * k - h / 2; if (left + w > r.width - 8) left = sx * k - w - 16; left = clamp(left, 8, Math.max(8, r.width - w - 8)); top = clamp(top, 8, Math.max(8, r.height - h - 8)); pop.style.left = left + 'px'; pop.style.top = top + 'px'; }
    $('bm-city').classList.toggle('on', s > Math.min(W, H) / (2 * EDGE + 240) * 0.85); $('bm-world').classList.toggle('on', s < this.worldFitS() * 1.4);
  }
  drawCity(c, s, b) {
    if (b.x1 < -EDGE - 20 || b.x0 > EDGE + 20 || b.z1 < -EDGE - 20 || b.z0 > EDGE + 20) return;
    c.fillStyle = COL.city; c.fillRect(-EDGE - 14, -EDGE - 14, 2 * EDGE + 28, 2 * EDGE + 28);
    const fine = s / this.u > 0.13, i0 = clamp(Math.floor(b.x0 / SP) - 1, -N, N - 1), i1 = clamp(Math.floor(b.x1 / SP) + 1, -N, N - 1), j0 = clamp(Math.floor(b.z0 / SP) - 1, -N, N - 1), j1 = clamp(Math.floor(b.z1 / SP) + 1, -N, N - 1);
    const zone = (i, j) => { const d = Math.max(Math.abs(i + 0.5), Math.abs(j + 0.5)) * SP; return d < 520 ? ['#98a0b0', '#aab2c2', '#8790a1'] : d < 1000 ? ['#b9aa97', '#c8baa7', '#a99a88'] : d < 1500 ? ['#c9bca6', '#d6c9b3', '#baa98f'] : ['#d6ccb7', '#cbd2b0', '#e0d4bd']; };
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = blockRect(i, j), w = k.x1 - k.x0, h = k.z1 - k.z0, key = i + ',' + j;
      if (isPark(i, j)) { c.fillStyle = COL.park; c.fillRect(k.x0, k.z0, w, h); if (fine) { c.fillStyle = COL.tree; for (let n = 0; n < 16; n++) { c.beginPath(); c.arc(k.x0 + hash3(i, j, 10 + n) * w, k.z0 + hash3(i, j, 40 + n) * h, 6 + hash3(i, j, 70 + n) * 4, 0, 7); c.fill(); } } continue; }
      if (plaza(i, j)) { c.fillStyle = COL.plaza; c.fillRect(k.x0, k.z0, w, h); c.fillStyle = COL.water; c.beginPath(); c.arc(k.x0 + w / 2, k.z0 + h / 2, 14, 0, 7); c.fill(); continue; }
      if (SIGNATURE[key]) { c.fillStyle = COL.sig; c.fillRect(k.x0, k.z0, w, h); c.fillStyle = '#e9edf5'; c.fillRect(k.x0 + w * 0.3, k.z0 + h * 0.3, w * 0.4, h * 0.4); continue; }
      c.fillStyle = '#d4cec2'; c.fillRect(k.x0, k.z0, w, h);
      if (!fine) { c.fillStyle = zone(i, j)[1]; c.fillRect(k.x0 + 6, k.z0 + 6, w - 12, h - 12); continue; }
      const cols = zone(i, j), n = 2 + Math.floor(hash3(i, j, 5) * 2);
      for (let a = 0; a < n; a++) for (let q = 0; q < n; q++) { const lw = w / n, lh = h / n, ix = 4 + hash3(i * 7 + a, j * 3 + q, 1) * 7, iz = 4 + hash3(i * 5 + a, j * 11 + q, 2) * 7; c.fillStyle = cols[(hash3(i + a, j + q, 3) * 3) | 0]; c.fillRect(k.x0 + a * lw + ix, k.z0 + q * lh + iz, lw - ix - 4, lh - iz - 4); }
    }
    // landmarks
    for (const [key, kind] of Object.entries(LANDMARKS)) { const [i, j] = key.split(',').map(Number), k = blockRect(i, j), x = (k.x0 + k.x1) / 2, z = (k.z0 + k.z1) / 2; c.fillStyle = '#efe9db'; c.fillRect(k.x0, k.z0, k.x1 - k.x0, k.z1 - k.z0);
      c.fillStyle = kind === 'stadium' ? '#e6e2d6' : '#8a8f9c'; c.strokeStyle = '#8a8f9c'; c.lineWidth = 3;
      if (kind === 'stadium') { c.beginPath(); c.ellipse(x, z, 66, 54, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#7fae6a'; c.beginPath(); c.ellipse(x, z, 40, 30, 0, 0, 7); c.fill(); }
      else if (kind === 'wheel') { c.fillStyle = COL.park; c.fillRect(k.x0, k.z0, k.x1 - k.x0, k.z1 - k.z0); c.strokeStyle = '#6d7482'; c.lineWidth = 3; c.beginPath(); c.arc(x, z, 34, 0, 7); c.stroke(); for (let a = 0; a < 6; a++) { c.beginPath(); c.moveTo(x, z); c.lineTo(x + Math.cos(a * 1.047) * 34, z + Math.sin(a * 1.047) * 34); c.stroke(); } }
      else if (kind === 'cathedral') { c.fillRect(x - 11, z - 44, 22, 88); c.fillRect(x - 38, z - 11, 76, 22); }
      else { c.beginPath(); for (let a = 0; a < 10; a++) { const r = a % 2 ? 14 : 34; c.lineTo(x + Math.cos(a * 0.628 - 1.57) * r, z + Math.sin(a * 0.628 - 1.57) * r); } c.closePath(); c.fill(); } }
    // the hills, shaded as if lit from the north-west
    if (s / this.u > 0.09) for (let x = Math.max(-EDGE, Math.floor(b.x0 / 90) * 90); x < Math.min(EDGE, b.x1); x += 90) for (let z = Math.max(-EDGE, Math.floor(b.z0 / 90) * 90); z < Math.min(EDGE, b.z1); z += 90) {
      const hh = heightBL(x + 45, z + 45); if (hh < 0.5) continue; const sh = clamp((heightBL(x - 30, z - 30) - heightBL(x + 120, z + 120)) / 50, -0.5, 0.5);
      c.fillStyle = `rgba(${sh > 0 ? '255,250,215' : '60,70,45'},${Math.min(0.5, Math.abs(sh) * 0.9)})`; c.fillRect(x, z, 90.5, 90.5); c.fillStyle = `rgba(120,150,90,${Math.min(0.4, hh / 100)})`; c.fillRect(x, z, 90.5, 90.5);
    }
    c.fillStyle = COL.water; c.fill(waterPath(), 'nonzero'); c.strokeStyle = COL.waterEdge; c.lineWidth = Math.max(1.5, 1.2 * this.u / s); c.stroke(waterPath());
  }
  drawRoads(c, s, b) {
    c.lineJoin = 'round'; c.lineCap = 'butt'; const px = v => v * this.u / s;                             // (screen pixels as world metres)
    const line = (pts, n) => { c.beginPath(); for (let i = 0; i < n; i++) i ? c.lineTo(pts.x[i], pts.z[i]) : c.moveTo(pts.x[i], pts.z[i]); c.stroke(); };
    const inCity = !(b.x1 < -EDGE || b.x0 > EDGE || b.z1 < -EDGE || b.z0 > EDGE);
    if (inCity) {
      for (const pass of [0, 1]) {
        for (let k = -N; k <= N; k++) {
          const wd = Math.max(hw(k) * 2, px(isBlvd(k) ? 3 : 1.8)); c.strokeStyle = pass ? (isBlvd(k) ? '#ffffff' : COL.lane) : COL.roadCase; c.lineWidth = pass ? wd : wd + px(1.6);
          if (k * SP > b.x0 - 40 && k * SP < b.x1 + 40) { c.beginPath(); c.moveTo(k * SP, -EDGE); c.lineTo(k * SP, EDGE); c.stroke(); }
          if (k * SP > b.z0 - 40 && k * SP < b.z1 + 40) { c.beginPath(); c.moveTo(-EDGE, k * SP); c.lineTo(EDGE, k * SP); c.stroke(); }
        }
        for (const A of AVENUES) { if (A.bb === undefined) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < A.n; i++) { x0 = Math.min(x0, A.x[i]); x1 = Math.max(x1, A.x[i]); z0 = Math.min(z0, A.z[i]); z1 = Math.max(z1, A.z[i]); } A.bb = [x0, x1, z0, z1]; }
          if (A.bb[1] < b.x0 || A.bb[0] > b.x1 || A.bb[3] < b.z0 || A.bb[2] > b.z1) continue;
          const wd = Math.max(A.hw * 2, px(A.kind === 'hill' ? 1.8 : 2.4)); c.strokeStyle = pass ? (A.kind === 'hill' ? COL.lane : '#ffffff') : COL.roadCase; c.lineWidth = pass ? wd : wd + px(1.6); line(A, A.n); }
      }
    }
    const found = this.h.found();
    for (const pass of [0, 1]) for (const R of ROADS) {
      if (R.kind === 'runway' || R.id.startsWith('svc-')) { if (!(R.kind === 'runway' ? found.includes('airfield') : found.includes('airfield') || BUNKERS.some(q => found.includes(q.id)))) continue; }
      const mw = R.kind === 'motorway', wd = Math.max(mw ? 24 : R.kind === 'street' ? R.hw * 2 : 9, px(mw ? 3.6 : 2));
      c.strokeStyle = pass ? (mw ? COL.motor : COL.road) : (mw ? COL.motorCase : COL.roadCase); c.lineWidth = pass ? wd : wd + px(1.8);
      c.beginPath(); for (let i = 0; i < R.x.length; i++) i ? c.lineTo(R.x[i], R.z[i]) : c.moveTo(R.x[i], R.z[i]); c.stroke();
    }
  }
  // Text and icons are drawn at a fixed size on the screen, wherever they are in the world.
  at(c, s, x, z, fn) { c.save(); c.translate(x, z); c.scale(this.u / s, this.u / s); fn(); c.restore(); }
  label(c, text, size, col, y = 0, halo = 'rgba(255,255,255,0.85)') { c.font = `700 ${size}px Barlow, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 4; c.strokeStyle = halo; c.lineJoin = 'round'; c.strokeText(text, 0, y); c.fillStyle = col; c.fillText(text, 0, y); }
  drawPlaces(c, s, b) {
    const q = s / this.u, world = q < 0.12, fs = 13;
    if (world) for (const [t, x, z] of BIOME_LABELS) this.at(c, s, x, z, () => this.label(c, t, fs + 3, 'rgba(30,45,70,0.8)', 0, 'rgba(255,255,255,0.55)'));
    if (q > 0.12) for (const [t, x, z] of DISTRICT_LABELS) this.at(c, s, x, z, () => this.label(c, t, fs, 'rgba(45,55,80,0.85)'));
    if (q > 0.16) for (const H of HILLS) this.at(c, s, H.cx, H.cz, () => this.label(c, H.name.toUpperCase(), fs - 1, 'rgba(40,85,35,0.95)'));
    for (const S of SITES) { const [col, kind] = KIND[S.kind];
      this.at(c, s, S.x, S.z, () => { c.fillStyle = col; c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, 7, 0, 7); c.fill(); c.stroke(); if (q > 0.045) this.label(c, S.name, fs - 1, '#1f2a3f', -16); if (q > 0.3) this.label(c, kind, fs - 3, '#556', 15); }); }
    const found = this.h.found(), icon = (x, z, fill, g) => this.at(c, s, x, z, () => { c.fillStyle = fill; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -13); c.lineTo(11, 0); c.lineTo(0, 13); c.lineTo(-11, 0); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.font = '700 13px Barlow, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(g, 0, 1); });
    if (found.includes('airfield')) icon(AIRFIELD.x, 3350, '#2b5db3', '✈'); for (const q of BUNKERS) if (found.includes(q.id)) icon(q.cx - 30, q.cz, '#c4202a', '!');
  }
  drawMarks(c, s) {
    const route = this.h.route(), wp = this.h.waypoint(), f = this.h.focus();
    if (route) { c.strokeStyle = '#18b5e0'; c.lineWidth = Math.max(8, 5 * this.u / s); c.lineJoin = 'round'; c.beginPath(); route.path.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); c.fillStyle = '#f0b400'; for (const p of route.cps) { c.beginPath(); c.arc(p.x, p.z, Math.max(9, 6 * this.u / s), 0, 7); c.fill(); } }
    if (this.sel) this.at(c, s, this.sel.x, this.sel.z, () => { c.strokeStyle = '#111'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 13, 0, 7); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke(); c.fillStyle = '#ff7a2a'; c.beginPath(); c.arc(0, 0, 4.5, 0, 7); c.fill(); });
    if (wp) this.at(c, s, wp.x, wp.z, () => { c.fillStyle = '#ff3d9a'; c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-14, -14, -13, -32, 0, -32); c.bezierCurveTo(13, -32, 14, -14, 0, 0); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -21, 4.5, 0, 7); c.fill(); });
    this.at(c, s, f.x, f.z, () => { const t = (performance.now() / 1000) % 2; c.strokeStyle = `rgba(255,122,42,${0.55 * (1 - t / 2)})`; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 14 + 22 * (t / 2), 0, 7); c.stroke(); c.rotate(Math.PI - f.h); c.fillStyle = '#ff7a2a'; c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, -15); c.lineTo(10, 11); c.lineTo(0, 5); c.lineTo(-10, 11); c.closePath(); c.fill(); c.stroke(); });
    if (this.open_ && !this.raf) { clearTimeout(this.pulse); this.pulse = setTimeout(() => this.redraw(), 90); }                  // (the ring round you pulses)
  }
  drawFrame(c) {
    const u = this.u, W = this.W / u, H = this.H / u, s = this.v.s / u; let len = 50; for (const l of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) if (l * s >= 70) { len = l; break; }
    c.save(); c.scale(u, u);
    const x = 22, y = H - 24, px = len * s; c.fillStyle = 'rgba(255,255,255,0.82)'; c.fillRect(x - 8, y - 22, px + 16, 34); c.fillStyle = '#1f2a3f'; c.fillRect(x, y - 4, px, 3); c.fillRect(x, y - 10, 2, 9); c.fillRect(x + px - 2, y - 10, 2, 9);
    c.font = '700 13px Barlow, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(len >= 1000 ? len / 1000 + ' km' : len + ' m', x, y - 13);
    const nx = W - 38, ny = 104; c.fillStyle = 'rgba(255,255,255,0.88)'; c.beginPath(); c.arc(nx, ny, 20, 0, 7); c.fill(); c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(nx, ny - 17); c.lineTo(nx + 7, ny + 4); c.lineTo(nx, ny - 1); c.lineTo(nx - 7, ny + 4); c.closePath(); c.fill(); c.fillStyle = '#1f2a3f'; c.font = '800 12px Barlow, sans-serif'; c.textAlign = 'center'; c.fillText('N', nx, ny + 17);
    c.restore();
  }
}
