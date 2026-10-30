// Shared by every shader: frame constants, noise, the analytic sky (also used for
// ambient light and reflections), the height- and sun-aware haze, and shadows.
// Matrices are row-major and used as mul(M, v) (the compiler is told to pack them that way).

cbuffer Frame : register(b0) {
  float4x4 gViewProj; float4x4 gView; float4x4 gInvViewProj; float4x4 gShadowVP[4];
  float4 gCamPos;      // xyz, w = time (seconds)
  float4 gSunDir;      // xyz = direction towards the sun, w = exposure
  float4 gSunColor;    // rgb = sunlight
  float4 gFogColor;    // rgb = haze colour, a = density
  float4 gFogParams;   // x = height falloff, y = linear term, z = forward scatter, w = glow
  float4 gScreen;      // width, height, 1/width, 1/height
  float4 gCascade;     // far end of each shadow cascade (view distance)
  float4 gParams;      // x = bloom, y = ao, z = grain, w = lens fringe
  float4 gParams2;     // x = sharpen, y = clarity, z = vignette, w = sun shafts
  float4 gSunScreen;   // xy = sun position in uv, z = how much of the sun is in view
  float4 gShadowBias;  // depth bias for each cascade
  float4 gShadowTexel; // size of a shadow texel in metres, per cascade
  float4 gWeather;     // x = wetness of the streets (0 dry, 1 soaked), y = reflection strength
  float4x4 gPrevVP;    // last frame's view-projection, for motion blur
  float4 gLook;        // x = soft (contact-hardening) shadows, y = bounced light and street-canyon shading, z = surface detail (road wear)
  float4 gShadowRange; // metres of depth across each shadow cascade (turns a depth difference into a distance)
};
cbuffer Draw : register(b1) { float4x4 gWorld; float4 gP0; float4 gP1; float4 gP2; float4 gP3; };

SamplerState sLinearWrap : register(s0);
SamplerState sLinearClamp : register(s1);
SamplerComparisonState sShadow : register(s2);

static const float PI = 3.14159265;

// --- Noise -------------------------------------------------------------------------------
uint hashU(uint x) { x = x ^ (x >> 16); x = x * 0x7feb352du; x = x ^ (x >> 15); x = x * 0x846ca68bu; x = x ^ (x >> 16); return x; }
float hash12(float2 p) { int2 i = (int2)floor(p); return (hashU((uint)(i.x * 73856093) ^ (uint)(i.y * 19349663) ^ 0x9e3779b9u)) * (1.0 / 4294967295.0); }
float vnoise(float2 p) {
  float2 i = floor(p), f = frac(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + float2(1, 0)), c = hash12(i + float2(0, 1)), d = hash12(i + float2(1, 1));
  return lerp(lerp(a, b, f.x), lerp(c, d, f.x), f.y);
}
// Fractal noise whose octaves fade out when they get finer than a pixel (fw = world size of a pixel),
// so distant ground never shimmers.
float fbmAA(float2 p, float fw, float baseFreq) {
  float s = 0, a = 0.5, n = 0, fr = baseFreq;
  [unroll] for (int i = 0; i < 5; i++) {
    float w = saturate(1.0 - fw * fr * 1.6);
    s += a * w * vnoise(p * fr + i * 17.3); n += a * w; a *= 0.5; fr *= 2.0;
  }
  return n > 1e-4 ? s / n : 0.5;
}

