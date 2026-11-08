// The farms, the ski resort and the desert places: a ghost town, an oil field, a solar farm and a radio telescope. See towns.js and kit.js.
import * as THREE from 'three';
import { heightAt } from './world.js';
import { Kit, PAL, WHITE, CURB, hex, paint, planted } from './kit.js';
import { addStaticCollider } from './city.js';

export const BUILDERS = {};
const TAU = Math.PI * 2;

// --- Farms: a farmhouse, a barn with a gambrel roof, silos, a windmill, a shed with a tractor and hay, paddock fences and fields of crops ------------
BUILDERS.farm = ({ S, kit, ctx, rnd, city, signBoard, anim, mats }) => {
  const X = S.x, Z = S.z, dir = Math.sign(S.end[0] - X) || 1, tint = (c, k) => c.clone().multiplyScalar(k);
  // The drive from the road to the house.
  kit.ground(Math.min(S.end[0], X + dir * 44) - 1, Z - 2.6, Math.max(S.end[0], X + dir * 44) + 1, Z + 2.6, 0.04, PAL.soil);
  // The farmhouse: white boards, a red roof, a porch along the front, a chimney.
  { const cx = X + dir * 44, cz = Z - 36, x0 = cx - 6.5, x1 = cx + 6.5, z0 = cz - 4.8, z1 = cz + 4.8, h = 6;
    kit.box(x0, z0, x1, z1, 0, h, PAL.white); kit.gable(x0, z0, x1, z1, h, 3.6, PAL.white, PAL.roofRed, true, 0.7); kit.collide(x0, z0, x1, z1);
    kit.windows(x0, z0, x1, z1, 1.2, 2, 3, { w: 1.1, h: 1.6, gap: 3.4, doorAt: true });
    kit.box(x0 + 8.2, z0 + 1.6, x0 + 9.4, z0 + 2.8, h, h + 4.4, PAL.brick);
    kit.box(x0 - 0.4, z1, x1 + 0.4, z1 + 2.6, 0, 0.3, PAL.wood); kit.box(x0 - 0.4, z1, x1 + 0.4, z1 + 2.7, 3.2, 3.5, PAL.roofRed);
    for (let k = 0; k <= 4; k++) kit.box(x0 - 0.3 + k * 3.15, z1 + 2.4, x0 - 0.1 + k * 3.15, z1 + 2.6, 0.3, 3.2, PAL.white);
    kit.panel(cx, 0.3, z1, 0, 1, 1.2, 2.2, PAL.dark);
  }
  // The barn: red boards, white trim and X doors, a gambrel roof with a hayloft door.
  { const cx = X - dir * 38, cz = Z + 20, x0 = cx - 8, x1 = cx + 8, z0 = cz - 14, z1 = cz + 14, h = 6.4;
    kit.box(x0, z0, x1, z1, 0, h, PAL.barn); kit.prism([[-8.7, 0], [-5.6, 3.6], [0, 6], [5.6, 3.6], [8.7, 0]], false, z0 - 0.6, z1 + 0.6, cx, h, PAL.slate, PAL.barn); kit.collide(x0, z0, x1, z1);
    for (const z of [z0, z1]) { const d = z === z1 ? 1 : -1; kit.panel(cx, 0.1, z + d * 0.02, 0, d, 5.4, 4.6, PAL.white, kit.p, 0.06); kit.panel(cx, 0.1, z, 0, d, 5.0, 4.2, PAL.barn, kit.p, 0.1); kit.panel(cx, h + 1.2, z, 0, d, 1.6, 1.8, PAL.white, kit.p, 0.06);
      kit.beam([cx - 2.5, 0.2, z + d * 0.14], [cx + 2.5, 4.2, z + d * 0.14], 0.07, PAL.white, kit.p); kit.beam([cx + 2.5, 0.2, z + d * 0.14], [cx - 2.5, 4.2, z + d * 0.14], 0.07, PAL.white, kit.p); }
  }
  // Two silos.
  for (const [dx, dz] of [[-dir * 38 - 14, -12], [-dir * 38 - 14, -19.5]]) { kit.cyl(3.3, 3.3, 17, 16, X + dx, 0, Z + dz, PAL.tin); kit.dome(3.3, X + dx, 17, Z + dz, PAL.steel, 0.7); kit.ring(X + dx, Z + dz, 3.4); for (let k = 1; k < 5; k++) kit.cyl(3.38, 3.38, 0.18, 16, X + dx, k * 3.4, Z + dz, PAL.steel); }
  // The machinery shed (open at the front, tin roof on posts) with a tractor and bales of hay.
  { const cx = X + dir * 22, cz = Z + 50, x0 = cx - 11, x1 = cx + 11, z0 = cz - 4.5, z1 = cz + 4.5;
    kit.box(x0, z0, x1, z0 + 0.25, 0, 4.2, PAL.tin); kit.box(x0, z0, x0 + 0.25, z1, 0, 4.2, PAL.tin); kit.box(x1 - 0.25, z0, x1, z1, 0, 4.2, PAL.tin);
    kit.gable(x0, z0, x1, z1, 4.2, 1.6, PAL.tin, PAL.tin, true, 0.5); kit.collide(x0, z0, x1, z0 + 0.25);
    const tx = cx - 4, tz = cz; kit.box(tx - 1.2, tz - 2.2, tx + 1.2, tz + 1.2, 0.6, 1.7, PAL.green); kit.box(tx - 1.0, tz - 0.6, tx + 1.0, tz + 1.2, 1.7, 3.1, PAL.green); kit.box(tx - 1.1, tz - 0.7, tx + 1.1, tz + 1.3, 3.1, 3.25, PAL.dark);
    for (const sx of [-1, 1]) { kit.cyl(1.0, 1.0, 0.8, 14, tx + sx * 1.35, 0, tz + 0.5, PAL.black); kit.cyl(0.55, 0.55, 0.7, 12, tx + sx * 1.3, 0, tz - 1.7, PAL.black); }
    for (const sx of [-1, 1]) { const g = new THREE.CylinderGeometry(0.5, 0.5, 0.82, 12).rotateZ(Math.PI / 2); kit.x.push(paint(g.clone().translate(tx + sx * 1.35, kit.Y + 1.0, tz + 0.5), PAL.black)); kit.x.push(paint(g.translate(tx + sx * 1.3, kit.Y + 0.55, tz - 1.7), PAL.black)); }
    kit.ring(tx, tz, 2);
  }
  for (const [bx, bz, n] of [[X + dir * 4, Z + 48, 3], [X + dir * 6, Z + 55, 2], [X - dir * 6, Z - 60, 4]]) for (let k = 0; k < n; k++) { const g = new THREE.CylinderGeometry(0.95, 0.95, 1.4, 14).rotateZ(Math.PI / 2).translate(bx + (k % 2) * 1.5, kit.Y + 0.95 + Math.floor(k / 2) * 1.8, bz + Math.floor(k / 2) * 0.2 + (k % 2) * 0.1); kit.x.push(paint(g, PAL.hay)); }
  // A windmill that pumps water: a lattice tower, a tank and a turning wheel.
  { const wx = X - dir * 92, wz = Z - 52, h = 15;
    for (const [a, b] of [[-1.7, -1.7], [1.7, -1.7], [1.7, 1.7], [-1.7, 1.7]]) kit.beam([wx + a, 0, wz + b], [wx + a * 0.3, h, wz + b * 0.3], 0.1, PAL.steel);
    for (const hh of [4, 8, 12]) { const k = 1 - hh / h * 0.7; for (const [a, b, c, d] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) kit.beam([wx + a * 1.7 * k, hh, wz + b * 1.7 * k], [wx + c * 1.7 * k, hh, wz + d * 1.7 * k], 0.05, PAL.steel); }
    kit.ring(wx, wz, 2);
    const rotor = new THREE.Group(), geos = []; for (let k = 0; k < 14; k++) { const a = k / 14 * TAU, g = new THREE.BoxGeometry(0.12, 2.6, 0.4).translate(0, 1.9, 0).rotateZ(a); geos.push(paint(g, PAL.tin)); } geos.push(paint(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8).rotateX(Math.PI / 2), PAL.dark));
    const m = new THREE.Mesh(mergeSimple(geos), mats.metal); rotor.add(m);
    const tail = new THREE.Mesh(paint(new THREE.BoxGeometry(0.05, 1.2, 2.4).translate(0, 0, -2.2), PAL.red), mats.metal); rotor.add(tail); rotor.position.set(wx, kit.Y + h + 0.8, wz + 0.4); kit.group.add(rotor);
    anim.push((t) => { rotor.children[0].rotation.z = t * 1.4 + wx; rotor.rotation.y = Math.sin(t * 0.07 + wx) * 0.5; });
  }
  // Fences round a paddock and along the lane, a mailbox with the farm's name, shelter-belt trees.
  { const px0 = X - dir * 78, px1 = X - dir * 34 * 0 - dir * 30, pz0 = Z + 48, pz1 = Z + 92; kit.fence([[px0, pz0], [px0, pz1], [px1, pz1], [px1, pz0], [px0, pz0]]); }
  signBoard(S.name.toUpperCase(), 'EGGS · MILK · HONEY', X + dir * 98, 2.4, Z - 5.5, dir > 0 ? -Math.PI / 2 : Math.PI / 2, 4.6, 1.7, '#3a5a2a', '#f4efe2');
  for (let k = 0; k < 12; k++) city.tree(ctx, X - 100 + k * 17 + rnd() * 5, Z - 118 - rnd() * 6, 1.1 + rnd() * 0.7, 0, false);
  for (const [tx, tz] of [[X + dir * 62, Z - 52], [X + dir * 30, Z - 24], [X - dir * 14, Z - 52]]) city.tree(ctx, tx, tz, 1.3 + rnd() * 0.5, 0, false);
  // Fields of crops in rows (alternating strips of two greens or golds), following the land.
  (S.fields || []).forEach((f, i) => {
    const cols = [[PAL.field1, PAL.field2], [PAL.field3, PAL.hay], [PAL.field2, tint(PAL.green, 1.1)]][i % 3], w = 6.5;
    if (i % 2 === 0) { for (let z = f.z - f.hz, k = 0; z < f.z + f.hz - 0.2; z += w, k++) kit.ground(f.x - f.hx, z, f.x + f.hx, Math.min(z + w, f.z + f.hz), 0.05, cols[k % 2]); }
    else for (let x = f.x - f.hx, k = 0; x < f.x + f.hx - 0.2; x += w, k++) kit.ground(x, f.z - f.hz, Math.min(x + w, f.x + f.hx), f.z + f.hz, 0.05, cols[k % 2]);
  });
};
function mergeSimple(geos) {                                                    // (a plain merge of painted geometries that have the same attributes)
  let n = 0; for (const g of geos) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g0 of geos) { const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position, nn = g.attributes.normal, c = g.attributes.color; for (let i = 0; i < p.count; i++, o++) { pos.set([p.getX(i), p.getY(i), p.getZ(i)], o * 3); nor.set([nn.getX(i), nn.getY(i), nn.getZ(i)], o * 3); col.set([c.getX(i), c.getY(i), c.getZ(i)], o * 3); } }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); return out;
}

