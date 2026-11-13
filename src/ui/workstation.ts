import type { Ticket } from "../engine/types";
import { DEPT_LABEL } from "../engine/types";
import { hasFlag } from "../engine/state";
import { firstToolUse, saveMeta } from "../engine/meta";
import { CROSSED_LINE, liveSeconds } from "../engine/live";
import { audio } from "../audio/audio";
import { desktopFor } from "./desktop";
import { el, mount } from "./dom";
import { hit, shake } from "./effects";
import { renderEvidence } from "./evidence";
import type { QuestionControl } from "./controls";
import { type Host, attackTags, hintFlag } from "./host";
import { saveFile } from "./platform";
import { type QuestionContext, buildQuestion } from "./questions";

// The case workstation: evidence on one side, your analysis on the other, and
// the rules for submitting, retrying and closing a case.

// One plain line per hands-on tool on how it is driven. It is shown the first
// time a player meets the tool, and stays behind the ? on the tool afterwards.
// These remind you of the method and never name a case's own values, so they
// cannot hand over an answer: only a screening shows a worked example.
// Keyed by evidence kind or question type. No em dashes.
const TOOL_TIPS: Record<string, string> = {
  terminal: "The terminal. Type a command and press Enter. Look first with ls, cat and head. To find what stands out, cut out one column, then count what repeats with sort and uniq -c. A pipe (|) feeds one command into the next, and help lists them all.",
  siem: "The SIEM. Narrow the events down with field=value, then summarise what is left: | stats count by a field groups them, and | sort -count puts the biggest group first. Click a field name to add it to the search.",
  firewall: "The firewall editor. Write allow and deny rules in order, then Replay traffic to see what each flow does. The first matching rule wins, so order matters as much as the rules do.",
  console: "The admin console. Each button is one action on the account. Ask what the attacker can still use to get back in, and take those things away in an order that does not leave a door open behind you.",
  merge: "The timeline builder. Set each log's time zone so the events line up on one clock. If something happens before its cause, one of the clocks is still wrong.",
  request: "The request editor. Change one value in the request, press Send, and read the reply. Each reply tells you a little more about how the site behaves, so change one thing at a time.",
  pivot: "The pivot board. Search a domain or an address, then click a result to follow it. Keep going until nothing new turns up.",
  scope: "The scope checker. Type an address or a range and it tells you where it sits against the engagement letter. Exclusions win, and anything not listed is out.",
  cvss: "The CVSS calculator. Pick a value for each metric from what you saw, not what you fear. It builds the vector and the score for you.",
  detect: "The detection rule editor. Write a rule, then test it against the replay. A good rule catches the attack and stays quiet on the false alarms, so tighten it until both are true.",
  report: "Write the report in your own words, for someone who was not in the room: what happened, how it happened, where it came from, and the fix.",
  "attack-map": "Map each behaviour you saw to its MITRE ATT&CK technique id. Search the matrix by a plain word if you do not know the id.",
  iocs: "Put the indicators on the block list, one per line and defanged so nobody can click them, like bad[.]example.",
};

/** A ? that opens the tool's reminder line. */
function reminder(tip: string, label: string): { button: HTMLElement; strip: HTMLElement } {
  const strip = el("p", { class: "tool-reminder", hidden: true, text: tip });
  const button = el("button", { class: "win-btn win-help", type: "button", "aria-label": label, title: label, "aria-expanded": "false", text: "?" });
  button.addEventListener("click", () => {
    audio.click();
    strip.hidden = !strip.hidden;
    button.setAttribute("aria-expanded", String(!strip.hidden));
  });
  return { button, strip };
}

/** Seconds wrong on a live case cost. */
const LIVE_PENALTY = 15;

