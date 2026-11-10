import { type SaveData, withDefaults } from "./state";

// Everything that outlives a single run: settings, the endings you have seen,
// achievements, every Field Note you have ever unlocked, and a snapshot of the
// save at the start of each chapter so a finished player can replay one.
// Kept apart from the run save, so "Play again" and "Erase save" leave it alone.

export interface Settings {
  music: number; // 0..1, soundtrack and rain
  effects: number; // 0..1, clicks, chimes and thunder
  muted: boolean;
  textScale: number; // 1 is the default size
  reducedMotion: boolean | null; // null follows the system setting
  relaxedTimers: boolean; // live cases get twice as long
  fastDialogue: boolean; // show a scene's lines at once instead of one click at a time
  skipSeen: boolean; // on replays, skip story scenes you have already read
}

export interface MetaData {
  version: 1;
  endings: string[];
  achievements: string[];
  codexEver: string[];
  casesEver: string[]; // every case you have ever closed, for practice mode
  secretsEver: string[]; // every team secret you have ever found
  seenScenes: string[]; // story scene ids whose dialogue you have read, for skip-seen
  toolsSeen: string[]; // tool kinds you have opened once, for first-use onboarding
  checkpoints: Partial<Record<number, SaveData>>; // chapter -> save at its start
  settings: Settings;
}

export const TEXT_SCALES = [0.9, 1, 1.15, 1.3] as const;

const META_KEY = "breakwater.meta.v1";
const OLD_META_KEY = "dwell-time.meta.v1";

export function freshMeta(): MetaData {
  return {
    version: 1,
    endings: [],
    achievements: [],
    codexEver: [],
    casesEver: [],
    secretsEver: [],
    seenScenes: [],
    toolsSeen: [],
    checkpoints: {},
    settings: { music: 0.7, effects: 0.7, muted: false, textScale: 1, reducedMotion: null, relaxedTimers: false, fastDialogue: false, skipSeen: false },
  };
}

export function loadMeta(): MetaData {
  try {
    let raw = localStorage.getItem(META_KEY);
    if (!raw) {
      raw = localStorage.getItem(OLD_META_KEY);
      if (raw) {
        localStorage.setItem(META_KEY, raw);
        localStorage.removeItem(OLD_META_KEY);
      }
    }
    if (!raw) return freshMeta();
    const data = JSON.parse(raw) as Partial<MetaData>;
    if (data.version !== 1) return freshMeta();
    const base = freshMeta();
    return { ...base, ...data, settings: { ...base.settings, ...data.settings } };
  } catch {
    return freshMeta();
  }
}

export function saveMeta(meta: MetaData): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    localStorage.removeItem(OLD_META_KEY);
  } catch {
    // Same as the run save: no storage means no persistence, not a crash.
  }
}

export function wipeMeta(): void {
  try {
    localStorage.removeItem(META_KEY);
    localStorage.removeItem(OLD_META_KEY);
  } catch {
    // ignore
  }
}

function addOnce(list: string[], id: string): boolean {
  if (list.includes(id)) return false;
  list.push(id);
  return true;
}

export function recordEnding(meta: MetaData, id: string): boolean {
  return addOnce(meta.endings, id);
}

export function recordCodex(meta: MetaData, ids: readonly string[]): void {
  for (const id of ids) addOnce(meta.codexEver, id);
}

/** Remember team secrets found in any run, for Case Files and Six Sides. */
export function recordSecrets(meta: MetaData, flags: readonly string[]): void {
  for (const f of flags) if (f.startsWith("secret_")) addOnce(meta.secretsEver, f);
}

/** Remember closed cases, so they can be practised from the title screen. */
export function recordCases(meta: MetaData, ids: readonly string[]): void {
  for (const id of ids) addOnce(meta.casesEver, id);
}

/** Remember a story scene has been read, so skip-seen can skip it on replays. */
export function markSceneSeen(meta: MetaData, id: string): void {
  addOnce(meta.seenScenes, id);
}

export function hasSeenScene(meta: MetaData, id: string): boolean {
  return meta.seenScenes.includes(id);
}

/** Record a tool kind as opened. Returns true the first time, for the coach tip. */
export function firstToolUse(meta: MetaData, kind: string): boolean {
  return addOnce(meta.toolsSeen, kind);
}

/** Store a copy of the save as it stands at the start of a chapter. */
export function recordCheckpoint(meta: MetaData, save: SaveData): void {
  meta.checkpoints[save.chapter] = JSON.parse(JSON.stringify(save)) as SaveData;
}

/** A fresh copy of a chapter checkpoint, safe to play from. */
export function checkpointCopy(meta: MetaData, chapter: number): SaveData | undefined {
  const cp = meta.checkpoints[chapter];
  // a checkpoint taken by an older version may lack newer fields
  return cp ? withDefaults(JSON.parse(JSON.stringify(cp)) as Partial<SaveData>) : undefined;
}

/** Chapter select opens once you have seen any ending. */
export function canSelectChapter(meta: MetaData): boolean {
  return meta.endings.length > 0 && Object.keys(meta.checkpoints).length > 0;
}
