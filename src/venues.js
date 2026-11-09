// The places you can walk into: what each is worth and how hard it is, where they are in the city, and what their fronts look like from the street.
//
// From the easiest to the hardest: a petrol station (a till and a clerk), a convenience store (a till, a safe, a clerk who may be armed), a jeweller
// (glass cases, an armed guard, cameras), a bank (tellers, two guards, cameras, a vault behind a key card or a long drill) and a museum (patrolling
// guards, sweeping cameras, laser beams round the treasures, a security room to switch them all off). Harder places: quicker police, more stars,
// guards who shoot straighter, and far more money.
import * as THREE from 'three';
import { addCollider } from './city.js';
import { hash3 } from './util.js';

const CURB = 0.15;
export const VENUE_TYPES = {
  petrol:   { kind: 'petrol',   name: 'PETROL STATION',   tier: 1, stars: 1, delay: 16, press: [10, 18], dmg: 4.0, aim: 0.8, blurb: 'A till and one clerk', worth: '$300 – $900' },
  shop:     { kind: 'shop',     name: 'CONVENIENCE STORE', tier: 2, stars: 1, delay: 11, press: [7, 12], dmg: 4.5, aim: 0.9, blurb: 'A till, a safe in the back', worth: '$2,400 – $6,000' },
  jeweller: { kind: 'jeweller', name: 'DIAMOND JEWELLER', tier: 3, stars: 2, delay: 6, press: [5, 9], dmg: 5.5, aim: 1.0, blurb: 'Glass cases, an armed guard, cameras', worth: '$15,000 – $30,000' },
  bank:     { kind: 'bank',     name: 'BANK',             tier: 4, stars: 3, delay: 3, press: [4, 8], dmg: 6.5, aim: 1.1, blurb: 'Tellers, two guards, a vault', worth: '$50,000 – $140,000' },
  museum:   { kind: 'museum',   name: 'MUSEUM',           tier: 5, stars: 4, delay: 0, press: [3, 6], dmg: 7.5, aim: 1.2, blurb: 'Patrols, cameras, lasers', worth: '$315,000' },
};

// ---- Where they are ------------------------------------------------------------------------------------------------------------------------------------
// Built as the city streams in (a region's buildings are made when it is near); the list stays, and says where every door is.
export const VENUES = new Map();
const cells = new Map(), CELL = 96;
const ck = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
export function addVenue(v) {
  const key = v.kind + Math.round(v.x) + ',' + Math.round(v.z);
  if (VENUES.has(key)) return VENUES.get(key);
  v.id = key; v.seed = (Math.round(v.x * 7.3) * 73856093) ^ (Math.round(v.z * 5.1) * 19349663); VENUES.set(key, v);
  const c = ck(v.x, v.z); (cells.get(c) || cells.set(c, []).get(c)).push(v); return v;
}
// The door nearest to a point, within r metres (or null).
export function venueNear(x, z, r = 3.4) {
  let best = null, bd = r * r;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const v of cells.get(ck(x + i * CELL, z + j * CELL)) || []) { const d = (v.x - x) ** 2 + (v.z - z) ** 2; if (d < bd) { bd = d; best = v; } }
  return best;
}
export function venuesWithin(x, z, r) { const out = []; for (const v of VENUES.values()) if ((v.x - x) ** 2 + (v.z - z) ** 2 < r * r) out.push(v); return out; }

// Which place (if any) goes on this lot? Downtown and the middle city get the jewellers, museums and some shops; the outskirts the petrol stations and shops.
export function venueKindFor(zone, lot, faces) {
  const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0, h = hash3(Math.round(lot.x0), Math.round(lot.z0), 73);
  if (!faces.length || Math.min(w, d) < 15) return null;
  if (zone === 'down' || zone === 'mid') {
    if (h < 0.014 && w >= 34 && d >= 30) return 'museum';
    if (h < 0.05) return 'jeweller';
    if (h < 0.095) return 'shop';
    if (zone === 'mid' && h < 0.135 && w >= 27 && d >= 24) return 'petrol';
  } else if (zone === 'low') {
    if (h < 0.07 && w >= 27 && d >= 24) return 'petrol';
    if (h < 0.13) return 'shop';
  } else if (zone === 'sub') {
    if (h < 0.05 && w >= 27 && d >= 24) return 'petrol';
    if (h < 0.09) return 'shop';
  }
  return null;
}