export function ticketWorkstation(host: Host, t: Ticket, review: boolean): void {
  const head = el("div", { class: "ws-head" }, [
    el("div", {}, [
      el("div", { class: `tk-sev inline sev-${t.severity}`, text: t.severity.toUpperCase() }),
      el("h2", { class: "ws-title", text: t.title }),
      el("div", { class: "ws-client", text: `${t.client} · ${t.team ?? DEPT_LABEL[t.dept]}` }),
    ]),
  ]);

  // evidence a spot question asks about is shown without warning marks
  const spotted = new Set(t.questions.flatMap((q) => (q.type === "spot" ? [q.evidence] : [])));
  const evPanel = el("div", { class: "ev-panel" }, t.evidence.map((ev) => renderEvidence(ev, { plain: spotted.has(ev.id) })));

  const qPanel = el("div", { class: "q-panel" });
  const ctx: QuestionContext = { ticket: t, evPanel, review, disarm: null };
  // count commands and searches, for the note on how directly you got there
  const used = { terminal: 0, siem: 0, firewall: 0, console: 0, merge: 0, request: 0, pivot: 0, scope: 0, attackdb: 0 };
  evPanel.addEventListener("tool-command", (e) => used[(e as CustomEvent<{ kind: keyof typeof used }>).detail.kind]++);
  const controls: QuestionControl[] = t.questions.map((q) => {
    const control = buildQuestion(host, q, qPanel, ctx);
    // a question that is itself a tool carries the tool's reminder (not on hard mode, which has no help)
    const block = qPanel.lastElementChild;
    if (TOOL_TIPS[q.type] && block && !review && !host.s.hard) {
      const r = reminder(TOOL_TIPS[q.type], "How this works");
      r.button.classList.add("q-help");
      block.prepend(r.button, r.strip);
    }
    return control;
  });

  const submit = el("button", { class: "btn primary", type: "button", text: review ? "Back to desk" : "Submit findings" });
  const feedback = el("div", { class: "ws-feedback" });

  // Critical cases bite: a limited number of tries, then the case is botched
  // and closes badly rather than letting you retry forever. Hard mode treats
  // every case that way, with a single try.
  const hard = host.s.hard;
  const critical = t.severity === "critical" || hard;
  // a live case is limited by its clock instead of by attempts
  const maxAttempts = hard ? 1 : t.live ? Infinity : critical ? 2 : Infinity;
  let wrong = 0;
  const clock = t.live && !review ? liveClock(host, t, () => closeCase(true)) : null;
  if (clock) head.append(clock.el);

  if (host.practice) {
    const leave = el("button", { class: "btn ghost small", type: "button", text: "Leave practice" });
    leave.addEventListener("click", () => {
      audio.click();
      host.leavePractice();
    });
    head.append(el("div", { class: "ws-practice" }, [el("span", { text: "Practice. Nothing here touches your run." }), leave]));
  }
  if (critical && !review) {
    feedback.append(
      el("p", {
        class: "warn-crit",
        text: hard
          ? "Hard mode. One attempt: a wrong answer and the case goes down as botched."
          : t.live
            ? "Live incident. You are racing the clock, and a wrong submit takes time off it."
            : `Critical case. You have ${maxAttempts} attempts before it goes down as botched.`,
      }),
    );
  }

  submit.addEventListener("click", () => {
    audio.click();
    if (review) {
      host.screenChapter();
      return;
    }
    const missing = controls.find((c) => !c.ready());
    if (missing) {
      mount(feedback, el("p", { class: "warn", text: "Answer every item before you submit." }));
      missing.focus();
      return;
    }
    const allCorrect = controls.every((c) => c.correct());
    if (!allCorrect) {
      wrong++;
      if (wrong >= maxAttempts) {
        // out of tries on a critical case: decisions still count, but the
        // investigation itself is botched.
        audio.wrong();
        closeCase(true);
        return;
      }
      // Say which answers are wrong, but never which option is right, so a
      // retry still means reading the evidence again.
      controls.forEach((c) => c.mark());
      audio.wrong();
      shake(qPanel);
      if (t.live) hit(host.root);
      const left = maxAttempts - wrong;
      let tail = critical && !t.live ? ` ${left} attempt${left === 1 ? "" : "s"} left.` : "";
      if (clock) {
        clock.penalty(LIVE_PENALTY);
        tail = ` That cost you ${LIVE_PENALTY} seconds.`;
      }
      mount(feedback, el("p", { class: "warn", text: `Not quite. The answers marked in red are wrong. Re-read the evidence and try again.${tail}` }));
      return;
    }
    audio.correct();
    closeCase(false);
  });

  // Show every answer with its explanation, then leave the case on a click,
  // so the teaching notes are actually read.
  const closeCase = (botched: boolean): void => {
    clock?.stop();
    ctx.disarm?.();
    controls.forEach((c) => c.reveal());
    controls.forEach((c) => c.apply(host.s));
    qPanel.classList.add("done");
    const done = el("button", { class: "btn primary", type: "button", text: "Close the case" });
    done.addEventListener("click", () => {
      audio.click();
      const hints = t.questions.filter((q) => hasFlag(host.s, hintFlag(q))).length;
      host.completeTicket(t, { wrongAttempts: wrong, botched, hints });
    });
    mount(
      feedback,
      el("p", {
        class: botched ? "warn" : "good-note",
        text: botched
          ? t.live && clock?.expired()
            ? "Out of time. Read what each answer should have been, then close the case."
            : "Out of attempts. Read what each answer should have been, then close the case."
          : "Solved. Read the notes on each answer, then close the case.",
      }),
    );
    if (!botched && t.takeaways?.length) feedback.append(takeawayRow(t));
    const ran = [
      used.terminal ? `${used.terminal} command${used.terminal === 1 ? "" : "s"}` : "",
      used.siem ? `${used.siem} search${used.siem === 1 ? "" : "es"}` : "",
      used.firewall ? `${used.firewall} replay${used.firewall === 1 ? "" : "s"}` : "",
      used.console ? `${used.console} admin action${used.console === 1 ? "" : "s"}` : "",
      used.merge ? `${used.merge} clock change${used.merge === 1 ? "" : "s"}` : "",
      used.request ? `${used.request} request${used.request === 1 ? "" : "s"}` : "",
      used.pivot ? `${used.pivot} lookup${used.pivot === 1 ? "" : "s"}` : "",
      used.scope ? `${used.scope} scope check${used.scope === 1 ? "" : "s"}` : "",
      used.attackdb ? `${used.attackdb} ATT&CK search${used.attackdb === 1 ? "" : "es"}` : "",
    ].filter(Boolean);
    if (ran.length) feedback.append(el("p", { class: "muted", text: `You ran ${ran.join(" and ")}.` }));
    if (t.attack?.length) feedback.append(attackTags(t));
    submit.replaceWith(done);
    done.focus();
  };

  // First-use onboarding: the first time a player meets a hands-on tool, show
  // one plain line on how to drive it, with an example. Shown once per tool,
  // never in review mode.
  const coachTips: string[] = [];
  if (!review && !host.s.hard) {
    const keys = new Set<string>();
    for (const ev of t.evidence) if (TOOL_TIPS[ev.kind]) keys.add(ev.kind);
    for (const q of t.questions) if (TOOL_TIPS[q.type]) keys.add(q.type);
    for (const k of keys) if (firstToolUse(host.meta, k)) coachTips.push(TOOL_TIPS[k]);
    if (coachTips.length) saveMeta(host.meta);
  }
  const coach = coachTips.length
    ? el("div", { class: "coach" }, [
        el("div", { class: "coach-head", text: coachTips.length > 1 ? "New tools for this case" : "New tool for this case" }),
        ...coachTips.map((tip) => el("p", { class: "coach-tip", text: tip })),
      ])
    : el("span");

  // A quiet "Stuck?" line so a player who is blocked has somewhere to go.
  const stuck =
    review || host.practice
      ? el("span")
      : el("p", { class: "ws-stuck muted" }, [
          el("span", { text: "Stuck? Use a hint if there is one, re-read the evidence, or " }),
          el("a", { href: "https://github.com/CyberAhmedX/BREAKWATER/issues", target: "_blank", rel: "noopener", text: "tell me where you got stuck." }),
        ]);

  // Your analysis is a window of its own, beside the evidence.
  const notes = el("div", { class: "ev win-notes" }, [
    el("div", { class: "ev-head" }, [el("span", { class: "ev-tag", text: "NOTES" }), el("span", { class: "ev-label", text: "Your analysis" })]),
    el("div", { class: "win-body" }, [qPanel, feedback, submit, stuck]),
  ]);
  const body = el("div", { class: "ws-body" }, [
    el("div", { class: "ws-col ws-evidence" }, [coach, evPanel]),
    el("div", { class: "ws-col ws-questions" }, [notes]),
  ]);

  if (review && t.attack?.length) head.append(attackTags(t));
  if (review && t.takeaways?.length) head.append(takeawayRow(t));

  const desk = el("div", { class: "os-desk" }, [head, body]);
  const windows = [...evPanel.querySelectorAll<HTMLElement>(":scope > .ev"), notes];
  host.stage.className = "stage ticket";
  mount(host.stage, desk, desktopFor(desk, windows, host.s.playerName, host.s.chapter));

  // every tool keeps its reminder behind a ? in its title bar
  if (!review && !host.s.hard) {
    for (const ev of t.evidence) {
      const win = evPanel.querySelector<HTMLElement>(`[data-ev="${ev.id}"]`);
      const head = win?.querySelector(".ev-head");
      if (!TOOL_TIPS[ev.kind] || !win || !head) continue;
      const r = reminder(TOOL_TIPS[ev.kind], "How this tool works");
      head.querySelector(".win-btns")?.prepend(r.button);
      head.after(r.strip);
    }
  }
}

