// The picture: the High tier (the one with depth of field, ray-traced reflections and light bounce) must start, compile every shader and draw frames with no errors, and the
// new things in it (shader clouds, dust in the air, birds, flowering shrubs, depth of field, the colour grade) must all be there. The Low tier (what the other tests use)
// has none of the post effects, so this is the only test that runs them. It is slow (software rendering of the High tier).
import { check, open, step, finish, browser } from './lib.mjs';

try {
  const init = `try { localStorage.setItem('sunsetcity.v1', JSON.stringify({ quality: 'high', renderScale: 0.75, rt2: 'full', tod: 'golden', todV: 2 })); } catch (e) {}`;
  const { page: P, logs } = await open({ w: 640, h: 360, init });
  await P.evaluate(() => { window.__noRender = true; window.__fixedRes = true; });
  await P.click('button[data-m="free"]', { timeout: 240000 });
  await P.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 240000 });
  await step(P, 120);
  const s = await P.evaluate(() => {
    const g = window.__game; let cloud = null;
    g.scene.traverse(o => { if (o.material && o.material.uniforms && o.material.uniforms.tNoise) cloud = o; });
    return {
      tier: g.Q.name, dof: !!g.dof, motes: !!g.motes, birds: !!g.birds, cloud: !!cloud, cloudTaps: g.Q.cloudTaps,
      grade: !!g.grade && ['uTone', 'uVib', 'uStreak'].every(k => k in g.grade.uniforms),
      depth: !!(g.composer && g.composer.renderTarget1.depthTexture),
    };
  });
  check('the High tier is the one under test', s.tier === 'high', JSON.stringify(s));
  check('the shader cloud layer is in the sky (and the sprite puffs are gone)', s.cloud && s.cloudTaps >= 3, JSON.stringify(s));
  check('dust in the air, birds and depth of field are on', s.motes && s.birds && s.dof && s.depth, JSON.stringify(s));
  check('the colour grade has the split-toning, vibrance and streak controls', s.grade, JSON.stringify(s));
  // Planting and wires: flowering shrubs are instanced where there are bushes, and the power wires are ribbons (a 1-pixel line breaks into dashes on a pixel grid).
  const city = await P.evaluate(() => {
    const g = window.__game, P = g.city.props; let blooms = 0, bushes = 0, lines = 0, wires = 0;
    g.scene.traverse(o => { if (o.isInstancedMesh && o.geometry === P.geo.bushBloom) blooms += o.count; if (o.isInstancedMesh && o.geometry === P.geo.bushCards) bushes += o.count; if (o.isLineSegments && o.material === P.mat.wire) lines++; if (o.isMesh && o.material === P.mat.wire) wires++; });
    return { blooms, bushes, lines, wires, wireMat: P.mat.wire.type, frond: !!P.mat.palmFronds.map };
  });
  check('flowering shrubs are in the city (some, not all, of the bushes)', city.blooms > 0 && city.blooms < city.bushes, JSON.stringify(city));
  check('the power wires are ribbons, not 1-pixel lines', city.lines === 0 && city.wireMat === 'MeshBasicMaterial', JSON.stringify(city));
  // Draw real frames (this compiles every shader), looking at the sky and at the street, and with the lens focused near and far.
  const frames = await P.evaluate(() => {
    const g = window.__game, c = g.car; window.__noRender = false; window.__freeze = true; const out = [];
    for (const cam of [[c.x, 2, c.z, c.x - 26, 22, c.z - 92, 62], [c.x - 9, 2.2, c.z + 14, c.x, 1.0, c.z - 8, 50], [c.x + 3, 1.2, c.z + 5, c.x, 1.0, c.z, 40]]) {
      window.__cam = cam; for (let i = 0; i < 3; i++) g.tick(1 / 60);
      out.push({ focus: g.dof.focus, calls: g.renderer.info.render.calls });
    }
    window.__noRender = true; return out;
  });
  check('three views drew (the lens refocuses between them)', frames.length === 3 && frames.every(f => f.calls > 20) && Math.abs(frames[0].focus - frames[2].focus) > 0.01, JSON.stringify(frames));
  // The guard can turn depth of field off first, and back on.
  const ladder = await P.evaluate(() => window.__game.GPU_LADDER.map(l => l.name));
  check('depth of field is the first thing the performance guard gives up', ladder[0] === 'DEPTH OF FIELD', JSON.stringify(ladder));
  // Every shader program the real frames needed must have linked (a shader that fails to compile draws nothing: a variable named like a reserved word once made every building vanish).
  const progs = await P.evaluate(() => window.__game.renderer.info.programs.map(p => ({ ok: !p.diagnostics || p.diagnostics.runnable !== false, log: p.diagnostics && p.diagnostics.fragmentShader ? String(p.diagnostics.fragmentShader.log || '').slice(0, 200) : '' })));
  check('every shader program compiled and linked (' + progs.length + ' of them)', progs.length > 20 && progs.every(p => p.ok), JSON.stringify(progs.filter(p => !p.ok).slice(0, 2)));
  // And the buildings are really drawn: the facade materials are on meshes and their programs are fine (checked above), with the city built round the car.
  const fac = await P.evaluate(() => { const g = window.__game, M = g.city.mat; let n = 0; g.scene.traverse(o => { if (o.isMesh && [M.glass, M.modern, M.apt, M.brick, M.shop, M.house].includes(o.material) && o.visible) n++; }); return n; });
  check('building facades are in the scene', fac > 10, String(fac));
  const bad = logs.filter(l => /shader|program|GL_|WebGL|THREE\./i.test(l));
  check('no shader or graphics errors at the High tier', bad.length === 0, bad.slice(0, 3).join(' | '));
  check('no script errors', logs.length === 0, logs.slice(0, 4).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
