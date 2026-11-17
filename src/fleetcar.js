// Any car in the street, made into one you can drive: the same body, glass, trim and wheels the traffic draws (carModel.js,
// cardetail.js), put together as an ordinary car the way the game's own car is (main.js moves the body on its suspension,
// turns the wheels, lights the brake lamps and puts the driver in the seat), with a cockpit to sit in, and physics to match:
// a hatchback is light and slow, a van is tall and soft, a bus is very heavy, a police car is quick (vehicle.js does the rest).
import * as THREE from 'three';
import { attachSSR } from './ssr.js';
import { paintFlakes } from './paintfx.js';
import { glowTex } from './textures.js';
import { buildCockpit } from './cockpit.js';

// What each kind of car is like to drive: mass (kg), peak torque (Nm) and where it peaks, the red line, its top speed (m/s, where
// the gearing runs out), aero drag (½ρCdA), grip, the share of the drive to the front wheels (0: rear-wheel drive, 1: front),
// the height of the centre of mass, and where it sits between the axles (0: on the rear axle, 1: on the front).
const KINDS = {
  hatch: { mass: 1180, T: 200, peak: 3800, red: 6300, vmax: 52, drag: 0.34, mu: 1.0, front: 1.0, cgH: 0.52, cgAt: 0.6, gears: 5 },
  saloon: { mass: 1450, T: 290, peak: 4000, red: 6300, vmax: 60, drag: 0.37, mu: 1.02, front: 0.0, cgH: 0.53, cgAt: 0.53, gears: 6 },
  suv: { mass: 2050, T: 420, peak: 3600, red: 6000, vmax: 54, drag: 0.5, mu: 0.97, front: 0.4, cgH: 0.7, cgAt: 0.54, gears: 6 },
  van: { mass: 2300, T: 400, peak: 3000, red: 5400, vmax: 45, drag: 0.58, mu: 0.95, front: 0.0, cgH: 0.74, cgAt: 0.56, gears: 6 },
  truck: { mass: 7000, T: 950, peak: 1700, red: 3000, vmax: 30, drag: 1.6, mu: 0.85, front: 0.0, cgH: 1.15, cgAt: 0.55, gears: 6, big: true },
  bus: { mass: 11000, T: 1150, peak: 1500, red: 2800, vmax: 27, drag: 2.3, mu: 0.85, front: 0.0, cgH: 1.1, cgAt: 0.42, gears: 6, big: true },
  cruiser: { mass: 1800, T: 460, peak: 4400, red: 6200, vmax: 67, drag: 0.39, mu: 1.06, front: 0.0, cgH: 0.53, cgAt: 0.53, gears: 6 },
  police4x4: { mass: 2600, T: 540, peak: 4000, red: 6000, vmax: 60, drag: 0.52, mu: 1.0, front: 0.4, cgH: 0.7, cgAt: 0.54, gears: 6 },
};
export const CAR_NAMES = { sports: 'SPORTS CAR', hatch: 'HATCHBACK', saloon: 'SALOON', suv: 'SUV', van: 'PICKUP', truck: 'BOX TRUCK', bus: 'BUS', cruiser: 'POLICE CAR', police4x4: 'POLICE 4X4' };

