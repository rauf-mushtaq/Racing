// Tests for the engine-independent core of the Unreal version (Source/SunsetCity/Core): the city plan, the meshes, the car body, the character's poses, the fighters' behaviour, the
// wanted level. Plain C++17: build and run it with Tests/run_core_tests.sh (no Unreal needed). What these cannot test is the Unreal side (components, materials, lights): see unreal/README.md.
#include "../SunsetCity/Source/SunsetCity/Core/SCBrain.h"
#include "../SunsetCity/Source/SunsetCity/Core/SCBuildings.h"
#include "../SunsetCity/Source/SunsetCity/Core/SCCarBody.h"
#include "../SunsetCity/Source/SunsetCity/Core/SCCityPlan.h"
#include "../SunsetCity/Source/SunsetCity/Core/SCMesh.h"
#include "../SunsetCity/Source/SunsetCity/Core/SCProps.h"
#include "../SunsetCity/Source/SunsetCity/Core/SCRig.h"
#include "../SunsetCity/Source/SunsetCity/Core/SCTerrain.h"
#include "../SunsetCity/Source/SunsetCity/Core/SCVenue.h"
#include "../SunsetCity/Source/SunsetCity/Core/SCWanted.h"
#include <cstdio>
#include <functional>
#include <map>

using namespace SC;
static int gFailed = 0, gChecks = 0;
static void Check(const char* name, bool ok, const std::string& info = "") { gChecks++; if (!ok) gFailed++; std::printf("  %s %s%s%s\n", ok ? "ok  " : "FAIL", name, ok || info.empty() ? "" : "  -> ", ok ? "" : info.c_str()); }
static std::string S(double v) { char b[64]; std::snprintf(b, sizeof b, "%.1f", v); return b; }

// Does a triangle of a closed, roughly star-shaped body face away from the body's long axis? (A check that the winding is right, independent of the mesh's own normals.)
static int FacingInward(const Mesh& m, const std::function<V3(double)>& axisAt) {
  int bad = 0;
  for (size_t t = 0; t + 2 < m.I.size(); t += 3) {
    V3 a = m.P[m.I[t]], b = m.P[m.I[t + 1]], c = m.P[m.I[t + 2]], g = Cross(b - a, c - a); if (Len(g) < 1e-6) continue;
    V3 ctr = (a + b + c) * (1.0 / 3.0), out = ctr - axisAt(ctr.x); if (Dot(g, out) < -1e-6) bad++;
  }
  return bad;
}
static bool Overlap3(const V3& amn, const V3& amx, const V3& bmn, const V3& bmx) { return amn.x < bmx.x && amx.x > bmn.x && amn.y < bmx.y && amx.y > bmn.y && amn.z < bmx.z && amx.z > bmn.z; }

static void TestMesh() {
  std::printf("meshes\n");
  Mesh b; b.Box({0, 0, 0}, {100, 200, 300}, {1, 0, 0, 1}); auto c = b.Check();
  Check("a box is a clean mesh", c.ok && c.degenerate == 0 && b.Tris() == 12, c.err);
  int bad = FacingInward(b, [](double) { return V3{50, 100, 150}; });
  Check("every face of a box faces outwards (Unreal's clockwise rule)", bad == 0, std::to_string(bad));
  Mesh s; s.Sphere({0, 0, 0}, 50, 8, 12, {1, 1, 1, 1}); c = s.Check(); bad = FacingInward(s, [](double) { return V3{0, 0, 0}; });
  Check("a sphere is clean and faces outwards", c.ok && c.degenerate == 0 && bad == 0, c.err + " " + std::to_string(bad));
  Mesh f; f.Frustum({0, 0, 0}, 50, 20, 100, 12, {1, 1, 1, 1}); c = f.Check(); Check("a cone is clean", c.ok && c.degenerate == 0, c.err);
  Mesh p; p.Prism({{0, 0}, {100, 0}, {100, 100}, {0, 100}}, 0, 300, {1, 1, 1, 1}, true, true); c = p.Check(); bad = FacingInward(p, [](double) { return V3{50, 50, 150}; });
  Check("a prism faces outwards", c.ok && bad == 0, c.err + " " + std::to_string(bad));
  Mesh m = b; m.MirrorY(); c = m.Check(); Check("a mirrored mesh keeps its faces outwards", c.ok, c.err);
  Mesh pc; pc.Between({0, 0, 0}, {100, 50, 200}, 10, 8, 10, {1, 1, 1, 1}); c = pc.Check(); Check("a limb between two points is clean", c.ok && c.degenerate == 0, c.err);
  Mesh a; a.Append(b, {1000, 0, 0}, kPi / 2, 2.0); c = a.Check(); Check("an appended, turned and scaled copy is clean and in the right place", c.ok && std::fabs(c.mn.x - (1000 - 400)) < 1e-6, S(c.mn.x));
}

