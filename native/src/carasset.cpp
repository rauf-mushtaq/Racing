#include "carasset.h"
#include <fstream>
#include <cstring>

bool CarAsset::load(Gfx& g, const std::string& path) {
  std::ifstream f(path, std::ios::binary); if (!f) { logf("car model %s not found (using the built-in model)", path.c_str()); return false; }
  char magic[4]; uint32_t ver = 0, nParts = 0; f.read(magic, 4); f.read((char*)&ver, 4); f.read((char*)&nParts, 4);
  if (!f || std::memcmp(magic, "SCM1", 4) != 0 || ver != 2 || nParts > 256) { logf("car model %s: bad header", path.c_str()); return false; }
  for (int w = 0; w < 4; w++) { float t[4]; f.read((char*)t, 16); wheelC[w][0] = t[0]; wheelC[w][1] = t[1]; wheelC[w][2] = t[2]; wheelR[w] = t[3]; }
  f.read((char*)bmin, 12); f.read((char*)bmax, 12); f.read((char*)steerPivot, 12); f.read((char*)steerAxis, 12);
  for (uint32_t p = 0; p < nParts && f; p++) {
    uint32_t role = 0, nv = 0, ni = 0; int32_t slot = -1; f.read((char*)&role, 4); f.read((char*)&slot, 4); f.read((char*)&nv, 4); f.read((char*)&ni, 4);
    if (!f || nv > 4000000 || ni > 12000000 || role >= (uint32_t)CR_COUNT || slot < -1 || slot > 3) { logf("car model %s: bad part %u", path.c_str(), p); return false; }
    MeshData m; m.v.resize(nv); m.i.resize(ni);
    static_assert(sizeof(MeshVertex) == 36, "the baked vertex layout is MeshVertex");
    f.read((char*)m.v.data(), (std::streamsize)nv * sizeof(MeshVertex)); f.read((char*)m.i.data(), (std::streamsize)ni * 4);
    if (!f) { logf("car model %s: truncated", path.c_str()); return false; }
    for (uint32_t k : m.i) if (k >= nv) { logf("car model %s: bad index", path.c_str()); return false; }
    GpuMesh gm = uploadMesh(g, m);
    if (slot < 0) body[role] = gm; else if (role == CR_TIRE) wheel[slot][0] = gm; else if (role == CR_RIM) wheel[slot][1] = gm; else if (role == CR_BRAKE) wheel[slot][2] = gm;
  }
  loaded = true; logf("car model %s: loaded", path.c_str()); return true;
}

static Mat4 rotationAxis(const float a[3], float ang) {   // Rodrigues: a right-handed turn of `ang` about the unit axis a
  float c = std::cos(ang), sn = std::sin(ang), t = 1 - c, x = a[0], y = a[1], z = a[2]; Mat4 r = Mat4::identity();
  r.m[0][0] = c + t * x * x; r.m[0][1] = t * x * y - sn * z; r.m[0][2] = t * x * z + sn * y;
  r.m[1][0] = t * x * y + sn * z; r.m[1][1] = c + t * y * y; r.m[1][2] = t * y * z - sn * x;
  r.m[2][0] = t * x * z - sn * y; r.m[2][1] = t * y * z + sn * x; r.m[2][2] = c + t * z * z; return r;
}

void CarAsset::draw(Renderer& r, const Mat4& M, const Vehicle* v, const float tint[3], bool braking, bool fromInside) const {
  Material paint; paint.type = 1; paint.tint[0] = tint[0]; paint.tint[1] = tint[1]; paint.tint[2] = tint[2];
  Material glass; glass.type = 3;
  Material trim; trim.type = 0; trim.rough = 0.62f; trim.metal = 0.08f; trim.twoSided = true;
  Material chrome; chrome.type = 0; chrome.rough = 0.16f; chrome.metal = 1.0f; chrome.twoSided = true;
  Material carbon; carbon.type = 0; carbon.rough = 0.3f; carbon.metal = 0.25f; carbon.twoSided = true;
  Material inside; inside.type = 0; inside.rough = 0.8f; inside.metal = 0.04f; inside.twoSided = true;
  Material head; head.type = 4; head.emissive = 2.4f; Material tail; tail.type = 4; tail.emissive = braking ? 8.0f : 1.8f;
  Material tire; tire.type = 0; tire.rough = 0.85f; tire.twoSided = true;
  Material rim; rim.type = 0; rim.rough = 0.22f; rim.metal = 0.95f; rim.twoSided = true;
  Material brake; brake.type = 0; brake.rough = 0.5f; brake.metal = 0.6f; brake.twoSided = true;
  auto D = [&](int role, const Material& m) { r.drawMeshMat(body[role], M, m); };
  D(CR_PAINT, paint); D(CR_TRIM, trim); D(CR_CARBON, carbon);
  if (!r.inShadow) {
    // The cabin is only worth drawing when the camera is close enough to see into it.
    Vec3 mid = transformPoint(M, Vec3(0, 0.8f, 0.3f)); bool closeBy = length(r.cam.pos - mid) < 14.0f;
    if (!fromInside) D(CR_GLASS, glass);
    D(CR_CHROME, chrome); D(CR_HEAD, head); D(CR_TAIL, tail);
    if (closeBy) {
      D(CR_INTERIOR, inside);
      float ang = v ? (float)v->steer * 7.0f : 0.0f;                       // lock to lock is about 480 degrees, the road wheels turn 0.6 rad
      Mat4 turn = mul(translation(steerPivot[0], steerPivot[1], steerPivot[2]), mul(rotationAxis(steerAxis, ang), translation(-steerPivot[0], -steerPivot[1], -steerPivot[2])));
      Material wheelM = inside; wheelM.rough = 0.55f;
      r.drawMeshMat(body[CR_STEER], mul(M, turn), wheelM);
    }
  }
  for (int i = 0; i < 4; i++) {
    float yoff = 0, spin = 0, steer = 0;
    if (v) { const Wheel& W = v->wheels[i]; yoff = (float)clampd(W.comp - v->cStatic[i], -0.12, 0.12); spin = (float)W.ang; if (i < 2) steer = (float)-v->steer; }
    Mat4 base = mul(M, translation(wheelC[i][0], wheelC[i][1] + yoff, wheelC[i][2]));
    if (steer != 0) base = mul(base, rotationY(steer));
    Mat4 wm = mul(base, rotationX(spin));
    r.drawMeshMat(wheel[i][0], wm, tire); r.drawMeshMat(wheel[i][1], wm, rim);
    if (!r.inShadow) r.drawMeshMat(wheel[i][2], base, brake);   // the brake disc steers with the wheel but does not spin (it would only blur)
  }
}
