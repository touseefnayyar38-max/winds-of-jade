export type SoundEffect =
  | 'slash'
  | 'slash2'
  | 'slash3'
  | 'hit'
  | 'parry'
  | 'hurt'
  | 'dodge'
  | 'jump'
  | 'step'
  | 'grapple'
  | 'kill'
  | 'tele'
  | 'die'
  | 'level'
  | 'quest'
  | 'shrine';

class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxG: GainNode | null = null;
  private musicG: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private nextNote = 0;
  private idx = 3;
  private step = 0;
  private timerId: number | null = null;
  public combat = false;
  public muted = false;

  private readonly SCALE = [146.83, 174.61, 196, 220, 261.63, 293.66, 349.23, 392, 440];

  constructor() {
    try {
      this.muted = localStorage.getItem('wuxia.mute') === '1';
    } catch {
      this.muted = false;
    }
  }

  private env(g: GainNode, t: number, a: number, d: number, v: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private noise(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number) {
    if (!this.ctx || !this.noiseBuf || !this.sfxG) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const fl = this.ctx.createBiquadFilter();
    fl.type = type;
    fl.Q.value = 1.2;
    fl.frequency.setValueAtTime(f0, t);
    fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.01, dur, vol);
    s.connect(fl);
    fl.connect(g);
    g.connect(this.sfxG);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  private tone(
    t: number,
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    dest?: AudioNode,
  ) {
    if (!this.ctx || !this.sfxG) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.006, dur, vol);
    o.connect(g);
    g.connect(dest || this.sfxG);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pluck(t: number, f: number) {
    if (!this.ctx || !this.musicG) return;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = this.ctx.createGain();
    this.env(g, t, 0.008, 1.5, 0.12);
    const fl = this.ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(3200, t);
    fl.frequency.exponentialRampToValueAtTime(500, t + 0.9);
    o.connect(fl);
    fl.connect(g);
    g.connect(this.musicG);
    o.start(t);
    o.stop(t + 1.7);
  }

  private schedule = () => {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const beat = this.combat ? 0.3 : 0.55;
    if (this.nextNote < this.ctx.currentTime) this.nextNote = this.ctx.currentTime + 0.1;
    while (this.nextNote < this.ctx.currentTime + 0.6) {
      if (Math.random() < (this.combat ? 0.9 : 0.55)) {
        this.idx = Math.max(0, Math.min(this.SCALE.length - 1, this.idx + Math.floor(Math.random() * 5) - 2));
        this.pluck(this.nextNote, this.SCALE[this.idx] * (Math.random() < 0.2 ? 2 : 1));
      }
      if (this.combat && this.step % 2 === 0 && this.musicG) {
        this.tone(this.nextNote, 'sine', 90, 40, 0.25, 0.22, this.musicG);
      }
      this.step++;
      this.nextNote += beat;
    }
  };

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    this.sfxG = ctx.createGain();
    this.sfxG.gain.value = 0.72;
    this.sfxG.connect(this.master);

    this.musicG = ctx.createGain();
    this.musicG.gain.value = 0.48;
    this.musicG.connect(this.master);

    const dly = ctx.createDelay(1);
    dly.delayTime.value = 0.34;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    this.musicG.connect(dly);
    dly.connect(lp);
    lp.connect(fb);
    fb.connect(dly);
    lp.connect(this.master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    const ws = ctx.createBufferSource();
    ws.buffer = this.noiseBuf;
    ws.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = 0.045;
    ws.connect(bp);
    bp.connect(wg);
    wg.connect(this.master);
    ws.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = ctx.createGain();
    lg.gain.value = 260;
    lfo.connect(lg);
    lg.connect(bp.frequency);
    lfo.start();

    for (const f of [73.42, 110]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.045;
      o.connect(g);
      g.connect(this.musicG);
      o.start();
    }
    this.nextNote = ctx.currentTime + 0.3;
    this.timerId = window.setInterval(this.schedule, 200);
  }

  sfx(name: SoundEffect) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'slash':
        this.noise(t, 0.2, 'bandpass', 900, 3800, 0.34);
        break;
      case 'slash2':
        this.noise(t, 0.22, 'bandpass', 1200, 4400, 0.36);
        break;
      case 'slash3':
        this.noise(t, 0.28, 'bandpass', 750, 5200, 0.42);
        this.tone(t, 'triangle', 220, 480, 0.18, 0.18);
        break;
      case 'hit':
        this.tone(t, 'sine', 170, 45, 0.2, 0.48);
        this.noise(t, 0.08, 'highpass', 1500, 3000, 0.28);
        break;
      case 'parry':
        this.tone(t, 'triangle', 880, 1760, 0.28, 0.32);
        this.tone(t + 0.03, 'sine', 1320, 660, 0.34, 0.25);
        break;
      case 'hurt':
        this.tone(t, 'sawtooth', 220, 70, 0.35, 0.28);
        break;
      case 'dodge':
        this.noise(t, 0.28, 'bandpass', 500, 2200, 0.28);
        break;
      case 'jump':
        this.noise(t, 0.14, 'bandpass', 400, 1200, 0.12);
        break;
      case 'step':
        this.noise(t, 0.06, 'lowpass', 900, 300, 0.09);
        break;
      case 'grapple':
        this.tone(t, 'triangle', 300, 1200, 0.25, 0.24);
        this.noise(t, 0.28, 'bandpass', 800, 3000, 0.2);
        break;
      case 'kill':
        this.tone(t, 'sine', 260, 60, 0.4, 0.48);
        break;
      case 'tele':
        this.tone(t, 'square', 140, 110, 0.18, 0.07);
        break;
      case 'die':
        this.tone(t, 'sawtooth', 300, 40, 1.2, 0.3);
        break;
      case 'level':
        [523, 659, 784, 1047].forEach((f, i) =>
          this.tone(t + i * 0.09, 'triangle', f, f * 1.002, 0.5, 0.22),
        );
        break;
      case 'quest':
        [392, 523, 659].forEach((f, i) =>
          this.tone(t + i * 0.12, 'sine', f, f * 1.001, 0.6, 0.22),
        );
        break;
      case 'shrine':
        [293.66, 440, 587.33].forEach((f, i) =>
          this.tone(t + i * 0.08, 'sine', f, f * 1.005, 0.7, 0.18),
        );
        break;
    }
  }

  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('wuxia.mute', this.muted ? '1' : '0');
    } catch {
      // ignore storage errors
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  suspend() {
    if (this.ctx) this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx) this.ctx.resume().catch(() => {});
  }

  dispose() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const AudioFX = new ProceduralAudio();
