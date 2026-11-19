// Every texture in the game is drawn here on canvases at start-up, so the game
// needs nothing but Three.js from the network. Facades are drawn at about
// 64 pixels per metre (half that on the Medium and Low tiers), with a
// roughness/metalness map (glass is shiny and metallic, walls are matt) and a
// relief map so windows sit back in the wall.
import * as THREE from 'three';
import { mulberry32, tfbm, clamp } from './util.js';

let aniso = 4, TS = 1;
export function setAnisotropy(a) { aniso = a; }
export function setTexScale(s) { TS = s; }
const sz = n => Math.max(64, Math.round(n * TS));

function mk(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// Smooth tileable noise on a coarse grid, sampled with bilinear wrap, so big
// textures don't need the (slow) noise evaluated at every pixel.
function lowField(res, freq, oct, seed) {
  const F = new Float32Array(res * res);
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) F[y * res + x] = tfbm(x / res * freq, y / res * freq, freq, oct, seed);
  return F;
}
function bil(F, res, u, v) {
  const x = u * res, y = v * res, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const xa = ((x0 % res) + res) % res, xb = (xa + 1) % res, ya = ((y0 % res) + res) % res, yb = (ya + 1) % res;
  const a = F[ya * res + xa], b = F[ya * res + xb], c = F[yb * res + xa], d = F[yb * res + xb];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// Normal map from a height field (tileable).
function normalFromHeight(H, w, h, strength) {
  const [c, g] = mk(w, h); const img = g.createImageData(w, h); const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = (x - 1 + w) % w, xr = (x + 1) % w, yu = (y - 1 + h) % h, yd = (y + 1) % h;
    const dx = (H[y * w + xr] - H[y * w + xl]) * strength, dy = (H[yd * w + x] - H[yu * w + x]) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return tex(c, false);
}

// ---------------------------------------------------------------------------
// Ground surfaces
// ---------------------------------------------------------------------------
// Road asphalt: fine grain, stones, patches, the odd crack and repair.
export function asphalt() {
  const S = sz(1024), rnd = mulberry32(11);
  const big = lowField(128, 4, 4, 3), mid = lowField(256, 24, 2, 9), fine = lowField(256, 96, 2, 5);
  const [c, g] = mk(S), [cr, gr] = mk(S);
  const img = g.createImageData(S, S), rim = gr.createImageData(S, S);
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, u = x / S, v = y / S;
    const b = bil(big, 128, u, v), m = bil(mid, 256, u, v), f = bil(fine, 256, u, v);
    const grain = rnd(), stone = rnd() < 0.02 ? rnd() : 0;
    const val = 0.21 + b * 0.06 + m * 0.035 + (f - 0.5) * 0.05 + (grain - 0.5) * 0.07 + stone * 0.18;
    H[i] = grain * 0.4 + stone + m * 0.5 + f * 0.3;
    const o = i * 4;
    img.data[o] = clamp(val, 0, 1) * 255; img.data[o + 1] = clamp(val, 0, 1) * 255; img.data[o + 2] = clamp(val * 1.04, 0, 1) * 255; img.data[o + 3] = 255;
    const r = clamp(0.9 - (b - 0.5) * 0.5 + (grain - 0.5) * 0.1 - stone * 0.15, 0.4, 1) * 255;
    rim.data[o] = rim.data[o + 1] = rim.data[o + 2] = r; rim.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0); gr.putImageData(rim, 0, 0);
  g.save(); g.scale(S / 1024, S / 1024);
  // Repairs: slightly darker rectangles; and thin cracks.
  for (let k = 0; k < 7; k++) { g.fillStyle = 'rgba(8,8,10,0.07)'; g.fillRect(rnd() * 900, rnd() * 900, 40 + rnd() * 120, 40 + rnd() * 90); }
  for (let k = 0; k < 9; k++) {
    let x = rnd() * 1024, y = rnd() * 1024, a = rnd() * 6.28;
    g.strokeStyle = 'rgba(8,8,10,0.42)'; g.lineWidth = 0.8 + rnd() * 1.2;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 28; s++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); }
    g.stroke();
  }
  g.restore();
  return { map: tex(c), roughnessMap: tex(cr, false), normalMap: normalFromHeight(H, S, S, 2.2) };
}

// Pavement concrete with expansion joints, tinted by the material colour.
export function concrete() {
  const S = sz(1024), slabs = 4, rnd = mulberry32(5);
  const big = lowField(64, 6, 4, 21), fine = lowField(256, 64, 2, 22);
  const [c, g] = mk(S); const img = g.createImageData(S, S);
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, u = x / S, v = y / S;
    const b = bil(big, 64, u, v), f = bil(fine, 256, u, v), grain = rnd();
    const val = 0.62 + (b - 0.5) * 0.16 + (f - 0.5) * 0.06 + (grain - 0.5) * 0.05;
    H[i] = grain * 0.3 + f * 0.5 + b * 0.4;
    const o = i * 4; img.data[o] = val * 255; img.data[o + 1] = val * 0.98 * 255; img.data[o + 2] = val * 0.95 * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(40,36,34,0.6)'; g.lineWidth = Math.max(2, S / 256);
  const step = S / slabs;
  for (let k = 0; k <= slabs; k++) {
    g.beginPath(); g.moveTo(k * step, 0); g.lineTo(k * step, S); g.stroke();
    g.beginPath(); g.moveTo(0, k * step); g.lineTo(S, k * step); g.stroke();
    const p = Math.min(S - 1, Math.round(k * step)), w = Math.max(2, S / 256);
    for (let y = 0; y < S; y++) for (let d = 0; d < w; d++) { H[y * S + Math.min(S - 1, p + d)] -= 1; H[Math.min(S - 1, p + d) * S + y] -= 1; }
  }
  return { map: tex(c), normalMap: normalFromHeight(H, S, S, 1.6) };
}

// Dry grass and dirt: big patches, plus short blades drawn on top so it still
// has detail close up.
export function ground() {
  const S = sz(1024), rnd = mulberry32(3);
  const big = lowField(64, 3, 5, 41), mid = lowField(256, 20, 3, 17), fine = lowField(256, 80, 2, 19);
  const [c, g] = mk(S); const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, b = bil(big, 64, u, v), m = bil(mid, 256, u, v), f = bil(fine, 256, u, v);
    const dirt = clamp((b - 0.45) * 3, 0, 1), grain = rnd();
    const r = 0.30 + dirt * 0.18 + (m - 0.5) * 0.12 + (f - 0.5) * 0.08 + (grain - 0.5) * 0.05;
    const gg = 0.36 + dirt * 0.05 + (m - 0.5) * 0.14 + (f - 0.5) * 0.08 + (grain - 0.5) * 0.05;
    const bb = 0.17 + dirt * 0.07 + (m - 0.5) * 0.06;
    const o = (y * S + x) * 4; img.data[o] = r * 255; img.data[o + 1] = gg * 255; img.data[o + 2] = bb * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.save(); g.scale(S / 1024, S / 1024); g.lineWidth = 1.2;
  for (let k = 0; k < 1800; k++) {
    const x = 16 + rnd() * 992, y = 16 + rnd() * 992, l = 5 + rnd() * 9, a = -Math.PI / 2 + (rnd() - 0.5) * 0.8;
    const t = rnd();
    g.strokeStyle = t < 0.5 ? `rgba(${70 + rnd() * 30},${96 + rnd() * 40},${34 + rnd() * 20},0.55)` : `rgba(${150 + rnd() * 40},${140 + rnd() * 30},${80 + rnd() * 30},0.4)`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.restore();
  return tex(c);
}

// Terrain detail textures for the biome shader (each tiles seamlessly).
function detailTex(fn, size = 512) {
  const S = sz(size), [c, g] = mk(S); const img = g.createImageData(S, S), rnd = mulberry32(77);
  const lf = lowField(128, 6, 4, 81), lf2 = lowField(256, 28, 3, 82), lf3 = lowField(256, 90, 2, 83);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, a = bil(lf, 128, u, v), b = bil(lf2, 256, u, v), d = bil(lf3, 256, u, v);
    const [r, gg, bb] = fn(u, v, a, b, d, rnd());
    const o = (y * S + x) * 4; img.data[o] = clamp(r, 0, 1) * 255; img.data[o + 1] = clamp(gg, 0, 1) * 255; img.data[o + 2] = clamp(bb, 0, 1) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0); return tex(c);
}
// A dry lakebed: pale baked mud split into cracked plates.
export function lakeTex() {
  const S = sz(512), cells = 9, pts = [], rnd = mulberry32(5);
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.15 + rnd() * 0.7) / cells, (j + 0.15 + rnd() * 0.7) / cells]);
  return detailTex((u, v, a, b, d, n) => {
    let d1 = 9, d2 = 9;
    const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = ci + di, jj = cj + dj, p = pts[((jj + cells) % cells) * cells + ((ii + cells) % cells)];
      const dx = u - (p[0] + (ii - ((ii + cells) % cells)) / cells), dz = v - (p[1] + (jj - ((jj + cells) % cells)) / cells), dd = Math.hypot(dx, dz);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
    }
    const crack = smoothstepC(0.0, 0.012, d2 - d1);                       // 0 on a crack
    const k = (0.84 + 0.1 * (a - 0.5) + 0.05 * (d - 0.5) + (n - 0.5) * 0.04) * (0.55 + 0.45 * crack);
    return [0.9 * k, 0.84 * k, 0.72 * k];
  });
}
const smoothstepC = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Wind-rippled sand.
export function sandTex() {
  return detailTex((u, v, a, b, d, n) => {
    const rip = 0.5 + 0.5 * Math.sin((u * 0.8 + v * 0.6) * Math.PI * 2 * 14 + a * 9);
    const k = 0.8 + 0.16 * (a - 0.5) + 0.07 * (rip - 0.5) + (d - 0.5) * 0.08 + (n - 0.5) * 0.05;
    return [0.86 * k, 0.72 * k, 0.5 * k];
  });
}
// Packed snow with soft blue shading.
export function snowTex() {
  return detailTex((u, v, a, b, d, n) => {
    const k = 0.9 + 0.08 * (b - 0.5) + (d - 0.5) * 0.06 + (n > 0.985 ? 0.12 : 0);
    return [0.9 * k, 0.94 * k, 1.0 * k];
  });
}
// Layered rock: bands of brown and grey, with cracks.
export function rockTex() {
  return detailTex((u, v, a, b, d, n) => {
    const band = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 11 + a * 7 + b * 3);
    const crack = Math.pow(Math.abs(b - 0.5) * 2, 0.35);
    const k = (0.46 + 0.015 * band + 0.14 * (a - 0.5)) * (0.72 + 0.28 * crack) + (n - 0.5) * 0.06;
    return [k * 0.97, k * 0.95, k * 0.93];
  });
}

