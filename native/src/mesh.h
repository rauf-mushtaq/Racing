// Procedural meshes: a builder (quads, boxes, cylinders, lathes, smooth lofts), upload to the GPU,
// and the vertex layouts the mesh and instanced shaders use.
#pragma once
#include "gfx.h"

struct MeshVertex { float px, py, pz, nx, ny, nz; uint32_t color; float u, v; };   // 36 bytes
struct InstanceData { float x, y, z, scale; float yaw; uint32_t color; float tilt, extra; };   // 32 bytes
inline uint32_t packColor(float r, float g, float b, float a = 1.0f) {
  auto q = [](float v) { return (uint32_t)clampf(v * 255.0f + 0.5f, 0, 255); };
  return q(r) | (q(g) << 8) | (q(b) << 16) | (q(a) << 24);
}
inline std::vector<D3D12_INPUT_ELEMENT_DESC> meshLayout() {
  return { { "POSITION", 0, DXGI_FORMAT_R32G32B32_FLOAT, 0, 0, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 },
           { "NORMAL", 0, DXGI_FORMAT_R32G32B32_FLOAT, 0, 12, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 },
           { "COLOR", 0, DXGI_FORMAT_R8G8B8A8_UNORM, 0, 24, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 },
           { "TEXCOORD", 0, DXGI_FORMAT_R32G32_FLOAT, 0, 28, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 } };
}
inline std::vector<D3D12_INPUT_ELEMENT_DESC> instancedLayout() {
  auto l = meshLayout();
  l.push_back({ "INSTA", 0, DXGI_FORMAT_R32G32B32A32_FLOAT, 1, 0, D3D12_INPUT_CLASSIFICATION_PER_INSTANCE_DATA, 1 });
  l.push_back({ "INSTB", 0, DXGI_FORMAT_R32_FLOAT, 1, 16, D3D12_INPUT_CLASSIFICATION_PER_INSTANCE_DATA, 1 });
  l.push_back({ "INSTC", 0, DXGI_FORMAT_R8G8B8A8_UNORM, 1, 20, D3D12_INPUT_CLASSIFICATION_PER_INSTANCE_DATA, 1 });
  l.push_back({ "INSTD", 0, DXGI_FORMAT_R32G32_FLOAT, 1, 24, D3D12_INPUT_CLASSIFICATION_PER_INSTANCE_DATA, 1 });
  return l;
}

struct MeshData {
  std::vector<MeshVertex> v; std::vector<uint32_t> i;
  uint32_t add(Vec3 p, Vec3 n, uint32_t c, float u = 0, float vv = 0) { v.push_back({ p.x, p.y, p.z, n.x, n.y, n.z, c, u, vv }); return (uint32_t)v.size() - 1; }
  void tri(uint32_t a, uint32_t b, uint32_t c) { i.push_back(a); i.push_back(b); i.push_back(c); }
  // A flat quad, counter-clockwise seen from the front: a, b, c, d.
  void quad(Vec3 a, Vec3 b, Vec3 c, Vec3 d, uint32_t col, float u0 = 0, float v0 = 0, float u1 = 1, float v1 = 1);
  void box(Vec3 mn, Vec3 mx, uint32_t col);
  void cylinder(Vec3 a, Vec3 b, float r0, float r1, int seg, uint32_t col, bool capA = true, bool capB = true);
  // A surface of revolution about the x axis: profile points are (x along the axis, radius).
  void lathe(const std::vector<std::array<float, 2>>& profile, int seg, uint32_t col, Vec3 centre = Vec3());
  // Rings of equal point count joined into a smooth surface (shared vertices, averaged normals).
  void loft(const std::vector<std::vector<Vec3>>& rings, uint32_t col, bool capStart, bool capEnd);
  void append(const MeshData& o, const Mat4* xf = nullptr);
  void transform(const Mat4& m);
  void tint(uint32_t col) { for (auto& x : v) x.color = col; }
  bool empty() const { return v.empty(); }
};
struct GpuMesh { Buffer vb, ib; UINT indexCount = 0; explicit operator bool() const { return indexCount > 0; } };
GpuMesh uploadMesh(Gfx& g, const MeshData& m);
void releaseMesh(Gfx& g, GpuMesh& m);
void drawMesh(Gfx& g, const GpuMesh& m, UINT instanceCount = 1, const Buffer* inst = nullptr);
