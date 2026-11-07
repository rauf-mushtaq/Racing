// Ray-traced global illumination, in screen space.
//
// Light bounces: a sunlit road throws warm light up under a shop awning, a red car
// tints the tarmac beside it, green verges wash the pavement. Each pixel here
// fires a handful of rays over its hemisphere (cosine weighted, a different set for
// every pixel of a 4 x 4 block), marches each through the depth buffer, and where a
// ray meets a surface it collects that surface's lit colour. The result is
// computed at half resolution, cleaned up by a depth-aware 4 x 4 blur (which
// merges the 16 different ray sets, so it behaves like 16 x the rays), and added to
// the picture in the grade pass, multiplied by a guess of the surface's own colour.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COMMON = `
  uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear, uFar, uTanY, uAspect;
  varying vec2 vUv;
  float linZ(vec2 uv) { float d = texture2D(tDepth, uv).r; float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
  vec3 viewPos(vec2 uv, float z) { vec2 n = uv * 2.0 - 1.0; return vec3(n.x * z * uTanY * uAspect, n.y * z * uTanY, -z); }
`;
const traceFrag = (rays, steps) => COMMON + `
  uniform sampler2D tColor; uniform mat4 uProj; uniform float uRange, uFrame;
  void main() {
    float zc = linZ(vUv);
    if (zc > uFar * 0.4) { gl_FragColor = vec4(0.0); return; }
    vec2 tx = 1.0 / uRes;
    vec3 P = viewPos(vUv, zc);
    vec2 uR = vUv + vec2(tx.x, 0.0), uL = vUv - vec2(tx.x, 0.0), uU = vUv + vec2(0.0, tx.y), uD = vUv - vec2(0.0, tx.y);
    vec3 Pr = viewPos(uR, linZ(uR)), Pl = viewPos(uL, linZ(uL)), Pu = viewPos(uU, linZ(uU)), Pd = viewPos(uD, linZ(uD));
    vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
    vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
    vec3 N = normalize(cross(dx, dy)); if (dot(N, P) > 0.0) N = -N;
    vec3 T = normalize(abs(N.y) < 0.95 ? cross(N, vec3(0.0, 1.0, 0.0)) : cross(N, vec3(1.0, 0.0, 0.0))), B = cross(N, T);
    ivec2 ip = ivec2(gl_FragCoord.xy) & 3;
    float bayer = float(((ip.x * 5 + ip.y * 3) * 7) & 15) / 16.0 + (0.5 / 16.0);
    float range = uRange * clamp(zc / 12.0, 0.6, 2.2);       // further away, bounces from further afield matter to the eye
    vec3 acc = vec3(0.0);
    for (int r = 0; r < ${rays}; r++) {
      float u1 = (float(r) + fract(bayer * 3.7 + uFrame * 0.618)) / float(${rays});
      float phi = 6.2831853 * fract(bayer + float(r) * 0.61803399 + uFrame * 0.382);
      float sr = sqrt(u1), cr = sqrt(1.0 - u1);
      vec3 d = normalize(T * (cos(phi) * sr) + B * (sin(phi) * sr) + N * cr);
      float jit = fract(bayer * 5.3 + float(r) * 0.37);
      for (int s = 0; s < ${steps}; s++) {
        float f = (float(s) + jit) / float(${steps});
        float t = 0.12 + range * f * f;
        vec3 S = P + d * t;
        vec4 c = uProj * vec4(S, 1.0);
        if (c.w < 0.1) break;
        vec2 uv = c.xy / c.w * 0.5 + 0.5;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
        float diff = -S.z - linZ(uv);
        if (diff > 0.04 && diff < 0.25 + 0.04 * zc + 0.5 * t) {
          vec3 col = min(texture2D(tColor, uv).rgb, vec3(8.0));
          acc += col * (1.0 - t / range);
          break;
        }
      }
    }
    gl_FragColor = vec4(acc / float(${rays}), 1.0);
  }`;
const BLUR_FRAG = COMMON + `
  uniform sampler2D tGI;
  void main() {
    vec2 tx = 1.0 / uRes; float zc = linZ(vUv), wsum = 0.0; vec3 sum = vec3(0.0);
    for (int j = -2; j < 2; j++) for (int i = -2; i < 2; i++) {
      vec2 uv = vUv + (vec2(float(i), float(j)) + 0.5) * tx;
      float w = exp(-abs(linZ(uv) - zc) / (0.02 * zc + 0.05));
      sum += texture2D(tGI, uv).rgb * w; wsum += w;
    }
    gl_FragColor = vec4(sum / max(wsum, 1e-4), 1.0);
  }`;

export class GIPass extends Pass {
  constructor(camera, opts = {}) {
    super();
    this.camera = camera; this.needsSwap = false; this.frame = 0;
    const mk = () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.rtGI = mk(); this.rtBlur = mk(); this.texture = this.rtBlur.texture;
    const u = () => ({ tDepth: { value: null }, uRes: { value: new THREE.Vector2(4, 4) }, uNear: { value: camera.near }, uFar: { value: camera.far }, uTanY: { value: 1 }, uAspect: { value: 1 } });
    this.traceMat = new THREE.ShaderMaterial({ uniforms: { ...u(), tColor: { value: null }, uProj: { value: new THREE.Matrix4() }, uRange: { value: opts.range ?? 7 }, uFrame: { value: 0 } }, vertexShader: VERT, fragmentShader: traceFrag(opts.rays ?? 4, opts.steps ?? 8), depthTest: false, depthWrite: false });
    this.blurMat = new THREE.ShaderMaterial({ uniforms: { ...u(), tGI: { value: this.rtGI.texture } }, vertexShader: VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.traceMat);
  }
  setSize(w, h) {
    const hw = Math.max(2, Math.floor(w / 2)), hh = Math.max(2, Math.floor(h / 2));
    this.rtGI.setSize(hw, hh); this.rtBlur.setSize(hw, hh);
    for (const m of [this.traceMat, this.blurMat]) m.uniforms.uRes.value.set(hw, hh);
  }
  render(renderer, writeBuffer, readBuffer) {
    const depth = readBuffer.depthTexture; if (!depth) return;
    const cam = this.camera, tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    for (const m of [this.traceMat, this.blurMat]) {
      const U = m.uniforms; U.tDepth.value = depth; U.uNear.value = cam.near; U.uFar.value = cam.far; U.uTanY.value = tanY; U.uAspect.value = cam.aspect;
    }
    this.traceMat.uniforms.tColor.value = readBuffer.texture; this.traceMat.uniforms.uProj.value.copy(cam.projectionMatrix);
    const prev = renderer.getRenderTarget();
    this.quad.material = this.traceMat; renderer.setRenderTarget(this.rtGI); this.quad.render(renderer);
    this.quad.material = this.blurMat; renderer.setRenderTarget(this.rtBlur); this.quad.render(renderer);
    renderer.setRenderTarget(prev);
  }
  dispose() { this.rtGI.dispose(); this.rtBlur.dispose(); this.traceMat.dispose(); this.blurMat.dispose(); this.quad.dispose(); }
}
