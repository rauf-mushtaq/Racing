// The on-screen display: a round gauge with a rev arc, speed and gear, a nitro bar and a few lines of
// text, drawn as coloured triangles and glyphs from a font atlas rasterised with GDI at start-up.
#pragma once
#include "renderer.h"
#include "game.h"

struct Perf { double fps = 0, frameMs = 0, worstMs = 0, gpuMs = 0; unsigned draws = 0, shadowDraws = 0, W = 0, H = 0; int msaa = 4; bool vsync = false, tearing = false, ao = true, shadows = true; };
class Hud {
public:
  void init(Renderer& r);
  void draw(Renderer& r, Gfx& g, Texture& target, const Game& game, double time, const Perf& perf);
private:
  struct V { float x, y, u, v, r, g, b, a; };
  std::vector<V> verts; Texture atlas; ComPtr<ID3D12PipelineState> pso; UINT block = 0; bool ready = false;
  struct Glyph { float u0, v0, u1, v1, w, h, adv, yoff; } glyphs[96]; float fontPx = 30;
  void solid(float x0, float y0, float x1, float y1, const float c[4]);
  void quad(float ax, float ay, float bx, float by, float cx, float cy, float dx, float dy, const float c[4]);
  void arc(float cx, float cy, float r0, float r1, float a0, float a1, const float c[4], int segs = 48);
  void line(float x0, float y0, float x1, float y1, float w, const float c[4]);
  float textWidth(const std::string& s, float px);
  void textRaw(const std::string& s, float x, float y, float px, const float c[4]);
  void text(const std::string& s, float x, float y, float px, const float c[4], int align = 0);
  void tri(float ax, float ay, float bx, float by, float cx, float cy, const float c[4]) { quad(ax, ay, bx, by, cx, cy, cx, cy, c); }
  void star(float cx, float cy, float r, const float c[4]);
  std::vector<std::string> wrap(const std::string& s, float maxW, float px);
  float S = 1; float W = 0, H = 0;
  void gauge(const Game& game, const Perf& perf);
  void raceHud(const Renderer& r, const Game& game);
  void escapeHud(const Renderer& r, const Game& game);
  void menu(const Game& game);
  void toasts(const Game& game);
  void statsPanel(const Perf& perf);   // align: 0 left, 1 centre, 2 right; y is the baseline
};
