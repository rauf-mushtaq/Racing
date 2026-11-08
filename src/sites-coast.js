// The places on the coast: a working harbour, a seaside village with a pier, and a lighthouse. See towns.js and kit.js.
import * as THREE from 'three';
import { heightAt, SEA_Y } from './world.js';
import { Kit, PAL, WHITE, CURB, hex, paint } from './kit.js';
import { addStaticCollider } from './city.js';
import { TOD } from './tod.js';

export const BUILDERS = {};
const TAU = Math.PI * 2;

// A boat: a hull (a wedge-ended prism along z), a cabin and a mast. Placed at (x, z), pointing along ±z.
function boat(kit, x, z, len, w, hullC, cabinC, dir = 1, yaw = 0) {
  const sea = SEA_Y - kit.Y + 0.35, h = 1.6 + len * 0.04, g = kit.p, a = Math.cos(yaw), b = Math.sin(yaw);
  const P = (u, v, y) => [x + u * a + v * b, kit.Y + sea + y, z - u * b + v * a];
  const hull = [[-w / 2, 0], [w / 2, 0]];
  // the hull: two sides meeting at a bow, a flat deck and a transom
  const bow = P(0, len / 2 * dir, h * 0.9), sb = [P(-w / 2, -len / 2 * dir, h), P(-w / 2, len * 0.15 * dir, h)], pt = [P(w / 2, -len / 2 * dir, h), P(w / 2, len * 0.15 * dir, h)], ks = [P(-w * 0.18, -len / 2 * dir, -0.4), P(w * 0.18, -len / 2 * dir, -0.4), P(0, len / 2 * dir, 0.2)];
  const q = (A, B, C, D, c, d) => { const mid = [(A[0] + B[0] + C[0] + D[0]) / 4 - x, (A[1] + B[1] + C[1] + D[1]) / 4 - kit.Y - sea - h / 2, (A[2] + B[2] + C[2] + D[2]) / 4 - z]; return quadToward(g, A, B, C, D, [[0, 0], [1, 0], [1, 1], [0, 1]], c, mid); };
  q(sb[0], sb[1], P(-w * 0.18, len * 0.15 * dir, -0.4), ks[0], hullC); q(sb[1], bow, ks[2], P(-w * 0.18, len * 0.15 * dir, -0.4), hullC);
  q(pt[0], pt[1], P(w * 0.18, len * 0.15 * dir, -0.4), ks[1], hullC); q(pt[1], bow, ks[2], P(w * 0.18, len * 0.15 * dir, -0.4), hullC);
  q(sb[0], pt[0], ks[1], ks[0], hullC);
  g.q4(sb[0], sb[1], pt[1], pt[0], [[0, 0], [1, 0], [1, 1], [0, 1]], PAL.wood); g.q4(sb[1], bow, bow, pt[1], [[0, 0], [1, 0], [1, 1], [0, 1]], PAL.wood);
  // cabin and mast
  const cl = len * 0.28, cx0 = -w * 0.32, cx1 = w * 0.32, cz0 = -len * 0.25 * dir, cz1 = cz0 + cl * dir;
  const cab = [P(cx0, cz0, h), P(cx1, cz0, h), P(cx1, cz1, h), P(cx0, cz1, h)], top = cab.map(p => [p[0], p[1] + 1.9, p[2]]);
  for (let k = 0; k < 4; k++) q(cab[k], cab[(k + 1) % 4], top[(k + 1) % 4], top[k], cabinC);
  g.q4(top[0], top[1], top[2], top[3], [[0, 0], [1, 0], [1, 1], [0, 1]], PAL.white);
  kit.beam([x + 0 * a + (len * 0.1 * dir) * b, sea + h, z + (len * 0.1 * dir) * a], [x + (len * 0.1 * dir) * b, sea + h + len * 0.45, z + (len * 0.1 * dir) * a], 0.06, PAL.steel);
}
import { quadToward } from './geom.js';

