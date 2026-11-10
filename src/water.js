// Water. The sea: a grid of water that knows how deep it is at every point (so it is sand-coloured and clear in the shallows, turquoise a little further out and deep blue beyond), with four
// trains of swell rolling in to the beach (their slopes make the normal, so the sun glitters on them), a foam line at the waterline and stripes of foam running in as waves break,
// whitecaps out at sea, and the sea floor with its moving light seen through the shallows. Swimming pools: a tiled floor seen through the surface (the ray is bent into the water, so the
// floor slides as you move, as it does in a real pool), with moving caustics, and at night the pool lights glow. Both are ordinary standard materials with their shaders patched, so they
// are lit by the sun, shadowed, reflect the sky and (through attachSSR) the street, like everything else.
import * as THREE from 'three';
import * as T from './textures.js';
import { Q } from './quality.js';

export const WATER = { uTime: { value: 0 } };
export const updateWater = dt => { WATER.uTime.value += dt; };
let ripple_ = null;
export const rippleTex = () => ripple_ || (ripple_ = T.rippleNormal());                      // (one small-ripple normal map for the sea and every pool)

const NOISE = `
float wHash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f); return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y); }
// The swell: x is the height of the water, yz the slope (d/dx, d/dz). Four trains of waves come in from the sea in the west; amp scales them (small in the shallows).
vec3 seaWave(vec2 p, float t, float amp) {
  vec3 r = vec3(0.0);
  const vec4 w[4] = vec4[4](vec4(0.985, 0.17, 72.0, 0.55), vec4(0.94, -0.34, 38.0, 0.28), vec4(0.80, 0.60, 17.0, 0.11), vec4(0.60, -0.80, 7.5, 0.045));
  for (int i = 0; i < 4; i++) {
    vec2 d = normalize(w[i].xy); float k = 6.2831853 / w[i].z, ph = k * dot(d, p) - sqrt(9.81 * k) * t * 0.7;
    float a = w[i].w * amp; r.x += a * sin(ph); r.yz += a * k * cos(ph) * d;
  }
  return r;
}`;

