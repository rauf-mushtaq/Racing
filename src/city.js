// Sunset City: a grid of boulevards and streets with shops, apartments, glass
// towers, parks, palms, street lights and signs. Builds the meshes (merged by
// material so the whole city is a few dozen draw calls) and the collision data.
import * as THREE from 'three';
import * as T from './textures.js';
import { mulberry32, fbm, clamp } from './util.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const SP = 180;            // distance between road centre lines
export const N = 4;               // lines run from -N to N on both axes
export const isBlvd = k => k === 0 || Math.abs(k) === N;
export const hw = k => (isBlvd(k) ? 16 : 9);             // road half width
export const medianHalf = k => (isBlvd(k) ? 2.5 : 0);
export const laneW = k => (isBlvd(k) ? 4 : 3.8);
export const laneCount = k => (isBlvd(k) ? 3 : 2);
export const laneOffset = (k, lane) => medianHalf(k) + laneW(k) * (lane + 0.5);
export const SIDEWALK = 5;
export const EDGE = N * SP + hw(N);   // outer edge of the ring road
export const LIMIT = EDGE + 420;      // how far out you can drive
const CURB = 0.15, MEDIAN_H = 0.18;

const PARKS = new Set(['1,-3', '-3,1', '2,1', '-2,-3']);

// ---------------------------------------------------------------------------
// Collision data: boxes (buildings) and circles (trees, poles) in a grid hash.
// ---------------------------------------------------------------------------
const CELL = 40;
const grid = new Map();
const key = (cx, cz) => (cx + 2000) * 4096 + (cz + 2000);
function addCollider(c) {
  const x0 = c.type === 'box' ? c.x0 : c.x - c.r, x1 = c.type === 'box' ? c.x1 : c.x + c.r;
  const z0 = c.type === 'box' ? c.z0 : c.z - c.r, z1 = c.type === 'box' ? c.z1 : c.z + c.r;
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const k = key(cx, cz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(c);
    }
}
let qid = 0;
export function queryColliders(x, z, r, out) {
  out.length = 0; qid++;
  for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
    for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
      const a = grid.get(key(cx, cz)); if (!a) continue;
      for (const c of a) if (c.q !== qid) { c.q = qid; out.push(c); }
    }
  return out;
}

// ---------------------------------------------------------------------------
// What's under a point: height, and whether it's grass.
// ---------------------------------------------------------------------------
export function surfaceAt(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax > EDGE || az > EDGE) {
    const out = Math.max(ax, az) - EDGE;
    return out < 6 ? { y: CURB, grass: false } : { y: 0, grass: true };
  }
  const kx = clamp(Math.round(x / SP), -N, N), kz = clamp(Math.round(z / SP), -N, N);
  const dx = Math.abs(x - kx * SP), dz = Math.abs(z - kz * SP);
  const onAve = dx < hw(kx), onSt = dz < hw(kz);
  if (onAve && onSt) return { y: 0, grass: false };
  if (onAve) return dx < medianHalf(kx) && dz > hw(kz) + 7 ? { y: MEDIAN_H, grass: true } : { y: 0, grass: false };
  if (onSt) return dz < medianHalf(kz) && dx > hw(kx) + 7 ? { y: MEDIAN_H, grass: true } : { y: 0, grass: false };
  // Inside a block.
  const bi = Math.floor(x / SP), bj = Math.floor(z / SP);
  if (PARKS.has(bi + ',' + bj)) {
    const x0 = bi * SP + hw(bi) + SIDEWALK, x1 = (bi + 1) * SP - hw(bi + 1) - SIDEWALK;
    const z0 = bj * SP + hw(bj) + SIDEWALK, z1 = (bj + 1) * SP - hw(bj + 1) - SIDEWALK;
    if (x > x0 && x < x1 && z > z0 && z < z1) return { y: CURB, grass: true };
  }
  return { y: CURB, grass: false };
}

