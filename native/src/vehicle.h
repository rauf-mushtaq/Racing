// Car physics: a four-wheel model, ported from the JavaScript game's vehicle.js.
// Body frame: vx forward, vy to the right, w = yaw rate (positive turns right).
// World: heading h, forward = (sin h, cos h) in (x, z), right = (-cos h, sin h). Runs at 240 steps/s.
#pragma once
#include "world.h"
#include <functional>

struct VehicleSpec {
  double mass = 1650, cgH = 0.46, rollH = 0.32;
  double wheelPos[4][2] = { { 1.546, -0.83 }, { 1.546, 0.83 }, { -1.119, -0.86 }, { -1.119, 0.86 } };   // [forward, right] of the centre of mass
  double wheelR = 0.345, wheelI = 1.3, engineI = 0.22;
  double spring[4] = { 58000, 58000, 66000, 66000 }, damper[4] = { 4200, 4200, 4800, 4800 }, arb[2] = { 32000, 22000 }, travel = 0.11;
  double mu = 1.2, kPeak = 0.1, aPeak[2] = { 0.13, 0.115 }, C[2] = { 1.55, 1.38 };
  int nGears = 6; double gears[6] = { 3.09, 2.19, 1.6, 1.25, 1.03, 0.86 }, rev = 2.9, finalDrive = 3.42, eff = 0.9;
  double idle = 950, redline = 8000, limiter = 8250, Tmax = 690, peakRpm = 5500;
  double drag = 0.36, roll = 10, down = 0.9, brakeT[4] = { 2200, 2200, 1300, 1300 }, handT = 3200, steerMax = 0.6, frontDrive = 0.3, nitroForce = 8000;
};
struct DriveInput { double gas = 0, brake = 0, steer = 0, sens = 1; bool handbrake = false, nitro = false, analog = false; };
struct Wheel { double w = 0, ang = 0, comp = 0, compV = 0, N = 0, ground = 0, surfMu = 1, surfDrag = 0, slipK = 0, slipA = 0, absT = 0; bool grass = false, contact = true; int kind = 0; };

class Vehicle {
public:
  VehicleSpec s; double L, I, Ip, Ir, Fstatic[4], cStatic[4];
  double x = 0, z = 0, h = 0, px = 0, pz = 0, ph = 0, vx = 0, vy = 0, w = 0, steer = 0;
  int gear = 1; double rpm = 0, shiftT = 0, revT = 0, ax = 0, ay = 0, nitro = 1, tcsCut = 1;
  bool nitroOn = false, absOn = false, tcsOn = false, espOn = false, airborne = false, useAbs = true, useTcs = true, useEsp = true, autoGear = true, steerAssist = true;
  double slipF = 0, slipR = 0, spinR = 0, lockF = 0, throttle = 0, brakeIn = 0, wheelAng = 0;
  double hv = 0, hvV = 0, pitch = 0, pitchV = 0, roll = 0, rollV = 0, baseY = 0; bool haveBase = false;
  Wheel wheels[4];
  Ground (*groundFn)(double, double) = groundAt;   // what the wheels touch (a test can swap in a flat plane)
  Vehicle();
  void configure();                                   // recompute the derived values after changing `s` (a different car)
  void reset(double x, double z, double h);
  double speed() const { return std::hypot(vx, vy); }
  void worldVel(double& X, double& Z) const { double fx = std::sin(h), fz = std::cos(h), rx = -std::cos(h), rz = std::sin(h); X = fx * vx + rx * vy; Z = fz * vx + rz * vy; }
  void setWorldVel(double X, double Z) { double fx = std::sin(h), fz = std::cos(h), rx = -std::cos(h), rz = std::sin(h); vx = X * fx + Z * fz; vy = X * rx + Z * rz; }
  double bodyY() const { return baseY + hv; }
  double torqueAt(double rpm) const;
  double ratio(int g) const { return g > 0 ? s.gears[g - 1] : s.rev; }
  bool shift(int d);
  void step(double dt, const DriveInput& in);
};
