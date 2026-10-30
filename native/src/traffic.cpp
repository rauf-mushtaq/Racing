#include "traffic.h"
using namespace grid;

static const float PALETTE[12][3] = { {0.91f, 0.91f, 0.91f}, {0.067f, 0.07f, 0.08f}, {0.6f, 0.63f, 0.65f}, {0.36f, 0.38f, 0.4f}, {0.12f, 0.18f, 0.33f}, {0.54f, 0.11f, 0.11f}, {0.78f, 0.72f, 0.6f}, {0.18f, 0.29f, 0.23f}, {0.84f, 0.83f, 0.8f}, {0.19f, 0.2f, 0.23f}, {0.42f, 0.12f, 0.18f}, {0.16f, 0.36f, 0.56f} };
static const int COUNTS[4] = { 0, 30, 56, 96 };

void Traffic::init(Gfx& g, const VehicleModels& vm) {
  models = &vm; initParked();
  // Traffic signal: a pole with an arm, a head hanging at its end and three lamps on the head's -z face (see the layout in prepareSignals).
  MeshData p; uint32_t k = vcol(0.16f, 0.17f, 0.18f);
  p.cylinder(Vec3(0, 0, 0), Vec3(0, 5.6f, 0), 0.11f, 0.08f, 8, k); p.box(Vec3(0, 5.5f, -0.05f), Vec3(3.4f, 5.62f, 0.05f), k); p.box(Vec3(3.0f, 4.65f, -0.17f), Vec3(3.4f, 5.75f, 0.17f), vcol(0.05f, 0.05f, 0.055f));
  p.box(Vec3(2.95f, 5.45f, -0.22f), Vec3(3.45f, 5.78f, -0.15f), vcol(0.05f, 0.05f, 0.055f)); poleMesh = uploadMesh(g, p);
  for (int i = 0; i < 3; i++) { MeshData l; float y = 5.45f - i * 0.36f; l.box(Vec3(3.07f, y - 0.14f, -0.22f), Vec3(3.33f, y + 0.14f, -0.17f), vcol(1, 1, 1)); lampMesh[i] = uploadMesh(g, l); }
}
void Traffic::initParked() {
  const double CELL = 90.0; auto key = [&](double x, double z) { return (int64_t)(std::floor(x / CELL) + 1000) * 4096 + (int64_t)(std::floor(z / CELL) + 1000); };
  std::unordered_map<int64_t, std::vector<Circle>> cols; size_t total = 0;
  for (int axis = 0; axis < 2; axis++) for (int k = -N; k <= N; k++) for (int side = -1; side <= 1; side += 2) {
    double off = side * (hw(k) - 1.05); int seedBase = k * 131 + side * 17 + axis * 977;
    for (double t = -CITY_EDGE + 40, slot = 0; t < CITY_EDGE - 40; slot++) {
      double step = 6.3 + 1.2 * hash3(seedBase, (int)slot, 1); t += step; int j = (int)std::lround(t / SP); if (std::fabs(t - j * SP) < hw(j) + 8.5) continue;
      if (hash3(seedBase, (int)slot, 2) > (isBlvd(k) ? 0.35 : 0.6)) continue;
      double r = hash3(seedBase, (int)slot, 3); int type = r < 0.35 ? TK_SALOON : r < 0.6 ? TK_SUV : r < 0.85 ? TK_HATCH : TK_PICKUP;
      double x = axis == 0 ? k * SP + off + (hash3(seedBase, (int)slot, 4) - 0.5) * 0.25 : t, z = axis == 0 ? t : k * SP + off + (hash3(seedBase, (int)slot, 4) - 0.5) * 0.25;
      double yaw = (axis == 0 ? (side > 0 ? PI : 0.0) : (side > 0 ? PI / 2 : -PI / 2)) + (hash3(seedBase, (int)slot, 5) - 0.5) * 0.06;
      Parked p = { (float)x, (float)z, (float)yaw, (uint8_t)type, (uint8_t)(hash3(seedBase, (int)slot, 6) * 11.99) }; int64_t kk = key(x, z); parked[kk].push_back(p); total++;
      const CarMesh& m = models->traffic[type]; double fx = std::sin(yaw), fz = std::cos(yaw); for (double o : { -m.len * 0.28, m.len * 0.28 }) cols[(int64_t)(std::floor(x / 360.0) + 100) * 1000 + (int64_t)(std::floor(z / 360.0) + 100)].push_back({ (float)(x + fx * o), (float)(z + fz * o), (float)m.rad });
    }
  }
  for (auto& [kk, v] : cols) addColliders(8000000 + kk, v);
  logf("parked cars: %zu", total);
}
void Traffic::assignType(TCar& c, double r) {
  int t = r < 0.07 ? TK_TRUCK : r < 0.1 ? TK_BUS : r < 0.2 ? TK_PICKUP : (int)(rnd() * 3); c.type = t; const CarMesh& m = models->traffic[t]; c.len = m.len; c.mass = m.mass; c.rad = m.rad;
}
void Traffic::setDensity(int level, const Pose& player) {
  density = std::max(0, std::min(3, level)); size_t n = (size_t)COUNTS[density];
  while (cars.size() > n) cars.pop_back();
  while (cars.size() < n) {
    cars.emplace_back(); TCar& c = cars.back(); const float* col = PALETTE[(int)(rnd() * 12) % 12]; std::memcpy(c.color, col, sizeof c.color);
    assignType(c, rnd()); spawn(c, player, 30, 520, true);
  }
}

