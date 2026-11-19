// The cars the dealership sells (dealer.js; their bodies are built in marques.js): what each one is, what it costs, its paints, its size, and how it
// drives. Plain numbers, no three.js, so the tests (and anything else) can put a car through its paces with the game's own physics (vehicle.js).
//
// The makes and models are made up. Each car is drawn from the shape of a kind of car you will know (a rear-engined sports coupé with round lamps on its
// wings, a wedge-shaped V12, a stately limousine with a tall grille, a square-rigged off-roader, a sixteen-cylinder hypercar...), but carries no real
// maker's name, badge or crest.

// dims: where the wheels are (wzf, wzr: the axles, along the car from its middle; track: between the tyres' middles), their radius, and the length and
// width of the body. phys: the weight (kg), the peak torque (Nm) and where it peaks, the red line, the top speed (m/s: where the gearing runs out), the
// aero drag (½ρCdA), the grip, the share of the drive to the front wheels (0: rear-wheel drive), the height of the centre of mass and where it sits
// between the axles (0: on the rear axle, 1: on the front), the gears, the downforce, how far the springs sag under the car's weight (m).
export const CARS = [
  {
    id: 'r9turbo', make: 'FALKNER', model: 'R9 TURBO', price: 168000, type: 'Rear-engined sports coupé', engine: '3.7-litre twin-turbo flat six', drive: 'AWD', hp: 650,
    blurb: 'The shape everyone knows: round lamps up on the wings, a fastback sweeping down over the engine, wide hips over the back wheels and a light bar right across the tail. Four-wheel drive, two turbochargers and an eight-speed gearbox.',
    paints: ['silver', 'black', 'red', 'chalk', 'blue', 'yellow'],
    dims: { wzf: 1.29, wzr: -1.16, track: 1.62, wheelR: 0.35, len: 4.54, width: 1.9 },
    phys: { mass: 1640, T: 800, peak: 4800, red: 7200, vmax: 92, drag: 0.36, mu: 1.34, front: 0.24, cgH: 0.46, cgAt: 0.38, gears: 8, down: 0.55, sag: 0.055 },
  },
  {
    id: 'r9rs', make: 'FALKNER', model: 'R9 RS', price: 215000, type: 'Track-bred sports coupé', engine: '4.0-litre flat six, no turbos', drive: 'RWD', hp: 525,
    blurb: 'The same car made for the track: lighter, lower and stiffer, a swan-neck wing standing over the tail, vents in the bonnet and louvres on the wings. A screaming engine that revs to 9,000, and the back wheels do all the work.',
    paints: ['green', 'white', 'black', 'red', 'orange', 'silver'],
    dims: { wzf: 1.29, wzr: -1.16, track: 1.64, wheelR: 0.35, len: 4.57, width: 1.9 },
    phys: { mass: 1450, T: 470, peak: 6300, red: 9000, vmax: 82, drag: 0.42, mu: 1.4, front: 0, cgH: 0.44, cgAt: 0.38, gears: 7, down: 1.4, sag: 0.045 },
  },
  {
    id: 'halcyon', make: 'HALCYON', model: 'S8', price: 295000, type: 'Mid-engined supercar', engine: '4.0-litre twin-turbo V8', drive: 'RWD', hp: 720,
    blurb: 'A carbon tub and a teardrop canopy, deep-set lamps like eye sockets, air channels through the doors and an air brake that stands up across the tail. Rear-wheel drive and very light.',
    paints: ['orange', 'white', 'graphite', 'blue', 'green', 'black'],
    dims: { wzf: 1.32, wzr: -1.35, track: 1.68, wheelR: 0.35, len: 4.54, width: 1.93 },
    phys: { mass: 1420, T: 770, peak: 5500, red: 8100, vmax: 94, drag: 0.36, mu: 1.36, front: 0, cgH: 0.44, cgAt: 0.42, gears: 7, down: 1.0, sag: 0.05 },
  },
  {
    id: 'bergwagen', make: 'KAISER', model: 'BERGWAGEN', price: 178000, type: 'Luxury off-roader', engine: '4.0-litre twin-turbo V8', drive: '4WD', hp: 585,
    blurb: 'A box on wheels and proud of it: upright glass, round lamps, indicators on the wings, the spare wheel on the back door and exhausts that come out of the sides. Tall, heavy and very fast for what it is.',
    paints: ['mattblack', 'white', 'sand', 'graphite', 'green', 'silver'],
    dims: { wzf: 1.48, wzr: -1.41, track: 1.66, wheelR: 0.41, len: 4.87, width: 1.98 },
    phys: { mass: 2560, T: 850, peak: 4200, red: 6500, vmax: 61, drag: 0.72, mu: 1.0, front: 0.38, cgH: 0.78, cgAt: 0.52, gears: 9, down: 0, sag: 0.085, steer: 0.62 },
  },
  {
    id: 'sovereign', make: 'ASHWORTH', model: 'SOVEREIGN', price: 455000, type: 'Grand limousine', engine: '6.75-litre twin-turbo V12', drive: 'RWD', hp: 563,
    blurb: 'Nearly six metres of it: a tall chrome grille like the front of a temple, a long bonnet, a high waist, doors hinged at the back for the rear seats, and a cabin of wood and leather. It glides; it does not hurry.',
    paints: ['black', 'silver', 'midnight', 'burgundy', 'white', 'champagne'],
    dims: { wzf: 1.88, wzr: -1.67, track: 1.7, wheelR: 0.4, len: 5.76, width: 2.02 },
    phys: { mass: 2560, T: 900, peak: 3800, red: 6000, vmax: 70, drag: 0.5, mu: 1.06, front: 0, cgH: 0.6, cgAt: 0.52, gears: 8, down: 0.05, sag: 0.1, damp: 0.5 },
  },
  {
    id: 'furia', make: 'TAURINO', model: 'FURIA V12', price: 495000, type: 'V12 supercar', engine: '6.5-litre V12, no turbos', drive: 'AWD', hp: 770,
    blurb: 'A wedge cut from one line, nose to roof: Y-shaped lamps, huge intakes behind the doors, hexagons all over the engine cover and an exhaust like a nut in the middle of the tail. The engine sits behind your head and howls to 8,500.',
    paints: ['green', 'orange', 'yellow', 'white', 'purple', 'graphite'],
    dims: { wzf: 1.3, wzr: -1.4, track: 1.72, wheelR: 0.36, len: 4.8, width: 2.03 },
    phys: { mass: 1575, T: 720, peak: 6750, red: 8500, vmax: 97, drag: 0.38, mu: 1.32, front: 0.3, cgH: 0.45, cgAt: 0.43, gears: 7, down: 0.9, sag: 0.05 },
  },
  {
    id: 'vitesse', make: 'DELORME', model: 'VITESSE 16', price: 2950000, type: 'Hypercar', engine: '8.0-litre quad-turbo sixteen-cylinder', drive: 'AWD', hp: 1500,
    blurb: 'The fastest car in the city: sixteen cylinders, four turbochargers and 1,500 horsepower. A tall oval grille, a fin along the spine, a great sweep of polished metal round each side, and a single light right across the tail. Over 400 km/h.',
    paints: ['twoblue', 'black', 'silver', 'red', 'white', 'champagne'],
    dims: { wzf: 1.34, wzr: -1.37, track: 1.72, wheelR: 0.36, len: 4.54, width: 2.04 },
    phys: { mass: 1995, T: 1600, peak: 4600, red: 6700, vmax: 116, drag: 0.4, mu: 1.4, front: 0.32, cgH: 0.45, cgAt: 0.44, gears: 7, down: 1.0, sag: 0.05 },
  },
];
export const CAR_BY_ID = Object.fromEntries(CARS.map(c => [c.id, c]));
// The car you start with (the Vento SV, main.js): not for sale, it is yours already.
export const STARTER = 'vento';

