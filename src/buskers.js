// Street performers. At spots round the city (a corner of a pavement, the cathedral square, the plazas, the approaches to the bridges) a busker plays:
// a guitarist, a saxophonist, a bucket drummer, a juggler, or a living statue painted silver. They are real people (the same models as the
// pedestrians, posed by the stick skeleton for the arms and by recorded motion for the legs), with their instrument or props, and the music
// comes from where they stand (panned and fading with distance, see audio.js). A few of the pedestrians stop and watch in a half circle, clap when a
// piece ends, and go back to walking when you leave. Only the nearest three buskers are real at any moment; the rest are just a place on the map.
import * as THREE from 'three';
import { buildRig, animate } from './person.js';
import { loadPerson, PEDS } from './people.js';
import { blockRect, isPark, landmarkAt, signatureAt, isPlaza } from './grid.js';
import { hash3, clamp } from './util.js';
import { BRIDGES, riverSdf, inRiverBox } from './rivercourse.js';
import { addStaticCollider, queryColliders } from './city.js';
import { groundAt } from './world.js';

const STYLES = ['guitar', 'sax', 'drums', 'juggler', 'statue'], KEYS = Object.keys(PEDS);
export const SPOTS = [];
const add = (x, z, h, style, name = '') => { SPOTS.push({ id: SPOTS.length, x, z, h, style, name, live: false, watchers: [], next: 0, applause: 0, nextApplause: 0, bar: 0 }); };
// By hand: near where you start, the cathedral square (two, facing across the fountain), the plazas, by the wheel and the stadium.
add(19.8, 452, 0, 'guitar', 'start'); add(-19.8, 508, Math.PI, 'sax', 'start');
{ const b = blockRect(-3, 3), fz = b.z1 - 20, cx = (b.x0 + b.x1) / 2; add(cx + 11.5, fz, -Math.PI / 2, 'guitar', 'cathedral'); add(cx - 11.5, fz, Math.PI / 2, 'juggler', 'cathedral'); add(cx, fz + 12, Math.PI, 'statue', 'cathedral'); }
for (let i = -12; i < 12; i++) for (let j = -12; j < 12; j++) if (isPlaza(i, j)) { const b = blockRect(i, j), cx = (b.x0 + b.x1) / 2 + 1, cz = (b.z0 + b.z1) / 2; add(cx + 12.5, cz + 3, -Math.PI / 2, STYLES[(hash3(i, j, 5) * 5) | 0], 'plaza'); add(cx - 12.5, cz - 3, Math.PI / 2, STYLES[(hash3(i, j, 6) * 5) | 0], 'plaza'); }
{ const b = blockRect(3, -3), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2; add(cx + 34, cz + 14, -Math.PI / 2, 'statue', 'wheel'); add(cx - 30, cz - 16, Math.PI / 2, 'drums', 'wheel'); }
{ const b = blockRect(3, 4); add(b.x0 + 2.8, b.z0 + 14, 0, 'drums', 'stadium'); }
// At the south end of every other bridge, on the pavement, facing the bridge.
BRIDGES.forEach((br, k) => { if (k % 2) return; const v = br.hw + 3.4, u = br.u0 - 9; if (br.axis === 'z') add(br.c + v, u, 0, STYLES[k % 5], 'bridge'); else add(u, br.c + v, Math.PI / 2, STYLES[(k + 2) % 5], 'bridge'); });
// And at the corner of some blocks, on the pavement, facing along it (the people stop on the pavement in front of them).
for (let i = -9; i < 9; i++) for (let j = -9; j < 9; j++) {
  if (hash3(i, j, 91) > 0.085 || isPark(i, j) || landmarkAt(i, j) || signatureAt(i, j) || isPlaza(i, j)) continue;
  const b = blockRect(i, j), cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  if (inRiverBox(cx, cz, 120) && riverSdf(cx, cz) < 110) continue;
  const q = Math.floor(hash3(i, j, 92) * 4), e = 2.7, x = q & 1 ? b.x1 - e : b.x0 + e, z = q & 2 ? b.z1 - e : b.z0 + e;
  add(x, z, q & 2 ? Math.PI : 0, STYLES[(hash3(i, j, 93) * 5) | 0], 'corner');
}
for (const s of SPOTS) addStaticCollider({ type: 'circ', x: s.x, z: s.z, r: 0.55 });

