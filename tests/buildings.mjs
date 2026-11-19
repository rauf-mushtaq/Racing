// Walking into any building (main.js buildingNear, venues.js insideKindFor, rooms-visit.js, visit.js): standing at a wall and facing it offers ENTER;
// the use button takes you in; what is inside is big and is right for the building (offices, flats, a house, a store, a hotel, a cinema, the cathedral,
// a warehouse), with people in it; the stairs take you up to the galleries, whose railings keep you on them, and under a gallery you stay on the floor;
// the same building always has the same inside; LEAVE at the door takes you back out.
import { check, open, step, finish } from './lib.mjs';

try {
  const { page: P, logs } = await open({ init: () => { try { localStorage.setItem('sunsetcity.v1', JSON.stringify({ quality: 'low', renderScale: 0.75 })); } catch (e) { /* private mode */ } } });
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 });
  await step(P, 60);
  await P.evaluate(() => { window.__freeze = true; const g = window.__game; g.car.vx = 0; g.car.vz = 0; if (!g.game.onFoot) g.leaveCar(); });
  await step(P, 60);

  console.log('at a wall');
  const wall = await P.evaluate(() => {
    const g = window.__game, w = g.walker, x0 = w.x, z0 = w.z;
    for (let r = 2; r < 60; r += 1.5) for (let a = 0; a < 6.28; a += 0.2) {
      const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
      for (let h = 0; h < 6.28; h += 0.4) { const b = g.buildingNear(x, z, h); if (b && b.visit) { w.place(x, z, h); g.tick(1 / 60); return { kind: b.kind, x, z, h, prompt: document.getElementById('prompt-txt').textContent, shown: !document.getElementById('prompt').classList.contains('hidden') }; } }
    }
    return null;
  });
  check('standing at a building\'s wall, facing it, the prompt says ENTER and what it is', !!wall && wall.shown && /^ENTER THE /.test(wall.prompt), JSON.stringify(wall));
  const away = await P.evaluate(w => { const g = window.__game; g.walker.place(w.x, w.z, w.h + Math.PI); g.tick(1 / 60); return g.buildingNear(); }, wall);
  check('with your back to it, it does not', !away, JSON.stringify(away));

  console.log('in');
  await P.evaluate(w => { const g = window.__game; g.walker.place(w.x, w.z, w.h); g.tick(1 / 60); }, wall);
  await P.keyboard.press('KeyF'); await step(P, 3); await P.waitForTimeout(500); await step(P, 45);
  const inn = await P.evaluate(() => { const g = window.__game, R = g.interior.room; return { inside: !!g.game.inside, kind: g.game.inside && g.game.inside.kind, visit: g.visit.active, heist: g.heist.active, area: R ? R.W * R.D : 0, H: R && R.H, people: g.visit.people.length }; });
  check('the use button takes you in: a building to look round, not a robbery', inn.inside && inn.visit && !inn.heist && inn.kind === wall.kind, JSON.stringify(inn));
  check('and it is big inside (over 600 square metres), with people in it', inn.area >= 600 && inn.people >= 3, JSON.stringify(inn));
  const out = await P.evaluate(() => { const g = window.__game, R = g.interior.room, w = g.walker; w.place(R.exit.x, R.exit.z + 0.4, Math.PI); g.tick(1 / 60); return g.visit.prompt; });
  await P.keyboard.press('KeyF'); await step(P, 3); await P.waitForTimeout(500); await step(P, 10);
  const back = await P.evaluate(w => { const g = window.__game, W = g.walker; return { outside: !g.game.inside && !g.interior.active, d: Math.hypot(W.x - w.x, W.z - w.z), facing: Math.cos(W.h - (w.h + Math.PI)) }; }, wall);
  check('LEAVE at the door takes you back out where you went in, facing away from the wall', out === 'LEAVE' && back.outside && back.d < 0.6 && back.facing > 0.7, JSON.stringify({ out, back }));

  console.log('every kind of building');
  const kinds = await P.evaluate(() => {
    const g = window.__game, w = g.walker, out = {};
    for (const k of ['office', 'flats', 'home', 'store', 'hotel', 'cinema', 'church', 'warehouse']) {
      const v = { kind: k, x: w.x, z: w.z, dx: 0, dz: 1, seed: 4242, visit: true, id: 'test' + k };
      let err = null; try { g.enterVenue(v, true); } catch (e) { err = String(e.message || e).slice(0, 200); }
      const R = g.interior.room; out[k] = { err, ok: !!g.game.inside && g.visit.active, area: R ? R.W * R.D : 0, H: R ? R.H : 0, people: g.visit.people.length, stairs: !!(R && R.decks && R.decks.length) };
      for (let i = 0; i < 30; i++) g.tick(1 / 60);
      g.leaveVenue(true);
    }
    return out;
  });
  check('offices, flats, a house, a store, a hotel, a cinema, the cathedral and a warehouse are all built, with people in them', Object.values(kinds).every(k => k.ok && !k.err && k.people >= 3), JSON.stringify(kinds));
  check('and they are big: the office lobby, the store, the hotel and the cathedral over 1,500 square metres, the office 18 m high', ['office', 'store', 'hotel', 'church'].every(k => kinds[k].area >= 1500) && kinds.office.H >= 18, JSON.stringify(kinds));

  console.log('stairs and galleries');
  const climb = await P.evaluate(() => {
    const g = window.__game, w = g.walker, v = { kind: 'office', x: w.x, z: w.z, dx: 0, dz: 1, seed: 77, visit: true, id: 'stairs' }; g.enterVenue(v, true);
    const R = g.interior.room, walkTo = (yaw, n) => { g.footCam.yaw = yaw; g.input.touch.sprint = false; const k = g.input.keys; k.add('KeyW'); for (let i = 0; i < n; i++) g.tick(1 / 60); k.delete('KeyW'); for (let i = 0; i < 20; i++) g.tick(1 / 60); };
    const out = {};
    w.place(R.ox - 20.6, R.oz + 9.5, 0); w.y = R.oy; g.tick(1 / 60); walkTo(0, 60 * 9);
    out.top = { y: +(w.y - R.oy).toFixed(2), z: +(w.z - R.oz).toFixed(1) };
    walkTo(-Math.PI / 2, 60 * 3); out.gallery = { y: +(w.y - R.oy).toFixed(2), x: +(w.x - R.ox).toFixed(1) };
    w.place(R.ox - 25, R.oz + 31, Math.PI / 2); w.y = R.oy + 6; g.tick(1 / 60); walkTo(Math.PI / 2, 60 * 4); out.rail = { y: +(w.y - R.oy).toFixed(2), x: +(w.x - R.ox).toFixed(2) };
    w.place(R.ox - 25, R.oz + 20, 0); w.y = R.oy; g.tick(1 / 60); walkTo(0, 60 * 2); out.under = { y: +(w.y - R.oy).toFixed(2), z: +(w.z - R.oz).toFixed(1) };
    g.leaveVenue(true); return out;
  });
  check('in the office the grand stair takes you up to the gallery, six metres up', climb.top.y > 5.8 && climb.top.y < 6.2 && climb.gallery.y > 5.8 && climb.gallery.x < -22, JSON.stringify(climb));
  check('the gallery\'s railing keeps you on it, and under it you stay on the floor', climb.rail.y > 5.8 && climb.rail.x < -21.9 && climb.under.y < 0.1 && climb.under.z > 21, JSON.stringify(climb));

  console.log('the same building');
  const same = await P.evaluate(w => {
    const g = window.__game, W = g.walker; W.place(w.x, w.z, w.h); g.tick(1 / 60); const a = g.buildingNear(); W.place(w.x, w.z, w.h); g.tick(1 / 60); const b = g.buildingNear();
    g.enterVenue(a, true); const n1 = g.interior.room.boxes.length, p1 = g.visit.people.length; g.leaveVenue(true); g.enterVenue(b, true); const n2 = g.interior.room.boxes.length, p2 = g.visit.people.length; g.leaveVenue(true);
    return { seeds: [a.seed, b.seed], n1, n2, p1, p2 };
  }, wall);
  check('the same building has the same inside every time', same.seeds[0] === same.seeds[1] && same.n1 === same.n2 && same.p1 === same.p2, JSON.stringify(same));
  const robbed = await P.evaluate(async () => { const V = await import('./src/venues.js'); return [V.insideKindFor({ bld: { use: 'bank' } }), V.insideKindFor({ bld: { use: 'glass' } }), V.insideKindFor({ bld: { use: 'apt' } }), V.insideKindFor({ bld: { use: 'house' } }), V.insideKindFor({}), V.insideKindFor({ bld: { use: 'church' } })]; });
  check('a bank\'s walls lead into the bank; towers into offices, blocks into flats, houses into a house, anything else into a warehouse', JSON.stringify(robbed) === JSON.stringify(['bank', 'office', 'flats', 'home', 'warehouse', 'church']), JSON.stringify(robbed));
  check('no script errors', logs.length === 0, logs.slice(0, 3).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
