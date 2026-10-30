#include "vehicles.h"
#include "shapes.h"
#include "carasset.h"

uint32_t vcol(float r, float g, float b) { return packColor(r, g, b); }

namespace {
MeshData g_wheelMesh;                                            // one alloy wheel and its tyre (the front left of the Ferrari model, simplified), outer face towards +x, centred on the axle
using Poly = std::vector<std::array<float, 2>>;
float sample(const Poly& c, float z) {
  if (z <= c.front()[0]) return c.front()[1]; if (z >= c.back()[0]) return c.back()[1];
  for (size_t i = 1; i < c.size(); i++) if (z <= c[i][0]) { float t = (z - c[i - 1][0]) / std::max(1e-4f, c[i][0] - c[i - 1][0]); return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t; }
  return c.back()[1];
}
struct Spec {
  float len, w, wr, fo, ro, clear, noseR, tailR, tlY, hlY, mass = 1400, rad = 0.95f;
  Poly top, topHalf, shoulder; float gz[2], ws[2], rw[2];
};
// The body: a loft of cross-sections from tail to nose. Each section is the lower body (to the shoulder line) and the cabin above it.
CarMesh buildCar(Gfx& g, const Spec& s, bool police, const float lightBarY) {
  const float zr = -s.len / 2, zf = s.len / 2; const int M = 64, NP = 16;
  float wz[2] = { zf - s.fo, zr + s.ro }, archR = s.wr + 0.07f;
  std::vector<std::vector<Vec3>> rings;
  for (int k = 0; k <= M; k++) {
    float z = zr + s.len * k / M; float hw = s.w * (z < zr + 0.6f ? 0.94f + 0.06f * (z - zr) / 0.6f : z > zf - 0.6f ? 0.92f + 0.08f * (zf - z) / 0.6f : 1.0f);
    float yTop = sample(s.top, z), ySh = std::min(sample(s.shoulder, z), yTop - 0.05f), th = std::min(sample(s.topHalf, z), hw * 0.97f);
    float yB = s.clear; for (float w : wz) { float dz = std::fabs(z - w); if (dz < archR) yB = std::max(yB, s.wr + std::sqrt(archR * archR - dz * dz) * 0.92f); } yB = std::min(yB, ySh - 0.12f);
    float e = std::min(clampf((z - zr) / s.tailR, 0, 1), clampf((zf - z) / s.noseR, 0, 1)), sc = std::sqrt(std::max(0.0f, 1.0f - (1 - e) * (1 - e)));
    float hwk = hw * (0.2f + 0.8f * sc), ym = (yB + yTop) * 0.5f, vk = 0.35f + 0.65f * sc;
    float h1 = ySh - yB, tr = std::max(th, hwk * 0.45f);
    const float px[9] = { 0, 0.82f * hwk, hwk, hwk, 0.97f * hwk, std::min(tr + 0.06f, hwk), tr, tr * 0.72f, 0 };
    const float py[9] = { yB, yB, yB + 0.18f * h1, ySh - 0.04f, ySh, ySh + 0.03f + 0.02f * (yTop - ySh), ySh + 0.6f * (yTop - ySh), yTop, yTop };
    std::vector<Vec3> ring; auto P = [&](float x, float y) { ring.push_back(Vec3(x, ym + (y - ym) * vk, z)); };
    for (int i = 0; i < 9; i++) P(px[i], py[i]); for (int i = 7; i >= 1; i--) P(-px[i], py[i]);
    (void)NP; rings.push_back(ring);
  }
  MeshData body; body.loft(rings, vcol(1, 1, 1), true, true);
  const float dark[3] = { 0.04f, 0.045f, 0.05f };
  auto shoulderAt = [&](float z) { return std::min(sample(s.shoulder, z), sample(s.top, z) - 0.05f); };
  MeshData lb = colourTriangles(body, [&](Vec3 c, Vec3 n) {
    float ySh = shoulderAt(c.z);
    float bPillar = (s.gz[0] + s.gz[1]) * 0.5f + 0.15f; bool hasPillar = s.gz[1] - s.gz[0] > 1.8f;
    bool side = std::fabs(n.x) > 0.55f && c.y > ySh + 0.05f && c.z > s.gz[0] && c.z < s.gz[1] && !(hasPillar && std::fabs(c.z - bPillar) < 0.08f);
    bool wind = n.z > 0.2f && n.y > 0.15f && c.y > ySh && c.z > s.ws[0] && c.z < s.ws[1];
    bool rear = n.z < -0.2f && n.y > 0.1f && c.y > ySh && c.z > s.rw[0] && c.z < s.rw[1];
    if (side || wind || rear) return vcol(0.05f, 0.06f, 0.07f);
    if (c.y < s.clear + 0.14f) return vcol(dark[0], dark[1], dark[2]);                         // sills and the underside
    if (police) {                                                                              // the livery: dark blue doors below the glass, with a white band
      if (std::fabs(n.x) > 0.5f && c.z > -1.35f && c.z < 1.25f && c.y < ySh - 0.02f) return c.y > ySh - 0.2f ? vcol(0.95f, 0.95f, 0.95f) : vcol(0.03f, 0.06f, 0.2f);
      if (n.y > 0.5f && c.z > zr + 0.7f && c.z < zr + 1.3f) return vcol(0.03f, 0.06f, 0.2f);   // the boot lid
    }
    return vcol(1, 1, 1);
  });
  MeshData acc;
  MeshData wheelsM;
  for (float wzv : wz) for (int sd = -1; sd <= 1; sd += 2) {
    if (!g_wheelMesh.empty()) {                                                                  // the real wheel, scaled to this vehicle's tyre and set flush with its side (mirrored on the right)
      float sc = s.wr / 0.358f, cx = sd * (s.w - 0.15f * sc - 0.012f); uint32_t base = (uint32_t)wheelsM.v.size();
      for (const MeshVertex& v : g_wheelMesh.v) { MeshVertex o = v; o.px = sd * v.px * sc + cx; o.py = v.py * sc + s.wr; o.pz = v.pz * sc + wzv; o.nx = sd * v.nx; wheelsM.v.push_back(o); }
      for (size_t k = 0; k + 2 < g_wheelMesh.i.size(); k += 3) { if (sd > 0) wheelsM.tri(base + g_wheelMesh.i[k], base + g_wheelMesh.i[k + 1], base + g_wheelMesh.i[k + 2]); else wheelsM.tri(base + g_wheelMesh.i[k], base + g_wheelMesh.i[k + 2], base + g_wheelMesh.i[k + 1]); }
    } else {
      acc.cylinder(Vec3(sd * (s.w - 0.27f), s.wr, wzv), Vec3(sd * (s.w - 0.03f), s.wr, wzv), s.wr, s.wr, 14, vcol(0.035f, 0.035f, 0.04f));
      acc.cylinder(Vec3(sd * (s.w - 0.035f), s.wr, wzv), Vec3(sd * (s.w - 0.012f), s.wr, wzv), s.wr * 0.62f, s.wr * 0.62f, 10, vcol(0.4f, 0.41f, 0.43f));
    }
  }
  acc.box(Vec3(-s.w * 0.8f, s.clear - 0.02f, zr - 0.02f), Vec3(s.w * 0.8f, s.clear + 0.16f, zr + 0.1f), vcol(0.03f, 0.03f, 0.035f));   // rear bumper
  acc.box(Vec3(-s.w * 0.8f, s.clear - 0.02f, zf - 0.1f), Vec3(s.w * 0.8f, s.clear + 0.14f, zf + 0.02f), vcol(0.03f, 0.03f, 0.035f));   // front bumper
  if (s.ws[1] > -5.0f) for (int sd = -1; sd <= 1; sd += 2) {                                                   // wing mirrors on stalks, and the grille between the headlamps
    float zm = s.ws[1] - 0.12f, ym = shoulderAt(zm) + 0.16f;
    acc.box(Vec3(sd * (s.w + 0.02f) - 0.07f, ym - 0.06f, zm - 0.07f), Vec3(sd * (s.w + 0.17f) + 0.07f, ym + 0.06f, zm + 0.07f), vcol(0.04f, 0.04f, 0.045f));
  }
  acc.box(Vec3(-s.w * 0.42f, s.clear + 0.16f, zf - 0.03f), Vec3(s.w * 0.42f, s.clear + 0.34f, zf + 0.02f), vcol(0.025f, 0.025f, 0.03f));
  lb.append(acc);
  CarMesh o; if (!wheelsM.empty()) o.wheels = uploadMesh(g, wheelsM); o.body = uploadMesh(g, lb); o.len = s.len; o.halfW = s.w; o.mass = s.mass; o.rad = s.rad; o.wheelR = s.wr;
  { MeshData m; for (int sd = -1; sd <= 1; sd += 2) m.box(Vec3(sd * s.w * 0.62f - 0.15f, s.hlY - 0.045f, zf - 0.2f), Vec3(sd * s.w * 0.62f + 0.15f, s.hlY + 0.045f, zf - 0.05f), vcol(1.0f, 0.95f, 0.82f)); o.head = uploadMesh(g, m); }
  { MeshData m; for (int sd = -1; sd <= 1; sd += 2) m.box(Vec3(sd * s.w * 0.64f - 0.17f, s.tlY - 0.05f, zr + 0.05f), Vec3(sd * s.w * 0.64f + 0.17f, s.tlY + 0.05f, zr + 0.2f), vcol(1.0f, 0.07f, 0.03f)); o.tail = uploadMesh(g, m); }
  if (police) {                                                                                  // the light bar: a dark base with a red and a blue half (drawn as separate meshes, see CarMesh::bar)
    MeshData m; float y = lightBarY, zc = 0.1f; o.barY = y;
    m.box(Vec3(-0.5f, y, zc - 0.17f), Vec3(0.5f, y + 0.05f, zc + 0.17f), vcol(0.03f, 0.03f, 0.035f));
    o.bar = uploadMesh(g, m);
    MeshData l, r; l.box(Vec3(-0.48f, y + 0.05f, zc - 0.15f), Vec3(-0.03f, y + 0.12f, zc + 0.15f), vcol(1, 1, 1)); r.box(Vec3(0.03f, y + 0.05f, zc - 0.15f), Vec3(0.48f, y + 0.12f, zc + 0.15f), vcol(1, 1, 1));
    o.lampL = uploadMesh(g, l); o.lampR = uploadMesh(g, r);
  }
  return o;
}
}

