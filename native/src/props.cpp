#include "props.h"

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
static MeshData tree() {
  MeshData m; m.cylinder(Vec3(0, 0, 0), Vec3(0, 3.3f, 0), 0.36f, 0.22f, 8, C(0.22f, 0.15f, 0.09f));
  m.cylinder(Vec3(0, 2.2f, 0), Vec3(1.1f, 4.2f, 0.3f), 0.15f, 0.09f, 6, C(0.22f, 0.15f, 0.09f));
  m.cylinder(Vec3(0, 2.6f, 0), Vec3(-1.0f, 4.4f, -0.4f), 0.14f, 0.08f, 6, C(0.22f, 0.15f, 0.09f));
  const float P[6][4] = { {0, 5.2f, 0, 2.5f}, {1.4f, 4.5f, 0.4f, 1.8f}, {-1.4f, 4.7f, -0.5f, 1.9f}, {0.3f, 6.3f, 0.2f, 1.7f}, {-0.2f, 4.4f, 1.5f, 1.6f}, {0.4f, 4.3f, -1.5f, 1.6f} };
  for (int k = 0; k < 6; k++) { float v = 0.7f + 0.5f * rnd01(k + 11); m.append(blobMesh(Vec3(P[k][0], P[k][1], P[k][2]), Vec3(P[k][3], P[k][3] * 0.78f, P[k][3]), 12, C(0.07f * v, 0.20f * v, 0.05f * v), 0.22f, k + 1)); }
  return m;
}
static MeshData palm() {
  MeshData m; std::vector<std::vector<Vec3>> rings; const int N = 8, S = 9; Vec3 top;
  for (int s = 0; s <= S; s++) {
    float t = (float)s / S; Vec3 c(1.6f * t * t, 9.5f * t, 0.5f * t * t); top = c; float r = 0.32f - 0.14f * t + (s == 0 ? 0.12f : 0.0f);
    std::vector<Vec3> ring; for (int k = 0; k < N; k++) { float a = (float)(2 * PI * k / N); ring.push_back(c + Vec3(std::cos(a) * r, 0, std::sin(a) * r)); } rings.push_back(ring);
  }
  m.loft(rings, C(0.45f, 0.36f, 0.26f), true, true);
  for (int f = 0; f < 11; f++) {                                  // fronds: arching strips with a spine
    float a = (float)(2 * PI * f / 11) + rnd01(f) * 0.4f, len = 3.6f + rnd01(f + 20) * 1.2f, droop = 1.1f + rnd01(f + 40) * 0.6f; Vec3 dir(std::cos(a), 0, std::sin(a)), side(-dir.z, 0, dir.x);
    uint32_t col = C(0.08f + 0.05f * rnd01(f), 0.26f + 0.08f * rnd01(f + 5), 0.05f);
    for (int s = 0; s < 7; s++) {
      float t0 = s / 7.0f, t1 = (s + 1) / 7.0f, w0 = 0.55f * std::sin((float)PI * (t0 * 0.9f + 0.05f)), w1 = 0.55f * std::sin((float)PI * (t1 * 0.9f + 0.05f));
      Vec3 p0 = top + dir * (len * t0) + Vec3(0, 0.5f * std::sin((float)PI * t0 * 0.9f) * 1.6f - droop * t0 * t0, 0), p1 = top + dir * (len * t1) + Vec3(0, 0.5f * std::sin((float)PI * t1 * 0.9f) * 1.6f - droop * t1 * t1, 0);
      m.quad(p0 - side * w0, p0 + side * w0, p1 + side * w1, p1 - side * w1, col);
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
  o.mesh[P_PINE] = uploadMesh(g, pine(false)); o.mesh[P_SNOWPINE] = uploadMesh(g, pine(true)); o.mesh[P_TREE] = uploadMesh(g, tree()); o.mesh[P_PALM] = uploadMesh(g, palm());
  o.mesh[P_CACTUS] = uploadMesh(g, cactus()); o.mesh[P_ROCK] = uploadMesh(g, rock()); o.mesh[P_SHRUB] = uploadMesh(g, shrub());
}
