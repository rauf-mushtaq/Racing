// The land outside the city. A coarse mesh covers the whole world; detailed 500 m
// tiles stream in around the player (and out behind) on top of it, with the coarse
// mesh cut away underneath. Both use a biome shader that blends grass, sand, snow,
// rock and dry lakebed by where you are, how high and how steep it is.
import * as THREE from 'three';
import { clamp } from './util.js';
import { EDGE } from './city.js';
import { heightAt, climate, coastX, lakeDist, AIRFIELD, WORLD, SEA_Y } from './world.js';
import * as T from './textures.js';
import { Q } from './quality.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const TILE = 500;
const TX0 = Math.floor(WORLD.x0 / TILE), TX1 = Math.floor((WORLD.x1 - 1) / TILE), TZ0 = Math.floor(WORLD.z0 / TILE), TZ1 = Math.floor((WORLD.z1 - 1) / TILE);
const tileKey = (tx, tz) => tx + ',' + tz;
// A tile wholly inside the city square needs no ground (the city has its own).
const inCity = (tx, tz) => tx * TILE >= -EDGE && (tx + 1) * TILE <= EDGE && tz * TILE >= -EDGE && (tz + 1) * TILE <= EDGE;

// Weights of grass, sand, snow and dry lakebed at a point, written to out[o..o+3].
function biome(x, z, h, out, o) {
  const c = climate(x, z), sh = x - coastX(z);
  const wSnow = Math.max(c.snow, smooth(380, 560, h));
  const beach = smooth(460, 160, sh) * smooth(9, 3, h);
  const lake = smooth(AIRFIELD.r + 120, AIRFIELD.r - 40, lakeDist(x, z)) * (1 - wSnow);
  const wSand = clamp(c.desert + beach, 0, 1) * (1 - wSnow) * (1 - lake);
  const wGrass = Math.max(0, 1 - wSnow - wSand - lake), t = wGrass + wSand + wSnow + lake || 1;
  out[o] = wGrass / t; out[o + 1] = wSand / t; out[o + 2] = wSnow / t; out[o + 3] = lake / t;
}

