// The grand tourer for the escape mode: a 1960s-style British GT in silver birch, modelled from its silhouette: a long bonnet,
// an oval chrome grille, round headlamps in the wings, slim chrome bumpers with overriders, wire wheels with knock-off spinners,
// a fastback roof and a short tail with round lamps. It carries its gadgets: machine guns that slide out of the front wings,
// an armour plate that rises behind the cabin, and oil and smoke nozzles under the tail. (No badges or logos: the shape is the
// point, this is not a licensed car.)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { curve } from './util.js';
import { glowTex, plateTex } from './textures.js';
import { loft, stationsFor, archBottom, mergeByMaterial } from './carModel.js';
import { buildCockpit } from './cockpit.js';

export const GT_DIMS = { wzf: 1.25, wzr: -1.24, track: 1.40, wheelR: 0.32, len: 4.57, width: 1.7 };
// The physics: lighter than the supercar, a torquey straight-six, five gears and a good deal of help from Q Branch.
export const GT_SPEC = {
  mass: 1540, cgH: 0.5, rollH: 0.36, len: 4.57, wid: 1.7,
  wheelPos: [[1.25, -0.70], [1.25, 0.70], [-1.24, -0.70], [-1.24, 0.70]],
  wheelR: 0.32, wheelI: 1.1, engineI: 0.22,
  spring: [46000, 46000, 52000, 52000], damper: [3400, 3400, 3800, 3800], arb: [28000, 20000], travel: 0.12,
  mu: 1.12, kPeak: 0.1, aPeak: [0.13, 0.115], C: [1.55, 1.38],
  gears: [2.98, 1.88, 1.36, 1.0, 0.84], rev: 2.9, final: 3.77, eff: 0.9,
  idle: 900, redline: 6600, limiter: 6800, Tmax: 640, peakRpm: 4300,
  drag: 0.34, roll: 10, down: 0.35, brakeT: [2000, 2000, 1200, 1200], handT: 3000, steerMax: 0.58, frontDrive: 0.0,
  nitroForce: 7500,
};
const GT = {
  zf: 2.29, zr: -2.28, noseR: 0.5, tailR: 0.1, endW: 0.78, endH: 0.7,
  wzf: GT_DIMS.wzf, wzr: GT_DIMS.wzr, wheelR: GT_DIMS.wheelR, archR: 0.385, archLift: 0.95,
  top: curve([[-2.28, 0.88], [-2.2, 0.95], [-2.0, 0.99], [-1.7, 0.995], [-1.55, 1.03], [-1.4, 1.19], [-1.25, 1.27], [-0.8, 1.325], [-0.3, 1.335], [0.2, 1.3], [0.55, 1.17], [0.82, 0.99], [1.0, 0.955], [1.5, 0.92], [1.9, 0.85], [2.15, 0.745], [2.29, 0.62]]),
  half: curve([[-2.28, 0.68], [-2.1, 0.8], [-1.6, 0.845], [0, 0.855], [1.6, 0.85], [2.0, 0.82], [2.29, 0.6]]),
  topHalf: curve([[-2.28, 0.56], [-1.7, 0.66], [-1.5, 0.6], [-1.2, 0.66], [-0.3, 0.68], [0.5, 0.62], [0.85, 0.74], [1.5, 0.8], [2.29, 0.52]]),
  shoulder: curve([[-2.28, 0.77], [-2.0, 0.87], [-1.5, 0.9], [0, 0.88], [1.0, 0.87], [1.7, 0.82], [2.29, 0.63]]),
  bottom: null,
  isGlass(band, z) {
    if (band >= 11 && z > 0.24 && z < 0.84) return true;                    // windscreen
    if (band >= 11 && z > -1.5 && z < -0.98) return true;                   // the fastback's rear window
    if (band >= 8 && band <= 10 && z > -1.28 + (band - 8) * 0.06 && z < 0.62 - (band - 8) * 0.12) return true;   // side windows
    return false;
  },
};
GT.bottom = archBottom(GT, curve([[-2.28, 0.36], [-2.1, 0.24], [-1.9, 0.18], [2.0, 0.18], [2.29, 0.23]]));

function spokeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.clearRect(0, 0, 256, 256);
  g.translate(128, 128); g.strokeStyle = '#d6d8dc'; g.lineWidth = 2.6; g.lineCap = 'round';
  for (let i = 0; i < 40; i++) { const a0 = i / 40 * Math.PI * 2, a1 = a0 + (i % 2 ? 0.55 : -0.55), r0 = 26, r1 = 122; g.beginPath(); g.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0); g.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1); g.stroke(); }
  g.fillStyle = '#c3c6cc'; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill(); g.strokeStyle = '#d6d8dc'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 124, 0, 7); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
let spokes = null;
function makeWireWheel(r, width, side, mats) {
  const spin = new THREE.Group(), rr = r - 0.115, hw = width / 2;
  const prof = [new THREE.Vector2(rr, -hw)];
  for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 + k / 8 * Math.PI; prof.push(new THREE.Vector2(r - 0.05 + Math.cos(a) * 0.05, Math.sin(a) * (hw - 0.012))); }
  prof.push(new THREE.Vector2(rr, hw));
  spin.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 36).rotateZ(Math.PI / 2), mats.tyre));
  spokes = spokes || spokeTex();
  const face = new THREE.Mesh(new THREE.CircleGeometry(rr - 0.004, 44), new THREE.MeshStandardMaterial({ map: spokes, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.95, roughness: 0.3 }));
  face.rotation.y = side * Math.PI / 2; face.position.x = side * (hw - 0.05); spin.add(face);
  const back = new THREE.Mesh(new THREE.CircleGeometry(rr - 0.01, 36), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9, side: THREE.DoubleSide }));
  back.rotation.y = side * Math.PI / 2; back.position.x = side * (hw - 0.085); spin.add(back);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.0125, 8, 44).rotateY(Math.PI / 2), mats.chrome); lip.position.x = side * (hw - 0.035); spin.add(lip);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.05, 14).rotateZ(Math.PI / 2), mats.chrome); hub.position.x = side * (hw - 0.02); spin.add(hub);
  for (let k = 0; k < 3; k++) { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.075), mats.chrome); ear.position.x = side * (hw - 0.0); ear.rotation.x = k / 3 * Math.PI * 2 + 0.3; ear.position.y = 0; spin.add(ear); }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(rr - 0.05, rr - 0.05, 0.025, 24).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.35, metalness: 0.9 })); disc.position.x = side * (hw - 0.11);
  return { spin, disc };
}

