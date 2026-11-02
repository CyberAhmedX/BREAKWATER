import type { Chapter, Dept, Evidence, Scene, SceneChoice, SceneLine, SingleQuestion, Ticket, Question } from "../engine/types";
import { DEPTS, DEPT_LABEL } from "../engine/types";
import {
  type SaveData,
  freshSave,
  load,
  save,
  wipe,
  rankTitle,
  rankIndex,
  rankProgress,
  conduct,
  accuracy,
  hasAll,
  hasNone,
  visibleLines,
  setFlag,
  markDone,
  isDone,
  unlockCodex,
  xpForClose,
  hasFlag,
  HINT_COST,
  trackFlag,
} from "../engine/state";
import { pickTargets } from "../engine/pick";
import { answerMatches } from "../engine/answer";
import { rulesPass, replay, RuleError } from "../engine/firewall";
import { goalMet, goalsMet, MFA_LABEL, type ConsoleAction } from "../engine/console";
import { consoleStateOf } from "./console";
import { offsetsRight, offsetLabel } from "../engine/timeline";
import { mergeOffsetsOf } from "./merge";
import { requestProvedOf } from "./request";
import { resolveEnding, ENDINGS, ENDING_ORDER } from "../engine/endings";
import {
  type MetaData,
  TEXT_SCALES,
  loadMeta,
  saveMeta,
  wipeMeta,
  freshMeta,
  recordEnding,
  recordCodex,
  recordCases,
  recordSecrets,
  recordCheckpoint,
  checkpointCopy,
  canSelectChapter,
  hasSeenScene,
  markSceneSeen,
  firstToolUse,
} from "../engine/meta";
import { ACHIEVEMENTS, checkAchievements } from "../engine/achievements";
import { makeBundle, bundleToCode, bundleToFile, readSave, fileName } from "../engine/transfer";
import { OfficeScene } from "../scene/office";
import { drawPortrait } from "../scene/portraits";
import { audio } from "../audio/audio";
import { CHARACTERS, charName } from "../content/characters";
import { SCREENINGS, screeningFor } from "../content/screenings";
import { TICKETS, ticketById } from "../content/tickets";
import { SCENES, sceneById } from "../content/scenes";
import { CHAPTERS, chapterPlan } from "../content/chapters";
import { CODEX } from "../content/codex";
import { SECRETS } from "../content/secrets";
import { withRunData } from "../content/vary";
import { el, mount, clear, shuffled } from "./dom";
import { renderEvidence } from "./evidence";
import { drawShareCard, shareFileName } from "./sharecard";
import { CROSSED_LINE, liveSeconds } from "../engine/live";
import { type QuestionControl, markBlock, scrollMotion, scopeQuestion, cvssQuestion, iocQuestion, mapQuestion, detectQuestion, reportQuestion } from "./controls";

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

export class App {
  private root: HTMLElement;
  private stage: HTMLElement;
  private topbar: HTMLElement;
  private scene: OfficeScene;
  private s: SaveData;
  private meta: MetaData;
  private toasts: HTMLElement;
  // The title screen opens every visit, so returning players press Continue,
  // and that click is what lets the browser start the audio.
  private started = false;
  // While a case is practised, this holds the real run; this.s is a scratch copy.
  private practice: { real: SaveData } | null = null;

