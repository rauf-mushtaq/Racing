// The map: the river and its bridges, the roundabouts, the landmarks. Run:  node tests/map.mjs  (npm test runs it too)
//  - numbers only: the water keeps clear of every junction, the bridges are where the roads cross it and don't overlap, roundabouts are sensible
//  - in the game: the car crosses bridges (up the hump and down) but cannot drive into the river or the lake, traffic and people never end up
//    in the water, the roads are really cut away where the water is, roundabout paths are smooth and keep clear of the island, landmarks are there
import { check, open, step, finish } from './lib.mjs';
import { RIVER, BRIDGES, LAKES, riverSdf, bridgeAt, deckY } from '../src/rivercourse.js';
import { SP, N, hw, blockRect, LANDMARKS } from '../src/grid.js';
import { isRound, RB } from '../src/junctions.js';

try {
  console.log('the course');
  let worst = 1e9;
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    const R = Math.max(hw(i), hw(j)) + 8;
    for (let a = -R; a <= R; a += 3) for (let b = -R; b <= R; b += 3) worst = Math.min(worst, riverSdf(i * SP + a, j * SP + b));
  }
  check('the water keeps at least 4 m clear of every junction', worst > 4, 'closest ' + worst.toFixed(1));
  check('the river is a couple of kilometres long and the lakes are at its ends', RIVER.length > 1800 && riverSdf(LAKES[0].cx, LAKES[0].cz) < -40 && riverSdf(LAKES[1].cx, LAKES[1].cz) < -40, 'length ' + RIVER.length.toFixed(0));
  check('there is a bridge wherever the river crosses an avenue or a street', BRIDGES.length >= 11, 'bridges ' + BRIDGES.length);
  const kinds = new Set(BRIDGES.map(b => b.type));
  check('the bridges are of at least six different designs', kinds.size >= 6, [...kinds].join(', '));
  let overlap = 0;
  for (const a of BRIDGES) for (const b of BRIDGES) if (a !== b && a.axis === b.axis && a.c === b.c) overlap++;
  check('no two bridges are on the same road', overlap === 0);
  let dry = 0;                                                                   // a road crossing the water must be on a deck all the way
  for (const b of BRIDGES) for (let u = b.u0 + 3; u < b.u1 - 3; u += 2) { const x = b.axis === 'z' ? b.c : u, z = b.axis === 'z' ? u : b.c; if (riverSdf(x, z) < 0 && !bridgeAt(x, z)) dry++; }
  check('every metre of every road over the water has a deck under it', dry === 0, 'gaps ' + dry);
  check('the arch bridges rise in the middle and meet the road at both ends', BRIDGES.filter(b => b.H > 1).every(b => deckY(b, b.u0) === 0 && deckY(b, b.uc) > b.H * 0.9 && deckY(b, b.u1) === 0));
  let rounds = 0, nearWater = 0;
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) if (isRound(i, j)) { rounds++; if (riverSdf(i * SP, j * SP) < 60) nearWater++; }
  check('some junctions are roundabouts (not all, not none)', rounds > 30 && rounds < 110, 'roundabouts ' + rounds);
  check('none of them is beside the river', nearWater === 0);
  const lm = Object.entries(LANDMARKS).map(([k, v]) => { const [i, j] = k.split(',').map(Number), b = blockRect(i, j); return [v, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2]; });
  check('landmarks stand on dry land', lm.every(([, x, z]) => riverSdf(x, z) > 60));

  console.log('in the game');
  const A = await open({ w: 800, h: 450 }), P = A.page;
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 120000 });
  await P.evaluate(() => { const g = window.__game; if (g.game.onFoot) { g.game.onFoot = false; g.walker.show(false); g.setState('free'); } g.game.camMode = 0; g.traffic.cars.forEach(c => { c.active = false; }); });
  const drive = (x, z, h, secs) => P.evaluate(async ([x, z, h, secs]) => {
    const g = window.__game, rc = await import('./src/rivercourse.js'); g.city.loadNow(x, z, 2); g.car.reset(x, z, h); g.car.baseY = 0;
    let inW = 0, ymax = -9, ymin = 9; for (let k = 0; k < secs; k++) { g.simulate(1, { throttle: 1, gas: 1, steer: 0 }); if (rc.riverSdf(g.car.x, g.car.z) < 0 && !rc.bridgeAt(g.car.x, g.car.z)) inW++; ymax = Math.max(ymax, g.car.baseY); ymin = Math.min(ymin, g.car.baseY); }
    return { x: g.car.x, z: g.car.z, speed: g.car.speed, inW, ymax, ymin, sdf: rc.riverSdf(g.car.x, g.car.z) };
  }, [x, z, h, secs]);
  const susp = await drive(4, -150, Math.PI, 14);
  check('the car drives across the suspension bridge and on beyond it', susp.z < -420 && susp.inW === 0 && susp.ymin > -0.3, JSON.stringify(susp));
  const arch = await drive(184, -130, Math.PI, 14);
  check('and over a humped stone bridge, rising and coming back down', arch.z < -420 && arch.inW === 0 && arch.ymax > 1.0 && arch.ymax < 3.5, JSON.stringify(arch));
  const bank = await drive(-610, -200, Math.PI, 6);
  check('the car cannot be driven into the river from the bank', bank.inW === 0 && bank.sdf > 1 && bank.speed < 2, JSON.stringify(bank));
  const lake = await drive(-990, -200, Math.PI, 5);
  check('nor into the lake', lake.inW === 0 && lake.sdf > 1 && lake.speed < 2, JSON.stringify(lake));
  const tex = await P.evaluate(async () => {
    const { RIVER_TEX } = await import('./src/river.js'), rc = await import('./src/rivercourse.js'), t = RIVER_TEX.value, B = rc.RIVER_BOX, d = t.image.data, W = t.image.width, H = t.image.height;
    const at = (x, z) => d[Math.min(H - 1, Math.floor((z - B.z0) / (B.z1 - B.z0) * H)) * W + Math.min(W - 1, Math.floor((x - B.x0) / (B.x1 - B.x0) * W))];
    return { river: at(0, -296), lake: at(-990, -270), road: at(0, -150), land: at(-600, -150) };
  });
  check('the ground is cut away over the water (and not elsewhere)', tex.river < 100 && tex.lake < 100 && tex.road > 160 && tex.land > 160, JSON.stringify(tex));
  // traffic and people near the river for a minute
  const crowd = await P.evaluate(async () => {
    const g = window.__game, rc = await import('./src/rivercourse.js'); g.city.loadNow(0, -250, 2); g.car.reset(60, -200, Math.PI / 2); g.car.baseY = 0; g.traffic.cars.forEach(c => { c.active = true; });
    let bad = 0, seen = 0, onDeck = 0, sunk = 0;
    for (let s = 0; s < 120; s++) {
      g.simulate(0.5, { brake: 1 });
      for (const c of g.traffic.cars) { if (!c.active || c.z < -420 || c.z > 100 || Math.abs(c.x) > 1200) continue; seen++; if (rc.riverSdf(c.x, c.z) < 0 && !rc.bridgeAt(c.x, c.z)) bad++; const b = rc.bridgeAt(c.x, c.z); if (b) { onDeck++; const u = b.axis === 'z' ? c.z : c.x; if (c.y < rc.deckY(b, u) - 0.4) sunk++; } }
      if (g.peds) for (const p of g.peds.list) if (p.state !== 'away' && rc.inWater(p.x, p.z)) bad++;
    }
    return { bad, seen, onDeck, sunk };
  });
  check('a minute of traffic and pedestrians by the river: nothing ends up in the water', crowd.bad === 0 && crowd.seen > 500, JSON.stringify(crowd));
  check('cars on the humped bridges drive on the deck, not through it', crowd.sunk === 0, JSON.stringify(crowd));
  const rb = await P.evaluate(() => {
    const g = window.__game, T = g.traffic, out = { rounds: 0, paths: 0, minD: 1e9, maxTurn: 0, nan: 0 };
    return import('./src/junctions.js').then(J => {
      for (let i = -11; i <= 11; i++) for (let j = -11; j <= 11; j++) {
        if (!J.isRound(i, j)) continue; out.rounds++;
        for (const from of T.neighbours([i, j])) for (const lane of [0, 1, 2]) {
          const c = {}; T.buildPath(c, from, [i, j], lane); out.paths++; let prev = null;
          for (let k = 1; k < c.pts.length; k++) {
            const a = c.pts[k - 1], b = c.pts[k], seg = Math.hypot(b.x - a.x, b.z - a.z); if (!(seg >= 0)) out.nan++;
            const d = Math.hypot(b.x - i * 180, b.z - j * 180); if (k > 1 && d < 40) out.minD = Math.min(out.minD, d);
            if (seg > 0.01) { const h = Math.atan2(b.x - a.x, b.z - a.z); if (prev !== null) { let dh = Math.abs(h - prev); if (dh > Math.PI) dh = 2 * Math.PI - dh; out.maxTurn = Math.max(out.maxTurn, dh); } prev = h; }
          }
        }
      }
      return out;
    });
  });
  check('traffic goes round every roundabout on smooth curves, well clear of the island', rb.nan === 0 && rb.maxTurn < 0.5 && rb.minD > RB.island + 1.5 && rb.paths > 300, JSON.stringify(rb));
  const island = await P.evaluate(async () => {
    const g = window.__game, J = await import('./src/junctions.js'); let node = null;
    for (let i = -11; i <= 11 && !node; i++) for (let j = -11; j <= 11 && !node; j++) if (J.isRound(i, j) && !J.isRound(i, j - 1) && Math.abs(j) < 11) node = [i, j];
    const [i, j] = node, x = i * 180 + 5.7, z = j * 180 - 150; g.city.loadNow(x, z, 2); g.car.reset(x, z, 0); g.car.baseY = 0;   // heading south, straight at the island
    let minD = 1e9; for (let k = 0; k < 9; k++) { g.simulate(1, { throttle: 1, gas: 1, steer: 0 }); minD = Math.min(minD, Math.hypot(g.car.x - i * 180, g.car.z - j * 180)); }
    return { node, minD };
  });
  check('the car cannot drive over a roundabout island', island.minD > 6.5, JSON.stringify(island));
  const lms = await P.evaluate(() => { const g = window.__game, L = g.landmarks; return { sites: L.sites.map(s => s.name), wheel: !!L.wheel, boats: L.boats.length }; });
  check('the landmarks are all there (tower, stadium, cathedral, wheel, lighthouse) with boats on the river', ['Sunset Tower', 'Sunset Stadium', 'Cathedral', 'Ferris wheel', 'Lighthouse'].every(n => lms.sites.includes(n)) && lms.boats >= 3, JSON.stringify(lms));
  const a0 = await P.evaluate(() => { const g = window.__game, w = g.landmarks.wheel; g.car.reset(w.x + 30, w.z + 60, 0); return w.ang; });
  await step(P, 180);
  const a1 = await P.evaluate(() => window.__game.landmarks.wheel.ang);
  check('the big wheel turns', a1 > a0, a0 + ' -> ' + a1);
  check('no script errors', A.logs.length === 0, A.logs.slice(0, 3).join(' | '));
} catch (e) {
  check('map tests ran to the end', false, e.stack || String(e));
}
await finish();