// ---- What they look like -----------------------------------------------------------------------------------------------------------------------------
const col = (r, g, b) => new THREE.Color(r, g, b);
// A door in a building's face: a dark frame and a pane of glass, an awning, and a sign, and the place registered at the pavement in front of it.
function frontDoor(city, ctx, b, f, kind, o = {}) {
  const G = ctx.gb, dark = col(0.12, 0.13, 0.15), pane = o.pane || col(0.28, 0.4, 0.46), h = o.h || 2.5;
  city.faceBox(G.props, b, f, -1.25, 1.25, -0.04, 0.2, CURB, CURB + h + 0.15, dark);
  city.faceBox(G.props, b, f, -1.05, -0.05, -0.06, 0.22, CURB + 0.1, CURB + h, pane); city.faceBox(G.props, b, f, 0.05, 1.05, -0.06, 0.22, CURB + 0.1, CURB + h, pane);
  const [px, pz] = city.facePt(b, f, 0, 2.0);
  return addVenue({ kind, x: px, z: pz, dx: f.dir[0], dz: f.dir[1] });
}
// A sign above the door, and a small lit panel on the pavement edge so it can be seen from the road.
function signOver(city, ctx, b, f, cell, y, w, h, o = 0.3) { city.faceSign(ctx, b, f, cell, 0, o, CURB + y, w, h); }

