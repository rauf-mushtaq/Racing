#include "peds.h"
#include "props.h"
using namespace grid;

void Peds::init(Gfx& g) {
  for (int pose = 0; pose < 2; pose++) {
    float sw = pose ? 0.45f : -0.45f; MeshData sh, rs; uint32_t skin = packColor(0.72f, 0.54f, 0.42f), pants = packColor(0.08f, 0.1f, 0.17f), hair = packColor(0.06f, 0.045f, 0.04f), white = packColor(1, 1, 1), shoe = packColor(0.05f, 0.05f, 0.05f);
    sh.box(Vec3(-0.21f, 0.9f, -0.12f), Vec3(0.21f, 1.5f, 0.12f), white); sh.box(Vec3(-0.34f, 1.12f, -0.07f), Vec3(-0.21f, 1.47f, 0.07f), white); sh.box(Vec3(0.21f, 1.12f, -0.07f), Vec3(0.34f, 1.47f, 0.07f), white);   // torso and short sleeves
    for (int s = -1; s <= 1; s += 2) {
      MeshData leg; leg.box(Vec3(-0.085f, -0.88f, -0.09f), Vec3(0.085f, 0.0f, 0.09f), pants); leg.box(Vec3(-0.09f, -0.93f, -0.08f), Vec3(0.09f, -0.84f, 0.2f), shoe); Mat4 lx = mul(translation(s * 0.115f, 0.9f, 0), rotationX(s * sw)); rs.append(leg, &lx);
      MeshData arm; arm.box(Vec3(-0.04f, -0.5f, -0.045f), Vec3(0.04f, 0.0f, 0.045f), skin); Mat4 ax = mul(translation(s * 0.295f, 1.14f, 0), rotationX(-s * sw * 0.9f)); rs.append(arm, &ax);
    }
    rs.append(blobMesh(Vec3(0, 1.64f, 0), Vec3(0.105f, 0.125f, 0.115f), 10, skin, 0.0f, 3)); rs.append(blobMesh(Vec3(0, 1.69f, -0.02f), Vec3(0.11f, 0.095f, 0.115f), 10, hair, 0.0f, 4)); rs.box(Vec3(-0.04f, 1.5f, -0.04f), Vec3(0.04f, 1.57f, 0.04f), skin);
    shirt[pose] = uploadMesh(g, sh); rest[pose] = uploadMesh(g, rs);
  }
}
static double tri(double x) { x -= std::floor(x); return x < 0.5 ? 2 * x : 2 - 2 * x; }
void Peds::prepare(Gfx& g, const Pose& player, const Frustum& f, double time) {
  std::vector<InstanceData> tint[2], plain[2]; const uint32_t neutral = packColor(0.5f, 0.5f, 0.5f);
  if (std::fabs(player.x) < CITY_EDGE + 150 && std::fabs(player.z) < CITY_EDGE + 150) {
    int i0 = (int)std::lround(player.x / SP), j0 = (int)std::lround(player.z / SP); const double RANGE = 150.0;
    static const float SHIRTS[10][3] = { {0.9f, 0.9f, 0.9f}, {0.1f, 0.1f, 0.12f}, {0.75f, 0.15f, 0.12f}, {0.15f, 0.35f, 0.7f}, {0.9f, 0.7f, 0.15f}, {0.2f, 0.55f, 0.3f}, {0.8f, 0.4f, 0.1f}, {0.5f, 0.2f, 0.6f}, {0.85f, 0.55f, 0.65f}, {0.4f, 0.4f, 0.42f} };
    for (int axis = 0; axis < 2; axis++) for (int dk = -3; dk <= 3; dk++) {
      int k = std::max(-N, std::min(N, (axis == 0 ? i0 : j0) + dk)); double line = k * SP; double lat = axis == 0 ? player.x - line : player.z - line; if (std::fabs(lat) > RANGE + 30) continue;
      int jc = axis == 0 ? j0 : i0;
      for (int js = jc - 2; js <= jc + 1; js++) {                         // the stretch of street between junction js and js + 1
        if (js < -N || js >= N) continue; double a = js * SP + hw(js) + 5, b = (js + 1) * SP - hw(js + 1) - 5, len = b - a; double dcn = std::max(std::fabs(k + 0.0), std::fabs(js + 0.5)); int count = dcn < 3 ? 6 : dcn < 7 ? 3 : 1;
        for (int side = -1; side <= 1; side += 2) for (int n = 0; n < count; n++) {
          int seed = k * 7919 + js * 104729 + side * 31 + axis * 977 + n * 13; double ph = hash3(seed, 1, 5), sp = 1.1 + 0.8 * hash3(seed, 2, 5), x = ph + time * sp / (len * 2.0), u = a + len * tri(x), dir = (x - std::floor(x)) < 0.5 ? 1.0 : -1.0;
          double off = side * (hw(k) + 1.3 + 3.2 * hash3(seed, 3, 5)); double px = axis == 0 ? line + off : u, pz = axis == 0 ? u : line + off;
          double dx = px - player.x, dz = pz - player.z, d2 = dx * dx + dz * dz; if (d2 > RANGE * RANGE) continue; if (d2 > 25 * 25 && !f.sphereVisible((float)px, 1.0f, (float)pz, 2.0f)) continue;
          double yaw = axis == 0 ? (dir > 0 ? 0.0 : PI) : (dir > 0 ? PI / 2 : -PI / 2); int pose = ((int)std::floor(time * 2.0 * sp + ph * 7.0)) & 1; const float* c = SHIRTS[(int)(hash3(seed, 4, 5) * 9.99)]; float bob = 0.02f * (float)std::sin(time * 9.0 * sp + ph * 6.0);
          tint[pose].push_back({ (float)px, bob, (float)pz, 1.0f, (float)yaw, packColor(c[0] * 0.5f, c[1] * 0.5f, c[2] * 0.5f), 0, 0 }); plain[pose].push_back({ (float)px, bob, (float)pz, 1.0f, (float)yaw, neutral, 0, 0 });
        }
      }
    }
  }
  for (int p = 0; p < 2; p++) { lists[p].n = (UINT)std::min<size_t>(tint[p].size(), 600); if (!lists[p].n) continue; lists[p].tint = g.dynVB(tint[p].data(), lists[p].n * (UINT)sizeof(InstanceData), sizeof(InstanceData)); lists[p].plain = g.dynVB(plain[p].data(), lists[p].n * (UINT)sizeof(InstanceData), sizeof(InstanceData)); }
}
void Peds::draw(Renderer& r, bool shadow) {
  (void)shadow; Material cloth; cloth.type = 0; cloth.rough = 0.85f; cloth.twoSided = true;
  for (int p = 0; p < 2; p++) if (lists[p].n) { r.drawMeshInst(shirt[p], cloth, lists[p].tint, lists[p].n); r.drawMeshInst(rest[p], cloth, lists[p].plain, lists[p].n); }
}
