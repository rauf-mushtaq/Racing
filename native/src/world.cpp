#include "world.h"
#include <unordered_map>
#include <functional>

std::vector<Road> ROADS;
Airfield AIRFIELD = { 5400, 3300, 520, 22, 2350, 4500, 24 };
Bunker BUNKERS[2] = { { "alpine", 1180, -5060, -1, 0, 0, false }, { "mesa", 6150, -1750, -1, 0, 0, true } };
static const double APRON = 46;
static const double STEP = 12;
static const double MW = 11.3;   // motorway half width

using Pt = std::array<double, 2>;
using Path = std::vector<Pt>;

double coastX(double z) { return -3450 + 160 * std::sin(z / 850) + 90 * std::sin(z / 260 + 1.3); }

Climate climate(double x, double z) {
  double r = std::hypot(x, z) + 1, ex = x / r, nz = -z / r;
  double wN = fbm(x * 0.00022 + 3.1, z * 0.00022 + 7.7, 3, 11), wE = fbm(x * 0.00022 + 9.3, z * 0.00022 + 1.9, 3, 12);
  double n = nz + (wN - 0.5) * 0.55, e = ex + (wE - 0.5) * 0.55;
  double snow = smoothd(0.30, 0.62, n);
  return { snow, (1 - snow) * smoothd(0.10, 0.48, e) };
}
static double mountainH(double x, double z) {
  double rd = 1 - std::fabs(2 * fbm(x * 0.00075 + 5.5, z * 0.00075 + 2.2, 5, 51) - 1);
  return 120 + 1100 * std::pow(rd, 1.7) * (0.35 + 0.9 * fbm(x * 0.0003 + 1, z * 0.0003 + 8, 3, 52));
}
static double desertCx(double z) { return 3900 + 70 * std::sin(z / 520) + 40 * std::sin(z / 170); }
static double desertH(double x, double z) {
  double dunes = 14 * fbm(x * 0.0035 + 2, z * 0.0035 + 9, 4, 61) + 6 * fbm(x * 0.012, z * 0.012, 2, 62);
  double q = fbm(x * 0.00055 + 11, z * 0.00055 + 5, 4, 63);
  double mesa = smoothd(0.56, 0.585, q);
  return 8 + dunes + 95 * mesa + 22 * smoothd(0.66, 0.69, q) * mesa;
}
double canyonDepth(double x, double z) {
  double u = (x - desertCx(z)) / 95;
  return 85 * std::exp(-u * u) * smoothd(-5200, -4400, z) * smoothd(5200, 4400, z);
}
static double grassH(double x, double z) { return 4 + 36 * std::max(0.0, fbm(x * 0.0009 + 4, z * 0.0009 + 1, 4, 71) - 0.35); }

