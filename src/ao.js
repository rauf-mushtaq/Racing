// Screen-space ambient occlusion from the scene's depth buffer: darkens the
// creases where tyres meet the road, building bases, kerbs, trunks and rocks meet
// the ground. Runs at half resolution (12 taps, a 4 x 4 dither pattern removed by a
// 4 x 4 depth-aware blur) and is multiplied in by the grade pass, so it costs no
// extra full-screen pass.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COMMON = `
  uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear, uFar, uTanY, uAspect;
  varying vec2 vUv;
  float linZ(vec2 uv) { float d = texture2D(tDepth, uv).r; float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
  vec3 viewPos(vec2 uv, float z) { vec2 n = uv * 2.0 - 1.0; return vec3(n.x * z * uTanY * uAspect, n.y * z * uTanY, -z); }
`;
const AO_FRAG = COMMON + `
  uniform float uRadius, uGain;
  void main() {
    float zc = linZ(vUv);
    if (zc > uFar * 0.5) { gl_FragColor = vec4(1.0); return; }
    vec2 tx = 1.0 / uRes;
    vec3 P = viewPos(vUv, zc);
    vec2 uR = vUv + vec2(tx.x, 0.0), uL = vUv - vec2(tx.x, 0.0), uU = vUv + vec2(0.0, tx.y), uD = vUv - vec2(0.0, tx.y);
    vec3 Pr = viewPos(uR, linZ(uR)), Pl = viewPos(uL, linZ(uL)), Pu = viewPos(uU, linZ(uU)), Pd = viewPos(uD, linZ(uD));
    vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
    vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
    vec3 N = normalize(cross(dx, dy)); if (dot(N, P) > 0.0) N = -N;
    ivec2 ip = ivec2(gl_FragCoord.xy) & 3;
    float bayer = float(((ip.x * 5 + ip.y * 3) * 7) & 15) / 16.0 + (0.5 / 16.0);
    float ang0 = bayer * 6.2831853;
    float focal = 0.5 * uRes.y / uTanY;                       // pixels per metre at a distance of one metre
    float rpix = min(uRadius * focal / zc, 48.0);
    float occ = 0.0;
    for (int i = 0; i < 12; i++) {
      float f = (float(i) + 0.5) / 12.0, a = ang0 + float(i) * 2.399963;
      vec2 suv = vUv + vec2(cos(a), sin(a)) * (sqrt(f) * rpix) * tx;
      vec3 S = viewPos(suv, linZ(suv)), v = S - P;
      float d = length(v) + 1e-4;
      occ += max(0.0, dot(N, v) / d - 0.18) * clamp(1.0 - d / uRadius, 0.0, 1.0);
    }
    float ao = 1.0 - clamp(occ / 12.0 * uGain, 0.0, 1.0);
    ao = mix(ao, 1.0, smoothstep(70.0, 260.0, zc));           // fades out with distance
    gl_FragColor = vec4(vec3(ao), 1.0);
  }`;
const BLUR_FRAG = COMMON + `
  uniform sampler2D tAO;
  void main() {
    vec2 tx = 1.0 / uRes; float zc = linZ(vUv), sum = 0.0, wsum = 0.0;
    for (int j = -2; j < 2; j++) for (int i = -2; i < 2; i++) {
      vec2 uv = vUv + (vec2(float(i), float(j)) + 0.5) * tx;
      float w = exp(-abs(linZ(uv) - zc) / (0.02 * zc + 0.05));
      sum += texture2D(tAO, uv).r * w; wsum += w;
    }
    gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);
  }`;

export class AOPass extends Pass {
  constructor(camera, opts = {}) {
    super();
    this.camera = camera; this.needsSwap = false;
    const mk = () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.rtAO = mk(); this.rtBlur = mk(); this.texture = this.rtBlur.texture;
    const u = () => ({ tDepth: { value: null }, uRes: { value: new THREE.Vector2(4, 4) }, uNear: { value: camera.near }, uFar: { value: camera.far }, uTanY: { value: 1 }, uAspect: { value: 1 } });
    this.aoMat = new THREE.ShaderMaterial({ uniforms: { ...u(), uRadius: { value: opts.radius ?? 1.8 }, uGain: { value: opts.gain ?? 2.4 } }, vertexShader: VERT, fragmentShader: AO_FRAG, depthTest: false, depthWrite: false });
    this.blurMat = new THREE.ShaderMaterial({ uniforms: { ...u(), tAO: { value: this.rtAO.texture } }, vertexShader: VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.aoMat);
  }
  setSize(w, h) {
    const hw = Math.max(2, Math.floor(w / 2)), hh = Math.max(2, Math.floor(h / 2));
    this.rtAO.setSize(hw, hh); this.rtBlur.setSize(hw, hh);
    for (const m of [this.aoMat, this.blurMat]) m.uniforms.uRes.value.set(hw, hh);
  }
  render(renderer, writeBuffer, readBuffer) {
    const depth = readBuffer.depthTexture; if (!depth) return;
    const tanY = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    for (const m of [this.aoMat, this.blurMat]) {
      const U = m.uniforms; U.tDepth.value = depth; U.uNear.value = this.camera.near; U.uFar.value = this.camera.far; U.uTanY.value = tanY; U.uAspect.value = this.camera.aspect;
    }
    const prev = renderer.getRenderTarget();
    this.quad.material = this.aoMat; renderer.setRenderTarget(this.rtAO); this.quad.render(renderer);
    this.quad.material = this.blurMat; renderer.setRenderTarget(this.rtBlur); this.quad.render(renderer);
    renderer.setRenderTarget(prev);
  }
  dispose() { this.rtAO.dispose(); this.rtBlur.dispose(); this.aoMat.dispose(); this.blurMat.dispose(); this.quad.dispose(); }
}
