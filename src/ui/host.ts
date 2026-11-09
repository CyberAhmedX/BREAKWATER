import type { Dept, Question, Ticket } from "../engine/types";
import { type SaveData, hasAll, hasNone } from "../engine/state";
import type { MetaData } from "../engine/meta";
import type { OfficeScene } from "../scene/office";
import { el } from "./dom";

// What every screen needs from the app: the run, the record that outlives it,
// the stage to draw on, and a few ways to move the game along. The app
// controller implements this; the screens in the other ui files take it as
// their first argument, so each can live in its own file.

export interface CloseGradeInfo {
  wrongAttempts: number;
  botched: boolean;
  hints: number;
}

export interface Host {
  readonly root: HTMLElement;
  readonly stage: HTMLElement;
  readonly scene: OfficeScene;
  s: SaveData;
  meta: MetaData;
  // While a case is practised, this holds the real run; s is a scratch copy.
  practice: { real: SaveData } | null;
  started: boolean;
  persist(): void;
  applySettings(): void;
  startSession(): void;
  portrait(key: string, size?: number): HTMLCanvasElement;
  renderTopbar(): void;
  render(): void;
  showToast(text: string, ms?: number): void;
  screenChapter(): void;
  completeTicket(t: Ticket, grade: CloseGradeInfo): void;
  startPractice(t: Ticket): void;
  leavePractice(): void;
}

export function stat(label: string, value: string): HTMLElement {
  return el("div", { class: "stat" }, [
    el("span", { class: "stat-k", text: label }),
    el("span", { class: "stat-v", text: value }),
  ]);
}

export function hintFlag(q: Question): string {
  return `hint:${q.id}`;
}

export function attackTags(t: Ticket): HTMLElement {
  return el("div", { class: "attack" }, [
    el("span", { class: "attack-k", text: "MITRE ATT&CK" }),
    ...(t.attack ?? []).map((a) => el("span", { class: "attack-tag", text: `${a.id} ${a.name}` })),
  ]);
}

export function speakerFor(t: Ticket): string {
  return t.speaker ?? briefSpeaker(t.dept);
}

function briefSpeaker(dept: Dept): string {
  const map: Record<Dept, string> = {
    soc: "mags",
    network: "priya",
    helpdesk: "theo",
    forensics: "imani",
    pentest: "rook",
    intel: "juno",
  };
  return map[dept];
}

export function isVisible(s: SaveData): (x: { requires?: string[]; hideIf?: string[] } | undefined) => boolean {
  return (x) => !!x && hasAll(s, x.requires) && hasNone(s, x.hideIf);
}
