// Car physics: a four-wheel model.
//
// - Each wheel has its own suspension (spring, damper, bump stop, anti-roll
//   bars), so the body dives under braking, squats under power, rolls in
//   corners and bounces over kerbs, and the tyre loads come from that.
// - Each wheel spins on its own, driven through an all-wheel-drive
//   drivetrain (30/70 front/rear, limited-slip differentials) and braked by
//   its own brake, so wheelspin and lock-ups happen for real.
// - Tyres use a combined-slip curve (slip ratio and slip angle sharing one
//   friction ellipse) on each wheel's own load and surface.
// - Ackermann steering, aero drag and downforce, a six-speed gearbox, and
//   driver aids (ABS, traction control and stability control) you can turn off.
//
// Body frame: vx forward, vy to the right, w = yaw rate (positive turns right).
// World: heading h, forward = (sin h, cos h) in (x, z), right = (-cos h, sin h).
// Runs at a fixed 240 steps a second.
import { clamp, lerp } from './util.js';

export const SPEC = {
  mass: 1650, cgH: 0.46, rollH: 0.32,
  // Wheels: [forward, right] of the centre of mass; front then rear, left then right.
  wheelPos: [[1.546, -0.83], [1.546, 0.83], [-1.119, -0.86], [-1.119, 0.86]],
  wheelR: 0.345, wheelI: 1.3, engineI: 0.22,
  spring: [58000, 58000, 66000, 66000], damper: [4200, 4200, 4800, 4800], arb: [32000, 22000], travel: 0.11,
  mu: 1.2, kPeak: 0.1, aPeak: [0.13, 0.115], C: [1.55, 1.38],
  gears: [3.09, 2.19, 1.6, 1.25, 1.03, 0.86], rev: 2.9, final: 3.42, eff: 0.9,
  idle: 950, redline: 8000, limiter: 8250, Tmax: 690, peakRpm: 5500,
  drag: 0.36, roll: 10, down: 0.9, brakeT: [2200, 2200, 1300, 1300], handT: 3200, steerMax: 0.6, frontDrive: 0.3,
  nitroForce: 8000,
};

const G = 9.81;
const magic = (s, C) => { const B = Math.tan(Math.PI / (2 * C)); return Math.sin(C * Math.atan(B * s)); };

export class Vehicle {
  constructor(spec = SPEC) {
    this.s = spec;
    this.L = spec.wheelPos[0][0] - spec.wheelPos[2][0];
    this.I = spec.mass * (4.61 * 4.61 + 2.06 * 2.06) / 12 * 1.05;   // yaw
    this.Ip = spec.mass * (4.61 * 4.61 + 1.1 * 1.1) / 12 * 0.9;     // pitch
    this.Ir = spec.mass * (2.06 * 2.06 + 1.1 * 1.1) / 12 * 0.9;     // roll
    // Static load and spring compression at each wheel.
    const a = spec.wheelPos[0][0], b = -spec.wheelPos[2][0];
    this.Fstatic = [0, 1, 2, 3].map(i => spec.mass * G * (i < 2 ? b : a) / this.L / 2);
    this.cStatic = this.Fstatic.map((F, i) => F / spec.spring[i]);
    this.abs = true; this.tcs = true; this.esp = true; this.auto = true; this.steerAssist = true;
    this.reset(0, 0, 0);
  }
  reset(x, z, h) {
    Object.assign(this, {
      x, z, h, px: x, pz: z, ph: h, vx: 0, vy: 0, w: 0, steer: 0,
      gear: 1, rpm: this.s.idle, shiftT: 0, revT: 0, ax: 0, ay: 0, nitro: 1, nitroOn: false,
      absOn: false, tcsOn: false, espOn: false, slipF: 0, slipR: 0, spinR: 0, lockF: 0, onGrass: false,
      throttle: 0, brakeIn: 0, wheelAng: 0, lastShift: 0, tcsCut: 1,
      // Body heave (m), pitch (nose down +) and roll (right side down +), with rates.
      hv: 0, hvV: 0, pitch: 0, pitchV: 0, roll: 0, rollV: 0, baseY: null, airborne: false,
    });
    this.wheels = [0, 1, 2, 3].map(i => ({ w: 0, ang: 0, comp: this.cStatic[i], compV: 0, N: this.Fstatic[i], ground: 0, grass: false, kind: 'asphalt', surfMu: 1, surfDrag: 0, slipK: 0, slipA: 0, contact: true, absT: 0 }));
  }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get fwd() { return [Math.sin(this.h), Math.cos(this.h)]; }
  get right() { return [-Math.cos(this.h), Math.sin(this.h)]; }
  worldVel() { const f = this.fwd, r = this.right; return [f[0] * this.vx + r[0] * this.vy, f[1] * this.vx + r[1] * this.vy]; }
  setWorldVel(X, Z) { const f = this.fwd, r = this.right; this.vx = X * f[0] + Z * f[1]; this.vy = X * r[0] + Z * r[1]; }
  // Height of the body (for drawing): the ground under the car plus heave.
  get bodyY() { return (this.baseY ?? 0) + this.hv; }

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

