// Pulled over (src/stop.js), and the cells (src/jail.js, the station in src/rooms.js and src/venues.js). Hitting a car sends one patrol car, not the
// whole force; it catches up, signals, parks behind you, and an officer walks to your window; a small thing is a ticket paid from your money, and the
// car leaves. Driving off when signalled brings everyone. Beating someone up with no money to pay the fine is an arrest: hands up, cuffs, booked into
// a cell; the cell is shut (bars you cannot walk through, no guns); time passes, sleeping skips the night, meals come and the lights go out; on the
// morning you are due out the doors open and you walk out to your car. Caught at the end of a full chase is the cells too. There are police stations
// on the streets with a lobby you can walk into.
import { check, open, step, finish } from './lib.mjs';

const until = (P, cond, secs, dt = 1 / 30) => P.evaluate(([cond, secs, dt]) => {
  const g = window.__game, f = new Function('g', 'return (' + cond + ')'), seen = new Set();
  for (let t = 0; t < secs; t += dt) { g.tick(dt); seen.add(g.stop.state); if (f(g)) return { ok: true, t: +t.toFixed(1), seen: [...seen] }; }
  return { ok: false, t: secs, seen: [...seen], why: g.stop.why, ended: g.stop.ended, state: g.stop.state, line: g.stop.line, cops: g.police.cops.map(c => [Math.round(c.x - g.car.x), Math.round(c.z - g.car.z), +c.speed.toFixed(1), !!c.sees]) };
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
  const inCar = await P.evaluate(() => { const g = window.__game, c = g.car; g.walker.place(c.x - Math.cos(c.h) * 1.6, c.z + Math.sin(c.h) * 1.6, c.h); g.tick(1 / 60); g.enterCar(); g.car.vx = 0; g.car.vz = 0; g.tick(1 / 60); return !g.game.onFoot; });
  check('(in the car to start)', inCar);

  console.log('a small crime: one patrol car');
  const s0 = await P.evaluate(() => { const g = window.__game; g.crime(0.5, 'car'); return { stopOn: !!g.game.stopOn, chase: !!g.game.chaseOn, mode: g.police.mode, cops: g.police.cops.length, state: g.stop.state, dist: Math.round(Math.hypot(g.police.cops[0].x - g.car.x, g.police.cops[0].z - g.car.z)), panel: !!document.querySelector('#stopcard:not(.hidden)') }; });
  check('hitting a car sends one patrol car, not the whole force', s0.stopOn && !s0.chase && s0.mode === 'stop' && s0.cops === 1 && s0.state === 'respond', JSON.stringify(s0));
  check('it comes from a way off, and the police panel says so', s0.dist > 100 && s0.panel, JSON.stringify(s0));
  let r = await until(P, "g.stop.state === 'talk' && !!g.stop.verdict", 90);
  check('it catches up, signals, parks behind you, and the officer walks to your window', r.ok && ['respond', 'signal', 'park', 'approach', 'talk'].every(s => r.seen.includes(s)), JSON.stringify(r));
  const at = await P.evaluate(() => {
    const g = window.__game, c = g.police.cops[0], o = g.stop.off, back = (c.x - g.car.x) * Math.sin(g.car.h) + (c.z - g.car.z) * Math.cos(g.car.h);
    return { carGap: +Math.hypot(c.x - g.car.x, c.z - g.car.z).toFixed(1), back: +back.toFixed(1), held: !!c.held, off: +Math.hypot(o.x - g.car.x, o.z - g.car.z).toFixed(2), shown: o.active && !!o.person, v: g.stop.verdict, card: !!document.querySelector('#sc-choice:not(.hidden) [data-act="pay"]'), prompt: g.stop.prompt, siren: g.police.sirenOn };
  });
  check('the patrol car is parked close by (behind you, or across your front; or behind a car that queued behind you: within 24 m; or, held up in the traffic further back, within 70 m, and the officer walks up from there)', (at.held || at.carGap >= 24) && at.carGap < 71, JSON.stringify(at));          // (held up, it is standing in the traffic where it got stuck, not parked)
  check('the officer (a real person) is at your door', at.shown && at.off < 2.6, JSON.stringify(at));
  check('a car hit is a ticket: $250, paid with the use button', !at.v.arrest && at.v.fine === 250 && at.card && /PAY \$250/.test(at.prompt), JSON.stringify(at.v));
  const paid = await P.evaluate(() => { const g = window.__game, c0 = g.settings.cash; g.stop.use(); return { c0, c1: g.settings.cash, state: g.stop.state, fines: g.settings.record.fines }; });
  check('paying takes the fine from your money', paid.c0 - paid.c1 === 250 && paid.state === 'leave' && paid.fines === 1, JSON.stringify(paid));
  r = await until(P, '!g.game.stopOn && !g.police.active', 30);
  check('and the officer goes back to his car, which drives off', r.ok && !r.seen.includes('fled'), JSON.stringify(r));

  console.log('driving off when signalled');
  await step(P, 30);
  await P.evaluate(() => { window.__game.crime(0.5, 'break'); });
  r = await until(P, "g.stop.state === 'signal'", 60);
  check('smashing something: a patrol car again, and it signals', r.ok, JSON.stringify(r));
  const fl = await P.evaluate(() => { const g = window.__game; g.stop.t = 16; for (let i = 0; i < 10; i++) g.tick(1 / 30); return { chase: !!g.game.chaseOn, stopOn: !!g.game.stopOn, mode: g.police.mode, cops: g.police.cops.length, stars: g.police.stars, state: g.stop.state }; });
  check('not pulling over brings the whole force: a chase', fl.chase && !fl.stopOn && fl.mode === 'chase' && fl.cops >= 3, JSON.stringify(fl));
  await P.evaluate(() => { const g = window.__game; g.endChase(); g.game.noWanted = 0; g.tick(1 / 60); });

  console.log('beating someone up with no money: arrested');
  const a0 = await P.evaluate(() => { const g = window.__game; g.settings.cash = 0; g.leaveCar(true); g.tick(1 / 60); g.assault(1); const one = !!g.game.stopOn || !!g.game.chaseOn; g.assault(1); return { one, stopOn: !!g.game.stopOn, chase: !!g.game.chaseOn, mode: g.police.mode, foot: g.game.onFoot }; });
  check('one punch is nothing; a beating sends a patrol car (not the whole force)', !a0.one && a0.stopOn && !a0.chase && a0.mode === 'stop' && a0.foot, JSON.stringify(a0));
  r = await until(P, "g.stop.state === 'talk' && !!g.stop.verdict", 90);
  check('on foot: the car pulls up and the officer walks over to you', r.ok && r.seen.includes('approach'), JSON.stringify(r));
  const v = await P.evaluate(() => { const g = window.__game; return { v: g.stop.verdict, card: !!document.querySelector('#sc-choice:not(.hidden) [data-act="go"]'), prompt: g.stop.prompt }; });
  check('an assault you cannot pay for is an arrest', v.v.arrest && v.v.broke && v.v.days >= 2 && v.card && v.prompt === 'GO QUIETLY', JSON.stringify(v));
  const cuff = await P.evaluate(() => { const g = window.__game; g.stop.use(); let hands = 0; for (let i = 0; i < 30; i++) { g.tick(1 / 30); hands = Math.max(hands, g.walker.hands); } return { state: g.stop.state, hands: +hands.toFixed(2), hold: g.walker.hold, guns: g.arsenal.env.active() }; });
  check('going quietly: hands up, held still, no guns', cuff.state === 'cuff' && cuff.hands > 0.8 && cuff.hold && !cuff.guns, JSON.stringify(cuff));
  r = await until(P, "g.stop.state === 'idle'", 10);
  await wait(700);
  const j = await P.evaluate(() => {
    const g = window.__game, J = g.jail, C = J.J && J.J.cell, w = g.walker;
    return { ok: J.active && J.locked && J.prisoner, inside: g.interior.active, inCell: !!C && w.x > C.x0 && w.x < C.x1 && w.z > C.z0 && w.z < C.z1, booking: J.booking && !!document.querySelector('#booking:not(.hidden) li'), days: J.V && J.V.days, arrests: g.settings.record.arrests, police: g.police.active, stopOn: !!g.game.stopOn, people: J.people.length };
  });
  check('cuffed, taken in, and booked: the custody record on the screen', r.ok && j.ok && j.inside && j.booking && j.arrests === 1 && !j.police && !j.stopOn, JSON.stringify(j));
  check('you are in a cell, with others in the cells and an officer in the corridor', j.inCell && j.people >= 5, JSON.stringify(j));

  console.log('in the cells');
  await P.waitForFunction(() => window.__game.jail.people.every(p => p.walker.person), null, { timeout: 60000 }).catch(() => {});
  const cell = await P.evaluate(() => {
    const g = window.__game, J = g.jail, w = g.walker, C = J.J.cell; J.use(); const h0 = J.hour;
    for (let i = 0; i < 60; i++) g.tick(1 / 30);
    const h1 = J.hour; let maxZ = -1e9, minZ = 1e9;
    for (let i = 0; i < 120; i++) { w.update(1 / 30, { mx: 0, my: -1, sprint: true, jump: false, crouch: false }, 0, null); minZ = Math.min(minZ, w.z); }
    const out = w.z < C.z0 - 0.05; w.place(C.cx, C.cz, 0);
    return { booked: !J.booking, h0, h1: +h1.toFixed(2), out, guns: g.arsenal.env.active(), minZ: +(minZ - C.z0).toFixed(2) };
  });
  check('time passes in the cells (an hour every few seconds)', cell.booked && cell.h1 - cell.h0 > 0.4 && cell.h1 - cell.h0 < 1, JSON.stringify(cell));
  check('the bars hold you: you cannot walk out, and you have no guns', !cell.out && !cell.guns, JSON.stringify(cell));
  const look = await P.evaluate(() => {
    const g = window.__game, J = g.jail, at = h => { J.hour = Math.floor(J.hour / 24) * 24 + h; J.applyHour(); return { win: +J.J.win.color.r.toFixed(2) + +J.J.win.color.g.toFixed(2) + +J.J.win.color.b.toFixed(2), lamp: +J.J.lamp.color.r.toFixed(2), tray: J.J.tray.visible }; };
    const r = { noon: at(15), breakfast: at(8.5), night: at(23.5) }; J.hour = 21; J.applyHour(); return r;
  });
  check('the window is bright in the afternoon and dark at night; the lights go out at ten', look.noon.win > 2 && look.night.win < 0.5 && look.noon.lamp > 1 && look.night.lamp < 0.5, JSON.stringify(look));
  check('a meal comes through the hatch at mealtimes', look.breakfast.tray && !look.noon.tray && !look.night.tray, JSON.stringify(look));
  const sl = await P.evaluate(() => { const g = window.__game, J = g.jail, w = g.walker, it = J.room.items.find(i => i.type === 'bunk'); w.place(it.x, it.z, 0); g.tick(1 / 60); const pr = J.prompt; J.use(); return { pr, d0: J.day }; });
  await wait(600);
  const sl2 = await P.evaluate(() => { const g = window.__game, J = g.jail; return { hour: J.hour % 24, day: J.day, locked: J.locked }; });
  check('sleeping on the bunk gets you through to the next morning', sl.pr === 'SLEEP' && sl2.hour === 7 && sl2.day === sl.d0 + 1 && sl2.locked, JSON.stringify({ sl, sl2 }));
  const rel = await P.evaluate(() => {
    const g = window.__game, J = g.jail; J.advance(J.releaseAt - J.hour + 0.01); const free = !J.locked && J.released;
    for (let i = 0; i < 150; i++) g.tick(1 / 30);
    const doors = { cell: J.J.doors.cell.box.dead, custody: J.J.doors.custody.box.dead };
    const R = J.room, w = g.walker; w.place(R.exit.x, R.exit.z + 0.5, Math.PI); g.tick(1 / 60); const pr = J.prompt; return { free, doors, pr };
  });
  check('on the day you are due out, the cell and the custody door open', rel.free && rel.doors.cell && rel.doors.custody, JSON.stringify(rel));
  const outside = await P.evaluate(() => { const g = window.__game, r = g.game.venueRet; const ok = g.leaveVenue(true); g.tick(1 / 60); return { ok, inside: !!g.game.inside, jail: g.jail.active, car: +Math.hypot(g.car.x - g.walker.x, g.car.z - g.walker.z).toFixed(1), at: +Math.hypot(g.walker.x - r.x, g.walker.z - r.z).toFixed(1), guns: g.arsenal.env.active() }; });
  check('you walk out through the lobby onto the street, your car parked outside', rel.pr === 'LEAVE' && outside.ok && !outside.inside && !outside.jail && outside.car < 30 && outside.guns, JSON.stringify({ rel, outside }));

  console.log('caught at the end of a chase');
  await P.evaluate(() => { const g = window.__game; g.settings.cash = 5000; g.game.noWanted = 0; g.startWanted('gun'); for (let i = 0; i < 20; i++) g.tick(1 / 30); g.police.result = 'busted'; g.police.endT = 0; });
  r = await until(P, '!g.game.chaseOn', 5);
  await wait(700);
  const bj = await P.evaluate(() => { const g = window.__game; return { jail: g.jail.active && g.jail.locked, days: g.jail.V && g.jail.V.days, card: document.querySelector('#chase-end') && !document.querySelector('#chase-end').classList.contains('hidden'), list: g.jail.V && g.jail.V.list.map(c => c.name) }; });
  check('BUSTED in a free-roam chase: the cells, not a menu', r.ok && bj.jail && !bj.card && bj.days >= 2 && bj.list.includes('EVADING THE POLICE'), JSON.stringify(bj));
  await P.evaluate(() => { const g = window.__game, J = g.jail; J.use(); J.advance(J.releaseAt - J.hour + 0.01); g.leaveVenue(true); g.tick(1 / 60); });

  console.log('police stations');
  const st = await P.evaluate(async () => {
    const g = window.__game, V = await import('./src/venues.js'); g.city.loadNow(g.walker.x, g.walker.z, 3);
    const list = [...V.VENUES.values()].filter(v => v.kind === 'police'); if (!list.length) return { n: 0 };
    const v = list[0]; g.walker.place(v.x, v.z, 0); g.tick(1 / 60); const ok = g.enterVenue(v, true);
    const J = g.jail, desk = J.room.items.find(i => i.type === 'desk'); g.walker.place(desk.x, desk.z, Math.PI); g.tick(1 / 60);
    const r = { n: list.length, ok, visit: J.active && !J.locked && !J.prisoner, closed: !J.J.doors.custody.box.dead, prompt: J.prompt, hud: !!document.querySelector('#jailhud:not(.hidden)') };
    g.leaveVenue(true); g.tick(1 / 60); return r;
  });
  check('there are police stations on the streets', st.n >= 1, JSON.stringify(st));
  check('walking into one is the public lobby: the front desk, the custody door shut', st.ok && st.visit && st.closed && st.prompt === 'FRONT DESK' && !st.hud, JSON.stringify(st));
  check('no script errors', logs.length === 0, logs.slice(0, 3).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
