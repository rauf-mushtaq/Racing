// The bridges: one for every place the river crosses a road. Each is built in its own flat frame (u along the road, v across it, y up)
// and then turned to lie on the map. They share a deck (road, markings, kerbs, pavements, lamps, parapet colliders) and each has its
// own structure: a stone arch, a green truss, a row of shops (like the Ponte Vecchio), a plain concrete girder, a gate-towered
// bridge, a suspension bridge and a cable-stayed one.
import * as THREE from 'three';
import { GB, ccw, quadToward, tube } from './geom.js';
import { BRIDGES, deckY, WATER_Y } from './rivercourse.js';
import { addStaticCollider } from './city.js';

const C = (r, g, b) => new THREE.Color(r, g, b);
const WHITE = C(1, 1, 1), YELLOW = C(0.92, 0.7, 0.2), LINE = C(0.9, 0.9, 0.86), CONC = C(0.74, 0.72, 0.69), CONC_D = C(0.5, 0.49, 0.48), DARK = C(0.17, 0.18, 0.2), LAMP = C(4.2, 3.9, 3.2);
const PIER_Y = WATER_Y - 1.5;                       // piers go down below the water

class BB {
  constructor(b) {
    this.b = b; this.cols = []; this.boxes = [];
    this.gb = {}; for (const k of ['asph', 'walk', 'mark', 'props', 'stone', 'glow', 'rail', 'shop', 'roof']) this.gb[k] = new GB(!['asph', 'walk', 'rail'].includes(k));
    const n = Math.max(4, Math.ceil(b.L / 1.5)); this.us = []; this.ys = [];
    for (let k = 0; k <= n; k++) { const u = b.u0 + b.L * k / n; this.us.push(u); this.ys.push(deckY(b, u)); }
  }
  y(u) { return deckY(this.b, u); }
}
// A horizontal ribbon between v0 and v1 at the deck's height plus dy, facing up (or down).
function strip(bb, key, v0, v1, dy, col, up = true, ua = null, ub = null, uvs = 6) {
  const g = bb.gb[key];
  let us = bb.us, ys = bb.ys;
  if (ua !== null) { us = [ua, ub]; ys = [bb.y(ua), bb.y(ub)]; }
  for (let k = 0; k < us.length - 1; k++) {
    quadToward(g, [us[k], ys[k] + dy, v0], [us[k + 1], ys[k + 1] + dy, v0], [us[k + 1], ys[k + 1] + dy, v1], [us[k], ys[k] + dy, v1],
      [[us[k] / uvs, v0 / uvs], [us[k + 1] / uvs, v0 / uvs], [us[k + 1] / uvs, v1 / uvs], [us[k] / uvs, v1 / uvs]], col, [0, up ? 1 : -1, 0]);
  }
}
// A vertical face along the road at v, from ya to yb above the deck (dir = +1 faces +v).
function face(bb, key, v, ya, yb, col, dir, th = 2.4) {
  const g = bb.gb[key], { us, ys } = bb;
  for (let k = 0; k < us.length - 1; k++) {
    quadToward(g, [us[k], ys[k] + ya, v], [us[k + 1], ys[k + 1] + ya, v], [us[k + 1], ys[k + 1] + yb, v], [us[k], ys[k] + yb, v],
      [[us[k] / 4, 0], [us[k + 1] / 4, 0], [us[k + 1] / 4, (yb - ya) / th], [us[k] / 4, (yb - ya) / th]], col, [0, 0, dir]);
  }
}
const box = (bb, key, u0, u1, v0, v1, y0, y1, col, s = 4) => { bb.gb[key].box(u0, v0, u1, v1, y0, y1, s, col); };
// A solid footprint (a polygon in u, v) from y0 to y1, with a lid.
function prism(bb, key, poly, y0, y1, col, cap = true) { const g = bb.gb[key], p = ccw(poly); g.extrude(p, y0, y1, 4, 4, col, 0, false); if (cap) g.cap(p, y1, 4, col); }
const beam = (bb, key, p0, p1, r, col) => tube(bb.gb[key], p0, p1, r, col);
const col2 = (bb, u, v, r) => bb.cols.push([u, v, r]);
const rect2 = (bb, u0, u1, v0, v1) => bb.boxes.push([u0, u1, v0, v1]);

