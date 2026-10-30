#include "bond.h"
#include "shapes.h"

static uint32_t C(float r, float g, float b) { return packColor(r, g, b); }
static std::vector<Vec3> ring(float z, float hw, float yb, float yt, int N, float n = 2.4f) {
  std::vector<Vec3> r; float ym = yb + (yt - yb) * 0.45f;
  for (int k = 0; k < N; k++) {
    float a = (float)(2 * PI * k / N), c = std::cos(a), s = std::sin(a);
    float ex = (c < 0 ? -1.0f : 1.0f) * std::pow(std::fabs(c), 2.0f / n), ey = (s < 0 ? -1.0f : 1.0f) * std::pow(std::fabs(s), 2.0f / n);
    r.push_back(Vec3(hw * ex, ym + (s >= 0 ? (yt - ym) : (ym - yb)) * ey, z));
  }
  return r;
}
void BondModel::configure(Vehicle& v) {
  VehicleSpec& s = v.s;
  s.mass = 1540; s.cgH = 0.5; s.rollH = 0.36;
  s.wheelPos[0][0] = 1.25; s.wheelPos[0][1] = -0.70; s.wheelPos[1][0] = 1.25; s.wheelPos[1][1] = 0.70; s.wheelPos[2][0] = -1.24; s.wheelPos[2][1] = -0.70; s.wheelPos[3][0] = -1.24; s.wheelPos[3][1] = 0.70;
  s.wheelR = 0.32; s.wheelI = 1.1; s.nGears = 5; s.gears[0] = 2.98; s.gears[1] = 1.88; s.gears[2] = 1.36; s.gears[3] = 1.0; s.gears[4] = 0.84; s.finalDrive = 3.77;
  s.idle = 900; s.redline = 6600; s.limiter = 6800; s.Tmax = 640; s.peakRpm = 4300; s.drag = 0.34; s.down = 0.35; s.mu = 1.12; s.frontDrive = 0.0; s.steerMax = 0.58;
  s.spring[0] = s.spring[1] = 46000; s.spring[2] = s.spring[3] = 52000; s.damper[0] = s.damper[1] = 3400; s.damper[2] = s.damper[3] = 3800;
  v.configure(); v.reset(0, 0, 0);
}

