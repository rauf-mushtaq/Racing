// Rooftops (src/roofs.js): towers with a helipad, a helicopter waiting on it to steal or buy, a ladder up the outside, the lifts in the lobby up to the
// roof, and the ways down. Run on the game with the debug hooks (?debug), driving it by steps.
import { check, open, step, finish } from './lib.mjs';

try {
  const { page: P, logs } = await open();
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 120000 });
  await step(P, 60);
  const ev = (f, a) => P.evaluate(f, a);
  await ev(() => { const g = window.__game; if (!g.game.onFoot) g.leaveCar(); window.__toasts = []; const h = g.hud, o = h.toast.bind(h); h.toast = (t, s) => { window.__toasts.push(t); return o(t, s); }; });
  await step(P, 20);

  console.log('towers with a helipad');
  const found = await ev(async () => {
    const g = window.__game, { ROOFS } = await import('./src/roofs.js');
    for (const [x, z] of [[0, 150], [-90, 270], [-300, 100], [300, 150], [150, -200]]) g.city.loadNow(x, z, 2);
    const all = [...ROOFS.values()], w = g.walker;
    all.sort((a, b) => Math.hypot(a.pad.x - w.x, a.pad.z - w.z) - Math.hypot(b.pad.x - w.x, b.pad.z - w.z));
    const R = all[0]; window.__R = R;
    return { n: all.length, tall: all.filter(r => r.y > 45).length, R: R && { id: R.id, y: +R.y.toFixed(1), w: +(R.x1 - R.x0).toFixed(1), d: +(R.z1 - R.z0).toFixed(1), ladder: !!R.ladder, hut: !!R.hut, price: R.price } };
  });
  check('a number of the tall towers have a helipad on the roof, with a lift room and a ladder', found.n >= 6 && found.tall === found.n && found.R.ladder && found.R.hut && found.R.w >= 20, JSON.stringify(found));
  check('a helicopter is for sale for a price', found.R.price >= 150000 && found.R.price <= 300000, JSON.stringify(found.R));

  console.log('up the ladder');
  const prompt = () => ev(() => ({ txt: document.getElementById('prompt-txt').textContent, show: !document.getElementById('prompt').classList.contains('hidden'), buy: document.getElementById('t-buy').classList.contains('show'), use: document.getElementById('t-use').textContent }));
  await ev(() => { const g = window.__game, L = window.__R.ladder; g.walker.place(L.x, L.z, L.h); g.footCam.reset(L.h); });
  await step(P, 3);
  const p1 = await prompt();
  check('at the foot of the ladder: CLIMB THE LADDER', p1.show && p1.txt === 'CLIMB THE LADDER', JSON.stringify(p1));
  await ev(() => window.__game.input.emit('use')); await step(P, 60 * 2);
  const mid = await ev(() => { const g = window.__game, w = g.walker; return { climbing: !!g.game.climb, y: +w.y.toFixed(1), x: w.x, z: w.z, roof: !!w.roof }; });
  check('climbing: partway up the wall, on the ladder', mid.climbing && mid.y > 5 && mid.y < found.R.y - 1 && !mid.roof, JSON.stringify(mid));
  await step(P, 60 * 13);
  const top = await ev(() => { const g = window.__game, w = g.walker, R = window.__R; return { climbing: !!g.game.climb, roof: w.roof === R, y: +w.y.toFixed(1), ry: +R.y.toFixed(1), inside: w.x > R.x0 && w.x < R.x1 && w.z > R.z0 && w.z < R.z1 }; });
  check('at the top (in under twelve seconds or so): standing on the roof', !top.climbing && top.roof && Math.abs(top.y - top.ry) < 0.3 && top.inside, JSON.stringify(top));
  const p2 = await prompt();
  check('at the top of the ladder: CLIMB DOWN THE LADDER', p2.txt === 'CLIMB DOWN THE LADDER', JSON.stringify(p2));
  // The parapet keeps you on the roof.
  await ev(() => { const g = window.__game, R = window.__R, w = g.walker; w.x = R.x1 - 1; w.z = (R.z0 + R.z1) / 2; });
  await P.evaluate(() => { const g = window.__game; for (let i = 0; i < 90; i++) { g.walker.vx = 6; g.walker.vz = 0; g.tick(1 / 60); } });
  const edge = await ev(() => { const g = window.__game, R = window.__R, w = g.walker; return { x: w.x, x1: R.x1, y: +w.y.toFixed(1), ry: +R.y.toFixed(1), roof: !!w.roof }; });
  check('walking into the edge, you stay on the roof', edge.roof && edge.x <= edge.x1 && Math.abs(edge.y - edge.ry) < 0.3, JSON.stringify(edge));

  console.log('the helicopter on the roof');
  await P.waitForFunction(() => !!window.__R.ride && !!window.__R.ride.craft, null, { timeout: 30000 }).catch(() => {});
  await step(P, 70);
  const H = await ev(() => { const R = window.__R, r = R.ride, c = r && r.craft; return c ? { x: c.x, z: c.z, y: +c.y.toFixed(1), ry: +R.y.toFixed(1), d: Math.hypot(c.x - R.pad.x, c.z - R.pad.z), n: window.__game.rides.list.filter(q => q.roof).length } : null; });
  check('a helicopter stands on the pad, on the roof (and there are others on other roofs)', H && Math.abs(H.y - H.ry) < 0.6 && H.d < 1 && H.n >= 2, JSON.stringify(H));
  const street = await ev(() => { const R = window.__R, n = window.__game.rides.near({ x: R.pad.x + 4, z: R.pad.z, y: 0.15 }); return n ? n.ride.roof || n.ride.kind : null; });
  check('from the street under it, it cannot be reached', street !== R_ID() , String(street));
  function R_ID() { return found.R.id; }
  await ev(() => { const g = window.__game, R = window.__R, c = R.ride.craft, a = c.h + Math.PI / 2; g.walker.place(c.x + Math.sin(a) * 4, c.z + Math.cos(a) * 4, 0); g.settings.cash = 1000; });
  await step(P, 3);
  const p3 = await prompt();
  check('beside it: STEAL THE HELICOPTER, and its price to buy it (Y, or the BUY button)', /^STEAL THE HELICOPTER/.test(p3.txt) && /BUY \$/.test(p3.txt) && p3.buy && p3.use === 'STEAL IT', JSON.stringify(p3));
  await ev(() => window.__game.input.emit('buy')); await step(P, 2);
  const poor = await ev(() => ({ cash: window.__game.settings.cash, owned: window.__game.rides.owned.has(window.__R.id), t: window.__toasts.slice(-1)[0] }));
  check('without the money it is not sold', poor.cash === 1000 && !poor.owned && /NOT ENOUGH MONEY/.test(poor.t), JSON.stringify(poor));

  // Steal it: the police come. Then land again (it is still on the roof) and get out: you are on the roof.
  await ev(() => window.__game.input.emit('use')); await step(P, 30);
  const st = await ev(() => { const g = window.__game; return { craft: !!g.game.craft, chase: !!g.game.chaseOn || g.police.active, t: window.__toasts.filter(t => /STOLEN/.test(t)).length }; });
  check('fly it off without paying: it is stolen, and the police are after you', st.craft && st.chase && st.t > 0, JSON.stringify(st));
  await step(P, 200);
  await ev(() => window.__game.leaveCraft(true)); await step(P, 3);
  const out = await ev(() => { const g = window.__game, w = g.walker, R = window.__R; return { foot: g.game.onFoot && !g.game.craft, roof: w.roof && w.roof.id, y: +w.y.toFixed(1), ry: +R.y.toFixed(1) }; });
  check('getting out of a helicopter on a roof puts you on the roof', out.foot && out.roof === found.R.id && Math.abs(out.y - out.ry) < 0.3, JSON.stringify(out));
  await ev(() => { const g = window.__game; if (g.game.chaseOn) g.endChase(); g.police.stop && g.police.stop(); g.game.chaseOn = false; });

  // Buy it.
  await ev(() => { const g = window.__game, R = window.__R, c = R.ride.craft, a = c.h + Math.PI / 2; g.walker.place(c.x + Math.sin(a) * 4, c.z + Math.cos(a) * 4, 0); g.settings.cash = 500000; });
  await step(P, 3);
  await ev(() => window.__game.input.emit('buy')); await step(P, 3);
  const bought = await ev(() => { const g = window.__game, R = window.__R; return { cash: g.settings.cash, owned: g.rides.owned.has(R.id), saved: (g.settings.helis || []).includes(R.id), prompt: document.getElementById('prompt-txt').textContent, buy: document.getElementById('t-buy').classList.contains('show') }; });
  check('with the money it is yours: paid for, saved, and the prompt says FLY YOUR HELICOPTER', bought.cash === 500000 - found.R.price && bought.owned && bought.saved && bought.prompt === 'FLY YOUR HELICOPTER' && !bought.buy, JSON.stringify(bought));
  await ev(() => window.__game.input.emit('use')); await step(P, 10);
  const mine = await ev(() => { const g = window.__game; return { craft: !!g.game.craft, chase: !!g.game.chaseOn }; });
  check('flying your own helicopter is not a crime', mine.craft && !mine.chase, JSON.stringify(mine));
  await ev(() => window.__game.leaveCraft(true)); await step(P, 3);

  console.log('the lift');
  await ev(() => { const g = window.__game, d = window.__R.hut.door; g.walker.place(d.x, d.z, 0); });
  await step(P, 3);
  const p4 = await prompt();
  check('at the door of the lift room: TAKE THE LIFT DOWN', p4.txt === 'TAKE THE LIFT DOWN', JSON.stringify(p4));
  await ev(() => window.__game.input.emit('use')); await P.waitForTimeout(400); await step(P, 3);
  const down = await ev(() => { const g = window.__game, w = g.walker; return { roof: !!w.roof, y: +w.y.toFixed(1), ground: +window.__game.walker.gnd(w.x, w.z).y.toFixed(1) }; });
  check('down in the lift: back in the street', !down.roof && down.y < 3, JSON.stringify(down));
  // In through the wall at the foot of the ladder: the lobby's lifts go up to the roof.
  await ev(() => { const g = window.__game, L = window.__R.ladder; g.walker.place(L.x, L.z, L.h); g.footCam.reset(L.h); });
  await step(P, 3);
  const bn = await ev(() => { const g = window.__game, b = g.buildingNear(); if (!b) return null; const ok = g.enterVenue(b, true); return { kind: b.kind, roof: b.roof && b.roof.id, ok }; });
  check('the tower is an office building whose lifts go to the roof', bn && bn.ok && bn.roof === found.R.id && bn.kind === 'office', JSON.stringify(bn));
  await ev(() => { const g = window.__game; g.game.insideT = 5; });
  await ev(() => { const g = window.__game, R = g.interior.room, [x, z] = R.lifts[2]; g.walker.place(R.ox + x, R.oz + z, Math.PI); });
  await step(P, 3);
  const p5 = await ev(() => ({ visit: window.__game.visit.prompt, txt: document.getElementById('prompt-txt').textContent }));
  check('at the lifts in the lobby: LIFT TO THE ROOF', p5.visit === 'LIFT TO THE ROOF' && p5.txt === 'LIFT TO THE ROOF', JSON.stringify(p5));
  await ev(() => window.__game.input.emit('use')); await P.waitForTimeout(400); await step(P, 3);
  const up = await ev(() => { const g = window.__game, w = g.walker, R = window.__R; return { inside: !!g.game.inside, roof: w.roof === R, y: +w.y.toFixed(1), ry: +R.y.toFixed(1), layer: g.camera.layers.mask }; });
  check('up in the lift: out of the lift room onto the roof (the city drawn again)', !up.inside && up.roof && Math.abs(up.y - up.ry) < 0.3 && up.layer !== 2, JSON.stringify(up));

  console.log('down the ladder');
  await ev(() => { const g = window.__game, L = window.__R.ladder; g.walker.place(L.tx, L.tz, L.h); });
  await step(P, 3); await ev(() => window.__game.input.emit('use')); await step(P, 60 * 14);
  const foot = await ev(() => { const g = window.__game, w = g.walker, L = window.__R.ladder; return { climbing: !!g.game.climb, roof: !!w.roof, y: +w.y.toFixed(1), d: +Math.hypot(w.x - L.x, w.z - L.z).toFixed(2) }; });
  check('climbing down puts you on the pavement at the foot of the ladder', !foot.climbing && !foot.roof && foot.y < 3 && foot.d < 0.5, JSON.stringify(foot));

  console.log('any roof');
  const plain = await ev(async () => { const { roofAt, wayDown } = await import('./src/roofs.js'), g = window.__game, { queryColliders } = await import('./src/city.js'); const q = []; queryColliders(g.walker.x, g.walker.z, 120, q); const c = q.find(c => c.bld && c.type === 'box' && c.bld.h > 15 && !(window.__R.bx0 === c.x0)); if (!c) return null; const R = roofAt((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2); return { plain: !!R.plain, y: R.y, way: wayDown(R, (R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2) }; });
  check('any other flat roof (where a helicopter can land) can be stood on, with a stair down', plain && plain.y > 15 && (plain.plain ? plain.way === 'stair' : true), JSON.stringify(plain));

  check('no script errors', logs.length === 0, logs.slice(0, 4).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
