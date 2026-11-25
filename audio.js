// Die Schatten von Eldermoor – prozedurale Geräuscheffekte (Web Audio API)
// Autor: eldermoor-dev
// Keine Musik, keine Melodien, keine Audiodateien. Nur synthetisierte Geräusche.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.volume = 0.7;
    this.muted = false;
    this.unsupported = false;
    this.ambientOn = false;
    this.stepsOn = true; // Schrittgeräusche an/aus (Einstellung)
    this._timers = [];
    this._wind = null;
  }

  // Muss in einer Nutzergeste aufgerufen werden (Autoplay-Regeln der Browser).
  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) { this.unsupported = true; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._apply();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  _apply() { if (this.master) this.master.gain.value = this.muted ? 0 : Math.pow(this.volume, 2); }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this._apply(); }
  setMuted(m) { this.muted = !!m; this._apply(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _noise({ t = 0, dur = 0.1, type = 'bandpass', f = 800, fTo = null, q = 1, gain = 0.3 }) {
    const c = this.ctx, now = c.currentTime + t;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, now);
    if (fTo) fl.frequency.exponentialRampToValueAtTime(fTo, now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master);
    s.start(now, Math.random() * 0.5, dur + 0.05);
  }
  _tone({ t = 0, dur = 0.2, type = 'sine', f = 200, fTo = null, gain = 0.2 }) {
    const c = this.ctx, now = c.currentTime + t;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, now);
    if (fTo) o.frequency.exponentialRampToValueAtTime(fTo, now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(this.master);
    o.start(now); o.stop(now + dur + 0.05);
  }

  play(name) {
    if (!this.ctx || this.muted || this.volume <= 0) return;
    if (name === 'step' && !this.stepsOn) return;
    switch (name) {
      case 'step':
        this._noise({ dur: 0.09, f: 200 + Math.random() * 60, q: 1.2, gain: 0.35 });
        this._tone({ dur: 0.08, f: 70, fTo: 45, gain: 0.12 });
        break;
      case 'bump': this._noise({ dur: 0.08, type: 'lowpass', f: 140, gain: 0.4 }); break;
      case 'door':
        this._tone({ dur: 0.55, type: 'sawtooth', f: 90, fTo: 150, gain: 0.08 });
        this._noise({ dur: 0.55, type: 'lowpass', f: 700, fTo: 300, gain: 0.18 });
        break;
      case 'unlock':
        this._noise({ dur: 0.03, type: 'highpass', f: 2200, gain: 0.3 });
        this._noise({ t: 0.12, dur: 0.03, type: 'highpass', f: 1800, gain: 0.3 });
        this._tone({ t: 0.2, dur: 0.5, type: 'sawtooth', f: 90, fTo: 140, gain: 0.07 });
        break;
      case 'chest':
        this._noise({ dur: 0.04, type: 'highpass', f: 1500, gain: 0.3 });
        this._tone({ t: 0.03, dur: 0.25, type: 'triangle', f: 190, fTo: 120, gain: 0.15 });
        break;
      case 'hit':
        this._noise({ dur: 0.18, type: 'lowpass', f: 900, fTo: 200, gain: 0.5 });
        this._tone({ dur: 0.2, f: 110, fTo: 50, gain: 0.3 });
        break;
      case 'miss': this._noise({ dur: 0.15, f: 600, fTo: 1800, q: 2, gain: 0.18 }); break;
      case 'hurt':
        this._tone({ dur: 0.28, type: 'sawtooth', f: 150, fTo: 60, gain: 0.16 });
        this._noise({ dur: 0.2, type: 'lowpass', f: 700, gain: 0.35 });
        break;
      case 'heal': this._tone({ dur: 0.4, f: 420, fTo: 900, gain: 0.12 }); break;
      case 'defend': this._noise({ dur: 0.1, f: 1200, q: 3, gain: 0.2 }); this._tone({ dur: 0.12, type: 'square', f: 180, gain: 0.06 }); break;
      case 'warn': this._tone({ dur: 0.14, type: 'square', f: 640, gain: 0.12 }); this._tone({ t: 0.2, dur: 0.14, type: 'square', f: 640, gain: 0.12 }); this._tone({ t: 0.4, dur: 0.3, type: 'square', f: 440, fTo: 330, gain: 0.12 }); break;
      case 'sting':
        this._tone({ dur: 1.8, type: 'sawtooth', f: 82, fTo: 70, gain: 0.1 });
        this._tone({ t: 0.02, dur: 1.8, type: 'sawtooth', f: 123, fTo: 104, gain: 0.07 });
        this._tone({ t: 0.05, dur: 1.6, type: 'triangle', f: 62, fTo: 41, gain: 0.2 });
        this._noise({ dur: 1.2, type: 'lowpass', f: 300, fTo: 900, gain: 0.12 });
        break;
      case 'slam': // 0.48.1: Tür fällt mit lautem Knall zu
        this._noise({ dur: 0.35, type: 'lowpass', f: 1400, fTo: 120, gain: 0.9 });
        this._tone({ dur: 0.45, f: 95, fTo: 32, gain: 0.7 });
        this._noise({ t: 0.18, dur: 0.6, type: 'lowpass', f: 260, fTo: 80, gain: 0.25 });
        break;
      case 'thunder': // 0.48.1: Donner nach dem Blitz
        this._noise({ dur: 1.6, type: 'lowpass', f: 380, fTo: 70, gain: 0.5 });
        this._tone({ t: 0.05, dur: 1.4, type: 'triangle', f: 55, fTo: 30, gain: 0.22 });
        break;
      case 'defeat': this._tone({ dur: 1.0, f: 120, fTo: 38, gain: 0.3 }); break;
      case 'ui': this._noise({ dur: 0.025, type: 'highpass', f: 2500, gain: 0.15 }); break;
      default: break;
    }
  }

  startAmbient() {
    if (!this.ctx || this.ambientOn) return;
    this.ambientOn = true;
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 280;
    const g = c.createGain(); g.gain.value = 0.04;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const depth = c.createGain(); depth.gain.value = 0.03;
    lfo.connect(depth); depth.connect(g.gain);
    s.connect(lp); lp.connect(g); g.connect(this.master);
    s.start(); lfo.start();
    this._wind = { s, lfo };
    const drip = () => {
      if (!this.ambientOn) return;
      if (!this.muted && this.ctx.state === 'running') {
        const f = 420 + Math.random() * 200;
        this._tone({ dur: 0.22, f, fTo: f * 0.62, gain: 0.035 });
        this._noise({ dur: 0.05, type: 'lowpass', f: 600, gain: 0.03 });
      }
      this._timers[0] = setTimeout(drip, 4000 + Math.random() * 7000);
    };
    const crackle = () => {
      if (!this.ambientOn) return;
      if (!this.muted && this.ctx.state === 'running') this._noise({ dur: 0.12, type: 'lowpass', f: 160 + Math.random() * 80, gain: 0.05 });
      this._timers[1] = setTimeout(crackle, 3000 + Math.random() * 6000);
    };
    this._timers[0] = setTimeout(drip, 3000);
    this._timers[1] = setTimeout(crackle, 5000);
  }
  stopAmbient() {
    this.ambientOn = false;
    this._timers.forEach((t) => clearTimeout(t));
    this._timers = [];
    if (this._wind) { try { this._wind.s.stop(); this._wind.lfo.stop(); } catch { /* bereits gestoppt */ } this._wind = null; }
  }
}