// ---------------------------------------------------------------------------
// Geometry builder: quads with normals, UVs and colours, merged per material.
// ---------------------------------------------------------------------------
class GB {
  constructor(colors = false) { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.colors = colors; }
  // Quad o, o+U, o+U+V, o+V; it faces along U x V.
  quad(o, U, V, u0, v0, u1, v1, col) {
    const b = this.p.length / 3;
    const nx = U[1] * V[2] - U[2] * V[1], ny = U[2] * V[0] - U[0] * V[2], nz = U[0] * V[1] - U[1] * V[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    const P = [o, [o[0] + U[0], o[1] + U[1], o[2] + U[2]], [o[0] + U[0] + V[0], o[1] + U[1] + V[1], o[2] + U[2] + V[2]], [o[0] + V[0], o[1] + V[1], o[2] + V[2]]];
    const UV = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (let k = 0; k < 4; k++) {
      this.p.push(...P[k]); this.n.push(nx / l, ny / l, nz / l); this.uv.push(...UV[k]);
      if (this.colors) this.c.push(col.r, col.g, col.b);
    }
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // Flat rectangle facing up at height y, UVs in world units / s.
  flat(x0, z0, x1, z1, y, s, col) { this.quad([x0, y, z1], [x1 - x0, 0, 0], [0, 0, z0 - z1], x0 / s, -z1 / s, x1 / s, -z0 / s, col); }
  // Four walls of a box; UVs run along each face (texW, texH metres per repeat).
  walls(x0, z0, x1, z1, y0, y1, texW, texH, col, uOff = 0, stretchV = false) {
    const dx = x1 - x0, dz = z1 - z0, h = y1 - y0, v1 = stretchV ? 1 : h / texH;
    this.quad([x1, y0, z1], [0, 0, -dz], [0, h, 0], uOff, 0, uOff + dz / texW, v1, col);
    this.quad([x0, y0, z0], [0, 0, dz], [0, h, 0], uOff + 0.37, 0, uOff + 0.37 + dz / texW, v1, col);
    this.quad([x0, y0, z1], [dx, 0, 0], [0, h, 0], uOff + 0.61, 0, uOff + 0.61 + dx / texW, v1, col);
    this.quad([x1, y0, z0], [-dx, 0, 0], [0, h, 0], uOff + 0.13, 0, uOff + 0.13 + dx / texW, v1, col);
  }
  box(x0, z0, x1, z1, y0, y1, s, col) { this.walls(x0, z0, x1, z1, y0, y1, s, s, col); this.flat(x0, z0, x1, z1, y1, s, col); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

const col = h => new THREE.Color(h);
const STUCCO = ['#efe6d8', '#e8d6c0', '#d9c3a5', '#f1ddd0', '#cfc6bd', '#e6cfc4', '#d8d0c0', '#c4b4a6', '#e9c9b0', '#d5c9b6'].map(col);
const GLASS = ['#c9d6e3', '#b8c4d0', '#d6d0c8', '#a9b8c9', '#c0c8c0'].map(col);
const SHOP = ['#f2e8dc', '#e7d2bc', '#d4b79a', '#c9c2b8', '#e9dccb', '#d8c4ae', '#bfa58f'].map(col);
const WHITE = new THREE.Color(1, 1, 1);

// ---------------------------------------------------------------------------
// Build the city.
// ---------------------------------------------------------------------------
export function buildCity(scene, quality) {
  const rnd = mulberry32(2026);
  const shadows = quality !== 'low';
  const group = new THREE.Group(); scene.add(group);

  const gbAsphalt = new GB(), gbWalk = new GB(), gbCurb = new GB(), gbPark = new GB(true), gbMark = new GB(true);
  const gbGlass = new GB(true), gbApt = new GB(true), gbShop = new GB(true), gbRoof = new GB(true), gbSign = new GB();
  const gbProps = new GB(true), gbLot = new GB();
  const trees = [], palms = [], lamps = [], parked = [], billboards = [], gantries = [];

  // --- Floors -------------------------------------------------------------
  gbAsphalt.flat(-EDGE, -EDGE, EDGE, EDGE, 0, 10);
  const R = EDGE + 6;
  for (const [x0, z0, x1, z1] of [[-R, -R, R, -EDGE], [-R, EDGE, R, R], [-R, -EDGE, -EDGE, EDGE], [EDGE, -EDGE, R, EDGE]]) {
    gbWalk.flat(x0, z0, x1, z1, CURB, 4.5);
  }
  // Outer curb faces.
  gbCurb.walls(-R, -R, R, R, 0, CURB, 4.5, 4.5, WHITE);
  // Palms around the outside of the ring.
  for (let s = -R + 10; s < R; s += 26) for (const [x, z] of [[s, -R + 3], [s, R - 3], [-R + 3, s], [R - 3, s]]) palms.push([x, z, 0.85 + rnd() * 0.45]);

  // --- Blocks -------------------------------------------------------------
  const lotsAll = [];
  for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
    const x0 = i * SP + hw(i), x1 = (i + 1) * SP - hw(i + 1), z0 = j * SP + hw(j), z1 = (j + 1) * SP - hw(j + 1);
    const park = PARKS.has(i + ',' + j);
    const ix0 = x0 + SIDEWALK, ix1 = x1 - SIDEWALK, iz0 = z0 + SIDEWALK, iz1 = z1 - SIDEWALK;
    // Sidewalk ring and interior.
    gbWalk.flat(x0, z0, x1, iz0, CURB, 4.5); gbWalk.flat(x0, iz1, x1, z1, CURB, 4.5);
    gbWalk.flat(x0, iz0, ix0, iz1, CURB, 4.5); gbWalk.flat(ix1, iz0, x1, iz1, CURB, 4.5);
    if (park) gbPark.flat(ix0, iz0, ix1, iz1, CURB, 18, WHITE);
    else gbWalk.flat(ix0, iz0, ix1, iz1, CURB, 4.5);
    gbCurb.walls(x0, z0, x1, z1, 0, CURB, 4.5, 4.5, WHITE);

    // Street furniture along the four sides of the block.
    const sides = [
      { line: i, axis: 'x', c: x0, from: z0, to: z1, out: -1 },      // west side faces avenue i
      { line: i + 1, axis: 'x', c: x1, from: z0, to: z1, out: 1 },
      { line: j, axis: 'z', c: z0, from: x0, to: x1, out: -1 },
      { line: j + 1, axis: 'z', c: z1, from: x0, to: x1, out: 1 },
    ];
    for (const s of sides) {
      const blvd = isBlvd(s.line);
      const len = s.to - s.from, nLamps = Math.max(2, Math.round(len / 34));
      for (let n = 0; n < nLamps; n++) {
        const t = s.from + 8 + (len - 16) * (n / (nLamps - 1));
        const p = s.c + s.out * -0.8; // just inside the curb
        const yaw = s.axis === 'x' ? (s.out < 0 ? -Math.PI / 2 : Math.PI / 2) : (s.out < 0 ? Math.PI : 0);
        const [x, z] = s.axis === 'x' ? [p, t] : [t, p];
        lamps.push([x, z, yaw, CURB]);
        // Trees or palms between lamps.
        if (n < nLamps - 1) {
          const tm = t + (len - 16) / (nLamps - 1) / 2, pt = s.c - s.out * 2.6;
          const [tx, tz] = s.axis === 'x' ? [pt, tm] : [tm, pt];
          if (blvd) { if ((n + i + j) % 3 === 2) trees.push([tx, tz, 1.1 + rnd() * 0.5, CURB]); else palms.push([tx, tz, 0.9 + rnd() * 0.35, CURB]); }
          else if (rnd() < 0.8) trees.push([tx, tz, 0.85 + rnd() * 0.5, CURB]);
        }
      }
    }

    if (park) {
      for (let k = 0; k < 34; k++) {
        const x = ix0 + 6 + rnd() * (ix1 - ix0 - 12), z = iz0 + 6 + rnd() * (iz1 - iz0 - 12);
        if (rnd() < 0.75) trees.push([x, z, 1.0 + rnd() * 0.8, CURB]); else palms.push([x, z, 0.8 + rnd() * 0.5, CURB]);
      }
      continue;
    }

    // Buildings on lots.
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = Math.max(Math.abs(cx), Math.abs(cz));
    const zone = d < 200 ? 'down' : d < 430 ? 'mid' : 'out';
    const maxLot = zone === 'down' ? 64 : zone === 'mid' ? 44 : 34;
    const lots = []; subdivide({ x0: ix0, z0: iz0, x1: ix1, z1: iz1 }, maxLot, rnd, lots);
    for (const lot of lots) {
      const faces = [];
      if (lot.x0 - ix0 < 0.5) faces.push({ dir: [-1, 0], line: i, axis: 'x' });
      if (ix1 - lot.x1 < 0.5) faces.push({ dir: [1, 0], line: i + 1, axis: 'x' });
      if (lot.z0 - iz0 < 0.5) faces.push({ dir: [0, -1], line: j, axis: 'z' });
      if (iz1 - lot.z1 < 0.5) faces.push({ dir: [0, 1], line: j + 1, axis: 'z' });
      lotsAll.push({ lot, faces, zone, d });
    }
  }

  // --- Buildings ----------------------------------------------------------
  const facG = T.facadeGlass(), facA = T.facadeApartment(), facS = T.facadeShop();
  let signN = 0;
  for (const { lot, faces, zone, d } of lotsAll) {
    const onBlvd = faces.some(f => isBlvd(f.line));
    if (!faces.length && zone === 'out' && rnd() < 0.6) { parkingLot(lot); continue; }
    const g = 1.0 + rnd() * 1.6;
    const b = { x0: lot.x0 + g, z0: lot.z0 + g, x1: lot.x1 - g, z1: lot.z1 - g };
    // Shops build right up to the pavement.
    for (const f of faces) {
      if (f.dir[0] < 0) b.x0 = lot.x0 + 0.3; if (f.dir[0] > 0) b.x1 = lot.x1 - 0.3;
      if (f.dir[1] < 0) b.z0 = lot.z0 + 0.3; if (f.dir[1] > 0) b.z1 = lot.z1 - 0.3;
    }
    if (b.x1 - b.x0 < 6 || b.z1 - b.z0 < 6) continue;
    let style, h;
    const r = rnd();
    if (zone === 'down') { style = 'glass'; h = 45 + Math.pow(rnd(), 1.4) * 125 * clamp(1.25 - d / 260, 0.4, 1); if (r < 0.15) { style = 'apt'; h = 30 + rnd() * 30; } }
    else if (zone === 'mid') {
      if (onBlvd && r < 0.55) { style = 'shop'; h = 5 + rnd() * 1.6; }
      else if (r < 0.6) { style = 'apt'; h = 10.5 + Math.floor(rnd() * 7) * 3.5; }
      else { style = 'glass'; h = 22 + rnd() * 34; }
    } else {
      if (onBlvd || r < 0.45) { style = 'shop'; h = 4.6 + rnd() * 1.8; }
      else { style = 'apt'; h = 7 + Math.floor(rnd() * 3) * 3.5; }
    }
    if (!faces.length && style === 'shop') { style = 'apt'; h = 7 + rnd() * 7; }
    addBuilding(b, style, h, faces);
  }

  function addBuilding(b, style, h, faces) {
    const fac = style === 'glass' ? facG : style === 'apt' ? facA : facS;
    const gb = style === 'glass' ? gbGlass : style === 'apt' ? gbApt : gbShop;
    const pal = style === 'glass' ? GLASS : style === 'apt' ? STUCCO : SHOP;
    const c = pal[(rnd() * pal.length) | 0];
    const uOff = Math.floor(rnd() * 8) / 8;
    gb.walls(b.x0, b.z0, b.x1, b.z1, CURB, CURB + h, fac.w, fac.h, c, uOff, style === 'shop');
    const rc = new THREE.Color(0.55 + rnd() * 0.15, 0.53 + rnd() * 0.12, 0.52 + rnd() * 0.1);
    if (style === 'glass' && h > 60 && rnd() < 0.7) {
      // A narrower top section.
      const ix = (b.x1 - b.x0) * 0.15, iz = (b.z1 - b.z0) * 0.15, hb = h * (0.62 + rnd() * 0.15);
      gbRoof.flat(b.x0, b.z0, b.x1, b.z1, CURB + hb, 8, rc);
      gb.walls(b.x0 + ix, b.z0 + iz, b.x1 - ix, b.z1 - iz, CURB + hb, CURB + h, fac.w, fac.h, c, uOff);
      gbRoof.flat(b.x0 + ix, b.z0 + iz, b.x1 - ix, b.z1 - iz, CURB + h, 8, rc);
      gbProps.box((b.x0 + b.x1) / 2 - 2, (b.z0 + b.z1) / 2 - 2, (b.x0 + b.x1) / 2 + 2, (b.z0 + b.z1) / 2 + 2, CURB + h, CURB + h + 4, 4, new THREE.Color(0.3, 0.3, 0.32));
    } else {
      gbRoof.flat(b.x0, b.z0, b.x1, b.z1, CURB + h, 8, rc);
      // Parapet and rooftop plant.
      gbRoof.walls(b.x0, b.z0, b.x1, b.z1, CURB + h, CURB + h + 0.6, 8, 8, c);
      for (let k = 0; k < 1 + rnd() * 2; k++) {
        const ax = b.x0 + 2 + rnd() * Math.max(1, b.x1 - b.x0 - 6), az = b.z0 + 2 + rnd() * Math.max(1, b.z1 - b.z0 - 6);
        gbProps.box(ax, az, ax + 1.6 + rnd() * 1.5, az + 1.2 + rnd(), CURB + h, CURB + h + 1.1 + rnd(), 4, new THREE.Color(0.62, 0.62, 0.6));
      }
    }
    addCollider({ type: 'box', x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 });
    if (style === 'shop' && faces.length) {
      for (const f of faces.slice(0, 2)) shopSign(b, f, h);
      const f = faces[0];
      if (isBlvd(f.line) && rnd() < 0.3) poleSign(b, f);
    }
    if (style !== 'glass' && faces.length && billboards.length < 10 && rnd() < 0.05) billboard(b, faces[0], h);
  }

  function signUV() {
    const n = signN++ % 32, cc = n % 4, rr = (n / 4) | 0;
    return [cc / 4 + 0.004, 1 - (rr + 1) / 8 + 0.004, (cc + 1) / 4 - 0.004, 1 - rr / 8 - 0.004];
  }
  // A lit box sign above the shop windows.
  function shopSign(b, f, h) {
    const along = f.dir[0] !== 0 ? b.z1 - b.z0 : b.x1 - b.x0;
    const w = Math.min(along * 0.55, 10), sh = Math.min(1.5, w / 2.2), y0 = CURB + h * 0.74;
    const [u0, v0, u1, v1] = signUV(), t = 0.35;
    if (f.dir[0] !== 0) {
      const x = f.dir[0] < 0 ? b.x0 : b.x1, zc = (b.z0 + b.z1) / 2 + (rnd() - 0.5) * (along - w) * 0.6, s = f.dir[0];
      const xo = x + s * t;
      if (s > 0) gbSign.quad([xo, y0, zc + w / 2], [0, 0, -w], [0, sh, 0], u0, v0, u1, v1);
      else gbSign.quad([xo, y0, zc - w / 2], [0, 0, w], [0, sh, 0], u0, v0, u1, v1);
    } else {
      const z = f.dir[1] < 0 ? b.z0 : b.z1, xc = (b.x0 + b.x1) / 2 + (rnd() - 0.5) * (along - w) * 0.6, s = f.dir[1];
      const zo = z + s * t;
      if (s > 0) gbSign.quad([xc - w / 2, y0, zo], [w, 0, 0], [0, sh, 0], u0, v0, u1, v1);
      else gbSign.quad([xc + w / 2, y0, zo], [-w, 0, 0], [0, sh, 0], u0, v0, u1, v1);
    }
  }
  // A tall sign on a pole at the pavement's edge, readable down the road.
  function poleSign(b, f) {
    const s = f.dir[0] !== 0 ? f.dir[0] : f.dir[1];
    let x, z;
    if (f.dir[0] !== 0) { x = (f.dir[0] < 0 ? b.x0 : b.x1) + s * (SIDEWALK - 1.2); z = b.z0 + 2; }
    else { z = (f.dir[1] < 0 ? b.z0 : b.z1) + s * (SIDEWALK - 1.2); x = b.x0 + 2; }
    const ph = 8 + rnd() * 3, dark = new THREE.Color(0.18, 0.18, 0.2);
    gbProps.box(x - 0.18, z - 0.18, x + 0.18, z + 0.18, CURB, CURB + ph, 2, dark);
    addCollider({ type: 'circ', x, z, r: 0.3 });
    const [u0, v0, u1, v1] = signUV(), w = 4.2, sh = 2.1, y0 = CURB + ph;
    // Two faces, along the road both ways.
    if (f.dir[0] !== 0) {
      gbSign.quad([x - w / 2, y0, z + 0.25], [w, 0, 0], [0, sh, 0], u0, v0, u1, v1);
      gbSign.quad([x + w / 2, y0, z - 0.25], [-w, 0, 0], [0, sh, 0], u0, v0, u1, v1);
      gbProps.walls(x - w / 2, z - 0.25, x + w / 2, z + 0.25, y0, y0 + sh, 4, 4, dark);
    } else {
      gbSign.quad([x + 0.25, y0, z + w / 2], [0, 0, -w], [0, sh, 0], u0, v0, u1, v1);
      gbSign.quad([x - 0.25, y0, z - w / 2], [0, 0, w], [0, sh, 0], u0, v0, u1, v1);
      gbProps.walls(x - 0.25, z - w / 2, x + 0.25, z + w / 2, y0, y0 + sh, 4, 4, dark);
    }
  }
  function billboard(b, f, h) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    billboards.push({ x: cx, z: cz, y: CURB + h + 2, yaw: Math.atan2(f.dir[0], f.dir[1]) });
  }
  function parkingLot(lot) {
    gbLot.flat(lot.x0 + 0.5, lot.z0 + 0.5, lot.x1 - 0.5, lot.z1 - 0.5, CURB + 0.01, 10);
    const alongX = lot.x1 - lot.x0 > lot.z1 - lot.z0;
    const n = Math.floor(((alongX ? lot.x1 - lot.x0 : lot.z1 - lot.z0) - 4) / 3);
    const white = new THREE.Color(0.85, 0.85, 0.8);
    for (let k = 0; k <= n; k++) {
      const t = (alongX ? lot.x0 : lot.z0) + 2 + k * 3;
      for (const side of [0, 1]) {
        const a = side ? (alongX ? lot.z1 - 6 : lot.x1 - 6) : (alongX ? lot.z0 + 1 : lot.x0 + 1);
        if (alongX) gbMark.flat(t - 0.06, a, t + 0.06, a + 5, CURB + 0.02, 10, white);
        else gbMark.flat(a, t - 0.06, a + 5, t + 0.06, CURB + 0.02, 10, white);
        if (k < n && rnd() < 0.3) {
          const c = t + 1.5, m = a + 2.5;
          const yaw = alongX ? (side ? Math.PI : 0) : (side ? -Math.PI / 2 : Math.PI / 2);
          parked.push(alongX ? [c, m, yaw, CURB] : [m, c, yaw, CURB]);
          addCollider({ type: 'circ', x: alongX ? c : m, z: alongX ? m : c, r: 1.3 });
        }
      }
    }
  }

  // --- Roads: medians and markings ----------------------------------------
  const W = new THREE.Color(0.9, 0.9, 0.86), Y = new THREE.Color(0.92, 0.7, 0.2);
  for (let k = -N; k <= N; k++) for (const axis of ['x', 'z']) {
    // axis 'x': an avenue at x = k*SP running along z. 'z': a street at z = k*SP running along x.
    const C = k * SP, rs = axis === 'x' ? -1 : 1;   // side of the +along direction's right
    const rect = (a0, a1, c0, c1, y, color) => {
      const [p0, p1] = [Math.min(a0, a1), Math.max(a0, a1)], [q0, q1] = [Math.min(c0, c1), Math.max(c0, c1)];
      if (axis === 'x') gbMark.flat(C + q0, p0, C + q1, p1, y, 10, color);
      else gbMark.flat(p0, C + q0, p1, C + q1, y, 10, color);
    };
    const m = medianHalf(k), lw = laneW(k), nl = laneCount(k), H = hw(k);
    for (let j = -N; j < N; j++) {
      const aA = j * SP + hw(j), aB = (j + 1) * SP - hw(j + 1);
      // Crosswalks at both ends.
      for (const [a0, dir] of [[aA + 0.6, 1], [aB - 0.6, -1]]) {
        for (let c = -H + 1; c < H - 1; c += 1.25) rect(a0, a0 + dir * 4, c, c + 0.6, 0.012, W);
        // Stop line across the lanes that arrive at this end.
        const side = dir > 0 ? -rs : rs;
        rect(a0 + dir * 5.2, a0 + dir * 5.7, side * m, side * (m + nl * lw), 0.012, W);
      }
      const s0 = aA + 6.5, s1 = aB - 6.5;
      for (const side of [-1, 1]) {
        for (let b = 1; b < nl; b++) {
          const c = side * (m + b * lw);
          for (let a = s0; a < s1 - 3; a += 9) rect(a, a + 3, c - 0.07, c + 0.07, 0.012, W);
        }
        const ce = side * (m + nl * lw);
        rect(s0, s1, ce - 0.08, ce + 0.08, 0.012, W);
      }
      if (m === 0) { rect(s0, s1, -0.25, -0.1, 0.012, Y); rect(s0, s1, 0.1, 0.25, 0.012, Y); }
      else {
        // Raised median, planted with palms.
        const a0 = aA + 7, a1 = aB - 7;
        if (axis === 'x') { gbPark.flat(C - m, a0, C + m, a1, MEDIAN_H, 18, WHITE); gbCurb.walls(C - m, a0, C + m, a1, 0, MEDIAN_H, 4.5, 4.5, WHITE); }
        else { gbPark.flat(a0, C - m, a1, C + m, MEDIAN_H, 18, WHITE); gbCurb.walls(a0, C - m, a1, C + m, 0, MEDIAN_H, 4.5, 4.5, WHITE); }
        for (let a = a0 + 6; a < a1 - 3; a += 21) palms.push(axis === 'x' ? [C, a, 0.95 + rnd() * 0.35, MEDIAN_H] : [a, C, 0.95 + rnd() * 0.35, MEDIAN_H]);
      }
    }
  }

  // Overhead signs on the main boulevard.
  for (const [z, t1, t2] of [[455, 'SUNSET BLVD', 'DOWNTOWN  ↑'], [-270, 'OCEAN AVE', 'RING ROAD  ↑'], [95, 'CENTRAL', 'CITY HALL  ↑']]) gantries.push({ x: 0, z, t1, t2 });

  // --- Meshes -------------------------------------------------------------
  const asp = T.asphalt(), con = T.concrete(), grassTex = T.ground();
  const add = (gb, mat, cast = false, recv = true) => {
    const m = new THREE.Mesh(gb.geometry(), mat); m.castShadow = cast && shadows; m.receiveShadow = recv && shadows; group.add(m); return m;
  };
  add(gbAsphalt, new THREE.MeshStandardMaterial({ color: 0xb8b4c6, map: asp.map, roughnessMap: asp.roughnessMap, normalMap: asp.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, metalness: 0.0, envMapIntensity: 0.9 }));
  add(gbLot, new THREE.MeshStandardMaterial({ color: 0x8a8486, map: asp.map, roughnessMap: asp.roughnessMap, roughness: 1 }));
  add(gbWalk, new THREE.MeshStandardMaterial({ color: 0xc2b8b4, map: con.map, normalMap: con.normalMap, roughness: 0.92 }));
  add(gbCurb, new THREE.MeshStandardMaterial({ color: 0xc8c0bc, map: con.map, roughness: 0.9 }));
  add(gbPark, new THREE.MeshStandardMaterial({ color: 0x8fa070, map: grassTex, roughness: 1, vertexColors: true }));
  const markMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  add(gbMark, markMat);
  const facMat = (f, metal, rough, ei) => new THREE.MeshStandardMaterial({
    map: f.map, emissiveMap: f.emissiveMap, roughnessMap: f.roughnessMap, emissive: 0xffffff, emissiveIntensity: ei,
    vertexColors: true, metalness: metal, roughness: rough,
  });
  add(gbGlass, facMat(facG, 0.55, 1, 1.15), true);
  add(gbApt, facMat(facA, 0.0, 1, 1.2), true);
  add(gbShop, facMat(facS, 0.0, 1, 2.0), true);
  add(gbRoof, new THREE.MeshStandardMaterial({ map: T.roofTex(), vertexColors: true, roughness: 0.95 }), true);
  add(gbProps, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 }), true);
  const atlas = T.signAtlas();
  add(gbSign, new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 2.4, roughness: 0.5, side: THREE.DoubleSide }), false, false);

  // Big ground beyond the city.
  const gtex = T.ground(); gtex.repeat.set(1, 1);
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9a8c78, map: gtex, roughness: 1 }));
  gnd.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 1000; });
  gnd.position.y = -0.03; gnd.receiveShadow = shadows; group.add(gnd);

  buildTrees(group, trees, shadows && quality === 'high');
  buildPalms(group, palms, shadows && quality === 'high');
  buildLamps(group, lamps, shadows);
  buildGantries(group, gantries, shadows);
  buildBillboards(group, billboards);
  for (const t of trees) addCollider({ type: 'circ', x: t[0], z: t[1], r: 0.45 });
  for (const p of palms) addCollider({ type: 'circ', x: p[0], z: p[1], r: 0.4 });
  for (const l of lamps) addCollider({ type: 'circ', x: l[0], z: l[1], r: 0.25 });

  return { group, parked };
}

