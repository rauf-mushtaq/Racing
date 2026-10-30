#include "props.h"
#include <functional>

static float rnd01(int seed) { return (float)hash3(seed, seed * 7 + 3, 17); }
MeshData blobMesh(Vec3 c, Vec3 radii, int seg, uint32_t col, float noiseAmp, int seed) {
  std::vector<std::vector<Vec3>> rings; int R = std::max(4, seg / 2);
  for (int r = 0; r <= R; r++) {
    float lat = (float)(-PI / 2 + PI * r / R); std::vector<Vec3> ring;
    for (int k = 0; k < seg; k++) {
      float a = (float)(2 * PI * k / seg); Vec3 d(std::cos(lat) * std::cos(a), std::sin(lat), std::cos(lat) * std::sin(a));
      float n = (float)(fbm(d.x * 2.3 + seed * 1.7, d.y * 2.3 + d.z * 2.3 + seed, 3, 5 + seed) - 0.5) * 2.0f * noiseAmp;
      ring.push_back(c + Vec3(d.x * radii.x, d.y * radii.y, d.z * radii.z) * (1.0f + n));
    }
    rings.push_back(ring);
  }
  MeshData m; m.loft(rings, col, false, false); return m;
}
static uint32_t C(float r, float g, float b) { return packColor(r, g, b); }

static MeshData pine(bool snowy) {
  MeshData m; m.cylinder(Vec3(0, 0, 0), Vec3(0, 3.4f, 0), 0.30f, 0.17f, 7, C(0.20f, 0.12f, 0.07f));
  for (int k = 0; k < 6; k++) {
    float t = k / 5.0f, y0 = 1.3f + t * 5.6f, h = 2.9f - t * 1.0f, r = 2.6f * (1.0f - t * 0.82f);
    float gr = 0.5f + 0.5f * rnd01(k + 3); float snow = snowy ? 0.35f + 0.5f * t : 0.0f;
    float R = 0.05f * gr + snow * 0.85f, G = 0.14f * gr + 0.04f + snow * 0.85f, B = 0.06f * gr + snow * 0.9f + 0.02f;
    m.cylinder(Vec3(0, y0, 0), Vec3(0, y0 + h, 0), r, 0.04f, 11, C(R, G, B), true, false);
  }
  return m;
}
static MeshData treeFar() {
  MeshData m; m.cylinder(Vec3(0, 0, 0), Vec3(0, 3.3f, 0), 0.36f, 0.22f, 8, C(0.22f, 0.15f, 0.09f));
  m.cylinder(Vec3(0, 2.2f, 0), Vec3(1.1f, 4.2f, 0.3f), 0.15f, 0.09f, 6, C(0.22f, 0.15f, 0.09f));
  m.cylinder(Vec3(0, 2.6f, 0), Vec3(-1.0f, 4.4f, -0.4f), 0.14f, 0.08f, 6, C(0.22f, 0.15f, 0.09f));
  const float P[10][4] = { {0, 5.4f, 0, 2.8f}, {1.8f, 4.7f, 0.5f, 2.1f}, {-1.8f, 4.9f, -0.6f, 2.2f}, {0.3f, 6.7f, 0.2f, 2.0f}, {-0.3f, 4.5f, 1.9f, 1.9f}, {0.5f, 4.4f, -1.9f, 1.9f}, {2.6f, 5.3f, -0.8f, 1.6f}, {-2.5f, 5.4f, 1.0f, 1.6f}, {1.0f, 6.0f, 1.5f, 1.6f}, {-1.1f, 6.1f, -1.4f, 1.6f} };
  for (int k = 0; k < 10; k++) { float v = 0.7f + 0.5f * rnd01(k + 11); m.append(blobMesh(Vec3(P[k][0], P[k][1], P[k][2]), Vec3(P[k][3], P[k][3] * 0.78f, P[k][3]), 12, C(0.07f * v, 0.20f * v, 0.05f * v), 0.22f, k + 1)); }
  return m;
}

