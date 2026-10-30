#include "scenery.h"
#include <map>

// --- Road geometry (a port of roads.js) ---------------------------------------------------------------------
namespace {
struct RP { double x, z, y, rx, rz, tx, tz, s; };
std::map<int64_t, std::vector<std::pair<int, int>>> segs;      // tile -> (road, segment) by midpoint
std::vector<std::array<double, 2>> junctions;
bool prepared = false;
int64_t tkey(int tx, int tz) { return ((int64_t)(tx + 100000) << 20) | (int64_t)(tz + 100000); }

void prepareRoads() {
  if (prepared) return; prepared = true;
  for (auto& R : ROADS) {
    R.lift = R.kind == ROAD_MOTORWAY ? (R.closed ? 0.0 : 0.03) : R.kind == ROAD_RUNWAY ? 0.02 : 0.05;
    R.under.resize(R.x.size()); R.bridge.assign(R.x.size(), 0);
    for (size_t i = 0; i < R.x.size(); i++) { R.under[i] = (float)baseHeight(R.x[i], R.z[i]); R.bridge[i] = R.y[i] - R.under[i] > 5 ? 1 : 0; }
    if (R.kind == ROAD_SERVICE) junctions.push_back({ R.x[0], R.z[0] });
    if (R.kind == ROAD_MOTORWAY && !R.closed) junctions.push_back({ R.x.back(), R.z.back() });
    for (size_t i = 0; i + 1 < R.x.size(); i++) {
      int tx = (int)std::floor((R.x[i] + R.x[i + 1]) / 2 / Scenery::TILE), tz = (int)std::floor((R.z[i] + R.z[i + 1]) / 2 / Scenery::TILE);
      segs[tkey(tx, tz)].push_back({ R.idx, (int)i });
    }
  }
}
bool nearJunction(double x, double z, double r) { for (auto& j : junctions) if ((j[0] - x) * (j[0] - x) + (j[1] - z) * (j[1] - z) < r * r) return true; return false; }
RP pt(const Road& R, int k) {
  int a = std::max(0, k - 1), b = std::min((int)R.x.size() - 1, k + 1); double tx = R.x[b] - R.x[a], tz = R.z[b] - R.z[a], l = std::hypot(tx, tz); if (l == 0) l = 1; tx /= l; tz /= l;
  return { R.x[k], R.z[k], R.y[k] + R.lift, -tz, tx, tx, tz, R.s[k] };
}
RP mixp(const RP& A, const RP& B, double t) {
  double rx = A.rx + (B.rx - A.rx) * t, rz = A.rz + (B.rz - A.rz) * t, l = std::hypot(rx, rz); if (l == 0) l = 1;
  return { A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t, A.y + (B.y - A.y) * t, rx / l, rz / l, A.tx, A.tz, A.s + (B.s - A.s) * t };
}
Vec3 P(const RP& p, double l, double dy = 0) { return Vec3((float)(p.x + p.rx * l), (float)(p.y + dy), (float)(p.z + p.rz * l)); }
void ribbon(MeshData& m, const RP& A, const RP& B, double l1, double l2, double dy, uint32_t col, bool uvs) {
  if (uvs) m.quad(P(A, l1, dy), P(A, l2, dy), P(B, l2, dy), P(B, l1, dy), col, (float)l1, (float)A.s, (float)l2, (float)B.s);
  else m.quad(P(A, l1, dy), P(A, l2, dy), P(B, l2, dy), P(B, l1, dy), col);
}
void slopeQ(MeshData& m, const RP& A, const RP& B, double l1, double dy1, double l2, double dy2, uint32_t col) { m.quad(P(A, l1, dy1), P(A, l2, dy2), P(B, l2, dy2), P(B, l1, dy1), col); }
void wallQ(MeshData& m, const RP& A, const RP& B, double l, double dy0, double dy1, uint32_t col) { m.quad(P(A, l, dy0), P(B, l, dy0), P(B, l, dy1), P(A, l, dy1), col); }
void orientedBox(MeshData& m, double cx, double cz, double rx, double rz, double fx, double fz, double hx, double hl, double y0, double y1, uint32_t col) {
  Vec3 c[8]; int k = 0;
  for (double y : { y0, y1 }) for (auto ab : { std::array<double, 2>{ -hx, -hl }, { hx, -hl }, { hx, hl }, { -hx, hl } }) { c[k++] = Vec3((float)(cx + rx * ab[0] + fx * ab[1]), (float)y, (float)(cz + rz * ab[0] + fz * ab[1])); }
  m.quad(c[0], c[1], c[2], c[3], col); m.quad(c[7], c[6], c[5], c[4], col);
  for (int e = 0; e < 4; e++) m.quad(c[e], c[(e + 1) % 4], c[4 + (e + 1) % 4], c[4 + e], col);
}
const uint32_t K_CONC = packColor(0.45f, 0.43f, 0.40f), K_CONC2 = packColor(0.30f, 0.29f, 0.27f), K_STEEL = packColor(0.50f, 0.52f, 0.54f), K_POST = packColor(0.22f, 0.23f, 0.25f), K_GRAV = packColor(0.20f, 0.17f, 0.13f);

void emit(Scenery::TileCPU& T, const Road& R, int i) {
  RP A = pt(R, i), B = pt(R, i + 1); double hw = R.hw; bool motorway = R.kind == ROAD_MOTORWAY, bridge = R.bridge[i] || R.bridge[i + 1];
  float style = R.kind == ROAD_MOTORWAY ? 0.0f : R.kind == ROAD_RUNWAY ? 1.0f : 0.5f;
  ribbon(T.asphalt, A, B, -hw, hw, 0, packColor((float)(hw / 32.0), style, 0.0f), true);
  if (!bridge) { slopeQ(T.gravel, A, B, -hw, 0, -hw - 3.6, -1.3, K_GRAV); slopeQ(T.gravel, A, B, hw, 0, hw + 3.6, -1.3, K_GRAV); }
  T.minY = (float)std::min<double>(T.minY, std::min(A.y, B.y) - 2); T.maxY = (float)std::max<double>(T.maxY, std::max(A.y, B.y) + 3);
  if (!motorway) return;
  if (!(!R.closed && (R.s.back() - A.s) < 40)) {                // median barrier (it stops short of a junction with another motorway)
    slopeQ(T.conc, A, B, -0.45, 0, -0.14, 0.85, K_CONC); slopeQ(T.conc, A, B, -0.14, 0.85, 0.14, 0.85, K_CONC2); slopeQ(T.conc, A, B, 0.14, 0.85, 0.45, 0, K_CONC);
    for (int k = 0; k < 5; k++) { RP t = mixp(A, B, k / 5.0); T.colliders.push_back({ (float)t.x, (float)t.z, 0.8f }); }
  }
  if (bridge) {                                                  // parapets, a deck edge and piers
    for (int sd : { -1, 1 }) {
      double o = sd * (hw + 0.1);
      wallQ(T.conc, A, B, o + sd * 0.25, -1.6, 0.95, K_CONC); wallQ(T.conc, A, B, o - sd * 0.25, 0, 0.95, K_CONC); ribbon(T.conc, A, B, o - 0.25, o + 0.25, 0.95, K_CONC2, false);
      for (int k = 0; k < 5; k++) { RP t = mixp(A, B, k / 5.0); T.colliders.push_back({ (float)(t.x + t.rx * o), (float)(t.z + t.rz * o), 1.0f }); }
    }
    ribbon(T.conc, A, B, -hw - 0.35, hw + 0.35, -1.6, K_CONC2, false);
    if (i % 3 == 0) {
      double under = std::min(R.under[i], R.under[i + 1]) - 1.5, top = A.y - 1.6;
      if (top - under > 1) orientedBox(T.conc, A.x, A.z, A.rx, A.rz, A.tx, A.tz, hw - 2.5, 1.3, under, top, K_CONC2);
    }
    return;
  }
  for (int sd : { -1, 1 }) {                                     // guardrail: a steel beam on posts, solid to the car except at junctions
    double o = sd * (hw + 0.55);
    if (nearJunction(A.x + A.rx * o, A.z + A.rz * o, 30)) continue;
    wallQ(T.metal, A, B, o, 0.5, 0.86, K_STEEL);
    for (int k = 0; k < 3; k++) { RP t = mixp(A, B, k / 3.0); orientedBox(T.metal, t.x + t.rx * (o + sd * 0.1), t.z + t.rz * (o + sd * 0.1), t.rx, t.rz, t.tx, t.tz, 0.05, 0.06, t.y - 0.1, t.y + 0.85, K_POST); }
    for (int k = 0; k < 6; k++) { RP t = mixp(A, B, k / 6.0); T.colliders.push_back({ (float)(t.x + t.rx * (o + sd * 0.4)), (float)(t.z + t.rz * (o + sd * 0.4)), 1.0f }); }
  }
}
double smoothstepd(double a, double b, double x) { return smoothd(a, b, x); }
struct Rng { uint32_t s; explicit Rng(uint32_t seed) : s(seed) {} double next() { s += 0x6d2b79f5u; uint32_t t = s; t = (t ^ (t >> 15)) * (t | 1); t ^= t + (t ^ (t >> 7)) * (t | 61); return ((t ^ (t >> 14))) / 4294967296.0; } };
struct Keep { double x, z, r; };
}

