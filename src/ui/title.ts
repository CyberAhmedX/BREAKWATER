import type { Dept } from "../engine/types";
import { DEPTS, DEPT_LABEL } from "../engine/types";
import { freshSave } from "../engine/state";
import { canSelectChapter } from "../engine/meta";
import { DEMO, FULL_GAME_URL } from "../engine/demo";
import { audio } from "../audio/audio";
import { charName } from "../content/characters";
import { screeningFor } from "../content/screenings";
import { el, mount } from "./dom";
import type { Host } from "./host";
import { isDesktop, quitGame } from "./platform";
import { openChapterSelect, openImport, openPractice, openRecord, openSettings } from "./overlays";

// The title screen and the choice of team to screen for.

const TRACK_PITCH: Record<Dept, string> = {
  soc: "Watch the alerts. Tell the nothing from the something, fast.",
  network: "Read the traffic. The network always knows, if you listen.",
  helpdesk: "The front door. Keep people safe and calm at the same time.",
  forensics: "Reconstruct what happened, in a way that holds up to scrutiny.",
  pentest: "Break in on purpose, strictly inside the lines.",
  intel: "Connect the dots without inventing them.",
};

// ----------------------------------------------------------------- title
// The main menu comes first. A new game then opens the application form, where
// the player signs their name, so nobody is asked who they are before they
// have decided to play.
export function screenTitle(host: Host, view: "menu" | "apply" = "menu"): void {
  if (view === "apply") screenApply(host);
  else screenMenu(host);
}

function screenMenu(host: Host): void {
  const hasSave = host.s.playerName !== "";
  const list = el("div", { class: "menu-list", role: "group", "aria-label": "Main menu" });
  const item = (text: string, run: () => void, primary = false): void => {
    // the marker is decoration, so it stays out of the button's name
    const b = el("button", { class: primary ? "menu-item primary" : "menu-item", type: "button" }, [el("span", { class: "menu-caret", "aria-hidden": "true", text: ">" }), text]);
    b.addEventListener("click", () => {
      audio.click();
      run();
    });
    list.append(b);
  };

  if (hasSave) {
    item(
      `Continue as ${host.s.playerName}`,
      () => {
        host.startSession();
        host.render();
      },
      true,
    );
  }
  item("New game", () => screenTitle(host, "apply"), !hasSave);
  // Once you have finished a run, you can look back at it and replay a chapter.
  if (canSelectChapter(host.meta)) item("Replay a chapter", () => openChapterSelect(host));
  if (host.meta.casesEver.length > 0) item("Practice a case", () => openPractice(host));
  if (host.meta.endings.length > 0 || host.meta.achievements.length > 0) item("Endings and achievements", () => openRecord(host));
  // someone arriving on a new device brings their save with them
  item("Import a save", () => openImport(host));
  item("Settings", () => openSettings(host));
  if (DEMO) item("Get the full game", () => window.open(FULL_GAME_URL, "_blank", "noopener"));
  // a window has no tab to close, so the desktop app gets a way out
  if (isDesktop()) item("Quit to desktop", quitGame);

  // up and down move through the menu, the way a game menu does
  list.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...list.querySelectorAll<HTMLElement>(".menu-item")];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? at + 1 : at - 1;
    e.preventDefault();
    items[(next + items.length) % items.length]?.focus();
  });

  const menu = el("div", { class: "main-menu" }, [
    el("h1", { class: "title-logo", text: "BREAKWATER" }),
    el("p", { class: "title-sub", text: DEMO ? "a cybersecurity career game: the demo" : "a cybersecurity career game" }),
    ...(DEMO ? [el("p", { class: "menu-demo", text: "The first two chapters, in your browser. The full game is a free download, and your save carries over." })] : []),
    list,
    el("p", { class: "menu-hint", text: isDesktop() ? "Up and down to move. Enter to choose. F11 for fullscreen." : "Up and down to move. Enter to choose." }),
  ]);

  host.stage.className = "stage menu";
  mount(host.stage, menu);
  setTimeout(() => list.querySelector<HTMLElement>(".menu-item")?.focus(), 30);
}

function screenApply(host: Host): void {
  const hasSave = host.s.playerName !== "";

  const nameInput = el("input", {
    class: "name-input",
    type: "text",
    id: "player-name",
    maxlength: 24,
    placeholder: "Your name",
  }) as HTMLInputElement;

  const hardBox = el("input", { type: "checkbox", id: "hard-mode" }) as HTMLInputElement;
  const hardRow = el("label", { class: "check-row", for: "hard-mode" }, [
    hardBox,
    el("span", {}, [el("b", { text: "Hard mode. " }), el("span", { text: "For experienced players: no hints, one attempt at every case, and a tighter clock in the live finale. A wrong answer and the case is botched." })]),
  ]);

  const start = el("button", { class: "btn primary", type: "button", text: "Apply to Lanternhouse" });
  let confirmingRestart = false;
  const apply = (): void => {
    if (hasSave && !confirmingRestart) {
      confirmingRestart = true;
      start.textContent = `This erases ${host.s.playerName}'s saved game. Tap again to confirm`;
      return;
    }
    host.startSession();
    const name = nameInput.value.trim() || "Alex";
    host.s = freshSave();
    host.s.playerName = name;
    host.s.hard = hardBox.checked;
    audio.click();
    host.persist();
    host.render();
  };
  start.addEventListener("click", apply);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") apply();
  });

  const back = el("button", { class: "btn ghost", type: "button", text: "Back to menu" });
  back.addEventListener("click", () => {
    audio.click();
    screenTitle(host);
  });

  const card = el("div", { class: "title-card" }, [
    el("p", { class: "title-sub", text: "Lanternhouse Security: job application" }),
    el("p", { class: "title-blurb", text: "You are the newest hire at Lanternhouse Security, a small firm keeping a rainy harbor town safe. Learn the trade, close the tickets, and find out what has been hiding in the quiet." }),
    el("p", { class: "title-audience", text: "Made for students and beginners getting ready for a SOC or help desk job. Turn on Hard mode if you already do this for a living." }),
    el("label", { class: "field-label", for: "player-name", text: "Sign your application" }),
    nameInput,
    hardRow,
    ...(hasSave ? [el("p", { class: "warn", text: `A new game replaces ${host.s.playerName}'s saved run. Endings and achievements are kept.` })] : []),
    start,
    back,
  ]);

  host.stage.className = "stage center";
  mount(host.stage, card);
  setTimeout(() => nameInput.focus(), 30);
}

// ----------------------------------------------------------------- track
export function screenTrack(host: Host): void {
  const title = el("div", { class: "screen-head" }, [
    el("h2", { text: `Welcome, ${host.s.playerName}.` }),
    el("p", { text: "Lanternhouse has openings across six teams. Pick the one you want to screen for. You will be asked real questions, so choose where your instincts are sharpest." }),
  ]);
  const grid = el("div", { class: "track-grid" });
  for (const dept of DEPTS) {
    const iv = screeningFor(dept);
    const card = el("button", { class: "track-card", type: "button" }, [
      host.portrait(iv ? iv.screener : "you", 72),
      el("div", { class: "track-name", text: DEPT_LABEL[dept] }),
      el("div", { class: "track-by", text: iv ? `Screener: ${charName(iv.screener)}` : "" }),
      el("div", { class: "track-desc", text: TRACK_PITCH[dept] }),
    ]);
    card.addEventListener("click", () => {
      audio.click();
      host.s.track = dept;
      host.s.screeningScore = 0;
      host.persist();
      host.render();
    });
    grid.append(card);
  }
  host.stage.className = "stage";
  mount(host.stage, title, grid);
}