export function makeGT() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xb4b8bf, metalness: 0.78, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x07090c, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, transparent: true, opacity: 0.84 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe2e7, roughness: 0.08, metalness: 1, envMapIntensity: 1.3 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.5, metalness: 0.3 });
  const matte = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.35, metalness: 0.9 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.82, side: THREE.DoubleSide });
  const tail = new THREE.MeshStandardMaterial({ color: 0x400404, emissive: 0xff2208, emissiveIntensity: 2.4, roughness: 0.3 });
  const head = new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xfff0d0, emissiveIntensity: 2.6, roughness: 0.2 });
  const amber = new THREE.MeshStandardMaterial({ color: 0x553300, emissive: 0xff9a10, emissiveIntensity: 1.6 });
  const bodyGeo = loft(GT, stationsFor(GT, 80));
  const shell = new THREE.Mesh(bodyGeo, [paint, glass]); shell.castShadow = true; shell.receiveShadow = true; body.add(shell);
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  const rbx = (w, h, d, r = 0.01) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const zf = GT.zf, zr = GT.zr;
  // Front: the oval grille (a chrome surround, a dark interior with vertical slats), the bumper blade with overriders, the nose badge-less.
  // (The nose is a rounded face at z = zf in the middle, curving back towards the wings: the grille sits on that face and the bumper
  // is a centre blade with the two ends swept back to follow it.)
  const surround = add(new THREE.TorusGeometry(0.2, 0.016, 10, 40), chrome, 0, 0.44, zf + 0.004); surround.scale.set(2.0, 0.78, 1);
  const grille = add(new THREE.CircleGeometry(0.2, 32), matte, 0, 0.44, zf + 0.003); grille.scale.set(2.0, 0.78, 1);
  for (let k = -6; k <= 6; k++) add(rbx(0.011, 0.25, 0.016, 0.004), chrome, k * 0.058, 0.44, zf + 0.011);
  add(rbx(0.92, 0.06, 0.05, 0.02), chrome, 0, 0.3, zf + 0.025); add(rbx(0.86, 0.035, 0.04, 0.012), chrome, 0, 0.215, zf + 0.0);
  for (const s of [-1, 1]) { add(rbx(0.36, 0.06, 0.05, 0.02), chrome, s * 0.64, 0.3, zf - 0.075, 0, s * 0.5, 0); add(rbx(0.32, 0.035, 0.04, 0.012), chrome, s * 0.62, 0.215, zf - 0.09, 0, s * 0.5, 0); }
  for (const x of [-0.5, -0.26, 0.26, 0.5]) add(new THREE.CapsuleGeometry(0.03, 0.17, 4, 10), chrome, x, 0.3, zf + (Math.abs(x) > 0.4 ? -0.02 : 0.025));
  for (const s of [-1, 1]) {
    // Headlamps in the wings: chrome ring, glass lens, bright bulb; and the amber lamp below.
    const hx = s * 0.6, hy = 0.6, hz = zf - 0.1;
    add(new THREE.TorusGeometry(0.115, 0.012, 8, 28), chrome, hx, hy, hz, 0, s * 0.45, 0);
    add(new THREE.CircleGeometry(0.108, 24), head, hx, hy, hz + 0.005, 0, s * 0.45, 0);
    add(new THREE.SphereGeometry(0.108, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), glass, hx, hy, hz + 0.006, 0, s * 0.45, 0).castShadow = false;
    add(new THREE.CircleGeometry(0.035, 12), amber, s * 0.66, 0.42, zf - 0.13, 0, s * 0.8, 0);
    // The wing's gills behind the front wheel, belt trim and door handles.
    for (let k = 0; k < 3; k++) add(rbx(0.012, 0.2, 0.014, 0.004), chrome, s * (GT.half(0.85) + 0.004), 0.62, 0.74 + k * 0.045);
    add(rbx(0.012, 0.012, 2.5, 0.004), chrome, s * (GT.half(0) + 0.004), 0.835, -0.1);
    add(rbx(0.016, 0.03, 0.15, 0.008), chrome, s * (GT.half(-0.2) + 0.009), 0.87, -0.2);
    add(rbx(0.012, 0.5, 0.012, 0.004), black, s * (GT.half(-0.9) + 0.002), 0.58, -0.9); add(rbx(0.012, 0.5, 0.012, 0.004), black, s * (GT.half(0.66) + 0.002), 0.58, 0.66);
    add(rbx(0.06, 0.05, 0.12, 0.015), paint, s * 0.9, 0.99, 0.62, 0, s * 0.3, 0);   // wing mirror
    add(new THREE.CylinderGeometry(0.01, 0.01, 0.09, 8).rotateZ(Math.PI / 2), chrome, s * 0.86, 0.98, 0.64);
    // Sill.
    add(rbx(0.03, 0.07, 1.5, 0.012), steel, s * (GT.half(0) - 0.03), 0.2, -0.08);
    // Tail: a round red lamp in a chrome ring, and a small reversing lamp.
    const tx = s * 0.66, ty = 0.78;
    add(new THREE.TorusGeometry(0.088, 0.011, 8, 24), chrome, tx, ty, zr + 0.03, 0, Math.PI + s * 0.12, 0);
    add(new THREE.CircleGeometry(0.082, 20), tail, tx, ty, zr + 0.032, 0, Math.PI + s * 0.12, 0);
    add(new THREE.CircleGeometry(0.04, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }), tx, ty - 0.15, zr + 0.032, 0, Math.PI + s * 0.12, 0);
    // Twin exhausts.
    add(new THREE.CylinderGeometry(0.04, 0.038, 0.3, 12).rotateX(Math.PI / 2), steel, s * 0.45, 0.2, zr - 0.05);
  }
  // Rear bumper, plate, and the nozzles of the oil sprayer and the smoke screen.
  add(rbx(1.52, 0.06, 0.05, 0.02), chrome, 0, 0.3, zr - 0.02); add(rbx(1.44, 0.035, 0.04, 0.012), chrome, 0, 0.215, zr + 0.01);
  for (const x of [-0.5, 0.5]) add(new THREE.CapsuleGeometry(0.03, 0.17, 4, 10), chrome, x, 0.3, zr - 0.0);
  add(new THREE.PlaneGeometry(0.5, 0.13), new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.5 }), 0, 0.5, zr + 0.025, 0, Math.PI, 0).castShadow = false;
  for (const x of [-0.12, 0.12]) add(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8).rotateX(Math.PI / 2), matte, x, 0.27, zr - 0.04);
  // Arch liners and wheels.
  for (const wz of [GT.wzf, GT.wzr]) { const liner = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.62, 24, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.BackSide })); liner.position.set(0, GT.wheelR, wz); body.add(liner); }
  const cs = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x000000, transparent: true, opacity: 0.8, depthWrite: false })); cs.position.y = 0.02; cs.renderOrder = 2; root.add(cs);
  const wheels = [];
  for (const [wz, front] of [[GT.wzf, true], [GT.wzr, false]]) for (const s of [-1, 1]) {
    const steer = new THREE.Group(); steer.position.set(s * GT_DIMS.track / 2, GT.wheelR, wz); root.add(steer);
    const w = makeWireWheel(GT.wheelR, 0.2, s, { tyre, chrome }); steer.add(w.spin); steer.add(w.disc); w.spin.traverse(o => { o.castShadow = true; });
    wheels.push({ steer, spin: w.spin, front, side: s, baseY: GT.wheelR });
  }
  // Gadgets: guns (slide out of the wings), and the armour plate (rises from under the boot lid).
  const guns = new THREE.Group(); body.add(guns);
  for (const s of [-1, 1]) { const b = add(new THREE.CylinderGeometry(0.022, 0.026, 0.4, 10).rotateX(Math.PI / 2), steel, s * 0.42, 0.44, zf - 0.28, 0, 0, 0, guns); add(new THREE.CylinderGeometry(0.034, 0.034, 0.05, 10).rotateX(Math.PI / 2), chrome, s * 0.42, 0.44, zf - 0.07, 0, 0, 0, guns); b.castShadow = false; }
  const shield = new THREE.Group(); shield.position.set(0, 0.5, -1.74); body.add(shield);
  add(rbx(1.18, 0.4, 0.03, 0.01), new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.45, metalness: 0.85 }), 0, 0.2, 0, 0, 0, 0, shield);
  add(rbx(1.2, 0.03, 0.05, 0.01), steel, 0, 0.4, 0, 0, 0, 0, shield);
  // Glow sprites so the lamps bloom on every quality level, and the nitro flame.
  const glow = glowTex(), tailGlow = [], headGlow = [];
  for (const s of [-1, 1]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff2a10, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); sp.position.set(s * 0.66, 0.78, zr - 0.1); sp.scale.set(0.7, 0.5, 1); body.add(sp); tailGlow.push(sp);
    const hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff0d0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); hs.position.set(s * 0.6, 0.6, zf - 0.1); hs.scale.set(0.8, 0.6, 1); body.add(hs); headGlow.push(hs);
  }
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x5aa8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); flame.position.set(0, 0.22, zr - 0.35); flame.scale.set(0.6, 0.45, 1); body.add(flame);
  mergeByMaterial(body, shell);
  const cockpit = buildCockpit(body, bodyGeo, 'classic');
  for (const w of wheels) mergeByMaterial(w.spin);
  root.userData = { body, wheels, paint, tail, tailGlow, headGlow, flame, cockpit, dims: GT_DIMS, cgOff: 0, guns, shield, wheelRim: 0.205 };
  return root;
}
