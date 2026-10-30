// Plants and rocks for each terrain tile as it streams in: pines (some snow-laden)
// in the mountains, saguaro cacti, boulders and dry scrub in the desert, palms along
// the coast, trees and scrub on the grassland. Instanced, with solid trunks.
import * as THREE from 'three';
import { fbm, clamp, mulberry32, hash3 } from './util.js';
import { heightAt, climate, coastX, roadDist, roadAt, SEA_Y, KEEP_CLEAR } from './world.js';
import { EDGE, addCollider, removeColliders } from './city.js';
import { Q } from './quality.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function initScatter(terrain, props) {
  const P = props, TILE = terrain.TILE, sp = 18 / Math.sqrt(Q.scat);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();

  terrain.onTile(tile => {
    const rnd = mulberry32(Math.imul(tile.tx + 500, 73856093) ^ Math.imul(tile.tz + 500, 19349663));
    const L = { pine: [], snowPine: [], cactus: [], rock: [], shrub: [], tree: [], palm: [] }, n = Math.ceil(TILE / sp);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = tile.x0 + (i + rnd()) * sp, z = tile.z0 + (j + rnd()) * sp, r1 = rnd(), r2 = rnd();
      if (Math.abs(x) < EDGE + 16 && Math.abs(z) < EDGE + 16) continue;
      const h = heightAt(x, z);
      if (h < SEA_Y + 0.8) continue;
      if (roadDist(x, z) < 220) { const r = roadAt(x, z); if (r && r.d < r.road.hw + 14) continue; }
      if (KEEP_CLEAR.some(k => (k.x - x) ** 2 + (k.z - z) ** 2 < k.r * k.r)) continue;
      const cl = climate(x, z), sh = x - coastX(z);
      const clump = 0.25 + 1.5 * fbm(x * 0.012 + 3, z * 0.012 + 9, 3, 101);
      const slope = Math.hypot((heightAt(x + 5, z) - h) / 5, (heightAt(x, z + 5) - h) / 5);
      if (slope > 0.9) continue;
      const sc = 0.75 + r2 * 0.7;
      if (slope > 0.45 && r1 < 0.2) { L.rock.push([x, h, z, 1.2 + r2 * 3.2, r2]); continue; }
      if (cl.snow > 0.4) {
        const line = 1 - smooth(300, 520, h);
        if (r1 < 0.62 * line * clump) (rnd() < 0.3 + 0.7 * smooth(180, 430, h) ? L.snowPine : L.pine).push([x, h, z, sc * 1.1, r2]);
        else if (r1 > 0.97) L.rock.push([x, h, z, 1 + r2 * 2.6, r2]);
      } else if (cl.desert > 0.45) {
        if (r1 < 0.026 * clump) L.cactus.push([x, h, z, sc, r2]);
        else if (r1 < 0.07 * clump) L.rock.push([x, h, z, 0.8 + r2 * 2.4, r2]);
        else if (r1 < 0.2 * clump) L.shrub.push([x, h, z, 0.8 + r2 * 0.9, r2]);
      } else if (sh < 1100 && h < 14) {
        if (r1 < 0.22 * smooth(1100, 300, sh)) L.palm.push([x, h, z, sc, r2]);
        else if (r1 < 0.34) L.shrub.push([x, h, z, 0.8 + r2 * 0.8, r2]);
      } else {
        if (r1 < 0.045 * clump) L.tree.push([x, h, z, sc * 1.1, r2]);
        else if (r1 < 0.2 * clump) L.shrub.push([x, h, z, 0.8 + r2 * 0.9, r2]);
        else if (r1 > 0.995) L.rock.push([x, h, z, 1 + r2 * 2, r2]);
      }
    }
    // Instances (a few wide-ranging draw calls per tile) ...
    const veg = new THREE.Group(); tile.veg = veg;
    const place = (it, rnd2) => { q.setFromAxisAngle(up, it[4] * 6.28); s.set(it[3], it[3] * (0.9 + it[4] * 0.3), it[3]); v.set(it[0], it[1] - 0.15, it[2]); m4.compose(v, q, s); };
    const inst = (geo, mat, list, tint, cast) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, k) => { place(it); im.setMatrixAt(k, m4); if (tint) { tint(c, it); im.setColorAt(k, c); } });
      im.castShadow = cast && Q.shadows; im.receiveShadow = false; im.computeBoundingSphere(); veg.add(im);
    };
    const leaf = (cc, it) => cc.setRGB(0.8 + it[4] * 0.35, 0.88 + it[4] * 0.2, 0.75 + it[4] * 0.2);
    inst(P.geo.pine, P.mat.pine, L.pine, null, true); inst(P.geo.snowPine, P.mat.pine, L.snowPine, null, true);
    inst(P.geo.cactus, P.mat.cactus, L.cactus, null, true);
    inst(P.geo.rock, P.mat.rock, L.rock, (cc, it) => (cc.setRGB(1.1 - it[4] * 0.2, 0.95 - it[4] * 0.1, 0.8 - it[4] * 0.2)), true);
    inst(P.geo.bushCore, P.mat.treeCore, L.shrub, null, false);
    inst(P.geo.bushCards, P.mat.treeCards, L.shrub, (cc, it) => cl2(cc, it, tile), false);
    inst(P.geo.treeCore, P.mat.treeCore, L.tree, null, true); inst(P.geo.treeCards, P.mat.treeCards, L.tree, leaf, true);
    inst(P.geo.palmTrunk, P.mat.palmTrunk, L.palm, null, true); inst(P.geo.palmFronds, P.mat.palmFronds, L.palm, leaf, true);
    tile.group.add(veg);
    // ... and solid trunks and rocks.
    const col = (list, r) => { for (const it of list) addCollider({ type: 'circ', x: it[0], z: it[2], r: r(it) }, tile.colliders); };
    col(L.pine, it => 0.45 * it[3]); col(L.snowPine, it => 0.45 * it[3]); col(L.cactus, it => 0.5 * it[3]); col(L.rock, it => 0.8 * it[3]); col(L.tree, it => 0.5 * it[3]); col(L.palm, it => 0.4 * it[3]);
    tile.disposers.push(() => removeColliders(tile.colliders));
  });
  // Scrub is dry in the desert and green elsewhere.
  function cl2(cc, it, tile) {
    const dry = climate(it[0], it[2]).desert;
    cc.setRGB(0.8 + it[4] * 0.3 + dry * 0.9, 0.85 + it[4] * 0.2 + dry * 0.35, 0.7 + it[4] * 0.2 - dry * 0.25);
  }
}
