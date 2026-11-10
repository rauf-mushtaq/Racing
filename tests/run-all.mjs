// Runs every test file, one after another, and says at the end which of them failed.
// (They used to be chained with &&, which stops at the first failure: one check that failed only on the build server hid the three files after it,
// which were then never run there.)   npm test               every file
//                                     node tests/run-all.mjs melee brawl     just those
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILES = ['perf', 'map', 'sites', 'bigmap', 'bench', 'audio', 'smoke', 'cars', 'graphics', 'water', 'rooms', 'melee', 'brawl', 'heist', 'input'];
const want = process.argv.slice(2), unknown = want.filter(n => !FILES.includes(n));
if (unknown.length) { console.error('no such test file: ' + unknown.join(', ') + '   (there are: ' + FILES.join(', ') + ')'); process.exit(2); }

const failed = [], t0 = Date.now();
for (const name of want.length ? want : FILES) {
  const t = Date.now();
  console.log(`\n===== ${name} =====`);
  const r = spawnSync(process.execPath, [path.join(here, name + '.mjs')], { stdio: 'inherit' });
  const ok = r.status === 0;                                          // (killed by a signal, or could not start: not a pass)
  console.log(`===== ${name}: ${ok ? 'passed' : 'FAILED'} in ${Math.round((Date.now() - t) / 1000)} s =====`);
  if (!ok) failed.push(name);
}
const mins = ((Date.now() - t0) / 60000).toFixed(1);
console.log(failed.length ? `\n${failed.length} TEST FILE${failed.length > 1 ? 'S' : ''} FAILED: ${failed.join(', ')}   (${mins} min)` : `\nevery test file passed   (${mins} min)`);
process.exit(failed.length ? 1 : 0);
