// Cars modelled by other people and baked into the game's own file format (tools/bake-model.mjs turns a glTF/GLB model into
// a .scm file): every part in car space (x left, y up, z forward, the front axle where the physics expects it, tyres on y = 0),
// grouped by what the material is, with the four wheels kept apart so they can spin and steer.
#pragma once
#include "renderer.h"
#include "vehicle.h"

struct CpuPart { int role = 0, slot = -1; MeshData m; };
bool loadCarCpu(const std::string& path, std::vector<CpuPart>& out);   // the parts of a baked file kept in memory instead of uploaded (to merge them into procedural meshes)
enum CarRole { CR_PAINT, CR_GLASS, CR_TRIM, CR_CHROME, CR_HEAD, CR_TAIL, CR_CARBON, CR_TIRE, CR_RIM, CR_BRAKE, CR_INTERIOR, CR_STEER, CR_COUNT };
struct CarAsset {
  GpuMesh body[CR_COUNT];                  // by role (the wheel roles are unused here)
  GpuMesh wheel[4][3];                     // [front left, front right, rear left, rear right][tyre, rim, brake disc]
  float wheelC[4][3] = {}, wheelR[4] = {};
  float bmin[3] = {}, bmax[3] = {};        // body bounds (without the wheels)
  float steerPivot[3] = {}, steerAxis[3] = { 0, 0, 1 };   // the steering wheel turns about this axis (pointing forward) through this point
  bool loaded = false;
  bool load(Gfx& g, const std::string& path);
  // Draws the body parts and the wheels. `M` is the body matrix, the wheels follow the vehicle's suspension, spin and steering.
  void draw(Renderer& r, const Mat4& M, const Vehicle* v, const float paintTint[3], bool braking, bool fromInside = false) const;   // fromInside: the camera is in the cabin, so no glass
};