void BondModel::build(Gfx& g) {
  const float WR = 0.32f, ZF = 1.25f, ZR = -1.24f; const uint32_t chromeC = C(0.88f, 0.89f, 0.92f), dark = C(0.02f, 0.02f, 0.022f);
  { // The lower body: long bonnet, a high waist, a short tail with a flat end panel; wheel arches cut into it.
    BodySpec s; s.z0 = -2.28f; s.z1 = 2.29f; s.stations = 100; s.smooth = 2; s.noseR = 0.40f; s.tailR = 0.06f; s.deckStart = 0.80f; s.tumble = 0.035f; s.archY = WR; s.archMargin = 0.065f; s.arches = { { ZF, WR }, { ZR, WR } };
    s.hw = { { -2.28f, 0.70f }, { -2.2f, 0.78f }, { -2.0f, 0.83f }, { -1.6f, 0.85f }, { -1.0f, 0.855f }, { 0.0f, 0.855f }, { 1.0f, 0.855f }, { 1.6f, 0.85f }, { 1.95f, 0.83f }, { 2.15f, 0.76f }, { 2.29f, 0.56f } };
    s.ytop = { { -2.28f, 0.88f }, { -2.2f, 0.945f }, { -2.0f, 0.985f }, { -1.7f, 0.99f }, { -1.4f, 0.975f }, { -1.0f, 0.965f }, { 0.0f, 0.955f }, { 0.7f, 0.965f }, { 1.2f, 0.95f }, { 1.7f, 0.905f }, { 2.0f, 0.845f }, { 2.2f, 0.77f }, { 2.29f, 0.67f } };
    s.ysh = { { -2.28f, 0.72f }, { -2.0f, 0.855f }, { -1.5f, 0.86f }, { 0.0f, 0.835f }, { 1.0f, 0.83f }, { 1.7f, 0.79f }, { 2.2f, 0.66f }, { 2.29f, 0.58f } };
    s.yb = { { -2.28f, 0.38f }, { -2.15f, 0.26f }, { -1.9f, 0.175f }, { 2.0f, 0.175f }, { 2.29f, 0.24f } };
    s.crown = { { -2.3f, 0.0f }, { -1.8f, 0.008f }, { 0.7f, 0.0f }, { 1.2f, 0.022f }, { 1.8f, 0.018f }, { 2.29f, 0.0f } };
    MeshData m = loftBody(s, C(1, 1, 1));
    body = uploadMesh(g, colourTriangles(m, [&](Vec3 c, Vec3 n) { if (n.y < -0.25f) return C(0.015f, 0.015f, 0.018f); if (c.y < 0.2f && std::fabs(n.x) > 0.5f) return C(0.02f, 0.02f, 0.022f); return C(1, 1, 1); }));
  }
  { // Greenhouse: glass, then the steel roof over it.
    struct S { float z, hw, yb, yt; };
    const S st[] = { {0.80f, 0.62f, 0.95f, 0.99f}, {0.58f, 0.70f, 0.92f, 1.17f}, {0.22f, 0.725f, 0.91f, 1.29f}, {-0.30f, 0.73f, 0.91f, 1.335f}, {-0.80f, 0.715f, 0.91f, 1.31f}, {-1.25f, 0.67f, 0.92f, 1.19f}, {-1.55f, 0.58f, 0.93f, 1.03f}, {-1.68f, 0.48f, 0.94f, 0.98f} };
    std::vector<std::vector<Vec3>> rings; for (auto& s : st) rings.push_back(ring(s.z, s.hw, s.yb, s.yt, 34, 2.1f));
    MeshData m; m.loft(rings, C(1, 1, 1), true, true); glass = uploadMesh(g, m);
    const S rf[] = { {0.38f, 0.50f, 1.255f, 1.285f}, {0.1f, 0.64f, 1.30f, 1.335f}, {-0.35f, 0.665f, 1.335f, 1.372f}, {-0.8f, 0.65f, 1.315f, 1.352f}, {-1.15f, 0.59f, 1.22f, 1.25f}, {-1.36f, 0.5f, 1.14f, 1.17f} };
    std::vector<std::vector<Vec3>> rr; for (auto& s : rf) rr.push_back(ring(s.z, s.hw, s.yb, s.yt, 30, 2.8f));
    MeshData r; r.loft(rr, C(1, 1, 1), true, true); roof = uploadMesh(g, r);
  }
  { // Dark trim: grille interior, sills, lamp wells, door shuts, the exhausts and the gadget nozzles.
    MeshData m; ellipseZ(m, 0, 0.43f, 2.255f, 0.40f, 0.125f, 0.12f, C(0.01f, 0.01f, 0.012f));                                    // the grille's dark interior
    for (int s = -1; s <= 1; s += 2) {
      m.box(Vec3(s * 0.80f - 0.01f, 0.17f, -0.95f), Vec3(s * 0.80f + 0.01f, 0.25f, 0.55f), C(0.025f, 0.025f, 0.028f));      // sills (between the wheels)
      m.box(Vec3(s * 0.856f - 0.004f, 0.3f, -0.92f), Vec3(s * 0.856f + 0.008f, 0.88f, -0.9f), C(0.03f, 0.03f, 0.035f));      // door shut lines
      m.box(Vec3(s * 0.856f - 0.004f, 0.3f, 0.66f), Vec3(s * 0.856f + 0.008f, 0.88f, 0.68f), C(0.03f, 0.03f, 0.035f));
      m.box(Vec3(s * 0.856f - 0.004f, 0.3f, -0.92f), Vec3(s * 0.856f + 0.008f, 0.32f, 0.68f), C(0.03f, 0.03f, 0.035f));
      m.cylinder(Vec3(s * 0.45f, 0.2f, -2.1f), Vec3(s * 0.45f, 0.2f, -2.4f), 0.04f, 0.038f, 12, C(0.18f, 0.18f, 0.2f), true, false);     // twin exhaust tips
      m.cylinder(Vec3(s * 0.12f, 0.26f, -2.2f), Vec3(s * 0.12f, 0.26f, -2.36f), 0.022f, 0.02f, 8, C(0.05f, 0.05f, 0.055f), true, false);  // oil nozzle (left), smoke nozzle (right)
    }
    trim = uploadMesh(g, m);
  }
  { // Chrome: bumpers with overriders, the oval grille's surround and slats, window and belt trim, door handles, the side gills, badge.
    MeshData m; auto bar = [&](float x0, float x1, float y, float z, float h, float d) { m.box(Vec3(x0, y, z), Vec3(x1, y + h, z + d), chromeC); };
    bar(-0.68f, 0.68f, 0.27f, 2.265f, 0.05f, 0.05f); bar(-0.7f, 0.7f, 0.2f, 2.235f, 0.03f, 0.035f);                             // front bumper blade
    bar(-0.76f, 0.76f, 0.3f, -2.31f, 0.055f, 0.05f); bar(-0.72f, 0.72f, 0.2f, -2.285f, 0.03f, 0.035f);                           // rear bumper
    for (float x : { -0.55f, -0.3f, 0.3f, 0.55f }) { m.cylinder(Vec3(x, 0.18f, 2.2f), Vec3(x, 0.4f, 2.27f), 0.028f, 0.034f, 10, chromeC); }   // front overriders
    for (float x : { -0.5f, 0.5f }) m.cylinder(Vec3(x, 0.22f, -2.2f), Vec3(x, 0.4f, -2.3f), 0.028f, 0.034f, 10, chromeC);     // rear overriders
    { MeshData f; ellipseZ(f, 0, 0.43f, 2.268f, 0.43f, 0.155f, 0.02f, chromeC); m.append(f); }                                  // grille surround
    for (int i = -7; i <= 7; i++) m.box(Vec3(i * 0.052f - 0.007f, 0.33f, 2.255f), Vec3(i * 0.052f + 0.007f, 0.53f, 2.272f), chromeC);   // vertical slats
    for (int s = -1; s <= 1; s += 2) {
      m.box(Vec3(s * 0.858f - 0.004f, 0.835f, -1.55f), Vec3(s * 0.858f + 0.012f, 0.848f, 1.65f), chromeC);                      // belt line trim
      m.box(Vec3(s * 0.86f - 0.004f, 0.86f, -0.28f), Vec3(s * 0.86f + 0.02f, 0.885f, -0.12f), chromeC);                         // door handle
      for (int i = 0; i < 3; i++) m.box(Vec3(s * 0.856f - 0.002f, 0.52f, 0.78f + i * 0.045f), Vec3(s * 0.856f + 0.014f, 0.72f, 0.795f + i * 0.045f), chromeC);   // the gills behind the front wheel
      MeshData h; discZ(h, s * 0.58f, 0.575f, 2.19f, 0.135f, 0.05f, true, chromeC, 24); m.append(h);                            // headlamp rings
      MeshData t; discZ(t, s * 0.66f, 0.77f, -2.265f, 0.095f, 0.03f, false, chromeC, 20); m.append(t);                          // tail lamp rings
      m.box(Vec3(s * 0.2f - 0.03f, 1.02f, 0.72f), Vec3(s * 0.2f + 0.03f, 1.05f, 0.8f), chromeC);                                 // wiper pivots
    }
    m.box(Vec3(-0.05f, 0.9f, 2.0f), Vec3(0.05f, 0.935f, 2.1f), chromeC);                                                      // bonnet badge
    chrome = uploadMesh(g, m);
  }
  { MeshData h, t; // Lamps: round headlamps in the wings, round tail lamps, and the little indicator lamps under them
    for (int s = -1; s <= 1; s += 2) { discZ(h, s * 0.58f, 0.575f, 2.195f, 0.108f, 0.02f, true, C(1.0f, 0.96f, 0.85f), 24); discZ(h, s * 0.58f, 0.43f, 2.2f, 0.04f, 0.015f, true, C(1.0f, 0.6f, 0.1f), 12);
      discZ(t, s * 0.66f, 0.77f, -2.27f, 0.075f, 0.02f, false, C(1.0f, 0.05f, 0.03f), 20); discZ(t, s * 0.66f, 0.63f, -2.27f, 0.04f, 0.015f, false, C(1.0f, 1.0f, 0.95f), 12); }
    lamps = uploadMesh(g, h); tail = uploadMesh(g, t);
  }
  { // The machine guns: two barrels on slides. At rest their tips are inside the wing; deployed they project 0.3 m.
    MeshData m; for (int s = -1; s <= 1; s += 2) { m.cylinder(Vec3(s * 0.42f, 0.42f, 1.9f), Vec3(s * 0.42f, 0.42f, 2.16f), 0.024f, 0.02f, 10, C(0.04f, 0.04f, 0.045f)); m.cylinder(Vec3(s * 0.42f, 0.42f, 2.16f), Vec3(s * 0.42f, 0.42f, 2.2f), 0.034f, 0.034f, 10, C(0.12f, 0.12f, 0.13f)); }
    guns = uploadMesh(g, m);
  }
  { // The armour plate that rises behind the cabin.
    MeshData m; m.box(Vec3(-0.6f, 0.0f, -0.018f), Vec3(0.6f, 0.38f, 0.018f), C(0.07f, 0.075f, 0.08f)); m.box(Vec3(-0.6f, 0.0f, -0.03f), Vec3(0.6f, 0.025f, 0.03f), C(0.2f, 0.2f, 0.22f)); m.box(Vec3(-0.6f, 0.36f, -0.03f), Vec3(0.6f, 0.38f, 0.03f), C(0.2f, 0.2f, 0.22f));
    shield = uploadMesh(g, m);
  }
  { // Wire wheels (right-hand side, outer face at +x).
    WheelParts w = wireWheel(WR, 0.2f, 0.215f); tire = uploadMesh(g, w.tire); rim = uploadMesh(g, w.rim); spokes = uploadMesh(g, w.spokes); hub = uploadMesh(g, w.hub);
    MeshData b; b.lathe({ {0.0f, 0.0f}, {0.0f, 0.19f}, {0.04f, 0.19f}, {0.04f, 0.0f} }, 24, C(0.3f, 0.3f, 0.32f)); brake = uploadMesh(g, b);
  }
}

