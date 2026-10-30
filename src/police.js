// The police chase: you are in the gadget grand tourer and the police want you. Cruisers (and, at higher heat, heavy pursuit
// trucks) chase you along the roads, search for you when they lose sight, ram you and call for more. You have machine guns,
// homing missiles, proximity bombs, an oil slick, a smoke screen, an armour shield and nitro. Get out of sight and stay hidden
// to lose them. Get wrecked, or boxed in and stopped, and you lose. (A port of the native version's escape mode.)
import * as THREE from 'three';
import { SP, N, hw, EDGE, SIDEWALK, isPark } from './city.js';
import { groundAt, heightAt, ROADS, coastX } from './world.js';
import { policeModels } from './carModel.js';
import { applyImpulse } from './collide.js';
import { Particles } from './particles.js';
import { clamp, wrapAngle } from './util.js';

const SET = SIDEWALK + 1.2;           // buildings start a little inside the pavement
const CAP = 12;
const inCity = (x, z, m = 60) => Math.abs(x) < EDGE + m && Math.abs(z) < EDGE + m;

// --- The solid parts of the city, from the road grid alone (so cops can see and steer without the streamed colliders) ---------
function blockRectAt(x, z, r) {
  if (Math.abs(x) > EDGE || Math.abs(z) > EDGE) return null;
  const bi = clamp(Math.floor(x / SP), -N, N - 1), bj = clamp(Math.floor(z / SP), -N, N - 1);
  if (isPark(bi, bj)) return null;
  const x0 = bi * SP + hw(bi) + SET, x1 = (bi + 1) * SP - hw(bi + 1) - SET, z0 = bj * SP + hw(bj) + SET, z1 = (bj + 1) * SP - hw(bj + 1) - SET;
  return x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r ? [x0, x1, z0, z1] : null;
}
const _push = { nx: 0, nz: 0, pen: 0 };
function pushOutStatic(x, z, r) {
  const b = blockRectAt(x, z, r); if (!b) return null;
  const cand = [[x - (b[0] - r), -1, 0], [(b[1] + r) - x, 1, 0], [z - (b[2] - r), 0, -1], [(b[3] + r) - z, 0, 1]];
  let best = cand[0]; for (const c of cand) if (c[0] < best[0]) best = c;
  _push.pen = best[0]; _push.nx = best[1]; _push.nz = best[2]; return _push;
}
// Distance along a ray (a direction, not necessarily a unit one) to the first building, or maxD.
function raycastStatic(ax, az, dx, dz, maxD) {
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  if (blockRectAt(ax, az, 0)) return 0;
  for (let t = 3; t < maxD; t += 3) if (blockRectAt(ax + dx * t, az + dz * t, 0)) return t - 1.5;
  return maxD;
}

const MISSILE_RELOAD = 7, BOMB_RELOAD = 11;
export const COOLDOWN = { oil: 7, smoke: 14, shield: 15 };

