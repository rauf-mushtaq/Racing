// The river as it is drawn. The city's ground is one flat plane with pavement slabs on it, so instead of cutting holes in all of that,
// every ground material is given a mask (a small distance-field texture of the water) and throws away the pixels that are in the
// river. Under the hole go the water, stone quay walls with a coping and a railing, lamps, and the bridges (see bridges.js). The
// same course (rivercourse.js) drives the physics, so what you see is what stops the car.
import * as THREE from 'three';
import { GB, quadToward } from './geom.js';
import { RIVER, LAKES, lakeOutline, riverSdf, lakesSdf, streamSdf, bankPoint, WATER_Y, QUAY_Y, BRIDGES, RIVER_BOX } from './rivercourse.js';
import { attachSSR } from './ssr.js';
import * as T from './textures.js';
import { TOD } from './tod.js';
import { buildBridges } from './bridges.js';
import { EDGE } from './grid.js';

const RANGE = 40;                                   // metres the distance texture can say either side of the edge
const TEX_W = 1792, TEX_H = Math.max(64, Math.round(TEX_W * (RIVER_BOX.z1 - RIVER_BOX.z0) / (RIVER_BOX.x1 - RIVER_BOX.x0)));
export const RIVER_TEX = { value: null };
const BOX = { value: new THREE.Vector4(RIVER_BOX.x0, RIVER_BOX.z0, 1 / (RIVER_BOX.x1 - RIVER_BOX.x0), 1 / (RIVER_BOX.z1 - RIVER_BOX.z0)) };

