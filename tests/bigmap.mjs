// The big map (src/bigmap.js) and teleporting from it: it opens, zooms, pans, picks spots, lists places, sets waypoints; a teleport asks twice, lands in a lane on a
// road with room for the car, keeps you on foot if you were, and is refused in a race, in a chase and on water.   node tests/bigmap.mjs
import { check, open, step, finish } from './lib.mjs';

const A = await open({ debug: true, w: 1180, h: 820 });
const P = A.page;
try {
  await P.click('button[data-m="free"]'); await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 }); await step(P, 90);

  console.log('opening and looking');
  const o = await P.evaluate(() => { const g = window.__game, t0 = performance.now(); g.toggleMap(); const ms = performance.now() - t0, b = g.bigmap; return { ms: Math.round(ms), state: g.game.state, vis: !document.getElementById('bigmap').classList.contains('hidden'), s: b.v.s, W: b.W, H: b.H, cvw: document.getElementById('bigmap-c').getBoundingClientRect().width }; });
  check('Tab opens the map (the game stops under it), the first draw takes under 3 s and the picture fills the screen', o.state === 'map' && o.vis && o.ms < 3000 && o.W >= 1100 && o.cvw >= 1100, JSON.stringify(o));
  const shot = async name => { try { await P.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/${name}.png` : '/dev/null' }); } catch (e) { /* no shot */ } };
  await shot('map-open');

  console.log('zoom and pan');
  const z = await P.evaluate(async () => {
    const b = window.__game.bigmap, out = {}, click = id => document.getElementById(id).click(), cv = document.getElementById('bigmap-c');
    click('bm-world'); out.world = b.v.s; click('bm-city'); out.city = b.v.s; click('bm-in'); out.in = b.v.s; click('bm-out'); click('bm-out'); out.out = b.v.s;
    const r = cv.getBoundingClientRect(); cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, cancelable: true })); out.wheel = b.v.s;
    click('bm-world'); out.cx = b.v.cx; out.cz = b.v.cz; return out;
  });
  check('CITY shows the city and WORLD the whole world, and + - and the wheel zoom', z.city > z.world * 3 && z.in > z.city && z.out < z.in && z.wheel > z.out, JSON.stringify(z));
  const drag = await P.evaluate(async () => {
    const b = window.__game.bigmap, cv = document.getElementById('bigmap-c'), r = cv.getBoundingClientRect(); document.getElementById('bm-city').click(); const c0 = [b.v.cx, b.v.cz];
    const ev = (t, x, y, id = 1) => cv.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: r.left + x, clientY: r.top + y, bubbles: true, isPrimary: true, pointerType: 'touch' }));
    ev('pointerdown', 600, 400); ev('pointermove', 500, 340); ev('pointermove', 400, 280); ev('pointerup', 400, 280);
    return { dx: b.v.cx - c0[0], dz: b.v.cz - c0[1], sel: !!b.sel };
  });
  check('dragging moves the map the other way (and a drag is not a tap)', drag.dx > 100 && drag.dz > 60 && !drag.sel, JSON.stringify(drag));
  const pinch = await P.evaluate(() => {
    const b = window.__game.bigmap, cv = document.getElementById('bigmap-c'), r = cv.getBoundingClientRect(); document.getElementById('bm-city').click(); const s0 = b.v.s;
    const ev = (t, x, y, id) => cv.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerType: 'touch' }));
    ev('pointerdown', 500, 400, 1); ev('pointerdown', 700, 400, 2); ev('pointermove', 460, 400, 1); ev('pointermove', 740, 400, 2); ev('pointermove', 400, 400, 1); ev('pointermove', 800, 400, 2); ev('pointerup', 400, 400, 1); ev('pointerup', 800, 400, 2);
    return { k: b.v.s / s0, sel: !!b.sel };
  });
  check('pinching with two fingers zooms in', pinch.k > 1.5 && !pinch.sel, JSON.stringify(pinch));

  console.log('picking a spot, waypoints, the places list');
  const pk = await P.evaluate(async () => {
    const b = window.__game.bigmap, g = window.__game; document.getElementById('bm-city').click();
    const cv = document.getElementById('bigmap-c'), r = cv.getBoundingClientRect(), k = r.width / b.W, [sx, sy] = b.toScreen(0, 0), ev = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, { pointerId: 5, clientX: r.left + x, clientY: r.top + y, bubbles: true, isPrimary: true, pointerType: 'touch' }));
    ev('pointerdown', sx * k, sy * k); ev('pointerup', sx * k, sy * k);
    const pop = document.getElementById('bm-pop'), pr = pop.getBoundingClientRect(), out = { sel: b.sel && b.sel.name, shown: !pop.classList.contains('hidden'), inside: pr.left >= r.left - 1 && pr.right <= r.right + 1 && pr.top >= r.top - 1 && pr.bottom <= r.bottom + 1, sub: document.getElementById('bm-pop-sub').textContent };
    document.getElementById('bm-wp').click(); out.wp = g.game.waypoint && Math.hypot(g.game.waypoint.x, g.game.waypoint.z) < 1; document.getElementById('bm-wp').click(); out.wpOff = g.game.waypoint === null; return out;
  });
  check('tapping the map picks that spot and a card says what is there and how far; it stays on screen', pk.shown && pk.inside && /Downtown|Road|Diagonal|Midtown/.test(pk.sel || '') && /away|here/.test(pk.sub), JSON.stringify(pk));
  check('SET WAYPOINT puts the waypoint on that spot and pressing it again takes it off', pk.wp && pk.wpOff, JSON.stringify(pk));
  const pl = await P.evaluate(async () => {
    const b = window.__game.bigmap, m = await import('./src/bigmap.js'), w = await import('./src/world.js'), chips = document.querySelectorAll('#bm-chips button'), bad = [];
    for (const p of m.PLACES) if (isNaN(p.x) || isNaN(p.z) || p.x < w.WORLD.x0 || p.x > w.WORLD.x1 || p.z < w.WORLD.z0 || p.z > w.WORLD.z1 || w.isWater(p.x, p.z)) bad.push(p.name);
    chips[chips.length - 1].click(); return { n: m.PLACES.length, chips: chips.length, bad, sel: b.sel && b.sel.name, last: m.PLACES[m.PLACES.length - 1].name };
  });
  check('the places list names the city, the hills and every town, farm and site, all on land; picking one centres it and selects it', pl.n >= 22 && pl.chips === pl.n && pl.bad.length === 0 && pl.sel === pl.last, JSON.stringify(pl));
  await P.evaluate(() => document.getElementById('bm-city').click()); await shot('map-city');
  await P.evaluate(() => document.getElementById('bm-world').click()); await shot('map-world');

  console.log('teleporting');
  const confirm = await P.evaluate(async () => {
    const b = window.__game.bigmap, g = window.__game; document.getElementById('bm-world').click(); b.select(-1000, 1400); const p0 = [g.car.x, g.car.z];
    const tp = document.getElementById('bm-tp'); tp.click(); const after1 = { state: g.game.state, same: g.car.x === p0[0] && g.car.z === p0[1], armed: tp.textContent };
    tp.click(); return { after1, state: g.game.state };
  });
  check('TELEPORT asks twice: the first tap only arms it', confirm.after1.state === 'map' && confirm.after1.same && /AGAIN/.test(confirm.after1.armed), JSON.stringify(confirm));
  const tp1 = await P.evaluate(async () => { const g = window.__game, w = await import('./src/world.js'); const gr = w.groundAt(g.car.x, g.car.z); return { state: g.game.state, x: Math.round(g.car.x), z: Math.round(g.car.z), speed: g.car.speed, onFoot: g.game.onFoot, toast: document.getElementById('toast').textContent, hidden: document.getElementById('bigmap').classList.contains('hidden'), kind: gr.kind }; });
  check('the second tap teleports: the map closes, you are playing again, in a lane of a street near the spot, standing still', tp1.state === 'free' && tp1.hidden && Math.hypot(tp1.x + 1000, tp1.z - 1400) < 230 && tp1.speed < 0.5 && tp1.kind === 'asphalt', JSON.stringify(tp1));
  await step(P, 180);
  const tp2 = await P.evaluate(() => { const g = window.__game; return { x: Math.round(g.car.x), z: Math.round(g.car.z), v: +g.car.speed.toFixed(2), onFoot: g.game.onFoot }; });
  check('after 3 s the car is still there and not flung about', Math.hypot(tp2.x - tp1.x, tp2.z - tp1.z) < 3 && tp2.v < 1, JSON.stringify([tp1, tp2]));
  check('you teleport on foot beside your car if you were on foot', await P.evaluate(async () => { const g = window.__game; g.leaveCar(); await new Promise(r => setTimeout(r, 50)); g.toggleMap(); g.bigmap.select(900, 1500); g.bigmap.teleportClick(); g.bigmap.teleportClick(); return g.game.onFoot && Math.hypot(g.walker.x - g.car.x, g.walker.z - g.car.z) < 6 && Math.hypot(g.car.x - 900, g.car.z - 1500) < 230 && g.game.state === 'free'; }));

  console.log('every kind of place');
  const every = await P.evaluate(async () => {
    const g = window.__game, m = await import('./src/bigmap.js'), w = await import('./src/world.js'), res = [];
    g.enterCar && g.game.onFoot && g.enterCar();
    for (const p of m.PLACES) {
      g.game.onFoot = false; if (g.game.state !== 'free') g.setState('free'); g.toggleMap(); g.bigmap.goTo(p); const r = g.teleportTo(p.x, p.z);
      if (!r) { res.push({ n: p.name, fail: 1 }); g.setState('free'); g.bigmap.close(); continue; }
      const gr = w.groundAt(g.car.x, g.car.z), d = Math.hypot(g.car.x - p.x, g.car.z - p.z), clear = g.spotClear(g.car.x, g.car.z);
      res.push({ n: p.name, d: Math.round(d), r: p.r, kind: gr.kind, clear, y: +(g.car.baseY - gr.y).toFixed(2) });
    }
    return res;
  });
  const fails = every.filter(e => e.fail || e.d > Math.max(260, e.r + 120) || !e.clear || e.kind === 'water' || Math.abs(e.y) > 0.6);
  check('every named place can be teleported to: you land within reach of it, on dry ground with room for the car', every.length >= 22 && fails.length === 0, JSON.stringify(fails.slice(0, 6)));
  const spread = await P.evaluate(async () => {
    const g = window.__game, w = await import('./src/world.js'), out = { cityTaps: 0, cityOnRoad: 0, n: 0, bad: [] };
    for (let k = 0; k < 40; k++) {                                              // taps all over: the city, the hills, the river, the lakes, the country
      const x = k < 20 ? -2150 + ((k * 677) % 4300) : -2800 + ((k * 2749) % 9400) + 0.5 * k, z = k < 20 ? -2150 + ((k * 1319) % 4300) : -5000 + ((k * 3571) % 11000);
      g.setState('free'); g.toggleMap(); g.bigmap.select(x, z); const water = w.isWater(x, z); const r = g.teleportTo(x, z); out.n++;
      if (!r) { if (!water && !g.snapToRoad(x, z) && Math.abs(x) < 2200 && Math.abs(z) < 2200) out.bad.push([Math.round(x), Math.round(z), 'refused']); g.setState('free'); g.bigmap.close(); continue; }
      const gr = w.groundAt(g.car.x, g.car.z); if (Math.abs(x) < 2100 && Math.abs(z) < 2100) { out.cityTaps++; if (gr.kind === 'asphalt') out.cityOnRoad++; } if (!g.spotClear(g.car.x, g.car.z) || gr.kind === 'water') out.bad.push([Math.round(x), Math.round(z), gr.kind]);
    }
    return out;
  });
  check('forty taps spread over the city, hills, river, lakes and country: none ends in water or inside a building, and every one in the city is in a street', spread.bad.length === 0 && spread.cityTaps >= 15 && spread.cityOnRoad === spread.cityTaps, JSON.stringify(spread));
  await step(P, 120);
  check('driving on after all those teleports: still alive, no script errors', A.logs.length === 0, A.logs.slice(0, 3).join(' | '));

  console.log('not when it must not');
  const water = await P.evaluate(() => { const g = window.__game; g.setState('free'); g.toggleMap(); g.bigmap.select(-3900, 600); const b = document.getElementById('bm-tp'); const p0 = [g.car.x, g.car.z]; const r = g.teleportTo(-3900, 600); return { r, moved: g.car.x !== p0[0], state: g.game.state }; });
  check('a tap on the sea cannot be teleported to (you stay where you are)', water.r === null && !water.moved, JSON.stringify(water));
  const chase = await P.evaluate(async () => {
    const g = window.__game; g.setState('free'); g.startChase(); await new Promise(r => setTimeout(r, 60)); g.toggleMap();
    const out = { why: g.teleportWhy(), btn: document.getElementById('bm-tp') }; g.bigmap.select(500, 500); const b = document.getElementById('bm-tp'), p0 = [g.car.x, g.car.z]; b.click(); b.click();
    out.disabled = b.disabled; out.moved = g.car.x !== p0[0] || g.car.z !== p0[1]; out.msg = document.getElementById('bm-pop-why').textContent; delete out.btn; g.toggleMap(); g.endChase(); return out;
  });
  check('in a police chase the TELEPORT button is greyed out with the reason and does nothing', /CHASE/.test(chase.why || '') && chase.disabled && !chase.moved && /CHASE/.test(chase.msg), JSON.stringify(chase));
  const race = await P.evaluate(async () => {
    const g = window.__game; g.setState('free'); g.startEvent(g.EVENTS[0]); await new Promise(r => setTimeout(r, 60)); g.toggleMap();
    const out = { why: g.teleportWhy() }; const p0 = [g.car.x, g.car.z]; out.r = g.teleportTo(0, 0); out.moved = g.car.x !== p0[0]; g.toggleMap(); return out;
  });
  check('in a race the map still opens but teleporting is refused', /RACE/.test(race.why || '') && race.r === null && !race.moved, JSON.stringify(race));
  check('the map and teleports made no script errors at all', A.logs.length === 0, A.logs.slice(0, 3).join(' | '));
} catch (e) {
  check('big map tests ran to the end', false, e.stack || String(e));
}
await finish();