export class PoliceChase {
  constructor(scene) {
    this.scene = scene; this.fx = new Particles(scene); this.rng = 99;
    this.models = policeModels();
    this.active = false; this.result = 'running';
    this.cops = []; this.missiles = []; this.bombs = []; this.oils = []; this.smokes = []; this.messages = [];
    this.reset();
    // Meshes: instanced cruisers and trucks (with their light bars), pools of missiles, bombs and oil slicks.
    const mk = md => {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.32, envMapIntensity: 1.1 });
      const body = new THREE.InstancedMesh(md.geo, mat, CAP), lights = new THREE.InstancedMesh(md.lights, new THREE.MeshBasicMaterial({ vertexColors: true }), CAP);
      for (const m of [body, lights]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
      body.receiveShadow = true;
      return { body, lights, md };
    };
    this.kinds = [mk(this.models.cruiser), mk(this.models.truck)];
    const barGeo = new THREE.BoxGeometry(0.46, 0.11, 0.2), barMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.bars = [0, 1].map(() => [0, 1].map(() => { const m = new THREE.InstancedMesh(barGeo, barMat, CAP); m.count = 0; m.frustumCulled = false; scene.add(m); return m; }));
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 5.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), CAP);
    this.blobs.count = 0; this.blobs.frustumCulled = false; this.blobs.renderOrder = 1; scene.add(this.blobs);
    // Weapons.
    const steel = new THREE.MeshStandardMaterial({ color: 0xc4c7cd, roughness: 0.3, metalness: 0.85 }), red = new THREE.MeshStandardMaterial({ color: 0xcc2210, roughness: 0.5, metalness: 0.3 });
    const missileGeo = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 10).rotateX(Math.PI / 2), steel));
      g.add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 10).rotateX(Math.PI / 2).translate(0, 0, 0.96), red));
      for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.36), red); f.position.set(0, 0, -0.62); const o = new THREE.Group(); o.rotation.z = k * Math.PI / 2; o.add(f); f.position.y = 0.15; g.add(o); }
      return g;
    };
    this.missileMeshes = []; for (let i = 0; i < 8; i++) { const m = missileGeo(); m.visible = false; scene.add(m); this.missileMeshes.push(m); }
    const bombMat = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.4, metalness: 0.7 });
    this.bombMeshes = []; for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 8).scale(1, 0.55, 1), bombMat); m.visible = false; scene.add(m); this.bombMeshes.push(m); }
    const oilMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.05, metalness: 0.15, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.oilMeshes = []; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2), oilMat); m.visible = false; m.renderOrder = 1; scene.add(m); this.oilMeshes.push(m); }
    // The armour bubble around the player's car.
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.65, 1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.bubble.scale.set(1.25, 0.82, 2.75); this.bubble.visible = false; this.bubble.renderOrder = 5; scene.add(this.bubble);
    this.tmp = { m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1), col: new THREE.Color() };
  }
  rnd() { this.rng = (this.rng * 1664525 + 1013904223) >>> 0; return this.rng / 4294967296; }
  get stars() { return Math.max(1, Math.min(5, Math.floor(this.heat))); }
  desiredCops() { return [0, 3, 4, 6, 8, 10][this.stars]; }

  reset() {
    Object.assign(this, {
      result: 'running', health: 100, heat: 2.0, time: 0, hidden: 0, hiddenNeeded: 13, nearest: 1e9, shake: 0, damageFlash: 0, bustT: 0,
      ammoMissile: 6, ammoBomb: 4, kills: 0, civilians: 0, maxStars: 2, spotted: true,
      gunHeat: 0, cdOil: 0, cdSmoke: 0, cdShield: 0, shieldT: 0, gunOut: 0, jammed: false,
      lastSeenX: 0, lastSeenZ: 0, spawnT: 0, fireT: 1 / 16, regenMissile: 0, regenBomb: 0, endT: 0, spotCool: 0, wasSpotted: true, lastStars: 2, alt: 0, pulse: 0, shieldK: 0,
    });
    this.cops.length = this.missiles.length = this.bombs.length = this.oils.length = this.smokes.length = this.messages.length = 0;
  }
  start(p, traffic) {
    this.reset(); this.active = true; this.lastSeenX = p.x; this.lastSeenZ = p.z; this.fx.clear();
    for (let i = 0; i < 3; i++) this.spawnCop(p, 0, 'near');
    this.messages.push('THE POLICE ARE ON YOU');
  }
  stop() {
    this.active = false; this.reset(); this.fx.clear(); this.render(0, null, 0);
    this.bubble.visible = false;
  }
  setVisible(v) { for (const k of this.kinds) { k.body.visible = k.lights.visible = v; } }

  // --- Seeing ----------------------------------------------------------------------------------------------------------
  smokeBlocks(ax, az, bx, bz) {
    for (const s of this.smokes) {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 > 1e-6 ? clamp(((s.x - ax) * dx + (s.z - az) * dz) / l2, 0, 1) : 0, cx = ax + dx * t, cz = az + dz * t;
      const r = s.r * clamp(s.age < 1.5 ? s.age / 1.5 : (s.life - s.age) / 3.0, 0, 1);
      if ((s.x - cx) ** 2 + (s.z - cz) ** 2 < r * r) return true;
    }
    return false;
  }
  canSee(ax, az, bx, bz, maxDist) {
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz); if (d > maxDist) return false; if (d < 6) return true;
    if (raycastStatic(ax, az, dx, dz, d) < d - 3) return false;
    if (d > 60) {
      const ya = groundAt(ax, az).y + 1.4, yb = groundAt(bx, bz).y + 1.4;
      for (let t = 20; t < d - 10; t += 20) { const px = ax + dx * t / d, pz = az + dz * t / d; if (heightAt(px, pz) > ya + (yb - ya) * t / d + 0.5) return false; }
    }
    return !this.smokeBlocks(ax, az, bx, bz);
  }

  // --- Spawning --------------------------------------------------------------------------------------------------------
  // mode: true = a long way off (a hot pursuit calling for backup), false = nearer, 'near' = right behind you at the start.
  spawnCop(p, kind, farAway) {
    const md = kind ? this.models.truck : this.models.cruiser, rnd = () => this.rnd();
    const c = { kind, x: 0, z: 0, y: 0, h: 0, speed: 12, vx: 0, vz: 0, vy: 0, pitch: 0, roll: 0, spin: 0, rollRate: 0, hp: kind ? 260 : 100, maxHp: kind ? 260 : 100, mass: kind ? 2700 : 1750, len: md.len, rad: md.rad,
      vmax: (kind ? 47 : 50 + this.stars * 2.2) * (0.94 + rnd() * 0.12), burn: 0, slip: 0, stuck: 0, flash: rnd(), roam: 0, rx: 0, rz: 0, wreck: false, air: false, sees: false, seeT: rnd() * 0.2, dirT: 0, direct: false };
    const fx = Math.sin(p.h), fz = Math.cos(p.h); let best = -1e9, bx = p.x, bz = p.z;
    for (let tries = 0; tries < 24; tries++) {
      let x, z; const near = farAway === 'near', minD = near ? 75 : farAway ? 260 : 150, maxD = near ? 140 : farAway ? 380 : 260;
      if (inCity(p.x, p.z, 120)) {
        const pi = Math.round(p.x / SP), pj = Math.round(p.z / SP), ni = clamp(pi + Math.floor(rnd() * 11) - 5, -N, N), nj = clamp(pj + Math.floor(rnd() * 11) - 5, -N, N);
        x = ni * SP + (rnd() < 0.5 ? 0 : (rnd() - 0.5) * 2 * (hw(ni) - 4)); z = nj * SP;
        if (rnd() < 0.5) { x = ni * SP; z = nj * SP + (rnd() - 0.5) * SP * 0.7; }                 // on a road: a junction, or along a street
        if (Math.abs(x - ni * SP) > 1 && Math.abs(z - nj * SP) > 1) x = ni * SP;
      } else {
        const a = rnd() * 6.2832; x = p.x + Math.sin(a) * (minD + rnd() * 100); z = p.z + Math.cos(a) * (minD + rnd() * 100);
        let bd = 1e18, bi = -1, R = null;
        for (const r of ROADS) if (r.kind === 'motorway') for (let i = 0; i < r.x.length; i += 4) { const d = (r.x[i] - x) ** 2 + (r.z[i] - z) ** 2; if (d < bd) { bd = d; R = r; bi = i; } }
        if (R && bd < 150 * 150) { x = R.x[bi]; z = R.z[bi]; }
        if (x < coastX(z) + 90) continue;
      }
      const d = Math.hypot(x - p.x, z - p.z); if (d < minD || d > maxD + 60) continue;
      // Out of sight, and behind or beside the player.
      const score = -Math.abs(d - (minD + 40)) - ((x - p.x) * fx + (z - p.z) * fz > 30 ? 120 : 0) + (this.canSee(x, z, p.x, p.z, 400) ? (near ? 60 : -150) : (near ? -60 : 0));
      if (score > best) { best = score; bx = x; bz = z; }
    }
    if (best < -1e8) {                                                                               // nothing usable found: a spot on the road grid well away from the player
      const a = rnd() * 6.2832, d = (farAway ? 300 : 200); bx = p.x + Math.sin(a) * d; bz = p.z + Math.cos(a) * d;
      if (inCity(bx, bz, 0)) { const ni = clamp(Math.round(bx / SP), -N, N), nj = clamp(Math.round(bz / SP), -N, N); if (Math.abs(bx - ni * SP) < Math.abs(bz - nj * SP)) bx = ni * SP; else bz = nj * SP; }
    }
    c.x = bx; c.z = bz; c.y = groundAt(bx, bz).y; c.h = Math.atan2(p.x - bx, p.z - bz); this.cops.push(c); return c;
  }

  // --- Navigation: along the roads, one junction at a time ---------------------------------------------------------------
  navTarget(c, gx, gz, out) {
    if (!inCity(c.x, c.z, 20) || !inCity(gx, gz, 400)) { out[0] = gx; out[1] = gz; return; }
    const ci = clamp(Math.round(c.x / SP), -N, N), cj = clamp(Math.round(c.z / SP), -N, N), gi = clamp(Math.round(gx / SP), -N, N), gj = clamp(Math.round(gz / SP), -N, N);
    const offX = Math.abs(c.x - ci * SP), offZ = Math.abs(c.z - cj * SP), inJ = offX < hw(ci) + 4 && offZ < hw(cj) + 4;
    const fx = Math.sin(c.h), fz = Math.cos(c.h); let ni = ci, nj = cj;
    if (inJ) {                                                                                    // at a junction: turn towards the goal (the longer way first)
      const di = gi - ci, dj = gj - cj; if (di === 0 && dj === 0) { out[0] = gx; out[1] = gz; return; }
      const alongX = Math.abs(di) > Math.abs(dj) || (Math.abs(di) === Math.abs(dj) && Math.abs(fx) > Math.abs(fz));
      if (alongX && di !== 0) ni = ci + (di > 0 ? 1 : -1); else if (dj !== 0) nj = cj + (dj > 0 ? 1 : -1); else ni = ci + (di > 0 ? 1 : -1);
    } else if (offX <= offZ) {                                                                    // on a street along z: head for the next junction in the direction of travel
      nj = fz >= 0 ? Math.ceil(c.z / SP) : Math.floor(c.z / SP); if (nj === cj && Math.abs(c.z - cj * SP) < SP * 0.5) nj = cj + (fz >= 0 ? 1 : -1); ni = ci;
      if (gi === ci && (gz - c.z) * fz < 0 && Math.abs(gz - c.z) > 30) nj = fz >= 0 ? Math.floor(c.z / SP) : Math.ceil(c.z / SP);   // the goal is behind: turn round at the next junction anyway
    } else {
      ni = fx >= 0 ? Math.ceil(c.x / SP) : Math.floor(c.x / SP); if (ni === ci && Math.abs(c.x - ci * SP) < SP * 0.5) ni = ci + (fx >= 0 ? 1 : -1); nj = cj;
    }
    out[0] = clamp(ni, -N, N) * SP; out[1] = clamp(nj, -N, N) * SP;
  }

  // --- A cop driving ---------------------------------------------------------------------------------------------------
  damageCop(c, amount) {
    if (c.wreck) return; c.hp -= amount;
    if (c.hp <= 0) {
      c.wreck = true; c.burn = 0; c.speed *= 0.4; this.kills++; this.heat = Math.min(5.99, this.heat + 0.35);
      this.messages.push(c.kind ? 'PURSUIT TRUCK DOWN' : 'CRUISER DOWN'); this.fx.explosion(c.x, c.y, c.z, 0.7); this.onBoom && this.onBoom(c.x, c.z, 0.7);
      c.vy = 5; c.air = true; c.rollRate = (this.rnd() - 0.5) * 8;
    }
  }
  groundTilt(c, dt) {
    const f = Math.sin(c.h), g = Math.cos(c.h), hl = c.len * 0.4;
    const yf = groundAt(c.x + f * hl, c.z + g * hl).y, yb = groundAt(c.x - f * hl, c.z - g * hl).y, tp = Math.atan2(yf - yb, hl * 2);
    c.pitch += (tp - c.pitch) * Math.min(1, dt * 12);
  }
  updateCop(c, dt, p, traffic, gx, gz, chase) {
    const gy = groundAt(c.x, c.z).y, rnd = () => this.rnd();
    if (c.wreck) {                                                                                  // a burning heap that slides to a stop
      c.burn += dt; c.x += c.vx * dt; c.z += c.vz * dt; c.h += c.spin * dt; const k = Math.exp(-1.8 * dt); c.vx *= k; c.vz *= k; c.spin *= k; c.speed = 0;
      if (c.air) { c.vy -= 18 * dt; c.y += c.vy * dt; c.roll += c.rollRate * dt; if (c.y <= gy) { c.y = gy; c.air = false; c.roll = clamp(c.roll, -0.35, 0.35); c.vx *= 0.5; c.vz *= 0.5; } } else { c.y = gy; this.groundTilt(c, dt); }
      if (c.burn < 22) this.fx.burn(c.x, c.y, c.z, dt);
      return;
    }
    if (c.air) {                                                                                    // thrown by an explosion
      c.vy -= 18 * dt; c.y += c.vy * dt; c.x += c.vx * dt; c.z += c.vz * dt; c.h += c.spin * dt; c.roll += c.rollRate * dt;
      if (c.y <= gy) { c.y = gy; c.air = false; if (c.vy < -6) this.damageCop(c, -c.vy * 3.5); c.vy = 0; c.roll *= 0.2; c.speed *= 0.4; }
      return;
    }
    c.y = gy; c.roll *= Math.exp(-4 * dt); this.groundTilt(c, dt);
    // Where to drive: the goal, along the roads when something is in the way.
    const dx = gx - c.x, dz = gz - c.z, dist = Math.hypot(dx, dz), tgt = this._nav || (this._nav = [0, 0]); tgt[0] = gx; tgt[1] = gz;
    c.dirT -= dt; if (c.dirT <= 0) { c.dirT = 0.12 + rnd() * 0.06; c.direct = dist < 22 || (this.canSee(c.x, c.z, gx, gz, 150) && raycastStatic(c.x, c.z, dx, dz, dist) >= dist - 2); }
    if (!c.direct) this.navTarget(c, gx, gz, tgt);
    let desired = Math.atan2(tgt[0] - c.x, tgt[1] - c.z), speedT = c.vmax;
    // Whiskers: look ahead for buildings and steer into the gap.
    const look = 10 + c.speed * 0.55, fx = Math.sin(c.h), fz = Math.cos(c.h);
    const dC = raycastStatic(c.x, c.z, fx, fz, look), dL = raycastStatic(c.x, c.z, Math.sin(c.h - 0.5), Math.cos(c.h - 0.5), look * 0.8), dR = raycastStatic(c.x, c.z, Math.sin(c.h + 0.5), Math.cos(c.h + 0.5), look * 0.8);
    if (dC < look) { const side = dR > dL ? 1 : -1; desired = c.h + side * (0.5 + 0.9 * (1 - dC / look)); speedT = Math.min(speedT, 6 + dC * 1.6); }
    else if (dL < look * 0.5) desired = c.h + 0.35; else if (dR < look * 0.5) desired = c.h - 0.35;
    // Traffic and other cops: slow for what is directly ahead, and ease away from it.
    for (const t of traffic.cars) {
      if (!t.active || !t.pts) continue; const ox = t.x - c.x, oz = t.z - c.z; if (ox * ox + oz * oz > 900) continue;
      const df = ox * fx + oz * fz, dl = ox * fz - oz * fx; if (df > 0 && df < 24 && Math.abs(dl) < 2.6) { speedT = Math.min(speedT, Math.max(5, df * 1.4)); desired -= (dl >= 0 ? -1 : 1) * 0.35; }
    }
    for (const o of this.cops) {
      if (o === c) continue; const ox = o.x - c.x, oz = o.z - c.z; if (ox * ox + oz * oz > 196) continue;
      const dl = ox * fz - oz * fx, df = ox * fx + oz * fz; if (df > -3 && Math.abs(dl) < 3.2) desired += (dl >= 0 ? -1 : 1) * 0.25;
    }
    let err = wrapAngle(desired - c.h); speedT *= clamp(1.15 - Math.abs(err) / 1.5, 0.3, 1);
    if (chase && dist < 30 && p.speed > 3) speedT = Math.max(speedT, p.speed * 1.08);               // close in on the player and ram
    if (!chase && dist < 40) speedT = Math.min(speedT, 14);                                           // reached the last known position: ease off and look around
    if (c.slip > 0) { c.slip -= dt; speedT = Math.min(speedT, 4); err += Math.sin(this.time * 14 + c.flash * 9) * 1.4; c.spin = 3.6 * (c.flash > 0.5 ? 1 : -1); } else c.spin = 0;
    const maxYaw = 2.3 / (1 + c.speed / 16), turn = clamp(err * 4.0, -maxYaw, maxYaw); c.h += turn * dt + c.spin * dt; c.roll += turn * c.speed * 0.0016 * dt * 20;
    c.speed += clamp(speedT - c.speed, -26 * dt, (c.kind ? 9 : 12) * dt); if (c.speed < 0) c.speed = 0;
    const ox0 = c.x, oz0 = c.z;                                                                        // (where it was at the start of this step, to tell when it is stuck)
    const sx = Math.sin(c.h) * c.speed + c.vx, sz = Math.cos(c.h) * c.speed + c.vz; c.x += sx * dt; c.z += sz * dt; const k = Math.exp(-3 * dt); c.vx *= k; c.vz *= k;
    // The buildings: push out and scrub speed.
    for (const off of [1.4, 0, -1.4]) {
      const px = c.x + Math.sin(c.h) * off, pz = c.z + Math.cos(c.h) * off, hit = pushOutStatic(px, pz, 1.0);
      if (hit) {
        c.x += hit.nx * hit.pen; c.z += hit.nz * hit.pen; const into = Math.abs(hit.nx * Math.sin(c.h) + hit.nz * Math.cos(c.h));
        if (c.speed > 10) this.damageCop(c, (c.speed - 10) * into * 0.35 * dt * 6); c.speed *= 1 - 0.9 * into * Math.min(1, dt * 6);
      }
    }
    if (c.x < coastX(c.z) + 70) { c.x = coastX(c.z) + 70; c.speed *= 0.7; }
    c.stuck = (Math.hypot(c.x - ox0, c.z - oz0) < 0.25 * dt * 10 && dist > 40) ? c.stuck + dt : Math.max(0, c.stuck - dt);
    // Cars in the way get shoved aside (and the cop is slowed).
    for (const t of traffic.cars) {
      if (!t.active || !t.pts || t.mode === 'wreck') continue; if ((t.x - c.x) ** 2 + (t.z - c.z) ** 2 > 36) continue;
      const tf = [Math.sin(t.h), Math.cos(t.h)], tr = t.rad || 0.95, tm = t.mass || 1400;
      for (const co of [-1.2, 1.2]) for (const to of [-t.len * 0.28, t.len * 0.28]) {
        const cx = c.x + Math.sin(c.h) * co, cz = c.z + Math.cos(c.h) * co, qx = t.x + tf[0] * to, qz = t.z + tf[1] * to, ddx = cx - qx, ddz = cz - qz, d = Math.hypot(ddx, ddz), r = c.rad + tr; if (d >= r || d < 1e-5) continue;
        const nx = ddx / d, nz = ddz / d, pen = r - d, share = tm / (tm + c.mass); c.x += nx * pen * share; c.z += nz * pen * share; t.x -= nx * pen * (1 - share); t.z -= nz * pen * (1 - share);
        const tv = traffic.velocityOf(t), rel = Math.max(0, c.speed - (tv[0] * Math.sin(c.h) + tv[1] * Math.cos(c.h))); c.speed *= 0.85;
        traffic.knock(t, tv[0] - nx * rel * c.mass / (c.mass + tm) * 0.9, tv[1] - nz * rel * c.mass / (c.mass + tm) * 0.9, (rnd() - 0.5) * rel * 0.15);
        if (traffic.damage(t, rel * 0.6)) { this.civilians++; this.heat = Math.min(5.99, this.heat + 0.12); this.fx.explosion(t.x, (t.y || 0) + 0.5, t.z, 0.7); }
        this.damageCop(c, rel * 0.25 * tm / 2500);
      }
    }
    // Oil.
    for (const o of this.oils) { const ox = c.x - o.x, oz = c.z - o.z; if (ox * ox + oz * oz < o.r * o.r && c.speed > 7 && c.slip <= 0) { c.slip = 1.7; this.fx.puff(c.x, c.y + 0.3, c.z, 0, 0.5, 0, 1.2, 1.2, 0.4, 0.35); } }
  }

  // --- The cops against the player --------------------------------------------------------------------------------------
  collidePlayer(car) {
    if (!this.active || this.result !== 'running') return;
    const f = car.fwd, RAD = 1.0;
    for (const c of this.cops) {
      const dx0 = c.x - car.x, dz0 = c.z - car.z; if (dx0 * dx0 + dz0 * dz0 > 100) continue; const cf = [Math.sin(c.h), Math.cos(c.h)];
      for (const off of [-1.45, 0, 1.45]) for (const co of [-c.len * 0.3, 0, c.len * 0.3]) {
        const px = car.x + f[0] * off, pz = car.z + f[1] * off, ox = c.x + cf[0] * co, oz = c.z + cf[1] * co, dx = px - ox, dz = pz - oz, dist = Math.hypot(dx, dz), r = RAD + c.rad; if (dist >= r || dist < 1e-5) continue;
        const nx = dx / dist, nz = dz / dist, pen = r - dist, mt = c.wreck ? c.mass * 1.8 : c.mass, share = mt / (mt + car.s.mass);
        car.x += nx * pen * share; car.z += nz * pen * share; c.x -= nx * pen * (1 - share); c.z -= nz * pen * (1 - share);
        const cv = [cf[0] * c.speed + c.vx, cf[1] * c.speed + c.vz], j = applyImpulse(car, ox + nx * c.rad, oz + nz * c.rad, nx, nz, 0.25, 0.2, null, 1 / mt, cv);
        if (j > 0) {
          const dv = j / car.s.mass; c.vx -= nx * j / mt; c.vz -= nz * j / mt; c.speed *= 0.75; c.spin += (this.rnd() - 0.5) * j / mt * 0.6; if (dv > 2) c.roll += (this.rnd() - 0.5) * 0.3;
          const dmg = Math.max(0, dv - 3) * 0.9 * (this.shieldT > 0 ? 0.2 : 1); this.health -= dmg; this.damageFlash = Math.min(1, this.damageFlash + dmg * 0.04); this.shake = Math.min(1, this.shake + dv * 0.025);
          c.hp -= Math.max(0, j / mt - 1.5) * 5 + Math.max(0, j / car.s.mass - 1.5);
          if (c.hp <= 0 && !c.wreck) this.damageCop(c, 1);
          if (this.onCrash) this.onCrash(j);
        }
      }
    }
  }
  // Damage from walls and other cars (the physics' hit callback).
  playerHit(impulse, mass) {
    if (!this.active || this.result !== 'running') return;
    const dv = impulse / mass; if (dv < 6) return;
    const dmg = (dv - 6) * 0.55 * (this.shieldT > 0 ? 0.35 : 1); this.health -= dmg; this.damageFlash = Math.min(1, this.damageFlash + dmg * 0.03); this.shake = Math.min(1, this.shake + dv * 0.02);
  }

  // --- Explosions and the guns --------------------------------------------------------------------------------------------
  explode(x, z, y, power, radius, dmg, p, traffic) {
    this.fx.explosion(x, y, z, power); this.onBoom && this.onBoom(x, z, power);
    for (const c of this.cops) {
      const dx = c.x - x, dz = c.z - z, d = Math.hypot(dx, dz); if (d > radius) continue; const fall = 1 - d / radius, nx = d > 0.1 ? dx / d : 0, nz = d > 0.1 ? dz / d : 1;
      this.damageCop(c, dmg * fall); c.vx += nx * 30 * fall * power; c.vz += nz * 30 * fall * power; c.vy = (c.air ? c.vy : 0) + 5 + 9 * fall * power; c.air = true; c.spin = (this.rnd() - 0.5) * 6; c.rollRate = (this.rnd() - 0.5) * 9 * fall; c.speed *= 0.5;
    }
    for (const t of traffic.cars) {
      if (!t.active || !t.pts) continue; const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz); if (d > radius) continue; const fall = 1 - d / radius, nx = d > 0.1 ? dx / d : 0, nz = d > 0.1 ? dz / d : 1;
      traffic.knock(t, nx * 26 * fall * power, nz * 26 * fall * power, (this.rnd() - 0.5) * 6 * fall);
      if (traffic.damage(t, dmg * fall * 0.9)) { this.civilians++; this.heat = Math.min(5.99, this.heat + 0.12); }
    }
    const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
    if (d < radius * 0.8) { const fall = 1 - d / (radius * 0.8); this.health -= dmg * fall * 0.15 * (this.shieldT > 0 ? 0.3 : 1); this.damageFlash = Math.min(1, this.damageFlash + fall * 0.4); }
    this.shake = Math.min(1, Math.max(this.shake, power * 0.9 / (1 + d * 0.04)));
  }
  muzzle(p, side) {
    const f = Math.sin(p.h), g = Math.cos(p.h), lx = Math.cos(p.h), lz = -Math.sin(p.h);
    return [p.x + f * 2.46 + lx * side * 0.42, p.bodyY + 0.5, p.z + g * 2.46 + lz * side * 0.42];
  }
  fireGuns(dt, p, traffic) {
    this.fireT += dt; const RATE = 1 / 16, rnd = () => this.rnd();
    while (this.fireT >= RATE) {
      this.fireT -= RATE; this.alt ^= 1; const side = this.alt ? 1 : -1, m = this.muzzle(p, side), spread = 0.012, a = p.h + (rnd() - 0.5) * 2 * spread, dx = Math.sin(a), dz = Math.cos(a), maxD = 150;
      let bestT = Math.min(maxD, raycastStatic(m[0], m[2], dx, dz, maxD)), hitCop = -1, hitCar = null;
      const circleHit = (cx, cz, r) => { const ox = cx - m[0], oz = cz - m[2], t = ox * dx + oz * dz; if (t < 0 || t > bestT) return -1; const d2 = ox * ox + oz * oz - t * t; if (d2 > r * r) return -1; return t - Math.sqrt(Math.max(0, r * r - d2)); };
      for (let i = 0; i < this.cops.length; i++) { const c = this.cops[i]; if (c.wreck) continue; const cf = [Math.sin(c.h), Math.cos(c.h)]; for (const co of [-c.len * 0.3, 0, c.len * 0.3]) { const t = circleHit(c.x + cf[0] * co, c.z + cf[1] * co, c.rad + 0.15); if (t >= 0 && t < bestT) { bestT = t; hitCop = i; hitCar = null; } } }
      for (const t of traffic.cars) { if (!t.active || !t.pts || t.mode === 'wreck') continue; const tf = [Math.sin(t.h), Math.cos(t.h)]; for (const to of [-t.len * 0.28, t.len * 0.28]) { const tt = circleHit(t.x + tf[0] * to, t.z + tf[1] * to, (t.rad || 0.95) + 0.15); if (tt >= 0 && tt < bestT) { bestT = tt; hitCop = -1; hitCar = t; } } }
      const ex = m[0] + dx * bestT, ez = m[2] + dz * bestT, ey = m[1] - 0.15;
      this.fx.tracer(m[0], m[1], m[2], ex, ey, ez, 0.045, 0.07); this.fx.muzzle(m[0], m[1], m[2], dx, dz); this.onGun && this.onGun();
      const sparks = n => { for (let s = 0; s < n; s++) this.fx.spark(ex, ey, ez, (rnd() - 0.5) * 8, rnd() * 6, (rnd() - 0.5) * 8, 0.35); };
      if (hitCop >= 0) { this.damageCop(this.cops[hitCop], 7.5); sparks(3); }
      else if (hitCar) { if (traffic.damage(hitCar, 7.5)) { this.civilians++; this.heat = Math.min(5.99, this.heat + 0.12); this.fx.explosion(hitCar.x, 0.5, hitCar.z, 0.7); this.onBoom && this.onBoom(hitCar.x, hitCar.z, 0.7); } sparks(3); }
      else if (bestT < maxD) { sparks(2); this.fx.puff(ex, ey, ez, 0, 0.5, 0, 0.4, 0.7, 0.5, 0.3, 1.0); }
    }
  }

  // --- The mission -------------------------------------------------------------------------------------------------------
  update(dt, p, traffic, inp) {
    const rnd = () => this.rnd();
    if (!this.active) return;
    this.pulse += dt;
    if (this.result !== 'running') {
      this.endT += dt; this.shake *= Math.exp(-3 * dt); this.damageFlash *= Math.exp(-2 * dt);
      for (const c of this.cops) { this.updateCop(c, dt, p, traffic, p.x, p.z, false); c.speed *= Math.exp(-2 * dt); }
      return;
    }
    this.time += dt; this.shake *= Math.exp(-4 * dt); this.damageFlash *= Math.exp(-2.5 * dt); const pspeed = p.speed;
    // Who can see you?
    let any = false; this.nearest = 1e9;
    for (const c of this.cops) {
      c.seeT -= dt; if (c.seeT <= 0) { c.seeT = 0.1 + rnd() * 0.05; c.sees = !c.wreck && this.canSee(c.x, c.z, p.x, p.z, 230); }
      if (c.wreck) c.sees = false;
      if (c.sees) any = true; if (!c.wreck) this.nearest = Math.min(this.nearest, Math.hypot(c.x - p.x, c.z - p.z));
    }
    this.spotted = any; if (any) { this.lastSeenX = p.x; this.lastSeenZ = p.z; }
    this.spotCool -= dt;
    if (this.spotted !== this.wasSpotted) { if (this.spotCool <= 0 && this.time > 4) { this.messages.push(this.spotted ? 'SPOTTED' : 'OUT OF SIGHT - STAY HIDDEN'); this.spotCool = 3; } this.wasSpotted = this.spotted; }
    if (this.spotted) this.heat = Math.min(5.99, this.heat + dt / 42);
    if (this.stars !== this.lastStars) { if (this.stars > this.lastStars) this.messages.push('HEAT ' + this.stars); this.lastStars = this.stars; this.maxStars = Math.max(this.maxStars, this.stars); }
    this.hiddenNeeded = 9 + 2 * this.stars;
    if (!this.spotted && this.nearest > 60) this.hidden += dt; else this.hidden = Math.max(0, this.hidden - dt * (this.spotted ? 3 : 1));
    if (this.hidden >= this.hiddenNeeded) { this.result = 'escaped'; this.messages.push('YOU LOST THEM'); return; }
    // Cops: spawn up to the wanted level, drive, retire the wrecks.
    this.spawnT -= dt; let alive = 0, trucks = 0; for (const c of this.cops) if (!c.wreck) { alive++; if (c.kind) trucks++; }
    if (this.spawnT <= 0 && alive < this.desiredCops() && this.cops.length < CAP) { this.spawnCop(p, (this.stars >= 4 && trucks < this.stars - 2) ? 1 : 0, this.spotted); this.spawnT = this.spotted ? 2.2 : 5.0; }
    for (let i = 0; i < this.cops.length;) {
      const c = this.cops[i]; let gx = this.spotted ? p.x + Math.sin(p.h) * pspeed * 0.6 : this.lastSeenX, gz = this.spotted ? p.z + Math.cos(p.h) * pspeed * 0.6 : this.lastSeenZ;
      if (!this.spotted) {
        c.roam -= dt;
        if (Math.hypot(c.x - this.lastSeenX, c.z - this.lastSeenZ) < 35 && c.roam <= 0) { c.roam = 6 + rnd() * 5; const a = rnd() * 6.2832, r = 80 + rnd() * 140; c.rx = this.lastSeenX + Math.sin(a) * r; c.rz = this.lastSeenZ + Math.cos(a) * r; }
        if (c.roam > 0 && c.rx !== 0) { gx = c.rx; gz = c.rz; }
      }
      this.updateCop(c, dt, p, traffic, gx, gz, this.spotted);
      const farAway = Math.hypot(c.x - p.x, c.z - p.z) > 480, dead = c.wreck && c.burn > 24;
      if (dead || (!c.wreck && (farAway || c.stuck > 3))) {
        if (c.wreck) { this.cops[i] = this.cops[this.cops.length - 1]; this.cops.pop(); continue; }
        const kind = c.kind, hp = c.hp, n = this.spawnCop(p, kind, this.spotted); n.hp = hp; this.cops.pop(); this.cops[i] = n;
      }
      i++;
    }
    for (let a = 0; a < this.cops.length; a++) for (let b = a + 1; b < this.cops.length; b++) {          // cops don't drive through each other
      const A = this.cops[a], B = this.cops[b], dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz), r = 2.1; if (d >= r || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d, pen = (r - d) * 0.5; A.x -= nx * pen; A.z -= nz * pen; B.x += nx * pen; B.z += nz * pen; if (!A.wreck && !B.wreck) { A.speed *= 0.97; B.speed *= 0.97; }
    }
    // Gadgets.
    this.gunHeat = Math.max(0, this.gunHeat - dt * (this.jammed ? 0.35 : 0.22)); if (this.jammed && this.gunHeat < 0.35) this.jammed = false;
    const firing = inp.fire && !this.jammed; this.gunOut += ((firing ? 1 : 0) - this.gunOut) * Math.min(1, dt * (firing ? 14 : 3));
    if (firing) { this.fireGuns(dt, p, traffic); this.gunHeat += dt * 0.26; if (this.gunHeat >= 1) { this.jammed = true; this.messages.push('GUNS OVERHEATED'); } } else this.fireT = 1 / 16;
    this.regenMissile += dt; if (this.ammoMissile < 6 && this.regenMissile > MISSILE_RELOAD) { this.ammoMissile++; this.regenMissile = 0; }
    this.regenBomb += dt; if (this.ammoBomb < 4 && this.regenBomb > BOMB_RELOAD) { this.ammoBomb++; this.regenBomb = 0; }
    this.cdOil = Math.max(0, this.cdOil - dt); this.cdSmoke = Math.max(0, this.cdSmoke - dt); this.cdShield = Math.max(0, this.cdShield - dt); this.shieldT = Math.max(0, this.shieldT - dt);
    const fx = Math.sin(p.h), fz = Math.cos(p.h), vel = p.worldVel(), y0 = p.bodyY;
    if (inp.missile && this.ammoMissile > 0) {                                                                // a homing missile from the grille
      this.ammoMissile--; const m = this.muzzle(p, 0), ms = { x: m[0], z: m[2], y: m[1], h: p.h, speed: Math.max(pspeed, 25), age: 0, target: -1 };
      let bestA = 0.6, bestD = 1e9;
      for (let i = 0; i < this.cops.length; i++) { const c = this.cops[i]; if (c.wreck) continue; const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz); if (d > 260 || d < 8) continue; const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - p.h)); if (ang < bestA && d < bestD + 80) { bestA = ang; bestD = d; ms.target = i; } }
      if (ms.target >= 0) ms.tc = this.cops[ms.target];
      this.missiles.push(ms); this.fx.flash(m[0], m[1], m[2], 1.6, 0.15, 6, 1, 0.8, 0.4); this.messages.push(ms.target >= 0 ? 'MISSILE - LOCKED' : 'MISSILE'); this.onMissile && this.onMissile();
    }
    if (inp.bomb && this.ammoBomb > 0) { this.ammoBomb--; this.bombs.push({ x: p.x - fx * 2.6, z: p.z - fz * 2.6, y: y0 + 0.2, vx: vel[0] * 0.25, vz: vel[1] * 0.25, age: 0 }); this.messages.push('BOMB DROPPED'); this.onBeep && this.onBeep(520); }
    if (inp.oil && this.cdOil <= 0) { this.cdOil = COOLDOWN.oil; this.oils.push({ x: p.x - fx * 5.5, z: p.z - fz * 5.5, r: 6.5, age: 0, life: 16 }); this.messages.push('OIL SLICK'); this.onBeep && this.onBeep(300); }
    if (inp.smoke && this.cdSmoke <= 0) {
      this.cdSmoke = COOLDOWN.smoke; this.smokes.push({ x: p.x - fx * 6, z: p.z - fz * 6, r: 11, age: 0, life: 14 }, { x: p.x - fx * 18, z: p.z - fz * 18, r: 11, age: 0, life: 14 }); this.messages.push('SMOKE SCREEN'); this.onBeep && this.onBeep(210);
      for (let i = 0; i < 46; i++) { const t = rnd(), a = rnd() * 6.2832, r = rnd() * 9; this.fx.puff(p.x - fx * (3 + t * 24) + Math.sin(a) * r, 0.8 + rnd() * 3, p.z - fz * (3 + t * 24) + Math.cos(a) * r, rnd() - 0.5, 0.4, rnd() - 0.5, 4 + rnd() * 4, 9 + rnd() * 4, 0.62, 0.75, 0.25); }
    }
    if (inp.shield && this.cdShield <= 0) { this.shieldT = 6; this.cdShield = COOLDOWN.shield; this.messages.push('ARMOUR UP'); this.onBeep && this.onBeep(760); }
    for (let i = 0; i < this.missiles.length;) {                                                                // missiles
      const m = this.missiles[i]; m.age += dt; m.speed = Math.min(105, m.speed + 70 * dt);
      if (m.tc && !m.tc.wreck) { const want = Math.atan2(m.tc.x - m.x, m.tc.z - m.z); m.h += clamp(wrapAngle(want - m.h), -2.6 * dt, 2.6 * dt); }
      const step = m.speed * dt, dx = Math.sin(m.h), dz = Math.cos(m.h); let boom = m.age > 5;
      if (raycastStatic(m.x, m.z, dx, dz, step + 1) < step + 0.9) boom = true;
      m.x += dx * step; m.z += dz * step; const gy = groundAt(m.x, m.z).y; m.y = Math.max(m.y + (gy + 0.9 - m.y) * Math.min(1, dt * 6), gy + 0.5);
      for (const c of this.cops) if (!c.wreck && Math.hypot(c.x - m.x, c.z - m.z) < 2.6) boom = true;
      for (const t of traffic.cars) if (t.active && t.pts && t.mode !== 'wreck' && Math.hypot(t.x - m.x, t.z - m.z) < 2.6) boom = true;
      this.fx.puff(m.x - dx * 1.2, m.y, m.z - dz * 1.2, 0, 0.3, 0, 0.5, 1.4, 0.55, 0.5, 1.3); this.fx.fire(m.x - dx * 1.0, m.y, m.z - dz * 1.0, 0, 0, 0, 0.45, 0.18);
      if (boom) { this.explode(m.x, m.z, m.y, 1.0, 10, 170, p, traffic); this.missiles[i] = this.missiles[this.missiles.length - 1]; this.missiles.pop(); continue; }
      i++;
    }
    for (let i = 0; i < this.bombs.length;) {                                                                   // bombs go off when something drives close
      const b = this.bombs[i]; b.age += dt; const k = Math.exp(-2 * dt); b.vx *= k; b.vz *= k; b.x += b.vx * dt; b.z += b.vz * dt; b.y = groundAt(b.x, b.z).y + 0.3; let boom = b.age > 40;
      if (b.age > 0.8) { for (const c of this.cops) if (!c.wreck && Math.hypot(c.x - b.x, c.z - b.z) < 6) boom = true; for (const t of traffic.cars) if (t.active && t.pts && t.mode !== 'wreck' && Math.hypot(t.x - b.x, t.z - b.z) < 4) boom = true; }
      if (boom) { this.explode(b.x, b.z, b.y, 1.6, 15, 260, p, traffic); this.bombs[i] = this.bombs[this.bombs.length - 1]; this.bombs.pop(); continue; }
      i++;
    }
    for (let i = 0; i < this.oils.length;) {
      const o = this.oils[i]; o.age += dt;
      for (const t of traffic.cars) { if (!t.active || !t.pts || t.mode !== 'drive') continue; const ox = t.x - o.x, oz = t.z - o.z; if (ox * ox + oz * oz < o.r * o.r && t.speed > 6) traffic.knock(t, Math.sin(t.h) * t.speed * 0.8, Math.cos(t.h) * t.speed * 0.8, (rnd() - 0.5) * 5); }
      if (o.age > o.life) { this.oils[i] = this.oils[this.oils.length - 1]; this.oils.pop(); } else i++;
    }
    for (let i = 0; i < this.smokes.length;) { const s = this.smokes[i]; s.age += dt; if (s.age > s.life) { this.smokes[i] = this.smokes[this.smokes.length - 1]; this.smokes.pop(); } else i++; }
    // Wrecks of civilian cars burn too.
    for (const t of traffic.cars) if (t.mode === 'wreck' && t.burn < 20 && (t.x - p.x) ** 2 + (t.z - p.z) ** 2 < 260 * 260) this.fx.burn(t.x, t.y || 0, t.z, dt * 0.7);
    // Win or lose.
    let close = 0; for (const c of this.cops) if (!c.wreck && Math.hypot(c.x - p.x, c.z - p.z) < 9) close++;
    if (pspeed < 2.5 && close >= 2) this.bustT += dt; else this.bustT = Math.max(0, this.bustT - dt * 2); if (this.bustT > 4) { this.result = 'busted'; this.messages.push('BUSTED'); }
    if (this.health <= 0) { this.health = 0; this.result = 'wrecked'; this.messages.push('WRECKED'); this.fx.explosion(p.x, y0, p.z, 1.2); this.onBoom && this.onBoom(p.x, p.z, 1.2); }
    if (this.health < 35 && rnd() < dt * 18) this.fx.puff(p.x + fx * 1.6, y0 + 0.9, p.z + fz * 1.6, 0, 1.0, 0, 0.6, 1.6, this.health < 15 ? 0.1 : 0.35, 0.6, 1.6);
    if (this.health < 15 && rnd() < dt * 14) this.fx.fire(p.x + fx * 1.7, y0 + 0.8, p.z + fz * 1.7, 0, 1.0, 0, 0.35, 0.4);
  }

  // --- Drawing ---------------------------------------------------------------------------------------------------------
  // Positions the meshes for this frame. `clock` drives the flashing; `p` is the player's car (for the armour bubble).
  render(clock, p, dt, gt) {
    const { m4, q, e, v, one, col } = this.tmp;
    const show = this.active;
    let nb = 0; const counts = [0, 0];
    for (const c of this.cops) {
      if (!show) break;
      const k = this.kinds[c.kind], i = counts[c.kind]++; if (i >= CAP) continue;
      e.set(-c.pitch, c.h, c.roll, 'YXZ'); q.setFromEuler(e); v.set(c.x, c.y, c.z); m4.compose(v, q, one);
      k.body.setMatrixAt(i, m4); k.lights.setMatrixAt(i, c.wreck ? this.zero : m4); k.body.setColorAt(i, c.wreck ? col.setRGB(0.12, 0.11, 0.1) : col.setRGB(1, 1, 1));
      if (nb < CAP) { v.y += 0.03; e.set(0, c.h, 0, 'YXZ'); q.setFromEuler(e); m4.compose(v, q, one); this.blobs.setMatrixAt(nb++, m4); }
      // The light bar: red on one side, blue on the other, swapping about three times a second.
      const phase = ((clock * 3.4 + c.flash) % 1) < 0.5, bz = c.kind ? -0.55 : -0.2, by = c.kind ? 1.84 : 1.5, sn = Math.sin(c.h), cs = Math.cos(c.h);
      for (const s of [-1, 1]) {
        const mesh = this.bars[c.kind][s < 0 ? 0 : 1], on = !c.wreck && (s < 0 ? phase : !phase);
        const lx = s * 0.26, wx = c.x + cs * lx + sn * bz, wz = c.z - sn * lx + cs * bz;
        v.set(wx, c.y + by, wz); e.set(-c.pitch, c.h, c.roll, 'YXZ'); q.setFromEuler(e); m4.compose(v, q, one); mesh.setMatrixAt(i, m4);
        const base = s < 0 ? [1, 0.06, 0.04] : [0.1, 0.25, 1], br = on ? 7 : 0.25; col.setRGB(base[0] * br, base[1] * br, base[2] * br);
        mesh.setColorAt(i, col);
        if (on) this.fx.glow(wx, c.y + by + 0.25, wz, c.kind ? 1.3 : 1.1, base[0] * 3, base[1] * 3, base[2] * 3, 0.9);
      }
      if (!c.wreck) { const hs = (c.kind ? 1.0 : 0.72); for (const s of [-1, 1]) this.fx.glow(c.x + Math.sin(c.h) * (c.len / 2 + 0.3) + Math.cos(c.h) * s * 0.55, c.y + hs, c.z + Math.cos(c.h) * (c.len / 2 + 0.3) - Math.sin(c.h) * s * 0.55, 0.45, 2.2, 2.0, 1.7, 0.55); }
    }
    for (let ki = 0; ki < 2; ki++) {
      const k = this.kinds[ki], n = Math.min(CAP, counts[ki]);
      k.body.count = k.lights.count = n; k.body.instanceMatrix.needsUpdate = k.lights.instanceMatrix.needsUpdate = true; if (k.body.instanceColor) k.body.instanceColor.needsUpdate = true;
      for (const m of this.bars[ki]) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
    this.blobs.count = nb; this.blobs.instanceMatrix.needsUpdate = true;
    // Missiles, bombs, oil.
    for (let i = 0; i < this.missileMeshes.length; i++) {
      const m = this.missiles[i], mesh = this.missileMeshes[i]; mesh.visible = !!m && show;
      if (m) { mesh.position.set(m.x, m.y, m.z); mesh.rotation.set(0, m.h, 0); }
    }
    for (let i = 0; i < this.bombMeshes.length; i++) {
      const b = this.bombs[i], mesh = this.bombMeshes[i]; mesh.visible = !!b && show;
      if (b) { mesh.position.set(b.x, b.y - 0.15, b.z); const on = ((clock * (b.age > 0.8 ? 3 : 8)) % 1) < 0.5; this.fx.glow(b.x, b.y + 0.2, b.z, on ? 0.7 : 0.25, 6 * (on ? 1 : 0.1), 0.5 * (on ? 1 : 0.1), 0.25 * (on ? 1 : 0.1), 1); }
    }
    for (let i = 0; i < this.oilMeshes.length; i++) {
      const o = this.oils[i], mesh = this.oilMeshes[i]; mesh.visible = !!o && show;
      if (o) { const kk = clamp(o.age / 0.5, 0, 1) * clamp((o.life - o.age) / 2, 0, 1); mesh.position.set(o.x, groundAt(o.x, o.z).y + 0.03, o.z); mesh.scale.set(o.r * kk + 0.01, 1, o.r * kk * 0.75 + 0.01); }
    }
    // The player's gadgets: guns sliding out, armour rising, the bubble.
    if (gt && p && show) {
      const ud = gt.userData;
      if (ud.guns) ud.guns.position.z = this.gunOut * 0.3;
      this.shieldK += ((this.shieldT > 0 ? 1 : 0) - this.shieldK) * Math.min(1, dt * 8);
      if (ud.shield) ud.shield.position.y = 0.5 + 0.38 * this.shieldK;
      this.bubble.visible = this.shieldT > 0;
      if (this.bubble.visible) {
        const k = clamp(this.shieldT / 0.4, 0, 1) * (0.7 + 0.3 * Math.sin(clock * 9)) * (this.shieldT < 1.2 ? (Math.sin(clock * 30) > 0 ? 1 : 0.3) : 1);
        this.bubble.material.opacity = 0.2 * k; this.bubble.position.copy(gt.position); this.bubble.position.y += 0.78; this.bubble.rotation.y = gt.rotation.y;
      }
    } else this.bubble.visible = false;
  }
  // Once a frame after the camera is placed: pose the meshes (which also emits this frame's glows), then step the particles.
  draw(clock, p, dt, gt, camera, renderer) { this.render(clock, p, dt, gt); this.fx.update(dt, camera, renderer); }
  consumeMessages() { return this.messages.splice(0); }
}