// --- Road path helpers ------------------------------------------------------------
static Path roundPath(const Path& pts, double r) {
  Path out{ pts[0] };
  for (size_t i = 1; i + 1 < pts.size(); i++) {
    const Pt &p = pts[i], &a = pts[i - 1], &b = pts[i + 1];
    double da = std::hypot(a[0] - p[0], a[1] - p[1]), db = std::hypot(b[0] - p[0], b[1] - p[1]), ra = std::min(r, da / 2), rb = std::min(r, db / 2);
    Pt A = { p[0] + (a[0] - p[0]) / da * ra, p[1] + (a[1] - p[1]) / da * ra }, B = { p[0] + (b[0] - p[0]) / db * rb, p[1] + (b[1] - p[1]) / db * rb };
    for (int k = 0; k <= 14; k++) { double t = k / 14.0, u = 1 - t; out.push_back({ u * u * A[0] + 2 * u * t * p[0] + t * t * B[0], u * u * A[1] + 2 * u * t * p[1] + t * t * B[1] }); }
  }
  out.push_back(pts.back());
  return out;
}
static Path resample(const Path& pts) {
  Path out{ pts[0] }; double carry = 0;
  for (size_t i = 1; i < pts.size(); i++) {
    const Pt &a = pts[i - 1], &b = pts[i]; double d = std::hypot(b[0] - a[0], b[1] - a[1]);
    double t = STEP - carry;
    while (t <= d) { out.push_back({ a[0] + (b[0] - a[0]) * t / d, a[1] + (b[1] - a[1]) * t / d }); t += STEP; }
    carry = d - (t - STEP);
  }
  const Pt& last = pts.back(); const Pt& q = out.back();
  if (std::hypot(last[0] - q[0], last[1] - q[1]) > 1) out.push_back(last);
  return out;
}
struct Wob { double amp, k, ph; };
static Path wobble(const Path& pts, const std::vector<Wob>& amps, double ends = 300) {
  size_t n = pts.size(); std::vector<double> s{ 0 };
  for (size_t i = 1; i < n; i++) s.push_back(s[i - 1] + std::hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  double L = s[n - 1]; Path out;
  for (size_t i = 0; i < n; i++) {
    const Pt &a = pts[i > 0 ? i - 1 : 0], &b = pts[std::min(n - 1, i + 1)];
    double tx = b[0] - a[0], tz = b[1] - a[1], l = std::hypot(tx, tz); if (l == 0) l = 1;
    double w = 0; for (auto& A : amps) w += A.amp * std::sin(PI * 2 * A.k * s[i] / L + A.ph);
    double fade = ends != 0 ? std::min({ 1.0, s[i] / ends, (L - s[i]) / ends }) : 1;
    out.push_back({ pts[i][0] - tz / l * w * fade, pts[i][1] + tx / l * w * fade });
  }
  return out;
}
static Road& addRoad(const char* id, int kind, const Path& xz, double hw, bool closed = false) {
  Road R; R.id = id; R.kind = kind; R.hw = hw; R.closed = closed; R.s.push_back(0);
  for (auto& p : xz) { R.x.push_back(p[0]); R.z.push_back(p[1]); }
  R.y.assign(xz.size(), 0);
  for (size_t i = 1; i < xz.size(); i++) R.s.push_back(R.s[i - 1] + std::hypot(R.x[i] - R.x[i - 1], R.z[i] - R.z[i - 1]));
  R.len = R.s.back(); R.idx = (int)ROADS.size(); ROADS.push_back(std::move(R));
  return ROADS.back();
}
static int nearestPoint(const Road& R, double x, double z) {
  int bi = 0; double bd = 1e18;
  for (size_t i = 0; i < R.x.size(); i++) { double d = (R.x[i] - x) * (R.x[i] - x) + (R.z[i] - z) * (R.z[i] - z); if (d < bd) { bd = d; bi = (int)i; } }
  return bi;
}

// --- Distance to the nearest road (coarse chamfer field) -----------------------------
static const double DC = 100;
static int DNX, DNZ; static std::vector<float> distField;
double roadDist(double x, double z) {
  double fx = (x - WORLD.x0) / DC, fz = (z - WORLD.z0) / DC;
  int x0 = (int)clampd(std::floor(fx), 0, DNX - 2), z0 = (int)clampd(std::floor(fz), 0, DNZ - 2);
  double tx = clampd(fx - x0, 0, 1), tz = clampd(fz - z0, 0, 1);
  double a = distField[z0 * DNX + x0], b = distField[z0 * DNX + x0 + 1], c = distField[(z0 + 1) * DNX + x0], d = distField[(z0 + 1) * DNX + x0 + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

double baseHeight(double x, double z) {
  Climate cl = climate(x, z); double wg = std::max(0.0, 1 - cl.snow - cl.desert);
  double carve = 0.14 + 0.86 * smoothd(250, 1100, roadDist(x, z));
  double h = 0;
  if (wg > 0.001) h += grassH(x, z) * wg;
  if (cl.desert > 0.001) h += desertH(x, z) * cl.desert;
  if (cl.snow > 0.001) h += mountainH(x, z) * cl.snow;
  h *= carve;
  if (cl.desert > 0.001) h -= canyonDepth(x, z) * cl.desert;
  h *= smoothd(CITY_LIMIT - 100, CITY_LIMIT + 1300, std::max(std::fabs(x), std::fabs(z)));
  double sh = x - coastX(z);
  double beach = clampd(-4 + sh * 0.015, -34, 3.2);
  return lerpd(beach, h, smoothd(40, 420, sh));
}

// --- Road heights -------------------------------------------------------------------
static void profile(Road& R, const std::vector<std::pair<int, double>>& anchors) {
  int n = (int)R.x.size(); double g = (R.kind == ROAD_MOTORWAY ? 0.07 : R.kind == ROAD_RUNWAY ? 0.002 : 0.1) * STEP;
  std::vector<double> y(n);
  for (int i = 0; i < n; i++) y[i] = baseHeight(R.x[i], R.z[i]) + canyonDepth(R.x[i], R.z[i]) * climate(R.x[i], R.z[i]).desert;
  if (R.kind == ROAD_RUNWAY) { double m = 0; for (double v : y) m += v; m /= n; std::fill(y.begin(), y.end(), m); }
  auto smoothPass = [&](int w) {
    std::vector<double> o(n);
    for (int i = 0; i < n; i++) { double a = 0; int c = 0; for (int k = -w; k <= w; k++) { int j = i + k; if (R.closed) j = (j + n - 1) % (n - 1); else j = std::clamp(j, 0, n - 1); a += y[j]; c++; } o[i] = a / c; }
    y = o;
  };
  smoothPass(14); smoothPass(14);
  for (auto& [i, val] : anchors) { double d = val - y[i], reach = 500; for (int j = 0; j < n; j++) y[j] += d * (1 - smoothd(0, reach, std::fabs(R.s[j] - R.s[i]))); }
  auto pin = [&]() { for (auto& [i, val] : anchors) y[i] = val; };
  for (int it = 0; it < 4; it++) {
    pin(); for (int i = 1; i < n; i++) y[i] = clampd(y[i], y[i - 1] - g, y[i - 1] + g);
    pin(); for (int i = n - 2; i >= 0; i--) y[i] = clampd(y[i], y[i + 1] - g, y[i + 1] + g);
    if (R.closed) y[n - 1] = y[0];
  }
  pin();
  R.y = y;
}

// --- Finding the road under a point -------------------------------------------------
static const double GR = 100;
static std::unordered_map<int64_t, std::vector<int64_t>> grid;
static int64_t gk(int cx, int cz) { return (int64_t)(cx + 200) * 1000 + (cz + 200); }

RoadHit roadAt(double x, double z) {
  int cx = (int)std::floor(x / GR), cz = (int)std::floor(z / GR);
  double bd = 1e18, bt = 0; const Road* br = nullptr; int bi = 0;
  for (int dx = -1; dx <= 1; dx++) for (int dz = -1; dz <= 1; dz++) {
    auto it = grid.find(gk(cx + dx, cz + dz)); if (it == grid.end()) continue;
    for (int64_t ref : it->second) {
      const Road& R = ROADS[ref / 1048576]; int i = (int)(ref % 1048576);
      double ax = R.x[i], az = R.z[i], ex = R.x[i + 1] - ax, ez = R.z[i + 1] - az, l2 = ex * ex + ez * ez; if (l2 == 0) l2 = 1;
      double t = clampd(((x - ax) * ex + (z - az) * ez) / l2, 0, 1), px = ax + ex * t - x, pz = az + ez * t - z, d2 = px * px + pz * pz;
      if (d2 < bd) { bd = d2; br = &R; bi = i; bt = t; }
    }
  }
  RoadHit h; if (!br) return h;
  double ex = br->x[bi + 1] - br->x[bi], ez = br->z[bi + 1] - br->z[bi];
  h.ok = true; h.d = std::sqrt(bd); h.road = br; h.i = bi; h.t = bt;
  h.y = br->y[bi] + (br->y[bi + 1] - br->y[bi]) * bt; h.s = br->s[bi] + (br->s[bi + 1] - br->s[bi]) * bt;
  h.side = ((x - br->x[bi]) * ez - (z - br->z[bi]) * ex) >= 0 ? 1 : -1;
  return h;
}

// --- Stamps and final height ----------------------------------------------------------
double lakeDist(double x, double z) { return std::hypot(x - AIRFIELD.x, std::max({ 0.0, AIRFIELD.runwayZ0 - z, z - AIRFIELD.runwayZ1 })); }
static double stampHeight(double x, double z, double h) {
  double da = lakeDist(x, z);
  if (da < AIRFIELD.r + 800) h = lerpd(AIRFIELD.y - 0.05, h, smoothd(AIRFIELD.r, AIRFIELD.r + 800, da));
  for (auto& b : BUNKERS) {
    double dx = x - b.cx, dz = z - b.cz;
    if (std::fabs(dx) > 520 || std::fabs(dz) > 520) continue;
    double u = dx * b.fx + dz * b.fz, v = -dx * b.fz + dz * b.fx;
    if (b.butte && u < 0) {
      double rough = 38 * (fbm(x * 0.012 + 3, z * 0.012 + 8, 3, 91) - 0.5), edge = std::max({ 0.0, -u - 340 + rough, std::fabs(v) - 200 + rough });
      double top = b.apronY + 150 + 8 * (fbm(x * 0.02, z * 0.02, 2, 92) - 0.5), w = (1 - smoothd(0, 44, edge)) * smoothd(6, 40, -u);
      h = std::max(h, lerpd(h, top, w));
    }
    if (u < -8 && u > -400) h = std::max(h, lerpd(h, b.apronY + std::min(60.0, (-u - 8) * 2.2), smoothd(70, 30, std::fabs(v))));
    if (u > -8 && u < APRON + 20 && std::fabs(v) < 48) h = lerpd(h, b.apronY, smoothd(APRON + 20, APRON - 2, std::max(u, 0.0)) * smoothd(48, 28, std::fabs(v)));
  }
  return h;
}
double heightAt(double x, double z) {
  double h = baseHeight(x, z);
  if (roadDist(x, z) < 260) {
    RoadHit r = roadAt(x, z);
    if (r.ok && r.d < r.road->hw + 60) {
      double m = smoothd(r.road->hw + 40, r.road->hw + 5, r.d) * (1 - smoothd(5, 9, r.y - h));
      h = lerpd(h, r.y - 0.3, m);
    }
  }
  return stampHeight(x, z, h);
}

// --- What the car drives on ----------------------------------------------------------
struct Surf { float mu, drag; };
static const Surf SURF[8] = { {1, 0}, {0.8f, 50}, {0.72f, 95}, {0.62f, 210}, {0.42f, 150}, {0.9f, 30}, {0.82f, 40}, {0.9f, 0} };
static int groundKind(double x, double z, double h, double slope) {
  Climate c = climate(x, z);
  if (slope > 0.75) return SURF_ROCK;
  if (lakeDist(x, z) < AIRFIELD.r + 60) return SURF_LAKEBED;
  double sh = x - coastX(z);
  if (sh < 420 && h < 3.5) return SURF_SAND;
  if (c.snow > 0.5 || h > 520) return SURF_SNOW;
  if (c.desert > 0.45) return SURF_SAND;
  return SURF_GRASS;
}
static Ground mk(double y, int kind) { return { (float)y, kind, SURF[kind].mu, SURF[kind].drag, kind == SURF_GRASS }; }
Ground groundAt(double x, double z) {
  // The city is not part of this build yet: its square is flat asphalt.
  if (std::fabs(x) <= CITY_EDGE + 6 && std::fabs(z) <= CITY_EDGE + 6) return mk(0, SURF_ASPHALT);
  if (roadDist(x, z) < 260) {
    RoadHit r = roadAt(x, z);
    if (r.ok) {
      if (r.d < r.road->hw) return mk(r.y, SURF_ASPHALT);
      if (r.d < r.road->hw + 3.5 && r.road->kind == ROAD_MOTORWAY) return mk(r.y - 0.02, SURF_GRAVEL);
    }
  }
  double h = heightAt(x, z);
  return mk(h, groundKind(x, z, h, 0));
}

// --- Building the network (runs once at start-up) ---------------------------------------
void worldInit() {
  if (!ROADS.empty()) return;
  ROADS.reserve(16);   // addRoad hands out references, so the vector must not move
  const double EDGE = CITY_EDGE;
  Path ringPts = wobble(resample(roundPath({ {0, -6200}, {6500, -6200}, {6500, 6200}, {-2800, 6200}, {-2800, -6200}, {0, -6200} }, 700)), { {70, 23, 0.4}, {32, 47, 2.1} }, 0);
  ringPts.back() = ringPts.front();
  addRoad("ring", ROAD_MOTORWAY, ringPts, MW, true);
  auto spoke = [&](const char* id, Pt from, Pt to) {
    int t = nearestPoint(ROADS[0], to[0], to[1]); Pt end = { ROADS[0].x[t], ROADS[0].z[t] };
    return &addRoad(id, ROAD_MOTORWAY, wobble(resample({ from, end }), { {55, 3, 0.7}, {22, 7, 2.4} }, 350), MW);
  };
  int SN = spoke("north", { 0, -EDGE - 8 }, { 0, -6200 })->idx, SE = spoke("east", { EDGE + 8, 0 }, { 6500, 0 })->idx;
  int SS = spoke("south", { 0, EDGE + 8 }, { 0, 6200 })->idx, SW = spoke("west", { -EDGE - 8, 0 }, { -2800, 0 })->idx;
  Road* RING = &ROADS[0];
  { // hidden service roads, the runway and its taxiway
    Road& sn_ = ROADS[SN]; int sn = nearestPoint(sn_, 0, -5060); Pt P = { sn_.x[sn], sn_.z[sn] }; Bunker& b = BUNKERS[0];
    addRoad("svc-alpine", ROAD_SERVICE, wobble(resample(roundPath({ P, {320, -5120}, {680, -4960}, {960, -5110}, {b.cx - APRON, b.cz} }, 130)), { {22, 6, 0.3} }, 120), 4.4);
    Road& se_ = ROADS[SE]; int se = nearestPoint(se_, 4900, 0); Pt Q = { se_.x[se], se_.z[se] }; Bunker& d = BUNKERS[1];
    addRoad("svc-mesa", ROAD_SERVICE, wobble(resample(roundPath({ Q, {5200, -500}, {5700, -1500}, {d.cx - APRON, d.cz} }, 120)), { {22, 5, 1.1} }, 120), 4.4);
    int ra = nearestPoint(*RING, 6500, 3300); Pt G = { RING->x[ra], RING->z[ra] };
    addRoad("svc-airfield", ROAD_SERVICE, resample({ G, {AIRFIELD.x + 160, AIRFIELD.z} }), 5.5);
    addRoad("runway", ROAD_RUNWAY, resample({ {AIRFIELD.x, AIRFIELD.runwayZ0}, {AIRFIELD.x, AIRFIELD.runwayZ1} }), AIRFIELD.hw);
    addRoad("taxiway", ROAD_SERVICE, resample({ {AIRFIELD.x, AIRFIELD.z}, {AIRFIELD.x + 160, AIRFIELD.z} }), 9);
  }
  // Distance field.
  DNX = (int)std::ceil((WORLD.x1 - WORLD.x0) / DC) + 1; DNZ = (int)std::ceil((WORLD.z1 - WORLD.z0) / DC) + 1;
  distField.assign((size_t)DNX * DNZ, 1e4f);
  for (auto& R : ROADS) for (size_t i = 0; i < R.x.size(); i++) {
    int cx = (int)std::lround((R.x[i] - WORLD.x0) / DC), cz = (int)std::lround((R.z[i] - WORLD.z0) / DC);
    if (cx >= 0 && cx < DNX && cz >= 0 && cz < DNZ) distField[(size_t)cz * DNX + cx] = 0;
  }
  for (int pass = 0; pass < 2; pass++) {
    bool fwd = pass == 0;
    static const int F[4][3] = { {-1, 0, 100}, {0, -1, 100}, {-1, -1, 141}, {1, -1, 141} }, B[4][3] = { {1, 0, 100}, {0, 1, 100}, {1, 1, 141}, {-1, 1, 141} };
    for (int zi = fwd ? 0 : DNZ - 1; fwd ? zi < DNZ : zi >= 0; zi += fwd ? 1 : -1) for (int xi = fwd ? 0 : DNX - 1; fwd ? xi < DNX : xi >= 0; xi += fwd ? 1 : -1) {
      float d = distField[(size_t)zi * DNX + xi];
      for (int k = 0; k < 4; k++) {
        const int* o = fwd ? F[k] : B[k]; int nx = xi + o[0], nz = zi + o[1];
        if (nx >= 0 && nx < DNX && nz >= 0 && nz < DNZ) d = std::min(d, distField[(size_t)nz * DNX + nx] + (float)o[2]);
      }
      distField[(size_t)zi * DNX + xi] = d;
    }
  }
  AIRFIELD.y = std::max(14.0, baseHeight(AIRFIELD.x, AIRFIELD.z));
  // Profiles: the ring first, then the spokes meeting it at its height.
  profile(*RING, {});
  for (int si : { SN, SE, SS, SW }) {
    Road& S = ROADS[si]; int end = (int)S.x.size() - 1, rj = nearestPoint(*RING, S.x[end], S.z[end]);
    profile(S, { {0, 0}, {end, RING->y[rj]} });
  }
  for (auto& b : BUNKERS) b.apronY = baseHeight(b.cx + b.fx * 30, b.cz + b.fz * 30);
  for (auto& R : ROADS) {
    if (R.kind == ROAD_MOTORWAY) continue;
    int last = (int)R.x.size() - 1;
    if (R.id == "svc-alpine") profile(R, { {0, ROADS[SN].y[nearestPoint(ROADS[SN], R.x[0], R.z[0])]}, {last, BUNKERS[0].apronY} });
    else if (R.id == "svc-mesa") profile(R, { {0, ROADS[SE].y[nearestPoint(ROADS[SE], R.x[0], R.z[0])]}, {last, BUNKERS[1].apronY} });
    else if (R.id == "svc-airfield") profile(R, { {0, RING->y[nearestPoint(*RING, R.x[0], R.z[0])]}, {last, AIRFIELD.y} });
    else profile(R, {});
  }
  for (auto& R : ROADS) if (R.id == "runway" || R.id == "taxiway") std::fill(R.y.begin(), R.y.end(), AIRFIELD.y);
  // Spatial index.
  for (auto& R : ROADS) for (size_t i = 0; i + 1 < R.x.size(); i++) {
    int64_t ref = (int64_t)R.idx * 1048576 + (int64_t)i; int64_t seen = -1;
    for (size_t j : { i, i + 1 }) {
      int64_t k = gk((int)std::floor(R.x[j] / GR), (int)std::floor(R.z[j] / GR));
      if (k == seen) continue; seen = k;
      auto& a = grid[k]; if (std::find(a.begin(), a.end(), ref) == a.end()) a.push_back(ref);
    }
  }
}