// The physics of one of these (the same shape of spec as vehicle.js's SPEC). md: a model from trafficModels() or policeModels().
export function fleetSpec(md) {
  const K = KINDS[md.name] || KINDS.saloon, m = K.mass, G = 9.81, k = m / 1650;
  const wzf = md.wheelAt[0][1], wzr = md.wheelAt[2][1], half = Math.abs(md.wheelAt[0][0]);
  const cg = wzr + (wzf - wzr) * K.cgAt, a = wzf - cg, b = cg - wzr, L = a + b;
  const Ff = m * G * b / L / 2, Fr = m * G * a / L / 2, sag = K.big ? 0.06 : 0.08;
  const spring = [Ff / sag, Ff / sag, Fr / sag, Fr / sag];
  const damper = spring.map((s, i) => 0.62 * Math.sqrt(s * (i < 2 ? Ff : Fr) / G));
  // Gears: a geometric spread from first to top, with top gear reaching the red line at the car's top speed.
  const wr = md.wr, top = (K.red * Math.PI / 30) * wr / K.vmax, spread = K.big ? 3.4 : K.gears === 5 ? 3.3 : 3.6, final = 3.5;
  const gears = Array.from({ length: K.gears }, (_, i) => +(top * spread * Math.pow(1 / spread, i / (K.gears - 1)) / final).toFixed(3));
  const brake = 0.82 * k;
  return {
    mass: m, cgH: K.cgH, rollH: K.cgH * 0.55, len: md.len, wid: md.width, cgOff: -cg, model: md.name,
    wheelPos: [[a, -half], [a, half], [-b, -half], [-b, half]],
    wheelR: wr, wheelI: 1.3 * (wr / 0.345) ** 2 * Math.sqrt(k), engineI: 0.22 * Math.sqrt(k),
    spring, damper, arb: [21000 * k, 12000 * k], travel: K.big ? 0.15 : 0.13,
    mu: K.mu, kPeak: 0.1, aPeak: [0.13, 0.115], C: [1.55, 1.38],
    gears, rev: +(gears[0] * 0.95).toFixed(3), final, eff: 0.88,
    idle: K.big ? 600 : 780, redline: K.red, limiter: K.red + 220, Tmax: K.T, peakRpm: K.peak,
    drag: K.drag, roll: 10 * Math.sqrt(k), down: 0.05, brakeT: [2200 * brake, 2200 * brake, 1300 * brake, 1300 * brake], handT: 3200 * k, steerMax: K.big ? 0.55 : 0.6, frontDrive: K.front,
    nitroForce: 0, dialKmh: Math.ceil((K.vmax * 3.6 + 20) / 20) * 20,          // (the speedometer reads to a little over its top speed)
  };
}

