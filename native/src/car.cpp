#include "car.h"

static std::vector<Vec3> ring(float z, float hw, float yb, float yt, int N, float n = 3.4f) {
  std::vector<Vec3> r; float ym = yb + (yt - yb) * 0.42f;
  for (int k = 0; k < N; k++) {
    float a = (float)(2 * PI * k / N), c = std::cos(a), s = std::sin(a);
    float ex = (c < 0 ? -1.0f : 1.0f) * std::pow(std::fabs(c), 2.0f / n), ey = (s < 0 ? -1.0f : 1.0f) * std::pow(std::fabs(s), 2.0f / n);
    r.push_back(Vec3(hw * ex, ym + (s >= 0 ? (yt - ym) : (ym - yb)) * ey, z));
  }
  return r;
}
static uint32_t C(float r, float g, float b) { return packColor(r, g, b); }

void CarModel::build(Gfx& g) {
  const int N = 28;
  { // Body: stations from the tail (z = -2.30) to the nose (z = +2.30); the axles are at -1.119 and +1.546.
    struct S { float z, hw, yb, yt; };
    const S st[] = { {-2.30f, 0.50f, 0.40f, 0.66f}, {-2.18f, 0.80f, 0.30f, 0.90f}, {-1.85f, 0.97f, 0.22f, 1.02f}, {-1.45f, 1.01f, 0.20f, 1.03f}, {-1.12f, 1.02f, 0.20f, 0.98f}, {-0.60f, 0.97f, 0.20f, 0.88f}, {0.00f, 0.95f, 0.20f, 0.80f},
                     {0.60f, 0.94f, 0.20f, 0.74f}, {1.10f, 0.95f, 0.20f, 0.70f}, {1.55f, 0.97f, 0.20f, 0.65f}, {1.90f, 0.91f, 0.19f, 0.54f}, {2.15f, 0.76f, 0.19f, 0.44f}, {2.30f, 0.52f, 0.22f, 0.36f} };
    std::vector<std::vector<Vec3>> rings; for (auto& s : st) rings.push_back(ring(s.z, s.hw, s.yb, s.yt, N));
    MeshData m; m.loft(rings, C(1, 1, 1), true, true); body = uploadMesh(g, m);
  }
  { // Glass canopy.
    struct S { float z, hw, yb, yt; };
    const S st[] = { {-1.12f, 0.50f, 0.96f, 1.00f}, {-0.80f, 0.74f, 0.92f, 1.10f}, {-0.30f, 0.84f, 0.86f, 1.19f}, {0.20f, 0.85f, 0.80f, 1.19f}, {0.65f, 0.76f, 0.74f, 1.05f}, {0.98f, 0.64f, 0.70f, 0.82f}, {1.08f, 0.50f, 0.69f, 0.74f} };
    std::vector<std::vector<Vec3>> rings; for (auto& s : st) rings.push_back(ring(s.z, s.hw, s.yb, s.yt, N, 2.4f));
    MeshData m; m.loft(rings, C(1, 1, 1), true, true); glass = uploadMesh(g, m);
  }
  { // Dark trim: splitter, side skirts, diffuser, intakes, grille and under-tray.
    MeshData m; uint32_t k = C(0.02f, 0.02f, 0.022f);
    m.box(Vec3(-0.80f, 0.16f, 2.05f), Vec3(0.80f, 0.21f, 2.34f), k);                        // front splitter
    m.box(Vec3(-1.00f, 0.14f, -1.55f), Vec3(-0.93f, 0.30f, 1.20f), k); m.box(Vec3(0.93f, 0.14f, -1.55f), Vec3(1.00f, 0.30f, 1.20f), k);   // side skirts
    m.box(Vec3(-0.78f, 0.16f, -2.30f), Vec3(0.78f, 0.34f, -1.95f), k);                       // diffuser
    m.box(Vec3(-0.45f, 0.30f, 2.20f), Vec3(0.45f, 0.40f, 2.32f), k);                         // grille
    for (int s = -1; s <= 1; s += 2) { m.box(Vec3(s * 0.96f - 0.03f, 0.42f, -0.55f), Vec3(s * 0.96f + 0.03f, 0.58f, 0.05f), k); m.box(Vec3(s * 0.55f - 0.18f, 0.62f, 1.9f), Vec3(s * 0.55f + 0.18f, 0.66f, 2.1f), k); }
    m.box(Vec3(-0.80f, 0.19f, -2.0f), Vec3(0.80f, 0.23f, 2.0f), k);
    trim = uploadMesh(g, m);
  }
  { // Rear wing: carbon blade on two posts with end plates.
    MeshData m; uint32_t k = C(0.015f, 0.015f, 0.018f);
    m.box(Vec3(-1.0f, 1.12f, -2.28f), Vec3(1.0f, 1.16f, -1.88f), k); m.box(Vec3(-1.02f, 1.02f, -2.30f), Vec3(-0.98f, 1.24f, -1.86f), k); m.box(Vec3(0.98f, 1.02f, -2.30f), Vec3(1.02f, 1.24f, -1.86f), k);
    m.box(Vec3(-0.45f, 0.95f, -2.12f), Vec3(-0.40f, 1.12f, -2.04f), k); m.box(Vec3(0.40f, 0.95f, -2.12f), Vec3(0.45f, 1.12f, -2.04f), k);
    wing = uploadMesh(g, m);
  }
  { MeshData m; uint32_t k = C(1.0f, 0.93f, 0.8f);                                          // headlights
    for (int s = -1; s <= 1; s += 2) m.box(Vec3(s * 0.74f - 0.20f, 0.46f, 2.02f), Vec3(s * 0.74f + 0.20f, 0.52f, 2.12f), k); head = uploadMesh(g, m); }
  { MeshData m; uint32_t k = C(1.0f, 0.04f, 0.02f);                                         // tail lights
    m.box(Vec3(-0.80f, 0.74f, -2.30f), Vec3(0.80f, 0.80f, -2.22f), k); tail = uploadMesh(g, m); }
  { // Wheels, built for the right-hand side with the outer face at +x (the left one is mirrored).
    MeshData t; t.lathe({ {-0.15f, 0.22f}, {-0.152f, 0.285f}, {-0.125f, 0.335f}, {-0.06f, 0.348f}, {0.06f, 0.348f}, {0.125f, 0.335f}, {0.152f, 0.285f}, {0.15f, 0.22f}, {0.10f, 0.215f}, {-0.10f, 0.215f}, {-0.15f, 0.22f} }, 28, C(0.012f, 0.012f, 0.014f)); tire = uploadMesh(g, t);
    MeshData sp; for (int s = 0; s < 5; s++) { MeshData b; b.box(Vec3(0.08f, 0.04f, -0.028f), Vec3(0.145f, 0.24f, 0.028f), C(0.6f, 0.61f, 0.64f)); Mat4 rot = rotationX((float)(2 * PI * s / 5)); sp.append(b, &rot); }
    MeshData rr; rr.lathe({ {0.06f, 0.0f}, {0.075f, 0.06f}, {0.11f, 0.10f}, {0.145f, 0.10f}, {0.145f, 0.255f}, {0.10f, 0.255f}, {0.0f, 0.255f} }, 24, C(0.55f, 0.56f, 0.6f)); rr.append(sp); rim = uploadMesh(g, rr);
    MeshData b; b.lathe({ {0.03f, 0.0f}, {0.03f, 0.205f}, {0.10f, 0.205f}, {0.10f, 0.0f} }, 24, C(0.85f, 0.1f, 0.06f)); brake = uploadMesh(g, b);   // brake disc and a red caliper tint
  }
}

