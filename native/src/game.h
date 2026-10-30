// The game: the player's car (physics at 240 Hz), input from keyboard, mouse and gamepad, the cameras, the traffic, and the
// modes: free roam, races (gates, timer, medals) and the escape mode (police, gadgets). Also the menu and saved best times.
#pragma once
#include "renderer.h"
#include "vehicle.h"
#include "car.h"
#include "bond.h"
#include "scenery.h"
#include "city.h"
#include "collide.h"
#include "vehicles.h"
#include "traffic.h"
#include "fx.h"
#include "events.h"
#include "escape.h"
#include <map>
#include <deque>

struct InputState {
  double gas = 0, brake = 0, steer = 0; bool handbrake = false, nitro = false, analog = false;
  bool cam = false, reset = false, shiftUp = false, shiftDown = false; float lookDX = 0, lookDY = 0, zoom = 0;
  bool fire = false;                                                                                       // held
  bool missile = false, bomb = false, oil = false, smoke = false, shield = false;                          // pressed this frame
  bool menu = false, up = false, down = false, left = false, right = false, enter = false, back = false;   // menu: pressed this frame
  bool stats = false, vsync = false, ao = false, shadows = false;                                          // F3 F4 F5 F6
};
// Keyboard, mouse and (dynamically loaded) XInput gamepad.
class Input {
public:
  bool keys[256] = {}; bool prev[256] = {}; float mouseDX = 0, mouseDY = 0, wheel = 0; bool rightDown = false, leftDown = false;
  InputState read();
private:
  unsigned padPrev = 0; void* xinput = nullptr;
};

enum class State { Free, Menu, Countdown, Race, Finished, Escape, EscapeOver };
struct MenuItem { std::string label, detail; int action = 0, arg = 0; };
struct Toast { std::string text; double age = 0; };

class Game {
public:
  Vehicle car; CarModel model; BondModel bond; BondState bondState; int carKind = 0;   // 0 supercar, 1 the gadget grand tourer
  Scenery scenery; City city; VehicleModels vmodels; Traffic traffic; Fx fx; PoliceChase escape; float color[3] = { 0.85f, 0.20f, 0.03f };
  double clock = 0, trafficAcc = 0; int camMode = 0; bool freeCam = false; double camYaw = 0, orbit = 0, orbitPitch = 0; Vec3 camPos, camLookSmooth; bool camInit = false; double speedKmh = 0; bool braking = false;
  // Modes
  State state = State::Free, menuFrom = State::Free; bool quit = false, showStats = false;
  Route route; int nextCp = 0; double raceT = 0, countT = 0; double lastBest = -1; int lastMedal = -1; bool newBest = false; std::map<std::string, double> bests;
  std::vector<MenuItem> menuItems; int menuSel = 0, menuPage = 0; std::string menuTitle; std::deque<Toast> toasts; int trafficLevel = 2;
  double time = 0;

  void init(Renderer& r);
  void setCarKind(int kind);
  void spawn(const std::string& where, double x = 0, double z = 0, double h = 0);
  void update(Renderer& r, double dt, const InputState& in);
  void draw(Renderer& r, bool shadow, const Frustum& f);
  void prepare(Gfx& g, const Frustum& f);                 // per-frame instance data, built once before the shadow pass
  Pose pose() const { return { car.x, car.z, car.h }; }
  Vec3 focus() const { return Vec3((float)car.x, (float)car.bodyY(), (float)car.z); }
  // Modes and menu
  void runMenuActionPublic(int page) { buildMenu(page); }
  void openMenu(); void closeMenu(); void startRace(int eventIndex); void startEscape(); void toast(const std::string& s) { toasts.push_back({ s, 0 }); if (toasts.size() > 4) toasts.pop_front(); }
  double bestFor(const std::string& id) const { auto it = bests.find(id); return it == bests.end() ? -1 : it->second; }
  int medalFor(const std::string& id, const Route& rt) const;   // 0 none, 1 bronze, 2 silver, 3 gold
  bool inRaceHud() const { return state == State::Countdown || state == State::Race || state == State::Finished; }
  bool inEscapeHud() const { return state == State::Escape || state == State::EscapeOver; }
  bool playing() const { return state != State::Menu; }
private:
  double acc = 0, alpha = 1; std::string lastWhere; GpuMesh gateCyl, gateBox; double shakeT = 0;
  void buildMenu(int page); void menuInput(const InputState& in); void runMenuAction(const MenuItem& it);
  void updateCamera(Renderer& r, double dt, const InputState& in);
  void drawGates(Renderer& r, bool shadow);
  void finishRace(); void placeAtCheckpoint(int k); void loadSaves(); void saveSaves();
  void stepPhysics(double dt, const InputState& in);
};
