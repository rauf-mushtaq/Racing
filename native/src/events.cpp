#include "events.h"
#include "world.h"
using namespace grid;

static std::vector<std::array<int, 2>> stairs(int x0, int z0, int x1, int z1) {
  std::vector<std::array<int, 2>> n = { { x0, z0 } }; int x = x0, z = z0;
  while (x != x1 || z != z1) { if (z != z1) { z += z1 > z ? 1 : -1; n.push_back({ x, z }); } if (x != x1) { x += x1 > x ? 1 : -1; n.push_back({ x, z }); } }
  return n;
}
const std::vector<RaceEvent>& raceEvents() {
  static std::vector<RaceEvent> E;
  if (!E.empty()) return E;
  auto w = [&](const char* id, const char* name, const char* desc, std::vector<RoadLeg> road, bool lap = false) { RaceEvent e; e.id = id; e.group = "Open country"; e.name = name; e.desc = desc; e.road = road; e.lap = lap; E.push_back(e); };
  auto c = [&](const char* id, const char* name, const char* desc, std::vector<std::array<int, 2>> nodes, bool lap = false) { RaceEvent e; e.id = id; e.group = "City"; e.name = name; e.desc = desc; e.nodes = nodes; e.lap = lap; E.push_back(e); };
  w("w-desert", "Desert Highway", "East out of the city across the desert and over the great canyon bridge.", { { "east", 0 } });
  w("w-pass", "Mountain Pass", "North into the snow, climbing the pass between the peaks.", { { "north", 0 } });
  w("w-coast", "Coast Highway", "The long sweep up the western coast with the ocean beside you.", { { "ring", 1 } });
  w("w-south", "Southern Freeway", "Flat out down the freeway to the wind farm and the ring road.", { { "south", 0 } });
  w("w-runway", "Runway Run", "A 2 km straight on the dry lakebed. See what the car can really do.", { { "runway", 0 } });
  w("w-ring", "Grand Ring", "The whole 43 km ring motorway: coast, mountains, desert and back.", { { "ring", 0 } }, true);
  c("blvd", "Boulevard Dash", "Flat out down Sunset Boulevard, the whole length of the city.", { { 0, 12 }, { 0, -12 } });
  c("downtown", "Downtown Dash", "Short and twisty through the glass towers.", { { 0, 3 }, { 0, 1 }, { -1, 1 }, { -1, -1 }, { 1, -1 }, { 1, -3 }, { 0, -3 }, { 0, -4 } });
  c("palms", "Palm Zigzag", "A staircase of turns across the middle of town under the palms.", stairs(-6, 6, 6, -6));
  c("crosstown", "Crosstown", "East to west on the big roads, with a detour downtown.", { { 12, 4 }, { 0, 4 }, { 0, -4 }, { -12, -4 }, { -12, 0 }, { -4, 0 } });
  c("ring", "Inner Ring", "One lap of the six-lane ring road around downtown.", { { 0, 4 }, { 4, 4 }, { 4, -4 }, { -4, -4 }, { -4, 4 }, { 0, 4 } }, true);
  c("coast", "Coast Road", "Down the western edge of the city with the ocean beside you.", { { -12, 12 }, { -12, -12 } });
  c("hills", "Hill Run", "Along the northern ring road under the hills.", { { -12, -12 }, { 12, -12 }, { 12, -4 } });
  c("suburb", "Suburb Sprint", "Tight turns through the quiet streets of the south-east suburbs.", { { 8, 8 }, { 12, 8 }, { 12, 12 }, { 4, 12 }, { 4, 9 }, { 7, 9 }, { 7, 11 }, { 8, 11 } });
  c("grand", "Grand Tour", "The long one: downtown, the hills road and the suburbs, 10 km in all.", { { 0, 12 }, { 0, 8 }, { 8, 8 }, { 8, 0 }, { 4, 0 }, { 4, -4 }, { -4, -4 }, { -4, 4 }, { -8, 4 }, { -8, 12 } });
  return E;
}
static int nearestIdx(const Road& R, double x, double z) { int bi = 0; double bd = 1e18; for (int i = 0; i < (int)R.x.size(); i++) { double d = (R.x[i] - x) * (R.x[i] - x) + (R.z[i] - z) * (R.z[i] - z); if (d < bd) { bd = d; bi = i; } } return bi; }
static Medals medalsFor(double gold) { auto r = [](double v) { return std::round(v * 10) / 10; }; return { r(gold), r(gold * 1.12), r(gold * 1.28) }; }

