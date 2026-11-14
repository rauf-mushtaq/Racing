// Makes the files the Unreal version imports from the web version's own people and cars: node tools/unreal-import/run.mjs
// It serves this repository, opens tools/unreal-import/page.html in headless Chromium (the web code runs there; see page.js), and writes:
//   unreal/Import/people/<key>.glb     each person, in metres, with every clip as a glTF animation
//   unreal/Import/cars/<car>_*.glb     the Ferrari and the police cruiser: body, left wheel, right wheel (hubs at the origin)
//   unreal/Import/SC_Axes.glb          a 1 x 2 x 3 m box: once imported, its bounds tell the game how Unreal turned glTF's axes
//   unreal/Import/manifest.json        what is in them (clip lengths and speeds, heights, wheel positions)
//   unreal/SunsetCity/Source/SunsetCity/SCImportData.h   the same for the game's C++
// Then it loads every file back and checks it (one skinned mesh per person, every clip there, sensible sizes). Needs: npm install (Playwright).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'unreal', 'Import');
const HEADER = path.join(ROOT, 'unreal', 'SunsetCity', 'Source', 'SunsetCity', 'SCImportData.h');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('content-type', TYPES[path.extname(p)] || 'application/octet-stream'); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('  [page] ' + m.text()); });
await page.goto(BASE + 'tools/unreal-import/page.html');
await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 }).catch(() => { throw new Error('the page did not load: ' + errors.join(' | ')); });

fs.mkdirSync(path.join(OUT, 'people'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'cars'), { recursive: true });
const write = (rel, b64) => { const f = path.join(OUT, rel); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return fs.statSync(f).size; };
const kb = n => (n / 1024).toFixed(0) + ' KB';

const keys = await page.evaluate(() => window.peopleKeys());
// (The web's big, muscular build was tried as a baked shape and came out warped in the rest pose: the game makes its big men by scaling an ordinary person instead.)
const jobs = [...keys.people, ...keys.cops, ...keys.peds].map(k => [k, 0]);
const manifest = { made: 'tools/unreal-import/run.mjs', people: {}, clips: null, cars: {} };
for (const [key] of jobs) {
  const r = await page.evaluate(k => window.bakePerson(k), key);
  const name = key, size = write('people/' + name + '.glb', r.glb);
  manifest.people[name] = { height: r.height, width: r.width, minY: r.minY, bones: r.bones, tris: r.tris, bytes: size };
  if (!manifest.clips) manifest.clips = r.clips;
  else if (JSON.stringify(manifest.clips) !== JSON.stringify(r.clips)) throw new Error('the clips differ between people');
  console.log(`person ${name}: ${r.height} m tall, ${r.tris} triangles, ${r.bones} bones, ${r.clips.length} clips, ${kb(size)}`);
}
for (const [car, fn] of [['ferrari', 'exportFerrari'], ['police', 'exportPolice']]) {
  const r = await page.evaluate(f => window[f](), fn);
  let total = 0; for (const part of ['body', 'wheel_left', 'wheel_right']) total += write(`cars/${car}_${part}.glb`, r[part]);
  manifest.cars[car] = r.dims;
  console.log(`car ${car}: ${r.dims.len} x ${r.dims.width} m, wheels at z ${r.dims.zf} / ${r.dims.zr}, radius ${r.dims.wheelR} m, ${kb(total)}`);
}
write('SC_Axes.glb', await page.evaluate(() => window.exportAxes()));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');

