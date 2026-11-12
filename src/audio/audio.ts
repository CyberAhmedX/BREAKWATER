import type { Chapter } from "../engine/types";

// Every sound in Breakwater is synthesized at runtime with the Web Audio API.
// Nothing is sampled or copied. The soundtrack is a slow generative pad plus a
// sparse melody whose scale and tempo shift with the chapter: warm and major
// early, hollow and minor by the storm.

interface Palette {
  root: number; // root frequency
  scale: number[]; // semitone offsets
  tempo: number; // seconds per step
  padType: OscillatorType;
  leadType: OscillatorType;
  cutoff: number; // lowpass on the pad
  leadGain: number;
  drone: boolean;
}

const semitone = (root: number, n: number): number => root * Math.pow(2, n / 12);

const PALETTES: Record<Chapter, Palette> = {
  // cozy, lydian-ish C
  0: { root: 130.81, scale: [0, 2, 4, 7, 9, 11], tempo: 0.62, padType: "triangle", leadType: "sine", cutoff: 1600, leadGain: 0.12, drone: false },
  1: { root: 130.81, scale: [0, 2, 4, 7, 9], tempo: 0.6, padType: "triangle", leadType: "sine", cutoff: 1500, leadGain: 0.12, drone: false },
  // warm major, a touch slower
  2: { root: 123.47, scale: [0, 2, 3, 5, 7, 10], tempo: 0.66, padType: "triangle", leadType: "sine", cutoff: 1200, leadGain: 0.1, drone: false },
  // dorian, rain
  3: { root: 110.0, scale: [0, 2, 3, 5, 7, 8, 10], tempo: 0.72, padType: "sawtooth", leadType: "triangle", cutoff: 900, leadGain: 0.09, drone: false },
  // minor, tense
  4: { root: 98.0, scale: [0, 2, 3, 5, 7, 8], tempo: 0.8, padType: "sawtooth", leadType: "triangle", cutoff: 680, leadGain: 0.08, drone: true },
  // phrygian drone, blackout
  5: { root: 87.31, scale: [0, 1, 3, 5, 6, 8], tempo: 0.9, padType: "sawtooth", leadType: "sine", cutoff: 520, leadGain: 0.07, drone: true },
  // resolve
  6: { root: 116.54, scale: [0, 2, 4, 7, 9], tempo: 0.7, padType: "triangle", leadType: "sine", cutoff: 1100, leadGain: 0.1, drone: false },
};

export class AudioEngine {
  private ac: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode; // soundtrack and rain
  private musicGain!: GainNode;
  private rainGain!: GainNode;
  private ambGain!: GainNode; // the room: server hum, a keyboard, the harbor
  private windGain!: GainNode;
  private chapter: Chapter = 0;
  private nextKeys = 0;
  private nextHorn = 0;
  private sfxGain!: GainNode; // clicks, chimes and thunder
  private started = false;
  private muted = false;
  private musicVolume = 0.7;
  private effectsVolume = 0.7;
  private palette: Palette = PALETTES[0];
  private step = 0;
  private nextTime = 0;
  private timer = 0;

  get isMuted(): boolean {
    return this.muted;
  }

  /** Must be called from a user gesture (browsers block audio otherwise). */
  init(): void {
    if (this.ac) {
      if (this.ac.state === "suspended") void this.ac.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ac = new Ctx();
    this.master = this.ac.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ac.destination);

    this.musicBus = this.ac.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);

    this.musicGain = this.ac.createGain();
    this.musicGain.gain.value = 0.9;
    this.musicGain.connect(this.musicBus);

    this.rainGain = this.ac.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.connect(this.musicBus);
    this.startRain();

    this.ambGain = this.ac.createGain();
    this.ambGain.gain.value = 0;
    this.ambGain.connect(this.musicBus);
    this.windGain = this.ac.createGain();
    this.windGain.gain.value = 0;
    this.windGain.connect(this.musicBus);
    this.startRoom();