// --- Sky, ambient light, sun -----------------------------------------------------------------
float3 SkyGradient(float3 d) {
  float3 sun = gSunDir.xyz;
  float t = saturate(d.y), mu = saturate(dot(d, sun));
  float dk = gWeather.w;                                  // 0 golden hour, 1 midday
  float3 zenith = lerp(float3(0.060, 0.135, 0.38), float3(0.075, 0.21, 0.58), dk), mid = lerp(float3(0.30, 0.40, 0.66), float3(0.34, 0.54, 0.84), dk), horizon = lerp(float3(0.90, 0.58, 0.38), float3(0.74, 0.82, 0.93), dk);
  float3 c = lerp(horizon, mid, smoothstep(0.0, 0.20, t));
  c = lerp(c, zenith, smoothstep(0.12, 0.85, t));
  // Warm, bright haze round the sun (forward scattering) and a faint pink band on the far side.
  float2 h2 = normalize(d.xz + 1e-4), s2 = normalize(sun.xz + 1e-4);
  float side = saturate(dot(h2, s2) * 0.5 + 0.5);
  c += lerp(float3(1.55, 0.78, 0.34), float3(1.2, 1.1, 0.95), dk) * pow(mu, 5.0) * lerp(0.85, 0.45, dk) + lerp(float3(1.2, 0.62, 0.28), float3(0.9, 0.85, 0.75), dk) * pow(mu, 2.0) * lerp(0.16, 0.07, dk);
  c = lerp(c, c * float3(1.15, 0.9, 0.8) + float3(0.10, 0.04, 0.03), side * (1.0 - smoothstep(0.0, 0.3, t)) * 0.5 * (1.0 - dk));
  return c;
}
float3 SkyColor(float3 d) {
  float3 c = SkyGradient(float3(d.x, max(d.y, 0.0), d.z));
  // Below the horizon a reflection sees the warm haze fading into dark ground.
  float below = smoothstep(0.0, 0.35, -d.y);
  return lerp(c, float3(0.22, 0.17, 0.12), below);
}
// Diffuse light from the whole sky for a surface facing n.
float3 AmbientSky(float3 n) {
  float up = n.y * 0.5 + 0.5;
  float dk = gWeather.w;
  float3 sky = lerp(float3(0.33, 0.45, 0.72) * 0.55, float3(0.36, 0.52, 0.84) * 0.78, dk), ground = lerp(float3(0.30, 0.24, 0.18) * 0.30, float3(0.34, 0.31, 0.27) * 0.34, dk);
  float3 c = lerp(ground, sky, up * up * (3.0 - 2.0 * up));
  c += float3(0.30, 0.18, 0.09) * pow(saturate(dot(n, gSunDir.xyz) * 0.5 + 0.5), 3.0) * 0.32 * (1.0 - 0.8 * dk);   // warm sky-glow on the sun's side
  return c;
}

