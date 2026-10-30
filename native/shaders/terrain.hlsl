#include "common.hlsli"
// The land: grass, sand, snow, dry lakebed and rock blended from the biome weights stored in
// the vertices, with all the texture detail made procedurally here, so it is as sharp as the
// screen (no texture to run out of pixels). Inside the city square it draws paved ground.
Texture2D gRefl : register(t1);                      // the mirrored city, drawn by the reflection pass (half resolution)
struct VIn { float3 pos : POSITION; float3 nrm : NORMAL; float4 biome : COLOR0; };
struct V { float4 pos : SV_Position; float3 wpos : TEXCOORD0; float3 nrm : TEXCOORD1; float4 biome : TEXCOORD2; float dist : TEXCOORD3; };
V VSMain(VIn i) {
  V o; o.wpos = i.pos; o.nrm = i.nrm; o.biome = i.biome; o.pos = mul(gViewProj, float4(i.pos, 1.0)); o.dist = length(i.pos - gCamPos.xyz); return o;
}
static const float CITY_EDGE = 2176.0;
float RoadHW(float k) { return (fmod(abs(k), 4.0) < 0.5) ? 16.0 : 9.0; }
float RoadMedian(float k) { return (fmod(abs(k), 4.0) < 0.5) ? 2.5 : 0.0; }
float RoadLane(float k) { return (fmod(abs(k), 4.0) < 0.5) ? 4.0 : 3.8; }
float Line(float x, float c, float w, float fp) { return 1.0 - smoothstep(w, w + max(fp * 1.2, 0.02), abs(x - c)); }
// The paved ground of the city: asphalt with worn lanes, markings, crosswalks, stop lines and a median; curbs and paving slabs;
// bare lots between the buildings. hgt is a relief height for the bump (the curb step), reflK how mirror-like the surface is when wet.
float3 CityGround(float2 p, float fp, out float rough, out float hgt, out float reflK) {
  float2 k = round(p / 180.0), rel = p - k * 180.0, d = abs(rel);
  float2 hw = float2(RoadHW(k.x), RoadHW(k.y));
  float g = fbmAA(p, fp, 3.0), g2 = fbmAA(p + 7.0, fp, 11.0), g3 = fbmAA(p * 0.5 + 3.0, fp, 0.3), wet = gWeather.x;
  float far = smoothstep(0.05, 0.6, fp);                                  // fine detail fades as it drops below a pixel
  rough = 0.8; hgt = 0.0; reflK = 0.0;
  bool onZR = d.x < hw.x, onXR = d.y < hw.y;                               // on the north-south road, on the east-west road
  if (onZR || onXR) {
    bool junction = onZR && onXR;
    float a = onZR ? rel.x : rel.y, along = onZR ? rel.y : rel.x, hwr = onZR ? hw.x : hw.y, crossHW = onZR ? hw.y : hw.x, mh = RoadMedian(onZR ? k.x : k.y), lw = RoadLane(onZR ? k.x : k.y);
    if (junction) { a = 0.0; hwr = 16.0; mh = 0.0; lw = 4.0; }
    float aa = abs(a);
    float wear = 0.9 + 0.2 * g2;
    float3 asph = float3(0.17, 0.17, 0.175) * (0.84 + 0.32 * g) * wear * (0.88 + 0.24 * g3);
    // Tyre tracks and oil in the middle of each lane; patches and cracks.
    float t = frac((aa - mh) / lw), trk = exp(-pow((abs(t - 0.5) - 0.2) / 0.075, 2.0)), oil = exp(-pow((t - 0.5) / 0.1, 2.0)) * smoothstep(0.55, 0.75, fbmAA(p, fp, 0.35));
    if (junction) { trk = 0.0; oil = 0.0; }
    asph *= 1.0 - 0.16 * trk * (1.0 - far) - 0.22 * oil * (1.0 - far);
    float crk = (1.0 - smoothstep(0.0, 0.016, abs(fbmAA(p, fp, 0.45) - 0.5))) * (1.0 - far) * 0.55; asph *= 1.0 - crk * 0.6;
    float patch = step(0.62, hash12(floor(p / float2(7.0, 4.0)) + 31.0)) * (1.0 - far); asph *= 1.0 - 0.1 * patch;
    float white = 0.0, yellow = 0.0, conc = 0.0;
    if (!junction) {
      float dash = step(0.55, frac(along / 11.0));
      if (mh > 0.0) {                                                      // boulevard: raised median, dashed lane lines, solid edge lines
        yellow += Line(aa, mh + 0.2, 0.07, fp);
        white += Line(aa, mh + lw, 0.065, fp) * (1.0 - dash) + Line(aa, mh + 2.0 * lw, 0.065, fp) * (1.0 - dash);
        conc = 1.0 - smoothstep(mh - 0.05, mh + 0.05, aa);
      } else { yellow += Line(aa, 0.14, 0.055, fp) + Line(aa, -0.0, 0.0, fp); }   // side street: a solid yellow double line
      white += Line(aa, hwr - 0.45, 0.075, fp);
      // Crosswalks and stop lines either side of each junction.
      float ad = abs(onZR ? rel.y : rel.x) - crossHW, crossRel = onZR ? rel.y : rel.x;
      float cwz = smoothstep(0.9, 1.2, ad) * (1.0 - smoothstep(4.2, 4.5, ad)), zebra = step(frac(aa * 0.9), 0.5) * step(mh + 0.35, aa) * step(aa, hwr - 0.9);
      white += cwz * zebra;
      bool rightLane = onZR ? (a * crossRel > 0.0) : (a * crossRel < 0.0);
      white += Line(ad, 5.6, 0.22, fp) * (rightLane ? 1.0 : 0.0) * step(mh + 0.2, aa) * step(aa, hwr - 0.7);
    }
    float wm = 0.72 * (0.8 + 0.2 * g2) * (1.0 - 0.35 * crk);
    float3 col = lerp(asph, float3(0.74, 0.73, 0.69) * wm, saturate(white));
    col = lerp(col, float3(0.82, 0.60, 0.10) * wm, saturate(yellow));
    // The gutter, and the raised concrete median.
    float gut = smoothstep(hwr - 0.9, hwr - 0.1, aa); col *= 1.0 - 0.35 * gut;
    float3 lawn = lerp(float3(0.055, 0.10, 0.032), float3(0.19, 0.16, 0.075), smoothstep(0.55, 0.78, fbmAA(p, fp, 1.7))) * (0.7 + 0.6 * fbmAA(p + 5.0, fp, 9.0)) * (0.85 + 0.3 * fbmAA(p, fp, 0.25));   // mown grass with dry patches
    float kerbBand = smoothstep(mh - 0.40, mh - 0.32, aa);                                  // a concrete kerb round the planted strip
    float3 median = lerp(lawn, float3(0.46, 0.44, 0.40) * (0.85 + 0.3 * g), kerbBand);
    col = lerp(col, median, conc * (junction ? 0.0 : 1.0)); hgt = 0.0;
    rough = lerp(0.52 + 0.22 * g2 - 0.1 * trk, 0.85, conc);
    float puddle = smoothstep(0.52, 0.66, fbmAA(p, fp, 0.13)) * wet;
    float wetK = saturate(wet * 0.8 + puddle);
    col *= 1.0 - wetK * 0.45 * (1.0 - 0.5 * saturate(white + yellow)); rough = lerp(rough, 0.05, wetK * 0.92); reflK = (1.0 - conc) * wetK;
    return col;
  }
  // Off the roads: curb stone, paving slabs, then the lots the buildings stand on.
  float s = min(d.x - hw.x, d.y - hw.y);
  float puddle = smoothstep(0.55, 0.7, fbmAA(p, fp, 0.2)) * wet;
  if (s < 0.2) { rough = 0.7; hgt = 0.0; reflK = wet * 0.1; return float3(0.46, 0.45, 0.42) * (0.9 + 0.2 * g2); }
  if (s < 5.2) {
    float2 q = frac(p / 1.6); float jd = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)) * 1.6, joint = (1.0 - smoothstep(0.012, 0.012 + fp * 1.2 + 0.01, jd)) * (1.0 - far);
    float tile = hash12(floor(p / 1.6) + 17.0);
    float3 slab = float3(0.40, 0.385, 0.36) * (0.84 + 0.3 * g) * (0.93 + 0.14 * tile) * (0.92 + 0.16 * g2);
    slab *= 1.0 - 0.28 * joint; slab *= 1.0 - 0.18 * smoothstep(0.6, 0.0, s - 0.2);        // grime along the curb
    slab *= 1.0 - wet * 0.3; rough = lerp(0.82, 0.22, wet * 0.8 * (0.5 + 0.5 * puddle)); hgt = 0.0; reflK = wet * 0.28 * (0.4 + puddle);
    return slab;
  }
  hgt = 0.0; float lot = fbmAA(floor(p / 60.0) * 0.37, 1.0, 1.0); float grassy = smoothstep(0.5, 0.62, lot);
  float3 concrete = float3(0.30, 0.285, 0.26) * (0.8 + 0.4 * g) * (0.9 + 0.2 * g2), lawn = lerp(float3(0.17, 0.27, 0.08), float3(0.30, 0.30, 0.12), g2) * (0.7 + 0.6 * g);
  rough = lerp(0.85, 0.95, grassy); reflK = 0.0; return lerp(concrete, lawn, grassy);
}
PSOut PSMain(V i) {
  float3 wp = i.wpos; float dist = length(wp - gCamPos.xyz);
  gSpecP = wp;
  if (wp.x > gP0.x && wp.x < gP0.z && wp.z > gP0.y && wp.z < gP0.w) discard;
  float2 p = wp.xz;
  float fp = max(length(ddx(p)), length(ddy(p)));               // metres per pixel
  float3 n = normalize(i.nrm);
  float slope = 1.0 - n.y;
  float4 bw = i.biome;
  float macro = 0.78 + 0.44 * fbmAA(p, fp, 0.0042);
  float fine = fbmAA(p, fp, 2.7), grit = fbmAA(p + 31.0, fp, 8.0);
  float dry = fbmAA(p, fp, 0.007);
  float rw = saturate(1.0 - fp * 0.7);
  float rip = (0.5 + 0.5 * sin((p.x * 0.8 + p.y * 0.45 + 3.0 * vnoise(p * 0.07)) * 2.4)) * rw;
  float patch = fbmAA(p, fp, 0.035);
  float3 grass = lerp(float3(0.095, 0.165, 0.04), float3(0.27, 0.245, 0.10), saturate(dry * 0.9 + (patch - 0.5) * 1.1)) * (0.62 + 0.76 * fine) * (0.8 + 0.4 * patch) * (0.86 + 0.28 * fbmAA(p + 9.0, fp, 17.0));
  float3 sand = lerp(float3(0.64, 0.46, 0.27), float3(0.80, 0.64, 0.42), fine) * (0.9 + 0.18 * rip) * (0.92 + 0.16 * grit);
  float3 snow = float3(0.90, 0.93, 1.0) * (0.93 + 0.07 * grit);
  float3 lake = lerp(float3(0.66, 0.58, 0.47), float3(0.78, 0.70, 0.58), fine) * (0.93 + 0.07 * grit);
  float3 alb = (grass * bw.x + sand * bw.y + snow * bw.z + lake * bw.w) * macro;
  // Rock on steep ground, textured from the side; banded like sandstone in the desert.
  float3 an = abs(n);
  float rk = (fbmAA(wp.zy, fp, 0.35) * an.x + fbmAA(wp.xy, fp, 0.35) * an.z) / (an.x + an.z + 1e-3);
  float band = 0.5 + 0.5 * sin(wp.y * 0.62 + 3.2 * vnoise(wp.xz * 0.0045) + 1.4 * vnoise(float2(wp.x + wp.z, wp.y) * 0.01));
  float3 rockGrey = float3(0.30, 0.27, 0.25) * (0.55 + 0.9 * rk);
  float3 rockSand = lerp(float3(0.62, 0.38, 0.24), float3(0.44, 0.26, 0.17), band) * (0.7 + 0.6 * rk);
  float3 rock = lerp(rockGrey, rockSand, saturate(bw.y * 1.3));
  float rockW = smoothstep(0.16, 0.40, slope) * (1.0 - 0.3 * bw.z);
  alb = lerp(alb, rock, rockW);
  float rough = clamp(1.0 - bw.z * 0.62 - bw.w * 0.30 - bw.y * 0.05, 0.3, 1.0);
  rough = lerp(rough, 0.9, rockW);
  float sheen = 0.35 + bw.z * 1.0 + bw.w * 0.6;
  float hgt = (fine * 0.5 + grit * 0.35 + rip * bw.y * 0.6 + rk * rockW * 2.0) * 0.05;
  float reflK = 0.0;
  if (max(abs(p.x), abs(p.y)) < CITY_EDGE) { float cr, ch; alb = CityGround(p, fp, cr, ch, reflK); rough = cr; sheen = lerp(0.5, 1.6, saturate(reflK * 1.2)); hgt = ch; }
  // Fine relief near the camera, caught by the low sun (bump from screen-space derivatives, bounded and guarded).
  float nearF = 1.0 - smoothstep(35.0, 120.0, dist);
  float3 dpx = ddx(wp), dpy = ddy(wp);
  float dhx = ddx(hgt), dhy = ddy(hgt);
  float3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  float pxl = max(length(dpx), length(dpy));
  float2 dh = clamp(float2(dhx, dhy) * nearF * 1.3, -0.7 * pxl, 0.7 * pxl);
  float3 nb = abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2);
  float nl = length(nb);
  if (abs(det) > 1e-12 && nl > 1e-12) n = nb / nl;
  float sh = ShadowFactor(wp, n, dist);
  float3 v = normalize(gCamPos.xyz - wp);
  float ndl = saturate(dot(n, gSunDir.xyz));
  float3 col = alb * (gSunColor.rgb * ndl * sh + AmbientSky(n));
  col += SpecularLight(n, v, float3(0.04, 0.04, 0.04), rough, sh) * sheen;
  if (reflK > 0.01 && gWeather.y > 0.0) {                       // wet ground mirrors the city: the reflection pass seen through this pixel, blurred by roughness, fading with Fresnel
    float2 suv = i.pos.xy * gScreen.zw; float2 off = (float2(vnoise(p * 1.7), vnoise(p * 1.7 + 9.0)) - 0.5) * 0.0016 * (0.3 + rough * 3.0);
    float rad = (1.5 + rough * 22.0) * gScreen.z * 2.0; float3 r = 0.0;
    r += gRefl.SampleLevel(sLinearClamp, suv + off, 0).rgb * 0.4;
    r += gRefl.SampleLevel(sLinearClamp, suv + off + float2(rad, rad * 0.5), 0).rgb * 0.15 + gRefl.SampleLevel(sLinearClamp, suv + off + float2(-rad, rad * 0.5), 0).rgb * 0.15;
    r += gRefl.SampleLevel(sLinearClamp, suv + off + float2(rad * 0.5, -rad), 0).rgb * 0.15 + gRefl.SampleLevel(sLinearClamp, suv + off + float2(-rad * 0.5, -rad), 0).rgb * 0.15;
    float nv = saturate(dot(n, v)), Fr = 0.04 + 0.96 * pow(1.0 - nv, 5.0), w = saturate(reflK * (0.25 + 1.1 * Fr));
    col = lerp(col, r * (0.55 + 0.45 * Fr), w);
  }
  col = ApplyFog(col, wp);
  return Out(col, dist);
}