const _glow = { t: null };
// The car itself, in the shape main.js expects of the game's own car: root (placed by the physics) > body (pitches and rolls)
// with the shell, glass, trim, lamps, a cockpit and brake lamps that brighten; four wheels that steer and roll.
// md: the model; color: its paint (a THREE.Color); mats: the shared car materials (carMaterials()); envMap: the reflections, if any.
export function makeFleetCar(md, color, mats, envMap) {
  const D = md.driver, N = md.near, root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const keep = new Set([N.body, N.glass, N.lamps, N.wheel, N.decal, mats.glass, mats.lamps, mats.wheel, mats.decal, mats.details]);
  const paint = attachSSR(new THREE.MeshPhysicalMaterial({ vertexColors: true, color, metalness: 0.45, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.04, sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.8, 0.85, 1), envMapIntensity: 1.35 }), { range: 55, rough: 0.45, view: 120 });
  paintFlakes(paint, 0.6); if (envMap) paint.envMap = envMap;
  const mesh = (geo, mat, name, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = shadow; m.receiveShadow = true; body.add(m); return m; };
  mesh(N.body, paint, 'shell'); mesh(md.own(), mats.details, 'trim'); mesh(N.lamps, mats.lamps, 'lamps', false);
  if (N.decal) mesh(N.decal, mats.decal, 'decal', false).renderOrder = 3;
  mesh(N.glass, mats.glass, 'glass', false).renderOrder = 4;
  // From inside: the inside of the shell, dark (without it you would see out through the roof). Not in a truck or a bus: their windscreen is
  // the flat front of the body, which the lining would black out, and from their high cab the roof is out of sight.
  if (D.small) {
    const lining = new THREE.Mesh(N.body, new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.95, side: THREE.BackSide })); lining.material.userData.noProbe = true;
    lining.name = 'lining'; lining.scale.set(0.985, 0.99, 0.995); body.add(lining);
  }
  // The cockpit (the game's own, cockpit.js), moved to where this car's driver sits and narrowed to its width.
  const cp = buildCockpit(body, N.body, 'modern'), g = cp.group; g.name = 'cockpit';
  const inner = g.children.find(o => Array.isArray(o.material)); if (inner) g.remove(inner);          // (its lining is cut for the other car's body: ours is above)
  const sx = D.small ? Math.min(1, (D.w - 0.06) / 0.94) : 1, ox = D.small ? 0 : D.eye[0] - 0.37, oy = D.eye[1] - 1.055, oz = D.eye[2] + 0.28;
  g.scale.x = sx; g.position.set(ox, oy, oz);
  const at = v => v.set(v.x * sx + ox, v.y + oy, v.z + oz);
  at(cp.eye); at(cp.seat.hip);
  // Brake lamps (brighter when braking), and their glow.
  const tail = new THREE.MeshStandardMaterial({ color: 0x400404, emissive: 0xff2208, emissiveIntensity: 3.2, roughness: 0.3 });
  const tailGlow = [], glow = _glow.t || (_glow.t = glowTex());
  for (const s of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.02), tail); lamp.position.set(s * D.tail[0], D.tail[1], D.tail[2] - 0.012); body.add(lamp);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff2a10, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(s * D.tail[0], D.tail[1], D.tail[2] - 0.1); sp.scale.set(0.8, 0.45, 1); body.add(sp); tailGlow.push(sp);
  }
  // A police car's light bar: two lamps that main.js flashes when the siren is on.
  let bar = null;
  if (D.bar) {
    bar = [0xff1408, 0x1a40ff].map((c, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.11, 0.2), new THREE.MeshBasicMaterial({ color: 0x220806 })); m.position.set((i ? -1 : 1) * 0.26, D.bar[0], D.bar[1]); body.add(m);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); sp.position.set((i ? -1 : 1) * 0.3, D.bar[0] + 0.15, D.bar[1]); sp.scale.set(1.6, 1.0, 1); body.add(sp);
      return { m, sp, on: new THREE.Color(c).multiplyScalar(6), off: new THREE.Color(c === 0xff1408 ? 0x2a0806 : 0x06082a) };
    });
  }
  // A soft shadow on the road under it.
  const cs = new THREE.Mesh(new THREE.PlaneGeometry(md.width + 0.7, md.len + 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glow, color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false }));
  cs.position.y = 0.02; cs.renderOrder = 2; root.add(cs);
  // Wheels: a group at each hub that steers, with the wheel inside it that rolls.
  const wheels = [];
  for (const [x, z, front] of md.wheelAt) {
    const steer = new THREE.Group(); steer.position.set(x, md.wr, z); root.add(steer);
    const spin = new THREE.Mesh(N.wheel, mats.wheel); spin.castShadow = true; steer.add(spin);
    wheels.push({ steer, spin, front, side: x > 0 ? 1 : -1, baseY: md.wr });
  }
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, opacity: 0, depthWrite: false })); flame.visible = false; body.add(flame);
  const dims = { wzf: md.wheelAt[0][1], wzr: md.wheelAt[2][1], track: Math.abs(md.wheelAt[0][0]) * 2, wheelR: md.wr, len: md.len, width: md.width };
  const hoodCam = [0, cp.eye.y + 0.06, cp.eye.z + 0.75], bumperCam = [0, Math.max(0.5, D.clear + 0.35), md.len / 2 + 0.12];              // (the bonnet and bumper views)
  root.userData = { body, wheels, paint, tail, tailGlow, headGlow: [], flame, cockpit: cp, dims, fleet: md.name, bar, beamZ: md.len / 2 - 0.6, hoodCam, bumperCam, keep };
  return root;
}

// Take one apart: everything it made for itself (not the shared geometry and materials) goes back to the GPU.
export function disposeFleetCar(root) {
  const keep = root.userData.keep || new Set();
  root.parent && root.parent.remove(root);
  root.traverse(o => {
    if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) if (!keep.has(m)) { for (const k of ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'emissiveMap']) if (m[k] && m[k] !== _glow.t) m[k].dispose(); m.dispose(); }
  });
}
