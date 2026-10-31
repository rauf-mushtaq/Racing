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
// The lots the buildings stand on, in 60 m squares: a car park with painted bays, a yard of big paving slabs, a lawn with worn paths, or a gravel yard.
float3 LotGround(float2 p, float fp, float g, float g2, out float rough, out float hgt) {
  float2 cell = floor(p / 60.0), q = p - cell * 60.0; float h0 = hash12(cell + 71.0);
  float edge = Thin(min(min(q.x, 60.0 - q.x), min(q.y, 60.0 - q.y)), 0.14, fp);                           // a low kerb round every lot
  float3 col; rough = 0.85; hgt = 0.13;
  if (h0 < 0.32) {                                                                                        // a car park
    float2 stn = AsphaltStones(p, fp); col = float3(0.15, 0.148, 0.145) * (0.85 + 0.3 * g) * stn.x; hgt += stn.y; rough = 0.8;
    float ry = frac(p.y / 17.5) * 17.5, bayRow = (ry < 5.5 || ry > 12.0) ? 1.0 : 0.0, bx = frac(p.x / 2.6) * 2.6;
    float line = Thin(min(bx, 2.6 - bx), 0.055, fp) * bayRow, endL = max(Thin(abs(ry - 5.5), 0.06, fp), Thin(abs(ry - 12.0), 0.06, fp));
    float wearP = smoothstep(0.5, 0.85, fbmAA(p + 5.0, fp, 2.0)), paint = saturate(line + endL) * (1.0 - 0.6 * wearP);
    float2 bay = float2(floor(p.x / 2.6), floor(p.y / 17.5)); float2 oc = float2(1.3, ry < 8.75 ? 2.7 : 14.8); float od = length(float2(bx, ry) - oc);
    float oil = exp(-od * od / 0.22) * step(0.45, hash12(bay + 13.0)) * (1.0 - smoothstep(0.03, 0.2, fp));
    float crack = (fp < 0.05) ? Thin(CellEdge(p, 0.55), 0.004, fp) * smoothstep(0.55, 0.8, fbmAA(p, fp, 0.3)) : 0.0;
    col = lerp(col, float3(0.70, 0.70, 0.66) * 0.75, paint); col *= (1.0 - 0.35 * oil) * (1.0 - 0.55 * crack); rough = lerp(rough, 0.6, paint) - 0.3 * oil; hgt += paint * 0.0013 - crack * 0.002;
  } else if (h0 < 0.55) {                                                                                 // paving slabs
    float2 sq = frac(p / 3.0) * 3.0, sid = floor(p / 3.0); float joint = Thin(min(min(sq.x, 3.0 - sq.x), min(sq.y, 3.0 - sq.y)), 0.014, fp);
    col = float3(0.25, 0.24, 0.225) * (0.80 + 0.36 * hash12(sid + 9.0)) * (0.86 + 0.28 * g) * (0.9 + 0.2 * fbmAA(p, fp, 30.0));
    float crack = (fp < 0.05) ? Thin(CellEdge(p + 4.0, 0.9), 0.004, fp) * smoothstep(0.58, 0.8, fbmAA(p, fp, 0.35)) : 0.0;
    float stain = smoothstep(0.6, 0.85, fbmAA(p, fp, 0.9)); col *= (1.0 - 0.4 * joint) * (1.0 - 0.5 * crack) * (1.0 - 0.25 * stain);
    float weeds = (joint + crack) * step(0.8, vnoise(p * 2.7)) * (1.0 - smoothstep(0.03, 0.12, fp)); col = lerp(col, float3(0.12, 0.2, 0.05), weeds * 0.8);   // weeds in the joints
    hgt += -joint * 0.003; rough = 0.82;
  } else if (h0 < 0.82) {                                                                                 // a lawn with bare earth where people walk
    float dirt = smoothstep(0.60, 0.72, fbmAA(p, fp, 0.14)), blades = fbmAA(p, fp, 55.0), clover = smoothstep(0.62, 0.8, fbmAA(p + 9.0, fp, 1.2));
    float3 grass = lerp(float3(0.10, 0.19, 0.05), float3(0.28, 0.27, 0.10), g2) * (0.7 + 0.6 * g) * (0.8 + 0.4 * blades); grass = lerp(grass, float3(0.08, 0.20, 0.07), clover * 0.5);
    col = lerp(grass, float3(0.30, 0.23, 0.15) * (0.8 + 0.4 * blades), dirt); rough = 0.95; hgt += (blades - 0.5) * 0.006 * (1.0 - smoothstep(0.01, 0.05, fp));
  } else {                                                                                                // a gravel yard with tyre ruts
    float2 stn = AsphaltStones(p * 0.4, fp * 0.4); col = float3(0.37, 0.34, 0.29) * (0.8 + 0.4 * g) * (0.8 + 0.4 * stn.x); hgt += stn.y * 3.0;
    float rut = exp(-pow((abs(frac(p.x / 2.2) - 0.5) - 0.2) / 0.07, 2.0)) * smoothstep(0.4, 0.7, fbmAA(p, fp, 0.2)); col *= 1.0 - 0.3 * rut; rough = 0.92 - 0.2 * rut;
  }
  return col * (1.0 - 0.28 * edge);
}

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
    float seg = onZR ? k.y : k.x, wear = 0.9 + 0.2 * g2, rid = (onZR ? k.x : k.y + 31.0) + 53.0 * seg, ro = frac(rid * 0.6180339);   // rid: this stretch of this road (so every block differs); ro: an offset from it
    float3 asph = float3(0.158, 0.155, 0.152) * (0.87 + 0.26 * g) * wear * (0.91 + 0.18 * g3);
    // Stones and grain, tyre tracks and oil in the middle of each lane.
    float2 stn = AsphaltStones(p, fp); asph *= stn.x; float relief = stn.y;
    float t = frac((aa - mh) / lw), trk = exp(-pow((abs(t - 0.5) - 0.2) / 0.075, 2.0)), oil = exp(-pow((t - 0.5) / 0.1, 2.0)) * smoothstep(0.55, 0.75, fbmAA(p, fp, 0.35));
    if (junction) { trk = 0.0; oil = 0.0; }
    asph *= 1.0 - 0.16 * trk * (1.0 - far) - 0.24 * oil * (1.0 - far);
    // Repair patches: a darker, smoother strip of newer asphalt with a sealed edge, usually running along the road.
    float2 pc = floor(p / float2(17.0, 11.0)); float h0 = hash12(pc + 31.0), h1 = hash12(pc + 3.3), h2 = hash12(pc + 8.8), h3 = hash12(pc + 5.5);
    float patchIn = 0.0, patchEdge = 0.0;
    if (h0 > 0.45) {
      bool alongZ = onZR ? h3 > 0.15 : h3 > 0.85; float2 org = pc * float2(17.0, 11.0) + float2(2.5, 2.0) + float2(h1, h2) * float2(9.0, 5.5);
      float2 hs = alongZ ? float2(0.4 + 0.25 * h1, 2.2 + 3.2 * h2) : float2(2.2 + 3.2 * h2, 0.4 + 0.25 * h1); float2 dq = abs(p - org) - hs; float sd = max(dq.x, dq.y);
      patchIn = 1.0 - smoothstep(-fp, fp + 0.004, sd); patchEdge = Thin(abs(sd), 0.011, fp);
    }
    asph = lerp(asph, asph * lerp(0.76, 0.88, g2), patchIn * (1.0 - far)); relief += patchIn * 0.0022;
    // Cracks: crazed networks in the wheel paths, thermal cracks across the road (some sealed with black tar), and the odd meandering one.
    float crackAmt = patchEdge * 0.9, seal = 0.0;
    float zone = saturate(trk * 1.5) * smoothstep(0.5, 0.74, fbmAA(p + 3.0, fp, 0.22));
    if (zone > 0.01 && fp < 0.05) crackAmt = max(crackAmt, Thin(CellEdge(p, 0.26 + 0.14 * g2), 0.0035 + 0.003 * g, fp) * zone);
    if (!junction) {
      float tp = 9.0, off = ro * tp, ta = along + off, tid = floor(ta / tp), tc = (tid + 0.2 + 0.6 * hash12(float2(tid, rid))) * tp;
      float wob = (vnoise(float2(a * 2.1, tid * 5.1)) - 0.5) * 0.4, dT = abs(ta - tc - wob), tm = smoothstep(0.30, 0.55, vnoise(float2(a * 0.3 + tid * 7.3, 2.0)));
      crackAmt = max(crackAmt, Thin(dT, 0.0055, fp) * tm); seal = Thin(dT, 0.032, fp) * tm * step(0.55, hash12(float2(tid + 3.0, rid)));
      float lseam = abs(frac((aa - mh) / lw + 0.5) - 0.5) * lw;                                        // the joint between two paving strips
      crackAmt = max(crackAmt, Thin(lseam, 0.006, fp) * smoothstep(0.35, 0.65, vnoise(float2(along * 0.4, rid))) * 0.7);
    }
    { float2 cc = floor(p / 6.0); float c0 = hash12(cc + 61.0);                                       // a hairline crack running at an angle across some six-metre squares, wandering as it goes
      if (c0 > 0.62 && fp < 0.05) { float th = hash12(cc + 17.0) * 3.14159, cdx = cos(th), cdy = sin(th); float2 ctr = (cc + 0.3 + 0.4 * float2(hash12(cc + 3.0), hash12(cc + 9.0))) * 6.0, dd = p - ctr;
        float u = dd.x * cdx + dd.y * cdy, v2 = -dd.x * cdy + dd.y * cdx + (vnoise(float2(u * 2.2, c0 * 40.0)) - 0.5) * 0.3;
        crackAmt = max(crackAmt, Thin(abs(v2), 0.0045, fp) * (1.0 - smoothstep(1.4, 2.6, abs(u))) * smoothstep(0.25, 0.5, vnoise(float2(u * 0.8, c0 * 90.0)) + 0.2)); } }
    asph *= 1.0 - 0.62 * crackAmt; asph = lerp(asph, float3(0.035, 0.035, 0.037), seal * 0.85); relief -= crackAmt * 0.0025;
    float white = 0.0, yellow = 0.0, conc = 0.0, zebraAmt = 0.0;
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
      zebraAmt = cwz * zebra; white += zebraAmt;
      bool rightLane = onZR ? (a * crossRel > 0.0) : (a * crossRel < 0.0);
      white += Line(ad, 5.6, 0.22, fp) * (rightLane ? 1.0 : 0.0) * step(mh + 0.2, aa) * step(aa, hwr - 0.7);
      // Braking: two dark rubber streaks in the lane before the stop line.
      float skid = smoothstep(7.0, 8.5, ad) * (1.0 - smoothstep(14.0, 18.0, ad)) * (rightLane ? 1.0 : 0.0) * step(mh + 0.2, aa) * step(0.5, hash12(float2(floor(p / 60.0)) + rid));
      float sk = max(Thin(abs(t - 0.5 - 0.17) * lw, 0.07, fp), Thin(abs(t - 0.5 + 0.17) * lw, 0.07, fp)); asph *= 1.0 - 0.28 * skid * sk * smoothstep(0.4, 0.6, vnoise(p * 3.0 + 5.0));
    }
    // Worn paint: blotchy loss, tyre-worn stripes in the wheel paths, and a ragged edge. Thermoplastic stands a millimetre proud.
    float wearP = smoothstep(0.52, 0.86, fbmAA(p + 21.0, fp, 3.5) * 0.7 + vnoise(p * 23.0) * 0.3);
    white *= 1.0 - 0.72 * wearP; yellow *= 1.0 - 0.55 * wearP; white -= zebraAmt * trk * (0.25 + 0.5 * wearP); white = max(white, 0.0);
    float paint = saturate(white + yellow); relief += paint * 0.0013;
    float wm = 0.72 * (0.8 + 0.2 * g2) * (1.0 - 0.35 * crackAmt) * (0.92 + 0.16 * stn.x * 0.5);
    float3 col = lerp(asph, float3(0.74, 0.73, 0.69) * wm, saturate(white));
    col = lerp(col, float3(0.82, 0.60, 0.10) * wm, saturate(yellow));
    // Manhole covers in the lanes, and storm drains in the gutter.
    float metal = 0.0;
    if (!junction && fp < 0.05) {
      float mp = 43.0, moff = ro * mp, mid = floor((along + moff) / mp), m1 = hash12(float2(mid, rid)), m2 = hash12(float2(mid + 9.0, rid)), m3 = hash12(float2(mid + 19.0, rid));
      if (m1 > 0.45) {
        float mu = (mid + 0.2 + 0.6 * m2) * mp - moff, lat = (m3 < 0.5 ? -1.0 : 1.0) * (mh + lw * (0.5 + floor(m2 * 1.99))); float2 q = float2(along - mu, a - lat);
        if (dot(q, q) < 0.2) { float ring, studs; float lid = Manhole(q, fp, ring, studs); float3 iron = float3(0.07, 0.066, 0.062) * (0.75 + 0.5 * studs) * (0.8 + 0.4 * vnoise(q * 60.0)) * (1.0 + 0.7 * smoothstep(0.27, 0.32, length(q)));
          col = lerp(col, iron, lid); col *= 1.0 - 0.7 * ring; relief += lid * studs * 0.0016 - ring * 0.004; metal = lid; }
      }
      float dp = 29.0, doff = frac(ro * 7.31) * dp, did = floor((along + doff) / dp), d1 = hash12(float2(did, rid + 5.0));
      if (d1 > 0.2) {
        float du = (did + 0.5) * dp - doff; float2 dq = float2(along - du, aa - (hwr - 0.5));
        if (abs(dq.x) < 0.56 && abs(dq.y) < 0.30) {            // an iron gully grate in a frame, its slots running along the kerb
          float frame = max(step(0.46, abs(dq.x)), step(0.215, abs(dq.y))), slot = step(0.5, frac(dq.y / 0.055 + 0.5));
          float3 gr = lerp(float3(0.022, 0.022, 0.024), float3(0.085, 0.082, 0.078) * (0.8 + 0.4 * vnoise(dq * 40.0)), slot); gr = lerp(gr, float3(0.13, 0.125, 0.12), frame);
          float edge = 1.0 - smoothstep(0.0, fp * 1.5 + 0.004, max(abs(dq.x) - 0.56, abs(dq.y) - 0.30) + 0.004);
          col = lerp(col * 0.7, gr, edge); relief -= 0.003 * (1.0 - frame) * (1.0 - slot); metal = max(metal, edge * (frame + slot * (1.0 - frame)) * 0.8); }
      }
    }
    // The gutter, and the raised concrete median.
    float gut = smoothstep(hwr - 0.9, hwr - 0.1, aa); col *= 1.0 - 0.35 * gut; relief += 0.13 * smoothstep(hwr - 0.13, hwr, aa);       // the kerb lip, a chamfer in the light
    float3 lawn = lerp(float3(0.055, 0.10, 0.032), float3(0.19, 0.16, 0.075), 0.6 * smoothstep(0.50, 0.95, fbmAA(p, fp, 1.7))) * (0.7 + 0.6 * fbmAA(p + 5.0, fp, 9.0)) * (0.85 + 0.3 * fbmAA(p, fp, 0.25));   // mown grass with dry patches
    lawn *= (0.80 + 0.40 * fbmAA(p * float2(1.0, 1.0), fp, 48.0)) * (0.94 + 0.06 * step(0.5, frac(a / 1.3)));                   // blades, and mowing stripes
    float kerbBand = smoothstep(mh - 0.40, mh - 0.32, aa);                                  // a concrete kerb round the planted strip
    float3 median = lerp(lawn, float3(0.46, 0.44, 0.40) * (0.85 + 0.3 * g), kerbBand);
    col = lerp(col, median, conc * (junction ? 0.0 : 1.0)); hgt = relief * (1.0 - conc) + conc * 0.012 * (fbmAA(p, fp, 40.0) - 0.5) + conc * 0.10 * kerbBand;
    rough = lerp(0.74 + 0.16 * g2 - 0.16 * trk - 0.28 * seal - 0.30 * paint, 0.9, conc); rough = lerp(rough, 0.3, metal * 0.8);
    float puddle = smoothstep(0.52, 0.66, fbmAA(p, fp, 0.13)) * wet;
    float wetK = saturate(wet * 0.8 + puddle);
    col *= 1.0 - wetK * 0.45 * (1.0 - 0.5 * saturate(white + yellow)); rough = lerp(rough, 0.05, wetK * 0.92); reflK = (1.0 - conc) * wetK;
    return col;
  }
  // Off the roads: curb stone, paving slabs, then the lots the buildings stand on.
  float s = min(d.x - hw.x, d.y - hw.y);
  float puddle = smoothstep(0.55, 0.7, fbmAA(p, fp, 0.2)) * wet;
  if (s < 0.2) { rough = 0.7; hgt = 0.13 + 0.004 * (g2 - 0.5); reflK = wet * 0.1; return float3(0.46, 0.45, 0.42) * (0.9 + 0.2 * g2); }
  if (s < 5.2) {
    float2 q = frac(p / 1.6); float jd = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y)) * 1.6, joint = (1.0 - smoothstep(0.012, 0.012 + fp * 1.2 + 0.01, jd)) * (1.0 - far);
    float tile = hash12(floor(p / 1.6) + 17.0);
    float3 slab = float3(0.40, 0.385, 0.36) * (0.84 + 0.3 * g) * (0.93 + 0.14 * tile) * (0.92 + 0.16 * g2);
    slab *= 1.0 - 0.28 * joint; slab *= 1.0 - 0.18 * smoothstep(0.6, 0.0, s - 0.2);        // grime along the curb
    float2 sg = float2(vnoise(p * 2.3), vnoise(p * 2.3 + 5.0)); slab *= (0.9 + 0.2 * fbmAA(p, fp, 0.9)) * (1.0 - 0.18 * smoothstep(0.62, 0.9, sg.x * sg.y * 2.0));   // stains and dark patches where it stays damp
    float sc = (fp < 0.05) ? Thin(CellEdge(p + 3.0, 0.9 + 0.5 * g2), 0.0035, fp) * smoothstep(0.58, 0.8, fbmAA(p + 9.0, fp, 0.35)) : 0.0; slab *= 1.0 - 0.55 * sc;   // hairline cracks in some slabs
    float gum = 0.0; if (fp < 0.02) { float2 gq = p / 0.35, gid = floor(gq); if (hash12(gid + 3.0) > 0.96) { float2 gc = (float2(hash12(gid + 7.0), hash12(gid + 13.0)) - 0.5) * 0.6; float gr = 0.022 + 0.02 * hash12(gid + 19.0); gum = (1.0 - smoothstep(gr * 0.6, gr, length((frac(gq) - 0.5 - gc) * 0.35))) * (1.0 - smoothstep(0.008, 0.02, fp)); } } slab = lerp(slab, slab * float3(0.5, 0.47, 0.45), gum * 0.8);   // the odd bit of chewing gum, round and soft-edged
    slab *= 1.0 - wet * 0.3; rough = lerp(0.82, 0.22, wet * 0.8 * (0.5 + 0.5 * puddle)); hgt = 0.13 - 0.0025 * joint; reflK = wet * 0.28 * (0.4 + puddle);
    return slab;
  }
  reflK = 0.0; return LotGround(p, fp, g, g2, rough, hgt);
}
PSOut PSMain(V i) {
  float3 wp = i.wpos; float dist = length(wp - gCamPos.xyz);
  gSpecP = wp; gPix = i.pos.xy;
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
  float3 col = alb * (gSunColor.rgb * ndl * sh + AmbientLight(n, wp));
  col += SpecularLight(n, v, float3(0.04, 0.04, 0.04), rough, sh) * sheen;
  if (reflK > 0.01 && gWeather.y > 0.0) {                       // wet ground mirrors the city: the reflection pass seen through this pixel, blurred by roughness, fading with Fresnel
    float2 suv = i.pos.xy * gScreen.zw; float2 off = (float2(vnoise(p * 1.7), vnoise(p * 1.7 + 9.0)) - 0.5) * 0.0016 * (0.3 + rough * 3.0);
    float rad = (2.5 + rough * 22.0) * gScreen.z * 2.0, ang = IGN(gPix + 7.0) * 6.2831853, cs = cos(ang), sn = sin(ang); float2x2 rot = float2x2(cs, -sn, sn, cs);
    float3 r = gRefl.SampleLevel(sLinearClamp, suv + off, 0).rgb * 0.2;                // a ring of taps turned a different way at every pixel, so the half-resolution reflection never shows its steps
    [unroll] for (int tq = 0; tq < 8; tq++) r += gRefl.SampleLevel(sLinearClamp, suv + off + mul(rot, kDisk16[tq * 2 + 1]) * rad, 0).rgb * 0.1;
    float nv = saturate(dot(n, v)), Fr = 0.04 + 0.96 * pow(1.0 - nv, 5.0), w = saturate(reflK * (0.25 + 1.1 * Fr));
    col = lerp(col, r * (0.55 + 0.45 * Fr), w);
  }
  col = ApplyFog(col, wp);
  return Out(col, dist);
}
