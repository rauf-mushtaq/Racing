// The surface of the roads that are not on the grid (see avenues.js). The city's ground is one asphalt plane with the blocks' pavements laid on it, so a
// road through a block is made by cutting the pavement away: the pavement, kerb, lawn and lot materials are given a mask (a distance texture of the
// whole city, baked here) and throw away the pixels that are on a road. The asphalt of the plane shows through, and the road's own kerb, markings and
// lamps are added by city.js.
import * as THREE from 'three';
import { AVENUES } from './avenues.js';

const R = 2300, SIZE = 1700, RANGE = 24;                      // the mask covers x and z from -R to R in SIZE x SIZE texels (2.7 m a texel); it says the distance 24 m either side
export const ROAD_TEX = { value: null };
const BOX = { value: new THREE.Vector4(-R, -R, 1 / (2 * R), 1 / (2 * R)) };

// One byte a texel: 0.5 is the edge of the road, less is on the road. Only the neighbourhood of each stretch of road is worked out.
function bake() {
  const data = new Uint8Array(SIZE * SIZE).fill(255), cell = 2 * R / SIZE, enc = d => Math.round(Math.max(0, Math.min(1, 0.5 + d / (2 * RANGE))) * 255);
  for (const A of AVENUES) {
    const reach = A.hw + RANGE + cell;
    for (let k = 0; k < A.n - 1; k++) {
      const ax = A.x[k], az = A.z[k], ex = A.x[k + 1] - ax, ez = A.z[k + 1] - az, l2 = ex * ex + ez * ez || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, ax + ex) - reach + R) / cell)), i1 = Math.min(SIZE - 1, Math.ceil((Math.max(ax, ax + ex) + reach + R) / cell));
      const j0 = Math.max(0, Math.floor((Math.min(az, az + ez) - reach + R) / cell)), j1 = Math.min(SIZE - 1, Math.ceil((Math.max(az, az + ez) + reach + R) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -R + (i + 0.5) * cell, z = -R + (j + 0.5) * cell; let t = ((x - ax) * ex + (z - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const v = enc(Math.hypot(ax + ex * t - x, az + ez * t - z) - A.hw), o = j * SIZE + i; if (v < data[o]) data[o] = v;
      }
    }
  }
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

export function roadCut(mat) {
  const prev = mat.onBeforeCompile, key = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey') ? mat.customProgramCacheKey() : (prev ? prev.toString() : '');
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.uniforms.tRoad = ROAD_TEX; sh.uniforms.uRdBox = BOX;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRdW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vRdW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;
        #else
          vRdW = (modelMatrix * vec4(transformed, 1.0)).xz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRdW; uniform sampler2D tRoad; uniform vec4 uRdBox;')
      .replace('void main() {', `void main() {
        if (texture2D(tRoad, (vRdW - uRdBox.xy) * uRdBox.zw).r < 0.5) discard;`);
  };
  mat.customProgramCacheKey = () => key + '|roadcut';
  return mat;
}

// Make the mask and the pavement materials that use it (city.matRoad: used by the regions the roads pass through).
export function initRoadCut(city) {
  ROAD_TEX.value = bake();
  const b = city.mat;
  city.matRoad = { walk: roadCut(city.makeWalk()), curb: roadCut(b.curb.clone()), park: roadCut(b.park.clone()), lot: roadCut(b.lot.clone()), mark: roadCut(b.mark.clone()) };
  return Object.values(city.matRoad);
}
