// Sunset City (Unreal Engine 5): a person: a jointed figure built in code (a stand-in until you put a MetaHuman or your own skeletal mesh in; see unreal/README.md) and the poses that
// move it: standing, walking, running, punching, kicking, aiming a pistol, hands up, knocked down. Each part's mesh is built in its own joint's space; the Unreal side makes one
// component per part, parents them as listed here and turns each joint by the angles of the pose.
// Angles: pitch swings a hanging limb forwards (+X towards +Z), roll swings it out to the right side (towards +Y), yaw turns about Z. The Unreal side passes roll to the engine negated,
// because Unreal's positive roll tips the right side down.
#pragma once
#include "SCMesh.h"

namespace SC {

enum Joint : int { J_ROOT = 0, J_SPINE, J_NECK, J_HEAD, J_SHL, J_SHR, J_ELL, J_ELR, J_WRL, J_WRR, J_HIPL, J_HIPR, J_KNL, J_KNR, J_ANL, J_ANR, J_COUNT };
// "Left" is the character's left: the -Y side (X forward, Y right).

struct BodyStyle {
  double height = 178;                // cm
  double chest = 1.0, arm = 1.0, leg = 1.0, neck = 1.0, head = 1.0;      // build: muscular men have chest 1.3, arm 1.55, neck 1.35 ...
  Col skin{0.80f, 0.60f, 0.46f, 1}, shirt{0.2f, 0.25f, 0.4f, 1}, pants{0.12f, 0.13f, 0.17f, 1}, shoes{0.08f, 0.08f, 0.09f, 1}, hair{0.08f, 0.06f, 0.05f, 1};
  bool shortSleeves = false, female = false;
};
inline BodyStyle BruiserStyle(Col skin, Col shirt) { BodyStyle b; b.height = 188; b.chest = 1.32; b.arm = 1.6; b.leg = 1.25; b.neck = 1.4; b.head = 1.02; b.skin = skin; b.shirt = shirt; b.shortSleeves = true; return b; }

struct Part { Joint joint; Joint parent; V3 offset; Mesh mesh; };       // offset: where the joint is, in the parent joint's space
struct Rig { std::vector<Part> parts; double height = 178, footHeight = 0; };

inline Rig MakeRig(const BodyStyle& st) {
  Rig r; const double H = st.height; r.height = H; const double legL = 0.245 * H, ankleH = 0.04 * H;
  const double sh = 0.118 * H * (0.85 + 0.15 * st.chest);                  // half the shoulder width
  auto part = [&](Joint j, Joint p, V3 off) -> Mesh& { r.parts.push_back({j, p, off, Mesh{}}); return r.parts.back().mesh; };
  Col skin = st.skin, shirt = st.shirt, pants = st.pants, shoes = st.shoes, hair = st.hair;
  skin.a = float(MAT_SKIN); shirt.a = pants.a = float(MAT_CLOTH); shoes.a = float(MAT_LEATHER); hair.a = float(MAT_HAIR);       // each is its own material: skin, cloth, hair, leather
  const Col sleeve = st.shortSleeves ? skin : shirt;
  // pelvis
  { Mesh& m = part(J_ROOT, J_ROOT, {0, 0, 2 * legL + ankleH}); m.Sphere({0, 0, 0}, 0.058 * H, 6, 12, pants, 0.9 * (0.9 + 0.1 * st.chest), 1.55, 0.95); }
  // torso (an ellipsoid chest on a waist), neck, head, hair
  { Mesh& m = part(J_SPINE, J_ROOT, {0, 0, 0.02 * H});
    m.Sphere({0, 0, 0.13 * H}, 0.11 * H, 8, 14, shirt, 0.62 * st.chest, 1.05 * st.chest, 1.18);
    m.Sphere({0, 0, 0.04 * H}, 0.075 * H, 6, 12, shirt, 0.8 + 0.1 * st.chest, 1.2 + 0.2 * st.chest, 1.0); }
  { Mesh& m = part(J_NECK, J_SPINE, {0, 0, 0.27 * H}); m.Cylinder({0, 0, 0}, 0.024 * H * st.neck, 0.05 * H, 10, skin, true); }
  { Mesh& m = part(J_HEAD, J_NECK, {0, 0, 0.045 * H});
    m.Sphere({0.004 * H, 0, 0.06 * H}, 0.058 * H * st.head, 8, 14, skin, 1.0, 0.88, 1.12);
    if (!st.female) m.Sphere({-0.004 * H, 0, 0.075 * H}, 0.06 * H * st.head, 6, 14, hair, 1.0, 0.95, 0.75);
    else { m.Sphere({-0.004 * H, 0, 0.072 * H}, 0.062 * H * st.head, 6, 14, hair, 1.05, 1.0, 0.9); m.Sphere({-0.03 * H, 0, 0.02 * H}, 0.045 * H, 6, 12, hair, 0.8, 1.0, 1.9); } }
  for (int side = 0; side < 2; side++) {                                     // 0: left (-Y), 1: right (+Y)
    const double s = side ? 1 : -1; const Joint jSh = side ? J_SHR : J_SHL, jEl = side ? J_ELR : J_ELL, jWr = side ? J_WRR : J_WRL, jHip = side ? J_HIPR : J_HIPL, jKn = side ? J_KNR : J_KNL, jAn = side ? J_ANR : J_ANL;
    const double ua = 0.17 * H, fa = 0.155 * H, ar = 0.031 * H * st.arm;
    { Mesh& m = part(jSh, J_SPINE, {0, s * sh * (0.9 + 0.12 * st.chest), 0.255 * H}); m.Sphere({0, 0, 0}, ar * 1.2, 6, 10, sleeve);
      m.Frustum({0, 0, -ua}, ar * 0.85, ar * 1.05, ua, 10, sleeve, false, false); }
    { Mesh& m = part(jEl, jSh, {0, 0, -ua}); m.Sphere({0, 0, 0}, ar * 0.85, 6, 10, st.shortSleeves ? skin : shirt);
      m.Frustum({0, 0, -fa}, ar * 0.62, ar * 0.8, fa, 10, st.shortSleeves ? skin : shirt, false, false); if (st.shortSleeves) m.Frustum({0, 0, -fa}, ar * 0.62, ar * 0.8, fa, 10, skin, false, false); }
    { Mesh& m = part(jWr, jEl, {0, 0, -fa}); m.Sphere({0, 0, -0.035 * H}, 0.03 * H, 6, 10, skin, 0.8, 0.55, 1.5); }
    const double th = 0.055 * H * st.leg;
    { Mesh& m = part(jHip, J_ROOT, {0, s * 0.052 * H * (0.9 + 0.1 * st.leg), 0}); m.Sphere({0, 0, 0}, th * 1.05, 6, 10, pants); m.Frustum({0, 0, -legL}, th * 0.68, th, legL, 10, pants, false, false); }
    { Mesh& m = part(jKn, jHip, {0, 0, -legL}); m.Sphere({0, 0, 0}, th * 0.68, 6, 10, pants); m.Frustum({0, 0, -legL}, th * 0.52, th * 0.68, legL, 10, pants, false, false); }
    { Mesh& m = part(jAn, jKn, {0, 0, -legL}); m.Box({-0.03 * H, -0.024 * H, -ankleH}, {0.11 * H, 0.024 * H, 0.012 * H}, shoes); m.Sphere({0.01 * H, 0, -0.01 * H}, 0.026 * H, 5, 8, shoes); }
  }
  r.footHeight = ankleH; return r;
}

struct Pose {
  V3 rootOffset{0, 0, 0}; double rootPitch = 0, rootRoll = 0, rootYaw = 0;       // the whole body, from the pelvis
  double pitch[J_COUNT] = {0}, roll[J_COUNT] = {0}, yaw[J_COUNT] = {0};
};

// Forward kinematics (the same as what the Unreal components do): where each joint ends up, relative to the root's foot point (the ground under the figure).
struct M3 { double m[3][3]; };
inline M3 Mul(const M3& a, const M3& b) { M3 r; for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) { r.m[i][j] = 0; for (int k = 0; k < 3; k++) r.m[i][j] += a.m[i][k] * b.m[k][j]; } return r; }
inline V3 Mul(const M3& a, const V3& v) { return {a.m[0][0] * v.x + a.m[0][1] * v.y + a.m[0][2] * v.z, a.m[1][0] * v.x + a.m[1][1] * v.y + a.m[1][2] * v.z, a.m[2][0] * v.x + a.m[2][1] * v.y + a.m[2][2] * v.z}; }
inline M3 RotEuler(double pitch, double yaw, double roll) {                         // yaw about Z * pitch about Y * roll about X (roll in this file's sense: +Y towards -Z? no: see below)
  double cp = std::cos(pitch), sp = std::sin(pitch), cy = std::cos(yaw), sy = std::sin(yaw), cr = std::cos(roll), sr = std::sin(roll);
  M3 rx{{{1, 0, 0}, {0, cr, sr}, {0, -sr, cr}}};                                    // roll: a hanging limb (-Z) swings out to +Y for positive roll
  M3 ry{{{cp, 0, -sp}, {0, 1, 0}, {sp, 0, cp}}}, rz{{{cy, -sy, 0}, {sy, cy, 0}, {0, 0, 1}}};
  return Mul(rz, Mul(ry, rx));
}
struct Skeleton { V3 pos[J_COUNT]; M3 rot[J_COUNT]; };
inline Skeleton FK(const Rig& rig, const Pose& p) {
  Skeleton s; M3 rootR = RotEuler(p.rootPitch, p.rootYaw, p.rootRoll);
  for (const Part& pt : rig.parts) {
    const int j = pt.joint; M3 local = RotEuler(p.pitch[j], p.yaw[j], p.roll[j]);
    if (j == J_ROOT) { s.rot[j] = Mul(rootR, local); s.pos[j] = pt.offset + p.rootOffset; continue; }
    const int pj = pt.parent; s.rot[j] = Mul(s.rot[pj], local); s.pos[j] = s.pos[pj] + Mul(s.rot[pj], pt.offset);
  }
  return s;
}

