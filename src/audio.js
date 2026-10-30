// Synthesised sound: a V12 engine (harmonics of the firing rate through a
// filter and a little distortion), tyre squeal, wind, impacts and the nitro.
// Starts on the first key press or tap, as browsers require.
export class AudioEngine {
  constructor() { this.ctx = null; this.vol = 0.8; this.enabled = true; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain(); master.gain.value = this.enabled ? this.vol * 0.6 : 0; master.connect(ctx.destination);
      const comp = ctx.createDynamicsCompressor(); comp.connect(master);
      // Engine.
      const eFilt = ctx.createBiquadFilter(); eFilt.type = 'lowpass'; eFilt.frequency.value = 1200; eFilt.Q.value = 2.5;
      const shaper = ctx.createWaveShaper(); const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.2); }
      shaper.curve = curve;
      const eGain = ctx.createGain(); eGain.gain.value = 0;
      eFilt.connect(shaper); shaper.connect(eGain); eGain.connect(comp);
      const oscs = [];
      for (const [type, mult, g] of [['sawtooth', 1, 0.5], ['square', 0.5, 0.35], ['sawtooth', 2, 0.18], ['triangle', 3, 0.12], ['sine', 0.25, 0.4]]) {
        const o = ctx.createOscillator(); o.type = type; const og = ctx.createGain(); og.gain.value = g;
        o.connect(og); og.connect(eFilt); o.start(); oscs.push({ o, mult });
      }
      // Noise source shared by tyres, wind and intake.
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const noise = (type, f, q) => {
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0; src.connect(flt); flt.connect(g); g.connect(comp); src.start();
        return { flt, g };
      };
      const tyre = noise('bandpass', 1100, 6), wind = noise('lowpass', 500, 0.7), intake = noise('bandpass', 400, 1.2), nitro = noise('highpass', 2500, 0.7);
      Object.assign(this, { ctx, master, eGain, eFilt, oscs, tyre, wind, intake, nitro, buf, comp });
    } catch (e) { this.ctx = null; }
  }
  setVolume(v, enabled) {
    this.vol = v; this.enabled = enabled;
    if (this.ctx) this.master.gain.setTargetAtTime(enabled ? v * 0.6 : 0, this.ctx.currentTime, 0.05);
  }
  update(car, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, on = active ? 1 : 0;
    const rpm = car.rpm, thr = car.throttle, spd = car.speed;
    const f = rpm / 60 * 6 / 4; // V12 firing rate, an octave down to sit nicely
    for (const { o, mult } of this.oscs) o.frequency.setTargetAtTime(f * mult, t, 0.03);
    this.eFilt.frequency.setTargetAtTime(400 + thr * 1800 + rpm * 0.18, t, 0.05);
    this.eGain.gain.setTargetAtTime(on * (0.07 + thr * 0.11 + rpm / 8000 * 0.04) * (car.shiftT > 0 ? 0.4 : 1), t, 0.04);
    this.intake.g.gain.setTargetAtTime(on * thr * 0.05 * rpm / 8000, t, 0.05);
    this.intake.flt.frequency.setTargetAtTime(300 + rpm * 0.12, t, 0.05);
    const slide = Math.max(0, Math.max(car.slipR, car.slipF) - 0.12) * 2.2 + car.spinR * 0.6 + car.lockF * 0.5;
    this.tyre.g.gain.setTargetAtTime(on * Math.min(0.22, slide * 0.2) * Math.min(1, spd / 6) * (car.onGrass ? 0.2 : 1), t, 0.05);
    this.tyre.flt.frequency.setTargetAtTime(900 + Math.min(600, spd * 6), t, 0.1);
    this.wind.g.gain.setTargetAtTime(on * Math.min(0.25, spd * spd / 9000), t, 0.1);
    this.wind.flt.frequency.setTargetAtTime(300 + spd * 12, t, 0.1);
    this.nitro.g.gain.setTargetAtTime(on * (car.nitroOn ? 0.09 : 0), t, 0.05);
  }
  thump(strength) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, src = this.ctx.createBufferSource(); src.buffer = this.buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    const g = this.ctx.createGain(); const v = Math.min(0.9, strength);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.comp); src.start(t, Math.random()); src.stop(t + 0.4);
  }
  beep(freq, dur = 0.15, vol = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.comp); o.start(t); o.stop(t + dur);
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
}
