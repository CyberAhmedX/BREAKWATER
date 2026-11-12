import type { Evidence, Question, Ticket } from "../engine/types";
import { hasFlag, setFlag, HINT_COST } from "../engine/state";
import { pickTargets } from "../engine/pick";
import { answerMatches } from "../engine/answer";
import { rulesPass, replay, RuleError } from "../engine/firewall";
import { goalMet, goalsMet, MFA_LABEL, type ConsoleAction } from "../engine/console";
import { offsetsRight, offsetLabel } from "../engine/timeline";
import { audio } from "../audio/audio";
import { consoleStateOf } from "./console";
import { mergeOffsetsOf } from "./merge";
import { requestProvedOf } from "./request";
import { el, mount, clear, shuffled } from "./dom";
import { type QuestionControl, markBlock, scrollMotion, scopeQuestion, cvssQuestion, iocQuestion, mapQuestion, detectQuestion, reportQuestion } from "./controls";
import { type Host, hintFlag } from "./host";

// One control per question in a case. The classic kinds (pick one, pick many,
// put in order, a judgment call) and the ones that read a tool in the evidence
// column are built here; the self-contained hands-on kinds are in controls.ts.

export interface QuestionContext {
  ticket: Ticket;
  evPanel: HTMLElement;
  review: boolean;
  disarm: (() => void) | null; // stops whichever spot question is picking
}

