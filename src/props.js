// Street furniture and planting, built once and instanced across the city:
// leafy trees, palms, lamp posts, power poles, traffic signals, hedges, hydrants,
// bins and benches. Foliage uses alpha-to-coverage when multisampling is on, so
// leaf edges are anti-aliased instead of crawling.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { mulberry32, fbm } from './util.js';
import { mergeGeoms, mergeGeomsUV } from './geom.js';
import { TOD } from './tod.js';
import { Q } from './quality.js';

const v3 = new THREE.Vector3();
const withUV = g => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2).fill(0.02), 2)); return g; };
const paint = (g, r, gg, b) => { const c = []; for (let i = 0; i < g.attributes.position.count; i++) c.push(r, gg, b); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g; };

// A broadleaf tree: a dark core with leaf cards (alpha-tested quads with a leaf
// texture) spread over it, so the outline is leafy, not blobby.
function leafTree(detail) {
  const rnd = mulberry32(12);
  const core = [], cards = [];
  const blobs = detail === 0 ? [[0, 4.8, 0, 2.3], [1.3, 4.3, 0.6, 1.7], [-1.2, 4.5, -0.5, 1.8]]
    : [[0, 4.8, 0, 2.3], [1.4, 4.3, 0.6, 1.7], [-1.3, 4.5, -0.5, 1.8], [0.2, 6.0, -0.2, 1.4], [-0.4, 3.9, 1.3, 1.3]];
  const perBlob = [18, 26, 36][detail];
  for (const [x, y, z, r] of blobs) {
    const ico = new THREE.IcosahedronGeometry(r * 0.5, 1); ico.deleteAttribute('uv'); ico.deleteAttribute('normal');
    const g = mergeVertices(ico);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { v3.fromBufferAttribute(p, i); p.setXYZ(i, v3.x + x, v3.y * 0.85 + y, v3.z + z); }
    g.computeVertexNormals(); paint(g, 0.03, 0.05, 0.02); withUV(g); core.push(g);
    for (let k = 0; k < perBlob; k++) {
      // Clusters at different depths in the crown, some poking well out of it,
      // each turned a random way, so the outline is ragged and leafy.
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const n = new THREE.Vector3(s * Math.cos(a), u * 0.8 + 0.15, s * Math.sin(a)).normalize();
      const size = 1.3 + rnd() * 1.5, rr = r * (0.55 + rnd() * 0.75);
      const card = new THREE.PlaneGeometry(size, size).rotateZ(rnd() * 6.28);
      const face = n.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.7)).normalize();
      card.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), face)).translate(x + n.x * rr, y + n.y * rr * 0.9, z + n.z * rr);
      // Normals point away from the crown centre, for soft, rounded lighting.
      const np = card.attributes.position, nn = card.attributes.normal, cc = [];
      for (let i = 0; i < np.count; i++) {
        const d = new THREE.Vector3(np.getX(i) - x, np.getY(i) - y + 0.5, np.getZ(i) - z).normalize();
        nn.setXYZ(i, d.x, d.y, d.z);
        const sh = 0.7 + rr / r * 0.35 + rnd() * 0.2; cc.push(sh, sh, sh);          // darker deep inside, lighter on the outside
      }
      card.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      cards.push(card);
    }
  }
  const trunk = new THREE.CylinderGeometry(0.16, 0.28, 4.2, detail ? 8 : 6, 1, true).translate(0, 2.1, 0);
  paint(trunk, 0.3, 0.24, 0.18); withUV(trunk);
  return { core: mergeGeomsUV([trunk, ...core]), cards: mergeGeomsUV(cards) };
}

// A low tropical bush: a few small dark blobs thick with leaf cards.
function leafBush(detail) {
  const rnd = mulberry32(44), core = [], cards = [];
  for (const [x, y, z, r] of [[0, 0.55, 0, 0.7], [0.6, 0.45, 0.3, 0.5], [-0.5, 0.5, -0.3, 0.55]]) {
    const ico = new THREE.IcosahedronGeometry(r * 0.6, 1); ico.deleteAttribute('uv'); ico.deleteAttribute('normal');
    const g = mergeVertices(ico), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { v3.fromBufferAttribute(p, i); p.setXYZ(i, v3.x + x, v3.y * 0.8 + y, v3.z + z); }
    g.computeVertexNormals(); paint(g, 0.03, 0.05, 0.02); withUV(g); core.push(g);
    for (let k = 0; k < [8, 12, 16][detail]; k++) {
      const u = rnd() * 1.4 - 0.2, a = rnd() * Math.PI * 2, s = Math.sqrt(Math.max(0, 1 - u * u));
      const n = new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a)).normalize(), rr = r * (0.6 + rnd() * 0.6), size = 0.5 + rnd() * 0.7;
      const card = new THREE.PlaneGeometry(size, size).rotateZ(rnd() * 6.28);
      const face = n.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.8)).normalize();
      card.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), face)).translate(x + n.x * rr, y + n.y * rr * 0.8, z + n.z * rr);
      const np = card.attributes.position, nn = card.attributes.normal, cc = [];
      for (let i = 0; i < np.count; i++) { const d = new THREE.Vector3(np.getX(i) - x, np.getY(i) - y + 0.2, np.getZ(i) - z).normalize(); nn.setXYZ(i, d.x, d.y, d.z); const sh = 0.75 + rnd() * 0.35; cc.push(sh, sh, sh); }
      card.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); cards.push(card);
    }
  }
  return { core: mergeGeomsUV(core), cards: mergeGeomsUV(cards) };
}

