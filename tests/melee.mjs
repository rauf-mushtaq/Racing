// Hand to hand: a punch, a kick and a knife. Checks the animation really reaches (the fist at the end of the arm in front of the chest, the foot
// up in front at a kick), that the blows land on people (and only people in front), that the keys and the buttons throw them, and that the
// police come for assault (but not for a single scuffle).
import { check, open, step, finish, onlyTheTarget } from './lib.mjs';

try {
  const { page: P, logs } = await open();
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 });
  await step(P, 60);
  await P.evaluate(() => { window.__freeze = true; const h = window.__game.hud, o = h.toast.bind(h); window.__toasts = []; h.toast = (t, sec) => { window.__toasts.push(t); return o(t, sec); }; });      // (only the steps below move the game)
  await P.evaluate(() => { const g = window.__game; g.car.vx = 0; g.car.vz = 0; if (!g.game.onFoot) g.leaveCar(); });
  await step(P, 90);

  console.log('poses');
  const reach = await P.evaluate(() => {
    const g = window.__game, w = g.walker, B = w.rig, T = B.torso.position.constructor, v = new T(), out = {};
    const pos = (bone, local) => { w.mesh.updateMatrixWorld(true); bone.getWorldPosition(v); return local.worldToLocal(v.clone()); };
    for (const [kind, hand, blade, hit] of [['jab', 'left', false, 0.4], ['cross', 'right', false, 0.42], ['slash', 'right', true, 0.4], ['stab', 'right', true, 0.42]]) {
      const sk = hand === 'right' ? 'wristL' : 'wristR';
      w.melee = { kind, k: 0.0, hit, hand, blade }; w.pose(1 / 60); const guard = pos(B[sk], B.torso).z;
      w.melee = { kind, k: hit, hit, hand, blade }; w.pose(1 / 60); const hitP = pos(B[sk], B.torso);
      w.melee = { kind, k: hit * 0.5, hit, hand, blade }; w.pose(1 / 60); const wind = pos(B[sk], B.torso).z;
      out[kind] = { guard, wind, z: hitP.z, y: hitP.y, x: hitP.x };
    }
    w.melee = { kind: 'kick', k: 0.46, hit: 0.46, hand: null, blade: false }; w.pose(1 / 60);
    const hips = pos(B.hips, B.root), foot = pos(B.ankleL, B.root); out.kick = { fz: foot.z, fy: foot.y, hy: hips.y };
    w.melee = { kind: 'kick', k: 0.0, hit: 0.46, hand: null, blade: false }; w.pose(1 / 60); out.kickRest = pos(B.ankleL, B.root).y;
    w.melee = null; w.pose(1 / 60);
    return out;
  });
  for (const k of ['jab', 'cross']) check(`${k}: the fist is thrown out in front of the chest`, reach[k].z > 0.4 && reach[k].z > reach[k].wind + 0.2, JSON.stringify(reach[k]));
  check('the cross lands in front of the right shoulder, the jab the left', reach.cross.x < 0.05 && reach.jab.x > -0.05, `cross x ${reach.cross.x.toFixed(2)}, jab x ${reach.jab.x.toFixed(2)}`);
  check('the stab goes straight out', reach.stab.z > 0.42 && reach.stab.z > reach.stab.guard + 0.1, JSON.stringify(reach.stab));
  check('the slash sweeps across to the left', reach.slash.x > 0.05, JSON.stringify(reach.slash));
  check('the kick: the foot is up and out in front at the moment of the hit', reach.kick.fz > 0.45 && reach.kick.fy > 0.55, JSON.stringify(reach.kick));
  check('the kick starts from the ground', reach.kickRest < 0.2, String(reach.kickRest));

  console.log('blows');
  // A stranger straight ahead of the character, standing still. (The crowd walks on fixed loops round the blocks, so it is the character who is put
  // beside the stranger, dist metres away, with the camera looking at them.)
  await onlyTheTarget(P);                                              // (only the stranger the test sets up can be struck, not a bystander who happens to be in reach: see lib.mjs)
  const put = (dist, ang = 0, i = 0, police = false, reset = true) => P.evaluate(([dist, ang, i, police, reset]) => {
    const g = window.__game, w = g.walker, p = g.peds.list[i]; for (const q of g.peds.list) q.kind = 'civ';             // (a plain citizen: the armed and the big fight back, see brawl.mjs)
    window.__target = i;
    p.state = 'idle'; p.idleT = 99; p.downT = 0; p.panic = 0; p.vx = p.vz = p.vy = 0; p.lie = 0; p.speed = 0; w.noClip = true;
    g.tick(1 / 60);                                                                            // (a stranger who has been knocked about slips back onto the loop they walk on)
    const yaw = g.footCam.yaw, a = yaw + ang;
    w.place(p.x - Math.sin(a) * dist, p.z - Math.cos(a) * dist, yaw); g.footCam.yaw = yaw;
    g.melee.cool = 0; g.melee.queued = null; g.game.noWanted = police ? 0 : 1e9;
    if (reset) { g.game.clock = 1000 + Math.random(); g.game.assaultN = 0; g.game.assaultT = -99; }
    return Math.hypot(p.x - w.x, p.z - w.z);                                                   // (how far the character really is from the stranger)
  }, [dist, ang, i, police, reset]);
  await P.evaluate(() => { const g = window.__game; g.arsenal.clear && g.arsenal.clear(); g.arsenal.holster(); }); await step(P, 30);
  const hit = async (how, ...a) => {                                   // (what happened to the stranger)
    const d = await put(...a); await P.evaluate(() => { window.__struck.length = 0; }); await P.evaluate(how); await step(P, 60);
    return P.evaluate(d => { const p = window.__game.peds.list[0]; return { down: p.state === 'down' || p.lie > 0.1 || p.downT > 0 || (p.state === 'panic'), state: p.state, apart: +d.toFixed(2), struck: window.__struck.slice() }; }, d);
  };
  let r = await hit(() => window.__game.melee.attack('fist'), 1.0);
  check('a punch lands on someone one metre ahead and knocks them down', r.down && r.struck.length === 1, JSON.stringify(r));
  r = await hit(() => window.__game.melee.attack('fist'), 4.0);
  check('a punch at someone four metres away hits nothing', !r.down && r.struck.length === 0, JSON.stringify(r));
  r = await hit(() => window.__game.melee.attack('fist'), 1.0, Math.PI);
  check('and someone standing behind is not hit', !r.down && r.struck.length === 0, JSON.stringify(r));
  r = await hit(() => window.__game.melee.kick(), 1.5);
  check('a kick reaches further than a punch (1.5 m)', r.down && r.struck.length === 1, JSON.stringify(r));
  const combo = await P.evaluate(async () => {
    const g = window.__game, m = g.melee, seq = []; m.cool = 0; m.queued = null; m.next.fist = 'jab';
    for (let i = 0; i < 3; i++) { m.attack('fist'); seq.push(m.kind); for (let k = 0; k < 40 && m.busy; k++) g.tick(1 / 60); for (let k = 0; k < 8; k++) g.tick(1 / 60); }
    return seq;
  });
  check('punches alternate jab, cross, jab', combo.join() === 'jab,cross,jab', combo.join());
  // A press near the end of a blow is kept and thrown next.
  const queued = await P.evaluate(() => { const g = window.__game, m = g.melee; m.cool = 0; m.next.fist = 'jab'; m.attack('fist'); for (let i = 0; i < 12; i++) g.tick(1 / 60); const q = m.attack('fist'); const had = m.queued; for (let i = 0; i < 60; i++) g.tick(1 / 60); return { q, had, swung: m.swung }; });
  check('a press in the last half of a blow is queued and thrown next', queued.had === 'fist' && !queued.q, JSON.stringify(queued));

  console.log('knife and keys');
  await P.keyboard.press('Digit5'); await step(P, 40);
  const kn = await P.evaluate(() => { const a = window.__game.arsenal; return { key: a.key, hud: a.hud.melee, drawn: a.hud.drawn }; });
  check('digit 5 draws the knife (and shows no crosshair)', kn.key === 'knife' && kn.hud && !kn.drawn, JSON.stringify(kn));
  await put(1.0); await P.evaluate(() => { const m = window.__game.melee; m.cool = 0; m.next.knife = 'slash'; });
  const n1 = await P.evaluate(() => window.__game.melee.swung);
  await P.keyboard.down('KeyX'); await step(P, 100); await P.keyboard.up('KeyX');
  const ks = await P.evaluate(n1 => { const g = window.__game, m = g.melee; return { swung: m.swung - n1, landed: m.landed, kind: m.kind, blade: m.move ? m.move.blade : null, down: g.peds.list[0].state === 'down' || g.peds.list[0].downT > 0 || g.peds.list[0].lie > 0.1 }; }, n1);
  check('holding X with the knife slashes and stabs again and again', ks.swung >= 3, JSON.stringify(ks));
  const seq = await P.evaluate(() => { const g = window.__game, m = g.melee, s = []; for (let k = 0; k < 90 && (m.busy || m.queued); k++) { m.queued = null; g.tick(1 / 60); } m.cool = 0; m.comboT = 0; m.queued = null; m.next.knife = 'slash'; for (let i = 0; i < 3; i++) { m.attack('knife'); s.push(m.kind); for (let k = 0; k < 50 && m.busy; k++) g.tick(1 / 60); for (let k = 0; k < 8; k++) g.tick(1 / 60); } return s; });
  check('the knife goes slash, stab, slash', seq.join() === 'slash,stab,slash', seq.join());
  await P.keyboard.press('Digit0'); await step(P, 40);
  const n2 = await P.evaluate(() => { const m = window.__game.melee; m.cool = 0; m.queued = null; return m.swung; });
  await P.keyboard.press('KeyZ'); await step(P, 10);
  check('Z kicks', await P.evaluate(n2 => window.__game.melee.swung > n2 && window.__game.melee.kind === 'kick', n2));
  await step(P, 60);
  const n3 = await P.evaluate(() => { const m = window.__game.melee; m.cool = 0; m.queued = null; return m.swung; });
  await P.keyboard.down('KeyX'); await step(P, 6); await P.keyboard.up('KeyX');
  check('X with nothing in hand throws a punch', await P.evaluate(n3 => window.__game.melee.swung > n3 && /jab|cross/.test(window.__game.melee.kind), n3));

  console.log('the police');
  await step(P, 90);
  await P.evaluate(() => { const g = window.__game; g.endChase(); g.game.chaseOn = false; g.game.wanted = false; g.game.noWanted = 0; g.game.assaultN = 0; g.game.assaultT = -99; g.melee.cool = 0; g.melee.queued = null; });
  await put(1.0, 0, 0, true); await P.evaluate(() => window.__game.melee.attack('fist')); await step(P, 40);
  const one = await P.evaluate(() => { const g = window.__game; return { landed: g.melee.landed, N: g.game.assaultN, p0: g.peds.list[0].state }; });
  check('one punch on a stranger is a scuffle: no police, but it is counted', !(await P.evaluate(() => window.__game.game.chaseOn)) && one.N === 1, JSON.stringify(one));
  await put(1.0, 0, 1, true, false); await P.evaluate(() => { window.__game.melee.cool = 0; window.__game.melee.next.fist = 'jab'; window.__game.melee.attack('fist'); }); await step(P, 40);
  check('a second one within half a minute is assault: the police come', await P.evaluate(() => window.__game.game.chaseOn && window.__game.game.wanted), await P.evaluate(() => { const g = window.__game; return JSON.stringify({ landed: g.melee.landed, N: g.game.assaultN, T: g.game.assaultT, clock: g.game.clock, chase: g.game.chaseOn, wanted: g.game.wanted, nw: g.game.noWanted, state: g.game.state, route: g.game.route }); }));
  const t = await P.evaluate(() => window.__toasts.join(' | '));
  check('and the game says why', /ASSAULT/.test(t), t);

  console.log('touch button');
  const cx = await P.evaluate(() => { const r = document.getElementById('t-kick').getBoundingClientRect(); return { w: r.width, h: r.height }; });
  check('there is a KICK button in the page', cx.w >= 0);
  check('no script errors', logs.length === 0, logs.slice(0, 3).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