// --- The ski resort: a big timber lodge, a hotel, chalets with snowy roofs, a car park, an ice rink and a chairlift up the slope --------------------
BUILDERS.resort = ({ S, kit, ctx, rnd, city, signBoard, mats }) => {
  const [main, cross] = S.streets, X = S.x, Z = S.z, zc = main.pts[0][1], xc = cross.pts[0][0], WOOD = hex('#7a5638'), LOG = hex('#9a7048'), STONE = hex('#7f7b76'), SNOW = PAL.snow;
  const walk = (x0, z0, x1, z1) => { ctx.gb.walk.box(x0, z0, x1, z1, 0, CURB, 6, WHITE); ctx.gb.curb.box(x0, z0, x1, z1, 0, CURB, 4.5, WHITE); };
  for (const [a, b] of [[main.pts[0][0], xc - 13], [xc + 13, main.pts[1][0]]]) { walk(a, zc - 12, b, zc - 7); walk(a, zc + 7, b, zc + 12); }
  // The lodge, at the east end of the street: a stone base, log walls, a steep snowy roof, a wall of glass and a great chimney.
  { const x0 = xc + 60, x1 = x0 + 54, z0 = zc - 28, z1 = zc + 28, h = 9;
    kit.box(x0, z0, x1, z1, 0, 2.4, STONE); kit.box(x0 + 0.4, z0 + 0.4, x1 - 0.4, z1 - 0.4, 2.4, h, LOG); kit.collide(x0, z0, x1, z1);
    kit.gable(x0, z0, x1, z1, h, 8.5, LOG, SNOW, false, 1.4); kit.gable(x0 + 6, z0 - 8, x1 - 6, z0 + 14, h - 0.5, 5.5, LOG, SNOW, true, 1.0);
    kit.panel(x0 + 0.1, 2.6, zc, -1, 0, 36, 5.6, PAL.glass, kit.g, 0.35); kit.box(x0 - 0.6, zc - 18, x0 - 0.2, zc + 18, 2.4, 8.4, PAL.dark, kit.m);
    kit.box(x1 - 9, zc - 3, x1 - 5, zc + 3, 0, h + 7, STONE); kit.box(x1 - 9.4, zc - 3.4, x1 - 4.6, zc + 3.4, h + 7, h + 7.6, PAL.dark);
    kit.box(x0 - 6, zc - 18, x0, zc + 18, 0, 0.3, WOOD); for (let k = -3; k <= 3; k++) kit.box(x0 - 6, zc + k * 6 - 0.15, x0 - 5.7, zc + k * 6 + 0.15, 0.3, 3.4, LOG);
    kit.gable(x0 - 6.4, zc - 18.4, x0 + 0.2, zc + 18.4, 3.4, 1.6, LOG, SNOW, false, 0.3);
    signBoard('FROSTLINE LODGE', 'SKI · STAY · DINE', x0 - 8, 4.6, zc, -Math.PI / 2, 8, 2.6, '#2b3a4a', '#f4efe2');
  }
  // A four-storey hotel with balconies, west of the cross street.
  { const x1 = xc - 14, x0 = x1 - 46, z0 = zc - 52, z1 = zc - 20, h = 16;
    kit.box(x0, z0, x1, z1, 0, h, hex('#d9cdb5')); kit.box(x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5, h, h + 0.8, PAL.dark); kit.gable(x0, z0, x1, z1, h + 0.8, 3, hex('#d9cdb5'), SNOW, true, 0.8); kit.collide(x0, z0, x1, z1);
    kit.windows(x0, z0, x1, z1, 1.4, 4, 3.8, { w: 1.5, h: 1.9, gap: 4.2, doorAt: true });
    for (let f = 1; f < 4; f++) for (let k = 0; k < 9; k++) { const px = x0 + 3 + k * 5, y = f * 3.8; kit.box(px - 1.6, z1, px + 1.6, z1 + 1.3, y, y + 0.18, PAL.wood); kit.box(px - 1.6, z1 + 1.2, px + 1.6, z1 + 1.3, y, y + 1.0, PAL.wood); }
    kit.panel((x0 + x1) / 2, 0.1, z1, 0, 1, 4, 3.2, PAL.dark); signBoard('GRAND ALPINE', 'HOTEL & SPA', (x0 + x1) / 2, 11, z1 + 0.6, 0, 7, 2.2, '#3b2a1e', '#f0d9a0');
  }
  // Chalets in two rows along the street and the cross street.
  const chalet = (cx, cz, w, d, face) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, h = 3.6, c = [LOG, WOOD, hex('#8a6a50')][(rnd() * 3) | 0];
    kit.box(x0, z0, x1, z1, 0, h, c); kit.gable(x0, z0, x1, z1, h, 3.2, c, SNOW, w >= d, 0.9); kit.collide(x0, z0, x1, z1);
    kit.windows(x0, z0, x1, z1, 1, 1, 3, { w: 1.1, h: 1.3, gap: 3.4, doorAt: true });
    kit.box(x1 - 2.2, z0 + 1, x1 - 1.4, z0 + 1.8, h, h + 3.8, STONE); kit.box(cx - 1.5, face > 0 ? z1 : z0 - 2, cx + 1.5, face > 0 ? z1 + 2 : z0, 0, 0.25, PAL.wood);
  };
  for (let x = xc - 150; x < xc + 55; x += 24) { if (Math.abs(x - xc) < 20) continue; chalet(x, zc + 26, 13, 10, -1); chalet(x + 3, zc - 76 + (x % 5), 12, 10, 1); }
  for (let z = zc + 54; z < zc + 120; z += 22) { chalet(xc + 26, z, 10, 13, 0); chalet(xc - 26, z, 10, 13, 0); }
  // The car park, with lines and cars.
  { const x0 = xc + 20, x1 = xc + 130, z0 = zc + 40, z1 = zc + 100;
    kit.box(x0, z0, x1, z1, -0.1, 0.1, PAL.black); for (let x = x0 + 4; x < x1 - 3; x += 3.2) { kit.box(x, z0 + 3, x + 0.15, z0 + 9, 0.1, 0.12, PAL.white); kit.box(x, z1 - 9, x + 0.15, z1 - 3, 0.1, 0.12, PAL.white); }
    for (let x = x0 + 5.6; x < x1 - 5; x += 3.2) { if (rnd() < 0.6) kit.parked.push({ x, z: z0 + 6, h: 0, y: S.y + 0.12, type: (rnd() * 3) | 0, ci: (rnd() * 12) | 0 }); if (rnd() < 0.5) kit.parked.push({ x, z: z1 - 6, h: Math.PI, y: S.y + 0.12, type: (rnd() * 3) | 0, ci: (rnd() * 12) | 0 }); }
    ctx.L.parked.push(...kit.parked);
  }
  // An ice rink with boards, and floodlights.
  { const x0 = xc - 150, x1 = x0 + 56, z0 = zc + 56, z1 = z0 + 30;
    kit.box(x0, z0, x1, z1, -0.1, 0.12, hex('#cfe6f2')); for (const [a, b, c, d] of [[x0, z0, x1, z0 + 0.3], [x0, z1 - 0.3, x1, z1], [x0, z0, x0 + 0.3, z1], [x1 - 0.3, z0, x1, z1]]) { kit.box(a, b, c, d, 0.12, 1.3, PAL.white); kit.collide(a, b, c, d); }
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { kit.beam([px, 0, pz], [px, 9, pz], 0.12, PAL.steel); kit.box(px - 0.7, pz - 0.4, px + 0.7, pz + 0.4, 9, 9.4, PAL.lamp, kit.e); }
  }
  // The chairlift: from a base station up the steepest slope near the resort, pylons, a cable and chairs.
  { let best = null; for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, ex = X + 240 + Math.cos(a) * 520, ez = Z + Math.sin(a) * 520, bx = X + 240, bz = Z, rise = heightAt(ex, ez) - heightAt(bx, bz); if (Math.cos(a) > -0.2 && (!best || rise > best.rise)) best = { a, rise, bx, bz }; }
    const { a, bx, bz } = best, ux = Math.cos(a), uz = Math.sin(a), n = 8, pts = [];
    for (let k = 0; k <= n; k++) { const x = bx + ux * 60 * k + 40 * ux, z = bz + uz * 60 * k + 40 * uz, y = heightAt(x, z); pts.push([x, y, z]); }
    pts.forEach(([x, y, z], k) => { const h = 9; kit.beam([x, y - kit.Y - 0.3, z], [x, y - kit.Y + h, z], 0.16, PAL.steel); kit.box(x - 1.6 * uz, z + 1.6 * ux - 0.15, x + 1.6 * uz, z - 1.6 * ux + 0.15, y - kit.Y + h, y - kit.Y + h + 0.3, PAL.steel, kit.m); kit.ring(x, z, 0.5); });
    for (let k = 0; k < n; k++) for (const sd of [-1, 1]) { const [x0, y0, z0] = pts[k], [x1, y1, z1] = pts[k + 1], ox = -uz * 1.5 * sd, oz = ux * 1.5 * sd; kit.beam([x0 + ox, y0 - kit.Y + 9.3, z0 + oz], [x1 + ox, y1 - kit.Y + 9.3, z1 + oz], 0.03, PAL.black); }
    for (let k = 0; k < n; k++) for (let c = 0.15; c < 1; c += 0.35) { const [x0, y0, z0] = pts[k], [x1, y1, z1] = pts[k + 1], x = x0 + (x1 - x0) * c + (-uz) * 1.5 * (k % 2 ? 1 : -1), z = z0 + (z1 - z0) * c + ux * 1.5 * (k % 2 ? 1 : -1), y = y0 + (y1 - y0) * c - kit.Y + 9.3; kit.beam([x, y, z], [x, y - 1.9, z], 0.03, PAL.black); kit.box(x - 0.55, z - 0.35, x + 0.55, z + 0.35, y - 2.3, y - 1.9, PAL.red); }
    const [sx, sy, sz] = pts[0]; kit.box(sx - 5, sz - 4, sx + 5, sz + 4, sy - kit.Y - 0.3, sy - kit.Y + 4, PAL.wood); kit.gable(sx - 5, sz - 4, sx + 5, sz + 4, sy - kit.Y + 4, 2, PAL.wood, SNOW, true, 0.6); kit.collide(sx - 5, sz - 4, sx + 5, sz + 4);
    signBoard('SKI LIFT', 'GOLD RUN · BLUE RUN', sx, sy - kit.Y + 3, sz + 5, 0, 4.2, 1.4, '#a53a2d', '#f4efe2');
    // Snowy pines up the slope on either side of the lift line, and round the resort.
    const trees = []; for (let k = 0; k < 90; k++) { const t = rnd() * (n + 1) * 60, off = (rnd() < 0.5 ? -1 : 1) * (14 + rnd() * 40); trees.push([bx + ux * t - uz * off, bz + uz * t + ux * off, 1 + rnd() * 0.9, rnd()]); }
    for (let k = 0; k < 70; k++) { const px = X - 260 + rnd() * 520, pz = Z - 220 + rnd() * 440; if (Math.abs(pz - zc) < 18 && px > X - 250) continue; if (Math.abs(px - xc) < 14) continue; if (px > xc + 12 && px < xc + 135 && pz > zc + 36 && pz < zc + 104) continue; trees.push([px, pz, 0.9 + rnd() * 0.8, rnd()]); }
    planted(city, kit, 'snowPine', 'pine', trees.filter(t => !(Math.abs(t[1] - zc) < 22 && t[0] > X - 250 && t[0] < X + 260) && !(Math.abs(t[0] - xc) < 14)));
  }
  // Lamps and benches along the street.
  for (let x = main.pts[0][0] + 10; x < main.pts[1][0]; x += 32) for (const sd of [-1, 1]) { if (Math.abs(x - xc) < 16) continue; ctx.L.lamps.push([x, zc + sd * 8, Math.atan2(0, -sd), CURB]); }
  signBoard('FROSTLINE RESORT', 'ELEV. 1,420 M · CHAINS ADVISED', X - 250, 3.8, Z + 10, Math.PI / 2, 6.5, 2.4, '#2b3a4a', '#f4efe2');
};

