// Things built on the land: the airfield with its hangars, tower, radar, fuel tanks
// and a fence; two secret bunkers (a concrete portal, a long tunnel and a hangar you
// can drive right into); a desert gas station; a ski lodge; a wind farm. Each site is
// a group that hides itself when you are far away.
import * as THREE from 'three';
import { GB, ccw, mergeGeoms } from './geom.js';
import { AIRFIELD, BUNKERS, bunkerRects, bunkerWalls, ROADS, heightAt, KEEP_CLEAR } from './world.js';
import { addStaticCollider } from './city.js';
import { glowTex, textPanel } from './textures.js';
import { mulberry32 } from './util.js';

const C = (r, g, b) => new THREE.Color(r, g, b);
const K = { conc: C(0.74, 0.72, 0.69), dark: C(0.18, 0.19, 0.2), steel: C(0.5, 0.53, 0.56), olive: C(0.26, 0.31, 0.2), tan: C(0.64, 0.57, 0.44), yellow: C(0.95, 0.72, 0.1), black: C(0.05, 0.05, 0.06), white: C(0.9, 0.9, 0.87), red: C(0.7, 0.1, 0.08), grey: C(0.4, 0.41, 0.42), wood: C(0.42, 0.28, 0.17), roof: C(0.33, 0.1, 0.08), lamp: C(4.2, 3.9, 3.2), beacon: C(6, 0.4, 0.2), neon: C(0.6, 4, 5) };
const box = (g, x0, y0, z0, x1, y1, z1, col) => g.box(x0, z0, x1, z1, y0, y1, 6, col);
const paint = (geo, c) => { const a = []; for (let i = 0; i < geo.attributes.position.count; i++) a.push(c.r, c.g, c.b); geo.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return geo; };

// A site's meshes, collected into one geometry per material.
class Site {
  constructor() { this.conc = new GB(false); this.intc = new GB(false); this.prop = new GB(true); this.glow = new GB(true); this.glass = new GB(false); this.fence = new GB(false); this.extra = []; this.group = new THREE.Group(); this.sprites = []; }
  cyl(rt, rb, h, seg, x, y, z, col) { this.extra.push(paint(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y + h / 2, z), col)); }
  sphere(r, x, y, z, col, sy = 1) { this.extra.push(paint(new THREE.SphereGeometry(r, 16, 10).scale(1, sy, 1).translate(x, y, z), col)); }
  add(mat, gb, cast = true) { if (gb.count) { const m = new THREE.Mesh(gb.geometry(), mat); m.castShadow = cast; m.receiveShadow = true; this.group.add(m); } }
}
function collide(x0, z0, x1, z1) { addStaticCollider({ type: 'box', x0, z0, x1, z1 }); }
const ring = (x, z, r) => addStaticCollider({ type: 'circ', x, z, r });

