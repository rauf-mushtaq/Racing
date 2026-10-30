#define NO_SHADOW_MAP 1
#include "common.hlsli"
// The sea: a plane that follows the camera, with rippling normals, fresnel reflection of the
// sky, a glittering sun path, shallows and foam along the shore.
struct V { float4 pos : SV_Position; float3 wpos : TEXCOORD0; };
V VSMain(uint id : SV_VertexID) {
  V o; float2 c = float2((id == 0 || id == 3 || id == 5) ? -1.0 : 1.0, (id == 0 || id == 1 || id == 3) ? -1.0 : 1.0); float3 w = float3(floor(gCamPos.x / 100.0) * 100.0 + c.x * 30000.0, -1.2, floor(gCamPos.z / 100.0) * 100.0 + c.y * 30000.0);
  o.wpos = w; o.pos = mul(gViewProj, float4(w, 1.0)); return o;
}
float coastX(float z) { return -3450.0 + 160.0 * sin(z / 850.0) + 90.0 * sin(z / 260.0 + 1.3); }
float waveH(float2 p, float t) {
  float h = 0;
  h += vnoise(p * 0.35 + float2(t * 0.45, t * 0.2)) * 0.5;
  h += vnoise(p * 0.9 + float2(-t * 0.6, t * 0.35)) * 0.28;
  h += vnoise(p * 2.3 + float2(t * 0.8, -t * 0.5)) * 0.14;
  return h;
}
PSOut PSMain(V i) {
  float3 wp = i.wpos; float dist = length(wp - gCamPos.xyz);
  float2 p = wp.xz; float t = gCamPos.w;
  if (p.x > coastX(p.y) + 260.0) discard;   // only the western sea; the canyon floor is dry
  float fade = 1.0 - smoothstep(60.0, 600.0, dist);
  float e = 0.15 + dist * 0.002;
  float h0 = waveH(p, t), hx = waveH(p + float2(e, 0), t), hz = waveH(p + float2(0, e), t);
  float3 n = normalize(float3(-(hx - h0) / e * 0.9 * fade, 1.0, -(hz - h0) / e * 0.9 * fade));
  float3 v = normalize(gCamPos.xyz - wp);
  float nv = saturate(dot(n, v));
  float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  float sh = p.x - coastX(p.y);
  float depthM = clamp(-1.2 - clamp(-4.0 + sh * 0.015, -34.0, 3.2), 0.0, 40.0);   // metres of water, from the beach profile
  float3 shallow = float3(0.10, 0.38, 0.40), deep = float3(0.02, 0.10, 0.17);
  float3 body = lerp(shallow, deep, smoothstep(0.0, 14.0, depthM)) * (AmbientSky(float3(0, 1, 0)) * 0.9 + gSunColor.rgb * 0.06);
  float3 refl = SkyColor(reflect(-v, n));
  float3 col = lerp(body, refl, saturate(F * 1.1));
  // Sun glitter.
  float3 hh = normalize(gSunDir.xyz + v); float nh = saturate(dot(n, hh));
  col += gSunColor.rgb * pow(nh, 900.0) * 18.0 * fade + gSunColor.rgb * pow(nh, 90.0) * 0.45;
  // Foam where the water is shallow.
  float foam = (1.0 - smoothstep(0.0, 0.9, depthM)) * (0.5 + 0.5 * vnoise(p * 1.6 + t * 0.7));
  col = lerp(col, float3(0.9, 0.92, 0.95) * (gSunColor.rgb * 0.18 + 0.35), saturate(foam * 0.8));
  col = ApplyFog(col, wp);
  return Out(col, dist);
}