static void TestPlan() {
  std::printf("the city\n");
  BlockPlan a = MakeBlock(2, 3), b = MakeBlock(2, 3);
  Check("the same block comes out the same every time", a.buildings.size() == b.buildings.size() && a.props.size() == b.props.size() && (a.buildings.empty() || (a.buildings[0].mx.z == b.buildings[0].mx.z && a.buildings[0].mn.x == b.buildings[0].mn.x)));
  int overlap = 0, outside = 0, onRoad = 0, totalB = 0, towers = 0, pools = 0, palms = 0, venues = 0, venueBad = 0, propInBuilding = 0, poolBad = 0, loopBad = 0; double tallest = 0;
  std::map<District, int> kinds;
  for (int i = kGridMin; i <= kGridMax; i++) for (int j = kGridMin; j <= kGridMax; j++) {
    BlockPlan bp = MakeBlock(i, j); kinds[bp.district]++; const V3 c = bp.center; const double inner = bp.half - kWalkW;
    for (size_t x = 0; x < bp.buildings.size(); x++) {
      const BuildingSpec& B = bp.buildings[x]; totalB++;
      if (B.mn.x < c.x - inner || B.mx.x > c.x + inner || B.mn.y < c.y - inner || B.mx.y > c.y + inner) outside++;
      for (size_t y = x + 1; y < bp.buildings.size(); y++) if (Overlap3(B.mn, B.mx, bp.buildings[y].mn, bp.buildings[y].mx)) overlap++;
      if (B.style == Style::Tower) { towers++; tallest = std::max(tallest, B.mx.z); }
      if (B.venue != VenueKind::None) { venues++; if (B.venue != VenueAt(i, j)) venueBad++; }
    }
    for (const PropSpec& P : bp.props) {
      const double dx = std::fabs(P.pos.x - c.x), dy = std::fabs(P.pos.y - c.y);
      bool street = P.kind == PropKind::Palm || P.kind == PropKind::Lamp || P.kind == PropKind::Hydrant || P.kind == PropKind::Bench || P.kind == PropKind::Bin || P.kind == PropKind::Signal;
      if (P.kind == PropKind::Palm) palms++;
      if (street) for (const BuildingSpec& B : bp.buildings) if (P.pos.x > B.mn.x && P.pos.x < B.mx.x && P.pos.y > B.mn.y && P.pos.y < B.mx.y) propInBuilding++;
      if (P.kind == PropKind::ParkedCar && (std::max(dx, dy) < bp.half - 1)) { /* a car in a lot or car park: inside the block, so not on the road */ }
      if (std::max(dx, dy) > bp.half + 400) onRoad++;
    }
    for (const PoolSpec& pl : bp.pools) {
      pools++; if (pl.mn.x < c.x - inner || pl.mx.x > c.x + inner || pl.mn.y < c.y - inner || pl.mx.y > c.y + inner) poolBad++;
      for (const BuildingSpec& B : bp.buildings) if (pl.mn.x < B.mx.x && pl.mx.x > B.mn.x && pl.mn.y < B.mx.y && pl.mx.y > B.mn.y) poolBad++;
    }
    if (bp.loop.length <= 0) loopBad++; else { V2 p0 = bp.loop.At(0), p1 = bp.loop.At(bp.loop.length - 1e-6); if (std::hypot(p0.x - p1.x, p0.y - p1.y) > 1.0) loopBad++; for (const V2& q : bp.loop.pts) if (std::fabs(q.x - c.x) > bp.half || std::fabs(q.y - c.y) > bp.half) loopBad++; }
  }
  Check("a lot of buildings, towers and pools are planned", totalB > 400 && towers >= 10 && pools > 50, std::to_string(totalB) + " buildings, " + std::to_string(towers) + " towers, " + std::to_string(pools) + " pools");
  Check("the tallest tower is a real skyscraper (over 150 m)", tallest > 15000, S(tallest));
  Check("every building stands inside its own block", outside == 0, std::to_string(outside));
  Check("no two buildings on a block overlap", overlap == 0, std::to_string(overlap));
  Check("no lamp post, palm, hydrant, bench, bin or signal stands inside a building", propInBuilding == 0, std::to_string(propInBuilding));
  Check("nothing is placed out in the street (beyond the kerb)", onRoad == 0, std::to_string(onRoad));
  Check("pools are in their block and clear of the buildings", poolBad == 0, std::to_string(poolBad));
  Check("the pavement loops are closed and inside their blocks", loopBad == 0, std::to_string(loopBad));
  Check("palms line the streets", palms > 500, std::to_string(palms));
  Check("there are five places to walk into, and each is the right kind", venues == 5 && venueBad == 0, std::to_string(venues) + " " + std::to_string(venueBad));
  Check("the districts are all there (downtown, mid-rise, houses, parks, hotels, the plaza)", kinds[District::Downtown] > 5 && kinds[District::Mid] > 10 && kinds[District::Low] > 20 && kinds[District::Park] > 3 && kinds[District::Hotel] == 13 && kinds[District::Plaza] == 1);
  // The door of each place faces the plaza and has a forecourt to walk up.
  int doorBad = 0;
  for (VenueKind k : {VenueKind::Petrol, VenueKind::Shop, VenueKind::Jeweller, VenueKind::Bank, VenueKind::Museum}) {
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) if (VenueAt(i, j) == k) {
      BlockPlan bp = MakeBlock(i, j); const BuildingSpec* v = nullptr; for (auto& B : bp.buildings) if (B.venue == k) v = &B; if (!v) { doorBad++; continue; }
      V3 toPlaza{double(-i), double(-j), 0}; V3 door = v->doorSide == 0 ? V3{1, 0, 0} : v->doorSide == 1 ? V3{-1, 0, 0} : v->doorSide == 2 ? V3{0, 1, 0} : V3{0, -1, 0};
      if (Dot(door, toPlaza) <= 0) doorBad++;                                                  // (the door faces the street towards the plaza)
      double wallPos = v->doorSide == 0 ? v->mx.x - bp.center.x : v->doorSide == 1 ? bp.center.x - v->mn.x : v->doorSide == 2 ? v->mx.y - bp.center.y : bp.center.y - v->mn.y;
      double forecourt = (bp.half - kWalkW) - wallPos; if (forecourt < 600 || forecourt > 1200) doorBad++;
    }
  }
  Check("each door faces the street towards the plaza, with a few metres of forecourt", doorBad == 0, std::to_string(doorBad));
  // Where you start.
  V3 sp = SpawnPoint(); bool inB = false; BlockPlan b0 = MakeBlock(0, 0); for (auto& B : b0.buildings) if (sp.x > B.mn.x && sp.x < B.mx.x && sp.y > B.mn.y && sp.y < B.mx.y) inB = true;
  Check("you start on the pavement of the plaza, not inside anything", !inB && std::fabs(sp.x) < b0.half && sp.y > -b0.half && sp.y < -b0.half + kWalkW + 100, S(sp.x) + "," + S(sp.y));
  V3 hc = HeroCarSpot(); Check("your car is parked at the kerb beside the pavement, on the carriageway", hc.y < -b0.half && hc.y > -b0.half - kRoadW / 2, S(hc.y));
  // The beach.
  int umb = 0, towel = 0, guard = 0, net = 0, inSea = 0, promBad = 0;
  for (int j = kGridMin; j <= kGridMax; j++) { BlockPlan be = MakeBeach(j); for (const PropSpec& P : be.props) { if (P.kind == PropKind::Umbrella) umb++; if (P.kind == PropKind::Towel) towel++; if (P.kind == PropKind::Lifeguard) guard++; if (P.kind == PropKind::VolleyNet) net++;
      if ((P.kind == PropKind::Umbrella || P.kind == PropKind::Lounger || P.kind == PropKind::Towel) && (P.pos.x < kShoreX || P.pos.x > kSandX)) inSea++;
      if ((P.kind == PropKind::Palm || P.kind == PropKind::Lamp || P.kind == PropKind::Bench) && P.pos.x > kPromenadeX) promBad++; } }
  Check("the beach has umbrellas, loungers, towels, lifeguard towers and a volleyball net", umb > 40 && towel > 10 && guard >= 3 && net >= 2, std::to_string(umb) + " " + std::to_string(towel) + " " + std::to_string(guard) + " " + std::to_string(net));
  Check("beach things are on the dry sand (not in the sea, not on the road)", inSea == 0 && promBad == 0, std::to_string(inSea) + " " + std::to_string(promBad));
  Check("the sand slopes down to the waterline exactly at the shore, level on the promenade side", std::fabs(SandHeight(kShoreX) - kSeaLevel) < 1.0 && SandHeight(kSandX) == 0 && SandHeight(kSeaWallX) < kSeaLevel && SandHeight(kSeaWallX) > kSeaLevel - 120, S(SandHeight(kShoreX)) + " " + S(SandHeight(kSeaWallX)));
  double prev = 1e9; bool mono = true; for (double x = kSandX; x > -108000; x -= 500) { double h = SandHeight(x); if (h > prev + 1e-9) mono = false; prev = h; }
  Check("the sand only ever goes down going out to sea", mono);
  Mesh sand = BuildSand(-20000, 20000); auto sc = sand.Check(); int up = 0; for (size_t t = 0; t + 2 < sand.I.size(); t += 3) { V3 g = Cross(sand.P[sand.I[t + 1]] - sand.P[sand.I[t]], sand.P[sand.I[t + 2]] - sand.P[sand.I[t]]); if (g.z <= 0) up++; }
  Check("the sand mesh is clean and every triangle faces up", sc.ok && up == 0, sc.err + " " + std::to_string(up));
  Mesh hills = BuildHills(); auto hc2 = hills.Check(); int hd = 0; for (size_t t = 0; t + 2 < hills.I.size(); t += 3) { V3 g = Cross(hills.P[hills.I[t + 1]] - hills.P[hills.I[t]], hills.P[hills.I[t + 2]] - hills.P[hills.I[t]]); if (g.z < 0) hd++; }
  Check("the hills ring is clean and faces up", hc2.ok && hd == 0, hc2.err + " " + std::to_string(hd));
}

