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
  { // A street lamp: a tapered pole, a curved arm reaching over the road (towards +x) and the lamp head hanging at its end.
    MeshData p; uint32_t k = packColor(0.20f, 0.21f, 0.22f); p.cylinder(Vec3(0, 0, 0), Vec3(0, 8.6f, 0), 0.14f, 0.075f, 8, k);
    p.cylinder(Vec3(0, 8.5f, 0), Vec3(1.2f, 9.05f, 0), 0.06f, 0.055f, 6, k); p.cylinder(Vec3(1.2f, 9.05f, 0), Vec3(2.4f, 8.95f, 0), 0.055f, 0.05f, 6, k); p.box(Vec3(2.05f, 8.82f, -0.17f), Vec3(2.95f, 8.95f, 0.17f), packColor(0.12f, 0.12f, 0.13f)); lampPole = uploadMesh(g, p);
    MeshData h; h.box(Vec3(2.1f, 8.79f, -0.13f), Vec3(2.9f, 8.83f, 0.13f), packColor(1, 1, 1)); lampHead = uploadMesh(g, h); }
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
        B top = { cx, cz, w * 0.62, d * 0.62, hh, (float)style, tr, tg, tb }; addB(ci, top, false); roofStuff(ci, top, dc);
      } else { B b1 = { cx, cz, w, d, h, (float)style, tr, tg, tb }; addB(ci, b1, true); roofStuff(ci, b1, dc); }
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
    up(rf[ci], ch.roofs, ch.nRoofs); up(sg[ci], ch.signs, ch.nSigns); up(lp[ci], ch.lamps, ch.nLamps); up(tr[ci], ch.trees, ch.nTrees);
    chunks.push_back(std::move(ch));
  }
  { size_t nl = 0, nt = 0, nr = 0, ns = 0; for (auto& c : chunks) { nl += c.nLamps; nt += c.nTrees; nr += c.nRoofs; ns += c.nSigns; } logf("city: %d buildings in %d chunks, %zu lamps, %zu trees, %zu roof items, %zu signs", buildings, (int)chunks.size(), nl, nt, nr, ns); }
}

void City::draw(Renderer& r, bool shadow, const Frustum& f, const Vec3& cam) {
  Mat4 I = Mat4::identity(); Material bld; bld.type = 6; Material foliage; foliage.type = 5; foliage.twoSided = true;
  Material roof; roof.type = 0; roof.rough = 0.6f; roof.metal = 0.35f; Material neon; neon.type = 4; neon.emissive = 3.2f; Material metal; metal.type = 0; metal.rough = 0.45f; metal.metal = 0.6f; Material lampLight; lampLight.type = 4; lampLight.emissive = 3.0f; lampLight.tint[0] = 1.0f; lampLight.tint[1] = 0.78f; lampLight.tint[2] = 0.5f;
  for (auto& c : chunks) {
    if (!f.boxVisible(c.x0, -2, c.z0, c.x1, c.maxY, c.z1)) continue;
    if (c.nBoxes) r.drawMeshMat(cube, I, bld, &c.boxes, c.nBoxes);
    if (c.nPalms && (!shadow || std::fabs(c.x0 + 360 - cam.x) < 700)) r.drawMeshMat(props.mesh[P_PALM], I, foliage, &c.palms, c.nPalms);
    if (c.nRoofs) r.drawMeshMat(cube, I, roof, &c.roofs, c.nRoofs);
    if (c.nSigns && !shadow) r.drawMeshMat(cube, I, neon, &c.signs, c.nSigns);
    if (c.nLamps) { r.drawMeshMat(lampPole, I, metal, &c.lamps, c.nLamps); if (!shadow) r.drawMeshMat(lampHead, I, lampLight, &c.lamps, c.nLamps); }
    if (c.nTrees && (!shadow || (std::fabs(c.x0 + 360 - cam.x) < 600 && std::fabs(c.z0 + 360 - cam.z) < 600))) r.drawMeshMat(props.mesh[P_TREE], I, foliage, &c.trees, c.nTrees);
  }
}
