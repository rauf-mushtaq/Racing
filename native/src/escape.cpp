#include "escape.h"
#include "shapes.h"
using namespace grid;

static const double EDGE_ = CITY_EDGE;
static bool inCity(double x, double z, double m = 60) { return std::fabs(x) < EDGE_ + m && std::fabs(z) < EDGE_ + m; }
static double wrapPi(double a) { return wrapAngle(a); }

void PoliceChase::init(Gfx& g, const VehicleModels* v) {
  vm = v;
  { MeshData m; m.lathe({ { -0.34f, 0.0f }, { -0.3f, 0.2f }, { 0.0f, 0.3f }, { 0.3f, 0.2f }, { 0.34f, 0.0f } }, 20, packColor(0.06f, 0.06f, 0.065f)); m.cylinder(Vec3(-0.25f, 0.28f, 0), Vec3(0.25f, 0.28f, 0), 0.03f, 0.03f, 8, packColor(0.2f, 0.2f, 0.2f)); bombMesh = uploadMesh(g, m);
    MeshData l; l.lathe({ { 0.0f, 0.0f }, { 0.04f, 0.06f }, { 0.0f, 0.1f } }, 10, packColor(1, 1, 1)); l.transform(translation(0, 0.3f, 0)); bombLight = uploadMesh(g, l); }
  { MeshData m; uint32_t k = packColor(0.75f, 0.76f, 0.8f); m.lathe({ { -1.0f, 0.0f }, { -1.0f, 0.11f }, { 0.4f, 0.12f }, { 0.9f, 0.07f }, { 1.1f, 0.0f } }, 14, k);
    for (int i = 0; i < 4; i++) { MeshData f; f.box(Vec3(-1.0f, 0.1f, -0.01f), Vec3(-0.7f, 0.32f, 0.01f), packColor(0.9f, 0.1f, 0.05f)); Mat4 r = rotationX((float)(i * PI / 2)); m.append(f, &r); } missileMesh = uploadMesh(g, m); }
  { MeshData m; std::vector<std::vector<Vec3>> rings; for (int k = 0; k < 2; k++) { std::vector<Vec3> r; for (int i = 0; i < 32; i++) { float a = (float)(2 * PI * i / 32); r.push_back(Vec3(std::cos(a) * 1.0f, k * 0.02f, std::sin(a) * 1.0f)); } rings.push_back(r); } m.loft(rings, packColor(0.015f, 0.014f, 0.016f), true, true); oilMesh = uploadMesh(g, m); }
}
Vec3 PoliceChase::muzzlePos(const Vehicle& v, int side) {
  double fx = std::sin(v.h), fz = std::cos(v.h), lx = std::cos(v.h), lz = -std::sin(v.h);   // forward, and the car's left
  return Vec3((float)(v.x + fx * 2.46 + lx * side * 0.42), (float)(v.bodyY() + 0.55), (float)(v.z + fz * 2.46 + lz * side * 0.42));
}
int PoliceChase::desiredCops() const { static const int N[6] = { 0, 3, 4, 6, 8, 10 }; return N[stars()]; }

void PoliceChase::start(Vehicle& p, Traffic&, Fx&) {
  result = RUNNING; health = 100; heat = 2.0; time = 0; hidden = 0; nearest = 1e9; shake = damageFlash = bustT = 0; ammoMissile = 6; ammoBomb = 4; kills = civilians = 0; maxStars = 2; spotted = true;
  gunHeat = cdOil = cdSmoke = cdShield = shieldT = gunOut = 0; jammed = false; cops.clear(); missiles.clear(); bombs.clear(); oils.clear(); smokes.clear(); messages.clear();
  lastSeenX = p.x; lastSeenZ = p.z; spawnT = 0; fireT = regenMissile = regenBomb = endT = 0; wasSpotted = true; lastStars = 2; hiddenNeeded = 13;
  for (int i = 0; i < 3; i++) spawnCop(p, 0, true);
  messages.push_back("THE POLICE ARE ON YOU");
}

// --- Seeing ---------------------------------------------------------------------------------------------------------------
bool PoliceChase::smokeBlocks(double ax, double az, double bx, double bz) const {
  for (const Zone& s : smokes) {
    double dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 > 1e-6 ? clampd(((s.x - ax) * dx + (s.z - az) * dz) / l2, 0, 1) : 0, cx = ax + dx * t, cz = az + dz * t;
    double r = s.r * clampd(s.age < 1.5 ? s.age / 1.5 : (s.life - s.age) / 3.0, 0, 1); if ((s.x - cx) * (s.x - cx) + (s.z - cz) * (s.z - cz) < r * r) return true;
  }
  return false;
}
bool PoliceChase::canSee(double ax, double az, double bx, double bz, double maxDist) const {
  double dx = bx - ax, dz = bz - az, d = std::hypot(dx, dz); if (d > maxDist) return false; if (d < 6) return true;
  if (raycastStatic(ax, az, dx, dz, d) < d - 3) return false;
  double ya = groundAt(ax, az).y + 1.4, yb = groundAt(bx, bz).y + 1.4;
  for (double t = 20; t < d - 10; t += 20) { double px = ax + dx * t / d, pz = az + dz * t / d; if (heightAt(px, pz) > ya + (yb - ya) * t / d + 0.5) return false; }
  return !smokeBlocks(ax, az, bx, bz);
}

