// Particles: smoke, fire, sparks, flashes and tracer streaks. Simulated on the CPU, drawn as camera-facing
// billboards in one instanced call (fx.hlsl) after the sky, depth-tested against the scene.
#pragma once
#include "renderer.h"

class Fx {
public:
  struct P {
    Vec3 pos, vel, p2; float size = 1, grow = 0, life = 1, age = 0, drag = 0, gravity = 0, seed = 0, rise = 0; float c0[4] = {}, c1[4] = {}; int kind = 0;   // kinds: 0 smoke, 1 streak, 2 glow, 3 spark
  };
  void update(double dt);
  void draw(Renderer& r, const Vec3& cam);
  void clear() { ps.clear(); }
  size_t count() const { return ps.size(); }
  // Emitters
  void smoke(Vec3 p, Vec3 v, float size, float life, float shade = 0.3f, float alpha = 0.55f, float grow = 2.0f);
  void fire(Vec3 p, Vec3 v, float size, float life);
  void spark(Vec3 p, Vec3 v, float life = 0.6f);
  void flash(Vec3 p, float size, float life, float r = 1.0f, float g = 0.8f, float b = 0.45f, float power = 6.0f);
  void tracer(Vec3 a, Vec3 b, float width = 0.05f, float life = 0.06f, float power = 14.0f);
  void explosion(Vec3 p, float power);              // power ~ 1 for a missile, 1.6 for a bomb
  void muzzle(Vec3 p, Vec3 dir);
  void burn(Vec3 p, float dt);                       // a wreck on fire: call every frame
  void ring(Vec3 p, float size, float life, float r = 1.0f, float g = 0.85f, float b = 0.6f);
private:
  std::vector<P> ps; uint32_t rng = 12345;
  float rnd() { rng = rng * 1664525u + 1013904223u; return (float)(rng >> 8) / 16777216.0f; }
  float rr(float a, float b) { return a + (b - a) * rnd(); }
  P& add(int kind) { if (ps.size() >= 3500) ps.erase(ps.begin(), ps.begin() + 200); ps.emplace_back(); P& p = ps.back(); p.kind = kind; p.seed = rnd() * 99.0f; return p; }
};
