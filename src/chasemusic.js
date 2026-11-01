// Music for the police chase: the player's own copy of a song (the James Bond theme, say). The game does not include any song. The player
// picks a file once (from the Files app on a tablet); it is kept in this browser's storage on this device and never uploaded anywhere.
// It plays from the start when a chase begins, pauses with the pause menu and fades out when the chase ends.
// A file called music/chase.mp3 next to index.html is used too, if someone puts one there themselves.
const DB = 'sunsetcity-music', STORE = 'files', KEY = 'chase';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('no storage')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbGet() {
  const db = await openDb();
  return new Promise((resolve, reject) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => resolve(q.result || null); q.onerror = () => reject(q.error); });
}
async function dbPut(value) {
  const db = await openDb();
  return new Promise((resolve, reject) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(value, KEY); t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error); });
}
async function dbDelete() {
  const db = await openDb();
  return new Promise((resolve, reject) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(KEY); t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); });
}

export class ChaseMusic {
  constructor(audio) {
    this.audio = audio;            // the AudioEngine, for its AudioContext
    this.el = null; this.url = null; this.name = '';
    this.src = null; this.gain = null;
    this.want = false;             // a chase is on and the music should be heard
    this.active = false;           // and it is sounding right now (not paused in a menu)
    this.level = 0.7;              // 0 when sound or the music is switched off
    this.kept = true;              // false when the browser would not keep the file for next time
    this.onChange = null;          // called when the song changes, so the screen can show its name
    this._pauseTimer = 0;
  }

  get has() { return !!this.el; }

  async load() {
    try {
      const v = await dbGet();
      if (v && v.data) { this._use(new Blob([v.data], { type: v.type || 'audio/mpeg' }), v.name || 'your song'); return; }
    } catch (e) { /* storage unavailable: carry on without */ }
    for (const f of ['music/chase.mp3']) {                      // a file put next to the game by hand
      try { const r = await fetch(f); const ty = r.headers.get('content-type') || ''; if (r.ok && /audio|octet-stream/.test(ty)) { this._use(await r.blob(), f.split('/').pop()); return; } } catch (e) { /* none there */ }
    }
  }

  // The player picked a file. Returns '' if it was taken, otherwise a sentence saying why not.
  async choose(file) {
    if (!file) return 'No file was chosen.';
    const okType = (file.type || '').startsWith('audio') || /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus)$/i.test(file.name || '');
    if (!okType) return 'That does not look like an audio file.';
    if (file.size > 80 * 1024 * 1024) return 'That file is too big (the limit is 80 MB).';
    const data = await file.arrayBuffer();
    const name = (file.name || 'your song').replace(/\.[^.]+$/, '');
    this._use(new Blob([data], { type: file.type || 'audio/mpeg' }), name);
    try { await dbPut({ data, type: file.type || 'audio/mpeg', name }); this.kept = true; } catch (e) { this.kept = false; }
    return '';
  }

  async remove() {
    this.stop(true); this._drop();
    try { await dbDelete(); } catch (e) { /* nothing stored */ }
    if (this.onChange) this.onChange();
  }

  _drop() {
    if (this.el) { this.el.pause(); this.el.remove(); }
    if (this.url) URL.revokeObjectURL(this.url);
    this.el = this.url = this.src = this.gain = null; this.name = '';
  }

  _use(blob, name) {
    this.stop(true); this._drop();
    this.url = URL.createObjectURL(blob); this.name = name;
    const el = document.createElement('audio');
    el.src = this.url; el.loop = true; el.preload = 'auto'; el.setAttribute('playsinline', ''); el.style.display = 'none';
    el.addEventListener('error', () => { this.failed = true; if (this.onChange) this.onChange(); });
    document.body.appendChild(el); this.el = el; this.failed = false;
    if (this.onChange) this.onChange();
  }

  // Through the game's AudioContext, so the volume works on an iPad too (an <audio> element's own volume is ignored there).
  _wire() {
    const ctx = this.audio && this.audio.ctx;
    if (!this.el || !ctx || this.src) return;
    try { this.src = ctx.createMediaElementSource(this.el); this.gain = ctx.createGain(); this.gain.gain.value = 0; this.src.connect(this.gain); this.gain.connect(ctx.destination); } catch (e) { this.src = this.gain = null; }
  }
  _fadeTo(v, tc = 0.35) {
    if (this.gain && this.audio.ctx) this.gain.gain.setTargetAtTime(v, this.audio.ctx.currentTime, tc);
    else if (this.el) this.el.volume = Math.max(0, Math.min(1, v));
  }

  setVolume(vol, enabled) { this.level = enabled ? Math.min(1, vol * 0.95) : 0; if (this.active) this._fadeTo(this.level, 0.1); }

  // From the click that starts a chase (browsers only let sound start from a tap or a key).
  start() {
    if (!this.el) return;
    this.audio.init(); this._wire();
    clearTimeout(this._pauseTimer);
    try { this.el.currentTime = 0; } catch (e) { /* not seekable yet */ }
    this.want = true; this._play();
  }
  _play() {
    if (!this.el || !this.want) return;
    clearTimeout(this._pauseTimer); this._wire(); this.active = true;
    const p = this.el.play(); if (p && p.catch) p.catch(() => { /* blocked until the next tap */ });
    this._fadeTo(this.level);
  }
  // Called whenever the game's state changes: heard while driving in a chase, silent in menus and while paused.
  set(active) {
    if (!this.el || !this.want) return;
    if (active) this._play(); else this._halt(false);
  }
  _halt(rewind) {
    this.active = false; this._fadeTo(0, 0.12); clearTimeout(this._pauseTimer);
    const el = this.el; this._pauseTimer = setTimeout(() => { if (el) { el.pause(); if (rewind) { try { el.currentTime = 0; } catch (e) { /* ignore */ } } } }, 450);
  }
  // The chase is over (or restarting): fade out and rewind.
  stop(now) {
    this.want = false; this.active = false;
    if (!this.el) return;
    if (now) { clearTimeout(this._pauseTimer); this.el.pause(); try { this.el.currentTime = 0; } catch (e) { /* ignore */ } if (this.gain) this.gain.gain.value = 0; return; }
    this._halt(true);
  }
}