// --- Spawning ----------------------------------------------------------------------------------------------------------------
void PoliceChase::spawnCop(const Vehicle& p, int kind, bool farAway) {
  Cop c; c.kind = kind; const CarMesh& m = kind ? vm->swat : vm->cruiser; c.len = m.len; c.rad = m.rad; c.mass = kind ? 2700 : 1750; c.hp = c.maxHp = kind ? 260 : 100; c.flash = rnd();
  c.vmax = (kind ? 47.0 : 50.0 + stars() * 2.2) * (0.94 + rnd() * 0.12); double fx = std::sin(p.h), fz = std::cos(p.h), best = -1e9, bx = p.x, bz = p.z;
  for (int tries = 0; tries < 24; tries++) {
    double x, z; double minD = farAway ? 260 : 150, maxD = farAway ? 380 : 260;
    if (inCity(p.x, p.z, 120)) {
      int pi = (int)std::lround(p.x / SP), pj = (int)std::lround(p.z / SP); int ni = std::max(-N, std::min(N, pi + (int)(rnd() * 11) - 5)), nj = std::max(-N, std::min(N, pj + (int)(rnd() * 11) - 5));
      x = ni * SP + (rnd() < 0.5 ? 0 : (rnd() - 0.5) * 2 * (hw(ni) - 4)); z = nj * SP; if (rnd() < 0.5) { x = ni * SP; z = nj * SP + (rnd() - 0.5) * SP * 0.7; }   // on a road: junction or along a street
      if (std::fabs(x - ni * SP) > 1 && std::fabs(z - nj * SP) > 1) x = ni * SP;
    } else {
      const Road* R = nullptr; int bi = -1; double a = rnd() * 6.2832; x = p.x + std::sin(a) * (minD + rnd() * 100); z = p.z + std::cos(a) * (minD + rnd() * 100);
      double bd = 1e18; for (const Road& r : ROADS) if (r.kind == ROAD_MOTORWAY) for (int i = 0; i < (int)r.x.size(); i += 4) { double d = (r.x[i] - x) * (r.x[i] - x) + (r.z[i] - z) * (r.z[i] - z); if (d < bd) { bd = d; R = &r; bi = i; } }
      if (R && bd < 150.0 * 150.0) { x = R->x[bi]; z = R->z[bi]; }
      if (x < coastX(z) + 90) continue;
    }
    double d = std::hypot(x - p.x, z - p.z); if (d < minD || d > maxD + 60) continue;
    double score = -std::fabs(d - (minD + 40)) - ((x - p.x) * fx + (z - p.z) * fz > 30 ? 120 : 0) + (canSee(x, z, p.x, p.z, 400) ? -150 : 0);   // out of sight, behind or beside the player
    if (score > best) { best = score; bx = x; bz = z; }
  }
  c.x = bx; c.z = bz; c.y = groundAt(bx, bz).y; c.h = std::atan2(p.x - bx, p.z - bz); c.speed = 12; cops.push_back(c);
}

// --- Navigation -----------------------------------------------------------------------------------------------------------------
void PoliceChase::navTarget(const Cop& c, double gx, double gz, double& tx, double& tz) const {
  if (!inCity(c.x, c.z, 20) || !inCity(gx, gz, 400)) { tx = gx; tz = gz; return; }
  int ci = (int)std::lround(c.x / SP), cj = (int)std::lround(c.z / SP); ci = std::max(-N, std::min(N, ci)); cj = std::max(-N, std::min(N, cj));
  int gi = std::max(-N, std::min(N, (int)std::lround(gx / SP))), gj = std::max(-N, std::min(N, (int)std::lround(gz / SP)));
  double offX = std::fabs(c.x - ci * SP), offZ = std::fabs(c.z - cj * SP); bool inJ = offX < hw(ci) + 4 && offZ < hw(cj) + 4;
  double fx = std::sin(c.h), fz = std::cos(c.h); int ni = ci, nj = cj;
  if (inJ) {                                                                                       // at a junction: turn towards the goal (the longer way first)
    int di = gi - ci, dj = gj - cj; if (di == 0 && dj == 0) { tx = gx; tz = gz; return; }
    bool alongX = std::abs(di) > std::abs(dj) || (std::abs(di) == std::abs(dj) && std::fabs(fx) > std::fabs(fz));
    if (alongX && di != 0) ni = ci + (di > 0 ? 1 : -1); else if (dj != 0) nj = cj + (dj > 0 ? 1 : -1); else ni = ci + (di > 0 ? 1 : -1);
  } else if (offX <= offZ) {                                                                       // on a street along z: head for the next junction in the direction of travel
    nj = fz >= 0 ? (int)std::ceil(c.z / SP) : (int)std::floor(c.z / SP); if (nj == cj && std::fabs(c.z - cj * SP) < SP * 0.5) nj = cj + (fz >= 0 ? 1 : -1); ni = ci;
    if (gi == ci && (gz - c.z) * fz < 0 && std::fabs(gz - c.z) > 30) nj = fz >= 0 ? (int)std::floor(c.z / SP) : (int)std::ceil(c.z / SP);   // the goal is behind us on this street: turn round at the next junction anyway
  } else {
    ni = fx >= 0 ? (int)std::ceil(c.x / SP) : (int)std::floor(c.x / SP); if (ni == ci && std::fabs(c.x - ci * SP) < SP * 0.5) ni = ci + (fx >= 0 ? 1 : -1); nj = cj;
  }
  ni = std::max(-N, std::min(N, ni)); nj = std::max(-N, std::min(N, nj)); tx = ni * SP; tz = nj * SP;
}

