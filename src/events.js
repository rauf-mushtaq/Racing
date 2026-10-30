// Races through the city: each is a route of junctions with a checkpoint gate
// at every turn (and every other junction on long straights).
import * as THREE from 'three';
import { SP, hw, laneOffset, N } from './city.js';
import { glowTex } from './textures.js';

// A staircase of turns from one corner to the opposite one.
function stairs(x0, z0, x1, z1) {
  const nodes = [[x0, z0]]; let x = x0, z = z0;
  while (x !== x1 || z !== z1) {
    if (z !== z1) { z += Math.sign(z1 - z); nodes.push([x, z]); }
    if (x !== x1) { x += Math.sign(x1 - x); nodes.push([x, z]); }
  }
  return nodes;
}

export const EVENTS = [
  { id: 'blvd', name: 'Boulevard Dash', desc: 'Flat out down Sunset Boulevard, the whole length of the city.', nodes: [[0, 12], [0, -12]] },
  { id: 'downtown', name: 'Downtown Dash', desc: 'Short and twisty through the glass towers.', nodes: [[0, 3], [0, 1], [-1, 1], [-1, -1], [1, -1], [1, -3], [0, -3], [0, -4]] },
  { id: 'palms', name: 'Palm Zigzag', desc: 'A staircase of turns across the middle of town under the palms.', nodes: stairs(-6, 6, 6, -6) },
  { id: 'crosstown', name: 'Crosstown', desc: 'East to west on the big roads, with a detour downtown.', nodes: [[12, 4], [0, 4], [0, -4], [-12, -4], [-12, 0], [-4, 0]] },
  { id: 'ring', name: 'Inner Ring', desc: 'One lap of the six-lane ring road around downtown.', nodes: [[0, 4], [4, 4], [4, -4], [-4, -4], [-4, 4], [0, 4]], lap: true },
  { id: 'coast', name: 'Coast Road', desc: 'Down the western edge of the city with the ocean beside you.', nodes: [[-12, 12], [-12, -12]] },
  { id: 'hills', name: 'Hill Run', desc: 'Along the northern ring road under the hills.', nodes: [[-12, -12], [12, -12], [12, -4]] },
  { id: 'suburb', name: 'Suburb Sprint', desc: 'Tight turns through the quiet streets of the south-east suburbs.', nodes: [[8, 8], [12, 8], [12, 12], [4, 12], [4, 9], [7, 9], [7, 11], [8, 11]] },
  { id: 'grand', name: 'Grand Tour', desc: 'The long one: downtown, the hills road and the suburbs, 10 km in all.', nodes: [[0, 12], [0, 8], [8, 8], [8, 0], [4, 0], [4, -4], [-4, -4], [-4, 4], [-8, 4], [-8, 12]] },
];

// Expand the route into checkpoints and a start pose.
export function buildRoute(ev) {
  const cps = [], path = [];
  const nodes = ev.nodes;
  for (let k = 0; k < nodes.length - 1; k++) {
    const [a, b] = [nodes[k], nodes[k + 1]];
    const di = Math.sign(b[0] - a[0]), dj = Math.sign(b[1] - a[1]);
    const steps = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    for (let s = 1; s <= steps; s++) {
      const i = a[0] + di * s, j = a[1] + dj * s;
      const last = s === steps, isTurnOrEnd = last;
      if (isTurnOrEnd || s % 2 === 0) cps.push({ i, j, x: i * SP, z: j * SP, alongZ: di === 0 });
    }
  }
  for (const n of nodes) path.push([n[0] * SP, n[1] * SP]);
  // Start: on the first road, 50 m past the first junction, in the middle lane.
  const [a, b] = nodes;
  const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]);
  const k = dx === 0 ? a[0] : a[1];
  const cross = dx === 0 ? hw(a[1]) : hw(a[0]);
  const rx = -dz, rz = dx, off = laneOffset(k, 1);
  const start = { x: a[0] * SP + dx * (cross + 26) + rx * off, z: a[1] * SP + dz * (cross + 26) + rz * off, h: Math.atan2(dx, dz) };
  path[0] = [start.x, start.z];
  let length = 0;
  for (let k2 = 1; k2 < path.length; k2++) length += Math.hypot(path[k2][0] - path[k2 - 1][0], path[k2][1] - path[k2 - 1][1]);
  // Medal times from the route: about 140 km/h on straights, less a bit per turn.
  const turns = nodes.length - 2;
  const gold = Math.round((length / 50 + turns * 1.8) * 10) / 10;
  return { ev, cps, path, start, length, medals: { gold, silver: Math.round(gold * 1.12 * 10) / 10, bronze: Math.round(gold * 1.28 * 10) / 10 } };
}

// Checkpoint gates: two light pillars and a beam, plus a tall beacon you can
// see over the buildings.
export class Gates {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.glow = glowTex();
  }
  clear() { while (this.group.children.length) this.group.remove(this.group.children[0]); this.items = []; }
  build(route) {
    this.clear();
    const pillarGeo = new THREE.CylinderGeometry(0.35, 0.35, 7, 12);
    route.cps.forEach((cp, i) => {
      const g = new THREE.Group(); g.position.set(cp.x, 0, cp.z);
      const last = i === route.cps.length - 1;
      const col = last ? new THREE.Color(4, 4, 4) : new THREE.Color(0.3, 2.6, 3.4);
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 });
      // Gate across the road the car arrives on.
      const prev = i ? route.cps[i - 1] : { x: route.start.x, z: route.start.z };
      const alongZ = Math.abs(cp.x - prev.x) < Math.abs(cp.z - prev.z);
      const halfW = alongZ ? hw(cp.i) : hw(cp.j);
      const span = halfW + 1.5;
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(pillarGeo, mat); p.position.set(alongZ ? s * span : 0, 3.5, alongZ ? 0 : s * span); g.add(p);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? span * 2 : 0.5, 0.5, alongZ ? 0.5 : span * 2), mat); beam.position.y = 7; g.add(beam);
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(span * 2, 7), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      curtain.position.y = 3.5; if (!alongZ) curtain.rotation.y = Math.PI / 2; g.add(curtain);
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 260, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      beacon.position.y = 130; g.add(beacon);
      if (last) {
        // Chequered banner on the finish.
        const c = document.createElement('canvas'); c.width = 256; c.height = 32; const x = c.getContext('2d');
        for (let a = 0; a < 16; a++) for (let b = 0; b < 2; b++) { x.fillStyle = (a + b) % 2 ? '#111' : '#fff'; x.fillRect(a * 16, b * 16, 16, 16); }
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        const ban = new THREE.Mesh(new THREE.PlaneGeometry(span * 2, 1.2), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
        ban.position.y = 6.2; if (!alongZ) ban.rotation.y = Math.PI / 2; g.add(ban);
      }
      g.userData = { mat, beacon, curtain };
      this.group.add(g); this.items.push(g);
    });
  }
  update(next, t) {
    (this.items || []).forEach((g, i) => {
      g.visible = i >= next && i <= next + 1;
      const active = i === next;
      g.userData.mat.opacity = active ? 0.9 : 0.25;
      g.userData.beacon.visible = active;
      g.userData.curtain.material.opacity = active ? 0.07 + 0.05 * Math.sin(t * 6) : 0.02;
    });
  }
}

export function inCheckpoint(cp, x, z) {
  return Math.abs(x - cp.x) < hw(cp.i) + 3 && Math.abs(z - cp.z) < hw(cp.j) + 3;
}
export { N };
