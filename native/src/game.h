// The game itself for now: the player's car (physics at 240 Hz), input from keyboard and gamepad,
// the cameras, and drawing the car and the scenery round it.
#pragma once
#include "renderer.h"
#include "vehicle.h"
#include "car.h"
#include "scenery.h"
#include "city.h"
#include "collide.h"

struct InputState {
  double gas = 0, brake = 0, steer = 0; bool handbrake = false, nitro = false, analog = false;
  bool cam = false, reset = false, shiftUp = false, shiftDown = false; float lookDX = 0, lookDY = 0, zoom = 0;
};
// Keyboard and (dynamically loaded) XInput gamepad.
class Input {
public:
  bool keys[256] = {}; bool prev[256] = {}; float mouseDX = 0, mouseDY = 0, wheel = 0; bool rightDown = false;
  InputState read();
private:
  bool padPrevY = false, padPrevBack = false; void* xinput = nullptr;
};

class Game {
public:
  Vehicle car; CarModel model; Scenery scenery; City city; float color[3] = { 0.85f, 0.20f, 0.03f };
  int camMode = 0; bool freeCam = false; double camYaw = 0, orbit = 0, orbitPitch = 0; Vec3 camPos, camLookSmooth; bool camInit = false; double speedKmh = 0; bool braking = false;
  void init(Renderer& r);
  void spawn(const std::string& where, double x = 0, double z = 0, double h = 0);
  void update(Renderer& r, double dt, const InputState& in);
  void draw(Renderer& r, bool shadow, const Frustum& f);
  Vec3 focus() const { return Vec3((float)car.x, (float)car.bodyY(), (float)car.z); }
private:
  double acc = 0, alpha = 1; std::string lastWhere;
  void updateCamera(Renderer& r, double dt, const InputState& in);
};
