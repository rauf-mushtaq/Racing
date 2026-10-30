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
// Impulse between the car and something at (px, pz) with surface normal (nx, nz) pointing at the car; the other body can move
// (inverse mass and world velocity). Returns the impulse (0 if they were separating).
double applyImpulse(Vehicle& car, double px, double pz, double nx, double nz, double e, double mu, const HitFn* hit, double otherMassInv = 0, const double* otherVel = nullptr);
// First static thing (building, tree, barrier, rock) along a ray, or maxDist. Used by the weapons and the police's line of sight.
double raycastStatic(double x, double z, double dx, double dz, double maxDist);
// Push a circle out of everything static; returns true (and the contact normal) if it touched something.
bool pushOutStatic(double& x, double& z, double r, double* nx = nullptr, double* nz = nullptr);
