// How hard the police try (src/police.js, src/stop.js, main.js: startWanted, escalateStop, takeCar). Wanted in the city (a robbery, say), fifteen
// seconds out of sight and they have lost you (the chase event keeps its full minute). Something small (hitting a car) sends one patrol car; drive
// off from it and only that car comes after you, never more of them, and it can be lost the same way; fire a gun at it and every unit comes. A police
// car taken with nobody watching (no officer, no car, nobody in the street) is not reported, and taken in the middle of a chase it loses them at once;
// seen taking one, it is the whole force.
import { check, open, step, finish } from './lib.mjs';

const until = (P, cond, secs, dt = 1 / 30) => P.evaluate(([cond, secs, dt]) => {
  const g = window.__game, f = new Function('g', 'return (' + cond + ')');
  for (let t = 0; t < secs; t += dt) { g.tick(dt); if (f(g)) return { ok: true, t: +t.toFixed(1) }; }
  return { ok: false, t: secs, state: g.stop.state, mode: g.police.mode };
}, [cond, secs, dt]);

try {
  const { page: P, logs } = await open({ init: () => { try { localStorage.setItem('sunsetcity.v1', JSON.stringify({ quality: 'low', renderScale: 0.75, cash: 5000 })); } catch (e) { /* private mode */ } } });
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 });
  await step(P, 60);
  await P.evaluate(() => { window.__freeze = true; });
  const inCar = await P.evaluate(() => { const g = window.__game, c = g.car; g.walker.place(c.x - Math.cos(c.h) * 1.6, c.z + Math.sin(c.h) * 1.6, c.h); g.tick(1 / 60); g.enterCar(); g.car.vx = 0; g.car.vz = 0; g.tick(1 / 60); return !g.game.onFoot; });
  check('(in the car to start)', inCar);

  // Nobody can see you (the police's line of sight is switched off), and the place they last saw you is moved a long way off so that they drive away
  // from you instead of boxing in a car that is standing still: what is measured is how long it takes them to give up.
  const hideFor = (P, secs, extra = '') => P.evaluate(([secs, extra]) => {
    const g = window.__game, Pc = g.police, see = Pc.canSee; Pc.canSee = () => false; Pc.heliSees = false;
    Pc.time = Math.max(Pc.time, 6.5); Pc.lastSeenX = g.car.x + 700; Pc.lastSeenZ = g.car.z; Pc.hidden = 0; Pc.spotAcc = 0;      // (counting from now)
    const need = Pc.hiddenNeeded, cash0 = g.settings.cash; let t = 0, at13 = null;
    for (; t < secs && g.game.chaseOn; t += 1 / 30) { g.tick(1 / 30); if (at13 === null && t >= 13) at13 = !!g.game.chaseOn; }
    Pc.canSee = see;
    return { need, t: +t.toFixed(1), at13, chase: !!g.game.chaseOn, solo: Pc.solo, banked: g.settings.cash - cash0, toast: document.getElementById('toast').textContent };
  }, [secs, extra]);

  console.log('a robbery: fifteen seconds out of sight');
  const rb = await P.evaluate(() => { const g = window.__game; g.game.noWanted = 0; g.game.carried = 1500; g.startWanted('robbery', 1); for (let i = 0; i < 10; i++) g.tick(1 / 30); return { chase: !!g.game.chaseOn, wanted: !!g.game.wanted, cops: g.police.cops.length, need: g.police.hiddenNeeded }; });
  check('a robbery brings the police (a chase), and fifteen seconds out of sight will lose them', rb.chase && rb.wanted && rb.cops >= 3 && rb.need === 15, JSON.stringify(rb));
  const r1 = await hideFor(P, 30);
  check('out of sight: still after you at 13 seconds, gone by 17 (it was a minute), and the loot is banked', r1.at13 === true && !r1.chase && r1.t > 14 && r1.t < 17.5 && r1.banked === 1500, JSON.stringify(r1));

  console.log('something small, and driving off');
  await P.evaluate(() => { const g = window.__game; g.game.noWanted = 0; g.car.vx = g.car.vz = 0; g.crime(0.5, 'car'); });
  let r = await until(P, "g.stop.state === 'signal'", 90);
  check('hitting a car: one patrol car comes, and signals you to pull over', r.ok, JSON.stringify(r));
  const fl = await P.evaluate(() => { const g = window.__game; g.stop.t = 16; for (let i = 0; i < 10; i++) g.tick(1 / 30); const o = { chase: !!g.game.chaseOn, stopOn: !!g.game.stopOn, solo: g.police.solo, cops: g.police.cops.length, toast: document.getElementById('toast').textContent }; for (let i = 0; i < 600; i++) g.tick(1 / 30); o.later = g.police.cops.filter(c => !c.wreck).length; o.stars = g.police.stars; o.need = g.police.hiddenNeeded; return o; });
  check('drive off: only that patrol car comes after you (not every unit), still the only one twenty seconds on, at one star', fl.chase && !fl.stopOn && fl.solo && fl.cops === 1 && fl.later === 1 && fl.stars === 1 && /PATROL CAR IS AFTER YOU/.test(fl.toast), JSON.stringify(fl));
  const r2 = await hideFor(P, 30);
  check('and it can be lost the same way: fifteen seconds out of its sight', !r2.chase && r2.t > 14 && r2.t < 17.5 && r2.need === 15, JSON.stringify(r2));

  console.log('driving off, then a gun');
  await P.evaluate(() => { const g = window.__game; g.game.noWanted = 0; g.car.vx = g.car.vz = 0; g.crime(0.3, 'break'); });
  r = await until(P, "g.stop.state === 'signal'", 90);
  const gn = await P.evaluate(() => { const g = window.__game; g.stop.t = 16; for (let i = 0; i < 10; i++) g.tick(1 / 30); const before = { solo: g.police.solo, cops: g.police.cops.length }; g.crime(1, 'gun'); for (let i = 0; i < 30; i++) g.tick(1 / 30); return { before, solo: g.police.solo, cops: g.police.cops.filter(c => !c.wreck).length, chase: !!g.game.chaseOn }; });
  check('one patrol car after you, then shots fired: every unit comes', r.ok && gn.before.solo && gn.before.cops === 1 && !gn.solo && gn.chase && gn.cops >= 4, JSON.stringify(gn));
  await P.evaluate(() => { const g = window.__game; g.endChase(); g.game.noWanted = 0; g.tick(1 / 60); });

  console.log('police cars outside the stations');
  // Three of the police cars parked outside the stations (the city is loaded round each station to find them).
  const cars = await P.evaluate(async () => {
    const g = window.__game, V = await import('./src/venues.js'), out = [];
    for (const v of [...V.VENUES.values()].filter(v => v.kind === 'police')) {
      g.city.loadNow(v.x, v.z, 1);
      for (const p of g.city.parkedList()) if (p.police !== undefined && !out.some(o => o.x === p.x && o.z === p.z)) out.push({ x: p.x, z: p.z, h: p.h });
      if (out.length >= 3) break;
    }
    return out;
  });
  check('(three police cars parked outside the stations to try)', cars.length >= 3, JSON.stringify(cars));
  // Walk up to one (nobody else near it unless `witness`) and take it.
  const takeAt = (P, c, witness) => P.evaluate(([c, witness]) => {
    const g = window.__game, w = g.walker; if (!g.game.onFoot) g.leaveCar(true);
    g.city.loadNow(c.x, c.z, 1); w.place(c.x + Math.cos(c.h) * 2.0, c.z - Math.sin(c.h) * 2.0, c.h); g.tick(1 / 60);
    for (const q of g.peds.list) if ((q.x - c.x) ** 2 + (q.z - c.z) ** 2 < 60 * 60) { q.x += 400; q.z += 400; }      // (the street round it emptied)
    if (witness) { const q = g.peds.list.find(q => q.state === 'walk' || q.state === 'idle'); if (q) { q.x = c.x + 9; q.z = c.z + 4; } }
    const p = g.city.parkedList().find(p => p.police !== undefined && Math.hypot(p.x - c.x, p.z - c.z) < 0.5), T = g.carToTake(), ok = g.enterCar();
    for (let i = 0; i < 6; i++) g.tick(1 / 30);
    return { found: !!p, what: T && T.what, ok, cop: !!(g.carMesh.userData.ride && g.carMesh.userData.ride.police), chase: !!g.game.chaseOn, stopOn: !!g.game.stopOn, wanted: !!g.game.wanted, result: g.police.result, toast: document.getElementById('toast').textContent };
  }, [c, witness]);

  const a = await takeAt(P, cars[0], false);
  await P.evaluate(() => { const g = window.__game; for (let i = 0; i < 60; i++) g.tick(1 / 30); });
  await new Promise(r => setTimeout(r, 1700));                    // (the message comes a moment after the car's name)
  const aT = await P.evaluate(() => document.getElementById('toast').textContent);
  check('a police car taken with nobody watching: no chase, nobody calls it in', a.found && a.what === 'parked' && a.ok && a.cop && !a.chase && !a.stopOn && /NOBODY SAW YOU/.test(aT), JSON.stringify({ a, aT }));

  const b0 = await P.evaluate(() => { const g = window.__game; g.leaveCar(true); g.tick(1 / 60); g.game.noWanted = 0; g.game.carried = 800; g.startWanted('robbery', 1); for (let i = 0; i < 10; i++) g.tick(1 / 30); const Pc = g.police; Pc._see = Pc.canSee; Pc.canSee = () => false; Pc.heliSees = false; return { chase: !!g.game.chaseOn, cash: g.settings.cash }; });
  const b = await takeAt(P, cars[1], false);
  const b1 = await P.evaluate(() => { const g = window.__game; for (let i = 0; i < 60; i++) g.tick(1 / 30); const Pc = g.police; Pc.canSee = Pc._see; return { chase: !!g.game.chaseOn, cash: g.settings.cash }; });
  check('in the middle of a chase, slipping into a police car with nobody watching loses them at once (and the loot is banked)', b0.chase && b.ok && b.cop && b.result === 'escaped' && /THEY HAVE LOST YOU/.test(b.toast) && !b1.chase && b1.cash - b0.cash === 800, JSON.stringify({ b0, b, b1 }));

  await P.evaluate(() => { const g = window.__game; g.game.noWanted = 0; });
  const c = await takeAt(P, cars[2], true);
  check('seen taking one (someone in the street): the whole force', c.ok && c.cop && c.chase && c.wanted && !c.stopOn && !c.toast.includes('NOBODY'), JSON.stringify(c));
  const cs = await P.evaluate(() => { const g = window.__game; for (let i = 0; i < 30; i++) g.tick(1 / 30); return { solo: g.police.solo, cops: g.police.cops.filter(c => !c.wreck).length }; });
  check('(a real chase: more than one car, not the solo pursuit)', !cs.solo && cs.cops >= 3, JSON.stringify(cs));
  await P.evaluate(() => { const g = window.__game; g.endChase(); g.tick(1 / 60); });
  check('no script errors', logs.length === 0, logs.slice(0, 3).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
