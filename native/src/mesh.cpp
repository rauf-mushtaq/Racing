#include "mesh.h"

void MeshData::quad(Vec3 a, Vec3 b, Vec3 c, Vec3 d, uint32_t col, float u0, float v0, float u1, float v1) {
  Vec3 n = normalize(cross(b - a, d - a));
  uint32_t ia = add(a, n, col, u0, v0), ib = add(b, n, col, u1, v0), ic = add(c, n, col, u1, v1), id = add(d, n, col, u0, v1);
  tri(ia, ib, ic); tri(ia, ic, id);
}
void MeshData::box(Vec3 mn, Vec3 mx, uint32_t col) {
  Vec3 p[8] = { {mn.x, mn.y, mn.z}, {mx.x, mn.y, mn.z}, {mx.x, mx.y, mn.z}, {mn.x, mx.y, mn.z}, {mn.x, mn.y, mx.z}, {mx.x, mn.y, mx.z}, {mx.x, mx.y, mx.z}, {mn.x, mx.y, mx.z} };
  quad(p[4], p[5], p[6], p[7], col);   // +z
  quad(p[1], p[0], p[3], p[2], col);   // -z
  quad(p[5], p[1], p[2], p[6], col);   // +x
  quad(p[0], p[4], p[7], p[3], col);   // -x
  quad(p[7], p[6], p[2], p[3], col);   // +y
  quad(p[0], p[1], p[5], p[4], col);   // -y
}
void MeshData::cylinder(Vec3 a, Vec3 b, float r0, float r1, int seg, uint32_t col, bool capA, bool capB) {
  Vec3 ax = normalize(b - a), t = std::fabs(ax.y) < 0.9f ? Vec3(0, 1, 0) : Vec3(1, 0, 0), u = normalize(cross(ax, t)), w = cross(ax, u);
  uint32_t base = (uint32_t)v.size();
  for (int s = 0; s <= seg; s++) {
    float ang = (float)(2 * PI * s / seg), c = std::cos(ang), sn = std::sin(ang); Vec3 d = u * c + w * sn;
    float slope = (r0 - r1) / std::max(0.001f, length(b - a)); Vec3 n = normalize(d + ax * slope);
    add(a + d * r0, n, col, (float)s / seg, 0); add(b + d * r1, n, col, (float)s / seg, 1);
  }
  for (int s = 0; s < seg; s++) { uint32_t i0 = base + s * 2; tri(i0, i0 + 1, i0 + 3); tri(i0, i0 + 3, i0 + 2); }
  auto cap = [&](Vec3 c, float r, Vec3 n) {
    uint32_t cc = add(c, n, col), first = (uint32_t)v.size();
    for (int s = 0; s <= seg; s++) { float ang = (float)(2 * PI * s / seg); add(c + (u * std::cos(ang) + w * std::sin(ang)) * r, n, col); }
    for (int s = 0; s < seg; s++) { if (dot(n, ax) > 0) tri(cc, first + s, first + s + 1); else tri(cc, first + s + 1, first + s); }
  };
  if (capA) cap(a, r0, ax * -1.0f); if (capB) cap(b, r1, ax);
}
void MeshData::lathe(const std::vector<std::array<float, 2>>& prof, int seg, uint32_t col, Vec3 centre) {
  std::vector<std::vector<Vec3>> rings;
  for (auto& p : prof) { std::vector<Vec3> ring; for (int s = 0; s < seg; s++) { float a = (float)(2 * PI * s / seg); ring.push_back(centre + Vec3(p[0], std::cos(a) * p[1], std::sin(a) * p[1])); } rings.push_back(ring); }
  loft(rings, col, prof.front()[1] > 0.001f, prof.back()[1] > 0.001f);
}
void MeshData::loft(const std::vector<std::vector<Vec3>>& rings, uint32_t col, bool capStart, bool capEnd) {
  size_t R = rings.size(), N = rings[0].size(); uint32_t base = (uint32_t)v.size(); size_t first = i.size();
  for (size_t r = 0; r < R; r++) for (size_t k = 0; k < N; k++) add(rings[r][k], Vec3(0, 1, 0), col, (float)k / N, (float)r / (R - 1));
  Vec3 centroid; for (auto& rg : rings) for (auto& p : rg) centroid += p; centroid = centroid * (1.0f / (float)(R * N));
  for (size_t r = 0; r + 1 < R; r++) for (size_t k = 0; k < N; k++) {
    uint32_t a = base + (uint32_t)(r * N + k), b = base + (uint32_t)(r * N + (k + 1) % N), c = base + (uint32_t)((r + 1) * N + (k + 1) % N), d = base + (uint32_t)((r + 1) * N + k);
    tri(a, b, c); tri(a, c, d);
  }
  auto capRing = [&](size_t r, bool flip) {
    Vec3 c; for (auto& p : rings[r]) c += p; c = c * (1.0f / (float)N); uint32_t cc = add(c, Vec3(0, 1, 0), col);
    for (size_t k = 0; k < N; k++) { uint32_t a = base + (uint32_t)(r * N + k), b = base + (uint32_t)(r * N + (k + 1) % N); if (flip) tri(cc, b, a); else tri(cc, a, b); }
  };
  if (capStart) capRing(0, false); if (capEnd) capRing(R - 1, true);
  // Make the winding face outwards, then smooth the normals.
  double s = 0; for (size_t t = first; t < i.size(); t += 3) {
    Vec3 pa(v[i[t]].px, v[i[t]].py, v[i[t]].pz), pb(v[i[t + 1]].px, v[i[t + 1]].py, v[i[t + 1]].pz), pc(v[i[t + 2]].px, v[i[t + 2]].py, v[i[t + 2]].pz);
    s += dot(cross(pb - pa, pc - pa), (pa + pb + pc) * (1.0f / 3.0f) - centroid);
  }
  if (s < 0) for (size_t t = first; t < i.size(); t += 3) std::swap(i[t + 1], i[t + 2]);
  std::vector<Vec3> nrm(v.size() - base);
  for (size_t t = first; t < i.size(); t += 3) {
    uint32_t ia = i[t], ib = i[t + 1], ic = i[t + 2]; Vec3 pa(v[ia].px, v[ia].py, v[ia].pz), pb(v[ib].px, v[ib].py, v[ib].pz), pc(v[ic].px, v[ic].py, v[ic].pz);
    Vec3 fn = cross(pb - pa, pc - pa);
    for (uint32_t id : { ia, ib, ic }) if (id >= base && id < base + R * N) nrm[id - base] += fn;
  }
  for (size_t k = 0; k < R * N; k++) { Vec3 n = normalize(nrm[k]); v[base + k].nx = n.x; v[base + k].ny = n.y; v[base + k].nz = n.z; }
  // Cap vertices (after the ring ones) are flat: give them the cap's face normal.
  for (size_t t = first; t < i.size(); t += 3) for (int q = 0; q < 3; q++) if (i[t + q] >= base + R * N) {
    uint32_t ia = i[t], ib = i[t + 1], ic = i[t + 2]; Vec3 pa(v[ia].px, v[ia].py, v[ia].pz), pb(v[ib].px, v[ib].py, v[ib].pz), pc(v[ic].px, v[ic].py, v[ic].pz); Vec3 fn = normalize(cross(pb - pa, pc - pa));
    v[i[t + q]].nx = fn.x; v[i[t + q]].ny = fn.y; v[i[t + q]].nz = fn.z;
  }
}
void MeshData::append(const MeshData& o, const Mat4* xf) {
  uint32_t base = (uint32_t)v.size();
  for (auto m : o.v) {
    if (xf) { Vec3 p = transformPoint(*xf, Vec3(m.px, m.py, m.pz)); Vec3 n(xf->m[0][0] * m.nx + xf->m[0][1] * m.ny + xf->m[0][2] * m.nz, xf->m[1][0] * m.nx + xf->m[1][1] * m.ny + xf->m[1][2] * m.nz, xf->m[2][0] * m.nx + xf->m[2][1] * m.ny + xf->m[2][2] * m.nz); n = normalize(n);
      m.px = p.x; m.py = p.y; m.pz = p.z; m.nx = n.x; m.ny = n.y; m.nz = n.z; }
    v.push_back(m);
  }
  for (uint32_t id : o.i) i.push_back(base + id);
}
void MeshData::transform(const Mat4& m) { MeshData t; t.append(*this, &m); v = std::move(t.v); }

