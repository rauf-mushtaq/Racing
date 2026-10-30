// The escape mode: you are in the gadget grand tourer and the police want you. Cruisers (and, at higher heat, heavy
// pursuit trucks) chase you along the roads, search for you when they lose sight, ram you and call for more. You have
// machine guns, homing missiles, proximity bombs, an oil slick, a smoke screen, an armour shield and nitro.
// Get out of sight and stay hidden to lose them. Get wrecked or boxed in and you lose.
#pragma once
#include "renderer.h"
#include "vehicles.h"
#include "traffic.h"
#include "fx.h"

struct EscapeInput { bool fire = false, missile = false, bomb = false, oil = false, smoke = false, shield = false; };
struct Cop {
  int kind = 0;                                       // 0 cruiser, 1 heavy pursuit truck
  double x = 0, z = 0, y = 0, h = 0, speed = 0, vx = 0, vz = 0, vy = 0, pitch = 0, roll = 0, spin = 0, rollRate = 0;
  double hp = 100, maxHp = 100, mass = 1700, len = 4.75, rad = 0.95, vmax = 50, burn = 0, slip = 0, stuck = 0, flash = 0, ramT = 0, roam = 0, rx = 0, rz = 0;
  bool wreck = false, air = false, sees = false;
};
struct Missile { double x, z, y, h, speed, age; int target; };
struct Bomb { double x, z, y, vx, vz, age; };
struct Zone { double x, z, r, age, life; };           // an oil slick or a smoke cloud

class PoliceChase {
public:
  enum Result { RUNNING, ESCAPED, BUSTED, WRECKED };
  Result result = RUNNING;
  // What the HUD shows.
  double health = 100, heat = 2.0, time = 0, hidden = 0, hiddenNeeded = 12, nearest = 1e9, shake = 0, damageFlash = 0, bustT = 0;
  int ammoMissile = 6, ammoBomb = 4, kills = 0, civilians = 0, maxStars = 2; bool spotted = true;
  double gunHeat = 0, cdOil = 0, cdSmoke = 0, cdShield = 0, shieldT = 0, gunOut = 0; bool jammed = false;
  std::vector<Cop> cops; std::vector<Missile> missiles; std::vector<Bomb> bombs; std::vector<Zone> oils, smokes;
  std::vector<std::string> messages;                  // one-line toasts for the HUD, taken (and cleared) by the game
  int stars() const { return std::max(1, std::min(5, (int)std::floor(heat))); }

  void init(Gfx& g, const VehicleModels* vm);
  void start(Vehicle& player, Traffic& traffic, Fx& fx);
  void update(double dt, Vehicle& player, Traffic& traffic, Fx& fx, const EscapeInput& in, bool playerFlipped = false);
  void collidePlayer(Vehicle& player, const HitFn& unusedHit);     // the cops against the player's car (called with the physics steps)
  void playerHit(double impulse, double mass);                        // damage from walls and the like
  void draw(Renderer& r, bool shadow, double clock);
  static Vec3 muzzlePos(const Vehicle& v, int side);
private:
  const VehicleModels* vm = nullptr; uint32_t rng = 99; double lastSeenX = 0, lastSeenZ = 0, spawnT = 0, fireT = 0, regenMissile = 0, regenBomb = 0, endT = 0, spotCool = 0; bool wasSpotted = true; int lastStars = 2;
  GpuMesh bombMesh, bombLight, missileMesh, oilMesh, ringMesh;
  double rnd() { rng = rng * 1664525u + 1013904223u; return (double)(rng >> 8) / 16777216.0; }
  void spawnCop(const Vehicle& player, int kind, int mode);   // mode: 0 nearer, 1 a long way off (backup), 2 right behind you (the opening)
  bool canSee(double ax, double az, double bx, double bz, double maxDist) const;
  bool smokeBlocks(double ax, double az, double bx, double bz) const;
  void navTarget(const Cop& c, double gx, double gz, double& tx, double& tz) const;
  void updateCop(Cop& c, double dt, Vehicle& player, Traffic& traffic, Fx& fx, double gx, double gz, bool chase);
  void explode(double x, double z, double y, double power, double radius, double dmg, Vehicle& player, Traffic& traffic, Fx& fx);
  void fireGuns(double dt, Vehicle& player, Traffic& traffic, Fx& fx);
  void damageCop(Cop& c, double amount, Fx& fx);
  int desiredCops() const;
};
