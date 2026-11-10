// The finish of the rooms you can walk into: a suspended ceiling, soft shadows under the furniture and along the walls, daylight at the door, pools of light under the lamps,
// dust in the air, and the small things on the walls (exit sign, clock, plants, fire extinguisher, smoke detectors). Every room gets them.
import { check, open, step, finish } from './lib.mjs';

try {
  const { page: P, logs } = await open({ w: 480, h: 270 });
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]', { timeout: 240000 });
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 240000 });
  await step(P, 120);
  await P.evaluate(() => { const g = window.__game; g.leaveCar && g.leaveCar(); });
  await step(P, 60);
  for (const kind of ['petrol', 'shop', 'jeweller', 'bank', 'museum']) {
    const r = await P.evaluate(async (kind) => {
      const g = window.__game, w = g.walker; if (g.interior.active) g.leaveVenue(true); g.game.chaseOn && g.endChase(); g.game.wanted = false; g.melee.cool = 0; g.arsenal.holster();
      g.enterVenue({ kind, x: w.x, z: w.z, seed: 5 }, true); g.game.insideT = 5; g.game.noWanted = 1e9;
      const I = g.interior, R = I.room; let ceil = 0, shade = 0, glow = 0, points = 0, emitTris = 0;
      I.group.traverse(o => { if (o.material === I.mats.ceil) ceil += o.geometry.index.count / 3; if (o.material === I.mats.shade) shade += o.geometry.index.count / 3; if (o.material === I.mats.glow) glow += o.geometry.index.count / 3; if (o.isPoints) points += o.geometry.attributes.position.count; if (o.material === I.mats.emit) emitTris += o.geometry.index.count / 3; });
      const p0 = I.dust ? I.dust.points.geometry.attributes.position.array.slice(0, 9) : null; for (let k = 0; k < 90; k++) I.update(1 / 60); const p1 = I.dust.points.geometry.attributes.position.array.slice(0, 9);
      const moved = p0 && p0.some((v, i) => Math.abs(v - p1[i]) > 1e-4);
      let alphaOk = true; I.group.traverse(o => { if (o.material === I.mats.shade || o.material === I.mats.glow) { const c = o.geometry.attributes.color; if (c.itemSize !== 4) alphaOk = false; } });
      const layers = []; I.group.traverse(o => { if (o.layers.mask !== 2) layers.push(o.type); });
      return { ceil, shade, glow, points, moved, alphaOk, layersWrong: layers.length, boxes: R.boxes.length, lights: R.lights.length, floorSSR: !!I.mats.floor.onBeforeCompile };
    }, kind);
    check(kind + ': a suspended ceiling, soft shadows, pools of light and dust', r.ceil > 0 && r.shade > 20 && r.glow > 5 && r.points >= 60 && r.moved && r.alphaOk, JSON.stringify(r));
    check(kind + ': everything of it is on the room\'s own camera layer (so the street is not drawn)', r.layersWrong === 0, JSON.stringify(r));
    await P.evaluate(() => { const g = window.__game; g.leaveVenue(true); });
  }
  const bad = logs.filter(l => !/GPU stall|GL Driver/.test(l));
  check('no script errors', bad.length === 0, bad.slice(0, 3).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
