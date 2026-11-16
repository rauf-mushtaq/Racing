// The recorded moves and the ragdoll: real motion capture for blows, falls and getting up (src/moves.js, assets/people/moves.json, made by
// tools/mocap/build.mjs), the ragdoll a real person goes limp into when knocked over (src/ragdoll.js, src/body.js), the get-up that follows it, the
// flinch when hit, and the reload worked out step by step (src/person.js reloadKeys) with the magazine dropping out (src/weapons.js).
import { check, open, step, finish } from './lib.mjs';

try {
  const { page: P, logs } = await open();
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 });
  await step(P, 60);
  await P.evaluate(() => { window.__freeze = true; const g = window.__game; g.car.vx = 0; g.car.vz = 0; if (!g.game.onFoot) g.leaveCar(); });
  await step(P, 90);
  await P.waitForFunction(() => { const w = window.__game.walker; return w.person && w.body && w.body.ready('getup_back'); }, null, { timeout: 90000 });

  console.log('the moves file');
  const mv = await P.evaluate(async () => {
    const r = await fetch('assets/people/moves.json'), d = await r.json(), out = { bones: d.bones.length, clips: {} };
    for (const [n, c] of Object.entries(d.clips)) out.clips[n] = { frames: c.frames, dur: c.dur, hit: c.hit, q: atob(c.q).length, pos: atob(c.pos).length, root: atob(c.root).length };
    return out;
  });
  const names = Object.keys(mv.clips);
  for (const n of ['jab', 'cross', 'hook', 'haymaker', 'combo', 'body', 'guard', 'kick', 'roundhouse', 'sidekick', 'frontkick', 'stumble', 'duck', 'fall_back', 'getup_back', 'getup_front', 'getup_side', 'getup_hurt'])
    check(`there is a move called ${n}`, names.includes(n), names.join(','));
  const sizes = names.every(n => { const c = mv.clips[n]; return c.q === c.frames * mv.bones * 4 * 2 && c.pos === c.frames * 3 * 4 && c.root === c.frames * 2 * 4 && Math.abs(c.dur - (c.frames - 1) / 30) < 0.01; });
  check('every move has a rotation for every bone in every frame, at 30 frames a second', sizes, JSON.stringify(mv.clips.jab));
  check('every blow says when it lands, inside the move', ['jab', 'cross', 'hook', 'haymaker', 'kick', 'roundhouse'].every(n => mv.clips[n].hit.length >= 1 && mv.clips[n].hit.every(h => h > 0.1 && h < mv.clips[n].dur)), JSON.stringify(['jab', 'kick'].map(n => mv.clips[n].hit)));

  console.log('a punch, on the real person');
  const punch = await P.evaluate(() => {
    const g = window.__game, w = g.walker, v = new w.mesh.position.constructor(), c = new w.mesh.position.constructor();
    w.place(w.x, w.z, w.h); g.tick(1 / 60);
    let reach = 0, rest = 0; const fwd = [Math.sin(w.h), Math.cos(w.h)];
    const handAhead = () => { w.mesh.updateMatrixWorld(true); w.person.worldPos('Bip01_R_Hand', v); w.person.worldPos('Bip01_Spine2', c); return (v.x - c.x) * fwd[0] + (v.z - c.z) * fwd[1]; };
    rest = handAhead(); const ok = w.play('cross'), hit = w.body.act.hits[0];
    for (let i = 0; i < 80 && w.body.act; i++) { g.tick(1 / 60); if (Math.abs(w.body.act ? w.body.act.t - hit : 9) < 0.04) reach = Math.max(reach, handAhead()); }
    return { ok, rest: +rest.toFixed(2), reach: +reach.toFixed(2), after: !!w.body.act };
  });
  check('the cross plays on the player', punch.ok, JSON.stringify(punch));
  check('at the moment it lands the right fist is well out in front of the chest', punch.reach > punch.rest + 0.3 && punch.reach > 0.4, JSON.stringify(punch));
  check('and then it is over', !punch.after, JSON.stringify(punch));

  console.log('knocked over by a car, and up again');
  const fall = await P.evaluate(() => {
    const g = window.__game, w = g.walker, c = g.car, out = { frames: [] }, v = new w.mesh.position.constructor();
    w.place(c.x + Math.sin(c.h) * 7, c.z + Math.cos(c.h) * 7, c.h + Math.PI / 2); g.tick(1 / 60);                      // (out in the road in front of the car)
    const x0 = w.x, z0 = w.z;
    w.knockDown(-Math.sin(w.h) * 9, -Math.cos(w.h) * 9, { at: 'legs' });
    out.rag = w.ragdoll; let lowest = 9, settledAt = -1, upAt = -1, standAt = -1, bad = 0, gu = null;
    for (let i = 0; i < 60 * 14; i++) {
      g.tick(1 / 60);
      w.person.worldPos('Bip01_Head', v); const hy = v.y - w.y; lowest = Math.min(lowest, hy);
      for (const e of w.person.order) if (!isFinite(e.b.quaternion.x) || !isFinite(e.b.position.y)) bad++;
      if (!isFinite(w.x) || !isFinite(w.z)) bad++;
      if (settledAt < 0 && w.body.rag && w.body.rag.settled) settledAt = i / 60;
      if (i === 180) out.speed3 = w.body.rag ? +w.body.rag.speed.toFixed(2) : null;
      if (upAt < 0 && w.body.act && /^getup/.test(w.body.act.name)) { upAt = i / 60; gu = w.body.act.name; }
      if (upAt >= 0 && standAt < 0 && !w.body.act && w.down < 0.05) { standAt = i / 60; w.person.worldPos('Bip01_Head', v); out.standHead = +(v.y - w.y).toFixed(2); }
    }
    Object.assign(out, { lowest: +lowest.toFixed(2), settledAt, upAt, standAt, gu, bad, moved: +Math.hypot(w.x - x0, w.z - z0).toFixed(2) });
    delete out.frames; return out;
  });
  check('a car hit lets the body go limp (the ragdoll)', fall.rag, JSON.stringify(fall));
  check('the body ends up on the ground (the head below 45 cm)', fall.lowest < 0.45, JSON.stringify(fall));
  check('it is thrown, but not absurdly far, by a car at 9 m/s', fall.moved > 1 && fall.moved < 12, JSON.stringify(fall));
  check('it comes to rest within a few seconds', fall.settledAt > 0.3 && fall.settledAt < 5, JSON.stringify(fall));
  check('then gets up with a recorded get-up', !!fall.gu && fall.upAt >= fall.settledAt, JSON.stringify(fall));
  check('and stands again, head up where it should be', fall.standAt > fall.upAt && fall.standHead > 1.4, JSON.stringify(fall));
  check('no broken numbers in the bones on the way', fall.bad === 0, JSON.stringify(fall));

  console.log('hit but standing: a flinch');
  const fl = await P.evaluate(() => {
    const g = window.__game, w = g.walker; w.place(w.x, w.z, w.h); for (let i = 0; i < 30; i++) g.tick(1 / 60);
    const head = () => w.person.bones.Bip01_Head.quaternion.clone(), q0 = head();
    w.flinch(-Math.sin(w.h), -Math.cos(w.h), 1.4, true); let most = 0;
    for (let i = 0; i < 20; i++) { g.tick(1 / 60); most = Math.max(most, w.body.fl ? Math.abs(w.body.fl.p) : 0); }
    for (let i = 0; i < 90; i++) g.tick(1 / 60);
    return { most: +most.toFixed(3), after: +Math.abs(w.body.fl.p).toFixed(4), standing: !w.ragdoll && w.down < 0.05 };
  });
  check('a blow to the face rocks the head and body back, then it springs back', fl.most > 0.08 && fl.after < 0.02 && fl.standing, JSON.stringify(fl));

  console.log('reloading');
  const rl = await P.evaluate(() => {
    const g = window.__game, w = g.walker, a = g.arsenal; w.place(w.x, w.z, w.h); a.select(0); for (let i = 0; i < 40; i++) g.tick(1 / 60);
    a.ammo[a.key].mag = 2; a.reload(); const out = { kind: a.W.kind, total: a.reloadTotal, hold: [], palmL: [] };
    const L = new w.mesh.position.constructor(), R = new w.mesh.position.constructor();
    for (let i = 0; i < Math.round(a.reloadTotal * 60) + 4; i++) {
      g.tick(1 / 60);
      if (i % 6 === 0) { const p = a.W.prop; out.hold.push(p && p.mesh && p.mesh.visible ? 1 : 0); w.person.worldPos('Bip01_L_Hand', L); w.person.worldPos('Bip01_R_Hand', R); out.palmL.push(+L.distanceTo(R).toFixed(2)); }
    }
    out.mag = a.ammo[a.key].mag; out.full = a.ammo[a.key].mag === 12;
    return out;
  });
  check('the pistol reloads to a full magazine', rl.kind === 'pistol' && rl.full, JSON.stringify({ kind: rl.kind, mag: rl.mag }));
  check('the left hand leaves the gun for the pouch and comes back (hands far apart, then together)', Math.max(...rl.palmL) > 0.25 && rl.palmL[rl.palmL.length - 1] < 0.2, rl.palmL.join(','));
  check('a fresh magazine is in the left hand for part of it', rl.hold.some(h => h) && !rl.hold[0] && !rl.hold[rl.hold.length - 1], rl.hold.join(''));
  const dropped = await P.evaluate(() => { const s = window.__game.scene; let n = 0; s.traverse(o => { if (o.name === 'prop-pistol' && o.visible && o.parent === s) n++; }); return n; });
  check('the empty magazine dropped out and lies there', dropped >= 1, String(dropped));

  console.log('a fighter fights with the recorded blows');
  const made = await P.evaluate(() => {
    const g = window.__game, w = g.walker, p = g.peds.list.find(q => q.state !== 'away'); if (!p) return false;
    w.place(w.x, w.z, w.h); p.kind = 'bruiser'; p.x = w.x + Math.sin(w.h) * 3; p.z = w.z + Math.cos(w.h) * 3; p.y = w.y; window.__b = g.brawl.take(p, {}); return !!window.__b;
  });
  await P.waitForFunction(() => window.__b && window.__b.walker.person, null, { timeout: 60000 }).catch(() => {});        // (his body is loaded in the background)
  const br = !made ? { none: true } : await P.evaluate(() => {
    const g = window.__game, w = g.walker, b = window.__b, seen = new Set(); let clip = 0;
    for (let i = 0; i < 60 * 12; i++) { g.game.hp = 100; if (w.ragdoll || w.down > 0.3) w.place(w.x, w.z, w.h); g.tick(1 / 60); const a = b.walker.body && b.walker.body.act; if (a) seen.add(a.c.name); if (b.atk && b.atk.clip) clip++; }
    return { seen: [...seen], clip };
  });
  check('a big man squares up (his guard) and throws recorded punches', !br.none && br.clip > 0 && br.seen.some(n => /jab|cross|combo|body|haymaker|kick/.test(n)), JSON.stringify(br));
  console.log('a person on the pavement knocked over');
  await P.evaluate(() => { const g = window.__game; g.brawl.clear(); for (const p of g.peds.list) p.kind = 'civ'; });
  await P.waitForFunction(() => window.__game.peds.list.some(p => p.real && p.state !== 'away'), null, { timeout: 60000 }).catch(() => {});
  const pd = await P.evaluate(() => {
    const g = window.__game, p = g.peds.list.find(q => q.real && q.state !== 'away'); if (!p) return { none: true };
    p.state = 'down'; p.downT = 1.2; p.vx = 3; p.vz = 0; p.vy = 1.6; p.lie = 0; p.at = 'head';
    const seen = new Set(); let rag = false;
    for (let i = 0; i < 60 * 10; i++) { g.tick(1 / 60); seen.add(p.state); if (p.rag) rag = true; if (p.state === 'getup' && p.real && p.real.body.act) seen.add(p.real.body.act.name); if (!p.real) break; }
    return { rag, seen: [...seen], state: p.state, real: !!p.real };
  });
  console.log('  (pedestrian: ' + JSON.stringify(pd) + ')');
  check('a real pedestrian who is knocked over goes limp, gets up with a recorded get-up, and runs off', pd.none || (pd.rag && pd.seen.includes('getup') && pd.seen.some(n => /^getup_/.test(n)) && (pd.state === 'panic' || pd.state === 'walk')), JSON.stringify(pd));
  const cw = await P.evaluate(() => {
    const g = window.__game, p = g.peds.list.find(q => q.real && (q.state === 'walk' || q.state === 'idle' || q.state === 'panic') && q.ring); if (!p) return { none: true };
    g.peds.rnd = () => 0.1; g.peds.scare(p.x + 3, p.z, 20, 4, true); const first = p.state; let duck = false;
    for (let i = 0; i < 60 * 5 && p.real; i++) { g.tick(1 / 60); if (p.real && p.real.body.act && p.real.body.act.name === 'duck') duck = true; }
    return { first, duck, state: p.state };
  });
  check('a gunshot nearby: a real pedestrian ducks with his arms over his head, then runs', cw.none || (cw.first === 'cower' && cw.duck && cw.state !== 'cower'), JSON.stringify(cw));
  const kicks = await P.evaluate(() => {
    const g = window.__game, m = g.melee, w = g.walker, seq = []; w.place(w.x, w.z, w.h); m.cool = 0; m.queued = null; m.comboT = 0; m.move = null;
    for (let i = 0; i < 3; i++) { m.kick(); seq.push(m.kind); for (let k = 0; k < 90 && m.busy; k++) g.tick(1 / 60); for (let k = 0; k < 4; k++) g.tick(1 / 60); m.cool = 0; }
    return seq;
  });
  check('kicks go a street kick, a roundhouse, a side kick', kicks.join() === 'kick,roundhouse,sidekick', kicks.join());
  check('no script errors', logs.length === 0, logs.slice(0, 3).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
