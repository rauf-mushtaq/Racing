// The performance test (src/bench.js): the route and the numbers (no browser), then a run in the game with the frames faked (so it takes seconds,
// not a minute): the autopilot keeps to the roads, finishes every stretch, crashes into nothing and does not bring the police; the result is
// worked out, shown and can be copied.   node tests/bench.mjs
import { check, open, step, finish } from './lib.mjs';
import { stations, stats, summarise, toText } from '../src/bench.js';

try {
  console.log('the numbers');
  const st = stations([{ x: 120, z: 40 }, { x: -300, z: 200 }, { x: 250, z: -90 }, { x: 40, z: 300 }]);
  check('five stretches: downtown, bridge, diagonal, hill road, performers', st.length === 5 && st.every(s => s.pts.length >= 2 && s.len >= 250), st.map(s => s.name + ' ' + s.len).join(', '));
  check('each starts somewhere on the map', st.every(s => s.pts.every(p => Math.abs(p[0]) < 2160 && Math.abs(p[1]) < 2160)));
  const fr = (n, ms, js = 3) => Array.from({ length: n }, () => ({ ms, js, calls: 400, tris: 900000 }));
  const a = stats(fr(300, 20));
  check('20 ms frames are 50 fps, with nothing in the slowest 1% to fear', Math.abs(a.fps - 50) < 0.01 && Math.abs(a.low - 50) < 0.01 && a.hitches === 0, JSON.stringify(a));
  const b = stats([...fr(980, 16), ...fr(20, 120)]);
  check('a few long frames drag the slowest-1% figure down and are counted as hitches', b.low < 10 && b.hitches === 20 && b.worst === 120 && b.fps > 50, JSON.stringify(b));
  const list = [{ name: 'A', frames: fr(100, 16) }, { name: 'B', frames: fr(100, 40) }];
  const r = summarise(list, [...list[0].frames, ...list[1].frames], { away: 0, hitches: [['B', 3.2, 140]], seconds: 5, res0: 1, res1: 0.8, easeGpu: 1, easeCpu: 0, heap: 120, env: { device: 'iPad', quality: 'medium', canvas: '1366x1024', rt: 'off', msaa: 2, gpu: 'Apple GPU', tod: 'golden' } });
  const text = toText(r);
  check('the result reads well as text: device, graphics, overall line, a row for every place', /Device: iPad/.test(text) && /graphics medium/.test(text) && /Overall: \d+ fps average/.test(text) && /^A\s+63/m.test(text) && /^B\s+25/m.test(text) && /Longest hitches/.test(text), '\n' + text);
  check('a slow run is told so, a fast one is not', /Heavy|Playable/.test(summarise(list, list[1].frames, { env: {} }).verdict) && summarise(list, list[0].frames, { env: {} }).verdict === 'Smooth.');
} catch (e) {
  check('bench numbers ran to the end', false, e.stack || String(e));
}

const A = await open({ debug: true });
const P = A.page;
try {
  console.log('the drive');
  await P.evaluate(() => { const g = window.__game; g.hud.toast = () => {}; });
  const run = await P.evaluate(async () => {
    const g = window.__game, b = g.bench, bm = await import('./src/bench.js'), w = await import('./src/world.js');
    window.__noRender = true; g.startBench({ scale: 1 });
    const out = { stations: [], wanted: 0, onFoot: g.game.onFoot, state: g.game.state, ticks: 0, started: b.on };
    let cur = -1, maxErr = 0, sumV = 0, n = 0, err0 = 0;
    const dist = (P, x, z) => { let best = 1e9; for (let i = 0; i < P.length - 1; i++) { const ax = P[i][0], az = P[i][1], dx = P[i + 1][0] - ax, dz = P[i + 1][1] - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return best; };
    const hist = [];
    for (let k = 0; k < 7000 && b.on; k++) {
      g.tick(1 / 60); out.ticks++; b.sample(16.7, 2);
      if (!b.on) break;
      if (b.i !== cur) { if (cur >= 0) { out.stations.push({ name: b.list[cur].name, maxErr: +maxErr.toFixed(1), v: +(sumV / Math.max(1, n)).toFixed(1), secs: +(n / 60).toFixed(1), endErr: +err0.toFixed(1) }); } cur = b.i; maxErr = 0; sumV = 0; n = 0; }
      const e = dist(b.cur.pts, g.car.x, g.car.z); if (n > 120) maxErr = Math.max(maxErr, e); err0 = e; sumV += g.car.speed; n++;
      if (g.game.wanted) out.wanted++;
    }
    if (cur >= 0 && b.result) out.stations.push({ name: b.list[cur].name, maxErr: +maxErr.toFixed(1), v: +(sumV / Math.max(1, n)).toFixed(1), secs: +(n / 60).toFixed(1), endErr: +err0.toFixed(1) });
    out.done = !b.on && !!b.result; out.places = b.result ? b.result.places.map(p => [p.name, p.frames]) : null; out.panel = document.getElementById('panel').innerText.slice(0, 80); out.panelHidden = document.getElementById('panel').classList.contains('hidden');
    out.copy = !!document.getElementById('bench-copy'); out.pre = (document.getElementById('bench-text') || {}).textContent || ''; out.saved = JSON.stringify(g.settings.benchLast || null).slice(0, 120); out.stateAfter = g.game.state; out.overlay = document.getElementById('bench').classList.contains('hidden');
    return out;
  });
  console.log(JSON.stringify(run.stations));
  check('the test starts in free roam, in the car', run.started && run.state === 'free' && !run.onFoot, JSON.stringify([run.started, run.state, run.onFoot]));
  check('it finishes by itself, every stretch in well under half a minute', run.done && run.stations.length === 5 && run.stations.every(s => s.secs < 28), JSON.stringify(run.stations));
  check('the autopilot keeps to the road (never more than 6 m off the line, ending close to its end)', run.stations.every(s => s.maxErr < 6), JSON.stringify(run.stations.map(s => [s.name, s.maxErr])));
  check('and keeps moving (average speed over 8 m/s on every stretch)', run.stations.every(s => s.v > 8), JSON.stringify(run.stations.map(s => [s.name, s.v])));
  check('no crash, no police: the wanted level never rises', run.wanted === 0);
  check('every stretch has frames in the result, and the numbers are shown as a panel the numbers can be copied from', run.places && run.places.every(p => p[1] > 150) && !run.panelHidden && /PERFORMANCE TEST/.test(run.panel) && run.copy && /Overall: \d+ fps/.test(run.pre), JSON.stringify([run.places, run.panel, run.copy]));
  check('the last result is kept for the Settings screen, the game is back at the menu and the overlay is gone', /fps/.test(run.saved) && run.stateAfter === 'menu' && run.overlay, JSON.stringify([run.saved, run.stateAfter, run.overlay]));
  // stopping part way
  const stopped = await P.evaluate(() => { const g = window.__game; window.__noRender = true; g.startBench({}); for (let k = 0; k < 120; k++) { g.tick(1 / 60); g.bench.sample(16.7, 2); } g.bench.stop(); g.toMenu(); return { on: g.bench.on, state: g.game.state, overlay: document.getElementById('bench').classList.contains('hidden') }; });
  check('stopping it part way goes back to the menu and clears the overlay', !stopped.on && stopped.state === 'menu' && stopped.overlay, JSON.stringify(stopped));
  check('no script errors', A.logs.length === 0, A.logs.slice(0, 3).join(' | '));
} catch (e) {
  check('bench drive ran to the end', false, e.stack || String(e));
}
await finish();
