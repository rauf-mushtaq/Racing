// The fine detail of a car, and how it is drawn (see carModel.js for the bodies). Each kind of car comes in two levels of detail, and every car in the street is
// drawn at the one its distance calls for, the way a streaming engine swaps a far model for a near one:
//   FAR  (more than 55 m away): the body with its glass painted on, and the lamps: three draw calls for a whole street of them.
//   NEAR (closer): the body without painted glass, real glass with the street reflected in it and a driver's seat, dashboard and steering wheel behind it, mirrors,
//        door handles and shut lines, a grille, bumpers and plates; tyres with a tread, steel rims with brake discs and callipers, that turn, and the front pair
//        steer; and, on a police car, a push bar, a light bar with LED modules, spotlights, an aerial and "POLICE" in reflective letters.
// Materials are physically based: the paint is a metallic base with a clear coat on top (its own sheen in the reflections), the glass is smooth and dark and
// takes the reflections of the whole street from the same screen-space ray tracing as the road (ssr.js), the rims are brushed steel, the tyres are
// rubber with a normal map for the tread, and the lamps are emissive (they bloom).
import * as THREE from 'three';
import { attachSSR } from './ssr.js';
import { paintFlakes } from './paintfx.js';
import { mergeGeomsUV } from './geom.js';

export const NEAR_R = 55;                                   // metres: closer than this a car is drawn in full
const _c = new THREE.Color();
const paintGeo = (g, c) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2)); return g; };
const flatUV = (g, u, v) => { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, u, v); return g; };
const C = (r, g, b) => new THREE.Color(r, g, b);
export const box = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => flatUV(paintGeo(new THREE.BoxGeometry(w, h, d).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z), c), 0.5, 0.05);
export const cyl = (rt, rb, h, seg, x, y, z, c, rx = 0, ry = 0, rz = 0) => flatUV(paintGeo(new THREE.CylinderGeometry(rt, rb, h, seg).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z), c), 0.5, 0.05);

// ---- Textures made from arrays of pixels (not canvases: see weapons.js) -----------------------------------------------------------------------------------------------
let treadN = null;
function treadNormal() {                                    // blocks and grooves across the tread (the middle 40% of v), flat on the sidewall
  if (treadN) return treadN; const S = 64, d = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; let nx = 0, nz = 1;
    if (v > 0.3 && v < 0.7) { const gx = Math.sin(u * Math.PI * 2 * 6) , gy = Math.sin((v - 0.3) / 0.4 * Math.PI * 2 * 2.5 + u * 6.28 * 3), b = Math.max(gx, gy) > 0.55; nx = b ? 0.55 * Math.sign(gx || 1) : 0.0; nz = Math.sqrt(1 - nx * nx); }
    const o = (y * S + x) * 4; d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = 128; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  treadN = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); treadN.wrapS = treadN.wrapT = THREE.RepeatWrapping; treadN.magFilter = THREE.LinearFilter; treadN.minFilter = THREE.LinearMipmapLinearFilter; treadN.generateMipmaps = true; treadN.needsUpdate = true; return treadN;
}
// The letters on a police car: "POLICE" and a badge in white on clear, one atlas for the whole fleet. (Made when the game starts, like the other canvases.)
let decalTex = null;
export function decalAtlas() {
  if (decalTex) return decalTex; const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 256); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#10151c'; g.font = '900 108px "Barlow Condensed", Arial Narrow, Arial, sans-serif'; g.fillText('POLICE', 256, 70);      // (upper half: dark letters, for the white doors)
  g.fillStyle = '#f2f4f6'; g.fillText('POLICE', 256, 196);                                                                                 // (lower half: white letters, for the dark bonnet and boot)
  decalTex = new THREE.CanvasTexture(c); decalTex.colorSpace = THREE.SRGBColorSpace; decalTex.anisotropy = 4; return decalTex;
}

