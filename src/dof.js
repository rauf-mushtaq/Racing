// Depth of field: what is near the player stays sharp and the far distance softens, the way a film lens focused on the character or the car renders a
// street, and the bright lights out of focus bloom into soft discs (bokeh). One pass over the colour and depth the scene was drawn with: each pixel works
// out how far out of focus it is from its depth, then gathers colour from a disc of 16 taps spread by a golden-angle spiral, weighting the bright taps
// up (so a lamp makes a disc, not a smear) and refusing taps that are sharper than the pixel and nearer (so the car's edge does not bleed into the
// background). Cost: one full-screen pass, 16 reads; the performance guard turns it off first if the frame rate drops.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FRAG = `
  uniform sampler2D tColor, tDepth; uniform vec2 uRes; uniform float uNear, uFar, uFocus, uFarAmt, uNearAmt, uMaxR;
  varying vec2 vUv;
  float linZ(vec2 uv) { float d = texture2D(tDepth, uv).r; float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
  // 0 = sharp, 1 = as blurred as it gets: the distance beyond the focus softens gently, and what is much nearer than the focus (a lamp post close to the camera) too.
  float coc(float z) {
    float r = z / uFocus;
    return max(smoothstep(2.4, 14.0, r) * uFarAmt, smoothstep(0.55, 0.12, r) * uNearAmt);
  }
  void main() {
    float z = linZ(vUv), c = coc(z);
    vec4 base = texture2D(tColor, vUv);
    if (c < 0.03) { gl_FragColor = base; return; }
    float R = c * uMaxR;
    vec3 acc = base.rgb * 1.0; float wsum = 1.0;
    float rot = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
    for (int i = 1; i <= 16; i++) {
      float fi = float(i), a = fi * 2.3999632 + rot, r = sqrt(fi / 16.0) * R;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uRes;
      float zs = linZ(uv), cs = coc(zs);
      // a sample counts if its own blur disc reaches this far; a nearer sample that is sharper than the pixel must not smear over it
      float rs = (zs < z ? cs : max(cs, c)) * uMaxR, w = clamp(rs - r + 1.0, 0.0, 1.0);
      vec3 s = texture2D(tColor, uv).rgb;
      float lum = dot(s, vec3(0.2126, 0.7152, 0.0722)), bright = 1.0 + 3.0 * smoothstep(2.0, 8.0, lum);        // bright points make discs
      acc += s * w * bright; wsum += w * bright;
    }
    gl_FragColor = vec4(mix(base.rgb, acc / wsum, smoothstep(0.03, 0.2, c)), base.a);
  }`;

export class DOFPass extends Pass {
  constructor(camera, opts = {}) {
    super();
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1 / 1920, 1 / 1080) }, uNear: { value: camera.near }, uFar: { value: camera.far },
        uFocus: { value: 6 }, uFarAmt: { value: opts.far ?? 0.8 }, uNearAmt: { value: opts.near ?? 0.6 }, uMaxR: { value: 7 } },
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this.focus = 6; this.maxFrac = opts.max ?? 0.0075;                    // (the biggest blur radius, as a fraction of the picture's height, in pixels of texel space below)
  }
  setSize(w, h) { this.material.uniforms.uRes.value.set(1 / w, 1 / h); this.material.uniforms.uMaxR.value = Math.max(2, h * this.maxFrac); }
  // The distance (m) the lens is focused on; eased so the focus pulls rather than jumps.
  setFocus(d, dt) { this.focus += (Math.max(1.2, Math.min(60, d)) - this.focus) * Math.min(1, dt * 4); this.material.uniforms.uFocus.value = this.focus; }
  render(renderer, writeBuffer, readBuffer) {
    const U = this.material.uniforms, depth = readBuffer.depthTexture;
    if (!depth) return;
    U.tColor.value = readBuffer.texture; U.tDepth.value = depth; U.uNear.value = this.camera.near; U.uFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); }
}