function subdivide(r, max, rnd, out) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (w <= max && d <= max) { out.push(r); return; }
  const t = 0.35 + rnd() * 0.3;
  if (w > d) { const x = r.x0 + w * t; subdivide({ ...r, x1: x }, max, rnd, out); subdivide({ ...r, x0: x }, max, rnd, out); }
  else { const z = r.z0 + d * t; subdivide({ ...r, z1: z }, max, rnd, out); subdivide({ ...r, z0: z }, max, rnd, out); }
}

// ---------------------------------------------------------------------------
// Instanced street furniture.
// ---------------------------------------------------------------------------
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

function blobTree() {
  const parts = [];
  const rnd = mulberry32(12);
  for (const [x, y, z, r] of [[0, 4.7, 0, 2.4], [1.3, 4.2, 0.6, 1.8], [-1.2, 4.4, -0.5, 1.9]]) {
    const ico = new THREE.IcosahedronGeometry(r, 1); ico.deleteAttribute('uv'); ico.deleteAttribute('normal');
    const g = mergeVertices(ico);
    const p = g.attributes.position, c = [];
    for (let i = 0; i < p.count; i++) {
      v3.fromBufferAttribute(p, i);
      const n = fbm(v3.x * 0.9 + x, v3.y * 0.9 + y + v3.z * 0.7, 3, 5);
      v3.multiplyScalar(0.8 + n * 0.45);
      p.setXYZ(i, v3.x + x, v3.y * 0.85 + y, v3.z + z);
      const sh = 0.75 + (v3.y / r) * 0.25 + rnd() * 0.08;
      c.push(0.16 * sh, 0.26 * sh, 0.11 * sh);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.computeVertexNormals();
    parts.push(g);
  }
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 4, 6, 1, true).translate(0, 2, 0);
  const tc = []; for (let i = 0; i < trunk.attributes.position.count; i++) tc.push(0.25, 0.19, 0.14);
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
  return mergeGeoms([trunk, ...parts]);
}

