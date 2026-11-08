// The places outside the city: a town, farms, a harbour, a seaside village and a lighthouse on the coast, a ski resort in the mountains, a ghost-town
// and an oil field and a solar farm and a radio telescope in the desert. Only numbers here (no three.js), so the ground, the roads, the plants, the
// physics, the map and the tests agree on where everything is; towns.js builds them.
//
//   pads     flat ground (rectangles or ellipses, any turn) that the land is levelled to, with a slope out to the natural ground over `blend` metres
//   link     the motorway the access road leaves from, and roughly where (the nearest point of that road is used)
//   access   points the access road goes through on the way from the motorway to the site
//   streets  the streets inside the site (a polyline each, with its half width)
//   show     how far away (m) the site is still drawn

// A farm's fields: one each side of the yard along the road and one further out (`side` is which way the third lies; the access road comes in from the other).
const farmFields = (x, z, side) => [{ x: x - 20, z: z - 235, hx: 150, hz: 105 }, { x: x - 20, z: z + 235, hx: 150, hz: 105 }, { x: x + side * 300, z, hx: 120, hz: 130 }];
export const SITES = [
  { id: 'willow', name: 'Willow Creek', kind: 'town', biome: 'grassland', x: 520, z: 3500, show: 2600,
    pads: [{ hx: 360, hz: 250, round: true, blend: 140 }], link: { road: 'south', at: [0, 3500] },
    streets: [{ pts: [[200, 3500], [840, 3500]], hw: 7 }, { pts: [[520, 3300], [520, 3700]], hw: 6 }, { pts: [[330, 3650], [740, 3650]], hw: 5.5 }] },
  { id: 'farm1', name: 'Hollow Farm', kind: 'farm', biome: 'grassland', x: -620, z: 4400, show: 2000,
    pads: [{ hx: 135, hz: 105, round: true, blend: 110 }], link: { road: 'south', at: [0, 4400] }, access: [], end: [-520, 4400], fields: farmFields(-620, 4400, -1) },
  { id: 'farm2', name: 'Meadow Farm', kind: 'farm', biome: 'grassland', x: 760, z: 5100, show: 2000,
    pads: [{ hx: 135, hz: 105, round: true, blend: 110 }], link: { road: 'south', at: [0, 5100] }, access: [], end: [660, 5100], fields: farmFields(760, 5100, 1) },
  { id: 'farm3', name: 'Windy Acres', kind: 'farm', biome: 'grassland', x: -900, z: 2850, show: 2000,
    pads: [{ hx: 135, hz: 105, round: true, blend: 110 }], link: { road: 'south', at: [0, 2850] }, access: [], end: [-800, 2850], fields: farmFields(-900, 2850, -1) },

  { id: 'harbour', name: 'Port Meridian', kind: 'harbour', biome: 'coast', x: -3080, z: 620, show: 2600,
    pads: [{ hx: 150, hz: 270, round: true, blend: 80, y: 0.9, surface: 'concrete' }, { x: -3240, z: 620, hx: 80, hz: 150, round: false, blend: 10, y: 0.9, surface: 'concrete' }], link: { road: 'ring', at: [-2817, 620] },
    streets: [{ pts: [[-3015, 620], [-3300, 620]], hw: 8 }, { pts: [[-3150, 440], [-3150, 800]], hw: 7 }] },
  { id: 'cove', name: 'Sandy Cove', kind: 'village', biome: 'coast', x: -3060, z: 2300, show: 2200,
    pads: [{ hx: 120, hz: 230, round: true, blend: 80, y: 0.9 }], link: { road: 'ring', at: [-2754, 2299] },
    streets: [{ pts: [[-2985, 2300], [-3200, 2300]], hw: 6 }, { pts: [[-3100, 2140], [-3100, 2460]], hw: 5 }] },
  { id: 'lighthouse', name: 'North Point Light', kind: 'lighthouse', biome: 'coast', x: -3140, z: -1800, show: 2200,
    pads: [{ hx: 70, hz: 70, round: true, blend: 50, y: 1.4 }], link: { road: 'ring', at: [-2758, -1805] }, end: [-3140, -1800] },

  { id: 'resort', name: 'Frostline Resort', kind: 'resort', biome: 'mountains', x: 330, z: -4250, show: 3000,
    pads: [{ hx: 250, hz: 190, round: false, blend: 150 }], link: { road: 'north', at: [0, -4250] },
    streets: [{ pts: [[120, -4250], [560, -4250]], hw: 7 }, { pts: [[330, -4110], [330, -4390]], hw: 6 }] },

  { id: 'gulch', name: 'Dusty Gulch', kind: 'western', biome: 'desert', x: 3250, z: 360, show: 2400,
    pads: [{ hx: 240, hz: 170, round: false, blend: 100 }], link: { road: 'east', at: [3250, 0] },
    streets: [{ pts: [[3040, 360], [3470, 360]], hw: 8 }] },
  { id: 'oil', name: 'Black Mesa Oil Field', kind: 'oil', biome: 'desert', x: 3300, z: -1250, show: 2600,
    pads: [{ hx: 80, hz: 60, round: false, blend: 40, surface: 'gravel' }], link: { road: 'east', at: [3300, 0] }, end: [3300, -1250] },
  { id: 'solar', name: 'Dry Lake Solar', kind: 'solar', biome: 'desert', x: 6000, z: 5050, show: 2600,
    pads: [{ hx: 300, hz: 190, round: false, blend: 120 }], link: { road: 'ring', at: [6500, 5050] }, end: [6000, 5050] },
  { id: 'dishes', name: 'Dry Lake Telescope', kind: 'dishes', biome: 'desert', x: 5950, z: 1950, show: 2600,
    pads: [{ hx: 200, hz: 200, round: true, blend: 120 }], link: { road: 'ring', at: [6500, 1950] }, end: [5950, 1950] },
];

// Where on the map (and in the road list) things are: the centre, and every street's centre line.
export const siteById = id => SITES.find(s => s.id === id);

// The signed distance from a point to the edge of a pad (negative inside it, in metres). A rectangle or an ellipse, turned by `rot` about its centre.
export function padDist(p, x, z) {
  const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0), dx = x - p.x, dz = z - p.z, u = dx * c + dz * s, v = -dx * s + dz * c;
  if (p.round) { const r = Math.hypot(u / p.hx, v / p.hz); return (r - 1) * Math.min(p.hx, p.hz); }
  const qx = Math.abs(u) - p.hx, qz = Math.abs(v) - p.hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}
