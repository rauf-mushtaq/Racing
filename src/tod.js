// Time of day. Golden Hour (the default) is a low sun behind the palms with long
// shadows and warm haze; Midday is a bright, hazy afternoon; Sunset has the pink
// plume and lit windows. Chosen in Settings (the page reloads to apply).
import { settings } from './store.js';

const PRESETS = {
  golden: {
    sun: [-0.26, 0.3, -0.92], light: [-0.26, 0.33, -0.91],
    sky: { turbidity: 4, rayleigh: 1.7, mie: 0.0035, mieG: 0.88 },
    exposure: 0.5,
    fog: 0xe3bb92, fogDensity: 0.0010,
    hemiSky: 0xaec4ea, hemiGround: 0x80603e, hemiI: 0.95,
    sunColor: 0xffc48c, sunI: 4.8,
    windows: 0.35, signs: 1.1, lampsOn: false,
    ridges: [['#9a9fb2', '#e8bc9c'], ['#7f8a96', '#dca98a'], ['#6f7f6a', '#d09a7a']], ridgeScale: 0.5,
    plume: false, envGround: 0x5a4a3a,
    grade: { sat: 1.08, contrast: 1.12, warm: 0.04 }, road: 0xe8e0dc,
    split: 0.55, rays: 0.22, grain: 0.02, flare: [2.6, 2.0, 1.4], cloudTint: [3.2, 2.35, 1.6],
  },
  day: {
    sun: [0.42, 0.62, 0.66], light: [0.42, 0.62, 0.66],
    sky: { turbidity: 2.4, rayleigh: 0.9, mie: 0.004, mieG: 0.82 },
    exposure: 0.6,
    fog: 0xbfcfdf, fogDensity: 0.00085,
    hemiSky: 0xcfe2ff, hemiGround: 0x8a7a62, hemiI: 1.35,
    sunColor: 0xfff1de, sunI: 5.6,
    windows: 0.12, signs: 0.7, lampsOn: false,
    ridges: [['#a9b9c8', '#cbd8e4'], ['#8e9ea6', '#c4d1dc'], ['#6f7f6a', '#b4c3cf']], ridgeScale: 0.45,
    plume: false, envGround: 0x6a6660,
    grade: { sat: 1.12, contrast: 1.06, warm: 0.02 }, road: 0xf2eee8,
    split: 0, rays: 0.12, grain: 0.012, flare: [2.2, 2.0, 1.7], cloudTint: [2.4, 2.4, 2.5],
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
    split: 1, rays: 0.4, grain: 0.02, flare: [2.2, 1.6, 1.2], cloudTint: [2.4, 2.4, 2.5],
  },
};

export const TOD_NAME = PRESETS[settings.tod] ? settings.tod : 'golden';
export const TOD = PRESETS[TOD_NAME];
