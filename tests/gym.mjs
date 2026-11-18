// Gyms (src/gym.js, the room in src/rooms.js, the front in src/venues.js): there are many on the map; walk in; a membership is bought at the front desk
// with banked money (and only if there is enough); without one the machines are refused; training on the heavy bag raises strength (the recorded
// punches, the bag swinging), the treadmill stamina, the dumbbells strength; the membership caps how far; strength makes blows hit harder and at 10 a
// kick kills; stamina sprints faster.
import { check, open, step, finish } from './lib.mjs';

try {
  const { page: P, logs } = await open({ init: () => { try { localStorage.setItem('sunsetcity.v1', JSON.stringify({ quality: 'low', renderScale: 0.75, cash: 20000 })); } catch (e) { /* private mode */ } } });
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 });
  await step(P, 60);
  await P.evaluate(() => { window.__freeze = true; const g = window.__game; g.car.vx = 0; g.car.vz = 0; if (!g.game.onFoot) g.leaveCar(); });
  await step(P, 60);

  console.log('on the map');
  const map = await P.evaluate(async () => {
    const g = window.__game, V = await import('./src/venues.js'); g.city.loadNow(g.walker.x, g.walker.z, 3);
    const gyms = [...V.VENUES.values()].filter(v => v.kind === 'gym'), all = V.VENUES.size;
    return { gyms: gyms.length, all, first: gyms[0] ? { x: gyms[0].x, z: gyms[0].z, dx: gyms[0].dx, dz: gyms[0].dz } : null, type: V.VENUE_TYPES.gym };
  });
  check('there are gyms on the streets', map.gyms >= 2, JSON.stringify({ gyms: map.gyms, all: map.all }));
  check('a gym is its own kind of place, not a robbery', !!map.type && map.type.gym === true, JSON.stringify(map.type));

  console.log('in a gym');
  const inn = await P.evaluate(async (g0) => {
    const g = window.__game, V = await import('./src/venues.js'), v = [...V.VENUES.values()].find(q => q.kind === 'gym');
    g.walker.place(v.x, v.z, 0); g.tick(1 / 60); const ok = g.enterVenue(v, true);
    return { ok, inside: !!g.game.inside, gym: g.gym.active, heist: g.heist.active, items: g.gym.room.items.map(i => i.type), bags: g.gym.room.bags.length, people: g.gym.goers.length };
  });
  check('walking in builds the gym (not a robbery)', inn.ok && inn.inside && inn.gym && !inn.heist, JSON.stringify(inn));
  check('it has a desk, heavy bags, a kick bag, dumbbells and treadmills', ['desk', 'bag', 'kickbag', 'weights', 'treadmill'].every(t => inn.items.includes(t)) && inn.bags >= 4, JSON.stringify(inn.items));
  check('and people training in it', inn.people >= 5, String(inn.people));
  await P.waitForFunction(() => window.__game.walker.body && window.__game.walker.body.ready('jab') && window.__game.gym.goers.every(o => o.walker.person), null, { timeout: 60000 }).catch(() => {});

  const at = type => P.evaluate(t => { const g = window.__game, it = g.gym.room.items.find(i => i.type === t); g.walker.x = it.x; g.walker.z = it.z; g.walker.h = it.face || 0; g.tick(1 / 60); return g.gym.prompt; }, type);
  let pr = await at('bag');
  const refused = await P.evaluate(() => { const g = window.__game; g.settings.gymTier = 0; g.settings.gymStr = 0; g.settings.gymSta = 0; g.gym.use(); return !g.gym.session; });
  check('without a membership the bag is refused', refused, pr);

  console.log('the membership desk');
  pr = await at('desk');
  const buy = await P.evaluate(() => {
    const g = window.__game, G = g.gym; G.use(); const open = G.menuOpen && !!document.querySelector('#gymmenu:not(.hidden) .gm-card');
    g.settings.cash = 200; const poor = G.buy(0); const tier0 = G.tier;
    g.settings.cash = 20000; const ok = G.buy(1); const after = g.settings.cash, tier = G.tier;
    const up = G.buy(2); const after2 = g.settings.cash;
    G.showMenu(false); return { open, poor, tier0, ok, tier, after, up, after2, tierEnd: G.tier };
  });
  check('the desk opens the membership menu', buy.open, JSON.stringify(buy));
  check('without enough money nothing is bought', !buy.poor && buy.tier0 === 0, JSON.stringify(buy));
  check('PRO costs $3,000 of your money', buy.ok && buy.tier === 2 && buy.after === 17000, JSON.stringify(buy));
  check('and ELITE is an upgrade: you pay the difference ($9,000)', buy.up && buy.tierEnd === 3 && buy.after2 === 8000, JSON.stringify(buy));

  console.log('training');
  await at('bag');
  const bag = await P.evaluate(() => {
    const g = window.__game, G = g.gym, w = g.walker, str0 = g.settings.gymStr || 0; G.use(); const started = !!G.session; let swing = 0, punches = new Set();
    const b = G.room.bags[G.session.it.bag];
    for (let i = 0; i < 60 * 8; i++) { g.tick(1 / 60); swing = Math.max(swing, Math.abs(b.ax) + Math.abs(b.az)); if (w.body.act) punches.add(w.body.act.name); }
    const str1 = g.settings.gymStr; G.use(); return { started, str0, str1, swing: +swing.toFixed(3), punches: [...punches], stopped: !G.session };
  });
  check('using the heavy bag starts training', bag.started && bag.stopped, JSON.stringify(bag));
  check('the character throws the recorded punches at it', bag.punches.filter(n => /jab|cross|hook|combo|haymaker|body/.test(n)).length >= 3, JSON.stringify(bag.punches));
  check('the bag swings when it is hit', bag.swing > 0.05, String(bag.swing));
  check('and strength goes up', bag.str1 > bag.str0 + 5, JSON.stringify(bag));
  await at('treadmill');
  const run = await P.evaluate(() => {
    const g = window.__game, G = g.gym, w = g.walker, x0 = w.x, z0 = w.z, s0 = g.settings.gymSta || 0; G.use(); let sp = 0;
    for (let i = 0; i < 60 * 5; i++) { g.tick(1 / 60); sp = Math.max(sp, w.speed); }
    const moved = Math.hypot(w.x - x0, w.z - z0); G.use(); return { sp: +sp.toFixed(2), moved: +moved.toFixed(3), sta: g.settings.gymSta - s0 };
  });
  check('on the treadmill the character runs on the spot, and stamina goes up', run.sp > 2 && run.moved < 0.05 && run.sta > 3, JSON.stringify(run));
  await at('weights');
  const lift = await P.evaluate(() => {
    const g = window.__game, G = g.gym, w = g.walker, s0 = g.settings.gymStr; G.use(); let hi = -9, lo = 9; const v = new w.mesh.position.constructor();
    for (let i = 0; i < 60 * 4; i++) { g.tick(1 / 60); w.person.worldPos('Bip01_L_Hand', v); hi = Math.max(hi, v.y - w.y); lo = Math.min(lo, v.y - w.y); }
    const shown = G.dumbbells.every(m => m.visible); G.use(); return { range: +(hi - lo).toFixed(2), shown, gain: +(g.settings.gymStr - s0).toFixed(1) };
  });
  check('dumbbell curls: the hands go up and down holding dumbbells, and strength goes up', lift.range > 0.25 && lift.shown && lift.gain > 0, JSON.stringify(lift));

  console.log('what strength does');
  const cap = await P.evaluate(() => { const g = window.__game, G = g.gym; g.settings.gymTier = 1; g.settings.gymStr = 0; for (let i = 0; i < 2000; i++) G.gain('str', 5); const basic = G.strength; g.settings.gymTier = 3; for (let i = 0; i < 2000; i++) G.gain('str', 5); return { basic, elite: G.strength }; });
  check('a BASIC membership stops at 4, ELITE goes to 10', cap.basic === 4 && cap.elite === 10, JSON.stringify(cap));
  // Bouts: boxing in the ring and karate on the mat, against one of the gym's fighters (gym.js Bout).
  console.log('bouts');
  const kit = await P.evaluate(() => { const R = window.__game.gym.room; return { ring: !!R.gymRing && R.items.some(i => i.type === 'ring'), mat: !!R.gymMat && R.items.some(i => i.type === 'dojo'), loose: R.loose.length }; });
  check('the gym has a boxing ring and a karate mat you can fight on, and more kit (barbells, plates)', kit.ring && kit.mat && kit.loose > 20, JSON.stringify(kit));
  const startBout = type => P.evaluate(t => { const g = window.__game, G = g.gym, w = g.walker, it = G.room.items.find(i => i.type === t); G.settings.gymTier = 2; G.settings.gymStr = 0; w.place(it.x, it.z, it.face || 0); g.tick(1 / 60); const prompt = G.prompt; G.use(); const b = G.bout, A = b && b.area; return { prompt, style: b && b.style, inside: !!A && w.x > A.x0 && w.x < A.x1 && w.z > A.z0 && w.z < A.z1, oppIn: !!A && b.x > A.x0 && b.x < A.x1 }; }, type);
  const waitOpp = () => P.waitForFunction(() => { const b = window.__game.gym.bout; return !b || (b.opp.person && b.opp.body && b.opp.body.ready('jab')); }, null, { timeout: 60000 }).catch(() => {});
  // Fight: face him (the camera too: a blow goes where you look) and throw a blow every 0.4 s, as `kind` ('fist' or 'kick').
  const fightOut = kind => P.evaluate(kind => {
    const g = window.__game, G = g.gym, w = g.walker, b = G.bout, cash0 = g.settings.cash; if (!b) return { none: true };
    for (let i = 0; i < 60 * 12 && b.state === 'intro'; i++) g.tick(1 / 60);
    const fought = b.state === 'fight'; let i = 0, targeted = false;
    for (; i < 60 * 100 && b.state === 'fight'; i++) { w.h = Math.atan2(b.x - w.x, b.z - w.z); g.footCam.yaw = w.h; if (!targeted && (g.melee.env.targets() || []).includes(b)) targeted = true; if (i % 24 === 0) { if (kind === 'kick') g.melee.kick(); else g.melee.attack('fist'); } g.tick(1 / 60); }
    const out = { fought, targeted, state: b.state, result: b.result, why: b.why, ohp: Math.round(b.ohp), php: Math.round(b.php), pts: b.pts, landed: b.landed, taken: b.taken, fouls: b.fouls, secs: +(i / 60).toFixed(1), paid: g.settings.cash - cash0 };
    for (let k = 0; k < 60 * 8 && G.bout; k++) g.tick(1 / 60); out.ended = !G.bout; const it = b.item; out.back = Math.hypot(w.x - it.x, w.z - it.z) < 0.6; return out;
  }, kind);
  const b1 = await startBout('ring'); await waitOpp(); const f1 = await fightOut('fist');
  check('using the ring\'s steps starts a boxing bout, with you and him in the ring', b1.prompt === 'BOXING: FIGHT A BOUT' && b1.style === 'boxing' && b1.inside && b1.oppIn, JSON.stringify(b1));
  check('the bell goes, he is a target for your fists, and the bout is fought to a finish (both of you land blows)', f1.fought && f1.targeted && f1.state === 'over' && f1.landed > 0 && f1.taken > 0 && !!f1.result, JSON.stringify(f1));
  check('a knockout win pays the purse; afterwards you are back down the steps', (f1.result !== 'win' || f1.paid === 150) && f1.ended && f1.back, JSON.stringify(f1));
  // A kick in the ring is a foul.
  await startBout('ring'); await waitOpp();
  const foul = await P.evaluate(() => { const g = window.__game, G = g.gym, b = G.bout; for (let i = 0; i < 60 * 12 && b.state === 'intro'; i++) g.tick(1 / 60); const h0 = b.ohp, r = b.hit(24, { kind: 'kick', knock: 1, dir: { x: 1, z: 0 } }); const out = { fouls: b.fouls, same: b.ohp === h0, r }; b.hit(24, { kind: 'kick' }); b.hit(24, { kind: 'roundhouse' }); out.after = { state: b.state, result: b.result, why: b.why }; for (let k = 0; k < 60 * 8 && G.bout; k++) g.tick(1 / 60); return out; });
  check('boxing is fists only: a kick is a foul that does nothing, and three are a disqualification', foul.fouls === 1 && foul.same && foul.after.result === 'lose' && /DISQUALIFIED/.test(foul.after.why), JSON.stringify(foul));
  const b2 = await startBout('dojo'); await waitOpp(); const f2 = await fightOut('kick');
  check('the edge of the mat starts a karate bout on it', b2.prompt === 'KARATE: SPAR ON THE MAT' && b2.style === 'karate' && b2.inside && b2.oppIn, JSON.stringify(b2));
  check('in karate kicks score (two points, three if he goes down) and the first to 8 wins (or the most at the bell)', f2.fought && f2.state === 'over' && (f2.pts[0] >= 2 || f2.pts[1] >= 2) && (f2.result !== 'win' || f2.paid === 200), JSON.stringify(f2));
  check('the sparring pair on the mat stepped off for the bout, and are back after it', await P.evaluate(() => { const g = window.__game; g.tick(1 / 60); return g.gym.goers.filter(o => /^kar/.test(o.role)).every(o => !o.off && o.walker.mesh.visible); }), '');
  await P.evaluate(() => { const g = window.__game; g.leaveVenue(true); g.tick(1 / 60); });
  const hit = await P.evaluate(() => {
    const g = window.__game, m = g.melee, w = g.walker, out = {}, saved = g.settings.gymStr; for (const q of g.peds.list) q.kind = 'civ';
    const tryKick = (str) => {
      g.settings.gymStr = str; const p = g.peds.list.find(q => q.state !== 'away' && q.state !== 'down'); if (!p) return null;
      w.place(p.x - Math.sin(w.h) * 1.3, p.z - Math.cos(w.h) * 1.3, w.h); p.state = 'idle'; p.idleT = 99; p.speed = 0; m.cool = 0; m.queued = null; m.comboT = 0; m.move = null; m.next.kick = 'kick';
      const each = m.each; m.each = fn => fn(p, p.x, p.z, 'ped'); let info = null, deadNow = false; const st = m.strike.bind(m); m.strike = (s, i) => { info = i; const r = st(s, i); deadNow = !!p.dead; return r; };          // (dead when the kick lands: a body that ends up in the river is cleared away at once)
      m.kick(); for (let i = 0; i < 90 && m.busy; i++) g.tick(1 / 60); m.each = each; m.strike = st;
      return info ? { dmg: Math.round(info.dmg), lethal: !!info.lethal, dead: deadNow, speed: +Math.hypot(p.vx || 0, p.vz || 0).toFixed(1) } : null;
    };
    out.weak = tryKick(0); out.strong = tryKick(xpFor(10));
    function xpFor(n) { return 25 * n * n; }
    g.settings.gymStr = saved; return out;
  });
  check('a kick at strength 0 hurts but does not kill', hit.weak && !hit.weak.lethal && hit.weak.dmg < 100, JSON.stringify(hit));
  check('at strength 10 one kick kills', hit.strong && hit.strong.lethal && hit.strong.dead, JSON.stringify(hit));
  const sprint = await P.evaluate(() => { const g = window.__game; g.settings.gymSta = 25 * 100; g.tick(1 / 60); return g.walker.sprintK; });
  check('stamina 10 sprints 20% faster', Math.abs(sprint - 1.2) < 0.01, String(sprint));
  check('no script errors', logs.length === 0, logs.slice(0, 3).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
