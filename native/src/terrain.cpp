#include "terrain.h"

bool Frustum::sphereVisible(float x, float y, float z, float r) const {
  for (int i = 0; i < 6; i++) if (p[i][0] * x + p[i][1] * y + p[i][2] * z + p[i][3] < -r) return false;
  return true;
}
bool Frustum::boxVisible(float x0, float y0, float z0, float x1, float y1, float z1) const {
  for (int i = 0; i < 6; i++) {
    float px = p[i][0] > 0 ? x1 : x0, py = p[i][1] > 0 ? y1 : y0, pz = p[i][2] > 0 ? z1 : z0;
    if (p[i][0] * px + p[i][1] * py + p[i][2] * pz + p[i][3] < 0) return false;
  }
  return true;
}
Frustum makeFrustum(const Mat4& M) {
  Frustum f; const float (*m)[4] = M.m; float rows[6][4];
  for (int c = 0; c < 4; c++) {
    rows[0][c] = m[3][c] + m[0][c]; rows[1][c] = m[3][c] - m[0][c]; rows[2][c] = m[3][c] + m[1][c];
    rows[3][c] = m[3][c] - m[1][c]; rows[4][c] = m[2][c]; rows[5][c] = m[3][c] - m[2][c];
  }
  for (int i = 0; i < 6; i++) { float l = std::sqrt(rows[i][0] * rows[i][0] + rows[i][1] * rows[i][1] + rows[i][2] * rows[i][2]); for (int c = 0; c < 4; c++) f.p[i][c] = rows[i][c] / l; }
  return f;
}

static uint32_t packBiome(double a, double b, double c, double d) {
  auto q = [](double v) { return (uint32_t)clampd(v * 255.0 + 0.5, 0, 255); };
  return q(a) | (q(b) << 8) | (q(c) << 16) | (q(d) << 24);
}
static uint32_t biomeAt(double x, double z, double h) {
  Climate c = climate(x, z); double sh = x - coastX(z);
  double wSnow = std::max(c.snow, smoothd(380, 560, h));
  double beach = smoothd(460, 160, sh) * smoothd(9, 3, h);
  double lake = smoothd(AIRFIELD.r + 120, AIRFIELD.r - 40, lakeDist(x, z)) * (1 - wSnow);
  double wSand = clampd(c.desert + beach, 0, 1) * (1 - wSnow) * (1 - lake);
  double wGrass = std::max(0.0, 1 - wSnow - wSand - lake), t = wGrass + wSand + wSnow + lake; if (t == 0) t = 1;
  return packBiome(wGrass / t, wSand / t, wSnow / t, lake / t);
}

void Terrain::init(Gfx& g, UINT samples) {
  gfx = &g;
  PsoDesc d; d.file = "terrain.hlsl"; d.numRT = 2; d.dsv = DXGI_FORMAT_D32_FLOAT; d.samples = samples;
  d.layout = { { "POSITION", 0, DXGI_FORMAT_R32G32B32_FLOAT, 0, 0, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 },
               { "NORMAL", 0, DXGI_FORMAT_R32G32B32_FLOAT, 0, 12, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 },
               { "COLOR", 0, DXGI_FORMAT_R8G8B8A8_UNORM, 0, 24, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 } };
  pso = g.makePso(d);
  for (auto& h : hole) { h[0] = 1; h[1] = 1; h[2] = -1; h[3] = -1; }
  unsigned n = std::max(2u, std::thread::hardware_concurrency()); n = n > 2 ? n - 1 : n;
  for (unsigned i = 0; i < n; i++) workers.emplace_back([this] { workerLoop(); });
}
Terrain::~Terrain() { quit = true; cv.notify_all(); for (auto& t : workers) if (t.joinable()) t.join(); }

void Terrain::workerLoop() {
  for (;;) {
    std::array<int, 3> j;
    { std::unique_lock<std::mutex> lk(mu); cv.wait(lk, [this] { return quit || !jobs.empty(); }); if (quit) return; j = jobs.front(); jobs.pop_front(); }
    CpuTile t = build(j[0], j[1], j[2]);
    { std::lock_guard<std::mutex> lk(mu); done.push_back(std::move(t)); }
  }
}

