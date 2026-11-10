// Sunset City (Unreal Engine 5): a mesh builder. Everything in the city that is not an imported asset (the roads, the buildings, the palms, the car, the people) is built from
// the pieces here and handed to Unreal as procedural mesh sections. Faces follow Unreal's rule: a triangle is seen from the front when its corners run CLOCKWISE, which for the
// corners a, b, c means the front is the side Cross(b - a, c - a) points to. Every builder below keeps to it, and Check() proves it (the normals agree with the winding).
#pragma once
#include "SCMath.h"

namespace SC {

// What a quad of the car body (or anything else with several materials) is made of: stored in the colour's alpha, so one mesh can be split into sections by material.
enum Mat : int {
  MAT_PAINT = 0, MAT_GLASS = 1, MAT_TRIM = 2, MAT_LIGHT = 3, MAT_CHROME = 4, MAT_TYRE = 5,                            // cars
  MAT_WALL = 6, MAT_ROOF, MAT_STONE, MAT_ASPHALT, MAT_LAWN, MAT_SAND, MAT_WATER, MAT_FOLIAGE, MAT_BARK, MAT_WOOD,    // the city
  MAT_METAL, MAT_FABRIC, MAT_GLOW, MAT_LINE, MAT_TILE, MAT_WINDOW,                                                     // (a window is glass that lights up at night, floor by floor)
  MAT_SKIN, MAT_CLOTH, MAT_HAIR, MAT_LEATHER,                                                                          // people
  MAT_COUNT };

struct MeshCheck { bool ok = true; std::string err; int degenerate = 0, flipped = 0; V3 mn{}, mx{}; };

struct Mesh {
  std::vector<V3> P, N;
  std::vector<V2> UV;
  std::vector<Col> C;
  std::vector<int32_t> I;

  size_t Tris() const { return I.size() / 3; }
  bool Empty() const { return I.empty(); }
  void Clear() { P.clear(); N.clear(); UV.clear(); C.clear(); I.clear(); }
  int32_t Vert(const V3& p, const V3& n, const V2& uv, const Col& c) { P.push_back(p); N.push_back(n); UV.push_back(uv); C.push_back(c); return int32_t(P.size()) - 1; }
  void Tri(int32_t a, int32_t b, int32_t c) { I.push_back(a); I.push_back(b); I.push_back(c); }

  // The texture coordinates of a point on a face: world metres along the two axes of the face (so a pattern runs on unbroken from one box to the next).
  static V2 UVWorld(const V3& p, const V3& n, double uvm) {
    double ax = std::fabs(n.x), ay = std::fabs(n.y), az = std::fabs(n.z);
    if (ax >= ay && ax >= az) return {p.y / uvm, p.z / uvm};
    if (ay >= az) return {p.x / uvm, p.z / uvm};
    return {p.x / uvm, p.y / uvm};
  }
  // A flat face a, b, c, d (in that order), front towards Cross(b - a, c - a).
  void Quad(const V3& a, const V3& b, const V3& c, const V3& d, const Col& col, double uvm = 100.0) {
    V3 n = Norm(Cross(b - a, c - a));
    int32_t ia = Vert(a, n, UVWorld(a, n, uvm), col), ib = Vert(b, n, UVWorld(b, n, uvm), col), ic = Vert(c, n, UVWorld(c, n, uvm), col), id = Vert(d, n, UVWorld(d, n, uvm), col);
    Tri(ia, ib, ic); Tri(ia, ic, id);
  }
  // A face given by a corner and two edge vectors u and v: front towards Cross(u, v).
  void Face(const V3& o, const V3& u, const V3& v, const Col& col, double uvm = 100.0) { Quad(o, o + u, o + u + v, o + v, col, uvm); }
  // A flat triangle, front towards Cross(b - a, c - a).
  void Triangle(const V3& a, const V3& b, const V3& c, const Col& col, double uvm = 100.0) {
    V3 n = Norm(Cross(b - a, c - a));
    Tri(Vert(a, n, UVWorld(a, n, uvm), col), Vert(b, n, UVWorld(b, n, uvm), col), Vert(c, n, UVWorld(c, n, uvm), col));
  }