// Small ripples for the sea's normal map (scrolled over time).
export function rippleNormal() {
  const S = sz(512), f1 = lowField(128, 8, 3, 61), f2 = lowField(128, 24, 2, 62), H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) H[y * S + x] = bil(f1, 128, x / S, y / S) * 0.7 + bil(f2, 128, x / S, y / S) * 0.3;
  return normalFromHeight(H, S, S, 5);
}

// ---------------------------------------------------------------------------
// Facades. Each returns { map, emissiveMap, ormMap, normalMap, w, h }, where
// w and h are the size in metres that one copy of the texture covers. The
// cells are drawn in design units of 64 per metre; the canvas is scaled by
// the texture-detail setting.
// ---------------------------------------------------------------------------
const litColors = ['#ffd49a', '#ffe2b8', '#ffc67a', '#fff1d6', '#d8e6ff'];
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const vgrad = (g, y0, y1, stops) => { const gr = g.createLinearGradient(0, y0, 0, y1); for (const [t, c] of stops) gr.addColorStop(t, c); return gr; };

function facadeBase(cols, rows, cw, ch, seed, drawCell, normalStrength = 2.6, o = {}) {
  // Four canvases are drawn cell by cell: the colour, the glow of lit rooms (emissive), the roughness (from which the ORM map is made: dark = smooth
  // glass) and, for the facades that draw one (o.height), the height of the surface: 1 is the outermost face (a sill, a mullion), the wall a little
  // below it, a window set back in its opening near 0. The height drives the parallax in the facade shader (city.js), so windows sit back in the wall
  // with their reveals showing, and it makes the normal map. Without one the height is taken from the roughness, as before.
  const W = Math.round(cols * cw * TS), H = Math.round(rows * ch * TS);
  const [c, g] = mk(W, H), [ce, ge] = mk(W, H), [cr, gr] = mk(W, H), [, gh] = mk(W, H);
  for (const x of [g, ge, gr, gh]) x.scale(TS, TS);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, cols * cw, rows * ch);
  gh.fillStyle = 'rgb(235,235,235)'; gh.fillRect(0, 0, cols * cw, rows * ch);
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) drawCell(g, ge, gr, k * cw, r * ch, cw, ch, rnd, r, k, gh);
  // The roughness canvas becomes a glTF-style ORM map (G = roughness, B = metalness: shiny dark glass is metallic; a little darker than glass, 50 to
  // 70, is spandrel glass: shiny, but no room behind it).
  const R = gr.getImageData(0, 0, W, H).data, HD = o.height ? gh.getImageData(0, 0, W, H).data : null;
  const [co, go] = mk(W, H), oi = go.createImageData(W, H), od = oi.data;
  const Hf = new Float32Array(W * H), hr = mulberry32(seed + 7);
  // The colour is given the grain of a real surface where it is wall (not glass, not set back): fine speckle, blotches a hand across, and big patches
  // where the paint or render has aged differently, so no wall is one flat colour.
  const CI = g.getImageData(0, 0, W, H), cd = CI.data, grain = o.grain ?? 0;
  const mid = grain ? lowField(128, 40, 3, seed + 12) : null, big = grain ? lowField(64, 5, 3, seed + 13) : null;
  for (let i = 0; i < W * H; i++) {
    let gray = R[i * 4]; const glass = gray < 70;
    if (gray > 120) gray = clamp(gray + (hr() - 0.5) * 14, 0, 255);          // plaster grain
    od[i * 4] = 255; od[i * 4 + 1] = gray; od[i * 4 + 2] = gray < 50 ? 176 : gray < 70 ? 70 : 0; od[i * 4 + 3] = 255;
    let h = HD ? HD[i * 4] / 255 : gray / 255;
    if (grain && !glass && h > 0.8) {
      const x = i % W, y = (i / W) | 0, u = x / W, v = y / H, m = bil(mid, 128, u, v), b = bil(big, 64, u, v), f = hr();
      const k = 1 + ((f - 0.5) * 0.07 + (m - 0.5) * 0.12 + (b - 0.5) * 0.16) * grain;
      cd[i * 4] = clamp(cd[i * 4] * k, 0, 255); cd[i * 4 + 1] = clamp(cd[i * 4 + 1] * k, 0, 255); cd[i * 4 + 2] = clamp(cd[i * 4 + 2] * k * 0.99, 0, 255);
      h += ((f - 0.5) * 0.012 + (m - 0.5) * 0.02) * grain;                       // (and a little bump, for the normal map)
    }
    Hf[i] = h;
  }
  if (grain) g.putImageData(CI, 0, 0);
  go.putImageData(oi, 0, 0);
  const normalMap = normalFromHeight(Hf, W, H, normalStrength);
  // The height as a one-channel texture (rows flipped: a canvas texture is drawn top row last, a data texture first).
  const hd = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) hd[(H - 1 - y) * W + x] = clamp(Hf[y * W + x], 0, 1) * 255;
  const heightMap = new THREE.DataTexture(hd, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  heightMap.wrapS = heightMap.wrapT = THREE.RepeatWrapping; heightMap.magFilter = THREE.LinearFilter; heightMap.minFilter = THREE.LinearMipmapLinearFilter; heightMap.generateMipmaps = true; heightMap.needsUpdate = true;
  return { map: tex(c), emissiveMap: tex(ce), ormMap: tex(co, false), normalMap, heightMap };
}
const hrect = (gh, x, y, w, h, v) => { if (!gh) return; gh.fillStyle = `rgb(${v},${v},${v})`; gh.fillRect(x, y, w, h); };
const shadeHex = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${clamp((n >> 16) * k, 0, 255) | 0},${clamp(((n >> 8) & 255) * k, 0, 255) | 0},${clamp((n & 255) * k, 0, 255) | 0})`; };

// The glow of a lit room behind a window: warm light, a ceiling strip and the
// dark shapes of furniture; sometimes a curtain.
function interiorGlow(ge, x, y, w, h, rnd) {
  ge.fillStyle = vgrad(ge, y, y + h, [[0, litColors[(rnd() * litColors.length) | 0]], [1, '#7a5632']]);
  ge.globalAlpha = 0.6 + rnd() * 0.4; ge.fillRect(x, y, w, h); ge.globalAlpha = 1;
  ge.fillStyle = 'rgba(255,255,240,0.9)'; ge.fillRect(x + w * 0.15, y + 3, w * 0.7, 3);
  ge.fillStyle = '#000';
  if (rnd() < 0.7) ge.fillRect(x + rnd() * w * 0.4, y + h * 0.62, w * (0.25 + rnd() * 0.3), h * 0.38);
  if (rnd() < 0.4) ge.fillRect(x + w * 0.7, y + h * 0.3, w * 0.15, h * 0.7);
  if (rnd() < 0.35) { ge.globalAlpha = 0.75; ge.fillRect(x + (rnd() < 0.5 ? 0 : w * 0.5), y, w * (0.3 + rnd() * 0.2), h); ge.globalAlpha = 1; }
}

function glassCell(g, ge, gr, x, y, w, h, rnd, r, k, gh) {
  // A unitised curtain wall, 4 m by one storey: three panels across between thin aluminium mullions, an opaque spandrel panel in front of the floor
  // slab (dark glass, shiny, with no room behind it) and the vision glass below it. No two panels are quite the same: each is a shade lighter or darker
  // (a slight tilt per panel, drawn as a gradient in the height map, came out as ripples: an 8-bit gradient is a staircase).
  const sp = 54, pw = w / 3;
  for (let p = 0; p < 3; p++) {
    const px = x + p * pw, b = 0.92 + rnd() * 0.16;
    g.fillStyle = vgrad(g, y, y + sp, [[0, shadeHex('#4a545b', b)], [1, shadeHex('#363e44', b)]]); g.fillRect(px, y, pw, sp);
    g.fillStyle = vgrad(g, y + sp, y + h, [[0, shadeHex('#66737b', b)], [0.45, shadeHex('#4c5860', b)], [1, shadeHex('#2c343a', b)]]); g.fillRect(px, y + sp, pw, h - sp);
    gr.fillStyle = '#3c3c3c'; gr.fillRect(px, y, pw, sp); gr.fillStyle = '#161616'; gr.fillRect(px, y + sp, pw, h - sp);
    hrect(gh, px, y, pw, h, 230);                                                         // (the glass a little back from the face of the frame; the blinds are behind it, in the room: city.js)
    if (rnd() < 0.22) interiorGlow(ge, px + 3, y + sp + 3, pw - 6, h - sp - 3, rnd);
  }
  // The frame: mullions between the panels, a transom at the floor line and at the foot of the spandrel; brushed aluminium standing a little proud.
  const bar = (bx, by, bw, bh) => { g.fillStyle = '#8f989e'; g.fillRect(bx, by, bw, bh); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(bx, by, Math.min(bw, 1.2), bh); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx + bw - 1, by, 1, bh); gr.fillStyle = '#8a8a8a'; gr.fillRect(bx, by, bw, bh); hrect(gh, bx, by, bw, bh, 252); };
  for (let p = 0; p < 3; p++) bar(x + p * pw - 2, y, 4, h);
  bar(x, y, w, 3); bar(x, y + sp - 2, w, 4);
}

function modernCell(g, ge, gr, x, y, w, h, rnd, r, k, gh) {
  // An office block: a band of board-marked concrete across the floor slab, and below it a ribbon of glass set well back (its top in the band's shadow)
  // between dark aluminium mullions a metre apart.
  const band = 60, gy = y + band, gh2 = h - band;
  g.fillStyle = '#dad5cc'; g.fillRect(x, y, w, band);
  g.fillStyle = 'rgba(80,70,60,0.07)'; for (let l = 1; l < 3; l++) g.fillRect(x, y + l * band / 3, w, 1);                     // (the joints of the formwork)
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x, y, w, 1.5); g.fillStyle = 'rgba(40,36,30,0.35)'; g.fillRect(x, y + band - 2, w, 2);   // (the arris on top; the drip edge under)
  for (let s = 0; s < 4; s++) { const sx = x + rnd() * w, len = 20 + rnd() * 30, sg = g.createLinearGradient(0, y + band * 0.4, 0, y + band * 0.4 + len); sg.addColorStop(0, 'rgba(70,64,56,0.16)'); sg.addColorStop(1, 'rgba(70,64,56,0)'); g.fillStyle = sg; g.fillRect(sx, y + band * 0.4, 3 + rnd() * 6, Math.min(len, band * 0.6)); }
  gr.fillStyle = '#d4d4d4'; gr.fillRect(x, y, w, band); hrect(gh, x, y, w, band, 250);
  g.fillStyle = vgrad(g, gy, gy + gh2, [[0, '#4a555d'], [0.5, '#5f6c74'], [1, '#353e45']]); g.fillRect(x, gy, w, gh2);
  gr.fillStyle = '#151515'; gr.fillRect(x, gy, w, gh2); hrect(gh, x, gy, w, gh2, 105);
  for (let m = 0; m < 4; m++) { const mx = x + m * w / 4 - 1.5; g.fillStyle = '#3a4045'; g.fillRect(mx, gy, 3, gh2); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(mx, gy, 1, gh2); gr.fillStyle = '#8c8c8c'; gr.fillRect(mx, gy, 3, gh2); hrect(gh, mx, gy, 3, gh2, 130); }
  g.fillStyle = '#3a4045'; g.fillRect(x, gy + gh2 - 4, w, 4); hrect(gh, x, gy + gh2 - 4, w, 4, 130);
  if (rnd() < 0.25) interiorGlow(ge, x + 3, gy + 2, w - 6, gh2 - 6, rnd);
}

function aptCell(g, ge, gr, x, y, w, h, rnd, r, k, gh) {
  // 4 m by one storey of a rendered apartment block: an aluminium window (two sliding panes) set back in its opening, a concrete sill with rain streaks
  // running down from it; now and then a window air conditioner, rarely a pair of louvred shutters.
  g.fillStyle = '#ece5d9'; g.fillRect(x, y, w, h); gr.fillStyle = '#e2e2e2'; gr.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(80,70,60,0.08)'; g.fillRect(x, y + h - 2, w, 2); hrect(gh, x, y + h - 2, w, 2, 226);          // (the line of the floor slab)
  const ww = 112, wh = 98, wx = x + (w - ww) / 2, wy = y + 52;
  // Rain streaks from the ends of the sill and below it.
  for (let s = 0; s < 7; s++) {
    const sx = wx - 8 + rnd() * (ww + 16), len = 18 + rnd() * 70, sw = 2 + rnd() * 6, sg = g.createLinearGradient(0, wy + wh + 10, 0, wy + wh + 10 + len);
    sg.addColorStop(0, `rgba(70,62,52,${0.1 + rnd() * 0.16})`); sg.addColorStop(1, 'rgba(70,62,52,0)'); g.fillStyle = sg; g.fillRect(sx, wy + wh + 10, sw, len);
  }
  // Shutters, rarely: louvred, in muted colours, standing off the wall.
  if (rnd() < 0.08) {
    const sc = ['#56615b', '#6a635a', '#4b5661', '#6e6a62'][(rnd() * 4) | 0];
    for (const sx of [wx - 40, wx + ww + 6]) {
      g.fillStyle = sc; g.fillRect(sx, wy - 2, 34, wh + 4); g.fillStyle = 'rgba(0,0,0,0.28)'; for (let l = 2; l < wh; l += 6) g.fillRect(sx + 3, wy + l, 28, 2);
      g.fillStyle = 'rgba(255,255,255,0.12)'; for (let l = 4; l < wh; l += 6) g.fillRect(sx + 3, wy + l, 28, 1);
      g.fillStyle = 'rgba(30,25,20,0.18)'; g.fillRect(sx + 34, wy, 3, wh + 4);
      gr.fillStyle = '#b4b4b4'; gr.fillRect(sx, wy - 2, 34, wh + 4); hrect(gh, sx, wy - 2, 34, wh + 4, 244);
    }
  }
  // The opening: its reveal (render), the frame, two panes and the meeting rail between them.
  g.fillStyle = '#d6cec1'; g.fillRect(wx, wy, ww, wh); gr.fillStyle = '#d0d0d0'; gr.fillRect(wx, wy, ww, wh); hrect(gh, wx, wy, ww, wh, 100);
  g.fillStyle = '#c6c9cb'; g.fillRect(wx + 4, wy + 4, ww - 8, wh - 8); gr.fillStyle = '#a8a8a8'; gr.fillRect(wx + 4, wy + 4, ww - 8, wh - 8);
  const px = wx + 9, py = wy + 9, pw = ww - 18, ph = wh - 18;
  g.fillStyle = vgrad(g, py, py + ph, [[0, '#59646d'], [0.55, '#3c464e'], [1, '#232a30']]); g.fillRect(px, py, pw, ph);
  gr.fillStyle = '#1a1a1a'; gr.fillRect(px, py, pw, ph); hrect(gh, px, py, pw, ph, 80);
  g.fillStyle = '#c6c9cb'; g.fillRect(wx + ww / 2 - 3, wy + 4, 6, wh - 8); gr.fillStyle = '#a8a8a8'; gr.fillRect(wx + ww / 2 - 3, wy + 4, 6, wh - 8); hrect(gh, wx + ww / 2 - 3, wy + 4, 6, wh - 8, 104);
  g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(px, py, pw, 3); g.fillRect(px, py, 2, ph);                                              // (the frame's shadow on the glass)
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(wx + 4, wy + 4, ww - 8, 1.5);
  if (rnd() < 0.25) interiorGlow(ge, px + 2, py + 2, pw - 4, ph - 4, rnd);
  // The sill: precast concrete, standing proud, lit on top, with a drip shadow under it.
  g.fillStyle = '#cdc6b9'; g.fillRect(wx - 10, wy + wh, ww + 20, 9); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(wx - 10, wy + wh, ww + 20, 2);
  const dg = g.createLinearGradient(0, wy + wh + 9, 0, wy + wh + 19); dg.addColorStop(0, 'rgba(40,34,28,0.38)'); dg.addColorStop(1, 'rgba(40,34,28,0)'); g.fillStyle = dg; g.fillRect(wx - 10, wy + wh + 9, ww + 20, 10);
  gr.fillStyle = '#c8c8c8'; gr.fillRect(wx - 10, wy + wh, ww + 20, 9); hrect(gh, wx - 10, wy + wh, ww + 20, 9, 255);
  // A window air conditioner in the bottom of the opening, now and then, with a rusty streak under it.
  if (rnd() < 0.16) {
    const ax = wx + (rnd() < 0.5 ? 14 : ww - 62), ay = wy + wh - 40, aw = 48, ah = 34;
    g.fillStyle = '#bdb7aa'; g.fillRect(ax, ay, aw, ah); g.fillStyle = 'rgba(0,0,0,0.3)'; for (let l = ay + 5; l < ay + ah - 4; l += 4) g.fillRect(ax + 4, l, aw - 8, 1.5);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(ax, ay, aw, 2); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(ax, ay + ah, aw, 3);
    const rg = g.createLinearGradient(0, wy + wh + 9, 0, wy + wh + 60); rg.addColorStop(0, 'rgba(110,70,40,0.3)'); rg.addColorStop(1, 'rgba(110,70,40,0)'); g.fillStyle = rg; g.fillRect(ax + aw * 0.4, wy + wh + 9, 5, 50);
    gr.fillStyle = '#b0b0b0'; gr.fillRect(ax, ay, aw, ah); hrect(gh, ax, ay, aw, ah, 255);
  }
}

function brickCell(g, ge, gr, x, y, w, h, rnd, r, k, gh) {
  const rowsN = 46, colsN = 18, bh = h / rowsN, bw = w / colsN;
  g.fillStyle = '#b8b0a2'; g.fillRect(x, y, w, h);
  gr.fillStyle = '#8c8c8c'; gr.fillRect(x, y, w, h); hrect(gh, x, y, w, h, 228);          // (the mortar a few millimetres back from the face of the bricks)
  for (let r = 0; r < rowsN; r++) for (let k = 0; k < colsN + 1; k++) {
    const v = 0.78 + rnd() * 0.42, bx = x + (k - (r % 2) * 0.5) * bw;
    const x0 = Math.max(x, bx + 0.7), x1 = Math.min(x + w, bx + bw - 0.7);
    if (x1 <= x0) continue;
    g.fillStyle = `rgb(${158 * v | 0},${88 * v | 0},${66 * v | 0})`; g.fillRect(x0, y + r * bh + 0.7, x1 - x0, bh - 1.4);
    gr.fillStyle = '#e4e4e4'; gr.fillRect(x0, y + r * bh + 0.7, x1 - x0, bh - 1.4); hrect(gh, x0, y + r * bh + 0.7, x1 - x0, bh - 1.4, 240);
  }
  const ww = 96, wh = 126, wx = x + (w - ww) / 2, wy = y + 28;
  hrect(gh, wx - 12, wy - 16, ww + 24, 14, 248); hrect(gh, wx - 4, wy - 4, ww + 8, wh + 8, 110); hrect(gh, wx, wy, ww, wh, 78); hrect(gh, wx - 14, wy + wh + 4, ww + 28, 10, 255);
  g.fillStyle = '#ece6da'; g.fillRect(wx - 12, wy - 16, ww + 24, 14);                  // lintel
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(wx - 12, wy - 3, ww + 24, 3);
  g.fillStyle = '#ece6da'; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
  gr.fillStyle = '#c4c4c4'; gr.fillRect(wx - 12, wy - 16, ww + 24, wh + 20);
  g.fillStyle = vgrad(g, wy, wy + wh, [[0, '#5e6a74'], [1, '#20282e']]); g.fillRect(wx, wy, ww, wh);
  gr.fillStyle = '#1c1c1c'; gr.fillRect(wx, wy, ww, wh);
  g.fillStyle = '#ece6da'; g.fillRect(wx, wy + wh / 2 - 2.5, ww, 5); g.fillRect(wx + ww / 2 - 2.5, wy, 5, wh); hrect(gh, wx, wy + wh / 2 - 2.5, ww, 5, 100); hrect(gh, wx + ww / 2 - 2.5, wy, 5, wh, 100);
  g.fillStyle = '#d8d1c4'; g.fillRect(wx - 14, wy + wh + 4, ww + 28, 10);            // sill
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(wx - 14, wy + wh + 14, ww + 28, 4);
  if (rnd() < 0.24) interiorGlow(ge, wx + 2, wy + 2, ww - 4, wh - 4, rnd);
}

function houseCell(g, ge, gr, x, y, w, h, rnd, r, k, gh) {
  // 8 m by 6 m of a rendered house, two floors: a stone plinth, two windows upstairs, one window and the front door downstairs. The windows are white
  // frames set back in their openings, each with a stone sill (streaked below) and a lintel; the door is a panelled door in a frame with a fanlight, a
  // step and a lamp beside it.
  g.fillStyle = '#ece6da'; g.fillRect(x, y, w, h); gr.fillStyle = '#e0e0e0'; gr.fillRect(x, y, w, h);
  // The plinth: rough stone courses.
  const py = y + h - 30; g.fillStyle = '#8a8277'; g.fillRect(x, py, w, 30); gr.fillStyle = '#c4c4c4'; gr.fillRect(x, py, w, 30); hrect(gh, x, py, w, 30, 250);
  for (let c = 0; c < 2; c++) for (let s = 0; s < 14; s++) { const sx = x + s * w / 14 + (c ? w / 28 : 0), v = 0.85 + rnd() * 0.3; g.fillStyle = `rgb(${138 * v | 0},${130 * v | 0},${119 * v | 0})`; g.fillRect(sx + 1, py + c * 15 + 1, w / 14 - 2, 13); }
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, py, w, 2);
  g.fillStyle = 'rgba(70,60,50,0.1)'; g.fillRect(x, y + h * 0.5 - 3, w, 3);                                    // (a string course between the floors)
  const win = (wx, wy, ww, wh) => {
    // Rain streaks under the sill.
    for (let sk = 0; sk < 5; sk++) { const sx = wx - 6 + rnd() * (ww + 12), len = 14 + rnd() * 40, sg = g.createLinearGradient(0, wy + wh + 12, 0, wy + wh + 12 + len); sg.addColorStop(0, `rgba(70,62,52,${0.08 + rnd() * 0.12})`); sg.addColorStop(1, 'rgba(70,62,52,0)'); g.fillStyle = sg; g.fillRect(sx, wy + wh + 12, 2 + rnd() * 4, len); }
    g.fillStyle = '#d8d0c2'; g.fillRect(wx - 8, wy - 14, ww + 16, 12); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(wx - 8, wy - 2, ww + 16, 2); hrect(gh, wx - 8, wy - 14, ww + 16, 12, 252);   // the lintel
    g.fillStyle = '#d4ccbe'; g.fillRect(wx, wy, ww, wh); hrect(gh, wx, wy, ww, wh, 110);                                   // the reveal
    g.fillStyle = '#f2f1ec'; g.fillRect(wx + 3, wy + 3, ww - 6, wh - 6); gr.fillStyle = '#b4b4b4'; gr.fillRect(wx + 3, wy + 3, ww - 6, wh - 6); hrect(gh, wx + 3, wy + 3, ww - 6, wh - 6, 116);   // the frame
    const panes = [[wx + 9, wy + 9, ww / 2 - 12, wh * 0.3 - 10], [wx + ww / 2 + 3, wy + 9, ww / 2 - 12, wh * 0.3 - 10], [wx + 9, wy + wh * 0.3 + 3, ww / 2 - 12, wh * 0.7 - 12], [wx + ww / 2 + 3, wy + wh * 0.3 + 3, ww / 2 - 12, wh * 0.7 - 12]];
    for (const [qx, qy, qw, qh] of panes) { g.fillStyle = vgrad(g, qy, qy + qh, [[0, '#5d6870'], [0.6, '#3d464e'], [1, '#262d33']]); g.fillRect(qx, qy, qw, qh); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(qx, qy, qw, 2); gr.fillStyle = '#1a1a1a'; gr.fillRect(qx, qy, qw, qh); hrect(gh, qx, qy, qw, qh, 92); }
    g.fillStyle = '#cfc7b8'; g.fillRect(wx - 10, wy + wh, ww + 20, 9); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(wx - 10, wy + wh, ww + 20, 2);
    g.fillStyle = 'rgba(40,34,28,0.32)'; g.fillRect(wx - 10, wy + wh + 9, ww + 20, 3); gr.fillStyle = '#c4c4c4'; gr.fillRect(wx - 10, wy + wh, ww + 20, 9); hrect(gh, wx - 10, wy + wh, ww + 20, 9, 255);
    if (rnd() < 0.3) interiorGlow(ge, wx + 9, wy + 9, ww - 18, wh - 18, rnd);
  };
  win(64, 46, 100, 98); win(w - 164, 46, 100, 98); win(64, h - 166, 100, 110);
  // The front door: a frame, the door (four panels), a fanlight over it, a brass handle, a step, a lamp.
  const dc = ['#3e2a20', '#28394a', '#5e2224', '#2b2d30', '#3c4a3a'][(rnd() * 5) | 0], dx = w - 186, dy = h - 196, dw = 88, dh = 166;
  g.fillStyle = '#e4ded2'; g.fillRect(dx - 10, dy - 34, dw + 20, dh + 34); hrect(gh, dx - 10, dy - 34, dw + 20, dh + 34, 252);
  g.fillStyle = '#d4ccbe'; g.fillRect(dx, dy - 26, dw, dh + 26); hrect(gh, dx, dy - 26, dw, dh + 26, 120);
  g.fillStyle = vgrad(g, dy - 24, dy - 4, [[0, '#56626b'], [1, '#2c343a']]); g.fillRect(dx + 4, dy - 24, dw - 8, 18); gr.fillStyle = '#1a1a1a'; gr.fillRect(dx + 4, dy - 24, dw - 8, 18); hrect(gh, dx + 4, dy - 24, dw - 8, 18, 104);
  g.fillStyle = dc; g.fillRect(dx + 4, dy, dw - 8, dh - 4); gr.fillStyle = '#9c9c9c'; gr.fillRect(dx + 4, dy, dw - 8, dh - 4); hrect(gh, dx + 4, dy, dw - 8, dh - 4, 130);
  for (const [px, pyy, pw, ph] of [[dx + 12, dy + 10, 30, 62], [dx + dw - 42, dy + 10, 30, 62], [dx + 12, dy + 84, 30, 66], [dx + dw - 42, dy + 84, 30, 66]]) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(px, pyy, pw, ph); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(px + 2, pyy + ph - 3, pw - 2, 3); g.fillStyle = shadeHex(dc, 1.08); g.fillRect(px + 3, pyy + 3, pw - 6, ph - 6); hrect(gh, px, pyy, pw, ph, 124); }
  g.fillStyle = '#c9a54e'; g.fillRect(dx + dw - 20, dy + 78, 5, 16); hrect(gh, dx + dw - 20, dy + 78, 5, 16, 150);
  g.fillStyle = '#bdb5a8'; g.fillRect(dx - 14, h - 32 + y, dw + 28, 8); hrect(gh, dx - 14, h - 32 + y, dw + 28, 8, 255);
  g.fillStyle = '#1d1e20'; g.fillRect(dx + dw + 18, dy + 20, 12, 26); g.fillStyle = '#f4dca0'; g.fillRect(dx + dw + 20, dy + 24, 8, 16); hrect(gh, dx + dw + 18, dy + 20, 12, 26, 255);
  ge.fillStyle = '#ffcf8a'; ge.globalAlpha = 0.9; ge.fillRect(dx + dw + 20, dy + 24, 8, 16); ge.globalAlpha = 1;
}

function shopBay(g, ge, gr, x, y, w, h, rnd, r, k, gh) {
  // One bay of a row of shops, 4 m wide and the height of the ground floor: a painted fascia board for the name under a moulded cornice, a transom of
  // small panes, a big display window in a slim frame on a stall riser of dark tiles, and stone pilasters between the bays. The middle bay has the
  // door, set back in a lobby with a glass door and a push bar.
  const fasc = ['#1f3a2e', '#1b2a44', '#4a1c1f', '#151617', '#e8e0cc', '#2e2a26'][(rnd() * 6) | 0], light = fasc === '#e8e0cc';
  const pil = 22, fx = x + pil, fw = w - 2 * pil;
  g.fillStyle = '#e2dbcf'; g.fillRect(x, y, w, h); gr.fillStyle = '#dcdcdc'; gr.fillRect(x, y, w, h); hrect(gh, x, y, w, h, 255);
  // The cornice over the fascia, and the fascia board itself.
  g.fillStyle = '#ece6da'; g.fillRect(x, y + 34, w, 12); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(x, y + 34, w, 2); g.fillStyle = 'rgba(40,34,28,0.35)'; g.fillRect(x, y + 46, w, 4);
  g.fillStyle = fasc; g.fillRect(fx, y + 50, fw, 64); gr.fillStyle = '#909090'; gr.fillRect(fx, y + 50, fw, 64); hrect(gh, fx, y + 50, fw, 64, 238);
  g.fillStyle = light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)'; g.fillRect(fx + 6, y + 56, fw - 12, 2); g.fillRect(fx + 6, y + 106, fw - 12, 2);
  // The shopfront: a slim dark frame, a transom row of panes, the display glass, a stall riser.
  const sy = y + 122, sh = h - 122, rh = 44, frame = ['#2a2d31', '#3a2a20', '#e6e2da', '#30363c'][(rnd() * 4) | 0];
  g.fillStyle = frame; g.fillRect(fx, sy, fw, sh); gr.fillStyle = '#8a8a8a'; gr.fillRect(fx, sy, fw, sh); hrect(gh, fx, sy, fw, sh, 200);
  const glassR = (gx, gy, gw, ghh) => { g.fillStyle = vgrad(g, gy, gy + ghh, [[0, '#5a6670'], [0.5, '#37414a'], [1, '#222930']]); g.fillRect(gx, gy, gw, ghh); gr.fillStyle = '#121212'; gr.fillRect(gx, gy, gw, ghh); hrect(gh, gx, gy, gw, ghh, 150); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(gx, gy, gw, 2); };
  const nT = 4; for (let t = 0; t < nT; t++) glassR(fx + 6 + t * (fw - 6) / nT, sy + 6, (fw - 6) / nT - 6, 30);
  const door = k === 1, gy0 = sy + 42, gyh = sh - 42 - rh;
  if (door) {
    const dw = 70, dx = x + w / 2 - dw / 2;
    glassR(fx + 6, gy0, dx - fx - 14, gyh); glassR(dx + dw + 8, gy0, fx + fw - dx - dw - 14, gyh);
    g.fillStyle = '#3a3c40'; g.fillRect(dx - 2, gy0, dw + 4, sh - 42); hrect(gh, dx - 2, gy0, dw + 4, sh - 42, 70);              // the lobby, set back
    g.fillStyle = frame; g.fillRect(dx + 2, gy0 + 4, dw - 4, sh - 50); hrect(gh, dx + 2, gy0 + 4, dw - 4, sh - 50, 76);
    glassR(dx + 8, gy0 + 10, dw - 16, sh - 76); hrect(gh, dx + 8, gy0 + 10, dw - 16, sh - 76, 60);
    g.fillStyle = '#b8bcc0'; g.fillRect(dx + 10, gy0 + (sh - 42) * 0.52, dw - 20, 5); hrect(gh, dx + 10, gy0 + (sh - 42) * 0.52, dw - 20, 5, 90);   // the push bar
    g.fillStyle = '#6b6e72'; g.fillRect(dx + 4, y + h - 22, dw - 8, 18); hrect(gh, dx + 4, y + h - 22, dw - 8, 18, 82);                     // the kick plate
  } else glassR(fx + 6, gy0, fw - 12, gyh);
  // The stall riser: dark glazed tiles.
  if (!door) { const ry = y + h - rh; g.fillStyle = '#1e2124'; g.fillRect(fx, ry, fw, rh); for (let a = 0; a < 2; a++) for (let b2 = 0; b2 < 10; b2++) { const v = 0.85 + rnd() * 0.3; g.fillStyle = `rgb(${34 * v | 0},${38 * v | 0},${42 * v | 0})`; g.fillRect(fx + 2 + b2 * fw / 10, ry + 2 + a * rh / 2, fw / 10 - 3, rh / 2 - 3); } g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(fx, ry, fw, 2); gr.fillStyle = '#505050'; gr.fillRect(fx, ry, fw, rh); hrect(gh, fx, ry, fw, rh, 210); }
  // The pilasters, standing proud, with a capital and a base.
  for (const px of [x, x + w - pil]) {
    g.fillStyle = '#d9d1c3'; g.fillRect(px, y + 30, pil, h - 30); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(px, y + 30, 3, h - 30); g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(px + pil - 3, y + 30, 3, h - 30);
    g.fillStyle = '#e6dfd2'; g.fillRect(px - 2, y + 116, pil + 4, 8); g.fillStyle = '#8a8277'; g.fillRect(px, y + h - 22, pil, 22);
    gr.fillStyle = '#d0d0d0'; gr.fillRect(px, y + 30, pil, h - 30); hrect(gh, px, y + 30, pil, h - 30, 255);
  }
  // At night the shops are lit inside.
  const warm = ['#ffd9a8', '#fff0d0', '#ffcf9a'][k % 3], eg = ge.createLinearGradient(0, gy0, 0, gy0 + gyh); eg.addColorStop(0, warm); eg.addColorStop(1, '#6b4a2a');
  ge.globalAlpha = 0.55 + rnd() * 0.45; ge.fillStyle = eg; ge.fillRect(fx + 6, gy0, fw - 12, gyh); ge.globalAlpha = 1;
}

function civicCell(g, ge, gr, x, y, w, h, rnd, r, k, gh) {
  // 4 m by one storey of a classical stone building (a bank, a museum): ashlar blocks with fine joints, a tall window in a moulded stone surround with
  // a keystone over it and a sill under it, a string course along the top of the storey.
  g.fillStyle = '#ddd5c6'; g.fillRect(x, y, w, h); gr.fillStyle = '#d8d8d8'; gr.fillRect(x, y, w, h); hrect(gh, x, y, w, h, 240);
  const ch = h / 6; for (let c2 = 0; c2 < 6; c2++) { const off = (c2 % 2) * 0.5; for (let b2 = -1; b2 < 4; b2++) { const bx = x + (b2 + off) * w / 3, v = 0.92 + rnd() * 0.14; g.fillStyle = `rgb(${221 * v | 0},${213 * v | 0},${198 * v | 0})`; g.fillRect(Math.max(x, bx + 1.5), y + c2 * ch + 1.5, Math.min(x + w, bx + w / 3 - 1.5) - Math.max(x, bx + 1.5), ch - 3); } }
  for (let c2 = 0; c2 <= 6; c2++) { g.fillStyle = 'rgba(80,70,55,0.35)'; g.fillRect(x, y + c2 * ch - 1, w, 2); hrect(gh, x, y + c2 * ch - 1, w, 2, 222); }
  g.fillStyle = '#e8e1d3'; g.fillRect(x, y, w, 14); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(x, y, w, 2); g.fillStyle = 'rgba(40,34,26,0.35)'; g.fillRect(x, y + 14, w, 4); hrect(gh, x, y, w, 14, 255);
  const ww = 92, wh = 150, wx = x + (w - ww) / 2, wy = y + 34;
  g.fillStyle = '#e9e2d4'; g.fillRect(wx - 14, wy - 14, ww + 28, wh + 24); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(wx - 14, wy - 14, ww + 28, 3); hrect(gh, wx - 14, wy - 14, ww + 28, wh + 24, 252);
  g.fillStyle = '#efe9dc'; g.fillRect(wx + ww / 2 - 9, wy - 20, 18, 22); hrect(gh, wx + ww / 2 - 9, wy - 20, 18, 22, 255);                    // the keystone
  g.fillStyle = '#cfc6b4'; g.fillRect(wx, wy, ww, wh); hrect(gh, wx, wy, ww, wh, 96);
  const px = wx + 7, py = wy + 7, pw = ww - 14, ph = wh - 14;
  g.fillStyle = vgrad(g, py, py + ph, [[0, '#56626b'], [0.6, '#38424a'], [1, '#232a30']]); g.fillRect(px, py, pw, ph); gr.fillStyle = '#181818'; gr.fillRect(px, py, pw, ph); hrect(gh, px, py, pw, ph, 70);
  g.fillStyle = '#2b2e2c'; for (const fx of [px + pw / 2 - 2]) g.fillRect(fx, py, 4, ph); for (const fy of [py + ph * 0.33, py + ph * 0.66]) g.fillRect(px, fy - 2, pw, 4); hrect(gh, px + pw / 2 - 2, py, 4, ph, 84);
  g.fillStyle = '#d6cebe'; g.fillRect(wx - 18, wy + wh + 8, ww + 36, 10); g.fillStyle = 'rgba(40,34,26,0.35)'; g.fillRect(wx - 18, wy + wh + 18, ww + 36, 4); hrect(gh, wx - 18, wy + wh + 8, ww + 36, 10, 255);
  if (rnd() < 0.3) interiorGlow(ge, px + 2, py + 2, pw - 4, ph - 4, rnd);
}
export function facadeCivic() { return { ...facadeBase(4, 4, 256, 224, 71, civicCell, 3, { height: true, grain: 0.7 }), w: 16, h: 14 }; }
export function facadeGlass() { return { ...facadeBase(4, 4, 256, 224, 17, glassCell, 2.2, { height: true }), w: 16, h: 14 }; }
export function facadeModern() { return { ...facadeBase(4, 4, 256, 224, 53, modernCell, 2.6, { height: true, grain: 0.8 }), w: 16, h: 14 }; }
export function facadeApartment() { return { ...facadeBase(4, 4, 256, 224, 29, aptCell, 3, { height: true, grain: 1 }), w: 16, h: 14 }; }
export function facadeBrick() { return { ...facadeBase(4, 4, 256, 224, 43, brickCell, 3.4, { height: true, grain: 0.5 }), w: 16, h: 14 }; }
export function facadeHouse() { return { ...facadeBase(1, 1, 512, 384, 61, houseCell, 3, { height: true, grain: 0.8 }), w: 8, h: 6 }; }
export function facadeShop() { return { ...facadeBase(3, 1, 341, 448, 37, shopBay, 2.4, { height: true, grain: 0.6 }), w: 12, h: 5.25 }; }

// ---------------------------------------------------------------------------
// Roofs, rails and signs
// ---------------------------------------------------------------------------
export function roofTex() {
  const S = sz(512), rnd = mulberry32(8); const [c, g] = mk(S); const img = g.createImageData(S, S);
  const f = lowField(64, 8, 3, 12);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, v = (0.42 + (bil(f, 64, x / S, y / S) - 0.5) * 0.12 + (rnd() - 0.5) * 0.1) * 255;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.98; img.data[i * 4 + 2] = v * 0.96; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
  for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * S / 4, 0); g.lineTo(k * S / 4, S); g.stroke(); }
  return tex(c);
}

// Stone or paint seen close: a pale, faintly mottled surface (it is tinted by the colour of each piece), for the plain parts of buildings (columns,
// steps, gable walls, chimneys). One repeat is 4 m.
export function plainTex() {
  const S = sz(256), rnd = mulberry32(19); const [c, g] = mk(S); const img = g.createImageData(S, S);
  const f = lowField(64, 6, 4, 23);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, v = (0.9 + (bil(f, 64, x / S, y / S) - 0.5) * 0.16 + (rnd() - 0.5) * 0.05) * 255;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.995; img.data[i * 4 + 2] = v * 0.985; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}

// Terracotta barrel tiles for pitched roofs (one repeat is about 5 m).
export function roofTileTex() {
  // Roof tiles, 2 m by 2 m to a copy (the roof builder lays it on with v running up the slope): eight courses of interlocking tiles, each tile a
  // rounded pan with a shadow where the course above laps over it, every tile a slightly different shade, weathering darker towards the bottom of each
  // course, and spots of lichen. Pale and nearly grey: the colour of a roof (terracotta, red clay, brown, slate) comes from its vertex colour.
  // Returns the colour and a normal map (each course a ramp that drops at the lap, each tile rounded across).
  const S = sz(512), K = S / 512, rnd = mulberry32(14), [c, g] = mk(S), img = g.createImageData(S, S), H = new Float32Array(S * S), lich = lowField(64, 9, 3, 15);
  const rows = 8, cols = 7, th = S / rows, tw = S / cols, shade = new Float32Array(rows * (cols + 1)).map(() => 0.82 + rnd() * 0.3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.floor(y / th), fy = (y - r * th) / th, off = (r % 2) * 0.5, kx = x / tw + off, k = Math.floor(kx), fx = kx - k;
    // (v runs up the slope, so the bottom of a course, where it laps over the one below, is at fy = 1 in canvas terms)
    const roll = Math.sin(fx * Math.PI), gap = Math.min(1, Math.min(fx, 1 - fx) * 30), lap = fy > 0.88 ? (1 - fy) / 0.12 : 1;
    const h = (0.25 + 0.6 * fy) * lap * (0.7 + 0.3 * roll) * gap; H[y * S + x] = h;
    const sh = shade[(r * (cols + 1) + ((k % cols) + cols) % cols)], L = bil(lich, 64, x / S, y / S), moss = clamp((L - 0.62) * 4, 0, 1) * (rnd() < 0.5 ? 1 : 0.6);
    let v = sh * (0.62 + 0.3 * roll + 0.12 * fy) * (fy > 0.88 ? 0.55 : 1) * (gap < 0.5 ? 0.45 : 1) * (0.94 + rnd() * 0.12);
    const o = (y * S + x) * 4; img.data[o] = clamp(v * (230 - moss * 90), 0, 255); img.data[o + 1] = clamp(v * (226 - moss * 40), 0, 255); img.data[o + 2] = clamp(v * (220 - moss * 120), 0, 255); img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = tex(c); t.normalMap = normalFromHeight(H, S, S, 4 * K); return t;
}

// A balcony railing: a top rail and thin vertical bars, cut out of a quad.
export function railTex() {
  const [c, g] = mk(128, 64);
  g.clearRect(0, 0, 128, 64);
  g.fillStyle = '#2a2d30'; g.fillRect(0, 2, 128, 7);
  g.fillStyle = '#8a929a'; for (let x = 4; x < 128; x += 8) g.fillRect(x, 9, 2.5, 52);
  g.fillStyle = '#2a2d30'; g.fillRect(0, 58, 128, 6);
  return tex(c, true, true);
}

// Shop signs: 32 made-up names in a 4 x 8 atlas of 512 x 256 cells.
export const SIGN_NAMES = ['DINER', 'TACOS', 'MOTEL', 'DONUTS', 'PIZZA', 'COFFEE', 'TIRES', 'GARAGE', 'BURGERS', 'LAUNDRY', 'SUSHI', 'BOWLING', 'VIDEO', 'GYM', 'BAKERY', 'AUTO PARTS'];
// The last four cells of the atlas are for the civic buildings: a bank, a hotel, a cinema, a cash machine.
export const SPECIAL_NAMES = ['PETROL', '24H SHOP', 'JEWELLER', 'MUSEUM', 'BANK', 'HOTEL', 'CINEMA', 'ATM'];       // (cells 24 to 31: the four places you can walk into, then the bank, hotel, cinema and cash machine)
const SPECIAL_SCHEMES = [{ bg: '#b0121a', fg: '#ffffff', glow: '#ffd27a' }, { bg: '#0b5a30', fg: '#ffffff', glow: '#9dffb8' }, { bg: '#0c0a10', fg: '#f4d27a', glow: '#f4d27a' }, { bg: '#2a1442', fg: '#ffe3a8', glow: '#d9a6ff' }, { bg: '#0d3b2a', fg: '#f2d27a', glow: '#f2d27a' }, { bg: '#101a3a', fg: '#f4e2a8', glow: '#f4e2a8' }, { bg: '#1a0a1c', fg: '#ff5ac8', glow: '#ff5ac8' }, { bg: '#0a3c8c', fg: '#ffffff', glow: '#9fd0ff' }];
export function signAtlas() {
  const [c, g] = mk(2048, 2048);
  const schemes = [
    { bg: '#b8161d', fg: '#fff3d6', glow: '#ffd27a' }, { bg: '#f2c230', fg: '#2a1408', glow: '#fff1a0' },
    { bg: '#151018', fg: '#ff4fa8', glow: '#ff4fa8' }, { bg: '#0f1720', fg: '#4ff3ff', glow: '#4ff3ff' },
  ];
  for (let n = 0; n < 32; n++) {
    const col = n % 4, row = (n / 4) | 0, x = col * 512, y = row * 256;
    const special = n >= 24, police = n === 23, motors = n === 22, s = police ? { bg: '#0c1f4a', fg: '#ffffff', glow: '#7fb0ff' } : motors ? { bg: '#0b0c0e', fg: '#f2f4f6', glow: '#a8d8ff' } : special ? SPECIAL_SCHEMES[n - 24] : schemes[(n + row) % 4], name = police ? 'POLICE' : motors ? 'SUNSET MOTORS' : special ? SPECIAL_NAMES[n - 24] : SIGN_NAMES[n % 16];      // (cell 23: a police station's; 22: the car dealership's)
    g.fillStyle = s.bg; g.fillRect(x + 8, y + 8, 496, 240);
    g.strokeStyle = s.glow; g.lineWidth = 10; g.strokeRect(x + 24, y + 24, 464, 208);
    g.font = `900 ${name.length > 11 ? 66 : name.length > 7 ? 76 : 104}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = s.glow; g.shadowBlur = 26; g.fillStyle = s.fg; g.fillText(name, x + 256, y + 132); g.shadowBlur = 0;
  }
  const t = tex(c, true, false); t.generateMipmaps = true; return t;
}

