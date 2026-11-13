import type { Dept, SingleQuestion, Ticket } from "../engine/types";
import { setFlag, trackFlag } from "../engine/state";
import { audio } from "../audio/audio";
import { charName } from "../content/characters";
import { screeningFor } from "../content/screenings";
import { practicalFor } from "../content/practicals";
import { el, mount, shuffled } from "./dom";
import type { Host } from "./host";
import { playDialogue } from "./dialogue";
import { renderEvidence } from "./evidence";
import { type QuestionContext, buildQuestion } from "./questions";

// The screening for a team: an intro, questions one at a time, a hands-on task
// on the team's own tool, then a verdict.

// ----------------------------------------------------------------- screening
export function screenScreening(host: Host): void {
  const iv = screeningFor(host.s.track as Dept);
  if (!iv) {
    host.s.track = null;
    host.render();
    return;
  }
  // intro dialogue, then questions one at a time, then verdict. Each sitting
  // draws its own questions from the pool, so a retry is a new screening.
  // The last of the asks is the hands-on task, so the quiz is one shorter.
  const asked = shuffled(iv.questions).slice(0, iv.asks - 1);
  playDialogue(host, iv.intro.map((t) => ({ who: iv.screener, text: t })), undefined, () => {
    runScreeningQuestions(host, asked, 0, 0);
  });
}

export function runScreeningQuestions(host: Host, asked: SingleQuestion[], i: number, correct: number): void {
  const iv = screeningFor(host.s.track as Dept)!;
  if (i === asked.length) {
    runPractical(host, asked.length, correct);
    return;
  }
  if (i > asked.length) {
    host.s.screeningScore = correct;
    const hired = correct >= iv.passLine;
    const lines = (hired ? iv.hiredText : iv.rejectedText).map((t) => ({ who: iv.screener, text: t }));
    playDialogue(host, lines, undefined, () => {
      if (hired) {
        host.s.hired = true;
        setFlag(host.s, trackFlag(iv.dept));
        host.s.chapter = 1;
        host.s.xp = 0;
        audio.rankUp();
        host.persist();
        host.render();
      } else {
        // rejection is recorded. You can retry, but it goes on the board.
        host.s.screeningFails++;
        host.showToast("Screening failed. It stays on your record.");
        host.s.track = null;
        host.persist();
        host.render();
      }
    });
    return;
  }
  const q = asked[i];
  const head = el("div", { class: "iv-head" }, [
    host.portrait(iv.screener, 72),
    el("div", {}, [
      el("div", { class: "iv-who", text: charName(iv.screener) }),
      el("div", { class: "iv-count", text: `Question ${i + 1} of ${asked.length + 1}` }),
    ]),
  ]);
  const prompt = el("p", { class: "q-prompt", text: q.prompt });
  const opts = el("div", { class: "q-opts" });
  let answered = false;
  // options appear in a new random order every time, so position gives nothing away
  const shown = shuffled(q.options.map((_, i) => i));
  shown.forEach((oi) => {
    const b = el("button", { class: "opt", type: "button", text: q.options[oi] });
    b.addEventListener("click", () => {
      if (answered) return;
      answered = true;
      const right = oi === q.answer;
      [...opts.children].forEach((c, pos) => {
        c.classList.add("locked");
        if (shown[pos] === q.answer) c.classList.add("correct");
        else if (shown[pos] === oi) c.classList.add("wrong");
      });
      if (right) audio.correct();
      else audio.wrong();
      const explain = el("div", { class: right ? "explain good" : "explain bad" }, [
        el("p", { text: right ? q.explainRight : q.explainWrong }),
      ]);
      const next = el("button", { class: "btn primary small", type: "button", text: "Next question" });
      next.addEventListener("click", () => {
        audio.click();
        runScreeningQuestions(host, asked, i + 1, correct + (right ? 1 : 0));
      });
      explain.append(next);
      card.append(explain);
    });
    opts.append(b);
  });
  const card = el("div", { class: "card-panel iv-card" }, [head, prompt, opts]);
  host.stage.className = "stage";
  mount(host.stage, card);
}

/**
 * The hands-on task that ends a screening: one go at one small job on the
 * team's own tool. It counts as one of the questions.
 */
function runPractical(host: Host, asked: number, correct: number): void {
  const iv = screeningFor(host.s.track as Dept)!;
  const p = practicalFor(iv.dept, host.s.seed, host.s.screeningFails);
  // the question controls expect a case to look evidence up in
  const holder: Ticket = { id: `practical_${iv.dept}`, chapter: 0, dept: iv.dept, severity: "low", client: "", title: "", brief: [], evidence: p.evidence, questions: [p.question], xp: 0, closingRight: [] };
  const evPanel = el("div", { class: "ev-panel" }, p.evidence.map((ev) => renderEvidence(ev, { plain: p.question.type === "spot" })));
  const qPanel = el("div", { class: "q-panel" });
  const ctx: QuestionContext = { ticket: holder, evPanel, review: false, disarm: null };
  const control = buildQuestion(host, p.question, qPanel, ctx);

  const head = el("div", { class: "iv-head" }, [
    host.portrait(iv.screener, 72),
    el("div", {}, [
      el("div", { class: "iv-who", text: charName(iv.screener) }),
      el("div", { class: "iv-count", text: `Question ${asked + 1} of ${asked + 1}: hands-on` }),
    ]),
  ]);
  const feedback = el("div", { class: "ws-feedback" });
  const submit = el("button", { class: "btn primary", type: "button", text: "Submit answer" });
  submit.addEventListener("click", () => {
    audio.click();
    if (!control.ready()) {
      mount(feedback, el("p", { class: "warn", text: "Give your answer first. You get one go at this." }));
      control.focus();
      return;
    }
    ctx.disarm?.();
    const right = control.correct();
    control.reveal();
    qPanel.classList.add("done");
    if (right) audio.correct();
    else audio.wrong();
    const next = el("button", { class: "btn primary", type: "button", text: "See the verdict" });
    next.addEventListener("click", () => {
      audio.click();
      runScreeningQuestions(host, [], 1, correct + (right ? 1 : 0));
    });
    mount(feedback);
    submit.replaceWith(next);
    next.focus();
  });

  const card = el("div", { class: "card-panel iv-card iv-practical" }, [
    head,
    el("p", { class: "iv-say", text: p.intro }),
    // the one place a worked example is given: your first go on the tool. Hard mode goes without.
    host.s.hard ? el("span") : el("div", { class: "coach" }, [el("div", { class: "coach-head", text: "How to drive it" }), el("p", { class: "coach-tip", text: p.howTo })]),
    evPanel,
    qPanel,
    feedback,
    submit,
  ]);
  host.stage.className = "stage";
  mount(host.stage, card);
}

