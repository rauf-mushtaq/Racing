// The plans of the rooms (see interior.js): a petrol station's shop, a convenience store, a jeweller, a bank and a museum. Each fills in a Room with
// walls, furniture, the things to steal (`item`s), where the staff and customers stand (`spot`s), and, for the harder places, cameras and laser beams.
// The harder the place, the more there is to get past: see VENUES in venues.js for what each is worth.
import * as THREE from 'three';
import { C, leafGeom, plant, plantMesh, LEAF_GREENS } from './interior.js';
export { leafGeom, plant, plantMesh, LEAF_GREENS };
import { mergeGeoms } from './geom.js';
import { VISIT_PLANS } from './rooms-visit.js';

export const glassBox = (R, x0, z0, x1, z1, y0, y1) => {
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
// The gym's equipment (see PLANS.gym below).
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
// Round things for the weights (a barbell or a dumbbell bar with its plates, a plate on its own), as loose meshes: the box builder only makes boxes and upright drums.
const ironMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.55, metalness: 0.35 }), chromeMat = new THREE.MeshStandardMaterial({ color: 0xb8bec4, roughness: 0.25, metalness: 1 }), bumperMats = [0xb0121a, 0x1c4fb0, 0xe2b923, 0x2f8a3c].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
export function barbell(R, x, y, z, along = 'x', len = 2.2, plates = [0.225, 0.2], col = null) {
  const g = new THREE.Group(); g.position.set(R.ox + x, R.oy + y, R.oz + z); if (along === 'z') g.rotation.y = Math.PI / 2;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len, 8).rotateZ(Math.PI / 2), chromeMat); g.add(bar);
  for (const s of [-1, 1]) {
    let o = len / 2 - 0.42;
    plates.forEach((r, k) => { const th = r > 0.2 ? 0.055 : 0.035, m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, th, 24).rotateZ(Math.PI / 2), col != null ? bumperMats[(col + k) % 4] : ironMat); m.position.x = s * (o + th / 2); g.add(m); o += th + 0.004; });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10).rotateZ(Math.PI / 2), chromeMat); collar.position.x = s * (o + 0.03); g.add(collar);
  }
  g.traverse(m => { m.castShadow = true; }); R.loose.push(g); return g;
}
function plate(R, x, y, z, r, yaw = 0, col = null) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 24).rotateZ(Math.PI / 2), col != null ? bumperMats[col % 4] : ironMat); m.position.set(R.ox + x, R.oy + y, R.oz + z); m.rotation.y = yaw; m.castShadow = true; R.loose.push(m); }
// Kit that faces one way: `u` runs across it and `w` the way its user faces, from its middle (cx, cz), turned to face f (0: +z, PI/2: +x, PI: -z,
// -PI/2: -x). Boxes and drums in those terms, put into the room the right way round.
export function kit(R, cx, cz, f) {
  const c = Math.round(Math.cos(f)), s = Math.round(Math.sin(f)), P = (u, w) => [cx + u * c + w * s, cz - u * s + w * c];
  const rect = (u0, w0, u1, w1) => { const [ax, az] = P(u0, w0), [bx, bz] = P(u1, w1); return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)]; };
  return {
    R, P, f, box: (kind, u0, w0, u1, w1, y0, y1, col, solid = false) => { const [x0, z0, x1, z1] = rect(u0, w0, u1, w1); R.box(kind, x0, z0, x1, z1, y0, y1, col, solid); },
    drum: (kind, u, w, r, y0, y1, col, solid = false, n = 14) => { const [x, z] = P(u, w); R.drum(kind, x, z, r, y0, y1, col, solid, n); },
    // A wheel standing upright in the w-y plane (a flywheel, a rower's fan): a loose mesh.
    wheel: (u, w, y, r, th, mat) => { const [x, z] = P(u, w), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, th, 28).rotateZ(Math.PI / 2), mat); m.position.set(R.ox + x, R.oy + R.lift + y, R.oz + z); m.rotation.y = f; m.castShadow = true; R.loose.push(m); return m; },
  };
}
const GRAPH = C(0x2a2d32), SILVER = C(0xc6cbd0), BLACK = C(0x141517), UPH = C(0x1c1d21), ACC = C(0xf2c230), CHROME = new THREE.MeshStandardMaterial({ color: 0xc8ced4, roughness: 0.18, metalness: 1 }), DARKM = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.4, metalness: 0.6 });
const PLATEM = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.5, metalness: 0.3 }), UPHM = new THREE.MeshStandardMaterial({ color: 0x1c1d21, roughness: 0.7 }), SILVERM = new THREE.MeshStandardMaterial({ color: 0xc6cbd0, roughness: 0.3, metalness: 0.9 });
const rep = p => 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
// A loose box (a part that moves: a stack's top plates, a rower's seat, a leg press's foot plate), in a kit's terms.
function looseBox(K, u0, w0, u1, w1, y0, y1, mat) {
  const R = K.R, [ax, az] = K.P(u0, w0), [bx, bz] = K.P(u1, w1), m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(bx - ax), y1 - y0, Math.abs(bz - az)), mat);
  m.position.set(R.ox + (ax + bx) / 2, R.oy + R.lift + (y0 + y1) / 2, R.oz + (az + bz) / 2); m.castShadow = true; R.loose.push(m); return m;
}
// Where a person's hands are, and the point between them.
const _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3();
function handsMid(w, out) { if (!w.person) return null; w.person.worldPos('Bip01_L_Hand', _h1); w.person.worldPos('Bip01_R_Hand', _h2); return out.copy(_h1).add(_h2).multiplyScalar(0.5); }
const _mid = new THREE.Vector3();
// A weight stack: a column of black plates on two guide rods between side shrouds, a header across the top, a yellow stripe on each shroud. The top four
// plates are a loose piece: lifted while the machine is worked (returned for the item's anim).
function stack(K, u0, u1, w0, w1, h) {
  K.box('metal', u0, w0, u1, w1, 0, 0.06, GRAPH, true);
  for (const u of [u0, u1 - 0.045]) { K.box('prop', u, w0, u + 0.045, w1, 0.06, h, GRAPH); K.box('prop', u - 0.002, w0 + 0.03, u + 0.047, w1 - 0.03, h - 0.42, h - 0.36, ACC); }
  K.box('prop', u0, w0, u1, w1, h, h + 0.07, GRAPH);
  for (let k = 0; k < 10; k++) K.box('prop', u0 + 0.07, w0 + 0.04, u1 - 0.07, w1 - 0.04, 0.1 + k * 0.05, 0.144 + k * 0.05, BLACK);
  const um = (u0 + u1) / 2, wm = (w0 + w1) / 2; for (const d of [-0.09, 0.09]) K.box('metal', um + d - 0.009, wm - 0.009, um + d + 0.009, wm + 0.009, 0.1, h, SILVER);
  return looseBox(K, u0 + 0.07, w0 + 0.04, u1 - 0.07, w1 - 0.04, 0.6, 0.8 - 0.006, PLATEM);
}
const lifts = (m, k = 0.3) => { const y0 = m.position.y; return { anim: (w, ex) => { m.position.y = y0 + rep(ex.p) * k; }, reset: () => { m.position.y = y0; } }; };
// A selectorised machine (chest press, shoulder press, lat pulldown, seated row, pec fly, leg extension, leg curl): a stack, a silver frame, a padded seat
// and back, and the arms, bar or pads of its exercise. Returns where its user sits (the walker's place), how high the seat is, and the stack's moving plates.
const MACHINE = { chest: ['CHEST PRESS', -0.18, 0.55], shoulder: ['SHOULDER PRESS', -0.18, 0.55], lat: ['LAT PULLDOWN', -0.2, 0.55], row: ['SEATED ROW', -0.42, 0.55], pec: ['PEC FLY', -0.18, 0.55], legext: ['LEG EXTENSION', -0.15, 0.59], legcurl: ['LEG CURL', -0.15, 0.59] };
function machine(R, cx, cz, f, kind) {
  const K = kit(R, cx, cz, f), front = kind === 'lat' || kind === 'row', sw = front ? 1 : -1, ws = sw * 0.95, wi = sw * 0.68;
  K.box('metal', -0.42, -0.95, 0.42, 0.95, 0, 0.04, GRAPH);
  const top = stack(K, -0.3, 0.3, Math.min(ws, wi), Math.max(ws, wi), 2.05);
  const post = (w, y) => K.box('metal', -0.035, w - 0.035, 0.035, w + 0.035, 0.04, y, SILVER), seat = (w0, w1, y) => { post((w0 + w1) / 2, y); K.box('prop', -0.22, w0, 0.22, w1, y, y + 0.09, UPH); };
  const back = (w, y0, y1) => { K.box('metal', -0.03, w - 0.12, 0.03, w - 0.06, 0.4, y1 - 0.1, SILVER); K.box('prop', -0.2, w - 0.08, 0.2, w, y0, y1, UPH); };
  const arm = (u, w0, w1, y) => K.box('metal', u - 0.025, Math.min(w0, w1), u + 0.025, Math.max(w0, w1), y - 0.025, y + 0.025, SILVER), grip = (u, w, y) => K.box('prop', u - 0.022, w - 0.022, u + 0.022, w + 0.022, y - 0.13, y + 0.13, BLACK);
  K.box('metal', -0.04, sw * 0.62, 0.04, sw * 0.68, 0.04, 2.05, SILVER);                                            // the upright by the stack
  if (kind === 'chest' || kind === 'shoulder') {
    const y = kind === 'chest' ? 1.05 : 1.45, w = kind === 'chest' ? 0.32 : 0.12;
    seat(-0.32, 0.06, 0.46); back(-0.34, 0.58, 1.35);
    K.box('metal', -0.45, -0.62, 0.45, -0.56, 1.75, 1.82, SILVER);
    for (const s of [-1, 1]) { K.box('metal', s * 0.42 - 0.025, -0.62, s * 0.42 + 0.025, -0.56, 0.04, 1.8, SILVER); arm(s * 0.38, -0.56, w, y); grip(s * 0.38, w, y); }
  } else if (kind === 'lat') {
    seat(-0.35, -0.02, 0.46); K.box('prop', -0.2, 0.0, 0.2, 0.12, 0.72, 0.82, UPH); post(0.06, 0.72);
    K.box('metal', -0.04, -0.2, 0.04, 0.68, 2.2, 2.28, SILVER); K.box('prop', -0.004, -0.12, 0.004, -0.112, 1.72, 2.2, BLACK);
    K.box('metal', -0.62, -0.15, 0.62, -0.11, 1.68, 1.72, SILVER); for (const s of [-1, 1]) grip(s * 0.55, -0.13, 1.7);
  } else if (kind === 'row') {
    seat(-0.55, -0.2, 0.46); K.box('prop', -0.18, 0.22, 0.18, 0.32, 0.8, 1.25, UPH); post(0.3, 0.8);
    for (const s of [-1, 1]) { arm(s * 0.3, 0.1, 0.62, 1.0); grip(s * 0.3, 0.1, 1.0); }
    K.box('prop', -0.25, 0.08, 0.25, 0.14, 0.15, 0.45, GRAPH);                                                            // the foot plate
  } else if (kind === 'pec') {
    seat(-0.32, 0.06, 0.46); back(-0.34, 0.58, 1.4); K.box('metal', -0.5, -0.62, 0.5, -0.56, 1.75, 1.82, SILVER);
    for (const s of [-1, 1]) { K.box('metal', s * 0.47 - 0.025, -0.62, s * 0.47 + 0.025, -0.56, 0.04, 1.8, SILVER); arm(s * 0.47, -0.56, -0.05, 1.15); K.box('prop', s * 0.47 - 0.04, -0.07, s * 0.47 + 0.04, 0.0, 0.85, 1.4, UPH); }
  } else if (kind === 'legext' || kind === 'legcurl') {
    seat(-0.3, 0.12, 0.5); back(-0.32, 0.6, 1.3);
    K.box('prop', -0.25, 0.2, 0.25, 0.3, kind === 'legext' ? 0.22 : 0.62, kind === 'legext' ? 0.32 : 0.72, UPH);                       // the roller pad
    arm(0.28, -0.6, 0.25, 0.5); K.box('metal', 0.26, 0.22, 0.3, 0.28, 0.22, 0.72, SILVER);
    for (const s of [-1, 1]) grip(s * 0.3, -0.05, 0.62);
  }
  const [name, ow, seatY] = MACHINE[kind], at = K.P(0, ow);
  return { K, x: at[0], z: at[1], f, seat: seatY, name, ...lifts(top) };
}
// Cardio, each facing f: a treadmill, a cross trainer, a spin bike (or an upright bike), a stair climber, a rowing machine. Each returns where its user
// stands or sits, and an anim for whatever turns or slides on it.
function treadmill(R, cx, cz, f) {
  const K = kit(R, cx, cz, f);
  K.box('metal', -0.46, -1.0, 0.46, 1.0, 0, 0.14, GRAPH); K.box('prop', -0.37, -0.95, 0.37, 0.72, 0.14, 0.152, BLACK);          // (not solid: you step onto it)
  K.box('prop', -0.46, 0.72, 0.46, 1.02, 0.14, 0.32, C(0x3a3e44));                                                         // the motor hood
  for (const s of [-1, 1]) { K.box('metal', s * 0.43 - 0.03, 0.82, s * 0.43 + 0.03, 0.92, 0.3, 1.28, SILVER); K.box('metal', s * 0.43 - 0.022, 0.3, s * 0.43 + 0.022, 0.92, 1.0, 1.04, SILVER); }
  K.box('prop', -0.46, 0.8, 0.46, 1.0, 1.24, 1.5, C(0x1d1f23)); K.box('emit', -0.24, 0.79, 0.24, 0.8, 1.29, 1.46, C(0x5fb6ff).multiplyScalar(1.5));
  K.box('prop', -0.46, 0.79, -0.3, 0.8, 1.27, 1.48, ACC);
  const at = K.P(0, -0.15); return { x: at[0], z: at[1], f };
}
const spins = (m, rate) => { const r0 = m.rotation.x; return { anim: (w, ex) => { m.rotation.x = r0 + ex.p * Math.PI * 2 * rate; }, reset: () => {} }; };
function crossTrainer(R, cx, cz, f) {
  const K = kit(R, cx, cz, f);
  K.box('metal', -0.1, -0.9, 0.1, 0.95, 0, 0.1, GRAPH); K.box('metal', -0.32, -0.95, 0.32, -0.85, 0, 0.08, GRAPH);                 // (not solid: you step onto it)
  K.box('prop', -0.18, 0.55, 0.18, 0.98, 0.1, 0.72, C(0x34373c));                                                          // the flywheel housing
  const wheel = K.wheel(0.19, 0.76, 0.42, 0.24, 0.02, DARKM); wheel.rotation.order = 'YXZ';
  for (const [s, w] of [[-1, 0.42], [1, 0.36]]) { K.box('metal', s * 0.3 - 0.02, w - 0.02, s * 0.3 + 0.02, w + 0.02, 0.5, 1.72, SILVER); K.box('prop', s * 0.3 - 0.028, w - 0.028, s * 0.3 + 0.028, w + 0.028, 1.2, 1.6, BLACK); }
  K.box('metal', -0.03, 0.62, 0.03, 0.7, 0.72, 1.35, SILVER); K.box('prop', -0.22, 0.6, 0.22, 0.74, 1.32, 1.5, C(0x1d1f23)); K.box('emit', -0.15, 0.59, 0.15, 0.6, 1.36, 1.47, C(0x5fb6ff).multiplyScalar(1.4));
  const at = K.P(0, -0.05); return { x: at[0], z: at[1], f, ...spins(wheel, 2) };
}
function spinBike(R, cx, cz, f, upright = false) {
  const K = kit(R, cx, cz, f);
  for (const w of [-0.5, 0.5]) K.box('metal', -0.28, w - 0.05, 0.28, w + 0.05, 0, 0.07, GRAPH, w > 0);
  K.box('metal', -0.04, -0.5, 0.04, 0.5, 0.07, 0.16, GRAPH);
  K.box('metal', -0.035, -0.3, 0.035, -0.22, 0.1, 0.82, GRAPH); K.box('prop', -0.09, -0.42, 0.09, -0.12, 0.82, 0.88, BLACK);           // the seat post and the saddle
  const by = upright ? 1.18 : 1.06; K.box('metal', -0.035, 0.24, 0.035, 0.32, 0.1, by, GRAPH); K.box('metal', -0.26, 0.26, 0.26, 0.34, by, by + 0.04, SILVER);   // the bars
  for (const s of [-1, 1]) K.box('metal', s * 0.24 - 0.02, 0.34, s * 0.24 + 0.02, 0.5, by + 0.02, by + 0.06, SILVER);
  const wheel = K.wheel(0, 0.32, 0.4, 0.25, 0.05, CHROME); wheel.rotation.order = 'YXZ'; K.box('prop', -0.035, 0.05, 0.035, 0.6, 0.66, 0.72, C(0xb0121a));   // the flywheel, and the guard over it
  if (upright) { K.box('prop', -0.2, 0.3, 0.2, 0.46, by - 0.1, by + 0.18, C(0x1d1f23)); K.box('emit', -0.14, 0.29, 0.14, 0.3, by - 0.04, by + 0.12, C(0x5fb6ff).multiplyScalar(1.4)); }
  const at = K.P(0, -0.27); return { x: at[0], z: at[1], f, seat: 0.86, bar: by + 0.02, ...spins(wheel, 1) };
}
function climber(R, cx, cz, f) {
  const K = kit(R, cx, cz, f);
  K.box('metal', -0.48, -0.75, 0.48, 0.75, 0, 0.18, GRAPH);
  for (let i = 0; i < 6; i++) K.box('prop', -0.34, -0.55 + i * 0.17, 0.34, -0.36 + i * 0.17, 0.18 + i * 0.19, 0.22 + i * 0.19, BLACK);
  for (const s of [-1, 1]) { K.box('prop', s * 0.44 - 0.04, -0.75, s * 0.44 + 0.04, 0.75, 0.18, 0.9, C(0x34373c)); K.box('metal', s * 0.44 - 0.025, -0.6, s * 0.44 + 0.025, 0.7, 1.15, 1.2, SILVER); K.box('metal', s * 0.44 - 0.025, 0.6, s * 0.44 + 0.025, 0.7, 0.18, 1.2, SILVER); }
  K.box('prop', -0.3, 0.6, 0.3, 0.75, 1.3, 1.6, C(0x1d1f23)); K.box('emit', -0.2, 0.59, 0.2, 0.6, 1.35, 1.55, C(0x5fb6ff).multiplyScalar(1.4));
  const at = K.P(0, -0.18); return { x: at[0], z: at[1], f };
}
function rower(R, cx, cz, f) {
  const K = kit(R, cx, cz, f);
  K.box('metal', -0.05, -1.2, 0.05, 0.9, 0.22, 0.3, SILVER); for (const w of [-1.15, 0.85]) K.box('metal', -0.25, w - 0.05, 0.25, w + 0.05, 0, 0.22, GRAPH);
  K.box('prop', -0.2, 0.42, 0.2, 0.62, 0.3, 0.5, C(0x2a2c30));                                                                        // the foot stretcher
  K.box('prop', -0.2, 0.92, 0.2, 1.3, 0.05, 0.75, C(0x2a2d32)); const fan = K.wheel(0, 1.1, 0.42, 0.3, 0.3, DARKM); fan.rotation.order = 'YXZ';   // the fan housing
  K.box('metal', -0.03, 0.9, 0.03, 0.97, 0.6, 1.05, SILVER); K.box('prop', -0.12, 0.88, 0.12, 0.98, 1.02, 1.18, C(0x1d1f23));
  const seat = looseBox(K, -0.17, -0.13, 0.17, 0.13, 0.31, 0.38, UPHM), handle = looseBox(K, -0.26, 0.82, 0.26, 0.86, 0.68, 0.71, SILVERM);
  const s0 = seat.position.clone(), h0 = handle.position.clone(), fw = new THREE.Vector3(Math.sin(f), 0, Math.cos(f));
  const at = K.P(0, 0.0);
  return { x: at[0], z: at[1], f, seat: 0.38, anim: (w, ex) => { seat.position.copy(s0).addScaledVector(fw, ex.dz || 0); if (handsMid(w, _mid)) handle.position.copy(_mid); fan.rotation.x += 0.05 + rep(ex.p) * 0.12; }, reset: () => { seat.position.copy(s0); handle.position.copy(h0); } };
}
// A Smith machine: two uprights with the bar on rails between them (the bar slides up and down them), a bench under it.
function smith(R, cx, cz, f) {
  const K = kit(R, cx, cz, f);
  K.box('metal', -1.1, -0.7, 1.1, 0.7, 0, 0.05, GRAPH);
  for (const u of [-1.0, 1.0]) for (const w of [-0.55, 0.55]) K.box('metal', u - 0.05, w - 0.05, u + 0.05, w + 0.05, 0.05, 2.3, GRAPH, true);
  for (const u of [-1.0, 1.0]) { K.box('metal', u - 0.05, -0.55, u + 0.05, 0.55, 2.25, 2.33, GRAPH); K.box('metal', u - 0.012, -0.012, u + 0.012, 0.012, 0.05, 2.25, SILVER); }
  const bar = new THREE.Group(), rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 2.2, 8).rotateZ(Math.PI / 2), CHROME); bar.add(rod);
  for (const s of [-1, 1]) { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.08), PLATEM); sl.position.x = s * 1.0; bar.add(sl); for (let k = 0; k < 2; k++) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.225 - k * 0.03, 0.225 - k * 0.03, 0.05, 24).rotateZ(Math.PI / 2), PLATEM); pl.position.x = s * (0.78 - k * 0.06); bar.add(pl); } }
  bar.position.set(R.ox + cx, R.oy + R.lift + 1.33, R.oz + cz); bar.rotation.y = f; bar.traverse(m => { m.castShadow = true; }); R.loose.push(bar);
  const y0 = bar.position.y, at = K.P(0, 0.12);
  return { x: at[0], z: at[1], f: f + Math.PI, anim: (w) => { if (handsMid(w, _mid)) bar.position.y = _mid.y; }, reset: () => { bar.position.y = y0; } };
}
// A barbell that a lifter takes off its hooks: it follows the hands while it is in use, and goes back after.
const carried = g => { const p0 = g.position.clone(); return { anim: (w) => { if (handsMid(w, _mid)) g.position.copy(_mid); }, reset: () => { g.position.copy(p0); } }; };
// A rig for functional training: uprights and beams, pull-up bars, rings on straps, a ladder of J-hooks.
function rig(R, x0, z0, x1, z1, H) {
  const posts = []; for (const x of [x0, (x0 + x1) / 2, x1]) for (const z of [z0, z1]) posts.push([x, z]);
  for (const [x, z] of posts) { R.box('metal', x - 0.045, z - 0.045, x + 0.045, z + 0.045, 0, H, GRAPH, true); for (let k = 0; k < 14; k++) R.box('prop', x - 0.047, z - 0.047, x + 0.047, z + 0.047, 0.4 + k * 0.14, 0.41 + k * 0.14, SILVER); }
  for (const z of [z0, z1]) R.box('metal', x0, z - 0.045, x1, z + 0.045, H - 0.09, H, GRAPH);
  for (const x of [x0, (x0 + x1) / 2, x1]) R.box('metal', x - 0.045, z0, x + 0.045, z1, H - 0.09, H, GRAPH);
  for (const z of [z0 + 0.35, z1 - 0.35]) R.box('metal', x0, z - 0.016, x1, z + 0.016, H - 0.32, H - 0.29, SILVER);                        // pull-up bars
  for (const x of [x0 + 0.6, x0 + 1.0]) { R.box('prop', x - 0.015, (z0 + z1) / 2 - 0.004, x + 0.015, (z0 + z1) / 2 + 0.004, H - 1.3, H - 0.09, C(0xb0121a)); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 8, 20), new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.5 })); ring.position.set(R.ox + x, R.oy + H - 1.42, R.oz + (z0 + z1) / 2); ring.rotation.y = Math.PI / 2; ring.castShadow = true; R.loose.push(ring); }
  return H - 0.305;                                                                                                                        // (how high the pull-up bars are)
}
// Battle ropes: two heavy ropes from an anchor, lying along the floor; in use they leave the floor in the hands and travel in waves to the anchor.
function ropes(R, ax, az, len) {
  const N = 28, mat = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.85, side: THREE.DoubleSide }), list = [];
  for (const s of [-1, 1]) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array((N + 1) * 2 * 3), idx = []; for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.castShadow = true; R.loose.push(m); list.push({ m, g, pos, s });
  }
  const A = new THREE.Vector3(R.ox + ax, R.oy + 0.3, R.oz + az), tmp = new THREE.Vector3(), lay = (r, end, t, amp, ph) => {
    for (let i = 0; i <= N; i++) {
      const k = i / N, x = end.x + (A.x - end.x) * k, z = end.z + (A.z - end.z) * k, y = end.y + (A.y - end.y) * k + (amp ? Math.sin(k * 9 - t * 14 + ph) * amp * (1 - k) * Math.min(1, k * 6) : 0);
      const dx = A.x - end.x, dz = A.z - end.z, l = Math.hypot(dx, dz) || 1, ox = -dz / l * 0.024, oz = dx / l * 0.024;
      r.pos.set([x + ox, Math.max(R.oy + 0.02, y), z + oz, x - ox, Math.max(R.oy + 0.02, y), z - oz], i * 6);
    }
    r.g.attributes.position.needsUpdate = true; r.g.computeVertexNormals(); r.g.computeBoundingSphere();
  };
  const rest = () => { for (const r of list) lay(r, tmp.set(R.ox + ax + r.s * 0.22, R.oy + 0.03, R.oz + az + len), 0, 0, 0); };
  rest(); A.y = R.oy + 0.3;
  return { anim: (w, ex) => { for (const r of list) { if (!w.person) continue; w.person.worldPos(r.s < 0 ? 'Bip01_R_Hand' : 'Bip01_L_Hand', tmp); lay(r, tmp, ex.t || 0, 0.16, r.s < 0 ? 0 : Math.PI); } }, reset: rest };
}
// A kettlebell on the floor by the rack: it goes into the hands for a swing.
function kettlebell(R, x, z) {
  const g = new THREE.Group(), bell = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), PLATEM), handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14, Math.PI), PLATEM);
  bell.position.y = -0.14; handle.position.y = -0.04; g.add(bell, handle); g.position.set(R.ox + x, R.oy + 0.25, R.oz + z); g.traverse(m => { m.castShadow = true; }); R.loose.push(g);
  const p0 = g.position.clone(); return { anim: (w) => { if (handsMid(w, _mid)) g.position.copy(_mid); }, reset: () => { g.position.copy(p0); } };
}
// The sled on the turf: pushed along the track (it moves with whoever pushes it).
function sled(R, x, z) {
  const g = new THREE.Group(), frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.8), DARKM); frame.position.y = 0.06; g.add(frame);
  for (const s of [-1, 1]) { const pole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), DARKM); pole.position.set(s * 0.32, 0.6, -0.36); pole.rotation.x = -0.25; g.add(pole); const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8).rotateZ(Math.PI / 2), CHROME); bar.position.set(s * 0.38, 1.1, -0.5); g.add(bar); }
  for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.225 - k * 0.012, 0.225 - k * 0.012, 0.05, 24), bumperMats[k % 4]); p.position.y = 0.14 + k * 0.055; g.add(p); }
  g.position.set(R.ox + x, R.oy, R.oz + z); g.traverse(m => { m.castShadow = true; }); R.loose.push(g);
  const p0 = g.position.clone(), r0 = g.rotation.y;
  return { group: g, anim: (w) => { g.position.set(w.x + Math.sin(w.h) * 0.95, R.oy, w.z + Math.cos(w.h) * 0.95); g.rotation.y = w.h; }, reset: () => { g.position.copy(p0); g.rotation.y = r0; } };
}
// ---- A gym (gym.js runs it): not a place to rob but to train, and an Iron City health club on a big scale: a hall 52 m by 40 under a dark ceiling eight
// high, crossed by lines of LED light, with a gallery over the front at 4 m (a stair up to it). Under the gallery, reception and a café; on it a spin studio
// behind glass and a balcony of cardio machines looking over the hall (treadmills, cross trainers, stair climbers, upright bikes, rowers). On the floor:
// free weights on black rubber in front of a mirror wall (dumbbells, three squat racks on platforms, two bench presses, a Smith machine, kettlebells), two
// rows of selectorised machines (chest press, shoulder press, lat pulldown, seated row, pec fly, leg extension, leg curl, two leg presses) and a cable
// crossover; a turf track with a sled, a rig for pull-ups, battle ropes, boxes; the heavy bags and kick bags; a boxing ring under a square of light; a
// karate studio behind glass. EVERY machine can be used (gym.js): each is an item with the exercise it is for (person.js exercisePose) and an anim for
// what moves on it (a stack's plates, a bar, a flywheel, a seat, the sled, the ropes). The bags hang from pivots (R.bags), so a blow sets them swinging.
PLANS.gym = function (R, v, rnd) {
  R.bags = [];
  const W = 52, D = 40, H = 8, M = 4.0, black = C(0x18181b), steel = C(0x8e959c), dark = C(0x232428), red = C(0xb0121a), blue = C(0x1c4fb0), white = C(0xf2f0ec), oak = C(0xffffff), stone = C(0xeeebe4);
  R.shell(W, D, H, { floor: C(0xffffff), wall: C(0xf1eee8), trim: C(0x2a2c30), ceil: C(0x3a3c41), floorS: 4 });
  const lineX = (x0, x1, z, col, w = 0.05) => R.box('prop', x0, z - w / 2, x1, z + w / 2, 0.012, 0.016, col), lineZ = (x, z0, z1, col, w = 0.05) => R.box('prop', x - w / 2, z0, x + w / 2, z1, 0.012, 0.016, col);
  const counter = (x0, z0, x1, z1, h) => { R.box('wood', x0, z0, x1, z1, 0, h - 0.05, oak, true); R.box('prop', x0 - 0.04, z0 - 0.04, x1 + 0.04, z1 + 0.04, h - 0.05, h, stone); };
  // Items: every machine is something to use. ex: the exercise; stat: what it builds ('str', 'sta' or 'both'); the rest is where and how.
  const use = (id, ex, stat, label, m, extra = {}) => R.item({ id, type: 'machine', ex, stat, label: 'TRAIN: ' + label, x: m.x, z: m.z, y: (R.lift || 0) + 1, r: 0.8, dur: 0, face: m.f, seat: m.seat, bar: m.bar, deck: R.lift || 0, anim: m.anim, reset: m.reset, ...extra });
  // ---- Floors: oak at the front (reception and the café, under the gallery), black rubber under the free weights, the bags and the rig, turf for the sled.
  R.box('wood', -W / 2, 0.02, W / 2, 10, 0, 0.01, C(0xe8dccb));
  R.box('prop', -W / 2 + 0.02, 11, -9, 26, 0, 0.012, C(0x1a1b1d)); R.box('prop', -22.6, 26.5, -6, D - 0.02, 0, 0.012, C(0x1a1b1d));
  for (let a = -25; a < -9; a += 1.0) R.box('prop', a, 11, a + 0.012, 26, 0.012, 0.014, C(0x2a2b2e));
  R.box('turf', -W / 2 + 0.02, 26.5, -23, D - 0.02, 0, 0.02, C(0xffffff));
  for (const x of [-25.85, -24.45, -23.1]) lineZ(x, 26.5, D - 0.05, white, 0.06);
  for (let z = 28.5; z < D - 1; z += 2.0) lineX(-25.85, -23.1, z, white, 0.05);
  // ---- The gallery over the front: its slab and its glass balustrade (a gap where the stair arrives), and the stair up to it on the right.
  R.box('prop', -W / 2, 0, W / 2, 10, M - 0.3, M, C(0x2a2c30)); R.box('wood', -W / 2, 0, W / 2, 10, M, M + 0.01, C(0xe8dccb)); R.gb.ceil.ceil(R.ox - W / 2, R.oz, R.ox + W / 2, R.oz + 10, R.oy + M - 0.3, 4, C(0xf4f2ee)); R.deck(-W / 2, 0, W / 2, 10, M);
  for (const x of [-16, -6, 6, 16]) R.drum('prop', x, 10, 0.25, 0, M - 0.3, C(0xf0eee8), true, 16);
  for (let x = -22; x <= 22; x += 6) R.panel(x, 5, 2.4, 0.2, M - 0.3, C(0xfff4e2), 3);
  R.rail(-W / 2, 10, 21.9, 10, M, C(0xb9bec4), true); R.rail(24.9, 10, W / 2, 10, M, C(0xb9bec4), true);
  R.stairs(22.1, 10, 24.7, 17.5, '-z', 0, M, 'prop', C(0x2a2c30), 'ab', C(0xb9bec4), true);
  // ---- Under the gallery: reception (an oak desk, a lit wall of timber slats) and the café.
  counter(-17, 2.4, -9, 3.2, 1.1); R.box('prop', -17, 2.36, -9, 2.4, 0.04, 0.1, C(0x101113));
  R.box('prop', -13.3, 2.85, -12.7, 2.95, 1.1, 1.46, C(0x202226)); R.box('emit', -13.28, 2.83, -12.72, 2.85, 1.14, 1.42, C(0x5fb0ff).multiplyScalar(1.6));
  R.box('wall', -19, 5.6, -7, 5.8, 0, M - 0.3, C(0x2a2b2f), true); for (let x = -18.9; x < -7.1; x += 0.16) R.box('wood', x, 5.52, x + 0.09, 5.6, 0, M - 0.3, oak);
  R.box('prop', -15, 5.48, -11, 5.52, 1.6, 2.6, C(0x111113)); R.box('emit', -14.8, 5.47, -11.2, 5.48, 1.75, 2.45, ACC.clone().multiplyScalar(1.5));
  R.item({ id: 'desk', type: 'desk', x: -13, z: 1.9, y: 1.0, r: 2.0, label: 'MEMBERSHIP', dur: 0 }); R.spot('staff', -13, 4.0, Math.PI);
  counter(9, 3, 17, 3.7, 1.08); R.slab('prop', 9, 7.6, 17, 8.4, 0, 0.92, C(0x2a2b2f), stone);
  for (const y of [1.5, 1.95]) { R.box('wood', 9, 8.2, 17, 8.4, y, y + 0.04, oak); for (let x = 9.1; x < 16.9; x += 0.17) if ((x * 13 | 0) % 4) R.box('prop', x, 8.25, x + 0.08, 8.35, y + 0.04, y + 0.04 + 0.18 + ((x * 7 | 0) % 3) * 0.04, C([0x2f6f3a, 0xc9a24a, 0x8a2a26, 0xe8e2d0, 0x3a5a8a][(x * 11 | 0) % 5])); }
  R.box('metal', 15.2, 7.7, 16, 8.3, 0.92, 1.4, C(0xb8bec4));
  for (const x of [10, 11.4, 12.8, 14.2, 15.6]) { R.drum('metal', x, 2.3, 0.03, 0, 0.75, SILVER, false, 8); R.drum('prop', x, 2.3, 0.18, 0.75, 0.8, UPH, true, 14); }
  for (const [x, z] of [[20, 3], [20, 6.5], [-21.5, 3], [-21.5, 7]]) { R.drum('metal', x, z, 0.04, 0, 0.73, GRAPH, true, 8); R.drum('wood', x, z, 0.42, 0.73, 0.76, oak, false, 18); for (const s of [-1, 1]) { R.box('prop', x + s * 0.72 - 0.2, z - 0.2, x + s * 0.72 + 0.2, z + 0.2, 0.42, 0.47, C(0x5a6e6a)); R.box('prop', x + s * 0.92 - 0.04, z - 0.2, x + s * 0.92 + 0.04, z + 0.2, 0.47, 0.85, C(0x5a6e6a)); } }
  R.spot('barista', 13, 4.4, Math.PI); R.spot('cafe', 12.8, 1.8, 0);
  plant(R, -6, 1.4, 1.8); plant(R, 6, 1.4, 1.8); plant(R, -24.5, 9, 2.0); plant(R, 24.5, 1.4, 2.0);
  // The front windows (light through them under the gallery and above it).
  for (const [x0, x1] of [[-24, -2], [2, 24]]) { R.box('emit', x0, -0.02, x1, 0.0, 0.5, M - 0.5, C(0xd8ecff).multiplyScalar(1.8)); R.box('emit', x0, -0.02, x1, 0.0, M + 0.5, H - 0.6, C(0xd8ecff).multiplyScalar(1.8)); for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.round((x1 - x0) / 2)) R.box('metal', x - 0.04, -0.01, x + 0.04, 0.06, 0.45, H - 0.55, GRAPH); }
  // ---- On the gallery: the spin studio behind glass (an instructor's bike facing eight), and the cardio balcony.
  R.lift = M;
  const spinW = [[-25.2, 5, Math.PI / 2]], studio = [];
  for (const r of [0, 1]) for (let k = 0; k < 4; k++) studio.push([-22 + k * 2.4, 3 + r * 3.6, -Math.PI / 2]);
  for (const [x, z, f] of spinW.concat(studio)) { const b = spinBike(R, x, z, f); const it = use('spin' + x + ',' + z, 'spin', 'sta', 'SPIN BIKE', b); if (f > 0) { it.busy = true; R.spot('instructor', b.x, b.z, f, { ex: 'spin', item: it.id, seat: b.seat, bar: b.bar, y: M, key: 'ped_f3' }); } }
  R.lift = 0;
  // (the studio's door is in its side, onto the balcony)
  for (const [x0, z0, x1, z1] of [[-26, 9.6, -8, 9.7], [-8.1, 0.2, -8, 3.4], [-8.1, 5.6, -8, 9.7]]) { glassBox(R, x0, z0, x1, z1, M, M + 3); R.block(x0, z0, x1, z1, M, M + 3); R.box('metal', x0, z0, x1, z1, M + 2.95, M + 3.05, GRAPH); }
  R.box('wall', -26, 9.6, -8, 9.7, M + 3, H, C(0xf1eee8)); R.box('wall', -8.1, 0, -8, 9.7, M + 3, H, C(0xf1eee8)); R.box('metal', -8.12, 3.4, -7.98, 5.6, M + 2.4, M + 3.05, GRAPH);
  R.box('prop', -W / 2 + 0.01, 0.4, -W / 2 + 0.05, 9.4, M + 0.6, M + 2.8, C(0x1a1a1c)); R.box('emit', -W / 2 + 0.05, 1.2, -W / 2 + 0.06, 8.6, M + 1.0, M + 1.1, C(0xb0121a).multiplyScalar(1.8));
  for (const z of [2.5, 5, 7.5]) R.panel(-17, z, 16, 0.08, H, C(0xff5a8a), 2.4);
  R.lift = M;
  const rowA = []; for (const x of [-5.6, -3.8, -2, -0.2, 1.6, 3.4]) rowA.push(['tread', x, treadmill(R, x, 8.3, 0)]);
  for (const x of [6.6, 8.4, 10.2, 12]) rowA.push(['cross', x, crossTrainer(R, x, 8.4, 0)]);
  for (const x of [15, 17]) rowA.push(['climb', x, climber(R, x, 8.6, 0)]);
  for (const x of [19.4, 21]) rowA.push(['ubike', x, spinBike(R, x, 4.0, 0, true)]);
  const rows = []; for (const x of [-4, -1, 2, 5]) rows.push(rower(R, x, 3.4, 0));
  R.lift = 0;
  rowA.forEach(([k, x, m], i) => {
    if (k === 'tread') R.item({ id: 'tread' + i, type: 'treadmill', x: m.x, z: m.z, y: M + 1, r: 0.75, label: 'TRAIN: TREADMILL', dur: 0, face: m.f, deck: M });
    else if (k === 'cross') use('cross' + i, 'cross', 'sta', 'CROSS TRAINER', m);
    else if (k === 'climb') use('climb' + i, 'climber', 'sta', 'STAIR CLIMBER', m);
    else use('ubike' + i, 'bike', 'sta', 'EXERCISE BIKE', m);
  });
  rows.forEach((m, i) => use('rower' + i, 'rower', 'both', 'ROWING MACHINE', m));
  for (const it of R.items) if (/^(tread|cross|climb|ubike|rower|spin)/.test(it.id)) { it.deck = M; it.y = R.oy + M + 1; }
  R.spot('runner', rowA[5][2].x, rowA[5][2].z, 0, { tread: 3.0, y: M });
  const xt = R.items.find(i => i.id === 'cross7'); if (xt) { xt.busy = true; R.spot('runner2', xt.x - R.ox, xt.z - R.oz, 0, { ex: 'cross', item: xt.id, y: M, key: 'ped_f4' }); }
  const rw = R.items.find(i => i.id === 'rower3'); if (rw) { rw.busy = true; R.spot('rowerm', rw.x - R.ox, rw.z - R.oz, 0, { ex: 'rower', item: rw.id, seat: rw.seat, y: M, key: 'tee' }); }
  // ---- Free weights: two dumbbell racks under a mirror wall, benches, three squat racks on platforms, two bench presses, a Smith machine, kettlebells.
  for (const [z0, z1] of [[11.5, 17.5], [19, 25]]) {
    R.box('metal', -W / 2 + 0.05, z0, -W / 2 + 0.65, z1, 0, 0.9, C(0x2a2c30), true);
    for (let k = 0; k < 15; k++) { const z = z0 + 0.25 + k * 0.38, r = 0.04 + (k % 15) * 0.0055; dumbbell(R, -W / 2 + 0.35, 0.95, z, 'x', 0.3 + k * 0.012, r); dumbbell(R, -W / 2 + 0.35, 0.5, z, 'x', 0.3 + k * 0.012, r); }
  }
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.4), new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.04, envMapIntensity: 1.4 })); m.position.set(R.ox - W / 2 + 0.065, R.oy + 2.2, R.oz + 18.25); m.rotation.y = Math.PI / 2; R.loose.push(m); }
  R.box('prop', -W / 2 + 0.01, 11, -W / 2 + 0.05, 25.5, 0.96, 3.44, C(0x1a1a1c));
  R.item({ id: 'weights', type: 'weights', x: -24.4, z: 14.5, y: 1.0, r: 1.2, label: 'TRAIN: DUMBBELLS', dur: 0, face: -Math.PI / 2 }); R.spot('lifter', -24.4, 22, -Math.PI / 2);
  for (const z of [13.2, 16.2, 20.4, 23.4]) { R.slab('prop', -22.2, z - 0.62, -21.9, z + 0.62, 0, 0.45, black, UPH); R.box('metal', -22.12, z - 0.5, -21.98, z + 0.5, 0, 0.4, steel); }
  [-19.5, -16, -12.5].forEach((x0, i) => {
    const x1 = x0 + 1.6, z0 = 11.6, z1 = 13.0;
    R.box('wood', x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5, 0, 0.05, C(0xd8c8b0));
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) R.box('metal', x - 0.04, z - 0.04, x + 0.04, z + 0.04, 0.05, 2.3, dark, true);
    for (const z of [z0, z1]) R.box('metal', x0, z - 0.03, x1, z + 0.03, 2.25, 2.31, dark); for (const x of [x0, x1]) R.box('metal', x - 0.03, z0, x + 0.03, z1, 2.25, 2.31, dark);
    for (const x of [x0, x1]) R.box('metal', x - 0.03, z0, x + 0.03, z1, 0.66, 0.7, steel);
    const bb = barbell(R, (x0 + x1) / 2, 1.42, z1 - 0.05, 'x', 2.2, [0.225, 0.225, 0.2], i), it = use('squat' + i, 'squat', 'str', 'SQUATS', { x: (x0 + x1) / 2, z: z1 + 0.18, f: 0, ...carried(bb) });
    if (i === 1) { it.busy = true; R.spot('squatter', it.x - R.ox, it.z - R.oz, 0, { ex: 'squat', item: it.id, key: 'ped_m3' }); }
  });
  for (const bx of [-20, -15.5]) {
    const z0 = 16.8; R.slab('prop', bx - 0.15, z0 + 0.3, bx + 0.15, z0 + 1.5, 0, 0.44, black, UPH);
    for (const s of [-1, 1]) { R.box('metal', bx + s * 0.55 - 0.03, z0 + 0.22, bx + s * 0.55 + 0.03, z0 + 0.3, 0, 1.12, dark, true); R.box('metal', bx + s * 0.55 - 0.04, z0 + 0.22, bx + s * 0.55 + 0.04, z0 + 0.4, 1.05, 1.1, steel); }
    const bb = barbell(R, bx, 1.12, z0 + 0.3, 'x', 2.0, [0.225, 0.2], 2); use('bench' + bx, 'bench', 'str', 'BENCH PRESS', { x: bx, z: z0 + 2.08, f: 0, seat: 0.44, ...carried(bb) });
  }
  { const s = smith(R, -12, 18.2, Math.PI); use('smith', 'squat', 'str', 'SMITH MACHINE SQUATS', s); }
  R.drum('metal', -10, 23.8, 0.05, 0, 1.1, dark, true, 8); R.box('prop', -10.35, 23.45, -9.65, 24.15, 0, 0.04, dark);
  for (let k = 0; k < 4; k++) { plate(R, -10 - 0.09, 0.3 + k * 0.22, 23.8, 0.2 - k * 0.025, 0); plate(R, -10 + 0.09, 0.3 + k * 0.22, 23.8, 0.2 - k * 0.025, 0); }
  R.box('metal', -16, 24.6, -12.4, 25.0, 0, 0.4, C(0x2a2c30), true); for (let k = 0; k < 10; k++) { const x = -15.85 + k * 0.34, r = 0.07 + k * 0.006; R.drum('prop', x, 24.8, r, 0.4, 0.4 + r * 1.6, C(0x16171a), false, 10); R.box('prop', x - r * 0.6, 24.79, x + r * 0.6, 24.81, 0.4 + r * 1.6, 0.4 + r * 2.1, C(0x16171a)); }
  { const kb = kettlebell(R, -14, 23.9); use('kb', 'kbswing', 'both', 'KETTLEBELL SWINGS', { x: -14, z: 23.3, f: 0, ...kb }); }
  // ---- Two rows of selectorised machines facing each other across an aisle; two leg presses; the cable crossover.
  [['chest', -5], ['shoulder', -2.4], ['lat', 0.2], ['row', 2.8], ['pec', 5.4], ['legext', 8], ['legcurl', 10.6]].forEach(([k, x], i) => { const m = machine(R, x, 14.2, Math.PI, k); const it = use('mA' + i, k, 'str', m.name, m); if (i === 0) { it.busy = true; R.spot('presser', m.x, m.z, Math.PI, { ex: k, item: it.id, seat: m.seat, key: 'ped_m4' }); } });
  [['chest', -5], ['shoulder', -2.4], ['lat', 0.2], ['row', 2.8], ['pec', 5.4]].forEach(([k, x], i) => { const m = machine(R, x, 19.4, 0, k); use('mB' + i, k, 'str', m.name, m); });
  for (const x of [8.2, 11.2]) {
    const K = kit(R, x, 19.4, 0); K.R = R;
    K.box('metal', -0.5, -1.2, 0.5, 1.1, 0, 0.06, GRAPH); const top = stack(K, -0.3, 0.3, -1.2, -0.95, 1.9);
    for (let i = 0; i < 4; i++) K.box('prop', -0.24, -0.85 + i * 0.12, 0.24, -0.7 + i * 0.12, 0.45 + i * 0.22, 0.6 + i * 0.22, UPH);
    K.box('prop', -0.25, -0.35, 0.25, 0.25, 0.4, 0.52, UPH); K.box('metal', -0.06, -0.3, 0.06, 0.2, 0.06, 0.4, SILVER);
    for (const s of [-1, 1]) K.box('metal', s * 0.42 - 0.03, 0.3, s * 0.42 + 0.03, 1.15, 0.06, 0.12, SILVER);
    const plt = looseBox(K, -0.32, 0.42, 0.32, 0.5, 0.4, 1.15, DARKM), p0 = plt.position.clone(), fw = new THREE.Vector3(Math.sin(K.f), 0, Math.cos(K.f)), at = K.P(0, -0.1), st = lifts(top);
    use('legpress' + x, 'legpress', 'str', 'LEG PRESS', { x: at[0], z: at[1], f: 0, seat: 0.52, anim: (w, ex) => { plt.position.copy(p0).addScaledVector(fw, rep(ex.p) * 0.32); st.anim(w, ex); }, reset: () => { plt.position.copy(p0); st.reset(); } });
  }
  { const K = kit(R, 16.5, 16.8, 0); K.R = R;                                                                                       // the cable crossover
    for (const s of [-1, 1]) { stack(K, s * 1.6 - 0.3, s * 1.6 + 0.3, -0.2, 0.15, 2.3); K.box('metal', s * 1.6 - 0.04, 0.15, s * 1.6 + 0.04, 0.25, 0.06, 2.4, SILVER); K.drum('metal', s * 1.5, 0.3, 0.06, 2.1, 2.2, SILVER, false, 10); K.drum('metal', s * 1.5, 0.3, 0.06, 0.25, 0.35, SILVER, false, 10); }
    K.box('metal', -1.7, -0.06, 1.7, 0.08, 2.4, 2.5, GRAPH); K.box('metal', -1.2, 0.0, 1.2, 0.04, 2.25, 2.29, SILVER); }
  R.item({ id: 'cable', type: 'cable', x: 16.5, z: 16.0, y: 1.0, r: 1.0, label: 'TRAIN: CABLE CURLS', dur: 0, face: 0 });
  // ---- Functional: the sled on the turf, the rig (pull-ups), plyo boxes, battle ropes, wall balls; a stretching area.
  { const s = sled(R, -24.45, 28.2); use('sled', 'sled', 'both', 'PUSH THE SLED', { x: -24.45, z: 27.25, f: 0, anim: s.anim, reset: s.reset }, { track: [R.oz + 27.25, R.oz + 38.3] }); }
  const barY = rig(R, -21, 28, -15.4, 29.4, 2.9);
  for (const [x, z, f] of [[-19.8, 28.35 - 0.06, 0], [-16.6, 29.05 + 0.06, Math.PI]]) use('pull' + x, 'pullup', 'str', 'PULL-UPS', { x, z, f, bar: barY });
  for (const [x, h] of [[-21.2, 0.5], [-20.3, 0.6], [-19.3, 0.75]]) R.box('wood', x - 0.38, 31.2, x + 0.38, 31.8, 0, h, oak, true);
  for (let k = 0; k < 5; k++) R.drum('prop', -17.6 + k * 0.42, 31.5, 0.17, 0, 0.34, C([0x2a7aa8, 0xb0121a, 0x2f2f33, 0xf2c230, 0x2f8a3c][k]), false, 12);
  R.box('metal', -19.3, D - 1.0, -18.7, D - 0.4, 0, 0.35, GRAPH, true); { const r = ropes(R, -19, D - 0.7, -5.5); use('ropes', 'ropes', 'both', 'BATTLE ROPES', { x: -19, z: D - 6.6, f: 0, ...r }); }
  for (let x = 13; x < 24; x += 2.6) { R.box('prop', x, 24.5, x + 2.0, 26.5, 0, 0.02, C(0x3a5a6a)); R.drum('prop', x + 1.0, 24.9, 0.075, 0.02, 0.17, C(0x2f2f33), false, 10); }
  R.spot('pt', -17.5, 30.4, -Math.PI * 0.75);
  // ---- Heavy bags on a beam along the back wall, and the kick bags.
  R.box('metal', -14.2, D - 1.1, -5.4, D - 0.9, H - 0.25, H - 0.05, steel);
  [-13.4, -11, -8.6, -6.2].forEach((x, i) => {
    heavyBag(R, x, D - 1.0, { top: H - 0.25, col: [0x1c1c1e, 0x5a1010, 0x1c1c1e, 0x1c2a4a][i] });
    R.item({ id: 'bag' + i, type: 'bag', x, z: D - 1.8, y: 1.3, r: 1.0, label: 'TRAIN: HEAVY BAG', dur: 0, face: 0, bag: R.bags.length - 1 });
  });
  R.spot('boxer', -6.2, D - 1.8, 0, { bag: 3 });
  for (const x of [-4, -2]) { standingBag(R, x, 33.6); R.item({ id: 'kick' + x, type: 'kickbag', x, z: 32.55, y: 1.2, r: 1.0, label: 'TRAIN: KICK BAG', dur: 0, face: 0, bag: R.bags.length - 1 }); }
  // ---- The boxing ring: a raised canvas, four padded corner posts, three ropes a side, steps up to it. (gym.js: train, spar or fight a bout in it.)
  const rx0 = 18.2, rx1 = 24.4, rz0 = 31.4, rz1 = 37.6, rh = 0.62;
  R.slab('prop', rx0, rz0, rx1, rz1, 0, rh, C(0x16161a), C(0x2a4f8a), false);
  for (const [x0, z0, x1, z1] of [[rx0, rz0, rx1, rz0 + 0.2], [rx0, rz1 - 0.2, rx1, rz1], [rx0, rz0, rx0 + 0.2, rz1], [rx1 - 0.2, rz0, rx1, rz1]]) R.boxes.push({ x0: R.ox + x0, x1: R.ox + x1, z0: R.oz + z0, z1: R.oz + z1, y0: R.oy, y1: R.oy + rh + 1.4 });      // (the ropes keep you out, and the boxers in)
  (R.decks || (R.decks = [])).push({ x0: R.ox + rx0, x1: R.ox + rx1, z0: R.oz + rz0, z1: R.oz + rz1, h: rh });
  R.box('prop', rx0 + 0.4, rz0 + 0.4, rx1 - 0.4, rz1 - 0.4, rh, rh + 0.006, C(0x3a64a8));
  R.box('prop', (rx0 + rx1) / 2 - 1.0, (rz0 + rz1) / 2 - 0.35, (rx0 + rx1) / 2 + 1.0, (rz0 + rz1) / 2 + 0.35, rh + 0.006, rh + 0.008, C(0xe8e2d0));       // the club's name on the canvas
  const posts = [[rx0 + 0.15, rz0 + 0.15, red], [rx1 - 0.15, rz0 + 0.15, C(0xf0f0f0)], [rx1 - 0.15, rz1 - 0.15, blue], [rx0 + 0.15, rz1 - 0.15, C(0xf0f0f0)]];
  for (const [x, z, c] of posts) { R.drum('metal', x, z, 0.06, rh, rh + 1.45, steel, false, 10); R.box('prop', x - 0.11, z - 0.11, x + 0.11, z + 0.11, rh + 0.25, rh + 1.35, c); }
  for (let k = 0; k < 3; k++) {
    const y = rh + 0.45 + k * 0.38, t = 0.025, c = [red, C(0xf0f0f0), blue][k];
    R.box('prop', rx0 + 0.15, rz0 + 0.13, rx1 - 0.15, rz0 + 0.17, y - t, y + t, c); R.box('prop', rx0 + 0.15, rz1 - 0.17, rx1 - 0.15, rz1 - 0.13, y - t, y + t, c);
    R.box('prop', rx0 + 0.13, rz0 + 0.15, rx0 + 0.17, rz1 - 0.15, y - t, y + t, c); R.box('prop', rx1 - 0.17, rz0 + 0.15, rx1 - 0.13, rz1 - 0.15, y - t, y + t, c);
  }
  R.box('metal', rx0 - 0.6, rz0 + 1.0, rx0, rz0 + 1.8, 0, 0.3, steel); R.box('metal', rx0 - 0.3, rz0 + 1.0, rx0, rz0 + 1.8, 0.3, 0.5, steel);
  R.spot('sparA', 20.6, 34.5, Math.PI / 2, { ring: rh }); R.spot('sparB', 22.0, 34.5, -Math.PI / 2, { ring: rh });
  R.item({ id: 'ring', type: 'ring', x: rx0 - 0.9, z: rz0 + 1.4, y: 1.0, r: 1.2, label: 'BOXING: TRAIN OR FIGHT', dur: 0, face: Math.PI / 2 });
  R.gymRing = { x0: R.ox + rx0, x1: R.ox + rx1, z0: R.oz + rz0, z1: R.oz + rz1, h: rh };
  for (const [x0, z0, x1, z1] of [[rx0 + 0.3, rz0 + 0.3, rx1 - 0.3, rz0 + 0.4], [rx0 + 0.3, rz1 - 0.4, rx1 - 0.3, rz1 - 0.3], [rx0 + 0.3, rz0 + 0.3, rx0 + 0.4, rz1 - 0.3], [rx1 - 0.4, rz0 + 0.3, rx1 - 0.3, rz1 - 0.3]]) { R.box('prop', x0, z0, x1, z1, H - 2.32, H - 2.25, GRAPH); R.gb.emit.ceil(R.ox + x0, R.oz + z0, R.ox + x1, R.oz + z1, R.oy + H - 2.33, 1, C(0xfff6e6).multiplyScalar(4.2)); }
  for (const [x, z] of [[rx0 + 0.35, rz0 + 0.35], [rx1 - 0.35, rz1 - 0.35], [rx0 + 0.35, rz1 - 0.35], [rx1 - 0.35, rz0 + 0.35]]) R.box('metal', x - 0.006, z - 0.006, x + 0.006, z + 0.006, H - 2.25, H, black);
  R.box('prop', 14, D - 0.04, W / 2, D - 0.01, 0, H, C(0x1f2024)); for (const y of [3.6, 3.85]) R.box('emit', 14.2, D - 0.05, W / 2 - 0.2, D - 0.04, y, y + 0.06, ACC.clone().multiplyScalar(1.6));
  // ---- The karate studio: tatami behind glass walls (a door in the front), mirrors at the back, its own lights.
  const mx0 = 1.2, mx1 = 9.6, mz0 = 31.0, mz1 = D - 0.4;
  for (let a = 0; a < 8; a++) for (let b = 0; b < 7; b++) {
    const x0 = mx0 + a * (mx1 - mx0) / 8, z0 = mz0 + b * (mz1 - mz0) / 7, edge = a === 0 || a === 7 || b === 0 || b === 6, vv = 0.92 + ((a * 7 + b * 3) % 5) * 0.03;
    R.box('prop', x0 + 0.005, z0 + 0.005, x0 + (mx1 - mx0) / 8 - 0.005, z0 + (mz1 - mz0) / 7 - 0.005, 0, 0.04, (edge ? C(0x8a2a26) : C(0x6d7d4e)).multiplyScalar(vv));
  }
  for (const x of [(mx0 + mx1) / 2 - 1.0, (mx0 + mx1) / 2 + 1.0]) R.box('prop', x - 0.04, (mz0 + mz1) / 2 - 0.5, x + 0.04, (mz0 + mz1) / 2 + 0.5, 0.04, 0.042, C(0xf0ece0));
  R.box('wood', 0.4, 30.2, 10.4, D, 0, 0.008, C(0xe2d4bf));
  const glassWall = (x0, z0, x1, z1) => { glassBox(R, x0, z0, x1, z1, 0.05, 3.0); R.boxes.push({ x0: R.ox + x0, x1: R.ox + x1, z0: R.oz + z0, z1: R.oz + z1, y0: R.oy, y1: R.oy + 3.0 }); const along = x1 - x0 > z1 - z0;
    for (const y of [0, 2.98]) R.box('metal', x0 - 0.01, z0 - 0.01, x1 + 0.01, z1 + 0.01, y, y + 0.06, GRAPH);
    const n = Math.max(1, Math.round((along ? x1 - x0 : z1 - z0) / 1.5)); for (let k = 0; k <= n; k++) { const t = k / n; if (along) { const x = x0 + (x1 - x0) * t; R.box('metal', x - 0.03, z0 - 0.01, x + 0.03, z1 + 0.01, 0, 3.0, GRAPH); } else { const z = z0 + (z1 - z0) * t; R.box('metal', x0 - 0.01, z - 0.03, x1 + 0.01, z + 0.03, 0, 3.0, GRAPH); } }
    R.box('prop', x0 - 0.004, z0 - 0.004, x1 + 0.004, z1 + 0.004, 1.15, 1.3, C(0xe6e8ea));
    R.box('wall', x0, z0, x1, z1, 3.0, H, C(0xf1eee8)); };
  glassWall(0.4, 30.15, 4.5, 30.25); glassWall(6.3, 30.15, 10.4, 30.25); glassWall(0.35, 30.25, 0.45, D); glassWall(10.35, 30.25, 10.45, D);
  R.box('wall', 4.5, 30.15, 6.3, 30.25, 2.4, H, C(0xf1eee8));
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 2.3), new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.04, envMapIntensity: 1.4 })); m.position.set(R.ox + 5.4, R.oy + 1.6, R.oz + D - 0.03); m.rotation.y = Math.PI; R.loose.push(m); }
  for (const z of [32.6, 35, 37.4]) R.panel(5.4, z, 9.4, 0.06, H, C(0xfff4e2), 4.2);
  R.spot('karA', (mx0 + mx1) / 2 - 1.0, (mz0 + mz1) / 2, Math.PI / 2, { mat: true }); R.spot('karB', (mx0 + mx1) / 2 + 1.0, (mz0 + mz1) / 2, -Math.PI / 2, { mat: true });
  R.item({ id: 'dojo', type: 'dojo', x: 5.4, z: 29.5, y: 1.0, r: 1.2, label: 'KARATE: TRAIN OR SPAR', dur: 0, face: 0 });
  R.gymMat = { x0: R.ox + mx0, x1: R.ox + mx1, z0: R.oz + mz0, z1: R.oz + mz1 };
  // ---- Lockers' corridor (a door in the right wall with a sign), a water fountain, a towel station, more plants; a member walking round.
  R.box('prop', W / 2 - 0.05, 20.8, W / 2 - 0.01, 22.4, 0, 2.3, C(0x6b4f36)); R.box('metal', W / 2 - 0.08, 21.0, W / 2 - 0.05, 21.06, 1.0, 1.3, SILVER); R.box('emit', W / 2 - 0.06, 21.0, W / 2 - 0.04, 22.2, 2.45, 2.7, C(0xf4efe0).multiplyScalar(1.3));
  R.box('prop', W / 2 - 0.45, 23.0, W / 2 - 0.02, 23.5, 0, 1.0, C(0xd8dcdf), true); R.box('metal', W / 2 - 0.4, 23.05, W / 2 - 0.1, 23.45, 1.0, 1.04, SILVER);
  R.box('wood', W / 2 - 0.5, 18.5, W / 2 - 0.02, 19.7, 0, 1.2, oak, true); for (let k = 0; k < 6; k++) R.box('prop', W / 2 - 0.45, 18.6 + k * 0.18, W / 2 - 0.08, 18.74 + k * 0.18, 1.2, 1.3, white);
  plant(R, -0.8, 29.4, 1.7); plant(R, 11.4, 29.4, 1.7); plant(R, 25, 28.5, 2.0); plant(R, -8, 11.2, 2.0);
  R.spot('member', 0, 11.5, 0, { route: [[0, 11.5], [-7, 11.5], [-7, 26], [12, 26], [13.4, 22], [13.4, 11.6]] });
  // ---- The ceiling: dark, with long lines of LED light across it, round ducts under it.
  for (const z of [14, 19, 24, 29, 34]) for (const [x0, x1] of [[-24, -1], [1, 24]]) R.panel((x0 + x1) / 2, z, x1 - x0, 0.08, H, C(0xfff7ec), 4.0);
  for (const z of [12.5, 27]) { const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, W - 1, 20).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa8aeb4, roughness: 0.35, metalness: 0.9 })); duct.position.set(R.ox, R.oy + H - 0.6, R.oz + z); duct.castShadow = false; R.loose.push(duct); for (let x = -24; x <= 24; x += 6) R.box('metal', x - 0.01, z - 0.01, x + 0.01, z + 0.01, H - 0.24, H, black); }
  R.light(-14, H - 1.2, 18, 1.7); R.light(9, H - 1.2, 18, 1.7); R.light(-12, H - 1.2, 33, 1.6); R.light(14, H - 1.2, 33, 1.7);
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
Object.assign(PLANS, VISIT_PLANS);                                                       // (the buildings you walk into to look round: rooms-visit.js)
export function planFor(kind) {
  const f = PLANS[kind];
  return (R, v) => { const s = (v.seed ?? 1) >>> 0; let a = s + 0x6D2B79F5; const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; f(R, v, rnd); plantMesh(R); };
}