// --- A cop driving ---------------------------------------------------------------------------------------------------------------
void PoliceChase::damageCop(Cop& c, double amount, Fx& fx) {
  if (c.wreck) return; c.hp -= amount;
  if (c.hp <= 0) { c.wreck = true; c.burn = 0; c.speed *= 0.4; kills++; heat = std::min(5.99, heat + 0.35); messages.push_back(c.kind ? "PURSUIT TRUCK DOWN" : "CRUISER DOWN"); fx.explosion(Vec3((float)c.x, (float)c.y, (float)c.z), 0.7f); c.vy = 5; c.air = true; c.rollRate = (rnd() - 0.5) * 8; }
}
void PoliceChase::updateCop(Cop& c, double dt, Vehicle& player, Traffic& traffic, Fx& fx, double gx, double gz, bool chase) {
  double gy = groundAt(c.x, c.z).y;
  if (c.wreck) {                                                                                  // a burning heap that slides to a stop
    c.burn += dt; c.x += c.vx * dt; c.z += c.vz * dt; c.h += c.spin * dt; double k = std::exp(-1.8 * dt); c.vx *= k; c.vz *= k; c.spin *= k; c.speed = 0;
    if (c.air) { c.vy -= 18 * dt; c.y += c.vy * dt; c.roll += c.rollRate * dt; if (c.y <= gy) { c.y = gy; c.air = false; c.roll = clampd(c.roll, -0.35, 0.35); c.vx *= 0.5; c.vz *= 0.5; } } else c.y = gy;
    if (c.burn < 22) fx.burn(Vec3((float)c.x, (float)c.y, (float)c.z), (float)dt); return;
  }
  if (c.air) {                                                                                    // thrown by an explosion
    c.vy -= 18 * dt; c.y += c.vy * dt; c.x += c.vx * dt; c.z += c.vz * dt; c.h += c.spin * dt; c.roll += c.rollRate * dt;
    if (c.y <= gy) { c.y = gy; c.air = false; if (c.vy < -6) damageCop(c, -c.vy * 3.5, fx); c.vy = 0; c.roll *= 0.2; c.speed *= 0.4; }
    return;
  }
  c.y = gy; c.pitch *= std::exp(-4 * dt); c.roll *= std::exp(-4 * dt);
  // Where to drive: the goal, along the roads when something is in the way.
  double dx = gx - c.x, dz = gz - c.z, dist = std::hypot(dx, dz), tx = gx, tz = gz;
  bool direct = dist < 22 || (canSee(c.x, c.z, gx, gz, 150) && raycastStatic(c.x, c.z, dx, dz, dist) >= dist - 2);
  if (!direct) navTarget(c, gx, gz, tx, tz);
  double desired = std::atan2(tx - c.x, tz - c.z), speedT = c.vmax;
  // Whiskers: look ahead for buildings, trees and barriers and steer into the gap.
  double look = 10 + c.speed * 0.55, fx_ = std::sin(c.h), fz_ = std::cos(c.h);
  double dC = raycastStatic(c.x, c.z, fx_, fz_, look), dL = raycastStatic(c.x, c.z, std::sin(c.h - 0.5), std::cos(c.h - 0.5), look * 0.8), dR = raycastStatic(c.x, c.z, std::sin(c.h + 0.5), std::cos(c.h + 0.5), look * 0.8);
  if (dC < look) { double side = dR > dL ? 1.0 : -1.0; desired = c.h + side * (0.5 + 0.9 * (1 - dC / look)); speedT = std::min(speedT, 6 + dC * 1.6); }
  else if (dL < look * 0.5) desired = c.h + 0.35; else if (dR < look * 0.5) desired = c.h - 0.35;
  // Traffic and other cops: slow for what is directly ahead, and ease away from it.
  for (const TCar& t : traffic.cars) {
    if (t.pts.empty()) continue; double ox = t.x - c.x, oz = t.z - c.z, d2 = ox * ox + oz * oz; if (d2 > 30 * 30) continue;
    double df = ox * fx_ + oz * fz_, dl = ox * fz_ - oz * fx_; if (df > 0 && df < 24 && std::fabs(dl) < 2.6) { speedT = std::min(speedT, std::max(5.0, df * 1.4)); desired -= (dl >= 0 ? -1 : 1) * 0.35; }
  }
  for (const Cop& o : cops) { if (&o == &c) continue; double ox = o.x - c.x, oz = o.z - c.z, d2 = ox * ox + oz * oz; if (d2 > 14 * 14) continue; double dl = ox * fz_ - oz * fx_, df = ox * fx_ + oz * fz_; if (df > -3 && std::fabs(dl) < 3.2) desired += (dl >= 0 ? -1 : 1) * 0.25; }
  double err = wrapPi(desired - c.h); speedT *= clampd(1.15 - std::fabs(err) / 1.5, 0.3, 1.0);
  if (chase && dist < 30 && player.speed() > 3) speedT = std::max(speedT, player.speed() * 1.08);    // close in on the player and ram
  if (!chase && dist < 40) speedT = std::min(speedT, 14.0);                                             // reached the last known position: ease off and look around
  if (c.slip > 0) { c.slip -= dt; speedT = std::min(speedT, 4.0); err += std::sin(time * 14 + c.flash * 9) * 1.4; c.spin = 3.6 * (c.flash > 0.5 ? 1 : -1); }
  else c.spin = 0;
  double maxYaw = 2.3 / (1 + c.speed / 16), turn = clampd(err * 4.0, -maxYaw, maxYaw); c.h += turn * dt + c.spin * dt; c.roll += turn * c.speed * 0.0016 * dt * 20;
  c.speed += clampd(speedT - c.speed, -26 * dt, (c.kind ? 9.0 : 12.0) * dt); if (c.speed < 0) c.speed = 0;
  double sx = std::sin(c.h) * c.speed + c.vx, sz = std::cos(c.h) * c.speed + c.vz; c.x += sx * dt; c.z += sz * dt; double k = std::exp(-3.0 * dt); c.vx *= k; c.vz *= k;
  // The static world: push out of buildings, trees and barriers, scrub speed.
  static const double OFFS[3] = { 1.4, 0, -1.4 }; double ox0 = c.x, oz0 = c.z;
  for (double off : OFFS) { double px = c.x + std::sin(c.h) * off, pz = c.z + std::cos(c.h) * off, nx, nz; if (pushOutStatic(px, pz, 1.0, &nx, &nz)) { c.x = px - std::sin(c.h) * off; c.z = pz - std::cos(c.h) * off; double into = std::fabs(nx * std::sin(c.h) + nz * std::cos(c.h)); if (c.speed > 10) damageCop(c, (c.speed - 10) * into * 0.35 * dt * 6, fx); c.speed *= 1.0 - 0.9 * into * std::min(1.0, dt * 6); } }
  if (c.x < coastX(c.z) + 70) { c.x = coastX(c.z) + 70; c.speed *= 0.7; }
  c.stuck = (std::hypot(c.x - ox0, c.z - oz0) < 0.25 * dt * 10 && dist > 40) ? c.stuck + dt : std::max(0.0, c.stuck - dt);
  // Cars in the way get shoved aside (and the cop is slowed).
  for (TCar& t : traffic.cars) {
    if (t.pts.empty() || t.mode == TCar::WRECK) continue; double ox = t.x - c.x, oz = t.z - c.z; if (ox * ox + oz * oz > 36) continue;
    double tf[2] = { std::sin(t.h), std::cos(t.h) };
    for (double co : { -1.2, 1.2 }) for (double to : { -t.len * 0.28, t.len * 0.28 }) {
      double cx = c.x + std::sin(c.h) * co, cz = c.z + std::cos(c.h) * co, qx = t.x + tf[0] * to, qz = t.z + tf[1] * to, ddx = cx - qx, ddz = cz - qz, d = std::hypot(ddx, ddz), r = c.rad + t.rad; if (d >= r || d < 1e-5) continue;
      double nx = ddx / d, nz = ddz / d, pen = r - d, share = t.mass / (t.mass + c.mass); c.x += nx * pen * share; c.z += nz * pen * share; t.x -= nx * pen * (1 - share); t.z -= nz * pen * (1 - share);
      double tv[2]; traffic.velocityOf(t, tv); double rel = std::max(0.0, c.speed - (tv[0] * std::sin(c.h) + tv[1] * std::cos(c.h))); c.speed *= 0.85;
      traffic.knock(t, tv[0] - nx * rel * c.mass / (c.mass + t.mass) * 0.9, tv[1] - nz * rel * c.mass / (c.mass + t.mass) * 0.9, (rnd() - 0.5) * rel * 0.15); traffic.damage(t, rel * 0.6); damageCop(c, rel * 0.25 * t.mass / 2500, fx);
    }
  }
  // Oil.
  for (const Zone& o : oils) { double ox = c.x - o.x, oz = c.z - o.z; if (ox * ox + oz * oz < o.r * o.r && c.speed > 7 && c.slip <= 0) { c.slip = 1.7; fx.smoke(Vec3((float)c.x, (float)c.y + 0.3f, (float)c.z), Vec3(0, 0.5f, 0), 1.2f, 1.2f, 0.4f, 0.35f); } }
}