// The paints (marques.js builds the material): a name, a colour, how metallic and how rough; matt ones have no clear coat.
export const MPAINTS = {
  silver: { name: 'Liquid Silver', color: 0xb9bdc3, metal: 0.85, rough: 0.28 },
  black: { name: 'Midnight Black', color: 0x0b0b0e, metal: 0.45, rough: 0.22 },
  red: { name: 'Racing Red', color: 0xb0121a, metal: 0.3, rough: 0.26 },
  chalk: { name: 'Chalk', color: 0xd9d6cc, metal: 0.05, rough: 0.3 },
  blue: { name: 'Deep Blue', color: 0x1a3a86, metal: 0.65, rough: 0.28 },
  yellow: { name: 'Sunburst Yellow', color: 0xf0bf14, metal: 0.35, rough: 0.27 },
  green: { name: 'Acid Green', color: 0x7ccc2a, metal: 0.5, rough: 0.28 },
  white: { name: 'Ivory White', color: 0xeeece6, metal: 0.15, rough: 0.27 },
  orange: { name: 'Signal Orange', color: 0xff6410, metal: 0.45, rough: 0.27 },
  graphite: { name: 'Graphite Grey', color: 0x3a3d43, metal: 0.8, rough: 0.3 },
  purple: { name: 'Royal Purple', color: 0x5a238f, metal: 0.65, rough: 0.28 },
  mattblack: { name: 'Matt Black', color: 0x141416, metal: 0.2, rough: 0.62, matte: true },
  sand: { name: 'Desert Sand', color: 0xb79c73, metal: 0.15, rough: 0.55, matte: true },
  midnight: { name: 'Midnight Sapphire', color: 0x0f1a36, metal: 0.7, rough: 0.25 },
  burgundy: { name: 'Burgundy', color: 0x4a0d18, metal: 0.6, rough: 0.25 },
  champagne: { name: 'Champagne', color: 0xc8b48c, metal: 0.8, rough: 0.27 },
  twoblue: { name: 'French Blue', color: 0x1d3f8a, metal: 0.7, rough: 0.25 },
};

