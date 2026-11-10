// Inside a building. A shop, a bank or a museum is a room built when you walk in (rooms.js has the plans) and put high above the city, straight over the
// door you went in by. The camera then sees only camera layer 1: the room, you, the people in it, and the sparks of a shot; everything outside is on
// layer 0 and is not drawn at all (so a room costs less than the street). The room has its own lights and its own reflections, and walls, furniture,
// the floor, and the bullets all work from the room's own list of boxes, never the city's. The streets round the door go on being simulated, so the police
// really do arrive outside it.
import * as THREE from 'three';
import { GB, circlePoly } from './geom.js';
import { clamp, mulberry32 } from './util.js';
import { attachSSR } from './ssr.js';

export const STAGE_Y = 1800;

// ---- Pixels for the floors and walls (built from arrays, not drawn on a canvas: a canvas made late can fail on an iPad) ----------------------------------------
function dataTex(S, fn) {
  const d = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = fn(x / S, y / S, x, y), o = (y * S + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t;
}
const hash = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
const noise = (x, y, f) => { const xi = Math.floor(x * f), yi = Math.floor(y * f), xf = x * f - xi, yf = y * f - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v; };
export const TEX = {};
function makeTextures() {
  if (TEX.marble) return;
  // Polished stone in squares: veins of grey through white (or black), a pale line between the tiles. One texture is 2 x 2 tiles.
  const stone = (light) => dataTex(128, (u, v) => {
    const tu = (u * 2) % 1, tv = (v * 2) % 1, edge = Math.min(tu, 1 - tu, tv, 1 - tv) < 0.012, checker = (Math.floor(u * 2) + Math.floor(v * 2)) & 1;
    const vein = Math.abs(Math.sin((u * 7 + noise(u, v, 6) * 3.4 + v * 3) * 6.28)), base = (checker ? 0.78 : 0.9) * (light ? 1 : 0.2) + (light ? 0 : (checker ? 0.04 : 0)), k = base * (1 - 0.22 * Math.pow(1 - vein, 7)) * (0.94 + 0.06 * noise(u, v, 30));
    const g = edge ? (light ? 0.6 : 0.5) : k; return [g * 255, g * 252, g * 245];
  });
  TEX.marble = stone(true); TEX.blackstone = stone(false);
  TEX.lino = dataTex(64, (u, v) => { const tu = (u * 4) % 1, tv = (v * 4) % 1, edge = Math.min(tu, 1 - tu, tv, 1 - tv) < 0.03, ch = (Math.floor(u * 4) + Math.floor(v * 4)) & 1, g = edge ? 0.45 : (ch ? 0.86 : 0.72) * (0.96 + 0.04 * noise(u, v, 40)); return [g * 238, g * 240, g * 236]; });
  TEX.wood = dataTex(128, (u, v) => { const plank = Math.floor(u * 6), local = (u * 6) % 1, tone = 0.82 + 0.18 * hash(plank, 3), grain = 0.9 + 0.1 * noise(u * 0.3 + plank, v, 40), gap = local < 0.02 ? 0.4 : 1, g = tone * grain * gap; return [150 * g, 106 * g, 68 * g]; });
  TEX.carpet = dataTex(64, (u, v, x, y) => { const g = 0.82 + 0.18 * hash(x, y) + 0.08 * noise(u, v, 8); return [86 * g, 40 * g, 48 * g]; });
  TEX.plaster = dataTex(64, (u, v) => { const g = 0.92 + 0.08 * noise(u, v, 12) + 0.04 * noise(u, v, 40); return [g * 244, g * 238, g * 228]; });
  // A suspended ceiling: tiles of 0.57 m with a dark grid between them and a little speckle (one texture covers 4 m).
  TEX.ceil = dataTex(128, (u, v) => { const tu = (u * 7) % 1, tv = (v * 7) % 1, grid = Math.min(tu, 1 - tu, tv, 1 - tv) < 0.024, g = grid ? 0.5 : 0.93 + 0.05 * noise(u, v, 50) + 0.03 * noise(u, v, 9); return [g * 238, g * 236, g * 230]; });
  TEX.concrete = dataTex(64, (u, v) => { const g = 0.72 + 0.2 * noise(u, v, 10) + 0.08 * noise(u, v, 50); return [g * 200, g * 200, g * 196]; });
  // Pictures for the walls of a gallery: a few soft shapes in a few colours.
  for (let k = 0; k < 4; k++) TEX['art' + k] = dataTex(64, (u, v) => {
    const pal = [[[30, 60, 110], [230, 180, 70], [190, 70, 50]], [[20, 80, 60], [230, 220, 180], [200, 120, 40]], [[70, 30, 90], [240, 140, 160], [250, 230, 120]], [[40, 40, 44], [220, 90, 60], [240, 240, 235]]][k];
    const a = noise(u + k, v, 3), b = noise(v, u + 2 * k, 5), c = a > 0.55 ? pal[1] : b > 0.5 ? pal[2] : pal[0], s = 0.82 + 0.3 * noise(u, v, 20);
    const edge = Math.min(u, 1 - u, v, 1 - v) < 0.06; return edge ? [70, 46, 20] : [c[0] * s, c[1] * s, c[2] * s];
  });
  for (const t of Object.values(TEX)) t.repeat.set(1, 1);
}

// ---- A room under construction --------------------------------------------------------------------------------------------------------------------------
// Everything is given in the room's own metres: the door is in the middle of the front wall (x = 0, z = 0) and the room runs back along +z.
export const C = h => new THREE.Color(h);
export class Room {
  constructor(kind, ox, oz) {
    this.kind = kind; this.ox = ox; this.oz = oz; this.oy = STAGE_Y;
    this.gb = { floor: new GB(true), wall: new GB(true), ceil: new GB(true), prop: new GB(true), metal: new GB(true), emit: new GB(true), art: [] };
    this.boxes = []; this.circs = []; this.items = []; this.spots = []; this.cams = []; this.lasers = []; this.loose = []; this.lights = [];
    this.W = 10; this.D = 8; this.H = 3;
  }
  // Boxes: x0, z0, x1, z1 across the floor, y0..y1 up. `solid` makes it a thing to walk round (and to be shot at).
  box(kind, x0, z0, x1, z1, y0, y1, col, solid = false) {
    this.gb[kind].box(this.ox + x0, this.oz + z0, this.ox + x1, this.oz + z1, this.oy + y0, this.oy + y1, 1.2, col);
    if (solid) this.boxes.push({ x0: this.ox + x0, x1: this.ox + x1, z0: this.oz + z0, z1: this.oz + z1, y0: this.oy + y0, y1: this.oy + y1 });
  }
  // A box with a different colour on top (a counter with a worktop).
  slab(kind, x0, z0, x1, z1, y0, y1, col, top, solid = true) { this.box(kind, x0, z0, x1, z1, y0, y1 - 0.05, col, solid); this.box(kind, x0 - 0.04, z0 - 0.04, x1 + 0.04, z1 + 0.04, y1 - 0.05, y1, top); }
  floor(x0, z0, x1, z1, col, s = 4) { this.gb.floor.flat(this.ox + x0, this.oz + z0, this.ox + x1, this.oz + z1, this.oy, s, col); }
  ceil(x0, z0, x1, z1, y, col) { this.gb.ceil.ceil(this.ox + x0, this.oz + z0, this.ox + x1, this.oz + z1, this.oy + y, 4, col); }
  // A round column or drum.
  drum(kind, x, z, r, y0, y1, col, solid = true, n = 14) {
    const pts = []; for (let i = 0; i < n; i++) { const a = -i / n * Math.PI * 2; pts.push([this.ox + x + Math.cos(a) * r, this.oz + z + Math.sin(a) * r]); }
    this.gb[kind].extrude(pts, this.oy + y0, this.oy + y1, 2, 2, col, 0, true); this.gb[kind].cap(pts.slice().reverse(), this.oy + y1, 2, col);
    if (solid) this.circs.push({ x: this.ox + x, z: this.oz + z, r: r + 0.05, y0: this.oy + y0, y1: this.oy + y1 });
  }
  light(x, y, z, k = 1, col = 0xfff1d8) { this.lights.push({ x: this.ox + x, y: this.oy + y, z: this.oz + z, k, col }); }
  // A ceiling light panel (glows, and is bloomed).
  panel(x, z, w, d, y, col = C(0xfff3dc), k = 3.2) { const c = col.clone().multiplyScalar(k); this.gb.emit.ceil(this.ox + x - w / 2, this.oz + z - d / 2, this.ox + x + w / 2, this.oz + z + d / 2, this.oy + y - 0.02, 1, c); }
  // The four walls, floor and ceiling of the room. The front wall has the way out: a glass door, bright with the day.
  shell(W, D, H, o) {
    this.W = W; this.D = D; this.H = H; const t = 0.3, wall = o.wall ?? C(0xe8e2d6), trim = o.trim ?? C(0xb8aea0);
    this.floor(-W / 2, 0, W / 2, D, o.floor ?? C(0xffffff), o.floorS ?? 2.4); this.ceil(-W / 2, 0, W / 2, D, H, o.ceil ?? C(0xf4f0e8));
    this.box('wall', -W / 2 - t, D, W / 2 + t, D + t, 0, H, wall);                                                   // the back
    this.box('wall', -W / 2 - t, -t, -W / 2, D + t, 0, H, wall); this.box('wall', W / 2, -t, W / 2 + t, D + t, 0, H, wall);          // the sides
    const dw = 1.1;                                                                                                   // the front, round the door
    this.box('wall', -W / 2 - t, -t, -dw, 0, 0, H, wall); this.box('wall', dw, -t, W / 2 + t, 0, 0, H, wall); this.box('wall', -dw, -t, dw, 0, 2.5, H, wall);
    this.box('emit', -dw + 0.05, -0.05, dw - 0.05, -0.02, 0, 2.5, C(0xcfe6ff).multiplyScalar(2.6));                    // the daylight through the door
    this.box('metal', -dw - 0.06, -0.08, -dw + 0.05, 0.1, 0, 2.55, C(0x2b2d30)); this.box('metal', dw - 0.05, -0.08, dw + 0.06, 0.1, 0, 2.55, C(0x2b2d30)); this.box('metal', -dw, -0.08, dw, 0.1, 2.5, 2.6, C(0x2b2d30));
    // Skirting and a picture rail all round, in the trim colour.
    this.box('prop', -W / 2, 0.02, -W / 2 + 0.04, D, 0, 0.14, trim); this.box('prop', W / 2 - 0.04, 0.02, W / 2, D, 0, 0.14, trim); this.box('prop', -W / 2, D - 0.04, W / 2, D, 0, 0.14, trim);
    this.exit = { x: this.ox, z: this.oz + 0.35 };
    // The room's edges: walking into one is stopped by `keepIn`, and a bullet stops at it.
    this.bounds = { x0: this.ox - W / 2, x1: this.ox + W / 2, z0: this.oz + 0.08, z1: this.oz + D, y0: this.oy, y1: this.oy + H };
  }
  // A thing to do: id, type, where, how long it takes (s), what it is worth, a label for the prompt, and the object to hide when it is done.
  item(it) { it.x += this.ox; it.z += this.oz; it.y = (it.y ?? 1) + this.oy; it.state = 'ready'; this.items.push(it); return it; }
  spot(role, x, z, face = Math.PI, o = {}) { this.spots.push({ role, x: this.ox + x, z: this.oz + z, face, ...o }); }
}

// ---- Dressing every room: the finishing touches (a doormat, an exit sign, a clock, smoke detectors, plants, posters, a fire extinguisher) --------------------
function decorate(R, venue) {
  const rnd = mulberry32((venue.seed | 0) * 131 + 7), W = R.W, D = R.D, H = R.H, dark = C(0x1c1d20), white = C(0xf2f0e8);
  R.box('prop', -0.95, 0.12, 0.95, 0.9, 0, 0.014, C(0x26272b));                                                                            // the doormat
  R.box('prop', -0.34, 0.0, 0.34, 0.07, H - 0.4, H - 0.2, dark); R.box('emit', -0.3, 0.07, 0.3, 0.09, H - 0.37, H - 0.23, C(0x5dff8a).multiplyScalar(2.2));   // the exit sign over the door
  const cx = W * 0.22, cy = Math.min(H - 0.55, 2.3);
  R.box('prop', cx - 0.23, D - 0.06, cx + 0.23, D, cy - 0.23, cy + 0.23, dark); R.box('prop', cx - 0.2, D - 0.075, cx + 0.2, D - 0.06, cy - 0.2, cy + 0.2, white);   // a wall clock,
  R.box('metal', cx - 0.012, D - 0.085, cx + 0.012, D - 0.075, cy, cy + 0.15, dark); R.box('metal', cx, D - 0.085, cx + 0.1, D - 0.075, cy - 0.012, cy + 0.012, dark);   // with its hands
  for (const [x, z] of [[-W / 4, D * 0.3], [W / 4, D * 0.3], [-W / 4, D * 0.72], [W / 4, D * 0.72]]) R.box('prop', x - 0.08, z - 0.08, x + 0.08, z + 0.08, H - 0.05, H, white);    // smoke detectors
  for (const x of [-W / 2 + 1.0, W / 2 - 1.0]) R.box('prop', x - 0.3, D * 0.5 - 0.3, x + 0.3, D * 0.5 + 0.3, H - 0.03, H, C(0xcfd2d4));                                         // air vents
  // Plants in the front corners (a pot and a bush of leaves).
  for (const sx of [-1, 1]) {
    const px = sx * (W / 2 - 0.45), pz = 0.55, gb = R.gb.prop, leaf = [C(0x2c6a34), C(0x3b7d3c), C(0x255c2e)];
    R.drum('prop', px, pz, 0.21, 0, 0.42, C(0x70503c));
    for (let k = 0; k < 3; k++) { const ox = R.ox + px + (k - 1) * 0.1, oz = R.oz + pz + ((k * 5) % 3 - 1) * 0.08; gb.loft(circlePoly(ox, oz, 0.34 - k * 0.04, 10), R.oy + 0.4 + k * 0.1, circlePoly(ox, oz, 0.03, 10), R.oy + 1.25 + k * 0.15, 3, leaf[k]); }
  }
  // A fire extinguisher by the door (a red drum on a white plate), and, in the shops, posters on the walls.
  R.box('prop', W / 2 - 0.03, 0.8, W / 2, 1.1, 0.6, 1.2, white); R.drum('prop', W / 2 - 0.12, 0.95, 0.07, 0.62, 1.12, C(0xc4302a), false, 10);
  if (venue.kind === 'petrol' || venue.kind === 'shop') for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const z0 = 1.8 + k * (D - 3) / 3 + rnd() * 0.3, h = 0.9 + rnd() * 0.3, y0 = 1.25 + rnd() * 0.3, col = [0xd23a3a, 0x3a78d2, 0xe8c030, 0x3aa860, 0xe27a30][(rnd() * 5) | 0];
    R.box('prop', sx * W / 2 - (sx > 0 ? 0.035 : -0.0), z0, sx * W / 2 + (sx > 0 ? 0 : 0.035), z0 + 0.7, y0, y0 + h, C(0xf2f0e8));
    R.box('prop', sx * W / 2 - (sx > 0 ? 0.045 : -0.0), z0 + 0.05, sx * W / 2 + (sx > 0 ? 0 : 0.045), z0 + 0.65, y0 + 0.05, y0 + h - 0.05, C(col));
  }
}