GpuMesh uploadMesh(Gfx& g, const MeshData& m) {
  GpuMesh r; if (m.empty() || m.i.empty()) return r;
  r.vb = g.makeBuffer(m.v.data(), (UINT)(m.v.size() * sizeof(MeshVertex)), sizeof(MeshVertex), (UINT)m.v.size());
  r.ib = g.makeBuffer(m.i.data(), (UINT)(m.i.size() * 4), 4, (UINT)m.i.size()); r.indexCount = (UINT)m.i.size(); return r;
}
void releaseMesh(Gfx& g, GpuMesh& m) { g.releaseBuffer(m.vb); g.releaseBuffer(m.ib); m.indexCount = 0; }
void drawMesh(Gfx& g, const GpuMesh& m, UINT instanceCount, const Buffer* inst) {
  if (!m.indexCount) return;
  D3D12_VERTEX_BUFFER_VIEW vb[2] = { m.vb.vbv(), inst ? inst->vbv() : D3D12_VERTEX_BUFFER_VIEW{} }; D3D12_INDEX_BUFFER_VIEW ib = m.ib.ibv();
  g.cmd->IASetVertexBuffers(0, inst ? 2 : 1, vb); g.cmd->IASetIndexBuffer(&ib); g.cmd->DrawIndexedInstanced(m.indexCount, instanceCount, 0, 0, 0);
}
