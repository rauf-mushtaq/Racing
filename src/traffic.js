// City traffic. Cars drive on the right in their lanes, follow the car ahead,
// slow for turns, wait for cars already crossing a junction, brake for you,
// and get knocked aside if you hit them. Traffic stays around the player:
// cars that fall far behind are moved to roads further ahead.
import * as THREE from 'three';
import { N, SP, hw, isBlvd, laneCount, laneOffset, EDGE } from './city.js';
import { ROADS, groundAt } from './world.js';
import { trafficModels } from './carModel.js';
import { mulberry32, clamp, wrapAngle } from './util.js';

const COLORS = ['#e8e8e8', '#111214', '#9aa0a6', '#5b6066', '#1e2f55', '#8a1c1c', '#c8b89a', '#2f4a3a', '#d7d3cc', '#30343a', '#6b1f2e', '#2a5d8f'].map(c => new THREE.Color(c));
const COUNTS = { off: 0, light: 30, normal: 56, heavy: 96 };
const CAP = 140;

export class Traffic {
  constructor(scene, city, shadows) {
    this.models = trafficModels();
    this.rnd = mulberry32(77);
    this.cars = [];
    this.city = city;
    this.meshes = this.models.map(md => {
      const body = new THREE.InstancedMesh(md.geo, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.32, envMapIntensity: 1.1 }), CAP);
      const lights = new THREE.InstancedMesh(md.lights, new THREE.MeshBasicMaterial({ vertexColors: true }), CAP);
      body.castShadow = false; body.count = 0; lights.count = 0;
      body.receiveShadow = true;
      body.frustumCulled = false; lights.frustumCulled = false;
      scene.add(body); scene.add(lights);
      return { body, lights, list: [] };
    });
    // Soft contact shadows under every car (cheaper than shadow-mapping them).
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const st = new THREE.CanvasTexture(c);
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 5.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), CAP * 2);
    this.blobs.frustumCulled = false; this.blobs.renderOrder = 1; this.blobs.count = 0; scene.add(this.blobs);
    this.sphere = new THREE.Sphere(new THREE.Vector3(), 3.5); this.eul = new THREE.Euler();
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1); this.up = new THREE.Vector3(0, 1, 0);
  }

  setDensity(level, player) {
    const n = COUNTS[level] ?? COUNTS.normal;
    while (this.cars.length > n) this.cars.pop();
    while (this.cars.length < n) {
      const c = { active: true, type: (this.rnd() * 4) | 0, color: COLORS[(this.rnd() * COLORS.length) | 0], len: 4.7 };
      const r = this.rnd();
      c.type = r < 0.07 ? 4 : r < 0.1 ? 5 : r < 0.2 ? 3 : (this.rnd() * 3) | 0;
      c.len = this.models[c.type].len; c.mass = this.models[c.type].mass; c.rad = this.models[c.type].rad;
      this.cars.push(c);
      this.spawn(c, player, 30, 520, true);
    }
  }

  // --- Road graph ------------------------------------------------------------
  edgeInfo(a, b) {
    const alongZ = a[0] === b[0];
    const k = alongZ ? a[0] : a[1];
    const dx = alongZ ? 0 : Math.sign(b[0] - a[0]), dz = alongZ ? Math.sign(b[1] - a[1]) : 0;
    const rx = -dz, rz = dx;
    const crossA = alongZ ? hw(a[1]) : hw(a[0]), crossB = alongZ ? hw(b[1]) : hw(b[0]);
    return { k, dx, dz, rx, rz, crossA, crossB };
  }
  lanePoints(a, b, lane) {
    const e = this.edgeInfo(a, b), off = laneOffset(e.k, lane);
    const ax = a[0] * SP, az = a[1] * SP, bx = b[0] * SP, bz = b[1] * SP;
    return [
      { x: ax + e.dx * (e.crossA + 7) + e.rx * off, z: az + e.dz * (e.crossA + 7) + e.rz * off },
      { x: bx - e.dx * (e.crossB + 7) + e.rx * off, z: bz - e.dz * (e.crossB + 7) + e.rz * off },
      e,
    ];
  }
  neighbours(n) {
    const out = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = n[0] + di, j = n[1] + dj;
      if (Math.abs(i) <= N && Math.abs(j) <= N) out.push([i, j]);
    }
    return out;
  }
  pickNext(from, to) {
    const opts = this.neighbours(to).filter(n => n[0] !== from[0] || n[1] !== from[1]);
    const d0 = [to[0] - from[0], to[1] - from[1]];
    const straight = opts.find(n => n[0] - to[0] === d0[0] && n[1] - to[1] === d0[1]);
    if (straight && this.rnd() < 0.55) return straight;
    return opts[(this.rnd() * opts.length) | 0];
  }
  // Build the path for one edge plus the turn into the next.
  buildPath(c, from, to, lane) {
    const nl = laneCount(this.edgeInfo(from, to).k);
    lane = clamp(lane, 0, nl - 1);
    const next = this.pickNext(from, to);
    const [p0, p1, e1] = this.lanePoints(from, to, lane);
    const e2 = this.edgeInfo(to, next);
    const straight = e1.dx === e2.dx && e1.dz === e2.dz;
    const nl2 = laneCount(e2.k);
    // Right turns end in the outer lane, left turns in the inner one.
    const turnRight = !straight && (e1.rx * e2.dx + e1.rz * e2.dz) > 0;
    const lane2 = straight ? clamp(lane, 0, nl2 - 1) : turnRight ? nl2 - 1 : 0;
    const [q0] = this.lanePoints(to, next, lane2);
    const pts = [p0, p1];
    const ctrl = straight ? { x: (p1.x + q0.x) / 2, z: (p1.z + q0.z) / 2 } : (e1.dz !== 0 ? { x: p1.x, z: q0.z } : { x: q0.x, z: p1.z });
    for (let k = 1; k <= 10; k++) {
      const t = k / 10, u = 1 - t;
      pts.push({ x: u * u * p1.x + 2 * u * t * ctrl.x + t * t * q0.x, z: u * u * p1.z + 2 * u * t * ctrl.z + t * t * q0.z });
    }
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
    Object.assign(c, { axis: e1.dz !== 0 ? 'Z' : 'X', from, to, next, lane: lane2, pts, cum, total: cum[cum.length - 1], straightLen: cum[1], turning: !straight, s: 0, blvd: isBlvd(e1.k) });
  }

  // Out on the motorways: cars follow a lane along the road, in both directions.
  spawnHwy(c, player, minD, maxD, initial) {
    const cands = [];
    for (const R of ROADS) {
      if (R.kind !== 'motorway') continue;
      for (let i = 0; i < R.x.length - 130; i += 6) { const d = Math.hypot(R.x[i] - player.x, R.z[i] - player.z); if (d > minD && d < maxD) cands.push([R, i]); }
      for (let i = 130; i < R.x.length; i += 6) { const d = Math.hypot(R.x[i] - player.x, R.z[i] - player.z); if (d > minD && d < maxD) cands.push([R, -i]); }
    }
    if (!cands.length) { c.mode = 'drive'; c.hwy = true; c.pts = [{ x: 1e5, z: 1e5, y: 0 }, { x: 1e5, z: 1e5 + 50, y: 0 }]; c.cum = [0, 50]; c.total = 50; c.straightLen = 50; c.s = 0; c.speed = 0; c.vmax = 0; this.place(c); return; }
    const [R, k] = cands[(this.rnd() * cands.length) | 0], dir = k >= 0 ? 1 : -1, i0 = Math.abs(k), lane = this.rnd() < 0.5 ? 0 : 1, off = (lane ? 7.0 : 3.4) * dir;
    const pts = [], n = 120;
    for (let q = 0; q < n; q++) {
      const i = clamp(i0 + q * dir, 1, R.x.length - 2);
      let tx = R.x[i + 1] - R.x[i - 1], tz = R.z[i + 1] - R.z[i - 1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      pts.push({ x: R.x[i] - tz * off, z: R.z[i] + tx * off, y: R.y[i] + R.lift });
    }
    const cum = [0]; for (let q = 1; q < n; q++) cum.push(cum[q - 1] + Math.hypot(pts[q].x - pts[q - 1].x, pts[q].z - pts[q - 1].z));
    const r = this.rnd(), type = r < 0.18 ? 4 : r < 0.22 ? 5 : r < 0.4 ? 3 : r < 0.6 ? 1 : (this.rnd() * 3) | 0;
    Object.assign(c, { type, len: this.models[type].len, mass: this.models[type].mass, rad: this.models[type].rad, hwy: true, axis: null, from: null, to: null, pts, cum, total: cum[n - 1], straightLen: cum[n - 1], turning: false, s: initial ? this.rnd() * 300 : 0, blvd: true, mode: 'drive', wait: 0, knockT: 0 });
    c.speed = 24; c.vmax = (type >= 4 ? 21 : 29 + this.rnd() * 8) * (0.9 + this.rnd() * 0.2);
    c.h = undefined; this.place(c);
  }

  spawn(c, player, minD, maxD, initial = false) {
    if (Math.abs(player.x) > EDGE + 150 || Math.abs(player.z) > EDGE + 150) return this.spawnHwy(c, player, minD, maxD, initial);
    if (c.hwy) { c.hwy = false; const r = this.rnd(); c.type = r < 0.07 ? 4 : r < 0.1 ? 5 : r < 0.2 ? 3 : (this.rnd() * 3) | 0; c.len = this.models[c.type].len; c.mass = this.models[c.type].mass; c.rad = this.models[c.type].rad; c.h = undefined; }
    for (let tries = 0; tries < 40; tries++) {
      // Pick a junction near the player (the map is far bigger than the traffic's reach).
      const i = clamp(Math.round(player.x / SP) + Math.floor(this.rnd() * 9) - 4, -N, N), j = clamp(Math.round(player.z / SP) + Math.floor(this.rnd() * 9) - 4, -N, N);
      const nb = this.neighbours([i, j]); const to = nb[(this.rnd() * nb.length) | 0];
      const lane = (this.rnd() * 3) | 0;
      this.buildPath(c, [i, j], to, lane);
      c.s = this.rnd() * c.straightLen * 0.9;
      this.place(c);
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      if (d < minD || d > maxD) continue;
      // Don't drop a car on top of another one.
      if (this.cars.some(o => o !== c && o.pts && Math.hypot(o.x - c.x, o.z - c.z) < 12)) continue;
      // Respawns go out of sight, ahead of the player.
      if (!initial) { const f = [Math.sin(player.h), Math.cos(player.h)]; if ((c.x - player.x) * f[0] + (c.z - player.z) * f[1] < 60) continue; }
      break;
    }
    c.settled = null; c.mode = 'drive'; c.speed = c.blvd ? 15 : 10; c.vmax = (c.blvd ? 19 : 13.5) * (0.85 + this.rnd() * 0.3); c.wait = 0; c.knockT = 0;
  }

  place(c) {
    let k = 1; while (k < c.cum.length - 1 && c.cum[k] < c.s) k++;
    const a = c.pts[k - 1], b = c.pts[k], seg = c.cum[k] - c.cum[k - 1] || 1, t = clamp((c.s - c.cum[k - 1]) / seg, 0, 1);
    c.x = a.x + (b.x - a.x) * t; c.z = a.z + (b.z - a.z) * t;
    if (c.hwy) { c.y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t; c.pitch = Math.atan2((b.y ?? 0) - (a.y ?? 0), Math.max(0.5, seg)); c.roll = 0; } else { c.y = 0; c.pitch = 0; c.roll = 0; }
    const h = Math.atan2(b.x - a.x, b.z - a.z);
    c.h = c.h == null ? h : c.h + wrapAngle(h - c.h) * 0.5;
  }

  velocityOf(c) { return c.mode === 'knocked' ? [c.vx, c.vz] : [Math.sin(c.h) * c.speed, Math.cos(c.h) * c.speed]; }
  knock(c, vx, vz, spin) {
    if (c.mode !== 'knocked') { c.mode = 'knocked'; c.knockT = 0; c.spin = 0; }
    c.vx = vx; c.vz = vz; c.spin += spin;
  }

  // A car that has been knocked off its path sits on whatever ground it ended up on: its height follows the
  // terrain, and it tilts to the slope (so it doesn't sink into a hill or hover over a dip).
  settle(c) {
    const f = Math.sin(c.h), g = Math.cos(c.h), hl = (c.len || 4.7) * 0.4, hw2 = 0.8;
    const yc = groundAt(c.x, c.z).y;
    const yf = groundAt(c.x + f * hl, c.z + g * hl).y, yb = groundAt(c.x - f * hl, c.z - g * hl).y;
    const yl = groundAt(c.x + g * hw2, c.z - f * hw2).y, yr = groundAt(c.x - g * hw2, c.z + f * hw2).y;
    const ty = (yf + yb + yl + yr + yc * 2) / 6, tp = Math.atan2(yf - yb, hl * 2), tr = Math.atan2(yl - yr, hw2 * 2);
    if (c.y == null || c.settled == null) { c.y = ty; c.pitch = tp; c.roll = tr; c.settled = true; }
    const k = 0.35; c.y += (ty - c.y) * k; c.pitch = (c.pitch || 0) + (tp - (c.pitch || 0)) * k; c.roll = (c.roll || 0) + (tr - (c.roll || 0)) * k;
  }

  update(dt, player, signals) {
    const pf = [Math.sin(player.h), Math.cos(player.h)];
    for (const c of this.cars) {
      if (c.mode === 'knocked') {
        c.x += c.vx * dt; c.z += c.vz * dt; c.h += c.spin * dt;
        this.settle(c);
        const sp = Math.hypot(c.vx, c.vz), dec = Math.max(0, sp - 7 * dt) / (sp || 1);
        c.vx *= dec; c.vz *= dec; c.spin *= Math.exp(-2 * dt);
        if (sp < 0.3) c.knockT += dt;
        const far = Math.hypot(c.x - player.x, c.z - player.z);
        if (c.knockT > 6 && far > 60) this.spawn(c, player, 160, 420);
        continue;
      }
      const f = [Math.sin(c.h), Math.cos(c.h)], r = [-f[1], f[0]];
      let target = c.vmax;
      const toTurn = c.straightLen - c.s;
      if (c.turning) target = Math.min(target, toTurn > 0 ? 7 + toTurn * 0.45 : 7);
      // Follow whoever is ahead in the lane, the player included.
      const look = (ox, oz, gap) => {
        const dx = ox - c.x, dz = oz - c.z, df = dx * f[0] + dz * f[1], dl = dx * r[0] + dz * r[1];
        if (df > 0 && df < 40 && Math.abs(dl) < 2.3) target = Math.min(target, Math.max(0, (df - gap) * 0.8));
      };
      look(player.x, player.z, 7.5);
      // Wait at the junction for cars already crossing it.
      const approaching = toTurn > 0 && toTurn < 11;
      let blocked = false;
      for (const o of this.cars) {
        if (o === c) continue;
        const dx = o.x - c.x, dz = o.z - c.z; if (dx * dx + dz * dz > 1600) continue;
        look(o.x, o.z, 7);
        if (approaching && o.mode === 'drive' && o.s > o.straightLen && Math.abs(wrapAngle(o.h - c.h)) > 0.4 && dx * dx + dz * dz < 900) blocked = true;
      }
      // Stop for red lights (and amber, if there's room to).
      if (signals && toTurn > 0 && toTurn < 40) {
        const sg = signals[c.axis];
        if (sg === 'R' || (sg === 'A' && toTurn > 6)) target = Math.min(target, Math.max(0, toTurn - 1) * 0.55);
      }
      if (blocked && c.wait < 4) { target = Math.min(target, Math.max(0, toTurn - 2) * 0.6); c.wait += dt; }
      else if (!approaching) c.wait = 0;
      c.speed += clamp(target - c.speed, -8 * dt, 3 * dt);
      c.speed = Math.max(0, c.speed);
      c.s += c.speed * dt;
      if (c.s >= c.total) {
        if (c.hwy) { this.spawn(c, player, 150, 480); continue; }
        const over = c.s - c.total;
        this.buildPath(c, c.to, c.next, c.lane);
        c.s = over;
      }
      this.place(c);
      // Keep traffic near the player.
      const dx = c.x - player.x, dz = c.z - player.z, d2 = dx * dx + dz * dz;
      if (d2 > 520 * 520 || (d2 > 260 * 260 && dx * pf[0] + dz * pf[1] < -200)) this.spawn(c, player, 180, 460);
    }
  }

  render(player, frustum) {
    for (const m of this.meshes) { m.list.length = 0; }
    // Only cars near enough and on screen (the reflection probe sees the close ones anyway).
    const near = (c, r) => {
      const d2 = (c.x - player.x) ** 2 + (c.z - player.z) ** 2;
      if (d2 > r * r) return false;
      if (!frustum || d2 < 30 * 30) return true;
      this.sphere.center.set(c.x, (c.y ?? 0) + 1, c.z); return frustum.intersectsSphere(this.sphere);
    };
    for (const c of this.cars) if (near(c, 450)) this.meshes[c.type].list.push(c);
    // Parked cars never move; they live in the city regions and use the same meshes.
    for (const p of this.city.parkedList()) { if (!near(p, 200)) continue; if (!p.color) p.color = COLORS[p.ci % COLORS.length]; this.meshes[p.type].list.push(p); }
    const { m4, q, v, one, up } = this;
    let nb = 0;
    for (const m of this.meshes) {
      let i = 0;
      for (const c of m.list) {
        this.eul.set(-(c.pitch || 0), c.h, c.roll || 0, 'YXZ'); q.setFromEuler(this.eul); v.set(c.x, c.y ?? 0, c.z); m4.compose(v, q, one);
        m.body.setMatrixAt(i, m4); m.lights.setMatrixAt(i, m4); m.body.setColorAt(i, c.color);
        v.y += 0.03; m4.compose(v, q, one); if (nb < CAP * 2) this.blobs.setMatrixAt(nb++, m4);
        if (++i >= CAP) break;
      }
      m.body.count = m.lights.count = i;
      m.body.instanceMatrix.needsUpdate = true; m.lights.instanceMatrix.needsUpdate = true;
      if (m.body.instanceColor) m.body.instanceColor.needsUpdate = true;
    }
    this.blobs.count = nb; this.blobs.instanceMatrix.needsUpdate = true;
  }
}