static int CountMat(const Mesh& m, int mat) { int n = 0; for (size_t t = 0; t + 2 < m.I.size(); t += 3) if (int(std::lround(m.C[size_t(m.I[t])].a)) == mat) n++; return n; }
// Triangles of material `mat` whose front points away from `centre` (in the ground plane) - the panes of a building that face into it.
static int FacingIn(const Mesh& m, int mat, const V3& centre) {
  int bad = 0; for (size_t t = 0; t + 2 < m.I.size(); t += 3) { if (int(std::lround(m.C[size_t(m.I[t])].a)) != mat) continue;
    V3 a = m.P[size_t(m.I[t])], b = m.P[size_t(m.I[t + 1])], c = m.P[size_t(m.I[t + 2])], g = Cross(b - a, c - a), ctr = (a + b + c) * (1.0 / 3.0); if (Len(g) < 1e-6) continue; if (Dot(g, V3{ctr.x - centre.x, ctr.y - centre.y, 0}) <= 0) bad++; }
  return bad;
}
static void TestBuildings() {
  std::printf("buildings, props, ground\n");
  size_t maxTris = 0, totalTris = 0; int bad = 0, flipped = 0, inward = 0, noVolume = 0, built = 0, nan = 0; std::string why;
  int styles[6] = {0, 0, 0, 0, 0, 0};
  for (int i = kGridMin; i <= kGridMax; i++) for (int j = kGridMin; j <= kGridMax; j++) {
    BlockPlan bp = MakeBlock(i, j);
    for (const BuildingSpec& B : bp.buildings) {
      if (B.style == Style::Venue) continue;
      Mesh m = BuildBuilding(B); auto c = m.Check(); built++; styles[int(B.style)]++; maxTris = std::max(maxTris, m.Tris()); totalTris += m.Tris();
      if (!c.ok) { bad++; why = c.err; } if (c.flipped) flipped++;
      { Mesh cm = m; cm.Translate({-(B.mn.x + B.mx.x) / 2, -(B.mn.y + B.mx.y) / 2, -(B.mn.z + B.mx.z) / 2}); if (cm.Volume() <= 0) noVolume++; }
      V3 ctr{(B.mn.x + B.mx.x) / 2, (B.mn.y + B.mx.y) / 2, 0};
      inward += FacingIn(m, MAT_WINDOW, ctr);
      if (c.mn.x < B.mn.x - 650 || c.mx.x > B.mx.x + 650 || c.mn.y < B.mn.y - 650 || c.mx.y > B.mx.y + 650 || c.mx.z > B.mx.z + 2200 || c.mn.z < B.mn.z - 1) nan++;
    }
  }
  Check("every building is a clean mesh", bad == 0 && flipped == 0, why + " " + std::to_string(bad) + " " + std::to_string(flipped));
  Check("every sort of building is built (towers, podia, mid-rises, houses, hotels)", styles[int(Style::Tower)] > 5 && styles[int(Style::Podium)] > 5 && styles[int(Style::Mid)] > 20 && styles[int(Style::House)] > 100 && styles[int(Style::Hotel)] == 13, std::to_string(styles[0]) + " " + std::to_string(styles[1]) + " " + std::to_string(styles[2]) + " " + std::to_string(styles[3]) + " " + std::to_string(styles[4]));
  Check("buildings enclose a volume (their faces point outwards)", noVolume == 0, std::to_string(noVolume));
  Check("the glass of the towers and podia faces out of the building", inward == 0, std::to_string(inward));
  Check("no building sticks out of its footprint by more than a canopy's width", nan == 0, std::to_string(nan));
  Check("a building is under 40000 triangles (so a block is cheap to make)", maxTris < 40000, std::to_string(maxTris) + " (average " + std::to_string(totalTris / size_t(std::max(1, built))) + ")");
  { BlockPlan hp = MakeBlock(kGridMin, 0); const BuildingSpec* hotel = nullptr; for (auto& B : hp.buildings) if (B.style == Style::Hotel) hotel = &B;
    Check("the hotel has balconies and lit and dark windows", hotel && CountMat(BuildBuilding(*hotel), MAT_GLASS) > 100 && CountMat(BuildBuilding(*hotel), MAT_GLOW) > 10); }
  { const BuildingSpec* house = nullptr; BlockPlan hp; for (int i = 3; i <= 6 && !house; i++) { hp = MakeBlock(i, 5); for (auto& B : hp.buildings) if (B.style == Style::House) { house = &B; break; } } Mesh hm = house ? BuildBuilding(*house) : Mesh();
    Check("a house has a roof, walls, windows, a door and a garage", house && CountMat(hm, MAT_ROOF) >= 2 && CountMat(hm, MAT_WALL) > 10 && CountMat(hm, MAT_GLASS) + CountMat(hm, MAT_GLOW) >= 4 && CountMat(hm, MAT_WOOD) > 0 && CountMat(hm, MAT_METAL) > 0); }
  // The places you can walk into.
  int venueBad = 0, solidsOut = 0, lightsOut = 0, spotsOut = 0, doorBlocked = 0, noTill = 0; size_t vTris = 0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) if (VenueAt(i, j) != VenueKind::None) {
    BlockPlan bp = MakeBlock(i, j); for (const BuildingSpec& B : bp.buildings) if (B.style == Style::Venue) {
      VenueBuild vb = BuildVenue(B); auto c = vb.mesh.Check(); if (!c.ok || c.flipped) venueBad++; vTris += vb.mesh.Tris();
      for (auto& sb : vb.solids) if (sb.first.x < B.mn.x - 4000 || sb.second.x > B.mx.x + 4000 || sb.first.y < B.mn.y - 4000 || sb.second.y > B.mx.y + 4000) solidsOut++;
      V3 mn = B.mn, mx = B.mx; double inset = 30;
      for (auto& l : vb.lights) if (B.venue != VenueKind::Petrol && (l.x < mn.x + inset || l.x > mx.x - inset || l.y < mn.y + inset || l.y > mx.y - inset || l.z > kCurbH + (mx.z - mn.z))) lightsOut++;
      for (auto& sp : vb.spots) if (sp.pos.x < mn.x + inset || sp.pos.x > mx.x - inset || sp.pos.y < mn.y + inset || sp.pos.y > mx.y - inset) spotsOut++;
      if (vb.spots.empty()) noTill++;
      // walk from the doorstep to the middle of the room at chest height: nothing solid in the way
      V3 ctr{(mn.x + mx.x) / 2, (mn.y + mx.y) / 2, kCurbH + 100};
      for (int k = 0; k <= 40; k++) { V3 p = vb.doorPos + (ctr - vb.doorPos) * (k / 40.0); p.z = kCurbH + 100; for (auto& sb : vb.solids) if (p.x > sb.first.x && p.x < sb.second.x && p.y > sb.first.y && p.y < sb.second.y && p.z > sb.first.z && p.z < sb.second.z) { doorBlocked++; break; } }
    }
  }
  Check("each room is a clean mesh", venueBad == 0, std::to_string(venueBad));
  Check("rooms have a till and staff or guards to stand at it", noTill == 0);
  Check("lights and people are inside their rooms", lightsOut == 0 && spotsOut == 0, std::to_string(lightsOut) + " " + std::to_string(spotsOut));
  Check("a straight line from the door to the middle of every room is clear (walls and fittings do not block the way in)", doorBlocked == 0, std::to_string(doorBlocked));
  Check("the rooms are detailed but cheap (under 60000 triangles each)", vTris > 20000 && vTris < 300000, std::to_string(vTris));
  // The street furniture: each one is a clean mesh of a sensible size.
  int propBad = 0, propBig = 0, propEmpty = 0, solidWrong = 0; std::string pwhy;
  for (int k = 0; k < int(PropKind::Count); k++) {
    PropSpec p; p.kind = PropKind::Count; p.kind = static_cast<PropKind>(k); p.pos = {1000, 2000, 0}; p.yaw = 0.7; p.scale = 1; p.seed = 12345u + uint32_t(k); p.col = Hex(0xA33C2A);
    Mesh m = BuildProp(p); auto c = m.Check(); if (m.Empty()) { propEmpty++; continue; }
    if (!c.ok || c.flipped) { propBad++; pwhy += std::to_string(k) + ":" + c.err + " "; }
    if (c.mx.z > 1100 || (c.mx.z < 20 && p.kind != PropKind::Towel) || c.mn.z < -1 || (c.mx.x - c.mn.x) > 2000 || (c.mx.y - c.mn.y) > 2000) { propBig++; pwhy += "size" + std::to_string(k) + " "; }
    SolidBox sb; bool solid = PropSolidBox(p, sb); bool should = !(p.kind == PropKind::Bush || p.kind == PropKind::Bench || p.kind == PropKind::Lounger || p.kind == PropKind::Towel || p.kind == PropKind::VolleyNet);
    if (solid != should) solidWrong++;
  }
  Check("every sort of prop is built, as a clean mesh of a sensible size", propBad == 0 && propBig == 0 && propEmpty == 0, pwhy + std::to_string(propBad) + " " + std::to_string(propBig) + " " + std::to_string(propEmpty));
  Check("trees, lamps, cars and so on are solid; bushes, benches and towels are not", solidWrong == 0, std::to_string(solidWrong));
  { PropSpec p; p.kind = PropKind::ParkedCar; p.pos = {0, 0, 0}; p.seed = 7; p.col = Hex(0x1F3F73); Mesh car = BuildProp(p);
    Check("a parked car has glass, tyres, lamps and paint, and is a car's size", CountMat(car, MAT_GLASS) > 20 && CountMat(car, MAT_TYRE) > 20 && CountMat(car, MAT_LIGHT) > 8 && CountMat(car, MAT_PAINT) > 100 && car.Check().mx.x - car.Check().mn.x > 380); }
  { PropSpec p; p.kind = PropKind::Lamp; p.pos = {0, 0, 0}; p.yaw = 0; Mesh lamp = BuildProp(p); auto c = lamp.Check(); V3 head = LampHeadOffset();
    Check("a street lamp's light is where its lamp head is, above head height", c.mx.z > 700 && head.z > 600 && head.z < c.mx.z + 20 && head.x > 100 && head.x < c.mx.x + 1, S(head.z) + " " + S(c.mx.z)); }
  { PropSpec p; p.kind = PropKind::Palm; p.pos = {0, 0, 0}; Mesh palm = BuildProp(p);
    Check("a palm is a tree with a trunk and a crown of leaves, about 7 to 12 m tall", CountMat(palm, MAT_BARK) > 100 && CountMat(palm, MAT_FOLIAGE) >= 60 && palm.Check().mx.z > 650 && palm.Check().mx.z < 1200, S(palm.Check().mx.z)); }
  // Pools and ground.
  { PoolSpec ps; ps.mn = {0, 0, 0}; ps.mx = {1000, 400, 0}; Mesh pool = BuildPool(ps); auto c = pool.Check();
    double waterZ = -1e9; for (size_t t = 0; t + 2 < pool.I.size(); t += 3) if (int(std::lround(pool.C[size_t(pool.I[t])].a)) == MAT_WATER) waterZ = pool.P[size_t(pool.I[t])].z;
    Check("a pool is a clean mesh with water below the rim and above its floor", c.ok && waterZ > kCurbH + 20 && waterZ < ps.rim && CountMat(pool, MAT_TILE) > 2, c.err + " " + S(waterZ)); }
  { int badG = 0, downTops = 0; std::string gwhy;
    for (int i : {-6, 0, 3, 6}) for (int j : {-6, 0, 5}) { BlockPlan bp = MakeBlock(i, j); Mesh g = BuildBlockGround(bp); auto c = g.Check(); if (!c.ok || c.degenerate) { badG++; gwhy = c.err; }
      for (size_t t = 0; t + 2 < g.I.size(); t += 3) { V3 n = Cross(g.P[size_t(g.I[t + 1])] - g.P[size_t(g.I[t])], g.P[size_t(g.I[t + 2])] - g.P[size_t(g.I[t])]); int mat = int(std::lround(g.C[size_t(g.I[t])].a)); if ((mat == MAT_LINE || mat == MAT_LAWN) && n.z < 0 && std::fabs(n.x) + std::fabs(n.y) < 1e-6 * std::fabs(n.z)) downTops++; } }
    Check("the ground of a block is clean and its lines and lawn face up", badG == 0 && downTops == 0, gwhy + std::to_string(badG) + " " + std::to_string(downTops));
    BlockPlan bp = MakeBlock(2, 3); Mesh g = BuildBlockGround(bp); Check("the ground has road, pavement and lane lines", CountMat(g, MAT_ASPHALT) >= 2 && CountMat(g, MAT_STONE) >= 8 && CountMat(g, MAT_LINE) > 100, std::to_string(CountMat(g, MAT_LINE))); }
  { BlockPlan be = MakeBeach(0); Mesh pr = BuildPromenade(be); auto c = pr.Check(); Mesh sea = BuildSea(); auto sc = sea.Check();
    Check("the promenade and the sea are clean; the sea faces up at sea level", c.ok && sc.ok && std::fabs(sc.mn.z - kSeaLevel) < 1e-6 && Cross(sea.P[size_t(sea.I[1])] - sea.P[size_t(sea.I[0])], sea.P[size_t(sea.I[2])] - sea.P[size_t(sea.I[0])]).z > 0, c.err + sc.err); }
}

