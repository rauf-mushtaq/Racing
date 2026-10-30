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
    const r = clamp(0.78 - (b - 0.5) * 0.5 + (grain - 0.5) * 0.1 - stone * 0.15, 0.35, 1) * 255;
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
  return { map: tex(c), roughnessMap: tex(cr, false), normalMap: normalFromHeight(H, S, S, 3) };
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

function facadeBase(cols, rows, cw, ch, seed, drawCell, normalStrength = 2.6) {
  const W = Math.round(cols * cw * TS), H = Math.round(rows * ch * TS);
  const [c, g] = mk(W, H), [ce, ge] = mk(W, H), [cr, gr] = mk(W, H);
  for (const x of [g, ge, gr]) x.scale(TS, TS);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, cols * cw, rows * ch);
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) drawCell(g, ge, gr, k * cw, r * ch, cw, ch, rnd, r, k);
  // The roughness canvas becomes a glTF-style ORM map (G = roughness, B =
  // metalness: shiny dark glass is metallic) and, as a height field, a normal map.
  const R = gr.getImageData(0, 0, W, H).data;
  const [co, go] = mk(W, H), oi = go.createImageData(W, H), od = oi.data;
  const Hf = new Float32Array(W * H), hr = mulberry32(seed + 7);
  for (let i = 0; i < W * H; i++) {
    let gray = R[i * 4];
    if (gray > 120) gray = clamp(gray + (hr() - 0.5) * 14, 0, 255);          // plaster grain
    od[i * 4] = 255; od[i * 4 + 1] = gray; od[i * 4 + 2] = gray < 70 ? 176 : 0; od[i * 4 + 3] = 255;
    Hf[i] = gray / 255;
  }
  go.putImageData(oi, 0, 0);
  const normalMap = normalFromHeight(Hf, W, H, normalStrength);
  return { map: tex(c), emissiveMap: tex(ce), ormMap: tex(co, false), normalMap };
}

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

function glassCell(g, ge, gr, x, y, w, h, rnd) {
  const sp = 64;
  g.fillStyle = vgrad(g, y, y + sp, [[0, '#6b7885'], [1, '#4b5763']]); g.fillRect(x, y, w, sp);
  g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x, y + 1, w, 2);
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, y + sp - 3, w, 3);
  gr.fillStyle = '#a4a4a4'; gr.fillRect(x, y, w, sp);
  const gy = y + sp, gh = h - sp, t = rnd();
  g.fillStyle = vgrad(g, gy, gy + gh, [[0, t < 0.5 ? '#a9cde6' : '#9fc0d8'], [0.45, '#5f88a8'], [1, '#2c465e']]);
  g.fillRect(x, gy, w, gh);
  g.fillStyle = 'rgba(20,40,60,0.28)'; g.fillRect(x, gy + gh * 0.72, w, gh * 0.28);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = 'rgba(255,255,255,0.13)'; g.beginPath(); g.moveTo(x + w * 0.2, gy); g.lineTo(x + w * 0.46, gy); g.lineTo(x + w * 0.1, gy + gh); g.lineTo(x - w * 0.16, gy + gh); g.closePath(); g.fill();
  g.restore();
  gr.fillStyle = '#141414'; gr.fillRect(x, gy, w, gh);
  for (const mx of [x, x + w / 2 - 3, x + w - 6]) {
    g.fillStyle = '#cfd4d9'; g.fillRect(mx, gy, 6, gh); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(mx + 5, gy, 1.5, gh);
    gr.fillStyle = '#8c8c8c'; gr.fillRect(mx, gy, 6, gh);
  }
  g.fillStyle = '#bfc5cb'; g.fillRect(x, gy, w, 5); gr.fillStyle = '#8c8c8c'; gr.fillRect(x, gy, w, 5);
  if (rnd() < 0.2) {
    if (rnd() < 0.7) interiorGlow(ge, x + 6, gy + 5, w / 2 - 9, gh - 5, rnd);
    if (rnd() < 0.7) interiorGlow(ge, x + w / 2 + 3, gy + 5, w / 2 - 9, gh - 5, rnd);
  }
}

