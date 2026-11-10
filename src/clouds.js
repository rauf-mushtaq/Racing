// The cloud layer: a sky dome whose shader finds where each view ray meets a flat deck of cloud, reads a tiling noise texture there (three scales,
// so there are big banks, lumps and wisps), and lights what it finds the way a real cloud is lit: the sun is "marched" through the cloud by taking the same
// noise a few steps towards the sun, so the side facing the sun is bright and the side away is dark; thin edges glow when you look at the sun (silver
// lining); the underside is blue-grey with a warm rim at golden hour; and towards the horizon it thins into the haze. It replaces the sprite puffs the
// clouds used to be, costs a handful of texture reads per sky pixel (the dome is drawn after the buildings, so the pixels they cover are skipped),
// and the noise is a plain data texture (no canvas), made once.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

// A tiling noise texture: R = broad banks, G = lumps, B = fine wisps (value noise with a periodic lattice, summed over octaves), A = another seed.
function noiseTexture(S = 256) {
  const data = new Uint8Array(S * S * 4);
  const lattice = (f, seed) => { const r = mulberry32(seed), g = new Float32Array(f * f); for (let i = 0; i < g.length; i++) g[i] = r(); return g; };
  const sample = (g, f, x, y) => {                       // (x, y) in 0..1, periodic in f cells
    const fx = x * f, fy = y * f, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[(y0 % f) * f + (x0 % f)], b = g[(y0 % f) * f + ((x0 + 1) % f)], c = g[((y0 + 1) % f) * f + (x0 % f)], d = g[((y0 + 1) % f) * f + ((x0 + 1) % f)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const octs = (base, seed) => [0, 1, 2, 3].map(i => ({ f: base << i, g: lattice(base << i, seed + i * 17) }));
  const chans = [octs(4, 3), octs(8, 11), octs(16, 29), octs(6, 41)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = (y * S + x) * 4;
    for (let c = 0; c < 4; c++) {
      let v = 0, amp = 0.5, tot = 0;
      for (const { f, g } of chans[c]) { v += sample(g, f, x / S, y / S) * amp; tot += amp; amp *= 0.5; }
      data[o + c] = Math.max(0, Math.min(255, Math.round(v / tot * 255)));
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// opts: sun (direction to the sun), sunCol / amb / haze (linear colours), cover (0..1: how much of the sky is cloud), taps (light steps: 0 for none), radius.
export function buildCloudLayer(opts) {
  const { sun, sunCol, amb, haze, cover = 0.5, taps = 3, radius = 11000, wind = 1, speed = 1 } = opts;
  const sd = sun.clone().normalize(), horiz = Math.hypot(sd.x, sd.z) || 1;
  const tanE = Math.max(0.18, sd.y / horiz);                          // how far the light travels sideways through a cloud's depth
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, fog: false, toneMapped: true,
    uniforms: {
      tNoise: { value: noiseTexture() }, uTime: { value: 0 }, uCover: { value: cover },
      uSun: { value: sd }, uSunCol: { value: new THREE.Vector3(...sunCol) }, uAmb: { value: new THREE.Vector3(...amb) }, uHaze: { value: new THREE.Vector3(...haze) },
      uStep: { value: new THREE.Vector2(sd.x / horiz, sd.z / horiz).multiplyScalar(Math.min(520, 330 / tanE)) },
    },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tNoise; uniform float uTime, uCover; uniform vec3 uSun, uSunCol, uAmb, uHaze; uniform vec2 uStep; varying vec3 vD;
      const float H = 1700.0;
      #define W vec2(uTime * ${(0.00009 * speed * wind).toFixed(6)}, uTime * ${(0.00004 * speed * wind).toFixed(6)})
      // Cloud density at a point of the deck: banks (broad), lumps carve them, wisps fray the edges.
      float shape(vec2 p) {
        vec2 q = p * 0.00019 + W;
        vec4 a = texture2D(tNoise, q);
        float n = a.r * 0.62 + a.g * 0.38 * (0.5 + 0.5 * a.a);
        return n;
      }
      float dens(vec2 p, float cov) {
        float n = shape(p);
        float c = smoothstep(cov, cov + 0.17, n);
        vec4 w = texture2D(tNoise, p * 0.0011 + W * 3.0 + 0.37);
        return clamp(c * (0.55 + 0.9 * w.b) - (1.0 - w.g) * 0.12 * (1.0 - c) , 0.0, 1.0);
      }
      void main() {
        vec3 d = normalize(vD);
        if (d.y < 0.0) discard;
        float hz = smoothstep(0.0, 0.2, d.y);
        vec2 p = d.xz * (H / max(d.y, 0.035));
        float cov = 1.0 - uCover;
        float rho = dens(p, cov);
        if (rho < 0.003) discard;
        // How much cloud the sunlight crosses to reach this point: more cloud towards the sun means a darker side.
        float tau = 0.0;
        for (int k = 1; k <= ${taps}; k++) tau += shape(p + uStep * float(k)) ;
        ${taps > 0 ? `tau = max(0.0, tau / ${taps}.0 - cov) * 5.0;` : 'tau = 0.35;'}
        float lit = exp(-tau * 1.6);
        float sunDot = max(dot(d, uSun), 0.0);
        float thin = 1.0 - smoothstep(0.0, 0.55, rho);
        float silver = pow(sunDot, 9.0) * (0.35 + 2.4 * thin) + pow(sunDot, 70.0) * 2.5 * thin;
        float belly = smoothstep(0.35, 1.0, rho);
        vec3 col = uAmb * (0.62 + 0.38 * (1.0 - belly)) + uSunCol * (lit * (0.55 + 0.45 * thin) + silver * lit);
        col *= 1.0 - 0.32 * belly * (1.0 - lit);
        float a = smoothstep(0.0, 0.42, rho);
        // Thinning into the haze at the horizon.
        col = mix(uHaze, col, hz); a *= mix(0.0, 1.0, smoothstep(0.0, 0.1, d.y));
        gl_FragColor = vec4(col, a * 0.97);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  mesh.renderOrder = -3; mesh.frustumCulled = false;
  mesh.onBeforeRender = () => { mat.uniforms.uTime.value = performance.now() / 1000; };
  return mesh;
}
