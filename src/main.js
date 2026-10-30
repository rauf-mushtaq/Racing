// Sunset City: start-up, the game loop, cameras, menus and races.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { $, clamp, damp, lerp, wrapAngle, LOW_POWER, fmtTime } from './util.js';
import { settings, save } from './store.js';
import { setAnisotropy, setTexScale, glowTex } from './textures.js';
import { Q } from './quality.js';
import { buildSky, placeSun, SUN_DIR, LIGHT_DIR } from './sky.js';
import { City, surfaceAt, SP, N, EDGE, laneOffset, queryColliders, signalState } from './city.js';
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
const quality = Q.name;
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.msaa === 0, powerPreference: 'high-performance', stencil: false });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = TOD.exposure;
renderer.shadowMap.enabled = Q.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
setAnisotropy(Math.min(Q.aniso, renderer.capabilities.getMaxAnisotropy()));
setTexScale(Q.tex);
// Pixel density: the screen's own (up to the tier's cap) times the render scale
// setting; the adaptive resolution below only ever steps down from there.
const basePR = Math.min(Math.min(devicePixelRatio || 1, Q.dpr) * Q.renderScale, 3);
let resScale = 1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 12000);

// Post-processing: bloom, a speed blur, vignette and a colour grade, then ACES.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uBlur: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.45) }, uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) }, uSharpen: { value: Q.sharpen },
    uSat: { value: TOD.grade.sat }, uContrast: { value: TOD.grade.contrast }, uWarm: { value: TOD.grade.warm }, uSunset: { value: TOD_NAME === 'sunset' ? 1 : 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uBlur, uSharpen; uniform vec2 uCenter, uTexel; uniform float uSat, uContrast, uWarm, uSunset; varying vec2 vUv;
    void main(){
      vec2 dir = vUv - uCenter; float d = length(dir);
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (uBlur > 0.002) {
        vec3 acc = col; float s = uBlur * smoothstep(0.12, 0.7, d) * 0.06;
        for (int i = 1; i < 8; i++) acc += texture2D(tDiffuse, vUv - dir * s * float(i)).rgb;
        col = acc / 8.0;
      }
      // Sharpen: add back the difference from the neighbours, held within a band
      // round the original so bright highlights don't ring.
      float sh = uSharpen * (1.0 - clamp(uBlur * 1.5, 0.0, 1.0));
      if (sh > 0.001) {
        vec3 nb = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
                + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
        col = clamp(col + (col - nb * 0.25) * sh, col * 0.75, col * 1.3 + 0.01);
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
let composer = null, bloom = null, grade = null;
if (quality !== 'low') {
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: Q.msaa });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), (TOD.lampsOn ? 0.42 : 0.22) * Q.bloom, 0.55, TOD.lampsOn ? 0.92 : 1.6);
  composer.addPass(bloom);
  grade = new ShaderPass(GradeShader); composer.addPass(grade);
  composer.addPass(new OutputPass());
}
function resize() {
  const w = innerWidth, h = innerHeight, pr = basePR * resScale;
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  if (composer) {
    composer.setPixelRatio(pr); composer.setSize(w, h);
    const bs = Q.msaa >= 4 ? 0.5 : 0.35;
    bloom.resolution.set(w * pr * bs, h * pr * bs);
    grade.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr));
  }
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (csm) csm.updateFrustums();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
let sky, city, terrain, traffic, carMesh, fx, gates, hud, csm = null, probe = null;
const car = new Vehicle();
const input = new Input();
const audio = new AudioEngine();
const START = { x: laneOffset(0, 1), z: 3 * SP - 60, h: Math.PI };