// --- Dusty Gulch: a ghost town. Weathered false-front buildings along a dirt street with boardwalks, a church, a water tower and a mine ----------------
BUILDERS.western = ({ S, kit, ctx, rnd, city, signBoard, mats }) => {
  const [main] = S.streets, zc = main.pts[0][1], xa = main.pts[0][0] + 20, xb = main.pts[1][0] - 20, DIRT = hex('#b08f62'), W = [hex('#9b7a56'), hex('#7d6a52'), hex('#a8845a'), hex('#8a5b45'), hex('#6e7a72'), hex('#b49a6c')];
  kit.box(xa - 20, zc - main.hw, xb + 20, zc + main.hw, 0.04, 0.09, DIRT);                                              // the street is dirt: a layer over the asphalt strip
  const front = (cx, side, w, d, floors, name, sub) => {                                                              // side -1: north of the street (its front faces +z)
    const x0 = cx - w / 2, x1 = cx + w / 2, zf = zc + side * (main.hw + 3.4), z0 = side < 0 ? zf - d : zf, z1 = side < 0 ? zf : zf + d, h = floors * 3.7, c = W[(rnd() * W.length) | 0], fz = side < 0 ? z1 : z0, dz = side < 0 ? 1 : -1;
    kit.box(x0, z0, x1, z1, 0, h, c); kit.collide(x0, z0, x1, z1);
    kit.box(x0 - 0.1, fz - 0.15 + (dz > 0 ? 0 : -0.1), x1 + 0.1, fz + 0.15 + (dz > 0 ? 0.1 : 0), h, h + 2.2 + (rnd() < 0.5 ? 0.8 : 0), c);                        // the false front
    kit.box(x0, z0, x1, z1, h, h + 0.2, PAL.dark);
    kit.windows(x0, z0, x1, z1, 1.2, floors, 3.7, { w: 1.2, h: 1.9, gap: 3.4, doorAt: true, sides: [`0,${dz}`] });
    kit.panel(cx, 0.1, fz, 0, dz, 1.5, 2.5, PAL.dark, kit.g, 0.06);
    const bz0 = side < 0 ? fz : fz - 3.2, bz1 = side < 0 ? fz + 3.2 : fz;                                              // the boardwalk and its roof on posts
    kit.box(x0 - 0.3, bz0, x1 + 0.3, bz1, 0, 0.35, PAL.wood); kit.box(x0 - 0.5, bz0, x1 + 0.5, bz1 + (side < 0 ? 0.4 : -0.4), 3.4, 3.65, PAL.dark);
    for (let k = 0; k <= Math.floor(w / 3.4); k++) { const px = x0 + k * (w / Math.floor(w / 3.4)); kit.box(px - 0.12, side < 0 ? bz1 - 0.2 : bz0, px + 0.12, side < 0 ? bz1 : bz0 + 0.2, 0.35, 3.4, PAL.dark); }
    signBoard(name, sub, cx, h + 1.2, fz + dz * 0.32, side < 0 ? 0 : Math.PI, Math.min(w - 1, 7), 1.9, '#3b2a1e', '#e9d9b0');
    kit.box(cx - 0.3, bz1 - (side < 0 ? 0.2 : 3.0) - (side < 0 ? 0 : 0), cx + 0.3, bz1 + (side < 0 ? 0 : 0), 0, 0, c);
  };
  const north = [['SALOON', 'ESTD 1874', 14, 2], ['HOTEL', 'ROOMS · BATHS', 16, 2], ['GENERAL STORE', 'DRY GOODS', 12, 1], ['BANK', 'GOLD BOUGHT', 11, 2], ['BARBER', 'SHAVES 2 BITS', 9, 1], ['LIVERY', 'HORSES', 15, 1]];
  const south = [['SHERIFF', 'LAW & ORDER', 11, 1], ['ASSAY OFFICE', 'ASSAYS', 10, 1], ['SMITHY', 'FORGE', 13, 1], ['UNDERTAKER', 'COFFINS', 10, 2], ['FEED & SEED', 'GRAIN', 14, 1]];
  let x = xa + 6; for (const [n, sub, w, fl] of north) { front(x + w / 2, -1, w, 12, fl, n, sub); x += w + 3 + rnd() * 2.5; }
  x = xa + 22; for (const [n, sub, w, fl] of south) { front(x + w / 2, 1, w, 11, fl, n, sub); x += w + 3 + rnd() * 3; }
  // Hitching rails, water troughs, barrels and a few wagon wheels along the street.
  for (let k = 0; k < 9; k++) { const px = xa + 24 + k * 38 + rnd() * 6, sd = k % 2 ? 1 : -1, pz = zc + sd * (main.hw - 1.6); kit.box(px - 1.4, pz - 0.07, px + 1.4, pz + 0.07, 1.0, 1.12, PAL.dark); kit.box(px - 1.4, pz - 0.1, px - 1.25, pz + 0.1, 0, 1.1, PAL.dark); kit.box(px + 1.25, pz - 0.1, px + 1.4, pz + 0.1, 0, 1.1, PAL.dark); kit.box(px + 2, pz - 0.5, px + 3.6, pz + 0.5, 0, 0.7, PAL.wood);
    if (k % 3 === 0) { kit.cyl(0.5, 0.5, 1.0, 10, px - 3, 0, pz + sd * 1.0, PAL.wood); kit.ring(px - 3, pz + sd * 1.0, 0.55); } }
  // The church at the west end: white boards, a belfry with a little spire.
  { const x0 = xa - 40, x1 = x0 + 12, z0 = zc - 40, z1 = zc - 16, h = 6;
    kit.box(x0, z0, x1, z1, 0, h, PAL.white); kit.gable(x0, z0, x1, z1, h, 4, PAL.white, hex('#5a4a40'), false, 0.5); kit.collide(x0, z0, x1, z1);
    kit.box((x0 + x1) / 2 - 1.8, z1 - 3.6, (x0 + x1) / 2 + 1.8, z1, h, h + 7, PAL.white); kit.cone(2.8, 4.4, 4, (x0 + x1) / 2, h + 7, z1 - 1.8, hex('#5a4a40')); kit.panel((x0 + x1) / 2, 0.1, z1, 0, 1, 2, 3, PAL.dark);
    kit.panel((x0 + x1) / 2, h + 3, z1, 0, 1, 1.6, 2.2, PAL.glass, kit.g, 0.08);
  }
  // A wooden water tower at the east end, and a windmill.
  { const wx = xb + 28, wz = zc - 26;
    for (const [a, b] of [[-2.6, -2.6], [2.6, -2.6], [2.6, 2.6], [-2.6, 2.6]]) kit.beam([wx + a, 0, wz + b], [wx + a * 0.85, 14, wz + b * 0.85], 0.2, PAL.dark, kit.p);
    for (const hh of [4, 9]) for (const [a, b, c, d] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) kit.beam([wx + a * 2.5, hh, wz + b * 2.5], [wx + c * 2.5, hh, wz + d * 2.5], 0.1, PAL.dark, kit.p);
    kit.cyl(3.1, 3.1, 5, 14, wx, 14, wz, hex('#8d6b45')); kit.cone(3.4, 2.2, 14, wx, 19, wz, hex('#5a4a40')); kit.ring(wx, wz, 3);
  }
  // The mine on the northern edge: a head frame with a wheel, a shed, rails with ore trucks and a heap of spoil.
  { const mx = S.x - 60, mz = S.z - 150, h = 15;
    kit.beam([mx - 4, 0, mz - 3], [mx, h, mz], 0.3, PAL.dark, kit.p); kit.beam([mx + 4, 0, mz - 3], [mx, h, mz], 0.3, PAL.dark, kit.p); kit.beam([mx - 4, 0, mz + 3], [mx, h, mz], 0.3, PAL.dark, kit.p); kit.beam([mx + 4, 0, mz + 3], [mx, h, mz], 0.3, PAL.dark, kit.p);
    kit.cyl(1.8, 1.8, 0.5, 16, mx, h - 0.2, mz, PAL.steel); kit.box(mx - 8, mz + 6, mx + 2, mz + 14, 0, 4, hex('#7d6a52')); kit.gable(mx - 8, mz + 6, mx + 2, mz + 14, 4, 2, hex('#7d6a52'), PAL.tin, true, 0.4); kit.collide(mx - 8, mz + 6, mx + 2, mz + 14);
    kit.cone(14, 7, 12, mx + 22, 0, mz - 4, hex('#8a7a66')); kit.ring(mx + 22, mz - 4, 10);
    for (const sd of [-0.6, 0.6]) kit.box(mx + 2, mz + sd - 0.05, mx + 40, mz + sd + 0.05, 0.05, 0.12, PAL.steel, kit.m);
    for (let k = 0; k < 3; k++) kit.box(mx + 10 + k * 4.2, mz - 0.9, mx + 13 + k * 4.2, mz + 0.9, 0.4, 1.5, PAL.rust);
  }
  // Cacti and boulders round the edges.
  const cacti = [], rocks = []; for (let k = 0; k < 46; k++) { const a = rnd() * TAU, r = 1 + rnd() * 0.35, px = S.x + Math.cos(a) * S.pads[0].hx * r, pz = S.z + Math.sin(a) * S.pads[0].hz * r; (rnd() < 0.7 ? cacti : rocks).push([px, pz, 0.8 + rnd() * 0.9, rnd()]); }
  planted(city, kit, 'cactus', 'cactus', cacti); planted(city, kit, 'rock', 'rock', rocks.map(r => [r[0], r[1], r[2] * 1.4, r[3]]));
  signBoard('DUSTY GULCH', 'POP. 0 · DRIVE SLOW', xa - 70, 3.2, zc + 6, Math.PI / 2, 5.4, 2, '#3b2a1e', '#e9d9b0');
};

