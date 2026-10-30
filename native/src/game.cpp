#include "game.h"
#include <cstdio>

// --- Input ------------------------------------------------------------------------------------------------------------
struct XState { DWORD packet; WORD buttons; BYTE lt, rt; SHORT lx, ly, rx, ry; };
typedef DWORD(WINAPI* XGetState)(DWORD, XState*);
InputState Input::read() {
  InputState s; auto k = [&](int a, int b = 0) { return keys[a] || (b && keys[b]); }; auto edge = [&](int a) { return keys[a] && !prev[a]; };
  s.gas = k('W', VK_UP) ? 1 : 0; s.brake = k('S', VK_DOWN) ? 1 : 0; s.steer = (k('D', VK_RIGHT) ? 1 : 0) - (k('A', VK_LEFT) ? 1 : 0);
  s.handbrake = keys[VK_SPACE]; s.nitro = keys[VK_SHIFT] || keys['N'];
  s.cam = edge('C'); s.reset = edge('R'); s.shiftUp = edge('E'); s.shiftDown = edge('Q');
  s.fire = keys['F'] || leftDown; s.missile = edge('G'); s.bomb = edge('B'); s.oil = edge('O'); s.smoke = edge('X'); s.shield = edge('V');
  s.menu = edge(VK_ESCAPE) || edge(VK_TAB); s.up = edge(VK_UP) || edge('W'); s.down = edge(VK_DOWN) || edge('S'); s.left = edge(VK_LEFT) || edge('A'); s.right = edge(VK_RIGHT) || edge('D'); s.enter = edge(VK_RETURN) || edge(VK_SPACE); s.back = edge(VK_BACK);
  s.stats = edge(VK_F3); s.vsync = edge(VK_F4); s.ao = edge(VK_F5); s.shadows = edge(VK_F6); s.refl = edge(VK_F7); s.tod = edge('T');
  if (rightDown) { s.lookDX = mouseDX; s.lookDY = mouseDY; } s.zoom = wheel; mouseDX = mouseDY = wheel = 0;
  std::memcpy(prev, keys, sizeof keys);
  if (!xinput) { HMODULE m = LoadLibraryA("xinput1_4.dll"); if (!m) m = LoadLibraryA("xinput1_3.dll"); if (!m) m = LoadLibraryA("xinput9_1_0.dll"); xinput = m ? (void*)GetProcAddress(m, "XInputGetState") : (void*)1; }
  if (xinput != (void*)1) {
    XState st = {}; if (((XGetState)xinput)(0, &st) == 0) {
      auto dz = [](double v) { v /= 32767.0; return std::fabs(v) < 0.1 ? 0.0 : (v > 0 ? (v - 0.1) / 0.9 : (v + 0.1) / 0.9); };
      unsigned b = st.buttons, pe = b & ~padPrev; padPrev = b;
      if (std::fabs(dz(st.lx)) > 0) { s.steer = dz(st.lx); s.analog = true; }
      if (st.rt > 20) s.gas = std::max(s.gas, st.rt / 255.0); if (st.lt > 20) s.brake = std::max(s.brake, st.lt / 255.0);
      if (b & 0x1000) s.handbrake = true; if (b & 0x4000) s.nitro = true;
      if (pe & 0x8000) s.cam = true; if (pe & 0x0020) s.reset = true; if (pe & 0x0200) s.shiftUp = true; if (pe & 0x0100) s.shiftDown = true;
      if (b & 0x0200) s.fire = true; if (pe & 0x2000) s.missile = true; if (pe & 0x0100) s.bomb = true; if (pe & 0x0001) s.oil = true; if (pe & 0x0002) s.smoke = true; if (pe & 0x0004) s.shield = true;
      if (pe & 0x0010) s.menu = true; if (pe & 0x0001) s.up = true; if (pe & 0x0002) s.down = true; if (pe & 0x0004) s.left = true; if (pe & 0x0008) s.right = true; if (pe & 0x1000) s.enter = true; if (pe & 0x2000) s.back = true;
      s.lookDX += (float)dz(st.rx) * 8.0f; s.lookDY += (float)dz(st.ry) * -8.0f;
    }
  }
  return s;
}

// --- Setting up -------------------------------------------------------------------------------------------------------------
static int nearestIndex(const Road& R, double x, double z) { int bi = 0; double bd = 1e18; for (size_t i = 0; i < R.x.size(); i++) { double d = (R.x[i] - x) * (R.x[i] - x) + (R.z[i] - z) * (R.z[i] - z); if (d < bd) { bd = d; bi = (int)i; } } return bi; }
static const Road* roadById(const char* id) { for (auto& R : ROADS) if (R.id == id) return &R; return nullptr; }

