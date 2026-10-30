#include "game.h"

// --- Input ------------------------------------------------------------------------------------------------------------
struct XState { DWORD packet; WORD buttons; BYTE lt, rt; SHORT lx, ly, rx, ry; };
typedef DWORD(WINAPI* XGetState)(DWORD, XState*);
InputState Input::read() {
  InputState s; auto k = [&](int a, int b = 0) { return keys[a] || (b && keys[b]); };
  s.gas = k('W', VK_UP) ? 1 : 0; s.brake = k('S', VK_DOWN) ? 1 : 0; s.steer = (k('D', VK_RIGHT) ? 1 : 0) - (k('A', VK_LEFT) ? 1 : 0);
  s.handbrake = keys[VK_SPACE]; s.nitro = keys[VK_SHIFT] || keys['N'];
  s.cam = keys['C'] && !prev['C']; s.reset = keys['R'] && !prev['R']; s.shiftUp = keys['E'] && !prev['E']; s.shiftDown = keys['Q'] && !prev['Q'];
  if (rightDown) { s.lookDX = mouseDX; s.lookDY = mouseDY; } s.zoom = wheel; mouseDX = mouseDY = wheel = 0;
  std::memcpy(prev, keys, sizeof keys);
  if (!xinput) { HMODULE m = LoadLibraryA("xinput1_4.dll"); if (!m) m = LoadLibraryA("xinput1_3.dll"); if (!m) m = LoadLibraryA("xinput9_1_0.dll"); xinput = m ? (void*)GetProcAddress(m, "XInputGetState") : (void*)1; }
  if (xinput != (void*)1) {
    XState st = {}; if (((XGetState)xinput)(0, &st) == 0) {
      auto dz = [](double v) { v /= 32767.0; return std::fabs(v) < 0.1 ? 0.0 : (v > 0 ? (v - 0.1) / 0.9 : (v + 0.1) / 0.9); };
      if (std::fabs(dz(st.lx)) > 0) { s.steer = dz(st.lx); s.analog = true; }
      if (st.rt > 20) s.gas = std::max(s.gas, st.rt / 255.0); if (st.lt > 20) s.brake = std::max(s.brake, st.lt / 255.0);
      if (st.buttons & 0x1000) s.handbrake = true; if (st.buttons & 0x4000) s.nitro = true;
      bool y = (st.buttons & 0x8000) != 0, back = (st.buttons & 0x0020) != 0; if (y && !padPrevY) s.cam = true; if (back && !padPrevBack) s.reset = true; padPrevY = y; padPrevBack = back;
      if (st.buttons & 0x0200) s.shiftUp = true; if (st.buttons & 0x0100) s.shiftDown = true;
      s.lookDX += (float)dz(st.rx) * 8.0f; s.lookDY += (float)dz(st.ry) * -8.0f;
    }
  }
  return s;
}

// --- Game ---------------------------------------------------------------------------------------------------------------
static int nearestIndex(const Road& R, double x, double z) { int bi = 0; double bd = 1e18; for (size_t i = 0; i < R.x.size(); i++) { double d = (R.x[i] - x) * (R.x[i] - x) + (R.z[i] - z) * (R.z[i] - z); if (d < bd) { bd = d; bi = (int)i; } } return bi; }
static const Road* roadById(const char* id) { for (auto& R : ROADS) if (R.id == id) return &R; return nullptr; }

