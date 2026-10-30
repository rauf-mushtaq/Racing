// Sunset City: start-up, the game loop, cameras, menus and races.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { $, clamp, damp, lerp, wrapAngle, LOW_POWER, fmtTime } from './util.js';
import { settings, save } from './store.js';
import { setAnisotropy } from './textures.js';
import { buildSky, placeSun } from './sky.js';
import { buildCity, surfaceAt, SP, N, EDGE, laneOffset, queryColliders, signalState, showSignals } from './city.js';
import { buildTerrain } from './terrain.js';
import { TOD, TOD_NAME } from './tod.js';
import { makeHeroCar, setPaint, PAINTS, HERO_DIMS, drawCluster } from './carModel.js';
import { Vehicle } from './vehicle.js';
import { collideStatic, collideTraffic } from './collide.js';
import { Traffic } from './traffic.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { EVENTS, buildRoute, Gates, inCheckpoint } from './events.js';

const loadMsg = t => { $('load-msg').textContent = t; };
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const quality = settings.quality || (LOW_POWER ? 'medium' : 'high');
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'low', powerPreference: 'high-performance', stencil: false });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = TOD.exposure;
renderer.shadowMap.enabled = quality !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
const basePR = Math.min(devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'medium' ? (LOW_POWER ? 1.25 : 1.5) : 1);
let resScale = 1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 12000);

