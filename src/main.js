// Sunset City: start-up, the game loop, cameras, menus and races.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { $, clamp, damp, lerp, wrapAngle, LOW_POWER, IOS, fmtTime } from './util.js';
import { settings, save } from './store.js';
import { setAnisotropy, setTexScale, glowTex } from './textures.js';
import { Q, GPU } from './quality.js';
import { WIND } from './props.js';
import { buildSky, placeSun, SUN_DIR, LIGHT_DIR, applyHDRI } from './sky.js';
import { City, SP, N, EDGE, laneOffset, queryColliders, signalState, breakProp, WETNESS } from './city.js';
import { groundAt, ROADS, BUNKERS, AIRFIELD, WORLD_LIM, isWater } from './world.js';
import { inWater } from './rivercourse.js';
import { nearestAvenue } from './avenues.js';
import { BigMap } from './bigmap.js';
import { buildTerrain } from './terrain.js';
import { initRoads } from './roads.js';
import { initScatter } from './scatter.js';
import { initGrass } from './grass.js';
import { initStructures } from './structures.js';
import { initTowns } from './towns.js';
import { initRiver } from './river.js';
import { initRoadCut } from './roadcut.js';
import { initLandmarks } from './landmarks.js';
import { isRound } from './junctions.js';
import { Buskers } from './buskers.js';
import { TOD, TOD_NAME } from './tod.js';
import { makeHeroCar, setPaint, PAINTS, HERO_DIMS } from './carModel.js';
import { loadFerrari, loadFerrariTraffic } from './ferrari.js';
import { Vehicle, SPEC } from './vehicle.js';
import { makeGT, GT_SPEC } from './gt.js';
import { PoliceChase } from './police.js';
import { collideStatic, collideTraffic, collideTerrain, collideRiver } from './collide.js';
import { Traffic } from './traffic.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Driver } from './driver.js';
import { AudioEngine } from './audio.js';
import { ChaseMusic } from './chasemusic.js';
import { EVENTS, buildRoute, Gates, inCheckpoint } from './events.js';
import { installAtmosphere } from './atmos.js';
import { AOPass } from './ao.js';
import { GIPass } from './gi.js';
import { HistoryPass, SSR, ssrBegin, ssrEnd, withoutSSR } from './ssr.js';
import { Walker, FootCamera, lay1 } from './walker.js';
import { Debris } from './breakables.js';
import { Particles } from './particles.js';
import { Peds } from './peds.js';
import { Headlights } from './lights.js';
import { Rain } from './rain.js';
import { PEOPLE, personKey } from './people.js';
import { Arsenal, WEAPONS } from './weapons.js';
import { Officers } from './officers.js';
import { Melee } from './melee.js';
import { Interior } from './interior.js';
import { planFor } from './rooms.js';
import { Heist } from './heist.js';
import { venueNear, VENUE_TYPES } from './venues.js';
import { initMenus } from './menus.js';
import { Profiler, PerfGuard } from './perf.js';
import { SeatedDriver } from './seated.js';
import { Heli } from './heli.js';
import { Bench } from './bench.js';
import { SPOTS } from './buskers.js';

// Test and debugging hooks (window.__game, __cam, __freeze, __noRender, __fixedRes) exist only when the page is opened with ?debug
const DEBUG = new URLSearchParams(location.search).has('debug');
const loadMsg = t => { $('load-msg').textContent = t; };
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
installAtmosphere();
const quality = Q.name;
const TIER_EXPLICIT = ['ultra', 'high', 'medium', 'low'].includes(settings.quality);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.msaa === 0, powerPreference: 'high-performance', stencil: false });
renderer.toneMapping = THREE.AgXToneMapping;                 // a film-like response: less saturated highlights than ACES, closer to a photograph
renderer.toneMappingExposure = TOD.exposure * 1.24;
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
  uniforms: { tDiffuse: { value: null }, uBlur: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.45) }, uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) }, uSharpen: { value: Q.sharpen }, tAO: { value: null }, uAO: { value: 0 }, tGI: { value: null }, uGI: { value: 0 }, uClarity: { value: Q.clarity }, uCA: { value: 0.0012 },
    uSat: { value: TOD.grade.sat }, uContrast: { value: TOD.grade.contrast }, uWarm: { value: TOD.grade.warm }, uSunset: { value: TOD.split },
    uSun: { value: new THREE.Vector2(0.5, 0.6) }, uRays: { value: TOD.rays }, uSunVis: { value: 0 }, uGrain: { value: TOD.grain }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, tAO, tGI; uniform float uAO, uGI, uClarity, uCA; uniform float uBlur, uSharpen; uniform vec2 uCenter, uTexel; uniform float uSat, uContrast, uWarm, uSunset, uRays, uSunVis, uGrain, uTime; uniform vec2 uSun; varying vec2 vUv;
    void main(){
      vec2 dir = vUv - uCenter; float d = length(dir);
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // A faint lens fringe towards the corners, like a real camera.
      col.r = texture2D(tDiffuse, vUv + dir * (uCA * d)).r; col.b = texture2D(tDiffuse, vUv - dir * (uCA * d)).b;
      if (uBlur > 0.002) {
        // Jittered taps, with highlights held back, so bright lights smear softly instead of in steps.
        float jit = fract(sin(dot(vUv * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        vec3 acc = min(col, vec3(6.0)); float s = uBlur * smoothstep(0.12, 0.7, d) * 0.06;
        for (int i = 1; i < 11; i++) acc += min(texture2D(tDiffuse, vUv - dir * s * (float(i) - 0.5 + jit)).rgb, vec3(6.0));
        col = acc / 11.0;
      }
      // Sharpen: add back the difference from the neighbours, held within a band
      // round the original so bright highlights don't ring.
      float sh = uSharpen * (1.0 - clamp(uBlur * 1.5, 0.0, 1.0));
      if (sh > 0.001) {
        vec3 nb = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
                + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
        col = clamp(col + (col - nb * 0.25) * sh, col * 0.75, col * 1.3 + 0.01);
      }
      // Clarity: local contrast over a wider radius than the sharpen, for that crisp, punchy look.
      if (uClarity > 0.001) {
        vec2 o = uTexel * 2.4;
        vec3 wide = (texture2D(tDiffuse, vUv + o).rgb + texture2D(tDiffuse, vUv - o).rgb + texture2D(tDiffuse, vUv + vec2(o.x, -o.y)).rgb + texture2D(tDiffuse, vUv + vec2(-o.x, o.y)).rgb) * 0.25;
        col = clamp(col + (col - wide) * uClarity * (1.0 - clamp(uBlur * 1.5, 0.0, 1.0)), col * 0.7, col * 1.35 + 0.01);
      }
      // Ambient occlusion (half-res, blurred): darkens creases and contact points.
      if (uAO > 0.0) col *= mix(1.0, texture2D(tAO, vUv).r, uAO);
      // Bounced light (ray-traced global illumination): what the rays gathered from the lit surfaces around, tinted by this surface's own colour.
      if (uGI > 0.0) {
        float l0 = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col += clamp(col / max(l0, 0.03), 0.25, 2.2) * 0.5 * texture2D(tGI, vUv).rgb * uGI;
      }
      // Sun shafts: smear the brightest parts of the picture towards the sun, so
      // light pours through gaps in the trees and buildings.
      if (uRays * uSunVis > 0.002) {
        vec2 dv = (uSun - vUv) * (0.9 / 24.0), uv = vUv; float w = 1.0; vec3 acc = vec3(0.0);
        for (int i = 0; i < 24; i++) {
          uv += dv; vec3 s = texture2D(tDiffuse, uv).rgb;
          acc += s * smoothstep(2.4, 8.0, max(max(s.r, s.g), s.b)) * w; w *= 0.94;
        }
        col += acc / 24.0 * uRays * uSunVis * vec3(1.0, 0.82, 0.58);
      }
      float vig = smoothstep(1.1, 0.3, d);
      col *= mix(mix(0.78, 0.62, uSunset), 1.0, vig);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, mix(col * vec3(0.96, 0.93, 1.07), col * vec3(1.05, 1.0, 0.93), smoothstep(0.0, 0.8, l)), uSunset);
      // Saturation, contrast around mid-grey (in linear light) and a touch of warmth.
      col = max(vec3(0.0), mix(vec3(l), col, uSat));
      col = 0.18 * pow(col / 0.18, vec3(uContrast));
      col *= vec3(1.0 + uWarm, 1.0, 1.0 - uWarm);
      // A little film grain.
      col *= 1.0 + (fract(sin(dot(vUv * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};
let composer = null, bloom = null, grade = null, aoPass = null, giPass = null, histPass = null;
if (quality !== 'low') {
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: Q.msaa, depthTexture: (Q.ao || Q.ssr || Q.gi) ? new THREE.DepthTexture(4, 4, THREE.UnsignedIntType) : null });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (Q.ssr) { histPass = new HistoryPass(camera); composer.addPass(histPass); }          // keeps the picture for next frame's reflection rays
  if (Q.ao) { aoPass = new AOPass(camera, { radius: 2.0, gain: 3.2 }); composer.addPass(aoPass); }
  if (Q.gi) { giPass = new GIPass(camera, { rays: Q.gi.rays, steps: Q.gi.steps }); composer.addPass(giPass); }
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), (TOD.night ? 0.62 : TOD.lampsOn ? 0.42 : 0.22) * Q.bloom, 0.55, TOD.night ? 0.8 : TOD.lampsOn ? 0.92 : 1.6);
  composer.addPass(bloom);
  grade = new ShaderPass(GradeShader); composer.addPass(grade);
  if (aoPass) { grade.uniforms.tAO.value = aoPass.texture; grade.uniforms.uAO.value = 0.9; }
  if (giPass) { grade.uniforms.tGI.value = giPass.texture; grade.uniforms.uGI.value = 0.75; }
  composer.addPass(new OutputPass());
}

// ---------------------------------------------------------------------------
// Keeping the frame rate up (src/perf.js). The resolution scaler (below) goes first; when it is at its floor the guard turns the dearest
// effects off one by one (and on again when there is room); when the JavaScript is the limit it thins the police, crowds and traffic.
// ---------------------------------------------------------------------------
const prof = new Profiler();
const DIST0 = { detailR: Q.detailR, treeR: Q.treeR, scatR: Q.scatR };
const GPU_LADDER = [
  { name: 'RAY-TRACED LIGHT BOUNCE', on(v) { if (giPass) { giPass.enabled = v; grade.uniforms.uGI.value = v ? 0.75 : 0; } }, has: () => !!giPass },
  { name: 'RAY-TRACED REFLECTIONS', on(v) { const e = v && !!Q.ssr; SSR.enabled = e; if (!e) SSR.amt.value = 0; if (histPass) histPass.enabled = e; }, has: () => !!Q.ssr },
  { name: 'AMBIENT OCCLUSION', on(v) { if (aoPass) { aoPass.enabled = v; grade.uniforms.uAO.value = v ? 0.9 : 0; } }, has: () => !!aoPass },
  { name: 'DISTANT DETAIL', on(v) { const k = v ? 1 : 0.62; Q.detailR = DIST0.detailR * k; Q.treeR = DIST0.treeR * k; Q.scatR = DIST0.scatR * k; }, has: () => true },   // (the city and terrain read these every update)
].filter(st => st.has());
const CPU_LADDER = [
  { name: 'FEWER OFFICERS', on(v) { if (officers) officers.cap = v ? officers.fullCap : Math.max(2, Math.ceil(officers.fullCap / 2)); } },
  { name: 'SMALLER CROWDS', on(v) { guardCrowd = v ? 1 : 0.5; if (peds) peds.setCount(crowdCount()); } },
  { name: 'LIGHTER TRAFFIC', on(v) { guardTraffic = v; if (traffic) traffic.setDensity(trafficLevel(), car); } },
];
let guardCrowd = 1, guardTraffic = true;
const guard = new PerfGuard(GPU_LADDER.length, CPU_LADDER.length);
const crowdCount = () => Math.round(Q.peds * (settings.crowd ?? 1) * guardCrowd);
const trafficLevel = (l = settings.traffic) => (!guardTraffic && l !== 'off' ? 'light' : l);
// Every step is down and the device is still too slow: if the quality was left on Auto, the next start is one tier lighter.
function saveLighterTier() {
  const order = ['ultra', 'high', 'medium', 'low'], i = order.indexOf(Q.name);
  if (TIER_EXPLICIT || i < 0 || i >= order.length - 1 || settings.qualityAuto === order[i + 1]) return;
  settings.qualityAuto = order[i + 1]; save(); if (hud) hud.toast('THIS DEVICE STRUGGLES: A LIGHTER GRAPHICS SETTING IS SAVED FOR NEXT TIME', 4);
}
function applyGuard(act) {
  if (!act) return;
  if (act === 'exhausted') { saveLighterTier(); return; }
  if (act.endsWith('-down')) { const lad = act.startsWith('gpu') ? GPU_LADDER : CPU_LADDER, st = lad[(act.startsWith('gpu') ? guard.gpu : guard.cpu) - 1]; st.on(false); if (hud) hud.toast('SMOOTHER: ' + st.name + ' OFF', 2.2); }
  else { const gpu = act.endsWith('gpu'), st = (gpu ? GPU_LADDER : CPU_LADDER)[gpu ? guard.gpu : guard.cpu]; st.on(true); }
}
// A phone or tablet can lose the graphics context when it runs short of memory; the page says so and carries on when it comes back.
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); game.ctxLost = true; loadMsgSoft('The graphics were reset by the device (low memory?). Hold on…'); });
canvas.addEventListener('webglcontextrestored', () => { game.ctxLost = false; loadMsgSoft(''); resize(); guard.pause(6); });
function loadMsgSoft(t) { const el = $('load-msg'); if (!el) return; el.textContent = t; $('loading').classList.toggle('hidden', !t); }
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
const extraMats = [];
let heist = null, interior = null, melee = null, bigmap = null, heli = null, seated = null, grass = null, river = null, landmarks = null, buskers = null, structures, towns, sky, city, terrain, traffic, carMesh, heroMesh, gtMesh, police, fx, gates, hud, csm = null, probe = null, walker = null, arsenal = null, officers = null, footCam = null, debris = null, worldFx = null, peds = null, beams = null, rain = null;
const car = new Vehicle();
const input = new Input();
const driver = new Driver();
const audio = new AudioEngine();
const chaseMusic = new ChaseMusic(audio); chaseMusic.load();   // the player's own song for the chase, if they have chosen one (see chasemusic.js)
function applyVolume() { audio.setVolume(settings.volume, settings.sound); chaseMusic.setVolume(settings.volume, settings.sound && settings.music); }
const START = { x: laneOffset(0, 1), z: 3 * SP - 60, h: Math.PI };