// --- Port Meridian: quay, warehouses, cranes, containers, tanks, a pier with a small lighthouse, fishing boats and a ship at anchor ------------------
BUILDERS.harbour = ({ S, kit, ctx, rnd, city, signBoard, anim, mats }) => {
  const X = S.x, Z = S.z, Qx0 = -3320, Qx1 = -3150, Qz0 = Z - 150, Qz1 = Z + 150, SEA = SEA_Y - kit.Y, walk = (x0, z0, x1, z1) => { ctx.gb.walk.box(x0, z0, x1, z1, 0, CURB, 6, WHITE); ctx.gb.curb.box(x0, z0, x1, z1, 0, CURB, 4.5, WHITE); };
  const CON = hex('#b9b5ab'), TIN = [hex('#9aa6ad'), hex('#a8b0a0'), hex('#b0a89a')];
  // The quay: a concrete deck over the land and a wall down into the water.
  kit.box(Qx0, Qz0, Qx1, Qz1, -0.6, 0.02, CON); kit.box(Qx0 - 1, Qz0, Qx0, Qz1, SEA - 4, 0.02, hex('#8f8b83'));
  kit.box(Qx0, Qz0, Qx0 + 0.6, Qz1, 0.02, 0.4, PAL.dark); for (let z = Qz0 + 8; z < Qz1; z += 16) { kit.cyl(0.32, 0.4, 0.9, 8, Qx0 + 1.4, 0.02, z, PAL.black); }
  for (let z = Qz0 + 4; z < Qz1; z += 12) kit.box(Qx0 - 1.2, z - 0.5, Qx0 - 0.8, z + 0.5, SEA + 0.2, SEA + 1.9, PAL.black);                                    // fenders
  kit.box(Qx1, Z - 170, Qx1 + 155, Z + 215, -0.3, 0.02, hex('#8f8b83'));                                                                                    // the yard behind it
  // Warehouses: long corrugated halls with big doors, in a row along the back of the yard.
  const hall = (x0, z0, x1, z1, h, c) => { kit.box(x0, z0, x1, z1, 0, h, c); kit.gable(x0, z0, x1, z1, h, 3, c, hex('#8d949a'), x1 - x0 >= z1 - z0, 0.5); kit.collide(x0, z0, x1, z1); kit.windows(x0, z0, x1, z1, h - 2.4, 1, 3, { w: 2.2, h: 0.9, gap: 6 });
    for (const [dx, dz, px, pz] of [[-1, 0, x0, (z0 + z1) / 2], [1, 0, x1, (z0 + z1) / 2]]) { if (x1 - x0 < z1 - z0) break; for (let k = -1; k <= 1; k++) kit.panel(px, 0.1, pz + k * 7, dx, dz, 5, Math.min(5.4, h - 1), hex('#5a6a78'), kit.g, 0.1); } };
  hall(Qx1 + 8, Z - 140, Qx1 + 56, Z - 100, 9, TIN[0]); hall(Qx1 + 8, Z - 90, Qx1 + 56, Z - 50, 9, TIN[1]); hall(Qx1 + 70, Z - 150, Qx1 + 140, Z - 110, 11, TIN[2]); hall(Qx1 + 70, Z + 80, Qx1 + 150, Z + 124, 10, TIN[0]);
  // The harbour office, with a flag and a radio mast, and a customs shed.
  { const x0 = Qx1 + 10, x1 = x0 + 22, z0 = Z + 30, z1 = z0 + 16; kit.box(x0, z0, x1, z1, 0, 7, hex('#c9c2b0')); kit.box(x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, 7, 7.5, PAL.dark); kit.collide(x0, z0, x1, z1); kit.windows(x0, z0, x1, z1, 1.2, 2, 3.2, { w: 1.4, h: 1.5, gap: 3.6, doorAt: true });
    kit.beam([x1 - 3, 7.5, z0 + 4], [x1 - 3, 22, z0 + 4], 0.1, PAL.steel); kit.box(x1 - 3, z0 + 3.9, x1 + 0.4, z0 + 4.1, 19, 20.6, PAL.blue); signBoard('PORT MERIDIAN', 'HARBOUR MASTER', (x0 + x1) / 2, 4.2, z0 - 0.4, Math.PI, 5, 1.7, '#14305a', '#f4efe2'); }
  // Two gantry cranes on the quay edge: portal legs, a long boom over the water, a cab.
  for (const cz of [Z - 70, Z + 50]) {
    const x0 = Qx0 + 3, x1 = Qx0 + 15, h = 30;
    for (const [px, pz] of [[x0, cz - 6], [x0, cz + 6], [x1, cz - 6], [x1, cz + 6]]) { kit.beam([px, 0, pz], [px, h, pz], 0.45, hex('#d9742b')); kit.ring(px, pz, 0.8); }
    for (const hh of [10, 20, h]) { kit.beam([x0, hh, cz - 6], [x1, hh, cz - 6], 0.3, hex('#d9742b')); kit.beam([x0, hh, cz + 6], [x1, hh, cz + 6], 0.3, hex('#d9742b')); kit.beam([x0, hh, cz - 6], [x0, hh, cz + 6], 0.3, hex('#d9742b')); kit.beam([x1, hh, cz - 6], [x1, hh, cz + 6], 0.3, hex('#d9742b')); }
    kit.beam([x0 - 36, h + 1.4, cz], [x1 + 14, h + 1.4, cz], 0.8, hex('#d9d6cf')); kit.box(x0 + 1, cz - 2.4, x0 + 7, cz + 2.4, h + 2.2, h + 5.4, hex('#d9d6cf')); kit.panel(x0 + 1, h + 3, cz, -1, 0, 3.6, 1.6, PAL.glass, kit.g, 0.05);
    kit.beam([x0 - 14, h + 1, cz], [x0 - 14, h - 8, cz], 0.05, PAL.black); kit.box(x0 - 15, cz - 1.2, x0 - 13, cz + 1.2, h - 10, h - 8, hex('#3a5a8a'));
    kit.beam([x0 - 36, h + 1.4, cz], [x0 - 30, h + 14, cz], 0.12, PAL.steel); kit.beam([x1 + 14, h + 1.4, cz], [x0 - 30, h + 14, cz], 0.12, PAL.steel);
  }
  // Container stacks in rows, one to three high, in all the colours.
  { const cols = ['#b5392a', '#2f6f9f', '#d49b2a', '#3d7a52', '#8a8f94', '#7a4a8a', '#c9c2b0', '#c0602a'].map(hex);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
      const x = Qx1 + 14 + c * 14, z = Z + 56 + 0 + r * 3.4 + (r > 1 ? 6 : 0) - 90 + 150, n = 1 + Math.floor(rnd() * 3);
      if (z > Z + 75 && x > Qx1 + 60) continue;
      for (let k = 0; k < n; k++) kit.box(x, z, x + 12.2, z + 2.5, k * 2.65, (k + 1) * 2.65, cols[(rnd() * cols.length) | 0]);
      kit.collide(x, z, x + 12.2, z + 2.5);
    }
  }
  // Fuel tanks at the south end.
  for (const [dx, dz] of [[40, 180], [66, 180], [90, 180]]) { kit.cyl(10, 10, 11, 20, Qx1 + dx, 0, Z + dz, hex('#d8d5ce')); kit.cone(10.2, 1.4, 20, Qx1 + dx, 11, Z + dz, PAL.steel); kit.ring(Qx1 + dx, Z + dz, 10.4); }
  // The pier: a wooden jetty out into the sea from the north end of the quay, with a small lighthouse at its end, and a gate across its root.
  { const px0 = Qx0 - 1, px1 = Qx0 - 150, pz0 = Qz0 + 24, pz1 = pz0 + 11;
    kit.box(px1, pz0, px0, pz1, SEA + 1.4, SEA + 2.6, hex('#7d6a50')); for (let x = px0; x > px1; x -= 6) for (const z of [pz0 + 0.8, pz1 - 0.8]) kit.cyl(0.35, 0.35, 5.6, 8, x, SEA - 3, z, PAL.dark);
    for (let x = px0 - 10; x > px1; x -= 12) { kit.box(x - 0.1, pz0, x + 0.1, pz0 + 0.12, SEA + 2.6, SEA + 3.6, PAL.white); kit.box(x - 0.1, pz1 - 0.12, x + 0.1, pz1, SEA + 2.6, SEA + 3.6, PAL.white); }
    kit.collide(px0 - 4, pz0 - 0.5, px0 - 2, pz1 + 0.5);
    const lx = px1 + 6, lz = (pz0 + pz1) / 2; kit.cyl(1.9, 2.4, 9, 12, lx, SEA + 2.6, lz, PAL.white); kit.cyl(2.0, 2.0, 1.6, 12, lx, SEA + 8, lz, PAL.red); kit.cyl(1.5, 1.5, 1.6, 12, lx, SEA + 11.6, lz, PAL.glass); kit.cone(1.9, 1.6, 12, lx, SEA + 13.2, lz, PAL.red); kit.box(lx - 0.5, lz - 0.5, lx + 0.5, lz + 0.5, SEA + 11.8, SEA + 13, PAL.lamp, kit.e);
    // Fishing boats tied up along the pier and the quay.
    boat(kit, px0 - 40, pz0 - 4, 11, 3.4, hex('#2f5a8a'), PAL.white, 1, 0.04); boat(kit, px0 - 70, pz1 + 4, 9, 3, hex('#a53a2d'), hex('#dcd5c0'), -1, -0.03); boat(kit, px0 - 105, pz0 - 4, 13, 3.8, hex('#3d7a52'), PAL.white, 1, 0.02); boat(kit, Qx0 - 8, Z - 20, 8, 2.8, hex('#d9742b'), PAL.white, 1, 1.57); boat(kit, Qx0 - 9, Z + 110, 10, 3.2, hex('#2a2a2e'), hex('#dcd5c0'), -1, 1.55);
  }
  // A ship at anchor 120 m off the quay: a long hull, a white bridge at the stern, containers on deck and masts.
  { const sx = Qx0 - 130, sz = Z - 40, L = 150, W = 24, sea = SEA + 0.2, hullC = hex('#7b2a22'), dark = hex('#1f2428');
    kit.prism([[-W / 2, -5.5], [-W / 2, 0], [-W / 2 + 1.2, 8.6], [W / 2 - 1.2, 8.6], [W / 2, 0], [W / 2, -5.5], [W * 0.18, -6], [-W * 0.18, -6]], false, sz - L / 2, sz + L / 2 - 14, sx, sea, dark, hullC);
    kit.prism([[-W / 2, 0], [-W / 2 + 1.2, 8.6], [0, 8.6], [W / 2 - 1.2, 8.6], [W / 2, 0]].map((p, i) => [p[0] * (i % 2 ? 1 : 1), p[1]]), false, sz + L / 2 - 14, sz + L / 2, sx, sea, dark, hullC);
    kit.box(sx - W / 2 + 1, sz - L / 2 + 6, sx + W / 2 - 1, sz + L / 2 - 14, sea + 8.6, sea + 8.9, hex('#4a4f54'));
    const cols = ['#b5392a', '#2f6f9f', '#d49b2a', '#3d7a52', '#8a8f94', '#c0602a'].map(hex);
    for (let z = sz - L / 2 + 10; z < sz + L / 2 - 30; z += 12.4) for (const dx of [-7.6, -2.5, 2.6, 7.7]) { const n = 1 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) kit.box(sx + dx - 2.2, z, sx + dx + 2.2, z + 12, sea + 8.9 + k * 2.65, sea + 8.9 + (k + 1) * 2.65, cols[(rnd() * cols.length) | 0]); }
    kit.box(sx - 9, sz + L / 2 - 22, sx + 9, sz + L / 2 - 4, sea + 8.6, sea + 24, PAL.white); kit.box(sx - 9.4, sz + L / 2 - 22.4, sx + 9.4, sz + L / 2 - 3.6, sea + 24, sea + 24.5, PAL.slate); kit.box(sx - 7, sz + L / 2 - 20, sx + 7, sz + L / 2 - 6, sea + 24.5, sea + 28, PAL.white);
    kit.panel(sx, sea + 25, sz + L / 2 - 20, 0, -1, 13, 2.2, PAL.glass, kit.g, 0.08); kit.cyl(1.4, 1.4, 6, 10, sx, sea + 28, sz + L / 2 - 9, PAL.red); kit.beam([sx, sea + 28, sz + L / 2 - 14], [sx, sea + 42, sz + L / 2 - 14], 0.15, PAL.steel);
  }
  // Lamps along the streets and a sign at the gate.
  for (let z = Z - 260; z <= Z + 260; z += 40) { ctx.L.lamps.push([Qx1 + 3, z, Math.PI / 2, 0.05]); }
  signBoard('PORT MERIDIAN', 'COMMERCIAL DOCKS · HARD HATS', X + 72, 3.4, Z + 10, -Math.PI / 2, 6, 2.2, '#14305a', '#f4efe2');
  // Boats are bobbing: the little ones rock.
  anim.push((t) => { });
};

