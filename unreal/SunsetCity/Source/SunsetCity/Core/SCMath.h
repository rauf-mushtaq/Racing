// Sunset City (Unreal Engine 5): the maths the game's logic is made of. Nothing in Core/ includes an Unreal header: it is plain C++17 that works in Unreal's own units
// and axes (centimetres; X forward, Y right, Z up; angles in degrees where they meet the engine and radians inside), so the city layout, the meshes, the character's poses and the
// fighters' behaviour can be compiled and tested with an ordinary compiler (see Tests/run_core_tests.sh). The code in the module's other files only turns these results into
// Unreal objects.
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <string>
#include <vector>

namespace SC {

constexpr double kPi = 3.14159265358979323846;
inline double Rad(double deg) { return deg * kPi / 180.0; }
inline double Deg(double rad) { return rad * 180.0 / kPi; }

struct V2 { double x = 0, y = 0; };
struct V3 { double x = 0, y = 0, z = 0; };
inline V3 operator+(const V3& a, const V3& b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
inline V3 operator-(const V3& a, const V3& b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
inline V3 operator*(const V3& a, double s) { return {a.x * s, a.y * s, a.z * s}; }
inline V3 operator*(double s, const V3& a) { return {a.x * s, a.y * s, a.z * s}; }
inline V3& operator+=(V3& a, const V3& b) { a.x += b.x; a.y += b.y; a.z += b.z; return a; }
inline double Dot(const V3& a, const V3& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline V3 Cross(const V3& a, const V3& b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
inline double LenSq(const V3& a) { return Dot(a, a); }
inline double Len(const V3& a) { return std::sqrt(Dot(a, a)); }
inline V3 Norm(const V3& a, const V3& fallback = {0, 0, 1}) { double l = Len(a); return l > 1e-12 ? a * (1.0 / l) : fallback; }
inline double Dist2D(const V3& a, const V3& b) { return std::hypot(a.x - b.x, a.y - b.y); }
inline bool Finite(const V3& a) { return std::isfinite(a.x) && std::isfinite(a.y) && std::isfinite(a.z); }

inline double Clamp(double v, double lo, double hi) { return v < lo ? lo : v > hi ? hi : v; }
inline double Saturate(double v) { return Clamp(v, 0.0, 1.0); }
inline double Lerp(double a, double b, double t) { return a + (b - a) * t; }
inline double SmoothStep(double a, double b, double x) { double t = Saturate((x - a) / (b - a)); return t * t * (3 - 2 * t); }
// An angle brought into (-pi, pi].
inline double WrapAngle(double a) { while (a > kPi) a -= 2 * kPi; while (a <= -kPi) a += 2 * kPi; return a; }
// The way a direction in the ground plane points, as an angle from +X towards +Y (Unreal's yaw), and back.
inline double YawOf(double dx, double dy) { return std::atan2(dy, dx); }
inline V3 DirOfYaw(double yaw) { return {std::cos(yaw), std::sin(yaw), 0}; }
inline V3 RotateZ(const V3& v, double yaw) { double c = std::cos(yaw), s = std::sin(yaw); return {v.x * c - v.y * s, v.x * s + v.y * c, v.z}; }

struct Col { float r = 1, g = 1, b = 1, a = 1; };
inline Col Mix(const Col& a, const Col& b, float t) { return {a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t}; }
inline Col Scale(const Col& a, float k) { return {a.r * k, a.g * k, a.b * k, a.a}; }
// A colour from a web-style hex number (sRGB, as a painter picks it), turned into the linear light Unreal's materials work in.
inline float SrgbToLinear(float c) { return c <= 0.04045f ? c / 12.92f : std::pow((c + 0.055f) / 1.055f, 2.4f); }
inline Col Hex(uint32_t rgb) { return {SrgbToLinear(((rgb >> 16) & 255) / 255.f), SrgbToLinear(((rgb >> 8) & 255) / 255.f), SrgbToLinear((rgb & 255) / 255.f), 1.f}; }

// A small repeatable random number generator (mulberry32): the same seed always gives the same city.
struct Rng {
  uint32_t s;
  explicit Rng(uint32_t seed = 1) : s(seed ? seed : 0x9E3779B9u) {}
  float F() { s += 0x6D2B79F5u; uint32_t t = s; t = (t ^ (t >> 15)) * (t | 1u); t ^= t + (t ^ (t >> 7)) * (t | 61u); return float(((t ^ (t >> 14)) >> 0) / 4294967296.0); }
  double R(double a, double b) { return a + (b - a) * F(); }
  int I(int n) { return n <= 1 ? 0 : std::min(n - 1, int(F() * n)); }
  bool Chance(double p) { return F() < p; }
};
inline uint32_t HashCell(int32_t a, int32_t b, uint32_t seed = 0) {
  uint32_t h = seed * 374761393u + uint32_t(a) * 668265263u + uint32_t(b) * 2147483647u; h = (h ^ (h >> 13)) * 1274126177u; return h ^ (h >> 16);
}
// Smooth value noise in two dimensions, 0..1 (for hills, wear, anything that should vary gently from place to place).
inline double Noise2(double x, double y, uint32_t seed = 0) {
  int32_t xi = int32_t(std::floor(x)), yi = int32_t(std::floor(y)); double fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  auto h = [&](int a, int b) { return HashCell(xi + a, yi + b, seed) / 4294967296.0; };
  return Lerp(Lerp(h(0, 0), h(1, 0), u), Lerp(h(0, 1), h(1, 1), u), v);
}
inline double Fbm2(double x, double y, int oct, uint32_t seed = 0) { double a = 0.5, s = 0, n = 0; for (int i = 0; i < oct; i++) { s += a * Noise2(x, y, seed + i * 17); n += a; x *= 2.03; y *= 2.03; a *= 0.5; } return s / n; }

}  // namespace SC
