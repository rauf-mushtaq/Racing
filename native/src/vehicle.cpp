#include "vehicle.h"

static const double G = 9.81;
static double magic(double s, double C) { double B = std::tan(PI / (2 * C)); return std::sin(C * std::atan(B * s)); }
static double sgn(double v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }

Vehicle::Vehicle() {
  L = s.wheelPos[0][0] - s.wheelPos[2][0];
  I = s.mass * (4.61 * 4.61 + 2.06 * 2.06) / 12 * 1.05; Ip = s.mass * (4.61 * 4.61 + 1.1 * 1.1) / 12 * 0.9; Ir = s.mass * (2.06 * 2.06 + 1.1 * 1.1) / 12 * 0.9;
  double a = s.wheelPos[0][0], b = -s.wheelPos[2][0];
  for (int i = 0; i < 4; i++) { Fstatic[i] = s.mass * G * (i < 2 ? b : a) / L / 2; cStatic[i] = Fstatic[i] / s.spring[i]; }
  reset(0, 0, 0);
}
void Vehicle::reset(double X, double Z, double H) {
  x = X; z = Z; h = H; px = X; pz = Z; ph = H; vx = vy = w = steer = 0; gear = 1; rpm = s.idle; shiftT = revT = ax = ay = 0; nitro = 1; nitroOn = false;
  absOn = tcsOn = espOn = false; slipF = slipR = spinR = lockF = 0; throttle = brakeIn = wheelAng = 0; tcsCut = 1;
  hv = hvV = pitch = pitchV = roll = rollV = 0; baseY = 0; haveBase = false; airborne = false;
  for (int i = 0; i < 4; i++) { Wheel& wi = wheels[i]; wi = Wheel(); wi.comp = cStatic[i]; wi.N = Fstatic[i]; }
}
double Vehicle::torqueAt(double r) const { double xx = r / s.peakRpm; return s.Tmax * clampd(1 - 0.35 * (xx - 1) * (xx - 1) * (xx < 1 ? 1.5 : 1.25), 0.35, 1); }
bool Vehicle::shift(int d) {
  if (shiftT > 0) return false;
  int g = gear + d;
  if (g < -1 || g > 6 || g == 0) { if (g == 0 && speed() < 2) { gear = d < 0 ? -1 : 1; return true; } return false; }
  gear = g; shiftT = 0.16; return true;
}

