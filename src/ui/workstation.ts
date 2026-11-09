import type { Ticket } from "../engine/types";
import { DEPT_LABEL } from "../engine/types";
import { hasFlag } from "../engine/state";
import { firstToolUse, saveMeta } from "../engine/meta";
import { CROSSED_LINE, liveSeconds } from "../engine/live";
import { audio } from "../audio/audio";
import { el, mount } from "./dom";
import { renderEvidence } from "./evidence";
import type { QuestionControl } from "./controls";
import { type Host, attackTags, hintFlag } from "./host";
import { type QuestionContext, buildQuestion } from "./questions";

// The case workstation: evidence on one side, your analysis on the other, and
// the rules for submitting, retrying and closing a case.

// One plain, beginner-friendly line per hands-on tool, shown the first time a
// player meets it. Keyed by evidence kind or question type. No em dashes.
const TOOL_TIPS: Record<string, string> = {
  terminal: "New tool: the terminal. Type a command and press Enter, like grep lab-pc-07 dns.log, and chain them with pipes: cut -f2 dns.log | sort | uniq -c.",
  siem: "New tool: the SIEM. Filter with field=value, then pipe to stats, like action=failure | stats count by src_ip | sort -count.",
  firewall: "New tool: the firewall editor. Write allow and deny rules in order, then Replay traffic to see what each flow does. The first matching rule wins.",
  console: "New tool: the admin console. Lock a hijacked account down in order: reset the password, end its sessions, remove bad mail rules, fix MFA.",
  merge: "New tool: the timeline builder. Set each log's time zone so the events line up on one clock. Get it wrong and things happen out of order.",
  request: "New tool: the request editor. Change the request, press Send, and read the reply. Try changing an id to one that is not yours.",
  pivot: "New tool: the pivot board. Search a domain or address, then follow it to the rest of the attacker's infrastructure.",
  scope: "New tool: the scope checker. Tick only the addresses the engagement letter allows. Exclusions win, and anything not listed is out.",
  cvss: "New tool: the CVSS calculator. Pick a value for each metric to build the vector and get the score.",
  detect: "New tool: the detection rule editor. Write a rule, then test it against the replay. Catch the attack and stay quiet on the false alarms.",
  report: "New tool: write the report in your own words. It is checked for the key facts: what happened, from where, and the fix.",
  "attack-map": "New tool: map each behaviour you saw to its MITRE ATT&CK technique id. Look ids up in the matrix if you need to.",
  iocs: "New tool: paste the indicators onto the block list, defanged so nobody clicks them, like 203[.]0[.]113[.]77.",
};

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
  const controls: QuestionControl[] = t.questions.map((q) => buildQuestion(host, q, qPanel, ctx));

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
  if (!review) {
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

  const body = el("div", { class: "ws-body" }, [
    el("div", { class: "ws-col ws-evidence" }, [el("div", { class: "col-label", text: "Evidence" }), coach, evPanel]),
    el("div", { class: "ws-col ws-questions" }, [el("div", { class: "col-label", text: "Your analysis" }), qPanel, feedback, submit, stuck]),
  ]);

  if (review && t.attack?.length) head.append(attackTags(t));
  if (review && t.takeaways?.length) head.append(takeawayRow(t));

  host.stage.className = "stage ticket";
  mount(host.stage, head, body);
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
        const url = URL.createObjectURL(new Blob([f.text], { type: "text/plain" }));
        const a = el("a", { href: url, download: f.file });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      return b;
    }),
  ]);
}
