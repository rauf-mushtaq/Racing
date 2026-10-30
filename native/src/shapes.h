// Modelling helpers for the cars: smooth curves, a body loft built from design curves (half width, sill, shoulder and
// deck height along the car) with creased and rounded cross-sections and wheel arches, plus discs, ellipses and wire wheels.
#pragma once
#include "mesh.h"
#include <functional>

struct Curve {
  std::vector<std::array<float, 2>> k;                           // control points (z, value), smooth (Catmull-Rom) between them, flat beyond the ends
  Curve() {} Curve(std::initializer_list<std::array<float, 2>> l) : k(l) {}
  float at(float z) const;
};
struct BodySpec {
  float z0 = -2, z1 = 2; int stations = 72, smooth = 2;
  Curve hw, yb, ysh, ytop, crown;                                // half width, sill height, shoulder height, deck height at the centre line, extra height at the centre line (bulges)
  float deckStart = 0.80f, noseR = 0.3f, tailR = 0.1f;          // where the deck begins (fraction of half width); how round the two ends are (metres)
  std::vector<std::array<float, 2>> arches; float archY = 0.33f, archMargin = 0.06f;   // wheel arches: (z of the wheel centre, wheel radius); archY = wheel centre height
  float tumble = 0.0f;                                           // sides lean in towards the shoulder by this fraction of the half width
};
MeshData loftBody(const BodySpec& s, uint32_t col);
// Give every triangle its own colour (normals stay smooth): f(centroid, face normal) -> colour.
MeshData colourTriangles(const MeshData& m, const std::function<uint32_t(Vec3, Vec3)>& f);
// A disc or dished cap facing +z (or -z) at (cx, cy, z): outer radius r, depth d (a lathe about the z axis).
void discZ(MeshData& m, float cx, float cy, float z, float r, float d, bool facePlusZ, uint32_t col, int seg = 24, float dish = 0.0f);
// An extruded ellipse facing +z (a grille, a lamp housing): z is the front face, depth goes backwards.
void ellipseZ(MeshData& m, float cx, float cy, float z, float rx, float ry, float depth, uint32_t col, int seg = 28);
// A wire wheel for the right-hand side (outer face at +x, axis along x): tyre, polished rim, spokes, hub with a knock-off spinner.
struct WheelParts { MeshData tire, rim, spokes, hub; };
WheelParts wireWheel(float radius, float tireWidth, float rimR);