// --- Sandy Cove: colourful beach houses, a boardwalk, shops, a lifeguard tower, umbrellas and a pier -------------------------------------------------------
BUILDERS.village = ({ S, kit, ctx, rnd, city, signBoard, anim }) => {
  const X = S.x, Z = S.z, [main, cross] = S.streets, zc = main.pts[0][1], SEA = SEA_Y - kit.Y, xc = cross.pts[0][0];
  const xs = Math.min(main.pts[0][0], main.pts[1][0]), xi = Math.max(main.pts[0][0], main.pts[1][0]);              // xs: the sea end of the street (west), xi: the inland end
  const walk = (x0, z0, x1, z1) => { if (x1 - x0 > 0.4 && z1 - z0 > 0.4) { ctx.gb.walk.box(x0, z0, x1, z1, 0, CURB, 6, WHITE); ctx.gb.curb.box(x0, z0, x1, z1, 0, CURB, 4.5, WHITE); } };
  for (const [a, b] of [[xs, xc - 11], [xc + 11, xi]]) { walk(a, zc - 11, b, zc - 6); walk(a, zc + 6, b, zc + 11); }
  const colours = ['#e8c2a0', '#9ad0cf', '#f0d36b', '#e89aa3', '#a6c8e8', '#c6e0a0', '#f2a56a', '#d8b0e0'].map(hex);
  const house = (x, z, w, d, f, name) => {
    const c = colours[(rnd() * colours.length) | 0], h = 3.4 + (rnd() < 0.4 ? 3.2 : 0), x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    kit.box(x0, z0, x1, z1, 0, h, c); kit.gable(x0, z0, x1, z1, h, 2.6, c, rnd() < 0.5 ? hex('#a64b3a') : hex('#4a7da8'), w >= d, 0.7); kit.collide(x0, z0, x1, z1);
    kit.windows(x0, z0, x1, z1, 1.1, h > 5 ? 2 : 1, 3, { w: 1.1, h: 1.4, gap: 3.2, doorAt: true }); kit.box(x - 1.5, f > 0 ? z1 : z0 - 2.2, x + 1.5, f > 0 ? z1 + 2.2 : z0, 0, 0.3, PAL.wood);
    if (name) signBoard(name, '', x, h + 0.9, z + f * (d / 2 + 0.2), f > 0 ? 0 : Math.PI, Math.min(5, w), 1.4, '#14506a', '#f4efe2');
  };
  const shops = ['SURF SHOP', 'ICE CREAM', 'FISH & CHIPS', 'BIKE HIRE', 'CAFÉ MARE'];
  let k = 0; for (let x = xs + 16; x < xi - 14; x += 19) { if (Math.abs(x - xc) < 18) continue; house(x, zc - 20, 12 + rnd() * 3, 11, 1, k < shops.length && rnd() < 0.6 ? shops[k++] : ''); house(x + 3, zc + 21, 12 + rnd() * 3, 11, -1, ''); }
  for (let z = cross.pts[0][1] + 20; z < cross.pts[1][1] - 18; z += 20) { if (Math.abs(z - zc) < 30) continue; house(xc - 18, z, 11, 12, 1, ''); house(xc + 18, z, 11, 12, -1, ''); }
  // The boardwalk along the sea edge of the village (west of the street), and a pier going out into the water.
  const bx = xs - 8;
  kit.box(bx - 5, Z - 190, bx, Z + 190, 0, 0.45, hex('#a58a62')); for (let z = Z - 188; z < Z + 190; z += 8) kit.box(bx - 4.8, z - 0.1, bx - 4.6, z + 0.1, 0.45, 1.2, PAL.dark);
  { const px0 = bx - 5, px1 = px0 - 130, pz = zc;
    kit.box(px1, pz - 3, px0, pz + 3, SEA + 1.2, SEA + 2.1, hex('#a58a62')); for (let x = px0; x > px1; x -= 5) for (const z of [pz - 2.6, pz + 2.6]) kit.cyl(0.3, 0.3, 5.5, 8, x, SEA - 3, z, PAL.dark);
    for (let x = px0 - 6; x > px1; x -= 10) for (const z of [pz - 3, pz + 3]) { kit.box(x - 0.08, z - 0.08, x + 0.08, z + 0.08, SEA + 2.1, SEA + 3.2, PAL.white); }
    kit.box(px1, pz - 5, px1 + 14, pz + 5, SEA + 2.1, SEA + 6, hex('#e8c2a0')); kit.gable(px1, pz - 5, px1 + 14, pz + 5, SEA + 6, 2.4, hex('#e8c2a0'), hex('#4a7da8'), true, 0.4);
    kit.collide(px0 + 1, pz - 3.4, px0 + 4, pz + 3.4); signBoard('SANDY COVE PIER', 'FISHING · AMUSEMENTS', px0 + 4, 4, pz, -Math.PI / 2, 5, 1.7, '#14506a', '#f4efe2');
    boat(kit, px0 - 50, pz - 8, 9, 3, hex('#e8e0d0'), hex('#4a7da8'), 1, 1.57); boat(kit, px0 - 90, pz + 9, 7, 2.6, hex('#d9742b'), PAL.white, -1, 1.55); }
  // Beach umbrellas and sunbeds, a lifeguard tower and a kiosk, between the boardwalk and the sea.
  for (let n = 0; n < 16; n++) { const ux = bx - 8 - rnd() * 40, uz = Z - 170 + rnd() * 340; if (Math.abs(uz - zc) < 12 || heightAt(ux, uz) < SEA_Y + 0.3) continue; const c = colours[(rnd() * colours.length) | 0], y = heightAt(ux, uz) - kit.Y; kit.beam([ux, y, uz], [ux, y + 2.2, uz], 0.04, PAL.dark); kit.cone(1.4, 0.5, 8, ux, y + 2.1, uz, c); kit.box(ux + 1.4, uz - 0.4, ux + 3, uz + 0.4, y, y + 0.35, PAL.white); }
  { const lx = bx - 16, lz = Z - 60, y = Math.max(0, heightAt(lx, lz) - kit.Y); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) kit.beam([lx + a, y, lz + b], [lx + a * 0.9, y + 2.8, lz + b * 0.9], 0.08, PAL.wood); kit.box(lx - 1.6, lz - 1.6, lx + 1.6, lz + 1.6, y + 2.8, y + 5, PAL.white); kit.gable(lx - 1.6, lz - 1.6, lx + 1.6, lz + 1.6, y + 5, 1.2, PAL.white, PAL.red, true, 0.4); kit.ring(lx, lz, 2); kit.panel(lx, y + 3, lz, 1, 0, 2.4, 1.3, PAL.glass, kit.g, 0.05); }
  // Palms along the main street and the sea front, lamps along the street.
  for (let x = xs + 8; x < xi; x += 24) { city.tree(ctx, x, zc - 8.2, 1.1, CURB, true); city.tree(ctx, x + 10, zc + 8.2, 1.1, CURB, true); }
  for (let z = Z - 180; z < Z + 180; z += 28) city.tree(ctx, bx + 2, z, 1.2, CURB, true);
  for (let x = xs + 10; x < xi - 6; x += 34) for (const sd of [-1, 1]) ctx.L.lamps.push([x, zc + sd * 6.8, Math.atan2(0, -sd), CURB]);
};

