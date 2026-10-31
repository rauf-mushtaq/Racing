#define NO_SHADOW_MAP 1
#include "common.hlsli"
// Depth-only vertex shaders for the shadow cascades (gViewProj is the cascade's matrix).
struct MIn { float3 pos : POSITION; float3 nrm : NORMAL; float4 col : COLOR0; float2 uv : TEXCOORD0; };
float4 VSMain(MIn i) : SV_Position { return mul(gViewProj, mul(gWorld, float4(i.pos, 1.0))); }
struct IIn { float3 pos : POSITION; float3 nrm : NORMAL; float4 col : COLOR0; float2 uv : TEXCOORD0; float4 ia : INSTA; float yaw : INSTB; float4 ic : INSTC; float2 id : INSTD; };
float4 VSInst(IIn i) : SV_Position { return mul(gViewProj, float4(InstanceWorld(i.pos, i.ia, i.yaw, i.id), 1.0)); }
struct TIn { float3 pos : POSITION; float3 nrm : NORMAL; float4 biome : COLOR0; };
float4 VSTerrain(TIn i) : SV_Position { return mul(gViewProj, float4(i.pos, 1.0)); }

// Foliage casts shadows with the same holes as the leaves and fronds.
struct FOut { float4 pos : SV_Position; float3 wp : TEXCOORD0; float2 uv : TEXCOORD1; };
FOut VSInstFoliage(IIn i) { FOut o; float3 wp = InstanceWorld(i.pos, i.ia, i.yaw, i.id); wp += WindDisplace(wp, i.ia.xyz, i.uv); o.pos = mul(gViewProj, float4(wp, 1.0)); o.wp = wp; o.uv = i.uv; return o; }
void PSFoliage(FOut i) {
  if (i.uv.x > 5.5) return;                                                        // bark
  if (i.uv.x > 3.5) { if (LeafKeepAmt(i.uv) < 0.5) discard; return; }              // a leaf of a canopy
  if (i.uv.x > 1.5) { if (FrondKeepAmt(i.uv) < 0.5) discard; return; }              // a palm frond
  if (vnoise(i.wp.xz * 11.0 + i.wp.y * 9.0) < 0.07) discard;                         // ragged clumps (the simple distant trees and shrubs)
}
