// Car models. Bodies are lofted: cross-sections along the length, each a
// rounded shape with a body side, a shoulder and a narrower glasshouse on top,
// joined into one smooth surface. The nose points along +z.
import * as THREE from 'three';
import { curve, lerp, clamp } from './util.js';
import { plateTex, glowTex } from './textures.js';
import { mergeGeoms } from './geom.js';
import { buildCockpit } from './cockpit.js';

const HALF = 15; // points per half section

function sectionHalf(P, z) {
  const w = P.half(z), wt = Math.min(P.topHalf(z), w - 0.08), ys = P.shoulder(z), yt = Math.max(P.top(z), ys + 0.03);
  const yb = Math.min(P.bottom(z), ys - 0.07);
  const sideTop = ys - 0.05;
  const a = [w - 0.1, ys + 0.014], b = [wt, yt - 0.05];
  const pts = [
    [0, yb], [w * 0.45, yb], [w - 0.12, yb], [w - 0.05, yb + 0.025], [w - 0.02, yb + 0.08],
    [w, lerp(yb + 0.08, sideTop, 0.55)], [w - 0.006, sideTop], [w - 0.03, ys - 0.004], a,
    [lerp(a[0], b[0], 1 / 3), lerp(a[1], b[1], 1 / 3)], [lerp(a[0], b[0], 2 / 3), lerp(a[1], b[1], 2 / 3)],
    b, [wt - 0.07, yt - 0.012], [wt * 0.5, yt - 0.002], [0, yt],
  ];
  // Round off the nose and tail in plan and side view.
  const nose = P.zf - P.noseR, tail = P.zr + P.tailR;
  let q = 1;
  if (z > nose) q = Math.sqrt(Math.max(0, 1 - ((z - nose) / P.noseR) ** 2));
  else if (z < tail) q = Math.sqrt(Math.max(0, 1 - ((tail - z) / P.tailR) ** 2));
  if (q < 1) {
    const cy = (yb + yt) * 0.5;
    const sx = lerp(P.endW, 1, q), sy = lerp(P.endH, 1, q);
    for (const p of pts) { p[0] *= sx; p[1] = cy + (p[1] - cy) * sy; }
  }
  return pts;
}