// ----------------------------------------------------------------- questions
export function buildQuestion(host: Host, q: Question, panel: HTMLElement, ctx: QuestionContext): QuestionControl {
  const wrap = el("div", { class: "q-block" });
  wrap.append(el("p", { class: "q-prompt", text: q.prompt }));
  if (q.type !== "decision" && q.hint && !ctx.review && !host.s.hard) wrap.append(hintBox(host, q.hint, hintFlag(q)));
  panel.append(wrap);

  if (q.type === "spot") return spotQuestion(q, wrap, ctx);
  if (q.type === "typed") return typedQuestion(q, wrap);
  if (q.type === "rules") return rulesQuestion(q, wrap, ctx);
  if (q.type === "console") return consoleQuestion(q, wrap, ctx);
  if (q.type === "merge") return mergeQuestion(q, wrap, ctx);
  if (q.type === "request") return requestQuestion(q, wrap, ctx);
  if (q.type === "cvss") return cvssQuestion(q, wrap);
  if (q.type === "iocs") return iocQuestion(q, wrap);
  if (q.type === "attack-map") return mapQuestion(q, wrap);
  if (q.type === "detect") return detectQuestion(q, wrap);
  if (q.type === "report") return reportQuestion(q, wrap);
  if (q.type === "scope") {
    const ev = ctx.ticket.evidence.find((e) => e.id === q.evidence);
    if (ev?.kind !== "scope") throw new Error(`${q.id}: ${q.evidence} is not a scope checker`);
    return scopeQuestion(q, wrap, ev);
  }

  // options appear in a new random order every time, so position gives nothing away
  if (q.type === "single") {
    let sel = -1;
    const shown = shuffled(q.options.map((_, i) => i));
    const opts = el("div", { class: "q-opts" });
    shown.forEach((oi) => {
      const b = el("button", { class: "opt", type: "button", text: q.options[oi] });
      b.addEventListener("click", () => {
        sel = oi;
        [...opts.children].forEach((c, pos) => c.classList.toggle("sel", shown[pos] === oi));
        audio.type();
      });
      opts.append(b);
    });
    wrap.append(opts);
    const expl = el("div", { class: "explain", hidden: true });
    wrap.append(expl);
    return {
      ready: () => sel >= 0,
      correct: () => sel === q.answer,
      reveal: () => {
        [...opts.children].forEach((c, pos) => {
          c.classList.toggle("correct", shown[pos] === q.answer);
          c.classList.toggle("wrong", shown[pos] === sel && sel !== q.answer);
        });
        expl.hidden = false;
        expl.className = sel === q.answer ? "explain good" : "explain bad";
        mount(expl, el("p", { text: sel === q.answer ? q.explainRight : q.explainWrong }));
      },
      mark: () => markBlock(wrap, sel === q.answer),
      apply: () => {},
      focus: () => wrap.scrollIntoView({ behavior: scrollMotion(), block: "center" }),
    };
  }

  if (q.type === "multi") {
    const sel = new Set<number>();
    const shown = shuffled(q.options.map((_, i) => i));
    const opts = el("div", { class: "q-opts" });
    shown.forEach((oi) => {
      const b = el("button", { class: "opt check", type: "button" }, [
        el("span", { class: "box" }),
        el("span", { text: q.options[oi] }),
      ]);
      b.addEventListener("click", () => {
        if (sel.has(oi)) sel.delete(oi);
        else sel.add(oi);
        b.classList.toggle("sel", sel.has(oi));
        audio.type();
      });
      opts.append(b);
    });
    wrap.append(opts);
    const expl = el("div", { class: "explain", hidden: true });
    wrap.append(expl);
    const want = new Set(q.answer);
    const isRight = (): boolean => sel.size === want.size && [...want].every((x) => sel.has(x));
    return {
      ready: () => sel.size > 0,
      correct: isRight,
      reveal: () => {
        [...opts.children].forEach((c, pos) => {
          const oi = shown[pos];
          c.classList.toggle("correct", want.has(oi));
          c.classList.toggle("wrong", sel.has(oi) && !want.has(oi));
        });
        expl.hidden = false;
        expl.className = isRight() ? "explain good" : "explain bad";
        mount(expl, el("p", { text: isRight() ? q.explainRight : q.explainWrong }));
      },
      mark: () => markBlock(wrap, isRight()),
      apply: () => {},
      focus: () => wrap.scrollIntoView({ behavior: scrollMotion(), block: "center" }),
    };
  }

  if (q.type === "order") {
    // never start already in the right order, or the question answers itself
    let order = shuffled(q.items.map((_, i) => i));
    while (order.length > 1 && order.every((v, i) => v === i)) order = shuffled(order);
    const list = el("ol", { class: "q-order" });
    const redraw = (): void => {
      clear(list);
      order.forEach((itemIdx, pos) => {
        const li = el("li", {}, [
          el("span", { class: "ord-num", text: String(pos + 1) }),
          el("span", { class: "ord-text", text: q.items[itemIdx] }),
          el("span", { class: "ord-btns" }, [
            mkArrow("up", pos > 0, () => {
              [order[pos - 1], order[pos]] = [order[pos], order[pos - 1]];
              audio.type();
              redraw();
            }),
            mkArrow("down", pos < order.length - 1, () => {
              [order[pos + 1], order[pos]] = [order[pos], order[pos + 1]];
              audio.type();
              redraw();
            }),
          ]),
        ]);
        list.append(li);
      });
    };
    redraw();
    wrap.append(list);
    const expl = el("div", { class: "explain", hidden: true });
    wrap.append(expl);
    const isRight = (): boolean => order.every((v, i) => v === i);
    return {
      ready: () => true,
      correct: isRight,
      reveal: () => {
        expl.hidden = false;
        expl.className = isRight() ? "explain good" : "explain bad";
        mount(expl, el("p", { text: isRight() ? q.explainRight : q.explainWrong }));
      },
      mark: () => markBlock(wrap, isRight()),
      apply: () => {},
      focus: () => wrap.scrollIntoView({ behavior: scrollMotion(), block: "center" }),
    };
  }

  // decision
  let chosen = -1;
  const opts = el("div", { class: "q-opts decision" });
  const result = el("div", { class: "decision-result", hidden: true });
  q.options.forEach((o, oi) => {
    const b = el("button", { class: "opt decision-opt", type: "button", text: o.text });
    b.addEventListener("click", () => {
      if (chosen >= 0) return;
      chosen = oi;
      [...opts.children].forEach((c, ci) => {
        c.classList.add("locked");
        if (ci === oi) c.classList.add("sel");
      });
      result.hidden = false;
      const d = o.integrity ?? 0;
      const cue = d < 0 ? "That bends the line. It will show in your conduct, and in how this ends." : d > 0 ? "That holds the line. It may cost you now, but it tells in how this ends." : "";
      mount(result, el("p", { text: o.result }), ...(cue ? [el("p", { class: "decision-cue muted", text: cue })] : []));
      audio.notify();
    });
    opts.append(b);
  });
  wrap.append(opts, result);
  return {
    ready: () => chosen >= 0,
    correct: () => true,
    reveal: () => {},
    mark: () => {},
    apply: (sv) => {
      const o = q.options[chosen];
      (o.setFlags ?? []).forEach((f) => setFlag(sv, f));
      (o.clearFlags ?? []).forEach((f) => {
        const idx = sv.flags.indexOf(f);
        if (idx >= 0) sv.flags.splice(idx, 1);
      });
      sv.integrity += o.integrity ?? 0;
    },
    focus: () => wrap.scrollIntoView({ behavior: scrollMotion(), block: "center" }),
  };
}

