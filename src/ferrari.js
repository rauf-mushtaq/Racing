// The hero car as a real, detailed model: a Ferrari 458 Italia (geometry only: vicent091036 on Sketchfab, via the three.js examples,
// Creative Commons Attribution; see assets/CREDITS.md). The game paints it with its own physically based materials (clear-coated metallic
// paint, glass, rubber, brushed and chrome metal, leather) and hooks it up exactly like the older made-up car: the body rides on the
// suspension, each wheel steers and spins, the steering wheel in the cabin turns, the lights glow. If the model cannot be loaded the game
// falls back to the made-up car (carModel.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAINTS, HERO_DIMS } from './carModel.js';
import { glowTex } from './textures.js';
import { attachSSR } from './ssr.js';

const URL = 'assets/cars/ferrari.glb', URL_LITE = 'assets/cars/ferrari_lite.glb';   // the lite one has about 40% of the triangles, for tablets and lower settings

export async function loadFerrari(paintKey = 'pearl', lite = false) {
  const draco = new DRACOLoader(); draco.setDecoderPath('assets/draco/');
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(lite ? URL_LITE : URL); draco.dispose();
  const model = gltf.scene; model.updateMatrixWorld(true);
  // The model faces -z; the game wants +z, with the axles at +1.285 and -1.38. Turn it round and slide it.
  const M = new THREE.Matrix4().makeTranslation(0, 0, 0.13).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
  const pt = PAINTS[paintKey] || PAINTS.pearl;
  const mats = {
    paint: new THREE.MeshPhysicalMaterial({ color: pt.color, metalness: pt.metal, roughness: pt.rough, clearcoat: 1, clearcoatRoughness: 0.025, envMapIntensity: 1.15 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0c1218, metalness: 0.0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, transparent: true, opacity: 0.34, depthWrite: false }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xcfd6dc, metalness: 0.0, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.4, transparent: true, opacity: 0.45, depthWrite: false }),
    tail: new THREE.MeshStandardMaterial({ color: 0x5a0606, emissive: 0xff2208, emissiveIntensity: 2.2, roughness: 0.28, metalness: 0.1, transparent: true, opacity: 0.92 }),
    led: new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff7010, emissiveIntensity: 1.6, roughness: 0.3 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.86, metalness: 0.0 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.22, metalness: 1.0, envMapIntensity: 1.1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8d9097, roughness: 0.32, metalness: 1.0 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.08, metalness: 1.0, envMapIntensity: 1.2 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.55, metalness: 0.05 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.52, metalness: 0.0, envMapIntensity: 0.55 }),
    leatherRed: new THREE.MeshStandardMaterial({ color: 0x3c1717, roughness: 0.5, metalness: 0.0, envMapIntensity: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 0.8, metalness: 0.0 }),
    carpet: new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 1.0 }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.3, metalness: 0.6, envMapIntensity: 0.9 }),
    interiorLight: new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0x6a7480, emissiveIntensity: 0.4, roughness: 0.6 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x1e90ff, roughness: 0.5, metalness: 0.2, emissive: 0x0a3a80, emissiveIntensity: 0.6 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xf8cc00, roughness: 0.45, metalness: 0.2 }),
  };
  // Ray-traced reflections (see ssr.js) on the glossy parts: the road, the street and the other cars show in the paint and glass.
  for (const k of ['paint', 'glass', 'lens', 'chrome', 'rim', 'carbon', 'metal']) attachSSR(mats[k], { range: 70, rough: k === 'paint' || k === 'carbon' ? 0.5 : 0.4, view: 120 });
  const byName = n => {
    n = n.toLowerCase();
    if (n.includes('body_color')) return mats.paint;
    if (n.includes('taillight')) return mats.tail;
    if (n.includes('projector')) return mats.lens;
    if (n.includes('glass')) return mats.glass;
    if (n.includes('turn_signal')) return mats.led;
    if (n.includes('tires')) return mats.tyre;
    if (n.includes('chrome')) return mats.chrome;
    if (n.includes('metal')) return mats.metal;
    if (n.includes('plastic')) return mats.plastic;
    if (n.includes('leather_red')) return mats.leatherRed;
    if (n.includes('leather')) return mats.leather;
    if (n.includes('interior_dark')) return mats.dark;
    if (n.includes('interior_light')) return mats.interiorLight;
    if (n.includes('carpet')) return mats.carpet;
    if (n.includes('carbon')) return mats.carbon;
    if (n.includes('dodger')) return mats.blue;
    if (n.includes('yellow')) return mats.yellow;
    return mats.plastic;
  };

  // Sort the meshes into: the body (with the cabin), the steering wheel, and each wheel.
  const nodeOf = (o, test) => { for (let p = o.parent; p; p = p.parent) if (test(p)) return p; return null; };
  const body = new THREE.Group(), steerBase = new THREE.Group();
  const wheelNodes = {}; model.traverse(o => { if (/^wheel_(fl|fr|rl|rr)$/.test(o.name)) wheelNodes[o.name] = o; });
  const steeringNode = model.getObjectByName('steering_wheel');
  const bodyBuckets = new Map(), steerBuckets = new Map(), wheelBuckets = {};
  const add = (map, key, geo) => { let a = map.get(key); if (!a) map.set(key, a = []); a.push(geo); };
  const wpos = {}; for (const [k, n] of Object.entries(wheelNodes)) { const v = new THREE.Vector3().setFromMatrixPosition(n.matrixWorld).applyMatrix4(M); wpos[k] = v; wheelBuckets[k] = { spin: new Map(), still: new Map() }; }
  const spos = steeringNode ? new THREE.Vector3().setFromMatrixPosition(steeringNode.matrixWorld).applyMatrix4(M) : new THREE.Vector3();
  let tris = 0; const stats = {};
  model.traverse(o => {
    if (!o.isMesh) return;
    let g = o.geometry.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (lite) g.deleteAttribute('normal');
    g.applyMatrix4(o.matrixWorld).applyMatrix4(M); if (lite) g = toCreasedNormals(g, 0.7);       // (the lite file has no normals: smooth them, keeping the hard edges)
    const nt = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += nt; stats[o.name + '/' + (o.material && o.material.name)] = (stats[o.name + '/' + (o.material && o.material.name)] || 0) + nt;
    const mat = byName(o.material && o.material.name || ''), wn = nodeOf(o, p => /^wheel_(fl|fr|rl|rr)$/.test(p.name));
    if (wn) { g.translate(-wpos[wn.name].x, -wpos[wn.name].y, -wpos[wn.name].z); add(/brake/i.test(o.name) ? wheelBuckets[wn.name].still : wheelBuckets[wn.name].spin, mat, g); }
    else if (steeringNode && nodeOf(o, p => p === steeringNode)) { g.translate(-spos.x, -spos.y, -spos.z); add(steerBuckets, mat, g); }
    else add(bodyBuckets, mat, g);
  });
  const emit = (group, map, shadow = true) => {
    for (const [mat, list] of map) {
      const geo = mergeGeometries(list, false); if (!geo) continue;
      const m = new THREE.Mesh(geo, mat); m.castShadow = shadow && !mat.transparent; m.receiveShadow = !mat.transparent; if (mat.transparent) m.renderOrder = 3; group.add(m);
    }
  };
  const root = new THREE.Group();
  emit(body, bodyBuckets); root.add(body);
  // The steering wheel turns about the column: the thinnest direction of the rim.
  steerBase.position.copy(spos); body.add(steerBase); emit(steerBase, steerBuckets);
  let steerAxis = new THREE.Vector3(0, 0, 1);
  { const bb = new THREE.Box3().setFromObject(steerBase), s = bb.getSize(new THREE.Vector3()), m = Math.min(s.x, s.y, s.z); steerAxis = m === s.x ? new THREE.Vector3(1, 0, 0) : m === s.y ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1); }
  // Wheels: a steering group at the hub with a spinning group inside it.
  const wheels = [], WR = 0.352;
  for (const [k, p] of Object.entries(wpos)) {
    const front = k.endsWith('fl') || k.endsWith('fr'), side = p.x > 0 ? 1 : -1;
    const steer = new THREE.Group(); steer.position.set(side * (HERO_DIMS.track / 2 + (front ? 0 : 0.0)), WR, p.z); root.add(steer);
    const spin = new THREE.Group(); steer.add(spin); emit(spin, wheelBuckets[k].spin); emit(steer, wheelBuckets[k].still);
    wheels.push({ steer, spin, front, side, baseY: WR });
  }
  // Light glows (they bloom even on lower settings), the nitro flame and a soft shadow under the car.
  const bb = new THREE.Box3().setFromObject(body), zr = bb.min.z, zf = bb.max.z, glow = glowTex();
  const tailGlow = [], headGlow = [];
  for (const s of [-1, 1]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff2a10, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(s * 0.62, 0.78, zr - 0.1); sp.scale.set(0.8, 0.45, 1); body.add(sp); tailGlow.push(sp);
    const hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xdfe8ff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    hs.position.set(s * 0.7, 0.6, zf - 0.1); hs.scale.set(0.6, 0.34, 1); body.add(hs); headGlow.push(hs);
  }
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x5aa8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  flame.position.set(0, 0.42, zr - 0.3); flame.scale.set(0.6, 0.45, 1); body.add(flame);
  const cs = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 5.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glow, color: 0x000000, transparent: true, opacity: 0.7, depthWrite: false }));
  cs.position.y = 0.02; cs.renderOrder = 2; root.add(cs);

  // What the game's camera and gauges need from a cockpit: where the driver's eyes are, and something to do each frame.
  const eye = new THREE.Vector3(spos.x, spos.y + 0.3, spos.z - 0.56);
  const cockpit = { eye, style: 'real', group: body, update(st) { steerBase.quaternion.setFromAxisAngle(steerAxis, -st.wheelAngle); } };
  root.userData = { body, wheels, paint: mats.paint, tail: mats.tail, tailGlow, headGlow, flame, cockpit, real: true, tris, stats, zr, zf };
  return root;
}