// ---- Wheels -------------------------------------------------------------------------------------------------------------------------------------------------------------
// One wheel, lying along the x axis and the same from both sides (so the left and right wheels are the same instance), of radius wr and width ww.
export function wheelGeometry(wr, ww, police = false) {
  const hw = ww / 2, rimR = wr * 0.62, parts = [];
  const prof = [[rimR * 0.98, -hw * 0.9], [rimR, -hw], [wr * 0.8, -hw * 1.03], [wr * 0.93, -hw * 0.95], [wr * 0.99, -hw * 0.6], [wr, -hw * 0.2], [wr, hw * 0.2], [wr * 0.99, hw * 0.6], [wr * 0.93, hw * 0.95], [wr * 0.8, hw * 1.03], [rimR, hw], [rimR * 0.98, hw * 0.9]];
  // (a lathe turns about y, running along its profile from v = 0 to 1; the profile above runs from one rim edge round the tread to the other)
  const tyre = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28).rotateZ(Math.PI / 2);
  parts.push(paintGeo(tyre, C(0.06, 0.06, 0.065)));
  const steel = police ? C(0.62, 0.64, 0.68) : C(0.72, 0.74, 0.78), dark = C(0.09, 0.09, 0.1);
  parts.push(flatUV(paintGeo(new THREE.CylinderGeometry(rimR, rimR, ww * 0.18, 24).rotateZ(Math.PI / 2), dark), 0.5, 0.05));               // the barrel
  for (const s of [-1, 1]) {
    parts.push(cyl(rimR * 0.96, rimR * 0.96, 0.012, 24, s * hw * 0.62, 0, 0, steel, 0, 0, Math.PI / 2));                                      // the face of the rim
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; parts.push(box(hw * 0.2, rimR * 0.82, 0.05 + 0.0, s * hw * 0.66, Math.cos(a) * rimR * 0.5, Math.sin(a) * rimR * 0.5, dark.clone().multiplyScalar(0.5), a, 0, 0)); }    // gaps between spokes (dark)
    parts.push(cyl(rimR * 0.2, rimR * 0.2, 0.03, 12, s * hw * 0.7, 0, 0, C(0.85, 0.86, 0.9), 0, 0, Math.PI / 2));                            // the centre cap
  }
  parts.push(cyl(rimR * 0.86, rimR * 0.86, 0.02, 24, 0, 0, 0, C(0.25, 0.26, 0.28), 0, 0, Math.PI / 2));                                       // the brake disc, seen through the spokes
  parts.push(box(0.05, rimR * 0.34, rimR * 0.46, hw * 0.18, rimR * 0.5, rimR * 0.42, police ? C(0.75, 0.05, 0.05) : C(0.55, 0.5, 0.2)));        // the calliper
  return mergeGeomsUV(parts);
}