  // An axis-aligned box. `faces` picks which sides are made: bit 0 +X, 1 -X, 2 +Y, 3 -Y, 4 +Z (the top), 5 -Z (the bottom).
  void Box(const V3& mn, const V3& mx, const Col& col, uint32_t faces = 63, double uvm = 100.0) {
    V3 d = mx - mn;
    if (faces & 1) Face({mx.x, mn.y, mn.z}, {0, d.y, 0}, {0, 0, d.z}, col, uvm);
    if (faces & 2) Face({mn.x, mn.y, mn.z}, {0, 0, d.z}, {0, d.y, 0}, col, uvm);
    if (faces & 4) Face({mn.x, mx.y, mn.z}, {0, 0, d.z}, {d.x, 0, 0}, col, uvm);
    if (faces & 8) Face({mn.x, mn.y, mn.z}, {d.x, 0, 0}, {0, 0, d.z}, col, uvm);
    if (faces & 16) Face({mn.x, mn.y, mx.z}, {d.x, 0, 0}, {0, d.y, 0}, col, uvm);
    if (faces & 32) Face({mn.x, mn.y, mn.z}, {0, d.y, 0}, {d.x, 0, 0}, col, uvm);
  }
  // A box turned about the vertical axis (its centre at c, size s = x, y, z extents, the base on c.z - s.z / 2).
  void OrientedBox(const V3& c, const V3& s, double yaw, const Col& col, uint32_t faces = 63, double uvm = 100.0) {
    Mesh m; m.Box({-s.x / 2, -s.y / 2, -s.z / 2}, {s.x / 2, s.y / 2, s.z / 2}, col, faces, uvm); Append(m, c, yaw, 1.0);
  }
  // A cone or cylinder standing on `base`: radius r0 at the bottom, r1 at the top, with smooth sides.
  void Frustum(const V3& base, double r0, double r1, double h, int seg, const Col& col, bool capBottom = true, bool capTop = true, double uvm = 100.0) {
    seg = std::max(3, seg);
    std::vector<int32_t> lo, hi;
    for (int i = 0; i <= seg; i++) {
      double a = 2 * kPi * i / seg, ca = std::cos(a), sa = std::sin(a);
      V3 n = Norm({ca * h, sa * h, r0 - r1}, {ca, sa, 0});
      double u = (2 * kPi * (r0 + r1) / 2) * i / seg / uvm;
      lo.push_back(Vert({base.x + ca * r0, base.y + sa * r0, base.z}, n, {u, 0}, col));
      hi.push_back(Vert({base.x + ca * r1, base.y + sa * r1, base.z + h}, n, {u, h / uvm}, col));
    }
    for (int i = 0; i < seg; i++) { if (r0 > 1e-6) Tri(lo[i], lo[i + 1], hi[i + 1]); if (r1 > 1e-6) Tri(lo[i], hi[i + 1], hi[i]); }
    auto cap = [&](double z, double r, bool top) {
      int32_t c = Vert({base.x, base.y, z}, {0, 0, top ? 1.0 : -1.0}, {0.5, 0.5}, col); std::vector<int32_t> ring;
      for (int i = 0; i <= seg; i++) { double a = 2 * kPi * i / seg; ring.push_back(Vert({base.x + std::cos(a) * r, base.y + std::sin(a) * r, z}, {0, 0, top ? 1.0 : -1.0}, {0.5 + std::cos(a) * 0.5, 0.5 + std::sin(a) * 0.5}, col)); }
      for (int i = 0; i < seg; i++) { if (top) Tri(c, ring[i], ring[i + 1]); else Tri(c, ring[i + 1], ring[i]); }
    };
    if (capBottom && r0 > 1e-6) cap(base.z, r0, false);
    if (capTop && r1 > 1e-6) cap(base.z + h, r1, true);
  }
  void Cylinder(const V3& base, double r, double h, int seg, const Col& col, bool caps = true, double uvm = 100.0) { Frustum(base, r, r, h, seg, col, caps, caps, uvm); }
  // A cylinder between two points (a limb, a pole lying down, an axle).
  void Between(const V3& a, const V3& b, double r0, double r1, int seg, const Col& col, bool caps = true) {
    V3 d = b - a; double L = Len(d); if (L < 1e-9) return;
    V3 z = d * (1.0 / L), x = Norm(std::fabs(z.z) < 0.99 ? Cross(V3{0, 0, 1}, z) : Cross(V3{1, 0, 0}, z)), y = Cross(z, x);
    Mesh m; m.Frustum({0, 0, 0}, r0, r1, L, seg, col, caps, caps);
    for (size_t i = 0; i < m.P.size(); i++) {
      V3 p = m.P[i], n = m.N[i]; m.P[i] = a + x * p.x + y * p.y + z * p.z; m.N[i] = Norm(x * n.x + y * n.y + z * n.z);
    }
    Append(m);
  }
  // A ball (heads, hands, joints).
  void Sphere(const V3& c, double r, int rings, int seg, const Col& col, double sx = 1, double sy = 1, double sz = 1) {
    rings = std::max(2, rings); seg = std::max(3, seg);
    std::vector<std::vector<int32_t>> g;
    for (int j = 0; j <= rings; j++) {
      double t = kPi * j / rings, st = std::sin(t), ct = std::cos(t); std::vector<int32_t> row;
      for (int i = 0; i <= seg; i++) {
        double a = 2 * kPi * i / seg, ca = std::cos(a), sa = std::sin(a);
        V3 n = Norm({st * ca / sx, st * sa / sy, ct / sz}); row.push_back(Vert({c.x + r * sx * st * ca, c.y + r * sy * st * sa, c.z + r * sz * ct}, n, {double(i) / seg, double(j) / rings}, col));
      }
      g.push_back(row);
    }
    // j runs from the top (+Z) to the bottom; a quad (j,i) (j,i+1) (j+1,i+1) (j+1,i) must face outwards: the front is Cross(b - a, c - a).
    for (int j = 0; j < rings; j++) for (int i = 0; i < seg; i++) {
      int32_t a = g[j][i], b = g[j + 1][i], c2 = g[j + 1][i + 1], d = g[j][i + 1];
      if (j < rings - 1) Tri(a, b, c2);                       // (at the bottom pole b and c2 are the same point)
      if (j > 0) Tri(a, c2, d);                               // (at the top pole a and d are the same point)
    }
  }
  // A flat disc facing up or down.
  void Disc(const V3& c, double r, int seg, const Col& col, bool up = true) {
    int32_t m = Vert(c, {0, 0, up ? 1.0 : -1.0}, {0.5, 0.5}, col); std::vector<int32_t> ring;
    for (int i = 0; i <= seg; i++) { double a = 2 * kPi * i / seg; ring.push_back(Vert({c.x + std::cos(a) * r, c.y + std::sin(a) * r, c.z}, {0, 0, up ? 1.0 : -1.0}, {0.5 + std::cos(a) * 0.5, 0.5 + std::sin(a) * 0.5}, col)); }
    for (int i = 0; i < seg; i++) { if (up) Tri(m, ring[i], ring[i + 1]); else Tri(m, ring[i + 1], ring[i]); }
  }
  // A vertical prism standing on a CONVEX polygon (corners counter-clockwise seen from above in the maths sense, x towards y), from z0 to z1.
  void Prism(const std::vector<V2>& poly, double z0, double z1, const Col& col, bool capTop = true, bool capBottom = false, double uvm = 100.0) {
    size_t n = poly.size(); if (n < 3) return;
    for (size_t i = 0; i < n; i++) { V2 a = poly[i], b = poly[(i + 1) % n]; Quad({a.x, a.y, z0}, {b.x, b.y, z0}, {b.x, b.y, z1}, {a.x, a.y, z1}, col, uvm); }
    V3 c{0, 0, 0}; for (auto& p : poly) { c.x += p.x / n; c.y += p.y / n; }
    for (int top = 1; top >= 0; top--) {
      if ((top && !capTop) || (!top && !capBottom)) continue;
      double z = top ? z1 : z0; c.z = z;
      for (size_t i = 0; i < n; i++) { V2 a = poly[i], b = poly[(i + 1) % n]; if (top) Triangle(c, {a.x, a.y, z}, {b.x, b.y, z}, col, uvm); else Triangle(c, {b.x, b.y, z}, {a.x, a.y, z}, col, uvm); }
    }
  }