// A very light copy of the same car (about 16,000 triangles: body, glass, wheels, lights) in the form the traffic uses: one geometry with
// vertex colours (white where the paint is, so each car can be dyed its own colour) and one for the lights.
export async function loadFerrariTraffic() {
  const draco = new DRACOLoader(); draco.setDecoderPath('assets/draco/');
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync('assets/cars/ferrari_traffic.glb'); draco.dispose();
  const model = gltf.scene; model.updateMatrixWorld(true);
  const M = new THREE.Matrix4().makeTranslation(0, 0, 0.13).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
  const body = [], lights = [], tint = (g, r, gg, b) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([r, gg, b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  model.traverse(o => {
    if (!o.isMesh) return;
    let g = o.geometry.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g.applyMatrix4(o.matrixWorld).applyMatrix4(M); g = toCreasedNormals(g, 0.7);
    const n = ((o.material && o.material.name) || '').toLowerCase();
    if (n.includes('taillight')) lights.push(tint(g, 4.2, 0.3, 0.12));
    else if (n.includes('projector')) lights.push(tint(g, 3.2, 3.0, 2.6));
    else if (n.includes('body_color')) body.push(tint(g, 1, 1, 1));
    else if (n.includes('glass')) body.push(tint(g, 0.03, 0.04, 0.05));
    else if (n.includes('tires')) body.push(tint(g, 0.025, 0.025, 0.027));
    else if (n.includes('chrome') || n.includes('metal')) body.push(tint(g, 0.45, 0.46, 0.48));
    else body.push(tint(g, 0.06, 0.06, 0.065));
  });
  const geo = mergeGeometries(body, false), lgeo = mergeGeometries(lights, false);
  const bb = new THREE.Box3().setFromBufferAttribute(geo.attributes.position), zc = (bb.min.z + bb.max.z) / 2;
  geo.translate(0, 0, -zc); lgeo.translate(0, 0, -zc);
  return { geo, lights: lgeo, len: bb.max.z - bb.min.z, width: bb.max.x - bb.min.x, mass: 1500, rad: 0.95 };
}
