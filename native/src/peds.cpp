#include "peds.h"
#include "props.h"
using namespace grid;

// A person: smooth, human proportions (1.75 m), a torso lofted from hips to shoulders, limbs as tapered capsules, a head with hair,
// shoes. The walk is four poses solved from a hip/knee/shoulder/elbow swing; the lowest foot is put on the ground in every pose.
static void limb(MeshData& m, Vec3 a, Vec3 b, float ra, float rb, uint32_t col, int seg = 9) {
  m.cylinder(a, b, ra, rb, seg, col, false, false); m.append(blobMesh(a, Vec3(ra, ra, ra), seg, col, 0.0f, 1)); m.append(blobMesh(b, Vec3(rb, rb, rb), seg, col, 0.0f, 1));
}
static void torso(MeshData& m, uint32_t col, float yHip, float yTop, float sh, float hip, float depth) {   // sh: half shoulder width, hip: half hip width
  struct S { float y, rx, rz, zc; };
  const S st[] = { { yHip, hip, depth * 0.82f, 0 }, { yHip + 0.12f, hip * 0.9f, depth * 0.8f, 0 }, { yHip + 0.24f, sh * 0.74f, depth * 0.82f, 0.005f }, { yHip + 0.38f, sh * 0.9f, depth, 0.01f }, { yTop - 0.06f, sh * 0.98f, depth * 0.9f, 0.0f }, { yTop, sh * 0.7f, depth * 0.62f, -0.005f } };
  std::vector<std::vector<Vec3>> rings; const int N = 14;
  for (const S& q : st) { std::vector<Vec3> r; for (int k = 0; k < N; k++) { float a = (float)(2 * PI * k / N); r.push_back(Vec3(q.rx * std::cos(a), q.y, q.zc + q.rz * std::sin(a))); } rings.push_back(r); }
  m.loft(rings, col, true, true);
}
void Peds::init(Gfx& g) {
  const uint32_t white = packColor(1, 1, 1), hair = packColor(0.05f, 0.04f, 0.035f), shoe = packColor(0.04f, 0.04f, 0.045f), sole = packColor(0.12f, 0.12f, 0.12f);
  for (int pose = 0; pose < POSES; pose++) {
    MeshData sh, lg, sk, rs; float phi = (float)(pose * PI / 2);
    struct Leg { Vec3 hip, knee, ankle; } L[2]; float lowest = 9;
    for (int sd = -1; sd <= 1; sd += 2) {
      float ph = sd > 0 ? phi : phi + (float)PI, th = 0.46f * std::sin(ph), kb = 0.12f + 0.62f * std::max(0.0f, -std::sin(ph + 0.7f)), ts = th - kb;
      Vec3 hip(sd * 0.095f, 0.94f, 0), knee = hip + Vec3(0, -std::cos(th), std::sin(th)) * 0.44f, ankle = knee + Vec3(0, -std::cos(ts), std::sin(ts)) * 0.43f;
      L[sd > 0 ? 1 : 0] = { hip, knee, ankle }; lowest = std::min(lowest, ankle.y);
    }
    float dy = 0.075f - lowest;                                         // put the lowest ankle 7.5 cm above the ground
    float bob = dy;
    for (int i = 0; i < 2; i++) {
      Leg& l = L[i]; float sd = i ? 1.0f : -1.0f; Vec3 off(0, dy, 0);
      limb(lg, l.hip + off, l.knee + off, 0.100f, 0.072f, white); limb(lg, l.knee + off, l.ankle + off, 0.070f, 0.048f, white);
      Vec3 foot = l.ankle + off; rs.append(blobMesh(foot + Vec3(0, -0.035f, 0.075f), Vec3(0.058f, 0.055f, 0.135f), 9, shoe, 0.0f, 2)); rs.append(blobMesh(foot + Vec3(0, -0.07f, 0.075f), Vec3(0.056f, 0.018f, 0.13f), 8, sole, 0.0f, 2));
      // arms swing against the legs on the same side
      float ph = i ? phi : phi + (float)PI, ta = -0.42f * std::sin(ph), tf = ta + 0.28f + 0.22f * std::max(0.0f, std::sin(ph + 0.4f));
      Vec3 S(sd * 0.215f, 1.42f + bob, 0), E = S + Vec3(0, -std::cos(ta), std::sin(ta)) * 0.29f, Wr = E + Vec3(0, -std::cos(tf), std::sin(tf)) * 0.26f;
      limb(sh, S, E, 0.060f, 0.052f, white); limb(sk, E, Wr, 0.046f, 0.034f, white); sk.append(blobMesh(Wr + Vec3(0, -0.05f, 0.02f), Vec3(0.032f, 0.058f, 0.024f), 8, white, 0.0f, 3));
    }
    lg.append(blobMesh(Vec3(0, 0.95f + bob, 0), Vec3(0.185f, 0.11f, 0.13f), 12, white, 0.0f, 4));      // the seat of the trousers
    torso(sh, white, 0.93f + bob, 1.47f + bob, 0.215f, 0.175f, 0.125f);
    sk.cylinder(Vec3(0, 1.45f + bob, 0.005f), Vec3(0, 1.56f + bob, 0.012f), 0.058f, 0.052f, 9, white, false, false);
    sk.append(blobMesh(Vec3(0, 1.675f + bob, 0.012f), Vec3(0.096f, 0.122f, 0.108f), 12, white, 0.0f, 5)); sk.append(blobMesh(Vec3(0, 1.645f + bob, 0.105f), Vec3(0.014f, 0.024f, 0.02f), 6, white, 0.0f, 6));   // head and nose
    for (int e = -1; e <= 1; e += 2) rs.append(blobMesh(Vec3(e * 0.034f, 1.695f + bob, 0.098f), Vec3(0.011f, 0.008f, 0.008f), 6, packColor(0.02f, 0.02f, 0.02f), 0.0f, 8));   // eyes
    rs.append(blobMesh(Vec3(0, 1.715f + bob, -0.022f), Vec3(0.1f, 0.108f, 0.11f), 12, hair, 0.05f, 7));  // hair
    shirt[pose] = uploadMesh(g, sh); legs[pose] = uploadMesh(g, lg); skin[pose] = uploadMesh(g, sk); rest[pose] = uploadMesh(g, rs);
  }
}
static double tri(double x) { x -= std::floor(x); return x < 0.5 ? 2 * x : 2 - 2 * x; }
void Peds::prepare(Gfx& g, const Pose& player, const Frustum& f, double time) {
  std::vector<InstanceData> tShirt[POSES], tLegs[POSES], tSkin[POSES], plain[POSES]; const uint32_t neutral = packColor(0.5f, 0.5f, 0.5f);
  if (std::fabs(player.x) < CITY_EDGE + 150 && std::fabs(player.z) < CITY_EDGE + 150) {
    int i0 = (int)std::lround(player.x / SP), j0 = (int)std::lround(player.z / SP); const double RANGE = 150.0;
    static const float SHIRTS[12][3] = { {0.55f, 0.55f, 0.55f}, {0.06f, 0.06f, 0.07f}, {0.30f, 0.07f, 0.06f}, {0.07f, 0.12f, 0.26f}, {0.35f, 0.30f, 0.12f}, {0.09f, 0.20f, 0.12f}, {0.40f, 0.22f, 0.10f}, {0.18f, 0.10f, 0.22f}, {0.50f, 0.34f, 0.36f}, {0.20f, 0.21f, 0.23f}, {0.62f, 0.60f, 0.54f}, {0.12f, 0.20f, 0.30f} };
    static const float TROUSERS[6][3] = { {0.045f, 0.07f, 0.14f}, {0.03f, 0.03f, 0.035f}, {0.25f, 0.21f, 0.14f}, {0.09f, 0.10f, 0.12f}, {0.07f, 0.11f, 0.20f}, {0.16f, 0.14f, 0.12f} };
    static const float SKINS[6][3] = { {0.52f, 0.34f, 0.26f}, {0.40f, 0.26f, 0.19f}, {0.24f, 0.15f, 0.11f}, {0.62f, 0.44f, 0.34f}, {0.14f, 0.09f, 0.07f}, {0.46f, 0.31f, 0.21f} };
    for (int axis = 0; axis < 2; axis++) for (int dk = -3; dk <= 3; dk++) {
      int k = std::max(-N, std::min(N, (axis == 0 ? i0 : j0) + dk)); double line = k * SP; double lat = axis == 0 ? player.x - line : player.z - line; if (std::fabs(lat) > RANGE + 30) continue;
      int jc = axis == 0 ? j0 : i0;
      for (int js = jc - 2; js <= jc + 1; js++) {                         // the stretch of street between junction js and js + 1
        if (js < -N || js >= N) continue; double a = js * SP + hw(js) + 5, b = (js + 1) * SP - hw(js + 1) - 5, len = b - a; double dcn = std::max(std::fabs(k + 0.0), std::fabs(js + 0.5)); int count = dcn < 3 ? 6 : dcn < 7 ? 3 : 1;
        for (int side = -1; side <= 1; side += 2) for (int n = 0; n < count; n++) {
          int seed = k * 7919 + js * 104729 + side * 31 + axis * 977 + n * 13; double ph = hash3(seed, 1, 5), sp = 1.1 + 0.8 * hash3(seed, 2, 5), x = ph + time * sp / (len * 2.0), u = a + len * tri(x), dir = (x - std::floor(x)) < 0.5 ? 1.0 : -1.0;
          double off = side * (hw(k) + 1.3 + 3.2 * hash3(seed, 3, 5)); double px = axis == 0 ? line + off : u, pz = axis == 0 ? u : line + off;
          double dx = px - player.x, dz = pz - player.z, d2 = dx * dx + dz * dz; if (d2 > RANGE * RANGE) continue; if (d2 > 25 * 25 && !f.sphereVisible((float)px, 1.0f, (float)pz, 2.0f)) continue;
          double yaw = axis == 0 ? (dir > 0 ? 0.0 : PI) : (dir > 0 ? PI / 2 : -PI / 2); int pose = ((int)std::floor(time * 4.0 * sp + ph * 7.0)) & 3; const float* c = SHIRTS[(int)(hash3(seed, 4, 5) * 11.99)]; const float* tr = TROUSERS[(int)(hash3(seed, 6, 5) * 5.99)]; const float* sc = SKINS[(int)(hash3(seed, 7, 5) * 5.99)]; float bob = 0.0f, hs = 0.93f + 0.14f * (float)hash3(seed, 8, 5);
          tShirt[pose].push_back({ (float)px, bob, (float)pz, hs, (float)yaw, packColor(c[0] * 0.5f, c[1] * 0.5f, c[2] * 0.5f), 0, 0 }); tLegs[pose].push_back({ (float)px, bob, (float)pz, hs, (float)yaw, packColor(tr[0] * 0.5f, tr[1] * 0.5f, tr[2] * 0.5f), 0, 0 }); tSkin[pose].push_back({ (float)px, bob, (float)pz, hs, (float)yaw, packColor(sc[0] * 0.5f, sc[1] * 0.5f, sc[2] * 0.5f), 0, 0 }); plain[pose].push_back({ (float)px, bob, (float)pz, hs, (float)yaw, neutral, 0, 0 });
        }
      }
    }
  }
  for (int p = 0; p < POSES; p++) { lists[p].n = (UINT)std::min<size_t>(tShirt[p].size(), 400); if (!lists[p].n) continue; const UINT bytes = lists[p].n * (UINT)sizeof(InstanceData);
    lists[p].shirt = g.dynVB(tShirt[p].data(), bytes, sizeof(InstanceData)); lists[p].legs = g.dynVB(tLegs[p].data(), bytes, sizeof(InstanceData)); lists[p].skin = g.dynVB(tSkin[p].data(), bytes, sizeof(InstanceData)); lists[p].plain = g.dynVB(plain[p].data(), bytes, sizeof(InstanceData)); }
}
void Peds::draw(Renderer& r, bool shadow) {
  Material cloth; cloth.type = 0; cloth.rough = 0.85f; cloth.twoSided = true; Material skinM; skinM.type = 0; skinM.rough = 0.55f; skinM.twoSided = true;
  for (int p = 0; p < POSES; p++) if (lists[p].n) { r.drawMeshInst(shirt[p], cloth, lists[p].shirt, lists[p].n); r.drawMeshInst(legs[p], cloth, lists[p].legs, lists[p].n); if (!shadow) { r.drawMeshInst(skin[p], skinM, lists[p].skin, lists[p].n); r.drawMeshInst(rest[p], cloth, lists[p].plain, lists[p].n); } }
}
void Peds::showcase(Renderer& r, double x, double z) {
  static const float SH[5][3] = { {0.55f, 0.55f, 0.55f}, {0.06f, 0.06f, 0.07f}, {0.30f, 0.07f, 0.06f}, {0.07f, 0.12f, 0.26f}, {0.50f, 0.34f, 0.36f} };
  static const float SK[5][3] = { {0.52f, 0.34f, 0.26f}, {0.24f, 0.15f, 0.11f}, {0.62f, 0.44f, 0.34f}, {0.40f, 0.26f, 0.19f}, {0.46f, 0.31f, 0.21f} };
  Material cloth; cloth.type = 0; cloth.rough = 0.85f; cloth.twoSided = true; Material trousers = cloth; trousers.tint[0] = 0.045f * 2; trousers.tint[1] = 0.07f * 2; trousers.tint[2] = 0.14f * 2; Material plain = cloth; Material skinM = cloth; skinM.rough = 0.55f;
  for (int i = 0; i < 5; i++) { Mat4 M = mul(translation((float)(x + (i - 2) * 0.9), (float)heightAt(x, z), (float)z), rotationY(0.4f)); int pz = i % POSES;
    cloth.tint[0] = SH[i][0] * 2; cloth.tint[1] = SH[i][1] * 2; cloth.tint[2] = SH[i][2] * 2; skinM.tint[0] = SK[i][0] * 2; skinM.tint[1] = SK[i][1] * 2; skinM.tint[2] = SK[i][2] * 2;
    r.drawMeshMat(shirt[pz], M, cloth); r.drawMeshMat(legs[pz], M, trousers); r.drawMeshMat(skin[pz], M, skinM); r.drawMeshMat(rest[pz], M, plain); }
}