export function textPanel(w, h, draw) { const [c, g] = mk(w, h); draw(g, w, h); return tex(c, true, false); }

// Overhead road signs: 16 destinations in a 2 x 8 atlas of 512 x 160 cells.
export const GANTRY_NAMES = [['SUNSET BLVD', 'DOWNTOWN  ↑'], ['OCEAN AVE', 'THE BEACH  ←'], ['CENTRAL', 'CITY HALL  ↑'], ['RING ROAD', 'ALL LANES  ↑'], ['HILLSIDE', 'LOOKOUT  →'], ['MARINA', 'HARBOUR  ←'], ['AIRPORT', 'TERMINALS  ↑'], ['STADIUM', 'EXIT 4  →']];
export function gantryAtlas() {
  const [c, g] = mk(1024, 1280);
  for (let n = 0; n < 16; n++) {
    const [a, b] = GANTRY_NAMES[n % 8], x = (n % 2) * 512, y = ((n / 2) | 0) * 160;
    g.fillStyle = '#0d6b3d'; g.fillRect(x, y, 512, 160);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 6; g.strokeRect(x + 10, y + 10, 492, 140);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 54px "Barlow", Arial, sans-serif'; g.fillText(a, x + 256, y + 68);
    g.font = '600 32px "Barlow", Arial, sans-serif'; g.fillText(b, x + 256, y + 120);
  }
  return tex(c, true, false);
}