// --- Plants (a port of scatter.js) ----------------------------------------------------------------------------------
static void scatter(Scenery::TileCPU& T, double x0, double z0, double size) {
  Rng rnd((uint32_t)(T.tx + 500) * 73856093u ^ (uint32_t)(T.tz + 500) * 19349663u);
  const double sp = 18.0; int n = (int)std::ceil(size / sp);
  static const Keep keep[3] = { { BUNKERS[0].cx + 40, BUNKERS[0].cz, 140 }, { BUNKERS[1].cx + 40, BUNKERS[1].cz, 140 }, { 5400, 3300, 900 } };
  auto add = [&](int kind, double x, double h, double z, double sc, double r2, uint32_t tint, double rockCol) {
    InstanceData d = { (float)x, (float)(h - 0.15), (float)z, (float)sc, (float)(r2 * 6.28), tint, 0.0f, 0.0f }; (void)rockCol;
    T.inst[kind].push_back(d); T.maxY = std::max(T.maxY, (float)(h + 12 * sc)); T.minY = std::min(T.minY, (float)h);
    double r = kind == P_PINE || kind == P_SNOWPINE ? 0.45 * sc : kind == P_CACTUS ? 0.5 * sc : kind == P_ROCK ? 0.8 * sc : kind == P_TREE ? 0.5 * sc : kind == P_PALM ? 0.4 * sc : 0;
    if (r > 0) T.colliders.push_back({ (float)x, (float)z, (float)r });
  };
  for (int j = 0; j < n; j++) for (int i = 0; i < n; i++) {
    double x = x0 + (i + rnd.next()) * sp, z = z0 + (j + rnd.next()) * sp, r1 = rnd.next(), r2 = rnd.next();
    if (std::fabs(x) < CITY_EDGE + 16 && std::fabs(z) < CITY_EDGE + 16) continue;
    double h = heightAt(x, z); if (h < SEA_Y + 0.8) continue;
    if (roadDist(x, z) < 220) { RoadHit r = roadAt(x, z); if (r.ok && r.d < r.road->hw + 14) continue; }
    bool blocked = false; for (auto& k : keep) if ((k.x - x) * (k.x - x) + (k.z - z) * (k.z - z) < k.r * k.r) blocked = true; if (blocked) continue;
    Climate cl = climate(x, z); double sh = x - coastX(z), clump = 0.25 + 1.5 * fbm(x * 0.012 + 3, z * 0.012 + 9, 3, 101);
    double slope = std::hypot((heightAt(x + 5, z) - h) / 5, (heightAt(x, z + 5) - h) / 5); if (slope > 0.9) continue;
    double sc = 0.75 + r2 * 0.7;
    uint32_t leaf = packColor((float)(0.38 + r2 * 0.12), (float)(0.42 + r2 * 0.09), (float)(0.36 + r2 * 0.1)), rockT = packColor((float)(0.52 - r2 * 0.06), (float)(0.46 - r2 * 0.04), (float)(0.40 - r2 * 0.08)), neutral = packColor(0.5f, 0.5f, 0.5f);
    if (slope > 0.45 && r1 < 0.2) { add(P_ROCK, x, h, z, 1.2 + r2 * 3.2, r2, rockT, 0); continue; }
    if (cl.snow > 0.4) {
      double line = 1 - smoothd(300, 520, h);
      if (r1 < 0.62 * line * clump) add(rnd.next() < 0.3 + 0.7 * smoothd(180, 430, h) ? P_SNOWPINE : P_PINE, x, h, z, sc * 1.1, r2, leaf, 0);
      else if (r1 > 0.97) add(P_ROCK, x, h, z, 1 + r2 * 2.6, r2, rockT, 0);
    } else if (cl.desert > 0.45) {
      uint32_t dry = packColor((float)(0.5 + r2 * 0.15 + cl.desert * 0.35), (float)(0.46 + r2 * 0.1 + cl.desert * 0.12), (float)(0.35 + r2 * 0.1 - cl.desert * 0.1));
      if (r1 < 0.026 * clump) add(P_CACTUS, x, h, z, sc, r2, neutral, 0);
      else if (r1 < 0.07 * clump) add(P_ROCK, x, h, z, 0.8 + r2 * 2.4, r2, rockT, 0);
      else if (r1 < 0.2 * clump) add(P_SHRUB, x, h, z, 0.8 + r2 * 0.9, r2, dry, 0);
    } else if (sh < 1100 && h < 14) {
      if (r1 < 0.22 * smoothd(1100, 300, sh)) add(P_PALM, x, h, z, sc, r2, leaf, 0);
      else if (r1 < 0.34) add(P_SHRUB, x, h, z, 0.8 + r2 * 0.8, r2, leaf, 0);
    } else {
      if (r1 < 0.045 * clump) add(P_TREE, x, h, z, sc * 1.1, r2, leaf, 0);
      else if (r1 < 0.2 * clump) add(P_SHRUB, x, h, z, 0.8 + r2 * 0.9, r2, leaf, 0);
      else if (r1 > 0.995) add(P_ROCK, x, h, z, 1 + r2 * 2, r2, rockT, 0);
    }
  }
}