// --- The cops against the player ------------------------------------------------------------------------------------------------------
void PoliceChase::collidePlayer(Vehicle& car, const HitFn&) {
  static const double CIR[3] = { -1.45, 0, 1.45 }; const double RAD = 1.0; double f[2] = { std::sin(car.h), std::cos(car.h) };
  for (Cop& c : cops) {
    double dx0 = c.x - car.x, dz0 = c.z - car.z; if (dx0 * dx0 + dz0 * dz0 > 100) continue; double cf[2] = { std::sin(c.h), std::cos(c.h) };
    for (double off : CIR) for (double co : { -c.len * 0.3, 0.0, c.len * 0.3 }) {
      double px = car.x + f[0] * off, pz = car.z + f[1] * off, ox = c.x + cf[0] * co, oz = c.z + cf[1] * co, dx = px - ox, dz = pz - oz, dist = std::hypot(dx, dz), r = RAD + c.rad; if (dist >= r || dist < 1e-5) continue;
      double nx = dx / dist, nz = dz / dist, pen = r - dist, mt = c.wreck ? c.mass * 1.8 : c.mass, share = mt / (mt + car.s.mass); car.x += nx * pen * share; car.z += nz * pen * share; c.x -= nx * pen * (1 - share); c.z -= nz * pen * (1 - share);
      double cv[2] = { cf[0] * c.speed + c.vx, cf[1] * c.speed + c.vz }; double j = applyImpulse(car, ox + nx * c.rad, oz + nz * c.rad, nx, nz, 0.25, 0.2, nullptr, 1 / mt, cv);
      if (j > 0) {
        double dv = j / car.s.mass; c.vx -= nx * j / mt; c.vz -= nz * j / mt; c.speed *= 0.75; c.spin += (rnd() - 0.5) * j / mt * 0.6; if (dv > 2) c.roll += (rnd() - 0.5) * 0.3;
        double dmg = std::max(0.0, dv - 3.0) * 0.9 * (shieldT > 0 ? 0.2 : 1.0); health -= dmg; damageFlash = std::min(1.0, damageFlash + dmg * 0.04); shake = std::min(1.0, shake + dv * 0.025);
        c.hp -= std::max(0.0, j / mt - 1.5) * 5.0 + std::max(0.0, j / car.s.mass - 1.5) * 1.0;
        Fx* none = nullptr; (void)none;
      }
    }
  }
}
void PoliceChase::playerHit(double impulse, double mass) {
  double dv = impulse / mass; if (dv < 6) return; double dmg = (dv - 6) * 0.55; health -= dmg; damageFlash = std::min(1.0, damageFlash + dmg * 0.03); shake = std::min(1.0, shake + dv * 0.02);
}

