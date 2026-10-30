// Small maths and noise helpers shared by the whole game. The noise functions are
// ports of the JavaScript game's (util.js), so the world is identical.
#pragma once
#include <cmath>
#include <cstdint>
#include <cstring>
#include <algorithm>
#include <vector>
#include <array>
#include <string>

constexpr double PI = 3.14159265358979323846;
inline double clampd(double v, double a, double b) { return v < a ? a : v > b ? b : v; }
inline float clampf(float v, float a, float b) { return v < a ? a : v > b ? b : v; }
inline double lerpd(double a, double b, double t) { return a + (b - a) * t; }
inline double smoothd(double a, double b, double x) { double t = clampd((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
inline double wrapAngle(double a) { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; }

inline uint32_t imul(uint32_t a, uint32_t b) { return a * b; }
inline double hash3(int i, int j, int s) {
  uint32_t h = imul((uint32_t)i, 374761393u) + imul((uint32_t)j, 668265263u) + imul((uint32_t)s, 1442695041u);
  h = imul(h ^ (h >> 13), 1274126177u);
  return (double)(h ^ (h >> 16)) / 4294967296.0;
}
inline double tnoise(double x, double y, int64_t period, int seed) {
  double xf0 = std::floor(x), yf0 = std::floor(y);
  int64_t xi = (int64_t)xf0, yi = (int64_t)yf0; double xf = x - xf0, yf = y - yf0;
  double u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  auto w = [period](int64_t n) { return (int)(((n % period) + period) % period); };
  double a = hash3(w(xi), w(yi), seed), b = hash3(w(xi + 1), w(yi), seed), c = hash3(w(xi), w(yi + 1), seed), d = hash3(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
inline double tfbm(double x, double y, int64_t period, int oct, int seed) {
  double f = 0, amp = 0.5, norm = 0; int64_t p = period;
  for (int i = 0; i < oct; i++) { f += amp * tnoise(x, y, p, seed + i * 31); norm += amp; amp *= 0.5; x *= 2; y *= 2; p *= 2; }
  return f / norm;
}
inline double fbm(double x, double y, int oct = 4, int seed = 0) { return tfbm(x, y, (int64_t)1 << 20, oct, seed); }

struct Vec3 {
  float x = 0, y = 0, z = 0;
  Vec3() {} Vec3(float x, float y, float z) : x(x), y(y), z(z) {}
  Vec3 operator+(const Vec3& o) const { return { x + o.x, y + o.y, z + o.z }; }
  Vec3 operator-(const Vec3& o) const { return { x - o.x, y - o.y, z - o.z }; }
  Vec3 operator*(float s) const { return { x * s, y * s, z * s }; }
  Vec3& operator+=(const Vec3& o) { x += o.x; y += o.y; z += o.z; return *this; }
};
inline float dot(const Vec3& a, const Vec3& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline Vec3 cross(const Vec3& a, const Vec3& b) { return { a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x }; }
inline float length(const Vec3& a) { return std::sqrt(dot(a, a)); }
inline Vec3 normalize(const Vec3& a) { float l = length(a); return l > 1e-12f ? a * (1.0f / l) : Vec3(0, 1, 0); }

// Row-major 4x4 matrix used with column vectors (M * v). HLSL reads it as row_major.
struct Mat4 {
  float m[4][4];
  static Mat4 identity() { Mat4 r; std::memset(r.m, 0, sizeof r.m); for (int i = 0; i < 4; i++) r.m[i][i] = 1; return r; }
};
inline Mat4 mul(const Mat4& a, const Mat4& b) {
  Mat4 r; for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) { float s = 0; for (int k = 0; k < 4; k++) s += a.m[i][k] * b.m[k][j]; r.m[i][j] = s; } return r;
}
inline Mat4 translation(float x, float y, float z) { Mat4 r = Mat4::identity(); r.m[0][3] = x; r.m[1][3] = y; r.m[2][3] = z; return r; }
inline Mat4 scaling(float x, float y, float z) { Mat4 r = Mat4::identity(); r.m[0][0] = x; r.m[1][1] = y; r.m[2][2] = z; return r; }
inline Mat4 rotationY(float a) { Mat4 r = Mat4::identity(); float c = std::cos(a), s = std::sin(a); r.m[0][0] = c; r.m[0][2] = s; r.m[2][0] = -s; r.m[2][2] = c; return r; }
inline Mat4 rotationX(float a) { Mat4 r = Mat4::identity(); float c = std::cos(a), s = std::sin(a); r.m[1][1] = c; r.m[1][2] = -s; r.m[2][1] = s; r.m[2][2] = c; return r; }
inline Mat4 rotationZ(float a) { Mat4 r = Mat4::identity(); float c = std::cos(a), s = std::sin(a); r.m[0][0] = c; r.m[0][1] = -s; r.m[1][0] = s; r.m[1][1] = c; return r; }
// Right-handed look-at (camera looks down -z in view space).
inline Mat4 lookAt(Vec3 eye, Vec3 at, Vec3 up) {
  Vec3 f = normalize(at - eye), s = normalize(cross(f, up)), u = cross(s, f);
  Mat4 r = Mat4::identity();
  r.m[0][0] = s.x; r.m[0][1] = s.y; r.m[0][2] = s.z; r.m[0][3] = -dot(s, eye);
  r.m[1][0] = u.x; r.m[1][1] = u.y; r.m[1][2] = u.z; r.m[1][3] = -dot(u, eye);
  r.m[2][0] = -f.x; r.m[2][1] = -f.y; r.m[2][2] = -f.z; r.m[2][3] = dot(f, eye);
  return r;
}
// Reversed-Z perspective (near -> 1, far -> 0): far better depth precision over a 12 km world.
inline Mat4 perspectiveRZ(float fovY, float aspect, float zn, float zf) {
  Mat4 r; std::memset(r.m, 0, sizeof r.m); float f = 1.0f / std::tan(fovY * 0.5f);
  r.m[0][0] = f / aspect; r.m[1][1] = f; r.m[2][2] = zn / (zf - zn); r.m[2][3] = zf * zn / (zf - zn); r.m[3][2] = -1; return r;
}
// Right-handed orthographic with depth in [0, 1] (near -> 0).
inline Mat4 orthoRH(float l, float r_, float b, float t, float zn, float zf) {
  Mat4 r = Mat4::identity();
  r.m[0][0] = 2 / (r_ - l); r.m[0][3] = -(r_ + l) / (r_ - l);
  r.m[1][1] = 2 / (t - b); r.m[1][3] = -(t + b) / (t - b);
  r.m[2][2] = -1 / (zf - zn); r.m[2][3] = -zn / (zf - zn);
  return r;
}
inline Vec3 transformPoint(const Mat4& m, Vec3 p) {
  return { m.m[0][0] * p.x + m.m[0][1] * p.y + m.m[0][2] * p.z + m.m[0][3], m.m[1][0] * p.x + m.m[1][1] * p.y + m.m[1][2] * p.z + m.m[1][3], m.m[2][0] * p.x + m.m[2][1] * p.y + m.m[2][2] * p.z + m.m[2][3] };
}
