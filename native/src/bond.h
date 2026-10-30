// The gadget grand tourer for the escape mode: a procedurally modelled 1960s British GT in silver (long bonnet, oval grille,
// round lamps, chrome bumpers, wire wheels, fastback roof) with its gadgets: machine guns that slide out of the front wings,
// a rear armour shield that rises behind the cabin, and oil and smoke nozzles under the tail.
#pragma once
#include "renderer.h"
#include "vehicle.h"
#include "carasset.h"

struct BondState { double gunOut = 0, shield = 0; bool braking = false, headlights = true; };
struct BondModel {
  GpuMesh body, roof, glass, trim, chrome, lamps, tail, guns, shield, tire, rim, spokes, hub, brake;
  CarAsset asset;                                     // the grand tourer as a baked model (assets/cars/carconcept.scm); the procedural parts above are the fallback and the gadgets
  bool cockpit = false;                               // the camera is inside the cabin
  static inline bool useAsset = false;                // set by build() when the baked model loaded: it changes the wheel positions, mount points and seat
  void build(Gfx& g);
  void draw(Renderer& r, const Vehicle& v, double alpha, const BondState& st);
  Mat4 bodyMatrix(const Vehicle& v, double alpha) const;
  static void configure(Vehicle& v);                  // the car's physics: lighter, 5 gears, torquey straight-six with some help from Q branch
  // Where things are on the car (model space), for the weapons.
  static Vec3 gunMuzzle(int side) { return useAsset ? Vec3(side * 0.55f, 0.42f, 2.66f) : Vec3(side * 0.42f, 0.42f, 2.46f); }
  static Vec3 rearDrop() { return useAsset ? Vec3(0, 0.3f, -1.95f) : Vec3(0, 0.3f, -2.45f); }
  static Vec3 seat(int camMode) { return useAsset ? (camMode == 2 ? Vec3(0.0f, 1.04f, 0.45f) : Vec3(0.0f, 1.0f, 1.55f)) : (camMode == 2 ? Vec3(0.36f, 1.0f, 0.15f) : Vec3(0.0f, 0.98f, 1.05f)); }
};