// Plant the feet: raise the whole figure so that neither foot goes below the ground (a stride that swings a straight leg would otherwise sink the stance foot).
inline void PlantFeet(const Rig& rig, Pose& p) {
  Skeleton s = FK(rig, p); double low = std::min(s.pos[J_ANL].z, s.pos[J_ANR].z) - rig.footHeight; if (low < 0) p.rootOffset.z -= low;
}

// ---- Poses ----
inline Pose PoseStand(double t, double H = 178) {
  Pose p; double b = std::sin(t * 1.7);
  p.pitch[J_SPINE] = 0.012 * b; p.pitch[J_HEAD] = -0.01 * b; p.roll[J_SHL] = -0.06; p.roll[J_SHR] = 0.06; p.pitch[J_ELL] = p.pitch[J_ELR] = 0.12; p.rootOffset.z = -0.0006 * H * b;
  p.roll[J_HIPL] = -0.02; p.roll[J_HIPR] = 0.02; return p;
}
// A walking or running stride: phase in radians (one whole step cycle is 2 pi), speed01: 0 (standing) .. 1 (a jog) .. 1.6 (a sprint).
inline Pose PoseWalk(double phase, double speed01, double H = 178) {
  Pose p = PoseStand(phase * 0.2, H); double k = Clamp(speed01, 0, 1.7), sw = std::sin(phase), cw = std::cos(phase);
  double amp = 0.32 + 0.34 * k;                                             // how far a leg swings
  p.pitch[J_HIPL] = amp * sw; p.pitch[J_HIPR] = -amp * sw;
  p.pitch[J_KNL] = -(0.1 + (0.5 + 0.5 * k) * std::max(0.0, -cw * sw * 0 + std::sin(phase + 1.2)));   // the knee bends while the leg swings forward
  p.pitch[J_KNR] = -(0.1 + (0.5 + 0.5 * k) * std::max(0.0, std::sin(phase + 1.2 + kPi)));
  p.pitch[J_SHL] = -amp * 0.9 * sw; p.pitch[J_SHR] = amp * 0.9 * sw; p.roll[J_SHL] = -0.08; p.roll[J_SHR] = 0.08;
  p.pitch[J_ELL] = 0.25 + 0.5 * k * std::max(0.0, sw); p.pitch[J_ELR] = 0.25 + 0.5 * k * std::max(0.0, -sw);
  p.pitch[J_SPINE] = 0.04 + 0.16 * k; p.yaw[J_SPINE] = 0.12 * k * sw; p.rootYaw = -0.05 * k * sw; p.pitch[J_HEAD] = -0.05 - 0.1 * k;
  p.rootOffset.z = -0.012 * H * k * (1 + std::cos(2 * phase)) * 0.5 - 0.004 * H * k; p.rootPitch = 0.02 + 0.05 * k;
  p.pitch[J_ANL] = 0.2 * std::sin(phase + 2.2) * (0.4 + k * 0.4); p.pitch[J_ANR] = 0.2 * std::sin(phase + 2.2 + kPi) * (0.4 + k * 0.4);
  return p;
}
enum class Blow : int { None = 0, Jab, Cross, Hook, Kick };
// A punch or kick: k from 0 (start) to 1 (finished); the fist or boot lands at `hit` (0..1) of the way through. leftHanded: jab with the left arm.
inline Pose PoseBlow(Blow b, double k, double hit = 0.45, double H = 178) {
  Pose p = PoseStand(0.0, H); k = Saturate(k); if (b == Blow::None) return p;
  // the boxer's stance: feet apart, knees bent, fists up
  p.roll[J_HIPL] = -0.18; p.roll[J_HIPR] = 0.18; p.pitch[J_HIPL] = 0.12; p.pitch[J_HIPR] = -0.16; p.pitch[J_KNL] = p.pitch[J_KNR] = -0.3; p.rootOffset.z = -0.03 * H; p.pitch[J_SPINE] = 0.12;
  p.pitch[J_SHL] = 1.25; p.pitch[J_SHR] = 1.25; p.pitch[J_ELL] = 2.0; p.pitch[J_ELR] = 2.0; p.roll[J_SHL] = -0.35; p.roll[J_SHR] = 0.35;
  double w = k < hit ? SmoothStep(0, hit, k) : 1.0 - SmoothStep(hit, 1.0, k);                  // 0 -> 1 at the moment of the blow -> 0 again
  double wind = k < hit ? std::sin(Saturate(k / hit) * kPi) * 0.5 : 0;                          // pulling the fist back a little before the throw
  if (b == Blow::Jab || b == Blow::Cross || b == Blow::Hook) {
    bool right = b != Blow::Jab; Joint sh = right ? J_SHR : J_SHL, el = right ? J_ELR : J_ELL; double sgn = right ? 1 : -1;
    p.pitch[sh] = Lerp(1.25, 1.52, w) - wind * 0.5; p.pitch[el] = Lerp(2.0, 0.08, w) + wind * 0.4; p.roll[sh] = sgn * Lerp(0.35, b == Blow::Hook ? 1.1 : 0.05, w);
    p.yaw[J_SPINE] = (right ? -1 : 1) * 0.5 * w * (b == Blow::Hook ? 1.5 : 1.0); p.rootYaw = (right ? -1 : 1) * 0.12 * w; p.rootPitch = 0.1 * w;
  } else if (b == Blow::Kick) {
    p.pitch[J_SHL] = 0.5; p.pitch[J_SHR] = 0.2; p.pitch[J_ELL] = p.pitch[J_ELR] = 1.0; p.roll[J_SHL] = -0.5; p.roll[J_SHR] = 0.5;
    p.pitch[J_HIPR] = Lerp(-0.16, 1.45, w) + (k < hit ? -wind * 0.6 : 0); p.pitch[J_KNR] = Lerp(-0.3, k < hit * 0.7 ? -1.6 : -0.1, SmoothStep(0, hit, k)) * (k < hit ? 1.0 : 1.0);
    if (k >= hit * 0.7 && k < hit) p.pitch[J_KNR] = Lerp(-1.6, -0.1, SmoothStep(hit * 0.7, hit, k)); else if (k >= hit) p.pitch[J_KNR] = Lerp(-0.1, -0.3, SmoothStep(hit, 1, k));
    p.rootPitch = -0.28 * w; p.pitch[J_SPINE] = -0.1 * w; p.pitch[J_HIPL] = 0.05; p.rootOffset.z = -0.02 * H * (1 - w * 0.5);
  }
  return p;
}
// Aiming a pistol (two hands); pitch: up or down, radians.
inline Pose PoseAim(double pitch, double H = 178) {
  Pose p = PoseStand(0.0, H); p.pitch[J_SHR] = 1.5 + pitch; p.pitch[J_ELR] = 0.1; p.roll[J_SHR] = 0.05; p.pitch[J_SHL] = 1.35 + pitch; p.pitch[J_ELL] = 0.6; p.roll[J_SHL] = -0.35; p.yaw[J_SPINE] = -0.12;
  p.pitch[J_HIPL] = 0.1; p.pitch[J_HIPR] = -0.15; p.roll[J_HIPL] = -0.12; p.roll[J_HIPR] = 0.12; p.pitch[J_SPINE] = 0.05; p.pitch[J_HEAD] = -pitch * 0.4; return p;
}
inline Pose PoseHandsUp(double t, double H = 178) {
  Pose p = PoseStand(t, H); p.pitch[J_SHL] = p.pitch[J_SHR] = 2.9; p.roll[J_SHL] = -0.25; p.roll[J_SHR] = 0.25; p.pitch[J_ELL] = p.pitch[J_ELR] = 0.5; p.pitch[J_SPINE] = -0.04; return p;
}
// Knocked down: lying on the back (t from 0, just hit, to 1, on the floor).
inline Pose PoseDown(double t, double H = 178) {
  Pose p = PoseStand(0.0, H); double k = SmoothStep(0, 1, t); p.rootPitch = -1.5 * k; p.rootOffset.z = -(0.53 * H - 0.07 * H) * k; p.rootOffset.x = -0.2 * H * k;
  p.pitch[J_SHL] = -0.4 * k; p.pitch[J_SHR] = 0.4 * k; p.roll[J_SHL] = -0.5 * k; p.roll[J_SHR] = 0.5 * k; p.pitch[J_KNL] = -0.5 * k; p.pitch[J_KNR] = -0.2 * k; p.roll[J_HIPL] = -0.12 * k; p.roll[J_HIPR] = 0.14 * k; return p;
}
inline Pose PoseStagger(double t, double H = 178) { Pose p = PoseStand(t, H); p.rootPitch = -0.28; p.pitch[J_SHL] = p.pitch[J_SHR] = -0.8; p.roll[J_SHL] = -0.8; p.roll[J_SHR] = 0.8; p.pitch[J_SPINE] = -0.2; return p; }

}  // namespace SC
