// The hero car: a procedurally modelled mid-engined supercar (creased and rounded body with wheel arches,
// canopy, roof, wing, lights, intakes, alloy wheels), drawn from the physics state (heave, pitch, roll,
// per-wheel suspension and steering).
#pragma once
#include "renderer.h"
#include "vehicle.h"
#include "carasset.h"

struct CarModel {
  GpuMesh body, roof, glass, trim, wing, head, tail, tire, rim, brake, chrome;
  bool cockpit = false;                                // the camera is inside the cabin (the game sets this each frame)
  CarAsset asset;                                      // the supercar as a baked model (assets/cars/ferrari.scm); the procedural parts above are the fallback
  void build(Gfx& g);
  void draw(Renderer& r, const Vehicle& v, double alpha, const float color[3], bool braking);
  Mat4 bodyMatrix(const Vehicle& v, double alpha) const;
};
