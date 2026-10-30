// The inside of a car, seen from the driver's seat. Everything is modelled with rounded edges and real materials (stitched leather,
// alcantara, carbon, brushed aluminium, piano black) so it catches the light like an interior does, instead of looking like boxes.
// There is a steering wheel that turns with the car's steering (and a driver's gloved hands and sleeved arms that follow it),
// paddle shifters, shift lights, an instrument cluster that shows the real revs and speed, an infotainment screen, vents, door
// cards, seats and a rear-view mirror. Two styles: 'modern' (the supercar) and 'classic' (the 1960s grand tourer).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp } from './util.js';

function canvasTex(w, h, draw, rep = [1, 1], srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
let rs = 12345; const rnd = () => (rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296;
function leatherTex(base, rep = [5, 5]) {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.18)'; const s = 1 + rnd() * 2; c.fillRect(rnd() * w, rnd() * h, s, s); }
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1;
    for (let i = 0; i < 70; i++) { c.beginPath(); const x = rnd() * w, y = rnd() * h; c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 26, y + (rnd() - 0.5) * 26); c.stroke(); }
  }, rep);
}
function leatherBump(rep = [5, 5]) {
  return canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#808080'; c.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const v = 90 + rnd() * 90 | 0; c.fillStyle = `rgb(${v},${v},${v})`; const s = 2 + rnd() * 3; c.fillRect(rnd() * w, rnd() * h, s, s); } }, rep, false);
}
function carbonTex(rep = [4, 4]) {
  return canvasTex(128, 128, (c, w, h) => {
    const n = 8, s = w / n; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const dir = (i + j) % 2; const g = c.createLinearGradient(i * s, j * s, i * s + (dir ? s : 0), j * s + (dir ? 0 : s)); g.addColorStop(0, '#2a2a2e'); g.addColorStop(0.5, '#0b0b0d'); g.addColorStop(1, '#25252a');
      c.fillStyle = g; c.fillRect(i * s, j * s, s, s);
    }
  }, rep);
}
function woodTex() {
  return canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#6b3d1c'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 1) { const v = 0.5 + 0.5 * Math.sin(y * 0.9 + Math.sin(y * 0.21) * 3); c.fillStyle = `rgba(${v > 0.5 ? '255,200,140' : '30,12,2'},${0.08 + 0.08 * v})`; c.fillRect(0, y, w, 1); }
    for (let i = 0; i < 40; i++) { c.strokeStyle = 'rgba(30,12,2,0.18)'; c.beginPath(); const y = rnd() * h; c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + rnd() * 6 - 3, w * 0.6, y + rnd() * 6 - 3, w, y + rnd() * 4 - 2); c.stroke(); }
  }, [3, 1]);
}
function rimTex(base, stitch) {   // u runs round the rim, v round its section; a seam of stitches along the inside edge
  return canvasTex(512, 64, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.15)'; c.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
    c.fillStyle = stitch; for (let x = 0; x < w; x += 8) { c.fillRect(x, h * 0.5 - 1, 5, 2); }
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, h * 0.5 - 4, w, 1); c.fillRect(0, h * 0.5 + 3, w, 1);
    c.fillStyle = 'rgba(0,0,0,0.5)'; for (let x = 0; x < w; x += 11) for (const v of [0.22, 0.78]) { c.beginPath(); c.arc(x + 4, h * v, 1.6, 0, 6.3); c.fill(); }   // perforations
  }, [1, 1]);
}