// The sea as a grid whose vertices carry the depth of the water there (from the same height function the land is built from).
export function seaGeometry(heightAt, seaY, coastX) {
  const xs = [], zs = [];
  for (let x = -2700, s = 12; x > -14000; x -= s) { xs.push(x); if (x < -3500) s = Math.min(s * 1.16, 900); }
  xs.push(-14000); xs.reverse();
  for (let z = -9000; z <= 9000; z += 45) zs.push(z);
  const nx = xs.length, nz = zs.length, pos = new Float32Array(nx * nz * 3), nor = new Float32Array(nx * nz * 3), dep = new Float32Array(nx * nz), uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = xs[i], z = zs[j];
    pos.set([x, 0, z], k * 3); nor.set([0, 1, 0], k * 3); uv.set([x / 100, z / 100], k * 2);
    dep[k] = x < coastX(z) - 2300 ? seaY + 34 : seaY - heightAt(x, z);          // (far out the sea bed is flat, 34 m down)
  }
  const idx = [];
  for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) { const a = j * nx + i, b = a + nx, c = a + 1, d = b + 1; idx.push(a, b, c, c, b, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
  g.setIndex(idx); g.computeBoundingSphere(); return g;
}

// day: the sea by day (deep blue-green, turquoise shallows) or at night (dark, violet).
export function seaMaterial(day, ripple) {
  ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
  const lite = Q.name === 'low' || Q.name === 'medium';                                              // (the cheap sea for tablets and phones: the foam line and the swell, no noise-built foam stripes, caustics, ripples or glitter)
  const dbg = typeof window !== 'undefined' && window.__seaDebug ? 1 : 0;                                  // (a test aid: draws the depth and the foam as colours)
  const m = new THREE.MeshStandardMaterial({ color: day ? 0x1b5f7c : 0x3a3550, roughness: 0.07, metalness: 0, envMapIntensity: 1.6 });
  const shallow = day ? new THREE.Vector3(0.04, 0.3, 0.29) : new THREE.Vector3(0.03, 0.05, 0.09), sand = day ? new THREE.Vector3(0.5, 0.4, 0.22) : new THREE.Vector3(0.1, 0.09, 0.08);
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = WATER.uTime; sh.uniforms.tRip = { value: ripple }; sh.uniforms.uShallow = { value: shallow }; sh.uniforms.uSand = { value: sand };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDepth; varying float vDepth; varying vec3 vSeaW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = aDepth; vSeaW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform sampler2D tRip; uniform vec3 uShallow, uSand; varying float vDepth; varying vec3 vSeaW; float gFoam; vec3 gSw;\n' + NOISE)
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (vDepth < 0.04) discard;                                                                      // (the sand is above the water here: at a grazing angle the land's depth offset would let the flat sea show through it)
        vec2 q = vSeaW.xz; float t = uTime, d = max(vDepth, 0.0) * 4.0;                                      // (the beach here is a gentle 1.5% slope; the surf zone is drawn as if it were four times as steep, as a real one is)
        gSw = seaWave(q, t, smoothstep(0.05, 3.0, d));
        float dl = d + gSw.x * 0.6 * smoothstep(0.0, 1.2, d);                                           // the water rises and falls with the swell
${lite ? `        float edge = smoothstep(0.62, 0.0, dl); gFoam = clamp(edge * 0.85, 0.0, 1.0); vec3 bed = uSand * 0.85;` : `        float n1 = wNoise(q * 0.9 + vec2(t * 0.05, 0.0)), n2 = wNoise(q * 2.7 - vec2(0.0, t * 0.08));
        float surge = 0.5 + 0.5 * sin(dl * 15.0 - t * 1.0 + 3.0 * wNoise(q * 0.07));
        float edge = smoothstep(0.62, 0.0, dl - 0.15 * surge);                                           // foam at the waterline,
        float runs = smoothstep(0.62, 1.0, surge) * smoothstep(1.7, 0.25, dl) * smoothstep(0.35, 0.8, n1);  // stripes of it running in as the waves break,
        float caps = smoothstep(0.80, 0.92, wNoise(q * 0.22 + vec2(t * 0.12, t * 0.05))) * smoothstep(4.0, 12.0, d) * (0.4 + 0.6 * n2);   // and whitecaps out at sea
        gFoam = clamp(edge * (0.45 + 0.75 * n2) + runs * 0.7 + caps * 0.55, 0.0, 1.0);
        float cau = pow(0.5 + 0.5 * sin(q.x * 0.9 + t * 0.6 + 2.0 * sin(q.y * 0.7 - t * 0.5)) * sin(q.y * 0.8 - t * 0.45 + 2.0 * sin(q.x * 0.6 + t * 0.35)), 3.0);
        vec3 bed = uSand * (0.7 + 0.6 * cau);                                                            // the sea floor, seen through the shallows with the light playing on it`}
        vec3 col = mix(uShallow, diffuseColor.rgb, smoothstep(0.4, 7.0, d));
        col = mix(col, bed * 0.7 + uShallow * 0.4, 1.0 - smoothstep(0.0, 0.55, d));
        diffuseColor.rgb = mix(col, vec3(0.86, 0.9, 0.92), gFoam);
        ${dbg ? 'diffuseColor.rgb = vec3(clamp(d / 4.0, 0.0, 1.0), gFoam, step(vDepth, 0.0));' : ''}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.045, 0.85, gFoam);')
      .replace('#include <normal_fragment_maps>', lite ? `
        normal = normalize((viewMatrix * vec4(normalize(vec3(-gSw.y, 1.0, -gSw.z)), 0.0)).xyz);` : `
        vec2 r1 = texture2D(tRip, q * 0.045 + vec2(t * 0.006, t * 0.004)).xy * 2.0 - 1.0, r2 = texture2D(tRip, q * 0.13 + vec2(-t * 0.009, t * 0.007)).xy * 2.0 - 1.0;
        float calm = mix(1.0, 0.35, gFoam);
        vec3 nw = normalize(vec3(-(gSw.y + (r1.x * 0.10 + r2.x * 0.07) * calm), 1.0, -(gSw.z + (r1.y * 0.10 + r2.y * 0.07) * calm)));
        normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', lite ? '#include <emissivemap_fragment>' : `#include <emissivemap_fragment>
        #if NUM_DIR_LIGHTS > 0
        { vec3 Hh = normalize(directionalLights[0].direction + normalize(vViewPosition)); float nh = max(dot(normal, Hh), 0.0);
          float sp = pow(nh, 600.0) * (0.5 + 0.9 * step(0.82, wHash(floor(q * 3.0) + floor(t * 2.0)))) * (1.0 - gFoam);                   // the sun glittering on the waves
          totalEmissiveRadiance += directionalLights[0].color * sp * 1.2; }
        #endif`);
  };
  m.customProgramCacheKey = () => 'sea-v2' + (day ? 'd' : 'n') + (lite ? 'l' : 'f');
  return m;
}