Terrain::CpuTile Terrain::build(int level, int tx, int tz) {
  const Level& Lv = L[level]; int cells = Lv.cells; double size = Lv.tile, x0 = tx * size, z0 = tz * size, step = size / cells;
  int w = cells + 3; std::vector<float> hs((size_t)w * w);
  for (int j = 0; j < w; j++) for (int i = 0; i < w; i++) hs[(size_t)j * w + i] = (float)heightAt(x0 + (i - 1) * step, z0 + (j - 1) * step);
  auto hAt = [&](int i, int j) { return hs[(size_t)(j + 1) * w + (i + 1)]; };
  CpuTile c; c.level = level; c.tx = tx; c.tz = tz; c.minY = 1e9f; c.maxY = -1e9f;
  int nv = (cells + 1) * (cells + 1); c.v.resize(nv);
  for (int j = 0; j <= cells; j++) for (int i = 0; i <= cells; i++) {
    int k = j * (cells + 1) + i; float h = hAt(i, j); double x = x0 + i * step, z = z0 + j * step;
    float gx = (hAt(i + 1, j) - hAt(i - 1, j)) / (float)(2 * step), gz = (hAt(i, j + 1) - hAt(i, j - 1)) / (float)(2 * step), l = std::sqrt(gx * gx + 1 + gz * gz);
    TerrainVertex& v = c.v[k]; v.px = (float)x; v.py = h; v.pz = (float)z; v.nx = -gx / l; v.ny = 1 / l; v.nz = -gz / l; v.biome = biomeAt(x, z, h);
    c.minY = std::min(c.minY, h); c.maxY = std::max(c.maxY, h);
  }
  for (int j = 0; j < cells; j++) for (int i = 0; i < cells; i++) {
    uint32_t a = j * (cells + 1) + i, b = a + 1, cc = a + cells + 1, d = cc + 1;
    c.idx.insert(c.idx.end(), { a, cc, b, b, cc, d });
  }
  // A skirt round the edge hides cracks between levels of detail.
  std::vector<std::array<int, 2>> ring;
  for (int i = 0; i <= cells; i++) ring.push_back({ 0, i });
  for (int j = 1; j <= cells; j++) ring.push_back({ j, cells });
  for (int i = cells - 1; i >= 0; i--) ring.push_back({ cells, i });
  for (int j = cells - 1; j >= 1; j--) ring.push_back({ j, 0 });
  uint32_t base = nv; double cx = x0 + size / 2, cz = z0 + size / 2;
  for (auto& r : ring) { TerrainVertex v = c.v[r[0] * (cells + 1) + r[1]]; v.py -= (float)Lv.skirt; c.v.push_back(v); }
  for (size_t r = 0; r < ring.size(); r++) {
    size_t r2 = (r + 1) % ring.size();
    uint32_t t1 = ring[r][0] * (cells + 1) + ring[r][1], t2 = ring[r2][0] * (cells + 1) + ring[r2][1], b1 = base + (uint32_t)r, b2 = base + (uint32_t)r2;
    double mx = (c.v[t1].px + c.v[t2].px) / 2 - cx, mz = (c.v[t1].pz + c.v[t2].pz) / 2 - cz, ex = c.v[t2].px - c.v[t1].px, ez = c.v[t2].pz - c.v[t1].pz;
    bool face = (ez * mx - ex * mz) > 0;
    if (face) c.idx.insert(c.idx.end(), { t1, t2, b2, t1, b2, b1 }); else c.idx.insert(c.idx.end(), { t1, b2, t2, t1, b1, b2 });
  }
  c.minY -= (float)Lv.skirt;
  return c;
}

void Terrain::upload(Gfx& g, CpuTile& c) {
  Tile t; t.level = c.level; t.tx = c.tx; t.tz = c.tz;
  t.vb = g.makeBuffer(c.v.data(), (UINT)(c.v.size() * sizeof(TerrainVertex)), sizeof(TerrainVertex), (UINT)c.v.size());
  t.ib = g.makeBuffer(c.idx.data(), (UINT)(c.idx.size() * 4), 4, (UINT)c.idx.size()); t.indexCount = (UINT)c.idx.size();
  double s = L[c.level].tile; t.x0 = (float)(c.tx * s); t.z0 = (float)(c.tz * s); t.x1 = (float)((c.tx + 1) * s); t.z1 = (float)((c.tz + 1) * s); t.minY = c.minY; t.maxY = c.maxY;
  tiles[c.level][key(c.tx, c.tz)] = std::move(t);
}

void Terrain::request(int level, int tx, int tz) {
  int64_t k = key(tx, tz);
  if (tiles[level].count(k) || pending[level].count(k)) return;
  pending[level][k] = true;
  { std::lock_guard<std::mutex> lk(mu); jobs.push_back({ level, tx, tz }); }
  cv.notify_one();
}

