// The gadget grand tourer for the escape mode: a procedurally modelled 1960s British GT in silver (long bonnet, oval grille,
// round lamps, chrome bumpers, wire wheels, fastback roof) with its gadgets: machine guns that slide out of the front wings,
// a rear armour shield that rises behind the cabin, and oil and smoke nozzles under the tail.
#pragma once
#include "renderer.h"
#include "vehicle.h"

struct BondState { double gunOut = 0, shield = 0; bool braking = false, headlights = true; };
struct BondModel {
  GpuMesh body, roof, glass, trim, chrome, lamps, tail, guns, shield, tire, rim, spokes, hub, brake;
  void build(Gfx& g);
  void draw(Renderer& r, const Vehicle& v, double alpha, const BondState& st);
  Mat4 bodyMatrix(const Vehicle& v, double alpha) const;
  static void configure(Vehicle& v);                  // the car's physics: lighter, 5 gears, torquey straight-six with some help from Q branch
  // Where things are on the car (model space), for the weapons.
  static Vec3 gunMuzzle(int side) { return Vec3(side * 0.42f, 0.42f, 2.46f); }
  static Vec3 rearDrop() { return Vec3(0, 0.3f, -2.45f); }
};
