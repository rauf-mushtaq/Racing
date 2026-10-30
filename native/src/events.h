// Races: each is a route of checkpoint gates, ported from the JavaScript game. City races run along the road grid,
// the open-country ones along the motorways. Medal times come from the route length.
#pragma once
#include "city.h"
#include <string>
#include <vector>

struct Checkpoint { bool world = false; double x = 0, z = 0, y = 0, tx = 0, tz = 0, hw = 0, r = 0; int i = 0, j = 0; bool alongZ = true; };
struct RoadLeg { std::string id; int mode; };      // mode: 0 whole road, 1 the ring's west side (south to north)
struct RaceEvent { std::string id, group, name, desc; std::vector<std::array<int, 2>> nodes; std::vector<RoadLeg> road; bool lap = false; };
struct Medals { double gold, silver, bronze; };
struct StartPose { double x, z, h; };
struct Route { const RaceEvent* ev = nullptr; std::vector<Checkpoint> cps; StartPose start{}; double length = 0; Medals medals{}; };

const std::vector<RaceEvent>& raceEvents();
Route buildRoute(const RaceEvent& ev);
bool inCheckpoint(const Checkpoint& cp, double x, double z);
