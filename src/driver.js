// Turns the raw controls into something that drives like a real car. A keyboard or a touch button is either on or off, but
// a real steering wheel and pedals are not: the wheel turns progressively and straightens itself when you let go, the
// throttle comes in gradually (so you don't spin the wheels off the line) and the brake builds up (so you don't lock them).
// A gamepad stick gets a light smoothing, a tilting tablet a little more, and a real steering wheel is left alone.
import { clamp } from './util.js';

export class Driver {
  constructor() { this.steer = 0; this.gas = 0; this.brake = 0; this.tilt = 0; this.pad = 0; }
  reset() { this.steer = this.gas = this.brake = this.tilt = this.pad = 0; }
  // raw: what Input.read gives (with .digital and .device); speed in m/s.
  shape(raw, dt, speed) {
    const out = { ...raw, analog: true, sens: 1 };
    const fast = clamp(speed / 35, 0, 1);
    if (raw.device === 'wheel') { out.sens = raw.sens; return out; }
    // Steering.
    if (raw.digital.steer) {
      const tgt = raw.steer, towards = Math.abs(tgt) > Math.abs(this.steer) && Math.sign(tgt) === (Math.sign(this.steer) || Math.sign(tgt));
      const up = 3.6 - 1.9 * fast, back = 7.5 - 3.5 * fast;                  // turning in (slower when fast), and the wheel straightening itself
      const crossing = tgt !== 0 && this.steer !== 0 && Math.sign(tgt) !== Math.sign(this.steer);
      const rate = crossing ? back + 2 : towards ? up : back;
      this.steer += clamp(tgt - this.steer, -rate * dt, rate * dt);
    } else if (raw.device === 'touch') {                                       // tilting the tablet
      this.steer += (raw.steer - this.steer) * (1 - Math.exp(-dt / 0.08));
    } else {                                                                   // a gamepad stick
      this.steer += (raw.steer - this.steer) * (1 - Math.exp(-dt / 0.035));
      out.sens = raw.sens;
    }
    out.steer = clamp(this.steer, -1, 1);
    if (!raw.digital.steer && raw.device !== 'touch') out.sens = raw.sens;
    // Pedals.
    if (raw.digital.gas) {
      if (raw.gas > this.gas) this.gas = Math.min(raw.gas, Math.max(this.gas, 0.24) + dt * 2.2); else this.gas = Math.max(0, this.gas - dt * 5);
      out.gas = this.gas;
    } else { this.gas = raw.gas; }
    if (raw.digital.brake) {
      if (raw.brake > this.brake) this.brake = Math.min(raw.brake, Math.max(this.brake, 0.32) + dt * 2.8); else this.brake = Math.max(0, this.brake - dt * 6);
      out.brake = this.brake;
    } else { this.brake = raw.brake; }
    return out;
  }
}