// ---- The details of a body ---------------------------------------------------------------------------------------------------------------------------------------
// o: the car's spec (len, w, wr, clear, shoulder(), top(), ...), P: the loft's curves. Returns { trim, lamps, inside } as lists of geometries.
export function detailParts(o, P, police) {
  const trim = [], lamps = [], inside = [], zf = P.zf, zr = P.zr, w = o.w, black = C(0.035, 0.036, 0.04), chrome = C(0.7, 0.72, 0.76), rub = C(0.05, 0.05, 0.055);
  const sh = P.shoulder, top = P.top, doorZ = o.gz ? o.gz[0] : -1, wsZ = o.ws ? o.ws[0] : 0.5;
  // Mirrors and their stems, door handles and the shut lines.
  for (const s of [-1, 1]) {
    const mz = wsZ - 0.1, my = sh(mz) + 0.16;
    trim.push(box(0.1, 0.12, 0.2, s * (w + 0.07), my, mz, black), box(0.05, 0.05, 0.1, s * (w - 0.04), my - 0.05, mz + 0.02, black));
    for (const hz of [wsZ - 0.55, doorZ + 0.55]) trim.push(box(0.02, 0.025, 0.16, s * (w - 0.005), sh(hz) - 0.12, hz, chrome));
    for (const lz of [wsZ - 1.0, doorZ + 0.05 + 0.0, doorZ - 0.9]) trim.push(box(0.012, sh(lz) - o.clear - 0.3, 0.012, s * (w - 0.002), (sh(lz) + o.clear + 0.1) / 2, lz, black));
  }
  // The front: a grille with slats, a lower intake, a bumper, a plate; the back: a bumper and a plate.
  const gy = o.hlY - 0.08;
  trim.push(box(w * 1.0, 0.13, 0.05, 0, gy, zf - 0.04, black), box(w * 1.5, 0.16, 0.14, 0, o.clear + 0.14, zf - 0.08, black), box(w * 1.2, 0.05, 0.12, 0, o.clear + 0.3, zf - 0.07, rub));
  for (let k = -4; k <= 4; k++) trim.push(box(0.012, 0.11, 0.02, k * w * 0.11, gy, zf - 0.005, chrome));
  trim.push(box(0.5, 0.12, 0.012, 0, o.clear + 0.3, zf + 0.0, C(0.92, 0.9, 0.82)), box(0.5, 0.12, 0.012, 0, o.clear + 0.28, zr - 0.0, C(0.92, 0.9, 0.82)));
  trim.push(box(w * 1.7, 0.2, 0.14, 0, o.clear + 0.12, zr + 0.06, black));
  // Lamps: the headlight clusters (a white lens, an amber one beside it) and tail lamps with a reversing lamp; all glow.
  for (const s of [-1, 1]) {
    lamps.push(box(0.34, 0.1, 0.03, s * (w - 0.27), o.hlY, zf - 0.005, C(6, 5.8, 5.2)), box(0.1, 0.07, 0.03, s * (w - 0.04), o.hlY - 0.02, zf - 0.03, C(5, 2.6, 0.2)));
    lamps.push(box(0.4, 0.09, 0.03, s * (w - 0.3), o.tlY, zr + 0.005, C(4.6, 0.25, 0.1)), box(0.1, 0.07, 0.03, s * (w - 0.55), o.tlY - 0.02, zr + 0.005, C(3.2, 3.0, 2.8)));
  }
  // What you see through the glass: two seats with headrests, the dashboard with a screen, a steering wheel, the rear bench; (and in a police car, a laptop and a shotgun rack).
  const small = o.len < 6.5, sy = o.clear + 0.36, sz = (wsZ + doorZ) / 2 - 0.1, dark = C(0.03, 0.03, 0.035), seat = C(0.07, 0.07, 0.075);
  if (small) for (const s of [-0.38, 0.38]) inside.push(box(0.5, 0.12, 0.5, s * w * 0.9, sy, sz - 0.1, seat), box(0.46, 0.5, 0.1, s * w * 0.9, sy + 0.3, sz - 0.36, seat, -0.18), box(0.2, 0.2, 0.08, s * w * 0.9, sy + 0.66, sz - 0.4, seat));
  if (small) inside.push(box(w * 1.7, 0.3, 0.35, 0, sy + 0.24, wsZ - 0.3, dark), box(0.34, 0.03, 0.34, w * 0.4, sy + 0.38, wsZ - 0.62, dark, 1.1), box(w * 1.7, 0.4, 0.5, 0, sy + 0.12, doorZ + 0.4, seat), box(w * 1.7, 0.5, 0.1, 0, sy + 0.34, doorZ + 0.1, seat, -0.15));
  if (police && small) { inside.push(box(0.3, 0.2, 0.04, 0, sy + 0.5, sz + 0.5, C(0.3, 0.6, 1.2), -0.3), box(0.04, 0.5, 0.04, 0.0, sy + 0.5, sz + 0.55, dark), box(0.1, 0.1, 0.9, -0.0, sy + 0.34, sz + 0.2, dark)); }
  if (police) {
    // The push bar (two uprights and cross bars on the nose), the spotlights on the door pillars, the aerial, and the strips of colour along the doors.
    for (const s of [-1, 1]) trim.push(box(0.05, 0.5, 0.05, s * w * 0.55, o.clear + 0.4, zf + 0.12, black), box(0.05, 0.5, 0.05, s * w * 0.3, o.clear + 0.4, zf + 0.12, black));
    trim.push(box(w * 1.2, 0.06, 0.06, 0, o.clear + 0.62, zf + 0.13, black), box(w * 1.2, 0.06, 0.06, 0, o.clear + 0.2, zf + 0.13, black), box(w * 1.0, 0.05, 0.05, 0, o.clear + 0.42, zf + 0.13, black));
    for (const s of [-1, 1]) { trim.push(cyl(0.045, 0.045, 0.14, 8, s * (w - 0.03), sh(wsZ) + 0.14, wsZ + 0.12, chrome, Math.PI / 2, 0, 0)); lamps.push(box(0.06, 0.06, 0.02, s * (w - 0.03), sh(wsZ) + 0.14, wsZ + 0.2, C(4, 4, 3.4))); }
    trim.push(cyl(0.006, 0.01, 0.55, 5, w * 0.6, top(zr + 0.6) + 0.27, zr + 0.7, black));
    trim.push(box(1.12, 0.07, 0.3, 0, (o.barY ?? 1.5) - 0.06, o.barZ ?? -0.2, black));                                    // the housing of the light bar (its lights are drawn by police.js)
  }
  return { trim, lamps, inside };
}

