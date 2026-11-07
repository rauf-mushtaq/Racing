// Menus: the main menu panels (events, police chase, garage, settings, controls) and the way back to the menu.
// main.js owns the game; it passes what these panels need in C (things that are created later are read through C when used).
import { $, fmtTime } from './util.js';
import { settings, save } from './store.js';
import { Q } from './quality.js';
import { EVENTS, buildRoute } from './events.js';
import { setPaint, PAINTS } from './carModel.js';
import { PEOPLE, personKey } from './people.js';
import { TOD_NAME } from './tod.js';
import { SPEC } from './vehicle.js';

export function initMenus(C) {
  const { game, chaseMusic, car, input, START, quality, startEvent, startChase, setState, resumeFreeRoam, togglePause, toggleFullscreen, startFree, respawnOnRoad, resetCar, medalFor, exitSpot, endChase, applyWeather, applyVolume, applyAids } = C;
  // ---------------------------------------------------------------------------
  // Menus
  // ---------------------------------------------------------------------------
  const panel = $('panel');
  function showPanel(html) { panel.innerHTML = html; panel.classList.remove('hidden'); }
  function hidePanel() { panel.classList.add('hidden'); }

  for (const b of document.querySelectorAll('[data-m]')) b.addEventListener('click', () => {
    document.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('sel', x === b));
    game.garage = false; if (game.state === 'menu' && C.walker) C.walker.show(false);
    const m = b.dataset.m;
    if (m === 'free') { hidePanel(); startFree(); }
    else if (m === 'events') eventsPanel();
    else if (m === 'chase') chasePanel();
    else if (m === 'garage') garagePanel();
    else if (m === 'settings') settingsPanel(panel);
    else if (m === 'controls') controlsPanel();
  });

  function eventsPanel() {
    let group = '';
    const html = EVENTS.map((ev, i) => {
      const r = buildRoute(ev), best = settings.bests[ev.id];
      const head = ev.group !== group ? `<h3 style="margin:16px 0 2px;font:800 15px 'Barlow Condensed',sans-serif;letter-spacing:3px;color:var(--accent)">${(group = ev.group).toUpperCase()}</h3>` : '';
      return `${head}<button class="card" data-ev="${i}"><div><div class="t">${ev.name}</div><div class="d">${ev.desc}</div></div>
        <div class="r">${(r.length / 1000).toFixed(1)} km<br>${best != null ? fmtTime(best) : '—'}<span class="medal m-${medalFor(ev.id, r)}"></span></div></button>`;
    }).join('');
    showPanel(`<h2>EVENTS</h2><p class="hint">Drive through every checkpoint gate. Follow the yellow arrow and the blue line on the map. Traffic is on the roads, so watch out.</p>${html}`);
    panel.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => { hidePanel(); startEvent(EVENTS[+b.dataset.ev]); }));
  }

  // The chase music row: the song's name, and buttons to pick a file from the device or forget it (shown in the chase panel and in the settings).
  function musicRowHtml() {
    return `<div class="row"><label>Your chase song<br><span class="hint" id="cm-state"></span></label><div class="seg"><button id="cm-pick">Choose a song</button><button id="cm-clear">Remove</button></div>
      <input type="file" id="cm-file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac" style="display:none"></div>`;
  }
  function musicRowInit() {
    const state = $('cm-state'); if (!state) return;
    const show = (msg) => {
      state.textContent = msg || (chaseMusic.failed ? 'This browser cannot play that file' : chaseMusic.has ? chaseMusic.name + (chaseMusic.kept ? '' : ' (this session only)') : 'None chosen: pick the song file you own (the James Bond theme, for example)');
      $('cm-clear').style.display = chaseMusic.has ? '' : 'none';
    };
    chaseMusic.onChange = () => show();
    show();
    $('cm-pick').addEventListener('click', () => $('cm-file').click());
    $('cm-file').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
      show('Loading…'); const err = await chaseMusic.choose(f); show(err || undefined);
      if (!err) C.hud.toast('Chase music set: ' + chaseMusic.name, 2.2);
    });
    $('cm-clear').addEventListener('click', async () => { await chaseMusic.remove(); show(); });
  }
  function chasePanel() {
    const best = settings.chaseBest != null ? `Your fastest escape: <b>${fmtTime(settings.chaseBest)}</b>` : 'You have not got away yet.';
    showPanel(`<h2>POLICE CHASE</h2>
      <p class="hint">The police want you, and there are a lot of them. You are driving a silver 1960s-style grand tourer with a few extras from the workshop. To get away you must stay out of sight for a whole minute: being seen starts the minute again. The longer they see you the hotter it gets: more cruisers, then heavy pursuit trucks. You can even jump out and hide on foot (F; crouch with Z). Get wrecked, or boxed in and stopped, and it is over. ${best}</p>
      <div class="keys">
        <kbd>J / 1</kbd><span>Machine guns (hold; they overheat)</span><kbd>K / 2</kbd><span>Homing missile (locks on ahead)</span>
        <kbd>L / 3</kbd><span>Drop a proximity bomb</span><kbd>O / 4</kbd><span>Oil slick</span>
        <kbd>I / 5</kbd><span>Smoke screen (cops can't see through it)</span><kbd>H / 6</kbd><span>Armour shield</span>
      </div>
      <p class="hint" style="margin-top:12px">On a tablet the gadget buttons appear on the right. Ammo slowly refills. Nitro (NOS) and the handbrake work as always.</p>
      ${musicRowHtml()}
      <p class="hint" style="margin:6px 0 12px">Your song plays during the chase. It stays on this device: the game does not include or upload it.</p>
      <button class="big" id="chase-go">START THE CHASE</button>`);
    musicRowInit();
    $('chase-go').addEventListener('click', () => { hidePanel(); startChase(); });
  }

  function garagePanel() {
    game.garage = true;
    const sw = Object.entries(PAINTS).map(([k, p]) => `<button class="sw ${settings.color === k ? 'on' : ''}" data-c="${k}"><i style="background:#${p.color.toString(16).padStart(6, '0')}"></i>${p.name}</button>`).join('');
    showPanel(`<h2>VENTO SV</h2><p class="hint">A mid-engined, all-wheel-drive supercar with a six-speed gearbox. Its body is a 3D model of a real V8 sports coupe (credited in the README); the engine, grip and handling are the game's own, so these numbers are the game's.</p>
      <div class="spec"><div><b>${SPEC.mass.toLocaleString('en')} kg</b>weight</div><div><b>${SPEC.Tmax} Nm</b>peak torque</div><div><b>AWD</b>drive</div><div><b>${(SPEC.redline / 1000).toFixed(0)},000 rpm</b>red line</div></div>
      <div class="swatches">${sw}</div>
      <h2 style="margin-top:20px">YOUR CHARACTER</h2><p class="hint">Who you play when you are on foot. Press F beside the car to get in or out.</p>
      <div class="swatches">${Object.entries(PEOPLE).map(([k, o]) => `<button class="sw ${personKey(settings.outfit) === k ? 'on' : ''}" data-o="${k}"><i style="background:linear-gradient(180deg,#${o.sw[0].toString(16).padStart(6, '0')} 0 55%,#${o.sw[1].toString(16).padStart(6, '0')} 55% 100%)"></i>${o.name}</button>`).join('')}</div>`);
    panel.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
      settings.color = b.dataset.c; save(); setPaint(C.heroMesh, settings.color);
      panel.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b));
    }));
    panel.querySelectorAll('[data-o]').forEach(b => b.addEventListener('click', () => {
      settings.outfit = b.dataset.o; save(); C.setOutfitAll(settings.outfit);
      panel.querySelectorAll('[data-o]').forEach(x => x.classList.toggle('on', x === b));
    }));
    // The character stands beside the car while you choose.
    const hx = Math.cos(car.h), hz = -Math.sin(car.h);
    C.walker.place(car.x + 1.45, car.z + 3.1, 1.15);             // (in front of the car as the Garage camera sees it, a little to the left, looking at the camera)
  }

  const SETTINGS = [
    { key: 'tod', label: 'Time of day', opts: [['golden', 'Golden hour'], ['day', 'Midday'], ['sunset', 'Sunset'], ['night', 'Night']], reload: true },
    { key: 'quality', label: 'Graphics', opts: [['ultra', 'Ultra'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], reload: true },
    { key: 'renderScale', label: 'Render scale', opts: [[0.75, '75%'], [1, '100%'], [1.25, '125%'], [1.5, '150%']], reload: true },
    { key: 'rt', label: 'Ray tracing (reflections, bounced light)', opts: [[true, 'On'], [false, 'Off']], reload: true },
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
    { key: 'rain', label: 'Rain', opts: [[false, 'Off'], [true, 'On']] },
    { key: 'crowd', label: 'People on the streets', opts: [[0, 'None'], [0.5, 'Few'], [1, 'Normal']] },
    { key: 'sound', label: 'Sound', opts: [[true, 'On'], [false, 'Off']] },
    { key: 'music', label: 'Chase music', opts: [[true, 'On'], [false, 'Off']] },
    { key: 'volume', label: 'Volume', opts: [[0.3, '30%'], [0.55, '55%'], [0.8, '80%'], [1, '100%']] },
  ];
  function settingsPanel(el) {
    const cur = k => (k === 'quality' ? quality : k === 'tod' ? TOD_NAME : k === 'renderScale' ? Q.renderScale : settings[k]);
    const rows = SETTINGS.map(s => `<div class="row"><label>${s.label}</label><div class="seg">${s.opts.map(([v, t]) =>
      `<button data-s="${s.key}" data-v='${JSON.stringify(v)}' class="${cur(s.key) === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>`).join('');
    const w = settings.wheel || {};
    el.innerHTML = `<h2>SETTINGS</h2>${rows}
      <div class="row"><label>Steering wheel & pedals<br><span class="hint" id="wheel-state">${w.gas ? 'Set up' : 'Not set up'}</span></label><div class="seg"><button id="wheel-setup">Set up</button><button id="wheel-clear">Clear</button></div></div>
      ${musicRowHtml()}
      <div class="row"><label>Fullscreen <span class="hint">(Shift+F)</span></label><div class="seg"><button id="fs-toggle">Toggle</button></div></div>`;
    el.classList.remove('hidden');
    musicRowInit();
    el.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', async () => {
      const key = b.dataset.s, v = JSON.parse(b.dataset.v), spec = SETTINGS.find(s => s.key === key);
      if (key === 'touchSteer' && v === 'tilt') { const ok = await input.enableTilt(); if (!ok) { C.hud.toast('Tilt is not available', 2); return; } }
      settings[key] = v; save();
      el.querySelectorAll(`[data-s="${key}"]`).forEach(x => x.classList.toggle('on', x === b));
      if (spec.reload) { location.reload(); return; }
      applyAids(); applyVolume(); applyWeather(); if (key === 'crowd') C.peds.setCount(C.crowdCount()); $('fps').classList.toggle('hidden', !settings.fps);
      if (key === 'traffic') C.traffic.setDensity(settings.traffic, car);
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
      if (i >= steps.length) { label.textContent = 'Set up'; C.hud.toast('Wheel set up', 1.5); return; }
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
      <kbd>F</kbd><span>Get in or out of the car (beside it, or when stopped)</span>
      <kbd>W A S D</kbd><span>On foot: walk. <kbd>Shift</kbd> sprint, <kbd>Space</kbd> jump, <kbd>Z</kbd> or <kbd>Ctrl</kbd> crouch (harder to spot)</span>
      <kbd>Mouse</kbd><span>On foot: click the game to capture the mouse and look around with it (Esc lets go), or <kbd>J</kbd> <kbd>L</kbd> <kbd>I</kbd> <kbd>K</kbd> turn the camera</span>
      <kbd>Cursor</kbd><span>Where the mouse cannot be captured (an iPad with a trackpad or mouse): with a gun out, the cursor is the crosshair; moving it to the edge of the screen turns the camera, and so does a two-finger swipe</span>
      <kbd>1 2 3 4</kbd><span>On foot: pistol, submachine gun, shotgun, rocket launcher (again, or <kbd>0</kbd>, puts it away; <kbd>Q</kbd> goes back one)</span>
      <kbd>Click / X</kbd><span>On foot: fire (on a PC the first click captures the mouse). <kbd>Right click / V</kbd> aim, <kbd>R</kbd> reload, <kbd>G</kbd> grenade</span>
      <kbd>J K L O I H</kbd><span>In the car while the police are after you: guns, missile, bomb, oil, smoke, armour (<kbd>1</kbd> to <kbd>6</kbd> too)</span>
      <kbd>W / ↑</kbd><span>Throttle</span><kbd>S / ↓</kbd><span>Brake, and reverse when stopped</span>
      <kbd>A D / ← →</kbd><span>Steer</span><kbd>Space</kbd><span>Handbrake (drift)</span>
      <kbd>Shift / N</kbd><span>Nitro (refills as you drive)</span><kbd>Q / E</kbd><span>Shift down / up (manual gearbox)</span>
      <kbd>C</kbd><span>Change camera</span><kbd>R</kbd><span>Back on the road</span><kbd>Esc / P</kbd><span>Pause</span><kbd>U</kbd><span>Sound on/off</span>
      <kbd>Tab / M</kbd><span>City map (click it to set a waypoint)</span><kbd>Shift+F</kbd><span>Fullscreen</span>
      <kbd>Mouse drag</kbd><span>Look around the car (right or left button)</span><kbd>Mouse wheel</kbd><span>Zoom the chase camera</span><kbd>B</kbd><span>Look behind</span>
    </div>
    <p class="hint" style="margin-top:14px"><b>Gamepad:</b> left stick steers, RT throttle, LT brake, A handbrake, X nitro, LB/RB shift, Y camera, Start pause. On foot: RT fires, LB aims, X reloads, Y changes gun, R3 throws a grenade.</p>
    <p class="hint"><b>Steering wheel:</b> plug it in, press a pedal, then go to Settings → Set up, and follow the prompts (turn right, throttle, brake, paddles). Turn the steering assist off for the purest feel.</p>
    <p class="hint"><b>Touch:</b> ◀ ▶ steer (or tilt, in Settings), GAS and BRAKE on the right, DRIFT and NOS above them. On foot: drag on the left half of the screen to walk, drag on the right half to look, and use JUMP, RUN, CROUCH and GET IN / GET OUT. FIRE (it draws a gun if you have none out), AIM, GUN (next gun), RELOAD and NADE are beside them.</p>`);
  }

  document.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.p;
    if (p === 'resume') togglePause();
    else if (p === 'restart') { $('pause-panel').classList.add('hidden'); if (game.route) startEvent(game.route.ev); else if (game.wanted) resumeFreeRoam(); else if (game.chaseOn) startChase(); else if (game.onFoot) { const sp = exitSpot(); C.walker.place(sp.x, sp.z, car.h); C.footCam.reset(car.h); setState('free'); } else { respawnOnRoad(); setState('free'); } }
    else if (p === 'settings') settingsPanel($('pause-panel'));
    else if (p === 'quit') { $('pause-panel').classList.add('hidden'); toMenu(); }
  }));
  document.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
    const f = b.dataset.f, i = EVENTS.indexOf(game.route.ev);
    if (f === 'retry') startEvent(game.route.ev);
    else if (f === 'next') startEvent(EVENTS[(i + 1) % EVENTS.length]);
    else toMenu();
  }));
  document.querySelectorAll('[data-ce]').forEach(b => b.addEventListener('click', () => { if (b.dataset.ce === 'retry') { if (game.wanted) resumeFreeRoam(); else startChase(); } else toMenu(); }));
  function toMenu() {
    endChase(); game.route = null; C.gates.clear(); game.onFoot = false; if (C.walker) C.walker.show(false); if (C.arsenal) C.arsenal.clear();
    resetCar(START.x, START.z, START.h);
    setState('menu'); hidePanel();
    document.querySelectorAll('[data-m]').forEach(x => x.classList.remove('sel'));
  }

  return { toMenu, showPanel, hidePanel };
}