// Post-processing: ambient occlusion (High), bloom, a speed blur, vignette and
// a colour grade, then ACES.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uBlur: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.45) },
    uSat: { value: TOD.grade.sat }, uContrast: { value: TOD.grade.contrast }, uWarm: { value: TOD.grade.warm }, uSunset: { value: TOD_NAME === 'sunset' ? 1 : 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uBlur; uniform vec2 uCenter; uniform float uSat, uContrast, uWarm, uSunset; varying vec2 vUv;
    void main(){
      vec2 dir = vUv - uCenter; float d = length(dir);
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (uBlur > 0.002) {
        vec3 acc = col; float s = uBlur * smoothstep(0.12, 0.7, d) * 0.06;
        for (int i = 1; i < 8; i++) acc += texture2D(tDiffuse, vUv - dir * s * float(i)).rgb;
        col = acc / 8.0;
      }
      float vig = smoothstep(1.1, 0.3, d);
      col *= mix(mix(0.78, 0.62, uSunset), 1.0, vig);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, mix(col * vec3(0.96, 0.93, 1.07), col * vec3(1.05, 1.0, 0.93), smoothstep(0.0, 0.8, l)), uSunset);
      // Saturation, contrast around mid-grey (in linear light) and a touch of warmth.
      col = max(vec3(0.0), mix(vec3(l), col, uSat));
      col = 0.18 * pow(col / 0.18, vec3(uContrast));
      col *= vec3(1.0 + uWarm, 1.0, 1.0 - uWarm);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
let composer = null, bloom = null, grade = null, gtao = null;
if (quality !== 'low') {
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: quality === 'high' ? 4 : 2 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (quality === 'high') {
    try {
      gtao = new GTAOPass(scene, camera, 4, 4);
      gtao.blendIntensity = 0.85;
      // Leave out see-through things (clouds, leaf cards, glows), which the
      // occlusion pass would otherwise treat as solid squares.
      const hideBase = gtao.overrideVisibility.bind(gtao);
      gtao.overrideVisibility = function () {
        hideBase();
        this.scene.traverse(o => { const m = o.material; if (m && !Array.isArray(m) && (m.transparent || m.alphaTest > 0 || !m.depthWrite)) o.visible = false; });
      };
      gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1.2, samples: 12 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      composer.addPass(gtao);
    } catch (e) { gtao = null; }
  }
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), TOD.lampsOn ? 0.42 : 0.22, 0.55, TOD.lampsOn ? 0.92 : 1.6);
  composer.addPass(bloom);
  grade = new ShaderPass(GradeShader); composer.addPass(grade);
  composer.addPass(new OutputPass());
}
function resize() {
  const w = innerWidth, h = innerHeight, pr = basePR * resScale;
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  if (composer) {
    composer.setPixelRatio(pr); composer.setSize(w, h);
    bloom.resolution.set(w * pr * (quality === 'high' ? 0.5 : 0.35), h * pr * (quality === 'high' ? 0.5 : 0.35));
  }
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
let sky, city, traffic, carMesh, fx, gates, hud;
const car = new Vehicle();
const input = new Input();
const audio = new AudioEngine();
const START = { x: laneOffset(0, 1), z: N * SP - 42, h: Math.PI };

async function build() {
  loadMsg('Painting the sky…'); await nextFrame();
  sky = buildSky(scene, renderer, quality);
  loadMsg('Building the city…'); await nextFrame();
  city = buildCity(scene, quality);
  buildTerrain(scene, !TOD.lampsOn);
  loadMsg('Starting the traffic…'); await nextFrame();
  traffic = new Traffic(scene, city.parked, quality === 'high');
  carMesh = makeHeroCar(settings.color);
  scene.add(carMesh);
  fx = new FX(scene);
  gates = new Gates(scene);
  hud = new HUD();
  car.reset(START.x, START.z, START.h);
  traffic.setDensity(settings.traffic, car);
  applyAids();
  resize();
  loadMsg('Warming up…'); await nextFrame();
  renderer.compile(scene, camera);
}

function applyAids() {
  car.abs = settings.abs; car.tcs = settings.tcs; car.esp = settings.esp; car.auto = settings.auto; car.steerAssist = settings.steerAssist;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const game = { state: 'loading', prev: null, route: null, next: 0, t: 0, cdT: 0, camMode: settings.cam ?? 0, shake: 0, menuT: 0, garage: false, splits: [] };
let carY = 0.0, camYaw = START.h, pitch = 0, roll = 0, pitchV = 0, rollV = 0;

function setState(s) {
  game.state = s;
  const driving = s === 'free' || s === 'race' || s === 'countdown';
  $('hud').classList.toggle('hidden', !driving && s !== 'finish');
  $('menu').classList.toggle('hidden', s !== 'menu');
  $('pause').classList.toggle('hidden', s !== 'paused');
  $('finish').classList.toggle('hidden', s !== 'finish');
  const touch = (input.lastDevice === 'touch' || (LOW_POWER && input.lastDevice === 'keyboard')) && driving;
  $('touch').classList.toggle('hidden', !touch);
  document.body.classList.toggle('touchmode', touch);
  $('cam-name').textContent = CAMS[game.camMode] || '';
  document.body.classList.toggle('tilt', settings.touchSteer === 'tilt');
  if (s !== 'race' && s !== 'countdown') hud && hud.race(null);
  if (hud) hud.resize();
}

function resetCar(x, z, h) {
  car.reset(x, z, h); carY = surfaceAt(x, z).y; camYaw = h; fx.reset();
}

function startFree() {
  game.route = null; gates.clear();
  if (game.state === 'menu') resetCar(car.x, car.z, car.h);
  setState('free'); hud.toast('FREE ROAM', 1.6);
}

function startEvent(ev) {
  const route = buildRoute(ev);
  game.route = route; game.next = 0; game.t = 0; game.cdT = 3.4; game.lastBeep = 4; game.splits = [];
  gates.build(route);
  resetCar(route.start.x, route.start.z, route.start.h);
  traffic.setDensity(settings.traffic, car);
  for (const c of traffic.cars) traffic.spawn(c, car, 40, 500, true);
  setState('countdown');
}

function finishRace() {
  const r = game.route, t = game.t, id = r.ev.id;
  const prevBest = settings.bests[id];
  const isBest = prevBest == null || t < prevBest;
  if (isBest) { settings.bests[id] = t; save(); }
  const m = r.medals, medal = t <= m.gold ? 'gold' : t <= m.silver ? 'silver' : t <= m.bronze ? 'bronze' : null;
  $('f-title').textContent = r.ev.name.toUpperCase();
  $('f-time').textContent = fmtTime(t);
  $('f-medal').innerHTML = medal ? `<span class="medal m-${medal}"></span> ${medal} medal` : 'No medal this time';
  $('f-table').innerHTML = `
    <tr><td><span class="medal m-gold"></span> Gold</td><td>${fmtTime(m.gold)}</td></tr>
    <tr><td><span class="medal m-silver"></span> Silver</td><td>${fmtTime(m.silver)}</td></tr>
    <tr><td><span class="medal m-bronze"></span> Bronze</td><td>${fmtTime(m.bronze)}</td></tr>
    <tr><td>${isBest ? 'New best!' : 'Your best'}</td><td>${fmtTime(settings.bests[id])}</td></tr>`;
  setState('finish');
  audio.beep(880, 0.25); setTimeout(() => audio.beep(1320, 0.4), 180);
}

function medalFor(id, route) {
  const t = settings.bests[id]; if (t == null) return 'none';
  const m = route.medals; return t <= m.gold ? 'gold' : t <= m.silver ? 'silver' : t <= m.bronze ? 'bronze' : 'none';
}

// Put the car back on the nearest road, in a lane, pointing the way it was going.
function respawnOnRoad() {
  let { x, z, h } = car;
  if (game.state === 'race' && game.route) {
    const prev = game.next > 0 ? game.route.cps[game.next - 1] : null, nxt = game.route.cps[game.next];
    if (prev && nxt) { x = prev.x; z = prev.z; h = Math.atan2(nxt.x - prev.x, nxt.z - prev.z); }
  }
  x = clamp(x, -EDGE, EDGE); z = clamp(z, -EDGE, EDGE);
  const kx = clamp(Math.round(x / SP), -N, N), kz = clamp(Math.round(z / SP), -N, N);
  if (Math.abs(x - kx * SP) <= Math.abs(z - kz * SP)) {
    const d = Math.cos(h) >= 0 ? 1 : -1; x = kx * SP - d * laneOffset(kx, 1); h = d > 0 ? 0 : Math.PI;
  } else {
    const d = Math.sin(h) >= 0 ? 1 : -1; z = kz * SP + d * laneOffset(kz, 1); h = d > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  resetCar(x, z, h);
}

// ---------------------------------------------------------------------------
// Input events
// ---------------------------------------------------------------------------
function togglePause() {
  if (game.state === 'paused') { $('pause-panel').classList.add('hidden'); setState(game.prev); audio.resume(); }
  else if (['free', 'race', 'countdown'].includes(game.state)) { game.prev = game.state; setState('paused'); }
}
input.on('pause', togglePause);
input.on('back', () => { if (game.state === 'paused') togglePause(); });
const CAMS = ['WIDE CHASE', 'CLOSE CHASE', 'DRIVER VIEW', 'HOOD CAMERA', 'BUMPER CAMERA'];
function nextCamera() {
  if (game.state === 'menu') return;
  game.camMode = (game.camMode + 1) % CAMS.length; settings.cam = game.camMode; save();
  hud.toast(CAMS[game.camMode], 1.2); $('cam-name').textContent = CAMS[game.camMode];
}
input.on('camera', nextCamera);
$('cam-btn').addEventListener('click', e => { e.stopPropagation(); nextCamera(); });
input.on('reset', () => { if (game.state === 'free' || game.state === 'race') respawnOnRoad(); });
input.on('shiftUp', () => { if (!car.auto) car.shift(1); });
input.on('shiftDown', () => { if (!car.auto) car.shift(-1); });
input.on('mute', () => { settings.sound = !settings.sound; save(); audio.setVolume(settings.volume, settings.sound); hud.toast(settings.sound ? 'SOUND ON' : 'SOUND OFF', 1); });
input.on('any', () => { audio.init(); audio.setVolume(settings.volume, settings.sound); });
input.on('wheel', () => { if (!settings.wheel || !settings.wheel.gas) hud.toast('Wheel connected: set up pedals in Settings', 3.5); });
input.bindTouch($('touch'));
document.addEventListener('pointerdown', () => input.emit('any'), { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) { audio.suspend(); if (['free', 'race', 'countdown'].includes(game.state)) togglePause(); } });

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------
const panel = $('panel');
function showPanel(html) { panel.innerHTML = html; panel.classList.remove('hidden'); }
function hidePanel() { panel.classList.add('hidden'); }

for (const b of document.querySelectorAll('[data-m]')) b.addEventListener('click', () => {
  document.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('sel', x === b));
  game.garage = false;
  const m = b.dataset.m;
  if (m === 'free') { hidePanel(); startFree(); }
  else if (m === 'events') eventsPanel();
  else if (m === 'garage') garagePanel();
  else if (m === 'settings') settingsPanel(panel);
  else if (m === 'controls') controlsPanel();
});

function eventsPanel() {
  const html = EVENTS.map((ev, i) => {
    const r = buildRoute(ev), best = settings.bests[ev.id];
    return `<button class="card" data-ev="${i}"><div><div class="t">${ev.name}</div><div class="d">${ev.desc}</div></div>
      <div class="r">${(r.length / 1000).toFixed(1)} km<br>${best != null ? fmtTime(best) : '—'}<span class="medal m-${medalFor(ev.id, r)}"></span></div></button>`;
  }).join('');
  showPanel(`<h2>EVENTS</h2><p class="hint">Drive through every checkpoint gate. Follow the yellow arrow and the blue line on the map. Traffic is on the roads, so watch out.</p>${html}`);
  panel.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => { hidePanel(); startEvent(EVENTS[+b.dataset.ev]); }));
}

