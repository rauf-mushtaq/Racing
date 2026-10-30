#include "shapes.h"

float Curve::at(float z) const {
  size_t n = k.size(); if (n == 0) return 0; if (n == 1 || z <= k[0][0]) return k[0][1]; if (z >= k[n - 1][0]) return k[n - 1][1];
  size_t i = 1; while (i < n - 1 && z > k[i][0]) i++;                                         // segment [i-1, i]
  float z0 = k[i - 1][0], z1 = k[i][0], t = (z - z0) / std::max(1e-6f, z1 - z0);
  float p0 = k[i - 1][1], p1 = k[i][1];
  // Tangents from the neighbours (Catmull-Rom for uneven spacing), flattened where the curve turns round (so it never overshoots).
  auto slope = [&](size_t j) { if (j == 0) return (k[1][1] - k[0][1]) / std::max(1e-6f, k[1][0] - k[0][0]); if (j == n - 1) return (k[n - 1][1] - k[n - 2][1]) / std::max(1e-6f, k[n - 1][0] - k[n - 2][0]);
    float a = (k[j][1] - k[j - 1][1]) / std::max(1e-6f, k[j][0] - k[j - 1][0]), b = (k[j + 1][1] - k[j][1]) / std::max(1e-6f, k[j + 1][0] - k[j][0]); return a * b <= 0 ? 0.0f : 2 * a * b / (a + b); };
  float h = z1 - z0, m0 = slope(i - 1) * h, m1 = slope(i) * h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
}

