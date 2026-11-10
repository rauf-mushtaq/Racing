// Graphics tiers. The default is picked from the device: tablets and phones get
// Medium, a PC with a decent graphics card gets Ultra. Settings can override
// it, and the render scale (75% to 150%) multiplies the pixel density.
import { settings } from './store.js';
import { LOW_POWER, IOS } from './util.js';

function probeGPU() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return { renderer: '', maxSamples: 4 };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const out = { renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '', maxSamples: gl.getParameter(gl.MAX_SAMPLES) || 4 };
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return out;
  } catch (e) { return { renderer: '', maxSamples: 4 }; }
}
export const GPU = probeGPU();

const TIERS = {
  ultra: { dof: { far: 0.85, near: 0.6 }, cloudTaps: 4, dpr: 2, msaa: 8, shadow: 4096, cascades: 4, csmFar: 650, probe: 256, probeEvery: 2, aniso: 16, tex: 1, loadR: 4, detailR: 700, treeR: 1100, treeDetail: 2, sharpen: 0.22, clarity: 0.2, ao: 1, bloom: 1, tCell: 8, tR: 3, scat: 1, scatR: 1400, grass: { r: 75, cell: 1.2 }, peds: 90, ssr: { steps: 28, scale: 1 }, gi: { rays: 6, steps: 10 } },
  high: { dof: { far: 0.7, near: 0.5 }, cloudTaps: 3, dpr: 1.5, msaa: 4, shadow: 2048, cascades: 3, csmFar: 450, probe: 256, probeEvery: 2, aniso: 8, tex: 1, loadR: 3, detailR: 550, treeR: 850, treeDetail: 1, sharpen: 0.2, clarity: 0.16, ao: 1, bloom: 1, tCell: 10, tR: 3, scat: 0.75, scatR: 1100, grass: { r: 62, cell: 1.45 }, peds: 70, ssr: { steps: 20, scale: 1 }, gi: { rays: 4, steps: 8 } },
  medium: { cloudTaps: 2, dpr: 1.5, msaa: 2, shadow: 2048, cascades: 0, csmFar: 0, probe: 128, probeEvery: 3, aniso: 8, tex: 0.75, loadR: 2, detailR: 380, treeR: 600, treeDetail: 0, sharpen: 0.18, clarity: 0.12, ao: 0, bloom: 0.8, tCell: 14, tR: 2, scat: 0.45, scatR: 800, grass: { r: 46, cell: 2.1 }, peds: 44, ssr: { steps: 12, scale: 0.5 }, gi: null },
  low: { cloudTaps: 0, dpr: 1, msaa: 0, shadow: 0, cascades: 0, csmFar: 0, probe: 0, probeEvery: 0, aniso: 2, tex: 0.5, loadR: 2, detailR: 280, treeR: 420, treeDetail: 0, sharpen: 0, clarity: 0, ao: 0, bloom: 0, tCell: 25, tR: 1, scat: 0.2, scatR: 500, grass: null, peds: 24, ssr: null, gi: null },
};

function autoTier() {
  if (TIERS[settings.qualityAuto]) return settings.qualityAuto;            // a lighter default the performance guard saved (see main.js)
  if (LOW_POWER) return 'medium';
  const r = GPU.renderer;
  if (/swiftshader|llvmpipe|software|basic render/i.test(r)) return 'low';
  if (/intel/i.test(r) && !/arc/i.test(r)) return 'high';
  return 'ultra';
}

export const QNAME = TIERS[settings.quality] ? settings.quality : autoTier();
export const Q = { name: QNAME, ...TIERS[QNAME] };
Q.msaa = Math.min(Q.msaa, GPU.maxSamples);
Q.renderScale = [0.75, 1, 1.25, 1.5].includes(settings.renderScale) ? settings.renderScale : 1;
Q.shadows = Q.shadow > 0;
Q.csm = Q.cascades > 0;
// Ray-traced reflections and global illumination (Settings > Ray tracing). 'auto' means on, except on an iPad or iPhone, where the screen-space
// effects showed coloured speckle on the road (not seen in the desktop browser used for testing), so they have to be turned on there on purpose.
const P = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const RT = P.get('rt') || (settings.rt2 && settings.rt2 !== 'auto' ? settings.rt2 : settings.rt === false ? 'off' : 'auto');          // (settings.rt false: someone who turned it off before there were four choices)
Q.rtMode = RT === 'auto' ? (IOS ? 'off' : 'full') : RT;
if (Q.rtMode === 'off') { Q.ssr = null; Q.gi = null; } else if (Q.rtMode === 'refl') Q.gi = null;
// Address flags for finding which effect is at fault on a device: ?gi=0 ?ssr=0 ?ao=0 ?msaa=0 ?rt=off|refl|full
if (P.get('gi') === '0') Q.gi = null; if (P.get('ssr') === '0') Q.ssr = null; if (P.get('ao') === '0') Q.ao = 0;
if (P.get('msaa') !== null) Q.msaa = Math.min(Math.max(0, +P.get('msaa') || 0), GPU.maxSamples);