// --- The deck, the same on every bridge --------------------------------------------------------------------------
function deck(bb, o = {}) {
  const b = bb.b, { hw, W, u0, u1 } = b, m = b.blvd ? 2.5 : 0, nl = b.blvd ? 3 : 2, lw = b.blvd ? 4 : 3.8;
  const fascia = o.fascia || CONC, under = o.under ?? true;
  for (const s of [-1, 1]) {
    if (m) strip(bb, 'asph', s > 0 ? m : -hw, s > 0 ? hw : -m, 0, WHITE); else if (s > 0) strip(bb, 'asph', -hw, hw, 0, WHITE);
    strip(bb, 'walk', s > 0 ? hw : -W, s > 0 ? W : -hw, 0.15, WHITE);                           // pavement
    face(bb, 'walk', s * hw, 0, 0.15, WHITE, -s);                                              // kerb
    face(bb, 'stone', s * W, -1.1, 0.15, fascia, s);                                           // the edge of the slab
    // markings
    strip(bb, 'mark', s * (hw - 0.45) - 0.07, s * (hw - 0.45) + 0.07, 0.014, LINE);
    if (m) {
      strip(bb, 'mark', s * (m + 0.3) - 0.07, s * (m + 0.3) + 0.07, 0.014, YELLOW);
      for (let l = 1; l < nl; l++) for (let u = u0 + 4; u < u1 - 5; u += 9) strip(bb, 'mark', s * (m + l * lw) - 0.07, s * (m + l * lw) + 0.07, 0.014, LINE, true, u, u + 3);
    }
  }
  if (!m) { strip(bb, 'mark', -0.22, -0.1, 0.014, YELLOW); strip(bb, 'mark', 0.1, 0.22, 0.014, YELLOW); for (const s of [-1, 1]) for (let u = u0 + 4; u < u1 - 5; u += 9) strip(bb, 'mark', s * lw - 0.07, s * lw + 0.07, 0.014, LINE, true, u, u + 3); }
  if (under) strip(bb, 'stone', -W, W, -1.1, fascia, false);                                   // the underside
  if (m) {                                                                                     // a concrete barrier down the middle of a boulevard
    box(bb, 'stone', u0, u1, -m, m, -1.1, 0.85, CONC);
    for (let u = u0 + 1; u < u1; u += 2.2) col2(bb, u, 0, 1.2);
  }
  // Lamps along both edges, and colliders along the parapets.
  for (const s of [-1, 1]) {
    for (let u = u0 + 8; u < u1 - 6; u += b.L > 100 ? 26 : 22) {
      const y = bb.y(u), v = s * (W - 0.9);
      box(bb, 'props', u - 0.1, u + 0.1, v - 0.1, v + 0.1, y + 0.15, y + 5.6, DARK, 3);
      box(bb, 'props', u - 0.07, u + 0.07, v - s * 1.7, v, y + 5.45, y + 5.6, DARK, 3);
      box(bb, 'glow', u - 0.25, u + 0.25, v - s * 2.0, v - s * 1.5, y + 5.3, y + 5.45, LAMP, 3);
      col2(bb, u, v, 0.25);
    }
    for (let u = u0 + 1; u < u1; u += 2.4) col2(bb, u, s * (W - 0.3), 0.75);
  }
}
// A railing along both edges of the deck (the texture is a set of bars).
function railing(bb, inset = 0.25, h = 1.05) {
  const g = bb.gb.rail, { us, ys } = bb;
  for (const s of [-1, 1]) for (let k = 0; k < us.length - 1; k++) {
    const du = us[k + 1] - us[k], v = s * (bb.b.W - inset);
    g.quad([us[k], ys[k] + 0.15, v], [du, ys[k + 1] - ys[k], 0], [0, h, 0], 0, 0, du, 1);
  }
}
// A low solid parapet along both edges.
function parapet(bb, h = 0.85, t = 0.45, col = CONC, cap = CONC_D) {
  const W = bb.b.W, { us, ys } = bb;
  for (const s of [-1, 1]) {
    const vo = s * W, vi = s * (W - t);
    for (let k = 0; k < us.length - 1; k++) {
      const q = (v, dir) => quadToward(bb.gb.stone, [us[k], ys[k] + 0.15, v], [us[k + 1], ys[k + 1] + 0.15, v], [us[k + 1], ys[k + 1] + 0.15 + h, v], [us[k], ys[k] + 0.15 + h, v], [[0, 0], [1, 0], [1, 1], [0, 1]], col, [0, 0, dir]);
      q(vo, s); q(vi, -s);
      quadToward(bb.gb.stone, [us[k], ys[k] + 0.15 + h, vi], [us[k + 1], ys[k + 1] + 0.15 + h, vi], [us[k + 1], ys[k + 1] + 0.15 + h, vo], [us[k], ys[k] + 0.15 + h, vo], [[0, 0], [1, 0], [1, 1], [0, 1]], cap, [0, 1, 0]);
    }
  }
}
// A pier with a pointed nose each end, standing in the water under the deck.
function pier(bb, uc, hl, nose, col = CONC) {
  const W = bb.b.W - 2;
  prism(bb, 'stone', [[uc - hl - nose, 0], [uc - hl, -W], [uc + hl, -W], [uc + hl + nose, 0], [uc + hl, W], [uc - hl, W]], PIER_Y, bb.y(uc) - 1.1, col, false);
}

