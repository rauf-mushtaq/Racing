// Birds: loose flocks circling over the city, seen as dark flapping silhouettes against the bright sky. One instanced mesh of 'V' shapes; every bird's circling path,
// banking and wing beat is worked out in the vertex shader from its own seed, so it costs the CPU nothing. The flocks drift with the camera (they are wrapped round it) so
// there are always some in view, and they melt into the haze with distance.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

export class Birds {
  constructor(scene, haze, n = 36) {
    // One bird: a body triangle and two wings (each two triangles), wingspan 1, nose along +z. Wing tips are the vertices with |x| = 0.5 (they flap).
    const pos = [0, 0, 0.16, -0.06, 0, -0.1, 0.06, 0, -0.1,                                  // body
      0, 0, 0.06, -0.5, 0, -0.04, -0.06, 0, -0.14,   0, 0, 0.06, -0.06, 0, -0.14, -0.5, 0, -0.04,                 // left wing, seen from above and below
      0, 0, 0.06, 0.06, 0, -0.14, 0.5, 0, -0.04,     0, 0, 0.06, 0.5, 0, -0.04, 0.06, 0, -0.14];
    const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.instanceCount = n;
    const r = mulberry32(777), seed = new Float32Array(n * 4), flock = new Float32Array(n * 2);
    const F = Math.max(3, Math.round(n / 9));
    for (let i = 0; i < n; i++) {
      const f = i % F;                                                                          // which flock this bird is in
      seed.set([r() * 6.28, 0.7 + r() * 0.6, r() * 6.28, 0.8 + r() * 0.5], i * 4);
      flock.set([f, F], i * 2);
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4)); g.setAttribute('aFlock', new THREE.InstancedBufferAttribute(flock, 2));
    this.uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uHaze: { value: new THREE.Color(...haze) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.DoubleSide, fog: false, transparent: false,
      vertexShader: `attribute vec4 aSeed; attribute vec2 aFlock; uniform float uTime; uniform vec3 uCam; varying float vD;
        void main() {
          float fl = aFlock.x, ph = aSeed.x, spd = (0.22 + 0.06 * fract(fl * 0.37)) * aSeed.y * (mod(fl, 2.0) < 1.0 ? 1.0 : -1.0);
          // the flock's centre: a point 80 to 260 m from the camera at a bearing that is fixed per flock (and slowly turns), so some are always in front of you
          float bear = fl * 2.4 + uTime * 0.01, dist = 60.0 + 42.0 * fl;
          vec2 c = uCam.xz + vec2(sin(bear), cos(bear)) * dist;
          float a = uTime * spd + ph;                                                           // where on its circle this bird is
          float rad = 28.0 + 12.0 * aSeed.w + 8.0 * fl;
          vec2 p = c + vec2(cos(a), sin(a)) * rad;
          float h = uCam.y + 62.0 + 26.0 * fl + 9.0 * sin(uTime * 0.3 + aSeed.z);
          vec2 tang = normalize(vec2(-sin(a), cos(a)) * sign(spd));                             // the way it is flying
          float yaw = atan(tang.x, tang.y), bank = -0.5 * sign(spd);
          // wing beat: the tips rise and fall, then glide a little
          float flap = sin(uTime * (7.0 + 3.0 * aSeed.y) + aSeed.z) * (0.5 + 0.5 * sin(uTime * 0.4 + aSeed.z * 3.0));
          vec3 q = position * 2.8; q.y += abs(q.x) * (0.45 * flap + 0.1);
          float cb = cos(bank), sb = sin(bank); q = vec3(q.x * cb - q.y * sb, q.x * sb + q.y * cb, q.z);
          float cy = cos(yaw), sy = sin(yaw); q = vec3(q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy);
          vec3 w = vec3(p.x, h, p.y) + q;
          vD = distance(w, uCam);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: 'uniform vec3 uHaze; varying float vD; void main(){ gl_FragColor = vec4(mix(vec3(0.012, 0.012, 0.02), uHaze * 0.7, smoothstep(220.0, 640.0, vD)), 1.0); }',
    });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; scene.add(this.mesh);
  }
  set visible(v) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }
  update(t, camera) { this.uniforms.uTime.value = t; this.uniforms.uCam.value.copy(camera.position); }
}
