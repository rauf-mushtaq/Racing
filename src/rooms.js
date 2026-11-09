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
    R.spot('clerk', 2.8, 3.2, 0); R.spot('customer', -2.1, 4.2, 0, { aisle: true });
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
    R.spot('clerk', 4.6, 3.3, 0); R.spot('customer', -3.7, 4.6, 0, { aisle: true }); R.spot('customer', -0.9, 3.4, 0, { aisle: true });
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
    R.spot('owner', 0, 8.6, 0); R.spot('guard', 3.3, 1.9, -0.6, { armed: true, post: true }); R.spot('customer', -1, 5.2, 0);
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
    R.spot('teller', -5, 8.1, 0); R.spot('teller', 0, 8.1, 0); R.spot('teller', 5, 8.1, 0); R.spot('manager', -6.6, 10.6, 0, { key: true });
    R.spot('guard', -3.6, 1.9, 0, { armed: true, post: true }); R.spot('guard', 6.0, 4.4, 3.1, { armed: true, post: true }); R.spot('customer', -1.5, 3.0, 0); R.spot('customer', 3.2, 4.2, 0);
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
export function planFor(kind) {
  const f = PLANS[kind];
  return (R, v) => { const s = (v.seed ?? 1) >>> 0; let a = s + 0x6D2B79F5; const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; f(R, v, rnd); };
}