static void TestVenues() {
  std::printf("the places you can walk into\n");
  int out = 0, blocked = 0, noLight = 0, spotsBad = 0; size_t items = 0;
  for (VenueKind k : {VenueKind::Petrol, VenueKind::Shop, VenueKind::Jeweller, VenueKind::Bank, VenueKind::Museum}) {
    VenueLayout L = MakeVenue(k, 4400, 3400, k == VenueKind::Bank || k == VenueKind::Museum ? 560 : 420); items += L.items.size();
    for (auto& it : L.items) { if (it.mn.x < -2200 || it.mx.x > 2200 || it.mn.y < -1700 || it.mx.y > 1700 || it.mx.z > L.h) out++; if (it.solid && it.mx.x > 0 && it.mn.x < 2200 && it.mn.y < 90 && it.mx.y > -90 && it.mn.z < 200) blocked++; }
    if (L.lights.size() < 4) noLight++;
    for (auto& s : L.spots) if (std::fabs(s.pos.x) > 2200 || std::fabs(s.pos.y) > 1700) spotsBad++;
  }
  Check("everything in every room is inside the room", out == 0, std::to_string(out));
  Check("there is a clear way in from the door in every room (a metre and a half wide)", blocked == 0, std::to_string(blocked));
  Check("every room has lights", noLight == 0);
  Check("people stand inside the rooms", spotsBad == 0, std::to_string(spotsBad));
  Check("the rooms are full of things", items > 500, std::to_string(items));
}

