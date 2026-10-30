// Time of day. Day is a bright, hazy California afternoon; Sunset is golden
// hour with the pink plume. Chosen in Settings (the page reloads to apply).
import { settings } from './store.js';

const PRESETS = {
  day: {
    sun: [0.42, 0.62, 0.66], light: [0.42, 0.62, 0.66],
    sky: { turbidity: 2.4, rayleigh: 0.9, mie: 0.004, mieG: 0.82 },
    exposure: 0.6,
    fog: 0xbfcfdf, fogDensity: 0.00055,
    hemiSky: 0xcfe2ff, hemiGround: 0x8a7a62, hemiI: 1.35,
    sunColor: 0xfff1de, sunI: 5.6,
    windows: 0.12, signs: 0.7, lampsOn: false,
    ridges: [['#a9b9c8', '#cbd8e4'], ['#8e9ea6', '#c4d1dc'], ['#6f7f6a', '#b4c3cf']], ridgeScale: 0.45,
    plume: false, envGround: 0x6a6660,
    grade: { sat: 1.12, contrast: 1.06, warm: 0.02 }, road: 0xf2eee8,
  },
  sunset: {
    sun: [-0.30, 0.035, -0.95], light: [-0.42, 0.42, -0.80],
    sky: { turbidity: 9, rayleigh: 3.4, mie: 0.008, mieG: 0.86 },
    exposure: 0.6,
    fog: 0xc4919a, fogDensity: 0.0011,
    hemiSky: 0xa597dc, hemiGround: 0x4a3838, hemiI: 1.7,
    sunColor: 0xffcfb4, sunI: 3.8,
    windows: 1.15, signs: 2.4, lampsOn: true,
    ridges: [['#6f5d82', '#c9939a'], ['#4d3f60', '#b58894'], ['#3d3248', '#a77f8a']], ridgeScale: 1,
    plume: true, envGround: 0x1d1a1e,
    grade: { sat: 1.0, contrast: 1.0, warm: 0.0 }, road: 0xb8b4c6,
  },
};

export const TOD_NAME = PRESETS[settings.tod] ? settings.tod : 'day';
export const TOD = PRESETS[TOD_NAME];