  // Add another mesh (scaled, turned about Z, then moved).
  void Append(const Mesh& o, const V3& off = {0, 0, 0}, double yaw = 0, double scale = 1.0) {
    int32_t base = int32_t(P.size()); double c = std::cos(yaw), s = std::sin(yaw);
    for (size_t i = 0; i < o.P.size(); i++) {
      V3 p = o.P[i] * scale, n = o.N[i];
      P.push_back({p.x * c - p.y * s + off.x, p.x * s + p.y * c + off.y, p.z + off.z}); N.push_back({n.x * c - n.y * s, n.x * s + n.y * c, n.z}); UV.push_back(o.UV[i]); C.push_back(o.C[i]);
    }
    for (int32_t k : o.I) I.push_back(k + base);
  }
  // Mirror across the plane y = 0 (the other side of a car): the winding is turned round so the faces still face outwards.
  void MirrorY() {
    for (auto& p : P) p.y = -p.y;
    for (auto& n : N) n.y = -n.y;
    for (size_t t = 0; t + 2 < I.size(); t += 3) std::swap(I[t + 1], I[t + 2]);
  }
  // Move every vertex (used to build a thing at its own origin and then place it).
  void Translate(const V3& d) { for (auto& p : P) p += d; }
  void Recolour(const Col& c) { for (auto& k : C) { float a = k.a; k = c; k.a = a; } }
  // Mark the whole mesh as made of one material (the colour's alpha, see Mat above).
  void SetMat(int mat) { for (auto& k : C) k.a = float(mat); }
  // The volume a closed mesh encloses (positive when the faces point outwards): a check on the winding of whole buildings and props.
  double Volume() const { double v = 0; for (size_t t = 0; t + 2 < I.size(); t += 3) v += Dot(P[size_t(I[t])], Cross(P[size_t(I[t + 1])], P[size_t(I[t + 2])])); return v / 6.0; }

