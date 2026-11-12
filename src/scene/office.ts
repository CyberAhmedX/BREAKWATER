import type { Chapter } from "../engine/types";
import { MOODS, type Mood } from "./mood";
import { LOOKS, type Look } from "./portraits";

// A hand-built pixel office rendered on a canvas. No sprite assets: everything
// is drawn from rectangles so it ships inside the single HTML file and scales
// cleanly. The scene reacts to the chapter mood (rain, lightning, darkness).

interface Drop {
  x: number;
  y: number;
  len: number;
  spd: number;
}

const VW = 320; // virtual pixel width
const VH = 180; // virtual pixel height

// The window onto the harbor. Weather stays on the far side of the glass.
const WIN = { x: 150, y: 14, w: 120, h: 70 };

// The things on and around your desk that do something when used, in virtual
// coordinates. The desk screen lays real buttons over these.
export type OfficeObject = "tickets" | "alerts" | "board";
const OBJECTS: Record<OfficeObject, { x: number; y: number; w: number; h: number }> = {
  tickets: { x: 128, y: 82, w: 26, h: 18 },
  alerts: { x: 158, y: 86, w: 20, h: 14 },
  board: { x: 16, y: 20, w: 60, h: 42 },
};

// Clickable bits of the office, in virtual coordinates, each with a line of
// flavor. Rectangles match what draw() lays down (corkboard, window, plant,
// server rack, the cat).
const HOTSPOTS: { x: number; y: number; w: number; h: number; text: string }[] = [
  { x: 16, y: 20, w: 60, h: 42, text: "Juno's red-string board: half real cases, half a map of who still owes the coffee fund." },
  { x: 150, y: 14, w: 120, h: 70, text: "The lighthouse runs its own generator. Priya swears it has better uptime than half the town's servers." },
  { x: 286, y: 40, w: 26, h: 72, text: "The server rack hums day and night, the only thing in Port Halden that never sleeps." },
  { x: 288, y: 88, w: 16, h: 30, text: "Theo's desk fern has outlived three interns and one incident response plan." },
  { x: 170, y: 144, w: 30, h: 24, text: "Packet, Chief Morale Officer. Walks on keyboards and accepts bribes in tuna." },
];

// The people you share the room with. One works at the other desk, and one is
// usually on their feet by the window. Each answers a click with a line.
const COWORKER_LINES: Record<string, string> = {
  mags: "Mags has three dashboards open and trusts none of them.",
  theo: "Theo is on his fourth coffee and his fortieth password reset.",
  priya: "Priya watches packet captures scroll the way other people watch the sea.",
  imani: "Dr. Vance labels everything. The stapler has a chain of custody.",
  rook: "Rook says the hood helps with thinking. Nobody has asked twice.",
  juno: "Juno is adding string to the board. It is hard to tell if that is a good sign.",
};
const SEAT = { x: 61, y: 78, w: 16, h: 18 }; // behind the left desk
const STAND = { x: 258, y: 82, w: 14, h: 38 }; // by the window