// --- Explosions and the guns ------------------------------------------------------------------------------------------------------------------
void PoliceChase::explode(double x, double z, double y, double power, double radius, double dmg, Vehicle& player, Traffic& traffic, Fx& fx) {
  fx.explosion(Vec3((float)x, (float)y, (float)z), (float)power);
  for (Cop& c : cops) {
    double dx = c.x - x, dz = c.z - z, d = std::hypot(dx, dz); if (d > radius) continue; double fall = 1 - d / radius, nx = d > 0.1 ? dx / d : 0, nz = d > 0.1 ? dz / d : 1;
    damageCop(c, dmg * fall, fx); c.vx += nx * 30 * fall * power; c.vz += nz * 30 * fall * power; c.vy = (c.air ? c.vy : 0) + 5 + 9 * fall * power; c.air = true; c.spin = (rnd() - 0.5) * 6; c.rollRate = (rnd() - 0.5) * 9 * fall; c.speed *= 0.5;
  }
  for (TCar& t : traffic.cars) {
    if (t.pts.empty()) continue; double dx = t.x - x, dz = t.z - z, d = std::hypot(dx, dz); if (d > radius) continue; double fall = 1 - d / radius, nx = d > 0.1 ? dx / d : 0, nz = d > 0.1 ? dz / d : 1;
    bool was = t.mode == TCar::WRECK; traffic.knock(t, nx * 26 * fall * power, nz * 26 * fall * power, (rnd() - 0.5) * 6 * fall); traffic.damage(t, dmg * fall * 0.9); if (!was && t.mode == TCar::WRECK) { civilians++; heat = std::min(5.99, heat + 0.12); }
  }
  double dx = player.x - x, dz = player.z - z, d = std::hypot(dx, dz); if (d < radius * 0.8) { double fall = 1 - d / (radius * 0.8); health -= dmg * fall * 0.15 * (shieldT > 0 ? 0.3 : 1.0); damageFlash = std::min(1.0, damageFlash + fall * 0.4); }
  shake = std::min(1.0, std::max(shake, power * 0.9 / (1 + d * 0.04)));
}
void PoliceChase::fireGuns(double dt, Vehicle& p, Traffic& traffic, Fx& fx) {
  fireT += dt; const double RATE = 1.0 / 16.0; double fx_ = std::sin(p.h), fz_ = std::cos(p.h);
  while (fireT >= RATE) {
    fireT -= RATE; static int alt = 0; alt ^= 1; int side = alt ? 1 : -1; Vec3 m = muzzlePos(p, side); double spread = 0.012, a = p.h + (rnd() - 0.5) * 2 * spread, dx = std::sin(a), dz = std::cos(a), maxD = 150; (void)fx_; (void)fz_;
    double bestT = std::min(maxD, raycastStatic(m.x, m.z, dx, dz, maxD)); int hitCop = -1; TCar* hitCar = nullptr; double hy = m.y;
    auto circleHit = [&](double cx, double cz, double r) { double ox = cx - m.x, oz = cz - m.z, t = ox * dx + oz * dz; if (t < 0 || t > bestT) return -1.0; double d2 = ox * ox + oz * oz - t * t; if (d2 > r * r) return -1.0; return t - std::sqrt(std::max(0.0, r * r - d2)); };
    for (size_t i = 0; i < cops.size(); i++) { Cop& c = cops[i]; if (c.wreck) continue; double cf[2] = { std::sin(c.h), std::cos(c.h) }; for (double co : { -c.len * 0.3, 0.0, c.len * 0.3 }) { double t = circleHit(c.x + cf[0] * co, c.z + cf[1] * co, c.rad + 0.15); if (t >= 0 && t < bestT) { bestT = t; hitCop = (int)i; hitCar = nullptr; } } }
    for (TCar& t : traffic.cars) { if (t.pts.empty() || t.mode == TCar::WRECK) continue; double tf[2] = { std::sin(t.h), std::cos(t.h) }; for (double to : { -t.len * 0.28, t.len * 0.28 }) { double tt = circleHit(t.x + tf[0] * to, t.z + tf[1] * to, t.rad + 0.15); if (tt >= 0 && tt < bestT) { bestT = tt; hitCop = -1; hitCar = &t; } } }
    Vec3 end((float)(m.x + dx * bestT), hy - 0.15f, (float)(m.z + dz * bestT)); fx.tracer(m, end, 0.045f, 0.07f); fx.muzzle(m, Vec3((float)dx, 0, (float)dz));
    if (hitCop >= 0) { damageCop(cops[hitCop], 7.5, fx); for (int s = 0; s < 3; s++) fx.spark(end, Vec3((float)(rnd() - 0.5) * 8, (float)rnd() * 6, (float)(rnd() - 0.5) * 8), 0.35f); }
    else if (hitCar) { bool was = hitCar->mode == TCar::WRECK; traffic.damage(*hitCar, 7.5); if (!was && hitCar->mode == TCar::WRECK) { civilians++; heat = std::min(5.99, heat + 0.12); fx.explosion(Vec3((float)hitCar->x, 0.5f, (float)hitCar->z), 0.7f); } for (int s = 0; s < 3; s++) fx.spark(end, Vec3((float)(rnd() - 0.5) * 8, (float)rnd() * 6, (float)(rnd() - 0.5) * 8), 0.35f); }
    else if (bestT < maxD) { for (int s = 0; s < 2; s++) fx.spark(end, Vec3((float)(rnd() - 0.5) * 6, (float)rnd() * 5, (float)(rnd() - 0.5) * 6), 0.3f); fx.smoke(end, Vec3(0, 0.5f, 0), 0.4f, 0.7f, 0.5f, 0.3f, 1.0f); }
  }
}

