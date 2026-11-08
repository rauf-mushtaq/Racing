// The pieces the sites outside the city are built from: a Kit collects painted boxes, prisms, cylinders, beams and panels in vertex colours by material
// (so a whole site is a handful of meshes), and the palette and sign texture they share.
import * as THREE from 'three';
import { GB, mergeGeoms, quadToward } from './geom.js';
import { heightAt } from './world.js';
import { addStaticCollider } from './city.js';
import { Q } from './quality.js';

export const CURB = 0.15;
export const hex = h => new THREE.Color(h);
export const WHITE = new THREE.Color(1, 1, 1);
export const PAL = {
  white: hex('#efe9dc'), cream: hex('#e3d4ae'), red: hex('#a53a2d'), barn: hex('#8c2a21'), wood: hex('#8d6b45'), dark: hex('#4a3623'), grey: hex('#6b6e72'), slate: hex('#4d5258'),
  tin: hex('#b4babf'), steel: hex('#8b949c'), conc: hex('#b8b4ab'), black: hex('#1f2024'), glass: hex('#16222e'), blue: hex('#46709a'), sky: hex('#9cc0d8'), yellow: hex('#dcb94a'),
  green: hex('#4f7a3a'), field1: hex('#8fae4c'), field2: hex('#6f9a3e'), field3: hex('#c9b04e'), soil: hex('#6b4a2f'), sand: hex('#d8bd86'), brick: hex('#9a4b36'), roofRed: hex('#8a3a2c'),
  roofBrown: hex('#6b4a38'), sage: hex('#8aa08a'), pink: hex('#d49a8c'), teal: hex('#4a8a8a'), orange: hex('#d9742b'), snow: hex('#f2f6fa'), panel: hex('#1d3b66'), lamp: hex('#ffe6a8'),
  rust: hex('#8a4a2a'), hay: hex('#d8b858'),
};

