// Frame-time profiling and the performance guard.
//
// The game already scales its resolution to hold the frame rate (main.js). That is not always enough (a tablet with a lot of police
// on screen can be limited by the JavaScript, not the picture), so the guard also steps down features, one at a time, and brings
// them back when there is room. It works out which side is the bottleneck from the time the JavaScript took in each frame
// against the whole frame: JS time near the frame time means the CPU is the limit; much less means the graphics are.
//
//   guard.sample(frameMs, jsMs, resAtFloor) once per frame while playing
//   -> 'gpu-down' | 'cpu-down' | 'up' | null      (the caller then applies or undoes the next step of its ladder)
//
// No browser or graphics code in here, so it is tested on its own (tests/perf.mjs).

export class Profiler {
  constructor() { this.t0 = 0; this.cur = {}; this.avg = {}; this.js = 0; }
  begin() { this.t0 = this.tl = performance.now(); this.cur = {}; }
  mark(name) { const n = performance.now(); this.cur[name] = (this.cur[name] || 0) + n - this.tl; this.tl = n; }
  end() {
    const n = performance.now(); this.js += ((n - this.t0) - this.js) * 0.06;
    for (const k in this.cur) this.avg[k] = (this.avg[k] ?? this.cur[k]) + (this.cur[k] - (this.avg[k] ?? this.cur[k])) * 0.06;
  }
  report() { return Object.entries(this.avg).filter(([, v]) => v >= 0.15).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · '); }
}

export class PerfGuard {
  // gpuSteps / cpuSteps: how many steps each ladder has.
  constructor(gpuSteps, cpuSteps, o = {}) {
    this.maxGpu = gpuSteps; this.maxCpu = cpuSteps; this.gpu = 0; this.cpu = 0;
    this.slowMs = o.slowMs ?? 23;            // slower than this (about 43 frames a second) is a problem
    this.fastMs = o.fastMs ?? 15.5;          // quicker than this has room to spare
    this.window = o.window ?? 1.5;           // seconds per decision
    this.downAfter = o.downAfter ?? 2;       // slow windows in a row before stepping down
    this.upAfter = o.upAfter ?? 8;           // fast windows in a row before stepping back up
    this.t = 0; this.n = 0; this.fSum = 0; this.jSum = 0; this.slow = 0; this.fast = 0; this.grace = o.grace ?? 4;
    this.stuck = 0; this.history = []; this.banned = { gpu: new Set(), cpu: new Set() }; this.lastUp = null; this.clock = 0;
  }
  // After a level load, a teleport or a change of mode the frames are not typical: ignore the next few seconds.
  pause(seconds = 4) { this.grace = Math.max(this.grace, seconds); this.t = this.n = this.fSum = this.jSum = 0; this.slow = this.fast = 0; }
  get level() { return this.gpu + this.cpu; }
  sample(frameMs, jsMs, resAtFloor = true) {
    const dt = frameMs / 1000; this.clock += dt;
    if (this.grace > 0) { this.grace -= dt; return null; }
    if (frameMs > 250) return null;                                  // a hitch (a model loading, the tab coming back), not a trend
    this.t += dt; this.n++; this.fSum += frameMs; this.jSum += jsMs;
    if (this.t < this.window) return null;
    const f = this.fSum / this.n, j = this.jSum / this.n; this.t = this.n = this.fSum = this.jSum = 0;
    const cpuBound = j > 0.55 * f && j > 10;
    if (f > this.slowMs) { this.slow++; this.fast = 0; } else if (f < this.fastMs) { this.fast++; this.slow = 0; this.stuck = 0; } else { this.slow = this.fast = 0; this.stuck = 0; }
    if (this.slow >= (cpuBound ? this.downAfter : this.downAfter + 1)) {          // (a slow picture first gets the resolution lowered, by the caller, which says when it is at its floor)
      if (cpuBound && this.cpu < this.maxCpu) return this.down('cpu');
      if (!cpuBound && resAtFloor && this.gpu < this.maxGpu) return this.down('gpu');
      if (!cpuBound && !resAtFloor) { this.slow = 0; return null; }
      // Nothing left on this side: try the other one.
      if (this.cpu < this.maxCpu) return this.down('cpu');
      if (this.gpu < this.maxGpu) return this.down('gpu');
      this.slow = 0;
      if (++this.stuck >= 4) { this.stuck = 0; return 'exhausted'; }            // every step is already down and it is still slow: the caller may save a lighter default
    }
    if (this.fast >= this.upAfter && this.level > 0) return this.up();
    return null;
  }
  down(kind) {
    this.slow = 0;
    if (this.lastUp && this.clock - this.lastUp.t < 25) this.banned[this.lastUp.kind].add(this.lastUp.lvl);       // it was slow again soon after the last step back up: that step stays off
    if (kind === 'gpu') this.gpu++; else this.cpu++;
    this.history.push([this.clock, kind + '-down', this.level]);
    return kind + '-down';
  }
  up() {
    this.fast = 0;
    // Bring back the most recently removed step, from the side with more steps removed, unless it is banned.
    const kind = this.gpu > 0 && this.gpu >= this.cpu ? 'gpu' : 'cpu', lvl = kind === 'gpu' ? this.gpu : this.cpu;
    if (this.banned[kind].has(lvl)) return null;
    if (kind === 'gpu') this.gpu--; else this.cpu--;
    this.lastUp = { t: this.clock, kind, lvl };
    this.history.push([this.clock, kind + '-up', this.level]);
    return 'up:' + kind;
  }
}
