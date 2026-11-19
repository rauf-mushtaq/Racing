// The car dealership (venues.js 'dealer', rooms-visit.js dealer, dealer.js; the cars: marques.js, marque-specs.js): it stands on the boulevard by the start
// with cars on its forecourt; inside, seven cars on their stands; at a car the prompt names it and its price, the use button opens its card; without the
// money it cannot be bought, with it the price is taken and the car is yours; DRIVE IT OUT puts you in it in the kerb lane outside, pointing the way the
// traffic goes, and it drives with its own physics; it is your own car (not a stolen one), it is still yours after a reload, and in the Garage you can go
// back to the Vento. Every car builds, and the quick ones are quicker than the heavy ones.
import { check, open, step, finish } from './lib.mjs';

try {
  // (lib.mjs's own start-up script resets the settings on every load: what this test bought is put back from the session before a reload)
  const { page: P, logs } = await open({ init: () => { try { const k = 'sunsetcity.v1', keep = sessionStorage.getItem('dealer-keep'); if (keep) localStorage.setItem(k, keep); else { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.cash = 100000; localStorage.setItem(k, JSON.stringify(s)); } } catch (e) { /* private mode */ } } });
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]');
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 });
  await step(P, 40);
  await P.evaluate(() => { window.__freeze = true; const g = window.__game; g.car.vx = 0; g.car.vz = 0; if (!g.game.onFoot) g.leaveCar(); });
  await step(P, 30);

  console.log('outside');
  const out = await P.evaluate(async () => {
    const g = window.__game, V = await import('./src/venues.js'), d = [...V.VENUES.values()].find(v => v.kind === 'dealer');
    if (!d) return null; g.dealer.updateStreet(g.walker.x, g.walker.z);
    const list = g.dealer.street.get(d.id) || [];
    return { d: { x: d.x, z: d.z, dx: d.dx, dz: d.dz, show: d.show.length, handover: d.handover }, fromStart: Math.hypot(d.x - g.walker.x, d.z - g.walker.z), forecourt: list.length, shown: list.filter(m => m.visible && m.parent).length, marques: list.map(m => m.userData.marque) };
  });
  check('the dealership stands on the boulevard by the start, with cars on show on its forecourt', !!out && out.fromStart < 80 && out.forecourt >= 2 && out.shown === out.forecourt, JSON.stringify(out));
  const door = await P.evaluate(d => { const g = window.__game, w = g.walker; w.place(d.x - d.dx * 0.5, d.z - d.dz * 0.5, Math.atan2(-d.dx, -d.dz)); g.tick(1 / 60); return document.getElementById('prompt-txt').textContent; }, out.d);
  check('at its door the prompt says ENTER SUNSET MOTORS', door === 'ENTER SUNSET MOTORS', door);
  await P.keyboard.press('KeyF'); await step(P, 3); await P.waitForTimeout(500); await step(P, 40);
  const inn = await P.evaluate(() => { const g = window.__game, R = g.interior.room; return { inside: g.game.inside && g.game.inside.kind, cars: g.dealer.cars.map(c => c.id), meshes: g.dealer.cars.filter(c => c.mesh.parent === g.interior.group).length, people: g.visit.people.length, area: R.W * R.D, heist: g.heist.active }; });
  check('inside: a showroom of over 2,500 square metres with seven cars on their stands and people about (no robbery)', inn.inside === 'dealer' && inn.cars.length === 7 && inn.meshes === 7 && inn.people >= 8 && inn.area >= 2500 && !inn.heist, JSON.stringify(inn));

  console.log('a card');
  const at = await P.evaluate(() => { const g = window.__game, c = g.dealer.cars.find(c => c.id === 'r9turbo'), w = g.walker; w.place(c.x + (c.r + 0.6), c.z, -Math.PI / 2); for (let i = 0; i < 4; i++) g.tick(1 / 60); return { near: g.dealer.near && g.dealer.near.id, prompt: document.getElementById('prompt-txt').textContent }; });
  check('at a car the prompt names it and its price', at.near === 'r9turbo' && /FALKNER R9 TURBO\s+\$168,000/.test(at.prompt), JSON.stringify(at));
  await P.keyboard.press('KeyF'); await step(P, 2);
  const card = await P.evaluate(() => { const el = document.getElementById('carmenu'); return { open: !!el && !el.classList.contains('hidden'), text: el ? el.textContent.replace(/\s+/g, ' ') : '', disabled: el ? !!el.querySelector('[data-buy][disabled]') : null, swatches: el ? el.querySelectorAll('[data-p]').length : 0 }; });
  check('the use button opens its card: the car, its figures, six paints, and with $100,000 it cannot be bought', card.open && /R9 TURBO/.test(card.text) && /0 to 100 km\/h/.test(card.text) && /top speed/.test(card.text) && card.swatches === 6 && card.disabled && /YOU NEED \$68,000 MORE/.test(card.text), JSON.stringify(card).slice(0, 400));
  await P.keyboard.press('Enter'); await step(P, 2);
  const still = await P.evaluate(() => { const S = window.__game.settings; return { cash: S.cash, garage: S.garage || null }; });
  check('and trying anyway takes nothing', still.cash === 100000 && !still.garage, JSON.stringify(still));
  const painted = await P.evaluate(() => { const g = window.__game; g.settings.cash = 400000; const m = g.dealer.stands.get('r9turbo'); const before = m.userData.paint.color.getHex(); document.querySelector('#carmenu [data-p="red"]').click(); g.tick(1 / 60); return { before, after: m.userData.paint.color.getHex(), choice: g.dealer.choice, enabled: !document.querySelector('#carmenu [data-buy][disabled]') }; });
  check('choosing a paint paints the car on its stand', painted.before !== painted.after && painted.after === 0xb0121a && painted.choice === 'red', JSON.stringify(painted));
  await P.keyboard.press('Enter'); await step(P, 3);
  const bought = await P.evaluate(() => { const S = window.__game.settings, el = document.getElementById('carmenu'); const t = el.textContent.replace(/\s+/g, ' '); return { cash: S.cash, garage: S.garage, own: /YOU OWN THIS CAR/.test(t), drive: /DRIVE IT OUT/.test(t) }; });
  check('with the money the price is taken and the car is yours, in the paint you chose', bought.cash === 400000 - 168000 && bought.garage && bought.garage.r9turbo && bought.garage.r9turbo.paint === 'red' && bought.own && bought.drive, JSON.stringify(bought));

  console.log('drive it out');
  await P.keyboard.press('Enter'); await step(P, 3); await P.waitForTimeout(600); await step(P, 20);
  const drive = await P.evaluate(() => { const g = window.__game, ud = g.carMesh.userData, H = g.game.inside; return { inside: !!g.game.inside, onFoot: g.game.onFoot, marque: ud.marque, heroIsIt: g.heroMesh === g.carMesh, mass: g.car.s.mass, model: g.car.s.model, x: g.car.x, z: g.car.z, h: g.car.h, red: ud.paint.color.getHex(), my: g.settings.myCar, vento: g.ventoMesh.visible }; });
  check('DRIVE IT OUT: out of the showroom and at the wheel of the R9, in red, with its own physics', !drive.inside && !drive.onFoot && drive.marque === 'r9turbo' && drive.heroIsIt && drive.model === 'r9turbo' && drive.mass === 1640 && drive.red === 0xb0121a && drive.my === 'r9turbo' && !drive.vento, JSON.stringify(drive));
  check('in the kerb lane in front of the dealership, pointing the way the traffic there goes', Math.abs(drive.x - out.d.handover.x) < 1.6 && Math.abs(drive.z - out.d.handover.z) < 1.6 && Math.cos(drive.h - out.d.handover.h) > 0.99, JSON.stringify({ drive, handover: out.d.handover }));
  const run = await P.evaluate(() => { const g = window.__game, k = g.input.keys, x0 = g.car.x, z0 = g.car.z; g.traffic.setDensity('off', g.car); k.add('KeyW'); for (let i = 0; i < 60 * 4; i++) g.tick(1 / 60); k.delete('KeyW'); const r = { kmh: g.car.speed * 3.6, d: Math.hypot(g.car.x - x0, g.car.z - z0), stolen: g.stolen(), home: g.isHome() }; for (let i = 0; i < 60 * 4; i++) g.tick(1 / 60); return r; });
  check('it drives away (over 90 km/h in four seconds), and it is your own car, not a stolen one', run.kmh > 90 && run.d > 40 && !run.stolen && run.home, JSON.stringify(run));

  console.log('every car');
  const all = await P.evaluate(async () => {
    const M = await import('./src/marques.js'), S = await import('./src/marque-specs.js'), D = await import('./src/dealer.js'), out = {};
    for (const c of S.CARS) {
      let err = null, n = 0, wheels = 0, cockpit = false, disp = 0;
      try { const m = M.makeMarque(c.id, c.paints[1]); m.traverse(o => { if (o.isMesh) n++; }); wheels = m.userData.wheels.length; cockpit = !!(m.userData.cockpit && m.userData.cockpit.seat); M.disposeMarque(m); const d = M.makeMarque(c.id, c.paints[0], { display: true }); d.traverse(o => { if (o.isMesh) disp++; }); M.disposeMarque(d); } catch (e) { err = String(e.stack || e).slice(0, 200); }
      out[c.id] = { err, n, disp, wheels, cockpit, ...D.carPerf(c.id) };
    }
    return out;
  });
  check('all seven cars build, to drive (four wheels, a cockpit with a seat) and to show', Object.values(all).every(c => !c.err && c.wheels === 4 && c.cockpit && c.n > 20 && c.disp > 10 && c.disp < c.n), JSON.stringify(all));
  check('the hypercar is the quickest (to 100 km/h and flat out, over 400), the limousine and the off-roader the slowest', all.vitesse.s100 < all.r9turbo.s100 && all.vitesse.kmh > 400 && Object.values(all).every(c => c.kmh <= all.vitesse.kmh) && all.sovereign.s100 > all.halcyon.s100 + 1 && all.bergwagen.s100 > all.furia.s100 + 1 && Object.values(all).every(c => c.s100 > 2 && c.s100 < 7), JSON.stringify(Object.fromEntries(Object.entries(all).map(([k, v]) => [k, [v.s100.toFixed(2), v.kmh]]))));

  console.log('after a reload');
  await P.evaluate(() => sessionStorage.setItem('dealer-keep', localStorage.getItem('sunsetcity.v1')));
  await P.reload(); await P.waitForSelector('button[data-m="free"]', { state: 'visible', timeout: 240000 });
  await P.evaluate(() => { window.__noRender = true; });
  const kept = await P.evaluate(() => { const g = window.__game; return { marque: g.heroMesh.userData.marque, car: g.carMesh === g.heroMesh, model: g.car.s.model, cash: g.settings.cash }; });
  check('after a reload the R9 is still yours and still the car you drive', kept.marque === 'r9turbo' && kept.car && kept.model === 'r9turbo' && kept.cash === 400000 - 168000, JSON.stringify(kept));
  await P.click('button[data-m="garage"]'); await P.waitForTimeout(300);
  const gar = await P.evaluate(() => { const b = [...document.querySelectorAll('#panel [data-car]')].map(x => x.textContent); return b; });
  await P.evaluate(() => document.querySelector('#panel [data-car="vento"]').click()); await P.waitForTimeout(200);
  const back = await P.evaluate(() => { const g = window.__game; return { vento: g.heroMesh === g.ventoMesh, car: g.carMesh === g.ventoMesh, model: g.car.s.model || 'vento', my: g.settings.myCar, mass: g.car.s.mass }; });
  check('the Garage lists your cars, and choosing the Vento puts you back in it', gar.length === 2 && gar.includes('VENTO SV') && gar.includes('FALKNER R9 TURBO') && back.vento && back.car && back.my === 'vento' && back.mass === 1650, JSON.stringify({ gar, back }));
  check('no script errors', logs.length === 0, logs.slice(0, 3).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
