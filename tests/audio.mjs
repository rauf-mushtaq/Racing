// The street musicians, rendered offline (no speakers needed) with the game's own AudioEngine and Buskers.music scheduler, then measured:
// level, clipping, silence, pitch, how much is in the top octaves, how many notes. Nothing here can say whether it SOUNDS good, only that it is
// not broken (silent, clipped, NaN, one long note). Give a folder to also get one WAV per performer to listen to on any device.
//   node tests/audio.mjs [folder] [seconds]
import fs from 'node:fs';
import path from 'node:path';
import { open, finish, check } from './lib.mjs';

const outDir = process.argv[2] ? path.resolve(process.argv[2]) : null, SECONDS = +process.argv[3] || 16;
if (outDir) fs.mkdirSync(outDir, { recursive: true });
const { page } = await open({ debug: true });

const res = await page.evaluate(async ({ SECONDS }) => {
  const { AudioEngine } = await import('./src/audio.js');
  const { Buskers } = await import('./src/buskers.js');
  const SR = 44100, out = {};
  for (const style of ['guitar', 'sax', 'drums', 'juggler', 'statue', 'crowd']) {
    // A real engine whose context is an offline one whose clock we move ourselves.
    const off = new OfflineAudioContext(2, SR * SECONDS, SR), clock = { now: 0 };
    const proxy = new Proxy(off, { get: (t, k) => k === 'currentTime' ? clock.now : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
    const realAC = window.AudioContext, realST = window.setTimeout, timers = [];
    window.AudioContext = function () { return proxy; };
    window.setTimeout = (fn, ms) => { timers.push({ at: clock.now + ms / 1000, fn }); return 0; };
    const a = new AudioEngine(); a.init(); a.lx = 0; a.ly = 1.6; a.lz = 12;                    // the listener stands 12 m from the performer
    window.AudioContext = realAC;
    a.master.gain.value = a.vol * 0.6;
    const fake = { audio: a, t: 0 }, spot = { x: 0, z: 0, style, next: 0, bar: 0 };
    for (let t = 0; t < SECONDS - 1.5; t += 1 / 60) {
      clock.now = t; fake.t = t;
      if (style === 'crowd') { if (!spot.n || t > spot.n) { a.applause([0, 1.5, 0], 0.35); spot.n = t + 5; } }
      else Buskers.prototype.music.call(fake, null, spot, 1);
      for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= t) { const f = timers.splice(i, 1)[0].fn; f(); }
    }
    window.setTimeout = realST;
    const buf = await off.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0, sum2 = 0, nan = 0, clip = 0, dc = 0, silent = 0; const win = SR / 10, wins = [];
    for (let i = 0; i < L.length; i++) { const v = (L[i] + R[i]) / 2; if (!Number.isFinite(v)) { nan++; continue; } peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); sum2 += v * v; dc += v; if (Math.abs(L[i]) >= 0.999) clip++; }
    for (let w = 0; w + win <= L.length; w += win) { let s = 0; for (let i = w; i < w + win; i++) s += L[i] * L[i]; wins.push(Math.sqrt(s / win)); }
    for (const r of wins) if (r < 0.0005) silent++;
    // A rough spectrum (a DFT of a 4096-sample frame at the loudest 100 ms, so pitch and brightness can be read).
    let at = 0; wins.forEach((r, i) => { if (r > wins[at]) at = i; });
    const N = 4096, st = Math.min(L.length - N, at * win), mags = new Float32Array(N / 2);
    for (let k = 1; k < N / 2; k++) { let re = 0, im = 0; for (let n = 0; n < N; n++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / N), v = L[st + n] * w; re += v * Math.cos(2 * Math.PI * k * n / N); im -= v * Math.sin(2 * Math.PI * k * n / N); } mags[k] = Math.hypot(re, im); }
    let pk = 1, tot = 0, hi = 0, cen = 0; for (let k = 1; k < N / 2; k++) { if (mags[k] > mags[pk]) pk = k; tot += mags[k] * mags[k]; cen += mags[k] * k * SR / N; if (k * SR / N > 4000) hi += mags[k] * mags[k]; }
    // Note onsets: the places where the 100 ms level jumps by 6 dB or more.
    let onsets = 0; for (let i = 1; i < wins.length; i++) if (wins[i] > 0.004 && wins[i] > wins[i - 1] * 2) onsets++;
    const pcm = new Int16Array(L.length * 2); for (let i = 0; i < L.length; i++) { pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
    let bin = ''; const u8 = new Uint8Array(pcm.buffer); for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
    out[style] = { peak, rms: Math.sqrt(sum2 / L.length), nan, clip, dc: dc / L.length, silentFrac: silent / wins.length, loudestMs: at * 100, peakHz: pk * SR / N,  hiFrac: hi / (tot || 1), onsets, b64: btoa(bin) };
  }
  return out;
}, { SECONDS });

const wav = (b64, sr = 44100) => { const pcm = Buffer.from(b64, 'base64'), h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]); };
const report = {};
for (const [style, r] of Object.entries(res)) {
  if (outDir) fs.writeFileSync(path.join(outDir, `busker-${style}.wav`), wav(r.b64)); delete r.b64; report[style] = r;
  const db = x => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
  console.log(`${style.padEnd(8)} peak ${db(r.peak)} dBFS  rms ${db(r.rms)} dBFS  clipped ${r.clip}  NaN ${r.nan}  silent ${(r.silentFrac * 100).toFixed(0)}%  loudest-frame pitch ${r.peakHz.toFixed(0)} Hz  above 4 kHz ${(r.hiFrac * 100).toFixed(1)}%  onsets ${r.onsets}`);
}
if (outDir) fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
for (const s of ['guitar', 'sax', 'drums', 'juggler']) {
  const r = report[s];
  check(`${s}: renders sound, no NaN, never clips`, r.nan === 0 && r.clip === 0 && r.peak > 0.01 && r.peak < 0.99, JSON.stringify(r));
  check(`${s}: loud enough to hear from 12 m but well below the engine (peak between -40 and -6 dBFS)`, r.peak > 0.01 && r.peak < 0.5, 'peak ' + r.peak);
  check(`${s}: not silent most of the time`, r.silentFrac < 0.6, 'silent ' + r.silentFrac);
  check(`${s}: no DC offset`, Math.abs(r.dc) < 0.002, 'dc ' + r.dc);
}
check('guitar plays a steady picked pattern (many note onsets)', report.guitar.onsets >= 12, 'onsets ' + report.guitar.onsets);
check('drums keep time (many strokes)', report.drums.onsets >= 12, 'onsets ' + report.drums.onsets);
check('the sax plays a tune of its own (more than a dozen notes, in the sax range)', report.sax.onsets >= 8 && report.sax.peakHz > 150 && report.sax.peakHz < 1800, JSON.stringify(report.sax));
check('the guitar is low and warm, not shrill (little energy above 4 kHz)', report.guitar.hiFrac < 0.05, 'hi ' + report.guitar.hiFrac);
check('the crowd clapping makes sound too', report.crowd.peak > 0.005 && report.crowd.nan === 0, JSON.stringify(report.crowd));
await finish();
