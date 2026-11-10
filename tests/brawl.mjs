// People who fight back: some pedestrians are armed and some are big muscular men; attack one and he becomes a fighter (src/brawl.js): the big man charges and hits, the armed one
// draws a pistol and shoots, both can be beaten (knocked out) or shot (down for good), beating one pays, and being beaten yourself knocks you out. The crowd is not all fighters.
import { check, open, step, finish } from './lib.mjs';

try {
  const { page: P, logs } = await open();
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 });
  await step(P, 60);
  await P.evaluate(() => { window.__freeze = true; const h = window.__game.hud, o = h.toast.bind(h); window.__toasts = []; h.toast = (t, sec) => { window.__toasts.push(t); return o(t, sec); }; });
  await P.evaluate(() => { const g = window.__game; g.car.vx = 0; g.car.vz = 0; if (!g.game.onFoot) g.leaveCar(); });
  await step(P, 90);

  console.log('the crowd');
  const mix = await P.evaluate(async () => {
    const g = window.__game, n = { civ: 0, armed: 0, bruiser: 0 }, focus = { x: g.walker.x, z: g.walker.z, onFoot: true };
    for (let i = 0; i < 900; i++) { const p = {}; g.peds.spawn(p, focus, null, true); if (p.state !== 'away') n[p.kind]++; }
    return { n, total: n.civ + n.armed + n.bruiser };
  });
  const share = k => mix.n[k] / Math.max(1, mix.total);
  check('about 1 in 16 of the people is a big man, and about 1 in 11 is armed (and most are neither)', share('bruiser') > 0.03 && share('bruiser') < 0.11 && share('armed') > 0.05 && share('armed') < 0.15 && share('civ') > 0.75, JSON.stringify(mix));

  // Put the character beside a pedestrian that has been made a given kind (one in the open, where the character really stays where it is put).
  const put = async (kind, dist = 1.0) => { await P.waitForFunction(() => !window.__game.game.ko, null, { timeout: 5000 }); return put0(kind, dist); };
  const put0 = (kind, dist = 1.0) => P.evaluate(([kind, dist]) => {
    const g = window.__game, w = g.walker; g.brawl.clear(); for (const q of g.peds.list) q.kind = 'civ';
    for (let i = 0; i < Math.min(16, g.peds.list.length); i++) {
      const p = g.peds.list[i]; if (p.state === 'away') continue;
      p.kind = kind; p.state = 'idle'; p.idleT = 99; p.downT = 0; p.panic = 0; p.vx = p.vz = p.vy = 0; p.lie = 0; p.speed = 0; p.real = p.real || null;
      g.tick(1 / 60); const yaw = g.footCam.yaw, wx = p.x - Math.sin(yaw) * dist, wz = p.z - Math.cos(yaw) * dist;
      w.noClip = false; w.place(wx, wz, yaw); g.footCam.yaw = yaw; g.tick(1 / 60);
      if (Math.hypot(w.x - wx, w.z - wz) < 0.2 && Math.hypot(w.x - p.x, w.z - p.z) < dist + 0.25 && p.state === 'idle') {
        g.melee.cool = 0; g.melee.queued = null; g.game.noWanted = 1e9; g.game.clock = 1000 + Math.random(); g.game.assaultN = 0; g.game.assaultT = -99;
        g.game.hp = 100; g.game.hpT = 0; g.game.ko = false; g.settings.cash = 500; window.__pi = i; return { i, x: p.x, z: p.z };
      }
      p.kind = 'civ';
    }
    return null;
  }, [kind, dist]);
  await P.evaluate(() => { const g = window.__game; g.arsenal.clear && g.arsenal.clear(); g.arsenal.holster(); });

  console.log('a citizen');
  await put('civ'); await P.evaluate(() => window.__game.melee.attack('fist')); await step(P, 50);
  let r = await P.evaluate(() => ({ fighters: window.__game.brawl.list.length }));
  check('a plain citizen who is punched goes down: nobody fights back', r.fighters === 0, JSON.stringify(r));

  console.log('a big man');
  await put('bruiser'); await P.evaluate(() => window.__game.melee.attack('fist')); await step(P, 30);
  r = await P.evaluate(() => { const b = window.__game.brawl.list[0]; return b ? { kind: b.kindName, hp: Math.round(b.hp), max: b.maxHp, state: b.state, living: window.__game.brawl.living } : null; });
  check('a punch on a big man makes him a fighter (and the punch hurt him)', r && /bruiser|enforcer/.test(r.kind) && r.hp < r.max && r.living === 1, JSON.stringify(r));
  await P.waitForFunction(() => { const b = window.__game.brawl.list[0]; return b && b.walker.person; }, null, { timeout: 30000 });
  await step(P, 5);
  r = await P.evaluate(() => { const b = window.__game.brawl.list[0]; return { bulk: b.walker.person.bulk, sx: b.walker.person.bones.Bip01_Spine2.scale.toArray().map(v => +v.toFixed(2)), arm: b.walker.person.bones.Bip01_R_UpperArm.scale.toArray().map(v => +v.toFixed(2)), real: !!b.walker.person }; });
  check('he is built like a bruiser: the model has the muscle build (broad chest, thick arms)', r.bulk > 0.8 && Math.max(...r.sx) > 1.1 && Math.max(...r.arm) > 1.1, JSON.stringify(r));
  // He charges and hits: stand still for a few seconds.
  await P.evaluate(() => { const g = window.__game; window.__hp0 = g.game.hp; window.__swings = 0; const b = g.brawl.list[0]; b.hp = b.maxHp; });
  let hits = 0, minHp = 100;
  for (let i = 0; i < 12; i++) { await step(P, 30); const s = await P.evaluate(() => { const g = window.__game, hp = g.game.hp; if (hp < 45) g.game.hp = 100; return { hp, atk: !!g.brawl.list[0]?.atk }; }); minHp = Math.min(minHp, s.hp); }          // (kept from running out: being knocked out has its own check below)
  check('left alone with him, he hits you: your health goes down', minHp < 100, 'lowest ' + minHp);
  const fist = await P.evaluate(() => { const b = window.__game.brawl.list[0]; return { melee: !!b, name: b && b.cd !== undefined }; });
  // His blows are thrown with the pose of a punch (the melee pose is set while he swings).
  let sawPose = false; for (let i = 0; i < 120 && !sawPose; i++) { await step(P, 3); sawPose = await P.evaluate(() => { const b = window.__game.brawl.list[0]; return !!(b && b.walker.melee && b.walker.melee.kind); }); }
  check('while he swings, his arm really moves in a punch (the melee pose)', sawPose, 'no swing seen');
  // He takes a lot of punishment, and goes down in the end.
  await P.evaluate(() => { const g = window.__game, b = g.brawl.list[0], w = g.walker; g.game.hp = 100; w.place(b.x - Math.sin(b.walker.h) * 1.0, b.z - Math.cos(b.walker.h) * 1.0, b.walker.h); b.walker.h; });
  const before = await P.evaluate(() => Math.round(window.__game.brawl.list[0].hp));
  for (let i = 0; i < 6; i++) { await P.evaluate(() => { const g = window.__game, b = g.brawl.list[0], w = g.walker; g.game.hp = 100; w.down = 0; w.downT = 0; const yaw = Math.atan2(b.x - w.x, b.z - w.z); g.footCam.yaw = yaw; w.h = yaw; g.melee.cool = 0; g.melee.attack('fist'); }); await step(P, 26); }
  const after = await P.evaluate(() => Math.round(window.__game.brawl.list[0].hp));
  check('your punches wear him down (it takes more than one or two)', after < before && after > 20, `${before} -> ${after}`);
  await P.evaluate(() => { const g = window.__game, b = g.brawl.list[0]; b.hp = 3; b.stun = 0; const w = g.walker; w.down = 0; w.downT = 0; g.game.hp = 100; const dx = b.x - w.x, dz = b.z - w.z, dl = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz); w.place(b.x - dx / dl * 1.0, b.z - dz / dl * 1.0, yaw); g.footCam.yaw = yaw; g.melee.move = null; g.melee.cool = 0; g.melee.queued = null; g.melee.attack('fist'); window.__cash0 = g.settings.cash; });
  await step(P, 40);
  r = await P.evaluate(() => { const b = window.__game.brawl.list[0]; return { ko: b.ko, dead: b.dead, cash: window.__game.settings.cash - window.__cash0, lying: b.walker.downT > 0.5 }; });
  check('beaten with fists he is knocked out (not killed), lying down, and you take his wallet', r.ko && !r.dead && r.lying && r.cash >= 100, JSON.stringify(r));
  await step(P, 60 * 8);
  r = await P.evaluate(() => { const b = window.__game.brawl.list[0]; return b ? { ko: b.ko, leaving: b.leaving } : { gone: true }; });
  check('after a few seconds he gets up and slopes off (and is then gone)', r.gone || r.leaving || !r.ko, JSON.stringify(r));

  console.log('an armed man');
  await put('armed', 1.2); await P.evaluate(() => { window.__game.game.noWanted = 1e9; window.__game.melee.attack('fist'); }); await step(P, 30);
  r = await P.evaluate(() => { const b = window.__game.brawl.list[0]; return b ? { kind: b.kindName, gun: !!b.gun, hp: Math.round(b.hp) } : null; });
  check('a punch on an armed man makes him a fighter with a pistol', r && r.kind === 'armed' && r.gun, JSON.stringify(r));
  await P.evaluate(() => { const g = window.__game; g.game.hp = 100; g.game.hpT = -999; const b = g.brawl.list[0]; b.hp = b.maxHp; window.__fired = 0; });
  let drawn = 0, mag0 = 8, minMag = 8, hurt = 100;
  for (let i = 0; i < 24; i++) { await step(P, 30); const s = await P.evaluate(() => { const b = window.__game.brawl.list[0]; if (window.__game.game.hp < 25) window.__game.game.hp = 100; return b ? { draw: b.W.draw, aim: b.W.aimK, mag: b.mag, hp: window.__game.game.hp, d: Math.hypot(b.x - window.__game.walker.x, b.z - window.__game.walker.z) } : null; }); if (!s) break; drawn = Math.max(drawn, s.draw); minMag = Math.min(minMag, s.mag); hurt = Math.min(hurt, s.hp); }
  check('he draws the pistol and points it at you', drawn > 0.9, String(drawn));
  check('he shoots (the magazine goes down)', minMag < 8, 'mag ' + minMag);
  check('and he hits you now and then (your health goes down)', hurt < 100, 'lowest ' + hurt);
  const shotsOnly = await P.evaluate(() => { const b = window.__game.brawl.list[0]; return { fired: b.fired }; });
  check('the first shot in the street counts as gunfire (the police are called for)', shotsOnly.fired === true, JSON.stringify(shotsOnly));
  // Shot down.
  await P.evaluate(() => { window.__cash1 = window.__game.settings.cash; window.__game.brawl.list[0].hit(500, { gun: true, dir: { x: 0, z: 1 } }); });
  r = await P.evaluate(() => { const b = window.__game.brawl.list[0]; return { dead: b.dead, ko: b.ko, cash: window.__game.settings.cash - window.__cash1 }; });
  check('shot, he is down for good (dead, not just knocked out)', r.dead && !r.ko, JSON.stringify(r));

  console.log('bullets and gunfire');
  const t = await P.evaluate(() => {
    const g = window.__game, p = g.peds.list[1]; p.kind = 'civ'; p.state = 'idle'; p.vx = p.vz = 0; p.lie = 0; g.tick(1 / 60);
    const oy = p.y + 1.3; let out = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const r = g.arsenal.trace(p.x - dx * 3, oy, p.z - dz * 3, dx, 0, dz, 30); if (r.type === 9 && r.ref === p) { out = { type: r.type, isPed: true, t: +r.t.toFixed(2) }; break; } out = out || { type: r.type, isPed: r.ref === p, t: +r.t.toFixed(2) }; }
    return out;
  });
  check('a bullet can hit a person on the pavement (it used to fly through)', t.type === 9 && t.isPed, JSON.stringify(t));
  const join = await P.evaluate(() => {
    const g = window.__game; g.brawl.clear(); g.game.noWanted = 1e9; const w = g.walker, gp = g.peds.list;
    for (let i = 0; i < 6; i++) { const p = gp[i]; p.kind = 'armed'; p.state = 'idle'; p.x = w.x + 4 + i; p.z = w.z + 2; p.vx = p.vz = 0; p.real = null; }
    for (let k = 0; k < 8; k++) g.peds.scare(w.x, w.z, 28, 6, true);
    return { fighters: g.brawl.list.length, cap: g.brawl.cap };
  });
  check('armed people near a gunshot join in (but not all at once: there is a limit)', join.fighters >= 1 && join.fighters <= join.cap, JSON.stringify(join));
  const noFight = await P.evaluate(() => { const g = window.__game; g.brawl.clear(); const n = g.brawl.list.length; g.peds.scare(g.walker.x, g.walker.z, 70, 7); return { n, after: g.brawl.list.length }; });
  check('an explosion or a crime frightens them but does not make them fight', noFight.after === 0, JSON.stringify(noFight));

  console.log('you');
  const ko = await P.evaluate(() => {
    const g = window.__game; g.brawl.clear(); g.game.chaseOn = false; g.settings.cash = 1000; g.game.hp = 12; g.game.ko = false; window.__x0 = [g.walker.x, g.walker.z];
    g.hurtPlayer(30); return { hp: g.game.hp, ko: g.game.ko };
  });
  check('with no health left you are knocked out', ko.ko === true && ko.hp === 0, JSON.stringify(ko));
  await new Promise(r => setTimeout(r, 700));
  await step(P, 5);
  const wake = await P.evaluate(() => { const g = window.__game; return { hp: g.game.hp, cash: g.settings.cash, ko: g.game.ko, near: Math.hypot(g.walker.x - g.car.x, g.walker.z - g.car.z) }; });
  check('you wake beside your car with full health, minus a hospital bill', wake.hp === 100 && !wake.ko && wake.cash < 1000 && wake.cash > 800 && wake.near < 6, JSON.stringify(wake));
  const regen = await P.evaluate(async () => { const g = window.__game; g.game.hp = 50; g.game.hpT = 0; for (let i = 0; i < 60 * 12; i++) g.tick(1 / 60); return g.game.hp; });
  check('your health comes back slowly when nobody is hitting you', regen > 60, String(regen));
  const bad = await P.evaluate(() => window.__toasts.filter(t => /undefined|NaN/.test(t)));
  check('no broken messages', bad.length === 0, JSON.stringify(bad));
  check('no script errors', logs.length === 0, logs.slice(0, 4).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