void Game::setCarKind(int kind) {
  carKind = kind; car.s = VehicleSpec(); if (kind == 1) BondModel::configure(car); else { car.configure(); car.reset(car.x, car.z, car.h); }
}
void Game::init(Renderer& r) {
  scenery.init(r.gfx); model.build(r.gfx); bond.build(r.gfx); city.init(r.gfx); vmodels.build(r.gfx); traffic.init(r.gfx, vmodels); peds.init(r.gfx); traffic.setDensity(trafficLevel, pose()); escape.init(r.gfx, &vmodels);
  { MeshData c; c.cylinder(Vec3(0, 0, 0), Vec3(0, 1, 0), 1.0f, 1.0f, 12, packColor(1, 1, 1)); gateCyl = uploadMesh(r.gfx, c); MeshData b; b.box(Vec3(-0.5f, -0.5f, -0.5f), Vec3(0.5f, 0.5f, 0.5f), packColor(1, 1, 1)); gateBox = uploadMesh(r.gfx, b); }
  r.drawWorld = [this](Renderer& rr, bool shadow, const Frustum& f) { draw(rr, shadow, f); };
  r.drawFx = [this](Renderer& rr) { fx.draw(rr, rr.cam.pos); };
  loadSaves();
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
  car.haveBase = false; camInit = false; acc = 0; alpha = 1; traffic.reset(pose()); fx.clear();
}

// --- Saved best times -------------------------------------------------------------------------------------------------------
void Game::loadSaves() { FILE* f = fopen("sunset_native_saves.txt", "r"); if (!f) return; char id[128]; double t; while (fscanf(f, "%127s %lf", id, &t) == 2) bests[id] = t; fclose(f); }
void Game::saveSaves() { FILE* f = fopen("sunset_native_saves.txt", "w"); if (!f) return; for (auto& [k, v] : bests) fprintf(f, "%s %.3f\n", k.c_str(), v); fclose(f); }
int Game::medalFor(const std::string& id, const Route& rt) const { double t = bestFor(id); if (t < 0) return 0; return t <= rt.medals.gold ? 3 : t <= rt.medals.silver ? 2 : t <= rt.medals.bronze ? 1 : 0; }

