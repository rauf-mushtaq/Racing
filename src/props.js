// Street furniture and planting, built once and instanced across the city:
// leafy trees, palms, lamp posts, power poles, traffic signals, hedges, hydrants,
// bins and benches. Foliage uses alpha-to-coverage when multisampling is on, so
// leaf edges are anti-aliased instead of crawling.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { mulberry32, fbm, clamp } from './util.js';
import { mergeGeoms, mergeGeomsUV } from './geom.js';
import { TOD } from './tod.js';
import { Q } from './quality.js';
import { SUN_DIR } from './sky.js';
import { SCAN_MODELS } from './scans.js';

const v3 = new THREE.Vector3();
const withUV = g => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2).fill(0.02), 2)); return g; };
const paint = (g, r, gg, b) => { const c = []; for (let i = 0; i < g.attributes.position.count; i++) c.push(r, gg, b); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g; };

// Foliage is built from leaf cards: small alpha-tested quads, each a spray of leaves (textures.js), set through a volume. What makes it read as a plant
// and not as a few green paper cut-outs: many small cards rather than a few big ones, scattered through the volume (not only over its surface) and turned
// every way, normals pointing out from the middle of the crown (so the light falls across it as across a ball of leaves, not card by card), the cards
// deep inside and low down darker (the leaves shade each other), a very dark core that fills the gaps, and a different green from card to card.
const _c = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
function leafCard(p, size, face, centre, squash, shade, tint) {
  const c = new THREE.PlaneGeometry(size, size).rotateZ(face.w);
  c.applyQuaternion(_q.setFromUnitVectors(Z, _f.set(face.x, face.y, face.z).normalize())).translate(p.x, p.y, p.z);
  const np = c.attributes.position, nn = c.attributes.normal, cc = [];
  for (let i = 0; i < np.count; i++) {
    _c.set((np.getX(i) - centre.x) / squash.x, (np.getY(i) - centre.y) / squash.y, (np.getZ(i) - centre.z) / squash.z).normalize();
    _c.lerp(_f, 0.18).normalize(); nn.setXYZ(i, _c.x, _c.y, _c.z);
    cc.push(shade * tint[0], shade * tint[1], shade * tint[2]);
  }
  c.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); return c;
}
// A dark lumpy core for a lobe of leaves (it fills the gaps between the cards, so you see shade through them, not sky).
function darkCore(x, y, z, rx, ry, rz, col = [0.03, 0.045, 0.018]) {
  const ico = new THREE.IcosahedronGeometry(1, 1); ico.deleteAttribute('uv'); ico.deleteAttribute('normal');
  const g = mergeVertices(ico), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { v3.fromBufferAttribute(p, i); const k = 0.85 + fbm(v3.x * 2 + x, v3.y * 2 + z, 2, 9) * 0.3; p.setXYZ(i, x + v3.x * rx * k, y + v3.y * ry * k, z + v3.z * rz * k); }
  g.computeVertexNormals(); paint(g, col[0], col[1], col[2]); withUV(g); return g;
}
// Scatter `n` cards through a set of lobes ([x, y, z, rx, ry, rz]): mostly near the surface, some deep in, some poking out.
function foliage(rnd, lobes, n, size, centre, squash, floorY, shadeOf) {
  const cards = [], tot = lobes.reduce((s, l) => s + l[3] * l[4] * l[5], 0);
  for (const L of lobes) {
    const m = Math.round(n * L[3] * L[4] * L[5] / tot);
    for (let k = 0; k < m; k++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u), d = new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a));
      if (d.y < -0.45) d.y = -0.45 - (d.y + 0.45) * 0.3;                                     // (few below: the underside is in shade and seldom seen)
      const t = 0.42 + 0.68 * Math.pow(rnd(), 0.55);                                         // depth into the lobe, 0.42 (deep) .. 1.1 (poking out)
      const p = new THREE.Vector3(L[0] + d.x * L[3] * t, Math.max(floorY + rnd() * 0.08, L[1] + d.y * L[4] * t), L[2] + d.z * L[5] * t);
      const face = { x: d.x + (rnd() - 0.5) * 1.1, y: d.y + 0.35 + (rnd() - 0.5) * 1.1, z: d.z + (rnd() - 0.5) * 1.1, w: rnd() * 6.28 };
      const tint = [0.9 + rnd() * 0.2, 0.92 + rnd() * 0.16, 0.86 + rnd() * 0.22];
      cards.push(leafCard(p, size[0] + rnd() * size[1], face, centre, squash, shadeOf(p, t) * (0.85 + rnd() * 0.3), tint));
    }
  }
  return cards;
}