function modernCell(g, ge, gr, x, y, w, h, rnd) {
  const band = 56;
  g.fillStyle = vgrad(g, y, y + band, [[0, '#f5f4ef'], [1, '#e1e0da']]); g.fillRect(x, y, w, band);
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y + band, w, 7);
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x, y, w, 2);
  gr.fillStyle = '#dcdcdc'; gr.fillRect(x, y, w, band + 7);
  const gy = y + band + 7, gh = h - band - 7;
  g.fillStyle = vgrad(g, gy, gy + gh, [[0, '#8fb0c8'], [0.5, '#5b7f9d'], [1, '#2f485f']]); g.fillRect(x, gy, w, gh);
  g.save(); g.beginPath(); g.rect(x, gy, w, gh); g.clip();
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(x + w * 0.5, gy); g.lineTo(x + w * 0.75, gy); g.lineTo(x + w * 0.35, gy + gh); g.lineTo(x + w * 0.1, gy + gh); g.closePath(); g.fill();
  g.restore();
  gr.fillStyle = '#151515'; gr.fillRect(x, gy, w, gh);
  for (let m = 0; m < 4; m++) { g.fillStyle = '#4b535b'; g.fillRect(x + m * w / 4, gy, 2.5, gh); gr.fillStyle = '#8c8c8c'; gr.fillRect(x + m * w / 4, gy, 2.5, gh); }
  if (rnd() < 0.3) { g.fillStyle = 'rgba(40,50,60,0.8)'; for (let f = 0; f < 3; f++) g.fillRect(x, gy + 6 + f * 9, w, 2); }
  if (rnd() < 0.25) interiorGlow(ge, x + 3, gy + 2, w - 6, gh - 2, rnd);
}

function aptCell(g, ge, gr, x, y, w, h, rnd) {
  g.fillStyle = '#f0ebe3'; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(x, y + h - 10, w, 10);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x, y + h - 12, w, 2);
  gr.fillStyle = '#e2e2e2'; gr.fillRect(x, y, w, h);
  const ww = 104, wh = 118, wx = x + (w - ww) / 2, wy = y + 30;
  if (rnd() < 0.3) {                                       // shutters
    const sc = ['#4e6b5a', '#6b4e3f', '#3f5875', '#7a6a4a'][(rnd() * 4) | 0];
    for (const sx of [wx - 34, wx + ww + 6]) {
      g.fillStyle = sc; g.fillRect(sx, wy - 4, 28, wh + 8);
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let l = 0; l < wh; l += 7) g.fillRect(sx + 2, wy + l, 24, 2);
      gr.fillStyle = '#b0b0b0'; gr.fillRect(sx, wy - 4, 28, wh + 8);
    }
  }
  g.fillStyle = '#e8e2d8'; g.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(wx - 8, wy - 8, ww + 16, 3); g.fillRect(wx - 8, wy - 8, 3, wh + 16);
  gr.fillStyle = '#c8c8c8'; gr.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
  g.fillStyle = vgrad(g, wy, wy + wh, [[0, '#7a93a8'], [0.5, '#4a6075'], [1, '#222f3b']]); g.fillRect(wx, wy, ww, wh);
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.moveTo(wx + 10, wy); g.lineTo(wx + 44, wy); g.lineTo(wx, wy + 60); g.lineTo(wx, wy + 30); g.fill();
  gr.fillStyle = '#1c1c1c'; gr.fillRect(wx, wy, ww, wh);
  g.fillStyle = '#f3efe7'; g.fillRect(wx + ww / 2 - 2.5, wy, 5, wh); g.fillRect(wx, wy + wh * 0.38, ww, 5);
  gr.fillStyle = '#b8b8b8'; gr.fillRect(wx + ww / 2 - 2.5, wy, 5, wh); gr.fillRect(wx, wy + wh * 0.38, ww, 5);
  g.fillStyle = '#dcd5c9'; g.fillRect(wx - 14, wy + wh + 8, ww + 28, 9);
  g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(wx - 14, wy + wh + 17, ww + 28, 5);
  gr.fillStyle = '#d0d0d0'; gr.fillRect(wx - 14, wy + wh + 8, ww + 28, 9);
  if (rnd() < 0.12) { g.fillStyle = '#c9ccce'; g.fillRect(wx + ww + 14, wy + wh + 30, 26, 18); g.fillStyle = '#9aa0a4'; for (let l = 0; l < 4; l++) g.fillRect(wx + ww + 16, wy + wh + 33 + l * 4, 22, 1.5); }
  if (rnd() < 0.25) interiorGlow(ge, wx + 2, wy + 2, ww - 4, wh - 4, rnd);
}

