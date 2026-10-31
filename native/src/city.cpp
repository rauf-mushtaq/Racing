#include "city.h"

namespace {
const double SP = CITY_SP; const int N = CITY_N;
bool isBlvd(int k) { return (((k % 4) + 4) % 4) == 0; }
double hwOf(int k) { return isBlvd(k) ? 16 : 9; }
double rnd(int i, int j, int s) { return hash3(i, j, s); }
uint32_t tintOf(float r, float g, float b, float style) { auto h = [](float v) { return clampf(v * 0.5f, 0, 1); }; return packColor(h(r), h(g), h(b), style); }
struct B { double cx, cz, w, d, h; float style, r, g, b; };
}

void City::init(Gfx& g) {
  MeshData c; c.box(Vec3(-0.5f, 0.0f, -0.5f), Vec3(0.5f, 1.0f, 0.5f), packColor(1, 1, 1)); cube = uploadMesh(g, c); buildProps(g, props);
  { // A gable roof on a unit footprint (ridge along z, height 1): two slopes and two gable ends.
    MeshData w; const uint32_t wc = packColor(1, 1, 1); auto V = [&](Vec3 p, Vec3 n) { return w.add(p, n, wc, 0, 0); };
    Vec3 a0(-0.5f, 0, -0.5f), a1(0.5f, 0, -0.5f), a2(0.5f, 0, 0.5f), a3(-0.5f, 0, 0.5f), r0(0, 1, -0.5f), r1(0, 1, 0.5f), nl = normalize(Vec3(-1, 0.5f, 0)), nr = normalize(Vec3(1, 0.5f, 0));
    uint32_t i0 = V(a0, nl), i1 = V(a3, nl), i2 = V(r1, nl), i3 = V(r0, nl); w.tri(i0, i1, i2); w.tri(i0, i2, i3);
    uint32_t j0 = V(a2, nr), j1 = V(a1, nr), j2 = V(r0, nr), j3 = V(r1, nr); w.tri(j0, j1, j2); w.tri(j0, j2, j3);
    uint32_t k0 = V(a1, Vec3(0, 0, -1)), k1 = V(a0, Vec3(0, 0, -1)), k2 = V(r0, Vec3(0, 0, -1)); w.tri(k0, k1, k2);
    uint32_t m0 = V(a3, Vec3(0, 0, 1)), m1 = V(a2, Vec3(0, 0, 1)), m2 = V(r1, Vec3(0, 0, 1)); w.tri(m0, m1, m2); wedge = uploadMesh(g, w); }
  { // A street lamp: a tapered pole, a curved arm reaching over the road (towards +x) and the lamp head hanging at its end.
    MeshData p; uint32_t k = packColor(0.20f, 0.21f, 0.22f); p.cylinder(Vec3(0, 0, 0), Vec3(0, 8.6f, 0), 0.14f, 0.075f, 8, k);
    p.cylinder(Vec3(0, 8.5f, 0), Vec3(1.2f, 9.05f, 0), 0.06f, 0.055f, 6, k); p.cylinder(Vec3(1.2f, 9.05f, 0), Vec3(2.4f, 8.95f, 0), 0.055f, 0.05f, 6, k); p.box(Vec3(2.05f, 8.82f, -0.17f), Vec3(2.95f, 8.95f, 0.17f), packColor(0.12f, 0.12f, 0.13f)); lampPole = uploadMesh(g, p);
    MeshData h; h.box(Vec3(2.1f, 8.79f, -0.13f), Vec3(2.9f, 8.83f, 0.13f), packColor(1, 1, 1)); lampHead = uploadMesh(g, h); }
  { // Things that hang on a building. All face +z (out of the wall) with the wall at z = 0, and are turned to the facade they sit on.
    const uint32_t conc = packColor(0.62f, 0.60f, 0.57f), rail = packColor(0.10f, 0.10f, 0.11f), glassP = packColor(0.30f, 0.38f, 0.42f);
    MeshData b;   // a balcony: a slab 2.4 m wide, 1.2 m deep, with a glass balustrade, a top rail and posts; the floor is at y = 0
    b.box(Vec3(-1.2f, -0.16f, 0), Vec3(1.2f, 0.0f, 1.2f), conc); b.box(Vec3(-1.2f, 0.10f, 1.14f), Vec3(1.2f, 0.92f, 1.16f), glassP);
    b.box(Vec3(-1.2f, 0.92f, 1.11f), Vec3(1.2f, 0.97f, 1.19f), rail); b.box(Vec3(-1.2f, 0.92f, 0.0f), Vec3(-1.14f, 0.97f, 1.19f), rail); b.box(Vec3(1.14f, 0.92f, 0.0f), Vec3(1.2f, 0.97f, 1.19f), rail);
    b.box(Vec3(-1.20f, 0.10f, 0.0f), Vec3(-1.18f, 0.92f, 1.14f), glassP); b.box(Vec3(1.18f, 0.10f, 0.0f), Vec3(1.20f, 0.92f, 1.14f), glassP);
    for (int k = 0; k <= 4; k++) { float x = -1.17f + k * 0.585f; b.box(Vec3(x - 0.025f, 0.0f, 1.10f), Vec3(x + 0.025f, 0.93f, 1.19f), rail); }
    balconyM = uploadMesh(g, b);
    MeshData a;   // a window air conditioner: a pale box with a grille, standing on the sill
    a.box(Vec3(-0.30f, 0, 0), Vec3(0.30f, 0.42f, 0.50f), packColor(0.80f, 0.80f, 0.77f)); a.box(Vec3(-0.27f, 0.05f, 0.50f), Vec3(0.27f, 0.37f, 0.52f), packColor(0.50f, 0.51f, 0.52f));
    for (int k = 0; k < 4; k++) a.box(Vec3(-0.25f, 0.08f + k * 0.07f, 0.52f), Vec3(0.25f, 0.095f + k * 0.07f, 0.535f), packColor(0.12f, 0.12f, 0.13f));
    a.box(Vec3(-0.34f, -0.02f, 0.0f), Vec3(0.34f, 0.0f, 0.55f), packColor(0.35f, 0.35f, 0.36f)); acM = uploadMesh(g, a);
    MeshData t;   // a rooftop water tank: a wooden barrel with iron hoops on a steel frame, under a conical lid
    const uint32_t wood = packColor(0.34f, 0.22f, 0.13f), iron = packColor(0.10f, 0.10f, 0.11f);
    for (int sx = -1; sx <= 1; sx += 2) for (int sz = -1; sz <= 1; sz += 2) t.box(Vec3(sx * 1.0f - 0.06f, 0, sz * 1.0f - 0.06f), Vec3(sx * 1.0f + 0.06f, 2.0f, sz * 1.0f + 0.06f), iron);
    t.box(Vec3(-1.05f, 1.2f, -0.03f), Vec3(1.05f, 1.26f, 0.03f), iron); t.box(Vec3(-0.03f, 1.2f, -1.05f), Vec3(0.03f, 1.26f, 1.05f), iron);
    t.cylinder(Vec3(0, 2.0f, 0), Vec3(0, 4.8f, 0), 1.35f, 1.35f, 18, wood); for (float y : { 2.3f, 3.4f, 4.5f }) t.cylinder(Vec3(0, y, 0), Vec3(0, y + 0.07f, 0), 1.385f, 1.385f, 18, iron, false, false);
    t.cylinder(Vec3(0, 4.8f, 0), Vec3(0, 5.75f, 0), 1.48f, 0.06f, 18, packColor(0.22f, 0.15f, 0.10f), true, false); tankM = uploadMesh(g, t);
    for (int mir = 0; mir < 2; mir++) {   // a fire escape landing with its flight of stairs down to the landing below (the flight runs one way, or the other on alternate floors)
      MeshData e; const float sg = mir ? -1.0f : 1.0f;
      e.box(Vec3(-1.1f, -0.05f, 0.0f), Vec3(1.1f, 0.0f, 1.0f), iron); for (float z : { 0.97f }) { e.box(Vec3(-1.1f, 0.90f, z), Vec3(1.1f, 0.94f, z + 0.04f), iron); e.box(Vec3(-1.1f, 0.45f, z), Vec3(1.1f, 0.48f, z + 0.03f), iron); }
      e.box(Vec3(-1.1f, 0.90f, 0.0f), Vec3(-1.06f, 0.94f, 1.0f), iron); e.box(Vec3(1.06f, 0.90f, 0.0f), Vec3(1.1f, 0.94f, 1.0f), iron);
      for (int k = 0; k <= 5; k++) { float x = -1.08f + k * 0.432f; e.box(Vec3(x - 0.02f, 0.0f, 0.96f), Vec3(x + 0.02f, 0.92f, 1.0f), iron); }
      const int ST = 13; const float x0 = sg * 1.05f, run = sg * -2.5f, drop = -3.7f;
      for (int k = 0; k < ST; k++) { float f = (k + 0.5f) / ST, x = x0 + run * f, y = drop * (k + 1.0f) / ST; float xa = x - 0.1f, xb = x + 0.1f; if (xa > xb) std::swap(xa, xb); e.box(Vec3(xa, y - 0.03f, 1.0f), Vec3(xb, y, 1.78f), iron); }
      for (float z : { 1.0f, 1.76f }) e.cylinder(Vec3(x0, 0.0f, z), Vec3(x0 + run, drop, z), 0.035f, 0.035f, 5, iron);
      e.cylinder(Vec3(x0, 0.93f, 1.77f), Vec3(x0 + run, drop + 0.93f, 1.77f), 0.025f, 0.025f, 5, iron);
      (mir ? escBM : escAM) = uploadMesh(g, e);
    }
  }
  const int RPC = 4;                                            // blocks per chunk side
  int nc = (2 * N) / RPC; std::vector<std::vector<InstanceData>> bx(nc * nc), pm(nc * nc), rf(nc * nc), sg(nc * nc), lp(nc * nc), tr(nc * nc); std::vector<Box> boxes; std::vector<float> maxY(nc * nc, 0); std::vector<std::vector<Circle>> cols(nc * nc);
  auto roofStuff = [&](int ci, const B& b, double dc) {   // air-conditioning units, a lift house and an aerial on the roof
    int hs = (int)(b.cx * 13.0 + b.cz * 7.0); auto R = [&](int k) { return hash3(hs, k, 7); };
    if (b.w < 6 || b.d < 6) return; uint32_t gray = packColor(0.20f + 0.12f * (float)R(1), 0.21f + 0.12f * (float)R(1), 0.22f + 0.12f * (float)R(1));
    int n = 1 + (int)(R(2) * 3.0); if (b.h < 12) n = (int)(R(2) * 2.0);
    for (int a = 0; a < n; a++) { double w = 1.8 + 1.4 * R(10 + a), hh = 1.0 + 0.7 * R(20 + a), dd = 1.5 + 0.9 * R(30 + a); rf[ci].push_back({ (float)(b.cx + (R(40 + a) - 0.5) * (b.w - 4)), (float)b.h, (float)(b.cz + (R(50 + a) - 0.5) * (b.d - 4)), (float)w, (float)(R(60 + a) * 1.5), gray, (float)(hh / w), (float)(dd / w) }); }
    if (b.h > 20 && R(3) < 0.7) rf[ci].push_back({ (float)(b.cx + (R(4) - 0.5) * (b.w - 8) * 0.5), (float)b.h, (float)(b.cz + (R(5) - 0.5) * (b.d - 8) * 0.5), 5.0f, 0.0f, packColor(0.28f, 0.28f, 0.30f), 0.6f, 0.8f });
    if (b.h > 90 && R(6) < 0.8) rf[ci].push_back({ (float)b.cx, (float)b.h, (float)b.cz, 0.5f, 0.0f, packColor(0.45f, 0.1f, 0.1f), (float)((14 + 30 * R(7)) / 0.5), 1.0f });
    (void)dc;
  };
  auto addB = [&](int ci, const B& b, bool collide) {
    InstanceData d = { (float)b.cx, 0.0f, (float)b.cz, (float)b.w, 0.0f, tintOf(b.r, b.g, b.b, b.style), (float)(b.h / b.w), (float)(b.d / b.w) };
    bx[ci].push_back(d); maxY[ci] = std::max(maxY[ci], (float)b.h); if (collide) boxes.push_back({ (float)(b.cx - b.w / 2), (float)(b.cz - b.d / 2), (float)(b.cx + b.w / 2), (float)(b.cz + b.d / 2) });
    buildings++;
  };
  std::vector<std::vector<InstanceData>> ld(nc * nc), pt(nc * nc), bl(nc * nc), ac(nc * nc), ea(nc * nc), eb(nc * nc), tk(nc * nc);   // ledges, cornices, parapets, canopies (boxes); pitched roofs; balconies, air conditioners, fire escapes (two ways), water tanks
  auto slab = [&](int ci, double cx, double y0, double cz, double w, double hgt, double d, float r, float g, float b) { ld[ci].push_back({ (float)cx, (float)y0, (float)cz, (float)w, 0.0f, tintOf(r, g, b, 0.0f), (float)(hgt / w), (float)(d / w) }); };
  // The architecture that is real geometry rather than paint: a cornice under every roof edge, a parapet round the top, belt courses on the
  // brick and stone mid-rise, a cornice over the shopfronts, a canopy over the lobby of a tower.
  auto trim = [&](int ci, const B& b, bool topTier, bool groundTier, int hs) {
    float lr = b.r * 1.1f, lg = b.g * 1.1f, lb = b.b * 1.1f;
    slab(ci, b.cx, b.h - 0.6, b.cz, b.w + 0.7, 0.6, b.d + 0.7, lr, lg, lb);                                         // the cornice
    if (topTier) { const double t = 0.3, ph = 1.05, ox = b.w / 2 + 0.35 - t / 2, oz = b.d / 2 + 0.35 - t / 2;       // the parapet
      slab(ci, b.cx, b.h, b.cz - oz, b.w + 0.7, ph, t, lr, lg, lb); slab(ci, b.cx, b.h, b.cz + oz, b.w + 0.7, ph, t, lr, lg, lb);
      slab(ci, b.cx - ox, b.h, b.cz, t, ph, b.d + 0.7 - 2 * t, lr, lg, lb); slab(ci, b.cx + ox, b.h, b.cz, t, ph, b.d + 0.7 - 2 * t, lr, lg, lb); }
    if (b.style >= 0.34f && b.style < 0.67f && b.h > 13) for (double y = 10.8; y < b.h - 4.0; y += 10.8) slab(ci, b.cx, y - 0.15, b.cz, b.w + 0.34, 0.3, b.d + 0.34, lr, lg, lb);   // belt courses
    if (groundTier) { if (b.style >= 0.34f) slab(ci, b.cx, 4.7, b.cz, b.w + 0.8, 0.3, b.d + 0.8, lr * 0.95f, lg * 0.95f, lb * 0.95f); else slab(ci, b.cx, 4.5, b.cz, b.w + 2.2, 0.35, b.d + 2.2, 0.28f, 0.28f, 0.3f); }
    (void)hs;
  };
  // Things hung on the street face of a building: balconies, window air conditioners, a fire escape, a drainpipe, a water tank on the roof. The window
  // bays are found from the same offset the facade shader uses, so every balcony sits in front of a window.
  auto facadeDetail = [&](int ci, const B& b, int face, int hs) {
    if (b.style < 0.34f || b.h < 8) return;
    const float cellx = b.style < 0.67f ? 3.0f : 3.4f, celly = b.style < 0.67f ? 3.7f : 3.2f, ox = (float)b.cx * 0.37f + (float)b.cz * 0.91f;
    const bool xFace = face < 2; const double L = xFace ? b.d : b.w, c0 = xFace ? b.cz : b.cx;
    const double wpos = face == 0 ? b.cx - b.w / 2 : face == 1 ? b.cx + b.w / 2 : face == 2 ? b.cz - b.d / 2 : b.cz + b.d / 2;
    const float yaw = face == 0 ? (float)(-PI / 2) : face == 1 ? (float)(PI / 2) : face == 2 ? (float)PI : 0.0f;
    auto R = [&](int a, int c) { return hash3(hs, a * 131 + c, 41); };
    const double half = L / 2 - 1.7; int kLo = (int)std::ceil((-half + ox) / cellx - 0.5), kHi = (int)std::floor((half + ox) / cellx - 0.5); const int M = (int)std::floor((b.h - 2.4) / celly);
    auto put = [&](std::vector<std::vector<InstanceData>>& v, double s, double y, float off, float tintv, float scale) {
      double x = xFace ? wpos + (face == 0 ? -off : off) : s, z = xFace ? s : wpos + (face == 2 ? -off : off); v[ci].push_back({ (float)x, (float)y, (float)z, scale, yaw, packColor(tintv, tintv, tintv), 0.0f, 0.0f }); };
    double mode = R(0, 0); const bool wide = b.style < 0.67f, escape = wide && b.h >= 14 && mode >= 0.62 && mode < 0.88, balconies = mode < 0.62 && M >= 2;
    int escK = kLo + (int)(R(1, 1) * std::max(1, kHi - kLo));
    for (int k = kLo; k <= kHi; k++) {
      double s = c0 + (k + 0.5) * cellx - ox; bool hasBalc = false;
      for (int m = 1; m <= M; m++) {
        double fy = m * celly;
        if (escape) { if (k == escK && m >= 1 && m <= M - 1) put((m & 1) ? ea : eb, s, fy + 0.8, 0.0f, 0.5f, 1.0f); }
        else if (balconies && m >= 2 && R(k + 50, m) < 0.42 && !(M > 7 && m > 7)) { put(bl, s, fy, 0.0f, 0.5f + 0.06f * (float)R(k, m), 1.0f); hasBalc = true; }
        if (!escape && !(hasBalc && m >= 2) && R(k + 200, m) < 0.07) put(ac, s + (R(k, m + 9) - 0.5) * 0.7, fy + 0.8, 0.02f, 0.5f, 1.0f);
      }
    }
    if (wide && R(3, 3) < 0.8) slab(ci, xFace ? wpos + (face == 0 ? -0.07 : 0.07) : c0 + L / 2 - 0.9, 0.0, xFace ? c0 + L / 2 - 0.9 : wpos + (face == 2 ? -0.07 : 0.07), 0.14, b.h - 0.6, 0.14, 0.16f, 0.17f, 0.17f);   // a drainpipe
    if (wide && b.h < 60 && b.w > 8 && R(7, 7) < 0.55) tk[ci].push_back({ (float)(b.cx + (R(8, 1) - 0.5) * (b.w - 6)), (float)b.h, (float)(b.cz + (R(8, 2) - 0.5) * (b.d - 6)), 0.8f + 0.45f * (float)R(8, 3), (float)(R(8, 4) * PI), packColor(0.5f, 0.5f, 0.5f), 0.0f, 0.0f });
  };
  for (int j = -N; j < N; j++) for (int i = -N; i < N; i++) {
    int ci = ((j + N) / RPC) * nc + (i + N) / RPC;
    double x0 = i * SP + hwOf(i) + 7, x1 = (i + 1) * SP - hwOf(i + 1) - 7, z0 = j * SP + hwOf(j) + 7, z1 = (j + 1) * SP - hwOf(j + 1) - 7;
    double dc = std::max(std::fabs(i + 0.5), std::fabs(j + 0.5));
    if (dc > 1.6 && rnd(i, j, 99) < 0.065) continue;           // parks
    int lots = dc < 2.2 ? 2 : dc < 5 ? 2 : dc < 9 ? 3 : 5; double lw = (x1 - x0) / lots, ld = (z1 - z0) / lots;
    for (int b = 0; b < lots; b++) for (int a = 0; a < lots; a++) {
      int s = (i * 31 + j * 17 + a * 7 + b * 3) & 0xffff; if (rnd(a, b, s) < (dc < 5 ? 0.06 : 0.22)) continue;
      double fx = 0.62 + 0.3 * rnd(a, b, s + 1), fz = 0.62 + 0.3 * rnd(a, b, s + 2), w = lw * fx, d = ld * fz;
      double cx = x0 + lw * (a + 0.5) + (rnd(a, b, s + 3) - 0.5) * (lw - w) * 0.8, cz = z0 + ld * (b + 0.5) + (rnd(a, b, s + 4) - 0.5) * (ld - d) * 0.8;
      double h, style; float tr, tg, tb;
      if (dc < 2.2) { h = 70 + 190 * rnd(a, b, s + 5) * (1.15 - dc / 3.0); style = rnd(a, b, s + 6) < 0.8 ? 0.1 : 0.5; }
      else if (dc < 5) { h = 22 + 55 * rnd(a, b, s + 5) * (1.3 - dc / 6.0); style = rnd(a, b, s + 6) < 0.45 ? 0.15 : 0.5; }
      else if (dc < 9) { h = 9 + 14 * rnd(a, b, s + 5); style = rnd(a, b, s + 6) < 0.15 ? 0.2 : 0.55 + 0.4 * rnd(a, b, s + 7); }
      else { w = std::min(w, 17.0); d = std::min(d, 13.0); h = 5.0 + 3.0 * rnd(a, b, s + 5); style = 0.8; }
      double cr = rnd(a, b, s + 8); const float pal[6][3] = { {0.62f, 0.6f, 0.56f}, {0.78f, 0.7f, 0.6f}, {0.5f, 0.52f, 0.56f}, {0.72f, 0.5f, 0.38f}, {0.82f, 0.8f, 0.74f}, {0.55f, 0.45f, 0.38f} };
      int pi = (int)(cr * 5.99); tr = pal[pi][0]; tg = pal[pi][1]; tb = pal[pi][2];
      if (style < 0.34) { tr = 0.7f; tg = 0.8f; tb = 0.9f; }
      if (h > 60) {                                              // tall buildings: a podium, a shaft and a stepped crown, set off-centre so the massing is not a wedding cake
        double hh = h, f1 = 0.76 + 0.14 * rnd(a, b, s + 20), f2 = 0.46 + 0.2 * rnd(a, b, s + 21), h1 = 0.22 + 0.16 * rnd(a, b, s + 22), h2 = 0.60 + 0.18 * rnd(a, b, s + 23);
        double m1x = cx + (rnd(a, b, s + 24) - 0.5) * (1 - f1) * w * 0.9, m1z = cz + (rnd(a, b, s + 25) - 0.5) * (1 - f1) * d * 0.9;
        double m2x = m1x + (rnd(a, b, s + 26) - 0.5) * (f1 - f2) * w * 0.9, m2z = m1z + (rnd(a, b, s + 27) - 0.5) * (f1 - f2) * d * 0.9;
        B base = { cx, cz, w, d, hh * h1, (float)style, tr, tg, tb }; addB(ci, base, true); trim(ci, base, false, true, s);
        B mid = { m1x, m1z, w * f1, d * f1, hh * h2, (float)style, tr * 0.97f, tg * 0.97f, tb * 0.99f }; addB(ci, mid, false); trim(ci, mid, false, false, s);
        B top = { m2x, m2z, w * f2, d * f2, hh, (float)style, tr * 0.94f, tg * 0.95f, tb * 0.98f }; addB(ci, top, false); trim(ci, top, false, false, s);
        B crown = { m2x, m2z, w * f2 * 0.72, d * f2 * 0.72, hh * (1.0 + 0.04 + 0.05 * rnd(a, b, s + 28)), (float)style, tr * 0.9f, tg * 0.92f, tb * 0.97f }; addB(ci, crown, false); trim(ci, crown, true, false, s); roofStuff(ci, crown, dc);
      } else {
        B b1 = { cx, cz, w, d, h, (float)style, tr, tg, tb }; addB(ci, b1, true);
        if (style >= 0.75) {                                     // a house: a pitched tile roof and a chimney
          bool alongZ = d >= w; const float roofs[4][3] = { {0.46f, 0.20f, 0.14f}, {0.20f, 0.21f, 0.23f}, {0.28f, 0.19f, 0.13f}, {0.25f, 0.28f, 0.25f} }; const float* rc = roofs[(int)(rnd(a, b, s + 30) * 3.99)];
          double ow = alongZ ? w + 1.0 : d + 1.0, od = alongZ ? d + 1.0 : w + 1.0, rh = 0.3 * std::min(w, d) + 0.8;
          pt[ci].push_back({ (float)cx, (float)h, (float)cz, (float)ow, alongZ ? 0.0f : (float)(PI / 2), tintOf(rc[0], rc[1], rc[2], 0.0f), (float)(rh / ow), (float)(od / ow) });
          slab(ci, cx + (rnd(a, b, s + 31) - 0.5) * w * 0.5, h, cz + (rnd(a, b, s + 32) - 0.5) * d * 0.4, 0.9, rh + 1.3, 0.9, 0.42f, 0.22f, 0.17f);
          { double dxL = (cx - w / 2) - x0, dxR = x1 - (cx + w / 2), dzL = (cz - d / 2) - z0, dzR = z1 - (cz + d / 2), m = std::min(std::min(dxL, dxR), std::min(dzL, dzR)); int face = m == dxL ? 0 : m == dxR ? 1 : m == dzL ? 2 : 3; facadeDetail(ci, b1, face, s); }
        } else { trim(ci, b1, true, true, s); roofStuff(ci, b1, dc);
          { double dxL = (cx - w / 2) - x0, dxR = x1 - (cx + w / 2), dzL = (cz - d / 2) - z0, dzR = z1 - (cz + d / 2), m = std::min(std::min(dxL, dxR), std::min(dzL, dzR)); int face = m == dxL ? 0 : m == dxR ? 1 : m == dzL ? 2 : 3; if (dc < 9) facadeDetail(ci, b1, face, s); } }
      }
      if (h < 130 && dc < 9 && rnd(a, b, s + 11) < 0.45) {   // a vertical neon blade sign on the facade that faces the street
        double dxL = (cx - w / 2) - x0, dxR = x1 - (cx + w / 2), dzL = (cz - d / 2) - z0, dzR = z1 - (cz + d / 2), m = std::min(std::min(dxL, dxR), std::min(dzL, dzR));
        const float neon[6][3] = { {0.1f, 0.9f, 1.0f}, {1.0f, 0.15f, 0.6f}, {1.0f, 0.5f, 0.1f}, {0.2f, 1.0f, 0.4f}, {1.0f, 0.12f, 0.1f}, {0.7f, 0.3f, 1.0f} }; int ni = (int)(rnd(a, b, s + 12) * 5.99); uint32_t ncol = packColor(neon[ni][0] * 0.5f, neon[ni][1] * 0.5f, neon[ni][2] * 0.5f);
        double al = (rnd(a, b, s + 13) - 0.5) * 0.7; float sy = 4.9f + (float)rnd(a, b, s + 14) * 1.6f;
        if (m == dxL) sg[ci].push_back({ (float)(cx - w / 2 - 0.22), sy, (float)(cz + al * d), 0.4f, 0.0f, ncol, 8.0f, 2.2f }); else if (m == dxR) sg[ci].push_back({ (float)(cx + w / 2 + 0.22), sy, (float)(cz + al * d), 0.4f, 0.0f, ncol, 8.0f, 2.2f });
        else if (m == dzL) sg[ci].push_back({ (float)(cx + al * w), sy, (float)(cz - d / 2 - 0.22), 0.4f, (float)(PI / 2), ncol, 8.0f, 2.2f }); else sg[ci].push_back({ (float)(cx + al * w), sy, (float)(cz + d / 2 + 0.22), 0.4f, (float)(PI / 2), ncol, 8.0f, 2.2f });
      }
    }
  }
  // Palms along the sidewalks of the main boulevards through the middle.
  for (int k : { -4, 0, 4 }) for (double t = -1700; t < 1700; t += 20) for (int sd : { -1, 1 }) {
    double off = sd * (hwOf(k) + 3.0), jit = (rnd(k, (int)t, 5) - 0.5) * 4;
    for (int axis = 0; axis < 2; axis++) {
      double x = axis == 0 ? k * SP + off : t + jit, z = axis == 0 ? t + jit : k * SP + off;
      if (std::fabs(x - std::round(x / SP) * SP) < 18 && std::fabs(z - std::round(z / SP) * SP) < 18) continue;   // not in junctions
      int ci = (int)std::floor((z / SP + N) / RPC) * nc + (int)std::floor((x / SP + N) / RPC); if (ci < 0 || ci >= nc * nc || std::fabs(x) > CITY_EDGE || std::fabs(z) > CITY_EDGE) continue;
      double sc = 0.85 + 0.35 * rnd((int)x, (int)z, 8); pm[ci].push_back({ (float)x, -0.1f, (float)z, (float)sc, (float)(rnd((int)x, (int)z, 9) * 6.28), packColor(0.45f, 0.5f, 0.45f), 0, 0 });
    }
  }
  // Street lamps on both sides of every street, and trees along the side streets; both are solid.
  auto chunkOf = [&](double x, double z) { int cxi = std::max(0, std::min(nc - 1, (int)std::floor((x / SP + N) / RPC))), czi = std::max(0, std::min(nc - 1, (int)std::floor((z / SP + N) / RPC))); return czi * nc + cxi; };
  for (int axis = 0; axis < 2; axis++) for (int k = -N; k <= N; k++) for (int side = -1; side <= 1; side += 2) {
    double hwk = hwOf(k); bool blvd = isBlvd(k);
    for (int pass = 0; pass < 2; pass++) {                                   // pass 0: lamps, pass 1: trees
      double spacing = pass == 0 ? 38.0 : 25.0, phase = pass == 0 ? (side > 0 ? 0.0 : 19.0) : (side > 0 ? 7.0 : 19.5); if (pass == 1 && blvd) continue;
      for (double t = -CITY_EDGE + 25 + phase; t < CITY_EDGE - 25; t += spacing) {
        int j = (int)std::lround(t / SP); if (std::fabs(t - j * SP) < hwOf(j) + (pass == 0 ? 6.0 : 11.0)) continue;
        int h2 = (int)(t * 3.1 + k * 17 + side * 5 + axis * 101); if (pass == 1 && hash3(h2, k, 33) > 0.72) continue;
        double off = side * (hwk + (pass == 0 ? 1.5 : 2.6)), x = axis == 0 ? k * SP + off : t, z = axis == 0 ? t : k * SP + off; int ci = chunkOf(x, z);
        if (pass == 0) { double yaw = axis == 0 ? (side > 0 ? PI : 0.0) : (side > 0 ? PI / 2 : -PI / 2); lp[ci].push_back({ (float)x, 0.0f, (float)z, 1.0f, (float)yaw, packColor(0.5f, 0.5f, 0.5f), 0, 0 }); cols[ci].push_back({ (float)x, (float)z, 0.25f }); }
        else { float v = 0.85f + 0.3f * (float)hash3(h2, 5, 9); tr[ci].push_back({ (float)x, -0.05f, (float)z, 0.9f + 0.35f * (float)hash3(h2, 6, 9), (float)(hash3(h2, 7, 9) * 6.28), packColor(0.5f * v, 0.5f * v, 0.5f * v), 0, 0 }); cols[ci].push_back({ (float)x, (float)z, 0.45f }); }
      }
    }
  }
  for (int ci = 0; ci < nc * nc; ci++) if (!cols[ci].empty()) addColliders(7000000 + ci, cols[ci]);
  addBoxes(boxes);
  for (int cj = 0; cj < nc; cj++) for (int cx = 0; cx < nc; cx++) {
    int ci = cj * nc + cx; Chunk ch; ch.x0 = (float)((cx * RPC - N) * SP); ch.z0 = (float)((cj * RPC - N) * SP); ch.x1 = ch.x0 + (float)(RPC * SP); ch.z1 = ch.z0 + (float)(RPC * SP); ch.maxY = maxY[ci] + 12;
    if (!bx[ci].empty()) { ch.boxes = g.makeBuffer(bx[ci].data(), (UINT)(bx[ci].size() * sizeof(InstanceData)), sizeof(InstanceData), (UINT)bx[ci].size()); ch.nBoxes = (UINT)bx[ci].size(); }
    if (!pm[ci].empty()) { ch.palms = g.makeBuffer(pm[ci].data(), (UINT)(pm[ci].size() * sizeof(InstanceData)), sizeof(InstanceData), (UINT)pm[ci].size()); ch.nPalms = (UINT)pm[ci].size(); }
    auto up = [&](std::vector<InstanceData>& v, Buffer& b, UINT& n) { if (v.empty()) return; b = g.makeBuffer(v.data(), (UINT)(v.size() * sizeof(InstanceData)), sizeof(InstanceData), (UINT)v.size()); n = (UINT)v.size(); };
    up(bl[ci], ch.balc, ch.nBalc); up(ac[ci], ch.acs, ch.nAcs); up(ea[ci], ch.escA, ch.nEscA); up(eb[ci], ch.escB, ch.nEscB); up(tk[ci], ch.tanks, ch.nTanks); up(rf[ci], ch.roofs, ch.nRoofs); up(ld[ci], ch.ledges, ch.nLedges); up(pt[ci], ch.pitched, ch.nPitched); up(sg[ci], ch.signs, ch.nSigns); up(lp[ci], ch.lamps, ch.nLamps); up(tr[ci], ch.trees, ch.nTrees);
    chunks.push_back(std::move(ch));
  }
  { size_t nl = 0, nt = 0, nr = 0, ns = 0, nb = 0, na = 0, ne = 0, nk = 0; for (auto& c : chunks) { nl += c.nLamps; nt += c.nTrees; nr += c.nRoofs; ns += c.nSigns; nb += c.nBalc; na += c.nAcs; ne += c.nEscA + c.nEscB; nk += c.nTanks; } logf("city: %d buildings in %d chunks, %zu lamps, %zu trees, %zu roof items, %zu signs, %zu balconies, %zu air conditioners, %zu fire escape floors, %zu water tanks", buildings, (int)chunks.size(), nl, nt, nr, ns, nb, na, ne, nk); }
}