// What a car is like to drive, in the shape of vehicle.js's SPEC: springs from the weight on each axle and how far they sag, dampers near critical,
// a gearbox spread from first to top with top gear reaching the red line at the car's top speed, brakes and anti-roll bars to its weight.
export function marqueSpec(c) {
  if (typeof c === 'string') c = CAR_BY_ID[c];
  const K = c.phys, D = c.dims, m = K.mass, G = 9.81, k = m / 1650;
  const cg = D.wzr + (D.wzf - D.wzr) * K.cgAt, a = D.wzf - cg, b = cg - D.wzr, L = a + b, half = D.track / 2;
  const Ff = m * G * b / L / 2, Fr = m * G * a / L / 2, sag = K.sag ?? 0.06;
  const spring = [Ff / sag, Ff / sag, Fr / sag, Fr / sag];
  const damper = spring.map((s, i) => (K.damp ?? 0.62) * Math.sqrt(s * (i < 2 ? Ff : Fr) / G));
  // First gear: just enough to spin the driven wheels on their grip (any more and the traction control only cuts it back; a heavy car gets all the
  // gear it can use), so the gears spread from there to top.
  const wr = D.wheelR, top = (K.red * Math.PI / 30) * wr / K.vmax, final = 3.5;
  const share = K.front > 0 ? 1 : Math.min(1, 1 - K.cgAt + 0.18), need = K.mu * m * G * share * 1.08 * wr / (K.T * 0.9);
  const spread = K.spread ?? Math.min(K.gears >= 8 ? 4.6 : 4.0, Math.max(2.4, need / top));
  const gears = Array.from({ length: K.gears }, (_, i) => +(top * spread * Math.pow(1 / spread, i / (K.gears - 1)) / final).toFixed(3));
  const brake = (K.brake ?? 1.05) * k;
  return {
    mass: m, cgH: K.cgH, rollH: K.cgH * 0.6, len: D.len, wid: D.width, cgOff: -cg, model: c.id,
    wheelPos: [[a, -half], [a, half], [-b, -half], [-b, half]],
    wheelR: wr, wheelI: 1.3 * (wr / 0.345) ** 2 * Math.sqrt(k), engineI: 0.22 * Math.sqrt(k),
    spring, damper, arb: [30000 * k * (0.05 / sag), 20000 * k * (0.05 / sag)], travel: K.travel ?? (sag > 0.08 ? 0.14 : 0.11),
    mu: K.mu, kPeak: 0.1, aPeak: [0.13, 0.115], C: [1.55, 1.38],
    gears, rev: +(gears[0] * 0.95).toFixed(3), final, eff: 0.9,
    idle: K.idle ?? 850, redline: K.red, limiter: K.red + 250, Tmax: K.T, peakRpm: K.peak,
    drag: K.drag, roll: 10 * Math.sqrt(k), down: K.down, brakeT: [2400 * brake, 2400 * brake, 1450 * brake, 1450 * brake], handT: 3200 * k, steerMax: K.steer ?? 0.6, frontDrive: K.front,
    nitroForce: 0, dialKmh: Math.ceil((K.vmax * 3.6 + 20) / 20) * 20,
  };
}