function palm(detail) {
  const seg = [6, 8, 10][detail], rings = [8, 10, 12][detail];
  const trunk = new THREE.CylinderGeometry(0.17, 0.3, 11, seg, rings, true).translate(0, 5.5, 0);
  const p = trunk.attributes.position, tc = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), bend = Math.pow(y / 11, 2) * 0.9;
    p.setX(i, p.getX(i) + bend);
    const ring = 0.85 + 0.15 * Math.sin(y * 9);
    tc.push(0.42 * ring, 0.34 * ring, 0.26 * ring);
  }
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3)); trunk.computeVertexNormals(); withUV(trunk);
  const pos = [], uv = [], idx = [];
  const F = [9, 11, 14][detail], S = [5, 6, 8][detail], L = 4.6;
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
  return { trunk, fronds: fr };
}

function hedge() {
  const g = new THREE.BoxGeometry(1, 1, 1, 6, 4, 6);
  const p = g.attributes.position, c = [];
  for (let i = 0; i < p.count; i++) {
    v3.fromBufferAttribute(p, i);
    const n = fbm(v3.x * 3 + 5, v3.y * 3 + v3.z * 3, 2, 3);
    // Round the top and the corners off, then roughen it.
    const k = 0.93 + n * 0.14, top = Math.max(0, v3.y);
    const rx = v3.x * (1 - 0.18 * top * top), rz = v3.z * (1 - 0.18 * top * top);
    p.setXYZ(i, rx * k, v3.y + 0.5 + (v3.y > 0 ? (n - 0.5) * 0.18 : 0), rz * k);
    const sh = 0.7 + n * 0.5; c.push(0.75 * sh, 0.95 * sh, 0.62 * sh);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i) * 1.2);   // tile the leaf texture
  g.computeVertexNormals();
  return g;
}

export function makeProps() {
  const a2c = Q.msaa > 0;
  const tree = leafTree(Q.treeDetail), pl = palm(Q.treeDetail);
  const bush = leafBush(Q.treeDetail);
  const geo = { bushCore: bush.core, bushCards: bush.cards, treeCore: tree.core, treeCards: tree.cards, palmTrunk: pl.trunk, palmFronds: pl.fronds, hedge: hedge() };
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
  const hedgeTex = T.leafTex(); hedgeTex.wrapS = hedgeTex.wrapT = THREE.RepeatWrapping;
  const mat = {
    treeCore: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    treeCards: new THREE.MeshStandardMaterial({ map: T.leafTex(), vertexColors: true, alphaTest: 0.5, alphaToCoverage: a2c, side: THREE.DoubleSide, roughness: 0.85 }),
    palmTrunk: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    palmFronds: new THREE.MeshStandardMaterial({ map: T.frondTex(), alphaTest: 0.45, alphaToCoverage: a2c, side: THREE.DoubleSide, roughness: 0.8, color: 0xd8e8b0 }),
    hedge: new THREE.MeshStandardMaterial({ map: hedgeTex, vertexColors: true, roughness: 0.95 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.5, metalness: 0.6 }),
    bulb: TOD.lampsOn ? new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5.6, 2.8) }) : new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.3 }),
    pool: new THREE.MeshBasicMaterial({ map: T.glowTex(), color: new THREE.Color(0.32, 0.2, 0.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x5b4a3c, roughness: 0.9 }),
    wire: new THREE.LineBasicMaterial({ color: 0x1c1c1e }),
    sigDark: new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.5, metalness: 0.5 }),
    sigHead: new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.6 }),
    sigLamp: { R: new THREE.MeshBasicMaterial({ color: cols.R }), A: new THREE.MeshBasicMaterial({ color: cols.A }), G: new THREE.MeshBasicMaterial({ color: cols.G }) },
    hydrant: new THREE.MeshStandardMaterial({ color: 0xc8b21c, roughness: 0.45, metalness: 0.3 }),
    bin: new THREE.MeshStandardMaterial({ color: 0x2f4a3a, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide }),
    bench: new THREE.MeshStandardMaterial({ color: 0x6b4b33, roughness: 0.7 }),
    billFrame: new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.4 }),
    billFace: new THREE.MeshStandardMaterial({ map: billTex, emissiveMap: billTex, emissive: 0xffffff, emissiveIntensity: TOD.lampsOn ? 0.9 : 0.35, roughness: 0.6 }),
  };
  return { geo, mat };
}
