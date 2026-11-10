import type { Chapter } from "./types";
import { type SaveData, setFlag } from "./state";

// The alert queue. Every chapter from two on, more alerts arrive than there is
// time to work. You open the ones you judge worth it, and call each one you
// open: escalate it as real, or close it as benign. Whatever you leave ages
// out when the day ends. A real alert that is closed or left to age out shows
// up later in the story; so does one you caught.
//
// This is triage, and it is scored on its own. It pays no XP, so rank still
// measures the cases.

export interface QueueAlert {
  id: string;
  chapter: Chapter;
  severity: "low" | "medium" | "high" | "critical"; // what the tool scored it, which is not the same as what it is
  title: string; // the one line you see before you open it
  source: string; // whose system raised it
  details: string[]; // what you learn by opening it
  real: boolean;
  why: string; // shown once you have made the call
  caught?: string; // real alerts: what the story says later if you escalated it
  missed?: string; // real alerts: what the story says later if you did not
  who?: string; // who says that line, when it is spoken in a scene
}

/** opened: a look has been spent on it and no call made yet. */
export type TriageCall = "opened" | "escalated" | "closed" | "aged";

export const TRIAGE_CALLS: readonly TriageCall[] = ["opened", "escalated", "closed", "aged"];

/** How many alerts there is time to open in one chapter. Hard mode leaves no slack. */
export function looksAllowed(save: SaveData): number {
  return save.hard ? 2 : 3;
}

export function callOn(save: SaveData, alert: QueueAlert): TriageCall | undefined {
  return save.triage[alert.id];
}

/** Looks already spent in this chapter's queue. Aged-out alerts were never opened. */
export function looksUsed(save: SaveData, queue: readonly QueueAlert[]): number {
  return queue.filter((a) => {
    const c = callOn(save, a);
    return c === "opened" || c === "escalated" || c === "closed";
  }).length;
}

export function looksLeft(save: SaveData, queue: readonly QueueAlert[]): number {
  return Math.max(0, looksAllowed(save) - looksUsed(save, queue));
}

/** Alerts nobody has opened yet. */
export function waiting(save: SaveData, queue: readonly QueueAlert[]): QueueAlert[] {
  return queue.filter((a) => callOn(save, a) === undefined);
}

/** Is there still something to do in this queue: an alert to open, or an open one to call? */
export function queueOpen(save: SaveData, queue: readonly QueueAlert[]): boolean {
  if (queue.some((a) => callOn(save, a) === "opened")) return true;
  return looksLeft(save, queue) > 0 && waiting(save, queue).length > 0;
}

/** Spend a look on an alert. Returns false if there is no time left or it is already open. */
export function openAlert(save: SaveData, queue: readonly QueueAlert[], alert: QueueAlert): boolean {
  if (callOn(save, alert) !== undefined || looksLeft(save, queue) <= 0) return false;
  save.triage[alert.id] = "opened";
  return true;
}

export const caughtFlag = (id: string): string => `triage_caught:${id}`;
export const missedFlag = (id: string): string => `triage_missed:${id}`;

/** Was the call the right one? Only escalated and closed are calls. */
export function rightCall(alert: QueueAlert, call: TriageCall): boolean {
  return alert.real ? call === "escalated" : call === "closed";
}

/** Make the call on an alert you have opened. Returns whether it was right. */
export function decide(save: SaveData, alert: QueueAlert, call: "escalated" | "closed"): boolean {
  if (callOn(save, alert) !== "opened") return rightCall(alert, callOn(save, alert) ?? "aged");
  save.triage[alert.id] = call;
  if (alert.real) setFlag(save, call === "escalated" ? caughtFlag(alert.id) : missedFlag(alert.id));
  return rightCall(alert, call);
}

/**
 * The day ends: everything not called ages out. An alert left open with no
 * call ages out too. Real ones that aged out are missed.
 */
export function ageOut(save: SaveData, queue: readonly QueueAlert[]): void {
  for (const a of queue) {
    const c = callOn(save, a);
    if (c === "escalated" || c === "closed" || c === "aged") continue;
    save.triage[a.id] = "aged";
    if (a.real) setFlag(save, missedFlag(a.id));
  }
}

export interface TriageStats {
  real: number; // real alerts in the queues you have finished
  caught: number;
  missed: number;
  rightCalls: number; // calls you made that were right
  calls: number; // calls you made
  criedWolf: number; // benign alerts you escalated
}

/** How the run's triage has gone, over every alert that has been settled. */
export function triageStats(save: SaveData, all: readonly QueueAlert[]): TriageStats {
  const st: TriageStats = { real: 0, caught: 0, missed: 0, rightCalls: 0, calls: 0, criedWolf: 0 };
  for (const a of all) {
    const c = callOn(save, a);
    if (c === undefined || c === "opened") continue;
    if (a.real) {
      st.real++;
      if (c === "escalated") st.caught++;
      else st.missed++;
    }
    if (c === "escalated" || c === "closed") {
      st.calls++;
      if (rightCall(a, c)) st.rightCalls++;
      else if (!a.real) st.criedWolf++;
    }
  }
  return st;
}
