// The places outside the city (settlements.js says where): a town with a main street, farms, a harbour, a seaside village, a lighthouse, a ski resort, a
// ghost town in the desert, an oil field, a solar farm and a radio telescope. The town's houses and shops are made with the city's own building
// generators (so they look like the city's); everything else is built out of boxes, prisms and cylinders in vertex colours (kit.js). Each site is a
// group that hides itself when you are far away, and its colliders are solid to the car.
import * as THREE from 'three';
import { SITES } from './settlements.js';
import { addStaticCollider } from './city.js';
import { mulberry32 } from './util.js';
import { Q } from './quality.js';
import { Kit, CURB, WHITE, PAL, signTex } from './kit.js';
import { BUILDERS as COAST } from './sites-coast.js';
import { BUILDERS as INLAND } from './sites-inland.js';

// ===========================================================================================================================================
export async function initTowns(scene, city, hooks = {}) {
  const std = o => new THREE.MeshStandardMaterial(o);
  const mats = {
    prop: std({ vertexColors: true, roughness: 0.82, metalness: 0.04, side: THREE.DoubleSide }),
    metal: std({ vertexColors: true, roughness: 0.42, metalness: 0.75, side: THREE.DoubleSide }),
    glass: std({ vertexColors: true, roughness: 0.08, metalness: 0.85 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  const root = new THREE.Group(); scene.add(root);
  const sites = [], anim = [];
  const built = new Map();

  function signBoard(kit, text, sub, x, y, z, yaw, w = 6, h = 2.25, bg, fg) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: signTex(text, sub, bg, fg), roughness: 0.6, side: THREE.DoubleSide }));
    m.position.set(x, kit.Y + y, z); m.rotation.y = yaw; kit.group.add(m);
  }
  let n = 0;
  for (const S of SITES) {
    const fn = BUILDERS[S.kind]; if (!fn) continue;
    if (hooks.frame) { if (hooks.msg) hooks.msg(`Building the towns and farms… ${++n}/${SITES.length}`); await hooks.frame(); }          // (one at a time, behind the loading screen)
    const t0 = performance.now();
    const kit = new Kit(S.y), ctx = city.newCtx0(S.y), rnd = mulberry32(S.x * 31 + S.z * 17 + 7);
    ctx.cur = [60, 60]; ctx.old = false;
    const env = { S, kit, ctx, rnd, city, signBoard: (...a) => signBoard(kit, ...a), mats, anim: kit.anim, scene };
    fn(env);
    const region = city.buildSite(ctx);                                                  // the city's own pieces: houses, lamps, trees, benches, hedges
    const group = new THREE.Group(); group.add(kit.finish(mats), region.group);
    root.add(group);
    city.sites.push({ parked: ctx.L.parked }); city.version++;
    sites.push({ S, group, region, anim: kit.anim, show: S.show, buildMs: performance.now() - t0 });
  }
  return {
    group: root, sites,
    update(x, z, dt, t) {
      for (const s of sites) {
        const d = Math.hypot(s.S.x - x, s.S.z - z), vis = d < s.show; s.group.visible = vis;
        if (!vis) continue;
        s.region.detail.visible = d < s.show * 0.6; s.region.trees.visible = d < Math.max(Q.treeR, 900) + 400;
        for (const a of s.anim) a(t, dt);
      }
    },
  };
}

// ===========================================================================================================================================
const BUILDERS = { ...COAST, ...INLAND };

