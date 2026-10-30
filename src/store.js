// Settings, paint choice and best times, kept in this browser's local storage.

const KEY = 'sunsetcity.v1';
const defaults = {
  tod: 'day',           // 'day' | 'sunset'
  quality: null,        // 'ultra' | 'high' | 'medium' | 'low'; null picks one for the device
  renderScale: 1,       // 0.75 | 1 | 1.25 | 1.5 times the screen's pixel density
  fps: false,
  units: 'kmh',
  abs: true, tcs: true, esp: true,
  auto: true,           // automatic gearbox
  steerAssist: true,
  sens: 1,
  sound: true, volume: 0.8,
  traffic: 'normal',    // off | light | normal | heavy
  camera: 0,
  touchSteer: 'buttons', // buttons | tilt
  color: 'pearl',
  bests: {},
  wheel: null,          // learned steering wheel / pedal mapping
};

let data;
try { data = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
catch (e) { data = { ...defaults }; }

export const settings = data;
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* storage blocked */ }
}