// An arched (Quonset) hangar roof along x from x0 to x1, centred on zc, half-width R, rising H.
function arch(g, x0, x1, zc, y0, R, H, col, N = 18) {
  const idx = [];
  for (let k = 0; k <= N; k++) {
    const a = Math.PI * k / N, z = zc - R * Math.cos(a), y = y0 + H * Math.sin(a), nz = -Math.cos(a) / R, ny = Math.sin(a) / H, l = Math.hypot(nz, ny);
    idx.push([g.vtx(x0, y, z, 0, ny / l, nz / l, 0, 0, col), g.vtx(x1, y, z, 0, ny / l, nz / l, 1, 0, col)]);
  }
  for (let k = 0; k < N; k++) { const [a0, a1] = idx[k], [b0, b1] = idx[k + 1]; g.i.push(a0, a1, b1, a0, b1, b0); }
}
// The arch's end wall, a fan from the floor, facing +x (dir 1) or -x (dir -1).
function archEnd(g, x, zc, y0, R, H, col, dir, N = 18) {
  const c = g.vtx(x, y0, zc, dir, 0, 0, 0, 0, col), first = g.count;
  for (let k = 0; k <= N; k++) { const a = Math.PI * k / N; g.vtx(x, y0 + H * Math.sin(a), zc - R * Math.cos(a), dir, 0, 0, 0, 0, col); }
  for (let k = 0; k < N; k++) if (dir > 0) g.i.push(c, first + k + 1, first + k); else g.i.push(c, first + k, first + k + 1);
}
// A delta-winged jet (nose along +x), dark grey, with twin fins.
function jet(S, x, y, z, yaw, scale = 1) {
  const gb = new GB(true), pts = [[9, 0], [-1, 5.2], [-6.5, 5.2], [-7.5, 2.4], [-7.5, -2.4], [-6.5, -5.2], [-1, -5.2]].map(p => [p[0] * scale, p[1] * scale]);
  // The wing (top view) as an extruded slab, with a raised body down the middle.
  const poly = pts.map(([a, b]) => [b, a]);                               // x = across, z = along; wound for extrude
  const ordered = ccw(poly);
  gb.extrude(ordered, 0.5 * scale, 1.1 * scale, 4, 4, K.dark, 0, false); gb.cap(ordered, 1.1 * scale, 4, K.dark);
  box(gb, -1.1 * scale, 0.5 * scale, -7 * scale, 1.1 * scale, 1.9 * scale, 8 * scale, K.grey);
  box(gb, -0.5 * scale, 1.9 * scale, 0, 0.5 * scale, 2.3 * scale, 3.5 * scale, K.black);
  for (const sd of [-1, 1]) box(gb, sd * 1.8 * scale - 0.15, 1.1 * scale, -7 * scale, sd * 1.8 * scale + 0.15, 3.6 * scale, -4.5 * scale, K.dark);
  const g = gb.geometry(), m = new THREE.Matrix4().makeRotationY(yaw); m.setPosition(x, y, z); g.applyMatrix4(m);
  S.extra.push(g);
}
const fenceTex = () => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(190,195,200,0.95)'; g.lineWidth = 2.2;
  for (let k = -64; k < 128; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); g.beginPath(); g.moveTo(k + 64, 0); g.lineTo(k, 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
};
// A wire fence along a polyline, with posts; gaps leave openings. Solid to the car.
function fenceLine(S, pts, gaps = []) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 3);
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (gaps.some(g => Math.abs(mx - g[0]) < g[2] && Math.abs(mz - g[1]) < g[2])) continue;
      const y0 = heightAt(x0, z0), y1 = heightAt(x1, z1);
      S.fence.q4([x0, y0, z0], [x1, y1, z1], [x1, y1 + 3, z1], [x0, y0 + 3, z0], [[0, 0], [len / n / 2.4, 0], [len / n / 2.4, 1.2], [0, 1.2]], K.white);
      if (k % 2 === 0) box(S.prop, x0 - 0.06, y0 - 0.3, z0 - 0.06, x0 + 0.06, y0 + 3.2, z0 + 0.06, K.steel);
      ring(mx, mz, 1.6);
    }
  }
}