// ---- Soft things drawn flat: shadows, the corners of the room, daylight at the door and pools of light ------------------------------------------------------
// A rectangle with a soft edge: alpha `a` inside (x0..x1, z0..z1) falling to nothing `m` metres outside it; `inward` makes only the ring, falling to nothing `m` metres INSIDE it (a wall's foot).
function softRect(out, x0, z0, x1, z1, y, m, a, rgb, inward = false) {
  const base = out.pos.length / 3, c = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]], o = c.map(([x, z], i) => [x + (i === 0 || i === 1 ? -m : m) * (inward ? -1 : 1), z + (i === 0 || i === 3 ? -m : m) * (inward ? -1 : 1)]);
  for (const [x, z] of c) { out.pos.push(x, y, z); out.col.push(rgb[0], rgb[1], rgb[2], a); }
  for (const [x, z] of o) { out.pos.push(x, y, z); out.col.push(rgb[0], rgb[1], rgb[2], 0); }
  if (!inward) out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; out.idx.push(base + k, base + k2, base + 4 + k2, base + k, base + 4 + k2, base + 4 + k); }
}
function softMeshes(R, mats) {
  const sh = { pos: [], col: [], idx: [] }, gl = { pos: [], col: [], idx: [] }, y = R.oy + 0.012, b = R.bounds, m = [];
  for (const q of R.boxes) { const h = q.y1 - q.y0; if (q.y0 > R.oy + 0.2 || h < 0.3 || q.dead) continue; softRect(sh, q.x0 - 0.03, q.z0 - 0.03, q.x1 + 0.03, q.z1 + 0.03, y, Math.min(0.5, 0.18 + 0.2 * h), 0.3 + 0.2 * Math.min(h, 1.5) / 1.5, [0.02, 0.015, 0.01]); }
  for (const c of R.circs) softRect(sh, c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r, y, 0.3, 0.4, [0.02, 0.015, 0.01]);
  softRect(sh, b.x0, b.z0, b.x1, b.z1, y, 0.9, 0.38, [0.02, 0.015, 0.01], true);                                                              // the foot of every wall is a little darker
  softRect(sh, b.x0, b.z0, b.x1, b.z1, b.y1 - 0.012, 0.8, 0.3, [0.02, 0.015, 0.01], true);                                                    // and so are the corners of the ceiling
  // Daylight through the door, lying on the floor and spreading as it goes in.
  { const i0 = gl.pos.length / 3, x = R.ox, z = R.oz, yy = R.oy + 0.016, L = 3.4; for (const [px, pz, a] of [[x - 1.1, z + 0.08, 0.32], [x + 1.1, z + 0.08, 0.32], [x + 2.4, z + L, 0], [x - 2.4, z + L, 0]]) { gl.pos.push(px, yy, pz); gl.col.push(0.78, 0.9, 1.0, a); } gl.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3); }
  for (const l of R.lights) softRect(gl, l.x - 0.4, l.z - 0.4, l.x + 0.4, l.z + 0.4, R.oy + 0.02, 1.7, 0.12 * l.k, [1.0, 0.86, 0.6]);                // a pool of warm light under each lamp
  for (const [d, mat] of [[sh, mats.shade], [gl, mats.glow]]) {
    if (!d.idx.length) continue; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 4)); g.setIndex(d.idx);
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 2; m.push(mesh);
  }
  return m;
}
// Specks of dust in the air of the room, drifting in the light.
function makeDust(R) {
  const n = 70, b = R.bounds, rnd = mulberry32(R.ox * 7 + R.oz * 13 + 1), pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos.set([b.x0 + 0.3 + rnd() * (b.x1 - b.x0 - 0.6), R.oy + 0.4 + rnd() * (R.H - 0.8), b.z0 + 0.3 + rnd() * (b.z1 - b.z0 - 0.6)], i * 3); seed[i] = rnd() * 6.28; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.028, color: 0xfff1d8, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  points.frustumCulled = false; let t = 0;
  return { points, step(dt) { t += dt; const a = g.attributes.position.array; for (let i = 0; i < n; i++) { a[i * 3] += Math.sin(t * 0.21 + seed[i]) * 0.0011; a[i * 3 + 1] += Math.sin(t * 0.17 + seed[i] * 2) * 0.0008 - 0.0002; a[i * 3 + 2] += Math.cos(t * 0.19 + seed[i] * 3) * 0.0011; if (a[i * 3 + 1] < R.oy + 0.3) a[i * 3 + 1] = R.oy + R.H - 0.4; } g.attributes.position.needsUpdate = true; } };
}

