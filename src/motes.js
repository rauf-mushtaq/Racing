// Dust and pollen hanging in the air: a few hundred specks that drift in a box round the camera and catch the light. They are only really visible
// looking towards the sun (they scatter it forwards, which is why low sun through a hazy street seems to be full of glitter), so it costs nothing
// in the shade. All the motion is in the vertex shader, so it costs the CPU nothing; it is one draw call of points.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

export class Motes {
  constructor(scene, sun, color, n = 420, strength = 1) {
    const r = mulberry32(2026), pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set([r(), r(), r()], i * 3); seed[i] = r(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSun: { value: sun.clone().normalize() }, uCol: { value: new THREE.Color(...color) }, uPx: { value: 600 }, uAmt: { value: strength } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSeed; uniform float uTime, uPx, uAmt; uniform vec3 uCam, uSun; varying float vA;
        void main(){
          vec3 box = vec3(64.0, 20.0, 64.0);
          vec3 p = position * box;
          p.x += sin(uTime * 0.17 + aSeed * 40.0) * 2.2 + uTime * 0.22; p.z += cos(uTime * 0.13 + aSeed * 23.0) * 2.0; p.y += sin(uTime * 0.21 + aSeed * 11.0) * 0.9 + uTime * 0.06;
          vec3 w; w.xz = uCam.xz + (mod(p.xz - uCam.xz + box.xz * 0.5, box.xz) - box.xz * 0.5); w.y = uCam.y - 4.0 + mod(p.y, box.y);
          vec4 mv = viewMatrix * vec4(w, 1.0); float dist = -mv.z;
          vec3 v = normalize(w - uCam);
          float fwd = pow(max(dot(v, uSun), 0.0), 9.0);                                 // lit from behind: seen against the sun
          float tw = 0.65 + 0.35 * sin(uTime * (1.3 + aSeed * 2.0) + aSeed * 50.0);
          vA = uAmt * (0.03 + 0.9 * fwd) * tw * smoothstep(3.0, 9.0, dist) * (1.0 - smoothstep(24.0, 56.0, dist));
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uPx * (0.018 + aSeed * 0.03) / max(dist, 0.5), 1.0, 3.5);
        }`,
      fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; gl_FragColor = vec4(uCol * vA, 1.0) * smoothstep(1.0, 0.0, d); }',
    });
    this.mesh = new THREE.Points(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; scene.add(this.mesh);
  }
  set visible(v) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }
  update(t, camera, height) {
    const U = this.uniforms; U.uTime.value = t; U.uCam.value.copy(camera.position); U.uPx.value = height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  }
}
