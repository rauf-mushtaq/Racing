// Water: the sea knows how deep it is (a vertex attribute made from the same height function the land is built from), and swimming pools stand in the gardens of houses (solid,
// with their water above the floor). The pictures of the sea's shader (foam, shallows, glitter) are in graphics.mjs's compile check, which draws it at the High tier.
import { check, open, step, finish } from './lib.mjs';

try {
  const { page: P, logs } = await open({ w: 480, h: 270 });
  await P.evaluate(() => { window.__noRender = true; });
  await P.click('button[data-m="free"]', { timeout: 240000 });
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 240000 });
  await step(P, 120);
  const sea = await P.evaluate(async () => {
    const g = window.__game, { heightAt, SEA_Y } = await import('/src/world.js'); let mesh = null;
    g.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.attributes.aDepth) mesh = o; });
    if (!mesh) return null;
    const p = mesh.geometry.attributes.position, d = mesh.geometry.attributes.aDepth; let far = 0, land = 0, bad = 0, n = 0, deep = 0, shallow = 0;
    for (let k = 0; k < p.count; k += 37) { const x = p.getX(k), z = p.getZ(k); n++; if (x < -9000) { far = Math.max(far, d.getX(k)); } if (x > -2900 && x < -2700) land += d.getX(k) < 0 ? 1 : 0;
      if (x > -3500 && x > -14000) { const want = SEA_Y - heightAt(x, z), got = d.getX(k); if (Math.abs(want - got) > 0.05 && x > -5600) bad++; } if (d.getX(k) > 20) deep++; if (d.getX(k) > 0 && d.getX(k) < 1) shallow++; }
    return { n, far, land, bad, deep, shallow, y: mesh.position.y, SEA_Y, verts: p.count, type: mesh.material.type };
  });
  check('the sea is a grid that carries its own depth', !!sea && sea.verts > 5000 && sea.type === 'MeshStandardMaterial', JSON.stringify(sea));
  check('the sea is 30 m deep far out and the land to the east of it is dry', sea && sea.far > 30 && sea.land > 5, JSON.stringify(sea));
  check('the depth is what the land\'s own height function says (no gap between the sea and the sand)', sea && sea.bad === 0, JSON.stringify(sea));
  check('there are shallows (a gentle beach) as well as deep water', sea && sea.deep > 100 && sea.shallow > 5, JSON.stringify(sea));
  check('the sea sits at sea level', sea && Math.abs(sea.y - sea.SEA_Y) < 1e-6, JSON.stringify(sea));

  // Pools: go to the suburbs and let the houses be built.
  await P.evaluate(() => { const g = window.__game; g.leaveCar && g.leaveCar(); g.walker.place(1750, 150, 0); g.car.x = 1750; g.car.z = 150; });
  for (let i = 0; i < 60; i++) { await step(P, 40); if (await P.evaluate(() => !window.__game.city.job)) { await step(P, 20); if (await P.evaluate(() => !window.__game.city.job)) break; } }
  const pools = await P.evaluate(async () => {
    const { POOLS } = await import('/src/pools.js'), g = window.__game; let water = 0, basin = 0, up = 0, nWater = 0;
    g.scene.traverse(o => { if (o.isMesh && o.material === g.city.mat.water) { nWater++; const pos = o.geometry.attributes.position, nrm = o.geometry.attributes.normal; let ok = true; for (let k = 0; k < pos.count; k++) if (nrm.getY(k) < 0.99) ok = false; if (ok) up++; water += pos.count; } if (o.isMesh && o.material === g.city.mat.pool) basin += o.geometry.attributes.position.count; });
    const sizes = POOLS.map(p => [Math.abs(p.x1 - p.x0), Math.abs(p.z1 - p.z0)]), okSize = sizes.every(([a, b]) => Math.min(a, b) >= 3.5 && Math.max(a, b) >= 6.9 && Math.max(a, b) <= 13.2 && Math.min(a, b) <= 5.7);
    // The nearest pool to the player: stand in the middle of it and see whether it is solid.
    const c = g.walker, list = POOLS.slice().sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z)), p = list[0]; let pushedOut = false;
    if (p) { g.walker.place(p.x, p.z, 0); for (let k = 0; k < 6; k++) g.tick(1 / 60); const w = g.walker; pushedOut = w.x < p.x0 - 0.05 || w.x > p.x1 + 0.05 || w.z < p.z0 - 0.05 || w.z > p.z1 + 0.05; }
    return { count: POOLS.length, nWater, up, water, basin, okSize, pushedOut };
  });
  check('houses have swimming pools (dozens across the suburbs)', pools.count >= 8, JSON.stringify(pools));
  check('every pool is a sensible size (a garden pool about 3.5 to 4.8 m by 7 to 9.5 m, the resort\'s 13 by 5.6)', pools.okSize, JSON.stringify(pools));
  check('the water is made of upward-facing sheets (and there are basins to hold it)', pools.nWater > 0 && pools.up === pools.nWater && pools.basin > 0, JSON.stringify(pools));
  check('a pool is solid: you cannot stand in the middle of it', pools.pushedOut, JSON.stringify(pools));
  const bad = logs.filter(l => !/GPU stall|GL Driver/.test(l));
  check('no script errors', bad.length === 0, bad.slice(0, 3).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