export class OfficeScene {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private drops: Drop[] = [];
  private mood: Mood = MOODS[0];
  private t = 0;
  private strike = 9; // seconds since the last lightning strike
  private bolt: [number, number][] = []; // the last strike's path, in window space
  private nextBolt = 3;
  private alertsWaiting = false;
  private seated: string | null = null;
  private standing: string | null = null;
  private reduced: boolean;
  private scale = 1;
  private offX = 0;
  private offY = 0;
  /** Called on every lightning strike, so the soundtrack can answer it with thunder. */
  onStrike: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize();
    for (let i = 0; i < 160; i++) this.drops.push(this.newDrop(true));
    addEventListener("resize", this.resize);
  }

  /** null follows the system setting. */
  setReducedMotion(on: boolean | null): void {
    this.reduced = on ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (this.reduced) this.strike = 9;
  }

  /** Who is in the room: at the other desk, and on their feet. Null for nobody. */
  setCast(seated: string | null, standing: string | null): void {
    this.seated = seated;
    this.standing = standing;
  }

  /** Whether the alert screen on your desk has something waiting on it. */
  setAlertsWaiting(on: boolean): void {
    this.alertsWaiting = on;
  }

  /** Where an object sits on the page, in CSS pixels, for laying a button over it. */
  rectOf(name: OfficeObject): { left: number; top: number; width: number; height: number } {
    const o = OBJECTS[name];
    const r = this.canvas.getBoundingClientRect();
    const k = r.width / (this.canvas.width || 1);
    return {
      left: r.left + (this.offX + o.x * this.scale) * k,
      top: r.top + (this.offY + o.y * this.scale) * k,
      width: o.w * this.scale * k,
      height: o.h * this.scale * k,
    };
  }

  setChapter(ch: Chapter): void {
    this.mood = MOODS[ch];
  }

  /** The flavor line for a bit of office furniture at this screen point, if any. */
  inspect(clientX: number, clientY: number): string | null {
    const r = this.canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const cx = (clientX - r.left) * (this.canvas.width / r.width);
    const cy = (clientY - r.top) * (this.canvas.height / r.height);
    const vx = (cx - this.offX) / this.scale;
    const vy = (cy - this.offY) / this.scale;
    const within = (h: { x: number; y: number; w: number; h: number }): boolean => vx >= h.x && vx <= h.x + h.w && vy >= h.y && vy <= h.y + h.h;
    if (this.seated && within(SEAT)) return COWORKER_LINES[this.seated] ?? null;
    if (this.standing && within(STAND)) return COWORKER_LINES[this.standing] ?? null;
    const hit = HOTSPOTS.find(within);
    return hit ? hit.text : null;
  }

  start(): void {
    if (this.raf) return;
    let last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    removeEventListener("resize", this.resize);
  }

  private resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.scale = Math.max(this.canvas.width / VW, this.canvas.height / VH);
    this.offX = (this.canvas.width - VW * this.scale) / 2;
    this.offY = (this.canvas.height - VH * this.scale) / 2;
  };

  // Rain lives in the window's own space: it falls outside, past the glass.
  private newDrop(seed = false): Drop {
    return {
      x: Math.random() * (WIN.w + 30),
      y: seed ? Math.random() * WIN.h : -8,
      len: 3 + Math.random() * 5,
      spd: 110 + Math.random() * 90,
    };
  }

  private update(dt: number): void {
    this.t += dt;
    this.strike += dt;
    // Strikes keep their rhythm with reduced motion on, so the thunder still
    // rolls in; only the flash on screen is left out.
    if (this.mood.lightning) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        if (!this.reduced) {
          this.strike = 0;
          this.bolt = this.newBolt();
        }
        this.nextBolt = 4 + Math.random() * 7;
        this.onStrike?.();
      }
    }
    if (this.reduced) return;
    const active = Math.floor(this.drops.length * this.mood.rain);
    for (let i = 0; i < active; i++) {
      const d = this.drops[i];
      d.y += d.spd * dt;
      d.x -= d.spd * 0.3 * dt;
      if (d.y > WIN.h + 8) Object.assign(d, this.newDrop());
    }
  }

  /** A jagged path from the top of the window down toward the sea. */
  private newBolt(): [number, number][] {
    let x = 12 + Math.random() * (WIN.w - 50);
    const pts: [number, number][] = [[x, 0]];
    for (let y = 6; y < WIN.h - 22; y += 5 + Math.random() * 5) {
      x += (Math.random() - 0.5) * 12;
      pts.push([x, y]);
    }
    return pts;
  }

  /** How bright the lightning is right now, 0 to 1: a hard flash, a stutter, then a fade. */
  private flashNow(): number {
    const s = this.strike;
    if (s < 0.07) return 1;
    if (s < 0.13) return 0.25;
    if (s < 0.2) return 0.85;
    return s < 0.7 ? 0.85 * (1 - (s - 0.2) / 0.5) : 0;
  }

  // ---- pixel helpers (virtual coordinates) ----
  private px(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      Math.round(this.offX + x * this.scale),
      Math.round(this.offY + y * this.scale),
      Math.ceil(w * this.scale),
      Math.ceil(h * this.scale),
    );
  }

  private sx(x: number): number {
    return this.offX + x * this.scale;
  }
  private sy(y: number): number {
    return this.offY + y * this.scale;
  }

  /** A soft round pool of light, centred on a virtual point. */
  private glow(x: number, y: number, radius: number, rgb: string, alpha: number): void {
    if (alpha <= 0) return;
    const c = this.ctx;
    const g = c.createRadialGradient(this.sx(x), this.sy(y), 0, this.sx(x), this.sy(y), radius * this.scale);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.fillRect(this.sx(x - radius), this.sy(y - radius), radius * 2 * this.scale, radius * 2 * this.scale);
  }

  /** Light from the window lying across the floor. */
  private floorLight(rgb: string, alpha: number): void {
    if (alpha <= 0) return;
    const c = this.ctx;
    const g = c.createLinearGradient(0, this.sy(118), 0, this.sy(VH));
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(this.sx(WIN.x + 6), this.sy(118));
    c.lineTo(this.sx(WIN.x + WIN.w - 6), this.sy(118));
    c.lineTo(this.sx(WIN.x + WIN.w - 46), this.sy(VH));
    c.lineTo(this.sx(WIN.x - 70), this.sy(VH));
    c.closePath();
    c.fill();
  }

  private draw(): void {
    const c = this.ctx;
    const m = this.mood;
    const flash = this.flashNow();
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // beyond the edges of the room
    c.fillStyle = m.room;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // back wall
    this.px(0, 0, VW, 118, m.room);
    // floor
    this.px(0, 118, VW, VH - 118, m.floor);
    // floor seam
    this.px(0, 118, VW, 2, "rgba(0,0,0,0.18)");

    this.drawWindow(flash);
    // daylight on the floor: strong on a fair morning, gone by the storm
    this.floorLight("255,244,214", 0.16 * (1 - Math.min(1, m.ambient * 1.6)));
    this.drawCorkboard(16, 20);
    this.drawPlant(292, 92);
    if (this.standing) this.drawStanding(LOOKS[this.standing] ?? LOOKS.you);
    if (this.seated) this.drawSeated(LOOKS[this.seated] ?? LOOKS.you);
    this.drawDesk(26, 96, false);
    this.drawDesk(120, 102, true);
    this.drawServerRack(286, 40);
    if (m.emergency) this.px(104, 6, 8, 5, "#3a1418"); // the beacon's housing
    this.drawCat(176, 150, this.t);

    // the room goes dark with the weather
    if (m.ambient > 0) {
      c.fillStyle = `rgba(6,8,16,${m.ambient})`;
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // what little light the storm sky has still comes in at the window, so
    // the room keeps its shapes even at its darkest
    if (m.ambient > 0.3) {
      this.glow(WIN.x + WIN.w / 2, WIN.y + WIN.h, 150, "120,150,205", 0.16 * m.ambient);
      this.floorLight("120,150,205", 0.12 * m.ambient);
    }

    // ...and everything that makes its own light comes back through it
    this.drawLights(flash);

    // soft vignette
    const v = c.createRadialGradient(
      this.canvas.width / 2,
      this.canvas.height / 2,
      this.canvas.height * 0.25,
      this.canvas.width / 2,
      this.canvas.height / 2,
      this.canvas.height * 0.75,
    );
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${0.25 + m.ambient * 0.3})`);
    c.fillStyle = v;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Screens, lamps, status lights, the emergency beacon and lightning. Drawn over the dark. */
  private drawLights(flash: number): void {
    const c = this.ctx;
    const m = this.mood;
    const dark = m.ambient;

    // desk lamps: steady, until the power goes and they gutter
    let lamp = m.lampWarm;
    if (m.emergency) lamp = this.reduced ? 0.4 : 0.4 + 0.25 * Math.max(0, Math.sin(this.t * 23) * Math.sin(this.t * 3.1));
    if (lamp > 0) {
      for (const [bx, by] of [[82, 82], [176, 88]] as const) {
        c.save();
        c.globalAlpha = Math.min(1, lamp + 0.2);
        this.px(bx + 1, by + 1, 4, 3, "#ffd27a");
        c.restore();
        this.glow(bx + 3, by + 10, 46, "255,205,120", 0.3 * lamp);
      }
    }

    // screens stay lit, and throw their colour on the desk
    if (dark > 0.15) {
      this.drawScreens();
      this.glow(47, 88, 30, "70,200,190", 0.22 * dark);
      this.glow(141, 93, 34, "70,200,190", 0.3 * dark);
      this.glow(168, 95, 22, this.alertGlow(), 0.3 * dark);
      this.drawRackLeds(286, 40);
      this.glow(305, 76, 26, "89,217,138", 0.1 * dark);
      // the cat is watching
      this.px(194, 152, 1, 1, "#b8f5cf");
    }

    // the finale: mains power is gone and a red beacon turns on the wall
    if (m.emergency) {
      const turn = this.reduced ? 0.6 : Math.pow(0.5 + 0.5 * Math.sin(this.t * 3.2), 2);
      c.fillStyle = `rgba(170,24,38,${0.07 + 0.13 * turn})`;
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.px(105, 7, 6, 3, turn > 0.5 ? "#ff5a5f" : "#a3262d");
      this.glow(108, 9, 150, "235,45,60", 0.1 + 0.4 * turn);
      this.glow(108, 9, 16, "255,150,150", 0.25 + 0.5 * turn);
    }

    // lightning: the window blazes, light falls across the floor, the room lifts
    if (flash > 0) {
      c.fillStyle = `rgba(214,228,255,${flash * 0.55})`;
      c.fillRect(this.sx(WIN.x), this.sy(WIN.y), WIN.w * this.scale, WIN.h * this.scale);
      this.floorLight("200,220,255", flash * 0.5);
      this.glow(WIN.x + WIN.w / 2, WIN.y + WIN.h / 2, 190, "190,212,255", flash * 0.3);
      c.fillStyle = `rgba(200,220,255,${flash * 0.1})`;
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
      // the frame stands black against it
      this.drawWindowFrame(`rgba(10,12,18,${Math.min(1, flash * 1.4)})`);
    }
  }

  private alertGlow(): string {
    return this.alertsWaiting ? "255,170,70" : "200,130,70";
  }

  private drawWindow(flash: number): void {
    const c = this.ctx;
    const m = this.mood;
    const { x, y, w, h } = WIN;
    const t = this.reduced ? 0 : this.t;
    this.px(x - 3, y - 3, w + 6, h + 6, "#8a7a63"); // frame

    c.save();
    c.beginPath();
    c.rect(this.sx(x), this.sy(y), w * this.scale, h * this.scale);
    c.clip();

    const sky = c.createLinearGradient(0, this.sy(y), 0, this.sy(y + h));
    sky.addColorStop(0, m.sky[0]);
    sky.addColorStop(1, m.sky[1]);
    c.fillStyle = sky;
    c.fillRect(this.sx(x), this.sy(y), w * this.scale, h * this.scale);

    // cloud banks roll in as the weather turns
    if (m.rain > 0.1) {
      const shade = `rgba(8,12,20,${0.05 + m.rain * 0.09})`;
      for (let i = 0; i < 7; i++) {
        const span = w + 140;
        const cx = ((i * 47 + t * (2 + (i % 4))) % span) - 70;
        const cy = y + ((i * 5) % 16);
        // each bank is a few long strips, stepped like a pixel cloud
        this.px(x + cx, cy + 2, 70 + ((i * 13) % 30), 3, shade);
        this.px(x + cx + 10, cy, 44 + ((i * 7) % 20), 3, shade);
        this.px(x + cx + 6, cy + 4, 52, 2, shade);
      }
    }

    // the bolt itself, for the first instant of a strike
    if (flash > 0 && this.strike < 0.2 && this.bolt.length > 1) {
      c.strokeStyle = "rgba(240,246,255,0.95)";
      c.lineWidth = Math.max(1.5, this.scale * 0.8);
      c.lineJoin = "miter";
      c.beginPath();
      this.bolt.forEach(([bx, by], i) => (i ? c.lineTo(this.sx(x + bx), this.sy(y + by)) : c.moveTo(this.sx(x + bx), this.sy(y + by))));
      c.stroke();
    }

    // the sea: flat on a fair day, heaving in a gale
    const swell = m.rain * 3;
    this.px(x, y + h - 20 - swell, w, 20 + swell, "rgba(40,70,90,0.55)");
    for (let row = 0; row < 4; row++) {
      const wy = y + h - 17 - swell + row * 5;
      for (let i = 0; i < 6; i++) {
        const wx = ((i * 23 + row * 9 + t * (4 + row * 2) * (0.4 + m.rain)) % (w + 20)) - 10;
        this.px(x + wx, wy + Math.sin(t * 1.3 + i + row) * swell * 0.4, 7 + (i % 3) * 2, 1, `rgba(220,235,245,${0.1 + m.rain * 0.18})`);
      }
    }

    this.drawLighthouse();

    // rain, on the far side of the glass
    if (!this.reduced && m.rain > 0) {
      c.strokeStyle = `rgba(190,210,230,${0.3 + m.rain * 0.3})`;
      c.lineWidth = Math.max(1, this.scale * 0.35);
      c.beginPath();
      const active = Math.floor(this.drops.length * m.rain);
      for (let i = 0; i < active; i++) {
        const d = this.drops[i];
        c.moveTo(this.sx(x + d.x), this.sy(y + d.y));
        c.lineTo(this.sx(x + d.x - d.len * 0.4), this.sy(y + d.y + d.len));
      }
      c.stroke();
    }
    // and beads of it running down the pane
    if (m.rain > 0.4) {
      for (let i = 0; i < 7; i++) {
        const bx = (i * 37 + 11) % w;
        const by = ((i * 29 + t * (5 + (i % 3) * 3)) % (h + 12)) - 6;
        this.px(x + bx, y + by, 1, 4 + (i % 3), "rgba(220,235,250,0.28)");
      }
    }
    c.restore();

    this.drawWindowFrame("#6f6250");
  }

  private drawWindowFrame(color: string): void {
    const { x, y, w, h } = WIN;
    this.px(x + w / 2 - 1, y, 2, h, color);
    this.px(x, y + h / 2 - 1, w, 2, color);
  }

  private drawLighthouse(): void {
    // on the horizon through the window
    const bx = 240;
    this.px(bx, 40, 6, 30, "#e8e4dc");
    this.px(bx, 46, 6, 4, "#c63b3b");
    this.px(bx + 1, 34, 4, 6, "#394049");
    // the lamp turns: the beam swings one way, then the other, and is
    // brightest when the weather is worst
    const dark = this.mood.ambient;
    const sweep = this.reduced ? 0.4 : Math.sin(this.t * 0.6);
    const c = this.ctx;
    c.save();
    c.globalAlpha = 0.12 + dark * 0.5;
    c.fillStyle = "rgba(255,240,200,1)";
    const ox = this.sx(bx + 3);
    const oy = this.sy(37);
    const reach = 70 * sweep;
    c.beginPath();
    c.moveTo(ox, oy);
    c.lineTo(ox + reach * this.scale, oy - (6 + Math.abs(reach) * 0.16) * this.scale);
    c.lineTo(ox + reach * this.scale, oy + (6 + Math.abs(reach) * 0.16) * this.scale);
    c.closePath();
    c.fill();
    c.restore();
    this.px(bx + 2, 36, 2, 2, "#fff3c4");
    this.glow(bx + 3, 37, 9, "255,236,180", 0.25 + dark * 0.5);
  }

  private drawCorkboard(x: number, y: number): void {
    this.px(x, y, 60, 42, "#b9894f");
    this.px(x + 2, y + 2, 56, 38, "#c99a5e");
    // pinned notes
    const notes = [
      [4, 4, 16, 12, "#f4efe0"],
      [24, 6, 14, 10, "#dfe9f0"],
      [8, 20, 18, 12, "#f0e3d0"],
      [32, 22, 16, 12, "#e7f0df"],
    ] as const;
    for (const [nx, ny, nw, nh, col] of notes) {
      this.px(x + nx, y + ny, nw, nh, col as string);
      this.px(x + nx + (nw as number) / 2 - 1, y + ny - 1, 2, 2, "#c0392b");
    }
    // red string between two notes
    this.ctx.strokeStyle = "rgba(180,40,40,0.8)";
    this.ctx.lineWidth = Math.max(1, this.scale * 0.5);
    this.ctx.beginPath();
    this.ctx.moveTo(this.offX + (x + 12) * this.scale, this.offY + (y + 10) * this.scale);
    this.ctx.lineTo(this.offX + (x + 40) * this.scale, this.offY + (y + 28) * this.scale);
    this.ctx.stroke();
  }

  private drawPlant(x: number, y: number): void {
    this.px(x, y + 16, 12, 10, "#b5652f"); // pot
    this.px(x + 2, y, 3, 18, "#3f7d44");
    this.px(x + 5, y - 2, 3, 20, "#4b9150");
    this.px(x + 8, y + 2, 3, 16, "#3f7d44");
  }

  private drawDesk(x: number, y: number, hasMonitorTwo: boolean): void {
    // desk top
    this.px(x, y, 70, 6, "#7a5a3c");
    this.px(x, y + 6, 70, 18, "#5f4630");
    // legs
    this.px(x + 2, y + 24, 4, 14, "#4a371f");
    this.px(x + 64, y + 24, 4, 14, "#4a371f");
    // monitor
    this.px(x + 8, y - 20, 26, 18, "#2b2f36");
    this.px(x + 19, y - 2, 4, 4, "#2b2f36");
    this.px(x + 14, y + 2, 14, 2, "#2b2f36");
    if (hasMonitorTwo) this.px(x + 38, y - 16, 20, 14, "#2b2f36");
    // desk lamp (its bulb is lit in drawLights)
    this.px(x + 58, y - 14, 2, 14, "#3b3f45");
    this.px(x + 56, y - 16, 6, 3, "#3b3f45");
    // coffee mug
    this.px(x + 2, y - 4, 5, 4, "#d8d2c6");
    this.drawScreen(x + 10, y - 18);
    if (hasMonitorTwo) this.drawAlertScreen(x + 40, y - 14);
  }

  /** Both desks' screens again, at full brightness, once the room is dark. */
  private drawScreens(): void {
    this.drawScreen(36, 78);
    this.drawScreen(130, 84);
    this.drawAlertScreen(160, 88);
  }

  private drawScreen(x: number, y: number): void {
    this.px(x, y, 22, 14, "#2f8f88");
    // lines of a log, scrolling slowly
    const t = this.reduced ? 0 : Math.floor(this.t * 1.5);
    for (let i = 0; i < 5; i++) this.px(x + 2, y + 2 + i * 2.4, 6 + ((i * 5 + t * 3) % 12), 1, "rgba(215,255,248,0.5)");
  }

  /** Your second screen: quiet amber normally, blinking when alerts are waiting. */
  private drawAlertScreen(x: number, y: number): void {
    const blink = this.alertsWaiting && !this.reduced && Math.floor(this.t * 2) % 2 === 0;
    this.px(x, y, 16, 10, this.alertsWaiting ? (blink ? "#f0a23c" : "#b8641f") : "#8a5a2f");
    if (this.alertsWaiting) {
      this.px(x + 7, y + 2, 2, 4, "#2a1606");
      this.px(x + 7, y + 7, 2, 1, "#2a1606");
    } else {
      for (let i = 0; i < 3; i++) this.px(x + 2, y + 2 + i * 3, 8 + ((i * 3) % 5), 1, "rgba(255,225,180,0.4)");
    }
  }

  /** Hair, in the handful of shapes the portraits use, on a head at (x, y), 6 wide. */
  private drawHair(l: Look, x: number, y: number): void {
    const h = l.hair;
    switch (l.hairStyle) {
      case "hood":
        this.px(x - 2, y - 2, 10, 4, h);
        this.px(x - 2, y, 2, 8, h);
        this.px(x + 6, y, 2, 8, h);
        break;
      case "long":
        this.px(x - 1, y - 2, 8, 3, h);
        this.px(x - 1, y, 1, 9, h);
        this.px(x + 6, y, 1, 9, h);
        break;
      case "bun":
        this.px(x - 1, y - 2, 8, 3, h);
        this.px(x + 2, y - 4, 3, 2, h);
        break;
      case "cap":
        this.px(x - 1, y - 2, 8, 2, l.accent ?? h);
        this.px(x + 4, y, 4, 1, l.accent ?? h);
        break;
      case "bald":
        this.px(x - 1, y + 1, 1, 3, h);
        this.px(x + 6, y + 1, 1, 3, h);
        break;
      case "buzz":
        this.px(x, y - 1, 6, 2, h);
        break;
      default:
        this.px(x - 1, y - 2, 8, 3, h);
        this.px(x - 1, y, 1, 3, h);
        this.px(x + 6, y, 1, 3, h);
    }
  }

  private drawFace(l: Look, x: number, y: number, seed: number): void {
    this.px(x, y, 6, 7, l.skin);
    this.drawHair(l, x, y);
    // eyes, with a blink every few seconds
    const blink = !this.reduced && (this.t + seed) % 4.3 < 0.14;
    if (!blink) {
      this.px(x + 1, y + 3, 1, 1, "#1b1b22");
      this.px(x + 4, y + 3, 1, 1, "#1b1b22");
    }
    if (l.glasses) this.px(x, y + 3, 6, 1, "rgba(20,22,30,0.55)");
    if (l.headset) {
      this.px(x - 1, y + 2, 1, 4, "#14161c");
      this.px(x - 1, y + 6, 3, 1, "#14161c");
    }
  }

  /** Your team lead, at the other desk: head and shoulders over the desk top, typing. */
  private drawSeated(l: Look): void {
    const t = this.reduced ? 0 : this.t;
    // now and then they glance over at you
    const glance = Math.sin(t * 0.37) > 0.93 ? 1 : 0;
    const tap = Math.floor(t * 7) % 2;
    this.px(62, 84, 14, 14, "#262a31"); // chair back
    this.px(63, 89, 12, 8, l.shirt);
    if (l.accent) this.px(68, 89, 2, 8, l.accent);
    // forearms on the keyboard, one finger up at a time
    this.px(62, 94 - tap, 2, 2, l.skin);
    this.px(74, 93 + tap, 2, 2, l.skin);
    this.px(67, 87, 4, 2, l.skin); // neck
    this.drawFace(l, 66 + glance, 80, 1.3);
  }

  /** Someone on their feet by the window, with a mug. A different visitor each chapter. */
  private drawStanding(l: Look): void {
    const t = this.reduced ? 0 : this.t;
    const sway = Math.sin(t * 0.8) * 0.5;
    const sip = Math.sin(t * 0.21) > 0.9; // lifts the mug
    const x = 261 + sway;
    this.px(259, 118, 12, 2, "rgba(0,0,0,0.22)"); // shadow on the floor
    this.px(x + 1, 105, 3, 13, "#2a2f3a"); // legs
    this.px(x + 5, 105, 3, 13, "#2a2f3a");
    this.px(x, 116, 4, 2, "#17191f"); // shoes
    this.px(x + 5, 116, 4, 2, "#17191f");
    this.px(x, 91, 9, 14, l.shirt);
    if (l.accent) this.px(x + 4, 91, 2, 14, l.accent);
    this.px(x - 1, 92, 2, 9, l.shirt); // arm at the side
    // the other arm holds the mug, and lifts it to drink
    const my = sip ? 90 : 96;
    this.px(x + 8, 92, 2, sip ? 3 : 6, l.shirt);
    this.px(x + 8, my, 4, 3, "#e9e4d8");
    this.px(x + 3, 89, 3, 2, l.skin); // neck
    this.drawFace(l, x + 1.5, 82, 3.1);
  }

  private drawServerRack(x: number, y: number): void {
    this.px(x, y, 26, 72, "#23262c");
    for (let i = 0; i < 9; i++) this.px(x + 2, y + 3 + i * 7, 22, 5, "#2e333b");
    this.drawRackLeds(x, y);
  }

  private drawRackLeds(x: number, y: number): void {
    for (let i = 0; i < 9; i++) {
      // blinking status LEDs
      const on = (Math.floor(this.t * 2) + i) % 3 !== 0;
      this.px(x + 20, y + 4 + i * 7, 2, 2, on ? "#59d98a" : "#1d5a38");
      this.px(x + 17, y + 4 + i * 7, 2, 2, (i + Math.floor(this.t)) % 4 === 0 ? "#e2c34a" : "#5a4e1d");
    }
  }

  private drawCat(x: number, y: number, t: number): void {
    const breathe = Math.sin(t * 1.5) * 0.6;
    // curled on the floor
    this.px(x, y + 4 + breathe, 20, 10, "#3a3a40"); // body
    this.px(x + 16, y + breathe, 7, 7, "#3a3a40"); // head
    this.px(x + 17, y - 1 + breathe, 2, 3, "#3a3a40"); // ear
    this.px(x + 21, y - 1 + breathe, 2, 3, "#3a3a40"); // ear
    this.px(x + 18, y + 2 + breathe, 1, 1, "#9ad1b0"); // eye
    this.px(x - 3, y + 7 + breathe, 5, 3, "#3a3a40"); // tail
  }
}
