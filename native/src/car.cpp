#include "car.h"
#include "shapes.h"

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
  const float WR = 0.345f, ZF = 1.546f, ZR = -1.119f;
  { // Body: a loft from design curves, with wheel arches. The paint is white (it takes the material tint); the underbody and skirts are dark.
    BodySpec s; s.z0 = -2.30f; s.z1 = 2.30f; s.stations = 96; s.smooth = 2; s.noseR = 0.55f; s.tailR = 0.05f; s.deckStart = 0.78f; s.tumble = 0.05f; s.archY = WR; s.archMargin = 0.085f; s.arches = { { ZF, WR }, { ZR, WR } };
    s.hw = { { -2.30f, 0.84f }, { -2.2f, 0.93f }, { -2.0f, 1.00f }, { -1.7f, 1.04f }, { -1.35f, 1.055f }, { -1.0f, 1.04f }, { -0.5f, 0.99f }, { 0.0f, 0.955f }, { 0.6f, 0.94f }, { 1.1f, 0.95f }, { 1.55f, 0.975f }, { 1.9f, 0.94f }, { 2.15f, 0.84f }, { 2.30f, 0.62f } };
    s.ytop = { { -2.30f, 0.86f }, { -2.2f, 0.96f }, { -2.0f, 1.015f }, { -1.6f, 1.03f }, { -1.15f, 1.0f }, { -0.6f, 0.92f }, { 0.0f, 0.83f }, { 0.6f, 0.755f }, { 1.1f, 0.705f }, { 1.55f, 0.665f }, { 1.9f, 0.575f }, { 2.15f, 0.47f }, { 2.30f, 0.40f } };
    s.ysh = { { -2.30f, 0.66f }, { -2.0f, 0.86f }, { -1.5f, 0.89f }, { -1.0f, 0.83f }, { -0.5f, 0.75f }, { 0.0f, 0.68f }, { 0.6f, 0.62f }, { 1.2f, 0.57f }, { 1.9f, 0.47f }, { 2.30f, 0.34f } };
    s.yb = { { -2.30f, 0.34f }, { -2.1f, 0.26f }, { -1.9f, 0.205f }, { 1.95f, 0.205f }, { 2.30f, 0.24f } };
    s.crown = { { -2.3f, 0.0f }, { -1.7f, 0.025f }, { -1.0f, 0.0f }, { 0.4f, 0.0f }, { 1.0f, 0.03f }, { 1.7f, 0.025f }, { 2.3f, 0.0f } };
    MeshData m = loftBody(s, C(1, 1, 1));
    MeshData b = colourTriangles(m, [&](Vec3 c, Vec3 n) {
      if (n.y < -0.25f) return C(0.015f, 0.015f, 0.018f);                                      // underbody and the inside of the wheel arches
      if (c.y < 0.25f && std::fabs(n.x) > 0.5f) return C(0.02f, 0.02f, 0.022f);                 // side skirts
      if (c.z > 2.15f && c.y < 0.46f) return C(0.02f, 0.02f, 0.022f);                           // the nose intake
      return C(1, 1, 1);
    });
    body = uploadMesh(g, b);
  }
  { // Glass canopy and the roof skin over it.
    struct S { float z, hw, yb, yt; };
    const S st[] = { {-1.20f, 0.50f, 0.98f, 1.00f}, {-0.95f, 0.70f, 0.94f, 1.08f}, {-0.55f, 0.83f, 0.88f, 1.17f}, {-0.05f, 0.85f, 0.82f, 1.205f}, {0.35f, 0.80f, 0.78f, 1.14f}, {0.72f, 0.68f, 0.74f, 0.96f}, {0.92f, 0.56f, 0.72f, 0.80f}, {1.0f, 0.46f, 0.70f, 0.74f} };
    std::vector<std::vector<Vec3>> rings; for (auto& s : st) rings.push_back(ring(s.z, s.hw, s.yb, s.yt, 32, 2.3f));
    MeshData m; m.loft(rings, C(1, 1, 1), true, true); glass = uploadMesh(g, m);
    const S rf[] = { {-1.02f, 0.40f, 0.995f, 1.025f}, {-0.80f, 0.60f, 1.07f, 1.105f}, {-0.45f, 0.70f, 1.15f, 1.19f}, {-0.05f, 0.72f, 1.185f, 1.225f}, {0.25f, 0.68f, 1.14f, 1.18f}, {0.45f, 0.58f, 1.05f, 1.09f} };
    std::vector<std::vector<Vec3>> rr; for (auto& s : rf) rr.push_back(ring(s.z, s.hw, s.yb, s.yt, 28, 2.6f));
    MeshData r; r.loft(rr, C(1, 1, 1), true, true); roof = uploadMesh(g, r);
  }
  { // Dark trim: splitter, skirts, diffuser, intakes, mirrors and the black grilles.
    MeshData m; uint32_t k = C(0.02f, 0.02f, 0.022f), cf = C(0.035f, 0.035f, 0.04f);
    m.box(Vec3(-0.84f, 0.13f, 2.0f), Vec3(0.84f, 0.18f, 2.36f), cf);                           // front splitter
    m.box(Vec3(-0.42f, 0.2f, 2.16f), Vec3(0.42f, 0.34f, 2.33f), k);                            // lower intake
    for (int s = -1; s <= 1; s += 2) {
      m.box(Vec3(s * 0.96f - 0.04f, 0.12f, -1.62f), Vec3(s * 0.96f + 0.04f, 0.24f, 1.15f), cf);       // side skirts
      m.box(Vec3(s * 1.035f - 0.015f, 0.45f, -1.28f), Vec3(s * 1.035f + 0.02f, 0.72f, -0.55f), k);     // the big side intake
      for (int i = 0; i < 3; i++) m.box(Vec3(s * 1.03f - 0.01f, 0.5f + i * 0.08f, -1.2f), Vec3(s * 1.03f + 0.035f, 0.515f + i * 0.08f, -0.62f), C(0.1f, 0.1f, 0.11f));   // fins inside it
      m.box(Vec3(s * 0.60f - 0.16f, 0.36f, 2.0f), Vec3(s * 0.60f + 0.16f, 0.4f, 2.18f), k);          // brake ducts beside the nose
      m.box(Vec3(s * 0.88f - 0.03f, 0.9f, 0.55f), Vec3(s * 0.88f + 0.03f, 0.97f, 0.74f), k); m.box(Vec3(s * 0.96f - 0.1f, 0.93f, 0.62f), Vec3(s * 0.96f + 0.1f, 1.04f, 0.78f), C(0.02f, 0.02f, 0.022f));   // mirror stalk and housing
    }
    m.box(Vec3(-0.84f, 0.2f, -2.31f), Vec3(0.84f, 0.38f, -2.0f), cf);                           // diffuser and valance
    for (int i = -3; i <= 3; i++) m.box(Vec3(i * 0.22f - 0.012f, 0.2f, -2.34f), Vec3(i * 0.22f + 0.012f, 0.36f, -2.0f), k);   // diffuser fins
    m.box(Vec3(-0.55f, 0.82f, -2.27f), Vec3(0.55f, 0.9f, -2.1f), k);                           // black engine-bay grille
    for (int i = -1; i <= 1; i += 2) { m.cylinder(Vec3(i * 0.32f, 0.5f, -2.14f), Vec3(i * 0.32f, 0.5f, -2.37f), 0.075f, 0.07f, 14, C(0.25f, 0.25f, 0.27f), true, false); m.cylinder(Vec3(i * 0.55f, 0.5f, -2.14f), Vec3(i * 0.55f, 0.5f, -2.36f), 0.07f, 0.065f, 14, C(0.25f, 0.25f, 0.27f), true, false); }   // four exhaust tips
    trim = uploadMesh(g, m);
  }
  { // Rear wing: a carbon blade on two swan-neck stays with end plates.
    MeshData m; uint32_t k = C(0.015f, 0.015f, 0.018f);
    m.box(Vec3(-0.88f, 1.12f, -2.32f), Vec3(0.88f, 1.15f, -2.04f), k); m.box(Vec3(-0.9f, 1.08f, -2.33f), Vec3(-0.87f, 1.2f, -2.02f), k); m.box(Vec3(0.87f, 1.08f, -2.33f), Vec3(0.9f, 1.2f, -2.02f), k);
    m.box(Vec3(-0.4f, 0.98f, -2.2f), Vec3(-0.37f, 1.12f, -2.14f), k); m.box(Vec3(0.37f, 0.98f, -2.2f), Vec3(0.4f, 1.12f, -2.14f), k);
    wing = uploadMesh(g, m);
  }
  { MeshData m; uint32_t k = C(1.0f, 0.95f, 0.85f);                                           // headlights: slim LED blades with a darker housing around them
    for (int s = -1; s <= 1; s += 2) { m.box(Vec3(s * 0.62f - 0.27f, 0.505f, 1.97f), Vec3(s * 0.62f + 0.27f, 0.545f, 2.08f), k); m.box(Vec3(s * 0.40f - 0.06f, 0.46f, 2.05f), Vec3(s * 0.40f + 0.06f, 0.5f, 2.13f), k); }
    head = uploadMesh(g, m); }
  { MeshData m; uint32_t k = C(1.0f, 0.04f, 0.02f);                                           // tail lights: a full-width LED strip split in the middle
    m.box(Vec3(-0.98f, 0.8f, -2.31f), Vec3(-0.06f, 0.855f, -2.2f), k); m.box(Vec3(0.06f, 0.8f, -2.31f), Vec3(0.98f, 0.855f, -2.2f), k); for (int s = -1; s <= 1; s += 2) m.box(Vec3(s * 0.7f - 0.1f, 0.58f, -2.37f), Vec3(s * 0.7f + 0.1f, 0.64f, -2.3f), k);
    tail = uploadMesh(g, m); }
  { // Chrome-ish bright metal: badge and window surround strips.
    MeshData m; uint32_t k = C(0.85f, 0.86f, 0.9f); m.box(Vec3(-0.12f, 0.43f, 2.3f), Vec3(0.12f, 0.46f, 2.34f), k); chrome = uploadMesh(g, m);
  }
  { // Wheels, built for the right-hand side with the outer face at +x (the left one is mirrored).
    MeshData t; t.lathe({ {-0.15f, 0.215f}, {-0.152f, 0.285f}, {-0.125f, 0.335f}, {-0.06f, 0.348f}, {0.06f, 0.348f}, {0.125f, 0.335f}, {0.152f, 0.285f}, {0.15f, 0.215f}, {0.10f, 0.205f}, {-0.10f, 0.205f}, {-0.15f, 0.215f} }, 40, C(0.012f, 0.012f, 0.014f)); tire = uploadMesh(g, t);
    MeshData rr; uint32_t al = C(0.62f, 0.63f, 0.67f), dk = C(0.08f, 0.08f, 0.09f);
    rr.lathe({ {-0.1f, 0.2f}, {-0.1f, 0.215f}, {0.12f, 0.215f}, {0.148f, 0.236f}, {0.148f, 0.205f}, {0.1f, 0.2f} }, 40, al);   // barrel and lip
    for (int s = 0; s < 10; s++) {                                                            // ten flat spokes, tapering towards the rim, with a dark pocket between each pair
      MeshData b; b.box(Vec3(0.105f, 0.045f, -0.026f), Vec3(0.145f, 0.2f, 0.026f), al); MeshData w; w.box(Vec3(0.1f, 0.2f, -0.05f), Vec3(0.12f, 0.215f, 0.05f), al); b.append(w);
      Mat4 rot = rotationX((float)(2 * PI * s / 10)); rr.append(b, &rot);
    }
    MeshData pocket; pocket.lathe({ {0.06f, 0.0f}, {0.07f, 0.2f}, {0.11f, 0.2f}, {0.11f, 0.0f} }, 30, dk); rr.append(pocket);
    MeshData hub; hub.lathe({ {0.1f, 0.0f}, {0.15f, 0.045f}, {0.153f, 0.07f}, {0.148f, 0.0f} }, 20, C(0.8f, 0.8f, 0.85f)); rr.append(hub);
    rim = uploadMesh(g, rr);
    MeshData b; b.lathe({ {0.03f, 0.0f}, {0.03f, 0.205f}, {0.085f, 0.205f}, {0.085f, 0.0f} }, 30, C(0.55f, 0.55f, 0.58f));                       // brake disc
    MeshData cal; cal.box(Vec3(0.02f, 0.16f, -0.075f), Vec3(0.12f, 0.27f, 0.075f), C(0.95f, 0.08f, 0.05f)); b.append(cal); brake = uploadMesh(g, b);   // and a red caliper
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
  Material rimM; rimM.type = 0; rimM.rough = 0.22f; rimM.metal = 0.95f; rimM.twoSided = true; Material brakeM; brakeM.type = 0; brakeM.rough = 0.5f; brakeM.metal = 0.6f; brakeM.twoSided = true;
  Material headM; headM.type = 4; headM.emissive = 4.0f; Material tailM; tailM.type = 4; tailM.emissive = braking ? 8.0f : 1.8f;
  Material chromeM; chromeM.type = 0; chromeM.rough = 0.12f; chromeM.metal = 1.0f;
  r.drawMeshMat(body, M, paint); r.drawMeshMat(trim, M, trimM); r.drawMeshMat(wing, M, carbon);
  if (!r.inShadow) { r.drawMeshMat(roof, M, paint); r.drawMeshMat(glass, M, glassM); r.drawMeshMat(head, M, headM); r.drawMeshMat(tail, M, tailM); r.drawMeshMat(chrome, M, chromeM); }
  else r.drawMeshMat(roof, M, paint);
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