// A broadleaf street tree: a trunk with bark, a few limbs reaching up into the crown, and a crown of overlapping lobes.
function leafTree(detail) {
  const rnd = mulberry32(12);
  const lobes = [[0, 5.0, 0, 1.9, 1.5, 1.9], [1.5, 4.5, 0.6, 1.4, 1.2, 1.4], [-1.4, 4.7, -0.5, 1.5, 1.25, 1.4], [0.3, 6.1, -0.3, 1.3, 1.1, 1.3], [-0.5, 4.2, 1.4, 1.3, 1.1, 1.3], [0.6, 4.3, -1.4, 1.2, 1.0, 1.2]];
  if (detail) lobes.push([-1.0, 5.8, 0.8, 1.1, 0.95, 1.1], [1.2, 5.6, -0.8, 1.05, 0.9, 1.05]);
  const centre = new THREE.Vector3(0, 4.7, 0), squash = new THREE.Vector3(2.6, 2.1, 2.6);
  const cards = foliage(rnd, lobes, [120, 190, 270][detail], [0.85, 0.55], centre, squash, 2.6, (p, t) => {
    const r = Math.min(1.2, Math.hypot((p.x - centre.x) / squash.x, (p.y - centre.y) / squash.y, (p.z - centre.z) / squash.z));
    return (0.42 + 0.5 * Math.min(1, r) + 0.12 * (t - 0.7)) * (0.7 + 0.3 * clamp((p.y - 3.2) / 3.5, 0, 1));
  });
  // Bark: the trunk (a little crooked) and four limbs up into the crown, UVs so the bark texture covers about 2 m of height per copy.
  const wood = [];
  const limb = (x0, y0, z0, x1, y1, z1, r0, r1, seg) => {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0), g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true).translate(0, len / 2, 0);
    g.applyQuaternion(_q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize())).translate(x0, y0, z0);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, r0 * 6), uv.getY(i) * len / 2);
    const cc = []; for (let i = 0; i < g.attributes.position.count; i++) { const k = 0.75 + 0.25 * clamp(1 - g.attributes.position.getY(i) / 6, 0, 1); cc.push(k, k, k); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); wood.push(g);
  };
  const seg = [6, 8, 10][detail];
  limb(0, 0, 0, 0.12, 3.0, 0.05, 0.27, 0.19, seg);
  for (const [x, y, z] of [[1.3, 4.6, 0.5], [-1.2, 4.8, -0.4], [0.2, 5.8, -0.2], [-0.4, 4.4, 1.2], [0.5, 4.4, -1.2]]) limb(0.12, 2.9, 0.05, x, y, z, 0.13, 0.05, 5);
  return { core: mergeGeomsUV(wood), cards: mergeGeomsUV(cards) };                       // (no dark core in a tree: a real crown lets the sky through)
}