const C = h => new THREE.Color(h);
const WOOD = C(0x9a5a2a), DARKW = C(0x3a2214), GOLD = C(0xd9a935);
const _o = [];
// A walking person's position is fine if nothing solid is there and it is not in the road or the water.
function standable(x, z) {
  queryColliders(x, z, 0.7, _o);
  for (const c of _o) { if (c.type === 'box' ? (x > c.x0 - 0.45 && x < c.x1 + 0.45 && z > c.z0 - 0.45 && z < c.z1 + 0.45) : Math.hypot(x - c.x, z - c.z) < c.r + 0.45) return false; }
  return groundAt(x, z).y > 0.08;
}

export class Buskers {
  constructor(scene, peds, audio, shadows) {
    this.scene = scene; this.peds = peds; this.audio = audio; this.shadows = shadows; this.pool = []; this.loading = false; this.t = 0; this.acc = 0;
    this.mat = { wood: new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.55 }), dark: new THREE.MeshStandardMaterial({ color: DARKW, roughness: 0.7 }), gold: new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.25, metalness: 0.85 }), plinth: new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.8 }) };
    this.balls = null;
  }
  // One performer: a real person on a bare stick skeleton, and room for props. Made when first needed (loading the model takes a moment).
  async make() {
    if (this.loading || this.pool.length >= 3) return; this.loading = true;
    try {
      const key = KEYS[(this.pool.length * 3 + 1) % KEYS.length], person = await loadPerson(key), rig = Object.assign(buildRig(null, null, false), { meshes: [] });
      person.root.scale.setScalar(0.01); rig.root.add(person.root); person.setShadows(this.shadows); rig.root.visible = false; this.scene.add(rig.root);
      const props = new THREE.Group(); rig.root.add(props);
      const orig = {}; for (const k in person.mats) { const m = person.mats[k]; orig[k] = { color: m.color.clone(), map: m.map, metalness: m.metalness, roughness: m.roughness }; }
      this.pool.push({ person, rig, props, orig, spot: null, key, painted: false });
    } catch (e) { console.warn('busker model not loaded', e); }
    this.loading = false;
  }
  // The props for a style, in the performer's own frame (+z is the way they face, +x their left, metres).
  dress(P, style) {
    for (const o of [...P.props.children]) { P.props.remove(o); o.geometry && o.geometry.dispose(); }
    const m = this.mat, add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = this.shadows; P.props.add(o); return o; };
    P.balls = null;
    if (style === 'guitar') {
      add(new THREE.BoxGeometry(0.36, 0.44, 0.1), m.wood, 0.06, 1.0, 0.24, 0, 0, 0.35); add(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 12).rotateX(Math.PI / 2), m.dark, 0.06, 1.0, 0.3, 0, 0, 0.35);
      add(new THREE.BoxGeometry(0.06, 0.66, 0.035), m.dark, 0.36, 1.2, 0.27, 0, 0, -1.15);                                                  // the neck, out to the left
      const open = add(new THREE.BoxGeometry(0.62, 0.12, 0.28), m.dark, 0, 0.06, 1.0); for (let k = 0; k < 5; k++) add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 8), m.gold, -0.18 + k * 0.09, 0.125, 1.0 + (k % 2) * 0.05);   // the case, open, with a few coins in it
      void open;
    } else if (style === 'sax') {
      add(new THREE.CylinderGeometry(0.035, 0.05, 0.7, 10), m.gold, 0.03, 1.12, 0.27, 0.18, 0, 0); add(new THREE.ConeGeometry(0.11, 0.2, 12), m.gold, 0.03, 0.74, 0.34, Math.PI - 0.15, 0, 0);
      add(new THREE.BoxGeometry(0.62, 0.12, 0.28), m.dark, 0, 0.06, 1.0);
    } else if (style === 'drums') {
      for (const [x, z, c] of [[-0.3, 0.46, 0x2a6fc0], [0.3, 0.46, 0xe07a1f], [0, 0.72, 0xe8e8e8]]) add(new THREE.CylinderGeometry(0.19, 0.17, 0.4, 14), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2 }), x, 0.2, z);
      add(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 14), m.dark, -0.1, 0.03, 1.4);
    } else if (style === 'juggler') {
      P.balls = [0xe03030, 0xf0c020, 0x2a7ae0].map(c => add(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }), 0, 1.4, 0.35));
      add(new THREE.BoxGeometry(0.5, 0.1, 0.5), m.dark, 0, 0.05, 1.1);
    } else {
      add(new THREE.BoxGeometry(0.9, 0.34, 0.9), m.plinth, 0, 0.17, 0); add(new THREE.CylinderGeometry(0.22, 0.2, 0.1, 12), m.dark, 0.0, 0.05, 1.3);
    }
    P.props.position.y = style === 'statue' ? 0.34 : 0;                                              // (the statue stands on its plinth)
    // a living statue is painted silver; everyone else gets their own clothes back
    for (const k in P.person.mats) {
      const mt = P.person.mats[k], o = P.orig[k]; if (!o) continue;
      if (style === 'statue') { mt.color.set(0xc9ccd2); mt.map = null; mt.metalness = 0.85; mt.roughness = 0.32; } else { mt.color.copy(o.color); mt.map = o.map; mt.metalness = o.metalness; mt.roughness = o.roughness; }
      mt.needsUpdate = true;
    }
    P.style = style;
  }
  // The arms for each style (the stick skeleton's joints), after the standing animation has set the rest.
  pose(P, dt, s) {
    const B = P.rig, t = this.t + s.id * 1.7, style = P.style, st = style === 'statue';
    animate(B, { t: st ? 0 : t, speed: 0, look: st ? 0 : Math.sin(t * 0.4) * 0.5 });
    const sw = (j, a) => { j.rotation.x = -a; };
    if (style === 'guitar') {
      const strum = Math.sin(t * 10.5) * 0.24 + (Math.sin(t * 2.6) > 0.7 ? 0.2 : 0);
      sw(B.shoulderL, 0.85); B.shoulderL.rotation.z = -0.55; B.elbowL.rotation.x = -0.45; sw(B.shoulderR, 0.5); B.shoulderR.rotation.z = 0.2; B.elbowR.rotation.x = -(1.3 + strum);
      B.torso.rotation.z += 0.05 * Math.sin(t * 1.9); B.hips.rotation.z += 0.03 * Math.sin(t * 1.9); B.head.rotation.x += 0.12 + Math.sin(t * 3.8) * 0.05;
    } else if (style === 'sax') {
      for (const [sh, el, side] of [[B.shoulderL, B.elbowL, -1], [B.shoulderR, B.elbowR, 1]]) { sw(sh, 0.75); sh.rotation.z = side * 0.28; el.rotation.x = -1.6; }
      B.torso.rotation.z += 0.09 * Math.sin(t * 1.3); B.torso.rotation.x -= 0.1; B.head.rotation.x -= 0.2;
    } else if (style === 'drums') {
      const a = Math.max(0, Math.sin(t * 8.5)), b = Math.max(0, Math.sin(t * 8.5 + Math.PI)), fill = Math.sin(t * 0.7) > 0.8 ? 1.7 : 1;
      sw(B.shoulderL, 0.55 + 0.45 * Math.max(0, Math.sin(t * 8.5 * fill))); B.elbowL.rotation.x = -(1.25 - 0.5 * a); sw(B.shoulderR, 0.55 + 0.45 * b); B.elbowR.rotation.x = -(1.25 - 0.5 * b);
      B.torso.rotation.x += 0.12; B.head.rotation.z += 0.08 * Math.sin(t * 4.2);
    } else if (style === 'juggler') {
      const c = Math.sin(t * 5.2) * 0.12; sw(B.shoulderL, 0.7 + c); sw(B.shoulderR, 0.7 - c); B.shoulderL.rotation.z = -0.25; B.shoulderR.rotation.z = 0.25; B.elbowL.rotation.x = -1.35 - c; B.elbowR.rotation.x = -1.35 + c;
      B.head.rotation.x -= 0.18 + 0.1 * Math.sin(t * 5.2);
      P.balls.forEach((o, k) => { const a = t * 6.2 + k * Math.PI * 2 / 3; o.position.set(0.3 * Math.sin(a), 1.2 + 0.3 * Math.cos(2 * a) + 0.14 * Math.abs(Math.sin(a)), 0.38); });
    } else {                                                                                          // the statue: a torch held high, quite still
      sw(B.shoulderR, 2.7); B.shoulderR.rotation.z = 0.15; B.elbowR.rotation.x = -0.15; sw(B.shoulderL, 0.1); B.elbowL.rotation.x = -0.1; B.head.rotation.y = 0.4; B.head.rotation.x = -0.12;
    }
    P.person.grip('R', style === 'statue' ? 0.8 : 0.6, 1); P.person.grip('L', style === 'statue' ? 0.2 : 0.6, 1);
    P.person.faceOn = true; P.person.poseMocap(B, { speed: 0, phase: 0, t, pLegs: 0, pUpper: 1 }); P.person.updateFace(dt);
    B.root.position.set(s.x, groundAt(s.x, s.z).y, s.z); B.root.rotation.y = s.h;
  }
  // The music: a note, a stroke of the drum, now and then, from where the busker stands.
  music(P, s, level) {
    const a = this.audio; if (!a || !a.ctx) return;
    const at = [s.x, 1.3, s.z], v = 0.22 * level;
    if (this.t < s.next) return;
    if (s.style === 'guitar') {                                                                         // Am F C G, picked: bass, then three on top, round and round
      const chords = [[110, 164.8, 220, 261.6], [87.3, 130.8, 174.6, 220], [130.8, 196, 261.6, 329.6], [98, 146.8, 196, 246.9]], ch = chords[(s.bar >> 3) % 4], beat = 0.34, pat = [0, 2, 3, 2, 1, 2, 3, 2];
      a.busk('guitar', ch[pat[s.bar % 8]], 1.1, v * (pat[s.bar % 8] === 0 ? 1.2 : 0.8), at); s.bar++; s.next = this.t + beat;
    } else if (s.style === 'sax') {                                                                    // a slow tune that wanders about a minor pentatonic scale, with rests
      const sc = [196, 220, 261.6, 293.7, 329.6, 392, 440]; s.i = clamp((s.i ?? 3) + [-2, -1, -1, 0, 1, 1, 2][(Math.random() * 7) | 0], 0, sc.length - 1);
      const d = [0.45, 0.45, 0.9, 1.2][(Math.random() * 4) | 0]; if (Math.random() > 0.15) a.busk('sax', sc[s.i], d, v * 0.9, at); s.next = this.t + d + (Math.random() < 0.2 ? 0.6 : 0.05);
    } else if (s.style === 'drums') {                                                                  // a bucket beat: boom, tick, bap, tick
      const step = s.bar++ % 8, hit = [1, 0, 2, 0, 1, 1, 2, 3][step]; if (hit) a.busk('drum' + hit, 0, 0.25, v * 1.1, at); s.next = this.t + 0.2;
    } else if (s.style === 'juggler') {                                                                // a bright little tune from a radio at his feet
      const sc = [261.6, 329.6, 392, 523.3, 392, 329.6, 293.7, 392]; a.busk('pluck', sc[s.bar++ % 8], 0.3, v * 0.7, at); s.next = this.t + 0.24;
    } else if (Math.random() < 0.5) { a.busk('coin', 0, 0.5, v * 0.8, at); s.next = this.t + 5 + Math.random() * 9; } else s.next = this.t + 4;     // the statue: a coin dropped in the hat, now and then
  }
  // Some of the pedestrians stop and watch, in a half circle in front of the performer.
  gather(s) {
    const want = { guitar: 5, sax: 5, drums: 6, juggler: 6, statue: 3 }[s.style];
    s.watchers = s.watchers.filter(p => p.state === 'watch' && p.spot === s);
    if (s.watchers.length >= want) return;
    const list = this.peds.list;
    for (const p of list) {
      if (s.watchers.length >= want) break;
      if (!p.colors || p.real || p.state === 'watch' || p.state === 'down' || p.state === 'panic') continue;
      if (p.state !== 'away' && Math.hypot(p.x - s.x, p.z - s.z) > 160) continue;
      const k = s.watchers.length, ang = s.h + (((k % 2 ? 1 : -1) * (1 + (k >> 1))) * 0.34), r = 2.7 + (k % 3) * 0.75, x = s.x + Math.sin(ang) * r, z = s.z + Math.cos(ang) * r;
      if (!standable(x, z)) continue;
      Object.assign(p, { state: 'watch', spot: s, ring: null, x, z, y: groundAt(x, z).y, h: Math.atan2(s.x - x, s.z - z) + (Math.random() - 0.5) * 0.3, speed: 0, vx: 0, vz: 0, lie: 0, clap: 0, phase: Math.random() * 6.28, idleT: 0 });
      s.watchers.push(p);
    }
  }
  update(dt, focus, camera) {
    this.t += dt; this.acc += dt;
    const near = SPOTS.filter(s => Math.hypot(s.x - focus.x, s.z - focus.z) < 70).sort((a, b) => Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z)).slice(0, 3);
    for (const P of this.pool) {                                                                       // hand back those that are far away now
      const s = P.spot; if (!s) continue;
      if (Math.hypot(s.x - focus.x, s.z - focus.z) > 95 || (!near.includes(s) && Math.hypot(s.x - focus.x, s.z - focus.z) > 80)) { s.live = false; P.spot = null; P.rig.root.visible = false; }
    }
    for (const s of near) {
      if (this.pool.some(P => P.spot === s)) continue;
      const P = this.pool.find(q => !q.spot);
      if (!P) { if (this.pool.length < 3 && !this.loading) this.make(); continue; }
      if (!s.checked) { s.checked = true; const o = [[0, 0], [1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3], [2.2, 1.2], [-2.2, -1.2]].find(([dx, dz]) => standable(s.x + dx, s.z + dz)); if (o) { s.x += o[0]; s.z += o[1]; } else s.bad = true; }     // (not inside a lamp post or a tree)
      if (s.bad) continue;
      P.spot = s; s.live = true; s.next = this.t + 0.4 + Math.random(); s.nextApplause = this.t + 14 + Math.random() * 14; s.applause = 0; this.dress(P, s.style); P.rig.root.visible = true;
    }
    if (!this.pool.length && near.length && !this.loading) this.make();
    for (const P of this.pool) {
      const s = P.spot; if (!s) continue;
      const d = Math.hypot(s.x - focus.x, s.z - focus.z); this.pose(P, dt, s);
      if (this.acc > 1.2) this.gather(s);
      this.music(P, s, clamp(1.6 - d / 60, 0.25, 1));
      if (this.t > s.nextApplause && s.style !== 'statue') { s.applause = 2.8; s.nextApplause = this.t + 16 + Math.random() * 16; if (this.audio && this.audio.applause) this.audio.applause([s.x, 1.5, s.z], 0.35); }
      s.applause = Math.max(0, s.applause - dt);
      for (const p of s.watchers) p.clap = s.applause > 0 ? 1 : 0;
    }
    if (this.acc > 1.2) this.acc = 0;
  }
}
