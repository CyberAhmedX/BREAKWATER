import type { Chapter } from "../engine/types";
import { MOODS } from "../scene/mood";
import { audio } from "../audio/audio";
import { el } from "./dom";

// A case is worked on your screen, so the workstation is dressed as one: each
// piece of evidence is a window with its own title bar, and a taskbar along
// the bottom lists them, with the weather and a clock. Windows are tiled, not
// loose, so nothing can be dragged off screen or lost behind something else;
// what the title bar does give you is minimize, and maximize for when a tool
// wants the whole screen.

function iconButton(kind: "min" | "max", label: string): HTMLButtonElement {
  return el("button", { class: `win-btn win-${kind}`, type: "button", "aria-label": label, title: label }, [el("span", { class: "win-icon", "aria-hidden": "true" })]);
}

/** Give a window its title-bar buttons, and say how to raise it from the taskbar. */
function dress(win: HTMLElement): void {
  const head = win.querySelector<HTMLElement>(".ev-head");
  if (!head) return;
  const min = iconButton("min", "Minimize");
  const max = iconButton("max", "Maximize");
  min.addEventListener("click", () => {
    audio.click();
    win.classList.remove("max");
    win.classList.toggle("min");
    win.dispatchEvent(new CustomEvent("win-change", { bubbles: true }));
  });
  max.addEventListener("click", () => {
    audio.click();
    win.classList.remove("min");
    win.classList.toggle("max");
    win.dispatchEvent(new CustomEvent("win-change", { bubbles: true }));
  });
  head.append(el("span", { class: "win-btns" }, [min, max]));
  // Esc puts a maximized window back
  win.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && win.classList.contains("max") && !win.classList.contains("picking")) {
      win.classList.remove("max");
      win.dispatchEvent(new CustomEvent("win-change", { bubbles: true }));
    }
  });
}

/**
 * Turn the workstation's panels into windows and build the taskbar for them.
 * `desk` is the scrolling area the windows live in.
 */
export function desktopFor(desk: HTMLElement, windows: HTMLElement[], who: string, chapter: Chapter): HTMLElement {
  const apps = el("div", { class: "os-apps", role: "group", "aria-label": "Open windows" });
  const buttons = new Map<HTMLElement, HTMLElement>();

  for (const win of windows) {
    dress(win);
    const tag = win.querySelector(".ev-tag")?.textContent ?? "";
    const label = win.querySelector(".ev-label")?.textContent ?? "";
    const b = el("button", { class: "os-app", type: "button", title: label }, [el("span", { class: "os-app-tag", text: tag }), el("span", { class: "os-app-label", text: label })]);
    b.addEventListener("click", () => {
      audio.click();
      // raise it: restore if it was minimized, bring it into view, and show which one it is
      win.classList.remove("min");
      desk.querySelectorAll(".ev.max").forEach((w) => w !== win && w.classList.remove("max"));
      win.scrollIntoView({ behavior: document.documentElement.classList.contains("reduce-motion") ? "auto" : "smooth", block: "start" });
      win.classList.remove("raised");
      void win.offsetWidth;
      win.classList.add("raised");
      sync();
    });
    buttons.set(win, b);
    apps.append(b);
  }

  const sync = (): void => {
    for (const [win, b] of buttons) b.classList.toggle("is-min", win.classList.contains("min"));
    desk.classList.toggle("has-max", windows.some((w) => w.classList.contains("max")));
  };
  desk.addEventListener("win-change", sync);

  const clock = el("span", { class: "os-clock" });
  const tick = (): void => {
    clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };
  tick();
  const timer = window.setInterval(() => {
    if (!clock.isConnected) clearInterval(timer);
    else tick();
  }, 20_000);

  return el("div", { class: "os-taskbar" }, [
    el("div", { class: "os-start", "aria-hidden": "true" }, [el("span", { class: "os-logo" }), el("span", { text: "LanternOS" })]),
    apps,
    el("div", { class: "os-tray" }, [el("span", { class: "os-who", text: who }), el("span", { class: "os-weather", text: MOODS[chapter].name }), clock]),
  ]);
}
