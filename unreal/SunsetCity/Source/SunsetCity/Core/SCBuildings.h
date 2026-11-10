// Sunset City (Unreal Engine 5): the buildings and the ground as meshes. A tower is a glass skin on a dark frame; a podium has ribbon windows; a mid-rise has a window in every bay,
// balconies, air-conditioners, a shopfront with an awning and a rooftop with plant; a house has a gabled roof, a porch, shutters, a garage; the hotel has a balcony to every room; the
// places you can walk into have a real room (walls you can walk between, the floor, the ceiling, the fittings, lights) that is lit by Unreal's own lights. The ground is a slab of road
// with the pavement, the lawn, the kerbs, the lane lines and the crossings on it, the pools are raised basins with water. As in the rest of Core/, every piece is a Mesh whose quads
// carry their material in the alpha of the colour (see Mat), and Tests/core_tests.cpp checks them with an ordinary compiler.
#pragma once
#include <array>
#include "SCCityPlan.h"
#include "SCMesh.h"
#include "SCProps.h"
#include "SCVenue.h"

namespace SC {

namespace detail {
// One wall of a box-shaped building, seen from outside: where it starts (lowest corner), the way along it, the way out, how long it is.
struct Side { V3 o, u, n; double len = 0; };
inline std::array<Side, 4> SidesOf(const V3& mn, const V3& mx) {
  std::array<Side, 4> s;
  s[0] = Side{{mx.x, mn.y, mn.z}, {0, 1, 0}, {1, 0, 0}, mx.y - mn.y};
  s[1] = Side{{mx.x, mx.y, mn.z}, {-1, 0, 0}, {0, 1, 0}, mx.x - mn.x};
  s[2] = Side{{mn.x, mx.y, mn.z}, {0, -1, 0}, {-1, 0, 0}, mx.y - mn.y};
  s[3] = Side{{mn.x, mn.y, mn.z}, {1, 0, 0}, {0, -1, 0}, mx.x - mn.x};
  return s;
}
// A box standing on a wall: a0..a1 along it, n0..n1 out from it, z0..z1 up (world z).
inline void BoxOn(Mesh& m, const Side& s, double a0, double a1, double n0, double n1, double z0, double z1, const Col& c, uint32_t faces = 63) {
  V3 p = s.o + s.u * a0 + s.n * n0, q = s.o + s.u * a1 + s.n * n1;
  m.Box({std::min(p.x, q.x), std::min(p.y, q.y), std::min(z0, z1)}, {std::max(p.x, q.x), std::max(p.y, q.y), std::max(z0, z1)}, c, faces);
}
// A flat pane on a wall (a0..a1 along it, z0..z1 up), `n0` out from the wall, facing outwards.
inline void PaneOn(Mesh& m, const Side& s, double a0, double a1, double n0, double z0, double z1, const Col& c) {
  V3 p = s.o + s.u * a0 + s.n * n0; p.z = z0; Facing(m, p, s.u * (a1 - a0), V3{0, 0, z1 - z0}, s.n, c);
}
// A window: glass in a frame with a sill, a lintel and a mullion. `lit`: the room behind it has its light on (a warm glow at night).
inline void WindowOn(Mesh& m, const Side& s, double a, double z, double w, double h, const Col& frame, bool lit, bool full = false) {
  const double f = 5, dp = 6; const Col glass = lit ? MH(0xFFD39A, MAT_GLOW) : MH(0x17222B, MAT_GLASS);
  PaneOn(m, s, a, a + w, 0.8, z, z + h, glass);
  BoxOn(m, s, a - f, a + w + f, 0, dp + 2, z - f, z, frame, 63);                                   // sill (sticks out a little more)
  BoxOn(m, s, a - f, a + w + f, 0, dp, z + h, z + h + f, frame, 31);                            // lintel
  if (full) {
    BoxOn(m, s, a - f, a, 0, dp, z, z + h, frame, 63); BoxOn(m, s, a + w, a + w + f, 0, dp, z, z + h, frame, 63);                        // jambs
    BoxOn(m, s, a + w * 0.5 - 1.5, a + w * 0.5 + 1.5, 0.5, dp - 1, z, z + h, frame, 63);                                                // mullion
    BoxOn(m, s, a, a + w, 0.5, dp - 1, z + h * 0.62 - 1.5, z + h * 0.62 + 1.5, frame, 63);                                              // transom
  }
}
// A balcony: a slab with a glass screen and a handrail.
inline void BalconyOn(Mesh& m, const Side& s, double a, double w, double z, double depth, const Col& slab, const Col& rail) {
  BoxOn(m, s, a, a + w, 0, depth, z - 14, z, slab);
  PaneOn(m, s, a + 2, a + w - 2, depth - 2, z + 4, z + 98, MH(0x9FB6C4, MAT_GLASS));
  BoxOn(m, s, a, a + w, depth - 5, depth, z + 96, z + 103, rail);
  BoxOn(m, s, a, a + 4, 0, depth, z + 96, z + 103, rail); BoxOn(m, s, a + w - 4, a + w, 0, depth, z + 96, z + 103, rail);
}
// An awning over a shopfront: a sloping sheet from the wall down and out.
inline void AwningOn(Mesh& m, const Side& s, double a0, double a1, double zTop, double depth, double drop, const Col& c) {
  V3 A = s.o + s.u * a0, B = s.o + s.u * a1, C = B + s.n * depth, D = A + s.n * depth; A.z = B.z = zTop; C.z = D.z = zTop - drop;
  QuadWant(m, A, B, C, D, s.n + V3{0, 0, 1}, c); QuadWant(m, A, B, C, D, s.n * -1.0 + V3{0, 0, -1}, c);
  BoxOn(m, s, a0, a1, depth - 3, depth, zTop - drop - 22, zTop - drop, c);
}
inline Col Dark(const Col& c, float k) { Col r = Scale(c, k); r.a = c.a; return r; }
// A flat roof: a parapet round the edge, and on it some plant (a stair-head, a tank, air-conditioning units).
inline void FlatRoof(Mesh& m, const V3& mn, const V3& mx, double top, const Col& roof, const Col& wall, Rng& r, bool plant) {
  Col rf = MC(roof, MAT_ROOF), wl = MC(wall, MAT_WALL), mt = MH(0x8D9399, MAT_METAL);
  const double t = 22, hgt = 90;
  m.Box({mn.x, mn.y, top - 4}, {mx.x, mx.y, top}, rf, 16);
  m.Box({mn.x, mn.y, top}, {mx.x, mn.y + t, top + hgt}, wl, 63); m.Box({mn.x, mx.y - t, top}, {mx.x, mx.y, top + hgt}, wl, 63);
  m.Box({mn.x, mn.y + t, top}, {mn.x + t, mx.y - t, top + hgt}, wl, 63); m.Box({mx.x - t, mn.y + t, top}, {mx.x, mx.y - t, top + hgt}, wl, 63);
  if (!plant) return;
  double w = mx.x - mn.x, d = mx.y - mn.y;
  m.Box({mn.x + w * 0.1, mn.y + d * 0.1, top}, {mn.x + w * 0.1 + std::min(300.0, w * 0.3), mn.y + d * 0.1 + std::min(300.0, d * 0.3), top + 240}, wl, 63);           // stair-head
  double tx = mx.x - w * 0.28, ty = mx.y - d * 0.28;
  for (double dx : {-45.0, 45.0}) for (double dy : {-45.0, 45.0}) m.Between({tx + dx, ty + dy, top}, {tx + dx, ty + dy, top + 150}, 5, 5, 6, mt, true);          // a water tank on legs
  m.Cylinder({tx, ty, top + 150}, 85, 190, 14, MH(0x9A8A72, MAT_WOOD), true); m.Frustum({tx, ty, top + 340}, 88, 10, 40, 14, MH(0x6D6A64, MAT_METAL), false, true);
  for (int k = 0; k < 3; k++) { double ux = mn.x + w * (0.25 + 0.2 * k) + r.R(-50, 50), uy = mn.y + d * (0.55 + r.R(-0.1, 0.1)); m.Box({ux, uy, top}, {ux + 150, uy + 110, top + 90}, mt, 63); m.Cylinder({ux + 75, uy + 55, top + 90}, 38, 8, 12, MH(0x30343A, MAT_METAL), true); }
}
// A gabled roof over the footprint (the ridge along the longer side), with an overhang, a chimney and the gable ends filled.
inline void GableRoof(Mesh& m, const V3& mn, const V3& mx, double top, const Col& roof, const Col& wall, Rng& r) {
  const double w = mx.x - mn.x, d = mx.y - mn.y; const bool alongX = w >= d; const double L = alongX ? w : d, Wd = alongX ? d : w, oh = 55, hw = Wd / 2 + oh, hl = L / 2 + oh, ridge = hw * 0.62, ze = -oh * 0.22;
  Mesh g; const Col rf = MC(roof, MAT_ROOF), wl = MC(wall, MAT_WALL);
  g.Quad({-hl, -hw, ze}, {hl, -hw, ze}, {hl, 0, ridge}, {-hl, 0, ridge}, rf);                    // the south slope (facing -Y and up)
  g.Quad({hl, hw, ze}, {-hl, hw, ze}, {-hl, 0, ridge}, {hl, 0, ridge}, rf);                      // the north slope
  g.Triangle({L / 2, -hw, ze}, {L / 2, hw, ze}, {L / 2, 0, ridge}, wl); g.Triangle({-L / 2, hw, ze}, {-L / 2, -hw, ze}, {-L / 2, 0, ridge}, wl);     // gable ends
  g.Box({-L * 0.28, Wd * 0.18, 0}, {-L * 0.28 + 55, Wd * 0.18 + 70, ridge * 0.9 + 70}, MH(0xA3523A, MAT_WALL), 63);                                         // chimney
  g.Box({-L * 0.28 - 6, Wd * 0.18 - 6, ridge * 0.9 + 70}, {-L * 0.28 + 61, Wd * 0.18 + 76, ridge * 0.9 + 84}, MH(0x77716A, MAT_STONE), 63);
  (void)r;
  m.Append(g, {(mn.x + mx.x) / 2, (mn.y + mx.y) / 2, top}, alongX ? 0.0 : kPi / 2);
}
}  // namespace detail

// The ground under and round a block: the road, the pavement, the lawn, the lane lines and the crossings. The cell is the block and half of each street round it.
inline Mesh BuildBlockGround(const BlockPlan& b) {
  using namespace detail;
  Mesh m; const V3 c = b.center; const double P = kPitch / 2, H = b.half;
  m.Box({c.x - P, c.y - P, -40}, {c.x + P, c.y + P, 0}, MH(0x2B2D31, MAT_ASPHALT), 16);
  m.Box({c.x - H, c.y - H, -40}, {c.x + H, c.y + H, kCurbH}, MH(0xB4B0A7, MAT_STONE), 31);
  if (b.lawn) { double in = H - kWalkW; Col l = b.lawnCol; l.a = float(MAT_LAWN); m.Box({c.x - in, c.y - in, kCurbH - 2}, {c.x + in, c.y + in, kCurbH + 6}, l, 31); }
  const Col white = MH(0xEDEDE8, MAT_LINE), yellow = MH(0xE2B100, MAT_LINE); const double lw = 5, hz = 1.2;
  for (int sgn : {-1, 1}) {
    const double off = sgn * (P - 14);                                                                  // each cell draws its own half of the double line down the middle of the street
    m.Box({c.x - H + 500, c.y + off - lw, 0}, {c.x + H - 500, c.y + off + lw, hz}, yellow, 16); m.Box({c.x + off - lw, c.y - H + 500, 0}, {c.x + off + lw, c.y + H - 500, hz}, yellow, 16);
    const double edge = sgn * (H + 55);                                                                 // a white line near the kerb
    m.Box({c.x - H + 500, c.y + edge - lw, 0}, {c.x + H - 500, c.y + edge + lw, hz}, white, 16); m.Box({c.x + edge - lw, c.y - H + 500, 0}, {c.x + edge + lw, c.y + H - 500, hz}, white, 16);
  }
  auto bar = [&](double xa, double ya, double xb, double yb) { m.Box({std::min(xa, xb), std::min(ya, yb), 0}, {std::max(xa, xb), std::max(ya, yb), hz}, white, 16); };
  for (int sgn : {-1, 1}) for (int end : {-1, 1}) for (int k = 0; k < 6; k++) {                           // crossings: bars across the street at each end of each side
    const double q = end * (H - 120) - end * k * 100.0;
    bar(c.x + q - 25, c.y + sgn * (H + 90), c.x + q + 25, c.y + sgn * (P - 60)); bar(c.x + sgn * (H + 90), c.y + q - 25, c.x + sgn * (P - 60), c.y + q + 25);
  }
  return m;
}
// The promenade and the end of the road, for a chunk of the beach.
inline Mesh BuildPromenade(const BlockPlan& b) {
  using namespace detail;
  Mesh m; const double y0 = b.center.y - kPitch / 2, y1 = b.center.y + kPitch / 2;
  m.Box({kSandX, y0, -40}, {kPromenadeX, y1, kCurbH}, MH(0xCFC8B8, MAT_STONE), 31);
  m.Box({kPromenadeX, y0, -40}, {b.center.x + kPitch / 2, y1, 0}, MH(0x2B2D31, MAT_ASPHALT), 16);
  for (double y = y0 + 200; y < y1; y += 400) m.Box({kSandX + 60, y, kCurbH}, {kPromenadeX - 60, y + 4, kCurbH + 0.6}, MH(0xB9B1A0, MAT_STONE), 16);   // paving joints
  return m;
}
// The sea: one big sheet at sea level, from the shore out to the horizon.
inline Mesh BuildSea(double yHalf = 400000, double xWest = -420000) {
  Mesh m; detail::Facing(m, {xWest, -yHalf, kSeaLevel}, {kShoreX + 2500 - xWest, 0, 0}, {0, 2 * yHalf, 0}, {0, 0, 1}, detail::MH(0x1B7C9C, MAT_WATER), 1000.0); return m;
}

// A pool: a raised basin with a stone rim, a tiled bottom and the water.
inline Mesh BuildPool(const PoolSpec& p) {
  using namespace detail;
  Mesh m; const Col stone = MH(0xE6E1D6, MAT_STONE), tile = MH(0x6FC3D8, MAT_TILE), water = MH(0x1E9AC4, MAT_WATER); const double t = 40, top = p.rim;
  m.Box({p.mn.x, p.mn.y, 0}, {p.mx.x, p.mn.y + t, top}, stone, 63); m.Box({p.mn.x, p.mx.y - t, 0}, {p.mx.x, p.mx.y, top}, stone, 63);
  m.Box({p.mn.x, p.mn.y + t, 0}, {p.mn.x + t, p.mx.y - t, top}, stone, 63); m.Box({p.mx.x - t, p.mn.y + t, 0}, {p.mx.x, p.mx.y - t, top}, stone, 63);
  const V3 in0{p.mn.x + t, p.mn.y + t, 0}; const double iw = p.mx.x - p.mn.x - 2 * t, id = p.mx.y - p.mn.y - 2 * t;
  Facing(m, {in0.x, in0.y, kCurbH + 8}, {iw, 0, 0}, {0, id, 0}, {0, 0, 1}, tile, 100.0);
  Facing(m, {in0.x, in0.y, top - p.water}, {iw, 0, 0}, {0, id, 0}, {0, 0, 1}, water, 100.0);
  for (int k = 0; k < 3; k++) m.Box({in0.x, in0.y, kCurbH + 8}, {in0.x + 60.0 * (3 - k), in0.y + id, kCurbH + 8 + 14.0 * (k + 1)}, tile, 63);                 // steps down at the shallow end
  for (int k = 0; k < 2; k++) { double y = p.mn.y + (p.mx.y - p.mn.y) * (k ? 0.75 : 0.25); m.Box({p.mn.x - 3, y - 6, top - 40}, {p.mn.x, y + 6, top + 4}, MH(0xD0D4D8, MAT_METAL), 63); }   // a ladder rail on the rim
  return m;
}

// ---- the buildings ----
inline Mesh BuildBuilding(const BuildingSpec& s) {
  using namespace detail;
  Mesh m; Rng r(s.seed ? s.seed : 3u); const auto sides = SidesOf(s.mn, s.mx);
  const Col wall = MC(s.wall, MAT_WALL), trim = MC(s.trim, MAT_TRIM), dark = MH(0x2A2C30, MAT_TRIM), metal = MH(0x8D9399, MAT_METAL);
  const double top = s.mx.z;
  switch (s.style) {
    case Style::Tower: {
      m.Box(s.mn, s.mx, MC(Dark(s.trim, 0.6f), MAT_WALL), 31);
      const Col glass = MC(s.wall, MAT_WINDOW);
      for (const Side& sd : sides) {
        for (int k = 0; k < s.floors; k++) { double z0 = s.mn.z + k * s.floorH; PaneOn(m, sd, 24, sd.len - 24, 2.0, z0 + 85, z0 + s.floorH - 40, glass); }
        for (double a = 24; a <= sd.len - 24 + 1; a += 150) BoxOn(m, sd, a - 4, a + 4, 0, 14, s.mn.z, top, trim, 63 & ~32u);
        BoxOn(m, sd, 0, sd.len, 0, 8, s.mn.z, s.mn.z + 30, trim, 63);
      }
      const double w = s.mx.x - s.mn.x, d = s.mx.y - s.mn.y; const V3 cc{(s.mn.x + s.mx.x) / 2, (s.mn.y + s.mx.y) / 2, 0};
      m.Box({cc.x - w * 0.5, cc.y - d * 0.5, top}, {cc.x + w * 0.5, cc.y + d * 0.5, top + 24}, MC(s.roofCol, MAT_ROOF), 63);
      if (s.roof == RoofKind::Stepped) {
        m.Box({cc.x - w * 0.38, cc.y - d * 0.38, top}, {cc.x + w * 0.38, cc.y + d * 0.38, top + 360}, MC(Dark(s.trim, 0.8f), MAT_WALL), 63);
        m.Box({cc.x - w * 0.22, cc.y - d * 0.22, top + 360}, {cc.x + w * 0.22, cc.y + d * 0.22, top + 620}, MC(Dark(s.trim, 0.9f), MAT_WALL), 63);
        m.Cylinder({cc.x, cc.y, top + 620}, 14, 1300, 8, metal, true); m.Box({cc.x - 9, cc.y - 9, top + 1900}, {cc.x + 9, cc.y + 9, top + 1930}, MH(0xFF2A1E, MAT_GLOW), 63);
      }
      break;
    }
    case Style::Podium: {
      m.Box(s.mn, s.mx, wall, 15);
      const Col glass = MH(0x6F8BA0, MAT_WINDOW);
      for (const Side& sd : sides) {
        for (int k = 0; k < s.floors; k++) {
          double z0 = s.mn.z + k * s.floorH; bool ground = k == 0;
          PaneOn(m, sd, 60, sd.len - 60, 2.0, z0 + (ground ? 40 : 100), z0 + s.floorH - (ground ? 60 : 70), glass);
          BoxOn(m, sd, 0, sd.len, 0, 18, z0 + s.floorH - 14, z0 + s.floorH + 10, trim);
        }
        for (double a = 60; a <= sd.len - 60 + 1; a += 300) BoxOn(m, sd, a - 6, a + 6, 0, 12, s.mn.z, top, trim, 63 & ~32u);
      }
      const Side& f = sides[0]; BoxOn(m, f, f.len / 2 - 420, f.len / 2 + 420, 0, 380, 330, 354, dark); for (double a : {-400.0, 400.0}) BoxOn(m, f, f.len / 2 + a - 14, f.len / 2 + a + 14, 340, 368, s.mn.z, 330, metal);
      FlatRoof(m, s.mn, s.mx, top, s.roofCol, s.wall, r, false);
      break;
    }
    case Style::Mid: {
      m.Box(s.mn, s.mx, wall, 15);
      const Col frame = MC(Dark(s.trim, 0.55f), MAT_TRIM), slab = MC(Mix(s.trim, Col{0.7f, 0.7f, 0.7f, 1}, 0.4f), MAT_STONE);
      for (size_t i = 0; i < sides.size(); i++) {
        const Side& sd = sides[i]; const double bay = 340, ww = 150, wh = 175; const int n = std::max(1, int((sd.len - 160) / bay)); const double margin = (sd.len - n * bay) / 2 + (bay - ww) / 2;
        BoxOn(m, sd, -4, sd.len + 4, -4, 6, s.mn.z, s.mn.z + 55, MC(Dark(s.wall, 0.55f), MAT_STONE));                                               // plinth
        BoxOn(m, sd, -12, sd.len + 12, -12, 14, top - 38, top, trim);                                                                                  // cornice
        for (int k = 1; k < s.floors; k++) {
          const double z0 = s.mn.z + k * s.floorH + 95;
          for (int q = 0; q < n; q++) {
            const double a = margin + q * bay; const bool lit = r.Chance(0.3);
            WindowOn(m, sd, a, z0, ww, wh, frame, lit, k < 4);
            if (k > 1 && q % 2 == 0 && r.Chance(0.3) && s.floors < 12) BalconyOn(m, sd, a - 40, ww + 80, z0 - 82, 150, slab, frame);
            else if (r.Chance(0.12)) BoxOn(m, sd, a + 20, a + ww - 20, 0, 42, z0 - 60, z0 - 10, MH(0xCDD1D4, MAT_METAL));
          }
        }
        const double gz = s.mn.z + 70;                                                                                                                 // the shopfront
        PaneOn(m, sd, 110, sd.len - 110, 2.0, gz, gz + 250, MH(0x20323C, MAT_GLASS));
        for (double a = 110; a <= sd.len - 110 + 1; a += 260) BoxOn(m, sd, a - 5, a + 5, 0, 8, s.mn.z, gz + 270, frame, 63 & ~32u);
        BoxOn(m, sd, 100, sd.len - 100, 0, 8, gz + 250, gz + 300, frame);
        if (i % 2 == 0 || r.Chance(0.4)) AwningOn(m, sd, 110, sd.len - 110, gz + 295, 150, 55, MC(Hex(r.Chance(0.5) ? 0x8E2F2F : 0x1F4A6B), MAT_FABRIC));
      }
      FlatRoof(m, s.mn, s.mx, top, s.roofCol, s.wall, r, true);
      break;
    }
    case Style::House: {
      m.Box(s.mn, s.mx, wall, 31);
      const Col frame = MC(s.trim, MAT_TRIM), shut = MH(r.Chance(0.5) ? 0x2F5D62 : 0x6B2E2A, MAT_PAINT);
      const int doorSide = int(r.I(4)), garage = (doorSide + 1 + int(r.I(2))) % 4;
      for (int i = 0; i < 4; i++) {
        const Side& sd = sides[size_t(i)]; const int n = std::max(1, int((sd.len - 200) / 380)); const double margin = (sd.len - n * 380.0) / 2 + 100;
        BoxOn(m, sd, -3, sd.len + 3, -3, 4, s.mn.z, s.mn.z + 45, MC(Dark(s.wall, 0.6f), MAT_STONE));
        for (int k = 0; k < s.floors; k++) {
          const double z0 = s.mn.z + k * s.floorH + 95;
          for (int q = 0; q < n; q++) {
            const double a = margin + q * 380.0;
            const bool onDoor = i == doorSide && k == 0 && q == n / 2, onGarage = i == garage && k == 0 && q == 0;
            if (onDoor) {
              BoxOn(m, sd, a + 20, a + 130, 0, 7, s.mn.z, s.mn.z + 215, frame); PaneOn(m, sd, a + 30, a + 120, 7.5, s.mn.z + 4, s.mn.z + 205, MH(0x5A3A24, MAT_WOOD));
              BoxOn(m, sd, a + 105, a + 112, 7.5, 12, s.mn.z + 100, s.mn.z + 106, metal);
              BoxOn(m, sd, a - 25, a + 175, 0, 110, s.mn.z, s.mn.z + 12, MH(0xBDB6A8, MAT_STONE)); BoxOn(m, sd, a - 25, a + 175, 0, 55, s.mn.z + 12, s.mn.z + 24, MH(0xBDB6A8, MAT_STONE));
              BoxOn(m, sd, a - 25, a + 175, 0, 120, s.mn.z + 240, s.mn.z + 252, frame); for (double pa : {-22.0, 168.0}) BoxOn(m, sd, a + pa - 5, a + pa + 5, 105, 115, s.mn.z, s.mn.z + 240, frame);    // porch
            } else if (onGarage) {
              PaneOn(m, sd, a - 40, a + 260, 1.0, s.mn.z, s.mn.z + 235, MH(0xD8D4CA, MAT_METAL)); for (int g = 1; g < 5; g++) BoxOn(m, sd, a - 40, a + 260, 0, 3, s.mn.z + g * 47.0, s.mn.z + g * 47.0 + 3, MH(0xB4B0A5, MAT_METAL));
            } else {
              WindowOn(m, sd, a + 40, z0, 130, 150, frame, r.Chance(0.35), true);
              if (k == 0 && q % 2 == 0) { BoxOn(m, sd, a - 26, a + 36, 0, 5, z0, z0 + 150, shut); BoxOn(m, sd, a + 174, a + 236, 0, 5, z0, z0 + 150, shut); }
            }
          }
        }
      }
      GableRoof(m, s.mn, s.mx, top, s.roofCol, s.wall, r);
      break;
    }
    case Style::Hotel: {
      m.Box(s.mn, s.mx, wall, 15);
      const Col frame = MH(0xD7D2C6, MAT_TRIM), blue = MC(s.trim, MAT_PAINT);
      for (size_t i = 0; i < sides.size(); i++) {
        const Side& sd = sides[i]; const bool longSide = (i == 0 || i == 2);
        if (longSide) {
          const int n = int((sd.len - 200) / 330);
          for (int k = 1; k < s.floors; k++) for (int q = 0; q < n; q++) {
            const double a = 100 + q * 330.0 + (330 - 240) / 2.0, z0 = s.mn.z + k * s.floorH;
            if (q % 2 == 0) BalconyOn(m, sd, a - 30, 600, z0 + 4, 190, frame, frame);
            PaneOn(m, sd, a, a + 240, 1.0, z0 + 14, z0 + 230, r.Chance(0.3) ? MH(0xFFD39A, MAT_GLOW) : MH(0x1B2832, MAT_GLASS));
            BoxOn(m, sd, a - 6, a, 0, 6, z0 + 14, z0 + 232, frame); BoxOn(m, sd, a + 240, a + 246, 0, 6, z0 + 14, z0 + 232, frame);
          }
          BoxOn(m, sd, -6, sd.len + 6, -8, 8, top - 90, top, blue);
          PaneOn(m, sd, 80, sd.len - 80, 2.0, s.mn.z + 40, s.mn.z + s.floorH - 40, MH(0x25404C, MAT_GLASS));
          if (i == 0) { BoxOn(m, sd, sd.len / 2 - 450, sd.len / 2 + 450, 0, 520, 330, 350, blue); for (double a : {-420.0, 420.0}) BoxOn(m, sd, sd.len / 2 + a - 14, sd.len / 2 + a + 14, 490, 518, s.mn.z, 330, frame); }
        } else {
          for (int k = 0; k < s.floors; k++) for (int q = 0; q < 2; q++) WindowOn(m, sd, 90 + q * 180.0, s.mn.z + k * s.floorH + 110, 120, 140, frame, r.Chance(0.3), false);
        }
      }
      FlatRoof(m, s.mn, s.mx, top, s.roofCol, s.wall, r, true);
      break;
    }
    case Style::Venue: {
      // The walls, ceiling and fittings are made by BuildVenue; this is the outside only (a plain box with the roof) for anywhere a venue is seen from far away.
      m.Box(s.mn, s.mx, wall, 63);
      break;
    }
  }
  return m;
}

// ---- the places you can walk into ----
struct VenueBuild {
  Mesh mesh;                                                // everything, in world coordinates: shell, fittings, signs
  std::vector<std::pair<V3, V3>> solids;                    // boxes (min, max) you cannot walk through: walls, counters, shelves
  std::vector<V3> lights;                                   // where the real lights go (the ceiling)
  std::vector<VenueSpot> spots;                             // where the staff and guards stand (world position and heading)
  V3 doorPos, doorDir;                                      // the middle of the doorway on the pavement side, and the way out
  V3 tillPos;                                               // where the money is
};
inline Mat SurfMat(Surf s) {
  switch (s) { case Surf::Metal: return MAT_METAL; case Surf::Glass: return MAT_GLASS; case Surf::Glow: return MAT_GLOW; case Surf::Wood: return MAT_WOOD; case Surf::Stone: return MAT_STONE; case Surf::Fabric: return MAT_FABRIC; default: return MAT_WALL; }
}
inline VenueBuild BuildVenue(const BuildingSpec& s) {
  using namespace detail;
  VenueBuild vb; const bool alongX = s.doorSide < 2; const double sx = s.mx.x - s.mn.x, sy = s.mx.y - s.mn.y, depth = alongX ? sx : sy, width = alongX ? sy : sx, h = s.mx.z - s.mn.z;
  const VenueLayout L = MakeVenue(s.venue, depth, width, h);
  const double yaw = s.doorSide == 0 ? 0 : s.doorSide == 1 ? kPi : s.doorSide == 2 ? kPi / 2 : -kPi / 2;
  const V3 ctr{(s.mn.x + s.mx.x) / 2, (s.mn.y + s.mx.y) / 2, kCurbH};
  auto toWorld = [&](V3 p) { V3 q = RotateZ(p, yaw); return V3{ctr.x + q.x, ctr.y + q.y, ctr.z + p.z}; };
  auto solid = [&](V3 a, V3 b) { V3 p = toWorld(a), q = toWorld(b); vb.solids.push_back({{std::min(p.x, q.x), std::min(p.y, q.y), std::min(p.z, q.z)}, {std::max(p.x, q.x), std::max(p.y, q.y), std::max(p.z, q.z)}}); };
  const double hw = L.w / 2, hd = L.d / 2, wt = 25, dh = L.doorHalf, hh = L.h, doorTop = 250;
  const bool shopfront = s.venue == VenueKind::Shop || s.venue == VenueKind::Petrol || s.venue == VenueKind::Jeweller;
  const Col outside = MC(s.wall, MAT_WALL), inside = MH(s.venue == VenueKind::Jeweller ? 0x2A2830 : s.venue == VenueKind::Bank || s.venue == VenueKind::Museum ? 0xE8E0D0 : 0xEFEFEA, MAT_WALL), ceil = MH(0xF4F1EA, MAT_WALL), signCol = MC(s.trim, MAT_PAINT);
  Mesh loc;
  // the walls (outside colour; the inside is laid over them below)
  loc.Box({-hw, -hd, 0}, {-hw + wt, hd, hh}, outside, 63); solid({-hw, -hd, 0}, {-hw + wt, hd, hh});
  loc.Box({-hw + wt, -hd, 0}, {hw - wt, -hd + wt, hh}, outside, 63); solid({-hw + wt, -hd, 0}, {hw - wt, -hd + wt, hh});
  loc.Box({-hw + wt, hd - wt, 0}, {hw - wt, hd, hh}, outside, 63); solid({-hw + wt, hd - wt, 0}, {hw - wt, hd, hh});
  loc.Box({-hw, -hd, hh - 30}, {hw, hd, hh + 10}, MC(s.roofCol, MAT_ROOF), 63); solid({-hw, -hd, hh - 30}, {hw, hd, hh + 10});
  // the door wall: two pieces either side of the doorway (with a shop window in each if it is a shop), a lintel over it, and a sign
  for (int side = -1; side <= 1; side += 2) {
    const double y0 = side < 0 ? -hd : dh, y1 = side < 0 ? -dh : hd;
    if (shopfront) {
      loc.Box({hw - wt, y0, 0}, {hw, y1, 90}, outside, 63); loc.Box({hw - wt, y0, doorTop}, {hw, y1, hh}, outside, 63);
      loc.Box({hw - wt, y0, 90}, {hw, y0 + 30, doorTop}, outside, 63); loc.Box({hw - wt, y1 - 30, 90}, {hw, y1, doorTop}, outside, 63);
      Facing(loc, {hw - wt / 2, y0 + 30, 90}, {0, y1 - y0 - 60, 0}, {0, 0, doorTop - 90}, {1, 0, 0}, MH(0x9FC0D2, MAT_GLASS));
    } else loc.Box({hw - wt, y0, 0}, {hw, y1, hh}, outside, 63);
    solid({hw - wt, y0, 0}, {hw, y1, hh});
  }
  loc.Box({hw - wt, -dh, doorTop}, {hw, dh, hh}, outside, 63); solid({hw - wt, -dh, doorTop}, {hw, dh, hh});
  loc.Box({hw - 10, -dh - 120, hh - 70}, {hw + 24, dh + 120, hh - 8}, signCol, 63); loc.Box({hw + 24, -dh - 100, hh - 60}, {hw + 26, dh + 100, hh - 18}, MC(Hex(0xFFF1D0), MAT_GLOW), 63);
  loc.Box({hw - 4, -dh - 12, 0}, {hw + 6, -dh, doorTop}, MH(0x25282D, MAT_METAL), 63); loc.Box({hw - 4, dh, 0}, {hw + 6, dh + 12, doorTop}, MH(0x25282D, MAT_METAL), 63);
  // the insides, laid over the wall faces
  Facing(loc, {-hw + wt + 0.6, -hd + wt, 0}, {0, 2 * hd - 2 * wt, 0}, {0, 0, hh - 30}, {1, 0, 0}, inside);                                    // back wall, facing +X
  Facing(loc, {-hw + wt, -hd + wt + 0.6, 0}, {2 * hw - 2 * wt, 0, 0}, {0, 0, hh - 30}, {0, 1, 0}, inside);                                     // left wall, facing +Y
  Facing(loc, {-hw + wt, hd - wt - 0.6, 0}, {2 * hw - 2 * wt, 0, 0}, {0, 0, hh - 30}, {0, -1, 0}, inside);                                     // right wall, facing -Y
  for (int side = -1; side <= 1; side += 2) { const double y0 = side < 0 ? -hd + wt : dh, y1 = side < 0 ? -dh : hd - wt; Facing(loc, {hw - wt - 0.6, y0, 0}, {0, y1 - y0, 0}, {0, 0, hh - 30}, {-1, 0, 0}, inside); }
  Facing(loc, {-hw + wt, -hd + wt, hh - 30.6}, {2 * hw - 2 * wt, 0, 0}, {0, 2 * hd - 2 * wt, 0}, {0, 0, -1}, ceil);                          // ceiling, facing down
  Facing(loc, {hw - wt - 0.6, -dh, doorTop}, {0, 2 * dh, 0}, {0, 0, hh - 30 - doorTop}, {-1, 0, 0}, inside);
  // the fittings
  for (const VenueItem& it : L.items) {
    const Col col = MC(it.col, SurfMat(it.surf));
    if (it.round) { V3 c{(it.mn.x + it.mx.x) / 2, (it.mn.y + it.mx.y) / 2, it.mn.z}; loc.Cylinder(c, std::min(it.mx.x - it.mn.x, it.mx.y - it.mn.y) / 2, it.mx.z - it.mn.z, 16, col, true); }
    else loc.Box(it.mn, it.mx, col, 63);
    if (it.solid) solid(it.mn, it.mx);
  }
  if (s.venue == VenueKind::Petrol) {                                                                          // the canopy over the pumps, on four columns, with a lit fascia
    const double cx0 = hw + 600, cx1 = hw + 2800, cy = std::min(hd + 200, 1500.0), z = 520;
    loc.Box({cx0, -cy, z}, {cx1, cy, z + 40}, MH(0xEFEFEA, MAT_PAINT), 63); loc.Box({cx0 - 4, -cy - 4, z + 8}, {cx1 + 4, cy + 4, z + 32}, signCol, 63);
    loc.Box({cx0 - 6, -cy - 6, z + 40}, {cx1 + 6, cy + 6, z + 46}, MH(0xFFF1D0, MAT_GLOW), 16);
    for (double x : {cx0 + 100, cx1 - 100}) for (double y : {-cy + 100, cy - 100}) { loc.Cylinder({x, y, 0}, 22, z, 12, MH(0xE9E6DD, MAT_PAINT), true); solid({x - 22, y - 22, 0}, {x + 22, y + 22, z}); }
    for (double x : {cx0 + 600, cx0 + 1600}) vb.lights.push_back(toWorld({x, 0, z - 20}));
  }
  vb.mesh.Append(loc, ctr, yaw);
  for (const V3& p : L.lights) vb.lights.push_back(toWorld(p));
  for (const VenueSpot& sp : L.spots) { VenueSpot w = sp; w.pos = toWorld(sp.pos); w.yaw = WrapAngle(sp.yaw + yaw); vb.spots.push_back(w); }
  vb.doorPos = toWorld({hw + 80, 0, 0}); vb.doorDir = RotateZ(V3{1, 0, 0}, yaw); vb.tillPos = L.spots.empty() ? vb.doorPos : vb.spots[0].pos;
  return vb;
}

}  // namespace SC