// --- The structures ---------------------------------------------------------------------------------------------------
const builders = {
  // Plain and modern: white parapets with a railing on top, steel girders and two piers.
  girder(bb) {
    const b = bb.b; deck(bb, { fascia: C(0.86, 0.85, 0.83) }); parapet(bb, 0.55, 0.35, C(0.86, 0.85, 0.83), C(0.95, 0.95, 0.93)); railing(bb, 0.2, 1.0);
    for (const v of [-0.78, -0.26, 0.26, 0.78]) for (let k = 0; k < bb.us.length - 1; k++) { const u = bb.us[k], u2 = bb.us[k + 1]; beam(bb, 'props', [u, bb.ys[k] - 1.6, v * b.W], [u2, bb.ys[k + 1] - 1.6, v * b.W], 0.45, C(0.3, 0.34, 0.4)); }
    for (const f of b.L > 60 ? [0.33, 0.67] : [0.5]) pier(bb, b.u0 + b.L * f, 1.0, 1.6);
  },
  // Stone arches: spandrel walls with the arches cut out, the vault underneath, a balustrade with pilasters on top.
  arch(bb, o = {}) {
    const b = bb.b, W = b.W, stone = o.stone || C(0.7, 0.66, 0.6), dark = o.dark || C(0.5, 0.47, 0.43), pierW = 2.4;
    deck(bb, { fascia: stone, under: false });
    const n = Math.max(1, Math.round(b.L / 17)), span = b.L / n, ys0 = WATER_Y - 0.6, spans = [];
    for (let i = 0; i < n; i++) {
      const uc = b.u0 + span * (i + 0.5), c = span - pierW, crown = Math.max(bb.y(uc) - 1.25, ys0 + 1.1), h = crown - ys0, R = (c * c / 4 + h * h) / (2 * h);
      spans.push({ uc, c, R, h, crown });
    }
    const archY = u => { for (const s of spans) if (Math.abs(u - s.uc) <= s.c / 2) return ys0 + Math.sqrt(Math.max(0, s.R * s.R - (u - s.uc) ** 2)) - (s.R - s.h); return PIER_Y; };
    const g = bb.gb.stone, step = 1.0, nU = Math.ceil(b.L / step);
    for (const s of [-1, 1]) for (let k = 0; k < nU; k++) {                                   // the faces either side
      const ua = b.u0 + b.L * k / nU, ub = b.u0 + b.L * (k + 1) / nU, ba = archY(ua), bbm = archY(ub), ta = bb.y(ua) + 0.15, tb = bb.y(ub) + 0.15;
      quadToward(g, [ua, ba, s * W], [ub, bbm, s * W], [ub, tb, s * W], [ua, ta, s * W], [[ua / 4, ba / 4], [ub / 4, bbm / 4], [ub / 4, tb / 4], [ua / 4, ta / 4]], stone, [0, 0, s]);
    }
    for (const sp of spans) for (let k = 0; k < 16; k++) {                                     // the underside of each vault
      const ua = sp.uc - sp.c / 2 + sp.c * k / 16, ub = sp.uc - sp.c / 2 + sp.c * (k + 1) / 16;
      quadToward(g, [ua, archY(ua), -W], [ub, archY(ub), -W], [ub, archY(ub), W], [ua, archY(ua), W], [[ua / 4, -W / 4], [ub / 4, -W / 4], [ub / 4, W / 4], [ua / 4, W / 4]], dark, [0, -1, 0]);
    }
    // the balustrade: a wall with a coping, and a pilaster at every pier
    parapet(bb, 1.05, 0.4, stone, C(0.8, 0.77, 0.72));
    for (const s of [-1, 1]) for (let i = 0; i <= n; i++) { const u = b.u0 + span * i, y = bb.y(u); box(bb, 'stone', u - 0.45, u + 0.45, s * W - 0.5, s * W + 0.1, y + 0.15, y + 2.0, dark); }
  },
  // A through truss: two girders of steel either side of the road, joined by cross beams overhead.
  truss(bb, o = {}) {
    const b = bb.b, W = b.W, col = o.col || C(0.12, 0.34, 0.26), H = 6.6, n = Math.max(4, Math.round(b.L / 6.5)), pw = b.L / n;
    deck(bb, { fascia: C(0.55, 0.55, 0.56) }); parapet(bb, 0.45, 0.5, CONC_D, CONC);
    for (const s of [-1, 1]) {
      const v = s * (W - 0.55);
      beam(bb, 'props', [b.u0, 0.15 + H, v], [b.u1, 0.15 + H, v], 0.38, col); beam(bb, 'props', [b.u0, -0.5, v], [b.u1, -0.5, v], 0.3, col);
      for (let k = 0; k <= n; k++) {
        const u = b.u0 + pw * k; beam(bb, 'props', [u, -0.5, v], [u, 0.15 + H, v], 0.2, col);
        if (k < n) beam(bb, 'props', [u, k % 2 ? 0.15 + H : -0.5, v], [u + pw, k % 2 ? -0.5 : 0.15 + H, v], 0.17, col);
        col2(bb, u, v, 0.45);
      }
    }
    for (let k = 0; k <= n; k++) { const u = b.u0 + pw * k; beam(bb, 'props', [u, H - 0.3, -W + 0.6], [u, H - 0.3, W - 0.6], 0.2, col); if (k < n) { beam(bb, 'props', [u, H - 0.3, -W + 0.6], [u + pw, H - 0.3, W - 0.6], 0.1, col); beam(bb, 'props', [u, H - 0.3, W - 0.6], [u + pw, H - 0.3, -W + 0.6], 0.1, col); } }
    for (const v of [-0.55, 0, 0.55]) for (let k = 0; k < bb.us.length - 1; k++) beam(bb, 'props', [bb.us[k], -1.6, v * W], [bb.us[k + 1], -1.6, v * W], 0.4, C(0.28, 0.3, 0.33));
    pier(bb, b.u0 + b.L / 2, 1.1, 1.8, CONC_D);
  },
  // Ponte Vecchio: an arched stone bridge with a little street of shops built along both sides, their upper floors hanging out over the water.
  shops(bb, o = {}) {
    const b = bb.b, W = b.W, tone = o.tone || 0;
    builders.arch(bb, { stone: C(0.72, 0.64, 0.52), dark: C(0.5, 0.44, 0.38) });
    const plasters = [C(0.95, 0.82, 0.62), C(0.9, 0.62, 0.45), C(0.93, 0.9, 0.78), C(0.78, 0.66, 0.5), C(0.9, 0.74, 0.7), C(0.82, 0.78, 0.6)];
    const fac = bb.fac, len = 10.6, gap = 1.6, sh = 3.6, up = 3.2;
    let k = 0;
    for (let u = b.u0 + 5; u + len < b.u1 - 4; u += len + gap, k++) for (const s of [-1, 1]) {
      const y0 = bb.y(u + len / 2) + 0.15, c = plasters[(k * 2 + (s > 0 ? 1 : 0) + tone) % plasters.length], v0 = s > 0 ? W - 3.6 : -W + 0.0, v1 = s > 0 ? W - 0.0 : -W + 3.6;
      const lo = Math.min(v0, v1), hi = Math.max(v0, v1);
      bb.gb.shop.extrude([[u, hi], [u + len, hi], [u + len, lo], [u, lo]], y0, y0 + sh, fac.w, fac.h, c, k * 0.31, false, true);       // the shop below
      const ulo = s > 0 ? lo - 0.9 : lo - 1.5, uhi = s > 0 ? hi + 1.5 : hi + 0.9;                                                          // the floor above, jutting out both sides
      bb.gb.shop.extrude([[u - 0.3, uhi], [u + len + 0.3, uhi], [u + len + 0.3, ulo], [u - 0.3, ulo]], y0 + sh, y0 + sh + up, fac.w, fac.h, c, k * 0.31 + 0.5, false, true);
      bb.gb.roof.ceil(u - 0.3, ulo, u + len + 0.3, uhi, y0 + sh, 6, CONC_D);
      const top = y0 + sh + up, rp = [[u - 0.3, uhi], [u + len + 0.3, uhi], [u + len + 0.3, ulo], [u - 0.3, ulo]];
      bb.gb.roof.cap(rp, top, 8, C(0.45, 0.2, 0.15)); bb.gb.roof.extrude(rp.map(p => [p[0] + (p[0] > u + 1 ? 0.15 : -0.15), p[1] + (p[1] > (ulo + uhi) / 2 ? 0.15 : -0.15)]), top, top + 0.5, 6, 6, C(0.9, 0.88, 0.84), 0, false);
      rect2(bb, u, u + len, lo, hi);
    }
  },
  // Two gate towers in stone, the road passing between their legs, joined high up by a walkway.
  tower(bb) {
    const b = bb.b, W = b.W, stone = C(0.68, 0.65, 0.6), roof = C(0.2, 0.3, 0.42), blue = C(0.15, 0.3, 0.55);
    deck(bb, { fascia: C(0.6, 0.58, 0.55) }); parapet(bb, 0.55, 0.4, CONC_D, CONC); railing(bb, 0.2, 1.0);
    for (const v of [-0.7, -0.25, 0.25, 0.7]) for (let k = 0; k < bb.us.length - 1; k++) beam(bb, 'props', [bb.us[k], bb.ys[k] - 1.7, v * W], [bb.us[k + 1], bb.ys[k + 1] - 1.7, v * W], 0.45, blue);
    pier(bb, b.u0 + b.L / 2, 1.2, 2.0);
    const ut = [b.u0 + 3, b.u1 - 3 - 7], hh = 24;
    for (const u of ut) {
      for (const s of [-1, 1]) {                                                          // the two legs of the gate (a clear pavement is left inside them)
        const v0 = s > 0 ? W - 3.2 : -W, v1 = s > 0 ? W : -W + 3.2;
        box(bb, 'stone', u, u + 7, v0, v1, PIER_Y, hh, stone, 3); rect2(bb, u, u + 7, v0, v1);
        for (const [cu, cv] of [[u, v0], [u + 7, v0], [u, v1], [u + 7, v1]]) { prism(bb, 'stone', [[cu - 0.6, cv - 0.6], [cu + 0.6, cv - 0.6], [cu + 0.6, cv + 0.6], [cu - 0.6, cv + 0.6]], hh - 3, hh + 3.5, stone); const cx = cu, cz = cv; bb.gb.roof.loft([[cx - 0.7, cz + 0.7], [cx + 0.7, cz + 0.7], [cx + 0.7, cz - 0.7], [cx - 0.7, cz - 0.7]], hh + 3.5, [[cx, cz], [cx, cz], [cx, cz], [cx, cz]], hh + 6.5, 4, roof); }
      }
      box(bb, 'stone', u, u + 7, -W + 3.2, W - 3.2, 9.2, hh, stone, 3);                    // the block over the road (clear height 9 m)
      box(bb, 'props', u + 0.3, u + 6.7, -W + 3.2, W - 3.2, hh, hh + 0.7, roof, 3);
      for (const [fu, dir] of [[u, -1], [u + 7, 1]]) {                                     // pointed-arch windows (tall dark panels with a pale surround) on both faces, and battlements along the top
        for (let v = -W + 5; v < W - 4.6; v += 3.4) for (const y of [11.5, 15.5, 19.5]) { box(bb, 'stone', Math.min(fu, fu + dir * 0.12), Math.max(fu, fu + dir * 0.12), v - 0.85, v + 0.85, y - 0.2, y + 2.7, CONC, 2); box(bb, 'props', Math.min(fu, fu + dir * 0.2), Math.max(fu, fu + dir * 0.2), v - 0.55, v + 0.55, y, y + 2.3, DARK, 2); }
        for (let v = -W + 3.4; v < W - 3.6; v += 1.8) box(bb, 'stone', Math.min(fu, fu - dir * 0.9), Math.max(fu, fu - dir * 0.9), v, v + 0.9, hh, hh + 1.1, stone, 2);
      }
    }
    const w0 = ut[0] + 7, w1 = ut[1];                                                       // the high walkway between them
    box(bb, 'props', w0, w1, -W + 3.2, W - 3.2, 19, 21.2, C(0.25, 0.3, 0.4), 3); box(bb, 'glow', w0, w1, -W + 3.1, -W + 3.25, 19.6, 20.6, C(0.9, 0.85, 0.6), 3); box(bb, 'glow', w0, w1, W - 3.25, W - 3.1, 19.6, 20.6, C(0.9, 0.85, 0.6), 3);
    box(bb, 'props', w0, w1, -W + 3.2, W - 3.2, 21.2, 21.5, roof, 3);
  },
  // A suspension bridge: two orange towers on the banks, a cable each side hung from them, and vertical hangers down to the deck.
  suspension(bb) {
    const b = bb.b, W = b.W, orange = C(0.78, 0.22, 0.1), steel = C(0.5, 0.52, 0.55), hh = 38;
    deck(bb, { fascia: C(0.55, 0.55, 0.57) }); parapet(bb, 0.5, 0.4, CONC_D, CONC); railing(bb, 0.2, 1.0);
    for (const v of [-0.6, -0.2, 0.2, 0.6]) for (let k = 0; k < bb.us.length - 1; k++) beam(bb, 'props', [bb.us[k], bb.ys[k] - 1.8, v * W], [bb.us[k + 1], bb.ys[k + 1] - 1.8, v * W], 0.45, C(0.3, 0.32, 0.36));
    const ut = [b.u0 + 5, b.u1 - 5], vc = W - 1.6;
    for (const u of ut) {
      for (const s of [-1, 1]) {
        box(bb, 'props', u - 1.1, u + 1.1, s * vc - 1.1, s * vc + 1.1, PIER_Y, hh, orange, 3); rect2(bb, u - 1.1, u + 1.1, s * vc - 1.1, s * vc + 1.1);
      }
      for (const y of [hh - 3, hh * 0.62]) box(bb, 'props', u - 0.9, u + 0.9, -vc + 1.1, vc - 1.1, y - 1.1, y + 1.1, orange, 3);
      box(bb, 'props', u - 1.3, u + 1.3, -vc - 1.3, vc + 1.3, hh, hh + 0.8, orange, 3);
    }
    const u0 = ut[0], u1 = ut[1], mid = (u0 + u1) / 2, half = (u1 - u0) / 2, low = 3.0, N = 28;
    for (const s of [-1, 1]) {
      const v = s * vc, cable = u => hh + 0.2 - (hh - low) * (1 - ((u - mid) / half) ** 2);
      let prev = null;
      for (let k = 0; k <= N; k++) {
        const u = u0 + (u1 - u0) * k / N, p = [u, cable(u), v]; if (prev) beam(bb, 'props', prev, p, 0.3, steel); prev = p;
        if (k > 0 && k < N && k % 2 === 0) beam(bb, 'props', [u, bb.y(u) + 0.3, v], p, 0.07, steel);
      }
      beam(bb, 'props', [u0, hh + 0.2, v], [b.u0 - 8, bb.y(b.u0 - 8) + 0.3, v], 0.3, steel); beam(bb, 'props', [u1, hh + 0.2, v], [b.u1 + 8, 0.3, v], 0.3, steel);
      col2(bb, b.u0 - 8, v, 0.4); col2(bb, b.u1 + 8, v, 0.4);
      box(bb, 'props', b.u0 - 8.5, b.u0 - 7.5, v - 0.5, v + 0.5, 0.15, 1.2, steel, 3); box(bb, 'props', b.u1 + 7.5, b.u1 + 8.5, v - 0.5, v + 0.5, 0.15, 1.2, steel, 3);
    }
  },
  // A cable-stayed bridge: one tall pylon in the middle of the river (in the median), and a fan of cables out to the edge of the deck.
  stay(bb) {
    const b = bb.b, W = b.W, white = C(0.9, 0.9, 0.88), steel = C(0.7, 0.72, 0.75), hh = 34, uc = b.uc;
    deck(bb, { fascia: white }); parapet(bb, 0.5, 0.4, white, C(0.95, 0.95, 0.93)); railing(bb, 0.2, 1.0);
    for (const v of [-0.6, -0.2, 0.2, 0.6]) for (let k = 0; k < bb.us.length - 1; k++) beam(bb, 'props', [bb.us[k], bb.ys[k] - 1.7, v * W], [bb.us[k + 1], bb.ys[k + 1] - 1.7, v * W], 0.42, white);
    // the pylon: two tapering legs that lean together over the median, with a block of masonry under it in the water
    box(bb, 'stone', uc - 2.6, uc + 2.6, -2.45, 2.45, PIER_Y, 0.85, CONC, 3);
    for (const s of [-1, 1]) { beam(bb, 'props', [uc + s * 1.6, 0.4, 0], [uc + s * 0.25, hh, 0], 0.9, white); }
    box(bb, 'props', uc - 0.6, uc + 0.6, -0.6, 0.6, hh, hh + 2.5, white, 3);
    rect2(bb, uc - 2.6, uc + 2.6, -2.45, 2.45);
    for (const s of [-1, 1]) for (const d of [-1, 1]) for (let k = 1; k <= 6; k++) {
      const ue = uc + d * (4 + k * ((b.L / 2 - 5) / 6)), y = hh - 1.5 - (k - 1) * 3.2;
      beam(bb, 'props', [uc + d * 0.4, y, 0], [ue, bb.y(ue) + 0.3, s * (W - 1.2)], 0.1, steel);
    }
  },
};

