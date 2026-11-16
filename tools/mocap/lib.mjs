// Shared by tools/mocap/build.mjs and look.mjs: a static server for the repository, the browser page, and the CMU files (downloaded once into tools/mocap/cache).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE = process.env.MOCAP_CACHE || path.join(ROOT, 'tools', 'mocap', 'cache');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.bvh': 'text/plain' };

// The CMU Graphics Lab Motion Capture Database, as converted to BVH by Bruce Hahne (cgspeed), from the copy at github.com/una-dinosauria/cmu-mocap.
export async function bvh(name) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, name + '.bvh');
  if (!fs.existsSync(f)) {
    const subj = String(parseInt(name.split('_')[0], 10)).padStart(3, '0'), url = `https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/${subj}/${name}.bvh`;
    const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`);
    fs.writeFileSync(f + '.part', Buffer.from(await r.arrayBuffer())); fs.renameSync(f + '.part', f);
  }
  return fs.readFileSync(f, 'utf8');
}

export async function open() {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('content-type', TYPES[path.extname(p)] || 'application/octet-stream'); fs.createReadStream(p).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1800, height: 420 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('  [page] ' + m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/tools/mocap/page.html`);
  await page.waitForFunction(() => window.ready === true || window.failed, null, { timeout: 120000 });
  const failed = await page.evaluate(() => window.failed); if (failed) throw new Error(failed);
  const loaded = new Set();
  return {
    page, errors,
    async load(name) { if (loaded.has(name)) return null; const text = await bvh(name); const r = await page.evaluate(([n, t]) => window.load(n, t), [name, text]); loaded.add(name); return r; },
    async close() { await browser.close(); server.close(); },
  };
}