// ---- The inside of a building ------------------------------------------------------------------------------------------------------------------------
export class Interior {
  // env: { scene, camera, renderer, walker, audio, hud }
  constructor(env) {
    this.env = env; this.active = false; this.room = null; this.group = null; this.venue = null; this.floorY = STAGE_Y; this.t = 0;
    makeTextures();
    const m = (cls, o) => new cls(o);
    this.mats = {
      floor: m(THREE.MeshPhysicalMaterial, { map: TEX.marble, vertexColors: true, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.18, envMapIntensity: 0.9 }),
      wall: m(THREE.MeshStandardMaterial, { map: TEX.plaster, vertexColors: true, roughness: 0.92, envMapIntensity: 0.6 }),
      ceil: m(THREE.MeshStandardMaterial, { map: TEX.ceil, vertexColors: true, roughness: 0.95, envMapIntensity: 0.4 }),
      prop: m(THREE.MeshStandardMaterial, { vertexColors: true, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.9 }),
      metal: m(THREE.MeshStandardMaterial, { vertexColors: true, roughness: 0.28, metalness: 0.92, envMapIntensity: 1.2 }),
      emit: m(THREE.MeshBasicMaterial, { vertexColors: true }),
      glass: m(THREE.MeshPhysicalMaterial, { color: 0xd6ecf4, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }),
      gem: m(THREE.MeshStandardMaterial, { color: 0xffffff, roughness: 0.02, metalness: 0.2, emissive: 0x6688aa, emissiveIntensity: 0.5, envMapIntensity: 2.4 }),
    };
    attachSSR(this.mats.floor, { range: 22, rough: 0.35, view: 30 });                              // (a polished floor shows the lights, the counters and the people)
    // Soft shadows under furniture and along the walls, the daylight spilling in at the door and the pools of light under the lamps (drawn with a transparency of their own at every corner).
    this.mats.shade = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mats.glow = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.dust = null;
    // Four lights for every room (the same number always, so no shader is ever rebuilt when a different room is entered).
    this.lights = []; for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xfff1d8, 1, 16, 1.6); l.layers.set(1); l.visible = false; env.scene.add(l); this.lights.push(l); }
    this.env0 = null; this.saved = null; this.fade = 0;
  }
  get ready() { return !!this.room; }
  // The room's own reflections: a plain bright room, put through the same filter the sky is.
  makeEnv() {
    if (this.roomEnv) return this.roomEnv;
    const r = this.env.renderer, s = new THREE.Scene(), box = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 20), new THREE.MeshBasicMaterial({ color: 0x8a8378, side: THREE.BackSide }));
    s.add(box);
    for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5], [0, 0]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.93, 0.8).multiplyScalar(7) })); p.position.set(x, 3.8, z); s.add(p); }
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.9, 1).multiplyScalar(4) })); w.position.set(-9.8, 1.5, 0); s.add(w);
    const pm = new THREE.PMREMGenerator(r); this.roomEnv = pm.fromScene(s, 0.03).texture; pm.dispose(); box.geometry.dispose(); return this.roomEnv;
  }
  // Builds the room for a venue ({ kind, x, z, seed }) at the stage above its door.
  build(venue, plan) {
    this.dispose();
    const R = new Room(venue.kind, Math.round(venue.x), Math.round(venue.z)); R.mats = this.mats; R.art = [TEX.art0, TEX.art1, TEX.art2, TEX.art3]; plan(R, venue); decorate(R, venue); this.room = R;
    const g = new THREE.Group(); g.visible = false;
    for (const k of ['floor', 'wall', 'ceil', 'prop', 'metal', 'emit']) { const gb = R.gb[k]; if (!gb.count) continue; const mesh = new THREE.Mesh(gb.geometry(), this.mats[k]); mesh.frustumCulled = false; g.add(mesh); }
    for (const o of R.loose) g.add(o);
    for (const m of softMeshes(R, this.mats)) g.add(m);
    this.dust = makeDust(R); g.add(this.dust.points);
    g.traverse(o => o.layers.set(1)); this.env.scene.add(g); this.group = g; this.venue = venue;
    this.mats.floor.map = venue.kind === 'petrol' || venue.kind === 'shop' ? TEX.lino : venue.kind === 'jeweller' ? TEX.blackstone : venue.kind === 'bank' ? TEX.marble : TEX.marble; this.mats.floor.needsUpdate = true;
    R.lights.forEach((l, i) => { const L = this.lights[i]; if (!L) return; L.position.set(l.x, l.y, l.z); L.color.set(l.col); L.intensity = 14 * l.k; L.distance = Math.max(R.W, R.D) * 1.3; });
    return R;
  }
  dispose() {
    if (this.group) { this.env.scene.remove(this.group); this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.group = null; }
    this.room = null; this.dust = null;
  }
  // ---- Going in and out ---------------------------------------------------------------------------------------------------------------------------
  enter() {
    const { scene, camera, walker } = this.env, R = this.room;
    this.saved = { env: scene.environment, exposure: this.env.renderer.toneMappingExposure, layers: camera.layers.mask };
    scene.environment = this.makeEnv(); camera.layers.set(1); this.group.visible = true; for (const L of this.lights) L.visible = true;
    for (let i = R.lights.length; i < this.lights.length; i++) this.lights[i].intensity = 0;
    walker.interior = this; this.active = true; this.t = 0;
    walker.place(R.exit.x, R.exit.z + 1.0, 0); walker.y = STAGE_Y; this.floorY = STAGE_Y;
  }
  exit() {
    const { scene, camera, walker } = this.env;
    scene.environment = this.saved.env; camera.layers.mask = this.saved.layers; this.group.visible = false; for (const L of this.lights) L.visible = false;
    walker.interior = null; this.active = false;
  }
  update(dt) { this.t += dt; if (this.dust) this.dust.step(dt); }
  // ---- What the walker and the camera ask of it ------------------------------------------------------------------------------------------------
  ground() { return _ground; }
  ceil() { return this.room.bounds.y1; }
  inside(x, z, pad = 0) { const b = this.room.bounds; return x > b.x0 + pad && x < b.x1 - pad && z > b.z0 + pad && z < b.z1 - pad; }
  // The boxes and posts within r of a point, in the shape the city's colliders have.
  solids(x, z, r, out) {
    out.length = 0; const R = this.room;
    for (const b of R.boxes) { if (b.dead) continue; if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) out.push({ type: 'box', x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 }); }
    for (const c of R.circs) { if (c.dead) continue; if (Math.abs(x - c.x) < r + c.r && Math.abs(z - c.z) < r + c.r) out.push({ type: 'circ', x: c.x, z: c.z, r: c.r }); }
    return out;
  }
  keepIn(w, r) { const b = this.room.bounds; w.x = clamp(w.x, b.x0 + r, b.x1 - r); w.z = clamp(w.z, b.z0 + r, b.z1 - r); }
  // The distance along a ray to the first wall, ceiling, floor or piece of furniture (or maxD), and which it was: 'wall' | 'ground' | 'none'.
  trace(ox, oy, oz, dx, dy, dz, maxD) {
    const R = this.room, b = R.bounds; let best = maxD, type = 0;
    const slab = (x0, x1, y0, y1, z0, z1, inside) => {                                           // ray against a box, from outside or from inside
      let tmin = -1e9, tmax = 1e9; const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
      for (let i = 0; i < 3; i++) { if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return inside ? 1e9 : -1; continue; } let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i]; if (t1 > t2) [t1, t2] = [t2, t1]; tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
      if (tmin > tmax) return inside ? 1e9 : -1; return inside ? tmax : (tmax < 0 ? -1 : Math.max(tmin, 0));
    };
    const tw = slab(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, true); if (tw < best) { best = tw; type = (oy + dy * tw) <= b.y0 + 0.02 ? 2 : 1; }
    for (const q of R.boxes) { if (q.dead) continue; const t = slab(q.x0, q.x1, q.y0, q.y1, q.z0, q.z1, false); if (t >= 0 && t < best) { best = t; type = 1; } }
    for (const c of R.circs) {
      if (c.dead) continue; const ex = c.x - ox, ez = c.z - oz, hl = Math.hypot(dx, dz); if (hl < 1e-6) continue; const s = (ex * dx + ez * dz) / hl, d2 = ex * ex + ez * ez - s * s; if (s < 0 || d2 > c.r * c.r) continue;
      const th = (s - Math.sqrt(c.r * c.r - d2)) / hl, y = oy + dy * th; if (th >= 0 && th < best && y > c.y0 && y < c.y1) { best = th; type = 1; }
    }
    return { t: best, type };
  }
}
const _ground = { y: STAGE_Y, kind: 'tile', grass: false };
