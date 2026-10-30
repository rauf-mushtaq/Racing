// Streamed terrain: three levels of detail (4 m, 8 m and 16 m cells). The finest two are windows
// that follow the camera; the coarsest covers the whole world. Tiles are built on worker threads
// and uploaded a few per frame; a coarser level has a hole cut where a finer one takes over.
#pragma once
#include "gfx.h"
#include "world.h"
#include <thread>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <unordered_map>

struct TerrainVertex { float px, py, pz, nx, ny, nz; uint32_t biome; };
struct Frustum { float p[6][4]; bool sphereVisible(float x, float y, float z, float r) const; bool boxVisible(float x0, float y0, float z0, float x1, float y1, float z1) const; };
Frustum makeFrustum(const Mat4& vp);

class Terrain {
public:
  struct Level { double tile; int cells, radius; bool whole; double skirt; };
  struct Tile { int level, tx, tz; Buffer vb, ib; UINT indexCount = 0; float x0, z0, x1, z1, minY, maxY; };
  struct CpuTile { int level, tx, tz; std::vector<TerrainVertex> v; std::vector<uint32_t> idx; float minY, maxY; };

  void init(Gfx& g, UINT samples);
  ~Terrain();
  void loadNow(Gfx& g, Vec3 cam);                         // builds and uploads the windows round cam, waiting for them
  void update(Gfx& g, Vec3 cam, int maxUploads = 6);      // keeps the windows following the camera
  void draw(Gfx& g, const Frustum& f, UINT srvSlot, ID3D12PipelineState* psoOverride = nullptr, int levels = 3);   // levels: how many of the finest levels to draw
  Gfx* gfx = nullptr;
  int tilesResident() const { int n = 0; for (auto& l : tiles) n += (int)l.size(); return n; }
private:
  static constexpr int NL = 3;
  Level L[NL] = { { 256, 64, 2, false, 6 }, { 512, 64, 2, false, 12 }, { 1024, 64, 0, true, 24 } };
  std::unordered_map<int64_t, Tile> tiles[NL];
  float hole[NL][4];                                     // rectangle each level's draw skips (the finer level covers it)
  ComPtr<ID3D12PipelineState> pso;
  // Workers.
  std::vector<std::thread> workers; std::mutex mu; std::condition_variable cv; std::atomic<bool> quit{ false };
  std::deque<std::array<int, 3>> jobs; std::deque<CpuTile> done; std::unordered_map<int64_t, bool> pending[NL];
  static int64_t key(int tx, int tz) { return ((int64_t)(tx + 100000) << 20) | (int64_t)(tz + 100000); }
  CpuTile build(int level, int tx, int tz);
  void upload(Gfx& g, CpuTile& c);
  void desired(int level, Vec3 cam, std::vector<std::array<int, 2>>& out, int& cx, int& cz);
  void request(int level, int tx, int tz);
  void workerLoop();
};
