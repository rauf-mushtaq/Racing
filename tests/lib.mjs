// Shared helpers for the tests: a static server, Chromium with software GL (Low quality), checks and a summary.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
export const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('content-type', TYPES[path.extname(p)] || 'application/octet-stream'); res.setHeader('cache-control', 'no-cache');
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
export const BASE = `http://127.0.0.1:${server.address().port}/`;

export const results = []; export let failed = 0;
export const check = (name, ok, info = '') => { results.push([ok, name, info]); if (!ok) failed++; console.log((ok ? '  ok   ' : '  FAIL ') + name + (info && !ok ? '  -> ' + info : '')); };
const ignorable = t => /Failed to load resource|GPU stall|GL Driver|ReadPixels|Automatic fallback to software WebGL/.test(t);

export const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
export async function open({ debug = true, w = 844, h = 390, touch = false, hasTouch = touch, init = null, ctx } = {}) {
  ctx = ctx || await browser.newContext({ viewport: { width: w, height: h }, hasTouch, isMobile: touch, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('sunsetcity.v1', JSON.stringify({ quality: 'low', renderScale: 0.75 })); } catch (e) { /* private mode */ } });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(); const logs = [], external = [];
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !ignorable(m.text())) logs.push(m.text().slice(0, 240)); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message.slice(0, 300)));
  page.on('response', r => { if (r.status() >= 400 && !/music\/chase\.mp3/.test(r.url())) logs.push(r.status() + ' ' + r.url()); });   // (music/chase.mp3 is optional: put your own there)
  page.on('request', r => { if (!r.url().startsWith(BASE) && !/^(data|blob):/.test(r.url())) external.push(r.url()); });
  await page.goto(BASE + (debug ? 'index.html?debug' : 'index.html'));
  await page.waitForSelector('button[data-m="free"]', { state: 'visible', timeout: 240000 });
  return { page, ctx, logs, external };
}
export const step = (page, n, dt = 1 / 60) => page.evaluate(([n, dt]) => { const g = window.__game, nr = window.__noRender; window.__noRender = true; for (let i = 0; i < n; i++) g.tick(dt); window.__noRender = nr; }, [n, dt]);


export async function finish() {
  await browser.close(); server.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