/** The countdown on a live case. It stops itself once the case leaves the screen. */
export function liveClock(host: Host, t: Ticket, onExpire: () => void): { el: HTMLElement; penalty(s: number): void; stop(): void; expired(): boolean } {
  let left = liveSeconds(t, host.s, host.meta.settings.relaxedTimers);
  const text = el("span", { class: "live-time" });
  const box = el("div", { class: "live-clock", role: "timer", "aria-label": "Time left" }, [el("span", { class: "live-dot" }), el("span", { class: "live-k", text: "LIVE" }), text]);
  const note = hasFlag(host.s, CROSSED_LINE) ? el("span", { class: "live-note", text: "Half time: the attacker is using the door you opened." }) : el("span");
  const wrapEl = el("div", { class: "live-row" }, [box, note]);
  let done = false;
  let expired = false;
  const draw = (): void => {
    const m = Math.floor(Math.max(0, left) / 60);
    const sec = Math.max(0, left) % 60;
    text.textContent = `${m}:${String(sec).padStart(2, "0")}`;
    box.classList.toggle("low", left <= 30);
  };
  draw();
  const timer = window.setInterval(() => {
    if (done) return;
    if (!document.body.contains(box)) {
      stop();
      return;
    }
    left--;
    draw();
    if (left <= 10 && left > 0) audio.type();
    if (left <= 0) {
      expired = true;
      stop();
      audio.wrong();
      onExpire();
    }
  }, 1000);
  const stop = (): void => {
    done = true;
    clearInterval(timer);
  };
  return {
    el: wrapEl,
    penalty: (n) => {
      left = Math.max(1, left - n);
      draw();
    },
    stop,
    expired: () => expired,
  };
}

/** Download buttons for the files a solved case lets you take home. */
export function takeawayRow(t: Ticket): HTMLElement {
  return el("div", { class: "takeaways" }, [
    el("span", { class: "attack-k", text: "Take home" }),
    ...(t.takeaways ?? []).map((f) => {
      const b = el("button", { class: "btn ghost small", type: "button", text: f.label });
      b.addEventListener("click", () => {
        audio.click();
        void saveFile(f.file, new Blob([f.text], { type: "text/plain" }));
      });
      return b;
    }),
  ]);
}