static void TestCars() {
  std::printf("cars\n");
  int bad = 0, flipped = 0, outOfSize = 0, noGlass = 0;
  for (int k = 0; k < int(CarKind::Count); k++) {
    CarSpec s = MakeCarSpec(CarKind(k), {0.7f, 0.1f, 0.1f, 1}); Mesh m = BuildCarBody(s); auto c = m.Check(); if (!c.ok || c.degenerate > 0) bad++;
    Mesh shell = BuildCarShell(s); if (!shell.Check().ok) bad++;
    flipped += FacingInward(shell, [&](double x) { double t = Clamp((s.L / 2 - x) / s.L, 0, 1); return V3{x, 0, (s.zBot + s.Top(t)) * 0.5}; });
    double L = c.mx.x - c.mn.x, W = c.mx.y - c.mn.y, H = c.mx.z; if (L < 430 || L > 530 || W < 175 || W > 205 || H < 95 || H > 175 || c.mn.z < s.zBot - 1) outOfSize++;
    int glass = 0, light = 0; for (size_t t = 0; t + 2 < m.I.size(); t += 3) { int mat = int(std::lround(m.C[m.I[t]].a)); if (mat == MAT_GLASS) glass++; if (mat == MAT_LIGHT) light++; } if (glass < 30 || light < 10) noGlass++;
    std::vector<WheelSpot> w = WheelSpots(s); if (w.size() != 4) bad++; else for (auto& ws : w) if (std::fabs(ws.pos.z - s.wheelR) > 1e-9 || std::fabs(std::fabs(ws.pos.x) - s.wheelbase / 2) > 1e-9) bad++;
    Mesh wh = BuildWheel(s); auto cw = wh.Check(); if (!cw.ok || std::fabs((cw.mx.z - cw.mn.z) / 2 - s.wheelR) > 0.5 || std::fabs((cw.mx.y - cw.mn.y) - s.wheelW) > 1.0) bad++;
  }
  Check("every kind of car and its wheel is a clean mesh with four wheels in the right places", bad == 0, std::to_string(bad));
  Check("every face of every car faces outwards", flipped == 0, std::to_string(flipped));
  Check("the cars are about the size of real cars", outOfSize == 0, std::to_string(outOfSize));
  Check("every car has glass and lamps", noGlass == 0, std::to_string(noGlass));
  CarSpec cr = MakeCarSpec(CarKind::Cruiser, {1, 1, 1, 1}); Mesh cm = BuildCarBody(cr); int blue = 0, red = 0; for (size_t t = 0; t + 2 < cm.I.size(); t += 3) { const Col& k = cm.C[cm.I[t]]; if (std::lround(k.a) == MAT_LIGHT) { if (k.b > 0.8f && k.r < 0.3f) blue++; if (k.r > 0.8f && k.b < 0.3f && k.g < 0.3f) red++; } }
  Check("a police cruiser has red and blue lights on its roof and its two-tone livery", cr.twoTone && cr.lightBar && blue > 0 && red > 0, std::to_string(blue) + " " + std::to_string(red));
}