// --- The mission ---------------------------------------------------------------------------------------------------------------------------------
void PoliceChase::update(double dt, Vehicle& p, Traffic& traffic, Fx& fx, const EscapeInput& in, bool) {
  if (result != RUNNING) { endT += dt; shake *= std::exp(-3 * dt); damageFlash *= std::exp(-2 * dt); for (Cop& c : cops) { double gx = p.x, gz = p.z; updateCop(c, dt, p, traffic, fx, gx, gz, false); c.speed *= std::exp(-2 * dt); } return; }
  time += dt; shake *= std::exp(-4 * dt); damageFlash *= std::exp(-2.5 * dt); double pspeed = p.speed();
  // Who can see you?
  bool any = false; nearest = 1e9;
  for (Cop& c : cops) { c.sees = !c.wreck && canSee(c.x, c.z, p.x, p.z, 230); if (c.sees) any = true; if (!c.wreck) nearest = std::min(nearest, std::hypot(c.x - p.x, c.z - p.z)); }
  spotted = any; if (any) { lastSeenX = p.x; lastSeenZ = p.z; }
  spotCool -= dt; if (spotted != wasSpotted) { if (spotCool <= 0 && time > 4) { messages.push_back(spotted ? "SPOTTED" : "OUT OF SIGHT - STAY HIDDEN"); spotCool = 3.0; } wasSpotted = spotted; }
  if (spotted) heat = std::min(5.99, heat + dt / 42.0);
  if (stars() != lastStars) { if (stars() > lastStars) messages.push_back("HEAT " + std::to_string(stars())); lastStars = stars(); maxStars = std::max(maxStars, stars()); }
  hiddenNeeded = 9 + 2 * stars();
  if (!spotted && nearest > 60) hidden += dt; else hidden = std::max(0.0, hidden - dt * (spotted ? 3.0 : 1.0));
  if (hidden >= hiddenNeeded) { result = ESCAPED; messages.push_back("YOU LOST THEM"); return; }
  // Cops: spawn up to the wanted level, drive, retire the wrecks.
  spawnT -= dt; int alive = 0, trucks = 0; for (const Cop& c : cops) if (!c.wreck) { alive++; if (c.kind) trucks++; }
  if (spawnT <= 0 && alive < desiredCops()) { spawnCop(p, (stars() >= 4 && trucks < (stars() - 2)) ? 1 : 0, spotted); spawnT = spotted ? 2.2 : 5.0; }
  for (size_t i = 0; i < cops.size();) {
    Cop& c = cops[i]; double gx = spotted ? p.x + std::sin(p.h) * pspeed * 0.6 : lastSeenX, gz = spotted ? p.z + std::cos(p.h) * pspeed * 0.6 : lastSeenZ; bool chase = spotted;
    if (!spotted) { c.roam -= dt; if (std::hypot(c.x - lastSeenX, c.z - lastSeenZ) < 35 && c.roam <= 0) { c.roam = 6 + rnd() * 5; double a = rnd() * 6.2832, r = 80 + rnd() * 140; c.rx = lastSeenX + std::sin(a) * r; c.rz = lastSeenZ + std::cos(a) * r; } if (c.roam > 0 && c.rx != 0) { gx = c.rx; gz = c.rz; } }
    updateCop(c, dt, p, traffic, fx, gx, gz, chase);
    bool farAway = std::hypot(c.x - p.x, c.z - p.z) > 480; bool dead = c.wreck && c.burn > 24;
    if (dead || (!c.wreck && (farAway || c.stuck > 3.0))) { if (c.wreck) { cops[i] = cops.back(); cops.pop_back(); continue; } int kind = c.kind; double hp = c.hp; spawnCop(p, kind, spotted); Cop n = cops.back(); cops.pop_back(); n.hp = hp; cops[i] = n; }   // (spawnCop grows the vector: no references into it across the call)
    i++;
  }
  for (size_t a = 0; a < cops.size(); a++) for (size_t b = a + 1; b < cops.size(); b++) {                  // cops don't drive through each other
    Cop &A = cops[a], &B = cops[b]; double dx = B.x - A.x, dz = B.z - A.z, d = std::hypot(dx, dz), r = 2.1; if (d >= r || d < 1e-4) continue;
    double nx = dx / d, nz = dz / d, pen = (r - d) * 0.5; A.x -= nx * pen; A.z -= nz * pen; B.x += nx * pen; B.z += nz * pen; if (!A.wreck && !B.wreck) { A.speed *= 0.97; B.speed *= 0.97; }
  }
  // Gadgets.
  gunHeat = std::max(0.0, gunHeat - dt * (jammed ? 0.35 : 0.22)); if (jammed && gunHeat < 0.35) jammed = false;
  bool firing = in.fire && !jammed; gunOut += ((firing ? 1.0 : 0.0) - gunOut) * std::min(1.0, dt * (firing ? 14.0 : 3.0));
  if (firing) { fireGuns(dt, p, traffic, fx); gunHeat += dt * 0.26; if (gunHeat >= 1.0) { jammed = true; messages.push_back("GUNS OVERHEATED"); } } else fireT = 1.0 / 16.0;
  regenMissile += dt; if (ammoMissile < 6 && regenMissile > 7) { ammoMissile++; regenMissile = 0; } regenBomb += dt; if (ammoBomb < 4 && regenBomb > 11) { ammoBomb++; regenBomb = 0; }
  cdOil = std::max(0.0, cdOil - dt); cdSmoke = std::max(0.0, cdSmoke - dt); cdShield = std::max(0.0, cdShield - dt); shieldT = std::max(0.0, shieldT - dt);
  double fx_ = std::sin(p.h), fz_ = std::cos(p.h), vxw, vzw; p.worldVel(vxw, vzw);
  if (in.missile && ammoMissile > 0) {                                                                      // a homing missile from the grille
    ammoMissile--; Vec3 m = muzzlePos(p, 0); Missile ms = { m.x, m.z, m.y, p.h, std::max(pspeed, 25.0), 0, -1 };
    double bestA = 0.6, bestD = 1e9; for (size_t i = 0; i < cops.size(); i++) { Cop& c = cops[i]; if (c.wreck) continue; double dx = c.x - p.x, dz = c.z - p.z, d = std::hypot(dx, dz); if (d > 260 || d < 8) continue; double ang = std::fabs(wrapPi(std::atan2(dx, dz) - p.h)); if (ang < bestA && d < bestD + 80) { bestA = ang; bestD = d; ms.target = (int)i; } }
    missiles.push_back(ms); fx.flash(Vec3(m.x, m.y, m.z), 1.6f, 0.15f, 1.0f, 0.8f, 0.4f, 6.0f); messages.push_back(ms.target >= 0 ? "MISSILE - LOCKED" : "MISSILE");
  }
  if (in.bomb && ammoBomb > 0) { ammoBomb--; bombs.push_back({ p.x - fx_ * 2.6, p.z - fz_ * 2.6, p.bodyY() + 0.2, vxw * 0.25, vzw * 0.25, 0 }); messages.push_back("BOMB DROPPED"); }
  if (in.oil && cdOil <= 0) { cdOil = 7; oils.push_back({ p.x - fx_ * 5.5, p.z - fz_ * 5.5, 6.5, 0, 16 }); messages.push_back("OIL SLICK"); }
  if (in.smoke && cdSmoke <= 0) { cdSmoke = 14; smokes.push_back({ p.x - fx_ * 6.0, p.z - fz_ * 6.0, 11.0, 0, 14 }); smokes.push_back({ p.x - fx_ * 18.0, p.z - fz_ * 18.0, 11.0, 0, 14 }); messages.push_back("SMOKE SCREEN");
    for (int i = 0; i < 46; i++) { double t = rnd(), a = rnd() * 6.2832, r = rnd() * 9; fx.smoke(Vec3((float)(p.x - fx_ * (3 + t * 24) + std::sin(a) * r), (float)(0.8 + rnd() * 3), (float)(p.z - fz_ * (3 + t * 24) + std::cos(a) * r)), Vec3((float)(rnd() - 0.5), 0.4f, (float)(rnd() - 0.5)), (float)(4 + rnd() * 4), (float)(9 + rnd() * 4), 0.62f, 0.75f, 1.2f); } }
  if (in.shield && cdShield <= 0) { shieldT = 6; cdShield = 15; messages.push_back("ARMOUR UP"); }
  for (size_t i = 0; i < missiles.size();) {                                                                 // missiles
    Missile& m = missiles[i]; m.age += dt; m.speed = std::min(105.0, m.speed + 70 * dt);
    if (m.target >= 0 && m.target < (int)cops.size() && !cops[m.target].wreck) { double want = std::atan2(cops[m.target].x - m.x, cops[m.target].z - m.z); m.h += clampd(wrapPi(want - m.h), -2.6 * dt, 2.6 * dt); }
    double step = m.speed * dt, dx = std::sin(m.h), dz = std::cos(m.h); bool boom = m.age > 5.0; double travel = raycastStatic(m.x, m.z, dx, dz, step + 1.0); if (travel < step + 0.9) boom = true;
    m.x += dx * step; m.z += dz * step; m.y = std::max(m.y + (groundAt(m.x, m.z).y + 0.9 - m.y) * std::min(1.0, dt * 6), groundAt(m.x, m.z).y + 0.5);
    for (Cop& c : cops) if (!c.wreck && std::hypot(c.x - m.x, c.z - m.z) < 2.6) boom = true;
    for (TCar& t : traffic.cars) if (!t.pts.empty() && t.mode != TCar::WRECK && std::hypot(t.x - m.x, t.z - m.z) < 2.6) boom = true;
    fx.smoke(Vec3((float)(m.x - dx * 1.2), (float)m.y, (float)(m.z - dz * 1.2)), Vec3(0, 0.3f, 0), 0.5f, 1.4f, 0.55f, 0.5f, 1.3f); fx.fire(Vec3((float)(m.x - dx * 1.0), (float)m.y, (float)(m.z - dz * 1.0)), Vec3(0, 0, 0), 0.45f, 0.18f);
    if (boom) { explode(m.x, m.z, m.y, 1.0, 10.0, 170, p, traffic, fx); missiles[i] = missiles.back(); missiles.pop_back(); continue; }
    i++;
  }
  for (size_t i = 0; i < bombs.size();) {                                                                    // bombs go off when something drives close
    Bomb& b = bombs[i]; b.age += dt; double k = std::exp(-2.0 * dt); b.vx *= k; b.vz *= k; b.x += b.vx * dt; b.z += b.vz * dt; b.y = groundAt(b.x, b.z).y + 0.3; bool boom = b.age > 40;
    if (b.age > 0.8) { for (Cop& c : cops) if (!c.wreck && std::hypot(c.x - b.x, c.z - b.z) < 6.0) boom = true; for (TCar& t : traffic.cars) if (!t.pts.empty() && t.mode != TCar::WRECK && std::hypot(t.x - b.x, t.z - b.z) < 4.0) boom = true; }
    if (boom) { explode(b.x, b.z, b.y, 1.6, 15.0, 260, p, traffic, fx); bombs[i] = bombs.back(); bombs.pop_back(); continue; }
    i++;
  }
  for (size_t i = 0; i < oils.size();) { oils[i].age += dt; for (TCar& t : traffic.cars) { if (t.pts.empty() || t.mode != TCar::DRIVE) continue; double ox = t.x - oils[i].x, oz = t.z - oils[i].z; if (ox * ox + oz * oz < oils[i].r * oils[i].r && t.speed > 6) traffic.knock(t, std::sin(t.h) * t.speed * 0.8, std::cos(t.h) * t.speed * 0.8, (rnd() - 0.5) * 5); } if (oils[i].age > oils[i].life) { oils[i] = oils.back(); oils.pop_back(); } else i++; }
  for (size_t i = 0; i < smokes.size();) { smokes[i].age += dt; if (smokes[i].age > smokes[i].life) { smokes[i] = smokes.back(); smokes.pop_back(); } else i++; }
  // Win or lose.
  int close = 0; for (const Cop& c : cops) if (!c.wreck && std::hypot(c.x - p.x, c.z - p.z) < 9) close++;
  if (pspeed < 2.5 && close >= 2) bustT += dt; else bustT = std::max(0.0, bustT - dt * 2); if (bustT > 4.0) { result = BUSTED; messages.push_back("BUSTED"); }
  if (health <= 0) { health = 0; result = WRECKED; messages.push_back("WRECKED"); fx.explosion(Vec3((float)p.x, (float)p.bodyY(), (float)p.z), 1.2f); }
  if (health < 35 && rnd() < dt * 18) fx.smoke(Vec3((float)(p.x + fx_ * 1.6), (float)p.bodyY() + 0.9f, (float)(p.z + fz_ * 1.6)), Vec3(0, 1.0f, 0), 0.6f, 1.6f, health < 15 ? 0.1f : 0.35f, 0.6f, 1.6f);
  if (health < 15 && rnd() < dt * 14) fx.fire(Vec3((float)(p.x + fx_ * 1.7), (float)p.bodyY() + 0.8f, (float)(p.z + fz_ * 1.7)), Vec3(0, 1.0f, 0), 0.35f, 0.4f);
}

