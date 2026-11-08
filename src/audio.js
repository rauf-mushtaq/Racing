// Synthesised sound: a V12 engine (harmonics of the firing rate through a
// filter and a little distortion), tyre squeal, wind, impacts and the nitro.
// Starts on the first key press or tap, as browsers require.
//
// Gunfire, explosions and impacts that happen somewhere (an officer's shot, a car gun, a blast) are placed in the street: each comes from its own
// position through a panner (so it is louder and on the right side as it gets closer, quieter and more echoey as it gets further), with a send to a
// city-sized reverb (a synthetic impulse response: a short, bright, fast-fading tail) that grows with the distance. The listener is the camera.
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
      const tyre = noise('bandpass', 1100, 6), wind = noise('lowpass', 500, 0.7), intake = noise('bandpass', 400, 1.2), nitro = noise('highpass', 2500, 0.7), city = noise('lowpass', 230, 0.6), rainN = noise('highpass', 3200, 0.45);
      // The siren: a two-tone, through a band-pass so it sounds like a horn in the street rather than a test tone.
      const sirenO = ctx.createOscillator(); sirenO.type = 'sawtooth'; sirenO.frequency.value = 650;
      const sirenF = ctx.createBiquadFilter(); sirenF.type = 'bandpass'; sirenF.frequency.value = 1100; sirenF.Q.value = 0.9;
      const sirenG = ctx.createGain(); sirenG.gain.value = 0; sirenO.connect(sirenF); sirenF.connect(sirenG); sirenG.connect(comp); sirenO.start();
      // The city's echo: a 1.4 s tail of noise that fades quickly and loses its highs as it goes.
      const irLen = Math.floor(ctx.sampleRate * 1.4), ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d2 = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < irLen; i++) { const k = i / irLen, a = 0.12 + 0.8 * k; lp += ((Math.random() * 2 - 1) - lp) * a; d2[i] = lp * Math.pow(1 - k, 3.4) * (i < 400 ? i / 400 : 1); } }
      const verb = ctx.createConvolver(); verb.buffer = ir; const verbG = ctx.createGain(); verbG.gain.value = 0.55; verb.connect(verbG); verbG.connect(comp);
      Object.assign(this, { ctx, master, eGain, eFilt, oscs, tyre, wind, intake, nitro, city, rainN, buf, comp, sirenO, sirenG, verb });
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
  // The low murmur of the city (traffic far off), louder when you are on foot.
  hum(v) { if (this.ctx) this.city.g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.4); }
  rain(v) { if (this.ctx) this.rainN.g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.5); }
  // The police siren at a distance-based level (0 silent to 1 right behind you).
  siren(level, clock) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirenO.frequency.setTargetAtTime(Math.floor(clock * 2.1) % 2 ? 880 : 640, t, 0.025);
    this.sirenG.gain.setTargetAtTime(level * 0.11, t, 0.12);
  }
  // Where the listener is (the camera): call once a frame.
  setListener(camera) {
    if (!this.ctx) return; const L = this.ctx.listener, p = camera.position, e = camera.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz; L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz; }
    else if (L.setPosition) { L.setPosition(p.x, p.y, p.z); L.setOrientation(fx, fy, fz, ux, uy, uz); }
    this.lx = p.x; this.ly = p.y; this.lz = p.z;
  }
  // A short noise burst through a filter: the building block of the gunfire, explosions and the missile. `at` = [x, y, z] puts it in the street.
  burst(f0, f1, dur, vol, type = 'bandpass', q = 1, at = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, src = this.ctx.createBufferSource(); src.buffer = this.buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); src.start(t, Math.random()); src.stop(t + dur + 0.02);
    if (!at) { g.connect(this.comp); return; }
    // In the street: panned and softened by distance, with more echo the further away it is.
    const pn = this.ctx.createPanner(); pn.panningModel = 'equalpower'; pn.distanceModel = 'inverse'; pn.refDistance = 10; pn.rolloffFactor = 1.15; pn.maxDistance = 600;
    if (pn.positionX) { pn.positionX.value = at[0]; pn.positionY.value = at[1]; pn.positionZ.value = at[2]; } else pn.setPosition(at[0], at[1], at[2]);
    g.connect(pn); pn.connect(this.comp);
    const dist = Math.hypot(at[0] - (this.lx || 0), at[1] - (this.ly || 0), at[2] - (this.lz || 0)), send = this.ctx.createGain(); send.gain.value = Math.min(0.8, 0.12 + dist / 120); g.connect(send); send.connect(this.verb);
  }
  // Street musicians: one note (or one stroke of a drum) placed where the performer stands. kind: guitar, sax, pluck, drum1 (boom), drum2 (bap), drum3 (tick), coin.
  busk(kind, freq, dur, vol, at) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, out = ctx.createGain(), pn = ctx.createPanner();
    pn.panningModel = 'equalpower'; pn.distanceModel = 'inverse'; pn.refDistance = 7; pn.rolloffFactor = 1.35; pn.maxDistance = 300;
    if (pn.positionX) { pn.positionX.value = at[0]; pn.positionY.value = at[1]; pn.positionZ.value = at[2]; } else pn.setPosition(at[0], at[1], at[2]);
    out.connect(pn); pn.connect(this.comp);
    const env = (g, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0008, t + d); };
    if (kind === 'guitar' || kind === 'pluck') {                                           // a plucked string: two slightly different triangle waves through a filter that closes as the note dies
      const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq * (kind === 'pluck' ? 5 : 9), t); f.frequency.exponentialRampToValueAtTime(freq * 1.4, t + dur);
      env(g, 0.004, vol, dur); f.connect(g); g.connect(out);
      for (const d of [-5, 5]) { const o = ctx.createOscillator(); o.type = kind === 'pluck' ? 'square' : 'triangle'; o.frequency.value = freq; o.detune.value = d; o.connect(f); o.start(t); o.stop(t + dur + 0.05); }
      this.burst(freq * 6, freq * 2, 0.03, vol * 0.5, 'bandpass', 2, at);                    // the pick
    } else if (kind === 'sax') {                                                           // a breathy reed: a sawtooth with vibrato through a band-pass, and a bit of air
      const g = ctx.createGain(), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = freq * 3.2; f.Q.value = 0.9;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.07); g.gain.setValueAtTime(vol, t + Math.max(0.08, dur - 0.14)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      lfo.frequency.value = 5.2; lg.gain.value = freq * 0.012; lfo.connect(lg); const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(freq * 0.97, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.08); lg.connect(o.frequency);
      o.connect(f); f.connect(g); g.connect(out); lfo.start(t); o.start(t); lfo.stop(t + dur + 0.05); o.stop(t + dur + 0.05);
      this.burst(2400, 1800, dur, vol * 0.06, 'bandpass', 0.8, at);
    } else if (kind === 'drum1') {                                                         // a bucket kicked: a quick falling sine
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.16); env(g, 0.003, vol * 1.3, 0.22); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3);
    } else if (kind === 'drum2') { this.burst(1900, 900, 0.14, vol * 0.9, 'bandpass', 1.4, at); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08); env(g, 0.003, vol * 0.6, 0.12); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.18); }
    else if (kind === 'drum3') this.burst(6500, 5200, 0.05, vol * 0.45, 'highpass', 0.7, at);
    else if (kind === 'coin') {                                                            // a coin in the hat: two bright rings
      for (const [f2, dl] of [[2637, 0], [3520, 0.06]]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f2; g.gain.setValueAtTime(0.0001, t + dl); g.gain.exponentialRampToValueAtTime(vol * 0.5, t + dl + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + dl + 0.45); o.connect(g); g.connect(out); o.start(t + dl); o.stop(t + dl + 0.5); }
    }
  }
  // The audience clapping: a burst of filtered noise that swells and dies, from the crowd's place in the street.
  applause(at, vol = 0.3) {
    if (!this.ctx) return;
    for (let k = 0; k < 14; k++) setTimeout(() => this.burst(2200 + Math.random() * 1800, 1500, 0.05, vol * (0.5 + Math.random() * 0.5) * Math.sin(Math.PI * (k + 1) / 15), 'bandpass', 1.2, at), k * 150 + Math.random() * 70);
  }
  gun() { const t = this.ctx && this.ctx.currentTime; if (!t || t - (this.lastGun || 0) < 0.045) return; this.lastGun = t; this.burst(2400, 700, 0.07, 0.3, 'bandpass', 0.8); }
  whoosh() { this.burst(500, 4000, 0.6, 0.3, 'bandpass', 0.6); }
  // The weapons on foot: each a crack through a band-pass plus a low thump (the pistol is silenced: a soft cough instead of a bang).
  shot(key) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    if (key === 'pistol') { this.burst(1800, 500, 0.06, 0.2, 'bandpass', 1.2); this.burst(260, 90, 0.07, 0.25, 'lowpass', 1); }
    else if (key === 'smg') { if (t - (this.lastSmg || 0) < 0.04) return; this.lastSmg = t; this.burst(2600, 600, 0.05, 0.22, 'bandpass', 1); this.burst(300, 100, 0.06, 0.22, 'lowpass', 1); }
    else if (key === 'shotgun') { this.burst(2200, 160, 0.34, 0.75, 'lowpass', 0.8); this.burst(3800, 700, 0.14, 0.42, 'bandpass', 0.7); setTimeout(() => { this.burst(900, 500, 0.04, 0.2, 'bandpass', 3); setTimeout(() => this.burst(1400, 700, 0.05, 0.2, 'bandpass', 3), 110); }, 380); }
  }
  // An officer's pistol or submachine gun: louder and sharper than yours (it is not silenced), quieter the further away.
  copShot(vol = 1, x, y, z) { if (!this.ctx) return; const t = this.ctx.currentTime; if (t - (this.lastCop || 0) < 0.035) return; this.lastCop = t; const at = x === undefined ? null : [x, y, z]; this.burst(2600, 520, 0.08, 0.34 * vol, 'bandpass', 0.9, at); this.burst(280, 90, 0.1, 0.32 * vol, 'lowpass', 1, at); }
  rocketSound() { this.burst(300, 3500, 0.9, 0.45, 'bandpass', 0.5); this.burst(500, 70, 0.5, 0.6, 'lowpass', 0.8); }
  reloadSound(dur, key) {
    if (!this.ctx) return; const click = (d, f = 3200) => setTimeout(() => this.burst(f, f * 0.6, 0.035, 0.22, 'bandpass', 4), d * 1000);
    if (key === 'shotgun') for (let i = 0; i < 6; i++) click(0.2 + i * (dur - 0.5) / 6, 2400); else { click(0.25, 2200); click(dur * 0.55, 3600); click(dur - 0.15, 2800); }
  }
  boom(power = 1, x, y, z) {
    if (!this.ctx) return; const at = x === undefined ? null : [x, y, z];
    this.burst(900 * power, 60, 0.9 + power * 0.5, 0.9, 'lowpass', 0.7, at);
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    g.gain.setValueAtTime(0.7 * Math.min(1.2, power), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(g); if (at) { const pn = this.ctx.createPanner(); pn.panningModel = 'equalpower'; pn.distanceModel = 'inverse'; pn.refDistance = 14; pn.rolloffFactor = 0.9; pn.maxDistance = 900; if (pn.positionX) { pn.positionX.value = x; pn.positionY.value = y; pn.positionZ.value = z; } else pn.setPosition(x, y, z); g.connect(pn); pn.connect(this.comp); } else g.connect(this.comp); o.start(t); o.stop(t + 0.85);
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
  // Footsteps (a soft thud and a scuff, brighter on pavement than on grass) and a car door.
  step(v, kind) {
    if (!this.ctx) return;
    const f = kind === 'grass' ? 420 : kind === 'sand' || kind === 'gravel' ? 900 : 1500;
    this.burst(f, f * 0.45, 0.07, 0.16 * v, 'bandpass', 0.9); this.burst(180, 90, 0.06, 0.12 * v, 'lowpass', 1);
  }
  clang(v = 1, x, y, z) { const k = Math.min(1, v / 8), at = x === undefined ? null : [x, y, z]; this.burst(2600, 900, 0.25, 0.22 + 0.3 * k, 'bandpass', 4, at); this.burst(900, 300, 0.18, 0.2 * k + 0.05, 'bandpass', 2, at); }
  door() { this.burst(420, 70, 0.22, 0.55, 'lowpass', 1.2); setTimeout(() => this.burst(2200, 900, 0.05, 0.14, 'bandpass', 1.5), 70); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
}
