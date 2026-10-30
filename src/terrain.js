// The land around the city: hills to the north and east dotted with houses and
// trees, the ocean to the west with a beach, and low rolling ground to the
// south. All of it starts beyond the edge you can drive to, so the city stays
// flat to drive on.
import * as THREE from 'three';
import { fbm, mulberry32, clamp } from './util.js';
import { LIMIT } from './city.js';
import * as T from './textures.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const SEA_Y = -1.2;

// Ground height at (x, z).
export function terrainHeight(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const r = Math.hypot(x, z) || 1;
  const rise = smooth(LIMIT + 60, LIMIT + 900, d);
  const north = clamp(-z / r * 0.8 + x / r * 0.5 + 0.35, 0, 1.2);
  const n = fbm(x * 0.0011 + 7, z * 0.0011 + 3, 5, 21);
  const ridges = Math.pow(clamp(n * 1.4 - 0.25, 0, 1), 1.3);
  let h = rise * (25 + 520 * ridges * north + 60 * n);
  // Sea to the west: the land falls away into the water.
  const west = smooth(0.25, 0.6, -x / r) * smooth(LIMIT + 80, LIMIT + 380, d);
  h = h * (1 - west) + (SEA_Y - 6) * west;
  return h;
}

export function buildTerrain(scene, day) {
  const group = new THREE.Group(); scene.add(group);
  // Polar grid from inside the city edge out to the mountains.
  const R0 = 700, R1 = 4200, NR = 70, NA = 220;
  const pos = [], col = [], uv = [], idx = [];
  const cDry = new THREE.Color(day ? '#a89a68' : '#6b5a52'), cGreen = new THREE.Color(day ? '#4a5f30' : '#3f4a38');
  const cRock = new THREE.Color(day ? '#9a8a72' : '#5e5058'), cSand = new THREE.Color(day ? '#d9c9a2' : '#a08a80'), c = new THREE.Color();
  for (let i = 0; i <= NR; i++) {
    const t = i / NR, r = R0 + (R1 - R0) * Math.pow(t, 1.6);
    for (let j = 0; j <= NA; j++) {
      const a = j / NA * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r;
      const h = terrainHeight(x, z);
      pos.push(x, h, z); uv.push(x / 30, z / 30);
      const g = fbm(x * 0.004, z * 0.004, 3, 8);
      c.copy(cDry).lerp(cGreen, clamp(g * 2.2 - 0.55, 0, 0.9));
      if (h > 320) c.lerp(cRock, clamp((h - 320) / 300, 0, 0.5));
      if (h < 1.5 && h > SEA_Y - 4) c.lerp(cSand, 0.85);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * (NA + 1) + j, b = a + NA + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const tex = T.ground();
  const land = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1 }));
  land.position.y = -0.04; land.receiveShadow = true;
  group.add(land);

  // The ocean.
  const sea = new THREE.Mesh(new THREE.CircleGeometry(9000, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: day ? 0x1f5f7a : 0x3a3550, roughness: 0.12, metalness: 0.4, envMapIntensity: 1.2 }));
  sea.position.y = SEA_Y; group.add(sea);

  // Houses and trees on the hills.
  const rnd = mulberry32(31);
  const houses = [], trees = [];
  for (let k = 0; k < 9000 && (houses.length < 700 || trees.length < 1600); k++) {
    const a = rnd() * Math.PI * 2, r = LIMIT + 200 + Math.pow(rnd(), 1.5) * 2200;
    const x = Math.sin(a) * r, z = Math.cos(a) * r, h = terrainHeight(x, z);
    if (h < 0.5) continue;
    const slope = Math.abs(terrainHeight(x + 8, z) - h) + Math.abs(terrainHeight(x, z + 8) - h);
    if (slope < 6 && houses.length < 700 && rnd() < 0.5) houses.push([x, h, z, rnd()]);
    else if (trees.length < 1600) trees.push([x, h, z, rnd()]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), houses.length);
  const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 0.45, 4).rotateY(Math.PI / 4).translate(0, 0.22, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), houses.length);
  const wallCols = ['#f1ece2', '#e8dcc8', '#f4f1ea', '#dccbb4', '#efe3d3'].map(x => new THREE.Color(x));
  const roofCols = ['#b4583a', '#a3492f', '#8a4a35', '#6b6560'].map(x => new THREE.Color(x));
  houses.forEach(([x, h, z, r], i) => {
    const w = 10 + r * 14, d = 9 + ((r * 7) % 1) * 10, ht = 4 + ((r * 13) % 1) * 5;
    q.setFromAxisAngle(up, r * 6.28); v.set(x, h - 1, z); s.set(w, ht + 1, d); m4.compose(v, q, s); walls.setMatrixAt(i, m4);
    walls.setColorAt(i, wallCols[(r * 50 | 0) % wallCols.length]);
    v.set(x, h + ht, z); s.set(w * 1.05, 4, d * 1.05); m4.compose(v, q, s); roofs.setMatrixAt(i, m4);
    roofs.setColorAt(i, roofCols[(r * 70 | 0) % roofCols.length]);
  });
  const tg = new THREE.IcosahedronGeometry(1, 1).translate(0, 1.4, 0);
  const tc = []; for (let i = 0; i < tg.attributes.position.count; i++) { const y = tg.attributes.position.getY(i); const k = 0.75 + (y - 0.4) * 0.2; tc.push(0.13 * k, 0.2 * k, 0.09 * k); }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
  const treesM = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), trees.length);
  trees.forEach(([x, h, z, r], i) => { const sc = 5 + r * 7; q.setFromAxisAngle(up, r * 9); v.set(x, h - 2, z); s.set(sc, sc * (1 + r * 0.6), sc); m4.compose(v, q, s); treesM.setMatrixAt(i, m4); });
  for (const m of [walls, roofs, treesM]) { m.computeBoundingSphere(); group.add(m); }
  return group;
}
