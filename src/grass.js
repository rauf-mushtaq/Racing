// A field of grass tufts around the car: crossed alpha-tested blade cards laid out
// on a world-aligned jittered grid, so they stay put as the car moves. The field
// is rebuilt a few hundred cells a frame whenever the car has moved on, and each
// tuft grows from the ground and sways in the wind. Dense on grassland, sparse and
// dry in the desert, and none on roads, beaches, snow, rock or inside the city.
import * as THREE from 'three';
import { clamp, fbm, hash3 } from './util.js';
import { heightAt, climate, coastX, roadDist, roadAt, SEA_Y, KEEP_CLEAR } from './world.js';
import { EDGE } from './city.js';
import { Q } from './quality.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function bladeTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const x0 = 6 + rnd() * 116, lean = (rnd() - 0.5) * 46, h = 62 + rnd() * 62, w = 2.2 + rnd() * 3.6, tone = 0.55 + rnd() * 0.45;
    const gr = g.createLinearGradient(0, 128, 0, 128 - h);
    gr.addColorStop(0, `rgb(${120 * tone | 0},${150 * tone | 0},${90 * tone | 0})`); gr.addColorStop(1, `rgb(${255 * tone | 0},${255 * tone | 0},${225 * tone | 0})`);
    g.fillStyle = gr; g.beginPath(); g.moveTo(x0 - w, 128); g.quadraticCurveTo(x0 + lean * 0.3, 128 - h * 0.55, x0 + lean, 128 - h); g.quadraticCurveTo(x0 + lean * 0.3 + w * 0.5, 128 - h * 0.5, x0 + w, 128); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function initGrass(scene) {
  if (!Q.grass) return null;
  const { r: R, cell: CELL } = Q.grass, CH = 16, KEEP = R + CH * 1.3, MAXN = Math.ceil(Math.PI * (KEEP + CH) ** 2 / (CELL * CELL)) + 64;   // room for every chunk kept
  // Three crossed cards, normals up so a tuft lights like the ground it grows from.
  const geo = new THREE.BufferGeometry(), pos = [], nor = [], uv = [], idx = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, cx = Math.cos(a) * 0.55, cz = Math.sin(a) * 0.55, b = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, 0.58, cz, -cx, 0.58, -cz); for (let q = 0; q < 4; q++) nor.push(0, 1, 0);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const uTime = { value: 0 }, fadeA = R * 0.42, fadeB = R * 0.72;
  const mat = new THREE.MeshStandardMaterial({ map: bladeTexture(), alphaTest: 0.45, alphaToCoverage: Q.msaa > 0, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, envMapIntensity: 0.5 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 gp = instanceMatrix[3].xyz;
        float gf = 1.0 - smoothstep(${fadeA.toFixed(1)}, ${fadeB.toFixed(1)}, length(gp - cameraPosition));
        transformed *= gf;
        float sway = sin(uTime * 1.7 + gp.x * 0.35 + gp.z * 0.27) * 0.6 + sin(uTime * 3.1 + gp.x * 0.9 + gp.z * 0.5) * 0.2;
        transformed.x += sway * uv.y * uv.y * 0.2; transformed.z += sway * 0.4 * uv.y * uv.y * 0.2;`);
    // Double-sided cards flip their normal on the back face, which would light them from below.
    // Every fragment is lit with straight up instead, like the ground it grows from.
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n        normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, MAXN);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = false; mesh.castShadow = false;   // tufts in the terrain's own shadow-map acne turn black, so they don't take shadows
  mesh.setColorAt(0, new THREE.Color()); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  // The field is a cache of 16 m chunks: ones coming into range are built (nearest first, a
  // little each frame), ones left behind are dropped, and the survivors are packed into the mesh.
  const chunks = new Map(), col = new THREE.Color(), cellsPerChunk = (Math.ceil(CH / CELL) + 1) ** 2;
  let dirty = false, lastAssemble = 0;
  function plant(i, j, out) {
    const r1 = hash3(i, j, 11), r2 = hash3(i, j, 23), r3 = hash3(i, j, 37), r4 = hash3(i, j, 53);
    const x = (i + r1) * CELL, z = (j + r2) * CELL;
    if (Math.abs(x) < EDGE + 14 && Math.abs(z) < EDGE + 14) return;
    const sh = x - coastX(z);
    if (sh < 120) return;
    const cl = climate(x, z), grassW = (1 - cl.snow) * (1 - cl.desert), dryW = cl.desert * (1 - cl.snow) * 0.2;
    const clump = 0.55 + 1.3 * fbm(x * 0.035 + 5, z * 0.035 + 2, 2, 77);
    const dens = (grassW * 1.5 + dryW) * clump * (sh < 420 ? smooth(120, 420, sh) : 1);
    if (r3 > dens) return;
    const h = heightAt(x, z);
    if (h < SEA_Y + 1.2 || (sh < 380 && h < 5)) return;
    if (roadDist(x, z) < 90) { const rd = roadAt(x, z); if (rd && rd.d < rd.road.hw + 7) return; }
    for (const k of KEEP_CLEAR) if ((k.x - x) ** 2 + (k.z - z) ** 2 < k.r * k.r) return;
    if (Math.hypot(heightAt(x + 2, z) - h, heightAt(x, z + 2) - h) > 1.1) return;
    // Matrix: yaw rotation, a little size variety, sitting just in the ground.
    const { m, c } = out, sc = (0.7 + r4 * 0.7) * (grassW > 0.5 ? 1 : 0.7), sy = sc * (0.8 + hash3(i, j, 71) * 0.7), a = r1 * 6.2832, cs = Math.cos(a) * sc, sn = Math.sin(a) * sc, o = out.n * 16;
    m[o] = cs; m[o + 1] = 0; m[o + 2] = -sn; m[o + 3] = 0; m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = sn; m[o + 9] = 0; m[o + 10] = cs; m[o + 11] = 0; m[o + 12] = x; m[o + 13] = h - 0.05; m[o + 14] = z; m[o + 15] = 1;
    // Fresh green on grassland, straw in the desert, with some variety tuft to tuft.
    const dry = clamp(cl.desert * 1.6 + (1 - grassW) * 0.5, 0, 1), v = 0.75 + r2 * 0.5;
    col.setRGB((0.40 + dry * 0.55) * v, (0.66 + dry * 0.12) * v, (0.20 + dry * 0.02) * v);
    c[out.n * 3] = col.r; c[out.n * 3 + 1] = col.g; c[out.n * 3 + 2] = col.b; out.n++;
  }
  function buildChunk(ci, cj) {
    const out = { m: new Float32Array(cellsPerChunk * 16), c: new Float32Array(cellsPerChunk * 3), n: 0 };
    for (let j = Math.ceil(cj * CH / CELL); j < Math.ceil((cj + 1) * CH / CELL); j++) for (let i = Math.ceil(ci * CH / CELL); i < Math.ceil((ci + 1) * CH / CELL); i++) plant(i, j, out);
    chunks.set(ci + ',' + cj, { ci, cj, n: out.n, m: out.m.slice(0, out.n * 16), c: out.c.slice(0, out.n * 3) });
    dirty = true;
  }
  const wanted = (px, pz) => {
    const list = [], c0 = Math.floor((px - R) / CH), c1 = Math.floor((px + R) / CH), d0 = Math.floor((pz - R) / CH), d1 = Math.floor((pz + R) / CH);
    for (let cj = d0; cj <= d1; cj++) for (let ci = c0; ci <= c1; ci++) {
      const dx = (ci + 0.5) * CH - px, dz = (cj + 0.5) * CH - pz, d2 = dx * dx + dz * dz;
      if (d2 < (R + CH * 0.71) ** 2 && !chunks.has(ci + ',' + cj)) list.push([d2, ci, cj]);
    }
    return list.sort((a, b) => a[0] - b[0]);
  };
  function drop(px, pz) {
    for (const [k, ch] of chunks) { const dx = (ch.ci + 0.5) * CH - px, dz = (ch.cj + 0.5) * CH - pz; if (dx * dx + dz * dz > KEEP * KEEP) { chunks.delete(k); dirty = true; } }
  }
  function assemble() {
    let n = 0; const M = mesh.instanceMatrix.array, C = mesh.instanceColor.array;
    for (const ch of chunks.values()) { if (n + ch.n > MAXN) break; M.set(ch.m, n * 16); C.set(ch.c, n * 3); n += ch.n; }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; dirty = false;
  }
  return {
    material: mat, mesh,
    // Called every frame with the camera position and the time; builds for up to ~1.6 ms.
    update(time, px, pz) {
      uTime.value = time;
      drop(px, pz);
      const todo = wanted(px, pz), t0 = performance.now();
      for (const [, ci, cj] of todo) { buildChunk(ci, cj); if (performance.now() - t0 > 1.6) break; }
      if (dirty && (!todo.length || time - lastAssemble > 0.12)) { assemble(); lastAssemble = time; }
    },
    // Fill everything in range at once (after a teleport or at the start of an event).
    now(px, pz) { drop(px, pz); for (const [, ci, cj] of wanted(px, pz)) buildChunk(ci, cj); assemble(); },
  };
}
