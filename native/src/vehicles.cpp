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


// --- The heavy vehicles, modelled part by part --------------------------------------------------------------------------------------
// A box with rounded edges (radius rEdge) whose two ends are rounded more (rRear, rFront): a stack of rounded-rectangle sections. Flat sides stay
// flat (the roundings are tight), so panels read as panels and the edges catch the light.
static std::vector<Vec3> rrRing(float cx, float hw, float y0, float y1, float r, int n, float z) {
  r = std::max(0.003f, std::min(r, std::min(hw, (y1 - y0) * 0.5f) - 0.002f)); std::vector<Vec3> ring; const float H = (float)PI / 2;
  auto arc = [&](float ax, float ay, float a0) { for (int k = 0; k <= n; k++) { float a = a0 + H * k / n; ring.push_back(Vec3(cx + ax + r * std::cos(a), ay + r * std::sin(a), z)); } };
  ring.push_back(Vec3(cx, y0, z)); arc(hw - r, y0 + r, -H); arc(hw - r, y1 - r, 0); ring.push_back(Vec3(cx, y1, z)); arc(-(hw - r), y1 - r, H); arc(-(hw - r), y0 + r, 2 * H);
  return ring;
}
static MeshData softBlock(float hw, float y0, float y1, float z0, float z1, float rEdge, float rRear, float rFront, uint32_t col, float cx = 0.0f) {
  std::vector<std::vector<Vec3>> rings; const int KC = 5, N = 3;
  for (int k = 0; k <= KC; k++) { float f = (float)k / KC, ph = f * (float)PI / 2, inset = rRear * (1.0f - std::sin(ph)), z = z0 + rRear * (1.0f - std::cos(ph)); rings.push_back(rrRing(cx, hw - inset, y0 + inset, y1 - inset, std::max(0.003f, rEdge - inset), N, z)); }
  rings.push_back(rrRing(cx, hw, y0, y1, rEdge, N, z1 - rFront));
  for (int k = KC; k >= 0; k--) { float f = (float)k / KC, ph = f * (float)PI / 2, inset = rFront * (1.0f - std::sin(ph)), z = z1 - rFront * (1.0f - std::cos(ph)); rings.push_back(rrRing(cx, hw - inset, y0 + inset, y1 - inset, std::max(0.003f, rEdge - inset), N, z)); }
  MeshData m; m.loft(rings, col, false, false);
  auto cap = [&](const std::vector<Vec3>& ring, float nz, bool flip) {                       // the two ends, wound to face outwards
    Vec3 c; for (const Vec3& p : ring) c = c + p * (1.0f / (float)ring.size()); uint32_t cc = m.add(c, Vec3(0, 0, nz), col); std::vector<uint32_t> id; for (const Vec3& p : ring) id.push_back(m.add(p, Vec3(0, 0, nz), col));
    for (size_t k = 0; k < id.size(); k++) { uint32_t a = id[k], b = id[(k + 1) % id.size()]; if (flip) m.tri(cc, b, a); else m.tri(cc, a, b); } };
  cap(rings.front(), -1.0f, true); cap(rings.back(), 1.0f, false); return m;
}
static const uint32_t GLASS_C = packColor(0.016f, 0.024f, 0.032f), TRIM_C = packColor(0.035f, 0.035f, 0.04f), RUBBER_C = packColor(0.025f, 0.025f, 0.028f), STEEL_C = packColor(0.50f, 0.51f, 0.53f), CHROME_C = packColor(0.72f, 0.73f, 0.76f), PAINT_C = packColor(1, 1, 1);
// A thin slab standing proud of a side: panels of glass, door seams, pillars.
static void slabX(MeshData& m, float x, float t, float y0, float y1, float z0, float z1, uint32_t col) { m.box(Vec3(std::min(x, x + t), y0, z0), Vec3(std::max(x, x + t), y1, z1), col); }
// A truck or bus wheel with its axle along x, outer face towards +x (side = +1) or -x (side = -1): a deep tyre, a steel rim with a dished centre and lug nuts.
static void heavyWheel(MeshData& m, float cx, float cy, float cz, float r, float w, int side, bool dual) {
  auto tyre = [&](float xin) { float xo = xin + side * w; m.cylinder(Vec3(xin, cy, cz), Vec3(xo, cy, cz), r, r, 24, RUBBER_C); m.cylinder(Vec3(xo - side * 0.01f, cy, cz), Vec3(xo + side * 0.012f, cy, cz), r * 0.93f, r * 0.93f, 24, packColor(0.045f, 0.045f, 0.05f), true, true); };
  float xin = cx - side * w; tyre(xin); if (dual) { tyre(xin - side * (w + 0.04f)); m.cylinder(Vec3(xin - side * w * 0.2f, cy, cz), Vec3(xin + side * w * 0.2f, cy, cz), r * 0.58f, r * 0.58f, 16, STEEL_C); }
  float xo = cx + side * 0.0f; m.cylinder(Vec3(xo, cy, cz), Vec3(xo + side * 0.03f, cy, cz), r * 0.62f, r * 0.62f, 24, STEEL_C);       // the rim
  m.cylinder(Vec3(xo + side * 0.03f, cy, cz), Vec3(xo + side * 0.05f, cy, cz), r * 0.30f, r * 0.30f, 16, packColor(0.16f, 0.16f, 0.17f));   // the hub
  for (int k = 0; k < 8; k++) { float a = (float)(2 * PI * k / 8); m.cylinder(Vec3(xo + side * 0.03f, cy + std::sin(a) * r * 0.22f, cz + std::cos(a) * r * 0.22f), Vec3(xo + side * 0.055f, cy + std::sin(a) * r * 0.22f, cz + std::cos(a) * r * 0.22f), 0.022f, 0.022f, 6, CHROME_C); }
}
static CarMesh finishHeavy(Gfx& g, MeshData& body, MeshData& trim, MeshData& head, MeshData& tail, float len, float halfW, float mass, float rad, float wheelR) {
  CarMesh o; o.body = uploadMesh(g, body); o.wheels = uploadMesh(g, trim); o.head = uploadMesh(g, head); o.tail = uploadMesh(g, tail); o.len = len; o.halfW = halfW; o.mass = mass; o.rad = rad; o.wheelR = wheelR; return o;
}
// A city bus: a tall body on a lower skirt with arches, a band of windows between pillars, two doors, a big windscreen with a destination sign, a roof unit.
static CarMesh buildBus(Gfx& g) {
  MeshData body, trim, head, tail; const float L = 5.8f, HW = 1.27f, WR = 0.5f, zF = 4.2f, zR = -3.2f, ARCH = 0.66f;
  body.append(softBlock(HW, 1.18f, 3.25f, -L, L, 0.16f, 0.22f, 0.30f, PAINT_C));
  body.append(softBlock(HW, 0.42f, 1.30f, -L, zR - ARCH, 0.07f, 0.12f, 0.07f, PAINT_C)); body.append(softBlock(HW, 0.42f, 1.30f, zR + ARCH, zF - ARCH, 0.07f, 0.07f, 0.07f, PAINT_C)); body.append(softBlock(HW, 0.42f, 1.30f, zF + ARCH, L, 0.07f, 0.07f, 0.10f, PAINT_C));
  trim.box(Vec3(-1.0f, 0.30f, -L + 0.2f), Vec3(1.0f, 0.46f, L - 0.2f), TRIM_C);                                              // the underside
  for (int sd = -1; sd <= 1; sd += 2) for (float zc : { zF, zR }) { slabX(trim, sd * (HW - 0.62f), sd * 0.04f, 0.42f, 1.24f, zc - ARCH, zc + ARCH, TRIM_C); trim.box(Vec3(sd * (HW - 0.62f) - 0.0f, 1.18f, zc - ARCH), Vec3(sd * (HW - 0.02f), 1.24f, zc + ARCH), TRIM_C); }   // wheel arches: a dark wall behind the tyre and a dark roof over it
  for (int sd = -1; sd <= 1; sd += 2) {
    const float x = sd * (HW + 0.002f), t = sd * 0.012f;
    slabX(body, x, t, 1.50f, 2.66f, -5.45f, 4.55f, GLASS_C);                                                              // the window band
    for (float z = -5.45f; z < 4.6f; z += 1.25f) slabX(body, x, sd * 0.02f, 1.48f, 2.68f, z - 0.035f, z + 0.035f, PAINT_C);   // pillars
    slabX(body, x, sd * 0.02f, 1.48f, 1.55f, -5.45f, 4.55f, PAINT_C); slabX(body, x, sd * 0.02f, 2.62f, 2.69f, -5.45f, 4.55f, PAINT_C);
  }
  for (float zc : { 5.15f, -0.9f }) {                                                                                         // the two doors, on the kerb side (+x): dark glass in frames with a seam down the middle
    float hz = zc == 5.15f ? 0.62f : 0.75f; slabX(body, HW + 0.004f, 0.016f, 0.62f, 2.70f, zc - hz, zc + hz, TRIM_C); slabX(body, HW + 0.01f, 0.012f, 0.72f, 2.60f, zc - hz + 0.06f, zc + hz - 0.06f, GLASS_C);
    slabX(body, HW + 0.012f, 0.012f, 0.62f, 2.70f, zc - 0.012f, zc + 0.012f, TRIM_C); }
  body.box(Vec3(-0.84f, 1.55f, L + 0.001f), Vec3(0.84f, 2.72f, L + 0.014f), GLASS_C);                                       // the windscreen
  body.box(Vec3(-0.012f, 1.55f, L + 0.012f), Vec3(0.012f, 2.72f, L + 0.02f), TRIM_C);
  body.box(Vec3(-0.84f, 2.80f, L + 0.001f), Vec3(0.84f, 3.02f, L + 0.012f), TRIM_C);                                        // the destination blind's housing
  head.box(Vec3(-0.78f, 2.83f, L + 0.012f), Vec3(0.78f, 2.99f, L + 0.02f), packColor(0.95f, 0.5f, 0.06f));
  for (int sd = -1; sd <= 1; sd += 2) { head.box(Vec3(sd * 0.98f - 0.17f, 0.74f, L + 0.012f), Vec3(sd * 0.98f + 0.17f, 0.96f, L + 0.04f), packColor(1.0f, 0.95f, 0.82f));
    tail.box(Vec3(sd * 1.0f - 0.14f, 0.85f, -L - 0.04f), Vec3(sd * 1.0f + 0.14f, 1.2f, -L - 0.008f), packColor(1.0f, 0.07f, 0.03f)); }
  trim.box(Vec3(-1.18f, 0.40f, L - 0.05f), Vec3(1.18f, 0.66f, L + 0.10f), TRIM_C); trim.box(Vec3(-0.30f, 0.68f, L + 0.005f), Vec3(0.30f, 0.82f, L + 0.02f), packColor(0.85f, 0.85f, 0.8f));   // bumper, number plate
  trim.box(Vec3(-1.18f, 0.40f, -L - 0.10f), Vec3(1.18f, 0.66f, -L + 0.05f), TRIM_C);
  body.box(Vec3(-0.84f, 1.60f, -L - 0.014f), Vec3(0.84f, 2.55f, -L - 0.001f), GLASS_C);                                      // the rear window
  trim.box(Vec3(-0.6f, 0.9f, -L - 0.016f), Vec3(0.6f, 1.45f, -L - 0.002f), TRIM_C);                                         // engine louvres
  for (int sd = -1; sd <= 1; sd += 2) { trim.cylinder(Vec3(sd * 1.22f, 2.35f, 5.45f), Vec3(sd * 1.78f, 2.50f, 5.55f), 0.03f, 0.03f, 6, TRIM_C); trim.box(Vec3(sd * 1.78f - 0.07f, 1.95f, 5.4f), Vec3(sd * 1.78f + 0.07f, 2.7f, 5.64f), TRIM_C); }   // wing mirrors
  trim.append(softBlock(0.85f, 3.25f, 3.62f, -4.3f, -1.3f, 0.10f, 0.08f, 0.08f, packColor(0.72f, 0.73f, 0.75f)));          // the roof unit
  for (int k = 0; k < 4; k++) trim.box(Vec3(-0.7f, 3.55f, -4.0f + k * 0.7f), Vec3(0.7f, 3.66f, -3.9f + k * 0.7f), packColor(0.55f, 0.56f, 0.58f));
  for (int sd = -1; sd <= 1; sd += 2) { heavyWheel(trim, sd * (HW - 0.22f), 0.54f, zF, 0.54f, 0.32f, sd, false); heavyWheel(trim, sd * (HW - 0.22f), 0.54f, zR, 0.54f, 0.26f, sd, true); }
  return finishHeavy(g, body, trim, head, tail, 11.6f, 1.3f, 11000, 1.35f, WR);
}
// A box truck: a cab-over cab with its grille, windscreen and door windows; a ribbed white cargo box; a chassis with a fuel tank, exhaust and mud flaps; dual rear wheels.
static CarMesh buildTruck(Gfx& g) {
  MeshData body, trim, head, tail; const float zN = 4.1f, zT = -4.1f, WR = 0.5f, zF = 2.95f, zR = -2.6f;
  body.append(softBlock(1.2f, 1.0f, 3.02f, 1.98f, zN - 0.12f, 0.12f, 0.06f, 0.30f, PAINT_C));                                  // the cab
  body.append(softBlock(1.18f, 0.60f, 1.35f, 2.10f, zN, 0.07f, 0.05f, 0.09f, PAINT_C));                                        // the lower front panel
  body.append(softBlock(1.27f, 1.05f, 3.78f, zT, 1.80f, 0.07f, 0.06f, 0.06f, PAINT_C));                                       // the cargo box
  for (int sd = -1; sd <= 1; sd += 2) {
    for (float z = zT + 0.4f; z < 1.7f; z += 0.62f) slabX(body, sd * 1.27f, sd * 0.016f, 1.15f, 3.68f, z - 0.025f, z + 0.025f, PAINT_C);   // ribs
    slabX(trim, sd * 1.27f, sd * 0.02f, 1.02f, 1.14f, zT + 0.05f, 1.75f, TRIM_C);                                                          // the bottom rail
    slabX(body, sd * 1.2f, sd * 0.012f, 1.84f, 2.72f, 2.40f, 3.55f, GLASS_C); slabX(body, sd * 1.2f, sd * 0.012f, 1.0f, 3.0f, 2.40f - 0.03f, 2.40f, TRIM_C);   // the door window and the door's rear seam
    slabX(trim, sd * 1.2f, sd * 0.03f, 1.82f, 1.88f, 3.28f, 3.45f, packColor(0.7f, 0.7f, 0.72f));                                            // the door handle
    trim.box(Vec3(sd * 1.22f - 0.16f, 0.86f, 2.45f), Vec3(sd * 1.22f + 0.16f, 0.92f, 3.50f), STEEL_C);                                         // the step
    trim.cylinder(Vec3(sd * 1.04f, 0.78f, 0.1f), Vec3(sd * 1.04f, 0.78f, 1.1f), 0.30f, 0.30f, 16, packColor(0.6f, 0.62f, 0.65f));            // the fuel tank
    trim.cylinder(Vec3(sd * 1.5f, 2.22f, 3.55f), Vec3(sd * 1.46f, 2.4f, 3.7f), 0.03f, 0.03f, 6, TRIM_C); trim.box(Vec3(sd * 1.5f - 0.09f, 1.9f, 3.55f), Vec3(sd * 1.5f + 0.09f, 2.75f, 3.78f), TRIM_C);   // mirror
    for (float zc : { zR - 0.55f }) trim.box(Vec3(sd * 1.1f - 0.28f, 0.45f, zc - 0.015f), Vec3(sd * 1.1f + 0.28f, 1.0f, zc + 0.015f), TRIM_C);   // mud flaps
  }
  body.box(Vec3(-0.98f, 1.80f, zN - 0.12f + 0.001f), Vec3(0.98f, 2.78f, zN - 0.12f + 0.014f), GLASS_C);                       // the windscreen
  body.box(Vec3(-0.012f, 1.80f, zN - 0.105f), Vec3(0.012f, 2.78f, zN - 0.095f), TRIM_C);
  trim.box(Vec3(-0.9f, 1.0f, zN - 0.005f), Vec3(0.9f, 1.62f, zN + 0.03f), TRIM_C);                                            // the grille
  for (int k = 0; k < 4; k++) trim.box(Vec3(-0.85f, 1.12f + k * 0.13f, zN + 0.03f), Vec3(0.85f, 1.16f + k * 0.13f, zN + 0.045f), CHROME_C);
  trim.box(Vec3(-1.25f, 0.55f, zN - 0.05f), Vec3(1.25f, 0.80f, zN + 0.14f), TRIM_C); trim.box(Vec3(-0.3f, 0.84f, zN + 0.02f), Vec3(0.3f, 0.97f, zN + 0.035f), packColor(0.85f, 0.85f, 0.8f));
  trim.box(Vec3(-1.2f, 0.50f, zT - 0.12f), Vec3(1.2f, 0.78f, zT + 0.02f), TRIM_C);                                           // the rear bumper
  trim.box(Vec3(-0.012f, 1.2f, zT - 0.004f), Vec3(0.012f, 3.7f, zT - 0.012f), TRIM_C); for (float y : { 1.7f, 2.8f }) for (int sd = -1; sd <= 1; sd += 2) trim.box(Vec3(sd * 0.6f - 0.04f, y, zT - 0.02f), Vec3(sd * 0.6f + 0.04f, y + 0.12f, zT - 0.004f), STEEL_C);
  for (int sd = -1; sd <= 1; sd += 2) { head.box(Vec3(sd * 0.95f - 0.17f, 1.08f, zN + 0.01f), Vec3(sd * 0.95f + 0.17f, 1.3f, zN + 0.045f), packColor(1.0f, 0.95f, 0.82f));
    tail.box(Vec3(sd * 1.05f - 0.12f, 0.95f, zT - 0.05f), Vec3(sd * 1.05f + 0.12f, 1.4f, zT - 0.01f), packColor(1.0f, 0.07f, 0.03f)); }
  for (int sd = -1; sd <= 1; sd += 2) { trim.box(Vec3(sd * 0.5f - 0.09f, 0.52f, -3.95f), Vec3(sd * 0.5f + 0.09f, 0.88f, 3.6f), packColor(0.07f, 0.07f, 0.08f)); }   // the chassis rails
  trim.cylinder(Vec3(-1.3f, 0.9f, 1.88f), Vec3(-1.3f, 3.45f, 1.88f), 0.075f, 0.075f, 10, packColor(0.45f, 0.46f, 0.48f));      // the exhaust stack
  for (int sd = -1; sd <= 1; sd += 2) { heavyWheel(trim, sd * 1.12f, WR, zF, WR, 0.30f, sd, false); heavyWheel(trim, sd * 1.12f, WR, zR, WR, 0.26f, sd, true); }
  return finishHeavy(g, body, trim, head, tail, 8.2f, 1.28f, 7000, 1.35f, WR);
}
// A solid made by extruding a side silhouette (z, y points, going round) across the width: flat panels with crisp edges, and wheel arches that are real openings.
static void extrudeX(MeshData& m, float hw, const std::vector<std::array<float, 2>>& poly, uint32_t col) {
  Vec3 c; for (auto& p : poly) c = c + Vec3(0, p[1], p[0]) * (1.0f / (float)poly.size());
  for (int sd = -1; sd <= 1; sd += 2) {                                                           // the two sides: a fan from the middle
    for (size_t k = 0; k < poly.size(); k++) { const auto &a = poly[k], &b = poly[(k + 1) % poly.size()]; Vec3 A(sd * hw, a[1], a[0]), B(sd * hw, b[1], b[0]), C(sd * hw, c.y, c.z);
      Vec3 n = cross(B - A, C - A); if ((sd > 0) == (n.x > 0)) m.quad(A, B, C, C, col); else m.quad(B, A, C, C, col); }
  }
  for (size_t k = 0; k < poly.size(); k++) {                                                      // the strips between them: roof, windscreen, bonnet, nose, floor, arches
    const auto &a = poly[k], &b = poly[(k + 1) % poly.size()]; Vec3 A(-hw, a[1], a[0]), B(hw, a[1], a[0]), C(hw, b[1], b[0]), D(-hw, b[1], b[0]);
    Vec3 mid = (A + B + C + D) * 0.25f, n = cross(B - A, D - A), toMid = mid - Vec3(0, c.y, c.z); if (dot(n, toMid) < 0) m.quad(A, D, C, B, col); else m.quad(A, B, C, D, col);
  }
}
// A panel van: a body extruded from its profile (a short bonnet, a raked windscreen, a tall box behind it) with real wheel arches, glass only on the cab,
// door seams for the cab doors and the sliding door, rear doors, a grille and steel wheels.
static CarMesh buildVan(Gfx& g) {
  MeshData body, trim, head, tail; const float zN = 2.6f, zT = -2.6f, WR = 0.38f, zF = 1.65f, zR = -1.45f, HW = 0.97f, AR = WR + 0.09f, yG = 0.46f;
  std::vector<std::array<float, 2>> pr;
  pr.push_back({ zT, yG }); pr.push_back({ zT, 2.15f }); pr.push_back({ 1.02f, 2.15f }); pr.push_back({ 1.78f, 1.30f }); pr.push_back({ 2.30f, 1.24f }); pr.push_back({ zN - 0.05f, 1.10f }); pr.push_back({ zN, 0.80f }); pr.push_back({ zN, yG });
  for (int k = 0; k <= 8; k++) { float a = (float)PI * k / 8.0f; pr.push_back({ zF + AR * std::cos(a), yG + (WR + 0.10f) * std::sin(a) }); }     // the front arch, from the front edge over the top to the back edge
  for (int k = 0; k <= 8; k++) { float a = (float)PI * k / 8.0f; pr.push_back({ zR + AR * std::cos(a), yG + (WR + 0.10f) * std::sin(a) }); }     // the rear arch
  extrudeX(body, HW, pr, PAINT_C);
  auto sideQuad = [&](MeshData& m, int sd, float x, const std::vector<std::array<float, 2>>& pts, uint32_t col) { Vec3 a(x * sd, pts[0][1], pts[0][0]), b(x * sd, pts[1][1], pts[1][0]), c(x * sd, pts[2][1], pts[2][0]), d(x * sd, pts[3][1], pts[3][0]); Vec3 n = cross(b - a, c - a); if ((n.x > 0) == (sd > 0)) m.quad(a, b, c, d, col); else m.quad(a, d, c, b, col); };
  { Vec3 a(-0.84f, 1.33f, 1.74f), b(0.84f, 1.33f, 1.74f), c(0.84f, 2.08f, 1.04f), d(-0.84f, 2.08f, 1.04f); Vec3 off = normalize(Vec3(0, 0.7f, 0.7f)) * 0.012f; body.quad(a + off, b + off, c + off, d + off, GLASS_C); }   // the windscreen, on the slope
  for (int sd = -1; sd <= 1; sd += 2) {
    sideQuad(body, sd, HW + 0.004f, { { -0.05f, 1.42f }, { -0.05f, 2.04f }, { 0.98f, 2.04f }, { 1.58f, 1.42f } }, GLASS_C);                                   // the door window
    sideQuad(trim, sd, HW + 0.006f, { { -0.07f, 0.55f }, { -0.07f, 2.10f }, { -0.045f, 2.10f }, { -0.045f, 0.55f } }, TRIM_C);                                // the cab door's rear seam
    sideQuad(trim, sd, HW + 0.006f, { { -1.00f, 0.55f }, { -1.00f, 2.10f }, { -0.975f, 2.10f }, { -0.975f, 0.55f } }, TRIM_C);                                // the sliding door's rear seam
    sideQuad(trim, sd, HW + 0.006f, { { -1.00f, 1.20f }, { -1.00f, 1.23f }, { -0.07f, 1.23f }, { -0.07f, 1.20f } }, TRIM_C);                                  // and its rail
    slabX(trim, sd * HW, sd * 0.03f, 1.28f, 1.33f, 0.45f, 0.62f, packColor(0.7f, 0.7f, 0.72f));                                                           // a handle
    trim.cylinder(Vec3(sd * 0.94f, 1.75f, 1.45f), Vec3(sd * 1.28f, 1.85f, 1.58f), 0.025f, 0.025f, 6, TRIM_C); trim.box(Vec3(sd * 1.28f - 0.05f, 1.62f, 1.50f), Vec3(sd * 1.28f + 0.05f, 1.98f, 1.66f), TRIM_C);   // mirror
    for (float zc : { zF, zR }) { trim.box(Vec3(sd * (HW - 0.50f), yG, zc - AR + 0.02f), Vec3(sd * (HW - 0.46f), yG + WR + 0.10f, zc + AR - 0.02f), TRIM_C); }   // the dark wall behind each wheel
  }
  body.box(Vec3(-0.82f, 1.35f, zT - 0.014f), Vec3(-0.06f, 2.0f, zT - 0.002f), GLASS_C); body.box(Vec3(0.06f, 1.35f, zT - 0.014f), Vec3(0.82f, 2.0f, zT - 0.002f), GLASS_C);   // the rear doors' windows
  trim.box(Vec3(-0.012f, 0.6f, zT - 0.004f), Vec3(0.012f, 2.1f, zT - 0.014f), TRIM_C);
  trim.box(Vec3(-0.72f, 0.70f, zN - 0.02f), Vec3(0.72f, 1.06f, zN + 0.03f), TRIM_C); for (int k = 0; k < 3; k++) trim.box(Vec3(-0.68f, 0.78f + k * 0.12f, zN + 0.03f), Vec3(0.68f, 0.81f + k * 0.12f, zN + 0.045f), CHROME_C);
  trim.box(Vec3(-HW, 0.38f, zN - 0.12f), Vec3(HW, 0.64f, zN + 0.10f), TRIM_C); trim.box(Vec3(-0.25f, 0.66f, zN + 0.005f), Vec3(0.25f, 0.78f, zN + 0.02f), packColor(0.85f, 0.85f, 0.8f));
  trim.box(Vec3(-HW, 0.38f, zT - 0.10f), Vec3(HW, 0.62f, zT + 0.05f), TRIM_C);
  for (int sd = -1; sd <= 1; sd += 2) { head.box(Vec3(sd * 0.74f - 0.15f, 0.86f, zN + 0.005f), Vec3(sd * 0.74f + 0.15f, 1.04f, zN + 0.04f), packColor(1.0f, 0.95f, 0.82f));
    tail.box(Vec3(sd * 0.9f - 0.07f, 0.8f, zT - 0.05f), Vec3(sd * 0.9f + 0.07f, 1.5f, zT - 0.008f), packColor(1.0f, 0.07f, 0.03f)); }
  trim.box(Vec3(-0.5f, 0.28f, -2.3f), Vec3(0.5f, 0.46f, 2.2f), TRIM_C);
  for (int sd = -1; sd <= 1; sd += 2) { heavyWheel(trim, sd * (HW - 0.17f), WR, zF, WR, 0.22f, sd, false); heavyWheel(trim, sd * (HW - 0.17f), WR, zR, WR, 0.22f, sd, false); }
  return finishHeavy(g, body, trim, head, tail, 5.2f, 1.0f, 2300, 1.05f, WR);
}