// A hint costs XP when the case closes. Bought hints are stored as flags, so a
// reload neither loses them nor makes them free.
export function hintBox(host: Host, hint: string, flag: string): HTMLElement {
  const box = el("div", { class: "hint" });
  const show = (): void => mount(box, el("p", { class: "hint-text", text: hint }));
  if (hasFlag(host.s, flag)) {
    show();
    return box;
  }
  const b = el("button", { class: "hint-btn", type: "button", text: `Hint (costs ${HINT_COST} XP)` });
  b.addEventListener("click", () => {
    audio.click();
    setFlag(host.s, flag);
    host.s.hintsUsed++;
    host.persist();
    show();
  });
  box.append(b);
  return box;
}

export function requestQuestion(q: Extract<Question, { type: "request" }>, wrap: HTMLElement, ctx: QuestionContext): QuestionControl {
  const ev = ctx.ticket.evidence.find((e) => e.id === q.evidence);
  if (ev?.kind !== "request") throw new Error(`${q.id}: ${q.evidence} is not a request editor`);
  const view = ctx.evPanel.querySelector<HTMLElement>(`[data-ev="${q.evidence}"]`)!;
  wrap.append(el("p", { class: "rules-progress", text: `Work in "${ev.label}". Submit once you have proved the bug.` }));
  const expl = el("div", { class: "explain", hidden: true });
  wrap.append(expl);
  const isRight = (): boolean => requestProvedOf(view);
  return {
    ready: () => true,
    correct: isRight,
    reveal: () => {
      expl.hidden = false;
      expl.className = isRight() ? "explain good" : "explain bad";
      mount(expl, el("p", { text: isRight() ? q.explainRight : q.explainWrong }));
    },
    mark: () => markBlock(wrap, isRight()),
    apply: () => {},
    focus: () => view.scrollIntoView({ behavior: scrollMotion(), block: "start" }),
  };
}