// --- The oil field: pumpjacks nodding on the desert, tanks, pipes and a flare ------------------------------------------------------------------------------
BUILDERS.oil = ({ S, kit, ctx, rnd, city, signBoard, anim, mats }) => {
  const X = S.x, Z = S.z;
  kit.box(X - 80, Z - 60, X + 80, Z + 60, -0.1, 0.1, hex('#8a8372'));                                                     // the gravel yard
  for (const [dx, dz] of [[-40, -24], [-12, -24], [16, -24], [-40, 8], [-8, 8]]) { kit.cyl(9, 9, 12, 20, X + dx, 0, Z + dz, PAL.tin); kit.cone(9.2, 1.6, 20, X + dx, 12, Z + dz, PAL.steel); kit.ring(X + dx, Z + dz, 9.2); for (let k = 1; k < 4; k++) kit.cyl(9.06, 9.06, 0.2, 20, X + dx, k * 3, Z + dz, PAL.steel); }
  for (const [dx, dz, w, d, h] of [[48, 20, 14, 9, 4.6], [48, -20, 8, 8, 3.2]]) { kit.box(X + dx - w / 2, Z + dz - d / 2, X + dx + w / 2, Z + dz + d / 2, 0, h, PAL.white); kit.gable(X + dx - w / 2, Z + dz - d / 2, X + dx + w / 2, Z + dz + d / 2, h, 1.4, PAL.white, PAL.slate, true, 0.4); kit.collide(X + dx - w / 2, Z + dz - d / 2, X + dx + w / 2, Z + dz + d / 2); }
  for (let k = 0; k < 8; k++) kit.beam([X - 50 + k * 14, 0.9, Z + 30], [X - 50 + k * 14, 0.9, Z + 36], 0.12, PAL.steel);                                  // a pipe rack
  kit.beam([X - 52, 1.6, Z + 33], [X + 40, 1.6, Z + 33], 0.3, hex('#8a5a3a')); kit.beam([X - 52, 2.3, Z + 33], [X + 40, 2.3, Z + 33], 0.22, PAL.steel);
  signBoard('BLACK MESA', 'OIL FIELD · AUTHORISED ONLY', X + 22, 2.6, Z + 62, 0, 5.6, 2, '#1f2024', '#f2c14e');
  // The flare stack, with a flame that flickers.
  { const fx = X + 70, fz = Z - 50; kit.beam([fx, 0, fz], [fx, 36, fz], 0.35, PAL.steel); kit.cyl(0.5, 0.5, 2, 8, fx, 36, fz, PAL.dark); kit.ring(fx, fz, 1);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.4, 8).translate(0, 2.2, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.2, 0.5), transparent: true, opacity: 0.9, depthWrite: false })); flame.position.set(fx, kit.Y + 38, fz); kit.group.add(flame);
    anim.push((t) => { const s = 0.85 + 0.3 * Math.sin(t * 17 + 1) * Math.sin(t * 9); flame.scale.set(s * 0.9, 0.8 + s * 0.5, s * 0.9); }); }
  // Pumpjacks scattered over the flat ground round the yard, each on a small concrete base with a pipe to the yard.
  const jacks = [];
  for (let k = 0, tries = 0; k < 22 && tries < 400; tries++) {
    const a = rnd() * TAU, r = 130 + rnd() * 380, x = X + Math.cos(a) * r * 1.15, z = Z + Math.sin(a) * r, y = heightAt(x, z);
    if (Math.abs(heightAt(x + 8, z) - y) > 1.6 || Math.abs(heightAt(x, z + 8) - y) > 1.6) continue;
    if (jacks.some(j => Math.hypot(j[0] - x, j[1] - z) < 60)) continue;
    jacks.push([x, z, y, rnd() * TAU, rnd()]); k++;
  }
  for (const [x, z, y, yaw, ph] of jacks) {
    kit.p.box(x - 3.4, z - 1.8, x + 3.4, z + 1.8, y - 0.3, y + 0.35, 3, hex('#9d988d'));
    const cs = Math.cos(yaw), sn = Math.sin(yaw), at = (u, v, hgt) => [x + u * cs + v * sn, hgt, z - u * sn + v * cs];
    for (const sd of [-0.7, 0.7]) kit.m.q4(at(-0.4, sd, y + 0.3), at(0.4, sd, y + 0.3), at(0, sd, y + 4.6), at(0, sd, y + 4.6), [[0, 0], [1, 0], [0.5, 1], [0.5, 1]], PAL.steel);
    kit.beam([x + (-1.2) * cs, y + 0.35 - kit.Y, z + 1.2 * sn], [x + (-1.2) * cs, y + 3.2 - kit.Y, z + 1.2 * sn], 0.1, PAL.black);
    // The walking beam, the horse's head and the counterweight: one piece that rocks about the top of the frame.
    const pg = []; pg.push(paint(new THREE.BoxGeometry(7.4, 0.5, 0.7).translate(0, 0, 0), PAL.orange)); pg.push(paint(new THREE.BoxGeometry(1.6, 1.5, 0.5).translate(3.9, -0.6, 0), PAL.orange)); pg.push(paint(new THREE.BoxGeometry(1.2, 1.4, 0.8).translate(-3.6, -0.6, 0), PAL.dark));
    const beamM = new THREE.Mesh(mergeSimple(pg), mats.metal), outer = new THREE.Group(); beamM.position.y = 0; const pivot = new THREE.Group(); pivot.position.y = 4.6; pivot.add(beamM); outer.add(pivot); outer.position.set(x, y, z); outer.rotation.y = yaw + Math.PI / 2; kit.group.add(outer);
    anim.push((t) => { pivot.rotation.z = Math.sin(t * 1.1 + ph * 6) * 0.26; });
    kit.ring(x, z, 2.4);
    // A short pipe with a valve box beside it.
    kit.beam([x - 1, y + 0.5 - kit.Y, z + 2.2], [x + 7, y + 0.5 - kit.Y, z + 2.2], 0.14, PAL.black); kit.box(x + 7, z + 1.6, x + 8.2, z + 2.8, y - kit.Y, y - kit.Y + 0.9, hex('#6a7a5a'));
  }
};