export function billboardTex() {
  return textPanel(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2a0b3d'); gr.addColorStop(0.55, '#c2185b'); gr.addColorStop(1, '#ff9e3d');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,220,150,0.9)'; g.beginPath(); g.arc(w * 0.78, h * 0.62, 120, 0, 6.29); g.fill();
    g.fillStyle = '#16051f'; g.fillRect(0, h * 0.68, w, h * 0.32);
    g.fillStyle = '#fff'; g.font = 'italic 900 110px "Barlow Condensed", Arial, sans-serif'; g.textBaseline = 'middle';
    g.fillText('MUSHTAQ', 60, h * 0.27); g.fillStyle = '#ffd36b'; g.fillText('RACING', 60, h * 0.5);
    g.fillStyle = '#ffffffcc'; g.font = '600 46px "Barlow", Arial, sans-serif'; g.fillText('SUNSET CITY  ·  OPEN ALL NIGHT', 60, h * 0.84);
  });
}

export function plateTex() {
  return textPanel(256, 128, (g, w, h) => {
    g.fillStyle = '#e8c21c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#121212'; g.font = 'italic 900 50px "Barlow Condensed", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MUSHTAQ', w / 2, h * 0.5);
  });
}

// Soft cloud puff (white, tinted per sprite).
export function puffTex() {
  const S = 256, [c, g] = mk(S); const img = g.createImageData(S, S); const rnd = mulberry32(51);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x / S - 0.5, dy = y / S - 0.5, r = Math.hypot(dx, dy) * 2;
    const n = tfbm(x / S * 5, y / S * 5, 5, 4, 77);
    const a = clamp((1 - r) * 1.6 * (0.45 + n * 0.9) - 0.15, 0, 1);
    const v = 0.82 + n * 0.18 - dy * 0.25 + (rnd() - 0.5) * 0.02;
    const o = (y * S + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = clamp(v, 0, 1) * 255; img.data[o + 3] = a * 255;
  }
  g.putImageData(img, 0, 0); return tex(c, true, false);
}

