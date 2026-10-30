// Controls: keyboard, gamepads, steering wheels with pedals (with a set-up step
// that learns which axis is which), on-screen touch controls and tilt steering.
import { clamp } from './util.js';
import { settings, save } from './store.js';

const WHEEL_RE = /wheel|racing|g29|g920|g923|g27|g25|t300|t150|t248|t128|tmx|t500|t-gt|thrustmaster|fanatec|moza|simagic|driving force|dfgt/i;

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, hand: false, nitro: false };
    this.handlers = {};
    this.padPrev = {};
    this.tilt = { on: false, angle: 0, flip: 1, zero: 0 };
    this.learn = null;
    this.lastDevice = 'keyboard';
    this.wheelSeen = false;
    addEventListener('keydown', e => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (!this.keys.has(e.code)) this.edgeKey(e.code);
      this.keys.add(e.code); this.lastDevice = 'keyboard';
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.emit('any');
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }
  on(name, fn) { (this.handlers[name] ||= []).push(fn); }
  emit(name, ...a) { for (const f of this.handlers[name] || []) f(...a); }
  edgeKey(code) {
    const map = { KeyC: 'camera', KeyR: 'reset', Escape: 'pause', KeyP: 'pause', KeyE: 'shiftUp', KeyQ: 'shiftDown', Enter: 'confirm', KeyM: 'mute' };
    if (map[code]) this.emit(map[code]);
  }

  // --- Touch ----------------------------------------------------------------
  bindTouch(el) {
    const pointers = new Map();
    const refresh = () => {
      const held = new Set();
      for (const [, p] of pointers) {
        const t = document.elementFromPoint(p.x, p.y), b = t && t.closest && t.closest('[data-k]');
        if (b && el.contains(b)) held.add(b.dataset.k);
      }
      for (const b of el.querySelectorAll('[data-k]')) { const k = b.dataset.k; this.touch[k] = held.has(k); b.classList.toggle('on', held.has(k)); }
    };
    el.addEventListener('pointerdown', e => {
      const tap = e.target.closest('[data-tap]');
      if (tap) { this.emit(tap.dataset.tap); this.emit('any'); return; }
      e.preventDefault(); this.lastDevice = 'touch'; this.emit('any');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); refresh();
    });
    el.addEventListener('pointermove', e => { if (!pointers.has(e.pointerId)) return; e.preventDefault(); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); refresh(); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, e => { if (pointers.delete(e.pointerId)) refresh(); });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('touchstart', e => { if (!e.target.closest('[data-tap]')) e.preventDefault(); }, { passive: false });
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  }

  // --- Tilt -------------------------------------------------------------------
  async enableTilt() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
        const r = await DeviceMotionEvent.requestPermission(); if (r !== 'granted') return false;
      }
    } catch (e) { return false; }
    if (!this.tiltBound) {
      this.tiltBound = true;
      addEventListener('devicemotion', e => {
        const g = e.accelerationIncludingGravity; if (!g || g.x == null) return;
        const a = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * Math.PI / 180;
        const sx = g.x * Math.cos(a) - g.y * Math.sin(a), sy = g.x * Math.sin(a) + g.y * Math.cos(a);
        // Browsers disagree on the sign; whichever way is "up" while held level wins.
        if (!this.tilt.calibrated) { this.tilt.flip = sy < 0 ? -1 : 1; this.tilt.calibrated = true; }
        this.tilt.angle = Math.atan2(-sx * this.tilt.flip, sy * this.tilt.flip);
      });
    }
    this.tilt.on = true; this.tilt.calibrated = false;
    return true;
  }

  // --- Gamepads and wheels ----------------------------------------------------
  pads() { return navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []; }
  padEdge(p, b, name) {
    const k = p.index + ':' + b, now = !!(p.buttons[b] && p.buttons[b].pressed);
    if (now && !this.padPrev[k]) this.emit(name);
    this.padPrev[k] = now;
  }
  startLearn(kind, done) {
    const snap = this.pads().map(p => ({ id: p.id, axes: [...p.axes], buttons: p.buttons.map(b => b.pressed) }));
    this.learn = { kind, snap, done, t0: performance.now() };
  }
  pollLearn() {
    const L = this.learn; if (!L) return;
    for (const p of this.pads()) {
      const s = L.snap.find(q => q.id === p.id); if (!s) continue;
      for (let i = 0; i < p.axes.length; i++) {
        const d = p.axes[i] - s.axes[i];
        if (Math.abs(d) > 0.5) {
          const rest = s.axes[i];
          const full = L.kind === 'steer' ? Math.sign(d) : (rest > 0.5 ? -1 : rest < -0.5 ? 1 : Math.sign(d));
          return this.finishLearn({ type: 'axis', index: i, rest, full, id: p.id });
        }
      }
      for (let i = 0; i < p.buttons.length; i++) if (p.buttons[i].pressed && !s.buttons[i]) return this.finishLearn({ type: 'button', index: i, id: p.id });
    }
  }
  finishLearn(m) {
    const L = this.learn; this.learn = null;
    settings.wheel = { ...(settings.wheel || {}), [L.kind]: m }; save();
    L.done(m);
  }
  axisVal(p, m) {
    if (!m) return 0;
    if (m.type === 'button') return p.buttons[m.index] ? p.buttons[m.index].value || (p.buttons[m.index].pressed ? 1 : 0) : 0;
    const v = p.axes[m.index]; if (v == null) return 0;
    return clamp((v - m.rest) / (m.full - m.rest || 1), 0, 1);
  }

  read(dt) {
    const k = c => this.keys.has(c);
    let steer = (k('KeyD') || k('ArrowRight') || this.touch.right ? 1 : 0) - (k('KeyA') || k('ArrowLeft') || this.touch.left ? 1 : 0);
    let gas = k('KeyW') || k('ArrowUp') || this.touch.gas ? 1 : 0;
    let brake = k('KeyS') || k('ArrowDown') || this.touch.brake ? 1 : 0;
    let handbrake = k('Space') || this.touch.hand;
    let nitro = k('ShiftLeft') || k('ShiftRight') || k('KeyN') || this.touch.nitro;
    let analog = false;
    if (this.tilt.on && settings.touchSteer === 'tilt' && this.lastDevice === 'touch') {
      steer = clamp((this.tilt.angle - this.tilt.zero) / 0.45, -1, 1); analog = true;
    }
    this.pollLearn();
    const W = settings.wheel || {};
    for (const p of this.pads()) {
      const isWheel = WHEEL_RE.test(p.id) || (W.gas && W.gas.id === p.id);
      if (isWheel && !this.wheelSeen) { this.wheelSeen = true; this.emit('wheel', p.id); }
      if (this.learn) continue;
      let used = false;
      if (isWheel) {
        const sm = W.steer && W.steer.id === p.id ? W.steer : { index: 0, full: 1 };
        const sv = p.axes[sm.index] || 0;
        if (Math.abs(sv) > 0.01) { steer = clamp(sv * (sm.full || 1), -1, 1); analog = true; used = true; }
        if (W.gas && W.gas.id === p.id) { const g = this.axisVal(p, W.gas); if (g > 0.03) { gas = Math.max(gas, g); used = true; } }
        if (W.brake && W.brake.id === p.id) { const b = this.axisVal(p, W.brake); if (b > 0.03) { brake = Math.max(brake, b); used = true; } }
        if (W.shiftUp && W.shiftUp.id === p.id) this.padEdge(p, W.shiftUp.index, 'shiftUp'); else this.padEdge(p, 5, 'shiftUp');
        if (W.shiftDown && W.shiftDown.id === p.id) this.padEdge(p, W.shiftDown.index, 'shiftDown'); else this.padEdge(p, 4, 'shiftDown');
        if (W.hand && W.hand.id === p.id && p.buttons[W.hand.index] && p.buttons[W.hand.index].pressed) handbrake = true;
        if (W.nitro && W.nitro.id === p.id && p.buttons[W.nitro.index] && p.buttons[W.nitro.index].pressed) nitro = true;
        this.padEdge(p, 9, 'pause'); this.padEdge(p, 8, 'camera');
      } else {
        const ax = p.axes[0] || 0;
        if (Math.abs(ax) > 0.12) { steer = clamp((ax - Math.sign(ax) * 0.12) / 0.88, -1, 1); analog = true; used = true; }
        const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
        if (rt > 0.04) { gas = Math.max(gas, rt); used = true; }
        if (lt > 0.04) { brake = Math.max(brake, lt); used = true; }
        if (p.buttons[0] && p.buttons[0].pressed) { handbrake = true; used = true; }
        if (p.buttons[2] && p.buttons[2].pressed) { nitro = true; used = true; }
        if (p.buttons[14] && p.buttons[14].pressed) steer = -1;
        if (p.buttons[15] && p.buttons[15].pressed) steer = 1;
        this.padEdge(p, 3, 'camera'); this.padEdge(p, 5, 'shiftUp'); this.padEdge(p, 4, 'shiftDown');
        this.padEdge(p, 9, 'pause'); this.padEdge(p, 8, 'reset'); this.padEdge(p, 1, 'back');
        this.padEdge(p, 12, 'navUp'); this.padEdge(p, 13, 'navDown');
      }
      if (used) { this.lastDevice = isWheel ? 'wheel' : 'pad'; this.emit('any'); }
    }
    return { steer, gas, brake, handbrake, nitro, analog, sens: settings.sens };
  }
}
