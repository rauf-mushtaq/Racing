#include "fx.h"
#include "world.h"

void Fx::update(double dt) {
  float d = (float)dt;
  for (size_t i = 0; i < ps.size();) {
    P& p = ps[i]; p.age += d;
    if (p.age >= p.life) { ps[i] = ps.back(); ps.pop_back(); continue; }
    p.vel.y += (p.gravity + p.rise) * d; float k = std::exp(-p.drag * d); p.vel = p.vel * k; p.pos += p.vel * d; p.size += p.grow * d;
    if (p.kind == 3) { float gy = (float)heightAt(p.pos.x, p.pos.z); if (p.pos.y < gy + 0.03f) { p.pos.y = gy + 0.03f; p.vel.y = -p.vel.y * 0.3f; p.vel.x *= 0.6f; p.vel.z *= 0.6f; } }
    i++;
  }
}
void Fx::draw(Renderer& r, const Vec3& cam) {
  if (ps.empty()) return;
  struct Item { float d2; const P* p; }; std::vector<Item> order; order.reserve(ps.size());
  for (const P& p : ps) { Vec3 dv = p.pos - cam; float d2 = dot(dv, dv); if (d2 < 900.0f * 900.0f && (p.kind == 1 || dot(dv, r.forward) > -p.size * 2)) order.push_back({ d2, &p }); }
  std::sort(order.begin(), order.end(), [](const Item& a, const Item& b) { return a.d2 > b.d2; });   // far to near, for the alpha-blended smoke
  struct GP { float x, y, z, size, r, g, b, a, x2, y2, z2, kind; }; std::vector<GP> out; out.reserve(order.size());
  for (const Item& it : order) {
    const P& p = *it.p; float t = p.age / p.life, c[4]; for (int k = 0; k < 4; k++) c[k] = p.c0[k] + (p.c1[k] - p.c0[k]) * t;
    out.push_back({ p.pos.x, p.pos.y, p.pos.z, p.size, c[0], c[1], c[2], c[3], p.p2.x, p.p2.y, p.p2.z, (float)p.kind + p.seed / 100.0f });
  }
  r.drawParticles(r.gfx.dynVB(out.data(), (UINT)(out.size() * sizeof(GP)), sizeof(GP)), (UINT)out.size());
}
void Fx::smoke(Vec3 p, Vec3 v, float size, float life, float shade, float alpha, float grow) {
  P& q = add(0); q.pos = p; q.vel = v; q.size = size; q.grow = grow; q.life = life; q.drag = 0.8f; q.rise = 0.6f;
  float tint[3] = { shade * 1.05f, shade, shade * 0.95f }; for (int k = 0; k < 3; k++) { q.c0[k] = tint[k]; q.c1[k] = tint[k] * 0.9f; } q.c0[3] = alpha; q.c1[3] = 0.0f;
}
void Fx::fire(Vec3 p, Vec3 v, float size, float life) {
  P& q = add(2); q.pos = p; q.vel = v; q.size = size; q.grow = -size / life * 0.5f; q.life = life; q.drag = 1.5f; q.rise = 3.0f;
  q.c0[0] = 5.0f; q.c0[1] = 2.2f; q.c0[2] = 0.5f; q.c0[3] = 1.0f; q.c1[0] = 1.2f; q.c1[1] = 0.25f; q.c1[2] = 0.05f; q.c1[3] = 0.4f;
}
void Fx::spark(Vec3 p, Vec3 v, float life) {
  P& q = add(3); q.pos = p; q.vel = v; q.size = 0.06f; q.life = life; q.gravity = -14.0f; q.drag = 0.4f;
  q.c0[0] = 8.0f; q.c0[1] = 5.0f; q.c0[2] = 1.6f; q.c0[3] = 1.0f; q.c1[0] = 3.0f; q.c1[1] = 0.8f; q.c1[2] = 0.1f; q.c1[3] = 0.5f;
}
void Fx::flash(Vec3 p, float size, float life, float r, float g, float b, float power) {
  P& q = add(2); q.pos = p; q.size = size; q.grow = size * 1.5f / life; q.life = life; q.c0[0] = r * power; q.c0[1] = g * power; q.c0[2] = b * power; q.c0[3] = 1.0f; q.c1[0] = r; q.c1[1] = g; q.c1[2] = b; q.c1[3] = 0.0f;
}
void Fx::tracer(Vec3 a, Vec3 b, float width, float life, float power) {
  P& q = add(1); q.pos = a; q.p2 = b; q.size = width; q.life = life; q.c0[0] = power; q.c0[1] = power * 0.75f; q.c0[2] = power * 0.3f; q.c0[3] = 1.0f; q.c1[0] = power * 0.5f; q.c1[1] = power * 0.3f; q.c1[2] = power * 0.1f; q.c1[3] = 0.0f;
}
void Fx::ring(Vec3 p, float size, float life, float r, float g, float b) { flash(p, size, life, r, g, b, 1.2f); }
void Fx::muzzle(Vec3 p, Vec3 dir) {
  flash(p + dir * 0.2f, 0.45f, 0.06f, 1.0f, 0.75f, 0.35f, 9.0f);
  for (int i = 0; i < 2; i++) spark(p + dir * 0.3f, dir * rr(8, 26) + Vec3(rr(-3, 3), rr(-1, 3), rr(-3, 3)), 0.25f);
}
void Fx::explosion(Vec3 p, float power) {
  flash(p + Vec3(0, 1.0f, 0), 9.0f * power, 0.35f, 1.0f, 0.7f, 0.35f, 10.0f);
  for (int i = 0; i < (int)(26 * power); i++) { Vec3 v(rr(-1, 1), rr(0.1f, 1.0f), rr(-1, 1)); v = normalize(v) * rr(3, 14) * power; fire(p + Vec3(0, 0.8f, 0) + v * 0.05f, v, rr(1.6f, 3.2f) * power, rr(0.5f, 1.1f)); }
  for (int i = 0; i < (int)(18 * power); i++) { Vec3 v(rr(-1, 1), rr(0.2f, 1.0f), rr(-1, 1)); v = normalize(v) * rr(2, 9) * power; smoke(p + Vec3(0, 1.2f, 0), v, rr(2.2f, 4.0f) * power, rr(2.5f, 5.0f), 0.12f, 0.75f, rr(1.2f, 2.6f)); }
  for (int i = 0; i < (int)(40 * power); i++) { Vec3 v(rr(-1, 1), rr(0.4f, 1.4f), rr(-1, 1)); spark(p + Vec3(0, 0.5f, 0), normalize(v) * rr(8, 30), rr(0.5f, 1.4f)); }
  ring(p + Vec3(0, 0.3f, 0), 14.0f * power, 0.25f, 1.0f, 0.8f, 0.55f);
}
void Fx::burn(Vec3 p, float dt) {
  if (rnd() < dt * 22.0f) fire(p + Vec3(rr(-0.9f, 0.9f), rr(0.2f, 0.6f), rr(-1.5f, 1.5f)), Vec3(rr(-0.3f, 0.3f), rr(1.0f, 2.2f), rr(-0.3f, 0.3f)), rr(0.5f, 0.9f), rr(0.5f, 0.9f));
  if (rnd() < dt * 10.0f) smoke(p + Vec3(rr(-0.6f, 0.6f), 1.0f, rr(-1.0f, 1.0f)), Vec3(rr(-0.4f, 0.4f), rr(1.5f, 3.0f), rr(-0.4f, 0.4f)), rr(1.0f, 1.6f), rr(2.5f, 4.0f), 0.08f, 0.7f, 1.8f);
}
