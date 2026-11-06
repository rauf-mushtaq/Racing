// The player's character as one smooth, skinned body: continuous arms, legs and torso lofted from elliptical cross-sections and weighted to
// the skeleton, so the limbs bend smoothly at the elbows, knees and waist instead of being separate tubes with caps. The head, hands, hair
// and shoes are rigid pieces on the bones (see person.js, which also supplies the walk, run, crouch and jump animation). Materials: fabric
// with a weave bump, skin with a soft sheen and pores, hair with a strand bump.
import * as THREE from 'three';
import { bodyParts, buildRig, attachParts, OUTFITS } from './person.js';

const SEG = 20;
const BONES = ['hips', 'torso', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipJL', 'kneeL', 'ankleL', 'hipJR', 'kneeR', 'ankleR'];
const I = Object.fromEntries(BONES.map((n, k) => [n, k]));
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// A weight function from a list of [bone, from-y, to-y] zones: bone A below `lo`, bone B above `hi`, blended between.
const blend = (a, b, lo, hi) => y => { const t = sm(lo, hi, y); return [I[a], 1 - t, I[b], t]; };

function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 4; return t;
}
let rs = 77; const rnd = () => (rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296;
let cache = null;
function textures() {
  if (cache) return cache;
  const fabric = canvasTex(128, 128, (c, w, h) => {              // a fine weave: threads one way over threads the other, with fluff
    c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(${y % 4 ? 150 : 100},${y % 4 ? 150 : 100},${y % 4 ? 150 : 100},0.55)`; c.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { c.fillStyle = `rgba(${x % 4 ? 140 : 110},${x % 4 ? 140 : 110},${x % 4 ? 140 : 110},0.4)`; c.fillRect(x, 0, 1, h); }
    for (let i = 0; i < 700; i++) { const v = 90 + rnd() * 90 | 0; c.fillStyle = `rgba(${v},${v},${v},0.5)`; c.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
  }, [3, 3]);
  const pores = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#909090'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const v = 60 + rnd() * 70 | 0; c.fillStyle = `rgba(${v},${v},${v},0.55)`; c.beginPath(); c.arc(rnd() * w, rnd() * h, 0.5 + rnd() * 1.1, 0, 7); c.fill(); }
  }, [6, 6]);
  const hair = canvasTex(64, 128, (c, w, h) => {
    c.fillStyle = '#888'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const x = rnd() * w, v = 70 + rnd() * 150 | 0; c.strokeStyle = `rgba(${v},${v},${v},0.5)`; c.lineWidth = 0.6 + rnd(); c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (rnd() - 0.5) * 6, h); c.stroke(); }
  }, [2, 2]);
  cache = { fabric, pores, hair };
  return cache;
}

export function figureMaterials() {
  const T = textures();
  return {
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0, bumpMap: T.fabric, bumpScale: 0.9, envMapIntensity: 0.55 }),
    skin: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, metalness: 0, bumpMap: T.pores, bumpScale: 0.35, sheen: 0.6, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xff8f78), clearcoat: 0.12, clearcoatRoughness: 0.45, envMapIntensity: 0.55 }),
    hair: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05, bumpMap: T.hair, bumpScale: 1.2, envMapIntensity: 0.7 }),
    shoe: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02, envMapIntensity: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.3, envMapIntensity: 1.7 }),
  };
}

// ---- Building the skinned geometry ------------------------------------------------------------------------------------
class Skin {
  constructor() { this.pos = []; this.col = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; }
  // stations: [y, rx, rz, THREE.Color], any order; cx: where the tube stands; wfn(y) -> [boneA, wA, boneB, wB]; capBottom/capTop close the ends.
  tube(stations, cx, wfn, capBottom = true, capTop = true, cz = 0) {
    const st = stations.slice().sort((a, b) => a[0] - b[0]), base = this.pos.length / 3;
    for (let i = 0; i < st.length; i++) {
      const [y, rx, rz, c] = st[i], w = wfn(y);
      for (let j = 0; j < SEG; j++) {
        const a = j / SEG * Math.PI * 2;
        this.pos.push(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz); this.col.push(c.r, c.g, c.b); this.uv.push(j / SEG * 5, y * 7); this.si.push(w[0], w[2], 0, 0); this.sw.push(w[1], w[3], 0, 0);
      }
    }
    for (let i = 0; i < st.length - 1; i++) for (let j = 0; j < SEG; j++) {
      const a = base + i * SEG + j, b = base + i * SEG + (j + 1) % SEG, c = a + SEG, d = b + SEG;
      this.idx.push(a, c, b, b, c, d);
    }
    const cap = (i, up) => {          // a flat cap: its own vertices so the normals stay flat
      const [y, rx, rz, c] = st[i], w = wfn(y), c0 = this.pos.length / 3;
      this.pos.push(cx, y, cz); this.col.push(c.r, c.g, c.b); this.uv.push(0, 0); this.si.push(w[0], w[2], 0, 0); this.sw.push(w[1], w[3], 0, 0);
      for (let j = 0; j < SEG; j++) { const a = j / SEG * Math.PI * 2; this.pos.push(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz); this.col.push(c.r, c.g, c.b); this.uv.push(0, 0); this.si.push(w[0], w[2], 0, 0); this.sw.push(w[1], w[3], 0, 0); }
      for (let j = 0; j < SEG; j++) { const p = c0 + 1 + j, q = c0 + 1 + (j + 1) % SEG; if (up) this.idx.push(c0, q, p); else this.idx.push(c0, p, q); }
    };
    if (capBottom) cap(0, false); if (capTop) cap(st.length - 1, true);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4)); g.setIndex(this.idx); g.computeVertexNormals();
    return g;
  }
}

function bodyGeometry(o) {
  const J = new THREE.Color(o.jacket), P = new THREE.Color(o.pants), S = new THREE.Color(o.skin), T = new THREE.Color(o.trim);
  const k = new Skin();
  // Torso and pelvis (jacket over trousers), up into the neck.
  k.tube([[0.80, 0.100, 0.085, P], [0.84, 0.150, 0.102, P], [0.865, 0.176, 0.110, P], [0.872, 0.182, 0.113, T], [0.90, 0.186, 0.116, T], [0.915, 0.186, 0.116, J], [0.96, 0.172, 0.108, J], [1.02, 0.162, 0.104, J], [1.08, 0.160, 0.103, J], [1.15, 0.170, 0.108, J],
    [1.22, 0.188, 0.118, J], [1.30, 0.204, 0.127, J], [1.37, 0.214, 0.124, J], [1.42, 0.206, 0.112, J], [1.455, 0.170, 0.098, J], [1.485, 0.105, 0.082, J], [1.502, 0.060, 0.060, J], [1.51, 0.058, 0.058, S], [1.56, 0.052, 0.054, S], [1.62, 0.050, 0.052, S]],
  0, y => { if (y < 1.06) return blend('hips', 'torso', 0.94, 1.04)(y); return blend('torso', 'head', 1.5, 1.58)(y); }, true, true);
  for (const s of [-1, 1]) {
    const L = s < 0 ? 'L' : 'R', sh = 'shoulder' + L, el = 'elbow' + L, wr = 'wrist' + L, hp = 'hipJ' + L, kn = 'knee' + L, an = 'ankle' + L;
    // Arm: shoulder cap, upper arm, elbow, forearm, a ribbed cuff.
    k.tube([[0.865, 0.024, 0.024, T], [0.885, 0.034, 0.034, T], [0.915, 0.036, 0.035, T], [0.93, 0.037, 0.036, J], [0.99, 0.043, 0.042, J], [1.06, 0.047, 0.046, J], [1.125, 0.046, 0.046, J], [1.19, 0.050, 0.050, J],
      [1.27, 0.057, 0.056, J], [1.33, 0.061, 0.059, J], [1.385, 0.063, 0.060, J], [1.425, 0.054, 0.052, J], [1.45, 0.034, 0.034, J]],
    s * 0.208, y => { if (y > 1.07) return blend(el, sh, 1.07, 1.18)(y); if (y > 0.89) return blend(wr, el, 0.89, 0.94)(y); return [I[wr], 1, 0, 0]; }, true, true);
    // Leg: thigh, knee, calf, to the ankle (the trainer covers the end).
    k.tube([[0.035, 0.040, 0.046, P], [0.07, 0.041, 0.047, P], [0.12, 0.040, 0.046, P], [0.20, 0.046, 0.054, P], [0.28, 0.054, 0.064, P], [0.34, 0.058, 0.069, P], [0.40, 0.056, 0.066, P], [0.46, 0.057, 0.064, P],
      [0.52, 0.063, 0.068, P], [0.60, 0.072, 0.076, P], [0.70, 0.082, 0.084, P], [0.80, 0.090, 0.090, P], [0.88, 0.088, 0.090, P], [0.94, 0.074, 0.078, P], [0.99, 0.055, 0.060, P]],
    s * 0.098, y => { if (y > 0.4) return blend(kn, hp, 0.4, 0.52)(y); if (y > 0.1) return [I[kn], 1, 0, 0]; return blend(an, kn, 0.035, 0.1)(y); }, true, true);
  }
  return k.geometry();
}

// A smooth, skinned character in an outfit. Same joints as the segmented figure, so the same animation drives it.
export function makeSmoothFigure(outfitKey = 'street') {
  const B = buildRig(null, null, true), mats = figureMaterials(); B.materials = mats; B.smooth = true; B.meshes = [];
  const build = key => {
    const o = OUTFITS[key] || OUTFITS.street, P = bodyParts(o, false);
    for (const m of B.meshes) { if (m.parent) m.parent.remove(m); if (m.isSkinnedMesh) m.geometry.dispose(); }
    B.meshes = [];
    B.root.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(BONES.map(n => B[n]));
    const body = new THREE.SkinnedMesh(bodyGeometry(o), mats.cloth); body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
    B.root.add(body); body.bind(skel, body.matrixWorld); B.meshes.push(body);
    // Rigid pieces on the bones: the head (skin, features), hair, sunglasses, hands, trainers and the collar.
    const rig = { head: [B.head], hair: [B.head], glasses: [B.head], hand: [B.wristL, B.wristR], shoe: [B.ankleL, B.ankleR] };
    for (const [k, bones] of Object.entries(rig)) {
      if (!P[k]) continue;
      for (const b of bones) {
        const mat = k === 'head' || k === 'hand' ? mats.skin : k === 'glasses' ? mats.glass : k === 'hair' ? mats.hair : mats.shoe;
        const m = new THREE.Mesh(P[k], mat); m.castShadow = true; b.add(m); B.meshes.push(m); if (k === 'hand' && b === B.wristL) m.scale.x = -1;
      }
    }
    const col = new THREE.Color(o.jacket), collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.024, 10, 22), mats.cloth.clone());
    collar.material.vertexColors = false; collar.material.color.copy(col); collar.scale.set(1, 1, 0.92); collar.rotation.x = Math.PI / 2 - 0.15; collar.position.set(0, 0.552, 0.004); collar.castShadow = true; B.torso.add(collar); B.meshes.push(collar);
    B.outfit = key;
  };
  build(outfitKey); B.rebuild = build;
  return B;
}
