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
  float3 asph = float3(0.14, 0.14, 0.145) * (0.75 + 0.5 * g) * (0.88 + 0.24 * g2) * (0.85 + 0.3 * g3);
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
// Brick: courses 7.5 cm high with 1 cm mortar, every other course shifted half a brick, each brick its own shade; far away it
// settles to the average colour. h returns the relief (mortar is recessed).
float3 BrickSurface(float2 uv, float fp, float3 baseCol, out float h) {
  float2 sz = float2(0.225, 0.085); float row = floor(uv.y / sz.y); float2 q = float2(uv.x / sz.x + 0.5 * frac(row * 0.5), uv.y / sz.y);
  float2 f = frac(q), id = floor(q); float2 e = min(f, 1.0 - f) * sz; float de = min(e.x, e.y);
  float mort = 1.0 - smoothstep(0.004, 0.004 + max(fp * 1.1, 0.0015), de);
  float rnd = hash12(id + row * 0.13), rnd2 = hash12(id * 1.7 + 5.0);
  float3 brick = baseCol * (0.72 + 0.5 * rnd) * lerp(float3(1.0, 1.0, 1.0), float3(1.1, 0.92, 0.85), rnd2 * 0.5);
  float fade = smoothstep(0.012, 0.07, fp);
  h = -mort * 0.007 * (1.0 - fade);
  return lerp(lerp(brick, float3(0.5, 0.48, 0.45), mort), baseCol * 0.95, fade);
}
PSOut PSMain(V i) {
  float dist = length(i.wpos - gCamPos.xyz);                      // exact per pixel (an interpolated vertex distance is wrong across big faces)
  float3 n = normalize(i.nrm), v = normalize(gCamPos.xyz - i.wpos);
  if (dot(n, v) < 0.0 && gP3.x > 0.5) n = -n;                  // double-sided materials (foliage) light the side facing the camera
  float fpUV = max(length(ddx(i.uv)), length(ddy(i.uv)));            // derivatives are taken outside any branch
  gSpecP = i.wpos;
  float type = gP0.x, sh = ShadowFactor(i.wpos, n, dist);
  float3 col;
  if (type < 0.5) {                                            // plain
    col = Shade(i.col.rgb * gP1.rgb, gP0.z, gP0.y, n, v, sh);
  } else if (type < 1.5) {                                     // car paint: metal flake base under a clear coat
    float3 fp3 = i.wpos * 320.0; float flake = lerp(0.333 * (vnoise(fp3.xy) + vnoise(fp3.yz + 3.1) + vnoise(fp3.zx + 7.7)), 0.5, saturate(dist / 18.0));    // a fine metallic flake (no direction to it) that fades into an even colour with distance
    float3 base = i.col.rgb * gP1.rgb * (0.965 + 0.07 * flake);
    float nv = saturate(dot(n, v)), F = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
    col = Shade(base, 0.16, 0.30 + 0.08 * flake, n, v, sh);                               // the base coat: mostly coloured diffuse with a tinted sheen
    float3 rc = reflect(-v, n);
    col += EnvReflect(rc, i.wpos) * (0.035 + 0.55 * F) * (0.7 + 0.3 * saturate(nv * 2.0));      // the clear coat mirrors the street around the car
    float3 hh = normalize(gSunDir.xyz + v); col += gSunColor.rgb * pow(saturate(dot(n, hh)), 900.0) * 9.0 * sh;   // a tight sun highlight
  } else if (type < 2.5) {                                     // road
    float fp = fpUV; float rough;
    float3 alb = RoadSurface(i.uv, i.col, fp, rough);
    col = Shade(alb, 0.0, rough, n, v, sh);
    col += SpecularLight(n, v, float3(0.04, 0.04, 0.04), rough * 0.55, sh) * 0.6;     // glossy enough to streak in the low sun
  } else if (type < 3.5) {                                     // glass: dark, mirror-like at glancing angles
    float nv = saturate(dot(n, v)), F = 0.04 + 0.96 * pow(1.0 - nv, 4.0);
    col = float3(0.008, 0.012, 0.016) + EnvReflect(reflect(-v, n), i.wpos) * (0.10 + 0.9 * F);
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
    float glassAmt = 0.0, spand = 0.0, lit = 0.0; float3 trimCol = wallCol; bool shop = h < 4.7 && style >= 0.34 && style < 0.75 && wall > 0.5;
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
    float shopEdge = 9.0;
    if (shop) {                                                   // storefronts: glass in dark metal frames between stone piers, a plinth, muted awnings, a fascia board with lettering
      float bay = frac(i.uv.x / 5.0), bid = floor(i.uv.x / 5.0), r2 = hash12(float2(bid, 41.0)), r3 = hash12(float2(bid, 77.0));
      float pier = step(bay, 0.05) + step(0.95, bay), fx = frac(i.uv.x / 1.25);
      float mull = max(step(fx, 0.022) + step(0.978, fx), step(abs(h - 2.55), 0.035));
      float win = step(0.5, h) * step(h, 3.4) * (1.0 - saturate(pier)) * (1.0 - saturate(mull));
      glassAmt = win; roughW = 0.45; shopEdge = min(min(h - 0.5, 3.4 - h), min(fx, 1.0 - fx) * 1.25);
      float3 frameC = lerp(float3(0.045, 0.045, 0.05), float3(0.16, 0.14, 0.11), step(0.6, r3)) * (0.8 + 0.4 * grit2);   // black or bronze aluminium
      float3 pierC = wallCol * 0.8;
      wallCol = lerp(frameC, pierC, saturate(pier)); wallCol = lerp(wallCol, pierC * 0.65, step(h, 0.5));                // a stone plinth
      float aw = step(3.4, h) * step(h, 4.1) * step(r2, 0.45);                                                          // about half the shops have an awning
      float3 awc = r2 < 0.1 ? float3(0.05, 0.08, 0.16) : r2 < 0.2 ? float3(0.05, 0.12, 0.08) : r2 < 0.3 ? float3(0.16, 0.05, 0.06) : r2 < 0.38 ? float3(0.07, 0.07, 0.075) : float3(0.40, 0.37, 0.30);
      awc *= 0.8 + 0.3 * saturate((h - 3.4) / 0.7);
      float sgn = step(4.1, h) * step(h, 4.7);                                                                          // the fascia board
      float3 sc = r3 < 0.3 ? float3(0.045, 0.045, 0.05) : r3 < 0.55 ? float3(0.34, 0.31, 0.26) : r3 < 0.8 ? float3(0.09, 0.12, 0.11) : float3(0.52, 0.50, 0.47);
      float dk = (r3 < 0.3 || (r3 >= 0.55 && r3 < 0.8)) ? 1.0 : 0.0;
      float letters = step(0.6, vnoise(float2(i.uv.x * 6.0, 3.0 + bid * 3.1))) * step(0.12, bay) * step(bay, 0.88) * step(abs(h - 4.4), 0.11) * (1.0 - fade);
      sc = lerp(sc, dk > 0.5 ? float3(0.55, 0.53, 0.48) : float3(0.07, 0.07, 0.08), letters * 0.9);
      wallCol = lerp(wallCol, awc, aw); wallCol = lerp(wallCol, sc, sgn);
    }
    // A cornice and a parapet at the top, and horizontal floor bands on the mid-rise.
    float corn = step(fromTop, 0.45), band = step(fromTop, 1.1) * (1.0 - corn);
    wallCol = lerp(wallCol, wallCol * 1.2, corn) * (1.0 - 0.12 * band); glassAmt *= 1.0 - step(fromTop, 1.6);
    if (n.y > 0.5) { wallCol = float3(0.16, 0.16, 0.17) * (0.8 + 0.4 * grit2); roughW = 0.9; glassAmt = 0.0; }
    lit = step(0.78, rnd) * (style < 0.34 ? 0.8 : 1.0);
    // --- Surface character: brick or panelled concrete, recessed glass, dirt, and the relief that catches the low sun.
    float relief = -0.09 * glassAmt;                                                       // glass sits back from the wall
    float3 baseW = wallCol; float bh = 0.0;
    if (style >= 0.34 && style < 0.67 && glassAmt < 0.5 && !shop) { float3 b = BrickSurface(i.uv, fpUV, wallCol, bh); wallCol = lerp(wallCol, b, 0.85 * wall); relief += bh * wall; }
    else if (style >= 0.67 && glassAmt < 0.5 && !shop) { float sid = frac(h * 2.4); relief += -0.012 * smoothstep(0.0, 0.18, sid) * (1.0 - smoothstep(0.18, 0.4, sid)) * (1.0 - fade) * wall; }   // lapped siding
    else if (style < 0.34) { relief += 0.025 * spand * wall; float seam = 1.0 - smoothstep(0.0, 0.02 + fpUV, abs(frac(i.uv.x / 1.5) - 0.5) * 3.0 - 1.45); relief -= 0.01 * seam * spand; }
    // Concrete grain, weathering streaks running down from sills and ledges, and a darker base where the street splashes up.
    float stain = fbmAA(float2(i.uv.x * 1.8, i.uv.y * 0.09), fpUV, 1.0), grain = fbmAA(i.uv * 9.0, fpUV, 1.0);
    wallCol *= (0.86 + 0.28 * grain) * (0.8 + 0.4 * stain) * lerp(0.62, 1.0, smoothstep(0.0, 3.5, h)) * (1.0 - 0.14 * saturate((1.2 - fromTop) * 0.8));
    wallCol *= 1.0 - 0.22 * (1.0 - fade) * step(0.12, frac(g.y) ) * step(frac(g.y), 0.4) * (1.0 - glassAmt) * (style >= 0.34 ? 1.0 : 0.0) * stain;
    float3 nW = BumpNormal(n, i.wpos, relief, 1.2 * (1.0 - smoothstep(60.0, 220.0, dist)));
    float3 wallLit = Shade(wallCol, 0.0, roughW, nW, v, sh);
    // --- Windows: what is behind the glass (curtains, blinds, a dark room or a lit one) and a reflection of the street opposite.
    float nv = saturate(dot(n, v)), F = 0.05 + 0.95 * pow(1.0 - nv, 4.0), glassK = style < 0.34 ? 0.62 : 0.42;
    float r1 = hash12(cid * 2.3 + 11.0), r2 = hash12(cid * 3.1 + 29.0), dayK = saturate(gWeather.w);
    float3 room = float3(0.018, 0.02, 0.024) * (0.6 + 0.8 * r2);                                       // a dim room seen through tinted glass
    float3 drape = lerp(float3(0.22, 0.19, 0.15), float3(0.15, 0.17, 0.20), r2) * (0.55 + 0.35 * (0.5 + 0.5 * sin(f.x * 44.0))) * 0.5;
    float cover = r1 < 0.16 ? 1.0 : 0.0; float blinds = (r1 >= 0.16 && r1 < 0.36) ? step(frac(f.y * 11.0), 0.62) * step(f.y, 0.4 + 0.5 * r2) : 0.0;
    room = lerp(room, drape, cover * (1.0 - fade * 0.5)); room = lerp(room, float3(0.34, 0.32, 0.28) * 0.22, blinds * (1.0 - fade * 0.6));
    float litAmt = lit * lerp(1.0, 0.08, dayK);                                                          // the lights are on at dusk; by day they hardly show against the glare
    float3 warm = float3(1.0, 0.72, 0.42) * (0.5 + 0.8 * r2) * litAmt * 0.8; room += warm * (1.0 - 0.5 * cover);
    if (shop) room = lerp(room, float3(0.45, 0.38, 0.28) * (0.10 + 0.30 * r1), 0.8 * glassAmt);       // lit shop interiors
    // How deep inside its frame the glass sits: darker within a few centimetres of the reveal.
    float4 wr = style < 0.34 ? float4(0.05, 0.95, 0.24, 0.97) : style < 0.67 ? float4(0.2, 0.8, 0.22, 0.8) : float4(0.27, 0.73, 0.3, 0.78);
    float edgeM = shop ? shopEdge : min(min((f.x - wr.x) * cell.x, (wr.y - f.x) * cell.x), min((f.y - wr.z) * cell.y, (wr.w - f.y) * cell.y));
    float reveal = lerp(0.35, 1.0, saturate(edgeM / 0.12));
    // Sunlight into the recess: the frame throws a shadow across the glass, from the top and from one side, depending on where the sun is.
    float3 Ls = gSunDir.xyz; float lu = abs(n.x) > 0.5 ? Ls.z : Ls.x, ln = max(dot(Ls, n), 0.06);
    float2 shOff = 0.14 * float2(lu, Ls.y) / ln, wsz = float2((wr.y - wr.x) * cell.x, (wr.w - wr.z) * cell.y), wp = float2((f.x - wr.x) * cell.x, (f.y - wr.z) * cell.y) + shOff;
    float sunInGlass = shop ? 1.0 : smoothstep(0.0, 0.05, min(min(wp.x, wsz.x - wp.x), min(wp.y, wsz.y - wp.y)));
    reveal *= lerp(0.8, 1.0, sunInGlass);
    float3 refl = EnvReflect(reflect(-v, n), i.wpos) * (glassK + (1.0 - glassK) * F);
    float3 glass = (room * (1.0 - F) + refl * (0.75 + 0.35 * r1)) * lerp(1.0, reveal, 1.0 - fade * 0.7);
    float3 hh = normalize(gSunDir.xyz + v); glass += gSunColor.rgb * pow(saturate(dot(n, hh)), 300.0) * 5.0 * sh * sunInGlass;
    // A thin frame round every pane catches the light.
    float frameK = glassAmt * (style < 0.34 ? 0.0 : 1.0) * (1.0 - smoothstep(0.0, 0.06 + fpUV, min(min(f.x - 0.2, 0.8 - f.x), min(f.y - 0.22, 0.8 - f.y)))) * (1.0 - fade);
    col = lerp(wallLit, glass, saturate(glassAmt)); col = lerp(col, wallLit * 1.25, frameK * 0.0);
  } else {                                                     // foliage: lit from behind as well
    float ndl = dot(n, gSunDir.xyz), back = saturate(-ndl) * 0.6;
    float3 alb = i.col.rgb * gP1.rgb, tr = float3(1, 1, 1); float spec = 0.35, rgh = 0.55;
    if (i.uv.x > 5.5) {                                        // bark: furrows running up the trunk and branches
      float fur = vnoise(float2((i.wpos.x + i.wpos.z) * 38.0, i.wpos.y * 1.6)), fur2 = vnoise(float2((i.wpos.x - i.wpos.z) * 90.0, i.wpos.y * 5.0));
      alb *= (0.55 + 0.9 * fur) * (0.85 + 0.3 * fur2); back = 0.0; spec = 0.08; rgh = 0.9;
    } else if (i.uv.x > 3.5) {                                 // a leaf: ovate with a pale midrib, light shining through it
      if (LeafKeepAmt(i.uv) < 0.5) discard;
      float lx = i.uv.x - 4.0, rib = smoothstep(0.05, 0.0, abs(lx - 0.5)) * step(0.04, i.uv.y), veins = 0.5 + 0.5 * sin((i.uv.y * 9.0 - abs(lx - 0.5) * 7.0) * 3.14159);
      float fwL = max(abs(ddx(lx)), abs(ddy(lx))), far_ = saturate((fwL - 0.16) * 5.0);
      alb = lerp(alb, alb * float3(1.7, 1.6, 0.9), rib * 0.55 * (1.0 - far_)) * (0.92 + 0.12 * veins * (1.0 - far_)) * lerp(1.0, 0.82, far_);
      back = saturate(-ndl) * 0.9; tr = float3(0.95, 1.0, 0.40);
    } else if (i.uv.x > 1.5) {                                 // a palm frond: a spine with leaflets (a comb cut into the strip)
      float across = abs(i.uv.x - 2.5) * 2.0, along = i.uv.y, nl = 22.0, sgn = sign(i.uv.x - 2.5);
      float q = along * nl - sgn * across * 1.1;
      if (FrondKeepAmt(i.uv) < 0.5) discard;
      alb *= lerp(0.55, 1.25, across) * (0.9 + 0.2 * hash12(floor(float2(q, sgn))));  // darker towards the spine
      alb = lerp(alb, float3(0.40, 0.36, 0.14) * 0.8, step(across, 0.07) * 0.8);        // the pale spine
    } else {
      float lf = vnoise(i.wpos.xz * 3.1 + i.wpos.y * 2.3), lf2 = vnoise(i.wpos.xz * 11.0 + i.wpos.y * 9.0);
      float edgeK = 1.0 - abs(dot(n, v)); if (lf2 < 0.20 * edgeK * edgeK + 0.04 * edgeK) discard;     // ragged leaf-clump edges
      alb *= (0.72 + 0.55 * lf) * (0.85 + 0.3 * lf2);
    }
    col = alb * (gSunColor.rgb * (saturate(ndl) + back * tr) * sh + AmbientSky(n) * 1.05);
    col += SpecularLight(n, v, float3(0.03, 0.03, 0.03), rgh, sh) * spec;
  }
  col = ApplyFog(col, i.wpos);
  return Out(col, dist);
}
