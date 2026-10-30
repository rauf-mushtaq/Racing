// Geometry helpers: a vertex/index builder (GB) for merged meshes, polygon
// footprints (rectangle, chamfered, rounded, circle) and the operations used to
// build non-boxy buildings: extrude a footprint into walls with smooth normals
// round the corners, cap it, offset or scale it, and loft between two of them.
//
// Footprints are lists of [x, z] points, wound so that walls built from edge i
// to i+1 face outwards (counter-clockwise on a plan with z pointing down: start
// at the south-west corner and go east).
import * as THREE from 'three';

export class GB {
  constructor(colors = false) { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; this.colors = colors; }
  get count() { return this.p.length / 3; }
  vtx(x, y, z, nx, ny, nz, u, v, col) {
    const b = this.p.length / 3;
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v);
    if (this.colors) this.c.push(col.r, col.g, col.b);
    return b;
  }
  // Quad o, o+U, o+U+V, o+V; it faces along U x V.
  quad(o, U, V, u0, v0, u1, v1, col) {
    const nx = U[1] * V[2] - U[2] * V[1], ny = U[2] * V[0] - U[0] * V[2], nz = U[0] * V[1] - U[1] * V[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    const b = this.p.length / 3;
    const P = [o, [o[0] + U[0], o[1] + U[1], o[2] + U[2]], [o[0] + U[0] + V[0], o[1] + U[1] + V[1], o[2] + U[2] + V[2]], [o[0] + V[0], o[1] + V[1], o[2] + V[2]]];
    const UV = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (let k = 0; k < 4; k++) this.vtx(P[k][0], P[k][1], P[k][2], nx / l, ny / l, nz / l, UV[k][0], UV[k][1], col);
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

  // Walls round a footprint. Corners that turn less than about 40 degrees get
  // smooth normals (so a rounded tower looks round, not faceted); sharper ones
  // stay crisp.
  extrude(pts, y0, y1, texW, texH, col, uOff = 0, smooth = true, stretchV = false) {
    const n = pts.length, norms = [], lens = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], ux = b[0] - a[0], uz = b[1] - a[1], l = Math.hypot(ux, uz) || 1;
      lens.push(l); norms.push([-uz / l, ux / l]);
    }
    const vTop = stretchV ? 1 : (y1 - y0) / texH;
    let u = uOff;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], e = norms[i];
      let n0 = e, n1 = e;
      if (smooth) {
        const pv = norms[(i - 1 + n) % n], nx = norms[(i + 1) % n];
        if (pv[0] * e[0] + pv[1] * e[1] > 0.766) { const sx = pv[0] + e[0], sz = pv[1] + e[1], l = Math.hypot(sx, sz); n0 = [sx / l, sz / l]; }
        if (nx[0] * e[0] + nx[1] * e[1] > 0.766) { const sx = nx[0] + e[0], sz = nx[1] + e[1], l = Math.hypot(sx, sz); n1 = [sx / l, sz / l]; }
      }
      const u1 = u + lens[i] / texW, b0 = this.p.length / 3;
      this.vtx(a[0], y0, a[1], n0[0], 0, n0[1], u, 0, col);
      this.vtx(b[0], y0, b[1], n1[0], 0, n1[1], u1, 0, col);
      this.vtx(b[0], y1, b[1], n1[0], 0, n1[1], u1, vTop, col);
      this.vtx(a[0], y1, a[1], n0[0], 0, n0[1], u, vTop, col);
      this.i.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
      u = u1;
    }
  }
  // An up-facing cap over a convex footprint, UVs in world units / s.
  cap(pts, y, s, col) {
    let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[1]; } cx /= pts.length; cz /= pts.length;
    const c = this.vtx(cx, y, cz, 0, 1, 0, cx / s, -cz / s, col), first = this.p.length / 3;
    for (const p of pts) this.vtx(p[0], y, p[1], 0, 1, 0, p[0] / s, -p[1] / s, col);
    const n = pts.length;
    for (let i = 0; i < n; i++) this.i.push(c, first + i, first + (i + 1) % n);
  }
  // A slanted band from footprint A at height yA up to footprint B (same number
  // of points) at yB; flat-shaded.
  loft(A, yA, B, yB, s, col) {
    const n = A.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a0 = [A[i][0], yA, A[i][1]], a1 = [A[j][0], yA, A[j][1]], b1 = [B[j][0], yB, B[j][1]], b0 = [B[i][0], yB, B[i][1]];
      const u = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]], v = [b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]];
      let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
      let l = Math.hypot(nx, ny, nz);
      if (l < 1e-6) { const w = [b1[0] - a0[0], b1[1] - a0[1], b1[2] - a0[2]]; nx = u[1] * w[2] - u[2] * w[1]; ny = u[2] * w[0] - u[0] * w[2]; nz = u[0] * w[1] - u[1] * w[0]; l = Math.hypot(nx, ny, nz) || 1; }
      nx /= l; ny /= l; nz /= l;
      const b = this.p.length / 3;
      for (const P of [a0, a1, b1, b0]) this.vtx(P[0], P[1], P[2], nx, ny, nz, P[0] / s, -P[2] / s + P[1] / s, col);
      this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
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

