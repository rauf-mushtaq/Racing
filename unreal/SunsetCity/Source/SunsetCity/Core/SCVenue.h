// Sunset City (Unreal Engine 5): the inside of the places you can walk into: a petrol station's shop, a 24-hour shop, a jeweller, a bank and a museum. The room is built at its own
// place in the city (not somewhere else, as in the web version), so walking in through the door is just walking, and Unreal's lighting (Lumen) lights it: the lights here are real lights.
// `local` coordinates: the origin is the middle of the floor, +X goes from the back wall to the door wall, +Y across; w is the depth (door to back wall) and d the width of the door wall.
#pragma once
#include "SCCityPlan.h"
#include "SCMesh.h"

namespace SC {

enum class Surf : int { Matte = 0, Metal, Glass, Glow, Wood, Stone, Fabric };
struct VenueItem { V3 mn, mx; Col col; Surf surf = Surf::Matte; bool solid = true; bool round = false; };   // a box (or, with `round`, a cylinder standing in it)
struct VenueSpot { V3 pos; double yaw = 0; int role = 0; };                                              // role 0 clerk/teller, 1 guard, 2 customer
struct VenueLayout {
  double w = 0, d = 0, h = 0; double doorHalf = 110;                                                      // the door is a gap of 2 * doorHalf in the middle of the door wall
  std::vector<VenueItem> items; std::vector<V3> lights; std::vector<VenueSpot> spots;
};

inline VenueLayout MakeVenue(VenueKind kind, double w, double d, double h) {
  VenueLayout L; L.w = w; L.d = d; L.h = h; Rng r(HashCell(int(kind), 5, 11));
  const double hw = w / 2, hd = d / 2, wall = 25, top = h - 30;
  auto add = [&](V3 mn, V3 mx, Col c, Surf s = Surf::Matte, bool solid = true, bool round = false) { L.items.push_back({mn, mx, c, s, solid, round}); };
  const Col floorCol = kind == VenueKind::Bank || kind == VenueKind::Museum ? Hex(0xC9C2B4) : kind == VenueKind::Jeweller ? Hex(0x23212B) : Hex(0xB9B4A8);
  add({-hw + wall, -hd + wall, 0}, {hw - wall, hd - wall, 4}, floorCol, kind == VenueKind::Bank || kind == VenueKind::Museum ? Surf::Stone : Surf::Matte, false);         // the floor
  // Ceiling lights: a grid of glowing panels, each with a real light under it.
  int nx = std::max(2, int((w - 400) / 520)), ny = std::max(2, int((d - 400) / 520));
  for (int a = 0; a < nx; a++) for (int e = 0; e < ny; e++) {
    V3 p{-hw + 300 + (w - 600) * (nx == 1 ? 0.5 : double(a) / (nx - 1)), -hd + 300 + (d - 600) * (ny == 1 ? 0.5 : double(e) / (ny - 1)), top};
    add({p.x - 60, p.y - 25, top - 6}, {p.x + 60, p.y + 25, top}, kind == VenueKind::Jeweller ? Hex(0xFFE9C8) : Hex(0xFFF6E8), Surf::Glow, false);
    if ((a + e) % 2 == 0) L.lights.push_back({p.x, p.y, top - 20});
  }
  switch (kind) {
    case VenueKind::Petrol: case VenueKind::Shop: {
      add({-hw + 40, -hd + 40, 0}, {-hw + 140, hd - 40, 210}, Hex(0xDDE6EA), Surf::Glass);                                    // the fridges along the back wall
      for (double y = -hd + 120; y < hd - 160; y += 110) add({-hw + 45, y, 20}, {-hw + 130, y + 90, 190}, Hex(r.F() > 0.5 ? 0x4A90D9 : 0xE04A3A), Surf::Matte, false);
      for (double y : {-hd + 520.0, -hd + 1060.0, hd - 1120.0, hd - 580.0}) {                                                    // four aisles of shelves (with a clear way up the middle), the goods on them
        add({-hw + 420, y, 0}, {hw - 900, y + 55, 175}, Hex(0x8C95A0), Surf::Metal);
        for (double x = -hw + 440; x < hw - 940; x += 60) { double hgt = 25 + r.F() * 30; for (int lvl = 0; lvl < 4; lvl++) add({x, y - 6, 18.0 + lvl * 42.0}, {x + 42, y + 61, 18.0 + lvl * 42.0 + hgt}, Hex(uint32_t(r.F() * 0xFFFFFF)), Surf::Matte, false); }
      }
      add({hw - 700, -hd + 90, 0}, {hw - 380, -hd + 190, 110}, Hex(0x3F3F44), Surf::Matte);                                    // the counter by the door, with the till
      add({hw - 640, -hd + 110, 110}, {hw - 540, -hd + 170, 140}, Hex(0x15151A), Surf::Metal, false);
      L.spots.push_back({{hw - 540, -hd + 40, 0}, kPi / 2, 0});
      break;
    }
    case VenueKind::Jeweller: {
      for (double y : {-hd + 500.0, -hd + 1120.0, hd - 1240.0, hd - 620.0}) {                                                    // glass cases (with a clear way up the middle)
        add({-hw + 500, y, 0}, {hw - 1100, y + 120, 95}, Hex(0x3B3947), Surf::Matte);
        add({-hw + 505, y + 5, 95}, {hw - 1105, y + 115, 135}, Hex(0xBFD8E8), Surf::Glass);
        for (double x = -hw + 560; x < hw - 1150; x += 90) add({x, y + 40, 95}, {x + 22, y + 62, 108}, Hex(r.F() > 0.5 ? 0xFF4A6A : 0xBDF1FF), Surf::Glow, false);
      }
      add({-hw + 60, -hd + 60, 0}, {-hw + 340, hd - 60, 210}, Hex(0x1C1B22), Surf::Wood);                                         // the back wall: display shelves
      add({-hw + 70, -hd + 400, 90}, {-hw + 330, hd - 400, 100}, Hex(0xE8D9A8), Surf::Metal, false);
      add({hw - 700, -hd + 90, 0}, {hw - 420, -hd + 190, 110}, Hex(0x2C2B33), Surf::Wood);                                       // the desk
      L.spots.push_back({{hw - 560, -hd + 40, 0}, kPi / 2, 0}); L.spots.push_back({{hw - 400, hd - 160, 0}, kPi, 1});
      break;
    }
    case VenueKind::Bank: {
      for (int k = 0; k < 4; k++) {                                                                                                // the tellers' counter along the right-hand wall, behind glass
        double x = hw - 1400 + k * 330; add({x, hd - 520, 0}, {x + 250, hd - 440, 105}, Hex(0x5A4636), Surf::Wood);
        add({x, hd - 450, 105}, {x + 250, hd - 440, 215}, Hex(0xBFD8E8), Surf::Glass, false); L.spots.push_back({{x + 125, hd - 280, 0}, -kPi / 2, 0});
      }
      for (int k = 0; k < 4; k++) add({-hw + 700 + (k % 2) * 700, -hd + 600 + (k / 2) * 900, 0}, {-hw + 800 + (k % 2) * 700, -hd + 700 + (k / 2) * 900, 260}, Hex(0xE6E0D2), Surf::Stone, true, true);   // pillars
      add({-hw + 40, -150, 0}, {-hw + 140, 150, 240}, Hex(0x707880), Surf::Metal, true, true);                                      // the vault door, round, on the back wall
      add({-hw + 45, -110, 20}, {-hw + 130, 110, 220}, Hex(0xC2C9D0), Surf::Metal, false, true);
      for (int k = 0; k < 6; k++) add({-hw + 320, -hd + 250 + k * 480, 0}, {-hw + 700, -hd + 400 + k * 480, 100}, Hex(0x3A3F46), Surf::Metal);   // safe-deposit boxes
      add({0, -hd + 120, 0}, {400, -hd + 170, 90}, Hex(0x8A1E22), Surf::Fabric, false);                                           // a queue rope
      L.spots.push_back({{hw - 1700, -hd + 400, 0}, kPi, 1}); L.spots.push_back({{-hw + 800, 0, 0}, 0, 1});
      break;
    }
    case VenueKind::Museum: {
      for (int k = 0; k < 6; k++) {                                                                                                // pedestals with statues
        double x = -hw + 700 + (k % 3) * 1050, y = -hd + 700 + (k / 3) * 1500;
        add({x - 70, y - 70, 0}, {x + 70, y + 70, 95}, Hex(0xD9D3C6), Surf::Stone); add({x - 28, y - 28, 95}, {x + 28, y + 28, 200}, Hex(r.F() > 0.5 ? 0xC9A24A : 0x8D9AA6), Surf::Metal, true, true);
      }
      for (int k = 0; k < 5; k++) { double y = -hd + 360 + k * (d - 720) / 4; add({-hw + 30, y - 110, 140}, {-hw + 38, y + 110, 330}, Hex(uint32_t(0x203040 + r.F() * 0x808080)), Surf::Glow, false); }   // paintings on the back wall
      add({-700, -150, 0}, {-300, 150, 120}, Hex(0x2A2A30), Surf::Matte); add({-670, -120, 120}, {-330, 120, 260}, Hex(0xCFE6F2), Surf::Glass, false);                         // the diamond in its glass case
      add({-530, -30, 130}, {-470, 30, 190}, Hex(0xBDF1FF), Surf::Glow, false, true);
      add({hw - 800, -700, 0}, {hw - 500, -500, 45}, Hex(0x5A4636), Surf::Wood);                                                   // a bench
      L.spots.push_back({{hw - 400, -hd + 300, 0}, kPi, 1}); L.spots.push_back({{-hw + 900, hd - 500, 0}, 0, 1});
      break;
    }
    default: break;
  }
  return L;
}

}  // namespace SC
