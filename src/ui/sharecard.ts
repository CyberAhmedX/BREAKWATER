import type { Ending } from "../engine/types";

// The share card: a 1200 x 630 image of how your run ended, the size social
// sites use for link previews. Drawn on a canvas in the browser, from the same
// fonts the game ships with, so nothing is uploaded anywhere.

export interface ShareInfo {
  ending: Ending;
  playerName: string;
  team: string;
  conduct: string;
  accuracy: number; // percent
  hard: boolean;
  extra: string; // one more line, like how many cases closed clean
}

const W = 1200;
const H = 630;

// sky colours per ending: the lighthouse is dawn, dead water is the red of the blackout
const SKY: Record<string, [string, string, string]> = {
  lighthouse: ["#1d2b4a", "#e9a86a", "#ffd79a"],
  crackedlens: ["#1b2236", "#6c7a96", "#c9b48a"],
  lowtide: ["#14283a", "#3f7b8c", "#a9d3cf"],
  keeper: ["#1a1a24", "#4b3f5c", "#b38f6a"],
  deadwater: ["#120708", "#5a1414", "#d4473b"],
};

export function shareFileName(ending: Ending, playerName: string): string {
  const who = playerName.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "analyst";
  return `breakwater-${ending.id}-${who}.png`;
}

export async function drawShareCard(info: ShareInfo): Promise<HTMLCanvasElement> {
  // the pixel and text fonts are bundled, but may not have been used yet
  try {
    const faces = ['32px "Silkscreen"', '32px "IBM Plex Sans"', '500 32px "IBM Plex Sans"', '600 32px "IBM Plex Sans"', '32px "IBM Plex Mono"'];
    await Promise.all(faces.map((f) => document.fonts.load(f)));
  } catch {
    // fall back to whatever the browser has
  }
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return c;
  const [top, mid, glow] = SKY[info.ending.id] ?? SKY.lighthouse;

  // sky
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, top);
  sky.addColorStop(0.7, mid);
  sky.addColorStop(1, glow);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // the sea, in pixel bands
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(10,16,28,${0.35 + i * 0.1})`;
    g.fillRect(0, 470 + i * 28, W, 28);
  }
  // the lighthouse on the right, with its beam
  const lx = 1010;
  g.fillStyle = "rgba(255,236,190,0.16)";
  g.beginPath();
  g.moveTo(lx + 20, 250);
  g.lineTo(W, 150);
  g.lineTo(W, 340);
  g.closePath();
  g.fill();
  g.fillStyle = "#0e1320";
  g.fillRect(lx, 260, 40, 210);
  g.fillRect(lx - 8, 470, 56, 12);
  g.fillStyle = info.ending.id === "deadwater" ? "#ff5a4a" : "#ffe7a8";
  g.fillRect(lx + 6, 236, 28, 24);
  g.fillStyle = "#0e1320";
  g.fillRect(lx - 4, 228, 48, 10);
  for (let y = 290; y < 460; y += 44) {
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(lx, y, 40, 10);
  }

  // text panel
  g.fillStyle = "rgba(8,12,22,0.62)";
  roundRect(g, 60, 60, 820, 510, 18);
  g.fill();

  g.fillStyle = "#ffd79a";
  g.font = '28px "Silkscreen", monospace';
  g.fillText("BREAKWATER", 100, 120);

  g.fillStyle = "rgba(255,255,255,0.7)";
  g.font = '500 22px "IBM Plex Sans", sans-serif';
  g.fillText("ENDING", 100, 175);

  g.fillStyle = "#ffffff";
  g.font = '600 64px "IBM Plex Sans", sans-serif';
  g.fillText(fit(g, info.ending.title, 740), 100, 245);

  g.fillStyle = "#ffd79a";
  g.font = '500 26px "IBM Plex Sans", sans-serif';
  g.fillText(fit(g, info.ending.rankTitle, 740), 100, 290);

  g.fillStyle = "rgba(255,255,255,0.85)";
  g.font = 'italic 24px "IBM Plex Sans", sans-serif';
  wrap(g, info.ending.epigraph, 100, 340, 740, 32, 2);

  const who = [info.playerName, info.team].filter(Boolean).join(", ");
  g.fillStyle = "#ffffff";
  g.font = '600 24px "IBM Plex Sans", sans-serif';
  g.fillText(fit(g, who, 740), 100, 440);

  g.fillStyle = "rgba(255,255,255,0.8)";
  g.font = '22px "IBM Plex Sans", sans-serif';
  const stats = [`Conduct: ${info.conduct}`, `Accuracy: ${info.accuracy}%`, ...(info.hard ? ["Hard mode"] : [])].join("   ·   ");
  g.fillText(fit(g, stats, 740), 100, 478);
  g.fillText(fit(g, info.extra, 740), 100, 512);

  g.fillStyle = "rgba(255,255,255,0.6)";
  g.font = '20px "IBM Plex Mono", monospace';
  g.fillText("cyberahmedx.github.io/BREAKWATER", 100, 548);
  return c;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Shorten text with an ellipsis until it fits in width. */
function fit(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}...`).width > width) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines: number): void {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => g.fillText(i === maxLines - 1 && lines.length > maxLines ? fit(g, `${l} ${lines.slice(maxLines).join(" ")}`, width) : l, x, y + i * lineHeight));
}
