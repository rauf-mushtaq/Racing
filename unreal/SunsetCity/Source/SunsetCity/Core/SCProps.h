// Sunset City (Unreal Engine 5): the things on the streets and the beach, as meshes: palms, trees, bushes, street lamps, hydrants, benches, bins, traffic signals, parked cars, umbrellas,
// loungers, towels, a lifeguard tower, a volleyball net, the plaza fountain, petrol pumps, hedges. Each is built at its own origin facing +X, standing on z = 0, then placed by
// BuildProp. Like all of Core/ it needs no engine: Tests/core_tests.cpp checks every one of them (clean meshes, faces outwards, sensible size).
#pragma once
#include "SCCarBody.h"
#include "SCCityPlan.h"
#include "SCMesh.h"

namespace SC {

namespace detail {
inline Col MC(Col c, int mat) { c.a = float(mat); return c; }
inline Col MH(uint32_t rgb, int mat) { return MC(Hex(rgb), mat); }
// A quad whose front is made to face `want`, whichever way round its corners were given.
inline void QuadWant(Mesh& m, const V3& a, const V3& b, const V3& c, const V3& d, const V3& want, const Col& col, double uvm = 100.0) {
  if (Dot(Cross(b - a, c - a), want) >= 0) m.Quad(a, b, c, d, col, uvm); else m.Quad(a, d, c, b, col, uvm);
}
// A flat face from a corner and two edges, turned to face `want`.
inline void Facing(Mesh& m, const V3& o, const V3& u, const V3& v, const V3& want, const Col& col, double uvm = 100.0) {
  if (Dot(Cross(u, v), want) >= 0) m.Face(o, u, v, col, uvm); else m.Face(o, v, u, col, uvm);
}
// Any six-sided solid given by a bottom quad and a top quad (corners in the same order): all faces turned outwards.
inline void Solid(Mesh& m, const V3* bot, const V3* top, const Col& col) {
  V3 c{0, 0, 0}; for (int k = 0; k < 4; k++) c += (bot[k] + top[k]) * (1.0 / 8.0);
  auto face = [&](const V3& a, const V3& b, const V3& cc, const V3& d) { QuadWant(m, a, b, cc, d, (a + b + cc + d) * 0.25 - c, col); };
  face(bot[0], bot[1], bot[2], bot[3]); face(top[0], top[1], top[2], top[3]);
  for (int k = 0; k < 4; k++) face(bot[k], bot[(k + 1) % 4], top[(k + 1) % 4], top[k]);
}
// A board from a to b (its middle line, in the x-z plane), `width` across (y) and `thick` thick.
inline void Board(Mesh& m, const V3& a, const V3& b, double width, double thick, const Col& col) {
  V3 d = Norm(b - a, {1, 0, 0}), nrm{-d.z, 0, d.x}, y{0, width / 2, 0}, t = nrm * (thick / 2);
  V3 bot[4] = {a - t - y, b - t - y, b - t + y, a - t + y}, top[4] = {a + t - y, b + t - y, b + t + y, a + t + y};
  Solid(m, bot, top, col);
}
// A leaf: a curved strip from the crown, rising then drooping; its two edges are joined into quads facing up.
inline void Frond(Mesh& m, const V3& crown, double yaw, double len, double rise, double droop, double halfW, const Col& col) {
  const int N = 6; V3 dir = DirOfYaw(yaw), side{-dir.y, dir.x, 0}; V3 prevL{}, prevR{};
  for (int q = 0; q <= N; q++) {
    double t = double(q) / N; V3 ctr = crown + dir * (len * t) + V3{0, 0, rise * std::sin(kPi * 0.7 * t) - droop * t * t}; double w = halfW * std::sin(kPi * (0.12 + 0.88 * t)) * (1.0 - 0.25 * t);
    V3 l = ctr + side * w, rr = ctr - side * w;
    if (q > 0) QuadWant(m, prevL, prevR, rr, l, {0, 0, 1}, col);
    prevL = l; prevR = rr;
  }
}
}  // namespace detail

// What is solid about a prop (people and cars cannot walk through it): an oriented box.
struct SolidBox { V3 c; V3 size; double yaw = 0; };
inline V3 LampHeadOffset() { return {200, 0, 735}; }                // where a street lamp's light is, in the lamp's own frame

// A car as a prop (parked): the body, the lamps, the wheels, all in one mesh.
inline CarKind ParkedKind(uint32_t seed) { static const CarKind k[3] = {CarKind::Sports, CarKind::Sedan, CarKind::Suv}; return k[seed % 3]; }
inline Mesh BuildParkedCar(CarKind kind, const Col& paint) {
  CarSpec s = MakeCarSpec(kind, paint); Mesh m = BuildCarBody(s);
  for (const WheelSpot& w : WheelSpots(s)) { Mesh wh = BuildWheel(s); if (w.side < 0) wh.MirrorY(); m.Append(wh, w.pos); }
  return m;
}

inline Mesh BuildProp(const PropSpec& p) {
  using namespace detail;
  Mesh l; Rng r(p.seed ? p.seed : 7u);
  const Col bark = MH(0x7C6A55, MAT_BARK), steel = MH(0x4A4F55, MAT_METAL), wood = MH(0x8A5B36, MAT_WOOD);
  switch (p.kind) {
    case PropKind::Palm: {
      const double h = r.R(650, 900), lx = r.R(-70, 70), ly = r.R(-70, 70); const int segs = 7; V3 prev{0, 0, 0}; double rp = 21;
      for (int k = 1; k <= segs; k++) {
        double t = double(k) / segs, rn = 21 - 9 * t; V3 q{lx * t * t, ly * t * t, h * t};
        l.Between(prev, q, rp, rn, 8, bark, k == 1); if (k < segs) l.Between(q - V3{0, 0, 5}, q + V3{0, 0, 5}, rn + 3.5, rn + 3.5, 8, MH(0x62523F, MAT_BARK), false);       // the ring where a frond once grew
        prev = q; rp = rn;
      }
      const int nf = 12;
      for (int f = 0; f < nf; f++) {
        Col c = MH(f % 3 == 0 ? 0x4C8A3A : f % 3 == 1 ? 0x3F7A34 : 0x568F40, MAT_FOLIAGE);
        Frond(l, prev, 2 * kPi * f / nf + r.R(-0.15, 0.15), r.R(320, 430), r.R(50, 110), r.R(120, 220), r.R(32, 44), c);
      }
      for (int k = 0; k < 3; k++) l.Sphere(prev + V3{std::cos(k * 2.1) * 24, std::sin(k * 2.1) * 24, -18}, 13, 3, 5, MH(0x6B4A2B, MAT_BARK));       // coconuts
      break;
    }
    case PropKind::Tree: {
      l.Frustum({0, 0, 0}, 27, 15, 330, 8, bark, false, true);
      for (int k = 0; k < 3; k++) { double a = 2 * kPi * k / 3 + r.R(0, 1); l.Between({0, 0, 280}, {std::cos(a) * 130, std::sin(a) * 130, 420}, 11, 6, 6, bark, false); }
      const Col leaf[3] = {MH(0x3A6B2C, MAT_FOLIAGE), MH(0x4A7D34, MAT_FOLIAGE), MH(0x335F28, MAT_FOLIAGE)};
      l.Sphere({0, 0, 520}, 190, 6, 10, leaf[0], 1.1, 1.1, 0.9);
      for (int k = 0; k < 6; k++) { double a = 2 * kPi * k / 6 + r.R(0, 0.5); l.Sphere({std::cos(a) * 150, std::sin(a) * 150, 470 + r.R(-30, 90)}, r.R(110, 150), 5, 8, leaf[1 + (k & 1)]); }
      break;
    }
    case PropKind::Bush: {
      const Col leaf = MH(0x3D6F2E, MAT_FOLIAGE);
      for (int k = 0; k < 4; k++) { double a = 2 * kPi * k / 4 + r.R(0, 1), rr = r.R(52, 74); l.Sphere({std::cos(a) * 38, std::sin(a) * 38, rr * 0.8 + r.R(0, 6)}, rr, 5, 8, leaf, 1, 1, 0.8); }
      l.Sphere({0, 0, 62}, 60, 5, 8, MH(0x477B35, MAT_FOLIAGE), 1, 1, 0.8);
      if (r.Chance(0.5)) { const uint32_t fl[4] = {0xE04A7A, 0xF2F2F2, 0xF5C332, 0xC76AE0}; Col fc = MH(fl[r.I(4)], MAT_FABRIC); for (int k = 0; k < 9; k++) { double a = r.R(0, 6.28), d = r.R(20, 70); l.Sphere({std::cos(a) * d, std::sin(a) * d, r.R(60, 100)}, 6, 3, 5, fc); } }
      break;
    }
    case PropKind::Hedge: {
      l.Box({-300, -45, 0}, {300, 45, 105}, MH(0x2F5E27, MAT_FOLIAGE), 63); l.Box({-290, -38, 105}, {290, 38, 120}, MH(0x38702E, MAT_FOLIAGE), 63);
      break;
    }
    case PropKind::Lamp: {
      l.Cylinder({0, 0, 0}, 22, 28, 10, steel, true); l.Frustum({0, 0, 28}, 12, 6.5, 700, 10, MH(0x30343A, MAT_METAL), false, true);
      l.Between({0, 0, 700}, {170, 0, 742}, 5, 4, 8, MH(0x30343A, MAT_METAL), true);
      l.Box({150, -20, 724}, {262, 20, 738}, MH(0x25282D, MAT_METAL), 63); l.Box({156, -15, 719}, {256, 15, 724}, MH(0xFFE2B0, MAT_GLOW), 63);
      break;
    }
    case PropKind::Hydrant: {
      const Col red = MH(0xC22A22, MAT_PAINT);
      l.Cylinder({0, 0, 0}, 17, 8, 12, steel, true); l.Cylinder({0, 0, 8}, 12, 55, 12, red, false); l.Sphere({0, 0, 63}, 13, 4, 10, red); l.Cylinder({0, 0, 74}, 4, 6, 8, steel, true);
      l.Between({-20, 0, 38}, {20, 0, 38}, 6, 6, 8, red, true); l.Between({0, 0, 38}, {0, 22, 38}, 7, 7, 8, red, true);
      break;
    }
    case PropKind::Bench: {
      for (int k = 0; k < 4; k++) l.Box({-26 + k * 13.0, -90, 44}, {-17 + k * 13.0, 90, 48}, wood, 63);
      for (int k = 0; k < 3; k++) l.Box({-32, -90, 62 + k * 14.0}, {-28, 90, 71 + k * 14.0}, wood, 63);
      for (double y : {-78.0, 78.0}) { l.Box({-30, y - 3, 0}, {-26, y + 3, 100}, steel, 63); l.Box({-30, y - 3, 40}, {28, y + 3, 44}, steel, 63); l.Box({24, y - 3, 0}, {28, y + 3, 44}, steel, 63); }
      break;
    }
    case PropKind::Bin: {
      l.Cylinder({0, 0, 0}, 27, 88, 14, MH(0x3C5A45, MAT_METAL), false); l.Cylinder({0, 0, 88}, 29, 6, 14, MH(0x2B3D31, MAT_METAL), true); l.Disc({0, 0, 0.5}, 26, 14, steel, false);
      break;
    }
    case PropKind::Signal: {
      const Col pole = MH(0x2E3236, MAT_METAL);
      l.Cylinder({0, 0, 0}, 9, 560, 10, pole, true); l.Between({0, 0, 540}, {260, 0, 540}, 4.5, 4.5, 8, pole, true);
      l.Box({244, -18, 478}, {276, 18, 580}, MH(0x15171A, MAT_METAL), 63);
      l.Box({240, -8, 548}, {244, 8, 568}, MH(0xFF2A1E, MAT_GLOW), 63); l.Box({240, -8, 523}, {244, 8, 543}, MH(0x6B5A12, MAT_GLOW), 63); l.Box({240, -8, 498}, {244, 8, 518}, MH(0x0F4A22, MAT_GLOW), 63);
      break;
    }
    case PropKind::ParkedCar: {
      l = BuildParkedCar(ParkedKind(p.seed), p.col);
      break;
    }
    case PropKind::Umbrella: {
      Col c = p.col; c.a = float(MAT_FABRIC);
      l.Cylinder({0, 0, 0}, 3.2, 232, 8, MH(0xE8E6E0, MAT_METAL), true);
      l.Frustum({0, 0, 196}, 135, 10, 44, 10, c, false, false); l.Sphere({0, 0, 242}, 5, 3, 6, MH(0xE8E6E0, MAT_METAL));
      break;
    }
    case PropKind::Lounger: {
      const Col frame = MH(0xF1EFEA, MAT_PAINT), pad = MH(0xE8EEF2, MAT_FABRIC);
      for (double x : {-80.0, 80.0}) for (double y : {-26.0, 26.0}) l.Box({x - 3, y - 3, 0}, {x + 3, y + 3, 26}, frame, 63);
      l.Box({-90, -30, 26}, {40, 30, 32}, frame, 63); l.Box({-86, -27, 32}, {36, 27, 38}, pad, 63);
      Board(l, {40, 0, 30}, {92, 0, 74}, 54, 5, frame); Board(l, {43, 0, 38}, {89, 0, 77}, 50, 5, pad);
      break;
    }
    case PropKind::Towel: {
      Col c = p.col; c.a = float(MAT_FABRIC); l.Box({-95, -45, 0}, {95, 45, 1.8}, c, 63); Col st = MH(0xF2F2F2, MAT_FABRIC); l.Box({-60, -45, 1.8}, {-40, 45, 2.1}, st, 16);
      break;
    }
    case PropKind::Lifeguard: {
      const Col rd = MH(0xD62F2A, MAT_PAINT), wh = MH(0xF2F0EA, MAT_PAINT);
      for (double x : {-110.0, 110.0}) for (double y : {-110.0, 110.0}) l.Between({x, y, 0}, {x * 0.85, y * 0.85, 230}, 7, 6, 6, wood, true);
      l.Box({-130, -130, 230}, {130, 130, 244}, wood, 63); l.Box({-95, -95, 244}, {95, 95, 420}, wh, 63);
      l.Box({95, -60, 290}, {97, 60, 390}, MH(0x9FB8C8, MAT_GLASS), 63); l.Box({-110, -110, 420}, {110, 110, 440}, rd, 63); l.Box({-80, -2, 360}, {80, 2, 380}, rd, 63);
      for (int k = 0; k < 6; k++) l.Box({130, -30, 20 + k * 36.0}, {136, 30, 28 + k * 36.0}, wood, 63);
      l.Between({133, -30, 0}, {133, -30, 235}, 3, 3, 6, wood, true); l.Between({133, 30, 0}, {133, 30, 235}, 3, 3, 6, wood, true);
      break;
    }
    case PropKind::VolleyNet: {
      for (double y : {-450.0, 450.0}) l.Cylinder({0, y, 0}, 5, 255, 8, steel, true);
      for (int k = 0; k < 5; k++) l.Box({-1, -450, 205 + k * 12.0}, {1, 450, 207 + k * 12.0}, MH(0xE8E8E8, MAT_FABRIC), 63);
      l.Box({-1.5, -450, 262}, {1.5, 450, 266}, MH(0xE8E8E8, MAT_FABRIC), 63);
      for (double x : {-450.0, 450.0}) l.Box({x - 3, -450, 0.3}, {x + 3, 450, 0.8}, MH(0xF2F2F2, MAT_LINE), 63);
      for (double y : {-450.0, 450.0}) l.Box({-450, y - 3, 0.3}, {450, y + 3, 0.8}, MH(0xF2F2F2, MAT_LINE), 63);
      break;
    }
    case PropKind::Fountain: {
      const Col st = MH(0xCFC9BC, MAT_STONE), water = MH(0x3AA6C8, MAT_WATER); const int seg = 28;
      for (int i = 0; i < seg; i++) {
        double a0 = 2 * kPi * i / seg, a1 = 2 * kPi * (i + 1) / seg; V3 d0{std::cos(a0), std::sin(a0), 0}, d1{std::cos(a1), std::sin(a1), 0};
        QuadWant(l, d0 * 470, d1 * 470, d1 * 470 + V3{0, 0, 70}, d0 * 470 + V3{0, 0, 70}, d0 + d1, st);                       // outer wall
        QuadWant(l, d0 * 470 + V3{0, 0, 70}, d1 * 470 + V3{0, 0, 70}, d1 * 430 + V3{0, 0, 70}, d0 * 430 + V3{0, 0, 70}, {0, 0, 1}, st);   // the rim
        QuadWant(l, d0 * 430, d1 * 430, d1 * 430 + V3{0, 0, 70}, d0 * 430 + V3{0, 0, 70}, (d0 + d1) * -1.0, st);                 // inner wall
      }
      l.Disc({0, 0, 52}, 430, seg, water, true); l.Disc({0, 0, 4}, 430, seg, st, true);
      l.Cylinder({0, 0, 0}, 70, 50, 20, st, true); l.Frustum({0, 0, 50}, 45, 30, 120, 16, st, false, true); l.Frustum({0, 0, 170}, 30, 130, 40, 20, st, false, true); l.Disc({0, 0, 208}, 124, 20, water, true);
      l.Frustum({0, 0, 208}, 18, 25, 90, 12, st, false, true); l.Frustum({0, 0, 298}, 55, 6, 30, 12, st, false, true); l.Cylinder({0, 0, 328}, 6, 150, 8, water, false);
      break;
    }
    case PropKind::PetrolPump: {
      const Col body = MH(0xE9E6DD, MAT_PAINT), red = MH(0xD62F2A, MAT_PAINT);
      l.Box({-45, -35, 0}, {45, 35, 12}, MH(0x8C8C88, MAT_STONE), 63); l.Box({-24, -20, 12}, {24, 20, 150}, body, 63); l.Box({-26, -22, 150}, {26, 22, 170}, red, 63);
      l.Box({-3, -15, 100}, {-1, 15, 135}, MH(0x15171A, MAT_GLOW), 63); l.Box({24, -12, 80}, {32, 12, 120}, MH(0x25282D, MAT_METAL), 63);
      l.Between({26, 0, 112}, {32, 14, 60}, 2.5, 2.5, 6, MH(0x15171A, MAT_TYRE), true); l.Box({-26, -22, 150}, {26, 22, 152}, MH(0xFFFFFF, MAT_GLOW), 16);
      break;
    }
    default: break;
  }
  Mesh out; out.Append(l, p.pos, p.yaw, p.scale); return out;
}

// What is solid about a prop. Returns false for things you walk through (bushes, loungers, towels, benches).
inline bool PropSolidBox(const PropSpec& p, SolidBox& out) {
  out.yaw = p.yaw; double s = p.scale;
  auto set = [&](V3 centre, V3 size) { V3 c = RotateZ(centre * s, p.yaw); out.c = {p.pos.x + c.x, p.pos.y + c.y, p.pos.z + centre.z * s}; out.size = size * s; };
  switch (p.kind) {
    case PropKind::Palm: set({0, 0, 150}, {50, 50, 300}); return true;
    case PropKind::Tree: set({0, 0, 160}, {60, 60, 320}); return true;
    case PropKind::Lamp: case PropKind::Signal: set({0, 0, 150}, {26, 26, 300}); return true;
    case PropKind::Hydrant: set({0, 0, 40}, {36, 36, 80}); return true;
    case PropKind::Bin: set({0, 0, 45}, {56, 56, 90}); return true;
    case PropKind::Umbrella: set({0, 0, 120}, {10, 10, 240}); return true;
    case PropKind::PetrolPump: set({0, 0, 85}, {90, 70, 170}); return true;
    case PropKind::Hedge: set({0, 0, 55}, {600, 90, 110}); return true;
    case PropKind::Fountain: set({0, 0, 40}, {940, 940, 80}); return true;
    case PropKind::Lifeguard: set({0, 0, 120}, {260, 260, 240}); return true;
    case PropKind::ParkedCar: { CarSpec c = MakeCarSpec(ParkedKind(p.seed), p.col); set({0, 0, c.Top(0.5) / 2 + 8}, {c.L, c.W, c.Top(0.5) + 16}); return true; }
    default: return false;
  }
}

}  // namespace SC