// --- The menu -----------------------------------------------------------------------------------------------------------------
void Game::openMenu() { if (state == State::Menu) return; menuFrom = state; state = State::Menu; buildMenu(0); }
void Game::closeMenu() { if (state != State::Menu) return; state = menuFrom == State::Menu ? State::Free : menuFrom; }
enum { A_RESUME = 1, A_FREE, A_RACES, A_ESCAPE, A_CAR, A_TRAFFIC, A_QUIT, A_RACE, A_BACK, A_RESTART };
void Game::buildMenu(int page) {
  menuPage = page; menuItems.clear(); menuSel = 0;
  if (page == 0) {
    menuTitle = "SUNSET CITY";
    bool canResume = menuFrom != State::Menu && menuFrom != State::Finished && menuFrom != State::EscapeOver;
    if (canResume) menuItems.push_back({ "Resume", "Back to the game.", A_RESUME, 0 });
    menuItems.push_back({ "Escape the police", "You have the silver GT with its gadgets. Machine guns, missiles, bombs, oil, smoke and an armour plate. Lose them, or wreck them.", A_ESCAPE, 0 });
    menuItems.push_back({ "Races", "Fifteen routes through the city and out along the motorways, with medals.", A_RACES, 0 });
    menuItems.push_back({ "Free roam", "Drive anywhere. The whole 12 by 16 km world is open.", A_FREE, 0 });
    menuItems.push_back({ std::string("Car: ") + (carKind == 1 ? "Silver GT" : "Supercar"), "Which car you drive in free roam and the races (the escape mode always uses the silver GT).", A_CAR, 0 });
    static const char* tl[4] = { "Off", "Light", "Normal", "Heavy" };
    menuItems.push_back({ std::string("Traffic: ") + tl[trafficLevel], "How many cars share the roads.", A_TRAFFIC, 0 });
    menuItems.push_back({ "Quit", "", A_QUIT, 0 });
  } else {
    menuTitle = "RACES"; const auto& E = raceEvents(); std::string group;
    for (size_t i = 0; i < E.size(); i++) { Route rt = buildRoute(E[i]); char d[256]; double b = bestFor(E[i].id); std::string best = b >= 0 ? " Best " + std::to_string((int)(b / 60)) + ":" + (((int)b % 60) < 10 ? "0" : "") + std::to_string((int)b % 60) : "";
      snprintf(d, sizeof d, "%s  %.1f km.%s  Gold under %d:%02d.", E[i].desc.c_str(), rt.length / 1000, best.c_str(), (int)(rt.medals.gold / 60), (int)rt.medals.gold % 60); menuItems.push_back({ (E[i].group == "City" ? "City: " : "Country: ") + E[i].name, d, A_RACE, (int)i }); }
    menuItems.push_back({ "Back", "", A_BACK, 0 });
  }
}
void Game::runMenuAction(const MenuItem& it) {
  switch (it.action) {
    case A_RESUME: closeMenu(); break;
    case A_FREE: setCarKind(carKind); state = State::Free; spawn("coast"); break;
    case A_RACES: buildMenu(1); break;
    case A_BACK: buildMenu(0); break;
    case A_ESCAPE: startEscape(); break;
    case A_RACE: startRace(it.arg); break;
    case A_CAR: setCarKind(carKind ? 0 : 1); buildMenu(0); menuSel = 4 - (menuFrom == State::Menu || menuFrom == State::Finished || menuFrom == State::EscapeOver ? 1 : 0); break;
    case A_TRAFFIC: trafficLevel = (trafficLevel + 1) % 4; traffic.setDensity(trafficLevel, pose()); buildMenu(0); menuSel = 5 - (menuFrom == State::Menu || menuFrom == State::Finished || menuFrom == State::EscapeOver ? 1 : 0); break;
    case A_QUIT: quit = true; break;
  }
}
void Game::menuInput(const InputState& in) {
  int n = (int)menuItems.size(); if (!n) return;
  if (in.up) menuSel = (menuSel + n - 1) % n; if (in.down) menuSel = (menuSel + 1) % n;
  if (in.enter || in.right) runMenuAction(menuItems[menuSel]);
  if (in.back || in.left) { if (menuPage == 1) buildMenu(0); }
}

// --- Races ------------------------------------------------------------------------------------------------------------------------
void Game::startRace(int idx) {
  const RaceEvent& ev = raceEvents()[idx]; route = buildRoute(ev); nextCp = 0; raceT = 0; countT = 3.4; newBest = false; state = State::Countdown;
  spawn("manual", route.start.x, route.start.z, route.start.h); traffic.setDensity(trafficLevel, pose()); toasts.clear();
}
void Game::placeAtCheckpoint(int k) {
  double x, z, h;
  if (k < 0) { x = route.start.x; z = route.start.z; h = route.start.h; }
  else { const Checkpoint& c = route.cps[k]; x = c.x; z = c.z; if (c.world) { h = std::atan2(c.tx, c.tz); } else { const Checkpoint* n = k + 1 < (int)route.cps.size() ? &route.cps[k + 1] : nullptr; h = n ? std::atan2(n->x - c.x, n->z - c.z) : car.h; } if (c.world) { x -= c.tz * 3.4; z += c.tx * 3.4; } }
  spawn("manual", x, z, h);
  if (k >= 0 && route.cps[k].world) car.haveBase = false;
}
void Game::finishRace() {
  state = State::Finished; double t = raceT; lastBest = bestFor(route.ev->id); newBest = lastBest < 0 || t < lastBest; if (newBest) { bests[route.ev->id] = t; saveSaves(); }
  lastMedal = t <= route.medals.gold ? 3 : t <= route.medals.silver ? 2 : t <= route.medals.bronze ? 1 : 0;
}

// --- The escape mode -----------------------------------------------------------------------------------------------------------------
void Game::startEscape() {
  setCarKind(1); state = State::Escape; spawn("city"); bondState = BondState(); traffic.setDensity(std::max(trafficLevel, 1), pose()); car.vx = 20; escape.start(car, traffic, fx); toasts.clear(); camMode = 0;
}

