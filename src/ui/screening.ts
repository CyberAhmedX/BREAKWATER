import type { Dept, SingleQuestion } from "../engine/types";
import { setFlag, trackFlag } from "../engine/state";
import { audio } from "../audio/audio";
import { charName } from "../content/characters";
import { screeningFor } from "../content/screenings";
import { el, mount, shuffled } from "./dom";
import type { Host } from "./host";
import { playDialogue } from "./dialogue";

// The screening for a team: an intro, questions one at a time, then a verdict.

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
  const asked = shuffled(iv.questions).slice(0, iv.asks);
  playDialogue(host, iv.intro.map((t) => ({ who: iv.screener, text: t })), undefined, () => {
    runScreeningQuestions(host, asked, 0, 0);
  });
}

export function runScreeningQuestions(host: Host, asked: SingleQuestion[], i: number, correct: number): void {
  const iv = screeningFor(host.s.track as Dept)!;
  if (i >= asked.length) {
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
      el("div", { class: "iv-count", text: `Question ${i + 1} of ${asked.length}` }),
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
      const next = el("button", { class: "btn primary small", type: "button", text: i + 1 < asked.length ? "Next question" : "See the verdict" });
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