// --- The solar farm on the dry lake: rows of tilted panels, inverter cabinets, a substation and a pylon ----------------------------------------------------
BUILDERS.solar = ({ S, kit, ctx, rnd, city, signBoard }) => {
  const X = S.x, Z = S.z, p = S.pads[0], x0 = X - p.hx + 20, x1 = X + p.hx - 20, z0 = Z - p.hz + 30, z1 = Z + p.hz - 40, PN = hex('#1d3b6e'), FR = hex('#9aa4ad');
  const rows = Math.floor((z1 - z0) / 11);
  for (let r = 0; r < rows; r++) {
    const zb = z0 + r * 11;                                                                                             // a row: panels tilted to face south (+z), high edge north
    for (let x = x0; x < x1 - 12; x += 13) {
      const w = 12, lo = [zb + 5.2, 0.7], hi = [zb, 2.9];
      kit.g.q4([x, kit.Y + lo[1], lo[0]], [x + w, kit.Y + lo[1], lo[0]], [x + w, kit.Y + hi[1], hi[0]], [x, kit.Y + hi[1], hi[0]], [[0, 0], [1, 0], [1, 1], [0, 1]], PN);
      kit.m.q4([x - 0.05, kit.Y + lo[1] - 0.03, lo[0] + 0.02], [x + w + 0.05, kit.Y + lo[1] - 0.03, lo[0] + 0.02], [x + w + 0.05, kit.Y + lo[1] - 0.03, lo[0] - 0.08], [x - 0.05, kit.Y + lo[1] - 0.03, lo[0] - 0.08], [[0, 0], [1, 0], [1, 1], [0, 1]], FR);
    }
    kit.box(x0 - 0.2, zb + 2.2, x1 - 12, zb + 2.5, 0.8, 1.1, PAL.steel, kit.m);
    for (let x = x0 + 2; x < x1 - 12; x += 13) kit.box(x - 0.1, zb + 4.6, x + 0.1, zb + 4.8, 0, 1.4, PAL.steel, kit.m);
  }
  for (let r = 3; r < rows; r += 4) { const zb = z0 + r * 11 + 7.4, x = x1 + 4; kit.box(x - 1.4, zb, x + 1.4, zb + 1.2, 0, 2.2, hex('#d9d9d4')); kit.ring(x, zb + 0.6, 1.6); }
  // The control building, the transformer yard and a pylon.
  kit.box(X - 40, z1 + 8, X - 18, z1 + 22, 0, 4.2, PAL.white); kit.box(X - 40.4, z1 + 7.6, X - 17.6, z1 + 22.4, 4.2, 4.6, PAL.slate); kit.collide(X - 40, z1 + 8, X - 18, z1 + 22); kit.windows(X - 40, z1 + 8, X - 18, z1 + 22, 1.2, 1, 3, { w: 1.4, h: 1.2, gap: 4 });
  for (let k = 0; k < 3; k++) { kit.box(X + 8 + k * 9, z1 + 10, X + 14 + k * 9, z1 + 16, 0, 4, hex('#7c8a7a')); kit.box(X + 9 + k * 9, z1 + 11, X + 13 + k * 9, z1 + 15, 4, 5.4, PAL.steel, kit.m); kit.collide(X + 8 + k * 9, z1 + 10, X + 14 + k * 9, z1 + 16); }
  { const px = X + 70, pz = z1 + 14, h = 34;
    for (const [a, b] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) kit.beam([px + a, 0, pz + b], [px + a * 0.25, h, pz + b * 0.25], 0.18, PAL.steel);
    for (const hh of [8, 16, 24]) for (const [a, b, c, d] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) { const k = 1 - hh / h * 0.75; kit.beam([px + a * 3 * k, hh, pz + b * 3 * k], [px + c * 3 * k, hh, pz + d * 3 * k], 0.08, PAL.steel); }
    for (const hh of [h - 3, h - 8]) { kit.beam([px - 7, hh, pz], [px + 7, hh, pz], 0.12, PAL.steel); for (const sx of [-7, 7]) kit.beam([px + sx, hh, pz], [px + sx, hh - 1.4, pz], 0.05, PAL.black); }
    kit.ring(px, pz, 3.4);
  }
  kit.fence([[x0 - 10, z0 - 12], [x1 + 10, z0 - 12], [x1 + 10, z1 + 26], [x0 - 10, z1 + 26], [x0 - 10, z0 - 12]], PAL.steel, 2.2);
  signBoard('DRY LAKE SOLAR', '120 MW · NO ENTRY', X - 6, 3, z1 + 27, 0, 6, 2.2, '#16365e', '#f4efe2');
};

