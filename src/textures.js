// Every texture in the game is drawn here on canvases at start-up, so the game
// needs nothing but Three.js from the network.
import * as THREE from 'three';
import { mulberry32, tfbm, clamp } from './util.js';

let aniso = 4;
export function setAnisotropy(a) { aniso = a; }

function mk(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
// Normal map from a height field (tileable).
function normalFromHeight(H, size, strength) {
  const [c, g] = mk(size); const img = g.createImageData(size, size); const d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = (x - 1 + size) % size, xr = (x + 1) % size, yu = (y - 1 + size) % size, yd = (y + 1) % size;
    const dx = (H[y * size + xr] - H[y * size + xl]) * strength, dy = (H[yd * size + x] - H[yu * size + x]) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return tex(c, false);
}

// Road asphalt: fine grain, stones, darker patches, the odd crack and tar seam.
export function asphalt(size = 512) {
  const rnd = mulberry32(11);
  const [c, g] = mk(size), [cr, gr] = mk(size);
  const img = g.createImageData(size, size), rim = gr.createImageData(size, size);
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, nx = x / size, ny = y / size;
    const big = tfbm(nx * 4, ny * 4, 4, 4, 3), mid = tfbm(nx * 24, ny * 24, 24, 2, 9);
    const grain = rnd(), stone = rnd() < 0.015 ? rnd() : 0;
    const v = 0.22 + big * 0.07 + mid * 0.03 + (grain - 0.5) * 0.06 + stone * 0.16;
    H[i] = grain * 0.5 + stone * 1.2 + mid * 0.6;
    const o = i * 4;
    img.data[o] = clamp(v * 1.02, 0, 1) * 255; img.data[o + 1] = clamp(v, 0, 1) * 255; img.data[o + 2] = clamp(v * 1.04, 0, 1) * 255; img.data[o + 3] = 255;
    const r = clamp(0.8 - (big - 0.5) * 0.55 + (grain - 0.5) * 0.12 - stone * 0.2, 0.35, 1) * 255;
    rim.data[o] = rim.data[o + 1] = rim.data[o + 2] = r; rim.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0); gr.putImageData(rim, 0, 0);
  // A few thin dark cracks.
  for (let k = 0; k < 5; k++) {
    let x = rnd() * size, y = rnd() * size, a = rnd() * 6.28;
    g.strokeStyle = 'rgba(10,10,12,0.35)'; g.lineWidth = 0.8 + rnd();
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 22; s++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 4; y += Math.sin(a) * 4; g.lineTo(x, y); }
    g.stroke();
  }
  return { map: tex(c), roughnessMap: tex(cr, false), normalMap: normalFromHeight(H, size, 2.2) };
}

// Pavement concrete with expansion joints, tinted by the material colour.
export function concrete(size = 512, slabs = 3) {
  const rnd = mulberry32(5);
  const [c, g] = mk(size); const img = g.createImageData(size, size);
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, nx = x / size, ny = y / size;
    const big = tfbm(nx * 6, ny * 6, 6, 4, 21), grain = rnd();
    const v = 0.62 + (big - 0.5) * 0.16 + (grain - 0.5) * 0.05;
    H[i] = grain * 0.3 + big;
    const o = i * 4; img.data[o] = v * 255; img.data[o + 1] = v * 0.98 * 255; img.data[o + 2] = v * 0.95 * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(40,36,34,0.55)'; g.lineWidth = 2;
  const step = size / slabs;
  for (let k = 0; k <= slabs; k++) {
    g.beginPath(); g.moveTo(k * step, 0); g.lineTo(k * step, size); g.stroke();
    g.beginPath(); g.moveTo(0, k * step); g.lineTo(size, k * step); g.stroke();
    for (let y = 0; y < size; y++) { H[y * size + Math.min(size - 1, Math.round(k * step))] -= 1; H[Math.min(size - 1, Math.round(k * step)) * size + y] -= 1; }
  }
  return { map: tex(c), normalMap: normalFromHeight(H, size, 1.2) };
}

// Dry grass and dirt for the land around the city.
export function ground(size = 512) {
  const rnd = mulberry32(3);
  const [c, g] = mk(size); const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / size, ny = y / size;
    const big = tfbm(nx * 3, ny * 3, 3, 5, 41), grain = rnd();
    const dirt = clamp((big - 0.45) * 3, 0, 1);
    const r = 0.30 + dirt * 0.18 + (grain - 0.5) * 0.08, gg = 0.33 + dirt * 0.08 + (grain - 0.5) * 0.08, b = 0.17 + dirt * 0.07;
    const o = (y * size + x) * 4; img.data[o] = r * 255; img.data[o + 1] = gg * 255; img.data[o + 2] = b * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0); return tex(c);
}

