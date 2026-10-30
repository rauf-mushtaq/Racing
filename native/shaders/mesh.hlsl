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
struct V { float4 pos : SV_Position; float3 wpos : TEXCOORD0; float3 nrm : TEXCOORD1; float4 col : TEXCOORD2; float2 uv : TEXCOORD3; float dist : TEXCOORD4; float top : TEXCOORD5; };
V VSMain(VIn i) {
  V o;
#ifdef INSTANCED
  float3 wp = InstanceWorld(i.pos, i.ia, i.yaw, i.id); o.nrm = InstanceNormal(i.nrm, i.yaw); o.col = i.col * i.ic * 2.0;   // instance tints are stored halved, so 0.5 is neutral
#else
  float3 wp = mul(gWorld, float4(i.pos, 1.0)).xyz; o.nrm = mul((float3x3)gWorld, i.nrm); o.col = i.col;
#endif
  o.wpos = wp; o.pos = mul(gViewProj, float4(wp, 1.0)); o.uv = i.uv; o.dist = length(wp - gCamPos.xyz); o.top = 0.0;
#ifdef INSTANCED
  if (gP0.x > 5.5) {                                           // buildings: wall coordinates in metres (across, up) for the facade
    float3 dims = float3(i.ia.w, i.ia.w * (i.id.x > 0.0 ? i.id.x : 1.0), i.ia.w * (i.id.y > 0.0 ? i.id.y : 1.0));
    float2 wuv = abs(i.nrm.x) > 0.5 ? float2(i.pos.z * dims.z, i.pos.y * dims.y) : float2(i.pos.x * dims.x, i.pos.y * dims.y);
    o.uv = wuv + float2(i.ia.x * 0.37 + i.ia.z * 0.91, 0.0); o.col = float4(i.col.rgb * i.ic.rgb * 2.0, i.ic.a); o.top = dims.y;
  }
#endif
  return o;
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
  float dist = length(i.wpos - gCamPos.xyz);                      // exact per pixel (an interpolated vertex distance is wrong across big faces)
  float3 n = normalize(i.nrm), v = normalize(gCamPos.xyz - i.wpos);
  if (dot(n, v) < 0.0 && gP3.x > 0.5) n = -n;                  // double-sided materials (foliage) light the side facing the camera
  float fpUV = max(length(ddx(i.uv)), length(ddy(i.uv)));            // derivatives are taken outside any branch
  float type = gP0.x, sh = ShadowFactor(i.wpos, n, dist);
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
  } else if (type > 5.5) {                                     // building facade
    float style = i.col.a, wall = step(abs(n.y), 0.5), h = i.uv.y, fromTop = i.top - h;
    float2 cell = style < 0.34 ? float2(1.7, 3.8) : style < 0.67 ? float2(3.0, 3.7) : float2(3.4, 3.2);
    float2 g = i.uv / cell, f = frac(g), cid = floor(g);
    float fade = saturate(fpUV / (cell.x * 0.4));                 // detail smaller than a couple of pixels blurs into its average
    float rnd = lerp(hash12(cid * 1.7 + 3.0), 0.5, fade), grit = fbmAA(i.uv * 0.25, fpUV, 1.0), grit2 = fbmAA(i.uv * 1.3, fpUV, 1.0);
    float3 wallCol = i.col.rgb * (0.84 + 0.3 * grit) * lerp(0.72, 1.0, saturate(h * 0.04 + 0.4)); float roughW = 0.85;
    float glassAmt = 0.0, spand = 0.0, lit = 0.0; float3 trimCol = wallCol; bool shop = h < 4.7 && style >= 0.34 && wall > 0.5;
    if (style < 0.34) {                                           // curtain wall: glass between floors, an opaque spandrel panel at each floor edge, thin mullions
      float mul_ = step(0.05, f.x) * step(f.x, 0.95); spand = 1.0 - step(0.24, f.y);
      glassAmt = mul_ * (1.0 - spand) * step(f.y, 0.97) * wall; wallCol = lerp(i.col.rgb * 0.55, float3(0.12, 0.17, 0.2), 0.6) * (0.8 + 0.4 * grit2); roughW = 0.35;
      if (h < 4.2) { glassAmt = wall * step(0.06, frac(i.uv.x / 3.4)) * step(h, 3.9) * step(0.3, h); wallCol = float3(0.1, 0.1, 0.11); }   // the lobby: tall glazing in a dark frame
    } else if (style < 0.67) {                                    // punched windows in a wall with pilasters, sills and lintels
      float2 mar = float2(0.2, 0.2); float inW = step(mar.x, f.x) * step(f.x, 1.0 - mar.x) * step(0.22, f.y) * step(f.y, 0.8);
      float pil = step(frac(g.x / 3.0), 0.09); trimCol = wallCol * 1.12; glassAmt = inW * wall * (1.0 - pil);
      float sill = step(0.17, f.y) * step(f.y, 0.22) * step(mar.x - 0.04, f.x) * step(f.x, 1.0 - mar.x + 0.04), lintel = step(0.8, f.y) * step(f.y, 0.86) * step(mar.x - 0.04, f.x) * step(f.x, 1.0 - mar.x + 0.04);
      wallCol = lerp(wallCol, trimCol * 1.18, saturate(sill + lintel + pil)); wallCol *= 1.0 - 0.18 * step(0.995, 1.0 - abs(frac(h / 3.7) - 0.0) * 0.0);
      roughW = 0.8;
    } else {                                                      // houses and low-rise: small windows, plain walls with horizontal siding lines
      float inW = step(0.27, f.x) * step(f.x, 0.73) * step(0.3, f.y) * step(f.y, 0.78); glassAmt = inW * wall * step(2.0, h);
      wallCol *= 1.0 - 0.08 * step(0.5, frac(h * 2.4)) * (1.0 - fade); roughW = 0.75;
    }
    glassAmt = lerp(glassAmt, 0.0, 0.0) * step(2.0, h + (style < 0.34 ? 3.0 : 0.0));
    if (shop) {                                                   // storefronts: big glass between piers, an awning in a bold colour, a sign band
      float bay = frac(i.uv.x / 5.0), bid = floor(i.uv.x / 5.0), r2 = hash12(float2(bid, floor(i.uv.y * 0.0) + 41.0) + cid * 0.0);
      float pier = step(bay, 0.07) + step(0.93, bay), win = step(0.35, h) * step(h, 3.25) * (1.0 - saturate(pier));
      glassAmt = win; wallCol = float3(0.14, 0.14, 0.15) * (0.8 + 0.4 * grit2); roughW = 0.5;
      float aw = step(3.25, h) * step(h, 4.2); float3 awc = lerp(float3(0.75, 0.12, 0.1), float3(0.1, 0.35, 0.65), step(0.5, r2)); awc = lerp(awc, float3(0.85, 0.7, 0.2), step(0.8, r2)); awc *= 0.8 + 0.3 * step(0.5, frac(i.uv.x * 1.4));
      wallCol = lerp(wallCol, awc, aw); float sgn = step(4.2, h) * step(h, 4.65); float3 sc = lerp(float3(0.08, 0.08, 0.09), float3(0.9, 0.85, 0.7), step(0.55, vnoise(float2(i.uv.x * 3.0, 5.0 + bid))) * step(0.1, bay) * step(bay, 0.9)); wallCol = lerp(wallCol, sc, sgn);
    }
    // A cornice and a parapet at the top, and horizontal floor bands on the mid-rise.
    float corn = step(fromTop, 0.45), band = step(fromTop, 1.1) * (1.0 - corn);
    wallCol = lerp(wallCol, wallCol * 1.2, corn) * (1.0 - 0.12 * band); glassAmt *= 1.0 - step(fromTop, 1.6);
    if (n.y > 0.5) { wallCol = float3(0.16, 0.16, 0.17) * (0.8 + 0.4 * grit2); roughW = 0.9; glassAmt = 0.0; }
    lit = step(0.78, rnd) * (style < 0.34 ? 0.8 : 1.0);
    float3 wallLit = Shade(wallCol, 0.0, roughW, n, v, sh);
    float nv = saturate(dot(n, v)), F = 0.05 + 0.95 * pow(1.0 - nv, 3.0), glassK = style < 0.34 ? 0.6 : 0.32;
    float3 gtint = lerp(float3(0.55, 0.78, 0.9), float3(0.85, 0.9, 0.8), rnd) * (0.7 + 0.5 * rnd);
    float3 glass = gtint * 0.05 + SkyColor(reflect(-v, n)) * (glassK + (1.0 - glassK) * F) * (0.65 + 0.5 * rnd);
    float3 hh = normalize(gSunDir.xyz + v); glass += gSunColor.rgb * pow(saturate(dot(n, hh)), 250.0) * 6.0 * sh;
    glass += float3(1.0, 0.72, 0.38) * lit * (1.0 - F) * 0.55 * (1.0 - nv * 0.3);         // warm lights on inside
    col = lerp(wallLit, glass, saturate(glassAmt));
  } else {                                                     // foliage: lit from behind as well
    float ndl = dot(n, gSunDir.xyz), back = saturate(-ndl) * 0.55;
    float3 alb = i.col.rgb * gP1.rgb;
    col = alb * (gSunColor.rgb * (saturate(ndl) + back) * sh + AmbientSky(n) * 1.1);
  }
  col = ApplyFog(col, i.wpos);
  return Out(col, dist);
}
