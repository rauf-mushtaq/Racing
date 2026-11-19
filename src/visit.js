// Walking into any building to look round it (main.js: any wall of a building you stand at and face; rooms-visit.js builds what is inside). Nothing
// here is to be robbed: there are people about (sitting at desks, on sofas and in seats, standing talking, walking round the floor, up and down the
// stairs), and the door you came in by takes you back out.
import { Walker } from './walker.js';
import { wrapAngle } from './util.js';

const NOINP = { mx: 0, my: 0, sprint: false, jump: false, crouch: false };
const MODELS = ['ped_m1', 'ped_f1', 'ped_m2', 'ped_f2', 'ped_m3', 'ped_f3', 'ped_m4', 'ped_f4', 'denim', 'street', 'tee', 'leather', 'hoodie', 'agent'];
// Someone in the building. spot: { role, x, z, face, key?, sit?: 'sit' | 'desk' | 'sofa', seat?, y? (a gallery's height), route?: [[x, z, h?], ...] (room metres) }
class Person {
  constructor(V, spot, i) {
    this.V = V; this.spot = spot; const I = V.env.interior, R = I.room;
    const key = spot.key || MODELS[(Math.abs((V.venue.seed | 0) + i * 7919) >>> 0) % MODELS.length];
    const w = this.w = new Walker(V.env.scene, key, { lite: true }); w.interior = I;
    w.place(spot.x, spot.z, spot.face ?? 0); w.y = R.oy + (spot.y || 0); w.show(true);
    if (spot.sit) { w.hold = true; w.ex = { kind: spot.sit, p: 0, t: Math.random() * 9, seat: spot.seat ?? 0.46, seed: i }; }
    if (spot.route) { w.noClip = true; this.leg = 1; this.pause = Math.random() * 2; }
  }
  update(dt) {
    const w = this.w, sp = this.spot, R = this.V.env.interior.room;
    if (w.ex) { w.ex.t += dt; w.update(dt, NOINP, 0, null); return; }
    if (sp.route) {                                                                   // walking from point to point (and up or down stairs on the way), pausing now and then
      const [tx, tz] = sp.route[this.leg], dx = tx - (w.x - R.ox), dz = tz - (w.z - R.oz), d = Math.hypot(dx, dz);
      if (this.pause > 0) this.pause -= dt;
      else if (d < 0.4) { this.leg = (this.leg + 1) % sp.route.length; if (Math.random() < 0.3) this.pause = 1.5 + Math.random() * 4; }
      w.update(dt, this.pause > 0 ? NOINP : { mx: -dx / (d || 1) * 0.32, my: dz / (d || 1) * 0.32, sprint: false, jump: false, crouch: false }, 0, null);
      return;
    }
    // Standing: now and then turning to look about (or at whoever stands near).
    this.lookT = (this.lookT || 0) - dt;
    if (this.lookT <= 0) { this.lookT = 3 + Math.random() * 6; this.want = (sp.face ?? 0) + (Math.random() - 0.5) * 1.2; }
    if (this.want !== undefined) w.h += wrapAngle(this.want - w.h) * Math.min(1, dt * 2);
    w.update(dt, NOINP, 0, null);
  }
  dispose() { const sc = this.V.env.scene, w = this.w; w.show(false); sc.remove(w.mesh); sc.remove(w.blob); }
}

export class Visit {
  // env: { scene, interior, walker, toast(text, secs) }
  constructor(env) { this.env = env; this.active = false; this.people = []; this._prompt = ''; this.venue = null; }
  get prompt() { return this._prompt; }
  begin(venue, type) {
    this.end(); const R = this.env.interior.room; this.venue = venue; this.active = true;
    this.people = R.spots.map((s, i) => new Person(this, s, i));
    if (type && this.env.toast) this.env.toast(type.name + ': ' + type.blurb.toUpperCase(), 2.4);
  }
  end() { for (const p of this.people) p.dispose(); this.people.length = 0; this.active = false; this._prompt = ''; }
  update(dt) {
    if (!this.active) return; const R = this.env.interior.room, P = this.env.walker;
    // (in a big room, those far from you are moved on less often: a third of the frames beyond 25 m)
    this.frame = (this.frame || 0) + 1;
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i], far = Math.hypot(p.w.x - P.x, p.w.z - P.z) > 25; p.acc = (p.acc || 0) + dt;
      if (far && (this.frame + i) % 3) continue; p.update(Math.min(p.acc, 0.1)); p.acc = 0;
    }
    this._prompt = Math.hypot(R.exit.x - P.x, R.exit.z - P.z) < 1.7 && P.y < R.oy + 0.3 ? 'LEAVE' : '';
  }
  use() { return this._prompt === 'LEAVE' ? 'exit' : false; }
}
