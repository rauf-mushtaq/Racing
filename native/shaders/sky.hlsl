#define NO_SHADOW_MAP 1
#include "common.hlsli"
struct V { float4 pos : SV_Position; float2 ndc : TEXCOORD0; };
V VSMain(uint id : SV_VertexID) {
  float2 p = float2((id << 1) & 2, id & 2); V o; o.ndc = p * float2(2, -2) + float2(-1, 1);
  o.pos = float4(o.ndc, 0.0, 1.0); return o;   // z = 0 is the far plane with reversed-Z
}
float cloudDensity(float2 p) {
  float n = 0.0, a = 0.55, f = 1.0;
  [unroll] for (int i = 0; i < 5; i++) { n += a * vnoise(p * f + i * 9.1); a *= 0.5; f *= 2.05; }
  return n;
}
PSOut PSMain(V i) {
  float4 w = mul(gInvViewProj, float4(i.ndc, 0.0, 1.0)); w.xyz /= w.w;
  float3 d = normalize(w.xyz - gCamPos.xyz);
  float3 col = SkyColor(d);
  float3 sun = gSunDir.xyz; float mu = dot(d, sun);
  // Sun disc.
  col += gSunColor.rgb * 7.0 * smoothstep(0.99989, 0.99996, mu) * step(0.0, d.y);
  // A layer of clouds, lit gold on the sun's side and shaded underneath.
  if (d.y > 0.02) {
    float2 uv = (gCamPos.xz + d.xz * (2600.0 / d.y)) * 0.00018 + float2(gCamPos.w * 0.0004, 0.0);
    float dens = cloudDensity(uv), cov = smoothstep(0.50, 0.72, dens);
    float dens2 = cloudDensity(uv + float2(sun.x, sun.z) * 0.02);                  // density towards the sun: thicker means more shadow
    float lit = saturate(1.0 - (dens2 - dens) * 4.0);
    float dk = gWeather.w;
    float3 cl = lerp(lerp(float3(0.42, 0.40, 0.50), float3(0.52, 0.56, 0.66), dk), lerp(float3(2.6, 1.7, 1.05), float3(2.2, 2.2, 2.3), dk), lit) * (0.7 + 0.3 * saturate(mu * 0.5 + 0.5));
    cl += float3(2.2, 1.2, 0.6) * pow(saturate(mu), 8.0) * lit * 0.6 * (1.0 - dk);                // silver-gold lining towards the sun
    float fadeH = smoothstep(0.02, 0.22, d.y);
    col = lerp(col, cl, cov * fadeH * 0.85);
  }
  return Out(col, 1.0e6);
}