static void TestRig() {
  std::printf("people\n");
  Rig r = MakeRig(BodyStyle{}); bool clean = true; size_t tris = 0; for (auto& p : r.parts) { if (!p.mesh.Check().ok) clean = false; tris += p.mesh.Tris(); }
  Check("the figure has sixteen clean parts", r.parts.size() == 16 && clean && tris > 1500, std::to_string(r.parts.size()) + " " + std::to_string(tris));
  Skeleton st = FK(r, PoseStand(0)); double top = 0; for (auto& p : r.parts) { auto c = p.mesh.Check(); top = std::max(top, st.pos[p.joint].z + c.mx.z); }
  Check("standing, the figure is as tall as it should be and its feet are on the ground", std::fabs(top - 178) < 10 && std::fabs(st.pos[J_ANL].z - r.footHeight) < 1.0, S(top) + " " + S(st.pos[J_ANL].z));
  double worst = 0, maxSwing = 0;
  for (double sp : {0.4, 1.0, 1.6}) for (double ph = 0; ph < 6.3; ph += 0.07) { Pose p = PoseWalk(ph, sp); PlantFeet(r, p); Skeleton s = FK(r, p); worst = std::max(worst, r.footHeight - std::min(s.pos[J_ANL].z, s.pos[J_ANR].z)); maxSwing = std::max(maxSwing, std::fabs(s.pos[J_ANL].x - s.pos[J_ANR].x)); }
  Check("in every stride the planted foot is on the ground (after the feet are planted)", worst < 0.05, S(worst));
  Check("a stride is a real stride: the feet get a good way apart", maxSwing > 45, S(maxSwing));
  Skeleton jab = FK(r, PoseBlow(Blow::Jab, 0.45, 0.45)), cross = FK(r, PoseBlow(Blow::Cross, 0.45, 0.45)), kick = FK(r, PoseBlow(Blow::Kick, 0.46, 0.46)), guard = FK(r, PoseBlow(Blow::Jab, 0.0, 0.45));
  Check("a jab throws the left fist out in front of the shoulder", jab.pos[J_WRL].x - jab.pos[J_SHL].x > 32 && jab.pos[J_WRL].x > guard.pos[J_WRL].x + 15, S(jab.pos[J_WRL].x - jab.pos[J_SHL].x));
  Check("a cross throws the right fist out in front of the shoulder", cross.pos[J_WRR].x - cross.pos[J_SHR].x > 32, S(cross.pos[J_WRR].x - cross.pos[J_SHR].x));
  Check("a kick puts the boot out in front and up at hip height", kick.pos[J_ANR].x - kick.pos[J_HIPR].x > 60 && kick.pos[J_ANR].z > 40, S(kick.pos[J_ANR].x - kick.pos[J_HIPR].x) + " " + S(kick.pos[J_ANR].z));
  Skeleton aim = FK(r, PoseAim(0.0)); Skeleton up = FK(r, PoseHandsUp(0)); Skeleton down = FK(r, PoseDown(1.0));
  Check("aiming a pistol holds the hands out in front at chest height", aim.pos[J_WRR].x - aim.pos[J_SHR].x > 45 && std::fabs(aim.pos[J_WRR].z - aim.pos[J_SHR].z) < 15, S(aim.pos[J_WRR].x - aim.pos[J_SHR].x));
  Check("hands up puts the hands above the head", up.pos[J_WRL].z > up.pos[J_HEAD].z && up.pos[J_WRR].z > up.pos[J_HEAD].z, S(up.pos[J_WRL].z) + " " + S(up.pos[J_HEAD].z));
  Check("knocked down, the figure is lying close to the ground", down.pos[J_HEAD].z < 35 && down.pos[J_ROOT].z < 25, S(down.pos[J_HEAD].z));
  // The muscle build is wider and thicker than an ordinary man.
  Rig big = MakeRig(BruiserStyle(Hex(0xC68863), Hex(0x1E1E22)));
  auto arm = [](const Rig& rr) { for (auto& p : rr.parts) if (p.joint == J_SHL) { auto c = p.mesh.Check(); return c.mx.y - c.mn.y; } return 0.0; };
  auto chest = [](const Rig& rr) { for (auto& p : rr.parts) if (p.joint == J_SPINE) { auto c = p.mesh.Check(); return c.mx.y - c.mn.y; } return 0.0; };
  auto shoulderGap = [](const Rig& rr) { Skeleton s = FK(rr, PoseStand(0)); return s.pos[J_SHR].y - s.pos[J_SHL].y; };
  Check("a muscular man has thicker arms, a broader chest and wider shoulders, and is taller", arm(big) > arm(r) * 1.35 && chest(big) > chest(r) * 1.25 && shoulderGap(big) > shoulderGap(r) * 1.05 && big.height > r.height + 5, S(arm(big) / arm(r)) + " " + S(chest(big) / chest(r)));
}

