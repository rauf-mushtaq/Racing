// The heads-up display: the round rev counter and speedometer (gear in the
// middle, driver aids, nitro gauge), the minimap, and race information.
import { $, clamp, fmtTime } from './util.js';
import { N, SP, hw, isBlvd, EDGE } from './city.js';

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

  drawMap(car, traffic, route, nextCp) {
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
    c.restore();
    // Player arrow.
    c.fillStyle = '#ff7a2a'; c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx, cy - 11); c.lineTo(cx + 7, cy + 8); c.lineTo(cx, cy + 4); c.lineTo(cx - 7, cy + 8); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 2; c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); c.stroke();
  }

  toast(text, secs = 2.2) {
    const el = $('toast'); el.textContent = text; el.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => el.classList.remove('show'), secs * 1000);
  }
  race(info) {
    const el = $('race-info');
    if (!info) { el.classList.add('hidden'); $('nav').classList.add('hidden'); return; }
    el.classList.remove('hidden');
    $('r-time').textContent = fmtTime(info.time);
    $('r-cp').textContent = `CHECKPOINT ${Math.min(info.cp, info.total)}/${info.total}`;
    $('r-best').textContent = info.best != null ? `BEST ${fmtTime(info.best)}` : '';
    const nav = $('nav'); nav.classList.remove('hidden');
    $('nav-arrow').style.transform = `rotate(${info.arrow}rad)`;
    $('nav-dist').textContent = `${Math.round(info.dist)} m`;
  }
}
