// The city on its 25 x 25 road grid: glass towers downtown, mid-rise, low-rise and suburban houses,
// with palms along the main boulevards. All buildings are instanced boxes (tiered for the tall ones)
// whose facades are drawn in the shader; they are solid to the car.
#pragma once
#include "renderer.h"
#include "props.h"
#include "collide.h"
#include "world.h"

// The road grid: 25 x 25 junctions 180 m apart; every fourth road is a six-lane boulevard.
namespace grid {
constexpr double SP = CITY_SP; constexpr int N = CITY_N;
inline bool isBlvd(int k) { return (((k % 4) + 4) % 4) == 0; }
inline double hw(int k) { return isBlvd(k) ? 16 : 9; }
inline double medianHalf(int k) { return isBlvd(k) ? 2.5 : 0; }
inline double laneW(int k) { return isBlvd(k) ? 4 : 3.8; }
inline int laneCount(int k) { return isBlvd(k) ? 3 : 2; }
inline double laneOffset(int k, int lane) { return medianHalf(k) + laneW(k) * (lane + 0.5); }
struct Signal { char Z, X; };   // 'G' green, 'A' amber, 'R' red, for traffic along z and along x
inline Signal signalState(double t) {
  const double C = 34; double c = std::fmod(std::fmod(t, C) + C, C);
  if (c < 13) return { 'G', 'R' }; if (c < 16) return { 'A', 'R' }; if (c < 17) return { 'R', 'R' };
  if (c < 30) return { 'R', 'G' }; if (c < 33) return { 'R', 'A' }; return { 'R', 'R' };
}
}

class City {
public:
  void init(Gfx& g);
  void draw(Renderer& r, bool shadow, const Frustum& f, const Vec3& cam);
  int buildings = 0;
private:
  struct Chunk { Buffer boxes, palms; UINT nBoxes = 0, nPalms = 0; float x0, z0, x1, z1, maxY; };
  std::vector<Chunk> chunks; GpuMesh cube; PropSet props;
};
