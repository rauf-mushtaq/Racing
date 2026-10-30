// City traffic, ported from the JavaScript game: cars drive on the right in their lanes, follow the car
// ahead, slow for turns, obey the traffic signals, brake for you and get knocked aside when hit. Out on the
// motorways they follow a lane along the road in both directions. Traffic stays around the player: cars that
// fall far behind are moved to roads further ahead. Cars can also be shot, bombed, spun out on oil and wrecked.
#pragma once
#include "renderer.h"
#include "vehicles.h"
#include "city.h"
#include "collide.h"
#include <unordered_map>

struct Pose { double x = 0, z = 0, h = 0; };

struct TCar {
  enum Mode { DRIVE, KNOCKED, WRECK };
  struct Pt { double x, z, y; };
  bool active = true; int type = 0; float color[3] = { 1, 1, 1 }; double len = 4.7, mass = 1400, rad = 0.95;
  double x = 0, z = 0, y = 0, h = 0, speed = 0, vmax = 0; bool haveH = false; Mode mode = DRIVE;
  double vx = 0, vz = 0, spin = 0, knockT = 0, wait = 0, hp = 100, burn = 0, slip = 0;
  bool hwy = false; char axis = 'Z'; int from[2] = {}, to[2] = {}, next[2] = {}; int lane = 0; bool turning = false, blvd = false;
  std::vector<Pt> pts; std::vector<double> cum; double total = 0, straightLen = 0, s = 0;
};

class Traffic {
public:
  std::vector<TCar> cars;
  void init(Gfx& g, const VehicleModels& vm);
  void setDensity(int level, const Pose& player);          // 0 off, 1 light, 2 normal, 3 heavy
  void reset(const Pose& player) { for (TCar& c : cars) { c.haveH = false; spawn(c, player, 30, 520, true); } }   // after a teleport
  void update(double dt, const Pose& player, double clock);
  void prepare(Gfx& g, const Pose& player, const Frustum& f, double clock);   // builds this frame's instance data (once, before the shadow pass)
  void draw(Renderer& r, bool shadow);
  void velocityOf(const TCar& c, double v[2]) const;
  void knock(TCar& c, double vx, double vz, double spin);
  void damage(TCar& c, double amount);                      // at zero the car is wrecked and burns where it stands
  void respawnFar(TCar& c, const Pose& player, double minD, double maxD) { spawn(c, player, minD, maxD); }
  int density = 2;
private:
  const VehicleModels* models = nullptr; uint32_t rng = 77;
  double rnd() { rng += 0x6D2B79F5u; uint32_t t = rng; t = (t ^ (t >> 15)) * (t | 1u); t ^= t + (t ^ (t >> 7)) * (t | 61u); return (double)((t ^ (t >> 14)) >> 0) / 4294967296.0; }
  struct Edge { int k; int dx, dz, rx, rz; double crossA, crossB; };
  Edge edgeInfo(const int a[2], const int b[2]) const;
  void lanePoints(const int a[2], const int b[2], int lane, TCar::Pt& p0, TCar::Pt& p1, Edge& e) const;
  void pickNext(const int from[2], const int to[2], int out[2]);
  void buildPath(TCar& c, const int from[2], const int to[2], int lane);
  void spawnHwy(TCar& c, const Pose& player, double minD, double maxD, bool initial);
  void spawn(TCar& c, const Pose& player, double minD, double maxD, bool initial = false);
  void place(TCar& c);
  void assignType(TCar& c, double r);
  // Drawing
  struct TypeDraw { D3D12_VERTEX_BUFFER_VIEW paint{}, plain{}; UINT n = 0; };
  struct Parked { float x, z, yaw; uint8_t type, color; };
  std::unordered_map<int64_t, std::vector<Parked>> parked;    // cars standing along the kerbs, in 90 m cells
  TypeDraw parkedDraw[TK_COUNT]; void initParked();
  TypeDraw drawList[TK_COUNT]; TypeDraw sigPole, sigLamp[3]; GpuMesh poleMesh, lampMesh[3]; Buffer dummy;
  void prepareSignals(Gfx& g, const Vec3& cam, double clock);
};
// The player's car against traffic: heavy vehicles barely move when you hit them.
void collideTraffic(Vehicle& car, Traffic& t, const HitFn& onHit);
