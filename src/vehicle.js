// Car physics: a two-axle ("bicycle") model with load transfer, a tyre curve
// with a friction circle, all-wheel drive, a six-speed gearbox, aero drag and
// downforce, and driver aids (ABS, traction control and stability control)
// that you can switch off. Runs at a fixed 120 steps a second.
//
// Body frame: vx forward, vy to the right, w = yaw rate (positive turns right).
// World: heading h, forward = (sin h, cos h) in (x, z), right = (-cos h, sin h).
import { clamp, lerp } from './util.js';

export const SPEC = {
  mass: 1650, a: 1.546, b: 1.119, cgH: 0.46,      // cg to front / rear axle, cg height
  wheelR: 0.345, mu: 1.18, Bf: 10, Cf: 1.5, Br: 12, Cr: 1.3,
  gears: [3.09, 2.19, 1.6, 1.25, 1.03, 0.86], rev: 2.9, final: 3.42, eff: 0.9,
  idle: 950, redline: 8000, limiter: 8250, Tmax: 690, peakRpm: 5500,
  drag: 0.36, roll: 14, down: 0.85, brake: 1.45, steerMax: 0.6, frontDrive: 0.3,
  nitroForce: 8000,
};

const G = 9.81;

export class Vehicle {
  constructor(spec = SPEC) {
    this.s = spec;
    this.L = spec.a + spec.b;
    this.I = spec.mass * (4.61 * 4.61 + 2.06 * 2.06) / 12 * 1.05;
    this.abs = true; this.tcs = true; this.esp = true; this.auto = true; this.steerAssist = true;
    this.reset(0, 0, 0);
  }
  reset(x, z, h) {
    Object.assign(this, {
      x, z, h, px: x, pz: z, ph: h, y: 0, vx: 0, vy: 0, w: 0, steer: 0,
      gear: 1, rpm: this.s.idle, shiftT: 0, revT: 0, ax: 0, ay: 0, nitro: 1, nitroOn: false,
      absOn: false, tcsOn: false, espOn: false, slipF: 0, slipR: 0, spinR: 0, lockF: 0, onGrass: false,
      throttle: 0, brakeIn: 0, wheelAng: 0, lastShift: 0,
    });
  }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get fwd() { return [Math.sin(this.h), Math.cos(this.h)]; }
  get right() { return [-Math.cos(this.h), Math.sin(this.h)]; }
  // World-space velocity.
  worldVel() { const f = this.fwd, r = this.right; return [f[0] * this.vx + r[0] * this.vy, f[1] * this.vx + r[1] * this.vy]; }
  setWorldVel(X, Z) { const f = this.fwd, r = this.right; this.vx = X * f[0] + Z * f[1]; this.vy = X * r[0] + Z * r[1]; }

  torqueAt(rpm) {
    const x = rpm / this.s.peakRpm;
    return this.s.Tmax * clamp(1 - 0.35 * (x - 1) * (x - 1) * (x < 1 ? 1.5 : 1.25), 0.35, 1);
  }
  ratio(g) { return g > 0 ? this.s.gears[g - 1] : this.s.rev; }

  shift(d) {
    if (this.shiftT > 0) return false;
    const g = this.gear + d;
    if (g < -1 || g > this.s.gears.length || g === 0) {
      if (g === 0 && this.speed < 2) { this.gear = d < 0 ? -1 : 1; return true; }
      return false;
    }
    this.gear = g; this.shiftT = 0.16; this.lastShift = performance.now(); return true;
  }

