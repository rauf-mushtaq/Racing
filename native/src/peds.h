// Pedestrians on the pavements: a small procedural figure in two walking poses, shirts in many colours, walking back and
// forth along each stretch of pavement between junctions. Their positions are computed from the time, so nothing is stored.
#pragma once
#include "renderer.h"
#include "traffic.h"

class Peds {
public:
  void init(Gfx& g);
  void prepare(Gfx& g, const Pose& player, const Frustum& f, double time);
  void draw(Renderer& r, bool shadow);
private:
  GpuMesh shirt[2], rest[2];
  struct List { D3D12_VERTEX_BUFFER_VIEW tint{}, plain{}; UINT n = 0; } lists[2];
};