export function mergeQuestion(q: Extract<Question, { type: "merge" }>, wrap: HTMLElement, ctx: QuestionContext): QuestionControl {
  const ev = ctx.ticket.evidence.find((e) => e.id === q.evidence);
  if (ev?.kind !== "merge") throw new Error(`${q.id}: ${q.evidence} is not a timeline builder`);
  const view = ctx.evPanel.querySelector<HTMLElement>(`[data-ev="${q.evidence}"]`)!;
  const offsets = mergeOffsetsOf(view)!;
  wrap.append(el("p", { class: "rules-progress", text: `Set each log's clock in "${ev.label}". Submit when the merged timeline tells the true story.` }));
  const expl = el("div", { class: "explain", hidden: true });
  wrap.append(expl);
  const isRight = (): boolean => offsetsRight(ev.sources, offsets);
  return {
    ready: () => true,
    correct: isRight,
    reveal: () => {
      view.classList.add("tlb-done");
      expl.hidden = false;
      expl.className = isRight() ? "explain good" : "explain bad";
      mount(
        expl,
        el("p", { text: isRight() ? q.explainRight : q.explainWrong }),
        el(
          "ul",
          { class: "goal-list" },
          ev.sources.map((s) => {
            const met = (offsets[s.id] ?? 0) === s.offset;
            return el("li", { class: met ? "met" : "missed" }, [el("span", { class: "goal-mark", text: met ? "Right" : "Wrong" }), el("span", { text: `${s.name}: ${offsetLabel(s.offset)}` })]);
          }),
        ),
      );
    },
    mark: () => markBlock(wrap, isRight()),
    apply: () => {},
    focus: () => view.scrollIntoView({ behavior: scrollMotion(), block: "start" }),
  };
}

export function consoleQuestion(q: Extract<Question, { type: "console" }>, wrap: HTMLElement, ctx: QuestionContext): QuestionControl {
  const ev = ctx.ticket.evidence.find((e) => e.id === q.evidence);
  if (ev?.kind !== "console") throw new Error(`${q.id}: ${q.evidence} is not a console`);
  const view = ctx.evPanel.querySelector<HTMLElement>(`[data-ev="${q.evidence}"]`)!;
  const state = consoleStateOf(view)!;
  wrap.append(el("p", { class: "rules-progress", text: `Work in "${ev.label}". Submit when the account is safe.` }));
  const expl = el("div", { class: "explain", hidden: true });
  wrap.append(expl);
  const isRight = (): boolean => goalsMet(state, q.goals, ev.users);
  return {
    ready: () => true,
    correct: isRight,
    reveal: () => {
      view.classList.add("adm-done");
      expl.hidden = false;
      expl.className = isRight() ? "explain good" : "explain bad";
      mount(
        expl,
        el("p", { text: isRight() ? q.explainRight : q.explainWrong }),
        el(
          "ul",
          { class: "goal-list" },
          q.goals.map((g) => {
            const met = goalMet(state, g, ev.users);
            return el("li", { class: met ? "met" : "missed" }, [el("span", { class: "goal-mark", text: met ? "Done" : "Missed" }), el("span", { text: g.label })]);
          }),
        ),
        el("p", { class: "typed-way", text: "One way to do it:" }),
        el("ol", { class: "goal-steps" }, q.solution.map((a) => el("li", { text: describeAction(a, ev.users) }))),
      );
    },
    mark: () => markBlock(wrap, isRight()),
    apply: () => {},
    focus: () => view.scrollIntoView({ behavior: scrollMotion(), block: "start" }),
  };
}

export function rulesQuestion(q: Extract<Question, { type: "rules" }>, wrap: HTMLElement, ctx: QuestionContext): QuestionControl {
  const ev = ctx.ticket.evidence.find((e) => e.id === q.evidence);
  if (ev?.kind !== "firewall") throw new Error(`${q.id}: ${q.evidence} is not a firewall`);
  const view = ctx.evPanel.querySelector<HTMLElement>(`[data-ev="${q.evidence}"]`)!;
  const editor = view.querySelector<HTMLTextAreaElement>(".fw-rules")!;
  const progress = el("p", { class: "rules-progress", text: `Edit the rules in "${ev.label}", then replay the traffic to check them.` });
  const expl = el("div", { class: "explain", hidden: true });
  wrap.append(progress, expl);

  // keep a running score here too, so the answer column says where you stand
  view.addEventListener("tool-command", () => {
    try {
      const v = replay(editor.value, ev.flows, ev.zones);
      progress.textContent = `Last replay: ${v.filter((x) => x.ok).length} of ${ev.flows.length} flows right.`;
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      progress.textContent = "Last replay: the rules have an error.";
    }
  });
  const isRight = (): boolean => rulesPass(editor.value, ev.flows, ev.zones);
  return {
    ready: () => true,
    correct: isRight,
    reveal: () => {
      editor.readOnly = true;
      expl.hidden = false;
      expl.className = isRight() ? "explain good" : "explain bad";
      mount(
        expl,
        el("p", { text: isRight() ? q.explainRight : q.explainWrong }),
        el("p", { class: "typed-way", text: "One rule set that works:" }),
        el("pre", { class: "rules-solution", text: q.solution }),
      );
    },
    mark: () => markBlock(wrap, isRight()),
    apply: () => {},
    focus: () => {
      view.scrollIntoView({ behavior: scrollMotion(), block: "start" });
      editor.focus({ preventScroll: true });
    },
  };
}

