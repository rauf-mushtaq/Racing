// Ray-traced reflections, in screen space.
//
// Browsers have no hardware ray tracing (WebGL and WebGPU expose none), so the rays
// are marched through the picture the game has already drawn. After each frame the
// scene's colour (still in linear HDR) and its distance from the camera are kept in a
// "history" texture with mip levels. A glossy surface (wet road, window glass, car
// paint, water) then fires a ray along its true mirror direction, using its own
// normal, normal map and roughness, steps along it through the PREVIOUS frame's
// view of the world, finds where it meets something and reflects that. Rough
// surfaces read a blurrier mip, so the reflection spreads the way it does in life.
// Where the ray finds nothing (it leaves the screen, or flies off into the sky) the
// surface falls back to the sky-lighting probe it used before, so nothing ever pops.
//
// Using the previous frame's camera for the march keeps everything consistent for a
// still world; moving things (cars) are one frame behind, which can't be seen.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { Q } from './quality.js';

export const SSR = {
  hist: { value: null },                      // previous frame: rgb = scene colour, a = distance from the camera
  prevVP: { value: new THREE.Matrix4() },     // that frame's view-projection
  size: { value: new THREE.Vector2(4, 4) },   // history size in pixels
  amt: { value: 0 },                          // 0 = off for this frame (nothing valid yet, camera cut, probe pass), 1 = on
  time: { value: 0 },
  dbg: { value: 0 },                           // 1 = show where rays hit (green) and miss (red), for testing
  enabled: !!Q.ssr,
  _vp: new THREE.Matrix4(), _pos: new THREE.Vector3(), _fwd: new THREE.Vector3(), _have: 0, _tmp: new THREE.Vector3(),
};

// Call just before the frame is drawn and just after it.
export function ssrBegin(camera) {
  if (!SSR.enabled) return;
  let ok = SSR._have >= 2;
  if (ok) {
    camera.getWorldPosition(SSR._tmp);
    // A camera cut (a teleport, the menu, leaving the car): last frame's picture isn't this view.
    if (SSR._tmp.distanceToSquared(SSR._pos) > 30 * 30) ok = false;
    camera.getWorldDirection(SSR._tmp);
    if (SSR._tmp.dot(SSR._fwd) < 0.55) ok = false;
  }
  SSR.prevVP.value.copy(SSR._vp);
  SSR.amt.value = ok ? 1 : 0;
  if (!ok) SSR._have = Math.min(SSR._have, 1);
}
export function ssrEnd(camera) {
  if (!SSR.enabled) return;
  SSR._vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  camera.getWorldPosition(SSR._pos); camera.getWorldDirection(SSR._fwd);
  SSR._have++;
}
// Run `fn` (say, the render of a reflection probe) with the screen-space rays off: they only make sense for the main camera.
export function withoutSSR(fn) {
  const a = SSR.amt.value; SSR.amt.value = 0;
  try { return fn(); } finally { SSR.amt.value = a; }
}

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COPY = `
  uniform sampler2D tColor, tDepth; uniform float uNear, uFar; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tColor, vUv).rgb;
    float z = texture2D(tDepth, vUv).r * 2.0 - 1.0;
    float lin = 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
    gl_FragColor = vec4(min(c, vec3(48.0)), lin);
  }`;

// Copies the finished scene (before bloom and grading) into the history texture.
export class HistoryPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera; this.needsSwap = false;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false });
    this.mat = new THREE.ShaderMaterial({ uniforms: { tColor: { value: null }, tDepth: { value: null }, uNear: { value: camera.near }, uFar: { value: camera.far } }, vertexShader: VERT, fragmentShader: COPY, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.mat);
    SSR.hist.value = this.rt.texture;
  }
  setSize(w, h) {
    const s = Q.ssr.scale, W = Math.max(2, Math.floor(w * s)), H = Math.max(2, Math.floor(h * s));
    this.rt.setSize(W, H); SSR.size.value.set(W, H); SSR._have = 0;
  }
  render(renderer, writeBuffer, readBuffer) {
    const depth = readBuffer.depthTexture; if (!depth) return;
    const U = this.mat.uniforms; U.tColor.value = readBuffer.texture; U.tDepth.value = depth; U.uNear.value = this.camera.near; U.uFar.value = this.camera.far;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt); this.quad.render(renderer); renderer.setRenderTarget(prev);
  }
  dispose() { this.rt.dispose(); this.mat.dispose(); this.quad.dispose(); }
}

