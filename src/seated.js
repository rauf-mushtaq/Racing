// The driver: the player's chosen character, seated at the wheel of whichever car is being driven, so the chase and chase-camera views
// show a person in the car (not an empty seat). The hips sit where the car's `userData.cockpit.seat` says, the hands follow two markers on
// the steering wheel (so they turn with it), the head looks into the bend, the right foot works the pedals. Hidden in the driver's-eye
// view (the camera is where the head is) and when the player is on foot.
import * as THREE from 'three';
import { buildRig, seatedPose } from './person.js';
import { loadPerson, personKey } from './people.js';
import { clamp, damp } from './util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
export class SeatedDriver {
  constructor(scene, shadows = true) {
    this.rig = Object.assign(buildRig(null, null, false), { meshes: [] }); this.root = this.rig.root; this.root.visible = false;
    this.person = null; this.host = null; this.t = Math.random() * 10; this.steer = 0; this.look = 0; this.gas = 0; this.brake = 0; this.shadows = shadows; this.want = null;
  }
  async setOutfit(key) {
    key = personKey(key); if (this.person && this.person.key === key) return; this.want = key;
    try {
      const p = await loadPerson(key); if (this.want !== key) return;
      if (this.person) this.root.remove(this.person.root);
      this.person = p; this.root.add(p.root); p.setShadows && p.setShadows(this.shadows); this.pose(0);
    } catch (e) { console.warn('driver model not loaded', e); }
  }
  // Sit in a car (its mesh group, with userData.body and userData.cockpit.seat); null takes the driver out.
  mount(carMesh) {
    const seat = carMesh && carMesh.userData.cockpit && carMesh.userData.cockpit.seat;
    if (this.host === carMesh) return; this.root.parent && this.root.parent.remove(this.root);
    this.host = carMesh || null; this.seat = seat || null;
    if (!seat) return;
    carMesh.userData.body.add(this.root); this.root.position.copy(seat.hip); this.pose(0);
  }
  get ready() { return !!(this.person && this.seat); }
  show(v) { this.root.visible = !!v && this.ready; }
  pose(dt) {
    if (!this.seat || !this.host) return;
    const B = this.rig, seat = this.seat; this.host.updateMatrixWorld(true);
    // The grips, from world to the torso's own frame; the one at the car's +x side (its left) is the character's left hand.
    const g0 = seat.grips[0], g1 = seat.grips[1]; let gl = null, gr = null;
    if (g0 && g1) { g0.getWorldPosition(_a); g1.getWorldPosition(_b); const x0 = this.host.userData.body.worldToLocal(_a.clone()).x, x1 = this.host.userData.body.worldToLocal(_b.clone()).x; [gl, gr] = x0 > x1 ? [_a, _b] : [_b, _a]; B.torso.updateWorldMatrix(true, false); gl = B.torso.worldToLocal(gl.clone()); gr = B.torso.worldToLocal(gr.clone()); }
    seatedPose(B, { t: this.t, steer: this.steer, gas: this.gas, brake: this.brake, look: this.look, gripL: gl, gripR: gr });
    if (this.person) { this.person.pose(B); this.person.grip('R', 0.8); this.person.grip('L', 0.8); }
  }
  // st: { steer (the car's steering, + is to the right of the car), speed, throttle, brake, w (yaw rate) }
  update(dt, st) {
    if (!this.root.visible) return;
    this.t += dt;
    this.steer = damp(this.steer, clamp(st.steer, -1, 1), 10, dt);
    this.look = damp(this.look, -clamp(st.steer * 0.4 + st.w * 0.1, -0.5, 0.5), 3.5, dt);          // (into the bend: a turn to the right is a negative turn of the head)
    this.gas = damp(this.gas, st.throttle, 12, dt); this.brake = damp(this.brake, st.brake, 14, dt);
    this.pose(dt);
  }
}
