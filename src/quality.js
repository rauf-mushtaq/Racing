// Graphics tiers. The default is picked from the device: tablets and phones get
// Medium, a PC with a decent graphics card gets Ultra. Settings can override
// it, and the render scale (75% to 150%) multiplies the pixel density.
import { settings } from './store.js';
import { LOW_POWER } from './util.js';

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
  ultra: { dpr: 2, msaa: 8, shadow: 4096, cascades: 4, csmFar: 650, probe: 256, probeEvery: 2, aniso: 16, tex: 1, loadR: 4, detailR: 700, treeR: 1100, treeDetail: 2, sharpen: 0.45, bloom: 1, tCell: 8, tR: 3, scat: 1, scatR: 1400 },
  high: { dpr: 1.5, msaa: 4, shadow: 2048, cascades: 3, csmFar: 450, probe: 256, probeEvery: 2, aniso: 8, tex: 1, loadR: 3, detailR: 550, treeR: 850, treeDetail: 1, sharpen: 0.35, bloom: 1, tCell: 10, tR: 3, scat: 0.75, scatR: 1100 },
  medium: { dpr: 1.25, msaa: 2, shadow: 2048, cascades: 0, csmFar: 0, probe: 128, probeEvery: 3, aniso: 4, tex: 0.5, loadR: 2, detailR: 380, treeR: 600, treeDetail: 0, sharpen: 0.3, bloom: 0.8, tCell: 14, tR: 2, scat: 0.45, scatR: 800 },
  low: { dpr: 1, msaa: 0, shadow: 0, cascades: 0, csmFar: 0, probe: 0, probeEvery: 0, aniso: 2, tex: 0.5, loadR: 2, detailR: 280, treeR: 420, treeDetail: 0, sharpen: 0, bloom: 0, tCell: 25, tR: 1, scat: 0.2, scatR: 500 },
};

function autoTier() {
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
