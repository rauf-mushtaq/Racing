#define NO_SHADOW_MAP 1
#include "common.hlsli"
// Billboard particles: smoke, fire, sparks, flashes and tracer streaks. One instance per particle, the quad comes from SV_VertexID.
//   PA = position xyz, size (radius in metres)      PB = colour (HDR rgb, alpha)      PC = second point (streaks) xyz, kind + seed / 100
// kinds: 0 smoke puff (alpha blended), 1 streak (additive), 2 glow (additive, soft round), 3 hard spark (additive, small and sharp)
struct VIn { float4 a : PA; float4 col : PB; float4 b : PC; uint vid : SV_VertexID; };
struct V { float4 pos : SV_Position; float2 uv : TEXCOORD0; float4 col : TEXCOORD1; float kind : TEXCOORD2; float seed : TEXCOORD3; float3 wpos : TEXCOORD4; };
struct POut { float4 c : SV_Target0; float d : SV_Target1; };
V VSMain(VIn i) {
  V o; uint k = i.vid;
  float cx = (k == 1 || k == 2 || k == 4) ? 1.0 : 0.0, cy = (k == 2 || k == 4 || k == 5) ? 1.0 : 0.0;
  float2 q = float2(cx, cy) * 2.0 - 1.0;
  float kind = floor(i.b.w + 0.01), seed = (i.b.w - kind) * 100.0;
  float3 wp;
  if (kind > 0.5 && kind < 1.5) {                                // streak: a ribbon from a to b, always facing the camera
    float3 p = lerp(i.a.xyz, i.b.xyz, cx), dir = i.b.xyz - i.a.xyz, toCam = normalize(gCamPos.xyz - p);
    float3 side = cross(dir, toCam); side = side / max(length(side), 1e-4);
    wp = p + side * q.y * i.a.w;
  } else {
    float3 R = gView[0].xyz, U = gView[1].xyz;
    float rot = seed * 6.2832 * 0.01, c = cos(rot), s = sin(rot);
    float2 r = float2(c * q.x - s * q.y, s * q.x + c * q.y);
    wp = i.a.xyz + (R * r.x + U * r.y) * i.a.w;
  }
  o.pos = mul(gViewProj, float4(wp, 1.0)); o.uv = q; o.col = i.col; o.kind = kind; o.seed = seed; o.wpos = wp;
  return o;
}
POut PSMain(V i) {
  POut o; o.d = 0.0;
  float d = length(i.uv);
  if (i.kind < 0.5) {                                            // smoke: a lumpy soft disc
    float n = vnoise(i.uv * 2.2 + i.seed * 3.7) * 0.6 + vnoise(i.uv * 5.0 + i.seed * 1.3) * 0.4;
    float f = saturate(1.0 - d * (0.85 + 0.35 * n)); f = f * f * (3.0 - 2.0 * f);
    float3 c = ApplyFog(i.col.rgb, i.wpos); float a = i.col.a * f;
    o.c = float4(c * a, a);
  } else if (i.kind < 1.5) {                                     // streak: bright in the middle, soft at the edges and ends
    float across = 1.0 - abs(i.uv.y), along = 1.0 - smoothstep(0.75, 1.0, abs(i.uv.x));
    float f = across * across * along; o.c = float4(i.col.rgb * f * i.col.a, 0.0);
  } else if (i.kind < 2.5) {                                     // glow: fire and flashes
    float f = saturate(1.0 - d); f = f * f * f; o.c = float4(i.col.rgb * f * i.col.a, 0.0);
  } else {                                                       // spark
    float f = saturate(1.0 - d * d * 1.2); o.c = float4(i.col.rgb * f * i.col.a, 0.0);
  }
  return o;
}
