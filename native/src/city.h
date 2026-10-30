// The city on its 25 x 25 road grid: glass towers downtown, mid-rise, low-rise and suburban houses,
// with palms along the main boulevards. All buildings are instanced boxes (tiered for the tall ones)
// whose facades are drawn in the shader; they are solid to the car.
#pragma once
#include "renderer.h"
#include "props.h"
#include "collide.h"

class City {
public:
  void init(Gfx& g);
  void draw(Renderer& r, bool shadow, const Frustum& f, const Vec3& cam);
  int buildings = 0;
private:
  struct Chunk { Buffer boxes, palms; UINT nBoxes = 0, nPalms = 0; float x0, z0, x1, z1, maxY; };
  std::vector<Chunk> chunks; GpuMesh cube; PropSet props;
};
