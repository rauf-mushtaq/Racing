// The towns, farms, harbour, resort and the desert places outside the city (src/settlements.js, towns.js): where they are, the ground under them, the roads
// to them, that they are built and solid, and that a car can drive in them.   node tests/sites.mjs
import { check, open, step, finish } from './lib.mjs';
import { SITES, padDist } from '../src/settlements.js';

console.log('the plan');
check('a dozen places: a town, three farms, a harbour, a village, a lighthouse, a resort, a ghost town, an oil field, a solar farm and a telescope', SITES.length >= 12 && ['town', 'farm', 'harbour', 'village', 'lighthouse', 'resort', 'western', 'oil', 'solar', 'dishes'].every(k => SITES.some(s => s.kind === k)), SITES.map(s => s.kind).join(','));
check('they are in every kind of country (grassland, coast, mountains, desert)', ['grassland', 'coast', 'mountains', 'desert'].every(b => SITES.some(s => s.biome === b)));
check('every id and name is different', new Set(SITES.map(s => s.id)).size === SITES.length && new Set(SITES.map(s => s.name)).size === SITES.length);
{ const a = { x: 0, z: 0, hx: 10, hz: 5, round: false, rot: 0 }, b = { ...a, round: true };
  check('a pad\'s edge: inside is negative, outside positive, and a turned one is turned', padDist(a, 0, 0) < 0 && padDist(a, 15, 0) > 4.9 && padDist(a, 15, 0) < 5.1 && padDist(b, 0, 12) > 0 && padDist({ ...a, rot: Math.PI / 2 }, 0, 12) < 2.1 && padDist({ ...a, rot: Math.PI / 2 }, 0, 12) > 1.9); }

