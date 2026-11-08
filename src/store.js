// Settings, paint choice and best times, kept in this browser's local storage.

const KEY = 'sunsetcity.v1';
const defaults = {
  tod: 'golden',        // 'golden' | 'day' | 'sunset'
  quality: null,        // 'ultra' | 'high' | 'medium' | 'low'; null picks one for the device
  renderScale: 1,       // 0.75 | 1 | 1.25 | 1.5 times the screen's pixel density
  fps: false,
  rt: true,             // (old on/off setting, used only if rt2 was never chosen)
  rt2: 'auto',          // ray tracing: 'auto' (off on an iPad or iPhone, where it showed coloured speckle) | 'full' | 'refl' (reflections only) | 'off'
  units: 'kmh',
  abs: true, tcs: true, esp: true,
  auto: true,           // automatic gearbox
  steerAssist: true,
  sens: 1,
  sound: true, volume: 0.8,
  music: true,          // the player's own song during the police chase (see chasemusic.js)
  crowd: 1,             // how many pedestrians (0 none, 0.5 few, 1 normal)
  rain: false,          // rain and wet roads (live; works at any time of day)
  traffic: 'normal',    // off | light | normal | heavy
  camera: 0,
  touchSteer: 'buttons', // buttons | tilt
  color: 'pearl',
  outfit: 'agent',       // which person you play (see people.js)
  bests: {},
  found: [],            // secret places you've discovered (shown on the map)
  wheel: null,          // learned steering wheel / pedal mapping
  chaseBest: null,      // fastest escape from the police, in seconds
  benchLast: null,      // the last performance test (see bench.js): { when, fps, low, quality, text }
};

let data;
try { data = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
catch (e) { data = { ...defaults }; }

// The Golden Hour look is new: everyone starts there once, then their choice sticks.
if (data.todV !== 2) { data.tod = 'golden'; data.todV = 2; }
export const settings = data;
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage blocked */ }
}