// What a glossy surface sees along direction r. Above the horizon it is the sky; in the city the streets are canyons, so up to about
// thirty degrees the view is filled with building walls (warm where the sun lights them, cool and dark in shade), and below the
// horizon it is the dark street. Out in the country the walls fade away and the sky comes down to the horizon. gSpecP is the point
// being shaded (set by the shader before it shades).
static float3 gSpecP = float3(0, 0, 0);
static float2 gPix = float2(0, 0);       // the pixel being shaded (SV_Position.xy), for noise that dithers per pixel
float IGN(float2 p) { return frac(52.9829189 * frac(dot(p, float2(0.06711056, 0.00583715)))); }   // interleaved gradient noise
// Light from everything round a surface that is not the sun. Out in the country this is just the sky (and the ground's bounce). In the
// city the street is a canyon: the walls on both sides hide part of the sky, so surfaces near the ground see less of it, and a wall in
// shade looks across at a wall in sun, which bounces warm light into it. p is the point being shaded (y = height above the street).
float3 AmbientLight(float3 n, float3 p) {
  float3 amb = AmbientSky(n);
  if (gLook.y > 0.5) {
    float cityK = 1.0 - smoothstep(2000.0, 2700.0, max(abs(p.x), abs(p.z)));
    float low = 1.0 - smoothstep(4.0, 60.0, p.y);                                     // 1 at street level, gone above the rooftops
    float skyVis = lerp(1.0, 0.64, cityK * low * (0.55 + 0.45 * saturate(1.0 - n.y)));   // walls and the ground see less sky than a rooftop does
    amb *= skyVis;
    float2 sh = gSunDir.xz; float sl = max(length(sh), 1e-3); float3 wallAlb = lerp(float3(0.40, 0.36, 0.31), float3(0.46, 0.42, 0.37), gWeather.w);
    float across = saturate(-dot(n.xz, sh / sl)) * sl;                                  // a face turned away from the sun looks at one turned towards it
    amb += wallAlb * gSunColor.rgb * across * 0.30 * cityK * low * saturate(1.0 - abs(n.y));   // warm light off the sunlit wall opposite
    amb += float3(0.30, 0.27, 0.22) * gSunColor.rgb * gSunDir.y * 0.05 * cityK * low * saturate(n.y);   // and some off the street's own sunlit patches, up into a shaded road
  }
  return amb;
}
#ifndef NO_SHADOW_MAP
// The reflection probe: six 94-degree faces (+x, -x, +y, -y, +z, -z) drawn from the car (renderer.cpp, probePass). The basis here is the
// one lookAt builds: right = forward x up, up = right x forward.
Texture2DArray<float4> gProbe : register(t2);
float3 ProbeSample(float3 d) {
  float3 a = abs(d), f, up; int face;
  if (a.x >= a.y && a.x >= a.z) { face = d.x > 0 ? 0 : 1; f = float3(d.x > 0 ? 1 : -1, 0, 0); up = float3(0, 1, 0); }
  else if (a.y >= a.z) { face = d.y > 0 ? 2 : 3; f = float3(0, d.y > 0 ? 1 : -1, 0); up = float3(0, 0, d.y > 0 ? -1 : 1); }
  else { face = d.z > 0 ? 4 : 5; f = float3(0, 0, d.z > 0 ? 1 : -1); up = float3(0, 1, 0); }
  float3 r = normalize(cross(f, up)), u = cross(r, f);
  float k = 1.0 / max(dot(d, f), 1e-3) / 1.0724;                        // tan(47 degrees)
  float2 ndc = float2(dot(d, r), dot(d, u)) * k;
  return min(gProbe.SampleLevel(sLinearClamp, float3(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5, face), 0).rgb, 12.0);
}
#endif
float3 EnvReflect(float3 r, float3 wp) {
  float3 sky = SkyColor(r);
  float cityK = 1.0 - smoothstep(2000.0, 2700.0, max(abs(wp.x), abs(wp.z)));
  float lit = saturate(dot(normalize(r.xz + 1e-4), normalize(gSunDir.xz + 1e-4)) * 0.5 + 0.5);
  float3 wall = lerp(float3(0.05, 0.06, 0.085), lerp(float3(0.62, 0.46, 0.32), float3(0.34, 0.345, 0.36), gWeather.w), lit * lit) * (0.9 + 0.2 * vnoise(float2((r.x + r.z * 0.7) * 2.5, r.y * 2.0 + r.z * 1.5)));
  float w = (1.0 - smoothstep(0.10, 0.62, r.y)) * cityK * smoothstep(-0.12, 0.04, r.y);
  float3 c = lerp(sky, wall, w);
#ifndef NO_SHADOW_MAP
  if (gWeather.z > 0.5) c = lerp(c, ProbeSample(r), smoothstep(-0.10, 0.02, r.y) * 0.92);     // the real street around the car
#endif
  float3 street = float3(0.075, 0.07, 0.065) + float3(0.28, 0.2, 0.12) * pow(saturate(dot(normalize(r.xz + 1e-4), normalize(gSunDir.xz + 1e-4))), 6.0) * saturate(-r.y * 3.0);
  return lerp(c, street, smoothstep(0.02, -0.12, r.y) * cityK + smoothstep(0.0, -0.4, r.y) * (1.0 - cityK) * 0.5);
}
// Perturbs a surface normal by a relief height (in metres) using screen-space derivatives; strength scales how much of it shows.
float3 BumpNormal(float3 n, float3 wp, float hgt, float strength) {
  float3 dpx = ddx(wp), dpy = ddy(wp); float dhx = ddx(hgt), dhy = ddy(hgt);
  float3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1);
  float pxl = max(length(dpx), length(dpy));
  float2 dh = clamp(float2(dhx, dhy) * strength, -0.8 * pxl, 0.8 * pxl);
  float3 nb = abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2);
  float nl = length(nb);
  return (abs(det) > 1e-12 && nl > 1e-12) ? nb / nl : n;
}

