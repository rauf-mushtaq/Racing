#include "common.hlsli"
// Everything that is a mesh rather than terrain: the car, road ribbons and barriers, trees and
// rocks (instanced). The material is picked per draw (gP0.x): 0 plain, 1 car paint, 2 road,
// 3 glass, 4 emissive, 5 foliage. gP0 = (type, roughness, metalness, emissive), gP1 = tint.
struct VIn {
  float3 pos : POSITION; float3 nrm : NORMAL; float4 col : COLOR0; float2 uv : TEXCOORD0;
#ifdef INSTANCED
  float4 ia : INSTA; float yaw : INSTB; float4 ic : INSTC; float2 id : INSTD;
#endif
};
struct V { float4 pos : SV_Position; float3 wpos : TEXCOORD0; float3 nrm : TEXCOORD1; float4 col : TEXCOORD2; float2 uv : TEXCOORD3; float dist : TEXCOORD4; };
V VSMain(VIn i) {
  V o;
#ifdef INSTANCED
  float3 wp = InstanceWorld(i.pos, i.ia, i.yaw, i.id); o.nrm = InstanceNormal(i.nrm, i.yaw); o.col = i.col * i.ic * 2.0;   // instance tints are stored halved, so 0.5 is neutral
#else
  float3 wp = mul(gWorld, float4(i.pos, 1.0)).xyz; o.nrm = mul((float3x3)gWorld, i.nrm); o.col = i.col;
#endif
  o.wpos = wp; o.pos = mul(gViewProj, float4(wp, 1.0)); o.uv = i.uv; o.dist = length(wp - gCamPos.xyz); return o;
}
float3 Shade(float3 albedo, float metal, float rough, float3 n, float3 v, float sh) {
  float3 f0 = lerp(float3(0.04, 0.04, 0.04), albedo, metal), diff = albedo * (1.0 - metal);
  float ndl = saturate(dot(n, gSunDir.xyz));
  return diff * (gSunColor.rgb * ndl * sh + AmbientSky(n)) + SpecularLight(n, v, f0, rough, sh);
}
// Asphalt with lane markings drawn analytically (so they stay sharp): uv = (metres across from the centre line, metres along the road);
// colour.r = half width / 32, colour.g = style (0 motorway, 0.5 service road, 1 runway).
float3 RoadSurface(float2 uv, float4 col, float fp, out float rough) {
  float hw = col.r * 32.0; float style = col.g;
  float g = fbmAA(uv * float2(1, 1), fp, 3.0), g2 = fbmAA(uv + 11.0, fp, 12.0), g3 = fbmAA(uv * 0.3 + 5.0, fp, 0.6);
  float3 asph = float3(0.075, 0.075, 0.08) * (0.75 + 0.5 * g) * (0.88 + 0.24 * g2) * (0.85 + 0.3 * g3);
  rough = 0.58 + 0.2 * g2;
  float lw = max(0.075, fp * 0.9), x = uv.x, s = uv.y;
  float white = 0.0, yellow = 0.0;
  if (style < 0.25) {                                          // motorway: edge lines, dashed lane lines, yellow lines beside the median barrier
    white += 1.0 - smoothstep(lw, lw * 2.0, abs(abs(x) - (hw - 0.55)));
    float dash = step(0.75, frac(s / 12.0));
    white += (1.0 - smoothstep(lw, lw * 2.0, abs(abs(x) - 5.2))) * (1.0 - dash);
    yellow += 1.0 - smoothstep(lw, lw * 2.0, abs(abs(x) - 1.55));
  } else if (style < 0.75) {                                   // service road: thin edge lines
    white += 1.0 - smoothstep(lw, lw * 2.0, abs(abs(x) - (hw - 0.3)));
  } else {                                                     // runway
    white += 1.0 - smoothstep(lw * 2.0, lw * 4.0, abs(abs(x) - (hw - 1.1)));
    float dash = step(0.62, frac(s / 50.0)); white += (1.0 - smoothstep(0.45, 0.6, abs(x))) * (1.0 - dash) * step(60.0, s);
  }
  float wear = 0.75 + 0.25 * g2;
  float3 c = lerp(asph, float3(0.72, 0.72, 0.68) * wear, saturate(white));
  c = lerp(c, float3(0.78, 0.55, 0.10) * wear, saturate(yellow));
  return c;
}
PSOut PSMain(V i) {
  float3 n = normalize(i.nrm), v = normalize(gCamPos.xyz - i.wpos);
  if (dot(n, v) < 0.0 && gP3.x > 0.5) n = -n;                  // double-sided materials (foliage) light the side facing the camera
  float fpUV = max(length(ddx(i.uv)), length(ddy(i.uv)));            // derivatives are taken outside any branch
  float type = gP0.x, sh = ShadowFactor(i.wpos, n, i.dist);
  float3 col;
  if (type < 0.5) {                                            // plain
    col = Shade(i.col.rgb * gP1.rgb, gP0.z, gP0.y, n, v, sh);
  } else if (type < 1.5) {                                     // car paint: metal flake base under a clear coat
    float flake = vnoise(i.wpos.xz * 90.0 + i.wpos.y * 70.0) * 0.5 + vnoise(i.wpos.xz * 230.0) * 0.5;
    float3 base = i.col.rgb * gP1.rgb * (0.85 + 0.3 * flake);
    col = Shade(base, 0.55, 0.34 + 0.12 * flake, n, v, sh);
    float nv = saturate(dot(n, v)), F = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
    col += SkyColor(reflect(-v, n)) * (0.04 + 0.6 * F) * 0.9;                             // clear coat reflection
    float3 hh = normalize(gSunDir.xyz + v); col += gSunColor.rgb * pow(saturate(dot(n, hh)), 700.0) * 14.0 * sh;   // a hard sun highlight
  } else if (type < 2.5) {                                     // road
    float fp = fpUV; float rough;
    float3 alb = RoadSurface(i.uv, i.col, fp, rough);
    col = Shade(alb, 0.0, rough, n, v, sh);
    col += SpecularLight(n, v, float3(0.04, 0.04, 0.04), rough * 0.55, sh) * 0.6;     // glossy enough to streak in the low sun
  } else if (type < 3.5) {                                     // glass: dark, mirror-like at glancing angles
    float nv = saturate(dot(n, v)), F = 0.04 + 0.96 * pow(1.0 - nv, 4.0);
    col = float3(0.01, 0.015, 0.02) + SkyColor(reflect(-v, n)) * (0.12 + 0.88 * F);
    float3 hh = normalize(gSunDir.xyz + v); col += gSunColor.rgb * pow(saturate(dot(n, hh)), 400.0) * 10.0 * sh;
  } else if (type < 4.5) {                                     // emissive
    col = i.col.rgb * gP1.rgb * gP0.w;
  } else {                                                     // foliage: lit from behind as well
    float ndl = dot(n, gSunDir.xyz), back = saturate(-ndl) * 0.55;
    float3 alb = i.col.rgb * gP1.rgb;
    col = alb * (gSunColor.rgb * (saturate(ndl) + back) * sh + AmbientSky(n) * 1.1);
  }
  col = ApplyFog(col, i.wpos);
  return Out(col, i.dist);
}