async function build() {
  // Make sure the web fonts are in before any text is drawn onto a texture.
  try { await Promise.race([Promise.all([document.fonts.load('900 52px "Barlow Condensed"'), document.fonts.load('700 40px "Barlow"')]), new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* fallback fonts are fine */ }
  loadMsg('Painting the sky…'); await nextFrame();
  sky = buildSky(scene, renderer, quality);
  try { await applyHDRI(renderer, scene, TOD_NAME); } catch (e) { console.warn('HDR sky not loaded, using the built-in one', e); }
  city = new City(scene);
  await city.init(loadMsg);
  loadMsg('Raising the hills…'); await nextFrame();
  terrain = buildTerrain(scene, !TOD.lampsOn);
  extraMats.push(...terrain.materials, ...initRoads(terrain, city));
  initScatter(terrain, city.props);
  grass = initGrass(scene); if (grass) extraMats.push(grass.material);
  structures = initStructures(scene, city);
  towns = await initTowns(scene, city, { frame: nextFrame, msg: loadMsg });
  loadMsg('Filling the river…'); await nextFrame();
  river = initRiver(scene, city); extraMats.push(...river.materials, ...Object.values(city.matCut), ...initRoadCut(city));
  landmarks = initLandmarks(scene, city); extraMats.push(...landmarks.materials);
  await terrain.loadAround(START.x, START.z, 1, loadMsg);
  await city.loadAround(START.x, START.z, Math.min(2, Q.loadR), loadMsg);
  loadMsg('Starting the traffic…'); await nextFrame();
  traffic = new Traffic(scene, city, Q.shadows);
  try { traffic.addModel(await loadFerrariTraffic()); } catch (e) { console.warn('The traffic sports car did not load', e); }
  loadMsg('Unpacking the car…'); await nextFrame();
  let hero = null; try { hero = await loadFerrari(settings.color, Q.name !== 'ultra'); } catch (e) { console.warn('The car model did not load, using the built-in one', e); }
  carMesh = heroMesh = hero || makeHeroCar(settings.color);
  heroMesh.userData.dims = HERO_DIMS; heroMesh.userData.cgOff = CG_OFF;
  scene.add(heroMesh);
  // The police chase's grand tourer and its pursuers are built up front (hidden), so their materials are in the scene for the
  // shadows and reflections and their shaders compile now rather than in the middle of a chase.
  gtMesh = makeGT(); gtMesh.visible = false; scene.add(gtMesh);
  police = new PoliceChase(scene); police.beams = null;
  police.onBoom = (x, z, power) => { peds.scare(x, z, 70, 7); audio.boom(Math.max(0.5, power), x, groundAt(x, z).y + 1, z); };
  police.onCopGun = (v, x, y, z) => audio.copShot(v, x, y, z);
  police.onGun = () => audio.gun(); police.onMissile = () => audio.whoosh(); police.onBeep = f => audio.beep(f, 0.12, 0.22);
  police.onCrash = j => { const k = Math.min(1, j / 25000); audio.thump(0.2 + k); game.shake = Math.max(game.shake, k * 0.6); };
  fx = new FX(scene);
  if (TOD.lampsOn) { beams = new Headlights(scene); traffic.beams = beams; police.beams = beams; }
  rain = new Rain(scene);
  worldFx = new Particles(scene); debris = new Debris(scene, city.props, worldFx); debris.onClang = (k, v) => audio.clang(v);
  gates = new Gates(scene);
  peds = new Peds(scene, Q.peds, Q.shadows); peds.setCount(crowdCount()); peds.onHit = (p, sp) => { audio.thump(0.35); crime(0.6, 'ped'); };
  buskers = new Buskers(scene, peds, audio, Q.shadows);
  seated = new SeatedDriver(scene, Q.shadows); seated.setOutfit(settings.outfit); seated.mount(carMesh);
  walker = new Walker(scene, settings.outfit); walker.onStep = (v, kind) => audio.step(v, kind); footCam = new FootCamera();
  melee = new Melee({
    walker, yaw: () => footCam.yaw, get peds() { return peds; }, get officers() { return officers; }, audio, hud: { toast: (t, s) => hud.toast(t, s) }, fx: police.fx,
    crime: (kind, n) => assault(n), heat: a => { if (game.chaseOn) police.addHeat(a); }, shake: v => { game.shake = Math.max(game.shake, v); },
    walls: (x, z) => solidAt(x, z), targets: () => heistTargets(), active: () => !!game.onFoot && game.state === 'free',
  });
  arsenal = new Arsenal({
    scene, melee, fx: police.fx, police, traffic, city, peds, audio, camera, aimRay, get officers() { return officers; }, get interior() { return interior && interior.active ? interior : null; }, get heist() { return heist; },
    hud: { toast: (t, s) => hud.toast(t, s) },
    crime: kind => gunCrime(kind), heat: a => { if (game.chaseOn) police.addHeat(a); },
    boom: (x, z, p) => police.onBoom && police.onBoom(x, z, p), shake: v => { game.shake = Math.max(game.shake, v); },
    active: () => !!game.onFoot && game.state === 'free', get touch() { return input.lastDevice === 'touch'; },
  });
  walker.placeWeapon = w => arsenal.place(w);
  interior = new Interior({ scene, camera, renderer, walker, audio, get hud() { return hud; } });
  heist = new Heist({ scene, interior, walker, arsenal, audio, fx: police.fx, toast: (t, s) => hud.toast(t, s), startWanted: stars => startWanted('robbery', stars), hurt: d => hurtPlayer(d), shake: v => { game.shake = Math.max(game.shake, v); } });
  settings.cash = settings.cash || 0;
  // What is seen inside a building as well as in the street: the gun in hand, the grenades, the bullet holes, the sparks and tracers of a shot.
  lay1(arsenal.holder); arsenal.grenadeMeshes.forEach(lay1); arsenal.rocketMeshes.forEach(lay1); arsenal.marks.meshes.forEach(lay1); for (const f of [police.fx, worldFx]) { if (!f) continue; lay1(f.add.pts); lay1(f.smoke.pts); f.tracers.forEach(t => lay1(t.m)); }
  // Police officers on foot (officers.js): they step out of cruisers that pull up near you, and shoot back.
  officers = new Officers({ scene, police, walker, audio, quality: Q.name, blocked: (ox, oy, oz, tx, ty, tz) => arsenal.blockedBetween(ox, oy, oz, tx, ty, tz), drop: (x, y, z, k) => arsenal.pickups.drop(x, y, z, k), shadows: !!Q.shadows, hud: { toast: (t, s) => hud.toast(t, s) }, obstacles, onFoot: () => !!game.onFoot && game.state === 'free', shake: v => { game.shake = Math.max(game.shake, v); } });
  police.officers = officers; setTimeout(() => officers.prepare(), 12000);
  heli = new Heli({ scene, police, audio, hud: { toast: (t, s) => hud.toast(t, s) }, fx: police.fx, camera, boom: (x, z, p) => police.onBoom && police.onBoom(x, z, p), target: () => (game.onFoot ? walker : car), traffic }); police.heli = heli; arsenal.env.heli = heli;
  hud = new HUD();
  bigmap = new BigMap(hud, {
    focus: mapFocus, route: () => game.route, waypoint: () => game.waypoint, found: () => settings.found || [], canTeleport: teleportWhy, teleport: teleportTo,
    setWaypoint: p => { game.waypoint = p; if (!p) hud.nav(null); else hud.toast('WAYPOINT SET', 1.2); },
  });
  car.reset(START.x, START.z, START.h);
  traffic.setDensity(trafficLevel(), car);
  applyAids();
  setupProbe();
  if (Q.csm) setupCSM();
  if (!TOD.lampsOn) addFlare();
  applyWeather();
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
  for (const mesh of [heroMesh, gtMesh]) mesh.traverse(o => {
    for (const m of [].concat(o.material || [])) if ((m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && m.envMapIntensity !== undefined && !m.userData.noProbe) m.envMap = rt.texture;
  });
  carMesh.visible = false; cam.position.set(car.x, carY + 0.9, car.z); withoutSSR(() => cam.update(renderer, scene)); carMesh.visible = true;
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
  withoutSSR(() => renderer.render(scene, cam.children[face]));
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
  for (const m of extraMats) setup(m);
  scene.traverse(o => { for (const m of [].concat(o.material || [])) setup(m); });
}

// A soft glare around the sun in daylight; buildings in front of it hide it.
function addFlare() {
  const glow = glowTex();
  const g = new THREE.Group();
  for (const [size, op] of [[2600, 0.55], [900, 0.9]]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(...TOD.flare), transparent: true, opacity: op, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    sp.scale.set(size, size, 1); g.add(sp);
  }
  scene.add(g);
  game.flare = g;
}

// Rain (a setting that takes effect at once): streaks falling past the camera, wet shiny roads and pavements, thicker haze, the sound of it.
function applyWeather() {
  const on = !!settings.rain;
  if (rain) rain.visible = on;
  if (city && city.mat) {
    const a = city.mat.asphalt, w = city.mat.walk, wet = on || !!TOD.wet;
    // With ray-traced reflections the wet road mirrors the street itself, so it needs less of the sky's help (and is a touch glossier).
    a.roughness = wet ? (Q.ssr ? 0.34 : 0.4) : 0.86; a.envMapIntensity = wet ? (Q.ssr ? 1.3 : 2.0) : 0.75; a.normalScale.setScalar(wet ? 0.4 : 0.55);
    WETNESS.wet.value = wet ? 1 : 0; WETNESS.damp.value = on && !TOD.wet ? 1 : 0;
    w.roughness = wet ? 0.6 : 0.92; w.envMapIntensity = wet ? 1.5 : 1;
  }
  if (scene.fog) scene.fog.density = TOD.fogDensity * (on ? 1.7 : 1);
  audio.rain(on ? 0.05 : 0);
}
function applyAids() {
  car.abs = settings.abs; car.tcs = settings.tcs; car.esp = settings.esp; car.auto = game.chaseOn ? true : settings.auto; car.steerAssist = settings.steerAssist;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const game = { onFoot: false, state: 'loading', prev: null, route: null, waypoint: null, next: 0, t: 0, cdT: 0, camMode: settings.cam ?? 0, shake: 0, menuT: 0, garage: false, splits: [] };
let carY = 0.0, camYaw = START.h, pitch = 0, roll = 0, pitchV = 0, rollV = 0;

function setState(s) {
  game.state = s;
  const driving = s === 'free' || s === 'race' || s === 'countdown';
  $('hud').classList.toggle('hidden', !driving && s !== 'finish' && s !== 'map' && s !== 'chaseEnd');
  $('chase-end').classList.toggle('hidden', s !== 'chaseEnd');
  document.body.classList.toggle('chasing', !!game.chaseOn && (driving || s === 'chaseEnd'));
  if (!game.chaseOn && hud) hud.chase(null);
  $('menu').classList.toggle('hidden', s !== 'menu');
  $('pause').classList.toggle('hidden', s !== 'paused');
  $('finish').classList.toggle('hidden', s !== 'finish');
  $('bigmap').classList.toggle('hidden', s !== 'map');
  $('fps').classList.toggle('hidden', !settings.fps);
  const touch = (input.lastDevice === 'touch' || (LOW_POWER && input.lastDevice === 'keyboard')) && driving;
  const foot = !!game.onFoot && s === 'free';
  $('touch').classList.toggle('hidden', !touch);
  document.body.classList.toggle('touchmode', touch);
  document.body.classList.toggle('onfoot', foot); document.body.classList.toggle('footmode', touch && foot);
  document.body.classList.toggle('nogad', !game.gadgets);
  input.footMode = foot; if (!(touch && foot) && input.endStick) input.endStick();
  if (!foot && document.pointerLockElement) { game.lockOff = true; try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
  $('cam-name').textContent = CAMS[game.camMode] || '';
  document.body.classList.toggle('tilt', settings.touchSteer === 'tilt');
  if (s !== 'race' && s !== 'countdown' && s !== 'map') { hud && hud.race(null); if (s !== 'free' && hud) hud.nav(null); }
  if (hud) hud.resize();
  if (s === 'chaseEnd') chaseMusic.stop(); else chaseMusic.set(!!game.chaseOn && (s === 'free' || s === 'countdown'));   // chase music: heard while driving in a chase, paused in menus, faded out at the end
}

// --- The police chase ---------------------------------------------------------------------------------------------------
// The chase happens in the free-roam state with game.chaseOn set; when it ends the state becomes 'chaseEnd' (the result card).
function swapCar(kind) {
  const next = kind === 'gt' ? gtMesh : heroMesh;
  if (carMesh !== next) { carMesh.visible = false; carMesh = next; carMesh.visible = true; car.setSpec(kind === 'gt' ? GT_SPEC : SPEC); if (seated) seated.mount(carMesh); }
  car.muzzleZ = kind === 'gt' ? 2.46 : 2.56;                // where the guns come out, ahead of the centre of mass
  game.head = null; applyAids();
}
// --- Walking, and getting in and out of the car -------------------------------------------------------------------------------
const PARKED_INPUT = () => ({ steer: 0, gas: 0, brake: 0.6, handbrake: true, nitro: false, analog: true, sens: 1, device: 'keyboard' });
const tmpQ = [];
function nearCar() {
  const fx = Math.sin(car.h), fz = Math.cos(car.h), dx = walker.x - car.x, dz = walker.z - car.z, t = clamp(dx * fx + dz * fz, -1.7, 1.7);
  return Math.hypot(dx - fx * t, dz - fz * t) < 2.5 && Math.abs(walker.y - carY) < 1.5;
}
// Where the character steps out: beside a door, on the pavement if there is one and nothing is in the way.
function exitSpot() {
  const r = [-Math.cos(car.h), Math.sin(car.h)]; let best = null, bs = -1e9;
  for (const side of [1, -1]) for (const d of [2.1, 3.0]) {
    const x = car.x + r[0] * side * d, z = car.z + r[1] * side * d; queryColliders(x, z, 1.2, tmpQ);
    const blocked = tmpQ.some(o => o.type === 'box' ? (x > o.x0 - 0.45 && x < o.x1 + 0.45 && z > o.z0 - 0.45 && z < o.z1 + 0.45) : Math.hypot(x - o.x, z - o.z) < o.r + 0.5);
    const sc = (blocked ? -100 : 0) + (groundAt(x, z).y > 0.05 ? 10 : 0) + (side > 0 ? 1 : 0) - d;
    if (sc > bs) { bs = sc; best = { x, z, side }; }
  }
  return best;
}
// The camera glides from where it was to where the new view puts it (getting in or out of the car).
const blend = { t: 1, dur: 0.7, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 60 };
function beginBlend(dur = 0.7) { blend.t = 0; blend.dur = dur; blend.pos.copy(camera.position); blend.quat.copy(camera.quaternion); blend.fov = camera.fov; }
function enterCar() {
  if (!game.onFoot || game.state !== 'free' || !nearCar()) return false;
  beginBlend(); game.onFoot = false; walker.show(false); arsenal.holster(); arsenal.clear(); if (officers) officers.standDown(); audio.door(); audio.init();
  camYaw = car.h; camInit = false; game.head = null; setState('free'); applyVolume();
  return true;
}
function leaveCar() {
  if (game.onFoot || game.state !== 'free') return false;
  if (car.speed > 7) { hud.toast('SLOW DOWN FIRST', 1.1); return false; }
  const sp = exitSpot(); beginBlend();
  walker.place(sp.x, sp.z, car.h); footCam.reset(car.h); audio.door();
  game.onFoot = true; game.head = null; setState('free');
  return true;
}
input.on('use', () => {
  if (game.state !== 'free') return;
  if (game.inside) { if (game.insideT > 0.5 && heist.use() === 'exit') leaveVenue(); return; }                          // (in a building: the button does what the prompt says)
  if (game.onFoot) { const v = !nearCar() ? venueNear(walker.x, walker.z, 3.6) : null; if (v) enterVenue(v); else if (!enterCar()) hud.toast('GET CLOSER TO THE CAR', 1.0); } else leaveCar();
});
// Circles for the walker to bump into: your own car, the traffic and the parked cars near it.
const _obs = [], _pool = Array.from({ length: 80 }, () => ({ x: 0, z: 0, r: 1 }));
function obstacles(x, z) {
  _obs.length = 0; let n = 0;
  if (walker.interior) return _obs;                                    // (the cars in the street below do not reach into a room)
  const circ = (cx, cz, r) => { if (n < _pool.length) { const o = _pool[n++]; o.x = cx; o.z = cz; o.r = r; _obs.push(o); } };
  const addCar = (c, len, rad) => { const dx = c.x - x, dz = c.z - z; if (dx * dx + dz * dz > 100) return; const f = [Math.sin(c.h), Math.cos(c.h)], q = len * 0.5 - rad; for (const o of [-q, 0, q]) circ(c.x + f[0] * o, c.z + f[1] * o, rad); };
  addCar(car, 4.6, 0.95);
  if (police && police.active) for (const c of police.cops) if (!c.wreck) addCar(c, c.len, c.rad);        // (parked police cars are solid too)
  for (const t of traffic.cars) if (t.active && t.pts) addCar(t, t.len || 4.6, t.rad || 0.95);
  for (const p of city.parkedList()) addCar(p, 4.5, 0.95);
  peds.near(x, z, circ);
  return _obs;
}
// The camera is moved before the weapons are, so the crosshair ray is this frame's (not the one before).
let footCamDone = false;
function footCamStep(dt, f, still) {
  footCam.update(dt, camera, walker, { dyaw: still ? 0 : f.dyaw || 0, dpitch: still ? 0 : f.dpitch || 0, zoom: f.zoom || 1, aim: arsenal ? arsenal.aimK : 0 }, { my: f.my || 0 });
  footCamDone = true;
}
// Where the crosshair points: the middle of the screen, or (a mouse without pointer lock) the cursor.
function setAimRay(cursor) {
  camera.updateMatrixWorld(); aimRay.pos.copy(camera.position);
  if (cursor) { tmpV.set(cursor.x, cursor.y, 0.5).unproject(camera); aimRay.dir.copy(tmpV).sub(camera.position).normalize(); game.cursorAim = cursor; }
  else { camera.getWorldDirection(aimRay.dir); game.cursorAim = null; }
}
function footUpdate(dt, raw) {
  const f = raw.foot; walker.update(dt, f, footCam.yaw, obstacles);
  footCamStep(dt, f, false); setAimRay(arsenal.cur >= 0 ? raw.arms.cursor : null);
  arsenal.update(dt, raw.arms, walker, camera, true); melee.update(dt);
  if (walker.interior) { interior.update(dt); heist.update(dt); return; }                // (in a building: nothing of the street reaches in)
  // The boot of the car is an armoury: walk up to it and the guns are topped up.
  const near = nearCar(); if (near && !arsenal.nearCar && arsenal.needsStock()) arsenal.bootRestock(); arsenal.nearCar = near;
  walker.sight = walker.crouching ? 55 : walker.speed > 5 ? 150 : 100;
  for (const t of traffic.cars) {                                       // a car that hits you knocks you down
    if (!t.active || !t.pts || t.mode === 'wreck') continue; const dx = walker.x - t.x, dz = walker.z - t.z; if (dx * dx + dz * dz > 36) continue;
    const v = traffic.velocityOf(t), sp = Math.hypot(v[0], v[1]); if (sp < 3.5) continue;
    const fx = Math.sin(t.h), fz = Math.cos(t.h), a = clamp(dx * fx + dz * fz, -t.len / 2, t.len / 2), d = Math.hypot(dx - fx * a, dz - fz * a);
    if (d < (t.rad || 0.95) + 0.3) { walker.knockDown(v[0] * 0.9 + (dx - fx * a) * 2, v[1] * 0.9 + (dz - fz * a) * 2); audio.thump(0.5); game.shake = Math.max(game.shake, 0.3); }
  }
}

function startChase() {
  game.route = null; game.waypoint = null; gates.clear(); hud.race(null); hud.nav(null);
  game.chaseOn = true; game.gadgets = true; game.wanted = false; game.onFoot = false; walker.show(false); swapCar('gt');
  resetCar(START.x, START.z, START.h);
  city.loadNow(START.x, START.z, 1); terrain.loadNow(START.x, START.z, 1); if (grass) grass.now(START.x, START.z);
  traffic.setDensity(trafficLevel(settings.traffic === 'off' ? 'light' : settings.traffic), car);
  for (const c of traffic.cars) traffic.spawn(c, car, 40, 500, true);
  driver.reset(); game.gprev = {};
  police.start(car, traffic); applyVolume(); if (settings.music) chaseMusic.start();
  setState('free'); hud.toast('THE POLICE ARE ON YOU', 2.2); audio.beep(880, 0.12); setTimeout(() => audio.beep(660, 0.2), 140);
}
function endChase() {
  if (!game.chaseOn && carMesh === heroMesh) return;
  game.chaseOn = false; game.gadgets = false; game.wanted = false; police.stop(); chaseMusic.stop(); audio.siren(0, 0); swapCar('hero'); hud.chase(null);
}
// Free roam: back on your feet beside the parked car, a long way from where you were (the same spot every time you start).
function placeOnFoot() {
  if (arsenal) { arsenal.clear(); arsenal.holster(); arsenal.restock(true); }
  resetCar(laneOffset(0, 2), START.z, START.h);
  game.onFoot = true; walker.place(laneOffset(0, 2) + 5.6, START.z + 1.5, -Math.PI / 2 - 0.5); footCam.reset(-Math.PI / 2 - 0.3); beginBlend(1.0);
}
function resumeFreeRoam() {
  endChase(); game.noWanted = (game.clock || 0) + 12; placeOnFoot(); setState('free'); hud.toast('BACK ON THE STREETS: walk to your car and press F', 3);
}
function chaseResult() {
  const P = police, t = P.time, won = P.result === 'escaped';
  if (interior && interior.active) forceLeave();
  if (game.carried) { if (won) bankCarried(); else { hud.toast('THE LOOT IS LOST', 2.4); game.carried = 0; } }
  if (game.wanted && won) {                                                    // got away from a free-roam wanted level: carry on
    hud.toast('YOU LOST THEM', 2.6); audio.beep(880, 0.2); setTimeout(() => audio.beep(1320, 0.3), 160); game.noWanted = (game.clock || 0) + 12; endChase(); setState('free'); return;
  }
  document.querySelector('[data-ce="retry"]').textContent = game.wanted ? 'BACK TO THE STREETS' : 'PLAY AGAIN';
  let newBest = false;
  if (won && (settings.chaseBest == null || t < settings.chaseBest)) { settings.chaseBest = t; save(); newBest = true; }
  $('ce-title').textContent = won ? 'YOU GOT AWAY' : P.result === 'busted' ? 'BUSTED' : 'WRECKED';
  $('ce-title').style.color = won ? '#7ff0a6' : '#ff6a5a';
  $('ce-sub').textContent = won ? 'You stayed out of sight for a whole minute: they gave up.' : P.result === 'busted' ? (walker.active && game.onFoot ? 'Caught on foot: the police have you.' : 'Boxed in and stopped: the police have you.') : (game.onFoot && walker.active ? (game.inside ? 'You were shot down in the robbery.' : 'You were shot down by the police.') : carMesh === gtMesh ? 'The grand tourer is a burning wreck.' : 'Your car is a burning wreck.');
  const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  $('ce-table').innerHTML = row('Time', fmtTime(t)) + row('Heat reached', '★'.repeat(P.maxStars)) + row('Police cars wrecked', P.kills) + (P.officersDown ? row('Officers down', P.officersDown) : '') + row('Bystander cars wrecked', P.civilians) + row('Armour left', Math.round(P.health) + '%') +
    (settings.chaseBest != null ? row(newBest ? 'New best escape!' : 'Best escape', fmtTime(settings.chaseBest)) : '');
  setState('chaseEnd');
  audio.beep(won ? 880 : 220, 0.25); setTimeout(() => audio.beep(won ? 1320 : 165, 0.4), 180);
}
// Per frame, inside the simulation block.
function chaseUpdate(dt, raw) {
  const g = raw.gadgets || {}, pv = game.gprev || (game.gprev = {});
  const inp = { fire: !!g.fire, missile: !!g.missile && !pv.missile, bomb: !!g.bomb && !pv.bomb, oil: !!g.oil && !pv.oil, smoke: !!g.smoke && !pv.smoke, shield: !!g.shield && !pv.shield };
  game.gprev = { ...g };
  police.clock = game.clock; police.hideout = !!walker.interior;
  const T = game.onFoot ? walker : car;                                      // who they are after
  police.update(dt, T, traffic, game.state === 'free' && game.gadgets && !game.onFoot ? inp : {});
  prof.mark('police');
  officers.update(dt);
  prof.mark('officers');
  heli.update(dt, T);
  if (game.onFoot && walker.active && game.state === 'free') police.collideWalker(walker);
  for (const m of police.consumeMessages()) hud.toast(m, 1.9);
  game.shake = Math.max(game.shake, police.shake * 0.7);
  const level = police.result === 'running' ? clamp(1 - police.nearest / 300, 0, 1) ** 1.4 : 0;
  audio.siren(level, game.clock);
  if (police.result !== 'running' && game.state === 'free' && police.endT > (police.result === 'escaped' ? 1.0 : 1.7)) chaseResult();
}

function resetCar(x, z, h) {
  car.reset(x, z, h); carY = groundAt(x, z).y; car.baseY = carY; camYaw = h; fx.reset();
}

function startFree() {
  endChase(); game.route = null; gates.clear();
  if (game.state === 'menu') {
    // Free roam starts on foot: the car is parked at the kerb and you are on the pavement beside it.
    placeOnFoot();
    setState('free'); hud.toast(input.lastDevice === 'touch' || LOW_POWER ? 'FREE ROAM: drag the left side to walk, the right side to look, FIRE draws a gun' : 'FREE ROAM: W A S D to walk, Shift to run, 1-4 for a gun, F to get in the car', 4.2);
  } else { setState('free'); hud.toast('FREE ROAM', 1.6); }
}

function startEvent(ev) {
  endChase(); game.onFoot = false; walker.show(false);
  const route = buildRoute(ev);
  game.route = route; game.next = 0; game.t = 0; game.cdT = 3.4; game.lastBeep = 4; game.splits = [];
  gates.build(route);
  resetCar(route.start.x, route.start.z, route.start.h);
  city.loadNow(route.start.x, route.start.z, 1); terrain.loadNow(route.start.x, route.start.z, 1); if (grass) grass.now(route.start.x, route.start.z);
  traffic.setDensity(trafficLevel(), car);
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
  if (Math.abs(x) > EDGE + 20 || Math.abs(z) > EDGE + 20) {
    // Out in the countryside: back to the nearest road, facing the way you were going, in the right lane.
    let br = null, bi = 0, bd = 1e18;
    for (const R of ROADS) { if (R.kind === 'runway') continue; for (let i = 0; i < R.x.length - 1; i++) { const d = (R.x[i] - x) ** 2 + (R.z[i] - z) ** 2; if (d < bd) { bd = d; br = R; bi = i; } } }
    const tx = br.x[bi + 1] - br.x[bi], tz = br.z[bi + 1] - br.z[bi], sgn = (tx * Math.sin(h) + tz * Math.cos(h)) >= 0 ? 1 : -1;
    const hh = Math.atan2(tx * sgn, tz * sgn), off = br.kind === 'motorway' ? 5.6 : br.kind === 'runway' ? 0 : 1.6;
    resetCar(br.x[bi] - Math.cos(hh) * off, br.z[bi] + Math.sin(hh) * off, hh);
    return;
  }
  x = clamp(x, -EDGE, EDGE); z = clamp(z, -EDGE, EDGE);
  const kx = clamp(Math.round(x / SP), -N, N), kz = clamp(Math.round(z / SP), -N, N);
  if (Math.abs(x - kx * SP) <= Math.abs(z - kz * SP)) {
    const d = Math.cos(h) >= 0 ? 1 : -1; x = kx * SP - d * laneOffset(kx, 1); h = d > 0 ? 0 : Math.PI;
    const nj = Math.round(z / SP); if (isRound(kx, nj) && Math.abs(z - nj * SP) < 28) z = nj * SP - d * 34;       // (not on a roundabout's island: just short of it)
  } else {
    const d = Math.sin(h) >= 0 ? 1 : -1; z = kz * SP + d * laneOffset(kz, 1); h = d > 0 ? Math.PI / 2 : -Math.PI / 2;
    const ni = Math.round(x / SP); if (isRound(ni, kz) && Math.abs(x - ni * SP) < 28) x = ni * SP - d * 34;
  }
  resetCar(x, z, h);
}

// ---------------------------------------------------------------------------
// Input events
// ---------------------------------------------------------------------------
function toggleMap() {
  if (game.state === 'map') { bigmap.close(); setState(game.prev); return; }
  if (!['free', 'race', 'countdown'].includes(game.state)) return;
  game.prev = game.state; setState('map'); bigmap.open();
}
const _mf = { x: 0, z: 0, h: 0 };
function mapFocus() { if (!game.onFoot) return car; _mf.x = walker.x; _mf.z = walker.z; _mf.h = footCam.yaw; return _mf; }
input.on('map', toggleMap);
$('map-btn').addEventListener('click', e => { e.stopPropagation(); toggleMap(); });
$('bm-close').addEventListener('click', toggleMap);

// --- Teleporting from the big map ---------------------------------------------------------------------------------------------------
// Where the map was tapped becomes a spot in a lane of the nearest road (the city's streets and winding roads, the motorways and the streets of the
// towns), facing along it the way you were already facing. Out in open country, with no road near, you land where you tapped. Water is refused.
const teleportWhy = () => (game.inside ? 'NOT INSIDE A BUILDING' : bench.on ? 'NOT DURING THE PERFORMANCE TEST' : game.chaseOn ? 'NOT DURING A POLICE CHASE' : game.prev !== 'free' || game.route ? 'NOT DURING A RACE' : null);
function spotClear(x, z) {
  if (isWater(x, z) || inWater(x, z, 3)) return false;
  if (Math.abs(x) < EDGE + 40 && Math.abs(z) < EDGE + 40) { const ni = Math.round(x / SP), nj = Math.round(z / SP); if (isRound(ni, nj) && Math.hypot(x - ni * SP, z - nj * SP) < 32) return false; }
  queryColliders(x, z, 3, tmpQ);
  return !tmpQ.some(o => o.type === 'box' ? (x > o.x0 - 1.4 && x < o.x1 + 1.4 && z > o.z0 - 1.4 && z < o.z1 + 1.4) : Math.hypot(x - o.x, z - o.z) < o.r + 2);
}
function avenueSpot(A, s, sgn) {                                       // the lane spot on avenue A at arc length s, travelling in direction sgn
  s = clamp(s, 0, A.length); let i = 0; while (i < A.n - 2 && A.s[i + 1] < s) i++;
  const t = clamp((s - A.s[i]) / ((A.s[i + 1] - A.s[i]) || 1), 0, 1), tx = A.tx[i] * sgn, tz = A.tz[i] * sgn, h = Math.atan2(tx, tz), off = A.hw * 0.5;
  return { x: A.x[i] + (A.x[i + 1] - A.x[i]) * t - Math.cos(h) * off, z: A.z[i] + (A.z[i + 1] - A.z[i]) * t + Math.sin(h) * off, h };
}
// Candidates, nearest first, then the first with room for a car; null if the tap is on water or nothing near has room.
function snapToRoad(x, z) {
  const hint = car.h, fx = Math.sin(hint), fz = Math.cos(hint), out = [];
  if (isWater(x, z) || inWater(x, z, 0)) return null;                      // (the tap itself, before it is pulled inside the world's edge)
  const lim = WORLD_LIM; x = clamp(x, lim.x0, lim.x1); z = clamp(z, lim.z0, lim.z1);
  const inCity = Math.abs(x) < EDGE + 20 && Math.abs(z) < EDGE + 20;
  if (inCity) {
    x = clamp(x, -EDGE, EDGE); z = clamp(z, -EDGE, EDGE);
    const av = nearestAvenue(x, z);
    if (av && av.d < av.a.W + 16) {
      const A = av.a, s0 = A.s[av.i] + av.t * ((A.s[av.i + 1] - A.s[av.i]) || 0), sgn = (A.tx[av.i] * fx + A.tz[av.i] * fz) >= 0 ? 1 : -1;
      for (let k = 0; k <= 36; k++) for (const e of k ? [1, -1] : [1]) out.push(avenueSpot(A, s0 + e * k * 12, sgn));
    } else {
      const kx = clamp(Math.round(x / SP), -N, N), kz = clamp(Math.round(z / SP), -N, N), alongZ = Math.abs(x - kx * SP) <= Math.abs(z - kz * SP);
      for (let k = 0; k <= 36; k++) for (const e of k ? [1, -1] : [1]) {
        if (alongZ) { const d = Math.cos(hint) >= 0 ? 1 : -1; out.push({ x: kx * SP - d * laneOffset(kx, 1), z: clamp(z + e * k * 12, -EDGE, EDGE), h: d > 0 ? 0 : Math.PI }); }
        else { const d = Math.sin(hint) >= 0 ? 1 : -1; out.push({ x: clamp(x + e * k * 12, -EDGE, EDGE), z: kz * SP + d * laneOffset(kz, 1), h: d > 0 ? Math.PI / 2 : -Math.PI / 2 }); }
      }
    }
  } else {
    let br = null, bi = 0, bd = 1e18;
    for (const R of ROADS) { if (R.kind === 'runway') continue; for (let i = 0; i < R.x.length - 1; i++) { const d = (R.x[i] - x) ** 2 + (R.z[i] - z) ** 2; if (d < bd) { bd = d; br = R; bi = i; } } }
    if (br && bd < 220 * 220) {
      const sgn = ((br.x[bi + 1] - br.x[bi]) * fx + (br.z[bi + 1] - br.z[bi]) * fz) >= 0 ? 1 : -1, off = br.kind === 'motorway' ? 5.6 : 1.6;
      for (let k = 0; k <= 36; k++) for (const e of k ? [1, -1] : [1]) {
        const i = clamp(bi + e * k * 2, 0, br.x.length - 2), tx = (br.x[i + 1] - br.x[i]) * sgn, tz = (br.z[i + 1] - br.z[i]) * sgn, h = Math.atan2(tx, tz);
        out.push({ x: br.x[i] - Math.cos(h) * off, z: br.z[i] + Math.sin(h) * off, h });
      }
    } else out.push({ x, z, h: hint });                                      // open country: where you tapped
  }
  for (const c of out) { if (Math.abs(c.x) < EDGE + 40 && Math.abs(c.z) < EDGE + 40) city.loadNow(c.x, c.z, 0); if (spotClear(c.x, c.z)) return c; }
  return null;
}
function teleportTo(x, z) {
  const why = teleportWhy(); if (why) { hud.toast(why, 1.8); return null; }
  const spot = snapToRoad(x, z); if (!spot) { hud.toast('NO ROOM THERE: TRY ANOTHER SPOT', 2); return null; }
  bigmap.close(); game.head = null;
  resetCar(spot.x, spot.z, spot.h);
  if (Math.abs(spot.x) < EDGE + 120 && Math.abs(spot.z) < EDGE + 120) city.loadNow(spot.x, spot.z, 1);
  terrain.loadNow(spot.x, spot.z, 1); if (grass) grass.now(spot.x, spot.z); resetCar(spot.x, spot.z, spot.h);           // (the ground is there now: the car sits on it)
  if (game.onFoot) { const sp = exitSpot() || { x: spot.x + 2.4, z: spot.z }; walker.place(sp.x, sp.z, spot.h); footCam.reset(spot.h); }
  traffic.setDensity(trafficLevel(), car); for (const c of traffic.cars) traffic.spawn(c, car, 40, 500, true);
  guard.pause(8); beginBlend(0.5); setState('free'); audio.beep(660, 0.12);
  const name = bigmap.sel ? bigmap.sel.name : 'the spot'; hud.toast('TELEPORTED: ' + name.toUpperCase(), 2.2);
  return { x: spot.x, z: spot.z, name };
}
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
input.on('back', () => { if (game.state === 'paused' || game.state === 'map') togglePause(); else if (armedNow()) melee.kick(); });
input.on('kick', () => { if (armedNow()) melee.kick(); });
const CAMS = ['WIDE CHASE', 'CLOSE CHASE', 'DRIVER VIEW', 'HOOD CAMERA', 'BUMPER CAMERA'];
function nextCamera() {
  if (game.state === 'menu') return;
  if (game.onFoot) { footCam.idle = 9; footCam.yaw = walker.h; hud.toast('CAMERA BEHIND YOU', 0.9); return; }
  game.camMode = (game.camMode + 1) % CAMS.length; settings.cam = game.camMode; save();
  hud.toast(CAMS[game.camMode], 1.2); $('cam-name').textContent = CAMS[game.camMode];
}
input.on('camera', nextCamera);
$('cam-btn').addEventListener('click', e => { e.stopPropagation(); nextCamera(); });
input.on('reset', () => { if ((game.state === 'free' || game.state === 'race') && !game.chaseOn && !game.onFoot) respawnOnRoad(); });
// On foot with a gun: 1 to 4 choose one (again to put it away), 0 puts it away, Q goes back a gun, R reloads, G throws a grenade, and a button aims.
const armedNow = () => game.onFoot && game.state === 'free' && walker.active;
input.on('weapon', n => { if (armedNow()) arsenal.select(n - 1); });
input.on('weaponNext', () => { if (armedNow()) arsenal.cycle(1); });
input.on('reload', () => { if (armedNow()) arsenal.reload(); });
input.on('grenade', () => { if (armedNow()) arsenal.throwGrenade(walker); });
input.on('aim', () => { if (armedNow()) arsenal.toggleAim(); });
input.on('shiftUp', () => { if (game.onFoot) input.emit('use'); else if (!car.auto) car.shift(1); });
input.on('shiftDown', () => { if (game.onFoot) { if (armedNow()) arsenal.cycle(-1); } else if (!car.auto) car.shift(-1); });
input.on('mute', () => { settings.sound = !settings.sound; save(); applyVolume(); hud.toast(settings.sound ? 'SOUND ON' : 'SOUND OFF', 1); });
input.on('any', () => { audio.init(); applyVolume(); chaseMusic.unlock(); audio.rain(settings.rain ? 0.05 : 0); });
input.on('wheel', () => { if (!settings.wheel || !settings.wheel.gas) hud.toast('Wheel connected: set up pedals in Settings', 3.5); });
input.bindTouch($('touch'));
canvas.addEventListener('click', () => { if (game.onFoot && game.state === 'free' && !LOW_POWER && input.lastDevice !== 'touch' && !document.pointerLockElement && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed */ } } });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) { game.lockOff = false; return; }
  if (game.lockOff) { game.lockOff = false; return; }
  if (game.state === 'free' && game.onFoot) togglePause();          // Esc was used to let go of the mouse: that is a pause too
});
document.addEventListener('pointerdown', () => input.emit('any'), { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) { audio.suspend(); if (['free', 'race', 'countdown'].includes(game.state)) togglePause(); } });