// --- Foliage cut-outs, shared by the scene and the shadow passes so that shadows have the same holes as the leaves ---------------
// uv.x in [2,3]: a palm frond (leaflets cut into a strip); [4,5]: one leaf of a canopy; >= 6: bark. Returns 0..1, discard below 0.5.
float FrondKeepAmt(float2 uv) {
  float across = abs(uv.x - 2.5) * 2.0, along = uv.y, nl = 22.0, sgn = sign(uv.x - 2.5);
  float q = along * nl - sgn * across * 1.1, tooth = abs(frac(q) - 0.5);
  float keep = step(tooth, 0.36 * (1.0 - 0.4 * across * across)) + step(across, 0.07);
  float fadeL = saturate(max(abs(ddx(along * nl)), abs(ddy(along * nl))) * 2.2 - 0.3);
  return lerp(saturate(keep), 1.0, fadeL);
}
float LeafKeepAmt(float2 uv) {
  float lx = uv.x - 4.0, ly = uv.y;
  float w = 0.47 * pow(saturate(sin(PI * saturate(ly * 0.94 + 0.03))), 0.65);              // an ovate leaf with a pointed tip
  float keep = step(abs(lx - 0.5), w);
  float fw = max(max(abs(ddx(lx)), abs(ddy(lx))), max(abs(ddx(ly)), abs(ddy(ly))));
  return lerp(keep, 0.75, saturate((fw - 0.16) * 5.0));                                     // far away the holes average out into a solid card
}

// --- Haze: thins with height, cooler away from the sun, warm and bright towards it -----------------
float3 ApplyFog(float3 col, float3 wpos) {
  float3 v = wpos - gCamPos.xyz; float dist = length(v); float3 rd = v / max(dist, 1e-3);
  float avgY = max(gCamPos.y + 0.5 * v.y, 0.0);
  float thin = exp(-avgY * gFogParams.x);
  float sunAmt = pow(saturate(dot(rd, gSunDir.xyz)), 5.0);
  float fd = gFogColor.a * dist * thin;
  float f = 1.0 - exp(-fd * fd * (1.0 + gFogParams.z * sunAmt)) * exp(-dist * thin * gFogParams.y * (1.0 + 0.6 * sunAmt));
  float3 cool = lerp(float3(0.80, 0.90, 1.08), float3(0.9, 0.95, 1.05), gWeather.w), sunFog = lerp(float3(2.6, 1.55, 0.78), float3(1.5, 1.4, 1.25), gWeather.w);
  float3 fc = lerp(gFogColor.rgb * cool, sunFog, sunAmt * gFogParams.w);
  return lerp(col, fc, saturate(f));
}