// A broadleaf tree with real structure: a leaning trunk, primary limbs, branches and twigs (tapered tubes, uv.x = 6 marks bark), and about a
// thousand leaf cards clustered on the twig ends (uv.x in [4,5]; the shader cuts each card into a leaf). Leaf normals point out from the
// crown, so the canopy shades like a rounded mass instead of a pile of flat cards, and cards deeper inside are darker.
struct Rng { uint32_t s; float next() { s = s * 1664525u + 1013904223u; return (float)(s >> 8) / 16777216.0f; } float range(float a, float b) { return a + (b - a) * next(); } };
static MeshData tree() {
  MeshData m; Rng g{ 9137u }; const uint32_t bark = C(0.20f, 0.155f, 0.115f);
  std::vector<std::pair<Vec3, int>> clusters;                       // where the leaves grow, and how many cards
  auto tube = [&](Vec3 a, Vec3 b, float r0, float r1, int sides) { size_t v0 = m.v.size(); m.cylinder(a, b, r0, r1, sides, bark, false, false); for (size_t k = v0; k < m.v.size(); k++) m.v[k].u = 6.0f; };
  std::function<void(Vec3, Vec3, float, float, int)> branch = [&](Vec3 p, Vec3 d, float len, float r0, int depth) {
    const int SEG = depth == 0 ? 4 : 3; Vec3 cur = p;
    for (int s = 0; s < SEG; s++) {
      d = normalize(d + Vec3(g.range(-0.16f, 0.16f), g.range(-0.06f, 0.12f), g.range(-0.16f, 0.16f)));
      float rA = r0 * (1.0f - 0.8f * s / SEG), rB = r0 * (1.0f - 0.8f * (s + 1) / SEG); Vec3 nxt = cur + d * (len / SEG); tube(cur, nxt, rA, rB, depth == 2 ? 4 : 6);
      if (depth < 2 && s >= 1) {                                    // side branches: turned 35 to 60 degrees away from this one
        int kids = depth == 0 ? 2 : 1;
        for (int k = 0; k < kids; k++) {
          float ang = g.range(0.6f, 1.05f), az = g.range(0.0f, 6.2832f); Vec3 u = normalize(cross(d, Vec3(0.3f, 1.0f, 0.2f))), w = cross(d, u);
          Vec3 nd = normalize(d * std::cos(ang) + (u * std::cos(az) + w * std::sin(az)) * std::sin(ang)); if (nd.y < -0.1f) nd.y = -0.1f;
          branch(nxt, nd, len * g.range(0.42f, 0.56f), rB * 0.8f, depth + 1);
        }
      }
      if (depth == 2 && s == 1) clusters.push_back({ nxt, 9 });
      cur = nxt;
    }
    clusters.push_back({ cur, depth == 2 ? 16 : depth == 1 ? 12 : 18 });
  };
  float H = 3.6f; Vec3 top(0.0f, 0.0f, 0.0f);                       // the trunk: four tapering segments with a slight lean and a flared foot
  for (int s = 0; s < 4; s++) { Vec3 a(0.12f * s * s * 0.1f, H * s / 4.0f, 0.06f * s), b(0.12f * (s + 1) * (s + 1) * 0.1f, H * (s + 1) / 4.0f, 0.06f * (s + 1)); tube(a, b, s == 0 ? 0.46f : 0.40f - 0.06f * s, 0.40f - 0.06f * (s + 1), 8); top = b; }
  const int PRIMARY = 7;
  for (int k = 0; k < PRIMARY; k++) {
    float az = k * 2.39996f + g.range(-0.3f, 0.3f), pitch = g.range(0.55f, 1.05f), t = (k + 1.0f) / PRIMARY;         // golden-angle spacing up the crown
    Vec3 start(top.x * (0.55f + 0.45f * t), H * (0.62f + 0.38f * t), top.z * (0.55f + 0.45f * t));
    Vec3 d(std::cos(az) * std::sin(pitch), std::cos(pitch) * 0.9f + 0.15f, std::sin(az) * std::sin(pitch));
    branch(start, normalize(d), g.range(2.5f, 3.4f) * (1.0f - 0.25f * t), 0.15f - 0.04f * t, 0);
  }
  clusters.push_back({ top + Vec3(0, 0.6f, 0), 20 });
  Vec3 crown(0, 0, 0); for (auto& c : clusters) crown += c.first; crown = crown * (1.0f / clusters.size());
  float crownR = 1e-3f; for (auto& c : clusters) crownR = std::max(crownR, length(c.first - crown));
  for (auto& cl : clusters) for (int k = 0; k < cl.second; k++) {
    Vec3 off(g.range(-1, 1), g.range(-1, 1), g.range(-1, 1)); off = normalize(off) * (0.62f * std::cbrt(g.next())); Vec3 c0 = cl.first + off;
    Vec3 out = normalize(c0 - crown); Vec3 n0 = normalize(out * 0.7f + Vec3(g.range(-1, 1), g.range(-0.6f, 1), g.range(-1, 1)) * 0.35f);
    Vec3 t1 = normalize(cross(n0, Vec3(g.range(-1, 1), 1.0f, g.range(-1, 1)))), t2 = cross(n0, t1); float rot = g.range(0, 6.2832f), cr = std::cos(rot), sr = std::sin(rot);
    Vec3 a = t1 * cr + t2 * sr, b = cross(n0, a); float sz = g.range(0.30f, 0.46f);
    Vec3 shadeN = normalize(out * 0.8f + n0 * 0.2f);
    float depth = std::pow(clampf(length(c0 - crown) / crownR, 0, 1), 0.9f), ao = 0.38f + 0.62f * depth;
    float var = g.next(), hue = var < 0.14f ? 1.0f : 0.0f;          // a few yellowish-green leaves among the green
    float rr = (0.062f + 0.05f * var + 0.07f * hue) * ao, gg = (0.135f + 0.05f * g.next() + 0.03f * hue) * ao, bb = (0.034f + 0.012f * var) * ao;
    uint32_t col = C(rr, gg, bb);
    Vec3 p0 = c0 - a * (sz * 0.38f), p1 = c0 + a * (sz * 0.38f), p2 = c0 + b * sz + a * (sz * 0.38f), p3 = c0 + b * sz - a * (sz * 0.38f);
    uint32_t i0 = m.add(p0, shadeN, col, 4.0f, 0.0f), i1 = m.add(p1, shadeN, col, 5.0f, 0.0f), i2 = m.add(p2, shadeN, col, 5.0f, 1.0f), i3 = m.add(p3, shadeN, col, 4.0f, 1.0f);
    m.tri(i0, i1, i2); m.tri(i0, i2, i3);
  }
  return m;
}
static MeshData palm() {
  MeshData m; std::vector<std::vector<Vec3>> rings; const int N = 8, S = 9; Vec3 top;
  for (int s = 0; s <= S; s++) {
    float t = (float)s / S; Vec3 c(1.6f * t * t, 9.5f * t, 0.5f * t * t); top = c; float r = 0.32f - 0.14f * t + (s == 0 ? 0.12f : 0.0f);
    std::vector<Vec3> ring; for (int k = 0; k < N; k++) { float a = (float)(2 * PI * k / N); ring.push_back(c + Vec3(std::cos(a) * r, 0, std::sin(a) * r)); } rings.push_back(ring);
  }
  m.loft(rings, C(0.40f, 0.33f, 0.25f), true, true); for (auto& vx : m.v) vx.u = 6.0f;      // the trunk is bark
  for (int f = 0; f < 14; f++) {                                  // fronds: arching strips; the shader cuts the leaflets and the spine (uv.x >= 2 marks a frond)
    float a = (float)(2 * PI * f / 14) + rnd01(f) * 0.4f, len = 3.9f + rnd01(f + 20) * 1.3f, droop = 1.4f + rnd01(f + 40) * 0.9f; Vec3 dir(std::cos(a), 0, std::sin(a)), side(-dir.z, 0, dir.x);
    uint32_t col = C(0.085f + 0.05f * rnd01(f), 0.165f + 0.06f * rnd01(f + 5), 0.04f + 0.015f * rnd01(f + 9));
    const int SEG = 10;
    for (int s = 0; s < SEG; s++) {
      float t0 = (float)s / SEG, t1 = (float)(s + 1) / SEG, w0 = 0.62f * std::sin((float)PI * (t0 * 0.92f + 0.04f)), w1 = 0.62f * std::sin((float)PI * (t1 * 0.92f + 0.04f));
      Vec3 p0 = top + dir * (len * t0) + Vec3(0, 0.5f * std::sin((float)PI * t0 * 0.9f) * 1.6f - droop * t0 * t0, 0), p1 = top + dir * (len * t1) + Vec3(0, 0.5f * std::sin((float)PI * t1 * 0.9f) * 1.6f - droop * t1 * t1, 0);
      m.quad(p0 - side * w0, p0 + side * w0, p1 + side * w1, p1 - side * w1, col, 2.0f, t0, 3.0f, t1);
    }
  }
  return m;
}
static MeshData cactus() {
  MeshData m; uint32_t col = C(0.09f, 0.24f, 0.10f);
  m.cylinder(Vec3(0, 0, 0), Vec3(0, 5.2f, 0), 0.38f, 0.34f, 9, col); m.append(blobMesh(Vec3(0, 5.2f, 0), Vec3(0.34f, 0.5f, 0.34f), 9, col, 0.0f, 1));
  for (int s = -1; s <= 1; s += 2) {
    float y = s < 0 ? 2.3f : 3.2f, up = s < 0 ? 1.8f : 1.4f;
    m.cylinder(Vec3(0, y, 0), Vec3(s * 0.95f, y + 0.1f, 0), 0.22f, 0.21f, 8, col); m.cylinder(Vec3(s * 0.95f, y, 0), Vec3(s * 1.05f, y + up, 0), 0.21f, 0.19f, 8, col, false, true);
    m.append(blobMesh(Vec3(s * 1.05f, y + up, 0), Vec3(0.19f, 0.32f, 0.19f), 8, col, 0.0f, 2));
  }
  return m;
}
static MeshData rock() { MeshData m = blobMesh(Vec3(0, 0.35f, 0), Vec3(1.0f, 0.72f, 0.88f), 12, C(0.40f, 0.36f, 0.31f), 0.33f, 7); return m; }
static MeshData shrub() {
  MeshData m; const float P[4][4] = { {0, 0.45f, 0, 0.75f}, {0.6f, 0.35f, 0.2f, 0.55f}, {-0.5f, 0.38f, -0.2f, 0.58f}, {0.1f, 0.35f, -0.6f, 0.5f} };
  for (int k = 0; k < 4; k++) { float v = 0.75f + 0.45f * rnd01(k + 31); m.append(blobMesh(Vec3(P[k][0], P[k][1], P[k][2]), Vec3(P[k][3], P[k][3] * 0.72f, P[k][3]), 9, C(0.10f * v, 0.19f * v, 0.05f * v), 0.2f, k + 3)); }
  return m;
}
void buildProps(Gfx& g, PropSet& o) {
  o.mesh[P_PINE] = uploadMesh(g, pine(false)); o.mesh[P_SNOWPINE] = uploadMesh(g, pine(true)); o.mesh[P_TREE] = uploadMesh(g, tree()); o.treeFar = uploadMesh(g, treeFar()); o.mesh[P_PALM] = uploadMesh(g, palm());
  o.mesh[P_CACTUS] = uploadMesh(g, cactus()); o.mesh[P_ROCK] = uploadMesh(g, rock()); o.mesh[P_SHRUB] = uploadMesh(g, shrub());
}
