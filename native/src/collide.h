// Collisions between the car and the world: circle colliders (barriers, trees, rocks) in a grid
// hash, the edge of the world, the sea, and cliffs. The car is three circles along its length; each
// contact gets a proper impulse, so a glancing hit slides and spins you while a head-on one stops you.
#pragma once
#include "vehicle.h"
#include <unordered_map>
#include <functional>

struct Circle { float x, z, r; };
struct Box { float x0, z0, x1, z1; };
void addBoxes(const std::vector<Box>& list);       // permanent (buildings)
void addColliders(int64_t owner, const std::vector<Circle>& list);
void removeColliders(int64_t owner);
void queryColliders(float x, float z, float r, std::vector<Circle>& out);
using HitFn = std::function<void(double impulse)>;
void collideStatic(Vehicle& car, const HitFn& onHit);
void collideTerrain(Vehicle& car, const HitFn& onHit);