// --- Footprints --------------------------------------------------------------
export const rectPoly = b => [[b.x0, b.z1], [b.x1, b.z1], [b.x1, b.z0], [b.x0, b.z0]];
export function chamferRect(b, c) {
  return [[b.x0 + c, b.z1], [b.x1 - c, b.z1], [b.x1, b.z1 - c], [b.x1, b.z0 + c], [b.x1 - c, b.z0], [b.x0 + c, b.z0], [b.x0, b.z0 + c], [b.x0, b.z1 - c]];
}
export function roundedRect(x0, z0, x1, z1, r, seg) {
  const pts = [];
  const corner = (cx, cz, a0, a1) => { for (let k = 0; k <= seg; k++) { const a = a0 + (a1 - a0) * k / seg; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } };
  corner(x1 - r, z1 - r, Math.PI / 2, 0);              // south-east
  corner(x1 - r, z0 + r, 0, -Math.PI / 2);             // north-east
  corner(x0 + r, z0 + r, -Math.PI / 2, -Math.PI);      // north-west
  corner(x0 + r, z1 - r, -Math.PI, -Math.PI * 1.5);    // south-west
  return pts;
}
export function circlePoly(cx, cz, r, n) {
  const pts = [];
  for (let k = 0; k < n; k++) { const a = Math.PI / 2 - Math.PI * 2 * k / n; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); }
  return pts;
}
export function centroid(pts) { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; }
export function scalePoly(pts, s) { const [cx, cz] = centroid(pts); return pts.map(p => [cx + (p[0] - cx) * s, cz + (p[1] - cz) * s]); }
// Move every edge outwards by d (negative to shrink), keeping corners sharp.
export function offsetPoly(pts, d) {
  const n = pts.length, out = [];
  const nrm = i => { const a = pts[i], b = pts[(i + 1) % n], ux = b[0] - a[0], uz = b[1] - a[1], l = Math.hypot(ux, uz) || 1; return [-uz / l, ux / l]; };
  for (let i = 0; i < n; i++) {
    const e0 = nrm((i - 1 + n) % n), e1 = nrm(i);
    let bx = e0[0] + e1[0], bz = e0[1] + e1[1]; const l = Math.hypot(bx, bz) || 1; bx /= l; bz /= l;
    const k = d / Math.max(0.5, bx * e1[0] + bz * e1[1]);
    out.push([pts[i][0] + bx * k, pts[i][1] + bz * k]);
  }
  return out;
}

// Minimal merge of geometries with position/normal (and optional colour).
export function mergeGeoms(list) {
  const pos = [], nor = [], colr = [], idx = [];
  let base = 0;
  for (const g of list) {
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
export function mergeGeomsUV(list) {
  const g = mergeGeoms(list), uv = [];
  for (const x of list) { const a = x.attributes.uv; if (a) for (let i = 0; i < a.count; i++) uv.push(a.getX(i), a.getY(i)); else for (let i = 0; i < x.attributes.position.count; i++) uv.push(0.02, 0.02); }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