// A site's meshes, collected by material: painted boxes and prisms (prop), steel (metal), dark glass, and lit things (glow).
export class Kit {
  constructor(Y) { this.Y = Y; this.p = new GB(true); this.m = new GB(true); this.g = new GB(true); this.e = new GB(true); this.x = []; this.anim = []; this.group = new THREE.Group(); this.parked = []; this.signs = []; }
  box(x0, z0, x1, z1, y0, y1, c, gb = this.p) { gb.box(x0, z0, x1, z1, this.Y + y0, this.Y + y1, 4, c); }
  // A box at the ground's own height under its middle (for things on a slope).
  boxG(x0, z0, x1, z1, y0, y1, c, gb = this.p) { const y = heightAt((x0 + x1) / 2, (z0 + z1) / 2); gb.box(x0, z0, x1, z1, y + y0, y + y1, 4, c); }
  collide(x0, z0, x1, z1) { addStaticCollider({ type: 'box', x0, z0, x1, z1 }); }
  ring(x, z, r) { addStaticCollider({ type: 'circ', x, z, r }); }
  // A flat quad (a panel) on a wall at (x, y, z), facing (dx, dz), w wide and h tall.
  panel(x, y, z, dx, dz, w, h, c, gb = this.g, push = 0.04) {
    const tx = dz, tz = -dx, a = [x + tx * w / 2 + dx * push, this.Y + y, z + tz * w / 2 + dz * push], b = [x - tx * w / 2 + dx * push, this.Y + y, z - tz * w / 2 + dz * push];
    gb.q4(b, a, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], [[0, 0], [1, 0], [1, 1], [0, 1]], c);
  }
  // Rows of windows on the four walls of a box (the corners and `skip` rectangles left clear).
  windows(x0, z0, x1, z1, y0, floors, fh, o = {}) {
    const w = o.w || 1.2, h = o.h || 1.5, gap = o.gap || 3.2, c = o.col || PAL.glass;
    for (const [dx, dz, ax, az, len] of [[0, 1, x0, z1, x1 - x0], [0, -1, x0, z0, x1 - x0], [1, 0, x1, z0, z1 - z0], [-1, 0, x0, z0, z1 - z0]]) {
      if (o.sides && !o.sides.includes(dx + ',' + dz)) continue;
      const n = Math.max(1, Math.floor((len - 1.6) / gap));
      for (let f = 0; f < floors; f++) for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n * len, px = dx ? ax : ax + t, pz = dx ? az + t : az;
        if (o.doorAt && f === 0 && Math.abs(t - len / 2) < 1.4) continue;
        this.panel(px, y0 + f * fh + (fh - h) / 2 + 0.2, pz, dx, dz, w, h, c);
      }
    }
  }
  // A gabled roof over a rectangle: two slopes with an overhang, and the triangles of wall at the ends.
  gable(x0, z0, x1, z1, y, rise, wallC, roofC, alongX = (x1 - x0) >= (z1 - z0), ov = 0.5) {
    const Y = this.Y + y, g = this.p, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (alongX) {
      const A = [x0 - ov, Y, z0 - ov], B = [x1 + ov, Y, z0 - ov], Cc = [x1 + ov, Y + rise, mz], D = [x0 - ov, Y + rise, mz], E = [x0 - ov, Y, z1 + ov], F = [x1 + ov, Y, z1 + ov];
      quadToward(g, A, B, Cc, D, [[0, 0], [1, 0], [1, 1], [0, 1]], roofC, [0, 1, -1]); quadToward(g, E, F, Cc, D, [[0, 0], [1, 0], [1, 1], [0, 1]], roofC, [0, 1, 1]);
      for (const [x, d] of [[x0, -1], [x1, 1]]) quadToward(g, [x, Y, z0], [x, Y, z1], [x, Y + rise, mz], [x, Y + rise, mz], [[0, 0], [1, 0], [0.5, 1], [0.5, 1]], wallC, [d, 0, 0]);
    } else {
      const A = [x0 - ov, Y, z0 - ov], B = [x0 - ov, Y, z1 + ov], Cc = [mx, Y + rise, z1 + ov], D = [mx, Y + rise, z0 - ov], E = [x1 + ov, Y, z0 - ov], F = [x1 + ov, Y, z1 + ov];
      quadToward(g, A, B, Cc, D, [[0, 0], [1, 0], [1, 1], [0, 1]], roofC, [-1, 1, 0]); quadToward(g, E, F, Cc, D, [[0, 0], [1, 0], [1, 1], [0, 1]], roofC, [1, 1, 0]);
      for (const [z, d] of [[z0, -1], [z1, 1]]) quadToward(g, [x0, Y, z], [x1, Y, z], [mx, Y + rise, z], [mx, Y + rise, z], [[0, 0], [1, 0], [0.5, 1], [0.5, 1]], wallC, [0, 0, d]);
    }
  }
  // A shape (a polygon in (across, height), the same all along) extruded along x or z from a0 to a1: a barn's gambrel, a hall's roof.
  prism(pts, alongX, a0, a1, c0, base, roofC, capC) {
    const Y = this.Y + base, g = this.p, n = pts.length, P = (t, k, a) => (alongX ? [a, Y + pts[k][1], c0 + pts[k][0]] : [c0 + pts[k][0], Y + pts[k][1], a]);
    let cy = 0, ct = 0; for (const q of pts) { cy += q[1]; ct += q[0]; } cy /= n; ct /= n;
    for (let k = 0; k < n - 1; k++) {                                                                 // the roof slopes (every edge except the floor)
      const A = P(0, k, a0), B = P(0, k + 1, a0), Cc = P(0, k + 1, a1), D = P(0, k, a1), mid = [(pts[k][0] + pts[k + 1][0]) / 2 - ct, (pts[k][1] + pts[k + 1][1]) / 2 - cy];
      quadToward(g, A, B, Cc, D, [[0, 0], [1, 0], [1, 1], [0, 1]], roofC, alongX ? [0, mid[1], mid[0]] : [mid[0], mid[1], 0]);
    }
    for (const [a, d] of [[a0, -1], [a1, 1]]) for (let k = 1; k < n - 1; k++) quadToward(g, P(0, 0, a), P(0, k, a), P(0, k + 1, a), P(0, k + 1, a), [[0, 0], [1, 0], [1, 1], [1, 1]], capC, alongX ? [d, 0, 0] : [0, 0, d]);
  }
  cyl(rt, rb, h, seg, x, y, z, c, open = false) { const geo = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open).translate(x, this.Y + y + h / 2, z); this.x.push(paint(geo, c)); }
  cylG(rt, rb, h, seg, x, z, c) { const y = heightAt(x, z); const geo = new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y + h / 2 - 0.2, z); this.x.push(paint(geo, c)); }
  dome(r, x, y, z, c, sy = 1, seg = 14) { const geo = new THREE.SphereGeometry(r, seg, Math.ceil(seg / 2), 0, Math.PI * 2, 0, Math.PI / 2).scale(1, sy, 1).translate(x, this.Y + y, z); this.x.push(paint(geo, c)); }
  sphere(r, x, y, z, c, sy = 1) { const geo = new THREE.SphereGeometry(r, 12, 8).scale(1, sy, 1).translate(x, this.Y + y, z); this.x.push(paint(geo, c)); }
  cone(r, h, seg, x, y, z, c) { const geo = new THREE.ConeGeometry(r, h, seg).translate(x, this.Y + y + h / 2, z); this.x.push(paint(geo, c)); }
  // A beam between two points (a strut, a rail, a cable), square section of half width r.
  beam(p0, p1, r, c, gb = this.m) {
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], l = Math.hypot(...d) || 1, up = Math.abs(d[1]) / l > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let s = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]]; const sl = Math.hypot(...s) || 1; s = s.map(v => v / sl * r);
    const t = [(d[1] * s[2] - d[2] * s[1]) / l, (d[2] * s[0] - d[0] * s[2]) / l, (d[0] * s[1] - d[1] * s[0]) / l], Y = this.Y;
    const at = (p, a, b) => [p[0] + s[0] * a + t[0] * b, Y + p[1] + s[1] * a + t[1] * b, p[2] + s[2] * a + t[2] * b], corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let k = 0; k < 4; k++) { const [a, b] = corners[k], [a2, b2] = corners[(k + 1) % 4]; gb.q4(at(p0, a, b), at(p0, a2, b2), at(p1, a2, b2), at(p1, a, b), [[0, 0], [1, 0], [1, 1], [0, 1]], c); }
  }
  // A quad lying on the ground (a field, a car park): the corners follow the land, so it can be on a slope.
  ground(x0, z0, x1, z1, dy, c, gb = this.p, step = 12) {
    const nx = Math.max(1, Math.ceil((x1 - x0) / step)), nz = Math.max(1, Math.ceil((z1 - z0) / step));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx, za = z0 + (z1 - z0) * j / nz, zb = z0 + (z1 - z0) * (j + 1) / nz;
      gb.q4([xa, heightAt(xa, zb) + dy, zb], [xb, heightAt(xb, zb) + dy, zb], [xb, heightAt(xb, za) + dy, za], [xa, heightAt(xa, za) + dy, za], [[0, 0], [1, 0], [1, 1], [0, 1]], c);
    }
  }
  // A fence along a polyline at the ground's height: posts every 3 m and two rails.
  fence(pts, c = PAL.wood, h = 1.1) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 3));
      for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n, y = heightAt(x, z); this.p.box(x - 0.07, z - 0.07, x + 0.07, z + 0.07, y - 0.1, y + h, 2, c); }
      for (const hh of [h * 0.45, h * 0.88]) for (let k = 0; k < n; k++) {
        const x0 = ax + (bx - ax) * k / n, z0 = az + (bz - az) * k / n, x1 = ax + (bx - ax) * (k + 1) / n, z1 = az + (bz - az) * (k + 1) / n;
        this.beam([x0, heightAt(x0, z0) + hh - this.Y, z0], [x1, heightAt(x1, z1) + hh - this.Y, z1], 0.04, c, this.p);
      }
    }
  }
  // A sign board at (x, y above the ground, z), turned by `yaw`, w wide and h tall, from a cell of the shared sign texture.
  sign(x, y, z, yaw, w, h, cell) { this.signs.push({ x, y: this.Y + y, z, yaw, w, h, cell }); }
  finish(mats) {
    const add = (gb, mat, cast = true) => { if (gb.count) { const m = new THREE.Mesh(gb.geometry(), mat); m.castShadow = cast && Q.shadows; m.receiveShadow = Q.shadows; this.group.add(m); } };
    const geos = [...this.x]; if (this.p.count) geos.unshift(this.p.geometry());
    if (geos.length) { const m = new THREE.Mesh(mergeGeoms(geos), mats.prop); m.castShadow = Q.shadows; m.receiveShadow = Q.shadows; this.group.add(m); }
    add(this.m, mats.metal); add(this.g, mats.glass, false); add(this.e, mats.glow, false);
    for (const page of new Set(this.signs.map(s => s.cell.page))) {                                  // the sign boards: all of a page's in one mesh
      const pos = [], nor = [], uv = [], idx = [];
      for (const s of this.signs) { if (s.cell.page !== page) continue; const c = Math.cos(s.yaw), sn = Math.sin(s.yaw), b = pos.length / 3, { u0, u1, v0, v1 } = s.cell;
        for (const [lx, ly, lu, lv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) { pos.push(s.x + lx * s.w / 2 * c, s.y + ly * s.h / 2, s.z - lx * s.w / 2 * sn); nor.push(sn, 0, c); uv.push(u0 + (u1 - u0) * lu, v0 + (v1 - v0) * lv); }
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      this.group.add(new THREE.Mesh(g, page.mat));
    }
    return this.group;
  }
}
export function paint(geo, c) { const a = []; for (let i = 0; i < geo.attributes.position.count; i++) a.push(c.r, c.g, c.b); geo.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); if (geo.index) geo = geo.toNonIndexed(); if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2)); return geo; }
// All the sign boards of all the places share a few pages of one texture (cells of 320 x 120, 4 across and 10 down) instead of a texture each: 37 signs
// were 37 textures and 18 MB of graphics memory, and a tablet short of memory shows a black picture.
const SIGN = { cw: 320, ch: 120, cols: 4, rows: 10, pages: [] };
function signPage() {
  let p = SIGN.pages[SIGN.pages.length - 1];
  if (!p || p.n >= SIGN.cols * SIGN.rows) {
    const c = document.createElement('canvas'); c.width = SIGN.cols * SIGN.cw; c.height = SIGN.rows * SIGN.ch;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    p = { c, g: c.getContext('2d'), tex, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }), n: 0 }; SIGN.pages.push(p);
  }
  return p;
}
export const signPages = () => SIGN.pages;
// Paint one sign into the next free cell; returns where it is (the page and its UV rectangle).
export function signCell(text, sub, bg = '#7a1f1a', fg = '#f4efe2') {
  const p = signPage(), i = p.n++, W = p.c.width, H = p.c.height, { cw, ch, cols } = SIGN, x = (i % cols) * cw, y = Math.floor(i / cols) * ch, g = p.g;
  g.save(); g.translate(x, y);
  g.fillStyle = bg; g.fillRect(0, 0, cw, ch); g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(7, 7, cw - 14, ch - 14);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 ' + Math.round(ch * 0.37) + 'px "Barlow Condensed", Arial, sans-serif'; g.fillText(text, cw / 2, sub ? ch * 0.4 : ch / 2, cw - 24);
  if (sub) { g.font = '600 ' + Math.round(ch * 0.18) + 'px "Barlow", Arial, sans-serif'; g.fillText(sub, cw / 2, ch * 0.74, cw - 24); }
  g.restore(); p.tex.needsUpdate = true;
  return { page: p, u0: x / W, u1: (x + cw) / W, v0: 1 - (y + ch) / H, v1: 1 - y / H };
}

// Instanced copies of one of the city's plant models (a pine, a cactus, a rock): list = [[x, z, scale, rotation01], ...], put on the ground's height.
export function planted(city, kit, geoName, matName, list, cast = true) {
  if (!list.length) return;
  const P = city.props, im = new THREE.InstancedMesh(P.geo[geoName], P.mat[matName], list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  list.forEach((it, k) => { q.setFromAxisAngle(up, it[3] * 6.28); s.set(it[2], it[2] * (0.9 + it[3] * 0.3), it[2]); v.set(it[0], heightAt(it[0], it[1]) - 0.15, it[1]); m4.compose(v, q, s); im.setMatrixAt(k, m4); });
  im.castShadow = cast && Q.shadows; im.receiveShadow = false; im.computeBoundingSphere(); kit.group.add(im);
  for (const it of list) addStaticCollider({ type: 'circ', x: it[0], z: it[1], r: 0.5 * it[2] });
}