function brickCell(g, ge, gr, x, y, w, h, rnd) {
  const rowsN = 46, colsN = 18, bh = h / rowsN, bw = w / colsN;
  g.fillStyle = '#b8b0a2'; g.fillRect(x, y, w, h);
  gr.fillStyle = '#8c8c8c'; gr.fillRect(x, y, w, h);
  for (let r = 0; r < rowsN; r++) for (let k = 0; k < colsN + 1; k++) {
    const v = 0.78 + rnd() * 0.42, bx = x + (k - (r % 2) * 0.5) * bw;
    const x0 = Math.max(x, bx + 0.7), x1 = Math.min(x + w, bx + bw - 0.7);
    if (x1 <= x0) continue;
    g.fillStyle = `rgb(${158 * v | 0},${88 * v | 0},${66 * v | 0})`; g.fillRect(x0, y + r * bh + 0.7, x1 - x0, bh - 1.4);
    gr.fillStyle = '#e4e4e4'; gr.fillRect(x0, y + r * bh + 0.7, x1 - x0, bh - 1.4);
  }
  const ww = 96, wh = 126, wx = x + (w - ww) / 2, wy = y + 28;
  g.fillStyle = '#ece6da'; g.fillRect(wx - 12, wy - 16, ww + 24, 14);                  // lintel
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(wx - 12, wy - 3, ww + 24, 3);
  g.fillStyle = '#ece6da'; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
  gr.fillStyle = '#c4c4c4'; gr.fillRect(wx - 12, wy - 16, ww + 24, wh + 20);
  g.fillStyle = vgrad(g, wy, wy + wh, [[0, '#6c8093'], [1, '#202a33']]); g.fillRect(wx, wy, ww, wh);
  gr.fillStyle = '#1c1c1c'; gr.fillRect(wx, wy, ww, wh);
  g.fillStyle = '#ece6da'; g.fillRect(wx, wy + wh / 2 - 2.5, ww, 5); g.fillRect(wx + ww / 2 - 2.5, wy, 5, wh);
  g.fillStyle = '#d8d1c4'; g.fillRect(wx - 14, wy + wh + 4, ww + 28, 10);            // sill
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(wx - 14, wy + wh + 14, ww + 28, 4);
  if (rnd() < 0.24) interiorGlow(ge, wx + 2, wy + 2, ww - 4, wh - 4, rnd);
}

function houseCell(g, ge, gr, x, y, w, h, rnd) {
  // 8 m x 6 m: two floors of plaster, windows and a door, on a stone base.
  g.fillStyle = '#efeae0'; g.fillRect(x, y, w, h);
  gr.fillStyle = '#e0e0e0'; gr.fillRect(x, y, w, h);
  g.fillStyle = '#8f877b'; g.fillRect(x, y + h - 26, w, 26); gr.fillStyle = '#c0c0c0'; gr.fillRect(x, y + h - 26, w, 26);
  g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(x, y + h * 0.5 - 4, w, 8);
  const win = (wx, wy, ww, wh) => {
    g.fillStyle = '#f4f0e8'; g.fillRect(wx - 7, wy - 7, ww + 14, wh + 14);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(wx - 7, wy - 7, ww + 14, 3);
    g.fillStyle = vgrad(g, wy, wy + wh, [[0, '#7e97ab'], [1, '#243240']]); g.fillRect(wx, wy, ww, wh);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.moveTo(wx + 6, wy); g.lineTo(wx + ww * 0.45, wy); g.lineTo(wx, wy + wh * 0.5); g.lineTo(wx, wy + wh * 0.25); g.fill();
    g.fillStyle = '#f4f0e8'; g.fillRect(wx + ww / 2 - 2, wy, 4, wh); g.fillRect(wx, wy + wh * 0.45, ww, 4);
    g.fillStyle = '#d6d0c4'; g.fillRect(wx - 10, wy + wh + 7, ww + 20, 7);
    gr.fillStyle = '#c0c0c0'; gr.fillRect(wx - 7, wy - 7, ww + 14, wh + 14);
    gr.fillStyle = '#1c1c1c'; gr.fillRect(wx, wy, ww, wh);
    if (rnd() < 0.3) interiorGlow(ge, wx + 2, wy + 2, ww - 4, wh - 4, rnd);
  };
  win(70, 40, 80, 84); win(w - 150, 40, 80, 84);
  win(70, h - 150, 80, 96);
  const dc = ['#5b3a29', '#2f4a5a', '#7a2a2a', '#3b3b3b'][(rnd() * 4) | 0];
  g.fillStyle = '#f4f0e8'; g.fillRect(w - 190, h - 190, 100, 164); g.fillStyle = dc; g.fillRect(w - 182, h - 182, 84, 156);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(w - 174, h - 170, 30, 60); g.fillRect(w - 136, h - 170, 30, 60); g.fillRect(w - 174, h - 100, 30, 60); g.fillRect(w - 136, h - 100, 30, 60);
  g.fillStyle = '#d9c36a'; g.fillRect(w - 112, h - 106, 6, 14);
  g.fillStyle = '#b8b2a6'; g.fillRect(w - 200, h - 26, 120, 12);
  gr.fillStyle = '#b0b0b0'; gr.fillRect(w - 190, h - 190, 100, 164);
}