void Terrain::desired(int level, Vec3 cam, std::vector<std::array<int, 2>>& out, int& cx, int& cz) {
  const Level& Lv = L[level]; out.clear();
  int tx0 = (int)std::floor(WORLD.x0 / Lv.tile), tx1 = (int)std::floor((WORLD.x1 - 1) / Lv.tile), tz0 = (int)std::floor(WORLD.z0 / Lv.tile), tz1 = (int)std::floor((WORLD.z1 - 1) / Lv.tile);
  cx = (int)std::floor(cam.x / Lv.tile); cz = (int)std::floor(cam.z / Lv.tile);
  if (Lv.whole) { for (int z = tz0; z <= tz1; z++) for (int x = tx0; x <= tx1; x++) out.push_back({ x, z }); return; }
  for (int z = cz - Lv.radius; z <= cz + Lv.radius; z++) for (int x = cx - Lv.radius; x <= cx + Lv.radius; x++)
    if (x >= tx0 && x <= tx1 && z >= tz0 && z <= tz1) out.push_back({ x, z });
}

void Terrain::update(Gfx& g, Vec3 cam, int maxUploads) {
  // Hand finished tiles to the GPU, nearest level first.
  for (int n = 0; n < maxUploads; n++) {
    CpuTile c; { std::lock_guard<std::mutex> lk(mu); if (done.empty()) break; c = std::move(done.front()); done.pop_front(); }
    pending[c.level].erase(key(c.tx, c.tz)); upload(g, c);
  }
  std::vector<std::array<int, 2>> want;
  for (int lv = 0; lv < NL; lv++) {
    int cx, cz; desired(lv, cam, want, cx, cz);
    bool complete = true;
    for (auto& t : want) { if (!tiles[lv].count(key(t[0], t[1]))) { complete = false; request(lv, t[0], t[1]); } }
    if (!complete) continue;
    // The whole desired window is resident: finer levels may now cut their hole in this one, and old tiles can go.
    if (!L[lv].whole) {
      float x0 = (float)((cx - L[lv].radius) * L[lv].tile), x1 = (float)((cx + L[lv].radius + 1) * L[lv].tile), z0 = (float)((cz - L[lv].radius) * L[lv].tile), z1 = (float)((cz + L[lv].radius + 1) * L[lv].tile);
      if (lv + 1 < NL) { hole[lv + 1][0] = x0; hole[lv + 1][1] = z0; hole[lv + 1][2] = x1; hole[lv + 1][3] = z1; }
      for (auto it = tiles[lv].begin(); it != tiles[lv].end();) {
        bool keep = false; for (auto& t : want) if (key(t[0], t[1]) == it->first) { keep = true; break; }
        if (!keep) { g.releaseBuffer(it->second.vb); g.releaseBuffer(it->second.ib); it = tiles[lv].erase(it); } else ++it;
      }
    }
  }
}

void Terrain::loadNow(Gfx& g, Vec3 cam) {
  for (;;) {
    update(g, cam, 1000);
    bool all = true; std::vector<std::array<int, 2>> want;
    for (int lv = 0; lv < NL; lv++) { int cx, cz; desired(lv, cam, want, cx, cz); for (auto& t : want) if (!tiles[lv].count(key(t[0], t[1]))) all = false; }
    if (all) { update(g, cam, 0); break; }
    Sleep(5);
  }
}

void Terrain::draw(Gfx& g, const Frustum& f, UINT srvSlot, ID3D12PipelineState* psoOverride, int levels) {
  g.cmd->SetPipelineState(psoOverride ? psoOverride : pso.Get());
  for (int lv = NL - 1; lv >= 0; lv--) for (auto& kv : tiles[lv]) {
    if (lv >= levels) continue;
    const Tile& t = kv.second;
    if (!f.boxVisible(t.x0, t.minY, t.z0, t.x1, t.maxY, t.z1)) continue;
    struct DrawCB { float world[16]; float hole[4]; float p1[4], p2[4], p3[4]; } cb = {};
    cb.world[0] = cb.world[5] = cb.world[10] = cb.world[15] = 1;
    for (int i = 0; i < 4; i++) cb.hole[i] = hole[lv][i];
    g.setDraw(g.cb(cb), srvSlot);
    D3D12_VERTEX_BUFFER_VIEW vbv = t.vb.vbv(); D3D12_INDEX_BUFFER_VIEW ibv = t.ib.ibv();
    g.cmd->IASetVertexBuffers(0, 1, &vbv); g.cmd->IASetIndexBuffer(&ibv);
    g.cmd->DrawIndexedInstanced(t.indexCount, 1, 0, 0, 0); g.draws++;
  }
}