// --- Shadows: four cascades in one array texture (t0) -----------------------------------------------
#ifndef NO_SHADOW_MAP
Texture2DArray<float> gShadowMap : register(t0);
static const float2 kDisk16[16] = { float2(0.1768, 0.0000), float2(-0.2258, 0.2068), float2(0.0346, -0.3938), float2(0.2846, 0.3712), float2(-0.5222, -0.0924), float2(0.4947, -0.3147), float2(-0.1655, 0.6155), float2(-0.3156, -0.6076), float2(0.6846, 0.2500), float2(-0.7123, 0.2940), float2(0.3434, -0.7337), float2(0.2537, 0.8089), float2(-0.7647, -0.4432), float2(0.8971, -0.1972), float2(-0.5475, 0.7788), float2(-0.1265, -0.9761) };
static const float2 kDisk12[12] = { float2(0.2041, 0.0000), float2(-0.2607, 0.2388), float2(0.0399, -0.4547), float2(0.3286, 0.4286), float2(-0.6030, -0.1067), float2(0.5712, -0.3634), float2(-0.1911, 0.7107), float2(-0.3644, -0.7016), float2(0.7906, 0.2887), float2(-0.8224, 0.3395), float2(0.3965, -0.8472), float2(0.2930, 0.9341) };
float ShadowFactor(float3 wpos, float3 n, float viewDist) {
  int c = viewDist < gCascade.x ? 0 : viewDist < gCascade.y ? 1 : viewDist < gCascade.z ? 2 : 3;
  if (viewDist > gCascade.w) return 1.0;
  float texW = c == 0 ? gShadowTexel.x : c == 1 ? gShadowTexel.y : c == 2 ? gShadowTexel.z : gShadowTexel.w;
  float bias = c == 0 ? gShadowBias.x : c == 1 ? gShadowBias.y : c == 2 ? gShadowBias.z : gShadowBias.w;
  float3 p = wpos + n * texW * 2.0;                       // push the lookup off the surface so a surface doesn't shadow itself
  float4 sp = mul(gShadowVP[c], float4(p, 1.0));
  float2 uv = sp.xy * float2(0.5, -0.5) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || sp.z > 1.0) return 1.0;
  float texel = 1.0 / 2048.0, s = 0.0;
  float fade = smoothstep(gCascade.w * 0.85, gCascade.w, viewDist);
  if (gLook.x < 0.5 || c > 1) {                           // beyond 45 m the blur is not visible, or soft shadows are off: a small fixed filter
    [unroll] for (int j = -1; j <= 1; j++) [unroll] for (int i = -1; i <= 1; i++)
      s += gShadowMap.SampleCmpLevelZero(sShadow, float3(uv + float2(i, j) * texel * 1.3, c), sp.z - bias);
    return lerp(s / 9.0, 1.0, fade);
  }
  // Soft shadows. The sun is a disc half a degree wide, so a shadow edge blurs in proportion to how far the surface is behind
  // whatever blocks the light: razor sharp where they touch, a hand's width after a few metres. First find the blockers, which gives that
  // distance, then filter with a disc of the matching size. The depth of the receiving surface is followed across the filter, so a
  // sloping surface does not shadow itself.
  float3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? float3(0, 1, 0) : float3(1, 0, 0))), t2 = cross(n, t1);
  float3 s1 = mul(gShadowVP[c], float4(t1, 0.0)).xyz, s2 = mul(gShadowVP[c], float4(t2, 0.0)).xyz;
  float2 a1 = float2(0.5 * s1.x, -0.5 * s1.y), a2 = float2(0.5 * s2.x, -0.5 * s2.y);
  float det = a1.x * a2.y - a1.y * a2.x; float2 g = 0;
  if (abs(det) > 1e-10) g = clamp(float2(s1.z * a2.y - a1.y * s2.z, a1.x * s2.z - s1.z * a2.x) / det, -2.0, 2.0);
  float ang = IGN(gPix) * 6.2831853, cs = cos(ang), sn = sin(ang); float2x2 rot = float2x2(cs, -sn, sn, cs);
  float searchR = clamp(0.19 / texW, 2.0, 14.0);          // texels: enough to see blockers up to about forty metres away
  float bsum = 0.0, bcnt = 0.0;
  [unroll] for (int k = 0; k < 12; k++) {
    float2 off = mul(rot, kDisk12[k]) * searchR * texel;
    float d = gShadowMap.Load(int4(clamp(int2((uv + off) * 2048.0), 0, 2047), c, 0));
    if (d < sp.z + dot(g, off) - bias) { bsum += d; bcnt += 1.0; }
  }
  if (bcnt < 0.5) return 1.0;                             // nothing between this point and the sun
  float gapM = max(0.0, sp.z - bsum / bcnt) * gShadowRange[c];     // metres from the blocker to this surface
  float rT = clamp(0.5 * gapM * 0.0093 / texW, 1.25, 16.0);        // penumbra radius in texels
  [unroll] for (int m = 0; m < 16; m++) {
    float2 off = mul(rot, kDisk16[m]) * rT * texel;
    s += gShadowMap.SampleCmpLevelZero(sShadow, float3(uv + off, c), sp.z + dot(g, off) - bias);
  }
  return lerp(s / 16.0, 1.0, fade);
}
#endif