void City::draw(Renderer& r, bool shadow, const Frustum& f, const Vec3& cam) {
  Mat4 I = Mat4::identity(); Material bld; bld.type = 6; Material foliage; foliage.type = 5; foliage.twoSided = true; Material ledgeM; ledgeM.type = 0; ledgeM.rough = 0.85f; Material ironM; ironM.type = 0; ironM.rough = 0.6f; ironM.metal = 0.25f; ironM.twoSided = true; Material tileM; tileM.type = 0; tileM.rough = 0.9f; tileM.twoSided = true;
  Material roof; roof.type = 0; roof.rough = 0.6f; roof.metal = 0.35f; Material neon; neon.type = 4; neon.emissive = 3.2f; Material metal; metal.type = 0; metal.rough = 0.45f; metal.metal = 0.6f; Material lampLight; lampLight.type = 4; lampLight.emissive = 3.0f; lampLight.tint[0] = 1.0f; lampLight.tint[1] = 0.78f; lampLight.tint[2] = 0.5f;
  for (auto& c : chunks) {
    if (!f.boxVisible(c.x0, -2, c.z0, c.x1, c.maxY, c.z1)) continue;
    if (c.nBoxes) r.drawMeshMat(cube, I, bld, &c.boxes, c.nBoxes);
    if (c.nPalms && (!shadow || std::fabs(c.x0 + 360 - cam.x) < 700)) r.drawMeshMat(props.mesh[P_PALM], I, foliage, &c.palms, c.nPalms);
    if (c.nRoofs) r.drawMeshMat(cube, I, roof, &c.roofs, c.nRoofs);
    if (c.nLedges) r.drawMeshMat(cube, I, ledgeM, &c.ledges, c.nLedges);
    if (c.nPitched) r.drawMeshMat(wedge, I, tileM, &c.pitched, c.nPitched);
    if (c.nBalc) r.drawMeshMat(balconyM, I, ledgeM, &c.balc, c.nBalc);
    if (c.nAcs && !shadow) r.drawMeshMat(acM, I, ledgeM, &c.acs, c.nAcs);
    if (c.nEscA) r.drawMeshMat(escAM, I, ironM, &c.escA, c.nEscA);
    if (c.nEscB) r.drawMeshMat(escBM, I, ironM, &c.escB, c.nEscB);
    if (c.nTanks) r.drawMeshMat(tankM, I, ledgeM, &c.tanks, c.nTanks);
    if (c.nSigns && !shadow) r.drawMeshMat(cube, I, neon, &c.signs, c.nSigns);
    if (c.nLamps) { r.drawMeshMat(lampPole, I, metal, &c.lamps, c.nLamps); if (!shadow) r.drawMeshMat(lampHead, I, lampLight, &c.lamps, c.nLamps); }
    if (c.nTrees && (!shadow || (std::fabs(c.x0 + 360 - cam.x) < 600 && std::fabs(c.z0 + 360 - cam.z) < 600))) { float cdx = c.x0 + 360 - cam.x, cdz = c.z0 + 360 - cam.z; bool nearC = cdx * cdx + cdz * cdz < (shadow ? 260.0f * 260.0f : 420.0f * 420.0f); r.drawMeshMat(nearC ? props.mesh[P_TREE] : props.treeFar, I, foliage, &c.trees, c.nTrees); }
  }
}