static BrainOut Step(Brain& b, BrainIn& in, V3& pos) { in.self = pos; BrainOut o = b.Update(in); pos += o.move * (o.speed * in.dt); return o; }

static void TestBrains() {
  std::printf("fighters\n");
  // The big man.
  { Brain b(Archetype::Bruiser, 11); BrainIn in; V3 pos{0, 0, 0}; in.target = {1000, 0, 0}; int landed = 0, blows = 0, hooks = 0, knock = 0; double dmg = 0; double closest = 1e9; bool wasSwinging = false;
    for (int i = 0; i < 60 * 120; i++) { BrainOut o = Step(b, in, pos); closest = std::min(closest, Dist2D(pos, in.target)); if (o.blow != Blow::None && !wasSwinging) { blows++; if (o.blow == Blow::Hook) hooks++; } wasSwinging = o.blow != Blow::None; if (o.blowLanded) { landed++; dmg += o.blowDamage; if (o.knockdown) knock++; } }
    Check("the big man charges, gets within reach and lands blows", closest < 160 && landed > 20, S(closest) + " " + std::to_string(landed));
    Check("he throws jabs, crosses and the slow haymaker, and only the haymaker knocks you down", hooks > 3 && knock > 0 && knock <= hooks && blows > landed - 5, std::to_string(hooks) + " " + std::to_string(knock) + " " + std::to_string(blows));
    Check("his blows hurt (about 7, 12 and 20 each) and he does not hit all that fast", dmg / std::max(1, landed) > 8 && dmg / std::max(1, landed) < 18 && landed < 60 * 120 / 60 * 1.0, S(dmg / std::max(1, landed)));
  }
  { Brain b(Archetype::Bruiser, 12); BrainIn in; V3 pos{0, 0, 0}; in.target = {700, 0, 0}; int swings = 0; for (int i = 0; i < 60 * 4; i++) { in.self = pos; BrainOut o = b.Update(in); if (i < 20) { /* drawing: stand */ } if (Dist2D(pos, in.target) > 300 && o.blow != Blow::None) swings++; pos += o.move * (o.speed * in.dt); }
    Check("he does not swing at you from a distance", swings == 0, std::to_string(swings)); }
  { Brain b(Archetype::Bruiser, 13); BrainIn in; in.self = {0, 0, 0}; in.target = {90, 0, 0}; double firstBlow = -1; double clock = 0; bool dodged = false; int landedAfterDodge = 0;
    for (int i = 0; i < 60 * 6; i++) { clock += in.dt; BrainOut o = b.Update(in); if (o.blow != Blow::None && firstBlow < 0) firstBlow = clock; if (firstBlow > 0 && o.blow != Blow::None && !dodged && o.blowK > 0.2) { in.target = {600, 0, 0}; dodged = true; } if (dodged && o.blowLanded) landedAfterDodge++; }
    Check("he is slow to start (a moment to square up first) and a blow lands only on someone still in reach", firstBlow > 0.5 && landedAfterDodge == 0, S(firstBlow) + " " + std::to_string(landedAfterDodge)); }
  { Brain b(Archetype::Bruiser, 14); BrainIn in; in.self = {0, 0, 0}; in.target = {100, 0, 0}; in.targetDown = true; int swings = 0; for (int i = 0; i < 60 * 5; i++) { BrainOut o = b.Update(in); if (o.blow != Blow::None) swings++; } Check("he does not hit a man who is already down", swings == 0, std::to_string(swings)); }
  // The armed man.
  { Brain b(Archetype::Armed, 21); BrainIn in; V3 pos{0, 0, 0}; in.target = {300, 0, 0}; int fired = 0, first = 0, hits = 0; double minD = 1e9, maxD = 0; bool reloaded = false, aimed = false; double drawnAt = -1, firstShotAt = -1;
    for (int i = 0; i < 60 * 90; i++) { double now = i / 60.0; BrainOut o = Step(b, in, pos); if (i > 60 * 8) { double d = Dist2D(pos, in.target); minD = std::min(minD, d); maxD = std::max(maxD, d); } if (o.fired) { fired++; if (o.firstShot) { first++; firstShotAt = now; } if (o.shotHits) hits++; } if (o.reloading) reloaded = true; if (o.aiming) aimed = true; if (drawnAt < 0 && !o.drawing) drawnAt = now; }
    Check("the armed man draws first (a moment) and then points the gun at you", aimed && drawnAt > 0.5 && drawnAt < 1.2 && firstShotAt > drawnAt, S(drawnAt) + " " + S(firstShotAt));
    Check("he shoots in bursts, reloads, and the first shot of the fight is flagged once (for the police)", fired > 30 && first == 1 && reloaded, std::to_string(fired) + " " + std::to_string(first));
    Check("he keeps a distance (between about 5 and 15 metres) rather than coming close", minD > 450 && maxD < 1700, S(minD) + " " + S(maxD));
    Check("he hits some of the time, not all of it", hits > fired * 0.08 && hits < fired * 0.45, std::to_string(hits) + "/" + std::to_string(fired)); }
  { int fled = 0; for (uint32_t s = 1; s <= 200; s++) { Brain b(Archetype::Armed, s); b.Hit(50, false, false, 0, false, {1, 0, 0}); if (b.fleeT > 0) fled++; } Check("a badly hurt armed man runs away about six times in ten", fled > 95 && fled < 145, std::to_string(fled)); }
  { Brain b(Archetype::Armed, 31); BrainIn in; in.self = {0, 0, 0}; in.target = {900, 0, 0}; for (int i = 0; i < 120; i++) b.Update(in); b.Hit(8, false, false, 1.0, false, {1, 0, 0}); Check("a kick puts an armed man on the back foot (stunned)", b.stun > 0.5); }
  { Brain b(Archetype::Enforcer, 41); BrainIn in; V3 pos{0, 0, 0}; in.target = {2500, 0, 0}; int fired = 0, landed = 0; double closest = 1e9; for (int i = 0; i < 60 * 40; i++) { BrainOut o = Step(b, in, pos); if (o.fired) fired++; if (o.blowLanded) landed++; closest = std::min(closest, Dist2D(pos, in.target)); }
    Check("a big armed man shoots as he comes and hits when he gets there", fired > 5 && landed > 3 && closest < 170, std::to_string(fired) + " " + std::to_string(landed) + " " + S(closest)); }
  // Beaten, shot, paid.
  { Brain b(Archetype::Bruiser, 51); bool done = b.Hit(500, false, false, 0.2, false, {1, 0, 0}); Check("beaten with fists he is knocked out, not killed, and has a wallet", done && b.IsKo() && !b.IsDead() && b.wallet >= 120 && b.wallet <= 320, S(b.wallet));
    BrainIn in; int ticks = 0; bool leave = false, removed = false; for (; ticks < 60 * 30 && !removed; ticks++) { BrainOut o = b.Update(in); if (b.state == BState::Leave) leave = true; if (o.remove) removed = true; }
    Check("he lies still for a few seconds, then gets up and goes (and is taken away)", leave && removed && ticks > 60 * 5 && ticks < 60 * 15, std::to_string(ticks)); }
  { Brain b(Archetype::Armed, 52); b.Hit(500, true, false, 0, true, {1, 0, 0}); Check("shot, he is down for good", b.IsDead() && !b.IsKo() && b.wallet >= 40 && b.wallet <= 180, S(b.wallet)); double w = b.wallet; b.Hit(100, true); Check("a man is paid for once", b.wallet == w); BrainIn in; bool removed = false; for (int i = 0; i < 60 * 12; i++) if (b.Update(in).remove) removed = true; Check("a body is cleared away after a while", removed); }
  { Brain b(Archetype::Civilian, 53); Check("a plain citizen has no gun and goes down easily", !b.st.gun && b.st.hp < 60 && b.st.walletHi == 0); }
  // Police officers.
  { Brain b(Archetype::Cop, 61); BrainIn in; V3 pos{0, 0, 0}; in.target = {2000, 0, 0}; int fired = 0; double minD = 1e9; for (int i = 0; i < 60 * 40; i++) { BrainOut o = Step(b, in, pos); if (o.fired) fired++; if (i > 60 * 8) minD = std::min(minD, Dist2D(pos, in.target)); }
    Check("an officer holds a distance and shoots bursts (he is a better shot than a civilian)", (b.rush ? true : minD > 800) && fired > 10 && b.st.accuracy > 0.45, S(minD) + " " + std::to_string(fired)); }
  { Brain b(Archetype::Cop, 62); BrainIn in; in.self = {0, 0, 0}; in.target = {200, 0, 0}; in.targetSpeed = 0; BrainOut o; double t = 0; for (int i = 0; i < 60 * 4; i++) { o = b.Update(in); t = b.arrestT; } Check("an officer right beside a player who stands still arrests him (the arrest fills)", o.arresting && t > 2.5, S(t));
    in.targetSpeed = 600; for (int i = 0; i < 60 * 4; i++) { o = b.Update(in); } Check("running away breaks the hold", !o.arresting && b.arrestT < 0.5, S(b.arrestT)); }
  // Losing interest: the player has gone into a building.
  { Brain b(Archetype::Bruiser, 71); BrainIn in; in.self = {0, 0, 0}; in.target = {400, 0, 0}; in.targetInside = true; bool removed = false; int moved = 0; for (int i = 0; i < 60 * 12 && !removed; i++) { BrainOut o = b.Update(in); if (o.speed > 0) moved++; if (o.remove) removed = true; } Check("when the player goes inside, he stands about, then loses interest", removed && moved == 0); }
  // Strolling.
  { Stroll s; BlockPlan bp = MakeBlock(2, 2); s.loop = bp.loop; s.speed = 140; s.rng = Rng(3); double maxOff = 0, travelled = 0; V2 prev = s.Pos(); for (int i = 0; i < 60 * 300; i++) { s.Update(1.0 / 60); V2 p = s.Pos(); travelled += std::hypot(p.x - prev.x, p.y - prev.y); prev = p;
      double best = 1e9; for (size_t k = 0; k < s.loop.pts.size(); k++) { V2 a = s.loop.pts[k], c = s.loop.pts[(k + 1) % s.loop.pts.size()]; double L2 = (c.x - a.x) * (c.x - a.x) + (c.y - a.y) * (c.y - a.y), t = L2 > 0 ? Clamp(((p.x - a.x) * (c.x - a.x) + (p.y - a.y) * (c.y - a.y)) / L2, 0, 1) : 0; best = std::min(best, std::hypot(p.x - (a.x + (c.x - a.x) * t), p.y - (a.y + (c.y - a.y) * t))); } maxOff = std::max(maxOff, best); }
    Check("a pedestrian walks round the pavement loop at walking pace and stays on it", maxOff < 1.0 && travelled > 300 * 140 * 0.5 && travelled < 300 * 140 * 1.01, S(maxOff) + " " + S(travelled)); }
}

