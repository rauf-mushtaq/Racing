// Cars at two levels of detail: near ones (closer than 55 m) have real glass, a cabin, mirrors, and wheels that turn and steer; far ones are the cheap model.
// Police cars add a push bar, a light bar housing and lettering. Both the police and the traffic use the same sets (src/fleet.js).
import { check, open, step, finish } from './lib.mjs';

try {
  const { page: P, logs } = await open();
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 });
  await step(P, 120);
  // Stand next to a car that is driving.
  const pre = await P.evaluate(async () => {
    const g = window.__game; let best = null, bd = 1e9; for (const c of g.traffic.cars) { if (!c.active || !c.pts || c.mode !== 'drive') continue; const d = Math.hypot(c.x - g.car.x, c.z - g.car.z); if (d < bd) { bd = d; best = c; } }
    if (best) { g.walker.place(best.x + 5, best.z + 5, 0); for (let i = 0; i < 20; i++) g.tick(1 / 60); }
    return { found: !!best, d: Math.round(bd) };
  });
  check('there is a car driving to stand beside', pre.found, JSON.stringify(pre));
  const t = await P.evaluate(() => {
    const g = window.__game, tr = g.traffic, sets = tr.meshes.map(m => m.set), near = sets.reduce((a, s) => a + (s.near ? s.nn : 0), 0), far = sets.reduce((a, s) => a + s.nf, 0);
    const m0 = sets[0].model;
    return { near, far, kinds: sets.length, hasNear: sets.filter(s => s.near).length, wheelAt: m0.wheelAt.length, glassTris: m0.near.glass.attributes.position.count / 3, detailTris: m0.near.details.attributes.position.count / 3, wheelTris: m0.near.wheel.attributes.position.count / 3, farTris: m0.geo.attributes.position.count / 3 };
  });
  check('traffic cars have a near and a far model (the sports car, a real scan, has the one)', t.hasNear >= 6 && t.kinds >= 6, JSON.stringify(t));
  check('every car has four wheels, real glass, and a cabin and trim behind it', t.wheelAt === 4 && t.glassTris > 40 && t.detailTris > 100 && t.wheelTris > 150, JSON.stringify(t));
  check('cars within 55 m are drawn near and the rest far (some of each in a busy street)', t.near > 0 && t.far > 0, JSON.stringify(t));
  // The wheels turn when a car drives and steer when it turns.
  const w = await P.evaluate(async () => {
    const g = window.__game, c = g.traffic.cars.find(c => c.active && c.pts && c.mode === 'drive' && Math.hypot(c.x - g.walker.x, c.z - g.walker.z) < 50);
    if (!c) return null; const a = c._sp; let moved = 0; for (let i = 0; i < 60; i++) { g.tick(1 / 60); if (c._sp !== undefined && Math.abs(c._sp - (a ?? 0)) > 0.01) moved++; }
    return { sp: c._sp, moved, speed: c.speed };
  });
  check('a moving car near you has turning wheels', w && w.moved > 10, JSON.stringify(w));
  // Police.
  await P.evaluate(() => { window.__game.startWanted('gun'); });
  await step(P, 60 * 14);
  const c = await P.evaluate(() => {
    const g = window.__game, k = g.police.kinds[0], cops = g.police.cops.filter(c => !c.wreck), nearCops = cops.filter(c => Math.hypot(c.x - g.car.x, c.z - g.car.z) < 55);
    const m = k.md.near; return { cops: cops.length, nearCops: nearCops.length, nn: k.set.nn + g.police.kinds[1].set.nn, decal: !!m.decal, decalTris: m.decal ? m.decal.attributes.position.count / 3 : 0, bodyShown: k.set.near.body.visible || g.police.kinds[1].set.near.body.visible, spin: nearCops.map(c => c._sp).filter(v => v !== undefined).length };
  });
  check('police cars have the same two levels, and lettering on the doors and bonnet', c.decal && c.decalTris >= 3, JSON.stringify(c));
  check('police cars near you are drawn in full (cabin, glass, wheels that turn)', c.nearCops === 0 || (c.nn > 0 && c.bodyShown && c.spin > 0), JSON.stringify(c));
  check('no script errors', logs.length === 0, logs.slice(0, 4).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