// Returns a geometry with groups: 0 paint, 1 glass, and the section stations.
function loft(P, stations) {
  const pos = [], idx = [], groupsBody = [], groupsGlass = [];
  const M = HALF * 2 - 2;
  const ring = (z) => {
    const h = sectionHalf(P, z), out = [];
    for (let k = 0; k < HALF; k++) out.push([h[k][0], h[k][1]]);
    for (let k = HALF - 2; k >= 1; k--) out.push([-h[k][0], h[k][1]]);
    return out;
  };
  for (const z of stations) for (const [x, y] of ring(z)) pos.push(x, y, z);
  const halfIdx = j => (j < HALF ? j : M - j);
  for (let s = 0; s < stations.length - 1; s++) {
    const zm = (stations[s] + stations[s + 1]) / 2;
    for (let j = 0; j < M; j++) {
      const j1 = (j + 1) % M;
      const a = s * M + j, b = s * M + j1, c = (s + 1) * M + j1, d = (s + 1) * M + j;
      const band = Math.min(halfIdx(j), halfIdx(j1));
      const glass = P.isGlass ? P.isGlass(band, zm) : false;
      (glass ? groupsGlass : groupsBody).push(a, b, c, a, c, d);
    }
  }
  // End caps (flat, own vertices so they shade crisply).
  const capBody = [];
  for (const [s, front] of [[0, false], [stations.length - 1, true]]) {
    const base = pos.length / 3, z = stations[s];
    let cx = 0, cy = 0;
    for (let j = 0; j < M; j++) { const o = (s * M + j) * 3; pos.push(pos[o], pos[o + 1], pos[o + 2]); cy += pos[o + 1]; }
    cy /= M; pos.push(cx, cy, z);
    const c = base + M;
    for (let j = 0; j < M; j++) {
      const j1 = (j + 1) % M;
      if (front) capBody.push(c, base + j, base + j1); else capBody.push(c, base + j1, base + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const all = [...groupsBody, ...capBody, ...groupsGlass];
  g.setIndex(all);
  g.addGroup(0, groupsBody.length + capBody.length, 0);
  g.addGroup(groupsBody.length + capBody.length, groupsGlass.length, 1);
  g.computeVertexNormals();
  return g;
}

function stationsFor(P, n, arch = 8) {
  const st = [];
  for (let i = 0; i <= n; i++) {
    // Denser at the ends so the rounding is smooth.
    const t = i / n, e = 0.5 - 0.5 * Math.cos(t * Math.PI);
    st.push(lerp(P.zr, P.zf, lerp(t, e, 0.6)));
  }
  // Extra stations around each wheel arch.
  for (const wz of [P.wzf, P.wzr]) for (let k = -arch; k <= arch; k++) st.push(wz + k / arch * (P.archR + 0.02));
  return [...new Set(st.map(v => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
}

function archBottom(P, base) {
  return z => {
    let y = base(z);
    for (const wz of [P.wzf, P.wzr]) {
      const dz = z - wz;
      if (Math.abs(dz) < P.archR) y = Math.max(y, P.wheelR + Math.sqrt(P.archR * P.archR - dz * dz) * P.archLift);
    }
    return y;
  };
}

// ---------------------------------------------------------------------------
// The hero car: the "Vento SV", a wedge-shaped V12 supercar.
// ---------------------------------------------------------------------------
export const HERO_DIMS = { wzf: 1.285, wzr: -1.38, track: 1.66, wheelR: 0.345, len: 4.61, width: 2.06 };

const HERO = {
  zf: 2.305, zr: -2.305, noseR: 0.2, tailR: 0.06, endW: 0.84, endH: 0.62,
  wzf: HERO_DIMS.wzf, wzr: HERO_DIMS.wzr, wheelR: 0.345, archR: 0.42, archLift: 0.96,
  top: curve([[-2.305, 0.93], [-2.15, 0.97], [-1.6, 1.0], [-0.9, 1.07], [-0.45, 1.125], [-0.1, 1.13], [0.25, 1.06], [0.6, 0.95], [0.9, 0.855], [1.3, 0.83], [1.8, 0.775], [2.15, 0.66], [2.305, 0.52]]),
  half: curve([[-2.305, 0.95], [-2.0, 1.0], [-1.4, 1.035], [-0.6, 0.99], [0.2, 0.98], [1.3, 1.03], [1.9, 1.0], [2.2, 0.93], [2.305, 0.86]]),
  topHalf: curve([[-2.305, 0.76], [-1.5, 0.72], [-0.9, 0.68], [-0.3, 0.64], [0.3, 0.66], [0.9, 0.78], [1.5, 0.84], [2.305, 0.76]]),
  shoulder: curve([[-2.305, 0.85], [-1.5, 0.885], [-0.6, 0.86], [0.3, 0.8], [0.9, 0.785], [1.3, 0.8], [1.7, 0.765], [2.05, 0.64], [2.305, 0.48]]),
  bottom: null,
  isGlass(band, z) {
    if (band >= 11 && z > -0.07 && z < 0.86) return true;               // windscreen
    if (band >= 8 && band <= 10 && z > -0.78 + (band - 8) * 0.05 && z < 0.66 - (band - 8) * 0.14) return true; // side windows
    return false;
  },
};
HERO.bottom = archBottom(HERO, curve([[-2.305, 0.3], [-2.0, 0.19], [-1.0, 0.16], [1.6, 0.16], [2.1, 0.2], [2.305, 0.27]]));

export const PAINTS = {
  pearl: { name: 'Pearl White', color: 0xe9e6e0, metal: 0.25, rough: 0.3 },
  arancio: { name: 'Arancio', color: 0xff6a10, metal: 0.55, rough: 0.28 },
  giallo: { name: 'Giallo', color: 0xf3c218, metal: 0.45, rough: 0.28 },
  verde: { name: 'Verde Mantis', color: 0x5bd13a, metal: 0.55, rough: 0.3 },
  rosso: { name: 'Rosso', color: 0xb5121b, metal: 0.55, rough: 0.28 },
  blu: { name: 'Blu Notte', color: 0x1b3d8f, metal: 0.65, rough: 0.3 },
  viola: { name: 'Viola', color: 0x6a2bbd, metal: 0.65, rough: 0.3 },
  nero: { name: 'Nero', color: 0x0d0d10, metal: 0.4, rough: 0.25 },
  grigio: { name: 'Grigio', color: 0x7b8088, metal: 0.7, rough: 0.32 },
};

function makeWheel(r, width, rimMat, tyreMat, discMat, caliperMat, side) {
  const g = new THREE.Group();
  // Tyre: a lathed rounded profile around the axle (x).
  const prof = [];
  const rr = r - 0.1, hwid = width / 2;
  prof.push(new THREE.Vector2(rr, -hwid));
  for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 + k / 8 * Math.PI; prof.push(new THREE.Vector2(r - 0.045 + Math.cos(a) * 0.045, Math.sin(a) * (hwid - 0.02) * 1.0)); }
  prof.push(new THREE.Vector2(rr, hwid));
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(prof, 36).rotateZ(Math.PI / 2), tyreMat);
  g.add(tyre);
  // Rim face: a dished disc with five twin spokes.
  const face = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 0.03, 32).rotateZ(Math.PI / 2), discMat);
  face.position.x = side * (hwid - 0.07); g.add(face);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rr - 0.01, 0.018, 8, 36).rotateY(Math.PI / 2), rimMat);
  lip.position.x = side * (hwid - 0.03); g.add(lip);
  for (let k = 0; k < 5; k++) {
    for (const off of [-0.09, 0.09]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.035, rr - 0.04, 0.04), rimMat);
      const a = k / 5 * Math.PI * 2 + off;
      sp.position.set(side * (hwid - 0.045), Math.cos(a) * (rr / 2), Math.sin(a) * (rr / 2));
      sp.rotation.x = a; g.add(sp);
    }
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.06, 12).rotateZ(Math.PI / 2), rimMat);
  hub.position.x = side * (hwid - 0.04); g.add(hub);
  // Brake disc and caliper (the caliper doesn't spin, see Vehicle view).
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(rr - 0.05, rr - 0.05, 0.03, 28).rotateZ(Math.PI / 2), discMat);
  disc.position.x = side * (hwid - 0.12);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.1), caliperMat);
  caliper.position.set(side * (hwid - 0.1), rr - 0.11, -0.04);
  return { spin: g, disc, caliper };
}