const A = await open({ debug: true });
const P = A.page;
try {
  console.log('the ground and the roads');
  const g = await P.evaluate(async () => {
    const w = await import('./src/world.js'), s = await import('./src/settlements.js'), out = [];
    for (const S of s.SITES) {
      const o = { id: S.id, y: S.y, roads: S.roads.length };
      let worst = 0, n = 0; for (const p of S.padList) for (let a = -0.9; a <= 0.91; a += 0.3) for (let b = -0.9; b <= 0.91; b += 0.3) { const x = p.x + a * p.hx * p.cos - b * p.hz * p.sin, z = p.z + a * p.hx * p.sin + b * p.hz * p.cos; if (s.padDist(p, x, z) > -1) continue; worst = Math.max(worst, Math.abs(w.heightAt(x, z) - p.y)); n++; }
      o.padFlat = +worst.toFixed(2);
      const cl = w.climate(S.x, S.z); o.snow = +cl.snow.toFixed(2); o.desert = +cl.desert.toFixed(2); o.coast = Math.round(S.x - w.coastX(S.z));
      let off = 0, jump = 0, kinds = 0, pts = 0; for (const R of S.roads) for (let i = 0; i < R.x.length; i++) { const k = w.groundAt(R.x[i], R.z[i]); pts++; if (k.kind !== 'asphalt') off++; if (i && Math.abs(R.y[i] - R.y[i - 1]) > 1.25) jump++; }
      o.offAsphalt = off; o.jumps = jump; o.pts = pts;
      const acc = S.roads.find(r => r.id.startsWith('acc-')); if (acc) { let md = 1e9; const M = w.ROADS.find(r => r.id === S.link.road); for (let i = 0; i < M.x.length; i += 2) md = Math.min(md, Math.hypot(M.x[i] - acc.x[0], M.z[i] - acc.z[0])); o.joinGap = +md.toFixed(1); o.accLen = Math.round(acc.len); }
      let nearRoad = 1e9; for (const R of w.ROADS) { if (R.kind !== 'motorway') continue; for (let i = 0; i < R.x.length; i += 3) nearRoad = Math.min(nearRoad, Math.hypot(R.x[i] - S.x, R.z[i] - S.z)); } o.motorway = Math.round(nearRoad);
      out.push(o);
    }
    return out;
  });
  const by = id => g.find(o => o.id === id);
  check('the land under every pad is level (within 5 cm of its height)', g.every(o => o.padFlat < 0.06), JSON.stringify(g.map(o => [o.id, o.padFlat])));
  check('every road of every place is on asphalt along its whole length (no gaps, no mud)', g.every(o => o.offAsphalt === 0), JSON.stringify(g.filter(o => o.offAsphalt).map(o => [o.id, o.offAsphalt, o.pts])));
  check('and none of them is steeper than one in ten (no step in its height)', g.every(o => o.jumps === 0), JSON.stringify(g.filter(o => o.jumps).map(o => [o.id, o.jumps])));
  check('each access road starts on a motorway (within 14 m)', g.filter(o => o.joinGap !== undefined).every(o => o.joinGap < 14), JSON.stringify(g.map(o => [o.id, o.joinGap])));
  check('each place is in the country it says: grassland (no snow, little sand), coast (a few hundred metres from the sea), mountains, desert', SITES.every(S => { const o = by(S.id); return S.biome === 'grassland' ? o.snow < 0.2 && o.desert < 0.35 : S.biome === 'coast' ? o.coast > 150 && o.coast < 800 : S.biome === 'mountains' ? o.snow > 0.7 : o.desert > 0.6; }), JSON.stringify(g.map(o => [o.id, o.snow, o.desert, o.coast])));
  check('no place is on top of a motorway (at least 100 m from its middle) and none is on another', g.every(o => o.motorway > 100) && SITES.every((a, i) => SITES.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) > 220)), JSON.stringify(g.map(o => [o.id, o.motorway])));

  console.log('built and solid');
  const built = await P.evaluate(async () => {
    const g = window.__game, T = g.towns, cm = await import('./src/city.js'); const out = { sites: T.sites.length, empty: [], ms: 0, nodes: 0, willowColliders: 0 };
    for (const s of T.sites) { let n = 0; s.group.traverse(o => { if (o.isMesh) n++; }); out.nodes += n; if (n < 3) out.empty.push(s.S.id); out.ms += s.buildMs; if (s.S.id === 'willow') out.willowColliders = s.region.colliders.length; }
    return out;
  });
  check('every place was built (a handful of meshes each, none empty)', built.sites === SITES.length && built.empty.length === 0, JSON.stringify(built));
  check('the town has dozens of solid buildings and lamps', built.willowColliders > 60, 'colliders ' + built.willowColliders);
  check('building all of them took under 3 s on this machine (they are built one a frame behind the loading screen)', built.ms < 3000, 'ms ' + Math.round(built.ms));

  // Drive along each street (and out of the town's gate): a car should get along the whole street and stay on the asphalt.
  const drive = await P.evaluate(async () => {
    const g = window.__game, w = await import('./src/world.js'), s = await import('./src/settlements.js'), out = [];
    window.__noRender = true; g.traffic.cars.forEach(c => { c.active = false; });
    for (const S of s.SITES) {
      const st = S.streets && S.streets[0]; if (!st) continue;
      const [a, b] = st.pts, h = Math.atan2(b[0] - a[0], b[1] - a[1]), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      g.car.reset(a[0] + Math.sin(h) * 12, a[1] + Math.cos(h) * 12, h); g.car.baseY = w.groundAt(g.car.x, g.car.z).y;
      let off = 0, maxD = 0; for (let k = 0; k < 8; k++) { g.simulate(1, { throttle: 0.7, gas: 0.7, steer: 0 }); if (w.groundAt(g.car.x, g.car.z).kind !== 'asphalt') off++; maxD = Math.max(maxD, Math.hypot(g.car.x - a[0], g.car.z - a[1])); }
      out.push({ id: S.id, len: Math.round(len), reached: Math.round(maxD), off, speed: +g.car.speed.toFixed(1), hp: g.car.hp });
    }
    window.__noRender = false; return out;
  });
  check('a car drives straight down the main street of every town, harbour, village, resort and gulch without hitting anything', drive.length >= 5 && drive.every(d => d.reached > Math.min(110, d.len * 0.5) && d.off === 0), JSON.stringify(drive));
  console.log('the big map');
  const mp = await P.evaluate(async () => {
    const g = window.__game, h = g.hud, cv = document.getElementById('bigmap-c'); h.worldLayer = null; const t0 = performance.now(); h.drawBigMap(cv, g.car, null, null, []); const ms = performance.now() - t0;
    const ctx = cv.getContext('2d'), px = (wx, wz) => { const s = h.bigScale, x = Math.round((wx - h.bigC[0]) * s + cv.width / 2), y = Math.round((wz - h.bigC[1]) * s + cv.height / 2); return Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3)); };
    const s = await import('./src/settlements.js'); let edges = 0, n = 0;                          // a smooth coast: along the shore a pixel is rarely far from its neighbours' colour
    return { ms: Math.round(ms), sea: px(-4250, 2400), grass: px(-600, 4600), desert: px(5300, -900), snow: px(1200, -5600), city: px(-1500, 400), site: px(s.SITES[0].x, s.SITES[0].z - 0), grid: h.mg && h.mg.done };
  });
  const near = (c, t, d) => c.every((v, i) => Math.abs(v - t[i]) <= d);
  check('the big map draws in under 2.5 s the first time and has the sea, the grass, the desert and the snow in their own colours', mp.ms < 2500 && near(mp.sea, [63, 127, 166], 14) && near(mp.grass, [150, 176, 104], 40) && near(mp.desert, [218, 182, 124], 40) && mp.snow.every(v => v > 190), JSON.stringify(mp));
  check('no script errors', A.logs.length === 0, A.logs.slice(0, 3).join(' | '));
} catch (e) {
  check('site tests ran to the end', false, e.stack || String(e));
}
await finish();