// A swimming pool's water: `depth` metres of it over a tiled floor. lampsOn: the pool lights are on (dusk and night).
export function poolMaterial(lampsOn, ripple, depth = 1.3) {
  ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshStandardMaterial({ color: 0x2aa7c4, roughness: 0.04, metalness: 0, envMapIntensity: 1.7 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = WATER.uTime; sh.uniforms.tRip = { value: ripple }; sh.uniforms.uGlow = { value: lampsOn ? 1 : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uGlow; uniform sampler2D tRip; varying vec3 vPW; vec2 gRip;\n' + NOISE)
      .replace('#include <normal_fragment_maps>', `
        normal = normalize((viewMatrix * vec4(normalize(vec3(-gRip.x * 0.07, 1.0, -gRip.y * 0.07)), 0.0)).xyz);`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        gRip = (texture2D(tRip, vPW.xz * 0.35 + vec2(uTime * 0.012, uTime * 0.008)).xy * 2.0 - 1.0) * 0.6 + (texture2D(tRip, vPW.xz * 0.9 + vec2(-uTime * 0.02, uTime * 0.015)).xy * 2.0 - 1.0) * 0.4;
        {
          vec3 toEye = normalize(cameraPosition - vPW);
          vec3 rr = refract(-toEye, vec3(0.0, 1.0, 0.0), 0.752);                                          // the ray into the water
          float run = ${depth.toFixed(2)} / max(-rr.y, 0.25);                                              // how far it goes to the floor
          vec2 fp = vPW.xz + rr.xz * run + gRip * 0.03, g = fract(fp / 0.25);
          float grout = 1.0 - smoothstep(0.0, 0.05, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)));       // 25 cm tiles
          float stripe = smoothstep(0.02, 0.0, abs(fract(fp.x / 2.5) - 0.5) - 0.46);                        // a dark lane line every 2.5 m
          vec3 floorC = mix(vec3(0.62, 0.84, 0.9), vec3(0.86, 0.94, 0.95), grout);
          floorC = mix(floorC, vec3(0.05, 0.2, 0.35), stripe * 0.9);
          float cau = pow(0.5 + 0.5 * sin(fp.x * 5.0 + uTime * 1.1 + 2.5 * sin(fp.y * 4.0 - uTime * 0.9)) * sin(fp.y * 5.5 - uTime * 0.8 + 2.5 * sin(fp.x * 3.5 + uTime * 0.7)), 4.0);
          floorC *= 0.8 + 1.0 * cau;                                                                       // the light playing on the bottom
          vec3 absorb = exp(-vec3(0.55, 0.14, 0.09) * run);                                                // water takes the red out first
          vec3 col = floorC * absorb + vec3(0.0, 0.22, 0.32) * (1.0 - absorb) * 0.55;
          col += uGlow * vec3(0.1, 0.75, 0.9) * (0.35 + 0.9 * cau) * absorb * 0.9;                         // pool lights
          diffuseColor.rgb = col;
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlow * vec3(0.02, 0.28, 0.34) * (0.5 + 0.5 * wNoise(vPW.xz * 0.6 + uTime * 0.2));');
  };
  m.customProgramCacheKey = () => 'pool-v1' + (lampsOn ? 'n' : 'd') + depth;
  return m;
}