Mat4 CarModel::bodyMatrix(const Vehicle& v, double alpha) const {
  double x = lerpd(v.px, v.x, alpha), z = lerpd(v.pz, v.z, alpha), h = v.ph + wrapAngle(v.h - v.ph) * alpha;
  Mat4 M = mul(translation((float)x, (float)v.bodyY(), (float)z), rotationY((float)h));
  M = mul(M, translation(0, 0.35f, 0)); M = mul(M, rotationX((float)v.pitch)); M = mul(M, rotationZ((float)v.roll)); M = mul(M, translation(0, -0.35f, 0));
  return M;
}
void CarModel::draw(Renderer& r, const Vehicle& v, double alpha, const float color[3], bool braking) {
  Mat4 M = bodyMatrix(v, alpha);
  Material paint; paint.type = 1; paint.tint[0] = color[0]; paint.tint[1] = color[1]; paint.tint[2] = color[2];
  Material glassM; glassM.type = 3; Material trimM; trimM.type = 0; trimM.rough = 0.55f; trimM.twoSided = true;
  Material carbon; carbon.type = 0; carbon.rough = 0.3f; carbon.metal = 0.25f; Material tireM; tireM.type = 0; tireM.rough = 0.85f; tireM.twoSided = true;
  Material rimM; rimM.type = 0; rimM.rough = 0.25f; rimM.metal = 0.9f; rimM.twoSided = true; Material brakeM; brakeM.type = 0; brakeM.rough = 0.5f; brakeM.metal = 0.6f; brakeM.twoSided = true;
  Material headM; headM.type = 4; headM.emissive = 3.0f; Material tailM; tailM.type = 4; tailM.emissive = braking ? 7.0f : 1.6f;
  r.drawMeshMat(body, M, paint); r.drawMeshMat(trim, M, trimM); r.drawMeshMat(wing, M, carbon);
  if (!r.inShadow) { r.drawMeshMat(glass, M, glassM); r.drawMeshMat(head, M, headM); r.drawMeshMat(tail, M, tailM); }
  for (int i = 0; i < 4; i++) {
    const Wheel& W = v.wheels[i]; bool front = i < 2; double lz = v.s.wheelPos[i][0], lx = v.s.wheelPos[i][1];
    float yoff = (float)clampd(W.comp - v.cStatic[i], -0.12, 0.12);
    float spin = (float)W.ang; Mat4 wm = mul(M, translation((float)-lx, (float)v.s.wheelR + yoff, (float)lz));
    if (front) wm = mul(wm, rotationY((float)-v.steer));
    if (lx > 0) wm = mul(wm, scaling(-1, 1, 1));                  // the model's +x side is the car's left; mirror the right-hand wheels' outer face
    wm = mul(wm, rotationX(spin));
    r.drawMeshMat(tire, wm, tireM); r.drawMeshMat(rim, wm, rimM); if (!r.inShadow) r.drawMeshMat(brake, mul(wm, translation(-0.02f, 0, 0)), brakeM);
  }
}