function garagePanel() {
  game.garage = true;
  const sw = Object.entries(PAINTS).map(([k, p]) => `<button class="sw ${settings.color === k ? 'on' : ''}" data-c="${k}"><i style="background:#${p.color.toString(16).padStart(6, '0')}"></i>${p.name}</button>`).join('');
  showPanel(`<h2>VENTO SV</h2><p class="hint">A made-up mid-engined V12 supercar.</p>
    <div class="spec"><div><b>6.5 L</b>V12</div><div><b>690 Nm</b>torque</div><div><b>AWD</b>drive</div><div><b>340</b>km/h</div></div>
    <div class="swatches">${sw}</div>`);
  panel.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
    settings.color = b.dataset.c; save(); setPaint(carMesh, settings.color);
    panel.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b));
  }));
}

const SETTINGS = [
  { key: 'tod', label: 'Time of day', opts: [['day', 'Day'], ['sunset', 'Sunset']], reload: true },
  { key: 'quality', label: 'Graphics', opts: [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], reload: true },
  { key: 'units', label: 'Speed', opts: [['kmh', 'km/h'], ['mph', 'mph']] },
  { key: 'auto', label: 'Gearbox', opts: [[true, 'Automatic'], [false, 'Manual']] },
  { key: 'abs', label: 'ABS', opts: [[true, 'On'], [false, 'Off']] },
  { key: 'tcs', label: 'Traction control', opts: [[true, 'On'], [false, 'Off']] },
  { key: 'esp', label: 'Stability control', opts: [[true, 'On'], [false, 'Off']] },
  { key: 'steerAssist', label: 'Steering assist', opts: [[true, 'On'], [false, 'Off']] },
  { key: 'sens', label: 'Wheel / stick sensitivity', opts: [[0.6, '60%'], [0.8, '80%'], [1, '100%'], [1.25, '125%'], [1.5, '150%']] },
  { key: 'traffic', label: 'Traffic', opts: [['off', 'Off'], ['light', 'Light'], ['normal', 'Normal'], ['heavy', 'Heavy']] },
  { key: 'touchSteer', label: 'Touch steering', opts: [['buttons', 'Buttons'], ['tilt', 'Tilt']] },
  { key: 'sound', label: 'Sound', opts: [[true, 'On'], [false, 'Off']] },
  { key: 'volume', label: 'Volume', opts: [[0.3, '30%'], [0.55, '55%'], [0.8, '80%'], [1, '100%']] },
];
function settingsPanel(el) {
  const q = settings.quality || quality;
  const cur = k => (k === 'quality' ? q : k === 'tod' ? TOD_NAME : settings[k]);
  const rows = SETTINGS.map(s => `<div class="row"><label>${s.label}</label><div class="seg">${s.opts.map(([v, t]) =>
    `<button data-s="${s.key}" data-v='${JSON.stringify(v)}' class="${cur(s.key) === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>`).join('');
  const w = settings.wheel || {};
  el.innerHTML = `<h2>SETTINGS</h2>${rows}
    <div class="row"><label>Steering wheel & pedals<br><span class="hint" id="wheel-state">${w.gas ? 'Set up' : 'Not set up'}</span></label><div class="seg"><button id="wheel-setup">Set up</button><button id="wheel-clear">Clear</button></div></div>`;
  el.classList.remove('hidden');
  el.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', async () => {
    const key = b.dataset.s, v = JSON.parse(b.dataset.v), spec = SETTINGS.find(s => s.key === key);
    if (key === 'touchSteer' && v === 'tilt') { const ok = await input.enableTilt(); if (!ok) { hud.toast('Tilt is not available', 2); return; } }
    settings[key] = v; save();
    el.querySelectorAll(`[data-s="${key}"]`).forEach(x => x.classList.toggle('on', x === b));
    if (spec.reload) { location.reload(); return; }
    applyAids(); audio.setVolume(settings.volume, settings.sound);
    if (key === 'traffic') traffic.setDensity(settings.traffic, car);
    document.body.classList.toggle('tilt', settings.touchSteer === 'tilt');
  }));
  $('wheel-clear').addEventListener('click', () => { settings.wheel = null; save(); $('wheel-state').textContent = 'Not set up'; });
  $('wheel-setup').addEventListener('click', () => wheelSetup());
}
function wheelSetup() {
  const steps = [['steer', 'Turn the wheel to the RIGHT'], ['gas', 'Press the THROTTLE pedal'], ['brake', 'Press the BRAKE pedal'], ['shiftUp', 'Pull the UPSHIFT paddle'], ['shiftDown', 'Pull the DOWNSHIFT paddle'], ['hand', 'Press a button for the HANDBRAKE'], ['nitro', 'Press a button for NITRO']];
  let i = 0;
  const label = $('wheel-state');
  const next = () => {
    if (i >= steps.length) { label.textContent = 'Set up'; hud.toast('Wheel set up', 1.5); return; }
    const [k, text] = steps[i];
    label.innerHTML = `${text}… <a href="#" id="wheel-skip" style="color:#ffb27a">skip</a>`;
    $('wheel-skip').onclick = e => { e.preventDefault(); input.learn = null; i++; next(); };
    // Let go of everything first, then learn.
    setTimeout(() => input.startLearn(k, () => { i++; setTimeout(next, 400); }), 350);
  };
  next();
}
function controlsPanel() {
  showPanel(`<h2>CONTROLS</h2>
  <div class="keys">
    <kbd>W / ↑</kbd><span>Throttle</span><kbd>S / ↓</kbd><span>Brake, and reverse when stopped</span>
    <kbd>A D / ← →</kbd><span>Steer</span><kbd>Space</kbd><span>Handbrake (drift)</span>
    <kbd>Shift / N</kbd><span>Nitro (refills as you drive)</span><kbd>Q / E</kbd><span>Shift down / up (manual gearbox)</span>
    <kbd>C</kbd><span>Change camera</span><kbd>R</kbd><span>Back on the road</span><kbd>Esc / P</kbd><span>Pause</span><kbd>M</kbd><span>Sound on/off</span>
  </div>
  <p class="hint" style="margin-top:14px"><b>Gamepad:</b> left stick steers, RT throttle, LT brake, A handbrake, X nitro, LB/RB shift, Y camera, Start pause.</p>
  <p class="hint"><b>Steering wheel:</b> plug it in, press a pedal, then go to Settings → Set up, and follow the prompts (turn right, throttle, brake, paddles). Turn the steering assist off for the purest feel.</p>
  <p class="hint"><b>Touch:</b> ◀ ▶ steer (or tilt, in Settings), GAS and BRAKE on the right, DRIFT and NOS above them.</p>`);
}

