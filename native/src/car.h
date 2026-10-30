// The hero car: a procedurally lofted mid-engined supercar (body, canopy, wing, lights, wheels),
// drawn from the physics state (heave, pitch, roll, per-wheel suspension and steering).
#pragma once
#include "renderer.h"
#include "vehicle.h"

struct CarModel {
  GpuMesh body, glass, trim, wing, head, tail, tire, rim, brake;
  void build(Gfx& g);
  void draw(Renderer& r, const Vehicle& v, double alpha, const float color[3], bool braking);
  Mat4 bodyMatrix(const Vehicle& v, double alpha) const;
};
