import type { Scene, SceneChoice, SceneLine } from "../engine/types";
import { choiceLock, hasAll, hasNone, setFlag, visibleLines } from "../engine/state";
import { hasSeenScene, markSceneSeen, saveMeta } from "../engine/meta";
import { audio } from "../audio/audio";
import { CHARACTERS } from "../content/characters";
import { el, mount } from "./dom";
import type { Host } from "./host";

// Story scenes and every other conversation: one line at a time (or all at
// once with fast dialogue), then a choice if the scene ends on one.

// ----------------------------------------------------------------- scenes
export function playScene(host: Host, sc: Scene, onDone: () => void): void {
  (sc.setFlags ?? []).forEach((f) => setFlag(host.s, f));
  // Skip-seen: on a replay, step past a scene you have already read, as long
  // as it has no choice to make. Flags above still apply either way.
  const seen = hasSeenScene(host.meta, sc.id);
  markSceneSeen(host.meta, sc.id);
  saveMeta(host.meta);
  if (seen && !sc.choice && host.meta.settings.skipSeen) {
    // Lines that depend on this run (what became of the alert queue) are new
    // even in a scene you have read, so those still play.
    const fresh = visibleLines(host.s, sc.lines).filter((l) => l.showIf?.length);
    if (fresh.length) playDialogue(host, fresh, undefined, onDone);
    else onDone();
    return;
  }
  playDialogue(host, sc.lines, sc.choice, onDone);
}

export function playDialogue(host: Host, 
  allLines: SceneLine[],
  choice: Scene["choice"] | undefined,
  onDone: () => void,
): void {
  const lines = visibleLines(host.s, allLines);
  let i = 0;
  const box = el("div", { class: "vn", tabindex: 0, role: "button", "aria-label": "Continue the conversation" });
  host.stage.className = "stage vn-stage";
  mount(host.stage, box);
  box.focus({ preventScroll: true });

  const showLine = (): void => {
    const line = lines[i];
    const who = line.who;
    const info = CHARACTERS[who];
    const isNarration = who === "narration" || !info || info.name === "";
    const content = el("div", { class: isNarration ? "vn-box narration" : "vn-box" }, []);
    if (!isNarration) {
      content.append(
        el("div", { class: "vn-speaker" }, [
          host.portrait(info.portrait, 96),
          el("span", { class: "vn-name", text: info.name, style: `color:${info.color}` }),
        ]),
      );
    }
    content.append(el("p", { class: "vn-text", text: line.text }));
    const hint = el("div", { class: "vn-hint", text: "click to continue" });
    content.append(hint);
    mount(box, content);
    box.onclick = (): void => {
      audio.type();
      i++;
      if (i < lines.length) showLine();
      else finishLines();
    };
    box.onkeydown = (e: KeyboardEvent): void => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        box.onclick?.(new MouseEvent("click"));
      }
    };
  };

  // Fast dialogue: lay the whole conversation out at once, one click to move on.
  const showAll = (): void => {
    const content = el("div", { class: "vn-box vn-all" });
    for (const line of lines) {
      const info = CHARACTERS[line.who];
      const isNarration = line.who === "narration" || !info || info.name === "";
      if (!isNarration) content.append(el("span", { class: "vn-name", text: info.name, style: `color:${info.color}` }));
      content.append(el("p", { class: isNarration ? "vn-text narration" : "vn-text", text: line.text }));
    }
    content.append(el("div", { class: "vn-hint", text: "click to continue" }));
    mount(box, content);
    box.onclick = (): void => {
      audio.type();
      finishLines();
    };
    box.onkeydown = (e: KeyboardEvent): void => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        box.onclick?.(new MouseEvent("click"));
      }
    };
  };

  const finishLines = (): void => {
    box.onclick = null;
    box.onkeydown = null;
    box.removeAttribute("tabindex");
    box.removeAttribute("role");
    if (choice) {
      showChoice();
    } else {
      onDone();
    }
  };

  const showChoice = (): void => {
    const c = choice!;
    const panel = el("div", { class: "vn-choice" }, [el("p", { class: "vn-choice-prompt", text: c.prompt })]);
    // Some options are only on the table if your earlier conduct earned them.
    const available = c.options.filter((o) => hasAll(host.s, o.requires) && hasNone(host.s, o.hideIf));
    available.forEach((opt) => {
      // An option an earlier choice closed is still shown, with the reason,
      // so the player can see what shut it.
      const lock = choiceLock(host.s, opt);
      if (lock !== null) {
        // aria-disabled, not disabled, so a screen reader still reads the reason
        panel.append(el("button", { class: "btn choice locked", type: "button", "aria-disabled": "true" }, [el("span", { class: "choice-text", text: opt.text }), el("span", { class: "choice-lock", text: lock })]));
        return;
      }
      const b = el("button", { class: "btn choice", type: "button", text: opt.text });
      b.addEventListener("click", () => {
        audio.click();
        applyChoice(host, opt);
        if (opt.reply && opt.reply.length) {
          playDialogue(host, opt.reply, undefined, onDone);
        } else {
          onDone();
        }
      });
      panel.append(b);
    });
    mount(box, panel);
    panel.querySelector<HTMLButtonElement>("button:not(.locked)")?.focus();
  };

  if (!lines.length) finishLines();
  else if (host.meta.settings.fastDialogue && lines.length > 1) showAll();
  else showLine();
}

export function applyChoice(host: Host, opt: SceneChoice): void {
  (opt.setFlags ?? []).forEach((f) => setFlag(host.s, f));
  (opt.clearFlags ?? []).forEach((f) => {
    const idx = host.s.flags.indexOf(f);
    if (idx >= 0) host.s.flags.splice(idx, 1);
  });
  host.s.integrity += opt.integrity ?? 0;
  host.persist();
}
