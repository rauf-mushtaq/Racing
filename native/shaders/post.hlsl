#define NO_SHADOW_MAP 1
#include "common.hlsli"
// Full-screen passes: bloom (down and up), and the final composite (grade, sharpen, lens
// fringe, sun shafts, tone mapping, vignette, grain).
Texture2D gTex0 : register(t0);
Texture2D gTex1 : register(t1);
Texture2D gTex2 : register(t2);
struct V { float4 pos : SV_Position; float2 uv : TEXCOORD0; };
V VSFull(uint id : SV_VertexID) {
  float2 p = float2((id << 1) & 2, id & 2); V o; o.uv = p; o.pos = float4(p * float2(2, -2) + float2(-1, 1), 0.0, 1.0); return o;
}
float3 karis(float3 c) { return c / (1.0 + dot(c, float3(0.2126, 0.7152, 0.0722))); }
// First bloom step: a 13-tap downsample of the scene with the brightest pixels weighted down (no fireflies).
float4 PSBloomFirst(V i) : SV_Target {
  float2 t = gP0.xy;   // texel size of the source
  float3 a = gTex0.Sample(sLinearClamp, i.uv + t * float2(-2, -2)).rgb, b = gTex0.Sample(sLinearClamp, i.uv + t * float2(0, -2)).rgb, c = gTex0.Sample(sLinearClamp, i.uv + t * float2(2, -2)).rgb;
  float3 d = gTex0.Sample(sLinearClamp, i.uv + t * float2(-2, 0)).rgb, e = gTex0.Sample(sLinearClamp, i.uv).rgb, f = gTex0.Sample(sLinearClamp, i.uv + t * float2(2, 0)).rgb;
  float3 g = gTex0.Sample(sLinearClamp, i.uv + t * float2(-2, 2)).rgb, h = gTex0.Sample(sLinearClamp, i.uv + t * float2(0, 2)).rgb, k = gTex0.Sample(sLinearClamp, i.uv + t * float2(2, 2)).rgb;
  float3 j = gTex0.Sample(sLinearClamp, i.uv + t * float2(-1, -1)).rgb, l = gTex0.Sample(sLinearClamp, i.uv + t * float2(1, -1)).rgb, m = gTex0.Sample(sLinearClamp, i.uv + t * float2(-1, 1)).rgb, n = gTex0.Sample(sLinearClamp, i.uv + t * float2(1, 1)).rgb;
  float3 g0 = (karis(a) + karis(b) + karis(d) + karis(e)) * 0.25, g1 = (karis(b) + karis(c) + karis(e) + karis(f)) * 0.25;
  float3 g2 = (karis(d) + karis(e) + karis(g) + karis(h)) * 0.25, g3 = (karis(e) + karis(f) + karis(h) + karis(k)) * 0.25, g4 = (karis(j) + karis(l) + karis(m) + karis(n)) * 0.25;
  float3 r = g4 * 0.5 + (g0 + g1 + g2 + g3) * 0.125;
  float3 bright = r / max(1.0 - dot(r, float3(0.2126, 0.7152, 0.0722)), 0.05);   // undo the Karis weight
  float lum = dot(bright, float3(0.2126, 0.7152, 0.0722));
  return float4(bright * smoothstep(1.0, 2.2, lum), 1.0);
}
float4 PSBloomDown(V i) : SV_Target {
  float2 t = gP0.xy; float3 s = 0;
  s += gTex0.Sample(sLinearClamp, i.uv).rgb * 4.0;
  s += gTex0.Sample(sLinearClamp, i.uv + t * float2(-1, -1)).rgb + gTex0.Sample(sLinearClamp, i.uv + t * float2(1, -1)).rgb + gTex0.Sample(sLinearClamp, i.uv + t * float2(-1, 1)).rgb + gTex0.Sample(sLinearClamp, i.uv + t * float2(1, 1)).rgb;
  return float4(s / 8.0, 1.0);
}
float4 PSBloomUp(V i) : SV_Target {   // blended additively onto the next level up
  float2 t = gP0.xy; float3 s = 0;
  s += gTex0.Sample(sLinearClamp, i.uv + t * float2(-1, 0)).rgb * 2 + gTex0.Sample(sLinearClamp, i.uv + t * float2(1, 0)).rgb * 2 + gTex0.Sample(sLinearClamp, i.uv + t * float2(0, -1)).rgb * 2 + gTex0.Sample(sLinearClamp, i.uv + t * float2(0, 1)).rgb * 2;
  s += gTex0.Sample(sLinearClamp, i.uv + t * float2(-1, -1)).rgb + gTex0.Sample(sLinearClamp, i.uv + t * float2(1, -1)).rgb + gTex0.Sample(sLinearClamp, i.uv + t * float2(-1, 1)).rgb + gTex0.Sample(sLinearClamp, i.uv + t * float2(1, 1)).rgb;
  return float4(s / 12.0 * gP0.z, 1.0);
}
float3 ACES(float3 x) { return saturate((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)); }
float3 toSRGB(float3 c) { float3 lo = c * 12.92, hi = 1.055 * pow(max(c, 0.0), 1.0 / 2.4) - 0.055; return lerp(lo, hi, step(0.0031308, c)); }
// Depth of field and camera motion blur in one pass: t0 = scene colour, t1 = view distance.
// p0 = (focus distance in metres, depth-of-field strength, largest blur radius in pixels, shutter scale).
float2 DiskOff(int k, int n) { float r = sqrt((k + 0.5) / n), a = k * 2.39996; return float2(cos(a), sin(a)) * r; }
float CocAt(float z, float focus, float strength, float maxR) { float x = max(0.0, abs(1.0 / focus - 1.0 / max(z, 0.3)) - 0.045); return min(x * strength, maxR); }
float4 PSDof(V i) : SV_Target {
  float2 uv = i.uv, tx = gScreen.zw; int2 pix = int2(uv * gScreen.xy);
  float z = gTex1.Load(int3(clamp(pix, 0, int2(gScreen.xy) - 1), 0)).r;
  float4 w4 = mul(gInvViewProj, float4(uv * float2(2, -2) + float2(-1, 1), 0.5, 1.0)); float3 rd = normalize(w4.xyz / w4.w - gCamPos.xyz);
  float3 wp = gCamPos.xyz + rd * min(z, 20000.0);
  float4 pc = mul(gPrevVP, float4(wp, 1.0)); float2 prev = pc.xy / pc.w * float2(0.5, -0.5) + 0.5;
  float2 vel = (uv - prev) * gP0.w; float vl = length(vel); if (vl > 0.035) vel *= 0.035 / vl;
  float coc = CocAt(z, gP0.x, gP0.y, gP0.z);
  if (coc < 0.5 && vl < 0.0007) return gTex0.SampleLevel(sLinearClamp, uv, 0);
  float3 acc = gTex0.SampleLevel(sLinearClamp, uv, 0).rgb; float wsum = 1.0;
  [unroll] for (int k = 0; k < 14; k++) {
    float t = (k + 0.5) / 14.0 - 0.5; float2 off = vel * t + DiskOff(k, 14) * coc * tx;
    float2 suv = uv + off; float sz = gTex1.SampleLevel(sLinearClamp, suv, 0).r, sc = CocAt(sz, gP0.x, gP0.y, gP0.z);
    float wgt = (sz >= z - 1.0) ? 1.0 : saturate(sc / max(coc, 0.5));            // a sharp foreground doesn't smear over what is behind it
    acc += gTex0.SampleLevel(sLinearClamp, suv, 0).rgb * wgt; wsum += wgt;
  }
  return float4(acc / wsum, 1.0);
}
float4 PSComposite(V i) : SV_Target {
  float2 uv = i.uv, tx = gScreen.zw;
  float2 dir = uv - 0.5; float d = length(dir);
  float3 col = gTex0.Sample(sLinearClamp, uv).rgb;
  // A faint lens fringe towards the corners.
  col.r = gTex0.Sample(sLinearClamp, uv + dir * (gParams.w * d)).r; col.b = gTex0.Sample(sLinearClamp, uv - dir * (gParams.w * d)).b;
  // Sharpen (1 px) and clarity (wider), both held within a band round the original so highlights don't ring.
  float3 nb = gTex0.Sample(sLinearClamp, uv + float2(tx.x, 0)).rgb + gTex0.Sample(sLinearClamp, uv - float2(tx.x, 0)).rgb + gTex0.Sample(sLinearClamp, uv + float2(0, tx.y)).rgb + gTex0.Sample(sLinearClamp, uv - float2(0, tx.y)).rgb;
  col = clamp(col + (col - nb * 0.25) * gParams2.x, col * 0.75, col * 1.3 + 0.01);
  float2 o = tx * 2.4;
  float3 wide = (gTex0.Sample(sLinearClamp, uv + o).rgb + gTex0.Sample(sLinearClamp, uv - o).rgb + gTex0.Sample(sLinearClamp, uv + float2(o.x, -o.y)).rgb + gTex0.Sample(sLinearClamp, uv + float2(-o.x, o.y)).rgb) * 0.25;
  col = clamp(col + (col - wide) * gParams2.y, col * 0.7, col * 1.35 + 0.01);
  // Ambient occlusion.
  col *= lerp(1.0, gTex2.Sample(sLinearClamp, uv).r, gParams.y);
  // Sun shafts: smear the brightest parts of the picture towards the sun.
  if (gParams2.w * gSunScreen.z > 0.002) {
    float2 dv = (gSunScreen.xy - uv) * (0.9 / 24.0), suv = uv; float w = 1.0; float3 acc = 0;
    [unroll] for (int k = 0; k < 24; k++) { suv += dv; float3 s = gTex0.SampleLevel(sLinearClamp, suv, 0).rgb; acc += s * smoothstep(2.4, 8.0, max(max(s.r, s.g), s.b)) * w; w *= 0.94; }
    col += acc / 24.0 * gParams2.w * gSunScreen.z * float3(1.0, 0.82, 0.58);
  }
  col += gTex1.Sample(sLinearClamp, uv).rgb * gParams.x;
  // Vignette, then the colour grade: a warm/cool split tone, saturation and contrast, in linear light.
  col *= lerp(1.0 - gParams2.z, 1.0, 1.0 - smoothstep(0.3, 1.1, d));
  float l = dot(col, float3(0.2126, 0.7152, 0.0722));
  col = lerp(col, lerp(col * float3(0.94, 0.97, 1.08), col * float3(1.04, 1.0, 0.95), smoothstep(0.0, 0.7, l)), 0.5);   // cool shadows, warm lights
  col = max(0.0, lerp(l.xxx, col, 0.93));                // a slightly restrained saturation: real colour is quieter than a game's
  col = 0.18 * pow(col / 0.18, 1.22.xxx);                // a firmer contrast curve: real light has deep shadows
  col *= gSunDir.w;                                  // exposure
  col = ACES(col);
  col = toSRGB(col);
  float g = frac(sin(dot(uv * 1000.0 + gCamPos.w, float2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * gParams.z;
  return float4(col, 1.0);
}
// Ambient occlusion from the resolved depth (t0 = view distance), half resolution; output 1 = no occlusion.
float linZ(float2 uv) { return gTex0.Load(int3(clamp(uv * gScreen.xy, 0.0, gScreen.xy - 1.0), 0)).r; }
float3 viewPos(float2 uv, float z) {
  float4 w = mul(gInvViewProj, float4(uv * float2(2, -2) + float2(-1, 1), 0.5, 1.0)); w.xyz /= w.w;   // any point on the ray
  float3 rd = normalize(w.xyz - gCamPos.xyz);
  return gCamPos.xyz + rd * z;
}
float4 PSAO(V i) : SV_Target {
  float2 uv = i.uv, tx = gP0.xy;
  float zc = linZ(uv);
  if (zc > 3000.0) return 1.0;
  float3 P = viewPos(uv, zc);
  float2 uR = uv + float2(tx.x, 0), uL = uv - float2(tx.x, 0), uU = uv + float2(0, tx.y), uD = uv - float2(0, tx.y);
  float3 Pr = viewPos(uR, linZ(uR)), Pl = viewPos(uL, linZ(uL)), Pu = viewPos(uU, linZ(uU)), Pd = viewPos(uD, linZ(uD));
  float3 dx = abs(length(Pr - gCamPos.xyz) - zc) < abs(zc - length(Pl - gCamPos.xyz)) ? Pr - P : P - Pl;
  float3 dy = abs(length(Pu - gCamPos.xyz) - zc) < abs(zc - length(Pd - gCamPos.xyz)) ? Pu - P : P - Pd;
  float3 N = cross(dx, dy); float nl = length(N); if (nl < 1e-8) return 1.0; N /= nl;
  if (dot(N, P - gCamPos.xyz) > 0.0) N = -N;
  int2 ip = (int2)(i.pos.xy) & 3;
  float bayer = float(((ip.x * 5 + ip.y * 3) * 7) & 15) / 16.0 + 0.03;
  float ang0 = bayer * 6.2831853;
  float radius = gP0.z, focal = 0.5 * gScreen.y * 0.5 / gP0.w;     // pixels at the half-res target per metre at one metre
  float rpix = min(radius * focal / zc, 48.0);
  float occ = 0.0;
  [unroll] for (int k = 0; k < 12; k++) {
    float f = (k + 0.5) / 12.0, a = ang0 + k * 2.399963;
    float2 suv = uv + float2(cos(a), sin(a)) * (sqrt(f) * rpix) * tx;
    float3 S = viewPos(suv, linZ(suv)), v = S - P; float dd = length(v) + 1e-4;
    occ += max(0.0, dot(N, v) / dd - 0.18) * saturate(1.0 - dd / radius);
  }
  float ao = 1.0 - saturate(occ / 12.0 * 3.2);
  ao = lerp(ao, 1.0, smoothstep(70.0, 260.0, zc));
  return float4(ao.xxx, 1.0);
}
float4 PSAOBlur(V i) : SV_Target {   // 4x4 depth-aware blur that cancels the dither pattern
  float2 tx = gP0.xy; float zc = linZ(i.uv), sum = 0.0, ws = 0.0;
  if (zc > 3000.0) return 1.0;
  [unroll] for (int j = -2; j < 2; j++) [unroll] for (int k = -2; k < 2; k++) {
    float2 uv = i.uv + (float2(k, j) + 0.5) * tx;
    float z = linZ(uv), w = exp(-abs(z - zc) / (0.04 * zc + 0.05));
    sum += gTex1.SampleLevel(sLinearClamp, uv, 0).r * w; ws += w;
  }
  return float4((sum / max(ws, 1e-4)).xxx, 1.0);
}
