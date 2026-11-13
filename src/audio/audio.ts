import type { Chapter } from "../engine/types";

// Every sound in Breakwater is synthesized at runtime with the Web Audio API.
// Nothing is sampled or copied. Each chapter has its own piece of music,
// written here as plain data: a chord loop, a bass figure and a melody, with
// its own tempo, key and instruments. The pieces are original to this game.

type Note = number | null; // semitones above the song's root, or a rest

interface Song {
  name: string;
  step: number; // seconds per step
  bar: number; // steps in a bar
  root: number; // Hz
  chords: number[][]; // one per bar: semitones above the root, lowest first
  bass: Note[]; // one bar long, semitones above the chord's lowest note
  lead: Note[]; // the melody, as long as the whole loop
  padType: OscillatorType;
  leadType: OscillatorType;
  cutoff: number; // lowpass on the pad
  padGain: number;
  leadGain: number;
  bassGain: number;
  rest: number; // chance a melody note sits a pass out, so the loop breathes
  perc: "none" | "tick" | "brush" | "pulse" | "heart";
  arp?: boolean; // run up and down the chord under the melody
  drone?: boolean; // a low note held under everything
}

const semitone = (root: number, n: number): number => root * Math.pow(2, n / 12);
const _ = null;

const SONGS: Record<Chapter, Song> = {
  // Lobby, morning: a slow waltz in C lydian, all air and light
  0: {
    name: "Morning Tide",
    step: 0.3, bar: 6, root: 130.81,
    chords: [[0, 7, 16, 23], [2, 9, 18, 21], [-3, 4, 12, 19], [-5, 2, 11, 19]],
    bass: [0, _, _, _, _, _],
    lead: [19, _, 23, _, 28, _, 26, _, 21, _, 18, _, 24, _, 19, _, 16, _, 14, _, _, 19, _, _],
    padType: "triangle", leadType: "sine", cutoff: 1600, padGain: 0.04, leadGain: 0.1, bassGain: 0.06, rest: 0.1, perc: "none",
  },
  // Fair Weather: bright and busy, C major, a tune you could whistle
  1: {
    name: "Fair Weather",
    step: 0.27, bar: 8, root: 130.81,
    chords: [[0, 4, 7, 12], [7, 11, 14, 19], [9, 12, 16, 21], [5, 9, 12, 17]],
    bass: [0, _, _, 0, _, _, 7, _],
    lead: [16, _, 19, _, 24, _, 19, 16, 14, _, 19, _, 23, _, 19, _, 16, _, 21, _, 24, _, 21, 19, 17, _, 21, _, 19, 17, 16, _],
    padType: "triangle", leadType: "triangle", cutoff: 1500, padGain: 0.035, leadGain: 0.1, bassGain: 0.07, rest: 0.08, perc: "tick",
  },
  // Overcast: slower, B dorian, more space between the notes
  2: {
    name: "Overcast",
    step: 0.34, bar: 8, root: 123.47,
    chords: [[0, 3, 7, 10], [5, 9, 12, 15], [0, 3, 7, 10], [-2, 2, 5, 10]],
    bass: [0, _, _, _, 0, _, _, _],
    lead: [15, _, _, 14, _, 10, _, _, 12, _, _, 9, _, _, 7, _, 10, _, 14, _, 15, _, _, _, 14, _, _, 10, _, _, _, _],
    padType: "triangle", leadType: "sine", cutoff: 1200, padGain: 0.04, leadGain: 0.1, bassGain: 0.07, rest: 0.18, perc: "brush",
  },
  // Squall: A minor, a restless figure running under long held notes, like rain on the glass
  3: {
    name: "Squall",
    step: 0.2, bar: 8, root: 110.0,
    chords: [[0, 3, 7, 12], [-4, 0, 3, 8], [3, 7, 10, 15], [-2, 2, 5, 10]],
    bass: [0, _, _, _, _, _, 0, _],
    lead: [24, _, _, _, _, _, 22, _, 20, _, _, _, _, _, _, _, 19, _, _, _, 22, _, _, _, 17, _, _, _, _, _, 14, _],
    padType: "sawtooth", leadType: "triangle", cutoff: 900, padGain: 0.03, leadGain: 0.09, bassGain: 0.08, rest: 0.1, perc: "none", arp: true,
  },
  // Gale: G minor at a run, a bass that will not let up and a major chord that does not resolve
  4: {
    name: "Gale",
    step: 0.18, bar: 8, root: 98.0,
    chords: [[0, 3, 7, 12], [0, 3, 7, 10], [-4, 0, 3, 8], [-5, -1, 2, 7]],
    bass: [0, _, 0, _, 0, _, 0, 0],
    lead: [19, _, _, 22, _, 19, _, _, 24, _, _, 22, _, _, 19, _, 20, _, _, 24, _, 20, _, _, 18, _, _, _, 21, _, 18, _],
    padType: "sawtooth", leadType: "triangle", cutoff: 700, padGain: 0.03, leadGain: 0.085, bassGain: 0.09, rest: 0.06, perc: "pulse",
  },
  // Storm Surge: F phrygian, hardly a tune at all. A held low note, a heartbeat, and bells that do not agree with it
  5: {
    name: "Storm Surge",
    step: 0.45, bar: 8, root: 87.31,
    chords: [[0, 7, 12], [1, 8, 13], [0, 7, 12], [-2, 5, 10]],
    bass: [_, _, _, _, _, _, _, _],
    lead: [24, _, _, _, _, 25, _, _, _, _, _, _, _, _, _, _, 31, _, _, _, 30, _, _, _, _, _, 22, _, _, _, _, _],
    padType: "sawtooth", leadType: "sine", cutoff: 520, padGain: 0.035, leadGain: 0.07, bassGain: 0, rest: 0.25, perc: "heart", drone: true,
  },
  // After: B flat major, slow as a hymn, and it resolves
  6: {
    name: "After",
    step: 0.4, bar: 8, root: 116.54,
    chords: [[0, 4, 7, 12], [5, 9, 12, 16], [-3, 0, 4, 9], [-5, -1, 2, 7]],
    bass: [0, _, _, _, _, _, _, _],
    lead: [16, _, _, _, 19, _, _, _, 21, _, _, _, 17, _, _, _, 19, _, _, 16, _, _, 12, _, 14, _, _, _, _, _, _, _],
    padType: "triangle", leadType: "sine", cutoff: 1100, padGain: 0.04, leadGain: 0.1, bassGain: 0.07, rest: 0.05, perc: "none",
  },
};