// ---- check: load each file back
const checks = await page.evaluate(async (files) => {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const THREE = await import('three');
  const out = {};
  for (const f of files) {
    const g = await new GLTFLoader().loadAsync('unreal/Import/' + f);
    let skinned = 0, meshes = 0, mats = new Set(); g.scene.traverse(o => { if (o.isSkinnedMesh) skinned++; if (o.isMesh) { meshes++; [].concat(o.material).forEach(m => mats.add(m.name || m.uuid)); } });
    const box = new THREE.Box3().setFromObject(g.scene, true), s = box.getSize(new THREE.Vector3());
    out[f] = { skinned, meshes, materials: mats.size, anims: g.animations.map(a => a.name), size: [s.x, s.y, s.z].map(v => +v.toFixed(3)), min: [box.min.x, box.min.y, box.min.z].map(v => +v.toFixed(3)) };
  }
  return out;
}, [...Object.keys(manifest.people).map(k => 'people/' + k + '.glb'), 'cars/ferrari_body.glb', 'cars/ferrari_wheel_left.glb', 'cars/police_body.glb', 'cars/police_wheel_right.glb', 'SC_Axes.glb']);
let bad = 0;
function gltfJson(file) { const b = fs.readFileSync(file), n = b.readUInt32LE(12); return JSON.parse(b.subarray(20, 20 + n).toString('utf8')); }
const want = manifest.clips.map(c => 'SC_' + c.name);
for (const [f, c] of Object.entries(checks)) {
  let why = '';
  if (f.startsWith('people/')) {
    const j = gltfJson(path.join(OUT, f));                                          // (loaded, a mesh of several materials is split into one object per material: count in the file)
    if ((j.meshes || []).length !== 1 || (j.skins || []).length !== 1) why += ` ${(j.meshes || []).length} meshes and ${(j.skins || []).length} skins (want 1 and 1);`;
    if (want.some(n => !c.anims.includes(n))) why += ` clips missing: ${want.filter(n => !c.anims.includes(n)).join(', ')};`;
    if (c.size[1] < 1.4 || c.size[1] > 2.1) why += ` ${c.size[1]} m tall;`;
    if (Math.abs(c.min[1]) > 0.08) why += ` feet at ${c.min[1]} m;`;
  } else if (f === 'SC_Axes.glb') { if (c.size.join() !== '1,2,3') why += ` box is ${c.size};`; }
  else if (f.includes('body')) {
    const j = gltfJson(path.join(OUT, f));
    if ((j.meshes || []).length !== 1) why += ` ${(j.meshes || []).length} meshes (want 1, so it imports as one asset);`;
    if (c.size[2] < 3.5 || c.size[2] > 5.5) why += ` ${c.size[2]} m long;`; if (c.materials < 4) why += ' too few materials;';
  }
  else if (c.size[1] < 0.4 || c.size[1] > 0.9) why += ` wheel ${c.size[1]} m across;`;
  if (why) { bad++; console.log('BAD  ' + f + ':' + why); }
}
console.log(`checked ${Object.keys(checks).length} files: ${bad ? bad + ' BAD' : 'all as expected'}`);

// ---- the C++ table
const C = manifest.clips, cars = manifest.cars, f = x => (Math.round(x * 100000) / 100000).toFixed(5) + 'f', cm = x => (x * 100).toFixed(2) + 'f';
const ident = s => s.replace(/(^|_)([a-z])/g, (m, a, b) => b.toUpperCase());
const hdr = `// Generated by tools/unreal-import/run.mjs from the web version's people and cars (unreal/Import/manifest.json). Do not edit by hand: run that again.
// The clips every imported person has (unreal/Import/people/<key>.glb, imported by Content/Python/sc_import_assets.py as A_<name>), the people there are,
// and the imported cars' measurements in centimetres, in the car's own frame (x forward, y right, z up; the origin on the ground under the middle of the
// car as the web version has it).
#pragma once

#include "CoreMinimal.h"

namespace SCImport
{
	enum EClip : int32 { ${C.map(c => 'Clip' + ident(c.name)).join(', ')}, ClipCount };
	static const TCHAR* const ClipNames[ClipCount] = { ${C.map(c => `TEXT("${c.name}")`).join(', ')} };
	static const float ClipSeconds[ClipCount] = { ${C.map(c => f(c.dur)).join(', ')} };
	/** The ground speed a cycle was recorded at, in m/s (0 for the clips that are not walking or running). */
	static const float ClipSpeed[ClipCount] = { ${C.map(c => f(c.speed)).join(', ')} };
	static const bool ClipLoops[ClipCount] = { ${C.map(c => (c.loop ? 'true' : 'false')).join(', ')} };
	/** The walking and running cycles, slowest first. */
	static const EClip Ladder[] = { ${C.filter(c => c.speed > 0).map(c => 'Clip' + ident(c.name)).join(', ')} };

	static const TCHAR* const Players[] = { ${keys.people.map(k => `TEXT("${k}")`).join(', ')} };
	static const TCHAR* const Cops[] = { ${keys.cops.map(k => `TEXT("${k}")`).join(', ')} };
	static const TCHAR* const Pedestrians[] = { ${keys.peds.map(k => `TEXT("${k}")`).join(', ')} };

	struct FCarModel { const TCHAR* Name; float Length, Width, Height, FrontAxle, RearAxle, Track, WheelRadius; };
	static const FCarModel Cars[] = {
${Object.entries(cars).map(([n, d]) => `		{ TEXT("${n}"), ${cm(d.len)}, ${cm(d.width)}, ${cm(d.height)}, ${cm(d.zf)}, ${cm(d.zr)}, ${cm(d.track)}, ${cm(d.wheelR)} },`).join('\n')}
	};
}
`;
fs.writeFileSync(HEADER, hdr);
console.log('wrote ' + path.relative(ROOT, HEADER));
await browser.close(); server.close();
if (errors.length) { console.log('page errors: ' + errors.join(' | ')); process.exit(1); }
process.exit(bad ? 1 : 0);
