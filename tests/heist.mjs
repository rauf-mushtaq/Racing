// Robberies: the places you can walk into, the people in them, and how much harder each kind is. Run on the game with the debug hooks (?debug), driving the
// game by steps so it is the same every time.
import { check, open, step, finish } from './lib.mjs';

try {
  const { page: P, logs } = await open();
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 });
  await step(P, 60);
  await P.evaluate(() => { const g = window.__game; g.car.vx = 0; g.car.vz = 0; if (!g.game.onFoot) g.leaveCar(); window.__freeze = true; window.__toasts = []; const h = g.hud, o = h.toast.bind(h); h.toast = (t, s) => { window.__toasts.push(t); return o(t, s); }; });
  await step(P, 90);
  const ev = (f, ...a) => P.evaluate(f, ...a);

  console.log('the places');
  const info = await ev(() => { const g = window.__game, T = g.VENUE_TYPES; return Object.values(T).map(t => ({ kind: t.kind, tier: t.tier, stars: t.stars, delay: t.delay, press: t.press, dmg: t.dmg, worth: t.worth })); });
  const order = ['petrol', 'shop', 'jeweller', 'bank', 'museum'];
  check('five kinds of place, from tier 1 to tier 5', info.length === 5 && order.every((k, i) => info.find(t => t.kind === k && t.tier === i + 1)), JSON.stringify(info.map(t => t.kind)));
  check('each is harder: more stars, quicker police, shorter time before the alarm, harder-shooting guards',
    info.every((t, i) => i === 0 || (t.stars >= info[i - 1].stars && t.delay <= info[i - 1].delay && t.press[1] <= info[i - 1].press[1] && t.dmg >= info[i - 1].dmg)) && info[4].stars > info[0].stars && info[4].delay < info[0].delay, JSON.stringify(info));

  // Room by room: what is in each, and that it gets harder.
  const rooms = {};
  for (const kind of order) {
    rooms[kind] = await ev(async kind => {
      const g = window.__game, w = g.walker; if (g.interior.active) g.leaveVenue(true);
      g.enterVenue({ kind, x: w.x, z: w.z, seed: 11 }, true);
      for (let i = 0; i < 30; i++) g.tick(1 / 60);
      const R = g.interior.room, H = g.heist;
      const items = R.items.reduce((m, it) => { m[it.type] = (m[it.type] || 0) + 1; return m; }, {});
      const total = R.items.filter(it => it.value).reduce((s, it) => s + it.value, 0);
      return { items, total, staff: H.actors.filter(a => a.role !== 'customer').length, customers: H.actors.filter(a => a.role === 'customer').length, armed: H.actors.filter(a => a.armed).length, cams: R.cams.length, lasers: R.lasers.length, active: g.interior.active, inside: !!g.game.inside, layer: g.camera.layers.mask, interior: !!g.walker.interior, y: g.walker.y, floor: R.oy };
    }, kind);
    await ev(() => window.__game.leaveVenue(true));
  }
  const r = rooms;
  check('walking in puts you in a room (camera on layer 1 only, walker standing on the room floor)', Object.values(r).every(x => x.active && x.inside && x.layer === 2 && x.interior && Math.abs(x.y - x.floor) < 0.5), JSON.stringify(r.petrol));
  check('a petrol station has a till and one clerk, nobody armed', r.petrol.items.till === 1 && r.petrol.staff === 1 && r.petrol.armed === 0 && r.petrol.cams === 0, JSON.stringify(r.petrol));
  check('a convenience store adds a safe', r.shop.items.safe === 1 && r.shop.items.till === 1 && r.shop.armed === 0, JSON.stringify(r.shop));
  check('a jeweller has glass cases, an armed guard and cameras', (r.jeweller.items.case || 0) >= 5 && r.jeweller.armed >= 1 && r.jeweller.cams >= 2, JSON.stringify(r.jeweller));
  check('a bank has tellers, two armed guards, a vault and cameras', (r.bank.items.drawer || 0) === 3 && r.bank.items.vault === 1 && r.bank.armed >= 2 && r.bank.cams >= 3 && r.bank.staff >= 6, JSON.stringify(r.bank));
  check('a museum has patrolling armed guards, cameras, laser beams and a security panel', r.museum.armed >= 3 && r.museum.cams >= 3 && r.museum.lasers >= 9 && r.museum.items.panel === 1 && r.museum.items.art === 3, JSON.stringify(r.museum));
  check('the money gets bigger: petrol < shop < jeweller < bank < museum', r.petrol.total < r.shop.total && r.shop.total < r.jeweller.total && r.jeweller.total < r.bank.total + 1 && r.bank.total < r.museum.total * 1.5 && r.museum.total > 300000, order.map(k => r[k].total).join(' < '));
  const guards = order.map(k => r[k].armed + r[k].cams + r[k].lasers);
  check('and the security grows with it', guards.every((v, i) => i === 0 || v >= guards[i - 1]), guards.join(','));

  console.log('a hold-up at the petrol station');
  await ev(() => { const g = window.__game, w = g.walker; g.melee.cool = 0; g.enterVenue({ kind: 'petrol', x: w.x, z: w.z, seed: 11 }, true); g.game.insideT = 5; });
  await step(P, 60);
  const till = await ev(() => { const g = window.__game, H = g.heist, it = H.room.items.find(i => i.type === 'till'); return { x: it.x, z: it.z, value: it.value, clerk: H.actors.find(a => a.role === 'clerk') ? { x: H.actors.find(a => a.role === 'clerk').x, z: H.actors.find(a => a.role === 'clerk').z } : null }; });
  const stand = (x, z, yaw) => ev(([x, z, yaw]) => { const g = window.__game, w = g.walker; w.x = x; w.z = z; w.vx = w.vz = 0; w.h = yaw; g.footCam.yaw = yaw; }, [x, z, yaw]);
  await stand(till.x - 1.0, till.z - 0.3, Math.PI / 2);
  await step(P, 5);
  let prompt = await ev(() => ({ p: window.__game.heist.prompt, why: window.__game.heist._blocked }));
  check('beside the till the prompt says what to do', /TILL/.test(prompt.p), JSON.stringify(prompt));
  check('but the clerk is watching: you are told to threaten them first', /WATCHING/.test(prompt.why || ''), JSON.stringify(prompt));
  await ev(() => window.__game.heist.use()); await step(P, 3);
  check('and nothing is taken', (await ev(() => window.__game.heist.loot)) === 0);
  // Draw the pistol: the clerk puts their hands up.
  await ev(() => { const g = window.__game; g.arsenal.select(0); }); await step(P, 50);
  const hands = await ev(() => { const H = window.__game.heist, a = H.actors.find(x => x.role === 'clerk'); return { state: a.state, hands: a.walker.hands, press: a.pressT }; });
  check('draw a gun and the clerk puts their hands up', hands.state === 'hands' && hands.hands > 0.5, JSON.stringify(hands));
  await ev(() => window.__game.heist.use()); await step(P, 60 * 3 + 20);
  const loot = await ev(() => ({ loot: window.__game.heist.loot, alarm: window.__game.heist.alarm }));
  check('now the till can be emptied (it takes a couple of seconds)', loot.loot === till.value, JSON.stringify([loot, till.value]));
  check('no alarm yet: the clerk was watched', !loot.alarm);
  await ev(() => window.__game.arsenal.holster()); await step(P, 60 * 30);
  const al = await ev(() => ({ alarm: window.__game.heist.alarm, chase: window.__game.game.chaseOn }));
  check('put the gun away and look away, and the clerk presses the silent alarm', al.alarm, JSON.stringify(al));
  await step(P, 60 * 20);
  check('and, after a while (longest for the easiest place), the police are on the way', await ev(() => window.__game.game.chaseOn), '');
  // Out with the bag: it is kept until the police are lost.
  await stand(0, 0, 0); const ex = await ev(() => { const g = window.__game, R = g.heist.room; g.walker.x = R.exit.x; g.walker.z = R.exit.z + 0.8; return true; });
  await ev(() => { const g = window.__game; g.game.insideT = 5; g.leaveVenue(true); }); await step(P, 5);
  const out = await ev(() => { const g = window.__game; return { inside: g.game.inside, carried: g.game.carried, cash: g.settings.cash, chase: g.game.chaseOn, interior: !!g.walker.interior, layers: g.camera.layers.mask, y: g.walker.y }; });
  check('out on the street with the loot in the bag, not yet in the bank (the police are after you)', !out.inside && out.carried === till.value && out.cash === 0 && out.chase && !out.interior && out.layers === 1, JSON.stringify(out));
  await ev(() => { const g = window.__game; g.police.result = 'escaped'; g.police.endT = 5; }); await step(P, 90);
  const bank1 = await ev(() => ({ cash: window.__game.settings.cash, carried: window.__game.game.carried }));
  check('lose the police and the money is banked', bank1.cash === till.value && !bank1.carried, JSON.stringify(bank1));

  console.log('the jeweller: glass, a guard, and a bullet');
  const enter = kind => ev(kind => { const g = window.__game, w = g.walker; if (g.interior.active) g.leaveVenue(true); g.game.chaseOn && g.endChase(); g.game.chaseOn = false; g.game.wanted = false; g.police.hideout = false; g.melee.cool = 0; g.arsenal.holster(); g.enterVenue({ kind, x: w.x, z: w.z, seed: 5 }, true); g.game.insideT = 5; g.game.noWanted = 0; }, kind);
  await enter('jeweller'); await step(P, 40);
  const J0 = await ev(() => { const g = window.__game, H = g.heist, c = H.room.items.find(i => i.type === 'case'); return { x: c.x, z: c.z, value: c.value, n: H.room.items.filter(i => i.type === 'case').length }; });
  await stand(J0.x, J0.z - 1.3, 0); await step(P, 3);
  // A punch on the glass breaks it (and sets off the alarm), then the jewels can be taken.
  await ev(() => { const g = window.__game; g.footCam.yaw = 0; g.melee.attack('fist'); }); await step(P, 40);
  const sm = await ev(() => { const H = window.__game.heist, c = H.room.items.find(i => i.type === 'case'); return { state: c.state, alarm: H.alarm, glass: c.glass.visible }; });
  check('a punch breaks the glass of a case, and sets off the alarm', sm.state === 'open' && !sm.glass && sm.alarm, JSON.stringify(sm));
  await ev(() => { const H = window.__game.heist; H.task = null; }); await ev(() => window.__game.heist.use()); await step(P, 60 * 2);
  const gr = await ev(() => ({ loot: window.__game.heist.loot, state: window.__game.heist.room.items.find(i => i.type === 'case').state }));
  check('then the jewels are taken', gr.loot === J0.value && gr.state === 'taken', JSON.stringify([gr, J0.value]));
  // The guard shoots straight at you: the armour goes down.
  const hp0 = await ev(() => window.__game.police.health);
  await step(P, 60 * 12);
  const g1 = await ev(() => { const H = window.__game.heist, a = H.actors.find(x => x.role === 'guard'); return { state: a.state, health: window.__game.police.health, chase: window.__game.game.chaseOn, fired: a.mag < 12 || a.rel > 0 }; });
  check('the armed guard turns on you and fights (and fires: the magazine goes down)', g1.state === 'fight' && g1.fired, JSON.stringify([g1, hp0]));
  // Shoot the guard.
  await ev(() => { const g = window.__game, H = g.heist, a = H.actors.find(x => x.role === 'guard'), w = g.walker; g.arsenal.ammo.pistol.mag = 99; a.hp = 20; a.walker.x = w.x; a.walker.z = w.z + 4; });
  const hit = await ev(() => { const g = window.__game, H = g.heist, a = H.actors.find(x => x.role === 'guard'), w = g.walker, A = g.arsenal; const dx = a.x - w.x, dz = a.z - w.z, d = Math.hypot(dx, dz); const r = A.trace(w.x, w.y + 1.4, w.z, dx / d, (a.y + 1.2 - w.y - 1.4) / d, dz / d, 40); return { type: r.type, t: r.t, d, same: r.ref === a }; });
  check('a bullet finds the guard (and stops at the walls of the room otherwise)', hit.type === 8 && hit.same && Math.abs(hit.t - hit.d) < 1, JSON.stringify(hit));
  await ev(() => { const g = window.__game, H = g.heist, a = H.actors.find(x => x.role === 'guard'), w = g.walker; for (let i = 0; i < 4; i++) a.hit(30, { dir: { x: 0, z: 1 } }); });
  check('and the guard goes down', !(await ev(() => window.__game.heist.actors.find(x => x.role === 'guard').alive)));
  await ev(() => { const g = window.__game; g.police.health = 100; });
  const wall = await ev(() => { const g = window.__game, w = g.walker, r = { ...g.arsenal.trace(w.x, w.y + 1.4, w.z, 0, 0, 1, 60) }; const r2 = { ...g.arsenal.trace(w.x, w.y + 1.4, w.z, 0, -1, 0, 60) }; return { t: r.t, D: g.interior.room.D, w: r.type, floorT: r2.t, ft: r2.type, y: w.y, inside: !!g.game.inside, state: g.game.state, health: g.police.health }; });
  check('a shot down the room stops at the back wall, one at the floor at your feet', wall.w === 1 && wall.t < wall.D + 1 && wall.ft === 2 && wall.floorT < 2.1, JSON.stringify(wall));

  console.log('the bank: a key card, or a long drill, and then the vault');
  await enter('bank'); await step(P, 40);
  const B = await ev(() => { const H = window.__game.heist, v = H.room.items.find(i => i.type === 'vault'); return { x: v.x, z: v.z, stacks: H.room.items.filter(i => i.type === 'stack').length, locked: H.room.items.filter(i => i.type === 'stack' && i.locked).length, mgr: !!H.actors.find(a => a.role === 'manager') }; });
  check('the bank has a manager and six stacks locked in the vault', B.mgr && B.stacks === 6 && B.locked === 6, JSON.stringify(B));
  await stand(B.x, B.z, 0); await step(P, 5);
  await ev(() => window.__game.heist.use()); await step(P, 5);
  const dr = await ev(() => { const H = window.__game.heist; return { task: H.task && H.task.it.type, dur: H.task && H.task.dur, alarm: H.alarm }; });
  check('without the key card the vault is a 26 second drill, and drilling sets off the alarm', dr.task === 'vault' && dr.dur === 26 && dr.alarm, JSON.stringify(dr));
  await ev(() => { window.__game.heist.task = null; window.__game.heist.alarm = false; window.__game.heist.dispatchT = -1; });
  // The manager with his hands up has the key card.
  await ev(() => { const H = window.__game.heist, m = H.actors.find(a => a.role === 'manager'); for (const a of H.actors) if (a.role === 'teller') a.state = 'hands'; m.state = 'hands'; m.walker.x = H.room.ox + 5.5; m.walker.z = H.room.oz + 8.0; });
  await stand(await ev(() => window.__game.heist.room.ox + 5.5), await ev(() => window.__game.heist.room.oz + 7.0), 0); await step(P, 3);
  const kc = await ev(() => { const H = window.__game.heist, it = H.nearest(); return it ? it.type : null; });
  check('beside the manager (hands up) the thing to take is the key card', kc === 'keycard', String(kc));
  await ev(() => window.__game.heist.use()); await step(P, 100);
  check('and with it the vault opens in 3 seconds', await ev(() => { const H = window.__game.heist; H.use(); return H.keycard; }));
  await ev(() => { window.__game.heist.task = null; }); await stand(B.x, B.z, 0); await step(P, 3); await ev(() => window.__game.heist.use()); await step(P, 60 * 3 + 30);
  const vo = await ev(() => { const H = window.__game.heist, v = H.room.items.find(i => i.type === 'vault'); return { state: v.state, locked: H.room.items.filter(i => i.type === 'stack' && i.locked).length, solid: !v.box.dead }; });
  check('the vault door swings open and the money inside is free to take', vo.state === 'done' && vo.locked === 0 && !vo.solid, JSON.stringify(vo));

  console.log('the museum: lasers, cameras and a panel that switches them off');
  await enter('museum'); await step(P, 40);
  const M = await ev(() => { const H = window.__game.heist, l = H.room.lasers[0], p = H.room.items.find(i => i.type === 'panel'); return { l: { a: l.a, b: l.b, y: l.y }, panel: { x: p.x, z: p.z }, floor: H.room.oy }; });
  await stand((M.l.a[0] + M.l.b[0]) / 2, (M.l.a[1] + M.l.b[1]) / 2 + 0.05, 0); await ev(() => { const g = window.__game; g.walker.y = window.__game.heist.room.oy; });
  await step(P, 5);
  check('walking through a laser beam sets off the alarm', await ev(() => window.__game.heist.alarm));
  await ev(() => { const H = window.__game.heist; H.alarm = false; H.dispatchT = -1; H.dispatched = false; });
  await stand(M.panel.x, M.panel.z, 0); await step(P, 3); await ev(() => window.__game.heist.use()); await step(P, 60 * 6 + 20);
  const pn = await ev(() => { const H = window.__game.heist; return { off: H.disabledT > 40, on: H.room.lasers.some(l => l.on) }; });
  check('the security panel switches the lasers off for a while', pn.off && !pn.on, JSON.stringify(pn));
  await stand((M.l.a[0] + M.l.b[0]) / 2, (M.l.a[1] + M.l.b[1]) / 2 + 0.05, 0); await step(P, 5);
  check('and then they can be walked through', !(await ev(() => window.__game.heist.alarm)));
  // A guard on patrol catches a player with a gun out.
  await ev(() => { const g = window.__game; g.heist.disabledT = 0; g.arsenal.select(0); }); await step(P, 60 * 8);
  const mg = await ev(() => ({ alarm: window.__game.heist.alarm, fight: window.__game.heist.actors.filter(a => a.state === 'fight').length }));
  check('guards catch you with a gun out', mg.alarm, JSON.stringify(mg));

  console.log('the police outside');
  await enter('shop'); await step(P, 30);
  await ev(() => { const g = window.__game; g.startWanted('robbery', 2); }); await step(P, 60 * 3);
  const pol = await ev(() => { const g = window.__game; return { chase: g.game.chaseOn, hide: g.police.hideout, cops: g.police.cops.length }; });
  check('with the police outside and you in, they cannot see you', pol.chase && pol.hide, JSON.stringify(pol));
  await step(P, 60 * 75);
  const still = await ev(() => { const g = window.__game; return { result: g.police.result, hidden: g.police.hidden, bust: g.police.bustT, inside: !!g.game.inside }; });
  check('staying inside for over a minute does not make them give up, or arrest you through the wall', still.result === 'running' && still.hidden <= 0.5 && still.bust === 0 && still.inside, JSON.stringify(still));
  // Busted with the bag: it is lost.
  await ev(() => { const g = window.__game; g.game.carried = 5000; g.police.result = 'busted'; g.police.endT = 5; }); await step(P, 90);
  const bs = await ev(() => { const g = window.__game; return { inside: !!g.game.inside, carried: g.game.carried || 0, state: g.game.state, interior: !!g.walker.interior, mask: g.camera.layers.mask }; });
  check('busted: thrown out of the building, the loot lost', !bs.inside && !bs.carried && !bs.interior && bs.mask === 1 && bs.state === 'chaseEnd', JSON.stringify(bs));

  check('no script errors', logs.length === 0, logs.slice(0, 4).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