// --- The radio telescope: big white dishes that turn slowly, a control block and a mast with a red light --------------------------------------------------
BUILDERS.dishes = ({ S, kit, ctx, rnd, city, signBoard, anim, mats }) => {
  const X = S.x, Z = S.z, white = hex('#e8eaec');
  const seg = (p0, p1, r, c) => { const d = new THREE.Vector3(...p1).sub(new THREE.Vector3(...p0)), g = new THREE.CylinderGeometry(r, r, d.length(), 6); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())); g.translate((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2); return paint(g, c); };
  const dishAt = (x, z, R, ph) => {
    kit.cyl(1.8, 2.6, 8, 14, x, 0, z, white); kit.cyl(3.4, 3.4, 1.4, 14, x, 8, z, PAL.steel); kit.ring(x, z, 3);
    const g = [], A = 1.45 * R, th = 0.74, rim = A * Math.sin(th), depth = A * (1 - Math.cos(th)), focus = depth + R * 0.55;
    g.push(paint(new THREE.SphereGeometry(A, 28, 8, 0, TAU, 0, th).rotateX(Math.PI).translate(0, A, 0), white));                // a bowl, open to +y
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4; g.push(seg([Math.cos(a) * rim, depth, Math.sin(a) * rim], [0, focus, 0], 0.09, PAL.steel)); }
    g.push(paint(new THREE.BoxGeometry(1.3, 1.1, 1.3).translate(0, focus + 0.4, 0), PAL.dark)); g.push(paint(new THREE.CylinderGeometry(1.2, 1.2, 0.6, 12).translate(0, -0.3, 0), PAL.steel));
    const mesh = new THREE.Mesh(mergeSimple(g), mats.metal), yoke = new THREE.Group(); yoke.add(mesh); yoke.position.set(x, kit.Y + 9.8, z); kit.group.add(yoke);
    anim.push((t) => { yoke.rotation.y = t * 0.05 + ph * 6; mesh.rotation.x = 0.55 + 0.35 * Math.sin(t * 0.09 + ph * 9); });
  };
  const spots = [[0, 0], [-120, -30], [120, -40], [-60, 110], [70, 120], [0, -130]];
  spots.forEach(([dx, dz], k) => dishAt(X + dx, Z + dz, k === 0 ? 17 : 12, k * 0.13));
  kit.box(X - 22, Z + 48, X + 14, Z + 66, 0, 5, PAL.white); kit.box(X - 22.4, Z + 47.6, X + 14.4, Z + 66.4, 5, 5.5, PAL.slate); kit.collide(X - 22, Z + 48, X + 14, Z + 66); kit.windows(X - 22, Z + 48, X + 14, Z + 66, 1.4, 1, 3, { w: 1.4, h: 1.2, gap: 4 });
  { const mx = X + 56, mz = Z + 56, h = 48; for (const [a, b] of [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]]) kit.beam([mx + a, 0, mz + b], [mx + a * 0.25, h, mz + b * 0.25], 0.12, PAL.steel);
    for (let hh = 6; hh < h; hh += 6) for (const [a, b, c, d] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) { const k = 1 - hh / h * 0.85; kit.beam([mx + a * 1.5 * k, hh, mz + b * 1.5 * k], [mx + c * 1.5 * k, hh, mz + d * 1.5 * k], 0.05, PAL.steel); }
    kit.ring(mx, mz, 1.8); const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.3, 0.2) })); lamp.position.set(mx, kit.Y + h + 0.6, mz); kit.group.add(lamp); anim.push((t) => { lamp.visible = Math.floor(t * 1.1) % 2 === 0; }); }
  kit.fence([[X - 160, Z - 170], [X + 160, Z - 170], [X + 160, Z + 160], [X - 160, Z + 160], [X - 160, Z - 170]], PAL.steel, 2);
  signBoard('DRY LAKE OBSERVATORY', 'RADIO TELESCOPE · KEEP OUT', X + 6, 3, Z + 70, 0, 6.8, 2.2, '#1d2630', '#e8c14e');
};