void Vehicle::step(double dt, const DriveInput& inp) {
  const VehicleSpec& S = s; double m = S.mass, vx_ = vx, vy_ = vy, w_ = w;
  double spd = std::hypot(vx_, vy_), f[2] = { std::sin(h), std::cos(h) }, rt[2] = { -std::cos(h), std::sin(h) };
  // --- Pedals, reverse ---
  double thr = inp.gas, brk = inp.brake;
  if (gear == -1) std::swap(thr, brk);
  if (autoGear) {
    if (gear >= 1 && inp.brake > 0.3 && inp.gas < 0.1 && vx_ < 0.6) { revT += dt; if (revT > 0.3) { gear = -1; revT = 0; } }
    else if (gear == -1 && inp.gas > 0.1 && vx_ > -0.8) gear = 1;
    else revT = 0;
  }
  // --- Steering ---
  double beta = std::atan2(vy_, std::fabs(vx_) + 0.5), target;
  if (inp.analog) target = inp.steer * S.steerMax * inp.sens / (1 + spd / 70);
  else {
    target = inp.steer * S.steerMax / (1 + spd / 12);
    if (steerAssist && spd > 6 && vx_ > 0) target += clampd(beta * 0.75, -0.3, 0.3) * (inp.steer == 0 ? 1 : 0.45);
  }
  target = clampd(target, -S.steerMax, S.steerMax);
  double rate = inp.analog ? 14 : (sgn(target) != sgn(steer) || std::fabs(target) < std::fabs(steer) ? 5.5 : 3.0);
  steer += clampd(target - steer, -rate * dt, rate * dt);
  double d = steer, td = std::tan(d);
  // --- Ground under each wheel, and the suspension ---
  Wheel* W = wheels;
  if (!haveBase) { baseY = groundFn(x, z).y; haveBase = true; }
  double gSum = 0;
  for (int i = 0; i < 4; i++) {
    double lz = S.wheelPos[i][0], lx = S.wheelPos[i][1], wx = x + f[0] * lz + rt[0] * lx, wz = z + f[1] * lz + rt[1] * lx;
    Ground g = groundFn(wx, wz); W[i].ground = g.y; W[i].grass = g.grass; W[i].kind = g.kind; W[i].surfMu = g.mu; W[i].surfDrag = g.drag; gSum += g.y;
  }
  baseY = lerpd(baseY, gSum / 4, std::min(1.0, dt * 3));
  double F[4];
  for (int i = 0; i < 4; i++) {
    double lz = S.wheelPos[i][0], lx = S.wheelPos[i][1]; Wheel& wi = W[i];
    double attach = hv - pitch * lz - roll * lx, comp = (wi.ground - baseY) - attach + cStatic[i];
    wi.compV = (comp - wi.comp) / dt; wi.comp = comp;
    double Fi = S.spring[i] * comp + S.damper[i] * wi.compV;
    if (comp > cStatic[i] + S.travel) Fi += (comp - cStatic[i] - S.travel) * S.spring[i] * 12;
    wi.contact = comp > 0; F[i] = comp > 0 ? std::max(0.0, Fi) : 0;
  }
  { const int pairs[2][2] = { {0, 1}, {2, 3} }; for (int a = 0; a < 2; a++) {
      int l = pairs[a][0], r = pairs[a][1]; if (!W[l].contact || !W[r].contact) continue;
      double dF = (W[l].comp - W[r].comp) * S.arb[a]; F[l] = std::max(0.0, F[l] - dF * 0.5); F[r] = std::max(0.0, F[r] + dF * 0.5); } }
  airborne = !(W[0].contact || W[1].contact || W[2].contact || W[3].contact);
  // --- Engine and drivetrain ---
  double gr = ratio(gear) * S.finalDrive;
  double drivenW = (W[0].w + W[1].w) * 0.5 * S.frontDrive + (W[2].w + W[3].w) * 0.5 * (1 - S.frontDrive);
  double wheelRpm = std::fabs(drivenW) * 60 / (2 * PI), rpmW = wheelRpm * gr, rpm_ = rpmW;
  if (gear == 1 || gear == -1) rpm_ = std::max(rpm_, S.idle + thr * 3600 * clampd(1 - rpmW / 4500, 0, 1));
  rpm_ = std::max(rpm_, S.idle);
  if (shiftT > 0) shiftT -= dt;
  if (autoGear && shiftT <= 0 && gear >= 1) {
    if (rpmW > 7700 && gear < 6) shift(1);
    else if (gear > 1) {
      double lower = wheelRpm * S.gears[gear - 2] * S.finalDrive;
      if (lower < 7100 && ((thr > 0.6 && rpmW < 4300) || rpmW < 2600 || (brk > 0.2 && rpmW < 3600))) shift(-1);
    }
  }
  rpm += (std::min(rpm_, S.limiter + 100) - rpm) * std::min(1.0, dt * 18);
  double Te = torqueAt(rpm) * thr * tcsCut;
  if (rpm >= S.limiter || shiftT > 0) Te = 0;
  double Tdrive = Te * gr * S.eff * (gear == -1 ? -1 : 1);
  if (gear == -1 && vx_ < -11) Tdrive = 0;
  if (thr < 0.05 && shiftT <= 0) Tdrive -= sgn(drivenW) * 0.16 * torqueAt(rpm) * gr * clampd(rpm / S.redline, 0, 1) * clampd(std::fabs(vx_), 0, 1);
  nitroOn = false; double nitroF = 0;
  if (inp.nitro && nitro > 0.01 && gear >= 1 && thr > 0.1) { nitroF = S.nitroForce; nitro = std::max(0.0, nitro - dt * 0.2); nitroOn = true; }
  else nitro = std::min(1.0, nitro + dt * 0.018 * (spd > 20 ? 1 : 0.4));
  double Ieng = shiftT > 0 ? 0 : S.engineI * gr * gr / 4;
  double Tw[4] = { 0, 0, 0, 0 };
  { const int axles[2][2] = { {0, 1}, {2, 3} }; const double shares[2] = { S.frontDrive, 1 - S.frontDrive };
    for (int a = 0; a < 2; a++) { int l = axles[a][0], r = axles[a][1]; double T = Tdrive * shares[a], lim = std::fabs(T) * 0.6 + 300, lock = clampd((W[l].w - W[r].w) * 60, -lim, lim); Tw[l] = T / 2 - lock; Tw[r] = T / 2 + lock; } }
  // --- Tyres ---
  double Fx = 0, Fy = 0, Tq = 0; absOn = false; double tcsSlip = 0, slipF_ = 0, slipR_ = 0, spin = 0, lockF_ = 0, R = S.wheelR;
  for (int i = 0; i < 4; i++) {
    double lz = S.wheelPos[i][0], lx = S.wheelPos[i][1]; Wheel& wi = W[i]; bool front = i < 2; double N = F[i]; wi.N = N;
    double mu = S.mu * wi.surfMu;
    double di = front ? std::atan(L * td / (L - lx * td)) : 0, cd = std::cos(di), sd = std::sin(di);
    double vf = vx_ - w_ * lx, vr = vy_ + w_ * lz, vl = cd * vf + sd * vr, vlat = -sd * vf + cd * vr, den = std::max(std::fabs(vl), 3.0);
    double ap = S.aPeak[front ? 0 : 1], C = S.C[front ? 0 : 1], alpha = std::atan2(vlat, den);
    double Tb = brk * S.brakeT[i];
    if (inp.handbrake && !front) Tb += S.handT;
    if (useAbs && !(inp.handbrake && !front) && spd > 2 && Tb > 0) {
      double k0 = (wi.w * R - vl) / den;
      if (k0 < -S.kPeak * 1.15) wi.absT = 0.06;
      if (wi.absT > 0) { wi.absT -= dt; Tb *= 0.35; absOn = true; }
    }
    double k = (wi.w * R - vl) / den, sk = k / S.kPeak, sa = std::tan(alpha) / std::tan(ap), sl = std::hypot(sk, sa); if (sl == 0) sl = 1e-6;
    double Fmax = mu * N, Fc = Fmax * magic(sl, C), fx0 = Fc * sk / sl;
    double slope = Fmax * (sl < 1 ? 1.6 : 0.3) / S.kPeak * R / den;
    double Ieff = S.wheelI + ((std::fabs(Tw[i]) > 0 || thr > 0) ? Ieng : 0), Tnet = Tw[i] - fx0 * R;
    double wNew = wi.w + dt * Tnet / (Ieff + dt * slope * R), dB = dt * Tb / (Ieff + dt * slope * R);
    if (std::fabs(wNew) <= dB) wNew = 0; else wNew -= sgn(wNew) * dB;
    if (!wi.contact || N <= 0) wNew = wi.w + dt * (Tw[i] - sgn(wi.w) * Tb) / Ieff;
    wi.w = wNew;
    double k2 = (wi.w * R - vl) / den, sk2 = k2 / S.kPeak, sl2 = std::hypot(sk2, sa); if (sl2 == 0) sl2 = 1e-6;
    double Fc2 = Fmax * magic(sl2, C), Fl = N > 0 ? Fc2 * sk2 / sl2 : 0, Flat = N > 0 ? -Fc2 * sa / sl2 : 0;
    wi.slipK = k2; wi.slipA = alpha; wi.ang += wi.w * dt;
    double ff = cd * Fl - sd * Flat, fr = sd * Fl + cd * Flat; Fx += ff; Fy += fr; Tq += lz * fr - lx * ff;
    if (front) { slipF_ = std::max(slipF_, std::fabs(alpha)); if (k2 < -0.5) lockF_ = 1; }
    else { slipR_ = std::max(slipR_, std::fabs(alpha)); spin = std::max(spin, clampd((std::fabs(k2) - 0.15) * 2, 0, 1)); }
    if (Tw[i] * (sgn(vl) == 0 ? 1 : sgn(vl)) > 0) tcsSlip = std::max(tcsSlip, k2 * (sgn(vl) == 0 ? 1 : sgn(vl)));
  }
  slipF = slipF_; slipR = slipR_; spinR = spin; lockF = lockF_;
  tcsOn = false;
  if (useTcs && thr > 0.1 && tcsSlip > S.kPeak * 1.2) { tcsCut = std::max(0.15, tcsCut - dt * 6); tcsOn = true; } else tcsCut = std::min(1.0, tcsCut + dt * 3);
  // --- Aero, rolling resistance, nitro, slope ---
  Fx += nitroF; Fx -= S.drag * vx_ * spd + S.roll * vx_; Fy -= S.roll * vy_ * 0.5;
  double looseDrag = W[0].surfDrag + W[1].surfDrag + W[2].surfDrag + W[3].surfDrag; Fx -= looseDrag * vx_; Fy -= looseDrag * vy_ * 0.5;
  if (!airborne) {
    double slopeF = clampd(((W[0].ground + W[1].ground) - (W[2].ground + W[3].ground)) / 2 / L, -1.2, 1.2), slopeR = clampd(((W[1].ground + W[3].ground) - (W[0].ground + W[2].ground)) / 2 / 1.7, -1.2, 1.2);
    Fx -= m * G * slopeF * 0.9; Fy -= m * G * slopeR * 0.9;
  }
  if (spd > 3 && vx_ > 0) Tq += beta * I * (steerAssist && !inp.analog ? 1.6 : 0.4) * std::min(1.0, spd / 15) * (inp.handbrake ? 0.2 : 1);
  espOn = false;
  if (useEsp && spd > 6 && vx_ > 0) {
    double lim = 0.9 * S.mu * G / std::max(vx_, 1.0), wRef = clampd(vx_ * td / L, -lim, lim), err = w_ - wRef, b2 = std::fabs(beta), corr = 0;
    if (sgn(err) == sgn(w_) && std::fabs(err) > 0.06) corr -= (err - sgn(err) * 0.06) * I * 8;
    if (b2 > 0.07) corr += (beta - sgn(beta) * 0.07) * I * 10;
    if (corr != 0 && !inp.handbrake) { Tq += corr; espOn = true; if (b2 > 0.12) tcsCut = std::max(0.3, tcsCut - dt * 4); }
  }
  // --- Integrate the planar motion ---
  double axl = Fx / m, ayl = Fy / m;
  vx_ += (axl + w_ * vy_) * dt; vy_ += (ayl - w_ * vx_) * dt; w_ += Tq / I * dt;
  double kb = clampd((spd - 1.2) / 3.5, 0, 1);
  w_ = w_ * kb + (vx_ * td / L) * (1 - kb); vy_ *= kb + (1 - kb) * 0.85;
  if (thr < 0.05 && std::fabs(vx_) < 0.25 && (brk > 0.05 || inp.handbrake || std::fabs(vx_) < 0.05)) { vx_ = 0; for (int i = 0; i < 4; i++) W[i].w = 0; }
  // --- Integrate the body on its springs ---
  double down = S.down * spd * spd, Fz = -m * G - down, Tp = 0, Tr = 0;
  for (int i = 0; i < 4; i++) { Fz += F[i]; Tp -= F[i] * S.wheelPos[i][0]; Tr -= F[i] * S.wheelPos[i][1]; }
  Tp -= m * axl * S.cgH; Tr -= m * ayl * S.rollH;
  hvV += Fz / m * dt; hv += hvV * dt; pitchV += Tp / Ip * dt; pitch += pitchV * dt; rollV += Tr / Ir * dt; roll += rollV * dt;
  hv = clampd(hv, -0.3, 1.2); pitch = clampd(pitch, -0.62, 0.62); roll = clampd(roll, -0.5, 0.5);
  if (hv <= -0.3 + 1e-6 && hvV < 0) hvV = 0;
  ax = lerpd(ax, axl, std::min(1.0, dt * 10)); ay = lerpd(ay, ayl, std::min(1.0, dt * 10));
  vx = vx_; vy = vy_; w = w_; throttle = thr; brakeIn = brk; px = x; pz = z; ph = h;
  double X, Z; worldVel(X, Z); x += X * dt; z += Z * dt; h -= w * dt;
  wheelAng = (W[2].ang + W[3].ang) / 2;
}