function mergeGeoms(list) {
  // Minimal merge of indexed/non-indexed geometries with position/normal/color.
  const pos = [], nor = [], colr = [], idx = [];
  let base = 0;
  for (const g0 of list) {
    const g = g0.index ? g0 : g0;
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i));
      if (c) colr.push(c.getX(i), c.getY(i), c.getZ(i)); else colr.push(1, 1, 1);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  return g;
}
export { mergeGeoms };

// Instanced meshes split into 360 m chunks, so the ones off screen (or outside
// the shadow box) are skipped. Returns the chunk meshes and, for each, the
// indexes of the items it holds.
function instanced(group, geom, mat, list, place, cast) {
  const buckets = new Map();
  list.forEach((it, i) => {
    const k = Math.floor(it[0] / 360) + ',' + Math.floor(it[1] / 360);
    let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(i);
  });
  const meshes = [];
  for (const idx of buckets.values()) {
    const m = new THREE.InstancedMesh(geom, mat, idx.length);
    const rnd = mulberry32(idx[0] + 1);
    idx.forEach((i, n) => { place(list[i], rnd, i); m.setMatrixAt(n, m4); });
    m.castShadow = cast; m.receiveShadow = false;
    m.computeBoundingSphere();
    m.userData.items = idx;
    group.add(m); meshes.push(m);
  }
  return meshes;
}
function tint(meshes, fn) {
  const c = new THREE.Color();
  for (const m of meshes) m.userData.items.forEach((i, n) => { fn(c, i); m.setColorAt(n, c); });
}

