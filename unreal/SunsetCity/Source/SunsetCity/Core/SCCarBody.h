// Sunset City (Unreal Engine 5): the cars, built in code. The body is a loft: a cross-section (a rounded shape with a narrower glass cabin on top) is placed at a number of stations
// along the car and the surface is stretched between them, so the nose, the bonnet, the screen, the roof and the tail flow into each other; the glass, the pillars, the paint, the
// sills and the lamps are told apart by the alpha of each quad's colour (see Mat in SCMesh.h) and become separate materials. Cars face +X, stand on z = 0, and are centred on x = 0 and y = 0.
// Real models (the Ferrari scan in assets/cars, imported with the Python script) can stand in for the body; the wheels and the physics are the same.
#pragma once
#include "SCMesh.h"

namespace SC {

enum class CarKind : int { Sports = 0, Sedan, Suv, Cruiser, Taxi, Count };

struct CarSpec {
  CarKind kind = CarKind::Sports;
  double L = 455, W = 192, wheelbase = 265, track = 164, wheelR = 34, wheelW = 25, zBot = 21;     // length, width, wheel centres, tyre, how high the underside is
  // Anchor points along the car (t = 0 at the nose, 1 at the tail): the line of the bonnet, roof and boot, and how wide the car is there.
  std::vector<double> t, top, belt, width;
  double cabinFrom = 0.28, roofFrom = 0.40, roofTo = 0.66, cabinTo = 0.84;                        // the screen starts, the roof starts, the roof ends, the rear window ends
  Col paint{0.75f, 0.1f, 0.1f, 1}, paint2{0.95f, 0.95f, 0.95f, 1};
  bool twoTone = false, lightBar = false;
  double Top(double u) const { return Interp(t, top, u); }
  double Belt(double u) const { return Interp(t, belt, u); }
  double Wid(double u) const { return Interp(t, width, u); }
  static double Interp(const std::vector<double>& xs, const std::vector<double>& ys, double u) {
    if (u <= xs.front()) return ys.front();
    if (u >= xs.back()) return ys.back();
    for (size_t k = 1; k < xs.size(); k++) if (u <= xs[k]) { double f = (u - xs[k - 1]) / (xs[k] - xs[k - 1]); f = f * f * (3 - 2 * f); return ys[k - 1] + (ys[k] - ys[k - 1]) * f; }
    return ys.back();
  }
};

inline CarSpec MakeCarSpec(CarKind kind, const Col& paint) {
  CarSpec s; s.kind = kind; s.paint = paint;
  switch (kind) {
    case CarKind::Sports:                                           // a low mid-engined coupe
      s.L = 455; s.W = 194; s.wheelbase = 265; s.track = 166; s.wheelR = 34; s.zBot = 19;
      s.t = {0, 0.03, 0.10, 0.24, 0.36, 0.46, 0.60, 0.70, 0.82, 0.93, 1.0};
      s.top = {44, 60, 72, 88, 100, 118, 119, 108, 92, 88, 76}; s.belt = {44, 60, 72, 88, 96, 98, 98, 98, 92, 88, 76};
      s.width = {0.45, 0.80, 0.94, 0.99, 1, 1, 1, 1, 0.99, 0.95, 0.72}; s.cabinFrom = 0.30; s.roofFrom = 0.44; s.roofTo = 0.62; s.cabinTo = 0.78; break;
    case CarKind::Suv:
      s.L = 478; s.W = 196; s.wheelbase = 290; s.track = 168; s.wheelR = 39; s.wheelW = 28; s.zBot = 28;
      s.t = {0, 0.03, 0.10, 0.24, 0.30, 0.38, 0.70, 0.86, 0.96, 1.0};
      s.top = {82, 94, 100, 108, 112, 168, 170, 162, 120, 100}; s.belt = {82, 94, 100, 108, 112, 118, 118, 118, 112, 100};
      s.width = {0.7, 0.9, 0.98, 1, 1, 1, 1, 1, 0.97, 0.9}; s.cabinFrom = 0.26; s.roofFrom = 0.38; s.roofTo = 0.80; s.cabinTo = 0.95; break;
    default:                                                       // sedan, cruiser, taxi
      s.L = 497; s.W = 188; s.wheelbase = 295; s.track = 160; s.wheelR = 33; s.wheelW = 23; s.zBot = 22;
      s.t = {0, 0.03, 0.10, 0.28, 0.34, 0.42, 0.58, 0.70, 0.78, 0.92, 1.0};
      s.top = {62, 76, 86, 98, 100, 136, 138, 132, 100, 98, 86}; s.belt = {62, 76, 86, 98, 100, 104, 104, 104, 100, 98, 86};
      s.width = {0.6, 0.85, 0.96, 1, 1, 1, 1, 1, 1, 0.96, 0.8}; s.cabinFrom = 0.32; s.roofFrom = 0.43; s.roofTo = 0.63; s.cabinTo = 0.80;
      if (kind == CarKind::Cruiser) { s.paint = Hex(0x15171B); s.paint2 = Hex(0xF4F4F2); s.twoTone = true; s.lightBar = true; }
      if (kind == CarKind::Taxi) s.paint = Hex(0xF2B01E);
      break;
  }
  return s;
}

struct WheelSpot { V3 pos; bool front = false; double side = 1; };
inline std::vector<WheelSpot> WheelSpots(const CarSpec& s) {
  std::vector<WheelSpot> w; double x = s.wheelbase / 2, y = s.track / 2;
  for (double fx : {1.0, -1.0}) for (double sy : {1.0, -1.0}) w.push_back({{fx * x, sy * y, s.wheelR}, fx > 0, sy});
  return w;
}

// The bodywork alone: the loft with its nose and tail closed.
inline Mesh BuildCarShell(const CarSpec& s) {
  const int ST = 26, K = 14;                                              // stations along the car; points round each cross-section
  std::vector<std::vector<V3>> ring(ST, std::vector<V3>(K)); std::vector<double> tt(ST);
  for (int a = 0; a < ST; a++) {
    double t = double(a) / (ST - 1); tt[a] = t; double x = s.L / 2 - t * s.L, w = s.W / 2 * s.Wid(t), top = s.Top(t), belt = std::min(s.Belt(t), top), bot = s.zBot;
    bool cabin = top > belt + 8;                                          // the greenhouse: glass above the belt line, narrower than the body
    V3 q[8];
    q[0] = {x, 0, bot}; q[1] = {x, 0.80 * w, bot}; q[2] = {x, 0.97 * w, bot + 0.18 * (belt - bot)}; q[3] = {x, w, bot + 0.55 * (belt - bot)}; q[4] = {x, 0.99 * w, belt};
    if (cabin) { q[5] = {x, 0.82 * w, belt + 0.45 * (top - belt)}; q[6] = {x, 0.64 * w, belt + 0.92 * (top - belt)}; q[7] = {x, 0, top}; }
    else { q[5] = {x, 0.72 * w, top + 1.5}; q[6] = {x, 0.40 * w, top + 3.5}; q[7] = {x, 0, top + 4.5}; }
    int k = 0; for (int p = 0; p < 8; p++) ring[a][k++] = q[p];                 // up the +Y side from the bottom middle to the roof middle ...
    for (int p = 6; p >= 1; p--) ring[a][k++] = {q[p].x, -q[p].y, q[p].z};     // ... and down the -Y side
  }
  // The smooth normal of every grid point: the average of the faces round it (oriented away from the car's long axis).
  auto axisZ = [&](double x) { double t = (s.L / 2 - x) / s.L; return (s.zBot + s.Top(Clamp(t, 0, 1))) * 0.5; };
  std::vector<std::vector<V3>> nrm(ST, std::vector<V3>(K, V3{0, 0, 0}));
  auto faceN = [&](const V3& a, const V3& b, const V3& c, const V3& d) {
    V3 n = Cross(c - a, d - b), ctr = (a + b + c + d) * 0.25, out = ctr - V3{ctr.x, 0, axisZ(ctr.x)}; if (Dot(n, out) < 0) n = n * -1.0; return n;
  };
  for (int a = 0; a + 1 < ST; a++) for (int k = 0; k < K; k++) { int k2 = (k + 1) % K; V3 n = faceN(ring[a][k], ring[a][k2], ring[a + 1][k2], ring[a + 1][k]); nrm[a][k] += n; nrm[a][k2] += n; nrm[a + 1][k2] += n; nrm[a + 1][k] += n; }
  Mesh m;
  for (int a = 0; a + 1 < ST; a++) {
    double t = (tt[a] + tt[a + 1]) * 0.5; bool cab = s.Top(t) > std::min(s.Belt(t), s.Top(t)) + 8;
    for (int k = 0; k < K; k++) {
      int k2 = (k + 1) % K; V3 A = ring[a][k], B = ring[a][k2], C = ring[a + 1][k2], D = ring[a + 1][k];
      // Which surface is this? (K = 14: points 0..7 up the +Y side, 8..13 down the -Y side; side k and 13 - k + 1 mirror each other.)
      int kk = k < 7 ? k : 14 - k - 1;                                    // 0..6 for both sides: the edge number counted from the bottom middle
      int mat = MAT_PAINT; Col col = s.paint;
      if (kk <= 1) { mat = MAT_TRIM; col = Hex(0x111214); }
      else if (cab && kk >= 4) {
        bool roofBand = t > s.roofFrom + 0.02 && t < s.roofTo - 0.02, pillar = (t > s.roofFrom - 0.025 && t < s.roofFrom + 0.012) || (t > s.roofTo - 0.012 && t < s.roofTo + 0.03) || (t > s.cabinFrom - 0.01 && t < s.cabinFrom + 0.012) || (t > s.cabinTo - 0.025 && t < s.cabinTo + 0.01);
        if (kk == 6 && roofBand) { mat = MAT_PAINT; col = s.twoTone ? s.paint : s.paint; } else if (!pillar) { mat = MAT_GLASS; col = Hex(0x0B1015); } else { mat = MAT_PAINT; }
      }
      if (mat == MAT_PAINT && s.twoTone) { bool upper = kk >= 5 || (!cab && kk >= 4); col = upper ? s.paint : s.paint2; if (kk >= 2 && kk <= 3 && t > 0.1 && t < 0.92) col = s.paint2; }
      col.a = float(mat);
      V3 n0 = Norm(nrm[a][k]), n1 = Norm(nrm[a][k2]), n2 = Norm(nrm[a + 1][k2]), n3 = Norm(nrm[a + 1][k]);
      V3 gn = Cross(C - A, D - B), ctr = (A + B + C + D) * 0.25, out = ctr - V3{ctr.x, 0, axisZ(ctr.x)}; bool flip = Dot(gn, out) < 0;
      int32_t ia = m.Vert(A, n0, {tt[a] * 4.5, double(k) / K}, col), ib = m.Vert(B, n1, {tt[a] * 4.5, double(k2) / K}, col), ic = m.Vert(C, n2, {tt[a + 1] * 4.5, double(k2) / K}, col), id = m.Vert(D, n3, {tt[a + 1] * 4.5, double(k) / K}, col);
      if (!flip) { m.Tri(ia, ib, ic); m.Tri(ia, ic, id); } else { m.Tri(ia, ic, ib); m.Tri(ia, id, ic); }
    }
  }
  // The nose and tail are closed by the first and last rings (they are small, but make them solid).
  for (int end = 0; end < 2; end++) {
    int a = end ? ST - 1 : 0; V3 c = ring[a][0]; c.z = (s.zBot + s.Top(end ? 1.0 : 0.0)) * 0.5; c.y = 0; V3 outv{end ? -1.0 : 1.0, 0, 0}; Col col = s.paint; col.a = float(MAT_PAINT);
    int32_t ic = m.Vert(c, outv, {0.5, 0.5}, col);
    for (int k = 0; k < K; k++) { int k2 = (k + 1) % K; int32_t ia = m.Vert(ring[a][k], outv, {0.5, 0.5}, col), ib = m.Vert(ring[a][k2], outv, {0.5, 0.5}, col); V3 g = Cross(ring[a][k] - c, ring[a][k2] - c); if (Dot(g, outv) > 0) m.Tri(ic, ia, ib); else m.Tri(ic, ib, ia); }
  }
  return m;
}

// The lamps, the number plates, and a police car's light bar and push bar, added to the bodywork.
inline void AddCarDetails(const CarSpec& s, Mesh& m) {
  auto light = [&](V3 mn, V3 mx, uint32_t rgb) { Mesh b; Col c = Hex(rgb); c.a = float(MAT_LIGHT); b.Box(mn, mx, c); m.Append(b); };
  double fx = s.L / 2, z0 = s.zBot + 0.45 * (s.Belt(0.06) - s.zBot) + 6, hw = s.W / 2 * 0.72;
  for (double sy : {-1.0, 1.0}) { light({fx - 8, sy * hw - 15, z0}, {fx - 1, sy * hw + 15, z0 + 9}, 0xFFF6DD); light({-fx + 1, sy * hw - 17, z0 + 4}, {-fx + 8, sy * hw + 17, z0 + 12}, 0xE01A1A); }
  { Mesh pl; Col c = Hex(0xEDEDEA); c.a = float(MAT_TRIM); pl.Box({fx - 4, -26, s.zBot + 6}, {fx, 26, s.zBot + 19}, c); pl.Box({-fx, -26, s.zBot + 10}, {-fx + 4, 26, s.zBot + 23}, c); m.Append(pl); }
  if (s.lightBar) {                                                         // a police light bar on the roof
    double roofX = s.L / 2 - (s.roofFrom + s.roofTo) / 2 * s.L, rz = s.Top((s.roofFrom + s.roofTo) / 2) + 2; Mesh b; Col base = Hex(0x101114); base.a = float(MAT_TRIM); b.Box({roofX - 14, -62, rz}, {roofX + 14, 62, rz + 6}, base);
    Col red = Hex(0xFF1C1C), blue = Hex(0x1C4CFF); red.a = blue.a = float(MAT_LIGHT); b.Box({roofX - 13, -60, rz + 6}, {roofX + 13, -4, rz + 13}, red); b.Box({roofX - 13, 4, rz + 6}, {roofX + 13, 60, rz + 13}, blue); m.Append(b);
    Mesh ps; Col blk = Hex(0x15171B); blk.a = float(MAT_TRIM);                                          // a push bar on the nose
    ps.Box({fx - 2, -70, s.zBot + 18}, {fx + 14, 70, s.zBot + 26}, blk); ps.Box({fx - 2, -66, s.zBot + 18}, {fx + 14, -58, s.zBot + 52}, blk); ps.Box({fx - 2, 58, s.zBot + 18}, {fx + 14, 66, s.zBot + 52}, blk); m.Append(ps);
  }
}
inline Mesh BuildCarBody(const CarSpec& s) { Mesh m = BuildCarShell(s); AddCarDetails(s, m); return m; }

// A wheel at its own origin: a tyre, a rim and five spokes, axle along Y. (The car turns and spins it.)
inline Mesh BuildWheel(const CarSpec& s) {
  Mesh m; double R = s.wheelR, Wd = s.wheelW; Col tyre = Hex(0x141416), rim = Hex(0xC9CDD2); tyre.a = float(MAT_TYRE); rim.a = float(MAT_CHROME);
  m.Between({0, -Wd / 2, 0}, {0, Wd / 2, 0}, R, R, 28, tyre, true);
  m.Between({0, -Wd * 0.44, 0}, {0, Wd * 0.46, 0}, R * 0.66, R * 0.66, 24, rim, true);
  Col dark = Hex(0x26282B); dark.a = float(MAT_TRIM);
  m.Between({0, Wd * 0.47, 0}, {0, Wd * 0.50, 0}, R * 0.20, R * 0.20, 12, dark, true);
  for (int k = 0; k < 5; k++) { double a = 2 * kPi * k / 5; V3 e{std::cos(a) * R * 0.62, Wd * 0.40, std::sin(a) * R * 0.62}; m.Between({0, Wd * 0.40, 0}, e, 2.3, 1.6, 6, dark, true); }
  return m;
}

}  // namespace SC
