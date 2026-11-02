import type { Chapter, Dept } from "./types";
import { DEPTS } from "./types";
import { type SaveData, freshSave } from "./state";
import { type MetaData, freshMeta, TEXT_SCALES } from "./meta";

// Moving a save between browsers and devices. One bundle holds the run and
// everything that outlives it (endings, achievements, settings, chapter
// checkpoints). It travels as a JSON file, or as a text code for copy and paste:
// the same JSON, compressed and base64url encoded, after a short prefix.
//
// Imports are never trusted as they are. A checksum catches a damaged file or a
// code cut short while pasting, and every field is rebuilt from a fresh save so
// a hand-edited file cannot put the game in a state it does not expect.

const FORMAT = "breakwater-save";
const OLD_FORMAT = "dwell-time-save";
const CODE_PREFIX = "BRKW1."; // deflate-raw compressed
const PLAIN_PREFIX = "BRKW0."; // uncompressed, for browsers without CompressionStream
const OLD_CODE_PREFIX = "DWELL1."; // legacy prefix, accepted on import
const OLD_PLAIN_PREFIX = "DWELL0.";

export interface SaveBundle {
  format: typeof FORMAT;
  version: 1;
  exported: string; // ISO date
  check: string; // checksum of data
  data: { save: SaveData; meta: MetaData };
}

export type ImportResult = { ok: true; save: SaveData; meta: MetaData; exported: string } | { ok: false; error: string };

export function makeBundle(save: SaveData, meta: MetaData, now = new Date()): SaveBundle {
  const data = { save, meta };
  return { format: FORMAT, version: 1, exported: now.toISOString(), check: checksum(JSON.stringify(data)), data };
}

export function bundleToFile(bundle: SaveBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export async function bundleToCode(bundle: SaveBundle): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  if (typeof CompressionStream === "undefined") return PLAIN_PREFIX + toBase64Url(bytes);
  return CODE_PREFIX + toBase64Url(await pipe(bytes, new CompressionStream("deflate-raw")));
}

function isCodePrefix(raw: string): boolean {
  return raw.startsWith(CODE_PREFIX) || raw.startsWith(OLD_CODE_PREFIX);
}

function isPlainPrefix(raw: string): boolean {
  return raw.startsWith(PLAIN_PREFIX) || raw.startsWith(OLD_PLAIN_PREFIX);
}

function stripPrefix(raw: string): string {
  for (const p of [CODE_PREFIX, OLD_CODE_PREFIX, PLAIN_PREFIX, OLD_PLAIN_PREFIX]) {
    if (raw.startsWith(p)) return raw.slice(p.length);
  }
  return raw;
}

/** A file name like breakwater-save-Riley-2026-10-17.json */
export function fileName(save: SaveData, now = new Date()): string {
  const who = save.playerName.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "save";
  return `breakwater-save-${who}-${now.toISOString().slice(0, 10)}.json`;
}

