// Everything built on the land around the camera, a 256 m tile at a time: road ribbons (with lane
// markings drawn in the shader), median barriers, guardrails, bridges and piers, plus the scattered
// pines, palms, cacti, rocks and shrubs. Tiles are built on worker threads and registered with the
// collision grid when they arrive.
#pragma once
#include "renderer.h"
#include "props.h"
#include "collide.h"
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <deque>
#include <unordered_map>

class Scenery {
public:
  static constexpr double TILE = 256; static constexpr int RADIUS = 5;
  struct TileCPU { int tx, tz; MeshData asphalt, gravel, conc, metal; std::vector<InstanceData> inst[P_COUNT]; std::vector<Circle> colliders; float minY = 1e9f, maxY = -1e9f; };
  struct Tile { int tx, tz; GpuMesh asphalt, gravel, conc, metal; Buffer inst[P_COUNT]; UINT count[P_COUNT] = {}; float x0, z0, x1, z1, minY, maxY; };
  void init(Gfx& g);
  ~Scenery();
  void update(Gfx& g, Vec3 cam, int maxUploads = 4);
  void loadNow(Gfx& g, Vec3 cam);
  void draw(Renderer& r, bool shadow, const Frustum& f);
  int resident() const { return (int)tiles.size(); }
private:
  PropSet props; std::unordered_map<int64_t, Tile> tiles; std::unordered_map<int64_t, bool> pending;
  std::vector<std::thread> workers; std::mutex mu; std::condition_variable cv; std::atomic<bool> quit{ false };
  std::deque<std::array<int, 2>> jobs; std::deque<TileCPU> done;
  static int64_t key(int tx, int tz) { return ((int64_t)(tx + 100000) << 20) | (int64_t)(tz + 100000); }
  TileCPU build(int tx, int tz); void upload(Gfx& g, TileCPU& c); void workerLoop();
};