// Building facades. Each returns { map, emissiveMap, roughnessMap, w, h }, where
// w and h are the size in metres that one copy of the texture covers.
function facadeBase(cols, rows, cw, ch, seed, drawCell) {
  const W = cols * cw, Hh = rows * ch;
  const [c, g] = mk(W, Hh), [ce, ge] = mk(W, Hh), [cr, gr] = mk(W, Hh);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, Hh);
  const rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) drawCell(g, ge, gr, k * cw, r * ch, cw, ch, rnd, r, k);
  return { map: tex(c), emissiveMap: tex(ce), roughnessMap: tex(cr, false) };
}
const litColors = ['#ffd49a', '#ffe2b8', '#ffc67a', '#fff1d6', '#d8e6ff'];

export function facadeGlass() {
  const t = facadeBase(8, 8, 64, 64, 17, (g, ge, gr, x, y, w, h, rnd) => {
    g.fillStyle = '#5a6068'; g.fillRect(x, y, w, h);              // spandrel
    gr.fillStyle = '#8a8a8a'; gr.fillRect(x, y, w, h);
    const gy = y + 12, gh = h - 14;
    const grad = g.createLinearGradient(0, gy, 0, gy + gh);
    const tint = 0.85 + rnd() * 0.3;
    grad.addColorStop(0, `rgb(${110 * tint},${135 * tint},${160 * tint})`); grad.addColorStop(1, `rgb(${45 * tint},${60 * tint},${80 * tint})`);
    g.fillStyle = grad; g.fillRect(x + 2, gy, w - 4, gh);
    gr.fillStyle = '#1c1c1c'; gr.fillRect(x + 2, gy, w - 4, gh);
    g.fillStyle = '#3d434a'; g.fillRect(x + w / 2 - 1, gy, 2, gh);  // mullion
    if (rnd() < 0.2) {
      ge.fillStyle = litColors[(rnd() * litColors.length) | 0]; ge.globalAlpha = 0.25 + rnd() * 0.6;
      ge.fillRect(x + 3, gy + 1, w - 6, gh - 2); ge.globalAlpha = 1;
    }
  });
  return { ...t, w: 32, h: 28 };
}

export function facadeApartment() {
  const t = facadeBase(4, 4, 128, 128, 29, (g, ge, gr, x, y, w, h, rnd) => {
    g.fillStyle = '#ebe7e1'; g.fillRect(x, y, w, h);
    gr.fillStyle = '#e6e6e6'; gr.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(x, y + h - 6, w, 6);       // floor band
    const ww = 60, wh = 70, wx = x + (w - ww) / 2, wy = y + 26;
    g.fillStyle = '#c9c2b8'; g.fillRect(wx - 5, wy - 5, ww + 10, wh + 14);  // frame + sill
    const grad = g.createLinearGradient(0, wy, 0, wy + wh);
    grad.addColorStop(0, '#5d6f80'); grad.addColorStop(1, '#232c36');
    g.fillStyle = grad; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = '#d8d2c9'; g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
    gr.fillStyle = '#262626'; gr.fillRect(wx, wy, ww, wh);
    if (rnd() < 0.25) {
      ge.fillStyle = litColors[(rnd() * 4) | 0]; ge.globalAlpha = 0.5 + rnd() * 0.5;
      ge.fillRect(wx, wy, ww, wh); ge.globalAlpha = 1;
      if (rnd() < 0.5) { ge.fillStyle = '#000'; ge.fillRect(wx, wy, ww * (0.3 + rnd() * 0.4), wh); } // a curtain
    }
  });
  return { ...t, w: 16, h: 14 };
}

