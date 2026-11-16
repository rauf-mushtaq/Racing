// A look through whole CMU files, to find the moments worth cutting: node tools/mocap/survey.mjs <out folder> <file> [<file>...] [--step 0.25] [--per 14]
// Writes <file>_<n>.png: rows of poses every `step` seconds (the first pose of each picture is at the time in its name), seen from the side.
import fs from 'node:fs';
import path from 'node:path';
import { open } from './lib.mjs';
const args = process.argv.slice(2), out = args.shift(); let step = 0.25, per = 10, from = 0, to = 1e9, yaw = Math.PI / 2; const names = [];
for (let i = 0; i < args.length; i++) { if (args[i] === '--step') step = +args[++i]; else if (args[i] === '--from') from = +args[++i]; else if (args[i] === '--to') to = +args[++i]; else if (args[i] === '--yaw') yaw = +args[++i]; else if (args[i] === '--per') per = +args[++i]; else names.push(args[i]); }
fs.mkdirSync(out, { recursive: true });
const S = await open();
for (const name of names) {
  await S.load(name);
  const info = await S.page.evaluate(n => window.cut({ file: n[0], from: Math.max(1 / 120, n[1]), to: n[2], face: 'start' }), [name, from, to]).catch(e => { throw new Error(name + ': ' + e.message); });
  const dur = info.dur; let n = 0;
  for (let t0 = 0; t0 < dur; t0 += step * per, n++) {
    const items = []; for (let k = 0; k < per && t0 + k * step <= dur; k++) items.push({ clip: info, t: t0 + k * step, yaw, keepTravel: false });
    await S.page.evaluate(([it]) => window.strip(it, 'side'), [items]);
    await S.page.screenshot({ path: path.join(out, `${name}_${String(n).padStart(2, '0')}_t${(t0 + from).toFixed(1)}.png`) });
  }
  console.log(`${name}: ${dur.toFixed(1)} s, ${n} pictures`);
}
await S.close();
if (S.errors.length) console.log('page errors: ' + S.errors.join(' | '));