// A round contact shadow (under a person's feet): dark in the middle, soft at the edge. Filled pixel by pixel: the same thing drawn with the canvas's
// gradient tool came out blank on the graphics card (a gradient of black that only changes in transparency), so the people had no shadow at all.
const _blobs = new Map();
export function blobTex(core = 0.72, mid = 0.36) {
  const key = core + ',' + mid; if (_blobs.has(key)) return _blobs.get(key);
  const S = 64, [c, g] = mk(S), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.min(1, Math.hypot((x + 0.5) / S * 2 - 1, (y + 0.5) / S * 2 - 1)), a = r < 0.42 ? core + (mid - core) * r / 0.42 : mid * (1 - (r - 0.42) / 0.58) ** 1.6, o = (y * S + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 0; img.data[o + 3] = 255 * a;
  }
  g.putImageData(img, 0, 0); const t = tex(c, false, false); _blobs.set(key, t); return t;
}
// A car's contact shadow on the road (for a quad a little bigger than the car): dark right under the body, where no light reaches, fading softly out
// past its outline. A plain radial blob was only a faint smudge where it shows, round the car's edges, so the car seemed to hover.
let _carShadow = null;
export function carShadowTex() {
  if (_carShadow) return _carShadow;
  const W = 64, H = 128, [c, g] = mk(W, H), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = Math.abs((x + 0.5) / W * 2 - 1), v = Math.abs((y + 0.5) / H * 2 - 1), r = 0.22;
    const qx = u - (0.62 - r), qy = v - (0.72 - r), sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    const k = clamp(1 - (sd + 0.06) / 0.32, 0, 1), o = (y * W + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 0; img.data[o + 3] = 255 * 0.82 * k * k * (3 - 2 * k);
  }
  g.putImageData(img, 0, 0); return (_carShadow = tex(c, false, false));
}