static void TestWanted() {
  std::printf("the police\n");
  { Wanted w; w.Commit(Crime::Assault); Check("one punch on a stranger is a scuffle nobody reports", w.Stars() == 0); w.Commit(Crime::Assault); Check("a second one is assault: one star", w.Stars() == 1, std::to_string(w.Stars())); }
  { Wanted w; w.Commit(Crime::Gunshot); Check("a gunshot brings the police: one star", w.Stars() == 1); for (int k = 0; k < 6; k++) w.Commit(Crime::KilledSomeone); Check("killing people takes you to five stars and no further", w.Stars() == 5 && w.heat < 6, std::to_string(w.heat)); Check("more stars ask for more officers and cars", w.WantedOfficers() == 8 && w.WantedCars() == 4); }
  { Wanted w; w.Commit(Crime::Robbery); w.Update(1, true); double h = w.heat; for (int i = 0; i < 60 * 5; i++) w.Update(1.0 / 60, true); Check("while they can see you the heat does not fall", w.heat == h);
    for (int i = 0; i < 60 * 8; i++) w.Update(1.0 / 60, false); Check("for the first moments out of sight it does not fall either", w.heat == h);
    for (int i = 0; i < 60 * 120; i++) w.Update(1.0 / 60, false); Check("hidden for long enough, the heat falls and the police give up", !w.Active(), S(w.heat)); w.Clear(); w.Commit(Crime::Gunshot); Check("just after getting away there is a moment of grace", w.Stars() == 0); }
}

int main() {
  TestMesh(); TestPlan(); TestBuildings(); TestVenues(); TestCars(); TestRig(); TestBrains(); TestWanted();
  std::printf("\n%d checks, %d failed\n", gChecks, gFailed);
  return gFailed ? 1 : 0;
}
