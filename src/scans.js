// Photo-scanned surfaces (assets/scans/, made by tools/scans/textures.py from Poly Haven's CC0 scans). Every surface the game draws for itself
// (textures.js) is still drawn at start, so there is always something to show; the scan of the real thing then takes its place as soon as it has
// downloaded (the same texture object: whatever uses it shows the scan, with nothing else to change). With ?noscans in the address the drawn ones stay.
import * as THREE from 'three';

const DIR = new URL('../assets/scans/', import.meta.url).href;
const loading = new Map();
export const SCANS = { on: typeof location === 'undefined' || !/[?&]noscans\b/.test(location.search), loaded: 0, failed: 0, pending: 0 };

function image(file) {
  if (!loading.has(file)) {
    SCANS.pending++;
    loading.set(file, new Promise((res, rej) => {
      const i = new Image(); i.decoding = 'async';
      i.onload = () => { SCANS.pending--; SCANS.loaded++; res(i); };
      i.onerror = () => { SCANS.pending--; SCANS.failed++; rej(new Error('scan ' + file + ' did not load')); };
      i.src = DIR + file;
    }));
  }
  return loading.get(file);
}
// The scan `file` into texture t (when it comes). Returns t.
// (A DataTexture is sent to the GPU from its pixels, not from a picture: the scan is read into pixels of the same kind, the rows bottom first as a
// DataTexture's are.)
export function scan(t, file) {
  if (!t || !SCANS.on) return t;
  image(file).then(i => {
    // (A texture already on the GPU keeps its size: one of another size has to be let go of, and made again from the scan.)
    const w0 = t.image && t.image.width, h0 = t.image && t.image.height; if (t.version > 0 && (w0 !== i.width || h0 !== i.height)) t.dispose();
    if (t.isDataTexture) {
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d', { willReadFrequently: true });
      g.translate(0, i.height); g.scale(1, -1); g.drawImage(i, 0, 0);
      t.image = { data: new Uint8Array(g.getImageData(0, 0, i.width, i.height).data.buffer), width: i.width, height: i.height };
    } else t.image = i;
    t.needsUpdate = true;
  }).catch(e => console.warn(e.message));
  return t;
}
// The picture of a scan (a promise), for drawing it into something (textures.js: the walls of the buildings).
export const scanImage = file => SCANS.on ? image(file) : new Promise(() => {});          // (scans off: never comes)
// A surface's maps: { map, normalMap, roughnessMap } (those it has) from <name>_diff / _nor / _rough.
export function scanSet(set, name) {
  if (set.map) scan(set.map, name + '_diff.webp');
  if (set.normalMap) scan(set.normalMap, name + '_nor.webp');
  if (set.roughnessMap) scan(set.roughnessMap, name + '_rough.webp');
  return set;
}
// Every scan asked for so far, loaded (or failed): for the tests.
export const scansSettled = () => Promise.allSettled([...loading.values()]);
// A texture of a scan on its own (repeating), for surfaces that had no drawn texture: one pixel of `fill` (the colour that changes nothing: white for a
// colour or a roughness, (128, 128, 255) for a normal map) until the scan comes, or for good with the scans off.
export function scanTex(file, srgb = true, fill = '#ffffff') {
  const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.fillStyle = fill; g.fillRect(0, 0, 1, 1);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return scan(t, file);
}

// ---- Scanned models (assets/scans/*.glb, made by tools/scans/models.sh) -------------------------------------------------------------------------------
// Loaded once, before the props are made (city.js), so the props can be built from them; a model that does not load leaves the drawn one in its place.
export const SCAN_MODELS = {};
export async function loadScanModels(names = ['rock', 'hydrant', 'bench', 'quiver', 'sofa', 'chair']) {
  if (!SCANS.on) return SCAN_MODELS;
  const [{ GLTFLoader }, { DRACOLoader }, { mergeGeometries }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js'), import('three/addons/utils/BufferGeometryUtils.js')]);
  const L = new GLTFLoader(), d = new DRACOLoader(); d.setDecoderPath(new URL('../assets/draco/', import.meta.url).href); L.setDRACOLoader(d);
  await Promise.allSettled(names.map(n => L.loadAsync(DIR + n + '.glb').then(g => {
    // Every part, in the model's frame, merged: one group per material (mat is that one material when there is only one).
    const parts = new Map(); g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => {
      if (!o.isMesh) return; const q = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
      for (const a of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(a)) q.deleteAttribute(a);
      if (!q.attributes.uv) q.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
      (parts.get(o.material) || parts.set(o.material, []).get(o.material)).push(q);
    });
    if (!parts.size) return;
    const mats = [...parts.keys()], geo = mergeGeometries(mats.map(m => mergeGeometries(parts.get(m), false)), mats.length > 1);
    SCAN_MODELS[n] = { geo, mat: mats.length > 1 ? mats : mats[0], mats };
  }).catch(e => console.warn('scan model ' + n + ' did not load', e))));
  return SCAN_MODELS;
}
