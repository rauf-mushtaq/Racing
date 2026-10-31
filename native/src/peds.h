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
  void showcase(Renderer& r, double x, double z);   // a few figures standing in a row, for looking at the models (--showcase)
private:
  static const int POSES = 8;                                       // phases of the walk cycle
  GpuMesh shirt[POSES], legs[POSES], skin[POSES], rest[POSES];   // clothes take a per-person tint; skin has its own tint; hair and shoes are fixed
  struct List { D3D12_VERTEX_BUFFER_VIEW shirt{}, legs{}, skin{}, plain{}; UINT n = 0; } lists[POSES];
  // Things a person may wear or carry, each its own instanced mesh so its colour is chosen separately: hair (three styles), a cap, a backpack, a long coat or dress.
  GpuMesh hairM[3], capM, packM, coatM; float bobY[POSES] = {};
  struct Acc { D3D12_VERTEX_BUFFER_VIEW v{}; UINT n = 0; } hairL[3], capL, packL, coatL;
};