static std::vector<std::array<float, 2>> chaikin(std::vector<std::array<float, 2>> p, int iters) {
  for (int it = 0; it < iters; it++) {
    std::vector<std::array<float, 2>> q; q.push_back(p.front());
    for (size_t i = 0; i + 1 < p.size(); i++) { q.push_back({ 0.75f * p[i][0] + 0.25f * p[i + 1][0], 0.75f * p[i][1] + 0.25f * p[i + 1][1] }); q.push_back({ 0.25f * p[i][0] + 0.75f * p[i + 1][0], 0.25f * p[i][1] + 0.75f * p[i + 1][1] }); }
    q.push_back(p.back()); p = q;
  }
  return p;
}
MeshData loftBody(const BodySpec& s, uint32_t col) {
  std::vector<std::vector<Vec3>> rings;
  for (int i = 0; i <= s.stations; i++) {
    float z = s.z0 + (s.z1 - s.z0) * i / s.stations;
    float hw = s.hw.at(z), ytop = s.ytop.at(z), ysh = std::min(s.ysh.at(z), ytop - 0.03f), yb = s.yb.at(z), crown = s.crown.k.empty() ? 0.0f : s.crown.at(z);
    for (auto& a : s.arches) { float dz = std::fabs(z - a[0]), R = a[1] + s.archMargin; if (dz < R) yb = std::max(yb, s.archY + std::sqrt(R * R - dz * dz) * 0.97f); }
    yb = std::min(yb, ysh - 0.1f);
    float e = std::min(clampf((z - s.z0) / s.tailR, 0, 1), clampf((s.z1 - z) / s.noseR, 0, 1)), sc = std::sqrt(std::max(0.0f, 1.0f - (1 - e) * (1 - e)));
    float hwk = hw * (0.25f + 0.75f * sc), ym = (yb + ytop) * 0.5f, vk = 0.3f + 0.7f * sc, side = hwk * (1.0f - s.tumble);
    std::vector<std::array<float, 2>> half = {
      { 0, yb }, { hwk * 0.76f, yb }, { hwk * 0.965f, yb + 0.07f }, { hwk, yb + 0.5f * (ysh - yb) }, { hwk - (hwk - side * 0.97f) * 0.5f, ysh - 0.02f }, { side * 0.97f, ysh },
      { hwk * (s.deckStart + 0.04f), ysh + (ytop - ysh) * 0.78f }, { hwk * s.deckStart * 0.5f, ytop - 0.004f }, { 0, ytop + crown } };
    for (auto& p : half) p[1] = ym + (p[1] - ym) * vk;
    auto sm = chaikin(half, s.smooth); std::vector<Vec3> ring;
    for (auto& p : sm) ring.push_back(Vec3(p[0], p[1], z));
    for (int j = (int)sm.size() - 2; j >= 1; j--) ring.push_back(Vec3(-sm[j][0], sm[j][1], z));
    rings.push_back(ring);
  }
  MeshData m; m.loft(rings, col, true, true); return m;
}
MeshData colourTriangles(const MeshData& m, const std::function<uint32_t(Vec3, Vec3)>& f) {
  MeshData o; o.v.reserve(m.i.size()); o.i.reserve(m.i.size());
  for (size_t t = 0; t + 2 < m.i.size(); t += 3) {
    const MeshVertex &a = m.v[m.i[t]], &b = m.v[m.i[t + 1]], &c = m.v[m.i[t + 2]];
    Vec3 pa(a.px, a.py, a.pz), pb(b.px, b.py, b.pz), pc(c.px, c.py, c.pz); Vec3 n = normalize(cross(pb - pa, pc - pa)); uint32_t col = f((pa + pb + pc) * (1.0f / 3.0f), n);
    MeshVertex va = a, vb = b, vc = c; va.color = vb.color = vc.color = col; uint32_t base = (uint32_t)o.v.size();
    o.v.push_back(va); o.v.push_back(vb); o.v.push_back(vc); o.tri(base, base + 1, base + 2);
  }
  return o;
}
void discZ(MeshData& m, float cx, float cy, float z, float r, float d, bool facePlusZ, uint32_t col, int seg, float dish) {
  MeshData t; std::vector<std::array<float, 2>> prof = facePlusZ ? std::vector<std::array<float, 2>>{ { -d, 0.0f }, { -d, r }, { 0.0f, r }, { dish, r * 0.35f }, { dish, 0.0f } }
                                                                    : std::vector<std::array<float, 2>>{ { d, 0.0f }, { d, r }, { 0.0f, r }, { -dish, r * 0.35f }, { -dish, 0.0f } };
  t.lathe(prof, seg, col); Mat4 xf = mul(translation(cx, cy, z), rotationY(-(float)PI / 2)); m.append(t, &xf);
}
void ellipseZ(MeshData& m, float cx, float cy, float z, float rx, float ry, float depth, uint32_t col, int seg) {
  std::vector<std::vector<Vec3>> rings;
  for (int k = 0; k < 2; k++) { std::vector<Vec3> r; for (int i = 0; i < seg; i++) { float a = (float)(2 * PI * i / seg); r.push_back(Vec3(cx + std::cos(a) * rx, cy + std::sin(a) * ry, z - depth * k)); } rings.push_back(r); }
  m.loft(rings, col, true, true);
}
WheelParts wireWheel(float R, float W, float rimR) {
  WheelParts w; const uint32_t black = packColor(0.012f, 0.012f, 0.014f), chrome = packColor(0.82f, 0.84f, 0.88f), dark = packColor(0.05f, 0.05f, 0.055f);
  float h = W * 0.5f, sw = R * 0.93f;                                                        // tyre: a rounded section with a bulging sidewall
  w.tire.lathe({ { -h, rimR - 0.01f }, { -h * 0.98f, rimR + (R - rimR) * 0.45f }, { -h * 0.8f, R * 0.985f }, { -h * 0.35f, R }, { h * 0.35f, R }, { h * 0.8f, R * 0.985f }, { h * 0.98f, rimR + (R - rimR) * 0.45f }, { h, rimR - 0.01f }, { h * 0.6f, rimR - 0.02f }, { -h * 0.6f, rimR - 0.02f }, { -h, rimR - 0.01f } }, 40, black);
  (void)sw;
  w.rim.lathe({ { -h * 0.55f, rimR - 0.02f }, { -h * 0.55f, rimR + 0.012f }, { h * 0.82f, rimR + 0.012f }, { h * 0.98f, rimR - 0.004f }, { h * 0.98f, rimR - 0.03f }, { h * 0.55f, rimR - 0.035f } }, 36, chrome);   // the rim barrel with its polished lip
  MeshData back; back.lathe({ { -h * 0.3f, 0.0f }, { -h * 0.3f, rimR - 0.03f }, { 0.0f, rimR - 0.03f }, { 0.0f, 0.0f } }, 28, dark); w.spokes.append(back);   // brake drum behind the spokes
  float hubR = rimR * 0.2f; const int NS = 40;
  for (int i = 0; i < NS; i++) {                                                             // laced spokes: from the hub flange to the rim, crossing tangentially
    float a0 = (float)(2 * PI * i / NS), a1 = a0 + (i % 2 ? 1 : -1) * 0.5f, x0 = h * 0.5f * ((i % 4) < 2 ? 1.0f : 0.2f), x1 = h * 0.25f;
    Vec3 p0(x0, std::cos(a0) * hubR, std::sin(a0) * hubR), p1(x1, std::cos(a1) * (rimR - 0.03f), std::sin(a1) * (rimR - 0.03f)); w.spokes.cylinder(p0, p1, 0.0042f, 0.0042f, 5, chrome, false, false);
  }
  w.hub.lathe({ { 0.0f, 0.0f }, { 0.0f, hubR * 1.2f }, { h * 0.55f, hubR * 1.25f }, { h * 0.85f, hubR * 1.0f }, { h * 0.95f, hubR * 0.5f }, { h, 0.0f } }, 20, chrome);   // hub with a domed centre
  for (int i = 0; i < 3; i++) { float a = (float)(2 * PI * i / 3 + 0.4f); MeshData ear; ear.box(Vec3(h * 0.8f, -hubR * 0.28f, hubR * 0.8f), Vec3(h * 1.0f + 0.012f, hubR * 0.28f, hubR * 2.1f), chrome); Mat4 rot = rotationX(a); w.hub.append(ear, &rot); }   // the three ears of a knock-off spinner
  return w;
}