export function buildVenue(city, ctx, lot, faces, zone, kind, rnd) {
  const f = faces[0], G = ctx.gb, along = f.dir[0] !== 0 ? lot.z1 - lot.z0 : lot.x1 - lot.x0, depth = f.dir[0] !== 0 ? lot.x1 - lot.x0 : lot.z1 - lot.z0;
  const g = 0.8 + rnd() * 0.8, b = { x0: lot.x0 + g, z0: lot.z0 + g, x1: lot.x1 - g, z1: lot.z1 - g };
  for (const ff of faces) { if (ff.dir[0] < 0) b.x0 = lot.x0 + 0.3; if (ff.dir[0] > 0) b.x1 = lot.x1 - 0.3; if (ff.dir[1] < 0) b.z0 = lot.z0 + 0.3; if (ff.dir[1] > 0) b.z1 = lot.z1 - 0.3; }
  const set = (key, v) => { if (key === 'x0') b.x0 = v; else if (key === 'x1') b.x1 = v; else if (key === 'z0') b.z0 = v; else b.z1 = v; };
  if (kind === 'petrol') {
    // The kiosk at the back of the lot (7 m deep, about 12 wide), a canopy over the pumps between it and the road, and a tall price sign.
    const kw = Math.min(13, along - 8), kd = 7, mid = f.dir[0] !== 0 ? (lot.z0 + lot.z1) / 2 : (lot.x0 + lot.x1) / 2, forecourt = Math.min(13, depth - kd - 2);
    if (f.dir[0] !== 0) { const back = f.dir[0] < 0 ? lot.x1 - 1 : lot.x0 + 1; b.z0 = mid - kw / 2; b.z1 = mid + kw / 2; if (f.dir[0] < 0) { b.x1 = back; b.x0 = back - kd; } else { b.x0 = back; b.x1 = back + kd; } }
    else { const back = f.dir[1] < 0 ? lot.z1 - 1 : lot.z0 + 1; b.x0 = mid - kw / 2; b.x1 = mid + kw / 2; if (f.dir[1] < 0) { b.z1 = back; b.z0 = back - kd; } else { b.z0 = back; b.z1 = back + kd; } }
    city.buildMass(ctx, b, 'brick', 4.2, [], rnd, { rect: true, color: col(0.9, 0.88, 0.82) });
    city.faceBox(G.props, b, f, -kw / 2 - 0.2, kw / 2 + 0.2, 0, 1.0, CURB + 3.2, CURB + 3.5, col(0.75, 0.1, 0.12));                    // the red fascia
    signOver(city, ctx, b, f, 4, 3.55, 5.2, 1.3, 0.1);
    const door = frontDoor(city, ctx, b, f, 'petrol', { h: 2.4 });
    // Canopy: a flat roof on four posts, with the pumps under it.
    const cw = Math.min(11, kw), cd = Math.min(7, forecourt - 1); const cb = { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 };
    const [qx, qz] = city.facePt(b, f, 0, forecourt * 0.62), cx0 = qx - (f.dir[0] !== 0 ? cd / 2 : cw / 2), cx1 = qx + (f.dir[0] !== 0 ? cd / 2 : cw / 2), cz0 = qz - (f.dir[0] !== 0 ? cw / 2 : cd / 2), cz1 = qz + (f.dir[0] !== 0 ? cw / 2 : cd / 2);
    G.props.box(cx0, cz0, cx1, cz1, CURB + 5.0, CURB + 5.6, 4, col(0.92, 0.92, 0.9)); G.props.box(cx0 - 0.1, cz0 - 0.1, cx1 + 0.1, cz1 + 0.1, CURB + 5.45, CURB + 5.6, 4, col(0.75, 0.1, 0.12));
    for (const [px, pz] of [[cx0 + 0.4, cz0 + 0.4], [cx1 - 0.4, cz0 + 0.4], [cx0 + 0.4, cz1 - 0.4], [cx1 - 0.4, cz1 - 0.4]]) { G.props.box(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2, CURB, CURB + 5.0, 3, col(0.85, 0.85, 0.85)); addCollider({ type: 'circ', x: px, z: pz, r: 0.35 }, ctx.colliders); }
    const alongX = f.dir[0] === 0;                                                                              // the pumps: two islands under the canopy
    for (const t of [0.3, 0.7]) {
      const ax = alongX ? cx0 + (cx1 - cx0) * t : (cx0 + cx1) / 2, az = alongX ? (cz0 + cz1) / 2 : cz0 + (cz1 - cz0) * t;
      G.props.box(ax - 0.4, az - 0.4, ax + 0.4, az + 0.4, CURB, CURB + 0.2, 3, col(0.6, 0.6, 0.58)); G.props.box(ax - 0.28, az - 0.28, ax + 0.28, az + 0.28, CURB + 0.2, CURB + 1.5, 3, col(0.85, 0.12, 0.14)); G.props.box(ax - 0.3, az - 0.3, ax + 0.3, az + 0.3, CURB + 1.5, CURB + 1.65, 3, col(0.1, 0.1, 0.1));
      addCollider({ type: 'box', x0: ax - 0.45, x1: ax + 0.45, z0: az - 0.45, z1: az + 0.45 }, ctx.colliders);
    }
    const [sx, sz] = city.facePt({ x0: lot.x0, x1: lot.x1, z0: lot.z0, z1: lot.z1 }, f, (rnd() < 0.5 ? -1 : 1) * (along / 2 - 2), 1.0);
    G.props.box(sx - 0.2, sz - 0.2, sx + 0.2, sz + 0.2, CURB, CURB + 7.0, 3, col(0.8, 0.8, 0.8)); city.faceSign(ctx, { x0: sx, x1: sx, z0: sz, z1: sz }, f, 4, 0, 0.3, CURB + 5.2, 2.8, 1.4);
    addCollider({ type: 'box', x0: sx - 0.25, x1: sx + 0.25, z0: sz - 0.25, z1: sz + 0.25 }, ctx.colliders); return door;
  }
  if (kind === 'shop') {
    city.buildMass(ctx, b, 'brick', 8.5, faces, rnd, { rect: true });
    const W = Math.min(along - 3, 11);
    city.faceBox(G.props, b, f, -W / 2, W / 2, -0.05, 0.16, CURB, CURB + 3.1, col(0.1, 0.12, 0.14));                                   // the shop window, dark
    city.faceBox(G.props, b, f, -W / 2 + 0.2, W / 2 - 0.2, -0.07, 0.2, CURB + 0.7, CURB + 2.9, col(0.3, 0.42, 0.45));
    city.faceBox(G.props, b, f, -W / 2 - 0.3, W / 2 + 0.3, 0, 1.6, CURB + 3.2, CURB + 3.5, [col(0.1, 0.5, 0.25), col(0.75, 0.15, 0.15), col(0.15, 0.3, 0.65)][(rnd() * 3) | 0]);      // the awning
    signOver(city, ctx, b, f, 5, 3.6, Math.min(7, W * 0.7), 1.6, 0.1);
    const door = frontDoor(city, ctx, b, f, 'shop', { h: 2.5 });
    const [kx, kz] = city.facePt(b, f, W / 2 + 2, 0.8); G.props.box(kx - 0.45, kz - 0.45, kx + 0.45, kz + 0.45, CURB, CURB + 1.3, 3, col(0.8, 0.5, 0.2)); addCollider({ type: 'box', x0: kx - 0.5, x1: kx + 0.5, z0: kz - 0.5, z1: kz + 0.5 }, ctx.colliders);       // a newspaper stand
    return door;
  }
  if (kind === 'jeweller') {
    city.buildMass(ctx, b, 'modern', 12 + Math.floor(rnd() * 3) * 3.5, faces, rnd, { rect: true, color: col(0.18, 0.16, 0.16) });
    const W = Math.min(along - 4, 13), gold = col(0.85, 0.65, 0.2);
    city.faceBox(G.props, b, f, -W / 2, W / 2, -0.04, 0.3, CURB, CURB + 3.6, col(0.08, 0.07, 0.08));
    for (const s of [-1, 1]) city.faceBox(G.props, b, f, s * (W / 2 - 3.4) - 2.2, s * (W / 2 - 3.4) + 2.2, -0.08, 0.32, CURB + 0.6, CURB + 3.0, col(0.35, 0.45, 0.5));      // the display windows
    city.faceBox(G.props, b, f, -W / 2 - 0.2, W / 2 + 0.2, -0.1, 0.5, CURB + 3.6, CURB + 3.75, gold); city.faceBox(G.props, b, f, -W / 2 - 0.2, W / 2 + 0.2, -0.1, 0.5, CURB + 0.0, CURB + 0.18, gold);
    signOver(city, ctx, b, f, 6, 3.85, Math.min(8, W * 0.7), 1.9, 0.12);
    const door = frontDoor(city, ctx, b, f, 'jeweller', { h: 2.6, pane: col(0.2, 0.3, 0.34) });
    for (const t of [-1.6, 1.6]) { const [px, pz] = city.facePt(b, f, t, 1.0); G.props.box(px - 0.08, pz - 0.08, px + 0.08, pz + 0.08, CURB, CURB + 1.0, 3, gold); addCollider({ type: 'circ', x: px, z: pz, r: 0.25 }, ctx.colliders); }
    return door;
  }
  return null;
}