export function initStructures(scene, city, hooks = {}) {
  const std = o => new THREE.MeshStandardMaterial(o), tx = city.tx;
  const M = {
    conc: std({ color: 0xc8c2ba, map: tx.con.map, normalMap: tx.con.normalMap, roughness: 0.92 }),
    intc: std({ color: 0x6c6a68, map: tx.con.map, normalMap: tx.con.normalMap, roughness: 0.95, envMapIntensity: 0.1 }),
    prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.25, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    glass: std({ color: 0x14202e, metalness: 0.9, roughness: 0.07 }),
    fence: std({ map: fenceTex(), alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 }),
    pool: new THREE.MeshBasicMaterial({ map: glowTex(), color: new THREE.Color(0.5, 0.42, 0.28), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  };
  const root = new THREE.Group(); scene.add(root);
  const sites = [];
  const finish = (S, name, cx, cz, show, secret = false) => {
    S.add(M.conc, S.conc); S.add(M.intc, S.intc); S.add(M.glow, S.glow, false); S.add(M.glass, S.glass, false); S.add(M.fence, S.fence, false);
    const geos = [...S.extra]; if (S.prop.count) geos.unshift(S.prop.geometry());
    if (geos.length) { const m = new THREE.Mesh(mergeGeoms(geos), M.prop); m.castShadow = true; m.receiveShadow = true; S.group.add(m); }
    root.add(S.group); sites.push({ group: S.group, cx, cz, show, name, secret });
  };
  const sign = (S, text, sub, x, y, z, yaw, w = 4.4, h = 2.2) => {
    const tex = textPanel(512, 256, (g, W, H) => {
      g.fillStyle = '#b3121a'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.fillRect(10, 10, W - 20, H - 20); g.fillStyle = '#b3121a'; g.fillRect(16, 16, W - 32, H - 32);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 64px "Barlow Condensed", Arial, sans-serif'; g.fillText(text, W / 2, H * 0.36); g.font = '600 34px "Barlow", Arial, sans-serif'; g.fillText(sub, W / 2, H * 0.7);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = yaw; S.group.add(m);
    box(S.prop, x - 0.1, y - h / 2 - 1.8, z - 0.1, x + 0.1, y - h / 2, z + 0.1, K.steel);
  };
  const glowPool = (S, x, y, z, size) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), M.pool); m.position.set(x, y + 0.04, z); m.renderOrder = 2; S.group.add(m);
  };

  // =====================================================================================
  // The bunkers
  // =====================================================================================
  for (const b of BUNKERS) {
    const S = new Site(), Y = b.apronY, cx = b.cx, cz = b.cz, { tunnel: t, hangar: h } = bunkerRects(b), wl = 1.2;
    // Apron: a concrete slab in front of the door, with hazard stripes.
    box(S.conc, cx - 46, Y - 0.6, cz - 26, cx - 4, Y + 0.05, cz + 26, K.conc);
    for (let k = 0; k < 8; k++) box(S.prop, cx - 14 - k * 1.4, Y + 0.05, cz - 11, cx - 13.2 - k * 1.4, Y + 0.07, cz + 11, k % 2 ? K.black : K.yellow);
    // The portal: a thick concrete wall with the doorway cut out, and the blast doors swung open.
    box(S.conc, cx - 4, Y, cz - 22, cx, Y + 10, cz - 5, K.conc); box(S.conc, cx - 4, Y, cz + 5, cx, Y + 10, cz + 22, K.conc); box(S.conc, cx - 4, Y + 6.2, cz - 5, cx, Y + 10, cz + 5, K.conc);
    box(S.prop, cx - 9, Y, cz - 5.8, cx - 4, Y + 6.2, cz - 5.1, K.steel); box(S.prop, cx - 9, Y, cz + 5.1, cx - 4, Y + 6.2, cz + 5.8, K.steel);
    for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) box(S.prop, cx - 8.6 + k * 1, Y + 0.3, cz + sd * 5.15 - 0.03, cx - 8.2 + k * 1, Y + 5.9, cz + sd * 5.15 + 0.03, k % 2 ? K.black : K.yellow);
    box(S.glow, cx - 4.4, Y + 6.5, cz - 0.6, cx - 4, Y + 7.1, cz + 0.6, K.beacon);
    collide(cx - 4, cz - 22, cx, cz - 5); collide(cx - 4, cz + 5, cx, cz + 22); collide(cx - 9, cz - 5.8, cx - 4, cz - 5.1); collide(cx - 9, cz + 5.1, cx - 4, cz + 5.8);
    // Tunnel and hangar: floor, walls and ceiling in dim concrete.
    box(S.intc, t.x0, Y - 1, t.z0 - wl, t.x1, Y, t.z1 + wl, K.conc); box(S.intc, h.x0, Y - 1, h.z0 - wl, h.x1, Y, h.z1 + wl, K.conc);
    box(S.intc, t.x0, Y + 6, t.z0 - wl, t.x1, Y + 7.4, t.z1 + wl, K.conc); box(S.intc, h.x0, Y + 14, h.z0 - wl, h.x1, Y + 15.5, h.z1 + wl, K.conc);
    S.intc.ceil(t.x0, t.z0 - wl, t.x1, t.z1 + wl, Y + 6, 6, K.conc); S.intc.ceil(h.x0, h.z0 - wl, h.x1, h.z1 + wl, Y + 14, 6, K.conc);
    const walls = bunkerWalls(b);
    walls.forEach(([x0, z0, x1, z1], i) => { const top = i < 2 ? Y + 6 : Y + 14; box(S.intc, x0, Y, z0, x1, top, z1, K.conc); collide(x0, z0, x1, z1); });
    // Strip lights down the tunnel and across the hangar, with pools of light on the floor.
    for (let x = t.x0 + 4; x < t.x1; x += 8) { box(S.glow, x - 1.5, Y + 5.85, cz - 0.25, x + 1.5, Y + 6, cz + 0.25, K.lamp); glowPool(S, x, Y, cz, 11); }
    for (let r = -1; r <= 1; r++) for (let x = h.x0 + 10; x < h.x1 - 5; x += 14) { box(S.glow, x - 2.5, Y + 13.8, cz + r * 20 - 0.5, x + 2.5, Y + 14, cz + r * 20 + 0.5, K.lamp); glowPool(S, x, Y, cz + r * 20, 24); }
    box(S.glow, h.x1 - 0.1, Y + 7, cz - 8, h.x1, Y + 7.4, cz + 8, K.beacon);
    // Inside the hangar: crates, drums, a parked jet and a truck.
    const rnd = mulberry32(b.cx), hx0 = h.x0, hx1 = h.x1, hz0 = h.z0, hz1 = h.z1;
    for (let k = 0; k < 14; k++) {
      const x = hx0 + 6 + rnd() * (hx1 - hx0 - 14), z = (rnd() < 0.5 ? hz0 + 4 : hz1 - 8) + rnd() * 3, w = 2 + rnd() * 2.2, d = 2 + rnd() * 2, hh = 1.6 + rnd() * 1.6;
      box(S.prop, x, Y, z, x + w, Y + hh, z + d, rnd() < 0.5 ? K.olive : K.tan); if (rnd() < 0.4) box(S.prop, x + 0.2, Y + hh, z + 0.2, x + w - 0.3, Y + hh + 1.4, z + d - 0.3, K.olive); collide(x, z, x + w, z + d);
    }
    for (let k = 0; k < 8; k++) { const x = hx1 - 6 + rnd() * 3, z = hz0 + 5 + k * 3.2; S.cyl(0.45, 0.45, 1.2, 10, x, Y, z, k % 3 ? K.red : K.olive); ring(x, z, 0.5); }
    jet(S, hx0 + 38, Y, cz + 4, Math.PI / 2 + 0.3, 1.5); ring(hx0 + 38, cz + 4, 7);
    box(S.prop, hx0 + 20, Y + 1, cz - 22, hx0 + 29, Y + 2.2, cz - 19.6, K.olive); box(S.prop, hx0 + 20, Y + 1.3, cz - 22, hx0 + 22.6, Y + 3.8, cz - 19.6, K.olive);
    for (const wx of [hx0 + 21.4, hx0 + 25.5, hx0 + 27.6]) for (const wz of [cz - 22.2, cz - 19.4]) S.cyl(0.55, 0.55, 0.5, 14, wx, Y + 0.55, wz, K.black);
    collide(hx0 + 20, cz - 22, hx0 + 29, cz - 19.6);
    sign(S, 'RESTRICTED', 'AUTHORISED PERSONNEL ONLY', cx - 38, Y + 3.3, cz - 24, -Math.PI / 2, 5, 2.5);
    // A guard post and fence beside the apron.
    box(S.conc, cx - 30, Y, cz + 28, cx - 24, Y + 3.2, cz + 33, K.conc); box(S.prop, cx - 30.4, Y + 3.2, cz + 27.6, cx - 23.6, Y + 3.5, cz + 33.4, K.dark); collide(cx - 30, cz + 28, cx - 24, cz + 33);
    finish(S, b.name, cx + 40, cz, 2400, true);
  }

  // =====================================================================================
  // The airfield
  // =====================================================================================
  {
    const S = new Site(), A = AIRFIELD, Y = A.y, x = A.x;
    box(S.conc, x + 24, Y - 0.6, 2850, x + 380, Y + 0.04, 3750, K.conc);                                    // the apron
    box(S.conc, x + 24, Y - 0.6, 3290, x + 160, Y + 0.04, 3310, K.conc);                                    // the taxiway
    for (const hz of [2880, 3050, 3640]) {                                                                // arched hangars, doors to the west
      const x0 = x + 270, x1 = x + 330;
      arch(S.prop, x0, x1, hz, Y, 20, 14, K.steel); archEnd(S.prop, x1, hz, Y, 20, 14, K.grey, 1); archEnd(S.prop, x0, hz, Y, 20, 14, K.dark, -1);
      box(S.conc, x0, Y, hz - 20.5, x1, Y + 0.6, hz - 19.5, K.conc); box(S.conc, x0, Y, hz + 19.5, x1, Y + 0.6, hz + 20.5, K.conc);
      collide(x0, hz - 20, x1, hz + 20);
      jet(S, x0 - 24, Y + 0.04, hz, 0, 1.6); ring(x0 - 24, hz, 8);
    }
    // The control tower and a radar dome.
    box(S.conc, x + 190, Y, 3150, x + 197, Y + 22, 3157, K.conc); box(S.glass, x + 187, Y + 22, 3147, x + 200, Y + 26, 3160, K.dark); box(S.prop, x + 186, Y + 26, 3146, x + 201, Y + 27, 3161, K.dark); collide(x + 190, 3150, x + 197, 3157);
    S.cyl(0.25, 0.25, 7, 6, x + 193.5, Y + 27, 3153.5, K.red); box(S.glow, x + 193, Y + 34, 3153, x + 194, Y + 34.6, 3154, K.beacon);
    S.cyl(2, 3, 20, 10, x - 160, Y, 2450, K.conc); S.sphere(9, x - 160, Y + 27, 2450, K.white); ring(x - 160, 2450, 4);
    // Fuel tanks, and low barrack blocks.
    for (let k = 0; k < 3; k++) { S.cyl(8, 8, 9, 20, x + 400 + k * 20, Y, 3480, K.grey); S.cyl(8.2, 8.2, 0.4, 20, x + 400 + k * 20, Y + 9, 3480, K.steel); ring(x + 400 + k * 20, 3480, 8.5); }
    for (let k = 0; k < 4; k++) { box(S.conc, x + 250, Y, 3790 + k * 16, x + 292, Y + 4, 3799 + k * 16, K.tan); box(S.prop, x + 249.5, Y + 4, 3789.5 + k * 16, x + 292.5, Y + 4.4, 3799.5 + k * 16, K.dark); collide(x + 250, 3790 + k * 16, x + 292, 3799 + k * 16); }
    for (let k = 0; k < 4; k++) { jet(S, x + 150 + k * 22, Y + 0.04, 3600 + (k % 2) * 22, Math.PI / 2 * (k % 2 ? 1 : -1) + 0.2, 1.3); ring(x + 150 + k * 22, 3600 + (k % 2) * 22, 7); }
    // The perimeter fence, with a gate on the road in from the east.
    const fx0 = x - 220, fx1 = x + 520, fz0 = 2230, fz1 = 4630;
    fenceLine(S, [[fx0, fz0], [fx1, fz0], [fx1, fz1], [fx0, fz1], [fx0, fz0]], [[fx1, 3300, 9]]);
    box(S.conc, fx1 - 3, Y, 3318, fx1 + 3, Y + 3, 3324, K.tan); box(S.prop, fx1 - 3.4, Y + 3, 3317.6, fx1 + 3.4, Y + 3.3, 3324.4, K.dark); collide(fx1 - 3, 3318, fx1 + 3, 3324);
    box(S.prop, fx1 - 0.3, Y + 1.0, 3290, fx1 + 0.3, Y + 1.3, 3296, K.red);
    sign(S, 'RESTRICTED', 'MILITARY AREA — KEEP OUT', fx1 + 6, Y + 3.4, 3313, Math.PI / 2, 5.2, 2.6);
    finish(S, A.name, x + 150, 3350, 4200);
  }

  // =====================================================================================
  // A desert gas station on the east highway, and a ski lodge on the north road
  // =====================================================================================
  const roadPoint = (id, along) => { const R = ROADS.find(r => r.id === id); let i = 0; while (i < R.s.length - 2 && R.s[i] < along) i++; return { R, i, x: R.x[i], z: R.z[i], y: R.y[i] }; };
  {
    const S = new Site(), p = roadPoint('east', 1650), x = p.x, z = p.z - 42, Y = p.y - 0.1;
    box(S.conc, x - 34, Y - 0.6, z - 24, x + 34, Y + 0.06, z + 24, K.conc);
    box(S.prop, x - 12, Y + 5.2, z - 6, x + 12, Y + 5.9, z + 6, K.white); box(S.glow, x - 12, Y + 5.1, z - 6, x + 12, Y + 5.2, z + 6, K.lamp);
    for (const [cx, cz] of [[-10, -4], [10, -4], [-10, 4], [10, 4]]) { box(S.prop, x + cx - 0.35, Y, z + cz - 0.35, x + cx + 0.35, Y + 5.2, z + cz + 0.35, K.steel); ring(x + cx, z + cz, 0.7); }
    for (const px of [-6, 0, 6]) { box(S.prop, x + px - 0.45, Y, z - 1, x + px + 0.45, Y + 1.5, z + 1, K.red); box(S.glow, x + px - 0.3, Y + 1.2, z + 0.95, x + px + 0.3, Y + 1.4, z + 1.05, K.neon); ring(x + px, z, 1.2); }
    box(S.conc, x + 16, Y, z - 22, x + 32, Y + 4.4, z - 12, K.tan); box(S.glass, x + 16, Y + 0.6, z - 12.05, x + 32, Y + 3.4, z - 11.95, K.dark); box(S.prop, x + 15.6, Y + 4.4, z - 22.4, x + 32.4, Y + 4.8, z - 11.6, K.roof); collide(x + 16, z - 22, x + 32, z - 12);
    KEEP_CLEAR.push({ x, z, r: 70 });
    box(S.prop, x - 26, Y, z + 14, x - 25.4, Y + 16, z + 14.6, K.steel); box(S.glow, x - 29, Y + 14, z + 13.9, x - 22, Y + 17, z + 15, K.neon); ring(x - 25.7, z + 14.3, 0.8);
    finish(S, 'Desert Gas', x, z, 1600);
  }
  {
    const S = new Site(), p = roadPoint('north', 1250), x = p.x - 40, z = p.z, Y = p.y - 0.1;
    box(S.conc, x - 20, Y - 0.6, z - 40, x + 12, Y + 0.06, z + 40, K.conc); KEEP_CLEAR.push({ x, z, r: 70 });
    for (const dz of [-26, 0, 26]) {                                                                    // three chalets with snowy roofs
      box(S.prop, x - 16, Y, z + dz - 8, x - 2, Y + 4.2, z + dz + 8, K.wood);
      const roof = new GB(true); roof.loft([[x - 17.5, z + dz + 9.5], [x - 0.5, z + dz + 9.5], [x - 0.5, z + dz - 9.5], [x - 17.5, z + dz - 9.5]], Y + 4.2, [[x - 9, z + dz + 1], [x - 9, z + dz + 1], [x - 9, z + dz - 1], [x - 9, z + dz - 1]], Y + 8.4, 5, K.white);
      S.extra.push(roof.geometry()); box(S.glass, x - 2.05, Y + 0.9, z + dz - 3, x - 1.95, Y + 3, z + dz + 3, K.dark); collide(x - 16, z + dz - 8, x - 2, z + dz + 8);
      for (let k = 0; k < 3; k++) { S.cyl(0.1, 0.5, 5, 6, x + 4 + k * 3, Y, z + dz + k - 1, K.wood); S.cyl(0.05, 1.8, 3.5, 8, x + 4 + k * 3, Y + 1.6, z + dz + k - 1, K.white); }
    }
    finish(S, 'Alpine Lodge', x, z, 1600);
  }

  // =====================================================================================
  // A wind farm on the southern grassland
  // =====================================================================================
  {
    const S = new Site(), rnd = mulberry32(5);
    for (let k = 0; k < 14; k++) {
      const x = -900 + (k % 7) * 120 + rnd() * 40, z = 3600 + Math.floor(k / 7) * 360 + rnd() * 60, y = heightAt(x, z), a = rnd() * 6.28;
      S.cyl(1.0, 2.1, 70, 12, x, y - 1, z, K.white); box(S.prop, x - 2.2, y + 69, z - 3, x + 2.2, y + 72.5, z + 5, K.white); S.sphere(1.6, x, y + 70.8, z - 3.4, K.white);
      for (let bl = 0; bl < 3; bl++) {
        const ang = a + bl * Math.PI * 2 / 3, g = new THREE.BoxGeometry(0.7, 38, 0.25).translate(0, 19, 0);
        g.rotateZ(ang); g.translate(x, y + 70.8, z - 3.6); S.extra.push(paint(g, K.white));
      }
      ring(x, z, 2.4); KEEP_CLEAR.push({ x, z, r: 22 });
    }
    finish(S, 'Wind farm', -500, 3800, 3000);
  }

  return {
    group: root, sites,
    update(x, z) { for (const s of sites) s.group.visible = Math.hypot(s.cx - x, s.cz - z) < s.show; },
  };
}