function shopBay(g, ge, gr, x, y, w, h, rnd, r, k) {
  g.fillStyle = '#efe9e0'; g.fillRect(x, y, w, h);
  gr.fillStyle = '#e0e0e0'; gr.fillRect(x, y, w, h);
  g.fillStyle = '#e4ddd2'; g.fillRect(x, y + 58, w, 12); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + 70, w, 4);
  const sx = x + 12, sw = w - 24, sy = y + 150, sh = h - 150 - 30;
  g.fillStyle = '#2b2b2e'; g.fillRect(sx - 6, sy - 6, sw + 12, sh + 12);
  g.fillStyle = vgrad(g, sy, sy + sh, [[0, '#566673'], [0.6, '#2c3640'], [1, '#1c232a']]); g.fillRect(sx, sy, sw, sh);
  g.fillStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); g.moveTo(sx + sw * 0.1, sy); g.lineTo(sx + sw * 0.35, sy); g.lineTo(sx + sw * 0.05, sy + sh); g.lineTo(sx, sy + sh); g.lineTo(sx, sy + sh * 0.3); g.fill();
  gr.fillStyle = '#202020'; gr.fillRect(sx - 6, sy - 6, sw + 12, sh + 12); gr.fillStyle = '#141414'; gr.fillRect(sx, sy, sw, sh);
  g.fillStyle = '#2b2b2e'; for (let m = 1; m < 4; m++) g.fillRect(sx + m * sw / 4 - 2.5, sy, 5, sh);
  gr.fillStyle = '#505050'; for (let m = 1; m < 4; m++) gr.fillRect(sx + m * sw / 4 - 2.5, sy, 5, sh);
  if (k === 1) { g.fillStyle = '#16181a'; g.fillRect(sx + sw * 0.36, sy + 12, sw * 0.28, sh - 12); g.fillStyle = '#c8ccd0'; g.fillRect(sx + sw * 0.6, sy + sh * 0.5, 4, 26); }
  const warm = ['#ffd9a8', '#fff0d0', '#ffcf9a'][k % 3];
  const eg = ge.createLinearGradient(0, sy, 0, sy + sh); eg.addColorStop(0, warm); eg.addColorStop(1, '#6b4a2a');
  ge.globalAlpha = 0.55 + rnd() * 0.45; ge.fillStyle = eg; ge.fillRect(sx, sy, sw, sh); ge.globalAlpha = 1;
  ge.fillStyle = '#000'; for (let m = 1; m < 4; m++) ge.fillRect(sx + m * sw / 4 - 2.5, sy, 5, sh);
  // Awning with a scalloped edge.
  const ac = ['#b23a3a', '#2f6b5a', '#c9a227'][k % 3];
  g.fillStyle = ac; g.fillRect(sx - 10, sy - 42, sw + 20, 30);
  g.fillStyle = 'rgba(255,255,255,0.4)'; for (let s = 0; s < sw + 20; s += 36) g.fillRect(sx - 10 + s, sy - 42, 18, 30);
  g.fillStyle = ac; for (let s = 0; s < sw + 20; s += 18) { g.beginPath(); g.arc(sx - 10 + s + 9, sy - 12, 9, 0, Math.PI); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(sx - 10, sy - 14, sw + 20, 3);
  g.fillStyle = '#3a3a3e'; g.fillRect(x, y + h - 30, w, 30); gr.fillStyle = '#707070'; gr.fillRect(x, y + h - 30, w, 30);
}