async function build() {
  // Make sure the web fonts are in before any text is drawn onto a texture.
  try { await Promise.race([Promise.all([document.fonts.load('900 52px "Barlow Condensed"'), document.fonts.load('700 40px "Barlow"')]), new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* fallback fonts are fine */ }
  loadMsg('Painting the sky…'); await nextFrame();
  sky = buildSky(scene, renderer, quality);
  city = new City(scene);
  await city.init(loadMsg);
  loadMsg('Raising the hills…'); await nextFrame();
  terrain = buildTerrain(scene, !TOD.lampsOn);
  await city.loadAround(START.x, START.z, Math.min(2, Q.loadR), loadMsg);
  loadMsg('Starting the traffic…'); await nextFrame();
  traffic = new Traffic(scene, city, Q.shadows);
  carMesh = makeHeroCar(settings.color);
  scene.add(carMesh);
  fx = new FX(scene);
  gates = new Gates(scene);
  hud = new HUD();
  car.reset(START.x, START.z, START.h);
  traffic.setDensity(settings.traffic, car);
  applyAids();
  setupProbe();
  if (Q.csm) setupCSM();
  if (!TOD.lampsOn) addFlare();
  resize();
  loadMsg('Warming up…'); await nextFrame();
  renderer.compile(scene, camera);
}

// Real-time reflections for the player's car: a small cube map of the
// surroundings, re-rendered one face per frame (every other frame on Medium),
// so the paint and glass reflect the actual street, buildings and traffic.
function setupProbe() {
  if (!Q.probe) return;
  const rt = new THREE.WebGLCubeRenderTarget(Q.probe, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cam = new THREE.CubeCamera(0.5, 9000, rt);
  scene.add(cam);
  probe = { rt, cam, face: 0, frame: 0 };
  carMesh.traverse(o => {
    for (const m of [].concat(o.material || [])) if ((m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && m.envMapIntensity !== undefined && !m.userData.noProbe) m.envMap = rt.texture;
  });
  carMesh.visible = false; cam.position.set(car.x, carY + 0.9, car.z); cam.update(renderer, scene); carMesh.visible = true;
}
function updateProbe(pose) {
  if (!probe) return;
  if (probe.frame++ % Q.probeEvery) return;
  const { cam, rt } = probe;
  cam.position.set(pose.x, carY + 0.9, pose.z); cam.updateMatrixWorld(true);
  const face = probe.face; probe.face = (face + 1) % 6;
  const auto = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
  carMesh.visible = false;
  const prevRT = renderer.getRenderTarget();
  renderer.setRenderTarget(rt, face);
  renderer.render(scene, cam.children[face]);
  renderer.setRenderTarget(prevRT);
  carMesh.visible = true; renderer.shadowMap.autoUpdate = auto;
  rt.texture.needsPMREMUpdate = true;
}

// Cascaded shadow maps (High): sharp shadows near the car and building
// shadows across the whole street ahead.
function setupCSM() {
  csm = new CSM({ maxFar: Q.csmFar, cascades: Q.cascades, mode: 'practical', parent: scene, shadowMapSize: Q.shadow, lightDirection: LIGHT_DIR.clone().negate(), camera, lightIntensity: TOD.sunI, lightFar: 2000, lightMargin: 120 });
  for (const l of csm.lights) { l.color.set(TOD.sunColor); l.shadow.bias = -0.00025; l.shadow.normalBias = 0.06; }
  // The far cascades only draw big things (layer 2: buildings, hills); trees,
  // poles and other small props cast shadows in the nearest one only.
  for (const l of csm.lights.slice(1)) l.shadow.camera.layers.set(2);
  scene.remove(sky.sun); sky.sun.castShadow = false;
  // Every lit material has to know about the cascades. The city's are created
  // up front (its regions share them), so list them as well as walking the scene.
  const done = new Set();
  const setup = m => {
    if (!m || done.has(m) || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return;
    done.add(m);
    const own = Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') ? m.onBeforeCompile : null;
    csm.setupMaterial(m);
    if (own) { const c = m.onBeforeCompile; m.onBeforeCompile = (sh, r) => { c(sh, r); own(sh, r); }; }
  };
  for (const m of city.allMaterials()) setup(m);
  scene.traverse(o => { for (const m of [].concat(o.material || [])) setup(m); });
}

// A soft glare around the sun in daylight; buildings in front of it hide it.
function addFlare() {
  const glow = glowTex();
  const g = new THREE.Group();
  for (const [size, op] of [[2600, 0.55], [900, 0.9]]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(2.2, 2.0, 1.7), transparent: true, opacity: op, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    sp.scale.set(size, size, 1); g.add(sp);
  }
  scene.add(g);
  game.flare = g;
}

function applyAids() {
  car.abs = settings.abs; car.tcs = settings.tcs; car.esp = settings.esp; car.auto = settings.auto; car.steerAssist = settings.steerAssist;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const game = { state: 'loading', prev: null, route: null, waypoint: null, next: 0, t: 0, cdT: 0, camMode: settings.cam ?? 0, shake: 0, menuT: 0, garage: false, splits: [] };
let carY = 0.0, camYaw = START.h, pitch = 0, roll = 0, pitchV = 0, rollV = 0;

function setState(s) {
  game.state = s;
  const driving = s === 'free' || s === 'race' || s === 'countdown';
  $('hud').classList.toggle('hidden', !driving && s !== 'finish' && s !== 'map');
  $('menu').classList.toggle('hidden', s !== 'menu');
  $('pause').classList.toggle('hidden', s !== 'paused');
  $('finish').classList.toggle('hidden', s !== 'finish');
  $('bigmap').classList.toggle('hidden', s !== 'map');
  $('fps').classList.toggle('hidden', !settings.fps);
  const touch = (input.lastDevice === 'touch' || (LOW_POWER && input.lastDevice === 'keyboard')) && driving;
  $('touch').classList.toggle('hidden', !touch);
  document.body.classList.toggle('touchmode', touch);
  $('cam-name').textContent = CAMS[game.camMode] || '';
  document.body.classList.toggle('tilt', settings.touchSteer === 'tilt');
  if (s !== 'race' && s !== 'countdown' && s !== 'map') { hud && hud.race(null); if (s !== 'free' && hud) hud.nav(null); }
  if (hud) hud.resize();
}

function resetCar(x, z, h) {
  car.reset(x, z, h); carY = surfaceAt(x, z).y; car.baseY = carY; camYaw = h; fx.reset();
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
function toggleMap() {
  if (game.state === 'map') { setState(game.prev); return; }
  if (!['free', 'race', 'countdown'].includes(game.state)) return;
  game.prev = game.state; setState('map'); drawBigMap();
}
function drawBigMap() { hud.drawBigMap($('bigmap-c'), car, game.route, game.waypoint); }
input.on('map', toggleMap);
$('map-btn').addEventListener('click', e => { e.stopPropagation(); toggleMap(); });
$('bm-close').addEventListener('click', toggleMap);
$('bm-clear').addEventListener('click', () => { game.waypoint = null; drawBigMap(); hud.nav(null); });
$('bigmap-c').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect(), k = e.currentTarget.width / r.width;
  game.waypoint = hud.bigToWorld((e.clientX - r.left) * k, (e.clientY - r.top) * k);
  drawBigMap(); hud.toast('WAYPOINT SET', 1.4);
});
function toggleFullscreen() {
  try { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); } catch (e) { /* not allowed here */ }
}
input.on('fullscreen', toggleFullscreen);
function togglePause() {
  if (game.state === 'map') { toggleMap(); return; }
  if (game.state === 'paused') { $('pause-panel').classList.add('hidden'); setState(game.prev); audio.resume(); }
  else if (['free', 'race', 'countdown'].includes(game.state)) { game.prev = game.state; setState('paused'); }
}
input.on('pause', togglePause);
input.on('back', () => { if (game.state === 'paused' || game.state === 'map') togglePause(); });
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
  { key: 'quality', label: 'Graphics', opts: [['ultra', 'Ultra'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], reload: true },
  { key: 'renderScale', label: 'Render scale', opts: [[0.75, '75%'], [1, '100%'], [1.25, '125%'], [1.5, '150%']], reload: true },
  { key: 'fps', label: 'FPS counter', opts: [[true, 'On'], [false, 'Off']] },
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
  const cur = k => (k === 'quality' ? quality : k === 'tod' ? TOD_NAME : k === 'renderScale' ? Q.renderScale : settings[k]);
  const rows = SETTINGS.map(s => `<div class="row"><label>${s.label}</label><div class="seg">${s.opts.map(([v, t]) =>
    `<button data-s="${s.key}" data-v='${JSON.stringify(v)}' class="${cur(s.key) === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>`).join('');
  const w = settings.wheel || {};
  el.innerHTML = `<h2>SETTINGS</h2>${rows}
    <div class="row"><label>Steering wheel & pedals<br><span class="hint" id="wheel-state">${w.gas ? 'Set up' : 'Not set up'}</span></label><div class="seg"><button id="wheel-setup">Set up</button><button id="wheel-clear">Clear</button></div></div>
    <div class="row"><label>Fullscreen <span class="hint">(F)</span></label><div class="seg"><button id="fs-toggle">Toggle</button></div></div>`;
  el.classList.remove('hidden');
  el.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', async () => {
    const key = b.dataset.s, v = JSON.parse(b.dataset.v), spec = SETTINGS.find(s => s.key === key);
    if (key === 'touchSteer' && v === 'tilt') { const ok = await input.enableTilt(); if (!ok) { hud.toast('Tilt is not available', 2); return; } }
    settings[key] = v; save();
    el.querySelectorAll(`[data-s="${key}"]`).forEach(x => x.classList.toggle('on', x === b));
    if (spec.reload) { location.reload(); return; }
    applyAids(); audio.setVolume(settings.volume, settings.sound); $('fps').classList.toggle('hidden', !settings.fps);
    if (key === 'traffic') traffic.setDensity(settings.traffic, car);
    document.body.classList.toggle('tilt', settings.touchSteer === 'tilt');
  }));
  $('fs-toggle').addEventListener('click', toggleFullscreen);
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
    <kbd>C</kbd><span>Change camera</span><kbd>R</kbd><span>Back on the road</span><kbd>Esc / P</kbd><span>Pause</span><kbd>U</kbd><span>Sound on/off</span>
    <kbd>Tab / M</kbd><span>City map (click it to set a waypoint)</span><kbd>F</kbd><span>Fullscreen</span>
    <kbd>Mouse drag</kbd><span>Look around the car (right or left button)</span><kbd>Mouse wheel</kbd><span>Zoom the chase camera</span><kbd>B</kbd><span>Look behind</span>
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
const STEP = 1 / 240;
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
  car.step(dt, inp, surfaceAt);
  collideStatic(car, onHit);
  collideTraffic(car, traffic, onHit);
}

// ---------------------------------------------------------------------------
// Rendering the car and the camera
// ---------------------------------------------------------------------------
const tmpV = new THREE.Vector3(), lookV = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;
const camQuery = [];
const camFrustum = new THREE.Frustum(), projScreen = new THREE.Matrix4();

// The physics point is the centre of mass, which sits 0.26 m behind the
// model's origin (between the axles' midpoint and the rear).
const CG_OFF = 0.261;
function updateCarMesh(dt, alpha) {
  let x = lerp(car.px, car.x, alpha), z = lerp(car.pz, car.z, alpha);
  const h = car.ph + wrapAngle(car.h - car.ph) * alpha;
  x += Math.sin(h) * CG_OFF; z += Math.cos(h) * CG_OFF;
  carY = car.baseY ?? surfaceAt(car.x, car.z).y;
  carMesh.position.set(x, carY, z);
  carMesh.rotation.y = h;
  // The body rides on the simulated suspension.
  pitch = car.pitch; roll = car.roll;
  const ud = carMesh.userData;
  ud.body.rotation.set(pitch, 0, roll);
  ud.body.position.y = car.hv;
  for (const w of ud.wheels) {
    const i = (w.front ? 0 : 2) + (w.side > 0 ? 0 : 1), wi = car.wheels[i];
    const [lz, lx] = car.s.wheelPos[i];
    // Tyre on the ground when touching it, otherwise hanging from the body.
    const hang = car.hv - car.pitch * lz - car.roll * lx - 0.06;
    w.steer.position.y = w.baseY + (wi.contact ? wi.ground - carY : hang);
    w.spin.rotation.x = wi.ang;
  }
  ud.cockpit.wheel.rotation.z = car.steer * 7;
  if (game.camMode === 2 && game.state !== 'menu') {
    const gear = car.gear === -1 ? 'R' : String(car.gear);
    drawCluster(ud.cockpit, car.rpm, car.speed * 3.6, gear, settings.units);
  }
  for (const w of ud.wheels) if (w.front) w.steer.rotation.y = -car.steer;
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
    target += input.look.yaw;
    if (!camInit) { camYaw = target; camInit = true; }
    camYaw += wrapAngle(target - camYaw) * (1 - Math.exp(-dt * (lookBack ? 30 : wide ? 5 : 6.5)));
    let dist = wide ? 8.8 : 5.9, ht = wide ? 3.1 : 1.62;
    dist += clamp(spd * (wide ? 0.016 : 0.012), 0, wide ? 1.4 : 0.9);
    dist *= input.look.zoom; ht = ht * input.look.zoom + input.look.pitch * dist * 0.9;
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
    camera.rotateY(input.look.yaw * 0.8); camera.rotateX(-input.look.pitch * 0.5);
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
  const moving = car.speed > 3;
  let i = 0;
  for (const w of carMesh.userData.wheels) {
    const wi = car.wheels[(w.front ? 0 : 2) + (w.side > 0 ? 0 : 1)];
    const lx = w.side * HERO_DIMS.track / 2, lz = w.front ? HERO_DIMS.wzf : HERO_DIMS.wzr;
    const wx = pose.x + c * lx + s * lz, wz = pose.z - s * lx + c * lz;
    const slide = Math.max(Math.abs(wi.slipA) - 0.14, 0) * 3 + Math.max(Math.abs(wi.slipK) - 0.18, 0) * 2;
    const on = moving && wi.contact && !wi.grass && slide > 0.05;
    fx.skid(i++, wx, wi.ground, wz, on);
    if (on && Math.random() < 0.5) {
      const v = car.worldVel(); fx.puff(wx, wi.ground, wz, slide * 1.5, v[0], v[1]);
    }
  }
}

// The arrow to the waypoint in free roam; it clears when you get there.
function waypointUpdate() {
  const w = game.waypoint;
  if (!w) { hud.nav(null); return; }
  const dx = w.x - car.x, dz = w.z - car.z, dist = Math.hypot(dx, dz);
  if (dist < 25) { game.waypoint = null; hud.nav(null); hud.toast('YOU HAVE ARRIVED', 2); return; }
  const camH = Math.atan2(camLook.x - camera.position.x, camLook.z - camera.position.z);
  hud.nav({ arrow: wrapAngle(camH - Math.atan2(dx, dz)), dist, waypoint: true });
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
  if (st !== 'paused' && st !== 'map') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 16) {
      if (st === 'countdown' || st === 'menu' || st === 'finish') {
        // Hold the car still but let the engine rev.
        car.step(STEP, st === 'finish' ? { ...NO_INPUT, brake: 1 } : inp, surfaceAt);
        if (st !== 'finish') { car.x = car.px; car.z = car.pz; car.h = car.ph; car.vx = car.vy = car.w = 0; }
        else { collideStatic(car, null); }
      } else physics(STEP, inp);
      acc -= STEP; n++;
    }
    if (n === 16) acc = 0;
    game.clock = (game.clock || 0) + dt;
    const sig = signalState(game.clock);
    if (sig.Z !== game.sigZ || sig.X !== game.sigX) { game.sigZ = sig.Z; game.sigX = sig.X; city.setSignals(sig); }
    traffic.update(dt, car, sig);
    if (st === 'race' || st === 'countdown') raceUpdate(dt);
    else if (st === 'free') waypointUpdate();
  }
  city.update(car.x, car.z, st === 'paused' || st === 'map' ? 2 : 3.5);
  terrain.update(dt);
  const alpha = st === 'paused' || st === 'map' ? 1 : acc / STEP;
  const pose = updateCarMesh(dt, alpha);
  if (st !== 'paused' && st !== 'map') { wheelFx(pose); fx.update(dt); }
  camera.updateMatrixWorld(); camFrustum.setFromProjectionMatrix(projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  traffic.render(car, camFrustum);
  updateCamera(dt, pose);
  placeSun(sky.sun, tmpV.set(pose.x, 0, pose.z));
  if (csm) csm.update();
  if (game.flare) game.flare.position.copy(SUN_DIR).multiplyScalar(3800).add(camera.position);
  updateProbe(pose);
  audio.update(car, st === 'free' || st === 'race' || st === 'countdown' || st === 'finish');
  if (st === 'free' || st === 'race' || st === 'countdown') hud.drawDial(car, settings.units, { abs: car.abs, esp: car.esp, tcs: car.tcs });
  if (st === 'free' || st === 'race' || st === 'countdown') hud.drawMap(car, traffic, game.route, game.next, game.waypoint);
  if (settings.fps && (game.fpsT = (game.fpsT || 0) + dt) > 0.5) { game.fpsT = 0; $('fps').textContent = `${Math.round(1000 / frameAvg)} FPS · ${renderer.domElement.width}×${renderer.domElement.height} · ${quality}`; }

  if (composer) {
    const blur = clamp((car.speed - 35) / 55, 0, 1) * 0.8 + (car.nitroOn ? 0.5 : 0);
    grade.uniforms.uBlur.value = game.camMode <= 1 && st !== 'menu' ? blur : 0;
    composer.render(dt);
  } else renderer.render(scene, camera);

  // Adapt resolution every couple of seconds.
  adaptT += dt;
  if (adaptT > 2) {
    adaptT = 0;
    if (frameAvg > 21 && resScale > 0.7) { resScale = Math.max(0.7, resScale * 0.9); resize(); }
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
window.__game = { simulate, tick, game, car, Q, get city() { return city; }, get traffic() { return traffic; }, camera, scene, renderer, startEvent, startFree, EVENTS, settings };