function buildTrees(group, list, cast) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const ms = instanced(group, blobTree(), mat, list, (t, rnd) => {
    q.setFromAxisAngle(up, rnd() * 6.28); s3.setScalar(t[2]); v3.set(t[0], t[3], t[1]); m4.compose(v3, q, s3);
  }, cast);
  tint(ms, (c, i) => { const r = mulberry32(i)(); c.setRGB(0.85 + r * 0.35, 0.9 + r * 0.2, 0.8 + r * 0.2); });
}

function buildPalms(group, list, cast) {
  // Trunk: tapered, slightly curved, ringed.
  const trunk = new THREE.CylinderGeometry(0.17, 0.3, 11, 6, 8, true).translate(0, 5.5, 0);
  const p = trunk.attributes.position, tc = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), bend = Math.pow(y / 11, 2) * 0.9;
    p.setX(i, p.getX(i) + bend);
    const ring = 0.85 + 0.15 * Math.sin(y * 9);
    tc.push(0.42 * ring, 0.34 * ring, 0.26 * ring);
  }
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3)); trunk.computeVertexNormals();
  // Fronds: drooping strips with a leaf texture.
  const pos = [], uv = [], idx = [];
  const F = 9, S = 5, L = 4.6;
  for (let f = 0; f < F; f++) {
    const phi = f / F * Math.PI * 2 + (f % 2) * 0.2, lift = 0.5 - (f % 3) * 0.25;
    const dx = Math.cos(phi), dz = Math.sin(phi), px = -dz, pz = dx;
    for (let s = 0; s <= S; s++) {
      const t = s / S, r = t * L, y = 11 + Math.sin(lift) * r - 2.2 * t * t;
      const w = 0.75 * Math.sin(Math.PI * (0.12 + 0.88 * t)) + 0.05;
      const cx = 0.9 + dx * r, cz = dz * r;
      const b = pos.length / 3;
      pos.push(cx - px * w, y - 0.12 * w, cz - pz * w, cx, y + 0.08, cz, cx + px * w, y - 0.12 * w, cz + pz * w);
      uv.push(0, 1 - t, 0.5, 1 - t, 1, 1 - t);
      if (s < S) idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
    }
  }
  const fr = new THREE.BufferGeometry();
  fr.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fr.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  fr.setIndex(idx); fr.computeVertexNormals();
  const place = (t, rnd) => { q.setFromAxisAngle(up, rnd() * 6.28); s3.setScalar(t[2]); v3.set(t[0], t[3], t[1]); m4.compose(v3, q, s3); };
  instanced(group, trunk, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), list, place, cast);
  const fm = instanced(group, fr, new THREE.MeshStandardMaterial({ map: T.frondTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: 0x9fb07a }), list, place, cast);
  tint(fm, (c, i) => { const r = mulberry32(i + 7)(); c.setRGB(0.8 + r * 0.3, 0.85 + r * 0.2, 0.7 + r * 0.2); });
}