// --- Making the meshes ----------------------------------------------------------------------------------------------
const TYPE_OPTS = {
  'z-5': { stone: C(0.66, 0.66, 0.64), dark: C(0.46, 0.46, 0.45) },
  'z1': { stone: C(0.78, 0.68, 0.52), dark: C(0.54, 0.46, 0.36) },
  'x-1': { stone: C(0.68, 0.38, 0.3), dark: C(0.46, 0.26, 0.2) },
  'z-2': { col: C(0.12, 0.34, 0.26) }, 'z2': { col: C(0.55, 0.18, 0.12) },
  'z5': { tone: 3 },
};
export function buildBridges(city, root) {
  const std = o => new THREE.MeshStandardMaterial(o), tx = city.tx;
  const M = {
    asph: city.makeAsphalt(), walk: city.makeWalk(),
    mark: std({ vertexColors: true, color: 0xd4d2cc, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    props: city.mat.props, rail: city.mat.rail, shop: city.mat.shop, roof: city.mat.roof,
    stone: std({ vertexColors: true, map: tx.con.map, normalMap: tx.con.normalMap, roughness: 0.92, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  const out = [];
  for (const b of BRIDGES) {
    const bb = new BB(b); bb.fac = city.style.shop.fac;
    (builders[b.type] || builders.girder)(bb, TYPE_OPTS[b.id] || {});
    // Lay it on the map: roads along x just move over; roads along z turn a quarter. (A turn of -90 degrees takes u to z and v to -x.)
    const mat = new THREE.Matrix4();
    if (b.axis === 'x') mat.makeTranslation(0, 0, b.c); else mat.makeRotationY(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(b.c, 0, 0));
    const toWorld = (u, v) => (b.axis === 'x' ? [u, b.c + v] : [b.c - v, u]);
    const group = new THREE.Group();
    for (const [k, gb] of Object.entries(bb.gb)) {
      if (!gb.count) continue;
      const geo = gb.geometry(); geo.applyMatrix4(mat); geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, M[k]);
      mesh.castShadow = k === 'props' || k === 'stone' || k === 'shop' || k === 'roof'; mesh.receiveShadow = k !== 'glow';
      group.add(mesh);
    }
    for (const [u, v, r] of bb.cols) { const [x, z] = toWorld(u, v); addStaticCollider({ type: 'circ', x, z, r }); }
    for (const [u0, u1, v0, v1] of bb.boxes) { const [xa, za] = toWorld(u0, v0), [xb, zb] = toWorld(u1, v1); addStaticCollider({ type: 'box', x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb) }); }
    root.add(group);
    const [cx, cz] = toWorld(b.uc, 0);
    out.push({ group, cx, cz, bridge: b });
  }
  return out;
}