// --- Willow Creek: a main street with shops, a church, a town hall and houses, in the city's own styles --------------------------------------
BUILDERS.town = ({ S, kit, ctx, rnd, city, signBoard }) => {
  const [main, cross, elm] = S.streets, G = ctx.gb, L = ctx.L, zc = main.pts[0][1], xc = cross.pts[0][0], zElm = elm.pts[0][1];
  const sw = 5, hwM = main.hw, hwC = cross.hw, hwE = elm.hw, xa = main.pts[0][0], xb = main.pts[1][0];
  const walk = (x0, z0, x1, z1) => { if (x1 - x0 > 0.5 && z1 - z0 > 0.5) { G.walk.box(x0, z0, x1, z1, 0, CURB, 6, WHITE); G.curb.box(x0, z0, x1, z1, 0, CURB, 4.5, WHITE); } };
  const gapX = [xc - hwC - sw, xc + hwC + sw];
  for (const [zA, zB, hwS, xs0, xs1] of [[zc, zc, hwM, xa, xb], [zElm, zElm, hwE, elm.pts[0][0], elm.pts[1][0]]]) {          // pavements along the two east-west streets, broken at the cross street
    for (const [x0, x1] of [[xs0, gapX[0]], [gapX[1], xs1]]) { walk(x0, zA - hwS - sw, x1, zA - hwS); walk(x0, zA + hwS, x1, zA + hwS + sw); }
  }
  for (const [z0, z1] of [[cross.pts[0][1], zc - hwM - sw], [zc + hwM + sw, zElm - hwE - sw], [zElm + hwE + sw, cross.pts[1][1]]]) { walk(xc - hwC - sw, z0, xc - hwC, z1); walk(xc + hwC, z0, xc + hwC + sw, z1); }
  // Lots along the east-west streets, both sides; shops in the middle of the main street and houses towards the ends.
  const faces = (dx, dz) => [{ dir: [dx, dz], line: 1, axis: dx ? 'x' : 'z' }];
  const lotRun = (zStreet, hwS, x0, x1, depth, kind) => {
    for (const side of [-1, 1]) {
      let x = x0; const edge = zStreet + side * (hwS + sw);
      while (x < x1 - 14) {
        const w = 22 + Math.floor(rnd() * 11), xe = Math.min(x + w, x1);
        if (xe > gapX[0] - 4 && x < gapX[1] + 4) { x = gapX[1] + 5; continue; }                                      // not across the cross street
        const lot = { x0: x, x1: xe, z0: side < 0 ? edge - depth : edge, z1: side < 0 ? edge : edge + depth }, f = faces(0, -side), mid = Math.abs((x + xe) / 2 - S.x) / (xb - xa) * 2;
        if (kind === 'main' && mid < 0.62 && rnd() < 0.82) city.addBuilding(ctx, lot, f, 'sub', 400, true, rnd);        // a shop (one or two storeys, with a sign)
        else if (kind === 'main' && mid < 0.8 && rnd() < 0.5) city.addBuilding(ctx, lot, f, 'sub', 400, false, rnd);   // a block of flats or brick offices
        else city.addHouse(ctx, lot, f, rnd);
        x = xe + 1.5 + rnd() * 2.5;
      }
    }
  };
  lotRun(zc, hwM, xa + 10, xb - 10, 30, 'main'); lotRun(zElm, hwE, elm.pts[0][0] + 6, elm.pts[1][0] - 6, 30, 'houses');
  // Along the cross street, houses.
  for (const side of [-1, 1]) {
    const edge = xc + side * (hwC + sw);
    for (let z = cross.pts[0][1] + 6; z < cross.pts[1][1] - 30; z += 30 + Math.floor(rnd() * 6)) {
      const ze = z + 26, bad = (z < zc + hwM + sw + 3 && ze > zc - hwM - sw - 3) || (z < zElm + hwE + sw + 3 && ze > zElm - hwE - sw - 3);
      if (bad) continue;
      city.addHouse(ctx, { x0: side < 0 ? edge - 30 : edge, x1: side < 0 ? edge : edge + 30, z0: z, z1: ze }, faces(-side, 0), rnd);
    }
  }
  // Street furniture: lamps, trees, benches, hydrants and bins along the pavements.
  const yawTo = (dx, dz) => Math.atan2(dx, dz);
  for (let x = xa + 12; x < xb - 6; x += 34) for (const side of [-1, 1]) {
    if (x > gapX[0] - 6 && x < gapX[1] + 6) continue;
    const z = zc + side * (hwM + 0.8); L.lamps.push([x + (side > 0 ? 17 : 0), z, yawTo(0, -side), CURB]); addStaticCollider({ type: 'circ', x: x + (side > 0 ? 17 : 0), z, r: 0.25 });
    if (rnd() < 0.7) city.tree(ctx, x + 8, zc + side * (hwM + 3.2), 0.9 + rnd() * 0.5, CURB, false);
    if (rnd() < 0.18) { L.benches.push([x + 11, zc + side * (hwM + 2.2), yawTo(0, -side), CURB + 0.03]); }
    if (rnd() < 0.15) L.hydrants.push([x + 4, zc + side * (hwM + 0.7), 0, CURB]);
  }
  for (let x = elm.pts[0][0] + 10; x < elm.pts[1][0] - 6; x += 38) for (const side of [-1, 1]) if (x < gapX[0] - 6 || x > gapX[1] + 6) { const z = zElm + side * (hwE + 0.8); L.lamps.push([x, z, yawTo(0, -side), CURB]); city.tree(ctx, x + 14, zElm + side * (hwE + 3), 0.9 + rnd() * 0.5, CURB, false); }
  for (let z = cross.pts[0][1] + 14; z < cross.pts[1][1] - 6; z += 36) for (const side of [-1, 1]) {
    if ((z > zc - 26 && z < zc + 26) || (z > zElm - 24 && z < zElm + 24)) continue;
    L.lamps.push([xc + side * (hwC + 0.8), z, yawTo(-side, 0), CURB]); city.tree(ctx, xc + side * (hwC + 3.2), z + 14, 0.9 + rnd() * 0.5, CURB, false);
  }
  // Parked cars in the middle of the main street.
  for (let x = xa + 60; x < xb - 60; x += 15 + Math.floor(rnd() * 20)) { if (x > gapX[0] - 8 && x < gapX[1] + 8) continue; const side = rnd() < 0.5 ? -1 : 1; kit.parked.push({ x, z: zc + side * (hwM - 2.2), h: side < 0 ? Math.PI / 2 : -Math.PI / 2, y: S.y + 0.05, type: (rnd() * 3) | 0, ci: (rnd() * 12) | 0 }); }
  L.parked.push(...kit.parked);

  // The church, on the corner of the cross street and the main street, east side: a nave, a steeple with a spire, stained windows.
  { const x0 = xc + hwC + sw + 8, z1 = zc - hwM - sw - 6, z0 = z1 - 30, x1 = x0 + 17, h = 8;
    kit.box(x0, z0, x1, z1, 0, h, PAL.cream); kit.gable(x0, z0, x1, z1, h, 5.5, PAL.cream, PAL.slate, false, 0.7); kit.collide(x0, z0, x1, z1);
    const tx0 = x0 + 5.5, tx1 = tx0 + 6, tz1 = z1 + 5, tz0 = z1 - 1; kit.box(tx0, tz0, tx1, tz1, 0, 17, PAL.cream); kit.collide(tx0, tz0, tx1, tz1);
    kit.cone(5.4, 11, 4, (tx0 + tx1) / 2, 17, (tz0 + tz1) / 2, PAL.slate); kit.box((tx0 + tx1) / 2 - 0.08, (tz0 + tz1) / 2 - 0.08, (tx0 + tx1) / 2 + 0.08, (tz0 + tz1) / 2 + 0.08, 28, 30.4, PAL.tin, kit.m);
    kit.box((tx0 + tx1) / 2 - 0.9, (tz0 + tz1) / 2 - 0.08, (tx0 + tx1) / 2 + 0.9, (tz0 + tz1) / 2 + 0.08, 29.2, 29.4, PAL.tin, kit.m);
    for (let k = 0; k < 4; k++) kit.panel(x0 + 2.2 + (k % 2) * 12.6, 2.2 + 0, z0 + 4 + Math.floor(k / 2) * 14, k % 2 ? 1 : -1, 0, 1.4, 4.2, k % 2 ? PAL.blue : PAL.red);
    kit.panel((tx0 + tx1) / 2, 0.2, tz1, 0, 1, 2.4, 3.6, PAL.dark); kit.panel((tx0 + tx1) / 2, 12.4, tz1, 0, 1, 2.2, 2.2, PAL.lamp, kit.e);
    signBoard('FIRST CHURCH', 'ALL WELCOME', x0 - 3, 1.7, z1 + 2.5, Math.PI / 2, 3.4, 1.3, '#f4efe2', '#2a2a2a');
  }
  // The town hall with a clock tower, west side of the cross street.
  { const x1 = xc - hwC - sw - 8, x0 = x1 - 30, z1 = zc - hwM - sw - 6, z0 = z1 - 22, h = 9.5;
    kit.box(x0, z0, x1, z1, 0, h, PAL.brick); kit.box(x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5, h, h + 0.7, PAL.conc); kit.gable(x0, z0, x1, z1, h + 0.7, 3.2, PAL.brick, PAL.slate, true, 0.6); kit.collide(x0, z0, x1, z1);
    kit.windows(x0, z0, x1, z1, 1.2, 2, 4, { w: 1.3, h: 1.9, gap: 4, doorAt: true });
    const cx = (x0 + x1) / 2, tz0 = z1 - 7, tz1 = z1; kit.box(cx - 3.2, tz0, cx + 3.2, tz1, h, h + 11, PAL.brick); kit.gable(cx - 3.2, tz0, cx + 3.2, tz1, h + 11, 3.4, PAL.brick, PAL.slate, false, 0.5);
    for (const [dx, dz, px, pz] of [[0, 1, cx, tz1], [0, -1, cx, tz0], [1, 0, cx + 3.2, (tz0 + tz1) / 2], [-1, 0, cx - 3.2, (tz0 + tz1) / 2]]) { kit.panel(px, h + 6.6, pz, dx, dz, 2.4, 2.4, PAL.white, kit.p, 0.08); kit.panel(px, h + 7.2, pz, dx, dz, 0.15, 1.3, PAL.black, kit.p, 0.14); kit.panel(px, h + 7.7, pz, dx, dz, 0.9, 0.15, PAL.black, kit.p, 0.14); }
    kit.panel(cx, 0.1, z1, 0, 1, 3, 3.6, PAL.dark);
    for (let k = -1; k <= 1; k++) kit.box(cx + k * 3.2 - 0.3, z1, cx + k * 3.2 + 0.3, z1 + 3.4, 0, 6, PAL.white);
    kit.box(cx - 5, z1, cx + 5, z1 + 3.4, 6, 6.6, PAL.white);
    signBoard('WILLOW CREEK', 'TOWN HALL', cx, 2.4, z1 + 4, 0, 4.4, 1.6, '#274a36', '#f4efe2');
  }
  // The water tower, east end of the main street.
  { const x = xb + 20, z = zc + 24, h = 22;
    for (const [a, b] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) kit.beam([x + a, 0, z + b], [x + a * 0.7, h, z + b * 0.7], 0.22, PAL.steel);
    for (const hh of [6, 12, 18]) for (const [a, b, c, d] of [[-3, -3, 3, -3], [3, -3, 3, 3], [3, 3, -3, 3], [-3, 3, -3, -3]]) { const k = 1 - hh / h * 0.3; kit.beam([x + a * k, hh, z + b * k], [x + c * k, hh, z + d * k], 0.1, PAL.steel); }
    kit.cyl(4.6, 4.6, 7, 16, x, h, z, PAL.red); kit.cone(4.8, 3, 16, x, h + 7, z, PAL.slate); kit.cyl(4.4, 4.4, 0.4, 16, x, h - 0.4, z, PAL.dark);
    signBoard('WILLOW CREEK', '', x, h + 3.2, z + 4.65, 0, 6.5, 2, '#a53a2d', '#f4efe2'); signBoard('WILLOW CREEK', '', x, h + 3.2, z - 4.65, Math.PI, 6.5, 2, '#a53a2d', '#f4efe2');
    kit.ring(x, z, 4.2);
  }
  // A diner with a neon sign and a petrol station at the western end.
  { const x0 = xa + 22, x1 = x0 + 20, z1 = zc - hwM - sw - 7, z0 = z1 - 11;
    kit.box(x0, z0, x1, z1, 0, 3.6, PAL.teal); kit.box(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, 3.6, 4, PAL.white); kit.collide(x0, z0, x1, z1);
    kit.panel((x0 + x1) / 2, 0.9, z1, 0, 1, 16, 1.7, PAL.glass); kit.panel((x0 + x1) / 2, 0.9, z1, 0, 1, 16, 0.2, PAL.steel, kit.m, 0.05);
    signBoard('DINER', 'OPEN 24 HRS', (x0 + x1) / 2, 6, z1 - 3, 0, 5.6, 2.1, '#c0392b', '#fff1c4'); kit.box((x0 + x1) / 2 - 0.1, z1 - 3.1, (x0 + x1) / 2 + 0.1, z1 - 2.9, 4, 4.9, PAL.steel, kit.m);
    const gx0 = x1 + 22, gz1 = zc + hwM + sw + 8, gz0 = gz1 + 16;
    kit.box(gx0, gz1, gx0 + 6, gz1 + 5, 0, 3.2, PAL.white); kit.collide(gx0, gz1, gx0 + 6, gz1 + 5);
    kit.box(gx0 - 3, gz1 + 7, gx0 + 15, gz1 + 17, 5, 5.5, PAL.red); for (const [a, b] of [[-1.5, 8], [13.5, 8], [-1.5, 16], [13.5, 16]]) { kit.box(gx0 + a - 0.15, gz1 + b - 0.15, gx0 + a + 0.15, gz1 + b + 0.15, 0, 5, PAL.steel, kit.m); kit.ring(gx0 + a, gz1 + b, 0.3); }
    for (const px of [2, 10]) { kit.box(gx0 + px, gz1 + 11, gx0 + px + 0.8, gz1 + 12.2, 0, 1.5, PAL.red); kit.ring(gx0 + px + 0.4, gz1 + 11.6, 0.7); }
    kit.box(gx0 - 3, gz1 + 7, gx0 + 15, gz1 + 17, 0, 0.04, PAL.conc);
  }
  // A small park beside the church: lawn, a gazebo, a fountain and trees.
  { const px0 = xc + hwC + sw + 6, px1 = px0 + 56, pz0 = zElm - hwE - sw - 44, pz1 = zElm - hwE - sw - 6, cx = (px0 + px1) / 2, cz = (pz0 + pz1) / 2;
    G.park.flat(px0, pz0, px1, pz1, CURB + 0.03, 18, new THREE.Color(0.95, 1, 0.9));
    kit.cyl(3, 3.4, 0.7, 20, cx - 10, CURB, cz, PAL.conc); kit.cyl(0.5, 0.7, 1.8, 10, cx - 10, CURB, cz, PAL.conc); kit.ring(cx - 10, cz, 3.2);
    for (const [a, b] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) kit.box(cx + 12 + a - 0.15, cz + b - 0.15, cx + 12 + a + 0.15, cz + b + 0.15, 0, 3, PAL.white);
    kit.cone(3.6, 1.8, 8, cx + 12, 3, cz, PAL.green); kit.ring(cx + 12, cz, 2.6);
    for (let k = 0; k < 9; k++) city.tree(ctx, px0 + 5 + rnd() * (px1 - px0 - 10), pz0 + 5 + rnd() * (pz1 - pz0 - 10), 1 + rnd() * 0.7, CURB + 0.03, false);
    for (const [bx, bz] of [[cx - 4, cz - 8], [cx + 4, cz + 9]]) L.benches.push([bx, bz, bz < cz ? 0 : Math.PI, CURB + 0.05]);
  }
  signBoard('WILLOW CREEK', 'POPULATION 1,204', S.x - 380, 3.4, S.z + 20, Math.PI / 2, 5.5, 2.2, '#274a36', '#f4efe2');
};