function buildLamps(group, list, cast) {
  const pole = new THREE.CylinderGeometry(0.08, 0.14, 8.6, 8).translate(0, 4.3, 0);
  const arm = new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6).rotateX(Math.PI / 2).translate(0, 8.4, 1.4);
  const head = new THREE.BoxGeometry(0.42, 0.16, 0.95).translate(0, 8.4, 2.9);
  const geo = mergeGeoms([pole, arm, head]);
  const place = (l) => { q.setFromAxisAngle(up, l[2]); s3.setScalar(1); v3.set(l[0], l[3], l[1]); m4.compose(v3, q, s3); };
  instanced(group, geo, new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.5, metalness: 0.6 }), list, place, cast);
  const bulb = new THREE.SphereGeometry(0.3, 6, 4).scale(0.9, 0.35, 1.4).translate(0, 8.3, 2.9);
  instanced(group, bulb, new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5.6, 2.8) }), list, place, false);
  // Warm pools of light on the road under each lamp.
  const pool = new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2).translate(0, 0, 3);
  const pm = new THREE.MeshBasicMaterial({ map: T.glowTex(), color: new THREE.Color(0.32, 0.2, 0.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const pl = instanced(group, pool, pm, list, (l) => { q.setFromAxisAngle(up, l[2]); s3.setScalar(1); v3.set(l[0], 0.03, l[1]); m4.compose(v3, q, s3); }, false);
  for (const m of pl) m.renderOrder = 1;
}

function buildGantries(group, list, shadows) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.5, metalness: 0.7 });
  for (const g of list) {
    const grp = new THREE.Group(); grp.position.set(g.x, 0, g.z);
    const H = hw(0) + 1.5;
    for (const sx of [-H, H]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 8, 10), mat); p.position.set(sx, 4, 0); grp.add(p); addCollider({ type: 'circ', x: g.x + sx, z: g.z, r: 0.45 }); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 0.6, 0.7, 0.7), mat); beam.position.y = 7.6; grp.add(beam);
    const tex = T.gantrySign(g.t1, g.t2);
    const sm = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.6 });
    const back = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.7 });
    for (const side of [1, -1]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.8), sm);
      s.position.set(side * 8.5, 7.6, side * 0.53);
      s.rotation.y = side > 0 ? 0 : Math.PI;
      const bk = new THREE.Mesh(new THREE.BoxGeometry(9, 2.8, 0.15), back); bk.position.set(side * 8.5, 7.6, side * 0.45);
      grp.add(s); grp.add(bk);
    }
    grp.traverse(o => { o.castShadow = shadows; });
    group.add(grp);
  }
}

function buildBillboards(group, list) {
  const tex = T.billboardTex();
  const face = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.4 });
  const frame = mergeGeoms([new THREE.BoxGeometry(14.3, 7.3, 0.3).translate(0, 4.5, -0.17), new THREE.BoxGeometry(0.3, 2, 0.3).translate(-4, 0.5, -0.17), new THREE.BoxGeometry(0.3, 2, 0.3).translate(4, 0.5, -0.17)]);
  const board = new THREE.PlaneGeometry(14, 7).translate(0, 4.5, 0.0);
  for (const b of list) {
    const g = new THREE.Group(); g.position.set(b.x, b.y, b.z); g.rotation.y = b.yaw;
    g.add(new THREE.Mesh(frame, dark)); g.add(new THREE.Mesh(board, face));
    group.add(g);
  }
}

// Road graph for traffic and the minimap: nodes are intersections (i, j).
export function nodePos(i, j) { return [i * SP, j * SP]; }