void Game::init(Renderer& r) {
  scenery.init(r.gfx); model.build(r.gfx);
  r.drawWorld = [this](Renderer& rr, bool shadow, const Frustum& f) { draw(rr, shadow, f); };
}
// Put the car on a road, in the right-hand lane, facing along it (sign = which way along the road's drawn direction).
void Game::spawn(const std::string& where, double x, double z, double h) {
  lastWhere = where; car.reset(0, 0, 0);
  auto onRoad = [&](const char* id, double nx, double nz, int sign) {
    const Road* R = roadById(id); int i = nearestIndex(*R, nx, nz); int a = std::max(0, i - 1), b = std::min((int)R->x.size() - 1, i + 1);
    double tx = (R->x[b] - R->x[a]) * sign, tz = (R->z[b] - R->z[a]) * sign, l = std::hypot(tx, tz); tx /= l; tz /= l;
    double cx = R->x[i] + (-tz) * 3.4, cz = R->z[i] + tx * 3.4; car.reset(cx, cz, std::atan2(tx, tz));
  };
  if (where == "coast") onRoad("ring", -2800, 1500, 1);
  else if (where == "desert") onRoad("east", 3500, 0, 1);
  else if (where == "alpine") onRoad("north", 0, -4000, 1);
  else if (where == "south") onRoad("south", 0, 3500, 1);
  else if (where == "ring") onRoad("ring", x, z, 1);
  else if (where == "runway") { car.reset(AIRFIELD.x - 4, AIRFIELD.runwayZ0 + 40, 0); }
  else if (where == "city") car.reset(8.5, 480, PI);
  else car.reset(x, z, h);
  car.haveBase = false; camInit = false; acc = 0; alpha = 1;
}
void Game::update(Renderer& r, double dt, const InputState& in) {
  if (in.cam) camMode = (camMode + 1) % 4;
  if (in.reset) spawn(lastWhere.empty() ? "coast" : lastWhere, car.x, car.z, car.h);
  if (in.shiftUp) car.shift(1); if (in.shiftDown) car.shift(-1);
  DriveInput di; di.gas = in.gas; di.brake = in.brake; di.steer = in.steer; di.handbrake = in.handbrake; di.nitro = in.nitro; di.analog = in.analog;
  const double STEP = 1.0 / 240.0; acc += std::min(dt, 0.066);
  HitFn hit = [](double) {};
  while (acc >= STEP) { car.step(STEP, di); collideStatic(car, hit); collideTerrain(car, hit); acc -= STEP; }
  alpha = acc / STEP; speedKmh = car.speed() * 3.6; braking = in.brake > 0.1 && car.vx > 0.5;
  updateCamera(r, dt, in);
}
void Game::updateCamera(Renderer& r, double dt, const InputState& in) {
  const double k2r = PI / 180.0; Mat4 M = model.bodyMatrix(car, alpha);
  double x = lerpd(car.px, car.x, alpha), z = lerpd(car.pz, car.z, alpha), h = car.ph + wrapAngle(car.h - car.ph) * alpha, spd = car.speed();
  Vec3 carPos((float)x, (float)car.bodyY(), (float)z), fwd((float)std::sin(h), 0, (float)std::cos(h));
  orbit += in.lookDX * 0.004; orbitPitch = clampd(orbitPitch - in.lookDY * 0.004, -0.5, 0.9);
  if (in.lookDX == 0 && in.lookDY == 0) { orbit *= std::exp(-1.5 * dt); orbitPitch *= std::exp(-1.5 * dt); }
  Vec3 pos, look; double fov = 60;
  if (camMode <= 1) {
    if (!camInit) { camYaw = h; camInit = true; }
    double wvx, wvz; car.worldVel(wvx, wvz); double target = h;
    if (spd > 6) { double vd = std::atan2(wvx, wvz); target = h + wrapAngle(vd - h) * 0.35 * std::min(1.0, (spd - 6) / 20); }
    camYaw += wrapAngle(target - camYaw) * (1 - std::exp(-4.0 * dt));
    double dist = (camMode == 0 ? 8.6 : 6.0) + spd * 0.022, height = (camMode == 0 ? 2.9 : 1.95) + orbitPitch * 4.0, yaw = camYaw + orbit;
    Vec3 want = carPos + Vec3((float)(-std::sin(yaw) * dist), (float)height, (float)(-std::cos(yaw) * dist));
    if (!camPos.x && !camPos.z) camPos = want; double a = 1 - std::exp(-14.0 * dt); camPos = camPos + (want - camPos) * (float)a;
    Vec3 aim = carPos + Vec3((float)(std::sin(yaw) * 4.0), 1.15f, (float)(std::cos(yaw) * 4.0));
    camLookSmooth = camInit && length(camLookSmooth) > 0 ? camLookSmooth + (aim - camLookSmooth) * (float)(1 - std::exp(-18.0 * dt)) : aim;
    pos = camPos; look = camLookSmooth; fov = 60 + std::min(spd * 0.11, 11.0);
  } else {
    Vec3 seat = camMode == 2 ? Vec3(0.36f, 1.0f, 0.15f) : Vec3(0.0f, 0.98f, 1.05f);
    pos = transformPoint(M, seat); Vec3 ahead = transformPoint(M, seat + Vec3(0, -0.02f, 20.0f)); look = ahead + Vec3((float)(std::sin(h + orbit) - fwd.x) * 20, 0, (float)(std::cos(h + orbit) - fwd.z) * 20);
    fov = camMode == 2 ? 74 : 68; camPos = pos; camLookSmooth = look;
  }
  double gy = heightAt(pos.x, pos.z) + 0.7; if (camMode <= 1 && pos.y < gy) pos.y = (float)gy;
  Vec3 f = normalize(look - pos);
  r.cam.pos = pos; r.cam.yaw = (float)(std::atan2(f.x, -f.z) / k2r); r.cam.pitch = (float)(std::asin(f.y) / k2r); r.cam.fov = (float)fov;
}
void Game::draw(Renderer& r, bool shadow, const Frustum& f) {
  scenery.draw(r, shadow, f); model.draw(r, car, alpha, color, braking);
}