document.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
  const p = b.dataset.p;
  if (p === 'resume') togglePause();
  else if (p === 'restart') { $('pause-panel').classList.add('hidden'); if (game.route) startEvent(game.route.ev); else { respawnOnRoad(); setState('free'); } }
  else if (p === 'settings') settingsPanel($('pause-panel'));
  else if (p === 'quit') { $('pause-panel').classList.add('hidden'); toMenu(); }
}));
document.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
  const f = b.dataset.f, i = EVENTS.indexOf(game.route.ev);
  if (f === 'retry') startEvent(game.route.ev);
  else if (f === 'next') startEvent(EVENTS[(i + 1) % EVENTS.length]);
  else toMenu();
}));
function toMenu() {
  game.route = null; gates.clear();
  resetCar(START.x, START.z, START.h);
  setState('menu'); hidePanel();
  document.querySelectorAll('[data-m]').forEach(x => x.classList.remove('sel'));
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
const STEP = 1 / 120;
let acc = 0;
const NO_INPUT = { steer: 0, gas: 0, brake: 0, handbrake: false, nitro: false, analog: false, sens: 1 };

function onHit(j, px, pz) {
  if (j < 900) return;
  const s = Math.min(1, j / 25000);
  audio.thump(0.2 + s);
  game.shake = Math.max(game.shake, s * 0.6);
  for (const p of input.pads()) if (p.vibrationActuator) p.vibrationActuator.playEffect('dual-rumble', { duration: 120 + s * 200, strongMagnitude: s, weakMagnitude: s * 0.6 }).catch(() => {});
}

function physics(dt, inp) {
  const surf = surfaceAt(car.x, car.z);
  car.onGrass = surf.grass;
  car.step(dt, inp, surf.grass ? 0.72 : 1, surf.grass ? 380 : 0);
  collideStatic(car, onHit);
  collideTraffic(car, traffic, onHit);
}

// ---------------------------------------------------------------------------
// Rendering the car and the camera
// ---------------------------------------------------------------------------
const tmpV = new THREE.Vector3(), lookV = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;
const camQuery = [];

function updateCarMesh(dt, alpha) {
  const x = lerp(car.px, car.x, alpha), z = lerp(car.pz, car.z, alpha), h = car.ph + wrapAngle(car.h - car.ph) * alpha;
  const surf = surfaceAt(car.x, car.z);
  carY = damp(carY, surf.y, 18, dt);
  carMesh.position.set(x, carY, z);
  carMesh.rotation.y = h;
  // Body pitch and roll on springs.
  const tp = clamp(-car.ax * 0.0045, -0.05, 0.05), tr = clamp(-car.ay * 0.0055, -0.06, 0.06);
  pitchV += ((tp - pitch) * 90 - pitchV * 11) * dt; pitch += pitchV * dt;
  rollV += ((tr - roll) * 90 - rollV * 11) * dt; roll += rollV * dt;
  const ud = carMesh.userData;
  ud.body.rotation.set(pitch, 0, roll);
  ud.body.position.y = Math.sin(performance.now() / 70) * 0.0015 * Math.min(1, car.speed / 30);
  ud.cockpit.wheel.rotation.z = car.steer * 7;
  if (game.camMode === 2 && game.state !== 'menu') {
    const gear = car.gear === -1 ? 'R' : String(car.gear);
    drawCluster(ud.cockpit, car.rpm, car.speed * 3.6, gear, settings.units);
  }
  for (const w of ud.wheels) {
    if (w.front) w.steer.rotation.y = -car.steer;
    w.spin.rotation.x = car.wheelAng;
  }
  const braking = car.brakeIn > 0.05 && car.gear !== -1;
  ud.tail.emissiveIntensity = braking ? 9 : 3.2;
  for (const g of ud.tailGlow) { g.material.opacity = braking ? 0.95 : 0.5; g.scale.set(braking ? 1.4 : 0.9, braking ? 0.7 : 0.5, 1); }
  ud.flame.material.opacity = car.nitroOn ? 0.7 + Math.random() * 0.3 : 0;
  ud.flame.scale.set(0.5 + Math.random() * 0.3, 0.35 + Math.random() * 0.15, 1);
  return { x, z, h };
}

function updateCamera(dt, pose) {
  const spd = car.speed;
  const f = [Math.sin(pose.h), Math.cos(pose.h)];
  const lookBack = input.keys.has('KeyB');
  let fov = 58;
  if (game.state === 'menu') {
    game.menuT += dt;
    const a = pose.h + Math.PI + 0.9 + Math.sin(game.menuT * 0.12) * 0.9;
    const d = game.garage ? 5.6 : 7.4;
    camPos.set(pose.x + Math.sin(a) * d, carY + (game.garage ? 1.3 : 1.7), pose.z + Math.cos(a) * d);
    camLook.set(pose.x + (game.garage ? 0 : f[0] * 2.5), carY + 0.65, pose.z + (game.garage ? 0 : f[1] * 2.5));
    camera.position.copy(camPos); camera.lookAt(camLook); camInit = false;
  } else if (game.camMode <= 1) {
    // Wide chase (the default: higher and further back, so you see more of the
    // road) or the close chase.
    const wide = game.camMode === 0;
    const vel = car.worldVel(), velH = Math.atan2(vel[0], vel[1]);
    let target = pose.h;
    if (spd > 4 && car.vx > 0) target += clamp(wrapAngle(velH - pose.h), -0.6, 0.6) * 0.45;
    if (car.vx < -2) target = pose.h;
    if (lookBack) target += Math.PI;
    if (!camInit) { camYaw = target; camInit = true; }
    camYaw += wrapAngle(target - camYaw) * (1 - Math.exp(-dt * (lookBack ? 30 : wide ? 5 : 6.5)));
    let dist = wide ? 8.8 : 5.9, ht = wide ? 3.1 : 1.62;
    dist += clamp(spd * (wide ? 0.016 : 0.012), 0, wide ? 1.4 : 0.9);
    // Pull in if a building is in the way.
    for (let k = 0; k < 5; k++) {
      const cx = pose.x - Math.sin(camYaw) * dist, cz = pose.z - Math.cos(camYaw) * dist;
      queryColliders(cx, cz, 0.6, camQuery);
      if (!camQuery.some(c => c.type === 'box' && cx > c.x0 - 0.4 && cx < c.x1 + 0.4 && cz > c.z0 - 0.4 && cz < c.z1 + 0.4)) break;
      dist *= 0.7;
    }
    camPos.set(pose.x - Math.sin(camYaw) * dist, carY + ht, pose.z - Math.cos(camYaw) * dist);
    const ahead = wide ? 7 : 4;
    camLook.set(pose.x + Math.sin(camYaw) * ahead, carY + (wide ? 1.15 : 0.95), pose.z + Math.cos(camYaw) * ahead);
    camera.position.copy(camPos); camera.lookAt(camLook);
    fov = (wide ? 62 : 58) + clamp(spd * 0.1, 0, 15) + (car.nitroOn ? 6 : 0);
  } else if (game.camMode === 2) {
    // From the driver's seat, moving with the body as it pitches and rolls.
    const cp = carMesh.userData.cockpit, body = carMesh.userData.body;
    carMesh.updateMatrixWorld(true);
    body.localToWorld(camera.position.copy(cp.eye));
    lookV.copy(cp.eye); lookV.z += lookBack ? -20 : 20; lookV.y -= lookBack ? 0 : 0.9;
    if (lookBack) lookV.x = cp.eye.x;
    body.localToWorld(lookV);
    camera.up.set(0, 1, 0); camera.lookAt(lookV);
    camera.rotateZ(-roll * 0.5);
    fov = 70 + clamp(spd * 0.06, 0, 8);
    camInit = false;
  } else {
    // Hood or bumper camera, fixed to the body.
    const hood = game.camMode === 3;
    const off = hood ? new THREE.Vector3(0, 1.2, 0.05) : new THREE.Vector3(0, 0.5, 2.42);
    off.applyEuler(carMesh.userData.body.rotation).applyAxisAngle(THREE.Object3D.DEFAULT_UP, pose.h);
    camera.position.set(pose.x + off.x, carY + off.y, pose.z + off.z);
    const back = lookBack ? -1 : 1;
    lookV.set(pose.x + f[0] * 30 * back, carY + (hood ? 0.9 : 0.5), pose.z + f[1] * 30 * back);
    camera.lookAt(lookV);
    camera.rotateZ(-roll * 0.6);
    fov = 66 + clamp(spd * 0.08, 0, 12);
    camInit = false;
  }
  if (game.shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * game.shake * 0.3;
    camera.position.y += (Math.random() - 0.5) * game.shake * 0.3;
    game.shake *= Math.exp(-dt * 7);
  }
  // A light buzz at very high speed.
  if (spd > 60 && game.camMode <= 1) camera.position.y += (Math.random() - 0.5) * 0.012 * (spd - 60) / 30;
  camera.fov = damp(camera.fov, fov, 4, dt); camera.updateProjectionMatrix();
}

function wheelFx(pose) {
  const c = Math.cos(pose.h), s = Math.sin(pose.h);
  const slideR = car.slipR > 0.16 || car.spinR > 0.15;
  const slideF = car.slipF > 0.24 || car.lockF;
  const moving = car.speed > 3 && !car.onGrass;
  let i = 0;
  for (const w of carMesh.userData.wheels) {
    const lx = w.side * HERO_DIMS.track / 2, lz = w.front ? HERO_DIMS.wzf : HERO_DIMS.wzr;
    const wx = pose.x + c * lx + s * lz, wz = pose.z - s * lx + c * lz;
    const on = moving && (w.front ? slideF : slideR);
    fx.skid(i++, wx, carY, wz, on);
    if (on && !w.front && Math.random() < 0.55) {
      const str = Math.max(car.slipR - 0.12, car.spinR) * 2.2;
      const v = car.worldVel(); fx.puff(wx, carY, wz, str, v[0], v[1]);
    }
  }
}

// ---------------------------------------------------------------------------
// Race logic, per frame
// ---------------------------------------------------------------------------
function raceUpdate(dt) {
  const r = game.route;
  if (game.state === 'countdown') {
    game.cdT -= dt;
    const n = Math.ceil(game.cdT - 0.4);
    if (n !== game.lastBeep && n >= 1 && n <= 3) { game.lastBeep = n; audio.beep(660, 0.15); }
    $('countdown').textContent = game.cdT > 0.4 ? String(Math.max(1, n)) : 'GO!';
    if (game.cdT <= 0.4 && game.lastBeep !== 0) { game.lastBeep = 0; audio.beep(1320, 0.35); setState('race'); }
  } else {
    game.t += dt;
    if (game.cdT > -0.6) { game.cdT -= dt; $('countdown').textContent = game.cdT > -0.6 ? 'GO!' : ''; }
    const cp = r.cps[game.next];
    if (cp && inCheckpoint(cp, car.x, car.z)) {
      game.next++;
      if (game.next >= r.cps.length) { $('countdown').textContent = ''; finishRace(); return; }
      audio.beep(990, 0.12, 0.2);
      hud.toast(`${fmtTime(game.t)}`, 1.2);
    }
  }
  const cp = r.cps[Math.min(game.next, r.cps.length - 1)];
  const dx = cp.x - car.x, dz = cp.z - car.z;
  const camH = Math.atan2(camLook.x - camera.position.x, camLook.z - camera.position.z);
  const arrow = wrapAngle(camH - Math.atan2(dx, dz));
  hud.race({ time: game.t, cp: game.next, total: r.cps.length, best: settings.bests[r.ev.id], arrow, dist: Math.hypot(dx, dz) });
  gates.update(game.next, performance.now() / 1000);
}

// ---------------------------------------------------------------------------
// Main loop, with resolution that adapts to keep the frame rate up
// ---------------------------------------------------------------------------
let last = performance.now(), frameAvg = 16, adaptT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (game.state === 'loading' || window.__freeze) return;
  tick(dt);
}
function tick(dt) {
  renderer.info.reset();
  frameAvg = lerp(frameAvg, dt * 1000, 0.05);

  const raw = input.read(dt);
  const st = game.state;
  const driving = st === 'free' || st === 'race';
  let inp = driving ? raw : NO_INPUT;
  if (st === 'countdown') inp = { ...NO_INPUT, gas: raw.gas };
  if (st !== 'paused') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 8) {
      if (st === 'countdown' || st === 'menu' || st === 'finish') {
        // Hold the car still but let the engine rev.
        car.step(STEP, st === 'finish' ? { ...NO_INPUT, brake: 1 } : inp, 1, 0);
        if (st !== 'finish') { car.x = car.px; car.z = car.pz; car.h = car.ph; car.vx = car.vy = car.w = 0; }
        else { collideStatic(car, null); }
      } else physics(STEP, inp);
      acc -= STEP; n++;
    }
    if (n === 8) acc = 0;
    game.clock = (game.clock || 0) + dt;
    const sig = signalState(game.clock);
    if (sig.Z !== game.sigZ || sig.X !== game.sigX) { game.sigZ = sig.Z; game.sigX = sig.X; showSignals(sig); }
    traffic.update(dt, car, sig);
    if (st === 'race' || st === 'countdown') raceUpdate(dt);
  }
  const alpha = st === 'paused' ? 1 : acc / STEP;
  const pose = updateCarMesh(dt, alpha);
  if (st !== 'paused') { wheelFx(pose); fx.update(dt); }
  traffic.render(car);
  updateCamera(dt, pose);
  placeSun(sky.sun, tmpV.set(pose.x, 0, pose.z));
  audio.update(car, st === 'free' || st === 'race' || st === 'countdown' || st === 'finish');
  if (st === 'free' || st === 'race' || st === 'countdown') hud.drawDial(car, settings.units, { abs: car.abs, esp: car.esp, tcs: car.tcs });
  if (st === 'free' || st === 'race' || st === 'countdown') hud.drawMap(car, traffic, game.route, game.next);

  if (composer) {
    const blur = clamp((car.speed - 35) / 55, 0, 1) * 0.8 + (car.nitroOn ? 0.5 : 0);
    grade.uniforms.uBlur.value = game.camMode <= 1 && st !== 'menu' ? blur : 0;
    composer.render(dt);
  } else renderer.render(scene, camera);

  // Adapt resolution every couple of seconds.
  adaptT += dt;
  if (adaptT > 2) {
    adaptT = 0;
    if (frameAvg > 21 && resScale > 0.6) { resScale = Math.max(0.6, resScale * 0.88); resize(); }
    else if (frameAvg < 14.5 && resScale < 1) { resScale = Math.min(1, resScale * 1.08); resize(); }
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
(async () => {
  try {
    await build();
    $('loading').classList.add('hidden');
    setState('menu');
    requestAnimationFrame(t => { last = t; frame(t); });
  } catch (e) {
    console.error(e);
    loadMsg('Sorry, the game could not start: ' + e.message);
  }
})();
// Hooks for automated testing: run the simulation without drawing.
function simulate(secs, inp) {
  for (let t = 0; t < secs; t += STEP) {
    physics(STEP, { ...NO_INPUT, ...inp });
    if (Math.round(t / STEP) % 4 === 0) traffic.update(STEP * 4, car, signalState(game.clock = (game.clock || 0) + STEP * 4));
    if (game.state === 'race') { game.t += STEP; const cp = game.route.cps[game.next]; if (cp && inCheckpoint(cp, car.x, car.z)) { game.next++; if (game.next >= game.route.cps.length) { finishRace(); break; } } }
  }
  car.px = car.x; car.pz = car.z; car.ph = car.h;
}
window.__game = { simulate, tick, game, car, get traffic() { return traffic; }, camera, scene, renderer, startEvent, startFree, EVENTS, settings };
