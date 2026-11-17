// The plans of the rooms (see interior.js): a petrol station's shop, a convenience store, a jeweller, a bank and a museum. Each fills in a Room with
// walls, furniture, the things to steal (`item`s), where the staff and customers stand (`spot`s), and, for the harder places, cameras and laser beams.
// The harder the place, the more there is to get past: see VENUES in venues.js for what each is worth.
import * as THREE from 'three';
import { C } from './interior.js';

const glassBox = (R, x0, z0, x1, z1, y0, y1) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), R.mats.glass); m.position.set(R.ox + (x0 + x1) / 2, R.oy + (y0 + y1) / 2, R.oz + (z0 + z1) / 2); m.renderOrder = 3; R.loose.push(m); return m;
};
const gem = (R, x, y, z, col, s = 0.05) => {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), R.mats.gem.clone()); m.material.color.set(col); m.material.emissive.set(col); m.material.emissiveIntensity = 0.45; m.position.set(R.ox + x, R.oy + y, R.oz + z); m.scale.y = 1.35; R.loose.push(m); return m;
};
const group = (R, objs) => { const g = new THREE.Group(); for (const o of objs) { R.loose.splice(R.loose.indexOf(o), 1); g.add(o); } R.loose.push(g); return g; };
// Rows of goods on a shelf: little coloured boxes.
const goods = (R, x0, z0, x1, z1, y0, rows, rnd, sx = 0.16) => {
  const cols = [0xd23a3a, 0xe8c030, 0x3a78d2, 0x3aa860, 0xf0f0ec, 0xe27a30, 0x8a4ac2];
  for (let r = 0; r < rows; r++) for (let x = x0; x < x1 - sx; x += sx + 0.025) for (let z = z0; z < z1 - 0.12; z += 0.16) { if (rnd() < 0.12) continue; const h = 0.14 + rnd() * 0.12; R.box('prop', x, z, x + sx, z + 0.13, y0 + r * 0.42, y0 + r * 0.42 + h, C(cols[(rnd() * cols.length) | 0])); }
};
// A shelving unit (gondola) of the given size with goods on both sides.
const gondola = (R, x0, z0, x1, z1, rnd, h = 1.55) => {
  R.box('metal', x0, z0, x1, z1, 0, h, C(0x8d949b), true);
  const along = x1 - x0 > z1 - z0;
  for (let k = 0; k < 4; k++) { const y = 0.25 + k * 0.38; if (along) { goods(R, x0 + 0.05, z0 - 0.12, x1 - 0.05, z0, y, 1, rnd); goods(R, x0 + 0.05, z1, x1 - 0.05, z1 + 0.12, y, 1, rnd); } else { for (const zz of [x0 - 0.12, x1]) for (let z = z0 + 0.05; z < z1 - 0.2; z += 0.19) { if (rnd() < 0.12) continue; R.box('prop', zz, z, zz + 0.12, z + 0.15, y, y + 0.14 + rnd() * 0.1, C([0xd23a3a, 0xe8c030, 0x3a78d2, 0x3aa860, 0xf0f0ec, 0xe27a30][(rnd() * 6) | 0])); } } }
};
// A glass-fronted fridge cabinet in a wall, glowing cold.
const fridge = (R, x0, x1, z, depth, rnd) => {
  R.box('metal', x0, z, x1, z + depth, 0, 2.15, C(0xb4bcc4), true); R.box('emit', x0 + 0.04, z - 0.02, x1 - 0.04, z, 0.12, 2.0, C(0xbfe8ff).multiplyScalar(1.5));
  for (let k = 0; k < 4; k++) for (let x = x0 + 0.08; x < x1 - 0.2; x += 0.2) { if (rnd() < 0.1) continue; R.box('prop', x, z - 0.06, x + 0.13, z - 0.01, 0.2 + k * 0.45, 0.2 + k * 0.45 + 0.32, C([0xd23a3a, 0x3a78d2, 0x3aa860, 0xe8c030, 0xe27a30][(rnd() * 5) | 0])); }
  glassBox(R, x0, z - 0.1, x1, z, 0.1, 2.1);
};
const till = (R, x, z, y) => { R.box('metal', x - 0.22, z - 0.18, x + 0.22, z + 0.18, y, y + 0.14, C(0x24262a)); R.box('prop', x - 0.2, z + 0.02, x + 0.2, z + 0.18, y + 0.14, y + 0.4, C(0x202226)); R.box('emit', x - 0.12, z + 0.0, x + 0.12, z + 0.02, y + 0.26, y + 0.34, C(0x7fe3a8).multiplyScalar(2)); };
const cash = (R, x, y, z, rnd, n = 1, col = 0x4a9a58) => { const objs = []; for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.1), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 })); m.position.set(R.ox + x + (i % 2) * 0.01, R.oy + y + 0.04 + i * 0.075, R.oz + z); R.loose.push(m); objs.push(m); } return objs; };
const ceilLights = (R, xs, zs, w = 1.4, d = 0.25, k = 3) => { for (const x of xs) for (const z of zs) R.panel(x, z, w, d, R.H, C(0xfff3dc), k); };