// A garden shrub: one low irregular mound (five overlapping lobes on a flat base) thick with small cards of glossy leaves, and sprigs of flowers over the top.
function leafBush(detail) {
  const rnd = mulberry32(44), core = [];
  const lobes = [[0, 0.5, 0, 0.62, 0.52, 0.62], [0.42, 0.4, 0.18, 0.46, 0.4, 0.46], [-0.4, 0.42, -0.2, 0.5, 0.42, 0.48], [0.1, 0.38, -0.45, 0.44, 0.36, 0.42], [-0.16, 0.36, 0.44, 0.42, 0.35, 0.42]];
  const centre = new THREE.Vector3(0, 0.25, 0), squash = new THREE.Vector3(0.95, 0.8, 0.95);
  const shade = (p, t) => (0.48 + 0.5 * clamp(p.y / 0.95, 0, 1) + 0.18 * (t - 0.7)) * (0.75 + 0.25 * Math.min(1, t));
  const cards = foliage(rnd, lobes, [150, 210, 280][detail], [0.3, 0.2], centre, squash, 0.04, shade);
  const bloom = foliage(rnd, lobes.map(l => [l[0], l[1] + 0.05, l[2], l[3] * 1.04, l[4] * 1.04, l[5] * 1.04]), [14, 20, 28][detail], [0.2, 0.14], centre, squash, 0.3, (p) => 0.75 + 0.25 * clamp(p.y / 0.95, 0, 1));
  for (const L of lobes) core.push(darkCore(L[0], L[1], L[2], L[3] * 0.5, L[4] * 0.46, L[5] * 0.5, [0.2, 0.25, 0.17]));
  const g = mergeGeomsUV(core); g.setAttribute('hax', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(3), 1));    // (the core wears the hedge's leaves: deep foliage, not a dark ball; see hedgeUV)
  return { core: g, cards: mergeGeomsUV(cards), bloom: mergeGeomsUV(bloom) };
}

// A tall palm: a slender, gently curving trunk ringed with old leaf scars, a fibrous boot under the crown, a crown of arching feathery fronds and, under
// it, a skirt of dead brown fronds hanging against the trunk. The frond texture holds a live frond (left half) and a dead one (right half).
function palm(detail) {
  const seg = [7, 9, 11][detail], rings = [10, 12, 16][detail], H = 11;
  const trunk = new THREE.CylinderGeometry(0.19, 0.3, H, seg, rings, true).translate(0, H / 2, 0);
  const p = trunk.attributes.position, tc = [], tuv = trunk.attributes.uv, bend = y => Math.pow(y / H, 2) * 0.9;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), boot = clamp((y - (H - 1.1)) / 0.9, 0, 1), flare = 1 + Math.max(0, 0.6 - y) * 0.35 + boot * 0.22;
    p.setXYZ(i, p.getX(i) * flare + bend(y), y, p.getZ(i) * flare);
    const k = 1 - boot * 0.25 - clamp((y - 9.6) / 1.4, 0, 1) * 0.15;                       // (darker in the shade of the crown)
    tc.push(k * (1 - boot * 0.12), k * (1 - boot * 0.22), k * (1 - boot * 0.38));
    tuv.setXY(i, tuv.getX(i), tuv.getY(i) * H / 1.5);
  }
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3)); trunk.computeVertexNormals();
  const top = new THREE.Vector3(bend(H), H, 0);
  const bulb = darkCore(top.x, top.y + 0.12, 0, 0.27, 0.36, 0.27, [0.3, 0.3, 0.17]);
  const pos = [], uv = [], col = [], idx = [], rnd = mulberry32(31);
  const frond = (phi, lift, L, S, dead, curl) => {
    const dx = Math.cos(phi), dz = Math.sin(phi), px = -dz, pz = dx, u0 = dead ? 0.5 : 0;
    const tint = dead ? [1, 1, 1] : rnd() < 0.25 ? [1.12, 1.04, 0.78] : [0.95 + rnd() * 0.1, 1, 0.92 + rnd() * 0.1];
    for (let s = 0; s <= S; s++) {
      const t = s / S, r = t * L, y = top.y + 0.1 + Math.sin(lift) * r - curl * t * t;
      const w = (dead ? 0.42 : 0.78) * Math.sin(Math.PI * (0.1 + 0.9 * t)) + 0.05, fold = dead ? 0.25 : 0.14;
      const cx = top.x + dx * (0.25 + r * Math.cos(lift) * (dead ? 0.35 : 1)), cz = dz * (0.25 + r * Math.cos(lift) * (dead ? 0.35 : 1));
      const b = pos.length / 3;
      pos.push(cx - px * w, y - fold * w, cz - pz * w, cx, y + 0.06, cz, cx + px * w, y - fold * w, cz + pz * w);
      uv.push(u0, 1 - t, u0 + 0.25, 1 - t, u0 + 0.5, 1 - t);
      const ao = dead ? 0.6 + 0.3 * t : 0.5 + 0.5 * clamp(t / 0.35, 0, 1);
      for (let k = 0; k < 3; k++) col.push(ao * tint[0], ao * tint[1], ao * tint[2]);
      if (s < S) idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
    }
  };
  const F = [11, 14, 17][detail], S = [6, 7, 9][detail];
  for (let f = 0; f < F; f++) frond(f / F * Math.PI * 2 + (f % 2) * 0.22 + rnd() * 0.15, 0.62 - (f % 3) * 0.3 - rnd() * 0.12, 4.2 + rnd() * 0.8, S, false, 1.9 + rnd() * 0.8);
  for (let f = 0; f < [5, 6, 8][detail]; f++) frond(f / [5, 6, 8][detail] * Math.PI * 2 + 0.4 + rnd() * 0.3, -1.3 - rnd() * 0.15, 1.8 + rnd() * 0.6, 3, true, 0.1);
  const fr = new THREE.BufferGeometry();
  fr.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fr.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); fr.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  fr.setIndex(idx); fr.computeVertexNormals();
  const n = fr.attributes.normal; for (let i = 0; i < n.count; i++) { v3.fromBufferAttribute(n, i); v3.y += 0.5; v3.normalize(); n.setXYZ(i, v3.x, v3.y, v3.z); }   // (lit more from above: a frond is thin and the light comes through it)
  return { trunk: mergeGeomsUV([trunk, bulb]), fronds: fr };
}

