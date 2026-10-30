// The cars that aren't the player's: six kinds of traffic (saloon, SUV, hatchback, pickup, box truck, bus),
// the police cruiser and the heavy pursuit truck. Each is one lofted body with the glass, tyres and trim
// coloured per triangle (paint is white so it takes the per-instance colour), plus emissive lights.
#pragma once
#include "mesh.h"

struct CarMesh {
  GpuMesh body, head, tail, bar, lampL, lampR;   // bar: the roof light bar base and its two lamps (police only); body is lofted and coloured, head/tail are emissive boxes
  float len = 4.7f, halfW = 0.9f, mass = 1400, rad = 0.95f, barY = 0, wheelR = 0.33f;
};
enum TrafficKind { TK_SALOON, TK_SUV, TK_HATCH, TK_PICKUP, TK_TRUCK, TK_BUS, TK_COUNT };
struct VehicleModels {
  CarMesh traffic[TK_COUNT], cruiser, swat;
  void build(Gfx& g);
};
// Colour helpers shared with the other vehicle builders.
uint32_t vcol(float r, float g, float b);
