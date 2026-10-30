#include "common.hlsli"
// The land: grass, sand, snow, dry lakebed and rock blended from the biome weights stored in
// the vertices, with all the texture detail made procedurally here, so it is as sharp as the
// screen (no texture to run out of pixels). Inside the city square it draws paved ground.
struct VIn { float3 pos : POSITION; float3 nrm : NORMAL; float4 biome : COLOR0; };
struct V { float4 pos : SV_Position; float3 wpos : TEXCOORD0; float3 nrm : TEXCOORD1; float4 biome : TEXCOORD2; float dist : TEXCOORD3; };
V VSMain(VIn i) {
  V o; o.wpos = i.pos; o.nrm = i.nrm; o.biome = i.biome; o.pos = mul(gViewProj, float4(i.pos, 1.0)); o.dist = length(i.pos - gCamPos.xyz); return o;
}
static const float CITY_EDGE = 2176.0;
float3 CityGround(float2 p, float fp, out float rough) {
  float2 k = round(p / 180.0), d = abs(p - k * 180.0);
  float2 hw = float2((fmod(abs(k.x), 4.0) < 0.5) ? 16.0 : 9.0, (fmod(abs(k.y), 4.0) < 0.5) ? 16.0 : 9.0);
  float g = fbmAA(p, fp, 3.0), g2 = fbmAA(p + 7.0, fp, 11.0);
  rough = 0.62;
  bool onAveX = d.x < hw.x, onAveZ = d.y < hw.y;
  if (onAveX || onAveZ) {
    float3 asph = float3(0.085, 0.085, 0.09) * (0.8 + 0.4 * g) * (0.9 + 0.2 * g2);
    // Lane lines: dashed white centre lines and solid edge lines.
    float lw = max(0.07, fp * 0.8);
    float2 across = onAveX && !onAveZ ? float2(d.x, p.y) : float2(d.y, p.x);
    float dash = step(0.5, frac(across.y / 12.0));
    float centre = (1.0 - smoothstep(lw, lw * 2.0, abs(across.x))) * dash;
    float edge = 1.0 - smoothstep(lw, lw * 2.0, abs(abs(across.x) - (onAveX && !onAveZ ? hw.x : hw.y) + 0.5));
    bool crossing = onAveX && onAveZ;
    float mark = crossing ? 0.0 : saturate(centre * 0.9 + edge * 0.8);
    return lerp(asph, float3(0.7, 0.68, 0.62), mark);
  }
  rough = 0.85;
  return float3(0.36, 0.34, 0.31) * (0.8 + 0.4 * g) * (0.9 + 0.2 * g2);   // pavement and the ground the blocks stand on
}
PSOut PSMain(V i) {
  float3 wp = i.wpos; float dist = length(wp - gCamPos.xyz);
  if (wp.x > gP0.x && wp.x < gP0.z && wp.z > gP0.y && wp.z < gP0.w) discard;
  float2 p = wp.xz;
  float fp = max(length(ddx(p)), length(ddy(p)));               // metres per pixel
  float3 n = normalize(i.nrm);
  float slope = 1.0 - n.y;
  float4 bw = i.biome;
  float macro = 0.78 + 0.44 * fbmAA(p, fp, 0.0042);
  float fine = fbmAA(p, fp, 2.7), grit = fbmAA(p + 31.0, fp, 8.0);
  float dry = fbmAA(p, fp, 0.007);
  float rw = saturate(1.0 - fp * 0.7);
  float rip = (0.5 + 0.5 * sin((p.x * 0.8 + p.y * 0.45 + 3.0 * vnoise(p * 0.07)) * 2.4)) * rw;
  float patch = fbmAA(p, fp, 0.035);
  float3 grass = lerp(float3(0.14, 0.26, 0.05), float3(0.34, 0.31, 0.11), saturate(dry * 0.9 + (patch - 0.5) * 1.1)) * (0.62 + 0.76 * fine) * (0.8 + 0.4 * patch);
  float3 sand = lerp(float3(0.64, 0.46, 0.27), float3(0.80, 0.64, 0.42), fine) * (0.9 + 0.18 * rip) * (0.92 + 0.16 * grit);
  float3 snow = float3(0.90, 0.93, 1.0) * (0.93 + 0.07 * grit);
  float3 lake = lerp(float3(0.66, 0.58, 0.47), float3(0.78, 0.70, 0.58), fine) * (0.93 + 0.07 * grit);
  float3 alb = (grass * bw.x + sand * bw.y + snow * bw.z + lake * bw.w) * macro;
  // Rock on steep ground, textured from the side; banded like sandstone in the desert.
  float3 an = abs(n);
  float rk = (fbmAA(wp.zy, fp, 0.35) * an.x + fbmAA(wp.xy, fp, 0.35) * an.z) / (an.x + an.z + 1e-3);
  float band = 0.5 + 0.5 * sin(wp.y * 0.62 + 3.2 * vnoise(wp.xz * 0.0045) + 1.4 * vnoise(float2(wp.x + wp.z, wp.y) * 0.01));
  float3 rockGrey = float3(0.30, 0.27, 0.25) * (0.55 + 0.9 * rk);
  float3 rockSand = lerp(float3(0.62, 0.38, 0.24), float3(0.44, 0.26, 0.17), band) * (0.7 + 0.6 * rk);
  float3 rock = lerp(rockGrey, rockSand, saturate(bw.y * 1.3));
  float rockW = smoothstep(0.16, 0.40, slope) * (1.0 - 0.3 * bw.z);
  alb = lerp(alb, rock, rockW);
  float rough = clamp(1.0 - bw.z * 0.62 - bw.w * 0.30 - bw.y * 0.05, 0.3, 1.0);
  rough = lerp(rough, 0.9, rockW);
  float sheen = 0.35 + bw.z * 1.0 + bw.w * 0.6;
  float hgt = (fine * 0.5 + grit * 0.35 + rip * bw.y * 0.6 + rk * rockW * 2.0) * 0.05;
  if (max(abs(p.x), abs(p.y)) < CITY_EDGE) { float cr; alb = CityGround(p, fp, cr); rough = cr; sheen = 0.5; hgt = grit * 0.01; }
  // Fine relief near the camera, caught by the low sun (bump from screen-space derivatives, bounded and guarded).
  float nearF = 1.0 - smoothstep(35.0, 120.0, dist);
  float3 dpx = ddx(wp), dpy = ddy(wp);
  float dhx = ddx(hgt), dhy = ddy(hgt);
  float3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  float pxl = max(length(dpx), length(dpy));
  float2 dh = clamp(float2(dhx, dhy) * nearF * 1.3, -0.7 * pxl, 0.7 * pxl);
  float3 nb = abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2);
  float nl = length(nb);
  if (abs(det) > 1e-12 && nl > 1e-12) n = nb / nl;
  float sh = ShadowFactor(wp, n, dist);
  float3 v = normalize(gCamPos.xyz - wp);
  float ndl = saturate(dot(n, gSunDir.xyz));
  float3 col = alb * (gSunColor.rgb * ndl * sh + AmbientSky(n));
  col += SpecularLight(n, v, float3(0.04, 0.04, 0.04), rough, sh) * sheen;
  col = ApplyFog(col, wp);
  return Out(col, dist);
}