// A wheel rim: a tube round a circle with a flat bottom, thicker at the sides where the hands go.
function rimGeo(R, r0, grip, flat = 0.9, segs = 120, rad = 16) {
  const pos = [], nor = [], uv = [], idx = [], C = [];
  for (let i = 0; i <= segs; i++) { const a = i / segs * Math.PI * 2; C.push([R * Math.cos(a), Math.max(R * Math.sin(a), -R * flat)]); }
  for (let i = 0; i <= segs; i++) {
    const a = i / segs * Math.PI * 2, p0 = C[(i + segs - 1) % segs], p1 = C[(i + 1) % segs];
    let tx = p1[0] - p0[0], ty = p1[1] - p0[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let nx = ty, ny = -tx; if (nx * C[i][0] + ny * C[i][1] < 0) { nx = -nx; ny = -ny; }
    const r = r0 * (1 + grip * Math.pow(Math.abs(Math.cos(a)), 3));
    for (let j = 0; j <= rad; j++) {
      const th = j / rad * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const ox = nx * c * r, oy = ny * c * r, oz = s * r * 0.92;
      pos.push(C[i][0] + ox, C[i][1] + oy, oz); nor.push(nx * c, ny * c, s); uv.push(i / segs * 6, j / rad);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
const RB = (w, h, d, r = 0.012, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));

// The instrument cluster: drawn each few frames from the car's real revs and speed.
function drawCluster(c, W, H, st) {
  const classic = st.style === 'classic';
  c.clearRect(0, 0, W, H);
  c.fillStyle = classic ? '#0c0b09' : '#040506'; c.fillRect(0, 0, W, H);
  const dial = (cx, cy, R, max, step, labelEvery, value, label, red, ticksMinor) => {
    // Face.
    const g = c.createRadialGradient(cx, cy - R * 0.2, R * 0.1, cx, cy, R); g.addColorStop(0, classic ? '#1d1c18' : '#15171b'); g.addColorStop(1, classic ? '#0a0a08' : '#050608');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    if (classic) { const b = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R); b.addColorStop(0, '#f2f2f0'); b.addColorStop(0.5, '#7b7d80'); b.addColorStop(1, '#d9dadc'); c.strokeStyle = b; c.lineWidth = R * 0.08; c.beginPath(); c.arc(cx, cy, R * 1.0, 0, Math.PI * 2); c.stroke(); }
    const a0 = Math.PI * 0.75, span = Math.PI * 1.5, ang = v => a0 + span * clamp(v / max, 0, 1);
    if (red) { c.strokeStyle = '#d4202c'; c.lineWidth = R * 0.07; c.beginPath(); c.arc(cx, cy, R * 0.82, ang(red), ang(max)); c.stroke(); }
    for (let v = 0; v <= max + 1e-6; v += step / (ticksMinor || 1)) {
      const major = Math.abs(v / step - Math.round(v / step)) < 1e-6, a = ang(v), r1 = R * (major ? 0.74 : 0.8), r2 = R * 0.9;
      c.strokeStyle = classic ? '#f1efe6' : (major ? '#ffffff' : '#9aa0a8'); c.lineWidth = major ? R * 0.028 : R * 0.012;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); c.stroke();
    }
    c.fillStyle = classic ? '#f1efe6' : '#f3f4f6'; c.font = `${classic ? '600' : '500'} ${R * 0.13}px Barlow, 'Barlow Condensed', sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let v = 0; v <= max + 1e-6; v += step * labelEvery) { const a = ang(v); c.fillText(String(Math.round(v * (label.mul || 1))), cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6); }
    c.fillStyle = 'rgba(255,255,255,0.65)'; c.font = `500 ${R * 0.1}px Barlow, sans-serif`; c.fillText(label.text, cx, cy + R * 0.34);
    // Needle, with a soft shadow.
    const a = ang(value), nl = R * 0.86;
    c.save(); c.shadowColor = classic ? 'rgba(0,0,0,0.6)' : 'rgba(255,90,20,0.9)'; c.shadowBlur = R * 0.06; c.shadowOffsetY = classic ? R * 0.02 : 0;
    c.strokeStyle = classic ? '#f5f1e4' : '#ff6a1c'; c.lineWidth = R * 0.03; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx - Math.cos(a) * R * 0.14, cy - Math.sin(a) * R * 0.14); c.lineTo(cx + Math.cos(a) * nl, cy + Math.sin(a) * nl); c.stroke(); c.restore();
    const cap = c.createRadialGradient(cx - R * 0.02, cy - R * 0.03, 0, cx, cy, R * 0.1); cap.addColorStop(0, '#d0d3d8'); cap.addColorStop(1, '#3a3d42');
    c.fillStyle = cap; c.beginPath(); c.arc(cx, cy, R * 0.085, 0, Math.PI * 2); c.fill();
  };
  const R = H * (classic ? 0.43 : 0.46), cy = H * 0.52;
  if (classic) {
    dial(W * 0.27, cy, R, 7000, 1000, 1, st.rpm, { text: 'RPM x1000', mul: 0.001 }, 5800, 2);
    dial(W * 0.73, cy, R, 160, 20, 1, Math.min(st.mph, 160), { text: 'MPH' }, 0, 2);
    // Small dials: fuel and temperature.
    for (const [x, v, t] of [[W * 0.5 - R * 0.34, 0.7, 'FUEL'], [W * 0.5 + R * 0.34, 0.45, 'TEMP']]) {
      c.fillStyle = '#12110e'; c.beginPath(); c.arc(x, cy + H * 0.04, R * 0.3, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#c9c9c4'; c.lineWidth = R * 0.03; c.stroke();
      const a = Math.PI * (1.2 + 0.6 * v); c.strokeStyle = '#f5f1e4'; c.lineWidth = R * 0.02; c.beginPath(); c.moveTo(x, cy + H * 0.04); c.lineTo(x + Math.cos(a) * R * 0.24, cy + H * 0.04 + Math.sin(a) * R * 0.24); c.stroke();
      c.fillStyle = '#d8d8d2'; c.font = `500 ${R * 0.09}px Barlow, sans-serif`; c.textAlign = 'center'; c.fillText(t, x, cy + H * 0.04 + R * 0.2);
    }
  } else {
    dial(W * 0.23, cy, R, 9, 1, 1, st.rpm / 1000, { text: 'x1000 rpm' }, 7.8, 2);
    dial(W * 0.77, cy, R, 360, 20, 2, st.units === 'mph' ? st.kmh / 1.609 * (360 / 220) : st.kmh, { text: st.units === 'mph' ? 'mph' : 'km/h', mul: st.units === 'mph' ? 220 / 360 : 1 }, 0, 2);
    // The centre display: gear, speed, trip.
    const mx = W * 0.5, g = c.createLinearGradient(mx - 130, 0, mx + 130, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(120,150,190,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(mx - 130, H * 0.12, 260, H * 0.76);
    c.fillStyle = '#ff7a2a'; c.font = `700 ${H * 0.34}px 'Barlow Condensed', Barlow, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(st.gear, mx, H * 0.38);
    const v = st.units === 'mph' ? st.kmh / 1.609 : st.kmh; c.fillStyle = '#f3f4f6'; c.font = `500 ${H * 0.2}px Barlow, sans-serif`; c.fillText(String(Math.round(v)), mx, H * 0.66);
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.font = `500 ${H * 0.065}px Barlow, sans-serif`; c.fillText(st.units === 'mph' ? 'MPH' : 'KM/H', mx, H * 0.79);
    // Warning lights along the bottom.
    const lights = [['ABS', st.abs], ['ESP', st.esp], ['TCS', st.tcs]]; lights.forEach(([t, on], i) => { c.fillStyle = on ? '#ffb020' : 'rgba(255,255,255,0.14)'; c.font = `600 ${H * 0.058}px Barlow, sans-serif`; c.fillText(t, mx + (i - 1) * 74, H * 0.92); });
    // A bar of shift lights as well, along the top of the display.
  }
  // The hood's shadow across the top, and a faint glass sheen.
  const sh = c.createLinearGradient(0, 0, 0, H * 0.3); sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = sh; c.fillRect(0, 0, W, H * 0.3);
  const gl = c.createLinearGradient(0, H, W, 0); gl.addColorStop(0.35, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.05)'); gl.addColorStop(0.65, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(0, 0, W, H);
}

function infotainmentTex() {
  return canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#0a1018'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(120,170,230,0.35)'; c.lineWidth = 3;
    for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(i * 64 - 20, 0); c.lineTo(i * 64 + 30, h); c.stroke(); }
    for (let j = 0; j < 5; j++) { c.beginPath(); c.moveTo(0, j * 56 + 20); c.lineTo(w, j * 56 - 10); c.stroke(); }
    c.strokeStyle = '#ff7a2a'; c.lineWidth = 6; c.beginPath(); c.moveTo(60, 230); c.bezierCurveTo(150, 140, 250, 190, 330, 90); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(340, 70); c.lineTo(352, 104); c.lineTo(340, 96); c.lineTo(328, 104); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, 0, w, 44); c.fillStyle = '#e8eef6'; c.font = '600 26px Barlow, sans-serif'; c.fillText('SUNSET CITY', 16, 31); c.textAlign = 'right'; c.fillText('18:42', w - 16, 31);
  }, [1, 1]);
}
function mirrorTex() {
  return canvasTex(256, 64, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9fb4c8'); g.addColorStop(0.55, '#d9a47a'); g.addColorStop(1, '#2a2321'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(30,26,30,0.55)'; for (let i = 0; i < 14; i++) c.fillRect(i * 20, 30 - rnd() * 18, 14, 40); }, [1, 1]);
}

export function buildCockpit(body, bodyGeo, style = 'modern') {
  const classic = style === 'classic';
  const g = new THREE.Group(); body.add(g);
  const L = classic
    ? { eye: [0.36, 1.12, -0.36], wheel: [0.36, 0.82, 0.16], tilt: 0.34, R: 0.19, tube: 0.0125, half: 0.84, dash: [[0.88, 0.935], [0.52, 0.915], [0.34, 0.88], [0.30, 0.78], [0.42, 0.62], [0.88, 0.58]], cluster: [0.36, 0.84, 0.4], clusterSize: [0.5, 0.2], seatZ: -0.46, cowl: [0.86, 0.94], doorX: 0.83, roofY: 1.3, mirror: [0, 1.17, 0.12] }
    : { eye: [0.37, 1.055, -0.28], wheel: [0.37, 0.80, 0.25], tilt: 0.40, R: 0.15, tube: 0.0155, half: 0.9, dash: [[0.96, 0.845], [0.64, 0.84], [0.42, 0.805], [0.31, 0.745], [0.30, 0.62], [0.42, 0.52], [0.96, 0.50]], cluster: [0.37, 0.885, 0.58], clusterSize: [0.56, 0.21], seatZ: -0.42, cowl: [0.93, 0.84], doorX: 0.9, roofY: 1.1, mirror: [0, 1.0, 0.2] };
  const eye = new THREE.Vector3(...L.eye);
  // The inside of the shell: dark headliner and pillars.
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const lining = new THREE.MeshStandardMaterial({ color: classic ? 0x3a2f24 : 0x2e2e34, roughness: 0.95, side: THREE.BackSide }); lining.userData.noProbe = true;
  const inner = new THREE.Mesh(bodyGeo, [lining, hidden]); inner.scale.set(0.985, 0.99, 0.995); g.add(inner);
  // Materials.
  const leatherCol = classic ? '#2a1c12' : '#1c1b1d';
  const leather = new THREE.MeshStandardMaterial({ map: leatherTex(leatherCol), bumpMap: leatherBump(), bumpScale: 0.3, roughness: 0.52, metalness: 0.0 });
  const leatherSoft = new THREE.MeshStandardMaterial({ map: leatherTex(classic ? '#352216' : '#242326', [3, 3]), bumpMap: leatherBump([3, 3]), bumpScale: 0.5, roughness: 0.5 });
  const alcantara = new THREE.MeshStandardMaterial({ map: leatherTex(classic ? '#1a1612' : '#18181b', [8, 8]), roughness: 1.0, metalness: 0 });
  const carbon = new THREE.MeshStandardMaterial({ map: carbonTex(), roughness: 0.28, metalness: 0.4 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xaeb1b7, roughness: 0.32, metalness: 1 });
  const aluDark = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.4, metalness: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdadde2, roughness: 0.1, metalness: 1 });
  const piano = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.12, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff6a10, roughness: 0.5 });
  const sleeveMat = new THREE.MeshStandardMaterial({ map: leatherTex('#1a1d24', [4, 2]), roughness: 0.95 });
  const gloveMat = new THREE.MeshStandardMaterial({ map: leatherTex('#0e0e10', [3, 3]), bumpMap: leatherBump([3, 3]), bumpScale: 0.5, roughness: 0.62 });
  for (const m of [leather, leatherSoft, alcantara, carbon, alu, aluDark, chrome, piano, accent, sleeveMat, gloveMat]) m.userData.noProbe = true;
  const rb = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0, r = 0.012) => { const o = new THREE.Mesh(RB(w, h, d, r), mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };

  // --- Dashboard: a sculpted block, extruded across the car with rounded edges. ---
  const shape = new THREE.Shape(); L.dash.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y))); shape.closePath();
  const hw = L.half; const dg = new THREE.ExtrudeGeometry(shape, { depth: hw * 2, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.022, bevelSegments: 4, curveSegments: 8 });
  dg.rotateY(-Math.PI / 2); dg.translate(hw, 0, 0);
  const dash = new THREE.Mesh(dg, leather); g.add(dash);
  // A soft sheen strip along the top edge nearest the driver, and a seam.
  rb(hw * 2 - 0.1, 0.012, 0.025, accent, 0, L.dash[2][1] + 0.022, L.dash[2][0] + 0.005, 0, 0, 0, 0.004);
  // --- Instrument cluster ---
  const [cx, cy, cz] = L.cluster, CW = 768, CH = 320;
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const clusterMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.25, metalness: 0 }); clusterMat.userData.noProbe = true;
  const cluster = new THREE.Mesh(new THREE.PlaneGeometry(L.clusterSize[0], L.clusterSize[1]), clusterMat); cluster.position.set(cx, cy, cz); cluster.lookAt(eye); g.add(cluster);
  // The binnacle: a rounded bezel round the cluster, with a hood over it.
  const hood = rb(L.clusterSize[0] + 0.1, 0.04, 0.2, classic ? leather : leatherSoft, cx, cy + L.clusterSize[1] / 2 + 0.035, cz + 0.02, -0.18, 0, 0, 0.018);
  for (const s of [-1, 1]) rb(0.03, L.clusterSize[1] + 0.02, 0.17, classic ? leather : leatherSoft, cx + s * (L.clusterSize[0] / 2 + 0.03), cy + 0.012, cz + 0.02, -0.1, 0, 0, 0.012);
  const ledMats = [];
  if (!classic) for (let i = 0; i < 9; i++) {   // shift lights on top of the hood
    const m = new THREE.MeshStandardMaterial({ color: 0x101010, emissive: i < 3 ? 0x25e060 : i < 6 ? 0xff2a1a : 0x2a6aff, emissiveIntensity: 0, roughness: 0.4 }); m.userData.noProbe = true; ledMats.push(m);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 10, 8), m); led.position.set(cx - 0.16 + i * 0.04, cy + L.clusterSize[1] / 2 + 0.058, cz - 0.04); g.add(led);
  }
  // --- Centre of the dash: screen, vents, console ---
  if (!classic) {
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshStandardMaterial({ map: infotainmentTex(), emissiveMap: infotainmentTex(), emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.2 })); sc.position.set(0, 0.79, 0.62); sc.lookAt(eye.x * 0.4, eye.y, eye.z); sc.rotation.x = -1.1; g.add(sc);
    rb(0.33, 0.17, 0.03, piano, 0, 0.79, 0.608, -1.1, 0, 0, 0.012).renderOrder = -1;
    for (const x of [0.62, -0.62, 0.17, -0.17]) { rb(0.11, 0.045, 0.02, alu, x, 0.765, 0.52, -0.5, 0, 0, 0.008); for (let k = -2; k <= 2; k++) rb(0.1, 0.004, 0.012, piano, x, 0.765 + k * 0.008, 0.512, -0.5, 0, 0, 0.002); }
  } else {
    // Classic: a flat metal-faced panel with toggle switches and a radio.
    rb(0.46, 0.17, 0.03, aluDark, -0.1, 0.78, 0.5, -0.7, 0, 0, 0.01);
    for (let k = 0; k < 6; k++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 8), chrome); t.position.set(-0.28 + k * 0.07, 0.8, 0.49); t.rotation.set(-0.3, 0, 0); g.add(t); }
    rb(0.22, 0.07, 0.03, piano, -0.12, 0.72, 0.5, -0.7, 0, 0, 0.008);
  }
  // Centre console with a gear selector.
  const cons = rb(0.24, 0.3, 1.0, leatherSoft, 0, 0.45, -0.05, 0, 0, 0, 0.04);
  rb(0.15, 0.025, 0.4, piano, 0, 0.61, 0.15, 0, 0, 0, 0.01);
  rb(0.05, 0.05, 0.1, classic ? chrome : alu, 0, 0.66, 0.08, -0.35, 0, 0, 0.018);
  if (!classic) for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 14), k === 0 ? accent : aluDark); b.position.set(-0.04 + k * 0.027, 0.624, 0.26); g.add(b); }
  // --- Doors ---
  for (const s of [1, -1]) {
    const dx = s * L.doorX;
    rb(0.075, 0.42, 1.25, leatherSoft, dx, 0.64, -0.08, 0, 0, 0, 0.03);
    rb(0.075, 0.07, 1.25, classic ? leather : alcantara, dx, 0.88, -0.08, 0, 0, 0, 0.025);
    rb(0.1, 0.07, 0.5, leather, dx - s * 0.03, 0.72, -0.2, 0, 0, 0, 0.03);
    rb(0.02, 0.02, 0.5, classic ? chrome : alu, dx - s * 0.04, 0.8, 0.0, 0, 0, 0, 0.006);
    const sp = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), piano); sp.position.set(dx - s * 0.04, 0.52, 0.42); sp.rotation.y = -s * Math.PI / 2; g.add(sp);
    rb(0.03, 0.025, 0.16, aluDark, dx - s * 0.05, 0.75, -0.55, 0, 0, 0, 0.008);
  }
  // --- Seats ---
  for (const sx of [0.37, -0.37]) {
    const z0 = L.seatZ;
    rb(0.46, 0.13, 0.54, leather, sx, 0.33, z0, 0, 0, 0, 0.05);
    rb(0.46, 0.66, 0.14, leather, sx, 0.73, z0 - 0.28, -0.26, 0, 0, 0.06);
    for (const b of [-1, 1]) { rb(0.07, 0.5, 0.17, leatherSoft, sx + b * 0.2, 0.7, z0 - 0.26, -0.26, 0, b * 0.18, 0.03); rb(0.07, 0.1, 0.5, leatherSoft, sx + b * 0.2, 0.37, z0 + 0.02, 0, 0, b * 0.12, 0.03); }
    rb(0.3, 0.2, 0.1, alcantara, sx, 1.08, z0 - 0.36, -0.2, 0, 0, 0.05);
    rb(0.05, 0.62, 0.02, accent, sx, 0.74, z0 - 0.205, -0.26, 0, 0, 0.004);
  }
  // --- Pillars and roof ---
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(s * 0.84, L.cowl[1], L.cowl[0] - 0.04), b = new THREE.Vector3(s * 0.66, L.roofY, -0.05);
    const o = new THREE.Mesh(RB(0.06, 0.045, a.distanceTo(b), 0.015), alcantara); o.position.copy(a).lerp(b, 0.5); o.lookAt(b); g.add(o);
  }
  // Rear-view mirror.
  rb(0.26, 0.075, 0.034, piano, L.mirror[0], L.mirror[1], L.mirror[2], 0.15, 0, 0, 0.02);
  const mf = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.052), new THREE.MeshStandardMaterial({ map: mirrorTex(), roughness: 0.08, metalness: 0.6 })); mf.position.set(L.mirror[0], L.mirror[1], L.mirror[2] - 0.019); mf.rotation.set(0.15, Math.PI, 0); g.add(mf);
  rb(0.02, 0.07, 0.02, aluDark, 0, L.mirror[1] + 0.06, L.mirror[2] + 0.03, 0, 0, 0, 0.006);

  // --- Steering wheel ---
  const wheel = new THREE.Group(); wheel.position.set(...L.wheel); wheel.rotation.x = L.tilt; g.add(wheel);
  const spin = new THREE.Group(); wheel.add(spin);
  const rimMat = classic ? new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.38, metalness: 0.0, clearcoat: 0 }) : new THREE.MeshStandardMaterial({ map: rimTex('#17161a', '#ff6a1c'), bumpMap: leatherBump([6, 1]), bumpScale: 0.4, roughness: 0.55 });
  rimMat.userData.noProbe = true;
  const rim = new THREE.Mesh(rimGeo(L.R, L.tube, classic ? 0.0 : 0.3, classic ? 1.0 : 0.88), rimMat); spin.add(rim);
  if (!classic) {   // twelve o'clock marker
    const mk = new THREE.Mesh(RB(0.012, 0.034, 0.034, 0.004), accent); mk.position.set(0, L.R + 0.002, 0); spin.add(mk);
  }
  const hubMat = classic ? chrome : leather;
  const hub = new THREE.Mesh(classic ? new THREE.CylinderGeometry(0.035, 0.04, 0.03, 24).rotateX(Math.PI / 2) : RB(0.11, 0.095, 0.04, 0.03), hubMat); hub.position.z = classic ? 0.02 : 0.012; spin.add(hub);
  // Spokes: three on the modern wheel (carbon, with aluminium inlays); three slim drilled ones on the classic.
  const spokeMat = classic ? alu : carbon;
  for (const a of classic ? [Math.PI * 0.5 + 0.1, Math.PI * 1.5 - 0.1, Math.PI * 1.0] : [0, Math.PI, Math.PI * 1.5]) {
    const len = L.R - 0.03, sp = new THREE.Mesh(RB(classic ? 0.014 : (a === Math.PI * 1.5 ? 0.034 : 0.05), len, classic ? 0.008 : 0.016, 0.006), spokeMat);
    const ang = a - Math.PI / 2; sp.position.set(Math.cos(a) * len / 2 * 0.98, Math.sin(a) * len / 2 * 0.98, 0); sp.rotation.z = a - Math.PI / 2 + Math.PI; spin.add(sp);
    if (!classic && a !== Math.PI * 1.5) { const inl = new THREE.Mesh(RB(0.014, len * 0.8, 0.004, 0.002), alu); inl.position.set(Math.cos(a) * len / 2, Math.sin(a) * len / 2, -0.01); inl.rotation.z = sp.rotation.z; spin.add(inl); }
    if (classic) for (let k = 0; k < 3; k++) { const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.01, 10).rotateX(Math.PI / 2), piano); hole.position.set(Math.cos(a) * (0.05 + k * 0.035), Math.sin(a) * (0.05 + k * 0.035), 0.0); spin.add(hole); }
  }
  if (!classic) {   // buttons on the spokes
    for (const [x, y, m] of [[-0.085, 0.012, accent], [-0.085, -0.02, aluDark], [0.085, 0.012, aluDark], [0.085, -0.02, new THREE.MeshStandardMaterial({ color: 0x2a6aff, roughness: 0.4 })]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.008, 14).rotateX(Math.PI / 2), m); b.position.set(x, y, -0.01); spin.add(b); }
    const em = new THREE.Mesh(new THREE.CircleGeometry(0.018, 20), new THREE.MeshStandardMaterial({ color: 0xff6a10, roughness: 0.4, metalness: 0.5 })); em.position.set(0, 0, -0.011); em.rotation.y = Math.PI; spin.add(em);
  }
  // Column shroud and paddle shifters (fixed to the column, they don't turn with the wheel).
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.052, 0.32, 20).rotateX(Math.PI / 2), piano); col.position.z = 0.17; wheel.add(col);
  for (const s of [-1, 1]) {
    const pd = new THREE.Mesh(RB(0.014, 0.1, 0.012, 0.004), alu); pd.position.set(s * (L.R * 0.72), L.R * 0.2, 0.05); pd.rotation.set(0, 0, s * 0.18); wheel.add(pd);
    const pd2 = new THREE.Mesh(RB(0.012, 0.075, 0.01, 0.004), aluDark); pd2.position.set(s * (L.R * 0.8), L.R * -0.1, 0.045); pd2.rotation.set(0, 0, s * 0.2); wheel.add(pd2);
  }
  // Hands (black driving gloves) at about nine and three, and the arms that reach them.
  const hands = [];
  for (const s of [-1, 1]) {
    const h = new THREE.Group(); const a = Math.PI / 2 + s * (Math.PI / 2 - 0.12);   // just above the horizontal
    h.position.set(Math.cos(a) * L.R, Math.sin(a) * L.R, -0.004); h.rotation.z = a - Math.PI / 2; spin.add(h);
    const palm = new THREE.Mesh(RB(0.088, 0.034, 0.1, 0.014), gloveMat); palm.position.set(0, 0, -0.012); h.add(palm);
    for (let k = 0; k < 4; k++) {   // four fingers curling round the rim
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0078 - k * 0.0003, 0.04 + (k === 1 || k === 2 ? 0.006 : 0), 4, 8), gloveMat);
      f.position.set((k - 1.5) * 0.019, 0.0, 0.026); f.rotation.set(Math.PI / 2 - 0.2, 0, 0); h.add(f);
    }
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.04, 4, 8), gloveMat); th.position.set(s * -0.05, -0.002, -0.004); th.rotation.set(0.2, 0, s * 1.2 + 1.4); h.add(th);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.04, 0.05, 14), gloveMat); cuff.rotation.x = Math.PI / 2; cuff.position.set(0, 0, -0.085); h.add(cuff);
    hands.push(h);
  }
  const arms = hands.map((h, i) => {
    const geo = new THREE.CylinderGeometry(0.036, 0.043, 1, 12).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const m = new THREE.Mesh(geo, sleeveMat); m.frustumCulled = false; g.add(m); return { m, shoulder: new THREE.Vector3(L.eye[0] + (i ? -0.3 : 0.3), L.eye[1] - 0.3, L.eye[2] - 0.42) };
  });
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  let acc = 0;
  return {
    group: g, wheel: spin, canvas: cv, tex, eye, style,
    // Called each frame: turns the wheel with the steering, moves the arms, lights the shift lights, and redraws the gauges ~30 times a second.
    update(st, dt) {
      spin.rotation.z = st.wheelAngle;
      g.updateMatrixWorld(true);
      arms.forEach((a, i) => { hands[i].getWorldPosition(tmp); g.worldToLocal(tmp); a.m.position.copy(a.shoulder); a.m.lookAt(tmp); a.m.scale.set(1, 1, a.shoulder.distanceTo(tmp)); });
      if (ledMats.length) { const lit = clamp((st.rpm - 5800) / (st.redline - 5800) * 9.4, 0, 9); ledMats.forEach((m, i) => { m.emissiveIntensity = i < lit ? (lit > 8.6 && (performance.now() / 70 | 0) % 2 ? 0.4 : 3.2) : 0; }); }
      acc += dt; if (acc < 1 / 30) return; acc = 0;
      drawCluster(cv.getContext('2d'), CW, CH, { ...st, style }); tex.needsUpdate = true;
    },
  };
}
