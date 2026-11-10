import { unlockCodex } from "../engine/state";
import { type QueueAlert, callOn, decide, looksAllowed, looksLeft, openAlert, rightCall, waiting } from "../engine/triage";
import { audio } from "../audio/audio";
import { chapterPlan } from "../content/chapters";
import { queueFor } from "../content/queue";
import { el, mount } from "./dom";
import type { Host } from "./host";

// The alert queue screen. More alerts than there is time for: open the ones
// you judge worth a look, call each one you open, and leave the rest to age
// out. Nothing here is graded like a case. What you catch and what you miss
// comes back in the story.

export function screenTriage(host: Host): void {
  const queue = queueFor(host.s.chapter, host.s.seed);
  const plan = chapterPlan(host.s.chapter);
  const left = looksLeft(host.s, queue);
  const unopened = waiting(host.s, queue).length;

  const head = el("div", { class: "desk-head" }, [
    el("div", { class: "chapter-badge", text: plan ? `${plan.title}: ${plan.subtitle}` : "" }),
    el("h2", { class: "chapter-title", text: "Alert queue" }),
    el("p", {
      class: "desk-note triage-left",
      text: left > 0 && unopened > 0 ? `Time to open ${left} more. The rest age out when you continue the day.` : "No time left for more. Whatever you did not open ages out when you continue the day.",
    }),
  ]);
  const coach = el("div", { class: "coach" }, [
    el("div", { class: "coach-head", text: "How the queue works" }),
    el("p", { class: "coach-tip", text: `${queue.length} alerts came in, and there is time to open ${looksAllowed(host.s)}. The severity is the tool's guess, not the truth. Open an alert to read it, then make the call: escalate what is real, close what is not.` }),
  ]);

  const list = el("div", { class: "triage-list" });
  for (const a of queue) list.append(alertCard(host, queue, a));

  const back = el("button", { class: "btn primary", type: "button", text: "Back to the desk" });
  back.addEventListener("click", () => {
    audio.click();
    host.screenChapter();
  });

  host.stage.className = "stage triage";
  mount(host.stage, head, coach, list, el("div", { class: "desk-footer" }, [back]));
}

function alertCard(host: Host, queue: readonly QueueAlert[], a: QueueAlert): HTMLElement {
  const call = callOn(host.s, a);
  const card = el("article", { class: `alert${call ? ` al-${call}` : ""}`, "data-alert": a.id });
  card.append(
    el("div", { class: "tk-top" }, [el("span", { class: `tk-sev inline sev-${a.severity}`, text: a.severity.toUpperCase() }), el("span", { class: "al-source", text: a.source })]),
    el("div", { class: "tk-title", text: a.title }),
  );

  if (call === undefined) {
    const can = looksLeft(host.s, queue) > 0;
    const open = el("button", { class: "btn ghost small al-open", type: "button", text: can ? "Open" : "No time left", disabled: !can });
    open.addEventListener("click", () => {
      audio.click();
      if (!openAlert(host.s, queue, a)) return;
      host.persist();
      screenTriage(host);
    });
    card.append(open);
    return card;
  }

  if (call === "aged") {
    card.append(el("p", { class: "al-verdict muted", text: "Aged out. Nobody opened it." }));
    return card;
  }

  card.append(el("ul", { class: "al-details" }, a.details.map((d) => el("li", { text: d }))));

  if (call === "opened") {
    const make = (label: string, cls: string, what: "escalated" | "closed"): HTMLElement => {
      const b = el("button", { class: `btn small ${cls}`, type: "button", text: label });
      b.addEventListener("click", () => {
        const right = decide(host.s, a, what);
        if (right) {
          audio.correct();
          unlockCodex(host.s, "triage");
        } else audio.wrong();
        host.persist();
        host.showToast(right ? "Right call" : "Wrong call");
        screenTriage(host);
      });
      return b;
    };
    // neither call is the default, so neither button is the loud one
    card.append(el("div", { class: "btn-row" }, [make("Escalate: this is real", "ghost al-escalate", "escalated"), make("Close: benign", "ghost al-close", "closed")]));
    return card;
  }

  const right = rightCall(a, call);
  const yours = call === "escalated" ? "You escalated it." : "You closed it as benign.";
  const truth = a.real ? "It was real." : "It was benign.";
  card.append(el("div", { class: right ? "explain good" : "explain bad" }, [el("p", { class: "al-verdict", text: `${right ? "Right call" : "Wrong call"}. ${yours} ${truth}` }), el("p", { text: a.why })]));
  return card;
}