export function glowTex() {
  const [c, g] = mk(128); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return tex(c, true, false);
}

// A cluster of leaves on a transparent background, for tree crowns.
export function leafTex() {
  // A spray of leaves: each with its own shade (some yellower, some deeper green, a few turning), a pale midrib and veins, and a lighter
  // edge, over a darker layer behind so the clump has depth.
  const S = 512, [c, g] = mk(S); const rnd = mulberry32(61);
  g.clearRect(0, 0, S, S);
  const leaf = (x, y, len, ang, l, depth) => {
    const warm = rnd(), hue = warm < 0.12 ? [150, 130, 40] : warm < 0.5 ? [86, 128, 36] : [58, 108, 40];
    g.save(); g.translate(x, y); g.rotate(ang);
    const grd = g.createLinearGradient(0, -len / 4, 0, len / 4); grd.addColorStop(0, `rgb(${hue[0] * l * 1.18 | 0},${hue[1] * l * 1.18 | 0},${hue[2] * l * 1.1 | 0})`); grd.addColorStop(1, `rgb(${hue[0] * l * 0.78 | 0},${hue[1] * l * 0.8 | 0},${hue[2] * l * 0.8 | 0})`);
    g.fillStyle = grd; g.beginPath(); g.moveTo(-len / 2, 0); g.quadraticCurveTo(-len * 0.1, -len * 0.3, len / 2, 0); g.quadraticCurveTo(-len * 0.1, len * 0.3, -len / 2, 0); g.fill();
    g.strokeStyle = `rgba(${200 * l | 0},${215 * l | 0},${120 * l | 0},0.45)`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke();
    g.lineWidth = 0.7; g.strokeStyle = `rgba(30,60,20,0.35)`; for (let v = -0.3; v <= 0.35; v += 0.18) { g.beginPath(); g.moveTo(len * v, 0); g.lineTo(len * (v + 0.18), -len * 0.17); g.moveTo(len * v, 0); g.lineTo(len * (v + 0.18), len * 0.17); g.stroke(); }
    g.restore();
  };
  for (let i = 0; i < 300; i++) { const r = Math.sqrt(rnd()) * S * 0.45, a = rnd() * 6.28; leaf(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 34 + rnd() * 30, rnd() * 6.28, 0.42 + rnd() * 0.2); }   // behind: darker
  for (let i = 0; i < 380; i++) { const r = Math.sqrt(rnd()) * S * 0.46, a = rnd() * 6.28; leaf(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 30 + rnd() * 34, rnd() * 6.28, 0.62 + rnd() * 0.42); }
  return tex(c, true, false);
}

