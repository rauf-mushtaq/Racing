// The performance guard's decisions, on made-up frame times (no browser needed).
import { PerfGuard } from '../src/perf.js';
let failed = 0; const check = (n, ok, i = '') => { console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : '  -> ' + i)); if (!ok) failed++; };
const run = (g, seconds, frameMs, jsMs, floor = true) => { const out = []; for (let t = 0; t < seconds * 1000; t += frameMs) { const r = g.sample(frameMs, jsMs, floor); if (r) out.push(r); } return out; };

{ const g = new PerfGuard(4, 3, { grace: 0 });
  check('steady 60 fps: nothing happens', run(g, 60, 16.6, 5).length === 0); }
{ const g = new PerfGuard(4, 3, { grace: 0 });
  const r = run(g, 12, 32, 6, false);
  check('slow picture, resolution not at its floor yet: the guard leaves it to the resolution scaler', r.length === 0, JSON.stringify(r)); }
{ const g = new PerfGuard(4, 3, { grace: 0 });
  const r = run(g, 20, 32, 6, true);
  check('slow picture at the resolution floor: steps down the graphics ladder', r[0] === 'gpu-down' && r.every(x => x === 'gpu-down') && g.gpu === 4, JSON.stringify([r, g.gpu])); }
{ const g = new PerfGuard(4, 3, { grace: 0 });
  const r = run(g, 12, 34, 28, true);
  check('slow because the JavaScript is slow: steps down the CPU ladder (officers, crowds) first', r[0] === 'cpu-down', JSON.stringify(r)); }
{ const g = new PerfGuard(4, 3, { grace: 0 });
  run(g, 20, 34, 28, true);
  const before = g.level; const r = run(g, 30, 12, 5, true);
  check('when it is fast again, the steps come back one at a time', r.length > 0 && r.every(x => x.startsWith('up')) && g.level < before, JSON.stringify([before, g.level, r])); }
{ const g = new PerfGuard(0, 3, { grace: 0 });
  run(g, 20, 34, 28, true);                                // every CPU step is down
  const full = g.cpu;
  run(g, 14, 12, 5, true);                                 // one comes back...
  const back = g.cpu < full;
  run(g, 6, 34, 28, true);                                 // ...and it is slow again at once
  run(g, 120, 12, 5, true);                                // a long quiet spell
  check('a step that brought the slowness straight back is not given back again', back && g.cpu === full, JSON.stringify({ full, now: g.cpu, history: g.history.slice(-4) })); }
{ const g = new PerfGuard(2, 2, { grace: 0 });
  const r = run(g, 60, 40, 30, true);
  check('it stops when everything is already stepped down', g.gpu === 2 && g.cpu === 2 && r.filter(x => x.endsWith('-down')).length === 4, JSON.stringify([g.gpu, g.cpu, r])); }
{ const g = new PerfGuard(1, 1, { grace: 0 });
  const r = run(g, 40, 45, 35, true);
  check('when every step is down and it is still slow, it says so (so a lighter default can be saved)', r.includes('exhausted'), JSON.stringify(r)); }
{ const g = new PerfGuard(4, 3, { grace: 6 });
  const r = run(g, 5, 60, 40, true);
  check('the grace period after a load is ignored', r.length === 0); }
{ const g = new PerfGuard(4, 3, { grace: 0 });
  const r = run(g, 10, 300, 10, true);
  check('frames over a quarter of a second (a hitch) are not counted', r.length === 0); }
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