export function typedQuestion(q: Extract<Question, { type: "typed" }>, wrap: HTMLElement): QuestionControl {
  const input = el("input", {
    class: "typed-input",
    type: "text",
    placeholder: q.placeholder ?? "Type your answer",
    "aria-label": q.prompt,
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
  }) as HTMLInputElement;
  const expl = el("div", { class: "explain", hidden: true });
  wrap.append(input, expl);
  // editing the answer clears the right/wrong mark from the last submit
  input.addEventListener("input", () => {
    wrap.classList.remove("q-right", "q-wrong");
    wrap.querySelector(".q-mark")?.remove();
  });
  const isRight = (): boolean => answerMatches(input.value, q.answer);
  // A secret question is optional: it never holds the case up, and it is
  // only judged when the case closes.
  if (q.secret) {
    wrap.classList.add("q-secret");
    wrap.prepend(el("p", { class: "secret-tag", text: "Optional. For the curious." }));
  }
  return {
    ready: () => !!q.secret || input.value.trim() !== "",
    correct: () => !!q.secret || isRight(),
    reveal: () => {
      input.readOnly = true;
      input.classList.toggle("right", isRight());
      input.classList.toggle("wrong", !isRight());
      expl.hidden = false;
      expl.className = isRight() ? "explain good" : "explain bad";
      if (q.secret && !isRight()) {
        // a secret is never handed over; it waits for the next run
        mount(expl, el("p", { text: "Not found this time. It is still in there, if you come back to this case." }));
        return;
      }
      const parts: HTMLElement[] = [el("p", { text: isRight() ? q.explainRight : q.explainWrong })];
      if (!isRight()) parts.push(el("p", { class: "typed-answer", text: `Answer: ${q.answer[0]}` }));
      if (q.solution) parts.push(el("p", { class: "typed-way" }, [el("span", { text: "One way to find it: " }), el("code", { text: q.solution.command })]));
      mount(expl, ...parts);
    },
    mark: () => {
      if (!q.secret) markBlock(wrap, isRight());
    },
    apply: (sv) => {
      if (q.secret && isRight()) setFlag(sv, q.secret);
    },
    focus: () => {
      wrap.scrollIntoView({ behavior: scrollMotion(), block: "center" });
      input.focus({ preventScroll: true });
    },
  };
}