// A sprig of small flowers (cream, to be tinted pink, red, orange, violet or white per bush) among a few leaves, for the flowering shrubs (bougainvillea and hibiscus).
export function flowerTex() {
  const S = 256, [c, g] = mk(S); const rnd = mulberry32(88);
  g.clearRect(0, 0, S, S);
  const flower = (x, y, r) => {
    g.save(); g.translate(x, y); g.rotate(rnd() * 6.28);
    for (let k = 0; k < 5; k++) {
      g.rotate(Math.PI * 2 / 5); const l = 0.8 + rnd() * 0.25;
      const gr = g.createRadialGradient(0, -r * 0.5, 1, 0, -r * 0.5, r * 0.75); gr.addColorStop(0, 'rgb(255,250,244)'); gr.addColorStop(1, 'rgb(' + (205 * l | 0) + ',' + (190 * l | 0) + ',' + (196 * l | 0) + ')');
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, -r * 0.55, r * 0.42, r * 0.62, 0, 0, 7); g.fill();
    }
    g.fillStyle = 'rgb(255,226,150)'; g.beginPath(); g.arc(0, 0, r * 0.2, 0, 7); g.fill();
    g.restore();
  };
  for (let i = 0; i < 70; i++) { const r = Math.sqrt(rnd()) * S * 0.43, a = rnd() * 6.28, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r; g.fillStyle = 'rgba(44,92,34,0.95)'; g.beginPath(); g.ellipse(x, y, 15, 7, rnd() * 6.28, 0, 7); g.fill(); }
  for (let i = 0; i < 46; i++) { const r = Math.sqrt(rnd()) * S * 0.4, a = rnd() * 6.28; flower(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 13 + rnd() * 9); }
  return tex(c, true, false);
}

export function frondTex() {
  // Palm fronds, two in one texture: on the left a living frond, on the right a dead one (the dry brown skirt that hangs under the crown). Each is a pale
  // midrib with many narrow pointed leaflets along it, each leaflet folded (lighter on one half, darker on the other), its tip a little yellow or torn,
  // in greens that vary from leaflet to leaflet. The leaflets overlap near the rib (so the frond stays solid when shrunk for a palm far away) and part
  // towards their tips (so a near palm shows the sky between them).
  const [c, g] = mk(256, 512), rnd = mulberry32(73);
  g.clearRect(0, 0, 256, 512);
  const frond = (x0, dead) => {
    for (let y = 2; y < 508; y += 5.2) {
      const t = y / 512, len = 58 * Math.sin(Math.PI * (0.06 + 0.94 * t)) + 8;
      for (const s of [-1, 1]) {
        const l = len * (0.82 + rnd() * 0.3), droop = 18 + rnd() * 16, tipx = x0 + s * l, tipy = y + droop, w = 3.4 + rnd() * 1.2;
        const v = 0.82 + rnd() * 0.36, torn = !dead && rnd() < 0.05;
        const base = dead ? [150 * v, 112 * v, 66 * v] : [58 * v + rnd() * 18, 98 * v + rnd() * 16, 38 * v], tip = dead ? [128 * v, 92 * v, 52 * v] : [118 * v, 128 * v, 52 * v];
        const gr = g.createLinearGradient(x0, y, tipx, tipy);
        gr.addColorStop(0, `rgb(${base[0] * 0.8 | 0},${base[1] * 0.8 | 0},${base[2] * 0.8 | 0})`); gr.addColorStop(0.55, `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`); gr.addColorStop(1, `rgb(${tip[0] | 0},${tip[1] | 0},${tip[2] | 0})`);
        g.fillStyle = gr; g.beginPath(); g.moveTo(x0, y - w * 0.6);
        g.quadraticCurveTo(x0 + s * l * 0.5, y - w * 0.8 + droop * 0.15, torn ? x0 + s * l * 0.7 : tipx, torn ? y + droop * 0.6 : tipy);
        g.quadraticCurveTo(x0 + s * l * 0.48, y + w * 1.1 + droop * 0.3, x0, y + w * 0.8); g.closePath(); g.fill();
        g.strokeStyle = dead ? 'rgba(70,45,22,0.55)' : 'rgba(20,46,12,0.55)'; g.lineWidth = 0.9;                // (the fold down the middle)
        g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo(x0 + s * l * 0.5, y + droop * 0.2, torn ? x0 + s * l * 0.7 : tipx, torn ? y + droop * 0.6 : tipy); g.stroke();
      }
    }
    const rib = g.createLinearGradient(x0 - 4, 0, x0 + 4, 0); rib.addColorStop(0, dead ? '#6a5030' : '#7d8a44'); rib.addColorStop(0.5, dead ? '#b89a68' : '#c4c483'); rib.addColorStop(1, dead ? '#5a4228' : '#68743a');
    g.fillStyle = rib; g.beginPath(); g.moveTo(x0 - 4.5, 512); g.lineTo(x0 - 1.2, 0); g.lineTo(x0 + 1.2, 0); g.lineTo(x0 + 4.5, 512); g.closePath(); g.fill();
  };
  frond(64, false); frond(192, true);
  return tex(c, true, false);
}

