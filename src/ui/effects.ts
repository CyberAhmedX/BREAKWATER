import { audio } from "../audio/audio";
import { el } from "./dom";

// Small moments of feedback: a stamp when a case closes, a title card when a
// chapter opens, a shake on a wrong answer. Each is laid over the game and
// never takes a click, so nothing waits on it. The reduce-motion setting
// stills the animation and leaves the words.

const still = (): boolean => document.documentElement.classList.contains("reduce-motion");

function overlay(root: HTMLElement, node: HTMLElement, ms: number): void {
  root.append(node);
  window.setTimeout(() => node.remove(), ms);
}

/** The rubber stamp that lands when a case is closed. */
export function stampCase(root: HTMLElement, botched: boolean, clean: boolean): void {
  const text = botched ? "BOTCHED" : "CASE CLOSED";
  const sub = botched ? "" : clean ? "clean, first try" : "";
  const stamp = el("div", { class: `stamp${botched ? " bad" : ""}` }, [el("span", { class: "stamp-text", text }), ...(sub ? [el("span", { class: "stamp-sub", text: sub })] : [])]);
  overlay(root, el("div", { class: "fx-layer", "aria-hidden": "true" }, [stamp]), 1900);
  audio.stamp(botched);
}

/** "CHAPTER TWO / OVERCAST", shown for a moment as a chapter opens. */
export function chapterCard(root: HTMLElement, title: string, subtitle: string): void {
  const card = el("div", { class: "chapter-card", "aria-hidden": "true" }, [el("div", { class: "chapter-card-k", text: title }), el("div", { class: "chapter-card-t", text: subtitle })]);
  overlay(root, card, still() ? 1400 : 2600);
}

/** A wrong answer: the panel shakes its head. */
export function shake(node: HTMLElement): void {
  if (still()) return;
  node.classList.remove("shake");
  void node.offsetWidth; // restart the animation if it is already running
  node.classList.add("shake");
  node.addEventListener("animationend", () => node.classList.remove("shake"), { once: true });
}

/** A wrong move against the clock: the whole screen takes the hit. */
export function hit(root: HTMLElement): void {
  if (still()) return;
  overlay(root, el("div", { class: "fx-hit", "aria-hidden": "true" }), 500);
}