export function makeHeroCar(paintKey = 'pearl') {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body); // pitches and rolls on the suspension
  const pt = PAINTS[paintKey] || PAINTS.pearl;
  const paint = new THREE.MeshPhysicalMaterial({ color: pt.color, metalness: pt.metal, roughness: pt.rough, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.0 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x07080a, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, transparent: true, opacity: 0.86 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.45, metalness: 0.35 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.32, metalness: 0.5 });
  const matte = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.12, metalness: 1 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x400404, emissive: 0xff2208, emissiveIntensity: 3.2, roughness: 0.3 });
  const tailLens = new THREE.MeshPhysicalMaterial({ color: 0x3a0606, roughness: 0.1, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.85 });
  const head = new THREE.MeshStandardMaterial({ color: 0xdfe8ff, emissive: 0xe8f0ff, emissiveIntensity: 2.2, roughness: 0.2 });

  const bodyGeo = loft(HERO, stationsFor(HERO, 70));
  const shell = new THREE.Mesh(bodyGeo, [paint, glass]);
  shell.castShadow = true; shell.receiveShadow = true;
  body.add(shell);

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = body) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m;
  };
  const zr = HERO.zr;

  // Rear: black panel with the lights, exhaust, plate and diffuser.
  add(new THREE.BoxGeometry(1.82, 0.42, 0.06), black, 0, 0.56, zr - 0.005);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.5, 0.17, 0.05), tailLens, s * 0.64, 0.72, zr - 0.035);
    // Three slanted bars per side, like an arrowhead.
    for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.11, 0.03, 0.03), tail, s * (0.48 + k * 0.12), 0.72 + (k === 1 ? 0.03 : -0.02), zr - 0.05, 0, 0, s * (k === 1 ? -0.5 : 0.5));
    add(new THREE.BoxGeometry(0.12, 0.025, 0.03), tail, s * 0.62, 0.66, zr - 0.05);
    // Rear haunch intake: a slanted scoop behind the door.
    const scoop = new THREE.Shape([new THREE.Vector2(-0.28, -0.12), new THREE.Vector2(0.34, -0.12), new THREE.Vector2(0.2, 0.13), new THREE.Vector2(-0.3, 0.13)]);
    const sg = new THREE.ShapeGeometry(scoop);
    const sm = add(sg, matte, s * (HERO.half(-0.75) - 0.004 + 0.012), 0.66, -0.75, 0, s * Math.PI / 2, 0);
    sm.castShadow = false;
    // Door shut lines.
    for (const [z, y0, y1] of [[0.74, 0.3, 0.8], [-0.36, 0.3, 0.84]]) add(new THREE.BoxGeometry(0.01, y1 - y0, 0.012), matte, s * (HERO.half(z) + 0.002), (y0 + y1) / 2, z).castShadow = false;
    // Mirrors.
    add(new THREE.BoxGeometry(0.2, 0.085, 0.13), paint, s * 1.04, 0.9, 0.5, 0, s * 0.12, 0);
    add(new THREE.BoxGeometry(0.16, 0.025, 0.035), black, s * 0.93, 0.86, 0.53);
    // Headlights.
    const hl = add(new THREE.BoxGeometry(0.42, 0.06, 0.22), glass, s * 0.66, 0.66, 2.0, -0.45, s * -0.32, 0);
    add(new THREE.BoxGeometry(0.34, 0.02, 0.02), head, s * 0.66, 0.68, 2.04, -0.45, s * -0.32, 0);
    hl.castShadow = false;
    // Side skirt.
    add(new THREE.BoxGeometry(0.05, 0.13, 1.75), carbon, s * 0.985, 0.235, -0.04);
  }
  // Exhaust: one wide oval in the middle.
  const ex = add(new THREE.TorusGeometry(0.15, 0.035, 10, 28), chrome, 0, 0.37, zr - 0.04);
  ex.scale.set(1.7, 0.65, 1);
  add(new THREE.CircleGeometry(0.15, 24), matte, 0, 0.37, zr - 0.035, 0, Math.PI, 0).scale.set(1.7, 0.65, 1);
  const plate = add(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.5 }), 0, 0.55, zr - 0.04, 0, Math.PI, 0);
  plate.castShadow = false;
  for (let k = -3; k <= 3; k++) add(new THREE.BoxGeometry(0.02, 0.12, 0.35), black, k * 0.22, 0.22, zr + 0.12);
  add(new THREE.BoxGeometry(1.7, 0.03, 0.5), black, 0, 0.17, zr + 0.25);
  // Rear wing on two struts.
  add(new THREE.BoxGeometry(1.92, 0.035, 0.32), carbon, 0, 1.2, -2.0, 0.08);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.03, 0.16, 0.36), carbon, s * 0.96, 1.16, -2.0);
    add(new THREE.BoxGeometry(0.05, 0.24, 0.12), carbon, s * 0.55, 1.06, -2.0, 0.15);
  }
  // Engine cover vents.
  for (let k = 0; k < 5; k++) {
    const z = -1.0 - k * 0.2, y = HERO.top(z) + 0.004;
    add(new THREE.BoxGeometry(0.95, 0.015, 0.1), black, 0, y, z, -0.08);
  }
  // Front: lower intakes, splitter.
  add(new THREE.BoxGeometry(1.5, 0.12, 0.06), matte, 0, 0.32, 2.27);
  add(new THREE.BoxGeometry(1.75, 0.025, 0.25), carbon, 0, 0.19, 2.17);
  // Wipers.
  add(new THREE.BoxGeometry(0.5, 0.012, 0.02), black, 0.2, 0.88, 0.8, -0.3);
  // Arch liners hide the inside of the body.
  for (const wz of [HERO.wzf, HERO.wzr]) {
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 1.96, 24, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.BackSide }));
    liner.position.set(0, HERO.wheelR, wz); body.add(liner);
  }
  // Contact shadow.
  const cs = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 5.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x000000, transparent: true, opacity: 0.8, depthWrite: false }));
  cs.position.y = 0.02; cs.renderOrder = 2; root.add(cs);

  // Wheels.
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.25, metalness: 0.9 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.82, side: THREE.DoubleSide });
  const discMat = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.35, metalness: 0.9 });
  const calMat = new THREE.MeshStandardMaterial({ color: 0xd4a312, roughness: 0.4, metalness: 0.3 });
  const wheels = [];
  for (const [wz, front, wid] of [[HERO.wzf, true, 0.27], [HERO.wzr, false, 0.33]]) for (const s of [-1, 1]) {
    // s = +1 is the car's left (+x).
    const steer = new THREE.Group(); steer.position.set(s * (HERO_DIMS.track / 2 + (front ? 0 : 0.03)), HERO.wheelR, wz); root.add(steer);
    const w = makeWheel(HERO.wheelR, wid, rimMat, tyreMat, discMat, calMat, s);
    steer.add(w.spin); steer.add(w.disc); steer.add(w.caliper);
    w.spin.traverse(o => { o.castShadow = true; });
    wheels.push({ steer, spin: w.spin, front, side: s, baseY: HERO.wheelR });
  }

  // Glow sprites on the lights so they bloom even on lower settings.
  const glow = glowTex();
  const tailGlow = [], headGlow = [];
  for (const s of [-1, 1]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff2a10, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(s * 0.62, 0.72, zr - 0.12); sp.scale.set(0.9, 0.5, 1); body.add(sp); tailGlow.push(sp);
    const hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xdfe8ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    hs.position.set(s * 0.66, 0.67, 2.12); hs.scale.set(0.7, 0.4, 1); body.add(hs); headGlow.push(hs);
  }
  // Nitro flame from the exhaust.
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x5aa8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  flame.position.set(0, 0.37, zr - 0.35); flame.scale.set(0.6, 0.45, 1); body.add(flame);

  mergeByMaterial(body, shell);
  const cockpit = buildCockpit(body, bodyGeo);
  for (const w of wheels) mergeByMaterial(w.spin);
  root.userData = { body, wheels, paint, tail, tailGlow, headGlow, flame, cockpit };
  return root;
}