// A conifer: a trunk and stacked skirts of needles; the snowy kind is white on top.
function pineGeo(detail, snowy) {
  const layers = detail ? 6 : 4, parts = [], rnd = mulberry32(snowy ? 21 : 22);
  const trunk = new THREE.CylinderGeometry(0.18, 0.3, 3.2, 6).translate(0, 1.6, 0); paint(trunk, 0.22, 0.15, 0.1); withUV(trunk); parts.push(trunk);
  for (let k = 0; k < layers; k++) {
    const t = k / layers, r = (2.5 - 1.7 * t) * (0.9 + rnd() * 0.2), h = 2.6 - 0.5 * t, y = 2.2 + t * 6.4;
    const cone = new THREE.ConeGeometry(r, h, detail ? 12 : 8, 1, true).translate(0, y + h / 2, 0), c = [], p = cone.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const up = (p.getY(i) - y) / h, white = snowy ? Math.min(1, 0.35 + up * 0.7 + t * 0.15) : 0;
      c.push(0.05 + white * 0.85, 0.13 + white * 0.78, 0.07 + white * 0.85);
    }
    cone.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); withUV(cone); parts.push(cone);
  }
  const g = mergeGeomsUV(parts); return g;
}
// A saguaro cactus with two arms.
function cactusGeo() {
  const parts = [], col = (g, r, gg, b) => { paint(g, r, gg, b); withUV(g); return g; };
  parts.push(col(new THREE.CylinderGeometry(0.3, 0.34, 5.6, 10).translate(0, 2.8, 0), 0.1, 0.27, 0.1));
  parts.push(col(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 5.6, 0), 0.1, 0.27, 0.1));
  for (const [dir, y0, up] of [[1, 2.2, 1.8], [-1, 3.2, 1.3]]) {
    parts.push(col(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 8).rotateZ(Math.PI / 2).translate(dir * 0.6, y0, 0), 0.1, 0.27, 0.1));
    parts.push(col(new THREE.CylinderGeometry(0.19, 0.2, up, 8).translate(dir * 1.05, y0 + up / 2, 0), 0.1, 0.27, 0.1));
    parts.push(col(new THREE.SphereGeometry(0.19, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(dir * 1.05, y0 + up, 0), 0.1, 0.27, 0.1));
  }
  return mergeGeomsUV(parts);
}
// A boulder: a lumpy, flattened rock, shaded darker low down.
// A rock: the photo-scanned boulder (scans.js) when it has loaded, put in the drawn rock's terms (about 2 m across, its top 0.65 m up, sunk 0.25 m into the
// ground), white vertex colours so the instance's tint and the scan's own colour both show; otherwise a lumpy ball, shaded.
function scanRock() {
  const S = SCAN_MODELS.rock; if (!S) return null;
  const g = S.geo.clone(); g.computeBoundingBox(); const b = g.boundingBox, k = 2 / Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); g.scale(k, k, k); g.translate(0, -0.25, 0);
  for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  const m = S.mat, mat = new THREE.MeshStandardMaterial({ map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, vertexColors: true, roughness: 1, metalness: 0 });
  return { g, mat };
}
// A scanned street prop (scans.js) at its real size: standing on y = 0, centred, its long side along x; `back` turns it so its tall part (a bench's
// back) is at -z, as the drawn bench's is. Its own materials (an instanced mesh takes one per group).
// `one`: the scan holds two side by side (the hydrant: a clean one and a weathered one), and only the one on the -x side is kept.
export function scanProp(name, back = false, one = false) {
  const S = SCAN_MODELS[name]; if (!S) return null;
  let g = S.geo.clone(); g.computeBoundingBox(); let b = g.boundingBox;
  if (one) {
    const mid = (b.min.x + b.max.x) / 2, P = g.attributes.position, keep = [], groups = [];
    for (const gr of (g.groups.length ? g.groups : [{ start: 0, count: P.count, materialIndex: 0 }])) {
      const s0 = keep.length; for (let t = gr.start; t < gr.start + gr.count; t += 3) if ((P.getX(t) + P.getX(t + 1) + P.getX(t + 2)) / 3 < mid) keep.push(t);
      if (keep.length > s0) groups.push({ start: s0 * 3, count: (keep.length - s0) * 3, materialIndex: gr.materialIndex });
    }
    const out = new THREE.BufferGeometry();
    for (const k of Object.keys(g.attributes)) { const a = g.attributes[k], n = a.itemSize, arr = new Float32Array(keep.length * 3 * n); keep.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < n; c++) arr[(i * 3 + v) * n + c] = a.getComponent(t + v, c); }); out.setAttribute(k, new THREE.BufferAttribute(arr, n)); }
    if (g.groups.length) for (const gr of groups) out.addGroup(gr.start, gr.count, gr.materialIndex);
    g = out; g.computeBoundingBox(); b = g.boundingBox;
  }
  if (b.max.z - b.min.z > b.max.x - b.min.x) { g.rotateY(Math.PI / 2); g.computeBoundingBox(); b = g.boundingBox; }
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); g.computeBoundingBox(); b = g.boundingBox;
  if (back) { const p = g.attributes.position, top = b.max.y * 0.7; let z = 0, n = 0; for (let i = 0; i < p.count; i++) if (p.getY(i) > top) { z += p.getZ(i); n++; } if (n && z / n > 0) g.rotateY(Math.PI); }
  return { g, mat: S.mat };
}
function rockGeo() {
  const ico = new THREE.IcosahedronGeometry(1, 2); ico.deleteAttribute('uv'); ico.deleteAttribute('normal');
  const g = mergeVertices(ico), p = g.attributes.position, c = [];
  for (let i = 0; i < p.count; i++) {
    v3.fromBufferAttribute(p, i);
    const n = fbm(v3.x * 1.6 + 4, v3.y * 1.6 + v3.z * 1.2, 3, 33), k = 0.75 + n * 0.55;
    p.setXYZ(i, v3.x * k, Math.max(v3.y * k * 0.62, -0.25), v3.z * k);
    const sh = 0.55 + 0.45 * Math.max(0, v3.y) + (n - 0.5) * 0.3; c.push(0.5 * sh, 0.45 * sh, 0.4 * sh);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.computeVertexNormals(); withUV(g);
  return g;
}

// A clipped hedge: a box (stretched to each hedge's length) with its top and corners rounded off and its faces lumpy, darker at the foot where the leaves
// get no light. Its leaf texture is laid on in world units (see hedgeUV), so it is the same size on a 2 m hedge as on a 20 m one.
function hedge() {
  const g = new THREE.BoxGeometry(1, 1, 1, 12, 5, 12);
  const p = g.attributes.position, c = [], ax = [], n0 = g.attributes.normal;
  for (let i = 0; i < n0.count; i++) ax.push(Math.abs(n0.getY(i)) > 0.5 ? 1 : Math.abs(n0.getX(i)) > 0.5 ? 0 : 2);   // (which face each vertex is on, kept before the box is roughened)
  g.setAttribute('hax', new THREE.Float32BufferAttribute(ax, 1));
  for (let i = 0; i < p.count; i++) {
    v3.fromBufferAttribute(p, i);
    const n = fbm(v3.x * 5 + 5, v3.y * 4 + v3.z * 5, 3, 3);
    const k = 0.95 + n * 0.1, top = Math.max(0, v3.y + 0.1) / 0.6;
    const rx = v3.x * (1 - 0.12 * top * top), rz = v3.z * (1 - 0.12 * top * top);
    p.setXYZ(i, rx * k, v3.y + 0.5 + (v3.y > 0.4 ? (n - 0.5) * 0.12 : 0), rz * k);
    const foot = 0.42 + 0.58 * clamp((v3.y + 0.5) / 0.7, 0, 1), sh = foot * (0.85 + n * 0.3); c.push(sh, sh, sh);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}
// World-space UVs for an instanced box: the top takes x and z, the sides the distance along them and the height (1 m per copy of the texture).
function hedgeUV(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float hax;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      {
        #ifdef USE_INSTANCING
          mat4 hm = modelMatrix * instanceMatrix;
        #else
          mat4 hm = modelMatrix;
        #endif
        vec3 hw = (hm * vec4(position, 1.0)).xyz;
        vec3 hc = hw - hm[3].xyz;                                              // (a bush core: wrapped round its own middle, like a cylinder)
        vec2 huv = hax > 2.5 ? vec2(atan(hc.z, hc.x) * 0.55 * length(hm[0].xyz), hw.y) * 2.4 : hax > 0.5 && hax < 1.5 ? hw.xz : hax < 0.5 ? vec2(hw.z, hw.y) : vec2(hw.x, hw.y);
        #ifdef USE_MAP
          vMapUv = huv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = huv;
        #endif
      }`);
  };
  mat.customProgramCacheKey = () => 'hedgeUV';
  return mat;
}

// Wind: the crowns of trees, palm fronds and bushes sway. Each instance has its own phase (from where it stands), bending grows with
// height above the foot of the plant, and leaves and fronds flutter a little on top. `uWind` is the time, set once a frame by main.js.
export const WIND = { value: 0 };
const SUN_COL = new THREE.Color(TOD.sunColor);
function windify(mat, amp, H, flutter, trans = 0) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uWind = WIND;
    if (trans) {
      // Leaves glow where the sun shines through them (when you look towards the sun): light that came through the leaf, tinted by it.
      sh.uniforms.uSunDir = { value: SUN_DIR }; sh.uniforms.uSunCol = { value: SUN_COL }; sh.uniforms.uTrans = { value: trans };
      sh.fragmentShader = 'uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uTrans;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
        { vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz); vec3 toCam = normalize(vViewPosition);
          float back = pow(clamp(dot(-toCam, sunV), 0.0, 1.0), 2.5);
          outgoingLight += diffuseColor.rgb * uSunCol * back * uTrans; }
        #include <opaque_fragment>`);
    }
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 wph = instanceMatrix[3].xz * 0.37;
      #else
        vec2 wph = vec2(0.0);
      #endif
      float wh = clamp(position.y / ${H.toFixed(1)}, 0.0, 1.4), wk = wh * wh * ${amp.toFixed(3)};
      float gust = 0.65 + 0.35 * sin(uWind * 0.31 + wph.x * 0.2);
      transformed.x += (sin(uWind * 1.35 + wph.x) + 0.45 * sin(uWind * 2.9 + wph.y)) * wk * gust;
      transformed.z += (cos(uWind * 1.15 + wph.y) + 0.4 * sin(uWind * 2.3 + wph.x)) * wk * 0.7 * gust;
      ${flutter ? `transformed += vec3(sin(uWind * 6.3 + position.x * 7.0 + position.y * 5.0), sin(uWind * 5.1 + position.z * 6.0), cos(uWind * 5.7 + position.y * 8.0)) * wh * ${flutter.toFixed(3)} * gust;` : ''}`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp + H + flutter + trans;
  return mat;
}

export function makeProps() {
  const a2c = Q.msaa > 0;
  const tree = leafTree(Q.treeDetail), pl = palm(Q.treeDetail);
  const bush = leafBush(Q.treeDetail);
  const geo = { pine: pineGeo(Q.treeDetail, false), snowPine: pineGeo(Q.treeDetail, true), cactus: cactusGeo(), rock: rockGeo(), bushCore: bush.core, bushCards: bush.cards, bushBloom: bush.bloom, treeCore: tree.core, treeCards: tree.cards, palmTrunk: pl.trunk, palmFronds: pl.fronds, hedge: hedge() };
  geo.lamp = mergeGeoms([new THREE.CylinderGeometry(0.08, 0.14, 8.6, 10).translate(0, 4.3, 0), new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8).rotateX(Math.PI / 2).translate(0, 8.4, 1.4), new THREE.BoxGeometry(0.42, 0.16, 0.95).translate(0, 8.4, 2.9)]);
  geo.bulb = new THREE.SphereGeometry(0.3, 8, 5).scale(0.9, 0.35, 1.4).translate(0, 8.3, 2.9);
  geo.pool = new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2).translate(0, 0, 3);
  geo.pole = mergeGeoms([new THREE.CylinderGeometry(0.11, 0.16, 11, 8).translate(0, 5.5, 0), new THREE.BoxGeometry(2.4, 0.12, 0.12).translate(0, 10.2, 0), new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10).translate(0.4, 8.8, 0.3)]);
  geo.sigPole = new THREE.CylinderGeometry(0.13, 0.17, 6.6, 10).translate(0, 3.3, 0);
  geo.sigArm = new THREE.CylinderGeometry(0.08, 0.1, 1, 8).rotateX(Math.PI / 2).translate(0, 6.2, 0.5);
  geo.sigHead = new THREE.BoxGeometry(0.32, 1.0, 0.34);
  geo.sigLamp = new THREE.CircleGeometry(0.12, 12).rotateY(Math.PI / 2);
  geo.hydrant = mergeGeoms([new THREE.CylinderGeometry(0.13, 0.15, 0.6, 12).translate(0, 0.3, 0), new THREE.SphereGeometry(0.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.6, 0),
    new THREE.CylinderGeometry(0.06, 0.06, 0.38, 8).rotateZ(Math.PI / 2).translate(0, 0.42, 0), new THREE.CylinderGeometry(0.19, 0.19, 0.06, 12).translate(0, 0.03, 0)]);
  geo.bin = mergeGeoms([new THREE.CylinderGeometry(0.3, 0.27, 0.95, 14, 1, true).translate(0, 0.475, 0), new THREE.CylinderGeometry(0.32, 0.32, 0.06, 14).translate(0, 0.97, 0)]);
  geo.bench = mergeGeoms([new THREE.BoxGeometry(1.8, 0.06, 0.45).translate(0, 0.45, 0), new THREE.BoxGeometry(1.8, 0.4, 0.05).translate(0, 0.72, -0.21),
    new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(-0.8, 0.22, 0), new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(0.8, 0.22, 0)]);
  geo.billFrame = mergeGeoms([new THREE.BoxGeometry(14.3, 7.3, 0.3).translate(0, 4.5, -0.17), new THREE.BoxGeometry(0.3, 2, 0.3).translate(-4, 0.5, -0.17), new THREE.BoxGeometry(0.3, 2, 0.3).translate(4, 0.5, -0.17)]);
  geo.billFace = new THREE.PlaneGeometry(14, 7).translate(0, 4.5, 0);

  const cols = { R: new THREE.Color(7, 0.25, 0.15), A: new THREE.Color(7, 3.2, 0.2), G: new THREE.Color(0.3, 6.5, 2.2) };
  const billTex = T.billboardTex();
  const hedgeT = T.hedgeTex(), bark = T.barkTex(), palmBark = T.palmBarkTex();
  const mat = {
    treeCore: new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, vertexColors: true, roughness: 0.92 }),
    treeCards: new THREE.MeshStandardMaterial({ map: T.leafTex(), vertexColors: true, alphaTest: 0.5, alphaToCoverage: a2c, side: THREE.DoubleSide, roughness: 0.8 }),
    bushCards: new THREE.MeshStandardMaterial({ map: T.bushLeafTex(), vertexColors: true, alphaTest: 0.5, alphaToCoverage: a2c, side: THREE.DoubleSide, roughness: 0.74, envMapIntensity: 0.45 }),
    bushBloom: new THREE.MeshStandardMaterial({ map: T.flowerTex(), vertexColors: true, alphaTest: 0.5, alphaToCoverage: a2c, side: THREE.DoubleSide, roughness: 0.7 }),
    palmTrunk: new THREE.MeshStandardMaterial({ map: palmBark.map, normalMap: palmBark.normalMap, vertexColors: true, roughness: 0.92 }),
    palmFronds: new THREE.MeshStandardMaterial({ map: T.frondTex(), vertexColors: true, alphaTest: 0.45, alphaToCoverage: a2c, side: THREE.DoubleSide, roughness: 0.72, color: 0xf2f6e6 }),
    pine: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    cactus: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    hedge: hedgeUV(new THREE.MeshStandardMaterial({ map: hedgeT.map, normalMap: hedgeT.normalMap, vertexColors: true, roughness: 0.8, envMapIntensity: 0.6 })),
    bushCore: hedgeUV(new THREE.MeshStandardMaterial({ map: hedgeT.map, normalMap: hedgeT.normalMap, vertexColors: true, roughness: 0.85, envMapIntensity: 0.4 })),
    lamp: new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.5, metalness: 0.6 }),
    bulb: TOD.lampsOn ? new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5.6, 2.8) }) : new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.3 }),
    pool: new THREE.MeshBasicMaterial({ map: T.glowTex(), color: new THREE.Color(0.32, 0.2, 0.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x5b4a3c, roughness: 0.9 }),
    wire: new THREE.MeshBasicMaterial({ color: 0x1c1c1e, side: THREE.DoubleSide }),          // (the power wires are thin ribbons, not 1-pixel lines: a line that runs nearly level breaks into dashes on a pixel grid, a ribbon of a few centimetres fades smoothly with multisampling)
    sigDark: new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.5, metalness: 0.5 }),
    sigHead: new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.6 }),
    sigLamp: { R: new THREE.MeshBasicMaterial({ color: cols.R }), A: new THREE.MeshBasicMaterial({ color: cols.A }), G: new THREE.MeshBasicMaterial({ color: cols.G }) },
    hydrant: new THREE.MeshStandardMaterial({ color: 0xc8b21c, roughness: 0.45, metalness: 0.3 }),
    bin: new THREE.MeshStandardMaterial({ color: 0x2f4a3a, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide }),
    bench: new THREE.MeshStandardMaterial({ color: 0x6b4b33, roughness: 0.7 }),
    billFrame: new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.4 }),
    billFace: new THREE.MeshStandardMaterial({ map: billTex, emissiveMap: billTex, emissive: 0xffffff, emissiveIntensity: TOD.lampsOn ? 0.9 : 0.35, roughness: 0.6 }),
  };
  { const R = scanRock(); if (R) { geo.rock = R.g; mat.rock = R.mat; } }
  // The quiver tree of the desert (a scan; scatter.js plants it among the cacti), its leaves cut out rather than blended (so they sort and shadow).
  { const R = scanProp('quiver'); if (R) { geo.quiver = R.g; mat.quiver = [].concat(R.mat).map(m => { if (m.transparent || m.alphaMode === 'BLEND' || m.opacity < 1 || m.blending !== THREE.NormalBlending || m.name.includes('leaf')) { m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true; } m.side = THREE.DoubleSide; return m; }); if (mat.quiver.length === 1) mat.quiver = mat.quiver[0]; } }
  for (const [k, back, one] of [['hydrant', false, true], ['bench', true, false]]) { const R = scanProp(k, back, one); if (R) { geo[k] = R.g; mat[k] = R.mat; } }
  windify(mat.treeCore, 0.2, 8, 0); windify(mat.treeCards, 0.2, 8, 0.05, 1.1); windify(mat.bushCards, 0.2, 8, 0.02, 0.7); windify(mat.bushBloom, 0.2, 8, 0.03, 0.6); windify(mat.palmTrunk, 0.42, 12, 0); windify(mat.palmFronds, 0.42, 12, 0.07, 1.3); windify(mat.pine, 0.13, 10, 0.02);
  return { geo, mat };
}
