// Headlight beams on the road: one instanced, additive, cone-shaped patch of light in front of every car with its lights on (at
// dusk and at night). It is a cheap stand-in for real spotlights, which the city could never afford a hundred of.
import * as THREE from 'three';

export class Headlights {
  constructor(scene, cap = 190) {
    const W = 64, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = y / (H - 1), u = Math.abs((x + 0.5) / W - 0.5) * 2, half = 0.28 + 0.72 * Math.pow(t, 0.75);
      const a = sm(half, half * 0.25, u) * Math.pow(1 - t, 1.5) * sm(0, 0.06, t), o = (y * W + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    // The plane runs from the car (z = 0) forwards (z = 1); the top row of the texture is the car end.
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.2, 1.0, 0.7), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; scene.add(this.mesh);
    this.cap = cap; this.n = 0; this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
  }
  begin() { this.n = 0; }
  // A beam starting at (x, y, z), pointing along heading h, len metres long and wid metres wide at the far end.
  add(x, y, z, h, len = 18, wid = 6) {
    if (this.n >= this.cap) return;
    this.q.setFromAxisAngle(this.up, h); this.v.set(x, y, z); this.s.set(wid, 1, len); this.m4.compose(this.v, this.q, this.s); this.mesh.setMatrixAt(this.n++, this.m4);
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; }
  set visible(v) { this.mesh.visible = v; }
}