export function spotQuestion(q: Extract<Question, { type: "spot" }>, wrap: HTMLElement, ctx: QuestionContext): QuestionControl {
  const ev = ctx.ticket.evidence.find((e) => e.id === q.evidence) as Evidence;
  const view = ctx.evPanel.querySelector<HTMLElement>(`[data-ev="${q.evidence}"]`)!;
  const labels = new Map(pickTargets(ev).map((p) => [p.key, p.label]));
  let sel: string | null = null;

  const pickBtn = el("button", { class: "btn ghost small spot-btn", type: "button", text: "Pick in the evidence" });
  const yours = el("p", { class: "spot-pick", text: "Nothing picked yet." });
  const expl = el("div", { class: "explain", hidden: true });
  wrap.append(pickBtn, yours, expl);

  const targets = (): HTMLElement[] => [...view.querySelectorAll<HTMLElement>("[data-pick]")];
  const banner = el("div", { class: "pick-banner", text: `${ev.label}: click the part you mean. Esc cancels.` });

  const disarm = (): void => {
    view.classList.remove("picking");
    banner.remove();
    targets().forEach((x) => {
      x.removeAttribute("tabindex");
      x.removeAttribute("role");
    });
    view.removeEventListener("click", onClick);
    view.removeEventListener("keydown", onKey);
    pickBtn.textContent = "Pick in the evidence";
    if (ctx.disarm === disarm) ctx.disarm = null;
  };
  const choose = (key: string): void => {
    sel = key;
    targets().forEach((x) => x.classList.toggle("picked", x.dataset.pick === key));
    const label = labels.get(key) ?? key;
    yours.textContent = `Your pick: ${label.length > 140 ? label.slice(0, 137) + "..." : label}`;
    audio.type();
    disarm();
    wrap.scrollIntoView({ behavior: scrollMotion(), block: "center" });
  };
  const onClick = (e: Event): void => {
    const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-pick]");
    if (hit && view.contains(hit)) choose(hit.dataset.pick!);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      disarm();
      pickBtn.focus();
      return;
    }
    if (e.key !== "Enter" && e.key !== " ") return;
    const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-pick]");
    if (!hit) return;
    e.preventDefault();
    choose(hit.dataset.pick!);
  };
  pickBtn.addEventListener("click", () => {
    audio.click();
    if (ctx.disarm === disarm) {
      disarm();
      return;
    }
    ctx.disarm?.();
    ctx.disarm = disarm;
    view.classList.remove("min"); // a minimized window has nothing to point at
    view.classList.add("picking");
    view.prepend(banner);
    targets().forEach((x) => {
      x.tabIndex = 0;
      x.setAttribute("role", "button");
    });
    view.addEventListener("click", onClick);
    view.addEventListener("keydown", onKey);
    pickBtn.textContent = "Cancel picking";
    view.scrollIntoView({ behavior: scrollMotion(), block: "start" });
    (targets().find((x) => x.classList.contains("picked")) ?? targets()[0])?.focus({ preventScroll: true });
  });

  const isRight = (): boolean => sel !== null && q.answer.includes(sel);
  return {
    ready: () => sel !== null,
    correct: isRight,
    reveal: () => {
      targets().forEach((x) => {
        x.classList.toggle("pick-right", q.answer.includes(x.dataset.pick!));
        x.classList.toggle("pick-wrong", x.dataset.pick === sel && !isRight());
      });
      expl.hidden = false;
      expl.className = isRight() ? "explain good" : "explain bad";
      mount(expl, el("p", { text: isRight() ? q.explainRight : q.explainWrong }));
    },
    mark: () => markBlock(wrap, isRight()),
    apply: () => {},
    focus: () => wrap.scrollIntoView({ behavior: scrollMotion(), block: "center" }),
  };
}

function describeAction(a: ConsoleAction, users: readonly { upn: string; rules: { id: string; name: string }[] }[]): string {
  switch (a.type) {
    case "reset":
      return `Reset the password for ${a.upn}.`;
    case "revoke":
      return `Revoke all of ${a.upn}'s sessions.`;
    case "delete-rule": {
      const r = users.find((u) => u.upn === a.upn)?.rules.find((x) => x.id === a.rule);
      return `Delete the mailbox rule "${r?.name ?? a.rule}".`;
    }
    case "mfa":
      return `Set MFA to ${MFA_LABEL[a.method].toLowerCase()}.`;
    case "block":
      return a.on ? `Block sign-in for ${a.upn}.` : `Allow sign-in for ${a.upn}.`;
    case "delete-user":
      return `Delete ${a.upn}.`;
  }
}

function mkArrow(dir: "up" | "down", enabled: boolean, on: () => void): HTMLElement {
  const b = el("button", { class: "ord-arrow", type: "button", text: dir === "up" ? "▲" : "▼", disabled: !enabled });
  if (enabled) b.addEventListener("click", on);
  return b;
}