void VehicleModels::build(Gfx& g) {
  { std::vector<CpuPart> parts; if (loadCarCpu(g.assetDir + "/cars/wheel.scm", parts)) for (CpuPart& p : parts) { uint32_t base = (uint32_t)g_wheelMesh.v.size(); g_wheelMesh.v.insert(g_wheelMesh.v.end(), p.m.v.begin(), p.m.v.end()); for (uint32_t k : p.m.i) g_wheelMesh.i.push_back(base + k); } }
  auto C = [](std::initializer_list<std::array<float, 2>> l) { return Poly(l); };
  Spec saloon = { 4.75f, 0.9f, 0.33f, 0.95f, 1.05f, 0.2f, 0.25f, 0.18f, 0.82f, 0.7f, 1400, 0.95f,
    C({ { -2.375f, 0.95f }, { -2.0f, 1.0f }, { -1.4f, 1.02f }, { -0.9f, 1.42f }, { 0.4f, 1.45f }, { 1.0f, 1.0f }, { 2.0f, 0.88f }, { 2.375f, 0.72f } }),
    C({ { -2.4f, 0.78f }, { -0.9f, 0.62f }, { 0.4f, 0.66f }, { 1.0f, 0.8f }, { 2.4f, 0.78f } }), C({ { -2.375f, 0.9f }, { 0, 0.98f }, { 2.375f, 0.68f } }), { -1.05f, 0.95f }, { 0.45f, 1.02f }, { -1.4f, -0.88f } };
  Spec suv = { 4.8f, 0.97f, 0.38f, 0.95f, 1.0f, 0.3f, 0.25f, 0.12f, 1.05f, 0.9f, 1900, 1.0f,
    C({ { -2.4f, 1.55f }, { -2.2f, 1.72f }, { 0.6f, 1.76f }, { 1.3f, 1.22f }, { 2.1f, 1.1f }, { 2.4f, 0.92f } }),
    C({ { -2.4f, 0.84f }, { 0.6f, 0.78f }, { 1.3f, 0.86f }, { 2.4f, 0.84f } }), C({ { -2.4f, 1.12f }, { 0, 1.15f }, { 1.4f, 1.1f }, { 2.4f, 0.85f } }), { -2.1f, 1.25f }, { 0.6f, 1.3f }, { -2.4f, -2.0f } };
  Spec hatch = { 4.1f, 0.87f, 0.31f, 0.82f, 0.72f, 0.18f, 0.22f, 0.1f, 0.95f, 0.72f, 1200, 0.9f,
    C({ { -2.05f, 1.2f }, { -1.85f, 1.42f }, { 0.3f, 1.48f }, { 0.9f, 1.02f }, { 1.7f, 0.9f }, { 2.05f, 0.74f } }),
    C({ { -2.05f, 0.74f }, { 0.3f, 0.66f }, { 0.9f, 0.8f }, { 2.05f, 0.78f } }), C({ { -2.05f, 0.98f }, { 0, 0.98f }, { 2.05f, 0.7f } }), { -1.75f, 0.85f }, { 0.3f, 0.92f }, { -2.05f, -1.8f } };
  Spec pickup = { 5.2f, 1.0f, 0.4f, 0.95f, 1.15f, 0.32f, 0.2f, 0.06f, 1.0f, 0.95f, 2300, 1.05f,
    C({ { -2.6f, 1.95f }, { -2.4f, 2.1f }, { 1.2f, 2.1f }, { 1.6f, 1.35f }, { 2.3f, 1.2f }, { 2.6f, 1.0f } }),
    C({ { -2.6f, 0.9f }, { 1.2f, 0.86f }, { 1.6f, 0.9f }, { 2.6f, 0.9f } }), C({ { -2.6f, 1.2f }, { 1.3f, 1.2f }, { 2.6f, 0.95f } }), { -0.2f, 1.4f }, { 1.2f, 1.62f }, { -9, -9 } };
  Spec truck = { 8.2f, 1.28f, 0.5f, 1.15f, 1.5f, 0.5f, 0.3f, 0.05f, 1.0f, 1.0f, 7000, 1.35f,
    C({ { -4.1f, 3.5f }, { -3.9f, 3.72f }, { 1.05f, 3.74f }, { 1.3f, 2.95f }, { 3.3f, 2.9f }, { 3.9f, 2.2f }, { 4.1f, 1.8f } }),
    C({ { -4.1f, 1.24f }, { 1.05f, 1.24f }, { 1.3f, 1.1f }, { 4.1f, 0.98f } }), C({ { -4.1f, 3.4f }, { 1.0f, 3.4f }, { 1.4f, 1.55f }, { 3.4f, 1.55f }, { 4.1f, 1.15f } }), { 1.6f, 3.5f }, { 3.2f, 3.95f }, { -9, -9 } };
  Spec bus = { 11.6f, 1.3f, 0.5f, 1.6f, 2.6f, 0.45f, 0.35f, 0.15f, 1.0f, 0.9f, 11000, 1.35f,
    C({ { -5.8f, 3.2f }, { -5.5f, 3.35f }, { 5.3f, 3.35f }, { 5.8f, 3.0f } }), C({ { -5.8f, 1.2f }, { 5.8f, 1.2f } }), C({ { -5.8f, 1.2f }, { 5.8f, 1.2f } }), { -5.3f, 5.3f }, { 5.2f, 5.8f }, { -5.8f, -5.3f } };
  const Spec* all[TK_COUNT] = { &saloon, &suv, &hatch, &pickup, &truck, &bus };
  for (int i = 0; i < TK_COUNT; i++) traffic[i] = buildCar(g, *all[i], false, 0);
  Spec cr = saloon; cr.top = C({ { -2.375f, 0.95f }, { -2.0f, 1.0f }, { -1.4f, 1.02f }, { -0.9f, 1.42f }, { 0.4f, 1.45f }, { 1.0f, 1.0f }, { 2.0f, 0.9f }, { 2.375f, 0.74f } });
  cruiser = buildCar(g, cr, true, 1.45f);
  swat = buildCar(g, suv, true, 1.76f);
  // Real models, when their baked files are there: the saloon and the police cruiser become the concept car (lighter, merged, simplified versions).
  auto useAsset = [&](CarMesh& m, const char* file) -> bool {
    CarAsset a; if (!a.load(g, g.assetDir + "/cars/" + file)) return false;
    releaseMesh(g, m.body); releaseMesh(g, m.head); releaseMesh(g, m.tail); releaseMesh(g, m.wheels);
    m.body = a.body[CR_PAINT]; m.head = a.body[CR_HEAD]; m.tail = a.body[CR_TAIL]; m.len = a.bmax[2] - a.bmin[2]; m.halfW = 1.0f; m.wheelR = a.wheelR[0]; return true;
  };
  useAsset(traffic[TK_SALOON], "carconcept_traffic.scm");
  if (useAsset(cruiser, "carconcept_police.scm")) {                                             // the roof light bar for the new body (roof at 1.15 m)
    releaseMesh(g, cruiser.bar); releaseMesh(g, cruiser.lampL); releaseMesh(g, cruiser.lampR);
    const float y = 1.15f, zc = -0.32f; cruiser.barY = y;
    { MeshData m; m.box(Vec3(-0.45f, y, zc - 0.17f), Vec3(0.45f, y + 0.05f, zc + 0.17f), vcol(0.03f, 0.03f, 0.035f)); cruiser.bar = uploadMesh(g, m); }
    MeshData l, r; l.box(Vec3(-0.43f, y + 0.05f, zc - 0.15f), Vec3(-0.03f, y + 0.12f, zc + 0.15f), vcol(1, 1, 1)); r.box(Vec3(0.03f, y + 0.05f, zc - 0.15f), Vec3(0.43f, y + 0.12f, zc + 0.15f), vcol(1, 1, 1));
    cruiser.lampL = uploadMesh(g, l); cruiser.lampR = uploadMesh(g, r);
  }
}
