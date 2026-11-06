// Rain: a few thousand streaks that fall through a box that follows the camera. All the motion is in the vertex shader (each streak
// has a fixed place in the box and the time moves it down, wrapping round), so it costs the CPU nothing.
import * as THREE from 'three';

export class Rain {
  constructor(scene, n = 2200) {
    const pos = new Float32Array(n * 6), seed = new Float32Array(n * 2), end = new Float32Array(n * 2);
    let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < n; i++) {
      const x = rnd() * 46, y = rnd() * 30, z = rnd() * 46, sd = rnd();
      for (let k = 0; k < 2; k++) { pos.set([x, y, z], i * 6 + k * 3); seed[i * 2 + k] = sd; end[i * 2 + k] = k; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0.75, 0.85, 1.0) }, uAlpha: { value: 0.4 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, fog: false,
      vertexShader: `attribute float aSeed; attribute float aEnd; uniform float uTime; uniform vec3 uCam; varying float vEnd;
        void main(){
          float speed = 17.0 + aSeed * 7.0; vec3 box = vec3(46.0, 30.0, 46.0);
          vec3 p = position; p.y = mod(p.y - uTime * speed, box.y);
          p -= vec3(2.2, -speed, 0.8) * 0.014 * aEnd;                                   // the tail of the streak, up and into the wind
          vec3 w; w.xz = uCam.xz + (mod(p.xz - uCam.xz + box.xz * 0.5, box.xz) - box.xz * 0.5); w.y = uCam.y - 9.0 + p.y;
          vEnd = aEnd; gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; varying float vEnd; void main(){ gl_FragColor = vec4(uColor, uAlpha * (1.0 - vEnd * 0.85)); }',
    });
    this.mesh = new THREE.LineSegments(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; this.mesh.visible = false; scene.add(this.mesh);
  }
  set visible(v) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }
  update(t, camera, night) { this.uniforms.uTime.value = t; this.uniforms.uCam.value.copy(camera.position); this.uniforms.uAlpha.value = night ? 0.7 : 0.42; }
}