  // ground(x, z) -> { y, grass } for the surface under a point.
  step(dt, inp, ground) {
    const s = this.s, m = s.mass, L = this.L;
    let { vx, vy, w } = this;
    const spd = Math.hypot(vx, vy);
    const f = this.fwd, rt = this.right;

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
      if (this.steerAssist && spd > 6 && vx > 0) target += clamp(beta * 0.75, -0.3, 0.3) * (inp.steer === 0 ? 1 : 0.45);
    }
    target = clamp(target, -s.steerMax, s.steerMax);
    const rate = inp.analog ? 14 : (Math.sign(target) !== Math.sign(this.steer) || Math.abs(target) < Math.abs(this.steer) ? 5.5 : 3.0);
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    const d = this.steer, td = Math.tan(d);

    // --- Ground under each wheel, and the suspension -----------------------------
    const W = this.wheels;
    if (this.baseY == null) this.baseY = ground(this.x, this.z).y;
    let gSum = 0;
    for (let i = 0; i < 4; i++) {
      const [lz, lx] = s.wheelPos[i];
      const wx = this.x + f[0] * lz + rt[0] * lx, wz = this.z + f[1] * lz + rt[1] * lx;
      const g = ground(wx, wz);
      W[i].ground = g.y; W[i].grass = g.grass; W[i].kind = g.kind || (g.grass ? 'grass' : 'asphalt'); W[i].surfMu = g.mu ?? (g.grass ? 0.72 : 1); W[i].surfDrag = g.drag ?? (g.grass ? 95 : 0); gSum += g.y;
    }
    // The body's reference height follows the average ground slowly; the
    // springs take care of quick bumps such as kerbs.
    this.baseY = lerp(this.baseY, gSum / 4, Math.min(1, dt * 3));
    const F = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const [lz, lx] = s.wheelPos[i], wi = W[i];
      const attach = this.hv - this.pitch * lz - this.roll * lx;            // body point height vs base
      const comp = (wi.ground - this.baseY) - attach + this.cStatic[i];
      wi.compV = (comp - wi.comp) / dt; wi.comp = comp;
      let Fi = s.spring[i] * comp + s.damper[i] * wi.compV;
      if (comp > this.cStatic[i] + s.travel) Fi += (comp - this.cStatic[i] - s.travel) * s.spring[i] * 12; // bump stop
      wi.contact = comp > 0;
      F[i] = comp > 0 ? Math.max(0, Fi) : 0;
    }
    // Anti-roll bars push against a difference in compression across an axle.
    for (const [l, r, k] of [[0, 1, s.arb[0]], [2, 3, s.arb[1]]]) {
      if (!W[l].contact || !W[r].contact) continue;
      const dF = (W[l].comp - W[r].comp) * k;
      F[l] = Math.max(0, F[l] - dF * 0.5); F[r] = Math.max(0, F[r] + dF * 0.5);
    }
    this.airborne = !W.some(x => x.contact);

    // --- Engine and drivetrain --------------------------------------------------
    const gr = this.ratio(this.gear) * s.final;
    const drivenW = (W[0].w + W[1].w) * 0.5 * s.frontDrive + (W[2].w + W[3].w) * 0.5 * (1 - s.frontDrive);
    const wheelRpm = Math.abs(drivenW) * 60 / (2 * Math.PI);
    const rpmW = wheelRpm * gr;
    let rpm = rpmW;
    if (this.gear === 1 || this.gear === -1) rpm = Math.max(rpm, s.idle + thr * 3600 * clamp(1 - rpmW / 4500, 0, 1));
    rpm = Math.max(rpm, s.idle);
    if (this.shiftT > 0) this.shiftT -= dt;
    if (this.auto && this.shiftT <= 0 && this.gear >= 1) {
      const n = s.gears.length;
      if (rpmW > 7700 && this.gear < n) this.shift(1);
      else if (this.gear > 1) {
        const lower = wheelRpm * s.gears[this.gear - 2] * s.final;
        if (lower < 7100 && ((thr > 0.6 && rpmW < 4300) || rpmW < 2600 || (brk > 0.2 && rpmW < 3600))) this.shift(-1);
      }
    }
    this.rpm += (Math.min(rpm, s.limiter + 100) - this.rpm) * Math.min(1, dt * 18);
    let Te = this.torqueAt(this.rpm) * thr * this.tcsCut;
    if (this.rpm >= s.limiter || this.shiftT > 0) Te = 0;
    let Tdrive = Te * gr * s.eff * (this.gear === -1 ? -1 : 1);
    if (this.gear === -1 && vx < -11) Tdrive = 0;
    // Engine braking off throttle.
    if (thr < 0.05 && this.shiftT <= 0) Tdrive -= Math.sign(drivenW) * 0.16 * this.torqueAt(this.rpm) * gr * clamp(this.rpm / s.redline, 0, 1) * clamp(Math.abs(vx), 0, 1);
    this.nitroOn = false;
    let nitroF = 0;
    if (inp.nitro && this.nitro > 0.01 && this.gear >= 1 && thr > 0.1) { nitroF = s.nitroForce; this.nitro = Math.max(0, this.nitro - dt * 0.2); this.nitroOn = true; }
    else this.nitro = Math.min(1, this.nitro + dt * 0.018 * (spd > 20 ? 1 : 0.4));
    // Engine inertia shared across the driven wheels (it's what makes wheelspin
    // in first gear different from wheelspin in fifth).
    const Ieng = this.shiftT > 0 ? 0 : s.engineI * gr * gr / 4;
    // Torque to each wheel: 30/70 front/rear, then split across each axle with
    // a limited-slip differential.
    const Tw = [0, 0, 0, 0];
    for (const [l, r, share] of [[0, 1, s.frontDrive], [2, 3, 1 - s.frontDrive]]) {
      const T = Tdrive * share, lock = clamp((W[l].w - W[r].w) * 60, -Math.abs(T) * 0.6 - 300, Math.abs(T) * 0.6 + 300);
      Tw[l] = T / 2 - lock; Tw[r] = T / 2 + lock;
    }

    // --- Tyres -------------------------------------------------------------------
    let Fx = 0, Fy = 0, Tq = 0;
    this.absOn = false; let tcsSlip = 0, slipF = 0, slipR = 0, spin = 0, lockF = 0;
    const R = s.wheelR;
    for (let i = 0; i < 4; i++) {
      const [lz, lx] = s.wheelPos[i], wi = W[i], front = i < 2;
      const N = F[i];
      wi.N = N;
      const mu = s.mu * wi.surfMu;
      // Ackermann: the inside front wheel turns more.
      const di = front ? Math.atan(L * td / (L - lx * td)) : 0;
      const cd = Math.cos(di), sd = Math.sin(di);
      const vf = vx - w * lx, vr = vy + w * lz;
      const vl = cd * vf + sd * vr, vlat = -sd * vf + cd * vr;
      const den = Math.max(Math.abs(vl), 3);
      const ap = s.aPeak[front ? 0 : 1], C = s.C[front ? 0 : 1];
      const alpha = Math.atan2(vlat, den);
      // Brakes (and ABS), handbrake on the rears.
      let Tb = brk * s.brakeT[i];
      if (inp.handbrake && !front) Tb += s.handT;
      if (this.abs && !(inp.handbrake && !front) && spd > 2 && Tb > 0) {
        const k0 = (wi.w * R - vl) / den;
        if (k0 < -s.kPeak * 1.15) { wi.absT = 0.06; }
        if (wi.absT > 0) { wi.absT -= dt; Tb *= 0.35; this.absOn = true; }
      }
      // Implicit wheel-spin update: tyre force is stiff, so solve with its slope.
      const k = (wi.w * R - vl) / den;
      const sk = k / s.kPeak, sa = Math.tan(alpha) / Math.tan(ap);
      const sl = Math.hypot(sk, sa) || 1e-6;
      const Fmax = mu * N, Fc = Fmax * magic(sl, C);
      const fx0 = Fc * sk / sl;
      // d(Fx)/d(wheel speed): linear-region slope, smaller once sliding.
      const slope = Fmax * (sl < 1 ? 1.6 : 0.3) / s.kPeak * R / den;
      const Ieff = s.wheelI + (Math.abs(Tw[i]) > 0 || thr > 0 ? Ieng : 0);
      const Tnet = Tw[i] - fx0 * R;
      let wNew = wi.w + dt * Tnet / (Ieff + dt * slope * R);
      // Brake torque opposes rotation and can stop the wheel dead.
      const dB = dt * Tb / (Ieff + dt * slope * R);
      if (Math.abs(wNew) <= dB) wNew = 0; else wNew -= Math.sign(wNew) * dB;
      if (!wi.contact || N <= 0) wNew = wi.w + dt * (Tw[i] - Math.sign(wi.w) * Tb) / Ieff;
      wi.w = wNew;
      // Forces with the updated wheel speed.
      const k2 = (wi.w * R - vl) / den, sk2 = k2 / s.kPeak;
      const sl2 = Math.hypot(sk2, sa) || 1e-6;
      const Fc2 = Fmax * magic(sl2, C);
      let Fl = N > 0 ? Fc2 * sk2 / sl2 : 0, Flat = N > 0 ? -Fc2 * sa / sl2 : 0;
      wi.slipK = k2; wi.slipA = alpha;
      wi.ang += wi.w * dt;
      // Body-frame forces and yaw moment.
      const ff = cd * Fl - sd * Flat, fr = sd * Fl + cd * Flat;
      Fx += ff; Fy += fr; Tq += lz * fr - lx * ff;
      if (front) { slipF = Math.max(slipF, Math.abs(alpha)); if (k2 < -0.5) lockF = 1; }
      else { slipR = Math.max(slipR, Math.abs(alpha)); spin = Math.max(spin, clamp((Math.abs(k2) - 0.15) * 2, 0, 1)); }
      if (Tw[i] * Math.sign(vl || 1) > 0) tcsSlip = Math.max(tcsSlip, k2 * Math.sign(vl || 1));
    }
    this.slipF = slipF; this.slipR = slipR; this.spinR = spin; this.lockF = lockF;
    // Traction control: trims engine torque when a driven wheel spins up.
    this.tcsOn = false;
    if (this.tcs && thr > 0.1 && tcsSlip > s.kPeak * 1.2) { this.tcsCut = Math.max(0.15, this.tcsCut - dt * 6); this.tcsOn = true; }
    else this.tcsCut = Math.min(1, this.tcsCut + dt * 3);

    // --- Aero, rolling resistance, nitro ----------------------------------------
    Fx += nitroF;
    Fx -= s.drag * vx * spd + s.roll * vx;
    Fy -= s.roll * vy * 0.5;
    const looseDrag = W[0].surfDrag + W[1].surfDrag + W[2].surfDrag + W[3].surfDrag;
    Fx -= looseDrag * vx; Fy -= looseDrag * vy * 0.5;
    // Gravity along a slope: uphill slows you, and a side slope pulls you downhill.
    if (!this.airborne) {
      const slopeF = clamp(((W[0].ground + W[1].ground) - (W[2].ground + W[3].ground)) / 2 / L, -1.2, 1.2);
      const slopeR = clamp(((W[1].ground + W[3].ground) - (W[0].ground + W[2].ground)) / 2 / 1.7, -1.2, 1.2);
      Fx -= m * G * slopeF * 0.9; Fy -= m * G * slopeR * 0.9;
    }

    // Slides straighten themselves out a little (more with the steering assist
    // on keyboard and touch), so a drift can always be caught.
    if (spd > 3 && vx > 0) Tq += beta * this.I * (this.steerAssist && !inp.analog ? 1.6 : 0.4) * Math.min(1, spd / 15) * (inp.handbrake ? 0.2 : 1);
    this.espOn = false;
    if (this.esp && spd > 6 && vx > 0) {
      const lim = 0.9 * s.mu * G / Math.max(vx, 1);
      const wRef = clamp(vx * td / L, -lim, lim);
      const err = w - wRef, b2 = Math.abs(beta);
      let corr = 0;
      if (Math.sign(err) === Math.sign(w) && Math.abs(err) > 0.06) corr -= (err - Math.sign(err) * 0.06) * this.I * 8;
      if (b2 > 0.07) corr += (beta - Math.sign(beta) * 0.07) * this.I * 10;
      if (corr !== 0 && !inp.handbrake) {
        Tq += corr; this.espOn = true;
        if (b2 > 0.12) this.tcsCut = Math.max(0.3, this.tcsCut - dt * 4);
      }
    }

    // --- Integrate the planar motion -------------------------------------------------
    const ax = Fx / m, ay = Fy / m;
    vx += (ax + w * vy) * dt;
    vy += (ay - w * vx) * dt;
    w += Tq / this.I * dt;
    // At walking pace blend into a simple rolling model so the car doesn't jitter.
    const kb = clamp((spd - 1.2) / 3.5, 0, 1);
    w = w * kb + (vx * td / L) * (1 - kb);
    vy *= kb + (1 - kb) * 0.85;
    if (thr < 0.05 && Math.abs(vx) < 0.25 && (brk > 0.05 || inp.handbrake || Math.abs(vx) < 0.05)) {
      vx = 0; for (const wi of W) wi.w = 0;
    }

    // --- Integrate the body on its springs ------------------------------------------
    const down = s.down * spd * spd;
    let Fz = -m * G - down, Tp = 0, Tr = 0;
    for (let i = 0; i < 4; i++) { const [lz, lx] = s.wheelPos[i]; Fz += F[i]; Tp -= F[i] * lz; Tr -= F[i] * lx; }
    Tp -= m * ax * s.cgH;            // braking pitches the nose down
    Tr -= m * ay * s.rollH;          // cornering rolls the body to the outside
    this.hvV += Fz / m * dt; this.hv += this.hvV * dt;
    this.pitchV += Tp / this.Ip * dt; this.pitch += this.pitchV * dt;
    this.rollV += Tr / this.Ir * dt; this.roll += this.rollV * dt;
    this.hv = clamp(this.hv, -0.3, 1.2); this.pitch = clamp(this.pitch, -0.62, 0.62); this.roll = clamp(this.roll, -0.5, 0.5);
    if (this.hv <= -0.3 + 1e-6 && this.hvV < 0) this.hvV = 0;

    this.ax = lerp(this.ax, ax, Math.min(1, dt * 10)); this.ay = lerp(this.ay, ay, Math.min(1, dt * 10));
    this.vx = vx; this.vy = vy; this.w = w;
    this.throttle = thr; this.brakeIn = brk;
    this.px = this.x; this.pz = this.z; this.ph = this.h;
    const [X, Z] = this.worldVel();
    this.x += X * dt; this.z += Z * dt; this.h -= w * dt;
    this.wheelAng = (W[2].ang + W[3].ang) / 2;
  }
}