// --- Physics, per frame ------------------------------------------------------------------------------------------------------------------
void Game::stepPhysics(double dt, const InputState& in) {
  DriveInput di; di.gas = in.gas; di.brake = in.brake; di.steer = in.steer; di.handbrake = in.handbrake; di.nitro = in.nitro; di.analog = in.analog;
  if (state == State::Countdown) { di.gas = 0; di.handbrake = true; }
  if (state == State::Finished || state == State::EscapeOver) { di.gas = 0; di.brake = 0.3; }
  const double STEP = 1.0 / 240.0; acc += std::min(dt, 0.066);
  bool esc = state == State::Escape; HitFn hit = [&](double j) { if (esc) escape.playerHit(j, car.s.mass); };
  while (acc >= STEP) {
    car.step(STEP, di); collideStatic(car, hit); collideTerrain(car, hit); collideTraffic(car, traffic, hit); if (inEscapeHud()) escape.collidePlayer(car, hit); acc -= STEP;
  }
  alpha = acc / STEP; speedKmh = car.speed() * 3.6; braking = in.brake > 0.1 && car.vx > 0.5;
}

void Game::update(Renderer& r, double dt, const InputState& in) {
  time += dt; clock += dt;
  if (in.stats) showStats = !showStats;
  for (auto& t : toasts) t.age += dt; while (!toasts.empty() && toasts.front().age > 3.2) toasts.pop_front();
  if (in.menu) { if (state == State::Menu) { if (menuPage == 1) buildMenu(0); else if (menuFrom != State::Menu) closeMenu(); } else openMenu(); }
  if (state == State::Menu) { menuInput(in); updateCamera(r, dt, in); fx.update(dt * 0.3); return; }
  if (in.cam) camMode = (camMode + 1) % 4;
  if (in.reset) {
    if (state == State::Free) spawn(lastWhere.empty() ? "coast" : lastWhere, car.x, car.z, car.h);
    else if (state == State::Race || state == State::Countdown) placeAtCheckpoint(nextCp - 1);
    else if (state == State::Escape) { /* no resetting in the middle of a chase */ }
    else if (state == State::Finished) { startRace((int)(route.ev - raceEvents().data())); }
    else if (state == State::EscapeOver) startEscape();
  }
  if (in.shiftUp && state != State::Escape) car.shift(1); if (in.shiftDown && state != State::Escape) car.shift(-1);
  stepPhysics(dt, in);
  trafficAcc += std::min(dt, 0.066); while (trafficAcc >= 1.0 / 60) { traffic.update(1.0 / 60, pose(), clock); trafficAcc -= 1.0 / 60; }
  fx.update(dt);
  { // Tyre smoke when the car slides or the wheels spin.
    double fxd = std::sin(car.h), fzd = std::cos(car.h), rxd = -std::cos(car.h), rzd = std::sin(car.h), vxw, vzw; car.worldVel(vxw, vzw);
    for (int i = 0; i < 4; i++) { const Wheel& w = car.wheels[i]; if (!w.contact || w.N < 800 || car.speed() < 5) continue; double sl = std::max(std::fabs(w.slipA) * 3.0, std::fabs(w.slipK)); if (sl < 0.9) continue;
      static uint32_t sr = 7; sr = sr * 1664525u + 1013904223u; if ((sr >> 8) / 16777216.0 > dt * 28.0 * std::min(1.0, sl - 0.8)) continue;
      double wx = car.x + fxd * car.s.wheelPos[i][0] + rxd * car.s.wheelPos[i][1], wz = car.z + fzd * car.s.wheelPos[i][0] + rzd * car.s.wheelPos[i][1];
      fx.smoke(Vec3((float)wx, (float)car.bodyY() + 0.12f, (float)wz), Vec3((float)(vxw * 0.25), 0.7f, (float)(vzw * 0.25)), 0.45f, 1.5f, 0.72f, 0.32f, 1.8f); }
  }
  if (state == State::Countdown) {
    countT -= dt; if (countT <= 0.4 && countT + dt > 0.4) toast("GO");
    if (countT <= 0.4) state = State::Race;
  } else if (state == State::Race) {
    raceT += dt; const Checkpoint& cp = route.cps[nextCp];
    if (inCheckpoint(cp, car.x, car.z)) { nextCp++; if (nextCp >= (int)route.cps.size()) finishRace(); }
  } else if (state == State::Escape || state == State::EscapeOver) {
    EscapeInput ei; ei.fire = in.fire; ei.missile = in.missile; ei.bomb = in.bomb; ei.oil = in.oil; ei.smoke = in.smoke; ei.shield = in.shield;
    if (state == State::EscapeOver) ei = EscapeInput();
    escape.update(dt, car, traffic, fx, ei); for (auto& m : escape.messages) toast(m); escape.messages.clear();
    bondState.gunOut = escape.gunOut; bondState.shield += ((escape.shieldT > 0 ? 1.0 : 0.0) - bondState.shield) * std::min(1.0, dt * 6);
    if (state == State::Escape && escape.result != PoliceChase::RUNNING) state = State::EscapeOver;
  }
  updateCamera(r, dt, in);
}
void Game::updateCamera(Renderer& r, double dt, const InputState& in) {
  const double k2r = PI / 180.0; Mat4 M = carKind == 1 ? bond.bodyMatrix(car, alpha) : model.bodyMatrix(car, alpha);
  double x = lerpd(car.px, car.x, alpha), z = lerpd(car.pz, car.z, alpha), h = car.ph + wrapAngle(car.h - car.ph) * alpha, spd = car.speed();
  Vec3 carPos((float)x, (float)car.bodyY(), (float)z), fwd((float)std::sin(h), 0, (float)std::cos(h));
  orbit += in.lookDX * 0.004; orbitPitch = clampd(orbitPitch - in.lookDY * 0.004, -0.5, 0.9);
  if (in.lookDX == 0 && in.lookDY == 0) { orbit *= std::exp(-1.5 * dt); orbitPitch *= std::exp(-1.5 * dt); }
  Vec3 pos, look; double fov = 54;
  if (camMode <= 1) {
    if (!camInit) { camYaw = h; camInit = true; }
    double wvx, wvz; car.worldVel(wvx, wvz); double target = h;
    if (spd > 6) { double vd = std::atan2(wvx, wvz); target = h + wrapAngle(vd - h) * 0.35 * std::min(1.0, (spd - 6) / 20); }
    camYaw += wrapAngle(target - camYaw) * (1 - std::exp(-4.0 * dt));
    double dist = (camMode == 0 ? 5.5 : 4.2) + spd * 0.02, height = (camMode == 0 ? 1.85 : 1.35) + orbitPitch * 4.0, yaw = camYaw + orbit;
    Vec3 want = carPos + Vec3((float)(-std::sin(yaw) * dist), (float)height, (float)(-std::cos(yaw) * dist));
    if (!camPos.x && !camPos.z) camPos = want; double a = 1 - std::exp(-14.0 * dt); camPos = camPos + (want - camPos) * (float)a;
    Vec3 aim = carPos + Vec3((float)(std::sin(yaw) * 4.0), 1.1f, (float)(std::cos(yaw) * 4.0));
    camLookSmooth = camInit && length(camLookSmooth) > 0 ? camLookSmooth + (aim - camLookSmooth) * (float)(1 - std::exp(-18.0 * dt)) : aim;
    pos = camPos; look = camLookSmooth; fov = 54 + std::min(spd * 0.12, 12.0);
  } else {
    Vec3 seat = carKind == 1 ? BondModel::seat(camMode) : camMode == 2 ? Vec3(0.36f, 1.0f, 0.15f) : Vec3(0.0f, 0.98f, 1.05f);
    pos = transformPoint(M, seat); Vec3 ahead = transformPoint(M, seat + Vec3(0, -0.02f, 20.0f)); look = ahead + Vec3((float)(std::sin(h + orbit) - fwd.x) * 20, 0, (float)(std::cos(h + orbit) - fwd.z) * 20);
    fov = camMode == 2 ? 74 : 68; camPos = pos; camLookSmooth = look;
  }
  if (inEscapeHud() && escape.shake > 0.01) { double s = escape.shake * 0.35; pos = pos + Vec3((float)(std::sin(time * 63) * s), (float)(std::sin(time * 79) * s * 0.7), (float)(std::cos(time * 57) * s)); }
  double gy = heightAt(pos.x, pos.z) + 0.7; if (camMode <= 1 && pos.y < gy) pos.y = (float)gy;
  r.focusDist = std::max(2.0f, length(pos - carPos) + 1.0f);
  Vec3 f = normalize(look - pos);
  r.probeCenter = carPos + Vec3(0, 1.1f, 0);
  r.cam.pos = pos; r.cam.yaw = (float)(std::atan2(f.x, -f.z) / k2r); r.cam.pitch = (float)(std::asin(f.y) / k2r); r.cam.fov = (float)fov;
}

