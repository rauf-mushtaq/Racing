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
  float3 zenith = float3(0.060, 0.135, 0.38), mid = float3(0.30, 0.40, 0.66), horizon = float3(0.90, 0.58, 0.38);
  float3 c = lerp(horizon, mid, smoothstep(0.0, 0.20, t));
  c = lerp(c, zenith, smoothstep(0.12, 0.85, t));
  // Warm, bright haze round the sun (forward scattering) and a faint pink band on the far side.
  float2 h2 = normalize(d.xz + 1e-4), s2 = normalize(sun.xz + 1e-4);
  float side = saturate(dot(h2, s2) * 0.5 + 0.5);
  c += float3(1.55, 0.78, 0.34) * pow(mu, 5.0) * 0.85 + float3(1.2, 0.62, 0.28) * pow(mu, 2.0) * 0.16;
  c = lerp(c, c * float3(1.15, 0.9, 0.8) + float3(0.10, 0.04, 0.03), side * (1.0 - smoothstep(0.0, 0.3, t)) * 0.5);
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
  float3 sky = float3(0.33, 0.45, 0.72) * 0.55, ground = float3(0.30, 0.24, 0.18) * 0.30;
  float3 c = lerp(ground, sky, up * up * (3.0 - 2.0 * up));
  c += float3(0.30, 0.18, 0.09) * pow(saturate(dot(n, gSunDir.xyz) * 0.5 + 0.5), 3.0) * 0.32;   // warm sky-glow on the sun's side
  return c;
}

// What a glossy surface sees along direction r. Above the horizon it is the sky; in the city the streets are canyons, so up to about
// thirty degrees the view is filled with building walls (warm where the sun lights them, cool and dark in shade), and below the
// horizon it is the dark street. Out in the country the walls fade away and the sky comes down to the horizon. gSpecP is the point
// being shaded (set by the shader before it shades).
static float3 gSpecP = float3(0, 0, 0);
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
  float3 wall = lerp(float3(0.05, 0.06, 0.085), float3(0.62, 0.46, 0.32), lit * lit) * (0.8 + 0.4 * vnoise(float2((r.x + r.z * 0.7) * 7.0, r.y * 5.0 + r.z * 3.0)));
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

// --- Haze: thins with height, cooler away from the sun, warm and bright towards it -----------------
float3 ApplyFog(float3 col, float3 wpos) {
  float3 v = wpos - gCamPos.xyz; float dist = length(v); float3 rd = v / max(dist, 1e-3);
  float avgY = max(gCamPos.y + 0.5 * v.y, 0.0);
  float thin = exp(-avgY * gFogParams.x);
  float sunAmt = pow(saturate(dot(rd, gSunDir.xyz)), 5.0);
  float fd = gFogColor.a * dist * thin;
  float f = 1.0 - exp(-fd * fd * (1.0 + gFogParams.z * sunAmt)) * exp(-dist * thin * gFogParams.y * (1.0 + 0.6 * sunAmt));
  float3 cool = float3(0.80, 0.90, 1.08), sunFog = float3(2.6, 1.55, 0.78);
  float3 fc = lerp(gFogColor.rgb * cool, sunFog, sunAmt * gFogParams.w);
  return lerp(col, fc, saturate(f));
}

// --- Shadows: four cascades in one array texture (t0) -----------------------------------------------
#ifndef NO_SHADOW_MAP
Texture2DArray<float> gShadowMap : register(t0);
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
  [unroll] for (int j = -1; j <= 1; j++) [unroll] for (int i = -1; i <= 1; i++)
    s += gShadowMap.SampleCmpLevelZero(sShadow, float3(uv + float2(i, j) * texel * 1.3, c), sp.z - bias);
  float sh = s / 9.0;
  float fade = smoothstep(gCascade.w * 0.85, gCascade.w, viewDist);
  return lerp(sh, 1.0, fade);
}
#endif

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