export function facadeShop() {
  const W = 512, Hh = 256;
  const [c, g] = mk(W, Hh), [ce, ge] = mk(W, Hh), [cr, gr] = mk(W, Hh);
  const rnd = mulberry32(37);
  g.fillStyle = '#efe9e0'; g.fillRect(0, 0, W, Hh);
  gr.fillStyle = '#e0e0e0'; gr.fillRect(0, 0, W, Hh);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, Hh);
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 70, W, 8);   // cornice shadow
  for (let k = 0; k < 3; k++) {
    const x = k * W / 3 + 10, w = W / 3 - 20, y = 96, h = Hh - 104;
    const grad = g.createLinearGradient(0, y, 0, y + h); grad.addColorStop(0, '#4b5966'); grad.addColorStop(1, '#1d242c');
    g.fillStyle = '#2b2b2e'; g.fillRect(x - 4, y - 4, w + 8, h + 8);
    g.fillStyle = grad; g.fillRect(x, y, w, h);
    gr.fillStyle = '#222'; gr.fillRect(x, y, w, h);
    const lit = ['#ffd9a8', '#fff0d0', '#ffcf9a'][k];
    const eg = ge.createLinearGradient(0, y, 0, y + h); eg.addColorStop(0, lit); eg.addColorStop(1, '#6b4a2a');
    ge.globalAlpha = 0.55 + rnd() * 0.45; ge.fillStyle = eg; ge.fillRect(x, y, w, h); ge.globalAlpha = 1;
    // door and mullions
    g.fillStyle = '#2b2b2e'; for (let m = 1; m < 4; m++) g.fillRect(x + m * w / 4 - 2, y, 4, h);
    ge.fillStyle = '#000'; for (let m = 1; m < 4; m++) ge.fillRect(x + m * w / 4 - 2, y, 4, h);
    // awning
    g.fillStyle = ['#b23a3a', '#2f6b5a', '#c9a227'][k]; g.fillRect(x - 6, y - 26, w + 12, 18);
    g.fillStyle = 'rgba(255,255,255,0.35)'; for (let s = 0; s < w + 12; s += 24) g.fillRect(x - 6 + s, y - 26, 12, 18);
  }
  return { map: tex(c), emissiveMap: tex(ce), roughnessMap: tex(cr, false), w: 12, h: 5 };
}

export function roofTex(size = 256) {
  const rnd = mulberry32(8); const [c, g] = mk(size); const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { const v = (0.42 + (rnd() - 0.5) * 0.12) * 255; img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.98; img.data[i * 4 + 2] = v * 0.96; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return tex(c);
}

// Shop signs: 32 made-up names in a 4 x 8 atlas of 256 x 128 cells.
export const SIGN_NAMES = ['DINER', 'TACOS', 'MOTEL', 'DONUTS', 'PIZZA', 'COFFEE', 'TIRES', 'GARAGE', 'BURGERS', 'LAUNDRY', 'SUSHI', 'BOWLING', 'VIDEO', 'GYM', 'BAKERY', 'AUTO PARTS'];
export function signAtlas() {
  const [c, g] = mk(1024, 1024);
  const schemes = [
    { bg: '#b8161d', fg: '#fff3d6', glow: '#ffd27a' },
    { bg: '#f2c230', fg: '#2a1408', glow: '#fff1a0' },
    { bg: '#151018', fg: '#ff4fa8', glow: '#ff4fa8' },
    { bg: '#0f1720', fg: '#4ff3ff', glow: '#4ff3ff' },
  ];
  for (let n = 0; n < 32; n++) {
    const col = n % 4, row = (n / 4) | 0, x = col * 256, y = row * 128;
    const s = schemes[(n + row) % 4], name = SIGN_NAMES[n % 16];
    g.fillStyle = s.bg; g.fillRect(x + 4, y + 4, 248, 120);
    g.strokeStyle = s.glow; g.lineWidth = 5; g.strokeRect(x + 12, y + 12, 232, 104);
    g.font = `900 ${name.length > 7 ? 38 : 52}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = s.glow; g.shadowBlur = 14; g.fillStyle = s.fg; g.fillText(name, x + 128, y + 66); g.shadowBlur = 0;
  }
  const t = tex(c, true, false); t.generateMipmaps = true; return t;
}

export function textPanel(w, h, draw) { const [c, g] = mk(w, h); draw(g, w, h); return tex(c, true, false); }

export function gantrySign(text, sub) {
  return textPanel(512, 160, (g, w, h) => {
    g.fillStyle = '#0d6b3d'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 54px "Barlow", Arial, sans-serif'; g.fillText(text, w / 2, h * 0.42);
    g.font = '600 32px "Barlow", Arial, sans-serif'; g.fillText(sub, w / 2, h * 0.75);
  });
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
  g.putImageData(img, 0, 0); const t = tex(c, true, false); return t;
}

export function glowTex() {
  const [c, g] = mk(128); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return tex(c, true, false);
}

export function frondTex() {
  const [c, g] = mk(64, 256);
  g.clearRect(0, 0, 64, 256);
  g.strokeStyle = '#5f6b2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 256); g.stroke();
  for (let y = 6; y < 250; y += 7) {
    const len = 30 * Math.sin(Math.PI * (y / 256)) + 4;
    for (const s of [-1, 1]) {
      g.strokeStyle = y % 14 ? '#3e5a22' : '#4f6c2a'; g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(32, y); g.quadraticCurveTo(32 + s * len * 0.6, y + 6, 32 + s * len, y + 16); g.stroke();
    }
  }
  return tex(c, true, false);
}
