#include "collide.h"
#include <unordered_set>

static const float CELL = 40.0f;
static std::unordered_map<int64_t, std::vector<Circle>> grid;
static std::unordered_map<int64_t, std::vector<int64_t>> ownerCells;
static std::unordered_map<int64_t, std::vector<std::pair<int64_t, Circle>>> byOwner;
static int64_t ck(int cx, int cz) { return (int64_t)(cx + 4000) * 8192 + (cz + 4000); }

void addColliders(int64_t owner, const std::vector<Circle>& list) {
  removeColliders(owner);
  auto& cells = ownerCells[owner]; auto& own = byOwner[owner];
  for (const Circle& c : list) {
    for (int cx = (int)std::floor((c.x - c.r) / CELL); cx <= (int)std::floor((c.x + c.r) / CELL); cx++)
      for (int cz = (int)std::floor((c.z - c.r) / CELL); cz <= (int)std::floor((c.z + c.r) / CELL); cz++) { int64_t k = ck(cx, cz); grid[k].push_back(c); cells.push_back(k); own.push_back({ k, c }); }
  }
}
void removeColliders(int64_t owner) {
  auto it = byOwner.find(owner); if (it == byOwner.end()) return;
  for (auto& [k, c] : it->second) {
    auto g = grid.find(k); if (g == grid.end()) continue;
    auto& v = g->second; for (size_t i = 0; i < v.size(); i++) if (v[i].x == c.x && v[i].z == c.z && v[i].r == c.r) { v[i] = v.back(); v.pop_back(); break; }
    if (v.empty()) grid.erase(g);
  }
  byOwner.erase(it); ownerCells.erase(owner);
}
void queryColliders(float x, float z, float r, std::vector<Circle>& out) {
  out.clear();
  for (int cx = (int)std::floor((x - r) / CELL); cx <= (int)std::floor((x + r) / CELL); cx++)
    for (int cz = (int)std::floor((z - r) / CELL); cz <= (int)std::floor((z + r) / CELL); cz++) { auto it = grid.find(ck(cx, cz)); if (it != grid.end()) out.insert(out.end(), it->second.begin(), it->second.end()); }
}

