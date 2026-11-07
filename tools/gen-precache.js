// Writes precache.json: every file the game can ask for, so the service worker can cache the lot and the game plays offline.
// Run after adding or removing files:  node tools/gen-precache.js        (the smoke test fails if the list is stale)
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const skip = new Set(['assets/CREDITS.md']);
const walk = d => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name).split(path.sep).join('/')]);
const files = ['index.html', 'manifest.webmanifest', ...walk('src'), ...walk('vendor').filter(f => f.endsWith('.js')), ...walk('assets').filter(f => !skip.has(f) && !f.endsWith('.md') && !f.endsWith('.txt'))].sort();
const big = files.filter(f => /\.(glb|hdr|wasm)$/.test(f));
fs.writeFileSync(path.join(root, 'precache.json'), JSON.stringify({ files }, null, 1) + '\n');
console.log(files.length + ' files, ' + big.length + ' large assets');