// --- Drawing ------------------------------------------------------------------------------------------------------------------------------
void Game::drawGates(Renderer& r, bool shadow) {
  if (shadow || route.cps.empty() || (state != State::Race && state != State::Countdown)) return;
  Material em; em.type = 4;
  for (int i = nextCp; i < std::min((int)route.cps.size(), nextCp + 2); i++) {
    const Checkpoint& cp = route.cps[i]; bool active = i == nextCp, last = i == (int)route.cps.size() - 1; const float c[3] = { last ? 1.0f : 0.15f, last ? 1.0f : 0.8f, last ? 1.0f : 1.0f };
    double halfW, yaw; bool alongZ; double y = cp.world ? cp.y : 0;
    if (cp.world) { halfW = cp.hw; yaw = std::atan2(cp.tx, cp.tz); alongZ = true; }
    else { alongZ = cp.alongZ; halfW = alongZ ? grid::hw(cp.i) : grid::hw(cp.j); yaw = alongZ ? 0 : PI / 2; }
    (void)alongZ; double span = halfW + 1.5; Mat4 base = mul(translation((float)cp.x, (float)y, (float)cp.z), rotationY((float)yaw));
    em.tint[0] = c[0]; em.tint[1] = c[1]; em.tint[2] = c[2]; em.emissive = active ? 5.0f : 1.4f;
    for (int s = -1; s <= 1; s += 2) r.drawMeshMat(gateCyl, mul(base, mul(translation((float)(s * span), 0, 0), scaling(0.35f, 7.0f, 0.35f))), em);
    r.drawMeshMat(gateBox, mul(base, mul(translation(0, 7.0f, 0), scaling((float)(span * 2 + 0.7), 0.5f, 0.5f))), em);
    if (last) { for (int a = 0; a < 16; a++) for (int b = 0; b < 2; b++) { Material cm = em; float v = (a + b) % 2 ? 0.02f : 1.0f; cm.tint[0] = cm.tint[1] = cm.tint[2] = v; cm.emissive = 2.0f; r.drawMeshMat(gateBox, mul(base, mul(translation((float)(-span + (a + 0.5f) * span * 2 / 16), 6.1f - b * 0.5f, 0), scaling((float)(span * 2 / 16), 0.5f, 0.2f))), cm); } }
    if (active) { em.emissive = 1.6f; r.drawMeshMat(gateCyl, mul(translation((float)cp.x, (float)y, (float)cp.z), scaling(0.45f, 260.0f, 0.45f)), em); }
  }
}
void Game::prepare(Gfx& g, const Frustum& f) { traffic.prepare(g, pose(), f, clock); peds.prepare(g, pose(), f, clock); }
void Game::draw(Renderer& r, bool shadow, const Frustum& f) {
  scenery.draw(r, shadow, f); city.draw(r, shadow, f, r.cam.pos); traffic.draw(r, shadow); peds.draw(r, shadow);
  if (inEscapeHud()) escape.draw(r, shadow, clock);
  if (r.inProbe) return;                                   // the reflection probe looks out from inside the car: it doesn't draw the car or the gates
  if (carKind == 1) { bondState.braking = braking; bond.cockpit = camMode >= 2; bond.draw(r, car, alpha, bondState); } else { model.cockpit = camMode >= 2; model.draw(r, car, alpha, color, braking); }
  drawGates(r, shadow);
  if (showcase >= 0) {
    Mat4 M = mul(translation(showAt.x, (float)heightAt(showAt.x, showAt.z), showAt.z), rotationY(0.5f));
    if (showcase == 8) { peds.showcase(r, showAt.x, showAt.z); return; }
    const CarMesh& m = showcase < TK_COUNT ? vmodels.traffic[showcase] : showcase == 6 ? vmodels.cruiser : vmodels.swat;
    Material paint; paint.type = 1; paint.tint[0] = 0.55f; paint.tint[1] = 0.10f; paint.tint[2] = 0.08f; if (showcase == 6) paint.tint[0] = paint.tint[1] = paint.tint[2] = 1.0f; if (showcase == 7) paint.tint[0] = paint.tint[1] = paint.tint[2] = 0.1f;
    Material dark; dark.type = 0; dark.rough = 0.6f; dark.metal = 0.2f; dark.twoSided = true; Material head; head.type = 4; head.emissive = 3.0f; Material tail; tail.type = 4; tail.emissive = 1.8f;
    r.drawMeshMat(m.body, M, paint); r.drawMeshMat(m.bar, M, dark); if (!shadow) { Material wm; wm.type = 0; wm.rough = 0.45f; wm.metal = 0.4f; wm.twoSided = true; r.drawMeshMat(m.wheels, M, wm); r.drawMeshMat(m.head, M, head); r.drawMeshMat(m.tail, M, tail); }
  }
}