/** Read either a save file's text or a pasted save code. */
export async function readSave(text: string): Promise<ImportResult> {
  const raw = text.trim();
  if (!raw) return fail("That is empty. Paste a save code or choose a save file.");

  let parsed: unknown;
  try {
    let json = raw;
    if (isCodePrefix(raw) || isPlainPrefix(raw)) {
      let bytes = fromBase64Url(stripPrefix(raw).replace(/\s+/g, ""));
      if (isCodePrefix(raw)) {
        if (typeof DecompressionStream === "undefined") return fail("This browser cannot read save codes. Use a save file instead.");
        bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
      }
      json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    parsed = JSON.parse(json);
  } catch {
    return fail(raw.startsWith("BRKW") || raw.startsWith("DWELL") ? "That save code is damaged or cut short. Copy it again, all of it." : "That is not a Breakwater save.");
  }

  if (!isObj(parsed) || (parsed.format !== FORMAT && parsed.format !== OLD_FORMAT)) return fail("That is not a Breakwater save.");
  if (parsed.version !== 1) return fail("That save comes from a newer version of Breakwater. Update the game, then try again.");
  if (!isObj(parsed.data) || typeof parsed.check !== "string") return fail("That save is incomplete.");
  if (checksum(JSON.stringify(parsed.data)) !== parsed.check) return fail("That save has been damaged or edited, so it cannot be loaded safely.");

  const save = cleanSave(parsed.data.save);
  if (!save) return fail("The run inside that save is not readable.");
  const meta = cleanMeta(parsed.data.meta);
  return { ok: true, save, meta, exported: typeof parsed.exported === "string" ? parsed.exported : "" };
}

// ---------- rebuilding from a fresh save ----------

function cleanSave(x: unknown): SaveData | null {
  if (!isObj(x) || x.version !== 1) return null;
  const s = freshSave();
  s.playerName = typeof x.playerName === "string" ? x.playerName.slice(0, 24) : "";
  s.track = DEPTS.includes(x.track as Dept) ? (x.track as Dept) : null;
  s.hired = x.hired === true;
  s.chapter = (Number.isInteger(x.chapter) && (x.chapter as number) >= 0 && (x.chapter as number) <= 6 ? x.chapter : 0) as Chapter;
  s.xp = count(x.xp);
  s.integrity = Number.isInteger(x.integrity) ? Math.max(-50, Math.min(50, x.integrity as number)) : 0;
  s.flags = ids(x.flags);
  s.done = ids(x.done);
  s.codex = ids(x.codex);
  s.screeningScore = count(x.screeningScore ?? x.interviewScore);
  s.cleanCloses = count(x.cleanCloses);
  s.totalCloses = Math.max(count(x.totalCloses), s.cleanCloses);
  s.botched = count(x.botched);
  s.screeningFails = count(x.screeningFails ?? x.interviewFails);
  s.hintsUsed = count(x.hintsUsed);
  s.hard = x.hard === true;
  s.seed = typeof x.seed === "number" && Number.isFinite(x.seed) ? x.seed >>> 0 : s.seed;
  // a hired run with no track or no chapter makes no sense; start that run over
  if (s.hired && (!s.track || s.chapter === 0)) return null;
  return s;
}

function cleanMeta(x: unknown): MetaData {
  const m = freshMeta();
  if (!isObj(x)) return m;
  m.endings = ids(x.endings);
  m.achievements = ids(x.achievements);
  m.codexEver = ids(x.codexEver);
  m.casesEver = ids(x.casesEver);
  m.secretsEver = ids(x.secretsEver);
  m.seenScenes = ids(x.seenScenes);
  m.toolsSeen = ids(x.toolsSeen);
  if (isObj(x.checkpoints)) {
    for (const [k, v] of Object.entries(x.checkpoints)) {
      const ch = Number(k);
      const cp = cleanSave(v);
      if (Number.isInteger(ch) && ch >= 1 && ch <= 5 && cp && cp.chapter === ch) m.checkpoints[ch] = cp;
    }
  }
  if (isObj(x.settings)) {
    const st = x.settings;
    if (unit(st.music)) m.settings.music = st.music as number;
    if (unit(st.effects)) m.settings.effects = st.effects as number;
    m.settings.muted = st.muted === true;
    if ((TEXT_SCALES as readonly number[]).includes(st.textScale as number)) m.settings.textScale = st.textScale as number;
    m.settings.reducedMotion = st.reducedMotion === true ? true : st.reducedMotion === false ? false : null;
    m.settings.relaxedTimers = st.relaxedTimers === true;
    m.settings.fastDialogue = st.fastDialogue === true;
    m.settings.skipSeen = st.skipSeen === true;
  }
  return m;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const count = (x: unknown): number => (Number.isInteger(x) && (x as number) >= 0 ? Math.min(x as number, 1_000_000) : 0);
const unit = (x: unknown): boolean => typeof x === "number" && x >= 0 && x <= 1;
const ids = (x: unknown): string[] =>
  Array.isArray(x) ? [...new Set(x.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 80))].slice(0, 500) : [];

function fail(error: string): ImportResult {
  return { ok: false, error };
}

// ---------- encoding ----------

/** FNV-1a, 32 bit. Catches damage and truncation; it is not meant to stop cheating. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as BufferSource).then(() => writer.close()).catch(() => {});
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) chunks.push(r.value);
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): Uint8Array {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
