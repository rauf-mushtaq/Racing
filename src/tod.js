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
    grade: { sat: 1.07, contrast: 1.17, warm: 0.035, tone: 0.8, vib: 0.35, streak: 0.0 }, road: 0xe8e0dc,
    split: 0.55, rays: 0.22, grain: 0.02, flare: [2.6, 2.0, 1.4], cloudTint: [3.2, 2.35, 1.6],
    haze: { height: 0.0026, k2: 0.00028, forward: 1.8, focus: 5, glow: 0.85, sunFog: [2.6, 1.55, 0.78], cool: [0.8, 0.9, 1.08] },
    clouds: { cover: 0.55, sunCol: [3.6, 2.0, 0.95], amb: [0.5, 0.52, 0.78], haze: [1.1, 0.78, 0.52] },
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
    grade: { sat: 1.08, contrast: 1.12, warm: 0.015, tone: 0.45, vib: 0.3, streak: 0.0 }, road: 0xf2eee8,
    split: 0, rays: 0.12, grain: 0.012, flare: [2.2, 2.0, 1.7], cloudTint: [2.4, 2.4, 2.5],
    haze: { height: 0.0026, k2: 0.0002, forward: 0.8, focus: 6, glow: 0.4, sunFog: [1.6, 1.4, 1.1], cool: [0.9, 0.96, 1.04] },
    clouds: { cover: 0.45, sunCol: [3.2, 2.9, 2.5], amb: [0.62, 0.74, 1.0], haze: [0.72, 0.82, 0.95] },
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
    grade: { sat: 1.05, contrast: 1.08, warm: 0.0, tone: 1.0, vib: 0.3, streak: 0.35 }, road: 0xb8b4c6,
    split: 1, rays: 0.4, grain: 0.02, flare: [2.2, 1.6, 1.2], cloudTint: [2.4, 2.4, 2.5],
    haze: { height: 0.0026, k2: 0.00024, forward: 1.4, focus: 4, glow: 0.7, sunFog: [2.2, 1.0, 0.7], cool: [0.85, 0.85, 1.1] },
    clouds: { cover: 0.6, sunCol: [3.6, 1.35, 0.65], amb: [0.5, 0.36, 0.6], haze: [0.95, 0.5, 0.5] },
  },
  // Night: a moon and stars, lit windows, neon signs, street lamps pooling light on wet roads, headlights.
  night: {
    night: true, wet: true,
    sun: [0.3, -0.16, -0.94], light: [-0.45, 0.62, -0.64],
    sky: { turbidity: 8, rayleigh: 0.6, mie: 0.002, mieG: 0.8 },
    exposure: 0.66,
    fog: 0x0c1428, fogDensity: 0.0011,
    hemiSky: 0x2f4580, hemiGround: 0x1c1822, hemiI: 0.7,
    sunColor: 0x9db6ff, sunI: 1.3,
    windows: 2.0, signs: 3.0, lampsOn: true,
    ridges: [['#1b2540', '#0c1122'], ['#141c30', '#090d1a'], ['#10141f', '#080b13']], ridgeScale: 0.6,
    plume: false, envGround: 0x16151c,
    grade: { sat: 1.08, contrast: 1.16, warm: -0.01, tone: 1.0, vib: 0.25, streak: 0.6 }, road: 0xcfcfe0,
    split: 0.85, rays: 0, grain: 0.035, flare: [0, 0, 0], cloudTint: [0.2, 0.26, 0.44],
    haze: { height: 0.0026, k2: 0.0003, forward: 0, focus: 5, glow: 0.35, sunFog: [0.5, 0.3, 0.55], cool: [0.7, 0.85, 1.25] },
    clouds: { cover: 0.45, sunCol: [0.22, 0.28, 0.5], amb: [0.03, 0.045, 0.1], haze: [0.05, 0.05, 0.1] },
  },
};

export const TOD_NAME = PRESETS[settings.tod] ? settings.tod : 'golden';
export const TOD = PRESETS[TOD_NAME];
