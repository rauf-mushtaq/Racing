#define NO_SHADOW_MAP 1
#include "common.hlsli"
// 2D overlay: coloured triangles, with text drawn from a font atlas (t0, one channel of coverage).
Texture2D gAtlas : register(t0);
struct VIn { float2 pos : POSITION; float2 uv : TEXCOORD0; float4 col : COLOR0; };
struct V { float4 pos : SV_Position; float2 uv : TEXCOORD0; float4 col : TEXCOORD1; };
V VSMain(VIn i) {
  V o; o.pos = float4(i.pos.x * gScreen.z * 2.0 - 1.0, 1.0 - i.pos.y * gScreen.w * 2.0, 0.0, 1.0); o.uv = i.uv; o.col = i.col; return o;
}
float4 PSMain(V i) : SV_Target { float a = gAtlas.Sample(sLinearClamp, i.uv).r; return float4(i.col.rgb, i.col.a * a); }