/** The name of each chapter's piece, for the credits and the tests. */
export const SONG_NAMES: Record<Chapter, string> = Object.fromEntries(Object.entries(SONGS).map(([k, v]) => [k, v.name])) as Record<Chapter, string>;
/** The pieces themselves, read-only, so the tests can check they are well formed. */
export const SONG_DATA: Readonly<Record<Chapter, Readonly<Song>>> = SONGS;

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
  private song: Song = SONGS[0];
  private noise: AudioBuffer | null = null;
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
    // A limiter on the way out: in the storm the music, rain, wind and thunder
    // all sound at once, and together they must not clip.
    const limiter = this.ac.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 6;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    this.master.connect(limiter);
    limiter.connect(this.ac.destination);

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
        this.nextTime += this.song.step;
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
    const changed = SONGS[ch] !== this.song;
    this.song = SONGS[ch];
    this.chapter = ch;
    if (changed) {
      // A new chapter's piece starts from its first bar, after a breath of
      // silence. The old piece is faded right out first, so the last notes it
      // had already begun do not sound over the new one.
      this.step = 0;
      if (this.ac) {
        const now = this.ac.currentTime;
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setTargetAtTime(0, now, 0.08);
        this.musicGain.gain.setTargetAtTime(0.9, now + 0.7, 0.15);
        this.nextTime = now + 0.75;
      }
    }
    if (this.ac) {
      // the wind gets up with the gale and howls through the storm
      this.windGain.gain.setTargetAtTime(ch === 5 ? 0.22 : ch === 4 ? 0.12 : ch === 3 ? 0.04 : 0, this.ac.currentTime, 1.5);
      const rainTarget = ch >= 5 ? 0.5 : ch >= 4 ? 0.4 : ch >= 3 ? 0.28 : ch >= 2 ? 0.12 : 0;
      this.rainGain.gain.setTargetAtTime(rainTarget, this.ac.currentTime, 1.2);
    }
  }

  // ---- one step of the chapter's piece ----
  private scheduleStep(t: number): void {
    if (!this.ac) return;
    const s = this.song;
    const pos = this.step % (s.chords.length * s.bar);
    const inBar = pos % s.bar;
    const chord = s.chords[Math.floor(pos / s.bar)];
    const barLen = s.step * s.bar;

    // The chord, held for its own bar and no longer: it fades out as the next
    // one fades in, so two chords are never sounding over each other.
    if (inBar === 0) {
      for (const n of chord) this.voice(semitone(s.root, n), t, barLen * 0.82, barLen * 0.2, s.padType, s.padGain, s.cutoff, barLen * 0.18);
      if (s.drone) this.voice(s.root / 2, t, barLen * 0.9, barLen * 0.12, "sine", 0.06, 300, barLen * 0.1);
    }

    const b = s.bass[inBar];
    if (b !== null && s.bassGain > 0) this.voice(semitone(s.root, chord[0] + b), t, s.step * 0.9, s.step * 0.5, "triangle", s.bassGain, 420);

    // up and down the chord, an octave above it
    if (s.arp) {
      const tone = chord[[0, 1, 2, 1][inBar % 4] % chord.length] + 12;
      this.voice(semitone(s.root, tone), t, s.step * 0.5, s.step * 0.4, s.leadType, s.leadGain * 0.4, s.cutoff * 1.4);
    }

    // The melody is written out, but any note may sit a pass out. A note lasts
    // until the next one is due, then lets go.
    const n = s.lead[pos];
    if (n !== null && n !== undefined && Math.random() >= s.rest) {
      let gap = 1;
      while (gap < 4 && s.lead[(pos + gap) % s.lead.length] === null) gap++;
      this.voice(semitone(s.root, n), t + 0.01, s.step * gap * 0.8, s.step * 0.6, s.leadType, s.leadGain, s.cutoff * 1.8);
    }

    this.percussion(s.perc, inBar, t);
  }

  private percussion(kind: Song["perc"], inBar: number, t: number): void {
    const half = Math.floor(this.song.bar / 2);
    if (kind === "tick" && (inBar === 2 || inBar === 6)) this.tone(1200, 1200, t, 0.03, 0.014, "square");
    if (kind === "brush" && inBar === half) this.hiss(t, 0.09, 0.018);
    if (kind === "pulse" && (inBar === 0 || inBar === half)) this.tone(110, 46, t, 0.14, 0.11, "sine");
    if (kind === "pulse" && inBar % 2 === 1) this.hiss(t, 0.03, 0.008);
    if (kind === "heart" && inBar % 4 === 0) {
      this.tone(80, 42, t, 0.16, 0.1, "sine");
      this.tone(70, 40, t + 0.26, 0.14, 0.07, "sine");
    }
  }

  /** A short pitched hit on the music bus. The pitch can fall, for a drum. */
  private tone(from: number, to: number, t: number, dur: number, gain: number, type: OscillatorType): void {
    if (!this.ac) return;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** A soft burst of noise on the music bus, like a brush on a snare. */
  private hiss(t: number, dur: number, gain: number): void {
    if (!this.ac) return;
    if (!this.noise) {
      this.noise = this.ac.createBuffer(1, this.ac.sampleRate, this.ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = this.ac.createBufferSource();
    src.buffer = this.noise;
    const f = this.ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 4000;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  }

  /**
   * One note on the music bus: it swells for `attack`, holds until `hold`, and
   * is silent by `hold + release`. Every length is given by the caller, so a
   * note never rings on into music it does not belong to.
   */
  private voice(freq: number, t: number, hold: number, release: number, type: OscillatorType, gain: number, cutoff: number, attack = 0.01): void {
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
    const rise = Math.min(attack, hold * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + rise);
    g.gain.setValueAtTime(gain, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + hold + release);
    o.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + hold + release + 0.05);
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
