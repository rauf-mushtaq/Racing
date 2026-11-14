// A look at the files tools/unreal-import/run.mjs made, drawn by three.js on their own (not the web game): node tools/unreal-import/look.mjs <folder for the pictures>
// look_walk.png (standing, walking, running), look_fight.png (the blows, aiming, hands up, staggering), look_down.png (falling, and more people), look_cars.png.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium } from 'playwright';
const ROOT = '/home/user/racing', OUT = process.argv[2];
const server = http.createServer((q, r) => { const p = path.join(ROOT, new URL(q.url, 'http://x').pathname); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream'); fs.createReadStream(p).pipe(r); });
await new Promise(r => server.listen(0, r));
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
pg.on('pageerror', e => console.log('ERR', e.message));
await pg.goto(`http://127.0.0.1:${server.address().port}/tools/unreal-import/look.html`); await pg.waitForFunction(() => window.ready);
const P = 'unreal/Import/people/';
const shots = {
  walk: [[P + 'agent.glb', 'SC_idle', 0], [P + 'agent.glb', 'SC_walk', 0], [P + 'agent.glb', 'SC_walk', 0.25], [P + 'agent.glb', 'SC_walk', 0.5], [P + 'ped_f1.glb', 'SC_run', 0.3], [P + 'cop_blue.glb', 'SC_sprint', 0.3], [P + 'street.glb', 'SC_jog', 0.6]],
  fight: [[P + 'agent.glb', 'SC_jab', 0.42, 0.6], [P + 'agent.glb', 'SC_cross', 0.45, 0.6], [P + 'tee.glb', 'SC_hook', 0.58, 0.6], [P + 'leather.glb', 'SC_kick', 0.45, 1.2], [P + 'cop_black.glb', 'SC_aim', 0.3, 0.6], [P + 'ped_m2.glb', 'SC_handsup', 0.3], [P + 'denim.glb', 'SC_stagger', 0.5, 1.4]],
  down: [[P + 'ped_m1.glb', 'SC_down', 0.0, 1.57], [P + 'ped_m1.glb', 'SC_down', 0.5, 1.57], [P + 'ped_m1.glb', 'SC_down', 1.0, 1.57], [P + 'cop_swat.glb', 'SC_idle', 0.5], [P + 'ped_f3.glb', 'SC_walk', 0.6], [P + 'hoodie.glb', 'SC_idle', 0.2], [P + 'cop_vest.glb', 'SC_walk', 0.1]],
};
for (const [n, items] of Object.entries(shots)) { await pg.evaluate(i => window.show(i), items); await pg.screenshot({ path: `${OUT}/look_${n}.png` }); }
await pg.evaluate(() => window.cam(5.5, 2.2, 7.5, 0, 0.6, 0));
await pg.evaluate(() => window.show([['unreal/Import/cars/ferrari_body.glb'], ['unreal/Import/cars/police_body.glb'], ['unreal/Import/cars/ferrari_wheel_left.glb'], ['unreal/Import/cars/police_wheel_right.glb']]));
await pg.screenshot({ path: `${OUT}/look_cars.png` });
await b.close(); server.close(); console.log('done');
