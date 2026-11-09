// A kind of car as it is drawn in the street, at two levels of detail (cardetail.js says what each has). A set holds every car of one kind: the ones far away go to
// the cheap meshes, the ones near go to the detailed ones, and their wheels turn and steer. Cars are put in by `add` each frame, between `begin` and `end`.
import * as THREE from 'three';
import { NEAR_R } from './cardetail.js';
import { clamp, lerp, wrapAngle } from './util.js';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _w = new THREE.Matrix4(), _t = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qx = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _X = new THREE.Vector3(1, 0, 0), _Y = new THREE.Vector3(0, 1, 0);
export class CarSet {
  // model: { geo, lights (far), near: { body, glass, details, lamps, wheel, decal }, wheelAt: [[x, z, front]], wr, wb }; mats from carMaterials()
  constructor(scene, model, cap, mats) {
    this.model = model; this.cap = cap;
    const M = (geo, mat, n = cap) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.visible = false; m.frustumCulled = false; scene.add(m); return m; };
    this.far = { body: M(model.geo, mats.paint), lights: M(model.lights, mats.lamps) };
    const N = model.near; this.near = null;
    if (N) this.near = { body: M(N.body, mats.paint), glass: M(N.glass, mats.glass), details: M(N.details, mats.details), lamps: M(N.lamps, mats.lamps), wheels: M(N.wheel, mats.wheel, cap * 4) };
    if (N) { this.near.glass.renderOrder = 4; if (N.decal) { this.near.decal = M(N.decal, mats.decal); this.near.decal.renderOrder = 3; } }
    for (const m of [this.far.body, this.near && this.near.body]) if (m) m.receiveShadow = true;
    this.nf = 0; this.nn = 0;
  }
  // The wheels' turning for a car: `c` keeps its own roll and steering between frames.
  wheelState(c, speed, h, dt) {
    const wr = this.model.wr, wb = this.model.wb; c._sp = ((c._sp || 0) + speed * dt / wr) % (Math.PI * 2);
    const dh = c._h0 === undefined ? 0 : wrapAngle(h - c._h0); c._h0 = h;
    const rate = dt > 1e-4 ? dh / dt : 0, want = clamp(Math.atan(rate * wb / Math.max(Math.abs(speed), 2)), -0.5, 0.5) * (speed < 0 ? -1 : 1);
    c._st = lerp(c._st || 0, want, 0.3);
  }
  begin() { this.nf = 0; this.nn = 0; }
  setVisible(v) { this.hidden = !v; if (!v) for (const m of [this.far.body, this.far.lights, ...(this.near ? Object.values(this.near) : [])]) m.visible = false; }
  // m4: where the body is; col: its paint (or null); dist2: squared distance from the player; c: the car's own record (it keeps its wheels' state); speed (m/s) and h (heading) for the wheels.
  add(m4, col, dist2, c, speed, h, dt, dead = false) {
    if (!this.near || dist2 > NEAR_R * NEAR_R) {
      if (this.nf >= this.cap) return; const i = this.nf++, F = this.far;
      F.body.setMatrixAt(i, m4); F.lights.setMatrixAt(i, dead ? ZERO : m4); if (col) F.body.setColorAt(i, col); return;
    }
    if (this.nn >= this.cap) return; const i = this.nn++, N = this.near, md = this.model;
    N.body.setMatrixAt(i, m4); N.glass.setMatrixAt(i, m4); N.details.setMatrixAt(i, m4); N.lamps.setMatrixAt(i, dead ? ZERO : m4); if (N.decal) N.decal.setMatrixAt(i, m4); if (col) N.body.setColorAt(i, col);
    this.wheelState(c, dead ? 0 : speed, h, dt);
    for (let k = 0; k < md.wheelAt.length; k++) {
      const [wx, wz, front] = md.wheelAt[k];
      _q.setFromAxisAngle(_Y, front ? c._st : 0); _qx.setFromAxisAngle(_X, c._sp); _q.multiply(_qx);                         // (steer about the vertical, then roll about the axle)
      _v.set(wx, md.wr, wz); _t.compose(_v, _q, _s); _w.multiplyMatrices(m4, _t); N.wheels.setMatrixAt(i * 4 + k, _w);
    }
  }
  end() {
    const F = this.far, N = this.near;
    F.body.count = F.lights.count = this.nf; for (const m of [F.body, F.lights]) { m.visible = !this.hidden && m.count > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    if (!N) return;
    N.body.count = N.glass.count = N.details.count = N.lamps.count = this.nn; N.wheels.count = this.nn * 4; if (N.decal) N.decal.count = this.nn;
    for (const m of [N.body, N.glass, N.details, N.lamps, N.wheels, N.decal]) if (m) { m.visible = !this.hidden && m.count > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}
