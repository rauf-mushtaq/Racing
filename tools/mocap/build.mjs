// Makes assets/people/moves.json from the CMU motion capture: node tools/mocap/build.mjs [<folder for previews>]
// Downloads the takes it needs (once, into tools/mocap/cache), fits them to the Rocketbox skeleton in a browser page (page.js), cuts the moves listed in
// moves.mjs and packs them like assets/people/anims.json (a rotation per bone per frame at 30 frames a second as 16-bit numbers, and the hip bone's path).
// With a folder, it also draws each move as a strip of poses (<name>.png) to look at.
import fs from 'node:fs';
import path from 'node:path';
import { open, ROOT } from './lib.mjs';
import { MOVES, CALIB } from './moves.mjs';

const prev = process.argv[2]; if (prev) fs.mkdirSync(prev, { recursive: true });
const S = await open();
const out = { made: 'tools/mocap/build.mjs', source: 'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), BVH by B. Hahne', fps: 30, bones: await S.page.evaluate(() => window.BONES_LIST), rest: await S.page.evaluate(() => window.restInfo), clips: {} };
console.log('rest', JSON.stringify(out.rest));
for (const [name, m] of Object.entries(MOVES)) {
  if (CALIB[m.file]) await S.load(CALIB[m.file]);
  const info = await S.load(m.file); if (info && info.calib) console.log(`  ${m.file}: ${info.calib.join(', ')}`);
  if (CALIB[m.file]) await S.page.evaluate(([a, c]) => window.borrowCalib(a, c), [m.file, CALIB[m.file]]);
  const c = await S.page.evaluate(seg => window.cut(seg), m);
  out.clips[name] = { frames: c.frames, dur: c.dur, q: c.q, pos: c.pos, root: c.root, hit: m.hit || [], loop: !!m.loop, travel: c.travel, lie: c.lie, end: c.end };
  console.log(`${name.padEnd(12)} ${c.dur.toFixed(2)} s  travel ${c.travel.map(v => v.toFixed(2)).join(',')} m  lie ${c.lie}  end ${c.end}  (${m.file} ${m.from}-${m.to}${m.mirror ? ' mirrored' : ''})`);
  if (prev) {
    const N = 10, items = []; for (let k = 0; k < N; k++) items.push({ clip: c, t: c.dur * k / (N - 1), yaw: Math.PI / 2, keepTravel: false });
    if (m.hit) for (const h of m.hit) items.push({ clip: c, t: h, yaw: 0, keepTravel: false });
    await S.page.evaluate(([it]) => window.strip(it, 'side'), [items]);
    await S.page.screenshot({ path: path.join(prev, name + '.png') });
  }
}
fs.writeFileSync(path.join(ROOT, 'assets', 'people', 'moves.json'), JSON.stringify(out));
console.log(`wrote assets/people/moves.json: ${Object.keys(out.clips).length} moves, ${(fs.statSync(path.join(ROOT, 'assets', 'people', 'moves.json')).size / 1024).toFixed(0)} KB`);
await S.close();
if (S.errors.length) { console.log('page errors: ' + S.errors.join(' | ')); process.exit(1); }