export const PLANS = {
  // ---- 1. Petrol station: a small kiosk, one clerk, a till ----------------------------------------------------------------------------------------------
  petrol(R, v, rnd) {
    R.shell(9, 7, 3.0, { floor: C(0xffffff), wall: C(0xe6e8e4), trim: C(0xb02a2a) });
    R.slab('prop', 1.0, 1.6, 4.5, 2.5, 0, 1.08, C(0xc23a32), C(0x3a3d42));                                       // the counter
    till(R, 3.2, 2.15, 1.08); R.item({ id: 'till', type: 'till', x: 3.2, z: 2.15, y: 1.1, r: 2.0, label: 'EMPTY THE TILL', dur: 2.4, value: 300 + Math.round(rnd() * 600), staff: true });
    for (const o of cash(R, 3.2, 1.08, 2.55, rnd, 1)) o.visible = true;
    R.box('prop', 1.0, 3.75, 4.5, 3.98, 0, 2.3, C(0x3c3f45), true);                                              // the cigarette wall behind the counter
    for (let k = 0; k < 6; k++) for (let x = 1.1; x < 4.4; x += 0.3) R.box('prop', x, 3.68, x + 0.24, 3.75, 0.3 + k * 0.3, 0.52 + k * 0.3, C([0xd23a3a, 0xe8c030, 0xf0f0ec, 0x3a78d2, 0x3aa860][(rnd() * 5) | 0]));
    gondola(R, -3.4, 2.4, -2.8, 5.8, rnd, 1.6); gondola(R, -1.4, 2.4, -0.8, 5.8, rnd, 1.6);
    fridge(R, -4.4, -0.2, 6.35, 0.6, rnd); R.slab('prop', 3.6, 4.7, 4.4, 6.9, 0, 1.0, C(0x5a4636), C(0xe8e2d6));  // coffee and hot food
    R.box('emit', 3.7, 4.9, 4.3, 5.2, 1.0, 1.25, C(0xff7a30).multiplyScalar(1.6));
    ceilLights(R, [-2.3, 2.3], [2, 5]); R.light(-2.3, 2.7, 3.2, 1); R.light(2.3, 2.7, 3.2, 1); R.light(0, 2.7, 6, 0.8); R.light(2.5, 2.7, 1, 0.6);
    R.spot('clerk', 2.8, 3.2, Math.PI); R.spot('customer', -2.1, 4.2, 0, { aisle: true });
  },
  // ---- 2. Convenience store: aisles, a counter, a back room with a safe ---------------------------------------------------------------------------------
  shop(R, v, rnd) {
    R.shell(12, 9, 3.2, { floor: C(0xffffff), wall: C(0xe9e6dc), trim: C(0x2a7a46) });
    R.slab('prop', 2.4, 1.6, 6.8, 2.6, 0, 1.08, C(0x2a7a46), C(0x33363a)); R.slab('prop', 2.4, 2.6, 3.4, 4.6, 0, 1.08, C(0x2a7a46), C(0x33363a));
    till(R, 4.6, 2.1, 1.08); R.item({ id: 'till', type: 'till', x: 4.6, z: 2.1, y: 1.1, r: 2.0, label: 'EMPTY THE TILL', dur: 2.8, value: 600 + Math.round(rnd() * 900), staff: true });
    R.box('prop', 2.4, 4.8, 6.8, 5.05, 0, 2.3, C(0x3c3f45), true);
    for (const x of [-4.6, -2.8, -1.0]) gondola(R, x, 2.4, x + 0.6, 7.2, rnd, 1.7);
    fridge(R, -5.8, 0.4, 8.2, 0.7, rnd); fridge(R, 0.5, 3.0, 8.2, 0.7, rnd);
    // The back room: a partition with a door gap in the right back corner, and the safe.
    R.box('wall', 3.5, 6.6, 4.3, 6.8, 0, 3.2, C(0xd6d2c6), true); R.box('wall', 5.3, 6.6, 6.0, 6.8, 0, 3.2, C(0xd6d2c6), true); R.box('wall', 4.3, 6.6, 5.3, 6.8, 2.2, 3.2, C(0xd6d2c6)); R.box('wall', 3.4, 6.6, 3.6, 9, 0, 3.2, C(0xd6d2c6), true);
    R.box('metal', 4.7, 8.1, 5.6, 8.9, 0, 0.9, C(0x2b2e33), true); R.box('emit', 5.0, 8.05, 5.3, 8.1, 0.55, 0.65, C(0xff3a2a).multiplyScalar(2));
    R.item({ id: 'safe', type: 'safe', x: 5.15, z: 7.7, y: 0.6, r: 1.6, label: 'CRACK THE SAFE', dur: 7, value: 1800 + Math.round(rnd() * 1500), loud: false, obj: null });
    ceilLights(R, [-3, 0, 3], [2.4, 5.2, 7.6]); R.light(-3, 2.9, 3, 1); R.light(3, 2.9, 3, 1); R.light(-3, 2.9, 7, 0.9); R.light(3, 2.9, 7.5, 0.5);
    R.spot('clerk', 4.6, 3.3, Math.PI); R.spot('customer', -3.7, 4.6, 0, { aisle: true }); R.spot('customer', -0.9, 3.4, 0, { aisle: true });
  },
  // ---- 3. Jeweller: glass cases, an owner, an armed guard, two cameras -----------------------------------------------------------------------------------
  jeweller(R, v, rnd) {
    R.shell(10, 9, 3.4, { floor: C(0xffffff), floorS: 2.2, wall: C(0xe6dccb), trim: C(0xc9a24a), ceil: C(0xeee4d2) });
    for (const z of [0.3, 8.7]) R.box('prop', -5, z - 0.02, 5, z + 0.02, 2.55, 2.62, C(0xc9a24a));                // gilded rail
    const cols = [0xf5f5ff, 0xff3a6a, 0x3a8cff, 0x3affb0, 0xffd34a];
    const cases = [[-2.3, 3.6, 1.7], [2.3, 3.6, 1.7], [-4.15, 6.2, 0], [4.15, 6.2, 0], [-4.15, 2.6, 0], [4.15, 2.6, 0]];
    cases.forEach(([x, z, w], k) => {
      const sx = w ? 0.85 : 0.5, sz = w ? 0.45 : 0.9;
      R.slab('prop', x - sx, z - sz, x + sx, z + sz, 0, 0.92, C(0x2a1a12), C(0x0e0d10), true);
      R.box('prop', x - sx + 0.06, z - sz + 0.06, x + sx - 0.06, z + sz - 0.06, 0.92, 0.95, C(0x5a1020));                  // the velvet
      const gm = glassBox(R, x - sx, z - sz, x + sx, z + sz, 0.95, 1.45), gs = [];
      for (let i = 0; i < 5; i++) gs.push(gem(R, x - sx * 0.6 + i * (sx * 1.2 / 4), 1.0, z + (i % 2 ? 0.1 : -0.1) * (w ? 1 : 0.5), cols[(k + i) % cols.length], 0.045 + 0.02 * (i === 2)));
      R.box('emit', x - sx, z - sz, x + sx, z + sz, 1.45, 1.47, C(0xfff5e0).multiplyScalar(2.4));
      const stones = group(R, gs); R.item({ id: 'case' + k, type: 'case', x, z, y: 1.1, r: 1.7, label: 'SMASH THE CASE', dur: 0, value: 2400 + Math.round(rnd() * 2600), glass: gm, gems: stones, hp: 1, loud: true, sx, sz, h: 1.45 });
    });
    R.slab('prop', -2.6, 7.4, 2.6, 8.2, 0, 1.1, C(0x2a1a12), C(0x151317)); till(R, 0.4, 7.8, 1.1); R.item({ id: 'till', type: 'till', x: 0.4, z: 7.75, y: 1.15, r: 2.0, label: 'EMPTY THE TILL', dur: 2.8, value: 1500 + Math.round(rnd() * 1500), staff: true });
    R.boxes.push({ x0: R.ox - 2.6, x1: R.ox + 2.6, z0: R.oz + 7.4, z1: R.oz + 8.2, y0: R.oy, y1: R.oy + 1.1 });
    for (const x of [-3, 3]) R.drum('prop', x, 0.9, 0.12, 0, 1.0, C(0xc9a24a), true, 8);                                  // stanchions at the door
    for (const [x, z] of [[-4.6, 0.7], [4.6, 0.7]]) R.cams.push({ x: R.ox + x, y: R.oy + 3.2, z: R.oz + z, yaw: x < 0 ? 0.6 : -0.6, sweep: 0.7, range: 11, fov: 0.55 });
    ceilLights(R, [-2.6, 2.6], [2.2, 5.2], 1.6, 0.3, 2.6); R.light(-2.5, 3.0, 2.5, 1); R.light(2.5, 3.0, 2.5, 1); R.light(-2.5, 3.0, 6.4, 1); R.light(2.5, 3.0, 6.4, 1);
    R.spot('owner', 0, 8.6, Math.PI); R.spot('guard', 3.3, 1.9, Math.PI, { armed: true, post: true }); R.spot('customer', -1, 5.2, 0);
  },
  // ---- 4. Bank: tellers behind glass, two armed guards, a manager with a key card, and a vault ----------------------------------------------------------
  bank(R, v, rnd) {
    R.shell(18, 14, 4.6, { floor: C(0xffffff), floorS: 2.6, wall: C(0xe4ddd0), trim: C(0x2d6a4a), ceil: C(0xeee8dc) });
    // The teller counter across the room, with armoured glass over it and a gap for each teller.
    R.slab('prop', -7.5, 6.0, 7.5, 7.0, 0, 1.1, C(0x3a2a1c), C(0x1e2a24), true);
    for (const x0 of [-7.5, -2.5, 2.5]) glassBox(R, x0 + 0.1, 6.4, x0 + 2.4, 6.6, 1.1, 2.4), glassBox(R, x0 + 2.6, 6.4, x0 + 4.9, 6.6, 1.1, 2.4);
    for (const x of [-5, 0, 5]) { till(R, x, 6.6, 1.1); R.item({ id: 'drawer' + x, type: 'drawer', x, z: 7.5, y: 1.0, r: 1.6, label: 'EMPTY THE DRAWER', dur: 2.4, value: 3000 + Math.round(rnd() * 2600), staff: true }); }
    R.box('prop', -7.5, 6.4, 7.5, 7.0, 2.4, 2.6, C(0x2d6a4a));                                                       // the lintel over the glass
    // Queue posts and rope, a long bench, a plant, a sign over the counter.
    for (let k = 0; k < 4; k++) R.drum('prop', -3 + k * 2, 3.4, 0.07, 0, 0.95, C(0xc9a24a), false, 8);
    R.slab('prop', -8.6, 2.2, -7.6, 4.6, 0, 0.5, C(0x5a3a22), C(0x3a2a1c)); R.slab('prop', 7.6, 2.2, 8.6, 4.6, 0, 0.5, C(0x5a3a22), C(0x3a2a1c));
    R.box('emit', -3.5, 6.95, 3.5, 7.0, 2.62, 3.1, C(0xf2d27a).multiplyScalar(1.9));
    // The manager's glass office, back left, with a desk and a drawer that has the vault card.
    R.box('prop', -8.9, 9.4, -4.2, 9.5, 0, 0.9, C(0x5a4636), true); glassBox(R, -8.9, 9.4, -4.2, 9.5, 0.9, 2.7); R.box('prop', -4.3, 9.4, -4.2, 13.8, 0, 0.9, C(0x5a4636), true); glassBox(R, -4.3, 9.4, -4.2, 13.8, 0.9, 2.7);
    R.slab('prop', -7.6, 11.6, -5.8, 12.6, 0, 0.78, C(0x4a3624), C(0x2a1a10));
    // The vault, back right: a drum of steel with a round door, and cash and gold inside.
    R.box('wall', 3.4, 9.9, 3.9, 13.9, 0, 4.6, C(0x6e7378), true); R.box('wall', 8.5, 9.9, 9.0 - 0.01, 13.9, 0, 4.6, C(0x6e7378), true); R.box('wall', 3.4, 13.4, 9.0, 13.9, 0, 4.6, C(0x6e7378), true);
    R.box('wall', 3.4, 9.9, 4.9, 10.4, 0, 4.6, C(0x6e7378), true); R.box('wall', 7.0, 9.9, 9.0, 10.4, 0, 4.6, C(0x6e7378), true); R.box('wall', 4.9, 9.9, 7.0, 10.4, 2.5, 4.6, C(0x6e7378), true);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.3, 28).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9aa2aa, metalness: 0.95, roughness: 0.3, envMapIntensity: 1.4 })); disc.position.set(R.ox + 5.95, R.oy + 1.25, R.oz + 10.15); R.loose.push(disc);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 20), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3 })); wheel.position.set(R.ox + 5.95, R.oy + 1.25, R.oz + 9.95); R.loose.push(wheel);
    const vaultBox = { x0: R.ox + 4.9, x1: R.ox + 7.0, z0: R.oz + 9.9, z1: R.oz + 10.4, y0: R.oy, y1: R.oy + 2.5 }; R.boxes.push(vaultBox);
    R.item({ id: 'vault', type: 'vault', x: 5.95, z: 9.2, y: 1.25, r: 1.9, label: 'OPEN THE VAULT', dur: 26, value: 0, loud: true, obj: group(R, [disc, wheel]), box: vaultBox, needs: 'keycard' });
    for (let k = 0; k < 6; k++) {
      const x = [4.6, 6.2, 7.8][k % 3], z = [11.2, 12.7][(k / 3) | 0], gold = k % 3 === 2;
      R.slab('prop', x - 0.35, z - 0.3, x + 0.35, z + 0.3, 0, 0.5, C(0x484c52), C(0x33363a), true); const objs = cash(R, x, 0.5, z, rnd, 4, gold ? 0xd9b13a : 0x4a9a58);
      R.item({ id: 'stack' + k, type: 'stack', x, z: z - 0.8, y: 0.7, r: 1.3, label: gold ? 'TAKE THE GOLD' : 'TAKE THE CASH', dur: 1.6, value: 6500 + Math.round(rnd() * 7000), obj: group(R, objs), locked: true });
    }
    R.box('emit', 3.95, 9.95, 8.45, 10.0, 3.3, 3.5, C(0xff3a2a).multiplyScalar(1.4));
    for (const [x, z] of [[-8, 0.7], [8, 0.7], [0, 13.4]]) R.cams.push({ x: R.ox + x, y: R.oy + 4.3, z: R.oz + z, yaw: z > 5 ? Math.PI : x < 0 ? 0.55 : -0.55, sweep: 0.8, range: 15, fov: 0.6 });
    ceilLights(R, [-6, 0, 6], [2, 5, 8.4, 12], 1.8, 0.3, 2.4); R.light(-5, 4.0, 3, 1.1); R.light(5, 4.0, 3, 1.1); R.light(-5, 4.0, 10, 0.9); R.light(5, 4.0, 11.5, 0.8);
    R.spot('teller', -5, 8.1, Math.PI); R.spot('teller', 0, 8.1, Math.PI); R.spot('teller', 5, 8.1, Math.PI); R.spot('manager', -6.6, 10.6, Math.PI, { key: true });
    R.spot('guard', -3.6, 1.9, Math.PI, { armed: true, post: true }); R.spot('guard', 6.0, 4.4, 3.1, { armed: true, post: true }); R.spot('customer', -1.5, 3.0, 0); R.spot('customer', 3.2, 4.2, 0);
  },
  // ---- 5. Museum: a grand hall, four treasures, laser beams, cameras, patrolling guards, and a security room ------------------------------------------------
  museum(R, v, rnd) {
    R.shell(22, 18, 6.5, { floor: C(0xffffff), floorS: 2.6, wall: C(0xe8e0d2), trim: C(0x6a4a2a), ceil: C(0xf0e8da) });
    for (const [x, z] of [[-4.5, 5], [4.5, 5], [-4.5, 11], [4.5, 11]]) { R.drum('prop', x, z, 0.5, 0, 6.5, C(0xeee6d6), true, 16); R.drum('prop', x, z, 0.62, 0, 0.35, C(0xcbbfa6), false, 16); R.drum('prop', x, z, 0.62, 6.15, 6.5, C(0xcbbfa6), false, 16); }
    // Pictures down both side walls.
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.4), new THREE.MeshStandardMaterial({ map: R.art[(k + (s > 0 ? 2 : 0)) % 4], roughness: 0.7 })); m.position.set(R.ox + s * 10.86, R.oy + 2.8, R.oz + 2.2 + k * 4.2); m.rotation.y = -s * Math.PI / 2; R.loose.push(m);
      R.box('prop', s * 10.84, 2.2 + k * 4.2 - 0.05, s * 10.9, 2.2 + k * 4.2 + 0.05 + 0.0, 2.05, 2.15, C(0xc9a24a));
    }
    // A great skeleton in the middle of the hall, on a plinth.
    R.slab('prop', -2.4, 7.0, 2.4, 9.4, 0, 0.5, C(0x7a6a52), C(0x5a4c3a));
    for (let k = 0; k < 9; k++) { R.box('prop', -1.9 + k * 0.45, 7.9, -1.75 + k * 0.45, 8.5, 0.5, 0.5 + 1.1 - Math.abs(k - 4) * 0.1, C(0xe8dcc0)); R.box('prop', -1.9 + k * 0.45, 7.95, -1.75 + k * 0.45, 8.45, 1.1 + 0.4 - Math.abs(k - 4) * 0.1, 1.55 - Math.abs(k - 4) * 0.12, C(0xe8dcc0)); }
    R.box('prop', -2.1, 8.0, 1.5, 8.4, 0.9, 1.0, C(0xe8dcc0)); R.box('prop', 1.5, 8.05, 2.35, 8.35, 1.0, 1.35, C(0xe8dcc0)); R.box('prop', 2.0, 8.05, 2.4, 8.35, 1.25, 1.6, C(0xe8dcc0));
    R.boxes.push({ x0: R.ox - 2.4, x1: R.ox + 2.4, z0: R.oz + 7.0, z1: R.oz + 9.4, y0: R.oy, y1: R.oy + 1.7 });
    // The security room, front left (a door in its right side): the panel that switches the cameras and the beams off.
    R.box('wall', -10.9, 3.9, -6.6, 4.2, 0, 6.5, C(0xd6d0c2), true); R.box('wall', -6.9, 0.1, -6.6, 2.4, 0, 6.5, C(0xd6d0c2), true); R.box('wall', -6.9, 3.4, -6.6, 4.2, 0, 6.5, C(0xd6d0c2), true); R.box('wall', -6.9, 2.4, -6.6, 3.4, 2.4, 6.5, C(0xd6d0c2));
    R.box('prop', -9.6, 0.3, -8.4, 0.9, 0, 1.6, C(0x24272c), true); R.box('emit', -9.5, 0.9, -8.5, 0.95, 0.9, 1.5, C(0x7fe3a8).multiplyScalar(1.6));
    R.item({ id: 'panel', type: 'panel', x: -9.0, z: 1.5, y: 1.2, r: 1.6, label: 'SWITCH OFF THE SECURITY', dur: 6, value: 0, loud: false });
    // The treasures: three alcoves with laser beams round them (and a pressure plate), and one gem on a stand in the middle of the far wall.
    const T = [{ id: 'mask', x: -7.5, z: 15.2, name: 'THE GOLDEN MASK', value: 45000, col: 0xffc83a }, { id: 'crown', x: 7.5, z: 15.2, name: 'THE JEWELLED CROWN', value: 80000, col: 0xff3a6a }, { id: 'star', x: 0, z: 16.2, name: 'THE STAR DIAMOND', value: 190000, col: 0xcfeaff }];
    for (const t of T) {
      R.drum('prop', t.x, t.z, 0.5, 0, 1.15, C(0x2a2a30), true, 14); R.drum('prop', t.x, t.z, 0.56, 1.15, 1.2, C(0xc9a24a), false, 14); R.box('emit', t.x - 0.6, t.z - 0.6, t.x + 0.6, t.z + 0.6, 6.45, 6.48, C(0xfff0d0).multiplyScalar(2.2));
      const obj = new THREE.Mesh(t.id === 'star' ? new THREE.OctahedronGeometry(0.2, 0) : t.id === 'crown' ? new THREE.CylinderGeometry(0.2, 0.15, 0.2, 10) : new THREE.SphereGeometry(0.2, 12, 8).scale(0.9, 1.15, 0.5), R.mats.gem.clone());
      obj.material.color.set(t.col); obj.material.emissive.set(t.col); obj.material.emissiveIntensity = 0.55; obj.material.metalness = t.id === 'star' ? 0.1 : 0.9; obj.material.roughness = t.id === 'star' ? 0.02 : 0.2; obj.position.set(R.ox + t.x, R.oy + 1.5, R.oz + t.z); obj.scale.y *= t.id === 'star' ? 1.5 : 1; R.loose.push(obj);
      R.item({ id: t.id, type: 'art', x: t.x, z: t.z, y: 1.4, r: 1.05, label: 'LIFT ' + t.name, dur: 3.2, value: t.value, obj, loud: true, laser: true });
      // A fence of beams round the plinth: across the front and down both sides, at knee, waist and chest height. You cannot get at it without crossing one.
      const fx0 = t.x - 1.3, fx1 = t.x + 1.3, fz = t.z - 1.3;
      for (const y of [0.4, 0.9, 1.4]) for (const seg of [[[fx0, fz], [fx1, fz]], [[fx0, fz], [fx0, t.z + 1.2]], [[fx1, fz], [fx1, t.z + 1.2]]]) R.lasers.push({ a: [R.ox + seg[0][0], R.oz + seg[0][1]], b: [R.ox + seg[1][0], R.oz + seg[1][1]], y: R.oy + y, on: true });
      for (const [px, pz] of [[fx0, fz], [fx1, fz]]) R.box('metal', px - 0.05, pz - 0.05, px + 0.05, pz + 0.05, 0, 1.6, C(0x30343a));
    }
    for (const [x, z, yaw] of [[-10.3, 1.2, 0.8], [10.3, 1.2, -0.8], [0, 17.4, Math.PI]]) R.cams.push({ x: R.ox + x, y: R.oy + 6.0, z: R.oz + z, yaw, sweep: 0.9, range: 18, fov: 0.55 });
    ceilLights(R, [-7, 0, 7], [2.5, 6, 9.5, 13], 2.2, 0.35, 2.2); R.light(-6, 5.8, 3, 1.3); R.light(6, 5.8, 3, 1.3); R.light(-6, 5.8, 12, 1.2); R.light(6, 5.8, 12, 1.2);
    R.spot('guard', 0, 3, 0, { armed: true, patrol: [[-6, 3], [6, 3], [6, 12], [0, 14], [-6, 12]] }); R.spot('guard', 8, 14, 0, { armed: true, patrol: [[8, 14], [8, 5], [-3, 5], [-8, 13], [0, 11]] }); R.spot('guard', -9, 9, 0, { armed: true, patrol: [[-9, 9], [-9, 15], [3, 15], [3, 9]] });
    R.spot('customer', -2, 3.5, 0); R.spot('customer', 5, 8, 0);
  },
};
// ---- A gym (gym.js runs it): not a place to rob but to train. Reception and a membership desk by the door, a row of heavy bags and a tall kick bag, a
// dumbbell rack and a bench in front of a mirror wall, treadmills facing the windows, a boxing ring with two fighters sparring in it, lockers, and
// industrial lights and ducts under a high ceiling. The bags hang from pivots (R.bags) so a blow sets them swinging.
const bagMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.62, metalness: 0.0, envMapIntensity: 0.8 });
function heavyBag(R, x, z, o = {}) {
  const len = o.len ?? 1.15, r = o.r ?? 0.19, top = o.top ?? 2.75, col = o.col ?? 0x1c1c1e, g = new THREE.Group(); g.position.set(R.ox + x, R.oy + top, R.oz + z);
  const ch = top - (o.bottom ?? 0.62) - len;                                       // (the chain: from the beam down to a bag whose foot is at knee height)
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, ch, 6), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 1, roughness: 0.3 })); chain.position.y = -ch / 2; g.add(chain);
  for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 5), chain.material); st.position.set(s * r * 0.55, -ch - 0.12, 0); st.rotation.z = s * 0.45; g.add(st); }
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - 2 * r, 6, 20), bagMat(col)); body.position.y = -ch - 0.22 - len / 2 + 0.22; g.add(body);
  const y0 = -ch - len;                                                                // (the bag's foot, from the pivot)
  for (const t of [0.12, 0.88]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.05, 20), bagMat(o.band ?? 0xb0121a)); band.position.y = y0 + len * (1 - t); g.add(band); }
  const logo = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.012, r * 1.012, 0.16, 20, 1, true, -0.6, 1.2), bagMat(0xe8e2d0)); logo.position.y = y0 + len * 0.55; g.add(logo);
  g.traverse(m => { m.castShadow = true; });
  R.loose.push(g); const bag = { g, x: R.ox + x, z: R.oz + z, ax: 0, az: 0, vx: 0, vz: 0, k: o.stiff ?? 4.5 }; R.bags.push(bag);
  R.circs.push({ x: R.ox + x, z: R.oz + z, r: r + 0.05, y0: R.oy + top + y0, y1: R.oy + top - ch });
  return bag;
}
function standingBag(R, x, z) {                                       // a free-standing kick bag on a weighted base, rocking about its foot
  const g = new THREE.Group(); g.position.set(R.ox + x, R.oy + 0.0, R.oz + z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.32, 24), bagMat(0x151517)); base.position.y = 0.16; g.add(base);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.15, 6, 20), bagMat(0x7a1010)); body.position.y = 0.32 + 0.78; g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.08, 20), bagMat(0x111111)); band.position.y = 1.2; g.add(band);
  g.traverse(m => { m.castShadow = true; }); R.loose.push(g); const bag = { g, x: R.ox + x, z: R.oz + z, ax: 0, az: 0, vx: 0, vz: 0, k: 22, foot: true }; R.bags.push(bag);
  R.circs.push({ x: R.ox + x, z: R.oz + z, r: 0.38, y0: R.oy, y1: R.oy + 1.9 });
  return bag;
}
const dumbbell = (R, x, y, z, along, len = 0.34, r = 0.055, col = C(0x1e1f22)) => {
  const ax = along === 'x'; R.box('metal', ax ? x - len / 2 : x - 0.013, ax ? z - 0.013 : z - len / 2, ax ? x + len / 2 : x + 0.013, ax ? z + 0.013 : z + len / 2, y - 0.013, y + 0.013, C(0xa8adb3));
  for (const s of [-1, 1]) { const cx = ax ? x + s * (len / 2 - 0.05) : x, cz = ax ? z : z + s * (len / 2 - 0.05); R.drum('prop', cx, cz, r, y - r, y + r, col, false, 10); }
};
PLANS.gym = function (R, v, rnd) {
  R.bags = [];
  const W = 18, D = 16, H = 4.6, black = C(0x18181b), steel = C(0x8e959c), red = C(0xb0121a), yellow = C(0xf2c230);
  R.shell(W, D, H, { floor: C(0xffffff), wall: C(0xe4ddd4), trim: C(0x222226), ceil: C(0x55575c), floorS: 4 });
  // Reception: a long desk with a screen, the chain's colours behind it.
  R.slab('prop', -7.6, 1.3, -3.4, 2.1, 0, 1.1, black, C(0xd8d4cc));
  R.box('prop', -7.6, 1.25, -3.4, 1.3, 0.12, 1.0, yellow);
  R.box('prop', -6.0, 1.75, -5.4, 1.85, 1.1, 1.48, C(0x202226)); R.box('emit', -5.98, 1.73, -5.42, 1.75, 1.15, 1.44, C(0x5fb0ff).multiplyScalar(1.6));     // the membership screen
  R.box('wall', -W / 2, 3.4, -2.6, 3.6, 0, 2.6, C(0x141416), true); R.box('emit', -7.4, 3.38, -3.8, 3.4, 1.55, 2.25, C(0xf2c230).multiplyScalar(1.4));            // the back wall of reception, with the lit sign
  R.item({ id: 'desk', type: 'desk', x: -5.5, z: 1.15, y: 1.0, r: 2.0, label: 'MEMBERSHIP', dur: 0 });
  R.spot('staff', -5.2, 2.75, Math.PI);
  // Heavy bags, in a row on a steel beam.
  R.box('metal', -8.4, 12.3, -0.8, 12.5, H - 0.25, H - 0.05, steel);
  for (const [i, x] of [[0, -7.2], [1, -4.8], [2, -2.4]].map(([i, x]) => [i, x])) {
    heavyBag(R, x, 12.4, { top: H - 0.25, col: [0x1c1c1e, 0x5a1010, 0x1c1c1e][i] });
    R.item({ id: 'bag' + i, type: 'bag', x, z: 11.6, y: 1.3, r: 1.0, label: 'TRAIN: HEAVY BAG', dur: 0, face: 0, bag: R.bags.length - 1 });
  }
  R.spot('boxer', -2.4, 11.6, 0, { bag: 2 });
  // The kick bag.
  standingBag(R, -7.6, 8.2); R.item({ id: 'kick', type: 'kickbag', x: -7.6, z: 7.15, y: 1.2, r: 1.1, label: 'TRAIN: KICK BAG', dur: 0, face: 0, bag: R.bags.length - 1 });
  // Weights: a rack of dumbbells along the left wall, a mirror over it, a bench.
  R.box('metal', -8.95, 3.9, -8.35, 7.6, 0, 0.9, C(0x2a2c30), true);
  for (let k = 0; k < 9; k++) { const z = 4.15 + k * 0.4, r = 0.045 + k * 0.006; dumbbell(R, -8.65, 0.95, z, 'x', 0.32 + k * 0.01, r); dumbbell(R, -8.65, 0.5, z, 'x', 0.32 + k * 0.01, r); }
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.04, envMapIntensity: 1.4 })); m.position.set(R.ox - W / 2 + 0.03, R.oy + 2.0, R.oz + 5.75); m.rotation.y = Math.PI / 2; R.loose.push(m); }
  R.box('prop', -W / 2 + 0.01, 3.6, -W / 2 + 0.05, 7.9, 0.94, 3.08, C(0x1a1a1c));                                                      // the mirror's frame
  R.slab('prop', -6.6, 5.1, -6.2, 6.4, 0, 0.45, black, C(0x2a2a2e)); R.box('metal', -6.5, 5.0, -6.3, 5.15, 0, 0.42, steel);                // a bench
  R.item({ id: 'weights', type: 'weights', x: -7.5, z: 5.75, y: 1.0, r: 1.2, label: 'TRAIN: DUMBBELLS', dur: 0, face: -Math.PI / 2 });
  R.spot('lifter', -7.5, 7.0, -Math.PI / 2);
  // Treadmills along the front, facing the windows.
  for (let i = 0; i < 3; i++) {
    const x = 2.6 + i * 1.9, z0 = 1.0, z1 = 3.0;
    R.box('metal', x - 0.45, z0, x + 0.45, z1, 0, 0.12, C(0x2b2d31)); R.box('prop', x - 0.36, z0 + 0.15, x + 0.36, z1 - 0.1, 0.12, 0.135, C(0x101012));
    for (const s of [-1, 1]) R.box('metal', x + s * 0.42 - 0.03, z0 + 0.1, x + s * 0.42 + 0.03, z0 + 0.2, 0.12, 1.25, steel);
    R.box('prop', x - 0.45, z0 + 0.05, x + 0.45, z0 + 0.3, 1.2, 1.4, C(0x202226), true); R.box('emit', x - 0.2, z0 + 0.29, x + 0.2, z0 + 0.31, 1.25, 1.36, C(0x6ff0a0).multiplyScalar(1.3));
    R.item({ id: 'tread' + i, type: 'treadmill', x, z: 2.15, y: 1.0, r: 0.75, label: 'TRAIN: TREADMILL', dur: 0, face: Math.PI });
  }
  R.spot('runner', 6.4, 2.15, Math.PI, { tread: true });
  // The windows of the front wall (light comes in through them).
  for (const x of [2.0, 5.0, 8.0]) R.box('emit', x - 1.2, -0.02, x + 0.4, 0.0, 0.9, 3.4, C(0xd8ecff).multiplyScalar(1.8));
  // The boxing ring: a raised canvas, four corner posts, three ropes a side, steps.
  const rx0 = 2.4, rx1 = 8.2, rz0 = 8.4, rz1 = 14.2, rh = 0.62;
  R.slab('prop', rx0, rz0, rx1, rz1, 0, rh, C(0x16161a), C(0x2a4f8a), false);
  for (const [x0, z0, x1, z1] of [[rx0, rz0, rx1, rz0 + 0.2], [rx0, rz1 - 0.2, rx1, rz1], [rx0, rz0, rx0 + 0.2, rz1], [rx1 - 0.2, rz0, rx1, rz1]]) R.boxes.push({ x0: R.ox + x0, x1: R.ox + x1, z0: R.oz + z0, z1: R.oz + z1, y0: R.oy, y1: R.oy + rh + 1.4 });      // (the ropes keep you out, and the boxers in)
  R.decks = [{ x0: R.ox + rx0, x1: R.ox + rx1, z0: R.oz + rz0, z1: R.oz + rz1, h: rh }];
  R.box('prop', rx0 + 0.4, rz0 + 0.4, rx1 - 0.4, rz1 - 0.4, rh, rh + 0.006, C(0x3a64a8));
  const posts = [[rx0 + 0.15, rz0 + 0.15, red], [rx1 - 0.15, rz0 + 0.15, C(0xf0f0f0)], [rx1 - 0.15, rz1 - 0.15, C(0x1c4fb0)], [rx0 + 0.15, rz1 - 0.15, C(0xf0f0f0)]];
  for (const [x, z, c] of posts) { R.drum('metal', x, z, 0.06, rh, rh + 1.45, steel, false, 10); R.box('prop', x - 0.11, z - 0.11, x + 0.11, z + 0.11, rh + 0.25, rh + 1.35, c); }
  for (let k = 0; k < 3; k++) {
    const y = rh + 0.45 + k * 0.38, t = 0.025, c = [red, C(0xf0f0f0), C(0x1c4fb0)][k];
    R.box('prop', rx0 + 0.15, rz0 + 0.13, rx1 - 0.15, rz0 + 0.17, y - t, y + t, c); R.box('prop', rx0 + 0.15, rz1 - 0.17, rx1 - 0.15, rz1 - 0.13, y - t, y + t, c);
    R.box('prop', rx0 + 0.13, rz0 + 0.15, rx0 + 0.17, rz1 - 0.15, y - t, y + t, c); R.box('prop', rx1 - 0.17, rz0 + 0.15, rx1 - 0.13, rz1 - 0.15, y - t, y + t, c);
  }
  R.box('metal', rx0 - 0.6, rz0 + 1.0, rx0, rz0 + 1.8, 0, 0.3, steel); R.box('metal', rx0 - 0.3, rz0 + 1.0, rx0, rz0 + 1.8, 0.3, 0.5, steel);
  R.spot('sparA', 4.6, 11.3, Math.PI / 2, { ring: rh }); R.spot('sparB', 6.0, 11.3, -Math.PI / 2, { ring: rh });
  // Lockers along the back wall, benches, a water cooler, towels.
  for (let i = 0; i < 7; i++) { const x0 = -0.2 + i * 0.52; R.box('metal', x0, D - 0.5, x0 + 0.5, D - 0.02, 0, 1.95, i % 2 ? C(0x5f6871) : C(0x56606a), true); R.box('prop', x0 + 0.38, D - 0.52, x0 + 0.42, D - 0.5, 0.95, 1.12, C(0xd0d4d8)); for (let s = 0; s < 3; s++) R.box('prop', x0 + 0.08, D - 0.505, x0 + 0.42, D - 0.5, 1.6 + s * 0.06, 1.62 + s * 0.06, C(0x30363c)); }
  R.box('prop', 0.4, D - 1.5, 3.2, D - 1.15, 0, 0.45, C(0x6b4a32), true);
  R.box('prop', -0.2, 6.5, 0.25, 6.95, 0, 1.05, C(0xe8eaec), true); R.drum('prop', 0.02, 6.72, 0.14, 1.05, 1.42, C(0x9fd0ff), false, 12);
  for (let k = 0; k < 4; k++) R.box('prop', -0.15 + k * 0.08, 6.55, -0.1 + k * 0.08, 6.9, 0.2 + k * 0.012, 0.28 + k * 0.012, C(0xf4f2ec));
  // Posters of fighters' silhouettes and the chain's slogans.
  for (const [z, c1, c2] of [[9.5, 0xf2c230, 0x111111], [13.0, 0xb0121a, 0xf0f0f0]]) { R.box('prop', -W / 2 + 0.01, z, -W / 2 + 0.03, z + 1.4, 1.5, 3.3, C(c2)); R.box('prop', -W / 2 + 0.02, z + 0.08, -W / 2 + 0.04, z + 1.32, 1.58, 3.22, C(c1)); }
  for (const x of [-4, 2.5]) { R.box('prop', x, D - 0.04, x + 2.6, D - 0.01, 2.4, 3.2, C(0x111113)); R.box('emit', x + 0.15, D - 0.045, x + 2.45, D - 0.04, 2.6, 3.0, C(0xf2c230).multiplyScalar(1.2)); }
  // An industrial ceiling: ducts and long hanging lights.
  for (const z of [3.5, 8.5, 13]) { R.box('metal', -W / 2 + 0.3, z - 0.22, W / 2 - 0.3, z + 0.22, H - 0.55, H - 0.25, C(0x9aa2aa)); }
  for (const x of [-5.5, 0, 5.5]) for (const z of [2.5, 6.5, 10.5, 14]) { R.box('metal', x - 0.01, z - 0.01, x + 0.01, z + 0.01, H - 0.9, H, C(0x222222)); R.box('prop', x - 1.0, z - 0.1, x + 1.0, z + 0.1, H - 0.98, H - 0.9, C(0x2a2a2a)); R.panel(x, z, 1.9, 0.12, H - 0.98, C(0xfff7e8), 3.4); }
  R.light(-4.5, H - 1.2, 4, 1.25); R.light(4.5, H - 1.2, 4, 1.15); R.light(-4.5, H - 1.2, 12, 1.2); R.light(5.3, H - 1.2, 11.3, 1.3);
  R.gymRing = { x0: R.ox + rx0, x1: R.ox + rx1, z0: R.oz + rz0, z1: R.oz + rz1, h: rh };
};
// ---- A police station (jail.js runs it): the public lobby with the front desk behind glass, and behind a locked steel door the custody suite: a
// corridor and four cells, each with a steel bunk and a thin mattress, a steel toilet and basin, a small barred window high in the back wall and a
// caged light. You can walk into the lobby; you see the cells from the inside when you are arrested (stop.js), and the cell door and the custody door
// open on the morning you are let out. The windows (R.jail.win) and the cell lights (R.jail.lamp) are materials of their own, so the day can pass.
const moving = (R, x0, z0, x1, z1, y0, y1, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat); m.position.set(R.ox + (x0 + x1) / 2, R.oy + (y0 + y1) / 2, R.oz + (z0 + z1) / 2); m.castShadow = true; return m; };
PLANS.police = function (R, v, rnd) {
  const W = 16, D = 12.6, H = 3.2, CZ = 8.6, navy = C(0x1d2c4a), steel = C(0x8d949b), cream = C(0xe9e4d4), lower = C(0x7f93a8);
  R.shell(W, D, H, { floor: C(0xffffff), floorS: 3, wall: cream, trim: C(0x2a3346), ceil: C(0xb9bbbd) });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x8d949b, metalness: 0.9, roughness: 0.35, envMapIntensity: 1.1 });
  const J = R.jail = { win: new THREE.MeshBasicMaterial({ color: 0xcfe0ff }), lamp: new THREE.MeshBasicMaterial({ color: 0xffffff }), doors: {}, cell: null, tray: null };
  // Two-tone paint: the lower metre and a bit of every wall a darker blue-grey (the walls' own texture under both).
  R.box('wall', -W / 2, 0.01, -W / 2 + 0.012, D, 0, 1.25, lower); R.box('wall', W / 2 - 0.012, 0.01, W / 2, D, 0, 1.25, lower); R.box('wall', -W / 2, D - 0.012, W / 2, D, 0, 1.25, lower);
  // ---- The lobby: the front desk behind glass, a bench, a notice board, posters.
  R.slab('prop', -2.8, 3.3, 2.8, 4.1, 0, 1.08, navy, C(0xd8d4c8)); glassBox(R, -2.8, 3.62, 2.8, 3.7, 1.08, 2.35); R.box('metal', -2.85, 3.6, 2.85, 3.72, 2.35, 2.42, steel);
  R.box('metal', -0.35, 3.58, 0.35, 3.74, 1.08, 1.12, steel);                                                                    // (the slot under the glass)
  R.box('prop', -1.6, 3.95, -1.0, 4.05, 1.08, 1.45, C(0x1e2024)); R.box('emit', -1.58, 3.94, -1.02, 3.95, 1.12, 1.42, C(0x9fc8ff).multiplyScalar(1.2));      // a screen
  R.item({ id: 'desk', type: 'desk', x: 0, z: 2.75, y: 1.1, r: 1.7, label: 'FRONT DESK', dur: 0 });
  R.slab('prop', -7.65, 1.0, -7.05, 4.4, 0, 0.46, C(0x2b3a52), C(0x3a4a66));                                                       // the bench
  R.box('prop', -7.99, 1.3, -7.96, 3.9, 1.25, 2.3, C(0x8a6a3a)); for (let k = 0; k < 7; k++) { const z = 1.45 + k * 0.34 + rnd() * 0.05, y = 1.4 + (k % 2) * 0.42; R.box('prop', -7.96, z, -7.95, z + 0.22, y, y + 0.3, C(k % 3 ? 0xf2f0e8 : 0xf4e27a)); }
  for (let k = 0; k < 3; k++) { const z = 1.6 + k * 1.1; R.box('prop', 7.95, z, 7.99, z + 0.62, 1.35, 2.2, C(0xf4f1e6)); R.box('prop', 7.94, z + 0.08, 7.95, z + 0.54, 1.75, 2.1, C(0x3a3d44)); R.box('prop', 7.94, z + 0.06, 7.95, z + 0.56, 1.42, 1.52, C(0xb0121a)); }      // WANTED posters
  R.box('prop', -0.75, 5.5, 0.75, 5.55, 2.0, 2.85, navy); R.box('emit', -0.6, 5.48, 0.6, 5.5, 2.1, 2.75, C(0x6f9cff).multiplyScalar(1.1));                 // the force's crest, lit
  R.spot('sergeant', 0.6, 4.75, Math.PI); R.spot('visitor', -6.6, 3.0, -Math.PI / 2);
  // ---- The partition, and the custody door in it (locked: it opens when you are let out).
  R.box('wall', -W / 2, 5.6, 4.6, 5.85, 0, H, cream, true); R.box('wall', 5.8, 5.6, W / 2, 5.85, 0, H, cream, true); R.box('wall', 4.6, 5.6, 5.8, 5.85, 2.3, H, cream);
  R.box('wall', -W / 2, 5.585, 4.6, 5.6, 0, 1.25, lower); R.box('wall', -W / 2, 5.85, 4.6, 5.865, 0, 1.25, lower);
  { const g = new THREE.Group(); g.add(moving(R, 4.62, 5.66, 5.78, 5.8, 0, 2.28, steelMat)); const pane = moving(R, 5.0, 5.64, 5.4, 5.82, 1.4, 1.9, R.mats.glass); pane.castShadow = false; g.add(pane); R.loose.push(g);
    const box = { x0: R.ox + 4.6, x1: R.ox + 5.8, z0: R.oz + 5.6, z1: R.oz + 5.85, y0: R.oy, y1: R.oy + 2.3 }; R.boxes.push(box); J.doors.custody = { g, box, slide: [1.15, 0], open: 0 }; }
  R.box('prop', 6.0, 5.53, 6.18, 5.6, 1.2, 1.45, C(0x1e2024)); R.box('emit', 6.03, 5.52, 6.15, 5.53, 1.3, 1.4, C(0x5dff8a).multiplyScalar(1.6));         // the keypad
  // ---- The custody corridor and the four cells.
  for (const x of [-4, 0, 4]) { R.box('wall', x - 0.1, CZ, x + 0.1, D, 0, H, cream, true); for (const s of [-1, 1]) R.box('wall', x + s * 0.1 - (s < 0 ? 0.012 : 0), CZ, x + s * 0.1 + (s > 0 ? 0.012 : 0), D, 0, 1.25, lower); }
  for (let i = 0; i < 4; i++) {
    const x0 = -W / 2 + i * 4 + (i ? 0.1 : 0), x1 = -W / 2 + (i + 1) * 4 - (i < 3 ? 0.1 : 0), cx = (x0 + x1) / 2, mine = i === 1;
    // The bars: uprights every 13 cm, three flat bands across, a concrete lintel over them. In your cell, the door is a panel of bars of its own that slides.
    const dx0 = cx + 0.15, dx1 = cx + 1.25;
    for (let x = x0 + 0.08; x < x1 - 0.04; x += 0.13) { if (mine && x > dx0 - 0.02 && x < dx1 + 0.02) continue; R.box('metal', x - 0.016, CZ - 0.02, x + 0.016, CZ + 0.02, 0, 2.45, steel); }
    for (const y of [0.12, 1.1, 2.4]) { if (mine) { R.box('metal', x0, CZ - 0.04, dx0, CZ + 0.04, y - 0.03, y + 0.03, steel); R.box('metal', dx1, CZ - 0.04, x1, CZ + 0.04, y - 0.03, y + 0.03, steel); } else R.box('metal', x0, CZ - 0.04, x1, CZ + 0.04, y - 0.03, y + 0.03, steel); }
    R.box('wall', x0, CZ - 0.1, x1, CZ + 0.1, 2.45, H, cream);
    if (mine) {
      R.boxes.push({ x0: R.ox + x0, x1: R.ox + dx0, z0: R.oz + CZ - 0.05, z1: R.oz + CZ + 0.05, y0: R.oy, y1: R.oy + H }, { x0: R.ox + dx1, x1: R.ox + x1, z0: R.oz + CZ - 0.05, z1: R.oz + CZ + 0.05, y0: R.oy, y1: R.oy + H });
      const g = new THREE.Group(); for (let x = dx0 + 0.06; x < dx1 - 0.03; x += 0.13) g.add(moving(R, x - 0.016, CZ - 0.07, x + 0.016, CZ - 0.03, 0.02, 2.44, steelMat));
      for (const y of [0.12, 1.1, 2.4]) g.add(moving(R, dx0, CZ - 0.09, dx1, CZ - 0.03, y - 0.035, y + 0.035, steelMat));
      g.add(moving(R, dx1 - 0.16, CZ - 0.13, dx1 - 0.04, CZ - 0.07, 1.0, 1.2, steelMat));                                                                 // the lock
      R.loose.push(g); const box = { x0: R.ox + dx0, x1: R.ox + dx1, z0: R.oz + CZ - 0.1, z1: R.oz + CZ + 0.05, y0: R.oy, y1: R.oy + H }; R.boxes.push(box); J.doors.cell = { g, box, slide: [-1.05, 0], open: 0 };
      // The hatch in the bars where the food comes through, and the tray (put there at mealtimes).
      R.box('metal', dx1 + 0.05, CZ - 0.02, dx1 + 0.55, CZ + 0.32, 0.92, 0.96, steel);
      const tray = new THREE.Group(); tray.add(moving(R, dx1 + 0.08, CZ + 0.02, dx1 + 0.52, CZ + 0.3, 0.96, 0.985, new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 0.5, metalness: 0.4 })));
      for (const [ox, oz, c] of [[0.17, 0.1, 0xd9c48a], [0.36, 0.1, 0x8a5a2a], [0.27, 0.22, 0x4f8a3a]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 6).scale(1, 0.45, 1), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })); m.position.set(R.ox + dx1 + ox, R.oy + 1.0, R.oz + CZ + oz); tray.add(m); }
      tray.visible = false; R.loose.push(tray); J.tray = tray;
      // Tally marks scratched by whoever was here before: rows of four strokes and one across.
      for (let gI = 0; gI < 7; gI++) { const z = 9.4 + (gI % 4) * 0.42, y = 1.55 + Math.floor(gI / 4) * 0.32; for (let k = 0; k < 4; k++) R.box('prop', x0 + 0.002, z + k * 0.05, x0 + 0.006, z + k * 0.05 + 0.012, y, y + 0.2, C(0x55534c)); R.box('prop', x0 + 0.003, z - 0.03, x0 + 0.007, z + 0.21, y + 0.09, y + 0.11, C(0x55534c)); }
      J.cell = { x0: R.ox + x0, x1: R.ox + x1, z0: R.oz + CZ, z1: R.oz + D, cx: R.ox + cx, cz: R.oz + 10.6, door: { x: R.ox + (dx0 + dx1) / 2, z: R.oz + CZ } };
    } else R.boxes.push({ x0: R.ox + x0, x1: R.ox + x1, z0: R.oz + CZ - 0.05, z1: R.oz + CZ + 0.05, y0: R.oy, y1: R.oy + H });
    // The bunk: a steel shelf on the wall, a thin blue mattress, a grey blanket folded at the foot, a pillow.
    const bx0 = x0 + 0.06, bx1 = x0 + 0.84;
    R.slab('metal', bx0, 9.4, bx1, 11.5, 0.3, 0.44, steel, C(0x9aa0a8)); R.box('metal', bx0 + 0.05, 9.5, bx0 + 0.11, 11.4, 0, 0.3, steel);
    R.boxes.push({ x0: R.ox + bx0, x1: R.ox + bx1, z0: R.oz + 9.4, z1: R.oz + 11.5, y0: R.oy, y1: R.oy + 0.44 });
    R.box('prop', bx0 + 0.03, 9.45, bx1 - 0.03, 11.45, 0.44, 0.53, C(0x3d5a7a)); R.box('prop', bx0 + 0.05, 9.52, bx1 - 0.05, 9.92, 0.53, 0.6, C(0xe8e6de));
    R.box('prop', bx0 + 0.06, 10.95, bx1 - 0.06, 11.4, 0.53, 0.63, C(0x6b6e74));
    if (mine) R.item({ id: 'bunk', type: 'bunk', x: bx1 + 0.35, z: 10.45, y: 0.6, r: 1.2, label: 'SLEEP', dur: 0 });
    // The steel toilet and basin in the back corner.
    const tx = x1 - 0.42; R.box('metal', tx - 0.3, D - 0.42, tx + 0.3, D - 0.02, 0, 0.42, steel, true); R.drum('metal', tx, D - 0.62, 0.22, 0.22, 0.42, steel, false, 12);
    R.box('metal', tx - 0.3, D - 0.3, tx + 0.3, D - 0.02, 0.42, 1.0, steel); R.box('metal', tx - 0.22, D - 0.46, tx + 0.22, D - 0.3, 0.86, 0.95, steel); R.box('prop', tx - 0.03, D - 0.36, tx + 0.03, D - 0.3, 0.98, 1.05, C(0x30343a));
    // The window: a slot high in the back wall, three bars across it, the sky behind (its colour changes with the hour).
    const wx = cx - 0.3; { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), J.win); m.position.set(R.ox + wx, R.oy + 2.28, R.oz + D - 0.015); m.rotation.y = Math.PI; R.loose.push(m); }
    R.box('wall', wx - 0.36, D - 0.2, wx + 0.36, D, 2.06, 2.1, cream); R.box('wall', wx - 0.36, D - 0.2, wx + 0.36, D, 2.46, 2.5, cream); R.box('wall', wx - 0.36, D - 0.2, wx - 0.32, D, 2.06, 2.5, cream); R.box('wall', wx + 0.32, D - 0.2, wx + 0.36, D, 2.06, 2.5, cream);
    for (const k of [-0.16, 0, 0.16]) R.box('metal', wx + k - 0.012, D - 0.12, wx + k + 0.012, D - 0.09, 2.1, 2.46, steel);
    // The caged light in the middle of the ceiling.
    { const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.22), J.lamp); m.position.set(R.ox + cx, R.oy + H - 0.06, R.oz + 10.6); R.loose.push(m); }
    R.box('metal', cx - 0.25, 10.45, cx + 0.25, 10.75, H - 0.1, H - 0.08, steel); for (const k of [-0.2, 0, 0.2]) R.box('metal', cx + k - 0.006, 10.45, cx + k + 0.006, 10.75, H - 0.1, H, steel);
  }
  // The people: three others in the cells (pacing, shadow-boxing, standing at the bars), and a custody officer walking the corridor.
  R.spot('inmate', -6, 10.4, Math.PI, { act: 'pace', key: 'ped_m2' }); R.spot('inmate', 2.4, 10.2, Math.PI, { act: 'box', key: 'hoodie' }); R.spot('inmate', 6.2, 9.05, Math.PI, { act: 'bars', key: 'ped_m4' });
  R.spot('guard', -6.4, 7.25, Math.PI / 2, { patrol: [-6.4, 6.4] });
  // Lights: the lobby, the corridor (two), and your cell.
  for (const x of [-4.5, 0, 4.5]) R.panel(x, 2.4, 1.6, 0.3, H, C(0xfff6e8), 3); for (const x of [-5, 0, 5]) R.panel(x, 7.2, 1.2, 0.25, H, C(0xf2f6ff), 2.6);
  R.light(0, 2.8, 2.4, 1.1); R.light(-4, 2.9, 7.2, 0.75); R.light(4, 2.9, 7.2, 0.75, 0xeef2ff); R.light(-2, 2.9, 10.6, 0.7);
};
export function planFor(kind) {
  const f = PLANS[kind];
  return (R, v) => { const s = (v.seed ?? 1) >>> 0; let a = s + 0x6D2B79F5; const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; f(R, v, rnd); };
}
