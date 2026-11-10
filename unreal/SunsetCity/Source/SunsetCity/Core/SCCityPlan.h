// Sunset City (Unreal Engine 5): where everything is. A block of the city, worked out from its place in the grid and a seed (the same every time): which sort of district it is
// (downtown towers, mid-rise, houses with pools, a park, a hotel on the beach, the plaza, a place you can walk into), the buildings on it, the street furniture, the parked cars, a
// loop on the pavement for the pedestrians to walk, and, on the west edge of the city, the beach. Units are centimetres; X forward, Y right, Z up (Unreal's).
#pragma once
#include "SCMath.h"

namespace SC {

constexpr double kPitch = 13000.0;                  // street centre to street centre (130 m)
constexpr double kRoadW = 2400.0;                   // the carriageway (24 m)
constexpr double kBlockW = kPitch - kRoadW;         // a block with its pavements (106 m)
constexpr double kWalkW = 400.0;                    // pavement (4 m)
constexpr double kCurbH = 15.0;
constexpr int kGridMin = -6, kGridMax = 6;          // the blocks run from -6 to 6 in both directions
constexpr int kBeachChunk = -7;                     // the chunk of promenade and sand west of the last blocks
constexpr double kSeaLevel = -80.0;                 // the water surface
constexpr double kPromenadeX = -85700.0;            // the road ends, the promenade starts (going west)
constexpr double kSandX = -86500.0;                 // the sand starts
constexpr double kShoreX = -90700.0;                // where the sand goes under the water
constexpr double kSeaWallX = -92600.0;              // an invisible wall: the water is no deeper than this
constexpr double kWorldHalf = kPitch * (kGridMax + 0.5);   // the east, north and south edges

enum class District : int { Downtown = 0, Mid, Low, Park, Hotel, Plaza, Venue, Beach };
enum class VenueKind : int { None = -1, Petrol = 0, Shop = 1, Jeweller = 2, Bank = 3, Museum = 4 };
enum class PropKind : int { Palm = 0, Lamp, Hydrant, Bench, Bin, Tree, Bush, ParkedCar, Signal, Umbrella, Lounger, Towel, Lifeguard, VolleyNet, Fountain, PetrolPump, Hedge, Count };
enum class RoofKind : int { Flat = 0, Gabled, Stepped };
enum class Style : int { Tower = 0, Mid, House, Hotel, Venue, Podium };

struct BuildingSpec {
  V3 mn, mx;                                        // the footprint and the height (z from the ground to the roof)
  Style style = Style::Mid; RoofKind roof = RoofKind::Flat;
  int floors = 3; double floorH = 380;
  Col wall, trim, roofCol; uint32_t seed = 0;
  VenueKind venue = VenueKind::None; int doorSide = 0;   // for a place you can walk into: which side the door is on (0 +X, 1 -X, 2 +Y, 3 -Y)
};
struct PropSpec { PropKind kind = PropKind::Palm; V3 pos; double yaw = 0, scale = 1; uint32_t seed = 0; Col col; };
struct PoolSpec { V3 mn, mx; double rim = 100, water = 12; };   // a raised pool: the rim stands `rim` above the ground, the water is `water` below the top of it
struct WalkLoop {                                   // a closed loop on the pavement
  std::vector<V2> pts; double length = 0;
  void Close() { length = 0; for (size_t k = 0; k < pts.size(); k++) { V2 a = pts[k], b = pts[(k + 1) % pts.size()]; length += std::hypot(b.x - a.x, b.y - a.y); } }
  // The point s centimetres along the loop (wrapping round), and the way it is heading.
  V2 At(double s, V2* dir = nullptr) const {
    if (pts.empty() || length <= 0) return {0, 0};
    s = std::fmod(s, length); if (s < 0) s += length;
    for (size_t k = 0; k < pts.size(); k++) {
      V2 a = pts[k], b = pts[(k + 1) % pts.size()]; double L = std::hypot(b.x - a.x, b.y - a.y);
      if (s <= L || k + 1 == pts.size()) { double t = L > 0 ? s / L : 0; if (dir) *dir = L > 0 ? V2{(b.x - a.x) / L, (b.y - a.y) / L} : V2{1, 0}; return {a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t}; }
      s -= L;
    }
    return pts[0];
  }
};
struct BlockPlan {
  int i = 0, j = 0; District district = District::Low; V3 center; double half = kBlockW / 2;
  std::vector<BuildingSpec> buildings; std::vector<PropSpec> props; std::vector<PoolSpec> pools; WalkLoop loop;
  bool lawn = false; Col lawnCol;
};

inline V3 BlockCenter(int i, int j) { return {i * kPitch, j * kPitch, 0}; }
inline bool InGrid(int i, int j) { return i >= kGridMin && i <= kGridMax && j >= kGridMin && j <= kGridMax; }

// The places you can walk into, all within a block or two of where you start.
inline VenueKind VenueAt(int i, int j) {
  if (i == 0 && j == 1) return VenueKind::Petrol;
  if (i == 1 && j == 0) return VenueKind::Shop;
  if (i == -1 && j == 0) return VenueKind::Jeweller;
  if (i == 0 && j == -1) return VenueKind::Bank;
  if (i == 1 && j == 1) return VenueKind::Museum;
  return VenueKind::None;
}
inline const char* VenueName(VenueKind k) {
  switch (k) { case VenueKind::Petrol: return "Petrol station"; case VenueKind::Shop: return "24h shop"; case VenueKind::Jeweller: return "Jeweller"; case VenueKind::Bank: return "Bank"; case VenueKind::Museum: return "Museum"; default: return ""; }
}
inline District DistrictOf(int i, int j) {
  if (i == kBeachChunk) return District::Beach;
  if (VenueAt(i, j) != VenueKind::None) return District::Venue;
  if (i == 0 && j == 0) return District::Plaza;
  if (i == kGridMin) return District::Hotel;
  int d = std::max(std::abs(i), std::abs(j));
  if (d <= 2) return District::Downtown;
  uint32_t h = HashCell(i, j, 77);
  if (h % 9 == 0) return District::Park;
  return d <= 4 ? District::Mid : District::Low;
}
// Where the player starts (on the pavement of the plaza block, on its south side) and where the player's car is parked.
inline V3 SpawnPoint() { return {-300, -(kBlockW / 2) + kWalkW / 2 + 50, 100}; }
inline double SpawnYaw() { return kPi / 2; }
inline V3 HeroCarSpot() { return {-1700, -(kBlockW / 2) - 160 - 130, 0}; }       // on the carriageway beside the curb, heading east (+X)

// A loop on the pavement of a block (a rectangle with its corners cut), `inset` centimetres in from the kerb. Walked clockwise or the other way by whoever uses it.
inline WalkLoop PavementLoop(const V3& c, double half, double inset) {
  WalkLoop w; double h = half - inset, k = 260;
  w.pts = {{c.x - h + k, c.y - h}, {c.x + h - k, c.y - h}, {c.x + h, c.y - h + k}, {c.x + h, c.y + h - k}, {c.x + h - k, c.y + h}, {c.x - h + k, c.y + h}, {c.x - h, c.y + h - k}, {c.x - h, c.y - h + k}};
  w.Close(); return w;
}

namespace detail {
inline Col Pick(Rng& r, const std::vector<uint32_t>& pal) { return Hex(pal[r.I(int(pal.size()))]); }
inline const std::vector<uint32_t>& Stucco() { static const std::vector<uint32_t> p = {0xE9DFCF, 0xE2CDB6, 0xD6BFA1, 0xF0DCCD, 0xCEC5BB, 0xE4CBBF, 0xD5CCBA, 0xC2B3A5}; return p; }
inline const std::vector<uint32_t>& Brick() { static const std::vector<uint32_t> p = {0xA3523A, 0x8E4A38, 0xB86A4B, 0x7C5547, 0x9B6B55}; return p; }
inline const std::vector<uint32_t>& Concrete() { static const std::vector<uint32_t> p = {0xBFC0C2, 0xAEB2B6, 0xC8C6C0, 0x9EA3A8}; return p; }
inline const std::vector<uint32_t>& Glass() { static const std::vector<uint32_t> p = {0x7C93A8, 0x6C8499, 0x8AA3B3, 0x5F7790, 0x91A8A0}; return p; }
inline const std::vector<uint32_t>& CarCols() { static const std::vector<uint32_t> p = {0xE8E8EA, 0x1B1C1F, 0x8D1F24, 0x1F3F73, 0xA9ADB3, 0x2F5B3A, 0xE4B23A, 0x5C3A22, 0xC9C2B4, 0x3B3F46}; return p; }
inline void AddProp(BlockPlan& b, PropKind k, V3 pos, double yaw, double scale, Rng& r, Col col = {1, 1, 1, 1}) { PropSpec p; p.kind = k; p.pos = pos; p.yaw = yaw; p.scale = scale; p.seed = uint32_t(r.F() * 4294967295.0); p.col = col; b.props.push_back(p); }
}  // namespace detail

// Everything on one block.
inline BlockPlan MakeBlock(int i, int j, uint32_t seed = 2026) {
  using namespace detail;
  BlockPlan b; b.i = i; b.j = j; b.center = BlockCenter(i, j); b.district = DistrictOf(i, j);
  Rng r(HashCell(i, j, seed)); const V3 c = b.center; const double H = b.half, inner = H - kWalkW;
  b.loop = PavementLoop(c, H, kWalkW * 0.5);
  const VenueKind venue = VenueAt(i, j);

  // ---- the street furniture round the edge (every district) ----
  const double sideLen = 2 * inner;
  for (int side = 0; side < 4; side++) {                           // 0: south (-Y), 1: east (+X), 2: north (+Y), 3: west (-X)
    V3 dir = side == 0 ? V3{1, 0, 0} : side == 1 ? V3{0, 1, 0} : side == 2 ? V3{-1, 0, 0} : V3{0, -1, 0};       // along the pavement, going round the block
    V3 out = side == 0 ? V3{0, -1, 0} : side == 1 ? V3{1, 0, 0} : side == 2 ? V3{0, 1, 0} : V3{-1, 0, 0};          // towards the street
    V3 start = c + out * (H - 150) - dir * inner;                  // 150 cm in from the kerb, at the start of this side
    double yawAlong = YawOf(dir.x, dir.y), yawOut = YawOf(out.x, out.y);
    if (b.district != District::Beach) {
      for (double s = 1500; s < sideLen - 1500; s += 1800) if (!r.Chance(0.22) && !(b.district == District::Venue && std::fabs(s - sideLen / 2) < 2600)) AddProp(b, PropKind::Palm, start + dir * s, r.R(0, 6.28), r.R(0.9, 1.25), r);
      for (double s = 2400; s < sideLen - 1200; s += 3600) AddProp(b, PropKind::Lamp, c + out * (H - 60) - dir * inner + dir * s, yawOut + kPi, 1.0, r);
      if (r.Chance(0.5)) AddProp(b, PropKind::Hydrant, start + dir * r.R(900, sideLen - 900) + out * 60, yawOut, 1.0, r);
      if (r.Chance(0.4)) AddProp(b, PropKind::Bench, c + out * (H - 340) - dir * inner + dir * r.R(1500, sideLen - 1500), yawOut + kPi, 1.0, r);
      if (r.Chance(0.5)) AddProp(b, PropKind::Bin, start + dir * r.R(900, sideLen - 900) + out * 80 - dir * 80, yawOut, 1.0, r);
      // Cars parked at the kerb (not outside the places you can walk into, nor in the downtown towers' shade).
      if (b.district == District::Mid || b.district == District::Low || b.district == District::Hotel) {
        for (double s = 1800; s < sideLen - 1800; s += r.R(800, 1100)) if (r.Chance(0.34) && !(venue != VenueKind::None)) {
          V3 p = c + out * (H + 150 + 40) - dir * inner + dir * s; AddProp(b, PropKind::ParkedCar, p, yawAlong + (side >= 2 ? kPi : 0) + r.R(-0.02, 0.02), 1.0, r, Pick(r, CarCols()));
        }
      }
    }
  }
  // A traffic signal at each corner of the block (on the pavement, by the crossing).
  if (b.district != District::Beach) for (int cx : {-1, 1}) for (int cy : {-1, 1}) AddProp(b, PropKind::Signal, c + V3{cx * (H - 130), cy * (H - 130), 0}, YawOf(-cx, -cy), 1.0, r);

  // ---- the buildings ----
  auto wallCol = [&](bool brickOK) { return r.Chance(brickOK ? 0.3 : 0.0) ? Pick(r, Brick()) : Pick(r, Stucco()); };
  switch (b.district) {
    case District::Downtown: {
      BuildingSpec pod; pod.style = Style::Podium; pod.floors = 3; pod.floorH = 400; double pw = r.R(8200, 9000);
      pod.mn = {c.x - pw / 2, c.y - pw / 2, 0}; pod.mx = {c.x + pw / 2, c.y + pw / 2, 1200}; pod.wall = Pick(r, Concrete()); pod.trim = {0.2f, 0.2f, 0.22f, 1}; pod.roofCol = {0.3f, 0.3f, 0.32f, 1}; pod.seed = r.F() * 4e9; b.buildings.push_back(pod);
      BuildingSpec t; t.style = Style::Tower; t.roof = RoofKind::Stepped; double w = r.R(4200, 5800), d = r.R(4200, 5800), h = r.R(10000, 23000); t.floorH = 400; t.floors = int(h / t.floorH);
      double ox = r.R(-600, 600), oy = r.R(-600, 600); t.mn = {c.x + ox - w / 2, c.y + oy - d / 2, 1200}; t.mx = {c.x + ox + w / 2, c.y + oy + d / 2, 1200 + t.floors * t.floorH};
      t.wall = Pick(r, Glass()); t.trim = Scale(t.wall, 0.55f); t.roofCol = {0.25f, 0.26f, 0.28f, 1}; t.seed = r.F() * 4e9; b.buildings.push_back(t); break;
    }
    case District::Mid: {
      for (int a = 0; a < 2; a++) for (int e = 0; e < 2; e++) {
        if (r.Chance(0.1)) { for (int k = 0; k < 4; k++) AddProp(b, PropKind::ParkedCar, c + V3{(a ? 1 : -1) * 2450 + r.R(-1500, 1500), (e ? 1 : -1) * 2450 + r.R(-1500, 1500), 0}, r.Chance(0.5) ? 0 : kPi / 2, 1.0, r, Pick(r, CarCols())); continue; }
        BuildingSpec t; t.style = Style::Mid; double w = r.R(3000, 4000), d = r.R(3000, 4000); t.floorH = 380; t.floors = 5 + r.I(14); double h = t.floors * t.floorH;
        V3 cc = c + V3{(a ? 1 : -1) * 2450 + r.R(-300, 300), (e ? 1 : -1) * 2450 + r.R(-300, 300), 0};
        t.mn = {cc.x - w / 2, cc.y - d / 2, 0}; t.mx = {cc.x + w / 2, cc.y + d / 2, h}; t.wall = r.Chance(0.5) ? wallCol(true) : Pick(r, Concrete()); t.trim = Scale(t.wall, 0.8f); t.roofCol = {0.32f, 0.31f, 0.3f, 1}; t.seed = r.F() * 4e9; b.buildings.push_back(t);
      }
      break;
    }
    case District::Low: {
      for (int a = 0; a < 3; a++) for (int e = 0; e < 2; e++) {
        BuildingSpec t; t.style = Style::House; t.roof = RoofKind::Gabled; double w = r.R(1300, 1700), d = r.R(1000, 1300); t.floors = 1 + (r.Chance(0.4) ? 1 : 0); t.floorH = 330;
        V3 cc = c + V3{(a - 1) * 3000.0, (e ? 1 : -1) * 2450.0, 0}; double front = e ? 1 : -1;               // towards the nearer street: the house stands that way, the garden is behind it
        cc.y += front * 450;
        bool turned = r.Chance(0.5); if (turned) std::swap(w, d);
        t.mn = {cc.x - w / 2, cc.y - d / 2, 0}; t.mx = {cc.x + w / 2, cc.y + d / 2, t.floors * t.floorH}; t.wall = wallCol(false); t.trim = {0.94f, 0.92f, 0.88f, 1}; t.roofCol = Pick(r, {0x8A4B3A, 0x6E5A4E, 0x5A5F66, 0x9A6A52}); t.seed = r.F() * 4e9; b.buildings.push_back(t);
        if (r.Chance(0.4)) { PoolSpec p; double pw = 700, pd = 380; V3 pc = c + V3{(a - 1) * 3000.0 + r.R(-200, 200), (e ? 1 : -1) * 2450.0 - front * 1250, 0}; p.mn = {pc.x - pw / 2, pc.y - pd / 2, 0}; p.mx = {pc.x + pw / 2, pc.y + pd / 2, 0}; b.pools.push_back(p);
          AddProp(b, PropKind::Lounger, pc + V3{0, pd / 2 + 140, 0}, kPi / 2, 1.0, r); AddProp(b, PropKind::Lounger, pc + V3{200, pd / 2 + 140, 0}, kPi / 2, 1.0, r); AddProp(b, PropKind::Umbrella, pc + V3{-300, pd / 2 + 180, 0}, 0, 1.0, r, Hex(0xE04A3A)); }
        AddProp(b, PropKind::Hedge, cc + V3{0, front * (d / 2 + 900), 0}, 0, 1.0, r);
        if (r.Chance(0.6)) AddProp(b, PropKind::Tree, cc + V3{r.R(-800, 800), front * -(d / 2 + 700), 0}, 0, r.R(0.8, 1.2), r);
      }
      b.lawn = true; b.lawnCol = {0.28f, 0.42f, 0.18f, 1}; break;
    }
    case District::Park: case District::Plaza: {
      b.lawn = true; b.lawnCol = {0.26f, 0.42f, 0.17f, 1};
      int n = b.district == District::Plaza ? 8 : 18;
      for (int k = 0; k < n; k++) AddProp(b, b.district == District::Plaza ? PropKind::Palm : PropKind::Tree, c + V3{r.R(-inner + 700, inner - 700), r.R(-inner + 700, inner - 700), 0}, r.R(0, 6.28), r.R(0.9, 1.3), r);
      for (int k = 0; k < 6; k++) AddProp(b, PropKind::Bush, c + V3{r.R(-inner + 400, inner - 400), r.R(-inner + 400, inner - 400), 0}, 0, r.R(0.8, 1.4), r);
      if (b.district == District::Plaza) AddProp(b, PropKind::Fountain, c, 0, 1.0, r);
      for (int k = 0; k < 4; k++) AddProp(b, PropKind::Bench, c + V3{(k < 2 ? -1 : 1) * 1300.0, (k % 2 ? 1 : -1) * 1300.0, 0}, YawOf(-(k < 2 ? -1 : 1), -(k % 2 ? 1 : -1)), 1.0, r);
      break;
    }
    case District::Hotel: {
      BuildingSpec t; t.style = Style::Hotel; t.roof = RoofKind::Flat; t.floorH = 340; t.floors = 9 + r.I(5); double w = 2600, d = 7800;
      t.mn = {c.x - 2300 - w / 2, c.y - d / 2, 0}; t.mx = {c.x - 2300 + w / 2, c.y + d / 2, t.floors * t.floorH}; t.wall = Hex(0xF2EADC); t.trim = Hex(0x2B6F8A); t.roofCol = {0.4f, 0.4f, 0.42f, 1}; t.seed = r.F() * 4e9; b.buildings.push_back(t);
      PoolSpec p; double pw = 1000, pd = 2600; V3 pc = c + V3{800, (r.Chance(0.5) ? 1 : -1) * 600.0, 0}; p.mn = {pc.x - pw / 2, pc.y - pd / 2, 0}; p.mx = {pc.x + pw / 2, pc.y + pd / 2, 0}; b.pools.push_back(p);
      for (int k = 0; k < 6; k++) { AddProp(b, PropKind::Lounger, pc + V3{pw / 2 + 200, -pd / 2 + 300 + k * 480.0, 0}, -kPi / 2 * 0, 1.0, r); AddProp(b, PropKind::Lounger, pc + V3{-pw / 2 - 200, -pd / 2 + 300 + k * 480.0, 0}, kPi, 1.0, r); }
      for (int k = 0; k < 3; k++) AddProp(b, PropKind::Umbrella, pc + V3{(k % 2 ? 1 : -1) * (pw / 2 + 560), -pd / 2 + 700 + k * 1000.0, 0}, 0, 1.0, r, Hex(k % 2 ? 0xF2F2F2 : 0xE8B33A));
      for (int k = 0; k < 5; k++) {                                          // palms in the courtyard: clear of the hotel, the pool and its loungers
        for (int tries = 0; tries < 12; tries++) {
          V3 q = pc + V3{r.R(-300, 2900), r.R(-3300, 3300), 0};
          if (std::fabs(q.x - pc.x) < pw / 2 + 900 && std::fabs(q.y - pc.y) < pd / 2 + 900) continue;
          AddProp(b, PropKind::Palm, q, r.R(0, 6.28), r.R(1.0, 1.3), r); break;
        }
      }
      b.lawn = true; b.lawnCol = {0.3f, 0.45f, 0.2f, 1}; break;
    }
    case District::Venue: {
      BuildingSpec t; t.style = Style::Venue; t.venue = venue; double w = 4400, d = 3400;           // w along X, d along Y
      t.floorH = venue == VenueKind::Bank || venue == VenueKind::Museum ? 560 : 420; t.floors = 1; double h = t.floorH + (venue == VenueKind::Museum ? 200 : 0);
      // The door faces the street towards the plaza (where you start).
      t.doorSide = i > 0 ? 1 : i < 0 ? 0 : (j > 0 ? 3 : 2);
      if (t.doorSide >= 2) std::swap(w, d);
      t.mn = {c.x - w / 2, c.y - d / 2, 0}; t.mx = {c.x + w / 2, c.y + d / 2, h};
      const V3 push = t.doorSide == 0 ? V3{(inner - w / 2 - 800), 0, 0} : t.doorSide == 1 ? V3{-(inner - w / 2 - 800), 0, 0} : t.doorSide == 2 ? V3{0, inner - d / 2 - 800, 0} : V3{0, -(inner - d / 2 - 800), 0};
      t.mn += push; t.mx += push;
      t.wall = venue == VenueKind::Bank ? Hex(0xD9D2C4) : venue == VenueKind::Museum ? Hex(0xE6DECE) : venue == VenueKind::Jeweller ? Hex(0x2B2A33) : venue == VenueKind::Petrol ? Hex(0xE9E6DD) : Hex(0xEBD9B8);
      t.trim = venue == VenueKind::Petrol ? Hex(0xD62F2A) : venue == VenueKind::Shop ? Hex(0x1F6F4A) : Hex(0x8A7A55); t.roofCol = {0.3f, 0.3f, 0.32f, 1}; t.seed = r.F() * 4e9; b.buildings.push_back(t);
      b.lawn = false;
      if (venue == VenueKind::Petrol) {                                      // two islands of two pumps in front of the shop
        V3 door = t.doorSide == 0 ? V3{1, 0, 0} : t.doorSide == 1 ? V3{-1, 0, 0} : t.doorSide == 2 ? V3{0, 1, 0} : V3{0, -1, 0}, mid = (t.mn + t.mx) * 0.5, side{-door.y, door.x, 0};
        double he = ((t.doorSide < 2 ? t.mx.x - t.mn.x : t.mx.y - t.mn.y)) / 2;
        for (double off : {-1100.0, -500.0, 500.0, 1100.0}) AddProp(b, PropKind::PetrolPump, mid + door * (he + 1400) + side * off, YawOf(door.x, door.y), 1.0, r);
      }
      for (int k = 0; k < 3; k++) AddProp(b, PropKind::ParkedCar, c + V3{r.R(-inner + 900, inner - 900), r.R(-inner + 900, inner - 900), 0}, r.Chance(0.5) ? 0 : kPi / 2, 1.0, r, Pick(r, CarCols()));
      break;
    }
    case District::Beach: break;
  }
  return b;
}

// The beach chunk (west of the last blocks): promenade, sand, umbrellas, loungers, towels, lifeguard towers, a volleyball net, palms along the promenade. `j` runs along the shore.
inline BlockPlan MakeBeach(int j, uint32_t seed = 2026) {
  using namespace detail;
  BlockPlan b; b.i = kBeachChunk; b.j = j; b.district = District::Beach; b.center = {kPitch * kBeachChunk, j * kPitch, 0}; Rng r(HashCell(kBeachChunk, j, seed));
  const double y0 = j * kPitch - kPitch / 2;
  for (double s = 600; s < kPitch; s += 1700) { if (r.Chance(0.2)) continue; AddProp(b, PropKind::Palm, {kPromenadeX - 350, y0 + s, 0}, r.R(0, 6.28), r.R(1.0, 1.35), r); }
  for (double s = 1500; s < kPitch; s += 3400) AddProp(b, PropKind::Lamp, {kPromenadeX - 150, y0 + s, 0}, kPi, 1.0, r);
  for (double s = 2500; s < kPitch; s += 4200) AddProp(b, PropKind::Bench, {kPromenadeX - 560, y0 + s, 0}, kPi, 1.0, r);
  // Umbrellas in loose rows across the dry sand, with loungers and towels beside them.
  for (double x = kSandX - 700; x > kShoreX + 1200; x -= 1100) for (double s = 500; s < kPitch; s += 700) {
    if (!r.Chance(0.2)) continue;
    V3 p{x + r.R(-120, 120), y0 + s + r.R(-150, 150), 0};
    AddProp(b, PropKind::Umbrella, p, r.R(0, 6.28), 1.0, r, Pick(r, std::vector<uint32_t>{0xE04A3A, 0xF2F2F2, 0x2A7AA8, 0xE8B33A, 0x4AA86B, 0xE06A9A}));
    AddProp(b, PropKind::Lounger, p + V3{-170, -60, 0}, kPi / 2, 1.0, r); AddProp(b, PropKind::Lounger, p + V3{-170, 90, 0}, kPi / 2, 1.0, r);
    if (r.Chance(0.5)) AddProp(b, PropKind::Towel, p + V3{200, r.R(-100, 100), 0}, r.R(0, 3.14), 1.0, r, Pick(r, std::vector<uint32_t>{0x2A7AA8, 0xE06A9A, 0xF2F2F2, 0xE8B33A}));
  }
  if (j % 3 == 0) AddProp(b, PropKind::Lifeguard, {kShoreX + 2200, y0 + kPitch * 0.5, 0}, kPi, 1.0, r);
  if (j % 4 == 1) AddProp(b, PropKind::VolleyNet, {kShoreX + 3800, y0 + kPitch * 0.4, 0}, 0, 1.0, r);
  b.loop = WalkLoop(); b.loop.pts = {{kPromenadeX - 200, y0 + 300}, {kPromenadeX - 200, y0 + kPitch - 300}}; b.loop.Close();
  return b;
}

// How high the sand is at x (cm, west of the promenade): level up to a point, then sloping down under the sea, then flat on the bottom.
inline double SandHeight(double x) {
  if (x >= kSandX - 1000) return 0;
  double slope = 0.025, drop = (kSandX - 1000 - x) * slope; return std::max(-300.0, -drop);
}

}  // namespace SC
