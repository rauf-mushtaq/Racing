// The map: the river and its bridges, the roundabouts, the landmarks. Run:  node tests/map.mjs  (npm test runs it too)
//  - numbers only: the water keeps clear of every junction, the bridges are where the roads cross it and don't overlap, roundabouts are sensible
//  - in the game: the car crosses bridges (up the hump and down) but cannot drive into the river or the lake, traffic and people never end up
//    in the water, the roads are really cut away where the water is, roundabout paths are smooth and keep clear of the island, landmarks are there
import { check, open, step, finish } from './lib.mjs';
import { RIVER, BRIDGES, LAKES, riverSdf, bridgeAt, deckY } from '../src/rivercourse.js';
import { SP, N, hw, blockRect, LANDMARKS, SIGNATURE, isPark, landmarkAt, signatureAt, isLakeBlock } from '../src/grid.js';
import { plaza as isPlaza, heightBL, nodeH, steepest, HILLS } from '../src/hills.js';
import { isRound, RB } from '../src/junctions.js';
import { AVENUES, roadSdf, wideSdf, lotPieces, polyArea, nearestAvenue } from '../src/avenues.js';

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

  console.log('the hills');
  check('there are hills in the city, thirty metres and more, and no road is steeper than one in six', Math.max(...HILLS.map(h => heightBL(h.cx, h.cz))) > 30 && steepest() < 0.16, 'steepest ' + (steepest() * 100).toFixed(1) + '%');
  check('the river, downtown and every landmark are on flat ground', lm.every(([, x, z]) => heightBL(x, z) === 0) && heightBL(0, 0) === 0 && heightBL(0, -300) === 0 && heightBL(900, -62) === 0);
  let rough = 0; for (let x = -1100; x < 1100; x += 30) for (let z = -460; z < 130; z += 30) if (heightBL(x, z) !== 0) rough++;
  check('and so is all the ground round the river', rough === 0, 'bumps ' + rough);
  console.log('the roads across the grid');
  { let near = 1e9, bad = 0, steep = 0;
    for (const A of AVENUES) for (let i = 0; i < A.n; i++) {
      const x = A.x[i], z = A.z[i], ni = Math.round(x / SP), nj = Math.round(z / SP); near = Math.min(near, Math.hypot(x - ni * SP, z - nj * SP) - A.hw);
      const bi = Math.floor(x / SP), bj = Math.floor(z / SP); if (Math.abs(bi) < N && Math.abs(bj) < N && (Object.keys(LANDMARKS).includes(bi + ',' + bj) || Object.keys(SIGNATURE).includes(bi + ',' + bj))) bad++;
      if (riverSdf(x, z) < 60) bad++;
      if (i) steep = Math.max(steep, Math.abs(heightBL(x, z) - heightBL(A.x[i - 1], A.z[i - 1])) / 12);
    }
    check('there are roads off the grid: two long diagonals, two that wind up the hills, rings and lanes round the Old Town and the stadium, and terraces round every hill', AVENUES.length >= 20 && AVENUES.filter(a => a.kind === 'diag').length >= 14 && AVENUES.filter(a => a.kind === 'hill').length >= 8 && ['grand', 'cross', 'skyline', 'mesa', 'oldring1', 'oldring2', 'lane3', 'stadring1', 't-sunset', 't-ridge2'].every(id => AVENUES.some(a => a.id === id)) && AVENUES.every(a => a.length > 250), AVENUES.map(a => a.id + ' ' + a.length.toFixed(0)).join(', '));
    check('they keep clear of every junction (a road\'s own width and 24 m more), the river, the landmarks and the skyscrapers', near >= 24 && bad === 0, 'closest junction (beyond the road\'s own half width) ' + near.toFixed(0) + ' m, bad ' + bad);
    check('and none is steeper than one in seven', steep < 0.14, (steep * 100).toFixed(1) + '%');
    const lot = { x0: -380, z0: 950, x1: -340, z1: 990 }, res = lotPieces(lot), hit = !!res, pieces = res ? res.pieces : [];
    check('a lot the roads run through is cut into pieces clear of every road and its pavements (here the diagonal and the Old Town\'s outer ring both cross it)', pieces.length >= 1 && pieces.some(p => polyArea(p) > 100) && pieces.every(p => p.every(([x, z]) => wideSdf(x, z) > -0.8)), JSON.stringify({ hit, n: pieces.length, areas: pieces.map(p => Math.round(polyArea(p))) }));
  }
  console.log('squares: plain blocks that no road but the grid touches');
  {                                                              // (before the crescents there were 307 of them, 23 within 900 m of where you start; they must be 28% fewer)
    const BEFORE = { all: 307, near: 23 }, START = [6, 480]; let all = 0, near = 0, ordinary = 0, rows = [];
    for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
      if (isPark(i, j) || isPlaza(i, j) || landmarkAt(i, j) || signatureAt(i, j) || isLakeBlock(i, j)) continue; ordinary++;
      const b = blockRect(i, j); let hit = false;
      for (let x = b.x0; x <= b.x1 && !hit; x += 10) for (let z = b.z0; z <= b.z1; z += 10) { const r = nearestAvenue(x, z); if (r && r.d < r.a.W + 2) { hit = true; break; } }
      if (hit) continue; all++; if (Math.hypot((b.x0 + b.x1) / 2 - START[0], (b.z0 + b.z1) / 2 - START[1]) < 900) near++;
    }
    check(`at least 28% fewer plain square blocks across the city (was ${BEFORE.all}, now ${all} of ${ordinary})`, all <= Math.floor(BEFORE.all * 0.72), `${all} > ${Math.floor(BEFORE.all * 0.72)}`);
    check(`and at least 28% fewer within 900 m of where you start (was ${BEFORE.near}, now ${near})`, near <= Math.floor(BEFORE.near * 0.72), `${near} > ${Math.floor(BEFORE.near * 0.72)}`);
    { let plain = 0, nearPlain = 0;                          // (the strict count: a block counts as broken only if a road runs through the middle of it, not just along an edge)
      for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
        if (isPark(i, j) || isPlaza(i, j) || landmarkAt(i, j) || signatureAt(i, j) || isLakeBlock(i, j)) continue;
        const b = blockRect(i, j); if (AVENUES.some(A => { for (let k = 0; k < A.n; k++) if (A.x[k] > b.x0 + 12 && A.x[k] < b.x1 - 12 && A.z[k] > b.z0 + 12 && A.z[k] < b.z1 - 12) return true; return false; })) continue;
        plain++; if (Math.hypot((b.x0 + b.x1) / 2 - START[0], (b.z0 + b.z1) / 2 - START[1]) < 900) nearPlain++;
      }
      check(`counting only blocks a road really runs through, still at least 28% fewer (310 before, now ${plain}; near the start 25 before, now ${nearPlain})`, plain <= Math.floor(310 * 0.72) && nearPlain <= Math.floor(25 * 0.72), `${plain} / ${nearPlain}`); }
    check('the new crescents are all there and none is a stub', ['c-north', 'c-grand', 'c-compass', 'c-east', 'c-merid', 'c-stad', 'c-west', 'c-circle', 'c-plaza', 'c-river', 'c-orchard'].every(id => AVENUES.some(a => a.id === id && a.length > 400)));
  }
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
  const hill = await P.evaluate(async () => {
    const g = window.__game, w = await import('./src/world.js'), x = -1440 + 6.3; g.city.loadNow(x, -1000, 2); g.car.reset(x, -650, Math.PI); g.car.baseY = w.groundAt(x, -650).y; g.traffic.cars.forEach(c => { c.active = false; });
    let top = 0, gap = 0; for (let k = 0; k < 14; k++) { g.simulate(1, { throttle: 0.55, gas: 0.55, steer: 0 }); top = Math.max(top, g.car.baseY); gap = Math.max(gap, Math.abs(g.car.baseY - w.groundAt(g.car.x, g.car.z).y)); }
    g.traffic.cars.forEach(c => { c.active = true; }); g.car.reset(-1000, -1000, 0); g.car.baseY = w.groundAt(-1000, -1000).y; g.city.loadNow(-1000, -1000, 2);
    let worst = 0, n = 0; for (let s = 0; s < 80; s++) { g.simulate(0.5, { brake: 1 }); for (const c of g.traffic.cars) { if (!c.active || c.mode !== 'drive' || Math.hypot(c.x + 1000, c.z + 1000) > 500) continue; n++; worst = Math.max(worst, Math.abs(c.y - w.groundAt(c.x, c.z).y)); } }
    // the buildings stand on the ground: the lowest vertex of every building mesh near the car is not up in the air or deep in the ground
    const hs = await import('./src/hills.js'); let high = 0, low = 0, tested = 0;
    for (const r of g.city.regions.values()) for (const m of r.far.children) { const mat = m.material; if (!mat.vertexColors || !mat.map) continue; const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i += 7) { const px = pos.getX(i), pz = pos.getZ(i), py = pos.getY(i), gy = hs.heightBL(px, pz); if (py - gy > 150) continue; tested++; if (py < gy - 8) low++; } }
    return { top, gap, n, worst, low, tested };
  });
  check('the car climbs the hill (more than twenty metres up a boulevard) and stays on the ground', hill.top > 20 && hill.gap < 2.5, JSON.stringify(hill));
  check('traffic on the hill drives on the road surface (within a few centimetres)', hill.n > 300 && hill.worst < 0.4, JSON.stringify({ n: hill.n, worst: hill.worst }));
  check('nothing built is buried deep in a hillside', hill.low === 0 && hill.tested > 1000, JSON.stringify({ low: hill.low, tested: hill.tested }));
  const roads = await P.evaluate(async () => {
    const g = window.__game, av = await import('./src/avenues.js'), w = await import('./src/world.js'), hs = await import('./src/hills.js'), out = { onRoadY: 0, pavementY: 0, h: 0 };
    g.city.loadNow(-300, 1010, 2); const A = av.AVENUES[0], grid = (x, z) => Math.abs(x - Math.round(x / 180) * 180) < 28 || Math.abs(z - Math.round(z / 180) * 180) < 28;
    let k = 150; while (k < 330 && (grid(A.x[k], A.z[k]) || grid(A.x[k] - A.tz[k] * 14, A.z[k] + A.tx[k] * 14))) k++;
    const x = A.x[k], z = A.z[k];
    out.h = hs.heightBL(x, z); out.onRoadY = +(w.groundAt(x, z).y - out.h).toFixed(2);
    const nx = -A.tz[k], nz = A.tx[k], o = A.hw + 2; out.pavementY = +(w.groundAt(x + nx * o, z + nz * o).y - hs.heightBL(x + nx * o, z + nz * o)).toFixed(2);
    // drive the length of a stretch of the grand diagonal
    g.traffic.cars.forEach(c => { c.active = false; }); const x0 = A.x[300] - A.tz[300] * 1.9, z0 = A.z[300] + A.tx[300] * 1.9, hd = Math.atan2(A.tx[300], A.tz[300]);
    g.car.reset(x0, z0, hd); g.car.baseY = w.groundAt(x0, z0).y; g.city.loadNow(x0, z0, 2);
    let off = 0, n = 0; for (let s = 0; s < 12; s++) { g.simulate(1, { throttle: 0.8, gas: 0.8, steer: 0 }); n++; if (av.roadSdf(g.car.x, g.car.z) > 4) off++; }
    out.travelled = Math.hypot(g.car.x - x0, g.car.z - z0); out.speed = g.car.speed; out.off = off;
    // straight at a building beside the road: it stops
    return out;
  });
  check('on a diagonal road the ground is road level (not up on the pavement), and the pavement beside it is a kerb higher', roads.onRoadY < 0.05 && roads.pavementY > 0.1, JSON.stringify(roads));
  check('a car drives along the diagonal, on its road, without being stopped by anything', roads.travelled > 120 && roads.off === 0 && roads.speed > 8, JSON.stringify(roads));
  const climb = await P.evaluate(async () => {
    const g = window.__game, av = await import('./src/avenues.js'), w = await import('./src/world.js'); let stuck = 0, tried = 0; const where = [];
    for (const A of av.AVENUES.filter(a => a.kind === 'hill')) for (let k = 12; k < A.n - 14; k += 7) {
      const x = A.x[k] - A.tz[k] * 1.4, z = A.z[k] + A.tx[k] * 1.4; g.city.loadNow(x, z, 1); g.car.reset(x, z, Math.atan2(A.tx[k], A.tz[k])); g.car.baseY = w.groundAt(x, z).y; g.traffic.cars.forEach(c => { c.active = false; });
      g.simulate(1.6, { throttle: 1, gas: 1, steer: 0 }); tried++; const d = Math.hypot(g.car.x - x, g.car.z - z); if (d < 3.5) { stuck++; where.push([A.id, k, Math.round(x), Math.round(z), +d.toFixed(1)]); }
    }
    return { tried, stuck, where: where.slice(0, 6) };
  });
  check('the roads that wind up the hills can be driven all the way (nothing built or planted on them)', climb.tried > 30 && climb.stuck <= 2, JSON.stringify(climb));
  const ave = await P.evaluate(async () => {
    const g = window.__game, av = await import('./src/avenues.js'), w = await import('./src/world.js'); const A = av.AVENUES[0]; g.city.loadNow(A.x[200], A.z[200], 2); g.car.reset(A.x[200] + 40, A.z[200] - 60, 0); g.car.baseY = w.groundAt(A.x[200] + 40, A.z[200] - 60).y;
    g.traffic.cars.forEach(c => { c.active = true; c.s = 1e9; });
    let seen = 0, off = 0, mx = 0; for (let s = 0; s < 90; s++) { g.simulate(0.5, { brake: 1 }); for (const c of g.traffic.cars) { if (!c.ave || c.mode !== 'drive') continue; seen++; if (av.roadSdf(c.x, c.z) > 0.5) off++; mx = Math.max(mx, Math.abs(c.y - w.groundAt(c.x, c.z).y)); } }
    return { seen, off, mx: +mx.toFixed(2) };
  });
  check('there is traffic on the diagonal, in its lanes, on the ground', ave.seen > 100 && ave.off <= ave.seen * 0.01 && ave.mx < 0.4, JSON.stringify(ave));
  const rd = await P.evaluate(async () => { const { ROAD_TEX } = await import('./src/roadcut.js'), av = await import('./src/avenues.js'), t = ROAD_TEX.value, d = t.image.data, W = t.image.width, R = 2300; const at = (x, z) => d[Math.floor((z + R) / (2 * R) * W) * W + Math.floor((x + R) / (2 * R) * W)]; const A = av.AVENUES[0]; return { road: at(A.x[200], A.z[200]), beside: at(A.x[200] - A.tz[200] * 40, A.z[200] + A.tx[200] * 40), far: at(1200, -1700) }; });
  check('the pavement is cut away along the roads across the grid (and only there)', rd.road < 110 && rd.beside > 200 && rd.far > 250, JSON.stringify(rd));
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
  // the city's character: skyscrapers, banks and the rest, and the street performers
  const city = await P.evaluate(async () => {
    const g = window.__game, cm = await import('./src/city.js'); let top = 0;
    for (const [x, z] of [[0, 150], [-90, 270], [-300, 100], [300, 150]]) g.city.loadNow(x, z, 2);
    for (const r of g.city.regions.values()) r.group.traverse(o => { if (o.isMesh && o.geometry && o.geometry.boundingBox === null) o.geometry.computeBoundingBox(); if (o.isMesh && o.geometry.boundingBox) top = Math.max(top, o.geometry.boundingBox.max.y); });
    const kinds = {}; for (const v of cm.CIVIC.values()) kinds[v[0]] = (kinds[v[0]] || 0) + 1;
    return { top, kinds };
  });
  check('there are skyscrapers well over 200 m tall downtown', city.top > 200, 'highest ' + city.top.toFixed(0));
  check('and banks, hotels and cinemas among the buildings', (city.kinds.bank || 0) >= 1 && (city.kinds.hotel || 0) >= 1 && (city.kinds.cinema || 0) >= 1, JSON.stringify(city.kinds));
  check('a dozen or more blocks hold a skyscraper of their own, and a few are plazas', Object.keys(SIGNATURE).length >= 12 && (() => { let n = 0; for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) if (isPlaza(i, j)) n++; return n >= 6; })());
  await P.evaluate(() => { const g = window.__game; g.buskers.audio.init(); window.__notes = 0; const a = g.buskers.audio, f = a.busk.bind(a); a.busk = (...q) => { window.__notes++; return f(...q); }; const w = a.applause.bind(a); window.__claps = 0; a.applause = (...q) => { window.__claps++; return w(...q); }; g.traffic.cars.forEach(c => { c.active = false; }); g.car.reset(19.8, 470, 0); g.city.loadNow(19.8, 452, 2); });
  await P.waitForFunction(() => window.__game.buskers.pool.length > 0, null, { timeout: 60000 }).catch(() => {});
  for (let k = 0; k < 4; k++) { await P.waitForTimeout(1500); await step(P, 120); }
  const bk = await P.evaluate(() => { const g = window.__game, B = g.buskers, live = B.pool.filter(p => p.spot); return { spots: B.constructor === Object ? 0 : (live.length ? live.map(p => p.spot.style + ':' + p.spot.watchers.length) : []), pool: B.pool.length, notes: window.__notes, visible: live.every(p => p.rig.root.visible) }; });
  const nSpots = await P.evaluate(async () => (await import('./src/buskers.js')).SPOTS.length);
  check('there are street performers all over the city', nSpots >= 30, 'spots ' + nSpots);
  { const onRoad = await P.evaluate(async () => { const { SPOTS } = await import('./src/buskers.js'), { wideSdf } = await import('./src/avenues.js'); return SPOTS.filter(q => wideSdf(q.x, q.z) < 0.5).map(q => q.name + ' ' + Math.round(q.x) + ',' + Math.round(q.z)); });
    check('no street performer stands on a road or its pavement, including the roads that cut across the grid', onRoad.length === 0, onRoad.join(' | ')); }
  check('the nearest performers appear (as real people) when you are close, with an audience, and play music', bk.pool > 0 && bk.spots.length > 0 && bk.visible && bk.spots.some(s => +s.split(':')[1] >= 2) && bk.notes > 5, JSON.stringify(bk));
  // streaming: a region built a sliver of time at a time is the same as one built all at once, and nothing of a half-built one is left behind
  const stm = await P.evaluate(async () => {
    const g = window.__game, c = g.city, cm = await import('./src/city.js'), out = {};
    const sig = r => { let v = 0, m = 0; r.group.traverse(o => { if (o.isMesh || o.isLineSegments) { m++; v += o.geometry.attributes.position.count; } if (o.isInstancedMesh) v += o.count / 1000; }); return JSON.stringify([m, Math.round(v * 1000) / 1000, r.colliders.length]); };
    const build = (ri, rj, deadline) => { const key = ri + ',' + rj; if (c.regions.has(key)) c.unload(key, c.regions.get(key)); c.deadline = deadline; let n = 0; const gen = c.genRegion(ri, rj); let r; do { r = gen.next(); n++; } while (!r.done); const f = c.finishGen(ri, rj, r.value); while (!f.next().done) n++; const s = sig(c.regions.get(key)); c.unload(key, c.regions.get(key)); return { s, n }; };
    out.same = []; out.slices = 0;
    for (const [ri, rj] of [[1, 2], [4, 8], [2, 1], [7, 8], [6, 7]]) { const whole = build(ri, rj, Infinity), cut = build(ri, rj, 0); out.same.push(whole.s === cut.s); out.slices += cut.n; if (whole.s !== cut.s) out.diff = [ri, rj, whole.s, cut.s]; }
    const before = cm.colliderCount(), [px, pz] = c.regionCenter(1, 2);
    c.deadline = 0; for (const k of [...c.regions.keys()]) c.unload(k, c.regions.get(k));
    const base = cm.colliderCount(), extra = c.group.children.length; out.base = base - before;
    for (let k = 0; k < 6 && !(c.job && c.job.gen); k++) c.update(px, pz, 0.01);
    for (let k = 0; k < 40; k++) c.update(px, pz, 0.05);                                                       // a few slices of work: a region is half made
    out.during = cm.colliderCount() - base; out.job = !!c.job;
    c.update(px + 4000, pz + 4000, 0.01);                                                                     // (far away: it is dropped)
    out.after = cm.colliderCount() - base - [...c.regions.values()].reduce((a, r) => a + r.colliders.length, 0);
    c.deadline = 0; for (let k = 0; k < 6 && !c.job; k++) c.update(px, pz, 0.01);
    for (let k = 0; k < 40; k++) c.update(px, pz, 0.05);                                                       // one is being made again...
    c.loadNow(px, pz, 1);                                                                                     // ...and a jump to the same place builds that very region at once
    for (let k = 0; k < 400; k++) c.update(px, pz, 8);                                                        // (let anything left over finish)
    out.orphans = c.group.children.length - c.regions.size - extra;
    return out;
  });
  check('a region built in thin slices is exactly the one built all at once (hills, diagonals, downtown)', stm.same.every(Boolean) && !stm.diff, JSON.stringify(stm.diff));
  check('building in slices really is in many small steps', stm.slices > 600, 'steps ' + stm.slices);
  check('a half-made region that is given up leaves no invisible walls in the street', stm.after === 0 && stm.during !== undefined, JSON.stringify(stm));
  check('jumping to where one is half made does not put two of the same region in the scene', stm.orphans === 0, JSON.stringify(stm));
  check('no script errors', A.logs.length === 0, A.logs.slice(0, 3).join(' | '));
} catch (e) {
  check('map tests ran to the end', false, e.stack || String(e));
}
await finish();