  step(dt, inp, mu = 1, extraDrag = 0) {
    const s = this.s, m = s.mass, L = this.L;
    let { vx, vy, w } = this;
    const spd = Math.hypot(vx, vy);

    // --- Pedals, reverse -----------------------------------------------------
    let thr = inp.gas, brk = inp.brake;
    if (this.gear === -1) { [thr, brk] = [inp.brake, inp.gas]; }
    if (this.auto) {
      if (this.gear >= 1 && inp.brake > 0.3 && inp.gas < 0.1 && vx < 0.6) { this.revT += dt; if (this.revT > 0.3) { this.gear = -1; this.revT = 0; } }
      else if (this.gear === -1 && inp.gas > 0.1 && vx > -0.8) { this.gear = 1; }
      else this.revT = 0;
    }

    // --- Steering --------------------------------------------------------------
    const beta = Math.atan2(vy, Math.abs(vx) + 0.5);
    let target;
    if (inp.analog) target = inp.steer * s.steerMax * inp.sens / (1 + spd / 70);
    else {
      target = inp.steer * s.steerMax / (1 + spd / 12);
      // Help keyboard and touch drivers catch a slide.
      if (this.steerAssist && spd > 6 && vx > 0) target += clamp(beta * 0.75, -0.3, 0.3) * (inp.steer === 0 ? 1 : 0.45);
    }
    target = clamp(target, -s.steerMax, s.steerMax);
    const rate = inp.analog ? 14 : (Math.sign(target) !== Math.sign(this.steer) || Math.abs(target) < Math.abs(this.steer) ? 5.5 : 3.0);
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    const d = this.steer;

    // --- Engine and gearbox -----------------------------------------------------
    const wheelRpm = Math.abs(vx) / s.wheelR * 60 / (2 * Math.PI);
    const gr = this.ratio(this.gear) * s.final;
    let rpmW = wheelRpm * gr;
    let rpm = rpmW;
    if (this.gear === 1 || this.gear === -1) rpm = Math.max(rpm, s.idle + thr * 3600 * clamp(1 - wheelRpm * gr / 4500, 0, 1));
    rpm = Math.max(rpm, s.idle);
    if (this.shiftT > 0) { this.shiftT -= dt; }
    if (this.auto && this.shiftT <= 0 && this.gear >= 1) {
      const n = s.gears.length;
      if (rpmW > 7700 && this.gear < n) this.shift(1);
      else if (this.gear > 1) {
        const lower = wheelRpm * s.gears[this.gear - 2] * s.final;
        if (lower < 7100 && ((thr > 0.6 && rpmW < 4300) || rpmW < 2600 || (brk > 0.2 && rpmW < 3600))) this.shift(-1);
      }
    }
    this.rpm += (Math.min(rpm, s.limiter + 100) - this.rpm) * Math.min(1, dt * 18);
    let T = this.torqueAt(this.rpm) * thr;
    if (this.rpm >= s.limiter) T = 0;
    if (this.shiftT > 0) T = 0;
    let Fd = T * gr * s.eff / s.wheelR * (this.gear === -1 ? -1 : 1);
    if (this.gear === -1 && vx < -11) Fd = 0;
    // Engine braking off throttle.
    if (thr < 0.05 && this.shiftT <= 0) Fd -= Math.sign(vx) * 0.16 * this.torqueAt(this.rpm) * gr / s.wheelR * clamp(this.rpm / s.redline, 0, 1) * clamp(Math.abs(vx), 0, 1);
    // Nitro.
    this.nitroOn = false;
    if (inp.nitro && this.nitro > 0.01 && this.gear >= 1 && thr > 0.1) { Fd += s.nitroForce; this.nitro = Math.max(0, this.nitro - dt * 0.2); this.nitroOn = true; }
    else this.nitro = Math.min(1, this.nitro + dt * 0.018 * (spd > 20 ? 1 : 0.4));

    // --- Loads ---------------------------------------------------------------
    const down = s.down * spd * spd;
    const Nf = Math.max(0, m * G * s.b / L - m * this.ax * s.cgH / L + down * 0.45);
    const Nr = Math.max(0, m * G * s.a / L + m * this.ax * s.cgH / L + down * 0.55);
    const capF = s.mu * mu * Nf, capR = s.mu * mu * Nr;

    // --- Longitudinal forces per axle -------------------------------------------
    const sgn = vx >= 0 ? 1 : -1;
    let FdF = Fd * s.frontDrive, FdR = Fd * (1 - s.frontDrive);
    this.tcsOn = false;
    let spinR = 0, spinF = 0;
    if (this.tcs) {
      const k = Math.min(1, capR * 0.92 / Math.max(1, Math.abs(FdR)), capF * 0.92 / Math.max(1, Math.abs(FdF)));
      if (k < 1 && thr > 0.1) { this.tcsOn = true; FdF *= k; FdR *= k; }
    } else {
      if (Math.abs(FdR) > capR) { spinR = clamp((Math.abs(FdR) - capR) / capR, 0, 1); FdR = Math.sign(FdR) * capR * 0.92; }
      if (Math.abs(FdF) > capF) { spinF = clamp((Math.abs(FdF) - capF) / capF, 0, 1); FdF = Math.sign(FdF) * capF * 0.92; }
    }
    const Fb = brk * s.brake * m * G;
    let FbF = Fb * 0.62, FbR = Fb * 0.38;
    this.absOn = false;
    let lockF = 0, lockR = 0;
    if (this.abs) {
      if (FbF > capF * 0.95 && spd > 2) { FbF = capF * 0.95; this.absOn = true; }
      if (FbR > capR * 0.95 && spd > 2) { FbR = capR * 0.95; this.absOn = true; }
    } else if (spd > 2) {
      if (FbF > capF) { lockF = 1; FbF = capF * 0.85; }
      if (FbR > capR) { lockR = 1; FbR = capR * 0.85; }
    }
    if (inp.handbrake && spd > 0.5) { lockR = 1; FbR = Math.max(FbR, capR * 0.85); FdR *= 0.2; }
    if (spd < 0.5) { FbF = Math.min(FbF, Math.abs(vx) * m * 30); FbR = Math.min(FbR, Math.abs(vx) * m * 30); }
    const FxF = FdF - sgn * FbF, FxR = FdR - sgn * FbR;

    // --- Lateral tyre forces --------------------------------------------------
    const cs = Math.cos(d), sn = Math.sin(d);
    const vfx = vx, vfy = vy + w * s.a;
    const lLong = cs * vfx + sn * vfy, lLat = -sn * vfx + cs * vfy;
    const vmin = 1.0;
    const aF = Math.atan2(lLat, Math.max(Math.abs(lLong), vmin));
    const aR = Math.atan2(vy - w * s.b, Math.max(Math.abs(vx), vmin));
    const tyreF = a => Math.sin(s.Cf * Math.atan(s.Bf * a)), tyreR = a => Math.sin(s.Cr * Math.atan(s.Br * a));
    // Friction circle: what the tyre spends on drive or braking it can't use for cornering.
    const circ = (Fx, cap) => Math.sqrt(Math.max(0, 1 - (Fx / Math.max(1, cap)) ** 2));
    let latF = circ(FxF, capF), latR = circ(FxR, capR);
    if (lockF) latF *= 0.3; if (lockR) latR *= 0.32; if (spinR) latR *= 1 - 0.65 * spinR; if (spinF) latF *= 1 - 0.5 * spinF;
    const FyF = -capF * tyreF(aF) * latF, FyR = -capR * tyreR(aR) * latR;
    this.slipF = Math.abs(aF); this.slipR = Math.abs(aR); this.spinR = Math.max(spinR, lockR * 0.7); this.lockF = lockF;

    // --- Sum forces in the body frame --------------------------------------------
    let Fx = cs * FxF - sn * FyF + FxR;
    let Fy = sn * FxF + cs * FyF + FyR;
    Fx -= s.drag * vx * spd + (s.roll + extraDrag) * vx;
    Fy -= (s.roll + extraDrag) * vy * 0.5;
    let Tq = s.a * (sn * FxF + cs * FyF) - s.b * FyR;

    // Slides straighten themselves out a little, like a weather vane, so a
    // drift can always be caught. Much more of this with the steering assist.
    if (spd > 3 && vx > 0) Tq += beta * this.I * (this.steerAssist && !inp.analog ? 2.2 : 0.9) * Math.min(1, spd / 15) * (inp.handbrake ? 0.2 : 1);
    // Stability control: holds back yaw beyond what the tyres can follow, and
    // pulls the car straight when it starts to slide.
    this.espOn = false;
    if (this.esp && spd > 6 && vx > 0) {
      const lim = 0.9 * s.mu * mu * G / Math.max(vx, 1);
      const wRef = clamp(vx * Math.tan(d) / L, -lim, lim);
      const err = w - wRef, b2 = Math.abs(beta);
      let corr = 0;
      if (Math.sign(err) === Math.sign(w) && Math.abs(err) > 0.06) corr -= (err - Math.sign(err) * 0.06) * this.I * 9;
      if (b2 > 0.07) corr += (beta - Math.sign(beta) * 0.07) * this.I * 12;
      if (corr !== 0 && !inp.handbrake) {
        Tq += corr; this.espOn = true;
        if (b2 > 0.12) Fx -= Math.max(0, Fd) * 0.6 * clamp((b2 - 0.12) * 4, 0, 1);
      }
    }

    const ax = Fx / m, ay = Fy / m;
    vx += (ax + w * vy) * dt;
    vy += (ay - w * vx) * dt;
    w += Tq / this.I * dt;

    // At walking pace blend into a simple rolling model so the car doesn't jitter.
    const k = clamp((spd - 1.5) / 4, 0, 1);
    const wk = vx * Math.tan(d) / L;
    w = w * k + wk * (1 - k);
    vy *= k + (1 - k) * 0.85;
    if (thr < 0.05 && Math.abs(vx) < 0.25 && (brk > 0.05 || inp.handbrake || Math.abs(vx) < 0.05)) vx = 0;

    this.ax = lerp(this.ax, ax, Math.min(1, dt * 10)); this.ay = lerp(this.ay, ay - 0, Math.min(1, dt * 10));
    this.vx = vx; this.vy = vy; this.w = w;
    this.throttle = thr; this.brakeIn = brk;
    // Move.
    this.px = this.x; this.pz = this.z; this.ph = this.h;
    const [X, Z] = this.worldVel();
    this.x += X * dt; this.z += Z * dt; this.h -= w * dt;
    this.wheelAng += (vx / s.wheelR) * dt * (1 + this.spinR * 1.5);
  }
}