Scenery::TileCPU Scenery::build(int tx, int tz) {
  TileCPU T; T.tx = tx; T.tz = tz;
  auto it = segs.find(tkey(tx, tz));
  if (it != segs.end()) for (auto& rs : it->second) emit(T, ROADS[rs.first], rs.second);
  scatter(T, tx * TILE, tz * TILE, TILE);
  return T;
}
void Scenery::init(Gfx& g) {
  prepareRoads(); buildProps(g, props);
  unsigned n = std::max(2u, std::thread::hardware_concurrency()); n = n > 2 ? n - 1 : n;
  for (unsigned i = 0; i < n; i++) workers.emplace_back([this] { workerLoop(); });
}
Scenery::~Scenery() { quit = true; cv.notify_all(); for (auto& t : workers) if (t.joinable()) t.join(); }
void Scenery::workerLoop() {
  for (;;) {
    std::array<int, 2> j; { std::unique_lock<std::mutex> lk(mu); cv.wait(lk, [this] { return quit || !jobs.empty(); }); if (quit) return; j = jobs.front(); jobs.pop_front(); }
    TileCPU t = build(j[0], j[1]); { std::lock_guard<std::mutex> lk(mu); done.push_back(std::move(t)); }
  }
}
void Scenery::upload(Gfx& g, TileCPU& c) {
  Tile t; t.tx = c.tx; t.tz = c.tz; t.asphalt = uploadMesh(g, c.asphalt); t.gravel = uploadMesh(g, c.gravel); t.conc = uploadMesh(g, c.conc); t.metal = uploadMesh(g, c.metal);
  for (int k = 0; k < P_COUNT; k++) if (!c.inst[k].empty()) { t.inst[k] = g.makeBuffer(c.inst[k].data(), (UINT)(c.inst[k].size() * sizeof(InstanceData)), sizeof(InstanceData), (UINT)c.inst[k].size()); t.count[k] = (UINT)c.inst[k].size(); }
  t.x0 = (float)(c.tx * TILE); t.z0 = (float)(c.tz * TILE); t.x1 = t.x0 + (float)TILE; t.z1 = t.z0 + (float)TILE; t.minY = c.minY > c.maxY ? -50.0f : c.minY - 1; t.maxY = c.minY > c.maxY ? 1500.0f : c.maxY + 2;
  if (c.minY > c.maxY) { t.minY = -60; t.maxY = 1400; }   // empty tiles are never drawn anyway
  addColliders(key(c.tx, c.tz), c.colliders); tiles[key(c.tx, c.tz)] = std::move(t);
}
void Scenery::update(Gfx& g, Vec3 cam, int maxUploads) {
  for (int n = 0; n < maxUploads; n++) { TileCPU c; { std::lock_guard<std::mutex> lk(mu); if (done.empty()) break; c = std::move(done.front()); done.pop_front(); } pending.erase(key(c.tx, c.tz)); upload(g, c); }
  int cx = (int)std::floor(cam.x / TILE), cz = (int)std::floor(cam.z / TILE);
  std::vector<std::array<int, 3>> want;
  for (int z = cz - RADIUS; z <= cz + RADIUS; z++) for (int x = cx - RADIUS; x <= cx + RADIUS; x++) { int d = std::max(std::abs(x - cx), std::abs(z - cz)); want.push_back({ d, x, z }); }
  std::sort(want.begin(), want.end());
  for (auto& w : want) { int64_t k = key(w[1], w[2]); if (tiles.count(k) || pending.count(k)) continue; pending[k] = true; { std::lock_guard<std::mutex> lk(mu); jobs.push_back({ w[1], w[2] }); } cv.notify_one(); }
  for (auto it = tiles.begin(); it != tiles.end();) {
    int d = std::max(std::abs(it->second.tx - cx), std::abs(it->second.tz - cz));
    if (d > RADIUS + 1) { Tile& t = it->second; for (GpuMesh* m : { &t.asphalt, &t.gravel, &t.conc, &t.metal }) releaseMesh(g, *m); for (auto& b : t.inst) g.releaseBuffer(b); removeColliders(it->first); it = tiles.erase(it); } else ++it;
  }
}
void Scenery::loadNow(Gfx& g, Vec3 cam) {
  for (;;) {
    update(g, cam, 1000); int cx = (int)std::floor(cam.x / TILE), cz = (int)std::floor(cam.z / TILE); bool all = true;
    for (int z = cz - RADIUS; z <= cz + RADIUS; z++) for (int x = cx - RADIUS; x <= cx + RADIUS; x++) if (!tiles.count(key(x, z))) all = false;
    if (all) break; Sleep(5);
  }
}
void Scenery::draw(Renderer& r, bool shadow, const Frustum& f) {
  Mat4 I = Mat4::identity();
  Material asph; asph.type = 2; asph.rough = 0.6f;
  Material grav; grav.type = 0; grav.rough = 0.95f;
  Material conc; conc.type = 0; conc.rough = 0.85f; conc.twoSided = true;
  Material steel; steel.type = 0; steel.rough = 0.4f; steel.metal = 0.7f; steel.twoSided = true;
  Material foliage; foliage.type = 5; foliage.twoSided = true; Material solid; solid.type = 0; solid.rough = 0.9f; solid.twoSided = true;
  for (auto& kv : tiles) {
    const Tile& t = kv.second;
    if (!f.boxVisible(t.x0, t.minY, t.z0, t.x1, t.maxY, t.z1)) continue;
    if (!shadow) { r.drawMeshMat(t.asphalt, I, asph); r.drawMeshMat(t.gravel, I, grav); }
    r.drawMeshMat(t.conc, I, conc); r.drawMeshMat(t.metal, I, steel);
    for (int k = 0; k < P_COUNT; k++) if (t.count[k]) r.drawMeshMat(props.mesh[k], I, (k == P_ROCK || k == P_CACTUS) ? solid : foliage, &t.inst[k], t.count[k]);
  }
}
