#define NO_SHADOW_MAP 1
#include "common.hlsli"
// Depth-only vertex shaders for the shadow cascades (gViewProj is the cascade's matrix).
struct MIn { float3 pos : POSITION; float3 nrm : NORMAL; float4 col : COLOR0; float2 uv : TEXCOORD0; };
float4 VSMain(MIn i) : SV_Position { return mul(gViewProj, mul(gWorld, float4(i.pos, 1.0))); }
struct IIn { float3 pos : POSITION; float3 nrm : NORMAL; float4 col : COLOR0; float2 uv : TEXCOORD0; float4 ia : INSTA; float yaw : INSTB; float4 ic : INSTC; float2 id : INSTD; };
float4 VSInst(IIn i) : SV_Position { return mul(gViewProj, float4(InstanceWorld(i.pos, i.ia, i.yaw, i.id), 1.0)); }
struct TIn { float3 pos : POSITION; float3 nrm : NORMAL; float4 biome : COLOR0; };
float4 VSTerrain(TIn i) : SV_Position { return mul(gViewProj, float4(i.pos, 1.0)); }