// A spray of small, glossy shrub leaves (pittosporum, box, ficus): ovate leaves of 3 to 6 cm on a card of about 40 cm, a darker layer behind for depth,
// each leaf with its own green, a lighter upper half where it catches the light and a pale midrib. The spray thins out towards the edge of the card, so the
// card's outline never shows.
export function bushLeafTex() {
  const S = 512, [c, g] = mk(S); const rnd = mulberry32(64);
  g.clearRect(0, 0, S, S);
  const leaf = (x, y, len, ang, l, warm) => {
    const hue = warm < 0.06 ? [132, 128, 44] : warm < 0.4 ? [64, 112, 36] : warm < 0.8 ? [46, 96, 36] : [38, 84, 44], w = len * (0.36 + rnd() * 0.12);
    g.save(); g.translate(x, y); g.rotate(ang);
    const grd = g.createLinearGradient(0, -w, 0, w);
    grd.addColorStop(0, `rgb(${hue[0] * l * 1.25 | 0},${hue[1] * l * 1.22 | 0},${hue[2] * l * 1.1 | 0})`); grd.addColorStop(0.5, `rgb(${hue[0] * l | 0},${hue[1] * l | 0},${hue[2] * l | 0})`); grd.addColorStop(1, `rgb(${hue[0] * l * 0.7 | 0},${hue[1] * l * 0.72 | 0},${hue[2] * l * 0.72 | 0})`);
    g.fillStyle = grd; g.beginPath(); g.moveTo(-len / 2, 0); g.bezierCurveTo(-len * 0.2, -w * 1.25, len * 0.3, -w * 0.9, len / 2, 0); g.bezierCurveTo(len * 0.3, w * 0.9, -len * 0.2, w * 1.25, -len / 2, 0); g.fill();
    g.strokeStyle = `rgba(${170 * l | 0},${190 * l | 0},${110 * l | 0},0.5)`; g.lineWidth = 1; g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len * 0.42, 0); g.stroke();
    g.fillStyle = `rgba(255,255,240,${0.08 + rnd() * 0.1})`; g.beginPath(); g.ellipse(-len * 0.05, -w * 0.35, len * 0.22, w * 0.22, 0, 0, 7); g.fill();       // (a glint on the waxy upper half)
    g.restore();
  };
  // A few twigs first, then the dark leaves behind, then the leaves in front, densest in the middle.
  g.strokeStyle = 'rgba(52,40,28,0.9)'; g.lineWidth = 2.2;
  for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, r = S * (0.25 + rnd() * 0.2); g.beginPath(); g.moveTo(S / 2, S / 2); g.quadraticCurveTo(S / 2 + Math.cos(a + 0.3) * r * 0.5, S / 2 + Math.sin(a + 0.3) * r * 0.5, S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); g.stroke(); }
  const at = (k) => { const r = Math.pow(rnd(), 0.62) * S * 0.44 * k, a = rnd() * 6.28; return [S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r]; };
  for (let i = 0; i < 230; i++) { const [x, y] = at(0.95); leaf(x, y, 30 + rnd() * 26, rnd() * 6.28, 0.34 + rnd() * 0.16, rnd()); }
  for (let i = 0; i < 300; i++) { const [x, y] = at(1); leaf(x, y, 30 + rnd() * 30, rnd() * 6.28, 0.62 + rnd() * 0.42, rnd()); }
  return tex(c, true, false);
}

// A clipped hedge seen close: a dense wall of small leaves over the dark of the twigs inside, tiling seamlessly (one copy is a metre square), with a
// normal map so the leaves stand out from the gaps between them.
export function hedgeTex() {
  const S = sz(512), K = S / 512, rnd = mulberry32(65);
  const [c, g] = mk(S), [ch, gh] = mk(S);
  g.fillStyle = '#0c1608'; g.fillRect(0, 0, S, S); gh.fillStyle = '#000'; gh.fillRect(0, 0, S, S);
  const leaf = (x, y, len, ang, l, layer) => {
    const hue = rnd() < 0.06 ? [120, 122, 46] : rnd() < 0.5 ? [58, 104, 34] : [44, 92, 36], w = len * 0.42;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {                     // (drawn again across each edge, so the texture tiles)
      if (x + ox < -len || x + ox > S + len || y + oy < -len || y + oy > S + len) continue;
      for (const [gg, hh] of [[g, false], [gh, true]]) {
        gg.save(); gg.translate(x + ox, y + oy); gg.rotate(ang);
        if (hh) { const v = 60 + layer * 60 + l * 40; gg.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`; }
        else { const grd = gg.createLinearGradient(0, -w, 0, w); grd.addColorStop(0, `rgb(${hue[0] * l * 1.2 | 0},${hue[1] * l * 1.2 | 0},${hue[2] * l * 1.1 | 0})`); grd.addColorStop(1, `rgb(${hue[0] * l * 0.72 | 0},${hue[1] * l * 0.74 | 0},${hue[2] * l * 0.74 | 0})`); gg.fillStyle = grd; }
        gg.beginPath(); gg.moveTo(-len / 2, 0); gg.bezierCurveTo(-len * 0.2, -w * 1.2, len * 0.3, -w * 0.9, len / 2, 0); gg.bezierCurveTo(len * 0.3, w * 0.9, -len * 0.2, w * 1.2, -len / 2, 0); gg.fill();
        gg.restore();
      }
    }
  };
  for (let i = 0; i < 1500; i++) leaf(rnd() * S, rnd() * S, (12 + rnd() * 10) * K, rnd() * 6.28, 0.32 + rnd() * 0.2, 0);
  for (let i = 0; i < 2400; i++) leaf(rnd() * S, rnd() * S, (13 + rnd() * 11) * K, rnd() * 6.28, 0.6 + rnd() * 0.45, 1 + rnd());
  const hd = gh.getImageData(0, 0, S, S).data, Hf = new Float32Array(S * S); for (let i = 0; i < S * S; i++) Hf[i] = hd[i * 4] / 255;
  return { map: tex(c), normalMap: normalFromHeight(Hf, S, S, 3.2) };
}

// Palm bark: the rings of old leaf scars, a little wavy and uneven, about 12 cm apart, with fibres running up between them; one copy covers 1.5 m of
// trunk and once round it. Tree bark: grey-brown, split into long furrows and ridges.
export function palmBarkTex() {
  const W = 128, H = 256, rnd = mulberry32(66), [c, g] = mk(W, H), img = g.createImageData(W, H), Hf = new Float32Array(W * H), f = lowField(64, 6, 3, 67);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, n = bil(f, 64, u, v * 4), wav = Math.sin(u * 6.283 * 2 + v * 40) * 0.012 + (n - 0.5) * 0.03;
    const ring = (v * 12 + wav) % 1, scar = Math.exp(-Math.pow((ring - 0.15) / 0.05, 2)), lip = Math.exp(-Math.pow((ring - 0.25) / 0.06, 2));
    const fib = Math.sin(u * 6.283 * 34 + n * 9) * 0.5 + 0.5, grain = rnd();
    const h = 0.55 - scar * 0.45 + lip * 0.2 + fib * 0.06 + (grain - 0.5) * 0.06; Hf[y * W + x] = h;
    const k = 0.78 + (n - 0.5) * 0.3 + fib * 0.07 - scar * 0.38 + lip * 0.1 + (grain - 0.5) * 0.08;
    const o = (y * W + x) * 4; img.data[o] = clamp(146 * k, 0, 255); img.data[o + 1] = clamp(128 * k, 0, 255); img.data[o + 2] = clamp(106 * k, 0, 255); img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { map: tex(c), normalMap: normalFromHeight(Hf, W, H, 2.2) };
}
export function barkTex() {
  const W = 128, H = 256, rnd = mulberry32(68), [c, g] = mk(W, H), img = g.createImageData(W, H), Hf = new Float32Array(W * H), f = lowField(64, 8, 3, 69), f2 = lowField(64, 3, 2, 70);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, n = bil(f, 64, u * 1, v * 0.25), m = bil(f2, 64, u, v);
    const furrow = Math.pow(Math.abs(Math.sin((u * 9 + n * 1.6) * Math.PI)), 0.45), grain = rnd();
    const h = furrow * 0.8 + (grain - 0.5) * 0.1; Hf[y * W + x] = h;
    const k = 0.35 + furrow * 0.6 + (m - 0.5) * 0.3 + (grain - 0.5) * 0.1, moss = clamp((m - 0.62) * 3, 0, 1) * (1 - furrow) * 0.6;
    const o = (y * W + x) * 4; img.data[o] = clamp(118 * k * (1 - moss) + 70 * moss, 0, 255); img.data[o + 1] = clamp(104 * k * (1 - moss) + 88 * moss, 0, 255); img.data[o + 2] = clamp(90 * k * (1 - moss) + 40 * moss, 0, 255); img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { map: tex(c), normalMap: normalFromHeight(Hf, W, H, 2.6) };
}