// --- Drawing ---------------------------------------------------------------------------------------------------------------------------------------------
void PoliceChase::draw(Renderer& r, bool shadow, double clock) {
  Material paint; paint.type = 1; Material dark; dark.type = 0; dark.rough = 0.6f; dark.metal = 0.2f; dark.twoSided = true;
  for (const Cop& c : cops) {
    const CarMesh& m = c.kind ? vm->swat : vm->cruiser; Mat4 M = mul(mul(translation((float)c.x, (float)c.y, (float)c.z), rotationY((float)c.h)), mul(rotationX((float)c.pitch), rotationZ((float)c.roll)));
    Material body = paint; if (c.kind) { body.tint[0] = body.tint[1] = body.tint[2] = 0.1f; } if (c.wreck) { body.tint[0] = body.tint[1] = body.tint[2] = 0.05f; }
    r.drawMeshMat(m.body, M, body); r.drawMeshMat(m.bar, M, dark);
    if (shadow) continue;
    if (!c.wreck) {
      bool phase = std::fmod(clock * 3.6 + c.flash, 1.0) < 0.5; Material red; red.type = 4; red.emissive = phase ? 16.0f : 0.5f; red.tint[0] = 1; red.tint[1] = 0.05f; red.tint[2] = 0.03f; Material blue; blue.type = 4; blue.emissive = phase ? 0.5f : 18.0f; blue.tint[0] = 0.08f; blue.tint[1] = 0.22f; blue.tint[2] = 1.0f;
      r.drawMeshMat(m.lampL, M, red); r.drawMeshMat(m.lampR, M, blue);
      Material head; head.type = 4; head.emissive = 3.0f; Material tail; tail.type = 4; tail.emissive = 1.8f; r.drawMeshMat(m.head, M, head); r.drawMeshMat(m.tail, M, tail);
    }
  }
  if (shadow) return;
  Material bm; bm.type = 0; bm.rough = 0.4f; bm.metal = 0.6f; Material light; light.type = 4;
  for (const Bomb& b : bombs) { Mat4 M = translation((float)b.x, (float)b.y - 0.28f, (float)b.z); r.drawMeshMat(bombMesh, M, bm); bool on = std::fmod(clock * (b.age > 0.8 ? 3.0 : 8.0), 1.0) < 0.5; light.emissive = on ? 14.0f : 0.5f; light.tint[0] = 1; light.tint[1] = 0.1f; light.tint[2] = 0.05f; r.drawMeshMat(bombLight, M, light); }
  Material mm; mm.type = 0; mm.rough = 0.3f; mm.metal = 0.8f;
  for (const Missile& m : missiles) r.drawMeshMat(missileMesh, mul(mul(translation((float)m.x, (float)m.y, (float)m.z), rotationY((float)m.h - (float)PI / 2)), Mat4::identity()), mm);
  Material oil; oil.type = 0; oil.rough = 0.04f; oil.metal = 0.0f; oil.tint[0] = oil.tint[1] = oil.tint[2] = 1.0f;
  for (const Zone& o : oils) { double k = clampd(o.age / 0.5, 0, 1) * clampd((o.life - o.age) / 2.0, 0, 1); r.drawMeshMat(oilMesh, mul(translation((float)o.x, (float)groundAt(o.x, o.z).y + 0.025f, (float)o.z), scaling((float)(o.r * k), 1, (float)(o.r * k * 0.75))), oil); }
}