// --- Road wear ---------------------------------------------------------------------------------------------------------------
// A thin dark line (a crack, a seam) at distance d from its centre: never thinner than a pixel, fainter instead, so it does not shimmer.
float Thin(float d, float w, float fp) { float L = max(w, fp * 1.2); return (1.0 - smoothstep(0.0, L, d)) * (w / L); }
// Distance to the nearest border of a Voronoi cell about s metres across: the crazed pattern of tired asphalt.
float CellEdge(float2 p, float s) {
  float2 q = p / s, id = floor(q), f = frac(q); float d1 = 8.0, d2 = 8.0;
  [unroll] for (int j = -1; j <= 1; j++) [unroll] for (int i = -1; i <= 1; i++) {
    float2 g = float2(i, j), o = float2(hash12(id + g), hash12(id + g + 41.7)); float2 r = g + o * 0.85 + 0.075 - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return (sqrt(d2) - sqrt(d1)) * 0.5 * s;
}
// The stones in asphalt: cells about a centimetre and a half across, each holding a pale chip, a dark bitumen-coated one, or nothing.
// x = brightness multiplier, y = relief in metres. Fades to nothing once the stones are smaller than a pixel.
float2 AsphaltStones(float2 p, float fp) {
  float2 acc = float2(1.0, 0.0); float f1 = 68.0, w1 = saturate(1.0 - fp * f1 * 1.6);
  if (w1 > 0.0) {
    float2 q = p * f1, id = floor(q), f = frac(q) - 0.5; float2 j = float2(hash12(id), hash12(id + 17.3)) - 0.5;
    float r = 0.20 + 0.28 * hash12(id + 5.1), st = smoothstep(r, r * 0.5, length(f - j * 0.5)), tone = hash12(id + 9.7);
    acc.x += w1 * st * (tone > 0.5 ? 0.30 + 0.9 * tone : -0.34); acc.y += w1 * st * 0.0011 * (0.4 + tone);
  }
  float f2 = 175.0, w2 = saturate(1.0 - fp * f2 * 1.6);
  if (w2 > 0.0) {
    float2 q = p * f2 + 7.3, id = floor(q), f = frac(q) - 0.5; float r = 0.22 + 0.25 * hash12(id + 2.7), st = smoothstep(r, r * 0.5, length(f)), tone = hash12(id + 31.1);
    acc.x += w2 * st * (tone > 0.5 ? 0.25 + 0.7 * tone : -0.25); acc.y += w2 * st * 0.0005;
  }
  return acc;
}
// A cast-iron manhole cover at q (metres from its centre). Returns the lid (1 on it); ring is the dark gap round it, studs the raised pattern.
float Manhole(float2 q, float fp, out float ring, out float studs) {
  float r = length(q); ring = Thin(abs(r - 0.335), 0.014, fp); studs = step(0.5, frac((q.x + q.y) * 15.0)) * step(0.5, frac((q.x - q.y) * 15.0));
  return 1.0 - smoothstep(0.325 - fp, 0.325 + fp, r);
}

// --- Lighting helpers --------------------------------------------------------------------------------
float3 FresnelSchlick(float3 f0, float c) { return f0 + (1.0 - f0) * pow(1.0 - saturate(c), 5.0); }
float DistGGX(float nh, float a) { float a2 = a * a, d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d + 1e-5); }
float VisSmith(float nl, float nv, float a) { float k = a * 0.5; return 0.25 / ((nl * (1.0 - k) + k) * (nv * (1.0 - k) + k) + 1e-5); }
// Sun specular lobe plus a reflection of the sky, for a surface with the given roughness.
float3 SpecularLight(float3 n, float3 v, float3 f0, float rough, float shadow) {
  float3 l = gSunDir.xyz, h = normalize(l + v);
  float nl = saturate(dot(n, l)), nv = saturate(dot(n, v)), nh = saturate(dot(n, h)), vh = saturate(dot(v, h));
  float a = max(rough * rough, 0.002);
  float3 F = FresnelSchlick(f0, vh);
  float3 sunSpec = F * DistGGX(nh, a) * VisSmith(nl, nv, a) * nl * gSunColor.rgb * shadow;
  float3 r = reflect(-v, n);
  float3 skyRefl = EnvReflect(r, gSpecP) * FresnelSchlick(f0, nv) * lerp(1.0, 0.0, saturate(rough * 1.1));
  return sunSpec + skyRefl;
}

// World position of a model vertex for an instance: xyz + scale (width), yaw, and optional height and depth ratios (id.x, id.y; 0 = same as the width).
float3 InstanceWorld(float3 p, float4 ia, float yaw, float2 id) {
  float sy = ia.w * (id.x > 0.0 ? id.x : 1.0), sz = ia.w * (id.y > 0.0 ? id.y : 1.0); float c = cos(yaw), s = sin(yaw);
  float3 q = float3(p.x * ia.w, p.y * sy, p.z * sz);
  return ia.xyz + float3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z);
}
float3 InstanceNormal(float3 n, float yaw) { float c = cos(yaw), s = sin(yaw); return float3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z); }

struct PSOut { float4 c : SV_Target0; float d : SV_Target1; };
PSOut Out(float3 color, float viewDist) { PSOut o; o.c = float4(max(color, 0.0), 1.0); o.d = viewDist; return o; }