// --- North Point Light: a tall striped lighthouse with a turning beam, the keeper's cottage and a boathouse ---------------------------------------------
BUILDERS.lighthouse = ({ S, kit, ctx, rnd, city, signBoard, anim, mats }) => {
  const X = S.x, Z = S.z, R = PAL.red, W = PAL.white;
  kit.cyl(5, 5.4, 1.2, 20, X, 0, Z, hex('#8a867c'));
  for (let k = 0; k < 6; k++) kit.cyl(4.0 - k * 0.2 - 0.2, 4.0 - k * 0.2 + 0.0, 5.4, 20, X, 1.2 + k * 5.4, Z, k % 2 ? R : W);
  kit.cyl(4.1, 4.1, 0.5, 20, X, 33.6, Z, PAL.black); kit.cyl(4.6, 4.6, 0.4, 20, X, 34, Z, PAL.dark);
  kit.cyl(2.2, 2.2, 3.4, 16, X, 34.4, Z, PAL.glass); kit.cone(2.8, 2.8, 16, X, 37.8, Z, R); kit.sphere(0.5, X, 40.8, Z, PAL.dark); kit.ring(X, Z, 5);
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; kit.box(X + Math.cos(a) * 4.5 - 0.05, Z + Math.sin(a) * 4.5 - 0.05, X + Math.cos(a) * 4.5 + 0.05, Z + Math.sin(a) * 4.5 + 0.05, 34.4, 35.5, PAL.black); }
  kit.panel(X, 1.2, Z + 3.9, 0, 1, 1.2, 2.4, PAL.dark);
  for (let k = 0; k < 3; k++) kit.panel(X + Math.sin(k * 2.1) * 3.5, 9 + k * 8, Z + Math.cos(k * 2.1) * 3.5, Math.sin(k * 2.1), Math.cos(k * 2.1), 0.7, 1.2, PAL.glass);
  // The lamp's beam: two long faint cones, turning slowly (visible at dusk and at night).
  if (TOD.lampsOn) {
    const mk = d => new THREE.Mesh(new THREE.ConeGeometry(14, 260, 14, 1, true).rotateZ(-Math.PI / 2).translate(130 * d, 0, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.95, 0.55), transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const beam = new THREE.Group(); beam.add(mk(1), mk(-1)); beam.position.set(X, kit.Y + 36.4, Z); kit.group.add(beam); anim.push((t) => { beam.rotation.y = t * 0.8; });
    kit.box(X - 0.6, Z - 0.6, X + 0.6, Z + 0.6, 35, 36.4, PAL.lamp, kit.e);
  }
  // The keeper's cottage and a boathouse down the slope, a low stone wall and a flagpole.
  { const x0 = X + 16, x1 = x0 + 13, z0 = Z - 5, z1 = Z + 5; kit.box(x0, z0, x1, z1, 0, 3.6, hex('#e8e2d2')); kit.gable(x0, z0, x1, z1, 3.6, 2.8, hex('#e8e2d2'), R, true, 0.7); kit.collide(x0, z0, x1, z1); kit.windows(x0, z0, x1, z1, 1.1, 1, 3, { w: 1.1, h: 1.3, gap: 3.4, doorAt: true }); kit.box(x1 - 2.4, z0 + 1, x1 - 1.4, z0 + 2, 3.6, 7, hex('#8a6a50')); }
  { const x0 = X - 32, x1 = x0 + 9, z0 = Z - 8, z1 = Z + 8; kit.box(x0, z0, x1, z1, 0, 3.2, hex('#7b5a3a')); kit.gable(x0, z0, x1, z1, 3.2, 2.4, hex('#7b5a3a'), hex('#4a4f54'), false, 0.5); kit.collide(x0, z0, x1, z1); kit.panel(x0 + 4.5, 0.1, z1, 0, 1, 4.6, 2.8, PAL.dark); }
  for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; if (k > 6 && k < 11) continue; const px = X + Math.cos(a) * 20, pz = Z + Math.sin(a) * 20; kit.box(px - 1.1, pz - 0.4, px + 1.1, pz + 0.4, 0, 0.9, hex('#8a867c')); }
  kit.beam([X + 8, 0, Z + 24], [X + 8, 9, Z + 24], 0.08, PAL.steel); kit.box(X + 8, Z + 24 - 0.04, X + 11.4, Z + 24 + 0.04, 7.2, 8.8, PAL.red);
  signBoard('NORTH POINT LIGHT', 'EST. 1892', X + 9, 2.6, Z + 12, 0, 4.2, 1.5, '#14305a', '#f4efe2');
};
