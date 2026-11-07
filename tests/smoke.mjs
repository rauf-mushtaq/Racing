// Smoke tests for the web game. Run:  npm install && npx playwright install chromium && npm test
//  1. needs nothing from the internet and has no script errors,  2. keeps working offline through the service worker,
//  3. hides its debug hooks unless ?debug is in the address,      4. plays: walk, draw a weapon, shoot, get wanted.
// (tests/input.mjs covers real touch, mouse and gamepad input.)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, BASE, browser, check, open, step, finish } from './lib.mjs';

try {
  // ---- 0. the precache list names every file the game ships
  console.log('files');
  {
    const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name).split(path.sep).join('/')]);
    const listed = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'precache.json'), 'utf8')).files);
    const missing = [...walk('src'), ...walk('assets').filter(f => /\.(glb|hdr|wasm)$/.test(f))].filter(f => !listed.has(f));
    check('precache.json is current (run: node tools/gen-precache.js)', missing.length === 0, missing.slice(0, 5).join(', '));
    const gone = [...listed].filter(f => !fs.existsSync(path.join(ROOT, f)));
    check('precache.json lists only files that exist', gone.length === 0, gone.slice(0, 5).join(', '));
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    check('index.html loads nothing from another site', !/https?:\/\/(cdn|fonts)\./.test(html));
  }

  // ---- 1. start up
  console.log('start-up');
  const A = await open();
  check('menu appears', true);
  check('no requests to other sites', A.external.length === 0, A.external.slice(0, 3).join(', '));
  check('no script errors while loading', A.logs.length === 0, A.logs.slice(0, 3).join(' | '));
  check('debug hooks present with ?debug', await A.page.evaluate(() => typeof window.__game === 'object'));
  const B = await open({ debug: false });
  check('debug hooks absent without ?debug', await B.page.evaluate(() => typeof window.__game === 'undefined'));
  await B.ctx.close();

  // ---- menus
  console.log('menus');
  for (const m of ['events', 'chase', 'garage', 'settings', 'controls']) {
    await A.page.click(`button[data-m="${m}"]`);
    const shown = await A.page.evaluate(() => { const p = document.getElementById('panel'); return !p.classList.contains('hidden') && p.textContent.trim().length > 40; });
    check(`menu: ${m} panel opens`, shown);
  }
  const garageText = await A.page.evaluate(() => { document.querySelector('button[data-m="garage"]').click(); return document.getElementById('panel').textContent; });
  check('garage does not claim a made-up car (the model is a real Ferrari 458)', !/made-up/i.test(garageText), garageText.slice(0, 120));
  check('no script errors in the menus', A.logs.length === 0, A.logs.slice(0, 3).join(' | '));

  // ---- 2. playing
  console.log('play');
  const P = A.page;
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 });
  await step(P, 60);
  const drove = await P.evaluate(() => { const g = window.__game; g.simulate(2, { throttle: 1, gas: 1 }); return g.car.speed; });
  check('car accelerates', drove > 3, 'speed ' + drove);
  await P.evaluate(() => { const g = window.__game; if (g.game.onFoot) { g.game.onFoot = false; g.walker.show(false); g.setState('free'); } g.game.camMode = 0; }); await step(P, 5);
  const seat1 = await P.evaluate(async () => { const g = window.__game; for (let i = 0; i < 400 && !g.seated.ready; i++) await new Promise(r => setTimeout(r, 50)); window.__game.tick(1 / 60); return { ready: g.seated.ready, vis: g.seated.root.visible, host: g.seated.host === g.carMesh }; });
  check('a driver sits in the car in the chase camera view', seat1.ready && seat1.vis && seat1.host, JSON.stringify(seat1));
  await P.evaluate(() => { window.__game.game.camMode = 2; }); await step(P, 3);
  check('and is hidden in the driver\'s-eye view', !(await P.evaluate(() => window.__game.seated.root.visible)));
  await P.evaluate(() => { window.__game.game.camMode = 0; });
  await P.evaluate(() => { const g = window.__game; g.car.vx = 0; g.car.vz = 0; g.leaveCar(); });
  await step(P, 90);
  const foot = await P.evaluate(() => { const g = window.__game; return { onFoot: !!g.game.onFoot, shown: g.walker.visible !== false }; });
  check('player gets out of the car and stands on foot', foot.onFoot);
  check('the driver is not left in the empty car', !(await P.evaluate(() => { window.__game.tick(1 / 60); return window.__game.seated.root.visible; })));
  const w0 = await P.evaluate(() => { const w = window.__game.walker; return [w.x, w.z]; });
  await P.keyboard.down('KeyW'); await step(P, 90); await P.keyboard.up('KeyW');
  const w1 = await P.evaluate(() => { const w = window.__game.walker; return [w.x, w.z]; });
  check('player walks forward on W', Math.hypot(w1[0] - w0[0], w1[1] - w0[1]) > 1.5, JSON.stringify([w0, w1]));
  await P.keyboard.press('Digit1'); await step(P, 40);
  const wp = await P.evaluate(() => window.__game.arsenal.key);
  check('digit 1 draws the pistol', wp === 'pistol', String(wp));
  const ammo0 = await P.evaluate(() => window.__game.arsenal.hud.mag);
  await P.keyboard.down('KeyX'); await step(P, 6); await P.keyboard.up('KeyX');
  const ammo1 = await P.evaluate(() => window.__game.arsenal.hud.mag);
  check('X fires a round', ammo1 < ammo0, `${ammo0} -> ${ammo1}`);
  await P.evaluate(() => { const g = window.__game; g.startWanted('gun'); });
  await P.evaluate(() => { const g = window.__game; g.officers.prepare && g.officers.prepare(); });
  await P.waitForFunction(() => !window.__game.officers.prepare || window.__game.officers.ready, null, { timeout: 120000 }).catch(() => {});
  await step(P, 60 * 25);
  const off = await P.evaluate(() => { const g = window.__game; return { chase: g.game.chaseOn, cops: g.police.cops.length, officers: g.officers.list.length, living: g.officers.living, ended: g.game.state }; });
  check('police arrive when wanted', off.chase && off.cops > 0, JSON.stringify(off));
  const lad = await P.evaluate(() => {
    const g = window.__game, d0 = g.Q.detailR, cap0 = g.officers.cap, full = g.officers.fullCap, n0 = g.peds.count ?? null;
    for (let i = 1; i <= g.GPU_LADDER.length; i++) { g.guard.gpu = i; g.applyGuard('gpu-down'); }
    for (let i = 1; i <= g.CPU_LADDER.length; i++) { g.guard.cpu = i; g.applyGuard('cpu-down'); }
    const down = { detail: g.Q.detailR, cap: g.officers.cap };
    for (let i = g.CPU_LADDER.length - 1; i >= 0; i--) { g.guard.cpu = i; g.applyGuard('up:cpu'); }
    for (let i = g.GPU_LADDER.length - 1; i >= 0; i--) { g.guard.gpu = i; g.applyGuard('up:gpu'); }
    g.guard.gpu = g.guard.cpu = 0;
    return { d0, cap0, full, down, up: { detail: g.Q.detailR, cap: g.officers.cap } };
  });
  check('the performance guard steps effects down and brings them back', lad.down.detail < lad.d0 && lad.down.cap < lad.full && lad.up.detail === lad.d0 && lad.up.cap === lad.full, JSON.stringify(lad));
  await step(P, 120);
  check('no script errors while playing', A.logs.length === 0, A.logs.slice(0, 3).join(' | '));

  // ---- 3. offline: after one visit the service worker has every file
  console.log('offline');
  {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('sunsetcity.v1', JSON.stringify({ quality: 'low', renderScale: 0.75 })); } catch (e) { /* private mode */ } });
    const page = await ctx.newPage();
    await page.goto(BASE + 'index.html');
    await page.waitForSelector('button[data-m="free"]', { state: 'visible', timeout: 240000 });
    const done = await page.evaluate(() => new Promise(res => {
      navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'precache-done') res(e.data.total); });
      navigator.serviceWorker.ready.then(r => setTimeout(() => r.active.postMessage({ type: 'precache' }), 100));
      setTimeout(() => res(0), 120000);
    }));
    check('service worker cached every file', done > 90, 'files ' + done);
    await ctx.setOffline(true);
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.reload();
    await page.waitForSelector('button[data-m="free"]', { state: 'visible', timeout: 240000 }).then(() => check('game starts with no network', true), e => check('game starts with no network', false, e.message.slice(0, 120)));
    check('no script errors offline', errs.length === 0, errs.join(' | ').slice(0, 200));
    await ctx.close();
  }
} catch (e) {
  check('suite ran to the end', false, e.stack || String(e));
}
await finish();
