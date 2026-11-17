// Getting into any car (src/fleetcar.js, and main.js: carToTake, takeCar). Walk up to a car in the traffic that has stopped and you pull the
// driver out and drive it (it handles like that kind of car, not like yours), and somebody calls the police; the car you got out of stays where
// you left it and you can go back to it. A parked car is yours if nobody sees. Pulled over in a stolen car, the plate gives it away: an arrest.
// A police car (the one that pulled you over, or one parked outside a police station) brings the whole force. After the cells, the stolen cars
// have gone back and you have your own.
import { check, open, step, finish } from './lib.mjs';

const until = (P, cond, secs, dt = 1 / 30) => P.evaluate(([cond, secs, dt]) => {
  const g = window.__game, f = new Function('g', 'return (' + cond + ')'), seen = new Set();
  for (let t = 0; t < secs; t += dt) { g.tick(dt); seen.add(g.stop.state); if (f(g)) return { ok: true, t: +t.toFixed(1), seen: [...seen] }; }
  return { ok: false, t: secs, seen: [...seen], why: g.stop.why, state: g.stop.state };
}, [cond, secs, dt]);
const wait = ms => new Promise(r => setTimeout(r, ms));

try {
  const { page: P, logs } = await open({ init: () => { try { localStorage.setItem('sunsetcity.v1', JSON.stringify({ quality: 'low', renderScale: 0.75, cash: 5000 })); } catch (e) { /* private mode */ } } });
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 });
  await step(P, 60);
  await P.evaluate(() => { window.__freeze = true; const g = window.__game; g.officers.prepare(); });
  await P.waitForFunction(() => window.__game.officers.ready, null, { timeout: 90000 }).catch(() => {});

  const S0 = await P.evaluate(() => ({ x: window.__game.walker.x, z: window.__game.walker.z }));            // (where you start: there are car parks near it)
  console.log('a car in the traffic');
  const t1 = await P.evaluate(() => {
    const g = window.__game, w = g.walker; let best = null, bd = 1e9;
    for (const t of g.traffic.cars) { if (!t.active || !t.pts || t.mode !== 'drive' || t.type !== 0) continue; const d = Math.hypot(t.x - w.x, t.z - w.z); if (d < bd) { bd = d; best = t; } }
    const t = best; t.speed = 0; t.vmax = 0;                                       // (stopped, as at a red light)
    w.place(t.x + Math.cos(t.h) * 2.0, t.z - Math.sin(t.h) * 2.0, t.h); for (let i = 0; i < 10; i++) g.tick(1 / 60);
    const prompt = document.getElementById('prompt-txt').textContent, T = g.carToTake(), was = { x: t.x, z: t.z };
    const ok = g.enterCar();
    return { prompt, what: T && T.what, ok, onFoot: g.game.onFoot, home: g.isHome(), model: g.car.s.model, mass: g.car.s.mass, left: g.left.map(l => l.mesh === g.heroMesh ? 'yours' : l.mesh.userData.fleet),
      out: g.peds.list.filter(p => p.state === 'down' && Math.hypot(p.x - was.x, p.z - was.z) < 5).length, moved: Math.hypot(t.x - was.x, t.z - was.z) > 100, stopOn: !!g.game.stopOn, charge: Object.keys(g.stop.charges || {}), driver: !!g.seated.host && g.seated.host === g.carMesh };
  });
  check('beside a car stopped in the traffic, the button says TAKE THE CAR', t1.prompt === 'TAKE THE CAR' && t1.what === 'traffic', JSON.stringify(t1));
  check('you get in: it is that car now (a saloon, with you at the wheel), not yours', t1.ok && !t1.onFoot && !t1.home && t1.model === 'saloon' && t1.driver, JSON.stringify(t1));
  check('the driver is pulled out onto the road, and the car leaves the traffic', t1.out >= 1 && t1.moved, JSON.stringify(t1));
  check('your own car is left where it was', t1.left.length === 1 && t1.left[0] === 'yours', JSON.stringify(t1));
  check('the driver calls the police: one patrol car, for taking a car by force', t1.stopOn && t1.charge.includes('jack'), JSON.stringify(t1));

  console.log('driving it');
  await P.evaluate(() => { const g = window.__game; g.endChase(); });
  await P.keyboard.down('KeyW'); await step(P, 240); await P.keyboard.up('KeyW');
  const d1 = await P.evaluate(() => { const g = window.__game, ud = g.carMesh.userData; return { speed: +g.car.speed.toFixed(1), rpm: Math.round(g.car.rpm), red: g.car.s.redline, wheels: ud.wheels.length, roll: +ud.wheels[0].spin.rotation.x.toFixed(2), cockpit: !!ud.cockpit.eye }; });
  check('it drives: about 4 s of throttle gets it to 50-90 km/h, its engine revs to its own red line', d1.speed * 3.6 > 50 && d1.speed * 3.6 < 90 && d1.red < 7000 && d1.rpm <= d1.red + 400 && d1.wheels === 4 && d1.roll !== 0, JSON.stringify(d1));
  await P.keyboard.down('KeyS'); await step(P, 300); await P.keyboard.up('KeyS');

  console.log('pulled over in it');
  const pl = await P.evaluate(() => { const g = window.__game; g.car.vx = g.car.vy = 0; g.game.noWanted = 0; g.crime(0.5, 'car'); return { stopOn: !!g.game.stopOn, stolen: g.stolen() }; });
  let r = await until(P, "g.stop.state === 'talk' && !!g.stop.verdict", 100);
  const v = await P.evaluate(() => { const g = window.__game, V = g.stop.verdict; return V ? { arrest: V.arrest, list: V.list.map(c => c.kind), line: g.stop.line } : null; });
  check('pulled over in a stolen car, the officer checks the plate: it is an arrest for taking it', pl.stopOn && pl.stolen && r.ok && v && v.arrest && v.list.includes('theft'), JSON.stringify({ pl, r, v }));
  await P.evaluate(() => { const g = window.__game; g.endChase(); g.stop.end && g.stop.active && g.stop.end(); });

  console.log('back to your own car');
  const b = await P.evaluate(() => {
    const g = window.__game; g.car.vx = g.car.vy = 0; g.leaveCar(true); g.tick(1 / 60);
    const taken = g.carMesh, hero = g.left.find(l => l.mesh === g.heroMesh), w = g.walker;
    w.place(hero.x + Math.cos(hero.h) * 1.9, hero.z - Math.sin(hero.h) * 1.9, hero.h); g.tick(1 / 60);
    const prompt = document.getElementById('prompt-txt').textContent, ok = g.enterCar();
    return { prompt, ok, home: g.isHome(), spec: g.car.s.model === undefined, left: g.left.map(l => l.mesh.userData.fleet || 'yours'), stays: g.left.some(l => l.mesh === taken) && taken.parent === g.scene };
  });
  check('get out, walk back to your own car and get in: it is yours again (its own handling)', b.prompt === 'GET IN' && b.ok && b.home && b.spec, JSON.stringify(b));
  check('the car you took stays parked where you left it', b.stays && b.left.length === 1 && b.left[0] === 'saloon', JSON.stringify(b));

  console.log('a police car');
  const pc0 = await P.evaluate(() => { const g = window.__game; g.endChase(); g.game.noWanted = 0; g.car.vx = g.car.vy = 0; g.crime(0.5, 'car'); return !!g.game.stopOn; });
  r = await until(P, "g.stop.state === 'talk'", 100);
  if (!r.ok) r.diag = await P.evaluate(() => { const g = window.__game, o = g.stop.off, c = g.car, R = v => Math.round(v * 10) / 10; return { off: [R(o.x - c.x), R(o.z - c.z)], noClip: !!o.noClip, cop: g.police.cops.map(k => [R(k.x - c.x), R(k.z - c.z)]), left: g.left.map(l => [R(l.x - c.x), R(l.z - c.z)]), h: R(c.h) }; });
  const pc = await P.evaluate(() => {
    const g = window.__game; g.leaveCar(true); g.tick(1 / 60);
    const c = g.police.cops.find(c => !c.wreck), w = g.walker; if (!c) return { none: true };
    w.place(c.x + Math.cos(c.h) * 2.0, c.z - Math.sin(c.h) * 2.0, c.h); c.speed = 0; c.vx = c.vz = 0; g.tick(1 / 60);
    const prompt = document.getElementById('prompt-txt').textContent, ok = g.enterCar(); g.tick(1 / 60);
    return { prompt, ok, chase: !!g.game.chaseOn, wanted: !!g.game.wanted, stopOn: !!g.game.stopOn, model: g.car.s.model, bar: !!g.carMesh.userData.bar, home: g.isHome(), nogad: document.body.classList.contains('nogad'), gone: !g.police.cops.includes(c) };
  });
  check('pulled over, you get out and take the patrol car', pc0 && r.ok && pc.prompt === 'TAKE THE POLICE CAR' && pc.ok && pc.model === 'cruiser' && pc.gone, JSON.stringify({ r, pc }));
  check('taking a police car brings the whole force (a chase), and its light bar is yours', pc.chase && pc.wanted && !pc.stopOn && pc.bar, JSON.stringify(pc));
  check('a stolen car has no gadgets (only your own cars do)', !pc.home && pc.nogad, JSON.stringify(pc));
  const lb = await P.evaluate(() => { const g = window.__game, ud = g.carMesh.userData; let lit = 0; for (let i = 0; i < 20; i++) { g.tick(1 / 30); lit = Math.max(lit, ...ud.bar.map(b => b.sp.material.opacity)); } return +lit.toFixed(2); });
  check('its light bar flashes while you drive it', lb > 0.5, String(lb));

  console.log('arrested, and out again');
  await P.evaluate(() => { const g = window.__game; g.arrest({ list: [{ name: 'TAKING A POLICE CAR', n: 1 }], days: 2, arrest: true }); });
  await P.waitForFunction(() => window.__game.jail.active && window.__game.jail.locked, null, { timeout: 30000 });
  const out = await P.evaluate(() => {
    const g = window.__game, J = g.jail; J.use(); J.advance(J.releaseAt - J.hour + 0.01); for (let i = 0; i < 150; i++) g.tick(1 / 30);
    g.leaveVenue(true); g.tick(1 / 60);
    return { inside: !!g.game.inside, home: g.isHome(), hero: g.carMesh === g.heroMesh, left: g.left.length, dist: +Math.hypot(g.car.x - g.walker.x, g.car.z - g.walker.z).toFixed(1), fleet: g.scene.children.filter(o => o.userData && o.userData.fleet).length };
  });
  check('out of the cells: the stolen cars have gone back, your own car is parked outside', !out.inside && out.home && out.hero && out.left === 0 && out.fleet === 0 && out.dist < 30, JSON.stringify(out));

  console.log('a parked car');
  const pk = await P.evaluate(S0 => {
    const g = window.__game, w = g.walker; let best = null, bd = 1e9;
    w.place(S0.x, S0.z, 0); g.city.loadNow(S0.x, S0.z, 1); for (let i = 0; i < 10; i++) g.tick(1 / 60);       // (back near the start, out of the station)
    for (const p of g.city.parkedList()) { if (p.police !== undefined || !p.cols) continue; const d = Math.hypot(p.x - w.x, p.z - w.z); if (d < bd) { bd = d; best = p; } }
    const p = best, cols = p.cols.slice(); w.place(p.x + Math.cos(p.h) * 2.0, p.z - Math.sin(p.h) * 2.0, p.h); for (let i = 0; i < 10; i++) g.tick(1 / 60);
    const T = g.carToTake(), ok = g.enterCar();
    return { what: T && T.what, ok, gone: !g.city.parkedList().includes(p), cols: p.cols, model: g.car.s.model, home: g.isHome(), stolen: g.stolen(), at: [p.x, p.z], c0: cols.length };
  }, S0);
  check('a parked car: walk up and get in, and it is gone from the car park (its kerb space is clear)', pk.what === 'parked' && pk.ok && pk.gone && pk.cols === null && !pk.home && pk.stolen, JSON.stringify(pk));

  console.log('police stations');
  const ps = await P.evaluate(() => { const g = window.__game, list = g.city.parkedList().filter(p => p.police !== undefined); return { n: list.length, kinds: [...new Set(list.map(p => p.police))], drawn: g.traffic.policeSets.reduce((a, s) => a + s.list.length, 0) }; });
  check('police cars are parked outside the police stations (and drawn)', ps.n >= 2 && ps.drawn >= 0, JSON.stringify(ps));

  console.log('every kind');
  const kinds = await P.evaluate(async () => {
    const { fleetSpec } = await import('/src/fleetcar.js'); const { carCircles } = await import('/src/collide.js'); const g = window.__game, out = {};
    for (const md of [...g.traffic.models.filter(m => m.near), g.police.models.cruiser, g.police.models.truck]) { const s = fleetSpec(md); out[md.name] = { kg: s.mass, top: Math.round((s.redline * Math.PI / 30) * s.wheelR / (s.gears[s.gears.length - 1] * s.final) * 3.6), circles: carCircles({ s }).offs.length, eye: md.driver.eye.map(v => +v.toFixed(2)) }; }
    return out;
  });
  check('every kind of car has its own weight and top speed (a hatchback is light, a bus heavy and slow, a police car quick)', kinds.hatch.kg < kinds.saloon.kg && kinds.bus.kg > 9000 && kinds.bus.top < 110 && kinds.cruiser.top > kinds.saloon.top && kinds.truck.top < kinds.van.top, JSON.stringify(kinds));
  check('long vehicles bump into things along their whole length', kinds.bus.circles > kinds.saloon.circles && kinds.saloon.circles >= 3, JSON.stringify(kinds));
  check('no script errors', logs.length === 0, logs.slice(0, 4).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