// ---------------------------------------------------------------------------
// Menus (src/menus.js)
// ---------------------------------------------------------------------------
// The performance test (src/bench.js).
const bench = new Bench({
  car, game, spots: SPOTS, resetCar, loadNow: (x, z) => city.loadNow(x, z, 0),
  info: () => ({ calls: lastInfo.calls, tris: lastInfo.tris, res: resScale, easeGpu: guard.gpu, easeCpu: guard.cpu, heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0 }),
  status(t) { const el = $('bench'); el.classList.toggle('hidden', !t); $('bench-t').textContent = t; },
  env: () => ({ device: (IOS ? 'iPad/iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : /Windows/.test(navigator.userAgent) ? 'Windows' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'other') + ` ${screen.width}x${screen.height} @${window.devicePixelRatio}x`, quality, canvas: `${renderer.domElement.width}x${renderer.domElement.height}`, rt: Q.rtMode, msaa: Q.msaa, gpu: GPU.renderer, tod: TOD_NAME }),
});
function startBench(o) {
  endChase(); game.route = null; gates.clear(); game.onFoot = false; walker.show(false); if (arsenal) arsenal.clear();
  $('panel').classList.add('hidden'); $('pause-panel').classList.add('hidden');
  setState('free'); bench.start(o);
}
$('bench-stop').addEventListener('click', () => { bench.stop(); toMenu(); });
const menus = initMenus({
  bench, startBench, game, chaseMusic, car, input, START, quality, startEvent, startChase, setState, resumeFreeRoam, togglePause, toggleFullscreen, startFree,
  respawnOnRoad, resetCar, medalFor, exitSpot, endChase, applyWeather, applyVolume, applyAids,
  crowdCount, setOutfitAll(k) { walker.setOutfit(k); if (seated) seated.setOutfit(k); }, get walker() { return walker; }, get hud() { return hud; }, get arsenal() { return arsenal; }, get traffic() { return traffic; }, get peds() { return peds; },
  get heroMesh() { return heroMesh; }, get gates() { return gates; }, get footCam() { return footCam; },
});
const toMenu = () => { if (game.inside) forceLeave(); menus.toMenu(); };

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
const STEP = 1 / 240;
let acc = 0;
const NO_INPUT = { steer: 0, gas: 0, brake: 0, handbrake: false, nitro: false, analog: true, sens: 1, device: 'keyboard' };

function onHit(j, px, pz) {
  if (j < 900) return;
  const s = Math.min(1, j / 25000);
  if (game.chaseOn && !game.onFoot) police.playerHit(j, car.s.mass);
  audio.thump(0.2 + s);
  game.shake = Math.max(game.shake, s * 0.6);
  for (const p of input.pads()) if (p.vibrationActuator) p.vibrationActuator.playEffect('dual-rumble', { duration: 120 + s * 200, strongMagnitude: s, weakMagnitude: s * 0.6 }).catch(() => {});
}

// Street furniture gives way if you hit it hard enough (lamp posts and poles need a proper crash); smashing things is a crime.
function onBreak(c, j, px, pz) {
  const kind = c.brk.kind, dv = j / car.s.mass;
  if (dv < (kind === 'lamp' || kind === 'pole' ? 3.2 : 1.4)) return false;
  const b = breakProp(c); if (!b) return false;
  const v = car.worldVel(); debris.spawn(kind, c.x, c.z, b.yaw, v[0] * 0.9, v[1] * 0.9);
  audio.thump(0.3 + Math.min(0.5, dv * 0.05)); game.shake = Math.max(game.shake, 0.15 + Math.min(0.3, dv * 0.03));
  crime(0.3, 'break'); return true;
}
function onCar(t, j) { if (j / car.s.mass > 2.0) crime(0.5, 'car'); }

function physics(dt, inp) {
  car.step(dt, inp, groundAt);
  car.onGrass = car.wheels[0].kind !== 'asphalt' && car.wheels[0].kind !== 'concrete';
  if (bench.on) return;                                         // (the performance test drives through everything, so a crash cannot change what it measures)
  collideStatic(car, onHit, onBreak);
  collideTerrain(car, onHit);
  collideRiver(car, onHit);
  collideTraffic(car, traffic, onHit, onCar);
  collideTraffic(car, traffic.parkedWorld(car), onHit, onCar);
  if (!game.onFoot) peds.hitByCar(car);
  if (game.chaseOn && !game.onFoot) police.collidePlayer(car);
}

// --- Trouble: hit a car or smash something and the police come -----------------------------------------------------------------
function crime(amount, kind) {
  if (game.state !== 'free' || game.route || (game.onFoot && kind !== 'gun' && kind !== 'robbery')) return;
  const at = game.onFoot ? walker : car; peds.scare(at.x, at.z, 40, 6);                                               // everyone nearby runs
  if (game.chaseOn) { police.addHeat(amount); return; }
  if ((game.clock || 0) < (game.noWanted || 0)) return;                       // just got away: a few seconds of grace
  startWanted(kind);
}
// Walking into a building: the room is built, the camera is put on its layer, and the walker is set down inside the door. (Out again: beside the door.)
function enterVenue(v, instant) {
  if (!game.onFoot || game.state !== 'free' || interior.active) return false;
  const go = () => {
    game.venueRet = { x: walker.x, z: walker.z, h: v.dx !== undefined ? Math.atan2(v.dx, v.dz) : walker.h, v };
    if (v.dx !== undefined) { walker.x = v.x; walker.z = v.z; }
    interior.build(v, planFor(v.kind)); interior.enter(); footCam.reset(0); footCam.dist = 2.7; game.inside = v; game.insideT = 0;
    if (arsenal) arsenal.aimToggle = false;
    heist.begin(v, VENUE_TYPES[v.kind] || VENUE_TYPES.shop);
    hud.toast(VENUE_TYPES[v.kind] ? VENUE_TYPES[v.kind].name + ': ' + VENUE_TYPES[v.kind].blurb.toUpperCase() : '', 2.4);
    renderer.compile(scene, camera);                                                     // (the first time, the room's shaders are made now, under the fade)
  };
  if (instant) go(); else fadeTo(go);
  return true;
}
function leaveVenue(instant) {
  if (!interior.active) return false;
  const go = () => {
    const r = game.venueRet, loot = heist.loot; heist.end(); interior.exit(); game.inside = null; footCam.dist = 3.5;
    walker.place(r.x, r.z, r.h); footCam.reset(r.h);
    if (loot > 0) { settings.heists = (settings.heists || 0) + 1; game.carried = (game.carried || 0) + loot; if (!game.chaseOn) bankCarried(); else hud.toast('BAG $' + game.carried.toLocaleString('en-US') + ': SAFE WHEN YOU LOSE THE POLICE', 3); }
  };
  if (instant) go(); else fadeTo(go);
  return true;
}
// Out of a building at once (a chase ended, or back to the menu): whatever was in the bag is lost, unless it was banked.
function forceLeave() { if (!interior.active) return; heist.end(); interior.exit(); game.inside = null; footCam.dist = 3.5; const r = game.venueRet; if (r) { walker.place(r.x, r.z, r.h); footCam.reset(r.h); } }
function bankCarried() {
  const n = game.carried || 0; if (!n) return; game.carried = 0; settings.cash = (settings.cash || 0) + n; save();
  hud.toast('+ $' + n.toLocaleString('en-US') + ' BANKED', 2.6); audio.beep(1500, 0.08, 0.2); setTimeout(() => audio.beep(2100, 0.12, 0.2), 90);
}
// A quick fade to black and back, with something done at the darkest point.
function fadeTo(fn) { const el = $('fade'); el.style.opacity = '1'; setTimeout(() => { fn(); el.style.opacity = '0'; }, 240); }
// What the heist panel and the money show.
let hz = { sig: '' };
function heistHud() {
  const inside = !!game.inside && heist && heist.active, el = $('heist'), cash = (settings.cash || 0), carried = game.carried || 0;
  const c = $('cash'); const ct = '$ ' + cash.toLocaleString('en-US') + (carried ? '  + BAG ' + carried.toLocaleString('en-US') : ''); if (c.textContent !== ct) c.textContent = ct; c.classList.toggle('hidden', !(game.onFoot || cash > 0 || carried > 0) || game.state === 'menu');
  el.classList.toggle('hidden', !inside); if (!inside) return;
  const T = heist.type, sig = [T.kind, heist.loot, heist.alarm ? 1 : 0, Math.round(heist.progress * 50), Math.round(heist.suspect * 20), heist._blocked, heist.disabledT > 0 ? Math.ceil(heist.disabledT) : 0, heist.keycard ? 1 : 0, heist.dispatchT > 0 ? Math.ceil(heist.dispatchT) : 0].join('|');
  if (sig === hz.sig) return; hz.sig = sig;
  $('hz-name').textContent = T.name; $('hz-stars').textContent = '★'.repeat(T.tier) + '☆'.repeat(5 - T.tier);
  $('hz-bag').textContent = 'BAG $' + heist.loot.toLocaleString('en-US');
  const msg = heist.alarm ? (heist.dispatched ? 'ALARM: POLICE OUTSIDE' : heist.dispatchT > 0 ? 'ALARM: POLICE IN ' + Math.ceil(heist.dispatchT) + ' S' : 'ALARM') : heist.disabledT > 0 ? 'SECURITY OFF: ' + Math.ceil(heist.disabledT) + ' S' : 'NO ALARM YET';
  $('hz-msg').textContent = heist._blocked || msg; $('hz-msg').classList.toggle('alarm', heist.alarm); $('hz-msg').classList.toggle('warn', !!heist._blocked);
  $('hz-bar').classList.toggle('hidden', heist.progress < 0); $('hz-bar').firstElementChild.style.width = Math.max(0, heist.progress) * 100 + '%';
  $('hz-sus').classList.toggle('hidden', !(heist.suspect > 0.02)); $('hz-sus').firstElementChild.style.width = Math.min(1, heist.suspect) * 100 + '%';
}
// Fists, boots and knives: one punch on a stranger is a scuffle nobody reports; a second within half a minute, or a blade, is assault and the police come.
function assault(n) {
  if (game.state !== 'free' || game.route) return;
  const now = game.clock || 0; if (now - (game.assaultT || -99) > 30) game.assaultN = 0; game.assaultT = now; game.assaultN = (game.assaultN || 0) + n;
  if (game.chaseOn) { police.addHeat(0.04 * n); return; }
  if (game.assaultN >= 2.0 && now >= (game.noWanted || 0)) { game.assaultN = 0; startWanted('assault'); }
}
const _wl = [];
function solidAt(x, z) { queryColliders(x, z, 0.4, _wl); for (const c of _wl) if (c.type === 'box' && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return true; return false; }
function heistTargets() { return heist && heist.active ? heist.targets() : null; }
function hurtPlayer(d) { police.health -= d; police.damageFlash = Math.min(1, police.damageFlash + 0.22); police.shake = Math.min(1, police.shake + 0.1); }
// Every shot fired, and every grenade thrown, in the street: the police come (and a gunfight keeps them coming).
function gunCrime() {
  if (game.inside && heist && heist.active) { heist.gunshot(); heist.alarmNow('SHOTS FIRED', heist.type.delay); return; }                // (in a shop: the alarm, and the police a little after)
  if (game.state !== 'free' || game.route || game.chaseOn) return;
  if ((game.clock || 0) < (game.noWanted || 0)) return;
  startWanted('gun');
}
function startWanted(kind, stars) {
  game.chaseOn = true; game.wanted = true; game.gadgets = true; applyAids();      // (the car's hidden guns, missiles, bombs, oil, smoke and armour are live while the police are after you)
  police.start(game.onFoot ? walker : car, traffic, { heat: kind === 'robbery' ? (stars || 1) + 0.2 : kind === 'gun' ? 1.6 : 1.2, near: kind === 'robbery' ? 2 + (stars || 1) : 4 });
  driver.gprev = {}; game.gprev = {};
  applyVolume(); if (settings.music) chaseMusic.start();
  setState('free');
  hud.toast((kind === 'assault' ? 'ASSAULT' : kind === 'robbery' ? 'ROBBERY IN PROGRESS' : kind === 'break' ? 'YOU SMASHED SOMETHING' : kind === 'ped' ? 'YOU KNOCKED SOMEONE DOWN' : kind === 'gun' ? 'SHOTS FIRED' : 'YOU HIT A CAR') + ': POLICE ON THE WAY', 2.6); audio.beep(880, 0.12); setTimeout(() => audio.beep(660, 0.2), 140);
  setTimeout(() => { if (game.chaseOn && game.wanted && !game.onFoot) hud.toast(input.lastDevice === 'touch' || LOW_POWER ? 'THE CAR HAS GUNS, MISSILES AND MORE: USE THE BUTTONS' : 'GADGETS: J GUNS  K MISSILE  L BOMB  O OIL  I SMOKE  H ARMOUR', 3.4); }, 2800);
}

// ---------------------------------------------------------------------------
// Rendering the car and the camera
// ---------------------------------------------------------------------------
const tmpFwd = new THREE.Vector3(), tmpV = new THREE.Vector3(), lookV = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;
const camQuery = [];
const camFrustum = new THREE.Frustum(), projScreen = new THREE.Matrix4();

// The physics point is the centre of mass, which sits 0.26 m behind the
// model's origin (between the axles' midpoint and the rear).
const CG_OFF = 0.261;
function updateCarMesh(dt, alpha) {
  let x = lerp(car.px, car.x, alpha), z = lerp(car.pz, car.z, alpha);
  const h = car.ph + wrapAngle(car.h - car.ph) * alpha;
  const cgo = carMesh.userData.cgOff; x += Math.sin(h) * cgo; z += Math.cos(h) * cgo;
  carY = car.baseY ?? groundAt(car.x, car.z).y;
  carMesh.position.set(x, carY, z);
  carMesh.rotation.y = h;
  if (beams && carMesh.visible && !game.onFoot && game.state !== 'menu') beams.add(x + Math.sin(h) * 1.6, carY + 0.05, z + Math.cos(h) * 1.6, h, 26, 8.5);
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
  if (game.camMode === 2 && game.state !== 'menu' && !game.onFoot) {
    const gear = car.gear === -1 ? 'R' : car.speed < 0.3 && car.throttle < 0.05 && car.gear === 1 ? 'N' : String(car.gear);
    ud.cockpit.update({ wheelAngle: car.steer * 9, rpm: car.rpm, redline: car.s.redline, kmh: car.speed * 3.6, mph: car.speed * 2.23694, gear, units: settings.units, abs: car.abs, esp: car.esp, tcs: car.tcs }, dt);
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
  if (game.onFoot && game.state !== 'menu') {
    const f = game.foot || {}, still = game.state === 'paused' || game.state === 'map';
    if (!footCamDone) footCamStep(dt, f, still);
    footCamDone = false;
    if (game.shake > 0.001) { camera.position.x += (Math.random() - 0.5) * game.shake * 0.3; camera.position.y += (Math.random() - 0.5) * game.shake * 0.3; game.shake *= Math.exp(-dt * 7); }
    camInit = false; applyBlend(dt); return;
  }
  const spd = car.speed;
  const f = [Math.sin(pose.h), Math.cos(pose.h)];
  const lookBack = input.keys.has('KeyB');
  let fov = 58;
  if (game.state === 'menu') {
    game.menuT += dt;
    const a = pose.h + Math.PI + 0.9 + Math.sin(game.menuT * 0.12) * 0.9;
    const person = game.garage && walker.active, d = game.garage ? (person ? 7.2 : 5.6) : 7.4;
    const mx = person ? (pose.x + walker.x) / 2 : pose.x, mz = person ? (pose.z + walker.z) / 2 : pose.z;
    camPos.set(mx + Math.sin(a) * d, carY + (game.garage ? 1.5 : 1.7), mz + Math.cos(a) * d);
    camLook.set(mx + (game.garage ? 0 : f[0] * 2.5) + (game.garage ? Math.cos(a) * 1.7 : 0), carY + (person ? 0.85 : 0.65), mz + (game.garage ? 0 : f[1] * 2.5) - (game.garage ? Math.sin(a) * 1.7 : 0));      // (in the Garage the subject is nudged left, clear of the panel)
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
    // From the driver's seat. The body pitches and rolls, but a real head and eyes level themselves out a good deal, so the
    // horizon only follows part of the way. Under braking, acceleration and cornering the head shifts with the g-forces, the
    // eyes look into the bend, and there is a faint tremor from the engine and the road.
    const cp = carMesh.userData.cockpit, body = carMesh.userData.body, H = game.head || (game.head = { x: 0, y: 0, z: 0, yaw: 0, roll: 0, pitch: 0, shakeT: 0 });
    carMesh.updateMatrixWorld(true);
    const lat = clamp(car.ay, -14, 14), lon = clamp(car.ax, -12, 12), vel = car.worldVel(), dv = wrapAngle(Math.atan2(vel[0], vel[1]) - pose.h);
    H.x = damp(H.x, clamp(-lat * 0.0042, -0.06, 0.06), 6, dt); H.z = damp(H.z, clamp(-lon * 0.0035, -0.05, 0.05), 5, dt); H.y = damp(H.y, clamp(-car.hvV * 0.03, -0.03, 0.03), 9, dt);
    const lookYaw = spd > 3 ? clamp(dv * 0.7 + car.steer * 0.35 - car.w * 0.07, -0.4, 0.4) : 0;
    H.yaw = damp(H.yaw, lookBack ? 0 : lookYaw, 3.5, dt); H.roll = damp(H.roll, -roll * 0.45 + lat * 0.0016, 6, dt); H.pitch = damp(H.pitch, -car.pitch * 0.5 + clamp(lon * 0.0016, -0.03, 0.03), 6, dt);
    H.shakeT += dt;
    const idle = clamp(car.rpm / 8000, 0.1, 1) * 0.0011, road = clamp(spd / 70, 0, 1) * 0.0016;
    const tx = Math.sin(H.shakeT * 61) * idle + (Math.random() - 0.5) * road, ty = Math.sin(H.shakeT * 47 + 1) * idle + (Math.random() - 0.5) * road * 1.3;
    tmpV.set(cp.eye.x + H.x + tx, cp.eye.y + H.y + ty, cp.eye.z + H.z);
    body.localToWorld(camera.position.copy(tmpV));
    lookV.set(cp.eye.x, cp.eye.y - 0.02, cp.eye.z + (lookBack ? -20 : 20)); if (lookBack) lookV.x = cp.eye.x;
    body.localToWorld(lookV);
    camera.up.set(0, 1, 0); camera.lookAt(lookV);
    camera.rotateY(input.look.yaw * 0.8 - H.yaw); camera.rotateX(-input.look.pitch * 0.5 + H.pitch - 0.06); camera.rotateZ(H.roll);
    fov = 62 + clamp(spd * 0.05, 0, 7) + (car.nitroOn ? 4 : 0);
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
  applyBlend(dt);
}
function applyBlend(dt) {
  if (blend.t >= 1) return;
  blend.t = Math.min(1, blend.t + dt / blend.dur); const k = blend.t * blend.t * (3 - 2 * blend.t);
  camera.position.lerpVectors(blend.pos, camera.position, k); camera.quaternion.slerpQuaternions(blend.quat, camera.quaternion, k); camera.fov = lerp(blend.fov, camera.fov, k); camera.updateProjectionMatrix();
}

function wheelFx(pose) {
  const c = Math.cos(pose.h), s = Math.sin(pose.h);
  const moving = car.speed > 3;
  let i = 0;
  for (const w of carMesh.userData.wheels) {
    const wi = car.wheels[(w.front ? 0 : 2) + (w.side > 0 ? 0 : 1)];
    const dm = carMesh.userData.dims, lx = w.side * dm.track / 2, lz = w.front ? dm.wzf : dm.wzr;
    const wx = pose.x + c * lx + s * lz, wz = pose.z - s * lx + c * lz;
    const slide = Math.max(Math.abs(wi.slipA) - 0.14, 0) * 3 + Math.max(Math.abs(wi.slipK) - 0.18, 0) * 2;
    const on = moving && wi.contact && !wi.grass && slide > 0.05;
    fx.skid(i++, wx, wi.ground, wz, on);
    if (on && Math.random() < 0.5) {
      const v = car.worldVel(); fx.puff(wx, wi.ground, wz, slide * 1.5, v[0], v[1]);
    }
  }
}

// Secret places are found by driving up to them; they then show on the map.
function checkDiscoveries() {
  const found = settings.found;
  const spots = [...BUNKERS.map(b => ({ id: b.id, name: b.name, x: b.cx - 30, z: b.cz, r: 80 })), { id: 'airfield', name: AIRFIELD.name, x: AIRFIELD.x, z: 3350, r: 520 }];
  const Fx = game.onFoot ? walker : car;
  for (const p of spots) if (!found.includes(p.id) && (Fx.x - p.x) ** 2 + (Fx.z - p.z) ** 2 < p.r * p.r) {
    found.push(p.id); save(); hud.toast(`DISCOVERED: ${p.name.toUpperCase()}`, 3.2); audio.beep(660, 0.12); setTimeout(() => audio.beep(990, 0.2), 140);
  }
}

// The arrow to the waypoint in free roam; it clears when you get there.
// "F  GET IN" beside the car, "F  GET OUT" when stopped in it.
function updatePrompt() {
  let txt = '';
  if (game.state === 'free') {
    if (game.inside && heist && heist.active) txt = heist.prompt === 'LEAVE' ? 'LEAVE' : heist.prompt;
    else if (game.onFoot) { if (nearCar()) txt = 'GET IN'; else { const v = venueNear(walker.x, walker.z, 3.6); if (v && VENUE_TYPES[v.kind]) txt = 'ENTER ' + VENUE_TYPES[v.kind].name; } }
    else if (car.speed < 6.5) txt = 'GET OUT';
  }       // (leaveCar needs under 7 m/s)
  const el = $('prompt'); el.classList.toggle('hidden', !txt); if (txt && $('prompt-txt').textContent !== txt) $('prompt-txt').textContent = txt;
  const tb = $('t-use'); tb.classList.toggle('show', !!txt); if (txt && tb.textContent !== txt) tb.textContent = txt;
}
const NO_ARMS = { fire: false, aim: false, sprint: false };
const aimRay = { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1) };      // where the crosshair points: the game camera's centre line, as it was before any test override
// The crosshair, the gun in hand and its ammunition.
const wh = { sig: '', slots: '' };
function weaponHud() {
  const on = !!game.onFoot && game.state === 'free', h = arsenal.hud, show = on && walker.active;
  const cl = document.body.classList; cl.toggle('armed', show); cl.toggle('drawn', show && h.drawn); cl.toggle('aiming', show && h.aim > 0.6); cl.toggle('hitmark', show && h.hit); cl.toggle('cursoraim', show && h.drawn && !!game.cursorAim);
  if (!show) { input.weaponDrawn = false; return; }
  const slots = h.slots.map(s => `<i class="${s.cur ? 'cur' : ''}${s.empty ? ' empty' : ''}" data-w="${s.i}"><kbd>${s.i}</kbd>${s.n.split(' ').pop()}</i>`).join('');
  if (slots !== wh.slots) { wh.slots = slots; $('wpn-slots').innerHTML = slots; }
  const sig = [h.name, h.mag, h.reserve, h.gren, h.reloading ? 1 : 0, h.melee ? 1 : 0].join('|');
  if (sig !== wh.sig) {
    wh.sig = sig; $('wpn-name').textContent = h.name || 'HOLSTERED';
    $('wpn-ammo').textContent = h.name ? (h.melee ? 'BLADE' : h.reloading ? 'RELOADING' : h.mag + ' / ' + h.reserve) : 'FISTS';
    $('wpn-gren').textContent = 'GRENADES ' + h.gren;
  }
  $('t-aim').classList.toggle('on', arsenal.aimToggle);
  $('wpn-reload').firstElementChild.style.width = (h.reloading ? h.reload * 100 : 0) + '%';
  const xh = $('xhair').style, ca = game.cursorAim;
  xh.setProperty('--gap', (6 + (1 - h.aim) * 10 + Math.min(1, walker.speed / 4) * 10) + 'px');
  xh.left = ca ? (ca.x * 0.5 + 0.5) * 100 + '%' : ''; xh.top = ca ? (0.5 - ca.y * 0.5) * 100 + '%' : '';       // (the crosshair follows the cursor when the mouse is not captured)
  input.weaponDrawn = show && h.drawn;
}
function waypointUpdate() {
  const w = game.waypoint;
  if (!w) { hud.nav(null); return; }
  const Fx = game.onFoot ? walker : car, dx = w.x - Fx.x, dz = w.z - Fx.z, dist = Math.hypot(dx, dz);
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
  const real = now - last, dt = Math.min(0.05, real / 1000); last = now;
  if (game.state === 'loading' || game.ctxLost || (DEBUG && window.__freeze)) return;
  const t0 = performance.now();
  tick(dt);
  if (bench.on) bench.sample(real, performance.now() - t0);
  const st = game.state;
  if (st === 'free' || st === 'race' || st === 'countdown') applyGuard(guard.sample(dt * 1000, performance.now() - t0, resScale <= 0.64));
}
const lastInfo = { calls: 0, tris: 0, geo: 0, tex: 0 };
function tick(dt) { prof.begin(); tickBody(dt); prof.end(); }
function tickBody(dt) {
  { const I = renderer.info; lastInfo.calls = I.render.calls; lastInfo.tris = I.render.triangles; lastInfo.geo = I.memory.geometries; lastInfo.tex = I.memory.textures; }       // (last frame's, for the FPS counter)
  renderer.info.reset();
  frameAvg = lerp(frameAvg, dt * 1000, 0.05);

  WIND.value = (performance.now() / 1000) % 3600;
  const raw = driver.shape(bench.on ? bench.read(dt) : input.read(dt), dt, car.speed);
  const st = game.state;
  const driving = st === 'free' || st === 'race';
  const foot = !!game.onFoot && st === 'free';
  const F = foot ? walker : car;                           // who the world follows
  game.foot = raw.foot;
  let inp = driving ? (foot ? PARKED_INPUT() : raw) : NO_INPUT;
  if (st === 'countdown') inp = { ...NO_INPUT, gas: raw.gas };
  if (st !== 'paused' && st !== 'map') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 16) {
      if (st === 'countdown' || st === 'menu' || st === 'finish' || st === 'chaseEnd') {
        // Hold the car still but let the engine rev (after a race or a chase it just brakes to a halt).
        const done = st === 'finish' || st === 'chaseEnd';
        car.step(STEP, done ? { ...NO_INPUT, brake: 1 } : inp, groundAt);
        if (!done) { car.x = car.px; car.z = car.pz; car.h = car.ph; car.vx = car.vy = car.w = 0; }
        else { collideStatic(car, null); }
      } else physics(STEP, inp);
      acc -= STEP; n++;
    }
    if (n === 16) acc = 0;
    game.clock = (game.clock || 0) + dt;
    const sig = signalState(game.clock);
    if (sig.Z !== game.sigZ || sig.X !== game.sigX) { game.sigZ = sig.Z; game.sigX = sig.X; city.setSignals(sig); }
    traffic.extra = foot ? [car] : null;
    prof.mark('physics');
    if (foot) footUpdate(dt, raw);
    prof.mark('foot');
    traffic.update(dt, F, sig);
    prof.mark('traffic');
    peds.update(dt, F, camera, sig);
    if (buskers) buskers.update(dt, F, camera);
    prof.mark('peds');
    if (!foot && car.speed > 13 && (game.scareT = (game.scareT || 0) - dt) <= 0) { game.scareT = 0.35; peds.scare(car.x + Math.sin(car.h) * 9, car.z + Math.cos(car.h) * 9, 9, 3); }
    if (game.chaseOn) chaseUpdate(dt, raw);
    prof.mark('chase');
    if (st === 'race' || st === 'countdown') raceUpdate(dt);
    else if (st === 'free' && !game.chaseOn) waypointUpdate();
    if ((st === 'free' && !game.chaseOn) || st === 'race') checkDiscoveries();
    updatePrompt();
  }
  city.update(F.x, F.z, st === 'paused' || st === 'map' ? 2 : 3.5);
  terrain.update(dt, F.x, F.z, st === 'paused' || st === 'map' ? 1.5 : 3);
  structures.update(F.x, F.z); towns.update(F.x, F.z, dt, performance.now() / 1000);
  river.update(dt, F.x, F.z); landmarks.update(dt, F.x, F.z);
  prof.mark('world');
  if (st === 'menu' && game.garage && walker.active) { walker.t += dt; walker.pose(dt); }          // the character idles beside the car in the Garage
  const alpha = st === 'paused' || st === 'map' ? 1 : acc / STEP;
  if (beams) beams.begin();
  const pose = updateCarMesh(dt, alpha);
  if (seated) { const show = !game.onFoot && st !== 'menu' && st !== 'loading' && game.camMode !== 2 && carMesh.visible; seated.show(show); if (show) seated.update(st === 'paused' || st === 'map' ? 0 : dt, { steer: car.steer / (car.s.steerMax || 0.6), w: car.w, throttle: car.throttle, brake: car.brakeIn }); }
  if (st !== 'paused' && st !== 'map') { wheelFx(pose); fx.update(dt); }
  camera.updateMatrixWorld(); camFrustum.setFromProjectionMatrix(projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  traffic.render(F, camFrustum);
  if (grass) grass.update(performance.now() / 1000, camera.position.x, camera.position.z);
  prof.mark('scene');
  updateCamera(dt, pose);
  if (!game.onFoot) { aimRay.pos.copy(camera.position); camera.getWorldDirection(aimRay.dir); }
  if (DEBUG && window.__cam) { const c = typeof window.__cam === 'function' ? window.__cam() : window.__cam; camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[3], c[4], c[5]); if (c[6]) { camera.fov = c[6]; camera.updateProjectionMatrix(); } }   // (a test hook: put the camera anywhere)
  if (st !== 'menu' || game.garage) peds.render(camera, st === 'paused' || st === 'map' ? 0 : dt);
  if (game.chaseOn && st !== 'paused' && st !== 'map') police.draw(game.clock || 0, car, dt, carMesh, camera, renderer);
  else if (st !== 'paused' && st !== 'map') police.fx.update(dt, camera, renderer);        // (gunfire and explosions outside a chase)
  prof.mark('view');
  if (arsenal) { if (!foot) arsenal.update(dt, NO_ARMS, walker, camera, false); weaponHud(); }
  if (heist) { game.insideT = (game.insideT || 0) + dt; heistHud(); }
  if (beams) beams.end();
  if (rain && rain.visible) rain.update(performance.now() / 1000, camera, !!TOD.night);
  if (st !== 'paused' && st !== 'map') debris.update(dt);
  worldFx.update(st === 'paused' || st === 'map' ? 0 : dt, camera, renderer);
  sky.dome.position.set(camera.position.x, 0, camera.position.z);
  if (st !== 'paused') sky.clouds.rotation.y += dt * 0.0035;                          // the clouds drift (they all face the middle, so turning them round it is exact)
  placeSun(sky.sun, tmpV.set(foot ? walker.x : pose.x, 0, foot ? walker.z : pose.z));
  if (csm) csm.update();
  if (game.flare) game.flare.position.copy(SUN_DIR).multiplyScalar(3800).add(camera.position);
  if (grade) {
    camera.getWorldDirection(tmpFwd);
    tmpV.copy(SUN_DIR).multiplyScalar(5000).add(camera.position).project(camera);
    grade.uniforms.uSun.value.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5);
    grade.uniforms.uSunVis.value = clamp((tmpFwd.dot(SUN_DIR) - 0.15) / 0.5, 0, 1);
    grade.uniforms.uTime.value = (performance.now() / 1000) % 100;
  }
  prof.mark('effects');
  updateProbe(pose);
  audio.setListener(camera);
  audio.hum(st === 'menu' || st === 'loading' ? 0.012 : foot ? 0.05 : 0.018);
  audio.update(car, (st === 'free' && !foot) || st === 'race' || st === 'countdown' || st === 'finish' || st === 'chaseEnd');
  if (st === 'free' || st === 'race' || st === 'countdown') {
    if (!foot) hud.drawDial(car, settings.units, { abs: car.abs, esp: car.esp, tcs: car.tcs });
    hud.drawMap(mapFocus(), traffic, game.route, game.next, game.waypoint, game.chaseOn ? police : null);
  }
  if (game.chaseOn) hud.chase(st === 'paused' || st === 'map' ? null : police, game.clock || 0);
  if (settings.fps && (game.fpsT = (game.fpsT || 0) + dt) > 0.5) { game.fpsT = 0; $('fps').textContent = `${Math.round(1000 / frameAvg)} FPS · ${renderer.domElement.width}×${renderer.domElement.height} · ${quality}${guard.level ? ' · eased ' + guard.gpu + '/' + guard.cpu : ''}\nJS ${prof.js.toFixed(1)} ms: ${prof.report()}\n${lastInfo.calls} draws · ${(lastInfo.tris / 1000).toFixed(0)}k tris · ${lastInfo.geo} geo · ${lastInfo.tex} tex\nray tracing ${Q.rtMode}${Q.gi ? '' : ', no bounce'}${Q.ssr ? '' : ', no reflections'}${SSR.enabled ? '' : ' (eased off)'} · ${Q.msaa}× MSAA`; }

  // Adapt resolution every couple of seconds. This is done before drawing: resizing clears the
  // canvas, so doing it after the draw would flash a black frame each time.
  adaptT += dt;
  if (adaptT > 2 && !(DEBUG && window.__fixedRes)) {
    adaptT = 0;
    if (frameAvg > 21 && resScale > 0.6) { resScale = Math.max(0.6, resScale * 0.9); resize(); }
    else if (frameAvg < 14.5 && resScale < 1) { resScale = Math.min(1, resScale * 1.08); resize(); }
  }

  prof.mark('hud');
  if (DEBUG && window.__noRender) return;                                  // (automated tests step the game without drawing)
  if (composer) {
    const blur = clamp((car.speed - 35) / 55, 0, 1) * 0.8 + (car.nitroOn ? 0.5 : 0);
    grade.uniforms.uBlur.value = game.camMode <= 1 && st !== 'menu' ? blur : 0;
    ssrBegin(camera);
    composer.render(dt);
    ssrEnd(camera);
  } else renderer.render(scene, camera);
  prof.mark('draw');
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
    if (new URLSearchParams(location.search).has('bench') && !DEBUG) setTimeout(() => startBench(), 600);      // (?bench: run the performance test as soon as the game is up)
    registerOffline();
  } catch (e) {
    console.error(e);
    loadMsg('Sorry, the game could not start: ' + e.message);
  }
})();
// Offline play: a service worker keeps every file once the game has loaded (needs https or localhost; ?nosw turns it off)
function registerOffline() {
  if (!('serviceWorker' in navigator) || DEBUG || /[?&]nosw\b/.test(location.search)) return;
  navigator.serviceWorker.register('sw.js').then(async () => {
    const reg = await navigator.serviceWorker.ready;
    setTimeout(() => reg.active && reg.active.postMessage({ type: 'precache' }), 4000);        // (after the menu is up, so it never competes with loading)
  }).catch(() => {});
}
// Hooks for automated testing: run the simulation without drawing.
function simulate(secs, inp, shaped = false) {
  for (let t = 0; t < secs; t += STEP) {
    const raw = { ...NO_INPUT, digital: { steer: true, gas: true, brake: true }, device: 'keyboard', ...inp };
    physics(STEP, shaped ? driver.shape(raw, STEP, car.speed) : raw);
    if (Math.round(t / STEP) % 4 === 0) traffic.update(STEP * 4, car, signalState(game.clock = (game.clock || 0) + STEP * 4));
    if (game.state === 'race') { game.t += STEP; const cp = game.route.cps[game.next]; if (cp && inCheckpoint(cp, car.x, car.z)) { game.next++; if (game.next >= game.route.cps.length) { finishRace(); break; } } }
  }
  car.px = car.x; car.pz = car.z; car.ph = car.h;
}
if (DEBUG) window.__game = { get heist() { return heist; }, hurtPlayer, bankCarried, venueNear, VENUE_TYPES, get interior() { return interior; }, enterVenue, leaveVenue, get melee() { return melee; }, assault, bench, startBench, get bigmap() { return bigmap; }, toggleMap, teleportTo, snapToRoad, spotClear, teleportWhy, get heli() { return heli; }, get seated() { return seated; }, prof, guard, applyGuard, GPU_LADDER, CPU_LADDER, get arsenal() { return arsenal; }, get officers() { return officers; }, simulate, driver, input, tick, game, get walker() { return walker; }, get footCam() { return footCam; }, enterCar, leaveCar, setState, toMenu, get hud() { return hud; }, crime, startWanted, resumeFreeRoam, get debris() { return debris; }, get peds() { return peds; }, get worldFx() { return worldFx; }, startChase, endChase, swapCar, get police() { return police; }, get carMesh() { return carMesh; }, get gtMesh() { return gtMesh; }, get heroMesh() { return heroMesh; }, car, Q, get grade() { return grade; }, get ao() { return aoPass; }, get gi() { return giPass; }, SSR, applyWeather, get grass() { return grass; }, get structures() { return structures; }, get towns() { return towns; }, get river() { return river; }, get landmarks() { return landmarks; }, get buskers() { return buskers; }, get city() { return city; }, get terrain() { return terrain; }, get traffic() { return traffic; }, camera, scene, renderer, startEvent, startFree, EVENTS, settings };