  // The pieces of this mesh that are made of material m (the alpha of the colour): a new mesh with its own vertices.
  Mesh Part(int m) const {
    Mesh out; std::vector<int32_t> map(P.size(), -1);
    for (size_t t = 0; t + 2 < I.size(); t += 3) {
      int mat = int(std::lround(C[I[t]].a)); if (mat != m) continue;
      for (int k = 0; k < 3; k++) { int32_t v = I[t + k]; if (map[v] < 0) { map[v] = out.Vert(P[v], N[v], UV[v], C[v]); out.C.back().a = 1.f; } out.I.push_back(map[v]); }
    }
    return out;
  }
  // Which materials occur in the mesh (bit m is set when some triangle is made of material m): the engine side splits a mesh only into the sections it really has.
  uint64_t MaterialsPresent() const { uint64_t mask = 0; for (size_t t = 0; t + 2 < I.size(); t += 3) { int m = int(std::lround(C[size_t(I[t])].a)); if (m >= 0 && m < 63) mask |= (uint64_t(1) << m); } return mask; }
  // Does the mesh follow the rules (every index real, nothing not-a-number, unit normals, and every triangle facing the way its normals say)?
  MeshCheck Check() const {
    MeshCheck r;
    auto fail = [&](const std::string& e) { if (r.ok) r.err = e; r.ok = false; };
    if (N.size() != P.size() || UV.size() != P.size() || C.size() != P.size()) fail("array sizes differ");
    if (I.size() % 3) fail("index count is not a multiple of 3");
    if (!P.empty()) { r.mn = r.mx = P[0]; }
    for (size_t i = 0; i < P.size() && r.ok; i++) {
      if (!Finite(P[i]) || !Finite(N[i])) { fail("not a number in vertex " + std::to_string(i)); break; }
      double nl = Len(N[i]); if (nl < 0.98 || nl > 1.02) fail("normal " + std::to_string(i) + " is not a unit vector (" + std::to_string(nl) + ")");
      r.mn = {std::min(r.mn.x, P[i].x), std::min(r.mn.y, P[i].y), std::min(r.mn.z, P[i].z)}; r.mx = {std::max(r.mx.x, P[i].x), std::max(r.mx.y, P[i].y), std::max(r.mx.z, P[i].z)};
    }
    for (int32_t k : I) if (k < 0 || size_t(k) >= P.size()) { fail("an index is out of range"); break; }
    if (!r.ok) return r;
    for (size_t t = 0; t + 2 < I.size(); t += 3) {
      V3 a = P[I[t]], b = P[I[t + 1]], c = P[I[t + 2]], g = Cross(b - a, c - a); double area = Len(g);
      if (area < 1e-6) { r.degenerate++; continue; }
      V3 n = N[I[t]] + N[I[t + 1]] + N[I[t + 2]]; if (Dot(g, n) <= 0) r.flipped++;
    }
    if (r.flipped) fail(std::to_string(r.flipped) + " triangles face away from their normals");
    return r;
  }
};

}  // namespace SC