Mat4 BondModel::bodyMatrix(const Vehicle& v, double alpha) const {
  double x = lerpd(v.px, v.x, alpha), z = lerpd(v.pz, v.z, alpha), h = v.ph + wrapAngle(v.h - v.ph) * alpha;
  Mat4 M = mul(translation((float)x, (float)v.bodyY(), (float)z), rotationY((float)h));
  M = mul(M, translation(0, 0.4f, 0)); M = mul(M, rotationX((float)v.pitch)); M = mul(M, rotationZ((float)v.roll)); M = mul(M, translation(0, -0.4f, 0));
  return M;
}
void BondModel::draw(Renderer& r, const Vehicle& v, double alpha, const BondState& st) {
  Mat4 M = bodyMatrix(v, alpha);
  Material paint; paint.type = 1; paint.tint[0] = 0.50f; paint.tint[1] = 0.52f; paint.tint[2] = 0.55f;                          // silver birch
  Material glassM; glassM.type = 3; Material trimM; trimM.type = 0; trimM.rough = 0.5f; trimM.twoSided = true;
  Material chromeM; chromeM.type = 0; chromeM.rough = 0.1f; chromeM.metal = 1.0f; chromeM.twoSided = true;
  Material headM; headM.type = 4; headM.emissive = st.headlights ? 2.0f : 0.5f; Material tailM; tailM.type = 4; tailM.emissive = st.braking ? 8.0f : 1.6f;
  Material gunM; gunM.type = 0; gunM.rough = 0.3f; gunM.metal = 0.8f; Material tireM; tireM.type = 0; tireM.rough = 0.85f; tireM.twoSided = true;
  Material spokeM; spokeM.type = 0; spokeM.rough = 0.15f; spokeM.metal = 1.0f; spokeM.twoSided = true; Material brakeM; brakeM.type = 0; brakeM.rough = 0.6f; brakeM.metal = 0.5f; brakeM.twoSided = true;
  r.drawMeshMat(body, M, paint); r.drawMeshMat(roof, M, paint); r.drawMeshMat(trim, M, trimM);
  if (!r.inShadow) { r.drawMeshMat(glass, M, glassM); r.drawMeshMat(chrome, M, chromeM); r.drawMeshMat(lamps, M, headM); r.drawMeshMat(tail, M, tailM); }
  if (st.gunOut > 0.01) r.drawMeshMat(guns, mul(M, translation(0, 0, (float)(0.3 * st.gunOut))), gunM); else r.drawMeshMat(guns, M, gunM);
  r.drawMeshMat(shield, mul(M, translation(0, (float)(1.0 - 0.5 * (1.0 - st.shield)), -1.74f)), gunM);
  for (int i = 0; i < 4; i++) {
    const Wheel& W = v.wheels[i]; bool front = i < 2; double lz = v.s.wheelPos[i][0], lx = v.s.wheelPos[i][1];
    float yoff = (float)clampd(W.comp - v.cStatic[i], -0.12, 0.12);
    Mat4 wm = mul(M, translation((float)-lx, (float)v.s.wheelR + yoff, (float)lz));
    if (front) wm = mul(wm, rotationY((float)-v.steer));
    if (lx > 0) wm = mul(wm, scaling(-1, 1, 1));
    wm = mul(wm, rotationX((float)W.ang));
    r.drawMeshMat(tire, wm, tireM); r.drawMeshMat(rim, wm, spokeM); r.drawMeshMat(spokes, wm, spokeM); r.drawMeshMat(hub, wm, spokeM);
    if (!r.inShadow) r.drawMeshMat(brake, mul(wm, translation(-0.04f, 0, 0)), brakeM);
  }
}
