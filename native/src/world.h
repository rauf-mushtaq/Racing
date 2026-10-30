// The world beyond the city: terrain height, climate and biomes, the motorway
// network, and what the car drives on. A port of the JavaScript game's world.js.
// North is -z, east is +x. Heights are metres, with the city at 0.
#pragma once
#include "mathx.h"

constexpr double SEA_Y = -1.2;
struct WorldRect { double x0, x1, z0, z1; };
constexpr WorldRect WORLD = { -4400, 7800, -7800, 7800 };
constexpr WorldRect WORLD_LIM = { -3150, 7650, -7650, 7650 };
constexpr double CITY_SP = 180; constexpr int CITY_N = 12;
constexpr double CITY_EDGE = CITY_N * CITY_SP + 16;   // outer edge of the city's ring road
constexpr double CITY_LIMIT = CITY_EDGE + 420;

enum RoadKind { ROAD_MOTORWAY = 0, ROAD_SERVICE = 1, ROAD_RUNWAY = 2 };
struct Road {
  std::string id; int kind = 0; double hw = 0; bool closed = false; int idx = 0; double len = 0, lift = 0;
  std::vector<double> x, z, y, s;
  std::vector<uint8_t> bridge; std::vector<float> under;   // filled by the road builder
};
struct RoadHit { bool ok = false; double d = 1e18, y = 0, s = 0, t = 0; const Road* road = nullptr; int i = 0, side = 1; };
struct Climate { double snow, desert; };
enum SurfaceKind { SURF_ASPHALT, SURF_GRAVEL, SURF_GRASS, SURF_SAND, SURF_SNOW, SURF_ROCK, SURF_LAKEBED, SURF_CONCRETE };
struct Ground { float y; int kind; float mu, drag; bool grass; };
struct Airfield { double x, z, r, y, runwayZ0, runwayZ1, hw; };
struct Bunker { const char* id; double cx, cz, fx, fz, apronY; bool butte; };

extern std::vector<Road> ROADS;
extern Airfield AIRFIELD;
extern Bunker BUNKERS[2];

void worldInit();                        // builds the road network and distance field (about a second)
double coastX(double z);
Climate climate(double x, double z);
double roadDist(double x, double z);
double baseHeight(double x, double z);
double canyonDepth(double x, double z);
double heightAt(double x, double z);
RoadHit roadAt(double x, double z);
double lakeDist(double x, double z);
Ground groundAt(double x, double z);