export function buildTerrain(scene, day) {
  const group = new THREE.Group(); scene.add(group);
  const tex = { grass: T.ground(), sand: T.sandTex(), snow: T.snowTex(), rock: T.rockTex(), lake: T.lakeTex() };
  const U = {
    tGrass: { value: tex.grass }, tSand: { value: tex.sand }, tSnow: { value: tex.snow }, tRock: { value: tex.rock }, tLake: { value: tex.lake },
    uHole: { value: new THREE.Vector4(1, 1, -1, -1) }, uCity: { value: EDGE + 0.3 },
  };
  const makeMat = coarse => {
    const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    if (coarse) m.defines = { COARSE: '' };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aBiome; varying vec4 vBiome; varying vec3 vWP; varying float vNY; varying vec3 vN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBiome = aBiome; vWP = position; vNY = normal.y; vN = normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D tGrass, tSand, tSnow, tRock, tLake; uniform vec4 uHole; uniform float uCity; varying vec4 vBiome; varying vec3 vWP; varying float vNY; varying vec3 vN;
          float gFn, gBumpH, gBumpF;
          float hsh(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
          float vnoise(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f); return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          if (abs(vWP.x) < uCity && abs(vWP.z) < uCity) discard;
          #ifdef COARSE
          if (vWP.x > uHole.x && vWP.x < uHole.z && vWP.z > uHole.y && vWP.z < uHole.w) discard;
          #endif
          vec2 p = vWP.xz;
          #define DET(t) (texture2D(t, p * 0.16).rgb * (0.75 + 0.5 * texture2D(t, p * 0.0125).g))
          vec3 grassC = 0.5 * (texture2D(tGrass, p * 0.16).rgb + texture2D(tGrass, mat2(0.8, -0.6, 0.6, 0.8) * p * 0.0713).rgb) * (0.75 + 0.5 * texture2D(tGrass, p * 0.0125).g);
          vec3 base = grassC * vec3(0.92, 1.26, 0.7) * vBiome.x + DET(tSand) * vBiome.y + DET(tSnow) * vBiome.z + DET(tLake) * vBiome.w;
          base *= 0.74 + 0.5 * (0.6 * vnoise(p * 0.0042) + 0.4 * vnoise(p * 0.019 + 7.0));
          float rockW = smoothstep(0.82, 0.58, vNY);
          // Cliffs are textured from the side (not stretched top-down) and, in the desert, banded like sandstone.
          vec3 nn = normalize(vN); float ax = abs(nn.x), az = abs(nn.z);
          vec3 side = (texture2D(tRock, vec2(vWP.z, vWP.y) * 0.05).rgb * ax + texture2D(tRock, vec2(vWP.x, vWP.y) * 0.05).rgb * az) / (ax + az + 1e-3) * (0.8 + 0.4 * vnoise(vec2(vWP.x + vWP.z, vWP.y) * 0.03));
          vec3 rock = mix(side, DET(tRock), smoothstep(0.5, 0.78, vNY));
          float st = 0.5 + 0.5 * sin(vWP.y * 0.62 + 3.2 * texture2D(tGrass, vWP.xz * 0.0045).g + 1.4 * texture2D(tSand, vec2(vWP.x + vWP.z, vWP.y) * 0.01).g);
          rock *= mix(vec3(1.0), mix(vec3(1.35, 0.86, 0.58), vec3(0.92, 0.6, 0.42), st), clamp(vBiome.y * 1.3, 0.0, 1.0));
          base = mix(base, rock, clamp(rockW, 0.0, 1.0));
          // Fine detail near the camera (grit, pebbles, ripples), fading out with distance so it never shimmers.
          float vd = length(vViewPosition), nearF = 1.0 - smoothstep(35.0, 120.0, vd);
          gFn = vnoise(p * 2.7) * 0.55 + vnoise(p * 7.1 + 3.0) * 0.33 + vnoise(p * 16.0 + 9.0) * 0.12;
          base *= 1.0 + (gFn - 0.5) * 0.75 * nearF;
          gBumpH = (dot(base, vec3(0.3, 0.55, 0.15)) * 0.9 + gFn * 0.7) * 0.035; gBumpF = nearF;
          diffuseColor.rgb = base;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          // Snow and the lakebed catch the low sun; sand and grass stay matt.
          roughnessFactor = clamp(1.0 - vBiome.z * (0.6 - 0.32 * gFn) - vBiome.w * 0.28 - vBiome.y * 0.05, 0.3, 1.0);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          if (gBumpF > 0.001) {
            vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition), R1 = cross(sY, normal), R2 = cross(normal, sX);
            float fDet = dot(sX, R1) * faceDirection, pxl = max(length(sX), length(sY));
            // The tilt is bounded and the degenerate cases skipped, so a zero-length vector can never become NaN.
            vec2 dh = clamp(vec2(dFdx(gBumpH), dFdy(gBumpH)) * gBumpF * 1.3, vec2(-0.7 * pxl), vec2(0.7 * pxl));
            vec3 nb = abs(fDet) * normal - sign(fDet) * (dh.x * R1 + dh.y * R2);
            float nl = length(nb);
            if (abs(fDet) > 1e-12 && nl > 1e-12) normal = nb / nl;
          }`);
    };
    m.customProgramCacheKey = () => 'terrain' + (coarse ? 'c' : 'f');
    return m;
  };
  const matFine = makeMat(false), matCoarse = makeMat(true);

  // --- Heights, normals and biome weights for a grid of (n + 1)^2 points ----------
  const meshFor = (x0, z0, size, cells, skirt) => {
    const step = size / cells, w = cells + 3, hs = new Float32Array(w * w);
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) hs[j * w + i] = heightAt(x0 + (i - 1) * step, z0 + (j - 1) * step);
    return { step, w, hs };
  };
  const buildGeometry = (x0, z0, size, cells, { hs, step, w }, skirtDepth) => {
    const nv = (cells + 1) * (cells + 1), pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), bio = new Float32Array(nv * 4);
    const hAt = (i, j) => hs[(j + 1) * w + (i + 1)];
    for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) {
      const k = j * (cells + 1) + i, h = hAt(i, j), x = x0 + i * step, z = z0 + j * step;
      const gx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * step), gz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * step), l = Math.hypot(gx, 1, gz);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; nor[k * 3] = -gx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -gz / l;
      biome(x, z, h, bio, k * 4);
    }
    const idx = [];
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
      const a = j * (cells + 1) + i, b = a + 1, c = a + cells + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    let P = pos, Nn = nor, B = bio, I = idx;
    if (skirtDepth) {                                                      // a skirt round the edge hides seams between detail levels
      const ring = [];
      for (let i = 0; i <= cells; i++) ring.push([0, i]);
      for (let j = 1; j <= cells; j++) ring.push([j, cells]);
      for (let i = cells - 1; i >= 0; i--) ring.push([cells, i]);
      for (let j = cells - 1; j >= 1; j--) ring.push([j, 0]);
      const base = nv, np = new Float32Array((nv + ring.length) * 3), nn = new Float32Array((nv + ring.length) * 3), nb = new Float32Array((nv + ring.length) * 4);
      np.set(pos); nn.set(nor); nb.set(bio);
      ring.forEach(([j, i], r) => { const k = j * (cells + 1) + i, o = (base + r) * 3; np[o] = pos[k * 3]; np[o + 1] = pos[k * 3 + 1] - skirtDepth; np[o + 2] = pos[k * 3 + 2]; nn[o] = nor[k * 3]; nn[o + 1] = nor[k * 3 + 1]; nn[o + 2] = nor[k * 3 + 2]; nb.set(bio.subarray(k * 4, k * 4 + 4), (base + r) * 4); });
      const cx = x0 + size / 2, cz = z0 + size / 2;
      for (let r = 0; r < ring.length; r++) {
        const r2 = (r + 1) % ring.length, [j1, i1] = ring[r], [j2, i2] = ring[r2], t1 = j1 * (cells + 1) + i1, t2 = j2 * (cells + 1) + i2, b1 = base + r, b2 = base + r2;
        // Wind each skirt quad so it faces away from the tile's centre.
        const mx = (pos[t1 * 3] + pos[t2 * 3]) / 2 - cx, mz = (pos[t1 * 3 + 2] + pos[t2 * 3 + 2]) / 2 - cz;
        const ex = pos[t2 * 3] - pos[t1 * 3], ez = pos[t2 * 3 + 2] - pos[t1 * 3 + 2], face = (ez * mx - ex * mz) > 0;   // (t2 - t1) x (down) . outward
        if (face) idx.push(t1, t2, b2, t1, b2, b1); else idx.push(t1, b2, t2, t1, b1, b2);
      }
      P = np; Nn = nn; B = nb;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); g.setAttribute('aBiome', new THREE.BufferAttribute(B, 4));
    g.setIndex(I); g.computeBoundingSphere();
    return g;
  };

  // --- The coarse mesh over the whole world ----------------------------------------
  {
    const cells = 100, cw = WORLD.x1 - WORLD.x0, ch = WORLD.z1 - WORLD.z0, nx = Math.ceil(cw / cells), nz = Math.ceil(ch / cells);
    const nv = (nx + 1) * (nz + 1), pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), bio = new Float32Array(nv * 4), hs = new Float32Array((nx + 3) * (nz + 3));
    for (let j = -1; j <= nz + 1; j++) for (let i = -1; i <= nx + 1; i++) hs[(j + 1) * (nx + 3) + i + 1] = heightAt(WORLD.x0 + i * cells, WORLD.z0 + j * cells);
    const H = (i, j) => hs[(j + 1) * (nx + 3) + i + 1];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i, x = WORLD.x0 + i * cells, z = WORLD.z0 + j * cells, h = H(i, j);
      const gx = (H(i + 1, j) - H(i - 1, j)) / (2 * cells), gz = (H(i, j + 1) - H(i, j - 1)) / (2 * cells), l = Math.hypot(gx, 1, gz);
      pos.set([x, h, z], k * 3); nor.set([-gx / l, 1 / l, -gz / l], k * 3); biome(x, z, h, bio, k * 4);
    }
    const idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = WORLD.x0 + i * cells, z = WORLD.z0 + j * cells;
      if (Math.abs(x) < EDGE - 120 && Math.abs(x + cells) < EDGE - 120 && Math.abs(z) < EDGE - 120 && Math.abs(z + cells) < EDGE - 120) continue;
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('aBiome', new THREE.BufferAttribute(bio, 4));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, matCoarse); m.receiveShadow = Q.shadows; m.frustumCulled = false; m.position.y = -0.5; group.add(m);
  }

  // --- The sea, with ripples that drift -------------------------------------------------
  const ripple = T.rippleNormal(); ripple.repeat.set(420, 420);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(11000, 18000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
    color: day ? 0x1b5f7c : 0x3a3550, roughness: 0.07, metalness: 0.2, envMapIntensity: 1.6, normalMap: ripple, normalScale: new THREE.Vector2(0.7, 0.7),
  }));
  sea.position.set(-3000 - 5500, SEA_Y, 0); group.add(sea);

  // --- Detail tiles streaming in and out --------------------------------------------------
  const tiles = new Map(), hooks = [];
  let job = null, deadline = 0;
  const cellsPerTile = Math.max(8, Math.round(TILE / Q.tCell));

  function* genTile(tx, tz) {
    const x0 = tx * TILE, z0 = tz * TILE, cells = cellsPerTile, step = TILE / cells, w = cells + 3, hs = new Float32Array(w * w);
    for (let j = 0; j < w; j++) {
      for (let i = 0; i < w; i++) hs[j * w + i] = heightAt(x0 + (i - 1) * step, z0 + (j - 1) * step);
      if (performance.now() > deadline) yield;
    }
    return buildGeometry(x0, z0, TILE, cells, { hs, step, w }, 9);
  }
  function finishTile(tx, tz, geo) {
    const tile = { tx, tz, x0: tx * TILE, z0: tz * TILE, group: new THREE.Group(), colliders: [], disposers: [] };
    const m = new THREE.Mesh(geo, matFine); m.receiveShadow = Q.shadows; m.frustumCulled = true; tile.group.add(m);
    group.add(tile.group); tiles.set(tileKey(tx, tz), tile);
    for (const h of hooks) h(tile);
    updateHole.dirty = true;
  }
  function unloadTile(k, tile) {
    group.remove(tile.group);
    tile.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o.geometry) o.geometry.dispose(); });
    for (const f of tile.disposers) f();
    tiles.delete(k); updateHole.dirty = true;
  }
  // The coarse mesh is cut away under the biggest square of tiles that's fully loaded.
  function updateHole(ptx, ptz) {
    let r = -1;
    for (let rr = 0; rr <= Q.tR; rr++) {
      let ok = true;
      for (let tz = ptz - rr; tz <= ptz + rr && ok; tz++) for (let tx = ptx - rr; tx <= ptx + rr; tx++) {
        if (tx < TX0 || tx > TX1 || tz < TZ0 || tz > TZ1 || inCity(tx, tz)) continue;
        if (!tiles.has(tileKey(tx, tz))) { ok = false; break; }
      }
      if (!ok) break; r = rr;
    }
    U.uHole.value.set((ptx - r) * TILE, (ptz - r) * TILE, (ptx + r + 1) * TILE, (ptz + r + 1) * TILE);
    if (r < 0) U.uHole.value.set(1, 1, -1, -1);
  }

  return {
    group, tiles, hooks, TILE,
    onTile(fn) { hooks.push(fn); },
    // Build everything within `radius` tiles of the point before the first frame.
    async loadAround(x, z, radius, progress = () => {}) {
      const ptx = Math.floor(x / TILE), ptz = Math.floor(z / TILE), list = [];
      for (let tz = ptz - radius; tz <= ptz + radius; tz++) for (let tx = ptx - radius; tx <= ptx + radius; tx++)
        if (tx >= TX0 && tx <= TX1 && tz >= TZ0 && tz <= TZ1 && !inCity(tx, tz)) list.push([tx, tz, Math.hypot(tx - ptx, tz - ptz)]);
      list.sort((a, b) => a[2] - b[2]); deadline = Infinity;
      for (let k = 0; k < list.length; k++) {
        const [tx, tz] = list[k];
        if (!tiles.has(tileKey(tx, tz))) { const gen = genTile(tx, tz); let r; do { r = gen.next(); } while (!r.done); finishTile(tx, tz, r.value); }
        progress(`Shaping the land… ${Math.round((k + 1) / list.length * 100)}%`);
        await new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)));
      }
      updateHole(ptx, ptz);
    },
    loadNow(x, z, radius) {
      const ptx = Math.floor(x / TILE), ptz = Math.floor(z / TILE); deadline = Infinity;
      for (let tz = ptz - radius; tz <= ptz + radius; tz++) for (let tx = ptx - radius; tx <= ptx + radius; tx++) {
        if (tx < TX0 || tx > TX1 || tz < TZ0 || tz > TZ1 || inCity(tx, tz) || tiles.has(tileKey(tx, tz))) continue;
        const gen = genTile(tx, tz); let r; do { r = gen.next(); } while (!r.done); finishTile(tx, tz, r.value);
      }
      updateHole(ptx, ptz);
    },
    update(dt, x, z, budget = 3) {
      ripple.offset.x += dt * 0.004; ripple.offset.y += dt * 0.003;
      const ptx = Math.floor(x / TILE), ptz = Math.floor(z / TILE), R = Q.tR;
      for (const [k, t] of tiles) if (Math.max(Math.abs(t.tx - ptx), Math.abs(t.tz - ptz)) > R + 1) unloadTile(k, t);
      if (job && Math.max(Math.abs(job.tx - ptx), Math.abs(job.tz - ptz)) > R + 1) job = null;
      deadline = performance.now() + budget;
      while (performance.now() < deadline) {
        if (!job) {
          let best = null, bd = 1e9;
          for (let tz = ptz - R; tz <= ptz + R; tz++) for (let tx = ptx - R; tx <= ptx + R; tx++) {
            if (tx < TX0 || tx > TX1 || tz < TZ0 || tz > TZ1 || inCity(tx, tz) || tiles.has(tileKey(tx, tz))) continue;
            const d = Math.hypot(tx - ptx, tz - ptz); if (d < bd) { bd = d; best = [tx, tz]; }
          }
          if (!best) break;
          job = { tx: best[0], tz: best[1], gen: genTile(best[0], best[1]) };
        }
        const r = job.gen.next();
        if (r.done) { finishTile(job.tx, job.tz, r.value); job = null; }
      }
      for (const t of tiles.values()) if (t.veg) t.veg.visible = Math.hypot(t.x0 + TILE / 2 - x, t.z0 + TILE / 2 - z) < Q.scatR + TILE * 0.75;
      if (updateHole.dirty || ptx !== updateHole.lx || ptz !== updateHole.lz) { updateHole(ptx, ptz); updateHole.dirty = false; updateHole.lx = ptx; updateHole.lz = ptz; }
    },
    materials: [matFine, matCoarse, sea.material],
  };
}
