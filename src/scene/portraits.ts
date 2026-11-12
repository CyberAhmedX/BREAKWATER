// Procedural pixel portraits. Each character gets a distinct palette and a few
// defining features (hair shape, glasses, headset, hoodie). Drawn from rects so
// no image assets are needed.

export interface Look {
  skin: string;
  hair: string;
  hairStyle: "short" | "bun" | "long" | "buzz" | "hood" | "cap" | "bald" | "curl";
  shirt: string;
  accent?: string;
  glasses?: boolean;
  headset?: boolean;
  bg: string;
}

export const LOOKS: Record<string, Look> = {
  you: { skin: "#d8a877", hair: "#3a2c22", hairStyle: "short", shirt: "#4a6e8a", bg: "#2a3340" },
  walter: { skin: "#e7c3a0", hair: "#d8d2c6", hairStyle: "bald", shirt: "#7a5a46", accent: "#9a7b56", glasses: true, bg: "#3a3128" },
  mags: { skin: "#6b4a34", hair: "#1c1c22", hairStyle: "buzz", shirt: "#2f4858", headset: true, bg: "#1f2d34" },
  theo: { skin: "#eac9a6", hair: "#caa24e", hairStyle: "curl", shirt: "#c7693f", accent: "#e4a24a", bg: "#3b2a22" },
  priya: { skin: "#b07a4e", hair: "#241a14", hairStyle: "long", shirt: "#3f7d5a", bg: "#1f3329" },
  imani: { skin: "#7a5436", hair: "#2a2320", hairStyle: "bun", shirt: "#5a4a7a", glasses: true, bg: "#2b2638" },
  rook: { skin: "#d2a07a", hair: "#15151a", hairStyle: "hood", shirt: "#2b2b32", accent: "#8a2f3b", bg: "#1a1a20" },
  juno: { skin: "#e0b48a", hair: "#b03a3a", hairStyle: "cap", shirt: "#49607a", accent: "#c0453f", bg: "#263142" },
  celeste: { skin: "#ddb892", hair: "#6a5440", hairStyle: "bun", shirt: "#55606b", glasses: true, bg: "#2d3339" },
  brackish: { skin: "#1a2a30", hair: "#0d181c", hairStyle: "hood", shirt: "#0f2027", accent: "#2f8f88", bg: "#0a1316" },
};

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string, s: number): void {
  ctx.fillStyle = c;
  ctx.fillRect(x * s, y * s, w * s, h * s);
}

const GRID = 24;

export function drawPortrait(canvas: HTMLCanvasElement, key: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const look = LOOKS[key] ?? LOOKS.you;
  const size = canvas.width;
  const s = size / GRID;
  ctx.clearRect(0, 0, size, size);

  // background
  rect(ctx, 0, 0, GRID, GRID, look.bg, s);
  rect(ctx, 0, GRID - 3, GRID, 3, "rgba(0,0,0,0.25)", s);

  // shoulders / shirt
  rect(ctx, 3, 18, 18, 6, look.shirt, s);
  if (look.accent) rect(ctx, 10, 18, 4, 6, look.accent, s);

  // neck
  rect(ctx, 10, 15, 4, 3, look.skin, s);

  // head
  rect(ctx, 7, 5, 10, 11, look.skin, s);
  // cheek shade
  rect(ctx, 7, 12, 10, 2, "rgba(0,0,0,0.08)", s);

  // hair styles
  const h = look.hair;
  switch (look.hairStyle) {
    case "short":
      rect(ctx, 6, 3, 12, 4, h, s);
      rect(ctx, 6, 5, 2, 5, h, s);
      rect(ctx, 16, 5, 2, 5, h, s);
      break;
    case "buzz":
      rect(ctx, 7, 3, 10, 3, h, s);
      break;
    case "bald":
      rect(ctx, 7, 4, 10, 2, h, s);
      rect(ctx, 6, 6, 2, 4, h, s);
      rect(ctx, 16, 6, 2, 4, h, s);
      break;
    case "bun":
      rect(ctx, 6, 3, 12, 4, h, s);
      rect(ctx, 10, 0, 4, 3, h, s);
      rect(ctx, 6, 5, 2, 6, h, s);
      rect(ctx, 16, 5, 2, 6, h, s);
      break;
    case "long":
      rect(ctx, 6, 2, 12, 5, h, s);
      rect(ctx, 5, 5, 3, 12, h, s);
      rect(ctx, 16, 5, 3, 12, h, s);
      break;
    case "curl":
      rect(ctx, 6, 2, 12, 4, h, s);
      rect(ctx, 5, 4, 2, 3, h, s);
      rect(ctx, 17, 4, 2, 3, h, s);
      rect(ctx, 7, 1, 3, 2, h, s);
      rect(ctx, 14, 1, 3, 2, h, s);
      break;
    case "cap":
      rect(ctx, 6, 2, 12, 3, look.accent ?? h, s);
      rect(ctx, 5, 5, 13, 2, look.accent ?? h, s);
      rect(ctx, 6, 5, 2, 4, h, s);
      rect(ctx, 16, 5, 2, 4, h, s);
      break;
    case "hood":
      rect(ctx, 4, 2, 16, 6, look.shirt, s);
      rect(ctx, 4, 6, 3, 12, look.shirt, s);
      rect(ctx, 17, 6, 3, 12, look.shirt, s);
      rect(ctx, 7, 5, 10, 2, h, s);
      break;
  }

  // eyes
  const eye = "#20242b";
  rect(ctx, 9, 9, 2, 2, eye, s);
  rect(ctx, 13, 9, 2, 2, eye, s);
  if (key === "brackish") {
    rect(ctx, 9, 9, 2, 2, look.accent ?? "#2f8f88", s);
    rect(ctx, 13, 9, 2, 2, look.accent ?? "#2f8f88", s);
  }

  // glasses
  if (look.glasses) {
    ctx.strokeStyle = "#2b2f36";
    ctx.lineWidth = Math.max(1, s * 0.5);
    ctx.strokeRect(8.3 * s, 8.3 * s, 3 * s, 3 * s);
    ctx.strokeRect(12.7 * s, 8.3 * s, 3 * s, 3 * s);
    ctx.beginPath();
    ctx.moveTo(11.3 * s, 9.8 * s);
    ctx.lineTo(12.7 * s, 9.8 * s);
    ctx.stroke();
  }

  // mouth
  rect(ctx, 10, 13, 4, 1, "rgba(80,40,40,0.6)", s);

  // headset
  if (look.headset) {
    rect(ctx, 6, 6, 1, 6, "#20242b", s);
    rect(ctx, 5, 8, 2, 3, "#20242b", s);
    rect(ctx, 6, 4, 12, 1, "#20242b", s);
    rect(ctx, 7, 11, 5, 1, "#20242b", s);
    rect(ctx, 11, 12, 2, 1, "#20242b", s);
  }
}