// Merge a group's plain meshes that share a material into one mesh each, so
// the car is a handful of draw calls instead of a hundred.
function mergeByMaterial(group, skip) {
  const byMat = new Map();
  for (const o of [...group.children]) {
    if (!o.isMesh || o === skip || Array.isArray(o.material) || o.material.map) continue;
    o.updateMatrix();
    const g = o.geometry.clone().applyMatrix4(o.matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    let a = byMat.get(o.material); if (!a) byMat.set(o.material, a = { geos: [], shadow: o.castShadow });
    a.geos.push(g); group.remove(o);
  }
  for (const [mat, a] of byMat) {
    const m = new THREE.Mesh(mergeGeoms(a.geos), mat); m.castShadow = a.shadow; group.add(m);
  }
}

export function setPaint(car, key) {
  const pt = PAINTS[key] || PAINTS.pearl, m = car.userData.paint;
  m.color.setHex(pt.color); m.metalness = pt.metal; m.roughness = pt.rough;
}

// ---------------------------------------------------------------------------
// Traffic cars: one merged geometry per type with vertex colours (white body
// tinted per instance, dark glass, black tyres), plus a separate light mesh.
// ---------------------------------------------------------------------------
function trafficType(o) {
  const P = {
    zf: o.len / 2, zr: -o.len / 2, noseR: o.noseR, tailR: o.tailR, endW: 0.88, endH: 0.75,
    wzf: o.len / 2 - o.fo, wzr: -o.len / 2 + o.ro, wheelR: o.wr, archR: o.wr + 0.06, archLift: 0.95,
    top: curve(o.top), half: curve([[-o.len / 2, o.w * 0.94], [-o.len / 2 + 0.6, o.w], [o.len / 2 - 0.6, o.w], [o.len / 2, o.w * 0.92]]),
    topHalf: curve(o.topHalf), shoulder: curve(o.shoulder), bottom: null,
    isGlass: (band, z) => (band >= 8 && band <= 10 && z > o.gz[0] && z < o.gz[1]) || (band >= 11 && ((z > o.ws[0] && z < o.ws[1]) || (z > o.rw[0] && z < o.rw[1]))),
  };
  P.bottom = archBottom(P, () => o.clear);
  const g = loft(P, stationsFor(P, 16, 3));
  // Colour by group, then split into triangles so colours stay crisp.
  const gi = g.toNonIndexed();
  const n = gi.attributes.position.count, colr = new Float32Array(n * 3);
  const bodyTris = g.groups[0].count;
  for (let i = 0; i < n; i++) {
    const glass = i >= bodyTris;
    colr.set(glass ? [0.05, 0.06, 0.07] : [1, 1, 1], i * 3);
  }
  if (o.livery) {   // a police car: dark body, white doors
    const pa = gi.attributes.position;
    for (let t = 0; t < bodyTris; t += 3) {
      const ax = pa.getX(t), ay = pa.getY(t), az = pa.getZ(t), bx = pa.getX(t + 1), by = pa.getY(t + 1), bz = pa.getZ(t + 1), cx2 = pa.getX(t + 2), cy2 = pa.getY(t + 2), cz2 = pa.getZ(t + 2);
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx2 - ax, vy = cy2 - ay, vz = cz2 - az;
      let nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1; nx /= nl;
      const cy = (ay + by + cy2) / 3, cz = (az + bz + cz2) / 3;
      const door = Math.abs(nx) > 0.6 && cz > -o.len * 0.28 && cz < o.len * 0.18 && cy > o.clear + 0.14 && cy < P.shoulder(cz) - 0.04;
      for (let k = 0; k < 3; k++) colr.set(door ? [0.92, 0.93, 0.95] : [0.03, 0.035, 0.05], (t + k) * 3);
    }
  }
  gi.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  gi.clearGroups();
  const parts = [gi];
  const black = (geo) => { const c = []; for (let i = 0; i < geo.attributes.position.count; i++) c.push(0.04, 0.04, 0.045); geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return geo; };
  const grey = (geo) => { const c = []; for (let i = 0; i < geo.attributes.position.count; i++) c.push(0.35, 0.36, 0.38); geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return geo; };
  for (const wz of [P.wzf, P.wzr]) for (const s of [-1, 1]) {
    const t = new THREE.CylinderGeometry(o.wr, o.wr, 0.22, 12).rotateZ(Math.PI / 2).translate(s * (o.w - 0.14), o.wr, wz);
    parts.push(black(t.toNonIndexed()));
    const r = new THREE.CylinderGeometry(o.wr * 0.6, o.wr * 0.6, 0.02, 8).rotateZ(Math.PI / 2).translate(s * (o.w - 0.02), o.wr, wz);
    parts.push(grey(r.toNonIndexed()));
  }
  parts.push(black(new THREE.BoxGeometry(o.w * 1.6, 0.18, 0.08).translate(0, o.clear + 0.12, P.zr - 0.02).toNonIndexed()));
  for (const p of parts) { p.deleteAttribute('uv'); }
  const geo = mergeGeoms(parts);
  // Lights.
  const lp = [];
  const tl = new THREE.Color(5, 0.35, 0.15), hl = new THREE.Color(5, 4.6, 4);
  for (const s of [-1, 1]) {
    lp.push(colorize(new THREE.BoxGeometry(0.34, 0.1, 0.04).translate(s * (o.w - 0.25), o.tlY, P.zr - 0.01), tl));
    lp.push(colorize(new THREE.BoxGeometry(0.3, 0.09, 0.04).translate(s * (o.w - 0.28), o.hlY, P.zf + 0.0), hl));
  }
  return { geo, lights: mergeGeoms(lp), len: o.len, width: o.w * 2, mass: o.mass || 1400, rad: o.rad || 0.95 };
}
function colorize(g, c) { g = g.toNonIndexed(); g.deleteAttribute('uv'); const a = []; for (let i = 0; i < g.attributes.position.count; i++) a.push(c.r, c.g, c.b); g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return g; }

const SALOON = {
      len: 4.75, w: 0.9, wr: 0.33, fo: 0.95, ro: 1.05, clear: 0.2, noseR: 0.25, tailR: 0.18, tlY: 0.82, hlY: 0.7,
      top: [[-2.375, 0.95], [-2.0, 1.0], [-1.4, 1.02], [-0.9, 1.42], [0.4, 1.45], [1.0, 1.0], [2.0, 0.88], [2.375, 0.72]],
      topHalf: [[-2.4, 0.78], [-0.9, 0.62], [0.4, 0.66], [1.0, 0.8], [2.4, 0.78]],
      shoulder: [[-2.375, 0.9], [0, 0.98], [2.375, 0.68]],
      gz: [-1.05, 0.95], ws: [0.45, 1.02], rw: [-1.4, -0.88],
};
const SUV = {
      len: 4.8, w: 0.97, wr: 0.38, fo: 0.95, ro: 1.0, clear: 0.3, noseR: 0.25, tailR: 0.12, tlY: 1.05, hlY: 0.9,
      top: [[-2.4, 1.55], [-2.2, 1.72], [0.6, 1.76], [1.3, 1.22], [2.1, 1.1], [2.4, 0.92]],
      topHalf: [[-2.4, 0.84], [0.6, 0.78], [1.3, 0.86], [2.4, 0.84]],
      shoulder: [[-2.4, 1.12], [0, 1.15], [1.4, 1.1], [2.4, 0.85]],
      gz: [-2.1, 1.25], ws: [0.6, 1.3], rw: [-2.4, -2.0],
};
export function trafficModels() {
  return [
    trafficType(SALOON),
    trafficType(SUV),
    trafficType({ // hatchback
      len: 4.1, w: 0.87, wr: 0.31, fo: 0.82, ro: 0.72, clear: 0.18, noseR: 0.22, tailR: 0.1, tlY: 0.95, hlY: 0.72,
      top: [[-2.05, 1.2], [-1.85, 1.42], [0.3, 1.48], [0.9, 1.02], [1.7, 0.9], [2.05, 0.74]],
      topHalf: [[-2.05, 0.74], [0.3, 0.66], [0.9, 0.8], [2.05, 0.78]],
      shoulder: [[-2.05, 0.98], [0, 0.98], [2.05, 0.7]],
      gz: [-1.75, 0.85], ws: [0.3, 0.92], rw: [-2.05, -1.8],
    }),
    trafficType({ // pickup / van
      len: 5.2, w: 1.0, wr: 0.4, fo: 0.95, ro: 1.15, clear: 0.32, noseR: 0.2, tailR: 0.06, tlY: 1.0, hlY: 0.95,
      top: [[-2.6, 1.95], [-2.4, 2.1], [1.2, 2.1], [1.6, 1.35], [2.3, 1.2], [2.6, 1.0]],
      topHalf: [[-2.6, 0.9], [1.2, 0.86], [1.6, 0.9], [2.6, 0.9]],
      shoulder: [[-2.6, 1.2], [1.3, 1.2], [2.6, 0.95]],
      gz: [-0.2, 1.4], ws: [1.2, 1.62], rw: [-9, -9],
    }),
    trafficType({ // box truck
      len: 8.2, w: 1.28, wr: 0.5, fo: 1.15, ro: 1.5, clear: 0.5, noseR: 0.3, tailR: 0.05, tlY: 1.0, hlY: 1.0, mass: 7000, rad: 1.35,
      top: [[-4.1, 3.5], [-3.9, 3.72], [1.05, 3.74], [1.3, 2.95], [3.3, 2.9], [3.9, 2.2], [4.1, 1.8]],
      topHalf: [[-4.1, 1.24], [1.05, 1.24], [1.3, 1.1], [4.1, 0.98]],
      shoulder: [[-4.1, 3.4], [1.0, 3.4], [1.4, 1.55], [3.4, 1.55], [4.1, 1.15]],
      gz: [1.6, 3.5], ws: [3.2, 3.95], rw: [-9, -9],
    }),
    trafficType({ // bus
      len: 11.6, w: 1.3, wr: 0.5, fo: 1.6, ro: 2.6, clear: 0.45, noseR: 0.35, tailR: 0.15, tlY: 1.0, hlY: 0.9, mass: 11000, rad: 1.35,
      top: [[-5.8, 3.2], [-5.5, 3.35], [5.3, 3.35], [5.8, 3.0]],
      topHalf: [[-5.8, 1.2], [5.8, 1.2]],
      shoulder: [[-5.8, 1.2], [5.8, 1.2]],
      gz: [-5.3, 5.3], ws: [5.2, 5.8], rw: [-5.8, -5.3],
    }),
  ];
}

// Police vehicles: the saloon and the SUV in black and white, with their light bars added in police.js.
export function policeModels() { return { cruiser: trafficType({ ...SALOON, livery: true }), truck: trafficType({ ...SUV, livery: true, mass: 2600 }) }; }
export { loft, stationsFor, archBottom, mergeByMaterial };