// An SUV: a tall estate body from its profile with real arches, a raked windscreen, glass in three side windows, roof rails, black lower cladding, door seams and handles.
static CarMesh buildSuv(Gfx& g) {
  MeshData body, trim, head, tail; const float zN = 2.4f, zT = -2.4f, WR = 0.38f, zF = 1.45f, zR = -1.4f, HW = 0.97f, AR = WR + 0.09f, yG = 0.40f;
  std::vector<std::array<float, 2>> pr;
  pr.push_back({ zT, yG }); pr.push_back({ zT, 1.62f }); pr.push_back({ zT + 0.10f, 1.76f }); pr.push_back({ 0.55f, 1.76f }); pr.push_back({ 1.30f, 1.14f }); pr.push_back({ 2.18f, 1.06f }); pr.push_back({ zN - 0.04f, 0.97f }); pr.push_back({ zN, 0.76f }); pr.push_back({ zN, yG });
  for (int k = 0; k <= 8; k++) { float a = (float)PI * k / 8.0f; pr.push_back({ zF + AR * std::cos(a), yG + (WR + 0.10f) * std::sin(a) }); }
  for (int k = 0; k <= 8; k++) { float a = (float)PI * k / 8.0f; pr.push_back({ zR + AR * std::cos(a), yG + (WR + 0.10f) * std::sin(a) }); }
  extrudeX(body, HW, pr, PAINT_C);
  auto sideQuad = [&](MeshData& m, int sd, float x, const std::vector<std::array<float, 2>>& pts, uint32_t col) { Vec3 a(x * sd, pts[0][1], pts[0][0]), b(x * sd, pts[1][1], pts[1][0]), c(x * sd, pts[2][1], pts[2][0]), d(x * sd, pts[3][1], pts[3][0]); Vec3 n = cross(b - a, c - a); if ((n.x > 0) == (sd > 0)) m.quad(a, b, c, d, col); else m.quad(a, d, c, b, col); };
  { Vec3 a(-0.84f, 1.17f, 1.27f), b(0.84f, 1.17f, 1.27f), c(0.84f, 1.72f, 0.60f), d(-0.84f, 1.72f, 0.60f); Vec3 off = normalize(Vec3(0, 0.75f, 0.66f)) * 0.012f; body.quad(a + off, b + off, c + off, d + off, GLASS_C); }   // windscreen
  body.box(Vec3(-0.80f, 1.30f, zT - 0.014f), Vec3(0.80f, 1.68f, zT - 0.002f), GLASS_C);                                       // rear window
  for (int sd = -1; sd <= 1; sd += 2) {
    sideQuad(body, sd, HW + 0.004f, { { 0.10f, 1.24f }, { 0.10f, 1.70f }, { 0.58f, 1.70f }, { 1.12f, 1.24f } }, GLASS_C);                                 // front door window
    sideQuad(body, sd, HW + 0.004f, { { -1.00f, 1.24f }, { -1.00f, 1.70f }, { -0.05f, 1.70f }, { -0.05f, 1.24f } }, GLASS_C);                              // rear door window
    sideQuad(body, sd, HW + 0.004f, { { -2.18f, 1.34f }, { -2.18f, 1.70f }, { -1.10f, 1.70f }, { -1.10f, 1.34f } }, GLASS_C);                              // rear quarter window
    for (float zs : { 1.18f, 0.015f, -1.05f }) sideQuad(trim, sd, HW + 0.006f, { { zs, 0.55f }, { zs, 1.76f }, { zs + 0.022f, 1.76f }, { zs + 0.022f, 0.55f } }, TRIM_C);   // door seams
    for (float zs : { 0.92f, -0.16f }) slabX(trim, sd * HW, sd * 0.03f, 1.16f, 1.21f, zs - 0.09f, zs + 0.09f, packColor(0.7f, 0.7f, 0.72f));              // handles
    sideQuad(trim, sd, HW + 0.005f, { { -2.4f, 0.40f }, { -2.4f, 0.62f }, { zR - AR, 0.62f }, { zR - AR, 0.40f } }, TRIM_C);                                  // black lower cladding, in three pieces
    sideQuad(trim, sd, HW + 0.005f, { { zR + AR, 0.40f }, { zR + AR, 0.62f }, { zF - AR, 0.62f }, { zF - AR, 0.40f } }, TRIM_C);
    sideQuad(trim, sd, HW + 0.005f, { { zF + AR, 0.40f }, { zF + AR, 0.62f }, { 2.4f, 0.62f }, { 2.4f, 0.40f } }, TRIM_C);
    trim.box(Vec3(sd * 0.62f - 0.025f, 1.77f, -2.10f), Vec3(sd * 0.62f + 0.025f, 1.83f, 0.40f), packColor(0.55f, 0.56f, 0.58f)); for (float z : { -2.0f, -1.0f, 0.0f, 0.3f }) trim.box(Vec3(sd * 0.62f - 0.02f, 1.75f, z - 0.02f), Vec3(sd * 0.62f + 0.02f, 1.80f, z + 0.02f), TRIM_C);   // roof rails
    trim.cylinder(Vec3(sd * 0.93f, 1.30f, 1.05f), Vec3(sd * 1.14f, 1.36f, 1.12f), 0.02f, 0.02f, 6, TRIM_C); trim.box(Vec3(sd * 1.14f - 0.045f, 1.28f, 1.02f), Vec3(sd * 1.14f + 0.045f, 1.48f, 1.20f), TRIM_C);   // mirror
    for (float zc : { zF, zR }) trim.box(Vec3(sd * (HW - 0.50f), yG, zc - AR + 0.02f), Vec3(sd * (HW - 0.46f), yG + WR + 0.10f, zc + AR - 0.02f), TRIM_C);   // the dark wall behind each wheel
  }
  trim.box(Vec3(-0.72f, 0.62f, zN - 0.02f), Vec3(0.72f, 0.96f, zN + 0.03f), TRIM_C); for (int k = 0; k < 3; k++) trim.box(Vec3(-0.68f, 0.70f + k * 0.10f, zN + 0.03f), Vec3(0.68f, 0.73f + k * 0.10f, zN + 0.045f), CHROME_C);
  trim.box(Vec3(-HW, 0.36f, zN - 0.10f), Vec3(HW, 0.62f, zN + 0.09f), TRIM_C); trim.box(Vec3(-0.25f, 0.64f, zN + 0.005f), Vec3(0.25f, 0.74f, zN + 0.02f), packColor(0.85f, 0.85f, 0.8f));
  trim.box(Vec3(-HW, 0.36f, zT - 0.09f), Vec3(HW, 0.64f, zT + 0.05f), TRIM_C); trim.box(Vec3(-0.25f, 0.70f, zT - 0.012f), Vec3(0.25f, 0.80f, zT - 0.004f), packColor(0.85f, 0.85f, 0.8f));
  for (int sd = -1; sd <= 1; sd += 2) { head.box(Vec3(sd * 0.68f - 0.19f, 0.86f, zN + 0.005f), Vec3(sd * 0.68f + 0.19f, 1.0f, zN + 0.04f), packColor(1.0f, 0.95f, 0.82f));
    tail.box(Vec3(sd * 0.88f - 0.06f, 1.0f, zT - 0.05f), Vec3(sd * 0.88f + 0.06f, 1.55f, zT - 0.008f), packColor(1.0f, 0.07f, 0.03f)); }
  trim.box(Vec3(-0.5f, 0.28f, -2.2f), Vec3(0.5f, 0.42f, 2.1f), TRIM_C);
  for (int sd = -1; sd <= 1; sd += 2) { heavyWheel(trim, sd * (HW - 0.17f), WR, zF, WR, 0.24f, sd, false); heavyWheel(trim, sd * (HW - 0.17f), WR, zR, WR, 0.24f, sd, false); }
  return finishHeavy(g, body, trim, head, tail, 4.8f, 1.0f, 1900, 1.0f, WR);
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
  auto swapIn = [&](int k, CarMesh n) { releaseMesh(g, traffic[k].body); releaseMesh(g, traffic[k].head); releaseMesh(g, traffic[k].tail); releaseMesh(g, traffic[k].wheels); traffic[k] = n; };   // the old meshes' buffers are freed only once the GPU is done with them
  swapIn(TK_SUV, buildSuv(g)); swapIn(TK_PICKUP, buildVan(g)); swapIn(TK_TRUCK, buildTruck(g)); swapIn(TK_BUS, buildBus(g));   // modelled part by part (see above)
  Spec cr = saloon; cr.top = C({ { -2.375f, 0.95f }, { -2.0f, 1.0f }, { -1.4f, 1.02f }, { -0.9f, 1.42f }, { 0.4f, 1.45f }, { 1.0f, 1.0f }, { 2.0f, 0.9f }, { 2.375f, 0.74f } });
  cruiser = buildCar(g, cr, true, 1.45f);
  { CarMesh old = buildCar(g, suv, true, 1.76f); swat = buildSuv(g); swat.bar = old.bar; swat.lampL = old.lampL; swat.lampR = old.lampR; swat.barY = old.barY; releaseMesh(g, old.body); releaseMesh(g, old.head); releaseMesh(g, old.tail); releaseMesh(g, old.wheels); }   // the pursuit truck: the new SUV body with the old light bar
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