export function facadeGlass() { return { ...facadeBase(4, 4, 256, 224, 17, glassCell, 2.2), w: 16, h: 14 }; }
export function facadeModern() { return { ...facadeBase(4, 4, 256, 224, 53, modernCell, 2.6), w: 16, h: 14 }; }
export function facadeApartment() { return { ...facadeBase(4, 4, 256, 224, 29, aptCell, 3), w: 16, h: 14 }; }
export function facadeBrick() { return { ...facadeBase(4, 4, 256, 224, 43, brickCell, 3.4), w: 16, h: 14 }; }
export function facadeHouse() { return { ...facadeBase(1, 1, 512, 384, 61, houseCell, 3), w: 8, h: 6 }; }
export function facadeShop() { return { ...facadeBase(3, 1, 341, 448, 37, shopBay, 2.4), w: 12, h: 5.25 }; }

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

// Terracotta barrel tiles for pitched roofs (one repeat is about 5 m).
export function roofTileTex() {
  const S = sz(512), rnd = mulberry32(14); const [c, g] = mk(S);
  g.fillStyle = '#6a3a2a'; g.fillRect(0, 0, S, S);
  const rows = 16, cols = 16, th = S / rows, tw = S / cols;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols + 1; k++) {
    const x = (k - (r % 2) * 0.5) * tw, y = r * th, v = 0.8 + rnd() * 0.4;
    const gr = g.createLinearGradient(0, y, 0, y + th);
    gr.addColorStop(0, `rgb(${178 * v | 0},${96 * v | 0},${66 * v | 0})`); gr.addColorStop(1, `rgb(${120 * v | 0},${60 * v | 0},${44 * v | 0})`);
    g.fillStyle = gr; rr(g, x + 1, y + 1, tw - 2, th * 1.25, tw * 0.3); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x + 1, y + th - 3, tw - 2, 3);
  }
  return tex(c);
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
export function signAtlas() {
  const [c, g] = mk(2048, 2048);
  const schemes = [
    { bg: '#b8161d', fg: '#fff3d6', glow: '#ffd27a' }, { bg: '#f2c230', fg: '#2a1408', glow: '#fff1a0' },
    { bg: '#151018', fg: '#ff4fa8', glow: '#ff4fa8' }, { bg: '#0f1720', fg: '#4ff3ff', glow: '#4ff3ff' },
  ];
  for (let n = 0; n < 32; n++) {
    const col = n % 4, row = (n / 4) | 0, x = col * 512, y = row * 256;
    const s = schemes[(n + row) % 4], name = SIGN_NAMES[n % 16];
    g.fillStyle = s.bg; g.fillRect(x + 8, y + 8, 496, 240);
    g.strokeStyle = s.glow; g.lineWidth = 10; g.strokeRect(x + 24, y + 24, 464, 208);
    g.font = `900 ${name.length > 7 ? 76 : 104}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
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

export function glowTex() {
  const [c, g] = mk(128); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return tex(c, true, false);
}

// A cluster of leaves on a transparent background, for tree crowns.
export function leafTex() {
  const S = 512, [c, g] = mk(S); const rnd = mulberry32(61);
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 520; i++) {
    const r = Math.sqrt(rnd()) * S * 0.46, a = rnd() * 6.28;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, len = 20 + rnd() * 26;
    const l = 0.5 + rnd() * 0.5;
    g.save(); g.translate(x, y); g.rotate(rnd() * 6.28);
    g.fillStyle = `rgb(${(58 + rnd() * 34) * l | 0},${(108 + rnd() * 54) * l | 0},${(34 + rnd() * 22) * l | 0})`;
    g.beginPath(); g.ellipse(0, 0, len / 2, len / 4.2, 0, 0, 6.28); g.fill();
    g.strokeStyle = 'rgba(30,60,18,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke();
    g.restore();
  }
  return tex(c, true, false);
}

export function frondTex() {
  const [c, g] = mk(128, 512);
  g.clearRect(0, 0, 128, 512);
  g.strokeStyle = '#9a9a52'; g.lineWidth = 5; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 512); g.stroke();
  for (let y = 10; y < 500; y += 11) {
    const len = 58 * Math.sin(Math.PI * (y / 512)) + 8;
    for (const s of [-1, 1]) {
      const t = (y / 11) % 2;
      g.strokeStyle = t ? '#5d8a32' : '#75a040'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + s * len * 0.6, y + 10, 64 + s * len, y + 30); g.stroke();
      g.strokeStyle = 'rgba(30,60,16,0.45)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + s * len * 0.6, y + 10, 64 + s * len, y + 30); g.stroke();
    }
  }
  return tex(c, true, false);
}
