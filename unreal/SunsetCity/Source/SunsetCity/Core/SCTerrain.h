// Sunset City (Unreal Engine 5): the ground outside the streets: the sand that slopes under the sea (a grid mesh whose colour goes from dry to wet to the bed of the sea), the low
// hills round the horizon, and the fixed numbers the sea needs. Units: centimetres.
#pragma once
#include "SCCityPlan.h"
#include "SCMesh.h"

namespace SC {

inline Col SandColour(double x) {
  double wet = SmoothStep(kShoreX + 2500, kShoreX - 200, x);          // dry sand becomes wet near the waterline
  double bed = SmoothStep(kShoreX - 300, kShoreX - 5000, x);           // and under the water the bed is darker and greener
  Col dry{0.86f, 0.74f, 0.54f, 1}, wetc{0.58f, 0.47f, 0.34f, 1}, sea{0.36f, 0.42f, 0.38f, 1};
  return Mix(Mix(dry, wetc, float(wet)), sea, float(bed));
}
// The beach as one mesh: from the promenade out under the sea, along the whole west edge. Cells are 4 m by 20 m.
inline Mesh BuildSand(double y0, double y1, double xEast = kSandX + 600, double xWest = -108000) {
  Mesh m; const double dx = 400, dy = 2000;
  int nx = int(std::ceil((xEast - xWest) / dx)), ny = int(std::ceil((y1 - y0) / dy));
  auto vert = [&](double x, double y) { double z = SandHeight(x) + (Noise2(x / 900, y / 900, 3) - 0.5) * 16 * SmoothStep(kSandX, kShoreX, x); return V3{x, y, z}; };
  for (int a = 0; a < nx; a++) for (int b = 0; b < ny; b++) {
    double xa = xEast - a * dx, xb = xEast - (a + 1) * dx, ya = y0 + b * dy, yb = y0 + (b + 1) * dy;
    V3 p00 = vert(xa, ya), p01 = vert(xa, yb), p11 = vert(xb, yb), p10 = vert(xb, ya);
    Col c = SandColour((xa + xb) / 2); c.r *= 0.96f + 0.08f * float(Noise2(xa / 300, ya / 300, 9));
    // two triangles facing up: front towards Cross(b - a, c - a) = +Z, so go from (xa,ya) towards -X ... check: (p10 - p00) x (p11 - p00)
    V3 n = Norm(Cross(p10 - p00, p11 - p00)); if (n.z < 0) { m.Triangle(p00, p11, p10, c, 300); m.Triangle(p00, p01, p11, c, 300); } else { m.Triangle(p00, p10, p11, c, 300); m.Triangle(p00, p11, p01, c, 300); }
  }
  return m;
}
// Low hills in a ring round the horizon (a backdrop; nothing stands on them).
inline Mesh BuildHills(double r0 = 250000, double r1 = 420000, int seg = 120, double gapCentre = kPi, double gapHalf = 0.95) {          // (the gap is the sea: no hills out in the water)
  Mesh m; const double kH = 26000;
  auto height = [&](double a, double r) { double u = (r - r0) / (r1 - r0); return kH * (0.25 + 0.75 * Fbm2(std::cos(a) * 3 + 11, std::sin(a) * 3 + 7, 4, 5)) * std::sin(kPi * Saturate(u)) * (0.4 + 0.6 * Noise2(std::cos(a) * 9, std::sin(a) * 9, 2)); };
  for (int i = 0; i < seg; i++) for (int j = 0; j < 6; j++) {
    double a0 = 2 * kPi * i / seg, a1 = 2 * kPi * (i + 1) / seg, rA = Lerp(r0, r1, j / 6.0), rB = Lerp(r0, r1, (j + 1) / 6.0);
    if (std::fabs(WrapAngle((a0 + a1) / 2 - gapCentre)) < gapHalf) continue;
    auto P = [&](double a, double r) { return V3{std::cos(a) * r, std::sin(a) * r, height(a, r) - 3000}; };
    V3 p00 = P(a0, rA), p01 = P(a1, rA), p11 = P(a1, rB), p10 = P(a0, rB);
    Col c = Mix(Col{0.34f, 0.40f, 0.26f, 1}, Col{0.62f, 0.55f, 0.42f, 1}, float(Saturate((p00.z + 3000) / kH)));
    V3 n = Cross(p01 - p00, p11 - p00); if (n.z > 0) { m.Triangle(p00, p01, p11, c, 5000); m.Triangle(p00, p11, p10, c, 5000); } else { m.Triangle(p00, p11, p01, c, 5000); m.Triangle(p00, p10, p11, c, 5000); }
  }
  return m;
}

}  // namespace SC
