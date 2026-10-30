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
  const int RPC = 4;                                            // blocks per chunk side
  int nc = (2 * N) / RPC; std::vector<std::vector<InstanceData>> bx(nc * nc), pm(nc * nc); std::vector<Box> boxes; std::vector<float> maxY(nc * nc, 0);
  auto addB = [&](int ci, const B& b, bool collide) {
    InstanceData d = { (float)b.cx, 0.0f, (float)b.cz, (float)b.w, 0.0f, tintOf(b.r, b.g, b.b, b.style), (float)(b.h / b.w), (float)(b.d / b.w) };
    bx[ci].push_back(d); maxY[ci] = std::max(maxY[ci], (float)b.h); if (collide) boxes.push_back({ (float)(b.cx - b.w / 2), (float)(b.cz - b.d / 2), (float)(b.cx + b.w / 2), (float)(b.cz + b.d / 2) });
    buildings++;
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
      if (h > 60) {                                              // tall buildings in three tiers
        double hh = h; B base = { cx, cz, w, d, hh * 0.32, (float)style, tr, tg, tb }; addB(ci, base, true);
        B mid = { cx, cz, w * 0.84, d * 0.84, hh * 0.72, (float)style, tr, tg, tb }; addB(ci, mid, false);
        B top = { cx, cz, w * 0.62, d * 0.62, hh, (float)style, tr, tg, tb }; addB(ci, top, false);
      } else { B b1 = { cx, cz, w, d, h, (float)style, tr, tg, tb }; addB(ci, b1, true); }
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
  addBoxes(boxes);
  for (int cj = 0; cj < nc; cj++) for (int cx = 0; cx < nc; cx++) {
    int ci = cj * nc + cx; Chunk ch; ch.x0 = (float)((cx * RPC - N) * SP); ch.z0 = (float)((cj * RPC - N) * SP); ch.x1 = ch.x0 + (float)(RPC * SP); ch.z1 = ch.z0 + (float)(RPC * SP); ch.maxY = maxY[ci] + 12;
    if (!bx[ci].empty()) { ch.boxes = g.makeBuffer(bx[ci].data(), (UINT)(bx[ci].size() * sizeof(InstanceData)), sizeof(InstanceData), (UINT)bx[ci].size()); ch.nBoxes = (UINT)bx[ci].size(); }
    if (!pm[ci].empty()) { ch.palms = g.makeBuffer(pm[ci].data(), (UINT)(pm[ci].size() * sizeof(InstanceData)), sizeof(InstanceData), (UINT)pm[ci].size()); ch.nPalms = (UINT)pm[ci].size(); }
    chunks.push_back(std::move(ch));
  }
  logf("city: %d buildings in %d chunks", buildings, (int)chunks.size());
}

void City::draw(Renderer& r, bool shadow, const Frustum& f, const Vec3& cam) {
  Mat4 I = Mat4::identity(); Material bld; bld.type = 6; Material foliage; foliage.type = 5; foliage.twoSided = true;
  for (auto& c : chunks) {
    if (!f.boxVisible(c.x0, -2, c.z0, c.x1, c.maxY, c.z1)) continue;
    if (c.nBoxes) r.drawMeshMat(cube, I, bld, &c.boxes, c.nBoxes);
    if (c.nPalms && (!shadow || std::fabs(c.x0 + 360 - cam.x) < 700)) r.drawMeshMat(props.mesh[P_PALM], I, foliage, &c.palms, c.nPalms);
  }
}