// One byte per texel: 0.5 is the water's edge, below it is water. Bilinear filtering of a distance field gives a smooth edge.
function bakeTexture() {
  const data = new Uint8Array(TEX_W * TEX_H), dx = (RIVER_BOX.x1 - RIVER_BOX.x0) / TEX_W, dz = (RIVER_BOX.z1 - RIVER_BOX.z0) / TEX_H;
  for (let j = 0; j < TEX_H; j++) for (let i = 0; i < TEX_W; i++) {
    const d = riverSdf(RIVER_BOX.x0 + (i + 0.5) * dx, RIVER_BOX.z0 + (j + 0.5) * dz);
    data[j * TEX_W + i] = Math.round(Math.max(0, Math.min(1, 0.5 + d / (2 * RANGE))) * 255);
  }
  const t = new THREE.DataTexture(data, TEX_W, TEX_H, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

// Make a ground material throw away the pixels that are over the water.
export function riverCut(mat) {
  const prev = mat.onBeforeCompile, key = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey() : (prev ? prev.toString() : '');
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.uniforms.tRiver = RIVER_TEX; sh.uniforms.uRvBox = BOX;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRvW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vRvW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;
        #else
          vRvW = (modelMatrix * vec4(transformed, 1.0)).xz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRvW; uniform sampler2D tRiver; uniform vec4 uRvBox;')
      .replace('void main() {', `void main() {
        if (texture2D(tRiver, (vRvW - uRvBox.xy) * uRvBox.zw).r < 0.5) discard;`);
  };
  mat.customProgramCacheKey = () => key + '|rivercut';
  return mat;
}

const C = (r, g, b) => new THREE.Color(r, g, b);
const STONE = C(0.62, 0.6, 0.57), STONE_D = C(0.44, 0.43, 0.42), COPING = C(0.78, 0.76, 0.72), DARK = C(0.2, 0.21, 0.23), LAMP = C(4.2, 3.9, 3.2);

export function initRiver(scene, city) {
  RIVER_TEX.value = bakeTexture();
  // Ground materials that throw away the pixels over the water: the regions beside the river use these (city.js), as does the part of the big ground plane over the
  // river; everything else keeps the plain ones, which can reject hidden pixels early (much cheaper on a tablet).
  const b = city.mat;
  city.matCut = { walk: riverCut(city.makeWalk()), curb: riverCut(b.curb.clone()), park: riverCut(b.park.clone()), lot: riverCut(b.lot.clone()), mark: riverCut(b.mark.clone()) };
  {
    const m = 120, x0 = RIVER_BOX.x0 - m, x1 = RIVER_BOX.x1 + m, z0 = RIVER_BOX.z0 - m, z1 = RIVER_BOX.z1 + m, ring = new GB(), mid = new GB();
    ring.flat(-EDGE, -EDGE, x0, EDGE, -0.05, 10); ring.flat(x1, -EDGE, EDGE, EDGE, -0.05, 10); ring.flat(x0, -EDGE, x1, z0, -0.05, 10); ring.flat(x0, z1, x1, EDGE, -0.05, 10); mid.flat(x0, z0, x1, z1, -0.05, 10);
    city.ground.geometry.dispose(); city.ground.geometry = ring.geometry();
    const cutMat = riverCut(city.makeAsphalt()); cutMat.polygonOffset = true; cutMat.polygonOffsetFactor = 1; cutMat.polygonOffsetUnits = 1; const cutGround = new THREE.Mesh(mid.geometry(), cutMat); cutGround.receiveShadow = city.ground.receiveShadow; cutGround.layers.enable(2); cutGround.frustumCulled = false; city.group.add(cutGround);
  }
  const root = new THREE.Group(); scene.add(root);
  const std = o => new THREE.MeshStandardMaterial(o);
  const ripple = T.rippleNormal(); ripple.repeat.set(1, 1);
  const M = {
    water: attachSSR(std({ color: TOD.lampsOn ? 0x2d3a4e : 0x2a6b78, roughness: 0.06, metalness: 0.15, envMapIntensity: 1.6, normalMap: ripple, normalScale: new THREE.Vector2(0.55, 0.55), side: THREE.DoubleSide }), { range: 120, rough: 0.4, view: 300 }),
    quay: std({ vertexColors: true, color: 0xffffff, map: city.tx.con.map, normalMap: city.tx.con.normalMap, roughness: 0.95, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  const water = new GB(false), quay = new GB(true), props = new GB(true), glow = new GB(true), rail = new GB(false);

  // --- Water: a strip down the river, and a fan for each lake (a metre and a half under the walls, so no crack shows) -----
  for (let i = 0; i < RIVER.n - 4; i += 4) {
    const j = Math.min(RIVER.n - 1, i + 4), a = bankPoint(i, 1, 1.5), b = bankPoint(j, 1, 1.5), c = bankPoint(j, -1, 1.5), d = bankPoint(i, -1, 1.5), w0 = RIVER.w[i] + 1.5, w1 = RIVER.w[j] + 1.5;
    quadToward(water, [a[0], WATER_Y, a[1]], [b[0], WATER_Y, b[1]], [c[0], WATER_Y, c[1]], [d[0], WATER_Y, d[1]], [[RIVER.s[i] / 14, w0 / 14], [RIVER.s[j] / 14, w1 / 14], [RIVER.s[j] / 14, -w1 / 14], [RIVER.s[i] / 14, -w0 / 14]], WHITE, [0, 1, 0]);
  }
  for (const L of LAKES) {
    const o = lakeOutline(L, 72).map(([x, z]) => [x + (x - L.cx) * 0.03, z + (z - L.cz) * 0.03]);
    const c = water.vtx(L.cx, WATER_Y, L.cz, 0, 1, 0, L.cx / 14, L.cz / 14, WHITE), first = water.count;
    for (const [x, z] of o) water.vtx(x, WATER_Y, z, 0, 1, 0, x / 14, z / 14, WHITE);
    for (let k = 0; k < o.length; k++) water.i.push(c, first + (k + 1) % o.length, first + k);
  }

  // --- Quay walls, coping and railings along both banks and round the lakes --------------------------------------------
  const lamps = [], wall = (p, q, toward, wallBottom = WATER_Y - 0.8) => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]), u0 = (p[0] + p[1]) / 3, u1 = u0 + len / 3;
    quadToward(quay, [p[0], QUAY_Y, p[1]], [q[0], QUAY_Y, q[1]], [q[0], wallBottom, q[1]], [p[0], wallBottom, p[1]], [[u0, 0], [u1, 0], [u1, (QUAY_Y - wallBottom) / 2.4], [u0, (QUAY_Y - wallBottom) / 2.4]], STONE, [toward[0], 0, toward[1]]);
  };
  const onBridge = (x, z, m) => BRIDGES.some(b => { const u = b.axis === 'z' ? z : x, v = (b.axis === 'z' ? x : z) - b.c; return u > b.u0 - m && u < b.u1 + m && Math.abs(v) < b.W + m; });
  let lampAt = 0;
  // A stretch of bank from p to q (water on the side `inward` points to): the wall, its coping, a railing, sometimes a lamp.
  const bank = (p, q, inward, walls = true, gapEvery = 0) => {
    const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, out = [-inward[0], -inward[1]];
    if (walls) wall(p, q, inward);
    const o = 0.95, p2 = [p[0] + out[0] * o, p[1] + out[1] * o], q2 = [q[0] + out[0] * o, q[1] + out[1] * o], p1 = [p[0] - out[0] * 0.12, p[1] - out[1] * 0.12], q1 = [q[0] - out[0] * 0.12, q[1] - out[1] * 0.12], y = QUAY_Y + 0.03;
    quadToward(quay, [p1[0], y, p1[1]], [q1[0], y, q1[1]], [q2[0], y, q2[1]], [p2[0], y, p2[1]], [[0, 0], [1, 0], [1, 1], [0, 1]], COPING, [0, 1, 0]);
    quadToward(quay, [p1[0], QUAY_Y - 0.2, p1[1]], [q1[0], QUAY_Y - 0.2, q1[1]], [q1[0], y, q1[1]], [p1[0], y, p1[1]], [[0, 0], [1, 0], [1, 0.2], [0, 0.2]], COPING, [inward[0], 0, inward[1]]);
    if (onBridge(mx, mz, 3)) return;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]), rx = p[0] + out[0] * 0.5, rz = p[1] + out[1] * 0.5;
    rail.quad([rx, y, rz], [q[0] - p[0], 0, q[1] - p[1]], [0, 1.0, 0], 0, 0, len, 1);
    lampAt += len;
    if (lampAt > 34 && !onBridge(mx, mz, 14)) {
      lampAt = 0; const lx = mx + out[0] * 1.6, lz = mz + out[1] * 1.6, h = 5.2;
      props.box(lx - 0.1, lz - 0.1, lx + 0.1, lz + 0.1, QUAY_Y, QUAY_Y + h, 3, DARK);
      props.box(lx - out[0] * 0.2 - 0.55 * Math.abs(inward[1]), lz - out[1] * 0.2 - 0.55 * Math.abs(inward[0]), lx - out[0] * 0.2 + 0.55 * Math.abs(inward[1]), lz - out[1] * 0.2 + 0.55 * Math.abs(inward[0]), QUAY_Y + h, QUAY_Y + h + 0.14, 3, DARK);
      glow.box(lx - 0.22, lz - 0.22, lx + 0.22, lz + 0.22, QUAY_Y + h - 0.2, QUAY_Y + h, 3, LAMP);
      lamps.push([lx, lz]);
    }
  };
  for (const side of [1, -1]) {
    for (let i = 0; i + 2 < RIVER.n; i += 2) {
      const p = bankPoint(i, side), q = bankPoint(i + 2, side), inward = [RIVER.tz[i] * side, -RIVER.tx[i] * side];
      const mx = (p[0] + q[0]) / 2 + (-inward[0]) * 0.9, mz = (p[1] + q[1]) / 2 + (-inward[1]) * 0.9;
      if (lakesSdf(mx, mz) < 0) continue;                                                      // inside a lake: the lake's own wall is the bank
      bank(p, q, inward);
    }
  }
  for (const L of LAKES) {
    const o = lakeOutline(L, 72);
    for (let k = 0; k < o.length; k++) {
      const p = o[k], q = o[(k + 1) % o.length], mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2, ix = L.cx - mx, iz = L.cz - mz, l = Math.hypot(ix, iz), inward = [ix / l, iz / l];
      if (streamSdf(mx - inward[0] * 0.9, mz - inward[1] * 0.9) < 0) continue;                 // the river's mouth
      bank(p, q, inward);
    }
  }
  const add = (gb, mat, cast, recv = true) => { if (!gb.count) return null; const m = new THREE.Mesh(gb.geometry(), mat); m.castShadow = cast; m.receiveShadow = recv; m.frustumCulled = false; root.add(m); return m; };
  add(water, M.water, false); add(quay, M.quay, false); add(props, city.mat.props, true); add(glow, M.glow, false, false); add(rail, city.mat.rail, false, false);

  const bridges = buildBridges(city, root);
  return {
    group: root, lamps, bridges,
    update(dt, x, z) {
      ripple.offset.x -= dt * 0.035;
      for (const b of bridges) b.group.visible = Math.hypot(b.cx - x, b.cz - z) < 950;
    },
    materials: [M.water, M.quay, M.glow],
  };
}
const WHITE = new THREE.Color(1, 1, 1);