// ---- The decals (police) ----------------------------------------------------------------------------------------------------------------------------------------------
export function policeDecals(o, P) {
  const quads = [], q = (cx, cy, cz, w, h, nx, ny, nz, flip, row) => {                                    // a quad facing (nx, ny, nz), w wide and h tall, with the lettering from `row` of the atlas (0 dark, 1 white)
    const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * 0.5 + (row ? 0 : 0.5));
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), new THREE.Vector3(-nx, -ny, -nz), Math.abs(ny) > 0.9 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0)); g.applyMatrix4(m); g.translate(cx, cy, cz); return g.toNonIndexed();
  };
  const sh = P.shoulder, mz = (o.gz[0] + o.ws[0]) / 2 - 0.15;
  for (const s of [-1, 1]) quads.push(q(s * (o.w + 0.004), (sh(mz) + o.clear) / 2 + 0.02, mz, 1.3, 0.34, s, 0, 0, false, 0));
  quads.push(q(0, P.top(P.zf - 1.1) + 0.0, P.zf - 1.1, 1.0, 0.25, 0, 1, 0.12, false, 1));
  return quads.length ? mergeGeomsUV(quads.map(g => { const a = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; })) : null;
}

// ---- Materials ---------------------------------------------------------------------------------------------------------------------------------------------------------------
export function carMaterials() {
  const paint = attachSSR(new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.04, sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.8, 0.85, 1), envMapIntensity: 1.35 }), { range: 55, rough: 0.45, view: 120 });
  paintFlakes(paint, 0.6);
  const glass = attachSSR(new THREE.MeshPhysicalMaterial({ color: 0x0b1218, metalness: 0.9, roughness: 0.03, transparent: true, opacity: 0.58, envMapIntensity: 2.4, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }), { range: 55, rough: 0.2, view: 120 });
  const wheel = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.55, normalMap: treadNormal(), normalScale: new THREE.Vector2(0.9, 0.9), envMapIntensity: 0.9 });
  const details = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4, envMapIntensity: 0.7 });
  const lamps = new THREE.MeshBasicMaterial({ vertexColors: true });
  const decal = new THREE.MeshStandardMaterial({ map: null, vertexColors: true, transparent: true, roughness: 0.35, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false, envMapIntensity: 1.2 });
  decal.map = decalAtlas();
  return { paint, glass, wheel, details, lamps, decal };
}
