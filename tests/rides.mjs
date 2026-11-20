// Rides that are not cars (src/rides.js, main.js: takeRide, leaveCraft, craftCam). The motorbike beside your car at the start: get on, it goes, it
// leans into a bend with you on it, and you get off. The speedboat and the water scooter at the Port Meridian quay: board from the quay, they go
// on the water and stay on it (the shore stops them), you cannot step off at sea, and you can back at the quay. The helicopter on the helipad
// in the park: its rotor has to spin up, it climbs, flies, cannot go through a building, lands, and you get out (not in the air). The big map
// shows where they are. Every model loads.
import { check, open, step, finish } from './lib.mjs';

try {
  const { page: P, logs } = await open({ init: () => { try { localStorage.setItem('sunsetcity.v1', JSON.stringify({ quality: 'low', renderScale: 0.75 })); } catch (e) { /* private mode */ } } });
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 });
  await step(P, 30);
  await P.evaluate(() => { window.__freeze = true; });
  const tick = (n, keys = []) => P.evaluate(([n, keys]) => { const g = window.__game, k = g.input.keys; for (const c of keys) k.add(c); for (let i = 0; i < n; i++) g.tick(1 / 30); for (const c of keys) k.delete(c); }, [n, keys]);
  const prompt = () => P.evaluate(() => document.getElementById('prompt-txt').textContent);

  console.log('the rides');
  await P.waitForFunction(() => { const g = window.__game; g.tick(1 / 30); return g.rides && g.rides.list.length === 4 && g.rides.list.every(r => r.mesh); }, null, { timeout: 90000, polling: 100 }).catch(() => {});
  const L = await P.evaluate(() => { const g = window.__game; return { list: g.rides.list.map(r => ({ kind: r.kind, built: !!r.mesh, x: Math.round(r.x), z: Math.round(r.z) })), car: [Math.round(g.car.x), Math.round(g.car.z)] }; });
  check('four rides, each a real model, built where they are kept: a motorbike by your car, two boats at the harbour, a helicopter on its pad', L.list.length === 4 && L.list.every(r => r.built) && Math.hypot(L.list[0].x - L.car[0], L.list[0].z - L.car[1]) < 12 && L.list[1].x < -3300 && L.list[2].x < -3300 && L.list[3].z > 1000, JSON.stringify(L));

  console.log('the motorbike');
  const b0 = await P.evaluate(() => { const g = window.__game, r = g.rides.list.find(r => r.kind === 'bike'), w = g.walker; if (!g.game.onFoot) g.leaveCar(true); w.place(r.x + 1.2, r.z, -Math.PI / 2); for (let i = 0; i < 4; i++) g.tick(1 / 30); const pr = document.getElementById('prompt-txt').textContent, ok = g.enterCar(); g.tick(1 / 30); return { pr, ok, bike: !!g.carMesh.userData.bike, model: g.car.s.model, onFoot: g.game.onFoot, rider: g.seated.host === g.carMesh }; });
  check('at the bike the prompt says RIDE THE MOTORBIKE, and you get on it (its own physics)', b0.pr === 'RIDE THE MOTORBIKE' && b0.ok && b0.bike && b0.model === 'bike' && !b0.onFoot && b0.rider, JSON.stringify(b0));
  await tick(120, ['KeyW']);
  const b1 = await P.evaluate(() => { const g = window.__game; return { kmh: Math.round(g.car.speed * 3.6) }; });
  await tick(20, ['KeyW', 'KeyD']);
  const b2 = await P.evaluate(() => { const g = window.__game, u = g.carMesh.userData; return { lean: +u.lean.toFixed(2), body: +u.body.rotation.z.toFixed(2), rider: g.seated.root.visible, riderOn: g.seated.root.parent === u.body }; });
  check('it goes (over 70 km/h in four seconds) and leans into a bend (right: the body tips right, towards -x), you on it', b1.kmh > 70 && b2.lean > 0.25 && b2.body > 0.25 && b2.rider && b2.riderOn, JSON.stringify({ b1, b2 }));
  const b3 = await P.evaluate(() => { const g = window.__game; g.car.vx = g.car.vz = 0; const ok = g.leaveCar(true); for (let i = 0; i < 4; i++) g.tick(1 / 30); return { ok, onFoot: g.game.onFoot, pr: document.getElementById('prompt-txt').textContent }; });
  check('you get off, and it waits for you', b3.ok && b3.onFoot && /RIDE THE MOTORBIKE|GET IN/.test(b3.pr), JSON.stringify(b3));

  console.log('the speedboat');
  const s0 = await P.evaluate(() => { const g = window.__game, r = g.rides.list.find(r => r.kind === 'speedboat'), w = g.walker; w.place(-3318, r.craft.z, -Math.PI / 2); for (let i = 0; i < 20; i++) g.tick(1 / 30); const pr = document.getElementById('prompt-txt').textContent, wx = w.x, ok = g.enterCar(); g.tick(1 / 30); const c = g.game.craft; return { pr, wx: +wx.toFixed(1), ok, kind: c && c.kind, onFoot: g.game.onFoot, hidden: !g.walker.active, rider: g.seated.host === (c && c.mesh) }; });
  check('out on the harbour quay the prompt says TAKE THE SPEEDBOAT, and you are aboard, at the wheel', s0.wx < -3300 && s0.pr === 'TAKE THE SPEEDBOAT' && s0.ok && s0.kind === 'speedboat' && s0.hidden && s0.rider, JSON.stringify(s0));
  await tick(180, ['KeyW']);
  const s1 = await P.evaluate(() => { const c = window.__game.game.craft, W = { SEA_Y: -1.2 }; return { kmh: Math.round(c.speed * 3.6), y: +c.y.toFixed(2), x: Math.round(c.x), hud: document.getElementById('craft-hud').textContent, sea: c.water(c.x, c.z) }; });
  check('it goes out to sea (over 45 km/h in six seconds), floating at the water (and the readout shows the speed)', s1.kmh > 45 && s1.y > -2.2 && s1.y < -0.8 && s1.x < -3360 && s1.sea && /KM\/H/.test(s1.hud), JSON.stringify(s1));
  const s2 = await P.evaluate(() => { const g = window.__game, c = g.game.craft, why = c.canLeave(), ok = g.leaveCraft(); return { why, ok, still: g.game.craft === c }; });
  check('at sea you cannot step off', !!s2.why && !s2.ok && s2.still, JSON.stringify(s2));
  const h0 = await P.evaluate(() => window.__game.game.craft.h);
  await tick(45, ['KeyW', 'KeyA']);
  const s3 = await P.evaluate(h0 => { const c = window.__game.game.craft; return { turned: +Math.abs(((c.h - h0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI).toFixed(2), roll: +c.roll.toFixed(2) }; }, h0);
  check('it steers (and heels into the turn)', s3.turned > 0.5 && Math.abs(s3.roll) > 0.02, JSON.stringify(s3));
  // Straight at the quay: the shallows stop it short of the land.
  const s4 = await P.evaluate(() => { const g = window.__game, c = g.game.craft; c.place(-3345, 640, Math.PI / 2); const k = g.input.keys; k.add('KeyW'); let minX = -1e9; for (let i = 0; i < 300; i++) { g.tick(1 / 30); minX = Math.max(minX, c.x); } k.delete('KeyW'); return { maxX: +minX.toFixed(1), sea: c.water(c.x, c.z) }; });
  check('driven at the quay it stops in the water, short of the wall', s4.maxX < -3322 && s4.sea, JSON.stringify(s4));
  const s5 = await P.evaluate(() => { const g = window.__game, c = g.game.craft; c.vx = c.vz = 0; c.speed = 0; for (let i = 0; i < 10; i++) g.tick(1 / 30); const why = c.canLeave(), ok = g.leaveCraft(); for (let i = 0; i < 4; i++) g.tick(1 / 30); const w = g.walker; return { why, ok, craft: !!g.game.craft, onFoot: g.game.onFoot, w: [+w.x.toFixed(1), +w.z.toFixed(1)], vis: w.active }; });
  check('by the quay you step off onto it', !s5.why && s5.ok && !s5.craft && s5.onFoot && s5.vis && s5.w[0] > -3321, JSON.stringify(s5));

  console.log('the water scooter');
  const j0 = await P.evaluate(() => { const g = window.__game, r = g.rides.list.find(r => r.kind === 'jetski'), w = g.walker; w.place(-3318, r.craft.z, -Math.PI / 2); for (let i = 0; i < 10; i++) g.tick(1 / 30); const pr = document.getElementById('prompt-txt').textContent, ok = g.enterCar(); g.tick(1 / 30); return { pr, ok, kind: g.game.craft && g.game.craft.kind }; });
  await tick(150, ['KeyW']);
  const j1 = await P.evaluate(() => { const g = window.__game, c = g.game.craft; const r = { kmh: Math.round(c.speed * 3.6), size: c.mesh ? [+c.width.toFixed(2), +c.top.toFixed(2), +c.len.toFixed(2)] : null }; g.leaveCraft(true); g.tick(1 / 30); return r; });
  check('the water scooter: take it from the quay and it goes (over 45 km/h), the size of the real one', j0.pr === 'TAKE THE WATER SCOOTER' && j0.ok && j0.kind === 'jetski' && j1.kmh > 45 && j1.size[0] < 1.6 && j1.size[1] < 1.6 && Math.abs(j1.size[2] - 3.3) < 0.05, JSON.stringify({ j0, j1 }));

  console.log('the helicopter');
  const hp = await P.evaluate(() => { const g = window.__game, r = g.rides.list.find(r => r.kind === 'heli'), w = g.walker; g.city.loadNow(r.x, r.z, 1); w.place(r.x, r.z + 6, Math.PI); for (let i = 0; i < 10; i++) g.tick(1 / 30); const pr = document.getElementById('prompt-txt').textContent, ok = g.enterCar(); g.tick(1 / 30); const c = g.game.craft; return { pr, ok, kind: c && c.kind, spool: c && +c.spool.toFixed(2), y: c && +c.y.toFixed(2) }; });
  await tick(30, ['Space']);
  const h1 = await P.evaluate(() => { const c = window.__game.game.craft; return { alt: +c.alt.toFixed(2), spool: +c.spool.toFixed(2), ground: c.onGround, why: c.canLeave() }; });
  check('at the helipad: FLY THE HELICOPTER; aboard, the rotor has to spin up first (it does not lift yet)', hp.pr === 'FLY THE HELICOPTER' && hp.ok && hp.kind === 'heli' && hp.spool < 0.2 && h1.alt < 0.5 && h1.spool < 0.85, JSON.stringify({ hp, h1 }));
  await tick(90); await tick(150, ['Space']);
  const h2 = await P.evaluate(() => { const c = window.__game.game.craft, ok = window.__game.leaveCraft(); return { alt: Math.round(c.alt), ground: c.onGround, ok, why: c.canLeave(), hud: document.getElementById('craft-hud').textContent }; });
  check('then Space climbs (over 25 m), and you cannot get out in the air', h2.alt > 25 && !h2.ground && !h2.ok && h2.why === 'LAND FIRST' && /M UP/.test(h2.hud), JSON.stringify(h2));
  await tick(180, ['KeyW']);
  const h3 = await P.evaluate(() => { const c = window.__game.game.craft; return { kmh: Math.round(c.speed * 3.6), pitch: +c.pitch.toFixed(2), alt: Math.round(c.alt), rotor: !!c.rotor && Math.abs(c.rotor.rotation.y) > 0 }; });
  check('forward: it flies (over 120 km/h) at its height, the rotor turning', h3.kmh > 120 && h3.alt > 20 && h3.rotor, JSON.stringify(h3));
  // A tall building: put it low beside one, nose towards it, and fly at it.
  const hw = await P.evaluate(async () => {
    const g = window.__game, c = g.game.craft, C = await import('./src/city.js'); g.city.loadNow(c.x, c.z, 2); const q = [];
    let best = null; for (const r of [150, 300, 500]) { C.queryColliders(c.x, c.z, r, q); for (const o of q) if (o.bld && o.type === 'box' && o.bld.h > 25 && (o.x1 - o.x0) > 12 && (o.z1 - o.z0) > 12) { best = o; break; } if (best) break; }
    if (!best) return { none: true };
    const sx = best.x0 - 25; c.place(sx, (best.z0 + best.z1) / 2, Math.PI / 2, 0.15 + 8); c.onGround = false; c.vy = 0;
    const k = g.input.keys; k.add('KeyW'); let inside = false; for (let i = 0; i < 150; i++) { g.tick(1 / 30); if (c.x > best.x0 && c.x < best.x1 && c.z > best.z0 && c.z < best.z1 && c.y < 0.15 + best.bld.h) inside = true; } k.delete('KeyW');
    return { inside, x: +c.x.toFixed(1), x0: best.x0, h: best.bld.h, y: +c.y.toFixed(1) };
  });
  check('it cannot fly through a building: low beside one and flown at it, it stops at the wall', !hw.none && !hw.inside && hw.x < hw.x0, JSON.stringify(hw));
  const h4 = await P.evaluate(() => { const g = window.__game, c = g.game.craft, k = g.input.keys; c.place(c.x - 60, c.z, c.h, c.y + 20); c.onGround = false; k.add('KeyZ'); for (let i = 0; i < 600; i++) { g.tick(1 / 30); if (i > 5 && c.onGround) break; } k.delete('KeyZ'); for (let i = 0; i < 30; i++) g.tick(1 / 30); const dbg = { y: +c.y.toFixed(2), alt: +c.alt.toFixed(2), vy: +c.vy.toFixed(2), fl: +c.floor(c.x, c.z).toFixed(2), x: +c.x.toFixed(1), z: +c.z.toFixed(1), spool: c.spool }; const why = c.canLeave(), ok = g.leaveCraft(); for (let i = 0; i < 4; i++) g.tick(1 / 30); return { dbg, ground: c.onGround, why, ok, onFoot: g.game.onFoot, craft: !!g.game.craft, w: g.walker.active, dist: +Math.hypot(g.walker.x - c.x, g.walker.z - c.z).toFixed(1) }; });
  check('Z brings it down; landed, you get out beside it', h4.ground && !h4.why && h4.ok && h4.onFoot && !h4.craft && h4.w && h4.dist < 8, JSON.stringify(h4));

  console.log('the map, and the police');
  const mp = await P.evaluate(() => { const g = window.__game; return g.bigmap.h.rides().map(r => r.kind); });
  check('the big map shows where the rides are', ['bike', 'speedboat', 'jetski', 'heli'].every(k => mp.includes(k)), JSON.stringify(mp));
  const pc = await P.evaluate(() => { const g = window.__game, r = g.rides.list.find(r => r.kind === 'heli'), w = g.walker; w.place(r.craft.x, r.craft.z + 6, Math.PI); g.tick(1 / 30); g.enterCar(); g.game.noWanted = 0; g.startWanted('robbery', 1); for (let i = 0; i < 10; i++) g.tick(1 / 30); const t = g.police.target === g.game.craft; g.endChase(); g.leaveCraft(true); g.tick(1 / 30); return { t, chase: !!g.game.chaseOn }; });
  check('wanted while in the helicopter, it is the helicopter they are after', pc.t && !pc.chase, JSON.stringify(pc));
  check('no script errors', logs.length === 0, logs.slice(0, 3).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