// The GLSL the glossy materials get: a ray march function, and the code that mixes its result into the specular radiance.
function declarations(steps, maxT) {
  return `
uniform sampler2D tSSRHist; uniform mat4 uSSRPrevVP; uniform vec2 uSSRSize; uniform float uSSRAmt, uSSRTime, uSSRDbg;
float ssrNoise(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float ssrDepth(vec2 uv) { return texelFetch(tSSRHist, ivec2(clamp(uv, 0.0, 0.9999) * uSSRSize), 0).a; }
// March P + R t through last frame's picture. Returns (uv of the hit, confidence, distance), or confidence 0.
vec4 ssrTrace(vec3 P, vec3 R, float dist) {
  const int STEPS = ${steps};
  const float MAXT = ${maxT.toFixed(1)};
  float jit = 0.4 + 0.2 * ssrNoise(gl_FragCoord.xy + uSSRTime);       // (only a little jitter: the refinement makes hits precise, and noise here shows as speckle)
  float t0 = 0.05 + 0.004 * dist, tp = t0;
  for (int i = 0; i < STEPS; i++) {
    float f = (float(i) + jit) / float(STEPS);
    float t = t0 + MAXT * f * f;
    vec4 c = uSSRPrevVP * vec4(P + R * t, 1.0);
    if (c.w < 0.1) break;
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    float d = c.w - ssrDepth(uv);
    float thick = 0.15 + 0.05 * c.w + 1.2 * (t - tp);          // generous: the refinement below throws out false hits
    if (d > 0.0 && d < thick) {
      // The ray went behind a surface between the last two samples: home in on where.
      float a = tp, b = t;
      for (int k = 0; k < 5; k++) {
        float m = 0.5 * (a + b);
        vec4 cm = uSSRPrevVP * vec4(P + R * m, 1.0);
        float dm = cm.w - ssrDepth(cm.xy / cm.w * 0.5 + 0.5);
        if (dm > 0.0) b = m; else a = m;
      }
      vec4 ch = uSSRPrevVP * vec4(P + R * b, 1.0);
      vec2 uvh = ch.xy / ch.w * 0.5 + 0.5;
      float dh = ch.w - ssrDepth(uvh);
      if (abs(dh) < 0.05 + 0.02 * ch.w) {
        float edge = min(min(uvh.x, 1.0 - uvh.x), min(uvh.y, 1.0 - uvh.y));
        float conf = smoothstep(0.0, 0.08, edge) * (1.0 - smoothstep(0.5, 1.0, b / MAXT));
        return vec4(uvh, conf, b);
      }
    }
    tp = t;
  }
  return vec4(0.0);
}
`;
}
function usage(rMax, dMax, strength) {
  return `
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
if (uSSRAmt > 0.0) {
  #ifdef USE_CLEARCOAT
    float ssrRough = min(material.roughness, material.clearcoatRoughness);
    vec3 ssrN = geometryClearcoatNormal;
  #else
    float ssrRough = material.roughness;
    vec3 ssrN = geometryNormal;
    // Rough surfaces (wet tarmac) are traced from the smooth normal: their fine grain is what the blurred read below stands in for.
    ssrN = normalize(mix(ssrN, nonPerturbedNormal, smoothstep(0.15, 0.35, material.roughness)));
  #endif
  float ssrDist = length(geometryPosition);
  if (ssrRough < ${rMax.toFixed(2)} && ssrDist < ${dMax.toFixed(1)}) {
    vec3 Rv = reflect(-geometryViewDir, ssrN);
    float facing = smoothstep(-0.02, 0.2, -Rv.z);           // a ray pointing back at the camera has left the picture at once
    if (facing > 0.0) {
      mat3 camR = transpose(mat3(viewMatrix));              // view space to world space
      vec3 Pw = cameraPosition + camR * (geometryPosition + ssrN * 0.012);
      vec4 h = ssrTrace(Pw, normalize(camR * Rv), ssrDist);
      if (uSSRDbg > 0.5) { radiance = vec3(h.z > 0.0 ? 0.0 : 1.5, h.z * 1.5, 0.0); clearcoatRadiance = radiance; }
      if (h.z > 0.0) {
        float sp = h.w / (h.w + 4.0);                       // the cone widens with the distance the ray travelled
        float k = facing * h.z * uSSRAmt * ${strength.toFixed(2)};
        vec3 hb = min(textureLod(tSSRHist, h.xy, clamp(material.roughness * 6.5 * sp, 0.9, 6.0)).rgb, vec3(24.0));
        radiance = mix(radiance, hb, k * (1.0 - smoothstep(${(rMax * 0.65).toFixed(2)}, ${rMax.toFixed(2)}, material.roughness)));
        #ifdef USE_CLEARCOAT
          vec3 hc = min(textureLod(tSSRHist, h.xy, clamp(material.clearcoatRoughness * 6.5 * sp, 0.9, 6.0)).rgb, vec3(24.0));
          clearcoatRadiance = mix(clearcoatRadiance, hc, k);
        #endif
      }
    }
  }
}
#endif
`;
}

// Give a MeshStandardMaterial / MeshPhysicalMaterial ray-traced reflections. Chains onto any onBeforeCompile it already has.
//   steps: ray march steps; range: how far (metres) a ray may travel; rough: surfaces rougher than this are left alone;
//   view: surfaces further than this from the camera are left alone; strength: 0..1
export function attachSSR(mat, o = {}) {
  if (!Q.ssr) return mat;
  const steps = o.steps ?? Q.ssr.steps, range = o.range ?? 80, rough = o.rough ?? 0.6, view = o.view ?? 200, strength = o.strength ?? 1;
  const prev = mat.onBeforeCompile;
  const key = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey() : (prev ? prev.toString() : '');
  const decl = declarations(steps, range), use = usage(rough, view, strength);
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.uniforms.tSSRHist = SSR.hist; sh.uniforms.uSSRPrevVP = SSR.prevVP; sh.uniforms.uSSRSize = SSR.size; sh.uniforms.uSSRAmt = SSR.amt; sh.uniforms.uSSRTime = SSR.time; sh.uniforms.uSSRDbg = SSR.dbg;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + decl).replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + use);
  };
  mat.customProgramCacheKey = () => key + '|ssr' + steps + '_' + range + '_' + rough + '_' + view + '_' + strength;
  return mat;
}