// --- Road graph -----------------------------------------------------------------------------------------------------------
Traffic::Edge Traffic::edgeInfo(const int a[2], const int b[2]) const {
  bool alongZ = a[0] == b[0]; Edge e; e.k = alongZ ? a[0] : a[1];
  e.dx = alongZ ? 0 : (b[0] > a[0] ? 1 : -1); e.dz = alongZ ? (b[1] > a[1] ? 1 : -1) : 0; e.rx = -e.dz; e.rz = e.dx;
  e.crossA = alongZ ? hw(a[1]) : hw(a[0]); e.crossB = alongZ ? hw(b[1]) : hw(b[0]); return e;
}
void Traffic::lanePoints(const int a[2], const int b[2], int lane, TCar::Pt& p0, TCar::Pt& p1, Edge& e) const {
  e = edgeInfo(a, b); double off = laneOffset(e.k, lane), ax = a[0] * SP, az = a[1] * SP, bx = b[0] * SP, bz = b[1] * SP;
  p0 = { ax + e.dx * (e.crossA + 7) + e.rx * off, az + e.dz * (e.crossA + 7) + e.rz * off, 0 };
  p1 = { bx - e.dx * (e.crossB + 7) + e.rx * off, bz - e.dz * (e.crossB + 7) + e.rz * off, 0 };
}
void Traffic::pickNext(const int from[2], const int to[2], int out[2]) {
  std::vector<std::array<int, 2>> opts; const int D[4][2] = { {1, 0}, {-1, 0}, {0, 1}, {0, -1} };
  for (auto& d : D) { int i = to[0] + d[0], j = to[1] + d[1]; if (std::abs(i) <= N && std::abs(j) <= N && (i != from[0] || j != from[1])) opts.push_back({ i, j }); }
  int d0[2] = { to[0] - from[0], to[1] - from[1] };
  for (auto& o : opts) if (o[0] - to[0] == d0[0] && o[1] - to[1] == d0[1] && rnd() < 0.55) { out[0] = o[0]; out[1] = o[1]; return; }
  auto& o = opts[std::min(opts.size() - 1, (size_t)(rnd() * opts.size()))]; out[0] = o[0]; out[1] = o[1];
}
void Traffic::buildPath(TCar& c, const int from[2], const int to[2], int lane) {
  Edge e0 = edgeInfo(from, to); int nl = laneCount(e0.k); lane = std::max(0, std::min(lane, nl - 1));
  int next[2]; pickNext(from, to, next);
  TCar::Pt p0, p1, q0; Edge e1; lanePoints(from, to, lane, p0, p1, e1); Edge e2 = edgeInfo(to, next);
  bool straight = e1.dx == e2.dx && e1.dz == e2.dz; int nl2 = laneCount(e2.k);
  bool turnRight = !straight && (e1.rx * e2.dx + e1.rz * e2.dz) > 0;                       // right turns end in the outer lane, left turns in the inner one
  int lane2 = straight ? std::max(0, std::min(lane, nl2 - 1)) : turnRight ? nl2 - 1 : 0; TCar::Pt tmp; Edge tmpE; lanePoints(to, next, lane2, q0, tmp, tmpE);
  std::vector<TCar::Pt> pts = { p0, p1 };
  TCar::Pt ctrl = straight ? TCar::Pt{ (p1.x + q0.x) / 2, (p1.z + q0.z) / 2, 0 } : (e1.dz != 0 ? TCar::Pt{ p1.x, q0.z, 0 } : TCar::Pt{ q0.x, p1.z, 0 });
  for (int k = 1; k <= 10; k++) { double t = k / 10.0, u = 1 - t; pts.push_back({ u * u * p1.x + 2 * u * t * ctrl.x + t * t * q0.x, u * u * p1.z + 2 * u * t * ctrl.z + t * t * q0.z, 0 }); }
  std::vector<double> cum = { 0 }; for (size_t k = 1; k < pts.size(); k++) cum.push_back(cum[k - 1] + std::hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
  c.axis = e1.dz != 0 ? 'Z' : 'X'; std::memcpy(c.from, from, sizeof c.from); std::memcpy(c.to, to, sizeof c.to); std::memcpy(c.next, next, sizeof c.next);
  c.lane = lane2; c.pts = pts; c.cum = cum; c.total = cum.back(); c.straightLen = cum[1]; c.turning = !straight; c.s = 0; c.blvd = isBlvd(e1.k); c.hwy = false;
}

// --- Spawning -------------------------------------------------------------------------------------------------------------
void Traffic::spawnHwy(TCar& c, const Pose& player, double minD, double maxD, bool initial) {
  struct Cand { const Road* R; int k; }; std::vector<Cand> cands;
  for (const Road& R : ROADS) {
    if (R.kind != ROAD_MOTORWAY) continue; int n = (int)R.x.size();
    for (int i = 0; i < n - 130; i += 6) { double d = std::hypot(R.x[i] - player.x, R.z[i] - player.z); if (d > minD && d < maxD) cands.push_back({ &R, i }); }
    for (int i = 130; i < n; i += 6) { double d = std::hypot(R.x[i] - player.x, R.z[i] - player.z); if (d > minD && d < maxD) cands.push_back({ &R, -i }); }
  }
  if (cands.empty()) { c.mode = TCar::DRIVE; c.hwy = true; c.pts = { { 1e5, 1e5, 0 }, { 1e5, 1e5 + 50, 0 } }; c.cum = { 0, 50 }; c.total = c.straightLen = 50; c.s = 0; c.speed = c.vmax = 0; c.haveH = false; place(c); return; }
  const Cand& cd = cands[std::min(cands.size() - 1, (size_t)(rnd() * cands.size()))]; const Road& R = *cd.R; int dir = cd.k >= 0 ? 1 : -1, i0 = std::abs(cd.k), lane = rnd() < 0.5 ? 0 : 1; double off = (lane ? 7.0 : 3.4) * dir;
  std::vector<TCar::Pt> pts; int n = 120, last = (int)R.x.size() - 2;
  for (int q = 0; q < n; q++) {
    int i = std::max(1, std::min(i0 + q * dir, last)); double tx = R.x[i + 1] - R.x[i - 1], tz = R.z[i + 1] - R.z[i - 1], l = std::hypot(tx, tz); if (l < 1e-9) l = 1; tx /= l; tz /= l;
    pts.push_back({ R.x[i] - tz * off, R.z[i] + tx * off, R.y[i] + R.lift });
  }
  std::vector<double> cum = { 0 }; for (int q = 1; q < n; q++) cum.push_back(cum[q - 1] + std::hypot(pts[q].x - pts[q - 1].x, pts[q].z - pts[q - 1].z));
  double r = rnd(); int type = r < 0.18 ? TK_TRUCK : r < 0.22 ? TK_BUS : r < 0.4 ? TK_PICKUP : r < 0.6 ? TK_SUV : (int)(rnd() * 3);
  c.type = type; c.len = models->traffic[type].len; c.mass = models->traffic[type].mass; c.rad = models->traffic[type].rad; c.hwy = true; c.pts = pts; c.cum = cum; c.total = c.straightLen = cum.back(); c.turning = false; c.s = initial ? rnd() * 300 : 0;
  c.blvd = true; c.mode = TCar::DRIVE; c.wait = 0; c.knockT = 0; c.hp = 100; c.burn = 0; c.speed = 24; c.vmax = (type >= TK_TRUCK ? 21 : 29 + rnd() * 8) * (0.9 + rnd() * 0.2); c.haveH = false; place(c);
}
void Traffic::spawn(TCar& c, const Pose& player, double minD, double maxD, bool initial) {
  if (std::fabs(player.x) > CITY_EDGE + 150 || std::fabs(player.z) > CITY_EDGE + 150) { spawnHwy(c, player, minD, maxD, initial); return; }
  if (c.hwy || c.mode == TCar::WRECK) { c.hwy = false; assignType(c, rnd()); c.haveH = false; }
  for (int tries = 0; tries < 40; tries++) {
    int i = std::max(-N, std::min(N, (int)std::lround(player.x / SP) + (int)std::floor(rnd() * 9) - 4)), j = std::max(-N, std::min(N, (int)std::lround(player.z / SP) + (int)std::floor(rnd() * 9) - 4));
    const int D[4][2] = { {1, 0}, {-1, 0}, {0, 1}, {0, -1} }; std::vector<std::array<int, 2>> nb; for (auto& d : D) if (std::abs(i + d[0]) <= N && std::abs(j + d[1]) <= N) nb.push_back({ i + d[0], j + d[1] });
    auto& to = nb[std::min(nb.size() - 1, (size_t)(rnd() * nb.size()))]; int lane = (int)(rnd() * 3), from[2] = { i, j };
    buildPath(c, from, to.data(), lane); c.s = rnd() * c.straightLen * 0.9; place(c);
    double d = std::hypot(c.x - player.x, c.z - player.z); if (d < minD || d > maxD) continue;
    bool crowded = false; for (const TCar& o : cars) if (&o != &c && !o.pts.empty() && std::hypot(o.x - c.x, o.z - c.z) < 12) { crowded = true; break; } if (crowded) continue;
    if (!initial) { double fx = std::sin(player.h), fz = std::cos(player.h); if ((c.x - player.x) * fx + (c.z - player.z) * fz < 60) continue; }   // respawns go out of sight, ahead of the player
    break;
  }
  c.mode = TCar::DRIVE; c.speed = c.blvd ? 15 : 10; c.vmax = (c.blvd ? 19 : 13.5) * (0.85 + rnd() * 0.3); c.wait = 0; c.knockT = 0; c.hp = 100; c.burn = 0; c.slip = 0; c.spin = 0;
}
void Traffic::place(TCar& c) {
  size_t k = 1; while (k < c.cum.size() - 1 && c.cum[k] < c.s) k++;
  const TCar::Pt &a = c.pts[k - 1], &b = c.pts[k]; double seg = c.cum[k] - c.cum[k - 1]; if (seg < 1e-9) seg = 1; double t = clampd((c.s - c.cum[k - 1]) / seg, 0, 1);
  c.x = a.x + (b.x - a.x) * t; c.z = a.z + (b.z - a.z) * t; c.y = c.hwy ? a.y + (b.y - a.y) * t : 0;
  double h = std::atan2(b.x - a.x, b.z - a.z); c.h = !c.haveH ? h : c.h + wrapAngle(h - c.h) * 0.5; c.haveH = true;
}
void Traffic::velocityOf(const TCar& c, double v[2]) const {
  if (c.mode != TCar::DRIVE) { v[0] = c.vx; v[1] = c.vz; } else { v[0] = std::sin(c.h) * c.speed; v[1] = std::cos(c.h) * c.speed; }
}
void Traffic::knock(TCar& c, double vx, double vz, double spin) {
  if (c.mode == TCar::DRIVE) { c.mode = TCar::KNOCKED; c.knockT = 0; c.spin = 0; }
  c.vx = vx; c.vz = vz; c.spin += spin;
}
void Traffic::damage(TCar& c, double amount) {
  if (c.mode == TCar::WRECK) return; c.hp -= amount;
  if (c.hp <= 0) { double v[2]; velocityOf(c, v); if (c.mode == TCar::DRIVE) { c.mode = TCar::KNOCKED; c.knockT = 0; c.spin = 0; } c.vx = v[0]; c.vz = v[1]; c.mode = TCar::WRECK; c.burn = 0; }
}

// --- Simulation -------------------------------------------------------------------------------------------------------------
void Traffic::update(double dt, const Pose& player, double clock) {
  Signal sig = signalState(clock); double pf[2] = { std::sin(player.h), std::cos(player.h) };
  for (TCar& c : cars) {
    if (c.mode != TCar::DRIVE) {                                                                          // knocked about, or a burning wreck
      c.x += c.vx * dt; c.z += c.vz * dt; c.h += c.spin * dt; c.y += (groundAt(c.x, c.z).y - c.y) * std::min(1.0, dt * 20);   // sit on whatever ground it ended up on (not sinking into a hill or hovering over a dip)
      double sp = std::hypot(c.vx, c.vz), dec = std::max(0.0, sp - (c.mode == TCar::WRECK ? 11 : 7) * dt) / (sp > 1e-9 ? sp : 1);
      c.vx *= dec; c.vz *= dec; c.spin *= std::exp(-2 * dt);
      if (c.mode == TCar::WRECK) { c.burn += dt; if (c.burn > 30 && std::hypot(c.x - player.x, c.z - player.z) > 80) spawn(c, player, 160, 420); continue; }
      if (sp < 0.3) c.knockT += dt; if (c.knockT > 6 && std::hypot(c.x - player.x, c.z - player.z) > 60) spawn(c, player, 160, 420);
      double dx = c.x, dz = c.z; pushOutStatic(dx, dz, 1.2); c.x = dx; c.z = dz;
      continue;
    }
    double f[2] = { std::sin(c.h), std::cos(c.h) }, r[2] = { -f[1], f[0] }, target = c.vmax, toTurn = c.straightLen - c.s;
    if (c.turning) target = std::min(target, toTurn > 0 ? 7 + toTurn * 0.45 : 7.0);
    auto look = [&](double ox, double oz, double gap) { double dx = ox - c.x, dz = oz - c.z, df = dx * f[0] + dz * f[1], dl = dx * r[0] + dz * r[1]; if (df > 0 && df < 40 && std::fabs(dl) < 2.3) target = std::min(target, std::max(0.0, (df - gap) * 0.8)); };
    look(player.x, player.z, 7.5);
    bool approaching = toTurn > 0 && toTurn < 11, blocked = false;
    for (const TCar& o : cars) {                                                                          // follow the car ahead; wait for cars already crossing the junction
      if (&o == &c) continue; double dx = o.x - c.x, dz = o.z - c.z, d2 = dx * dx + dz * dz; if (d2 > 1600) continue;
      look(o.x, o.z, 7); if (approaching && o.mode == TCar::DRIVE && o.s > o.straightLen && std::fabs(wrapAngle(o.h - c.h)) > 0.4 && d2 < 900) blocked = true;
    }
    if (!c.hwy && toTurn > 0 && toTurn < 40) { char sg = c.axis == 'Z' ? sig.Z : sig.X; if (sg == 'R' || (sg == 'A' && toTurn > 6)) target = std::min(target, std::max(0.0, toTurn - 1) * 0.55); }   // red lights (and amber, if there's room to stop)
    if (blocked && c.wait < 4) { target = std::min(target, std::max(0.0, toTurn - 2) * 0.6); c.wait += dt; } else if (!approaching) c.wait = 0;
    c.speed += clampd(target - c.speed, -8 * dt, 3 * dt); c.speed = std::max(0.0, c.speed); c.s += c.speed * dt;
    if (c.s >= c.total) {
      if (c.hwy) { spawn(c, player, 150, 480); continue; }
      double over = c.s - c.total; int from[2] = { c.to[0], c.to[1] }, to[2] = { c.next[0], c.next[1] }; buildPath(c, from, to, c.lane); c.s = over;
    }
    place(c);
    double dx = c.x - player.x, dz = c.z - player.z, d2 = dx * dx + dz * dz;                              // keep traffic near the player
    if (d2 > 520 * 520 || (d2 > 260 * 260 && dx * pf[0] + dz * pf[1] < -200)) spawn(c, player, 180, 460);
  }
}

// --- Drawing ----------------------------------------------------------------------------------------------------------------
void Traffic::prepare(Gfx& g, const Pose& player, const Frustum& f, double clock) {
  struct L { std::vector<InstanceData> paint, plain; } lists[TK_COUNT];
  const uint32_t neutral = packColor(0.5f, 0.5f, 0.5f);
  for (const TCar& c : cars) {
    if (c.pts.empty()) continue; double dx = c.x - player.x, dz = c.z - player.z, d2 = dx * dx + dz * dz; if (d2 > 450.0 * 450.0) continue;
    if (d2 > 30 * 30 && !f.sphereVisible((float)c.x, (float)c.y + 1, (float)c.z, 5.0f)) continue;
    InstanceData d = { (float)c.x, (float)c.y, (float)c.z, 1.0f, (float)c.h, packColor(c.color[0] * 0.5f, c.color[1] * 0.5f, c.color[2] * 0.5f), 0, 0 };
    if (c.mode == TCar::WRECK) d.color = packColor(0.04f, 0.04f, 0.04f);
    lists[c.type].paint.push_back(d); d.color = neutral; lists[c.type].plain.push_back(d);
  }
  for (int i = 0; i < TK_COUNT; i++) {
    TypeDraw& t = drawList[i]; t.n = (UINT)lists[i].paint.size(); if (!t.n) continue;
    t.paint = g.dynVB(lists[i].paint.data(), t.n * (UINT)sizeof(InstanceData), sizeof(InstanceData)); t.plain = g.dynVB(lists[i].plain.data(), t.n * (UINT)sizeof(InstanceData), sizeof(InstanceData));
  }
  { // Parked cars: the cells within 250 m, the ones in view.
    const double CELL = 90.0; struct PL { std::vector<InstanceData> v; } pl[TK_COUNT]; int cx0 = (int)std::floor((player.x - 250) / CELL), cx1 = (int)std::floor((player.x + 250) / CELL), cz0 = (int)std::floor((player.z - 250) / CELL), cz1 = (int)std::floor((player.z + 250) / CELL);
    for (int cz = cz0; cz <= cz1; cz++) for (int cx = cx0; cx <= cx1; cx++) { auto it = parked.find((int64_t)(cx + 1000) * 4096 + (cz + 1000)); if (it == parked.end()) continue;
      for (const Parked& p : it->second) { double dx = p.x - player.x, dz = p.z - player.z; if (dx * dx + dz * dz > 250.0 * 250.0) continue; if (dx * dx + dz * dz > 30 * 30 && !f.sphereVisible(p.x, 1.0f, p.z, 4.0f)) continue;
        const float* c = PALETTE[p.color]; pl[p.type].v.push_back({ p.x, 0.0f, p.z, 1.0f, p.yaw, packColor(c[0] * 0.5f, c[1] * 0.5f, c[2] * 0.5f), 0, 0 }); } }
    for (int i = 0; i < TK_COUNT; i++) { TypeDraw& t = parkedDraw[i]; t.n = (UINT)pl[i].v.size(); if (t.n) t.paint = g.dynVB(pl[i].v.data(), t.n * (UINT)sizeof(InstanceData), sizeof(InstanceData)); }
  }
  prepareSignals(g, Vec3((float)player.x, 0, (float)player.z), clock);
}
void Traffic::prepareSignals(Gfx& g, const Vec3& cam, double clock) {
  std::vector<InstanceData> poles; std::vector<InstanceData> lamps[3]; Signal sg = signalState(clock);
  int i0 = (int)std::lround(cam.x / SP), j0 = (int)std::lround(cam.z / SP);
  auto lampColour = [](char st, int which) { bool on = (st == 'R' && which == 0) || (st == 'A' && which == 1) || (st == 'G' && which == 2);
    static const float c[3][3] = { {1.0f, 0.06f, 0.04f}, {1.0f, 0.62f, 0.05f}, {0.08f, 1.0f, 0.25f} }; float k = on ? 1.0f : 0.06f; return packColor(c[which][0] * k * 0.5f, c[which][1] * k * 0.5f, c[which][2] * k * 0.5f); };
  for (int j = std::max(-N, j0 - 2); j <= std::min(N, j0 + 2); j++) for (int i = std::max(-N, i0 - 2); i <= std::min(N, i0 + 2); i++) {
    double a = hw(i) + 1.6, b = hw(j) + 1.6, cx = i * SP, cz = j * SP;
    struct S { double dx, dz, yaw; char st; } sl[4] = { { a, -b, PI, sg.Z }, { -a, b, 0, sg.Z }, { a, b, PI / 2, sg.X }, { -a, -b, -PI / 2, sg.X } };
    for (const S& s : sl) {
      InstanceData d = { (float)(cx + s.dx), 0, (float)(cz + s.dz), 1.0f, (float)s.yaw, packColor(0.5f, 0.5f, 0.5f), 0, 0 }; poles.push_back(d);
      for (int w = 0; w < 3; w++) { d.color = lampColour(s.st, w); lamps[w].push_back(d); }
    }
  }
  sigPole.n = (UINT)poles.size(); if (sigPole.n) { sigPole.paint = g.dynVB(poles.data(), sigPole.n * (UINT)sizeof(InstanceData), sizeof(InstanceData)); for (int w = 0; w < 3; w++) sigLamp[w].paint = g.dynVB(lamps[w].data(), sigPole.n * (UINT)sizeof(InstanceData), sizeof(InstanceData)); }
}
void Traffic::draw(Renderer& r, bool shadow) {
  Material paint; paint.type = 1; Material head; head.type = 4; head.emissive = 3.0f; Material tail; tail.type = 4; tail.emissive = 1.8f;
  for (int i = 0; i < TK_COUNT; i++) {
    const TypeDraw& t = drawList[i]; if (!t.n) continue; const CarMesh& m = models->traffic[i];
    r.drawMeshInst(m.body, paint, t.paint, t.n);
    if (!shadow) { r.drawMeshInst(m.head, head, t.plain, t.n); r.drawMeshInst(m.tail, tail, t.plain, t.n); }
  }
  for (int i = 0; i < TK_COUNT; i++) { const TypeDraw& t = parkedDraw[i]; if (t.n) r.drawMeshInst(models->traffic[i].body, paint, t.paint, t.n); }
  if (sigPole.n) {
    Material metal; metal.type = 0; metal.rough = 0.5f; metal.metal = 0.5f; r.drawMeshInst(poleMesh, metal, sigPole.paint, sigPole.n);
    if (!shadow) { Material lamp; lamp.type = 4; lamp.emissive = 5.0f; for (int w = 0; w < 3; w++) r.drawMeshInst(lampMesh[w], lamp, sigLamp[w].paint, sigPole.n); }
  }
}

// --- The player against traffic ---------------------------------------------------------------------------------------------------
void collideTraffic(Vehicle& car, Traffic& traffic, const HitFn& onHit) {
  static const double CIR[3] = { -1.45, 0, 1.45 }; const double RAD = 1.0; double f[2] = { std::sin(car.h), std::cos(car.h) };
  for (TCar& t : traffic.cars) {
    if (!t.active || t.pts.empty()) continue; double dx0 = t.x - car.x, dz0 = t.z - car.z; if (dx0 * dx0 + dz0 * dz0 > 100) continue;
    double tf[2] = { std::sin(t.h), std::cos(t.h) };
    for (double off : CIR) {
      double cx = car.x + f[0] * off, cz = car.z + f[1] * off, mt = t.mode == TCar::WRECK ? t.mass * 1.6 : t.mass; std::vector<double> offs = t.len > 6.5 ? std::vector<double>{ -t.len * 0.34, 0, t.len * 0.34 } : std::vector<double>{ -t.len * 0.28, t.len * 0.28 };
      for (double toff : offs) {
        double ox = t.x + tf[0] * toff, oz = t.z + tf[1] * toff, dx = cx - ox, dz = cz - oz, dist = std::hypot(dx, dz), r = RAD + t.rad; if (dist >= r || dist < 1e-5) continue;
        double nx = dx / dist, nz = dz / dist, pen = r - dist, share = mt / (mt + car.s.mass);       // split the push between both cars by mass
        car.x += nx * pen * share; car.z += nz * pen * share; t.x -= nx * pen * (1 - share); t.z -= nz * pen * (1 - share);
        double tv[2]; traffic.velocityOf(t, tv); double j = applyImpulse(car, ox + nx * t.rad, oz + nz * t.rad, nx, nz, 0.2, 0.2, &onHit, 1 / mt, tv);
        if (j > 0) { traffic.knock(t, tv[0] - nx * j / mt, tv[1] - nz * j / mt, ((double)rand() / RAND_MAX - 0.5) * j / (mt * 2)); traffic.damage(t, j / 600.0); }
      }
    }
  }
}