static Route buildRoadRoute(const RaceEvent& ev) {
  struct P { double x, z, y, hw; }; std::vector<P> pts;
  for (const RoadLeg& leg : ev.road) {
    const Road* R = nullptr; for (const Road& r : ROADS) if (r.id == leg.id) R = &r; if (!R) continue;
    int i0 = 0, i1 = (int)R->x.size() - 1; if (leg.mode == 1) { i0 = nearestIdx(*R, -2800, 3500); i1 = nearestIdx(*R, -2800, -3500); }
    if (i0 <= i1) for (int i = i0; i <= i1; i++) pts.push_back({ R->x[i], R->z[i], R->y[i] + R->lift, R->hw }); else for (int i = i0; i >= i1; i--) pts.push_back({ R->x[i], R->z[i], R->y[i] + R->lift, R->hw });
  }
  Route rt; rt.ev = &ev; double length = 0, next = 350;
  for (size_t k = 1; k < pts.size(); k++) {
    length += std::hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
    if (length >= next || k == pts.size() - 1) {
      const P &a = pts[k >= 2 ? k - 2 : 0], &b = pts[std::min(pts.size() - 1, k + 1)]; double l = std::hypot(b.x - a.x, b.z - a.z); if (l < 1e-9) l = 1;
      Checkpoint cp; cp.world = true; cp.x = pts[k].x; cp.z = pts[k].z; cp.y = pts[k].y; cp.tx = (b.x - a.x) / l; cp.tz = (b.z - a.z) / l; cp.hw = pts[k].hw; cp.r = pts[k].hw + 16; rt.cps.push_back(cp); next += 350;
    }
  }
  const P &p0 = pts[4], &p1 = pts[6]; double tl = std::hypot(p1.x - p0.x, p1.z - p0.z), tx = (p1.x - p0.x) / tl, tz = (p1.z - p0.z) / tl, off = ev.road[0].id == "runway" ? 0 : 5.2;
  rt.start = { p0.x - tz * off, p0.z + tx * off, std::atan2(tx, tz) }; rt.length = length; rt.medals = medalsFor(length / 58); return rt;
}
Route buildRoute(const RaceEvent& ev) {
  if (!ev.road.empty()) return buildRoadRoute(ev);
  Route rt; rt.ev = &ev; const auto& nodes = ev.nodes;
  for (size_t k = 0; k + 1 < nodes.size(); k++) {
    auto a = nodes[k], b = nodes[k + 1]; int di = (b[0] > a[0]) - (b[0] < a[0]), dj = (b[1] > a[1]) - (b[1] < a[1]), steps = std::abs(b[0] - a[0]) + std::abs(b[1] - a[1]);
    for (int s = 1; s <= steps; s++) { int i = a[0] + di * s, j = a[1] + dj * s; if (s == steps || s % 2 == 0) { Checkpoint cp; cp.i = i; cp.j = j; cp.x = i * SP; cp.z = j * SP; cp.alongZ = di == 0; rt.cps.push_back(cp); } }
  }
  auto a = nodes[0], b = nodes[1]; int dx = (b[0] > a[0]) - (b[0] < a[0]), dz = (b[1] > a[1]) - (b[1] < a[1]), k = dx == 0 ? a[0] : a[1]; double cross = dx == 0 ? hw(a[1]) : hw(a[0]), rx = -dz, rz = dx, off = laneOffset(k, 1);
  rt.start = { a[0] * SP + dx * (cross + 26) + rx * off, a[1] * SP + dz * (cross + 26) + rz * off, std::atan2((double)dx, (double)dz) };
  std::vector<std::array<double, 2>> path = { { rt.start.x, rt.start.z } }; for (size_t n = 1; n < nodes.size(); n++) path.push_back({ nodes[n][0] * SP, nodes[n][1] * SP });
  double length = 0; for (size_t n = 1; n < path.size(); n++) length += std::hypot(path[n][0] - path[n - 1][0], path[n][1] - path[n - 1][1]);
  int turns = (int)nodes.size() - 2; rt.length = length; rt.medals = medalsFor(length / 50 + turns * 1.8); return rt;
}
bool inCheckpoint(const Checkpoint& cp, double x, double z) {
  if (cp.world) return (x - cp.x) * (x - cp.x) + (z - cp.z) * (z - cp.z) < cp.r * cp.r;
  return std::fabs(x - cp.x) < hw(cp.i) + 3 && std::fabs(z - cp.z) < hw(cp.j) + 3;
}