    this.sfxGain = this.ac.createGain();
    this.sfxGain.gain.value = this.effectsVolume;
    this.sfxGain.connect(this.master);
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.ac) this.musicBus.gain.setTargetAtTime(this.musicVolume, this.ac.currentTime, 0.1);
  }

  setEffectsVolume(v: number): void {
    this.effectsVolume = Math.max(0, Math.min(1, v));
    if (this.ac) this.sfxGain.gain.setTargetAtTime(this.effectsVolume, this.ac.currentTime, 0.05);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ac) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ac.currentTime, 0.05);
  }

  startMusic(): void {
    if (!this.ac || this.started) return;
    this.started = true;
    this.nextTime = this.ac.currentTime + 0.1;
    const schedule = (): void => {
      if (!this.ac) return;
      while (this.nextTime < this.ac.currentTime + 0.3) {
        this.scheduleStep(this.nextTime);
        this.nextTime += this.palette.tempo;
        this.step++;
      }
      this.ambience();
    };
    // the room fades in with the music, so the title screen stays quiet
    this.ambGain.gain.setTargetAtTime(1, this.ac.currentTime, 1.5);
    this.nextKeys = this.ac.currentTime + 2;
    this.nextHorn = this.ac.currentTime + 20 + Math.random() * 30;
    this.timer = window.setInterval(schedule, 110);
  }

  stopMusic(): void {
    clearInterval(this.timer);
    this.started = false;
    if (this.ac) this.ambGain.gain.setTargetAtTime(0, this.ac.currentTime, 0.4);
  }

  setChapter(ch: Chapter): void {
    this.palette = PALETTES[ch];
    this.chapter = ch;
    if (this.ac) {
      // the wind gets up with the gale and howls through the storm
      this.windGain.gain.setTargetAtTime(ch === 5 ? 0.22 : ch === 4 ? 0.12 : ch === 3 ? 0.04 : 0, this.ac.currentTime, 1.5);
      const rainTarget = ch >= 5 ? 0.5 : ch >= 4 ? 0.4 : ch >= 3 ? 0.28 : ch >= 2 ? 0.12 : 0;
      this.rainGain.gain.setTargetAtTime(rainTarget, this.ac.currentTime, 1.2);
    }
  }

  // ---- generative step ----
  private scheduleStep(t: number): void {
    if (!this.ac) return;
    const p = this.palette;

    // pad chord every 4 steps
    if (this.step % 4 === 0) {
      const degrees = [0, 2, 4];
      degrees.forEach((d, i) => {
        const n = p.scale[d % p.scale.length] + (d >= p.scale.length ? 12 : 0);
        this.voice(semitone(p.root, n), t, p.tempo * 4.2, p.padType, 0.05, p.cutoff);
        void i;
      });
      if (p.drone) this.voice(p.root / 2, t, p.tempo * 4.2, "sine", 0.06, 300);
    }

    // sparse lead, pentatonic walk, skips some steps for space
    if (this.step % 2 === 0 && Math.random() > 0.35) {
      const idx = Math.floor(Math.random() * p.scale.length);
      const oct = Math.random() > 0.6 ? 12 : 0;
      const freq = semitone(p.root, p.scale[idx] + 12 + oct);
      this.voice(freq, t + 0.02, p.tempo * 1.4, p.leadType, p.leadGain, p.cutoff * 1.6, true);
    }

    // soft tick on the beat for cozy chapters
    if (!p.drone && this.step % 4 === 2) this.blip(1200, t, 0.03, 0.015, "square");
  }

  private voice(freq: number, t: number, dur: number, type: OscillatorType, gain: number, cutoff: number, pluck = false): void {
    if (!this.ac) return;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    const f = this.ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    o.type = type;
    o.frequency.value = freq;
    // gentle detune for warmth
    o.detune.value = (Math.random() - 0.5) * 6;
    const attack = pluck ? 0.01 : 0.4;
    const release = pluck ? dur * 0.6 : dur * 0.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    o.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + release + 0.05);
  }

  // ---- rain as filtered noise ----
  private startRain(): void {
    if (!this.ac) return;
    const len = 2 * this.ac.sampleRate;
    const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = this.ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1400;
    f.Q.value = 0.4;
    src.connect(f);
    f.connect(this.rainGain);
    src.start();
  }

  // ---- the room ----
  /** Looping noise through a filter: the raw material for hum and wind. */
  private noiseLoop(seconds: number): AudioBufferSourceNode {
    const ac = this.ac!;
    const len = Math.floor(seconds * ac.sampleRate);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  private startRoom(): void {
    if (!this.ac) return;
    const ac = this.ac;
    // the server rack: mains hum, its octave, and fan noise on top
    for (const [freq, gain] of [[60, 0.022], [120, 0.012], [180, 0.004]] as const) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(this.ambGain);
      o.start();
    }
    const fan = this.noiseLoop(2);
    const fanBand = ac.createBiquadFilter();
    fanBand.type = "bandpass";
    fanBand.frequency.value = 420;
    fanBand.Q.value = 0.8;
    const fanGain = ac.createGain();
    fanGain.gain.value = 0.012;
    fan.connect(fanBand);
    fanBand.connect(fanGain);
    fanGain.connect(this.ambGain);
    fan.start();

    // wind: noise through a narrow filter whose pitch wanders slowly
    const wind = this.noiseLoop(3);
    const band = ac.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 340;
    band.Q.value = 3.5;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = ac.createGain();
    depth.gain.value = 190;
    lfo.connect(depth);
    depth.connect(band.frequency);
    wind.connect(band);
    band.connect(this.windGain);
    wind.start();
    lfo.start();
  }

  /** Now and then: someone typing across the room, and a horn out in the harbor. */
  private ambience(): void {
    if (!this.ac) return;
    const now = this.ac.currentTime;
    if (now >= this.nextKeys) {
      // a burst of keys, uneven the way real typing is
      const keys = 4 + Math.floor(Math.random() * 14);
      let t = now + 0.05;
      for (let i = 0; i < keys; i++) {
        this.keyTick(t, 0.008 + Math.random() * 0.008);
        t += 0.07 + Math.random() * 0.12 + (Math.random() > 0.85 ? 0.25 : 0);
      }
      this.nextKeys = t + 2 + Math.random() * 7;
    }
    if (now >= this.nextHorn) {
      // fair weather has no need of a foghorn
      if (this.chapter >= 2) this.foghorn(now + 0.1);
      this.nextHorn = now + 45 + Math.random() * 50;
    }
  }

  private keyTick(t: number, gain: number): void {
    if (!this.ac) return;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    const f = this.ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1800 + Math.random() * 1400;
    f.Q.value = 1.2;
    o.type = "square";
    o.frequency.value = 140 + Math.random() * 60;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(f);
    f.connect(g);
    g.connect(this.ambGain);
    o.start(t);
    o.stop(t + 0.05);
  }

  private foghorn(t: number): void {
    if (!this.ac) return;
    for (const [freq, at, dur] of [[98, 0, 2.2], [73.4, 2.4, 3]] as const) {
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      const f = this.ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 320;
      o.type = "sawtooth";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.03, t + at + 0.5);
      g.gain.setValueAtTime(0.03, t + at + dur - 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(f);
      f.connect(g);
      g.connect(this.ambGain);
      o.start(t + at);
      o.stop(t + at + dur + 0.05);
    }
  }

  // ---- UI sound effects ----
  private blip(freq: number, t: number, dur: number, gain: number, type: OscillatorType = "sine"): void {
    if (!this.ac) return;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private now(): number {
    return this.ac ? this.ac.currentTime : 0;
  }

  click(): void {
    this.blip(420, this.now(), 0.05, 0.08, "triangle");
  }
  type(): void {
    if (Math.random() > 0.5) this.blip(900 + Math.random() * 300, this.now(), 0.02, 0.02, "square");
  }
  correct(): void {
    const t = this.now();
    this.blip(523, t, 0.12, 0.09, "triangle");
    this.blip(784, t + 0.09, 0.16, 0.08, "triangle");
  }
  wrong(): void {
    const t = this.now();
    this.blip(180, t, 0.18, 0.1, "sawtooth");
    this.blip(140, t + 0.1, 0.22, 0.09, "sawtooth");
  }
  notify(): void {
    const t = this.now();
    this.blip(680, t, 0.08, 0.06, "sine");
    this.blip(1020, t + 0.07, 0.1, 0.05, "sine");
  }
  rankUp(): void {
    const t = this.now();
    [523, 659, 784, 1047].forEach((f, i) => this.blip(f, t + i * 0.1, 0.18, 0.09, "triangle"));
  }
  /** A rubber stamp coming down on the case file. */
  stamp(bad = false): void {
    if (!this.ac) return;
    const t = this.now() + 0.16; // lands with the animation
    const len = Math.floor(0.12 * this.ac.sampleRate);
    const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    const f = this.ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 700;
    const g = this.ac.createGain();
    g.gain.value = 0.5;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    this.blip(bad ? 70 : 95, t, 0.16, 0.2, "sine");
  }
  /** Thunder after a lightning strike. Closer storms crack first and roll louder. */
  thunder(strength = 1): void {
    if (!this.ac || this.muted) return;
    const t = this.now();
    const k = Math.max(0.2, Math.min(1, strength));
    const dur = 1.4 + (1 - k) * 1.2;
    const len = Math.floor(dur * this.ac.sampleRate);
    const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const d = buf.getChannelData(0);
    // brown-ish noise with a slow wobble, so it rolls instead of hissing
    let last = 0;
    const rate = (3 + Math.random() * 4) * 2 * Math.PI;
    for (let i = 0; i < len; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.08) * 0.995;
      const wobble = 0.6 + 0.4 * Math.sin((i / this.ac.sampleRate) * rate);
      d[i] = last * 6 * wobble * (1 - i / len);
    }
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    const f = this.ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 160 + k * 160;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * k, t + 0.08 + (1 - k) * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    // a near strike starts with a sharp crack
    if (k > 0.7) {
      const crack = this.ac.createBufferSource();
      const cl = Math.floor(0.25 * this.ac.sampleRate);
      const cb = this.ac.createBuffer(1, cl, this.ac.sampleRate);
      const cd = cb.getChannelData(0);
      for (let i = 0; i < cl; i++) cd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / cl, 3);
      crack.buffer = cb;
      const hf = this.ac.createBiquadFilter();
      hf.type = "highpass";
      hf.frequency.value = 900;
      const cg = this.ac.createGain();
      cg.gain.value = 0.12 * k;
      crack.connect(hf);
      hf.connect(cg);
      cg.connect(this.sfxGain);
      crack.start(t);
    }
  }
}

export const audio = new AudioEngine();