static std::unordered_map<int64_t, std::vector<Box>> boxGrid;
void addBoxes(const std::vector<Box>& list) {
  for (const Box& b : list) for (int cx = (int)std::floor(b.x0 / CELL); cx <= (int)std::floor(b.x1 / CELL); cx++) for (int cz = (int)std::floor(b.z0 / CELL); cz <= (int)std::floor(b.z1 / CELL); cz++) boxGrid[ck(cx, cz)].push_back(b);
}
static const double CIRCLES[3] = { -1.45, 0, 1.45 }, RAD = 1.0;
static double applyImpulse(Vehicle& car, double px, double pz, double nx, double nz, double e, double mu, const HitFn* hit) {
  double m = car.s.mass, I = car.I, Vx, Vz; car.worldVel(Vx, Vz);
  double Om = -car.w, rx = px - car.x, rz = pz - car.z, vpx = Vx + Om * rz, vpz = Vz - Om * rx, vn = vpx * nx + vpz * nz;
  if (vn >= 0) return 0;
  double rn = rz * nx - rx * nz, j = -(1 + e) * vn / (1 / m + rn * rn / I), nVx = Vx + j * nx / m, nVz = Vz + j * nz / m; Om += rn * j / I;
  double tx = -nz, tz = nx, vt = vpx * tx + vpz * tz, rt = rz * tx - rx * tz, jt = -vt / (1 / m + rt * rt / I);
  jt = std::max(-mu * j, std::min(mu * j, jt)); nVx += jt * tx / m; nVz += jt * tz / m; Om += rt * jt / I;
  car.setWorldVel(nVx, nVz); car.w = -Om;
  if (hit && *hit) (*hit)(j);
  return j;
}
void collideStatic(Vehicle& car, const HitFn& onHit) {
  double fx = std::sin(car.h), fz = std::cos(car.h); static std::vector<Circle> found;
  for (int pass = 0; pass < 2; pass++) for (double off : CIRCLES) {
    double cx = car.x + fx * off, cz = car.z + fz * off; queryColliders((float)cx, (float)cz, (float)(RAD + 2.5), found);
    for (const Circle& c : found) {
      double dx = cx - c.x, dz = cz - c.z, dist = std::hypot(dx, dz), r = RAD + c.r;
      if (dist >= r || dist < 1e-5) continue;
      double nx = dx / dist, nz = dz / dist, pen = r - dist, px = c.x + nx * c.r, pz = c.z + nz * c.r;
      car.x += nx * pen; car.z += nz * pen; applyImpulse(car, px, pz, nx, nz, 0.25, 0.25, pass == 0 ? &onHit : nullptr);
    }
  }
  for (int pass = 0; pass < 2; pass++) for (double off : CIRCLES) {   // buildings: boxes
    double cx = car.x + fx * off, cz = car.z + fz * off; auto it = boxGrid.find(ck((int)std::floor(cx / CELL), (int)std::floor(cz / CELL))); if (it == boxGrid.end()) continue;
    for (const Box& b : it->second) {
      double qx = std::max((double)b.x0, std::min(cx, (double)b.x1)), qz = std::max((double)b.z0, std::min(cz, (double)b.z1)), dx = cx - qx, dz = cz - qz, dist = std::hypot(dx, dz), nx, nz, pen;
      if (dist >= RAD) continue;
      if (dist > 1e-4) { nx = dx / dist; nz = dz / dist; pen = RAD - dist; }
      else { double o[4][3] = { { cx - b.x0, -1, 0 }, { b.x1 - cx, 1, 0 }, { cz - b.z0, 0, -1 }, { b.z1 - cz, 0, 1 } }; int bi = 0; for (int k = 1; k < 4; k++) if (o[k][0] < o[bi][0]) bi = k; nx = o[bi][1]; nz = o[bi][2]; pen = o[bi][0] + RAD; }
      car.x += nx * pen; car.z += nz * pen; applyImpulse(car, cx - nx * RAD, cz - nz * RAD, nx, nz, 0.25, 0.25, pass == 0 ? &onHit : nullptr);
    }
  }
  // The edge of the world: a soft invisible wall.
  struct Edge { int axis; double sign, lim; } edges[4] = { {0, 1, WORLD_LIM.x1}, {0, -1, -WORLD_LIM.x0}, {1, 1, WORLD_LIM.z1}, {1, -1, -WORLD_LIM.z0} };
  for (auto& e : edges) {
    double& v = e.axis == 0 ? car.x : car.z;
    if (v * e.sign > e.lim) { v = e.sign * e.lim; double nx = e.axis == 0 ? -e.sign : 0, nz = e.axis == 1 ? -e.sign : 0; applyImpulse(car, car.x - nx, car.z - nz, nx, nz, 0.3, 0.3, &onHit); }
  }
}
static void slopeAt(double x, double z, double& gx, double& gz) {
  const double d = 2.5; gx = (groundAt(x + d, z).y - groundAt(x - d, z).y) / (2 * d); gz = (groundAt(x, z + d).y - groundAt(x, z - d).y) / (2 * d);
}
void collideTerrain(Vehicle& car, const HitFn& onHit) {
  if (std::fabs(car.x) < CITY_EDGE - 40 && std::fabs(car.z) < CITY_EDGE - 40) return;
  if (car.x < coastX(car.z) + 70) {                              // the sea is a wall: you can paddle in the shallows but not drive out
    car.x += 0.25; applyImpulse(car, car.x - 1, car.z, 1, 0, 0.2, 0.4, &onHit); return;
  }
  double Vx, Vz; car.worldVel(Vx, Vz); if (std::hypot(Vx, Vz) <= 0.5) return;
  double dir = car.vx >= 0 ? 1 : -1, px = car.x + std::sin(car.h) * 2.4 * dir, pz = car.z + std::cos(car.h) * 2.4 * dir, gx, gz;
  slopeAt(px, pz, gx, gz); double gm = std::hypot(gx, gz); if (gm < 0.95) return;
  double nx = -gx / gm, nz = -gz / gm; if (Vx * nx + Vz * nz > 0) return;
  car.x += nx * 0.12; car.z += nz * 0.12; applyImpulse(car, px, pz, nx, nz, 0.15, 0.5, &onHit);
}