  constructor(root: HTMLElement, bgCanvas: HTMLCanvasElement) {
    this.root = root;
    this.scene = new OfficeScene(bgCanvas);
    this.s = load();
    // saves from before track cases existed: give them their track flag
    if (this.s.hired && this.s.track) setFlag(this.s, trackFlag(this.s.track));
    this.meta = loadMeta();
    this.topbar = el("div", { class: "topbar", role: "banner" });
    this.stage = el("div", { class: "stage" });
    this.toasts = el("div", { class: "toasts", role: "status", "aria-live": "polite" });
    mount(this.root, this.topbar, this.stage, this.toasts);
    this.applySettings();
    this.scene.setChapter(this.s.chapter);
    // thunder follows the flash after a gap: short when the storm is overhead
    this.scene.onStrike = () => {
      if (!this.started) return;
      const near = this.s.chapter >= 5;
      const delay = near ? 200 + Math.random() * 600 : 900 + Math.random() * 1600;
      setTimeout(() => audio.thunder(near ? 1 : 0.55 + Math.random() * 0.2), delay);
    };
    this.scene.start();
    // Click a bit of the office that is not covered by UI to read some flavor.
    this.root.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, select, textarea, label, .opt, .ord-arrow, .ticket-card, .vn, .overlay, .card, .ws-col, .q-panel, .title-card, .decision-opt, .seg, .slider")) return;
      const lore = this.scene.inspect(e.clientX, e.clientY);
      if (lore) this.showToast(lore, 4200);
    });
    this.render();
  }

  private persist(): void {
    // practice never touches the run or the record
    if (this.practice) return;
    save(this.s);
    recordCodex(this.meta, this.s.codex);
    recordCases(this.meta, this.s.done.filter((id) => ticketById(id)));
    recordSecrets(this.meta, this.s.flags);
    for (const a of checkAchievements(this.s, this.meta)) this.showToast(`Achievement: ${a.title}`);
    saveMeta(this.meta);
  }

  private applySettings(): void {
    const set = this.meta.settings;
    audio.setMuted(set.muted);
    audio.setMusicVolume(set.music);
    audio.setEffectsVolume(set.effects);
    document.documentElement.style.setProperty("--ts", String(set.textScale));
    const reduce = set.reducedMotion ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.classList.toggle("reduce-motion", reduce);
    this.scene.setReducedMotion(set.reducedMotion);
  }

  // A click on the title screen is what lets the browser start the audio.
  private startSession(): void {
    this.started = true;
    audio.init();
    audio.startMusic();
    audio.setChapter(0);
  }

  private portrait(key: string, size = 96): HTMLCanvasElement {
    const c = el("canvas", { class: "portrait", width: size, height: size, "aria-hidden": "true" });
    drawPortrait(c, key);
    return c;
  }

  // ----------------------------------------------------------------- top bar
  private renderTopbar(): void {
    const prog = rankProgress(this.s);
    const pct = prog.max ? 100 : Math.round((prog.have / prog.need) * 100);
    const left = el("div", { class: "tb-left" }, [el("span", { class: "tb-logo", text: "Breakwater" })]);

    let mid: HTMLElement;
    if (this.practice) {
      mid = el("div", { class: "tb-rank" }, [el("span", { class: "tb-rankname", text: "Practice" }), el("span", { class: "tb-mode", text: "nothing here touches your run" })]);
    } else if (this.s.hired) {
      const con = conduct(this.s);
      const sign = this.s.integrity >= 3 ? "good" : this.s.integrity >= 0 ? "mid" : "bad";
      mid = el("div", { class: "tb-rank" }, [
        el("span", { class: "tb-rankname", text: rankTitle(this.s) }),
        el("span", { class: `tb-conduct ${sign}`, title: con.note }, [
          el("span", { class: "tb-conduct-dot" }),
          el("span", { text: con.tier }),
        ]),
        el("div", { class: "xpbar" }, [el("div", { class: "xpfill", style: `width:${pct}%` })]),
        el("span", { class: "tb-xp", text: prog.max ? "max rank" : `${this.s.xp} XP` }),
      ]);
      if (this.s.hard) mid.append(el("span", { class: "tb-mode", text: "Hard mode" }));
    } else {
      mid = el("div", { class: "tb-rank" }, [el("span", { class: "tb-rankname", text: "Applicant" })]);
    }
    const btns = el("div", { class: "tb-right" }, [
      this.s.hired && !this.practice ? this.iconBtn("Field Notes", () => this.openCodex()) : el("span"),
      this.iconBtn("Settings", () => this.openSettings()),
      this.iconBtn(audio.isMuted ? "Sound off" : "Sound on", () => {
        this.meta.settings.muted = !audio.isMuted;
        this.applySettings();
        saveMeta(this.meta);
        this.renderTopbar();
      }),
    ]);
    mount(this.topbar, left, mid, btns);
  }

  private iconBtn(label: string, on: () => void): HTMLElement {
    const b = el("button", { class: "tb-btn", type: "button", text: label });
    b.addEventListener("click", () => {
      audio.click();
      on();
    });
    return b;
  }

  // ----------------------------------------------------------------- router
  private render(): void {
    this.renderTopbar();
    this.scene.setChapter(this.s.chapter);
    if (!this.started) {
      this.screenTitle();
      return;
    }
    if (!this.s.hired) {
      if (!this.s.track) {
        if (this.s.playerName === "") this.screenTitle();
        else this.screenTrack();
      } else {
        this.screenScreening();
      }
      return;
    }
    if (this.s.chapter >= 6) {
      this.screenEnding();
      return;
    }
    this.screenChapter();
  }

  // ----------------------------------------------------------------- title
  private screenTitle(): void {
    const begin = (): void => this.startSession();
    const resumeAvailable = this.s.playerName !== "";

    const nameInput = el("input", {
      class: "name-input",
      type: "text",
      id: "player-name",
      maxlength: 24,
      placeholder: "Your name",
      value: this.s.playerName,
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
      this.s = freshSave();
      this.s.playerName = name;
      this.s.hard = hardBox.checked;
      audio.click();
      this.persist();
      this.render();
    });

    const card = el("div", { class: "title-card" }, [
      el("h1", { class: "title-logo", text: "BREAKWATER" }),
      el("p", { class: "title-sub", text: "a cybersecurity career game" }),
      el("p", { class: "title-blurb", text: "You are the newest hire at Lanternhouse Security, a small firm keeping a rainy harbor town safe. Learn the trade, close the tickets, and find out what has been hiding in the quiet." },
      ),
      el("p", { class: "title-audience", text: "Made for students and beginners getting ready for a SOC or help desk job. Turn on Hard mode if you already do this for a living." }),
    ]);

    if (resumeAvailable) {
      const cont = el("button", { class: "btn primary", type: "button", text: `Continue as ${this.s.playerName}` });
      cont.addEventListener("click", () => {
        begin();
        audio.click();
        this.render();
      });
      card.append(cont, el("label", { class: "field-label", for: "player-name", text: "Or sign a new application" }), nameInput, hardRow, start);
    } else {
      card.append(el("label", { class: "field-label", for: "player-name", text: "Sign your application" }), nameInput, hardRow, start);
    }

    // Once you have finished a run, you can look back at it and replay a chapter.
    const extras = el("div", { class: "title-extras" });
    if (canSelectChapter(this.meta)) {
      const pick = el("button", { class: "btn ghost small", type: "button", text: "Replay a chapter" });
      pick.addEventListener("click", () => {
        audio.click();
        this.openChapterSelect();
      });
      extras.append(pick);
    }
    if (this.meta.casesEver.length > 0) {
      const practise = el("button", { class: "btn ghost small", type: "button", text: "Practice a case" });
      practise.addEventListener("click", () => {
        audio.click();
        this.openPractice();
      });
      extras.append(practise);
    }
    if (this.meta.endings.length > 0 || this.meta.achievements.length > 0) {
      const rec = el("button", { class: "btn ghost small", type: "button", text: "Endings and achievements" });
      rec.addEventListener("click", () => {
        audio.click();
        this.openRecord();
      });
      extras.append(rec);
    }
    // someone arriving on a new device brings their save with them
    const imp = el("button", { class: "btn ghost small", type: "button", text: "Import a save" });
    imp.addEventListener("click", () => {
      audio.click();
      this.openImport();
    });
    extras.append(imp);
    card.append(extras);

    this.stage.className = "stage center";
    mount(this.stage, card);
    const firstButton = card.querySelector("button");
    setTimeout(() => (resumeAvailable ? firstButton?.focus() : nameInput.focus()), 30);
  }

  // ----------------------------------------------------------------- track
  private screenTrack(): void {
    const title = el("div", { class: "screen-head" }, [
      el("h2", { text: `Welcome, ${this.s.playerName}.` }),
      el("p", { text: "Lanternhouse has openings across six teams. Pick the one you want to screen for. You will be asked real questions, so choose where your instincts are sharpest." }),
    ]);
    const grid = el("div", { class: "track-grid" });
    for (const dept of DEPTS) {
      const iv = screeningFor(dept);
      const card = el("button", { class: "track-card", type: "button" }, [
        this.portrait(iv ? iv.screener : "you", 72),
        el("div", { class: "track-name", text: DEPT_LABEL[dept] }),
        el("div", { class: "track-by", text: iv ? `Screener: ${charName(iv.screener)}` : "" }),
        el("div", { class: "track-desc", text: TRACK_PITCH[dept] }),
      ]);
      card.addEventListener("click", () => {
        audio.click();
        this.s.track = dept;
        this.s.screeningScore = 0;
        this.persist();
        this.render();
      });
      grid.append(card);
    }
    this.stage.className = "stage";
    mount(this.stage, title, grid);
  }

  // ----------------------------------------------------------------- screening
  private screenScreening(): void {
    const iv = screeningFor(this.s.track as Dept);
    if (!iv) {
      this.s.track = null;
      this.render();
      return;
    }
    // intro dialogue, then questions one at a time, then verdict. Each sitting
    // draws its own questions from the pool, so a retry is a new screening.
    const asked = shuffled(iv.questions).slice(0, iv.asks);
    this.playDialogue(iv.intro.map((t) => ({ who: iv.screener, text: t })), undefined, () => {
      this.runScreeningQuestions(asked, 0, 0);
    });
  }

  private runScreeningQuestions(asked: SingleQuestion[], i: number, correct: number): void {
    const iv = screeningFor(this.s.track as Dept)!;
    if (i >= asked.length) {
      this.s.screeningScore = correct;
      const hired = correct >= iv.passLine;
      const lines = (hired ? iv.hiredText : iv.rejectedText).map((t) => ({ who: iv.screener, text: t }));
      this.playDialogue(lines, undefined, () => {
        if (hired) {
          this.s.hired = true;
          setFlag(this.s, trackFlag(iv.dept));
          this.s.chapter = 1;
          this.s.xp = 0;
          audio.rankUp();
          this.persist();
          this.render();
        } else {
          // rejection is recorded. You can retry, but it goes on the board.
          this.s.screeningFails++;
          this.showToast("Screening failed. It stays on your record.");
          this.s.track = null;
          this.persist();
          this.render();
        }
      });
      return;
    }
    const q = asked[i];
    const head = el("div", { class: "iv-head" }, [
      this.portrait(iv.screener, 72),
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
          this.runScreeningQuestions(asked, i + 1, correct + (right ? 1 : 0));
        });
        explain.append(next);
        card.append(explain);
      });
      opts.append(b);
    });
    const card = el("div", { class: "card-panel iv-card" }, [head, prompt, opts]);
    this.stage.className = "stage";
    mount(this.stage, card);
  }

  // ----------------------------------------------------------------- chapter desk
  private screenChapter(): void {
    const plan = chapterPlan(this.s.chapter);
    if (!plan) {
      // past the last chapter: go to ending
      this.s.chapter = 6;
      this.persist();
      this.screenEnding();
      return;
    }
    // play intro scene once
    if (!isDone(this.s, `intro_${plan.chapter}`)) {
      // remember how the run stood when this chapter began, for chapter select
      recordCheckpoint(this.meta, this.s);
      saveMeta(this.meta);
      const sc = sceneById(plan.intro);
      if (sc) {
        this.playScene(sc, () => {
          markDone(this.s, `intro_${plan.chapter}`);
          this.persist();
          this.screenChapter();
        });
        return;
      }
    }

    const mainTickets = plan.main.map(ticketById).filter(isVisible(this.s)) as Ticket[];
    const sideTickets = plan.side.map(ticketById).filter(isVisible(this.s)) as Ticket[];
    const allMainDone = mainTickets.every((t) => isDone(this.s, t.id));

    const head = el("div", { class: "desk-head" }, [
      el("div", { class: "chapter-badge", text: `${plan.title}` }),
      el("h2", { class: "chapter-title", text: plan.subtitle }),
      el("p", { class: "desk-note", text: allMainDone ? "Caught up. When you are ready, carry on." : "Open tickets are waiting. Work them when you are ready." }),
    ]);

    const queue = el("div", { class: "queue" });
    for (const t of [...mainTickets, ...sideTickets]) {
      queue.append(this.ticketCard(t, isDone(this.s, t.id)));
    }

    const footer = el("div", { class: "desk-footer" });
    if (allMainDone) {
      const cont = el("button", { class: "btn primary", type: "button", text: this.s.chapter === 5 ? "Face the storm" : "Continue the day" });
      cont.addEventListener("click", () => {
        audio.click();
        this.runOutro(plan.outro, 0);
      });
      footer.append(cont);
    } else {
      footer.append(el("p", { class: "muted", text: `Close the remaining case${mainTickets.filter((t) => !isDone(this.s, t.id)).length > 1 ? "s" : ""} to continue.` }));
    }

    this.stage.className = "stage";
    mount(this.stage, head, queue, footer);
  }

  private ticketCard(t: Ticket, done: boolean): HTMLElement {
    const card = el("button", { class: `ticket-card sev-${t.severity}${done ? " done" : ""}${t.side ? " side" : ""}`, type: "button" }, [
      el("div", { class: "tk-top" }, [
        el("span", { class: "tk-sev", text: t.severity.toUpperCase() }),
        t.side ? el("span", { class: "tk-side", text: "SIDE" }) : el("span", { class: "tk-dept", text: DEPT_LABEL[t.dept] }),
        done ? el("span", { class: "tk-check", text: "CLOSED" }) : el("span", { class: "tk-xp", text: `${t.xp} XP` }),
      ]),
      el("div", { class: "tk-title", text: t.title }),
      el("div", { class: "tk-client", text: t.client }),
    ]);
    card.addEventListener("click", () => {
      audio.click();
      this.openTicket(t, done);
    });
    return card;
  }

  private runOutro(ids: string[], i: number): void {
    if (i >= ids.length) {
      // advance chapter
      this.s.chapter = (this.s.chapter + 1) as Chapter;
      this.persist();
      this.render();
      return;
    }
    const sc = sceneById(ids[i]);
    if (!sc || !isVisible(this.s)(sc) || isDone(this.s, sc.id)) {
      this.runOutro(ids, i + 1);
      return;
    }
    this.playScene(sc, () => {
      markDone(this.s, sc.id);
      this.persist();
      this.runOutro(ids, i + 1);
    });
  }

  // ----------------------------------------------------------------- ticket
  private openTicket(ticket: Ticket, review: boolean): void {
    // Fill in this run's case data before anything renders or grades, so the
    // evidence on screen and the answers are checked against the same values.
    const t = withRunData(ticket, this.s.seed);
    this.playDialogue(
      t.brief.map((text) => ({ who: speakerFor(t), text })),
      undefined,
      () => this.ticketWorkstation(t, review),
    );
  }

  private ticketWorkstation(t: Ticket, review: boolean): void {
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
    const controls: QuestionControl[] = t.questions.map((q) => this.buildQuestion(q, qPanel, ctx));

    const submit = el("button", { class: "btn primary", type: "button", text: review ? "Back to desk" : "Submit findings" });
    const feedback = el("div", { class: "ws-feedback" });

    // Critical cases bite: a limited number of tries, then the case is botched
    // and closes badly rather than letting you retry forever. Hard mode treats
    // every case that way, with a single try.
    const hard = this.s.hard;
    const critical = t.severity === "critical" || hard;
    // a live case is limited by its clock instead of by attempts
    const maxAttempts = hard ? 1 : t.live ? Infinity : critical ? 2 : Infinity;
    let wrong = 0;
    const clock = t.live && !review ? this.liveClock(t, () => closeCase(true)) : null;
    if (clock) head.append(clock.el);

    if (this.practice) {
      const leave = el("button", { class: "btn ghost small", type: "button", text: "Leave practice" });
      leave.addEventListener("click", () => {
        audio.click();
        this.leavePractice();
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
        this.screenChapter();
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
      controls.forEach((c) => c.apply(this.s));
      qPanel.classList.add("done");
      const done = el("button", { class: "btn primary", type: "button", text: "Close the case" });
      done.addEventListener("click", () => {
        audio.click();
        const hints = t.questions.filter((q) => hasFlag(this.s, hintFlag(q))).length;
        this.completeTicket(t, { wrongAttempts: wrong, botched, hints });
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
      if (!botched && t.takeaways?.length) feedback.append(this.takeawayRow(t));
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
      for (const k of keys) if (firstToolUse(this.meta, k)) coachTips.push(TOOL_TIPS[k]);
      if (coachTips.length) saveMeta(this.meta);
    }
    const coach = coachTips.length
      ? el("div", { class: "coach" }, [
          el("div", { class: "coach-head", text: coachTips.length > 1 ? "New tools for this case" : "New tool for this case" }),
          ...coachTips.map((tip) => el("p", { class: "coach-tip", text: tip })),
        ])
      : el("span");

    // A quiet "Stuck?" line so a player who is blocked has somewhere to go.
    const stuck =
      review || this.practice
        ? el("span")
        : el("p", { class: "ws-stuck muted" }, [
            el("span", { text: "Stuck? Use a hint if there is one, re-read the evidence, or " }),
            el("a", { href: "https://github.com/CyberAhmedX/dwell-time/issues", target: "_blank", rel: "noopener", text: "tell me where you got stuck." }),
          ]);

    const body = el("div", { class: "ws-body" }, [
      el("div", { class: "ws-col ws-evidence" }, [el("div", { class: "col-label", text: "Evidence" }), coach, evPanel]),
      el("div", { class: "ws-col ws-questions" }, [el("div", { class: "col-label", text: "Your analysis" }), qPanel, feedback, submit, stuck]),
    ]);

    if (review && t.attack?.length) head.append(attackTags(t));
    if (review && t.takeaways?.length) head.append(this.takeawayRow(t));

    this.stage.className = "stage ticket";
    mount(this.stage, head, body);
  }

  /** The countdown on a live case. It stops itself once the case leaves the screen. */
  private liveClock(t: Ticket, onExpire: () => void): { el: HTMLElement; penalty(s: number): void; stop(): void; expired(): boolean } {
    let left = liveSeconds(t, this.s, this.meta.settings.relaxedTimers);
    const text = el("span", { class: "live-time" });
    const box = el("div", { class: "live-clock", role: "timer", "aria-label": "Time left" }, [el("span", { class: "live-dot" }), el("span", { class: "live-k", text: "LIVE" }), text]);
    const note = hasFlag(this.s, CROSSED_LINE) ? el("span", { class: "live-note", text: "Half time: the attacker is using the door you opened." }) : el("span");
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
  private takeawayRow(t: Ticket): HTMLElement {
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

  private completeTicket(t: Ticket, grade: { wrongAttempts: number; botched: boolean; hints: number }): void {
    if (this.practice) {
      const how = grade.botched ? "Out of attempts. Try it again any time." : grade.wrongAttempts === 0 ? "Solved clean, first try." : `Solved after ${grade.wrongAttempts} wrong submit${grade.wrongAttempts === 1 ? "" : "s"}.`;
      const lines = grade.botched ? [{ who: "narration", text: how }] : [...t.closingRight.map((text) => ({ who: speakerFor(t), text })), { who: "narration", text: `Practice: ${how}` }];
      this.playDialogue(lines, undefined, () => this.leavePractice());
      return;
    }
    const beforeRank = rankIndex(this.s);
    const firstTime = !isDone(this.s, t.id);

    // XP scales with how cleanly you closed it. A clean first-try close earns a
    // bonus; retries dock it; a botched critical case barely pays and costs
    // integrity. Story flags always fire so the game never soft-locks.
    let toastMsg = "";
    if (firstTime) {
      this.s.totalCloses++;
      const gain = xpForClose(t.xp, grade);
      if (grade.botched) {
        this.s.integrity -= 1;
        this.s.botched++;
        setFlag(this.s, `botched_${t.id}`);
        toastMsg = `Case botched, +${gain} XP`;
      } else if (grade.wrongAttempts === 0) {
        this.s.cleanCloses++;
        toastMsg = `Closed clean, +${gain} XP`;
      } else {
        toastMsg = `+${gain} XP`;
      }
      this.s.xp += gain;
      markDone(this.s, t.id);
    }

    (t.setFlags ?? []).forEach((f) => setFlag(this.s, f));
    // You only pick up the field note when you work the case properly.
    if (!grade.botched) {
      t.questions.forEach((q) => {
        if ("teaches" in q && q.teaches) unlockCodex(this.s, q.teaches);
      });
      if (t.attack?.length) unlockCodex(this.s, "attack");
    }
    this.persist();

    const rankedUp = rankIndex(this.s) > beforeRank;
    const lines = grade.botched
      ? [
          { who: "narration", text: "The case closes, but not the way anyone wanted. The notes will say it took too long, and that you reached for answers instead of reading the evidence." },
          { who: speakerFor(t), text: "We got there. Barely. On a critical case, barely is how towns end up on the news. Learn from this one." },
        ]
      : t.closingRight.map((text) => ({ who: speakerFor(t), text }));

    this.playDialogue(lines, undefined, () => {
      if (toastMsg) this.showToast(toastMsg);
      if (rankedUp) {
        audio.rankUp();
        this.showToast(`Promoted to ${rankTitle(this.s)}`);
      }
      this.screenChapter();
    });
  }

  // ----------------------------------------------------------------- questions
  private buildQuestion(q: Question, panel: HTMLElement, ctx: QuestionContext): QuestionControl {
    const wrap = el("div", { class: "q-block" });
    wrap.append(el("p", { class: "q-prompt", text: q.prompt }));
    if (q.type !== "decision" && q.hint && !ctx.review && !this.s.hard) wrap.append(this.hintBox(q.hint, hintFlag(q)));
    panel.append(wrap);

    if (q.type === "spot") return this.spotQuestion(q, wrap, ctx);
    if (q.type === "typed") return this.typedQuestion(q, wrap);
    if (q.type === "rules") return this.rulesQuestion(q, wrap, ctx);
    if (q.type === "console") return this.consoleQuestion(q, wrap, ctx);
    if (q.type === "merge") return this.mergeQuestion(q, wrap, ctx);
    if (q.type === "request") return this.requestQuestion(q, wrap, ctx);
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
  private hintBox(hint: string, flag: string): HTMLElement {
    const box = el("div", { class: "hint" });
    const show = (): void => mount(box, el("p", { class: "hint-text", text: hint }));
    if (hasFlag(this.s, flag)) {
      show();
      return box;
    }
    const b = el("button", { class: "hint-btn", type: "button", text: `Hint (costs ${HINT_COST} XP)` });
    b.addEventListener("click", () => {
      audio.click();
      setFlag(this.s, flag);
      this.s.hintsUsed++;
      this.persist();
      show();
    });
    box.append(b);
    return box;
  }

  private requestQuestion(q: Extract<Question, { type: "request" }>, wrap: HTMLElement, ctx: QuestionContext): QuestionControl {
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

  private mergeQuestion(q: Extract<Question, { type: "merge" }>, wrap: HTMLElement, ctx: QuestionContext): QuestionControl {
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

  private consoleQuestion(q: Extract<Question, { type: "console" }>, wrap: HTMLElement, ctx: QuestionContext): QuestionControl {
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

  private rulesQuestion(q: Extract<Question, { type: "rules" }>, wrap: HTMLElement, ctx: QuestionContext): QuestionControl {
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

  private typedQuestion(q: Extract<Question, { type: "typed" }>, wrap: HTMLElement): QuestionControl {
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

  private spotQuestion(q: Extract<Question, { type: "spot" }>, wrap: HTMLElement, ctx: QuestionContext): QuestionControl {
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

  // ----------------------------------------------------------------- scenes
  private playScene(sc: Scene, onDone: () => void): void {
    (sc.setFlags ?? []).forEach((f) => setFlag(this.s, f));
    // Skip-seen: on a replay, step past a scene you have already read, as long
    // as it has no choice to make. Flags above still apply either way.
    const seen = hasSeenScene(this.meta, sc.id);
    markSceneSeen(this.meta, sc.id);
    saveMeta(this.meta);
    if (seen && !sc.choice && this.meta.settings.skipSeen) {
      onDone();
      return;
    }
    this.playDialogue(sc.lines, sc.choice, onDone);
  }

  private playDialogue(
    allLines: SceneLine[],
    choice: Scene["choice"] | undefined,
    onDone: () => void,
  ): void {
    const lines = visibleLines(this.s, allLines);
    let i = 0;
    const box = el("div", { class: "vn", tabindex: 0, role: "button", "aria-label": "Continue the conversation" });
    this.stage.className = "stage vn-stage";
    mount(this.stage, box);
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
            this.portrait(info.portrait, 96),
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
      const available = c.options.filter((o) => hasAll(this.s, o.requires) && hasNone(this.s, o.hideIf));
      available.forEach((opt) => {
        const b = el("button", { class: "btn choice", type: "button", text: opt.text });
        b.addEventListener("click", () => {
          audio.click();
          this.applyChoice(opt);
          if (opt.reply && opt.reply.length) {
            this.playDialogue(opt.reply, undefined, onDone);
          } else {
            onDone();
          }
        });
        panel.append(b);
      });
      mount(box, panel);
      panel.querySelector("button")?.focus();
    };

    if (!lines.length) finishLines();
    else if (this.meta.settings.fastDialogue && lines.length > 1) showAll();
    else showLine();
  }

  private applyChoice(opt: SceneChoice): void {
    (opt.setFlags ?? []).forEach((f) => setFlag(this.s, f));
    (opt.clearFlags ?? []).forEach((f) => {
      const idx = this.s.flags.indexOf(f);
      if (idx >= 0) this.s.flags.splice(idx, 1);
    });
    this.s.integrity += opt.integrity ?? 0;
    this.persist();
  }

  // ----------------------------------------------------------------- ending
  private screenEnding(): void {
    const ending = resolveEnding(this.s);
    recordEnding(this.meta, ending.id);
    this.persist();
    const found = SECRETS.filter((x) => hasFlag(this.s, x.flag));
    const lines = [
      { who: "narration", text: `Epilogue. ${ending.epigraph}` },
      ...ending.lines.map((text) => ({ who: "narration", text })),
      ...found.map((x) => ({ who: "narration", text: x.ending })),
    ];
    this.playDialogue(lines, undefined, () => {
      const con = conduct(this.s);
      const acc = Math.round(accuracy(this.s) * 100);
      const card = el("div", { class: "ending-card" }, [
        el("div", { class: "ending-kicker", text: "Ending" }),
        el("h1", { class: "ending-title", text: ending.title }),
        el("p", { class: "ending-rank", text: ending.rankTitle }),
        el("p", { class: "ending-epi", text: ending.epigraph }),
        el("div", { class: "ending-stats" }, [
          stat("Conduct", con.tier),
          stat("Case accuracy", `${acc}%`),
          stat("Botched", String(this.s.botched)),
          stat("Screenings failed", String(this.s.screeningFails)),
          stat("Secrets found", `${found.length} of ${SECRETS.length}`),
          ...(this.s.hard ? [stat("Mode", "Hard")] : []),
        ]),
      ]);
      const again = el("button", { class: "btn primary", type: "button", text: "Play again" });
      again.addEventListener("click", () => {
        audio.click();
        const keepName = this.s.playerName;
        const keepHard = this.s.hard;
        this.s = freshSave();
        this.s.playerName = keepName;
        this.s.hard = keepHard;
        this.persist();
        this.render();
      });
      const share = el("button", { class: "btn ghost small", type: "button", text: "Share card" });
      share.addEventListener("click", () => {
        audio.click();
        void this.openShareCard(ending);
      });
      const record = el("button", { class: "btn ghost small", type: "button", text: "Endings and achievements" });
      record.addEventListener("click", () => {
        audio.click();
        this.openRecord();
      });
      const seen = this.meta.endings.length;
      const total = ENDING_ORDER.length;
      const endings = el("div", { class: "ending-roster" }, [
        el("p", {
          class: "muted",
          text: seen >= total ? "You have seen every ending." : `You have seen ${seen} of ${total} endings. Replay a chapter from the title screen to find the others.`,
        }),
      ]);
      const feedback = el("p", { class: "ending-feedback muted" }, [
        el("span", { text: "Got stuck, or found a bug? " }),
        el("a", { href: "https://github.com/CyberAhmedX/dwell-time/issues", target: "_blank", rel: "noopener", text: "Tell me what happened." }),
      ]);
      card.append(again, share, record, endings, feedback);
      this.stage.className = "stage center";
      mount(this.stage, card);
    });
  }

  // ----------------------------------------------------------------- share card
  private async openShareCard(ending: ReturnType<typeof resolveEnding>): Promise<void> {
    const canvas = await drawShareCard({
      ending,
      playerName: this.s.playerName,
      team: this.s.track ? DEPT_LABEL[this.s.track] : "",
      conduct: conduct(this.s).tier,
      accuracy: Math.round(accuracy(this.s) * 100),
      hard: this.s.hard,
      extra: this.shareExtra(),
    });
    const img = el("img", { class: "share-img", alt: `Share card: ${ending.title}, ${ending.rankTitle}` }) as HTMLImageElement;
    img.src = canvas.toDataURL("image/png");
    const status = el("p", { class: "transfer-status", role: "status" });
    const download = el("button", { class: "btn primary", type: "button", text: "Download image" });
    download.addEventListener("click", () => {
      audio.click();
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = el("a", { href: url, download: shareFileName(ending, this.s.playerName) });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = "Saved to your downloads.";
      }, "image/png");
    });
    this.overlay("Share your ending", [img, el("div", { class: "btn-row" }, [download]), status]);
  }

  /** A line for the share card beyond the basics. */
  private shareExtra(): string {
    return this.s.cleanCloses === this.s.totalCloses && this.s.totalCloses > 0 ? "Every case closed clean" : `${this.s.cleanCloses} of ${this.s.totalCloses} cases closed clean`;
  }

  // ----------------------------------------------------------------- practice
  private openPractice(): void {
    const list = el("div", { class: "codex-list" });
    const { close } = this.overlay("Practice a case", [
      el("p", { class: "muted", text: "Work any case you have closed before, as many times as you like. Hints are free here, and nothing you do touches your run, your record or your achievements." }),
      list,
    ]);
    for (const plan of CHAPTERS) {
      const cases = [...plan.main, ...plan.side].filter((id) => this.meta.casesEver.includes(id)).map(ticketById).filter((t): t is Ticket => !!t);
      if (!cases.length) continue;
      list.append(el("p", { class: "practice-chapter", text: `${plan.title}: ${plan.subtitle}` }));
      for (const t of cases) {
        const b = el("button", { class: "btn choice", type: "button" }, [
          el("span", { class: "cs-title", text: t.title }),
          el("span", { class: "cs-note", text: `${t.client} · ${t.team ?? DEPT_LABEL[t.dept]}${t.side ? " · side case" : ""}` }),
        ]);
        b.addEventListener("click", () => {
          audio.click();
          close();
          this.startPractice(t);
        });
        list.append(b);
      }
    }
  }

  private startPractice(t: Ticket): void {
    if (!this.started) this.startSession();
    const real = this.practice?.real ?? this.s;
    // A scratch run that can see the case: hired onto its team, in its chapter,
    // with every flag the real run has, and without hard mode or bought hints.
    const scratch = freshSave();
    scratch.playerName = real.playerName || "Analyst";
    scratch.hired = true;
    scratch.track = t.dept;
    scratch.chapter = t.chapter;
    scratch.flags = real.flags.filter((f) => !f.startsWith("hint:"));
    scratch.seed = real.seed; // practise the case with this run's data, not a new draw
    this.practice = { real };
    this.s = scratch;
    this.scene.setChapter(t.chapter);
    audio.setChapter(t.chapter);
    this.renderTopbar();
    this.openTicket(t, false);
  }

  // Practice starts and ends on the title screen, whatever state the run is in.
  private leavePractice(): void {
    if (!this.practice) return;
    this.s = this.practice.real;
    this.practice = null;
    audio.setChapter(this.s.chapter);
    this.renderTopbar();
    this.scene.setChapter(this.s.chapter);
    this.screenTitle();
    this.openPractice();
  }

  // ----------------------------------------------------------------- overlays
  private openCodex(): void {
    const overlay = el("div", { class: "overlay" });
    const close = (): void => overlay.remove();
    const entries = CODEX.filter((c) => this.s.codex.includes(c.id));
    const list = el("div", { class: "codex-list" });
    if (entries.length === 0) {
      list.append(el("p", { class: "muted", text: "Empty for now. Field notes unlock as you learn each idea on a real case." }));
    }
    for (const e of entries) {
      list.append(
        el("details", { class: "codex-entry" }, [
          el("summary", {}, [
            el("span", { class: "codex-term", text: e.term }),
            el("span", { class: "codex-dept", text: e.dept === "general" ? "general" : DEPT_LABEL[e.dept as Dept] }),
          ]),
          el("div", { class: "codex-body" }, e.body.map((p) => el("p", { text: p }))),
        ]),
      );
    }
    const panel = el("div", { class: "overlay-panel" }, [
      el("div", { class: "overlay-head" }, [
        el("h2", { text: "Field Notes" }),
        el("span", { class: "muted", text: `${entries.length} of ${CODEX.length} learned` }),
      ]),
      list,
    ]);
    overlay.append(panel);
    panel.append(this.closeBtn(close));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    this.root.append(overlay);
  }

  private openSettings(): void {
    const overlay = el("div", { class: "overlay" });
    const close = (): void => overlay.remove();
    const set = this.meta.settings;
    const changed = (): void => {
      this.applySettings();
      saveMeta(this.meta);
    };

    const slider = (id: string, label: string, value: number, on: (v: number) => void): HTMLElement => {
      const input = el("input", { class: "slider", type: "range", min: 0, max: 100, step: 1, value: Math.round(value * 100), id }) as HTMLInputElement;
      input.addEventListener("input", () => on(Number(input.value) / 100));
      return el("div", { class: "set-row" }, [el("label", { for: id, text: label }), input]);
    };

    // a row of buttons where exactly one is pressed
    const choices = <T,>(label: string, options: { text: string; value: T }[], current: T, on: (v: T) => void): HTMLElement => {
      const group = el("div", { class: "seg", role: "group", "aria-label": label });
      for (const o of options) {
        const b = el("button", { class: "seg-btn", type: "button", text: o.text, "aria-pressed": String(o.value === current) });
        b.addEventListener("click", () => {
          audio.click();
          group.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          on(o.value);
        });
        group.append(b);
      }
      return el("div", { class: "set-row" }, [el("span", { class: "set-label", text: label }), group]);
    };

    const muteBtn = el("button", { class: "btn ghost", type: "button", text: set.muted ? "Unmute" : "Mute" });
    muteBtn.addEventListener("click", () => {
      set.muted = !set.muted;
      muteBtn.textContent = set.muted ? "Unmute" : "Mute";
      changed();
      this.renderTopbar();
    });

    const reset = el("button", { class: "btn danger", type: "button", text: "Erase save and restart" });
    let confirming = false;
    reset.addEventListener("click", () => {
      if (!confirming) {
        confirming = true;
        reset.textContent = "Tap again to confirm. Endings, achievements and settings are kept";
        return;
      }
      wipe();
      this.s = freshSave();
      close();
      this.render();
    });

    const resetAll = el("button", { class: "btn danger ghost-danger", type: "button", text: "Erase everything" });
    let confirmingAll = false;
    resetAll.addEventListener("click", () => {
      if (!confirmingAll) {
        confirmingAll = true;
        resetAll.textContent = "Tap again to erase the save, endings, achievements and settings";
        return;
      }
      wipe();
      wipeMeta();
      this.s = freshSave();
      this.meta = freshMeta();
      this.applySettings();
      close();
      this.render();
    });

    const record = el("button", { class: "btn ghost", type: "button", text: "Endings and achievements" });
    record.addEventListener("click", () => {
      audio.click();
      close();
      this.openRecord();
    });

    const exportBtn = el("button", { class: "btn ghost", type: "button", text: "Export save" });
    exportBtn.addEventListener("click", () => {
      audio.click();
      close();
      this.openExport();
    });
    const importBtn = el("button", { class: "btn ghost", type: "button", text: "Import save" });
    importBtn.addEventListener("click", () => {
      audio.click();
      close();
      this.openImport();
    });

    const statsBlock = this.s.hired
      ? el("div", { class: "set-stats" }, [
          el("div", { class: "set-stats-head", text: "Your record" }),
          el("div", { class: "ending-stats" }, [
            stat("Rank", rankTitle(this.s)),
            stat("Conduct", conduct(this.s).tier),
            stat("Accuracy", `${Math.round(accuracy(this.s) * 100)}%`),
            stat("Clean / total", `${this.s.cleanCloses} / ${this.s.totalCloses}`),
            stat("Botched", String(this.s.botched)),
            stat("Screenings failed", String(this.s.screeningFails)),
          ]),
          el("p", { class: "muted", text: conduct(this.s).note }),
        ])
      : el("span");

    const panel = el("div", { class: "overlay-panel" }, [
      el("div", { class: "overlay-head" }, [el("h2", { text: "Settings" })]),
      statsBlock,
      slider("vol-music", "Music and rain", set.music, (v) => {
        set.music = v;
        changed();
      }),
      slider("vol-effects", "Sound effects", set.effects, (v) => {
        set.effects = v;
        changed();
      }),
      el("div", { class: "set-row" }, [muteBtn]),
      choices(
        "Text size",
        TEXT_SCALES.map((v, i) => ({ text: ["Small", "Normal", "Large", "Larger"][i], value: v as number })),
        set.textScale,
        (v) => {
          set.textScale = v;
          changed();
        },
      ),
      choices(
        "Reduced motion",
        [
          { text: "Follow my device", value: null as boolean | null },
          { text: "On", value: true },
          { text: "Off", value: false },
        ],
        set.reducedMotion,
        (v) => {
          set.reducedMotion = v;
          changed();
        },
      ),
      choices(
        "Relaxed timers",
        [
          { text: "Off", value: false },
          { text: "On: live cases get twice as long", value: true },
        ],
        set.relaxedTimers,
        (v) => {
          set.relaxedTimers = v;
          changed();
        },
      ),
      choices(
        "Fast dialogue",
        [
          { text: "Off", value: false },
          { text: "On: show each conversation at once", value: true },
        ],
        set.fastDialogue,
        (v) => {
          set.fastDialogue = v;
          changed();
        },
      ),
      choices(
        "Skip seen scenes",
        [
          { text: "Off", value: false },
          { text: "On: skip story you have already read", value: true },
        ],
        set.skipSeen,
        (v) => {
          set.skipSeen = v;
          changed();
        },
      ),
      el("div", { class: "set-row" }, [record]),
      el("div", { class: "set-row" }, [
        el("span", { class: "set-label", text: "Your save lives in this browser. Export it as a backup, or to carry on somewhere else." }),
        el("div", { class: "btn-row" }, [exportBtn, importBtn]),
      ]),
      el("div", { class: "set-about" }, [
        el("p", { text: "Breakwater is a work of fiction. Every company, person, address and domain is invented. It teaches real cybersecurity ideas through an imagined investigation." }),
        el("p", { class: "muted", text: "All music and sound is generated in your browser. Nothing is sampled or copied." }),
      ]),
      el("div", { class: "set-row danger-row" }, [reset, resetAll]),
    ]);
    overlay.append(panel);
    panel.append(this.closeBtn(close));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    this.root.append(overlay);
  }

  private openRecord(): void {
    const overlay = el("div", { class: "overlay" });
    const close = (): void => overlay.remove();

    const endings = el("div", { class: "gallery" });
    for (const id of ENDING_ORDER) {
      const e = ENDINGS[id];
      const seen = this.meta.endings.includes(id);
      endings.append(
        el("div", { class: seen ? "gal-item seen" : "gal-item" }, [
          el("div", { class: "gal-title", text: seen ? e.title : "Not found yet" }),
          el("p", { class: "gal-text", text: seen ? e.epigraph : e.hint }),
          seen ? el("p", { class: "gal-rank", text: e.rankTitle }) : el("span"),
        ]),
      );
    }

    const achievements = el("div", { class: "gallery" });
    for (const a of ACHIEVEMENTS) {
      const got = this.meta.achievements.includes(a.id);
      achievements.append(
        el("div", { class: got ? "gal-item seen" : "gal-item" }, [
          el("div", { class: "gal-title", text: a.title }),
          el("p", { class: "gal-text", text: a.desc }),
          el("p", { class: "gal-rank", text: got ? "Earned" : "Not yet" }),
        ]),
      );
    }

    const files = el("div", { class: "gallery" });
    for (const x of SECRETS) {
      const got = this.meta.secretsEver.includes(x.flag);
      files.append(
        el("div", { class: got ? "gal-item seen" : "gal-item" }, [
          el("div", { class: "gal-title", text: got ? x.title : "Not found yet" }),
          el("p", { class: "gal-text", text: got ? x.found : `Only the ${DEPT_LABEL[x.dept]} team can find this one, in chapter three.` }),
          el("p", { class: "gal-rank", text: DEPT_LABEL[x.dept] }),
        ]),
      );
    }

    const panel = el("div", { class: "overlay-panel" }, [
      el("div", { class: "overlay-head" }, [
        el("h2", { text: "Endings" }),
        el("span", { class: "muted", text: `${this.meta.endings.length} of ${ENDING_ORDER.length} seen` }),
      ]),
      endings,
      el("div", { class: "overlay-head sub" }, [
        el("h2", { text: "Achievements" }),
        el("span", { class: "muted", text: `${this.meta.achievements.length} of ${ACHIEVEMENTS.length} earned` }),
      ]),
      achievements,
      el("div", { class: "overlay-head sub" }, [
        el("h2", { text: "Case Files" }),
        el("span", { class: "muted", text: `${this.meta.secretsEver.length} of ${SECRETS.length} secrets` }),
      ]),
      files,
    ]);
    overlay.append(panel);
    panel.append(this.closeBtn(close));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    this.root.append(overlay);
  }

  private overlay(title: string, body: HTMLElement[]): { overlay: HTMLElement; close: () => void } {
    const overlay = el("div", { class: "overlay" });
    const close = (): void => overlay.remove();
    const panel = el("div", { class: "overlay-panel" }, [el("div", { class: "overlay-head" }, [el("h2", { text: title })]), ...body]);
    overlay.append(panel);
    panel.append(this.closeBtn(close));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    this.root.append(overlay);
    return { overlay, close };
  }

  private openExport(): void {
    const bundle = makeBundle(this.s, this.meta);
    const status = el("p", { class: "transfer-status", role: "status" });

    const download = el("button", { class: "btn primary", type: "button", text: "Download save file" });
    download.addEventListener("click", () => {
      audio.click();
      const url = URL.createObjectURL(new Blob([bundleToFile(bundle)], { type: "application/json" }));
      const a = el("a", { href: url, download: fileName(this.s) });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Saved to your downloads. Load it later with Import save.";
    });

    const code = el("textarea", { class: "save-code", readonly: true, rows: 4, "aria-label": "Your save code", spellcheck: "false" }) as HTMLTextAreaElement;
    code.value = "Making your code...";
    void bundleToCode(bundle).then((c) => (code.value = c));
    const copy = el("button", { class: "btn ghost", type: "button", text: "Copy save code" });
    copy.addEventListener("click", async () => {
      audio.click();
      code.select();
      let copied = false;
      try {
        await navigator.clipboard.writeText(code.value);
        copied = true;
      } catch {
        copied = document.execCommand("copy");
      }
      status.textContent = copied ? "Copied. Paste it somewhere safe, or into Import save on another device." : "Select the code above and copy it by hand.";
    });

    this.overlay("Export save", [
      el("p", { class: "muted", text: "This holds your current run, your endings and achievements, chapter select and your settings." }),
      el("div", { class: "set-row" }, [el("span", { class: "set-label", text: "As a file, for backups and other computers" }), download]),
      el("div", { class: "set-row" }, [el("span", { class: "set-label", text: "As a code, easiest on phones" }), code, copy]),
      status,
    ]);
  }

  private openImport(): void {
    const error = el("p", { class: "transfer-error", role: "alert" });
    const step = el("div");

    const file = el("input", { type: "file", accept: ".json,application/json,text/plain", class: "visually-hidden", id: "save-file" }) as HTMLInputElement;
    const pickFile = el("button", { class: "btn ghost", type: "button", text: "Choose a save file" });
    pickFile.addEventListener("click", () => {
      audio.click();
      file.click();
    });
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      file.value = "";
      if (!f) return;
      if (f.size > 1_000_000) {
        error.textContent = "That file is far too big to be a Breakwater save.";
        return;
      }
      void check(await f.text());
    });

    const code = el("textarea", { class: "save-code", rows: 4, placeholder: "Paste a save code here", "aria-label": "Save code", spellcheck: "false" }) as HTMLTextAreaElement;
    const loadCode = el("button", { class: "btn ghost", type: "button", text: "Load code" });
    loadCode.addEventListener("click", () => {
      audio.click();
      void check(code.value);
    });

    const pick = el("div", {}, [
      el("div", { class: "set-row" }, [el("span", { class: "set-label", text: "From a save file" }), pickFile, file]),
      el("div", { class: "set-row" }, [el("span", { class: "set-label", text: "From a save code" }), code, loadCode]),
    ]);
    mount(step, pick);

    // Show what is in the save and ask before it replaces anything.
    const check = async (text: string): Promise<void> => {
      const r = await readSave(text);
      if (!r.ok) {
        error.textContent = r.error;
        audio.wrong();
        return;
      }
      error.textContent = "";
      const where = !r.save.hired
        ? "Still applying"
        : r.save.chapter >= 6
          ? "Finished the story"
          : (() => {
              const plan = chapterPlan(r.save.chapter);
              return plan ? `${plan.title}: ${plan.subtitle}` : "";
            })();
      const when = r.exported ? new Date(r.exported).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "";
      const replacing = this.s.playerName !== "" || this.meta.endings.length > 0;
      const confirm = el("button", { class: "btn primary", type: "button", text: "Load this save" });
      confirm.addEventListener("click", () => {
        audio.click();
        this.s = r.save;
        this.meta = r.meta;
        this.persist();
        this.applySettings();
        done.close();
        this.render();
        this.showToast("Save loaded");
      });
      const back = el("button", { class: "btn ghost", type: "button", text: "Choose a different save" });
      back.addEventListener("click", () => {
        audio.click();
        mount(step, pick);
      });
      mount(
        step,
        el("div", { class: "ending-stats" }, [
          stat("Name", r.save.playerName || "Not signed yet"),
          stat("Rank", rankTitle(r.save)),
          stat("Where", where),
          stat("Endings", `${r.meta.endings.length} of ${ENDING_ORDER.length}`),
        ]),
        when ? el("p", { class: "muted", text: `Exported on ${when}.` }) : el("span"),
        replacing
          ? el("p", { class: "warn", text: "Loading replaces the run, endings, achievements and settings in this browser. Export yours first if you want to keep them." })
          : el("span"),
        el("div", { class: "btn-row" }, [confirm, back]),
      );
      confirm.focus();
    };

    const done = this.overlay("Import save", [step, error]);
  }

  private openChapterSelect(): void {
    const overlay = el("div", { class: "overlay" });
    const close = (): void => overlay.remove();
    const list = el("div", { class: "codex-list" });
    for (const plan of CHAPTERS) {
      const cp = this.meta.checkpoints[plan.chapter];
      if (!cp) continue;
      const b = el("button", { class: "btn choice", type: "button" }, [
        el("span", { class: "cs-title", text: `${plan.title}: ${plan.subtitle}` }),
        el("span", { class: "cs-note", text: `${cp.playerName}, ${rankTitle(cp)}, ${conduct(cp).tier} conduct` }),
      ]);
      let confirming = false;
      b.addEventListener("click", () => {
        audio.click();
        const inProgress = this.s.playerName !== "" && this.s.chapter < 6;
        if (inProgress && !confirming) {
          confirming = true;
          b.querySelector(".cs-note")!.textContent = "This replaces the run you have in progress. Tap again to confirm";
          return;
        }
        const copy = checkpointCopy(this.meta, plan.chapter);
        if (!copy) return;
        this.s = copy;
        this.persist();
        close();
        this.startSession();
        this.render();
      });
      list.append(b);
    }
    const panel = el("div", { class: "overlay-panel" }, [
      el("div", { class: "overlay-head" }, [el("h2", { text: "Replay a chapter" })]),
      el("p", { class: "muted", text: "Each chapter starts with the choices you had made by then in your most recent run." }),
      list,
    ]);
    overlay.append(panel);
    panel.append(this.closeBtn(close));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    this.root.append(overlay);
  }

  private closeBtn(on: () => void): HTMLElement {
    const b = el("button", { class: "overlay-close", type: "button", text: "Close", "aria-label": "Close" });
    b.addEventListener("click", () => {
      audio.click();
      on();
    });
    return b;
  }

  private showToast(text: string, ms = 2600): void {
    const t = el("div", { class: "toast", text });
    this.toasts.append(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 400);
    }, ms);
  }
}

// ----- helpers -----

function stat(label: string, value: string): HTMLElement {
  return el("div", { class: "stat" }, [
    el("span", { class: "stat-k", text: label }),
    el("span", { class: "stat-v", text: value }),
  ]);
}

interface QuestionContext {
  ticket: Ticket;
  evPanel: HTMLElement;
  review: boolean;
  disarm: (() => void) | null; // stops whichever spot question is picking
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

/** Seconds wrong on a live case cost. */
const LIVE_PENALTY = 15;

function hintFlag(q: Question): string {
  return `hint:${q.id}`;
}

function attackTags(t: Ticket): HTMLElement {
  return el("div", { class: "attack" }, [
    el("span", { class: "attack-k", text: "MITRE ATT&CK" }),
    ...(t.attack ?? []).map((a) => el("span", { class: "attack-tag", text: `${a.id} ${a.name}` })),
  ]);
}

const TRACK_PITCH: Record<Dept, string> = {
  soc: "Watch the alerts. Tell the nothing from the something, fast.",
  network: "Read the traffic. The network always knows, if you listen.",
  helpdesk: "The front door. Keep people safe and calm at the same time.",
  forensics: "Reconstruct what happened, in a way that holds up to scrutiny.",
  pentest: "Break in on purpose, strictly inside the lines.",
  intel: "Connect the dots without inventing them.",
};

function speakerFor(t: Ticket): string {
  return t.speaker ?? briefSpeaker(t.dept);
}

function briefSpeaker(dept: Dept): string {
  const map: Record<Dept, string> = {
    soc: "mags",
    network: "priya",
    helpdesk: "theo",
    forensics: "imani",
    pentest: "rook",
    intel: "juno",
  };
  return map[dept];
}

function isVisible(s: SaveData): (x: { requires?: string[]; hideIf?: string[] } | undefined) => boolean {
  return (x) => !!x && hasAll(s, x.requires) && hasNone(s, x.hideIf);
}

function mkArrow(dir: "up" | "down", enabled: boolean, on: () => void): HTMLElement {
  const b = el("button", { class: "ord-arrow", type: "button", text: dir === "up" ? "▲" : "▼", disabled: !enabled });
  if (enabled) b.addEventListener("click", on);
  return b;
}

// referenced to keep tree-shaking honest in tests
export { SCREENINGS, TICKETS, SCENES, CHAPTERS };
