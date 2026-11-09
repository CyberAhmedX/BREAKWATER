import type { Dept } from "../engine/types";
import { DEPTS, DEPT_LABEL } from "../engine/types";
import { freshSave } from "../engine/state";
import { canSelectChapter } from "../engine/meta";
import { audio } from "../audio/audio";
import { charName } from "../content/characters";
import { screeningFor } from "../content/screenings";
import { el, mount } from "./dom";
import type { Host } from "./host";
import { openChapterSelect, openImport, openPractice, openRecord } from "./overlays";

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
export function screenTitle(host: Host): void {
  const begin = (): void => host.startSession();
  const resumeAvailable = host.s.playerName !== "";

  const nameInput = el("input", {
    class: "name-input",
    type: "text",
    id: "player-name",
    maxlength: 24,
    placeholder: "Your name",
    value: host.s.playerName,
  }) as HTMLInputElement;

  const hardBox = el("input", { type: "checkbox", id: "hard-mode" }) as HTMLInputElement;
  const hardRow = el("label", { class: "check-row", for: "hard-mode" }, [
    hardBox,
    el("span", {}, [el("b", { text: "Hard mode. " }), el("span", { text: "For experienced players: no hints, one attempt at every case, and a tighter clock in the live finale. A wrong answer and the case is botched." })]),
  ]);

  const start = el("button", {
    class: resumeAvailable ? "btn ghost" : "btn primary",
    type: "button",
    text: resumeAvailable ? "Start over as a new applicant" : "Apply to Lanternhouse",
  });
  let confirmingRestart = false;
  start.addEventListener("click", () => {
    if (resumeAvailable && !confirmingRestart) {
      confirmingRestart = true;
      start.textContent = "This erases your saved game. Tap again to confirm";
      return;
    }
    begin();
    const name = nameInput.value.trim() || "Alex";
    host.s = freshSave();
    host.s.playerName = name;
    host.s.hard = hardBox.checked;
    audio.click();
    host.persist();
    host.render();
  });

  const card = el("div", { class: "title-card" }, [
    el("h1", { class: "title-logo", text: "BREAKWATER" }),
    el("p", { class: "title-sub", text: "a cybersecurity career game" }),
    el("p", { class: "title-blurb", text: "You are the newest hire at Lanternhouse Security, a small firm keeping a rainy harbor town safe. Learn the trade, close the tickets, and find out what has been hiding in the quiet." },
    ),
    el("p", { class: "title-audience", text: "Made for students and beginners getting ready for a SOC or help desk job. Turn on Hard mode if you already do this for a living." }),
  ]);

  if (resumeAvailable) {
    const cont = el("button", { class: "btn primary", type: "button", text: `Continue as ${host.s.playerName}` });
    cont.addEventListener("click", () => {
      begin();
      audio.click();
      host.render();
    });
    card.append(cont, el("label", { class: "field-label", for: "player-name", text: "Or sign a new application" }), nameInput, hardRow, start);
  } else {
    card.append(el("label", { class: "field-label", for: "player-name", text: "Sign your application" }), nameInput, hardRow, start);
  }

  // Once you have finished a run, you can look back at it and replay a chapter.
  const extras = el("div", { class: "title-extras" });
  if (canSelectChapter(host.meta)) {
    const pick = el("button", { class: "btn ghost small", type: "button", text: "Replay a chapter" });
    pick.addEventListener("click", () => {
      audio.click();
      openChapterSelect(host);
    });
    extras.append(pick);
  }
  if (host.meta.casesEver.length > 0) {
    const practise = el("button", { class: "btn ghost small", type: "button", text: "Practice a case" });
    practise.addEventListener("click", () => {
      audio.click();
      openPractice(host);
    });
    extras.append(practise);
  }
  if (host.meta.endings.length > 0 || host.meta.achievements.length > 0) {
    const rec = el("button", { class: "btn ghost small", type: "button", text: "Endings and achievements" });
    rec.addEventListener("click", () => {
      audio.click();
      openRecord(host);
    });
    extras.append(rec);
  }
  // someone arriving on a new device brings their save with them
  const imp = el("button", { class: "btn ghost small", type: "button", text: "Import a save" });
  imp.addEventListener("click", () => {
    audio.click();
    openImport(host);
  });
  extras.append(imp);
  card.append(extras);

  host.stage.className = "stage center";
  mount(host.stage, card);
  const firstButton = card.querySelector("button");
  setTimeout(() => (resumeAvailable ? firstButton?.focus() : nameInput.focus()), 30);
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
